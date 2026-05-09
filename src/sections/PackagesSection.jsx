import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { C } from "../data/tokens.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { Icon } from "../components/Icon.jsx";
import { SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData, describePackageConditions, packagePriceSuffix, getPackageMinPrice } from "../data/store.jsx";

export const PackagesSection = ({ onBookPackage }) => {
  const t = useT();
  const { activePackages: PACKAGES } = useData();
  return (
    <section id="packages" className="py-24 px-6 relative" style={{ backgroundColor: C.paper }}>
      <Crosshatch opacity={0.04} color={C.bgDeep} />
      <div className="max-w-7xl mx-auto relative">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-6">
          <div>
            <SectionLabel>{t("packages.label")}</SectionLabel>
            <SectionTitle italic={t("packages.titleB")}>{t("packages.titleA")}</SectionTitle>
          </div>
          <p style={{ maxWidth: 380, fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.92rem", lineHeight: 1.7 }}>
            {t("packages.intro")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PACKAGES.map((p) => {
            const inclusions = t(`packages.${p.id}.inclusions`);
            const headline = getPackageMinPrice(p);
            return (
              <div
                key={p.id}
                className="group cursor-pointer flex flex-col transition-all duration-500 hover:-translate-y-1"
                style={{
                  backgroundColor: C.cream,
                  border: `1px solid ${p.featured ? C.gold : "rgba(0,0,0,0.06)"}`,
                  boxShadow: p.featured ? "0 20px 40px rgba(201,169,97,0.15)" : "none",
                }}
                onClick={() => onBookPackage(p)}
              >
                <div className="relative overflow-hidden" style={{ aspectRatio: "4/3" }}>
                  <img src={p.image} alt={t(`packages.${p.id}.title`)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute top-4 start-4 flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: C.bgDeep, color: C.gold }}>
                    <Icon name={p.icon} size={14} />
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
                      {t("packages.save")} {t("common.bhd")} {headline.saving}
                    </span>
                  </div>
                  {p.featured && (
                    <div className="absolute top-4 end-4 px-3 py-1.5" style={{ backgroundColor: C.gold, color: C.bgDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      {t("packages.mostPopular")}
                    </div>
                  )}
                </div>
                <div className="p-7 flex-1 flex flex-col">
                  <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                    {t(`packages.${p.id}.nights`)}
                  </div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.8rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.1 }}>
                    {t(`packages.${p.id}.title`)}
                  </h3>
                  <ul className="mt-5 space-y-2 flex-1">
                    {(Array.isArray(inclusions) ? inclusions : []).map((inc) => (
                      <li key={inc} className="flex items-start gap-2" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55 }}>
                        <Check size={13} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 4 }} />
                        {inc}
                      </li>
                    ))}
                  </ul>
                  {(() => {
                    const cond = describePackageConditions(p, (id) => t(`rooms.${id}.short`) || t(`rooms.${id}.name`) || id);
                    return cond ? (
                      <div className="mt-4 px-2.5 py-1.5"
                        style={{
                          backgroundColor: "rgba(201,169,97,0.10)",
                          border: "1px dashed rgba(154,126,64,0.40)",
                          color: C.goldDeep,
                          fontFamily: "'Manrope', sans-serif",
                          fontSize: "0.7rem", letterSpacing: "0.04em", lineHeight: 1.5,
                        }}>
                        {cond}
                      </div>
                    ) : null;
                  })()}
                  <div className="mt-7 pt-5 flex items-center justify-between" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <div>
                      <span style={{ color: C.textDim, fontSize: "0.7rem", letterSpacing: "0.1em" }}>{t("packages.from")}</span>
                      <div className="flex items-baseline gap-1.5">
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1 }}>
                          {t("common.bhd")} {headline.price}
                        </div>
                        <span style={{ color: C.textDim, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif", letterSpacing: "0.04em" }}>
                          {packagePriceSuffix(p)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 group-hover:gap-3 transition-all" style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      {t("common.reserve")} <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
