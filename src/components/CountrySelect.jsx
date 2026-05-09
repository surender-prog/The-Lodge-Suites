import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRIES, DEFAULT_COUNTRY_CODE, findCountryByCode } from "../data/countryCodes.js";

// ---------------------------------------------------------------------------
// CountrySelect — reusable country picker. Mirrors the PhoneInput's
// dropdown UX: Bahrain is the default, the rest of the GCC sits under a
// "Preferred · GCC" header, and the long tail of every other country
// follows alphabetically. Includes a typeahead search.
//
// Storage shape: a single ISO 3166-1 alpha-2 code ("BH"). The component
// exposes the resolved country object via its onChange so callers can
// also propagate dial codes / country names without re-looking them up.
// ---------------------------------------------------------------------------
export function CountrySelect({
  value,                         // ISO 3166-1 alpha-2 code, e.g. "BH"
  onChange,                      // (code: string, country: object) => void
  dark = false,
  placeholder = "Select country",
  className = "",
}) {
  const country = findCountryByCode(value || DEFAULT_COUNTRY_CODE);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown",   onKey);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown",   onKey);
    };
  }, [open]);

  const ql = query.trim().toLowerCase();
  const matches = (c) =>
    !ql ||
    c.name.toLowerCase().includes(ql) ||
    c.code.toLowerCase().includes(ql) ||
    c.dial.replace("+", "").includes(ql.replace("+", ""));
  const gcc  = COUNTRIES.filter((c) => c.gcc && matches(c));
  const rest = COUNTRIES.filter((c) => !c.gcc && matches(c));

  const pick = (c) => {
    onChange?.(c.code, c);
    setOpen(false);
    setQuery("");
  };

  const t = dark ? darkTheme : lightTheme;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2"
        style={{
          padding: "0.55rem 0.7rem",
          backgroundColor: t.bg, color: value ? t.text : t.muted,
          border: `1px solid ${open ? t.accent : t.border}`,
          fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
          cursor: "pointer", lineHeight: 1.2,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {country ? (
          <>
            <span style={{ fontSize: "1.05rem", flexShrink: 0 }} aria-hidden="true">{country.flag}</span>
            <span className="flex-1 min-w-0 text-start" style={{
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{country.name}</span>
            <span style={{ color: t.muted, fontVariantNumeric: "tabular-nums", fontSize: "0.78rem" }}>{country.dial}</span>
          </>
        ) : (
          <span className="flex-1 min-w-0 text-start" style={{ color: t.muted }}>{placeholder}</span>
        )}
        <ChevronDown size={12} style={{
          color: t.muted,
          transition: "transform 160ms",
          transform: open ? "rotate(180deg)" : "none",
          flexShrink: 0,
        }} />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1"
          style={{
            insetInlineStart: 0,
            width: "min(380px, 100%)",
            backgroundColor: t.panelBg,
            border: `1px solid ${t.border}`,
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
          }}
          role="listbox"
        >
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center" style={{ border: `1px solid ${t.border}`, backgroundColor: t.bg }}>
              <Search size={13} style={{ color: t.muted, marginInlineStart: 10 }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or dial code…"
                className="flex-1 outline-none"
                style={{
                  backgroundColor: "transparent", color: t.text,
                  padding: "0.5rem 0.65rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                  border: "none", minWidth: 0,
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {gcc.length === 0 && rest.length === 0 && (
              <div className="px-4 py-6 text-center" style={{ color: t.muted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                No matches.
              </div>
            )}
            {gcc.length > 0 && (
              <>
                <SectionHeader label="Preferred · GCC" t={t} />
                {gcc.map((c) => (
                  <Row key={c.code} c={c} t={t} active={c.code === country?.code} onClick={() => pick(c)} />
                ))}
              </>
            )}
            {rest.length > 0 && (
              <>
                <SectionHeader label="All countries" t={t} />
                {rest.map((c) => (
                  <Row key={c.code} c={c} t={t} active={c.code === country?.code} onClick={() => pick(c)} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, t }) {
  return (
    <div
      style={{
        padding: "8px 14px 4px",
        color: t.muted, fontFamily: "'Manrope', sans-serif",
        fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
        backgroundColor: t.headerBg,
      }}
    >
      {label}
    </div>
  );
}

function Row({ c, t, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start flex items-center gap-2 px-3 py-2"
      style={{
        backgroundColor: active ? t.activeBg : "transparent",
        border: "none",
        borderBottom: `1px solid ${t.border}`,
        cursor: "pointer", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
        color: t.text,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = t.hoverBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
      role="option"
      aria-selected={active}
    >
      <span style={{ fontSize: "1.05rem", flexShrink: 0 }} aria-hidden="true">{c.flag}</span>
      <span className="flex-1 min-w-0" style={{
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{c.name}</span>
      <span style={{ color: t.muted, fontVariantNumeric: "tabular-nums", fontSize: "0.82rem" }}>{c.dial}</span>
    </button>
  );
}

// Themes mirror the PhoneInput so the two pickers visually agree when
// stacked side-by-side.
const lightTheme = {
  bg:       "#FFFFFF",
  panelBg:  "#FFFFFF",
  text:     "#15161A",
  muted:    "#6B665C",
  accent:   "#9A7E40",
  border:   "rgba(0,0,0,0.14)",
  headerBg: "#F5F1E8",
  activeBg: "rgba(201,169,97,0.14)",
  hoverBg:  "rgba(0,0,0,0.04)",
};
const darkTheme = {
  bg:       "transparent",
  panelBg:  "#1F2024",
  text:     "#F5F1E8",
  muted:    "#9A9489",
  accent:   "#C9A961",
  border:   "rgba(255,255,255,0.18)",
  headerBg: "#15161A",
  activeBg: "rgba(201,169,97,0.20)",
  hoverBg:  "rgba(255,255,255,0.06)",
};
