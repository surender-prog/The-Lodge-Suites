// /api/run-reports — server-side scheduled-report runner.
//
// Pinged on an interval (Supabase pg_cron via migration 028, or any external
// cron) with the shared secret:
//     GET /api/run-reports?key=<REPORTS_CRON_SECRET>          → send what's due
//     GET /api/run-reports?key=<…>&dry=1                      → list due, send nothing
//
// For every ENABLED schedule whose next-run time has passed, it rebuilds the
// report from LIVE data (same builders the admin preview uses —
// src/lib/reportEmail.js), emails the recipients through the saved SMTP
// config, and writes lastRunAt / nextRunAt / history back to the schedule row
// — so the admin's Scheduled Reports table reflects real runs.
//
// Times: schedule.runAt ("HH:MM") is hotel local time — Asia/Bahrain (UTC+3,
// no DST). Stored timestamps are ISO-UTC; legacy naive values are read as
// Bahrain time. Overdue schedules fire ONCE per pass (no backfill storm).
//
// Env (Vercel):
//   SUPABASE_URL / VITE_SUPABASE_URL   (already set)
//   SUPABASE_SERVICE_ROLE_KEY          (already set — used by send-email)
//   REPORTS_CRON_SECRET                (new — must match the pg_cron job URL)

import nodemailer from "nodemailer";
import {
  transportOptionsFor, buildFromHeader, simplifyError, loadSmtpConfig,
} from "./_smtp.js";
import { buildReportEmail } from "../src/lib/reportEmail.js";

const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST

// Parse a stored timestamp: ISO-with-zone as-is; naive strings as Bahrain.
function parseTs(s) {
  if (!s) return null;
  const str = String(s);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(str);
  const ms = Date.parse(hasZone ? str : `${str}+03:00`);
  return Number.isFinite(ms) ? ms : null;
}

// Next occurrence of schedule.runAt (Bahrain wall clock) strictly after
// `fromMs`. Mirrors the client's computeNextRun, in explicit UTC+3.
function computeNextRunMs(schedule, fromMs) {
  if (!schedule?.runAt) return null;
  const [hh, mm] = String(schedule.runAt).split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  // Work on the Bahrain wall clock by shifting into "UTC+3 as if UTC".
  const local = fromMs + BAHRAIN_OFFSET_MS;
  const d = new Date(local);
  d.setUTCHours(hh, mm, 0, 0);
  if (d.getTime() <= local) d.setUTCDate(d.getUTCDate() + 1);
  if (schedule.frequency === "weekly") {
    const target = Number.isFinite(schedule.weekday) ? schedule.weekday : 1; // default Mon
    while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  } else if (schedule.frequency === "monthly") {
    const target = Number.isFinite(schedule.monthDay) ? schedule.monthDay : 1;
    d.setUTCDate(target);
    if (d.getTime() <= local) {
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(target);
    }
  }
  return d.getTime() - BAHRAIN_OFFSET_MS;
}

// ── Supabase REST (service-role) ────────────────────────────────────────────
function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url: url ? String(url).replace(/\/$/, "") : null, key: key || null };
}

async function fetchTable(env, table) {
  const r = await fetch(`${env.url}/rest/v1/${table}?select=id,data`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text().then((t) => t.slice(0, 120))}`);
  const rows = await r.json();
  return rows.map((row) => row.data || {});
}

async function fetchSingletonValue(env, key) {
  const r = await fetch(`${env.url}/rest/v1/singletons?key=eq.${key}&select=value`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0]?.value ?? null;
}

async function patchScheduleRow(env, id, record) {
  const r = await fetch(`${env.url}/rest/v1/report_schedules?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: env.key, Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({ data: record }),
  });
  if (!r.ok) throw new Error(`patch ${id}: ${r.status}`);
}

