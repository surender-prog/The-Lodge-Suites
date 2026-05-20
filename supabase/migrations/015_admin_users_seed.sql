-- 015_admin_users_seed.sql
-- Ensures public.admin_users is populated with the canonical 13 demo
-- staff records so the operator demo-login screen has rows to read.
--
-- WHY THIS EXISTS
-- ---------------
-- The Partner Portal sign-in screen renders the "Demo accounts" tiles
-- by reading useData().adminUsers — which is React state seeded from
-- the JS-level SAMPLE_ADMIN_USERS array, then optionally overridden by
-- a Supabase fetch.
--
-- If admin_users is empty in DB AND the visitor is anon (no staff
-- session yet), the fetch returns zero rows and the React state stays
-- on the JS seed. That means an owner who renames Rahul → Karunakar
-- in the admin UI persists the change to DB correctly, but the public
-- login screen keeps showing Rahul because the anon fetch finds an
-- empty table (or a table that never received the owner's edits).
--
-- This migration eliminates the empty-table failure mode by seeding
-- every row from the canonical SAMPLE_ADMIN_USERS list. It pairs with
-- 012_admin_users_realtime.sql (which opens anon SELECT and realtime
-- broadcasts) — both must be applied for the live-update workflow to
-- function end-to-end.
--
-- IDEMPOTENCY
-- -----------
-- ON CONFLICT (id) DO NOTHING — if an admin already exists with the
-- given id, the seed leaves it alone. So a re-run of this migration
-- WILL NOT overwrite the owner's edits. To re-seed a row to its
-- canonical state, delete the row first or update it manually.
--
-- KEEPING THIS IN SYNC
-- --------------------
-- The shape of each `data` JSONB blob mirrors SAMPLE_ADMIN_USERS in
-- src/data/store.jsx. When you change permissions, roles, or seed
-- accounts in JS, also update this file so fresh installs match. The
-- React hydration path will reconcile any drift by treating the DB
-- as the source of truth.

insert into public.admin_users (id, data) values
  -- ADM-001 · FOM
  ('ADM-001', '{
    "id":"ADM-001","name":"Aparajeet Mathad","email":"fom@thelodgesuites.com",
    "phone":"+973 3322 1100","title":"Front Office Manager","role":"fom",
    "permissions":["dashboard","calendar","bookings","stopsale","rooms","offers","extras","members","emails","maintenance","card_vault_view"],
    "status":"active","mfa":true,"lastLogin":"2026-05-04T08:42:00",
    "avatarColor":"#2563EB","password":"Lodge2026!","createdAt":"2024-09-15",
    "notes":"Owns the front desk roster and OTA distribution."
  }'::jsonb),

  -- ADM-002 · GM
  ('ADM-002', '{
    "id":"ADM-002","name":"Rahul Sharma","email":"gm@thelodgesuites.com",
    "phone":"+973 3911 4242","title":"General Manager","role":"gm",
    "permissions":["dashboard","calendar","bookings","stopsale","rooms","offers","extras","maintenance","corporates","agents","rfps","members","invoices","payments","tax","card_vault_view","emails","siteContent"],
    "status":"active","mfa":true,"lastLogin":"2026-05-03T19:11:00",
    "avatarColor":"#0F766E","password":"GM-Manama-2026","createdAt":"2024-08-01",
    "notes":"Property GM. Final approver for waivers above BHD 500."
  }'::jsonb),

  -- ADM-003 · Reservations
  ('ADM-003', '{
    "id":"ADM-003","name":"Maryam Al-Doseri","email":"reservations@thelodgesuites.com",
    "phone":"+973 3777 8090","title":"Reservations Lead","role":"reservations",
    "permissions":["dashboard","calendar","bookings","members"],
    "status":"active","mfa":false,"lastLogin":"2026-05-04T07:05:00",
    "avatarColor":"#0891B2","password":"Reserve-2026","createdAt":"2025-01-20",
    "notes":"Day shift reservations agent, closes ledger nightly."
  }'::jsonb),

  -- ADM-004 · Accounts
  ('ADM-004', '{
    "id":"ADM-004","name":"Hassan Al-Mahroos","email":"accounts@thelodgesuites.com",
    "phone":"+973 3601 2244","title":"Senior Accountant","role":"accounts",
    "permissions":["dashboard","invoices","payments","tax","corporates","agents","card_vault_view"],
    "status":"active","mfa":true,"lastLogin":"2026-05-02T16:28:00",
    "avatarColor":"#BE123C","password":"Folio-Closing-99","createdAt":"2024-10-10",
    "notes":"Issues partner invoices on the 1st and 15th."
  }'::jsonb),

  -- ADM-005 · Marketing
  ('ADM-005', '{
    "id":"ADM-005","name":"Lina Al-Sabah","email":"marketing@thelodgesuites.com",
    "phone":"+973 3499 5511","title":"Marketing Manager","role":"marketing",
    "permissions":["dashboard","offers","emails","members"],
    "status":"active","mfa":false,"lastLogin":"2026-05-04T09:32:00",
    "avatarColor":"#C9A961","password":"BrandStudio-7","createdAt":"2025-03-04",
    "notes":"Owns LS Privilege comms and seasonal offers."
  }'::jsonb),

  -- ADM-006 · Sales
  ('ADM-006', '{
    "id":"ADM-006","name":"Khalid Mansoor","email":"sales@thelodgesuites.com",
    "phone":"+973 3812 9080","title":"B2B Sales Director","role":"sales",
    "permissions":["dashboard","corporates","agents","rfps","emails"],
    "status":"active","mfa":true,"lastLogin":"2026-05-04T10:14:00",
    "avatarColor":"#D97706","password":"Pipeline-Q2-2026","createdAt":"2024-11-22",
    "notes":"BAPCO + GFH + airline crew accounts."
  }'::jsonb),

  -- ADM-007 · Owner (full permissions; expanded explicitly for clarity)
  ('ADM-007', '{
    "id":"ADM-007","name":"Surender Singh","email":"surender@exploremena.com",
    "phone":"+973 3300 0001","title":"Owner","role":"owner",
    "permissions":["dashboard","calendar","bookings","bookings_delete","stopsale","rooms","offers","extras","maintenance","corporates","agents","rfps","members","invoices","payments","tax","card_vault_view","emails","siteContent","admin_users"],
    "status":"active","mfa":true,"lastLogin":"2026-05-04T11:00:00",
    "avatarColor":"#7C3AED","password":"Owner-Master","createdAt":"2024-06-01",
    "notes":"Property owner. Full administrative override."
  }'::jsonb),

  -- ADM-008 · Read-only (suspended)
  ('ADM-008', '{
    "id":"ADM-008","name":"Yousef Al-Khalifa","email":"audit@thelodgesuites.com",
    "phone":"+973 3700 0099","title":"Audit (read-only)","role":"readonly",
    "permissions":["dashboard"],
    "status":"suspended","mfa":false,"lastLogin":"2026-03-12T14:00:00",
    "avatarColor":"#64748B","password":"Audit-2026","createdAt":"2025-06-15",
    "notes":"External auditor. Reactivate during quarterly review."
  }'::jsonb),

  -- ADM-009 · Housekeeping Supervisor
  ('ADM-009', '{
    "id":"ADM-009","name":"Salma Al-Sayed","email":"housekeeping@thelodgesuites.com",
    "phone":"+973 3811 5566","title":"Housekeeping Supervisor","role":"housekeeping",
    "permissions":["dashboard","calendar","rooms","maintenance"],
    "status":"active","mfa":false,"lastLogin":"2026-05-06T07:15:00",
    "avatarColor":"#0D9488","password":"Housekeeping-2026","createdAt":"2025-02-12",
    "notes":"Owns daily room turnovers and dispatches maintenance jobs to vendors."
  }'::jsonb),

  -- ADM-010 · Maintenance Technician
  ('ADM-010', '{
    "id":"ADM-010","name":"Anil Kumar","email":"maintenance@thelodgesuites.com",
    "phone":"+973 3422 9090","title":"Maintenance Technician","role":"housekeeping",
    "permissions":["dashboard","calendar","rooms","maintenance"],
    "status":"active","mfa":false,"lastLogin":"2026-05-06T08:30:00",
    "avatarColor":"#0D9488","password":"Housekeeping-2026","createdAt":"2025-04-08",
    "notes":"On-call for in-house fixes before escalating to external vendors."
  }'::jsonb),

  -- ADM-UAT-1 · UAT Tester (Operations)
  ('ADM-UAT-1', '{
    "id":"ADM-UAT-1","name":"UAT Tester 1","email":"uat1@thelodgesuites.com",
    "phone":"+973 3500 0001","title":"UAT Tester · Operations","role":"gm",
    "permissions":["dashboard","calendar","bookings","stopsale","rooms","offers","extras","maintenance","corporates","agents","rfps","members","invoices","payments","tax","card_vault_view","emails","siteContent"],
    "status":"active","mfa":false,"lastLogin":null,
    "avatarColor":"#475569","password":"Test-Lodge-2026","createdAt":"2026-05-13",
    "notes":"Dedicated UAT login. Use for Phase 1-4 (Property · Rates · Public site · Partner portal).",
    "isUatTester":true
  }'::jsonb),

  -- ADM-UAT-2 · UAT Tester (Finance)
  ('ADM-UAT-2', '{
    "id":"ADM-UAT-2","name":"UAT Tester 2","email":"uat2@thelodgesuites.com",
    "phone":"+973 3500 0002","title":"UAT Tester · Finance","role":"gm",
    "permissions":["dashboard","calendar","bookings","stopsale","rooms","offers","extras","maintenance","corporates","agents","rfps","members","invoices","payments","tax","card_vault_view","emails","siteContent"],
    "status":"active","mfa":false,"lastLogin":null,
    "avatarColor":"#475569","password":"Test-Lodge-2026","createdAt":"2026-05-13",
    "notes":"Dedicated UAT login. Use for Phase 5-7 (Loyalty · Bookings · Invoices · Channels).",
    "isUatTester":true
  }'::jsonb),

  -- ADM-UAT-3 · UAT Tester (Admin)
  ('ADM-UAT-3', '{
    "id":"ADM-UAT-3","name":"UAT Tester 3","email":"uat3@thelodgesuites.com",
    "phone":"+973 3500 0003","title":"UAT Tester · Admin","role":"gm",
    "permissions":["dashboard","calendar","bookings","stopsale","rooms","offers","extras","maintenance","corporates","agents","rfps","members","invoices","payments","tax","card_vault_view","emails","siteContent"],
    "status":"active","mfa":false,"lastLogin":null,
    "avatarColor":"#475569","password":"Test-Lodge-2026","createdAt":"2026-05-13",
    "notes":"Dedicated UAT login. Use for Phase 8-10 + integration tests (Reports · Staff · CMS · End-to-end).",
    "isUatTester":true
  }'::jsonb)
on conflict (id) do nothing;
