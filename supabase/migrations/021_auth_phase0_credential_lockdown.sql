-- 021_auth_phase0_credential_lockdown.sql
-- ─────────────────────────────────────────────────────────────────────────
-- AUTH MIGRATION · PHASE 0 — Credential lockdown
-- ─────────────────────────────────────────────────────────────────────────
-- Today member / corporate / agent passwords live in plaintext inside the
-- `data` JSONB of public.members / public.agreements / public.agencies, and
-- the universal `*_staff_all` RLS policy (migration 002) lets ANY
-- authenticated client SELECT them. The browser hydrates these tables on
-- sign-in, so plaintext credentials are visible in DevTools / network.
--
-- This migration stops the leak WITHOUT deleting any credential (later auth
-- phases still need the accounts; OTP-first means we never read the plaintext
-- again, but we don't destroy data in a lockdown step):
--
--   1. Sanitised read RPCs — members_safe()/agreements_safe()/agencies_safe()
--      return the same {id, data, created_at, updated_at} shape but with
--      `password` (members) and `users[].password` (agreements/agencies)
--      stripped from `data`. The client hydrates through these instead of a
--      raw table SELECT, so passwords never reach the browser.
--
--   2. Password-preserving merge triggers — CRITICAL. The admin portal reads
--      an object and writes the whole thing back. Once reads are sanitised,
--      a naive save would persist a password-less object and WIPE the stored
--      credential. These BEFORE INSERT OR UPDATE triggers carry the existing
--      password forward whenever an incoming write omits it. So: client never
--      sees passwords AND edits never erase them.
--
--   3. Anon credential-write block — `members_anyone_insert` (003) is
--      `with check (true)`, so the public join form could write a password
--      into the JSONB. A BEFORE INSERT trigger now strips any `password` key
--      from anon-origin member inserts. (Anon stays insert-only.)
--
-- Idempotent and non-destructive. RLS itself is unchanged here (scoped RLS is
-- a later phase); this is purely about not exposing or losing credentials.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Sanitised read RPCs ───────────────────────────────────────────────
-- SECURITY DEFINER so they can read the underlying tables, but each is
-- granted only to `authenticated` (staff) — anon cannot call them. They
-- return the table's public shape minus credentials.

create or replace function public.members_safe()
returns table (id text, data jsonb, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select m.id,
         (m.data - 'password') as data,
         m.created_at, m.updated_at
  from public.members m
$$;

-- Helper: strip `password` from every element of a data->'users' array.
create or replace function public.strip_user_passwords(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_data ? 'users' and jsonb_typeof(p_data->'users') = 'array' then
      jsonb_set(
        p_data,
        '{users}',
        coalesce((
          select jsonb_agg(elem - 'password')
          from jsonb_array_elements(p_data->'users') as elem
        ), '[]'::jsonb)
      )
    else p_data
  end
$$;

create or replace function public.agreements_safe()
returns table (id text, data jsonb, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select a.id,
         public.strip_user_passwords(a.data) as data,
         a.created_at, a.updated_at
  from public.agreements a
$$;

create or replace function public.agencies_safe()
returns table (id text, data jsonb, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select a.id,
         public.strip_user_passwords(a.data) as data,
         a.created_at, a.updated_at
  from public.agencies a
$$;

revoke all on function public.members_safe()    from public, anon;
revoke all on function public.agreements_safe() from public, anon;
revoke all on function public.agencies_safe()   from public, anon;
grant execute on function public.members_safe()    to authenticated;
grant execute on function public.agreements_safe() to authenticated;
grant execute on function public.agencies_safe()   to authenticated;

-- ── 2. Password-preserving merge triggers ────────────────────────────────
-- When an UPDATE/INSERT arrives without the password (because the client now
-- reads sanitised data), carry the existing stored password forward instead
-- of overwriting it with nothing.

-- Members: single password field on data.
create or replace function public.preserve_member_password()
returns trigger
language plpgsql
as $$
declare
  v_existing text;
begin
  if (new.data ? 'password') then
    return new;  -- caller explicitly supplied a password — respect it
  end if;
  if (tg_op = 'UPDATE') then
    v_existing := old.data->>'password';
  else
    select m.data->>'password' into v_existing from public.members m where m.id = new.id;
  end if;
  if v_existing is not null then
    new.data := jsonb_set(new.data, '{password}', to_jsonb(v_existing), true);
  end if;
  return new;
end;
$$;

drop trigger if exists members_preserve_password on public.members;
create trigger members_preserve_password
before insert or update of data on public.members
for each row execute function public.preserve_member_password();

-- Agreements / agencies: per-user passwords inside data->'users'. Merge each
-- incoming user's password from the existing row, keyed by user id (fallback
-- to email). Generic so one function serves both tables.
create or replace function public.preserve_subuser_passwords()
returns trigger
language plpgsql
as $$
declare
  v_old_data jsonb;
  v_old_users jsonb;
  v_new_users jsonb;
  v_elem jsonb;
  v_key text;
  v_existing_pw text;
  v_merged jsonb := '[]'::jsonb;
begin
  -- Nothing to do if the incoming row has no users array.
  if not (new.data ? 'users') or jsonb_typeof(new.data->'users') <> 'array' then
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    v_old_data := old.data;
  else
    execute format('select data from public.%I where id = $1', tg_table_name)
      into v_old_data using new.id;
  end if;
  v_old_users := coalesce(v_old_data->'users', '[]'::jsonb);

  for v_elem in select * from jsonb_array_elements(new.data->'users') loop
    if not (v_elem ? 'password') or coalesce(v_elem->>'password','') = '' then
      v_key := coalesce(v_elem->>'id', v_elem->>'email');
      v_existing_pw := null;
      if v_key is not null then
        select u->>'password' into v_existing_pw
        from jsonb_array_elements(v_old_users) as u
        where coalesce(u->>'id', u->>'email') = v_key
        limit 1;
      end if;
      if v_existing_pw is not null and v_existing_pw <> '' then
        v_elem := jsonb_set(v_elem, '{password}', to_jsonb(v_existing_pw), true);
      end if;
    end if;
    v_merged := v_merged || jsonb_build_array(v_elem);
  end loop;

  new.data := jsonb_set(new.data, '{users}', v_merged, true);
  return new;
end;
$$;

drop trigger if exists agreements_preserve_subuser_passwords on public.agreements;
create trigger agreements_preserve_subuser_passwords
before insert or update of data on public.agreements
for each row execute function public.preserve_subuser_passwords();

drop trigger if exists agencies_preserve_subuser_passwords on public.agencies;
create trigger agencies_preserve_subuser_passwords
before insert or update of data on public.agencies
for each row execute function public.preserve_subuser_passwords();

-- ── 3. Anon credential-write block ───────────────────────────────────────
-- The public join form inserts a member row as anon. Strip any password key
-- so a credential can never be written from an unauthenticated origin.
-- (auth.role() is 'anon' for the public client, 'authenticated' for staff.)
create or replace function public.block_anon_member_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'anon' and (new.data ? 'password') then
    new.data := new.data - 'password';
  end if;
  return new;
end;
$$;

drop trigger if exists members_block_anon_password on public.members;
create trigger members_block_anon_password
before insert on public.members
for each row execute function public.block_anon_member_password();

-- ─────────────────────────────────────────────────────────────────────────
-- Verify:
--   select count(*) from public.members_safe() where (data ? 'password');     -- expect 0
--   select count(*) from public.agreements_safe()
--     where jsonb_path_exists(data, '$.users[*].password');                    -- expect 0
--   -- preservation: SELECT a member via members_safe(), upsert it back, then
--   -- confirm the raw table still has its password (trigger carried it).
-- ─────────────────────────────────────────────────────────────────────────
