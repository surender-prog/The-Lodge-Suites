import React, { useMemo, useState } from "react";
import {
  ArrowRight, Award, Briefcase, Building2, Check, CheckCircle2, Clock,
  CreditCard, FileText, Mail, Phone, ShieldCheck, Sparkles, Trophy, Users,
} from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG } from "../data/images.js";
import { useData } from "../data/store.jsx";
import { EditorialPage, PageSection } from "./EditorialPage.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";

// ---------------------------------------------------------------------------
// RfpModal — public-facing "Submit an RFP" page. Lives as an editorial
// modal (per CLAUDE.md the site has no router) and feeds the operator's
// CRM by writing into the `rfps` store, so the same submission appears
// in Hotel Admin → Corporate → RFP pipeline within seconds. Promotes the
// four-tier volume programme above the form so prospects can self-qualify
// before they fill it out.
// ---------------------------------------------------------------------------

const VOLUME_TIERS = [
  {
    id: "bronze",
    label: "Bronze",
    icon: Briefcase,
    nights: "100+ nights / year",
    discount: "Up to 5% off rack",
    color: "#A0826A",
    perks: [
      "Negotiated daily rates",
      "Late check-out subject to availability",
      "Net-30 settlement available",
    ],
  },
  {
    id: "silver",
    label: "Silver",
    icon: Award,
    nights: "250+ nights / year",
    discount: "Up to 8% off rack",
    color: "#A8A8A8",
    perks: [
      "Bronze benefits",
      "Free upgrade subject to availability",
      "Quarterly business review",
      "Dedicated reservations contact",
    ],
  },
  {
    id: "gold",
    label: "Gold",
    icon: Trophy,
    nights: "500+ nights / year",
    discount: "Up to 12% off rack",
    color: C.gold,
    featured: true,
    perks: [
      "Silver benefits",
      "Complimentary daily breakfast",
      "Priority booking on peak dates",
      "Net-45 settlement",
      "Two complimentary nights / year",
    ],
  },
  {
    id: "platinum",
    label: "Platinum",
    icon: Sparkles,
    nights: "1,000+ nights / year",
    discount: "Up to 15% off rack",
    color: "#D4B97A",
    perks: [
      "Gold benefits",
      "Account manager assigned",
      "Bespoke welcome amenities",
      "Net-60 settlement",
      "Annual volume rebate",
    ],
  },
];

const STAY_TYPE_OPTIONS = [
  { value: "transient",  label: "Transient short stays (1–6 nights)" },
  { value: "long-stay",  label: "Long-stay rotations (7+ nights)" },
  { value: "mixed",      label: "Mixed transient + long-stay" },
  { value: "project",    label: "Project / event-based" },
];
const SUITE_PREFERENCES = [
  { value: "studio",     label: "Lodge Studio" },
  { value: "one-bed",    label: "One-Bedroom Suite" },
  { value: "two-bed",    label: "Two-Bedroom Suite" },
  { value: "three-bed",  label: "Three-Bedroom Suite" },
  { value: "mixed",      label: "Mix · operator's choice" },
];
const PAYMENT_TERM_OPTIONS = [
  { value: "Net 30", label: "Net 30" },
  { value: "Net 45", label: "Net 45" },
  { value: "Net 60", label: "Net 60" },
  { value: "On departure", label: "On departure / pre-paid" },
];

