import React from "react";
import { Download, Mail, Printer, X } from "lucide-react";
import { usePalette } from "../theme.jsx";
import { legalLine, useData, formatCurrency, DEFAULT_GIFT_CARD_TIERS, computeGiftCardPrice, getCurrentCurrency } from "../../../data/store.jsx";
import { roomLabel as resolveRoomLabel } from "../../../lib/rooms.js";
import { useT } from "../../../i18n/LanguageContext.jsx";

// ---------------------------------------------------------------------------
// GiftCardDocs — printable Invoice + Receipt for a gift card purchase.
// Mirrors BookingDocs in structure (React preview component + HTML string
// builder + download/print helpers) but with the gift-card-specific
// breakdown: a single line for the prepaid nights at the issued suite,
// the bulk-discount line, and the buyer's net.
//
// `kind` discriminator:
//   "invoice" — amount owed (paid at purchase, status: paid)
//   "receipt" — payment confirmation (single payment line)
// ---------------------------------------------------------------------------

const FALLBACK_HOTEL = {
  name:     "The Lodge Suites",
  legal:    "The Lodge Suites W.L.L.",
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
const fmtTs     = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Resolve a card's suite label from the LIVE rooms slice (operator-set
// publicName flows through here) + the i18n function when available.
// `rooms` is optional — when omitted (HTML builders called without
// access to the React data hook) the helper falls back through
// publicName then a humanised id, matching the React view.
function resolveCardSuiteLabel(card, rooms, t) {
  if (!card) return "";
  const room = (rooms || []).find((r) => r && r.id === card.roomId);
  return resolveRoomLabel(room || card.roomId, t);
}

// Locate an invoice / payment record tied to this card. Cards are bound
// by giftCardId on both ledgers (set by `issueGiftCard` in the store).
// Fall back to the giftCardCode match for legacy / seed records.
function findInvoiceForCard(invoices, card) {
  if (!invoices || !card) return null;
  return invoices.find((i) => i.giftCardId === card.id)
    || invoices.find((i) => i.giftCardCode === card.code)
    || null;
}
function findPaymentForCard(payments, card) {
  if (!payments || !card) return null;
  return payments.find((p) => p.giftCardId === card.id)
    || payments.find((p) => p.giftCardCode === card.code)
    || null;
}

// ---------------------------------------------------------------------------
// React preview — invoice OR receipt depending on `kind`.
// ---------------------------------------------------------------------------
export function GiftCardDocView({ card, kind }) {
  const data = useData();
  const t = useT();
  const HOTEL = data?.hotelInfo || FALLBACK_HOTEL;
  const suiteLabel = resolveCardSuiteLabel(card, data?.rooms, t);
  const invoice = findInvoiceForCard(data?.invoices, card);
  const payment = findPaymentForCard(data?.payments, card);
  // Read the live admin-editable tier master via useData; fall back to
  // the seed when the slice is empty (first-paint pre-hydration).
  const tiers = (data?.giftCardTiers && data.giftCardTiers.length > 0) ? data.giftCardTiers : DEFAULT_GIFT_CARD_TIERS;
  const tier    = tiers.find((t) => t.id === card.tierId);
  const breakdown = computeGiftCardPrice({
    nights: card.totalNights,
    discountPct: card.discountPct,
    ratePerNight: card.ratePerNight,
  });
  // Three flavours of the same document:
  //   • invoice     — accounting; what the buyer owes (line items + total)
  //   • receipt     — accounting; what was captured (payment line + net)
  //   • certificate — the GIFT itself; nights × suite, sender, bearer,
  //                   redemption instructions. NO payment information.
  //
  // The certificate is what members hand to their guest. Payment details
  // would expose what the buyer paid and the bulk-discount they got —
  // both of which the bearer shouldn't see. The receipt lives separately
  // in the buyer's Receipts tab.
  const isInvoice     = kind === "invoice";
  const isReceipt     = kind === "receipt";
  const isCertificate = kind === "certificate";
  const docNo = isReceipt
    ? (payment?.id ? payment.id : `RCP-GC-${card.code}`)
    : isCertificate
      ? card.code
      : (invoice?.id ? invoice.id : `INV-GC-${card.code}`);
  const title = isReceipt ? "Payment Receipt" : isCertificate ? "Gift Certificate" : "Invoice";
  const issuedDate = isReceipt
    ? (payment?.ts ? fmtTs(payment.ts) : todayLong())
    : isCertificate
      ? fmtDate(card.purchaseDate)
      : (invoice?.issued ? fmtDate(invoice.issued) : todayLong());

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
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.7rem", letterSpacing: "0.05em" }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: "0.74rem", color: "#444" }}>#{docNo} · {issuedDate}</div>
          {/* "Paid" badge only on accounting docs. Certificates use a
              status badge based on remaining nights so the bearer can
              tell at a glance whether the card is still redeemable. */}
          {isCertificate ? (
            (() => {
              const remaining = (card.totalNights || 0) - (card.nightsUsed || 0);
              const badgeColor = card.status === "cancelled" ? "#DC2626"
                : remaining === 0 ? "#8A7A4F"
                : "#C9A961";
              const label = card.status === "cancelled" ? "Cancelled"
                : remaining === 0 ? "Fully redeemed"
                : remaining === card.totalNights ? "Unused"
                : `${remaining} nights left`;
              return (
                <span style={{
                  display: "inline-block", marginTop: 8,
                  fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  padding: "3px 9px",
                  color: badgeColor, border: `1px solid ${badgeColor}`,
                }}>{label}</span>
              );
            })()
          ) : (
            <span style={{
              display: "inline-block", marginTop: 8,
              fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "3px 9px",
              color: "#15803D", border: `1px solid #15803D`,
            }}>Paid</span>
          )}
        </div>
      </div>

      {/* Bill-to / Received-from block */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 22 }}>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8A7A4F", fontWeight: 700 }}>
            {isReceipt ? "Received from" : "Bill to"}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", fontWeight: 600, marginTop: 4 }}>
            {card.senderName || "Gift card buyer"}
          </div>
          {card.senderEmail && <div style={{ color: "#555", fontSize: "0.84rem" }}>{card.senderEmail}</div>}
        </div>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8A7A4F", fontWeight: 700 }}>
            Gift card reference
          </div>
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "1rem", fontWeight: 600, marginTop: 4, letterSpacing: "0.04em" }}>
            {card.code}
          </div>
          <div style={{ color: "#555", fontSize: "0.78rem", marginTop: 4 }}>
            Member of record: <strong style={{ color: "#15161A" }}>{card.recipientName || "—"}</strong>
          </div>
          <div style={{ color: "#555", fontSize: "0.78rem", marginTop: 2 }}>
            Valid until: <strong style={{ color: "#15161A" }}>{fmtDate(card.validUntil)}</strong>
          </div>
        </div>
      </div>

      {/* Transferred-to block — only renders once the member has shared
          the card with a guest. The block is the verification anchor:
          the front desk checks the guest's ID, email, and phone against
          what's printed here, so it sits ABOVE the line items where
          it's hard to miss. */}
      {card.transferredTo && (
        <div style={{
          marginTop: 18,
          padding: "14px 18px",
          backgroundColor: "rgba(201,169,97,0.08)",
          border: "1px solid #C9A961",
          borderInlineStart: "4px solid #8A7A4F",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8A7A4F", fontWeight: 700 }}>
                Bearer · verify at check-in
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.55rem", fontWeight: 600, marginTop: 4, lineHeight: 1.1 }}>
                {card.transferredTo.name}
              </div>
              <div style={{ color: "#15161A", fontSize: "0.84rem", marginTop: 6 }}>
                Email: <strong>{card.transferredTo.email}</strong>
              </div>
              <div style={{ color: "#15161A", fontSize: "0.84rem", marginTop: 2 }}>
                Mobile: <strong>{card.transferredTo.phone}</strong>
              </div>
            </div>
            <div style={{ textAlign: "right", color: "#555", fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif", whiteSpace: "nowrap" }}>
              <div>Transferred</div>
              <div style={{ color: "#15161A", fontWeight: 700, marginTop: 2 }}>{fmtDate(card.transferredTo.transferredAt)}</div>
              <div style={{ marginTop: 6 }}>by {card.recipientName || "the original member"}</div>
            </div>
          </div>
          <div style={{
            marginTop: 12, paddingTop: 10,
            borderTop: "1px dashed #C9A961",
            color: "#444", fontSize: "0.72rem", lineHeight: 1.55,
          }}>
            <strong style={{ color: "#15161A" }}>Verification required:</strong> the front desk must match the bearer's photo ID and contact details to the name, email, and mobile printed above before redeeming any nights against this card. The original member retains a copy of this certificate for re-verification.
          </div>
        </div>
      )}

      {isCertificate ? (
        // Gift certificate — the document the bearer presents. Deliberately
        // shows only what's being GIVEN (nights × suite, validity, sender)
        // and how to redeem it. Payment figures are intentionally absent
        // so the bearer never sees what the buyer paid — the discount and
        // line-item breakdown belong on the buyer's receipt.
        <>
          <div style={{
            marginTop: 28,
            padding: "28px 32px",
            backgroundColor: "rgba(201,169,97,0.10)",
            border: "1.5px solid #C9A961",
            textAlign: "center",
          }}>
            <div style={{ color: "#8A7A4F", fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.32em", textTransform: "uppercase", fontWeight: 700 }}>
              The gift
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: "3rem", fontWeight: 500, marginTop: 6, lineHeight: 1.05, color: "#15161A" }}>
              {nightsInWords(card.totalNights)} {card.totalNights === 1 ? "Night" : "Nights"}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.5rem", fontWeight: 500, marginTop: 4, color: "#15161A" }}>
              at the {suiteLabel}
            </div>
            <div style={{ marginTop: 14, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: "#444", letterSpacing: "0.04em" }}>
              {(card.totalNights || 0) - (card.nightsUsed || 0)} of {card.totalNights} nights remaining ·
              valid until <strong style={{ color: "#15161A" }}>{fmtDate(card.validUntil)}</strong>
            </div>
            {card.message && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed #C9A961", fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: "1.15rem", color: "#222", maxWidth: 520, margin: "18px auto 0" }}>
                "{card.message}"
              </div>
            )}
            <div style={{ marginTop: card.message ? 12 : 18, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: "#555", letterSpacing: "0.05em" }}>
              From <strong style={{ color: "#15161A" }}>{card.senderName}</strong>
            </div>
          </div>

          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 28, marginBottom: 8 }}>
            How to redeem
          </h3>
          <div style={{ fontSize: "0.86rem", lineHeight: 1.7, color: "#222" }}>
            <p style={{ margin: 0 }}>
              Present this certificate at check-in along with photo ID matching the bearer details above. Nights apply automatically against the <strong>{suiteLabel}</strong> up to the remaining balance.
            </p>
            <ul style={{ marginTop: 10, paddingInlineStart: 20, listStyle: "disc", color: "#222" }}>
              <li>At check-in — show the certificate to the front-desk team.</li>
              <li>By email — forward to <strong>{HOTEL.email}</strong> with your preferred dates.</li>
              <li>By WhatsApp — <strong>{HOTEL.phone}</strong>.</li>
              <li>Online — quote code <strong style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{card.code}</strong> during booking.</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Gift cards are non-refundable but transferable until first redemption; the full balance carries over across multiple stays within the validity window. The hotel will verify the bearer's identity before applying any nights.
            </p>
          </div>
        </>
      ) : isReceipt ? (
        <>
        <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 28, marginBottom: 8 }}>
          Payment details
        </h3>
        <table style={tblStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>
                <div><strong>Gift card purchase</strong></div>
                <div style={{ color: "#555", fontSize: "0.76rem", marginTop: 2 }}>
                  {card.code} · {card.totalNights} nights at the {suiteLabel}
                </div>
                {payment?.method && (
                  <div style={{ color: "#555", fontSize: "0.76rem", marginTop: 2 }}>
                    Method: <strong>{(payment.method || "").charAt(0).toUpperCase() + (payment.method || "").slice(1)}</strong>
                    {payment.ts ? ` · ${fmtTs(payment.ts)}` : ""}
                  </div>
                )}
              </td>
              <td style={tdNumStyle}>{formatCurrency(payment?.amount ?? card.paidAmount)}</td>
            </tr>
            {payment?.fee > 0 && (
              <tr>
                <td style={{ ...tdStyle, color: "#555" }}>Processing fee</td>
                <td style={tdNumStyle}>− {formatCurrency(payment.fee)}</td>
              </tr>
            )}
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: "rgba(201,169,97,0.08)" }}>Net captured</td>
              <td style={{ ...tdNumStyle, fontWeight: 700, backgroundColor: "rgba(201,169,97,0.08)", fontSize: "1rem" }}>
                {formatCurrency(payment?.net ?? card.paidAmount)}
              </td>
            </tr>
          </tbody>
        </table>
        </>
      ) : (
        // Invoice — nights × rate, less discount, equals net
        <>
        <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 28, marginBottom: 8 }}>
          Line items
        </h3>
        <table style={tblStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Quantity</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>
                <strong>Gift card · {suiteLabel}</strong>
                <div style={{ color: "#555", fontSize: "0.76rem", marginTop: 2 }}>
                  Pre-purchased nights · redeem with code {card.code}
                  {tier ? ` · ${tier.label}` : ""}
                </div>
              </td>
              <td style={tdNumStyle}>{card.totalNights} nights</td>
              <td style={tdNumStyle}>{formatCurrency(card.ratePerNight)}</td>
              <td style={tdNumStyle}>{formatCurrency(breakdown.gross)}</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, color: "#15803D" }} colSpan={3}>
                Bulk-purchase discount ({card.discountPct}%)
              </td>
              <td style={{ ...tdNumStyle, color: "#15803D" }}>− {formatCurrency(breakdown.discount)}</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: "rgba(201,169,97,0.08)" }} colSpan={3}>Total due</td>
              <td style={{ ...tdNumStyle, fontWeight: 700, backgroundColor: "rgba(201,169,97,0.08)", fontSize: "1rem" }}>
                {formatCurrency(card.paidAmount ?? breakdown.net)}
              </td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, color: "#15803D", fontWeight: 600 }} colSpan={3}>Amount paid</td>
              <td style={{ ...tdNumStyle, color: "#15803D", fontWeight: 700 }}>
                {formatCurrency(card.paidAmount ?? breakdown.net)}
              </td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 600 }} colSpan={3}>Balance</td>
              <td style={{ ...tdNumStyle, fontWeight: 700, color: "#15803D" }}>
                {formatCurrency(0)}
              </td>
            </tr>
          </tbody>
        </table>
        </>
      )}

      {/* Accounting fine-print only shown on invoice/receipt; the
          certificate has its own redemption paragraph above. */}
      {!isCertificate && (
        <>
          <div style={{ marginTop: 24, fontSize: "0.84rem", lineHeight: 1.7, color: "#222" }}>
            <p>
              All amounts are in <strong>{getCurrentCurrency().code}</strong>. Gift cards are non-refundable
              but transferable until first redemption; full balance carries over across multiple stays
              within the validity window.
            </p>
            <p style={{ marginTop: 8 }}>
              <strong>Redemption:</strong> the recipient enters the code <strong style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{card.code}</strong>
              {" "}during booking. Prepaid nights apply automatically against the {suiteLabel}
              {" "}up to the remaining balance ({(card.totalNights || 0) - (card.nightsUsed || 0)} of {card.totalNights} nights).
            </p>
            {card.message && (
              <p style={{ marginTop: 8 }}>
                <strong>Personal message on file:</strong> {card.message}
              </p>
            )}
          </div>

          <p style={{ marginTop: 22, fontSize: "0.86rem", lineHeight: 1.7 }}>
            For any queries about this {isReceipt ? "receipt" : "invoice"}, please contact <strong>{HOTEL.emailAccounts}</strong> or call <strong>{HOTEL.phone}</strong>.
          </p>
        </>
      )}

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid #C9A961", fontSize: "0.7rem", color: "#666", textAlign: "center", letterSpacing: "0.05em" }}>
        {HOTEL.legal} · {HOTEL.address}, {HOTEL.area} · {HOTEL.country} · {HOTEL.phone} · {HOTEL.email} · {HOTEL.website}
      </div>
    </div>
  );
}

