-- 019_rooms_giftcard_upgrade_fee.sql
-- Adds gift_card_upgrade_fee_per_night to public.rooms so members
-- redeeming a gift card against a higher-category suite can be charged
-- the per-night supplement set by the operator. The differential is
-- computed at booking time as:
--   per_night_supplement = max(0, target.fee - source.fee)
--   total_supplement     = per_night_supplement × nights
--
-- Defaults are sensible starting points keyed to the existing rack
-- gaps between bundled suite types — operators can edit them from the
-- Gift Cards admin section without touching the DB.

alter table public.rooms
  add column if not exists gift_card_upgrade_fee_per_night numeric(10, 3) not null default 0;

update public.rooms set gift_card_upgrade_fee_per_night = 0   where id = 'studio'              and gift_card_upgrade_fee_per_night = 0;
update public.rooms set gift_card_upgrade_fee_per_night = 14  where id = 'one-bed'             and gift_card_upgrade_fee_per_night = 0;
update public.rooms set gift_card_upgrade_fee_per_night = 34  where id = 'two-bed'             and gift_card_upgrade_fee_per_night = 0;
update public.rooms set gift_card_upgrade_fee_per_night = 52  where id = 'three-bed'           and gift_card_upgrade_fee_per_night = 0;
update public.rooms set gift_card_upgrade_fee_per_night = 20  where id = 'superioronebedroom'  and gift_card_upgrade_fee_per_night = 0;
