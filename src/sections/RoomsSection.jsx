import React, { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { C } from "../data/tokens.js";
import { Crosshatch } from "../components/Crosshatch.jsx";
import { GoldBtn, SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData } from "../data/store.jsx";

export const RoomsSection = ({ onBookRoom }) => {
  const t = useT();
  const { rooms: ROOMS } = useData();
  const [active, setActive] = useState(ROOMS[1]?.id || ROOMS[0]?.id);
  const room = ROOMS.find((r) => r.id === active) || ROOMS[0];
  if (!room) return null;
  const meta = (id) => ({
    name:        t(`rooms.${id}.name`),
    short:       t(`rooms.${id}.short`),
    description: t(`rooms.${id}.description`),
    features:    t(`rooms.${id}.features`),
  });
  const m = meta(room.id);

  return (
    <section id="rooms" className="py-24 px-6 relative" style={{ backgroundColor: C.bgCharcoal }}>
      <Crosshatch opacity={0.06} />
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center mb-14">
          <SectionLabel light>{t("rooms.label")}</SectionLabel>
          <SectionTitle light italic={t("rooms.titleB")}>{t("rooms.titleA")}</SectionTitle>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {ROOMS.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className="transition-all"
              style={{
                padding: "0.7rem 1.4rem",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.7rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: active === r.id ? C.bgDeep : C.textOnDark,
                backgroundColor: active === r.id ? C.gold : "transparent",
                border: `1px solid ${active === r.id ? C.gold : C.border}`,
              }}
            >
              {t(`rooms.${r.id}.name`)}
              {r.popular && <span style={{ marginInlineStart: 8, fontSize: "0.55rem", color: active === r.id ? C.bgDeep : C.gold }}>★</span>}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-0 min-h-[520px] relative" style={{ border: `1px solid ${C.border}` }}>
          <div className="relative overflow-hidden min-h-[400px]">
            <img src={room.image} alt={m.name} className="w-full h-full object-cover absolute inset-0 transition-all duration-700" />
            <div className="absolute top-5 start-5 px-3 py-1.5" style={{ backgroundColor: C.bgDeep, color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
              {room.sqm} m² · {t("common.sleeps")} {room.occupancy}
            </div>
          </div>
          <div className="p-10 lg:p-14 flex flex-col" style={{ backgroundColor: C.bgElev }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.5rem", color: C.cream, fontWeight: 400, lineHeight: 1.05 }}>
              {m.name}
            </h3>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", color: C.gold, fontSize: "1.1rem", marginTop: 6 }}>
              {m.short}
            </p>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textOnDark, opacity: 0.8, fontSize: "0.92rem", lineHeight: 1.7, marginTop: 22 }}>
              {m.description}
            </p>
            <div className="mt-8 grid grid-cols-2 gap-y-3 gap-x-6">
              {(Array.isArray(m.features) ? m.features : []).map((f) => (
                <div key={f} className="flex items-center gap-2" style={{ color: C.textOnDark, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                  <Check size={14} style={{ color: C.gold, flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>
            <div className="mt-auto pt-10 flex items-end justify-between flex-wrap gap-4">
              <div>
                <div style={{ color: C.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>
                  {t("common.fromPerNight")}
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.6rem", color: C.gold, fontWeight: 500 }}>{t("common.bhd")} {room.price}</span>
                  <span style={{ color: C.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>{t("common.excl")}</span>
                </div>
              </div>
              <GoldBtn onClick={() => onBookRoom(room)}>{t("common.reserve")} <ArrowRight size={14} /></GoldBtn>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
