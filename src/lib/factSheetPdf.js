// factSheetPdf.js — branded one-page Fact Sheet PDF for sales intro emails.
//
// Built dynamically from live hotel info + rooms data so it stays in sync as
// the operator edits property details or pricing in admin — no manual upload
// step, no stale figures. Renders with the same vector jsPDF stack used by the
// invoice / receipt builder (no rasterisation, ~10 KB output) and matches the
// charcoal + gold brand palette.

import { jsPDF } from "jspdf";

const INK   = [21, 22, 26];     // C.ink
const GOLD  = [201, 169, 97];   // C.gold
const MUTED = [122, 116, 100];
const HAIR  = [220, 215, 200];
const GREEN = [22, 163, 74];

const safe = (s) => (s == null ? "" : String(s));
const money = (n, code = "BHD") => `${code} ${Number(n || 0).toFixed(3)}`;

const HOTEL_FALLBACK = {
  name: "The Lodge Suites",
  legal: "The Lodge Suites W.L.L.",
  address: "Building 916, Road 4019, Block 340",
  area: "Shabab Avenue, Juffair, Manama",
  country: "Kingdom of Bahrain",
  phone: "+973 1616 8146",
  whatsapp: "+973 3306 9641",
  email: "frontoffice@thelodgesuites.com",
  emailReservations: "reservations@thelodgesuites.com",
  emailSales: "sales@exploremena.com",
  website: "www.thelodgesuites.com",
  checkIn: "14:00",
  checkOut: "12:00",
};

// Default amenities shown on the fact sheet when the hotel record doesn't
// override them. These describe the property as a whole, not a single suite.
const DEFAULT_AMENITIES = [
  "Furnished kitchenette in every suite",
  "55\" Smart TV · complimentary high-speed Wi-Fi",
  "Soundproofed windows for restful stays",
  "Daily housekeeping · 24/7 reception",
  "On-site parking · 24/7 front office",
  "Meeting & conference room available on request",
  "Walking distance to Juffair restaurants & retail",
];

const PARTNER_BENEFITS = [
  "Negotiated corporate / travel-agent rates with direct billing on approved credit",
  "One complimentary stay (up to 2 nights) — subject to availability, excluding weekends & public holidays",
  "Complimentary use of the meeting / conference room for guests staying with us",
  "Dedicated sales contact for proposals, site visits and event enquiries",
];

