import React, { createContext, useContext, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { C } from "../../data/tokens.js";
import { useT } from "../../i18n/LanguageContext.jsx";

// Portal-scoped theme. The marketing site stays dark/gold; only the partner
// portal modal swaps surfaces and text contrast based on this context.
const PortalThemeContext = createContext({
  theme: "light",
  setTheme: () => {},
  palette: {},
});

const DARK = {
  bgPage:       C.bgDeep,
  bgPanel:      C.bgElev,
  bgPanelAlt:   C.bgPanel,
  bgHover:      "rgba(201,169,97,0.06)",
  bgActiveTab:  C.bgCharcoal,
  border:       C.border,
  borderStrong: "rgba(201,169,97,0.32)",
  textPrimary:  C.cream,
  textSecondary:C.textOnDark,
  textMuted:    C.textMuted,
  textDim:      C.textDim,
  accent:       C.gold,
  accentBright: C.goldBright,
  accentDeep:   C.goldDeep,
  success:      C.success,
  warn:         C.warn,
  danger:       C.danger,
  cellBase:     C.bgPanel,
  inputBg:      C.bgElev,
};

const LIGHT = {
  bgPage:       "#FAF7F0",
  bgPanel:      "#FFFFFF",
  bgPanelAlt:   "#F5F1E8",
  bgHover:      "rgba(154,126,64,0.06)",
  bgActiveTab:  "#F5F1E8",
  border:       "rgba(154,126,64,0.20)",
  borderStrong: "rgba(154,126,64,0.45)",
  textPrimary:  "#15161A",
  textSecondary:"#26282E",
  textMuted:    "#6B665C",
  textDim:      "#9B9588",
  accent:       "#9A7E40", // goldDeep — better contrast on white
  accentBright: C.gold,
  accentDeep:   "#7A6230",
  success:      "#5C8A4E",
  warn:         "#B8852E",
  danger:       "#9A3A30",
  cellBase:     "#F0EBDD",
  inputBg:      "#FFFFFF",
};

const THEMES = { light: LIGHT, dark: DARK };

export function PortalThemeProvider({ children, defaultTheme = "light" }) {
  const [theme, setTheme] = useState(defaultTheme);
  const value = useMemo(() => {
    const base = THEMES[theme] || LIGHT;
    // Stamp the theme name onto the palette so components can branch on it
    // without a second hook call (rgba ramps in Heatmap need this).
    return { theme, setTheme, palette: { ...base, theme } };
  }, [theme]);
  return <PortalThemeContext.Provider value={value}>{children}</PortalThemeContext.Provider>;
}

export function usePortalTheme() {
  return useContext(PortalThemeContext);
}

// Convenience: returns just the palette object — the most common need.
export function usePalette() {
  return useContext(PortalThemeContext).palette;
}

// Theme toggle button — sits in the portal header next to the close X.
export function ThemeToggle() {
  const t = useT();
  const { theme, setTheme, palette: p } = usePortalTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="flex items-center gap-2 transition-colors flex-shrink-0"
      style={{
        // Square icon-only on mobile, full pill with label on sm+. The
        // sm:px-3 / py override below keeps the desktop look intact.
        padding: "0.45rem",
        border: `1px solid ${p.border}`,
        color: p.textMuted,
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.66rem",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        fontWeight: 600,
        cursor: "pointer",
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = p.accent;
        e.currentTarget.style.borderColor = p.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = p.textMuted;
        e.currentTarget.style.borderColor = p.border;
      }}
    >
      {theme === "light" ? <Sun size={13} /> : <Moon size={13} />}
      {/* Label is hidden on mobile so the header doesn't overflow on
          small viewports — the icon alone communicates the toggle. */}
      <span className="hidden sm:inline">
        {theme === "light" ? t("portal.theme.light") : t("portal.theme.dark")}
      </span>
    </button>
  );
}
