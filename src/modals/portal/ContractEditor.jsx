import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle, Building2, CalendarDays, Check, Coins, Download, ExternalLink,
  FileBadge, FileText, Loader2, Mail, MapPin, Paperclip, Percent, Phone, Plus,
  RotateCcw, Save, Send, Trash2, Upload, User2, X,
} from "lucide-react";
import { usePalette } from "./theme.jsx";
import { supabase, SUPABASE_CONFIGURED } from "../../lib/supabase.js";
import { formatCurrency, MEAL_PLANS, mealPlanSupplement, useData } from "../../data/store.jsx";
import { pushToast } from "./admin/ui.jsx";

// ---------------------------------------------------------------------------
// ContractEditor — full-page drawer that manages a corporate agreement or a
// travel-agency contract. Both share the same rate matrix (rooms × daily +
// monthly) and most metadata; the differences live in the Identity and
// Commercial cards which are switched on `kind`.
//
// Props:
//   open        boolean
//   onClose     () => void
//   contract    the working record (existing or { _new: true })
//   kind        "corporate" | "agent"
//   onSave      (record) => void  — called with the committed record
//   onRemove    (id) => void      — optional, shown when not _new
// ---------------------------------------------------------------------------

const ROOM_KEYS = [
  { key: "studio",   label: "Deluxe Studio",        rack: 38 },
  { key: "oneBed",   label: "One-Bedroom Suite",    rack: 44 },
  { key: "twoBed",   label: "Two-Bedroom Suite",    rack: 78 },
  { key: "threeBed", label: "Three-Bedroom Suite",  rack: 96 },
];