// "Five" reads warmer than "5" on a gift voucher hero; falls back to the
// numeral for >12 to avoid awkward "twenty-five" wraparound.
function nightsInWords(n) {
  const words = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve",
  ];
  if (n >= 0 && n < words.length) return words[n];
  return String(n);
}

const tblStyle  = { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", marginTop: 4 };
const thStyle   = { borderBottom: "1.5px solid #15161A", padding: "8px 10px", textAlign: "start", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: "#15161A", backgroundColor: "rgba(201,169,97,0.08)" };
const tdStyle   = { borderBottom: "1px solid #d8d2c4", padding: "8px 10px", verticalAlign: "top", color: "#222" };
const tdNumStyle = { ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#15161A", textAlign: "end" };

// ---------------------------------------------------------------------------
// HTML string builder — mirrors the React view 1:1. Used by the download
// and print helpers below.
// ---------------------------------------------------------------------------
export function buildGiftCardDocHtml(card, kind, { hotel, invoice, payment, tiers, rooms } = {}) {
  const HOTEL = hotel || FALLBACK_HOTEL;
  // Resolve once and reuse — callers that don't pass `rooms` still get
  // a sensible fallback (publicName on the matched row, or humanised id).
  const suiteLabel = resolveCardSuiteLabel(card, rooms);
  // Caller passes the live tier master via opts.tiers. Fall back to the
  // seed when not provided (e.g. legacy callers / direct script use).
  const tierList = (tiers && tiers.length > 0) ? tiers : DEFAULT_GIFT_CARD_TIERS;
  const tier = tierList.find((t) => t.id === card.tierId);
  const breakdown = computeGiftCardPrice({
    nights: card.totalNights,
    discountPct: card.discountPct,
    ratePerNight: card.ratePerNight,
  });
  const isReceipt     = kind === "receipt";
  const isCertificate = kind === "certificate";
  const docNo = isReceipt
    ? (payment?.id ? payment.id : `RCP-GC-${card.code}`)
    : isCertificate
      ? card.code
      : (invoice?.id ? invoice.id : `INV-GC-${card.code}`);
  const title = isReceipt ? "Payment Receipt" : isCertificate ? "Gift Certificate" : "Invoice";
  const issuedDate = isReceipt
    ? (payment?.ts ? fmtTs(payment.ts) : todayLong())
    : isCertificate
      ? fmtDate(card.purchaseDate)
      : (invoice?.issued ? fmtDate(invoice.issued) : todayLong());
  const ccy = getCurrentCurrency().code;
  const remainingNights = (card.totalNights || 0) - (card.nightsUsed || 0);
  const certBadgeColor = card.status === "cancelled" ? "#DC2626"
    : remainingNights === 0 ? "#8A7A4F"
    : "#C9A961";
  const certBadgeLabel = card.status === "cancelled" ? "Cancelled"
    : remainingNights === 0 ? "Fully redeemed"
    : remainingNights === card.totalNights ? "Unused"
    : `${remainingNights} nights left`;
  const wordNights = (() => {
    const w = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve"];
    const n = card.totalNights;
    return (n >= 0 && n < w.length) ? w[n] : String(n);
  })();

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} · ${escapeHtml(card.code)}</title>
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
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
  th, td { border-bottom: 1px solid #d8d2c4; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { border-bottom: 1.5px solid #15161A; background: rgba(201,169,97,0.08); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; }
  .num { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; color: #15161A; }
  .total { font-weight: 700; background: rgba(201,169,97,0.08); }
  .paid { color: #15803D; font-weight: 700; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #C9A961; font-size: 11px; color: #666; text-align: center; }
  .code { font-family: ui-monospace, Menlo, monospace; letter-spacing: 0.04em; }
</style>
</head>
<body><div class="doc">
  <div class="header">
    <div>
      <h1>${escapeHtml(HOTEL.name)}</h1>
      <div class="eyebrow" style="margin-top:4px;">${escapeHtml(HOTEL.address)} · ${escapeHtml(HOTEL.area)}</div>
      <div class="muted" style="font-size:11px;margin-top:4px;">${escapeHtml([HOTEL.country, legalLine(HOTEL)].filter(Boolean).join(" · "))}</div>
    </div>
    <div style="text-align:right;">
      <h2>${escapeHtml(title)}</h2>
      <div class="muted" style="font-size:11px;margin-top:4px;">#${escapeHtml(docNo)} · ${escapeHtml(issuedDate)}</div>
      ${isCertificate
        ? `<span style="display:inline-block;margin-top:8px;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;padding:3px 9px;color:${certBadgeColor};border:1px solid ${certBadgeColor};">${escapeHtml(certBadgeLabel)}</span>`
        : `<span style="display:inline-block;margin-top:8px;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;padding:3px 9px;color:#15803D;border:1px solid #15803D;">Paid</span>`}
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="eyebrow">${isReceipt ? "Received from" : "Bill to"}</div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.4rem;font-weight:600;margin-top:4px;">${escapeHtml(card.senderName || "Gift card buyer")}</div>
      ${card.senderEmail ? `<div class="muted">${escapeHtml(card.senderEmail)}</div>` : ""}
    </div>
    <div>
      <div class="eyebrow">Gift card reference</div>
      <div class="code" style="font-size:1rem;font-weight:600;margin-top:4px;">${escapeHtml(card.code)}</div>
      <div class="muted" style="font-size:12px;margin-top:4px;">Member of record: <strong style="color:#15161A;">${escapeHtml(card.recipientName || "—")}</strong></div>
      <div class="muted" style="font-size:12px;margin-top:2px;">Valid until: <strong style="color:#15161A;">${escapeHtml(fmtDate(card.validUntil))}</strong></div>
    </div>
  </div>
  ${card.transferredTo ? `
  <div style="margin-top:18px;padding:14px 18px;background:rgba(201,169,97,0.08);border:1px solid #C9A961;border-inline-start:4px solid #8A7A4F;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;">
      <div style="min-width:0;">
        <div class="eyebrow">Bearer · verify at check-in</div>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.55rem;font-weight:600;margin-top:4px;line-height:1.1;">${escapeHtml(card.transferredTo.name)}</div>
        <div style="color:#15161A;font-size:13px;margin-top:6px;">Email: <strong>${escapeHtml(card.transferredTo.email)}</strong></div>
        <div style="color:#15161A;font-size:13px;margin-top:2px;">Mobile: <strong>${escapeHtml(card.transferredTo.phone)}</strong></div>
      </div>
      <div style="text-align:right;color:#555;font-size:11.5px;white-space:nowrap;">
        <div>Transferred</div>
        <div style="color:#15161A;font-weight:700;margin-top:2px;">${escapeHtml(fmtDate(card.transferredTo.transferredAt))}</div>
        <div style="margin-top:6px;">by ${escapeHtml(card.recipientName || "the original member")}</div>
      </div>
    </div>
    <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #C9A961;color:#444;font-size:11px;line-height:1.55;">
      <strong style="color:#15161A;">Verification required:</strong> the front desk must match the bearer's photo ID and contact details to the name, email, and mobile printed above before redeeming any nights against this card. The original member retains a copy of this certificate for re-verification.
    </div>
  </div>` : ""}

  ${isCertificate ? `
    <div style="margin-top:28px;padding:28px 32px;background:rgba(201,169,97,0.10);border:1.5px solid #C9A961;text-align:center;">
      <div class="eyebrow">The gift</div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:3rem;font-weight:500;margin-top:6px;line-height:1.05;color:#15161A;">${escapeHtml(wordNights)} ${card.totalNights === 1 ? "Night" : "Nights"}</div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:500;margin-top:4px;color:#15161A;">at the ${escapeHtml(suiteLabel)}</div>
      <div style="margin-top:14px;font-size:12px;color:#444;letter-spacing:0.04em;">${remainingNights} of ${card.totalNights} nights remaining · valid until <strong style="color:#15161A;">${escapeHtml(fmtDate(card.validUntil))}</strong></div>
      ${card.message ? `<div style="margin-top:18px;padding-top:14px;border-top:1px dashed #C9A961;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:1.15rem;color:#222;max-width:520px;margin:18px auto 0;">"${escapeHtml(card.message)}"</div>` : ""}
      <div style="margin-top:${card.message ? 12 : 18}px;font-size:11.5px;color:#555;letter-spacing:0.05em;">From <strong style="color:#15161A;">${escapeHtml(card.senderName || "—")}</strong></div>
    </div>

    <h3>How to redeem</h3>
    <div style="font-size:13px;line-height:1.7;color:#222;">
      <p style="margin:0;">Present this certificate at check-in along with photo ID matching the bearer details above. Nights apply automatically against the <strong>${escapeHtml(suiteLabel)}</strong> up to the remaining balance.</p>
      <ul style="margin-top:10px;padding-inline-start:20px;list-style:disc;color:#222;">
        <li>At check-in — show the certificate to the front-desk team.</li>
        <li>By email — forward to <strong>${escapeHtml(HOTEL.email)}</strong> with your preferred dates.</li>
        <li>By WhatsApp — <strong>${escapeHtml(HOTEL.phone)}</strong>.</li>
        <li>Online — quote code <strong class="code">${escapeHtml(card.code)}</strong> during booking.</li>
      </ul>
      <p style="margin-top:12px;">Gift cards are non-refundable but transferable until first redemption; the full balance carries over across multiple stays within the validity window. The hotel will verify the bearer's identity before applying any nights.</p>
    </div>
  ` : `
  <h3>${isReceipt ? "Payment details" : "Line items"}</h3>

  ${isReceipt ? `
    <table>
      <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr>
          <td>
            <strong>Gift card purchase</strong>
            <div class="muted" style="font-size:11.5px;margin-top:2px;">${escapeHtml(card.code)} · ${card.totalNights} nights at the ${escapeHtml(suiteLabel)}</div>
            ${payment?.method ? `<div class="muted" style="font-size:11.5px;margin-top:2px;">Method: <strong>${escapeHtml((payment.method || "").charAt(0).toUpperCase() + (payment.method || "").slice(1))}</strong>${payment.ts ? ` · ${escapeHtml(fmtTs(payment.ts))}` : ""}</div>` : ""}
          </td>
          <td class="num">${escapeHtml(formatCurrency(payment?.amount ?? card.paidAmount))}</td>
        </tr>
        ${payment?.fee > 0 ? `<tr><td class="muted">Processing fee</td><td class="num">− ${escapeHtml(formatCurrency(payment.fee))}</td></tr>` : ""}
        <tr><td class="total">Net captured</td><td class="num total" style="font-size:15px;">${escapeHtml(formatCurrency(payment?.net ?? card.paidAmount))}</td></tr>
      </tbody>
    </table>
  ` : `
    <table>
      <thead>
        <tr><th>Description</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>Gift card · ${escapeHtml(suiteLabel)}</strong>
            <div class="muted" style="font-size:11.5px;margin-top:2px;">Pre-purchased nights · redeem with code ${escapeHtml(card.code)}${tier ? ` · ${escapeHtml(tier.label)}` : ""}</div>
          </td>
          <td class="num">${card.totalNights} nights</td>
          <td class="num">${escapeHtml(formatCurrency(card.ratePerNight))}</td>
          <td class="num">${escapeHtml(formatCurrency(breakdown.gross))}</td>
        </tr>
        <tr>
          <td colspan="3" style="color:#15803D;">Bulk-purchase discount (${card.discountPct}%)</td>
          <td class="num" style="color:#15803D;">− ${escapeHtml(formatCurrency(breakdown.discount))}</td>
        </tr>
        <tr><td class="total" colspan="3">Total due</td><td class="num total" style="font-size:15px;">${escapeHtml(formatCurrency(card.paidAmount ?? breakdown.net))}</td></tr>
        <tr><td colspan="3" class="paid">Amount paid</td><td class="num paid">${escapeHtml(formatCurrency(card.paidAmount ?? breakdown.net))}</td></tr>
        <tr><td colspan="3" style="font-weight:600;">Balance</td><td class="num paid">${escapeHtml(formatCurrency(0))}</td></tr>
      </tbody>
    </table>
  `}

  <div style="margin-top:24px;font-size:13px;line-height:1.7;color:#222;">
    <p>All amounts are in <strong>${escapeHtml(ccy)}</strong>. Gift cards are non-refundable but transferable until first redemption; full balance carries over across multiple stays within the validity window.</p>
    <p style="margin-top:8px;"><strong>Redemption:</strong> the recipient enters the code <strong class="code">${escapeHtml(card.code)}</strong> during booking. Prepaid nights apply automatically against the ${escapeHtml(suiteLabel)} up to the remaining balance (${(card.totalNights || 0) - (card.nightsUsed || 0)} of ${card.totalNights} nights).</p>
    ${card.message ? `<p style="margin-top:8px;"><strong>Personal message on file:</strong> ${escapeHtml(card.message)}</p>` : ""}
  </div>

  <p style="margin-top:22px;font-size:13px;line-height:1.7;">
    For any queries about this ${isReceipt ? "receipt" : "invoice"}, please contact <strong>${escapeHtml(HOTEL.emailAccounts)}</strong> or call <strong>${escapeHtml(HOTEL.phone)}</strong>.
  </p>
  `}

  <div class="footer">
    ${escapeHtml(HOTEL.legal)} · ${escapeHtml(HOTEL.address)}, ${escapeHtml(HOTEL.area)} · ${escapeHtml(HOTEL.country)} · ${escapeHtml(HOTEL.phone)} · ${escapeHtml(HOTEL.email)} · ${escapeHtml(HOTEL.website)}
  </div>
</div></body></html>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Side-effect helpers (mirror BookingDocs' API).
// ---------------------------------------------------------------------------
export function downloadGiftCardDoc(card, kind, opts = {}) {
  const html = buildGiftCardDocHtml(card, kind, opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const safeCode = String(card.code || card.id || "card").replace(/[^A-Za-z0-9_-]/g, "_");
  const filenameKind = kind === "receipt" ? "Receipt" : "Invoice";
  const a = document.createElement("a");
  a.href = url;
  a.download = `LS-GiftCard-${filenameKind}-${safeCode}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function printGiftCardDoc(card, kind, opts = {}) {
  const html = buildGiftCardDocHtml(card, kind, opts);
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 350);
  return true;
}

export function emailGiftCardDoc(card, kind, hotel, opts = {}) {
  const HOTEL = hotel || FALLBACK_HOTEL;
  // `opts.rooms` is optional — the helper falls back through publicName
  // and then a humanised id when the live rooms slice isn't available.
  const suiteLabel = resolveCardSuiteLabel(card, opts.rooms);
  const isReceipt     = kind === "receipt";
  const isCertificate = kind === "certificate";
  const subject = isCertificate
    ? `${HOTEL.name} · Gift certificate · ${card.code}`
    : isReceipt
      ? `${HOTEL.name} · Payment receipt · ${card.code}`
      : `${HOTEL.name} · Invoice · ${card.code}`;
  const intro = isCertificate
    ? `Please find your gift certificate for ${card.code} below — present it at check-in along with photo ID.`
    : isReceipt
      ? `Thank you for your payment. Please find your receipt for gift card ${card.code} below.`
      : `Please find your invoice for gift card ${card.code} below.`;
  const lines = [
    `Dear ${card.senderName || "Customer"},`,
    "",
    intro,
    "",
    `Gift card:     ${card.code}`,
    `Recipient:     ${card.recipientName || "—"}`,
    `Suite type:    ${suiteLabel}`,
    `Nights:        ${card.totalNights}`,
    `Discount:      ${card.discountPct}%`,
    `Paid:          ${formatCurrency(card.paidAmount)}`,
    `Valid until:   ${fmtDate(card.validUntil)}`,
    "",
    `For queries please reply to this email or call ${HOTEL.phone}.`,
    "",
    "Kind regards,",
    "Accounts Team",
    HOTEL.name,
  ];
  const body = lines.join("\n");
  const to   = card.senderEmail || "";
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

// ---------------------------------------------------------------------------
// Preview modal — full-page drawer with toolbar (Email · Download · Print
// · Close). Used by the Invoice and Receipt actions inside the admin Gift
// Cards detail drawer.
// ---------------------------------------------------------------------------
export function GiftCardDocPreviewModal({ card, kind, onClose }) {
  const p = usePalette();
  const data = useData();
  const hotel = data?.hotelInfo;
  const invoice = findInvoiceForCard(data?.invoices, card);
  const payment = findPaymentForCard(data?.payments, card);
  // Pass the live tier master + rooms slice through to the doc-builder
  // helpers so the exported PDF/print/email all reflect the admin's
  // edits to tier labels AND custom room types render with their
  // operator-set publicName instead of the raw slug.
  const tiers = data?.giftCardTiers;
  const rooms = data?.rooms;
  if (!card) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(15,16,20,0.85)" }}>
      <div className="flex items-center justify-between px-6 py-3" style={{ backgroundColor: p.bgPanel, borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          {kind === "receipt" ? "Receipt preview" : "Invoice preview"} · {card.code}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => emailGiftCardDoc(card, kind, hotel, { rooms })} title="Email"
            style={btn(p)} onMouseEnter={btnHover(p)} onMouseLeave={btnLeave(p)}>
            <Mail size={12} /> Email
          </button>
          <button onClick={() => downloadGiftCardDoc(card, kind, { hotel, invoice, payment, tiers, rooms })} title="Download HTML"
            style={btn(p)} onMouseEnter={btnHover(p)} onMouseLeave={btnLeave(p)}>
            <Download size={12} /> Download
          </button>
          <button onClick={() => printGiftCardDoc(card, kind, { hotel, invoice, payment, tiers, rooms })} title="Print"
            style={btn(p)} onMouseEnter={btnHover(p)} onMouseLeave={btnLeave(p)}>
            <Printer size={12} /> Print
          </button>
          <button onClick={onClose} aria-label="Close"
            style={{ ...btn(p), padding: 7 }} onMouseEnter={btnHover(p)} onMouseLeave={btnLeave(p)}>
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-8 px-4" style={{ backgroundColor: "rgba(15,16,20,0.92)" }}>
        <GiftCardDocView card={card} kind={kind} />
      </div>
    </div>
  );
}

function btn(p) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    color: p.textMuted, padding: "5px 10px",
    fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
    border: `1px solid ${p.border}`, backgroundColor: "transparent", cursor: "pointer",
  };
}
function btnHover(p) {
  return (e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; };
}
function btnLeave(p) {
  return (e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; };
}
