-- 016_admin_users_auth_sync.sql
-- Mirrors every public.admin_users row into auth.users + auth.identities so
-- that the demo staff sign-in (signInStaff in src/data/store.jsx) can
-- actually obtain an authenticated Supabase session for ALL roles, not just
-- the Owner. Before this migration, RLS on operational tables
-- (auth.role() = 'authenticated') rejected every read for non-Owner roles,
-- so the partner portal silently kept showing JS-bundled seed data.
--
-- Idempotent: re-running this migration refreshes the bcrypt password from
-- admin_users.data->>'password' for existing rows. Future admin_users
-- inserts/updates fire the trigger and self-heal automatically.

create extension if not exists pgcrypto with schema extensions;

-- The actual sync logic, callable for any admin_users.data jsonb blob.
create or replace function public.sync_admin_user_data_to_auth(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email      text := lower(coalesce(p_data->>'email', ''));
  v_password   text := coalesce(p_data->>'password', '');
  v_existing   uuid;
  v_new_id     uuid;
  v_encrypted  text;
begin
  if v_email = '' or v_password = '' then
    return;
  end if;

  select id into v_existing
    from auth.users
   where lower(email) = v_email
   limit 1;

  if v_existing is not null then
    -- Refresh password + ensure the email is marked confirmed so
    -- signInWithPassword works without an email verification step.
    update auth.users
       set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
                                  || '{"provider":"email","providers":["email"]}'::jsonb,
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                  || jsonb_build_object('email_verified', true),
           updated_at = now()
     where id = v_existing;
    return;
  end if;

  v_new_id    := extensions.uuid_generate_v4();
  v_encrypted := extensions.crypt(v_password, extensions.gen_salt('bf'));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated',
    'authenticated', v_email, v_encrypted, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email_verified', true),
    now(), now()
  );

  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  )
  values (
    extensions.uuid_generate_v4(), v_new_id, 'email', v_new_id::text,
    jsonb_build_object(
      'sub',            v_new_id::text,
      'email',          v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    null, now(), now()
  );
end;
$$;

-- Thin trigger wrapper that hands the row's jsonb to the sync function.
create or replace function public.sync_admin_user_to_auth_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_admin_user_data_to_auth(new.data);
  return new;
end;
$$;

drop trigger if exists admin_users_sync_to_auth on public.admin_users;
create trigger admin_users_sync_to_auth
after insert or update of data on public.admin_users
for each row execute function public.sync_admin_user_to_auth_trigger();

-- One-time backfill — sync every admin_users row that exists right now.
do $backfill$
declare
  r record;
begin
  for r in select data from public.admin_users loop
    perform public.sync_admin_user_data_to_auth(r.data);
  end loop;
end;
$backfill$;
