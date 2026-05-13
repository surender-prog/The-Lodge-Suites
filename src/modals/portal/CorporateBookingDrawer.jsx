import React, { useMemo, useState } from "react";
import {
  AlertCircle, BedDouble, Briefcase, Building2, Calendar as CalendarIcon, Check,
  Coins, FileText, Lock, Mail, Phone, Save, User2, X, Zap,
} from "lucide-react";
import { usePalette } from "./theme.jsx";
import { useT } from "../../i18n/LanguageContext.jsx";
import { useData, applyTaxes, buildCardOnFile, nightlyBreakdown, formatCurrency } from "../../data/store.jsx";

// Pay-now incentive — applied when a pre-payment-contracted account opts to
// settle at booking instead of on arrival. Mirrors the B2C BookingModal so
// guests get the same 5% saving regardless of booking surface.
const PAY_NOW_DISCOUNT_PCT = 5;

// ---------------------------------------------------------------------------
// CorporateBookingDrawer — full-page form for accepting / creating a
// booking on behalf of a corporate account. Pre-fills negotiated rates from
// the agreement (daily for stays under 30 nights, monthly-equivalent for 30+),
// applies the contract's tax-included flag and accommodation fee, and writes
// the booking with `source: "corporate", accountId: agreement.id` so it
// surfaces in the corporate's workspace immediately.
// ---------------------------------------------------------------------------

