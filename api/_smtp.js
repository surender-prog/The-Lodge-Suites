// api/_smtp.js — shared helpers for the SMTP serverless functions.
// The leading underscore keeps Vercel from treating this as a route.
// Imported by /api/smtp-test and /api/send-email.

import { createClient } from "@supabase/supabase-js";

// Origins allowed to call the SMTP endpoints. localhost covers dev;
// *.vercel.app + the apex domain cover preview/production. Same-origin
// POSTs sometimes omit Origin entirely — those are allowed.
export function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  if (["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"].includes(origin)) return true;
  try {
    const { host } = new URL(origin);
    if (host.endsWith(".vercel.app")) return true;
    if (host === "thelodgesuites.com" || host.endsWith(".thelodgesuites.com")) return true;
  } catch (_) {}
  return false;
}

// Map the operator's encryption choice → nodemailer transport flags.
//   tls  → STARTTLS on 587   ssl → SMTPS on 465   none → plaintext (dev)
export function transportOptionsFor({ host, port, encryption, username, password }) {
  const portNum = Number(port) || 587;
  const secure  = encryption === "ssl" || portNum === 465;
  return {
    host,
    port: portNum,
    secure,
    auth: { user: username, pass: password },
    requireTLS: encryption !== "none" && !secure,
    tls: { rejectUnauthorized: true },
    connectionTimeout: 8000,
    greetingTimeout:   8000,
    socketTimeout:     8000,
  };
}

// Compose a From header. Quotes the display name so commas / unicode
// don't break the header. Falls back to the auth username when no
// explicit from address was set.
export function buildFromHeader({ fromName, fromEmail, username }) {
  const addr = String(fromEmail || username || "").trim();
  const name = String(fromName || "").trim();
  if (!addr) return null;
  if (!name) return addr;
  return `"${name.replace(/"/g, '\\"')}" <${addr}>`;
}

// Translate the most common SMTP / nodemailer errors into an operator-
// actionable one-liner. The raw code rides alongside as `raw`.
export function simplifyError(err) {
  if (!err) return "Unknown SMTP error";
  const msg = String(err.message || err);
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

// Load the saved SMTP config from Supabase using the SERVICE-ROLE key
// (bypasses RLS — the smtp_config singleton is locked to staff, so the
// anon key can't read it). Returns { config } or { error }. Never throws.
//
// Env required (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL              (or VITE_SUPABASE_URL, already present)
//   SUPABASE_SERVICE_ROLE_KEY (server-only secret — never exposed to client)
export async function loadSmtpConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return { error: "Server email not configured — SUPABASE_URL is missing." };
  if (!serviceKey) return { error: "Server email not configured — SUPABASE_SERVICE_ROLE_KEY is missing in Vercel env." };
  try {
    const supa = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await supa.from("singletons").select("value").eq("key", "smtp_config").single();
    if (error) return { error: `Couldn't load SMTP config: ${error.message}` };
    return { config: data?.value || null };
  } catch (e) {
    return { error: `SMTP config read threw: ${e?.message || e}` };
  }
}

// Best-effort read of the hotel display name for email subjects / sign-off.
// hotel_info IS anon-readable, so this works with either key; defaults
// to "The Lodge Suites" when unavailable.
export async function loadHotelName() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return "The Lodge Suites";
  try {
    const supa = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supa.from("singletons").select("value").eq("key", "hotel_info").single();
    return data?.value?.name || "The Lodge Suites";
  } catch (_) {
    return "The Lodge Suites";
  }
}
