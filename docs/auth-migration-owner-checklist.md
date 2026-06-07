# Real Guest Auth — Owner Action Checklist

Real Supabase guest auth is **fully built and tested**, shipped behind a flag
that is **OFF** (`VITE_REAL_GUEST_AUTH`). Nothing in production changes until you
apply migration 024 and flip the flag.

Project ref: `tbmmmsldanxhgfmyoamy` · Dashboard: https://supabase.com/dashboard

---

## ✅ Done (verified)
- **Migration 021** (Phase 0 credential lockdown) — applied & live; password
  preserve/anon-block triggers verified.
- **Migration 022** (portal_identities + access-token hook) — applied & verified.
- **Migration 023** (universal member OTP) — applied & verified (all members
  OTP-capable: member 5 / corporate 5 / agent 3 identities).
- **Custom Access Token hook** — enabled (claims confirmed present in the JWT).
- **Email OTP provider** — enabled.
- **Auth SMTP + `{{ .Token }}` template** — configured; a real 6-digit code was
  delivered and verified.
- **End-to-end auth tested** against live Supabase:
  - Corporate password login → corporate portal ✓
  - Agent password login → agent portal ✓
  - Member email OTP (real email → real code → verify) → member portal ✓
- **Phase 1/2 client code** — shipped, dormant behind the flag.
- **Phase 4 scoped RLS** (migration 024 + rollback) — written, NOT yet applied.
- **Capacitor mobile foundation** — done (see `CAPACITOR.md`).

---

## ⬜ Remaining to go live (the real to-do)

### A. Verify URL config (quick)
Dashboard → **Authentication → URL Configuration**:
- **Site URL** should be your production domain `https://www.thelodgesuites.com`
  (not `localhost`) — it's the default link target in auth emails.
- **Redirect URLs** should include: production, your Vercel staging/preview URL,
  and `http://localhost:5180` (for local testing).
*(Only matters for the password-reset link; member OTP doesn't use redirects.)*

### B. ★ Apply Phase 4 scoped RLS + flip the flag (do in one sitting)
This is the **security gate** — without it a logged-in guest could read other
accounts' data over the API. Keep `024_rollback_scoped_rls.sql` open in a tab.

1. Run `supabase/migrations/024_auth_phase4_scoped_rls.sql` in the SQL Editor.
2. **⚠️ Immediately SIGN OUT and SIGN IN again in the operator portal.** The new
   hook stamps `is_staff` only on *fresh* tokens — your open staff session has an
   old token and will see empty data until you re-login. **Re-login fixes it.**
3. **Operator smoke test** (as staff): every section still shows data — bookings,
   members, invoices, agreements, agencies, payments, etc. If anything is empty →
   run the rollback and tell me.
4. **Flip `VITE_REAL_GUEST_AUTH=true` on staging** (Vercel preview env var and/or
   `.env.local`) → rebuild → test the guest side:
   - Member (OTP) → sees only **their** bookings/invoices/receipts.
   - Corporate/agent → sees only **their** account's data.
   - Decisive: in the browser console as a logged-in member,
     `await supabase.from('bookings').select('*')` returns **only their rows**.
5. All green on staging → flip the flag in **production**.

**Rollback:** if the operator portal breaks, run
`supabase/migrations/024_rollback_scoped_rls.sql` (restores the old policies +
reverts the hook) and keep the flag OFF.

**Known trade-offs (by design):**
- Member bookings match by `memberId` or `email` (not fuzzy guest name) — a few
  legacy bookings with neither won't show until re-stamped. Only ever hides,
  never over-shows.
- Corporate/agent **sub-user password changes** via the old JSONB path stop
  working — route them through Supabase password reset. Member profile edits keep
  working (guarded so tier/points can't be self-edited).
- **Watch the console** when a member creates a booking on staging: if you see
  noisy failed bulk-writes, tell me and I'll gate the persistence layer to
  staff-only (small client follow-up).

### C. Flag-OFF regression check (before/while testing)
- Staff login works · legacy guest login works · reload returns to login.
  *(With the flag OFF nothing should change vs today.)*

---

## ⬜ Later (not blocking web launch)

### Phone OTP — SMS provider
Dashboard → **Authentication → Providers → Phone** → Twilio / MessageBird with a
**+973 sender-ID** (GCC approval takes weeks — start early). The phone-OTP code
exists but is inert; turning it on needs a small follow-up UI change.

### Mobile app (Capacitor) — see `CAPACITOR.md`
1. On a Mac: `npx cap add ios` + `npx cap add android`, then
   `npm run cap:ios` / `npm run cap:android`.
2. **Apple Developer Program** ($99/yr) + **Google Play** ($25) — start now (lead
   times). Apple Sign In is mandatory on iOS if Google login is offered.
3. Do NOT submit to stores until web auth is live (step B done).
4. Production hardening: swap session storage to a Keychain/Keystore plugin;
   add Google/Apple OAuth deep links + biometric unlock.

### Cleanup (after the flag is live + legacy login retired)
- Blank the seed passwords still in the JS bundle (`store.jsx`) — safe only once
  no code path reads them.
- Tighten the broad `authenticated` reads anywhere still permissive.

---

## Go / no-go for production
All flag-OFF behavior unchanged · migration 024 applied · operator portal intact
after staff re-login · member/corporate/agent scoping verified on staging ·
rollback tested-and-ready.
