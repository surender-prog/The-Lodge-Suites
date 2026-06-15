-- 029 — Partner delete cleanup: free the login + identity on account delete
-- ============================================================================
-- The admin "Delete account" action removes an agreements / agencies row. This
-- trigger then cleans up the partner's portal access so nothing is orphaned:
--
--   • Always removes the portal_identities row for each of the account's users
--     (so the login can no longer reach any portal).
--   • Deletes the underlying auth.users login ONLY when that email isn't used
--     anywhere else — another agreement/agency, a member, or a staff
--     (admin_users) record. This frees the email for re-registration (fixing
--     the "email already exists" block after a delete) while never nuking a
--     login that's shared with a staff or member account.
--
-- Mirrors the existing member-delete cleanup (migration 022). Security definer
-- so it can touch auth.*; auth cleanup is wrapped so a hiccup there can never
-- block the actual account deletion. Idempotent.
-- ============================================================================

create or replace function public.cleanup_partner_on_delete()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_elem jsonb;
  v_email text;
  v_used_elsewhere boolean;
begin
  if not (old.data ? 'users') or jsonb_typeof(old.data->'users') <> 'array' then
    return old;
  end if;

  for v_elem in select * from jsonb_array_elements(old.data->'users') loop
    v_email := lower(coalesce(v_elem->>'email',''));
    if v_email = '' then continue; end if;

    begin
      -- Drop the portal identity for this login (loses portal access).
      delete from public.portal_identities pi
        using auth.users u
       where pi.auth_user_id = u.id and lower(u.email) = v_email;

      -- Is this email still referenced by any OTHER account / member / staff?
      select
           exists (select 1 from public.agreements a where a.id <> old.id
                     and exists (select 1 from jsonb_array_elements(coalesce(a.data->'users','[]'::jsonb)) e
                                 where lower(e->>'email') = v_email))
        or exists (select 1 from public.agencies a where a.id <> old.id
                     and exists (select 1 from jsonb_array_elements(coalesce(a.data->'users','[]'::jsonb)) e
                                 where lower(e->>'email') = v_email))
        or exists (select 1 from public.members m  where lower(m.data->>'email') = v_email)
        or exists (select 1 from public.admin_users s where lower(s.data->>'email') = v_email)
        into v_used_elsewhere;

      -- Free the login only when it's truly unused elsewhere.
      if not v_used_elsewhere then
        delete from auth.users where lower(email) = v_email;  -- cascades identities/sessions
      end if;
    exception when others then
      -- Never let auth cleanup block the account deletion.
      raise warning 'cleanup_partner_on_delete: % for %', sqlerrm, v_email;
    end;
  end loop;

  return old;
end;
$$;

drop trigger if exists agreements_cleanup_on_delete on public.agreements;
create trigger agreements_cleanup_on_delete
  after delete on public.agreements
  for each row execute function public.cleanup_partner_on_delete();

drop trigger if exists agencies_cleanup_on_delete on public.agencies;
create trigger agencies_cleanup_on_delete
  after delete on public.agencies
  for each row execute function public.cleanup_partner_on_delete();
