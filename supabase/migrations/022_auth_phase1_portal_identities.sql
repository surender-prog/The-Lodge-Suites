-- 022_auth_phase1_portal_identities.sql
-- ─────────────────────────────────────────────────────────────────────────
-- AUTH MIGRATION · PHASE 1 — portal_identities + JWT claim source of truth
-- ─────────────────────────────────────────────────────────────────────────
-- Mirrors members / agreements.users[] / agencies.users[] into auth.users +
-- auth.identities (clone of 016/018 + 004 conventions), and records a TYPED
-- portal_identities row per auth user that the Custom Access Token hook reads
-- to inject kind/account_id/member_id/role into the JWT.
--
-- Ships INERT: nothing reads portal_identities or the claims until the client
-- flag VITE_REAL_GUEST_AUTH flips AND the owner enables the access-token hook
-- in the dashboard. Fully idempotent and non-destructive: re-running re-hashes
-- passwords and re-upserts identities; it never deletes an auth.users row.
--
-- DEPENDS ON: 016/018 (auth.users insert pattern), 021 (BEFORE password
-- preserve/strip triggers — these fire before the AFTER triggers below).
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- ── (a) portal_identities — TYPED columns (JWT-claim source of truth) ─────
create table if not exists public.portal_identities (
  auth_user_id uuid primary key
    references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('member','corporate','agent')),
  member_id   text,              -- members.id  (kind='member')
  account_id  text,              -- agreements.id / agencies.id (corp/agent)
  role        text,              -- sub-user role (corp/agent); null for member
  status      text not null default 'active'
                check (status in ('active','suspended')),
  created_at  timestamptz not null default now()
);
create index if not exists portal_identities_member_idx  on public.portal_identities(member_id);
create index if not exists portal_identities_account_idx on public.portal_identities(account_id);

alter table public.portal_identities enable row level security;

-- Phase 1: a row is visible to its own auth user; any authenticated user can
-- read all (mirrors the permissive 002 posture — tighten before public launch).
drop policy if exists "portal_identities_self_read" on public.portal_identities;
create policy "portal_identities_self_read"
  on public.portal_identities for select
  using (auth.uid() = auth_user_id or auth.role() = 'authenticated');
-- Writes happen only via SECURITY DEFINER sync fns, never from the client.

-- ── (b) sync_member_data_to_auth — clone 016/018 + meta + identity upsert ──
-- Returns auth_user_id (or null for OTP-first password-less members).
create or replace function public.sync_member_data_to_auth(p_data jsonb)
returns uuid
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_email     text := lower(coalesce(p_data->>'email',''));
  v_password  text := coalesce(p_data->>'password','');
  v_member_id text := coalesce(p_data->>'id','');
  v_tier      text := coalesce(p_data->>'tier','');
  v_name      text := coalesce(p_data->>'name','');
  v_meta      jsonb;
  v_existing  uuid;
  v_new_id    uuid;
begin
  if v_email = '' then return null; end if;
  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(v_name,''), 'email_verified', true,
    'kind','member','memberId', nullif(v_member_id,''),
    'tier', nullif(v_tier,'')));

  select id into v_existing from auth.users where lower(email)=v_email limit 1;

  if v_existing is not null then
    if v_password <> '' then
      update auth.users
         set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
             updated_at = now()
       where id = v_existing;
    end if;
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data  = coalesce(raw_app_meta_data,'{}'::jsonb)
                                  || '{"provider":"email","providers":["email"]}'::jsonb,
           raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || v_meta,
           updated_at = now()
     where id = v_existing;
    v_new_id := v_existing;
  elsif v_password <> '' then
    v_new_id := extensions.uuid_generate_v4();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated',
      'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, v_meta,
      now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (
      id, user_id, provider, provider_id, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      extensions.uuid_generate_v4(), v_new_id, 'email', v_new_id::text,
      jsonb_build_object('sub',v_new_id::text,'email',v_email,
        'email_verified',true,'phone_verified',false),
      null, now(), now());
  else
    -- OTP-first member, no password: no auth.users row yet (created by Supabase
    -- on first verifyOtp in Phase 2). Mirror no-op — correct, not a bug.
    return null;
  end if;

  insert into public.portal_identities (auth_user_id, kind, member_id, account_id, role, status)
  values (v_new_id, 'member', nullif(v_member_id,''), null, null, 'active')
  on conflict (auth_user_id) do update
    set kind='member', member_id=excluded.member_id,
        account_id=null, role=null;
  return v_new_id;
end;
$$;

-- ── (c) Triggers on members + one-time backfill ───────────────────────────
create or replace function public.sync_member_to_auth_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.sync_member_data_to_auth(new.data); return new; end; $$;

drop trigger if exists members_sync_to_auth on public.members;
create trigger members_sync_to_auth
  after insert or update of data on public.members
  for each row execute function public.sync_member_to_auth_trigger();

create or replace function public.cleanup_member_identity_trigger()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_email text := lower(coalesce(old.data->>'email',''));
begin
  if v_email <> '' then
    delete from public.portal_identities pi using auth.users u
     where pi.auth_user_id = u.id and lower(u.email) = v_email and pi.kind='member';
  end if;
  return old;
end; $$;

drop trigger if exists members_cleanup_identity on public.members;
create trigger members_cleanup_identity
  after delete on public.members
  for each row execute function public.cleanup_member_identity_trigger();

do $backfill$
declare r record;
begin
  for r in select data from public.members loop
    perform public.sync_member_data_to_auth(r.data);
  end loop;
