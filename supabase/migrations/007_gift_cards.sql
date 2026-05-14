-- 007_gift_cards.sql
-- Persistence for the advance-purchase Gift Cards feature.
-- Mirrors the JSONB-per-entity pattern used by every other Phase 2 table:
--   id text primary key, data jsonb, created_at/updated_at timestamps.
-- The application slice `giftCards` reads/writes this via the generic
-- `useSlicePersistence("gift_cards", …)` hook.

create table if not exists public.gift_cards (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Re-use the shared touch_updated_at_phase2 trigger function defined in
-- migration 002. Idempotent — safe to recreate.
drop trigger if exists trg_gift_cards_touch on public.gift_cards;
create trigger trg_gift_cards_touch
  before update on public.gift_cards
  for each row execute function public.touch_updated_at_phase2();

-- RLS posture
--   • Authenticated staff: full read/write (manage from Admin → Gift Cards).
--   • Anon clients: write-only insert (the public Gift Vouchers composer
--     creates a new card record at the end of the purchase flow). They
--     cannot read or update existing cards — only staff redeem.
alter table public.gift_cards enable row level security;

drop policy if exists "Staff full access" on public.gift_cards;
create policy "Staff full access" on public.gift_cards
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Anon can purchase" on public.gift_cards;
create policy "Anon can purchase" on public.gift_cards
  for insert
  to anon
  with check (true);
