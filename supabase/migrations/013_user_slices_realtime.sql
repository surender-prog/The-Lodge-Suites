-- 013_user_slices_realtime.sql
-- Extends the live-sync treatment from 012_admin_users_realtime to every
-- table that carries USER records the operator might edit from one tab and
-- expect another tab (or another browser, or another teammate) to see
-- without a refresh.
--
-- Tables in scope:
--   • members      — LS Privilege loyalty guests
--   • agreements   — corporate accounts (and their embedded users[] POCs)
--   • agencies     — travel agencies (and their embedded users[] POCs)
--   • prospects    — sales-funnel prospects (warm leads that may convert
--                    into corporate accounts or agency partners)
--
-- For each table we do two things:
--   1. Ensure it sits in the `supabase_realtime` publication so Supabase's
--      WebSocket layer rebroadcasts INSERT / UPDATE / DELETE events to
--      every subscriber.
--   2. Set REPLICA IDENTITY FULL so DELETE payloads carry the previous
--      row's columns. The React listener works with id-only payloads
--      too, but FULL keeps the door open for richer "you just removed X"
--      affordances later.
--
-- We deliberately do NOT add an anon SELECT policy here. The Guest Portal
-- demo tiles are hardcoded (not driven by a fetch), and the operator
-- screens that show members/agreements/agencies/prospects are all gated
-- behind staff auth. If a future screen needs anon visibility on any of
-- these, add a focused policy at that point — keeping the default
-- least-privilege is the right posture.
--
-- Idempotent: each statement guards against pre-existing membership.

do $$
declare
  rel text;
  rels text[] := array['members', 'agreements', 'agencies', 'prospects'];
begin
  foreach rel in array rels loop
    if exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    ) and not exists (
      select 1
      from   pg_publication_tables
      where  pubname    = 'supabase_realtime'
        and  schemaname = 'public'
        and  tablename  = rel
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', rel
      );
    end if;
  end loop;
exception
  -- Same defensive handlers as 012 in case the project lacks the named
  -- publication or a parallel migration already added the table.
  when undefined_object then null;
  when duplicate_object then null;
end $$;

-- REPLICA IDENTITY FULL — separate from the publication membership so
-- it's still applied even when the table is already in the publication.
alter table public.members    replica identity full;
alter table public.agreements replica identity full;
alter table public.agencies   replica identity full;
alter table public.prospects  replica identity full;
