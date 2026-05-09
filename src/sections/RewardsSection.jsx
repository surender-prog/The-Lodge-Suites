import React, { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { C } from "../data/tokens.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { Icon } from "../components/Icon.jsx";
import { GoldBtn, SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData } from "../data/store.jsx";

export const RewardsSection = ({ onJoin }) => {
  const t = useT();
  const { tiers: TIERS } = useData();
  const [activeTier, setActiveTier] = useState(1);
  const tier = TIERS[activeTier] || TIERS[0];
  if (!tier) return null;

  return (
    <section id="rewards" className="py-24 px-6 relative overflow-hidden" style={{ backgroundColor: C.bgDeep }}>
      <Crosshatch opacity={0.08} />
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center mb-14">
          <SectionLabel light>{t("rewards.label")}</SectionLabel>
          <SectionTitle light italic={t("rewards.titleB")}>{t("rewards.titleA")}</SectionTitle>
          <p className="mt-6 max-w-2xl mx-auto" style={{ fontFamily: "'Manrope', sans-serif", color: C.textOnDark, opacity: 0.78, fontSize: "0.95rem", lineHeight: 1.75 }}>
            {t("rewards.intro")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {TIERS.map((tt, i) => (
            <button
              key={tt.id}
              onClick={() => setActiveTier(i)}
              className="text-start p-7 transition-all relative"
              style={{
                backgroundColor: activeTier === i ? C.bgPanel : "transparent",
                border: `1px solid ${activeTier === i ? tt.color : C.border}`,
                cursor: "pointer",
              }}
            >
              {tt.featured && (
                <div className="absolute -top-3 start-7 px-2.5 py-1" style={{ backgroundColor: tt.color, color: C.bgDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                  {t("rewards.mostChosen")}
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <Icon name={tt.icon} size={26} style={{ color: tt.color }} />
                <div style={{ color: C.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>
                  {tt.nightsLabel || t(`rewards.tiers.${tt.id}.nights`)}
                </div>
              </div>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: tt.color, fontWeight: 500, lineHeight: 1 }}>
                {tt.name || t(`rewards.tiers.${tt.id}.name`)}
              </h3>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", color: C.textOnDark, fontSize: "1rem", marginTop: 8, opacity: 0.85 }}>
                {tt.intro || t(`rewards.tiers.${tt.id}.intro`)}
              </p>
            </button>
          ))}
        </div>

        <div className="p-10 lg:p-14" style={{ backgroundColor: C.bgPanel, border: `1px solid ${tier.color}33` }}>
          <div className="flex items-center gap-3 mb-8">
            <Icon name={tier.icon} size={26} style={{ color: tier.color }} />
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: tier.color, fontWeight: 500 }}>
              {tier.name || t(`rewards.tiers.${tier.id}.name`)} {t("rewards.benefitsSuffix")}
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-x-10 gap-y-4">
            {tier.benefits.map((b, idx) => (
              <div key={b.id || idx} className="flex items-center gap-3" style={{ opacity: b.on ? 1 : 0.35 }}>
                <div className="flex items-center justify-center" style={{
                  width: 24, height: 24,
                  backgroundColor: b.on ? `${tier.color}25` : "transparent",
                  border: `1px solid ${b.on ? tier.color : C.border}`,
                  borderRadius: "50%",
                  flexShrink: 0,
                }}>
                  {b.on ? <Check size={12} style={{ color: tier.color }} /> : <X size={12} style={{ color: C.textDim }} />}
                </div>
                <span style={{ fontFamily: "'Manrope', sans-serif", color: C.textOnDark, fontSize: "0.92rem" }}>
                  {b.label || (b.key && t(`rewards.benefits.${b.key}`))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-10 pt-8 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: `1px solid ${C.border}` }}>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textMuted, fontSize: "0.85rem", maxWidth: 480 }}>
              {t("rewards.joinIntro")}
            </p>
            <GoldBtn onClick={onJoin}>{t("rewards.joinCta")} <ArrowRight size={14} /></GoldBtn>
          </div>
        </div>
      </div>
    </section>
  );
};
