// /api/card-verify — provider-agnostic credit-card verification.
//
// PURPOSE. The client-side validator (src/lib/cardValidation.js) is rigorous
// FRONT-DESK SANITY checking — Luhn, brand/length, expiry, CVV, accepted
// brands, and a dummy/test-PAN deny-list. It stops fakes and typos, but it
// canNOT prove a card is real and chargeable. The only thing that can is a
// live authorisation against a payment gateway (typically a $0 / small auth
// that is immediately voided). This endpoint is the slot for that.
//
// STATUS. No provider is wired yet (by decision). Until a gateway is
// configured, every call returns 200 { ok:false, configured:false, reason }
// so the booking flows degrade gracefully — they keep relying on the
// front-desk validator and simply skip the (unavailable) charge check.
//
// HOW TO ACTIVATE LATER. Set the provider + credentials, either as Vercel
// env vars (CARD_GATEWAY_PROVIDER + the provider's keys) or in a
// `gateway_config` Supabase singleton, then fill in the provider branch in
// runProviderAuth(). The request/response contract below stays the same, so
// no client changes are needed when the gateway goes live.
//
// SECURITY. Same-origin guard (reuses the SMTP allow-list). The PAN/CVV are
// NEVER logged and never persisted by this endpoint — they exist only for
// the in-memory call to the gateway and are dropped when the request ends.
// A production integration should prefer client-side tokenisation (e.g.
// Stripe.js / Tap card SDK) so the raw PAN never reaches our server at all;
// this endpoint would then receive a single-use token instead of a PAN.

import { isAllowedOrigin } from "./_smtp.js";

// Resolve the active gateway config. Env wins; falls back to a
// `gateway_config` singleton if the service-role key is present. Returns
// { provider, config } or { provider: null } when nothing is configured.
async function loadGatewayConfig() {
  const provider = (process.env.CARD_GATEWAY_PROVIDER || "").trim().toLowerCase();
  if (provider) {
    return {
      provider,
      config: {
        apiKey:    process.env.CARD_GATEWAY_API_KEY    || "",
        secretKey: process.env.CARD_GATEWAY_SECRET_KEY || "",
        merchantId:process.env.CARD_GATEWAY_MERCHANT_ID|| "",
        mode:      process.env.CARD_GATEWAY_MODE || "test", // "test" | "live"
      },
    };
  }
  // Optional: a DB-stored config (mirrors how smtp_config is read). Only
  // attempted when a service-role key exists — never with the anon key.
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supa = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data } = await supa.from("singletons").select("value").eq("key", "gateway_config").single();
      const cfg = data?.value;
      if (cfg && cfg.provider && cfg.enabled !== false) {
        return { provider: String(cfg.provider).toLowerCase(), config: cfg };
      }
    } catch (_) { /* fall through to unconfigured */ }
  }
  return { provider: null };
}

// Run a real authorisation against the configured provider. Each branch is a
// stub today — fill in when a gateway is chosen. Must return:
//   { ok: boolean, code?: string, message?: string }
// and MUST void/refund any auth it raises (verification only — never a real
// charge). NEVER log `pan`/`cvv`.
async function runProviderAuth(provider, config, { pan, exp, cvv, name }) {
  switch (provider) {
    case "stripe":
      // TODO: create a PaymentMethod (prefer a client-side token), then a
      // $0 / small auth via PaymentIntents with capture_method:"manual",
      // and cancel() it. Use config.secretKey.
      return { ok: false, code: "not_implemented", message: "Stripe gateway not implemented yet." };
    case "tap":
      // TODO: Tap "authorize" then "void" using config.apiKey.
      return { ok: false, code: "not_implemented", message: "Tap gateway not implemented yet." };
    case "benefit":
      // TODO: Benefit Pay merchant auth/void.
      return { ok: false, code: "not_implemented", message: "Benefit Pay gateway not implemented yet." };
    default:
      return { ok: false, code: "unknown_provider", message: `Unknown gateway provider: ${provider}` };
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const origin = req.headers.origin || "";
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ ok: false, error: "Origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", origin || "*");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  // Accept either a raw PAN (number) or a single-use gateway token.
  const pan   = String(body.number || "").replace(/\D/g, "");
  const token = body.token ? String(body.token) : "";
  const exp   = body.exp ? String(body.exp) : "";
  const cvv   = body.cvv ? String(body.cvv) : "";
  const name  = body.name ? String(body.name) : "";
  if (!pan && !token) {
    return res.status(400).json({ ok: false, error: "A card number or gateway token is required." });
  }

  const { provider, config } = await loadGatewayConfig();
  if (!provider) {
    // Graceful no-op: gateway not set up. The caller keeps the front-desk
    // validator as the gate; this just reports the charge-check is unavailable.
    return res.status(200).json({
      ok: false,
      configured: false,
      reason: "No payment gateway configured — card chargeability cannot be verified. Front-desk validation still applies.",
    });
  }

  try {
    const result = await runProviderAuth(provider, config, { pan: pan || undefined, token: token || undefined, exp, cvv, name });
    return res.status(200).json({
      ok: !!result.ok,
      configured: true,
      provider,
      mode: config?.mode || "test",
      code: result.code || null,
      message: result.message || null,
    });
  } catch (e) {
    // Never leak card data in an error. Return a generic failure.
    return res.status(200).json({ ok: false, configured: true, provider, error: "Gateway verification failed." });
  }
}
