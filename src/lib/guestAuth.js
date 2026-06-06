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
