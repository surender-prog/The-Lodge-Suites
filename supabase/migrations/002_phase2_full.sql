-- ─────────────────────────────────────────────────────────────────────────
-- Phase 2 — All remaining slices, JSONB-per-entity pattern
-- ─────────────────────────────────────────────────────────────────────────
-- Strategy: every entity slice gets a thin (id, data) table where `data`
-- is the full JSON shape of the React object. This trades typed columns
-- for migration speed — perfect for live testing where we expect the
-- shape to evolve. After testing concludes (and a `truncate ... cascade`
-- cleanup), specific entities can be lifted to typed columns one at a
-- time without changing the helper API.
--
-- Singletons (config blobs that have exactly one row each — hotel info,
-- SMTP, site CMS, loyalty settings, tax tables, tiers) live in a single
-- `singletons` table keyed by config name. One table, one row per config.
--
-- RLS posture: permissive-for-testing.
--   • Any authenticated user (matches "logged in to operator portal")
--     gets full read/write on all entity tables.
--   • Anon clients get read-only on the public-facing tables (rooms,
--     packages, extras, gallery, hotel info) — needed for the homepage.
--   • Tighten before exposing to the public internet.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Drop Phase 1 entity tables that haven't been used yet so we can
--    rebuild them with the consistent JSONB pattern. `rooms` stays typed
--    because it's already wired, seeded, and rendered on the homepage.
drop table if exists public.payments cascade;
drop table if exists public.bookings cascade;
drop table if exists public.members  cascade;
drop table if exists public.extras   cascade;
drop table if exists public.packages cascade;

-- ── Singletons (one-row configs) ─────────────────────────────────────────
create table if not exists public.singletons (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ── JSONB entity tables ──────────────────────────────────────────────────
-- Helper macro using a do-block so we don't repeat the DDL twenty times.
do $$
declare
  t text;
  entity_tables text[] := array[
    -- Phase 1 entities (rebuilt as JSONB)
    'packages', 'extras', 'members', 'bookings', 'payments',
    -- Phase 2 entities
    'invoices',
    'agreements',
    'agencies',
    'email_templates',
    'rfps',
    'channels',
    'admin_users',
    'audit_logs',
    'prospects',
    'activities',
    'report_schedules',
    'maintenance_vendors',
    'maintenance_jobs',
    'room_units',
    'gallery',
    'notifications',
    'messages',
    'calendar_overrides',
    'tax_patterns'
  ];
begin
  foreach t in array entity_tables loop
    execute format('
      create table if not exists public.%I (
        id          text primary key,
        data        jsonb not null,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )', t);
  end loop;
end $$;

-- updated_at trigger for entity tables (singletons get one too)
create or replace function public.touch_updated_at_phase2() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

do $$
declare
  t text;
  entity_tables text[] := array[
    'singletons',
    'packages', 'extras', 'members', 'bookings', 'payments',
    'invoices', 'agreements', 'agencies', 'email_templates', 'rfps',
    'channels', 'admin_users', 'audit_logs', 'prospects', 'activities',
    'report_schedules', 'maintenance_vendors', 'maintenance_jobs',
    'room_units', 'gallery', 'notifications', 'messages',
    'calendar_overrides', 'tax_patterns'
  ];
begin
  foreach t in array entity_tables loop
    execute format('drop trigger if exists trg_%I_touch on public.%I', t, t);
    execute format('create trigger trg_%I_touch before update on public.%I
                    for each row execute function public.touch_updated_at_phase2()', t, t);
  end loop;
end $$;

-- ── Row-Level Security — testing posture ─────────────────────────────────
-- Any authenticated user is treated as staff. Anon clients can READ a
-- subset (the homepage-visible tables); writes require auth.

-- Enable RLS on every entity table.
do $$
declare
  t text;
  rls_tables text[] := array[
    'singletons',
    'packages', 'extras', 'members', 'bookings', 'payments',
    'invoices', 'agreements', 'agencies', 'email_templates', 'rfps',
    'channels', 'admin_users', 'audit_logs', 'prospects', 'activities',
    'report_schedules', 'maintenance_vendors', 'maintenance_jobs',
    'room_units', 'gallery', 'notifications', 'messages',
    'calendar_overrides', 'tax_patterns'
  ];
begin
  foreach t in array rls_tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Universal authenticated-staff full-access policy.
do $$
declare
  t text;
  staff_tables text[] := array[
    'singletons',
    'packages', 'extras', 'members', 'bookings', 'payments',
    'invoices', 'agreements', 'agencies', 'email_templates', 'rfps',
    'channels', 'admin_users', 'audit_logs', 'prospects', 'activities',
    'report_schedules', 'maintenance_vendors', 'maintenance_jobs',
    'room_units', 'notifications', 'messages',
    'calendar_overrides', 'tax_patterns'
  ];
begin
  foreach t in array staff_tables loop
    execute format('drop policy if exists "%s_staff_all" on public.%I', t, t);
    execute format('create policy "%s_staff_all" on public.%I for all
                    using (auth.role() = ''authenticated'')
                    with check (auth.role() = ''authenticated'')', t, t);
  end loop;
end $$;

-- Public-readable singletons / gallery (homepage needs these without auth).
-- Singletons.value is fetched by key; we expose hotel_info, site_content,
-- loyalty, tiers (tier benefits matrix), tax (rates) — anything the public
-- site renders.
drop policy if exists "singletons_public_read" on public.singletons;
create policy "singletons_public_read"
  on public.singletons for select
  using (key in ('hotel_info','site_content','loyalty','tiers','tax','active_tax_pattern'));

-- Gallery, packages, extras are public-readable (homepage / booking modal).
drop policy if exists "gallery_public_read"  on public.gallery;
drop policy if exists "packages_public_read" on public.packages;
drop policy if exists "extras_public_read"   on public.extras;
create policy "gallery_public_read"  on public.gallery  for select using (true);
create policy "packages_public_read" on public.packages for select using (true);
create policy "extras_public_read"   on public.extras   for select using (true);

-- Anon can insert a booking (direct walk-up reservations) but never read
-- the bookings table without auth.
drop policy if exists "bookings_anon_insert" on public.bookings;
create policy "bookings_anon_insert" on public.bookings for insert with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- Done. Verify with:
--   select tablename from pg_tables where schemaname = 'public' order by 1;
-- Should show 26 tables (Phase 1 had 6: rooms, packages, extras, members,
-- bookings, payments — plus 20 from this migration: singletons + 19
-- entity tables).
-- ─────────────────────────────────────────────────────────────────────────
