-- 027 — Partner self-registration: anon INSERT of pending accounts only
-- ============================================================================
-- The portal sign-in screen now lets a new corporate account / travel agency
-- register itself. The client writes ONE row per registration (mirroring the
-- LS Privilege join form's members_anon_insert), but agreements/agencies are
-- staff-write-only under migration 024 — so anon registrations need a narrow
-- INSERT policy.
--
-- Safety:
--   • INSERT only, and ONLY when the row's status is 'pending-approval' —
--     an anonymous visitor cannot create an active account, and (with no
--     anon UPDATE policy) cannot modify ANY existing row, including their
--     own registration. Upserts against an existing id fall through to the
--     UPDATE branch and are denied.
--   • EMAIL-HIJACK GUARD: the migration-022 trigger mirrors users[] into
--     auth.users and UPDATES the password when the email already exists.
--     Without a guard, an anonymous registration carrying someone else's
--     email could overwrite that user's password. The policy therefore
--     rejects any registration whose users[] contains an email that already
--     exists in auth.users (staff, members, or partner users alike).
--   • Activation stays staff-only: an admin flips the status to 'active'
--     from the Corporate Accounts / Travel Agents tab ("Activate"), covered
--     by the existing *_staff_all policies.
--   • Portal sign-in is gated on the status client-side; a pending account
--     also has no rates, bookings, or invoices to read.
--
-- Idempotent.
-- ============================================================================

-- True when none of the registration's portal users collide with an existing
-- auth identity. Security definer so the anon role can consult auth.users.
create or replace function public.partner_registration_email_available(p_data jsonb)
returns boolean language plpgsql security definer stable
set search_path = public, auth
as $$
declare
  v_elem jsonb; v_email text;
begin
  if not (p_data ? 'users') or jsonb_typeof(p_data->'users') <> 'array' then
    return true;
  end if;
  for v_elem in select * from jsonb_array_elements(p_data->'users') loop
    v_email := lower(coalesce(v_elem->>'email',''));
    if v_email <> '' and exists (select 1 from auth.users u where lower(u.email) = v_email) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.partner_registration_email_available(jsonb) from public;
grant execute on function public.partner_registration_email_available(jsonb) to anon, authenticated;

drop policy if exists "agreements_anon_register" on public.agreements;
create policy "agreements_anon_register" on public.agreements for insert to anon
  with check (
    (data->>'status') = 'pending-approval'
    and public.partner_registration_email_available(data)
  );

drop policy if exists "agencies_anon_register" on public.agencies;
create policy "agencies_anon_register" on public.agencies for insert to anon
  with check (
    (data->>'status') = 'pending-approval'
    and public.partner_registration_email_available(data)
  );
