-- 010_rooms_storage_bucket.sql
-- Public Supabase Storage bucket for room hero images. Used by the
-- Rooms & Rates admin (RoomTypeCreator + RoomTypeEditor → Identity
-- card) when an operator uploads a photo for a suite type.
--
-- Bucket is PUBLIC (different from `contracts` which is private):
-- the resulting URLs render on the marketing site's room cards +
-- the booking flow's suite picker, where no auth is in play.
--
-- Limits:
--   • 10 MB per file (matches the contracts bucket policy)
--   • Image MIME types only

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rooms',
  'rooms',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated staff can read/write. Anon can read (so the public
-- marketing site renders hero images without an auth round-trip).
drop policy if exists "Anon read room images" on storage.objects;
create policy "Anon read room images" on storage.objects
  for select to anon
  using (bucket_id = 'rooms');

drop policy if exists "Staff write room images" on storage.objects;
create policy "Staff write room images" on storage.objects
  for all to authenticated
  using (bucket_id = 'rooms')
  with check (bucket_id = 'rooms');