export const RfpModal = ({ open, onClose }) => {
  const { addRfp } = useData();
  const [draft, setDraft] = useState({
    account: "", industry: "",
    contactName: "", contactRole: "",
    contactEmail: "", contactPhone: "",
    roomNights: 100, suite: "mixed",
    stayType: "transient",
    eligibleFrom: "", eligibleTo: "",
    paymentTerms: "Net 30",
    inclusions: { breakfast: false, lateCheckOut: false, parking: false, wifi: true, meetingRoom: false },
    requirements: "",
  });
  const [submitted, setSubmitted] = useState(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setInclusion = (key, value) => set({ inclusions: { ...draft.inclusions, [key]: value } });

  // Estimate the indicative tier badge as the operator types — pure UX
  // hint, not a contractual commitment.
  const indicativeTier = useMemo(() => {
    const n = Number(draft.roomNights) || 0;
    if (n >= 1000) return VOLUME_TIERS[3];
    if (n >= 500)  return VOLUME_TIERS[2];
    if (n >= 250)  return VOLUME_TIERS[1];
    if (n >= 100)  return VOLUME_TIERS[0];
    return null;
  }, [draft.roomNights]);

  const valid = (
    draft.account.trim().length > 0 &&
    draft.contactName.trim().length > 0 &&
    /.+@.+\..+/.test(draft.contactEmail) &&
    Number(draft.roomNights) > 0
  );

  const submit = () => {
    if (!valid) return;
    const saved = addRfp({
      account: draft.account.trim(),
      industry: draft.industry.trim() || "—",
      status: "review",
      receivedOn: new Date().toISOString().slice(0, 10),
      dueDate: addDaysIso(2),
      contactName: draft.contactName.trim(),
      contactRole: draft.contactRole.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone.trim(),
      roomNights: Number(draft.roomNights) || 0,
      maxRate: 0,
      paymentTerms: draft.paymentTerms,
      eligibleFrom: draft.eligibleFrom || "",
      eligibleTo:   draft.eligibleTo   || "",
      inclusions: draft.inclusions,
      requirements: draft.requirements.trim(),
      notes: `Self-submitted via website on ${new Date().toLocaleDateString("en-GB")}.`,
      source: "website",
      stayType: draft.stayType,
      suitePreference: draft.suite,
      tierIndicative: indicativeTier?.id || "",
    });
    setSubmitted(saved);
  };

  const reset = () => {
    setSubmitted(null);
    setDraft((d) => ({
      ...d,
      account: "", industry: "", contactName: "", contactRole: "",
      contactEmail: "", contactPhone: "", requirements: "",
    }));
  };

  return (
    <EditorialPage
      open={open}
      onClose={onClose}
      eyebrow="Volume bookings · RFP"
      title="Run on contract,"
      italic="not on the credit card."
      intro="Submit a request for proposal and we'll come back inside 48 hours with a tailored rate sheet. Whether you book 100 nights a year or 10,000, we structure the contract around how your team actually travels."
      heroImage={IMG.lobby}
      cta={
        <a
          href="#rfp-form"
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("rfp-form");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="inline-flex items-center gap-2"
          style={{
            backgroundColor: C.gold, color: C.bgDeep,
            padding: "0.85rem 1.4rem",
            fontFamily: "'Manrope', sans-serif",
            fontSize: "0.74rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer", border: `1px solid ${C.gold}`,
          }}
        >
          Open the form <ArrowRight size={13} />
        </a>
      }
    >
      {/* Volume tier programme */}
      <PageSection
        eyebrow="Volume programme"
        title="Four tiers,"
        italic="one philosophy: the more you book, the more we hand back."
        intro="Tiers are calibrated against annual room-nights. We apply the discount as net-of-commission corporate rates, plus a custom mix of inclusions per contract."
      >
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {VOLUME_TIERS.map((tier) => {
            const Ic = tier.icon;
            const matches = indicativeTier?.id === tier.id;
            return (
              <div
                key={tier.id}
                className="relative flex flex-col"
                style={{
                  backgroundColor: C.cream,
                  border: `1px solid ${tier.featured || matches ? tier.color : "rgba(0,0,0,0.08)"}`,
                  boxShadow: tier.featured || matches ? `0 18px 36px ${tier.color}1F` : "0 6px 18px rgba(0,0,0,0.05)",
                  padding: "26px 24px",
                }}
              >
                {tier.featured && (
                  <span style={{
                    position: "absolute", top: -10, insetInlineEnd: 14,
                    backgroundColor: C.gold, color: C.bgDeep,
                    padding: "3px 10px",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem",
                    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  }}>Most chosen</span>
                )}
                {matches && !tier.featured && (
                  <span style={{
                    position: "absolute", top: -10, insetInlineEnd: 14,
                    backgroundColor: tier.color, color: C.bgDeep,
                    padding: "3px 10px",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem",
                    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  }}>Your fit</span>
                )}
                <Ic size={26} style={{ color: tier.color, marginBottom: 12 }} />
                <div style={{
                  fontFamily: "'Manrope', sans-serif", color: tier.color,
                  fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
                }}>
                  {tier.label}
                </div>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.85rem", color: C.bgDeep, lineHeight: 1.05,
                  marginTop: 4, fontWeight: 500,
                }}>
                  {tier.discount.replace("Up to ", "")}
                </div>
                <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 6 }}>
                  {tier.nights}
                </div>
                <ul className="mt-5 space-y-2 flex-1">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2"
                      style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.55 }}>
                      <Check size={12} style={{ color: tier.color, flexShrink: 0, marginTop: 4 }} />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </PageSection>

      {/* Why us */}
      <PageSection
        eyebrow="Why corporates pick us"
        title="A boutique alternative"
        italic="to the big-brand contract."
      >
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Building2, title: "Apartment-style suites",     body: "Studios to three-bed apartments — kitchenettes, separate living areas, soundproofed windows. Built for travellers who actually live in the room." },
            { icon: Users,     title: "Single point of contact",    body: "One reservations lead, one accountant, one front-office manager — accountable for your account end to end." },
            { icon: ShieldCheck, title: "Predictable invoicing",    body: "Consolidated monthly invoicing, Net-30 to Net-60 terms, virtual cards on file. No surprises at month end." },
          ].map((item) => {
            const Ic = item.icon;
            return (
              <div key={item.title} className="p-6"
                style={{
                  backgroundColor: C.cream,
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <Ic size={22} style={{ color: C.goldDeep }} />
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500,
                  lineHeight: 1.15, marginTop: 14,
                }}>{item.title}</div>
                <p style={{
                  color: C.textDim, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.88rem", lineHeight: 1.65, marginTop: 10,
                }}>{item.body}</p>
              </div>
            );
          })}
        </div>
      </PageSection>

      {/* RFP form */}
      <section id="rfp-form" style={{ scrollMarginTop: 24 }}>
        <PageSection
          eyebrow="Submit an RFP"
          title="Tell us about your"
          italic="travel programme."
          intro="Fields with an asterisk are required. We acknowledge every submission within 24 hours; complete proposals follow within 48 hours."
        />

        {submitted ? (
          <div className="p-8 max-w-3xl mx-auto"
            style={{
              backgroundColor: C.cream,
              border: `1px solid ${C.gold}`,
              borderInlineStart: `4px solid ${C.gold}`,
            }}
          >
            <div className="flex items-center justify-center mb-4"
              style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: `${C.gold}1F`, margin: "0 auto" }}>
              <CheckCircle2 size={32} style={{ color: C.goldDeep }} />
            </div>
            <div className="text-center">
              <div style={{
                color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
              }}>RFP received</div>
              <h3 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "2.2rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.1, marginTop: 8,
              }}>
                Thank you, {submitted.contactName.split(" ")[0]}.
              </h3>
              <p style={{
                color: C.textDim, fontFamily: "'Manrope', sans-serif",
                fontSize: "0.92rem", lineHeight: 1.7, marginTop: 12, maxWidth: 540, marginInline: "auto",
              }}>
                Your reference is <strong style={{ color: C.bgDeep }}>{submitted.id}</strong>.
                We've sent a copy to <strong style={{ color: C.bgDeep }}>{submitted.contactEmail}</strong>.
                Our B2B team will acknowledge inside 24 hours and come back with a full proposal within 48 hours.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button onClick={reset}
                  style={{
                    backgroundColor: "transparent", color: C.bgDeep,
                    border: `1px solid ${C.bgDeep}`,
                    padding: "0.7rem 1.2rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
                  }}
                >Submit another</button>
                <button onClick={onClose}
                  style={{
                    backgroundColor: C.gold, color: C.bgDeep,
                    border: `1px solid ${C.gold}`,
                    padding: "0.7rem 1.2rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
                  }}
                >Back to home</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr,360px] gap-8">
            {/* Form */}
            <div className="space-y-5">
              <FieldGroup title="Organisation">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Company / institution *">
                    <Input value={draft.account} onChange={(v) => set({ account: v })} placeholder="e.g. ALBA Aluminium" />
                  </Field>
                  <Field label="Industry">
                    <Input value={draft.industry} onChange={(v) => set({ industry: v })} placeholder="e.g. Industrial · Government · Aviation" />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Primary contact">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Name *">
                    <Input value={draft.contactName} onChange={(v) => set({ contactName: v })} placeholder="Full name" />
                  </Field>
                  <Field label="Role">
                    <Input value={draft.contactRole} onChange={(v) => set({ contactRole: v })} placeholder="e.g. Head of Travel" />
                  </Field>
                  <Field label="Email *">
                    <Input type="email" value={draft.contactEmail} onChange={(v) => set({ contactEmail: v })} placeholder="name@company.bh" />
                  </Field>
                  <Field label="Phone">
                    <PhoneInput value={draft.contactPhone} onChange={(v) => set({ contactPhone: v })} />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Volume estimate">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Estimated room-nights / year *">
                    <Input
                      type="number"
                      value={draft.roomNights}
                      onChange={(v) => set({ roomNights: v })}
                      placeholder="e.g. 250"
                    />
                  </Field>
                  <Field label="Stay pattern">
                    <Select value={draft.stayType} onChange={(v) => set({ stayType: v })} options={STAY_TYPE_OPTIONS} />
                  </Field>
                  <Field label="Suite preference">
                    <Select value={draft.suite} onChange={(v) => set({ suite: v })} options={SUITE_PREFERENCES} />
                  </Field>
                  <Field label="Preferred payment terms">
                    <Select value={draft.paymentTerms} onChange={(v) => set({ paymentTerms: v })} options={PAYMENT_TERM_OPTIONS} />
                  </Field>
                  <Field label="Programme valid from">
                    <Input type="date" value={draft.eligibleFrom} onChange={(v) => set({ eligibleFrom: v })} />
                  </Field>
                  <Field label="Programme valid to">
                    <Input type="date" value={draft.eligibleTo} onChange={(v) => set({ eligibleTo: v })} />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Inclusions wanted in the contract">
                <div className="grid sm:grid-cols-3 gap-2">
                  {[
                    { id: "breakfast",     label: "Daily breakfast" },
                    { id: "lateCheckOut",  label: "Late check-out" },
                    { id: "parking",       label: "Parking" },
                    { id: "wifi",          label: "Premium Wi-Fi" },
                    { id: "meetingRoom",   label: "Meeting-room hours" },
                  ].map((item) => {
                    const on = !!draft.inclusions[item.id];
                    return (
                      <label key={item.id}
                        className="flex items-center gap-2 px-3 py-2"
                        style={{
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                          color: on ? C.bgDeep : C.textDim,
                          backgroundColor: on ? "rgba(201,169,97,0.10)" : "transparent",
                          border: `1px solid ${on ? C.gold : "rgba(0,0,0,0.12)"}`,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => setInclusion(item.id, e.target.checked)}
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
              </FieldGroup>

              <FieldGroup title="Specific requirements (optional)">
                <Field label="Anything else we should know?">
                  <textarea
                    value={draft.requirements}
                    onChange={(e) => set({ requirements: e.target.value })}
                    rows={5}
                    placeholder="e.g. Engineer rotations · 30–60 night stays · prefer high floors with sea view · 10 simultaneous occupancies during summer."
                    className="w-full outline-none"
                    style={{
                      backgroundColor: "#FFFFFF", color: C.bgDeep,
                      border: "1px solid rgba(0,0,0,0.12)",
                      padding: "0.75rem 0.85rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
                      lineHeight: 1.65, resize: "vertical",
                    }}
                  />
                </Field>
              </FieldGroup>

              <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
                <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                  Submitting forwards directly to our reservations and B2B sales teams.
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!valid}
                  style={{
                    backgroundColor: valid ? C.gold : "rgba(0,0,0,0.08)",
                    color: valid ? C.bgDeep : "rgba(0,0,0,0.4)",
                    border: `1px solid ${valid ? C.gold : "rgba(0,0,0,0.12)"}`,
                    padding: "0.85rem 1.4rem",
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.74rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                    cursor: valid ? "pointer" : "not-allowed",
                    display: "inline-flex", alignItems: "center", gap: 8,
                  }}
                >
                  Submit RFP <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Sidebar — indicative tier + what happens next */}
            <aside>
              <div className="lg:sticky lg:top-6 space-y-5">
                {/* Indicative tier */}
                <div className="p-5"
                  style={{
                    backgroundColor: C.cream,
                    border: `1px solid ${indicativeTier?.color || "rgba(0,0,0,0.08)"}`,
                    borderInlineStart: `4px solid ${indicativeTier?.color || C.gold}`,
                  }}
                >
                  <div style={{
                    color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
                  }}>Indicative tier</div>
                  {indicativeTier ? (
                    <>
                      <div style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: "1.6rem", color: C.bgDeep, fontWeight: 500, marginTop: 4,
                      }}>{indicativeTier.label} · {indicativeTier.discount.replace("Up to ", "")}</div>
                      <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4 }}>
                        Based on your declared <strong style={{ color: C.bgDeep }}>{Number(draft.roomNights || 0).toLocaleString()} room-nights/year</strong>. Final tier confirmed in the proposal.
                      </div>
                    </>
                  ) : (
                    <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", marginTop: 6 }}>
                      Bronze starts at 100 room-nights/year. Enter your estimated volume to see which tier fits.
                    </div>
                  )}
                </div>

                {/* What happens next */}
                <div className="p-5" style={{ backgroundColor: C.cream, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{
                    color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
                  }}>What happens next</div>
                  <ol className="mt-3 space-y-3" style={{ counterReset: "step" }}>
                    {[
                      { icon: Mail,     title: "Acknowledged within 24 hours", body: "An email lands in your inbox confirming we've received the RFP and assigned a reservations lead." },
                      { icon: FileText, title: "Proposal within 48 hours",     body: "A full rate sheet, inclusions matrix, and draft contract — calibrated to the volume you declared." },
                      { icon: Clock,    title: "Counter-sign and onboard",     body: "We e-sign, set up your billing record, and credentials for your travel-bookers go live the same day." },
                    ].map((step) => {
                      const Ic = step.icon;
                      return (
                        <li key={step.title} className="flex items-start gap-3">
                          <span style={{
                            width: 30, height: 30, borderRadius: 999,
                            backgroundColor: `${C.gold}1A`,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            <Ic size={13} style={{ color: C.goldDeep }} />
                          </span>
                          <div>
                            <div style={{
                              fontFamily: "'Manrope', sans-serif", color: C.bgDeep,
                              fontSize: "0.84rem", fontWeight: 600,
                            }}>{step.title}</div>
                            <div style={{
                              color: C.textDim, fontFamily: "'Manrope', sans-serif",
                              fontSize: "0.78rem", lineHeight: 1.55, marginTop: 2,
                            }}>{step.body}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {/* Direct contact */}
                <div className="p-5" style={{ backgroundColor: C.cream, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{
                    color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
                  }}>Prefer to talk first?</div>
                  <div className="mt-2 flex flex-col gap-1.5"
                    style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", color: C.bgDeep }}>
                    <a href="tel:+97316168146" className="inline-flex items-center gap-2"
                      style={{ color: C.goldDeep, textDecoration: "none" }}>
                      <Phone size={12} /> +973 1616 8146
                    </a>
                    <a href="mailto:sales@thelodgesuites.com" className="inline-flex items-center gap-2"
                      style={{ color: C.goldDeep, textDecoration: "none" }}>
                      <Mail size={12} /> sales@thelodgesuites.com
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>
    </EditorialPage>
  );
};

// ---------------------------------------------------------------------------
// Form helpers — local lightweight versions of Field / Input / Select that
// don't pull in the booking-modal palette (cream paper + dark text matches
// the editorial page chrome).
// ---------------------------------------------------------------------------
function FieldGroup({ title, children }) {
  return (
    <div className="p-5" style={{ backgroundColor: C.cream, border: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{
        color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
        fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
        marginBottom: 14,
      }}>{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <div style={{
        fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
        letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
        color: C.textDim, marginBottom: 6,
      }}>{label}</div>
      {children}
    </label>
  );
}
function Input({ value, onChange, type = "text", placeholder }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full outline-none"
      style={{
        backgroundColor: "#FFFFFF", color: C.bgDeep,
        border: "1px solid rgba(0,0,0,0.12)",
        padding: "0.6rem 0.8rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
      }}
    />
  );
}
function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full outline-none cursor-pointer"
      style={{
        backgroundColor: "#FFFFFF", color: C.bgDeep,
        border: "1px solid rgba(0,0,0,0.12)",
        padding: "0.6rem 0.8rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// Today + N days as ISO yyyy-mm-dd. Used as the default `dueDate` so
// the operator team has a 48h SLA out of the box.
function addDaysIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
