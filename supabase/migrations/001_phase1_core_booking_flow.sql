-- ─────────────────────────────────────────────────────────────────────────
-- The Lodge Suites — Supabase schema (Phase 1: core booking flow)
-- ─────────────────────────────────────────────────────────────────────────
-- Run this in Supabase Studio → SQL Editor → New query, or via the CLI:
--
--   supabase db push --file supabase/schema.sql
--
-- Phase 1 covers the tables needed for live booking testing:
--   • rooms        — suite catalog
--   • packages     — offers (Spa & Stay, B&B, etc.)
--   • extras       — booking add-ons
--   • members      — LS Privilege guests
--   • bookings     — reservations (the heart of the system)
--   • payments     — folio receipts / refunds / settlements
--
-- The other 28 in-memory slices (RFPs, prospects, audit logs, email
-- templates, SMTP config, channels, maintenance jobs, staff users, etc.)
-- come in Phase 2+. Keep them client-side until Phase 1 is proven.
--
-- IMPORTANT — Row-Level Security is enabled below with permissive starter
-- policies. TIGHTEN THEM before letting external traffic in:
--   • Public reads for `rooms`, `packages`, `extras` are fine
--   • `bookings`/`members`/`payments` should ONLY be accessible to
--     authenticated staff or to the owning member (auth.uid() match)
--   • Service-role key (used by edge functions) bypasses RLS entirely
-- ─────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 1. Rooms (suite catalog) ──────────────────────────────────────────────
-- Mirrors src/data/rooms.js. Operator edits flow through Admin → Rooms &
-- Rates and write here.
create table if not exists public.rooms (
  id              text primary key,                  -- "studio", "one-bed", "two-bed", "three-bed"
  sqm             integer not null,
  occupancy       integer not null,                  -- HARD total cap (adults + children)
  max_adults      integer,                           -- nullable → defaults to occupancy in app
  max_children    integer,                           -- nullable → defaults to occupancy in app
  price           numeric(10,3) not null,            -- BHD, 3-decimal
  image_url       text,
  popular         boolean not null default false,
  extra_bed_available boolean not null default false,
  max_extra_beds  integer not null default 0,
  extra_bed_fee   numeric(10,3) not null default 0,
  extra_bed_adds  jsonb not null default '{"adults":0,"children":0}'::jsonb,
  is_active       boolean not null default true,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 2. Packages (offers) ──────────────────────────────────────────────────
create table if not exists public.packages (
  id              text primary key,                  -- "spa-stay", "bed-breakfast", etc.
  title           text not null,
  description     text,
  hero_image_url  text,
  pricing_mode    text not null check (pricing_mode in ('per-night','first-night','flat')),
  prices          jsonb not null default '{}'::jsonb,-- { "studio": 79, "one-bed": 89, ... }
  room_ids        text[] not null default '{}'::text[],
  min_nights      integer not null default 1,
  max_nights      integer,
  min_guests      integer not null default 1,
  max_guests      integer,
  valid_from      date,
  valid_to        date,
  inclusions      text[] not null default '{}'::text[],
  promo_code      text,                              -- null → auto-applied when eligible
  is_active       boolean not null default true,
  display_order   integer not null default 0,
  accent_color    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 3. Extras (booking add-ons) ───────────────────────────────────────────
create table if not exists public.extras (
  id              text primary key,                  -- "airport-transfer", "welcome-hamper"
  title           text not null,
  description     text,
  pricing_rule    text not null check (pricing_rule in ('per-booking','per-night','per-guest','per-night-per-guest')),
  unit_price      numeric(10,3) not null,
  room_ids        text[] not null default '{}'::text[],-- empty = all suites
  is_active       boolean not null default true,
  default_selected boolean not null default false,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 4. Members (LS Privilege) ─────────────────────────────────────────────
create table if not exists public.members (
  id              text primary key,                  -- "LS-G-A1B2C3" — display code
  auth_user_id    uuid references auth.users(id) on delete set null,
  name            text not null,
  email           text not null unique,
  phone           text,
  country         text,                              -- ISO 3166-1 alpha-2
  tier            text not null default 'silver' check (tier in ('silver','gold','platinum')),
  points          integer not null default 0,
  lifetime_nights integer not null default 0,
  joined_date     date not null default current_date,
  id_type         text,                              -- 'cpr' / 'passport' / null
  id_number       text,
  id_expiry       date,
  verified        boolean not null default false,
  photo_url       text,
  id_doc_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_members_email on public.members (lower(email));
create index if not exists idx_members_tier  on public.members (tier);

-- ── 5. Bookings (reservations — the heart of the system) ─────────────────
create table if not exists public.bookings (
  id              uuid primary key default uuid_generate_v4(),
  reference       text not null unique,              -- "LS-2026-04-1234" — guest-facing code
  member_id       text references public.members(id) on delete set null,
  -- Guest details (also captured on direct/anon bookings — denormalised so
  -- a deleted member doesn't lose the historical contact info)
  guest_name      text not null,
  guest_email     text not null,
  guest_phone     text,
  guest_country   text,
  -- Stay
  check_in        date not null,
  check_out       date not null,
  nights          integer generated always as (check_out - check_in) stored,
  adults          integer not null check (adults >= 1),
  children        integer not null default 0 check (children >= 0),
  -- Suite selection — array of { roomId, qty, extraBeds } objects
  rooms           jsonb not null default '[]'::jsonb,
  -- Selected add-ons — array of { id, title, price } objects (snapshot so
  -- price changes after booking don't retroactively change the folio)
  extras          jsonb not null default '[]'::jsonb,
  -- Package / offer
  offer_id        text references public.packages(id) on delete set null,
  offer_title     text,
  offer_saving    numeric(10,3) not null default 0,
  -- Pricing
  room_total      numeric(10,3) not null default 0,
  extras_total    numeric(10,3) not null default 0,
  member_discount_pct numeric(5,2) not null default 0,
  member_discount numeric(10,3) not null default 0,
  pay_now_discount_pct numeric(5,2) not null default 0,
  pay_now_discount    numeric(10,3) not null default 0,
  tax             numeric(10,3) not null default 0,
  total           numeric(10,3) not null,
  currency        text not null default 'BHD',
  -- Status
  status          text not null default 'confirmed' check (status in ('confirmed','cancelled','no-show','completed')),
  payment_status  text not null check (payment_status in ('paid','deposit','pending','refunded')),
  payment_timing  text not null check (payment_timing in ('now','later')),
  guaranteed      boolean not null default false,
  guarantee_mode  text check (guarantee_mode in ('card','none')),
  hold_until      timestamptz,                       -- 15:00 of arrival day for non-guaranteed
  card_on_file    jsonb,                             -- { last4, brand, holder, captured_at, expires_at }
  non_refundable  boolean not null default false,
  channel         text not null default 'direct',    -- 'direct' / 'booking.com' / 'expedia' / etc.
  notes           text,
  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  cancellation_reason text,
  -- Constraints
  constraint chk_dates check (check_out > check_in)
);
create index if not exists idx_bookings_check_in     on public.bookings (check_in);
create index if not exists idx_bookings_member       on public.bookings (member_id) where member_id is not null;
create index if not exists idx_bookings_status       on public.bookings (status);
create index if not exists idx_bookings_email_lower  on public.bookings (lower(guest_email));

-- ── 6. Payments (folio activity) ──────────────────────────────────────────
create table if not exists public.payments (
  id              uuid primary key default uuid_generate_v4(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  kind            text not null check (kind in ('charge','refund','deposit','settlement')),
  method          text,                              -- 'card' / 'benefit-pay' / 'cash' / 'transfer'
  amount          numeric(10,3) not null,
  currency        text not null default 'BHD',
  reference       text,                              -- gateway txn id
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_payments_booking on public.payments (booking_id);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at trigger — auto-bumps on any row update
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

do $$ declare t text; begin
  for t in select unnest(array['rooms','packages','extras','members','bookings']) loop
    execute format('drop trigger if exists trg_%I_touch on public.%I', t, t);
    execute format('create trigger trg_%I_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Row-Level Security — STARTER policies. Tighten before going live.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.rooms     enable row level security;
alter table public.packages  enable row level security;
alter table public.extras    enable row level security;
alter table public.members   enable row level security;
alter table public.bookings  enable row level security;
alter table public.payments  enable row level security;

-- Public catalog reads — the homepage needs these without auth.
create policy "rooms_public_read"     on public.rooms     for select using (is_active = true);
create policy "packages_public_read"  on public.packages  for select using (is_active = true);
create policy "extras_public_read"    on public.extras    for select using (is_active = true);

-- Catalog writes — authenticated staff only. The "staff" gate today is
-- "any authenticated user"; replace with a `role = 'staff'` check once
-- the staff table is migrated in Phase 2.
create policy "rooms_staff_write"     on public.rooms     for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "packages_staff_write"  on public.packages  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "extras_staff_write"    on public.extras    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Members can read / update their own row; staff (any auth) can read all.
create policy "members_self_read"     on public.members   for select using (auth_user_id = auth.uid() or auth.role() = 'authenticated');
create policy "members_self_update"   on public.members   for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "members_staff_insert"  on public.members   for insert with check (auth.role() = 'authenticated');

-- Bookings — the most sensitive. A guest can read their own bookings via
-- the member link; staff can do anything.
create policy "bookings_self_read"
  on public.bookings for select
  using (
    auth.role() = 'authenticated'
    or (member_id is not null and member_id in (select id from public.members where auth_user_id = auth.uid()))
  );
create policy "bookings_anon_insert"
  on public.bookings for insert
  with check (true);                                 -- direct bookings can be created without auth
create policy "bookings_staff_update"
  on public.bookings for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Payments — staff only.
create policy "payments_staff_all"
  on public.payments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────
-- Seed data — minimal so the app doesn't render an empty catalog before
-- the operator opens Admin → Rooms / Offers and tunes pricing.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.rooms (id, sqm, occupancy, max_adults, max_children, price, popular, extra_bed_available, max_extra_beds, extra_bed_fee, extra_bed_adds, display_order)
values
  ('studio',     43,  2, 2, 1, 38.000, false, false, 0, 0,      '{"adults":0,"children":0}'::jsonb, 1),
  ('one-bed',    60,  3, 2, 2, 44.000, true,  true,  1, 15.000, '{"adults":1,"children":0}'::jsonb, 2),
  ('two-bed',   140,  5, 4, 3, 78.000, false, true,  1, 18.000, '{"adults":1,"children":0}'::jsonb, 3),
  ('three-bed', 150,  6, 4, 4, 96.000, false, true,  2, 18.000, '{"adults":1,"children":0}'::jsonb, 4)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- Done. Verify with:
--   select count(*) from public.rooms;          -- 4
--   select id, name from pg_policies where schemaname = 'public';
-- ─────────────────────────────────────────────────────────────────────────
