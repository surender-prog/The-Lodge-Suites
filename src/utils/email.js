// email.js — thin client wrapper over the /api/send-email serverless
// function. Every transactional-email trigger in the app funnels through
// here so the call sites stay one-liners and the fire-and-forget +
// never-throw contract is enforced in exactly one place.
//
// The serverless function reads the saved SMTP config server-side (via
// the Supabase service-role key), so callers NEVER hold credentials —
// safe to call from anon surfaces (public booking, LS Privilege join).
//
// Always fire-and-forget: a slow or unconfigured mail server must never
// block or break a user flow. Returns a promise that resolves to the
// JSON result (or null on network error) for callers that want to log.

export function sendTransactionalEmail(payload) {
  if (!payload || !payload.to || !/.+@.+\..+/.test(String(payload.to))) {
    return Promise.resolve(null);
  }
  try {
    return fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}
