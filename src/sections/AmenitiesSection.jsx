import React from "react";
import { C } from "../data/tokens.js";
import { AMENITIES } from "../data/amenities.js";
import { Icon } from "../components/Icon.jsx";
import { SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";

export const AmenitiesSection = () => {
  const t = useT();
  return (
    <section id="amenities" className="py-24 px-6 relative" style={{ backgroundColor: C.cream }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 mb-14">
          <div className="lg:col-span-5">
            <SectionLabel>{t("amenities.label")}</SectionLabel>
            <SectionTitle italic={t("amenities.titleB")}>{t("amenities.titleA")}</SectionTitle>
          </div>
          <p className="lg:col-span-6 lg:col-start-7" style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "1rem", lineHeight: 1.8 }}>
            {t("amenities.intro")}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {AMENITIES.map((a) => (
            <div key={a.id} className="p-7 flex flex-col items-start transition-colors group" style={{ backgroundColor: C.cream }}>
              <Icon name={a.icon} size={26} style={{ color: C.goldDeep }} />
              <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.bgDeep, marginTop: 14, fontWeight: 500 }}>
                {t(`amenities.items.${a.id}.label`)}
              </h4>
              <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.78rem", marginTop: 4, lineHeight: 1.5 }}>
                {t(`amenities.items.${a.id}.note`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
