// /api/smtp-test — Vercel serverless function that does a REAL SMTP
// handshake against the credentials the operator entered in the
// Hotel Admin → Settings → Email SMTP screen.
//
// Two modes:
//   action="verify" — opens the connection, runs STARTTLS / TLS, AUTH
//                     LOGINs, and disconnects. Confirms the credentials
//                     work without sending any mail. Used by "Test SMTP
//                     connection".
//   action="send"   — verify() followed by a real send to `to`. Used by
//                     "Send test email".
//
// Same-origin guard so this can't be used as an open relay from
// random third parties — operators provide their own SMTP creds, but
// even that should only run on requests originating from the deployed
// site (or localhost during dev).

import nodemailer from "nodemailer";

// Hosts whose Origin header is allowed to call this endpoint. Localhost
// covers `npm run dev`; the Vercel host is matched fuzzily so preview /
// production deployments work without a per-deploy update.
const ORIGIN_ALLOWLIST = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

function isAllowedOrigin(origin = "") {
  if (!origin) return true; // Some browsers omit Origin on same-origin POSTs.
  if (ORIGIN_ALLOWLIST.includes(origin)) return true;
  try {
    const { host } = new URL(origin);
    // Accept any *.vercel.app deployment (preview + production share the
    // same project; both should be able to test SMTP from the operator UI).
    if (host.endsWith(".vercel.app")) return true;
    // Accept the canonical apex domain if/when one's configured.
    if (host === "thelodgesuites.com" || host.endsWith(".thelodgesuites.com")) return true;
  } catch (_) {}
  return false;
}

// Translate the operator's encryption choice into the nodemailer
// transport's `secure` flag + STARTTLS hint. `tls`  = STARTTLS on 587;
// `ssl` = SMTPS on 465; `none` = plain SMTP (rare, mostly dev).
function transportOptionsFor({ host, port, encryption, username, password }) {
  const portNum = Number(port) || 587;
  const secure  = encryption === "ssl" || portNum === 465;
  return {
    host,
    port: portNum,
    secure,
    auth: { user: username, pass: password },
    // STARTTLS is the default when secure=false on port 587, but make it
    // explicit so a misconfigured port doesn't fall back to plaintext AUTH.
    requireTLS: encryption !== "none" && !secure,
    tls: {
      // Most providers ship valid certs. Operators on custom self-signed
      // domains can add their own override later; for now we keep
      // verification strict so we don't lie about a secure handshake.
      rejectUnauthorized: true,
    },
    // Don't hang the serverless function on a dead host — Vercel kills
    // the invocation around 10s anyway and we'd prefer a real error.
    connectionTimeout: 8000,
    greetingTimeout:   8000,
    socketTimeout:     8000,
  };
}

function buildFromHeader({ fromName, fromEmail, username }) {
  const addr = String(fromEmail || username || "").trim();
  const name = String(fromName || "").trim();
  if (!addr) return null;
  if (!name) return addr;
  // Quote the display name so commas / unicode don't break the header.
  return `"${name.replace(/"/g, '\\"')}" <${addr}>`;
}

export default async function handler(req, res) {
  // CORS / origin check.
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

  // Body parsing — Vercel auto-parses JSON when content-type is set, but
  // fall back to a manual parse for safety.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  const {
    action = "verify",          // "verify" | "send"
    host, port, encryption,
    username, password,
    fromName, fromEmail,
    to, subject, text,          // only used when action === "send"
  } = body;

  // Hard requirements common to both actions.
  const missing = [];
  if (!host)     missing.push("host");
  if (!port)     missing.push("port");
  if (!username) missing.push("username");
  if (!password) missing.push("password");
  if (missing.length) {
    return res.status(400).json({
      ok: false,
      error: `Missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    });
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport(transportOptionsFor({
      host, port, encryption, username, password,
    }));
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Transport error: ${err.message}` });
  }

  // Always run verify() — for "verify" this is the whole job; for "send"
  // it's a quick fail-fast before we burn time on the message itself.
  try {
    await transporter.verify();
  } catch (err) {
    return res.status(200).json({
      ok: false,
      stage: "verify",
      error: simplifyError(err),
      raw: err.code || err.responseCode || null,
    });
  }

  if (action !== "send") {
    transporter.close?.();
    return res.status(200).json({
      ok: true,
      stage: "verify",
      message: `Connected to ${host}:${port} as ${username}`,
    });
  }

  // ── action === "send" ─────────────────────────────────────────────
  if (!to)                              return res.status(400).json({ ok: false, error: "Missing recipient (to)" });
  if (!/.+@.+\..+/.test(String(to)))    return res.status(400).json({ ok: false, error: "Recipient is not a valid email address" });

  const from = buildFromHeader({ fromName, fromEmail, username });
  if (!from) return res.status(400).json({ ok: false, error: "Missing From email (and username isn't an email either)" });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: subject || "The Lodge Suites · SMTP test",
      text:    text    || [
        "This is a test message from The Lodge Suites partner portal.",
        "",
        "If you can read this, the SMTP configuration is working end to end.",
        `Sent ${new Date().toISOString()}`,
      ].join("\n"),
    });
    transporter.close?.();
    return res.status(200).json({
      ok: true,
      stage: "send",
      messageId: info.messageId,
      accepted:  info.accepted,
      rejected:  info.rejected,
      response:  info.response,
      message:   `Sent to ${to} via ${host}:${port}`,
    });
  } catch (err) {
    transporter.close?.();
    return res.status(200).json({
      ok: false,
      stage: "send",
      error: simplifyError(err),
      raw: err.code || err.responseCode || null,
    });
  }
}

// Nodemailer / SMTP errors can be cryptic. Surface a friendlier
// one-liner the operator can act on — the raw .code / .responseCode
// rides alongside as `raw` for support requests.
function simplifyError(err) {
  if (!err) return "Unknown SMTP error";
  const msg = String(err.message || err);
  // Common patterns operators run into.
  if (/EAUTH/i.test(err.code || "") || /authentication failed|535/i.test(msg)) {
    return "Authentication failed — username or password rejected by the SMTP server.";
  }
  if (/ECONNREFUSED/i.test(err.code || "")) {
    return "Connection refused — wrong host or port, or the server isn't reachable from Vercel.";
  }
  if (/ETIMEDOUT|ESOCKET|ETIMEOUT/i.test(err.code || "")) {
    return "Connection timed out — host unreachable, port blocked, or firewall is dropping the request.";
  }
  if (/self.signed|unable to verify|cert/i.test(msg)) {
    return "TLS certificate validation failed — the server is presenting an untrusted cert.";
  }
  if (/STARTTLS|wrong version/i.test(msg)) {
    return "TLS handshake failed — try switching encryption (STARTTLS vs SSL/TLS) or check the port (587 vs 465).";
  }
  return msg;
}
