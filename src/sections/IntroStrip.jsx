import React from "react";
import { C } from "../data/tokens.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { SectionLabel } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";

export const IntroStrip = () => {
  const t = useT();
  return (
    <section className="py-24 px-6 relative" style={{ backgroundColor: C.paper }}>
      <Crosshatch opacity={0.04} color={C.bgDeep} />
      <div className="max-w-5xl mx-auto text-center relative">
        <SectionLabel>{t("intro.label")}</SectionLabel>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "clamp(1.7rem, 3.2vw, 2.6rem)",
          fontWeight: 400,
          color: C.bgDeep,
          lineHeight: 1.35,
          letterSpacing: "-0.005em",
        }}>
          {t("intro.body1")}{" "}
          <span style={{ fontStyle: "italic", color: C.goldDeep }}>{t("intro.body2")}</span>{" "}
          {t("intro.body3")}
        </h2>
        <div className="mt-10 inline-flex items-center gap-4" style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          <span style={{ width: 30, height: 1, backgroundColor: C.goldDeep }} />
          {t("intro.tagline")}
          <span style={{ width: 30, height: 1, backgroundColor: C.goldDeep }} />
        </div>
      </div>
    </section>
  );
};
