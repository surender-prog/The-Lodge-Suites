import React from "react";
import { C } from "../data/tokens.js";
import { Logo } from "../components/Logo.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData, legalLine } from "../data/store.jsx";

// Footer columns map operator-readable item ids to either a scroll target on
// the home page or one of the new editorial modals (Gift Vouchers, Juffair,
// Press). The string label still comes from i18n so it follows the active
// language; the action is bound here.
//   • kind: "scroll" — scrolls to the given section #id
//   • kind: "modal"  — calls the matching open* prop on App.jsx
const STAY_LINKS = [
  { id: "rooms",     kind: "scroll", target: "rooms" },
  { id: "packages",  kind: "scroll", target: "packages" },
  { id: "rewards",   kind: "scroll", target: "rewards" },
  { id: "vouchers",  kind: "modal",  modal: "vouchers" },
];
const DISCOVER_LINKS = [
  { id: "amenities", kind: "scroll", target: "amenities" },
  { id: "juffair",   kind: "modal",  modal: "juffair" },
  { id: "gallery",   kind: "scroll", target: "gallery" },
  { id: "press",     kind: "modal",  modal: "press" },
  { id: "rfp",       kind: "modal",  modal: "rfp" },
];

export const Footer = ({ onPortal, onNav, onOpenVouchers, onOpenJuffair, onOpenPress, onOpenRfp }) => {
  const t = useT();
  const { hotelInfo } = useData();
  // i18n returns ARRAYS for these (one label per column item) — we use the
  // index to pull the right label out and pair it with the link metadata
  // above. The order in translations.js mirrors STAY_LINKS / DISCOVER_LINKS.
  const stayLabels     = t("footer.columns.stay");
  const discoverLabels = t("footer.columns.discover");

  // Compose the copyright line from the editable property info so it always
  // matches what's printed on documents. Falls back to the i18n string when
  // hotelInfo isn't available for any reason.
  const copyrightLine = (() => {
    if (!hotelInfo) return t("footer.copyright");
    const parts = [
      `© ${hotelInfo.copyrightYear || new Date().getFullYear()} ${hotelInfo.name || "The Lodge Suites"}`,
      hotelInfo.area || hotelInfo.country,
      legalLine(hotelInfo),
    ].filter(Boolean);
    return parts.join(" · ");
  })();
  const stay     = Array.isArray(stayLabels)     ? stayLabels     : [];
  const discover = Array.isArray(discoverLabels) ? discoverLabels : [];

  // Resolves a link's action when clicked.
  const handleClick = (link) => {
    if (link.kind === "scroll") return onNav?.(link.target);
    if (link.kind === "modal") {
      if (link.modal === "vouchers") return onOpenVouchers?.();
      if (link.modal === "juffair")  return onOpenJuffair?.();
      if (link.modal === "press")    return onOpenPress?.();
      if (link.modal === "rfp")      return onOpenRfp?.();
    }
  };

  return (
    <footer className="px-6 pt-16 pb-8" style={{ backgroundColor: C.bgDeep, borderTop: `1px solid ${C.border}` }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 pb-12" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="lg:col-span-4">
            <Logo size={48} />
            <p className="mt-6" style={{ fontFamily: "'Manrope', sans-serif", color: C.textMuted, fontSize: "0.88rem", lineHeight: 1.7, maxWidth: 320 }}>
              {t("footer.blurb")}
            </p>
          </div>

          <div className="lg:col-span-2">
            <h5 style={{ fontFamily: "'Manrope', sans-serif", color: C.gold, fontSize: "0.7rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>{t("footer.stay")}</h5>
            <ul className="mt-4 space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", color: C.textOnDark, fontSize: "0.85rem" }}>
              {STAY_LINKS.map((link, i) => (
                <li key={link.id}>
                  <FooterLink onClick={() => handleClick(link)}>
                    {stay[i] || link.id}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h5 style={{ fontFamily: "'Manrope', sans-serif", color: C.gold, fontSize: "0.7rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>{t("footer.discover")}</h5>
            <ul className="mt-4 space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", color: C.textOnDark, fontSize: "0.85rem" }}>
              {DISCOVER_LINKS.map((link, i) => (
                <li key={link.id}>
                  <FooterLink onClick={() => handleClick(link)}>
                    {discover[i] || link.id}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-4">
            <h5 style={{ fontFamily: "'Manrope', sans-serif", color: C.gold, fontSize: "0.7rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>{t("footer.stayInTouch")}</h5>
            <p className="mt-4" style={{ fontFamily: "'Manrope', sans-serif", color: C.textOnDark, fontSize: "0.85rem", lineHeight: 1.7 }}>
              {t("footer.newsletterIntro")}
            </p>
            <div className="mt-4 flex">
              <input placeholder={t("footer.emailPlaceholder")}
                className="flex-1 outline-none"
                style={{ backgroundColor: "transparent", color: C.cream, border: `1px solid ${C.border}`, padding: "0.7rem 0.9rem", fontSize: "0.88rem", fontFamily: "'Manrope', sans-serif" }} />
              <button style={{ backgroundColor: C.gold, color: C.bgDeep, padding: "0 1.3rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                {t("footer.join")}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-8 flex flex-wrap items-center justify-between gap-4" style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.75rem" }}>
          <div>{copyrightLine}</div>
          <div className="flex gap-6">
            <button onClick={onPortal} style={{ color: C.gold, letterSpacing: "0.18em", textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700 }}>
              {t("footer.portalLink")}
            </button>
            <span>{t("footer.privacy")}</span>
            <span>{t("footer.terms")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

// Footer link — a button that looks like an anchor. Subtle gold underline
// on hover, matches the dark-on-cream typography of the rest of the
// marketing site.
function FooterLink({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent", border: "none", padding: 0,
        color: C.textOnDark, fontFamily: "'Manrope', sans-serif",
        fontSize: "0.85rem", cursor: "pointer", textAlign: "start",
        transition: "color 120ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = C.textOnDark; }}
    >
      {children}
    </button>
  );
}
