import React, { useMemo, useRef, useState } from "react";
import {
  ArrowRight, Building2, Calendar, Check, ChevronDown, ChevronRight, Compass, Edit2,
  ExternalLink, FileCheck, Globe, Image as ImageIcon, Linkedin, Loader2, Map, Plus,
  Save, ScanLine, Search, Sparkles, Target, Telescope, Trash2, Upload, Users, Wand2, X,
} from "lucide-react";
import { usePalette } from "./theme.jsx";
import {
  PROSPECT_REGIONS, PROSPECT_INDUSTRIES, PROSPECT_AGENT_SPECIALTIES,
  PROSPECT_STATUSES, getProspectStages, winStageForKind, useData,
} from "../../data/store.jsx";
import { Drawer, FormGroup, GhostBtn, PrimaryBtn, pushToast, SelectField, TextField } from "./admin/ui.jsx";

// ---------------------------------------------------------------------------
// ProspectExplorer — full-page drawer that helps the operator discover and
// capture new accounts in the region. Three things in one surface:
//
//   1. Web research — Google / LinkedIn / Maps deep-links built from
//      smart query templates (industry × region × kind).
//   2. Capture — fill out the prospect form right after researching, save
//      to the store with a status (new → contacted → meeting → proposal →
//      won / lost).
//   3. Track — table of every captured prospect with quick filters and a
//      stage funnel; one-click conversion into an RFP (corporate) or a
//      new agency draft (agent).
//
// `kind` is "corporate" or "agent"; the picker for industry / specialty
// switches accordingly. `onConvert` is called with the prospect when the
// operator clicks Convert — the parent owns the actual RFP / agency draft
// creation since those flows already exist in CorporateTab / AgentTab.
// ---------------------------------------------------------------------------

// Lookup any status by id (across both pipelines) — used for fallback
// rendering when the kind isn't known up front (table rows know it).
const STATUS_BY_ID = Object.fromEntries(PROSPECT_STATUSES.map((s) => [s.id, s]));
const REGION_BY_ID = Object.fromEntries(PROSPECT_REGIONS.map((r) => [r.id, r]));

// Kind-aware status lookup. Each row in the table renders against its own
// pipeline so chip colour and label match the funnel.
const stagesByIdFor = (kind) => {
  const map = Object.fromEntries(getProspectStages(kind).map((s) => [s.id, s]));
  // Allow legacy or unknown ids to still render (falls back to the unified
  // catalogue) — keeps the UI from blowing up if data was migrated halfway.
  return (id) => map[id] || STATUS_BY_ID[id] || PROSPECT_STATUSES[0];
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
};

const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
};

// Quick-search presets — each one builds a focused Google query for a
// common prospect-research scenario. Picking a preset auto-fills the
// search input and dropdowns.
const CORPORATE_PRESETS = [
  { label: "Banking · Manama HQs",       query: "banks Manama Bahrain head office contact",                          region: "bahrain",  industry: "Banking & Finance" },
  { label: "Oil & Gas · GCC",            query: "oil and gas companies GCC procurement office Bahrain",              region: "gcc",      industry: "Oil & Gas" },
  { label: "Government · Bahrain",       query: "Bahrain government ministries procurement accommodation",            region: "bahrain",  industry: "Government" },
  { label: "Tech HQs · Riyadh",          query: "technology companies Riyadh Saudi Arabia regional headquarters",     region: "saudi",    industry: "Technology" },
  { label: "Investment firms · Bahrain", query: "investment firms Bahrain Manama family office",                      region: "bahrain",  industry: "Investment" },
  { label: "Aviation · GCC",             query: "GCC airlines crew layover hotel partnerships",                       region: "gcc",      industry: "Aviation" },
  { label: "Construction · Khobar",      query: "construction companies Al Khobar Saudi Arabia procurement",          region: "saudi",    industry: "Construction" },
  { label: "Diplomatic · Manama",        query: "embassies consulates Manama Bahrain accommodation suppliers",         region: "bahrain",  industry: "Diplomatic Mission" },
];

const AGENT_PRESETS = [
  { label: "Outbound · Saudi to Bahrain", query: "top travel agencies Riyadh outbound Bahrain leisure tourism",       region: "saudi", industry: "Outbound · Saudi" },
  { label: "Wholesale / Bedbanks · GCC",  query: "GCC wholesale travel agencies bedbank hotel contracting",            region: "gcc",   industry: "Wholesale / Bedbank" },
  { label: "Inbound · Bahrain DMCs",      query: "destination management companies Bahrain inbound tourism",            region: "bahrain", industry: "Inbound · GCC" },
  { label: "OTA Resellers · India",       query: "Indian OTA travel agencies inbound Middle East hotel contracts",     region: "international", industry: "OTA Reseller" },
  { label: "Outbound · UK to GCC",        query: "UK travel agencies Bahrain Manama luxury hotel suite contracts",      region: "international", industry: "Outbound · UK" },
  { label: "MICE · Dubai",                query: "MICE corporate travel agencies Dubai Bahrain hotel",                  region: "uae",   industry: "MICE / Corporate" },
  { label: "Religious / Hajj-Umrah",      query: "Hajj Umrah travel agencies Saudi Arabia Bahrain",                     region: "saudi", industry: "Religious / Hajj-Umrah" },
  { label: "Crew & Aviation · Doha",      query: "crew layover travel agencies Doha Qatar airline",                     region: "qatar", industry: "Crew & Aviation" },
];

// Craft a focused Google query from the form values. Use site/intext hints
// when nothing else has been entered so the result page is still useful.
function buildQuery({ kind, name, region, industry }) {
  const parts = [];
  if (name?.trim()) parts.push(`"${name.trim()}"`);
  if (industry)     parts.push(industry);
  if (region && region !== "international") {
    const r = REGION_BY_ID[region];
    if (r) parts.push(r.label);
  }
  if (kind === "corporate" && !name) parts.push("head office", "procurement OR HR");
  if (kind === "agent" && !name)     parts.push("travel agency", "hotel contracts OR contracting");
  return parts.join(" ");
}

