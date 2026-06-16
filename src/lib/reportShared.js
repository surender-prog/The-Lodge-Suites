// reportShared.js — pure, server-safe primitives shared by the client store
// and the /api/run-reports scheduled-report runner. NO React, NO Supabase,
// no module state: everything here must run identically in the browser and
// in a Vercel serverless function.
//
// Moved verbatim from src/data/store.jsx (which re-exports them, so client
// imports are unchanged). If you edit tax math here, the booking flows AND
// the emailed revenue reports both pick it up.

// Apply the tax components to a net rate. Returns gross + the per-line
// breakdown for display. `nights` is used by per-night fixed components.
//
// Calculation order: components are processed in order. Compound percentage
// rates apply to (net + accumulated taxes so far); straight percentage rates
// always apply to the original net. Fixed components are unaffected.
export function applyTaxes(net, tax, nights = 1) {
  if (!tax?.components || tax.components.length === 0) {
    return { gross: net, totalTax: 0, lines: [] };
  }
  const lines = [];
  let runningBase = net;
  let totalTax = 0;
  for (const c of tax.components) {
    let amt = 0;
    if (c.type === "percentage") {
      const base = c.calculation === "compound" ? runningBase : net;
      amt = +(base * (c.rate / 100)).toFixed(3);
    } else if (c.type === "fixed") {
      const mult = c.chargePer === "stay" ? 1 : nights;
      amt = +(c.amount * mult).toFixed(3);
    }
    lines.push({
      id: c.id, name: c.name, type: c.type,
      rate: c.rate, amount: c.amount,
      calculation: c.calculation, appliesTo: c.appliesTo,
      taxAmount: amt,
    });
    runningBase += amt;
    totalTax += amt;
  }
  return { gross: +(net + totalTax).toFixed(3), totalTax: +totalTax.toFixed(3), lines };
}

// Approximate inverse: given a gross amount and the current tax config, work
// back the net. Used by the invoice/folio breakdown + the PDF document builder.
// Compound rates introduce a multiplicative interaction — we solve iteratively
// (tax is monotone in net) after removing fixed per-stay/per-night components.
export function inverseApplyTaxes(gross, tax, nights = 1) {
  if (!tax?.components || tax.components.length === 0) return gross;
  const fixed = tax.components
    .filter(c => c.type === "fixed")
    .reduce((s, c) => s + c.amount * (c.chargePer === "stay" ? 1 : nights), 0);
  const grossLessFixed = gross - fixed;
  let lo = 0, hi = grossLessFixed;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const probe = applyTaxes(mid, { components: tax.components.filter(c => c.type === "percentage") });
    if (probe.gross > grossLessFixed) hi = mid; else lo = mid;
  }
  return +((lo + hi) / 2).toFixed(3);
}

// ─── Sales activities ────────────────────────────────────────────────────
// Sales follow-up activities tied to a corporate, agent, or prospect record.
// Captures every touchpoint: field visits, tele-calls, scheduled meetings,
// outbound emails, internal tasks and free-form notes (incl. minutes of
// meetings). Activities are surfaced in two places:
//   1. Reports → Activities — period dashboard for the whole sales team
//   2. CorporateWorkspace / AgencyWorkspace → Activities — per-account log
//
// `accountKind` is "corporate" | "agent" | "prospect"; `accountId` references
// the matching record (agreement.id, agency.id, prospect.id). `accountName`
// is denormalized so a deleted account doesn't blank the activity log.
export const ACTIVITY_KINDS = [
  { id: "visit",   label: "Field visit",      color: "#16A34A", hint: "On-site sales visit at the client's office or property." },
  { id: "call",    label: "Tele-call",        color: "#0891B2", hint: "Phone call — sales, follow-up, or qualification." },
  { id: "meeting", label: "Meeting request",  color: "#7C3AED", hint: "In-house meeting, video call, or scheduled discussion." },
  { id: "email",   label: "Email",            color: "#2563EB", hint: "Outbound email — proposal, follow-up, intro pack." },
  { id: "task",    label: "Task / To-do",     color: "#D97706", hint: "Internal action item with a deadline." },
  { id: "note",    label: "Note / Minutes",   color: "#64748B", hint: "Internal note, minutes of a meeting, summary of a discussion." },
];

