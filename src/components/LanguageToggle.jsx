import React from "react";
import { C } from "../data/tokens.js";
import { useLang } from "../i18n/LanguageContext.jsx";

export const LanguageToggle = ({ compact = false }) => {
  const { lang, setLang } = useLang();
  const next = lang === "en" ? "ar" : "en";
  const label = lang === "en" ? "العربية" : "English";

  return (
    <button
      onClick={() => setLang(next)}
      aria-label={`Switch to ${next === "ar" ? "Arabic" : "English"}`}
      className="flex items-center gap-2 transition-colors"
      style={{
        fontFamily: lang === "en"
          ? "'Manrope', sans-serif"
          : "'Cormorant Garamond', 'Manrope', sans-serif",
        fontSize: "0.7rem",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: C.textMuted,
        padding: compact ? "0.45rem 0.7rem" : "0.55rem 0.8rem",
        border: `1px solid ${C.border}`,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = C.gold;
        e.currentTarget.style.borderColor = C.gold;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = C.textMuted;
        e.currentTarget.style.borderColor = C.border;
      }}
    >
      <span style={{ fontWeight: 700, color: C.gold }}>{lang === "en" ? "EN" : "ع"}</span>
      <span style={{ opacity: 0.5 }}>/</span>
      <span style={{ fontFamily: lang === "en" ? "'Cormorant Garamond', serif" : "'Manrope', sans-serif", fontSize: "0.78rem", letterSpacing: lang === "en" ? "0.05em" : "0.18em" }}>
        {label}
      </span>
    </button>
  );
};
