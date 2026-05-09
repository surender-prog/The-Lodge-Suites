import React from "react";
import { C } from "../data/tokens.js";

// LS monogram — keeps the SVG crosshatch + "THE LODGE / SUITES" wordmark.
// Re-rendered as inline SVG so it inherits color cleanly on dark and light surfaces.
export const Logo = ({ size = 40, color = C.gold, showText = true, textColor = C.cream }) => (
  <div className="flex items-center gap-3">
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <defs>
        <pattern id={`cross-${size}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 0 20 L 20 0 M -5 5 L 5 -5 M 15 25 L 25 15" stroke={color} strokeWidth="0.4" fill="none" opacity="0.45" />
          <path d="M 0 0 L 20 20 M -5 15 L 5 25 M 15 -5 L 25 5" stroke={color} strokeWidth="0.4" fill="none" opacity="0.45" />
        </pattern>
      </defs>
      <rect x="2" y="2" width="96" height="96" fill="none" stroke={color} strokeWidth="1.2" />
      <rect x="2" y="2" width="96" height="96" fill={`url(#cross-${size})`} />
      <text x="50" y="68" textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontWeight="600" fontSize="48" fill={color} letterSpacing="2">LS</text>
    </svg>
    {showText && (
      <div className="leading-tight" style={{ color: textColor }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", letterSpacing: "0.18em", fontWeight: 500 }}>
          THE LODGE
        </div>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.42em", color, marginTop: 1 }}>
          S U I T E S
        </div>
      </div>
    )}
  </div>
);
