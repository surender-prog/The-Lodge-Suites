-- 020_messages_anon_insert.sql
-- Lets non-staff portal users (LS Privilege members, corporate bookers,
-- travel agents) POST a message. They have no Supabase auth session — they
-- sign into the Guest Portal against the mocked `members` / account slices —
-- so without an anon INSERT policy their messages only ever landed in local
-- React state and never reached the DB. Result: the operator's Messages
-- section (which reads the live, authenticated `messages` slice) never saw
-- them. This mirrors the existing bookings_anyone_insert / members_anyone_insert
-- policies that already allow the public booking flow + LS Privilege join to
-- write as anon.
--
-- Staff retain full ALL access via the existing messages_staff_all policy.
-- Anon is INSERT-only (no SELECT / UPDATE / DELETE) so a visitor can't read
-- or tamper with other customers' threads.

drop policy if exists "messages_anyone_insert" on public.messages;
create policy "messages_anyone_insert" on public.messages
  for insert
  to public
  with check (true);
