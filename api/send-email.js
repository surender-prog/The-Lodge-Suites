// /api/send-email — server-side transactional email sender.
//
// Unlike /api/smtp-test (which takes credentials in the request body for
// the admin's manual test), this endpoint reads the SAVED, enabled SMTP
// config from the DB using the service-role key. That keeps the SMTP
// password entirely server-side — public surfaces (the LS Privilege join
// form, the booking flow) can trigger a send without ever holding creds.
//
// Body: { kind, to, name?, memberId?, subject?, text?, ...data }
//   kind="welcome"          → LS Privilege welcome email.
//   kind="booking-new"      → guest booking receipt (adapts to status).
//   kind="booking-status"   → guest notice when a booking's status changes.
//   kind="password-changed" → security notice (never echoes the password).
//   kind="vendor-registered"→ maintenance-vendor onboarding confirmation.
//   kind="custom"           → uses the supplied subject + text verbatim
//                             (used by the OTA stop-sale composer).
//   kind="report"           → scheduled/manual operations report — supplied
//                             subject + rich HTML body (+ text fallback),
//                             built from live store data by the caller.
//
// Fail-soft: every "can't send" path returns 200 { ok:false, reason } so
// the caller (e.g. registration) never breaks just because email is
// unconfigured or the server is mid-setup.

import nodemailer from "nodemailer";
import {
  isAllowedOrigin, transportOptionsFor, buildFromHeader, simplifyError,
  loadSmtpConfig, loadHotelName,
} from "./_smtp.js";

// Human-readable label for a reservation status code.
function statusLabel(s) {
  const map = {
    confirmed:   "Confirmed",
    "on-request":"On request",
    onrequest:   "On request",
    "in-house":  "In house",
    inhouse:     "In house",
    checkout:    "Checked out",
    "checked-out":"Checked out",
    cancelled:   "Cancelled",
    canceled:    "Cancelled",
    rejected:    "Rejected",
    "sold-out":  "Sold out",
    soldout:     "Sold out",
  };
  return map[String(s || "").toLowerCase()] || (s ? String(s) : "—");
}

// Render a "Suite / Dates / Nights / Total" block shared by booking emails.
// Only includes lines we actually have data for.
function stayLines({ bookingId, suite, checkIn, checkOut, nights, total, hotelConfirmationNo }) {
  const lines = [];
  if (bookingId)            lines.push(`Booking reference: ${bookingId}`);
  if (hotelConfirmationNo)  lines.push(`Hotel confirmation no.: ${hotelConfirmationNo}`);
  if (suite)                lines.push(`Suite: ${suite}`);
  if (checkIn || checkOut)  lines.push(`Stay: ${checkIn || "?"} → ${checkOut || "?"}${nights ? `  (${nights} night${nights == 1 ? "" : "s"})` : ""}`);
  else if (nights)          lines.push(`Nights: ${nights}`);
  if (total != null && total !== "") lines.push(`Total: BHD ${Number(total).toFixed(3)}`);
  return lines;
}

