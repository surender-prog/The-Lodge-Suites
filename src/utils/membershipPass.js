// membershipPass.js — generates an Apple-Wallet-compatible .pkpass bundle for
// LS Privilege members, plus PNG renders of the membership card and
// share-link helpers (WhatsApp / Email / Web Share / clipboard).
//
// IMPORTANT — signing
// --------------------
// A real Apple Wallet pass needs a SHA-1 manifest signed with an Apple Pass
// Type ID certificate (PKCS#7 detached). That signing must happen server-side
// because the private key cannot ship to the browser. This module emits a
// structurally valid .pkpass with a placeholder "signature" file so the bundle
// downloads cleanly and can be inspected; when the production signing service
// goes live it just needs to drop in a real PKCS#7 signature alongside the
// generated manifest.json. No other UI changes required.
//
// Per CLAUDE.md the project is mocked — this stays consistent with that.

import { encodeZip, sha1Hex, downloadBlob as zipDownloadBlob } from "./zipEncoder.js";

// ---------------------------------------------------------------------------
// Hotel + brand constants
// ---------------------------------------------------------------------------
const HOTEL = {
  name: "The Lodge Suites",
  tagline: "We Speak Your Language",
  address: "Building 916 · Road 4019 · Block 340 · Juffair · Manama · Bahrain",
  phone: "+973 1616 8146",
  email: "frontoffice@thelodgesuites.com",
  website: "https://www.thelodgesuites.com",
};

// Tier visuals for the wallet pass body. The accent comes through as the
// pass background and as the band on the rendered HTML/PNG card.
const TIER_VISUALS = {
  silver:   { label: "Silver",   accent: "#A8A8A8", deep: "#7A7A7A" },
  gold:     { label: "Gold",     accent: "#C9A961", deep: "#9A7E40" },
  platinum: { label: "Platinum", accent: "#E5E4E2", deep: "#A0A6AC" },
};

const PASS_TYPE_ID    = "pass.com.thelodgesuites.privilege";
const ORG_NAME        = HOTEL.name;
const TEAM_IDENTIFIER = "TEAM_PLACEHOLDER"; // server-side signing flow swaps this in

// ZIP encoding + SHA-1 are now in zipEncoder.js (re-exported above).

// ---------------------------------------------------------------------------
// Image generation — icon.png + logo.png drawn on an offscreen canvas. We
// keep the artwork brand-aligned (gold mark on dark) and small (the .pkpass
// spec needs an icon at 29×29 minimum and a logo at ≤160×50).
// ---------------------------------------------------------------------------
async function pngFromCanvas(width, height, drawFn, scale = 2) {
  const canvas = document.createElement("canvas");
  canvas.width  = width  * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  drawFn(ctx, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to render PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

function drawMonogram(ctx, w, h) {
  // Dark background
  ctx.fillStyle = "#15161A";
  ctx.fillRect(0, 0, w, h);
  // Gold "L" + "S" wordmark
  ctx.fillStyle = "#C9A961";
  ctx.font = `${Math.floor(h * 0.55)}px "Cormorant Garamond", Georgia, serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("LS", w / 2, h / 2 + h * 0.04);
  // Subtle gold border
  ctx.strokeStyle = "#9A7E40";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

function drawWordmark(ctx, w, h) {
  ctx.fillStyle = "#15161A";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#C9A961";
  ctx.font = `italic ${Math.floor(h * 0.55)}px "Cormorant Garamond", Georgia, serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("The Lodge Suites", w * 0.04, h / 2);
}

async function buildIcon()      { return pngFromCanvas(58,  58,  drawMonogram, 2); }
async function buildLogo()      { return pngFromCanvas(160, 50,  drawWordmark, 2); }

// ---------------------------------------------------------------------------
// pass.json — the wallet card payload. Pass-type assets are referenced
// by name so the Wallet client knows which image to render.
// ---------------------------------------------------------------------------
function buildPassJson(member, tierMeta) {
  const tier = TIER_VISUALS[member.tier] || TIER_VISUALS.gold;
  return {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    serialNumber: member.id,
    teamIdentifier: TEAM_IDENTIFIER,
    organizationName: ORG_NAME,
    description: `${HOTEL.name} · LS Privilege ${tier.label}`,
    logoText: HOTEL.name,
    foregroundColor: "rgb(254, 248, 230)",
    backgroundColor: "rgb(20, 21, 26)",
    labelColor: rgbFromHex(tier.accent),
    storeCard: {
      headerFields: [
        { key: "tier", label: "Tier", value: tier.label, textAlignment: "PKTextAlignmentRight" },
      ],
      primaryFields: [
        { key: "name", label: "Member", value: member.name },
      ],
      secondaryFields: [
        { key: "memberId",      label: "Member ID", value: member.id },
        { key: "points",        label: "Points",    value: (member.points || 0).toLocaleString(), textAlignment: "PKTextAlignmentRight" },
      ],
      auxiliaryFields: [
        { key: "joined",         label: "Member since", value: humanDate(member.joined) },
        { key: "lifetimeNights", label: "Nights",       value: String(member.lifetimeNights || 0), textAlignment: "PKTextAlignmentRight" },
      ],
      backFields: [
        { key: "perks",   label: "Tier benefits", value: tierBenefitsText(tierMeta) },
        { key: "phone",   label: "Hotel",         value: HOTEL.phone },
        { key: "email",   label: "Front office",  value: HOTEL.email },
        { key: "address", label: "Address",       value: HOTEL.address },
        { key: "website", label: "Website",       value: HOTEL.website },
        { key: "tagline", label: "",              value: HOTEL.tagline },
        { key: "terms",   label: "Terms",         value: "Show this pass at check-in. Member rate, perks and points are subject to LS Privilege programme rules. Non-transferable." },
      ],
    },
    barcodes: [
      { format: "PKBarcodeFormatQR", message: member.id, messageEncoding: "iso-8859-1", altText: member.id },
    ],
    barcode: {
      format: "PKBarcodeFormatQR", message: member.id, messageEncoding: "iso-8859-1", altText: member.id,
    },
    relevantDate: new Date().toISOString(),
  };
}

function tierBenefitsText(tierMeta) {
  if (!tierMeta?.benefits) return "Welcome to LS Privilege.";
  return tierMeta.benefits.filter((b) => b.on).map((b) => `• ${b.label}`).join("\n");
}

function rgbFromHex(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function humanDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { year: "numeric", month: "short" });
  } catch { return iso; }
}

