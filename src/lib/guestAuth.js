import { supabase, SUPABASE_CONFIGURED } from "./supabase.js";

// ---------------------------------------------------------------------------
// guestAuth — thin, never-throwing wrappers around supabase.auth for the
// Guest Portal (LS Privilege members, corporate users, travel agents).
//
// Contract (mirrors signInStaff's { ok, error } shape in store.jsx):
//     { ok: true,  ... }                                       on success
//     { ok: false, error: <human string>, code?: <code> }     on failure
// Never rejects — callers can `const r = await signInGuestOtp(email);
// if (!r.ok) setError(r.error);` with no try/catch.
//
// Phase 1/2 only. Gated upstream by REAL_GUEST_AUTH (supabase.js). This module
// makes no decision about whether to run; GuestPortal/store decide.
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = {
  ok: false,
  error: "Sign-in is temporarily unavailable. Please contact the front office.",
  code: "not_configured",
};

// Normalise a Supabase auth error into our flat shape.
function fail(error) {
  const code = error?.code || error?.name || "auth_error";
  const map = {
    otp_expired:        "That code has expired. Request a new one.",
    otp_disabled:       "Email codes aren't enabled yet. Contact the front office.",
    over_email_send_rate_limit:
                        "Too many requests. Wait a minute and try again.",
    invalid_credentials:"Email or password didn't match.",
    email_not_confirmed:"Please verify your email before signing in.",
    user_not_found:     "We couldn't find an account for that email.",
  };
  return { ok: false, error: map[code] || error?.message || "Something went wrong. Try again.", code };
}

// Members: request a 6-digit email OTP. shouldCreateUser:false so an unknown
// email does NOT silently provision an auth user — members must exist via the
// join form → portal_identities sync (migration 022) first.
export async function signInGuestOtp(email) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const em = (email || "").trim().toLowerCase();
  if (!em) return { ok: false, error: "Enter your email address.", code: "missing_email" };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: em,
      options: { shouldCreateUser: false },
    });
    if (error) return fail(error);
    return { ok: true, email: em };
  } catch (e) {
    return fail(e);
  }
}

// Members: verify the 6-digit code. On success the SDK sets the session and
// fires onAuthStateChange("SIGNED_IN"); we return the user so the caller can
// derive the portal session from JWT claims.
export async function verifyGuestOtp(email, token) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const em = (email || "").trim().toLowerCase();
  const code = (token || "").trim();
  if (!em || !code) return { ok: false, error: "Enter the code we emailed you.", code: "missing_token" };
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: em,
      token: code,
      type: "email",
    });
    if (error) return fail(error);
    return { ok: true, user: data?.user || null, session: data?.session || null };
  } catch (e) {
    return fail(e);
  }
}

// Corporate / travel-agent staff: classic email + password (same path as
// signInStaff in store.jsx).
export async function signInGuestPassword(email, password) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const em = (email || "").trim().toLowerCase();
  const pw = password || "";
  if (!em || !pw) return { ok: false, error: "Enter email and password.", code: "missing_credentials" };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
    if (error) return fail(error);
    return { ok: true, user: data?.user || null, session: data?.session || null };
  } catch (e) {
    return fail(e);
  }
}

// Password reset (corporate / agent). Sends the recovery email; the redirect
// lands back on the app where detectSessionInUrl + pkce complete the exchange.
export async function resetGuest(email) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const em = (email || "").trim().toLowerCase();
  if (!em) return { ok: false, error: "Enter your email address.", code: "missing_email" };
  try {
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(em, redirectTo ? { redirectTo } : undefined);
    if (error) return fail(error);
    return { ok: true, email: em };
  } catch (e) {
    return fail(e);
  }
}