// buildFactSheetPdf — returns { base64, filename }.
// opts: { hotel, rooms, currency = "BHD" }
export function buildFactSheetPdf({ hotel, rooms = [], currency = "BHD" } = {}) {
  const H = { ...HOTEL_FALLBACK, ...(hotel || {}) };
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = 210, M = 18, RIGHT = PW - M;
  let y = 20;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(safe(H.name), M, y);

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("FACT SHEET", RIGHT, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  if (H.tagline) doc.text(safe(H.tagline), RIGHT, y + 5, { align: "right" });

  doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
  doc.text(safe(H.legal), M, y + 6);

  y += 12;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(M, y, RIGHT, y);
  y += 8;

  // ── Property overview ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("THE PROPERTY", M, y);
  y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
  const blurb = `${safe(H.name)} is a premium all-suite property located in the heart of ${safe(H.area) || "Manama"}, offering spacious accommodations and personalised hospitality services tailored to the needs of both business and leisure travellers. Every suite is equipped with a furnished kitchenette and modern amenities, ideal for corporate and extended-stay guests.`;
  const lines = doc.splitTextToSize(blurb, RIGHT - M);
  doc.text(lines, M, y);
  y += lines.length * 4.6 + 4;

  // ── Suites + rates table ──────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("SUITE TYPES & RATES", M, y);
  y += 4;

  // Header strip
  doc.setFillColor(...INK); doc.rect(M, y, RIGHT - M, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text("SUITE", M + 3, y + 5.3);
  doc.text("OCCUPANCY", M + 110, y + 5.3);
  doc.text("FROM / NIGHT", RIGHT - 3, y + 5.3, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
  const activeRooms = (rooms || []).filter((r) => r && !r.archived && Number(r.price ?? r.rateWeekday ?? 0) > 0);
  // Sort cheapest first — matches the public site ordering.
  activeRooms.sort((a, b) => Number(a.price ?? a.rateWeekday ?? 0) - Number(b.price ?? b.rateWeekday ?? 0));
  const ROW_H = 9;
  activeRooms.forEach((r) => {
    const label = safe(r.publicName || r.name || r.id);
    const occ = r.occupancy ? `Up to ${r.occupancy} guest${r.occupancy === 1 ? "" : "s"}` : "";
    const rate = Number(r.price ?? r.rateWeekday ?? 0);
    doc.setFont("helvetica", "bold"); doc.text(label, M + 3, y + 5.6);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
    if (occ) doc.text(occ, M + 110, y + 5.6);
    doc.setTextColor(...INK); doc.setFont("helvetica", "bold");
    doc.text(money(rate, currency), RIGHT - 3, y + 5.6, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.2); doc.line(M, y + ROW_H, RIGHT, y + ROW_H);
    y += ROW_H;
  });
  if (activeRooms.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED);
    doc.text("Suite-type rates available on request — contact our sales team.", M + 3, y + 5.6);
    y += ROW_H;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text("Rates are from-prices, per night, in BHD. Inclusive / exclusive of taxes per contract.", M, y + 5);
  y += 10;

  // ── Amenities + Partner benefits — side by side ──────────────────────────
  const COL_W = (RIGHT - M - 6) / 2;
  const colStartY = y;
  // LEFT — Amenities
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("AMENITIES", M, y);
  let ly = y + 5;
  const amenities = Array.isArray(H.amenities) && H.amenities.length ? H.amenities : DEFAULT_AMENITIES;
  amenities.forEach((a) => {
    doc.setFillColor(...GOLD); doc.circle(M + 1.4, ly - 1.4, 0.8, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(safe(a), COL_W - 6);
    doc.text(wrapped, M + 4, ly);
    ly += wrapped.length * 4.4 + 1.2;
  });

  // RIGHT — Partner benefits
  const RX = M + COL_W + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("PARTNER BENEFITS", RX, colStartY);
  let ry = colStartY + 5;
  PARTNER_BENEFITS.forEach((b) => {
    doc.setFillColor(...GREEN); doc.circle(RX + 1.4, ry - 1.4, 0.8, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(safe(b), COL_W - 6);
    doc.text(wrapped, RX + 4, ry);
    ry += wrapped.length * 4.4 + 1.2;
  });
  y = Math.max(ly, ry) + 4;

  // ── Check-in / out + Contact ─────────────────────────────────────────────
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y, RIGHT, y);
  y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("STAY POLICIES", M, y);
  doc.text("RESERVATIONS & SALES", M + 95, y);
  y += 5;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(`Check-in:  from ${safe(H.checkIn || "14:00")}`, M, y);
  doc.text(`Check-out: by ${safe(H.checkOut || "12:00")}`, M, y + 4.6);
  doc.text("Children up to 11 stay free in existing bedding.", M, y + 9.2);

  // Right-column max width = page width minus left margin and the column
  // start at M+95, minus the right margin. Anything longer wraps cleanly
  // instead of overflowing off the page (the address line is the usual
  // offender on long Bahrain addresses).
  const RCW = RIGHT - (M + 95);
  const contactLines = [
    `Reservations:  ${safe(H.emailReservations || H.email)}`,
    `Sales:         ${safe(H.emailSales || H.email)}`,
    `Reception:     ${safe(H.phone)}${H.whatsapp ? "  ·  WhatsApp " + safe(H.whatsapp) : ""}`,
    `${safe(H.address)}, ${safe(H.area)}, ${safe(H.country)}`.replace(/(^,\s*|,\s*$)/g, ""),
  ].filter(Boolean);
  let cy = y;
  contactLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, RCW);
    doc.text(wrapped, M + 95, cy);
    cy += wrapped.length * 4.4;
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const FOOTY = 285;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.4); doc.line(M, FOOTY, RIGHT, FOOTY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  const footL = `${safe(H.legal || H.name)} · ${safe(H.website || "")}`;
  const footR = `${safe(H.phone)}  ·  ${safe(H.email)}`;
  doc.text(footL, M, FOOTY + 5);
  doc.text(footR, RIGHT, FOOTY + 5, { align: "right" });

  const base64 = doc.output("datauristring").split(",")[1] || "";
  const safeName = (H.name || "TheLodgeSuites").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return { base64, filename: `${safeName}-FactSheet.pdf` };
}
