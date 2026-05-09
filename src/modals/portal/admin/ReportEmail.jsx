// ReportEmail.jsx — pure functions that turn live store data into rich
// HTML email reports. Each report kind (activities · revenue · availability)
// has its own template; all share a brand-aligned shell so guest, partner
// and operator emails sit in one consistent visual family.
//
// Usage:
//   const { subject, html, text } = buildReportEmail({
//     kind: "activities",
//     data: storeSnapshot(),
//     scope: { ownerId: "ADM-006" },   // optional per-sales-rep slice
//     anchor: new Date(),
//   });
//
// When the production cron service goes live, the worker imports these same
// builders and pipes the HTML into SendGrid / SES — no UI dependency. The
// builders are deliberately framework-free (no React import, no JSX) so they
// can run in a Node worker as-is.

import { applyTaxes, effectiveActivityStatus, ACTIVITY_KINDS, MAINTENANCE_CATEGORIES } from "../../../data/store.jsx";

// ---------------------------------------------------------------------------
// Brand palette + shared CSS
// ---------------------------------------------------------------------------
const BRAND = {
  bg:        "#FAF7F0",
  panel:     "#FFFFFF",
  panelAlt:  "#F5F1E8",
  border:    "rgba(154,126,64,0.20)",
  textHi:    "#15161A",
  textLo:    "#26282E",
  textMuted: "#6B665C",
  accent:    "#9A7E40",   // gold deep
  accentLite:"#C9A961",   // gold
  success:   "#5C8A4E",
  warn:      "#B8852E",
  danger:    "#9A3A30",
};

const HOTEL = {
  name: "The Lodge Suites",
  address: "Building 916 · Road 4019 · Block 340 · Juffair · Manama · Bahrain",
  phone: "+973 1616 8146",
  email: "frontoffice@thelodgesuites.com",
  ig: "@thelodgesuites",
};

const ROOM_LABEL = {
  studio: "Studio", "one-bed": "One-bedroom", "two-bed": "Two-bedroom", "three-bed": "Three-bedroom",
};
const ROOM_INVENTORY = { studio: 30, "one-bed": 24, "two-bed": 12, "three-bed": 6 };
const TOTAL_INVENTORY = 72;

// ─── Date helpers ────────────────────────────────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays    = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayMs      = 86400000;
const isoOf      = (d) => startOfDay(d).toISOString().slice(0, 10);
const fmtFull    = (d) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtShort   = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtDateTime= (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtBhd     = (n) => `BHD ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtPct     = (n, decimals = 1) => `${((Number(n) || 0) * 100).toFixed(decimals)}%`;

// ─── HTML escape ─────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------
// Shell — wraps every email in a consistent envelope: branded header,
// content slot, footer with hotel address + unsubscribe note.
// ---------------------------------------------------------------------------
function shell({ subject, eyebrow, intro, body, ctaUrl, ctaLabel, footerNote }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title>
<style>
  body { margin: 0; padding: 0; background: ${BRAND.bg}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Manrope, Arial, sans-serif; color: ${BRAND.textLo}; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 28px 16px; }
  .panel { background: ${BRAND.panel}; border: 1px solid ${BRAND.border}; }
  h1, h2, h3 { font-family: "Cormorant Garamond", Georgia, serif; color: ${BRAND.textHi}; font-weight: 500; margin: 0; }
  h1 { font-size: 26px; line-height: 1.2; }
  h2 { font-size: 19px; margin: 0 0 8px; }
  h3 { font-size: 15px; }
  p { margin: 0 0 12px; line-height: 1.55; font-size: 14px; color: ${BRAND.textLo}; }
  .eyebrow { font-size: 11px; letter-spacing: 0.28em; text-transform: uppercase; color: ${BRAND.accent}; font-weight: 700; margin-bottom: 6px; }
  .muted { color: ${BRAND.textMuted}; font-size: 12px; }
  .kpi-grid { display: table; width: 100%; border-collapse: separate; border-spacing: 8px; margin: 12px 0; }
  .kpi-row { display: table-row; }
  .kpi { display: table-cell; padding: 12px; border: 1px solid ${BRAND.border}; background: ${BRAND.panel}; vertical-align: top; }
  .kpi-val { font-family: "Cormorant Garamond", Georgia, serif; font-size: 24px; color: ${BRAND.textHi}; font-weight: 500; line-height: 1; }
  .kpi-lbl { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: ${BRAND.textMuted}; margin-top: 8px; font-weight: 700; }
  .kpi-hint { font-size: 11px; color: ${BRAND.textMuted}; margin-top: 4px; }
  table.data { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 13px; }
  table.data th { text-align: start; padding: 10px 12px; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: ${BRAND.accent}; font-weight: 700; background: ${BRAND.panelAlt}; border-bottom: 1px solid ${BRAND.border}; }
  table.data td { padding: 10px 12px; border-top: 1px solid ${BRAND.border}; vertical-align: top; }
  .pill { display: inline-block; padding: 3px 9px; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; border: 1px solid; }
  .cta { display: inline-block; padding: 12px 22px; background: ${BRAND.accent}; color: #fff !important; text-decoration: none; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; }
  .footer { padding: 18px 12px; color: ${BRAND.textMuted}; font-size: 11px; line-height: 1.7; text-align: center; border-top: 1px solid ${BRAND.border}; margin-top: 12px; }
  .header { padding: 22px 18px; border-bottom: 2px solid ${BRAND.accent}; background: ${BRAND.panel}; }
  .header .brand { font-family: "Cormorant Garamond", Georgia, serif; font-size: 22px; color: ${BRAND.textHi}; font-style: italic; }
  .section { padding: 18px; border-bottom: 1px solid ${BRAND.border}; }
  .bar-track { background: ${BRAND.border}; height: 6px; border-radius: 3px; margin-top: 4px; }
  .bar-fill  { height: 6px; border-radius: 3px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="panel">
    <div class="header">
      <div style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: ${BRAND.accent}; font-weight: 700;">Partner Portal · Operator Brief</div>
      <div class="brand">${esc(HOTEL.name)}</div>
    </div>
    <div class="section">
      ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ""}
      <h1>${esc(subject)}</h1>
      ${intro ? `<p style="margin-top:10px;">${intro}</p>` : ""}
    </div>
    <div class="section" style="border-bottom: none;">
      ${body}
    </div>
    ${ctaUrl ? `<div class="section" style="text-align:center; border-top: 1px solid ${BRAND.border}; border-bottom: none;">
      <a href="${esc(ctaUrl)}" class="cta">${esc(ctaLabel || "Open in portal →")}</a>
    </div>` : ""}
    <div class="footer">
      ${footerNote ? `<div style="margin-bottom: 8px; color: ${BRAND.textLo};">${footerNote}</div>` : ""}
      <strong>${esc(HOTEL.name)}</strong> · ${esc(HOTEL.address)}<br>
      ${esc(HOTEL.phone)} · ${esc(HOTEL.email)} · Instagram ${esc(HOTEL.ig)}<br>
      <span style="color: ${BRAND.textMuted};">This is an internal scheduled report · do not reply directly.</span>
    </div>
  </div>
</div>
</body>
</html>`;
}

