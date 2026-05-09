import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, Brush, Building2, Calendar, CheckCircle2, ChevronRight,
  Clock, Coins, Copy, DollarSign, Download, Droplets, Edit2, ExternalLink, Eye,
  FileText, LayoutGrid, Layers, List, Mail, MapPin, Phone, Plug, Plus, Power,
  PowerOff, Save, Send, Sofa, Star, Trash2, TrendingUp, User, UserCheck, UserPlus,
  Wand2, Wind, Wrench, X, Zap,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import {
  MAINTENANCE_CATEGORIES, MAINTENANCE_STATUSES, MAINTENANCE_PRIORITIES,
  MAINTENANCE_SOURCES, MAINTENANCE_AREAS, useData,
} from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// Maintenance — daily room maintenance system. Jobs flow through a clear
// lifecycle (reported → diagnosed → vendor-assigned → in-progress →
// completed) and each job captures both product (parts) and manpower
// (labor) costs. A separate Vendors tab manages the contractor Rolodex.
// ---------------------------------------------------------------------------

const CATEGORY_ICON = {
  ac: Wind, furniture: Sofa, electrical: Plug, plumbing: Droplets, painting: Brush, other: Wrench,
};
const CAT_BY_ID    = Object.fromEntries(MAINTENANCE_CATEGORIES.map((c) => [c.id, c]));
const STATUS_BY_ID = Object.fromEntries(MAINTENANCE_STATUSES.map((s) => [s.id, s]));
const PRIO_BY_ID   = Object.fromEntries(MAINTENANCE_PRIORITIES.map((p) => [p.id, p]));
const AREA_BY_ID   = Object.fromEntries(MAINTENANCE_AREAS.map((a) => [a.id, a]));

const ROOM_LABEL = { studio: "Studio", "one-bed": "One-bed", "two-bed": "Two-bed", "three-bed": "Three-bed" };

const fmtBhd = (n) => `BHD ${(Number(n) || 0).toFixed(3)}`;
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
};
const hoursBetween = (a, b) => {
  if (!a || !b) return 0;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
};

const subcategoriesFor = (categoryId) => CAT_BY_ID[categoryId]?.subcategories || [];
const subLabel = (categoryId, subId) => subcategoriesFor(categoryId).find((s) => s.id === subId)?.label || subId;

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------
export const Maintenance = () => {
  const p = usePalette();
  const [tab, setTab] = useState("jobs");

  return (
    <div>
      <PageHeader
        title="Maintenance"
        intro="Track every defect across the 72 suites — from guest complaint to vendor dispatch to completion. Every job captures parts and labor cost so the operating spend is transparent."
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        <SubTab active={tab === "jobs"}    onClick={() => setTab("jobs")}    icon={Wrench}     p={p}>Jobs</SubTab>
        <SubTab active={tab === "vendors"} onClick={() => setTab("vendors")} icon={UserCheck}  p={p}>Vendors</SubTab>
      </div>

      {tab === "jobs"    && <JobsBoard />}
      {tab === "vendors" && <VendorsBoard />}
    </div>
  );
};

