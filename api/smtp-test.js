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
import { isAllowedOrigin, transportOptionsFor, buildFromHeader, simplifyError } from "./_smtp.js";

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