// ---------------------------------------------------------------------------
// .pkpass blob builder
// ---------------------------------------------------------------------------
export async function buildPkpassBlob(member, tierMeta) {
  const enc = new TextEncoder();
  const passJsonStr = JSON.stringify(buildPassJson(member, tierMeta), null, 2);

  const iconPng    = await buildIcon();
  const icon2xPng  = await pngFromCanvas(58, 58, drawMonogram, 4); // serve as @2x
  const logoPng    = await buildLogo();
  const logo2xPng  = await pngFromCanvas(160, 50, drawWordmark, 4);

  const filesPreManifest = [
    { name: "pass.json",     data: enc.encode(passJsonStr) },
    { name: "icon.png",      data: iconPng },
    { name: "icon@2x.png",   data: icon2xPng },
    { name: "logo.png",      data: logoPng },
    { name: "logo@2x.png",   data: logo2xPng },
  ];

  // manifest.json — sha1 of every file in the bundle
  const manifest = {};
  for (const f of filesPreManifest) {
    manifest[f.name] = await sha1Hex(f.data);
  }
  const manifestBytes = enc.encode(JSON.stringify(manifest, null, 2));

  // signature — placeholder. A real signing service replaces these bytes
  // with the PKCS#7 detached signature of manifest.json.
  const signaturePlaceholder = enc.encode(
    "PLACEHOLDER_SIGNATURE\n" +
    "This .pkpass was generated client-side for preview/dev use.\n" +
    "Production signing happens in the Apple Pass signing service.\n"
  );

  const allFiles = [
    ...filesPreManifest,
    { name: "manifest.json", data: manifestBytes },
    { name: "signature",     data: signaturePlaceholder },
  ];

  return encodeZip(allFiles, { mime: "application/vnd.apple.pkpass" });
}

