-- 017_rooms_name_column.sql
-- Adds a `name` column to public.rooms so that custom room types (created
-- via Hotel Admin → Rooms & Rates → Add room type) actually have somewhere
-- to store their public-facing label. Before this migration, the UI relied
-- exclusively on i18n keys (t(`rooms.${id}.name`)), which only existed for
-- the 4 bundled types — custom types like `superioronebedroom` rendered
-- the literal i18n key string.
--
-- We backfill the 4 bundled rows with their canonical English names so the
-- mapper has a consistent value to read; the i18n layer still takes
-- priority for those when a translation exists.

alter table public.rooms
  add column if not exists name text;

-- Backfill existing rows so the UI has a sensible fallback even if i18n
-- somehow misses. Custom rows (anything beyond the bundled 4) keep
-- whatever they had — typically null, which the app-side mapper now
-- humanises from the id slug as a last resort.
update public.rooms set name = 'Lodge Studio'         where id = 'studio'    and (name is null or name = '');
update public.rooms set name = 'One-Bedroom Suite'    where id = 'one-bed'   and (name is null or name = '');
update public.rooms set name = 'Two-Bedroom Suite'    where id = 'two-bed'   and (name is null or name = '');
update public.rooms set name = 'Three-Bedroom Suite'  where id = 'three-bed' and (name is null or name = '');
update public.rooms set name = 'Superior One-Bedroom' where id = 'superioronebedroom' and (name is null or name = '');
