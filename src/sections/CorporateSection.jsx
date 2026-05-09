import React from "react";
import { ArrowRight, Award, Briefcase, Building2, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { C } from "../data/tokens.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { SectionLabel, SectionTitle } from "../components/primitives.jsx";

// ---------------------------------------------------------------------------
// CorporateSection — homepage band that promotes the volume / RFP
// programme. Sits on the dark cream paper with a four-column tier strip
// and a primary CTA that opens the public RFP modal.
// ---------------------------------------------------------------------------
const TIERS = [
  { id: "bronze",   icon: Briefcase, label: "Bronze",   nights: "100+ nights",   discount: "5% off",  color: "#A0826A" },
  { id: "silver",   icon: Award,     label: "Silver",   nights: "250+ nights",   discount: "8% off",  color: "#A8A8A8" },
  { id: "gold",     icon: Trophy,    label: "Gold",     nights: "500+ nights",   discount: "12% off", color: C.gold,    featured: true },
  { id: "platinum", icon: Sparkles,  label: "Platinum", nights: "1,000+ nights", discount: "15% off", color: "#D4B97A" },
];

export const CorporateSection = ({ onOpenRfp }) => {
  return (
    <section id="corporate" className="py-24 px-6 relative" style={{ backgroundColor: C.cream }}>
      <Crosshatch opacity={0.04} color={C.bgDeep} />
      <div className="max-w-7xl mx-auto relative">
        <div className="grid lg:grid-cols-12 gap-10 mb-12 items-end">
          <div className="lg:col-span-7">
            <SectionLabel>For corporates · institutions · government</SectionLabel>
            <SectionTitle italic="not on the credit card.">Run on contract,</SectionTitle>
            <p className="mt-6" style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "1rem", lineHeight: 1.75, maxWidth: 560 }}>
              Volume bookings for institutions, government, and corporate travel programmes. Submit a request for
              proposal — we come back inside 48 hours with a tailored rate sheet, inclusions matrix, and draft contract.
            </p>
          </div>
          <div className="lg:col-span-5 flex lg:justify-end">
            <button
              onClick={onOpenRfp}
              className="inline-flex items-center gap-2"
              style={{
                backgroundColor: C.gold, color: C.bgDeep,
                padding: "1rem 1.6rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem",
                letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                cursor: "pointer", border: `1px solid ${C.gold}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.goldDeep; e.currentTarget.style.borderColor = C.goldDeep; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.gold; e.currentTarget.style.borderColor = C.gold; }}
            >
              Submit an RFP <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {TIERS.map((tier) => {
            const Ic = tier.icon;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={onOpenRfp}
                className="text-start relative flex flex-col"
                style={{
                  backgroundColor: "#FFFFFF",
                  border: `1px solid ${tier.featured ? C.gold : "rgba(0,0,0,0.08)"}`,
                  boxShadow: tier.featured ? "0 18px 36px rgba(201,169,97,0.18)" : "0 6px 18px rgba(0,0,0,0.05)",
                  padding: "26px 24px",
                  cursor: "pointer",
                  transition: "transform 240ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
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
                <Ic size={26} style={{ color: tier.color, marginBottom: 12 }} />
                <div style={{
                  color: tier.color, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
                }}>{tier.label}</div>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.85rem", color: C.bgDeep, fontWeight: 500,
                  lineHeight: 1.05, marginTop: 4,
                }}>{tier.discount}</div>
                <div style={{
                  color: C.textDim, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.78rem", marginTop: 6,
                }}>From {tier.nights} / year</div>
                <div className="mt-4 inline-flex items-center gap-1.5"
                  style={{
                    color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  }}>
                  Discuss this tier <ArrowRight size={12} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Reassurance strip */}
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Building2,   title: "Apartment-style suites",  body: "Studios to three-bed apartments — kitchenettes, separate living areas, soundproofed windows." },
            { icon: ShieldCheck, title: "Predictable invoicing",   body: "Consolidated monthly invoicing, Net-30 to Net-60 terms, virtual cards on file." },
            { icon: Trophy,      title: "Single point of contact", body: "One reservations lead, one accountant, one front-office manager — accountable end to end." },
          ].map((item) => {
            const Ic = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3">
                <span style={{
                  width: 38, height: 38, borderRadius: 999,
                  backgroundColor: `${C.gold}1A`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Ic size={16} style={{ color: C.goldDeep }} />
                </span>
                <div>
                  <div style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "1.25rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.15,
                  }}>{item.title}</div>
                  <div style={{
                    color: C.textDim, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.86rem", lineHeight: 1.6, marginTop: 4,
                  }}>{item.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
