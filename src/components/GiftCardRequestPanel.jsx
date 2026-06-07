import React, { useMemo, useState } from "react";
import { Gift, BedDouble, Sparkles, Check } from "lucide-react";
import {
  computeGiftCardPrice, formatCurrency, useData,
} from "../data/store.jsx";
import { roomLabel, sortRoomsByPrice } from "../lib/rooms.js";
import { useT } from "../i18n/LanguageContext.jsx";

// GiftCardRequestPanel — drop-in "request a gift card" card for the three
// guest portals (member / corporate / agent). Matches the public
// GiftVouchersModal's request flow but compressed into a single panel that
// lives at the top of each portal's Gift cards / Statement tab.
//
// Flow (no payment captured here — same as the public request flow):
//   1. Buyer picks a suite + a tier (nights / discount).
//   2. (Optional) Recipient name / email / phone / personal message.
//   3. Submit → addGiftCard({ ..., status: "requested" }) → admin sees it
//      under Gift Cards, processes payment offline, flips to "issued".
//
// Props:
//   palette       — palette object from the portal (usePalette() result)
//   buyer         — { id, name, email } of the signed-in account (the buyer
//                    side of the request — required so the admin knows who
//                    to invoice)
//   buyerKind     — "member" | "corporate" | "agent" (purely informational,
//                    stamped onto the card request for admin filtering)
//   onSubmitted   — optional callback(savedCardObject) for parent toasts.
//
// The panel is self-contained: it owns its tier/room/recipient state and
// renders a thanks/confirmation state after submit. Parent does not need to
// manage anything.
export function GiftCardRequestPanel({ palette: p, buyer, buyerKind = "member", onSubmitted }) {
  const t = useT();
  const { rooms, giftCardTiers, addGiftCard, hotelInfo } = useData();

  // Cheapest active suite first — same default as the public modal.
  const activeRooms = useMemo(
    () => sortRoomsByPrice((rooms || []).filter((r) => r.isActive !== false)),
    [rooms]
  );
  const activeTiers = useMemo(
    () => (giftCardTiers || []).filter((tt) => tt.active !== false),
    [giftCardTiers]
  );

  // Buyer defaults — buyer is the buyer; recipient starts as buyer (a member
  // buying for themself, which is the common case for corporate/agent gifts
  // too). They can override the recipient.
  const [roomId, setRoomId] = useState(activeRooms[1]?.id || activeRooms[0]?.id || "");
  const [tierId, setTierId] = useState(activeTiers[1]?.id || activeTiers[0]?.id || "");
  const [recipientName, setRecipientName] = useState(buyer?.name || "");
  const [recipientEmail, setRecipientEmail] = useState(buyer?.email || "");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedCard, setSubmittedCard] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const room = activeRooms.find((r) => r.id === roomId) || activeRooms[0];
  const tier = activeTiers.find((tt) => tt.id === tierId) || activeTiers[0];
  const ratePerNight = Number(room?.price || 0);
  const price = useMemo(
    () => tier ? computeGiftCardPrice({ nights: tier.nights, discountPct: tier.discountPct, ratePerNight }) : null,
    [tier, ratePerNight]
  );

  if (!activeTiers.length || !activeRooms.length) return null;

  const submit = async () => {
    if (!buyer?.id || !buyer?.email) {
      setError("We couldn't read your account — please sign out and back in.");
      return;
    }
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setError("Recipient name and email are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // status="requested" — admin processes payment offline, then issues.
      // No money is captured here; the request is just a record.
      const saved = addGiftCard({
        tierId: tier.id,
        roomId: room.id,
        totalNights: tier.nights,
        discountPct: tier.discountPct,
        ratePerNight,
        faceValue: price.gross,
        paidAmount: 0,
        status: "requested",
        // Recipient — defaults to the buyer; can be overridden.
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        recipientPhone: recipientPhone.trim() || null,
        // Buyer — for the admin to know who to invoice.
        senderMemberId: buyerKind === "member" ? buyer.id : null,
        senderAccountId: buyerKind !== "member" ? buyer.id : null,
        senderAccountKind: buyerKind,
        senderName: buyer.name || "",
        senderEmail: buyer.email || "",
        // Member portal sees its own cards via senderMemberId/recipientMemberId;
        // mirror member buyers so the request shows up immediately in their tab.
        recipientMemberId: buyerKind === "member" ? buyer.id : null,
        message: message.trim() || "",
        delivery: "email",
        deliverOn: null,
        requestedAmount: price.net,
      });
      setSubmittedCard(saved || null);
      onSubmitted?.(saved);
    } catch (e) {
      setError(e?.message || "Couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Confirmation state ──────────────────────────────────────────────────
  if (submittedCard) {
    return (
      <div className="p-5 mb-6" style={{
        backgroundColor: `${p.success || p.accent}10`,
        border: `1px solid ${p.success || p.accent}55`,
        borderInlineStart: `4px solid ${p.success || p.accent}`,
      }}>
        <div className="flex items-start gap-3">
          <Check size={18} style={{ color: p.success || p.accent, marginTop: 2 }} />
          <div className="flex-1">
            <div style={{ color: p.success || p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
              Request received
            </div>
            <p style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", lineHeight: 1.55, margin: "0 0 8px" }}>
              Your gift card request <strong style={{ fontFamily: "monospace" }}>{submittedCard.code}</strong> is logged. Our team will reach out via email about payment (Benefit Pay, bank transfer, or in person). The card becomes redeemable in your portal once payment is confirmed.
            </p>
            <button
              type="button"
              onClick={() => { setSubmittedCard(null); setShowForm(false); setMessage(""); setRecipientPhone(""); }}
              style={{ color: p.accent, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "0.78rem" }}
            >Request another →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Collapsed CTA (default) ─────────────────────────────────────────────
  if (!showForm) {
    return (
      <div className="p-5 mb-6" style={{
        background: `linear-gradient(135deg, ${p.accent}14, ${p.accent}04)`,
        border: `1px solid ${p.accent}55`,
        borderInlineStart: `4px solid ${p.accent}`,
      }}>
        <div className="flex items-start gap-3 flex-wrap" style={{ rowGap: 12 }}>
          <Gift size={20} style={{ color: p.accent, marginTop: 2 }} />
          <div className="flex-1" style={{ minWidth: 220 }}>
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
              Request a gift card
            </div>
            <p style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", lineHeight: 1.55, margin: 0 }}>
              Send a nights-based gift to a friend, family member{buyerKind === "corporate" ? ", or staff member" : buyerKind === "agent" ? ", or partner" : ""}. Choose a suite type and a tier — the front office processes payment with you, then we issue the certificate to {buyerKind === "member" ? "your portal" : "your account"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              backgroundColor: p.accent,
              color: p.theme === "light" ? "#FFFFFF" : "#15161A",
              border: `1px solid ${p.accent}`,
              padding: "0.7rem 1.2rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", fontWeight: 700,
              letterSpacing: "0.22em", textTransform: "uppercase",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          >Start a request →</button>
        </div>
      </div>
    );
  }

  // ── Expanded form ───────────────────────────────────────────────────────
  return (
    <div className="p-5 mb-6" style={{
      backgroundColor: p.bgPanel,
      border: `1px solid ${p.border}`,
      borderInlineStart: `4px solid ${p.accent}`,
    }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Request a gift card
          </div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 2 }}>
            No payment taken here — we'll email you about payment options.
          </div>
        </div>
        <button type="button" onClick={() => setShowForm(false)}
          style={{ color: p.textMuted, background: "none", border: "none", cursor: "pointer", fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}
        >Cancel</button>
      </div>

      {/* Suite picker */}
      <div className="mb-4">
        <FieldLabel p={p}>Suite type</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activeRooms.map((r) => {
            const active = r.id === roomId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoomId(r.id)}
                className="text-start"
                style={{
                  padding: "0.7rem 0.9rem",
                  border: `1px solid ${active ? p.accent : p.border}`,
                  backgroundColor: active ? `${p.accent}10` : p.inputBg,
                  color: p.textPrimary,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "'Manrope', sans-serif",
                }}
              >
                <BedDouble size={14} style={{ color: active ? p.accent : p.textMuted }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.86rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roomLabel(r, t)}</div>
                  <div style={{ fontSize: "0.7rem", color: p.textMuted, marginTop: 2 }}>Rack {formatCurrency(r.price, hotelInfo)} / night</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tier picker */}
      <div className="mb-4">
        <FieldLabel p={p}>Gift tier</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activeTiers.map((tt) => {
            const active = tt.id === tierId;
            const tp = computeGiftCardPrice({ nights: tt.nights, discountPct: tt.discountPct, ratePerNight });
            return (
              <button
                key={tt.id}
                type="button"
                onClick={() => setTierId(tt.id)}
                className="text-start"
                style={{
                  padding: "0.7rem 0.9rem",
                  border: `1px solid ${active ? p.accent : p.border}`,
                  backgroundColor: active ? `${p.accent}10` : p.inputBg,
                  color: p.textPrimary,
                  cursor: "pointer",
                  fontFamily: "'Manrope', sans-serif",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: active ? p.accent : p.textPrimary }}>{tt.label}</div>
                  <div style={{ fontSize: "0.66rem", fontWeight: 700, color: p.accent, letterSpacing: "0.06em" }}>− {tt.discountPct}%</div>
                </div>
                <div style={{ fontSize: "0.72rem", color: p.textMuted, marginBottom: 4 }}>{tt.nights} nights · {tt.hint}</div>
                <div style={{ fontSize: "0.74rem", color: p.textMuted }}>
                  Rack <span style={{ textDecoration: "line-through" }}>{formatCurrency(tp.gross, hotelInfo)}</span> →&nbsp;
                  <span style={{ color: p.textPrimary, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(tp.net, hotelInfo)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recipient */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <FieldLabel p={p}>Recipient name *</FieldLabel>
          <Input p={p} value={recipientName} onChange={setRecipientName} placeholder="Full name" />
        </div>
        <div>
          <FieldLabel p={p}>Recipient email *</FieldLabel>
          <Input p={p} value={recipientEmail} onChange={setRecipientEmail} placeholder="name@example.com" type="email" />
        </div>
        <div>
          <FieldLabel p={p}>Recipient phone</FieldLabel>
          <Input p={p} value={recipientPhone} onChange={setRecipientPhone} placeholder="+973 …" type="tel" />
        </div>
        <div>
          <FieldLabel p={p}>Personal message</FieldLabel>
          <Input p={p} value={message} onChange={setMessage} placeholder="Optional — printed on the certificate" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 mb-3" style={{
          backgroundColor: `${p.danger}10`, border: `1px solid ${p.danger}40`,
          color: p.danger, fontSize: "0.84rem",
        }}>{error}</div>
      )}

      {/* Summary + submit */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ rowGap: 12 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textMuted }}>
          {tier && room && (
            <>
              {tier.nights} nights at the {roomLabel(room, t)} ·&nbsp;
              <span style={{ color: p.textPrimary, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(price?.net || 0, hotelInfo)}</span>
              <Sparkles size={11} style={{ display: "inline", color: p.accent, marginInlineStart: 6, verticalAlign: "middle" }} />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            backgroundColor: p.accent,
            color: p.theme === "light" ? "#FFFFFF" : "#15161A",
            border: `1px solid ${p.accent}`,
            padding: "0.8rem 1.4rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", fontWeight: 700,
            letterSpacing: "0.22em", textTransform: "uppercase",
            cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1,
          }}
        >{submitting ? "Submitting…" : "Submit request →"}</button>
      </div>
    </div>
  );
}

// Local mini-primitives so the panel is fully self-contained (each portal has
// its own primitives library — by using locals we avoid coupling).
function FieldLabel({ p, children }) {
  return (
    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Input({ p, value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full outline-none"
      style={{
        backgroundColor: p.inputBg, color: p.textPrimary,
        border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
      }}
    />
  );
}
