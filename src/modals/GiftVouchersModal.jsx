import React, { useMemo, useState } from "react";
import {
  BedDouble, Calendar, Check, Coffee, Gift,
  Heart, Loader2, Mail, Send, ShieldCheck, Sparkles,
  Star, Users, Utensils,
} from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG } from "../data/images.js";
import { EditorialPage, PageSection } from "./EditorialPage.jsx";
import { pushToast } from "./portal/admin/ui.jsx";
import {
  formatCurrency,
  DEFAULT_GIFT_CARD_TIERS,
  computeGiftCardPrice,
  useData,
} from "../data/store.jsx";
import { roomLabel } from "../lib/rooms.js";
import { useT } from "../i18n/LanguageContext.jsx";
// Note: this modal uses the unified `issueGiftCard` flow which creates
// the gift card AND posts the matching invoice + payment receipt in one
// shot, so the buyer's transaction is properly accounted for from the
// moment the code is generated.

// ---------------------------------------------------------------------------
// Gift Vouchers — full editorial page that the Footer "Gift Vouchers" link
// opens. Gift cards are bulk pre-purchases of room nights at a tiered
// discount. The buyer picks a suite type + a night tier; the recipient
// gets a code to redeem the prepaid nights during booking.
//
// Pricing model (set in store.GIFT_CARD_TIERS):
//   5n → 5% · 10n → 7% · 15n → 10% · 20n → 15% · 25n → 20% · 30n → 30%
//   Custom — sales-led, surfaced as a "talk to us" CTA.
// ---------------------------------------------------------------------------

// Quick suite metadata for the buyer-side card UI. The rack rate is
// pulled live from useData().rooms so a price edit in admin flows
// through; this map is only for display labels.
const SUITE_BLURBS = {
  "studio":    "Smart-functional · 43 sqm · sleeps 2",
  "one-bed":   "Separate bedroom + living · 60 sqm · sleeps 3",
  "two-bed":   "Families & friends · 142 sqm · sleeps 5",
  "three-bed": "The largest at the property · 150 sqm · sleeps 6",
};

const OCCASIONS = [
  { id: "anniversary",  icon: Heart,    title: "Anniversaries",     note: "Two nights, breakfast served in suite, late check-out as standard." },
  { id: "birthdays",    icon: Sparkles, title: "Birthdays",         note: "Welcome amenity in the suite the moment they arrive." },
  { id: "thankyou",     icon: Star,     title: "A thank-you",       note: "For the colleague, client or family member who hosts everyone else." },
  { id: "honeymoon",    icon: Coffee,   title: "Honeymoons",        note: "Pair with our Romantic Escape package for an intimate first stay." },
  { id: "corporate",    icon: Users,    title: "Corporate gifting", note: "Bulk vouchers with custom message inserts for client appreciation programmes." },
  { id: "newhome",      icon: Gift,     title: "Welcome to Bahrain",note: "For relocations and onboarding — a soft landing in Juffair." },
];

// Payment-method catalogue for the public buyer. Each method routes
// through `issueGiftCard(payload, { paymentMethod })` which posts a
// receipt with `method` set to `key` — so the admin Gift Cards detail
// drawer and the Payments ledger see the method the buyer chose.
// (Payment options used to live on this page; they've moved to the
// admin — buyers submit a request, the hotel processes payment and
// flips the card from "requested" to "issued".)

