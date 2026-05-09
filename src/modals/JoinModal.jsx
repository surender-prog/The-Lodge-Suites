import React, { useState } from "react";
import { Crown, X } from "lucide-react";
import { C } from "../data/tokens.js";
import { Field, GoldBtn, Input } from "../components/primitives.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData } from "../data/store.jsx";

export const JoinModal = ({ open, onClose }) => {
  const t = useT();
  const { addMember } = useData();
  const [data, setData] = useState({ name: "", email: "", phone: "", country: "Bahrain" });
  const [done, setDone] = useState(false);
  const [memberId, setMemberId] = useState(null);

  if (!open) return null;
  const submit = () => {
    // Persist the new Silver-tier member. addMember writes both to local
    // state (so the booking modal's email-match auto-detect picks it up
    // immediately) and to Supabase (anon insert allowed by RLS).
    const saved = addMember({
      name: data.name?.trim(),
      email: data.email?.trim().toLowerCase(),
      phone: data.phone,
      country: data.country,
      tier: "silver",
    });
    setMemberId(saved?.id || null);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg" style={{ backgroundColor: C.bgDeep, border: `1px solid ${C.gold}` }}>
          <div className="p-6 flex justify-between items-center" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>{t("join.label")}</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: C.cream, fontStyle: "italic" }}>{t("join.title")}</div>
            </div>
            <button onClick={onClose} style={{ color: C.textMuted }}><X size={22} /></button>
          </div>
          <div className="p-7">
            {done ? (
              <div className="text-center py-6">
                <div className="inline-flex items-center justify-center mb-4" style={{ width: 70, height: 70, borderRadius: "50%", backgroundColor: "rgba(201,169,97,0.15)", border: `1px solid ${C.gold}` }}>
                  <Crown size={32} style={{ color: C.gold }} />
                </div>
                <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.8rem", color: C.cream, marginTop: 8 }}>{t("join.successTitle")}</h4>
                <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textMuted, fontSize: "0.88rem", marginTop: 6, lineHeight: 1.6 }}>
                  {t("join.successBody1")} <span style={{ color: C.gold, fontWeight: 600, direction: "ltr", display: "inline-block" }}>{memberId || "—"}</span>. {t("join.successBody2")}
                </p>
                <div className="mt-6"><GoldBtn onClick={onClose}>{t("join.startBrowsing")}</GoldBtn></div>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label={t("join.fields.name")}><Input value={data.name} onChange={(v) => setData({ ...data, name: v })} /></Field>
                <Field label={t("join.fields.email")}><Input type="email" value={data.email} onChange={(v) => setData({ ...data, email: v })} /></Field>
                <Field label={t("join.fields.phone")}>
                  <PhoneInput dark value={data.phone} onChange={(v) => setData({ ...data, phone: v })} />
                </Field>
                <Field label={t("join.fields.country")}><Input value={data.country} onChange={(v) => setData({ ...data, country: v })} /></Field>
                <div className="pt-3"><GoldBtn full onClick={submit}>{t("join.cta")}</GoldBtn></div>
                <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.72rem", textAlign: "center", lineHeight: 1.6 }}>
                  {t("join.tos")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
