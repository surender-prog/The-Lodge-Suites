export const todayISO = () => new Date().toISOString().slice(0, 10);

export const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Locale-aware short date — falls back to en-GB if locale is missing.
export const fmtDate = (s, lang = "en") => {
  if (!s) return "";
  const d = new Date(s);
  const locale = lang === "ar" ? "ar-BH" : "en-GB";
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
};

export const nightsBetween = (a, b) => {
  if (!a || !b) return 0;
  const ms = new Date(b) - new Date(a);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
};
