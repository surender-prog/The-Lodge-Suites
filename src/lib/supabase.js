import { createClient } from "@supabase/supabase-js";

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

if (SUPABASE_CONFIGURED) {
  supabase = createClient(url, anonKey, {
    auth: {
      // Persist the session in localStorage so an operator who reloads
      // the admin portal stays signed in. Switch to "memory" if you'd
      // rather force a fresh sign-in every page load.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
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
