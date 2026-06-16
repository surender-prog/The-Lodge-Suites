// docPdf.js — branded INVOICE / PAYMENT-RECEIPT PDF generator (client-side,
// jsPDF). Produces an A4 document in the property's charcoal + gold palette and
// returns it as raw base64 so /api/send-email can attach it to the customer's
// mail. Reuses the shared folio math (src/lib/folio.js) so the figures match
// the on-screen booking document and the printable HTML exactly.
//
// No DOM / React dependency — safe to call from a store action.
import { jsPDF } from "jspdf";
import { buildFolio } from "./folio.js";

const GOLD     = [201, 169, 97];   // #C9A961
const INK      = [21, 22, 26];     // #15161A
const MUTED    = [120, 116, 108];  // warm grey
const HAIR     = [214, 209, 198];  // hairline rule
const GREEN    = [22, 122, 60];

const HOTEL_FALLBACK = {
  name: "The Lodge Suites", legal: "The Lodge Suites W.L.L.",
  address: "Building 916, Road 4019, Block 340",
  area: "Shabab Avenue, Juffair, Manama", country: "Kingdom of Bahrain",
  phone: "+973 1616 8146", email: "frontoffice@thelodgesuites.com",
  emailAccounts: "accounts@thelodgesuites.bh", website: "www.thelodgesuites.com",
  cr: "", vat: "", iban: "", bank: "",
};

const money = (n, cur) => `${cur || "BHD"} ${Number(n || 0).toFixed(3)}`;
const safe  = (s) => (s == null ? "" : String(s));
const fmtDate = (iso) => {
  if (!iso) return "—";
  // Avoid argless Date math pitfalls — this runs in the browser, so new Date(iso)
  // is fine; format as DD MMM YYYY.
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return safe(iso);
    const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(d.getDate()).padStart(2, "0")} ${M[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return safe(iso); }
};

// Resolve a readable suite label without importing the React room helper.
function suiteLabel(folio, booking) {
  return folio.room?.publicName || folio.room?.name || booking.roomLabel || booking.suite || booking.roomId || "Suite";
}

