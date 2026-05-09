import React, { forwardRef, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Check, Copy, Download, FileJson, Image as ImageIcon, Mail,
  Printer, QrCode, Share2, Smartphone, Wallet,
} from "lucide-react";
import { Card, Drawer, GhostBtn, PrimaryBtn, pushToast } from "../ui.jsx";
import { usePalette } from "../../theme.jsx";
import { useData } from "../../../../data/store.jsx";
import { fmtDate } from "../../../../utils/date.js";

// ---------------------------------------------------------------------------
// The Lodge Suites — brand constants kept locally so the wallet pass is
// self-contained (the JSON payloads embed property contact details for
// guests scanning the card at check-in).
// ---------------------------------------------------------------------------
const HOTEL = {
  name:      "The Lodge Suites",
  short:     "TLS",
  tagline:   "We Speak Your Language",
  location:  "Juffair · Manama · Bahrain",
  address:   "Building 916, Road 4019, Block 340",
  phone:     "+973 1616 8146",
  instagram: "@thelodgesuites",
  checkIn:   "14:00",
  checkOut:  "12:00",
};

// Convert "#RRGGBB" → "rgb(r,g,b)" for the PassKit JSON spec.
const hexToRgbString = (hex) => {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "rgb(21,22,26)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
};

// ---------------------------------------------------------------------------
// MockQRGroup — deterministic SVG-based QR mock. Three corner finders plus a
// hash-seeded random data area give a believable look. Production builds
// should swap this for a real QR encoder.
// ---------------------------------------------------------------------------
function MockQRGroup({ value, size = 100, fg = "#15161A", bg = "#FFFFFF", x = 0, y = 0 }) {
  const N = 25;
  const cell = size / N;

  const rects = useMemo(() => {
    let h = 2166136261;
    const v = value || "x";
    for (let i = 0; i < v.length; i++) {
      h ^= v.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let s = h >>> 0;

    const isFinder = (cx, cy) => {
      const corners = [[0, 0], [N - 7, 0], [0, N - 7]];
      for (const [ox, oy] of corners) {
        const lx = cx - ox, ly = cy - oy;
        if (lx >= 0 && lx < 7 && ly >= 0 && ly < 7) {
          if (lx === 0 || lx === 6 || ly === 0 || ly === 6) return true;
          if (lx === 1 || lx === 5 || ly === 1 || ly === 5) return false;
          return true;
        }
      }
      return null;
    };
    const inFinderArea = (cx, cy) => {
      const corners = [[0, 0], [N - 8, 0], [0, N - 8]];
      for (const [ox, oy] of corners) {
        const lx = cx - ox, ly = cy - oy;
        if (lx >= 0 && lx < 8 && ly >= 0 && ly < 8) return true;
      }
      return false;
    };

    const out = [];
    for (let yy = 0; yy < N; yy++) {
      for (let xx = 0; xx < N; xx++) {
        const f = isFinder(xx, yy);
        let filled;
        if (f !== null) filled = f;
        else if (inFinderArea(xx, yy)) filled = false;
        else {
          s = (s * 1664525 + 1013904223) >>> 0;
          filled = (s & 1) === 1;
        }
        if (filled) out.push({ x: xx * cell, y: yy * cell });
      }
    }
    return out;
  }, [value, cell]);

  return (
    <g transform={`translate(${x},${y})`} shapeRendering="crispEdges">
      <rect x={0} y={0} width={size} height={size} fill={bg} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={cell} height={cell} fill={fg} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Apple Wallet Pass — vertical SVG card mocked after PassKit storeCard.
// ---------------------------------------------------------------------------
export const AppleWalletPass = forwardRef(({ member, tier, loyalty }, ref) => {
  const W = 340, H = 560;
  const tierColor = tier?.color || "#C9A961";
  const initials = (member.name || "")
    .split(" ").map(s => s[0] || "").slice(0, 2).join("").toUpperCase() || "·";
  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);

  return (
    <svg
      ref={ref}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", borderRadius: 18, overflow: "hidden", boxShadow: "0 22px 50px rgba(0,0,0,0.45)" }}
    >
      <defs>
        <linearGradient id="appleBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tierColor} />
          <stop offset="0.34" stopColor="#1B1C20" />
          <stop offset="1" stopColor="#0F1013" />
        </linearGradient>
        <pattern id="appleHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </pattern>
        <clipPath id="appleCardClip">
          <rect width={W} height={H} rx={18} ry={18} />
        </clipPath>
        <clipPath id="applePhotoClip">
          <circle cx={W - 36} cy={84} r={26} />
        </clipPath>
      </defs>

      <g clipPath="url(#appleCardClip)">
        <rect width={W} height={H} fill="url(#appleBg)" />
        <rect width={W} height={H} fill="url(#appleHatch)" />

        {/* Top bar */}
        <text x={20} y={28} fill="#FFFFFF" fontFamily="'Manrope', sans-serif" fontSize="9" fontWeight="700" letterSpacing="2.4">MEMBER PASS</text>
        <text x={W - 20} y={28} fill="rgba(255,255,255,0.7)" fontFamily="'Manrope', sans-serif" fontSize="8.5" letterSpacing="2" textAnchor="end" fontWeight="600">LS PRIVILEGE</text>

        {/* Hotel */}
        <text x={20} y={58} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="500" fontStyle="italic">{HOTEL.name}</text>
        <text x={20} y={75} fill="rgba(255,255,255,0.6)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.4" fontWeight="600">{HOTEL.location.toUpperCase()}</text>

        {/* Photo / initials */}
        <circle cx={W - 36} cy={84} r={28} fill="rgba(255,255,255,0.08)" stroke={tierColor} strokeWidth="2" />
        {member.photo?.url ? (
          <image href={member.photo.url} x={W - 62} y={58} width={52} height={52} preserveAspectRatio="xMidYMid slice" clipPath="url(#applePhotoClip)" />
        ) : (
          <text x={W - 36} y={92} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fontWeight="600" textAnchor="middle">{initials}</text>
        )}

        {/* Tier chip */}
        <rect x={20} y={130} width={148} height={24} fill="rgba(255,255,255,0.08)" stroke={tierColor} strokeWidth="1" />
        <text x={32} y={147} fill={tierColor} fontFamily="'Manrope', sans-serif" fontSize="10" fontWeight="700" letterSpacing="2.6">{(tier?.name || member.tier).toUpperCase()}</text>

        {/* Member name + ID */}
        <text x={20} y={184} fill="rgba(255,255,255,0.55)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.2" fontWeight="600">MEMBER NAME</text>
        <text x={20} y={210} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="500">{member.name}</text>

        <text x={20} y={234} fill="rgba(255,255,255,0.55)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.2" fontWeight="600">MEMBER ID</text>
        <text x={20} y={258} fill={tierColor} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="14" fontWeight="700" letterSpacing="1.8">{member.id}</text>

        <line x1={20} y1={278} x2={W - 20} y2={278} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

        {/* Three-column field strip */}
        <text x={20} y={296} fill="rgba(255,255,255,0.5)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" fontWeight="600">POINTS</text>
        <text x={20} y={324} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="500">{member.points.toLocaleString()}</text>

        <text x={W / 2} y={296} fill="rgba(255,255,255,0.5)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" textAnchor="middle" fontWeight="600">REDEEMABLE</text>
        <text x={W / 2} y={324} fill={tierColor} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="500" textAnchor="middle">BHD {redeemable}</text>

        <text x={W - 20} y={296} fill="rgba(255,255,255,0.5)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" textAnchor="end" fontWeight="600">NIGHTS</text>
        <text x={W - 20} y={324} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="500" textAnchor="end">{member.lifetimeNights}</text>

        <line x1={20} y1={346} x2={W - 20} y2={346} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

        {/* Member since + earn rate */}
        <text x={20} y={363} fill="rgba(255,255,255,0.5)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" fontWeight="600">MEMBER SINCE</text>
        <text x={20} y={381} fill="#FFFFFF" fontFamily="'Manrope', sans-serif" fontSize="11" fontWeight="600">{member.joined || "—"}</text>

        <text x={W - 20} y={363} fill="rgba(255,255,255,0.5)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" textAnchor="end" fontWeight="600">EARN RATE</text>
        <text x={W - 20} y={381} fill="#FFFFFF" fontFamily="'Manrope', sans-serif" fontSize="11" fontWeight="600" textAnchor="end">{tier?.earnRate || 1}× pt/BHD</text>

        {/* QR */}
        <rect x={(W - 130) / 2} y={398} width={130} height={130} fill="#FFFFFF" />
        <MockQRGroup value={member.id} size={108} fg="#15161A" bg="#FFFFFF" x={(W - 108) / 2} y={409} />

        {/* Footer */}
        <text x={W / 2} y={544} fill="rgba(255,255,255,0.55)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.4" textAnchor="middle" fontWeight="600">SCAN AT CHECK-IN · {HOTEL.phone}</text>
      </g>

      {/* Border */}
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={18} ry={18} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
    </svg>
  );
});
AppleWalletPass.displayName = "AppleWalletPass";

// ---------------------------------------------------------------------------
// Google Wallet Pass — vertical card with Material-flat aesthetic.
// ---------------------------------------------------------------------------
export const GoogleWalletPass = forwardRef(({ member, tier, loyalty }, ref) => {
  const W = 340, H = 560;
  const tierColor = tier?.color || "#C9A961";
  const initials = (member.name || "")
    .split(" ").map(s => s[0] || "").slice(0, 2).join("").toUpperCase() || "·";
  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);

  return (
    <svg
      ref={ref}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", borderRadius: 18, overflow: "hidden", boxShadow: "0 22px 50px rgba(0,0,0,0.18)" }}
    >
      <defs>
        <clipPath id="googleCardClip"><rect width={W} height={H} rx={18} ry={18} /></clipPath>
        <clipPath id="googlePhotoClip"><circle cx={W - 36} cy={62} r={22} /></clipPath>
      </defs>

      <g clipPath="url(#googleCardClip)">
        {/* Card body — clean white */}
        <rect width={W} height={H} fill="#FFFFFF" />

        {/* Tier accent header strip */}
        <rect x={0} y={0} width={W} height={104} fill={tierColor} />
        <rect x={0} y={104} width={W} height={4} fill="rgba(0,0,0,0.06)" />

        {/* Header content */}
        <text x={20} y={28} fill="rgba(255,255,255,0.85)" fontFamily="'Manrope', sans-serif" fontSize="8.5" fontWeight="700" letterSpacing="2.6">LOYALTY · LS PRIVILEGE</text>
        <text x={20} y={56} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fontWeight="500" fontStyle="italic">{HOTEL.name}</text>
        <text x={20} y={76} fill="rgba(255,255,255,0.75)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.4" fontWeight="600">{HOTEL.location.toUpperCase()}</text>

        {/* Photo / initials in header */}
        <circle cx={W - 36} cy={62} r={24} fill="rgba(255,255,255,0.18)" stroke="#FFFFFF" strokeWidth="1.5" />
        {member.photo?.url ? (
          <image href={member.photo.url} x={W - 58} y={40} width={44} height={44} preserveAspectRatio="xMidYMid slice" clipPath="url(#googlePhotoClip)" />
        ) : (
          <text x={W - 36} y={70} fill="#FFFFFF" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fontWeight="600" textAnchor="middle">{initials}</text>
        )}

        {/* Tier label below header */}
        <text x={20} y={130} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.2" fontWeight="700">TIER</text>
        <text x={20} y={155} fill={tierColor} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="600">{tier?.name || member.tier}</text>

        {/* Points balance — primary field, very prominent */}
        <text x={W - 20} y={130} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.2" textAnchor="end" fontWeight="700">POINTS</text>
        <text x={W - 20} y={155} fill="#15161A" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fontWeight="600" textAnchor="end">{member.points.toLocaleString()}</text>

        <line x1={20} y1={172} x2={W - 20} y2={172} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />

        {/* Member name + ID */}
        <text x={20} y={192} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" fontWeight="700">MEMBER NAME</text>
        <text x={20} y={214} fill="#15161A" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fontWeight="500">{member.name}</text>

        <text x={20} y={236} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7.2" letterSpacing="2.2" fontWeight="700">MEMBER ID</text>
        <text x={20} y={258} fill={tierColor} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="14" fontWeight="700" letterSpacing="1.8">{member.id}</text>

        <line x1={20} y1={276} x2={W - 20} y2={276} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />

        {/* Field strip */}
        <text x={20} y={294} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7" letterSpacing="2.2" fontWeight="700">REDEEMABLE</text>
        <text x={20} y={316} fill={tierColor} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fontWeight="500">BHD {redeemable}</text>

        <text x={W / 2} y={294} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7" letterSpacing="2.2" textAnchor="middle" fontWeight="700">NIGHTS</text>
        <text x={W / 2} y={316} fill="#15161A" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fontWeight="500" textAnchor="middle">{member.lifetimeNights}</text>

        <text x={W - 20} y={294} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7" letterSpacing="2.2" textAnchor="end" fontWeight="700">EARN</text>
        <text x={W - 20} y={316} fill="#15161A" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fontWeight="500" textAnchor="end">{tier?.earnRate || 1}×</text>

        <line x1={20} y1={336} x2={W - 20} y2={336} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />

        {/* QR with surrounding card */}
        <rect x={(W - 140) / 2} y={350} width={140} height={140} fill="#F7F4ED" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
        <MockQRGroup value={member.id} size={114} fg="#15161A" bg="#F7F4ED" x={(W - 114) / 2} y={363} />

        {/* Member since + footer */}
        <text x={W / 2} y={510} fill="rgba(0,0,0,0.55)" fontFamily="'Manrope', sans-serif" fontSize="7.5" letterSpacing="2.2" textAnchor="middle" fontWeight="600">
          MEMBER SINCE {(member.joined || "—").toUpperCase()} · CHECK-IN {HOTEL.checkIn}
        </text>
        <text x={W / 2} y={528} fill="rgba(0,0,0,0.45)" fontFamily="'Manrope', sans-serif" fontSize="7" letterSpacing="2.2" textAnchor="middle" fontWeight="600">
          PRESENT THIS PASS AT FRONT DESK · {HOTEL.phone}
        </text>

        {/* Bottom accent bar */}
        <rect x={0} y={H - 6} width={W} height={6} fill={tierColor} />
      </g>

      {/* Border */}
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={18} ry={18} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
    </svg>
  );
});
GoogleWalletPass.displayName = "GoogleWalletPass";

// ---------------------------------------------------------------------------
// JSON payload builders — these mirror the shape of the real PassKit and
// Google Wallet APIs so the JSON files can be wired straight into a backend
// signing/issuing pipeline when the property is ready to go live.
// ---------------------------------------------------------------------------
function buildPkpassJson(member, tier, loyalty) {
  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);
  return {
    formatVersion:        1,
    passTypeIdentifier:   "pass.com.thelodgesuites.privilege",
    teamIdentifier:       "BAH-LDG-MNM",
    organizationName:     HOTEL.name,
    serialNumber:         member.id,
    description:          `${HOTEL.name} · LS Privilege ${(tier?.name || member.tier)}`,
    foregroundColor:      "rgb(255,255,255)",
    labelColor:           "rgb(255,255,255)",
    backgroundColor:      hexToRgbString(tier?.color || "#15161A"),
    logoText:             "LS Privilege",
    barcodes: [{
      message:         member.id,
      format:          "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
      altText:         member.id,
    }],
    storeCard: {
      headerFields:    [{ key: "tier",   label: "TIER",            value: (tier?.name || member.tier).toUpperCase() }],
      primaryFields:   [{ key: "points", label: "POINTS",          value: member.points }],
      secondaryFields: [
        { key: "redeem", label: "REDEEMABLE",      value: `BHD ${redeemable}` },
        { key: "nights", label: "LIFETIME NIGHTS", value: member.lifetimeNights, textAlignment: "PKTextAlignmentRight" },
      ],
      auxiliaryFields: [
        { key: "name", label: "MEMBER",    value: member.name },
        { key: "id",   label: "MEMBER ID", value: member.id, textAlignment: "PKTextAlignmentRight" },
      ],
      backFields: [
        { key: "since",    label: "MEMBER SINCE", value: member.joined },
        { key: "earn",     label: "EARN RATE",    value: `${tier?.earnRate || 1}× pt/BHD` },
        { key: "email",    label: "EMAIL",        value: member.email },
        { key: "phone",    label: "PHONE",        value: member.phone || "" },
        { key: "country",  label: "COUNTRY",      value: member.country || "" },
        { key: "idType",   label: "ID TYPE",      value: (member.idType || "").toUpperCase() },
        { key: "idNum",    label: "ID NUMBER",    value: member.idNumber || "" },
        { key: "idExp",    label: "ID EXPIRY",    value: member.idExpiry || "" },
        { key: "resv",     label: "RESERVATIONS", value: HOTEL.phone },
        { key: "addr",     label: "PROPERTY",     value: `${HOTEL.address}, ${HOTEL.location}` },
        { key: "checkin",  label: "CHECK-IN",     value: HOTEL.checkIn },
        { key: "checkout", label: "CHECK-OUT",    value: HOTEL.checkOut },
        { key: "ig",       label: "INSTAGRAM",    value: HOTEL.instagram },
        { key: "terms",    label: "TERMS",        value: "Points expire 24 months from earn date. Direct bookings only." },
      ],
    },
    relevantDate: new Date().toISOString(),
    voided:       false,
  };
}

