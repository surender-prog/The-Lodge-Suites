import React from "react";
import { C } from "../data/tokens.js";

export const GoldBtn = ({ children, onClick, className = "", small = false, type = "button", outline = false, full = false, disabled = false }) => (
  <button
    type={type}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={`group inline-flex items-center justify-center gap-2 transition-all duration-300 ${full ? "w-full" : ""} ${className}`}
    style={{
      backgroundColor: disabled ? "rgba(154,126,64,0.25)" : outline ? "transparent" : C.gold,
      color: disabled ? "rgba(255,255,255,0.55)" : outline ? C.gold : C.bgDeep,
      border: `1px solid ${disabled ? "rgba(154,126,64,0.35)" : C.gold}`,
      padding: small ? "0.55rem 1.1rem" : "0.85rem 1.6rem",
      fontFamily: "'Manrope', sans-serif",
      fontSize: small ? "0.72rem" : "0.78rem",
      fontWeight: 600,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      cursor: disabled ? "not-allowed" : "pointer",
    }}
    onMouseEnter={(e) => {
      if (disabled) return;
      e.currentTarget.style.backgroundColor = outline ? C.gold : C.goldBright;
      e.currentTarget.style.color = C.bgDeep;
    }}
    onMouseLeave={(e) => {
      if (disabled) return;
      e.currentTarget.style.backgroundColor = outline ? "transparent" : C.gold;
      e.currentTarget.style.color = outline ? C.gold : C.bgDeep;
    }}
  >
    {children}
  </button>
);

export const SectionLabel = ({ children, light = false }) => (
  <div className="flex items-center gap-3 mb-5" style={{ color: light ? C.gold : C.goldDeep }}>
    <span style={{ width: 36, height: 1, backgroundColor: "currentColor" }} />
    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.4em", fontWeight: 600 }}>
      {children}
    </span>
  </div>
);

export const SectionTitle = ({ children, light = false, italic, className = "" }) => (
  <h2
    className={className}
    style={{
      fontFamily: "'Cormorant Garamond', serif",
      fontSize: "clamp(2rem, 4.5vw, 3.6rem)",
      fontWeight: 400,
      lineHeight: 1.05,
      color: light ? C.cream : C.bgDeep,
      letterSpacing: "-0.01em",
    }}
  >
    {children}
    {italic && (
      <span style={{ fontStyle: "italic", color: C.gold, fontWeight: 300, display: "block" }}>
        {italic}
      </span>
    )}
  </h2>
);

export const Field = ({ label, children, dark = true }) => (
  <label className="block">
    <div
      style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.62rem",
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: dark ? C.textMuted : C.textDim,
        marginBottom: 6,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
    {children}
  </label>
);

export const Input = ({ value, onChange, type = "text", placeholder, dark = true, min, max, invalid = false }) => {
  const idleBorder = invalid
    ? (C.danger || "#9A3A30")
    : (dark ? C.border : "rgba(0,0,0,0.15)");
  return (
    <input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      aria-invalid={invalid || undefined}
      className="w-full outline-none transition-colors"
      style={{
        backgroundColor: dark ? C.bgElev : "transparent",
        color: dark ? C.cream : C.bgDeep,
        border: `1px solid ${idleBorder}`,
        padding: "0.7rem 0.85rem",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.92rem",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = invalid ? (C.danger || "#9A3A30") : C.gold)}
      onBlur={(e) => (e.currentTarget.style.borderColor = idleBorder)}
    />
  );
};

export const Select = ({ value, onChange, options, dark = true }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full outline-none cursor-pointer"
    style={{
      backgroundColor: dark ? C.bgElev : "transparent",
      color: dark ? C.cream : C.bgDeep,
      border: `1px solid ${dark ? C.border : "rgba(0,0,0,0.15)"}`,
      padding: "0.7rem 0.85rem",
      fontFamily: "'Manrope', sans-serif",
      fontSize: "0.92rem",
    }}
  >
    {options.map((o) => (
      <option key={o.value ?? o} value={o.value ?? o} style={{ background: C.bgElev }}>
        {o.label ?? o}
      </option>
    ))}
  </select>
);
