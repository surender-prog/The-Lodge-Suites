import React from "react";
import { Download, FileText, Mail, Printer, Receipt, X } from "lucide-react";
import { usePalette } from "../theme.jsx";
import { applyTaxes, inverseApplyTaxes, legalLine, summarizeTax, useData } from "../../../data/store.jsx";

// ---------------------------------------------------------------------------
// BookingDocs — printable Invoice + Receipt documents for an individual
// booking. Mirrors the ContractDocument pattern: a React component for the
// in-app preview, a parallel HTML string builder for download / print.
//
// Property identity (legal name, CR/VAT, banking) lives in the store under
// `hotelInfo` and is editable from the Property admin section. The React
// view reads it via `useData()`; the HTML / email helpers accept it as the
// `hotel` option so non-component callers can pass in their own copy.
// ---------------------------------------------------------------------------

const FALLBACK_HOTEL = {
  name:     "The Lodge Suites",
  legal:    "The Lodge Hotel Apartments W.L.L.",
  address:  "Building 916, Road 4019, Block 340",
  area:     "Shabab Avenue, Juffair, Manama",
  country:  "Kingdom of Bahrain",
  cr:       "#####",
  vat:      "#####",
  phone:    "+973 1616 8146",
  email:    "frontoffice@thelodgesuites.com",
  emailAccounts: "accounts@thelodgesuites.bh",
  website:  "www.thelodgesuites.com",
  iban:     "BH## NBOB ##############",
  bank:     "National Bank of Bahrain",
};

const todayLong = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const fmtDate   = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtBhd    = (n) => `BHD ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}`;

const SOURCE_LABEL = {
  direct: "Direct guest", ota: "OTA channel", agent: "Travel agent",
  corporate: "Corporate", member: "LS Privilege member",
};

// ---------------------------------------------------------------------------
// Compute folio breakdown for the booking. The booking total stored in the
// state is gross (tax-inclusive) — we reverse-engineer the net + per-tax
// component split using the active tax config so the document tax line items
// match what the guest actually paid.
// ---------------------------------------------------------------------------
function buildFolio(booking, tax, rooms, extras) {
  const room = rooms?.find((r) => r.id === booking.roomId);
  const nights = booking.nights || 0;
  const gross = booking.total || 0;
  const inv   = inverseApplyTaxes(gross, tax || { components: [] }, nights);
  const net   = inv?.net || gross;
  const compsApplied = inv?.components || [];

  // Render percentage-based taxes against net using the same applyTaxes pass
  const built = applyTaxes(net, tax || { components: [] }, nights);

  return {
    room,
    nights,
    rate:        booking.rate || 0,
    netRoom:     net,
    extras:      [], // line items — bookings as stored don't carry per-extra entries; left empty
    components:  built.components || compsApplied || [],
    gross,
    paid:        booking.paid || 0,
    balance:     gross - (booking.paid || 0),
  };
}

