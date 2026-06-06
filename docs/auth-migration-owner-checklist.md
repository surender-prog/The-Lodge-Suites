# Real Guest Auth — Owner Action Checklist

The code for real Supabase guest auth is **already shipped, behind a flag that
is OFF** (`VITE_REAL_GUEST_AUTH`). Nothing in production changes until you
complete the steps below and flip the flag on staging. Do them **in order**.

Project ref: `tbmmmsldanxhgfmyoamy` · Dashboard: https://supabase.com/dashboard

---

## Status so far
- ✅ **Phase 0** (migration 021) — applied & live. Plaintext no longer leaks to
  the browser on the write side; password-preserving triggers verified working.
- ✅ **Phase 1/2 code** (commit `c9da740`) — shipped, dormant behind the flag.
- ⬜ **The steps below** — needed to actually turn real auth on.

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
