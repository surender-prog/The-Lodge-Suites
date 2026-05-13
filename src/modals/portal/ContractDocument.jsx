import React from "react";
import { Download, Mail, Printer, Send, X } from "lucide-react";
import { usePalette } from "./theme.jsx";
import { legalLine, summarizeTax, useData, formatCurrency, resolveCurrency, getCurrentCurrency } from "../../data/store.jsx";

// ---------------------------------------------------------------------------
// ContractDocument — printable contract layout shared between Corporate and
// Travel-Agent contracts. The same data shape feeds:
//   • <ContractPreviewModal /> — in-app preview drawer
//   • buildContractHtml() — self-contained HTML string for download / print
//
// The visual is intentionally close to the source PDFs / DOCX agreements:
// black on cream paper, classic typography, A4 print-ready.
//
// Property identity (legal name, address, CR/VAT) is sourced from the
// Property admin section via `useData().hotelInfo`. Non-component callers
// (HTML / email helpers) accept it explicitly as the `hotel` option.
// ---------------------------------------------------------------------------

const FALLBACK_HOTEL = {
  name:     "The Lodge Suites",
  legal:    "The Lodge Hotel Apartments W.L.L.",
  tagline:  "We Speak Your Language",
  address:  "Building 916, Road 4019, Block 340",
  area:     "Shabab Avenue, Juffair, Manama",
  country:  "Kingdom of Bahrain",
  cr:       "#####",
  vat:      "#####",
  phone:    "+973 1616 8146",
  whatsapp: "+973 3306 9641",
  email:    "frontoffice@thelodgesuites.com",
  emailFom: "fom@thelodgesuites.com",
  emailSales: "sales@exploremena.com",
  website:  "www.thelodgesuites.com",
  checkIn:  "14:00",
  checkOut: "12:00",
};

const ROOM_KEYS = [
  { key: "studio",   label: "Lodge Studio",            size: "43 sqm",  level: "9–16",  occ: "2 Adults",            beds: "1 King" },
  { key: "oneBed",   label: "Classic One-Bedroom Suite", size: "60 sqm",  level: "9–16",  occ: "2 Adults + 1 Child",  beds: "1 King" },
  { key: "twoBed",   label: "Deluxe Two-Bedroom Suite", size: "142 sqm", level: "17–24", occ: "4 Adults + 1 Child",  beds: "2 King" },
  { key: "threeBed", label: "Luxury Three-Bedroom",     size: "150 sqm", level: "17–24", occ: "4 Adults + 2 Children", beds: "3 King" },
];

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const todayLong = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------------------
// Field readers — both kinds use slightly different keys for the rate maps,
// so wrap them in a small reader helper that returns a normalized record.
// ---------------------------------------------------------------------------
function readRates(c, kind) {
  const isCorp = kind === "corporate";
  return {
    name:    isCorp ? c.account : c.name,
    daily:   isCorp ? (c.dailyRates   || {}) : (c.dailyNet   || {}),
    weekend: isCorp ? (c.weekendRates || {}) : (c.weekendNet || {}),
    monthly: isCorp ? (c.monthlyRates || {}) : (c.monthlyNet || {}),
    industry: c.industry,
    commissionPct: c.commissionPct,
    marketingFundPct: c.marketingFundPct,
  };
}

const hasAnyRates = (m) => Object.values(m || {}).some(v => Number(v) > 0);