const googleHref   = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const linkedinHref = (q) => `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(q)}`;
const mapsHref     = (q) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`;

// ---------------------------------------------------------------------------
// parseProspectText — heuristic OCR-text parser used by the "Capture from
// image" panel. In production this would receive the structured JSON from a
// Vision API (Google Vision / AWS Textract / Claude Vision), but the same
// shape applies — pull email / phone / URL via regex, region / industry via
// keyword tables, and the most prominent line as the account name.
// ---------------------------------------------------------------------------
const REGION_CITY_HINTS = [
  // [matcher, regionId, cityLabel]
  [/\bjuffair\b/i,                  "bahrain", "Juffair"],
  [/\bseef\b/i,                     "bahrain", "Seef"],
  [/\bmuharraq\b/i,                 "bahrain", "Muharraq"],
  [/\briffa\b/i,                    "bahrain", "Riffa"],
  [/\bsaar\b/i,                     "bahrain", "Saar"],
  [/\bbusaiteen\b/i,                "bahrain", "Busaiteen"],
  [/\bmanama\b/i,                   "bahrain", "Manama"],
  [/\bbahrain\b/i,                  "bahrain", "Manama"],
  [/\briyadh\b/i,                   "saudi",   "Riyadh"],
  [/\bjeddah\b/i,                   "saudi",   "Jeddah"],
  [/\bdammam\b/i,                   "saudi",   "Dammam"],
  [/\bal\s*khobar\b|\bkhobar\b/i,   "saudi",   "Al Khobar"],
  [/\bsaudi\b|\bksa\b/i,            "saudi",   "Riyadh"],
  [/\babu\s*dhabi\b/i,              "uae",     "Abu Dhabi"],
  [/\bsharjah\b/i,                  "uae",     "Sharjah"],
  [/\bdubai\b/i,                    "uae",     "Dubai"],
  [/\bu\.?a\.?e\.?\b|\bemirates\b/i,"uae",     "Dubai"],
  [/\bkuwait\b/i,                   "kuwait",  "Kuwait City"],
  [/\bsalmiya\b/i,                  "kuwait",  "Salmiya"],
  [/\bdoha\b|\bqatar\b/i,           "qatar",   "Doha"],
  [/\bmuscat\b|\boman\b|\bsalalah\b/i, "oman",  "Muscat"],
  [/\bgcc\b/i,                      "gcc",     ""],
];

const INDUSTRY_KEYWORDS = [
  // Banking / finance
  ["Banking & Finance", /\bbank|finance|finanz|investment|capital|asset\s*manage|broker|equity|fund\b/i],
  // Oil & Gas
  ["Oil & Gas",        /\boil\s*&?\s*gas|petroleum|aramco|bapco|nogaholding|drilling|refinery|energy|lng\b/i],
  // Aviation
  ["Aviation",          /\bairline|airways|aviation|airport|gulf\s*air|cabin\s*crew|flydubai|qatar\s*airways|emirates\b/i],
  // Government
  ["Government",        /\bministry|government|authority|royal|kingdom\s*of|directorate|ministerial\b/i],
  // Diplomatic
  ["Diplomatic Mission",/\bembassy|consulate|diplomatic|chancery|ambassador\b/i],
  // Construction
  ["Construction",      /\bconstruction|contracting|engineering|infrastructure|civil\s*works|builder\b/i],
  // Healthcare
  ["Healthcare",        /\bhospital|medical|clinic|healthcare|pharma|laboratory\b/i],
  // Education
  ["Education",         /\buniversity|college|school|academy|institute|education\b/i],
  // Tech
  ["Technology",        /\btechnology|software|digital|fintech|saas|cloud\s*computing\b/i],
  // Telecoms
  ["Telecoms",          /\btelecom|telecommunications|stc|batelco|viva|ooredoo\b/i],
  // Investment
  ["Investment",        /\binvestcorp|gfh|ithmaar|sovereign\s*wealth|family\s*office\b/i],
  // Hospitality (more agent-flavoured)
  ["Hospitality",       /\btravel\s*agency|tour\s*operator|destination\s*management|dmc\b/i],
  // Retail
  ["Retail",            /\bretail|trading|distribution|wholesale|importer\b/i],
  // Manufacturing
  ["Manufacturing",     /\bmanufactur|smelter|factory|plant|industries|industrial\b/i],
];

function parseProspectText(text) {
  const out = {};
  const t = (text || "").trim();
  if (!t) return out;

  // Email
  const email = t.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (email) out.contactEmail = email[0];

  // Phone — looks for + or digit, with separators, length 7-20
  const phone = t.match(/(\+?\d[\d\s().\-]{6,20}\d)/);
  if (phone) out.contactPhone = phone[0].replace(/\s+/g, " ").trim();

  // Website / URL
  const url = t.match(/((?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9\-]+\.(?:com|net|org|co|io|bh|sa|ae|kw|qa|om|gov|edu|info|me|travel)(?:\.[a-z]{2,3})?(?:\/[^\s]*)?)/i);
  if (url) {
    let u = url[0];
    if (!/^https?:/i.test(u)) u = `https://${u.replace(/^www\./i, "www.")}`;
    out.website = u;
  }

  // Region + city
  for (const [re, region, city] of REGION_CITY_HINTS) {
    if (re.test(t)) {
      out.region = region;
      if (city) out.city = city;
      break;
    }
  }

  // Industry
  for (const [industry, re] of INDUSTRY_KEYWORDS) {
    if (re.test(t)) { out.industry = industry; break; }
  }

  // Account name + contact name. Strategy:
  //   1. Skip lines that are obviously contact details (email / url / phone)
  //   2. The first remaining line is usually the company name (logos/letterheads)
  //   3. The next "title-case 2–4 word" line is usually the contact name
  const lines = t.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  const isContactish = (l) => /@/.test(l) || /^https?:|^www\./i.test(l) || /^[+\d][\d\s().\-]{6,}$/.test(l);
  const looksLikeName = (l) => {
    if (l.length < 3 || l.length > 60) return false;
    const words = l.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    return words.every((w) => /^[A-Z][A-Za-z\-'.]*$/.test(w));
  };

  const candidates = lines.filter((l) => !isContactish(l) && l.length >= 3 && l.length <= 80);
  if (candidates[0]) out.name = candidates[0];

  // First line that looks like a person name AFTER the company line
  for (let i = 1; i < candidates.length && i < 6; i++) {
    if (looksLikeName(candidates[i])) { out.contactName = candidates[i]; break; }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Drawer entry point.
// ---------------------------------------------------------------------------
export function ProspectExplorerDrawer({ open, onClose, kind = "corporate", onConvert }) {
  if (!open) return null;
  return <ProspectExplorerInner onClose={onClose} kind={kind} onConvert={onConvert} />;
}

function ProspectExplorerInner({ onClose, kind, onConvert }) {
  const p = usePalette();
  const { prospects, addProspect, updateProspect, removeProspect, setProspectStatus } = useData();

  const PRESETS = kind === "agent" ? AGENT_PRESETS : CORPORATE_PRESETS;
  const INDUSTRIES = kind === "agent" ? PROSPECT_AGENT_SPECIALTIES : PROSPECT_INDUSTRIES;
  const kindLabel = kind === "agent" ? "Travel agent" : "Corporate";
  const kindLabelLong = kind === "agent" ? "travel agency" : "corporate account";

  // Stages flow into chip rendering, the funnel, and the form picker. Each
  // kind has its own ordered list with distinct middle stages.
  const STAGES = useMemo(() => getProspectStages(kind), [kind]);
  const lookupStage = useMemo(() => stagesByIdFor(kind), [kind]);
  const winStage = winStageForKind(kind);

  // Search panel ----------------------------------------------------------
  const [search,   setSearch]   = useState({ name: "", region: "bahrain", industry: INDUSTRIES[0] });
  const query = useMemo(() => buildQuery({ kind, ...search }), [kind, search]);

  // Capture form ---------------------------------------------------------
  const blankDraft = () => ({
    kind, name: "", region: "bahrain", city: "",
    industry: INDUSTRIES[0],
    contactName: "", contactEmail: "", contactPhone: "",
    website: "", source: "Web research",
    status: STAGES[0].id, nextActionAt: "",
    notes: "",
  });
  const [editing, setEditing] = useState(null); // null | draft

  const startCapture = (preset) => {
    setEditing({
      ...blankDraft(),
      name: search.name,
      region: search.region,
      industry: search.industry,
      source: preset
        ? `Preset · ${preset.label}`
        : search.name ? `Search · ${query}` : "Web research",
    });
  };

  // Filters / table -----------------------------------------------------
  const [filter, setFilter] = useState({ status: "all", region: "all", search: "" });

  const myProspects = useMemo(() =>
    prospects.filter((p) => p.kind === kind), [prospects, kind]);

  const analytics = useMemo(() => {
    const byStatus = {};
    STAGES.forEach((s) => { byStatus[s.id] = 0; });
    myProspects.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
    const isClosed = (statusId) => {
      const s = lookupStage(statusId);
      return !!s?.closed;
    };
    const active = myProspects.filter((p) => !isClosed(p.status));
    const dueSoon = active.filter((p) => {
      const d = daysUntil(p.nextActionAt);
      return d !== null && d >= 0 && d <= 3;
    }).length;
    const overdue = active.filter((p) => {
      const d = daysUntil(p.nextActionAt);
      return d !== null && d < 0;
    }).length;
    return { total: myProspects.length, active: active.length, byStatus, dueSoon, overdue };
  }, [myProspects, STAGES, lookupStage]);

  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return myProspects.filter((p) => {
      if (filter.status !== "all" && p.status !== filter.status) return false;
      if (filter.region !== "all" && p.region !== filter.region) return false;
      if (q) {
        const hay = [p.name, p.industry, p.contactName, p.contactEmail, p.notes, p.city].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Overdue first, then due-soon, then by capturedAt desc
      const aDue = daysUntil(a.nextActionAt);
      const bDue = daysUntil(b.nextActionAt);
      if (aDue !== null && bDue !== null) return aDue - bDue;
      if (aDue !== null) return -1;
      if (bDue !== null) return 1;
      return new Date(b.capturedAt || 0) - new Date(a.capturedAt || 0);
    });
  }, [myProspects, filter]);

  // Save / convert / delete --------------------------------------------
  const saveProspect = () => {
    if (!editing.name?.trim()) { pushToast({ message: "Account name is required", kind: "warn" }); return; }
    if (editing.id) {
      updateProspect(editing.id, editing);
      pushToast({ message: `Prospect updated · ${editing.name}` });
    } else {
      addProspect(editing);
      pushToast({ message: `Prospect captured · ${editing.name}` });
    }
    setEditing(null);
  };

  const removeAndClose = () => {
    if (!editing?.id) return;
    if (!confirm(`Remove ${editing.name}? This can't be undone.`)) return;
    removeProspect(editing.id);
    pushToast({ message: `Removed · ${editing.name}` });
    setEditing(null);
  };

  const handleConvert = (prospect) => {
    if (!onConvert) {
      pushToast({ message: "Convert flow not wired yet", kind: "warn" });
      return;
    }
    setProspectStatus(prospect.id, winStage);
    const winLabel = lookupStage(winStage).label.toLowerCase();
    pushToast({ message: `Converted · ${prospect.name} marked as ${winLabel}` });
    onConvert(prospect);
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`${kindLabel} prospects`}
      title="Discover & track new accounts"
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
            {analytics.total} {kindLabel.toLowerCase()} prospects · {analytics.active} active
            {analytics.overdue > 0 && <span style={{ color: p.danger, marginInlineStart: 8, fontWeight: 700 }}>· {analytics.overdue} overdue</span>}
            {analytics.dueSoon > 0 && <span style={{ color: p.warn, marginInlineStart: 8, fontWeight: 700 }}>· {analytics.dueSoon} due ≤ 3d</span>}
          </span>
          <div className="flex-1" />
          <GhostBtn small onClick={onClose}>Close</GhostBtn>
          <PrimaryBtn small onClick={() => startCapture(null)}><Plus size={11} /> Capture prospect</PrimaryBtn>
        </>
      }
    >
      {/* ── Search the web ───────────────────────────────────────────── */}
      <div className="mb-6" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <Telescope size={13} /> Search the web for {kindLabelLong}s
          </div>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
            Opens Google / LinkedIn / Maps in a new tab
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <FormGroup label="Account name (optional)">
              <TextField value={search.name} onChange={(v) => setSearch((s) => ({ ...s, name: v }))} placeholder={kind === "agent" ? "e.g. Al-Tayyar" : "e.g. BAPCO"} />
            </FormGroup>
          </div>
          <div className="md:col-span-3">
            <FormGroup label="Region">
              <SelectField
                value={search.region}
                onChange={(v) => setSearch((s) => ({ ...s, region: v }))}
                options={PROSPECT_REGIONS.map((r) => ({ value: r.id, label: r.label }))}
              />
            </FormGroup>
          </div>
          <div className="md:col-span-3">
            <FormGroup label={kind === "agent" ? "Specialty" : "Industry"}>
              <SelectField
                value={search.industry}
                onChange={(v) => setSearch((s) => ({ ...s, industry: v }))}
                options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
              />
            </FormGroup>
          </div>
          <div className="md:col-span-2 flex items-end">
            <GhostBtn small onClick={() => startCapture(null)}>
              <Plus size={11} /> Capture
            </GhostBtn>
          </div>
        </div>

        {/* Live query preview */}
        <div className="px-5 pb-5">
          <div className="p-3 mb-3" style={{ border: `1px dashed ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <div style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 4 }}>
              Search query
            </div>
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", wordBreak: "break-word" }}>
              {query || <span style={{ color: p.textMuted, fontStyle: "italic" }}>Pick a region & industry, or type an account name…</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SearchLinkButton href={googleHref(query)}   label="Open in Google"   icon={Search}   primary />
            <SearchLinkButton href={linkedinHref(query)} label="LinkedIn search"  icon={Linkedin} />
            <SearchLinkButton href={mapsHref(query)}     label="Maps · nearby"    icon={Map} />
            {search.name && (
              <SearchLinkButton href={`https://www.google.com/search?q=${encodeURIComponent(`"${search.name.trim()}" website OR contact email`)}`} label="Find website" icon={Globe} />
            )}
          </div>

          {/* Presets */}
          <div className="mt-4">
            <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
              Quick presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setSearch({ name: "", region: preset.region, industry: preset.industry })}
                  style={{
                    padding: "0.4rem 0.8rem",
                    backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`,
                    color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border;  e.currentTarget.style.color = p.textSecondary; }}
                  title={preset.query}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI scoreboard ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <ScoreboardTile label="Total prospects" value={analytics.total}   hint={`${kindLabel} pipeline`} />
        <ScoreboardTile label="Active leads"    value={analytics.active}  hint="Excluding closed states" color={p.accent} />
        <ScoreboardTile label="Overdue"         value={analytics.overdue} hint={analytics.overdue ? "Need follow-up" : "All scheduled"} color={analytics.overdue > 0 ? p.danger : p.success} />
        <ScoreboardTile
          label={kind === "agent" ? "Producing" : "Won this year"}
          value={analytics.byStatus[winStage] || 0}
          hint={kind === "agent" ? "Active agency partners" : "Converted to contract"}
          color={p.success}
        />
      </div>

      {/* ── Stage funnel ─────────────────────────────────────────────── */}
      <div className="mb-5" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            {kindLabel} pipeline · {STAGES.length} stages
          </div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            Click a stage to filter the table below
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px" style={{ backgroundColor: p.border }}>
          {STAGES.map((s, idx) => {
            const count = analytics.byStatus[s.id] || 0;
            const isActive = filter.status === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setFilter((f) => ({ ...f, status: f.status === s.id ? "all" : s.id }))}
                className="px-3 py-3 text-start"
                title={`${s.hint}${s.nextAction ? `\n→ ${s.nextAction}` : ""}`}
                style={{
                  backgroundColor: isActive ? `${s.base}1A` : p.bgPanel,
                  borderTop: `3px solid ${isActive ? s.base : "transparent"}`,
                  cursor: "pointer", transition: "background-color 120ms",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = `${s.base}0D`; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = p.bgPanel; }}
              >
                <div className="flex items-center gap-1.5">
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%",
                    backgroundColor: `${s.base}1F`, color: s.base,
                    border: `1px solid ${s.base}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.58rem", fontWeight: 800, fontFamily: "'Manrope', sans-serif",
                    flexShrink: 0,
                  }}>{idx + 1}</span>
                  <span style={{ color: s.base, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", color: s.base, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1, marginTop: 6 }}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 mb-3 flex items-center gap-2 flex-wrap" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div className="relative flex-1 min-w-[200px]" style={{ maxWidth: 340 }}>
          <Search size={12} style={{ position: "absolute", insetInlineStart: 10, top: "50%", transform: "translateY(-50%)", color: p.textMuted, pointerEvents: "none" }} />
          <input
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search captured prospects…"
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`,
              paddingInlineStart: "1.9rem", paddingInlineEnd: "0.7rem",
              paddingBlock: "0.45rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem",
            }}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <SelectField
            value={filter.region}
            onChange={(v) => setFilter((f) => ({ ...f, region: v }))}
            options={[{ value: "all", label: "All regions" }, ...PROSPECT_REGIONS.map((r) => ({ value: r.id, label: r.label }))]}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <SelectField
            value={filter.status}
            onChange={(v) => setFilter((f) => ({ ...f, status: v }))}
            options={[{ value: "all", label: "All stages" }, ...STAGES.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.label}` }))]}
          />
        </div>
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
          {filtered.length} {filtered.length === 1 ? "prospect" : "prospects"}
        </span>
      </div>

      {/* ── Prospect table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              {["Account", "Region", kind === "agent" ? "Specialty · Contact" : "Industry · Contact", "Source", "Status", "Next action", "Actions"].map((h, i) => (
                <th key={h} className={`text-${i === 6 ? "end" : "start"} px-4 py-3`}
                  style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center" style={{ color: p.textMuted, fontSize: "0.88rem" }}>
                  {filter.search || filter.status !== "all" || filter.region !== "all" ? (
                    <>No prospects match the filters.
                      <button onClick={() => setFilter({ status: "all", region: "all", search: "" })} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Reset →</button>
                    </>
                  ) : (
                    <>No {kindLabelLong} prospects yet.
                      <button onClick={() => startCapture(null)} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Capture the first one →</button>
                    </>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const status = lookupStage(row.status);
              const region = REGION_BY_ID[row.region];
              const due = daysUntil(row.nextActionAt);
              const isClosed = !!status.closed;
              const overdue = due !== null && due < 0 && !isClosed;
              const dueSoon = due !== null && due >= 0 && due <= 3 && !isClosed;
              const dueColor = overdue ? p.danger : dueSoon ? p.warn : p.textMuted;
              // "Stale" = sat in the same stage longer than the stage's
              // expected aging window. Surfaces stuck deals to the operator.
              const stageDays = row.capturedAt
                ? Math.max(0, Math.round((Date.now() - new Date(row.capturedAt).getTime()) / (1000 * 60 * 60 * 24)))
                : 0;
              const stale = !isClosed && status.aging != null && stageDays > status.aging;
              return (
                <tr key={row.id}
                  style={{ borderTop: `1px solid ${p.border}`, cursor: "pointer", transition: "background-color 120ms" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  onClick={() => setEditing({ ...row })}
                >
                  <td className="px-4 py-3.5">
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary, fontWeight: 500 }}>
                      {row.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em" }}>{row.id}</span>
                      {row.website && (
                        <a href={row.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          style={{ color: p.textMuted, fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: 3 }}
                          onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                          onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                        >
                          <ExternalLink size={10} /> site
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ color: p.textSecondary }}>{region?.label || "—"}</div>
                    {row.city && <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{row.city}</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div style={{ color: p.textSecondary, fontWeight: 600 }}>{row.industry || "—"}</div>
                    {row.contactName && <div style={{ color: p.textPrimary, fontSize: "0.76rem", marginTop: 2 }}>{row.contactName}</div>}
                    {row.contactEmail && <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{row.contactEmail}</div>}
                  </td>
                  <td className="px-4 py-3.5" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem" }}>{row.source || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>captured {fmtDate(row.capturedAt)}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span style={{
                      color: status.base,
                      backgroundColor: `${status.base}1F`,
                      border: `1px solid ${status.base}`,
                      padding: "3px 9px",
                      fontSize: "0.6rem", fontWeight: 700,
                      letterSpacing: "0.18em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: status.base }} />
                      {status.label}
                    </span>
                    {stale && (
                      <div title={`Sat in ${status.label} for ${stageDays}d (target ≤ ${status.aging}d)`}
                        style={{ color: p.warn, fontSize: "0.66rem", fontWeight: 700, marginTop: 4 }}>
                        Stale · {stageDays}d
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5" style={{ whiteSpace: "nowrap" }}>
                    {row.nextActionAt ? (
                      <>
                        <div style={{ color: dueColor, fontWeight: overdue || dueSoon ? 700 : 500 }}>
                          {fmtDate(row.nextActionAt)}
                        </div>
                        <div style={{ color: dueColor, fontSize: "0.7rem", marginTop: 2 }}>
                          {overdue ? `${Math.abs(due)}d overdue` : due === 0 ? "due today" : dueSoon ? `in ${due}d` : `in ${due}d`}
                        </div>
                      </>
                    ) : <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>Not scheduled</span>}
                  </td>
                  <td className="px-4 py-3.5 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <button title="Re-search this prospect on Google"
                        onClick={() => window.open(googleHref(`"${row.name}" ${row.industry || ""} ${REGION_BY_ID[row.region]?.label || ""}`), "_blank", "noopener,noreferrer")}
                        style={{ color: p.textMuted, border: `1px solid ${p.border}`, padding: "0.3rem 0.55rem", display: "inline-flex", alignItems: "center", gap: 3 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                      ><Search size={10} /></button>
                      {row.status !== "won" && row.status !== "lost" && (
                        <button onClick={() => handleConvert(row)} title={kind === "agent" ? "Convert to agency draft" : "Convert to RFP"}
                          style={{
                            color: p.success, fontSize: "0.6rem",
                            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            padding: "0.3rem 0.55rem", border: `1px solid ${p.success}`,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        ><FileCheck size={10} /> Convert</button>
                      )}
                      <button onClick={() => setEditing({ ...row })} title="Edit prospect"
                        style={{
                          color: p.accent, fontSize: "0.6rem",
                          letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                          padding: "0.3rem 0.55rem", border: `1px solid ${p.accent}`,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                      ><Edit2 size={10} /> Edit</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Capture / edit form ─────────────────────────────────────── */}
      {editing && (
        <ProspectFormModal
          draft={editing}
          setDraft={setEditing}
          kindLabel={kindLabel}
          industries={INDUSTRIES}
          stages={STAGES}
          onClose={() => setEditing(null)}
          onSave={saveProspect}
          onRemove={removeAndClose}
          isNew={!editing.id}
        />
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// ImageImportPanel — drop / paste / pick a business-card or screenshot, then
// hit "Apply to form" to auto-populate the prospect fields. The OCR-text
// textarea below gives the operator a fallback when image OCR isn't yet
// wired to a backend (per CLAUDE.md, the production build will route the
// image to a Vision API; this component already structures the data the
// same way so the swap is a one-line change).
// ---------------------------------------------------------------------------
function ImageImportPanel({ defaultOpen = true, onApply }) {
  const p = usePalette();
  const fileRef = useRef(null);
  const [open, setOpen]           = useState(defaultOpen);
  const [image, setImage]         = useState(null); // {url, name, size, type}
  const [text, setText]           = useState("");
  const [dragOver, setDragOver]   = useState(false);
  const [busy, setBusy]           = useState(false);
  const [ocrBusy, setOcrBusy]     = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError]   = useState(null);
  const [appliedCount, setAppliedCount] = useState(null);

  // Run client-side OCR on the supplied image data URL using Tesseract.js.
  // Tesseract loads its WASM + English language data on first use (~2 MB),
  // then subsequent runs are fast. Works fully client-side, no backend.
  const runOcr = async (dataUrl) => {
    setOcrBusy(true);
    setOcrError(null);
    setOcrProgress(0);
    try {
      // Dynamic import keeps the 2 MB Tesseract bundle out of the initial
      // page load — only fetched when the operator actually scans something.
      const { default: Tesseract } = await import("tesseract.js");
      const result = await Tesseract.recognize(dataUrl, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const extracted = (result?.data?.text || "").trim();
      if (!extracted) {
        setOcrError("No text could be read from this image.");
        pushToast({ message: "OCR completed but found no text — try a clearer photo", kind: "warn" });
      } else {
        setText((prev) => prev ? `${prev}\n${extracted}` : extracted);
        pushToast({ message: `Extracted ${extracted.split(/\s+/).length} words from image` });
      }
    } catch (err) {
      console.error("OCR error", err);
      setOcrError("OCR failed. You can paste the text manually below.");
      pushToast({ message: "OCR failed — please type / paste the text manually", kind: "error" });
    } finally {
      setOcrBusy(false);
    }
  };

  const acceptFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast({ message: "Please drop an image file (PNG, JPG, HEIC…)", kind: "warn" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = { url: reader.result, name: file.name, size: file.size, type: file.type };
      setImage(img);
      // Auto-run OCR on the dropped image so the operator doesn't have to
      // click anything else. They can review / edit the text before applying.
      runOcr(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type?.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          acceptFile(file);
          e.preventDefault();
          return;
        }
      }
    }
  };

  const apply = () => {
    if (!text.trim()) {
      if (image && ocrBusy) {
        pushToast({ message: "OCR is still running — wait a moment then click Apply", kind: "warn" });
        return;
      }
      pushToast({ message: "No text to extract from — drop an image or paste text first", kind: "warn" });
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const fields = parseProspectText(text);
      const count = Object.keys(fields).length;
      setAppliedCount(count);
      const sourceLabel = image
        ? `Scanned image · ${image.name}`
        : `Pasted text (${text.trim().split(/\s+/).length} words)`;
      onApply(fields, sourceLabel);
      pushToast({
        message: count === 0
          ? "No structured fields detected — please fill the form manually"
          : `Imported ${count} field${count === 1 ? "" : "s"} from ${image ? "image" : "text"}`,
        kind: count === 0 ? "warn" : "success",
      });
      setBusy(false);
    }, 300);
  };

  const reset = () => { setImage(null); setText(""); setAppliedCount(null); setOcrError(null); setOcrProgress(0); };

  // Manually re-trigger OCR (for after edits or if first run had a bad crop).
  const rerunOcr = () => { if (image?.url) runOcr(image.url); };

  // Compact (collapsed) header — mirrors how Card panels display elsewhere.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-start flex items-center justify-between p-3 transition-colors"
        style={{
          backgroundColor: `${p.accent}10`,
          border: `1px solid ${p.accent}40`,
          borderInlineStart: `3px solid ${p.accent}`,
          cursor: "pointer",
        }}
      >
        <div className="flex items-center gap-2">
          <ScanLine size={14} style={{ color: p.accent }} />
          <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Capture from image
          </span>
          <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>
            Auto-fill from a business card, brochure, or screenshot
          </span>
        </div>
        <ChevronDown size={14} style={{ color: p.textMuted, transform: "rotate(-90deg)" }} />
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${p.accent}40`, backgroundColor: `${p.accent}08` }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2">
          <ScanLine size={14} style={{ color: p.accent }} />
          <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 700 }}>
            Capture from image
          </span>
        </div>
        <div className="flex items-center gap-2">
          {appliedCount !== null && (
            <span style={{ color: appliedCount > 0 ? p.success : p.warn, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif", fontWeight: 600 }}>
              {appliedCount > 0 ? `✓ ${appliedCount} field${appliedCount === 1 ? "" : "s"} applied` : "No fields detected"}
            </span>
          )}
          <button onClick={() => setOpen(false)} title="Hide capture panel"
            style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}
            onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
            onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
          >
            Hide
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Image dropzone or preview */}
        {!image ? (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
            tabIndex={0}
            className="cursor-pointer flex flex-col items-center justify-center text-center outline-none"
            style={{
              padding: "1.4rem 1rem",
              border: `1.5px dashed ${dragOver ? p.accent : p.border}`,
              backgroundColor: dragOver ? p.bgHover : p.bgPanel,
              transition: "border-color 120ms",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            <ScanLine size={28} style={{ color: p.accent, marginBottom: 8 }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary, lineHeight: 1.2 }}>
              Drop a business card, brochure or screenshot
            </div>
            <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 4 }}>
              Click to browse · or paste from clipboard (⌘V / Ctrl+V)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "2px 8px", border: `1px solid ${p.border}` }}>PNG</span>
              <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "2px 8px", border: `1px solid ${p.border}` }}>JPG</span>
              <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "2px 8px", border: `1px solid ${p.border}` }}>HEIC</span>
              <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "2px 8px", border: `1px solid ${p.border}` }}>WEBP</span>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
            <img src={image.url} alt={image.name}
              style={{ width: 110, height: 110, objectFit: "cover", border: `1px solid ${p.border}`, flexShrink: 0 }} />
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div style={{ color: p.textPrimary, fontWeight: 600, fontSize: "0.86rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {image.name}
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
                    {Math.round(image.size / 1024)} KB · {image.type}
                  </div>
                </div>
                <button onClick={reset} title="Remove image"
                  style={{ color: p.textMuted, padding: 2 }}
                  onMouseEnter={(e) => e.currentTarget.style.color = p.danger}
                  onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                ><X size={14} /></button>
              </div>

              {/* OCR status / progress */}
              {ocrBusy && (
                <div className="mt-2">
                  <div className="flex items-center gap-2" style={{ color: p.accent, fontSize: "0.74rem", fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>
                    <Loader2 size={12} className="animate-spin" />
                    Reading text from image · {ocrProgress}%
                  </div>
                  <div className="mt-1.5 h-1" style={{ backgroundColor: p.border }}>
                    <div className="h-full" style={{ width: `${ocrProgress}%`, backgroundColor: p.accent, transition: "width 200ms" }} />
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>
                    First run loads the OCR engine (~2 MB). Subsequent scans are faster.
                  </div>
                </div>
              )}
              {!ocrBusy && ocrError && (
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <span style={{ color: p.danger, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
                    {ocrError}
                  </span>
                  <button onClick={rerunOcr}
                    style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                  >Retry OCR</button>
                </div>
              )}
              {!ocrBusy && !ocrError && (
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <span style={{ color: text ? p.success : p.textMuted, fontSize: "0.72rem", lineHeight: 1.45 }}>
                    {text
                      ? `✓ Read ${text.trim().split(/\s+/).length} words — review below`
                      : "Awaiting OCR…"}
                  </span>
                  <button onClick={rerunOcr}
                    style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                    onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                  >Re-scan</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* OCR text textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
              {image ? "Visible text from the image" : "Or paste the details directly"}
            </div>
            {text && (
              <button onClick={() => setText("")} style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}
                onMouseEnter={(e) => e.currentTarget.style.color = p.danger}
                onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
              >Clear</button>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            rows={4}
            placeholder={
`Example:

BAPCO
Yusuf Al-Khalifa · Procurement Manager
Awali · Bahrain
+973 1775 4444
yusuf.alkhalifa@bapco.net
www.bapco.net`
            }
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", resize: "vertical",
            }}
          />
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span style={{ color: p.textMuted, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif", maxWidth: 360 }}>
            {ocrBusy
              ? "Reading text from image…"
              : busy
              ? "Extracting structured fields…"
              : "Detects account name, contact, phone, email, website, region & industry."}
          </span>
          <div className="flex items-center gap-2">
            {(image || text) && (
              <button onClick={reset}
                style={{
                  backgroundColor: "transparent", color: p.textMuted,
                  border: `1px solid ${p.border}`, padding: "0.4rem 0.85rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
              >Reset</button>
            )}
            <button
              onClick={apply}
              disabled={busy || ocrBusy || !text.trim()}
              className="inline-flex items-center gap-1.5"
              style={{
                backgroundColor: (busy || ocrBusy || !text.trim()) ? p.border : p.accent,
                color: (busy || ocrBusy || !text.trim()) ? p.textMuted : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
                border: `1px solid ${(busy || ocrBusy || !text.trim()) ? p.border : p.accent}`,
                padding: "0.45rem 1rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                cursor: (busy || ocrBusy || !text.trim()) ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!busy && !ocrBusy && text.trim()) { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; } }}
              onMouseLeave={(e) => { if (!busy && !ocrBusy && text.trim()) { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : ocrBusy ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
              {busy ? "Extracting…" : ocrBusy ? `OCR ${ocrProgress}%` : "Apply to form"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchLinkButton — pretty external-link button used in the search row.
// ---------------------------------------------------------------------------
function SearchLinkButton({ href, label, icon: Icon, primary }) {
  const p = usePalette();
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5"
      style={{
        backgroundColor: primary ? p.accent : "transparent",
        color: primary ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
        border: `1px solid ${primary ? p.accent : p.border}`,
        padding: "0.5rem 0.95rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        textDecoration: "none", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (primary) { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }
        else { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }
      }}
      onMouseLeave={(e) => {
        if (primary) { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }
        else { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }
      }}
    >
      <Icon size={12} /> {label} <ExternalLink size={11} />
    </a>
  );
}

// ---------------------------------------------------------------------------
// ScoreboardTile — compact KPI used at the top of the drawer.
// ---------------------------------------------------------------------------
function ScoreboardTile({ label, value, hint, color }) {
  const p = usePalette();
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProspectFormModal — capture / edit overlay. Lives inside the drawer; uses
// fixed positioning so it floats above the table without unmounting it.
// ---------------------------------------------------------------------------
function ProspectFormModal({ draft, setDraft, kindLabel, industries, stages, onClose, onSave, onRemove, isNew }) {
  const p = usePalette();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const status = stagesById[draft.status] || stages[0];
  const stageIndex = stages.findIndex((s) => s.id === draft.status);

  // Quick stage navigation — Move to next / previous so the operator can
  // advance the lead in one click instead of hunting in the chip strip.
  const moveStage = (delta) => {
    const next = stages[stageIndex + delta];
    if (next) set({ status: next.id });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-xl flex flex-col" style={{ backgroundColor: p.bgPage, borderInlineStart: `1px solid ${p.border}` }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div>
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              {isNew ? `New ${kindLabel.toLowerCase()} prospect` : `Edit prospect`}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.45rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1 }}>
              {draft.name || "Untitled prospect"}
            </div>
          </div>
          <button onClick={onClose} style={{ color: p.textMuted, padding: 4 }} onMouseEnter={(e) => e.currentTarget.style.color = p.accent} onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Capture-from-image — auto-fills the form from a business card,
              brochure, or website screenshot. Open by default for new
              prospects since it's usually the fastest way to start. */}
          <ImageImportPanel
            defaultOpen={isNew}
            onApply={(fields, sourceLabel) => {
              setDraft((d) => ({ ...d, ...fields, source: sourceLabel || d.source }));
            }}
          />

          {/* Pipeline stage — chip strip + step controls + action hint */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                Pipeline stage · {kindLabel}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => moveStage(-1)}
                  disabled={stageIndex <= 0}
                  title="Move to previous stage"
                  style={{
                    padding: "0.25rem 0.55rem",
                    backgroundColor: "transparent",
                    border: `1px solid ${stageIndex <= 0 ? p.border : p.textMuted}`,
                    color: stageIndex <= 0 ? p.border : p.textMuted,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: stageIndex <= 0 ? "not-allowed" : "pointer",
                  }}
                >‹ Back</button>
                <span style={{ color: p.textMuted, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif", fontVariantNumeric: "tabular-nums" }}>
                  {stageIndex + 1} / {stages.length}
                </span>
                <button
                  onClick={() => moveStage(1)}
                  disabled={stageIndex >= stages.length - 1}
                  title="Advance to next stage"
                  style={{
                    padding: "0.25rem 0.55rem",
                    backgroundColor: "transparent",
                    border: `1px solid ${stageIndex >= stages.length - 1 ? p.border : status.base}`,
                    color: stageIndex >= stages.length - 1 ? p.border : status.base,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: stageIndex >= stages.length - 1 ? "not-allowed" : "pointer",
                  }}
                >Advance ›</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {stages.map((s, idx) => {
                const sel = draft.status === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => set({ status: s.id })}
                    title={s.hint}
                    style={{
                      padding: "0.35rem 0.7rem",
                      backgroundColor: sel ? `${s.base}1F` : "transparent",
                      border: `1px solid ${sel ? s.base : p.border}`,
                      color: sel ? s.base : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      whiteSpace: "nowrap", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%",
                      backgroundColor: sel ? s.base : `${s.base}1F`,
                      color: sel ? "#fff" : s.base,
                      border: `1px solid ${s.base}`,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.58rem", fontWeight: 800,
                    }}>{idx + 1}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Stage description + suggested next action */}
            <div className="mt-3 p-3" style={{
              backgroundColor: `${status.base}0E`,
              border: `1px solid ${status.base}40`,
              borderInlineStart: `3px solid ${status.base}`,
            }}>
              <div style={{ color: status.base, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                What this means
              </div>
              <div style={{ color: p.textPrimary, fontSize: "0.84rem", marginTop: 3, lineHeight: 1.45 }}>
                {status.hint}
              </div>
              {status.nextAction && (
                <>
                  <div className="mt-2.5" style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                    Suggested next action
                  </div>
                  <div style={{ color: p.textSecondary, fontSize: "0.82rem", marginTop: 3, lineHeight: 1.45 }}>
                    → {status.nextAction}
                  </div>
                </>
              )}
              {status.aging != null && (
                <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 6 }}>
                  Target time in stage · ≤ {status.aging} days
                </div>
              )}
            </div>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Account name *">
              <TextField value={draft.name} onChange={(v) => set({ name: v })} placeholder={kindLabel === "Travel agent" ? "Al-Tayyar Travel Group" : "BAPCO"} />
            </FormGroup>
            <FormGroup label="Website">
              <TextField value={draft.website} onChange={(v) => set({ website: v })} placeholder="https://" />
            </FormGroup>
            <FormGroup label="Region">
              <SelectField
                value={draft.region}
                onChange={(v) => set({ region: v })}
                options={PROSPECT_REGIONS.map((r) => ({ value: r.id, label: r.label }))}
              />
            </FormGroup>
            <FormGroup label="City">
              <TextField value={draft.city} onChange={(v) => set({ city: v })} placeholder="Manama" />
            </FormGroup>
            <FormGroup label={kindLabel === "Travel agent" ? "Specialty" : "Industry"} className="sm:col-span-2">
              <SelectField
                value={draft.industry}
                onChange={(v) => set({ industry: v })}
                options={industries.map((i) => ({ value: i, label: i }))}
              />
            </FormGroup>
          </div>

          {/* Contact */}
          <div>
            <div style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.24em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
              Primary contact
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Contact name">
                <TextField value={draft.contactName} onChange={(v) => set({ contactName: v })} />
              </FormGroup>
              <FormGroup label="Contact phone">
                <TextField value={draft.contactPhone} onChange={(v) => set({ contactPhone: v })} placeholder="+973…" />
              </FormGroup>
              <FormGroup label="Contact email" className="sm:col-span-2">
                <TextField value={draft.contactEmail} onChange={(v) => set({ contactEmail: v })} placeholder="name@account.com" />
              </FormGroup>
            </div>
          </div>

          {/* Source + next action */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Source">
              <TextField value={draft.source} onChange={(v) => set({ source: v })} placeholder="Google search · Industry conference · Referral" />
            </FormGroup>
            <FormGroup label="Next action date">
              <input
                type="date"
                value={draft.nextActionAt || ""}
                onChange={(e) => set({ nextActionAt: e.target.value })}
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                }}
              />
            </FormGroup>
          </div>

          {/* Notes */}
          <FormGroup label="Notes">
            <textarea
              value={draft.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
              rows={4}
              placeholder="What did you learn? Volume potential, competitor relationships, decision-makers, next steps…"
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary,
                border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical",
              }}
            />
          </FormGroup>

          {/* Quick re-search row when editing */}
          {!isNew && draft.name && (
            <div className="p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
              <div style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 6 }}>
                Re-search the web
              </div>
              <div className="flex flex-wrap gap-2">
                <SearchLinkButton href={googleHref(`"${draft.name}" ${draft.industry || ""}`)} label="Google" icon={Search} />
                <SearchLinkButton href={linkedinHref(draft.name)} label="LinkedIn" icon={Linkedin} />
                <SearchLinkButton href={mapsHref(`${draft.name} ${draft.city || ""}`)} label="Maps" icon={Map} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex items-center gap-3" style={{ borderTop: `1px solid ${p.border}` }}>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          {!isNew && <GhostBtn small danger onClick={onRemove}><Trash2 size={11} /> Remove</GhostBtn>}
          <div className="flex-1" />
          <PrimaryBtn small onClick={onSave}><Save size={12} /> {isNew ? "Capture prospect" : "Save changes"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
