import React from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG } from "../data/images.js";
import { SOCIALS } from "../data/socials.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { Icon } from "../components/Icon.jsx";
import { SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";

export const ContactSection = () => {
  const t = useT();
  return (
    <section id="contact" className="py-24 px-6 relative" style={{ backgroundColor: C.bgDeep }}>
      <Crosshatch opacity={0.07} />
      <div className="max-w-7xl mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-16">
          <div>
            <SectionLabel light>{t("contact.label")}</SectionLabel>
            <SectionTitle light italic={t("contact.titleB")}>{t("contact.titleA")}</SectionTitle>
            <div className="mt-10 space-y-7">
              <div>
                <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{t("contact.addressLabel")}</div>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.cream, lineHeight: 1.4 }}>
                  {t("contact.addressLine1")}<br />
                  {t("contact.addressLine2")}<br />
                  {t("contact.addressLine3")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{t("contact.phoneLabel")}</div>
                  <a href="tel:+97316168146" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: C.cream, direction: "ltr", display: "inline-block" }}>+973 1616 8146</a>
                </div>
                <div>
                  <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{t("contact.reservationsLabel")}</div>
                  <a href="mailto:reservations@thelodgesuites.bh" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: C.cream, direction: "ltr", display: "inline-block" }}>reservations@thelodgesuites.bh</a>
                </div>
              </div>
              <div>
                <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>{t("contact.followLabel")}</div>
                <div className="flex gap-3">
                  {SOCIALS.map((s) => (
                    <a key={s.id} href="#" className="flex items-center gap-2 px-4 py-2 transition-colors"
                      style={{ border: `1px solid ${C.border}`, color: C.textOnDark, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textOnDark; }}
                    >
                      <Icon name={s.icon} size={14} /> <span style={{ direction: "ltr" }}>{s.handle}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="relative h-full min-h-[480px] overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <img src={IMG.cityView} alt="Map" className="w-full h-full object-cover absolute inset-0" style={{ filter: "grayscale(0.3) brightness(0.7)" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center p-8" style={{ backgroundColor: "rgba(21,22,26,0.92)", border: `1px solid ${C.gold}` }}>
                  <MapPin size={28} style={{ color: C.gold, margin: "0 auto" }} />
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.cream, marginTop: 12 }}>{t("contact.mapName")}</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textMuted, fontSize: "0.78rem", marginTop: 4 }}>{t("contact.mapCoords")}</div>
                  <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, color: C.gold, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 600 }}>
                    {t("contact.openMaps")} <ArrowUpRight size={12} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