// ---------------------------------------------------------------------------
// React preview component — used in the <ContractPreviewModal />.
// ---------------------------------------------------------------------------
export function ContractDocumentView({ contract, kind }) {
  const data = useData();
  const HOTEL = data?.hotelInfo || FALLBACK_HOTEL;
  // Tax summary pulled live from the configured Tax Setup pattern so any
  // rate / name / component change in admin updates every contract.
  const TAX_LABEL = summarizeTax(data?.tax) || "10% Service Charge, 5% Government Levy, 10% VAT";
  const r = readRates(contract, kind);
  const isCorp = kind === "corporate";
  const showWeekday = hasAnyRates(r.daily);
  const showWeekend = hasAnyRates(r.weekend);
  const showMonthly = hasAnyRates(r.monthly);

  return (
    <div style={{
      backgroundColor: "#FBF8F1", color: "#15161A", padding: "44px 56px",
      fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.55,
      maxWidth: 860, margin: "0 auto", boxShadow: "0 4px 22px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 18, borderBottom: "2px solid #15161A" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "2.3rem", fontStyle: "italic", lineHeight: 1.05 }}>{HOTEL.name}</div>
          <div style={{ fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", color: "#8A7A4F", fontWeight: 700, marginTop: 4 }}>{HOTEL.tagline}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.78rem" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.6rem", letterSpacing: "0.05em" }}>
            {isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract Rates"}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.74rem", color: "#444" }}>
            #{contract.id} · Issued {todayLong()}
          </div>
        </div>
      </div>

      {/* Recipient + property identity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginTop: 24 }}>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F", marginBottom: 6 }}>Issued to</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", fontWeight: 600 }}>{r.name || "—"}</div>
          {isCorp && r.industry && <div style={{ color: "#444", fontSize: "0.78rem" }}>{r.industry}</div>}
          {contract.pocName  && <div style={{ marginTop: 8 }}>Attn: <strong>{contract.pocName}</strong></div>}
          {contract.pocEmail && <div style={{ color: "#444" }}>{contract.pocEmail}</div>}
          {contract.pocPhone && <div style={{ color: "#444" }}>{contract.pocPhone}</div>}
        </div>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F", marginBottom: 6 }}>Issued by</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.2rem", fontWeight: 600 }}>{HOTEL.legal}</div>
          <div style={{ color: "#444" }}>{HOTEL.address}</div>
          <div style={{ color: "#444" }}>{HOTEL.area}</div>
          <div style={{ color: "#444" }}>{[HOTEL.country, legalLine(HOTEL)].filter(Boolean).join(" · ")}</div>
          <div style={{ color: "#444", marginTop: 6 }}>T: {HOTEL.phone} · WhatsApp: {HOTEL.whatsapp}</div>
          <div style={{ color: "#444" }}>{HOTEL.email}</div>
        </div>
      </div>

      {/* Greeting */}
      <p style={{ marginTop: 26, fontSize: "0.92rem", lineHeight: 1.7 }}>
        Greetings from <strong>{HOTEL.name}</strong>! We are pleased to extend the following negotiated rate agreement
        to <strong>{r.name || "your organisation"}</strong>, a boutique luxury serviced-apartment property of 72 elegantly
        appointed suites in Juffair, Manama. The rates set out below are valid from <strong>{fmtDate(contract.startsOn)}</strong>
        {" "}to <strong>{fmtDate(contract.endsOn)}</strong> and supersede all previous quotations and communications.
      </p>

      {/* Suite categories reference table */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Suite categories</h3>
      <table style={tblStyle} cellPadding={0}>
        <thead>
          <tr>
            <th style={thStyle}>Suite type</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Floor</th>
            <th style={thStyle}>Occupancy</th>
            <th style={thStyle}>Bedding</th>
          </tr>
        </thead>
        <tbody>
          {ROOM_KEYS.map((rk) => (
            <tr key={rk.key}>
              <td style={tdStyle}><strong>{rk.label}</strong></td>
              <td style={tdStyle}>{rk.size}</td>
              <td style={tdStyle}>{rk.level} flr.</td>
              <td style={tdStyle}>{rk.occ}</td>
              <td style={tdStyle}>{rk.beds}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Rate table */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 28, marginBottom: 8 }}>
        Negotiated rates {!isCorp ? <span style={{ fontSize: "0.78rem", color: "#666", fontStyle: "italic", marginInlineStart: 8 }}>(Net &amp; non-commissionable)</span> : null}
      </h3>
      {(showWeekday || showWeekend || showMonthly) ? (
        <table style={tblStyle} cellPadding={0}>
          <thead>
            <tr>
              <th style={thStyle}>Suite type</th>
              {showWeekday && <th style={thStyle}>Weekday {isCorp ? "rate" : "net"}</th>}
              {showWeekend && <th style={thStyle}>Weekend {isCorp ? "rate" : "net"}</th>}
              {showMonthly && <th style={thStyle}>Monthly {isCorp ? "rate" : "net"}</th>}
            </tr>
          </thead>
          <tbody>
            {ROOM_KEYS.map((rk) => {
              const d  = Number(r.daily[rk.key]   || 0);
              const w  = Number(r.weekend[rk.key] || 0);
              const m  = Number(r.monthly[rk.key] || 0);
              const allZero = d === 0 && w === 0 && m === 0;
              if (allZero) return null;
              return (
                <tr key={rk.key}>
                  <td style={tdStyle}><strong>{rk.label}</strong></td>
                  {showWeekday && <td style={tdNumStyle}>{d > 0 ? formatCurrency(d) : "—"}</td>}
                  {showWeekend && <td style={tdNumStyle}>{w > 0 ? formatCurrency(w) : "—"}</td>}
                  {showMonthly && <td style={tdNumStyle}>{m > 0 ? formatCurrency(m) : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#666", fontStyle: "italic" }}>No rates have been set on this contract.</p>
      )}

      {/* Commercial summary line */}
      <div style={{ marginTop: 14, fontSize: "0.84rem", lineHeight: 1.7, color: "#222" }}>
        <p>
          {contract.taxIncluded
            ? <>All rates above are in <strong>{getCurrentCurrency().code}</strong>, <strong>inclusive</strong> of {TAX_LABEL}, on a per-room, per-night basis (room only).</>
            : <>All rates above are in <strong>{getCurrentCurrency().code}</strong>, exclusive of taxes ({TAX_LABEL}) which will be added at invoicing.</>
          }
        </p>
        {Number(contract.accommodationFee) > 0 && (
          <p style={{ marginTop: 6 }}>
            A <strong>Hotel Accommodation Fee of {formatCurrency(Number(contract.accommodationFee))} net per room per night</strong> is additional and not included in the contracted rates.
          </p>
        )}
        {!isCorp && (typeof r.commissionPct === "number") && (
          <p style={{ marginTop: 6 }}>
            <strong>Commission:</strong>{" "}
            {r.commissionPct === 0
              ? <>Net &amp; non-commissionable.</>
              : <>{r.commissionPct}% on stayed value{r.marketingFundPct ? ` plus ${r.marketingFundPct}% marketing fund` : ""}, payable on departure.</>}
          </p>
        )}
        {Number(contract.weekendUpliftPct) > 0 && !showWeekend && (
          <p style={{ marginTop: 6 }}>
            Weekend uplift of <strong>{contract.weekendUpliftPct}%</strong> applies to all rates from Thursday to Friday inclusive.
          </p>
        )}
      </div>

      {/* Inclusions */}
      {Object.values(contract.inclusions || {}).some(Boolean) && (
        <>
          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Inclusions</h3>
          <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.7 }}>
            {contract.inclusions?.breakfast    && <li>Daily breakfast</li>}
            {contract.inclusions?.lateCheckOut && <li>Guaranteed late check-out (subject to availability)</li>}
            {contract.inclusions?.parking      && <li>Complimentary on-site parking</li>}
            {contract.inclusions?.wifi         && <li>High-speed Wi-Fi throughout the property</li>}
            {contract.inclusions?.meetingRoom  && <li>Meeting room access (subject to availability)</li>}
          </ul>
        </>
      )}

      {/* House privileges */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>House privileges</h3>
      <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.7, columns: 2 }}>
        <li>24-hour Front Desk</li>
        <li>Express check-in &amp; check-out</li>
        <li>Daily housekeeping</li>
        <li>24-hour security</li>
        <li>Concierge service</li>
        <li>Wireless high-speed internet</li>
        <li>Airport shuttle (chargeable)</li>
        <li>24-hour business centre</li>
      </ul>

      {/* Event supplements */}
      {(contract.eventSupplements || []).length > 0 && (
        <>
          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Event-period supplements</h3>
          <p style={{ fontSize: "0.84rem", color: "#444", marginBottom: 8 }}>
            The hotel allocates a limited number of rooms during major events, with the following supplements applied per room, per night, on top of the contracted rate. Inclusive of starting and finishing dates.
          </p>
          <table style={tblStyle} cellPadding={0}>
            <thead>
              <tr>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Dates</th>
                <th style={thStyle}>Supplement</th>
              </tr>
            </thead>
            <tbody>
              {contract.eventSupplements.map((evt) => (
                <tr key={evt.id}>
                  <td style={tdStyle}><strong>{evt.name}</strong></td>
                  <td style={tdStyle}>
                    {fmtDate(evt.fromDate)}{evt.fromDate !== evt.toDate ? ` → ${fmtDate(evt.toDate)}` : ""}
                  </td>
                  <td style={tdNumStyle}>{formatCurrency(Number(evt.supplement))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Terms & conditions */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Terms &amp; conditions</h3>
      <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.7, fontSize: "0.84rem" }}>
        <li>Validity: <strong>{fmtDate(contract.startsOn)}</strong> to <strong>{fmtDate(contract.endsOn)}</strong>{contract.signedOn ? ` · Signed on ${fmtDate(contract.signedOn)}` : ""}.</li>
        <li>Check-in {HOTEL.checkIn} · Check-out {HOTEL.checkOut}. Visitors require valid ID or passport at the front desk.</li>
        <li>Children up to 11 years stay free of charge in existing bedding.</li>
        <li>Rooms are subject to stop-sale based on house occupancy; advance bookings are encouraged.</li>
        {contract.cancellationPolicy && <li><strong>Cancellation:</strong> {contract.cancellationPolicy}</li>}
        <li>Payment terms: <strong>{contract.paymentTerms}</strong>{Number(contract.creditLimit) > 0 ? ` · credit limit ${formatCurrency(Number(contract.creditLimit))}` : ""}.</li>
        {!isCorp && <li>Reservations: email <strong>{HOTEL.email}</strong> / <strong>{HOTEL.emailFom}</strong>; WhatsApp {HOTEL.whatsapp}.</li>}
        {isCorp && <li>Direct billing requires CR copy and (for government accounts) an LPO at booking confirmation.</li>}
      </ul>

      {/* Notes */}
      {contract.notes && (
        <>
          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Additional notes</h3>
          <p style={{ fontSize: "0.84rem", lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#333" }}>{contract.notes}</p>
        </>
      )}

      {/* Closing */}
      <p style={{ marginTop: 28, fontSize: "0.88rem", lineHeight: 1.7 }}>
        We hope that the above information and privilege rates are to your satisfaction and we look forward to having
        your valued guests stay with us at <strong>{HOTEL.name}</strong>. Should you require any clarifications, please
        contact us at <strong>{HOTEL.email}</strong> or <strong>{HOTEL.emailSales}</strong>.
      </p>
      <p style={{ marginTop: 6, fontSize: "0.88rem", lineHeight: 1.7 }}>
        Kindly counter-sign this letter to confirm acceptance of the terms.
      </p>

      {/* Signatures */}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}>
        <div>
          <div style={{ borderTop: "1px solid #15161A", paddingTop: 6, fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#666", fontWeight: 700 }}>For {HOTEL.name}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.1rem", fontWeight: 600, marginTop: 18 }}>Aparajeet Mathad</div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>Front Office Manager</div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>{HOTEL.phone} · {HOTEL.emailFom}</div>
        </div>
        <div>
          <div style={{ borderTop: "1px solid #15161A", paddingTop: 6, fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#666", fontWeight: 700 }}>Accepted by</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.1rem", fontWeight: 600, marginTop: 18 }}>
            {contract.pocName || `For ${r.name || "the company"}`}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>Authorised Signatory</div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>Company Seal &amp; Date</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 36, paddingTop: 14, borderTop: "1px solid #C9A961", fontSize: "0.7rem", color: "#666", textAlign: "center", letterSpacing: "0.05em" }}>
        {HOTEL.name} · {HOTEL.address}, {HOTEL.area} · {HOTEL.country} · {HOTEL.phone} · {HOTEL.email} · {HOTEL.website}
      </div>
    </div>
  );
}

const tblStyle  = { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", marginTop: 4 };
const thStyle   = { borderBottom: "1.5px solid #15161A", padding: "8px 10px", textAlign: "start", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: "#15161A", backgroundColor: "rgba(201,169,97,0.08)" };
const tdStyle   = { borderBottom: "1px solid #d8d2c4", padding: "8px 10px", verticalAlign: "top", color: "#222" };
const tdNumStyle = { ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#15161A" };

// ---------------------------------------------------------------------------
// Self-contained HTML for download — produces a styled, printable single
// HTML file that mirrors <ContractDocumentView />.
// ---------------------------------------------------------------------------
export function buildContractHtml(contract, kind, { hotel, tax } = {}) {
  // Pull the live tax-summary string from the current Tax Setup if a
  // `tax` config was passed by the caller; otherwise fall back to the
  // bundled-default label so non-React callers (legacy exports) still
  // produce a sane document.
  const TAX_LABEL = summarizeTax(tax) || "10% Service Charge, 5% Government Levy, 10% VAT";
  const HOTEL = hotel || FALLBACK_HOTEL;
  const r = readRates(contract, kind);
  const isCorp = kind === "corporate";
  const showWeekday = hasAnyRates(r.daily);
  const showWeekend = hasAnyRates(r.weekend);
  const showMonthly = hasAnyRates(r.monthly);

  const rateRows = ROOM_KEYS.map((rk) => {
    const d = Number(r.daily[rk.key]   || 0);
    const w = Number(r.weekend[rk.key] || 0);
    const m = Number(r.monthly[rk.key] || 0);
    if (d === 0 && w === 0 && m === 0) return "";
    return `<tr>
      <td><strong>${rk.label}</strong></td>
      ${showWeekday ? `<td class="num">${d > 0 ? escapeHtml(formatCurrency(d)) : "—"}</td>` : ""}
      ${showWeekend ? `<td class="num">${w > 0 ? escapeHtml(formatCurrency(w)) : "—"}</td>` : ""}
      ${showMonthly ? `<td class="num">${m > 0 ? escapeHtml(formatCurrency(m)) : "—"}</td>` : ""}
    </tr>`;
  }).filter(Boolean).join("");

  const incl = [
    contract.inclusions?.breakfast    && "Daily breakfast",
    contract.inclusions?.lateCheckOut && "Guaranteed late check-out (subject to availability)",
    contract.inclusions?.parking      && "Complimentary on-site parking",
    contract.inclusions?.wifi         && "High-speed Wi-Fi throughout the property",
    contract.inclusions?.meetingRoom  && "Meeting room access (subject to availability)",
  ].filter(Boolean);

  const events = (contract.eventSupplements || []).map((evt) => `<tr>
    <td><strong>${escapeHtml(evt.name || "")}</strong></td>
    <td>${fmtDate(evt.fromDate)}${evt.fromDate !== evt.toDate ? " → " + fmtDate(evt.toDate) : ""}</td>
    <td class="num">${escapeHtml(formatCurrency(Number(evt.supplement)))}</td>
  </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract Rates")} · ${escapeHtml(contract.id)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Manrope', system-ui, -apple-system, sans-serif; color: #15161A; background: #F5F1E8; margin: 0; padding: 30px; line-height: 1.55; font-size: 13px; }
  .doc { background: #FBF8F1; padding: 44px 56px; max-width: 860px; margin: 0 auto; box-shadow: 0 4px 22px rgba(0,0,0,0.08); }
  h1, h2, h3, .display { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; }
  h1 { font-size: 2.3rem; font-style: italic; margin: 0; line-height: 1.05; }
  h2 { font-size: 1.6rem; margin: 0; letter-spacing: 0.04em; }
  h3 { font-size: 1.4rem; margin: 24px 0 8px; }
  .eyebrow { font-size: 0.66rem; letter-spacing: 0.28em; text-transform: uppercase; color: #8A7A4F; font-weight: 700; }
  .muted { color: #555; }
  .accent { color: #8A7A4F; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #15161A; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; margin-top: 4px; }
  th { border-bottom: 1.5px solid #15161A; padding: 8px 10px; text-align: start; font-size: 0.66rem; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; background: rgba(201,169,97,0.08); }
  td { border-bottom: 1px solid #d8d2c4; padding: 8px 10px; vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #15161A; }
  ul.cols { columns: 2; margin: 0; padding-inline-start: 22px; }
  ul { margin: 0; padding-inline-start: 22px; line-height: 1.7; }
  .sig { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 56px; }
  .sig .line { border-top: 1px solid #15161A; padding-top: 6px; font-size: 0.7rem; letter-spacing: 0.22em; text-transform: uppercase; color: #666; font-weight: 700; }
  .footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #C9A961; font-size: 0.7rem; color: #666; text-align: center; letter-spacing: 0.05em; }
  .pill { display: inline-block; padding: 1px 8px; font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; border: 1px solid #C9A961; color: #8A7A4F; margin-inline-start: 8px; }
  @media print {
    body { background: #FBF8F1; padding: 0; }
    .doc { box-shadow: none; padding: 0; }
  }
</style>
</head><body>
<div class="doc">
  <div class="header">
    <div>
      <h1>${escapeHtml(HOTEL.name)}</h1>
      <div class="eyebrow" style="margin-top:4px;">${escapeHtml(HOTEL.tagline)}</div>
    </div>
    <div style="text-align:right; font-size:0.78rem;">
      <h2>${escapeHtml(isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract Rates")}</h2>
      <div class="muted" style="margin-top:4px; font-size:0.74rem;">#${escapeHtml(contract.id)} · Issued ${escapeHtml(todayLong())}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Issued to</div>
      <div class="display" style="font-size:1.4rem;">${escapeHtml(r.name || "—")}</div>
      ${isCorp && r.industry ? `<div class="muted" style="font-size:0.78rem;">${escapeHtml(r.industry)}</div>` : ""}
      ${contract.pocName  ? `<div style="margin-top:8px;">Attn: <strong>${escapeHtml(contract.pocName)}</strong></div>` : ""}
      ${contract.pocEmail ? `<div class="muted">${escapeHtml(contract.pocEmail)}</div>` : ""}
      ${contract.pocPhone ? `<div class="muted">${escapeHtml(contract.pocPhone)}</div>` : ""}
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Issued by</div>
      <div class="display" style="font-size:1.2rem;">${escapeHtml(HOTEL.legal)}</div>
      <div class="muted">${escapeHtml(HOTEL.address)}</div>
      <div class="muted">${escapeHtml(HOTEL.area)}</div>
      <div class="muted">${escapeHtml([HOTEL.country, legalLine(HOTEL)].filter(Boolean).join(" · "))}</div>
      <div class="muted" style="margin-top:6px;">T: ${escapeHtml(HOTEL.phone)} · WhatsApp: ${escapeHtml(HOTEL.whatsapp)}</div>
      <div class="muted">${escapeHtml(HOTEL.email)}</div>
    </div>
  </div>

  <p style="margin-top:26px; font-size:0.92rem; line-height:1.7;">
    Greetings from <strong>${escapeHtml(HOTEL.name)}</strong>! We are pleased to extend the following negotiated rate
    agreement to <strong>${escapeHtml(r.name || "your organisation")}</strong>, a boutique luxury serviced-apartment
    property of 72 elegantly appointed suites in Juffair, Manama. The rates set out below are valid from
    <strong>${escapeHtml(fmtDate(contract.startsOn))}</strong> to <strong>${escapeHtml(fmtDate(contract.endsOn))}</strong>
    and supersede all previous quotations and communications.
  </p>

  <h3>Suite categories</h3>
  <table>
    <thead><tr><th>Suite type</th><th>Size</th><th>Floor</th><th>Occupancy</th><th>Bedding</th></tr></thead>
    <tbody>
      ${ROOM_KEYS.map((rk) => `<tr><td><strong>${escapeHtml(rk.label)}</strong></td><td>${rk.size}</td><td>${rk.level} flr.</td><td>${rk.occ}</td><td>${rk.beds}</td></tr>`).join("")}
    </tbody>
  </table>

  <h3>Negotiated rates ${!isCorp ? `<span class="muted" style="font-size:0.78rem; font-style:italic; font-family:Manrope, sans-serif; font-weight:400;">(Net &amp; non-commissionable)</span>` : ""}</h3>
  ${rateRows ? `<table>
    <thead><tr>
      <th>Suite type</th>
      ${showWeekday ? `<th>Weekday ${isCorp ? "rate" : "net"}</th>` : ""}
      ${showWeekend ? `<th>Weekend ${isCorp ? "rate" : "net"}</th>` : ""}
      ${showMonthly ? `<th>Monthly ${isCorp ? "rate" : "net"}</th>` : ""}
    </tr></thead>
    <tbody>${rateRows}</tbody>
  </table>` : `<p class="muted" style="font-style:italic;">No rates have been set on this contract.</p>`}

  <div style="margin-top:14px; font-size:0.84rem; line-height:1.7; color:#222;">
    <p>${contract.taxIncluded
      ? `All rates above are in <strong>${escapeHtml(getCurrentCurrency().code)}</strong>, <strong>inclusive</strong> of ${TAX_LABEL}, on a per-room, per-night basis (room only).`
      : `All rates above are in <strong>${escapeHtml(getCurrentCurrency().code)}</strong>, exclusive of taxes (${TAX_LABEL}) which will be added at invoicing.`}</p>
    ${Number(contract.accommodationFee) > 0
      ? `<p style="margin-top:6px;">A <strong>Hotel Accommodation Fee of ${escapeHtml(formatCurrency(Number(contract.accommodationFee)))} net per room per night</strong> is additional and not included in the contracted rates.</p>`
      : ""}
    ${(!isCorp && typeof r.commissionPct === "number")
      ? `<p style="margin-top:6px;"><strong>Commission:</strong> ${r.commissionPct === 0 ? "Net &amp; non-commissionable." : `${r.commissionPct}% on stayed value${r.marketingFundPct ? ` plus ${r.marketingFundPct}% marketing fund` : ""}, payable on departure.`}</p>`
      : ""}
    ${(Number(contract.weekendUpliftPct) > 0 && !showWeekend)
      ? `<p style="margin-top:6px;">Weekend uplift of <strong>${contract.weekendUpliftPct}%</strong> applies to all rates from Thursday to Friday inclusive.</p>`
      : ""}
  </div>

  ${incl.length > 0 ? `<h3>Inclusions</h3><ul>${incl.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}

  <h3>House privileges</h3>
  <ul class="cols">
    <li>24-hour Front Desk</li>
    <li>Express check-in &amp; check-out</li>
    <li>Daily housekeeping</li>
    <li>24-hour security</li>
    <li>Concierge service</li>
    <li>Wireless high-speed internet</li>
    <li>Airport shuttle (chargeable)</li>
    <li>24-hour business centre</li>
  </ul>

  ${events ? `<h3>Event-period supplements</h3>
  <p class="muted" style="font-size:0.84rem; margin-bottom:8px;">The hotel allocates a limited number of rooms during major events, with the following supplements applied per room, per night, on top of the contracted rate. Inclusive of starting and finishing dates.</p>
  <table><thead><tr><th>Event</th><th>Dates</th><th>Supplement</th></tr></thead><tbody>${events}</tbody></table>` : ""}

  <h3>Terms &amp; conditions</h3>
  <ul style="font-size:0.84rem;">
    <li>Validity: <strong>${escapeHtml(fmtDate(contract.startsOn))}</strong> to <strong>${escapeHtml(fmtDate(contract.endsOn))}</strong>${contract.signedOn ? ` · Signed on ${escapeHtml(fmtDate(contract.signedOn))}` : ""}.</li>
    <li>Check-in ${HOTEL.checkIn} · Check-out ${HOTEL.checkOut}. Visitors require valid ID or passport at the front desk.</li>
    <li>Children up to 11 years stay free of charge in existing bedding.</li>
    <li>Rooms are subject to stop-sale based on house occupancy; advance bookings are encouraged.</li>
    ${contract.cancellationPolicy ? `<li><strong>Cancellation:</strong> ${escapeHtml(contract.cancellationPolicy)}</li>` : ""}
    <li>Payment terms: <strong>${escapeHtml(contract.paymentTerms || "—")}</strong>${Number(contract.creditLimit) > 0 ? ` · credit limit ${escapeHtml(formatCurrency(Number(contract.creditLimit)))}` : ""}.</li>
    ${!isCorp ? `<li>Reservations: email <strong>${escapeHtml(HOTEL.email)}</strong> / <strong>${escapeHtml(HOTEL.emailFom)}</strong>; WhatsApp ${escapeHtml(HOTEL.whatsapp)}.</li>` : ""}
    ${isCorp ? `<li>Direct billing requires CR copy and (for government accounts) an LPO at booking confirmation.</li>` : ""}
  </ul>

  ${contract.notes ? `<h3>Additional notes</h3><p style="font-size:0.84rem; line-height:1.7; white-space:pre-wrap; color:#333;">${escapeHtml(contract.notes)}</p>` : ""}

  <p style="margin-top:28px; font-size:0.88rem; line-height:1.7;">
    We hope that the above information and privilege rates are to your satisfaction and we look forward to having
    your valued guests stay with us at <strong>${escapeHtml(HOTEL.name)}</strong>. Should you require any clarifications,
    please contact us at <strong>${escapeHtml(HOTEL.email)}</strong> or <strong>${escapeHtml(HOTEL.emailSales)}</strong>.
  </p>
  <p style="margin-top:6px; font-size:0.88rem; line-height:1.7;">
    Kindly counter-sign this letter to confirm acceptance of the terms.
  </p>

  <div class="sig">
    <div>
      <div class="line">For ${escapeHtml(HOTEL.name)}</div>
      <div class="display" style="font-size:1.1rem; margin-top:18px;">Aparajeet Mathad</div>
      <div class="muted" style="font-size:0.78rem;">Front Office Manager</div>
      <div class="muted" style="font-size:0.78rem;">${escapeHtml(HOTEL.phone)} · ${escapeHtml(HOTEL.emailFom)}</div>
    </div>
    <div>
      <div class="line">Accepted by</div>
      <div class="display" style="font-size:1.1rem; margin-top:18px;">${escapeHtml(contract.pocName || `For ${r.name || "the company"}`)}</div>
      <div class="muted" style="font-size:0.78rem;">Authorised Signatory</div>
      <div class="muted" style="font-size:0.78rem;">Company Seal &amp; Date</div>
    </div>
  </div>

  <div class="footer">
    ${escapeHtml(HOTEL.name)} · ${escapeHtml(HOTEL.address)}, ${escapeHtml(HOTEL.area)} · ${escapeHtml(HOTEL.country)} · ${escapeHtml(HOTEL.phone)} · ${escapeHtml(HOTEL.email)} · ${escapeHtml(HOTEL.website)}
  </div>
</div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Side-effect helpers — download HTML, open mailto:, print via popup.
// Each can be called directly from a row action button (without opening
// the preview drawer) or from inside the preview itself.
// ---------------------------------------------------------------------------
export function downloadContract(contract, kind, opts = {}) {
  const html = buildContractHtml(contract, kind, opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const safeId = String(contract.id || "contract").replace(/[^A-Za-z0-9_-]/g, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `LS-${kind === "corporate" ? "Corporate" : "Wholesaler"}-${safeId}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function printContract(contract, kind, opts = {}) {
  const html = buildContractHtml(contract, kind, opts);
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 350);
  return true;
}

export function emailContract(contract, kind, hotel, tax) {
  const HOTEL = hotel || FALLBACK_HOTEL;
  const TAX_LABEL = summarizeTax(tax) || "10% Service Charge, 5% Gov. Levy and 10% VAT";
  const r = readRates(contract, kind);
  const isCorp = kind === "corporate";
  const subject = `${HOTEL.name} · ${isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract"} · ${contract.id}`;

  const lines = [
    `Dear ${contract.pocName || (r.name || "Partner")},`,
    "",
    `Please find below a summary of the negotiated ${isCorp ? "rate agreement" : "wholesaler contract"} between ${HOTEL.name} and ${r.name || "your organisation"}.`,
    "",
    `Contract:        ${contract.id}`,
    `Validity:        ${fmtDate(contract.startsOn)} → ${fmtDate(contract.endsOn)}`,
    `Status:          ${contract.status || "—"}`,
    contract.signedOn ? `Signed on:       ${fmtDate(contract.signedOn)}` : null,
    !isCorp && (typeof r.commissionPct === "number")
      ? `Commission:      ${r.commissionPct === 0 ? "Net & non-commissionable" : `${r.commissionPct}%${r.marketingFundPct ? ` + ${r.marketingFundPct}% MF` : ""}`}`
      : null,
    `Payment terms:   ${contract.paymentTerms || "—"}`,
    Number(contract.creditLimit) > 0 ? `Credit limit:    ${formatCurrency(Number(contract.creditLimit))}` : null,
    "",
    `NEGOTIATED RATES (${getCurrentCurrency().code}):`,
  ].filter(Boolean);

  ROOM_KEYS.forEach((rk) => {
    const d = Number(r.daily[rk.key] || 0);
    const w = Number(r.weekend[rk.key] || 0);
    const m = Number(r.monthly[rk.key] || 0);
    if (d === 0 && w === 0 && m === 0) return;
    const parts = [];
    if (d) parts.push(`Weekday ${d}`);
    if (w) parts.push(`Weekend ${w}`);
    if (m) parts.push(`Monthly ${m.toLocaleString()}`);
    lines.push(`  • ${rk.label.padEnd(28)} ${parts.join(" · ")}`);
  });

  if (Number(contract.accommodationFee) > 0) {
    lines.push("");
    lines.push(`Plus Hotel Accommodation Fee of ${formatCurrency(Number(contract.accommodationFee))} per room per night.`);
  }
  if (contract.taxIncluded) {
    lines.push(`All rates inclusive of ${TAX_LABEL}.`);
  }

  if ((contract.eventSupplements || []).length > 0) {
    lines.push("");
    lines.push("EVENT-PERIOD SUPPLEMENTS:");
    contract.eventSupplements.forEach((evt) => {
      lines.push(`  • ${evt.name} · ${fmtDate(evt.fromDate)}${evt.fromDate !== evt.toDate ? ` → ${fmtDate(evt.toDate)}` : ""} · +${formatCurrency(Number(evt.supplement))}`);
    });
  }

  if (contract.cancellationPolicy) {
    lines.push("");
    lines.push(`Cancellation: ${contract.cancellationPolicy}`);
  }

  lines.push(
    "",
    "The full signed contract document is attached for your records. Please counter-sign and return to confirm acceptance of the terms.",
    "",
    "Kind regards,",
    "Aparajeet Mathad",
    "Front Office Manager",
    `${HOTEL.name}`,
    `${HOTEL.phone} · ${HOTEL.emailFom}`,
  );

  const body = lines.join("\n");
  const to   = contract.pocEmail || (kind === "agent" ? contract.contact : "");
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

// ---------------------------------------------------------------------------
// ContractPreviewModal — full-page preview with toolbar (Email · Download ·
// Print · Close).
// ---------------------------------------------------------------------------
export function ContractPreviewModal({ contract, kind, onClose }) {
  const data = useData();
  const hotel = data?.hotelInfo;
  const p = usePalette();
  if (!contract) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            Contract preview · {contract.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {kind === "corporate" ? contract.account : contract.name} · {kind === "corporate" ? "Corporate Rate Agreement" : "Wholesaler Contract"}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ToolbarBtn onClick={() => emailContract(contract, kind, hotel)}    icon={Mail}    label="Email" p={p} />
          <ToolbarBtn onClick={() => downloadContract(contract, kind, { hotel })} icon={Download} label="Download" p={p} primary />
          <ToolbarBtn onClick={() => printContract(contract, kind, { hotel })}    icon={Printer} label="Print" p={p} />
          <button onClick={onClose}
            className="flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
              fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          ><X size={14} /> Close</button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: "#EFE9DA" }}>
        <div className="py-8 px-4">
          <ContractDocumentView contract={contract} kind={kind} />
        </div>
      </main>
    </div>
  );
}

function ToolbarBtn({ onClick, icon: Icon, label, p, primary }) {
  return (
    <button onClick={onClick}
      style={{
        backgroundColor: primary ? p.accent : "transparent",
        color: primary ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
        border: `1px solid ${primary ? p.accent : p.border}`,
        padding: "0.45rem 0.95rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!primary) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!primary) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
