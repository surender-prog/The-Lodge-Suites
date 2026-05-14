-- 008_gift_card_tiers.sql
-- Persistence for the admin-editable gift-card tier master. The six
-- preset bundles (5n/10n/15n/20n/25n/30n) seed defaults in code and
-- this table stores the operator's edits — discount %, label, hint,
-- active toggle. Public Gift Vouchers + admin Issue card flow both
-- read the live tier list off the giftCardTiers slice, so changes
-- here flow through immediately.

create table if not exists public.gift_card_tiers (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_gift_card_tiers_touch on public.gift_card_tiers;
create trigger trg_gift_card_tiers_touch
  before update on public.gift_card_tiers
  for each row execute function public.touch_updated_at_phase2();

alter table public.gift_card_tiers enable row level security;

drop policy if exists "Staff full access" on public.gift_card_tiers;
create policy "Staff full access" on public.gift_card_tiers
  for all
  to authenticated
  using (true)
  with check (true);

-- Anon can READ — the public Gift Vouchers page needs the tier list
-- to render the picker. Anon CANNOT write — only staff edit the
-- master.
drop policy if exists "Anon can read tiers" on public.gift_card_tiers;
create policy "Anon can read tiers" on public.gift_card_tiers
  for select
  to anon
  using (true);
