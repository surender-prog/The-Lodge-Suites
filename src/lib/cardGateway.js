// cardGateway.js — thin client wrapper over /api/card-verify, the
// provider-agnostic payment-gateway slot.
//
// Layering (don't confuse the two):
//   • validateCard() in cardValidation.js — INSTANT, offline, front-desk
//     sanity: Luhn, brand/length, expiry, CVV, accepted brands, dummy-PAN
//     deny-list. This is the gate every capture screen already enforces.
//   • verifyCard() here — OPTIONAL, online: asks the configured payment
//     gateway whether the card is actually chargeable (a $0 auth + void).
//     Until a gateway is configured it resolves { configured:false } and the
//     caller simply proceeds on the front-desk validation alone.
//
// Contract: never throws. Returns one of:
//   { ok:true,  configured:true }                       — card authorised
//   { ok:false, configured:true,  message }             — gateway declined
//   { ok:false, configured:false, reason }              — no gateway set up
//   { ok:false, configured:false, reason:"network" }    — request failed
//
// PCI note: passing a raw PAN here is acceptable for the in-house manual-
// charge workflow, but a production integration should tokenise on the
// client (Stripe.js / Tap SDK) and pass `{ token }` instead of `{ number }`
// so the PAN never reaches our server.

export async function verifyCard({ number, token, exp, cvv, name } = {}) {
  if (!number && !token) {
    return { ok: false, configured: false, reason: "No card supplied." };
  }
  try {
    const r = await fetch("/api/card-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, token, exp, cvv, name }),
    });
    const d = await r.json().catch(() => null);
    if (!d) return { ok: false, configured: false, reason: "network" };
    return d;
  } catch (_) {
    return { ok: false, configured: false, reason: "network" };
  }
}

// Convenience: is a gateway live? (cheap probe — used by admin/status UIs if
// we ever surface gateway state. Safe to call with no card.)
export async function isGatewayConfigured() {
  try {
    const r = await fetch("/api/card-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "__probe__" }),
    });
    const d = await r.json().catch(() => ({}));
    return !!d.configured;
  } catch (_) {
    return false;
  }
}
