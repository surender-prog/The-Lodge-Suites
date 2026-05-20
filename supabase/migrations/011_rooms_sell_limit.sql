-- 011_rooms_sell_limit.sql
-- Adds a sell_limit integer column to public.rooms so each suite type
-- carries an OPTIONAL master cap on how many units the front desk is
-- allowed to release for sale.
--
-- Semantics:
--   • NULL              — no override; the booking engine falls back to
--                          the active room_units count for this type.
--   • >= 0              — fixed cap, applied across direct, OTA, corporate
--                          and agency bookings. Can be set ABOVE the
--                          physical unit count for controlled overbooking,
--                          or BELOW it to hold inventory back for VIP /
--                          walk-in / corporate-allocation use.
--
-- Read paths: admin calendar (cell availability), admin dashboard
-- (tonight occupancy + heatmap), and the public BookingModal which
-- gates "no rooms left" against this cap. Writes from RoomsRates →
-- Room editor's Identity card.
--
-- Idempotent: the column is added once; nothing seeded so legacy rows
-- naturally fall back to the physical-unit count.

alter table public.rooms
  add column if not exists sell_limit integer
  check (sell_limit is null or sell_limit >= 0);

comment on column public.rooms.sell_limit is
  'Optional master cap on bookable units for this room type. NULL means "fall back to active room_units count".';
