// factSheetPdf.js — branded multi-page Fact Sheet PDF for sales intro emails
// AND the public press kit. Built dynamically from live hotel info + rooms +
// packages + loyalty tiers + gift-card tiers so as the operator edits data,
// the next generated sheet picks the changes up — no manual upload, no stale
// figures.
//
// Layout (3 pages, photo-heavy):
//   1  The Property        — hero, intro, suite rates table, SIGNATURE SUITES strip
//   2  Experience & Spaces — 6-photo mosaic (lobby/kitchen/bedroom/pool/gym/play),
//                            amenities, meeting room, policies + contact
//   3  Programs & Offers   — stay offers, LS Privilege tiers, gift cards, partner
//
// The builder is ASYNC because property photos are fetched from /public/images/
// at runtime (same-origin; no CORS) and inlined as base64. If any image fails
// (offline build, unknown host) it's skipped silently and the textual sections
// of the doc still render correctly.

import { jsPDF } from "jspdf";

const INK     = [21, 22, 26];     // C.ink — primary text
const GOLD    = [201, 169, 97];   // C.gold — brand accent
const GOLD_D  = [165, 134, 71];   // deeper gold for headlines
const MUTED   = [122, 116, 100];  // secondary text
const HAIR    = [220, 215, 200];  // hairline rules
const GREEN   = [22, 163, 74];    // positive markers (offer inclusions)
const CREAM   = [251, 247, 236];  // partner-benefits callout fill

const PW = 210, PH = 297, M = 18, RIGHT = PW - M;

const safe  = (s) => (s == null ? "" : String(s));
const money = (n, code = "BHD") => `${code} ${Number(n || 0).toFixed(3)}`;

// Property photos — referenced as literal paths so this lib stays a pure JS
// module with no React dep. Operator-customised gallery imagery flows in via
// the `gallery` argument; these are only the fallback.
const HERO_FALLBACK = "/images/exterior-day.jpg";

// Signature-suites photo strip on page 1, one photo per room id when we have
// a known mapping. Unmatched rooms fall back to the studio image so the strip
// is always full.
const SUITE_PHOTOS = {
  "studio":     "/images/suite-studio-open-plan.jpg",
  "one-bed":    "/images/suite-bedroom-chandelier.jpg",
  "two-bed":    "/images/suite-living-kitchen.jpg",
  "three-bed":  "/images/presidential-living.jpg",
};
const SUITE_PHOTO_FALLBACK = "/images/suite-studio-open-plan.jpg";

// Page-2 lifestyle mosaic — 6 captioned tiles, 3 across × 2 down. Order is
// curated for narrative flow: arrive (lobby) → in-suite (kitchen, bedroom) →
// amenities (pool, gym, play). Captions render in italic gold uppercase below
// each tile.
const MOSAIC_TILES = [
  { url: "/images/lobby-main.jpg",                caption: "Lobby & arrival" },
  { url: "/images/suite-kitchen-bright.jpg",      caption: "Suite kitchenette" },
  { url: "/images/suite-bedroom-chandelier.jpg",  caption: "Master bedroom" },
  { url: "/images/pool-day.jpg",                  caption: "Rooftop pool" },
  { url: "/images/gym.jpg",                       caption: "24/7 gym" },
  { url: "/images/kids-playroom.jpg",             caption: "Kids' play area" },
];

