import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, Calendar, CalendarRange, CheckCircle2, Clock, Copy,
  Coins, Download, Edit2, Eye, FileText, Mail, Pause, Play, Plus, Power,
  PowerOff, Save, Send, Trash2, UserCheck, Wrench, X, Zap,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { REPORT_KINDS, REPORT_FREQUENCIES, useData } from "../../../../data/store.jsx";
import { buildReportEmail } from "../ReportEmail.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// ScheduledReports — admin section that manages cron-style email reports
// for sales activities, revenue, and 30-day availability. Each schedule
// generates a rich HTML email via the ReportEmail templates; "send now"
// fires immediately, "preview" renders the email in a side panel, and the
// schedule history records every run with timestamps + recipient counts.
//
// The send pipeline is mocked client-side per CLAUDE.md — the same store
// schema feeds the production cron worker once email is wired up.
// ---------------------------------------------------------------------------

const KIND_BY_ID  = Object.fromEntries(REPORT_KINDS.map((k) => [k.id, k]));
const KIND_ICON   = { activities: Activity, revenue: Coins, availability: CalendarRange, maintenance: Wrench };
const FREQ_BY_ID  = Object.fromEntries(REPORT_FREQUENCIES.map((f) => [f.id, f]));
const WEEKDAYS    = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};
const fmtRelative = (iso) => {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const mins = Math.round(ms / 60000);
  if (mins === 0) return "now";
  const hrs  = Math.round(ms / 3600000);
  const days = Math.round(ms / 86400000);
  if (Math.abs(days) >= 1) return days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
  if (Math.abs(hrs) >= 1)  return hrs > 0 ? `in ${hrs}h`  : `${Math.abs(hrs)}h ago`;
  return mins > 0 ? `in ${mins}m` : `${Math.abs(mins)}m ago`;
};

