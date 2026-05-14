import React, { useMemo, useState } from "react";
import {
  Banknote, BedDouble, Calendar, Check, Coffee, Copy, CreditCard, Gift,
  Heart, Loader2, Lock, Mail, Send, ShieldCheck, Smartphone, Sparkles,
  Star, Users, Utensils, Wallet,
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
//
// Card and Apple Pay simulate a 1.4s gateway round-trip (no card
// number is captured on our DOM — in production this would redirect
// to Stripe Checkout / Apple Pay sheet). Benefit Pay and Bank transfer
// just record the picked method + a reference / note the buyer can
// hand back to accounts if there's a query.
const PAYMENT_METHODS = [
  { key: "card",        label: "Credit or debit card", icon: CreditCard, blurb: "Visa / Mastercard / Amex. Charged through our secure payment gateway — your card details never touch our server.", processed: true, feePct: 2.5 },
  { key: "apple-pay",   label: "Apple Pay",            icon: Wallet,     blurb: "Confirm with Face ID or Touch ID on this device. Works wherever Apple Pay is supported.", processed: true, feePct: 2.5 },
  { key: "benefit-pay", label: "Benefit Pay",          icon: Smartphone, blurb: "Bahrain's national mobile-payment system. You'll be redirected to your bank's app to authorise.", processed: true, feePct: 0.5 },
  { key: "transfer",    label: "Bank transfer",        icon: Banknote,   blurb: "We email you the IBAN + amount. Card is issued the moment funds clear (usually next working day).", processed: false, feePct: 0 },
];

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

export const GiftVouchersModal = ({ open, onClose, onBook }) => {
  const { rooms, hotelInfo, issueGiftCard, members, giftCardTiers } = useData();
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
  const [delivery, setDelivery] = useState("email");
  // Email-only model: gift cards are member-only, so both sender and
  // recipient resolve to LS Privilege members by email. The buyer
  // (sender) supplies their own email so we can identify their member
  // record; the recipient's email is checked against the directory and
  // a friendly "not a member yet — invite them" hint shows when no
  // match exists.
  const [buyerEmail,     setBuyerEmail]     = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [deliverOn,      setDeliverOn]      = useState("");
  const [message,        setMessage]        = useState("");
  // Payment method + buyer-facing payment metadata. `cardName` is the
  // only field we capture for card methods — full card numbers go
  // through the gateway, never our DOM. `transferRef` is a free-text
  // reference the buyer can use when wiring the bank transfer so
  // accounting can match the inbound payment to this card.
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [cardName,      setCardName]      = useState("");
  const [transferRef,   setTransferRef]   = useState("");
  // `processing` drives the "Pay X · BHD …" → spinner state during the
  // simulated gateway round-trip. Set false once issueGiftCard returns.
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
  const recipientMember = useMemo(() => {
    const e = (recipientEmail || "").trim().toLowerCase();
    if (!e) return null;
    return (members || []).find((m) => (m.email || "").toLowerCase() === e) || null;
  }, [recipientEmail, members]);
  const sameMember = buyerMember && recipientMember && buyerMember.id === recipientMember.id;

  // Active payment method record. Falls back to the first method if the
  // picked key was removed from the catalogue (defensive).
  const paymentMeta = useMemo(
    () => PAYMENT_METHODS.find((m) => m.key === paymentMethod) || PAYMENT_METHODS[0],
    [paymentMethod]
  );
  // Card and Apple Pay require the cardholder name. Bank transfer
  // requires a non-empty reference so accounts can match the wire.
  // Benefit Pay needs nothing extra — the bank app collects auth.
  const paymentReady = useMemo(() => {
    if (paymentMethod === "card" || paymentMethod === "apple-pay") return cardName.trim().length >= 2;
    if (paymentMethod === "transfer") return transferRef.trim().length >= 3;
    return true;
  }, [paymentMethod, cardName, transferRef]);

  const canSubmit = !!buyerMember
    && !!recipientMember
    && !sameMember
    && paymentReady
    && !processing;

  const handleSubmit = async () => {
    if (!buyerMember) { pushToast({ message: "Enter your LS Privilege email to continue.", kind: "warn" }); return; }
    if (!recipientMember) { pushToast({ message: "Recipient must be a LS Privilege member.", kind: "warn" }); return; }
    if (sameMember) { pushToast({ message: "Pick a different recipient — you can't gift to yourself.", kind: "warn" }); return; }
    if (paymentMethod === "card" && cardName.trim().length < 2) {
      pushToast({ message: "Enter the name on your card to continue.", kind: "warn" }); return;
    }
    if (paymentMethod === "apple-pay" && cardName.trim().length < 2) {
      pushToast({ message: "Enter the Apple Pay account name to continue.", kind: "warn" }); return;
    }
    if (paymentMethod === "transfer" && transferRef.trim().length < 3) {
      pushToast({ message: "Pick a short reference so we can match your wire.", kind: "warn" }); return;
    }

    // Mocked gateway round-trip — in production this is where the
    // Stripe / Apple Pay / Benefit Pay sheet pops, the user confirms,
    // and we get back an authorisation id. For now we simulate the
    // delay so the buyer sees the "processing" state and the operator
    // gets a realistic timing for UX testing.
    setProcessing(true);
    try {
      if (paymentMeta.processed) {
        await new Promise((resolve) => setTimeout(resolve, 1400));
      }

      // Compose a human-readable note for the payment receipt so
      // accounts can see at a glance how the buyer paid. The note
      // shows up on the receipt PDF and on the Payments admin row.
      const noteParts = [];
      if (paymentMethod === "card")        noteParts.push(`Card · ${cardName.trim()}`);
      if (paymentMethod === "apple-pay")   noteParts.push(`Apple Pay · ${cardName.trim()}`);
      if (paymentMethod === "benefit-pay") noteParts.push("Benefit Pay · mobile auth");
      if (paymentMethod === "transfer")    noteParts.push(`Bank transfer · ref ${transferRef.trim()}`);

      const saved = issueGiftCard({
        tierId: tier.id,
        roomId: room.id,
        totalNights: tier.nights,
        discountPct: tier.discountPct,
        ratePerNight,
        faceValue: price.gross,
        // Bank transfer is "pending settlement" but we still record
        // the same paid amount — the operator switches the card from
        // "pending" → "issued" once the wire clears. For the four
        // card-style methods the funds are captured straight away.
        paidAmount: price.net,
        recipientMemberId: recipientMember.id,
        recipientName:     recipientMember.name,
        recipientEmail:    recipientMember.email,
        senderMemberId:    buyerMember.id,
        senderName:        buyerMember.name,
        senderEmail:       buyerMember.email,
        message:        message.trim(),
        delivery,
        deliverOn: deliverOn || null,
        // Surface the method on the card itself too — the admin
        // detail drawer reads it for the "Paid via" chip even before
        // the operator opens the linked receipt.
        paymentMethod,
        paymentNote:  noteParts.join(" · "),
      }, { paymentMethod });

      // Stash the same payment metadata on the issued payload so the
      // success panel can confirm "Paid via …" without re-querying.
      setIssued(saved ? { ...saved, paymentMethod, paymentNote: noteParts.join(" · ") } : saved);
      pushToast({
        message: paymentMethod === "transfer"
          ? `Gift card ${saved?.code} reserved — we'll email the IBAN.`
          : `Payment confirmed · gift card ${saved?.code} issued.`,
      });
    } finally {
      setProcessing(false);
    }
  };

  // Reset + close — used by the "Done" button in the issued panel.
  const closeAfterIssue = () => {
    setIssued(null);
    setBuyerEmail("");
    setRecipientEmail("");
    setDeliverOn("");
    setMessage("");
    setPaymentMethod("card");
    setCardName("");
    setTransferRef("");
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
      {/* Issued-code success panel — replaces the composer once a card
          has been issued so the buyer can copy the code to share. Also
          confirms the payment method + reference so the buyer leaves
          with a clear "paid via …" trail. */}
      {issued && (() => {
        const issuedMethodMeta = PAYMENT_METHODS.find((m) => m.key === issued.paymentMethod) || PAYMENT_METHODS[0];
        const IssuedIc = issuedMethodMeta.icon;
        const pendingTransfer = issued.paymentMethod === "transfer";
        return (
          <div className="p-7 mb-12" style={{
            backgroundColor: C.bgDeep, color: C.cream,
            border: `1px solid ${C.gold}`,
          }}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
                  {pendingTransfer ? "Gift card reserved" : "Gift card issued"}
                </div>
                <div className="mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2.1rem", lineHeight: 1.1 }}>
                  {issued.totalNights} nights for {issued.recipientName}
                </div>
                <div className="mt-1" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
                  {pendingTransfer
                    ? "We've emailed you the IBAN — the card activates the moment your transfer clears (usually next working day). The code below is locked in for the recipient now."
                    : "Save this code — the recipient enters it during booking to redeem the prepaid nights."}
                </div>
                <div className="mt-4 inline-flex items-center gap-3 px-4 py-3" style={{ backgroundColor: "rgba(201,169,97,0.12)", border: `1px solid ${C.gold}` }}>
                  <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "1rem", color: C.cream, letterSpacing: "0.08em" }}>{issued.code}</code>
                  <button
                    onClick={() => {
                      if (navigator.clipboard) navigator.clipboard.writeText(issued.code);
                      pushToast({ message: "Code copied to clipboard." });
                    }}
                    style={{
                      color: C.gold, padding: "0.3rem 0.7rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                      border: `1px solid ${C.gold}`, backgroundColor: "transparent", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  ><Copy size={11} /> Copy</button>
                </div>

                {/* Payment receipt strip */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ backgroundColor: "rgba(201,169,97,0.18)" }}>
                  <div className="p-3" style={{ backgroundColor: "rgba(15,16,20,0.4)" }}>
                    <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      Amount {pendingTransfer ? "due" : "charged"}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-2" style={{ color: C.cream, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 500 }}>
                      {formatCurrency(issued.paidAmount)}
                    </div>
                  </div>
                  <div className="p-3" style={{ backgroundColor: "rgba(15,16,20,0.4)" }}>
                    <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      Paid via
                    </div>
                    <div className="mt-1 inline-flex items-center gap-2" style={{ color: C.cream, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: 600 }}>
                      <IssuedIc size={13} style={{ color: C.gold }} /> {issuedMethodMeta.label}
                      {pendingTransfer && (
                        <span style={{ marginInlineStart: 6, color: "#E0B85E", fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", border: "1px solid #E0B85E" }}>Pending</span>
                      )}
                    </div>
                  </div>
                  <div className="p-3" style={{ backgroundColor: "rgba(15,16,20,0.4)" }}>
                    <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      Reference
                    </div>
                    <div className="mt-1" style={{ color: C.cream, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem" }}>
                      {issued.paymentNote || issued.code}
                    </div>
                  </div>
                </div>
                <div className="mt-3" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                  A receipt has been emailed to {issued.senderEmail || "you"}. The full invoice + payment receipt are filed in your LS Privilege account.
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
        );
      })()}

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
                  {r.id === "studio" ? "Lodge Studio"
                    : r.id === "one-bed" ? "One-Bedroom Suite"
                    : r.id === "two-bed" ? "Two-Bedroom Suite"
                    : r.id === "three-bed" ? "Three-Bedroom Suite" : r.id}
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

      {/* Composer — only when we haven't already issued a card */}
      {!issued && (
        <PageSection
          eyebrow="Step 3 · Compose"
          title="Send your"
          italic="gift."
          intro="Gift cards are member-to-member. Enter your LS Privilege email and the recipient's — we'll match them against the directory and issue the code instantly."
        >
          {/* Member-only callout — sets the expectation up front so the
              buyer doesn't fill out the form before realising the
              recipient needs an LS Privilege account. */}
          <div className="p-5 mb-px" style={{ backgroundColor: C.bgDeep, color: C.cream, borderLeft: `3px solid ${C.gold}` }}>
            <div className="flex items-start gap-3">
              <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                LS Privilege only
              </div>
              <div style={{ color: C.textDim, fontSize: "0.84rem", lineHeight: 1.55 }}>
                Both buyer and recipient must be LS Privilege members. The code applies prepaid nights against the recipient's member account on redemption — they need an account to receive it. <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.gold, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>Not a member yet? Join LS Privilege.</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
            {/* Buyer + recipient */}
            <div className="p-8" style={{ backgroundColor: C.cream }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
                You (buyer)
              </h3>
              <PaperField label="Your LS Privilege email">
                <input type="email" value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="you@example.com" style={inputStyle}
                />
              </PaperField>
              <MemberLookupChip member={buyerMember} email={buyerEmail} role="buyer" onJoin={onClose} />

              <h3 className="mt-6" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
                Recipient
              </h3>
              <PaperField label="Their LS Privilege email">
                <input type="email" value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com" style={inputStyle}
                />
              </PaperField>
              <MemberLookupChip member={recipientMember} email={recipientEmail} role="recipient" onJoin={onClose} />
              {sameMember && (
                <div className="mt-2 p-2" style={{ backgroundColor: "rgba(184,133,46,0.10)", border: "1px solid rgba(184,133,46,0.45)", color: "#9A6B1E", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.5 }}>
                  You can't gift to yourself — pick a different recipient.
                </div>
              )}
            </div>

            {/* Delivery + message */}
            <div className="p-8" style={{ backgroundColor: C.paper }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
                Delivery
              </h3>
              <PaperField label="Format">
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: "email", label: "Email PDF" },
                    { id: "print", label: "Printed certificate" },
                  ].map((d) => {
                    const sel = delivery === d.id;
                    return (
                      <button key={d.id}
                        onClick={() => setDelivery(d.id)}
                        style={{
                          padding: "0.55rem 1rem",
                          backgroundColor: sel ? C.bgDeep : "transparent",
                          color: sel ? C.gold : C.bgDeep,
                          border: `1px solid ${sel ? C.gold : "rgba(21,22,26,0.2)"}`,
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                          letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >{d.label}</button>
                    );
                  })}
                </div>
              </PaperField>
              <PaperField label="Deliver on (optional)">
                <input type="date" value={deliverOn}
                  onChange={(e) => setDeliverOn(e.target.value)}
                  style={inputStyle}
                />
              </PaperField>
              <PaperField label="Personal message">
                <textarea value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="A line or two — handwritten on the printed certificate, or shown above the PDF."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </PaperField>
            </div>
          </div>

        </PageSection>
      )}

      {/* Step 4 · Payment + submit. Lives outside the Step 3 PageSection
          so the buyer reads it as a distinct stage — pick a method,
          confirm the totals, pay. The CTA in the summary bar runs the
          (mocked) gateway round-trip then calls issueGiftCard. */}
      {!issued && (
        <PageSection
          eyebrow="Step 4 · Payment"
          title="How would you like"
          italic="to pay?"
          intro="Pick a payment method. Cards and Apple Pay charge instantly through our secure gateway — your card details never touch our server. Benefit Pay redirects to your bank app; bank transfers reserve the card and issue once funds clear."
        >
          {/* Method picker — radio-style cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
            {PAYMENT_METHODS.map((m) => {
              const sel = paymentMethod === m.key;
              const Icon = m.icon;
              return (
                <button key={m.key}
                  onClick={() => setPaymentMethod(m.key)}
                  className="text-start p-6 transition-colors"
                  style={{
                    backgroundColor: sel ? C.cream : C.paper,
                    borderLeft: sel ? `3px solid ${C.gold}` : "3px solid transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.cream; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.paper; }}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={22} style={{ color: C.goldDeep, flexShrink: 0 }} />
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.1 }}>
                      {m.label}
                    </div>
                  </div>
                  <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem", marginTop: 10, lineHeight: 1.55 }}>
                    {m.blurb}
                  </div>
                  {sel && (
                    <div className="mt-3 inline-flex items-center gap-1" style={{
                      color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                    }}>
                      <Check size={11} /> Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Method-specific capture — kept deliberately minimal. For
              card and Apple Pay we only ask for the cardholder name
              (the real flow redirects to the gateway). For Benefit Pay
              nothing extra is needed. For bank transfer we capture a
              short reference and surface the hotel's IBAN. */}
          <div className="mt-px p-7" style={{ backgroundColor: C.cream }}>
            {(paymentMethod === "card" || paymentMethod === "apple-pay") && (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <Lock size={14} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.5 }}>
                    Secure payment via our gateway. Card number, expiry and CVV are entered on the gateway's hosted page, not here — we never see or store them. You'll be returned to this page once authorised.
                  </div>
                </div>
                <PaperField label={paymentMethod === "card" ? "Name on card" : "Apple Pay account name"}>
                  <input type="text" value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder={paymentMethod === "card" ? "As printed on the card" : "Your Apple Pay account name"}
                    autoComplete="cc-name"
                    style={inputStyle}
                  />
                </PaperField>
                {/* Processing fee disclosure — keeps the buyer informed. */}
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-2" style={{ backgroundColor: "rgba(201,169,97,0.10)", border: `1px solid rgba(201,169,97,0.35)` }}>
                  <CreditCard size={12} style={{ color: C.goldDeep, flexShrink: 0 }} />
                  <span style={{ color: C.bgDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                    {paymentMeta.feePct}% processing fee absorbed by the property — the amount charged to your card is exactly <strong>{formatCurrency(price.net)}</strong>.
                  </span>
                </div>
              </>
            )}

            {paymentMethod === "benefit-pay" && (
              <div className="flex items-start gap-3">
                <Smartphone size={20} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.1 }}>
                    You'll be handed over to Benefit Pay.
                  </div>
                  <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.6, marginTop: 6 }}>
                    Tap "Pay" below and you'll be redirected to your bank's mobile app to authorise the {formatCurrency(price.net)} payment. Once approved you'll be brought back here with your gift card code.
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === "transfer" && (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <Banknote size={20} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.1 }}>
                      We'll email you the IBAN.
                    </div>
                    <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.6, marginTop: 6 }}>
                      Tap "Reserve & email IBAN" and we'll send you the bank details + your reference number. The card is held for you and activates the moment funds clear (typically next working day).
                    </div>
                    {hotelInfo?.iban && (
                      <div className="mt-3 inline-flex items-center gap-2 px-3 py-2" style={{ backgroundColor: "rgba(0,0,0,0.04)", border: `1px solid rgba(0,0,0,0.08)` }}>
                        <span style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>IBAN</span>
                        <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem", color: C.bgDeep, letterSpacing: "0.04em" }}>{hotelInfo.iban}</code>
                      </div>
                    )}
                  </div>
                </div>
                <PaperField label="Your reference (so we can match your wire)">
                  <input type="text" value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    placeholder={`e.g. ${(buyerMember?.name || "GIFT").split(" ")[0].toUpperCase()}-${tier.nights}N`}
                    style={inputStyle}
                  />
                </PaperField>
              </>
            )}
          </div>

          {/* Summary + submit bar */}
          <div className="mt-px p-6 flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: C.bgDeep, color: C.cream }}>
            <div>
              <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Your purchase
              </div>
              <div className="mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontStyle: "italic", lineHeight: 1.1 }}>
                {tier.nights} nights at the {
                  room?.id === "studio" ? "Lodge Studio"
                  : room?.id === "one-bed" ? "One-Bedroom Suite"
                  : room?.id === "two-bed" ? "Two-Bedroom Suite"
                  : room?.id === "three-bed" ? "Three-Bedroom Suite" : room?.id
                } · save {tier.discountPct}%
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
              <div className="mt-2 inline-flex items-center gap-2" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                {(() => { const Ic = paymentMeta.icon; return <Ic size={11} style={{ color: C.gold }} />; })()}
                Paying via <strong style={{ color: C.cream }}>{paymentMeta.label}</strong>
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
                <>
                  <Loader2 size={13} style={{ animation: "spin 0.9s linear infinite" }} />
                  {paymentMethod === "card"         ? "Charging your card…"
                    : paymentMethod === "apple-pay"   ? "Confirming with Apple Pay…"
                    : paymentMethod === "benefit-pay" ? "Connecting to Benefit Pay…"
                    : "Reserving your card…"}
                </>
              ) : (
                <>
                  {paymentMethod === "transfer"
                    ? <><Banknote size={13} /> Reserve & email IBAN · {formatCurrency(price.net)}</>
                    : paymentMethod === "apple-pay"
                      ? <><Wallet size={13} /> Pay with Apple Pay · {formatCurrency(price.net)}</>
                      : paymentMethod === "benefit-pay"
                        ? <><Smartphone size={13} /> Pay with Benefit Pay · {formatCurrency(price.net)}</>
                        : <><CreditCard size={13} /> Pay with card · {formatCurrency(price.net)}</>
                  }
                </>
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
            { n: "02", title: "Compose the gift",        note: "Recipient details, delivery format, personal message — assembled in one panel." },
            { n: "03", title: "Code issued instantly",   note: "We generate a unique LS-GC-XXXX-XXXX code on submission. Share it however you like." },
            { n: "04", title: "Recipient redeems",       note: "They enter the code during booking; prepaid nights apply automatically against the suite type." },
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