const HOTEL_FALLBACK = {
  name: "The Lodge Suites",
  legal: "The Lodge Suites W.L.L.",
  tagline: "We Speak Your Language",
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

const DEFAULT_AMENITIES = [
  "Furnished kitchenette in every suite",
  "55\" Smart TV · complimentary high-speed Wi-Fi",
  "Soundproofed windows for restful stays",
  "Daily housekeeping · 24/7 reception",
  "On-site parking · 24/7 front office",
  "Walking distance to Juffair retail & dining",
  "Rooftop pool, gym & spa amenities",
];

const PARTNER_BENEFITS = [
  "Negotiated corporate / travel-agent rates with direct billing on approved credit",
  "One complimentary stay (up to 2 nights) — subject to availability, excluding weekends & public holidays",
  "Complimentary use of the meeting / conference room for guests staying with us",
  "Dedicated sales contact for proposals, site visits and event enquiries",
];

const MEETING_ROOM = {
  title: "Meeting & Conference Room",
  blurb: "Available on request to in-house and partner guests, complimentary subject to availability.",
  features: [
    "Seats up to 8 in boardroom layout",
    "Complimentary high-speed Wi-Fi & power outlets",
    "HD display for presentations",
    "Refreshments & light catering on request",
    "Bookable by the hour or by the day through reservations",
  ],
};

// ---------------------------------------------------------------------------
// Image loader — fetch /images/*.jpg as a base64 data-URL for jsPDF.addImage.
// Same-origin (no CORS); a 5s timeout protects the modal from a slow network.
// Returns null on any error so callers can render text-only without breaking.
// ---------------------------------------------------------------------------
async function loadImageAsBase64(url, timeoutMs = 5000) {
  if (!url) return null;
  if (typeof fetch !== "function" || typeof FileReader === "undefined") return null;
  try {
    const ctrl = (typeof AbortController === "function") ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    const r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Curated 4-image gallery fallback when the operator hasn't customised
// siteContent.galleryItems. The lifestyle mosaic (6 tiles) is independent —
// this fallback only matters if the consumer passes a custom gallery through.
const GALLERY_FALLBACK = [
  "/images/lobby-main.jpg",
  "/images/suite-living-kitchen.jpg",
  "/images/suite-bedroom-chandelier.jpg",
  "/images/pool-day.jpg",
];

// Resolve a 4-image gallery from siteContent.galleryItems (operator edits) or
// the curated fallback. Used by callers that want a custom set; kept around
// even though the mosaic now has its own fixed 6-tile layout for editorial
// integrity.
function resolveGalleryUrls(gallery) {
  const list = Array.isArray(gallery) && gallery.length
    ? gallery.map((g) => g && g.src).filter(Boolean)
    : GALLERY_FALLBACK;
  return list.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Header / footer / section labels — shared chrome.
// ---------------------------------------------------------------------------
function pageHeader(doc, H, label) {
  let y = 18;
  // Hotel name in a serif face for the luxury-deck feel; jsPDF's built-in
  // "times" is the closest match to the brand's Cormorant Garamond without
  // shipping a custom font file in the bundle.
  doc.setFont("times", "bold"); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(safe(H.name), M, y);
  if (label) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...GOLD_D);
    doc.text(label, RIGHT, y, { align: "right" });
    if (H.tagline) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.2); doc.setTextColor(...MUTED);
      doc.text(safe(H.tagline), RIGHT, y + 5, { align: "right" });
    }
  }
  doc.setFont("times", "italic"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text(safe(H.legal || ""), M, y + 6.5);
  y += 12;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(M, y, RIGHT, y);
  return y + 7;
}

function pageFooter(doc, H, pageNum, totalPages) {
  const FY = 285;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.4); doc.line(M, FY, RIGHT, FY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text(`${safe(H.legal || H.name)} · ${safe(H.website || "")}`, M, FY + 5);
  doc.text(`Page ${pageNum} of ${totalPages}`, PW / 2, FY + 5, { align: "center" });
  doc.text(`${safe(H.phone)}  ·  ${safe(H.email)}`, RIGHT, FY + 5, { align: "right" });
}

function sectionLabel(doc, y, label) {
  // Section labels — small caps in gold with a tiny gold dot before the text,
  // plus an ultra-thin underline that runs the full content width. Quiet but
  // unmistakably editorial.
  doc.setFillColor(...GOLD); doc.circle(M + 1.4, y - 1.6, 0.9, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); doc.setTextColor(...GOLD_D);
  doc.text(label, M + 4.2, y);
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.15);
  doc.line(M, y + 1.5, RIGHT, y + 1.5);
  return y + 6;
}

