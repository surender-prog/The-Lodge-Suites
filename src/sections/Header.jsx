import React, { useEffect, useState } from "react";
import { Lock, LogIn, X } from "lucide-react";
import { C } from "../data/tokens.js";
import { Logo } from "../components/Logo.jsx";
import { GoldBtn } from "../components/primitives.jsx";
import { LanguageToggle } from "../components/LanguageToggle.jsx";
import { useT } from "../i18n/LanguageContext.jsx";

export const Header = ({ onBook, onPortal, onSignIn, onNav }) => {
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const links = [
    { id: "rooms",     label: t("header.nav.rooms") },
    { id: "packages",  label: t("header.nav.packages") },
    { id: "rewards",   label: t("header.nav.rewards") },
    { id: "amenities", label: t("header.nav.amenities") },
    { id: "contact",   label: t("header.nav.contact") },
  ];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 transition-all duration-500"
      style={{
        backgroundColor: scrolled ? "rgba(21,22,26,0.96)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? `1px solid ${C.border}` : "1px solid transparent",
        padding: scrolled ? "0.7rem 0" : "1.3rem 0",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <button onClick={() => onNav("home")} className="cursor-pointer">
          <Logo size={scrolled ? 36 : 44} />
        </button>
        <nav className="hidden lg:flex items-center gap-9">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => onNav(l.id)}
              className="transition-colors"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.74rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: C.textOnDark,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.textOnDark)}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          <LanguageToggle />
          {onSignIn && (
            <button
              onClick={onSignIn}
              className="flex items-center gap-2"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.7rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: C.textMuted,
                padding: "0.55rem 0.8rem",
                border: `1px solid ${C.border}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = C.gold; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border; }}
            >
              <LogIn size={11} /> {t("header.signIn")}
            </button>
          )}
          <button
            onClick={onPortal}
            className="flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: C.textMuted,
              padding: "0.55rem 0.8rem",
              border: `1px solid ${C.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = C.gold; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border; }}
          >
            <Lock size={11} /> {t("header.partners")}
          </button>
          <GoldBtn onClick={onBook} small>{t("common.bookStay")}</GoldBtn>
        </div>
        <button className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} style={{ color: C.cream }}>
          {mobileOpen ? <X size={26} /> : (
            <div className="space-y-1">
              <div style={{ width: 24, height: 1.5, backgroundColor: C.cream }} />
              <div style={{ width: 24, height: 1.5, backgroundColor: C.cream }} />
              <div style={{ width: 18, height: 1.5, backgroundColor: C.cream }} />
            </div>
          )}
        </button>
      </div>
      {mobileOpen && (
        <div className="lg:hidden border-t" style={{ backgroundColor: C.bgDeep, borderColor: C.border }}>
          <div className="px-6 py-5 space-y-3">
            {links.map((l) => (
              <button key={l.id} onClick={() => { onNav(l.id); setMobileOpen(false); }}
                className="block w-full text-start py-2"
                style={{ color: C.textOnDark, fontFamily: "'Manrope', sans-serif", letterSpacing: "0.18em", fontSize: "0.85rem", textTransform: "uppercase" }}>
                {l.label}
              </button>
            ))}
            <div className="pt-3 flex flex-col gap-2">
              <LanguageToggle />
              {onSignIn && (
                <button onClick={() => { onSignIn(); setMobileOpen(false); }} className="w-full py-2 flex items-center justify-center gap-2"
                  style={{ color: C.textMuted, border: `1px solid ${C.border}`, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                  <LogIn size={12} /> {t("header.signIn")}
                </button>
              )}
              <button onClick={() => { onPortal(); setMobileOpen(false); }} className="w-full py-2 flex items-center justify-center gap-2"
                style={{ color: C.textMuted, border: `1px solid ${C.border}`, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                <Lock size={12} /> {t("header.partners")}
              </button>
              <GoldBtn onClick={() => { onBook(); setMobileOpen(false); }} full>{t("common.bookStay")}</GoldBtn>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
