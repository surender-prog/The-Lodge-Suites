-- 025_auth_fix_reserved_role_claim.sql
-- ─────────────────────────────────────────────────────────────────────────
-- AUTH FIX — stop minting a top-level `role` claim in the access token.
-- ─────────────────────────────────────────────────────────────────────────
-- The hook from 022 (carried into 024) added `role` at the TOP LEVEL of the
-- JWT claims, set to the portal sub-user role (e.g. "primary"/"booker"). But
-- `role` is a RESERVED claim: PostgREST reads it to SET ROLE for the request.
-- A value like "primary" makes every query fail with:
--     role "primary" does not exist
-- Members were unaffected (their role is null → stripped), but EVERY corporate
-- and agent data query broke.
--
-- Fix: keep the sub-user role only in the NESTED `portal.role` claim (which RLS
-- and the app can read freely); never overwrite the top-level `role`. No RLS
-- policy references a top-level role claim, so this changes nothing else.
--
-- Supersedes the hook body in 022/024. Idempotent (create or replace).
-- After applying: corporate/agent users must re-login (or wait for token
-- refresh) to get a corrected token.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = public
as $$
declare
  v_uid    uuid := (event->>'user_id')::uuid;
  v_claims jsonb := coalesce(event->'claims','{}'::jsonb);
  v_email  text := lower(coalesce(event->'claims'->>'email',''));
  v_pi     public.portal_identities%rowtype;
begin
  select * into v_pi from public.portal_identities where auth_user_id = v_uid;
  if found then
    -- Nested portal object — safe place for the sub-user role.
    v_claims := v_claims || jsonb_strip_nulls(jsonb_build_object(
      'portal', jsonb_build_object(
        'kind', v_pi.kind, 'memberId', v_pi.member_id,
        'accountId', v_pi.account_id, 'role', v_pi.role, 'status', v_pi.status)));
    -- Top-level mirror for cheap RLS reads. Deliberately EXCLUDES `role`:
    -- it is reserved by PostgREST (SET ROLE) and a portal role value breaks
    -- every query. RLS uses kind / account_id / member_id only.
    v_claims := v_claims || jsonb_strip_nulls(jsonb_build_object(
      'kind', v_pi.kind, 'account_id', v_pi.account_id, 'member_id', v_pi.member_id));
  end if;
  -- Staff marker (unchanged).
  if v_email <> '' and public.is_staff_email(v_email) then
    v_claims := v_claims || jsonb_build_object('is_staff', true);
  end if;
  return jsonb_build_object('claims', v_claims);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify after applying (corporate/agent must re-login first):
--   • a corporate user's data queries succeed (no "role ... does not exist").
--   • the JWT no longer has a top-level "role"; portal.role still present.
-- ─────────────────────────────────────────────────────────────────────────