// Compute the next run-at for a schedule based on frequency + clock time.
function computeNextRun(schedule, from = new Date()) {
  if (!schedule.runAt) return null;
  const [hh, mm] = schedule.runAt.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const next = new Date(from);
  next.setHours(hh, mm, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  if (schedule.frequency === "weekly") {
    const target = Number.isFinite(schedule.weekday) ? schedule.weekday : 1; // default Mon
    while (next.getDay() !== target) next.setDate(next.getDate() + 1);
  } else if (schedule.frequency === "monthly") {
    const target = Number.isFinite(schedule.monthDay) ? schedule.monthDay : 1;
    next.setDate(target);
    if (next.getTime() <= from.getTime()) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(target);
    }
  }
  return next.toISOString();
}

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------
export const ScheduledReports = () => {
  const p = usePalette();
  const { reportSchedules, addReportSchedule, removeReportSchedule, toggleReportSchedule } = useData();

  const [editing,  setEditing]  = useState(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState(null);

  const counts = useMemo(() => ({
    total:    reportSchedules.length,
    enabled:  reportSchedules.filter((s) => s.enabled).length,
    runs:     reportSchedules.reduce((n, s) => n + (s.history?.length || 0), 0),
    sends:    reportSchedules.reduce((n, s) => n + (s.history || []).reduce((m, h) => m + (h.recipients || 0), 0), 0),
  }), [reportSchedules]);

  return (
    <div>
      <PageHeader
        title="Scheduled email reports"
        intro="Cron-style schedules that generate and dispatch daily/weekly/monthly email reports — sales activities, revenue, and 30-day availability. Each schedule fires automatically; you can preview, run on-demand, or pause individual reports."
        action={
          <PrimaryBtn onClick={() => setCreating(true)}>
            <Plus size={13} /> New schedule
          </PrimaryBtn>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Schedules"       value={counts.total}    hint={`${counts.enabled} active`} />
        <Stat label="Active"          value={counts.enabled}  hint={counts.enabled === counts.total ? "All firing" : "Some paused"} color={counts.enabled === counts.total ? p.success : p.warn} />
        <Stat label="Total runs"      value={counts.runs}     hint="Across history" />
        <Stat label="Total recipients dispatched" value={counts.sends.toLocaleString()} color={p.accent} />
      </div>

      {/* Mocked-pipeline notice */}
      <div className="mb-6 p-4 flex items-start gap-3" style={{
        backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`,
        borderInlineStart: `3px solid ${p.warn}`,
      }}>
        <AlertCircle size={14} style={{ color: p.warn, marginTop: 2 }} />
        <div style={{ color: p.textSecondary, fontSize: "0.82rem", lineHeight: 1.5 }}>
          <strong>Mocked pipeline.</strong> Schedules and templates are wired end-to-end in the portal — "Run now" generates the actual email HTML using live store data. When the production cron worker + transactional-email integration go live, the same schedule shape feeds them with no UI changes needed.
        </div>
      </div>

      {/* Schedule table */}
      <Card title={`Schedules · ${reportSchedules.length}`} padded={false} className="mb-5">
        <TableShell>
          <thead>
            <tr>
              <Th>Schedule</Th>
              <Th>Type</Th>
              <Th>Frequency</Th>
              <Th>Recipients</Th>
              <Th>Last run</Th>
              <Th>Next run</Th>
              <Th>Status</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {reportSchedules.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted>
                No schedules yet. <button onClick={() => setCreating(true)} style={{ color: p.accent, fontWeight: 700 }}>Create the first one →</button>
              </Td></tr>
            )}
            {reportSchedules.map((s) => {
              const k = KIND_BY_ID[s.kind] || REPORT_KINDS[0];
              const Icon = KIND_ICON[s.kind] || Activity;
              const nextRun = s.enabled ? (s.nextRunAt || computeNextRun(s)) : null;
              return (
                <tr key={s.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setEditing(s)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>{s.id}</div>
                  </Td>
                  <Td>
                    <span style={{
                      color: k.color, backgroundColor: `${k.color}1F`, border: `1px solid ${k.color}`,
                      padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
                      letterSpacing: "0.18em", textTransform: "uppercase",
                      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                      <Icon size={10} /> {k.label}
                    </span>
                  </Td>
                  <Td muted>
                    {FREQ_BY_ID[s.frequency]?.label || s.frequency}
                    <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>at {s.runAt}{s.frequency === "weekly" && Number.isFinite(s.weekday) ? ` · ${WEEKDAYS[s.weekday]}` : ""}{s.frequency === "monthly" && s.monthDay ? ` · day ${s.monthDay}` : ""}</div>
                  </Td>
                  <Td muted>
                    {s.recipients?.length || 0} {(s.recipients?.length || 0) === 1 ? "person" : "people"}
                    {s.perSalesRep && (
                      <div style={{ color: p.accent, fontSize: "0.7rem", marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <UserCheck size={10} /> + per-rep
                      </div>
                    )}
                  </Td>
                  <Td muted>{s.lastRunAt ? fmtDateTime(s.lastRunAt) : <span style={{ color: p.textMuted }}>Never</span>}</Td>
                  <Td muted>
                    {nextRun ? (
                      <>
                        {fmtDateTime(nextRun)}
                        <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{fmtRelative(nextRun)}</div>
                      </>
                    ) : <span style={{ color: p.textMuted }}>Paused</span>}
                  </Td>
                  <Td>
                    {s.enabled ? (
                      <span style={chip(p.success)}><span style={dot(p.success)} />Active</span>
                    ) : (
                      <span style={chip(p.textMuted)}><span style={dot(p.textMuted)} />Paused</span>
                    )}
                  </Td>
                  <Td align="end">
                    <div className="inline-flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowBtn title="Preview email" icon={Eye} onClick={() => setPreviewing(s)} p={p} />
                      <RowBtn title="Run now" icon={Send} accent onClick={() => setPreviewing({ ...s, _autoSend: true })} p={p} />
                      <RowBtn title={s.enabled ? "Pause schedule" : "Resume schedule"}
                        icon={s.enabled ? Pause : Play}
                        onClick={() => { toggleReportSchedule(s.id); pushToast({ message: `${s.enabled ? "Paused" : "Resumed"} · ${s.name}` }); }}
                        p={p} />
                      <RowBtn title="Edit" icon={Edit2} onClick={() => setEditing(s)} p={p} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      {creating && (
        <ScheduleEditor
          schedule={null}
          onClose={() => setCreating(false)}
          onPreview={(s) => { setCreating(false); setPreviewing(s); }}
        />
      )}
      {editing && (
        <ScheduleEditor
          schedule={editing}
          onClose={() => setEditing(null)}
          onPreview={(s) => { setEditing(null); setPreviewing(s); }}
        />
      )}
      {previewing && (
        <ReportPreviewDrawer
          schedule={previewing}
          autoSend={previewing._autoSend}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
};

function RowBtn({ title, icon: Icon, onClick, p, accent }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: accent ? p.accent : p.textSecondary,
        border: `1px solid ${accent ? p.accent : p.border}`,
        backgroundColor: "transparent", cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = accent ? p.accent : p.textSecondary; e.currentTarget.style.borderColor = accent ? p.accent : p.border; }}
    >
      <Icon size={12} />
    </button>
  );
}

function chip(color) {
  return {
    color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
    padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
    whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}
function dot(color) {
  return { width: 7, height: 7, borderRadius: "50%", backgroundColor: color };
}

// ---------------------------------------------------------------------------
// ScheduleEditor — full-page drawer to add or edit a schedule.
// ---------------------------------------------------------------------------
function ScheduleEditor({ schedule, onClose, onPreview }) {
  const p = usePalette();
  const { addReportSchedule, updateReportSchedule, removeReportSchedule, adminUsers } = useData();
  const isNew = !schedule?.id;

  const [draft, setDraft] = useState(() => ({
    name: "",
    kind: "activities",
    frequency: "daily",
    runAt: "08:00",
    weekday: 1,
    monthDay: 1,
    recipients: [],
    perSalesRep: false,
    enabled: true,
    ...schedule,
  }));
  const [recipientInput, setRecipientInput] = useState("");

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const k = KIND_BY_ID[draft.kind] || REPORT_KINDS[0];

  const addRecipient = () => {
    const e = recipientInput.trim().toLowerCase();
    if (!e) return;
    if (!/.+@.+\..+/.test(e)) { pushToast({ message: "Invalid email address", kind: "warn" }); return; }
    if ((draft.recipients || []).includes(e)) { setRecipientInput(""); return; }
    set({ recipients: [...(draft.recipients || []), e] });
    setRecipientInput("");
  };
  const removeRecipient = (e) => set({ recipients: (draft.recipients || []).filter((x) => x !== e) });

  const save = () => {
    if (!draft.name.trim()) { pushToast({ message: "Name is required", kind: "warn" }); return; }
    if (!draft.recipients || draft.recipients.length === 0) {
      if (!draft.perSalesRep) { pushToast({ message: "Add at least one recipient (or enable per-sales-rep)", kind: "warn" }); return; }
    }
    const next = { ...draft, nextRunAt: computeNextRun(draft) };
    if (isNew) {
      addReportSchedule(next);
      pushToast({ message: `Schedule created · ${draft.name}` });
    } else {
      updateReportSchedule(schedule.id, next);
      pushToast({ message: `Schedule updated · ${draft.name}` });
    }
    onClose?.();
  };

  const remove = () => {
    if (!schedule?.id) return;
    if (!confirm(`Remove schedule "${schedule.name}"? This can't be undone.`)) return;
    removeReportSchedule(schedule.id);
    pushToast({ message: `Removed · ${schedule.name}` });
    onClose?.();
  };

  const Icon = KIND_ICON[draft.kind] || Activity;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={isNew ? "New schedule" : "Edit schedule"}
      title={draft.name || "Untitled schedule"}
      fullPage
      contentMaxWidth="max-w-4xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          {!isNew && <GhostBtn small danger onClick={remove}><Trash2 size={11} /> Remove</GhostBtn>}
          <div className="flex-1" />
          <GhostBtn small onClick={() => onPreview?.({ ...draft, id: schedule?.id || "PREVIEW" })}><Eye size={11} /> Preview</GhostBtn>
          <PrimaryBtn small onClick={save}><Save size={12} /> {isNew ? "Create schedule" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      {/* Header banner */}
      <div className="p-4 mb-5 flex items-start gap-3" style={{
        backgroundColor: `${k.color}10`,
        border: `1px solid ${k.color}40`,
        borderInlineStart: `4px solid ${k.color}`,
      }}>
        <Icon size={20} style={{ color: k.color, marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <div style={{ color: k.color, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            {k.label}
          </div>
          <div style={{ color: p.textPrimary, fontSize: "0.86rem", marginTop: 4 }}>
            {k.hint}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Identity */}
        <Card title="Identity">
          <FormGroup label="Schedule name *">
            <TextField value={draft.name} onChange={(v) => set({ name: v })} placeholder="e.g. Daily sales activities briefing" />
          </FormGroup>
          <FormGroup label="Report type" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {REPORT_KINDS.map((rk) => {
                const sel = draft.kind === rk.id;
                const RkIcon = KIND_ICON[rk.id] || Activity;
                return (
                  <button
                    key={rk.id}
                    onClick={() => set({ kind: rk.id })}
                    className="text-start p-3 transition-colors"
                    style={{
                      backgroundColor: sel ? `${rk.color}14` : "transparent",
                      border: `1px solid ${sel ? rk.color : p.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <RkIcon size={13} style={{ color: rk.color }} />
                      <span style={{ color: sel ? rk.color : p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                        {rk.label}
                      </span>
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.4 }}>
                      {rk.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </FormGroup>
        </Card>

        {/* Frequency */}
        <Card title="When to send">
          <FormGroup label="Frequency">
            <div className="flex flex-wrap gap-2">
              {REPORT_FREQUENCIES.map((f) => {
                const sel = draft.frequency === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => set({ frequency: f.id })}
                    style={{
                      padding: "0.4rem 0.85rem",
                      backgroundColor: sel ? `${p.accent}1F` : "transparent",
                      border: `1px solid ${sel ? p.accent : p.border}`,
                      color: sel ? p.accent : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >{f.label}</button>
                );
              })}
            </div>
            <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6 }}>
              {FREQ_BY_ID[draft.frequency]?.hint}
            </div>
          </FormGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <FormGroup label="Time of day (24h)">
              <input
                type="time"
                value={draft.runAt}
                onChange={(e) => set({ runAt: e.target.value })}
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                }}
              />
            </FormGroup>
            {draft.frequency === "weekly" && (
              <FormGroup label="Day of the week">
                <SelectField
                  value={String(draft.weekday)}
                  onChange={(v) => set({ weekday: parseInt(v, 10) })}
                  options={WEEKDAYS.map((label, i) => ({ value: String(i), label }))}
                />
              </FormGroup>
            )}
            {draft.frequency === "monthly" && (
              <FormGroup label="Day of the month">
                <input
                  type="number" min={1} max={28} step={1}
                  value={draft.monthDay}
                  onChange={(e) => set({ monthDay: parseInt(e.target.value, 10) || 1 })}
                  className="w-full outline-none"
                  style={{
                    backgroundColor: p.inputBg, color: p.textPrimary,
                    border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                  }}
                />
              </FormGroup>
            )}
          </div>

          <div className="mt-4 p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 4 }}>
              Next run preview
            </div>
            <div style={{ color: p.textPrimary, fontSize: "0.86rem" }}>
              {fmtDateTime(computeNextRun(draft))}
            </div>
          </div>
        </Card>

        {/* Recipients */}
        <Card title={`Recipients · ${draft.recipients?.length || 0}`} className="lg:col-span-2">
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                placeholder="name@thelodgesuites.com"
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                }}
              />
            </div>
            <GhostBtn small onClick={addRecipient}><Plus size={11} /> Add</GhostBtn>
          </div>

          {/* Quick-add staff emails */}
          <div className="mb-3">
            <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 6 }}>
              Quick add from staff
            </div>
            <div className="flex flex-wrap gap-2">
              {(adminUsers || []).filter((u) => u.status === "active" && u.email).map((u) => {
                const already = (draft.recipients || []).includes(u.email.toLowerCase());
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (already) removeRecipient(u.email.toLowerCase());
                      else set({ recipients: [...(draft.recipients || []), u.email.toLowerCase()] });
                    }}
                    style={{
                      padding: "0.3rem 0.7rem",
                      backgroundColor: already ? `${p.success}1F` : "transparent",
                      border: `1px solid ${already ? p.success : p.border}`,
                      color: already ? p.success : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                      cursor: "pointer", whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}
                  >
                    {already && <CheckCircle2 size={10} />}
                    {u.name} <span style={{ color: p.textMuted }}>· {u.role}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {(draft.recipients || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {draft.recipients.map((e) => (
                <span key={e} className="inline-flex items-center gap-1.5"
                  style={{
                    padding: "0.3rem 0.7rem",
                    backgroundColor: `${p.accent}1A`, border: `1px solid ${p.accent}`,
                    color: p.accent, fontSize: "0.74rem", fontWeight: 600,
                  }}
                >
                  <Mail size={11} />
                  {e}
                  <button onClick={() => removeRecipient(e)} aria-label="Remove" style={{ color: p.accent, padding: 1 }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Per-sales-rep toggle */}
          <div className="mt-3 p-3 flex items-start justify-between gap-3 flex-wrap" style={{
            backgroundColor: draft.perSalesRep ? `${p.accent}10` : p.bgPanelAlt,
            border: `1px solid ${draft.perSalesRep ? p.accent : p.border}`,
            borderInlineStart: `3px solid ${draft.perSalesRep ? p.accent : p.border}`,
          }}>
            <div className="flex items-start gap-3">
              <UserCheck size={16} style={{ color: draft.perSalesRep ? p.accent : p.textMuted, marginTop: 2 }} />
              <div>
                <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.86rem" }}>
                  Also send a personal copy to each sales rep
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 2, maxWidth: 480 }}>
                  When enabled, the schedule generates a personalised copy per active staff user with their own activities and accounts highlighted, in addition to the team-wide email above.
                </div>
              </div>
            </div>
            <button
              onClick={() => set({ perSalesRep: !draft.perSalesRep })}
              style={{
                width: 44, height: 24, borderRadius: 999,
                backgroundColor: draft.perSalesRep ? p.accent : p.border,
                position: "relative", border: "none", cursor: "pointer", flexShrink: 0,
              }}
              aria-pressed={draft.perSalesRep}
              aria-label="Toggle per-sales-rep"
            >
              <span style={{
                position: "absolute", top: 2, left: draft.perSalesRep ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%",
                backgroundColor: "#fff", transition: "left 120ms",
              }} />
            </button>
          </div>
        </Card>

        {/* History */}
        {!isNew && (schedule.history?.length || 0) > 0 && (
          <Card title={`Recent runs · ${schedule.history.length}`} padded={false} className="lg:col-span-2">
            <TableShell>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Trigger</Th>
                  <Th>Status</Th>
                  <Th align="end">Recipients</Th>
                </tr>
              </thead>
              <tbody>
                {schedule.history.slice(0, 12).map((h) => (
                  <tr key={h.id}>
                    <Td muted>{fmtDateTime(h.runAt)}</Td>
                    <Td muted>{h.kind === "manual" ? "Run-now" : h.kind === "test" ? "Test send" : "Scheduled"}</Td>
                    <Td>
                      <span style={chip(h.status === "sent" ? p.success : h.status === "failed" ? p.danger : p.warn)}>
                        <span style={dot(h.status === "sent" ? p.success : h.status === "failed" ? p.danger : p.warn)} />
                        {h.status}
                      </span>
                    </Td>
                    <Td align="end">{h.recipients}</Td>
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
// ReportPreviewDrawer — renders the generated email in an iframe so the
// operator sees the full HTML output before / after a real send. Includes
// "send now", "test send to me", and download/copy actions.
// ---------------------------------------------------------------------------
function ReportPreviewDrawer({ schedule, autoSend = false, onClose }) {
  const p = usePalette();
  const data = useData();
  const { appendReportRun, updateReportSchedule } = data;
  const adminUsers = data.adminUsers || [];

  const [scopeOwnerId, setScopeOwnerId] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const iframeRef = useRef(null);

  const ownersWithActivity = useMemo(() => {
    const ids = new Set();
    (data.activities || []).forEach((a) => { if (a.ownerId) ids.add(a.ownerId); });
    return adminUsers.filter((u) => ids.has(u.id));
  }, [adminUsers, data.activities]);

  // Build the email — recomputed on every store/scope change so the preview
  // stays live as the operator edits other sections.
  const email = useMemo(() => {
    return buildReportEmail({
      kind: schedule.kind,
      data: {
        activities: data.activities, bookings: data.bookings, payments: data.payments,
        invoices: data.invoices, tax: data.tax, agreements: data.agreements,
        agencies: data.agencies, calendar: data.calendar, adminUsers,
        // Maintenance digest inputs
        maintenanceJobs: data.maintenanceJobs, maintenanceVendors: data.maintenanceVendors,
        roomUnits: data.roomUnits,
      },
      scope: {
        ...(scopeOwnerId ? { ownerId: scopeOwnerId } : {}),
        // Default to a 7-day window for the maintenance digest (matches the
        // sample schedule's weekly cadence; cron worker may override).
        ...(schedule.kind === "maintenance" ? { windowDays: 7 } : {}),
      },
      anchor: new Date(),
    });
  }, [schedule.kind, scopeOwnerId, data.activities, data.bookings, data.payments, data.invoices, data.tax, data.agreements, data.agencies, data.calendar, data.maintenanceJobs, data.maintenanceVendors, data.roomUnits, adminUsers]);

  // Push the email HTML into the preview iframe via srcdoc.
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = email.html;
    }
  }, [email.html]);

  const sendNow = (kind = "manual") => {
    if (!schedule.id || schedule.id === "PREVIEW") {
      pushToast({ message: "Save the schedule first, then run it", kind: "warn" });
      return;
    }
    let recipientCount = (schedule.recipients?.length || 0);
    if (schedule.perSalesRep) recipientCount += ownersWithActivity.length;
    appendReportRun(schedule.id, {
      runAt: new Date().toISOString(),
      status: "sent", recipients: recipientCount, kind,
      nextRunAt: computeNextRun(schedule),
    });
    pushToast({ message: `Report sent · ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}` });
  };

  // Auto-fire if the operator clicked "Run now" from the table.
  useEffect(() => {
    if (autoSend && schedule.id && schedule.id !== "PREVIEW") {
      sendNow("manual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendTest = () => {
    const e = testEmail.trim().toLowerCase();
    if (!/.+@.+\..+/.test(e)) { pushToast({ message: "Invalid test email", kind: "warn" }); return; }
    if (schedule.id && schedule.id !== "PREVIEW") {
      appendReportRun(schedule.id, {
        runAt: new Date().toISOString(),
        status: "sent", recipients: 1, kind: "test",
      });
    }
    pushToast({ message: `Test sent to ${e}` });
    setTestEmail("");
  };

  const downloadHtml = () => {
    const blob = new Blob([email.html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${schedule.kind}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({ message: "HTML downloaded" });
  };

  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(email.html); pushToast({ message: "HTML copied to clipboard" }); }
    catch { pushToast({ message: "Clipboard not available", kind: "warn" }); }
  };

  const openInNewTab = () => {
    const w = window.open("", "_blank");
    if (w) { w.document.write(email.html); w.document.close(); }
    else pushToast({ message: "Pop-ups are blocked — allow them for preview", kind: "warn" });
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Preview · ${KIND_BY_ID[schedule.kind]?.label || schedule.kind}`}
      title={schedule.name || "Report preview"}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Close</GhostBtn>
          <GhostBtn small onClick={copyHtml}><Copy size={11} /> Copy HTML</GhostBtn>
          <GhostBtn small onClick={downloadHtml}><Download size={11} /> Download</GhostBtn>
          <GhostBtn small onClick={openInNewTab}><Eye size={11} /> Open in new tab</GhostBtn>
          <div className="flex-1" />
          <PrimaryBtn small onClick={() => sendNow("manual")}><Send size={11} /> Send now</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 space-y-4">
          {/* Subject */}
          <Card title="Subject line">
            <div style={{ color: p.textPrimary, fontSize: "0.86rem", fontWeight: 600 }}>
              {email.subject}
            </div>
          </Card>

          {/* Recipients */}
          <Card title={`Recipients · ${schedule.recipients?.length || 0}`}>
            {(schedule.recipients?.length || 0) === 0 && !schedule.perSalesRep ? (
              <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No recipients configured.</div>
            ) : (
              <div className="space-y-1.5">
                {(schedule.recipients || []).map((e) => (
                  <div key={e} className="flex items-center gap-2" style={{ color: p.textSecondary, fontSize: "0.8rem" }}>
                    <Mail size={11} style={{ color: p.accent }} />
                    {e}
                  </div>
                ))}
                {schedule.perSalesRep && (
                  <div className="flex items-center gap-2 mt-2" style={{ color: p.accent, fontSize: "0.8rem", fontWeight: 600 }}>
                    <UserCheck size={11} />
                    + personal copy to {ownersWithActivity.length} sales rep{ownersWithActivity.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Per-rep scope picker */}
          {schedule.perSalesRep && ownersWithActivity.length > 0 && (
            <Card title="Preview as">
              <SelectField
                value={scopeOwnerId}
                onChange={setScopeOwnerId}
                options={[{ value: "", label: "Team-wide (no scope)" }, ...ownersWithActivity.map((u) => ({ value: u.id, label: `${u.name} · ${u.email || u.role}` }))]}
              />
              <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6 }}>
                See the personalised copy that each sales rep receives.
              </div>
            </Card>
          )}

          {/* Test send */}
          <Card title="Test send">
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                }}
              />
              <GhostBtn small onClick={sendTest}><Send size={11} /> Send</GhostBtn>
            </div>
            <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6 }}>
              Sends a one-off copy of this preview to a single email — useful before going live with a new schedule.
            </div>
          </Card>
        </div>

        {/* Email preview */}
        <div className="lg:col-span-2">
          <Card title="Email preview" padded={false}>
            <iframe
              ref={iframeRef}
              title="Email preview"
              style={{ width: "100%", minHeight: 720, border: "none", backgroundColor: "#FAF7F0" }}
            />
          </Card>
        </div>
      </div>
    </Drawer>
  );
}
