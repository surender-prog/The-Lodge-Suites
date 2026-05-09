import React, { useMemo, useState } from "react";
import {
  ArrowRight, BedDouble, Briefcase, Building2, Check, CheckCircle2, ChevronLeft,
  ChevronRight, Coins, Compass, Copy, Download, Edit2, Eye, FileCheck, FileText, Filter,
  Mail, Percent, Phone, Plus, Save, ScrollText, Search, Send, Target, Telescope, TrendingUp,
  User2, X, XCircle, Zap,
} from "lucide-react";
import { Field, GoldBtn, Input, Select } from "../../components/primitives.jsx";
import { useT } from "../../i18n/LanguageContext.jsx";
import { useData } from "../../data/store.jsx";
import { usePalette } from "./theme.jsx";
import { ContractEditor, defaultCorporateDraft } from "./ContractEditor.jsx";
import { ContractPreviewModal, downloadContract, emailContract } from "./ContractDocument.jsx";
import { RfpEditor, rfpToContractDraft, RFP_STAGES, stagePillStyle, stageDotStyle } from "./RfpEditor.jsx";
import { CorporateWorkspaceDrawer } from "./CorporateWorkspace.jsx";
import { CorporateBookingDrawer } from "./CorporateBookingDrawer.jsx";
import { ProspectExplorerDrawer } from "./ProspectExplorer.jsx";
import { Drawer, pushToast } from "./admin/ui.jsx";

function statusColor(p, status) {
  return ({
    review:    p.accent,
    proposal:  p.success,
    negotiate: p.warn,
    await:     p.textMuted,
    won:       p.success,
    lost:      p.danger,
  })[status] || p.textMuted;
}

const STAGE_LABEL = Object.fromEntries(RFP_STAGES.map(s => [s.value, s.label]));

const ageDays = (iso) => {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)));
};
const dueInDays = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