// ---------------------------------------------------------------------------
// Render the visual membership card to a PNG (high-res). Used by the
// "Download card" action and as a graceful fallback when Web Share doesn't
// support file attachments.
// ---------------------------------------------------------------------------
export async function buildMembershipCardPng(member, tierMeta) {
  const tier = TIER_VISUALS[member.tier] || TIER_VISUALS.gold;
  const W = 720, H = 1140;
  return pngFromCanvas(W, H, (ctx) => {
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#15161A");
    grad.addColorStop(1, "#1F2026");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Tier band
    ctx.fillStyle = tier.accent;
    ctx.fillRect(0, 0, W, 12);

    // Brand block
    ctx.fillStyle = tier.accent;
    ctx.font = "700 16px Manrope, Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("THE LODGE SUITES", 56, 56);

    ctx.fillStyle = "#FEF8E6";
    ctx.font = "italic 38px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText("LS Privilege", 56, 84);

    // Tier label, big
    ctx.fillStyle = tier.accent;
    ctx.font = "italic 96px 'Cormorant Garamond', Georgia, serif";
    ctx.textAlign = "right";
    ctx.fillText(tier.label, W - 56, 64);

    // Divider
    ctx.strokeStyle = "rgba(201,169,97,0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, 220);
    ctx.lineTo(W - 56, 220);
    ctx.stroke();

    // Member name (large)
    ctx.fillStyle = "#FEF8E6";
    ctx.textAlign = "left";
    ctx.font = "italic 62px 'Cormorant Garamond', Georgia, serif";
    wrapText(ctx, member.name || "—", 56, 280, W - 112, 64);

    // Member ID block
    ctx.fillStyle = tier.accent;
    ctx.font = "700 13px Manrope, Arial, sans-serif";
    ctx.fillText("MEMBER ID", 56, 440);
    ctx.fillStyle = "#FEF8E6";
    ctx.font = "700 28px 'Manrope', Arial, sans-serif";
    ctx.fillText(member.id || "—", 56, 462);

    // Points block
    ctx.fillStyle = tier.accent;
    ctx.font = "700 13px Manrope, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("POINTS", W - 56, 440);
    ctx.fillStyle = "#FEF8E6";
    ctx.font = "italic 56px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText((member.points || 0).toLocaleString(), W - 56, 462);

    // Joined block
    ctx.fillStyle = tier.accent;
    ctx.font = "700 13px Manrope, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("MEMBER SINCE", 56, 580);
    ctx.fillStyle = "#FEF8E6";
    ctx.font = "italic 32px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText(humanDate(member.joined), 56, 602);

    // Lifetime nights
    ctx.fillStyle = tier.accent;
    ctx.font = "700 13px Manrope, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("LIFETIME NIGHTS", W - 56, 580);
    ctx.fillStyle = "#FEF8E6";
    ctx.font = "italic 32px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText(String(member.lifetimeNights || 0), W - 56, 602);

    // QR-style code area (decorative — not a scannable QR; the .pkpass file
    // carries the real one)
    drawDecorativeQR(ctx, W / 2 - 110, 700, 220, member.id || "");

    // Footer
    ctx.fillStyle = "rgba(254,248,230,0.55)";
    ctx.font = "11px Manrope, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(HOTEL.name + "  ·  " + HOTEL.phone + "  ·  " + HOTEL.email, W / 2, H - 80);
    ctx.fillStyle = tier.accent;
    ctx.font = "italic 16px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText(HOTEL.tagline, W / 2, H - 56);
  }, 2);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  let yy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = words[i];
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

// Decorative QR-like grid. Not a scannable QR — the actual scannable code is
// embedded in pass.json so Wallet renders it when the .pkpass is opened.
function drawDecorativeQR(ctx, x, y, size, seed) {
  // Outer frame
  ctx.fillStyle = "#FEF8E6";
  ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
  // Inner cells
  const cells = 21;
  const cellSize = size / cells;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  ctx.fillStyle = "#15161A";
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      h = (h * 1103515245 + 12345) >>> 0;
      if ((h & 0xFF) < 128) ctx.fillRect(x + i * cellSize, y + j * cellSize, cellSize, cellSize);
    }
  }
  // Three position-detection squares (top-left, top-right, bottom-left)
  const drawAnchor = (ax, ay) => {
    ctx.fillStyle = "#15161A";
    ctx.fillRect(ax, ay, cellSize * 7, cellSize * 7);
    ctx.fillStyle = "#FEF8E6";
    ctx.fillRect(ax + cellSize, ay + cellSize, cellSize * 5, cellSize * 5);
    ctx.fillStyle = "#15161A";
    ctx.fillRect(ax + cellSize * 2, ay + cellSize * 2, cellSize * 3, cellSize * 3);
  };
  drawAnchor(x, y);
  drawAnchor(x + size - cellSize * 7, y);
  drawAnchor(x, y + size - cellSize * 7);
}

// ---------------------------------------------------------------------------
// Share helpers
// ---------------------------------------------------------------------------
export function buildShareText(member) {
  const tier = TIER_VISUALS[member.tier] || TIER_VISUALS.gold;
  return [
    `My LS Privilege membership · ${tier.label}`,
    `${member.name} · ${member.id}`,
    `${HOTEL.name} · ${HOTEL.phone}`,
  ].join("\n");
}

export function whatsAppShareUrl(member) {
  const text = buildShareText(member);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function emailShareUrl(member) {
  const tier = TIER_VISUALS[member.tier] || TIER_VISUALS.gold;
  const subject = `My LS Privilege ${tier.label} membership`;
  const body = [
    buildShareText(member),
    "",
    "I've attached my Apple Wallet pass and a card image.",
    "",
    `${HOTEL.name}`,
    HOTEL.address,
    HOTEL.email,
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Generic system-share via Web Share API. Returns true if share completed.
export async function nativeShare(member, files /* [File] */) {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  const tier = TIER_VISUALS[member.tier] || TIER_VISUALS.gold;
  const shareData = {
    title: `LS Privilege · ${tier.label}`,
    text: buildShareText(member),
  };
  if (files && files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
    shareData.files = files;
  }
  try {
    await navigator.share(shareData);
    return true;
  } catch (e) {
    // User cancelled or share failed — let the caller fall back to a menu.
    return false;
  }
}

// Re-export downloadBlob from the shared zip utility so existing callers
// don't need to know which file it lives in.
export const downloadBlob = zipDownloadBlob;

export const tierVisuals = (tierId) => TIER_VISUALS[tierId] || TIER_VISUALS.gold;
export const hotel = HOTEL;