// Complete a password recovery: set a new password on the (recovery-link)
// authenticated session. Used by the reset-password panel.
export async function updateGuestPassword(newPassword) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const pw = newPassword || "";
  if (pw.length < 8) return { ok: false, error: "Password must be at least 8 characters.", code: "weak_password" };
  try {
    const { data, error } = await supabase.auth.updateUser({ password: pw });
    if (error) return fail(error);
    return { ok: true, user: data?.user || null };
  } catch (e) {
    return fail(e);
  }
}

// Public partner registration: is this email free to register a brand-new
// corporate/agency account? Calls the migration-027 RPC (granted to anon) —
// needed because an anonymous visitor can't read agreements/agencies/members
// to check locally. Fail-OPEN: if the check can't run (seed/dev, RPC error)
// we don't block; the DB insert's RLS guard is the real enforcement.
// Returns true = available, false = already registered.
export async function partnerEmailAvailable(email) {
  if (!SUPABASE_CONFIGURED || !supabase) return true;
  const em = (email || "").trim().toLowerCase();
  if (!em) return true;
  try {
    const { data, error } = await supabase.rpc("partner_registration_email_available", { p_data: { users: [{ email: em }] } });
    if (error) return true;
    return data !== false;
  } catch { return true; }
}

// ---------------------------------------------------------------------------
// Password-recovery detection. Reset links land in one of three shapes:
//   • ?token_hash=…&type=recovery — the cross-browser-safe email template
//     ({{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery); verified
//     client-side via verifyOtp, works on any browser/device.
//   • ?code=…                     — the default ConfirmationURL under PKCE;
//     detectSessionInUrl exchanges it, but ONLY in the browser that requested
//     the reset (the code_verifier lives in its localStorage).
//   • #…type=recovery             — legacy implicit-flow hash.
// detectSessionInUrl strips the URL once it processes it, so the params are
// snapshotted synchronously at module load. The PASSWORD_RECOVERY event can
// also fire before the portal mounts — a module-level latch remembers it.
// ---------------------------------------------------------------------------
const BOOT_AUTH_PARAMS = (() => {
  try {
    if (typeof window === "undefined") return {};
    const search = new URLSearchParams(window.location.search || "");
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    return {
      code:      search.get("code")       || hash.get("code")       || null,
      tokenHash: search.get("token_hash") || hash.get("token_hash") || null,
      type:      search.get("type")       || hash.get("type")       || null,
    };
  } catch { return {}; }
})();

let recoveryPending = false;
if (SUPABASE_CONFIGURED && supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryPending = true;
  });
}
export function consumeRecoveryPending() { return recoveryPending; }
export function clearRecoveryPending() {
  recoveryPending = false;
  // Strip the recovery params so a reload doesn't re-trigger the flow.
  try {
    if (typeof window !== "undefined" && (window.location.hash || window.location.search)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  } catch { /* non-fatal */ }
}
// Did this page load arrive from an auth email link? (?code= counts: this app
// has no OAuth, so a code landing is always an email-link round trip.)
export function isRecoveryUrl() {
  if (BOOT_AUTH_PARAMS.type === "recovery" || BOOT_AUTH_PARAMS.code) return true;
  if (typeof window === "undefined") return false;
  return /type=recovery/.test(window.location.hash || "") || /type=recovery/.test(window.location.search || "");
}

// Establish the recovery session for the reset-password panel, whatever shape
// the link took. Returns { ok, user } or { ok:false, error } so the panel can
// show a clear failure (expired link / opened in a different browser).
export async function completeRecoveryFromUrl() {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  try {
    // (a) token_hash links — verifier-free, works from any browser.
    if (BOOT_AUTH_PARAMS.tokenHash && BOOT_AUTH_PARAMS.type === "recovery") {
      const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: BOOT_AUTH_PARAMS.tokenHash });
      if (error) return fail(error);
      return { ok: true, user: data?.user || null };
    }
    // (b) ?code= / implicit-hash links — detectSessionInUrl is (or already
    // finished) exchanging them; wait briefly for the session to appear.
    const deadline = Date.now() + 8000;
    for (;;) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) return { ok: true, user: data.session.user };
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    return {
      ok: false,
      code: "recovery_incomplete",
      error: "We couldn't verify this reset link. It may have expired, already been used, or been opened in a different browser than the one that requested it. Request a new link and open it on this device.",
    };
  } catch (e) {
    return fail(e);
  }
}
// Live subscription for the same moment (covers the portal-already-open case).
// Returns an unsubscribe function.
export function onPasswordRecovery(cb) {
  if (!SUPABASE_CONFIGURED || !supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") cb?.();
  });
  return () => data?.subscription?.unsubscribe?.();
}

