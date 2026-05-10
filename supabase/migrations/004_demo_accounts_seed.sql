-- ─────────────────────────────────────────────────────────────────────────
-- Seed: demo accounts for the Guest / Partner Portal
-- ─────────────────────────────────────────────────────────────────────────
-- The Guest Portal sign-in page surfaces six demo tiles that auto-fill the
-- form with the credentials below. This migration seeds:
--   • The matching DB records (agreements / agencies / members) so reload
--     doesn't lose them
--   • Auth-side users in `auth.users` so the same email + password also
--     authenticates against Supabase Auth (yields a real JWT for RLS).
--
-- These passwords are intentionally non-secret — they're documented in
-- the GuestPortal's "DEMO ACCOUNTS" panel for everyone to see. Replace
-- them with hardened values before going live.
--
-- Idempotent: re-running this migration does not duplicate accounts.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Domain records (agreements / agencies / members) ──────────────────

-- BAPCO (corporate)
insert into public.agreements (id, data) values (
  'AGR-2026-001',
  '{"id":"AGR-2026-001","account":"BAPCO","industry":"Oil & Gas","signedOn":"2025-12-15","startsOn":"2026-01-01","endsOn":"2026-12-31","status":"active","dailyRates":{"studio":32,"oneBed":45,"twoBed":75,"threeBed":92},"monthlyRates":{"studio":720,"oneBed":1015,"twoBed":1690,"threeBed":2070},"weekendUpliftPct":0,"taxIncluded":false,"inclusions":{"breakfast":true,"lateCheckOut":true,"parking":true,"wifi":true,"meetingRoom":false},"cancellationPolicy":"Free cancellation up to 48h before arrival.","paymentTerms":"Net 30","creditLimit":10000,"pocName":"Sara Al-Hammadi","pocEmail":"sara.h@bapco.com.bh","pocPhone":"+973 1775 1234","notes":"Long-stay engineer rotations · always allocate top floors.","targetNights":600,"ytdNights":412,"ytdSpend":18420,"users":[{"id":"U-BAPCO-1","name":"Sara Al-Hammadi","email":"sara.h@bapco.com.bh","phone":"+973 1775 1234","role":"primary","password":"LodgeStay-2026","primary":true},{"id":"U-BAPCO-2","name":"Faisal Al-Otaibi","email":"f.otaibi@bapco.com.bh","phone":"+973 1775 1289","role":"booker","password":"LodgeStay-2026"},{"id":"U-BAPCO-3","name":"Hala Al-Mansoor","email":"h.mansoor@bapco.com.bh","phone":"+973 1775 1290","role":"billing","password":"LodgeStay-2026"}]}'::jsonb
) on conflict (id) do update set data = excluded.data;

-- GFH Financial Group (corporate)
insert into public.agreements (id, data) values (
  'AGR-2026-002',
  '{"id":"AGR-2026-002","account":"GFH Financial Group","industry":"Banking & Finance","signedOn":"2026-03-12","startsOn":"2026-04-01","endsOn":"2027-03-31","status":"active","dailyRates":{"studio":35,"oneBed":48,"twoBed":79,"threeBed":95},"monthlyRates":{"studio":790,"oneBed":1080,"twoBed":1780,"threeBed":2140},"weekendUpliftPct":0,"taxIncluded":true,"inclusions":{"breakfast":true,"lateCheckOut":false,"parking":true,"wifi":true,"meetingRoom":true},"cancellationPolicy":"Free cancellation up to 7 days before arrival.","paymentTerms":"Net 30","creditLimit":25000,"pocName":"Yusuf Al-Mannai","pocEmail":"y.mannai@gfh.com","pocPhone":"+973 1753 0000","notes":"Inclusive of 10% VAT and tourism levy. Direct billing.","targetNights":800,"ytdNights":540,"ytdSpend":24650,"users":[{"id":"U-GFH-1","name":"Yusuf Al-Mannai","email":"y.mannai@gfh.com","phone":"+973 1753 0000","role":"primary","password":"LodgeStay-2026","primary":true},{"id":"U-GFH-2","name":"Nadia Al-Sabah","email":"n.sabah@gfh.com","phone":"+973 1753 0011","role":"booker","password":"LodgeStay-2026"}]}'::jsonb
) on conflict (id) do update set data = excluded.data;

-- Globepass Travel (agency)
insert into public.agencies (id, data) values (
  'AGT-0124',
  '{"id":"AGT-0124","name":"Globepass Travel","contact":"ops@globepass.bh","signedOn":"2025-12-01","startsOn":"2026-01-01","endsOn":"2026-12-31","status":"active","commissionPct":10,"marketingFundPct":1.5,"dailyNet":{"studio":30,"oneBed":41,"twoBed":70,"threeBed":86},"monthlyNet":{"studio":675,"oneBed":920,"twoBed":1575,"threeBed":1935},"paymentTerms":"Net 30","creditLimit":8000,"pocName":"Reem Al-Mahmood","pocEmail":"reem@globepass.bh","pocPhone":"+973 1753 1100","notes":"Top producer · GCC inbound · loyalty matching enabled.","ytdBookings":28,"ytdRevenue":12480,"ytdCommission":1248,"targetBookings":36,"users":[{"id":"U-GLOBE-1","name":"Reem Al-Mahmood","email":"reem@globepass.bh","phone":"+973 1753 1100","role":"primary","password":"AgentLogin-2026","primary":true},{"id":"U-GLOBE-2","name":"Mariam Al-Saadi","email":"mariam@globepass.bh","phone":"+973 1753 1130","role":"reservations","password":"AgentLogin-2026"}]}'::jsonb
) on conflict (id) do update set data = excluded.data;

