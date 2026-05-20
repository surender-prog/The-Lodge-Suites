-- 012_admin_users_realtime.sql
-- Promotes public.admin_users to a real-time, anon-readable slice so the
-- operator demo login tiles render for unauthenticated visitors AND every
-- INSERT / UPDATE / DELETE broadcasts to all connected browser sessions.
--
-- Two changes:
--   1. SELECT policy that lets the anon role read every row. This exposes
--      the demo passwords, which is intentional for the prototype — the
--      "Demo accounts" panel on the operator sign-in screen needs them
--      to auto-fill the form. Tighten later when you swap mock passwords
--      for real auth credentials.
--
--   2. Add admin_users to the `supabase_realtime` publication. Without
--      this Postgres records changes but the WebSocket layer doesn't
--      broadcast them — clients calling supabase.channel(...).on(
--      "postgres_changes", { table: "admin_users", ... }) would never
--      receive anything.
--
-- Both statements are idempotent: re-running the migration on a cluster
-- that already has the policy / publication entry is a no-op.

-- 1) Anon read access for the demo login screen.
drop policy if exists "admin_users_public_read" on public.admin_users;
create policy "admin_users_public_read"
  on public.admin_users for select
  using (true);

-- 2) Realtime broadcast. The publication ships with Supabase preset to
-- `for all tables` on a fresh project, but older projects (or any that
-- swapped the default for `for specific tables`) need the explicit add.
-- The `do $$ ... $$` block handles both cases without erroring out when
-- the table is already a member.
do $$
begin
  if exists (
    select 1
    from   pg_publication
    where  pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from   pg_publication_tables
    where  pubname    = 'supabase_realtime'
      and  schemaname = 'public'
      and  tablename  = 'admin_users'
  ) then
    execute 'alter publication supabase_realtime add table public.admin_users';
  end if;
exception
  when undefined_object then
    -- Project predates the named publication; safe to ignore.
    null;
  when duplicate_object then
    null;
end $$;

-- Set REPLICA IDENTITY FULL so DELETE events carry the previous row's
-- columns (Supabase's realtime payload uses old_record for deletes —
-- without FULL we get only the primary key, which is still enough for
-- the React listener but FULL keeps the data column available too if
-- a future enhancement wants to know "what was just deleted").
alter table public.admin_users replica identity full;