function buildGoogleWalletObject(member, tier, loyalty) {
  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);
  const issuerId   = "3388000000022000000";
  const classId    = `${issuerId}.LS_PRIVILEGE`;
  const objectId   = `${issuerId}.${member.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  return {
    iss:     "ls-privilege@thelodgesuites.iam.gserviceaccount.com",
    aud:     "google",
    typ:     "savetowallet",
    iat:     Math.floor(Date.now() / 1000),
    payload: {
      loyaltyClasses: [{
        id:                   classId,
        issuerName:           HOTEL.name,
        programName:          "LS Privilege",
        programLogo:          { sourceUri: { uri: "https://thelodgesuites.com/logo.png" } },
        hexBackgroundColor:   tier?.color || "#15161A",
        countryCode:          "BH",
        rewardsTier:          tier?.name || member.tier,
        reviewStatus:         "underReview",
        homepageUri:          { uri: "https://thelodgesuites.com" },
      }],
      loyaltyObjects: [{
        id:           objectId,
        classId,
        state:        "ACTIVE",
        accountId:    member.id,
        accountName:  member.name,
        loyaltyPoints: {
          balance: { int: member.points },
          label:   "Points",
        },
        secondaryLoyaltyPoints: {
          balance: { string: `BHD ${redeemable}` },
          label:   "Redeemable",
        },
        barcode: {
          type:           "QR_CODE",
          value:          member.id,
          alternateText:  member.id,
        },
        textModulesData: [
          { id: "tier",     header: "Tier",            body: tier?.name || member.tier },
          { id: "nights",   header: "Lifetime nights", body: String(member.lifetimeNights) },
          { id: "since",    header: "Member since",    body: member.joined || "" },
          { id: "earn",     header: "Earn rate",       body: `${tier?.earnRate || 1}× pt/BHD` },
          { id: "checkin",  header: "Check-in / out",  body: `${HOTEL.checkIn} / ${HOTEL.checkOut}` },
        ],
        infoModuleData: {
          labelValueRows: [{
            columns: [
              { label: "Email", value: member.email },
              { label: "Phone", value: member.phone || "" },
            ],
          }, {
            columns: [
              { label: "ID type",   value: member.idType || "" },
              { label: "ID number", value: member.idNumber || "" },
            ],
          }],
        },
        linksModuleData: {
          uris: [
            { uri: `tel:${HOTEL.phone}`,                            description: "Reservations" },
            { uri: "https://instagram.com/thelodgesuites",          description: HOTEL.instagram },
            { uri: `https://maps.google.com/?q=${encodeURIComponent(HOTEL.address + ", " + HOTEL.location)}`, description: "Directions" },
          ],
        },
      }],
    },
  };
}

