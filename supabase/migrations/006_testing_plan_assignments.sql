-- 006_testing_plan_assignments.sql
-- Persistence for the admin testing & training plan tracker.
-- Mirrors the JSONB-per-entity pattern used by every other Phase 2 table:
--   id text primary key, data jsonb, created_at/updated_at timestamps.
-- The application slice `testingPlanAssignments` reads/writes this via the
-- generic `useSlicePersistence("testing_plan_assignments", …)` hook.

create table if not exists public.testing_plan_assignments (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Re-use the shared touch_updated_at_phase2 trigger function defined in
-- migration 002. It's idempotent — recreating the trigger here is safe.
drop trigger if exists trg_testing_plan_assignments_touch on public.testing_plan_assignments;
create trigger trg_testing_plan_assignments_touch
  before update on public.testing_plan_assignments
  for each row execute function public.touch_updated_at_phase2();

-- RLS — same posture as the other admin-only entity tables: any
-- authenticated user (operator staff) can read + write. Anon clients
-- have no access.
alter table public.testing_plan_assignments enable row level security;

drop policy if exists "Staff full access" on public.testing_plan_assignments;
create policy "Staff full access" on public.testing_plan_assignments
  for all
  to authenticated
  using (true)
  with check (true);
