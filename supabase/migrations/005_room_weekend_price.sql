-- ─────────────────────────────────────────────────────────────────────────
-- 005 · Room weekday/weekend pricing
-- ─────────────────────────────────────────────────────────────────────────
-- Adds a `price_weekend` column to public.rooms so the operator can charge
-- a different nightly rate on weekend days (Fri/Sat by default in Bahrain,
-- configurable per-property via hotel_info.weekendDays in the JSONB blob).
--
-- Existing rows are backfilled with the weekday rate so historical reads
-- (and any legacy clients still on the old schema) keep returning a valid
-- number. The seeded defaults at the bottom match src/data/rooms.js — a
-- ~15-20% premium over the weekday rate.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.rooms add column if not exists price_weekend numeric(10,3);

-- Backfill: when null, fall back to the weekday rate so the nightlyBreakdown
-- helper resolves correctly on first read.
update public.rooms set price_weekend = price where price_weekend is null;

-- Seed sensible defaults matching the bundled rooms.js. Operators edit these
-- in Admin → Rooms & Rates → Pricing & size after the migration runs.
update public.rooms set price_weekend = 44  where id = 'studio';
update public.rooms set price_weekend = 52  where id = 'one-bed';
update public.rooms set price_weekend = 92  where id = 'two-bed';
update public.rooms set price_weekend = 115 where id = 'three-bed';
