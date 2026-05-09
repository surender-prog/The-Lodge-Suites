import React, { useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, Briefcase, Building2, CalendarDays, Check,
  CheckCircle2, Coins, FileText, Mail, Phone, Save, Trash2, User2, X, XCircle,
} from "lucide-react";
import { usePalette } from "./theme.jsx";

// ---------------------------------------------------------------------------
// RfpEditor — full-page drawer for managing a corporate RFP through the
// pipeline. Mirrors the visual language of ContractEditor: identity / term /
// rate / commercial / contact / notes cards on the left, sticky preview on
// the right.
//
// Stages: review → proposal → negotiate → await → won | lost
//   • "won" implies the RFP was converted into a contract — done via the
//     `onConvert` callback so the parent can spin up a draft agreement.
// ---------------------------------------------------------------------------

// Each stage gets a distinct hex base colour so the operator can scan a long
// pipeline list at a glance. The tinted-fill pill (12% alpha bg + solid 1px
// border + base-colour text) stays readable on both light and dark themes.
const STAGES = [
  { value: "review",    label: "In review",   base: "#2563EB", hint: "Sales reviewing the RFP"            }, // blue
  { value: "proposal",  label: "Proposal",    base: "#7C3AED", hint: "Proposal sent · awaiting reaction"  }, // purple
  { value: "negotiate", label: "Negotiating", base: "#D97706", hint: "Active rate / term negotiation"     }, // amber
  { value: "await",     label: "Awaiting",    base: "#0891B2", hint: "Final client decision pending"      }, // teal
  { value: "won",       label: "Won",         base: "#16A34A", hint: "Converted to contract"              }, // green
  { value: "lost",      label: "Lost",        base: "#DC2626", hint: "Did not convert"                    }, // red
];
const STAGE_BY_VALUE = Object.fromEntries(STAGES.map(s => [s.value, s]));

// Pre-built pill style for any stage — drop into <span style={stagePillStyle(s)}>.
export function stagePillStyle(stageValue) {
  const s = STAGE_BY_VALUE[stageValue];
  const base = s?.base || "#6B7280";
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "'Manrope', sans-serif",
    fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase",
    fontWeight: 700, whiteSpace: "nowrap",
    padding: "3px 9px",
    color: base,
    backgroundColor: `${base}1F`, // ~12% alpha
    border: `1px solid ${base}`,
  };
}

export function stageDotStyle(stageValue) {
  const s = STAGE_BY_VALUE[stageValue];
  const base = s?.base || "#6B7280";
  return {
    width: 7, height: 7, borderRadius: 999,
    backgroundColor: base, display: "inline-block", flexShrink: 0,
  };
}

const INDUSTRIES = [
  "Banking & Finance", "Government", "Oil & Gas", "Aviation", "Consulting",
  "Technology", "Healthcare", "Industrial", "Consumer Goods", "Investment", "Other",
];