function buildEmail(kind, payload, hotelName) {
  const { name, memberId, subject, text } = payload;
  const who = name || "Guest";

  if (kind === "welcome") {
    const idLine = memberId ? `\nYour membership number: ${memberId}` : "";
    return {
      subject: `Welcome to LS Privilege · ${hotelName}`,
      text: [
        `Dear ${name || "there"},`,
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

  if (kind === "booking-new") {
    const status = String(payload.status || "confirmed").toLowerCase();
    const onRequest = status === "on-request" || status === "onrequest";
    const stay = stayLines(payload);
    const intro = onRequest
      ? `We've received your reservation request and it is now pending confirmation. Our reservations team will confirm availability shortly.`
      : `Your reservation is confirmed — we're delighted to welcome you to ${hotelName}.`;
    return {
      subject: onRequest
        ? `Reservation request received · ${payload.bookingId || hotelName}`
        : `Booking confirmed · ${payload.bookingId || hotelName}`,
      text: [
        `Dear ${who},`,
        "",
        intro,
        ...(stay.length ? ["", ...stay] : []),
        "",
        `Status: ${statusLabel(status)}`,
        "",
        "Check-in is from 14:00 and check-out is by 12:00. If you have any special requests, simply reply to this email.",
        "",
        "We look forward to welcoming you.",
        "",
        "Warm regards,",
        `${hotelName} · Reservations`,
      ].join("\n"),
    };
  }

  if (kind === "booking-status") {
    const to_ = statusLabel(payload.toStatus || payload.status);
    const stay = stayLines(payload);
    // Tailor the closing line to the new status.
    const code = String(payload.toStatus || payload.status || "").toLowerCase();
    let note = "If you have any questions, simply reply to this email.";
    if (code === "confirmed")          note = "Your reservation is now confirmed. Check-in is from 14:00.";
    else if (code === "cancelled" || code === "canceled") note = "Your reservation has been cancelled. If this is unexpected, please contact us.";
    else if (code === "rejected")      note = "Unfortunately we're unable to confirm this reservation. Please contact us to explore alternatives.";
    else if (code === "in-house" || code === "inhouse") note = "You're now checked in — enjoy your stay with us.";
    else if (code === "checkout" || code === "checked-out") note = "Thank you for staying with us. We hope to welcome you again soon.";
    return {
      subject: `Reservation update · ${payload.bookingId || hotelName} — ${to_}`,
      text: [
        `Dear ${who},`,
        "",
        `There's an update to your reservation. The status is now: ${to_}.`,
        ...(stay.length ? ["", ...stay] : []),
        "",
        note,
        "",
        "Warm regards,",
        `${hotelName} · Reservations`,
      ].join("\n"),
    };
  }

  if (kind === "password-changed") {
    // Security notice only — NEVER include the new password in the body.
    const portal = payload.portal ? ` ${payload.portal}` : "";
    return {
      subject: `Your${portal} password was changed · ${hotelName}`,
      text: [
        `Dear ${who},`,
        "",
        `This is a confirmation that the password for your${portal} account at ${hotelName} was just changed.`,
        "",
        "If you made this change, no further action is needed.",
        "If you did NOT request this, please contact us immediately so we can secure your account.",
        "",
        "For your security, this message does not contain your password.",
        "",
        "Warm regards,",
        `${hotelName}`,
      ].join("\n"),
    };
  }

  if (kind === "vendor-registered") {
    const cats = Array.isArray(payload.categories) ? payload.categories.filter(Boolean) : [];
    const catLine = cats.length ? `\nRegistered service categories: ${cats.join(", ")}.` : "";
    const idLine  = payload.vendorId ? `\nYour vendor ID: ${payload.vendorId}` : "";
    return {
      subject: `You're registered as a service partner · ${hotelName}`,
      text: [
        `Dear ${name || "Partner"},`,
        "",
        `Thank you for partnering with ${hotelName}. Your company has been registered as an approved maintenance & services vendor.${idLine}${catLine}`,
        "",
        "Our facilities team will reach out when work orders matching your services are raised. Please keep your contact and trade-licence details up to date with us.",
        "",
        "Warm regards,",
        `${hotelName} · Facilities & Procurement`,
      ].join("\n"),
    };
  }

  if (kind === "report") {
    // Scheduled / manual operations report. The caller builds the rich HTML
    // from live store data (buildReportEmail); text is the plain fallback.
    return {
      subject: subject || `Report from ${hotelName}`,
      text:    text || "This report is best viewed in an HTML-capable email client.",
      html:    payload.html ? String(payload.html) : undefined,
    };
  }

  if (kind === "invoice" || kind === "receipt") {
    // Cover note for an attached invoice / receipt PDF. The PDF itself carries
    // the full branded document; this body is the short accompanying message.
    const isReceipt = kind === "receipt";
    const ref  = String(payload.docNo || payload.bookingId || "").trim();
    const amt  = payload.amountLabel ? String(payload.amountLabel) : "";
    const lead = isReceipt
      ? "Thank you for your payment. Your receipt is attached as a PDF."
      : "Please find your invoice attached as a PDF.";
    const textFallback = [
      `Dear ${who},`, "", lead,
      ref ? `Reference: ${ref}` : null,
      amt ? `Amount: ${amt}` : null,
      "", "For any queries, simply reply to this email.", "",
      "Kind regards,", "Accounts Team", hotelName,
    ].filter((l) => l !== null).join("\n");
    return {
      subject: subject || (isReceipt
        ? `${hotelName} · Payment receipt${ref ? " · " + ref : ""}`
        : `${hotelName} · Invoice${ref ? " · " + ref : ""}`),
      text: text || textFallback,
      html: payload.html ? String(payload.html) : undefined,
    };
  }

  if (kind === "intro") {
    // Sales introduction email — the client already composed the full subject,
    // text and HTML body (see src/lib/introEmailTemplate.js) and attached a
    // Fact Sheet PDF. The server just passes them through; no fallback body so
    // an empty payload fails loudly rather than silently sending boilerplate.
    return {
      subject: subject || `Introduction from ${hotelName}`,
      text:    text || "",
      html:    payload.html ? String(payload.html) : undefined,
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

  const { kind = "welcome", to } = body;
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
  const built = buildEmail(kind, body, hotelName);
  if (!built.subject || !built.text) {
    return res.status(400).json({ ok: false, error: "Nothing to send (empty subject/body)." });
  }

  // Normalise a cc/bcc field — accepts a string ("a@x.com, b@y.com"), an
  // array, comma- OR semicolon-separated — into an array of valid addresses.
  // Internal copy recipients (e.g. the front-office / GM mailbox BCC'd on
  // every booking confirmation) flow through here.
  const toAddrList = (v) => {
    if (!v) return [];
    const parts = Array.isArray(v) ? v : String(v).split(/[,;]+/);
    return parts.map((s) => String(s).trim()).filter((s) => /.+@.+\..+/.test(s));
  };
  const ccList  = toAddrList(body.cc);
  const bccList = toAddrList(body.bcc);

  // Attachments — the client sends [{ filename, contentBase64, contentType? }].
  // Decode base64 → Buffer for nodemailer. Capped defensively so a malformed
  // payload can't blow the function's memory; anything invalid is skipped.
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .map((a) => {
      const b64 = String(a?.contentBase64 || "").trim();
      const filename = String(a?.filename || "document.pdf").replace(/[^A-Za-z0-9._-]/g, "") || "document.pdf";
      if (!b64 || b64.length > 12_000_000) return null; // ~9 MB decoded ceiling
      try {
        return { filename, content: Buffer.from(b64, "base64"), contentType: a?.contentType || "application/pdf" };
      } catch { return null; }
    })
    .filter(Boolean)
    .slice(0, 5);

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
      cc:      ccList.length  ? ccList  : undefined,
      bcc:     bccList.length ? bccList : undefined,
      replyTo: config.replyTo ? String(config.replyTo) : undefined,
      subject: built.subject,
      text:    built.text,
      html:    built.html || undefined,
      attachments: attachments.length ? attachments : undefined,
    });
    transporter.close?.();
    return res.status(200).json({ ok: true, kind, messageId: info.messageId, accepted: info.accepted, response: info.response });
  } catch (e) {
    transporter.close?.();
    return res.status(200).json({ ok: false, error: simplifyError(e), raw: e.code || e.responseCode || null });
  }
}