// buildDocPdf — returns { base64, filename, title }.
//   kind: "invoice" | "receipt"
//   opts: { booking, invoice?, tax, rooms, hotel, currency, paymentMethod?, paidOn? }
export function buildDocPdf(kind, { booking, invoice, tax, rooms, hotel, currency = "BHD", paymentMethod, paidOn } = {}) {
  if (!booking) return null;
  const H = { ...HOTEL_FALLBACK, ...(hotel || {}) };
  const folio = buildFolio(booking, tax, rooms);
  const isReceipt = kind === "receipt";
  const docNo = (invoice && invoice.id) || booking.id;
  const title = isReceipt ? "PAYMENT RECEIPT" : "TAX INVOICE";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = 210, M = 18, RIGHT = PW - M;
  let y = 20;

  // ── Header: property identity (left) + document meta (right) ──────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INK);
  doc.text(safe(H.name), M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  let ly = y + 6;
  [H.legal, H.address, `${safe(H.area)}${H.country ? ", " + H.country : ""}`, `${safe(H.phone)}  ·  ${safe(H.email)}`]
    .filter(Boolean).forEach((line) => { doc.text(safe(line), M, ly); ly += 4.3; });

  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...GOLD);
  doc.text(title, RIGHT, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  let ry = y + 6;
  const meta = [
    [isReceipt ? "Receipt no." : "Invoice no.", safe(docNo)],
    ["Issued", fmtDate((invoice && invoice.issued) || paidOn || new Date().toISOString())],
  ];
  if (!isReceipt && invoice && invoice.due) meta.push(["Due", fmtDate(invoice.due)]);
  if (isReceipt && paymentMethod) meta.push(["Method", safe(paymentMethod)]);
  meta.forEach(([k, v]) => {
    doc.setTextColor(...MUTED); doc.text(k, RIGHT - 58, ry, { align: "left" });
    doc.setTextColor(...INK);   doc.text(v, RIGHT, ry, { align: "right" });
    ry += 4.6;
  });

  y = Math.max(ly, ry) + 4;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(M, y, RIGHT, y);
  y += 9;

  // ── Bill-to + stay summary ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("BILLED TO", M, y);
  doc.text("STAY", M + 95, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(safe(booking.guest || invoice?.clientName || "Guest"), M, y + 5.5);
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  if (booking.email || invoice?.clientEmail) doc.text(safe(booking.email || invoice.clientEmail), M, y + 10.5);

  doc.setFontSize(9); doc.setTextColor(...INK);
  const stay = [
    `Booking ${safe(booking.id)}`,
    `${fmtDate(booking.checkIn)} – ${fmtDate(booking.checkOut)}`,
    `${folio.nights} night(s) · ${suiteLabel(folio, booking)}`,
  ];
  let sy = y + 5.5;
  stay.forEach((line) => { doc.text(line, M + 95, sy); sy += 5; });
  y = Math.max(y + 12, sy) + 6;

  // ── Line-item table ───────────────────────────────────────────────────────
  const COL_AMT = RIGHT;
  const tableHead = () => {
    doc.setFillColor(...INK); doc.rect(M, y, RIGHT - M, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text("DESCRIPTION", M + 3, y + 5.3);
    doc.text("AMOUNT", COL_AMT - 3, y + 5.3, { align: "right" });
    y += 8;
  };
  const row = (label, amount, { bold = false, color = INK, sub } = {}) => {
    const h = sub ? 11 : 8;
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(9.5); doc.setTextColor(...color);
    doc.text(safe(label), M + 3, y + 5.4);
    if (amount != null) doc.text(money(amount, currency), COL_AMT - 3, y + 5.4, { align: "right" });
    if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(safe(sub), M + 3, y + 9.4); }
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.2); doc.line(M, y + h, RIGHT, y + h);
    y += h;
  };

  tableHead();
  // Accommodation (net of tax)
  if (folio.mixedNights) {
    row(`Accommodation · weekday`, folio.weekdayNights * folio.rateWeekday, { sub: `${folio.weekdayNights} night(s) @ ${money(folio.rateWeekday, currency)}` });
    row(`Accommodation · weekend`, folio.weekendNights * folio.rateWeekend, { sub: `${folio.weekendNights} night(s) @ ${money(folio.rateWeekend, currency)}` });
  } else {
    row(`Accommodation · ${suiteLabel(folio, booking)}`, folio.netRoom, { sub: `${folio.nights} night(s) @ ${money(folio.rate || (folio.nights ? folio.netRoom / folio.nights : 0), currency)} (net)` });
  }
  // Tax components
  (folio.components || []).forEach((c) => row(c.label + (c.type === "percentage" && c.rate ? ` (${c.rate}%)` : ""), c.amount, { color: MUTED }));

  // ── Totals ────────────────────────────────────────────────────────────────
  y += 2;
  row("Subtotal", folio.gross, { bold: true });
  if (folio.commissionCut > 0) {
    row("Less travel-agent commission", -folio.commissionCut, { color: MUTED });
    row("Net payable", folio.netTotal, { bold: true });
  }
  const paidAmount = isReceipt ? folio.netTotal : folio.paid;
  const balance    = isReceipt ? 0 : folio.balance;
  row("Amount paid", paidAmount, { color: GREEN });
  row("Balance due", balance, { bold: true, color: balance > 0 ? INK : GREEN });

  y += 6;

  // Receipt: paid-in-full badge
  if (isReceipt) {
    doc.setFillColor(...GREEN); doc.setDrawColor(...GREEN);
    const bw = 52, bh = 11;
    doc.roundedRect(M, y, bw, bh, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    doc.text("PAID IN FULL", M + bw / 2, y + 7.2, { align: "center" });
    y += bh + 6;
  }

  // ── Footer: thank-you + legal + bank ──────────────────────────────────────
  const footerY = 270;
  y = Math.max(y, footerY - 26);
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.2); doc.line(M, y, RIGHT, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(isReceipt
    ? "Thank you for your payment. We look forward to welcoming you."
    : "Thank you. Kindly settle the balance by the due date. For queries, reply to this email.", M, y);
  y += 5.5;
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  const legalBits = [
    H.legal && `${H.legal}`,
    H.cr && `CR ${H.cr}`,
    H.vat && `VAT ${H.vat}`,
  ].filter(Boolean).join("   ·   ");
  if (legalBits) { doc.text(legalBits, M, y); y += 4.2; }
  if (!isReceipt && (H.bank || H.iban)) {
    doc.text([H.bank && `Bank: ${H.bank}`, H.iban && `IBAN: ${H.iban}`].filter(Boolean).join("   ·   "), M, y);
    y += 4.2;
  }
  doc.text([H.phone, H.emailAccounts || H.email, H.website].filter(Boolean).join("   ·   "), M, y);

  const base64 = (doc.output("datauristring").split("base64,")[1]) || "";
  const filename = `${isReceipt ? "Receipt" : "Invoice"}-${safe(docNo).replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
  return { base64, filename, title };
}
