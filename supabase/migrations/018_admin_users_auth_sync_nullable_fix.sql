-- 018_admin_users_auth_sync_nullable_fix.sql
-- Supabase's Go-based auth layer scans certain auth.users columns into Go
-- strings (not pointers), so NULL values blow up the user lookup with:
--   "Scan error on column index 3, name 'confirmation_token':
--    converting NULL to string is unsupported"
--
-- 016 inserted rows without populating these fields; fix all backfilled
-- rows now, and update the sync function so future inserts include them.

update auth.users set
  confirmation_token       = coalesce(confirmation_token, ''),
  recovery_token           = coalesce(recovery_token, ''),
  email_change_token_new   = coalesce(email_change_token_new, ''),
  email_change             = coalesce(email_change, ''),
  phone_change             = coalesce(phone_change, ''),
  phone_change_token       = coalesce(phone_change_token, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token   = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change is null
   or phone_change is null
   or phone_change_token is null
   or email_change_token_current is null
   or reauthentication_token is null;

-- Refresh the sync function so future inserts populate these as empty
-- strings up-front and we don't need a second pass.
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

  -- NB: confirmation_token / recovery_token / *_change / *_token columns
  -- are nominally NULL-able but Supabase's Go SDK scans them into Go
  -- strings, which means NULL is unscannable and breaks every subsequent
  -- signInWithPassword for this row. Seed them as empty strings.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone_change, phone_change_token, email_change_token_current,
    reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated',
    'authenticated', v_email, v_encrypted, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email_verified', true),
    now(), now(),
    '', '', '', '', '', '', '', ''
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