// Sign the guest out of Supabase. Best-effort; never throws.
export async function signOutGuest() {
  if (!SUPABASE_CONFIGURED || !supabase) return { ok: true };
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return fail(error);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// sessionFromClaims — derive the portal session from JWT custom claims minted
// by migration 022's custom_access_token_hook (read app_metadata first —
// server-trusted, client-immutable — then user_metadata, then top-level).
//
// Field names are IDENTICAL to the legacy LoginPanel.tryLogin payloads
// (kind, accountId, userId, displayName, email, +role OR +tier) so the three
// sub-portals are unchanged. Returns null if `kind` is absent — caller treats
// that as "authenticated but not provisioned for the portal" and signs out.
//
// NOTE: tier for members is left to fresh client-side resolution (it lives in
// mutable meta and can go stale); see GuestPortalInner / store recompute.
// ---------------------------------------------------------------------------
export function sessionFromClaims(user) {
  if (!user) return null;
  const app = user.app_metadata || {};
  const meta = user.user_metadata || {};
  const pick = (k) => app[k] ?? meta[k];

  // The hook mirrors claims top-level (kind/account_id/member_id/role) and the
  // SDK surfaces app_metadata; meta carries the 004/022 convention keys
  // (kind, accountId, memberId, tier, name). Read both spellings.
  const kind = pick("kind");                       // "corporate" | "agent" | "member"
  if (!kind) return null;

  const session = {
    kind,
    accountId:   pick("account_id") ?? pick("accountId") ?? null,
    userId:      pick("user_id") ?? pick("userId") ?? user.id,
    displayName: pick("display_name") ?? pick("displayName") ?? meta.name ?? (user.email || "").split("@")[0],
    email:       user.email || pick("email") || "",
  };
  if (kind === "member") {
    session.accountId = session.accountId ?? pick("member_id") ?? pick("memberId") ?? null;
    session.userId    = session.accountId ?? session.userId; // members: accountId === userId === memberId
    session.tier = pick("tier") ?? null;
  } else {
    session.role = pick("role") ?? null;
  }
  return session;
}

// ---------------------------------------------------------------------------
// PHONE OTP — wired but INERT until an SMS provider is configured in the
// Supabase dashboard (Auth → Providers → Phone). Imported nowhere → tree-shaken
// out of the bundle. Do NOT surface a phone field in the UI this phase.
// ---------------------------------------------------------------------------
export async function signInGuestPhoneOtp(phone) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const ph = (phone || "").trim();
  if (!ph) return { ok: false, error: "Enter your phone number.", code: "missing_phone" };
  try {
    const { error } = await supabase.auth.signInWithOtp({ phone: ph, options: { shouldCreateUser: false } });
    if (error) return fail(error);
    return { ok: true, phone: ph };
  } catch (e) { return fail(e); }
}
export async function verifyGuestPhoneOtp(phone, token) {
  if (!SUPABASE_CONFIGURED || !supabase) return NOT_CONFIGURED;
  const ph = (phone || "").trim(); const code = (token || "").trim();
  if (!ph || !code) return { ok: false, error: "Enter your phone and the SMS code.", code: "missing" };
  try {
    const { data, error } = await supabase.auth.verifyOtp({ phone: ph, token: code, type: "sms" });
    if (error) return fail(error);
    return { ok: true, user: data?.user || null, session: data?.session || null };
  } catch (e) { return fail(e); }
}
