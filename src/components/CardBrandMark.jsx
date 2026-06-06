import React from "react";
import { brandOf } from "../lib/cardValidation.js";

// CardBrandMark — small inline-SVG card-brand logos, selected from the typed
// card number's prefix (via brandOf). Designed to sit inside / next to the
// card-number input. Self-contained SVGs (no network, no asset files) so they
// render identically on the public site and inside the admin portal.
//
// Usage:
//   <CardBrandMark number={cardNum} />            // single, auto-detected
//   <CardBrandRow number={cardNum} />             // detected one highlighted,
//                                                 // the accepted set dimmed
//
// Width ~34px each, height 22px — fits a standard input's trailing slot.

const W = 34, H = 22, R = 3;

function Frame({ children, bg = "#fff", border = "#E2DACB" }) {
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true"
      style={{ display: "block", borderRadius: R, border: `1px solid ${border}`, background: bg, flexShrink: 0 }}>
      {children}
    </svg>
  );
}

const Visa = () => (
  <Frame>
    <text x="17" y="15.5" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif"
      fontStyle="italic" fontWeight="700" fontSize="10" letterSpacing="0.5" fill="#1A1F71">VISA</text>
  </Frame>
);

const Mastercard = () => (
  <Frame>
    <circle cx="14" cy="11" r="6.5" fill="#EB001B" />
    <circle cx="20" cy="11" r="6.5" fill="#F79E1B" />
    <path d="M17 6.1a6.5 6.5 0 0 0 0 9.8 6.5 6.5 0 0 0 0-9.8z" fill="#FF5F00" />
  </Frame>
);

const Amex = () => (
  <Frame bg="#1F72CD" border="#1F72CD">
    <text x="17" y="14.5" textAnchor="middle" fontFamily="Arial, sans-serif"
      fontWeight="700" fontSize="6.2" letterSpacing="0.3" fill="#fff">AMEX</text>
  </Frame>
);

const Discover = () => (
  <Frame>
    <rect x="1" y="11" width="32" height="10" rx="0" fill="#fff" />
    <circle cx="25" cy="13.5" r="4.4" fill="#F76E11" />
    <text x="14" y="9.4" textAnchor="middle" fontFamily="Arial, sans-serif"
      fontWeight="700" fontSize="5" letterSpacing="0.2" fill="#222">DISCOVER</text>
  </Frame>
);

const Diners = () => (
  <Frame>
    <circle cx="17" cy="11" r="7" fill="none" stroke="#0079BE" strokeWidth="1.4" />
    <circle cx="17" cy="11" r="3" fill="#0079BE" />
  </Frame>
);

const JCB = () => (
  <Frame>
    <rect x="6"  y="5" width="6.5" height="12" rx="1.5" fill="#0E4C96" />
    <rect x="13.7" y="5" width="6.5" height="12" rx="1.5" fill="#B3131B" />
    <rect x="21.4" y="5" width="6.5" height="12" rx="1.5" fill="#1E8B3B" />
  </Frame>
);

const Generic = () => (
  <Frame bg="#F5F1E8">
    <rect x="4" y="7" width="26" height="3" rx="1.5" fill="#C9BFA8" />
    <rect x="4" y="13" width="10" height="2.4" rx="1.2" fill="#D8D0BD" />
  </Frame>
);

const MARKS = { Visa, Mastercard, Amex, Discover, Diners, JCB };

// Single auto-detected mark. Renders nothing until enough digits exist to
// identify a brand (avoids a flash of the generic icon on the first keypress)
// unless `placeholder` is set, in which case the generic card is shown.
export function CardBrandMark({ number, placeholder = false }) {
  const digits = String(number || "").replace(/\D/g, "");
  const brand = digits.length >= 2 ? brandOf(digits) : null;
  if (!brand) return placeholder ? <Generic /> : null;
  const Mark = MARKS[brand] || Generic;
  return <Mark />;
}

// A row of the property's accepted brands, with the typed card's brand
// highlighted and the rest dimmed. Good for the trailing slot of a card input
// so the guest sees both "what you accept" and "what I detected".
export function CardBrandRow({ number, brands }) {
  const digits = String(number || "").replace(/\D/g, "");
  const detected = digits.length >= 2 ? brandOf(digits) : null;
  const list = (Array.isArray(brands) && brands.length ? brands : ["Visa", "Mastercard", "Amex"])
    .filter((b) => MARKS[b]);
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {list.map((b) => {
        const Mark = MARKS[b];
        const active = !detected || detected === b;
        return (
          <span key={b} style={{ opacity: active ? 1 : 0.28, transition: "opacity 120ms" }}>
            <Mark />
          </span>
        );
      })}
    </div>
  );
}