// Draw a single image with a small-caps gold caption underneath. Returns the
// caption's bottom y so the caller can stack rows.
function captionedImage(doc, x, y, w, h, base64, caption) {
  if (base64) {
    try { doc.addImage(base64, "JPEG", x, y, w, h, undefined, "FAST"); }
    catch (_) { /* fall through and just render the caption */ }
  } else {
    // Subtle placeholder so the layout doesn't collapse when an image is
    // missing — a soft cream rectangle with a hairline border.
    doc.setFillColor(...CREAM); doc.rect(x, y, w, h, "F");
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.2); doc.rect(x, y, w, h);
  }
  if (caption) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...GOLD_D);
    doc.text(safe(caption).toUpperCase(), x, y + h + 4);
  }
  return y + h + (caption ? 6 : 0);
}

// ---------------------------------------------------------------------------
// PAGE 1 — The Property: hero · intro · suite rates table · signature suites
// ---------------------------------------------------------------------------
function renderPage1(doc, H, rooms, currency, heroBase64, suitePhotos) {
  let y = pageHeader(doc, H, "FACT SHEET");

  // Hero strip — full content-width, 82mm tall.
  if (heroBase64) {
    try { doc.addImage(heroBase64, "JPEG", M, y, RIGHT - M, 82, undefined, "FAST"); y += 86; }
    catch (_) { y += 4; }
  }

  // The Property blurb
  y = sectionLabel(doc, y, "THE PROPERTY");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
  const blurb = `${safe(H.name)} is a premium all-suite property in the heart of ${safe(H.area) || "Manama"}, offering spacious accommodations and personalised hospitality tailored to both business and leisure travellers. Each suite features a furnished kitchenette, 55" Smart TV, soundproofed windows and complimentary high-speed Wi-Fi — a comfortable environment ideal for corporate and extended-stay guests.`;
  const blurbLines = doc.splitTextToSize(blurb, RIGHT - M);
  doc.text(blurbLines, M, y);
  y += blurbLines.length * 4.5 + 3;

  // Rates table
  y = sectionLabel(doc, y, "SUITE TYPES & RATES");
  doc.setFillColor(...INK); doc.rect(M, y, RIGHT - M, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text("SUITE", M + 3, y + 5.3);
  doc.text("OCCUPANCY", M + 110, y + 5.3);
  doc.text("FROM / NIGHT", RIGHT - 3, y + 5.3, { align: "right" });
  y += 8;

  const activeRooms = (rooms || []).filter((r) => r && !r.archived && Number(r.price ?? r.rateWeekday ?? 0) > 0);
  activeRooms.sort((a, b) => Number(a.price ?? a.rateWeekday ?? 0) - Number(b.price ?? b.rateWeekday ?? 0));
  const ROW_H = 9;
  activeRooms.forEach((r) => {
    const label = safe(r.publicName || r.name || r.id);
    const occ = r.occupancy ? `Up to ${r.occupancy} guest${r.occupancy === 1 ? "" : "s"}` : "";
    const rate = Number(r.price ?? r.rateWeekday ?? 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    doc.text(label, M + 3, y + 5.6);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
    if (occ) doc.text(occ, M + 110, y + 5.6);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text(money(rate, currency), RIGHT - 3, y + 5.6, { align: "right" });
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.2); doc.line(M, y + ROW_H, RIGHT, y + ROW_H);
    y += ROW_H;
  });
  if (activeRooms.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text("Suite-type rates available on request — contact our sales team.", M + 3, y + 5.6);
    y += ROW_H;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text("Rates are from-prices, per night, in BHD. Inclusive / exclusive of taxes per contract.", M, y + 4.5);
  y += 9;

  // SIGNATURE SUITES — one captioned photo per room type, in the same order
  // as the table. Filling the page with imagery is the key luxury upgrade.
  y = sectionLabel(doc, y, "SIGNATURE SUITES");
  const SUITE_COUNT = Math.min(activeRooms.length || 0, 4);
  if (SUITE_COUNT > 0) {
    const gap = 4;
    const tileW = (RIGHT - M - gap * (SUITE_COUNT - 1)) / SUITE_COUNT;
    const tileH = 30;
    activeRooms.slice(0, SUITE_COUNT).forEach((r, i) => {
      const x = M + i * (tileW + gap);
      const photoKey = SUITE_PHOTOS[r.id] || SUITE_PHOTO_FALLBACK;
      const b64 = suitePhotos[photoKey] || null;
      captionedImage(doc, x, y, tileW, tileH, b64, safe(r.publicName || r.name || r.id));
    });
  }
}

// ---------------------------------------------------------------------------
// PAGE 2 — Experience & Spaces: 6-tile lifestyle mosaic + amenities +
// meeting room + stay policies + contact block.
// ---------------------------------------------------------------------------
function renderPage2(doc, H, mosaicBase64s) {
  let y = pageHeader(doc, H, "EXPERIENCE & SPACES");

  // 6-tile mosaic — 3 across × 2 down, each captioned. Rows are intentionally
  // taller than the old single-strip gallery to give the photography room
  // to read; the mosaic dominates the top half of the page.
  y = sectionLabel(doc, y, "PROPERTY HIGHLIGHTS");
  const COLS = 3, ROWS = 2;
  const gap = 4;
  const tileW = (RIGHT - M - gap * (COLS - 1)) / COLS;
  const tileH = 38;
  const cellH = tileH + 7; // tile + caption + padding
  for (let i = 0; i < COLS * ROWS; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = M + col * (tileW + gap);
    const ty = y + row * cellH;
    const tile = MOSAIC_TILES[i] || { url: null, caption: "" };
    captionedImage(doc, x, ty, tileW, tileH, mosaicBase64s[i], tile.caption);
  }
  y += ROWS * cellH + 2;

  // Amenities (left) | Meeting & Conference (right)
  const COL_W = (RIGHT - M - 6) / 2;
  const colStartY = y;

  // LEFT — Amenities
  y = sectionLabel(doc, y, "AMENITIES");
  let ly = y;
  DEFAULT_AMENITIES.forEach((a) => {
    doc.setFillColor(...GOLD); doc.circle(M + 1.4, ly - 1.4, 0.8, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(safe(a), COL_W - 6);
    doc.text(wrapped, M + 4, ly);
    ly += wrapped.length * 4.4 + 1.2;
  });

  // RIGHT — Meeting & Conference Room
  const RX = M + COL_W + 6;
  doc.setFillColor(...GOLD); doc.circle(RX + 1.4, colStartY - 1.6, 0.9, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); doc.setTextColor(...GOLD_D);
  doc.text(MEETING_ROOM.title.toUpperCase(), RX + 4.2, colStartY);
  let ry = colStartY + 5;
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  const blurbWrap = doc.splitTextToSize(MEETING_ROOM.blurb, COL_W);
  doc.text(blurbWrap, RX, ry);
  ry += blurbWrap.length * 4.2 + 2;
  MEETING_ROOM.features.forEach((f) => {
    doc.setFillColor(...GREEN); doc.circle(RX + 1.4, ry - 1.4, 0.8, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    const wrap = doc.splitTextToSize(safe(f), COL_W - 6);
    doc.text(wrap, RX + 4, ry);
    ry += wrap.length * 4.4 + 1.2;
  });

  y = Math.max(ly, ry) + 4;

  // Stay policies + Contact (compact two-col footer)
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(M, y, RIGHT, y);
  y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); doc.setTextColor(...GOLD_D);
  doc.text("STAY POLICIES", M, y);
  doc.text("RESERVATIONS & SALES", RX, y);
  y += 5;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(`Check-in:  from ${safe(H.checkIn || "14:00")}`, M, y);
  doc.text(`Check-out: by ${safe(H.checkOut || "12:00")}`, M, y + 4.6);
  doc.text("Children up to 11 stay free in existing bedding.", M, y + 9.2);

  const RCW = RIGHT - RX;
  const contactLines = [
    `Reservations:  ${safe(H.emailReservations || H.email)}`,
    `Sales:         ${safe(H.emailSales || H.email)}`,
    `Reception:     ${safe(H.phone)}${H.whatsapp ? "  ·  WhatsApp " + safe(H.whatsapp) : ""}`,
    `${safe(H.address)}, ${safe(H.area)}, ${safe(H.country)}`.replace(/(^,\s*|,\s*$)/g, ""),
  ].filter(Boolean);
  let cy = y;
  contactLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, RCW);
    doc.text(wrapped, RX, cy);
    cy += wrapped.length * 4.4;
  });
}

