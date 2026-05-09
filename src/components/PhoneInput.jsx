import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRIES, DEFAULT_COUNTRY_CODE, findCountryByCode, parsePhone } from "../data/countryCodes.js";

// ---------------------------------------------------------------------------
// PhoneInput — reusable phone-number field with a country-code picker on
// the left. Bahrain (+973) is the default; the GCC sits above the rest of
// the world under a "Preferred" header. The picker has typeahead search
// so the long tail stays usable.
//
// Storage shape: a single string like "+973 12345678" that callers
// continue to read directly. The component splits / re-joins it
// internally via `parsePhone` and the local national-number field, so
// existing form state doesn't need a migration.
//
// Theming: pass `dark` to render the dropdown on the dark booking-modal
// surface; otherwise it uses the cream/paper light theme that matches
// the EditorialPage forms (RFP / Join).
// ---------------------------------------------------------------------------
export function PhoneInput({
  value, onChange,
  placeholder = "8-digit number",
  dark = false,
  defaultCountry = DEFAULT_COUNTRY_CODE,
  className = "",
}) {
  // Resolve the initial country + national portion from whatever the
  // caller's existing value looks like. Falls back to the default
  // country (Bahrain) when the value is empty.
  const initial = useMemo(() => {
    if (!value) return { country: findCountryByCode(defaultCountry), national: "" };
    return parsePhone(value);
  }, [value, defaultCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  const [country, setCountry] = useState(initial.country);
  const [national, setNational] = useState(initial.national);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  // Re-sync internal state when the parent supplies a different value
  // (e.g. when a draft is loaded for editing). Avoids ping-pong by only
  // updating when the parent value diverges from what we'd emit.
  useEffect(() => {
    const composed = `${country.dial} ${national}`.trim();
    if ((value || "").trim() === composed) return;
    if (!value) {
      setCountry(findCountryByCode(defaultCountry));
      setNational("");
      return;
    }
    const next = parsePhone(value);
    setCountry(next.country);
    setNational(next.national);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside-click + Esc close the picker, matching the rest of the
  // combobox patterns across the app.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown",   onKey);
    // Auto-focus the search box for fast typeahead.
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown",   onKey);
    };
  }, [open]);

  const emit = (c, n) => onChange?.(`${c.dial} ${n}`.trim());
  const pickCountry = (c) => {
    setCountry(c);
    setOpen(false);
    setQuery("");
    emit(c, national);
  };
  const setNumber = (raw) => {
    // Strip any leading "+" and dial-code the user might be re-typing,
    // so the field stays the local part only.
    const clean = String(raw || "").replace(/^\+\d+\s*/, "");
    setNational(clean);
    emit(country, clean);
  };

  // Filtered list — split into Preferred (GCC) and Rest, both filtered
  // by the search query. Searches across name, ISO code, and dial code.
  const ql = query.trim().toLowerCase();
  const matches = (c) =>
    !ql ||
    c.name.toLowerCase().includes(ql) ||
    c.code.toLowerCase().includes(ql) ||
    c.dial.replace("+", "").includes(ql.replace("+", ""));
  const gcc  = COUNTRIES.filter((c) => c.gcc && matches(c));
  const rest = COUNTRIES.filter((c) => !c.gcc && matches(c));

  // Theme — light variant uses cream/paper background, dark variant
  // mirrors the booking modal's dark-on-light field treatment.
  const t = dark ? darkTheme : lightTheme;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex" style={{ border: `1px solid ${t.border}`, backgroundColor: t.bg }}>
        {/* Country trigger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 flex-shrink-0"
          style={{
            padding: "0.55rem 0.7rem",
            backgroundColor: "transparent", color: t.text,
            borderInlineEnd: `1px solid ${t.border}`,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
            cursor: "pointer", lineHeight: 1.2,
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={`${country.name} (${country.dial})`}
        >
          <span style={{ fontSize: "1.05rem" }} aria-hidden="true">{country.flag}</span>
          <span style={{ fontWeight: 600 }}>{country.dial}</span>
          <ChevronDown size={11} style={{ color: t.muted, transition: "transform 160ms", transform: open ? "rotate(180deg)" : "none" }} />
        </button>

        {/* National number */}
        <input
          type="tel"
          inputMode="tel"
          value={national}
          onChange={(e) => setNumber(e.target.value)}
          placeholder={placeholder}
          className="flex-1 outline-none"
          style={{
            backgroundColor: "transparent", color: t.text,
            padding: "0.55rem 0.7rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
            border: "none", minWidth: 0,
          }}
        />
      </div>

      {/* Picker panel */}
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
                  <Row key={c.code} c={c} t={t} active={c.code === country.code} onClick={() => pickCountry(c)} />
                ))}
              </>
            )}
            {rest.length > 0 && (
              <>
                <SectionHeader label="All countries" t={t} />
                {rest.map((c) => (
                  <Row key={c.code} c={c} t={t} active={c.code === country.code} onClick={() => pickCountry(c)} />
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

// Light + dark themes — chosen so the picker integrates with the cream
// EditorialPage surface (light) and the dark booking-modal panel (dark).
const lightTheme = {
  bg:       "#FFFFFF",
  panelBg:  "#FFFFFF",
  text:     "#15161A",
  muted:    "#6B665C",
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
  border:   "rgba(255,255,255,0.18)",
  headerBg: "#15161A",
  activeBg: "rgba(201,169,97,0.20)",
  hoverBg:  "rgba(255,255,255,0.06)",
};
