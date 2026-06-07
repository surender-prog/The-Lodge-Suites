import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

// True only inside the native iOS/Android shell (Capacitor). False on the web.
const IS_NATIVE = (() => {
  try { return Capacitor?.isNativePlatform?.() === true; } catch { return false; }
})();
export { IS_NATIVE };

// Native session storage. A WebView's localStorage is not durable (can be
// evicted under storage pressure) and is readable on jailbroken/rooted
// devices, so on device we persist the Supabase session via
// @capacitor/preferences (iOS UserDefaults / Android SharedPreferences),
// lazy-imported so the web bundle stays lean. NOTE: Preferences is durable but
// is NOT the Keychain/Keystore — upgrade to a secure-storage plugin before
// production hardening (see CAPACITOR.md). On web this is unused and supabase-js
// keeps its default localStorage (behaviour unchanged).
function nativeSessionStorage() {
  let prefs;
  const load = () => (prefs ??= import("@capacitor/preferences").then((m) => m.Preferences));
  return {
    async getItem(key) { const P = await load(); const { value } = await P.get({ key }); return value ?? null; },
    async setItem(key, value) { const P = await load(); await P.set({ key, value }); },
    async removeItem(key) { const P = await load(); await P.remove({ key }); },
  };
}

// ─── Supabase singleton client ────────────────────────────────────────────
//
// Vite injects env vars via `import.meta.env`. Variables MUST be prefixed
// with `VITE_` to make it into the client bundle — the bundler strips
// everything else for safety. Keep `.env.local` out of git (the project's
// .gitignore already does this).
//
// Why a singleton:
//   • One WebSocket / fetch pool across the whole app
//   • Auth state changes propagate cleanly to all subscribers
//   • The DataProvider in store.jsx will lift this into React state once
//     we start migrating slices off in-memory storage
//
// Boot-time validation:
//   We fail loudly if the env is missing rather than silently falling back
//   to a broken client. The error message tells the developer exactly
//   which file to fix and which variables to set.

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
export const SUPABASE_CONFIGURED = Boolean(url && anonKey);

// Phase 1/2 real guest auth. Off by default → legacy client-compare login.
// Vite inlines import.meta.env at build time; "true" is the only truthy
// trigger so blank/"false"/undefined keeps the legacy path (and the dead
// real-auth branch is tree-shaken from the prod bundle).
export const REAL_GUEST_AUTH = import.meta.env.VITE_REAL_GUEST_AUTH === "true";

// Live auth-session cache so synchronous code paths (the persistence
// debouncer, mostly) can decide whether a Supabase write is worth
// attempting. We populate it on boot and keep it in sync via the
// onAuthStateChange listener — so signing in/out flips this without
// any extra wiring in store.jsx.
let cachedSession = null;
export function hasSupabaseSession() { return !!cachedSession; }

if (SUPABASE_CONFIGURED) {
  supabase = createClient(url, anonKey, {
    auth: {
      // Persist the session in localStorage so an operator who reloads
      // the admin portal stays signed in. Switch to "memory" if you'd
      // rather force a fresh sign-in every page load.
      persistSession: true,
      autoRefreshToken: true,
      // On the web, OAuth/reset links round-trip through the URL hash so we let
      // supabase-js detect them. In the native shell the app loads from a
      // capacitor:// scheme (no redirect URL on boot) — deep links are handled
      // explicitly — so detection is disabled there.
      detectSessionInUrl: !IS_NATIVE,
      // Explicit PKCE — required for the email-OTP / reset-link guest flow
      // (verifyOtp + reset links round-trip a code_verifier). v2 defaults to
      // pkce, but we pin it so a future supabase-js bump can't silently drop
      // us to the implicit flow.
      flowType: "pkce",
      // Native: persist the session in durable OS storage (see above). Web:
      // leave undefined → supabase-js default localStorage (unchanged).
      ...(IS_NATIVE ? { storage: nativeSessionStorage() } : {}),
    },
  });
  // Hydrate the session cache asynchronously and keep it current.
  supabase.auth.getSession().then(({ data }) => { cachedSession = data?.session || null; });
  supabase.auth.onAuthStateChange((_event, session) => { cachedSession = session || null; });
} else if (typeof window !== "undefined") {
  // Visible warning in the browser console, but the app keeps running on
  // its in-memory mock data. This is the right default for the current
  // phase: the UI works for demos even before the backend is wired.
  // eslint-disable-next-line no-console
  console.warn(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. " +
    "The app will run in mock-only mode. " +
    "Copy .env.example → .env.local and fill in the values to enable persistence."
  );
}

export { supabase };

// ─── Convenience guards ───────────────────────────────────────────────────
// Wrap any Supabase call so a missing client throws with a clear message
// instead of "cannot read property X of null". Use it like:
//
//   import { withSupabase } from "../lib/supabase";
//   const rows = await withSupabase(c => c.from("rooms").select("*"));
//
export function withSupabase(fn) {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY in .env.local and restart `npm run dev`."
    );
  }
  return fn(supabase);
}