const FAQS = [
  { id: "validity",  q: "How long is a gift card valid?",
    a: "Twelve months from the day of purchase. We're happy to extend on request when life intervenes — just let us know before the expiry date." },
  { id: "redeem",    q: "How does redemption work?",
    a: "The recipient receives a unique code (e.g. LS-GC-XXXX-XXXX). They enter it during booking and the prepaid nights apply automatically against the suite type the card was issued for. Partial redemption is supported — unused nights stay on the card for next time." },
  { id: "transfer",  q: "Can I transfer or split a card?",
    a: "Cards are transferable until the first redemption. Once used, the remaining balance stays with the original recipient. Want to split a 30-night card into smaller gifts? Talk to sales." },
  { id: "delivery",  q: "How is the gift card delivered?",
    a: "Either as a beautifully designed PDF emailed straight to the recipient on a date you choose, or as a printed certificate with a hand-written message — collected from reception or couriered within Bahrain." },
  { id: "refund",    q: "Are gift cards refundable?",
    a: "Gift cards are non-refundable but never expire silently — we'll always reach out before the expiry date if there's still a balance on file." },
  { id: "custom",    q: "Can I order more than 30 nights?",
    a: "Yes — bespoke gifting (50, 100, 365 nights) and corporate bulk programmes are handled by our sales team. Tap 'Talk to sales' below and we'll be in touch within one business day." },
];

