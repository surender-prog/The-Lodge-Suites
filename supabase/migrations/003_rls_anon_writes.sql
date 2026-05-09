-- ─────────────────────────────────────────────────────────────────────────
-- Phase 2.1 — Anon-write RLS fix for `bookings` and `members`
-- ─────────────────────────────────────────────────────────────────────────
-- The initial Phase 2 RLS layout combined a `for all` staff policy with a
-- separate `for insert` anon policy. In Supabase, `.upsert(...)` (used by
-- the bulkReplace persistence layer) generates `INSERT ... ON CONFLICT DO
-- UPDATE` SQL — which trips the UPDATE branch of RLS even when there's
-- no actual conflict. Anon callers don't have an UPDATE policy, so even
-- pure inserts via upsert were rejected.
--
-- This migration:
--   1. Drops the previous policy combination for `bookings` and `members`
--   2. Creates two clean per-role policies per table:
--        • anon-only INSERT (homepage walk-up bookings, member self-join)
--        • authenticated full-access (operator portal does everything)
--   3. The application code (`src/lib/dataSync.js`) uses plain
--      `.insert()` for anon callers and full `.upsert()` for authed
--      callers — so this RLS shape matches the write strategy.
-- ─────────────────────────────────────────────────────────────────────────

-- Bookings
drop policy if exists "bookings_staff_all"     on public.bookings;
drop policy if exists "bookings_anon_insert"   on public.bookings;
drop policy if exists "bookings_anyone_insert" on public.bookings;
drop policy if exists "bookings_insert_any"    on public.bookings;
drop policy if exists "bookings_select_staff"  on public.bookings;
drop policy if exists "bookings_update_staff"  on public.bookings;
drop policy if exists "bookings_delete_staff"  on public.bookings;
drop policy if exists "bookings_open"          on public.bookings;

create policy "bookings_anyone_insert" on public.bookings
  as permissive
  for insert
  to public
  with check (true);

create policy "bookings_staff_all" on public.bookings
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- Members
drop policy if exists "members_self_read"      on public.members;
drop policy if exists "members_self_update"    on public.members;
drop policy if exists "members_staff_insert"   on public.members;
drop policy if exists "members_staff_all"      on public.members;
drop policy if exists "members_anyone_insert"  on public.members;

create policy "members_anyone_insert" on public.members
  as permissive
  for insert
  to public
  with check (true);

create policy "members_staff_all" on public.members
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- Verify with:
--   select tablename, policyname, roles::text, cmd
--   from pg_policies
--   where schemaname = 'public' and tablename in ('bookings','members')
--   order by tablename, cmd;
-- Expected: 2 policies per table (one INSERT to public, one ALL to authenticated)
-- ─────────────────────────────────────────────────────────────────────────