const PAYMENT_TERMS = ["Pre-payment (cash)", "On departure", "Net 0", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"];

const CORPORATE_INDUSTRIES = [
  "Banking & Finance", "Government", "Oil & Gas", "Aviation", "Consulting",
  "Technology", "Healthcare", "Industrial", "Consumer Goods", "Investment", "Other",
];

const STATUS_OPTIONS = [
  { value: "active",    label: "Active",     color: "success" },
  { value: "draft",     label: "Draft",      color: "warn"    },
  { value: "review",    label: "In review",  color: "warn"    },
  { value: "suspended", label: "Suspended",  color: "danger"  },
  { value: "expired",   label: "Expired",    color: "textDim" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const todayISO = () => new Date().toISOString().slice(0, 10);
const addYearISO = (iso, years = 1) => {
  const d = iso ? new Date(iso) : new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => {
  if (!a || !b) return 0;
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
};
const fmtDateShort = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// Signed-contract upload helper. Pushes the chosen file to the `contracts`
// bucket in Supabase Storage under `<kind>/<id>/signed-contract-<ts>.<ext>`
// and returns a long-lived signed URL so the partner portal can render the
// file without an auth round-trip. The bucket already exists with policies
// permitting authenticated uploads/reads, max 10 MB, and a restricted MIME
// allow-list (PDF + common image types).
// Uploads any compliance document attached to a contract (the countersigned
// agreement itself, the CR certificate, the VAT certificate, etc.) to the
// existing `contracts` Supabase Storage bucket and returns a long-lived
// signed URL so the partner portal can render the file without an auth
// round-trip. The bucket already exists with policies permitting
// authenticated uploads/reads, max 10 MB, and a restricted MIME
// allow-list (PDF + common image types).
//
//   docKind: "signed-contract" | "cr-certificate" | "vat-certificate"
//
// The storage path keeps a stable prefix per accountKind/accountId so a
// new upload of the same kind replaces the previous file (via upsert).
async function uploadComplianceDoc(file, accountKind, accountId, docKind) {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.");
  }
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  const path = `${accountKind}/${accountId}/${docKind}-${Date.now()}${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("contracts")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadErr) throw uploadErr;
  // Long-lived signed URL (1 year) — re-issued on every fresh upload so the
  // partner portal always points at the latest signed PDF.
  const { data, error: urlErr } = await supabase.storage
    .from("contracts")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (urlErr) throw urlErr;
  return {
    url: data.signedUrl,
    filename: file.name,
    uploadedAt: new Date().toISOString(),
    path,
  };
}

// Back-compat alias for the original helper signature — still used by
// SignedContractCard further down. New consumers should call
// uploadComplianceDoc directly with an explicit docKind.
const uploadSignedContract = (file, accountKind, accountId) =>
  uploadComplianceDoc(file, accountKind, accountId, "signed-contract");

const MAX_CONTRACT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — matches bucket policy
const ALLOWED_CONTRACT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// ─────────────────────────────────────────────────────────────────────────
// Meal-plan helpers — back-compat with single-default contracts.
//
// Old contracts only carried `defaultMealPlan` (one code). New contracts
// carry `availablePlans` (an array) PLUS `defaultMealPlan` (one of the
// items in the array). These helpers normalise either shape so every
// downstream consumer (matrix, document, booking creator) reads the
// same canonical list.
// ─────────────────────────────────────────────────────────────────────────
const VALID_PLAN_CODES = ["ro", "bb", "hb", "fb"];

export function ensurePlanList(availablePlans, defaultMealPlan) {
  // Honour an explicit availablePlans array first.
  if (Array.isArray(availablePlans) && availablePlans.length > 0) {
    const cleaned = availablePlans.filter((c) => VALID_PLAN_CODES.includes(c));
    // Always include RO — it's the rack baseline; we don't let a
    // contract render an empty plan list.
    if (!cleaned.includes("ro")) cleaned.unshift("ro");
    // If a default is set but missing from the picks, include it.
    if (defaultMealPlan && VALID_PLAN_CODES.includes(defaultMealPlan) && !cleaned.includes(defaultMealPlan)) {
      cleaned.push(defaultMealPlan);
    }
    return dedupeKeepOrder(cleaned);
  }
  // Legacy single-plan contract — derive the list from the default.
  if (defaultMealPlan && VALID_PLAN_CODES.includes(defaultMealPlan)) {
    return defaultMealPlan === "ro" ? ["ro"] : ["ro", defaultMealPlan];
  }
  return ["ro"];
}

export function resolveDefaultPlan(availablePlans, defaultMealPlan) {
  const list = ensurePlanList(availablePlans, defaultMealPlan);
  if (defaultMealPlan && list.includes(defaultMealPlan)) return defaultMealPlan;
  // Pick the highest-tier plan as a sensible fallback when the default
  // got removed — RO → BB → HB → FB ordering. Operators rarely want
  // RO as the booking default once they've negotiated meals.
  for (const code of ["fb", "hb", "bb", "ro"]) {
    if (list.includes(code)) return code;
  }
  return "ro";
}

function dedupeKeepOrder(arr) {
  const seen = new Set();
  const out  = [];
  for (const x of arr) { if (!seen.has(x)) { seen.add(x); out.push(x); } }
  return out;
}

// Default contract templates used when the caller passes a fresh draft.
export function defaultCorporateDraft(existingIds = []) {
  const yr = new Date().getFullYear();
  const next = String(existingIds.length + 1).padStart(3, "0");
  return {
    id: `AGR-${yr}-${next}`, account: "", industry: "Banking & Finance",
    signedOn: todayISO(), startsOn: todayISO(), endsOn: addYearISO(todayISO(), 1),
    status: "draft",
    dailyRates:   { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    weekendRates: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    monthlyRates: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    weekendUpliftPct: 0, taxIncluded: false, accommodationFee: 0,
    // Statutory registration on file — required for direct-billing
    // partners. CR (Commercial Registration) + VAT are kept with their
    // expiry dates so the renewal dashboard can flag accounts whose
    // documents lapse before the contract does. Certificates upload to
    // the same `contracts` Supabase Storage bucket as the signed
    // contract; per-doc URL / filename / uploadedAt / path captured so
    // the partner portal can render them without a re-auth.
    crNumber: "", crExpiry: "",
    crCertificateUrl: null, crCertificateFilename: null, crCertificateUploadedAt: null, crCertificatePath: null,
    vatNumber: "", vatExpiry: "",
    vatCertificateUrl: null, vatCertificateFilename: null, vatCertificateUploadedAt: null, vatCertificatePath: null,
    // Registered company address — used on the printable contract +
    // every billing document. Multi-line free text so the operator can
    // mirror exactly what's on the CR certificate.
    companyAddress: "",
    inclusions: { breakfast: false, lateCheckOut: false, parking: true, wifi: true, meetingRoom: false },
    // Meal plans negotiated under this contract. `availablePlans` is
    // the full menu the corporate / agency can pick from at booking
    // time (e.g. ["bb","hb"] means they can choose either BB or HB but
    // not FB). `defaultMealPlan` is the one that pre-fills on every
    // new booking; it must be in `availablePlans`. RO is the rack
    // baseline and is always implicitly available.
    availablePlans: ["ro"],
    defaultMealPlan: "ro",
    eventSupplements: [],
    cancellationPolicy: "Free cancellation up to 48h before arrival.",
    paymentTerms: "Net 30", creditLimit: 0,
    pocName: "", pocEmail: "", pocPhone: "", notes: "",
    targetNights: 0, ytdNights: 0, ytdSpend: 0,
    // Signed countersigned contract (populated by SignedContractCard).
    signedContractUrl: null, signedContractFilename: null, signedContractUploadedAt: null,
    _new: true,
  };
}

export function defaultAgencyDraft(existingIds = []) {
  const next = String(existingIds.length + 1).padStart(4, "0");
  return {
    id: `AGT-${next}`, name: "", contact: "",
    signedOn: todayISO(), startsOn: todayISO(), endsOn: addYearISO(todayISO(), 1),
    status: "draft",
    commissionPct: 10, marketingFundPct: 0,
    dailyNet:   { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    weekendNet: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    monthlyNet: { studio: 0, oneBed: 0, twoBed: 0, threeBed: 0 },
    weekendUpliftPct: 0, taxIncluded: false, accommodationFee: 0,
    // Statutory registration on file — see the corporate template
    // above for the field shape. Agencies typically carry both a
    // local CR and a VAT registration in their licensing jurisdiction.
    crNumber: "", crExpiry: "",
    crCertificateUrl: null, crCertificateFilename: null, crCertificateUploadedAt: null, crCertificatePath: null,
    vatNumber: "", vatExpiry: "",
    vatCertificateUrl: null, vatCertificateFilename: null, vatCertificateUploadedAt: null, vatCertificatePath: null,
    companyAddress: "",
    // See the corporate template for the availablePlans / defaultMealPlan
    // contract. Agencies often quote BB nets to their leisure clients;
    // admin can flip per-contract here.
    availablePlans: ["ro"],
    defaultMealPlan: "ro",
    eventSupplements: [],
    paymentTerms: "Net 30", creditLimit: 0,
    pocName: "", pocEmail: "", pocPhone: "", notes: "",
    ytdBookings: 0, ytdRevenue: 0, ytdCommission: 0, targetBookings: 0,
    // Signed countersigned contract (populated by SignedContractCard).
    signedContractUrl: null, signedContractFilename: null, signedContractUploadedAt: null,
    _new: true,
  };
}

export function ContractEditor({ open, onClose, contract, kind, onSave, onRemove }) {
  const p = usePalette();
  // Live rooms slice — drives the supplement matrix below the meal-plan
  // picker so the operator sees exactly what the negotiated default
  // costs across the property's suites. The rates themselves are
  // sourced from each room's `mealPlans` master in Rooms & Rates;
  // edits there flow through here automatically.
  const { rooms, eventSupplements: masterEvents, updateRoom } = useData();
  const [draft, setDraft] = useState(contract);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setRate = (mapKey, room, value) => setDraft((d) => ({
    ...d,
    [mapKey]: { ...(d[mapKey] || {}), [room]: Number(value) || 0 },
  }));
  const setInclusion = (key, on) => setDraft((d) => ({
    ...d, inclusions: { ...(d.inclusions || {}), [key]: on },
  }));

  const isCorporate = kind === "corporate";
  const partyName = isCorporate ? draft.account : draft.name;
  const dailyKey   = isCorporate ? "dailyRates"   : "dailyNet";
  const weekendKey = isCorporate ? "weekendRates" : "weekendNet";
  const monthlyKey = isCorporate ? "monthlyRates" : "monthlyNet";

  // Event-supplement helpers — keep all CRUD on the supplement list local
  // so the editor stays self-contained. The contract's `eventSupplements`
  // is a snapshot — operators can either build it from scratch or import
  // the active rows from the property-wide master (Property Info →
  // Event-period supplements) which gives them Eid / F1 / Ironman / NYE
  // out of the box, with per-contract supplement overrides.
  const addSupplement = () => set({
    eventSupplements: [
      ...(draft.eventSupplements || []),
      { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: "", fromDate: todayISO(), toDate: todayISO(), supplement: 0 },
    ],
  });
  // Pull every active event from the master into the contract, skipping
  // rows already present (matched by id then by name+from). Existing
  // overrides survive — we only add what's missing.
  const importFromMaster = () => {
    const existing = draft.eventSupplements || [];
    const existingKeys = new Set(existing.flatMap((e) => [e.id, `${e.name}|${e.fromDate}`].filter(Boolean)));
    const newRows = (masterEvents || [])
      .filter((m) => m && m.active !== false)
      .filter((m) => (m.scope || "all") === "all"
                  || (m.scope === "corporate" && isCorporate)
                  || (m.scope === "agent"     && !isCorporate))
      .filter((m) => !existingKeys.has(m.id) && !existingKeys.has(`${m.name}|${m.fromDate}`))
      .map((m) => ({
        // Generate a fresh id so the contract snapshot doesn't collide
        // with the master's id if the master row is later edited.
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${m.id}`,
        name: m.name,
        fromDate: m.fromDate,
        toDate: m.toDate,
        supplement: Number(m.supplement) || 0,
        sourceId: m.id,
        sourceLabel: "master",
      }));
    if (newRows.length === 0) {
      pushToast({ message: "All applicable master events are already on this contract.", kind: "warn" });
      return;
    }
    set({ eventSupplements: [...existing, ...newRows] });
    pushToast({ message: `Imported ${newRows.length} event${newRows.length === 1 ? "" : "s"} from the master.` });
  };
  // Replace the contract list with the master entirely — useful when the
  // operator wants a clean snapshot synchronised to the property's
  // current calendar.
  const resetFromMaster = () => {
    if (!masterEvents || masterEvents.length === 0) {
      pushToast({ message: "Master is empty — add events in Property Info first.", kind: "warn" });
      return;
    }
    if ((draft.eventSupplements || []).length > 0) {
      if (!confirm("Replace this contract's event supplements with a fresh snapshot from the master? Any per-contract overrides will be lost.")) return;
    }
    const rows = masterEvents
      .filter((m) => m && m.active !== false)
      .filter((m) => (m.scope || "all") === "all"
                  || (m.scope === "corporate" && isCorporate)
                  || (m.scope === "agent"     && !isCorporate))
      .map((m) => ({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${m.id}`,
        name: m.name,
        fromDate: m.fromDate,
        toDate: m.toDate,
        supplement: Number(m.supplement) || 0,
        sourceId: m.id,
        sourceLabel: "master",
      }));
    set({ eventSupplements: rows });
    pushToast({ message: `Loaded ${rows.length} event${rows.length === 1 ? "" : "s"} from the master.` });
  };
  const updateSupplement = (id, patch) => set({
    eventSupplements: (draft.eventSupplements || []).map((e) => e.id === id ? { ...e, ...patch } : e),
  });
  const removeSupplement = (id) => set({
    eventSupplements: (draft.eventSupplements || []).filter((e) => e.id !== id),
  });

  const remainingDays = useMemo(() => {
    const d = daysBetween(todayISO(), draft.endsOn);
    return d;
  }, [draft.endsOn]);
  const termDays = useMemo(() => daysBetween(draft.startsOn, draft.endsOn), [draft.startsOn, draft.endsOn]);

  const valid = (isCorporate ? !!draft.account?.trim() : !!draft.name?.trim()) && draft.startsOn && draft.endsOn;

  const save = () => {
    if (!valid) return;
    onSave?.(draft);
  };

  const remove = () => {
    if (!onRemove) return;
    if (!confirm(`Remove contract "${partyName || draft.id}"? This cannot be undone.`)) return;
    onRemove(draft.id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            {draft._new ? `New ${isCorporate ? "corporate" : "travel-agent"} contract` : `${isCorporate ? "Corporate" : "Travel-agent"} contract`} · {draft.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {partyName || (isCorporate ? "Untitled corporate" : "Untitled agency")}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 flex-shrink-0"
          style={{
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
            fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        >
          <X size={14} /> Close
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left: editable cards */}
            <div className="lg:col-span-2 space-y-6">
              {/* Identity */}
              <CECard title="Identity" icon={Building2}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CEField label={isCorporate ? "Account name" : "Agency name"}>
                    <CEInput
                      value={isCorporate ? draft.account : draft.name}
                      onChange={(v) => set(isCorporate ? { account: v } : { name: v })}
                      placeholder={isCorporate ? "e.g. ALBA Aluminium" : "e.g. Globepass Travel"}
                    />
                  </CEField>
                  {isCorporate ? (
                    <CEField label="Industry">
                      <CESelect value={draft.industry} onChange={(v) => set({ industry: v })} options={CORPORATE_INDUSTRIES} />
                    </CEField>
                  ) : (
                    <CEField label="Account email">
                      <CEInput value={draft.contact} onChange={(v) => set({ contact: v })} placeholder="ops@agency.com" />
                    </CEField>
                  )}
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <CEField label="Contract ID">
                    <CEInput value={draft.id} onChange={(v) => set({ id: v })} disabled={!draft._new} />
                  </CEField>
                  <CEField label="Status">
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map((opt) => {
                        const active = draft.status === opt.value;
                        const c = p[opt.color] || p.textMuted;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => set({ status: opt.value })}
                            style={{
                              padding: "0.35rem 0.75rem",
                              backgroundColor: active ? `${c}1F` : "transparent",
                              border: `1px solid ${active ? c : p.border}`,
                              color: active ? c : p.textSecondary,
                              fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </CEField>
                </div>
              </CECard>

              {/* Compliance / Statutory registration */}
              <ComplianceCard
                draft={draft}
                set={set}
                accountKind={kind === "corporate" ? "agreements" : "agencies"}
                p={p}
              />

              {/* Term */}
              <CECard title="Term" icon={CalendarDays}>
                <div className="grid sm:grid-cols-3 gap-4">
                  <CEField label="Signed on"><CEInput type="date" value={draft.signedOn} onChange={(v) => set({ signedOn: v })} /></CEField>
                  <CEField label="Starts on"><CEInput type="date" value={draft.startsOn} onChange={(v) => set({ startsOn: v })} /></CEField>
                  <CEField label="Ends on"><CEInput type="date" value={draft.endsOn} onChange={(v) => set({ endsOn: v })} /></CEField>
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textMuted }}>
                  <span>Term: <strong style={{ color: p.textPrimary }}>{Math.max(0, termDays)} days</strong></span>
                  <span style={{ color: p.textDim }}>·</span>
                  <span>
                    {remainingDays > 0
                      ? <>Expires in <strong style={{ color: remainingDays <= 60 ? p.warn : p.textPrimary }}>{remainingDays} days</strong></>
                      : remainingDays === 0
                        ? <strong style={{ color: p.warn }}>Expires today</strong>
                        : <strong style={{ color: p.danger }}>Expired {Math.abs(remainingDays)} days ago</strong>}
                  </span>
                </div>
              </CECard>

              {/* Rate matrix */}
              <CECard title="Negotiated rates" icon={Coins}
                action={
                  <span style={{
                    color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  }}>Per night · Per month · BHD</span>
                }
              >
                <div className="overflow-x-auto" style={{ border: `1px solid ${p.border}` }}>
                  <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
                    <thead>
                      <tr style={{ backgroundColor: p.bgPanelAlt }}>
                        <th className="text-start px-4 py-3" style={ceTh(p)}>Suite</th>
                        <th className="text-start px-4 py-3" style={ceTh(p)}>Rack</th>
                        <th className="text-start px-4 py-3" style={ceTh(p)}>Weekday {isCorporate ? "rate" : "net"}</th>
                        <th className="text-start px-4 py-3" style={ceTh(p)}>Weekend {isCorporate ? "rate" : "net"}</th>
                        <th className="text-start px-4 py-3" style={ceTh(p)}>Monthly {isCorporate ? "rate" : "net"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROOM_KEYS.map((r) => {
                        const daily   = Number(draft[dailyKey]?.[r.key]   || 0);
                        const weekend = Number(draft[weekendKey]?.[r.key] || 0);
                        const monthly = Number(draft[monthlyKey]?.[r.key] || 0);
                        const dailyDiscPct = r.rack > 0 && daily > 0 ? Math.round(((r.rack - daily) / r.rack) * 100) : 0;
                        const wkDiscPct = r.rack > 0 && weekend > 0 ? Math.round(((r.rack - weekend) / r.rack) * 100) : 0;
                        const monthlyVsDaily30 = daily * 30;
                        const monthlySavingsPct = monthlyVsDaily30 > 0 && monthly > 0
                          ? Math.round(((monthlyVsDaily30 - monthly) / monthlyVsDaily30) * 100)
                          : 0;
                        return (
                          <tr key={r.key} style={{ borderTop: `1px solid ${p.border}`, verticalAlign: "top" }}>
                            <td className="px-4 py-3" style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", whiteSpace: "nowrap" }}>{r.label}</td>
                            <td className="px-4 py-3" style={{ color: p.textMuted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>BHD {r.rack}</td>
                            <td className="px-4 py-3" style={{ minWidth: 130 }}>
                              <CEInput type="number" value={daily} onChange={(v) => setRate(dailyKey, r.key, v)} prefix="BHD" />
                              <div style={{
                                marginTop: 4, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                                color: dailyDiscPct >= 20 ? p.success : dailyDiscPct >= 10 ? p.warn : dailyDiscPct > 0 ? p.textPrimary : p.textDim,
                                fontWeight: 700, fontVariantNumeric: "tabular-nums",
                              }}>{daily > 0 ? `${dailyDiscPct}% off rack` : ""}</div>
                            </td>
                            <td className="px-4 py-3" style={{ minWidth: 130 }}>
                              <CEInput type="number" value={weekend} onChange={(v) => setRate(weekendKey, r.key, v)} prefix="BHD" />
                              <div style={{
                                marginTop: 4, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                                color: wkDiscPct >= 20 ? p.success : wkDiscPct >= 10 ? p.warn : wkDiscPct > 0 ? p.textPrimary : p.textDim,
                                fontWeight: 700, fontVariantNumeric: "tabular-nums",
                              }}>
                                {weekend > 0 ? `${wkDiscPct}% off rack` : daily > 0 ? <span style={{ color: p.textDim }}>uses uplift</span> : ""}
                              </div>
                            </td>
                            <td className="px-4 py-3" style={{ minWidth: 140 }}>
                              <CEInput type="number" value={monthly} onChange={(v) => setRate(monthlyKey, r.key, v)} prefix="BHD" />
                              <div style={{
                                marginTop: 4, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                                color: monthlySavingsPct >= 15 ? p.success : monthlySavingsPct >= 5 ? p.warn : p.textDim,
                                fontWeight: 700, fontVariantNumeric: "tabular-nums",
                              }}>
                                {monthly > 0 && daily > 0 ? `${monthlySavingsPct}% vs daily × 30` : ""}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid sm:grid-cols-3 gap-4">
                  <CEField label="Weekend uplift % (fallback)">
                    <CEInput type="number" value={draft.weekendUpliftPct || 0} onChange={(v) => set({ weekendUpliftPct: Number(v) })} suffix="%" />
                  </CEField>
                  <CEField label="Hotel accommodation fee · per night">
                    <CEInput type="number" value={draft.accommodationFee || 0} onChange={(v) => set({ accommodationFee: Number(v) })} prefix="BHD" />
                  </CEField>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 px-3 py-2.5"
                      style={{ border: `1px solid ${draft.taxIncluded ? p.accent : p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", cursor: "pointer", width: "100%" }}>
                      <input type="checkbox" checked={!!draft.taxIncluded} onChange={(e) => set({ taxIncluded: e.target.checked })} />
                      Inclusive of VAT &amp; service charges
                    </label>
                  </div>
                </div>
                <p className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
                  Weekday rates apply Sat–Wed; weekend rates apply Thu–Fri. Monthly rates apply once a single guest crosses 30 consecutive nights. The accommodation fee is charged on top of any rate (set to zero if rates are fully inclusive).
                </p>
              </CECard>

              {/* Event supplements — contract-level snapshot. Operators
                  can manually add one-off rows, or pull every active row
                  from the property-wide master (Property Info →
                  Event-period supplements). Per-contract supplement
                  overrides survive subsequent imports. */}
              <CECard title="Event-period supplements" icon={CalendarDays}
                action={
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(masterEvents || []).length > 0 && (
                      <>
                        <button onClick={importFromMaster} className="flex items-center gap-1.5"
                          title="Pull every active event from the property-wide master that isn't already on this contract."
                          style={{
                            padding: "0.4rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                            backgroundColor: "transparent",
                            fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
                        >
                          <Download size={11} /> Import from master
                        </button>
                        <button onClick={resetFromMaster} className="flex items-center gap-1.5"
                          title="Replace this contract's events with a fresh snapshot of the master. Drops any per-contract overrides."
                          style={{
                            padding: "0.4rem 0.85rem", border: `1px solid ${p.border}`, color: p.textMuted,
                            backgroundColor: "transparent",
                            fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = p.warn; e.currentTarget.style.borderColor = p.warn; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                        >
                          <RotateCcw size={11} /> Sync to master
                        </button>
                      </>
                    )}
                    <button onClick={addSupplement} className="flex items-center gap-1.5"
                      style={{
                        padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent,
                        backgroundColor: "transparent",
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        cursor: "pointer",
                      }}>
                      <Plus size={11} /> Add period
                    </button>
                  </div>
                }
              >
                {(draft.eventSupplements || []).length === 0 ? (
                  <div className="px-2 py-6 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                    No event supplements set.
                    {(masterEvents || []).length > 0 && (
                      <button onClick={importFromMaster} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 6, textDecoration: "underline" }}>
                        Import {(masterEvents || []).filter((m) => m.active !== false).length} from master →
                      </button>
                    )}
                    <span style={{ display: "block", marginTop: 6 }}>
                      or <button onClick={addSupplement} style={{ color: p.accent, fontWeight: 700, textDecoration: "underline" }}>add a custom period</button>.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draft.eventSupplements.map((evt) => (
                      <div key={evt.id} className="grid gap-2 items-end" style={{
                        gridTemplateColumns: "minmax(140px,1.4fr) minmax(120px,1fr) minmax(120px,1fr) minmax(110px,0.9fr) auto auto",
                        border: `1px solid ${evt.sourceLabel === "master" ? `${p.accent}40` : p.border}`,
                        borderInlineStart: `3px solid ${evt.sourceLabel === "master" ? p.accent : "transparent"}`,
                        padding: "0.6rem 0.7rem", backgroundColor: p.bgPanelAlt,
                      }}>
                        <CEField label="Event">
                          <CEInput value={evt.name} onChange={(v) => updateSupplement(evt.id, { name: v })} placeholder="e.g. Formula 1" />
                        </CEField>
                        <CEField label="From"><CEInput type="date" value={evt.fromDate} onChange={(v) => updateSupplement(evt.id, { fromDate: v })} /></CEField>
                        <CEField label="To"><CEInput type="date" value={evt.toDate}   onChange={(v) => updateSupplement(evt.id, { toDate: v })} /></CEField>
                        <CEField label="Supplement"><CEInput type="number" value={evt.supplement} onChange={(v) => updateSupplement(evt.id, { supplement: Number(v) })} prefix="BHD" /></CEField>
                        {/* Source chip — shows whether this row was
                            imported from the property master or was
                            added bespoke for this contract. Imported
                            rows are still per-contract editable (the
                            operator can override the supplement) and
                            won't be auto-rewritten by future master
                            edits unless they explicitly Sync. */}
                        <div style={{ alignSelf: "end", marginBottom: 0 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "0.35rem 0.55rem",
                            color: evt.sourceLabel === "master" ? p.accent : p.textMuted,
                            border: `1px solid ${evt.sourceLabel === "master" ? p.accent : p.border}`,
                            backgroundColor: evt.sourceLabel === "master" ? `${p.accent}10` : "transparent",
                            fontFamily: "'Manrope', sans-serif", fontSize: "0.56rem",
                            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                            whiteSpace: "nowrap",
                          }} title={evt.sourceLabel === "master"
                            ? "Imported from the property-wide master. Supplement is overridable per contract; master date edits don't auto-propagate."
                            : "Custom event added on this contract only."}>
                            {evt.sourceLabel === "master" ? <><Download size={9} /> Master</> : "Custom"}
                          </span>
                        </div>
                        <button onClick={() => removeSupplement(evt.id)} title="Remove period"
                          style={{
                            color: p.danger, padding: "0.4rem 0.55rem", border: `1px solid ${p.border}`,
                            alignSelf: "end", marginBottom: 0,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
                        ><Trash2 size={11} /></button>
                      </div>
                    ))}
                    <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55, marginTop: 12 }}>
                      Supplements apply per room, per night, on top of the contracted rate during the event window. Inclusive of starting and finishing dates. Manage the property-wide event list in <strong style={{ color: p.textSecondary }}>Property Info → Event-period supplements</strong>.
                    </p>
                  </div>
                )}
              </CECard>

              {/* Inclusions */}
              <CECard title="Inclusions">
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
                      <button
                        key={it.key}
                        onClick={() => setInclusion(it.key, !on)}
                        style={{
                          padding: "0.45rem 0.85rem",
                          border: `1px solid ${on ? p.accent : p.border}`,
                          backgroundColor: on ? `${p.accent}1F` : "transparent",
                          color: on ? p.accent : p.textSecondary,
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600,
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
                        }}
                      >
                        {on ? <Check size={12} /> : <Plus size={12} />}
                        {it.label}
                      </button>
                    );
                  })}
                </div>
                {/* Meal plans — multi-select. The operator picks every
                    plan negotiated under this {kind} (e.g. BB + HB),
                    then chooses which one pre-fills on new bookings as
                    the DEFAULT. RO (Room Only) is always implicitly
                    available since it's the rack-rate baseline. */}
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${p.border}` }}>
                  <ContractMealPlansPicker
                    p={p}
                    kind={kind}
                    availablePlans={draft.availablePlans}
                    defaultMealPlan={draft.defaultMealPlan}
                    onChange={(patch) => set(patch)}
                  />

                  {/* Live supplement matrix — per-suite × per-plan BHD,
                      sourced from each room's `mealPlans` master in
                      Rooms & Rates. Every picked plan column is
                      gold-tinted; the default one carries a star so
                      the operator sees the booking-creator pre-fill
                      at a glance. Operators can flip to inline edit
                      mode to adjust the master rates directly from
                      the contract (changes affect every contract /
                      tier / booking — clearly warned). */}
                  <MealPlanSupplementMatrix
                    p={p}
                    rooms={rooms}
                    selectedPlans={ensurePlanList(draft.availablePlans, draft.defaultMealPlan)}
                    defaultPlan={resolveDefaultPlan(draft.availablePlans, draft.defaultMealPlan)}
                    onUpdateRoom={updateRoom}
                  />
                </div>
              </CECard>

              {/* Commercial terms */}
              <CECard title="Commercial terms" icon={Percent}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CEField label="Payment terms">
                    <CESelect value={draft.paymentTerms} onChange={(v) => set({ paymentTerms: v })} options={PAYMENT_TERMS} />
                  </CEField>
                  <CEField label="Credit limit">
                    <CEInput type="number" value={draft.creditLimit || 0} onChange={(v) => set({ creditLimit: Number(v) })} prefix="BHD" />
                  </CEField>
                  {isCorporate ? (
                    <CEField label="Annual target nights">
                      <CEInput type="number" value={draft.targetNights || 0} onChange={(v) => set({ targetNights: Number(v) })} suffix="nights" />
                    </CEField>
                  ) : (
                    <>
                      <CEField label="Commission %">
                        <CEInput type="number" value={draft.commissionPct ?? 10} onChange={(v) => set({ commissionPct: Number(v) })} suffix="%" />
                      </CEField>
                      <CEField label="Marketing fund %">
                        <CEInput type="number" value={draft.marketingFundPct ?? 0} onChange={(v) => set({ marketingFundPct: Number(v) })} suffix="%" />
                      </CEField>
                      <CEField label="Annual target bookings">
                        <CEInput type="number" value={draft.targetBookings || 0} onChange={(v) => set({ targetBookings: Number(v) })} suffix="bkgs" />
                      </CEField>
                    </>
                  )}
                </div>
                <div className="mt-4">
                  <CEField label="Cancellation policy">
                    <textarea
                      value={draft.cancellationPolicy || ""}
                      onChange={(e) => set({ cancellationPolicy: e.target.value })}
                      rows={2}
                      className="w-full outline-none"
                      style={{
                        backgroundColor: p.inputBg, color: p.textPrimary,
                        border: `1px solid ${p.border}`, padding: "0.55rem 0.75rem",
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical",
                      }}
                    />
                  </CEField>
                </div>
              </CECard>

              {/* Signed contract — operator-uploaded PDF / image of the
                  countersigned document. Stored in Supabase Storage (bucket
                  "contracts") behind a long-lived signed URL so the partner
                  portal can render it without an auth round-trip. */}
              <SignedContractCard
                draft={draft}
                set={set}
                accountKind={isCorporate ? "agreements" : "agencies"}
              />

              {/* Point of contact */}
              <CECard title="Point of contact" icon={User2}>
                <div className="grid sm:grid-cols-3 gap-4">
                  <CEField label="Name"><CEInput value={draft.pocName || ""} onChange={(v) => set({ pocName: v })} /></CEField>
                  <CEField label="Email"><CEInput type="email" value={draft.pocEmail || ""} onChange={(v) => set({ pocEmail: v })} /></CEField>
                  <CEField label="Phone"><CEInput value={draft.pocPhone || ""} onChange={(v) => set({ pocPhone: v })} placeholder="+973…" /></CEField>
                </div>
              </CECard>

              {/* Notes */}
              <CECard title="Internal notes" icon={FileText}>
                <textarea
                  value={draft.notes || ""}
                  onChange={(e) => set({ notes: e.target.value })}
                  rows={4}
                  placeholder="Allocation preferences, billing quirks, key contacts on holiday, etc."
                  className="w-full outline-none"
                  style={{
                    backgroundColor: p.inputBg, color: p.textPrimary,
                    border: `1px solid ${p.border}`, padding: "0.7rem 0.85rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", resize: "vertical",
                  }}
                />
              </CECard>

              {/* Performance — only on existing contracts */}
              {!draft._new && (
                <CECard title="Performance · YTD" icon={Send}>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {isCorporate ? (
                      <>
                        <CEField label="YTD nights">
                          <CEInput type="number" value={draft.ytdNights || 0} onChange={(v) => set({ ytdNights: Number(v) })} />
                        </CEField>
                        <CEField label="YTD spend">
                          <CEInput type="number" value={draft.ytdSpend || 0} onChange={(v) => set({ ytdSpend: Number(v) })} prefix="BHD" />
                        </CEField>
                        <CEField label="Target progress">
                          <div className="px-3 py-2.5" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                            <div style={{ color: p.accent, fontWeight: 700, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontVariantNumeric: "tabular-nums" }}>
                              {Math.round(((draft.ytdNights || 0) / Math.max(1, draft.targetNights || 1)) * 100)}%
                            </div>
                          </div>
                        </CEField>
                      </>
                    ) : (
                      <>
                        <CEField label="YTD bookings">
                          <CEInput type="number" value={draft.ytdBookings || 0} onChange={(v) => set({ ytdBookings: Number(v) })} />
                        </CEField>
                        <CEField label="YTD revenue">
                          <CEInput type="number" value={draft.ytdRevenue || 0} onChange={(v) => set({ ytdRevenue: Number(v) })} prefix="BHD" />
                        </CEField>
                        <CEField label="YTD commission paid">
                          <CEInput type="number" value={draft.ytdCommission || 0} onChange={(v) => set({ ytdCommission: Number(v) })} prefix="BHD" />
                        </CEField>
                      </>
                    )}
                  </div>
                </CECard>
              )}
            </div>

            {/* Right: sticky preview */}
            <div className="lg:sticky lg:top-4 self-start">
              <ContractPreview draft={draft} kind={kind} />
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
        {!valid && (
          <span className="inline-flex items-center gap-1.5" style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
            <AlertCircle size={12} /> {isCorporate ? "Account name" : "Agency name"} and term dates are required
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
            cursor: valid ? "pointer" : "default",
          }}><Save size={12} /> {draft._new ? "Create contract" : "Save changes"}</button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContractPreview — sticky right-rail summary, mirrors what the partner
// portal will show on the contract row at a glance.
// ---------------------------------------------------------------------------
function ContractPreview({ draft, kind }) {
  const p = usePalette();
  const isCorporate = kind === "corporate";
  const dailyKey   = isCorporate ? "dailyRates"   : "dailyNet";
  const monthlyKey = isCorporate ? "monthlyRates" : "monthlyNet";

  const totalDailySavings = useMemo(() => {
    const rack = ROOM_KEYS.reduce((s, r) => s + r.rack, 0);
    const neg  = ROOM_KEYS.reduce((s, r) => s + Number(draft[dailyKey]?.[r.key] || 0), 0);
    return { rack, neg, savings: rack - neg, pct: rack > 0 ? Math.round(((rack - neg) / rack) * 100) : 0 };
  }, [draft, dailyKey]);

  const monthlyTotal = useMemo(() => ROOM_KEYS.reduce((s, r) => s + Number(draft[monthlyKey]?.[r.key] || 0), 0), [draft, monthlyKey]);

  const status = STATUS_OPTIONS.find((s) => s.value === draft.status) || STATUS_OPTIONS[0];
  const statusColor = p[status.color] || p.textMuted;

  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          Contract summary
        </div>
        <span style={{
          fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          padding: "2px 7px", color: statusColor, border: `1px solid ${statusColor}`,
        }}>{status.label}</span>
      </div>
      <div className="p-5 space-y-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
        <PreviewRow label="ID"   value={draft.id} mono accent />
        <PreviewRow label={isCorporate ? "Account" : "Agency"} value={isCorporate ? draft.account || "—" : draft.name || "—"} bold />
        {isCorporate
          ? <PreviewRow label="Industry" value={draft.industry || "—"} />
          : <PreviewRow label="Commission" value={`${draft.commissionPct ?? 0}%${draft.marketingFundPct ? ` + ${draft.marketingFundPct}% MF` : ""}`} accent />
        }
        <PreviewRow label="Term" value={`${fmtDateShort(draft.startsOn)} → ${fmtDateShort(draft.endsOn)}`} />
        <PreviewRow label="Payment" value={draft.paymentTerms || "—"} />
        <PreviewRow label="Credit limit" value={draft.creditLimit ? formatCurrency(Number(draft.creditLimit)) : "—"} />
        {draft.taxIncluded && <PreviewRow label="Tax" value="Inclusive" muted />}
      </div>
      <div className="px-5 pt-3 pb-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, borderTop: `1px solid ${p.border}` }}>
        Rate matrix
      </div>
      <div className="px-5 pb-3 space-y-1.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
        {ROOM_KEYS.map((r) => {
          const daily   = Number(draft[dailyKey]?.[r.key]   || 0);
          const monthly = Number(draft[monthlyKey]?.[r.key] || 0);
          return (
            <div key={r.key} className="flex items-baseline justify-between gap-3">
              <span style={{ color: p.textSecondary }}>{r.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: p.textPrimary }}>
                <strong>{daily ? `BHD ${daily}` : "—"}</strong>
                <span style={{ color: p.textMuted, fontSize: "0.7rem" }}> /night</span>
                <span style={{ color: p.textDim, padding: "0 6px" }}>·</span>
                <strong>{monthly ? formatCurrency(monthly) : "—"}</strong>
                <span style={{ color: p.textMuted, fontSize: "0.7rem" }}> /month</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          Avg discount vs rack
        </span>
        <span style={{ color: totalDailySavings.pct >= 20 ? p.success : totalDailySavings.pct >= 10 ? p.warn : p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600 }}>
          {totalDailySavings.neg > 0 ? `${totalDailySavings.pct}%` : "—"}
        </span>
      </div>
      {monthlyTotal > 0 && (
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${p.border}` }}>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Total monthly basket
          </span>
          <span style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(monthlyTotal)}
          </span>
        </div>
      )}

      {Number(draft.accommodationFee) > 0 && (
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${p.border}` }}>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Accommodation fee
          </span>
          <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            + {formatCurrency(Number(draft.accommodationFee))}/night
          </span>
        </div>
      )}

      {(draft.eventSupplements || []).length > 0 && (
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${p.border}` }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Event supplements
            </span>
            <span style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontWeight: 700 }}>
              {draft.eventSupplements.length} period{draft.eventSupplements.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1.5">
            {draft.eventSupplements.map((evt) => (
              <div key={evt.id} className="flex items-baseline justify-between gap-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                <span style={{ color: p.textSecondary }}>
                  {evt.name || "(unnamed)"}
                  <span style={{ color: p.textDim, marginInlineStart: 6, fontSize: "0.7rem" }}>
                    {fmtDateShort(evt.fromDate)}{evt.fromDate !== evt.toDate ? ` → ${fmtDateShort(evt.toDate)}` : ""}
                  </span>
                </span>
                <span style={{ color: p.warn, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>+BHD {evt.supplement}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {draft.sourceDoc && (
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
          <div className="flex items-start gap-2">
            <FileText size={11} style={{ color: p.accent, marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Imported from
              </div>
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600, marginTop: 2, wordBreak: "break-word" }}>
                {draft.sourceDoc}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POC summary */}
      {(draft.pocName || draft.pocEmail || draft.pocPhone) && (
        <div className="px-5 py-3 space-y-1.5" style={{ borderTop: `1px solid ${p.border}` }}>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Point of contact
          </div>
          {draft.pocName  && <div className="flex items-center gap-2" style={{ color: p.textPrimary, fontSize: "0.82rem" }}><User2 size={11} style={{ color: p.accent }} /> {draft.pocName}</div>}
          {draft.pocEmail && <div className="flex items-center gap-2" style={{ color: p.textSecondary, fontSize: "0.78rem" }}><Mail size={11} style={{ color: p.accent }} /> {draft.pocEmail}</div>}
          {draft.pocPhone && <div className="flex items-center gap-2" style={{ color: p.textSecondary, fontSize: "0.78rem" }}><Phone size={11} style={{ color: p.accent }} /> {draft.pocPhone}</div>}
        </div>
      )}
    </div>
  );
}

function PreviewRow({ label, value, mono, bold, accent, muted }) {
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

// ---------------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────
// ComplianceCard — statutory registration block on every corporate /
// agency contract. Operators capture:
//   • Commercial Registration (CR) number + expiry + uploaded certificate
//   • VAT registration number + expiry + uploaded certificate
//   • Company address as it appears on the CR (free-text multi-line)
//
// All three pieces are required by Bahraini accounting for direct-billing
// partners. Expiry dates drive a renewal warning chip (amber within 30
// days, red once lapsed) so the renewal dashboard can flag accounts that
// will lose their billing privilege before the contract itself expires.
// ─────────────────────────────────────────────────────────────────────────
function ComplianceCard({ draft, set, accountKind, p }) {
  return (
    <CECard title="Statutory registration" icon={FileBadge}
      action={<ComplianceExpiryChips draft={draft} p={p} />}
    >
      <div className="space-y-5">
        {/* CR row */}
        <ComplianceRow
          p={p}
          label="Commercial Registration (CR)"
          numberField="crNumber"
          numberPlaceholder="e.g. 12345-1"
          expiryField="crExpiry"
          urlField="crCertificateUrl"
          filenameField="crCertificateFilename"
          uploadedAtField="crCertificateUploadedAt"
          pathField="crCertificatePath"
          docKind="cr-certificate"
          draft={draft}
          set={set}
          accountKind={accountKind}
        />
        {/* VAT row */}
        <ComplianceRow
          p={p}
          label="VAT Registration"
          numberField="vatNumber"
          numberPlaceholder="e.g. 200012345600002"
          expiryField="vatExpiry"
          urlField="vatCertificateUrl"
          filenameField="vatCertificateFilename"
          uploadedAtField="vatCertificateUploadedAt"
          pathField="vatCertificatePath"
          docKind="vat-certificate"
          draft={draft}
          set={set}
          accountKind={accountKind}
        />
        {/* Company address */}
        <div>
          <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Registered company address
          </div>
          <textarea
            value={draft.companyAddress || ""}
            onChange={(e) => set({ companyAddress: e.target.value })}
            rows={3}
            placeholder={"Building / road · area / block · city · country\nas it appears on the CR certificate"}
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`, padding: "0.55rem 0.75rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
              lineHeight: 1.55, resize: "vertical",
            }}
          />
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 4, lineHeight: 1.55 }}>
            Mirrored on the printable contract's "Issued to" header and on every billing document for this partner. Keep it identical to the CR certificate so banking matches.
          </div>
        </div>
      </div>
    </CECard>
  );
}

// One row inside the ComplianceCard — number input + date input + upload
// affordance. Re-used for CR and VAT so the two rows render identically.
function ComplianceRow({
  p, label, numberField, numberPlaceholder, expiryField,
  urlField, filenameField, uploadedAtField, pathField, docKind,
  draft, set, accountKind,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const hasFile  = !!draft[urlField];
  const expiry   = draft[expiryField] || "";
  const expiryState = computeExpiryState(expiry);

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (!SUPABASE_CONFIGURED) {
      pushToast({ message: "Supabase isn't configured — uploads are disabled in this environment.", kind: "error" });
      return;
    }
    if (file.size > MAX_CONTRACT_UPLOAD_BYTES) {
      pushToast({ message: "File too large. Max 10 MB.", kind: "error" });
      return;
    }
    if (file.type && !ALLOWED_CONTRACT_MIME.includes(file.type)) {
      pushToast({ message: "Unsupported file type. Use PDF or an image.", kind: "error" });
      return;
    }
    setBusy(true);
    try {
      const { url, filename, uploadedAt, path } = await uploadComplianceDoc(file, accountKind, draft.id, docKind);
      set({
        [urlField]: url,
        [filenameField]: filename,
        [uploadedAtField]: uploadedAt,
        [pathField]: path,
      });
      pushToast({ message: `${label} uploaded · ${filename}` });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ContractEditor] compliance upload failed", err);
      pushToast({ message: `Upload failed · ${err?.message || "unknown error"}`, kind: "error" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    if (!confirm(`Remove the uploaded ${label} certificate from this record? The file in storage will be left in place.`)) return;
    set({
      [urlField]: null,
      [filenameField]: null,
      [uploadedAtField]: null,
      [pathField]: null,
    });
    pushToast({ message: `${label} certificate detached. Remember to save.` });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          {label}
        </div>
        {expiryState.chip && (
          <span style={{
            color: expiryState.color, backgroundColor: `${expiryState.color}10`,
            border: `1px solid ${expiryState.color}`,
            padding: "2px 7px", fontFamily: "'Manrope', sans-serif",
            fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
          }}>
            {expiryState.chip}
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-[1.4fr,1fr] gap-3">
        <CEField label="Number">
          <CEInput
            value={draft[numberField] || ""}
            onChange={(v) => set({ [numberField]: v })}
            placeholder={numberPlaceholder}
          />
        </CEField>
        <CEField label="Expires on">
          <CEInput
            type="date"
            value={expiry}
            onChange={(v) => set({ [expiryField]: v })}
          />
        </CEField>
      </div>
      {/* Upload widget */}
      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {hasFile ? (
          <div className="flex items-start gap-3 flex-wrap" style={{
            padding: "0.7rem 0.85rem",
            backgroundColor: p.bgPanelAlt,
            border: `1px solid ${p.border}`,
          }}>
            <FileText size={18} style={{ color: p.accent, flexShrink: 0, marginTop: 2 }} />
            <div className="min-w-0 flex-1">
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", fontWeight: 700, wordBreak: "break-word" }}>
                {draft[filenameField] || "Certificate"}
              </div>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 2 }}>
                {draft[uploadedAtField]
                  ? <>Uploaded · {fmtDateShort(draft[uploadedAtField].slice(0, 10))}</>
                  : "Uploaded"}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <a
                href={draft[urlField]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
                style={{
                  padding: "0.3rem 0.7rem", border: `1px solid ${p.accent}`, color: p.accent,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={10} /> Open
              </a>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5"
                style={{
                  padding: "0.3rem 0.7rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textSecondary; }}
              >
                {busy ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />} Replace
              </button>
              <button
                onClick={clear}
                disabled={busy}
                title={`Detach uploaded ${label} certificate`}
                className="inline-flex items-center"
                style={{
                  padding: "0.3rem 0.45rem", border: `1px solid ${p.border}`, color: p.danger,
                  backgroundColor: "transparent",
                  cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
                }}
                onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = p.danger; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3"
            style={{
              padding: "0.9rem 1rem",
              backgroundColor: p.bgPanelAlt,
              border: `1.5px dashed ${p.border}`,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
              fontFamily: "'Manrope', sans-serif",
            }}
            onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" style={{ color: p.accent }} /> : <Upload size={14} style={{ color: p.accent }} />}
            <div className="text-start">
              <div style={{ color: p.textPrimary, fontSize: "0.8rem", fontWeight: 700 }}>
                {busy ? "Uploading…" : `Upload ${label} certificate`}
              </div>
              <div style={{ color: p.textMuted, fontSize: "0.68rem", marginTop: 1 }}>
                PDF or image · max 10 MB
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

// Renders a small expiry-status chip per compliance row. Returns null
// (i.e. nothing rendered) when no expiry is set so a fresh draft
// doesn't show a green "valid" badge before the operator has filled
// anything in.
function computeExpiryState(iso) {
  if (!iso) return { chip: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(iso); exp.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((exp - today) / 86400000);
  if (daysLeft < 0)  return { chip: `Expired ${Math.abs(daysLeft)}d ago`, color: "#9A3A30" };
  if (daysLeft === 0) return { chip: "Expires today", color: "#B8852E" };
  if (daysLeft <= 30) return { chip: `Expires in ${daysLeft}d`, color: "#B8852E" };
  return { chip: `Valid · ${daysLeft}d left`, color: "#5C8A4E" };
}

// Header chip for the ComplianceCard that aggregates CR + VAT status.
// Shows red when either is expired, amber when either is within 30
// days, and a quiet "On file" pill when both are valid (and uploaded).
function ComplianceExpiryChips({ draft, p }) {
  const cr  = computeExpiryState(draft.crExpiry);
  const vat = computeExpiryState(draft.vatExpiry);
  const worst = [cr, vat]
    .filter((s) => s.chip)
    .reduce((acc, s) => {
      if (!acc) return s;
      // Red > Amber > Green priority
      const order = { "#9A3A30": 3, "#B8852E": 2, "#5C8A4E": 1 };
      return (order[s.color] || 0) > (order[acc.color] || 0) ? s : acc;
    }, null);
  if (!worst) return null;
  // Label uses CR / VAT shorthand for the worst-state document so the
  // operator immediately knows which one to chase.
  const tag = (() => {
    const worstIsCR  = worst === cr;
    const worstIsVAT = worst === vat;
    if (worstIsCR && worstIsVAT) return "CR/VAT";
    if (worstIsCR)  return "CR";
    if (worstIsVAT) return "VAT";
    return "";
  })();
  return (
    <span style={{
      color: worst.color, backgroundColor: `${worst.color}10`,
      border: `1px solid ${worst.color}`,
      padding: "2px 8px", fontFamily: "'Manrope', sans-serif",
      fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
    }}>
      {tag} · {worst.chip}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SignedContractCard — uploads a countersigned contract PDF/image to Supabase
// Storage and exposes the resulting signed URL + filename + uploaded-at on
// the draft. The card renders the current attachment when present and offers
// a "Replace" affordance; otherwise it shows the upload-only state.
// ---------------------------------------------------------------------------
function SignedContractCard({ draft, set, accountKind }) {
  const p = usePalette();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const hasFile = !!draft.signedContractUrl;

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (!SUPABASE_CONFIGURED) {
      pushToast({ message: "Supabase isn't configured — uploads are disabled in this environment.", kind: "error" });
      return;
    }
    if (file.size > MAX_CONTRACT_UPLOAD_BYTES) {
      pushToast({ message: "File too large. Max 10 MB.", kind: "error" });
      return;
    }
    if (file.type && !ALLOWED_CONTRACT_MIME.includes(file.type)) {
      pushToast({ message: "Unsupported file type. Use PDF or an image.", kind: "error" });
      return;
    }
    setBusy(true);
    try {
      const { url, filename, uploadedAt } = await uploadSignedContract(file, accountKind, draft.id);
      set({
        signedContractUrl: url,
        signedContractFilename: filename,
        signedContractUploadedAt: uploadedAt,
      });
      pushToast({ message: `Signed contract uploaded · ${filename}` });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ContractEditor] upload failed", err);
      pushToast({ message: `Upload failed · ${err?.message || "unknown error"}`, kind: "error" });
    } finally {
      setBusy(false);
      // Reset the input so re-picking the same file still fires onChange
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    if (!confirm("Remove the uploaded signed contract from this record? The file in storage will be left in place.")) return;
    set({
      signedContractUrl: null,
      signedContractFilename: null,
      signedContractUploadedAt: null,
    });
    pushToast({ message: "Signed contract detached. Remember to save." });
  };

  return (
    <CECard title="Signed contract" icon={Paperclip}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {hasFile ? (
        <div className="flex items-start gap-3 flex-wrap" style={{
          padding: "0.85rem 1rem",
          backgroundColor: p.bgPanelAlt,
          border: `1px solid ${p.border}`,
        }}>
          <FileText size={20} style={{ color: p.accent, flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0 flex-1">
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", fontWeight: 700, wordBreak: "break-word" }}>
              {draft.signedContractFilename || "Signed contract"}
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 2 }}>
              {draft.signedContractUploadedAt
                ? <>Uploaded · {fmtDateShort(draft.signedContractUploadedAt.slice(0, 10))}</>
                : "Uploaded"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={draft.signedContractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <ExternalLink size={11} /> Open
            </a>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
              }}
              onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textSecondary; }}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Replace
            </button>
            <button
              onClick={clear}
              disabled={busy}
              title="Detach uploaded contract"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.55rem", border: `1px solid ${p.border}`, color: p.danger,
                cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
              }}
              onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = p.danger; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3"
          style={{
            padding: "1.4rem 1rem",
            backgroundColor: p.bgPanelAlt,
            border: `1.5px dashed ${p.border}`,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
            fontFamily: "'Manrope', sans-serif",
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" style={{ color: p.accent }} /> : <Upload size={18} style={{ color: p.accent }} />}
          <div className="text-start">
            <div style={{ color: p.textPrimary, fontSize: "0.86rem", fontWeight: 700 }}>
              {busy ? "Uploading…" : "Upload signed contract"}
            </div>
            <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
              PDF or image · max 10 MB
            </div>
          </div>
        </button>
      )}
      <p className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", lineHeight: 1.55 }}>
        The countersigned contract is stored privately in Supabase Storage and shared with the partner via a long-lived signed URL. Replace whenever an amendment is signed.
      </p>
    </CECard>
  );
}

// ---------------------------------------------------------------------------
// CECard / CEField / CEInput / CESelect — local primitives so this editor is
// self-contained without depending on the admin/ui kit (which lives behind
// a different palette/path).
// ---------------------------------------------------------------------------
function CECard({ title, icon: Icon, action, children }) {
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

function CEField({ label, children }) {
  const p = usePalette();
  return (
    <label className="block">
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function CEInput({ value, onChange, type = "text", placeholder, prefix, suffix, disabled }) {
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

function CESelect({ value, onChange, options }) {
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

function ceTh(p) {
  return {
    fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase",
    color: p.textMuted, fontWeight: 700,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MealPlanSupplementMatrix
//   Renders a rooms × meal-plans table showing the per-adult-per-night
//   supplement (BHD) for each combination, sourced from each room's
//   `mealPlans` master (Rooms & Rates → Meal plans card). The column for
//   the currently-picked default plan is gold-tinted so the operator
//   immediately sees what they've committed to.
//
//   This component is intentionally READ-ONLY — operators edit the
//   master rates in one place (Rooms & Rates) so they stay consistent
//   across contracts, agencies, tiers, and walk-up bookings.
//
//   Exported so the Loyalty tier editor (and any future surface that
//   picks a default meal plan) can reuse the exact same matrix without
//   duplication.
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// ContractMealPlansPicker
//   Multi-select chip row for the meal plans negotiated under a
//   contract / tier, plus a star toggle on each picked chip that lets
//   the operator nominate one as the booking-creator default.
//
//   State protocol — emits one consolidated patch via `onChange`:
//     onChange({ availablePlans, defaultMealPlan })
//
//   • Tapping an unpicked chip → adds it to availablePlans. The very
//     first non-RO pick auto-becomes the default (saves an extra click).
//   • Tapping the star on a picked chip → makes it the new default.
//   • Tapping the body of a picked, non-default chip → removes it.
//   • Tapping the body of the picked DEFAULT chip → no-op (operators
//     must change the default first, otherwise they'd lose it
//     accidentally).
//   • RO is always implicitly available; the chip stays clickable so
//     RO can be set as the default ("no F&B negotiated") without
//     anything else picked.
// ─────────────────────────────────────────────────────────────────────────
function ContractMealPlansPicker({ p, kind, availablePlans, defaultMealPlan, onChange }) {
  const isCorporate = kind === "corporate";
  const plans       = ensurePlanList(availablePlans, defaultMealPlan);
  const def         = resolveDefaultPlan(availablePlans, defaultMealPlan);

  const isPicked  = (code) => plans.includes(code);
  const isDefault = (code) => code === def;

  const togglePlan = (code) => {
    if (code === "ro") {
      // RO is always available; clicking it just makes it the default
      // (useful for "no F&B negotiated"). Other plans can stay picked.
      onChange({ availablePlans: plans, defaultMealPlan: "ro" });
      return;
    }
    if (isPicked(code)) {
      if (isDefault(code)) {
        // Defaults can't be removed by a single click — promote
        // another plan first. Pick the next-highest tier as a
        // sensible fallback, or fall back to RO.
        const candidates = plans.filter((c) => c !== code);
        const nextDefault = ["fb", "hb", "bb", "ro"].find((c) => candidates.includes(c)) || "ro";
        const nextList = candidates.length > 0 ? candidates : ["ro"];
        onChange({ availablePlans: nextList, defaultMealPlan: nextDefault });
        return;
      }
      // Drop a non-default plan.
      onChange({
        availablePlans: plans.filter((c) => c !== code),
        defaultMealPlan: def,
      });
      return;
    }
    // Adding a new plan. If this is the first non-RO plan picked,
    // promote it to default automatically.
    const nextList    = dedupeKeepOrder([...plans, code]);
    const nextDefault = def === "ro" && code !== "ro" ? code : def;
    onChange({ availablePlans: nextList, defaultMealPlan: nextDefault });
  };

  const makeDefault = (code) => {
    // Star toggle — always sets the default. If the chip wasn't picked
    // yet, add it first.
    const nextList = isPicked(code) ? plans : dedupeKeepOrder([...plans, code]);
    onChange({ availablePlans: nextList, defaultMealPlan: code });
  };

  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          Meal plans negotiated
        </div>
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4, lineHeight: 1.5, maxWidth: 380 }}>
          Pick every plan available under this {isCorporate ? "account" : "agency"}. Tap the <strong style={{ color: p.accent }}>★</strong> on any picked plan to make it the booking-creator default (pre-fills on every reservation we create on behalf of this {isCorporate ? "account" : "agency"}). Per-stay overrides remain available.
        </div>
        <div className="mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted }}>
          Picked: <strong style={{ color: p.accent }}>{plans.map((c) => c.toUpperCase()).join(" · ")}</strong>
          {" · Default: "}<strong style={{ color: p.accent }}>{def.toUpperCase()}</strong>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MEAL_PLANS.map((m) => {
          const picked  = isPicked(m.code);
          const defOne  = isDefault(m.code);
          // Three visual states:
          //   default-picked  — gold-filled with star
          //   other-picked    — gold-outlined with check
          //   unpicked        — neutral outline
          const bg = defOne ? `${p.accent}33` : picked ? `${p.accent}10` : "transparent";
          const fg = defOne ? p.accent       : picked ? p.accent       : p.textSecondary;
          const bc = defOne ? p.accent       : picked ? p.accent       : p.border;
          return (
            <div key={m.code} className="inline-flex" style={{ position: "relative" }}>
              <button
                onClick={() => togglePlan(m.code)}
                style={{
                  padding: "0.45rem 0.85rem",
                  paddingInlineEnd: picked ? "1.85rem" : "0.85rem",
                  border: `1px solid ${bc}`,
                  borderInlineEnd: picked ? "none" : `1px solid ${bc}`,
                  backgroundColor: bg, color: fg,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                  letterSpacing: "0.04em", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
                aria-pressed={picked}
                title={
                  defOne ? `${m.label} · current default`
                    : picked ? `${m.label} · click to remove (or tap ★ to make default)`
                    : `${m.label} · click to add`
                }
              >
                {defOne ? "★ " : picked ? <Check size={11} /> : null}
                {m.short}
              </button>
              {picked && !defOne && (
                <button
                  onClick={() => makeDefault(m.code)}
                  style={{
                    padding: "0.45rem 0.55rem",
                    border: `1px solid ${bc}`,
                    borderInlineStart: "none",
                    backgroundColor: bg, color: p.textMuted,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center",
                  }}
                  title={`Make ${m.label} the booking-creator default`}
                  onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; }}
                  aria-label={`Make ${m.label} default`}
                >
                  ★
                </button>
              )}
              {!picked && (
                <button
                  onClick={() => makeDefault(m.code)}
                  style={{
                    padding: "0.45rem 0.55rem",
                    border: `1px solid ${bc}`,
                    borderInlineStart: "none",
                    backgroundColor: bg, color: p.textMuted,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title={`Add ${m.label} and make it the default`}
                  onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; }}
                  aria-label={`Add ${m.label} as default`}
                >
                  ★
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MealPlanSupplementMatrix({ p, rooms, selectedPlan, selectedPlans, defaultPlan, onUpdateRoom }) {
  // When `onUpdateRoom` is supplied the matrix offers an inline edit
  // mode — the operator can adjust per-suite supplements directly from
  // the contract / tier editor instead of navigating to Rooms & Rates.
  // Edits write to the MASTER (each room's `mealPlans`) so the change
  // flows through every contract, agency, tier, and walk-up booking.
  // Falls back to read-only mode when `onUpdateRoom` is omitted.
  const [editing, setEditing] = useState(false);
  if (!rooms || rooms.length === 0) return null;
  // Backwards-compatible reading. New callers pass:
  //   selectedPlans: ["bb","hb"]  + defaultPlan: "bb"
  // Old callers pass:
  //   selectedPlan: "bb"
  // We normalise to a Set of highlighted columns + a single default
  // code. The default gets a star + a slightly stronger tint than the
  // other picked columns.
  const pickedSet = new Set(
    Array.isArray(selectedPlans) && selectedPlans.length > 0
      ? selectedPlans
      : selectedPlan ? [selectedPlan] : ["ro"]
  );
  const sel = defaultPlan || selectedPlan || (pickedSet.size > 0 ? Array.from(pickedSet)[0] : "ro");
  const canEdit = typeof onUpdateRoom === "function";

  const handleEdit = (room, code, value) => {
    const next = Number(value);
    const supplement = Number.isFinite(next) && next >= 0 ? next : 0;
    const map = { ...(room.mealPlans || {}) };
    map[code] = { ...(map[code] || { enabled: true }), supplement };
    onUpdateRoom(room.id, { mealPlans: map });
  };
  const toggleEnabled = (room, code) => {
    const map = { ...(room.mealPlans || {}) };
    const cur = map[code] || { enabled: true, supplement: 0 };
    map[code] = { ...cur, enabled: cur.enabled === false };
    onUpdateRoom(room.id, { mealPlans: map });
  };

  return (
    <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${p.border}` }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <div>
          <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Supplement rates · sourced from room master
          </div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 3, lineHeight: 1.5 }}>
            BHD per adult per night, on top of the negotiated rack. {canEdit ? <>Edit them inline below, or jump to <strong style={{ color: p.textSecondary }}>Admin → Rooms &amp; Rates → Meal plans</strong> for the full master.</> : <>Edit the master rates in <strong style={{ color: p.textSecondary }}>Admin → Rooms &amp; Rates → Meal plans</strong>.</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span style={{
            color: p.accent, backgroundColor: `${p.accent}10`,
            border: `1px solid ${p.accent}`,
            padding: "2px 8px", fontFamily: "'Manrope', sans-serif",
            fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}>
            {pickedSet.size > 1
              ? <>Picked: {Array.from(pickedSet).map((c) => c.toUpperCase()).join(" · ")} · ★ {sel.toUpperCase()}</>
              : <>Picked: {sel.toUpperCase()}</>
            }
          </span>
          {canEdit && (
            <button
              onClick={() => setEditing((v) => !v)}
              style={{
                color: editing ? p.accent : p.textSecondary,
                backgroundColor: editing ? `${p.accent}10` : "transparent",
                border: `1px solid ${editing ? p.accent : p.border}`,
                padding: "4px 10px", fontFamily: "'Manrope', sans-serif",
                fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
              }}
              onMouseEnter={(e) => { if (!editing) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
              onMouseLeave={(e) => { if (!editing) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
              title="Edit the per-suite supplement rates. Saves to the room master so every contract, tier and booking reflects the change."
            >
              {editing ? "✓ Done" : "✎ Edit rates"}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-3 p-3" style={{
          backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}55`,
          color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55,
        }}>
          <strong>Editing the property master.</strong> Changes save instantly and flow into every contract, agency, tier, and walk-up booking. For a contract-only F&amp;B negotiation, leave the master as-is and adjust the headline rate instead.
        </div>
      )}

      <div style={{
        border: `1px solid ${p.border}`, overflow: "hidden",
        backgroundColor: p.bgPanel,
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Manrope', sans-serif" }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              <th style={{
                ...ceTh(p), textAlign: "start", padding: "8px 10px",
                borderBottom: `1px solid ${p.border}`,
              }}>Suite</th>
              {MEAL_PLANS.map((m) => {
                const isPicked  = pickedSet.has(m.code);
                const isDefault = m.code === sel;
                // Layered intensity — default column gets the
                // strongest tint, other picked columns get a softer
                // gold wash, unpicked stays neutral.
                const tint    = isDefault ? `${p.accent}22` : isPicked ? `${p.accent}10` : "transparent";
                const colour  = isDefault ? p.accent       : isPicked ? p.accent       : p.textMuted;
                const ruleStr = isDefault ? `2px solid ${p.accent}` : isPicked ? `1px solid ${p.accent}` : "none";
                const ruleEnd = isDefault ? `2px solid ${p.accent}` : isPicked ? `1px solid ${p.accent}` : "none";
                return (
                  <th key={m.code} style={{
                    ...ceTh(p),
                    color: colour,
                    backgroundColor: tint,
                    padding: "8px 10px",
                    textAlign: "end",
                    borderBottom: `1px solid ${p.border}`,
                    borderInlineStart: ruleStr,
                    borderInlineEnd:   ruleEnd,
                  }}>
                    {isDefault ? "★ " : ""}{m.short}
                    <div style={{ fontSize: "0.56rem", opacity: 0.7, marginTop: 2, letterSpacing: "0.04em" }}>
                      {m.label}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rooms.map((r, i) => (
              <tr key={r.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${p.border}` }}>
                <td style={{
                  padding: "8px 10px", color: p.textPrimary,
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "0.95rem",
                  whiteSpace: "nowrap",
                }}>
                  {r.id === "studio"     ? "Lodge Studio" :
                   r.id === "one-bed"    ? "One-Bedroom Suite" :
                   r.id === "two-bed"    ? "Two-Bedroom Suite" :
                   r.id === "three-bed"  ? "Three-Bedroom Suite" : r.id}
                </td>
                {MEAL_PLANS.map((m) => {
                  const isPickedCell  = pickedSet.has(m.code);
                  const isDefaultCell = m.code === sel;
                  const supp  = mealPlanSupplement(r, m.code);
                  const entry = (r.mealPlans || {})[m.code];
                  const disabled = entry?.enabled === false;
                  const tint    = isDefaultCell ? `${p.accent}18` : isPickedCell ? `${p.accent}08` : "transparent";
                  const colour  = isDefaultCell ? p.accent       : isPickedCell ? p.accent       : (supp > 0 ? p.textPrimary : p.textMuted);
                  const weight  = isDefaultCell ? 700 : isPickedCell ? 600 : 500;
                  const ruleStr = isDefaultCell ? `2px solid ${p.accent}` : isPickedCell ? `1px solid ${p.accent}` : "none";
                  const ruleEnd = isDefaultCell ? `2px solid ${p.accent}` : isPickedCell ? `1px solid ${p.accent}` : "none";
                  const tdBase = {
                    padding: "8px 10px",
                    textAlign: "end",
                    fontVariantNumeric: "tabular-nums",
                    color: colour,
                    fontWeight: weight,
                    backgroundColor: tint,
                    borderInlineStart: ruleStr,
                    borderInlineEnd:   ruleEnd,
                    fontSize: "0.86rem",
                  };
                  if (editing) {
                    // RO is the rack baseline — always BHD 0 and not editable.
                    // Every other plan is editable; double-click toggles
                    // the enabled flag (operator can pull a plan from a
                    // single suite without losing the supplement value).
                    if (m.code === "ro") {
                      return (
                        <td key={m.code} style={{ ...tdBase, color: p.textMuted }}>—</td>
                      );
                    }
                    return (
                      <td key={m.code} style={tdBase}>
                        <div className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={entry?.supplement ?? 0}
                            onChange={(e) => handleEdit(r, m.code, e.target.value)}
                            disabled={disabled}
                            style={{
                              width: 78, padding: "4px 6px",
                              backgroundColor: p.inputBg, color: disabled ? p.textMuted : p.textPrimary,
                              border: `1px solid ${p.border}`,
                              fontFamily: "'Manrope', sans-serif",
                              fontVariantNumeric: "tabular-nums",
                              fontSize: "0.82rem", textAlign: "end",
                              opacity: disabled ? 0.55 : 1,
                            }}
                            title={disabled ? "Plan disabled for this suite — toggle on to re-enable" : "BHD per adult per night"}
                          />
                          <button
                            onClick={() => toggleEnabled(r, m.code)}
                            title={disabled ? "Enable this plan for this suite" : "Disable this plan for this suite"}
                            style={{
                              padding: "2px 6px",
                              color: disabled ? p.textMuted : p.success,
                              border: `1px solid ${disabled ? p.border : p.success}`,
                              backgroundColor: "transparent",
                              fontFamily: "'Manrope', sans-serif", fontSize: "0.52rem",
                              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              cursor: "pointer", minWidth: 28,
                            }}
                          >
                            {disabled ? "Off" : "On"}
                          </button>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={m.code} style={tdBase}>
                      {disabled ? (
                        <span style={{ color: p.textMuted, fontStyle: "italic", fontSize: "0.72rem" }}>off</span>
                      ) : supp > 0 ? `+ ${formatCurrency(supp)}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 6, lineHeight: 1.5 }}>
        {pickedSet.size > 1
          ? <>Multiple plans available — operators pick at booking. <strong>★ {sel.toUpperCase()}</strong> is the pre-filled default. For a 2-adult, 3-night stay each plan's supplement is its column above × 2 × 3 per suite.</>
          : sel === "ro"
            ? "Default plan adds no F&B charge to the folio."
            : `Default plan adds 2 × 3 × the supplement above per suite to the folio (2 adults, 3 nights).`
        }
      </div>
    </div>
  );
}
