-- 009_rooms_meal_plans.sql
-- Adds a meal_plans JSONB column to public.rooms so each suite type
-- carries its own RO / BB / HB / FB catalogue with per-plan supplements.
--
-- Shape: { ro: { enabled, supplement }, bb: {...}, hb: {...}, fb: {...} }
--   • enabled    — whether the plan is offered for this suite
--   • supplement — BHD per adult per night, added on top of the
--                  weekday/weekend rack rate
--
-- Public BookingModal, admin booking creator, contract rate rows,
-- agency rate rows, member tier benefits, and the calendar cell all
-- read off this catalogue so an admin edit flows through immediately.

alter table public.rooms
  add column if not exists meal_plans jsonb;

-- Seed sensible defaults onto the four bundled suites. The supplements
-- climb with suite size; bigger suites attract higher-spending guests.
update public.rooms set meal_plans = jsonb_build_object(
  'ro', jsonb_build_object('enabled', true, 'supplement', 0),
  'bb', jsonb_build_object('enabled', true, 'supplement', 6),
  'hb', jsonb_build_object('enabled', true, 'supplement', 18),
  'fb', jsonb_build_object('enabled', true, 'supplement', 28)
) where id = 'studio' and meal_plans is null;

update public.rooms set meal_plans = jsonb_build_object(
  'ro', jsonb_build_object('enabled', true, 'supplement', 0),
  'bb', jsonb_build_object('enabled', true, 'supplement', 7),
  'hb', jsonb_build_object('enabled', true, 'supplement', 22),
  'fb', jsonb_build_object('enabled', true, 'supplement', 32)
) where id = 'one-bed' and meal_plans is null;

update public.rooms set meal_plans = jsonb_build_object(
  'ro', jsonb_build_object('enabled', true, 'supplement', 0),
  'bb', jsonb_build_object('enabled', true, 'supplement', 8),
  'hb', jsonb_build_object('enabled', true, 'supplement', 26),
  'fb', jsonb_build_object('enabled', true, 'supplement', 38)
) where id = 'two-bed' and meal_plans is null;

update public.rooms set meal_plans = jsonb_build_object(
  'ro', jsonb_build_object('enabled', true, 'supplement', 0),
  'bb', jsonb_build_object('enabled', true, 'supplement', 9),
  'hb', jsonb_build_object('enabled', true, 'supplement', 30),
  'fb', jsonb_build_object('enabled', true, 'supplement', 44)
) where id = 'three-bed' and meal_plans is null;
