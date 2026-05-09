import React, { useState } from "react";
import { Plus } from "lucide-react";
import { C } from "../data/tokens.js";
import { FAQS } from "../data/faqs.js";
import { SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";

export const FAQSection = () => {
  const t = useT();
  const [open, setOpen] = useState(0);
  return (
    <section className="py-24 px-6" style={{ backgroundColor: C.paper }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <SectionLabel>{t("faq.label")}</SectionLabel>
          <SectionTitle>{t("faq.title")}</SectionTitle>
        </div>
        <div>
          {FAQS.map((f, i) => (
            <div key={f.id} style={{ borderTop: i === 0 ? `1px solid rgba(0,0,0,0.1)` : "none", borderBottom: `1px solid rgba(0,0,0,0.1)` }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full text-start flex items-center justify-between py-5">
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.bgDeep, fontWeight: 500, paddingInlineEnd: 20 }}>
                  {t(`faq.items.${f.id}.q`)}
                </span>
                <Plus size={18} style={{ color: C.goldDeep, transition: "transform 0.3s", transform: open === i ? "rotate(45deg)" : "none", flexShrink: 0 }} />
              </button>
              {open === i && (
                <div className="pb-5" style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.95rem", lineHeight: 1.75, paddingInlineEnd: 40 }}>
                  {t(`faq.items.${f.id}.a`)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