// Helper: small KPI grid (3-up). values is [{label, value, hint, color}]
function kpiGrid(items) {
  const cells = items.map((it) => `
    <td class="kpi" style="${it.color ? `border-color: ${it.color};` : ""}">
      <div class="kpi-val" ${it.color ? `style="color: ${it.color};"` : ""}>${esc(it.value)}</div>
      <div class="kpi-lbl">${esc(it.label)}</div>
      ${it.hint ? `<div class="kpi-hint">${esc(it.hint)}</div>` : ""}
    </td>
  `).join("");
  return `<table class="kpi-grid"><tr class="kpi-row">${cells}</tr></table>`;
}

function bar(pct, color) {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color || BRAND.accentLite};"></div></div>`;
}

// ---------------------------------------------------------------------------
// 1 · Activities email — sales follow-up brief
// ---------------------------------------------------------------------------
export function buildActivitiesEmail({ activities = [], adminUsers = [], scope = {}, anchor = new Date() }) {
  const owner = scope.ownerId ? adminUsers.find((u) => u.id === scope.ownerId) : null;

  const winStart = startOfDay(addDays(anchor, -6));   // last 7 days
  const winEnd   = startOfDay(anchor);

  const inWindow = (a) => {
    const dt = a.completedAt || a.scheduledAt;
    if (!dt) return false;
    const t = startOfDay(new Date(dt)).getTime();
    return t >= winStart.getTime() && t <= winEnd.getTime();
  };

  const decorated = activities
    .map((a) => ({ ...a, effective: effectiveActivityStatus(a) }))
    .filter((a) => owner ? a.ownerId === owner.id : true);

  const week = decorated.filter(inWindow);
  const todayActivities = decorated.filter((a) => isoOf(new Date(a.scheduledAt || a.completedAt || 0)) === isoOf(anchor));
  const overdue = decorated.filter((a) => a.effective === "overdue");
  const upcoming = decorated
    .filter((a) => a.effective === "scheduled" && a.scheduledAt && new Date(a.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 8);

  const completedWeek = week.filter((a) => a.effective === "completed");
  const positive      = week.filter((a) => a.outcome === "positive").length;
  const winRate       = completedWeek.length > 0 ? Math.round((positive / completedWeek.length) * 100) : null;

  // Mix by kind
  const mixByKind = {};
  ACTIVITY_KINDS.forEach((k) => { mixByKind[k.id] = 0; });
  week.forEach((a) => { mixByKind[a.kind] = (mixByKind[a.kind] || 0) + 1; });

  // Top engaged accounts (last 7 days)
  const byAccount = {};
  week.forEach((a) => {
    const key = `${a.accountKind}:${a.accountId}`;
    if (!byAccount[key]) byAccount[key] = {
      name: a.accountName, kind: a.accountKind, total: 0,
      lastTouchAt: a.completedAt || a.scheduledAt, lastKind: a.kind,
    };
    byAccount[key].total++;
    const t = a.completedAt || a.scheduledAt;
    if (t && (!byAccount[key].lastTouchAt || new Date(t) > new Date(byAccount[key].lastTouchAt))) {
      byAccount[key].lastTouchAt = t; byAccount[key].lastKind = a.kind;
    }
  });
  const topAccounts = Object.values(byAccount).sort((a, b) => b.total - a.total).slice(0, 6);

  const subject = owner
    ? `Daily activities · ${owner.name} · ${fmtFull(anchor)}`
    : `Daily sales activities · ${fmtFull(anchor)}`;

  const eyebrow = owner ? `Personal briefing for ${owner.name}` : `Team-wide briefing`;
  const intro = owner
    ? `Here's your day at a glance — open follow-ups, today's schedule, and how the last 7 days have shaped up.`
    : `Here's the team's day at a glance — schedule, overdue items, and weekly engagement.`;

  // ─ Body ─
  let body = "";

  // KPIs
  body += kpiGrid([
    { label: "Today's activities", value: todayActivities.length, hint: `${todayActivities.filter((a) => a.effective === "completed").length} done · ${todayActivities.filter((a) => a.effective === "scheduled").length} scheduled` },
    { label: "Overdue",            value: overdue.length, color: overdue.length > 0 ? BRAND.danger : BRAND.success, hint: overdue.length > 0 ? "Need follow-up" : "All caught up" },
    { label: "Last 7 days",        value: week.length, hint: `${completedWeek.length} completed · ${positive} positive` },
    { label: "Win rate",           value: winRate != null ? `${winRate}%` : "—", color: winRate != null && winRate >= 50 ? BRAND.success : BRAND.warn, hint: "Positive / completed" },
  ]);

  // Today's schedule
  if (todayActivities.length > 0) {
    body += `<h2 style="margin-top:18px;">Today's schedule</h2>`;
    body += `<table class="data"><thead><tr><th>Time</th><th>Account</th><th>Kind</th><th>Subject</th><th>Owner</th></tr></thead><tbody>`;
    todayActivities.forEach((a) => {
      const k = ACTIVITY_KINDS.find((x) => x.id === a.kind);
      body += `<tr>
        <td style="white-space:nowrap; color:${BRAND.textMuted};">${a.scheduledAt ? new Date(a.scheduledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
        <td><strong>${esc(a.accountName)}</strong><br><span class="muted">${esc(a.accountKind)}</span></td>
        <td><span class="pill" style="color:${k?.color || BRAND.accent};border-color:${k?.color || BRAND.accent};background:${(k?.color || BRAND.accent)}1F;">${esc(k?.label || a.kind)}</span></td>
        <td>${esc(a.subject || "(no subject)")}</td>
        <td class="muted">${esc(a.ownerName || "—")}</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  } else {
    body += `<h2 style="margin-top:18px;">Today's schedule</h2><p class="muted">No activities scheduled for today.</p>`;
  }

  // Overdue
  if (overdue.length > 0) {
    body += `<h2 style="color:${BRAND.danger};margin-top:18px;">Overdue · ${overdue.length}</h2>`;
    body += `<table class="data"><thead><tr><th>Account</th><th>Kind</th><th>Subject</th><th>Was due</th><th>Owner</th></tr></thead><tbody>`;
    overdue.slice(0, 8).forEach((a) => {
      const k = ACTIVITY_KINDS.find((x) => x.id === a.kind);
      body += `<tr>
        <td><strong>${esc(a.accountName)}</strong></td>
        <td><span class="pill" style="color:${k?.color || BRAND.accent};border-color:${k?.color || BRAND.accent};background:${(k?.color || BRAND.accent)}1F;">${esc(k?.label || a.kind)}</span></td>
        <td>${esc(a.subject || "(no subject)")}</td>
        <td style="color:${BRAND.danger};white-space:nowrap;">${esc(fmtShort(a.scheduledAt))}</td>
        <td class="muted">${esc(a.ownerName || "—")}</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  }

  // Upcoming
  if (upcoming.length > 0) {
    body += `<h2 style="margin-top:18px;">Upcoming this week</h2>`;
    body += `<table class="data"><thead><tr><th>When</th><th>Account</th><th>Kind</th><th>Subject</th></tr></thead><tbody>`;
    upcoming.forEach((a) => {
      const k = ACTIVITY_KINDS.find((x) => x.id === a.kind);
      body += `<tr>
        <td style="color:${BRAND.textMuted};white-space:nowrap;">${esc(fmtDateTime(a.scheduledAt))}</td>
        <td><strong>${esc(a.accountName)}</strong></td>
        <td><span class="pill" style="color:${k?.color || BRAND.accent};border-color:${k?.color || BRAND.accent};background:${(k?.color || BRAND.accent)}1F;">${esc(k?.label || a.kind)}</span></td>
        <td>${esc(a.subject || "(no subject)")}</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  }

  // Mix by kind
  if (week.length > 0) {
    body += `<h2 style="margin-top:18px;">Last 7 days · activity mix</h2>`;
    body += `<table class="data"><tbody>`;
    ACTIVITY_KINDS.forEach((k) => {
      const n = mixByKind[k.id] || 0;
      const pct = week.length > 0 ? Math.round((n / week.length) * 100) : 0;
      body += `<tr>
        <td style="width:30%;"><strong>${esc(k.label)}</strong></td>
        <td style="width:55%;">${bar(pct, k.color)}</td>
        <td style="width:15%; text-align:right; color:${BRAND.textMuted};">${n} · ${pct}%</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  }

  // Top accounts
  if (topAccounts.length > 0) {
    body += `<h2 style="margin-top:18px;">Most engaged accounts</h2>`;
    body += `<table class="data"><thead><tr><th>Account</th><th>Type</th><th>Last contact</th><th style="text-align:right;">Touches</th></tr></thead><tbody>`;
    topAccounts.forEach((a) => {
      const lastK = ACTIVITY_KINDS.find((x) => x.id === a.lastKind);
      body += `<tr>
        <td><strong>${esc(a.name)}</strong></td>
        <td><span class="muted">${esc(a.kind)}</span></td>
        <td class="muted">${esc(a.lastTouchAt ? fmtShort(a.lastTouchAt) : "—")}${lastK ? ` · ${esc(lastK.label)}` : ""}</td>
        <td style="text-align:right;color:${BRAND.accent};font-weight:700;">${a.total}</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  }

  const text = `${subject}\n\n` +
    `Today: ${todayActivities.length} · Overdue: ${overdue.length} · Last 7 days: ${week.length} (${completedWeek.length} completed, ${positive} positive)\n` +
    (overdue.length ? `\nOverdue:\n${overdue.slice(0, 8).map((a) => `  · ${a.accountName} — ${a.subject}`).join("\n")}\n` : "") +
    (upcoming.length ? `\nUpcoming:\n${upcoming.map((a) => `  · ${fmtDateTime(a.scheduledAt)} — ${a.accountName} · ${a.subject}`).join("\n")}\n` : "");

  return {
    subject, html: shell({ subject, eyebrow, intro, body, ctaUrl: "https://portal.thelodgesuites.com/activities", ctaLabel: "Open Activities →", footerNote: owner ? `Personal briefing for ${owner.name} · ${owner.email || ""}` : "" }), text,
  };
}

// ---------------------------------------------------------------------------
// 2 · Revenue email — financial snapshot with per-sales-rep contribution
// ---------------------------------------------------------------------------
export function buildRevenueEmail({ bookings = [], payments = [], invoices = [], tax = { components: [] }, agreements = [], agencies = [], activities = [], adminUsers = [], scope = {}, anchor = new Date() }) {
  const owner = scope.ownerId ? adminUsers.find((u) => u.id === scope.ownerId) : null;

  // Default window = yesterday (single day) for daily morning sends; we also
  // surface MTD totals so leadership can see the trajectory.
  const dayEnd   = startOfDay(anchor);
  const dayStart = startOfDay(addDays(anchor, -1));
  const monthStart = new Date(dayEnd.getFullYear(), dayEnd.getMonth(), 1);

  const recognise = (windowStart, windowEnd) => {
    const winStartMs = windowStart.getTime();
    const winEndMs   = windowEnd.getTime() + dayMs;
    const out = [];
    bookings.forEach((b) => {
      if (b.status === "cancelled") return;
      const ci = startOfDay(new Date(b.checkIn)).getTime();
      const co = startOfDay(new Date(b.checkOut)).getTime();
      const overlapStart = Math.max(ci, winStartMs);
      const overlapEnd   = Math.min(co, winEndMs);
      const nights = Math.max(0, Math.round((overlapEnd - overlapStart) / dayMs));
      if (nights === 0) return;
      const rate = b.rate || (b.total / Math.max(1, b.nights || 1));
      out.push({ booking: b, nights, revenue: rate * nights, rate });
    });
    return out;
  };

  const dayRecs   = recognise(dayStart, dayStart);
  const monthRecs = recognise(monthStart, dayEnd);

  const tot = (recs) => {
    const revenue = recs.reduce((s, r) => s + r.revenue, 0);
    const nights  = recs.reduce((s, r) => s + r.nights,  0);
    return { revenue, nights, adr: nights ? revenue / nights : 0 };
  };
  const day   = tot(dayRecs);
  const month = tot(monthRecs);

  const dayInventory   = TOTAL_INVENTORY * 1;
  const monthInventory = TOTAL_INVENTORY * (Math.round((dayEnd - monthStart) / dayMs) + 1);
  const dayOcc   = day.nights / Math.max(1, dayInventory);
  const monthOcc = month.nights / Math.max(1, monthInventory);
  const dayRevpar   = day.revenue / Math.max(1, dayInventory);
  const monthRevpar = month.revenue / Math.max(1, monthInventory);

  // Tax + cash
  const taxBreakdown = applyTaxes(day.revenue, tax, Math.max(1, day.nights));
  const taxCollected = taxBreakdown?.totalTax || 0;

  const dayPayments = payments.filter((p) => {
    if (!p.ts) return false;
    const t = startOfDay(new Date(p.ts)).getTime();
    return t === dayStart.getTime();
  });
  const captured = dayPayments.filter((p) => p.status === "captured").reduce((s, p) => s + (p.amount || 0), 0);
  const refunded = dayPayments.filter((p) => p.status === "refunded").reduce((s, p) => s + (p.amount || 0), 0);

  const ar = invoices.filter((i) => i.status !== "paid");
  const arTotal   = ar.reduce((s, i) => s + ((i.amount || 0) - (i.paid || 0)), 0);
  const overdueAR = ar.filter((i) => i.status === "overdue").length;

  // Source split (yesterday)
  const bySource = {};
  dayRecs.forEach((r) => {
    const k = r.booking.source;
    if (!bySource[k]) bySource[k] = { revenue: 0, nights: 0 };
    bySource[k].revenue += r.revenue;
    bySource[k].nights  += r.nights;
  });

  // Per-sales-rep contribution — attribute revenue from a corporate/agent
  // booking to the sales rep who has logged the most activities against
  // that account. (When the real "account owner" field lands, swap this
  // for the explicit relationship.)
  const ownerByAccount = (() => {
    const counts = {};   // `${kind}:${id}` -> { ownerId, ownerName, n }
    activities.forEach((a) => {
      if (!a.ownerId) return;
      const key = `${a.accountKind}:${a.accountId}`;
      if (!counts[key]) counts[key] = {};
      counts[key][a.ownerId] = (counts[key][a.ownerId] || 0) + 1;
    });
    const out = {};
    Object.entries(counts).forEach(([key, m]) => {
      const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
      if (top) out[key] = top[0];
    });
    return out;
  })();

  const repRows = (() => {
    const out = {};
    monthRecs.forEach((r) => {
      const b = r.booking;
      let accKey = null;
      if (b.source === "corporate" && b.accountId) accKey = `corporate:${b.accountId}`;
      else if (b.source === "agent" && b.agencyId)  accKey = `agent:${b.agencyId}`;
      const ownerId = accKey ? ownerByAccount[accKey] : null;
      const u = ownerId ? adminUsers.find((x) => x.id === ownerId) : null;
      const key = u?.id || "(unattributed)";
      if (!out[key]) out[key] = { name: u?.name || "Unattributed (direct / OTA)", revenue: 0, nights: 0, accounts: new Set() };
      out[key].revenue += r.revenue;
      out[key].nights  += r.nights;
      if (accKey) out[key].accounts.add(accKey);
    });
    return Object.values(out).map((r) => ({ ...r, accounts: r.accounts.size }))
      .sort((a, b) => b.revenue - a.revenue);
  })();

  // Subject + intro
  const subject = owner
    ? `Daily revenue · ${owner.name} · ${fmtFull(dayStart)}`
    : `Daily revenue snapshot · ${fmtFull(dayStart)}`;
  const eyebrow = owner ? `Personal contribution view for ${owner.name}` : "Property-wide view";
  const intro = owner
    ? `Here's the revenue snapshot for ${fmtFull(dayStart)} with your contribution highlighted across the corporate and agent accounts you steward.`
    : `Here's the revenue snapshot for ${fmtFull(dayStart)} with month-to-date trajectory and per-sales-rep contribution.`;

  let body = "";

  // Top KPIs (yesterday)
  body += `<h2>Yesterday · ${esc(fmtFull(dayStart))}</h2>`;
  body += kpiGrid([
    { label: "Room revenue", value: fmtBhd(day.revenue), color: BRAND.accent },
    { label: "ADR",          value: fmtBhd(day.adr),     hint: `${day.nights} room-nights` },
    { label: "Occupancy",    value: fmtPct(dayOcc),      color: dayOcc >= 0.7 ? BRAND.success : dayOcc >= 0.5 ? BRAND.warn : BRAND.textMuted, hint: `${day.nights} of ${dayInventory}` },
    { label: "RevPAR",       value: fmtBhd(dayRevpar) },
  ]);

  // MTD
  body += `<h2 style="margin-top:18px;">Month-to-date · ${esc(fmtShort(monthStart))} → ${esc(fmtShort(dayEnd))}</h2>`;
  body += kpiGrid([
    { label: "MTD revenue",  value: fmtBhd(month.revenue), color: BRAND.accent },
    { label: "MTD ADR",      value: fmtBhd(month.adr) },
    { label: "MTD occupancy",value: fmtPct(monthOcc),      color: monthOcc >= 0.7 ? BRAND.success : monthOcc >= 0.5 ? BRAND.warn : BRAND.textMuted, hint: `${month.nights.toLocaleString()} nights` },
    { label: "MTD RevPAR",   value: fmtBhd(monthRevpar) },
  ]);

  // Cash + AR
  body += `<h2 style="margin-top:18px;">Cash & receivables</h2>`;
  body += kpiGrid([
    { label: "Captured (yesterday)", value: fmtBhd(captured),  color: BRAND.success },
    { label: "Refunds (yesterday)",  value: fmtBhd(refunded),  color: refunded > 0 ? BRAND.danger : BRAND.textMuted },
    { label: "Tax collected (est.)", value: fmtBhd(taxCollected) },
    { label: "Outstanding A/R",      value: fmtBhd(arTotal),   color: overdueAR > 0 ? BRAND.danger : BRAND.warn, hint: `${overdueAR} overdue invoice${overdueAR === 1 ? "" : "s"}` },
  ]);

  // Source mix (yesterday)
  if (Object.keys(bySource).length) {
    const SOURCE_LABEL = { direct: "Direct", ota: "OTA", corporate: "Corporate", agent: "Travel agent", walk: "Walk-in" };
    const SOURCE_COLOR = { direct: "#16A34A", ota: "#2563EB", corporate: "#D97706", agent: "#7C3AED", walk: "#0891B2" };
    body += `<h2 style="margin-top:18px;">Yesterday · channel mix</h2>`;
    body += `<table class="data"><tbody>`;
    Object.entries(bySource).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([src, v]) => {
      const pct = day.revenue > 0 ? Math.round((v.revenue / day.revenue) * 100) : 0;
      body += `<tr>
        <td style="width:30%;"><strong>${esc(SOURCE_LABEL[src] || src)}</strong></td>
        <td style="width:55%;">${bar(pct, SOURCE_COLOR[src] || BRAND.accent)}</td>
        <td style="width:15%; text-align:right; color:${BRAND.textMuted};">${fmtBhd(v.revenue)} · ${pct}%</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  }

  // Per-sales-rep contribution (MTD)
  if (repRows.length > 0) {
    body += `<h2 style="margin-top:18px;">Per-sales-rep contribution · MTD</h2>`;
    body += `<p class="muted" style="margin-top:-4px;">Attributed by activity ownership across corporate and agent accounts. "Unattributed" covers direct + OTA bookings.</p>`;
    body += `<table class="data"><thead><tr><th>Sales rep</th><th style="text-align:right;">Accounts</th><th style="text-align:right;">Nights</th><th style="text-align:right;">Revenue</th></tr></thead><tbody>`;
    repRows.forEach((r) => {
      const isOwner = owner && (r.name === owner.name);
      body += `<tr ${isOwner ? `style="background:${BRAND.accent}10;"` : ""}>
        <td><strong>${esc(r.name)}</strong>${isOwner ? ` <span class="pill" style="margin-inline-start:6px;color:${BRAND.accent};border-color:${BRAND.accent};background:${BRAND.accent}1F;">YOU</span>` : ""}</td>
        <td style="text-align:right;color:${BRAND.textMuted};">${r.accounts}</td>
        <td style="text-align:right;">${r.nights}</td>
        <td style="text-align:right;color:${BRAND.accent};font-weight:700;">${fmtBhd(r.revenue)}</td>
      </tr>`;
    });
    body += `</tbody></table>`;
  }

  const text = `${subject}\n\nYesterday: ${fmtBhd(day.revenue)} (${day.nights} nights, ${fmtPct(dayOcc, 1)} occupancy)\nMTD: ${fmtBhd(month.revenue)} (${month.nights} nights, ${fmtPct(monthOcc, 1)} occupancy)\nA/R: ${fmtBhd(arTotal)} (${overdueAR} overdue)\n`;

  return {
    subject, html: shell({ subject, eyebrow, intro, body, ctaUrl: "https://portal.thelodgesuites.com/admin/reports", ctaLabel: "Open Reports →" }), text,
  };
}

// ---------------------------------------------------------------------------
// 3 · Availability email — 30-day forward inventory
// ---------------------------------------------------------------------------
export function buildAvailabilityEmail({ bookings = [], calendar = {}, anchor = new Date() }) {
  const start = startOfDay(anchor);
  const days = 30;

  const grid = [];
  for (let i = 0; i < days; i++) {
    const d = startOfDay(addDays(start, i));
    const iso = d.toISOString().slice(0, 10);
    const ts  = d.getTime();
    const row = { date: iso, byRoom: {}, total: { sold: 0, units: 0, stopSale: false } };
    Object.entries(ROOM_INVENTORY).forEach(([roomId, units]) => {
      const sold = bookings.filter((b) => {
        if (b.status === "cancelled") return false;
        if (b.roomId !== roomId) return false;
        const ci = startOfDay(new Date(b.checkIn)).getTime();
        const co = startOfDay(new Date(b.checkOut)).getTime();
        return ts >= ci && ts < co;
      }).length;
      const ov = calendar[`${roomId}|${iso}`];
      const stopSale = !!ov?.stopSale;
      row.byRoom[roomId] = { sold, units, stopSale };
      row.total.sold  += sold;
      row.total.units += units;
      if (stopSale) row.total.stopSale = true;
    });
    grid.push(row);
  }

  const totalCapacity   = grid.reduce((s, d) => s + d.total.units, 0);
  const totalSold       = grid.reduce((s, d) => s + d.total.sold, 0);
  const totalAvailable  = totalCapacity - totalSold;
  const avgOcc          = totalSold / Math.max(1, totalCapacity);

  const peakDay = grid.reduce((m, d) => {
    const occ = d.total.sold / d.total.units;
    return occ > m.occ ? { date: d.date, occ } : m;
  }, { date: "", occ: 0 });
  const lowDay = grid.reduce((m, d) => {
    const occ = d.total.sold / d.total.units;
    return occ < m.occ ? { date: d.date, occ } : m;
  }, { date: "", occ: 1 });
  const sellOutDays  = grid.filter((d) => d.total.sold >= d.total.units).length;
  const stopSaleDays = grid.filter((d) => d.total.stopSale).length;

  // Cell color
  const cellColor = (sold, units, stopSale) => {
    if (stopSale) return { bg: "#9A3A30" + "30", fg: "#9A3A30" };
    if (sold >= units)   return { bg: "#9A3A30" + "30", fg: "#9A3A30" };
    const occ = sold / units;
    if (occ >= 0.85) return { bg: "#B8852E" + "30", fg: "#B8852E" };
    if (occ >= 0.6)  return { bg: "#B8852E" + "15", fg: BRAND.textHi };
    if (occ >= 0.3)  return { bg: "#5C8A4E" + "15", fg: BRAND.textHi };
    return { bg: "#5C8A4E" + "25", fg: "#5C8A4E" };
  };

  const subject = `30-day availability forecast · from ${fmtFull(start)}`;
  const eyebrow = `Forward inventory · ${days} days`;
  const intro = `Here's the next 30 days of availability across the 72 suites — broken down by suite type. Cells show <em>rooms still available</em>; ✕ indicates a stop-sale day.`;

  let body = "";

  // KPIs
  body += kpiGrid([
    { label: "Avg occupancy", value: fmtPct(avgOcc, 1), color: avgOcc >= 0.7 ? BRAND.success : avgOcc >= 0.5 ? BRAND.warn : BRAND.textMuted, hint: `${totalSold.toLocaleString()} / ${totalCapacity.toLocaleString()}` },
    { label: "Available nights", value: totalAvailable.toLocaleString(), color: BRAND.accent, hint: "Across 30 days" },
    { label: "Sell-out days",    value: sellOutDays, color: sellOutDays > 0 ? BRAND.danger : BRAND.success },
    { label: "Stop-sale days",   value: stopSaleDays, color: stopSaleDays > 0 ? BRAND.danger : BRAND.success },
  ]);

  // Forecast notes
  body += `<h2 style="margin-top:18px;">Forecast highlights</h2>`;
  body += `<table class="data"><tbody>`;
  if (peakDay.date) body += `<tr><td style="width:35%;"><strong style="color:${BRAND.warn};">Peak demand</strong></td><td>${esc(fmtFull(peakDay.date))} · ${fmtPct(peakDay.occ, 0)} occupancy. Consider rate uplift / yield rules.</td></tr>`;
  if (lowDay.date)  body += `<tr><td><strong style="color:${BRAND.success};">Lowest demand</strong></td><td>${esc(fmtFull(lowDay.date))} · ${fmtPct(lowDay.occ, 0)} occupancy. Push promotions or last-minute deals.</td></tr>`;
  if (sellOutDays > 0) body += `<tr><td><strong style="color:${BRAND.danger};">Sell-out days</strong></td><td>${sellOutDays} day${sellOutDays === 1 ? "" : "s"} fully booked — push waitlist offers.</td></tr>`;
  if (stopSaleDays > 0) body += `<tr><td><strong>Stop-sale days</strong></td><td>${stopSaleDays} day${stopSaleDays === 1 ? "" : "s"} closed via calendar overrides — review before re-opening.</td></tr>`;
  body += `</tbody></table>`;

  // Heatmap (split into weeks of ~10 columns each so email clients render it cleanly)
  const chunkSize = 10;
  for (let off = 0; off < grid.length; off += chunkSize) {
    const chunk = grid.slice(off, off + chunkSize);
    body += `<h3 style="margin-top:14px;">${esc(fmtShort(chunk[0].date))} → ${esc(fmtShort(chunk[chunk.length - 1].date))}</h3>`;
    body += `<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:-apple-system,'Manrope',Arial,sans-serif;margin-bottom:8px;"><thead><tr>`;
    body += `<th style="text-align:start;padding:6px 8px;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.accent};font-weight:700;background:${BRAND.panelAlt};border-bottom:1px solid ${BRAND.border};white-space:nowrap;">Suite</th>`;
    chunk.forEach((d) => {
      const dt = new Date(d.date);
      const dow = dt.getDay();
      const isWeekend = dow === 5 || dow === 6;
      body += `<th style="text-align:center;padding:6px 4px;font-size:9px;color:${isWeekend ? BRAND.warn : BRAND.textMuted};font-weight:${isWeekend ? 700 : 500};background:${BRAND.panelAlt};border-bottom:1px solid ${BRAND.border};">${dt.getDate()}</th>`;
    });
    body += `</tr></thead><tbody>`;
    Object.entries(ROOM_INVENTORY).forEach(([roomId, units]) => {
      body += `<tr><td style="padding:6px 8px;border-top:1px solid ${BRAND.border};font-family:'Cormorant Garamond',Georgia,serif;font-size:13px;color:${BRAND.textHi};white-space:nowrap;"><strong>${esc(ROOM_LABEL[roomId])}</strong> <span class="muted" style="font-size:10px;">${units}</span></td>`;
      chunk.forEach((d) => {
        const v = d.byRoom[roomId];
        const c = cellColor(v.sold, v.units, v.stopSale);
        const avail = v.units - v.sold;
        body += `<td style="text-align:center;padding:6px 4px;border-top:1px solid ${BRAND.border};background:${c.bg};color:${c.fg};font-weight:700;font-variant-numeric:tabular-nums;">${v.stopSale ? "✕" : v.sold === 0 ? "" : avail}</td>`;
      });
      body += `</tr>`;
    });
    // Total row
    body += `<tr style="background:${BRAND.panelAlt};"><td style="padding:6px 8px;border-top:1px solid ${BRAND.border};color:${BRAND.accent};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;white-space:nowrap;">Total · ${TOTAL_INVENTORY}</td>`;
    chunk.forEach((d) => {
      const c = cellColor(d.total.sold, d.total.units, d.total.stopSale);
      const avail = d.total.units - d.total.sold;
      body += `<td style="text-align:center;padding:6px 4px;border-top:1px solid ${BRAND.border};background:${c.bg};color:${c.fg};font-weight:700;font-variant-numeric:tabular-nums;">${avail}</td>`;
    });
    body += `</tr></tbody></table>`;
  }

  body += `<p class="muted" style="margin-top:14px;font-size:11px;">Legend · numbers are rooms still available · ✕ stop-sale · weekends in amber.</p>`;

  const text = `${subject}\n\nAvg occupancy: ${fmtPct(avgOcc, 1)}\nAvailable nights: ${totalAvailable.toLocaleString()}\nSell-out days: ${sellOutDays}\nStop-sale days: ${stopSaleDays}\nPeak: ${peakDay.date ? fmtShort(peakDay.date) : "—"}\nLowest: ${lowDay.date ? fmtShort(lowDay.date) : "—"}\n`;

  return {
    subject,
    html: shell({ subject, eyebrow, intro, body, ctaUrl: "https://portal.thelodgesuites.com/admin/reports", ctaLabel: "Open Availability →" }),
    text,
  };
}

// ---------------------------------------------------------------------------
// 4 · Maintenance email — operations digest covering spend, vendors, rooms
// and outstanding open jobs. Default window: last 7 days. The cron worker
// passes the same `anchor` and `windowDays` shape the UI uses, so the
// scheduled email and the on-screen Maintenance report stay numerically
// aligned.
// ---------------------------------------------------------------------------
export function buildMaintenanceEmail({
  maintenanceJobs = [], maintenanceVendors = [], roomUnits = [],
  windowDays = 7, anchor = new Date(),
}) {
  const end   = startOfDay(anchor);
  const start = startOfDay(addDays(end, -(windowDays - 1)));

  const inWindow = maintenanceJobs.filter((j) => {
    if (j.status !== "completed" || !j.completedAt) return false;
    const t = startOfDay(new Date(j.completedAt)).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });

  const totalSpend = inWindow.reduce((s, j) => s + (j.totalCost  || 0), 0);
  const partsSpend = inWindow.reduce((s, j) => s + (j.productCost || 0), 0);
  const laborSpend = inWindow.reduce((s, j) => s + (j.laborCost  || 0), 0);
  const jobCount   = inWindow.length;
  const avgPerJob  = jobCount > 0 ? totalSpend / jobCount : 0;

  // Resolution timing
  const resHours = inWindow
    .map((j) => (j.reportedAt && j.completedAt) ? (new Date(j.completedAt) - new Date(j.reportedAt)) / 3600000 : null)
    .filter((h) => h != null && h > 0);
  const avgResolution = resHours.length > 0 ? resHours.reduce((s, h) => s + h, 0) / resHours.length : 0;

  // Open + critical
  const openJobs    = (maintenanceJobs || []).filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const criticalOpen = openJobs.filter((j) => j.priority === "critical");

  // By category
  const catLabel = Object.fromEntries((MAINTENANCE_CATEGORIES || []).map((c) => [c.id, c.label]));
  const catColor = Object.fromEntries((MAINTENANCE_CATEGORIES || []).map((c) => [c.id, c.color]));
  const byCategory = {};
  (MAINTENANCE_CATEGORIES || []).forEach((c) => { byCategory[c.id] = { id: c.id, label: c.label, color: c.color, total: 0, count: 0 }; });
  inWindow.forEach((j) => {
    if (!byCategory[j.category]) byCategory[j.category] = { id: j.category, label: catLabel[j.category] || j.category, color: catColor[j.category] || BRAND.accent, total: 0, count: 0 };
    byCategory[j.category].total += j.totalCost || 0;
    byCategory[j.category].count += 1;
  });
  const categoryRows = Object.values(byCategory).filter((c) => c.count > 0).sort((a, b) => b.total - a.total);
  const topCategory  = categoryRows[0];

  // By vendor
  const byVendor = {};
  inWindow.forEach((j) => {
    const id = j.vendorId || "—";
    if (!byVendor[id]) {
      const v = (maintenanceVendors || []).find((x) => x.id === j.vendorId);
      byVendor[id] = { id, name: v?.name || j.vendorName || "Unassigned", total: 0, count: 0 };
    }
    byVendor[id].total += j.totalCost || 0;
    byVendor[id].count += 1;
  });
  const vendorRows = Object.values(byVendor).sort((a, b) => b.total - a.total).slice(0, 8);

  // By room (top 8 spenders)
  const byRoom = {};
  inWindow.forEach((j) => {
    const num = (j.unitNumber || "").trim() || "(no unit)";
    if (!byRoom[num]) {
      const u = (roomUnits || []).find((x) => x.number === num) || null;
      byRoom[num] = { number: num, roomTypeId: j.roomId || u?.roomTypeId, total: 0, count: 0 };
    }
    byRoom[num].total += j.totalCost || 0;
    byRoom[num].count += 1;
  });
  const roomRows = Object.values(byRoom).sort((a, b) => b.total - a.total).slice(0, 8);

  // Subject + intro
  const subject = `Maintenance digest · ${fmtShort(start)} → ${fmtShort(end)} · ${fmtBhd(totalSpend)}`;
  const eyebrow = `${windowDays}-day operations digest`;
  const intro = `Maintenance spend, top vendors and rooms across the last ${windowDays} days. There ${openJobs.length === 1 ? "is" : "are"} <strong>${openJobs.length}</strong> open job${openJobs.length === 1 ? "" : "s"}${criticalOpen.length > 0 ? ` — including <strong style="color:${BRAND.danger};">${criticalOpen.length} critical</strong>` : ""}.`;

  let body = "";

  // KPI tile row
  body += kpiGrid([
    { label: "Total spend", value: fmtBhd(totalSpend), color: BRAND.accent, hint: `Parts ${fmtBhd(partsSpend)} · Labor ${fmtBhd(laborSpend)}` },
    { label: "Jobs done",   value: jobCount,           hint: jobCount > 0 ? `Avg ${fmtBhd(avgPerJob)}/job` : "—" },
    { label: "Avg resolution", value: avgResolution > 0 ? `${avgResolution.toFixed(1)}h` : "—", hint: "Reported → completed" },
    { label: "Open jobs", value: openJobs.length, color: criticalOpen.length > 0 ? BRAND.danger : BRAND.textHi, hint: criticalOpen.length > 0 ? `${criticalOpen.length} critical` : "No criticals" },
  ]);

  // Critical-job alert (if any)
  if (criticalOpen.length > 0) {
    body += `<h2 style="margin-top:20px;color:${BRAND.danger};">Critical open jobs · ${criticalOpen.length}</h2>`;
    body += `<table class="data"><thead><tr><th>Reported</th><th>Job</th><th>Room</th><th>Vendor</th><th>Status</th></tr></thead><tbody>`;
    criticalOpen.slice(0, 8).forEach((j) => {
      body += `<tr>`;
      body += `<td style="white-space:nowrap;color:${BRAND.textMuted};">${esc(fmtDateTime(j.reportedAt || ""))}</td>`;
      body += `<td><strong>${esc(j.title || "")}</strong><br><span class="muted">${esc(j.id || "")}</span></td>`;
      body += `<td>#${esc(j.unitNumber || "—")}</td>`;
      body += `<td class="muted">${esc(j.vendorName || "—")}</td>`;
      body += `<td><span class="pill" style="color:${BRAND.danger};border-color:${BRAND.danger};background:${BRAND.danger}15;">${esc(j.status || "open")}</span></td>`;
      body += `</tr>`;
    });
    body += `</tbody></table>`;
  }

  // Spend by category
  if (categoryRows.length > 0) {
    body += `<h2 style="margin-top:20px;">Spend by category</h2>`;
    body += `<table class="data"><thead><tr><th>Category</th><th align="right">Jobs</th><th align="right">Spend</th><th>Share</th></tr></thead><tbody>`;
    categoryRows.forEach((c) => {
      const pct = totalSpend > 0 ? Math.round((c.total / totalSpend) * 100) : 0;
      body += `<tr>`;
      body += `<td><span class="pill" style="color:${c.color};border-color:${c.color};background:${c.color}15;">${esc(c.label)}</span></td>`;
      body += `<td align="right">${c.count}</td>`;
      body += `<td align="right" style="font-variant-numeric:tabular-nums;color:${BRAND.accent};font-weight:700;">${fmtBhd(c.total)}</td>`;
      body += `<td style="width:30%;">${bar(pct, c.color)} <span class="muted" style="display:block;margin-top:3px;">${pct}%</span></td>`;
      body += `</tr>`;
    });
    body += `</tbody></table>`;
  }

  // Vendor leaderboard
  if (vendorRows.length > 0) {
    body += `<h2 style="margin-top:20px;">Top vendors · ${vendorRows.length}</h2>`;
    body += `<table class="data"><thead><tr><th>Vendor</th><th align="right">Jobs</th><th align="right">Spend</th><th align="right">Avg / job</th><th align="right">Share</th></tr></thead><tbody>`;
    vendorRows.forEach((v) => {
      const pct = totalSpend > 0 ? Math.round((v.total / totalSpend) * 100) : 0;
      const avg = v.count > 0 ? v.total / v.count : 0;
      body += `<tr>`;
      body += `<td><strong>${esc(v.name)}</strong>${v.id !== "—" ? `<br><span class="muted">${esc(v.id)}</span>` : ""}</td>`;
      body += `<td align="right">${v.count}</td>`;
      body += `<td align="right" style="font-variant-numeric:tabular-nums;color:${BRAND.accent};font-weight:700;">${fmtBhd(v.total)}</td>`;
      body += `<td align="right" class="muted" style="font-variant-numeric:tabular-nums;">${fmtBhd(avg)}</td>`;
      body += `<td align="right" class="muted">${pct}%</td>`;
      body += `</tr>`;
    });
    body += `</tbody></table>`;
  }

  // Room leaderboard
  if (roomRows.length > 0) {
    body += `<h2 style="margin-top:20px;">Top spend rooms · ${roomRows.length}</h2>`;
    body += `<table class="data"><thead><tr><th>Room</th><th>Suite type</th><th align="right">Jobs</th><th align="right">Spend</th><th align="right">Share</th></tr></thead><tbody>`;
    roomRows.forEach((r) => {
      const pct = totalSpend > 0 ? Math.round((r.total / totalSpend) * 100) : 0;
      body += `<tr>`;
      body += `<td><strong style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;">#${esc(r.number)}</strong></td>`;
      body += `<td class="muted">${esc(ROOM_LABEL[r.roomTypeId] || r.roomTypeId || "—")}</td>`;
      body += `<td align="right">${r.count}</td>`;
      body += `<td align="right" style="font-variant-numeric:tabular-nums;color:${BRAND.accent};font-weight:700;">${fmtBhd(r.total)}</td>`;
      body += `<td align="right" class="muted">${pct}%</td>`;
      body += `</tr>`;
    });
    body += `</tbody></table>`;
  }

  if (jobCount === 0 && openJobs.length === 0) {
    body += `<p class="muted" style="margin-top:14px;">No maintenance activity in this window.</p>`;
  }

  body += `<p class="muted" style="margin-top:16px;font-size:11px;">Top category: ${topCategory ? `<strong>${esc(topCategory.label)}</strong> · ${fmtBhd(topCategory.total)}` : "—"} · Window: ${esc(fmtFull(start))} → ${esc(fmtFull(end))}.</p>`;

  const text = `${subject}

Spend: ${fmtBhd(totalSpend)} (Parts ${fmtBhd(partsSpend)} · Labor ${fmtBhd(laborSpend)})
Jobs done: ${jobCount}
Avg resolution: ${avgResolution > 0 ? avgResolution.toFixed(1) + "h" : "—"}
Open jobs: ${openJobs.length}${criticalOpen.length > 0 ? ` (${criticalOpen.length} critical)` : ""}
Top category: ${topCategory ? topCategory.label + " · " + fmtBhd(topCategory.total) : "—"}
Window: ${fmtFull(start)} → ${fmtFull(end)}
`;

  return {
    subject,
    html: shell({
      subject, eyebrow, intro, body,
      ctaUrl: "https://portal.thelodgesuites.com/admin/maintenance",
      ctaLabel: "Open Maintenance →",
    }),
    text,
  };
}

// ---------------------------------------------------------------------------
// Dispatch — picks the right builder based on schedule.kind
// ---------------------------------------------------------------------------
export function buildReportEmail({ kind, data, scope = {}, anchor = new Date() }) {
  const safe = data || {};
  if (kind === "activities") {
    return buildActivitiesEmail({
      activities: safe.activities || [],
      adminUsers: safe.adminUsers || [],
      scope, anchor,
    });
  }
  if (kind === "revenue") {
    return buildRevenueEmail({
      bookings: safe.bookings || [],
      payments: safe.payments || [],
      invoices: safe.invoices || [],
      tax: safe.tax || { components: [] },
      agreements: safe.agreements || [],
      agencies: safe.agencies || [],
      activities: safe.activities || [],
      adminUsers: safe.adminUsers || [],
      scope, anchor,
    });
  }
  if (kind === "availability") {
    return buildAvailabilityEmail({
      bookings: safe.bookings || [],
      calendar: safe.calendar || {},
      anchor,
    });
  }
  if (kind === "maintenance") {
    return buildMaintenanceEmail({
      maintenanceJobs:    safe.maintenanceJobs    || [],
      maintenanceVendors: safe.maintenanceVendors || [],
      roomUnits:          safe.roomUnits          || [],
      windowDays:         scope.windowDays || 7,
      anchor,
    });
  }
  return {
    subject: "Unknown report",
    html: shell({ subject: "Unknown report", body: `<p>Report kind "${esc(kind)}" is not recognised.</p>` }),
    text: "Unknown report",
  };
}