const PAYMENT_TERMS = ["On departure", "Net 0", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"];

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
const fmtDateShort = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export function RfpEditor({ open, onClose, rfp, onSave, onRemove, onConvert }) {
  const p = usePalette();
  const [draft, setDraft] = useState(rfp);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setInclusion = (key, on) => setDraft((d) => ({ ...d, inclusions: { ...(d.inclusions || {}), [key]: on } }));

  const valid = !!draft.account?.trim() && !!draft.id?.trim();

  const ageDays = useMemo(() => {
    if (!draft.receivedOn) return 0;
    return Math.max(0, daysBetween(draft.receivedOn, todayISO()));
  }, [draft.receivedOn]);
  const dueIn = useMemo(() => {
    if (!draft.dueDate) return null;
    return daysBetween(todayISO(), draft.dueDate);
  }, [draft.dueDate]);

  const stage = STAGE_BY_VALUE[draft.status] || STAGES[0];

  const save = () => {
    if (!valid) return;
    onSave?.(draft);
  };

  const remove = () => {
    if (!onRemove) return;
    if (!confirm(`Remove RFP "${draft.account || draft.id}"? This cannot be undone.`)) return;
    onRemove(draft.id);
  };

  const markLost = () => {
    if (!confirm(`Mark RFP "${draft.account || draft.id}" as lost? You can re-open it later.`)) return;
    set({ status: "lost" });
    onSave?.({ ...draft, status: "lost" });
  };

  const convertToContract = () => {
    if (!onConvert) return;
    onConvert(draft);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            {draft._new ? "New RFP" : "Manage RFP"} · {draft.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {draft.account || "Untitled corporate"}
          </div>
        </div>
        <button onClick={onClose}
          className="flex items-center gap-2"
          style={{
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
            fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        ><X size={14} /> Close</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left: form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Identity */}
              <RECard title="Identity" icon={Building2}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <REField label="Account name">
                    <REInput value={draft.account} onChange={(v) => set({ account: v })} placeholder="e.g. ALBA Aluminium" />
                  </REField>
                  <REField label="Industry">
                    <RESelect value={draft.industry || INDUSTRIES[0]} onChange={(v) => set({ industry: v })} options={INDUSTRIES} />
                  </REField>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <REField label="RFP ID">
                    <REInput value={draft.id} onChange={(v) => set({ id: v })} disabled={!draft._new} />
                  </REField>
                  <REField label="Stage">
                    <div className="flex flex-wrap gap-1.5">
                      {STAGES.map((s) => {
                        const active = draft.status === s.value;
                        return (
                          <button key={s.value} onClick={() => set({ status: s.value })} title={s.hint}
                            className="inline-flex items-center gap-2"
                            style={{
                              padding: "0.4rem 0.7rem",
                              backgroundColor: active ? `${s.base}1F` : "transparent",
                              border: `1px solid ${active ? s.base : p.border}`,
                              color: active ? s.base : p.textSecondary,
                              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = s.base; e.currentTarget.style.borderColor = s.base; } }}
                            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
                          >
                            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: s.base, display: "inline-block" }} />
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </REField>
                </div>
              </RECard>

              {/* Term */}
              <RECard title="Timeline" icon={CalendarDays}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <REField label="Received on"><REInput type="date" value={draft.receivedOn} onChange={(v) => set({ receivedOn: v })} /></REField>
                  <REField label="Response due"><REInput type="date" value={draft.dueDate} onChange={(v) => set({ dueDate: v })} /></REField>
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textMuted }}>
                  <span>Age: <strong style={{ color: ageDays > 10 ? p.warn : p.textPrimary }}>{ageDays} day{ageDays === 1 ? "" : "s"}</strong></span>
                  <span style={{ color: p.textDim }}>·</span>
                  <span>
                    {dueIn === null ? <em>No due date</em> :
                      dueIn > 0 ? <>Due in <strong style={{ color: dueIn <= 2 ? p.warn : p.textPrimary }}>{dueIn} day{dueIn === 1 ? "" : "s"}</strong></> :
                      dueIn === 0 ? <strong style={{ color: p.warn }}>Due today</strong> :
                      <strong style={{ color: p.danger }}>Overdue {Math.abs(dueIn)} day{Math.abs(dueIn) === 1 ? "" : "s"}</strong>}
                  </span>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <REField label="Eligible from"><REInput type="date" value={draft.eligibleFrom} onChange={(v) => set({ eligibleFrom: v })} /></REField>
                  <REField label="Eligible to"><REInput type="date" value={draft.eligibleTo} onChange={(v) => set({ eligibleTo: v })} /></REField>
                </div>
              </RECard>

              {/* Volume + commercial */}
              <RECard title="Volume & commercial" icon={Coins}>
                <div className="grid sm:grid-cols-3 gap-4">
                  <REField label="Annual room-nights"><REInput type="number" value={draft.roomNights || 0} onChange={(v) => set({ roomNights: Number(v) })} suffix="nights" /></REField>
                  <REField label="Estimated value"><REInput type="number" value={draft.estValue || 0} onChange={(v) => set({ estValue: Number(v) })} prefix="BHD" /></REField>
                  <REField label="Implied avg rate"><REInput type="number" value={(draft.roomNights || 0) > 0 ? Math.round((draft.estValue || 0) / draft.roomNights) : 0} onChange={() => {}} prefix="BHD" disabled /></REField>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <REField label="Max acceptable rate per night"><REInput type="number" value={draft.maxRate || 0} onChange={(v) => set({ maxRate: Number(v) })} prefix="BHD" /></REField>
                  <REField label="Payment terms requested">
                    <RESelect value={draft.paymentTerms || "Net 30"} onChange={(v) => set({ paymentTerms: v })} options={PAYMENT_TERMS} />
                  </REField>
                </div>
              </RECard>

              {/* Inclusions */}
              <RECard title="Required inclusions">
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "breakfast",     label: "Daily breakfast"          },
                    { key: "lateCheckOut",  label: "Guaranteed late check-out" },
                    { key: "parking",       label: "Parking"                  },
                    { key: "wifi",          label: "Wi-Fi"                    },
                    { key: "meetingRoom",   label: "Meeting room access"      },
                  ].map((it) => {
                    const on = !!(draft.inclusions && draft.inclusions[it.key]);
                    return (
                      <button key={it.key} onClick={() => setInclusion(it.key, !on)}
                        style={{
                          padding: "0.45rem 0.85rem",
                          border: `1px solid ${on ? p.accent : p.border}`,
                          backgroundColor: on ? `${p.accent}1F` : "transparent",
                          color: on ? p.accent : p.textSecondary,
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600,
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
                        }}
                      >
                        {on ? <Check size={12} /> : null}
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              </RECard>

              {/* Contact */}
              <RECard title="Submitted by" icon={User2}>
                <div className="grid sm:grid-cols-3 gap-4">
                  <REField label="Name"><REInput value={draft.contactName || ""} onChange={(v) => set({ contactName: v })} /></REField>
                  <REField label="Email"><REInput type="email" value={draft.contactEmail || ""} onChange={(v) => set({ contactEmail: v })} /></REField>
                  <REField label="Phone"><REInput value={draft.contactPhone || ""} onChange={(v) => set({ contactPhone: v })} placeholder="+973…" /></REField>
                </div>
              </RECard>

              {/* Requirements + notes */}
              <RECard title="Requirements" icon={FileText}>
                <REField label="Requirements (from RFP)">
                  <textarea
                    value={draft.requirements || ""}
                    onChange={(e) => set({ requirements: e.target.value })}
                    rows={3}
                    placeholder="Specific requests captured at submission — preferences, dietary, room layout, etc."
                    className="w-full outline-none"
                    style={{
                      backgroundColor: p.inputBg, color: p.textPrimary,
                      border: `1px solid ${p.border}`, padding: "0.7rem 0.85rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", resize: "vertical",
                    }}
                  />
                </REField>
                <div className="mt-4">
                  <REField label="Internal notes">
                    <textarea
                      value={draft.notes || ""}
                      onChange={(e) => set({ notes: e.target.value })}
                      rows={3}
                      placeholder="Internal sales notes, context, follow-up actions…"
                      className="w-full outline-none"
                      style={{
                        backgroundColor: p.inputBg, color: p.textPrimary,
                        border: `1px solid ${p.border}`, padding: "0.7rem 0.85rem",
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", resize: "vertical",
                      }}
                    />
                  </REField>
                </div>
              </RECard>
            </div>

            {/* Right: sticky summary */}
            <div className="lg:sticky lg:top-4 self-start">
              <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
                <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
                  <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
                    RFP summary
                  </div>
                  <span style={stagePillStyle(stage.value)}>
                    <span style={stageDotStyle(stage.value)} />
                    {stage.label}
                  </span>
                </div>
                <div className="p-5 space-y-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
                  <SummaryRow label="ID"     value={draft.id} mono accent />
                  <SummaryRow label="Account" value={draft.account || "—"} bold />
                  <SummaryRow label="Industry" value={draft.industry || "—"} />
                  <SummaryRow label="Volume" value={`${draft.roomNights || 0} room-nights`} />
                  <SummaryRow label="Est. value" value={`BHD ${(draft.estValue || 0).toLocaleString()}`} accent />
                  <SummaryRow label="Max rate" value={draft.maxRate ? `BHD ${draft.maxRate}/night` : "—"} />
                  <SummaryRow label="Payment" value={draft.paymentTerms || "—"} />
                  <SummaryRow label="Eligible" value={draft.eligibleFrom && draft.eligibleTo ? `${fmtDateShort(draft.eligibleFrom)} → ${fmtDateShort(draft.eligibleTo)}` : "—"} />
                </div>
                {(draft.contactName || draft.contactEmail || draft.contactPhone) && (
                  <div className="px-5 py-3 space-y-1.5" style={{ borderTop: `1px solid ${p.border}` }}>
                    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      Submitted by
                    </div>
                    {draft.contactName  && <div className="flex items-center gap-2" style={{ color: p.textPrimary, fontSize: "0.82rem" }}><User2 size={11} style={{ color: p.accent }} /> {draft.contactName}</div>}
                    {draft.contactEmail && <div className="flex items-center gap-2" style={{ color: p.textSecondary, fontSize: "0.78rem" }}><Mail size={11} style={{ color: p.accent }} /> {draft.contactEmail}</div>}
                    {draft.contactPhone && <div className="flex items-center gap-2" style={{ color: p.textSecondary, fontSize: "0.78rem" }}><Phone size={11} style={{ color: p.accent }} /> {draft.contactPhone}</div>}
                  </div>
                )}
                {/* Conversion CTA */}
                {draft.status !== "won" && draft.status !== "lost" && onConvert && (
                  <div className="px-5 py-4" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                      Pipeline action
                    </div>
                    <button onClick={convertToContract}
                      className="w-full inline-flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: p.success, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                        border: `1px solid ${p.success}`,
                        padding: "0.55rem 1rem",
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={12} /> Convert to contract <ArrowRight size={12} />
                    </button>
                    <p className="mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", lineHeight: 1.5 }}>
                      Marks the RFP as won and opens a draft corporate agreement pre-filled with the requested rates and terms.
                    </p>
                  </div>
                )}
                {draft.status === "won" && (
                  <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: `${p.success}10`, color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600 }}>
                    <CheckCircle2 size={13} /> Converted to contract
                  </div>
                )}
                {draft.status === "lost" && (
                  <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: `${p.danger}10`, color: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600 }}>
                    <XCircle size={13} /> Marked as lost
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-4 flex items-center justify-end gap-3 flex-shrink-0" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        {!draft._new && onRemove && (
          <>
            <button onClick={remove} className="inline-flex items-center gap-2"
              style={{
                color: p.danger, padding: "0.45rem 0.95rem", border: `1px solid ${p.border}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
            ><Trash2 size={11} /> Remove</button>
            <div className="flex-1" />
          </>
        )}
        {!draft._new && draft.status !== "lost" && draft.status !== "won" && (
          <button onClick={markLost}
            style={{
              color: p.warn, padding: "0.45rem 0.95rem", border: `1px solid ${p.border}`,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.warn; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
          ><XCircle size={11} className="inline mr-1" /> Mark lost</button>
        )}
        {!valid && (
          <span className="inline-flex items-center gap-1.5" style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
            <AlertCircle size={12} /> Account name and ID are required
          </span>
        )}
        <button onClick={onClose}
          style={{
            color: p.textMuted, padding: "0.45rem 0.95rem", border: `1px solid ${p.border}`,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
          }}>Cancel</button>
        <button onClick={save} disabled={!valid}
          style={{
            backgroundColor: valid ? p.accent : "transparent",
            color: valid ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textDim,
            border: `1px solid ${valid ? p.accent : p.border}`,
            padding: "0.55rem 1.2rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
            letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 8,
          }}><Save size={12} /> {draft._new ? "Create RFP" : "Save changes"}</button>
      </footer>
    </div>
  );
}

// Translate an RFP to the rough shape of a draft corporate agreement so the
// caller can hand it straight into ContractEditor.
export function rfpToContractDraft(rfp, existingIds = []) {
  const yr = new Date().getFullYear();
  const usedIds = new Set(existingIds);
  let n = 1;
  let id = `AGR-${yr}-${String(n).padStart(3, "0")}`;
  while (usedIds.has(id)) { n += 1; id = `AGR-${yr}-${String(n).padStart(3, "0")}`; }

  const maxRate = Number(rfp.maxRate || 0);
  // Spread the requested max-rate ceiling across the four room types using
  // the published rack-rate ratios so the operator gets a sensible starting
  // point. They can adjust in the editor.
  const ratios = { studio: 0.5, oneBed: 0.66, twoBed: 1.0, threeBed: 1.25 };
  const dailyRates = maxRate > 0
    ? {
        studio:   Math.round(maxRate * ratios.studio),
        oneBed:   Math.round(maxRate * ratios.oneBed),
        twoBed:   Math.round(maxRate * ratios.twoBed),
        threeBed: Math.round(maxRate * ratios.threeBed),
      }
    : { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 };

  return {
    id,
    account: rfp.account || "",
    industry: rfp.industry || "Other",
    signedOn: todayISO(),
    startsOn: rfp.eligibleFrom || todayISO(),
    endsOn: rfp.eligibleTo || addYearISO(rfp.eligibleFrom || todayISO(), 1),
    status: "draft",
    dailyRates,
    weekendRates: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    monthlyRates: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    weekendUpliftPct: 0, taxIncluded: false, accommodationFee: 0,
    inclusions: rfp.inclusions || { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    eventSupplements: [],
    cancellationPolicy: "Free cancellation up to 48h before arrival.",
    paymentTerms: rfp.paymentTerms || "Net 30",
    creditLimit: 0,
    pocName: rfp.contactName || "",
    pocEmail: rfp.contactEmail || "",
    pocPhone: rfp.contactPhone || "",
    notes: `Converted from ${rfp.id}.\n\nRequirements:\n${rfp.requirements || "—"}\n\nInternal notes:\n${rfp.notes || "—"}`,
    targetNights: rfp.roomNights || 0,
    ytdNights: 0, ytdSpend: 0,
    sourceRfpId: rfp.id,
    _new: true,
  };
}

function addYearISO(iso, years = 1) {
  const d = iso ? new Date(iso) : new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Local primitives — kept self-contained so this file doesn't depend on the
// admin/ui kit (different palette/path, different category).
// ---------------------------------------------------------------------------
function RECard({ title, icon: Icon, action, children }) {
  const p = usePalette();
  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          {Icon && <Icon size={13} />} {title}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function REField({ label, children }) {
  const p = usePalette();
  return (
    <label className="block">
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function REInput({ value, onChange, type = "text", placeholder, prefix, suffix, disabled }) {
  const p = usePalette();
  return (
    <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg, opacity: disabled ? 0.6 : 1 }}>
      {prefix && (
        <span className="flex items-center px-2.5" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", borderInlineEnd: `1px solid ${p.border}` }}>{prefix}</span>
      )}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 outline-none"
        style={{
          backgroundColor: "transparent", color: p.textPrimary,
          padding: "0.55rem 0.75rem", fontFamily: "'Manrope', sans-serif",
          fontSize: "0.86rem", border: "none", minWidth: 0,
        }}
      />
      {suffix && (
        <span className="flex items-center px-2.5" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", borderInlineStart: `1px solid ${p.border}` }}>{suffix}</span>
      )}
    </div>
  );
}

function RESelect({ value, onChange, options }) {
  const p = usePalette();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="outline-none cursor-pointer"
      style={{
        backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
        padding: "0.55rem 0.75rem", fontFamily: "'Manrope', sans-serif",
        fontSize: "0.86rem", width: "100%",
      }}>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function SummaryRow({ label, value, mono, bold, accent, muted }) {
  const p = usePalette();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: p.textMuted, fontSize: "0.72rem", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{
        color: muted ? p.textMuted : accent ? p.accent : p.textPrimary,
        fontWeight: bold || accent ? 700 : 500,
        fontFamily: mono ? "ui-monospace, 'SF Mono', Menlo, monospace" : undefined,
        fontVariantNumeric: "tabular-nums", textAlign: "end",
      }}>{value}</span>
    </div>
  );
}

export { STAGES as RFP_STAGES };
