# Real Guest Auth — Owner Action Checklist

The code for real Supabase guest auth is **already shipped, behind a flag that
is OFF** (`VITE_REAL_GUEST_AUTH`). Nothing in production changes until you
complete the steps below and flip the flag on staging. Do them **in order**.

Project ref: `tbmmmsldanxhgfmyoamy` · Dashboard: https://supabase.com/dashboard

---

## Status so far
- ✅ **Phase 0** (migration 021) — applied & live. Plaintext no longer leaks to
  the browser on the write side; password-preserving triggers verified working.
- ✅ **Phase 1/1b** (migrations 022, 023) — applied & verified. portal_identities
  populated; every member OTP-capable. Access token hook enabled.
- ✅ **Phase 1/2 code** — shipped, dormant behind the flag.
- ✅ **Auth tested end-to-end** — corporate/agent password login + member email
  OTP (real code) both verified against live Supabase.
- ✅ **Phase 4 scoped RLS** (migration 024) — written, awaiting apply (with the
  flag flip). See the dedicated section below.
- ⬜ **The remaining steps** — turn real auth on (flag) once Phase 4 is applied.

---

## ★ Phase 4 — scoped RLS (apply in lockstep with the flag flip)

This is the **security gate**: without it, a logged-in guest could read other
accounts' data over the API. Apply migration **024** right before flipping the
flag. Keep **`024_rollback_scoped_rls.sql`** open in another tab.

**Apply order (one sitting):**
1. **Re-login as staff first won't help yet — apply 024 first.** Run
   `supabase/migrations/024_auth_phase4_scoped_rls.sql` in the SQL Editor.
2. **⚠️ Immediately SIGN OUT and SIGN IN again in the operator portal.** The new
   hook stamps `is_staff` only on *fresh* tokens — your currently-open staff
   session has an old token without it and will see empty data until you
   re-login (or the token auto-refreshes within the hour). **Re-login fixes it.**
3. **Test the operator portal** (as staff): every section still shows data —
   bookings, members, invoices, agreements, agencies, payments, etc. If anything
   is empty → run the rollback and tell me.
4. **Flip `VITE_REAL_GUEST_AUTH=true`** on staging → test the guest side:
   - Member logs in (OTP) → sees only **their** bookings/invoices/receipts.
   - Corporate/agent logs in → sees only **their** account's data.
   - (Optional, decisive) In the browser console as a logged-in member, try to
     read another account: `await supabase.from('bookings').select('*')` should
     return **only their rows**, never everyone's.
5. If all green on staging → flip the flag in **production**.

**Known trade-offs (by design, flagged):**
- A member's bookings are matched by `memberId` or `email` (not fuzzy guest
  name) — a few legacy bookings with neither won't show until re-stamped. Only
  ever hides, never over-shows.
