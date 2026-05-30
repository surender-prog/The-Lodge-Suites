// /api/send-email — server-side transactional email sender.
//
// Unlike /api/smtp-test (which takes credentials in the request body for
// the admin's manual test), this endpoint reads the SAVED, enabled SMTP
// config from the DB using the service-role key. That keeps the SMTP
// password entirely server-side — public surfaces (the LS Privilege join
// form, the booking flow) can trigger a send without ever holding creds.
//
// Body: { kind, to, name?, memberId?, subject?, text? }
//   kind="welcome" → builds the LS Privilege welcome email.
//   kind="custom"  → uses the supplied subject + text verbatim.
//
// Fail-soft: every "can't send" path returns 200 { ok:false, reason } so
// the caller (e.g. registration) never breaks just because email is
// unconfigured or the server is mid-setup.

import nodemailer from "nodemailer";
import {
  isAllowedOrigin, transportOptionsFor, buildFromHeader, simplifyError,
  loadSmtpConfig, loadHotelName,
} from "./_smtp.js";

function buildEmail(kind, { name, memberId, subject, text }, hotelName) {
  if (kind === "welcome") {
    const who = name || "there";
    const idLine = memberId ? `\nYour membership number: ${memberId}` : "";
    return {
      subject: `Welcome to LS Privilege · ${hotelName}`,
      text: [
        `Dear ${who},`,
        "",
        `Welcome to LS Privilege — thank you for joining the loyalty programme at ${hotelName}.`,
        `Your account is now active.${idLine}`,
        "",
        "As a member you'll earn points on every direct stay, unlock member-only rates and offers, and can buy or redeem gift cards from your account.",
        "",
        "Sign in any time from our website to view your bookings, folios and rewards.",
        "",
        "We look forward to welcoming you to Juffair.",
        "",
        "Warm regards,",
        `${hotelName} · LS Privilege Team`,
      ].join("\n"),
    };
  }
  // Generic / custom message.
  return {
    subject: subject || `A message from ${hotelName}`,
    text:    text || "",
  };
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

  const { kind = "welcome", to, name, memberId, subject, text } = body;
  if (!to || !/.+@.+\..+/.test(String(to))) {
    return res.status(400).json({ ok: false, error: "A valid recipient (to) is required." });
  }

  // Load saved config (service-role; smtp_config is staff-only in RLS).
  const { config, error: cfgErr } = await loadSmtpConfig();
  if (cfgErr)  return res.status(200).json({ ok: false, skipped: true, reason: cfgErr });
  if (!config) return res.status(200).json({ ok: false, skipped: true, reason: "No SMTP config saved." });
  if (config.enabled === false) {
    return res.status(200).json({ ok: false, skipped: true, reason: "Outbound email is disabled in admin." });
  }

  const username  = String(config.username  || "").trim();
  const password  = String(config.password  || "").trim();
  const fromEmail = String(config.fromEmail  || "").trim() || username;
  if (!config.host || !username || !password || !fromEmail) {
    return res.status(200).json({ ok: false, skipped: true, reason: "SMTP config is incomplete (host / username / password / from)." });
  }

  const hotelName = await loadHotelName();
  const built = buildEmail(kind, { name, memberId, subject, text }, hotelName);
  if (!built.subject || !built.text) {
    return res.status(400).json({ ok: false, error: "Nothing to send (empty subject/body)." });
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport(transportOptionsFor({
      host: config.host, port: config.port, encryption: config.encryption, username, password,
    }));
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Transport error: ${e.message}` });
  }

  try {
    const info = await transporter.sendMail({
      from:    buildFromHeader({ fromName: config.fromName, fromEmail, username }),
      to:      String(to),
      replyTo: config.replyTo ? String(config.replyTo) : undefined,
      subject: built.subject,
      text:    built.text,
    });
    transporter.close?.();
    return res.status(200).json({ ok: true, kind, messageId: info.messageId, accepted: info.accepted, response: info.response });
  } catch (e) {
    transporter.close?.();
    return res.status(200).json({ ok: false, error: simplifyError(e), raw: e.code || e.responseCode || null });
  }
}
