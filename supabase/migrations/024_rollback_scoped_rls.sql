-- 024_rollback_scoped_rls.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK for 024 (Phase 4 scoped RLS). Restores the permissive
-- "any authenticated user = full access" posture (migrations 002/003/007/020)
-- and reverts the access token hook to its 022 form (no is_staff).
--
-- Run this if applying 024 breaks the operator portal or you need to back out.
-- SAFE only while VITE_REAL_GUEST_AUTH is OFF (no guest holds a JWT). Do NOT
-- leave the app in this state with the flag ON — that re-opens the cross-account
-- read hole this rollback intentionally reverts to.
-- ─────────────────────────────────────────────────────────────────────────

-- (1) Revert the access token hook to the 022 version (drop is_staff logic).
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
        'kind', v_pi.kind, 'memberId', v_pi.member_id,
        'accountId', v_pi.account_id, 'role', v_pi.role, 'status', v_pi.status)));
    v_claims := v_claims || jsonb_strip_nulls(jsonb_build_object(
      'kind', v_pi.kind, 'account_id', v_pi.account_id,
      'member_id', v_pi.member_id, 'role', v_pi.role));
  end if;
  return jsonb_build_object('claims', v_claims);
end;
$$;

-- (2) Remove the member self-update guard (Phase-0 password preserve stays).
drop trigger if exists members_guard_self_update on public.members;

-- (3) Drop ALL 024 policies on the managed tables, recreate the permissive set.
do $drop$
declare
  r record;
  managed text[] := array[
    'rooms','packages','extras','gallery','singletons',
    'bookings','members','agreements','agencies','invoices','payments',
    'gift_cards','gift_card_tiers','messages','notifications',
    'email_templates','rfps','channels','admin_users','audit_logs','prospects',
    'activities','report_schedules','maintenance_vendors','maintenance_jobs',
    'room_units','calendar_overrides','tax_patterns'
  ];
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename = any(managed)
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$drop$;

-- (4) Recreate the permissive authenticated-all staff policies on every table.
do $staff$
declare
  t text;
  all_tables text[] := array[
    'rooms','packages','extras','gallery','singletons',
    'bookings','members','agreements','agencies','invoices','payments',
    'gift_cards','gift_card_tiers','messages','notifications',
    'email_templates','rfps','channels','admin_users','audit_logs','prospects',
    'activities','report_schedules','maintenance_vendors','maintenance_jobs',
    'room_units','calendar_overrides','tax_patterns'
  ];
begin
  foreach t in array all_tables loop
    execute format(
      'create policy %I on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t || '_staff_all', t);
  end loop;
end
$staff$;

-- (5) Restore public reads + anon insert paths (002/003/007/020).
create policy "rooms_public_read"     on public.rooms     for select using (is_active = true);
create policy "packages_public_read"  on public.packages  for select using (true);
create policy "extras_public_read"    on public.extras    for select using (true);
create policy "gallery_public_read"   on public.gallery   for select using (true);
create policy "gift_card_tiers_public_read" on public.gift_card_tiers for select using (true);
create policy "singletons_public_read" on public.singletons for select
  using (key in ('hotel_info','site_content','loyalty','tiers','tax','active_tax_pattern'));

create policy "bookings_anyone_insert" on public.bookings for insert to public with check (true);
create policy "members_anyone_insert"  on public.members  for insert to public with check (true);
create policy "messages_anyone_insert" on public.messages for insert to public with check (true);
create policy "gift_cards_anon_insert" on public.gift_cards for insert to anon with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- After rollback: keep VITE_REAL_GUEST_AUTH OFF. The app is back to the
-- pre-Phase-4 state (staff full access; guests not authenticated in prod).
-- ─────────────────────────────────────────────────────────────────────────
