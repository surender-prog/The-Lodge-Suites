import React, { useState } from "react";
import {
  Calendar, Check, Coffee, Gift, Heart, Mail, Send, ShieldCheck,
  Sparkles, Star, Users, Utensils,
} from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG } from "../data/images.js";
import { EditorialPage, PageSection } from "./EditorialPage.jsx";
import { pushToast } from "./portal/admin/ui.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { formatCurrency } from "../data/store.jsx";

// ---------------------------------------------------------------------------
// Gift Vouchers — full editorial page that the Footer "Gift Vouchers" link
// opens. Curated denominations, common gifting occasions, a "send a voucher"
// composer (mocked client-side per CLAUDE.md), redemption/validity copy,
// and FAQs. Designed to feel like a luxury concierge purchase, not a retail
// gift card.
// ---------------------------------------------------------------------------

const DENOMINATIONS = [
  { value: 50,   label: "An overnight indulgence",   note: "A studio night-stay or in-suite dining for two." },
  { value: 150,  label: "A weekend in Juffair",      note: "Two-night studio with breakfast and late check-out." },
  { value: 300,  label: "The Lodge weekend",         note: "Two nights in a One-Bedroom Suite with breakfast." },
  { value: 500,  label: "A long weekend, in suite",  note: "Three nights in a Two-Bedroom Suite or four in a One-Bed." },
  { value: 1000, label: "A residency",                note: "A full week's stay or applied across an extended booking." },
  { value: null, label: "Custom amount",              note: "Choose any amount from 25 upwards in increments of 5." },
];

const OCCASIONS = [
  { id: "anniversary",  icon: Heart,    title: "Anniversaries",     note: "Two nights, breakfast served in suite, late check-out as standard." },
  { id: "birthdays",    icon: Sparkles, title: "Birthdays",         note: "Welcome amenity in the suite the moment they arrive." },
  { id: "thankyou",     icon: Star,     title: "A thank-you",       note: "For the colleague, client or family member who hosts everyone else." },
  { id: "honeymoon",    icon: Coffee,   title: "Honeymoons",        note: "Pair with our Romantic Escape package for an intimate first stay." },
  { id: "corporate",    icon: Users,    title: "Corporate gifting", note: "Bulk vouchers with custom message inserts for client appreciation programmes." },
  { id: "newhome",      icon: Gift,     title: "Welcome to Bahrain",note: "For relocations and onboarding — a soft landing in Juffair." },
];

const FAQS = [
  { id: "validity",  q: "How long is a voucher valid?",
    a: "Twelve months from the day of purchase. We're happy to extend on request when life intervenes — just let us know before the expiry date." },
  { id: "redeem",    q: "How does redemption work?",
    a: "Quote the voucher reference at booking — by phone, email or in-person. The amount is applied against the room charge or any in-house spend (dining, in-suite breakfast, laundry). Anything unused stays on the voucher for future visits." },
  { id: "transfer",  q: "Can I transfer or split a voucher?",
    a: "Vouchers are transferable as long as the original recipient hasn't redeemed them yet. They can be split across multiple bookings; we'll keep track of the remaining balance for you." },
  { id: "delivery",  q: "How is the voucher delivered?",
    a: "Either as a beautifully designed PDF emailed straight to the recipient on a date you choose, or as a printed certificate with a hand-written message — collected from reception or couriered within Bahrain." },
  { id: "refund",    q: "Are vouchers refundable?",
    a: "Vouchers are non-refundable but never expire silently — we'll always reach out before the expiry date if there's still a balance on file." },
];