export default async function handler(req, res) {
  // Shared-secret gate — this endpoint can email people, so no free access.
  const secret = process.env.REPORTS_CRON_SECRET;
  const given = (req.query && req.query.key) || req.headers["x-cron-key"] || "";
  if (!secret) return res.status(500).json({ ok: false, error: "REPORTS_CRON_SECRET is not set in Vercel env." });
  if (String(given) !== String(secret)) return res.status(401).json({ ok: false, error: "Bad or missing key." });
  const dry = String((req.query && req.query.dry) || "") === "1";

  const env = supabaseEnv();
  if (!env.url || !env.key) {
    return res.status(500).json({ ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing." });
  }

  const nowMs = Date.now();

  // 1. Which schedules are due?
  let schedules;
  try {
    schedules = await fetchTable(env, "report_schedules");
  } catch (e) {
    return res.status(200).json({ ok: false, error: `Could not load schedules: ${e.message}` });
  }
  const due = schedules.filter((s) => {
    if (!s || s.enabled === false || !s.runAt) return false;
    const next = parseTs(s.nextRunAt)
      ?? computeNextRunMs(s, parseTs(s.lastRunAt) ?? (nowMs - 60 * 60 * 1000));
    return next != null && next <= nowMs;
  });

  if (due.length === 0) {
    return res.status(200).json({ ok: true, checked: schedules.length, due: [], sent: 0 });
  }
  if (dry) {
    return res.status(200).json({ ok: true, dry: true, checked: schedules.length, due: due.map((s) => s.id) });
  }

  // 2. Load the data the report builders need (one pass, shared by all due
  //    schedules) + the SMTP config.
  let data;
  try {
    const [
      activities, bookings, payments, invoices, agreements, agencies,
      adminUsers, maintenanceJobs, maintenanceVendors, roomUnits, tax,
    ] = await Promise.all([
      fetchTable(env, "activities"), fetchTable(env, "bookings"),
      fetchTable(env, "payments"), fetchTable(env, "invoices"),
      fetchTable(env, "agreements"), fetchTable(env, "agencies"),
      fetchTable(env, "admin_users"), fetchTable(env, "maintenance_jobs"),
      fetchTable(env, "maintenance_vendors"), fetchTable(env, "room_units"),
      fetchSingletonValue(env, "tax"),
    ]);
    data = {
      activities, bookings, payments, invoices, agreements, agencies,
      adminUsers, maintenanceJobs, maintenanceVendors, roomUnits,
      tax: tax || { components: [] },
      calendar: {}, // calendar overrides are client-session state (not persisted)
    };
  } catch (e) {
    return res.status(200).json({ ok: false, error: `Could not load report data: ${e.message}` });
  }

  const { config, error: cfgErr } = await loadSmtpConfig();
  if (cfgErr || !config) return res.status(200).json({ ok: false, error: cfgErr || "No SMTP config saved." });
  if (config.enabled === false) return res.status(200).json({ ok: false, error: "Outbound email is disabled in admin." });
  const username = String(config.username || "").trim();
  const password = String(config.password || "");
  const fromEmail = String(config.fromEmail || "").trim() || username;
  if (!config.host || !username || !password || !fromEmail) {
    return res.status(200).json({ ok: false, error: "SMTP config is incomplete." });
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport(transportOptionsFor({
      host: config.host, port: config.port, encryption: config.encryption, username, password,
    }));
  } catch (e) {
    return res.status(200).json({ ok: false, error: `Transport error: ${e.message}` });
  }
  const from = buildFromHeader({ fromName: config.fromName, fromEmail, username });
  const replyTo = config.replyTo ? String(config.replyTo) : undefined;

  const emailOk = (e) => /.+@.+\..+/.test(String(e || ""));
  const ownersWithActivity = (() => {
    const ids = new Set();
    (data.activities || []).forEach((a) => { if (a.ownerId) ids.add(a.ownerId); });
    return (data.adminUsers || []).filter((u) => ids.has(u.id) && emailOk(u.email));
  })();

  // 3. Run each due schedule (fail-soft per schedule).
  const results = [];
  for (const s of due) {
    let sent = 0, failed = 0, lastError = null;
    try {
      const scopeBase = s.kind === "maintenance" ? { windowDays: 7 } : {};
      const base = (s.recipients || []).filter(emailOk);
      if (base.length) {
        const email = buildReportEmail({ kind: s.kind, data, scope: scopeBase, anchor: new Date(nowMs) });
        try {
          await transporter.sendMail({
            from, replyTo, to: base.join(", "),
            subject: email.subject, text: email.text || "HTML report attached.", html: email.html,
          });
          sent += base.length;
        } catch (e) { failed += base.length; lastError = simplifyError(e); }
      }
      if (s.perSalesRep) {
        for (const u of ownersWithActivity) {
          const scoped = buildReportEmail({ kind: s.kind, data, scope: { ...scopeBase, ownerId: u.id }, anchor: new Date(nowMs) });
          try {
            await transporter.sendMail({
              from, replyTo, to: u.email,
              subject: scoped.subject, text: scoped.text || "HTML report attached.", html: scoped.html,
            });
            sent += 1;
          } catch (e) { failed += 1; lastError = simplifyError(e); }
        }
      }

      const status = failed === 0 ? (sent > 0 ? "sent" : "skipped") : sent === 0 ? "failed" : "partial";
      const runEntry = {
        id: `RUN-${nowMs.toString(36).toUpperCase()}`,
        runAt: new Date(nowMs).toISOString(),
        status, recipients: sent + failed, kind: "scheduled",
        ...(lastError ? { error: lastError } : {}),
      };
      const updated = {
        ...s,
        lastRunAt: new Date(nowMs).toISOString(),
        nextRunAt: new Date(computeNextRunMs(s, nowMs)).toISOString(),
        history: [runEntry, ...(Array.isArray(s.history) ? s.history : [])].slice(0, 20),
      };
      await patchScheduleRow(env, s.id, updated);
      results.push({ id: s.id, status, sent, failed, ...(lastError ? { error: lastError } : {}) });
    } catch (e) {
      results.push({ id: s.id, status: "error", sent, failed, error: e.message });
    }
  }
  transporter.close?.();

  return res.status(200).json({
    ok: true,
    checked: schedules.length,
    due: due.map((s) => s.id),
    sent: results.reduce((n, r) => n + (r.sent || 0), 0),
    results,
  });
}
