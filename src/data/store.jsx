import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ROOMS as INITIAL_ROOMS } from "./rooms.js";
import { roomLabel as resolveRoomLabel } from "../lib/rooms.js";
import {
  notifyBookingCreated, notifyBookingStatusChange,
  notifyInvoiceIssued, notifyInvoiceStatusChange,
  notifyPaymentReceived, notifyPartnerRegistered,
} from "../utils/notifications.js";

// Server-shareable report primitives — these now live in src/lib/reportShared.js
// so the /api/run-reports cron runner can build the same report emails without
// importing this (client-only) module. Re-exported so existing imports of
// applyTaxes / ACTIVITY_KINDS / etc. from the store keep working unchanged.
import {
  applyTaxes, inverseApplyTaxes, effectiveActivityStatus, ACTIVITY_KINDS, MAINTENANCE_CATEGORIES,
} from "../lib/reportShared.js";
export { applyTaxes, inverseApplyTaxes, effectiveActivityStatus, ACTIVITY_KINDS, MAINTENANCE_CATEGORIES };
import { sendTransactionalEmail } from "../utils/email.js";
import { emailBookingDocPdf } from "../lib/docEmail.js";
import { PACKAGES as INITIAL_PACKAGES } from "./packages.js";
import { supabase, SUPABASE_CONFIGURED, hasSupabaseSession, REAL_GUEST_AUTH } from "../lib/supabase.js";
import { sessionFromClaims } from "../lib/guestAuth.js";
import {
  fetchRooms, persistRoomPatch, persistRoomInsert, persistRoomRemove,
  dbRoomToClient,
} from "../lib/rooms.js";
import {
  fetchAll, fetchSingleton, fetchEntityMap,
  useSlicePersistence, useSingletonPersistence, useObjectSlicePersistence,
  useRealtimeSlice, useRealtimeSingleton, useRealtimeTable, useObjectRealtimeSlice,
  upsertRow,
} from "../lib/dataSync.js";

// Loyalty tiers — fully self-contained shape so the admin can CRUD them.
// Each tier carries its own name/intro/nightsLabel/icon/color/earnRate plus
// a per-tier benefits array. Built-in tiers can't be removed; custom tiers
// can be created and deleted via the admin.
const INITIAL_TIERS = [
  {
    id: "silver", name: "Silver", nightsLabel: "1–9 nights",
    intro: "The first step into LS Privilege.",
    icon: "Award", color: "#A8A8A8", earnRate: 1, builtIn: true,
    // Meal plans available to members at this tier. `availablePlans` is
    // the full set the guest can pick at booking; `defaultMealPlan` is
    // the one that pre-fills. Silver = RO (no perk); Gold gets BB +
    // RO option; Platinum gets RO + BB + HB so the member can pick.
    availablePlans: ["ro"],
    defaultMealPlan: "ro",
    benefits: [
      { id: "s1", label: "5% member rate on every booking", on: true },
      { id: "s2", label: "1 point per BHD spent on rooms", on: true },
      { id: "s3", label: "Welcome bottle of water", on: true },
      { id: "s4", label: "Free WiFi (always)", on: true },
      { id: "s5", label: "Complimentary room upgrade", on: false },
      { id: "s6", label: "Late check-out (subject to availability)", on: false },
      { id: "s7", label: "Free night certificate", on: false },
    ],
  },
  {
    id: "gold", name: "Gold", nightsLabel: "10–24 nights",
    intro: "Where the meaningful perks begin.",
    icon: "Crown", color: "#C9A961", earnRate: 1.5, builtIn: true, featured: true,
    availablePlans: ["ro", "bb"],
    defaultMealPlan: "bb",
    benefits: [
      { id: "g1", label: "10% member rate on every booking", on: true },
      { id: "g2", label: "1.5 points per BHD spent", on: true },
      { id: "g3", label: "Welcome amenity in suite", on: true },
      { id: "g4", label: "Free WiFi (always)", on: true },
      { id: "g5", label: "Complimentary room upgrade (when available)", on: true },
      { id: "g6", label: "Late check-out to 14:00", on: true },
      { id: "g7", label: "Free night after 20 nights stayed", on: false },
    ],
  },
  {
    id: "platinum", name: "Platinum", nightsLabel: "25+ nights / year",
    intro: "Treated as residents, not guests.",
    icon: "Gem", color: "#D4B97A", earnRate: 2, builtIn: true,
    availablePlans: ["ro", "bb", "hb"],
    defaultMealPlan: "hb",
    benefits: [
      { id: "p1", label: "15% member rate + best rate guarantee", on: true },
      { id: "p2", label: "2 points per BHD spent", on: true },
      { id: "p3", label: "Premium welcome amenity & flowers", on: true },
      { id: "p4", label: "Free WiFi (always)", on: true },
      { id: "p5", label: "Guaranteed room upgrade (one tier)", on: true },
      { id: "p6", label: "Guaranteed late check-out to 16:00", on: true },
      { id: "p7", label: "Annual free night + suite upgrade voucher", on: true },
    ],
  },
];

// ─── B2B partner loyalty (corporates + travel agencies) ────────────────────
// Optional, admin-activated-per-account loyalty mirroring the member tiers
// above. Two SEPARATE ladders (corporates reward with rate discounts; agencies
// with commission uplift). Tier qualification is by LIFETIME volume (never
// resets) — each tier carries a numeric `qualifyMin` (lifetime nights, or
// revenue when partnerLoyalty.qualifyBy === "revenue") used to auto-compute an
// account's current tier. Same editable shape as member tiers (minus the
// member-only meal-plan fields), so the admin can fully CRUD them.
const INITIAL_CORPORATE_TIERS = [
  {
    id: "corp-silver", name: "Silver Partner", nightsLabel: "0–249 lifetime nights",
    intro: "Entry tier for new corporate accounts.",
    icon: "Award", color: "#A8A8A8", earnRate: 1, qualifyMin: 0, builtIn: true,
    benefits: [
      { id: "cs1", label: "3% off contracted rate", on: true },
      { id: "cs2", label: "1 point per BHD on stayed bookings", on: true },
      { id: "cs3", label: "Consolidated monthly invoicing", on: true },
      { id: "cs4", label: "Dedicated reservations contact", on: false },
    ],
  },
  {
    id: "corp-gold", name: "Gold Partner", nightsLabel: "250–999 lifetime nights",
    intro: "For accounts with steady, growing production.",
    icon: "Crown", color: "#C9A961", earnRate: 1.5, qualifyMin: 250, builtIn: true, featured: true,
    benefits: [
      { id: "cg1", label: "5% off contracted rate", on: true },
      { id: "cg2", label: "1.5 points per BHD on stayed bookings", on: true },
      { id: "cg3", label: "Guaranteed late check-out to 14:00", on: true },
      { id: "cg4", label: "Dedicated reservations contact", on: true },
    ],
  },
  {
    id: "corp-platinum", name: "Platinum Partner", nightsLabel: "1,000+ lifetime nights",
    intro: "Strategic accounts treated as residents.",
    icon: "Gem", color: "#D4B97A", earnRate: 2, qualifyMin: 1000, builtIn: true,
    benefits: [
      { id: "cp1", label: "8% off contracted rate", on: true },
      { id: "cp2", label: "2 points per BHD on stayed bookings", on: true },
      { id: "cp3", label: "Guaranteed availability window", on: true },
      { id: "cp4", label: "Net-60 payment terms", on: true },
    ],
  },
];

const INITIAL_AGENCY_TIERS = [
  {
    id: "agt-silver", name: "Silver Agency", nightsLabel: "0–99 lifetime nights",
    intro: "Entry tier for new travel-agency partners.",
    icon: "Award", color: "#A8A8A8", earnRate: 1, qualifyMin: 0, builtIn: true,
    benefits: [
      { id: "as1", label: "Standard commission", on: true },
      { id: "as2", label: "1 point per BHD of stayed production", on: true },
      { id: "as3", label: "Self-service portal access", on: true },
    ],
  },
  {
    id: "agt-gold", name: "Gold Agency", nightsLabel: "100–499 lifetime nights",
    intro: "For agencies delivering consistent production.",
    icon: "Crown", color: "#C9A961", earnRate: 1.5, qualifyMin: 100, builtIn: true, featured: true,
    benefits: [
      { id: "ag1", label: "+1% commission uplift", on: true },
      { id: "ag2", label: "1.5 points per BHD of stayed production", on: true },
      { id: "ag3", label: "Priority allocation in high season", on: true },
    ],
  },
  {
    id: "agt-platinum", name: "Platinum Agency", nightsLabel: "500+ lifetime nights",
    intro: "Top-producing wholesale & retail partners.",
    icon: "Gem", color: "#D4B97A", earnRate: 2, qualifyMin: 500, builtIn: true,
    benefits: [
      { id: "ap1", label: "+2% commission uplift", on: true },
      { id: "ap2", label: "2 points per BHD of stayed production", on: true },
      { id: "ap3", label: "Joint marketing fund", on: true },
    ],
  },
];

// Partner points economy (shared by both B2B ladders). Phase-2-ready:
// `redeemBhdPerPoints` mirrors the member rate; redemption can be BHD credit on
// a future booking OR a fixed-denomination third-party gift card (brands added
// later by the admin). `qualifyBy` switches the tier metric between lifetime
// nights and lifetime revenue.
const INITIAL_PARTNER_LOYALTY = {
  redeemBhdPerPoints: 100,                       // 100 points = BHD 1
  qualifyBy:          "nights",                  // "nights" | "revenue"
  giftCard:           { denominations: [20, 50, 100], brands: [
    { id: "brand-lulu",        name: "Lulu",        active: true },
    { id: "brand-sharafdg",    name: "Sharaf DG",   active: true },
    { id: "brand-citycentre",  name: "City Centre", active: true },
    { id: "brand-centrepoint", name: "Centrepoint", active: true },
  ] },
  freeNightAfterPts:  0,                          // reserved (0 = disabled for B2B)
};

// Tier-CRUD factory — returns the same eight editor callbacks the member tiers
// use (updateTier / toggleBenefit / add / remove / move / add|update|remove
// benefit), closed over whichever tier-list setter is passed. The two B2B
// ladders each get their own instance so the editor logic is written once and
// can never drift from the proven member behaviour. (Not a hook — pure factory;
// the setter from useState is stable, so the result is stable when memoised.)
// Booking statuses that count as "confirmed / stayed" and so award B2B points.
const ACCRUAL_STATUSES = new Set(["confirmed", "in-house", "checked-out"]);

export function makeTierCrud(setTierList) {
  return {
    updateTier: (idx, patch) => setTierList(ts => ts.map((t, i) => i === idx ? { ...t, ...patch } : t)),
    toggleBenefit: (tierIdx, bid) => setTierList(ts => ts.map((t, i) => i !== tierIdx ? t
      : { ...t, benefits: t.benefits.map(b => (b.id === bid || b.key === bid) ? { ...b, on: !b.on } : b) })),
    addTier: (tier = {}) => setTierList(ts => {
      const id = tier.id || `custom-${Date.now()}`;
      return [...ts, { name: "New tier", earnRate: 1, qualifyMin: 0, builtIn: false, benefits: [], ...tier, id }];
    }),
    removeTier: (id) => setTierList(ts => ts.filter(t => t.id !== id)),
    moveTier: (idx, dir) => setTierList(ts => {
      const next = [...ts];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return ts;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    }),
    addBenefit: (tierIdx, label = "New benefit") => setTierList(ts => ts.map((t, i) => i !== tierIdx ? t
      : { ...t, benefits: [...t.benefits, { id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, label, on: true }] })),
    updateBenefit: (tierIdx, bid, patch) => setTierList(ts => ts.map((t, i) => i !== tierIdx ? t
      : { ...t, benefits: t.benefits.map(b => b.id === bid ? { ...b, ...patch } : b) })),
    removeBenefit: (tierIdx, bid) => setTierList(ts => ts.map((t, i) => i !== tierIdx ? t
      : { ...t, benefits: t.benefits.filter(b => b.id !== bid) })),
  };
}

// In-memory data store for everything the admin can edit. The marketing site
// pulls from this, so admin edits propagate live to the homepage. There is
// NO persistence — refresh resets to defaults (per CLAUDE.md: no localStorage).
//
// When a real backend is wired up, replace the providers below with API calls
// while keeping the hook signatures intact.

const DataStoreContext = createContext(null);

// Tax model: a list of components. Each row is independently configured —
// percentage or fixed, applies to all charges or room-only, calculated
// straight off the net or compounded over the running total.
//
// Component shape:
//   { id, name, type: 'percentage' | 'fixed',
//     rate?, amount?,
//     appliesTo: 'all' | 'room' | 'extras',
//     chargePer: 'room-night' | 'person-night' | 'stay' (fixed only),
//     calculation: 'straight' | 'compound',
//     pricing: 'exclusive' | 'inclusive' (percentage only) }
const INITIAL_TAX = {
  taxInclusiveDisplay: false,
  components: [
    { id: "vat",     name: "VAT",            type: "percentage", rate: 10, appliesTo: "all",  pricing: "exclusive", calculation: "straight" },
    { id: "service", name: "Service charge", type: "percentage", rate:  5, appliesTo: "room", pricing: "exclusive", calculation: "straight" },
    { id: "tourism", name: "Tourism levy",   type: "percentage", rate:  4, appliesTo: "room", pricing: "exclusive", calculation: "compound" },
    { id: "levy",    name: "Per-night levy", type: "fixed",      amount: 1, appliesTo: "room", chargePer: "room-night", calculation: "straight" },
  ],
};

// Built-in tax patterns. Each describes a complete components array — the
// operator picks one as a starting point and tweaks from there.
const INITIAL_TAX_PATTERNS = [
  {
    id: "bahrain-standard",
    name: "Bahrain standard",
    description: "10% VAT + 5% service + 4% tourism levy + BHD 1/night. The default for direct guests and OTAs.",
    config: {
      taxInclusiveDisplay: false,
      components: [
        { id: "vat",     name: "VAT",            type: "percentage", rate: 10, appliesTo: "all",  pricing: "exclusive", calculation: "straight" },
        { id: "service", name: "Service charge", type: "percentage", rate:  5, appliesTo: "room", pricing: "exclusive", calculation: "straight" },
        { id: "tourism", name: "Tourism levy",   type: "percentage", rate:  4, appliesTo: "room", pricing: "exclusive", calculation: "compound" },
        { id: "levy",    name: "Per-night levy", type: "fixed",      amount: 1, appliesTo: "room", chargePer: "room-night", calculation: "straight" },
      ],
    },
    builtIn: true,
  },
  {
    id: "inclusive-display",
    name: "All-inclusive display",
    description: "Same components — rates on the public site are shown gross. Best for direct-leisure campaigns.",
    config: {
      taxInclusiveDisplay: true,
      components: [
        { id: "vat",     name: "VAT",            type: "percentage", rate: 10, appliesTo: "all",  pricing: "inclusive", calculation: "straight" },
        { id: "service", name: "Service charge", type: "percentage", rate:  5, appliesTo: "room", pricing: "inclusive", calculation: "straight" },
        { id: "tourism", name: "Tourism levy",   type: "percentage", rate:  4, appliesTo: "room", pricing: "inclusive", calculation: "compound" },
        { id: "levy",    name: "Per-night levy", type: "fixed",      amount: 1, appliesTo: "room", chargePer: "room-night", calculation: "straight" },
      ],
    },
    builtIn: true,
  },
  {
    id: "corporate-exempt",
    name: "Corporate / diplomatic",
    description: "VAT-exempt for qualifying diplomatic and government accounts; service & levy retained on the room.",
    config: {
      taxInclusiveDisplay: false,
      components: [
        { id: "service", name: "Service charge", type: "percentage", rate: 5, appliesTo: "room", pricing: "exclusive", calculation: "straight" },
        { id: "tourism", name: "Tourism levy",   type: "percentage", rate: 4, appliesTo: "room", pricing: "exclusive", calculation: "compound" },
        { id: "levy",    name: "Per-night levy", type: "fixed",      amount: 1, appliesTo: "room", chargePer: "room-night", calculation: "straight" },
      ],
    },
    builtIn: true,
  },
  {
    id: "tour-net",
    name: "Tour-operator net",
    description: "Wholesale net rate with no tax components — taxes added downstream by the tour operator.",
    config: { taxInclusiveDisplay: false, components: [] },
    builtIn: true,
  },
  {
    id: "ramadan-promo",
    name: "Ramadan promotion",
    description: "Reduced tourism levy for Ramadan-period direct bookings; standard otherwise.",
    config: {
      taxInclusiveDisplay: false,
      components: [
        { id: "vat",     name: "VAT",            type: "percentage", rate: 10, appliesTo: "all",  pricing: "exclusive", calculation: "straight" },
        { id: "service", name: "Service charge", type: "percentage", rate:  5, appliesTo: "room", pricing: "exclusive", calculation: "straight" },
        { id: "tourism", name: "Tourism levy",   type: "percentage", rate:  2, appliesTo: "room", pricing: "exclusive", calculation: "straight" },
      ],
    },
    builtIn: true,
  },
  {
    id: "extras-fnb",
    name: "Extras · F&B and spa",
    description: "Used when an extra service line (F&B, spa) is invoiced separately — only VAT applies, no tourism levy.",
    config: {
      taxInclusiveDisplay: false,
      components: [
        { id: "vat",     name: "VAT (extras)",   type: "percentage", rate: 10, appliesTo: "extras", pricing: "exclusive", calculation: "straight" },
        { id: "service", name: "Service charge", type: "percentage", rate: 5,  appliesTo: "extras", pricing: "exclusive", calculation: "straight" },
      ],
    },
    builtIn: true,
  },
];

// Compute the line total for a booking extra given current selection context.
//   extra.pricing === "per-guest-per-night" → amount × adults × nights
//   extra.pricing === "per-night"            → amount × nights
//   extra.pricing === "per-guest"            → amount × adults
//   extra.pricing === "per-stay"             → amount
export function priceExtra(extra, { adults = 1, nights = 1 } = {}) {
  const a = Number(extra.amount) || 0;
  switch (extra.pricing) {
    case "per-guest-per-night": return a * adults * nights;
    case "per-night":           return a * nights;
    case "per-guest":           return a * adults;
    case "per-stay":
    default:                    return a;
  }
}

// Human-readable price label for an extra (used by the booking modal +
// admin list view).
export function priceLabelFor(extra) {
  const a = `BHD ${extra.amount}`;
  switch (extra.pricing) {
    case "per-guest-per-night": return `${a} / pax / night`;
    case "per-night":           return `${a} / night`;
    case "per-guest":           return `${a} / pax`;
    case "per-stay":
    default:                    return a;
  }
}

// Human-readable summary of the configured tax components. Used to render
// the "(10% Service Charge · 5% Government Levy · 10% VAT)" line on
// contracts, folios and receipts — pulls from the live Tax Setup so
// renaming a component or changing a rate updates every printed surface.
//
// Percentage components → "<rate>% <name>"   (e.g. "10% VAT")
// Fixed components      → "BHD <amount> <name> / <unit>"
//                         (e.g. "BHD 3 Tourism fee / night")
// Joined with " · ". Empty config → "" (caller can fall back if needed).
export function summarizeTax(tax) {
  if (!tax?.components || tax.components.length === 0) return "";
  return tax.components.map((c) => {
    if (c.type === "percentage") {
      return `${c.rate}% ${c.name}`;
    }
    if (c.type === "fixed") {
      const unit = c.chargePer === "stay" ? "" : " / night";
      return `BHD ${c.amount} ${c.name}${unit}`;
    }
    return c.name || "";
  }).filter(Boolean).join(" · ");
}


// Determine if a given Date / ISO date string falls on one of the
// configured weekend days. `weekendDays` is an array of day-of-week
// numbers (0-6, Sunday=0). Falls back to [5,6] (Fri+Sat) when not set —
// matching the Bahrain default in DEFAULT_HOTEL_INFO.
export function isWeekend(date, weekendDays) {
  const dow = (typeof date === "string" ? new Date(date) : date).getDay();
  const set = Array.isArray(weekendDays) && weekendDays.length > 0
    ? weekendDays
    : [5, 6];
  return set.includes(dow);
}

// Walk every night of a stay (checkIn through checkOut-1) and split
// into weekday vs weekend buckets. Returns:
//   {
//     weekdayNights, weekendNights,
//     perNight: [{ date, isWeekend, rate }],
//     total,
//     rateWeekday, rateWeekend,
//   }
//
// `room` must have { price, priceWeekend } (or undefined). When
// `priceWeekend` is missing, the weekday rate is used for both buckets
// so legacy data renders correctly. Pass `overrideWeekday` /
// `overrideWeekend` to swap in a contract / agent rate instead of the
// rack rate while keeping the same weekend-day calendar logic.
export function nightlyBreakdown({ checkIn, checkOut, room, weekendDays, overrideWeekday, overrideWeekend }) {
  if (!checkIn || !checkOut || !room) {
    return {
      weekdayNights: 0, weekendNights: 0, perNight: [], total: 0,
      rateWeekday: 0, rateWeekend: 0,
    };
  }
  const rateWeekday = overrideWeekday !== undefined
    ? Number(overrideWeekday || 0)
    : Number(room.price || 0);
  const rateWeekend = overrideWeekend !== undefined
    ? Number(overrideWeekend || 0)
    : Number(room.priceWeekend ?? room.price ?? 0);
  const start = new Date(checkIn);
  const end   = new Date(checkOut);
  const perNight = [];
  let weekdayNights = 0, weekendNights = 0, total = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const isWE = isWeekend(cursor, weekendDays);
    const rate = isWE ? rateWeekend : rateWeekday;
    perNight.push({
      date: cursor.toISOString().slice(0, 10),
      isWeekend: isWE,
      rate: Number(rate || 0),
    });
    if (isWE) weekendNights++; else weekdayNights++;
    total += Number(rate || 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  return { weekdayNights, weekendNights, perNight, total, rateWeekday, rateWeekend };
}

// ─── Meal plans ───────────────────────────────────────────────────────────
//
// Each suite type carries a catalogue of meal plans (RO / BB / HB / FB)
// with a per-adult-per-night supplement that's added on top of the
// rack-rate when a booking line picks that plan. The catalogue lives on
// `room.mealPlans` so admin can edit per-suite — different suite types
// can have different F&B economics, and the bigger suites typically
// attract higher-spending guests.
//
// Touch-points:
//   • Public BookingModal       — meal-plan picker per booking line
//   • Admin booking creator     — same picker, defaults to operator pref
//   • Corporate agreement rates — each rate row stores its own mealPlan
//   • Travel-agency rates       — same shape as corporate
//   • Member tier benefits      — tiers can pre-set a default mealPlan
//   • Calendar cell             — override mealPlan per day (promo runs)
//   • Invoice / receipt PDFs    — show the plan on the line item
//
// Helpers:
//   mealPlanSupplement(room, code) → BHD per adult per night
//   mealPlanCost(room, code, { adults, nights }) → total BHD added
//   enabledMealPlansFor(room) → ordered MEAL_PLANS list filtered to "on"
//   mealPlanLabel(code) → "Room Only" / "Bed & Breakfast" / ...

export const MEAL_PLANS = [
  { code: "ro", short: "RO", label: "Room Only",      blurb: "Accommodation only — no meals included.",                              icon: "Coffee" },
  { code: "bb", short: "BB", label: "Bed & Breakfast", blurb: "Buffet breakfast served daily in The Conservatory, 6:30–10:30am.",     icon: "Croissant" },
  { code: "hb", short: "HB", label: "Half Board",      blurb: "Breakfast + dinner. Choose the à-la-carte menu or the chef's plat du jour.", icon: "Utensils" },
  { code: "fb", short: "FB", label: "Full Board",      blurb: "Breakfast, lunch and dinner. Best for long stays and corporate parties.", icon: "ChefHat" },
];

export const MEAL_PLAN_CODES = MEAL_PLANS.map((m) => m.code);
const MEAL_PLAN_BY_CODE = MEAL_PLANS.reduce((acc, m) => { acc[m.code] = m; return acc; }, {});

// The default catalogue applied to a room when `mealPlans` is missing.
// Mirrors the studio's seed in src/data/rooms.js so a stripped-down room
// row still renders meaningfully.
export const DEFAULT_MEAL_PLANS_FOR_ROOM = {
  ro: { enabled: true, supplement: 0 },
  bb: { enabled: true, supplement: 6 },
  hb: { enabled: true, supplement: 18 },
  fb: { enabled: true, supplement: 28 },
};

export function mealPlanLabel(code) {
  return MEAL_PLAN_BY_CODE[code]?.label || "Room Only";
}
export function mealPlanShort(code) {
  return MEAL_PLAN_BY_CODE[code]?.short || "RO";
}
export function mealPlanBlurb(code) {
  return MEAL_PLAN_BY_CODE[code]?.blurb || "";
}

/** Read the per-adult-per-night supplement for `code` from this room. */
export function mealPlanSupplement(room, code) {
  if (!room || !code) return 0;
  const map = room.mealPlans || DEFAULT_MEAL_PLANS_FOR_ROOM;
  const entry = map[code];
  if (!entry || entry.enabled === false) return 0;
  return Number(entry.supplement) || 0;
}

/** Total BHD that `code` adds to a booking line. */
export function mealPlanCost(room, code, { adults = 0, nights = 0 } = {}) {
  const per = mealPlanSupplement(room, code);
  return per * Math.max(0, Number(adults) || 0) * Math.max(0, Number(nights) || 0);
}

/** Ordered list of MEAL_PLANS filtered to those enabled on this room. */
export function enabledMealPlansFor(room) {
  const map = room?.mealPlans || DEFAULT_MEAL_PLANS_FOR_ROOM;
  return MEAL_PLANS.filter((m) => (map[m.code]?.enabled !== false));
}

// ─── Event-period supplements (property-wide master) ─────────────────────
//
// One place to register the BHD-per-room-per-night surcharge that
// applies during named high-demand windows (Eid, Formula 1, Ironman
// Bahrain, New Year's Eve, etc.). All booking surfaces read from this
// list:
//
//   • Public BookingModal       — auto-applies any active event the
//                                 stay overlaps
//   • Corporate / agency        — "Import from master" copies entries
//     contracts                   into the contract's eventSupplements
//                                 (or operators can run pure-master
//                                 mode and stop maintaining per-contract)
//   • Calendar grid             — surface an event ribbon over the
//                                 affected dates (future)
//   • Reports                   — segment revenue by event window
//
// Shape: { id, name, fromDate, toDate, supplement, active, scope }
//   • scope: 'all' (default) | 'corporate' | 'agent' | 'direct'
//   • active: false hides the row from booking math without
//             losing the date/amount (useful for cancelled events
//             that may return next year).

const _yr = new Date().getFullYear();
export const DEFAULT_EVENT_SUPPLEMENTS = [
  {
    id: "evt-eid",
    name: "Eid Al-Adha",
    fromDate: `${_yr}-05-26`,
    toDate:   `${_yr}-05-29`,
    supplement: 25,
    active: true,
    scope: "all",
  },
  {
    id: "evt-f1",
    name: "Formula 1 Bahrain Grand Prix",
    fromDate: `${_yr}-10-01`,
    toDate:   `${_yr}-10-07`,
    supplement: 25,
    active: true,
    scope: "all",
  },
  {
    id: "evt-ironman",
    name: "Ironman Bahrain",
    fromDate: `${_yr}-12-15`,
    toDate:   `${_yr}-12-17`,
    supplement: 25,
    active: true,
    scope: "all",
  },
  {
    id: "evt-nye",
    name: "New Year's Eve",
    fromDate: `${_yr}-12-31`,
    toDate:   `${_yr + 1}-01-01`,
    supplement: 25,
    active: true,
    scope: "all",
  },
];

/** Return the master events whose window includes the supplied ISO date. */
export function eventsCoveringDate(eventSupplements, isoDate) {
  if (!eventSupplements || !isoDate) return [];
  const d = new Date(isoDate);
  if (isNaN(d)) return [];
  return eventSupplements.filter((evt) => {
    if (!evt || evt.active === false) return false;
    const from = new Date(evt.fromDate);
    const to   = new Date(evt.toDate);
    if (isNaN(from) || isNaN(to)) return false;
    return d >= from && d <= to;
  });
}

/** Total event supplement that applies to a booking window (BHD per
 *  room, summed across overlapping nights). For each event we count
 *  the number of nights the booking falls inside its window, then
 *  multiply by the supplement. Multiple overlapping events stack.
 */
export function totalEventSupplement(eventSupplements, { checkIn, checkOut, scope = "all" } = {}) {
  if (!eventSupplements || !checkIn || !checkOut) return 0;
  const start = new Date(checkIn);
  const end   = new Date(checkOut);
  if (isNaN(start) || isNaN(end)) return 0;
  let total = 0;
  for (const evt of eventSupplements) {
    if (!evt || evt.active === false) continue;
    // Scope filter — "all" applies everywhere; otherwise the event
    // only triggers when the caller's scope matches.
    if (evt.scope && evt.scope !== "all" && scope !== "all" && evt.scope !== scope) continue;
    const eFrom = new Date(evt.fromDate);
    const eTo   = new Date(evt.toDate);
    if (isNaN(eFrom) || isNaN(eTo)) continue;
    // Inclusive event window: any booking night that ENDS after eFrom
    // and STARTS before (eTo + 1) is touched. We walk the stay day-
    // by-day and sum the supplement for every overlapping night.
    const cursor = new Date(Math.max(start.getTime(), eFrom.getTime()));
    const stop   = new Date(Math.min(end.getTime() - 86400000, eTo.getTime()));
    while (cursor <= stop) {
      total += Number(evt.supplement) || 0;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return total;
}

// (inverseApplyTaxes now lives in src/lib/reportShared.js and is re-exported
// above, so the PDF document builder can share the exact same folio math.)

// Bookings seed — intentionally EMPTY. The property runs on live bookings
// only; demo reservations were removed so a fresh / empty environment starts
// clean and the admin sees real reservations exclusively. New bookings are
// created through the booking flows and persisted to the DB. (Historic demo
// guests like Sarah Holloway / Lorenzo Caretti lived here previously.)
const SAMPLE_BOOKINGS = [];

// Invoices carry an optional `kind` discriminator:
//   "booking"    — money the client (guest / corporate / agent) owes the hotel
//                  for a stay. This is the DEFAULT when the field is missing.
//   "commission" — money the hotel owes a travel agent for commission earned
//                  on a booking. Only meaningful for clientType "agent".
// Two separate ledgers ride on the same `invoices` collection; the Guest
// Portal's Invoices tab shows only `kind: "booking"` while the Commission
// tab shows only `kind: "commission"`.
const SAMPLE_INVOICES = [
  { id: "INV-2026-0341", bookingId: "LS-A8K2N4", clientType: "guest",     clientName: "Sarah Holloway",      issued: "2026-04-28", due: "2026-04-28", amount: 339, paid: 339, status: "paid",    kind: "booking"    },
  { id: "INV-2026-0342", bookingId: "LS-B3M1Q7", clientType: "corporate", clientName: "BAPCO",               issued: "2026-04-28", due: "2026-05-28", amount: 142, paid: 0,   status: "issued",  kind: "booking"    },
  { id: "INV-2026-0343", bookingId: "LS-C9P5R2", clientType: "agent",     clientName: "Globepass Travel",    issued: "2026-04-29", due: "2026-05-29", amount:  17, paid: 0,   status: "issued",  kind: "booking"    },
  { id: "INV-2026-0344", bookingId: "LS-D2T7W8", clientType: "agent",     clientName: "Cleartrip Bahrain",   issued: "2026-04-30", due: "2026-05-30", amount:  26, paid: 0,   status: "issued",  kind: "booking"    },
  { id: "INV-2026-0335", bookingId: "LS-G7Z3A5", clientType: "corporate", clientName: "GFH Financial Group", issued: "2026-04-23", due: "2026-04-23", amount: 125, paid: 125, status: "paid",    kind: "booking"    },
  { id: "INV-2026-0331", bookingId: "—",         clientType: "corporate", clientName: "BAPCO",               issued: "2026-04-15", due: "2026-04-15", amount: 980, paid: 0,   status: "overdue", kind: "booking"    },
  { id: "INV-2026-0298", bookingId: "—",         clientType: "agent",     clientName: "Almosafer Wholesale", issued: "2026-03-28", due: "2026-04-28", amount: 854, paid: 854, status: "paid",    kind: "booking"    },
  // Commission payables — money the hotel owes the agency for commission.
  { id: "INV-2026-CR01", bookingId: "LS-A8K2N4", clientType: "agent",     clientName: "Globepass Travel",    issued: "2026-04-15", due: "2026-04-30", amount:   8, paid: 8,   status: "paid",    kind: "commission", description: "Commission · LS-A8K2N4 (Sarah Holloway)" },
  { id: "INV-2026-CR02", bookingId: "LS-F6Y2Z4", clientType: "agent",     clientName: "Cleartrip Bahrain",   issued: "2026-04-20", due: "2026-05-04", amount:  14, paid: 0,   status: "issued",  kind: "commission", description: "Commission · LS-F6Y2Z4 (James Holloway)" },
  // Gift card invoices — buyer pays at purchase. Linked to the card via
  // giftCardId / giftCardCode so admin folio can tie the transaction
  // back to the original card record. Buyer is an LS Privilege member
  // (clientType: "member") since gift cards are now member-only.
  { id: "INV-2026-GC01", bookingId: null, giftCardId: "GC-2026-001", giftCardCode: "LS-GC-DEMO-AAAA", clientType: "member", clientName: "Mohammed Al-Ansari", clientEmail: "m.ansari@example.com",   issued: "2026-04-12", due: "2026-04-12", amount: 209, paid: 209, status: "paid", kind: "gift_card", description: "Gift card · 5 nights at the Lodge Studio · 5% buyer discount" },
  { id: "INV-2025-GC02", bookingId: null, giftCardId: "GC-2026-002", giftCardCode: "LS-GC-DEMO-BBBB", clientType: "member", clientName: "Sarah Holloway",     clientEmail: "s.holloway@example.com", issued: "2025-11-03", due: "2025-11-03", amount: 484, paid: 484, status: "paid", kind: "gift_card", description: "Gift card · 10 nights at the One-Bedroom Suite · 7% buyer discount" },
];

const SAMPLE_PAYMENTS = [
  { id: "PAY-9810", bookingId: "LS-A8K2N4", method: "card",       amount: 339, fee:  10, net: 329, ts: "2026-04-28T14:32:00", status: "captured" },
  { id: "PAY-9809", bookingId: "LS-D2T7W8", method: "card",       amount:  50, fee:   2, net:  48, ts: "2026-04-28T11:08:00", status: "captured" },
  { id: "PAY-9808", bookingId: "LS-H8A4B6", method: "card",       amount: 100, fee:   3, net:  97, ts: "2026-04-27T19:55:00", status: "captured" },
  { id: "PAY-9805", bookingId: "LS-G7Z3A5", method: "benefit-pay",amount: 125, fee:   1, net: 124, ts: "2026-04-23T12:44:00", status: "captured" },
  { id: "PAY-9802", bookingId: "LS-F6Y2Z4", method: "card",       amount: 167, fee:   5, net: 162, ts: "2026-04-19T10:22:00", status: "captured" },
  { id: "PAY-9799", bookingId: "—",         method: "transfer",   amount: 854, fee:   0, net: 854, ts: "2026-04-18T09:00:00", status: "captured" },
  { id: "PAY-9795", bookingId: "—",         method: "card",       amount:  60, fee:   2, net:  58, ts: "2026-04-15T16:08:00", status: "refunded" },
  // Gift card buyer-side payments — money in from the gift card sale.
  // bookingId is null because gift cards aren't bookings; the gift
  // card linkage rides on giftCardId / giftCardCode.
  { id: "PAY-9912", bookingId: null, giftCardId: "GC-2026-001", giftCardCode: "LS-GC-DEMO-AAAA", method: "card",     amount: 209, fee: 6, net: 203, ts: "2026-04-12T11:08:00", status: "captured", note: "Gift card purchase · LS-GC-DEMO-AAAA for Layla Al-Khalifa" },
  { id: "PAY-9745", bookingId: null, giftCardId: "GC-2026-002", giftCardCode: "LS-GC-DEMO-BBBB", method: "transfer", amount: 484, fee: 0, net: 484, ts: "2025-11-03T15:42:00", status: "captured", note: "Gift card purchase · LS-GC-DEMO-BBBB for Aisha Rahimi" },
];

// Default monthly net = 22.5× daily (≈25% discount on a 30-day month). Operators
// edit these in the contract drawer; the dashboard surfaces both rate sets.
const SAMPLE_AGREEMENTS = [
  {
    id: "AGR-2026-001", account: "BAPCO", industry: "Oil & Gas",
    signedOn: "2025-12-15", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "active",
    dailyRates:   { studio: 32, oneBed: 45, twoBed: 75, threeBed: 92 },
    monthlyRates: { studio: 720, oneBed: 1015, twoBed: 1690, threeBed: 2070 },
    weekendUpliftPct: 0, taxIncluded: false,
    inclusions: { breakfast: true, lateCheckOut: true, parking: true, wifi: true, meetingRoom: false },
    cancellationPolicy: "Free cancellation up to 48h before arrival.",
    paymentTerms: "Net 30", creditLimit: 10000,
    pocName: "Sara Al-Hammadi", pocEmail: "sara.h@bapco.com.bh", pocPhone: "+973 1775 1234",
    notes: "Long-stay engineer rotations · always allocate top floors.",
    targetNights: 600, ytdNights: 412, ytdSpend: 18420,
    users: [
      { id: "U-BAPCO-1", name: "Sara Al-Hammadi", email: "sara.h@bapco.com.bh", phone: "+973 1775 1234", role: "primary", password: "LodgeStay-2026", primary: true },
      { id: "U-BAPCO-2", name: "Faisal Al-Otaibi", email: "f.otaibi@bapco.com.bh", phone: "+973 1775 1289", role: "booker",  password: "LodgeStay-2026" },
      { id: "U-BAPCO-3", name: "Hala Al-Mansoor",  email: "h.mansoor@bapco.com.bh", phone: "+973 1775 1290", role: "billing", password: "LodgeStay-2026" },
    ],
  },
  {
    id: "AGR-2026-002", account: "GFH Financial Group", industry: "Banking & Finance",
    signedOn: "2026-03-12", startsOn: "2026-04-01", endsOn: "2027-03-31", status: "active",
    dailyRates:   { studio: 35, oneBed: 48, twoBed: 79, threeBed: 95 },
    monthlyRates: { studio: 790, oneBed: 1080, twoBed: 1780, threeBed: 2140 },
    weekendUpliftPct: 0, taxIncluded: true,
    inclusions: { breakfast: true, lateCheckOut: false, parking: true, wifi: true, meetingRoom: true },
    cancellationPolicy: "Free cancellation up to 7 days before arrival.",
    paymentTerms: "Net 30", creditLimit: 25000,
    pocName: "Yusuf Al-Mannai", pocEmail: "y.mannai@gfh.com", pocPhone: "+973 1753 0000",
    notes: "Inclusive of 10% VAT and tourism levy. Direct billing.",
    targetNights: 800, ytdNights: 540, ytdSpend: 24650,
    users: [
      { id: "U-GFH-1", name: "Yusuf Al-Mannai", email: "y.mannai@gfh.com", phone: "+973 1753 0000", role: "primary", password: "LodgeStay-2026", primary: true },
      { id: "U-GFH-2", name: "Nadia Al-Sabah",  email: "n.sabah@gfh.com",  phone: "+973 1753 0011", role: "booker",  password: "LodgeStay-2026" },
    ],
  },
  {
    id: "AGR-2026-003", account: "Investcorp Aviation", industry: "Aviation",
    signedOn: "2025-09-05", startsOn: "2025-10-01", endsOn: "2026-09-30", status: "active",
    dailyRates:   { studio: 30, oneBed: 42, twoBed: 70, threeBed: 88 },
    monthlyRates: { studio: 675, oneBed: 945, twoBed: 1575, threeBed: 1980 },
    weekendUpliftPct: 5, taxIncluded: false,
    inclusions: { breakfast: true, lateCheckOut: true, parking: true, wifi: true, meetingRoom: false },
    cancellationPolicy: "48h cancellation · crew layovers exempt.",
    paymentTerms: "Net 45", creditLimit: 15000,
    pocName: "Mariam Al-Saadi", pocEmail: "ops@investcorp-air.bh", pocPhone: "+973 1771 9988",
    notes: "Crew layover priority · rooms blocked Wed/Sat.",
    targetNights: 400, ytdNights: 218, ytdSpend: 9740,
  },
  {
    id: "AGR-2026-004", account: "Ministry of the Interior", industry: "Government",
    signedOn: "2026-06-12", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "active",
    dailyRates:   { studio: 28, oneBed: 38, twoBed: 65, threeBed: 80 },
    monthlyRates: { studio: 630, oneBed: 855, twoBed: 1460, threeBed: 1800 },
    weekendUpliftPct: 0, taxIncluded: true,
    inclusions: { breakfast: true, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    cancellationPolicy: "Free cancellation up to 24h before arrival.",
    paymentTerms: "Net 60", creditLimit: 50000,
    pocName: "Lt. Ahmed Al-Doseri", pocEmail: "procurement@moi.gov.bh", pocPhone: "+973 1721 0000",
    notes: "Government bookings · CR + LPO required for direct billing.",
    targetNights: 1200, ytdNights: 720, ytdSpend: 32180,
  },
  {
    id: "AGR-2026-005", account: "Mondelez MEA", industry: "Consumer Goods",
    signedOn: "2026-02-20", startsOn: "2026-03-01", endsOn: "2027-02-28", status: "active",
    dailyRates:   { studio: 38, oneBed: 52, twoBed: 84, threeBed: 100 },
    monthlyRates: { studio: 855, oneBed: 1170, twoBed: 1890, threeBed: 2250 },
    weekendUpliftPct: 0, taxIncluded: false,
    inclusions: { breakfast: true, lateCheckOut: true, parking: true, wifi: true, meetingRoom: true },
    cancellationPolicy: "Free cancellation up to 72h before arrival.",
    paymentTerms: "Net 30", creditLimit: 8000,
    pocName: "Daniel Marchetti", pocEmail: "d.marchetti@mdlz.com", pocPhone: "+973 3611 4422",
    notes: "Regional sales force · short stays, mostly 1-Bed.",
    targetNights: 240, ytdNights: 86, ytdSpend: 4910,
  },
  // Imported from "2026- Corporate Rate Agreement.docx" — template rate
  // card for net non-commissionable corporate accounts. Recipient field is
  // blank in the source, so the contract sits in `draft` until an operator
  // assigns it to a specific company.
  {
    id: "AGR-2026-007", account: "2026 Corporate Rate Card · Template", industry: "Other",
    signedOn: "2026-01-01", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "draft",
    dailyRates:   { studio: 26, oneBed: 29, twoBed: 50, threeBed: 65 },
    weekendRates: { studio: 0,  oneBed: 0,  twoBed: 0,  threeBed: 0  },
    monthlyRates: { studio: 0,  oneBed: 0,  twoBed: 0,  threeBed: 0  },
    weekendUpliftPct: 0, taxIncluded: true, accommodationFee: 3.3,
    inclusions: { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    eventSupplements: [
      { id: "evt-tpl-eid-fitr", name: "Eid Al Fitr",        fromDate: "2026-03-18", toDate: "2026-03-22", supplement: 20 },
      { id: "evt-tpl-f1",       name: "Formula 1 Bahrain",  fromDate: "2026-04-10", toDate: "2026-04-12", supplement: 20 },
      { id: "evt-tpl-eid-adha", name: "Eid Al Adha",        fromDate: "2026-05-26", toDate: "2026-05-29", supplement: 20 },
      { id: "evt-tpl-snd",      name: "Saudi National Day", fromDate: "2026-09-23", toDate: "2026-09-25", supplement: 20 },
      { id: "evt-tpl-nye",      name: "New Year",           fromDate: "2025-12-31", toDate: "2026-01-01", supplement: 20 },
    ],
    cancellationPolicy: "Free cancellation up to 48h before arrival. Less than 48h: 100% of one-night charges.",
    paymentTerms: "On departure", creditLimit: 0,
    pocName: "", pocEmail: "", pocPhone: "",
    notes: "Template rate card · net & non-commissionable. Duplicate this contract and fill in the account details to onboard a new corporate. All rates inclusive of 10% Service Charge, 5% Government Levy and 10% VAT. Hotel Accommodation Fee BHD 3.300 net per room per night additional. Weekdays Sat–Wed, weekends Thu–Fri. Children up to 11 stay free in existing bedding. Virtual credit card payment ≥ 1 day prior to arrival; no credit facility extended.",
    targetNights: 0, ytdNights: 0, ytdSpend: 0,
    isTemplate: true,
    sourceDoc: "2026- Corporate Rate Agreement.docx",
  },
  // Imported from "LS Offer Rates - Monthly Sample.docx" (Long-Stay rate
  // sheet, supersedes prior quotes). Daily rates aren't quoted in the source
  // — the offer is monthly-only — so daily fields stay at zero.
  {
    id: "AGR-2026-006", account: "LS Long-Stay Sample", industry: "Other",
    signedOn: "2024-07-01", startsOn: "2024-07-01", endsOn: "2024-12-31", status: "expired",
    dailyRates:   { studio: 0, oneBed: 0,   twoBed: 0,   threeBed: 0   },
    weekendRates: { studio: 0, oneBed: 0,   twoBed: 0,   threeBed: 0   },
    monthlyRates: { studio: 0, oneBed: 600, twoBed: 800, threeBed: 900 },
    weekendUpliftPct: 0, taxIncluded: true, accommodationFee: 0,
    inclusions: { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    eventSupplements: [],
    cancellationPolicy: "100% of one-month charges apply on cancellation. Not applicable during peak season or holidays.",
    paymentTerms: "On departure", creditLimit: 0,
    pocName: "Front Office Manager",
    pocEmail: "frontoffice@thelodgesuites.com",
    pocPhone: "+973 1616 8146",
    notes: "Long-stay monthly offer · imported from LS Offer Rates · Monthly Sample. Inclusive of taxes, service charges & accommodation fee. Room basis only. Stop Sell may apply without prior notice. Payment options: Direct Payment, Advance Cash, Credit Card, or Settled by Company. Studio not included in this rate sheet — set to zero.",
    targetNights: 0, ytdNights: 0, ytdSpend: 0,
    sourceDoc: "LS Offer Rates - Monthly Sample.docx",
  },
];

// Booking extras — surfaced in the public booking modal as optional add-ons.
// `pricing` controls how the line total is computed:
//   "per-guest-per-night" = amount × adults × nights
//   "per-night"           = amount × nights
//   "per-stay"            = amount (one-time)
//   "per-guest"           = amount × adults (one-time)
const SAMPLE_EXTRAS = [
  { id: "breakfast",     title: "Daily breakfast",      note: "Buffet at the lobby café",       icon: "Coffee",    amount: 8,  pricing: "per-guest-per-night", active: true },
  { id: "airport",       title: "Airport transfer",     note: "One-way private car",            icon: "Car",       amount: 25, pricing: "per-stay",            active: true },
  { id: "spa",           title: "60-min couple's spa",  note: "Steam & sauna included",         icon: "Sparkles",  amount: 60, pricing: "per-stay",            active: true },
  { id: "late-checkout", title: "Guaranteed late checkout", note: "Hold the suite until 18:00", icon: "Hotel",     amount: 15, pricing: "per-stay",            active: true },
  { id: "champagne",     title: "Champagne on arrival", note: "Chilled, in-suite",              icon: "Heart",     amount: 35, pricing: "per-stay",            active: false },
];

// Travel agencies — every active record carries a contract: commission %,
// optional flat net rates (daily + monthly), term dates, payment terms, POC.
// Agencies that bill via commission-only leave the net-rate maps at zero;
// agencies that wholesale on flat rates can override either or both.
const SAMPLE_AGENCIES = [
  {
    id: "AGT-0124", name: "Globepass Travel", contact: "ops@globepass.bh",
    signedOn: "2025-12-01", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "active",
    commissionPct: 10, marketingFundPct: 1.5,
    dailyNet:   { studio: 30, oneBed: 41, twoBed: 70, threeBed: 86 },
    monthlyNet: { studio: 675, oneBed: 920, twoBed: 1575, threeBed: 1935 },
    paymentTerms: "Net 30", creditLimit: 8000,
    pocName: "Reem Al-Mahmood", pocEmail: "reem@globepass.bh", pocPhone: "+973 1753 1100",
    notes: "Top producer · GCC inbound · loyalty matching enabled.",
    ytdBookings: 28, ytdRevenue: 12480, ytdCommission: 1248, targetBookings: 36,
    users: [
      { id: "U-GLOBE-1", name: "Reem Al-Mahmood", email: "reem@globepass.bh", phone: "+973 1753 1100", role: "primary",      password: "AgentLogin-2026", primary: true },
      { id: "U-GLOBE-2", name: "Mariam Al-Saadi", email: "mariam@globepass.bh", phone: "+973 1753 1130", role: "reservations", password: "AgentLogin-2026" },
    ],
  },
  {
    id: "AGT-0211", name: "Cleartrip Bahrain", contact: "wholesale@ct.bh",
    signedOn: "2025-11-18", startsOn: "2025-12-01", endsOn: "2026-11-30", status: "active",
    commissionPct: 9, marketingFundPct: 1,
    dailyNet:   { studio: 31, oneBed: 42, twoBed: 71, threeBed: 87 },
    monthlyNet: { studio: 700, oneBed: 945, twoBed: 1600, threeBed: 1960 },
    paymentTerms: "Net 30", creditLimit: 5000,
    pocName: "Vikram Iyer", pocEmail: "v.iyer@cleartrip.com", pocPhone: "+973 1771 4400",
    notes: "Online retail volume · prepayment via merchant model.",
    ytdBookings: 22, ytdRevenue: 9810, ytdCommission: 883, targetBookings: 30,
    users: [
      { id: "U-CT-1", name: "Vikram Iyer", email: "v.iyer@cleartrip.com", phone: "+973 1771 4400", role: "primary", password: "AgentLogin-2026", primary: true },
    ],
  },
  {
    id: "AGT-0287", name: "Almosafer Wholesale", contact: "b2b@almosafer.com",
    signedOn: "2025-10-12", startsOn: "2025-11-01", endsOn: "2026-10-31", status: "active",
    commissionPct: 12, marketingFundPct: 2,
    dailyNet:   { studio: 28, oneBed: 39, twoBed: 67, threeBed: 84 },
    monthlyNet: { studio: 630, oneBed: 880, twoBed: 1510, threeBed: 1890 },
    paymentTerms: "Net 45", creditLimit: 12000,
    pocName: "Khalid Al-Otaibi", pocEmail: "khalid@almosafer.com", pocPhone: "+966 11 555 0900",
    notes: "Saudi market dominator · joint marketing fund deployable.",
    ytdBookings: 19, ytdRevenue: 8540, ytdCommission: 1025, targetBookings: 28,
  },
  {
    id: "AGT-0344", name: "Gulf DMC", contact: "rates@gulfdmc.bh",
    signedOn: "2026-02-01", startsOn: "2026-02-15", endsOn: "2027-02-14", status: "active",
    commissionPct: 8, marketingFundPct: 0,
    dailyNet:   { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    monthlyNet: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    paymentTerms: "Net 30", creditLimit: 4000,
    pocName: "Hessa Al-Bin Ali", pocEmail: "h.alali@gulfdmc.bh", pocPhone: "+973 1732 5577",
    notes: "Commission-only · groups & MICE focus.",
    ytdBookings: 15, ytdRevenue: 6720, ytdCommission: 538, targetBookings: 24,
  },
  {
    id: "AGT-0392", name: "Innovative Travels", contact: "info@itravels.bh",
    signedOn: "2026-01-20", startsOn: "2026-02-01", endsOn: "2026-07-31", status: "review",
    commissionPct: 7, marketingFundPct: 0,
    dailyNet:   { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    monthlyNet: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    paymentTerms: "Net 15", creditLimit: 2000,
    pocName: "Tareq Habib", pocEmail: "tareq@itravels.bh", pocPhone: "+973 1729 8800",
    notes: "Probationary contract · awaiting signed master.",
    ytdBookings: 11, ytdRevenue: 4910, ytdCommission: 344, targetBookings: 16,
  },
  // Imported from "2026 Wholesaler Contract Rates.docx" — Rehlat 2026 static
  // rate agreement. Net & non-commissionable, with separate weekday and
  // weekend rates, an additional Hotel Accommodation Fee, and event-period
  // supplements.
  {
    id: "AGT-0501", name: "Rehlat", contact: "suhad.jawad@rehlat.com",
    signedOn: "2026-01-17", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "active",
    commissionPct: 0, marketingFundPct: 0,
    dailyNet:   { studio: 22, oneBed: 25, twoBed: 42, threeBed: 57 },
    weekendNet: { studio: 26, oneBed: 29, twoBed: 50, threeBed: 65 },
    monthlyNet: { studio: 0,  oneBed: 0,  twoBed: 0,  threeBed: 0  },
    weekendUpliftPct: 18, taxIncluded: true, accommodationFee: 3.3,
    eventSupplements: [
      { id: "evt-eid-fitr", name: "Eid Al Fitr",        fromDate: "2026-03-18", toDate: "2026-03-22", supplement: 20 },
      { id: "evt-f1",       name: "Formula 1 Bahrain",  fromDate: "2026-04-10", toDate: "2026-04-12", supplement: 20 },
      { id: "evt-eid-adha", name: "Eid Al Adha",        fromDate: "2026-05-26", toDate: "2026-05-29", supplement: 20 },
      { id: "evt-snd",      name: "Saudi National Day", fromDate: "2026-09-23", toDate: "2026-09-25", supplement: 20 },
      { id: "evt-nye",      name: "New Year",           fromDate: "2025-12-31", toDate: "2026-01-01", supplement: 20 },
    ],
    paymentTerms: "On departure", creditLimit: 0,
    pocName: "Suhad Jawad", pocEmail: "suhad.jawad@rehlat.com", pocPhone: "+965 0000 0000",
    notes: "Wholesaler · net & non-commissionable. Weekdays Sat–Wed, weekends Thu–Fri. Children up to 11 stay free in existing bedding. Hotel Accommodation Fee of BHD 3.300 net per room per night is additional and not included in the rates. Virtual credit card payment ≥ 1 day prior to arrival; no credit facility extended. Cancellation: 48h free; less than 48h = 100% of one-night charges. All rates inclusive of 10% Service Charge, 5% Government Levy and 10% VAT.",
    ytdBookings: 0, ytdRevenue: 0, ytdCommission: 0, targetBookings: 50,
    sourceDoc: "2026 Wholesaler Contract Rates.docx",
  },
];

// Member records carry an optional `photo` and `idDoc` (each shaped like a
// uploaded-file descriptor: { url, name, size, type }) plus structured ID
// fields for KYC purposes. Pre-seeded members are unverified to demonstrate
// the empty state; admins can upload via the Edit drawer.
const SAMPLE_MEMBERS = [
  { id: "LS-G-A1B2C3", name: "Layla Al-Khalifa",   email: "l.alkhalifa@example.com",   tier: "gold",     points: 2840, lifetimeNights: 18, joined: "2025-08-12", phone: "+973 3300 1122", country: "Bahrain",       idType: "cpr",      idNumber: "880412345", idExpiry: "2030-04-12", verified: true,  photo: null, idDoc: null, password: "Member-2026" },
  { id: "LS-P-D4E5F6", name: "Sarah Holloway",     email: "s.holloway@example.com",    tier: "platinum", points: 4920, lifetimeNights: 31, joined: "2024-11-03", phone: "+44 7700 900123", country: "United Kingdom", idType: "passport", idNumber: "549012345", idExpiry: "2031-09-22", verified: true,  photo: null, idDoc: null, password: "Member-2026" },
  { id: "LS-S-G7H8I9", name: "Lorenzo Caretti",    email: "l.caretti@example.com",     tier: "silver",   points:  640, lifetimeNights:  6, joined: "2026-02-18", phone: "+39 02 1234567",  country: "Italy",          idType: "",         idNumber: "",         idExpiry: "",          verified: false, photo: null, idDoc: null, password: "Member-2026" },
  { id: "LS-G-J1K2L3", name: "Aisha Rahimi",       email: "a.rahimi@example.com",      tier: "gold",     points: 1980, lifetimeNights: 14, joined: "2025-05-26", phone: "+971 50 123 4567",country: "UAE",            idType: "passport", idNumber: "P9912345",  idExpiry: "2029-01-15", verified: true,  photo: null, idDoc: null, password: "Member-2026" },
  { id: "LS-P-M4N5O6", name: "Mohammed Al-Ansari", email: "m.ansari@example.com",      tier: "platinum", points: 6210, lifetimeNights: 42, joined: "2024-04-09", phone: "+973 3211 4455",  country: "Bahrain",        idType: "",         idNumber: "",         idExpiry: "",          verified: false, photo: null, idDoc: null, password: "Member-2026" },
];

// Calendar overrides — sparse map keyed by `${roomId}|${YYYY-MM-DD}`. A missing
// key falls back to the room's public price from the rooms array; calendar
// edits write into this map.
const INITIAL_CALENDAR_OVERRIDES = {
  // Pre-seed a couple of demo overrides so the calendar shows non-default cells.
  "two-bed|2026-05-15": { rate: 78, stopSale: true, blocked: 0, reason: "Group block" },
  "two-bed|2026-05-16": { rate: 78, stopSale: true, blocked: 0, reason: "Group block" },
  "two-bed|2026-05-17": { rate: 78, stopSale: true, blocked: 0, reason: "Group block" },
  "studio|2026-05-01":  { rate: 48, stopSale: false, blocked: 0, reason: "Weekend uplift" },
  "studio|2026-05-02":  { rate: 48, stopSale: false, blocked: 0, reason: "Weekend uplift" },
};

// ---------------------------------------------------------------------------
// Email templates — every guest- and partner-facing communication the hotel
// sends is pre-seeded as an editable template. Each carries:
//   id          — stable identifier
//   name        — admin-facing label
//   category    — booking | payment | invoice | loyalty | contracts | ota | marketing | internal
//   description — one-line summary shown in the list
//   trigger     — { event, auto, delayMinutes } — the system event that sends it
//   subject     — supports {{placeholder}} interpolation
//   body        — supports {{placeholder}} interpolation
//   from{Name,Email}, replyTo, cc, bcc — sender / routing config
//   active      — disabled templates don't fire even when the event triggers
//   builtIn     — built-in templates can be edited / disabled but reappear on refresh
//   variables   — optional explicit list (otherwise auto-discovered from {{...}})
// ---------------------------------------------------------------------------
const FROM_NAME  = "The Lodge Suites";
const FROM_EMAIL = "frontoffice@thelodgesuites.com";
const FOM_EMAIL  = "fom@thelodgesuites.com";
// Standard internal copy-list BCC'd on every booking-lifecycle email so the
// front desk + GM always have a record of guest correspondence. Comma-
// separated; the server normalises + validates this before sending.
const BOOKING_BCC = "gm@thelodgesuites.com, frontoffice@thelodgesuites.com, fom@thelodgesuites.com";

// Merge a comma-separated email string with extra addresses, de-duplicated
// case-insensitively and order-preserving. Returns a comma-separated string the
// server can normalise/validate. Empty/blank entries are dropped.
function mergeEmailList(existing, additions = []) {
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const e = String(raw || "").trim();
    if (!e) return;
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  String(existing || "").split(",").forEach(push);
  (additions || []).forEach(push);
  return out.join(", ");
}

// Resolve every party (besides the guest) who should be COPIED on a booking's
// confirmation + status mails, so a booking placed on someone else's behalf is
// always shared with the person who made it — and the booking PARTNER is kept
// in the loop. Returns deduped (case-insensitive) emails; the call site puts the
// guest in `to` and these on `cc` (or promotes the first to `to` when there's
// no guest email, e.g. an agency booking with no guest address).
//   • bookedByEmail — the logged-in user who placed the booking on behalf of
//     the guest (member / corporate / agent / direct self-service). When a user
//     books for themselves this equals the guest email and de-dupes away.
//   • agent  → the agency's portal contacts   (linked via agencyId)
//   • corporate → the company's portal contacts (linked via accountId)
//   • member → the member's own email          (linked via memberId)
function bookingCopyEmails(bk, { agencies = [], agreements = [], members = [] }) {
  if (!bk) return [];
  const acc = [];
  // The specific person who placed the booking on behalf of the guest.
  if (bk.bookedByEmail) acc.push(bk.bookedByEmail);
  // The partner account's portal contacts, so the whole booking desk is copied.
  if (bk.source === "agent") {
    const a = agencies.find((x) => x.id === bk.agencyId);
    if (a) (a.users || []).forEach((u) => u.email && acc.push(u.email));
  } else if (bk.source === "corporate") {
    const a = agreements.find((x) => x.id === bk.accountId);
    if (a) (a.users || []).forEach((u) => u.email && acc.push(u.email));
  } else if (bk.source === "member") {
    const m = members.find((x) => x.id === bk.memberId);
    if (m && m.email) acc.push(m.email);
  }
  const seen = new Set();
  const out = [];
  for (const raw of acc) {
    const e = String(raw || "").trim();
    if (!e) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

const SAMPLE_EMAIL_TEMPLATES = [
  // ---------- Booking ---------------------------------------------------------
  {
    id: "tpl-booking-confirm", name: "Booking confirmation", category: "booking",
    description: "Sent automatically when a reservation is confirmed and paid.",
    trigger: { event: "booking.confirmed", auto: true, delayMinutes: 0 },
    subject: "Your stay at {{hotelName}} is confirmed · {{bookingId}}",
    body:
`Dear {{guestName}},

We're delighted to confirm your reservation at {{hotelName}}.

  Booking ID:    {{bookingId}}
  Suite:         {{roomType}}
  Check-in:      {{checkInDate}} from {{checkInTime}}
  Check-out:     {{checkOutDate}} by {{checkOutTime}}
  Nights:        {{nights}}
  Guests:        {{guestCount}}
  Total:         {{totalAmount}}

Your suite includes complimentary Wi-Fi, on-site parking, and full access to the rooftop pool, fitness centre, and steam & sauna facilities.

Should your travel plans change, please contact us at {{hotelPhone}} or reply to this email at least 48 hours before arrival to avoid cancellation charges.

Looking forward to welcoming you.

Kind regards,
Front Office Team
{{hotelName}}
{{hotelAddress}}
{{hotelPhone}} · {{hotelEmail}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },
  {
    id: "tpl-booking-prearrival", name: "Pre-arrival reminder", category: "booking",
    description: "Sent 3 days before check-in to confirm details and offer concierge services.",
    trigger: { event: "booking.precheck", auto: true, delayMinutes: -4320 }, // 3 days before
    subject: "Looking forward to your arrival at {{hotelName}} on {{checkInDate}}",
    body:
`Dear {{guestName}},

Your stay at {{hotelName}} starts in 3 days. Here's a quick reminder of your booking:

  Booking ID:    {{bookingId}}
  Suite:         {{roomType}}
  Check-in:      {{checkInDate}} from {{checkInTime}}
  Check-out:     {{checkOutDate}} by {{checkOutTime}}

Need anything before you arrive? Just reply to this email — we're happy to arrange airport transfers, early check-in, dietary preferences, late check-out, in-suite spa treatments, or any special requests.

If you'd like to share an arrival flight number, we'll watch for delays and hold your suite accordingly.

Kind regards,
Front Office Team
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },
  {
    id: "tpl-booking-checkin", name: "Check-in day welcome", category: "booking",
    description: "Sent on the morning of arrival with the digital key link and house information.",
    trigger: { event: "booking.checkinday", auto: true, delayMinutes: 0 },
    subject: "Welcome to {{hotelName}} · we're ready for you",
    body:
`Dear {{guestName}},

We're ready to welcome you to {{hotelName}} today. Here's everything you need:

  Suite:         {{roomType}}
  Check-in:      from {{checkInTime}}
  Address:       {{hotelAddress}}
  Front desk:    {{hotelPhone}}

If you'd like to be greeted on arrival or need a Wi-Fi password ahead of time, simply reply to this email.

We look forward to seeing you shortly.

Kind regards,
Front Office Team
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },
  {
    id: "tpl-booking-modified", name: "Booking modification confirmation", category: "booking",
    description: "Sent when a booking's dates, room type, or guest count is changed.",
    trigger: { event: "booking.modified", auto: true, delayMinutes: 0 },
    subject: "Your booking {{bookingId}} has been updated",
    body:
`Dear {{guestName}},

We've updated your reservation as requested.

Updated details:
  Booking ID:    {{bookingId}}
  Suite:         {{roomType}}
  Check-in:      {{checkInDate}} from {{checkInTime}}
  Check-out:     {{checkOutDate}} by {{checkOutTime}}
  Nights:        {{nights}}
  Guests:        {{guestCount}}
  New total:     {{totalAmount}}

If you didn't request this change, please contact us immediately at {{hotelPhone}}.

Kind regards,
Front Office Team
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },
  {
    id: "tpl-booking-cancel", name: "Booking cancellation", category: "booking",
    description: "Sent when a booking is cancelled by the guest or hotel.",
    trigger: { event: "booking.cancelled", auto: true, delayMinutes: 0 },
    subject: "Your reservation {{bookingId}} has been cancelled",
    body:
`Dear {{guestName}},

We've cancelled the booking below as requested.

  Booking ID:    {{bookingId}}
  Suite:         {{roomType}}
  Check-in:      {{checkInDate}}
  Check-out:     {{checkOutDate}}

  Cancellation charge: {{cancellationCharge}}
  Refund:              {{refundAmount}}

Refunds appear in 5–7 business days on the original payment method.

We hope to host you another time.

Kind regards,
Front Office Team
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },
  {
    id: "tpl-booking-thankyou", name: "Post-departure thank-you", category: "booking",
    description: "Sent the day after check-out with a review request.",
    trigger: { event: "booking.checkedout", auto: true, delayMinutes: 1440 }, // 24h after
    subject: "Thank you for staying with {{hotelName}}",
    body:
`Dear {{guestName}},

Thank you for choosing {{hotelName}} for your recent stay. We hope you enjoyed your time in Juffair.

If you have a moment, we'd love to hear how we did — a short review on Google or TripAdvisor goes a long way for a small property like ours.

As an LS Privilege member, you've earned {{pointsEarned}} points from this stay. Your new balance is {{points}} points (BHD {{redeemableBhd}} redeemable on a future stay).

We hope to welcome you back soon.

Kind regards,
Front Office Team
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },
  {
    id: "tpl-booking-noshow", name: "No-show notice", category: "booking",
    description: "Sent when a guest hasn't arrived by 23:00 on check-in date.",
    trigger: { event: "booking.noshow", auto: true, delayMinutes: 0 },
    subject: "We missed you · {{bookingId}}",
    body:
`Dear {{guestName}},

Your reservation {{bookingId}} for check-in on {{checkInDate}} has been marked as a no-show. Per our cancellation policy, a charge of {{noShowCharge}} has been applied.

If you've been delayed and still wish to arrive, please contact us immediately at {{hotelPhone}} — we'll do our best to hold the suite or arrange an alternative.

Kind regards,
Front Office Team
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: FROM_EMAIL, replyTo: FROM_EMAIL, cc: "", bcc: BOOKING_BCC,
    active: true, builtIn: true,
  },

  // ---------- Payment ---------------------------------------------------------
  {
    id: "tpl-payment-receipt", name: "Payment receipt", category: "payment",
    description: "Sent automatically after a successful payment is captured.",
    trigger: { event: "payment.received", auto: true, delayMinutes: 0 },
    subject: "Payment received · {{transactionId}}",
    body:
`Dear {{guestName}},

We've received your payment of {{amount}} via {{paymentMethod}}.

  Transaction ID: {{transactionId}}
  Booking:        {{bookingId}}
  Date:           {{paymentDate}}
  Method:         {{paymentMethod}}

Your booking is now fully paid. The full confirmation will arrive shortly.

This receipt is for your records — no further action is required.

Kind regards,
Accounts Team
{{hotelName}}`,
    fromName: "Accounts · The Lodge Suites", fromEmail: "accounts@thelodgesuites.bh",
    replyTo: "accounts@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-payment-refund", name: "Refund issued", category: "payment",
    description: "Sent when a refund is processed back to the original payment method.",
    trigger: { event: "payment.refunded", auto: true, delayMinutes: 0 },
    subject: "Refund issued · {{transactionId}}",
    body:
`Dear {{guestName}},

A refund of {{amount}} has been issued against booking {{bookingId}}.

  Original transaction: {{transactionId}}
  Refund method:        {{paymentMethod}}
  Date:                 {{paymentDate}}

The refund will appear on your statement within 5–7 business days. If you don't see it after 7 working days, please contact us with your transaction ID and we'll investigate.

Kind regards,
Accounts Team
{{hotelName}}`,
    fromName: "Accounts · The Lodge Suites", fromEmail: "accounts@thelodgesuites.bh",
    replyTo: "accounts@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-payment-failed", name: "Payment failed · retry", category: "payment",
    description: "Sent when a payment attempt is declined or fails authorisation.",
    trigger: { event: "payment.failed", auto: true, delayMinutes: 0 },
    subject: "Payment unsuccessful · please retry · {{bookingId}}",
    body:
`Dear {{guestName}},

We were unable to process payment of {{amount}} for booking {{bookingId}}. Common reasons include an expired card, insufficient funds, or a 3-D Secure timeout.

Please retry by either:
  · Replying to this email with an alternative card detail (we'll send a secure link)
  · Calling our reservations desk on {{hotelPhone}}

Your booking is held for 24 hours pending payment. After that, the room will be released back to inventory.

Kind regards,
Reservations
{{hotelName}}`,
    fromName: "Reservations · The Lodge Suites", fromEmail: FROM_EMAIL,
    replyTo: FROM_EMAIL, cc: "", bcc: FOM_EMAIL,
    active: true, builtIn: true,
  },

  // ---------- Invoice ---------------------------------------------------------
  {
    id: "tpl-invoice-issued", name: "Invoice issued", category: "invoice",
    description: "Sent when an invoice is generated and dispatched to a partner / corporate.",
    trigger: { event: "invoice.issued", auto: true, delayMinutes: 0 },
    subject: "Invoice {{invoiceId}} from {{hotelName}}",
    body:
`Dear {{accountName}},

Please find attached invoice {{invoiceId}} for {{amount}}, due {{dueDate}}.

  Invoice ID:     {{invoiceId}}
  Issue date:     {{issueDate}}
  Due date:       {{dueDate}}
  Amount due:     {{amount}}
  Payment terms:  {{paymentTerms}}

Payment options:
  · Bank transfer to NBB Bahrain · IBAN BH## NBOB ##############
  · Online via the partner portal at thelodgesuites.com/portal
  · Cheque payable to "{{hotelName}} W.L.L."

If you have any questions about this invoice, please reply to this email.

Kind regards,
Accounts Team
{{hotelName}}`,
    fromName: "Accounts · The Lodge Suites", fromEmail: "accounts@thelodgesuites.bh",
    replyTo: "accounts@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-invoice-reminder", name: "Invoice payment reminder", category: "invoice",
    description: "Sent 7 days before invoice due date.",
    trigger: { event: "invoice.reminder", auto: true, delayMinutes: -10080 }, // 7 days before
    subject: "Reminder · invoice {{invoiceId}} due {{dueDate}}",
    body:
`Dear {{accountName}},

This is a friendly reminder that invoice {{invoiceId}} for {{amount}} is due on {{dueDate}}.

If payment has already been made, please disregard this notice. Otherwise, kindly settle by the due date to keep your account in good standing.

We've attached a copy of the invoice for your records.

Kind regards,
Accounts Team
{{hotelName}}`,
    fromName: "Accounts · The Lodge Suites", fromEmail: "accounts@thelodgesuites.bh",
    replyTo: "accounts@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-invoice-overdue", name: "Invoice overdue notice", category: "invoice",
    description: "Sent automatically when an invoice passes its due date.",
    trigger: { event: "invoice.overdue", auto: true, delayMinutes: 0 },
    subject: "Overdue · invoice {{invoiceId}} · please action",
    body:
`Dear {{accountName}},

Invoice {{invoiceId}} for {{amount}}, due {{dueDate}}, is now overdue.

Please arrange payment at your earliest convenience. If there is any reason for the delay, please reply so we can help resolve it. Continued non-payment may affect your credit terms with us.

Kind regards,
Accounts Team
{{hotelName}}`,
    fromName: "Accounts · The Lodge Suites", fromEmail: "accounts@thelodgesuites.bh",
    replyTo: "accounts@thelodgesuites.bh", cc: "", bcc: FOM_EMAIL,
    active: true, builtIn: true,
  },

  // ---------- Loyalty / LS Privilege ------------------------------------------
  {
    id: "tpl-loyalty-enrol", name: "LS Privilege enrolment", category: "loyalty",
    description: "Welcome email sent on member enrolment with wallet card link.",
    trigger: { event: "loyalty.enrolled", auto: true, delayMinutes: 0 },
    subject: "Welcome to LS Privilege · {{memberId}}",
    body:
`Dear {{memberName}},

Welcome to LS Privilege, the {{hotelName}} guest loyalty programme. Your membership is now active.

  Member ID:        {{memberId}}
  Tier:             {{tier}}
  Points balance:   {{points}}
  Earn rate:        {{earnRate}}× points per BHD spent on direct bookings

Your benefits include:
  · Member-exclusive rates on every direct booking
  · Welcome amenity in-suite on every stay
  · Late check-out subject to availability
  · Faster room categorisation and assignment

Add your digital card to Apple Wallet or Google Wallet from the portal at thelodgesuites.com/wallet/{{memberId}} — simply present it at check-in.

Kind regards,
LS Privilege Team
{{hotelName}}`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-loyalty-tierup", name: "Tier upgrade congratulations", category: "loyalty",
    description: "Sent when a member's lifetime nights cross into a higher tier.",
    trigger: { event: "loyalty.tier_upgrade", auto: true, delayMinutes: 0 },
    subject: "Congratulations · You've reached {{tier}} status with LS Privilege",
    body:
`Dear {{memberName}},

We're delighted to share that you've been upgraded to {{tier}} tier in recognition of your continued loyalty.

Your earn rate is now {{earnRate}}× points per BHD spent. Your current balance is {{points}} points (BHD {{redeemableBhd}} redeemable).

Your new {{tier}} benefits include:
{{tierBenefits}}

Thank you for choosing {{hotelName}}.

Kind regards,
LS Privilege Team`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-loyalty-points-earned", name: "Points earned · post-stay", category: "loyalty",
    description: "Sent within 24 hours of check-out to confirm points earned.",
    trigger: { event: "loyalty.points_earned", auto: true, delayMinutes: 1440 },
    subject: "+{{pointsEarned}} points added to your LS Privilege account",
    body:
`Dear {{memberName}},

Your stay has earned you {{pointsEarned}} points.

  Stay:           {{bookingId}}
  Points earned:  {{pointsEarned}}
  New balance:    {{points}}
  Redeemable:     BHD {{redeemableBhd}}

Use your points against any future stay at the rate of 100 points = BHD 1 off, or save them up — earn 5,000 points to unlock a complimentary night in your usual suite type.

Kind regards,
LS Privilege Team`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-loyalty-redeemed", name: "Points redemption confirmed", category: "loyalty",
    description: "Sent when points are redeemed against a booking.",
    trigger: { event: "loyalty.points_redeemed", auto: true, delayMinutes: 0 },
    subject: "Points redeemed · {{redeemedAmount}} off your stay",
    body:
`Dear {{memberName}},

We've redeemed {{redeemedPoints}} points against booking {{bookingId}} — that's BHD {{redeemedAmount}} off your stay.

  New points balance:  {{points}}
  Redeemable:          BHD {{redeemableBhd}}

Looking forward to welcoming you.

Kind regards,
LS Privilege Team`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-loyalty-statement", name: "Monthly member statement", category: "loyalty",
    description: "Optional monthly statement summarising stays, points, and redemptions.",
    trigger: { event: "loyalty.statement", auto: false, delayMinutes: 0 },
    subject: "Your LS Privilege statement · {{statementMonth}}",
    body:
`Dear {{memberName}},

Your LS Privilege summary for {{statementMonth}}:

  Member ID:           {{memberId}}
  Tier:                {{tier}}
  Stays this month:    {{monthStays}}
  Nights:              {{monthNights}}
  Points earned:       {{monthPointsEarned}}
  Points redeemed:     {{monthPointsRedeemed}}
  Current balance:     {{points}}
  Redeemable:          BHD {{redeemableBhd}}
  Lifetime nights:     {{lifetimeNights}}

Looking forward to your next stay.

Kind regards,
LS Privilege Team`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-loyalty-anniversary", name: "Membership anniversary", category: "loyalty",
    description: "Sent on the anniversary of member enrolment.",
    trigger: { event: "loyalty.anniversary", auto: true, delayMinutes: 0 },
    subject: "Happy anniversary · thank you for {{yearsAsMember}} years with LS Privilege",
    body:
`Dear {{memberName}},

Today marks {{yearsAsMember}} year(s) since you joined LS Privilege. Thank you for being part of the LS Privilege family.

To mark the occasion, we've added 500 bonus points to your account.

  New balance:   {{points}}
  Redeemable:    BHD {{redeemableBhd}}

We'd love to host you again soon.

Kind regards,
LS Privilege Team`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },

  // ---------- Contracts (B2B) -------------------------------------------------
  {
    id: "tpl-contract-corporate", name: "Corporate contract dispatch", category: "contracts",
    description: "Cover email when issuing a corporate rate agreement.",
    trigger: { event: "contract.issued.corporate", auto: false, delayMinutes: 0 },
    subject: "{{hotelName}} · Corporate Rate Agreement {{contractId}}",
    body:
`Dear {{pocName}},

Please find attached the negotiated corporate rate agreement between {{hotelName}} and {{accountName}}.

  Contract:       {{contractId}}
  Validity:       {{validFrom}} → {{validTo}}
  Payment terms:  {{paymentTerms}}
  Credit limit:   {{creditLimit}}

The full rate matrix, inclusions, cancellation policy and event-period supplements are detailed in the attached document. Please counter-sign and return to confirm acceptance.

Should you require any adjustments, please reply to this email.

Kind regards,
Aparajeet Mathad
Front Office Manager
{{hotelName}}
{{hotelPhone}} · ${FOM_EMAIL}`,
    fromName: "Front Office · The Lodge Suites", fromEmail: FOM_EMAIL,
    replyTo: FOM_EMAIL, cc: "sales@exploremena.com", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-contract-agent", name: "Travel-agent contract dispatch", category: "contracts",
    description: "Cover email when issuing a wholesaler / travel-agent rate sheet.",
    trigger: { event: "contract.issued.agent", auto: false, delayMinutes: 0 },
    subject: "{{hotelName}} · Wholesaler Contract Rates {{contractId}}",
    body:
`Dear {{pocName}},

Please find attached the {{contractId}} wholesaler contract rates between {{hotelName}} and {{accountName}}, valid {{validFrom}} → {{validTo}}.

  Commission:     {{commissionPct}}%
  Payment terms:  {{paymentTerms}}
  Reservations:   {{hotelEmail}} · WhatsApp +973 3306 9641

Rates are net & non-commissionable, inclusive of taxes. Hotel Accommodation Fee of BHD 3.300 net per room per night is additional.

Kindly counter-sign and return to confirm acceptance.

Kind regards,
Aparajeet Mathad
Front Office Manager
{{hotelName}}`,
    fromName: "Front Office · The Lodge Suites", fromEmail: FOM_EMAIL,
    replyTo: FOM_EMAIL, cc: "sales@exploremena.com", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-contract-renewal", name: "Contract renewal reminder", category: "contracts",
    description: "Sent 60 days before a contract's end date.",
    trigger: { event: "contract.renewal", auto: true, delayMinutes: -86400 }, // 60 days before
    subject: "Renewal reminder · contract {{contractId}} expires {{validTo}}",
    body:
`Dear {{pocName}},

Your contract {{contractId}} with {{hotelName}} expires on {{validTo}} — 60 days from today.

We'd love to continue our partnership. Please confirm whether you'd like to:
  · Renew at the same rates
  · Renegotiate ahead of renewal
  · Add new room categories or extend the geography

Reply to this email or call {{hotelPhone}} and we'll set up a renewal call.

Kind regards,
Sales Team
{{hotelName}}`,
    fromName: "Sales · The Lodge Suites", fromEmail: "sales@exploremena.com",
    replyTo: "sales@exploremena.com", cc: FOM_EMAIL, bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-rfp-ack", name: "RFP acknowledgment", category: "contracts",
    description: "Acknowledges receipt of a corporate RFP and commits to a 48-hour response.",
    trigger: { event: "rfp.received", auto: true, delayMinutes: 0 },
    subject: "Re: RFP {{rfpId}} · received",
    body:
`Dear {{contactName}},

Thank you for your interest in {{hotelName}}. We've received your RFP {{rfpId}} for {{roomNights}} room-nights from {{accountName}} and we'll respond with a tailored proposal within 48 hours.

For urgent matters, please contact us directly on {{hotelPhone}}.

Kind regards,
Sales Team
{{hotelName}}`,
    fromName: "Sales · The Lodge Suites", fromEmail: "sales@exploremena.com",
    replyTo: "sales@exploremena.com", cc: FOM_EMAIL, bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-agent-statement", name: "Travel-agent commission statement", category: "contracts",
    description: "Monthly commission statement sent to active agencies.",
    trigger: { event: "agency.statement", auto: false, delayMinutes: 0 },
    subject: "{{hotelName}} · Commission statement · {{statementMonth}}",
    body:
`Dear {{pocName}},

Please find attached your commission statement for {{statementMonth}}.

  Agency:                 {{accountName}}
  Bookings stayed:        {{monthBookings}}
  Stayed value:           BHD {{monthStayValue}}
  Commission earned:      BHD {{monthCommission}}
  YTD commission earned:  BHD {{ytdCommission}}
  Payment status:         {{paymentStatus}}

Settlement will be made on Net-30 terms to the bank details on file. If you'd like to update your settlement details, please reply to this email.

Kind regards,
Accounts Team
{{hotelName}}`,
    fromName: "Accounts · The Lodge Suites", fromEmail: "accounts@thelodgesuites.bh",
    replyTo: "accounts@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },

  // ---------- OTA / Channel ---------------------------------------------------
  {
    id: "tpl-ota-stopsale", name: "Stop-sale notification (OTAs)", category: "ota",
    description: "Sent to OTA channel managers when a stop-sale is applied.",
    trigger: { event: "ota.stopsale", auto: false, delayMinutes: 0 },
    subject: "Stop-sale · {{hotelName}} · {{startDate}} → {{endDate}}",
    body:
`Dear OTA Partner,

Please apply the following stop-sale on {{hotelName}}:

  Period:       {{startDate}} → {{endDate}}
  Suite types:  {{roomTypes}}
  Reason:       {{reason}}

Bookings already confirmed will be honoured. Please action this within 2 hours.

If you need to discuss alternatives or release a partial allotment, contact our reservations team on {{hotelPhone}}.

Kind regards,
Reservations
{{hotelName}}`,
    fromName: "Reservations · The Lodge Suites", fromEmail: FROM_EMAIL,
    replyTo: FROM_EMAIL, cc: FOM_EMAIL, bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-ota-rate-update", name: "Rate update (OTAs)", category: "ota",
    description: "Notifies channel managers of new rate or allotment configuration.",
    trigger: { event: "ota.rateupdate", auto: false, delayMinutes: 0 },
    subject: "Rate / allotment update · {{hotelName}} · effective {{effectiveDate}}",
    body:
`Dear OTA Partner,

Please update the following rates and allotments on {{hotelName}}, effective {{effectiveDate}}:

  Lodge Studio:           BHD {{rateStudio}} · {{allotmentStudio}} rooms
  One-Bedroom Suite:      BHD {{rateOneBed}} · {{allotmentOneBed}} rooms
  Two-Bedroom Suite:      BHD {{rateTwoBed}} · {{allotmentTwoBed}} rooms
  Three-Bedroom Suite:    BHD {{rateThreeBed}} · {{allotmentThreeBed}} rooms

Please confirm the update has been pushed to your live inventory.

Kind regards,
Revenue Team
{{hotelName}}`,
    fromName: "Revenue · The Lodge Suites", fromEmail: FROM_EMAIL,
    replyTo: FROM_EMAIL, cc: FOM_EMAIL, bcc: "",
    active: true, builtIn: true,
  },

  // ---------- Marketing -------------------------------------------------------
  {
    id: "tpl-mkt-newsletter", name: "Monthly newsletter", category: "marketing",
    description: "Manual monthly newsletter to opted-in subscribers.",
    trigger: { event: "marketing.newsletter", auto: false, delayMinutes: 0 },
    subject: "{{hotelName}} · {{newsletterMonth}} edition",
    body:
`Dear {{guestName}},

Welcome to the {{newsletterMonth}} edition of news from {{hotelName}}.

This month at the lodge:
  · {{newsItem1}}
  · {{newsItem2}}
  · {{newsItem3}}

Featured offer this month:
  {{offerHeadline}} — {{offerDetail}}
  Book direct at thelodgesuites.com using code {{offerCode}}.

We hope to host you soon.

Kind regards,
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: "newsletter@thelodgesuites.bh",
    replyTo: FROM_EMAIL, cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-mkt-special-offer", name: "Special offer launch", category: "marketing",
    description: "Sent when a new package or seasonal offer goes live.",
    trigger: { event: "marketing.special_offer", auto: false, delayMinutes: 0 },
    subject: "New at {{hotelName}} · {{offerHeadline}}",
    body:
`Dear {{guestName}},

We've just launched a new offer:

{{offerHeadline}}

{{offerDetail}}

  Book direct: thelodgesuites.com
  Use code:    {{offerCode}}
  Valid:       {{offerValidFrom}} → {{offerValidTo}}

This is exclusive to LS Privilege members and direct guests — OTAs are not eligible.

Kind regards,
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: "marketing@thelodgesuites.bh",
    replyTo: FROM_EMAIL, cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-mkt-birthday", name: "Birthday greeting", category: "marketing",
    description: "Sent on a member's birthday with a small gesture.",
    trigger: { event: "marketing.birthday", auto: true, delayMinutes: 0 },
    subject: "Happy birthday from {{hotelName}}",
    body:
`Dear {{memberName}},

Happy birthday from all of us at {{hotelName}}.

To mark the occasion, we've added 500 bonus points to your account and unlocked a complimentary cake on your next stay (just mention this email at check-in).

  New balance:    {{points}}
  Redeemable:     BHD {{redeemableBhd}}

Kind regards,
LS Privilege Team`,
    fromName: "LS Privilege · The Lodge Suites", fromEmail: "privilege@thelodgesuites.bh",
    replyTo: "privilege@thelodgesuites.bh", cc: "", bcc: "",
    active: true, builtIn: true,
  },
  {
    id: "tpl-mkt-winback", name: "Win-back · dormant member", category: "marketing",
    description: "Sent to members who haven't stayed in 9+ months.",
    trigger: { event: "marketing.winback", auto: true, delayMinutes: 0 },
    subject: "We miss you at {{hotelName}}",
    body:
`Dear {{memberName}},

It's been a while since your last stay with us. We'd love to welcome you back.

To make it easier, here's an exclusive offer for you:
  · 15% off your next direct booking
  · Complimentary breakfast for two
  · Late check-out until 18:00

Book direct at thelodgesuites.com with code COMEBACK before {{offerValidTo}}.

Kind regards,
{{hotelName}}`,
    fromName: FROM_NAME, fromEmail: "marketing@thelodgesuites.bh",
    replyTo: FROM_EMAIL, cc: "", bcc: "",
    active: true, builtIn: true,
  },

  // ---------- Internal -------------------------------------------------------
  {
    id: "tpl-internal-handover", name: "Daily ops handover", category: "internal",
    description: "Daily morning summary sent to operations team.",
    trigger: { event: "internal.daily_handover", auto: true, delayMinutes: 0 },
    subject: "Daily handover · {{today}} · {{hotelName}}",
    body:
`Team,

Daily handover for {{today}}:

  Arrivals today:       {{arrivals}}
  Departures today:     {{departures}}
  In-house:             {{inHouse}}
  VIP guests:           {{vipGuests}}
  Stays > 30 days:      {{longStayCount}}
  Maintenance flags:    {{maintenanceFlags}}
  Allergies / dietary:  {{allergyFlags}}

Today's house occupancy is forecast at {{forecastOccupancy}}%.

Reservations dashboard: thelodgesuites.com/portal/admin

— Front Office`,
    fromName: "Front Office · The Lodge Suites", fromEmail: FROM_EMAIL,
    replyTo: FROM_EMAIL, cc: FOM_EMAIL, bcc: "",
    active: true, builtIn: true,
  },
];

// ---------------------------------------------------------------------------
// OTA channel directory — every channel manager connection the property
// runs, with full configuration (connection · commercial · mappings ·
// restrictions · communications) plus a 30-day audit log.
// ---------------------------------------------------------------------------
const SAMPLE_CHANNELS = [
  {
    id: "ota-booking", name: "Booking.com", initials: "B", brandColor: "#003580",
    status: "live", parity: "ok",
    // Connection
    hotelId: "1234567",
    endpoint: "https://distribution-xml.booking.com/2.x/",
    apiKeyMasked: "**** **** **** XK7Q",
    apiSecretMasked: "**** **** **** ZP1M",
    pushIntervalMinutes: 15,
    lastSyncAt: "2026-04-28T14:32:00",
    lastSyncStatus: "success",
    // Commercial
    paymentModel: "commission", commissionPct: 17, paymentTerms: "Net 30",
    contractStart: "2026-01-01", contractEnd: "2026-12-31",
    // Performance
    bookings7d: 18, bookings30d: 67, bookingsYtd: 612,
    revenue7d: 4200, revenue30d: 18450, revenueYtd: 162400,
    cancellationRate: 12.3, avgAdr: 84,
    // Mappings
    roomMap: [
      { roomId: "studio",    externalId: "BK-1234567-1", externalName: "Lodge Studio · King Bed",        linked: true },
      { roomId: "one-bed",   externalId: "BK-1234567-2", externalName: "Classic 1BR Suite · King",       linked: true },
      { roomId: "two-bed",   externalId: "BK-1234567-3", externalName: "Deluxe 2BR Suite · Family",      linked: true },
      { roomId: "three-bed", externalId: "BK-1234567-4", externalName: "Luxury 3BR Suite",               linked: true },
    ],
    ratePlanMap: [
      { planId: "best-flexible",   externalId: "RP-101", externalName: "Best Available Rate",   active: true  },
      { planId: "non-refundable",  externalId: "RP-102", externalName: "Non-Refundable · 10% off", active: true  },
      { planId: "advance-purchase",externalId: "RP-103", externalName: "Advance Purchase 14d",   active: false },
    ],
    // Restrictions / policies
    minStay: 1, maxStay: 30, leadInHours: 0,
    cancellationPolicy: "Free cancellation up to 24h prior · 1 night fee otherwise",
    // Communications
    contactEmail: "connectivity@booking.com",
    notifyStopsale: true, notifyRateUpdate: true, notifyAllotment: true,
    // Audit log (most recent first)
    syncLog: [
      { id: "s1", ts: "2026-04-28T14:32:00", type: "push.availability", status: "success", message: "Pushed 30 days × 4 rooms" },
      { id: "s2", ts: "2026-04-28T13:30:00", type: "pull.bookings",     status: "success", message: "Imported 2 reservations" },
      { id: "s3", ts: "2026-04-28T12:30:00", type: "push.rates",        status: "success", message: "Rates pushed · 4 plans × 30 days" },
      { id: "s4", ts: "2026-04-28T11:30:00", type: "pull.bookings",     status: "success", message: "No new reservations" },
      { id: "s5", ts: "2026-04-28T10:30:00", type: "push.availability", status: "success", message: "Pushed 30 days × 4 rooms" },
      { id: "s6", ts: "2026-04-28T09:30:00", type: "pull.bookings",     status: "success", message: "Imported 1 reservation" },
    ],
    notes: "Primary global OTA · ~38% of all OTA volume. Direct XML connectivity.",
  },
  {
    id: "ota-expedia", name: "Expedia", initials: "E", brandColor: "#FFC72C",
    status: "live", parity: "ok",
    hotelId: "EXP-99124", endpoint: "https://services.expediapartnercentral.com/",
    apiKeyMasked: "**** **** **** 7K2D", apiSecretMasked: "**** **** **** WQ3A",
    pushIntervalMinutes: 30,
    lastSyncAt: "2026-04-28T14:29:00", lastSyncStatus: "success",
    paymentModel: "merchant", commissionPct: 18, paymentTerms: "Net 45",
    contractStart: "2026-01-01", contractEnd: "2026-12-31",
    bookings7d: 11, bookings30d: 44, bookingsYtd: 386,
    revenue7d: 2810, revenue30d: 11200, revenueYtd: 102800,
    cancellationRate: 9.8, avgAdr: 89,
    roomMap: [
      { roomId: "studio",    externalId: "EXP-1001", externalName: "Studio · 1 King",             linked: true },
      { roomId: "one-bed",   externalId: "EXP-1002", externalName: "1 Bedroom Suite · 1 King",    linked: true },
      { roomId: "two-bed",   externalId: "EXP-1003", externalName: "2 Bedroom Suite · 2 King",    linked: true },
      { roomId: "three-bed", externalId: "EXP-1004", externalName: "3 Bedroom Suite",             linked: true },
    ],
    ratePlanMap: [
      { planId: "best-flexible",   externalId: "EXP-RP1", externalName: "Best Flexible Rate", active: true },
      { planId: "non-refundable",  externalId: "EXP-RP2", externalName: "Pay Now · Save 10%",   active: true },
    ],
    minStay: 1, maxStay: 30, leadInHours: 0,
    cancellationPolicy: "Free cancellation up to 48h prior · 1 night fee otherwise",
    contactEmail: "partners@expedia.com",
    notifyStopsale: true, notifyRateUpdate: true, notifyAllotment: true,
    syncLog: [
      { id: "e1", ts: "2026-04-28T14:29:00", type: "push.availability", status: "success", message: "Pushed 30 days × 4 rooms" },
      { id: "e2", ts: "2026-04-28T14:00:00", type: "pull.bookings",     status: "success", message: "Imported 1 reservation" },
      { id: "e3", ts: "2026-04-28T13:00:00", type: "push.rates",        status: "success", message: "Rates pushed · 2 plans × 30 days" },
    ],
    notes: "Merchant-of-record model · Expedia collects payment, settles Net-45.",
  },
  {
    id: "ota-agoda", name: "Agoda", initials: "A", brandColor: "#FF1A39",
    status: "live", parity: "warn",
    hotelId: "AGD-77881", endpoint: "https://ycs.agoda.com/api/",
    apiKeyMasked: "**** **** **** 1MP9", apiSecretMasked: "**** **** **** R8XS",
    pushIntervalMinutes: 60,
    lastSyncAt: "2026-04-28T14:25:00", lastSyncStatus: "warn",
    paymentModel: "commission", commissionPct: 20, paymentTerms: "Net 30",
    contractStart: "2026-01-01", contractEnd: "2026-12-31",
    bookings7d: 6, bookings30d: 22, bookingsYtd: 174,
    revenue7d: 1340, revenue30d: 5210, revenueYtd: 42800,
    cancellationRate: 14.7, avgAdr: 76,
    roomMap: [
      { roomId: "studio",    externalId: "AGD-S01", externalName: "Studio Apartment · King", linked: true  },
      { roomId: "one-bed",   externalId: "AGD-O01", externalName: "1-Bed Suite · King",      linked: true  },
      { roomId: "two-bed",   externalId: "AGD-T01", externalName: "2-Bed Family Suite",      linked: true  },
      { roomId: "three-bed", externalId: "",         externalName: "",                        linked: false },
    ],
    ratePlanMap: [
      { planId: "best-flexible",  externalId: "AGD-RP1", externalName: "Standard Rate", active: true },
      { planId: "non-refundable", externalId: "AGD-RP2", externalName: "Saver Rate",    active: true },
    ],
    minStay: 1, maxStay: 30, leadInHours: 0,
    cancellationPolicy: "Free cancellation up to 24h prior · 1 night fee otherwise",
    contactEmail: "partners@agoda.com",
    notifyStopsale: true, notifyRateUpdate: true, notifyAllotment: false,
    syncLog: [
      { id: "a1", ts: "2026-04-28T14:25:00", type: "push.rates",        status: "warn",    message: "Parity warning · 1 rate higher than direct on 5 May" },
      { id: "a2", ts: "2026-04-28T13:25:00", type: "pull.bookings",     status: "success", message: "Imported 1 reservation" },
      { id: "a3", ts: "2026-04-28T12:25:00", type: "push.availability", status: "success", message: "Pushed 30 days × 3 rooms (3-Bed not mapped)" },
    ],
    notes: "Strong APAC distribution. Three-bedroom not yet mapped — pending Agoda content team.",
  },
  {
    id: "ota-almosafer", name: "Almosafer", initials: "AS", brandColor: "#0E7C66",
    status: "live", parity: "ok",
    hotelId: "ALM-44219", endpoint: "https://supplier.almosafer.com/api/",
    apiKeyMasked: "**** **** **** 9F3W", apiSecretMasked: "**** **** **** L4YT",
    pushIntervalMinutes: 30,
    lastSyncAt: "2026-04-28T14:31:00", lastSyncStatus: "success",
    paymentModel: "commission", commissionPct: 12, paymentTerms: "Net 30",
    contractStart: "2025-11-01", contractEnd: "2026-10-31",
    bookings7d: 9, bookings30d: 35, bookingsYtd: 287,
    revenue7d: 2180, revenue30d: 8900, revenueYtd: 73600,
    cancellationRate: 7.2, avgAdr: 81,
    roomMap: [
      { roomId: "studio",    externalId: "ALM-101", externalName: "Studio Suite",     linked: true },
      { roomId: "one-bed",   externalId: "ALM-201", externalName: "1-Bedroom Suite",  linked: true },
      { roomId: "two-bed",   externalId: "ALM-301", externalName: "2-Bedroom Suite",  linked: true },
      { roomId: "three-bed", externalId: "ALM-401", externalName: "3-Bedroom Suite",  linked: true },
    ],
    ratePlanMap: [
      { planId: "best-flexible",  externalId: "ALM-BAR", externalName: "Best Available Rate", active: true },
    ],
    minStay: 1, maxStay: 30, leadInHours: 0,
    cancellationPolicy: "Free cancellation up to 48h prior",
    contactEmail: "b2b@almosafer.com",
    notifyStopsale: true, notifyRateUpdate: true, notifyAllotment: true,
    syncLog: [
      { id: "as1", ts: "2026-04-28T14:31:00", type: "push.availability", status: "success", message: "Pushed 30 days × 4 rooms" },
      { id: "as2", ts: "2026-04-28T14:01:00", type: "pull.bookings",     status: "success", message: "No new reservations" },
      { id: "as3", ts: "2026-04-28T13:31:00", type: "push.rates",        status: "success", message: "Rates pushed · 1 plan × 30 days" },
    ],
    notes: "Saudi/GCC market dominator · low cancellation rate, high yield.",
  },
  {
    id: "ota-hotelbeds", name: "Hotelbeds", initials: "H", brandColor: "#C8102E",
    status: "paused", parity: "n/a",
    hotelId: "HB-22107", endpoint: "https://api.hotelbeds.com/",
    apiKeyMasked: "**** **** **** 2K8B", apiSecretMasked: "**** **** **** D7LN",
    pushIntervalMinutes: 60,
    lastSyncAt: "2026-04-26T18:14:00", lastSyncStatus: "success",
    paymentModel: "net-rate", commissionPct: 0, paymentTerms: "Net 45",
    contractStart: "2025-09-01", contractEnd: "2026-08-31",
    bookings7d: 0, bookings30d: 0, bookingsYtd: 84,
    revenue7d: 0, revenue30d: 0, revenueYtd: 21400,
    cancellationRate: 18.5, avgAdr: 72,
    roomMap: [
      { roomId: "studio",  externalId: "HB-S01", externalName: "Studio · Std",   linked: true },
      { roomId: "one-bed", externalId: "HB-O01", externalName: "1-Bed · Std",    linked: true },
      { roomId: "two-bed", externalId: "",       externalName: "",               linked: false },
      { roomId: "three-bed", externalId: "",     externalName: "",               linked: false },
    ],
    ratePlanMap: [
      { planId: "wholesale", externalId: "HB-WS",  externalName: "Wholesale Net", active: true },
    ],
    minStay: 2, maxStay: 30, leadInHours: 24,
    cancellationPolicy: "Strict · 100% if cancelled within 7 days",
    contactEmail: "connectivity@hotelbeds.com",
    notifyStopsale: false, notifyRateUpdate: false, notifyAllotment: false,
    syncLog: [
      { id: "h1", ts: "2026-04-26T18:14:00", type: "push.availability", status: "success", message: "Final push before pause" },
      { id: "h2", ts: "2026-04-26T18:00:00", type: "config.update",     status: "success", message: "Channel paused by operator" },
    ],
    notes: "Currently paused — yield-management decision (low margin · high cancellations). Re-evaluate Q3 2026.",
  },
];

// ---------------------------------------------------------------------------
// RFPs in flight — corporate prospects awaiting a proposal / negotiation /
// client decision. Stages flow:
//   review → proposal → negotiate → await → won (converted to contract) | lost
// `receivedOn` is the source of truth for age (computed); `dueDate` flags
// overdue responses on the dashboard.
// ---------------------------------------------------------------------------
const SAMPLE_RFPS = [
  {
    id: "RFP-7821", account: "ALBA Aluminium", industry: "Industrial", status: "review",
    receivedOn: "2026-04-26", dueDate: "2026-04-29",
    contactName: "Hisham Al-Mahroos", contactEmail: "h.mahroos@alba.com.bh", contactPhone: "+973 1783 0000",
    roomNights: 320, estValue: 14400, maxRate: 45, paymentTerms: "Net 30",
    eligibleFrom: "2026-06-01", eligibleTo: "2027-05-31",
    inclusions: { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    requirements: "Engineer rotations · prefer high-floor 1-Bed and 2-Bed suites · 30-90 night stays.",
    notes: "Existing supplier of refurb materials. Volume potential ~600 nights/year.",
  },
  {
    id: "RFP-7843", account: "Tamkeen", industry: "Government", status: "proposal",
    receivedOn: "2026-04-23", dueDate: "2026-04-27",
    contactName: "Noura Al-Doseri", contactEmail: "n.aldoseri@tamkeen.bh", contactPhone: "+973 1738 3333",
    roomNights: 180, estValue: 6840, maxRate: 38, paymentTerms: "Net 60",
    eligibleFrom: "2026-07-01", eligibleTo: "2027-06-30",
    inclusions: { breakfast: true, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    requirements: "Government scheme delegates · short stays 3-5 nights mostly Studio / 1-Bed.",
    notes: "Counter-proposal sent on 25 April · awaiting response.",
  },
  {
    id: "RFP-7902", account: "Mumtalakat Holding", industry: "Investment", status: "negotiate",
    receivedOn: "2026-04-19", dueDate: "2026-04-30",
    contactName: "Ali Al-Khalifa", contactEmail: "a.alkhalifa@mumtalakat.bh", contactPhone: "+973 1751 0000",
    roomNights: 240, estValue: 11520, maxRate: 48, paymentTerms: "Net 30",
    eligibleFrom: "2026-05-15", eligibleTo: "2027-05-14",
    inclusions: { breakfast: true, lateCheckOut: true, parking: true, wifi: true, meetingRoom: true },
    requirements: "Family offices · senior visitor preferences · 2-Bed with separate work area.",
    notes: "Discussing inclusion of meeting room access and 10% off F&B.",
  },
  {
    id: "RFP-7958", account: "Mondelez MEA", industry: "Consumer", status: "await",
    receivedOn: "2026-04-14", dueDate: "2026-04-28",
    contactName: "Daniel Marchetti", contactEmail: "d.marchetti@mdlz.com", contactPhone: "+973 3611 4422",
    roomNights: 90, estValue: 4140, maxRate: 46, paymentTerms: "Net 30",
    eligibleFrom: "2026-06-01", eligibleTo: "2026-12-31",
    inclusions: { breakfast: true, lateCheckOut: true, parking: true, wifi: true, meetingRoom: true },
    requirements: "Regional sales reps · short stays · 1-Bed mostly. Already on existing AGR-2026-005.",
    notes: "Top-up RFP for additional H2 volume. Decision expected within 7 days.",
  },
  {
    id: "RFP-7980", account: "Gulf Air Crew Layover", industry: "Aviation", status: "review",
    receivedOn: "2026-04-27", dueDate: "2026-05-01",
    contactName: "Capt. Khaled Janahi", contactEmail: "crew.layover@gulfair.com", contactPhone: "+973 1733 5555",
    roomNights: 540, estValue: 22680, maxRate: 42, paymentTerms: "Net 45",
    eligibleFrom: "2026-06-01", eligibleTo: "2027-05-31",
    inclusions: { breakfast: true, lateCheckOut: true, parking: true, wifi: true, meetingRoom: false },
    requirements: "Crew layovers · blackout 24h before/after rotations · 24/7 housekeeping access.",
    notes: "Highest volume in pipeline. Convert priority.",
  },
];

// Earn rates moved onto each tier (`tier.earnRate`). Loyalty now only carries
// the points-economy globals — redemption rate and free-night threshold.
const INITIAL_LOYALTY = {
  redeemBhdPerPoints:  100,    // 100 points = BHD 1 off
  freeNightAfterPts:   5000,
};

// ─── Prospects ───────────────────────────────────────────────────────────
// Pre-contract leads captured during web research. The Discover-Prospects
// drawer surfaces Google / LinkedIn / Maps deep-links so the operator can
// research a target account, then capture it here. Each prospect rolls up
// into either an RFP (corporate) or a new agency draft (agent) once it's
// qualified — see ProspectExplorer.jsx for the conversion flow.
export const PROSPECT_REGIONS = [
  { id: "bahrain",       label: "Bahrain",       hint: "Manama, Juffair, Seef, Riffa, Saar" },
  { id: "saudi",         label: "Saudi Arabia",  hint: "Riyadh, Jeddah, Dammam, Khobar" },
  { id: "uae",           label: "UAE",           hint: "Dubai, Abu Dhabi, Sharjah" },
  { id: "kuwait",        label: "Kuwait",        hint: "Kuwait City, Salmiya" },
  { id: "qatar",         label: "Qatar",         hint: "Doha" },
  { id: "oman",          label: "Oman",          hint: "Muscat, Salalah" },
  { id: "gcc",           label: "GCC (any)",     hint: "Cross-border / regional HQ" },
  { id: "international", label: "International", hint: "Outside the GCC" },
];

export const PROSPECT_INDUSTRIES = [
  "Banking & Finance", "Oil & Gas", "Government", "Aviation",
  "Construction", "Healthcare", "Education", "Technology",
  "Manufacturing", "Investment", "Retail", "Telecoms",
  "Diplomatic Mission", "Hospitality", "Other",
];

export const PROSPECT_AGENT_SPECIALTIES = [
  "Inbound · GCC", "Outbound · Saudi", "Outbound · India", "Outbound · UK",
  "MICE / Corporate", "Wholesale / Bedbank", "OTA Reseller",
  "Religious / Hajj-Umrah", "Crew & Aviation", "Luxury / DMC", "Other",
];

// Pipeline stages — separate catalogues per kind so each side mirrors the
// real B2B sales motion. Both share the front of funnel (Identified,
// Qualified, Contacted) and the closed states (Won/Producing, Lost), but
// diverge in the middle: corporates run Discovery → Proposal → Negotiation;
// travel agents run Rate Sheet → FAM Visit → Contracted → Producing.
//
// Each stage carries:
//   id        — stable identifier stored on a prospect record
//   label     — short display name (chip text)
//   base      — vivid hex colour for chip / funnel
//   hint      — one-sentence description of what the stage means
//   nextAction — suggested next move (rendered under the chip in the form)
//   aging     — soft SLA in days; if a prospect sits longer it goes "stale"
//   closed    — true for terminal states (no nextAction)
export const PROSPECT_STATUSES_CORPORATE = [
  { id: "identified",  label: "Identified",  base: "#2563EB", hint: "Captured from web research. Volume / fit not yet confirmed.",        nextAction: "Qualify: confirm decision-maker, annual nights, budget.",                aging: 5  },
  { id: "qualified",   label: "Qualified",   base: "#7C3AED", hint: "Fit confirmed — meaningful volume, budget, identified buyer.",        nextAction: "Send a tailored intro email + capability deck.",                         aging: 5  },
  { id: "contacted",   label: "Contacted",   base: "#0891B2", hint: "Initial outreach sent (email · LinkedIn · referral · cold call).",   nextAction: "Follow up in 3 days · book a discovery call.",                           aging: 7  },
  { id: "discovery",   label: "Discovery",   base: "#0D9488", hint: "First meeting / call held — volume, dates, requirements assessed.",   nextAction: "Draft a proposal: room mix, monthly rate, payment terms.",               aging: 10 },
  { id: "proposal",    label: "Proposal",    base: "#D97706", hint: "RFP / rate proposal issued. Awaiting their decision.",               nextAction: "Follow up · clarify questions · push for a verbal yes.",                 aging: 14 },
  { id: "negotiation", label: "Negotiation", base: "#EA580C", hint: "Terms, rates, or inclusions in active back-and-forth.",              nextAction: "Lock the spread · agree start date · prepare contract for signature.",   aging: 14 },
  { id: "won",         label: "Won",         base: "#16A34A", hint: "Contract signed. Move to active corporate accounts.",                nextAction: "Hand off to operations · onboard the booker · monitor first 30 days.",   aging: null, closed: true },
  { id: "lost",        label: "Lost",        base: "#DC2626", hint: "Declined, lost to competitor, or gone cold.",                        nextAction: "Note the reason · revisit at next renewal cycle.",                       aging: null, closed: true },
];

export const PROSPECT_STATUSES_AGENT = [
  { id: "identified",  label: "Identified",  base: "#2563EB", hint: "Captured from web research. Specialty + market not yet confirmed.",   nextAction: "Qualify: confirm market focus, monthly volume, payment health.",         aging: 5  },
  { id: "qualified",   label: "Qualified",   base: "#7C3AED", hint: "Fit confirmed — relevant market, healthy production potential.",      nextAction: "Send agency intro pack + commission framework.",                         aging: 5  },
  { id: "contacted",   label: "Contacted",   base: "#0891B2", hint: "Initial outreach sent — intro email · trade show · referral.",        nextAction: "Follow up · share preliminary rate sheet.",                              aging: 7  },
  { id: "rate-sheet",  label: "Rate sheet",  base: "#0D9488", hint: "Net rates / commission structure shared. Agent is reviewing.",         nextAction: "Invite for a FAM trip or site inspection.",                              aging: 14 },
  { id: "fam-visit",   label: "FAM visit",   base: "#D97706", hint: "Familiarisation trip or site inspection completed.",                  nextAction: "Send contract draft · schedule signing.",                                aging: 14 },
  { id: "contracted",  label: "Contracted",  base: "#EA580C", hint: "Agreement signed. Awaiting first production.",                        nextAction: "Hand off to reservations · share booking template · activate code.",     aging: 30 },
  { id: "producing",   label: "Producing",   base: "#16A34A", hint: "Sending bookings actively. Move to active agencies.",                 nextAction: "Monitor pace · review commissions monthly · upsell into MICE.",          aging: null, closed: true },
  { id: "lost",        label: "Lost",        base: "#DC2626", hint: "Disengaged, partnered with competitor, or stopped producing.",        nextAction: "Note the reason · keep the door open for next season.",                  aging: null, closed: true },
];

// Backwards-compatible unified lookup for places that don't care about kind
// (toast labels, generic chip rendering). Includes every stage from both
// catalogues, deduped by id; corporate flavour wins on shared ids since it
// covers the broader vocabulary.
export const PROSPECT_STATUSES = (() => {
  const byId = new Map();
  [...PROSPECT_STATUSES_CORPORATE, ...PROSPECT_STATUSES_AGENT].forEach((s) => {
    if (!byId.has(s.id)) byId.set(s.id, s);
  });
  return Array.from(byId.values());
})();

// Pick the right stage catalogue for a given prospect kind.
export const getProspectStages = (kind) =>
  kind === "agent" ? PROSPECT_STATUSES_AGENT : PROSPECT_STATUSES_CORPORATE;

// The "win" stage is named differently per kind — corporate prospects close
// as "won", agent prospects close as "producing". Used by the convert flow
// in CorporateTab / AgentTab so the funnel reads correctly afterwards.
export const winStageForKind = (kind) => (kind === "agent" ? "producing" : "won");

const SAMPLE_PROSPECTS = [
  // Corporate prospects — illustrate every stage of the new corporate funnel
  {
    id: "PROS-1001", kind: "corporate", name: "Bahrain Islamic Bank",
    region: "bahrain", city: "Manama", industry: "Banking & Finance",
    contactName: "Aisha Al-Mahmood", contactEmail: "procurement@bisb.com.bh", contactPhone: "+973 1751 5151",
    website: "https://www.bisb.com.bh",
    source: "Google · banks Manama head office",
    status: "contacted", nextActionAt: "2026-05-12",
    notes: "Procurement team mentioned annual training programme — 80–120 nights Q3.",
    capturedAt: "2026-04-22", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-1002", kind: "corporate", name: "ALBA Aluminium",
    region: "bahrain", city: "Askar", industry: "Manufacturing",
    contactName: "Hisham Al-Mahroos", contactEmail: "h.almahroos@alba.com.bh", contactPhone: "",
    website: "https://www.albasmelter.com",
    source: "LinkedIn · Procurement Manager",
    status: "discovery", nextActionAt: "2026-05-08",
    notes: "Already an active RFP-7821. This prospect record is the source.",
    capturedAt: "2026-04-15", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-1003", kind: "corporate", name: "Saudi Aramco · Bahrain Office",
    region: "bahrain", city: "Manama", industry: "Oil & Gas",
    contactName: "Faisal Al-Otaibi", contactEmail: "", contactPhone: "",
    website: "https://www.aramco.com",
    source: "Google · Aramco Bahrain liaison office",
    status: "qualified", nextActionAt: "2026-05-10",
    notes: "Liaison office runs short-stay rotations for Dhahran HQ visitors. High potential.",
    capturedAt: "2026-05-02", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-1004", kind: "corporate", name: "Kuwait Petroleum International",
    region: "kuwait", city: "Kuwait City", industry: "Oil & Gas",
    contactName: "", contactEmail: "", contactPhone: "",
    website: "https://www.kpi.com",
    source: "LinkedIn search · 'KPI procurement'",
    status: "identified", nextActionAt: "",
    notes: "Cold lead. Need warm intro through Bapco contact.",
    capturedAt: "2026-05-03", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-1005", kind: "corporate", name: "Investcorp Air",
    region: "bahrain", city: "Manama", industry: "Investment",
    contactName: "Yara Al-Khalifa", contactEmail: "y.alkhalifa@investcorp.com", contactPhone: "+973 1751 9999",
    website: "https://www.investcorp.com",
    source: "Existing partner referral",
    status: "proposal", nextActionAt: "2026-05-07",
    notes: "Proposal sent 2026-04-30. Annual private-aviation crew layovers — 240 nights.",
    capturedAt: "2026-04-18", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-1006", kind: "corporate", name: "Tamkeen Bahrain",
    region: "bahrain", city: "Manama", industry: "Government",
    contactName: "Noura Al-Doseri", contactEmail: "noura@tamkeen.bh", contactPhone: "",
    website: "https://www.tamkeen.bh",
    source: "Industry conference",
    status: "negotiation", nextActionAt: "2026-05-06",
    notes: "Closing on monthly long-stay corporate housing. Final sticking point: cancellation terms.",
    capturedAt: "2026-04-10", capturedBy: "Khalid Mansoor",
  },
  // Agent prospects — illustrate every stage of the new agent funnel
  {
    id: "PROS-2001", kind: "agent", name: "Al-Tayyar Travel Group",
    region: "saudi", city: "Riyadh", industry: "Outbound · Saudi",
    contactName: "Mohammed Al-Qahtani", contactEmail: "b2b@altayyar.travel", contactPhone: "+966 11 211 0000",
    website: "https://www.altayyar.travel",
    source: "Google · top travel agencies Riyadh",
    status: "contacted", nextActionAt: "2026-05-11",
    notes: "Big Saudi outbound to Bahrain market — 200+ rooms/month potential.",
    capturedAt: "2026-04-20", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-2002", kind: "agent", name: "dnata Travel · UAE",
    region: "uae", city: "Dubai", industry: "Wholesale / Bedbank",
    contactName: "", contactEmail: "contracting@dnata.com", contactPhone: "",
    website: "https://www.dnatatravel.com",
    source: "Google · GCC wholesale travel agencies",
    status: "identified", nextActionAt: "",
    notes: "Approach via Hotelbeds connection.",
    capturedAt: "2026-05-01", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-2003", kind: "agent", name: "MakeMyTrip · India",
    region: "international", city: "Gurugram", industry: "OTA Reseller",
    contactName: "Priya Nair", contactEmail: "hotelpartners@makemytrip.com", contactPhone: "",
    website: "https://www.makemytrip.com",
    source: "Industry contact",
    status: "rate-sheet", nextActionAt: "2026-05-14",
    notes: "Strong inbound pipeline from Indian leisure travellers. Net rate sheet shared 2026-04-29.",
    capturedAt: "2026-04-28", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-2004", kind: "agent", name: "Reem Travel · Bahrain",
    region: "bahrain", city: "Manama", industry: "Inbound · GCC",
    contactName: "Reem Al-Sabah", contactEmail: "", contactPhone: "",
    website: "",
    source: "Walk-in inquiry",
    status: "fam-visit", nextActionAt: "2026-05-09",
    notes: "FAM trip completed 2026-05-02. Sending draft contract this week.",
    capturedAt: "2026-04-25", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-2005", kind: "agent", name: "Cleartrip · Saudi Desk",
    region: "saudi", city: "Riyadh", industry: "OTA Reseller",
    contactName: "Hassan Al-Saeed", contactEmail: "h.alsaeed@cleartrip.com", contactPhone: "",
    website: "https://www.cleartrip.com",
    source: "Existing UAE relationship",
    status: "qualified", nextActionAt: "2026-05-10",
    notes: "Saudi-market expansion. Existing Bahrain UAE desk produces 60 rooms/month.",
    capturedAt: "2026-04-22", capturedBy: "Khalid Mansoor",
  },
  {
    id: "PROS-2006", kind: "agent", name: "Holidays at TBO",
    region: "international", city: "Mumbai", industry: "Wholesale / Bedbank",
    contactName: "Rohit Iyer", contactEmail: "contracting@tbo.com", contactPhone: "+91 22 6126 8000",
    website: "https://www.tbo.com",
    source: "WTM London 2026",
    status: "contracted", nextActionAt: "2026-05-15",
    notes: "Contract signed 2026-04-30. Awaiting first booking. Send onboarding pack.",
    capturedAt: "2026-03-12", capturedBy: "Khalid Mansoor",
  },
];


export const ACTIVITY_STATUSES = [
  { id: "scheduled", label: "Scheduled", color: "#2563EB", hint: "Future-dated; will fire on the scheduled date." },
  { id: "completed", label: "Completed", color: "#16A34A", hint: "Done. Capture the outcome and minutes." },
  { id: "cancelled", label: "Cancelled", color: "#64748B", hint: "Skipped or rescheduled — no longer counted." },
  { id: "overdue",   label: "Overdue",   color: "#DC2626", hint: "Past its scheduled date and not yet completed.", derived: true },
];

export const ACTIVITY_OUTCOMES = [
  { id: "positive", label: "Positive", color: "#16A34A", hint: "Encouraging — moved the deal forward." },
  { id: "neutral",  label: "Neutral",  color: "#64748B", hint: "No change — still need a decision." },
  { id: "negative", label: "Negative", color: "#DC2626", hint: "Setback — risk of losing the account." },
];


const SAMPLE_ACTIVITIES = [
  // ─ Corporate accounts (active agreements) ─────────────────────────────
  {
    id: "ACT-1001", kind: "visit",
    accountKind: "corporate", accountId: "AGR-2026-001", accountName: "BAPCO",
    subject: "Quarterly business review · BAPCO HQ", contactName: "Yusuf Al-Khalifa",
    location: "BAPCO HQ, Awali", scheduledAt: "2026-05-06T10:00:00", durationMin: 90,
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-05-01T09:30:00",
  },
  {
    id: "ACT-1002", kind: "call",
    accountKind: "corporate", accountId: "AGR-2026-002", accountName: "GFH Financial Group",
    subject: "Follow-up on contract renewal", contactName: "Nadia Al-Sabah",
    scheduledAt: "2026-05-02T14:00:00", completedAt: "2026-05-02T14:35:00", durationMin: 35,
    summary: "Spoke with Nadia about the 2026–27 renewal. They confirmed continued volume of ~480 nights/year and agreed in principle to a 3% rate uplift in exchange for guaranteed last-room availability. She'll loop in legal for the contract refresh by mid-May.",
    outcome: "positive", nextAction: "Draft renewal contract with last-room availability clause.", nextActionAt: "2026-05-09",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "completed", createdAt: "2026-05-02T13:55:00",
  },
  {
    id: "ACT-1003", kind: "email",
    accountKind: "corporate", accountId: "AGR-2026-001", accountName: "BAPCO",
    subject: "Revised pricing proposal · sent",
    scheduledAt: "2026-05-03T11:15:00", completedAt: "2026-05-03T11:15:00",
    summary: "Sent revised pricing email with two scenarios — flat monthly retainer vs. per-night with 12% volume discount. Attachments: BAPCO_Pricing_2026.pdf.",
    outcome: "neutral", nextAction: "Follow up by phone if no reply by Tue.",  nextActionAt: "2026-05-06",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "completed", createdAt: "2026-05-03T11:10:00",
  },
  {
    id: "ACT-1004", kind: "task",
    accountKind: "corporate", accountId: "AGR-2026-003", accountName: "Investcorp Air",
    subject: "Send crew-rate proposal",
    scheduledAt: "2026-05-05T17:00:00",
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-05-01T15:20:00",
  },
  {
    id: "ACT-1005", kind: "meeting",
    accountKind: "corporate", accountId: "AGR-2026-004", accountName: "Ministry of Interior",
    subject: "Annual contract review meeting", contactName: "Lt. Ahmed Al-Doseri",
    location: "MOI Procurement Office, Manama", scheduledAt: "2026-05-12T11:00:00", durationMin: 60,
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-002", ownerName: "Rahul Sharma",
    status: "scheduled", createdAt: "2026-04-25T10:00:00",
  },
  {
    id: "ACT-1006", kind: "note",
    accountKind: "corporate", accountId: "AGR-2026-001", accountName: "BAPCO",
    subject: "Procurement decision delayed",
    completedAt: "2026-05-04T08:30:00",
    summary: "Procurement panel postponed from May 10 to May 17 due to internal restructuring. No impact on existing volume but contract refresh shifts by a week.",
    outcome: "neutral", nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "completed", createdAt: "2026-05-04T08:30:00",
  },

  // ─ Travel agents ──────────────────────────────────────────────────────
  {
    id: "ACT-2001", kind: "meeting",
    accountKind: "agent", accountId: "AGT-0124", accountName: "Globepass Travel",
    subject: "Q3 production review", contactName: "Mariam Al-Saadi",
    location: "Lodge Suites · Manama", scheduledAt: "2026-05-07T11:00:00", durationMin: 75,
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-04-30T14:15:00",
  },
  {
    id: "ACT-2002", kind: "visit",
    accountKind: "agent", accountId: "AGT-0287", accountName: "Almosafer Wholesale",
    subject: "FAM-trip debrief & rate-sheet review", contactName: "Faisal Al-Saedi",
    location: "Almosafer office · Riyadh", scheduledAt: "2026-04-30T13:00:00", completedAt: "2026-04-30T15:30:00", durationMin: 150,
    summary: "Walked through the 2026 rate sheet in person. They're willing to push monthly volume from 60 → 100 nights if we extend the bedbank window from 14d → 30d on long-stays. Agreed to test for May/June; we'll re-rate the impact at end of June.",
    outcome: "positive", nextAction: "Update rate-sheet allotment calendar; share with Almosafer.", nextActionAt: "2026-05-08",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "completed", createdAt: "2026-04-29T10:00:00",
  },
  {
    id: "ACT-2003", kind: "call",
    accountKind: "agent", accountId: "AGT-0211", accountName: "Cleartrip Bahrain",
    subject: "Discuss commission slabs for high-season",
    scheduledAt: "2026-05-08T15:00:00", durationMin: 30,
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-05-02T11:00:00",
  },
  {
    id: "ACT-2004", kind: "task",
    accountKind: "agent", accountId: "AGT-0124", accountName: "Globepass Travel",
    subject: "Send updated cancellation policy doc",
    scheduledAt: "2026-05-04T17:00:00",
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-04-29T16:00:00",
  },
  {
    id: "ACT-2005", kind: "note",
    accountKind: "agent", accountId: "AGT-0287", accountName: "Almosafer Wholesale",
    subject: "Minutes · FAM-trip debrief",
    completedAt: "2026-04-30T16:00:00",
    summary: "Attendees: Faisal Al-Saedi (Almosafer · Contracting), Khalid Mansoor (Lodge Suites · B2B Sales).\n\nKey points:\n• Existing production: 60 nights/month average across Q1.\n• Pain point: 14-day bedbank window limits long-stay packaging.\n• Agreed pilot: extend bedbank window to 30d for May–June.\n• Target: 100 nights/month by end of Q2.\n• Re-rate decision at June-end based on production.\n\nNo open commercial issues. Relationship is healthy.",
    outcome: "positive", nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "completed", createdAt: "2026-04-30T16:00:00",
  },

  // ─ Prospect accounts ──────────────────────────────────────────────────
  {
    id: "ACT-3001", kind: "task",
    accountKind: "prospect", accountId: "PROS-1003", accountName: "Saudi Aramco · Bahrain Office",
    subject: "Send introduction deck",
    scheduledAt: "2026-05-03T09:00:00",
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-05-02T17:30:00",
  },
  {
    id: "ACT-3002", kind: "call",
    accountKind: "prospect", accountId: "PROS-1001", accountName: "Bahrain Islamic Bank",
    subject: "Initial discovery call", contactName: "Aisha Al-Mahmood",
    scheduledAt: "2026-05-12T10:00:00", durationMin: 45,
    summary: "", outcome: null, nextAction: "",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "scheduled", createdAt: "2026-05-02T14:00:00",
  },
  {
    id: "ACT-3003", kind: "meeting",
    accountKind: "prospect", accountId: "PROS-2003", accountName: "MakeMyTrip · India",
    subject: "Initial product walk-through", contactName: "Priya Nair",
    location: "Video call (Zoom)", scheduledAt: "2026-04-30T08:00:00", completedAt: "2026-04-30T08:50:00", durationMin: 50,
    summary: "Walked Priya through suite types, pricing tiers, commission structure and our existing Indian-market production. She's interested in piloting Bahrain alongside their Doha/Dubai inventory. Wants to start with 20 nights/month commitment.",
    outcome: "positive", nextAction: "Send draft commercial agreement.", nextActionAt: "2026-05-08",
    ownerId: "ADM-006", ownerName: "Khalid Mansoor",
    status: "completed", createdAt: "2026-04-29T13:00:00",
  },
];

// ─── Room units (individual suites) ──────────────────────────────────────
// Canonical list of every physical suite in the building (72 total). Each
// unit references one room TYPE (studio / one-bed / two-bed / three-bed)
// plus its own floor, view, status, accessibility flags and free notes.
//
// Other sections — Maintenance jobs, Bookings, Calendar overrides — reference
// units by `id` (e.g. "RM-304") so renaming a room number cascades safely.
//
// Status:
//   active        — bookable
//   out-of-order  — in maintenance, not bookable
//   reserved      — held back (owner unit, long-stay lease, blocked)

export const ROOM_UNIT_STATUSES = [
  { id: "active",       label: "Active",       color: "#16A34A", hint: "Bookable. Available for guests and channels." },
  { id: "out-of-order", label: "Out of order", color: "#DC2626", hint: "In maintenance. Removed from bookable inventory." },
  { id: "reserved",     label: "Reserved",     color: "#D97706", hint: "Held back — owner unit, long-stay lease, or block." },
];

// ─── Sellable-inventory helpers ──────────────────────────────────────────
// Two functions every "is there room left to book?" check should call:
//
//   countPhysicalUnits(roomTypeId, roomUnits)
//     → number of active+reserved units of that type (excludes
//       out-of-order). This is the absolute physical ceiling.
//
//   effectiveSellLimit(room, roomUnits)
//     → master sellable cap for the type. Honours the admin-managed
//       `room.sellLimit` override; falls back to the physical count
//       when nothing has been set.
//
// Hotels routinely hold inventory back from public sale (corporate
// allocation, walk-in stock, owner blocks) and occasionally release
// MORE than physical (controlled overbooking for last-minute resells).
// sellLimit covers both cases without touching the room_units table.
export function countPhysicalUnits(roomTypeId, roomUnits) {
  if (!roomTypeId || !Array.isArray(roomUnits)) return 0;
  return roomUnits.filter(
    (u) => u && u.roomTypeId === roomTypeId && u.status !== "out-of-order"
  ).length;
}

export function effectiveSellLimit(room, roomUnits) {
  const physical = countPhysicalUnits(room?.id, roomUnits || []);
  if (!room) return physical;
  const raw = room.sellLimit;
  if (raw === null || raw === undefined || raw === "") return physical;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return physical;
  return Math.floor(n);
}

// Inventory check used by the new-booking flows. Walks every night in
// [checkIn, checkOut) and counts how many existing bookings overlap that
// night for the chosen room type — anything in cancelled / rejected /
// sold-out (i.e. inventory-releasing statuses) is excluded. Returns
// false when ANY night is at-or-over the effective sell limit, so the
// caller can default the new booking to "on-request" instead of
// "confirmed" without having to redo the date-math itself.
//
// `quantity` is the number of identical suites the prospective guest
// wants to book (typically 1; group bookings can pass higher).
export function roomTypeAvailable(roomId, checkIn, checkOut, qty, { rooms, bookings, roomUnits }) {
  if (!roomId || !checkIn || !checkOut) return true;
  const room = (rooms || []).find((r) => r.id === roomId);
  if (!room) return true;
  const cap = effectiveSellLimit(room, roomUnits || []);
  if (cap <= 0) return false;
  const need = Math.max(1, Number(qty) || 1);
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  if (!(ci instanceof Date) || isNaN(ci) || isNaN(co) || co <= ci) return true;
  // Statuses that DO hold inventory — anything else releases the night.
  const HOLDS_INVENTORY = new Set(["confirmed", "in-house", "on-request", "checked-out"]);
  const relevant = (bookings || []).filter(
    (b) => b && b.roomId === roomId && HOLDS_INVENTORY.has(b.status)
  );
  for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    let used = 0;
    for (const b of relevant) {
      if (!b.checkIn || !b.checkOut) continue;
      if (day >= b.checkIn && day < b.checkOut) used += 1;
    }
    if (used + need > cap) return false;
  }
  return true;
}

export const ROOM_VIEWS = [
  { id: "sea",     label: "Sea view" },
  { id: "city",    label: "City view" },
  { id: "pool",    label: "Pool view" },
  { id: "garden",  label: "Garden view" },
  { id: "courtyard", label: "Courtyard" },
];

// Generate the seed inventory — 72 units across 5 floors.
const SAMPLE_ROOM_UNITS = (() => {
  const out = [];
  const push = (number, roomTypeId, floor, view, extras = {}) => {
    out.push({
      id: `RM-${number}`, number, roomTypeId, floor, view,
      status: "active", accessible: false, connectingId: null,
      notes: "", ...extras,
    });
  };
  // Floor 1 · 15 units · 10 studios (101-110) + 5 one-beds (111-115)
  for (let i = 1; i <= 10; i++) push(`1${String(i).padStart(2, "0")}`, "studio",  1, i <= 5 ? "garden" : "pool");
  for (let i = 11; i <= 15; i++) push(`1${i}`,                          "one-bed", 1, "garden");
  // Floor 2 · 15 units · 10 studios + 5 one-beds
  for (let i = 1; i <= 10; i++) push(`2${String(i).padStart(2, "0")}`, "studio",  2, i <= 5 ? "garden" : "pool");
  for (let i = 11; i <= 15; i++) push(`2${i}`,                          "one-bed", 2, "city");
  // Floor 3 · 18 units · 10 studios + 8 one-beds
  for (let i = 1; i <= 10; i++) push(`3${String(i).padStart(2, "0")}`, "studio",  3, i <= 5 ? "city" : "sea");
  for (let i = 11; i <= 18; i++) push(`3${i}`,                          "one-bed", 3, i <= 14 ? "city" : "sea");
  // Floor 4 · 12 units · 6 one-beds (401-406) + 6 two-beds (411-416)
  for (let i = 1; i <= 6; i++) push(`40${i}`, "one-bed", 4, "sea");
  for (let i = 11; i <= 16; i++) push(`4${i}`, "two-bed", 4, "sea");
  // Floor 5 · 12 units · 6 two-beds (501-506) + 6 three-beds (511-516)
  for (let i = 1; i <= 6; i++) push(`50${i}`, "two-bed", 5, "sea");
  for (let i = 11; i <= 16; i++) push(`5${i}`, "three-bed", 5, "sea");

  // Sprinkle a few realistic statuses to make the dashboard interesting
  // out of the box — operator can clear these from the UI.
  const setStatus = (number, status, notes = "") => {
    const u = out.find((x) => x.number === number);
    if (u) { u.status = status; u.notes = notes; }
  };
  setStatus("304", "out-of-order", "AC capacitor replacement in progress (MNT-2026-0042).");
  setStatus("502", "out-of-order", "Water heater not heating — vendor en route (MNT-2026-0046).");
  setStatus("215", "reserved",     "Owner's family unit — never sold; cleaned monthly.");
  // Mark a couple of accessible / connecting units
  const acc = out.find((x) => x.number === "108"); if (acc) acc.accessible = true;
  const a = out.find((x) => x.number === "514"), b = out.find((x) => x.number === "515");
  if (a && b) { a.connectingId = b.id; b.connectingId = a.id; }

  return out;
})();


export const MAINTENANCE_STATUSES = [
  { id: "reported",        label: "Reported",        color: "#2563EB", hint: "Defect logged. Awaiting diagnosis." },
  { id: "diagnosed",       label: "Diagnosed",       color: "#7C3AED", hint: "Cause identified. Ready to assign a vendor." },
  { id: "vendor-assigned", label: "Vendor assigned", color: "#0891B2", hint: "Vendor briefed. Awaiting their visit." },
  { id: "in-progress",     label: "In progress",     color: "#D97706", hint: "Work underway on-site." },
  { id: "completed",       label: "Completed",       color: "#16A34A", hint: "Work finished and verified." },
  { id: "cancelled",       label: "Cancelled",       color: "#64748B", hint: "Closed without execution (false alarm, duplicate, …)." },
];

export const MAINTENANCE_PRIORITIES = [
  { id: "low",      label: "Low",      color: "#64748B", hint: "Cosmetic, can wait for the next room turn." },
  { id: "normal",   label: "Normal",   color: "#2563EB", hint: "Standard ticket, schedule within 48h." },
  { id: "high",     label: "High",     color: "#D97706", hint: "Affects guest comfort. Schedule today." },
  { id: "critical", label: "Critical", color: "#DC2626", hint: "Health, safety or revenue-blocking. Escalate now." },
];

export const MAINTENANCE_SOURCES = [
  { id: "guest-complaint", label: "Guest complaint" },
  { id: "front-desk",      label: "Front desk inspection" },
  { id: "housekeeping",    label: "Housekeeping spot" },
  { id: "preventive",      label: "Preventive schedule" },
  { id: "audit",           label: "Property audit" },
];

export const MAINTENANCE_AREAS = [
  { id: "bedroom",  label: "Bedroom" },
  { id: "living",   label: "Living area" },
  { id: "bathroom", label: "Bathroom" },
  { id: "kitchen",  label: "Kitchenette" },
  { id: "balcony",  label: "Balcony / window" },
  { id: "common",   label: "Common area / corridor" },
  { id: "exterior", label: "Building exterior" },
];

const SAMPLE_MAINTENANCE_VENDORS = [
  {
    id: "VND-001", name: "AC Care Bahrain",
    categories: ["ac", "electrical"],
    contactName: "Mohammed Al-Saedi", phone: "+973 1722 4400", email: "service@accare.bh",
    address: "Sitra Industrial Area · Building 2188", payment: "Net 30",
    rating: 4.6, totalJobs: 47, avgResponseHours: 4,
    active: true, notes: "Primary AC contractor. SLA: 4h critical, next-day standard.",
  },
  {
    id: "VND-002", name: "Manama Plumbing Solutions",
    categories: ["plumbing"],
    contactName: "Khalid Al-Haddad", phone: "+973 1731 5566", email: "ops@manamaplumbing.bh",
    address: "Al-Adliya · Road 1809", payment: "On completion",
    rating: 4.4, totalJobs: 31, avgResponseHours: 3,
    active: true, notes: "Reliable for emergency leaks. Carries common spares on-truck.",
  },
  {
    id: "VND-003", name: "Fadhel Furniture Workshop",
    categories: ["furniture"],
    contactName: "Fadhel Mahdi", phone: "+973 1733 8211", email: "fadhel@furniturebh.com",
    address: "Salmabad · Highway exit 12", payment: "Net 15",
    rating: 4.7, totalJobs: 22, avgResponseHours: 24,
    active: true, notes: "Slow but excellent finish. Great for upholstery & wardrobe repairs.",
  },
  {
    id: "VND-004", name: "Bright Spark Electrical",
    categories: ["electrical", "ac"],
    contactName: "Ravi Kumar", phone: "+973 1761 9090", email: "office@brightspark.bh",
    address: "Tubli · Road 3214", payment: "Net 30",
    rating: 4.3, totalJobs: 36, avgResponseHours: 5,
    active: true, notes: "Electrical and minor AC. Useful as backup when AC Care is busy.",
  },
  {
    id: "VND-005", name: "Royal Painters & Decorators",
    categories: ["painting"],
    contactName: "Ali Habib", phone: "+973 1789 1010", email: "bookings@royalpainters.bh",
    address: "Sanad · Road 4221", payment: "50% upfront",
    rating: 4.5, totalJobs: 14, avgResponseHours: 48,
    active: true, notes: "Prefers to batch full-room repaints during slow weeks.",
  },
  {
    id: "VND-006", name: "GCC General Maintenance",
    categories: ["other", "electrical", "plumbing", "furniture"],
    contactName: "Omar Al-Khalifa", phone: "+973 1700 1100", email: "dispatch@gccmaint.bh",
    address: "Jidhafs · Road 540", payment: "Net 30",
    rating: 4.0, totalJobs: 19, avgResponseHours: 6,
    active: true, notes: "Catch-all backup. Good for quick fixes; less polished work.",
  },
  {
    id: "VND-007", name: "PestShield Bahrain",
    categories: ["other"],
    contactName: "Dr. Mariam Al-Sabah", phone: "+973 1738 4242", email: "service@pestshield.bh",
    address: "Tubli · Building 88", payment: "Per visit",
    rating: 4.8, totalJobs: 8, avgResponseHours: 12,
    active: true, notes: "Quarterly preventive contract for cockroach & ant treatment.",
  },
];

const SAMPLE_MAINTENANCE_JOBS = [
  // Critical · in progress · AC
  {
    id: "MNT-2026-0042", title: "Suite 304 · AC not cooling",
    category: "ac", subcategory: "capacitor", priority: "critical",
    status: "in-progress",
    roomId: "studio", unitNumber: "304", area: "bedroom",
    reportedAt: "2026-05-04T07:45:00", reportedBy: "ADM-003", reportedByName: "Maryam Al-Doseri",
    source: "guest-complaint",
    description: "Guest in 304 reported AC blowing warm air at 06:50. Confirmed via thermostat — output temp 28°C while set to 21°C. Compressor running but not cooling.",
    vendorId: "VND-001", vendorName: "AC Care Bahrain", vendorContact: "Mohammed · +973 1722 4400",
    vendorAssignedAt: "2026-05-04T08:00:00",
    vendorEta: "2026-05-04T10:30:00",
    startedAt: "2026-05-04T10:25:00", completedAt: null,
    resolution: "",
    parts: [
      { id: "p1", name: "Compressor capacitor 35µF", qty: 1, unitCost: 14.500, total: 14.500 },
    ],
    laborHours: 1.5, laborRate: 12, laborCost: 18.000,
    productCost: 14.500, totalCost: 32.500,
    history: [
      { id: "h1", at: "2026-05-04T07:45:00", by: "Maryam Al-Doseri", action: "Reported by guest" },
      { id: "h2", at: "2026-05-04T07:55:00", by: "Maryam Al-Doseri", action: "Diagnosed · likely capacitor failure" },
      { id: "h3", at: "2026-05-04T08:00:00", by: "Maryam Al-Doseri", action: "Vendor assigned · AC Care Bahrain · ETA 10:30" },
      { id: "h4", at: "2026-05-04T10:25:00", by: "Mohammed Al-Saedi", action: "Started on-site work" },
    ],
    notes: "Guest moved to 308 temporarily; refund 1 night if not resolved by 14:00.",
  },
  // High · vendor-assigned · Plumbing
  {
    id: "MNT-2026-0041", title: "One-bed 412 · Bathroom sink slow drain",
    category: "plumbing", subcategory: "blockage", priority: "high",
    status: "vendor-assigned",
    roomId: "one-bed", unitNumber: "412", area: "bathroom",
    reportedAt: "2026-05-04T09:10:00", reportedBy: "ADM-003", reportedByName: "Maryam Al-Doseri",
    source: "housekeeping",
    description: "Housekeeping reported sink draining slowly during turnover. Likely hair / soap-scum buildup in trap.",
    vendorId: "VND-002", vendorName: "Manama Plumbing Solutions", vendorContact: "Khalid · +973 1731 5566",
    vendorAssignedAt: "2026-05-04T09:30:00",
    vendorEta: "2026-05-04T13:00:00",
    parts: [], laborHours: 0, laborRate: 10, laborCost: 0,
    productCost: 0, totalCost: 0,
    history: [
      { id: "h1", at: "2026-05-04T09:10:00", by: "Maryam Al-Doseri", action: "Reported by housekeeping" },
      { id: "h2", at: "2026-05-04T09:30:00", by: "Aparajeet Mathad", action: "Vendor assigned · Manama Plumbing · ETA 13:00" },
    ],
    notes: "Room is unoccupied — proceed without guest coordination.",
  },
  // Completed · AC filter (preventive)
  {
    id: "MNT-2026-0040", title: "Two-bed 215 · Quarterly AC filter change",
    category: "ac", subcategory: "filter-change", priority: "low",
    status: "completed",
    roomId: "two-bed", unitNumber: "215", area: "bedroom",
    reportedAt: "2026-05-02T08:00:00", reportedBy: "ADM-001", reportedByName: "Aparajeet Mathad",
    source: "preventive",
    description: "Scheduled 90-day preventive filter swap for both bedroom + living-area splits.",
    vendorId: "VND-001", vendorName: "AC Care Bahrain", vendorContact: "Mohammed · +973 1722 4400",
    vendorAssignedAt: "2026-05-02T08:30:00",
    vendorEta: "2026-05-02T14:00:00",
    startedAt: "2026-05-02T14:10:00", completedAt: "2026-05-02T15:25:00",
    completedBy: "Mohammed Al-Saedi",
    resolution: "Replaced 2× pleated filters (bedroom + living). Both units running clean. Next service due 2026-08-02.",
    parts: [
      { id: "p1", name: "Pleated filter 14×20×1", qty: 2, unitCost: 3.250, total: 6.500 },
    ],
    laborHours: 1.0, laborRate: 12, laborCost: 12.000,
    productCost: 6.500, totalCost: 18.500,
    nextServiceDate: "2026-08-02",
    history: [
      { id: "h1", at: "2026-05-02T08:00:00", by: "Aparajeet Mathad", action: "Created from preventive schedule" },
      { id: "h2", at: "2026-05-02T08:30:00", by: "Aparajeet Mathad", action: "Vendor assigned · AC Care Bahrain" },
      { id: "h3", at: "2026-05-02T14:10:00", by: "Mohammed Al-Saedi", action: "Started" },
      { id: "h4", at: "2026-05-02T15:25:00", by: "Mohammed Al-Saedi", action: "Completed · invoice attached" },
    ],
    notes: "",
  },
  // Reported · Furniture
  {
    id: "MNT-2026-0043", title: "Three-bed 501 · Living-room curtain rod loose",
    category: "furniture", subcategory: "curtains", priority: "normal",
    status: "reported",
    roomId: "three-bed", unitNumber: "501", area: "living",
    reportedAt: "2026-05-04T11:20:00", reportedBy: "ADM-001", reportedByName: "Aparajeet Mathad",
    source: "front-desk",
    description: "Curtain rod on left living-room window pulled out of wall mount. Curtain hanging by single bracket.",
    vendorId: null, vendorName: "", vendorContact: "",
    parts: [], laborHours: 0, laborRate: 0, laborCost: 0,
    productCost: 0, totalCost: 0,
    history: [
      { id: "h1", at: "2026-05-04T11:20:00", by: "Aparajeet Mathad", action: "Reported during inspection" },
    ],
    notes: "",
  },
  // High · in-progress · Electrical
  {
    id: "MNT-2026-0044", title: "One-bed 308 · Smart TV no signal",
    category: "electrical", subcategory: "tv", priority: "high",
    status: "in-progress",
    roomId: "one-bed", unitNumber: "308", area: "living",
    reportedAt: "2026-05-04T11:00:00", reportedBy: "ADM-003", reportedByName: "Maryam Al-Doseri",
    source: "guest-complaint",
    description: "Guest reports TV showing 'No signal'. HDMI input check failed. Likely set-top box hardware.",
    vendorId: "VND-004", vendorName: "Bright Spark Electrical", vendorContact: "Ravi · +973 1761 9090",
    vendorAssignedAt: "2026-05-04T11:30:00",
    vendorEta: "2026-05-04T15:00:00",
    startedAt: "2026-05-04T15:10:00", completedAt: null,
    parts: [], laborHours: 0, laborRate: 10, laborCost: 0,
    productCost: 0, totalCost: 0,
    history: [
      { id: "h1", at: "2026-05-04T11:00:00", by: "Maryam Al-Doseri", action: "Reported by guest" },
      { id: "h2", at: "2026-05-04T11:30:00", by: "Aparajeet Mathad", action: "Vendor assigned · Bright Spark" },
      { id: "h3", at: "2026-05-04T15:10:00", by: "Ravi Kumar", action: "Started · troubleshooting set-top box" },
    ],
    notes: "",
  },
  // Completed · Plumbing
  {
    id: "MNT-2026-0039", title: "Studio 102 · WC flush handle broken",
    category: "plumbing", subcategory: "wc", priority: "high",
    status: "completed",
    roomId: "studio", unitNumber: "102", area: "bathroom",
    reportedAt: "2026-05-01T16:30:00", reportedBy: "ADM-001", reportedByName: "Aparajeet Mathad",
    source: "guest-complaint",
    description: "Flush handle snapped off. Cistern unable to flush manually.",
    vendorId: "VND-002", vendorName: "Manama Plumbing Solutions", vendorContact: "Khalid · +973 1731 5566",
    vendorAssignedAt: "2026-05-01T16:45:00",
    vendorEta: "2026-05-01T18:00:00",
    startedAt: "2026-05-01T17:55:00", completedAt: "2026-05-01T18:30:00",
    completedBy: "Khalid Al-Haddad",
    resolution: "Replaced flush handle assembly with universal kit. Tested 5× cycles, no leaks. Cistern volume reset to 6L.",
    parts: [
      { id: "p1", name: "Flush handle universal kit", qty: 1, unitCost: 5.750, total: 5.750 },
    ],
    laborHours: 0.5, laborRate: 10, laborCost: 5.000,
    productCost: 5.750, totalCost: 10.750,
    history: [
      { id: "h1", at: "2026-05-01T16:30:00", by: "Aparajeet Mathad", action: "Reported" },
      { id: "h2", at: "2026-05-01T16:45:00", by: "Aparajeet Mathad", action: "Vendor assigned · Manama Plumbing" },
      { id: "h3", at: "2026-05-01T17:55:00", by: "Khalid Al-Haddad", action: "Started" },
      { id: "h4", at: "2026-05-01T18:30:00", by: "Khalid Al-Haddad", action: "Completed" },
    ],
    notes: "",
  },
  // Completed · Painting
  {
    id: "MNT-2026-0038", title: "Two-bed 309 · Touch-up paint after move-out",
    category: "painting", subcategory: "touch-up", priority: "low",
    status: "completed",
    roomId: "two-bed", unitNumber: "309", area: "bedroom",
    reportedAt: "2026-04-28T09:00:00", reportedBy: "ADM-001", reportedByName: "Aparajeet Mathad",
    source: "audit",
    description: "Long-stay corporate guest moved out. Wall scuff marks above bed and behind sofa.",
    vendorId: "VND-005", vendorName: "Royal Painters & Decorators", vendorContact: "Ali · +973 1789 1010",
    vendorAssignedAt: "2026-04-28T10:00:00",
    vendorEta: "2026-04-30T08:00:00",
    startedAt: "2026-04-30T08:15:00", completedAt: "2026-04-30T11:00:00",
    completedBy: "Ali Habib",
    resolution: "Touch-ups in cream-stone matt. Two coats. Room ventilated 4h, ready for sale by 16:00.",
    parts: [
      { id: "p1", name: "Cream-stone matt 1L tin", qty: 1, unitCost: 8.500, total: 8.500 },
      { id: "p2", name: "Painter's tape 25mm",     qty: 1, unitCost: 1.200, total: 1.200 },
    ],
    laborHours: 2.5, laborRate: 8, laborCost: 20.000,
    productCost: 9.700, totalCost: 29.700,
    history: [
      { id: "h1", at: "2026-04-28T09:00:00", by: "Aparajeet Mathad", action: "Created during turnover audit" },
      { id: "h2", at: "2026-04-28T10:00:00", by: "Aparajeet Mathad", action: "Vendor assigned · Royal Painters" },
      { id: "h3", at: "2026-04-30T08:15:00", by: "Ali Habib", action: "Started" },
      { id: "h4", at: "2026-04-30T11:00:00", by: "Ali Habib", action: "Completed" },
    ],
    notes: "",
  },
  // Reported · Pest control
  {
    id: "MNT-2026-0045", title: "Studio 207 · Ant trail in kitchen",
    category: "other", subcategory: "pest", priority: "normal",
    status: "reported",
    roomId: "studio", unitNumber: "207", area: "kitchen",
    reportedAt: "2026-05-04T12:30:00", reportedBy: "ADM-001", reportedByName: "Aparajeet Mathad",
    source: "guest-complaint",
    description: "Guest spotted small ant trail along kitchenette countertop. No food sources visible. Single incident report.",
    vendorId: null, vendorName: "", vendorContact: "",
    parts: [], laborHours: 0, laborRate: 0, laborCost: 0,
    productCost: 0, totalCost: 0,
    history: [
      { id: "h1", at: "2026-05-04T12:30:00", by: "Aparajeet Mathad", action: "Reported by guest" },
    ],
    notes: "Schedule PestShield visit if recurrence reported.",
  },
  // High · in-progress · Plumbing (water heater)
  {
    id: "MNT-2026-0046", title: "Three-bed 502 · Water heater no hot water",
    category: "plumbing", subcategory: "water-heater", priority: "critical",
    status: "vendor-assigned",
    roomId: "three-bed", unitNumber: "502", area: "bathroom",
    reportedAt: "2026-05-04T06:50:00", reportedBy: "ADM-003", reportedByName: "Maryam Al-Doseri",
    source: "guest-complaint",
    description: "VIP guest in 502 reports no hot water across both bathrooms since 06:30. Heater unit indicator off.",
    vendorId: "VND-002", vendorName: "Manama Plumbing Solutions", vendorContact: "Khalid · +973 1731 5566",
    vendorAssignedAt: "2026-05-04T07:00:00",
    vendorEta: "2026-05-04T08:30:00",
    parts: [], laborHours: 0, laborRate: 0, laborCost: 0,
    productCost: 0, totalCost: 0,
    history: [
      { id: "h1", at: "2026-05-04T06:50:00", by: "Maryam Al-Doseri", action: "Reported · VIP guest" },
      { id: "h2", at: "2026-05-04T07:00:00", by: "Maryam Al-Doseri", action: "Vendor assigned · Manama Plumbing · ETA 08:30" },
    ],
    notes: "VIP — escalate to GM if not resolved in 90 minutes.",
  },
  // Completed · Furniture
  {
    id: "MNT-2026-0036", title: "Two-bed 405 · Wardrobe door hinge loose",
    category: "furniture", subcategory: "wardrobe", priority: "normal",
    status: "completed",
    roomId: "two-bed", unitNumber: "405", area: "bedroom",
    reportedAt: "2026-04-25T14:00:00", reportedBy: "ADM-001", reportedByName: "Aparajeet Mathad",
    source: "housekeeping",
    description: "Master bedroom wardrobe right-door hinge pulled out of frame. Door sagging.",
    vendorId: "VND-003", vendorName: "Fadhel Furniture Workshop", vendorContact: "Fadhel · +973 1733 8211",
    vendorAssignedAt: "2026-04-25T15:00:00",
    vendorEta: "2026-04-27T10:00:00",
    startedAt: "2026-04-27T10:15:00", completedAt: "2026-04-27T11:45:00",
    completedBy: "Fadhel Mahdi",
    resolution: "Re-cut hinge plate position, installed reinforced bracket, re-mounted. Door swings true. Lifetime estimate 3y.",
    parts: [
      { id: "p1", name: "Soft-close hinge (heavy duty)", qty: 2, unitCost: 4.500, total: 9.000 },
      { id: "p2", name: "Reinforcement bracket steel",   qty: 1, unitCost: 2.250, total: 2.250 },
    ],
    laborHours: 1.5, laborRate: 9, laborCost: 13.500,
    productCost: 11.250, totalCost: 24.750,
    history: [
      { id: "h1", at: "2026-04-25T14:00:00", by: "Aparajeet Mathad", action: "Reported" },
      { id: "h2", at: "2026-04-25T15:00:00", by: "Aparajeet Mathad", action: "Vendor assigned · Fadhel Furniture" },
      { id: "h3", at: "2026-04-27T10:15:00", by: "Fadhel Mahdi", action: "Started" },
      { id: "h4", at: "2026-04-27T11:45:00", by: "Fadhel Mahdi", action: "Completed" },
    ],
    notes: "",
  },
];

// ─── Scheduled email reports ─────────────────────────────────────────────
// Cron-style schedules that generate and "send" daily/weekly/monthly email
// reports. The send pipeline is mocked client-side per CLAUDE.md — when the
// real backend lands, a worker reads this same shape and dispatches via
// SendGrid / SES / Mailjet. The store retains a per-schedule `history` log
// so the operator can see when reports last ran and what was generated.
//
// Schedule shape:
//   id, name, kind ("activities" | "revenue" | "availability"),
//   frequency ("daily" | "weekly" | "monthly"),
//   runAt (HH:MM string), weekday (0-6, weekly only), monthDay (1-31, monthly only),
//   recipients (array of emails), perSalesRep (bool — splits + sends personal copies),
//   enabled (bool), createdAt, lastRunAt, nextRunAt,
//   history: [{ id, runAt, status, recipients, kind: "scheduled" | "manual" | "test" }]
export const REPORT_KINDS = [
  { id: "activities",   label: "Sales activities",       icon: "Activity",      color: "#7C3AED",
    hint: "Visits, calls, meetings, MoMs and outstanding follow-ups by sales rep." },
  { id: "revenue",      label: "Revenue snapshot",       icon: "Coins",         color: "#16A34A",
    hint: "Room revenue, ADR, occupancy %, RevPAR + per-sales-rep contribution." },
  { id: "availability", label: "30-day availability",    icon: "CalendarRange", color: "#D97706",
    hint: "Forward-looking inventory calendar for the next 30 days." },
  { id: "maintenance",  label: "Maintenance digest",     icon: "Wrench",        color: "#0891B2",
    hint: "Spend by category, vendor & room · open critical jobs · resolution timing · top spenders." },
];

export const REPORT_FREQUENCIES = [
  { id: "daily",   label: "Daily",   hint: "Sends every day at the configured time." },
  { id: "weekly",  label: "Weekly",  hint: "Sends every chosen weekday at the configured time." },
  { id: "monthly", label: "Monthly", hint: "Sends on the chosen day of the month." },
];

const SAMPLE_REPORT_SCHEDULES = [
  {
    id: "RPT-001",
    name: "Daily sales activities briefing",
    kind: "activities", frequency: "daily", runAt: "08:00",
    recipients: ["gm@thelodgesuites.com", "fom@thelodgesuites.com", "sales@thelodgesuites.com"],
    perSalesRep: true,
    enabled: true,
    createdAt: "2026-04-15T09:00:00",
    lastRunAt: "2026-05-04T08:00:00",
    nextRunAt: "2026-05-05T08:00:00",
    history: [
      { id: "RUN-001", runAt: "2026-05-04T08:00:00", status: "sent", recipients: 3, kind: "scheduled" },
      { id: "RUN-002", runAt: "2026-05-03T08:00:00", status: "sent", recipients: 3, kind: "scheduled" },
      { id: "RUN-003", runAt: "2026-05-02T08:00:00", status: "sent", recipients: 3, kind: "scheduled" },
    ],
  },
  {
    id: "RPT-002",
    name: "Daily revenue snapshot",
    kind: "revenue", frequency: "daily", runAt: "08:30",
    recipients: ["gm@thelodgesuites.com", "accounts@thelodgesuites.com"],
    perSalesRep: true,
    enabled: true,
    createdAt: "2026-04-15T09:15:00",
    lastRunAt: "2026-05-04T08:30:00",
    nextRunAt: "2026-05-05T08:30:00",
    history: [
      { id: "RUN-101", runAt: "2026-05-04T08:30:00", status: "sent", recipients: 2, kind: "scheduled" },
      { id: "RUN-102", runAt: "2026-05-03T08:30:00", status: "sent", recipients: 2, kind: "scheduled" },
    ],
  },
  {
    id: "RPT-003",
    name: "30-day availability forecast",
    kind: "availability", frequency: "daily", runAt: "07:00",
    recipients: ["fom@thelodgesuites.com", "reservations@thelodgesuites.com"],
    perSalesRep: false,
    enabled: true,
    createdAt: "2026-04-15T09:30:00",
    lastRunAt: "2026-05-04T07:00:00",
    nextRunAt: "2026-05-05T07:00:00",
    history: [
      { id: "RUN-201", runAt: "2026-05-04T07:00:00", status: "sent", recipients: 2, kind: "scheduled" },
    ],
  },
  {
    id: "RPT-004",
    name: "Weekly maintenance digest",
    kind: "maintenance", frequency: "weekly", runAt: "07:30", weekday: 1, // Mondays
    recipients: ["gm@thelodgesuites.com", "fom@thelodgesuites.com", "maintenance@thelodgesuites.com"],
    perSalesRep: false,
    enabled: true,
    createdAt: "2026-04-20T10:00:00",
    lastRunAt: "2026-05-04T07:30:00",
    nextRunAt: "2026-05-11T07:30:00",
    history: [
      { id: "RUN-301", runAt: "2026-05-04T07:30:00", status: "sent", recipients: 3, kind: "scheduled" },
      { id: "RUN-302", runAt: "2026-04-27T07:30:00", status: "sent", recipients: 3, kind: "scheduled" },
    ],
  },
];

// ─── Staff & Access ──────────────────────────────────────────────────────
// Permission scopes. Each one corresponds to an admin sub-section the user
// can or can't enter. The list is grouped by category for the UI matrix —
// `category` is for layout only, `id` is what's stored on each user.
export const PERMISSIONS = [
  // Operations & front desk
  { id: "dashboard",       label: "Dashboard",          category: "Operations",  hint: "View KPIs and shortcuts." },
  { id: "calendar",        label: "Calendar",           category: "Operations",  hint: "View / edit availability and overrides." },
  { id: "bookings",        label: "Bookings",           category: "Operations",  hint: "View, edit and cancel reservations." },
  { id: "bookings_delete", label: "Delete bookings",    category: "Operations",  hint: "Permanently remove a booking from the database. Destructive; only grant to senior staff." },
  { id: "stopsale",        label: "Stop-Sale & OTA",    category: "Operations",  hint: "Push availability, manage channels." },
  // Inventory & rates
  { id: "rooms",        label: "Rooms & Rates",      category: "Inventory",   hint: "Edit room types, rates, photography." },
  { id: "offers",       label: "Offers & Packages",  category: "Inventory",   hint: "Run promotions and packages." },
  { id: "extras",       label: "Extras",             category: "Inventory",   hint: "Booking-modal add-ons catalogue." },
  // Maintenance / housekeeping
  { id: "maintenance",  label: "Maintenance",        category: "Operations",  hint: "Log defects, dispatch vendors, capture parts + labor cost." },
  // Sales / B2B
  { id: "corporates",   label: "Corporate Accounts", category: "Sales",       hint: "Manage corporate contracts and users." },
  { id: "agents",       label: "Travel Agents",      category: "Sales",       hint: "Manage agency contracts and users." },
  { id: "rfps",         label: "RFPs in flight",     category: "Sales",       hint: "Pipeline and conversion to contracts." },
  // Loyalty / guest
  { id: "members",      label: "LS Privilege",       category: "Guest",       hint: "View and manage loyalty members." },
  // Finance
  { id: "invoices",        label: "Invoices",           category: "Finance",     hint: "Create folios and partner invoices." },
  { id: "payments",        label: "Payments",           category: "Finance",     hint: "Receipts, refunds, settlements." },
  { id: "tax",             label: "Tax Setup",          category: "Finance",     hint: "VAT, levies, service charges." },
  { id: "card_vault_view", label: "View card on file",  category: "Finance",     hint: "Reveal full PAN of stored cards. Every reveal is recorded in the activity log." },
  // Comms
  { id: "emails",       label: "Email Templates",    category: "Comms",       hint: "Guest, partner and ops emails." },
  { id: "siteContent",  label: "Site Content (CMS)", category: "Comms",       hint: "Public marketing site copy & images." },
  // Admin (gates this very page)
  { id: "admin_users",  label: "Staff & Access",     category: "Admin",       hint: "Create staff and assign permissions." },
];

// Role templates. Picking a role auto-fills the permissions array — the
// operator can then tweak individual scopes per user.
export const ADMIN_ROLES = [
  {
    id: "owner", name: "Owner",
    color: "#7C3AED", description: "Full unrestricted access to every section.",
    permissions: PERMISSIONS.map(p => p.id),
  },
  {
    id: "gm", name: "General Manager",
    color: "#0F766E", description: "Operates the entire portal except staff & access.",
    // Excludes admin_users (gated to Owner) and bookings_delete (destructive —
    // Owner must explicitly grant it per user).
    permissions: PERMISSIONS.filter(p => p.id !== "admin_users" && p.id !== "bookings_delete").map(p => p.id),
  },
  {
    id: "fom", name: "Front Office Manager",
    color: "#2563EB", description: "Front desk + reservations + members + room operations.",
    permissions: ["dashboard", "calendar", "bookings", "stopsale", "rooms", "offers", "extras", "members", "emails", "maintenance", "card_vault_view"],
  },
  {
    id: "reservations", name: "Reservations",
    color: "#0891B2", description: "Front-of-house bookings and guest profiles.",
    permissions: ["dashboard", "calendar", "bookings", "members"],
  },
  {
    id: "housekeeping", name: "Housekeeping",
    color: "#0D9488", description: "Maintenance jobs, vendor dispatch, room status checks.",
    permissions: ["dashboard", "calendar", "rooms", "maintenance"],
  },
  {
    id: "sales", name: "Sales / B2B",
    color: "#D97706", description: "Corporate, agent and RFP pipeline ownership.",
    permissions: ["dashboard", "corporates", "agents", "rfps", "emails"],
  },
  {
    id: "accounts", name: "Accounts",
    color: "#BE123C", description: "Folios, payments, taxes and partner invoices.",
    permissions: ["dashboard", "invoices", "payments", "tax", "corporates", "agents", "card_vault_view"],
  },
  {
    id: "marketing", name: "Marketing",
    color: "#C9A961", description: "Loyalty, offers, comms and dashboard insights.",
    permissions: ["dashboard", "offers", "emails", "members"],
  },
  {
    id: "readonly", name: "Read-only",
    color: "#64748B", description: "Dashboard view only — useful for owners' family or auditors.",
    permissions: ["dashboard"],
  },
];

// ─── Navigation → permission gating ─────────────────────────────────────
// Maps every navigable section in the operator portal to the PERMISSIONS
// id that gates it. The values are either:
//   • a permission id from PERMISSIONS (the section is hidden unless the
//     session carries that id)
//   • null (the section is visible to any signed-in operator — used for
//     property-wide screens that everyone needs: Property Info, Activity
//     Log, SMTP, System Docs)
//
// The Hotel Admin sub-nav (AdminLayout) and the PartnerPortal top tabs
// both consume this map via hasPermission/hasAnyPermission below. Keep
// the map and PERMISSIONS in sync — the Owner role grants everything,
// GM grants everything except `admin_users` + `bookings_delete`, so any
// new section that lands here needs a corresponding PERMISSIONS row.

// Hotel Admin sub-sections (the dropdowns under Hotel Admin → Settings /
// Operations, plus the top-level Calendar / Rooms / Maintenance / etc.).
export const ADMIN_SECTION_PERMISSION = {
  calendar:    "calendar",
  rooms:       "rooms",
  offers:      "offers",
  maintenance: "maintenance",
  extras:      "extras",
  giftCards:   "offers",       // gift cards belong to the Offers permission
  reports:     "dashboard",
  invoices:    "invoices",
  payments:    "payments",
  messages:    "members",       // staff-to-guest chat threads
  activity:    null,            // every signed-in operator can audit themselves
  tax:         "tax",
  property:    null,            // property info edits live with everyone
  emails:      "emails",
  smtp:        null,            // outbound SMTP config — operator-wide
  siteContent: "siteContent",
  schedules:   "dashboard",
  staff:       "admin_users",   // <-- gates the Staff & Access editor (this is what was leaking to GMs)
  docs:        null,            // System docs are reference material
  stopsale:    "stopsale",
  ota:         "stopsale",      // OTA management rides on the stopsale permission
};

// PartnerPortal top tabs.
export const TOP_TAB_PERMISSION = {
  dashboard:  "dashboard",
  bookings:   "bookings",
  activities: null,             // CRM activity stream visible to anyone
  corporate:  "corporates",
  agent:      "agents",
  loyalty:    "members",
  partnerLoyalty: "corporates", // B2B loyalty config — same gate as corporate accounts
  admin:      null,             // visibility computed from sub-section perms
};

/**
 * Permission predicate. `permission` may be:
 *   • a permission id string (the session must carry it)
 *   • null (granted to any signed-in session)
 *   • undefined (granted — same as null, defensive for missing map entries)
 *
 * No session → always false (the user is anon).
 */
export function hasPermission(session, permission) {
  if (permission === null || permission === undefined) return !!session;
  if (!session) return false;
  const perms = Array.isArray(session.permissions) ? session.permissions : [];
  return perms.includes(permission);
}

/**
 * "Has at least one of these permissions". Used to decide whether the
 * Hotel Admin top tab itself should render — if EVERY sub-section is
 * gated away from this operator, the tab disappears entirely.
 */
export function hasAnyPermission(session, permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return !!session;
  return permissions.some((p) => hasPermission(session, p));
}

// Audit log catalogue — every kind we record. Each entry pushed onto
// `auditLogs` carries one of these as its `kind`, plus actor + target
// + free-form details. The Activity Log admin section reads this stream.
export const AUDIT_KINDS = [
  { id: "login",              label: "Sign-in",            color: "#16A34A" },
  { id: "logout",             label: "Sign-out",           color: "#64748B" },
  { id: "impersonate-start",  label: "Impersonation start", color: "#7C3AED" },
  { id: "impersonate-end",    label: "Impersonation end",   color: "#7C3AED" },
  { id: "password-change",    label: "Password change",    color: "#0891B2" },
  { id: "permissions-change", label: "Permissions change", color: "#D97706" },
  { id: "booking-created",    label: "Booking created",    color: "#2563EB" },
  { id: "booking-deleted",    label: "Booking deleted",    color: "#DC2626" },
  { id: "prospect-converted", label: "Prospect converted", color: "#16A34A" },
  { id: "vendor-call",        label: "Vendor dispatched",  color: "#0D9488" },
  { id: "data-export",        label: "Data export",        color: "#BE123C" },
];

// Seeded message threads — one per active customer account plus a couple
// of booking-specific threads so the messaging UI shows lived-in data
// without anyone having to send a message first. The shape mirrors what
// a future server-side messaging service would emit: each message has
// a stable id, ts, sender (kind+id+name), body, and a read flag.
//
// Threads are keyed by either:
//   booking:<bookingId>          — pinned to a specific reservation
//   account:<kind>:<accountId>   — general thread for an account/member
//
// The Messages UI groups by threadKey and lets the customer + staff
// reply to each other; the staff side sees every thread at once.
const SAMPLE_MESSAGES = [
  // BAPCO — general thread
  { id: "MSG-seed-001", threadKey: "account:corporate:AGR-2026-001", ts: "2026-05-07T09:14:00", fromType: "corporate", fromId: "AGR-2026-001", fromName: "Sara Al-Hammadi · BAPCO", body: "Hi team, can you confirm the 2026 Q3 rate for the One-Bedroom Suite for our long stays? Several engineers will need 6-week postings starting July.", read: true },
  { id: "MSG-seed-002", threadKey: "account:corporate:AGR-2026-001", ts: "2026-05-07T10:32:00", fromType: "staff", fromId: "ADM-006", fromName: "Khalid Mansoor · Sales", body: "Good morning Sara — your contract holds the negotiated daily rate of BHD 45 net for One-Bed across the year. For 6-week stays we apply the monthly net of BHD 1,080, which works out to roughly BHD 36/night. I'll email a fresh rate sheet within the hour.", read: true },
  { id: "MSG-seed-003", threadKey: "account:corporate:AGR-2026-001", ts: "2026-05-08T08:02:00", fromType: "corporate", fromId: "AGR-2026-001", fromName: "Sara Al-Hammadi · BAPCO", body: "Perfect, thank you. Also a heads-up — INV-2026-0338 will be cleared by end of day, our finance team had a backlog last week.", read: false },

  // BAPCO booking-specific (LS-B3M1Q7 · Mohammed Al-Ansari)
  { id: "MSG-seed-101", threadKey: "booking:LS-B3M1Q7", ts: "2026-04-27T15:42:00", fromType: "corporate", fromId: "AGR-2026-001", fromName: "Sara Al-Hammadi · BAPCO", body: "Mohammed will arrive on a late flight (after 23:00). Can you arrange a quiet check-in?", read: true },
  { id: "MSG-seed-102", threadKey: "booking:LS-B3M1Q7", ts: "2026-04-27T16:05:00", fromType: "staff", fromId: "ADM-001", fromName: "Aparajeet Mathad · Front Office", body: "Noted Sara — our night-shift team has been briefed. Suite 305 (Two-Bed, sea view) is ready, and a welcome amenity will be placed before he arrives.", read: true },
  { id: "MSG-seed-103", threadKey: "booking:LS-B3M1Q7", ts: "2026-05-08T07:14:00", fromType: "staff", fromId: "ADM-001", fromName: "Aparajeet Mathad · Front Office", body: "Welcome update: Mohammed is checked in. Anything specific the team should arrange this week?", read: false },

  // Globepass Travel — general thread
  { id: "MSG-seed-201", threadKey: "account:agent:AGT-0124", ts: "2026-05-06T11:00:00", fromType: "agent", fromId: "AGT-0124", fromName: "Reem Al-Mahmood · Globepass", body: "Good morning, do you have availability for a group of 8 (mixed Two-Bed + One-Bed) from 18 May to 23 May?", read: false },
  { id: "MSG-seed-202", threadKey: "account:agent:AGT-0124", ts: "2026-05-06T11:42:00", fromType: "staff", fromId: "ADM-003", fromName: "Maryam Al-Doseri · Reservations", body: "Hi Reem — yes, we can hold 2 × Two-Bed and 1 × One-Bed for those dates. I'll quote at your contracted rate (10% commission + 1% MF). Confirm by Friday and I'll formalise the block.", read: true },

  // Sarah Holloway (LS Privilege Platinum) — booking-specific
  { id: "MSG-seed-301", threadKey: "booking:LS-A8K2N4", ts: "2026-04-29T18:20:00", fromType: "member", fromId: "LS-P-D4E5F6", fromName: "Sarah Holloway", body: "I've been moved into 1207 — the city view is wonderful, thank you. Is the gym open until midnight tonight?", read: true },
  { id: "MSG-seed-302", threadKey: "booking:LS-A8K2N4", ts: "2026-04-29T18:24:00", fromType: "staff", fromId: "ADM-001", fromName: "Aparajeet Mathad · Front Office", body: "Thrilled you're enjoying it Sarah. The gym runs 24h for in-house guests, so feel free to drop by any time. Towel service is on the 2nd floor.", read: true },
];

// Seeded notifications so the bell + drawer have lived-in data on first
// load. IDs are stable so the seed survives a hot reload. Mix of staff +
// guest recipients across booking / invoice / payment kinds so each
// portal sees its slice immediately.
const SAMPLE_NOTIFICATIONS = [
  // Staff — recent activity stream
  { id: "NOTE-seed-001", ts: "2026-05-08T07:42:00", kind: "booking-checkin",  severity: "success", title: "Check-in · Sarah Holloway · LS-A8K2N4", body: "Suite one-bed · 28 Apr → 5 May. Welcome amenity placed.",    recipientType: "staff", recipientId: null, refType: "booking", refId: "LS-A8K2N4", read: false },
  { id: "NOTE-seed-002", ts: "2026-05-08T06:55:00", kind: "payment-received", severity: "success", title: "Payment received · BHD 339",                       body: "PAY-9412 · Visa · against LS-A8K2N4 · Sarah Holloway.",      recipientType: "staff", recipientId: null, refType: "payment", refId: "PAY-9412", read: false },
  { id: "NOTE-seed-003", ts: "2026-05-07T15:18:00", kind: "booking-new",      severity: "info",    title: "New booking · LS-D2T7W8",                          body: "Kenji Tanaka · 12 May → 15 May · 3n · BHD 257 · Globepass Travel · agent.", recipientType: "staff", recipientId: null, refType: "booking", refId: "LS-D2T7W8", read: false },
  { id: "NOTE-seed-004", ts: "2026-05-07T11:02:00", kind: "invoice-overdue",  severity: "danger",  title: "Invoice overdue · INV-2026-0338",                  body: "BHD 142 was due 5 May · BAPCO. Follow up.",                   recipientType: "staff", recipientId: null, refType: "invoice", refId: "INV-2026-0338", read: true },
  { id: "NOTE-seed-005", ts: "2026-05-06T19:30:00", kind: "booking-confirmed",severity: "success", title: "Booking confirmed · LS-E5V9X1",                    body: "Layla Al-Khalifa · 18 May → 25 May · Three-Bed.",            recipientType: "staff", recipientId: null, refType: "booking", refId: "LS-E5V9X1", read: true },
  { id: "NOTE-seed-006", ts: "2026-05-06T10:14:00", kind: "invoice-issued",   severity: "info",    title: "Invoice issued · INV-2026-0341",                   body: "BHD 339 · due 30 May · GFH Financial Group.",                 recipientType: "staff", recipientId: null, refType: "invoice", refId: "INV-2026-0341", read: true },
  { id: "NOTE-seed-007", ts: "2026-05-05T09:00:00", kind: "booking-cancelled",severity: "warn",    title: "Cancelled · LS-F1G2H3",                            body: "Walk-in cancellation · Studio · was confirmed.",              recipientType: "staff", recipientId: null, refType: "booking", refId: "LS-F1G2H3", read: true },

  // Corporate — visible to anyone signed in to BAPCO's portal
  { id: "NOTE-seed-101", ts: "2026-05-08T07:00:00", kind: "booking-checkin",  severity: "success", title: "Welcome to The Lodge Suites",                       body: "Mohammed Al-Ansari · LS-B3M1Q7 · checked in. Reception is available 24h on +973 1616 8146.", recipientType: "corporate", recipientId: "AGR-2026-001", refType: "booking", refId: "LS-B3M1Q7", read: false },
  { id: "NOTE-seed-102", ts: "2026-05-07T11:02:00", kind: "invoice-overdue",  severity: "danger",  title: "Reminder — invoice past due",                       body: "INV-2026-0338 · BHD 142 was due on 5 May. Please settle from your portal or contact accounts@thelodgesuites.com.", recipientType: "corporate", recipientId: "AGR-2026-001", refType: "invoice", refId: "INV-2026-0338", read: false },

  // Agent — Globepass Travel
  { id: "NOTE-seed-201", ts: "2026-05-07T15:18:00", kind: "booking-new",      severity: "info",    title: "Booking confirmed · LS-D2T7W8",                    body: "Your reservation has been logged. Kenji Tanaka · 12 May → 15 May · 3n · BHD 257.", recipientType: "agent", recipientId: "AGT-0124", refType: "booking", refId: "LS-D2T7W8", read: false },

  // Member — Sarah Holloway (Platinum)
  { id: "NOTE-seed-301", ts: "2026-05-08T07:42:00", kind: "booking-checkin",  severity: "success", title: "Welcome to The Lodge Suites",                       body: "Sarah Holloway, you're checked in. Your suite is one-bed (28 Apr → 5 May).", recipientType: "member", recipientId: "LS-P-D4E5F6", refType: "booking", refId: "LS-A8K2N4", read: false },
  { id: "NOTE-seed-302", ts: "2026-05-08T06:55:00", kind: "payment-received", severity: "success", title: "Payment received",                                 body: "PAY-9412 · BHD 339. Receipt available in your portal.",      recipientType: "member", recipientId: "LS-P-D4E5F6", refType: "payment", refId: "PAY-9412", read: true },
];

// Seeded audit trail so the Activity Log section has lived-in data.
// IPs are illustrative (Bahrain Batelco range).
const SAMPLE_AUDIT_LOGS = [
  { id: "AUD-1024", ts: "2026-05-06T08:42:00", kind: "login",              actorId: "ADM-001", actorName: "Aparajeet Mathad", actorRole: "fom",         targetKind: null,        targetId: null,           targetName: null,                                  details: "Signed in to admin portal · MFA verified",                ip: "82.114.218.45" },
  { id: "AUD-1025", ts: "2026-05-06T07:15:00", kind: "login",              actorId: "ADM-009", actorName: "Salma Al-Sayed",   actorRole: "housekeeping",targetKind: null,        targetId: null,           targetName: null,                                  details: "Signed in to admin portal · password",                    ip: "82.114.218.71" },
  { id: "AUD-1026", ts: "2026-05-06T08:30:00", kind: "login",              actorId: "ADM-010", actorName: "Anil Kumar",        actorRole: "housekeeping",targetKind: null,        targetId: null,           targetName: null,                                  details: "Signed in to admin portal · password",                    ip: "82.114.218.72" },
  { id: "AUD-1027", ts: "2026-05-06T09:14:00", kind: "vendor-call",        actorId: "ADM-001", actorName: "Aparajeet Mathad", actorRole: "fom",         targetKind: "vendor",    targetId: "VND-001",      targetName: "AC Care Bahrain",                     details: "Dispatched vendor for MNT-2026-0042 · Suite 304 · AC",     ip: "82.114.218.45" },
  { id: "AUD-1028", ts: "2026-05-06T09:20:00", kind: "booking-created",    actorId: "ADM-006", actorName: "Khalid Mansoor",    actorRole: "sales",       targetKind: "corporate", targetId: "AGR-2026-001", targetName: "BAPCO",                               details: "Created booking for Faisal Al-Otaibi · Studio · 5 nights", ip: "82.114.218.45" },
  { id: "AUD-1029", ts: "2026-05-05T16:22:00", kind: "impersonate-start",  actorId: "ADM-007", actorName: "Surender Singh",    actorRole: "owner",       targetKind: "corporate", targetId: "AGR-2026-001", targetName: "BAPCO · Sara Al-Hammadi",             details: "Started impersonation to debug a guest's failed booking",  ip: "82.114.218.50" },
  { id: "AUD-1030", ts: "2026-05-05T16:39:00", kind: "impersonate-end",    actorId: "ADM-007", actorName: "Surender Singh",    actorRole: "owner",       targetKind: "corporate", targetId: "AGR-2026-001", targetName: "BAPCO · Sara Al-Hammadi",             details: "Ended impersonation after 17 minutes · issue replicated",  ip: "82.114.218.50" },
  { id: "AUD-1031", ts: "2026-05-05T11:12:00", kind: "password-change",    actorId: "ADM-006", actorName: "Khalid Mansoor",    actorRole: "sales",       targetKind: "self",      targetId: "ADM-006",      targetName: "self",                                details: "Updated own account password",                            ip: "82.114.218.45" },
  { id: "AUD-1032", ts: "2026-05-04T14:35:00", kind: "permissions-change", actorId: "ADM-007", actorName: "Surender Singh",    actorRole: "owner",       targetKind: "staff",     targetId: "ADM-009",      targetName: "Salma Al-Sayed",                      details: "Granted Housekeeping role · 4 scopes",                    ip: "82.114.218.50" },
  { id: "AUD-1033", ts: "2026-05-04T10:02:00", kind: "prospect-converted", actorId: "ADM-006", actorName: "Khalid Mansoor",    actorRole: "sales",       targetKind: "prospect",  targetId: "PROS-1002",    targetName: "ALBA Aluminium",                      details: "Converted prospect to RFP · linked AGR-2026-007",          ip: "82.114.218.45" },
  { id: "AUD-1034", ts: "2026-05-04T08:30:00", kind: "data-export",        actorId: "ADM-004", actorName: "Hassan Al-Mahroos", actorRole: "accounts",    targetKind: "report",    targetId: "revenue-mtd",  targetName: "Monthly revenue report",              details: "Downloaded CSV · revenue MTD · 412 rows",                  ip: "82.114.218.49" },
  { id: "AUD-1035", ts: "2026-05-04T07:45:00", kind: "login",              actorId: "ADM-007", actorName: "Surender Singh",    actorRole: "owner",       targetKind: null,        targetId: null,           targetName: null,                                  details: "Signed in to admin portal · MFA verified",                ip: "82.114.218.50" },
];

// ---------------------------------------------------------------------------
// Admin Testing & Training Plan — phase catalog
// ---------------------------------------------------------------------------
// Mirrors `public/docs/admin-testing-plan.md` so the owner can assign the
// plan to a tester, track which phases they've completed, and pull
// feedback into the upgrade backlog. Treat this as the *index*; the
// markdown stays the source of truth for the step-by-step checklist
// content. When phases are added / renamed in the markdown, sync the
// labels here so the assignment UI keeps matching.
export const TESTING_PLAN_PHASES = [
  { id: 0,  label: "Pre-flight",                duration: "30 min",  scope: "Login, tab familiarisation, environment sanity." },
  { id: 1,  label: "Property & Identity Setup", duration: "45 min",  scope: "Hotel info, currency master, weekend days, banking, press." },
  { id: 2,  label: "Rooms, Rates & Inventory",  duration: "45 min",  scope: "Pricing, weekend rates, extra beds, tax patterns, 72 units." },
  { id: 3,  label: "Public Site & B2C Booking", duration: "60 min",  scope: "Booking flow, Pay-now, Pay-on-arrival + card guarantee, vault." },
  { id: 4,  label: "Partner Portal · Corporate + Agent", duration: "60 min", scope: "Contracts, signed-PDF upload, partner login, commission flow." },
  { id: 5,  label: "Loyalty Program",           duration: "30 min",  scope: "Tier benefits, member enrollment, wallet pass, points redemption." },
  { id: 6,  label: "Bookings, Invoices, Payments", duration: "75 min", scope: "Lifecycle, folio/receipt/invoice docs, refunds, manual entry." },
  { id: 7,  label: "Channel Manager, Stop-Sale, OTAs", duration: "30 min", scope: "Stop-sale, push availability/rates, OTA email composer." },
  { id: 8,  label: "Reports, Maintenance, Notifications", duration: "45 min", scope: "Revenue, tax, activities, jobs/vendors, bell drawer." },
  { id: 9,  label: "Staff & Access Control",    duration: "30 min",  scope: "Roles, permissions, card vault gating, audit log." },
  { id: 10, label: "CMS, Email Templates, Polish", duration: "30 min", scope: "Site content, gallery, email previews, presentation deck." },
  { id: "integration", label: "Integration Tests", duration: "45 min", scope: "5 end-to-end scenarios spanning multiple modules." },
];

// The free-form feedback prompts collected at sign-off. Keys are stable
// (used as JSON paths on each assignment record); labels render in the UI.
export const TESTING_PLAN_FEEDBACK_FIELDS = [
  { key: "showstoppers",        label: "Showstoppers (block go-live)",            placeholder: "Bugs that absolutely must be fixed before production." },
  { key: "highPriority",        label: "High-priority gaps",                      placeholder: "Critical for day-to-day operations but not blocking launch." },
  { key: "niceToHaves",         label: "Nice-to-haves",                           placeholder: "Improvements that would speed up your work but aren't urgent." },
  { key: "uxFriction",          label: "UX friction points",                      placeholder: "Extra clicks, confusing labels, unclear states." },
  { key: "missingReports",      label: "Missing reports / data exports",          placeholder: "Data you need to extract but can't today." },
  { key: "trainingGaps",        label: "Training material gaps",                  placeholder: "Topics this plan didn't cover that the next admin will need." },
  { key: "integrationWishlist", label: "Integration wishlist",                    placeholder: "Third-party services we should hook up (PMS, payment gateway, accounting, CRM, channel manager, SMS, e-signature, etc.)." },
  { key: "nextFocus",           label: "Recommended next iteration focus",        placeholder: "Which module / surface gets the next round of investment?" },
];

// New-assignment factory — produces a fresh assignment record with every
// phase in `pending` state and all feedback fields blank. Stamped with
// the tester / owner identity at creation time so the audit trail
// survives a tester rename.
export function makeTestingPlanAssignment({ tester, owner }) {
  const id = `TPA-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    testerId:    tester?.id    || null,
    testerName:  tester?.name  || "—",
    testerEmail: tester?.email || "—",
    assignedBy:     owner?.userId || owner?.id || null,
    assignedByName: owner?.displayName || owner?.name || "—",
    assignedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    // Snapshot the phase list at the time of assignment so an evolving
    // catalog doesn't retroactively change a tester's worksheet.
    phases: TESTING_PLAN_PHASES.map((p) => ({
      id: p.id, label: p.label, status: "pending", feedback: "", completedAt: null,
    })),
    overallFeedback: Object.fromEntries(TESTING_PLAN_FEEDBACK_FIELDS.map((f) => [f.key, ""])),
    confidence: null, // 1–5 self-reported readiness rating at sign-off
    status: "pending", // pending | in-progress | completed
  };
}

// Roll a phase patch into the parent assignment's progress + status.
// Side effect: stamps startedAt on first move from pending → in-progress,
// and completedAt when every phase is completed. Pure function — returns
// the next assignment record without touching the input.
export function applyPhasePatch(assignment, phaseId, patch) {
  if (!assignment) return assignment;
  const phases = (assignment.phases || []).map((ph) =>
    String(ph.id) === String(phaseId)
      ? {
          ...ph,
          ...patch,
          // Auto-stamp completedAt when status flips to completed.
          completedAt: patch.status === "completed"
            ? (ph.completedAt || new Date().toISOString())
            : (patch.status === "pending" ? null : ph.completedAt),
        }
      : ph
  );
  const anyDone   = phases.some((ph) => ph.status === "completed");
  const allDone   = phases.every((ph) => ph.status === "completed");
  const anyActive = phases.some((ph) => ph.status === "in-progress" || ph.status === "completed");
  const nextStatus = allDone ? "completed" : anyActive ? "in-progress" : "pending";
  return {
    ...assignment,
    phases,
    startedAt:   assignment.startedAt   || (anyActive ? new Date().toISOString() : null),
    completedAt: allDone ? (assignment.completedAt || new Date().toISOString()) : null,
    status: nextStatus,
  };
}

// ─── admin_users hydration cache (browser localStorage) ─────────────────
//
// The demo-login tile on the operator portal renders BEFORE any DB
// fetch has resolved. On a fresh browser there's nothing to render
// except the JS SAMPLE seed, which can briefly show stale names
// ("Rahul Sharma") before being replaced by the live DB rows
// ("Karunakar Shetty"). On every subsequent visit we want that flash
// gone — so after each successful fetch we cache the rows here, and
// on the next mount we use the cache as the initial state.
//
// Keep the cache small and tied to a versioned key. If the shape ever
// changes (new fields, renamed properties), bump the version suffix
// so old caches are invalidated rather than rendering with missing
// fields.
const ADMIN_USERS_CACHE_KEY = "lodge.adminUsers.v1";
const ADMIN_USERS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readAdminUsersCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_USERS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.rows)) return null;
    // Skip caches older than the TTL — guards against a long-stale
    // entry shadowing a fresh fetch when the DB has been pruned.
    if (typeof parsed.ts === "number" && Date.now() - parsed.ts > ADMIN_USERS_CACHE_TTL_MS) {
      return null;
    }
    return parsed.rows;
  } catch {
    return null;
  }
}

function writeAdminUsersCache(rows) {
  if (typeof window === "undefined") return;
  if (!Array.isArray(rows)) return;
  try {
    window.localStorage.setItem(
      ADMIN_USERS_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), rows })
    );
  } catch {
    // Quota exhausted, private mode, etc. — silently skip; the worst
    // case is the seed flashes on the next visit instead of the cache.
  }
}

// Seed staff. `password` is intentionally plaintext placeholder text — when
// wired to a real backend this becomes a hash on the server. `mfa` is a
// surface for the eventual TOTP / passkey toggle but doesn't enforce anything
// yet (per CLAUDE.md: everything is mocked).
const SAMPLE_ADMIN_USERS = [
  {
    id: "ADM-001", name: "Aparajeet Mathad", email: "fom@thelodgesuites.com", phone: "+973 3322 1100",
    title: "Front Office Manager", role: "fom",
    permissions: ADMIN_ROLES.find(r => r.id === "fom").permissions,
    status: "active", mfa: true, lastLogin: "2026-05-04T08:42:00",
    avatarColor: "#2563EB", password: "Lodge2026!", createdAt: "2024-09-15",
    notes: "Owns the front desk roster and OTA distribution.",
  },
  {
    id: "ADM-002", name: "Rahul Sharma", email: "gm@thelodgesuites.com", phone: "+973 3911 4242",
    title: "General Manager", role: "gm",
    permissions: ADMIN_ROLES.find(r => r.id === "gm").permissions,
    status: "active", mfa: true, lastLogin: "2026-05-03T19:11:00",
    avatarColor: "#0F766E", password: "GM-Manama-2026", createdAt: "2024-08-01",
    notes: "Property GM. Final approver for waivers above BHD 500.",
  },
  {
    id: "ADM-003", name: "Maryam Al-Doseri", email: "reservations@thelodgesuites.com", phone: "+973 3777 8090",
    title: "Reservations Lead", role: "reservations",
    permissions: ADMIN_ROLES.find(r => r.id === "reservations").permissions,
    status: "active", mfa: false, lastLogin: "2026-05-04T07:05:00",
    avatarColor: "#0891B2", password: "Reserve-2026", createdAt: "2025-01-20",
    notes: "Day shift reservations agent, closes ledger nightly.",
  },
  {
    id: "ADM-004", name: "Hassan Al-Mahroos", email: "accounts@thelodgesuites.com", phone: "+973 3601 2244",
    title: "Senior Accountant", role: "accounts",
    permissions: ADMIN_ROLES.find(r => r.id === "accounts").permissions,
    status: "active", mfa: true, lastLogin: "2026-05-02T16:28:00",
    avatarColor: "#BE123C", password: "Folio-Closing-99", createdAt: "2024-10-10",
    notes: "Issues partner invoices on the 1st and 15th.",
  },
  {
    id: "ADM-005", name: "Lina Al-Sabah", email: "marketing@thelodgesuites.com", phone: "+973 3499 5511",
    title: "Marketing Manager", role: "marketing",
    permissions: ADMIN_ROLES.find(r => r.id === "marketing").permissions,
    status: "active", mfa: false, lastLogin: "2026-05-04T09:32:00",
    avatarColor: "#C9A961", password: "BrandStudio-7", createdAt: "2025-03-04",
    notes: "Owns LS Privilege comms and seasonal offers.",
  },
  {
    id: "ADM-006", name: "Khalid Mansoor", email: "sales@thelodgesuites.com", phone: "+973 3812 9080",
    title: "B2B Sales Director", role: "sales",
    permissions: ADMIN_ROLES.find(r => r.id === "sales").permissions,
    status: "active", mfa: true, lastLogin: "2026-05-04T10:14:00",
    avatarColor: "#D97706", password: "Pipeline-Q2-2026", createdAt: "2024-11-22",
    notes: "BAPCO + GFH + airline crew accounts.",
  },
  {
    id: "ADM-007", name: "Surender Singh", email: "surender@exploremena.com", phone: "+973 3300 0001",
    title: "Owner", role: "owner",
    permissions: ADMIN_ROLES.find(r => r.id === "owner").permissions,
    status: "active", mfa: true, lastLogin: "2026-05-04T11:00:00",
    avatarColor: "#7C3AED", password: "Owner-Master", createdAt: "2024-06-01",
    notes: "Property owner. Full administrative override.",
  },
  {
    id: "ADM-008", name: "Yousef Al-Khalifa", email: "audit@thelodgesuites.com", phone: "+973 3700 0099",
    title: "Audit (read-only)", role: "readonly",
    permissions: ADMIN_ROLES.find(r => r.id === "readonly").permissions,
    status: "suspended", mfa: false, lastLogin: "2026-03-12T14:00:00",
    avatarColor: "#64748B", password: "Audit-2026", createdAt: "2025-06-15",
    notes: "External auditor. Reactivate during quarterly review.",
  },
  {
    id: "ADM-009", name: "Salma Al-Sayed", email: "housekeeping@thelodgesuites.com", phone: "+973 3811 5566",
    title: "Housekeeping Supervisor", role: "housekeeping",
    permissions: ADMIN_ROLES.find(r => r.id === "housekeeping").permissions,
    status: "active", mfa: false, lastLogin: "2026-05-06T07:15:00",
    avatarColor: "#0D9488", password: "Housekeeping-2026", createdAt: "2025-02-12",
    notes: "Owns daily room turnovers and dispatches maintenance jobs to vendors.",
  },
  {
    id: "ADM-010", name: "Anil Kumar", email: "maintenance@thelodgesuites.com", phone: "+973 3422 9090",
    title: "Maintenance Technician", role: "housekeeping",
    permissions: ADMIN_ROLES.find(r => r.id === "housekeeping").permissions,
    status: "active", mfa: false, lastLogin: "2026-05-06T08:30:00",
    avatarColor: "#0D9488", password: "Housekeeping-2026", createdAt: "2025-04-08",
    notes: "On-call for in-house fixes before escalating to external vendors.",
  },
  // UAT tester accounts — three dedicated logins for the admin testing &
  // training plan. Each carries the full GM permission set (everything
  // except admin_users management and bookings_delete) so testers can
  // exercise every operational surface without needing the owner to grant
  // bespoke permissions per phase. Owner can hand these credentials out
  // via the new "Assign testing plan" workflow in System Docs.
  {
    id: "ADM-UAT-1", name: "UAT Tester 1", email: "uat1@thelodgesuites.com", phone: "+973 3500 0001",
    title: "UAT Tester · Operations", role: "gm",
    permissions: ADMIN_ROLES.find(r => r.id === "gm").permissions,
    status: "active", mfa: false, lastLogin: null,
    avatarColor: "#475569", password: "Test-Lodge-2026", createdAt: "2026-05-13",
    notes: "Dedicated UAT login. Use for Phase 1-4 (Property · Rates · Public site · Partner portal).",
    isUatTester: true,
  },
  {
    id: "ADM-UAT-2", name: "UAT Tester 2", email: "uat2@thelodgesuites.com", phone: "+973 3500 0002",
    title: "UAT Tester · Finance", role: "gm",
    permissions: ADMIN_ROLES.find(r => r.id === "gm").permissions,
    status: "active", mfa: false, lastLogin: null,
    avatarColor: "#475569", password: "Test-Lodge-2026", createdAt: "2026-05-13",
    notes: "Dedicated UAT login. Use for Phase 5-7 (Loyalty · Bookings · Invoices · Channels).",
    isUatTester: true,
  },
  {
    id: "ADM-UAT-3", name: "UAT Tester 3", email: "uat3@thelodgesuites.com", phone: "+973 3500 0003",
    title: "UAT Tester · Admin", role: "gm",
    permissions: ADMIN_ROLES.find(r => r.id === "gm").permissions,
    status: "active", mfa: false, lastLogin: null,
    avatarColor: "#475569", password: "Test-Lodge-2026", createdAt: "2026-05-13",
    notes: "Dedicated UAT login. Use for Phase 8-10 + integration tests (Reports · Staff · CMS · End-to-end).",
    isUatTester: true,
  },
];

// Quick-setup presets for the most common SMTP providers. The admin's
// "Quick Setup — Popular Providers" row lets the operator click a chip
// to fill host / port / encryption in one tap; they still have to enter
// credentials manually.
export const SMTP_PROVIDER_PRESETS = [
  { id: "gmail",      label: "Gmail",       host: "smtp.gmail.com",        port: 587, encryption: "tls",
    note: "Gmail requires a 16-character App Password (Google Account → Security → App Passwords). Requires 2-Step Verification." },
  { id: "outlook",    label: "Outlook",     host: "smtp.office365.com",    port: 587, encryption: "tls",
    note: "Microsoft 365 / Outlook.com. Use OAuth or an account-specific App Password — basic auth may need to be enabled by your tenant admin." },
  { id: "yahoo",      label: "Yahoo",       host: "smtp.mail.yahoo.com",   port: 465, encryption: "ssl",
    note: "Yahoo Mail. Generate an App Password from your account security settings." },
  { id: "sendgrid",   label: "SendGrid",    host: "smtp.sendgrid.net",     port: 587, encryption: "tls",
    note: "Username is literally 'apikey'; the password is your SendGrid API key." },
  { id: "mailgun",    label: "Mailgun",     host: "smtp.mailgun.org",      port: 587, encryption: "tls",
    note: "Find SMTP credentials under Sending → Domain settings → SMTP credentials." },
  { id: "ses",        label: "Amazon SES",  host: "email-smtp.us-east-1.amazonaws.com", port: 587, encryption: "tls",
    note: "Use SES SMTP credentials (Access Key ID / Secret) — different from your AWS console password." },
  { id: "zoho",       label: "Zoho Mail",   host: "smtp.zoho.com",         port: 465, encryption: "ssl",
    note: "Zoho Mail / Zoho ZeptoMail. App-specific password recommended." },
  { id: "postmark",   label: "Postmark",    host: "smtp.postmarkapp.com",  port: 587, encryption: "tls",
    note: "Username and password are both the same Postmark Server API token." },
];

// Default SMTP configuration. Disabled by default so the demo doesn't
// attempt to deliver real mail; presets and credentials live empty until
// the operator fills them in from Settings → Email SMTP.
const DEFAULT_SMTP_CONFIG = {
  enabled: false,
  // Server
  host: "smtp.gmail.com",
  port: 587,
  encryption: "tls",       // "none" | "tls" | "ssl"
  // Authentication
  username: "",
  password: "",
  // Sender identity
  fromName: "",
  fromEmail: "",
  replyTo: "",
  // Test telemetry — populated by "Test SMTP Connection" button.
  lastTestedAt: "",
  lastTestStatus: "",      // "success" | "failed" | ""
  lastTestMessage: "",
  testEmailRecipient: "",
};

// Default property identity. Editable from the Property admin section so
// the same record drives the website footer, every printable document
// (confirmations, invoices, receipts, contracts), and any partner-portal
// header that prints a legal address line. Operators set this once when
// real CR / VAT / IBAN numbers are issued and the rest of the app picks
// them up automatically.
const DEFAULT_HOTEL_INFO = {
  name:              "The Lodge Suites",
  legal:             "The Lodge Suites W.L.L.",
  tagline:           "We Speak Your Language",
  address:           "Building 916, Road 4019, Block 340",
  area:              "Shabab Avenue, Juffair, Manama",
  country:           "Kingdom of Bahrain",
  cr:                "#####",
  vat:               "#####",
  phone:             "+973 1616 8146",
  whatsapp:          "+973 3306 9641",
  email:             "frontoffice@thelodgesuites.com",
  emailReservations: "reservations@thelodgesuites.com",
  emailAccounts:     "accounts@thelodgesuites.bh",
  emailFom:          "fom@thelodgesuites.com",
  emailSales:        "sales@exploremena.com",
  emailPress:        "press@thelodgesuites.com",
  website:           "www.thelodgesuites.com",
  // Google Maps share link (the short maps.app.goo.gl form preserves the
  // precise pin + business listing). Used by every "Open in Maps" CTA on
  // the public site — keep in sync with the hotel's actual GMB pin if it
  // ever moves.
  mapsUrl:           "https://maps.app.goo.gl/N7dGa9Zqt1Rd9Apm8",
  iban:              "BH## NBOB ##############",
  bank:              "National Bank of Bahrain",
  copyrightYear:     "2026",
  checkIn:           "14:00",
  checkOut:          "12:00",
  // Press / media spokesperson — surfaced on the public Press page and any
  // press-relations card. Edit when staff changes.
  spokespersonName:  "Aparajeet Mathad",
  spokespersonTitle: "Front Office Manager",
  // Apple Wallet pass identifiers — passTypeId is the reverse-DNS string the
  // hotel registers in the Apple Developer portal; appleTeamId is the team
  // identifier on the same account. Both are baked into every generated
  // .pkpass so the file is structurally Wallet-installable once a real
  // PKCS#7 signature is dropped in by the signing service.
  passTypeId:        "pass.com.thelodgesuites.privilege",
  appleTeamId:       "<your-team-id-once-enrolled>",
  // Cultural weekend days — drives the "weekend rate" on every room. Day-
  // of-week numbers per JavaScript's Date.getDay() convention (0 = Sunday,
  // 6 = Saturday). Bahrain and the wider GCC use Friday + Saturday;
  // operators outside the region typically pick Saturday + Sunday. Edited
  // in the Property Info admin (Weekend days card).
  weekendDays:       [5, 6],
  // Currency master — the display label and decimal precision the hotel
  // uses for every monetary value rendered across the system (booking
  // totals, invoices, contracts, the public website, exported reports).
  // BHD defaults to 3 decimals because the Bahraini Dinar is sub-divided
  // into 1,000 fils; operators on a 2-decimal currency (AED / USD / EUR)
  // simply drop the trailing digit. Edited in the Property Info admin
  // (Currency & decimals card).
  currency:          "BHD",
  currencyDecimals:  3,
  // Accepted credit-card brands — the card types this property will take for
  // booking guarantees / charges. Brand ids match CARD_BRANDS in
  // src/lib/cardValidation.js. Every card-capture surface validates the
  // entered card against this list (and rejects test/dummy numbers), so the
  // admin "finalises" which cards apply to the property by editing this in
  // Property Info → Accepted cards.
  acceptedCardBrands: ["Visa", "Mastercard", "Amex"],
};

// ---------------------------------------------------------------------------
// Card-on-file helpers
// ---------------------------------------------------------------------------
// Default-allow set of roles for backwards compatibility. The canonical
// gate is now the `card_vault_view` permission (managed in Staff & Access);
// this set kicks in only when a session record has an empty permissions
// array — typically right after a legacy staff record loads before the
// operator has touched their permission matrix.
export const CARD_VAULT_ROLES = new Set(["owner", "gm", "fom", "accounts"]);

// Permission check for revealing the full PAN of a stored card.
// Accepts either a session object (preferred — uses live permissions)
// or a bare role string (fallback for legacy callers).
//
// CARD_VAULT_ROLES is kept as a sane default so freshly-created staff
// without explicit permission edits inherit the same set we used before
// the permission system existed.
export function canViewCardOnFile(sessionOrRole) {
  if (sessionOrRole && typeof sessionOrRole === "object") {
    const perms = Array.isArray(sessionOrRole.permissions) ? sessionOrRole.permissions : [];
    if (perms.includes("card_vault_view")) return true;
    // Fall back to role for backwards compat when permissions array is empty
    return CARD_VAULT_ROLES.has(String(sessionOrRole.role || "").toLowerCase());
  }
  return CARD_VAULT_ROLES.has(String(sessionOrRole || "").toLowerCase());
}

// Returns last-4 of a card with leading dots, e.g. "•••• 4242".
// Tolerant of every shape a card reference can take:
//   • a card-on-file object  → reads .masked / .last4 / (legacy) .number
//   • a last4 / digits string → slices last 4
//   • a formatted PAN string  → strips non-digits, slices last 4
// This means callers can pass the whole card object and never have to
// know whether it's a new (last4-only) or legacy (full-number) record.
export function maskCardNumber(input) {
  if (input && typeof input === "object") {
    if (input.masked) return input.masked;
    input = input.last4 || input.number || "";
  }
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 0) return "—";
  const last4 = digits.slice(-4).padStart(4, "•");
  return `•••• ${last4}`;
}

// Approximate brand inferred from the BIN (first digit). Returns one of
// "Visa" | "Mastercard" | "Amex" | "Discover" | "Card". Mock — a real
// integration uses the gateway's response, but this is good enough for
// the visual chip on a stored card.
export function detectCardBrand(num) {
  const digits = String(num || "").replace(/\D/g, "");
  if (!digits) return "Card";
  if (/^4/.test(digits))                  return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits))    return "Mastercard";
  if (/^3[47]/.test(digits))              return "Amex";
  if (/^6/.test(digits))                  return "Discover";
  return "Card";
}

// True when the card-on-file's `expiresAt` is in the past — used to
// auto-purge stored card data after the configured window (30 days).
export function cardOnFileExpired(card) {
  if (!card || !card.expiresAt) return false;
  return new Date(card.expiresAt).getTime() < Date.now();
}

// Standard policy window. Centralised here so a future change to "10
// days" is a one-line edit rather than a global search.
export const CARD_VAULT_RETENTION_DAYS = 30;

// Base64 helpers for the stored PAN. NOTE: base64 is OBFUSCATION, not
// encryption — it keeps the number from being readable at a casual glance
// in the DB/console, but it is reversible. See the security note on
// buildCardOnFile. Browser btoa/atob are available in the app + Node 16+.
function encodePan(digits) {
  try { return typeof btoa === "function" ? btoa(digits) : Buffer.from(digits, "utf8").toString("base64"); }
  catch (_) { return ""; }
}
function decodePan(enc) {
  try { return typeof atob === "function" ? atob(enc) : Buffer.from(enc, "base64").toString("utf8"); }
  catch (_) { return ""; }
}

// Build the card-on-file record persisted onto a booking.
//
// SECURITY — read before changing. Hotels guarantee bookings by manually
// keying the card into a terminal, so by explicit operator decision this
// vault stores the FULL card number (PAN) so an authorised manager can
// reveal it to charge. Mitigations that MUST stay in place:
//   • CVV is NEVER stored (PCI prohibits retaining it post-auth — the
//     capture form doesn't even collect it). Do not add it.
//   • The PAN is held base64-obfuscated under `pan` (not plaintext) and
//     auto-purges after CARD_VAULT_RETENTION_DAYS.
//   • Reveal is gated to managers (canViewCardOnFile) and every reveal is
//     written to the audit log by the UI.
//   • last4/masked/brand remain for everyday display so the PAN is only
//     ever materialised on an explicit reveal.
// The correct long-term fix is a tokenising payment gateway (store a token,
// charge via the gateway) — swapping `pan` for a token needs no shape change.
export function buildCardOnFile({ name, number, exp }) {
  const now = new Date();
  const expires = new Date(now.getTime() + CARD_VAULT_RETENTION_DAYS * 86400000);
  const digits = String(number || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return {
    name:       String(name || "").trim(),
    last4,
    masked:     last4 ? `•••• ${last4}` : "",
    pan:        digits ? encodePan(digits) : "",   // base64-obfuscated full number
    exp:        String(exp || "").trim(),
    brand:      detectCardBrand(number),
    capturedAt: now.toISOString(),
    expiresAt:  expires.toISOString(),
  };
}

// Reveal the full card number from a card-on-file record, grouped in 4s
// (e.g. "4242 4242 4242 4242"). Returns "" when no PAN is stored (legacy
// records captured before full-PAN storage hold only last4). Callers MUST
// be permission-gated (canViewCardOnFile) and SHOULD audit-log the reveal.
export function revealCardNumber(card) {
  if (!card) return "";
  const digits = card.pan ? decodePan(card.pan).replace(/\D/g, "") : "";
  if (!digits) return "";
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

// True when a card record actually carries a recoverable full PAN (vs a
// legacy last4-only record). Lets the UI show "View full number" only when
// there's something to reveal.
export function hasFullPan(card) {
  return !!(card && card.pan && decodePan(card.pan).replace(/\D/g, "").length >= 12);
}

// ---------------------------------------------------------------------------
// Gift Cards (advance-purchase night packs)
// ---------------------------------------------------------------------------
// A "gift card" is a bulk pre-purchase of room nights at a tiered discount.
// The BUYER pays upfront at the discounted rate; the RECIPIENT gets to
// redeem the bundled nights at the contracted room type when they book.
// On redemption: the booking's room charge is offset by the prepaid nights
// (up to the card's remaining balance), the card's `nightsUsed` increments,
// and the booking record gets a giftCardCode stamp so accounting can tie
// the transaction back to the original purchase.
//
// Six preset tiers + a "custom" pathway (handled offline by sales).
// Higher tiers carry steeper discounts to reward bulk-buying behaviour
// and to drive the loyalty-tier-aligned narrative (5n ≈ Silver, 25n ≈
// Platinum). See the public Gift Vouchers page and Admin → Gift Cards.
//
// DEFAULT_GIFT_CARD_TIERS is the seed; the live admin-editable copy
// lives on `giftCardTiers` inside DataProvider. Components should
// always read tiers from `useData().giftCardTiers` so the admin's
// edits flow through immediately. The exported `GIFT_CARD_TIERS` alias
// is kept for module-level / legacy fallback callers — it's just the
// frozen default, never the live state.
export const DEFAULT_GIFT_CARD_TIERS = [
  { id: "5n",  nights:  5, discountPct:  5, label: "Silver gift",      hint: "Five nights · 5% off",      active: true },
  { id: "10n", nights: 10, discountPct:  7, label: "Gold gift",        hint: "Ten nights · 7% off",       active: true },
  { id: "15n", nights: 15, discountPct: 10, label: "Long-weekend × 3", hint: "Fifteen nights · 10% off",  active: true },
  { id: "20n", nights: 20, discountPct: 15, label: "Extended stay",    hint: "Twenty nights · 15% off",   active: true },
  { id: "25n", nights: 25, discountPct: 20, label: "Platinum gift",    hint: "Twenty-five nights · 20% off", active: true },
  { id: "30n", nights: 30, discountPct: 30, label: "A residency",      hint: "Thirty nights · 30% off",   active: true },
];
export const GIFT_CARD_TIERS = DEFAULT_GIFT_CARD_TIERS;

// 12-month default validity from purchase. The recipient can use the
// balance across any number of bookings during this window. Helpers
// below compute the expiry deterministically off the purchase date so
// edits to the constant flow through to new cards without backfilling.
export const GIFT_CARD_VALIDITY_DAYS = 365;

// Normalise a code to its canonical form. Strip whitespace, upper-case,
// and remove the LS-GC- prefix if the operator typed it in. Used by
// validation and by the booking-flow code field so a guest who pastes
// "ls-gc-ABCD" gets the same match as "ABCD".
export function normaliseGiftCardCode(raw) {
  if (!raw) return "";
  return String(raw).trim().toUpperCase().replace(/^LS-GC-/, "");
}

// Generate a friendly 8-char alphanumeric code (no ambiguous chars).
// Format: LS-GC-XXXX-XXXX. The XXXX-XXXX body is the actual identifier;
// the prefix is decorative for readability. `existing` is the live
// cards list — used to avoid collisions on the (very rare) clash.
export function generateGiftCardCode(existing = []) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // skip 0/O/1/I to avoid confusion
  const have = new Set((existing || []).map((c) => c.code));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let body = "";
    for (let i = 0; i < 8; i += 1) {
      body += alphabet[Math.floor(Math.random() * alphabet.length)];
      if (i === 3) body += "-";
    }
    const code = `LS-GC-${body}`;
    if (!have.has(code)) return code;
  }
  // 50 collisions is essentially impossible in a 32^8 space — fall back
  // to a Date-based suffix so we never throw.
  return `LS-GC-${Date.now().toString(36).toUpperCase()}`;
}

// Resolve the issue-price of a gift card from its tier + the room's
// nightly rack rate. price = nights × rate × (1 - discount/100).
// Used by the public Gift Vouchers page so the buyer sees what they'll
// pay before submitting, and by the admin section when previewing
// manual issuance.
export function computeGiftCardPrice({ nights, discountPct, ratePerNight }) {
  const n = Number(nights) || 0;
  const d = Number(discountPct) || 0;
  const r = Number(ratePerNight) || 0;
  const gross = n * r;
  const discount = gross * (d / 100);
  return {
    gross: Math.round(gross * 1000) / 1000,
    discount: Math.round(discount * 1000) / 1000,
    net: Math.round((gross - discount) * 1000) / 1000,
  };
}

// Find an active card for redemption. Returns null on miss / wrong
// status. Card is "active" ONLY when status === "issued" (admin has
// processed the buyer's payment and released the code). Any other
// status — "requested" (awaiting admin payment processing),
// "cancelled", "expired", "redeemed" — is rejected.
export function findRedeemableGiftCard(cards, code) {
  if (!code) return null;
  const want = normaliseGiftCardCode(code);
  if (!want) return null;
  return (cards || []).find((c) => {
    const carryCode = normaliseGiftCardCode(c.code);
    if (carryCode !== want) return false;
    if (c.status !== "issued") return false;
    const remaining = (c.totalNights || 0) - (c.nightsUsed || 0);
    return remaining > 0;
  }) || null;
}

// Computes how a gift card applies to a particular booking. Returns
// the redeemable night count, the savings, and a reason string when
// the card can't be applied. Pure — takes the card + the booking
// context and yields a decision object.
export function evaluateGiftCardForBooking({ card, roomId, nights, ratePerNight }) {
  if (!card) return { ok: false, reason: "No gift card" };
  if (card.roomId && card.roomId !== roomId) {
    return { ok: false, reason: `Card is for ${card.roomId} only — not the selected suite.` };
  }
  const remaining = (card.totalNights || 0) - (card.nightsUsed || 0);
  if (remaining <= 0) return { ok: false, reason: "Card has no nights remaining." };
  const redeemNights = Math.min(remaining, Number(nights) || 0);
  if (redeemNights <= 0) return { ok: false, reason: "Booking has no nights to redeem against." };
  const savings = Math.round(redeemNights * (Number(ratePerNight) || 0) * 1000) / 1000;
  const remainingAfter = remaining - redeemNights;
  return {
    ok: true,
    redeemNights,
    remainingBefore: remaining,
    remainingAfter,
    savings,
    reason: redeemNights < nights
      ? `Card covers ${redeemNights} of ${nights} nights. The remaining ${nights - redeemNights} bills at the normal rate.`
      : `Card covers all ${redeemNights} nights of this stay.`,
  };
}

// Seed cards — one issued (so admin lists aren't empty), one fully
// redeemed (so the lifecycle is visible without a fresh purchase).
// Codes are deterministic for the demo so the testing plan walkthrough
// can find them by name.
const SAMPLE_GIFT_CARDS = [
  {
    id: "GC-2026-001",
    code: "LS-GC-DEMO-AAAA",
    tierId: "5n",
    roomId: "studio",
    totalNights: 5, nightsUsed: 0,
    discountPct: 5,
    ratePerNight: 44, faceValue: 220, paidAmount: 209,
    purchaseDate: "2026-04-12",
    validUntil: "2027-04-12",
    // Recipient + sender are LS Privilege members. memberId is the
    // canonical reference; name + email are denormalised for display so
    // the admin tables don't have to join members on every render.
    recipientMemberId: "LS-G-A1B2C3",          // Layla Al-Khalifa, gold
    recipientName:    "Layla Al-Khalifa",
    recipientEmail:   "l.alkhalifa@example.com",
    senderMemberId:    "LS-P-M4N5O6",          // Mohammed Al-Ansari, platinum
    senderName:        "Mohammed Al-Ansari",
    senderEmail:       "m.ansari@example.com",
    message: "Happy anniversary — looking forward to our stays.",
    delivery: "email",
    deliverOn: "2026-04-15",
    status: "issued",
    notes: "",
  },
  {
    id: "GC-2026-002",
    code: "LS-GC-DEMO-BBBB",
    tierId: "10n",
    roomId: "one-bed",
    totalNights: 10, nightsUsed: 10,
    discountPct: 7,
    ratePerNight: 52, faceValue: 520, paidAmount: 484,
    purchaseDate: "2025-11-03",
    validUntil: "2026-11-03",
    recipientMemberId: "LS-G-J1K2L3",          // Aisha Rahimi, gold
    recipientName:    "Aisha Rahimi",
    recipientEmail:   "a.rahimi@example.com",
    senderMemberId:    "LS-P-D4E5F6",          // Sarah Holloway, platinum
    senderName:        "Sarah Holloway",
    senderEmail:       "s.holloway@example.com",
    message: "From the team — congratulations on the promotion.",
    delivery: "print",
    deliverOn: "2025-11-05",
    status: "redeemed",
    notes: "Fully redeemed across two stays in Feb–Mar 2026.",
    redemptionHistory: [
      { bookingId: "LS-GIFT-A1", redeemedAt: "2026-02-14T10:00:00", nights: 4, savings: 208 },
      { bookingId: "LS-GIFT-B2", redeemedAt: "2026-03-08T14:30:00", nights: 6, savings: 312 },
    ],
  },
];

// Composes the legal-line suffix used on every printable header — e.g.
// "CR No. 12345 · VAT No. 67890". Skips either side when the field is
// blank so a partially-completed property still renders cleanly.
export function legalLine(info) {
  if (!info) return "";
  const parts = [];
  if (info.cr)  parts.push(`CR No. ${info.cr}`);
  if (info.vat) parts.push(`VAT No. ${info.vat}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Currency formatting — single source for every monetary string in the
// system. Reads the label + decimals off `hotelInfo` so swapping the
// property from BHD to AED / USD / EUR is a one-field edit. Module-level
// callers (HTML builders, notification text, server-rendered emails) pass
// the currency in via opts; React consumers use the `useCurrencyFmt` hook.
// ---------------------------------------------------------------------------
export const DEFAULT_CURRENCY_LABEL = "BHD";
export const DEFAULT_CURRENCY_DECIMALS = 3;

// Module-level current currency — kept in sync with the live hotelInfo
// inside DataProvider via setCurrentCurrency() in a useEffect. This is
// the "ambient" currency that bare-bones helpers (HTML voucher builders,
// notification text, plaintext exports defined outside React components)
// read from, so a single admin edit reflows the entire system without
// every callsite needing the React hook. Components that want guaranteed
// re-render on change should use useCurrencyFmt() instead.
let _CURRENT_CURRENCY = { code: DEFAULT_CURRENCY_LABEL, decimals: DEFAULT_CURRENCY_DECIMALS };

// Resolves a currency tuple from whatever the caller has on hand —
// hotelInfo object, partial { currency, currencyDecimals }, or nothing.
// Always returns a complete { code, decimals } pair, falling back to the
// BHD defaults so a freshly-mounted view never renders an empty label.
export function resolveCurrency(source) {
  const code     = (source && source.currency)         || DEFAULT_CURRENCY_LABEL;
  const decimals = Number.isFinite(Number(source && source.currencyDecimals))
    ? Math.max(0, Math.min(4, Math.round(Number(source.currencyDecimals))))
    : DEFAULT_CURRENCY_DECIMALS;
  return { code, decimals };
}

// Update the module-level ambient currency. Called by DataProvider when
// hotelInfo.currency or hotelInfo.currencyDecimals changes; safe to call
// repeatedly with identical values (no-op when nothing differs).
export function setCurrentCurrency(source) {
  _CURRENT_CURRENCY = resolveCurrency(source);
}

// Read the current ambient currency — used by formatCurrency() when no
// explicit source is supplied.
export function getCurrentCurrency() {
  return _CURRENT_CURRENCY;
}

// Build a formatter that renders "<CODE> <amount>" using the supplied
// decimals. The amount uses locale-aware grouping (toLocaleString) so the
// integer part stays readable on bigger numbers ("BHD 12,345.000").
// Calling conventions:
//   formatCurrency(42)              → uses the ambient currency
//   formatCurrency(42, hotelInfo)   → reads currency + decimals from hotelInfo
//   formatCurrency(42, "USD")       → label override, ambient decimals
//   formatCurrency(42, "USD", 2)    → both label and decimals overridden
export function formatCurrency(amount, currencyOrInfo, decimalsArg) {
  let code, decimals;
  if (currencyOrInfo == null) {
    code = _CURRENT_CURRENCY.code;
    decimals = Number.isFinite(Number(decimalsArg))
      ? Math.max(0, Math.min(4, Math.round(Number(decimalsArg))))
      : _CURRENT_CURRENCY.decimals;
  } else if (typeof currencyOrInfo === "string") {
    code     = currencyOrInfo || _CURRENT_CURRENCY.code;
    decimals = Number.isFinite(Number(decimalsArg))
      ? Math.max(0, Math.min(4, Math.round(Number(decimalsArg))))
      : _CURRENT_CURRENCY.decimals;
  } else {
    const r = resolveCurrency(currencyOrInfo);
    code = r.code; decimals = r.decimals;
  }
  const n = Number(amount) || 0;
  return `${code} ${n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// React hook — returns { code, decimals, fmt } tied to the live hotelInfo
// in DataContext. Re-renders only when the user edits either field. The
// returned `fmt` accepts a number and yields the formatted string, so
// components can drop-in replace their local `fmtBhd` helpers.
export function useCurrencyFmt() {
  const { hotelInfo } = useData();
  const { code, decimals } = resolveCurrency(hotelInfo);
  const fmt = useCallback((n) => formatCurrency(n, code, decimals), [code, decimals]);
  return { code, decimals, fmt };
}

// Evaluates whether a stay selection satisfies every condition declared on
// a package. Each constraint is checked independently and the failing ones
// are returned so the booking flow can surface a precise reason — e.g.
// "Outside booking window — opens 1 Jan 2026". Returns
//   { ok: bool, failures: string[], constraints: {…} }
//
// `selection` shape:
//   { roomIds: string[], nights: number, checkIn?: ISO, today?: ISO }
//
// Notes on guest constraints: there's no offer-level min/max guests; the
// upper bound comes from each chosen suite's occupancy and is enforced by
// the existing capacity model.
export function evalPackageEligibility(pkg, selection) {
  if (!pkg) return { ok: false, failures: ["No package selected"], constraints: {} };
  const { roomIds = [], nights = 0, checkIn = "", today = "" } = selection || {};
  const failures = [];

  const allowedRooms     = Array.isArray(pkg.roomIds) ? pkg.roomIds : [];
  const minNights        = Number(pkg.minNights) || 0;
  const maxNights        = Number(pkg.maxNights) || 0;
  const bookingValidFrom = pkg.bookingValidFrom || "";
  const bookingValidTo   = pkg.bookingValidTo   || "";
  const stayValidFrom    = pkg.stayValidFrom    || "";
  const stayValidTo      = pkg.stayValidTo      || "";

  if (allowedRooms.length > 0 && roomIds.length > 0) {
    const bad = roomIds.filter((id) => !allowedRooms.includes(id));
    if (bad.length > 0) failures.push(`Suite not eligible (${bad.join(", ")})`);
  }
  if (minNights > 0 && nights > 0 && nights < minNights) {
    failures.push(`Minimum ${minNights} night${minNights === 1 ? "" : "s"} required`);
  }
  if (maxNights > 0 && nights > 0 && nights > maxNights) {
    failures.push(`Maximum ${maxNights} night${maxNights === 1 ? "" : "s"} allowed`);
  }
  // Booking window — uses `today` if supplied, otherwise the current date.
  const todayIso = today || new Date().toISOString().slice(0, 10);
  if (bookingValidFrom && todayIso < bookingValidFrom) {
    failures.push(`Booking opens ${fmtDateNice(bookingValidFrom)}`);
  }
  if (bookingValidTo && todayIso > bookingValidTo) {
    failures.push(`Booking closed on ${fmtDateNice(bookingValidTo)}`);
  }
  // Stay window — checked against the proposed check-in (and inferred
  // check-out via nights) to catch stays that straddle the bracket edges.
  if (checkIn) {
    if (stayValidFrom && checkIn < stayValidFrom) {
      failures.push(`Stay must start on or after ${fmtDateNice(stayValidFrom)}`);
    }
    if (stayValidTo) {
      const checkOutIso = nights > 0
        ? (() => { const d = new Date(checkIn); d.setDate(d.getDate() + nights); return d.toISOString().slice(0, 10); })()
        : checkIn;
      if (checkOutIso > stayValidTo) {
        failures.push(`Stay must end on or before ${fmtDateNice(stayValidTo)}`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    constraints: {
      allowedRooms, minNights, maxNights,
      bookingValidFrom, bookingValidTo,
      stayValidFrom, stayValidTo,
    },
  };
}

// Internal date formatter for eligibility messages. Kept loose so it
// gracefully degrades when given an empty / invalid ISO string.
function fmtDateNice(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// Evaluates whether a single unit of `room` (with all available extra beds
// applied) can accommodate the declared party. Returns an `{ ok, reason }`
// object so the booking pickers can disable the row AND surface the
// specific dimension that fails (total head-count, adult sub-cap, child
// sub-cap). Used consistently by:
//   • BookingModal       — public-website suite picker (step 2)
//   • BookStayTab        — customer-portal suite picker
//   • BookingCreator     — admin "Create reservation" suite dropdown
// so the same disable rule shows up everywhere.
export function roomFitsParty(room, adults = 0, children = 0) {
  if (!room) return { ok: true, reason: "" };
  const a = Number(adults)   || 0;
  const c = Number(children) || 0;
  const ebMax = Number(room.maxExtraBeds || 0);
  const ebOn  = !!room.extraBedAvailable;
  const ebA   = ebOn ? (room.extraBedAdds?.adults   || 0) * ebMax : 0;
  const ebC   = ebOn ? (room.extraBedAdds?.children || 0) * ebMax : 0;
  const adultsCap   = (room.maxAdults   ?? room.occupancy ?? 0) + ebA;
  const childrenCap = (room.maxChildren ?? room.occupancy ?? 0) + ebC;
  const totalCap    = (room.occupancy ?? 0) + ebA + ebC;
  if (totalCap    < a + c) return { ok: false, reason: `Sleeps up to ${totalCap} — too small for ${a + c}` };
  if (adultsCap   < a)     return { ok: false, reason: `Accepts up to ${adultsCap} adult${adultsCap === 1 ? "" : "s"} — you've declared ${a}` };
  if (childrenCap < c)     return { ok: false, reason: c === 1 ? `Doesn't allow children` : `Accepts up to ${childrenCap} child${childrenCap === 1 ? "" : "ren"} — you've declared ${c}` };
  return { ok: true, reason: "" };
}

// Pricing-mode catalog. Stays narrow on purpose so future modes (e.g.
// "weekend-flat" or "third-night-free") can be added without touching
// every consumer.
export const PACKAGE_PRICING_MODES = [
  { value: "per-night",   label: "Per night",                  hint: "Price × nights · best for B&B-style offers." },
  { value: "first-night", label: "First night + regular rate", hint: "First night at the offer price, additional nights at the suite rack rate." },
  { value: "flat",        label: "Flat per stay",              hint: "One fee covers the entire stay regardless of length." },
];

// Returns the per-room { price, saving } pair for a chosen suite. Falls
// back to the package-level price/saving (legacy shape) when the offer
// hasn't been migrated to the per-room matrix yet.
export function getPackageRoomPrice(pkg, roomId) {
  if (!pkg) return { price: 0, saving: 0 };
  const matrix = pkg.roomPricing && typeof pkg.roomPricing === "object" ? pkg.roomPricing : null;
  if (matrix && roomId && matrix[roomId]) {
    return {
      price:  Number(matrix[roomId].price)  || 0,
      saving: Number(matrix[roomId].saving) || 0,
    };
  }
  // Fallback for legacy single-price offers.
  return {
    price:  Number(pkg.price)  || 0,
    saving: Number(pkg.saving) || 0,
  };
}

// Returns the lowest { price, saving, roomId } across the package's per-
// room pricing matrix. Used by the homepage offer cards which surface a
// single "From BHD X" headline. Falls back to the package-level price
// when no matrix entries exist.
export function getPackageMinPrice(pkg) {
  if (!pkg) return { price: 0, saving: 0, roomId: null };
  const matrix = pkg.roomPricing && typeof pkg.roomPricing === "object" ? pkg.roomPricing : null;
  if (!matrix) {
    return {
      price:  Number(pkg.price)  || 0,
      saving: Number(pkg.saving) || 0,
      roomId: null,
    };
  }
  let bestId = null, bestPrice = Infinity, bestSaving = 0;
  for (const [id, entry] of Object.entries(matrix)) {
    const price = Number(entry?.price) || 0;
    if (price > 0 && price < bestPrice) {
      bestPrice = price; bestSaving = Number(entry.saving) || 0; bestId = id;
    }
  }
  if (bestId == null) {
    // Empty matrix — fall back.
    return { price: Number(pkg.price) || 0, saving: Number(pkg.saving) || 0, roomId: null };
  }
  return { price: bestPrice, saving: bestSaving, roomId: bestId };
}

// Per-night charge label used on offer cards and the booking summary.
// Matches the chosen pricing mode so guests don't have to do the math:
//   "BHD 79 / night", "BHD 79 (1st night)", "BHD 145 / stay".
export function packagePriceSuffix(pkg) {
  switch (pkg?.pricingMode) {
    case "first-night": return "1st night";
    case "flat":        return "/ stay";
    case "per-night":
    default:            return "/ night";
  }
}

// Computes the total package charge for a stay against a specific suite.
// `roomId` selects the per-room price from the package's pricing matrix;
// `baseRate` is the suite's rack rate, used by "first-night" mode for the
// carry-over nights. When a `roomId` isn't provided yet (e.g. step 1 of
// the booking flow before a suite is chosen), the package's lowest price
// is used so the running total stays sensible.
export function computePackageCharge(pkg, roomId, baseRate, nights) {
  if (!pkg) return 0;
  const { price } = roomId
    ? getPackageRoomPrice(pkg, roomId)
    : getPackageMinPrice(pkg);
  const n = Math.max(1, Number(nights) || 1);
  const rate = Math.max(0, Number(baseRate) || 0);
  switch (pkg.pricingMode) {
    case "first-night": return +(price + rate * Math.max(0, n - 1)).toFixed(3);
    case "flat":        return price;
    case "per-night":
    default:            return +(price * n).toFixed(3);
  }
}

// The headline saving across the whole stay (mirrors the pricing rule).
// Per-night offers save once per night; flat / first-night offers save the
// stamped saving once.
export function computePackageSaving(pkg, roomId, nights) {
  if (!pkg) return 0;
  const { saving } = roomId
    ? getPackageRoomPrice(pkg, roomId)
    : getPackageMinPrice(pkg);
  const n = Math.max(1, Number(nights) || 1);
  if (pkg.pricingMode === "per-night") return +(saving * n).toFixed(3);
  return saving;
}

// Builds a short human-readable conditions line for an offer card / preview,
// e.g. "1–3 nights · One-Bed or Two-Bed · stay by 30 Sep 2026".
export function describePackageConditions(pkg, roomLabelFor = (id) => id) {
  if (!pkg) return "";
  const parts = [];
  const {
    minNights = 0, maxNights = 0,
    roomIds = [],
    bookingValidFrom = "", bookingValidTo = "",
    stayValidFrom = "",    stayValidTo = "",
  } = pkg;
  if (minNights || maxNights) {
    if (minNights && maxNights && minNights !== maxNights) parts.push(`${minNights}–${maxNights} nights`);
    else if (minNights && maxNights && minNights === maxNights) parts.push(`${minNights} ${minNights === 1 ? "night" : "nights"}`);
    else if (minNights) parts.push(`From ${minNights} ${minNights === 1 ? "night" : "nights"}`);
    else if (maxNights) parts.push(`Up to ${maxNights} ${maxNights === 1 ? "night" : "nights"}`);
  }
  if (Array.isArray(roomIds) && roomIds.length > 0) {
    parts.push(roomIds.map(roomLabelFor).join(" or "));
  }
  // Stay window — front-of-mind for guests because it limits travel dates.
  if (stayValidFrom && stayValidTo) parts.push(`stay ${fmtDateNice(stayValidFrom)} – ${fmtDateNice(stayValidTo)}`);
  else if (stayValidFrom)           parts.push(`stay from ${fmtDateNice(stayValidFrom)}`);
  else if (stayValidTo)             parts.push(`stay by ${fmtDateNice(stayValidTo)}`);
  // Booking window — only surfaced when distinct from the stay window
  // (avoids double-printing for offers that bracket book + stay equally).
  if ((bookingValidFrom || bookingValidTo) && bookingValidFrom !== stayValidFrom && bookingValidTo !== stayValidTo) {
    if (bookingValidFrom && bookingValidTo) parts.push(`book ${fmtDateNice(bookingValidFrom)} – ${fmtDateNice(bookingValidTo)}`);
    else if (bookingValidFrom)              parts.push(`book from ${fmtDateNice(bookingValidFrom)}`);
    else if (bookingValidTo)                parts.push(`book by ${fmtDateNice(bookingValidTo)}`);
  }
  return parts.join(" · ");
}

export function DataProvider({ children }) {
  const [rooms,     setRooms]     = useState(INITIAL_ROOMS);
  // Live ref to the rooms slice so non-React-state callbacks (e.g.
  // issueGiftCard's invoice / payment description builders) can resolve
  // a current room row without having to live in any callback's dep
  // array — avoids re-creating handlers on every rooms change.
  const roomsRef = useRef(INITIAL_ROOMS);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  // Hydrate rooms from Supabase on mount when configured. The bundled
  // INITIAL_ROOMS stays as the source of truth for first paint (so the
  // homepage never flashes empty), then we replace it with whatever the
  // DB has. If the fetch fails or Supabase isn't set up, we silently keep
  // the mock data — the warning lives in src/lib/supabase.js.
  useEffect(() => {
    let cancelled = false;
    fetchRooms().then((rs) => {
      if (cancelled || !rs) return;
      setRooms(rs);
    });
    return () => { cancelled = true; };
  }, []);
  const [packages,  setPackages]  = useState(INITIAL_PACKAGES.map(p => ({ ...p, active: true })));
  const [tiers,     setTiers]     = useState(INITIAL_TIERS);
  // B2B partner loyalty — two separate tier ladders + shared points economy.
  const [corporateTiers, setCorporateTiers] = useState(INITIAL_CORPORATE_TIERS);
  const [agencyTiers,    setAgencyTiers]    = useState(INITIAL_AGENCY_TIERS);
  const [partnerLoyalty, setPartnerLoyalty] = useState(INITIAL_PARTNER_LOYALTY);
  const [tax,         setTax]         = useState(INITIAL_TAX);
  const [taxPatterns, setTaxPatterns] = useState(INITIAL_TAX_PATTERNS);
  const [activePatternId, setActivePatternId] = useState("bahrain-standard");
  const [bookings,  setBookings]  = useState(SAMPLE_BOOKINGS);
  const [invoices,  setInvoices]  = useState(SAMPLE_INVOICES);
  const [payments,  setPayments]  = useState(SAMPLE_PAYMENTS);
  const [agreements,setAgreements]= useState(SAMPLE_AGREEMENTS);
  const [agencies,  setAgencies]  = useState(SAMPLE_AGENCIES);
  const [members,   setMembers]   = useState(SAMPLE_MEMBERS);
  const [giftCards, setGiftCards] = useState(SAMPLE_GIFT_CARDS);
  // Tier master — six preset bundles (5/10/15/20/25/30 nights). Admin-
  // editable; the public Gift Vouchers page + admin Issue card flow
  // both read tier list straight off this slice, so changes here flow
  // through the whole system. Defaults to DEFAULT_GIFT_CARD_TIERS.
  const [giftCardTiers, setGiftCardTiers] = useState(DEFAULT_GIFT_CARD_TIERS);
  const updateGiftCardTiers = useCallback((next) => {
    // Normalise — ensure each tier has the required fields + sane
    // numeric bounds before persisting. Bad inputs from the editor
    // (negative numbers, blank ids) are silently clamped/dropped so
    // the public modal never crashes on malformed data.
    const cleaned = (Array.isArray(next) ? next : [])
      .filter((t) => t && t.id && t.id.trim())
      .map((t) => ({
        id:          String(t.id).trim(),
        nights:      Math.max(1, Math.min(1000, Math.round(Number(t.nights) || 0))),
        discountPct: Math.max(0, Math.min(100,  Number(t.discountPct) || 0)),
        label:       String(t.label || "").trim() || "Gift card",
        hint:        String(t.hint  || "").trim(),
        active:      t.active !== false,
      }));
    setGiftCardTiers(cleaned);
  }, []);
  const resetGiftCardTiers = useCallback(() => setGiftCardTiers(DEFAULT_GIFT_CARD_TIERS), []);
  const [extras,    setExtras]    = useState(SAMPLE_EXTRAS);
  const [calendar,  setCalendar]  = useState(INITIAL_CALENDAR_OVERRIDES);
  const [loyalty,   setLoyalty]   = useState(INITIAL_LOYALTY);
  const [emailTemplates, setEmailTemplates] = useState(SAMPLE_EMAIL_TEMPLATES);
  const [rfps,     setRfps]     = useState(SAMPLE_RFPS);
  const [channels, setChannels] = useState(SAMPLE_CHANNELS);
  // admin_users initial state — three-tier hydration to eliminate the
  // "Rahul flashes before Karunakar" effect on returning visitors:
  //
  //   1. localStorage cache from the last successful DB fetch (instant)
  //   2. JS SAMPLE_ADMIN_USERS bundled seed (testing-friendly fallback)
  //   3. Live DB fetch (authoritative — overrides 1 and 2 when it returns)
  //
  // On a brand-new browser the cache is empty, so the seed renders for
  // ~100ms while the fetch is in flight. On every subsequent visit the
  // cache is populated with the previously-confirmed DB state, so the
  // tiles render with the right names immediately. Owner edits update
  // the cache via the same fetch path the moment they commit, so the
  // cache stays fresh on its own.
  const [adminUsers, setAdminUsers] = useState(() => {
    const cached = readAdminUsersCache();
    return cached && cached.length > 0 ? cached : SAMPLE_ADMIN_USERS;
  });

  // Admin Testing & Training Plan — assignments handed out by the owner
  // for UAT / onboarding / pre-launch sign-off. Each record carries the
  // tester identity, every phase from TESTING_PLAN_PHASES with its own
  // status + feedback, and the rolled-up sign-off feedback fields. The
  // markdown at /public/docs/admin-testing-plan.md is the canonical
  // step-by-step content; this slice is the *progress + feedback ledger*.
  const [testingPlanAssignments, setTestingPlanAssignments] = useState([]);

  // Create a new assignment for a tester (typically a UAT admin user).
  // Idempotency: if an active assignment for this tester already exists
  // (pending or in-progress), we return that one rather than spawning a
  // duplicate. The owner can remove + reassign explicitly via the UI.
  //
  // `owner` is required — pass `staffSession` from the calling component.
  // We resolve it on the call site (rather than referencing staffSession
  // here directly) because the staffSession state lives further down in
  // this provider; pulling it into a useCallback that's evaluated above
  // its declaration trips the temporal-dead-zone and crashes mount.
  const assignTestingPlan = useCallback(({ testerId, owner }) => {
    const tester = adminUsers.find((u) => u.id === testerId);
    if (!tester) return null;
    let createdId = null;
    setTestingPlanAssignments((prev) => {
      const existing = prev.find((a) => a.testerId === testerId && a.status !== "completed");
      if (existing) { createdId = existing.id; return prev; }
      const rec = makeTestingPlanAssignment({ tester, owner: owner || null });
      createdId = rec.id;
      return [rec, ...prev];
    });
    return createdId;
  }, [adminUsers]);

  // Patch a single phase on an assignment (status + feedback). Wraps the
  // pure `applyPhasePatch` helper so the rollup logic stays testable.
  const updateTestingPhase = useCallback((assignmentId, phaseId, patch) => {
    setTestingPlanAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? applyPhasePatch(a, phaseId, patch) : a))
    );
  }, []);

  // Patch the overall feedback fields (free-text plus confidence rating).
  // Accepts a partial object so callers can save one field at a time.
  const updateTestingFeedback = useCallback((assignmentId, patch) => {
    setTestingPlanAssignments((prev) =>
      prev.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              overallFeedback: { ...a.overallFeedback, ...(patch.overallFeedback || {}) },
              confidence: patch.confidence != null ? patch.confidence : a.confidence,
            }
          : a
      )
    );
  }, []);

  // Hard-remove an assignment. Used by the owner to retire a stale
  // assignment when re-issuing the plan to the same tester.
  const removeTestingPlanAssignment = useCallback((assignmentId) => {
    setTestingPlanAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  }, []);
  // Audit trail + active impersonation. Both live in-memory only; in
  // production these would persist server-side and the impersonation state
  // would carry an expiry token. Helpers below append to logs idempotently
  // so callers don't have to think about ID collisions.
  const [auditLogs,    setAuditLogs]    = useState(SAMPLE_AUDIT_LOGS);
  const [impersonation, setImpersonation] = useState(null);
  // Active operator (Partner Portal) session. Set by `signInStaff` after a
  // successful credential check; cleared by `signOutStaff`. In-memory only
  // (per CLAUDE.md: no localStorage).
  const [staffSession, setStaffSession] = useState(null);
  // Real guest auth session (Phase 1/2) — derived from Supabase JWT claims via
  // sessionFromClaims, kept current by the onAuthStateChange listener below.
  // Null when the flag is off, when no guest is signed in, or when the signed-
  // in user has no portal claim (e.g. staff). GuestPortalInner adopts this so
  // a real guest session survives reload.
  const [guestAuthSession, setGuestAuthSession] = useState(null);
  // Staff-on-staff impersonation. When the Owner clicks "Login as user" against
  // an admin teammate, we stash the Owner's original session here, swap
  // `staffSession` to the target's session, and the Partner Portal banner
  // surfaces a "Stop impersonating" affordance. In-memory only.
  const [staffImpersonation, setStaffImpersonation] = useState(null);

  // Messages — two-way chat threads between customers and staff. Each
  // message carries a `threadKey` (booking-specific or account-general),
  // a sender identity (`fromType` + `fromId`), and a body. Both portals
  // read this single store, filtered by which threads the active viewer
  // can see.
  const [messages, setMessages] = useState(SAMPLE_MESSAGES);
  // Append a message to a thread. Auto-stamps id + ts; the caller is
  // responsible for `threadKey`, `fromType`, `fromId`, `fromName`, `body`.
  const addMessage = useCallback((msg) => {
    if (!msg?.threadKey || !msg?.body?.trim()) return null;
    const id = msg.id || `MSG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ts = msg.ts || new Date().toISOString();
    const record = { read: false, ...msg, id, ts };
    setMessages((ms) => [...ms, record]);
    // Per-row insert so the message persists for EVERY sender, not just
    // authenticated staff. Members / corporate bookers / agents have no
    // Supabase session, so the slice-level bulkReplace (which skips anon)
    // never wrote their messages — staff never saw them. messages is now
    // anon-insertable (migration 020); this is the canonical write path,
    // mirroring addBooking / addMember. Fire-and-forget; the optimistic
    // local append above already updated this client's UI.
    upsertRow("messages", record);
    return record;
  }, []);
  // Mark every message in a thread as read for a given viewer-type. We
  // only flag inbound messages (i.e. messages NOT sent by this viewer)
  // so the sender's "sent" flag isn't disturbed.
  const markThreadRead = useCallback((threadKey, viewerType) => {
    setMessages((ms) => ms.map((m) => {
      if (m.threadKey !== threadKey) return m;
      if (m.fromType === viewerType) return m; // own message — leave it
      return m.read ? m : { ...m, read: true };
    }));
  }, []);

  // Notifications — global feed shared by all viewers. Each entry carries
  // a `recipientType` ("staff" | "corporate" | "agent" | "member") and an
  // optional `recipientId` so the NotificationBell can scope to "mine".
  // Capped at 200 records to keep the in-memory footprint reasonable; the
  // production CMS migrates this to a server-side feed without touching UI.
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);
  // Append a list of records, capping at 200 newest. Pure setter; the
  // emit-on-mutation helpers below call this from inside booking/invoice/
  // payment actions.
  const appendNotifications = useCallback((records) => {
    if (!records || records.length === 0) return;
    setNotifications((prev) => [...records, ...prev].slice(0, 200));
  }, []);
  const markNotificationRead = useCallback((id) => {
    setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);
  // Bulk-mark — accepts an optional predicate so the bell can mark only
  // its own filtered subset (e.g. "staff" or a specific guest).
  const markAllNotificationsRead = useCallback((predicate) => {
    setNotifications((ns) => ns.map((n) => (predicate && !predicate(n)) ? n : { ...n, read: true }));
  }, []);
  const clearNotifications = useCallback((predicate) => {
    setNotifications((ns) => predicate ? ns.filter((n) => !predicate(n)) : []);
  }, []);

  // Site-content CMS — operator-editable overrides for the public marketing
  // site. `textOverrides` is keyed by translation path (e.g. "hero.h1Line1");
  // `imageOverrides` is keyed by IMG export name (e.g. "heroNight"). Empty
  // override falls through to the i18n string / the default IMG path so the
  // public site keeps working with no edits applied.
  // `galleryItems` is `null` by default (= use the bundled default list).
  // Once the operator edits anything in the Gallery tab we materialise the
  // full list into the store so the operator can add, remove, reorder and
  // re-caption items.
  // SMTP configuration. Edited from Settings → Email SMTP. Drives every
  // outbound transactional email (booking confirmations, invoices,
  // receipts, partner emails). Defaults to a disabled state so the demo
  // doesn't try to wire to a real server, with Gmail's preset filled in
  // as the most common starting point.
  const [smtpConfig, setSmtpConfig] = useState(DEFAULT_SMTP_CONFIG);
  const updateSmtpConfig = useCallback((patch) => {
    setSmtpConfig((prev) => ({ ...prev, ...patch }));
  }, []);
  const resetSmtpConfig = useCallback(() => setSmtpConfig(DEFAULT_SMTP_CONFIG), []);

  // Property-wide event-period supplements master. Seeded with the
  // common Bahrain windows (Eid, F1, Ironman, NYE). Edited from
  // Property Info → Event-period supplements. All booking surfaces
  // read off this list so a date / amount edit flows through every
  // contract, agency, walk-up booking, and report at once.
  const [eventSupplements, setEventSupplements] = useState(DEFAULT_EVENT_SUPPLEMENTS);
  const upsertEventSupplement = useCallback((evt) => setEventSupplements((prev) => {
    if (!evt || !evt.id) return prev;
    const i = prev.findIndex((e) => e.id === evt.id);
    if (i >= 0) {
      const next = [...prev]; next[i] = { ...next[i], ...evt }; return next;
    }
    return [...prev, evt];
  }), []);
  const removeEventSupplement = useCallback((id) => {
    setEventSupplements((prev) => prev.filter((e) => e.id !== id));
  }, []);
  const resetEventSupplements = useCallback(() => setEventSupplements(DEFAULT_EVENT_SUPPLEMENTS), []);

  // Property identity (legal name, address, CR/VAT, banking, contact).
  // Edited from the Property admin section; consumed by every printable
  // document and the public footer.
  const [hotelInfo, setHotelInfo] = useState(DEFAULT_HOTEL_INFO);
  const updateHotelInfo = useCallback((patch) => {
    setHotelInfo((prev) => ({ ...prev, ...patch }));
  }, []);
  const resetHotelInfo = useCallback(() => setHotelInfo(DEFAULT_HOTEL_INFO), []);

  // Mirror the live currency master into the module-level cache so the
  // ambient `formatCurrency(n)` helper (used by every legacy `fmtBhd`
  // shim, HTML voucher builders, notification text and any module-level
  // formatter) reflows immediately on a Property Info edit, without each
  // callsite having to subscribe to the data context.
  useEffect(() => {
    setCurrentCurrency(hotelInfo);
  }, [hotelInfo?.currency, hotelInfo?.currencyDecimals]);

  const [siteContent, setSiteContent] = useState({
    textOverrides: {},
    imageOverrides: {},
    galleryItems: null,
  });
  const setSiteText = useCallback((path, value) => {
    setSiteContent((sc) => {
      const next = { ...sc.textOverrides };
      const trimmed = (value ?? "").toString();
      if (trimmed === "") delete next[path]; else next[path] = trimmed;
      return { ...sc, textOverrides: next };
    });
  }, []);
  const setSiteImage = useCallback((key, url) => {
    setSiteContent((sc) => {
      const next = { ...sc.imageOverrides };
      const trimmed = (url ?? "").toString().trim();
      if (trimmed === "") delete next[key]; else next[key] = trimmed;
      return { ...sc, imageOverrides: next };
    });
  }, []);
  const resetSiteContent = useCallback(() => {
    setSiteContent({ textOverrides: {}, imageOverrides: {}, galleryItems: null });
  }, []);

  // Gallery CRUD — `galleryItems` is null until the operator touches the
  // gallery, at which point we materialise the current list and start
  // tracking edits. Reset returns to null so the public site falls back
  // to the bundled defaults from data/gallery.js.
  const setGalleryItems = useCallback((items) => {
    setSiteContent((sc) => ({ ...sc, galleryItems: items }));
  }, []);
  const addGalleryItem = useCallback((item) => {
    setSiteContent((sc) => {
      const list = sc.galleryItems || [];
      const newId = item?.id || `g-${Date.now().toString(36)}`;
      const next = [...list, { id: newId, src: "", h: "wide", caption: "", ...item }];
      return { ...sc, galleryItems: next };
    });
  }, []);
  const updateGalleryItem = useCallback((index, patch) => {
    setSiteContent((sc) => {
      if (!sc.galleryItems) return sc;
      const next = sc.galleryItems.slice();
      if (!next[index]) return sc;
      next[index] = { ...next[index], ...patch };
      return { ...sc, galleryItems: next };
    });
  }, []);
  const removeGalleryItem = useCallback((index) => {
    setSiteContent((sc) => {
      if (!sc.galleryItems) return sc;
      const next = sc.galleryItems.filter((_, i) => i !== index);
      return { ...sc, galleryItems: next };
    });
  }, []);
  // Move an item up (-1) or down (+1) in the list — used by the admin
  // reorder buttons. Out-of-range moves are no-ops.
  const moveGalleryItem = useCallback((index, dir) => {
    setSiteContent((sc) => {
      if (!sc.galleryItems) return sc;
      const next = sc.galleryItems.slice();
      const target = index + dir;
      if (target < 0 || target >= next.length) return sc;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...sc, galleryItems: next };
    });
  }, []);
  const resetGallery = useCallback(() => {
    setSiteContent((sc) => ({ ...sc, galleryItems: null }));
  }, []);
  const [prospects, setProspects] = useState(SAMPLE_PROSPECTS);
  const [activities, setActivities] = useState(SAMPLE_ACTIVITIES);
  const [reportSchedules, setReportSchedules] = useState(SAMPLE_REPORT_SCHEDULES);
  const [maintenanceVendors, setMaintenanceVendors] = useState(SAMPLE_MAINTENANCE_VENDORS);
  const [maintenanceJobs,    setMaintenanceJobs]    = useState(SAMPLE_MAINTENANCE_JOBS);
  const [roomUnits,          setRoomUnits]          = useState(SAMPLE_ROOM_UNITS);

  // ─── Supabase hydration + auto-persistence ─────────────────────────────
  // Phase 2 wiring. Every slice below is mirrored to a JSONB-entity table
  // (`bookings`, `invoices`, …) or a row in `singletons` (configs). On
  // mount we fetch each one and replace local state. After hydration, any
  // change to the slice is debounced (600ms) and bulk-replaced into its
  // table — the operator sees instant local updates while the DB catches
  // up in the background. When Supabase isn't configured everything
  // short-circuits silently and the app stays on its bundled mock data.
  //
  // Re-hydration on auth state change: most entity tables are RLS-gated,
  // so an anon fetch returns []. We treat that as "keep local mock" so
  // first paint isn't empty — but it means the local view is stale after
  // sign-in until we re-fetch. The `hydrationVersion` counter below
  // bumps on Supabase auth events; the effect re-runs and replays every
  // fetch under the new (authenticated) session, replacing mock with
  // the real DB content.
  //
  // `hydrated` is STATE (not a ref) so flipping it true triggers a
  // re-evaluation of every useSlicePersistence / useSingletonPersistence
  // effect. Without this, a slow Promise.all could let an early
  // setX(dbRows) fire while hydrated was still false — the persistence
  // hook would skip it, then never see the value-change again, and a
  // later owner-edit would silently land as the "baseline" with no
  // write. See useSlicePersistence's header comment for the full trace.
  const [hydrated, setHydrated] = useState(false);
  const [hydrationVersion, setHydrationVersion] = useState(0);
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) { setHydrated(true); return; }
    let cancelled = false;
    // Pause persistence while we replay the fetches — otherwise a slice
    // re-render mid-fetch could trigger a stray bulkReplace.
    setHydrated(false);
    Promise.all([
      // Entity slices
      fetchAll("packages")           .then(d => { if (!cancelled && d && d.length > 0) setPackages(d); }),
      fetchAll("extras")             .then(d => { if (!cancelled && d && d.length > 0) setExtras(d); }),
      fetchAll("members")            .then(d => { if (!cancelled && d && d.length > 0) setMembers(d); }),
      fetchAll("gift_cards")         .then(d => { if (!cancelled && d && d.length > 0) setGiftCards(d); }),
      fetchAll("gift_card_tiers")    .then(d => { if (!cancelled && d && d.length > 0) setGiftCardTiers(d); }),
      fetchAll("bookings")           .then(d => { if (!cancelled && d && d.length > 0) setBookings(d); }),
      fetchAll("payments")           .then(d => { if (!cancelled && d && d.length > 0) setPayments(d); }),
      fetchAll("invoices")           .then(d => { if (!cancelled && d && d.length > 0) setInvoices(d); }),
      fetchAll("agreements")         .then(d => { if (!cancelled && d && d.length > 0) setAgreements(d); }),
      fetchAll("agencies")           .then(d => { if (!cancelled && d && d.length > 0) setAgencies(d); }),
      fetchAll("email_templates")    .then(d => { if (!cancelled && d && d.length > 0) setEmailTemplates(d); }),
      fetchAll("rfps")               .then(d => { if (!cancelled && d && d.length > 0) setRfps(d); }),
      fetchAll("channels")           .then(d => { if (!cancelled && d && d.length > 0) setChannels(d); }),
      fetchAll("admin_users")        .then(d => {
        if (cancelled) return;
        if (d && d.length > 0) {
          // Live rows beat the bundled seed. Also write the rows to
          // localStorage so the next page load can render them
          // instantly instead of flashing the JS seed.
          setAdminUsers(d);
          writeAdminUsersCache(d);
          // eslint-disable-next-line no-console
          console.info(`[admin_users] ${d.length} live row${d.length === 1 ? "" : "s"} loaded from DB (cached for next visit).`);
        } else if (Array.isArray(d) && d.length === 0) {
          // SAFETY: this branch used to auto-push SAMPLE_ADMIN_USERS into
          // the DB whenever a *staff session* saw an empty read (a
          // "self-healing seed"). That was a footgun — a transient empty
          // read under an authenticated page load could OVERWRITE live
          // staff accounts and reset their passwords to the bundled demo
          // seed. We now NEVER write to the database from here. Seeding the
          // canonical accounts is a deliberate, one-off migration
          // (supabase/migrations/015_admin_users_seed.sql), not an automatic
          // side effect of loading the app. The in-memory JS seed still
          // renders the login tiles locally; the database is left untouched.
          // eslint-disable-next-line no-console
          console.warn(
            "[admin_users] fetch returned 0 rows — rendering the bundled JS seed locally; " +
            "the database is NOT modified. To drive the tiles from live rows, apply " +
            "supabase/migrations/012_admin_users_realtime.sql and 015_admin_users_seed.sql."
          );
        } else if (d === null) {
          // Supabase isn't configured at all — perfectly valid in mock/CI mode.
          // eslint-disable-next-line no-console
          console.info("[admin_users] Supabase not configured — using JS seed only.");
        }
      }),
      fetchAll("testing_plan_assignments").then(d => { if (!cancelled && d && d.length > 0) setTestingPlanAssignments(d); }),
      fetchAll("audit_logs")         .then(d => { if (!cancelled && d && d.length > 0) setAuditLogs(d); }),
      fetchAll("prospects")          .then(d => { if (!cancelled && d && d.length > 0) setProspects(d); }),
      fetchAll("activities")         .then(d => { if (!cancelled && d && d.length > 0) setActivities(d); }),
      fetchAll("report_schedules")   .then(d => { if (!cancelled && d && d.length > 0) setReportSchedules(d); }),
      fetchAll("maintenance_vendors").then(d => { if (!cancelled && d && d.length > 0) setMaintenanceVendors(d); }),
      fetchAll("maintenance_jobs")   .then(d => { if (!cancelled && d && d.length > 0) setMaintenanceJobs(d); }),
      fetchAll("room_units")         .then(d => { if (!cancelled && d && d.length > 0) setRoomUnits(d); }),
      fetchAll("notifications")      .then(d => { if (!cancelled && d && d.length > 0) setNotifications(d); }),
      fetchAll("messages")           .then(d => { if (!cancelled && d && d.length > 0) setMessages(d); }),
      // calendar_overrides is stored as an object map { "roomId|date": cell },
      // not an array, so it uses the bespoke object-map fetch helper that
      // preserves each row's id as the map key. Using fetchAll here would
      // throw away the id and coerce the map to an array, breaking every
      // `calendar[key]` lookup downstream.
      fetchEntityMap("calendar_overrides") .then(d => {
        if (!cancelled && d && Object.keys(d).length > 0) setCalendar(d);
      }),
      fetchAll("tax_patterns")       .then(d => { if (!cancelled && d && d.length > 0) setTaxPatterns(d); }),
      // Singletons
      fetchSingleton("hotel_info")        .then(v => { if (!cancelled && v) setHotelInfo(v); }),
      fetchSingleton("event_supplements") .then(v => { if (!cancelled && v && Array.isArray(v)) setEventSupplements(v); }),
      fetchSingleton("smtp_config")       .then(v => { if (!cancelled && v) setSmtpConfig(v); }),
      fetchSingleton("site_content")      .then(v => { if (!cancelled && v) setSiteContent(v); }),
      fetchSingleton("loyalty")           .then(v => { if (!cancelled && v) setLoyalty(v); }),
      fetchSingleton("tiers")             .then(v => { if (!cancelled && v) setTiers(v); }),
      fetchSingleton("corporate_tiers")   .then(v => { if (!cancelled && v) setCorporateTiers(v); }),
      fetchSingleton("agency_tiers")      .then(v => { if (!cancelled && v) setAgencyTiers(v); }),
      fetchSingleton("partner_loyalty")   .then(v => { if (!cancelled && v) setPartnerLoyalty(v); }),
      fetchSingleton("tax")               .then(v => { if (!cancelled && v) setTax(v); }),
      fetchSingleton("active_tax_pattern").then(v => { if (!cancelled && v) setActivePatternId(v.id || v); }),
      // Gallery — items are managed via setGalleryItems below; we treat
      // it as an entity slice keyed off id for convenience.
      // (The slice itself is initialised inside siteContent in this
      // codebase; persistence is handled below at the slice level.)
    ]).finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [hydrationVersion]);

  // When the Supabase auth state changes (sign-in / sign-out / initial
  // session restore from localStorage), bump the version so the
  // hydration effect above replays every fetch under the new session.
  //
  // Gotcha: Supabase fires INITIAL_SESSION as soon as the module-level
  // client resolves getSession(), which is BEFORE React effects run. So
  // a listener registered in this useEffect always misses INITIAL_SESSION.
  // We work around that by explicitly calling getSession() once at
  // registration time — if there's already a session, we re-hydrate
  // immediately. The listener then catches all subsequent transitions
  // (SIGNED_IN after explicit sign-in, SIGNED_OUT on sign-out, etc.).
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    let stillMounted = true;

    // Real-guest-auth (Phase 1/2): derive the portal session from the JWT's
    // custom claims (migration 022 hook). Null for staff / unprovisioned /
    // flag-off. Runs on the SAME listener as the re-hydration bump — no
    // second subscription. Restores a guest session before first portal paint.
    const recomputeGuest = (session) => {
      if (!REAL_GUEST_AUTH) return;
      setGuestAuthSession(sessionFromClaims(session?.user || null));
    };

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        setHydrationVersion((v) => v + 1);
      }
      recomputeGuest(session);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!stillMounted) return;
      if (data?.session) setHydrationVersion((v) => v + 1);
      recomputeGuest(data?.session);
    });
    return () => {
      stillMounted = false;
      sub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  // Slice → table mirroring. Each call below watches one piece of state
  // and pushes changes to its table after hydration. Order matters only
  // for clarity — hooks fire in declared order but the persistence is
  // independent per slice.
  useSlicePersistence("packages",            packages,           hydrated);
  useSlicePersistence("extras",              extras,             hydrated);
  useSlicePersistence("members",             members,            hydrated);
  useSlicePersistence("gift_cards",          giftCards,          hydrated);
  useSlicePersistence("gift_card_tiers",     giftCardTiers,      hydrated);
  useSlicePersistence("bookings",            bookings,           hydrated);
  useSlicePersistence("payments",            payments,           hydrated);
  useSlicePersistence("invoices",            invoices,           hydrated);
  useSlicePersistence("agreements",          agreements,         hydrated);
  useSlicePersistence("agencies",            agencies,           hydrated);
  useSlicePersistence("email_templates",     emailTemplates,     hydrated);
  useSlicePersistence("rfps",                rfps,               hydrated);
  useSlicePersistence("channels",            channels,           hydrated);
  useSlicePersistence("admin_users",         adminUsers,         hydrated);
  // ─── Live multi-tab sync ────────────────────────────────────────────
  // Every operational slice the staff might edit from one tab and
  // expect another tab (or another teammate) to see immediately rides
  // on Supabase's realtime broadcast. Persistence is content-aware
  // (JSON.stringify diff), so inbound events that produce identical
  // state don't trigger an echo write back. Each hook teardown removes
  // its WebSocket subscription on unmount; the underlying Supabase
  // client multiplexes everything onto one connection.
  //
  // Audit log is intentionally NOT broadcast — every operator session
  // appends to it, the firehose adds chatter without a UI that watches
  // it live. Same for testing_plan_assignments + report_runs (low-
  // priority background data). Add later if a "live audit feed"
  // screen needs it.
  //
  //   Users & accounts
  //     admin_users   — Staff & Access (operators / GMs / housekeeping…)
  //     members       — LS Privilege loyalty guests
  //     agreements    — Corporate accounts (with embedded user POCs)
  //     agencies      — Travel agencies   (with embedded user POCs)
  //     prospects     — Sales-funnel leads
  //
  //   Inventory & pricing
  //     rooms              — Public room types + rack rates + sell limit
  //     room_units         — Per-suite registry (status, view, floor)
  //     calendar_overrides — Per-(roomId × date) rate / blocked / stop-sale
  //     packages           — Featured offers
  //     extras             — Booking add-ons
  //     tax_patterns       — VAT / service / tourism levy presets
  //     gift_cards         — Issued gift cards + redemption status
  //     gift_card_tiers    — Pre-set gift card bundles
  //
  //   Reservations & billing
  //     bookings           — Reservations across every channel
  //     invoices           — Booking + commission + gift-card invoices
  //     payments           — Captured payments
  //
  //   Operations & comms
  //     maintenance_jobs   — Defect-to-fix lifecycle
  //     maintenance_vendors— Rolodex (AC, plumbers, painters…)
  //     channels           — OTA / channel-manager status
  //     email_templates    — Templated emails the system sends
  //     report_schedules   — Recurring email reports
  //     rfps               — Corporate RFP intake
  //     activities         — CRM activity stream
  //     notifications      — Operator inbox
  //     messages           — Staff chat threads
  //     gallery            — Homepage gallery items
  //
  //   Property singletons (settings + global rate cards)
  //     hotel_info         — Property info, weekend days, payment terms…
  //     tiers              — LS Privilege tier benefits + earn rates
  //     tax                — Default VAT / service / tourism levy
  //     active_tax_pattern — Currently-applied tax pattern id
  //     loyalty            — Loyalty config (earn rates, expiry rules)
  //     event_supplements  — Eid / F1 / NYE rate-supplement master
  //     smtp_config        — Outbound email transport settings
  //     site_content       — Public marketing copy + hero imagery

  // Users & accounts
  useRealtimeSlice("admin_users", setAdminUsers, hydrated);

  // Mirror every adminUsers change to localStorage so the next page
  // load can render the demo tiles instantly (no JS-seed flash). We
  // wait until hydration completes so we don't accidentally cache the
  // initial SAMPLE before the DB fetch has had a chance to replace it.
  useEffect(() => {
    if (!hydrated) return;
    if (!Array.isArray(adminUsers) || adminUsers.length === 0) return;
    writeAdminUsersCache(adminUsers);
  }, [adminUsers, hydrated]);
  useRealtimeSlice("members",     setMembers,    hydrated);
  useRealtimeSlice("agreements",  setAgreements, hydrated);
  useRealtimeSlice("agencies",    setAgencies,   hydrated);
  useRealtimeSlice("prospects",   setProspects,  hydrated);

  // Inventory & pricing — `rooms` rides through useRealtimeTable since
  // it has its own columnar schema (snake_case columns + image_url URL,
  // not a single `data` jsonb blob). The others are JSONB-entity tables.
  useRealtimeTable("rooms", setRooms, hydrated, { rowToClient: dbRoomToClient });
  useRealtimeSlice("room_units",         setRoomUnits,         hydrated);
  // calendar_overrides — object-map realtime so payloads land at the
  // right map key instead of being appended to a phantom array.
  useObjectRealtimeSlice("calendar_overrides", setCalendar,     hydrated);
  useRealtimeSlice("packages",           setPackages,          hydrated);
  useRealtimeSlice("extras",             setExtras,            hydrated);
  useRealtimeSlice("tax_patterns",       setTaxPatterns,       hydrated);
  useRealtimeSlice("gift_cards",         setGiftCards,         hydrated);
  useRealtimeSlice("gift_card_tiers",    setGiftCardTiers,     hydrated);

  // Reservations & billing
  useRealtimeSlice("bookings",           setBookings,          hydrated);
  useRealtimeSlice("invoices",           setInvoices,          hydrated);
  useRealtimeSlice("payments",           setPayments,          hydrated);

  // Operations & comms
  useRealtimeSlice("maintenance_jobs",   setMaintenanceJobs,   hydrated);
  useRealtimeSlice("maintenance_vendors",setMaintenanceVendors,hydrated);
  useRealtimeSlice("channels",           setChannels,          hydrated);
  useRealtimeSlice("email_templates",    setEmailTemplates,    hydrated);
  useRealtimeSlice("report_schedules",   setReportSchedules,   hydrated);
  useRealtimeSlice("rfps",               setRfps,              hydrated);
  useRealtimeSlice("activities",         setActivities,        hydrated);
  useRealtimeSlice("notifications",      setNotifications,     hydrated);
  useRealtimeSlice("messages",           setMessages,          hydrated);
  // Gallery is nested inside the `site_content` singleton in this codebase,
  // so it propagates through the singleton channel below — no separate
  // `gallery` entity-table subscription needed.

  // Singletons — one channel per key. Filtered server-side so a
  // hotel_info change doesn't wake up the `tiers` or `tax` subscribers.
  useRealtimeSingleton("hotel_info",         setHotelInfo,         hydrated);
  useRealtimeSingleton("tiers",              setTiers,             hydrated);
  useRealtimeSingleton("corporate_tiers",    setCorporateTiers,    hydrated);
  useRealtimeSingleton("agency_tiers",       setAgencyTiers,       hydrated);
  useRealtimeSingleton("partner_loyalty",    setPartnerLoyalty,    hydrated);
  useRealtimeSingleton("tax",                setTax,               hydrated);
  useRealtimeSingleton("active_tax_pattern", (v) => setActivePatternId(v?.id || v), hydrated);
  useRealtimeSingleton("loyalty",            setLoyalty,           hydrated);
  useRealtimeSingleton("event_supplements",  (v) => setEventSupplements(Array.isArray(v) ? v : []), hydrated);
  useRealtimeSingleton("smtp_config",        setSmtpConfig,        hydrated);
  useRealtimeSingleton("site_content",       setSiteContent,       hydrated);
  useSlicePersistence("testing_plan_assignments", testingPlanAssignments, hydrated);
  useSlicePersistence("audit_logs",          auditLogs,          hydrated);
  useSlicePersistence("prospects",           prospects,          hydrated);
  useSlicePersistence("activities",          activities,         hydrated);
  useSlicePersistence("report_schedules",    reportSchedules,    hydrated);
  useSlicePersistence("maintenance_vendors", maintenanceVendors, hydrated);
  useSlicePersistence("maintenance_jobs",    maintenanceJobs,    hydrated);
  useSlicePersistence("room_units",          roomUnits,          hydrated);
  useSlicePersistence("notifications",       notifications,      hydrated);
  useSlicePersistence("messages",            messages,           hydrated);
  // Object-map persistence — only the diff (added / changed / removed
  // keys) is pushed. A single cell edit costs one upsert, not a full
  // table replace, and stale rows are deleted by id when the operator
  // clears an override.
  useObjectSlicePersistence("calendar_overrides",  calendar,     hydrated);
  useSlicePersistence("tax_patterns",        taxPatterns,        hydrated);
  // Singletons
  useSingletonPersistence("hotel_info",         hotelInfo,         hydrated);
  useSingletonPersistence("event_supplements",  eventSupplements,  hydrated);
  useSingletonPersistence("smtp_config",        smtpConfig,        hydrated);
  useSingletonPersistence("site_content",       siteContent,       hydrated);
  useSingletonPersistence("loyalty",            loyalty,           hydrated);
  useSingletonPersistence("tiers",              tiers,             hydrated);
  useSingletonPersistence("corporate_tiers",    corporateTiers,    hydrated);
  useSingletonPersistence("agency_tiers",       agencyTiers,       hydrated);
  useSingletonPersistence("partner_loyalty",    partnerLoyalty,    hydrated);
  useSingletonPersistence("tax",                tax,               hydrated);
  // Store the bare string id; the hydration path already handles
  // both { id: "..." } and "..." shapes for backward compat.
  useSingletonPersistence("active_tax_pattern", activePatternId, hydrated);

  // Helpers — keep update logic centralized so admin components stay terse.
  // Optimistic local update + fire-and-forget Supabase persistence.
  // The UI feels instant; the DB write happens in the background. If the
  // write fails (RLS, network, missing auth) the warning lands in the
  // browser console and the local state stays — admin code can later
  // surface a toast by awaiting the returned promise.
  const updateRoom    = useCallback((id, patch) => {
    setRooms(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    return persistRoomPatch(id, patch);
  }, []);
  // Add a brand-new room type. Optimistic on the local slice so the
  // operator sees the new entry instantly; the Supabase insert runs
  // in the background. Skips the local insert when the id is already
  // taken so we never end up with a phantom duplicate.
  const addRoom = useCallback((room) => {
    setRooms(rs => {
      if (rs.some(r => r.id === room.id)) return rs;
      return [...rs, room];
    });
    return persistRoomInsert(room);
  }, []);
  // Remove a room type. The CALLER must check that no room_units or
  // bookings still point at this id — there's no DB cascade. The
  // RoomsRates UI surfaces that warning in the confirm dialog.
  const removeRoom = useCallback((id) => {
    setRooms(rs => rs.filter(r => r.id !== id));
    return persistRoomRemove(id);
  }, []);
  const upsertPackage = useCallback((pkg) => setPackages(ps => {
    const i = ps.findIndex(p => p.id === pkg.id);
    if (i >= 0) { const next = [...ps]; next[i] = { ...next[i], ...pkg }; return next; }
    return [...ps, { active: true, ...pkg }];
  }), []);
  const removePackage = useCallback((id) => setPackages(ps => ps.filter(p => p.id !== id)), []);
  const togglePackage = useCallback((id) => setPackages(ps => ps.map(p => p.id === id ? { ...p, active: !p.active } : p)), []);

  const updateTier    = useCallback((idx, patch) => setTiers(ts => ts.map((t, i) => i === idx ? { ...t, ...patch } : t)), []);
  // Toggle a benefit on/off by id (legacy callers may pass the key field used
  // before the schema migration; both id and key are supported as a guard).
  const toggleBenefit = useCallback((tierIdx, benefitIdOrKey) => setTiers(ts => ts.map((t, i) => {
    if (i !== tierIdx) return t;
    return { ...t, benefits: t.benefits.map(b => (b.id === benefitIdOrKey || b.key === benefitIdOrKey) ? { ...b, on: !b.on } : b) };
  })), []);

  // Tier CRUD.
  const addTier = useCallback((tier) => setTiers(ts => {
    const id = tier.id || `custom-${Date.now()}`;
    return [...ts, { earnRate: 1, builtIn: false, benefits: [], ...tier, id }];
  }), []);
  const removeTier = useCallback((id) => setTiers(ts => ts.filter(t => t.id !== id)), []);
  const moveTier = useCallback((idx, dir) => setTiers(ts => {
    const next = [...ts];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return ts;
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  }), []);

  // Benefit CRUD inside a tier.
  const addBenefit    = useCallback((tierIdx, label = "New benefit") => setTiers(ts => ts.map((t, i) => {
    if (i !== tierIdx) return t;
    const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    return { ...t, benefits: [...t.benefits, { id, label, on: true }] };
  })), []);
  const updateBenefit = useCallback((tierIdx, benefitId, patch) => setTiers(ts => ts.map((t, i) => {
    if (i !== tierIdx) return t;
    return { ...t, benefits: t.benefits.map(b => b.id === benefitId ? { ...b, ...patch } : b) };
  })), []);
  const removeBenefit = useCallback((tierIdx, benefitId) => setTiers(ts => ts.map((t, i) => {
    if (i !== tierIdx) return t;
    return { ...t, benefits: t.benefits.filter(b => b.id !== benefitId) };
  })), []);

  // ─── B2B partner loyalty actions ─────────────────────────────────────────
  // Two tier-editor action sets (one per ladder) from the shared factory, plus
  // per-account activation, the lifetime-volume tier solver, the automatic
  // points-accrual engine, and a manual admin adjust. Account points/tier fields
  // ride the existing agreements/agencies slices (no new persistence path).
  const corporateTierActions = useMemo(() => makeTierCrud(setCorporateTiers), []);
  const agencyTierActions    = useMemo(() => makeTierCrud(setAgencyTiers), []);

  // Resolve which tier an account currently qualifies for, by LIFETIME volume.
  const recomputePartnerTier = useCallback((kind, account) => {
    const ladder = kind === "corporate" ? corporateTiers : agencyTiers;
    if (!ladder || ladder.length === 0) return null;
    const volume = partnerLoyalty?.qualifyBy === "revenue"
      ? Number(account?.lifetimeRevenue || 0)
      : Number(account?.lifetimeNights || 0);
    const eligible = ladder.filter(t => Number(t.qualifyMin || 0) <= volume);
    const chosen = eligible.length
      ? eligible.reduce((a, b) => (Number(b.qualifyMin || 0) > Number(a.qualifyMin || 0) ? b : a))
      : ladder.reduce((a, b) => (Number(b.qualifyMin || 0) < Number(a.qualifyMin || 0) ? b : a));
    return chosen?.id ?? null;
  }, [corporateTiers, agencyTiers, partnerLoyalty]);

  // Award points for a confirmed/stayed B2B booking — idempotent via the
  // account's pointsHistory ledger (one "earn" row per booking id), so status
  // churn or realtime re-delivery can never double-award.
  const accruePartnerPoints = useCallback((booking) => {
    if (!booking) return;
    const kind = booking.source === "corporate" ? "corporate"
               : booking.source === "agent"     ? "agent" : null;
    if (!kind) return;
    const accountId = kind === "corporate" ? booking.accountId : booking.agencyId;
    if (!accountId) return;
    const setter = kind === "corporate" ? setAgreements : setAgencies;
    const ladder = kind === "corporate" ? corporateTiers : agencyTiers;
    setter(list => list.map(a => {
      if (a.id !== accountId) return a;
      if (!a.loyaltyEnabled) return a;                        // admin gate
      const history = a.pointsHistory || [];
      if (history.some(h => h.bookingId === booking.id && h.kind === "earn")) return a; // already awarded
      const curTier  = ladder.find(t => t.id === a.tier) || ladder[0];
      const earnRate = Number(curTier?.earnRate) || 1;
      const revenue  = Number(booking.total)  || 0;
      const nights   = Number(booking.nights) || 0;
      const earned   = Math.round(revenue * earnRate);
      const merged = {
        ...a,
        points:          (Number(a.points) || 0) + earned,
        lifetimeNights:  (Number(a.lifetimeNights) || 0) + nights,
        lifetimeRevenue: (Number(a.lifetimeRevenue) || 0) + revenue,
        pointsHistory:   [...history, { ts: new Date().toISOString(), bookingId: booking.id, kind: "earn", points: earned, nights, revenue }],
      };
      merged.tier = recomputePartnerTier(kind, merged);       // re-evaluate after volume bump
      return merged;
    }));
  }, [corporateTiers, agencyTiers, recomputePartnerTier]);

  // Enable/disable loyalty on a single account. On first enable, initialise the
  // ledger fields + compute the starting tier; this is the ONLY thing that
  // writes loyalty fields to an account (off + untouched by default).
  const setAccountLoyaltyEnabled = useCallback((kind, id, enabled) => {
    const setter = kind === "corporate" ? setAgreements : setAgencies;
    setter(list => list.map(a => {
      if (a.id !== id) return a;
      const next = { ...a, loyaltyEnabled: enabled };
      if (enabled) {
        next.points          = Number(a.points) || 0;
        next.lifetimeNights  = Number(a.lifetimeNights) || 0;
        next.lifetimeRevenue = Number(a.lifetimeRevenue) || 0;
        next.pointsHistory   = a.pointsHistory || [];
        next.tier            = recomputePartnerTier(kind, next);
      }
      return next;
    }));
  }, [recomputePartnerTier]);
  const toggleAccountLoyalty = useCallback((kind, id) => {
    const list = kind === "corporate" ? agreements : agencies;
    const cur = list.find(a => a.id === id);
    setAccountLoyaltyEnabled(kind, id, !(cur?.loyaltyEnabled));
  }, [agreements, agencies, setAccountLoyaltyEnabled]);

  // Manual admin points adjust (clamps balance ≥ 0; ledgered).
  const adjustPartnerPoints = useCallback((kind, id, delta, note = "") => {
    const d = Math.round(Number(delta) || 0);
    if (!d) return;
    const setter = kind === "corporate" ? setAgreements : setAgencies;
    setter(list => list.map(a => {
      if (a.id !== id) return a;
      const history = a.pointsHistory || [];
      const points  = Math.max(0, (Number(a.points) || 0) + d);
      return { ...a, points, pointsHistory: [...history, { ts: new Date().toISOString(), kind: "adjust", points: d, note }] };
    }));
  }, []);

  // ─── B2B partner loyalty — Phase 2 redemption (staff-executed) ────────────
  // Partners READ their own account (points/tier) but cannot write it (scoped
  // RLS), so every point-deducting redemption is performed by staff — from the
  // admin per-account panel or the booking drawer. Partners request via the
  // portal (a message); staff fulfils here. All entries land in the existing
  // pointsHistory ledger (no new table). Each returns false on insufficient
  // balance so callers can surface a clear error.
  const redeemPartnerPoints = useCallback((kind, id, points, note = "", meta = {}) => {
    const pts = Math.max(0, Math.round(Number(points) || 0));
    if (!pts) return false;
    const setter = kind === "corporate" ? setAgreements : setAgencies;
    const perBhd = Number(partnerLoyalty?.redeemBhdPerPoints) || 100;
    let ok = false;
    setter(list => list.map(a => {
      if (a.id !== id) return a;
      const bal = Number(a.points) || 0;
      if (pts > bal) return a;                      // insufficient — no-op
      ok = true;
      const bhd = Math.floor(pts / perBhd);
      const history = a.pointsHistory || [];
      const entry = { id: `rdm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, ts: new Date().toISOString(), kind: "redeem", points: -pts, bhd, note, ...meta };
      return { ...a, points: bal - pts, pointsHistory: [...history, entry] };
    }));
    return ok;
  }, [partnerLoyalty]);

  // Issue a fixed-denomination (20/50/100) third-party gift card against points.
  const issuePartnerGiftCard = useCallback((kind, id, brandId, denomination, code = "", note = "") => {
    const denom = Number(denomination) || 0;
    if (!denom) return false;
    const setter = kind === "corporate" ? setAgreements : setAgencies;
    const perBhd = Number(partnerLoyalty?.redeemBhdPerPoints) || 100;
    const brand = (partnerLoyalty?.giftCard?.brands || []).find(b => b.id === brandId);
    const cost = denom * perBhd;                    // points required for this card
    let ok = false;
    setter(list => list.map(a => {
      if (a.id !== id) return a;
      const bal = Number(a.points) || 0;
      if (cost > bal) return a;                     // insufficient — no-op
      ok = true;
      const history = a.pointsHistory || [];
      const entry = { id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, ts: new Date().toISOString(), kind: "giftcard", points: -cost, denomination: denom, brandId, brand: brand?.name || "Gift card", code: code || "", status: "fulfilled", note };
      return { ...a, points: bal - cost, pointsHistory: [...history, entry] };
    }));
    return ok;
  }, [partnerLoyalty]);

  // Gift-card brand catalogue (admin-managed on the shared economy singleton).
  const addPartnerGiftCardBrand = useCallback((name) => {
    const nm = String(name || "").trim();
    if (!nm) return;
    setPartnerLoyalty(l => {
      const gc = l.giftCard || { denominations: [20, 50, 100], brands: [] };
      return { ...l, giftCard: { ...gc, brands: [...(gc.brands || []), { id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`, name: nm, active: true }] } };
    });
  }, []);
  const updatePartnerGiftCardBrand = useCallback((brandId, patch) => {
    setPartnerLoyalty(l => {
      const gc = l.giftCard || { denominations: [20, 50, 100], brands: [] };
      return { ...l, giftCard: { ...gc, brands: (gc.brands || []).map(b => b.id === brandId ? { ...b, ...patch } : b) } };
    });
  }, []);
  const removePartnerGiftCardBrand = useCallback((brandId) => {
    setPartnerLoyalty(l => {
      const gc = l.giftCard || { denominations: [20, 50, 100], brands: [] };
      return { ...l, giftCard: { ...gc, brands: (gc.brands || []).filter(b => b.id !== brandId) } };
    });
  }, []);

  const setCalendarCell = useCallback((roomId, dateISO, patch) => setCalendar(c => {
    const key = `${roomId}|${dateISO}`;
    const next = { ...c };
    if (patch === null) delete next[key]; else next[key] = { ...c[key], ...patch };
    return next;
  }), []);

  const upsertAgreement = useCallback((agr) => setAgreements(as => {
    const i = as.findIndex(a => a.id === agr.id);
    if (i >= 0) { const n = [...as]; n[i] = { ...n[i], ...agr }; return n; }
    return [...as, agr];
  }), []);
  const removeAgreement = useCallback((id) => setAgreements(as => as.filter(a => a.id !== id)), []);

  const upsertAgency = useCallback((agt) => setAgencies(as => {
    const i = as.findIndex(a => a.id === agt.id);
    if (i >= 0) { const n = [...as]; n[i] = { ...n[i], ...agt }; return n; }
    return [...as, agt];
  }), []);
  const removeAgency = useCallback((id) => setAgencies(as => as.filter(a => a.id !== id)), []);

  // Public self-registration for corporate accounts / travel agencies from
  // the portal sign-in screen. Creates a minimal record in status
  // "pending-approval" carrying the registrant as the primary portal user —
  // sign-in is gated on that status until an admin activates the account
  // from the Corporate / Travel Agents workspace. Persists via a direct
  // per-row insert (mirrors addMember/addBooking — anon clients can't ride
  // the bulk slice sync; needs the anon-insert policy from migration 027).
  const registerPartnerAccount = useCallback(({ kind, company, name, email, phone, password }) => {
    const today = new Date().toISOString().slice(0, 10);
    const user = {
      id: `U-REG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      name, email, phone: phone || "", role: "primary", primary: true, password,
    };
    let saved;
    if (kind === "corporate") {
      const id = `AGR-REG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      saved = {
        id, account: company, industry: "", status: "pending-approval",
        registeredAt: new Date().toISOString(),
        signedOn: "", startsOn: "", endsOn: "",
        paymentTerms: "Net 30", creditLimit: 0,
        dailyRates: {}, monthlyRates: {}, taxIncluded: false, weekendUpliftPct: 0,
        inclusions: { wifi: true }, cancellationPolicy: "",
        pocName: name, pocEmail: email, pocPhone: phone || "",
        notes: `Self-registered via the website on ${today}. Awaiting activation.`,
        targetNights: 0, ytdNights: 0, ytdSpend: 0,
        users: [user],
      };
      setAgreements(as => [saved, ...as]);
      upsertRow("agreements", saved);
    } else {
      const id = `AGT-REG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      saved = {
        id, name: company, status: "pending-approval",
        registeredAt: new Date().toISOString(),
        signedOn: "", startsOn: "", endsOn: "",
        commissionPct: 10, marketingFundPct: 0, paymentTerms: "Net 30", creditLimit: 0,
        dailyNet: {}, monthlyNet: {}, cancellationPolicy: "",
        pocName: name, pocEmail: email, pocPhone: phone || "", contact: name,
        notes: `Self-registered via the website on ${today}. Awaiting activation.`,
        targetBookings: 0, ytdBookings: 0, ytdRevenue: 0, ytdCommission: 0,
        users: [user],
      };
      setAgencies(as => [saved, ...as]);
      upsertRow("agencies", saved);
    }
    setTimeout(() => {
      appendNotifications(notifyPartnerRegistered(saved, kind));
    }, 0);
    return saved;
  }, [appendNotifications]);

  // Email-template CRUD. Built-in templates can be edited or disabled but
  // can't be removed (they reappear on refresh, like built-in tiers).
  const upsertEmailTemplate = useCallback((tpl) => setEmailTemplates(ts => {
    const i = ts.findIndex(t => t.id === tpl.id);
    if (i >= 0) { const n = [...ts]; n[i] = { ...n[i], ...tpl }; return n; }
    return [...ts, { active: true, builtIn: false, ...tpl }];
  }), []);
  const removeEmailTemplate = useCallback((id) => setEmailTemplates(ts => ts.filter(t => t.id !== id)), []);
  const toggleEmailTemplate = useCallback((id) => setEmailTemplates(ts => ts.map(t => t.id === id ? { ...t, active: !t.active } : t)), []);
  // RFP CRUD — `addRfp` auto-generates an ID; `advanceRfp` shifts an RFP to
  // the next pipeline stage; the rest follow the standard upsert/remove pattern.
  const addRfp = useCallback((rfp) => {
    let saved;
    setRfps(rs => {
      const id = rfp.id || `RFP-${Math.floor(7000 + Math.random() * 2999)}`;
      const receivedOn = rfp.receivedOn || new Date().toISOString().slice(0, 10);
      saved = { ...rfp, id, receivedOn, status: rfp.status || "review" };
      return [saved, ...rs];
    });
    return saved;
  }, []);
  const upsertRfp = useCallback((rfp) => setRfps(rs => {
    const i = rs.findIndex(r => r.id === rfp.id);
    if (i >= 0) { const n = [...rs]; n[i] = { ...n[i], ...rfp }; return n; }
    return [rfp, ...rs];
  }), []);
  const removeRfp = useCallback((id) => setRfps(rs => rs.filter(r => r.id !== id)), []);
  const advanceRfp = useCallback((id, status) => setRfps(rs => rs.map(r => r.id === id ? { ...r, status } : r)), []);

  // Channel CRUD — every OTA / wholesale connection the property runs.
  const upsertChannel = useCallback((ch) => setChannels(cs => {
    const i = cs.findIndex(c => c.id === ch.id);
    if (i >= 0) { const n = [...cs]; n[i] = { ...n[i], ...ch }; return n; }
    return [...cs, ch];
  }), []);
  const removeChannel = useCallback((id) => setChannels(cs => cs.filter(c => c.id !== id)), []);
  const toggleChannelStatus = useCallback((id) => setChannels(cs => cs.map(c => c.id === id
    ? { ...c, status: c.status === "live" ? "paused" : "live", lastSyncAt: new Date().toISOString() }
    : c
  )), []);
  const appendChannelSyncEvent = useCallback((id, evt) => setChannels(cs => cs.map(c => c.id === id
    ? { ...c, syncLog: [{ id: `sl-${Date.now()}`, ts: new Date().toISOString(), ...evt }, ...(c.syncLog || [])].slice(0, 30), lastSyncAt: new Date().toISOString(), lastSyncStatus: evt.status || c.lastSyncStatus }
    : c
  )), []);

  // Admin / staff CRUD. `addAdminUser` auto-generates the next ADM-NNN id;
  // `updateAdminUser` is a shallow patch; `setAdminUserPassword` rotates the
  // placeholder password (real backend would hash + email a temporary link).
  const addAdminUser = useCallback((user) => setAdminUsers(us => {
    const nextNum = us.reduce((m, u) => {
      const n = parseInt((u.id || "").replace(/^ADM-/, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0) + 1;
    const id = user.id || `ADM-${String(nextNum).padStart(3, "0")}`;
    const createdAt = user.createdAt || new Date().toISOString().slice(0, 10);
    return [{
      status: "active", mfa: false, permissions: [], avatarColor: "#64748B",
      ...user, id, createdAt,
    }, ...us];
  }), []);
  const updateAdminUser = useCallback((id, patch) => setAdminUsers(us => us.map(u => u.id === id ? { ...u, ...patch } : u)), []);
  const removeAdminUser = useCallback((id) => setAdminUsers(us => us.filter(u => u.id !== id)), []);
  const toggleAdminUserStatus = useCallback((id) => setAdminUsers(us => us.map(u => u.id === id
    ? { ...u, status: u.status === "active" ? "suspended" : "active" }
    : u
  )), []);
  const setAdminUserPassword = useCallback((id, password) => {
    let target = null;
    setAdminUsers(us => us.map(u => {
      if (u.id !== id) return u;
      target = u;
      return { ...u, password, passwordUpdatedAt: new Date().toISOString() };
    }));
    // Security notice (fire-and-forget) — confirms the change without ever
    // echoing the new password.
    if (target?.email) {
      sendTransactionalEmail({
        kind: "password-changed", to: target.email,
        name: target.name || target.email, portal: "staff",
      });
    }
  }, []);

  // Audit-log append. Auto-stamps id + timestamp; caller fills the rest.
  const appendAuditLog = useCallback((entry) => setAuditLogs(ls => {
    const nextNum = ls.reduce((m, l) => {
      const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1000) + 1;
    const id = entry.id || `AUD-${nextNum}`;
    return [{
      ts: new Date().toISOString(),
      ip: "session",
      ...entry,
      id,
    }, ...ls].slice(0, 500);
  }), []);
  const clearAuditLogs = useCallback(() => setAuditLogs([]), []);

  // Impersonation. `target` looks like { kind, accountId, userId?, displayName,
  // email }. `by` is the staff acting as the user (typically the Owner). Both
  // start + end events are written to the audit log automatically.
  const startImpersonation = useCallback((target, by) => {
    if (!target || !target.accountId) return;
    setImpersonation({ ...target, by, startedAt: new Date().toISOString() });
    setAuditLogs(ls => {
      const nextNum = ls.reduce((m, l) => {
        const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
      }, 1000) + 1;
      return [{
        id: `AUD-${nextNum}`,
        ts: new Date().toISOString(),
        kind: "impersonate-start",
        actorId: by?.id || by?.userId || "ADM-?", actorName: by?.name || "Operator", actorRole: by?.role || "owner",
        targetKind: target.kind, targetId: target.accountId, targetName: target.displayName,
        details: `Logged in as ${target.displayName} (${target.email})`,
        ip: "session",
      }, ...ls].slice(0, 500);
    });
  }, []);
  const endImpersonation = useCallback(() => {
    setImpersonation((current) => {
      if (!current) return null;
      const startedAt = current.startedAt ? new Date(current.startedAt) : null;
      const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000)) : null;
      setAuditLogs(ls => {
        const nextNum = ls.reduce((m, l) => {
          const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 1000) + 1;
        return [{
          id: `AUD-${nextNum}`,
          ts: new Date().toISOString(),
          kind: "impersonate-end",
          actorId: current.by?.id || "ADM-?", actorName: current.by?.name || "Operator", actorRole: current.by?.role || "owner",
          targetKind: current.kind, targetId: current.accountId, targetName: current.displayName,
          details: minutes ? `Ended impersonation after ${minutes} minute${minutes === 1 ? "" : "s"}` : "Ended impersonation",
          ip: "session",
        }, ...ls].slice(0, 500);
      });
      return null;
    });
  }, []);

  // Staff sign-in. Validates email + password against the live adminUsers
  // store and refuses suspended accounts. On success, sets the session and
  // appends a `login` event to the audit log.
  const signInStaff = useCallback(async (email, password) => {
    const lower = (email || "").trim().toLowerCase();

    // Build the operator session + login audit for an already-validated,
    // ACTIVE staff record. Each path below checks status before calling this.
    const buildSession = (user) => {
      const session = {
        id: user.id, name: user.name, email: user.email, role: user.role,
        permissions: user.permissions || [], mfa: user.mfa, title: user.title,
        avatarColor: user.avatarColor, signedInAt: new Date().toISOString(),
      };
      setStaffSession(session);
      setAdminUsers((us) => us.map((u) => u.id === user.id ? { ...u, lastLogin: session.signedInAt } : u));
      setAuditLogs((ls) => {
        const nextNum = ls.reduce((m, l) => {
          const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 1000) + 1;
        return [{
          id: `AUD-${nextNum}`, ts: session.signedInAt, kind: "login",
          actorId: user.id, actorName: user.name, actorRole: user.role,
          targetKind: null, targetId: null, targetName: null,
          details: `Signed in to admin portal${user.mfa ? " · MFA verified" : " · password"}`,
          ip: "session",
        }, ...ls].slice(0, 500);
      });
      return { ok: true, user, session };
    };

    // 1) PRIMARY — validate against the database via Supabase Auth. This works
    //    from a cold / cleared browser because it does NOT depend on the client
    //    being able to read admin_users (staff-only under RLS until signed in).
    //    The real, DB-stored password is the source of truth.
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: lower, password });
        if (!error && data?.session) {
          // Authenticated. Resolve the operator profile (role / permissions).
          // The bundled seed already carries the canonical accounts, so this
          // usually resolves instantly; otherwise fetch now that we're an
          // authenticated staff member (RLS now permits reading admin_users).
          let user = adminUsers.find((u) => (u.email || "").toLowerCase() === lower);
          if (!user) {
            try {
              const rows = await fetchAll("admin_users");
              if (Array.isArray(rows) && rows.length > 0) {
                setAdminUsers(rows);
                writeAdminUsersCache(rows);
                user = rows.find((u) => (u.email || "").toLowerCase() === lower);
              }
            } catch (_) { /* fall through to the no-profile guard */ }
          }
          if (!user) {
            await supabase.auth.signOut().catch(() => {});
            return { ok: false, error: "No operator profile is linked to this account." };
          }
          if (user.status !== "active") {
            await supabase.auth.signOut().catch(() => {});
            return { ok: false, error: "This account is suspended. Contact an Owner to reactivate." };
          }
          return buildSession(user);
        }
        // Credentials rejected by Supabase — fall through to the legacy local
        // compare so seed / dev / offline + built-in accounts still sign in.
      } catch (_) { /* auth service unreachable — fall through to local */ }
    }

    // 2) FALLBACK — legacy client-side compare against the loaded admin_users
    //    (local dev with no Supabase, seed mode, built-in accounts).
    const user = adminUsers.find((u) => (u.email || "").toLowerCase() === lower);
    if (!user || user.password !== password) {
      return { ok: false, error: "Email or password didn't match." };
    }
    if (user.status !== "active") {
      return { ok: false, error: "This account is suspended. Contact an Owner to reactivate." };
    }
    // Best-effort Supabase auth so RLS-gated writes land in the DB (dev/seed).
    if (SUPABASE_CONFIGURED) {
      supabase.auth.signInWithPassword({ email: user.email, password }).then(({ error }) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[supabase] auth failed for", user.email, "—", error.message);
        }
      });
    }
    return buildSession(user);
  }, [adminUsers]);

  const signOutStaff = useCallback(() => {
    // Mirror the local sign-out into Supabase so the next visitor doesn't
    // inherit the previous operator's session.
    if (SUPABASE_CONFIGURED) {
      supabase.auth.signOut().catch(() => { /* best-effort */ });
    }
    setStaffSession((current) => {
      if (!current) return null;
      const startedAt = current.signedInAt ? new Date(current.signedInAt) : null;
      const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000)) : null;
      setAuditLogs(ls => {
        const nextNum = ls.reduce((m, l) => {
          const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 1000) + 1;
        return [{
          id: `AUD-${nextNum}`, ts: new Date().toISOString(),
          kind: "logout",
          actorId: current.id, actorName: current.name, actorRole: current.role,
          targetKind: null, targetId: null, targetName: null,
          details: minutes ? `Signed out · session ${minutes} minute${minutes === 1 ? "" : "s"}` : "Signed out",
          ip: "session",
        }, ...ls].slice(0, 500);
      });
      return null;
    });
    // Defensively clear any active staff impersonation alongside the sign-out.
    setStaffImpersonation(null);
  }, []);

  // Staff-on-staff impersonation — Owner-only. Stashes the current operator
  // session (the Owner) in `staffImpersonation.originalSession` and swaps
  // `staffSession` to the target user's session shape so every downstream
  // permission check sees the target's scopes. End is symmetric: restore
  // original session, audit, clear flag.
  //
  // Refuses to act when:
  //   • caller isn't the active session
  //   • target is the same user (no-op)
  //   • target is suspended (matching signInStaff's policy)
  //   • there's already an active impersonation (must end the current one first)
  const startStaffImpersonation = useCallback((targetUser) => {
    if (!targetUser) return { ok: false, error: "Pick a user to impersonate." };
    // Read the current session synchronously via the functional setter so we
    // can validate the actor + target before mutating any state.
    let result = { ok: false, error: "Sign in first." };
    setStaffSession((current) => {
      if (!current) { result = { ok: false, error: "Sign in first." }; return current; }
      if (current.role !== "owner") {
        result = { ok: false, error: "Only the Owner can log in as a teammate." };
        return current;
      }
      if (current.id === targetUser.id) {
        result = { ok: false, error: "You're already signed in as this user." };
        return current;
      }
      if (targetUser.status !== "active") {
        result = { ok: false, error: "Suspended accounts can't be impersonated. Reactivate first." };
        return current;
      }
      const startedAt = new Date().toISOString();
      const targetSession = {
        id: targetUser.id, name: targetUser.name, email: targetUser.email,
        role: targetUser.role, permissions: targetUser.permissions || [],
        mfa: targetUser.mfa, title: targetUser.title,
        avatarColor: targetUser.avatarColor, signedInAt: startedAt,
      };
      // Stash the Owner's original session so end-impersonation can restore it.
      setStaffImpersonation({
        originalSession: current,
        targetUser: { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role, title: targetUser.title },
        by: { id: current.id, name: current.name, role: current.role },
        startedAt,
      });
      // Audit: record the staff impersonation event.
      setAuditLogs(ls => {
        const nextNum = ls.reduce((m, l) => {
          const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 1000) + 1;
        return [{
          id: `AUD-${nextNum}`, ts: startedAt,
          kind: "staff-impersonate-start",
          actorId: current.id, actorName: current.name, actorRole: current.role,
          targetKind: "staff", targetId: targetUser.id, targetName: targetUser.name,
          details: `Logged in as ${targetUser.name} (${targetUser.title || targetUser.role})`,
          ip: "session",
        }, ...ls].slice(0, 500);
      });
      result = { ok: true, target: targetUser };
      return targetSession;
    });
    return result;
  }, []);

  const endStaffImpersonation = useCallback(() => {
    setStaffImpersonation((current) => {
      if (!current) return null;
      const startedAt = current.startedAt ? new Date(current.startedAt) : null;
      const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000)) : null;
      // Restore the Owner's original session.
      setStaffSession(current.originalSession || null);
      setAuditLogs(ls => {
        const nextNum = ls.reduce((m, l) => {
          const n = parseInt((l.id || "").replace(/^AUD-/, ""), 10);
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 1000) + 1;
        return [{
          id: `AUD-${nextNum}`, ts: new Date().toISOString(),
          kind: "staff-impersonate-end",
          actorId: current.by?.id || "ADM-?", actorName: current.by?.name || "Owner", actorRole: current.by?.role || "owner",
          targetKind: "staff", targetId: current.targetUser?.id, targetName: current.targetUser?.name,
          details: minutes ? `Ended staff impersonation after ${minutes} minute${minutes === 1 ? "" : "s"}` : "Ended staff impersonation",
          ip: "session",
        }, ...ls].slice(0, 500);
      });
      return null;
    });
  }, []);

  // Prospect CRUD. `addProspect` auto-stamps the id, capturedAt, and a
  // sensible default status; `setProspectStatus` is the convenience helper
  // used when an operator advances a lead from the pipeline funnel.
  const addProspect = useCallback((prospect) => {
    let saved;
    setProspects(ps => {
      const prefix = prospect.kind === "agent" ? "PROS-2" : "PROS-1";
      const nextNum = ps.reduce((m, p) => {
        if (!p.id?.startsWith(prefix)) return m;
        const n = parseInt(p.id.replace(prefix, ""), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
      }, prospect.kind === "agent" ? 2000 : 1000) + 1;
      const id = prospect.id || `${prefix}${String(nextNum).padStart(3, "0").slice(-3)}`;
      saved = {
        status: "new",
        capturedAt: new Date().toISOString().slice(0, 10),
        capturedBy: prospect.capturedBy || "Operator",
        ...prospect, id,
      };
      return [saved, ...ps];
    });
    return saved;
  }, []);
  const updateProspect = useCallback((id, patch) => setProspects(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p)), []);
  const removeProspect = useCallback((id) => setProspects(ps => ps.filter(p => p.id !== id)), []);
  const setProspectStatus = useCallback((id, status) => setProspects(ps => ps.map(p => p.id === id ? { ...p, status } : p)), []);

  // Activity CRUD. `addActivity` auto-stamps id + createdAt; `completeActivity`
  // is a convenience helper that flips status to "completed" + fills
  // completedAt while letting the caller capture summary + outcome in one go.
  const addActivity = useCallback((activity) => setActivities(as => {
    const nextNum = as.reduce((m, a) => {
      const n = parseInt((a.id || "").replace(/^ACT-/, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1000) + 1;
    const id = activity.id || `ACT-${nextNum}`;
    const createdAt = activity.createdAt || new Date().toISOString();
    return [{
      status: "scheduled", outcome: null,
      ...activity, id, createdAt,
    }, ...as];
  }), []);
  const updateActivity = useCallback((id, patch) => setActivities(as => as.map(a => a.id === id ? { ...a, ...patch } : a)), []);
  const removeActivity = useCallback((id) => setActivities(as => as.filter(a => a.id !== id)), []);
  const completeActivity = useCallback((id, patch = {}) => setActivities(as => as.map(a => a.id === id ? {
    ...a, status: "completed",
    completedAt: a.completedAt || new Date().toISOString(),
    ...patch,
  } : a)), []);

  // Report-schedule CRUD. `addReportSchedule` auto-stamps id + createdAt;
  // `runReportSchedule` is the mock cron tick — appends a history entry,
  // refreshes lastRunAt/nextRunAt and lets callers know it "fired".
  const addReportSchedule = useCallback((schedule) => setReportSchedules(rs => {
    const nextNum = rs.reduce((m, s) => {
      const n = parseInt((s.id || "").replace(/^RPT-/, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0) + 1;
    const id = schedule.id || `RPT-${String(nextNum).padStart(3, "0")}`;
    return [{
      enabled: true, perSalesRep: false, recipients: [],
      createdAt: new Date().toISOString(), history: [],
      ...schedule, id,
    }, ...rs];
  }), []);
  const updateReportSchedule = useCallback((id, patch) =>
    setReportSchedules(rs => rs.map(s => s.id === id ? { ...s, ...patch } : s)), []);
  const removeReportSchedule = useCallback((id) =>
    setReportSchedules(rs => rs.filter(s => s.id !== id)), []);
  const toggleReportSchedule = useCallback((id) =>
    setReportSchedules(rs => rs.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)), []);
  const appendReportRun = useCallback((id, run) =>
    setReportSchedules(rs => rs.map(s => s.id === id ? {
      ...s,
      lastRunAt: run.runAt || new Date().toISOString(),
      nextRunAt: run.nextRunAt || s.nextRunAt,
      history: [{
        id: `RUN-${Math.floor(1000 + Math.random() * 9000)}`,
        runAt: new Date().toISOString(),
        status: "sent", recipients: (s.recipients || []).length, kind: "scheduled",
        ...run,
      }, ...(s.history || [])].slice(0, 50),
    } : s)), []);

  // Maintenance vendor CRUD.
  const addMaintenanceVendor = useCallback((vendor) => {
    let saved = null;
    setMaintenanceVendors(vs => {
      const nextNum = vs.reduce((m, v) => {
        const n = parseInt((v.id || "").replace(/^VND-/, ""), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
      }, 0) + 1;
      const id = vendor.id || `VND-${String(nextNum).padStart(3, "0")}`;
      saved = {
        categories: [], active: true, rating: 0, totalJobs: 0, avgResponseHours: 0,
        ...vendor, id,
      };
      return [saved, ...vs];
    });
    // Onboarding confirmation email to the vendor (fire-and-forget). Greets
    // the named contact when present, falls back to the company name.
    if (saved?.email) {
      sendTransactionalEmail({
        kind: "vendor-registered", to: saved.email,
        name: saved.contactName || saved.name,
        vendorId: saved.id, categories: saved.categories,
      });
    }
    return saved;
  }, []);
  const updateMaintenanceVendor = useCallback((id, patch) =>
    setMaintenanceVendors(vs => vs.map(v => v.id === id ? { ...v, ...patch } : v)), []);
  const removeMaintenanceVendor = useCallback((id) =>
    setMaintenanceVendors(vs => vs.filter(v => v.id !== id)), []);
  const toggleMaintenanceVendor = useCallback((id) =>
    setMaintenanceVendors(vs => vs.map(v => v.id === id ? { ...v, active: !v.active } : v)), []);

  // Maintenance job CRUD. `addMaintenanceJob` auto-generates the year-prefixed
  // ID (MNT-YYYY-#### so the year matches the createdAt automatically) and
  // seeds the history log with a "Reported" entry.
  const addMaintenanceJob = useCallback((job) => setMaintenanceJobs(js => {
    const yr = new Date().getFullYear();
    const prefix = `MNT-${yr}-`;
    const nextNum = js.reduce((m, j) => {
      if (!j.id?.startsWith(prefix)) return m;
      const n = parseInt(j.id.replace(prefix, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0) + 1;
    const id = job.id || `${prefix}${String(nextNum).padStart(4, "0")}`;
    const reportedAt = job.reportedAt || new Date().toISOString();
    const history = job.history || [{
      id: `h-${Date.now()}`, at: reportedAt,
      by: job.reportedByName || "Operator",
      action: `Reported${job.source ? ` · ${job.source.replace(/-/g, " ")}` : ""}`,
    }];
    return [{
      status: "reported", priority: "normal", source: "front-desk",
      parts: [], laborHours: 0, laborRate: 0, laborCost: 0, productCost: 0, totalCost: 0,
      ...job, id, reportedAt, history,
    }, ...js];
  }), []);
  const updateMaintenanceJob = useCallback((id, patch) =>
    setMaintenanceJobs(js => js.map(j => j.id === id ? { ...j, ...patch } : j)), []);
  const removeMaintenanceJob = useCallback((id) =>
    setMaintenanceJobs(js => js.filter(j => j.id !== id)), []);
  const appendMaintenanceEvent = useCallback((id, evt) =>
    setMaintenanceJobs(js => js.map(j => j.id === id ? {
      ...j, history: [...(j.history || []), {
        id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        at: evt.at || new Date().toISOString(),
        by: evt.by || "Operator",
        action: evt.action || "Updated",
      }],
    } : j)), []);
  // Room-unit CRUD. Number is the natural unique key; id stays stable
  // (RM-101 etc.) so external references survive renaming.
  const addRoomUnit = useCallback((unit) => setRoomUnits(us => {
    const number = String(unit.number || "").trim();
    if (!number) return us;
    if (us.some((x) => x.number === number)) return us; // dedupe by number
    const id = unit.id || `RM-${number}`;
    return [...us, {
      status: "active", view: "garden", accessible: false, connectingId: null, notes: "",
      ...unit, id, number,
    }];
  }), []);
  // Bulk add — used by the range generator. Skips duplicates silently.
  const addRoomUnits = useCallback((units) => setRoomUnits(us => {
    const taken = new Set(us.map((u) => u.number));
    const fresh = [];
    units.forEach((u) => {
      const number = String(u.number || "").trim();
      if (!number || taken.has(number)) return;
      taken.add(number);
      fresh.push({
        status: "active", view: "garden", accessible: false, connectingId: null, notes: "",
        ...u, id: u.id || `RM-${number}`, number,
      });
    });
    return [...us, ...fresh];
  }), []);
  const updateRoomUnit = useCallback((id, patch) =>
    setRoomUnits(us => us.map(u => u.id === id ? { ...u, ...patch } : u)), []);
  const removeRoomUnit = useCallback((id) =>
    setRoomUnits(us => us.filter(u => u.id !== id)), []);
  const setRoomUnitStatus = useCallback((id, status) =>
    setRoomUnits(us => us.map(u => u.id === id ? { ...u, status } : u)), []);

  // Move a job through its lifecycle and append the matching history entry.
  const transitionMaintenanceJob = useCallback((id, status, by = "Operator", note) =>
    setMaintenanceJobs(js => js.map(j => {
      if (j.id !== id) return j;
      const next = { ...j, status };
      const now = new Date().toISOString();
      if (status === "in-progress") next.startedAt = now;
      if (status === "completed")   { next.completedAt = now; next.completedBy = by; }
      next.history = [...(j.history || []), {
        id: `h-${Date.now()}`, at: now, by,
        action: `Status → ${status.replace(/-/g, " ")}${note ? ` · ${note}` : ""}`,
      }];
      return next;
    })), []);

  const duplicateEmailTemplate = useCallback((id) => setEmailTemplates(ts => {
    const src = ts.find(t => t.id === id);
    if (!src) return ts;
    const copy = {
      ...src,
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${src.name} · copy`,
      builtIn: false,
      active: false,
    };
    return [...ts, copy];
  }), []);

  // Member CRUD. Member id encodes the tier letter (S/G/P) + a random suffix
  // so the format stays consistent with the seed data.
  const addMember = useCallback((member) => {
    const tierLetter = (member.tier || "silver")[0].toUpperCase();
    const id = member.id || `LS-${tierLetter}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const joined = member.joined || new Date().toISOString().slice(0, 10);
    const saved = { ...member, id, joined, points: member.points || 0, lifetimeNights: member.lifetimeNights || 0 };
    setMembers(ms => [saved, ...ms]);
    // Direct write — anon LS Privilege joins go straight to DB (the bulk
    // sync's UPDATE branch is anon-disallowed, so we can't rely on it
    // for new-row inserts).
    upsertRow("members", saved);
    return saved;
  }, []);
  const updateMember = useCallback((id, patch) => {
    let updated = null;
    setMembers(ms => ms.map(m => {
      if (m.id !== id) return m;
      updated = { ...m, ...patch };
      return updated;
    }));
    // A password change on a member record (self-service profile update or
    // an admin reset) triggers a security-notice email to the member.
    if (patch && patch.password && updated?.email) {
      sendTransactionalEmail({
        kind: "password-changed", to: updated.email,
        name: updated.name || updated.email, portal: "LS Privilege",
      });
    }
  }, []);
  const removeMember = useCallback((id) => setMembers(ms => ms.filter(m => m.id !== id)), []);

  // ── Gift cards — actions ─────────────────────────────────────────────
  // addGiftCard: stamps id, code, purchaseDate, validUntil + status.
  // Returns the saved record so callers can show the code in a toast.
  const addGiftCard = useCallback((card) => {
    let saved = null;
    setGiftCards((prev) => {
      const purchaseISO = (card.purchaseDate || new Date().toISOString().slice(0, 10));
      const valid = new Date(purchaseISO);
      valid.setDate(valid.getDate() + GIFT_CARD_VALIDITY_DAYS);
      const id = card.id || `GC-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`;
      const code = card.code || generateGiftCardCode(prev);
      const next = {
        nightsUsed: 0,
        status: "issued",
        redemptionHistory: [],
        purchaseDate: purchaseISO,
        validUntil: valid.toISOString().slice(0, 10),
        ...card,
        id, code,
      };
      saved = next;
      return [next, ...prev];
    });
    return saved;
  }, []);

  // Patch a single card — used by the admin edit drawer for status
  // flips, recipient corrections, message edits, etc.
  const updateGiftCard = useCallback((id, patch) => {
    setGiftCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeGiftCard = useCallback((id) => {
    setGiftCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Redeem (hold) `nights` against a card by id. Increments nightsUsed,
  // appends a redemptionHistory entry, flips status to "redeemed" when
  // fully consumed. IDEMPOTENT per bookingId — if a redemption entry
  // already exists for this booking, it's a no-op, so a re-render or a
  // double-submit can never double-debit the card. Caller computes the
  // night count (nights covered by the card, not overflow).
  const redeemGiftCard = useCallback(({ id, nights, bookingId, savings }) => {
    setGiftCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      // Guard against double-debit: skip when this booking already has a
      // redemption entry on the card.
      if (bookingId && (c.redemptionHistory || []).some((e) => e.bookingId === bookingId)) {
        return c;
      }
      const used = (c.nightsUsed || 0) + (Number(nights) || 0);
      const isDone = used >= (c.totalNights || 0);
      const entry = {
        bookingId: bookingId || null,
        redeemedAt: new Date().toISOString(),
        nights: Number(nights) || 0,
        savings: Number(savings) || 0,
      };
      return {
        ...c,
        nightsUsed: used,
        status: isDone ? "redeemed" : c.status,
        redemptionHistory: [...(c.redemptionHistory || []), entry],
      };
    }));
  }, []);

  // Release a previously-held redemption when its booking is cancelled /
  // rejected / sold-out. Finds whichever card carries a redemption entry
  // for `bookingId`, removes that entry, credits the nights back to the
  // balance, and un-redeems the status if it had been fully consumed.
  // Safe to call for non-gift-card bookings (no matching entry → no-op).
  const releaseGiftCardForBooking = useCallback((bookingId) => {
    if (!bookingId) return;
    setGiftCards((prev) => prev.map((c) => {
      const hist = c.redemptionHistory || [];
      const entry = hist.find((e) => e.bookingId === bookingId);
      if (!entry) return c;
      const used = Math.max(0, (c.nightsUsed || 0) - (Number(entry.nights) || 0));
      const nextStatus = (c.status === "redeemed" && used < (c.totalNights || 0)) ? "issued" : c.status;
      return {
        ...c,
        nightsUsed: used,
        status: nextStatus,
        redemptionHistory: hist.filter((e) => e.bookingId !== bookingId),
      };
    }));
  }, []);

  // ─── Member → guest transfer ─────────────────────────────────────────
  //
  // A member who's holding an issued gift card can transfer (= hand off)
  // its remaining nights to a non-member guest by name + email + mobile.
  // The card stays on the original member's profile as the original copy
  // — the member retains it for re-verification — but the active
  // bearer becomes the guest. The guest can redeem at check-in / by
  // email / on WhatsApp; the front desk verifies the guest's contact
  // details against what's printed on the card.
  //
  // Implementation:
  //   • Patch the card with `transferredTo: { name, email, phone }`
  //     and an isoFormat `transferredAt` timestamp.
  //   • Carry a `transferHistory[]` so multiple hand-offs (e.g. guest
  //     reassignment before redemption) are auditable. The most recent
  //     entry is the live bearer.
  //   • Set `verifiedBy` to null — admin must explicitly mark the guest
  //     verified at redemption (front desk checks ID against the card).
  //   • Push a notification + audit log so admin visibility is automatic.
  //
  // The signature accepts the member who initiated the transfer as
  // `transferredBy` so the audit trail can attribute the action even
  // when the call originates from an impersonation context.
  const transferGiftCard = useCallback(({ id, guest, transferredBy }) => {
    if (!id || !guest) return null;
    const name  = (guest.name  || "").trim();
    const email = (guest.email || "").trim();
    const phone = (guest.phone || "").trim();
    if (!name || !email || !phone) {
      // eslint-disable-next-line no-console
      console.warn("[gift-card] transferGiftCard rejected — name, email, and phone are all required.");
      return null;
    }
    const now = new Date().toISOString();
    let savedCard = null;
    setGiftCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const entry = {
        name, email, phone,
        transferredAt: now,
        transferredBy: transferredBy
          ? { id: transferredBy.id, name: transferredBy.name, email: transferredBy.email }
          : null,
        verifiedBy: null,   // staff marks this once they sight ID at check-in
        verifiedAt: null,
      };
      const updated = {
        ...c,
        transferredTo: { name, email, phone, transferredAt: now },
        transferHistory: [...(c.transferHistory || []), entry],
      };
      savedCard = updated;
      return updated;
    }));
    return savedCard;
  }, []);

  // Admin-side verification at redemption. Stamps the latest
  // transferHistory entry with verifiedBy / verifiedAt so the audit
  // trail shows who at the front desk vouched for the guest's ID.
  const verifyGiftCardTransfer = useCallback(({ id, verifiedBy }) => {
    if (!id || !verifiedBy) return null;
    const now = new Date().toISOString();
    let savedCard = null;
    setGiftCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const history = Array.isArray(c.transferHistory) ? c.transferHistory : [];
      if (history.length === 0) return c;
      const lastIdx = history.length - 1;
      const updated = {
        ...c,
        transferHistory: history.map((h, i) => i === lastIdx
          ? { ...h, verifiedAt: now, verifiedBy: { id: verifiedBy.id, name: verifiedBy.name } }
          : h),
      };
      savedCard = updated;
      return updated;
    }));
    return savedCard;
  }, []);

  // Tax patterns — apply, save current, remove (custom only).
  const applyTaxPattern = useCallback((id) => setTaxPatterns(ps => {
    const pattern = ps.find(p => p.id === id);
    if (pattern) { setTax({ ...pattern.config }); setActivePatternId(id); }
    return ps;
  }), []);
  const saveTaxPattern = useCallback(({ name, description }) => {
    const id = `custom-${Date.now()}`;
    setTaxPatterns(ps => [...ps, {
      id, name, description: description || "Custom pattern saved from current tax components.",
      config: { ...tax }, builtIn: false,
    }]);
    setActivePatternId(id);
    return id;
  }, [tax]);
  // Remove any pattern (including built-in). Built-ins reappear after refresh
  // since they're seeded from a constant — that's the safety net.
  const removeTaxPattern = useCallback((id) => setTaxPatterns(ps => ps.filter(p => p.id !== id)), []);

  // Resolve the cc/bcc copy-list configured on the active email template
  // for a given trigger event (e.g. "booking.confirmed"). This is how the
  // internal mailboxes BCC'd on a template — front office / GM — actually
  // get copied on the real auto-send. Returns {} when no active template
  // matches or it carries no cc/bcc, so callers can spread it unconditionally.
  const templateCopyFor = useCallback((event, fallbackEvents = []) => {
    // Try the requested event first, then any fallback events, so a status
    // that has no dedicated template (e.g. on-request bookings, which have
    // no "booking.created" template) still inherits the right copy-list
    // instead of silently dropping the BCC.
    const tryEvents = [event, ...fallbackEvents].filter(Boolean);
    let tpl = null;
    for (const ev of tryEvents) {
      tpl = (emailTemplates || []).find(
        (t) => t && t.active !== false && t.trigger && t.trigger.event === ev
      );
      if (tpl) break;
    }
    const out = {};
    if (tpl?.cc && String(tpl.cc).trim())   out.cc  = tpl.cc;
    if (tpl?.bcc && String(tpl.bcc).trim()) out.bcc = tpl.bcc;
    return out;
  }, [emailTemplates]);

  // Add a booking record (used by "Book on behalf" flows + the public
  // walk-up booking modal).
  const addBooking = useCallback((booking) => {
    const id = booking.id || `LS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // Stamp a creation timestamp so the admin booking list can sort
    // newest-first without falling back to id heuristics. Preserve any
    // caller-supplied value (e.g. when re-creating a deleted record).
    const createdAt = booking.createdAt || new Date().toISOString();
    const saved = { ...booking, id, createdAt };
    setBookings(bs => [saved, ...bs]);
    // Direct write — anon homepage bookings go straight to DB (the bulk
    // sync's UPDATE branch is anon-disallowed, so we can't rely on it).
    // For authenticated callers this is also fine — they get the same
    // row written + the eventual bulk-sync as a cleanup pass.
    upsertRow("bookings", saved);
    // Award B2B partner loyalty points if this is a corporate/agency booking
    // created already in a qualifying status (the corporate drawer auto-
    // confirms when inventory is free). No-op unless the linked account has
    // loyalty enabled; idempotent via the account ledger.
    if ((saved.source === "corporate" || saved.source === "agent") && ACCRUAL_STATUSES.has(saved.status)) {
      accruePartnerPoints(saved);
    }
    // Emit notifications using the latest agreements/agencies/members so the
    // recipient resolver matches by accountId / agencyId / email correctly.
    setTimeout(() => {
      appendNotifications(notifyBookingCreated(saved, { agreements, agencies, members }));
    }, 0);
    // Fire the real confirmation email (fire-and-forget). The body adapts to
    // the status (confirmed → "confirmed", on-request → "received, pending").
    // The suite label is resolved here where we have the rooms list; the server
    // fills in the rest. A slow/unconfigured mailer never blocks the booking.
    //
    // Recipient resolution copies the booking PARTNER, not just the guest:
    //   • Agent / corporate bookings CC the agency's / company's portal
    //     contacts so the booker is always notified.
    //   • Agent bookings frequently carry NO guest email (the agency books on
    //     behalf), so when there's no guest email the partner contact becomes
    //     the primary recipient — otherwise the booking would send no mail at
    //     all. We only skip entirely when there is no addressable contact.
    const partnerEmails = bookingCopyEmails(saved, { agencies, agreements, members });
    const primaryTo = saved.email || partnerEmails[0] || "";
    if (primaryTo) {
      const room = rooms.find((r) => r.id === saved.roomId);
      const status = saved.status || "confirmed";
      // Both confirmed AND on-request new bookings resolve their internal
      // copy-list from the "booking.confirmed" template — there is no
      // dedicated "booking.created" template, so an on-request booking would
      // otherwise drop the BCC entirely and the front desk would never be
      // copied. BOOKING_BCC is a hard floor so the front desk is always
      // copied even if the template were edited to clear its BCC.
      const copy = templateCopyFor("booking.confirmed");
      if (!copy.bcc) copy.bcc = BOOKING_BCC;
      // CC every partner contact that isn't already the primary recipient.
      const extraCc = partnerEmails.filter((e) => e.toLowerCase() !== primaryTo.toLowerCase());
      if (extraCc.length) copy.cc = mergeEmailList(copy.cc, extraCc);
      sendTransactionalEmail({
        kind: "booking-new",
        to: primaryTo,
        name: saved.guest,
        bookingId: saved.id,
        suite: room ? resolveRoomLabel(room) : (saved.roomId || undefined),
        checkIn: saved.checkIn,
        checkOut: saved.checkOut,
        nights: saved.nights,
        total: saved.total,
        status,
        hotelConfirmationNo: saved.hotelConfirmationNo || undefined,
        ...copy,
      });
    }
    return saved;
  }, [agreements, agencies, members, appendNotifications, rooms, templateCopyFor, accruePartnerPoints]);

  // Booking update — diff status before/after to emit a status-change
  // notification when the booking transitions (confirmed → in-house, etc.).
  const updateBooking = useCallback((id, patch) => {
    let prev = null, next = null;
    setBookings(bs => bs.map(b => {
      if (b.id !== id) return b;
      prev = b;
      next = { ...b, ...patch };
      return next;
    }));
    if (prev && next && prev.status !== next.status) {
      // Award B2B partner points when a corporate/agency booking transitions
      // into a qualifying status (e.g. on-request → confirmed at the front
      // desk, or → checked-out). Idempotent — never double-awards.
      if ((next.source === "corporate" || next.source === "agent") && ACCRUAL_STATUSES.has(next.status)) {
        accruePartnerPoints(next);
      }
      setTimeout(() => {
        appendNotifications(notifyBookingStatusChange(prev, next, { agreements, agencies, members }));
      }, 0);
      // Real email on the status transition (fire-and-forget). The body's
      // closing line is tailored per status (confirmed / cancelled / rejected /
      // in-house / checkout) server-side. Recipient resolution mirrors
      // addBooking: the booking PARTNER (agency/company) is copied, and on a
      // partner booking with no guest email the partner contact is the primary
      // recipient so status changes still reach the booker.
      const partnerEmails = bookingCopyEmails(next, { agencies, agreements, members });
      const primaryTo = next.email || partnerEmails[0] || "";
      if (primaryTo) {
        const room = rooms.find((r) => r.id === next.roomId);
        // Map the new status → its lifecycle template event so the internal
        // copy-list (cc/bcc) is carried onto the send. Event names must match
        // the actual templates (booking.checkinday / booking.checkedout —
        // NOT booking.checkin/checkout). Statuses without a dedicated
        // template (on-request, rejected, sold-out) fall back to the
        // booking.confirmed copy-list, and BOOKING_BCC is a hard floor so the
        // front desk is copied on EVERY booking status change regardless.
        const EVENT_BY_STATUS = {
          confirmed: "booking.confirmed",
          "in-house": "booking.checkinday", inhouse: "booking.checkinday",
          "checked-out": "booking.checkedout", checkout: "booking.checkedout",
          cancelled: "booking.cancelled", canceled: "booking.cancelled",
          rejected: "booking.cancelled", "sold-out": "booking.cancelled", soldout: "booking.cancelled",
          "on-request": "booking.confirmed", onrequest: "booking.confirmed",
        };
        const event = EVENT_BY_STATUS[String(next.status || "").toLowerCase()] || "booking.confirmed";
        const copy = templateCopyFor(event, ["booking.confirmed"]);
        if (!copy.bcc) copy.bcc = BOOKING_BCC;
        const extraCc = partnerEmails.filter((e) => e.toLowerCase() !== primaryTo.toLowerCase());
        if (extraCc.length) copy.cc = mergeEmailList(copy.cc, extraCc);
        sendTransactionalEmail({
          kind: "booking-status",
          to: primaryTo,
          name: next.guest,
          bookingId: next.id,
          suite: room ? resolveRoomLabel(room) : (next.roomId || undefined),
          checkIn: next.checkIn,
          checkOut: next.checkOut,
          toStatus: next.status,
          hotelConfirmationNo: next.hotelConfirmationNo || undefined,
          ...copy,
        });
      }
    }
  }, [agreements, agencies, members, appendNotifications, rooms, templateCopyFor, accruePartnerPoints]);
  const removeBooking = useCallback((id) => setBookings(bs => bs.filter(b => b.id !== id)), []);

  // Invoice CRUD. ID format keeps the YYYY-#### convention used by sample data.
  // Resolve who an invoice's PDF documents should reach + the partner contacts
  // to CC. Two cases:
  //   • Booking invoice → the booking guest (or invoice clientEmail), partner
  //     account contacts CC'd. Void/cancelled bookings return no recipient.
  //   • Standalone corporate/agency invoice (no booking — e.g. an agent
  //     commission invoice on Net-30 terms) → match the account by name and use
  //     its portal contacts. Member/gift-card standalone invoices are NOT
  //     auto-emailed here (they have their own flow).
  const resolveInvoiceRecipients = useCallback((inv) => {
    if (!inv) return { booking: null, primaryTo: "", cc: undefined };
    const booking = (inv.bookingId && inv.bookingId !== "—") ? bookings.find(b => b.id === inv.bookingId) : null;
    const VOID = new Set(["cancelled", "canceled", "void", "rejected", "sold-out", "soldout", "no-show", "noshow"]);
    if (booking && VOID.has(String(booking.status || "").toLowerCase())) return { booking, primaryTo: "", cc: undefined };

    // Collect candidate contact emails (deduped, case-insensitive).
    const dedupe = (arr) => {
      const seen = new Set(); const out = [];
      for (const raw of arr) { const e = String(raw || "").trim(); if (!e) continue; const k = e.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(e); }
      return out;
    };
    let contacts = [];
    if (booking) {
      contacts = bookingCopyEmails(booking, { agencies, agreements, members });
    } else {
      // Standalone — resolve the account by name, agent/corporate only.
      const nm = String(inv.clientName || "").trim().toLowerCase();
      let acct = null;
      if (inv.clientType === "agent")          acct = agencies.find(a => String(a.name || "").trim().toLowerCase() === nm);
      else if (inv.clientType === "corporate") acct = agreements.find(a => String(a.account || "").trim().toLowerCase() === nm);
      if (acct) contacts = dedupe([...(acct.users || []).map(u => u.email), acct.pocEmail]);
    }
    const primaryTo = (booking?.email || inv.clientEmail || contacts[0] || "").trim();
    const extraCc = dedupe(contacts).filter(e => e.toLowerCase() !== primaryTo.toLowerCase());
    return { booking, primaryTo, cc: extraCc.length ? extraCc.join(", ") : undefined };
  }, [bookings, agencies, agreements, members]);

  const addInvoice = useCallback((invoice) => {
    let saved;
    setInvoices(ivs => {
      const n = ivs.length + 341;
      const id = invoice.id || `INV-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
      saved = { id, status: "issued", paid: 0, ...invoice };
      return [saved, ...ivs];
    });
    setTimeout(() => {
      appendNotifications(notifyInvoiceIssued(saved, { agreements, agencies, members, bookings }));
    }, 0);
    // Auto-email the invoice PDF to the customer — booking invoices AND
    // standalone corporate/agency invoices (resolved by account name).
    // Fire-and-forget; a void booking, no resolvable recipient, or a zero-value
    // invoice is a silent no-op.
    setTimeout(() => {
      const { booking, primaryTo, cc } = resolveInvoiceRecipients(saved);
      const amount = saved.amount ?? booking?.total ?? 0;
      if (primaryTo && amount > 0) {
        emailBookingDocPdf("invoice", { booking, invoice: saved, tax, rooms, hotel: hotelInfo, currency: "BHD", to: primaryTo, cc });
      }
    }, 0);
  }, [agreements, agencies, members, bookings, appendNotifications, resolveInvoiceRecipients, tax, rooms, hotelInfo]);
  // Invoice update — diff status to emit paid / overdue / cancelled events.
  const updateInvoice = useCallback((id, patch) => {
    let prev = null, next = null;
    setInvoices(ivs => ivs.map(i => {
      if (i.id !== id) return i;
      prev = i;
      next = { ...i, ...patch };
      return next;
    }));
    if (prev && next && prev.status !== next.status) {
      setTimeout(() => {
        appendNotifications(notifyInvoiceStatusChange(prev, next, { agreements, agencies, members, bookings }));
      }, 0);
      // Paid-in-full → auto-email a PAYMENT RECEIPT PDF to the customer (the
      // operator chose "receipt only when fully settled"). Covers booking AND
      // standalone corporate/agency invoices — corporate terms mean the payment
      // often lands weeks later, and this fires whenever it's marked paid.
      if (String(next.status || "").toLowerCase() === "paid") {
        setTimeout(() => {
          const { booking, primaryTo, cc } = resolveInvoiceRecipients(next);
          if (primaryTo) {
            emailBookingDocPdf("receipt", { booking, invoice: next, tax, rooms, hotel: hotelInfo, currency: "BHD", to: primaryTo, cc });
          }
        }, 0);
      }
    }
  }, [agreements, agencies, members, bookings, appendNotifications, resolveInvoiceRecipients, tax, rooms, hotelInfo]);
  const removeInvoice = useCallback((id) => setInvoices(ivs => ivs.filter(i => i.id !== id)), []);

  // Manual "Email invoice/receipt (PDF)" — builds the branded PDF and emails it
  // to the booking's customer (partner contacts CC'd, Accounts BCC'd). Returns
  // the send promise so the caller can toast. `invoice` is optional context for
  // the document header (invoice no. / amount). Resolves null when there's no
  // recipient on file.
  const sendBookingDocPdf = useCallback((booking, kind, invoice) => {
    if (!booking) return Promise.resolve(null);
    const partnerEmails = bookingCopyEmails(booking, { agencies, agreements, members });
    const primaryTo = (booking.email || partnerEmails[0] || "").trim();
    if (!primaryTo) return Promise.resolve(null);
    const cc = partnerEmails.filter(e => e.toLowerCase() !== primaryTo.toLowerCase());
    return emailBookingDocPdf(kind, {
      booking, invoice, tax, rooms, hotel: hotelInfo, currency: "BHD",
      to: primaryTo, cc: cc.length ? cc.join(", ") : undefined,
    });
  }, [agencies, agreements, members, tax, rooms, hotelInfo]);

  // Extras CRUD.
  const upsertExtra = useCallback((extra) => setExtras(es => {
    const i = es.findIndex(e => e.id === extra.id);
    if (i >= 0) { const n = [...es]; n[i] = { ...n[i], ...extra }; return n; }
    const id = extra.id || `extra-${Date.now()}`;
    return [...es, { active: true, ...extra, id }];
  }), []);
  const removeExtra = useCallback((id) => setExtras(es => es.filter(e => e.id !== id)), []);
  const toggleExtra = useCallback((id) => setExtras(es => es.map(e => e.id === id ? { ...e, active: !e.active } : e)), []);

  // Add a payment record, used by Mark-as-paid flows. Also emits a
  // payment-received notification fanned out to staff + the linked
  // booking's customer (if any).
  const addPayment = useCallback((payment) => {
    let saved;
    setPayments(ps => {
      const id = payment.id || `PAY-${Math.floor(9000 + Math.random() * 1000)}`;
      saved = { id, status: "captured", ts: new Date().toISOString(), fee: 0, net: payment.amount, ...payment };
      return [saved, ...ps];
    });
    setTimeout(() => {
      appendNotifications(notifyPaymentReceived(saved, { agreements, agencies, members, bookings }));
    }, 0);
  }, [agreements, agencies, members, bookings, appendNotifications]);
  // Patch a payment record in place — used by the Payments detail drawer
  // for refund flips and any other status / metadata edit.
  const updatePayment = useCallback((id, patch) => {
    setPayments(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  // ── Gift card issuance — wraps addGiftCard with accounting glue ──────
  // Issues the card AND posts the matching invoice + payment so the
  // operator sees the full transaction in one shot. Both public Gift
  // Vouchers checkout and admin manual issuance route through this
  // action so accounting stays consistent.
  //
  //   issueGiftCard(payload, { paymentMethod }) → savedCard
  //
  // Invoice (kind: "gift_card")  — money owed by buyer for the prepaid
  //                                nights. Marked `paid` because the
  //                                buyer settles at purchase time.
  // Payment (status: "captured") — receipt for the buyer's payment.
  //                                Both records reference the card via
  //                                giftCardId + giftCardCode so the
  //                                admin folio can tie them together.
  const issueGiftCard = useCallback((card, opts = {}) => {
    const saved = addGiftCard(card);
    if (!saved) return null;
    const method = opts.paymentMethod || "card";
    const amount = Number(saved.paidAmount) || 0;
    if (amount > 0) {
      // Resolve the suite label via the centralised helper so custom
      // room types (set via Rooms & Rates → Add room type) show their
      // operator-set publicName instead of the raw slug. Reads the
      // current rooms slice from a ref so we don't have to add `rooms`
      // to this callback's dep array and re-create it on every render.
      const room = (roomsRef.current || []).find((r) => r.id === saved.roomId) || saved.roomId;
      const desc = `Gift card · ${saved.totalNights} nights at the ${resolveRoomLabel(room)} · ${saved.discountPct}% buyer discount`;
      try {
        addInvoice({
          clientType: "guest",
          clientName: saved.senderName || saved.recipientName || "Gift card buyer",
          clientEmail: saved.senderEmail || saved.recipientEmail || "",
          bookingId: null,
          giftCardId: saved.id,
          giftCardCode: saved.code,
          issued: saved.purchaseDate,
          due:    saved.purchaseDate,
          amount,
          paid:   amount,
          status: "paid",
          kind:   "gift_card",
          description: desc,
        });
      } catch (_) {}
      try {
        addPayment({
          bookingId: null,
          giftCardId: saved.id,
          giftCardCode: saved.code,
          amount,
          fee: 0,
          net: amount,
          method,
          status: "captured",
          ts: new Date().toISOString(),
          note: `Gift card purchase · ${saved.code} for ${saved.recipientName || "recipient"}`,
        });
      } catch (_) {}
    }
    return saved;
  }, [addGiftCard, addInvoice, addPayment]);

  // Reactive list of contracts (corporate + agency) that expire within the
  // next 15 days and are still active. Consumed by the Hotel Admin Dashboard
  // to surface a renewal-warning banner. Sorted by `daysLeft` ascending so
  // the most urgent renewals bubble to the top.
  const expiringContracts = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const fmt = (a, kind) => ({
      id: `expiry-${kind}-${a.id}`,
      kind, // "corporate" | "agent"
      accountId: a.id,
      accountName: kind === "corporate" ? (a.account || a.id) : (a.name || a.id),
      endsOn: a.endsOn,
      daysLeft: Math.ceil((new Date(a.endsOn) - now) / 86400000),
    });
    const corp = agreements
      .filter(a => a.endsOn && new Date(a.endsOn) <= threshold && new Date(a.endsOn) > now && a.status === "active")
      .map(a => fmt(a, "corporate"));
    const agt = agencies
      .filter(a => a.endsOn && new Date(a.endsOn) <= threshold && new Date(a.endsOn) > now && a.status === "active")
      .map(a => fmt(a, "agent"));
    return [...corp, ...agt].sort((x, y) => x.daysLeft - y.daysLeft);
  }, [agreements, agencies]);

  const value = useMemo(() => ({
    // data
    rooms, packages, tiers, tax, bookings, invoices, payments,
    agreements, agencies, members, calendar, loyalty, emailTemplates, rfps, channels, adminUsers, prospects, activities, reportSchedules,
    maintenanceVendors, maintenanceJobs, roomUnits,
    // active subset for the marketing site
    activePackages: packages.filter(p => p.active !== false),
    // setters / actions
    setRooms, updateRoom, addRoom, removeRoom,
    setPackages, upsertPackage, removePackage, togglePackage,
    setTiers, updateTier, toggleBenefit,
    // B2B partner loyalty (corporates + agencies)
    corporateTiers, agencyTiers, partnerLoyalty,
    setCorporateTiers, setAgencyTiers, setPartnerLoyalty,
    corporateTierActions, agencyTierActions,
    toggleAccountLoyalty, setAccountLoyaltyEnabled, adjustPartnerPoints, recomputePartnerTier,
    redeemPartnerPoints, issuePartnerGiftCard, addPartnerGiftCardBrand, updatePartnerGiftCardBrand, removePartnerGiftCardBrand,
    addTier, removeTier, moveTier,
    addBenefit, updateBenefit, removeBenefit,
    setTax, setTaxPatterns, taxPatterns, activePatternId, applyTaxPattern, saveTaxPattern, removeTaxPattern,
    setBookings,
    setInvoices, addInvoice, updateInvoice, removeInvoice, sendBookingDocPdf,
    setPayments, addPayment, updatePayment,
    setAgreements, upsertAgreement, removeAgreement,
    setAgencies, upsertAgency, removeAgency,
    registerPartnerAccount,
    expiringContracts,
    setEmailTemplates, upsertEmailTemplate, removeEmailTemplate, toggleEmailTemplate, duplicateEmailTemplate, templateCopyFor,
    setRfps, addRfp, upsertRfp, removeRfp, advanceRfp,
    setChannels, upsertChannel, removeChannel, toggleChannelStatus, appendChannelSyncEvent,
    setAdminUsers, addAdminUser, updateAdminUser, removeAdminUser, toggleAdminUserStatus, setAdminUserPassword,
    // Testing plan — assignments + per-phase progress + sign-off feedback
    testingPlanAssignments, assignTestingPlan, updateTestingPhase, updateTestingFeedback, removeTestingPlanAssignment,
    auditLogs, appendAuditLog, clearAuditLogs,
    impersonation, startImpersonation, endImpersonation,
    staffSession, signInStaff, signOutStaff, guestAuthSession, REAL_GUEST_AUTH,
    staffImpersonation, startStaffImpersonation, endStaffImpersonation,
    hotelInfo, updateHotelInfo, resetHotelInfo,
    eventSupplements, upsertEventSupplement, removeEventSupplement, resetEventSupplements,
    smtpConfig, updateSmtpConfig, resetSmtpConfig,
    siteContent, setSiteText, setSiteImage, resetSiteContent,
    setGalleryItems, addGalleryItem, updateGalleryItem, removeGalleryItem, moveGalleryItem, resetGallery,
    notifications, appendNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications,
    messages, addMessage, markThreadRead,
    setProspects, addProspect, updateProspect, removeProspect, setProspectStatus,
    setActivities, addActivity, updateActivity, removeActivity, completeActivity,
    setReportSchedules, addReportSchedule, updateReportSchedule, removeReportSchedule, toggleReportSchedule, appendReportRun,
    setMaintenanceVendors, addMaintenanceVendor, updateMaintenanceVendor, removeMaintenanceVendor, toggleMaintenanceVendor,
    setMaintenanceJobs, addMaintenanceJob, updateMaintenanceJob, removeMaintenanceJob, appendMaintenanceEvent, transitionMaintenanceJob,
    setRoomUnits, addRoomUnit, addRoomUnits, updateRoomUnit, removeRoomUnit, setRoomUnitStatus,
    setMembers, addMember, updateMember, removeMember,
    // Gift cards — advance-purchase night packs
    giftCards, setGiftCards, addGiftCard, issueGiftCard, updateGiftCard, removeGiftCard, redeemGiftCard, releaseGiftCardForBooking,
    transferGiftCard, verifyGiftCardTransfer,
    // Gift card tier master — admin-editable list of the preset bundles
    giftCardTiers, setGiftCardTiers, updateGiftCardTiers, resetGiftCardTiers,
    extras, activeExtras: extras.filter(e => e.active !== false), setExtras, upsertExtra, removeExtra, toggleExtra,
    setCalendar, setCalendarCell,
    setLoyalty,
    addBooking, updateBooking, removeBooking,
  }), [rooms, packages, tiers, tax, taxPatterns, activePatternId, bookings, invoices, payments, agreements, agencies, members, giftCards, extras, calendar, loyalty, emailTemplates, rfps, channels, adminUsers, prospects, activities, reportSchedules, maintenanceVendors, maintenanceJobs, updateRoom, addRoom, removeRoom, upsertPackage, removePackage, togglePackage, updateTier, toggleBenefit, addTier, removeTier, moveTier, addBenefit, updateBenefit, removeBenefit, setCalendarCell, upsertAgreement, removeAgreement, upsertAgency, removeAgency, expiringContracts, addMember, updateMember, removeMember, addGiftCard, issueGiftCard, updateGiftCard, removeGiftCard, redeemGiftCard, releaseGiftCardForBooking, giftCardTiers, updateGiftCardTiers, resetGiftCardTiers, addBooking, updateBooking, removeBooking, applyTaxPattern, saveTaxPattern, removeTaxPattern, addInvoice, updateInvoice, removeInvoice, sendBookingDocPdf, addPayment, updatePayment, upsertExtra, removeExtra, toggleExtra, upsertEmailTemplate, removeEmailTemplate, toggleEmailTemplate, duplicateEmailTemplate, templateCopyFor, addRfp, upsertRfp, removeRfp, advanceRfp, upsertChannel, removeChannel, toggleChannelStatus, appendChannelSyncEvent, addAdminUser, updateAdminUser, removeAdminUser, toggleAdminUserStatus, setAdminUserPassword, testingPlanAssignments, assignTestingPlan, updateTestingPhase, updateTestingFeedback, removeTestingPlanAssignment, auditLogs, appendAuditLog, clearAuditLogs, impersonation, startImpersonation, endImpersonation, staffSession, signInStaff, signOutStaff, guestAuthSession, staffImpersonation, startStaffImpersonation, endStaffImpersonation, hotelInfo, updateHotelInfo, resetHotelInfo, eventSupplements, upsertEventSupplement, removeEventSupplement, resetEventSupplements, smtpConfig, updateSmtpConfig, resetSmtpConfig, siteContent, setSiteText, setSiteImage, resetSiteContent, setGalleryItems, addGalleryItem, updateGalleryItem, removeGalleryItem, moveGalleryItem, resetGallery, notifications, appendNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications, messages, addMessage, markThreadRead, addProspect, updateProspect, removeProspect, setProspectStatus, addActivity, updateActivity, removeActivity, completeActivity, addReportSchedule, updateReportSchedule, removeReportSchedule, toggleReportSchedule, appendReportRun, addMaintenanceVendor, updateMaintenanceVendor, removeMaintenanceVendor, toggleMaintenanceVendor, addMaintenanceJob, updateMaintenanceJob, removeMaintenanceJob, appendMaintenanceEvent, transitionMaintenanceJob, roomUnits, addRoomUnit, addRoomUnits, updateRoomUnit, removeRoomUnit, setRoomUnitStatus, corporateTiers, agencyTiers, partnerLoyalty, corporateTierActions, agencyTierActions, toggleAccountLoyalty, setAccountLoyaltyEnabled, adjustPartnerPoints, recomputePartnerTier, redeemPartnerPoints, issuePartnerGiftCard, addPartnerGiftCardBrand, updatePartnerGiftCardBrand, removePartnerGiftCardBrand, registerPartnerAccount]);

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useData must be inside <DataProvider>");
  return ctx;
}
