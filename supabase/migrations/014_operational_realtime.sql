-- 014_operational_realtime.sql
-- Extends live multi-tab sync to every operational table the front-of-
-- house, reservations, accounts, marketing, sales, and housekeeping
-- teams might edit simultaneously. The rule of thumb: if two staff
-- members could plausibly be looking at the same screen at the same
-- time, the underlying table needs to be in supabase_realtime so a
-- change in one tab doesn't sit invisibly until the other refreshes.
--
-- New tables joining the realtime publication:
--
--   Inventory / pricing
--     • rooms              — public room types + rack rates + sell limit
--     • room_units         — per-suite registry (status, view, floor)
--     • calendar_overrides — per-(roomId × date) rate, blocked, stop-sale
--     • packages           — featured offers
--     • extras             — booking add-ons
--     • tax_patterns       — VAT / service / tourism levy presets
--     • gift_cards         — issued gift cards + redemption status
--
--   Reservations / billing
--     • bookings           — reservations across every channel
--     • invoices           — booking + commission + gift-card invoices
--     • payments           — captured payments
--
--   Operations
--     • maintenance_jobs   — defect-to-fix lifecycle
--     • maintenance_vendors— Rolodex (AC, plumbers, painters…)
--     • channels           — OTA / channel-manager status
--     • email_templates    — every templated email the system sends
--     • report_schedules   — recurring email reports
--     • rfps               — corporate RFP intake
--     • activities         — CRM activity stream
--     • notifications      — operator inbox
--     • messages           — staff chat threads
--     • gallery            — homepage gallery items
--
--   Singletons
--     • singletons         — hotel_info, tiers, tax, loyalty, smtp_config,
--                            site_content, event_supplements,
--                            active_tax_pattern, gift_card_tiers (singleton
--                            row), …
--
-- Already added by earlier migrations (no-op if re-attempted thanks to
-- the pg_publication_tables guard below):
--   012 → admin_users
--   013 → members, agreements, agencies, prospects
--
-- We deliberately leave `audit_logs` OUT — every operator session
-- appends to it, and rebroadcasting the firehose to every tab adds
-- network chatter without giving anyone a UI they'd actually watch
-- live. If a future "live audit feed" screen needs it, add it then.

do $$
declare
  rel text;
  rels text[] := array[
    -- Phase 2 entity tables
    'rooms',
    'room_units',
    'calendar_overrides',
    'packages',
    'extras',
    'tax_patterns',
    'bookings',
    'invoices',
    'payments',
    'maintenance_jobs',
    'maintenance_vendors',
    'channels',
    'email_templates',
    'report_schedules',
    'rfps',
    'activities',
    'notifications',
    'messages',
    'gallery',
    'gift_cards',
    'gift_card_tiers',
    'singletons'
  ];
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
  when undefined_object then null;
  when duplicate_object then null;
end $$;

-- REPLICA IDENTITY FULL so DELETE events carry the previous row's
-- columns. The React listeners can work with id-only payloads, but
-- FULL keeps the door open for richer "you just removed X" affordances
-- and is essential for any tables where the consumer wants the old
-- jsonb data column.
alter table public.rooms              replica identity full;
alter table public.room_units         replica identity full;
alter table public.calendar_overrides replica identity full;
alter table public.packages           replica identity full;
alter table public.extras             replica identity full;
alter table public.tax_patterns       replica identity full;
alter table public.bookings           replica identity full;
alter table public.invoices           replica identity full;
alter table public.payments           replica identity full;
alter table public.maintenance_jobs   replica identity full;
alter table public.maintenance_vendors replica identity full;
alter table public.channels           replica identity full;
alter table public.email_templates    replica identity full;
alter table public.report_schedules   replica identity full;
alter table public.rfps               replica identity full;
alter table public.activities         replica identity full;
alter table public.notifications      replica identity full;
alter table public.messages           replica identity full;
alter table public.gallery            replica identity full;
alter table public.gift_cards         replica identity full;
alter table public.gift_card_tiers    replica identity full;
alter table public.singletons         replica identity full;