// Helper: derive effective status for a given activity. A `scheduled`
// activity that's past its date counts as `overdue` for filters & KPIs.
export const effectiveActivityStatus = (a) => {
  if (!a) return "scheduled";
  if (a.status === "scheduled" && a.scheduledAt) {
    const scheduledMs = new Date(a.scheduledAt).getTime();
    if (Number.isFinite(scheduledMs) && scheduledMs < Date.now()) return "overdue";
  }
  return a.status || "scheduled";
};

// ─── Maintenance ─────────────────────────────────────────────────────────
// Daily maintenance jobs against the 72 suites — defect identification,
// vendor dispatch and completion tracking, with parts + labor cost capture.
// Two stores work together:
//   maintenanceVendors — the ops Rolodex (AC Care, plumbers, painters …)
//   maintenanceJobs    — every reactive or preventive job, linked to a vendor
//
// Job lifecycle: reported → diagnosed → vendor-assigned → in-progress →
// completed (or cancelled). Each transition stamps an event into the job's
// `history` log so the front-desk team can audit timing and accountability.

export const MAINTENANCE_CATEGORIES = [
  {
    id: "ac", label: "Air Conditioning", color: "#0891B2",
    hint: "Filters, refrigerant, wiring, capacitors, deep clean.",
    subcategories: [
      { id: "filter-change", label: "Filter change",          preventive: true,  intervalDays:  90 },
      { id: "deep-clean",    label: "Deep clean / coil clean", preventive: true,  intervalDays: 180 },
      { id: "gas-leak",      label: "Gas leakage / refrigerant" },
      { id: "wiring",        label: "Wiring issue" },
      { id: "capacitor",     label: "Capacitor change" },
      { id: "thermostat",    label: "Thermostat fault" },
      { id: "noise",         label: "Excessive noise / vibration" },
    ],
  },
  {
    id: "furniture", label: "Furniture & Fixtures", color: "#7C3AED",
    hint: "Curtains, soft furnishings, bed frames, kitchenette fittings.",
    subcategories: [
      { id: "curtains",        label: "Curtains / blinds" },
      { id: "bed-frame",       label: "Bed frame / mattress" },
      { id: "wardrobe",        label: "Wardrobe / dresser" },
      { id: "soft-furnishing", label: "Sofa / chair upholstery" },
      { id: "kitchenette",     label: "Kitchenette fittings" },
      { id: "fixture",         label: "Wall fixture / mirror" },
    ],
  },
  {
    id: "electrical", label: "Electrical", color: "#D97706",
    hint: "Lighting, sockets, breakers, smart-TV and WiFi issues.",
    subcategories: [
      { id: "lighting", label: "Lighting / bulbs" },
      { id: "socket",   label: "Socket / outlet" },
      { id: "circuit",  label: "Circuit breaker" },
      { id: "tv",       label: "Smart TV / set-top box" },
      { id: "wifi",     label: "WiFi / network point" },
    ],
  },
  {
    id: "plumbing", label: "Plumbing", color: "#2563EB",
    hint: "Leaks, drainage, WC, shower & water-heater faults.",
    subcategories: [
      { id: "leak",         label: "Leak / drip" },
      { id: "blockage",     label: "Drain blockage" },
      { id: "wc",           label: "WC / flush" },
      { id: "shower",       label: "Shower / mixer" },
      { id: "water-heater", label: "Water heater" },
      { id: "tap",          label: "Tap / faucet" },
    ],
  },
  {
    id: "painting", label: "Painting & Decor", color: "#16A34A",
    hint: "Touch-ups, full repaints, wallpaper repair, deep wall cleans.",
    subcategories: [
      { id: "touch-up",   label: "Touch-up paint" },
      { id: "full-room",  label: "Full room repaint" },
      { id: "wallpaper",  label: "Wallpaper repair" },
      { id: "deep-clean", label: "Deep wall clean" },
    ],
  },
  {
    id: "other", label: "Other / Miscellaneous", color: "#64748B",
    hint: "Pest control, appliances, carpet/flooring, balcony work.",
    subcategories: [
      { id: "pest",      label: "Pest control" },
      { id: "appliance", label: "Appliance repair" },
      { id: "carpet",    label: "Carpet / flooring" },
      { id: "balcony",   label: "Balcony / exterior" },
      { id: "misc",      label: "Misc" },
    ],
  },
];
