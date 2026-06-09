-- 026 — Partner loyalty: let the partner-facing portal read tier definitions
-- ============================================================================
-- Phase 2 of the B2B partner-loyalty feature shows corporate accounts and
-- travel agencies their tier, points, and benefits inside their own portal.
--
-- The per-account points/tier live on the agreements/agencies rows, which a
-- logged-in partner can already SELECT for their OWN account (scoped RLS,
-- migration 024). But the tier DEFINITIONS + economy live in three singletons
-- that are currently staff-only:
--     corporate_tiers · agency_tiers · partner_loyalty
-- so the portal cannot render tier names / benefits / redemption rate.
--
-- These three keys hold non-sensitive configuration (tier names, qualification
-- thresholds, benefit labels, points-to-BHD rate, gift-card brand list) — the
-- same posture as the member `tiers`/`loyalty` singletons, which are already
-- public-read. Add them to the public-read allowlist. No sensitive data is
-- exposed: account balances stay on the staff-only agreements/agencies tables.
--
-- Idempotent: drops + recreates the existing policy with the expanded list.
-- ============================================================================

drop policy if exists "singletons_public_read" on public.singletons;

create policy "singletons_public_read" on public.singletons for select
  using (key in (
    'hotel_info', 'site_content', 'loyalty', 'tiers', 'tax', 'active_tax_pattern',
    'corporate_tiers', 'agency_tiers', 'partner_loyalty'
  ));