export const CorporateTab = () => {
  const t = useT();
  const p = usePalette();
  const {
    agreements, upsertAgreement, removeAgreement,
    rfps, addRfp, upsertRfp, removeRfp,
    prospects, hotelInfo,
  } = useData();
  const [view, setView] = useState("dashboard");
  const [submitted, setSubmitted] = useState(false);
  const [editingAgr, setEditingAgr] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [workspaceFor, setWorkspaceFor] = useState(null);
  const [bookingFor, setBookingFor] = useState(null);
  const [editingRfp, setEditingRfp] = useState(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [prospectsOpen, setProspectsOpen] = useState(false);
  const [filter, setFilter] = useState({ status: "all", industry: "all", expiring: "all" });
  const [rfpFilter, setRfpFilter] = useState({ status: "active", search: "" });

  const [rfp, setRfp] = useState({
    company: "", contact: "", email: "", phone: "",
    industry: "Banking & Finance", roomNights: "", maxRate: "", paymentTerms: "30 days",
    requirements: "", lateCheckOut: false, breakfast: false, meetingRoom: false,
  });

  // ---- Derived analytics off the live store ------------------------------
  const totals = useMemo(() => {
    const ytdSpend     = agreements.reduce((s, a) => s + (a.ytdSpend || 0), 0);
    const ytdNights    = agreements.reduce((s, a) => s + (a.ytdNights || 0), 0);
    const targetNights = agreements.reduce((s, a) => s + (a.targetNights || 0), 0);
    const onTrack      = agreements.filter(a => (a.ytdNights / Math.max(1, a.targetNights)) >= monthsElapsedPct()).length;
    const expiringSoon = agreements.filter(a => {
      const d = daysUntil(a.endsOn);
      return d >= 0 && d <= 60;
    }).length;
    const expired = agreements.filter(a => daysUntil(a.endsOn) < 0).length;
    const totalAdr = ytdNights > 0 ? Math.round(ytdSpend / ytdNights) : 0;
    return { ytdSpend, ytdNights, targetNights, onTrack, expiringSoon, expired, totalAdr };
  }, [agreements]);

  const industryMix = useMemo(() => {
    const map = new Map();
    agreements.forEach((a) => {
      const k = a.industry || "Other";
      map.set(k, (map.get(k) || 0) + (a.ytdSpend || 0));
    });
    return [...map.entries()].map(([industry, spend]) => ({ industry, spend })).sort((a, b) => b.spend - a.spend);
  }, [agreements]);
  const topIndustry = industryMix[0]?.industry || "—";

  const filteredAgreements = useMemo(() => {
    return agreements.filter((a) => {
      if (filter.status !== "all" && a.status !== filter.status) return false;
      if (filter.industry !== "all" && a.industry !== filter.industry) return false;
      if (filter.expiring === "soon") {
        const d = daysUntil(a.endsOn);
        if (d < 0 || d > 60) return false;
      }
      if (filter.expiring === "ontrack") {
        const targetNow = Math.round((a.targetNights || 0) * monthsElapsedPct());
        const pace = targetNow === 0 ? 0 : (a.ytdNights || 0) / targetNow;
        if (pace < 0.95) return false;
      }
      return true;
    });
  }, [agreements, filter]);

  // RFP pipeline analytics — count by stage, value by stage, due/overdue.
  const rfpAnalytics = useMemo(() => {
    const active = rfps.filter(r => r.status !== "won" && r.status !== "lost");
    const byStage = {};
    RFP_STAGES.forEach(s => { byStage[s.value] = { count: 0, value: 0 }; });
    rfps.forEach(r => {
      const e = byStage[r.status];
      if (e) { e.count += 1; e.value += (r.estValue || 0); }
    });
    const totalValue = active.reduce((s, r) => s + (r.estValue || 0), 0);
    const totalNights = active.reduce((s, r) => s + (r.roomNights || 0), 0);
    const overdue = active.filter(r => {
      const d = dueInDays(r.dueDate);
      return d !== null && d < 0;
    }).length;
    const dueSoon = active.filter(r => {
      const d = dueInDays(r.dueDate);
      return d !== null && d >= 0 && d <= 2;
    }).length;
    const wonValue = byStage.won?.value || 0;
    const lostValue = byStage.lost?.value || 0;
    const conversion = (wonValue + lostValue) > 0 ? Math.round((wonValue / (wonValue + lostValue)) * 100) : 0;
    return { active, byStage, totalValue, totalNights, overdue, dueSoon, conversion };
  }, [rfps]);

  // Filter RFPs for the dashboard table.
  const filteredRfps = useMemo(() => {
    const q = rfpFilter.search.trim().toLowerCase();
    return rfps.filter((r) => {
      if (rfpFilter.status === "active" && (r.status === "won" || r.status === "lost")) return false;
      if (rfpFilter.status !== "active" && rfpFilter.status !== "all" && r.status !== rfpFilter.status) return false;
      if (!q) return true;
      const hay = `${r.account} ${r.id} ${r.industry || ""} ${r.contactName || ""}`.toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => {
      // Sort: overdue first, then by due-date asc, then by age desc
      const aDue = dueInDays(a.dueDate);
      const bDue = dueInDays(b.dueDate);
      if (aDue !== null && bDue !== null) return aDue - bDue;
      if (aDue !== null) return -1;
      if (bDue !== null) return 1;
      return ageDays(b.receivedOn) - ageDays(a.receivedOn);
    });
  }, [rfps, rfpFilter]);

  // KPI tile navigation — most jump to the contracts view with a pre-applied
  // filter; the RFP-related tiles smooth-scroll to the pipeline section.
  const goToContracts = (overrides = {}) => {
    setFilter((prev) => ({ status: "all", industry: "all", expiring: "all", ...prev, ...overrides }));
    setView("contracts");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };
  // The pipeline now lives in a dedicated full-page drawer so each RFP gets
  // proper breathing room. The dashboard surfaces a compact summary card and
  // the KPI tiles open the drawer directly.
  const openPipeline = (statusFilter) => {
    if (statusFilter) setRfpFilter((f) => ({ ...f, status: statusFilter }));
    setPipelineOpen(true);
  };

  const newRfp = () => {
    setEditingRfp({
      id: `RFP-${Math.floor(7000 + Math.random() * 2999)}`,
      account: "", industry: "Banking & Finance",
      status: "review",
      receivedOn: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
      contactName: "", contactEmail: "", contactPhone: "",
      roomNights: 0, estValue: 0, maxRate: 0, paymentTerms: "Net 30",
      eligibleFrom: "", eligibleTo: "",
      inclusions: { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
      requirements: "", notes: "",
      _new: true,
    });
  };

  const convertRfpToContract = (rfp) => {
    const draft = rfpToContractDraft(rfp, agreements.map(a => a.id));
    setEditingRfp(null);
    upsertRfp({ ...rfp, status: "won", convertedToId: draft.id });
    setEditingAgr(draft);
  };

  // Duplicate a template contract into a fresh draft so the operator can
  // assign it to a specific account without disturbing the template itself.
  const duplicateFromTemplate = (template) => {
    const yr = new Date().getFullYear();
    const usedIds = new Set(agreements.map(a => a.id));
    let n = agreements.length + 1;
    let id = `AGR-${yr}-${String(n).padStart(3, "0")}`;
    while (usedIds.has(id)) { n += 1; id = `AGR-${yr}-${String(n).padStart(3, "0")}`; }
    const { sourceDoc, isTemplate, _new, ...base } = template;
    setEditingAgr({
      ...base,
      id,
      account: "",
      status: "draft",
      signedOn: new Date().toISOString().slice(0, 10),
      ytdNights: 0, ytdSpend: 0,
      pocName: "", pocEmail: "", pocPhone: "",
      eventSupplements: (template.eventSupplements || []).map((evt) => ({
        ...evt,
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })),
      _new: true,
    });
  };

  const submitRFP = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setView("dashboard");
      setRfp({ company: "", contact: "", email: "", phone: "", industry: "Banking & Finance", roomNights: "", maxRate: "", paymentTerms: "30 days", requirements: "", lateCheckOut: false, breakfast: false, meetingRoom: false });
    }, 4000);
  };

  // ---- RFP submission view ----------------------------------------------
  if (view === "rfp") {
    return (
      <div>
        <button onClick={() => setView("dashboard")} className="mb-4 flex items-center gap-2" style={{ color: p.textMuted, fontSize: "0.78rem", letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif" }}>
          <ChevronLeft size={14} /> {t("portal.back")}
        </button>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: p.textPrimary, fontWeight: 500 }}>
          {t("portal.corporate.rfpTitle")}
        </h3>
        <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.92rem", marginTop: 6, maxWidth: 620 }}>
          {t("portal.corporate.rfpIntro")}
        </p>

        {submitted ? (
          <div className="mt-10 p-10 text-center" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.success}` }}>
            <Check size={50} style={{ color: p.success, margin: "0 auto" }} strokeWidth={1.5} />
            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: p.textPrimary, marginTop: 16 }}>{t("portal.corporate.rfpReceived")}</h4>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.9rem", marginTop: 6 }}>
              {t("portal.corporate.rfpReceivedBody").replace("{ref}", Math.random().toString(36).slice(2, 8).toUpperCase())}
            </p>
          </div>
        ) : (
          <form onSubmit={submitRFP} className="mt-8 grid md:grid-cols-2 gap-5">
            <Field label="Company name"><Input value={rfp.company} onChange={(v) => setRfp({ ...rfp, company: v })} /></Field>
            <Field label="Industry"><Select value={rfp.industry} onChange={(v) => setRfp({ ...rfp, industry: v })} options={["Banking & Finance","Government","Oil & Gas","Aviation","Consulting","Technology","Healthcare","Other"]} /></Field>
            <Field label="Primary contact"><Input value={rfp.contact} onChange={(v) => setRfp({ ...rfp, contact: v })} /></Field>
            <Field label="Email"><Input type="email" value={rfp.email} onChange={(v) => setRfp({ ...rfp, email: v })} /></Field>
            <Field label="Phone"><Input value={rfp.phone} onChange={(v) => setRfp({ ...rfp, phone: v })} /></Field>
            <Field label="Payment terms"><Select value={rfp.paymentTerms} onChange={(v) => setRfp({ ...rfp, paymentTerms: v })} options={["On departure","15 days","30 days","45 days","60 days"]} /></Field>
            <Field label="Estimated annual room-nights"><Input type="number" value={rfp.roomNights} onChange={(v) => setRfp({ ...rfp, roomNights: v })} placeholder="e.g. 200" /></Field>
            <Field label="Max acceptable rate (BHD)"><Input type="number" value={rfp.maxRate} onChange={(v) => setRfp({ ...rfp, maxRate: v })} placeholder="e.g. 50" /></Field>
            <div className="md:col-span-2">
              <Field label="Required inclusions">
                <div className="grid sm:grid-cols-3 gap-3 mt-1">
                  {[
                    { k: "breakfast",     l: "Breakfast" },
                    { k: "lateCheckOut",  l: "Late check-out" },
                    { k: "meetingRoom",   l: "Meeting room access" },
                  ].map((o) => (
                    <label key={o.k} className="flex items-center gap-2 p-3" style={{ border: `1px solid ${rfp[o.k] ? p.accent : p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={rfp[o.k]} onChange={(e) => setRfp({ ...rfp, [o.k]: e.target.checked })} /> {o.l}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Specific requirements / notes">
                <textarea value={rfp.requirements} onChange={(e) => setRfp({ ...rfp, requirements: e.target.value })} rows={4} className="w-full outline-none"
                  style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.7rem 0.85rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", resize: "none" }} />
              </Field>
            </div>
            <div className="md:col-span-2 flex justify-end pt-2 gap-3">
              <button type="button" onClick={() => setView("dashboard")} className="px-5" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>{t("common.cancel")}</button>
              <GoldBtn type="submit">{t("portal.corporate.submitRfp")} <Send size={14} /></GoldBtn>
            </div>
          </form>
        )}
      </div>
    );
  }

  // ---- Contracts view (replaces the old "netrate" view) ------------------
  if (view === "contracts") {
    const allIndustries = [...new Set(agreements.map(a => a.industry).filter(Boolean))];

    return (
      <div>
        <button onClick={() => setView("dashboard")} className="mb-4 flex items-center gap-2" style={{ color: p.textMuted, fontSize: "0.78rem", letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif" }}>
          <ChevronLeft size={14} /> {t("portal.back")}
        </button>
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: p.textPrimary, fontWeight: 500 }}>Corporate contracts</h3>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.9rem", marginTop: 4, maxWidth: 640 }}>
              All active and pending corporate agreements with their daily and monthly negotiated rates, terms, and YTD pacing against annual targets.
            </p>
          </div>
          <GoldBtn small onClick={() => setEditingAgr(defaultCorporateDraft(agreements.map(a => a.id)))}>
            <Plus size={13} /> New contract
          </GoldBtn>
        </div>

        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <SmallStat label="Active contracts" value={agreements.filter(a => a.status === "active").length} hint={`${agreements.length} total`} color={p.accent} />
          <SmallStat label="On-track this year" value={`${totals.onTrack}/${agreements.length}`} color={totals.onTrack === agreements.length ? p.success : p.warn} />
          <SmallStat label="YTD nights vs target" value={`${totals.ytdNights.toLocaleString()}/${totals.targetNights.toLocaleString()}`} hint={`${Math.round(totals.ytdNights / Math.max(1, totals.targetNights) * 100)}% delivered`} />
          <SmallStat label="YTD spend" value={`${t("common.bhd")} ${totals.ytdSpend.toLocaleString()}`} hint={`Avg ADR: ${t("common.bhd")} ${totals.totalAdr}`} color={p.success} />
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
          <span style={{ color: p.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, fontSize: "0.62rem" }}>Filter</span>
          <FilterPill active={filter.status === "all"} onClick={() => setFilter(f => ({ ...f, status: "all" }))} p={p}>All status</FilterPill>
          <FilterPill active={filter.status === "active"}    onClick={() => setFilter(f => ({ ...f, status: "active" }))}    color={p.success} p={p}>Active</FilterPill>
          <FilterPill active={filter.status === "draft"}     onClick={() => setFilter(f => ({ ...f, status: "draft" }))}     color={p.warn}    p={p}>Draft</FilterPill>
          <FilterPill active={filter.status === "review"}    onClick={() => setFilter(f => ({ ...f, status: "review" }))}    color={p.warn}    p={p}>In review</FilterPill>
          <FilterPill active={filter.status === "suspended"} onClick={() => setFilter(f => ({ ...f, status: "suspended" }))} color={p.danger}  p={p}>Suspended</FilterPill>
          <span style={{ color: p.textDim, padding: "0 4px" }}>·</span>
          <FilterPill active={filter.industry === "all"} onClick={() => setFilter(f => ({ ...f, industry: "all" }))} p={p}>All industries</FilterPill>
          {allIndustries.map((i) => (
            <FilterPill key={i} active={filter.industry === i} onClick={() => setFilter(f => ({ ...f, industry: i }))} p={p}>{i}</FilterPill>
          ))}
          <span style={{ color: p.textDim, padding: "0 4px" }}>·</span>
          <FilterPill active={filter.expiring === "all"}     onClick={() => setFilter(f => ({ ...f, expiring: "all"     }))} p={p}>All terms</FilterPill>
          <FilterPill active={filter.expiring === "soon"}    onClick={() => setFilter(f => ({ ...f, expiring: "soon"    }))} color={p.warn}    p={p}>Expiring ≤ 60d</FilterPill>
          <FilterPill active={filter.expiring === "ontrack"} onClick={() => setFilter(f => ({ ...f, expiring: "ontrack" }))} color={p.success} p={p}>On-track</FilterPill>
        </div>

        <div className="overflow-x-auto" style={{ border: `1px solid ${p.border}` }}>
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
            <thead>
              <tr style={{ backgroundColor: p.bgPanelAlt }}>
                {["Contract","Account","Daily rates · S/1/2/3","Monthly rates · S/1/2/3","Term","YTD nights / target","Pacing","Actions"].map(h => (
                  <th key={h} className="text-start px-3 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAgreements.map((a) => {
                const d  = a.dailyRates   || {};
                const m  = a.monthlyRates || {};
                const targetNow = Math.round((a.targetNights || 0) * monthsElapsedPct());
                const pace      = targetNow === 0 ? 0 : (a.ytdNights || 0) / targetNow;
                const onTrack   = pace >= 0.95;
                const paceColor = onTrack ? p.success : pace >= 0.7 ? p.warn : p.danger;
                const progPct   = Math.min(100, Math.round(((a.ytdNights || 0) / Math.max(1, a.targetNights)) * 100));
                const remaining = daysUntil(a.endsOn);
                const expiringSoon = remaining >= 0 && remaining <= 60;
                return (
                  <tr key={a.id} style={{ borderTop: `1px solid ${p.border}` }}>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap" }}>
                      <div style={{ color: p.accent, fontWeight: 700, fontSize: "0.74rem", letterSpacing: "0.05em" }}>{a.id}</div>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span style={{
                          fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                          padding: "1px 6px", display: "inline-block",
                          color: statusColorFromName(p, a.status), border: `1px solid ${statusColorFromName(p, a.status)}`,
                        }}>{a.status}</span>
                        {a.isTemplate && (
                          <span title="Template · duplicate to onboard a new corporate"
                            style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                              backgroundColor: p.accent, border: `1px solid ${p.accent}`,
                            }}>Template</span>
                        )}
                        {a.sourceDoc && (
                          <span title={`Imported from ${a.sourceDoc}`}
                            style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.accent, border: `1px solid ${p.accent}`,
                            }}>Imported</span>
                        )}
                        {(a.eventSupplements?.length || 0) > 0 && (
                          <span title="Event-period supplements set"
                            style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.warn, border: `1px solid ${p.warn}`,
                            }}>+{a.eventSupplements.length} evt</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => setWorkspaceFor(a)}
                        title="Open account workspace"
                        className="group text-start"
                        style={{ backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        <div className="group-hover:underline" style={{
                          fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem",
                          color: p.textPrimary,
                          textDecorationColor: p.accent,
                          textUnderlineOffset: 3,
                        }}>{a.account}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{a.industry || "—"}</div>
                      </button>
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {d.studio || 0} / {d.oneBed || 0} / {d.twoBed || 0} / {d.threeBed || 0}
                      {a.weekendRates && (a.weekendRates.studio || a.weekendRates.oneBed || a.weekendRates.twoBed || a.weekendRates.threeBed)
                        ? <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                            Wkd {a.weekendRates.studio || 0}/{a.weekendRates.oneBed || 0}/{a.weekendRates.twoBed || 0}/{a.weekendRates.threeBed || 0}
                          </div>
                        : null}
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: p.accent, fontWeight: 600 }}>
                      {(m.studio || 0).toLocaleString()} / {(m.oneBed || 0).toLocaleString()} / {(m.twoBed || 0).toLocaleString()} / {(m.threeBed || 0).toLocaleString()}
                      {Number(a.accommodationFee) > 0 && (
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, fontWeight: 500 }}>
                          + BHD {Number(a.accommodationFee).toFixed(3)} fee
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                      <div>{a.startsOn} → {a.endsOn}</div>
                      <div style={{ color: expiringSoon ? p.warn : p.textDim, fontSize: "0.7rem", marginTop: 2 }}>
                        {remaining < 0 ? `Expired ${Math.abs(remaining)}d ago` : `${remaining}d remaining`}
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ minWidth: 180 }}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{a.ytdNights || 0}</span>
                        <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>/ {a.targetNights || 0}</span>
                      </div>
                      <div className="mt-1 h-1" style={{ backgroundColor: p.border }}>
                        <div className="h-full" style={{ width: `${progPct}%`, backgroundColor: paceColor }} />
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap" }}>
                      <span style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px", color: paceColor, border: `1px solid ${paceColor}`,
                      }}>
                        {Math.round(pace * 100)}% of plan
                      </span>
                    </td>
                    <td className="px-3 py-3 text-end">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <RowIconBtn
                          title="Preview rate sheet"
                          icon={Eye}
                          onClick={() => setPreviewing(a)}
                          p={p}
                        />
                        <RowIconBtn
                          title="Download contract (HTML)"
                          icon={Download}
                          onClick={() => downloadContract(a, "corporate", { hotel: hotelInfo })}
                          p={p}
                        />
                        <RowIconBtn
                          title={a.pocEmail ? `Email to ${a.pocEmail}` : "No POC email on file"}
                          icon={Mail}
                          onClick={() => emailContract(a, "corporate", hotelInfo)}
                          p={p}
                          disabled={!a.pocEmail}
                        />
                        <RowIconBtn
                          title={`Book on behalf of ${a.account}`}
                          icon={BedDouble}
                          onClick={() => setBookingFor(a)}
                          p={p}
                          disabled={a.status !== "active"}
                        />
                        <button onClick={() => setWorkspaceFor(a)}
                          title="Open account workspace · Bookings · Invoices · Receipts · Statement"
                          className="inline-flex items-center gap-1.5 ml-1"
                          style={{ color: p.success, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.success}` }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Briefcase size={11} /> Account
                        </button>
                        {a.isTemplate ? (
                          <button onClick={() => duplicateFromTemplate(a)} className="inline-flex items-center gap-1.5 ml-1"
                            title="Duplicate template into a new draft contract"
                            style={{ color: p.theme === "light" ? "#FFFFFF" : "#15161A", backgroundColor: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.7rem", border: `1px solid ${p.accent}` }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                          >
                            <Copy size={11} /> Duplicate
                          </button>
                        ) : null}
                        <button onClick={() => setEditingAgr({ ...a })} className="inline-flex items-center gap-1.5 ml-1"
                          style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.accent}` }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Edit2 size={11} /> {a.isTemplate ? "Edit template" : "Manage"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAgreements.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                    No contracts match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editingAgr && (
          <ContractEditor
            open
            kind="corporate"
            contract={editingAgr}
            onClose={() => setEditingAgr(null)}
            onSave={(a) => { upsertAgreement(a); setEditingAgr(null); }}
            onRemove={(id) => { removeAgreement(id); setEditingAgr(null); }}
          />
        )}
        {previewing && (
          <ContractPreviewModal
            contract={previewing}
            kind="corporate"
            onClose={() => setPreviewing(null)}
          />
        )}
        {workspaceFor && (
          <CorporateWorkspaceDrawer
            agreement={workspaceFor}
            onClose={() => setWorkspaceFor(null)}
            onEditContract={() => { const a = workspaceFor; setWorkspaceFor(null); setEditingAgr({ ...a }); }}
            onPreviewContract={() => { const a = workspaceFor; setWorkspaceFor(null); setPreviewing(a); }}
          />
        )}
        {bookingFor && (
          <CorporateBookingDrawer
            agreement={bookingFor}
            onClose={() => setBookingFor(null)}
            onSaved={(b) => pushToast({ message: `Booking confirmed · ${b.id} for ${bookingFor.account}` })}
          />
        )}
      </div>
    );
  }

  // ---- Dashboard ---------------------------------------------------------
  const sortedTopAccounts = [...agreements]
    .sort((a, b) => (b.ytdSpend || 0) - (a.ytdSpend || 0))
    .slice(0, 5);
  const maxAccountSpend = sortedTopAccounts[0]?.ytdSpend || 1;
  const maxIndustrySpend = industryMix[0]?.spend || 1;

  return (
    <div>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.2rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
        {t("portal.corporate.dashTitle")}
      </h3>
      <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.92rem", marginTop: 6 }}>{t("portal.corporate.dashIntro")}</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-7">
        <KpiTile
          label={t("portal.corporate.stats.active")}
          value={agreements.length}
          trend={`${agreements.filter(a => a.status === "active").length} active`}
          icon={Building2}
          p={p}
          onClick={() => goToContracts({ status: "active", industry: "all", expiring: "all" })}
          ctaLabel="View contracts"
        />
        <KpiTile
          label={t("portal.corporate.stats.rfp")}
          value={rfpAnalytics.active.length}
          trend={`${rfpAnalytics.byStage.review?.count || 0} awaiting review`}
          icon={FileText}
          p={p}
          onClick={() => openPipeline("active")}
          ctaLabel="Open pipeline"
        />
        <KpiTile
          label={t("portal.corporate.stats.revenue")}
          value={`${t("common.bhd")} ${(totals.ytdSpend / 1000).toFixed(1)}k`}
          trend={`Avg ADR: ${t("common.bhd")} ${totals.totalAdr}`}
          icon={TrendingUp}
          p={p}
          onClick={() => goToContracts({ status: "all", industry: "all", expiring: "all" })}
          ctaLabel="View contracts"
        />
        <KpiTile
          label={t("portal.corporate.stats.avgDeal")}
          value={`${t("common.bhd")} ${Math.round(totals.ytdSpend / Math.max(1, agreements.length)).toLocaleString()}`}
          trend={`Top: ${topIndustry}`}
          icon={Coins}
          p={p}
          onClick={() => goToContracts({ status: "all", industry: topIndustry, expiring: "all" })}
          ctaLabel="View top industry"
        />
      </div>

      {/* Secondary KPIs — contract health */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <KpiTile
          label="Expiring in 60 days"
          value={totals.expiringSoon}
          trend={totals.expiringSoon > 0 ? "Action required" : "All current"}
          color={totals.expiringSoon > 0 ? p.warn : p.success}
          icon={Target}
          p={p}
          compact
          onClick={() => goToContracts({ status: "all", industry: "all", expiring: "soon" })}
          ctaLabel="View renewals"
        />
        <KpiTile
          label="On-track contracts"
          value={`${totals.onTrack}/${agreements.length}`}
          trend={`${Math.round((totals.onTrack / Math.max(1, agreements.length)) * 100)}% of book`}
          color={totals.onTrack === agreements.length ? p.success : p.warn}
          icon={Check}
          p={p}
          compact
          onClick={() => goToContracts({ status: "all", industry: "all", expiring: "ontrack" })}
          ctaLabel="View on-track"
        />
        <KpiTile
          label="Pipeline value"
          value={`${t("common.bhd")} ${(rfpAnalytics.totalValue / 1000).toFixed(1)}k`}
          trend={`${rfpAnalytics.totalNights} room-nights · ${rfpAnalytics.overdue} overdue`}
          icon={Briefcase}
          p={p}
          compact
          onClick={() => openPipeline("active")}
          ctaLabel="Open pipeline"
        />
        <KpiTile
          label="YTD nights"
          value={totals.ytdNights.toLocaleString()}
          trend={`${Math.round(totals.ytdNights / Math.max(1, totals.targetNights) * 100)}% of target`}
          icon={ScrollText}
          p={p}
          compact
          onClick={() => goToContracts({ status: "all", industry: "all", expiring: "all" })}
          ctaLabel="View pacing"
        />
      </div>

      {/* Action cards — Discover, RFP, Manage contracts, Industry breakdown */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <DashCard p={p} icon={Telescope}
          title="Discover prospects"
          body="Search the web (Google · LinkedIn · Maps) for new corporate accounts in Bahrain, the GCC and beyond. Capture, follow up and convert into RFPs."
          cta={`${prospects.filter(pr => pr.kind === "corporate").length} prospects in pipeline`}
          accentBg
          onClick={() => setProspectsOpen(true)}
        />
        <DashCard p={p} icon={FileCheck}
          title={t("portal.corporate.rfpCardTitle")}
          body={t("portal.corporate.rfpCardBody")}
          cta={t("portal.corporate.rfpCardCta")}
          onClick={() => setView("rfp")}
        />
        <DashCard p={p} icon={Percent}
          title="Manage contracts"
          body="Daily and monthly negotiated rates, term dates, payment terms, inclusions, credit limits and YTD pacing against annual targets."
          cta="Open contracts"
          onClick={() => setView("contracts")}
        />
        <DashCard p={p} icon={ScrollText}
          title="Industry breakdown"
          body={`Revenue mix across ${industryMix.length} industries · top performer is ${topIndustry}.`}
          cta="View ledger"
          onClick={() => setView("contracts")}
        />
      </div>

      {/* Pipeline + top accounts */}
      <div className="grid lg:grid-cols-3 gap-4 mt-7">
        <PipelineSummaryCard
          p={p}
          t={t}
          analytics={rfpAnalytics}
          onOpen={() => openPipeline()}
          onLogRfp={newRfp}
          onStageClick={(stageVal) => openPipeline(stageVal)}
        />

        <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              {t("portal.corporate.topAccountsHeading")}
            </div>
          </div>
          <div>
            {sortedTopAccounts.map((a, i) => {
              const pct = Math.round(((a.ytdSpend || 0) / maxAccountSpend) * 100);
              return (
                <button
                  key={a.id}
                  onClick={() => setWorkspaceFor(a)}
                  title={`Open ${a.account} workspace · bookings · invoices · receipts · users`}
                  className="block w-full text-start px-5 py-3 transition-colors"
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${p.border}`,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.02rem", color: p.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.account}</div>
                      <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 2 }}>{a.industry}</div>
                    </div>
                    <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {t("common.bhd")} {(a.ytdSpend || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 h-1" style={{ backgroundColor: p.border }}>
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: p.accent, transition: "width 400ms" }} />
                  </div>
                </button>
              );
            })}
            <button onClick={() => setView("contracts")} className="block w-full text-center px-5 py-3"
              style={{ borderTop: `1px solid ${p.border}`, color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              {t("portal.corporate.topAccountsLink")}
            </button>
          </div>
        </div>
      </div>

      {/* Industry mix */}
      {industryMix.length > 0 && (
        <div className="mt-7" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              <ScrollText size={13} /> Revenue by industry · YTD
            </div>
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
              {industryMix.length} industries
            </span>
          </div>
          <div className="p-5 grid md:grid-cols-2 gap-x-8 gap-y-3.5">
            {industryMix.map((row) => {
              const pct = Math.round((row.spend / maxIndustrySpend) * 100);
              const sharePct = totals.ytdSpend > 0 ? Math.round((row.spend / totals.ytdSpend) * 100) : 0;
              return (
                <div key={row.industry}>
                  <div className="flex items-baseline justify-between" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                    <span style={{ color: p.textPrimary, fontWeight: 600 }}>{row.industry}</span>
                    <span style={{ color: p.textMuted, fontSize: "0.74rem", fontVariantNumeric: "tabular-nums" }}>
                      <strong style={{ color: p.accent }}>{t("common.bhd")} {row.spend.toLocaleString()}</strong>
                      <span style={{ color: p.textDim, padding: "0 6px" }}>·</span>
                      {sharePct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1" style={{ backgroundColor: p.border }}>
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: p.accent }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editingAgr && (
        <ContractEditor
          open
          kind="corporate"
          contract={editingAgr}
          onClose={() => setEditingAgr(null)}
          onSave={(a) => { upsertAgreement(a); setEditingAgr(null); }}
          onRemove={(id) => { removeAgreement(id); setEditingAgr(null); }}
        />
      )}

      {editingRfp && (
        <RfpEditor
          open
          rfp={editingRfp}
          onClose={() => setEditingRfp(null)}
          onSave={(r) => {
            if (editingRfp._new) addRfp({ ...r, _new: undefined });
            else upsertRfp(r);
            setEditingRfp(null);
          }}
          onRemove={(id) => { removeRfp(id); setEditingRfp(null); }}
          onConvert={convertRfpToContract}
        />
      )}

      {workspaceFor && (
        <CorporateWorkspaceDrawer
          agreement={workspaceFor}
          onClose={() => setWorkspaceFor(null)}
          onEditContract={() => { const a = workspaceFor; setWorkspaceFor(null); setEditingAgr({ ...a }); }}
          onPreviewContract={() => { const a = workspaceFor; setWorkspaceFor(null); setPreviewing(a); }}
        />
      )}
      {/* Contract preview is reachable from the workspace drawer via "View
          contract" — the workspace mounts inside the dashboard branch as well
          as the contracts view, so the preview modal must be available here
          too. Without this mount, `setPreviewing(a)` set the state but no
          modal rendered, and clicking "View contract" appeared to do nothing. */}
      {previewing && (
        <ContractPreviewModal
          contract={previewing}
          kind="corporate"
          onClose={() => setPreviewing(null)}
        />
      )}
      {bookingFor && (
        <CorporateBookingDrawer
          agreement={bookingFor}
          onClose={() => setBookingFor(null)}
          onSaved={(b) => pushToast({ message: `Booking confirmed · ${b.id} for ${bookingFor.account}` })}
        />
      )}

      {prospectsOpen && (
        <ProspectExplorerDrawer
          open
          kind="corporate"
          onClose={() => setProspectsOpen(false)}
          onConvert={(prospect) => {
            // Spawn an RFP draft from the prospect so the operator can promote
            // a qualified lead into the negotiation pipeline immediately.
            setProspectsOpen(false);
            setEditingRfp({
              id: `RFP-${Math.floor(7000 + Math.random() * 2999)}`,
              account: prospect.name,
              industry: prospect.industry || "Banking & Finance",
              status: "review",
              receivedOn: new Date().toISOString().slice(0, 10),
              dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
              contactName: prospect.contactName || "",
              contactEmail: prospect.contactEmail || "",
              contactPhone: prospect.contactPhone || "",
              roomNights: 0, estValue: 0, maxRate: 0, paymentTerms: "Net 30",
              eligibleFrom: "", eligibleTo: "",
              inclusions: { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
              requirements: "",
              notes: `Converted from prospect ${prospect.id} · ${prospect.source || "Web research"}\n${prospect.notes || ""}`.trim(),
              _new: true,
            });
          }}
        />
      )}

      {pipelineOpen && (
        <RfpPipelineDrawer
          p={p}
          t={t}
          analytics={rfpAnalytics}
          rfps={filteredRfps}
          rfpFilter={rfpFilter}
          setRfpFilter={setRfpFilter}
          onClose={() => setPipelineOpen(false)}
          onLogRfp={() => { setPipelineOpen(false); newRfp(); }}
          onOpenRfp={(row) => { setPipelineOpen(false); setEditingRfp({ ...row }); }}
          onConvert={(row) => { setPipelineOpen(false); convertRfpToContract(row); }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function monthsElapsedPct() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd   = new Date(now.getFullYear() + 1, 0, 1);
  return (now - yearStart) / (yearEnd - yearStart);
}

function daysUntil(iso) {
  if (!iso) return 0;
  const ms = new Date(iso) - new Date();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function statusColorFromName(p, status) {
  return ({
    active:    p.success,
    draft:     p.warn,
    review:    p.warn,
    suspended: p.danger,
    expired:   p.textDim,
  })[status] || p.textMuted;
}

function SmallStat({ label, value, hint, color }) {
  const p = usePalette();
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function KpiTile({ label, value, trend, icon: Icon, color, p, compact, onClick, ctaLabel }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="p-5 group transition-all relative"
      style={{
        backgroundColor: p.bgPanel,
        border: `1px solid ${p.border}`,
        cursor: onClick ? "pointer" : "default",
        textAlign: "start",
        width: "100%",
        outline: "none",
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.backgroundColor = p.bgHover; } }}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.borderColor = p.border;  e.currentTarget.style.backgroundColor = p.bgPanel; } }}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon size={compact ? 16 : 20} style={{ color: p.accent, flexShrink: 0 }} />
        {trend && <div style={{ color: p.success, fontSize: "0.66rem", fontFamily: "'Manrope', sans-serif", textAlign: "end" }}>{trend}</div>}
      </div>
      <div className="mt-4" style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: compact ? "1.6rem" : "2rem",
        color: color || p.textPrimary, fontWeight: 500, lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div className="flex items-center justify-between gap-2" style={{ marginTop: 4 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>{label}</div>
        {onClick && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0"
            style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
          >
            {ctaLabel || "Open"} <ArrowRight size={11} />
          </div>
        )}
      </div>
    </Tag>
  );
}

function DashCard({ icon: Icon, title, body, cta, onClick, accentBg, p }) {
  return (
    <button onClick={onClick} className="text-start p-7 group transition-all"
      style={{
        backgroundColor: accentBg ? `${p.accent}10` : p.bgPanel,
        border: `1px solid ${accentBg ? p.accent : p.border}`,
      }}
    >
      <Icon size={26} style={{ color: p.accent }} />
      <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, marginTop: 14 }}>{title}</h4>
      <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.88rem", marginTop: 6, lineHeight: 1.6 }}>{body}</p>
      <div className="mt-4 flex items-center gap-2 group-hover:gap-3 transition-all" style={{ color: p.accent, fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        {cta} <ArrowRight size={14} />
      </div>
    </button>
  );
}

function FilterPill({ children, active, color, onClick, p }) {
  const c = color || p.accent;
  return (
    <button onClick={onClick}
      style={{
        padding: "0.3rem 0.7rem",
        backgroundColor: active ? `${c}1F` : "transparent",
        border: `1px solid ${active ? c : p.border}`,
        color: active ? c : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        whiteSpace: "nowrap", cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = c; e.currentTarget.style.color = c; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textSecondary; } }}
    >{children}</button>
  );
}

// PipelineSummaryCard — compact dashboard tile that surfaces the headline
// pipeline numbers (count, value, overdue, due-soon) plus the per-stage
// funnel as a clickable mini-strip. The full table moved into a dedicated
// full-page drawer so each row gets the room it deserves; this card is the
// entry point. It still spans `lg:col-span-2` so the dashboard layout (with
// Top Accounts to the right) stays balanced.
function PipelineSummaryCard({ p, t, analytics, onOpen, onLogRfp, onStageClick }) {
  return (
    <div
      id="rfps-in-flight"
      className="lg:col-span-2 flex flex-col"
      style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, scrollMarginTop: 24 }}
    >
      {/* Header row — total/value/overdue + Open + Log buttons */}
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <Briefcase size={13} /> {t("portal.corporate.pipelineHeading")}
          </div>
          <span style={{ color: p.textMuted, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif" }}>
            {analytics.active.length} · {t("common.bhd")} {(analytics.totalValue / 1000).toFixed(1)}k value
            {analytics.overdue > 0 && <span style={{ color: p.danger, marginInlineStart: 8, fontWeight: 700 }}>· {analytics.overdue} overdue</span>}
            {analytics.dueSoon > 0 && <span style={{ color: p.warn, marginInlineStart: 8, fontWeight: 700 }}>· {analytics.dueSoon} due ≤ 2d</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLogRfp}
            className="inline-flex items-center gap-1.5"
            style={{
              backgroundColor: "transparent", color: p.textSecondary,
              border: `1px solid ${p.border}`, padding: "0.4rem 0.85rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
          ><Plus size={11} /> Log RFP</button>
          <button onClick={onOpen}
            className="inline-flex items-center gap-1.5"
            style={{
              backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
              border: `1px solid ${p.accent}`, padding: "0.4rem 0.95rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          >Open pipeline <ArrowRight size={11} /></button>
        </div>
      </div>

      {/* Per-stage clickable funnel */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px flex-1" style={{ backgroundColor: p.border }}>
        {RFP_STAGES.map((stage) => {
          const e = analytics.byStage[stage.value] || { count: 0, value: 0 };
          const c = stage.base;
          return (
            <button
              key={stage.value}
              onClick={() => onStageClick(stage.value)}
              className="px-3 py-3 text-start"
              title={`${stage.hint} · click to filter inside the pipeline`}
              style={{ backgroundColor: p.bgPanel, cursor: "pointer", transition: "background-color 120ms" }}
              onMouseEnter={(ev) => { ev.currentTarget.style.backgroundColor = `${c}0D`; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.backgroundColor = p.bgPanel; }}
            >
              <div className="flex items-center gap-1.5">
                <span style={stageDotStyle(stage.value)} />
                <span style={{ color: c, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                  {stage.label}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", color: c, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {e.count}
                </span>
                {e.value > 0 && (
                  <span style={{ color: p.textMuted, fontSize: "0.66rem", fontVariantNumeric: "tabular-nums" }}>
                    {t("common.bhd")} {(e.value / 1000).toFixed(1)}k
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer hint — explains the new pattern */}
      <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div style={{ color: p.textMuted, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
          The full pipeline opens in a dedicated workspace. Each RFP gets its own row with industry, contact, volume, stage, age and due date.
        </div>
        <button onClick={onOpen}
          className="inline-flex items-center gap-1"
          style={{
            color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            padding: "0.2rem 0.4rem", whiteSpace: "nowrap",
          }}
        >Manage all RFPs <ArrowRight size={12} /></button>
      </div>
    </div>
  );
}

// RfpPipelineDrawer — full-page drawer that hosts the pipeline workspace.
// The dashboard tile shows headline numbers; here the operator gets the
// scoreboard strip, totals, filter bar, and a roomy table with one row per
// RFP — every detail (industry, contact, volume, due date, conversion path)
// stays inside the same surface, so deeper engagement stays focused.
function RfpPipelineDrawer({ p, t, analytics, rfps, rfpFilter, setRfpFilter, onClose, onLogRfp, onOpenRfp, onConvert }) {
  const headline = `${analytics.active.length} active · ${t("common.bhd")} ${(analytics.totalValue / 1000).toFixed(1)}k value · ${analytics.overdue} overdue`;
  const totalNights = (analytics.active || []).reduce((s, r) => s + (r.roomNights || 0), 0);
  const wonCount  = analytics.byStage.won?.count  || 0;
  const lostCount = analytics.byStage.lost?.count || 0;
  const closeRate = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="RFP pipeline"
      title="In-flight corporate RFPs"
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>{headline}</span>
          <div className="flex-1" />
          <button onClick={onClose}
            style={{
              backgroundColor: "transparent", color: p.textMuted,
              border: `1px solid ${p.border}`, padding: "0.45rem 0.95rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          >Close</button>
          <button onClick={onLogRfp}
            className="inline-flex items-center gap-1.5"
            style={{
              backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
              border: `1px solid ${p.accent}`, padding: "0.45rem 1.1rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          ><Plus size={12} /> Log RFP</button>
        </>
      }
    >
      {/* Top scoreboard — totals + close rate + due flags */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SmallStat label="Active RFPs"   value={analytics.active.length}                        hint={`${totalNights.toLocaleString()} room-nights at stake`} />
        <SmallStat label="Pipeline value" value={`${t("common.bhd")} ${(analytics.totalValue / 1000).toFixed(1)}k`} hint="Sum of est. value across active RFPs" color={p.accent} />
        <SmallStat label="Overdue"        value={analytics.overdue}                              hint={analytics.dueSoon > 0 ? `${analytics.dueSoon} due in ≤ 2 days` : "Schedule healthy"} color={analytics.overdue > 0 ? p.danger : p.success} />
        <SmallStat label="Close rate"     value={closeRate !== null ? `${closeRate}%` : "—"}     hint={`${wonCount} won · ${lostCount} lost`} color={closeRate === null ? undefined : closeRate >= 50 ? p.success : p.warn} />
      </div>

      {/* Stage funnel — same colour code as the summary card, larger here */}
      <div className="mb-5" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Stage funnel
          </div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            Click a stage to filter the table below
          </div>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-px" style={{ backgroundColor: p.border }}>
          {RFP_STAGES.map((stage) => {
            const e = analytics.byStage[stage.value] || { count: 0, value: 0 };
            const c = stage.base;
            const isActive = rfpFilter.status === stage.value;
            return (
              <button
                key={stage.value}
                onClick={() => setRfpFilter(f => ({ ...f, status: f.status === stage.value ? "all" : stage.value }))}
                className="px-4 py-4 text-start"
                title={stage.hint}
                style={{
                  backgroundColor: isActive ? `${c}1A` : p.bgPanel,
                  borderTop: `3px solid ${isActive ? c : "transparent"}`,
                  cursor: "pointer", transition: "background-color 120ms",
                }}
                onMouseEnter={(ev) => { if (!isActive) ev.currentTarget.style.backgroundColor = `${c}0D`; }}
                onMouseLeave={(ev) => { if (!isActive) ev.currentTarget.style.backgroundColor = p.bgPanel; }}
              >
                <div className="flex items-center gap-1.5">
                  <span style={stageDotStyle(stage.value)} />
                  <span style={{ color: c, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                    {stage.label}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: c, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {e.count}
                  </span>
                  {e.value > 0 && (
                    <span style={{ color: p.textMuted, fontSize: "0.7rem", fontVariantNumeric: "tabular-nums" }}>
                      {t("common.bhd")} {(e.value / 1000).toFixed(1)}k
                    </span>
                  )}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4, lineHeight: 1.4 }}>
                  {stage.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-5 py-3 mb-3 flex items-center gap-2 flex-wrap" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div className="relative flex-1 min-w-[220px]" style={{ maxWidth: 360 }}>
          <Search size={12} style={{ position: "absolute", insetInlineStart: 10, top: "50%", transform: "translateY(-50%)", color: p.textMuted, pointerEvents: "none" }} />
          <input
            value={rfpFilter.search}
            onChange={(e) => setRfpFilter(f => ({ ...f, search: e.target.value }))}
            placeholder="Search account, industry, contact…"
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`,
              paddingInlineStart: "1.9rem", paddingInlineEnd: rfpFilter.search ? "1.9rem" : "0.7rem",
              paddingBlock: "0.5rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
            }}
          />
          {rfpFilter.search && (
            <button onClick={() => setRfpFilter(f => ({ ...f, search: "" }))} title="Clear"
              style={{ position: "absolute", insetInlineEnd: 8, top: "50%", transform: "translateY(-50%)", color: p.textMuted }}>
              <X size={12} />
            </button>
          )}
        </div>
        <FilterPill active={rfpFilter.status === "active"} onClick={() => setRfpFilter(f => ({ ...f, status: "active" }))} p={p}>Active only</FilterPill>
        <FilterPill active={rfpFilter.status === "all"}    onClick={() => setRfpFilter(f => ({ ...f, status: "all"    }))} p={p}>All</FilterPill>
        <FilterPill active={rfpFilter.status === "won"}    onClick={() => setRfpFilter(f => ({ ...f, status: "won"    }))} color={p.success} p={p}>Won</FilterPill>
        <FilterPill active={rfpFilter.status === "lost"}   onClick={() => setRfpFilter(f => ({ ...f, status: "lost"   }))} color={p.danger}  p={p}>Lost</FilterPill>
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
          · {rfps.length} {rfps.length === 1 ? "RFP" : "RFPs"} shown
        </span>
      </div>

      {/* Roomy RFP table */}
      <div className="overflow-x-auto" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", color: p.textSecondary }}>
          <thead>
            <tr style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", backgroundColor: p.bgPanelAlt }}>
              <th className="text-start px-6 py-3.5 font-semibold">Account</th>
              <th className="text-start px-3 py-3.5 font-semibold">Industry · Contact</th>
              <th className="text-end px-3 py-3.5 font-semibold">Volume</th>
              <th className="text-end px-3 py-3.5 font-semibold">Est. value</th>
              <th className="text-start px-3 py-3.5 font-semibold">Stage</th>
              <th className="text-start px-3 py-3.5 font-semibold">Age · Due</th>
              <th className="text-end px-6 py-3.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rfps.map((row) => {
              const age = ageDays(row.receivedOn);
              const due = dueInDays(row.dueDate);
              const overdue = due !== null && due < 0;
              const dueColor = overdue ? p.danger : (due !== null && due <= 2) ? p.warn : p.textMuted;
              return (
                <tr key={row.id}
                  style={{ borderTop: `1px solid ${p.border}`, cursor: "pointer", transition: "background-color 120ms" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  onClick={() => onOpenRfp(row)}
                >
                  <td className="px-6 py-4">
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 500 }}>{row.account}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>{row.id}</div>
                    {row.paymentTerms && <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 2 }}>Payment · {row.paymentTerms}</div>}
                  </td>
                  <td className="px-3 py-4" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ color: p.textSecondary, fontSize: "0.82rem", fontWeight: 600 }}>{row.industry}</div>
                    {row.contactName && <div style={{ color: p.textPrimary, fontSize: "0.74rem", marginTop: 3 }}>{row.contactName}</div>}
                    {row.contactEmail && <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{row.contactEmail}</div>}
                  </td>
                  <td className="px-3 py-4 text-end" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>
                      {(row.roomNights || 0).toLocaleString()} <span style={{ color: p.textMuted, fontSize: "0.7rem", fontWeight: 400 }}>nights</span>
                    </div>
                    {row.maxRate ? <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>≤ BHD {row.maxRate}/n</div> : null}
                  </td>
                  <td className="px-3 py-4 text-end" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ color: p.accent, fontWeight: 700, fontSize: "0.95rem", fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {(row.estValue || 0).toLocaleString()}</div>
                  </td>
                  <td className="px-3 py-4">
                    <span style={stagePillStyle(row.status)}>
                      <span style={stageDotStyle(row.status)} />
                      {STAGE_LABEL[row.status] || row.status}
                    </span>
                  </td>
                  <td className="px-3 py-4" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ color: age > 10 ? p.warn : p.textMuted, fontSize: "0.78rem", fontVariantNumeric: "tabular-nums" }}>
                      {age}d old
                    </div>
                    {due !== null && (
                      <div style={{ color: dueColor, fontSize: "0.74rem", marginTop: 2, fontWeight: overdue || (due !== null && due <= 2) ? 700 : 500 }}>
                        {overdue ? `${Math.abs(due)}d overdue` : due === 0 ? "due today" : `due in ${due}d`}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {row.status !== "won" && row.status !== "lost" && (
                        <button onClick={() => onConvert(row)} title="Convert to contract"
                          className="inline-flex items-center gap-1"
                          style={{
                            color: p.success, fontSize: "0.62rem",
                            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            padding: "0.35rem 0.7rem", border: `1px solid ${p.success}`,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        ><CheckCircle2 size={11} /> Convert</button>
                      )}
                      <button onClick={() => onOpenRfp(row)} title="Open RFP"
                        className="inline-flex items-center gap-1"
                        style={{
                          color: p.accent, fontSize: "0.62rem",
                          letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                          padding: "0.35rem 0.7rem", border: `1px solid ${p.accent}`,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                      ><Edit2 size={11} /> Manage</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rfps.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem" }}>
                  {rfpFilter.search || rfpFilter.status !== "active" ? (
                    <>No RFPs match the current filters.
                      <button onClick={() => setRfpFilter({ status: "active", search: "" })} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Reset filters →</button>
                    </>
                  ) : (
                    <>No active RFPs.
                      <button onClick={onLogRfp} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Log the first one →</button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

// Compact icon-only row action — used for Preview / Download / Email so the
// actions cell stays narrow and consistent.
function RowIconBtn({ title, icon: Icon, onClick, p, disabled }) {
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: disabled ? p.textDim : p.textSecondary,
        border: `1px solid ${p.border}`, backgroundColor: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
    >
      <Icon size={12} />
    </button>
  );
}
