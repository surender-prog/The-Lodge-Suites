// folio.js — pure folio computation shared by the on-screen booking document
// (BookingDocs.jsx), the printable HTML, and the PDF builder (docPdf.js).
// Extracted from BookingDocs so the store + PDF builder can reuse the EXACT
// same line-item / tax math without importing React. Depends only on the
// server-shareable tax primitives.
import { applyTaxes, inverseApplyTaxes } from "./reportShared.js";

export function buildFolio(booking, tax, rooms, extras) {
  const room = rooms?.find((r) => r.id === booking.roomId);
  const nights = booking.nights || 0;
  // When commission was deducted at booking, `booking.total` records the NET
  // obligation (gross − commissionDeducted). The folio surfaces both figures so
  // the gross/tax math still reconciles; the agent's bill is shown net.
  const commissionCut = booking.commissionDeducted
    ? Number(booking.commissionDeductedAmount ?? booking.comm ?? 0)
    : 0;
  const netTotal = booking.total || 0;
  const gross    = netTotal + commissionCut;
  // inverseApplyTaxes returns the NET as a plain NUMBER — it solves for the net
  // such that net + tax(net) === gross. Derive the per-tax lines from a forward
  // applyTaxes() pass on that net so the folio always reconciles to the gross.
  const netNum = inverseApplyTaxes(gross, tax || { components: [] }, nights);
  const net    = (typeof netNum === "number" && Number.isFinite(netNum)) ? netNum : gross;
  const built  = applyTaxes(net, tax || { components: [] }, nights);
  const taxComponents = (built.lines || []).map((l) => ({
    label:  l.name,
    amount: l.taxAmount,
    type:   l.type,
    rate:   l.rate,
  }));

  // Weekday/weekend split — bookings on the new pricing model stamp these four
  // fields; legacy records fall back to the single-line "Suite charge" row.
  const weekdayNights = Number(booking.weekdayNights) || 0;
  const weekendNights = Number(booking.weekendNights) || 0;
  const rateWeekday   = Number(booking.rateWeekday)   || 0;
  const rateWeekend   = Number(booking.rateWeekend)   || 0;
  const mixedNights   = weekdayNights > 0 && weekendNights > 0;

  return {
    room,
    nights,
    rate:        booking.rate || 0,
    netRoom:     net,
    extras:      [],
    components:  taxComponents,
    gross,
    netTotal,
    commissionCut,
    paid:        booking.paid || 0,
    balance:     netTotal - (booking.paid || 0),
    weekdayNights, weekendNights, rateWeekday, rateWeekend, mixedNights,
  };
}