// ---------------------------------------------------------------------------
// React preview view — invoice OR receipt depending on `kind`.
// ---------------------------------------------------------------------------
export function BookingDocView({ booking, kind, tax, rooms, extras }) {
  const data = useData();
  const HOTEL = data?.hotelInfo || FALLBACK_HOTEL;
  const folio = buildFolio(booking, tax, rooms, extras);
  const isConfirm = kind === "confirmation";
  const isReceipt = kind === "receipt";
  const docNo = isReceipt
    ? `RCP-${booking.id}`
    : isConfirm ? `CNF-${booking.id}`
    : `INV-${booking.id}`;
  const title = isReceipt ? "Payment Receipt" : isConfirm ? "Reservation Confirmation" : "Invoice";
  const isPaid = (booking.paid || 0) >= (booking.total || 0);
  const statusLabelMap = { confirmed: "Confirmed", "in-house": "In-house", "checked-out": "Checked out", cancelled: "Cancelled" };
  const statusColorMap = { confirmed: "#2563EB", "in-house": "#16A34A", "checked-out": "#64748B", cancelled: "#DC2626" };

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
          <div style={{ fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", color: "#8A7A4F", fontWeight: 700, marginTop: 4 }}>
            {HOTEL.address} · {HOTEL.area}
          </div>
          <div style={{ fontSize: "0.74rem", color: "#444", marginTop: 4 }}>{[HOTEL.country, legalLine(HOTEL)].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.7rem", letterSpacing: "0.05em" }}>
            {title}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.74rem", color: "#444" }}>
            #{docNo}{isReceipt ? " · " + todayLong() : isConfirm ? " · " + todayLong() : " · Issued " + todayLong()}
          </div>
          {isConfirm ? (
            <span style={{
              display: "inline-block", marginTop: 8,
              fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "3px 9px",
              color: statusColorMap[booking.status] || "#6B7280",
              border: `1px solid ${statusColorMap[booking.status] || "#6B7280"}`,
            }}>
              {statusLabelMap[booking.status] || booking.status || "Confirmed"}
            </span>
          ) : !isReceipt && (
            <span style={{
              display: "inline-block", marginTop: 8,
              fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "3px 9px",
              color: isPaid ? "#15803D" : folio.paid > 0 ? "#D97706" : "#B91C1C",
              border: `1px solid ${isPaid ? "#15803D" : folio.paid > 0 ? "#D97706" : "#B91C1C"}`,
            }}>
              {isPaid ? "Paid in full" : folio.paid > 0 ? "Partially paid" : "Outstanding"}
            </span>
          )}
        </div>
      </div>

      {/* Confirmation-only welcome block — placed before billing meta. */}
      {isConfirm && (
        <div style={{
          marginTop: 22, padding: "16px 20px",
          background: "linear-gradient(180deg, rgba(201,169,97,0.10) 0%, rgba(201,169,97,0.04) 100%)",
          border: "1px solid rgba(201,169,97,0.45)",
          borderInlineStart: "4px solid #C9A961",
        }}>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F" }}>
            Dear {booking.guest},
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.55rem", fontStyle: "italic", color: "#15161A", marginTop: 4 }}>
            We&rsquo;re looking forward to welcoming you.
          </div>
          <div style={{ marginTop: 6, color: "#444", fontSize: "0.86rem", lineHeight: 1.6 }}>
            Your reservation at <strong>{HOTEL.name}</strong> is confirmed. Below you&rsquo;ll find the full stay details, suite charges and our contact information should you need anything before arrival.
          </div>
        </div>
      )}

      {/* Bill-to / received-from */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginTop: 22 }}>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F", marginBottom: 6 }}>
            {isReceipt ? "Received from" : isConfirm ? "Reservation for" : "Bill to"}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", fontWeight: 600 }}>{booking.guest}</div>
          {booking.email && <div style={{ color: "#444" }}>{booking.email}</div>}
          {booking.phone && <div style={{ color: "#444", fontSize: "0.84rem" }}>{booking.phone}</div>}
          {booking.source && <div style={{ color: "#666", fontSize: "0.78rem", marginTop: 4 }}>{SOURCE_LABEL[booking.source] || booking.source}</div>}
        </div>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F", marginBottom: 6 }}>
            Booking reference
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.2rem", fontWeight: 600 }}>{booking.id}</div>
          <div style={{ color: "#444", fontSize: "0.84rem", marginTop: 4 }}>
            {folio.room ? `${folio.room.id === "studio" ? "Lodge Studio" : folio.room.id === "one-bed" ? "One-Bedroom Suite" : folio.room.id === "two-bed" ? "Two-Bedroom Suite" : "Three-Bedroom Suite"}` : "—"}
          </div>
          <div style={{ color: "#666", fontSize: "0.78rem", marginTop: 4 }}>
            {fmtDate(booking.checkIn)} → {fmtDate(booking.checkOut)} · {folio.nights} night{folio.nights === 1 ? "" : "s"} · {booking.guests} guest{booking.guests === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Confirmation-only check-in / check-out times */}
      {isConfirm && (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: "12px 14px", border: "1px solid #d8d2c4", backgroundColor: "rgba(201,169,97,0.04)" }}>
            <div style={{ fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F" }}>Check-in</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.25rem", fontWeight: 600, marginTop: 2 }}>{fmtDate(booking.checkIn)}</div>
            <div style={{ color: "#666", fontSize: "0.78rem", marginTop: 2 }}>From 14:00 · 24h reception</div>
          </div>
          <div style={{ padding: "12px 14px", border: "1px solid #d8d2c4", backgroundColor: "rgba(201,169,97,0.04)" }}>
            <div style={{ fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F" }}>Check-out</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.25rem", fontWeight: 600, marginTop: 2 }}>{fmtDate(booking.checkOut)}</div>
            <div style={{ color: "#666", fontSize: "0.78rem", marginTop: 2 }}>By 12:00 · Late check-out on request</div>
          </div>
        </div>
      )}

      {/* Folio table */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 26, marginBottom: 8 }}>
        {isReceipt ? "Payment summary" : isConfirm ? "Stay & charges" : "Folio"}
      </h3>
      <table style={tblStyle} cellPadding={0}>
        <thead>
          <tr>
            <th style={thStyle}>Description</th>
            <th style={{ ...thStyle, textAlign: "end" }}>Quantity</th>
            <th style={{ ...thStyle, textAlign: "end" }}>Rate</th>
            <th style={{ ...thStyle, textAlign: "end" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}><strong>Suite charge</strong>
              <div style={{ color: "#666", fontSize: "0.74rem", marginTop: 2 }}>
                {folio.room?.id === "studio" ? "Lodge Studio" : folio.room?.id === "one-bed" ? "One-Bedroom Suite" : folio.room?.id === "two-bed" ? "Two-Bedroom Suite" : folio.room?.id === "three-bed" ? "Three-Bedroom Suite" : "Suite"} · {fmtDate(booking.checkIn)} – {fmtDate(booking.checkOut)}
              </div>
            </td>
            <td style={tdNumStyle}>{folio.nights} nt</td>
            <td style={tdNumStyle}>{fmtBhd(folio.rate)}</td>
            <td style={tdNumStyle}>{fmtBhd(folio.netRoom)}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, fontWeight: 600 }} colSpan={3}>Subtotal (net)</td>
            <td style={tdNumStyle}>{fmtBhd(folio.netRoom)}</td>
          </tr>
          {folio.components.map((c, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, color: "#444" }} colSpan={3}>
                {c.label}{c.type === "percentage" && c.rate ? ` (${c.rate}%)` : ""}
              </td>
              <td style={tdNumStyle}>{fmtBhd(c.amount)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: "rgba(201,169,97,0.08)" }} colSpan={3}>
              {isReceipt ? "Folio total" : isConfirm ? "Total" : "Total due"}
            </td>
            <td style={{ ...tdNumStyle, fontWeight: 700, backgroundColor: "rgba(201,169,97,0.08)", fontSize: "1rem" }}>{fmtBhd(folio.gross)}</td>
          </tr>
        </tbody>
      </table>

      {/* Payment summary */}
      {(folio.paid > 0 || kind === "receipt") && (
        <table style={{ ...tblStyle, marginTop: 14 }} cellPadding={0}>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 600, color: "#15803D" }} colSpan={3}>Amount paid</td>
              <td style={{ ...tdNumStyle, color: "#15803D", fontWeight: 700 }}>{fmtBhd(folio.paid)}</td>
            </tr>
            {kind !== "receipt" && folio.balance > 0 && (
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#B91C1C" }} colSpan={3}>Balance outstanding</td>
                <td style={{ ...tdNumStyle, fontWeight: 700, color: "#B91C1C" }}>{fmtBhd(folio.balance)}</td>
              </tr>
            )}
            {kind === "receipt" && folio.balance > 0 && (
              <tr>
                <td style={{ ...tdStyle, color: "#666" }} colSpan={3}>Remaining to settle</td>
                <td style={tdNumStyle}>{fmtBhd(folio.balance)}</td>
              </tr>
            )}
            {kind === "receipt" && folio.balance <= 0 && (
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#15803D" }} colSpan={3}>Settlement status</td>
                <td style={{ ...tdNumStyle, color: "#15803D", fontWeight: 700 }}>Paid in full</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Notes */}
      <div style={{ marginTop: 24, fontSize: "0.84rem", lineHeight: 1.7, color: "#222" }}>
        {isReceipt ? (
          <p>This receipt confirms payment of <strong>{fmtBhd(folio.paid)}</strong> received against booking <strong>{booking.id}</strong>. {folio.balance > 0 ? `An outstanding balance of ${fmtBhd(folio.balance)} remains and will be billed on the master folio.` : "Your folio is fully settled — thank you."}</p>
        ) : isConfirm ? (
          <>
            <p>All amounts are in <strong>Bahraini Dinars</strong> and inclusive of statutory taxes where applicable. Please retain this confirmation for arrival.</p>
            <p style={{ marginTop: 8 }}>
              <strong>Cancellation:</strong> Free cancellation up to 24h before arrival. Late cancellations or no-shows are subject to a one-night charge.
            </p>
            {booking.notes && (
              <p style={{ marginTop: 8 }}>
                <strong>Special requests on file:</strong> {booking.notes}
              </p>
            )}
          </>
        ) : (
          <>
            <p>All amounts are in <strong>Bahraini Dinars</strong> and inclusive of statutory taxes ({summarizeTax(tax) || "10% Service Charge · 5% Government Levy · 10% VAT"}) where applicable.</p>
            {(booking.source === "corporate" || booking.source === "agent") && (
              <p style={{ marginTop: 8 }}>
                <strong>Payment terms:</strong> {booking.paymentStatus === "invoiced" ? "Net 30" : "On departure"}.
                Pay by bank transfer to <strong>{HOTEL.bank}</strong>, IBAN <strong>{HOTEL.iban}</strong>, quoting reference <strong>{booking.id}</strong>.
              </p>
            )}
          </>
        )}
      </div>

      {/* Closing block */}
      <p style={{ marginTop: 22, fontSize: "0.86rem", lineHeight: 1.7 }}>
        {isConfirm
          ? <>For any pre-arrival requests, transport, or assistance, please contact our front office at <strong>{HOTEL.email}</strong> or call <strong>{HOTEL.phone}</strong> (24h).</>
          : <>For any queries about this {isReceipt ? "receipt" : "invoice"}, please contact <strong>{HOTEL.emailAccounts}</strong> or call <strong>{HOTEL.phone}</strong>.</>
        }
      </p>

      {/* Footer */}
      <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid #C9A961", fontSize: "0.7rem", color: "#666", textAlign: "center", letterSpacing: "0.05em" }}>
        {HOTEL.legal} · {HOTEL.address}, {HOTEL.area} · {HOTEL.country} · {HOTEL.phone} · {HOTEL.email} · {HOTEL.website}
      </div>
    </div>
  );
}