export const GiftVouchersModal = ({ open, onClose, onBook, onJoin }) => {
  // Wired by App.jsx to close this modal and pop the JoinModal. Falls
  // back to onClose so the page still behaves predictably (no dead
  // click) if a host forgets to pass onJoin.
  const handleJoin = typeof onJoin === "function" ? onJoin : onClose;
  const { rooms, hotelInfo, addGiftCard, members, giftCardTiers } = useData();
  const t = useT();
  // Tiers come straight off the live admin-editable slice. Empty array
  // fallback uses the bundled defaults so the modal still renders when
  // an over-zealous admin deletes all the tiers.
  const activeTiers = useMemo(() => {
    const list = (giftCardTiers && giftCardTiers.length > 0) ? giftCardTiers : DEFAULT_GIFT_CARD_TIERS;
    return list.filter((t) => t.active !== false);
  }, [giftCardTiers]);
  // Default to the second-cheapest suite (One-Bed) so the price chip
  // doesn't anchor too low on first view.
  const defaultRoomId = rooms?.find((r) => r.id === "one-bed")?.id || rooms?.[0]?.id || "studio";
  const [roomId, setRoomId]   = useState(defaultRoomId);
  const [tierId, setTierId]   = useState(activeTiers[1]?.id || activeTiers[0]?.id || "10n");
  // The buyer supplies their LS Privilege email so we can identify their
  // member record and park the issued card on their account. Recipient
  // assignment, delivery format, and personal message used to live in a
  // separate composer step but have moved into the LS Privilege member
  // portal — buyers send / re-print their cards from there.
  const [buyerEmail, setBuyerEmail] = useState("");
  // `processing` drives the "Submit request" → spinner state during
  // the addGiftCard write. Payment options have moved to the admin —
  // the public form just captures intent + buyer identity. Hotel
  // accounts process the payment offline (Benefit Pay, bank transfer,
  // POS, etc.) and flip the card from "requested" to "issued" from
  // the gift cards admin section.
  const [processing, setProcessing] = useState(false);
  // Show-issued-code panel after a successful purchase so the buyer
  // (or the operator standing behind them) can copy the code to share.
  const [issued, setIssued] = useState(null);

  const room  = useMemo(() => (rooms || []).find((r) => r.id === roomId) || rooms?.[0], [rooms, roomId]);
  const tier  = useMemo(() => activeTiers.find((t) => t.id === tierId) || activeTiers[0], [tierId, activeTiers]);
  const ratePerNight = Number(room?.price || 0);
  const price = useMemo(
    () => computeGiftCardPrice({ nights: tier.nights, discountPct: tier.discountPct, ratePerNight }),
    [tier, ratePerNight]
  );

  // Resolve emails → member records. Case + whitespace tolerant; empty
  // string → null. Drives the "you are …" and "recipient is …" chips
  // and the submit gate below.
  const buyerMember = useMemo(() => {
    const e = (buyerEmail || "").trim().toLowerCase();
    if (!e) return null;
    return (members || []).find((m) => (m.email || "").toLowerCase() === e) || null;
  }, [buyerEmail, members]);

  // Public form only needs the buyer to be an LS Privilege member —
  // no payment fields gate the submit anymore. Payment is handled by
  // the hotel offline once the request lands.
  const canSubmit = !!buyerMember && !processing;

  const handleSubmit = async () => {
    if (!buyerMember) {
      pushToast({ message: "Enter your LS Privilege email to continue.", kind: "warn" });
      return;
    }
    setProcessing(true);
    try {
      // Status starts at "requested" — the card is on file but NOT
      // redeemable (findRedeemableGiftCard only honours status="issued").
      // The hotel processes the buyer's payment offline (Benefit Pay,
      // bank transfer, in-person, etc.) and flips the card to "issued"
      // from the gift cards admin section, which also generates the
      // invoice + payment receipt at that point.
      const saved = addGiftCard({
        tierId: tier.id,
        roomId: room.id,
        totalNights: tier.nights,
        discountPct: tier.discountPct,
        ratePerNight,
        faceValue: price.gross,
        paidAmount: 0,
        status: "requested",
        // Recipient is left blank at request time — the buyer assigns
        // one later from their LS Privilege portal. recipientMemberId
        // mirrors the buyer so the read-side that looks up cards
        // "owned" by a member still surfaces the request.
        recipientMemberId: buyerMember.id,
        recipientName:     buyerMember.name,
        recipientEmail:    buyerMember.email,
        senderMemberId:    buyerMember.id,
        senderName:        buyerMember.name,
        senderEmail:       buyerMember.email,
        message:           "",
        delivery:          "email",
        deliverOn:         null,
        // Stamp the requested amount on the card so the admin sees
        // exactly what to invoice when they process payment.
        requestedAmount: price.net,
      });
      setIssued(saved || null);
      pushToast({
        message: saved
          ? `Request received · we'll be in touch about payment for ${saved.code}.`
          : "Couldn't submit your request. Please try again.",
        kind: saved ? undefined : "warn",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Reset + close — used by the "Done" button in the success panel.
  const closeAfterIssue = () => {
    setIssued(null);
    setBuyerEmail("");
    onClose?.();
  };

  const ccy = hotelInfo?.currency || "BHD";

  return (
    <EditorialPage
      open={open}
      onClose={onClose}
      eyebrow="Gift Vouchers"
      title="A stay,"
      italic="given as a gift."
      intro="Buy a bundle of room nights upfront — save with the bulk-purchase discount, hand the code to anyone, they redeem at booking. The bigger the bundle, the better the per-night rate."
      heroImage={IMG.lobby}
      cta={
        <button
          onClick={() => { onClose?.(); setTimeout(() => onBook?.(), 200); }}
          style={{
            padding: "0.95rem 1.6rem", backgroundColor: C.gold, color: C.bgDeep,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            border: `1px solid ${C.gold}`, cursor: "pointer", whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.goldBright; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.gold; }}
        >
          <Calendar size={13} /> Or book a stay direct
        </button>
      }
    >
      {/* Request-received panel — the buyer's request is on file but
          no code is shown (the card is in "requested" status and not
          yet redeemable). The hotel reaches out via the buyer's email
          with payment instructions; once payment lands they flip it
          to "issued" and the buyer/recipient sees the redeemable
          code in the LS Privilege portal. */}
      {issued && (
        <div className="p-7 mb-12" style={{
          backgroundColor: C.bgDeep, color: C.cream,
          border: `1px solid ${C.gold}`,
        }}>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
                Request received
              </div>
              <div className="mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2.1rem", lineHeight: 1.1 }}>
                {issued.totalNights} nights at the {roomLabel((rooms || []).find((r) => r.id === issued.roomId) || issued.roomId, t)}
              </div>
              <div className="mt-2" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.55 }}>
                Thank you — our reservations team will reach out to <strong style={{ color: C.cream }}>{issued.senderEmail}</strong> with payment instructions. Once the payment is confirmed the redeemable code will appear in your LS Privilege portal and we'll email a copy for your records.
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ backgroundColor: "rgba(201,169,97,0.18)" }}>
                <div className="p-3" style={{ backgroundColor: "rgba(15,16,20,0.4)" }}>
                  <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    Request reference
                  </div>
                  <div className="mt-1" style={{ color: C.cream, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem", letterSpacing: "0.04em" }}>
                    {issued.id}
                  </div>
                </div>
                <div className="p-3" style={{ backgroundColor: "rgba(15,16,20,0.4)" }}>
                  <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    Amount due
                  </div>
                  <div className="mt-1" style={{ color: C.cream, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 500 }}>
                    {formatCurrency(issued.requestedAmount || issued.faceValue)}
                  </div>
                </div>
                <div className="p-3" style={{ backgroundColor: "rgba(15,16,20,0.4)" }}>
                  <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    Status
                  </div>
                  <div className="mt-1 inline-flex items-center gap-2" style={{ color: "#E0B85E", fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "2px 8px", border: "1px solid #E0B85E" }}>
                    Awaiting payment
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={closeAfterIssue}
              style={{
                padding: "0.85rem 1.4rem", backgroundColor: C.gold, color: C.bgDeep,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                border: `1px solid ${C.gold}`, cursor: "pointer", whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            ><Check size={13} /> Done</button>
          </div>
        </div>
      )}

      {/* Suite picker */}
      <PageSection
        eyebrow="Step 1 · Pick a suite"
        title="Choose the"
        italic="suite type."
        intro="The card is issued for one suite type. The recipient redeems the prepaid nights against the same type at booking. Pick a higher suite to gift a premium stay; pick the Studio to gift more nights for less."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {(rooms || []).map((r) => {
            const sel = roomId === r.id;
            return (
              <button key={r.id}
                onClick={() => setRoomId(r.id)}
                className="text-start p-6 transition-colors"
                style={{
                  backgroundColor: sel ? C.cream : C.paper,
                  borderLeft: sel ? `3px solid ${C.gold}` : "3px solid transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.cream; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.paper; }}
              >
                <BedDouble size={20} style={{ color: C.goldDeep }} />
                <div className="mt-3" style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem",
                  color: C.bgDeep, fontWeight: 500, lineHeight: 1.05,
                }}>
                  {roomLabel(r, t)}
                </div>
                <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 6, lineHeight: 1.5 }}>
                  {SUITE_BLURBS[r.id] || ""}
                </div>
                <div className="mt-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: C.goldDeep, fontWeight: 700 }}>
                  Rack {formatCurrency(r.price)} / night
                </div>
              </button>
            );
          })}
        </div>
      </PageSection>

      {/* Tier picker */}
      <PageSection
        eyebrow="Step 2 · Pick a bundle"
        title="Bigger bundles,"
        italic="bigger savings."
        intro="Six preset tiers. The discount stacks the more nights you buy, so a 30-night gift card costs 30% less than buying those nights one at a time."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {activeTiers.map((t) => {
            const tp  = computeGiftCardPrice({ nights: t.nights, discountPct: t.discountPct, ratePerNight });
            const sel = tierId === t.id;
            return (
              <button key={t.id}
                onClick={() => setTierId(t.id)}
                className="text-start p-7 transition-colors"
                style={{
                  backgroundColor: sel ? C.cream : C.paper,
                  borderLeft: sel ? `3px solid ${C.gold}` : "3px solid transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.cream; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.paper; }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "2.4rem", color: C.bgDeep, fontWeight: 400, lineHeight: 1,
                  }}>
                    {t.nights} <span style={{ fontSize: "1rem", color: C.textDim, fontStyle: "italic" }}>nights</span>
                  </div>
                  <span style={{
                    color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.78rem", fontWeight: 700,
                    padding: "3px 9px", border: `1px solid ${C.goldDeep}`,
                  }}>
                    − {t.discountPct}%
                  </span>
                </div>
                <div style={{
                  color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginTop: 10,
                }}>
                  {t.label}
                </div>
                <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginTop: 8 }}>
                  {t.hint}
                </div>
                <div className="mt-4 pt-3" style={{ borderTop: `1px solid rgba(0,0,0,0.08)`, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
                    Rack: <span style={{ textDecoration: "line-through" }}>{formatCurrency(tp.gross)}</span>
                  </div>
                  <div style={{
                    color: C.bgDeep, fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "1.5rem", fontWeight: 500,
                  }}>
                    {formatCurrency(tp.net)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom — talk to sales */}
        <div className="mt-px p-7 flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: C.bgDeep, color: C.cream, borderLeft: `3px solid ${C.gold}` }}>
          <div className="min-w-0">
            <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Custom · {`>`} 30 nights or bulk corporate
            </div>
            <div className="mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.6rem", lineHeight: 1.1 }}>
              Talk to us about bespoke bundles.
            </div>
            <div className="mt-2" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55 }}>
              Beyond the six preset tiers, our sales team builds bespoke gift programmes — annual relocations, corporate appreciation, multi-suite year-round access. Reply within one business day.
            </div>
          </div>
          <a
            href={`mailto:${hotelInfo?.emailSales || "sales@thelodgesuites.com"}?subject=Custom%20gift%20card%20enquiry`}
            style={{
              padding: "0.85rem 1.4rem", backgroundColor: "transparent", color: C.gold,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              border: `1px solid ${C.gold}`, cursor: "pointer", whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
            }}
          ><Mail size={13} /> Talk to sales</a>
        </div>
      </PageSection>

      {/* Step 3 · Submit request. Payment options have moved into the
          admin workflow — buyers submit intent + their LS Privilege
          email, and the hotel reaches out with payment instructions
          (Benefit Pay, bank transfer, in-person, etc.). On payment
          confirmation the admin flips the card from "requested" to
          "issued" and the redeemable code becomes visible in the
          buyer's LS Privilege portal. */}
      {!issued && (
        <PageSection
          eyebrow="Step 3 · Submit request"
          title="Send it to"
          italic="reservations."
          intro="No payment is taken on this page. We log your request and our reservations team reaches out via email with the payment options available to you (Benefit Pay, bank transfer, in-person at the front desk). Once payment is confirmed the gift card becomes redeemable in your LS Privilege portal."
        >
          {/* Buyer identification — the requested card is parked on the
              buyer's LS Privilege account. We match the email against
              the directory and gate the submit until the row resolves. */}
          <div className="p-7 mb-px" style={{ backgroundColor: C.cream }}>
            <div className="flex items-start gap-3" style={{ marginBottom: 14 }}>
              <div style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                LS Privilege only
              </div>
              <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55 }}>
                Gift cards live on an LS Privilege account. The request is logged against your member record so the team can confirm pricing and reach out about payment. <button onClick={handleJoin} style={{ background: "transparent", border: "none", color: C.goldDeep, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>Not a member yet? Join LS Privilege.</button>
              </div>
            </div>
            <PaperField label="Your LS Privilege email">
              <input type="email" value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="you@example.com" style={inputStyle}
                autoComplete="email"
              />
            </PaperField>
            <MemberLookupChip member={buyerMember} email={buyerEmail} role="buyer" onJoin={handleJoin} />
          </div>

          {/* Summary + submit bar */}
          <div className="mt-px p-6 flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: C.bgDeep, color: C.cream }}>
            <div>
              <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Your request
              </div>
              <div className="mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontStyle: "italic", lineHeight: 1.1 }}>
                {tier.nights} nights at the {roomLabel(room, t)} · save {tier.discountPct}%
              </div>
              <div className="flex items-baseline gap-3 mt-2 flex-wrap">
                <span style={{ color: C.textDim, fontSize: "0.86rem", textDecoration: "line-through" }}>{formatCurrency(price.gross)}</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", fontWeight: 400, color: C.gold, lineHeight: 1 }}>
                  {formatCurrency(price.net)}
                </span>
                <span style={{ color: C.cream, fontSize: "0.72rem", letterSpacing: "0.04em" }}>
                  ({ccy} {Math.round(price.net / tier.nights)} / night)
                </span>
              </div>
              <div className="mt-2" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                Reservations will confirm pricing and email payment instructions.
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                padding: "1rem 1.7rem",
                backgroundColor: canSubmit ? C.gold : "rgba(201,169,97,0.3)",
                color: canSubmit ? C.bgDeep : C.textMuted,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
                letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                border: `1px solid ${canSubmit ? C.gold : "rgba(201,169,97,0.3)"}`,
                cursor: canSubmit ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", gap: 10,
                minWidth: 260, justifyContent: "center",
              }}
              onMouseEnter={(e) => { if (canSubmit && !processing) e.currentTarget.style.backgroundColor = C.goldBright; }}
              onMouseLeave={(e) => { if (canSubmit && !processing) e.currentTarget.style.backgroundColor = C.gold; }}
            >
              {processing ? (
                <><Loader2 size={13} style={{ animation: "spin 0.9s linear infinite" }} /> Submitting request…</>
              ) : (
                <><Send size={13} /> Submit request · {formatCurrency(price.net)}</>
              )}
            </button>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </PageSection>
      )}

      {/* Occasions */}
      <PageSection
        eyebrow="Made for"
        title="Every kind of"
        italic="moment."
        intro="A bundle works for the kind of gift where a present feels too small and a holiday feels too big."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {OCCASIONS.map((o) => (
            <div key={o.id} className="p-6" style={{ backgroundColor: C.cream, borderTop: `2px solid ${C.gold}` }}>
              <o.icon size={26} style={{ color: C.goldDeep }} />
              <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500, marginTop: 14 }}>
                {o.title}
              </h4>
              <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.86rem", marginTop: 6, lineHeight: 1.6 }}>
                {o.note}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      {/* How it works */}
      <PageSection
        eyebrow="How it works"
        title="From your hand"
        italic="to theirs."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {[
            { n: "01", title: "Choose a suite + bundle", note: "Pick the suite type and the night tier. Discount applies automatically — bigger bundles save more." },
            { n: "02", title: "Submit your request",     note: "Submit the request with your LS Privilege email. Our reservations team confirms pricing and emails the payment options available to you." },
            { n: "03", title: "Pay & receive code",      note: "Pay via Benefit Pay, bank transfer or in person at the front desk. Once payment lands the code is issued and visible in your LS Privilege portal." },
            { n: "04", title: "Recipient redeems",       note: "Send the code from your portal; the recipient enters it during booking and prepaid nights apply automatically against the suite type." },
          ].map((s) => (
            <div key={s.n} className="p-7" style={{ backgroundColor: C.paper }}>
              <div style={{ color: C.goldDeep, fontFamily: "'Cormorant Garamond', serif", fontSize: "2.4rem", fontWeight: 400, fontStyle: "italic", lineHeight: 1 }}>
                {s.n}
              </div>
              <h4 style={{ fontFamily: "'Manrope', sans-serif", color: C.bgDeep, fontSize: "0.86rem", fontWeight: 700, letterSpacing: "0.04em", marginTop: 14 }}>
                {s.title}
              </h4>
              <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.82rem", marginTop: 6, lineHeight: 1.6 }}>
                {s.note}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      {/* Trust strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)", marginBottom: "4rem" }}>
        {[
          { icon: ShieldCheck, title: "Twelve-month validity", note: "Always extendable when life intervenes." },
          { icon: Utensils,    title: "Suite-type specific",   note: "Card redeems against the suite the buyer picked. Partial use kept on file." },
          { icon: Mail,        title: "Personally delivered",  note: "Hand-finished message inserts; no auto-generated emails." },
        ].map((t, i) => (
          <div key={i} className="p-7 flex items-start gap-4" style={{ backgroundColor: C.paper }}>
            <t.icon size={22} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 4 }} />
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem", color: C.bgDeep, fontWeight: 500 }}>
                {t.title}
              </div>
              <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.82rem", marginTop: 4, lineHeight: 1.5 }}>
                {t.note}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAQs */}
      <PageSection eyebrow="FAQs" title="A few" italic="questions." narrow>
        <div>
          {FAQS.map((f, i) => (
            <div key={f.id} style={{
              borderTop: i === 0 ? "1px solid rgba(0,0,0,0.1)" : "none",
              borderBottom: "1px solid rgba(0,0,0,0.1)", padding: "1.5rem 0",
            }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem", color: C.bgDeep, fontWeight: 500 }}>
                {f.q}
              </div>
              <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.95rem", lineHeight: 1.75, marginTop: 6 }}>
                {f.a}
              </div>
            </div>
          ))}
        </div>
      </PageSection>
    </EditorialPage>
  );
};

// Small reusable form bits used inside the composer.
const inputStyle = {
  backgroundColor: "transparent", color: C.bgDeep,
  border: "1px solid rgba(21,22,26,0.2)",
  padding: "0.7rem 0.9rem", width: "100%",
  fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem",
  outline: "none",
};

// MemberLookupChip — shows the resolved member when the entered email
// matches the LS Privilege directory, or a friendly "not a member yet"
// state with a join CTA when the email doesn't match (and is otherwise
// well-formed). Empty / mid-typing emails render nothing so the form
// doesn't nag before the user has finished entering the address.
function MemberLookupChip({ member, email, role, onJoin }) {
  const trimmed = (email || "").trim();
  const looksLikeEmail = /.+@.+\..+/.test(trimmed);
  if (!trimmed) return null;
  if (!looksLikeEmail) {
    return (
      <div className="mt-2 p-2" style={{ backgroundColor: "rgba(154,58,48,0.08)", border: "1px solid rgba(154,58,48,0.3)", color: "#7A2F26", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.5 }}>
        Enter a valid email to look up the LS Privilege member.
      </div>
    );
  }
  if (member) {
    const tierLabel = (member.tier || "silver").charAt(0).toUpperCase() + (member.tier || "silver").slice(1);
    return (
      <div className="mt-2 p-3 flex items-start gap-3" style={{ backgroundColor: "rgba(127,169,112,0.10)", border: "1px solid rgba(127,169,112,0.45)" }}>
        <span style={{
          width: 32, height: 32, flexShrink: 0,
          borderRadius: "50%", backgroundColor: "rgba(127,169,112,0.18)",
          border: "1px solid rgba(127,169,112,0.55)",
          color: "#2E6B3E", display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: "0.86rem",
        }}>
          {(member.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: C.bgDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", fontWeight: 600 }}>
              {role === "buyer" ? "You are " : "Recipient: "}{member.name}
            </span>
            <span style={{
              color: C.goldDeep, backgroundColor: "rgba(201,169,97,0.15)", border: "1px solid rgba(201,169,97,0.45)",
              padding: "1px 6px", fontSize: "0.56rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}>{tierLabel}</span>
          </div>
          <div style={{ color: C.textDim, fontSize: "0.72rem", marginTop: 2, fontFamily: "'Manrope', sans-serif" }}>
            {Number(member.points || 0).toLocaleString()} pts · {member.lifetimeNights || 0} lifetime nights
          </div>
        </div>
      </div>
    );
  }
  // Email is well-formed but no match in the directory.
  return (
    <div className="mt-2 p-3" style={{ backgroundColor: "rgba(184,133,46,0.10)", border: "1px solid rgba(184,133,46,0.45)" }}>
      <div style={{ color: "#9A6B1E", fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        Not a member yet
      </div>
      <div style={{ color: C.bgDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", marginTop: 4, lineHeight: 1.55 }}>
        {role === "buyer"
          ? <>This email isn't on our LS Privilege register. <button onClick={onJoin} style={{ background: "transparent", border: "none", color: C.goldDeep, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>Join LS Privilege</button> (it's free) to issue your first gift card.</>
          : <>The recipient isn't on our LS Privilege register yet. Ask them to <button onClick={onJoin} style={{ background: "transparent", border: "none", color: C.goldDeep, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>join LS Privilege</button> first — it takes 30 seconds — and then re-enter their email here.</>
        }
      </div>
    </div>
  );
}

function PaperField({ label, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <label style={{
        display: "block", marginBottom: 6,
        color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
        fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
      }}>{label}</label>
      {children}
    </div>
  );
}
