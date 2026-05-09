import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { TRANSLATIONS } from "./translations.js";
import { useData } from "../data/store.jsx";

const LanguageContext = createContext({
  lang: "en",
  dir: "ltr",
  setLang: () => {},
  t: (key) => key,
});

const DIR = { en: "ltr", ar: "rtl" };

function lookup(dict, path) {
  const parts = path.split(".");
  let cur = dict;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function LanguageProvider({ children, defaultLang = "en" }) {
  const [lang, setLang] = useState(defaultLang);
  // Site-content CMS overrides — operator-edited copy for the public site.
  // The DataProvider sits OUTSIDE this provider so we can safely read it here.
  const { siteContent } = useData();
  const overrides = siteContent?.textOverrides || {};

  useEffect(() => {
    const dir = DIR[lang] || "ltr";
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang]);

  // t("foo.bar") — checks operator-edited overrides first (these win across
  // all languages by design — translations stay machine-generated and the
  // CMS edit is treated as the canonical voice), then the active language,
  // falls back to English, then the key.
  const t = useCallback((key) => {
    const ov = overrides[key];
    if (ov != null && ov !== "") return ov;
    const fromLang = lookup(TRANSLATIONS[lang] || {}, key);
    if (fromLang != null) return fromLang;
    const fromEn = lookup(TRANSLATIONS.en, key);
    if (fromEn != null) return fromEn;
    return key;
  }, [lang, overrides]);

  const value = useMemo(() => ({
    lang,
    dir: DIR[lang] || "ltr",
    setLang,
    t,
  }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}

export function useT() {
  return useContext(LanguageContext).t;
}