const ROOM_KEYS = {
  "studio":    "studio",
  "one-bed":   "oneBed",
  "two-bed":   "twoBed",
  "three-bed": "threeBed",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const inDaysISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const nightsBetween = (a, b) => {
  if (!a || !b) return 0;
  const ms = new Date(b) - new Date(a);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
};
// Currency display delegates to the ambient formatter so the Property Info
// "Currency & decimals" master flows through this drawer automatically.
const fmtBhd = (n) => formatCurrency(n);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function CorporateBookingDrawer({ agreement, onClose, onSaved }) {
  const p = usePalette();
  const t = useT();
  const { rooms, addBooking, calendar, tax, taxPatterns, activePatternId, hotelInfo } = useData();

  // When the contracted payment term is "Pre-payment (cash)", surface the
  // same Pay-on-arrival / Pay-now-save-5% choice the public booking modal
  // shows. Default to "later" (pay on arrival) so the operator confirms it
  // explicitly before charging.
  const isPrepay = (agreement.paymentTerms || "") === "Pre-payment (cash)";

  const [draft, setDraft] = useState({
    roomId:   rooms[0]?.id,
    checkIn:  inDaysISO(7),
    checkOut: inDaysISO(10),
    guests:   2,
    guestName:  "",
    guestEmail: "",
    guestPhone: "",
    notes: "",
    // Only meaningful when isPrepay is true. "later" → pay on arrival;
    // "now" → 5% off in exchange for non-refundable, charged now.
    paymentTiming: "later",
    // Card-on-file capture — only required when isPrepay + Pay-now is
    // chosen, mirroring the public BookingModal's required-card pattern.
    cardName: "",
    cardNum:  "",
    cardExp:  "",
    cardCvc:  "",
  });

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const room   = rooms.find((r) => r.id === draft.roomId);
  const nights = nightsBetween(draft.checkIn, draft.checkOut);
  const isLongStay = nights >= 30;

  // Pull the negotiated rate from the contract: daily for stays under 30
  // nights, monthly-equivalent for 30+ nights, falling back to the public
  // rack rate if the contract doesn't price that suite.
  const contractRate = useMemo(() => {
    if (!room) return 0;
    const key = ROOM_KEYS[room.id];
    if (!key) return room.price;
    if (isLongStay) {
      const monthly = Number(agreement.monthlyRates?.[key] || 0);
      if (monthly > 0) return Math.round(monthly / 30);
    }
    const daily = Number(agreement.dailyRates?.[key] || 0);
    if (daily > 0) return daily;
    return room.price;
  }, [room, isLongStay, agreement]);

  // Partner contracts price weekday vs weekend via `weekendUpliftPct` on the
  // agreement (a flat percentage premium on the contracted daily rate).
  // Long-stay monthly rates are flat and don't get a weekend uplift — the
  // monthly figure is already a blended package, so we keep both buckets
  // equal in that branch.
  const weekendUplift = Number(agreement.weekendUpliftPct || 0);
  const contractWeekendRate = isLongStay
    ? contractRate
    : Math.round(contractRate * (1 + weekendUplift / 100));

  // Weekday/weekend split — uses the configured weekend days from
  // hotelInfo and the contract's daily / monthly rate sheet. When the
  // calendar override is present for a given night, we still honour it by
  // averaging in the next step.
  const breakdown = useMemo(() => {
    if (!room || nights === 0) {
      return { weekdayNights: 0, weekendNights: 0, total: 0, perNight: [], rateWeekday: contractRate, rateWeekend: contractWeekendRate };
    }
    return nightlyBreakdown({
      checkIn: draft.checkIn, checkOut: draft.checkOut, room,
      weekendDays: hotelInfo?.weekendDays,
      overrideWeekday: contractRate,
      overrideWeekend: contractWeekendRate,
    });
  }, [room, nights, draft.checkIn, draft.checkOut, contractRate, contractWeekendRate, hotelInfo?.weekendDays]);

  // Average nightly rate honouring per-day calendar overrides — same logic
  // as the existing BookingCreator so calendar-edited rates don't get lost.
  // Now also weekday/weekend-aware: if no calendar override exists for a
  // given night, we pull the matching weekday/weekend rate from the
  // breakdown instead of the flat contractRate.
  const avgRate = useMemo(() => {
    if (!room || nights === 0) return contractRate;
    let sum = 0, count = 0;
    const start = new Date(draft.checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const k = `${room.id}|${iso}`;
      const baseForNight = breakdown.perNight.find((n) => n.date === iso)?.rate ?? contractRate;
      const r = calendar[k]?.rate ?? baseForNight;
      sum += r; count += 1;
    }
    return count ? Math.round(sum / count) : contractRate;
  }, [room, nights, draft.checkIn, contractRate, calendar, breakdown]);

  // Pricing breakdown — accommodation fee + tax components if the contract
  // is exclusive of taxes; otherwise just the room subtotal + fee. The
  // pay-now discount only applies when the contract is on pre-payment terms
  // and the operator selects "pay now"; it's a flat 5% off the room subtotal
  // so it doesn't compound with VAT or the accommodation fee.
  //
  // `room_subtotal` is the breakdown total (= sum of nightly rates) rather
  // than `avgRate × nights` so any weekday/weekend mix prices exactly.
  // We keep `avgRate` as the displayed "Avg nightly rate" line in the
  // summary so the operator still sees a single comparable number.
  const pricing = useMemo(() => {
    const room_subtotal = (breakdown.total > 0 ? breakdown.total : avgRate * nights);
    const accFee = Number(agreement.accommodationFee || 0) * nights;
    const payNowDiscount = (isPrepay && draft.paymentTiming === "now")
      ? Math.round(room_subtotal * (PAY_NOW_DISCOUNT_PCT / 100))
      : 0;
    const net = Math.max(0, room_subtotal - payNowDiscount);
    let total = net + accFee;
    let taxLines = [];
    let totalTax = 0;
    if (!agreement.taxIncluded && tax) {
      const taxed = applyTaxes(net, tax, Math.max(1, nights));
      taxLines = taxed.lines || [];
      totalTax = taxed.totalTax;
      total = taxed.gross + accFee;
    }
    return { room_subtotal, accFee, net, total, taxLines, totalTax, payNowDiscount };
  }, [avgRate, nights, agreement.accommodationFee, agreement.taxIncluded, tax, isPrepay, draft.paymentTiming, breakdown.total]);

  // Pay-now bookings require a card-on-file; the operator can't confirm
  // until all four fields are populated. Pay-on-arrival keeps the existing
  // contract-only validation.
  const needsCard = isPrepay && draft.paymentTiming === "now";
  const cardComplete = !!draft.cardName?.trim()
    && !!draft.cardNum?.trim()
    && !!draft.cardExp?.trim()
    && !!draft.cardCvc?.trim();
  const cardMissing = needsCard && !cardComplete;
  const valid = !!draft.guestName?.trim() && !!draft.roomId && nights > 0 && !cardMissing;

  const submit = () => {
    if (!valid) return;
    const id = `LS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const total = Math.round(pricing.total);
    // Payment-status / paid mapping mirrors the B2C BookingModal contract.
    // For accounts on Net terms (anything other than pre-payment) we keep
    // the historical "invoiced" status so AR continues to chase the
    // contract's payment-terms days. For pre-payment, both pay-now and
    // pay-on-arrival start as "pending" — capturing the card is not the
    // same as charging it. The operator records the actual transaction
    // via the Card on File panel ("Mark as charged") once the gateway
    // confirms; that flip rolls `paid` up to total and `paymentStatus`
    // to "paid".
    let paymentStatus = "invoiced";
    let paid = 0;
    if (isPrepay) {
      paymentStatus = "pending";
      paid = 0;
    }
    // Card-on-file — captured only when Pay-now is active. Stored masked /
    // last-4 by buildCardOnFile so the raw PAN never lives in the store.
    // Bookings with a card on file are flagged guaranteed so the front-
    // office knows the room is held all day instead of releasing at 3pm.
    const cardOnFile = (isPrepay && draft.paymentTiming === "now")
      ? buildCardOnFile({ name: draft.cardName, number: draft.cardNum, exp: draft.cardExp })
      : null;
    const guaranteed = cardOnFile != null;
    // Pattern lookup for the booking ledger — stamped on the record so
    // the admin Tax Report can group historical bookings by pattern even
    // after Settings → Tax Setup is updated.
    const activePattern = (taxPatterns || []).find((p) => p.id === activePatternId);
    const booking = {
      id,
      guest:       draft.guestName.trim(),
      email:       draft.guestEmail.trim(),
      phone:       draft.guestPhone.trim(),
      source:      "corporate",
      accountId:   agreement.id,
      roomId:      draft.roomId,
      checkIn:     draft.checkIn,
      checkOut:    draft.checkOut,
      nights,
      guests:      Number(draft.guests) || 1,
      rate:        avgRate,
      total,
      paid,
      status:      "confirmed",
      paymentStatus,
      paymentTiming: isPrepay ? draft.paymentTiming : "later",
      nonRefundable: isPrepay && draft.paymentTiming === "now",
      payNowDiscountPct: (isPrepay && draft.paymentTiming === "now") ? PAY_NOW_DISCOUNT_PCT : 0,
      payNowDiscount: pricing.payNowDiscount || 0,
      cardOnFile,
      guaranteed,
      guaranteeMode: guaranteed ? "card" : "none",
      notes:       draft.notes,
      // Tax breakdown stamped at booking time. `taxBase` is the net (room
      // subtotal − pay-now discount); the accommodation fee sits outside
      // the tax calculation so it's not included in `taxBase`. When the
      // contract is tax-inclusive the lines array is empty and `taxAmount`
      // is 0 — the Tax Report skips zero-tax bookings.
      taxAmount: pricing.totalTax || 0,
      taxBase: pricing.net || 0,
      taxLines: pricing.taxLines || [],
      taxPatternId: agreement.taxIncluded ? null : (activePatternId || null),
      taxPatternName: agreement.taxIncluded ? "Inclusive (corporate)" : (activePattern?.name || null),
      // Weekday/weekend split — drives the "X weekday × BHD A + Y weekend ×
      // BHD B" line on the admin Bookings drawer + folio. For long-stay
      // monthly bookings both rates are equal so the breakdown collapses
      // to the single-rate display.
      nightlyBreakdown: breakdown.perNight || null,
      weekdayNights:    breakdown.weekdayNights || 0,
      weekendNights:    breakdown.weekendNights || 0,
      rateWeekday:      breakdown.rateWeekday || 0,
      rateWeekend:      breakdown.rateWeekend || 0,
    };
    addBooking(booking);
    onSaved?.(booking);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            New booking · corporate · {agreement.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            Book for {agreement.account}
          </div>
        </div>
        <button onClick={onClose}
          className="flex items-center gap-2"
          style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}` }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        ><X size={14} /> Close</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-8">
          {/* Account banner */}
          <div className="p-5 mb-6 flex items-start gap-4 flex-wrap" style={{
            backgroundColor: `${p.accent}10`,
            border: `1px solid ${p.accent}40`,
            borderInlineStart: `4px solid ${p.accent}`,
          }}>
            <div className="flex items-center justify-center" style={{
              width: 56, height: 56, flexShrink: 0,
              border: `2px solid ${p.accent}`,
              backgroundColor: p.bgPanelAlt, color: p.accent,
            }}>
              <Building2 size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, fontWeight: 500 }}>
                {agreement.account}
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-2" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                {agreement.industry && <span>{agreement.industry}</span>}
                {agreement.industry && <span style={{ color: p.textMuted }}>·</span>}
                <span style={{ color: p.accent, fontWeight: 600 }}>{agreement.id}</span>
                <span style={{ color: p.textMuted }}>·</span>
                <span>{agreement.paymentTerms || "On departure"}</span>
                {Number(agreement.creditLimit) > 0 && <>
                  <span style={{ color: p.textMuted }}>·</span>
                  <span>Credit limit {fmtBhd(agreement.creditLimit)}</span>
                </>}
              </div>
              <div className="mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                Contract {fmtDate(agreement.startsOn)} → {fmtDate(agreement.endsOn)}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Form column — 2 wide */}
            <div className="lg:col-span-2 space-y-6">
              <CardBlock title={<><BedDouble size={12} className="inline mr-1.5" /> Reservation</>} p={p}>
                <div className="grid gap-4">
                  <Field label="Suite type" p={p}>
                    <select value={draft.roomId} onChange={(e) => set({ roomId: e.target.value })}
                      className="outline-none cursor-pointer"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", width: "100%" }}>
                      {rooms.map((r) => {
                        const key = ROOM_KEYS[r.id];
                        const daily = Number(agreement.dailyRates?.[key] || 0);
                        const monthly = Number(agreement.monthlyRates?.[key] || 0);
                        return (
                          <option key={r.id} value={r.id}>
                            {t(`rooms.${r.id}.name`)}
                            {daily > 0 ? ` · BHD ${daily}/n` : ""}
                            {monthly > 0 ? ` · ${formatCurrency(monthly)}/mo` : ""}
                            {daily === 0 && monthly === 0 ? ` · BHD ${r.price}/n (rack)` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Check-in" p={p}>
                      <input type="date" value={draft.checkIn} onChange={(e) => set({ checkIn: e.target.value })}
                        className="w-full outline-none"
                        style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                      />
                    </Field>
                    <Field label="Check-out" p={p}>
                      <input type="date" value={draft.checkOut} onChange={(e) => set({ checkOut: e.target.value })}
                        className="w-full outline-none"
                        style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                      />
                    </Field>
                  </div>
                  <Field label="Number of guests" p={p}>
                    <input type="number" value={draft.guests} onChange={(e) => set({ guests: e.target.value })} min="1"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                    />
                  </Field>
                </div>
              </CardBlock>

              <CardBlock title={<><User2 size={12} className="inline mr-1.5" /> Guest details</>} p={p}>
                <div className="grid gap-4">
                  <Field label="Guest name (the actual person staying)" p={p}>
                    <input value={draft.guestName} onChange={(e) => set({ guestName: e.target.value })}
                      placeholder="e.g. Sara Al-Hammadi"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                    />
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Guest email (optional)" p={p}>
                      <input type="email" value={draft.guestEmail} onChange={(e) => set({ guestEmail: e.target.value })}
                        placeholder="email@company.com"
                        className="w-full outline-none"
                        style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                      />
                    </Field>
                    <Field label="Guest phone (optional)" p={p}>
                      <input value={draft.guestPhone} onChange={(e) => set({ guestPhone: e.target.value })}
                        placeholder="+973…"
                        className="w-full outline-none"
                        style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                      />
                    </Field>
                  </div>
                  <Field label="Internal notes" p={p}>
                    <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })}
                      placeholder="High floor, late arrival, dietary preferences…"
                      rows={3}
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical" }}
                    />
                  </Field>
                </div>
              </CardBlock>

              {/* Inclusions snapshot */}
              {Object.values(agreement.inclusions || {}).some(Boolean) && (
                <CardBlock title={<><Check size={12} className="inline mr-1.5" /> Contract inclusions for this booking</>} p={p}>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "breakfast",     label: "Daily breakfast" },
                      { key: "lateCheckOut",  label: "Guaranteed late check-out" },
                      { key: "parking",       label: "Parking" },
                      { key: "wifi",          label: "Wi-Fi" },
                      { key: "meetingRoom",   label: "Meeting room access" },
                    ].filter((it) => agreement.inclusions?.[it.key]).map((it) => (
                      <span key={it.key} className="inline-flex items-center gap-1.5"
                        style={{ padding: "0.4rem 0.85rem", backgroundColor: `${p.success}10`, border: `1px solid ${p.success}`, color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", fontWeight: 600 }}>
                        <Check size={11} /> {it.label}
                      </span>
                    ))}
                  </div>
                </CardBlock>
              )}

              {/* Pre-payment branch — when the underlying contract is on
                  "Pre-payment (cash)" terms we drop the standard billing-
                  to-account flow and surface the same Pay-now / Pay-on-
                  arrival choice that the public B2C booking modal shows. */}
              {isPrepay && (
                <CardBlock title={<><Lock size={12} className="inline mr-1.5" /> Payment</>} p={p}>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <PrepayChoice
                      active={draft.paymentTiming === "later"}
                      title="Pay on arrival"
                      hint="Settled in cash at check-in. Booking held against the contract until then."
                      onClick={() => set({ paymentTiming: "later" })}
                      p={p}
                    />
                    <PrepayChoice
                      active={draft.paymentTiming === "now"}
                      title="Pay now"
                      hint={`${PAY_NOW_DISCOUNT_PCT}% off the stay in exchange for non-refundable terms.`}
                      badge={`Save ${PAY_NOW_DISCOUNT_PCT}%`}
                      onClick={() => set({ paymentTiming: "now" })}
                      p={p}
                    />
                  </div>
                  <p className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
                    Pre-payment terms · this contract requires payment at booking. Choose pay-on-arrival or pay-now.
                  </p>

                  {/* Card-on-file capture — mirrors the public BookingModal.
                      Required when Pay-now is selected so the operator can
                      charge against the contract immediately. Not rendered
                      for Pay-on-arrival (cash at check-in). */}
                  {draft.paymentTiming === "now" && (
                    <div className="mt-4">
                      <div className="p-3 mb-3" style={{
                        backgroundColor: `${p.warn}14`,
                        border: `1px solid ${p.warn}45`,
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.78rem", lineHeight: 1.55, color: p.textPrimary,
                      }}>
                        <div style={{
                          color: p.warn,
                          fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase",
                          fontWeight: 700, marginBottom: 6,
                        }}>
                          Non-refundable rate · Save {PAY_NOW_DISCOUNT_PCT}%
                        </div>
                        <ul style={{ paddingInlineStart: 18, listStyle: "disc", margin: 0 }}>
                          <li>The full stay is charged immediately and is <strong>non-refundable</strong>.</li>
                          <li>No refunds for cancellations, modifications, no-shows, or early check-out.</li>
                          <li>Date or suite changes are not permitted on this rate.</li>
                          <li>If the guest may need flexibility, choose <em>Pay on arrival</em> instead.</li>
                        </ul>
                      </div>
                      <div className="grid gap-3">
                        <Field label="Name on card" p={p}>
                          <input
                            value={draft.cardName}
                            onChange={(e) => set({ cardName: e.target.value })}
                            className="w-full outline-none"
                            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                          />
                        </Field>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-3">
                            <Field label="Card number" p={p}>
                              <input
                                value={draft.cardNum}
                                onChange={(e) => set({ cardNum: e.target.value })}
                                placeholder="•••• •••• •••• ••••"
                                className="w-full outline-none"
                                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                              />
                            </Field>
                          </div>
                          <Field label="Exp" p={p}>
                            <input
                              value={draft.cardExp}
                              onChange={(e) => set({ cardExp: e.target.value })}
                              placeholder="MM/YY"
                              className="w-full outline-none"
                              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                            />
                          </Field>
                          <Field label="CVC" p={p}>
                            <input
                              value={draft.cardCvc}
                              onChange={(e) => set({ cardCvc: e.target.value })}
                              placeholder="•••"
                              className="w-full outline-none"
                              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  )}
                </CardBlock>
              )}
            </div>

            {/* Sticky pricing summary */}
            <aside className="lg:sticky lg:top-4 self-start space-y-4">
              <CardBlock title="Booking summary" p={p}>
                <div className="space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
                  <SummaryRow label="Suite" value={room ? t(`rooms.${room.id}.name`) : "—"} bold p={p} />
                  <SummaryRow label="Stay" value={`${fmtDate(draft.checkIn)} → ${fmtDate(draft.checkOut)}`} p={p} />
                  <SummaryRow label="Nights" value={nights} accent={isLongStay} p={p} />
                  <SummaryRow label="Guests" value={draft.guests || 0} p={p} />
                  {isLongStay && (
                    <div className="px-3 py-2 my-2" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}`, color: p.accent, fontSize: "0.72rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Zap size={11} /> Long-stay · monthly rate applied
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 space-y-2" style={{ borderTop: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                  <SummaryRow label={`Suite × ${nights} ${nights === 1 ? "night" : "nights"}`} value={fmtBhd(pricing.room_subtotal)} p={p} />
                  {/* Weekday/weekend split — surfaced when the stay spans
                      both buckets AND the contract is on daily rates (long-
                      stay monthly bookings price both buckets identically,
                      so the rows collapse). */}
                  {breakdown.weekdayNights > 0 && breakdown.weekendNights > 0 && !isLongStay && (
                    <>
                      <SummaryRow
                        label={`${breakdown.weekdayNights} × weekday × ${fmtBhd(breakdown.rateWeekday)}`}
                        value={fmtBhd(breakdown.weekdayNights * breakdown.rateWeekday)}
                        muted p={p}
                      />
                      <SummaryRow
                        label={`${breakdown.weekendNights} × weekend × ${fmtBhd(breakdown.rateWeekend)}`}
                        value={fmtBhd(breakdown.weekendNights * breakdown.rateWeekend)}
                        muted p={p}
                      />
                    </>
                  )}
                  <SummaryRow label="Avg nightly rate" value={fmtBhd(avgRate)} muted p={p} />
                  {pricing.payNowDiscount > 0 && (
                    <SummaryRow label={`Pay-now · ${PAY_NOW_DISCOUNT_PCT}% off (non-refundable)`} value={`− ${fmtBhd(pricing.payNowDiscount)}`} accent p={p} />
                  )}
                  {pricing.accFee > 0 && (
                    <SummaryRow label={`Hotel accommodation fee · ${nights} nt`} value={fmtBhd(pricing.accFee)} p={p} />
                  )}
                  {pricing.taxLines.map((line, i) => {
                    const rateLabel = line.type === "percentage"
                      ? `${line.rate}%${line.calculation === "compound" ? " · compound" : ""}`
                      : `BHD ${line.amount}/night`;
                    return (
                      <SummaryRow key={line.id || i} label={`${line.name} · ${rateLabel}`} value={fmtBhd(line.taxAmount)} muted p={p} />
                    );
                  })}
                  {agreement.taxIncluded && (
                    <SummaryRow label="Tax handling" value="Inclusive" muted p={p} />
                  )}
                  <div className="pt-3 mt-3 flex justify-between items-baseline" style={{ borderTop: `1px solid ${p.border}` }}>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.textPrimary }}>Total</span>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 700 }}>{fmtBhd(pricing.total)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 4 }}>
                    <span>Payment</span>
                    <span>
                      {isPrepay ? (
                        <strong style={{ color: p.textPrimary }}>
                          {draft.paymentTiming === "now" ? "Pay now · non-refundable" : "Pay on arrival · cash"}
                        </strong>
                      ) : (
                        <><strong style={{ color: p.textPrimary }}>{agreement.paymentTerms || "On departure"}</strong> · Invoiced</>
                      )}
                    </span>
                  </div>
                </div>
              </CardBlock>

              {!valid && (
                <div className="p-3 flex items-start gap-2"
                  style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.warn}`, borderInlineStart: `4px solid ${p.warn}` }}>
                  <AlertCircle size={13} style={{ color: p.warn, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem", lineHeight: 1.55 }}>
                    {!draft.guestName?.trim() && <div>Add the guest name (the person actually staying).</div>}
                    {nights <= 0 && <div>Pick a check-out date after the check-in date.</div>}
                    {cardMissing && <div>Card details required for Pay-now bookings.</div>}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-4 flex items-center justify-end gap-3 flex-shrink-0" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <button onClick={onClose}
          style={{ color: p.textMuted, padding: "0.45rem 0.95rem", border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
          Cancel
        </button>
        <button onClick={submit} disabled={!valid}
          style={{
            backgroundColor: valid ? p.accent : "transparent",
            color: valid ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textDim,
            border: `1px solid ${valid ? p.accent : p.border}`,
            padding: "0.55rem 1.2rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
            letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 8,
            cursor: valid ? "pointer" : "default",
          }}>
          <Save size={12} /> Confirm booking · {fmtBhd(pricing.total)}
        </button>
      </footer>
    </div>
  );
}

function CardBlock({ title, action, children, p }) {
  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          {title}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, children, p }) {
  return (
    <label className="block">
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function SummaryRow({ label, value, accent, bold, muted, p }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: p.textMuted }}>{label}</span>
      <span style={{
        color: accent ? p.accent : muted ? p.textMuted : p.textPrimary,
        fontWeight: bold || accent ? 700 : 500,
        fontVariantNumeric: "tabular-nums",
        textAlign: "end",
      }}>{value}</span>
    </div>
  );
}

