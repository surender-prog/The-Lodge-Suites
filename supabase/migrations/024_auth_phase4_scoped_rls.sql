-- 024_auth_phase4_scoped_rls.sql
-- ─────────────────────────────────────────────────────────────────────────
-- AUTH MIGRATION · PHASE 4 — scoped Row-Level Security (the launch gate)
-- ─────────────────────────────────────────────────────────────────────────
-- Replaces the permissive "any authenticated user can read/write everything"
-- posture (migration 002) with per-tier scoping, so that once GUESTS hold real
-- JWTs (VITE_REAL_GUEST_AUTH on), a logged-in guest can only ever read THEIR
-- OWN data — never another account's — over the API.
--
-- SAFE-BY-CONSTRUCTION:
--   • Staff are identified by a POSITIVE claim (is_staff), minted by the access
--     token hook for admin_users. If the hook ever fails, a user gets NO claim
--     → sees NOTHING (fail-closed). It never fails open to admin.
--   • This migration DROPS every existing policy on the managed tables and
--     recreates the complete, correct set — so no stray over-permissive policy
--     can survive (no need to know prior policy names).
--   • Catalog tables stay public-read (the booking funnel keeps working for
--     anon + guests). Anon insert paths (bookings/members/messages/gift_cards)
--     are preserved.
--
-- APPLY IN LOCKSTEP WITH THE FLAG: guests aren't authenticated in prod until
-- VITE_REAL_GUEST_AUTH flips, so apply this right before flipping, TEST THE
-- OPERATOR PORTAL immediately (staff must still see everything), and keep the
-- rollback (024_rollback_*.sql) ready.
--
-- DEPENDS ON: 016/018 (admin_users → auth.users), 022 (portal_identities +
-- custom_access_token_hook), 023 (member OTP provisioning).
-- ─────────────────────────────────────────────────────────────────────────

-- ── (1) Staff marker for the JWT (positive, fail-closed) ──────────────────
-- SECURITY DEFINER so it can read admin_users regardless of grants/RLS.
create or replace function public.is_staff_email(p_email text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where lower(data->>'email') = lower(p_email)
  );
$$;
revoke all on function public.is_staff_email(text) from public, anon, authenticated;
grant execute on function public.is_staff_email(text) to supabase_auth_admin;

-- ── (2) Extend the access token hook: ADD is_staff (keep all 022 logic) ────
-- A user can be a portal guest AND/OR staff; both claim sets may be present.
-- RLS treats is_staff as full access, so staff always win.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = public
as $$
declare
  v_uid    uuid := (event->>'user_id')::uuid;
  v_claims jsonb := coalesce(event->'claims','{}'::jsonb);
  v_email  text := lower(coalesce(event->'claims'->>'email',''));
  v_pi     public.portal_identities%rowtype;
begin
  -- Portal guest claims (unchanged from 022).
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
  -- Staff marker (NEW). Independent of the portal claim.
  if v_email <> '' and public.is_staff_email(v_email) then
    v_claims := v_claims || jsonb_build_object('is_staff', true);
  end if;
  return jsonb_build_object('claims', v_claims);
end;
$$;

-- ── (3) JWT claim accessors (readable, reusable in policies) ───────────────
create or replace function public.jwt_is_staff() returns boolean
  language sql stable as $$ select coalesce((auth.jwt()->>'is_staff')::boolean, false) $$;
create or replace function public.jwt_kind() returns text
  language sql stable as $$ select auth.jwt()->>'kind' $$;
create or replace function public.jwt_member_id() returns text
  language sql stable as $$ select auth.jwt()->>'member_id' $$;
create or replace function public.jwt_account_id() returns text
  language sql stable as $$ select auth.jwt()->>'account_id' $$;
create or replace function public.jwt_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

-- ── (4) Guard: members can self-edit profile but NOT escalate ─────────────
-- A member self-update keeps protected fields (tier/points/etc.) from OLD, so
-- a member can change name/phone/ID docs but never their own tier or balance.
-- Staff (is_staff) bypass the guard.
create or replace function public.guard_member_self_update()
returns trigger language plpgsql as $$
begin
  if public.jwt_is_staff() then return new; end if;
  new.data := (new.data - 'tier' - 'points' - 'lifetimeNights' - 'verified' - 'email' - 'id')
    || coalesce((
         select jsonb_object_agg(k, old.data->k)
         from unnest(array['tier','points','lifetimeNights','verified','email','id']) as k
         where old.data ? k
       ), '{}'::jsonb);
  return new;
end;
$$;
drop trigger if exists members_guard_self_update on public.members;
create trigger members_guard_self_update
  before update of data on public.members
  for each row execute function public.guard_member_self_update();

-- ── (5) Drop ALL existing policies on managed tables, then recreate ───────
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

-- ── (6) CATALOG — public read + staff write ───────────────────────────────
create policy "rooms_public_read"   on public.rooms   for select using (is_active = true);
create policy "rooms_staff_all"     on public.rooms   for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());

create policy "packages_public_read" on public.packages for select using (true);
create policy "packages_staff_all"   on public.packages for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());

create policy "extras_public_read"   on public.extras   for select using (true);
create policy "extras_staff_all"     on public.extras   for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());

create policy "gallery_public_read"  on public.gallery  for select using (true);
create policy "gallery_staff_all"    on public.gallery  for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());

create policy "gift_card_tiers_public_read" on public.gift_card_tiers for select using (true);
create policy "gift_card_tiers_staff_all"   on public.gift_card_tiers for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());