- Corporate/agent **sub-user password changes** via the old JSONB path stop
  working under scoped RLS — route them through Supabase password reset
  (`resetGuest`) instead. Member profile edits keep working (guarded so tier/
  points can't be self-edited).
- **Watch the console** when a member creates a booking on flag-on staging: the
  per-row write persists fine; if you see noisy failed bulk-writes, tell me and
  I'll gate the persistence layer to staff-only (a small client follow-up).

**Rollback:** if the operator portal breaks, run
`supabase/migrations/024_rollback_scoped_rls.sql` (restores the old permissive
policies + reverts the hook). Keep the flag OFF after a rollback.

---

## 0. Apply migrations 022 then 023  *(required first, in order)*

- **022** — `supabase/migrations/022_auth_phase1_portal_identities.sql` ✅ (applied)
- **023** — `supabase/migrations/023_auth_phase1_member_otp_provisioning.sql` —
  makes EVERY member email-OTP-capable (incl. password-less + future website
  signups). Run it the same way. After it, every member with an email has a
  `portal_identities` row (member count rises from 3 → all members).

## 1. (reference) Apply migration 022
Supabase Dashboard → **SQL Editor** → New query → paste the full contents of
`supabase/migrations/022_auth_phase1_portal_identities.sql` → **Run**.
Expect "Success. No rows returned."

**Verify:**
```sql
select kind, count(*) from public.portal_identities group by kind;
select count(*) from auth.users where raw_user_meta_data->>'kind' is not null;
```
You should see `corporate` + `agent` rows (and `member` rows for any member who
had a password). OTP-first members with no password produce **no row yet** —
that's correct; they get one on first login.

## 2. Enable the Custom Access Token hook  *(required)*
Dashboard → **Authentication → Hooks** → "Customize Access Token (JWT) Claims"
→ select `public.custom_access_token_hook` → save.
*Without this, every real-auth login signs the user straight back out* (no
`kind` claim in the JWT).

## 3. Enable Email OTP  *(required for members)*
Dashboard → **Authentication → Providers → Email** → enable the email
one-time-code / OTP option.

## 4. Configure auth SMTP + the OTP email template  *(required)*
Dashboard → **Authentication → Emails / SMTP** → set a real transactional SMTP
sender (the built-in one is rate-limited and not production-grade). Ensure the
OTP template includes the **`{{ .Token }}`** variable (the 6-digit code), not
only `{{ .ConfirmationURL }}`.

## 5. Allowlist redirect URLs  *(required for password reset)*
Dashboard → **Authentication → URL Configuration → Redirect URLs** → add your
staging and production origins (e.g. `https://thelodgesuites.com`,
the Vercel preview/staging URL, and `http://localhost:5180` for local).

## 6. Verify the backfill, then flip the flag on STAGING
Set `VITE_REAL_GUEST_AUTH=true` in the **staging** environment only (Vercel env
var for the staging deploy, and/or `.env.local` locally) → rebuild.
Run the test plan (below) on staging. Leave prod unset until sign-off.

## 7. (Later) Phone OTP — SMS provider
Dashboard → **Authentication → Providers → Phone** → configure Twilio /
MessageBird with a **+973 sender-ID** (GCC approval takes weeks — start early).
The phone-OTP code already exists but is inert and surfaces no UI; turning it on
is a deliberate later step with a small follow-up UI change.

## 8. (Later, mobile) external accounts to open now
- **Apple Developer Program** ($99/yr) — App Store + Sign in with Apple
  (mandatory once Google login is offered). Approval can take days.
- **Google Play Developer** ($25 once).
- **Google OAuth + Sign in with Apple** providers in Supabase (for the app).

---

## Test plan on staging (before prod)

### Flag OFF (must be unchanged)
- Staff login works (Partner Portal).
- Legacy guest login works (corporate / agent / member demo accounts).
- Reload returns to login (no persistence) — same as today.

### Flag ON
- **Member OTP:** member email → "code sent" → enter code → member portal,
  correct name + tier.
- **Corporate / Agent:** email + password → correct account-scoped portal.
- **Reload persistence:** after signing in, hard-reload → still signed in
  (this is a deliberate new behavior — confirm you want sticky guest sessions).
- **Sign-out:** clears the session; reload stays signed out.
- **Unprovisioned account** (e.g. a staff email): signs back out with
  "This account isn't set up for the portal yet."
- **Rate-limit copy:** spamming the code button shows a friendly message.

### Go / no-go for prod
All OFF tests unchanged · member/corporate/agent ON tests pass on staging ·
`dist/` has no plaintext passwords · you've accepted sticky sessions +
one-session-per-tab.

---

## Decisions still open (later phases)
- **Scoped RLS** — today any signed-in user can still *read* other accounts'
  rows over the API (the policy is broad). Phase 4 tightens this per
  account/member; it's the hard gate before a fully public launch.
- **Blanking the seed passwords** in the JS bundle — safe to do only after the
  flag is on and the legacy client-compare path is retired.