end $backfill$;

-- ── (d) sync_partner_user_to_auth — agreements/agencies sub-users ─────────
create or replace function public.sync_partner_user_to_auth(p_data jsonb, p_kind text)
returns void language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_account_id text := coalesce(p_data->>'id','');
  v_elem jsonb; v_email text; v_pw text; v_role text; v_name text;
  v_meta jsonb; v_existing uuid; v_new_id uuid;
begin
  if p_kind not in ('corporate','agent') then return; end if;
  if not (p_data ? 'users') or jsonb_typeof(p_data->'users') <> 'array' then return; end if;

  for v_elem in select * from jsonb_array_elements(p_data->'users') loop
    v_email := lower(coalesce(v_elem->>'email',''));
    v_pw    := coalesce(v_elem->>'password','');
    v_role  := coalesce(v_elem->>'role','');
    v_name  := coalesce(v_elem->>'name','');
    if v_email = '' then continue; end if;

    v_meta := jsonb_strip_nulls(jsonb_build_object(
      'name', nullif(v_name,''), 'email_verified', true,
      'kind', p_kind, 'accountId', nullif(v_account_id,''),
      'role', nullif(v_role,'')));

    select id into v_existing from auth.users where lower(email)=v_email limit 1;

    if v_existing is not null then
      if v_pw <> '' then
        update auth.users set encrypted_password =
          extensions.crypt(v_pw, extensions.gen_salt('bf')), updated_at=now()
         where id = v_existing;
      end if;
      update auth.users
         set email_confirmed_at = coalesce(email_confirmed_at, now()),
             raw_app_meta_data  = coalesce(raw_app_meta_data,'{}'::jsonb)
                                    || '{"provider":"email","providers":["email"]}'::jsonb,
             raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || v_meta,
             updated_at=now()
       where id = v_existing;
      v_new_id := v_existing;
    elsif v_pw <> '' then
      v_new_id := extensions.uuid_generate_v4();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated',
        'authenticated', v_email, extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, v_meta,
        now(), now(), '', '', '', '', '', '', '', '');
      insert into auth.identities (
        id, user_id, provider, provider_id, identity_data,
        last_sign_in_at, created_at, updated_at
      ) values (
        extensions.uuid_generate_v4(), v_new_id, 'email', v_new_id::text,
        jsonb_build_object('sub',v_new_id::text,'email',v_email,
          'email_verified',true,'phone_verified',false),
        null, now(), now());
    else
      continue;  -- no auth row, no password: nothing to mirror
    end if;

    insert into public.portal_identities (auth_user_id, kind, member_id, account_id, role, status)
    values (v_new_id, p_kind, null, nullif(v_account_id,''), nullif(v_role,''), 'active')
    on conflict (auth_user_id) do update
      set kind=excluded.kind, account_id=excluded.account_id,
          role=excluded.role, member_id=null;
  end loop;
end;
$$;

create or replace function public.sync_agreement_users_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.sync_partner_user_to_auth(new.data,'corporate'); return new; end; $$;
create or replace function public.sync_agency_users_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.sync_partner_user_to_auth(new.data,'agent'); return new; end; $$;

drop trigger if exists agreements_sync_users_to_auth on public.agreements;
create trigger agreements_sync_users_to_auth
  after insert or update of data on public.agreements
  for each row execute function public.sync_agreement_users_trigger();
drop trigger if exists agencies_sync_users_to_auth on public.agencies;
create trigger agencies_sync_users_to_auth
  after insert or update of data on public.agencies
  for each row execute function public.sync_agency_users_trigger();

do $bf$ declare r record; begin
  for r in select data from public.agreements loop
    perform public.sync_partner_user_to_auth(r.data,'corporate'); end loop;
  for r in select data from public.agencies loop
    perform public.sync_partner_user_to_auth(r.data,'agent'); end loop;
end $bf$;

-- ── (e) custom_access_token_hook — copy claims into the JWT ────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = public
as $$
declare
  v_uid   uuid := (event->>'user_id')::uuid;
  v_claims jsonb := coalesce(event->'claims','{}'::jsonb);
  v_pi    public.portal_identities%rowtype;
begin
  select * into v_pi from public.portal_identities where auth_user_id = v_uid;
  if found then
    v_claims := v_claims || jsonb_strip_nulls(jsonb_build_object(
      'portal', jsonb_build_object(
        'kind', v_pi.kind,
        'memberId', v_pi.member_id,
        'accountId', v_pi.account_id,
        'role', v_pi.role,
        'status', v_pi.status)));
    -- top-level mirror so a future RLS USING(...) can read auth.jwt()->>'kind' cheaply
    v_claims := v_claims || jsonb_strip_nulls(jsonb_build_object(
      'kind', v_pi.kind, 'account_id', v_pi.account_id,
      'member_id', v_pi.member_id, 'role', v_pi.role));
  end if;
  return jsonb_build_object('claims', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.portal_identities to supabase_auth_admin;

drop policy if exists "portal_identities_auth_admin_read" on public.portal_identities;
create policy "portal_identities_auth_admin_read"
  on public.portal_identities for select to supabase_auth_admin using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- Verify after applying:
--   select count(*) from public.portal_identities;                          -- > 0
--   select kind, count(*) from public.portal_identities group by kind;
--   select count(*) from auth.users where raw_user_meta_data->>'kind' is not null;
-- ─────────────────────────────────────────────────────────────────────────