function SubTab({ active, onClick, icon: Icon, children, p }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 transition-colors"
      style={{
        padding: "0.65rem 1.1rem",
        backgroundColor: active ? p.accent : "transparent",
        color: active ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
        border: `1px solid ${active ? p.accent : p.border}`,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
        letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = p.border;  e.currentTarget.style.color = p.textSecondary; } }}
    >
      <Icon size={13} /> {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// JobsBoard — KPIs, filters, and the job list with a category funnel.
// ---------------------------------------------------------------------------
function JobsBoard() {
  const p = usePalette();
  const { maintenanceJobs } = useData();
  const [filterStatus,   setFilterStatus]   = useState("open"); // pseudo: all | open | category id | status id
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search,         setSearch]         = useState("");
  const [editing,  setEditing]  = useState(null);
  const [creating, setCreating] = useState(false);

  const isOpen = (j) => j.status !== "completed" && j.status !== "cancelled";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return maintenanceJobs
      .filter((j) => {
        if (filterStatus === "open") return isOpen(j);
        if (filterStatus !== "all" && j.status !== filterStatus) return false;
        return true;
      })
      .filter((j) => filterCategory === "all" || j.category === filterCategory)
      .filter((j) => filterPriority === "all" || j.priority === filterPriority)
      .filter((j) => {
        if (!q) return true;
        const hay = [j.title, j.description, j.unitNumber, j.vendorName, j.id].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        // Open first, then by priority (critical → low), then by reportedAt desc
        const aOpen = isOpen(a), bOpen = isOpen(b);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        const prioRank = { critical: 0, high: 1, normal: 2, low: 3 };
        const ap = prioRank[a.priority] ?? 9, bp = prioRank[b.priority] ?? 9;
        if (ap !== bp) return ap - bp;
        return new Date(b.reportedAt) - new Date(a.reportedAt);
      });
  }, [maintenanceJobs, filterStatus, filterCategory, filterPriority, search]);

  const stats = useMemo(() => {
    const open = maintenanceJobs.filter(isOpen);
    const critical = open.filter((j) => j.priority === "critical").length;
    const high     = open.filter((j) => j.priority === "high").length;
    const completed = maintenanceJobs.filter((j) => j.status === "completed");

    // MTD spend from completed jobs (parts + labor)
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const mtd = completed
      .filter((j) => j.completedAt && new Date(j.completedAt) >= monthStart)
      .reduce((s, j) => s + (j.totalCost || 0), 0);

    // Avg resolution hours (last 30 days)
    const recent = completed.filter((j) => j.completedAt && hoursBetween(j.reportedAt, j.completedAt) > 0).slice(0, 30);
    const avgRes = recent.length > 0
      ? recent.reduce((s, j) => s + hoursBetween(j.reportedAt, j.completedAt), 0) / recent.length
      : 0;

    // By category (for funnel)
    const byCategory = {};
    MAINTENANCE_CATEGORIES.forEach((c) => { byCategory[c.id] = { open: 0, total: 0 }; });
    maintenanceJobs.forEach((j) => {
      if (!byCategory[j.category]) byCategory[j.category] = { open: 0, total: 0 };
      byCategory[j.category].total++;
      if (isOpen(j)) byCategory[j.category].open++;
    });

    return { openCount: open.length, critical, high, mtd, avgRes, byCategory, totalCount: maintenanceJobs.length };
  }, [maintenanceJobs]);

  return (
    <div>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat label="Open jobs"          value={stats.openCount} hint={`of ${stats.totalCount} total`} color={p.accent} />
        <Stat label="Critical / High"    value={stats.critical + stats.high} hint={`${stats.critical} critical · ${stats.high} high`} color={(stats.critical + stats.high) > 0 ? p.danger : p.success} />
        <Stat label="Avg resolution"     value={stats.avgRes > 0 ? `${stats.avgRes.toFixed(1)}h` : "—"} hint="Last 30 days · completed jobs" />
        <Stat label="MTD spend"          value={fmtBhd(stats.mtd)} hint="Parts + labor · this month" />
        <button
          onClick={() => setCreating(true)}
          className="p-5 group transition-colors flex flex-col justify-center items-center"
          style={{
            backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
            border: `1px solid ${p.accent}`, cursor: "pointer", minHeight: 120,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent;     e.currentTarget.style.borderColor = p.accent; }}
        >
          <Plus size={22} />
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginTop: 6 }}>
            Log defect
          </div>
        </button>
      </div>

      {/* Category funnel */}
      <Card title="By category · open jobs" className="mb-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px" style={{ backgroundColor: p.border }}>
          {MAINTENANCE_CATEGORIES.map((c) => {
            const v = stats.byCategory[c.id] || { open: 0, total: 0 };
            const isActive = filterCategory === c.id;
            const Icon = CATEGORY_ICON[c.id] || Wrench;
            return (
              <button
                key={c.id}
                onClick={() => setFilterCategory(isActive ? "all" : c.id)}
                className="px-4 py-3 text-start"
                title={c.hint}
                style={{
                  backgroundColor: isActive ? `${c.color}1A` : p.bgPanel,
                  borderTop: `3px solid ${isActive ? c.color : "transparent"}`,
                  cursor: "pointer", transition: "background-color 120ms",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = `${c.color}0D`; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = p.bgPanel; }}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={12} style={{ color: c.color }} />
                  <span style={{ color: c.color, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.label}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: c.color, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {v.open}
                  </span>
                  <span style={{ color: p.textMuted, fontSize: "0.7rem" }}>open · {v.total} total</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <TextField value={search} onChange={setSearch} placeholder="Search title, unit, vendor, ID…" />
          </div>
          <div style={{ minWidth: 160 }}>
            <SelectField
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "open", label: "Open jobs" },
                { value: "all",  label: "All statuses" },
                ...MAINTENANCE_STATUSES.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </div>
          <div style={{ minWidth: 160 }}>
            <SelectField
              value={filterPriority}
              onChange={setFilterPriority}
              options={[{ value: "all", label: "All priorities" }, ...MAINTENANCE_PRIORITIES.map((pp) => ({ value: pp.id, label: pp.label }))]}
            />
          </div>
          {(filterStatus !== "open" || filterCategory !== "all" || filterPriority !== "all" || search) && (
            <button
              onClick={() => { setFilterStatus("open"); setFilterCategory("all"); setFilterPriority("all"); setSearch(""); }}
              style={{
                color: p.accent, fontSize: "0.62rem", letterSpacing: "0.22em",
                textTransform: "uppercase", fontWeight: 700,
                padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, background: "transparent", cursor: "pointer",
              }}
            >Reset</button>
          )}
          <span style={{ marginInlineStart: "auto", color: p.textMuted, fontSize: "0.74rem" }}>
            {filtered.length} {filtered.length === 1 ? "job" : "jobs"}
          </span>
        </div>
      </Card>

      {/* Jobs table */}
      <Card title={`Jobs · ${filtered.length}`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Unit</Th>
              <Th>Category</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th>Vendor</Th>
              <Th align="end">Cost</Th>
              <Th>Reported</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted>
                No jobs match the current filters.
              </Td></tr>
            )}
            {filtered.map((j) => {
              const c    = CAT_BY_ID[j.category] || MAINTENANCE_CATEGORIES[0];
              const Icon = CATEGORY_ICON[j.category] || Wrench;
              const s    = STATUS_BY_ID[j.status]   || MAINTENANCE_STATUSES[0];
              const pr   = PRIO_BY_ID[j.priority]   || MAINTENANCE_PRIORITIES[1];
              return (
                <tr key={j.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setEditing(j)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{j.title}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>
                      {j.id}{j.subcategory ? ` · ${subLabel(j.category, j.subcategory)}` : ""}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>#{j.unitNumber || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                      {ROOM_LABEL[j.roomId] || j.roomId} · {AREA_BY_ID[j.area]?.label || j.area}
                    </div>
                  </Td>
                  <Td>
                    <span style={chip(c.color)}>
                      <Icon size={10} /> {c.label}
                    </span>
                  </Td>
                  <Td><span style={chip(pr.color)}><span style={dot(pr.color)} />{pr.label}</span></Td>
                  <Td><span style={chip(s.color)}><span style={dot(s.color)} />{s.label}</span></Td>
                  <Td muted>
                    {j.vendorName || <span style={{ color: p.textMuted, fontStyle: "italic" }}>—</span>}
                    {j.vendorContact && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{j.vendorContact}</div>}
                  </Td>
                  <Td align="end">
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{fmtBhd(j.totalCost || 0)}</div>
                    {(j.totalCost || 0) > 0 && (
                      <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                        Parts {fmtBhd(j.productCost || 0)} · Labor {fmtBhd(j.laborCost || 0)}
                      </div>
                    )}
                  </Td>
                  <Td muted>{fmtDateTime(j.reportedAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      {creating && <JobEditor job={null} onClose={() => setCreating(false)} />}
      {editing  && <JobEditor job={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobEditor — full-page drawer for create / edit. Cards: Identity (title +
// location), Categorisation, Description, Vendor, Status (lifecycle pills +
// quick-action buttons), Costs (parts table + labor calc), Activity log.
// ---------------------------------------------------------------------------
function JobEditor({ job, onClose }) {
  const p = usePalette();
  const {
    maintenanceJobs, maintenanceVendors, adminUsers, roomUnits,
    addMaintenanceJob, updateMaintenanceJob, removeMaintenanceJob,
    transitionMaintenanceJob, appendMaintenanceEvent,
  } = useData();
  const isNew = !job?.id;

  // Always read the live job so external transitions (called from the
  // table or quick-actions) flow back into the form.
  const live = isNew ? null : (maintenanceJobs.find((x) => x.id === job.id) || job);

  const [draft, setDraft] = useState(() => ({
    title: "", category: "ac", subcategory: "filter-change",
    priority: "normal", status: "reported",
    roomId: "studio", unitNumber: "", area: "bedroom",
    source: "front-desk",
    description: "",
    vendorId: null, vendorName: "", vendorContact: "",
    vendorAssignedAt: null, vendorEta: null,
    parts: [], laborHours: 0, laborRate: 10,
    laborCost: 0, productCost: 0, totalCost: 0,
    notes: "", resolution: "",
    reportedByName: adminUsers?.[0]?.name || "Operator",
    reportedBy:     adminUsers?.[0]?.id   || "",
    ...job,
  }));

  // When live changes (after a transition), pull the freshest values into
  // the draft to avoid stale state in the editor.
  useEffect(() => {
    if (live && !isNew) setDraft((d) => ({ ...d, ...live }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.status, live?.startedAt, live?.completedAt]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Auto-recalculate totals whenever parts / labor change
  useEffect(() => {
    const parts = draft.parts || [];
    const productCost = parts.reduce((s, pt) => s + (Number(pt.total) || 0), 0);
    const laborCost   = +(((Number(draft.laborHours) || 0) * (Number(draft.laborRate) || 0))).toFixed(3);
    const totalCost   = +(productCost + laborCost).toFixed(3);
    if (productCost !== draft.productCost || laborCost !== draft.laborCost || totalCost !== draft.totalCost) {
      setDraft((d) => ({ ...d, productCost, laborCost, totalCost }));
    }
  }, [draft.parts, draft.laborHours, draft.laborRate, draft.productCost, draft.laborCost, draft.totalCost]);

  const cat       = CAT_BY_ID[draft.category] || MAINTENANCE_CATEGORIES[0];
  const Icon      = CATEGORY_ICON[draft.category] || Wrench;
  const status    = STATUS_BY_ID[draft.status]   || MAINTENANCE_STATUSES[0];
  const priority  = PRIO_BY_ID[draft.priority]   || MAINTENANCE_PRIORITIES[1];
  const vendorOptions = (maintenanceVendors || []).filter((v) => v.active && v.categories?.includes(draft.category));
  const allVendors    = maintenanceVendors || [];

  // Parts CRUD inside the form (no store hit until save)
  const addPart    = () => set({ parts: [...(draft.parts || []), { id: `p-${Date.now()}`, name: "", qty: 1, unitCost: 0, total: 0 }] });
  const updatePart = (idx, patch) => set({ parts: draft.parts.map((pt, i) => {
    if (i !== idx) return pt;
    const next = { ...pt, ...patch };
    next.total = +(((Number(next.qty) || 0) * (Number(next.unitCost) || 0))).toFixed(3);
    return next;
  }) });
  const removePart = (idx) => set({ parts: draft.parts.filter((_, i) => i !== idx) });

  // Vendor assignment helper
  const assignVendor = (vendorId) => {
    const v = allVendors.find((x) => x.id === vendorId);
    if (!v) return;
    set({
      vendorId: v.id, vendorName: v.name,
      vendorContact: `${v.contactName || ""} · ${v.phone || ""}`.replace(/^ · | · $/g, ""),
      vendorAssignedAt: new Date().toISOString(),
      status: draft.status === "reported" || draft.status === "diagnosed" ? "vendor-assigned" : draft.status,
    });
  };
  const clearVendor = () => set({
    vendorId: null, vendorName: "", vendorContact: "", vendorAssignedAt: null, vendorEta: null,
  });

  // Quick lifecycle transitions
  const moveTo = (statusId, note) => {
    if (isNew) { set({ status: statusId }); return; }
    transitionMaintenanceJob(live.id, statusId, draft.reportedByName || "Operator", note);
    pushToast({ message: `Status → ${statusId.replace(/-/g, " ")}` });
  };

  // Save
  const save = () => {
    if (!draft.title?.trim()) { pushToast({ message: "Title is required", kind: "warn" }); return; }
    if (!draft.unitNumber?.trim()) { pushToast({ message: "Unit number is required", kind: "warn" }); return; }
    if (isNew) {
      addMaintenanceJob(draft);
      pushToast({ message: `Job logged · ${draft.title}` });
    } else {
      updateMaintenanceJob(live.id, draft);
      pushToast({ message: `Job updated · ${draft.title}` });
    }
    onClose?.();
  };

  const remove = () => {
    if (!live?.id) return;
    if (!confirm(`Remove job "${live.title}"? This can't be undone.`)) return;
    removeMaintenanceJob(live.id);
    pushToast({ message: `Removed · ${live.title}` });
    onClose?.();
  };

  // tel:/mailto: helpers — pull phone/email out of vendor record
  const vendorRecord = allVendors.find((v) => v.id === draft.vendorId);

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={isNew ? "Log defect" : `Job · ${live.id}`}
      title={draft.title || "Untitled job"}
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          {!isNew && <GhostBtn small danger onClick={remove}><Trash2 size={11} /> Remove</GhostBtn>}
          <div className="flex-1" />
          {!isNew && live.status !== "completed" && (
            <GhostBtn small onClick={() => moveTo("completed")}><CheckCircle2 size={11} /> Mark complete</GhostBtn>
          )}
          <PrimaryBtn small onClick={save}><Save size={12} /> {isNew ? "Log job" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      {/* Header banner */}
      <div className="p-4 mb-5 flex items-start gap-3 flex-wrap" style={{
        backgroundColor: `${cat.color}10`,
        border: `1px solid ${cat.color}40`,
        borderInlineStart: `4px solid ${cat.color}`,
      }}>
        <Icon size={22} style={{ color: cat.color, marginTop: 2, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={chip(cat.color)}><Icon size={10} /> {cat.label}</span>
            <span style={chip(priority.color)}><span style={dot(priority.color)} />{priority.label}</span>
            <span style={chip(status.color)}><span style={dot(status.color)} />{status.label}</span>
          </div>
          <div style={{ color: p.textPrimary, fontSize: "0.92rem", marginTop: 6, lineHeight: 1.5 }}>
            {cat.hint}
          </div>
        </div>
      </div>

      {/* Lifecycle quick-pick row */}
      {!isNew && (
        <Card title="Lifecycle" className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            {MAINTENANCE_STATUSES.map((s) => {
              const sel = live.status === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => moveTo(s.id)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    backgroundColor: sel ? `${s.color}1F` : "transparent",
                    border: `1px solid ${sel ? s.color : p.border}`,
                    color: sel ? s.color : p.textSecondary,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                >
                  <span style={dot(s.color)} /> {s.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3" style={{ color: p.textMuted, fontSize: "0.74rem" }}>
            <span>Reported · {fmtDateTime(live.reportedAt)} by {live.reportedByName}</span>
            {live.vendorAssignedAt && <span>· Vendor assigned · {fmtDateTime(live.vendorAssignedAt)}</span>}
            {live.startedAt        && <span>· Started · {fmtDateTime(live.startedAt)}</span>}
            {live.completedAt      && <span>· Completed · {fmtDateTime(live.completedAt)} by {live.completedBy}</span>}
            {live.completedAt && live.reportedAt && (
              <span>· Resolution time · <strong style={{ color: p.textPrimary }}>{hoursBetween(live.reportedAt, live.completedAt).toFixed(1)}h</strong></span>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Identity */}
        <Card title="Identity & location">
          <FormGroup label="Job title *">
            <TextField value={draft.title} onChange={(v) => set({ title: v })} placeholder="e.g. Suite 304 · AC not cooling" />
          </FormGroup>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <FormGroup label="Suite type">
              <SelectField
                value={draft.roomId}
                onChange={(v) => set({ roomId: v, unitNumber: "", unitId: null })}
                options={Object.entries(ROOM_LABEL).map(([id, label]) => ({ value: id, label }))}
              />
            </FormGroup>
            <FormGroup label="Unit number *">
              <UnitNumberPicker
                roomTypeId={draft.roomId}
                roomUnits={roomUnits || []}
                value={draft.unitNumber}
                unitId={draft.unitId}
                onChange={(unit) => {
                  if (unit) {
                    set({
                      unitNumber: unit.number,
                      unitId: unit.id,
                      // Auto-correct the suite type if the picked unit is of
                      // a different type — keeps maintenance data canonical.
                      roomId: unit.roomTypeId,
                    });
                  } else {
                    set({ unitId: null });
                  }
                }}
                onChangeFreeText={(v) => set({ unitNumber: v, unitId: null })}
                p={p}
              />
            </FormGroup>
            <FormGroup label="Area">
              <SelectField
                value={draft.area}
                onChange={(v) => set({ area: v })}
                options={MAINTENANCE_AREAS.map((a) => ({ value: a.id, label: a.label }))}
              />
            </FormGroup>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <FormGroup label="Source">
              <SelectField
                value={draft.source}
                onChange={(v) => set({ source: v })}
                options={MAINTENANCE_SOURCES.map((s) => ({ value: s.id, label: s.label }))}
              />
            </FormGroup>
            <FormGroup label="Reported by">
              <SelectField
                value={draft.reportedBy}
                onChange={(v) => {
                  const u = adminUsers?.find((x) => x.id === v);
                  set({ reportedBy: v, reportedByName: u?.name || draft.reportedByName });
                }}
                options={(adminUsers || []).map((u) => ({ value: u.id, label: u.name }))}
              />
            </FormGroup>
          </div>
        </Card>

        {/* Categorisation */}
        <Card title="Categorisation">
          <FormGroup label="Category">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MAINTENANCE_CATEGORIES.map((c) => {
                const sel = draft.category === c.id;
                const CIcon = CATEGORY_ICON[c.id] || Wrench;
                return (
                  <button
                    key={c.id}
                    onClick={() => set({ category: c.id, subcategory: c.subcategories?.[0]?.id })}
                    className="text-start p-2.5 transition-colors"
                    style={{
                      backgroundColor: sel ? `${c.color}14` : "transparent",
                      border: `1px solid ${sel ? c.color : p.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <CIcon size={13} style={{ color: c.color }} />
                      <span style={{ color: sel ? c.color : p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                        {c.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </FormGroup>

          <FormGroup label="Subcategory" className="mt-4">
            <SelectField
              value={draft.subcategory}
              onChange={(v) => set({ subcategory: v })}
              options={subcategoriesFor(draft.category).map((s) => ({
                value: s.id,
                label: `${s.label}${s.preventive ? ` · preventive · ${s.intervalDays}d` : ""}`,
              }))}
            />
          </FormGroup>

          <FormGroup label="Priority" className="mt-4">
            <div className="flex flex-wrap gap-2">
              {MAINTENANCE_PRIORITIES.map((pp) => {
                const sel = draft.priority === pp.id;
                return (
                  <button
                    key={pp.id}
                    onClick={() => set({ priority: pp.id })}
                    title={pp.hint}
                    style={{
                      padding: "0.35rem 0.85rem",
                      backgroundColor: sel ? `${pp.color}1F` : "transparent",
                      border: `1px solid ${sel ? pp.color : p.border}`,
                      color: sel ? pp.color : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >{pp.label}</button>
                );
              })}
            </div>
          </FormGroup>
        </Card>

        {/* Description */}
        <Card title="Defect description" className="lg:col-span-2">
          <textarea
            value={draft.description || ""}
            onChange={(e) => set({ description: e.target.value })}
            rows={4}
            placeholder="What was observed? Symptom, time, suspected cause…"
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical",
            }}
          />
        </Card>

        {/* Vendor */}
        <Card title="Vendor assignment" className="lg:col-span-2">
          {draft.vendorId ? (
            <div className="p-4 flex items-start gap-3 flex-wrap" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <UserCheck size={18} style={{ color: p.accent, marginTop: 2 }} />
              <div className="flex-1 min-w-0">
                <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", lineHeight: 1.2 }}>
                  {draft.vendorName}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 2 }}>
                  {draft.vendorContact || "—"}
                </div>
                {draft.vendorAssignedAt && (
                  <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 4 }}>
                    Assigned · {fmtDateTime(draft.vendorAssignedAt)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {vendorRecord?.phone && (
                  <a href={`tel:${vendorRecord.phone}`}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: p.success, color: "#fff",
                      border: `1px solid ${p.success}`, padding: "0.4rem 0.85rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      textDecoration: "none",
                    }}
                  ><Phone size={11} /> Call</a>
                )}
                {vendorRecord?.email && (
                  <a href={`mailto:${vendorRecord.email}?subject=${encodeURIComponent(`${live?.id || "MNT"} · ${draft.title}`)}&body=${encodeURIComponent(`Hi ${vendorRecord.contactName || vendorRecord.name},\n\nWe have a job for you:\n\n${draft.title}\nLocation: Unit ${draft.unitNumber}, ${ROOM_LABEL[draft.roomId]} · ${AREA_BY_ID[draft.area]?.label}\n\nDetails:\n${draft.description}\n\nPriority: ${priority.label}\n\nThanks,\nThe Lodge Suites`)}`}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: "transparent", color: p.accent,
                      border: `1px solid ${p.accent}`, padding: "0.4rem 0.85rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      textDecoration: "none",
                    }}
                  ><Mail size={11} /> Email</a>
                )}
                <button onClick={clearVendor}
                  style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.4rem 0.6rem", border: `1px solid ${p.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = p.danger; e.currentTarget.style.borderColor = p.danger; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                ><X size={11} /></button>
              </div>
            </div>
          ) : (
            <>
              <FormGroup label={`Recommended for ${cat.label.toLowerCase()}`}>
                {vendorOptions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {vendorOptions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => assignVendor(v.id)}
                        className="text-start p-3 transition-colors"
                        style={{ border: `1px solid ${p.border}`, backgroundColor: "transparent", cursor: "pointer" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; e.currentTarget.style.borderColor = p.accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = p.border; }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div style={{ color: p.textPrimary, fontWeight: 600 }}>{v.name}</div>
                          {Number(v.rating) > 0 && (
                            <span style={{ color: p.warn, fontSize: "0.78rem", fontWeight: 700 }}>
                              ★ {v.rating}
                            </span>
                          )}
                        </div>
                        <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
                          {v.contactName} · {v.phone}
                        </div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>
                          ~{v.avgResponseHours}h response · {v.totalJobs} jobs
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>
                    No vendors registered for this category yet. <span style={{ color: p.accent, fontWeight: 700 }}>Switch to the Vendors tab to add one.</span>
                  </div>
                )}
              </FormGroup>

              {allVendors.length > 0 && (
                <FormGroup label="Or pick from any vendor" className="mt-4">
                  <SelectField
                    value=""
                    onChange={(v) => { if (v) assignVendor(v); }}
                    options={[{ value: "", label: "— Pick a vendor —" }, ...allVendors.map((v) => ({ value: v.id, label: `${v.name} · ${v.categories.join(", ")}` }))]}
                  />
                </FormGroup>
              )}
            </>
          )}

          {draft.vendorId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <FormGroup label="Vendor ETA">
                <input
                  type="datetime-local"
                  value={draft.vendorEta ? new Date(draft.vendorEta).toISOString().slice(0, 16) : ""}
                  onChange={(e) => set({ vendorEta: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full outline-none"
                  style={{
                    backgroundColor: p.inputBg, color: p.textPrimary,
                    border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                  }}
                />
              </FormGroup>
            </div>
          )}
        </Card>

        {/* Costs */}
        <Card title="Cost capture · parts & labor" className="lg:col-span-2">
          {/* Parts */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 700 }}>
                Parts / Products
              </div>
              <GhostBtn small onClick={addPart}><Plus size={11} /> Add part</GhostBtn>
            </div>
            <div style={{ border: `1px solid ${p.border}` }}>
              <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
                <thead>
                  <tr style={{ backgroundColor: p.bgPanelAlt }}>
                    <th className="text-start px-3 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>Item</th>
                    <th className="text-end   px-3 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, borderBottom: `1px solid ${p.border}`, width: 80 }}>Qty</th>
                    <th className="text-end   px-3 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, borderBottom: `1px solid ${p.border}`, width: 120 }}>Unit cost</th>
                    <th className="text-end   px-3 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, borderBottom: `1px solid ${p.border}`, width: 120 }}>Total</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.parts || []).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: p.textMuted, fontSize: "0.84rem" }}>No parts logged. Click <em>Add part</em> to start.</td></tr>
                  )}
                  {(draft.parts || []).map((pt, idx) => (
                    <tr key={pt.id || idx} style={{ borderTop: `1px solid ${p.border}` }}>
                      <td className="px-2 py-2">
                        <input
                          value={pt.name || ""}
                          onChange={(e) => updatePart(idx, { name: e.target.value })}
                          placeholder="e.g. Compressor capacitor 35µF"
                          className="w-full outline-none"
                          style={{ backgroundColor: "transparent", color: p.textPrimary, border: "none", padding: "0.4rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0} step={1}
                          value={pt.qty}
                          onChange={(e) => updatePart(idx, { qty: parseFloat(e.target.value) || 0 })}
                          className="w-full text-end outline-none"
                          style={{ backgroundColor: "transparent", color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.4rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0} step={0.001}
                          value={pt.unitCost}
                          onChange={(e) => updatePart(idx, { unitCost: parseFloat(e.target.value) || 0 })}
                          className="w-full text-end outline-none"
                          style={{ backgroundColor: "transparent", color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.4rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                        />
                      </td>
                      <td className="px-3 py-2 text-end" style={{ color: p.textPrimary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {fmtBhd(pt.total)}
                      </td>
                      <td className="px-2 py-2 text-end">
                        <button onClick={() => removePart(idx)} title="Remove"
                          style={{ color: p.textMuted, padding: 4 }}
                          onMouseEnter={(e) => e.currentTarget.style.color = p.danger}
                          onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                        ><X size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Labor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <FormGroup label="Labor hours">
              <input type="number" min={0} step={0.25}
                value={draft.laborHours}
                onChange={(e) => set({ laborHours: parseFloat(e.target.value) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
            <FormGroup label="Labor rate · BHD/hour">
              <input type="number" min={0} step={0.5}
                value={draft.laborRate}
                onChange={(e) => set({ laborRate: parseFloat(e.target.value) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
            <FormGroup label="Labor cost (auto)">
              <div style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: 600 }}>
                {fmtBhd(draft.laborCost)}
              </div>
            </FormGroup>
          </div>

          {/* Cost summary */}
          <div className="grid grid-cols-3 gap-px" style={{ backgroundColor: p.border }}>
            <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, textAlign: "center" }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>Product cost</div>
              <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(draft.productCost)}</div>
            </div>
            <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, textAlign: "center" }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>Labor cost</div>
              <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(draft.laborCost)}</div>
            </div>
            <div className="p-3" style={{ backgroundColor: `${p.accent}15`, textAlign: "center" }}>
              <div style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>Total cost</div>
              <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", marginTop: 4, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBhd(draft.totalCost)}</div>
            </div>
          </div>
        </Card>

        {/* Resolution + notes */}
        <Card title="Resolution & notes" className="lg:col-span-2">
          <FormGroup label="Resolution / what was done">
            <textarea
              value={draft.resolution || ""}
              onChange={(e) => set({ resolution: e.target.value })}
              rows={3}
              placeholder="Describe what the vendor did and the outcome…"
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical" }}
            />
          </FormGroup>
          <FormGroup label="Internal notes" className="mt-3">
            <textarea
              value={draft.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              placeholder="VIP guest? Escalation path? Side notes?"
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical" }}
            />
          </FormGroup>
        </Card>

        {/* Activity log */}
        {!isNew && (live.history?.length || 0) > 0 && (
          <Card title={`Activity log · ${live.history.length}`} padded={false} className="lg:col-span-2">
            <TableShell>
              <thead>
                <tr><Th>When</Th><Th>By</Th><Th>Action</Th></tr>
              </thead>
              <tbody>
                {live.history.slice().reverse().map((h) => (
                  <tr key={h.id}>
                    <Td muted>{fmtDateTime(h.at)}</Td>
                    <Td>{h.by}</Td>
                    <Td>{h.action}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// VendorsBoard — vendor Rolodex with list + editor
// ---------------------------------------------------------------------------
function VendorsBoard() {
  const p = usePalette();
  const { maintenanceVendors, maintenanceJobs } = useData();
  const [editing,  setEditing]  = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter,   setFilter]   = useState("all");
  // Default to a compact, scannable list view; the operator can switch to
  // the richer card grid when they want logos / notes / mini-KPIs visible.
  const [view,     setView]     = useState("list");

  const filtered = useMemo(() => {
    return maintenanceVendors
      .filter((v) => filter === "all" ? true : v.categories?.includes(filter))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [maintenanceVendors, filter]);

  const stats = useMemo(() => {
    const out = {};
    maintenanceJobs.forEach((j) => {
      if (!j.vendorId) return;
      if (!out[j.vendorId]) out[j.vendorId] = { active: 0, completed: 0, totalSpend: 0 };
      if (j.status === "completed") out[j.vendorId].completed++;
      else if (j.status !== "cancelled") out[j.vendorId].active++;
      if (j.totalCost) out[j.vendorId].totalSpend += j.totalCost;
    });
    return out;
  }, [maintenanceJobs]);

  return (
    <div>
      {/* Filter pills + view toggle + new vendor */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "0.4rem 0.9rem",
              backgroundColor: filter === "all" ? `${p.accent}1F` : "transparent",
              border: `1px solid ${filter === "all" ? p.accent : p.border}`,
              color: filter === "all" ? p.accent : p.textSecondary,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              cursor: "pointer",
            }}
          >All</button>
          {MAINTENANCE_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c.id] || Wrench;
            return (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                style={{
                  padding: "0.4rem 0.9rem",
                  backgroundColor: filter === c.id ? `${c.color}1F` : "transparent",
                  border: `1px solid ${filter === c.id ? c.color : p.border}`,
                  color: filter === c.id ? c.color : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                }}
              ><Icon size={11} /> {c.label}</button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle — segmented control */}
          <div className="inline-flex" style={{ border: `1px solid ${p.border}` }}>
            <button
              onClick={() => setView("list")}
              title="List view"
              aria-pressed={view === "list"}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem",
                backgroundColor: view === "list" ? p.accent : "transparent",
                color: view === "list" ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                border: "none",
                borderInlineEnd: `1px solid ${p.border}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                cursor: "pointer",
              }}
            ><List size={11} /> List</button>
            <button
              onClick={() => setView("cards")}
              title="Card view"
              aria-pressed={view === "cards"}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem",
                backgroundColor: view === "cards" ? p.accent : "transparent",
                color: view === "cards" ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                border: "none",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                cursor: "pointer",
              }}
            ><LayoutGrid size={11} /> Cards</button>
          </div>
          <PrimaryBtn small onClick={() => setCreating(true)}><UserPlus size={11} /> New vendor</PrimaryBtn>
        </div>
      </div>

      {/* List view (default) — compact, scannable table */}
      {view === "list" && (
        <Card title={`Vendors · ${filtered.length}`} padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th>Categories</Th>
                <Th>Contact</Th>
                <Th align="end">Rating</Th>
                <Th align="end">Active</Th>
                <Th align="end">Done</Th>
                <Th align="end">Total spend</Th>
                <Th align="end">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><Td className="px-3 py-8" align="center" muted colSpan={8}>
                  No vendors match this filter.
                </Td></tr>
              )}
              {filtered.map((v) => {
                const s = stats[v.id] || { active: 0, completed: 0, totalSpend: 0 };
                return (
                  <tr key={v.id}
                    style={{ cursor: "pointer", opacity: v.active ? 1 : 0.65 }}
                    onClick={() => setEditing(v)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", fontWeight: 500 }}>
                          {v.name}
                        </div>
                        {!v.active && <span style={{ ...chip(p.textMuted), padding: "1px 6px", fontSize: "0.55rem" }}>Paused</span>}
                      </div>
                      <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>{v.id}</div>
                      {v.payment && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{v.payment}</div>}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {v.categories?.map((cid) => {
                          const c = CAT_BY_ID[cid];
                          if (!c) return null;
                          const CIcon = CATEGORY_ICON[cid] || Wrench;
                          return (
                            <span key={cid} style={{
                              color: c.color, backgroundColor: `${c.color}1F`, border: `1px solid ${c.color}`,
                              padding: "1px 6px", fontSize: "0.56rem", fontWeight: 700,
                              letterSpacing: "0.16em", textTransform: "uppercase",
                              whiteSpace: "nowrap",
                              display: "inline-flex", alignItems: "center", gap: 3,
                            }}><CIcon size={9} /> {c.label}</span>
                          );
                        })}
                      </div>
                    </Td>
                    <Td>
                      <div style={{ color: p.textPrimary, fontWeight: 600, fontSize: "0.82rem" }}>{v.contactName || "—"}</div>
                      <div className="flex flex-wrap gap-3 mt-1" style={{ color: p.textMuted, fontSize: "0.7rem" }}>
                        {v.phone && (
                          <a href={`tel:${v.phone}`} onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1"
                            style={{ color: p.textMuted, textDecoration: "none" }}
                            onMouseEnter={(e) => e.currentTarget.style.color = p.success}
                            onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                          ><Phone size={10} /> {v.phone}</a>
                        )}
                        {v.email && (
                          <a href={`mailto:${v.email}`} onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1"
                            style={{ color: p.textMuted, textDecoration: "none" }}
                            onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                            onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                          ><Mail size={10} /> {v.email}</a>
                        )}
                      </div>
                    </Td>
                    <Td align="end" style={{ whiteSpace: "nowrap" }}>
                      {Number(v.rating) > 0 ? (
                        <span style={{ color: p.warn, fontWeight: 700 }}>★ {Number(v.rating).toFixed(1)}</span>
                      ) : <span style={{ color: p.textMuted }}>—</span>}
                    </Td>
                    <Td align="end" style={{ color: s.active > 0 ? p.warn : p.textPrimary, fontWeight: 600 }}>{s.active}</Td>
                    <Td align="end" muted>{s.completed}</Td>
                    <Td align="end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(s.totalSpend)}</Td>
                    <Td align="end">
                      <div className="inline-flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                        {v.phone && (
                          <a href={`tel:${v.phone}`} title="Call vendor"
                            style={{
                              width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              color: p.success, border: `1px solid ${p.success}`, backgroundColor: "transparent",
                              textDecoration: "none",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                          ><Phone size={11} /></a>
                        )}
                        {v.email && (
                          <a href={`mailto:${v.email}`} title="Email vendor"
                            style={{
                              width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              color: p.accent, border: `1px solid ${p.accent}`, backgroundColor: "transparent",
                              textDecoration: "none",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                          ><Mail size={11} /></a>
                        )}
                        <button onClick={() => setEditing(v)} title="Edit vendor"
                          style={{
                            width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: p.textMuted, border: `1px solid ${p.border}`, backgroundColor: "transparent",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                        ><Edit2 size={11} /></button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* Card view (toggle) — richer per-vendor cards with notes */}
      {view === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-full p-8 text-center" style={{ border: `1px dashed ${p.border}`, color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
              No vendors match this filter.
            </div>
          )}
          {filtered.map((v) => {
            const s = stats[v.id] || { active: 0, completed: 0, totalSpend: 0 };
            return (
              <button
                key={v.id}
                onClick={() => setEditing(v)}
                className="text-start p-4 transition-colors"
                style={{
                  backgroundColor: p.bgPanel,
                  border: `1px solid ${p.border}`,
                  opacity: v.active ? 1 : 0.6,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.35rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.2 }}>
                      {v.name}
                    </div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>{v.id}</div>
                  </div>
                  {v.rating > 0 && (
                    <span style={{ color: p.warn, fontSize: "0.84rem", fontWeight: 700, whiteSpace: "nowrap" }}>★ {v.rating}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 mb-2">
                  {v.categories?.map((cid) => {
                    const c = CAT_BY_ID[cid];
                    if (!c) return null;
                    const CIcon = CATEGORY_ICON[cid] || Wrench;
                    return (
                      <span key={cid} style={{
                        ...chip(c.color),
                        padding: "2px 7px", fontSize: "0.58rem",
                      }}><CIcon size={9} /> {c.label}</span>
                    );
                  })}
                  {!v.active && <span style={chip(p.textMuted)}>Paused</span>}
                </div>

                <div style={{ color: p.textSecondary, fontSize: "0.82rem", marginTop: 6 }}>
                  {v.contactName}
                </div>
                <div className="flex flex-wrap gap-3 mt-1" style={{ color: p.textMuted, fontSize: "0.74rem" }}>
                  <span className="inline-flex items-center gap-1.5"><Phone size={11} /> {v.phone}</span>
                  <span className="inline-flex items-center gap-1.5"><Mail size={11} /> {v.email}</span>
                </div>

                <div className="grid grid-cols-3 gap-px mt-3" style={{ backgroundColor: p.border }}>
                  <div className="p-2 text-center" style={{ backgroundColor: p.bgPanelAlt }}>
                    <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 600 }}>{s.active}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>Active</div>
                  </div>
                  <div className="p-2 text-center" style={{ backgroundColor: p.bgPanelAlt }}>
                    <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 600 }}>{s.completed}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>Done</div>
                  </div>
                  <div className="p-2 text-center" style={{ backgroundColor: p.bgPanelAlt }}>
                    <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 600 }}>{fmtBhd(s.totalSpend)}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>Spend</div>
                  </div>
                </div>

                {v.notes && (
                  <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 8, fontStyle: "italic", lineHeight: 1.45 }}>
                    {v.notes}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {creating && <VendorEditor vendor={null} onClose={() => setCreating(false)} />}
      {editing  && <VendorEditor vendor={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VendorEditor — full-page drawer for vendor add/edit.
// ---------------------------------------------------------------------------
function VendorEditor({ vendor, onClose }) {
  const p = usePalette();
  const { addMaintenanceVendor, updateMaintenanceVendor, removeMaintenanceVendor, toggleMaintenanceVendor, maintenanceJobs } = useData();
  const isNew = !vendor?.id;

  const [draft, setDraft] = useState(() => ({
    name: "", categories: [],
    contactName: "", phone: "", email: "", address: "", payment: "",
    rating: 0, totalJobs: 0, avgResponseHours: 0,
    active: true, notes: "",
    ...vendor,
  }));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleCat = (cid) => set({
    categories: draft.categories.includes(cid)
      ? draft.categories.filter((x) => x !== cid)
      : [...draft.categories, cid],
  });

  const save = () => {
    if (!draft.name.trim()) { pushToast({ message: "Vendor name is required", kind: "warn" }); return; }
    if (draft.categories.length === 0) { pushToast({ message: "Pick at least one category", kind: "warn" }); return; }
    if (isNew) {
      addMaintenanceVendor(draft);
      pushToast({ message: `Vendor created · ${draft.name}` });
    } else {
      updateMaintenanceVendor(vendor.id, draft);
      pushToast({ message: `Vendor updated · ${draft.name}` });
    }
    onClose?.();
  };

  const remove = () => {
    if (!vendor?.id) return;
    if (!confirm(`Remove vendor "${vendor.name}"? This won't delete past jobs.`)) return;
    removeMaintenanceVendor(vendor.id);
    pushToast({ message: `Removed · ${vendor.name}` });
    onClose?.();
  };

  const recentJobs = useMemo(() => {
    if (!vendor?.id) return [];
    return maintenanceJobs.filter((j) => j.vendorId === vendor.id).slice(0, 8);
  }, [vendor?.id, maintenanceJobs]);

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={isNew ? "New vendor" : "Edit vendor"}
      title={draft.name || "Untitled vendor"}
      fullPage
      contentMaxWidth="max-w-4xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          {!isNew && <GhostBtn small danger onClick={remove}><Trash2 size={11} /> Remove</GhostBtn>}
          <div className="flex-1" />
          {!isNew && (
            <GhostBtn small onClick={() => { toggleMaintenanceVendor(vendor.id); pushToast({ message: `${vendor.active ? "Paused" : "Activated"} · ${vendor.name}` }); onClose?.(); }}>
              {vendor.active ? <><PowerOff size={11} /> Pause</> : <><Power size={11} /> Activate</>}
            </GhostBtn>
          )}
          <PrimaryBtn small onClick={save}><Save size={12} /> {isNew ? "Create vendor" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Identity">
          <FormGroup label="Vendor name *">
            <TextField value={draft.name} onChange={(v) => set({ name: v })} placeholder="e.g. AC Care Bahrain" />
          </FormGroup>
          <FormGroup label="Categories served *" className="mt-4">
            <div className="grid grid-cols-2 gap-2">
              {MAINTENANCE_CATEGORIES.map((c) => {
                const sel = draft.categories.includes(c.id);
                const Icon = CATEGORY_ICON[c.id] || Wrench;
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCat(c.id)}
                    className="text-start p-2.5 transition-colors"
                    style={{
                      backgroundColor: sel ? `${c.color}14` : "transparent",
                      border: `1px solid ${sel ? c.color : p.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={13} style={{ color: c.color }} />
                      <span style={{ color: sel ? c.color : p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                        {c.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </FormGroup>
        </Card>

        <Card title="Contact & terms">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Contact name">
              <TextField value={draft.contactName} onChange={(v) => set({ contactName: v })} />
            </FormGroup>
            <FormGroup label="Phone">
              <TextField value={draft.phone} onChange={(v) => set({ phone: v })} placeholder="+973…" />
            </FormGroup>
            <FormGroup label="Email" className="sm:col-span-2">
              <TextField value={draft.email} onChange={(v) => set({ email: v })} placeholder="ops@vendor.com" />
            </FormGroup>
            <FormGroup label="Address" className="sm:col-span-2">
              <TextField value={draft.address} onChange={(v) => set({ address: v })} />
            </FormGroup>
            <FormGroup label="Payment terms">
              <SelectField
                value={draft.payment}
                onChange={(v) => set({ payment: v })}
                options={[
                  { value: "", label: "—" },
                  { value: "On completion", label: "On completion" },
                  { value: "Net 15",        label: "Net 15" },
                  { value: "Net 30",        label: "Net 30" },
                  { value: "50% upfront",   label: "50% upfront" },
                  { value: "Per visit",     label: "Per visit" },
                ]}
              />
            </FormGroup>
            <FormGroup label="Avg response hours">
              <input type="number" min={0} step={1}
                value={draft.avgResponseHours}
                onChange={(e) => set({ avgResponseHours: parseInt(e.target.value, 10) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
          </div>
        </Card>

        <Card title="Performance & notes" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Rating · 0–5">
              <input type="number" min={0} max={5} step={0.1}
                value={draft.rating}
                onChange={(e) => set({ rating: parseFloat(e.target.value) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
            <FormGroup label="Total jobs completed (manual)">
              <input type="number" min={0} step={1}
                value={draft.totalJobs}
                onChange={(e) => set({ totalJobs: parseInt(e.target.value, 10) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
          </div>
          <FormGroup label="Notes" className="mt-4">
            <textarea
              value={draft.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              placeholder="SLA notes, escalation paths, particular strengths or weaknesses…"
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical" }}
            />
          </FormGroup>
        </Card>

        {!isNew && recentJobs.length > 0 && (
          <Card title={`Recent jobs · ${recentJobs.length}`} padded={false} className="lg:col-span-2">
            <TableShell>
              <thead>
                <tr><Th>Job</Th><Th>Unit</Th><Th>Status</Th><Th align="end">Cost</Th><Th>Reported</Th></tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => {
                  const s = STATUS_BY_ID[j.status] || MAINTENANCE_STATUSES[0];
                  return (
                    <tr key={j.id}>
                      <Td>
                        <div style={{ color: p.textPrimary, fontWeight: 600 }}>{j.title}</div>
                        <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{j.id}</div>
                      </Td>
                      <Td muted>#{j.unitNumber}</Td>
                      <Td><span style={chip(s.color)}><span style={dot(s.color)} />{s.label}</span></Td>
                      <Td align="end">{fmtBhd(j.totalCost || 0)}</Td>
                      <Td muted>{fmtDateTime(j.reportedAt)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Shared chip / dot styles
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// UnitNumberPicker — combobox-style picker that pulls room numbers from the
// canonical roomUnits registry, filtered by the chosen room type. Falls back
// to a free-text input when nothing is selected (so legacy / external unit
// numbers still work). When a registered unit is picked, downstream code
// stores both `unitNumber` (display) and `unitId` (canonical reference).
// ---------------------------------------------------------------------------
function UnitNumberPicker({ roomTypeId, roomUnits, value, unitId, onChange, onChangeFreeText, p }) {
  const matches = useMemo(() => {
    return (roomUnits || [])
      .filter((u) => u.roomTypeId === roomTypeId)
      .sort((a, b) => Number(a.number) - Number(b.number));
  }, [roomUnits, roomTypeId]);

  const linked = unitId ? roomUnits.find((u) => u.id === unitId) : null;

  // Available + free-text options. If the current value isn't in the
  // registered list, expose it as a "(unregistered)" option so the operator
  // can keep working without losing data.
  const valueIsRegistered = !!matches.find((u) => u.number === value);
  const options = [
    { value: "", label: "— Pick a room number —" },
    ...matches.map((u) => ({
      value: u.id,
      label: `Room ${u.number}${u.floor != null ? ` · floor ${u.floor}` : ""}${u.status === "out-of-order" ? " · OOO" : u.status === "reserved" ? " · reserved" : ""}`,
    })),
  ];
  if (value && !valueIsRegistered) {
    options.push({ value: `__free__${value}`, label: `${value} · (unregistered)` });
  }
  options.push({ value: "__manual__", label: "Other / type manually…" });

  // Manual-entry mode toggle — when the operator picks "Other", show a
  // bare text field for free-form entry.
  const [manual, setManual] = useState(!unitId && !!value && !valueIsRegistered);

  const handlePick = (val) => {
    if (val === "__manual__") { setManual(true); return; }
    if (val.startsWith("__free__")) { setManual(true); return; }
    if (!val) { onChange(null); return; }
    const u = roomUnits.find((x) => x.id === val);
    if (u) { setManual(false); onChange(u); }
  };

  if (manual) {
    return (
      <div>
        <input
          value={value || ""}
          onChange={(e) => onChangeFreeText(e.target.value)}
          placeholder="304"
          className="w-full outline-none"
          style={{
            backgroundColor: p.inputBg, color: p.textPrimary,
            border: `1px solid ${p.warn}`, padding: "0.55rem 0.7rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
          }}
        />
        <button onClick={() => { setManual(false); onChange(null); onChangeFreeText(""); }}
          style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 4 }}
        >Pick from registry instead →</button>
      </div>
    );
  }

  return (
    <div>
      <select
        value={unitId || (value && !valueIsRegistered ? `__free__${value}` : "") }
        onChange={(e) => handlePick(e.target.value)}
        className="outline-none cursor-pointer"
        style={{
          backgroundColor: p.inputBg, color: p.textPrimary,
          border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
          fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", width: "100%",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {linked && (
        <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 4 }}>
          Linked to <span style={{ color: p.accent, fontWeight: 600 }}>{linked.id}</span>
          {linked.view ? ` · ${linked.view}` : ""}
          {linked.notes ? ` · ${linked.notes}` : ""}
        </div>
      )}
      {matches.length === 0 && (
        <div style={{ color: p.warn, fontSize: "0.72rem", marginTop: 4 }}>
          No room numbers registered for this type yet. Add some in Rooms &amp; Rates → Room units, or pick "Other" to type manually.
        </div>
      )}
    </div>
  );
}

function chip(color) {
  return {
    color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
    padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
    whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 5,
  };
}
function dot(color) {
  return { width: 7, height: 7, borderRadius: "50%", backgroundColor: color };
}
