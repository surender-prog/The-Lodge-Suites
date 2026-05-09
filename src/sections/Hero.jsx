import React, { useState } from "react";
import { Search, Sparkles, Star } from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG, useImg } from "../data/images.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { Field, Input, Select } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { inDays, todayISO } from "../utils/date.js";

export const Hero = ({ onSearch }) => {
  const t = useT();
  const heroImg = useImg("heroNight");
  // Calendar bounds: never let the operator pick a past date for either
  // check-in or check-out. The calendar uses these as `min` so the date
  // picker greys out anything earlier than today.
  const today = todayISO();
  // Default check-in = today, check-out = +1 night so the widget always
  // submits a stay of at least one night.
  const [checkIn,  setCheckIn]  = useState(today);
  const [checkOut, setCheckOut] = useState(inDays(1));
  const [adults,   setAdults]   = useState(2);
  const [children, setChildren] = useState(0);

  // Whenever check-in moves, ensure check-out is at least one night later.
  // (Native `min` on the date input is the visual gate; this function is
  // the data gate — together they guarantee a 1-night minimum.)
  const onCheckIn = (next) => {
    setCheckIn(next);
    if (!next) return;
    const nextOut = new Date(next); nextOut.setDate(nextOut.getDate() + 1);
    const minOutIso = nextOut.toISOString().slice(0, 10);
    if (!checkOut || checkOut <= next) setCheckOut(minOutIso);
  };
  // Check-out must be strictly after check-in. If the operator drags it
  // back past check-in, snap to check-in + 1.
  const onCheckOut = (next) => {
    if (next && checkIn && next <= checkIn) {
      const bump = new Date(checkIn); bump.setDate(bump.getDate() + 1);
      setCheckOut(bump.toISOString().slice(0, 10));
      return;
    }
    setCheckOut(next);
  };

  const submit = () => onSearch({ checkIn, checkOut, adults, children });
  // Smallest legal check-out — used as the date input's `min` so the picker
  // greys out check-in and earlier on the check-out calendar.
  const minCheckOut = checkIn ? (() => {
    const d = new Date(checkIn); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })() : today;

  return (
    <section className="relative min-h-screen flex flex-col" style={{ backgroundColor: C.bgDeep }}>
      <div className="absolute inset-0">
        <img src={heroImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{
          background: `linear-gradient(180deg, rgba(21,22,26,0.5) 0%, rgba(21,22,26,0.2) 35%, rgba(21,22,26,0.85) 100%)`
        }} />
        <Crosshatch opacity={0.07} />
      </div>

      <div className="relative flex-1 flex items-center pt-32 pb-12 px-6">
        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.42em", textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>
              <span style={{ borderBottom: `1px solid ${C.gold}`, paddingBottom: 4 }}>{t("common.location")}</span>
            </div>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(2.8rem, 6.5vw, 5.5rem)",
              fontWeight: 300,
              color: C.cream,
              lineHeight: 0.96,
              letterSpacing: "-0.015em",
              marginBottom: 18,
            }}>
              {t("hero.h1Line1")}<br />
              <span style={{ fontStyle: "italic", color: C.gold, fontWeight: 400 }}>{t("hero.h1Line2")}</span>
            </h1>
            <p style={{
              color: C.textOnDark,
              fontFamily: "'Manrope', sans-serif",
              fontSize: "1rem",
              lineHeight: 1.7,
              maxWidth: 520,
              opacity: 0.88,
            }}>
              {t("hero.body")}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-6" style={{ color: C.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", letterSpacing: "0.06em" }}>
              <div className="flex items-center gap-2">
                {[0,1,2,3,4].map((i) => <Star key={i} size={14} fill={C.gold} stroke="none" />)}
                <span style={{ marginInlineStart: 4 }}>{t("hero.rating")}</span>
              </div>
              <div>{t("hero.seventyTwo")}</div>
              <div>{t("hero.opened")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Booking widget bar */}
      <div className="relative pb-10 px-6">
        <div className="max-w-7xl mx-auto">
          <div
            className="grid grid-cols-1 md:grid-cols-5 gap-0"
            style={{
              backgroundColor: "rgba(30,32,36,0.92)",
              backdropFilter: "blur(16px)",
              border: `1px solid ${C.border}`,
            }}
          >
            <div className="md:col-span-1 p-5" style={{ borderInlineEnd: `1px solid ${C.border}` }}>
              <Field label={t("hero.fields.checkIn")}>
                <Input type="date" value={checkIn} onChange={onCheckIn} min={today} />
              </Field>
            </div>
            <div className="md:col-span-1 p-5" style={{ borderInlineEnd: `1px solid ${C.border}` }}>
              <Field label={t("hero.fields.checkOut")}>
                <Input type="date" value={checkOut} onChange={onCheckOut} min={minCheckOut} />
              </Field>
            </div>
            <div className="md:col-span-1 p-5" style={{ borderInlineEnd: `1px solid ${C.border}` }}>
              <Field label={t("hero.fields.adults")}>
                <Select value={adults} onChange={(v) => setAdults(+v)}
                  options={[1,2,3,4,5,6].map(n => ({ value: n, label: `${n} ${n === 1 ? t("common.adult") : t("common.adults")}` }))} />
              </Field>
            </div>
            <div className="md:col-span-1 p-5" style={{ borderInlineEnd: `1px solid ${C.border}` }}>
              <Field label={t("hero.fields.children")}>
                <Select value={children} onChange={(v) => setChildren(+v)}
                  options={[0,1,2,3,4].map(n => ({ value: n, label: `${n} ${n === 1 ? t("common.child") : t("common.children")}` }))} />
              </Field>
            </div>
            <button
              onClick={submit}
              className="md:col-span-1 flex items-center justify-center gap-3 transition-colors"
              style={{
                backgroundColor: C.gold,
                color: C.bgDeep,
                fontFamily: "'Manrope', sans-serif",
                fontWeight: 700,
                fontSize: "0.85rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                padding: "1.5rem",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.goldBright)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.gold)}
            >
              <Search size={18} /> {t("common.findSuite")}
            </button>
          </div>
          <div className="mt-3 text-center" style={{ color: C.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
            <Sparkles size={12} className="inline mr-1.5" style={{ color: C.gold }} />
            {t("hero.bestRate")}
          </div>
        </div>
      </div>
    </section>
  );
};