const tblStyle  = { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", marginTop: 4 };
const thStyle   = { borderBottom: "1.5px solid #15161A", padding: "8px 10px", textAlign: "start", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: "#15161A", backgroundColor: "rgba(201,169,97,0.08)" };
const tdStyle   = { borderBottom: "1px solid #d8d2c4", padding: "8px 10px", verticalAlign: "top", color: "#222" };
const tdNumStyle = { ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#15161A", textAlign: "end" };

// ---------------------------------------------------------------------------
// HTML builder for download / print — mirrors the React view 1:1.
// ---------------------------------------------------------------------------
export function buildBookingDocHtml(booking, kind, { tax, rooms, hotel } = {}) {
  const HOTEL = hotel || FALLBACK_HOTEL;
  const folio = buildFolio(booking, tax, rooms);
  const TAX_LABEL = summarizeTax(tax) || "10% Service Charge · 5% Government Levy · 10% VAT";
  const isConfirm = kind === "confirmation";
  const isReceipt = kind === "receipt";
  const docNo = isReceipt ? `RCP-${booking.id}` : isConfirm ? `CNF-${booking.id}` : `INV-${booking.id}`;
  const title = isReceipt ? "Payment Receipt" : isConfirm ? "Reservation Confirmation" : "Invoice";
  const isPaid = (booking.paid || 0) >= (booking.total || 0);
  const statusLabelMap = { confirmed: "Confirmed", "in-house": "In-house", "checked-out": "Checked out", cancelled: "Cancelled" };
  const statusColorMap = { confirmed: "#2563EB", "in-house": "#16A34A", "checked-out": "#64748B", cancelled: "#DC2626" };
  const statusColor = statusColorMap[booking.status] || "#6B7280";
  const statusLabel = statusLabelMap[booking.status] || booking.status || "Confirmed";
  const roomLabel = folio.room?.id === "studio" ? "Lodge Studio"
    : folio.room?.id === "one-bed" ? "One-Bedroom Suite"
    : folio.room?.id === "two-bed" ? "Two-Bedroom Suite"
    : folio.room?.id === "three-bed" ? "Three-Bedroom Suite"
    : "Suite";

  const taxRows = (folio.components || []).map((c) => `<tr>
    <td colspan="3" class="muted">${escapeHtml(c.label)}${c.type === "percentage" && c.rate ? ` (${c.rate}%)` : ""}</td>
    <td class="num">${escapeHtml(fmtBhd(c.amount))}</td>
  </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} · ${escapeHtml(booking.id)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Manrope', system-ui, -apple-system, sans-serif; color: #15161A; background: #F5F1E8; margin: 0; padding: 30px; line-height: 1.55; font-size: 13px; }
  .doc { background: #FBF8F1; padding: 44px 56px; max-width: 860px; margin: 0 auto; box-shadow: 0 4px 22px rgba(0,0,0,0.08); }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 600; font-size: 2.3rem; margin: 0; line-height: 1.05; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 1.7rem; margin: 0; letter-spacing: 0.05em; }
  h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 1.4rem; margin: 26px 0 8px; }
  .eyebrow { font-size: 0.66rem; letter-spacing: 0.28em; text-transform: uppercase; color: #8A7A4F; font-weight: 700; }
  .muted { color: #555; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #15161A; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
  th { border-bottom: 1.5px solid #15161A; padding: 8px 10px; text-align: start; font-size: 0.66rem; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; background: rgba(201,169,97,0.08); }
  th.num, td.num { text-align: right; }
  td { border-bottom: 1px solid #d8d2c4; padding: 8px 10px; vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #15161A; }
  td.total { background: rgba(201,169,97,0.08); font-weight: 700; }
  td.paid { color: #15803D; font-weight: 700; }
  td.balance { color: #B91C1C; font-weight: 700; }
  .pill { display: inline-block; padding: 3px 9px; font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; margin-top: 8px; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #C9A961; font-size: 0.7rem; color: #666; text-align: center; letter-spacing: 0.05em; }
  @media print { body { background: #FBF8F1; padding: 0; } .doc { box-shadow: none; padding: 0; } }
</style>
</head><body>
<div class="doc">
  <div class="header">
    <div>
      <h1>${escapeHtml(HOTEL.name)}</h1>
      <div class="eyebrow" style="margin-top:4px;">${escapeHtml(HOTEL.address)} · ${escapeHtml(HOTEL.area)}</div>
      <div class="muted" style="font-size:0.74rem; margin-top:4px;">${escapeHtml([HOTEL.country, legalLine(HOTEL)].filter(Boolean).join(" · "))}</div>
    </div>
    <div style="text-align:right;">
      <h2>${escapeHtml(title)}</h2>
      <div class="muted" style="margin-top:4px; font-size:0.74rem;">#${escapeHtml(docNo)} · ${isReceipt ? "" : isConfirm ? "" : "Issued "}${escapeHtml(todayLong())}</div>
      ${isConfirm
        ? `<span class="pill" style="color:${statusColor}; border:1px solid ${statusColor};">${escapeHtml(statusLabel)}</span>`
        : !isReceipt ? `<span class="pill" style="color:${isPaid ? "#15803D" : folio.paid > 0 ? "#D97706" : "#B91C1C"}; border:1px solid ${isPaid ? "#15803D" : folio.paid > 0 ? "#D97706" : "#B91C1C"};">${isPaid ? "Paid in full" : folio.paid > 0 ? "Partially paid" : "Outstanding"}</span>` : ""}
    </div>
  </div>

  ${isConfirm ? `<div style="margin-top:22px; padding:16px 20px; background:linear-gradient(180deg, rgba(201,169,97,0.10) 0%, rgba(201,169,97,0.04) 100%); border:1px solid rgba(201,169,97,0.45); border-inline-start:4px solid #C9A961;">
    <div class="eyebrow">Dear ${escapeHtml(booking.guest)},</div>
    <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.55rem; font-style:italic; color:#15161A; margin-top:4px;">We&rsquo;re looking forward to welcoming you.</div>
    <div style="margin-top:6px; color:#444; font-size:0.86rem; line-height:1.6;">Your reservation at <strong>${escapeHtml(HOTEL.name)}</strong> is confirmed. Below you&rsquo;ll find the full stay details, suite charges and our contact information should you need anything before arrival.</div>
  </div>` : ""}

  <div class="meta">
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">${isReceipt ? "Received from" : isConfirm ? "Reservation for" : "Bill to"}</div>
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.4rem; font-weight:600;">${escapeHtml(booking.guest)}</div>
      ${booking.email ? `<div class="muted">${escapeHtml(booking.email)}</div>` : ""}
      ${booking.phone ? `<div class="muted" style="font-size:0.84rem;">${escapeHtml(booking.phone)}</div>` : ""}
      ${booking.source ? `<div class="muted" style="font-size:0.78rem; margin-top:4px;">${escapeHtml(SOURCE_LABEL[booking.source] || booking.source)}</div>` : ""}
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Booking reference</div>
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.2rem; font-weight:600;">${escapeHtml(booking.id)}</div>
      <div class="muted" style="font-size:0.84rem; margin-top:4px;">${escapeHtml(roomLabel)}</div>
      <div class="muted" style="font-size:0.78rem; margin-top:4px;">${escapeHtml(fmtDate(booking.checkIn))} → ${escapeHtml(fmtDate(booking.checkOut))} · ${folio.nights} night${folio.nights === 1 ? "" : "s"} · ${booking.guests} guest${booking.guests === 1 ? "" : "s"}</div>
    </div>
  </div>

  ${isConfirm ? `<div style="margin-top:18px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
    <div style="padding:12px 14px; border:1px solid #d8d2c4; background-color:rgba(201,169,97,0.04);">
      <div class="eyebrow">Check-in</div>
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.25rem; font-weight:600; margin-top:2px;">${escapeHtml(fmtDate(booking.checkIn))}</div>
      <div class="muted" style="font-size:0.78rem; margin-top:2px;">From 14:00 · 24h reception</div>
    </div>
    <div style="padding:12px 14px; border:1px solid #d8d2c4; background-color:rgba(201,169,97,0.04);">
      <div class="eyebrow">Check-out</div>
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.25rem; font-weight:600; margin-top:2px;">${escapeHtml(fmtDate(booking.checkOut))}</div>
      <div class="muted" style="font-size:0.78rem; margin-top:2px;">By 12:00 · Late check-out on request</div>
    </div>
  </div>` : ""}

  <h3>${isReceipt ? "Payment summary" : isConfirm ? "Stay & charges" : "Folio"}</h3>
  <table>
    <thead>
      <tr>
        <th>Description</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Suite charge</strong>
          <div class="muted" style="font-size:0.74rem; margin-top:2px;">${escapeHtml(roomLabel)} · ${escapeHtml(fmtDate(booking.checkIn))} – ${escapeHtml(fmtDate(booking.checkOut))}</div>
        </td>
        <td class="num">${folio.nights} nt</td>
        <td class="num">${escapeHtml(fmtBhd(folio.rate))}</td>
        <td class="num">${escapeHtml(fmtBhd(folio.netRoom))}</td>
      </tr>
      <tr>
        <td colspan="3" style="font-weight:600;">Subtotal (net)</td>
        <td class="num">${escapeHtml(fmtBhd(folio.netRoom))}</td>
      </tr>
      ${taxRows}
      <tr>
        <td class="total" colspan="3">${isReceipt ? "Folio total" : isConfirm ? "Total" : "Total due"}</td>
        <td class="num total" style="font-size:1rem;">${escapeHtml(fmtBhd(folio.gross))}</td>
      </tr>
    </tbody>
  </table>

  ${(folio.paid > 0 || isReceipt) ? `<table style="margin-top:14px;">
    <tbody>
      <tr><td class="paid" colspan="3">Amount paid</td><td class="num paid">${escapeHtml(fmtBhd(folio.paid))}</td></tr>
      ${!isReceipt && folio.balance > 0 ? `<tr><td class="balance" colspan="3">Balance ${isConfirm ? "due on arrival" : "outstanding"}</td><td class="num balance">${escapeHtml(fmtBhd(folio.balance))}</td></tr>` : ""}
      ${isReceipt && folio.balance > 0 ? `<tr><td class="muted" colspan="3">Remaining to settle</td><td class="num">${escapeHtml(fmtBhd(folio.balance))}</td></tr>` : ""}
      ${isReceipt && folio.balance <= 0 ? `<tr><td class="paid" colspan="3">Settlement status</td><td class="num paid">Paid in full</td></tr>` : ""}
    </tbody>
  </table>` : ""}

  <div style="margin-top:24px; font-size:0.84rem; line-height:1.7; color:#222;">
    ${isReceipt
      ? `<p>This receipt confirms payment of <strong>${escapeHtml(fmtBhd(folio.paid))}</strong> received against booking <strong>${escapeHtml(booking.id)}</strong>. ${folio.balance > 0 ? `An outstanding balance of ${escapeHtml(fmtBhd(folio.balance))} remains and will be billed on the master folio.` : "Your folio is fully settled — thank you."}</p>`
      : isConfirm
        ? `<p>All amounts are in <strong>Bahraini Dinars</strong> and inclusive of statutory taxes where applicable. Please retain this confirmation for arrival.</p><p style="margin-top:8px;"><strong>Cancellation:</strong> Free cancellation up to 24h before arrival. Late cancellations or no-shows are subject to a one-night charge.</p>${booking.notes ? `<p style="margin-top:8px;"><strong>Special requests on file:</strong> ${escapeHtml(booking.notes)}</p>` : ""}`
        : `<p>All amounts are in <strong>Bahraini Dinars</strong> and inclusive of statutory taxes (${escapeHtml(TAX_LABEL)}) where applicable.</p>${(booking.source === "corporate" || booking.source === "agent") ? `<p style="margin-top:8px;"><strong>Payment terms:</strong> ${booking.paymentStatus === "invoiced" ? "Net 30" : "On departure"}. Pay by bank transfer to <strong>${escapeHtml(HOTEL.bank)}</strong>, IBAN <strong>${escapeHtml(HOTEL.iban)}</strong>, quoting reference <strong>${escapeHtml(booking.id)}</strong>.</p>` : ""}`}
  </div>

  <p style="margin-top:22px; font-size:0.86rem; line-height:1.7;">
    ${isConfirm
      ? `For any pre-arrival requests, transport, or assistance, please contact our front office at <strong>${escapeHtml(HOTEL.email)}</strong> or call <strong>${escapeHtml(HOTEL.phone)}</strong> (24h).`
      : `For any queries about this ${isReceipt ? "receipt" : "invoice"}, please contact <strong>${escapeHtml(HOTEL.emailAccounts)}</strong> or call <strong>${escapeHtml(HOTEL.phone)}</strong>.`}
  </p>

  <div class="footer">
    ${escapeHtml(HOTEL.legal)} · ${escapeHtml(HOTEL.address)}, ${escapeHtml(HOTEL.area)} · ${escapeHtml(HOTEL.country)} · ${escapeHtml(HOTEL.phone)} · ${escapeHtml(HOTEL.email)} · ${escapeHtml(HOTEL.website)}
  </div>
</div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Side-effect helpers (mirror ContractDocument's set).
// ---------------------------------------------------------------------------
export function downloadBookingDoc(booking, kind, opts = {}) {
  const html = buildBookingDocHtml(booking, kind, opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const safeId = String(booking.id || "doc").replace(/[^A-Za-z0-9_-]/g, "_");
  const filenameKind = kind === "receipt" ? "Receipt" : kind === "confirmation" ? "Confirmation" : "Invoice";
  const a = document.createElement("a");
  a.href = url;
  a.download = `LS-${filenameKind}-${safeId}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function printBookingDoc(booking, kind, opts = {}) {
  const html = buildBookingDocHtml(booking, kind, opts);
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 350);
  return true;
}

export function emailBookingDoc(booking, kind, hotel) {
  const HOTEL = hotel || FALLBACK_HOTEL;
  const isConfirm = kind === "confirmation";
  const isReceipt = kind === "receipt";
  const subject = isReceipt
    ? `${HOTEL.name} · Payment receipt · ${booking.id}`
    : isConfirm
      ? `${HOTEL.name} · Reservation confirmation · ${booking.id}`
      : `${HOTEL.name} · Invoice · ${booking.id}`;
  const intro = isReceipt
    ? `Thank you for your payment. Please find your receipt below.`
    : isConfirm
      ? `Thank you for choosing The Lodge Suites. Your reservation is confirmed — full details are below. We look forward to welcoming you.`
      : `Please find your invoice for the booking below.`;
  const lines = [
    `Dear ${booking.guest},`,
    "",
    intro,
    "",
    `Booking:        ${booking.id}`,
    `Check-in:       ${fmtDate(booking.checkIn)}${isConfirm ? "  · from 14:00" : ""}`,
    `Check-out:      ${fmtDate(booking.checkOut)}${isConfirm ? " · by 12:00" : ""}`,
    `Nights:         ${booking.nights || 0}`,
    `Guests:         ${booking.guests || 0}`,
    `Total:          ${fmtBhd(booking.total)}`,
    `Paid:           ${fmtBhd(booking.paid)}`,
    `Balance:        ${fmtBhd((booking.total || 0) - (booking.paid || 0))}`,
    "",
    isConfirm
      ? `Address: ${HOTEL.address}, ${HOTEL.area}, ${HOTEL.country}\nReception: ${HOTEL.phone} (24h) · ${HOTEL.email}`
      : `For queries please reply to this email or call ${HOTEL.phone}.`,
    "",
    "Kind regards,",
    isConfirm ? "Front Office" : "Accounts Team",
    HOTEL.name,
  ];
  const body = lines.join("\n");
  const to   = booking.email || "";
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

// ---------------------------------------------------------------------------
// Preview modal — full-page drawer with toolbar (Email · Download · Print ·
// Close). Used by both Invoice and Receipt actions on each booking row.
// ---------------------------------------------------------------------------
export function BookingDocPreviewModal({ booking, kind, tax, rooms, extras, onClose }) {
  const p = usePalette();
  const data = useData();
  const hotel = data?.hotelInfo;
  if (!booking) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            {kind === "receipt" ? "Receipt preview" : kind === "confirmation" ? "Confirmation preview" : "Invoice preview"} · {booking.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {booking.guest}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ToolbarBtn icon={Mail}     label="Email"    onClick={() => emailBookingDoc(booking, kind, hotel)} p={p} />
          <ToolbarBtn icon={Download} label="Download" onClick={() => downloadBookingDoc(booking, kind, { tax, rooms, hotel })} p={p} primary />
          <ToolbarBtn icon={Printer}  label="Print"    onClick={() => printBookingDoc(booking, kind, { tax, rooms, hotel })} p={p} />
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
          <BookingDocView booking={booking} kind={kind} tax={tax} rooms={rooms} extras={extras} />
        </div>
      </main>
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick, p, primary }) {
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