create policy "singletons_public_read" on public.singletons for select
  using (key in ('hotel_info','site_content','loyalty','tiers','tax','active_tax_pattern'));
create policy "singletons_staff_all"   on public.singletons for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());

-- ── (7) BOOKINGS — anon/guest insert + staff all + scoped guest read ──────
create policy "bookings_anyone_insert" on public.bookings for insert to public with check (true);
create policy "bookings_staff_all"     on public.bookings for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "bookings_guest_read"    on public.bookings for select to authenticated using (
     (public.jwt_kind() = 'member'    and (data->>'memberId' = public.jwt_member_id()
                                           or lower(coalesce(data->>'email','')) = public.jwt_email()))
  or (public.jwt_kind() = 'corporate' and data->>'source' = 'corporate' and data->>'accountId' = public.jwt_account_id())
  or (public.jwt_kind() = 'agent'     and data->>'source' = 'agent'     and data->>'agencyId'  = public.jwt_account_id())
);

-- ── (8) MEMBERS — anon insert (join form) + staff all + member self r/w ───
create policy "members_anon_insert"  on public.members for insert to anon with check (true);
create policy "members_staff_all"    on public.members for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "members_self_read"    on public.members for select to authenticated using (public.jwt_kind() = 'member' and id = public.jwt_member_id());
create policy "members_self_update"  on public.members for update to authenticated
  using (public.jwt_kind() = 'member' and id = public.jwt_member_id())
  with check (public.jwt_kind() = 'member' and id = public.jwt_member_id());
-- The app persists profile edits via upsert() (INSERT ... ON CONFLICT UPDATE);
-- Postgres evaluates the INSERT policy even when it resolves to an update, so a
-- member needs a self-scoped insert policy or profile saves fail. Restricted to
-- their own id; the guard trigger still blocks protected-field changes.
create policy "members_self_insert"  on public.members for insert to authenticated
  with check (public.jwt_kind() = 'member' and id = public.jwt_member_id());

-- ── (9) AGREEMENTS / AGENCIES — staff all + own-account read ──────────────
create policy "agreements_staff_all" on public.agreements for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "agreements_self_read" on public.agreements for select to authenticated using (public.jwt_kind() = 'corporate' and id = public.jwt_account_id());

create policy "agencies_staff_all"   on public.agencies for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "agencies_self_read"   on public.agencies for select to authenticated using (public.jwt_kind() = 'agent' and id = public.jwt_account_id());

-- ── (10) INVOICES / PAYMENTS — staff all + scoped via visible bookings ────
-- The inner SELECT is itself RLS-filtered, so a guest sees only invoices /
-- payments whose booking they can already see. Staff see all.
create policy "invoices_staff_all"  on public.invoices for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "invoices_guest_read" on public.invoices for select to authenticated
  using (public.jwt_kind() is not null and data->>'bookingId' in (select id from public.bookings));

create policy "payments_staff_all"  on public.payments for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "payments_guest_read" on public.payments for select to authenticated
  using (public.jwt_kind() is not null and data->>'bookingId' in (select id from public.bookings));

-- ── (11) GIFT CARDS — anon purchase + staff all + member scoped read ──────
create policy "gift_cards_anon_insert" on public.gift_cards for insert to anon with check (true);
create policy "gift_cards_staff_all"   on public.gift_cards for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "gift_cards_member_read" on public.gift_cards for select to authenticated
  using (public.jwt_kind() = 'member'
         and (data->>'senderMemberId' = public.jwt_member_id()
              or data->>'recipientMemberId' = public.jwt_member_id()));

-- ── (12) MESSAGES — anon/guest insert + staff all + thread-scoped read ────
create policy "messages_anyone_insert" on public.messages for insert to public with check (true);
create policy "messages_staff_all"     on public.messages for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "messages_guest_read"    on public.messages for select to authenticated using (
     data->>'threadKey' = 'account:' || coalesce(public.jwt_kind(),'') || ':' || coalesce(public.jwt_account_id(), public.jwt_member_id(), '')
  or (data->>'threadKey' like 'booking:%' and split_part(data->>'threadKey', ':', 2) in (select id from public.bookings))
);

-- ── (13) NOTIFICATIONS — staff all + guest scoped read ────────────────────
create policy "notifications_staff_all"  on public.notifications for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff());
create policy "notifications_guest_read" on public.notifications for select to authenticated using (
  public.jwt_kind() is not null and public.jwt_kind() <> 'staff'
  and data->>'recipientType' = public.jwt_kind()
  and data->>'recipientId' = coalesce(public.jwt_account_id(), public.jwt_member_id())
);

-- ── (14) STAFF-ONLY tables (no guest access) ──────────────────────────────
do $staff$
declare
  t text;
  staff_only text[] := array[
    'email_templates','rfps','channels','admin_users','audit_logs','prospects',
    'activities','report_schedules','maintenance_vendors','maintenance_jobs',
    'room_units','calendar_overrides','tax_patterns'
  ];
begin
  foreach t in array staff_only loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff())',
      t || '_staff_all', t);
  end loop;
end
$staff$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFY after applying (see test plan):
--   • staff JWT carries is_staff=true; operator portal reads everything.
--   • member JWT (flag on) reads only own member row + own bookings/invoices/
--     payments/gift_cards/messages/notifications.
--   • a guest CANNOT select another account's rows over the API.
--   • anon: still reads catalog + inserts bookings/members/messages.
-- List policies:
--   select tablename, policyname, cmd, roles::text from pg_policies
--   where schemaname='public' order by tablename, policyname;
-- ─────────────────────────────────────────────────────────────────────────
