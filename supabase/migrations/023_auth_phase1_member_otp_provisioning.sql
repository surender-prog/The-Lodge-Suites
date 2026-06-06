-- 023_auth_phase1_member_otp_provisioning.sql
-- ─────────────────────────────────────────────────────────────────────────
-- AUTH MIGRATION · PHASE 1b — universal member OTP provisioning
-- ─────────────────────────────────────────────────────────────────────────
-- Make EVERY member email-OTP-capable. Migration 022's sync_member_data_to_auth
-- only created an auth.users row for members that already had a password; a
-- password-less member (or a future website / JoinModal signup) got no row, so
-- email OTP (signInWithOtp with shouldCreateUser:false) couldn't find them.
--
-- This redefines sync_member_data_to_auth so the "new row" branch works WITH or
-- WITHOUT a password: a password-less member gets an auth.users + auth.identities
-- + portal_identities row whose encrypted_password is a random, unguessable
-- bcrypt hash — so signInWithPassword can never succeed, but email OTP works
-- (email is confirmed). A member who is later given a real password (admin set)
-- has the random hash overwritten on the next sync.
--
-- The members AFTER-INSERT trigger from 022 already calls this function, so new
-- signups are provisioned automatically — login keeps shouldCreateUser:false
-- (no signup-spam vector from the login form) and no client change is needed.
--
-- Idempotent + non-destructive: re-running updates existing rows, never
-- duplicates. Only the function body + a re-backfill change; the triggers from
-- 022 pick up the new version by name.
--
-- ⚠️ Abuse note: anon can insert members (JoinModal, RLS 003); each insert now
-- also mints an OTP-only auth.users row. The minted rows are harmless, but add
-- CAPTCHA / rate-limiting to the public join form before launch (owner
-- checklist) so the members + auth.users tables can't be spammed.
-- ─────────────────────────────────────────────────────────────────────────

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
  v_pw_hash   text;
begin
  if v_email = '' then return null; end if;
  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(v_name,''), 'email_verified', true,
    'kind','member','memberId', nullif(v_member_id,''),
    'tier', nullif(v_tier,'')));

  select id into v_existing from auth.users where lower(email)=v_email limit 1;

  if v_existing is not null then
    -- Existing row: refresh the real password only if one was supplied; never
    -- clobber it with the random OTP hash. Always refresh meta + confirm email.
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
  else
    -- New row: works WITH or WITHOUT a password. Password-less members get a
    -- random unguessable bcrypt hash → password login impossible, OTP works.
    v_new_id  := extensions.uuid_generate_v4();
    v_pw_hash := extensions.crypt(
      coalesce(nullif(v_password,''), extensions.uuid_generate_v4()::text),
      extensions.gen_salt('bf'));
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated',
      'authenticated', v_email, v_pw_hash, now(),
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
  end if;

  insert into public.portal_identities (auth_user_id, kind, member_id, account_id, role, status)
  values (v_new_id, 'member', nullif(v_member_id,''), null, null, 'active')
  on conflict (auth_user_id) do update
    set kind='member', member_id=excluded.member_id, account_id=null, role=null;
  return v_new_id;
end;
$$;

-- Re-run the member backfill so the password-less members now get rows too.
do $backfill$
declare r record;
begin
  for r in select data from public.members loop
    perform public.sync_member_data_to_auth(r.data);
  end loop;
end $backfill$;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify after applying:
--   select count(*) from public.portal_identities where kind='member';   -- now = every member with an email
--   select kind, count(*) from public.portal_identities group by kind;
-- ─────────────────────────────────────────────────────────────────────────