// PrepayChoice — chip-style toggle for the pay-now / pay-on-arrival choice
// surfaced when the contract is on pre-payment terms. Mirrors the visual
// language of the public BookingModal's PaymentChoice but reads the active
// palette so it adapts to the operator portal's light/dark theme.
function PrepayChoice({ active, title, hint, badge, onClick, p }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-start p-3 relative"
      style={{
        backgroundColor: active ? `${p.accent}1F` : p.bgPanelAlt,
        border: `1.5px solid ${active ? p.accent : p.border}`,
        cursor: "pointer", fontFamily: "'Manrope', sans-serif",
      }}
    >
      {badge && (
        <span style={{
          position: "absolute", top: -10, insetInlineEnd: 12,
          backgroundColor: p.success,
          color: p.theme === "light" ? "#FFFFFF" : "#FFFFFF",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase",
          fontWeight: 700,
          padding: "3px 9px",
        }}>{badge}</span>
      )}
      <div className="flex items-center gap-2">
        <span style={{
          width: 14, height: 14, borderRadius: "50%",
          border: `2px solid ${active ? p.accent : p.border}`,
          backgroundColor: active ? p.accent : "transparent",
          flexShrink: 0,
        }} />
        <span style={{ color: active ? p.accent : p.textPrimary, fontSize: "0.85rem", fontWeight: 700 }}>
          {title}
        </span>
      </div>
      <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 4, lineHeight: 1.5 }}>
        {hint}
      </div>
    </button>
  );
}