-- Cleartrip Bahrain (agency)
insert into public.agencies (id, data) values (
  'AGT-0211',
  '{"id":"AGT-0211","name":"Cleartrip Bahrain","contact":"wholesale@ct.bh","signedOn":"2025-11-18","startsOn":"2025-12-01","endsOn":"2026-11-30","status":"active","commissionPct":9,"marketingFundPct":1,"dailyNet":{"studio":31,"oneBed":42,"twoBed":71,"threeBed":87},"monthlyNet":{"studio":700,"oneBed":945,"twoBed":1600,"threeBed":1960},"paymentTerms":"Net 30","creditLimit":5000,"pocName":"Vikram Iyer","pocEmail":"v.iyer@cleartrip.com","pocPhone":"+973 1771 4400","notes":"Online retail volume · prepayment via merchant model.","ytdBookings":22,"ytdRevenue":9810,"ytdCommission":883,"targetBookings":30,"users":[{"id":"U-CT-1","name":"Vikram Iyer","email":"v.iyer@cleartrip.com","phone":"+973 1771 4400","role":"primary","password":"AgentLogin-2026","primary":true}]}'::jsonb
) on conflict (id) do update set data = excluded.data;

-- Layla Al-Khalifa (LS Privilege Gold)
insert into public.members (id, data) values (
  'LS-G-A1B2C3',
  '{"id":"LS-G-A1B2C3","name":"Layla Al-Khalifa","email":"l.alkhalifa@example.com","tier":"gold","points":2840,"lifetimeNights":18,"joined":"2025-08-12","phone":"+973 3300 1122","country":"Bahrain","idType":"cpr","idNumber":"880412345","idExpiry":"2030-04-12","verified":true,"photo":null,"idDoc":null,"password":"Member-2026"}'::jsonb
) on conflict (id) do update set data = excluded.data;

-- Sarah Holloway (LS Privilege Platinum)
insert into public.members (id, data) values (
  'LS-P-D4E5F6',
  '{"id":"LS-P-D4E5F6","name":"Sarah Holloway","email":"s.holloway@example.com","tier":"platinum","points":4920,"lifetimeNights":31,"joined":"2024-11-03","phone":"+44 7700 900123","country":"United Kingdom","idType":"passport","idNumber":"549012345","idExpiry":"2031-09-22","verified":true,"photo":null,"idDoc":null,"password":"Member-2026"}'::jsonb
) on conflict (id) do update set data = excluded.data;

-- ── 2. Auth-side users (auth.users + auth.identities) ────────────────────
-- Hashed via crypt(...) with bcrypt. Idempotent — skips emails that exist.

do $$
declare
  acct record;
  uid uuid;
begin
  for acct in
    select * from (values
      ('sara.h@bapco.com.bh',     'LodgeStay-2026',  '{"name":"Sara Al-Hammadi","kind":"corporate","accountId":"AGR-2026-001"}'::jsonb),
      ('y.mannai@gfh.com',        'LodgeStay-2026',  '{"name":"Yusuf Al-Mannai","kind":"corporate","accountId":"AGR-2026-002"}'::jsonb),
      ('reem@globepass.bh',       'AgentLogin-2026', '{"name":"Reem Al-Mahmood","kind":"agent","accountId":"AGT-0124"}'::jsonb),
      ('v.iyer@cleartrip.com',    'AgentLogin-2026', '{"name":"Vikram Iyer","kind":"agent","accountId":"AGT-0211"}'::jsonb),
      ('l.alkhalifa@example.com', 'Member-2026',     '{"name":"Layla Al-Khalifa","kind":"member","tier":"gold","memberId":"LS-G-A1B2C3"}'::jsonb),
      ('s.holloway@example.com',  'Member-2026',     '{"name":"Sarah Holloway","kind":"member","tier":"platinum","memberId":"LS-P-D4E5F6"}'::jsonb)
    ) as t(email, password, meta)
  loop
    if exists (select 1 from auth.users where email = acct.email) then
      continue;
    end if;
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid, uid,
      'authenticated', 'authenticated', acct.email,
      crypt(acct.password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      acct.meta,
      now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', acct.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify with:
--   select email, raw_user_meta_data->>'kind' as kind from auth.users order by created_at;
--   select id, data->>'name' from public.members order by id;
-- ─────────────────────────────────────────────────────────────────────────