// ---------------------------------------------------------------------------
// PAGE 3 — Programs & Offers (largely unchanged structurally; the visual
// chrome inherits the new gold-dot section labels for cohesion).
// ---------------------------------------------------------------------------

// Resolve a "from price" headline for a package so the card can show
// "from BHD 52 / night" without printing the full per-room matrix.
function packageHeadline(pkg, currency = "BHD") {
  const pricing = pkg.roomPricing || {};
  const entries = Object.entries(pricing).map(([roomId, v]) => ({ roomId, price: Number(v?.price || 0), saving: Number(v?.saving || 0) }))
    .filter((e) => e.price > 0);
  if (entries.length === 0) return { from: "On request", saving: 0 };
  entries.sort((a, b) => a.price - b.price);
  const cheapest = entries[0];
  const modeLabel = pkg.pricingMode === "flat" ? "flat / stay"
                  : pkg.pricingMode === "first-night" ? "first night"
                  : "per night";
  return {
    from: `${currency} ${cheapest.price.toFixed(0)} ${modeLabel}`,
    saving: cheapest.saving > 0 ? `save ${currency} ${cheapest.saving.toFixed(0)}` : "",
    roomId: cheapest.roomId,
  };
}

function renderPage3(doc, H, packages, tiers, loyalty, giftCardTiers, currency) {
  let y = pageHeader(doc, H, "PROGRAMS & OFFERS");

  // STAY OFFERS — top 4 active packages, 2x2 cards
  y = sectionLabel(doc, y, "STAY OFFERS");
  const offers = (packages || []).filter((p) => p && p.active !== false).slice(0, 4);
  const CARD_W = (RIGHT - M - 5) / 2;
  const CARD_H = 32;
  offers.forEach((pkg, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (CARD_W + 5);
    const cy = y + row * (CARD_H + 4);
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3);
    doc.rect(x, cy, CARD_W, CARD_H);
    doc.setFillColor(...GOLD); doc.rect(x, cy, 2, CARD_H, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(safe(pkg.label || pkg.id), x + 5, cy + 5.5);
    const head = packageHeadline(pkg, currency);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GOLD_D);
    doc.text(`From ${head.from}${head.saving ? "  ·  " + head.saving : ""}`, x + 5, cy + 10.5);
    const incs = (Array.isArray(pkg.includes) ? pkg.includes : []).slice(0, 2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...INK);
    let iy = cy + 16;
    incs.forEach((inc) => {
      doc.setFillColor(...GREEN); doc.circle(x + 6.4, iy - 1.4, 0.7, "F");
      const wrap = doc.splitTextToSize(safe(inc), CARD_W - 11);
      doc.text(wrap[0], x + 9, iy);
      iy += 4;
    });
    const nights = `${pkg.minNights || 1}${pkg.maxNights && pkg.maxNights > pkg.minNights ? `–${pkg.maxNights}` : "+"} night${(pkg.maxNights || pkg.minNights) === 1 ? "" : "s"}`;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(nights, x + CARD_W - 3, cy + CARD_H - 2.5, { align: "right" });
  });
  if (offers.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text("Curated stay offers available on request.", M, y + 5);
    y += 8;
  } else {
    y += Math.ceil(offers.length / 2) * (CARD_H + 4) + 4;
  }

  // LS PRIVILEGE — 3 tier columns
  y = sectionLabel(doc, y, "LS PRIVILEGE LOYALTY · 3-TIER MEMBER PROGRAMME");
  const TIER_W = (RIGHT - M - 6) / 3;
  const TIER_H = 38;
  const visibleTiers = (tiers || []).slice(0, 3);
  visibleTiers.forEach((t, i) => {
    const x = M + i * (TIER_W + 3);
    const tierColor = parseHex(t.color) || GOLD;
    doc.setFillColor(...tierColor);
    doc.rect(x, y, TIER_W, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(safe(t.name || t.id).toUpperCase(), x + 3, y + 4.2);
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3);
    doc.rect(x, y + 6, TIER_W, TIER_H - 6);
    const enabled = (Array.isArray(t.benefits) ? t.benefits : []).filter((b) => b && b.on).slice(0, 4);
    let by = y + 11;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...INK);
    enabled.forEach((b) => {
      doc.setFillColor(...GREEN); doc.circle(x + 3.4, by - 1.2, 0.7, "F");
      const label = friendlyBenefitLabel(b.key || b.id);
      const wrap = doc.splitTextToSize(label, TIER_W - 7);
      doc.text(wrap[0], x + 5.6, by);
      by += 4.2;
    });
  });
  y += TIER_H + 4;
  if (loyalty && Number(loyalty.redeemBhdPerPoints) > 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    const ratio = Number(loyalty.redeemBhdPerPoints);
    const freeNightPts = Number(loyalty.freeNightAfterPts || 0);
    const econLine = `Points economy: ${ratio} points = ${currency} 1 off${freeNightPts > 0 ? `  ·  ${freeNightPts.toLocaleString()} points = 1 free night` : ""}`;
    doc.text(econLine, M, y);
    y += 5;
  }

  // GIFT CARDS — compact mini-table
  y = sectionLabel(doc, y, "GIFT CARDS · NIGHTS-BASED");
  doc.setFillColor(...INK); doc.rect(M, y, RIGHT - M, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
  doc.text("NIGHTS", M + 3, y + 4.8);
  doc.text("DISCOUNT", M + 40, y + 4.8);
  doc.text("DESCRIPTOR", M + 80, y + 4.8);
  doc.text("REDEMPTION", RIGHT - 3, y + 4.8, { align: "right" });
  y += 7;
  const gcTiers = (Array.isArray(giftCardTiers) ? giftCardTiers : []).filter((g) => g && g.active !== false);
  const GC_H = 6.5;
  gcTiers.forEach((gc) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
    doc.text(`${gc.nights || 0}`, M + 3, y + 4.6);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD_D);
    doc.text(`${Number(gc.discountPct || 0)}%`, M + 40, y + 4.6);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
    const desc = safe(gc.label || gc.hint || "");
    doc.text(doc.splitTextToSize(desc, 80)[0] || "—", M + 80, y + 4.6);
    doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED);
    doc.text("Across multiple stays", RIGHT - 3, y + 4.6, { align: "right" });
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.15); doc.line(M, y + GC_H, RIGHT, y + GC_H);
    y += GC_H;
  });
  if (gcTiers.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text("Gift card tiers available on request — contact reservations.", M + 3, y + 5);
    y += 8;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text("Gift cards are valid 365 days from purchase, transferable, redeemable across multiple stays.", M, y + 4);
  y += 7;

  // PARTNER BENEFITS callout
  y = sectionLabel(doc, y, "PARTNER BENEFITS · CORPORATE & TRAVEL AGENT");
  doc.setFillColor(...CREAM); doc.setDrawColor(...GOLD); doc.setLineWidth(0.4);
  const boxH = PARTNER_BENEFITS.length * 5.2 + 4;
  doc.rect(M, y, RIGHT - M, boxH, "FD");
  let by = y + 4.5;
  PARTNER_BENEFITS.forEach((b) => {
    doc.setFillColor(...GOLD); doc.circle(M + 3.4, by - 1.3, 0.8, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
    const wrap = doc.splitTextToSize(safe(b), RIGHT - M - 8);
    doc.text(wrap[0], M + 5.6, by);
    by += 5.2;
  });
}

// Parse a "#RRGGBB" CSS colour to an [r,g,b] tuple for jsPDF. Returns null on
// malformed input so the caller can fall back to GOLD.
function parseHex(hex) {
  const s = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// Tier benefits in store are keyed by an i18n key (e.g. "memberRate10"). For
// the static PDF we want a clean printable label; this map covers the seeded
// keys, and unknown keys are humanised from the camelCase.
const BENEFIT_LABELS = {
  memberRate5:           "5% member rate on every booking",
  memberRate10:          "10% member rate on every booking",
  memberRate15:          "15% member rate + best rate guarantee",
  points1:               "1 point per BHD spent on rooms",
  points15:              "1.5 points per BHD spent",
  points2:               "2 points per BHD spent",
  welcomeWater:          "Welcome bottle of water",
  welcomeAmenity:        "Welcome amenity in suite",
  premiumWelcome:        "Premium welcome amenity & flowers",
  freeWifi:              "Free Wi-Fi (always)",
  complimentaryUpgrade:  "Complimentary room upgrade",
  upgradeWhen:           "Room upgrade (when available)",
  guaranteedUpgrade:     "Guaranteed room upgrade",
  lateCheckoutSubject:   "Late check-out (subject to availability)",
  lateCheckout14:        "Late check-out to 14:00",
  guaranteedLate16:      "Guaranteed late check-out to 16:00",
  freeNightCert:         "Free night certificate",
  freeNight20:           "Free night after 20 nights stayed",
  annualFreeNight:       "Annual free night + suite upgrade voucher",
};
function friendlyBenefitLabel(key) {
  if (BENEFIT_LABELS[key]) return BENEFIT_LABELS[key];
  if (!key) return "Member benefit";
  return String(key).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

// ---------------------------------------------------------------------------
// buildFactSheetPdf — main entry. ASYNC: fetches all 11 property photos in
// parallel before rendering so the hero, signature-suite strip and the
// lifestyle mosaic all land cleanly.
//
// opts: {
//   hotel, rooms, packages, tiers, loyalty, giftCardTiers, gallery,
//   currency = "BHD"
// }
// Returns Promise<{ base64, filename }>; never throws — any image that
// doesn't fetch is skipped so the PDF still renders.
// ---------------------------------------------------------------------------
export async function buildFactSheetPdf({
  hotel, rooms = [], packages = [], tiers = [], loyalty = null,
  giftCardTiers = [], gallery = null, currency = "BHD",
} = {}) {
  // `gallery` is accepted for backward-compat but the new mosaic uses its
  // own curated 6-tile set for editorial integrity. We don't use it here,
  // but resolveGalleryUrls is kept for callers that want it.
  void resolveGalleryUrls; void gallery;

  const H = { ...HOTEL_FALLBACK, ...(hotel || {}) };

  // Build the FULL set of unique URLs we need across all three pages — hero,
  // signature suites (deduped by URL), and the six mosaic tiles — so the
  // parallel fetch is exactly N requests with no duplicates.
  const suiteUrls = (rooms || [])
    .filter((r) => r && !r.archived && Number(r.price ?? r.rateWeekday ?? 0) > 0)
    .slice(0, 4)
    .map((r) => SUITE_PHOTOS[r.id] || SUITE_PHOTO_FALLBACK);
  const mosaicUrls = MOSAIC_TILES.map((t) => t.url);
  const unique = Array.from(new Set([HERO_FALLBACK, ...suiteUrls, ...mosaicUrls]));

  // Fetch everything in parallel; each fetch is bounded by the per-image 5s
  // timeout inside loadImageAsBase64, so worst-case the build settles after ~5s.
  const fetched = await Promise.all(unique.map((u) => loadImageAsBase64(u)));
  const byUrl = unique.reduce((acc, url, i) => { acc[url] = fetched[i]; return acc; }, {});

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Page 1
  renderPage1(doc, H, rooms, currency, byUrl[HERO_FALLBACK], byUrl);
  pageFooter(doc, H, 1, 3);

  // Page 2 — mosaic in the curated order
  doc.addPage();
  const mosaicBase64s = mosaicUrls.map((u) => byUrl[u]);
  renderPage2(doc, H, mosaicBase64s);
  pageFooter(doc, H, 2, 3);

  // Page 3
  doc.addPage();
  renderPage3(doc, H, packages, tiers, loyalty, giftCardTiers, currency);
  pageFooter(doc, H, 3, 3);

  const base64 = doc.output("datauristring").split(",")[1] || "";
  const safeName = (H.name || "TheLodgeSuites").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return { base64, filename: `${safeName}-FactSheet.pdf` };
}