// ---------------------------------------------------------------------------
// File-download helpers — keep all the side effects in one place so the
// drawer component below is purely presentational.
// ---------------------------------------------------------------------------
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadSvgAsPng({ svgEl, width, height, filename, scale = 3, bg = null }) {
  const cloned = svgEl.cloneNode(true);
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  cloned.setAttribute("width", width);
  cloned.setAttribute("height", height);
  const xml = new XMLSerializer().serializeToString(cloned);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width  = width  * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await new Promise((resolve) => {
      canvas.toBlob((png) => {
        if (!png) { resolve(); return; }
        const dl = URL.createObjectURL(png);
        const a = document.createElement("a");
        a.href = dl; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(dl), 1500);
        resolve();
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildShareText(member, tier, loyalty) {
  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);
  return [
    `${HOTEL.name} · LS Privilege`,
    "",
    `Member:   ${member.name}`,
    `ID:       ${member.id}`,
    `Tier:     ${tier?.name || member.tier}`,
    `Points:   ${member.points.toLocaleString()} (BHD ${redeemable} redeemable)`,
    `Nights:   ${member.lifetimeNights} lifetime`,
    `Since:    ${member.joined || "—"}`,
    "",
    `Reservations: ${HOTEL.phone}`,
    `${HOTEL.address}`,
    `${HOTEL.location}`,
    `Check-in ${HOTEL.checkIn} · Check-out ${HOTEL.checkOut}`,
  ].join("\n");
}

function printPasses({ appleSvgEl, googleSvgEl, member }) {
  if (!appleSvgEl || !googleSvgEl) return;
  const appleXml  = new XMLSerializer().serializeToString(appleSvgEl);
  const googleXml = new XMLSerializer().serializeToString(googleSvgEl);
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) { pushToast({ message: "Pop-up blocked · allow pop-ups to print", kind: "warn" }); return; }
  win.document.write(`<!DOCTYPE html>
<html><head>
<title>${member.name} · LS Privilege</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { margin: 0; background: #F7F4ED; font-family: 'Manrope', sans-serif; padding: 30px; }
  .row { display: flex; gap: 28px; justify-content: center; align-items: flex-start; flex-wrap: wrap; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 500; color: #15161A; margin: 0 0 4px; }
  .sub { color: #6b6660; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 22px; }
  .label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #8a857c; font-weight: 700; margin-top: 12px; text-align: center; }
  @media print { body { background: white; } }
</style>
</head><body>
  <h1>${HOTEL.name} · LS Privilege</h1>
  <div class="sub">Member pass · ${member.name} · ${member.id}</div>
  <div class="row">
    <div><div class="label">Apple Wallet</div>${appleXml}</div>
    <div><div class="label">Google Wallet</div>${googleXml}</div>
  </div>
</body></html>`);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 350);
}

// ---------------------------------------------------------------------------
// WalletCardDrawer — full-page drawer with both passes side-by-side and the
// download / share / email / print toolbox. This is the surface the front
// desk uses when issuing a card to a guest.
// ---------------------------------------------------------------------------
export function WalletCardDrawer({ member, onClose }) {
  const p = usePalette();
  const { tiers, loyalty } = useData();
  const tier = tiers.find((t) => t.id === member.tier);
  const appleRef  = useRef(null);
  const googleRef = useRef(null);
  const [busy, setBusy] = useState(null);

  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);
  const safeId     = member.id.replace(/[^A-Za-z0-9_-]/g, "_");
  const verified   = !!(member.photo && member.idDoc && member.idNumber);

  const downloadApplePng = async () => {
    if (!appleRef.current) return;
    setBusy("apple-png");
    try {
      await downloadSvgAsPng({
        svgEl: appleRef.current, width: 340, height: 560,
        filename: `${safeId}_apple-wallet.png`, scale: 3,
      });
      pushToast({ message: "Apple Wallet card · PNG saved" });
    } catch (e) {
      pushToast({ message: "PNG export failed", kind: "error" });
    } finally { setBusy(null); }
  };

  const downloadGooglePng = async () => {
    if (!googleRef.current) return;
    setBusy("google-png");
    try {
      await downloadSvgAsPng({
        svgEl: googleRef.current, width: 340, height: 560,
        filename: `${safeId}_google-wallet.png`, scale: 3, bg: "#FFFFFF",
      });
      pushToast({ message: "Google Wallet card · PNG saved" });
    } catch (e) {
      pushToast({ message: "PNG export failed", kind: "error" });
    } finally { setBusy(null); }
  };

  const downloadPkpassJson = () => {
    downloadJson(buildPkpassJson(member, tier, loyalty), `${safeId}.pkpass.json`);
    pushToast({ message: "PassKit JSON saved · sign + zip on backend to issue .pkpass" });
  };

  const downloadGoogleWalletJson = () => {
    downloadJson(buildGoogleWalletObject(member, tier, loyalty), `${safeId}_google-wallet.json`);
    pushToast({ message: "Google Wallet JWT payload saved" });
  };

  const copyAddToWalletLink = async () => {
    const url = `https://wallet.thelodgesuites.com/issue/${encodeURIComponent(member.id)}?t=${Date.now().toString(36)}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ message: "Wallet enrol link copied" });
    } catch {
      pushToast({ message: url, kind: "warn" });
    }
  };

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText(member, tier, loyalty));
      pushToast({ message: "Card details copied" });
    } catch {
      pushToast({ message: "Clipboard not available", kind: "warn" });
    }
  };

  const shareNative = async () => {
    const text = buildShareText(member, tier, loyalty);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${member.name} · LS Privilege`, text });
        pushToast({ message: "Shared" });
      } catch (e) {
        if (e?.name !== "AbortError") pushToast({ message: "Share cancelled", kind: "warn" });
      }
    } else {
      copyShareText();
    }
  };

  const emailToMember = () => {
    if (!member.email) { pushToast({ message: "No email on file", kind: "warn" }); return; }
    const subject = `Your LS Privilege membership card · ${member.id}`;
    const body = [
      `Dear ${member.name},`,
      "",
      `Welcome to LS Privilege at ${HOTEL.name}. Your digital membership card is ready.`,
      "",
      `Member ID:    ${member.id}`,
      `Tier:         ${tier?.name || member.tier}`,
      `Points:       ${member.points.toLocaleString()}`,
      `Redeemable:   BHD ${redeemable}`,
      `Lifetime:     ${member.lifetimeNights} nights`,
      `Member since: ${member.joined || "—"}`,
      "",
      `Add to wallet: https://wallet.thelodgesuites.com/issue/${encodeURIComponent(member.id)}`,
      "",
      `Show this card or your member ID to the front desk on arrival.`,
      "",
      `${HOTEL.name}`,
      `${HOTEL.address}`,
      `${HOTEL.location}`,
      `Reservations: ${HOTEL.phone}`,
      `Check-in ${HOTEL.checkIn} · Check-out ${HOTEL.checkOut}`,
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const print = () => {
    printPasses({ appleSvgEl: appleRef.current, googleSvgEl: googleRef.current, member });
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="Wallet card"
      title={`${member.name} · ${member.id}`}
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Close</GhostBtn>
          <div className="flex-1" />
          <GhostBtn onClick={emailToMember} small><Mail size={11} /> Email member</GhostBtn>
          <GhostBtn onClick={print} small><Printer size={11} /> Print</GhostBtn>
          <PrimaryBtn onClick={shareNative} small><Share2 size={12} /> Share card</PrimaryBtn>
        </>
      }
    >
      {/* Status banner — verification is critical for check-in handover */}
      {!verified && (
        <div className="p-3 mb-6 flex items-start gap-3" style={{
          backgroundColor: p.bgPanelAlt, border: `1px solid ${p.warn}`,
          borderInlineStart: `4px solid ${p.warn}`, color: p.textSecondary,
          fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.5,
        }}>
          <AlertCircle size={14} style={{ color: p.warn, marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong style={{ color: p.warn, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.7rem" }}>Identity not verified</strong>
            <span> · Wallet cards can be issued, but the member must complete photo &amp; ID upload before redemption at check-in.</span>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-start mb-8">
        {/* Apple Wallet */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone size={14} style={{ color: p.accent }} />
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: p.accent }}>
              Apple Wallet
            </span>
          </div>
          <AppleWalletPass ref={appleRef} member={member} tier={tier} loyalty={loyalty} />
          <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
            <button onClick={downloadApplePng} disabled={busy === "apple-png"}
              className="flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                opacity: busy === "apple-png" ? 0.55 : 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <ImageIcon size={11} /> {busy === "apple-png" ? "Saving…" : "PNG"}
            </button>
            <button onClick={downloadPkpassJson}
              className="flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
            >
              <FileJson size={11} /> .pkpass JSON
            </button>
          </div>
        </div>

        {/* Center spine — divider + brand monogram */}
        <div className="hidden lg:flex flex-col items-center pt-12 self-stretch">
          <div style={{ width: 1, flex: 1, backgroundColor: p.border, minHeight: 200 }} />
          <span style={{
            margin: "12px 0",
            fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", fontStyle: "italic", color: p.textMuted,
          }}>or</span>
          <div style={{ width: 1, flex: 1, backgroundColor: p.border, minHeight: 200 }} />
        </div>

        {/* Google Wallet */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={14} style={{ color: p.accent }} />
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: p.accent }}>
              Google Wallet · Android
            </span>
          </div>
          <GoogleWalletPass ref={googleRef} member={member} tier={tier} loyalty={loyalty} />
          <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
            <button onClick={downloadGooglePng} disabled={busy === "google-png"}
              className="flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                opacity: busy === "google-png" ? 0.55 : 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <ImageIcon size={11} /> {busy === "google-png" ? "Saving…" : "PNG"}
            </button>
            <button onClick={downloadGoogleWalletJson}
              className="flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
            >
              <FileJson size={11} /> Save object JSON
            </button>
          </div>
        </div>
      </div>

      {/* Detail strip — what's actually on the card so the front desk can */}
      {/* read it back to the guest */}
      <Card title="On this card · check-in details" padded={false} className="mt-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Member name",     value: member.name },
            { label: "Member ID",       value: member.id, mono: true, accent: true },
            { label: "Tier",            value: tier?.name || member.tier, color: tier?.color },
            { label: "Earn rate",       value: `${tier?.earnRate || 1}× pt/BHD` },
            { label: "Points balance",  value: member.points.toLocaleString() },
            { label: "Redeemable",      value: `BHD ${redeemable}` },
            { label: "Lifetime nights", value: member.lifetimeNights },
            { label: "Member since",    value: member.joined || "—" },
            { label: "Email",           value: member.email },
            { label: "Phone",           value: member.phone || "—" },
            { label: "Country",         value: member.country || "—" },
            { label: "ID type",         value: (member.idType || "—").toUpperCase() },
            { label: "ID number",       value: member.idNumber || "—", mono: true },
            { label: "ID expiry",       value: member.idExpiry || "—" },
            { label: "Verification",    value: verified ? "Verified" : "Pending", color: verified ? p.success : p.warn },
            { label: "QR contents",     value: member.id, mono: true },
          ].map((f) => (
            <div key={f.label} className="px-5 py-3.5" style={{ borderBottom: `1px solid ${p.border}`, borderInlineEnd: `1px solid ${p.border}` }}>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{f.label}</div>
              <div className="mt-1.5" style={{
                color: f.color || (f.accent ? p.accent : p.textPrimary),
                fontFamily: f.mono ? "ui-monospace, 'SF Mono', Menlo, monospace" : "'Manrope', sans-serif",
                fontSize: "0.86rem", fontWeight: f.mono || f.accent ? 700 : 500,
                wordBreak: "break-word",
              }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Toolbox — secondary actions for distribution */}
      <Card title="Distribution" className="mt-6">
        <div className="grid md:grid-cols-3 gap-3">
          <ToolboxBtn icon={Copy}    label="Copy enrol link"    sub="https://wallet.thelodgesuites.com/issue/…" onClick={copyAddToWalletLink} />
          <ToolboxBtn icon={Mail}    label="Email member"       sub={member.email || "no email on file"}        onClick={emailToMember} />
          <ToolboxBtn icon={Printer} label="Print preview"      sub="Both cards on a single A4 sheet"           onClick={print} />
          <ToolboxBtn icon={QrCode}  label="Copy member ID"     sub={member.id}                                 onClick={async () => {
            try { await navigator.clipboard.writeText(member.id); pushToast({ message: "Member ID copied" }); }
            catch { pushToast({ message: "Clipboard not available", kind: "warn" }); }
          }} />
          <ToolboxBtn icon={Share2}  label="Share card text"    sub="Native share or copy"                      onClick={shareNative} />
          <ToolboxBtn icon={Download} label="Copy plain text"   sub="Full member detail block"                  onClick={copyShareText} />
        </div>
        <p className="mt-4" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.6 }}>
          The PNG exports are immediately shareable via WhatsApp, SMS or email. The JSON payloads mirror the live PassKit / Google Wallet API
          shape — sign and zip the .pkpass JSON on your backend to mint a real Apple Wallet pass; sign the Google Wallet JWT to enable
          Add-to-Wallet links on Android. The QR encodes the member ID so the front desk's existing scanner can pull up the profile at check-in.
        </p>
      </Card>
    </Drawer>
  );
}

function ToolboxBtn({ icon: Icon, label, sub, onClick }) {
  const p = usePalette();
  return (
    <button
      onClick={onClick}
      className="text-start p-4 flex items-start gap-3"
      style={{
        backgroundColor: p.bgPanel, border: `1px solid ${p.border}`,
        fontFamily: "'Manrope', sans-serif", cursor: "pointer",
        transition: "border-color 120ms, background-color 120ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.backgroundColor = p.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = p.bgPanel; }}
    >
      <span style={{
        width: 32, height: 32, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: `${p.accent}1A`, color: p.accent,
        border: `1px solid ${p.accent}40`,
      }}>
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="block" style={{ color: p.textPrimary, fontSize: "0.82rem", fontWeight: 700 }}>{label}</span>
        <span className="block" style={{
          color: p.textMuted, fontSize: "0.72rem", marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{sub}</span>
      </span>
    </button>
  );
}