export const GiftVouchersModal = ({ open, onClose, onBook }) => {
  // "Send a voucher" composer state — mocked per CLAUDE.md, surfaces as a
  // toast on submit. When the production payment + email pipeline lands,
  // this hands off to a real cart.
  const t = useT();
  const ccy = t("common.bhd");
  const [amount, setAmount] = useState(150);
  const [custom, setCustom] = useState("");
  const [delivery, setDelivery] = useState("email");
  const [recipient, setRecipient] = useState({ name: "", email: "", date: "" });
  const [sender, setSender] = useState({ name: "", email: "" });
  const [message, setMessage] = useState("");

  const finalAmount = amount === null ? Number(custom) || 0 : amount;
  const canSubmit = finalAmount >= 25
    && recipient.name.trim()
    && (delivery === "print" || /.+@.+\..+/.test(recipient.email))
    && sender.name.trim()
    && /.+@.+\..+/.test(sender.email);

  const handleSubmit = () => {
    if (!canSubmit) {
      pushToast({ message: "Fill in voucher amount, recipient and your details to continue.", kind: "warn" });
      return;
    }
    pushToast({ message: `Voucher draft created · ${formatCurrency(finalAmount)} for ${recipient.name}. Our concierge will be in touch.` });
    onClose?.();
  };

  return (
    <EditorialPage
      open={open}
      onClose={onClose}
      eyebrow="Gift Vouchers"
      title="A stay,"
      italic="given as a gift."
      intro="Curated nights at The Lodge Suites, sent as a voucher in your name. Choose a denomination, write a personal note, and we'll deliver it on the day you choose — by email or as a hand-finished printed certificate."
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
      {/* Denominations */}
      <PageSection
        eyebrow="Denominations"
        title="Choose a"
        italic="value."
        intro={`Six curated denominations, each calibrated to a specific kind of stay. Or pick your own amount — vouchers from ${ccy} 25 upwards, in increments of 5.`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {DENOMINATIONS.map((d) => {
            const sel = (d.value === null && amount === null) || (d.value != null && amount === d.value);
            return (
              <button key={d.label}
                onClick={() => setAmount(d.value)}
                className="text-start p-7 transition-colors"
                style={{
                  backgroundColor: sel ? C.cream : C.paper,
                  borderLeft: sel ? `3px solid ${C.gold}` : "3px solid transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.cream; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.backgroundColor = C.paper; }}
              >
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "2rem", color: C.bgDeep, fontWeight: 400, lineHeight: 1.05,
                }}>
                  {d.value === null ? <span style={{ fontStyle: "italic", color: C.goldDeep }}>Custom</span> : <>{ccy} {d.value}</>}
                </div>
                <div style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginTop: 10 }}>
                  {d.label}
                </div>
                <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginTop: 8 }}>
                  {d.note}
                </div>
              </button>
            );
          })}
        </div>
      </PageSection>

      {/* Composer */}
      <PageSection
        eyebrow="Send a voucher"
        title="Compose your"
        italic="gift."
        intro="Tell us who it's for and when to deliver it. Our concierge will follow up to confirm payment and the delivery format before anything is sent."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {/* Voucher details */}
          <div className="p-8" style={{ backgroundColor: C.cream }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
              Voucher details
            </h3>

            {amount === null && (
              <PaperField label={`Custom amount (${ccy})`}>
                <input
                  type="number" min={25} step={5}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={`From ${ccy} 25`}
                  style={inputStyle}
                />
              </PaperField>
            )}

            <PaperField label="Delivery">
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
              <input type="date" value={recipient.date}
                onChange={(e) => setRecipient((r) => ({ ...r, date: e.target.value }))}
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

          {/* Recipient + sender */}
          <div className="p-8" style={{ backgroundColor: C.paper }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
              Recipient
            </h3>
            <PaperField label="Their full name">
              <input value={recipient.name}
                onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))}
                placeholder="Layla Al-Khalifa" style={inputStyle}
              />
            </PaperField>
            {delivery === "email" && (
              <PaperField label="Their email">
                <input type="email" value={recipient.email}
                  onChange={(e) => setRecipient((r) => ({ ...r, email: e.target.value }))}
                  placeholder="recipient@example.com" style={inputStyle}
                />
              </PaperField>
            )}

            <h3 className="mt-6" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
              From
            </h3>
            <PaperField label="Your name">
              <input value={sender.name}
                onChange={(e) => setSender((s) => ({ ...s, name: e.target.value }))}
                placeholder="Yusuf Al-Khalifa" style={inputStyle}
              />
            </PaperField>
            <PaperField label="Your email">
              <input type="email" value={sender.email}
                onChange={(e) => setSender((s) => ({ ...s, email: e.target.value }))}
                placeholder="you@example.com" style={inputStyle}
              />
            </PaperField>
          </div>
        </div>

        {/* Summary + submit */}
        <div className="mt-px p-6 flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: C.bgDeep, color: C.cream }}>
          <div>
            <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Voucher value
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.1rem", fontWeight: 400, lineHeight: 1.05, marginTop: 4 }}>
              {formatCurrency(finalAmount)}
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
            }}
            onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.backgroundColor = C.goldBright; }}
            onMouseLeave={(e) => { if (canSubmit) e.currentTarget.style.backgroundColor = C.gold; }}
          >
            <Send size={13} /> Send draft to concierge
          </button>
        </div>
      </PageSection>

      {/* Occasions */}
      <PageSection
        eyebrow="Made for"
        title="Every kind of"
        italic="moment."
        intro="A voucher works for the kind of gift where a present feels too small and a holiday feels too big."
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
            { n: "01", title: "Choose a value", note: "Pick from a curated denomination or set a custom amount." },
            { n: "02", title: "Compose the message", note: "Add a recipient, a delivery date, and a hand-finished note." },
            { n: "03", title: "We confirm",       note: "Concierge calls you to confirm payment and the delivery format." },
            { n: "04", title: "It arrives",       note: "On the day you chose — by email PDF or as a printed certificate." },
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
          { icon: Utensils,    title: "Use across the property", note: "Rooms, in-suite dining, breakfast, laundry, packages." },
          { icon: Mail,        title: "Personally delivered",   note: "Hand-finished message inserts; no auto-generated emails." },
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
