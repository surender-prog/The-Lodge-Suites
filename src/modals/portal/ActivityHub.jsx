import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Download, Edit2, FileText, Mail, MapPin, MessageCircle, NotebookPen,
  Phone, Plus, Printer, Save, Search, Send, Trash2, Users, X,
} from "lucide-react";
import { usePalette } from "./theme.jsx";
import {
  ACTIVITY_KINDS, ACTIVITY_STATUSES, ACTIVITY_OUTCOMES,
  effectiveActivityStatus, useData,
} from "../../data/store.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, Stat, TableShell, Td, Th, TextField } from "./admin/ui.jsx";

// ---------------------------------------------------------------------------
// ActivityHub — shared sales-activity log + editor used by both the global
// Reports → Activities dashboard and the per-account workspaces (corporate
// and agent). Supports adding, editing, completing, and removing activities.
// Filtering, KPI rollups, and the per-account scoping are handled here so
// the consumer just passes a kind-aware filter (`accountKind` / `accountId`)
// or omits to see everything.
// ---------------------------------------------------------------------------

// Lookup tables — stable refs so child components don't churn.
export const KIND_BY_ID    = Object.fromEntries(ACTIVITY_KINDS.map((k) => [k.id, k]));
export const STATUS_BY_ID  = Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s.id, s]));
export const OUTCOME_BY_ID = Object.fromEntries(ACTIVITY_OUTCOMES.map((o) => [o.id, o]));

const KIND_ICON = {
  visit:   MapPin,
  call:    Phone,
  meeting: Users,
  email:   Mail,
  task:    Check,
  note:    NotebookPen,
};

// Format helpers ----------------------------------------------------------
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
};
const fmtTime = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const fmtRelative = (iso) => {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (Math.abs(days) === 0) return "today";
  if (days > 0)  return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
};

// Local datetime <input type="datetime-local"> uses "YYYY-MM-DDTHH:mm".
const toLocalDtInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
};

// ---------------------------------------------------------------------------
// useFilteredActivities — pull live activities from the store and apply
// scope / filter rules. Used by both the report dashboard and the workspace
// tabs.
// ---------------------------------------------------------------------------
export function useFilteredActivities({ accountKind, accountId, scopeKind } = {}) {
  const { activities } = useData();
  return useMemo(() => {
    return activities
      .filter((a) => {
        if (accountId   && a.accountId   !== accountId)   return false;
        if (accountKind && a.accountKind !== accountKind) return false;
        if (scopeKind   && a.accountKind !== scopeKind)   return false;
        return true;
      })
      .map((a) => ({ ...a, effective: effectiveActivityStatus(a) }))
      .sort((a, b) => {
        // Active items first, then by scheduled/completed date desc
        const aOpen = a.effective === "scheduled" || a.effective === "overdue";
        const bOpen = b.effective === "scheduled" || b.effective === "overdue";
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        const aDt = new Date(a.scheduledAt || a.completedAt || a.createdAt || 0).getTime();
        const bDt = new Date(b.scheduledAt || b.completedAt || b.createdAt || 0).getTime();
        return bDt - aDt;
      });
  }, [activities, accountKind, accountId, scopeKind]);
}

// ---------------------------------------------------------------------------
// ActivityKindChip — small coloured pill with the activity kind icon.
// ---------------------------------------------------------------------------
export function ActivityKindChip({ kindId, small = false }) {
  const k = KIND_BY_ID[kindId] || ACTIVITY_KINDS[0];
  const Icon = KIND_ICON[kindId] || NotebookPen;
  return (
    <span style={{
      color: k.color, backgroundColor: `${k.color}1F`, border: `1px solid ${k.color}`,
      padding: small ? "2px 7px" : "3px 9px",
      fontSize: small ? "0.58rem" : "0.6rem", fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <Icon size={small ? 9 : 10} />
      {k.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusChip — pill for activity status (uses the derived effective status).
// ---------------------------------------------------------------------------
export function ActivityStatusChip({ status }) {
  const s = STATUS_BY_ID[status] || ACTIVITY_STATUSES[0];
  return (
    <span style={{
      color: s.color, backgroundColor: `${s.color}1F`, border: `1px solid ${s.color}`,
      padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ActivityCard — single activity rendered as a card. Used by per-account
// workspaces. Click to edit; "Mark complete" quick-action for scheduled.
// ---------------------------------------------------------------------------
export function ActivityCard({ activity, onEdit, onComplete, showAccount = false }) {
  const p = usePalette();
  const k = KIND_BY_ID[activity.kind] || ACTIVITY_KINDS[0];
  const Icon = KIND_ICON[activity.kind] || NotebookPen;
  const eff = activity.effective || effectiveActivityStatus(activity);
  const isOpen = eff === "scheduled" || eff === "overdue";
  const outcome = activity.outcome ? OUTCOME_BY_ID[activity.outcome] : null;

  return (
    <div
      onClick={() => onEdit?.(activity)}
      className="p-4 transition-colors"
      style={{
        backgroundColor: p.bgPanel,
        border: `1px solid ${p.border}`,
        borderInlineStart: `3px solid ${k.color}`,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = p.bgPanel}
    >
      {/* Top row: kind chip + status + relative date + actions */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ActivityKindChip kindId={activity.kind} small />
          <ActivityStatusChip status={eff} />
          {outcome && (
            <span style={{
              color: outcome.color, fontSize: "0.66rem", fontFamily: "'Manrope', sans-serif",
              fontWeight: 700, letterSpacing: "0.12em",
              padding: "2px 7px", border: `1px solid ${outcome.color}`,
            }}>
              {outcome.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isOpen && onComplete && (
            <button
              onClick={() => onComplete(activity)}
              title="Mark this activity complete"
              className="inline-flex items-center gap-1"
              style={{
                color: p.success, fontSize: "0.6rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                padding: "0.3rem 0.55rem", border: `1px solid ${p.success}`,
                background: "transparent", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            ><CheckCircle2 size={11} /> Complete</button>
          )}
          <button
            onClick={() => onEdit?.(activity)}
            title="Edit activity"
            style={{
              color: p.textMuted, padding: "0.25rem 0.5rem",
              border: `1px solid ${p.border}`, background: "transparent", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          ><Edit2 size={11} /></button>
        </div>
      </div>

      {/* Subject + account name */}
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.25 }}>
        {activity.subject || "(no subject)"}
      </div>
      {showAccount && (
        <div style={{ color: p.accent, fontSize: "0.74rem", fontWeight: 600, marginTop: 2 }}>
          {activity.accountName} <span style={{ color: p.textMuted, fontWeight: 500 }}>· {activity.accountKind}</span>
        </div>
      )}

      {/* Meta row: date · contact · location · owner · duration */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" style={{ fontSize: "0.74rem", color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
        {activity.scheduledAt && (
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={11} />
            {fmtDateTime(activity.scheduledAt)}
            <span style={{ color: eff === "overdue" ? p.danger : p.textMuted, fontWeight: 700 }}>
              · {fmtRelative(activity.scheduledAt)}
            </span>
          </span>
        )}
        {activity.completedAt && eff === "completed" && (
          <span className="inline-flex items-center gap-1.5" style={{ color: p.success }}>
            <CheckCircle2 size={11} />
            Completed {fmtDateTime(activity.completedAt)}
          </span>
        )}
        {activity.contactName && (
          <span className="inline-flex items-center gap-1.5">
            <Users size={11} />
            {activity.contactName}
          </span>
        )}
        {activity.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={11} />
            {activity.location}
          </span>
        )}
        {activity.durationMin > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={11} />
            {activity.durationMin} min
          </span>
        )}
        {activity.ownerName && (
          <span className="inline-flex items-center gap-1.5" style={{ color: p.textPrimary }}>
            By {activity.ownerName}
          </span>
        )}
      </div>

      {/* Summary / minutes */}
      {activity.summary && (
        <div className="mt-3 p-3" style={{
          backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`,
          color: p.textSecondary, fontSize: "0.82rem", lineHeight: 1.55, whiteSpace: "pre-wrap",
        }}>
          {activity.summary}
        </div>
      )}

      {/* Next action */}
      {activity.nextAction && (
        <div className="mt-2.5 inline-flex items-start gap-2" style={{ color: p.accent, fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif" }}>
          <span style={{ fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.62rem" }}>
            Next →
          </span>
          <span style={{ color: p.textPrimary, fontWeight: 500 }}>
            {activity.nextAction}
            {activity.nextActionAt && (
              <span style={{ color: p.textMuted, marginInlineStart: 6, fontSize: "0.7rem" }}>
                · by {fmtDate(activity.nextActionAt)}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityEditor — full-page drawer for adding / editing an activity.
// Pre-populates owner from the first admin user; can be locked to a
// specific account by passing `lockedAccount`.
// ---------------------------------------------------------------------------
export function ActivityEditor({ activity, onClose, lockedAccount }) {
  const p = usePalette();
  const {
    addActivity, updateActivity, removeActivity, completeActivity,
    adminUsers, agreements, agencies, prospects,
    upsertAgreement, upsertAgency, addProspect,
  } = useData();
  const isNew = !activity?.id;

  const [draft, setDraft] = useState(() => ({
    kind: "call",
    accountKind: lockedAccount?.kind || "corporate",
    accountId:   lockedAccount?.id   || "",
    accountName: lockedAccount?.name || "",
    subject: "", contactName: "", location: "",
    scheduledAt: new Date().toISOString().slice(0, 16),
    completedAt: null, durationMin: 30,
    summary: "", outcome: null,
    nextAction: "", nextActionAt: "",
    ownerId: adminUsers?.[0]?.id || "",
    ownerName: adminUsers?.[0]?.name || "",
    status: "scheduled",
    ...activity,
  }));

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // When the operator picks an account from the dropdown, denormalize the
  // account name onto the draft so the activity card stays correct even if
  // the underlying record is later renamed.
  const accounts = useMemo(() => {
    if (lockedAccount) return [lockedAccount];
    if (draft.accountKind === "corporate") {
      return agreements.map((a) => ({ kind: "corporate", id: a.id, name: a.account }));
    }
    if (draft.accountKind === "agent") {
      return agencies.map((a) => ({ kind: "agent", id: a.id, name: a.name }));
    }
    return prospects
      .filter((pr) => (pr.kind === "corporate" || pr.kind === "agent"))
      .map((pr) => ({ kind: "prospect", id: pr.id, name: `${pr.name} · ${pr.kind === "agent" ? "agency" : "corporate"} prospect` }));
  }, [draft.accountKind, agreements, agencies, prospects, lockedAccount]);

  // When the kind changes, default the account to the first one of that kind
  useEffect(() => {
    if (lockedAccount) return;
    if (!isNew) return;
    if (!accounts.find((a) => a.id === draft.accountId)) {
      const first = accounts[0];
      if (first) set({ accountId: first.id, accountName: first.name });
    }
  }, [draft.accountKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const owner = adminUsers?.find((u) => u.id === draft.ownerId);

  // Quick-create a minimal account from the picker. The new record carries
  // just an id + name (and the prospect kind, when applicable) — operators
  // fill in contract terms / contact details later in the dedicated
  // Corporate / Agent / Prospects sections. Returns the created account
  // shape so the picker can immediately select it.
  const createAccount = (rawName, prospectKind = "agent") => {
    const name = String(rawName || "").trim();
    if (!name) {
      pushToast({ message: "Name required to create an account", kind: "warn" });
      return null;
    }
    const kind = draft.accountKind;
    if (kind === "corporate") {
      const id = `AGR-NEW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      upsertAgreement({
        id, account: name, status: "active",
        signedOn: new Date().toISOString().slice(0, 10),
        startsOn: new Date().toISOString().slice(0, 10), endsOn: "",
        industry: "", paymentTerms: "Net 30", creditLimit: 0,
        dailyRates: {}, monthlyRates: {}, taxIncluded: false,
        weekendUpliftPct: 0,
        inclusions: { breakfast: false, lateCheckOut: false, parking: false, wifi: true, meetingRoom: false },
        cancellationPolicy: "",
        pocName: "", pocEmail: "", pocPhone: "",
        notes: `Created inline from the activity log on ${new Date().toLocaleDateString("en-GB")}.`,
        targetNights: 0, ytdNights: 0, ytdSpend: 0,
        users: [],
      });
      pushToast({ message: `Corporate account created · ${name} · ${id}` });
      return { kind: "corporate", id, name };
    }
    if (kind === "agent") {
      const id = `AGT-NEW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      upsertAgency({
        id, name, status: "active",
        signedOn: new Date().toISOString().slice(0, 10),
        startsOn: new Date().toISOString().slice(0, 10), endsOn: "",
        commissionPct: 10, marketingFundPct: 0,
        paymentTerms: "Net 30", creditLimit: 0,
        dailyNet: {}, monthlyNet: {},
        cancellationPolicy: "",
        pocName: "", pocEmail: "", pocPhone: "", contact: "",
        notes: `Created inline from the activity log on ${new Date().toLocaleDateString("en-GB")}.`,
        targetBookings: 0, ytdBookings: 0, ytdRevenue: 0, ytdCommission: 0,
        users: [],
      });
      pushToast({ message: `Travel agent created · ${name} · ${id}` });
      return { kind: "agent", id, name };
    }
    // Prospect — `addProspect` returns the saved record so we can stamp
    // the new id straight onto the activity draft.
    const saved = addProspect({
      kind: prospectKind, name,
      capturedBy: owner?.name || "Operator",
    });
    pushToast({ message: `Prospect captured · ${name} · ${saved?.id || ""}` });
    return saved ? { kind: "prospect", id: saved.id, name: saved.name } : null;
  };

  const save = () => {
    if (!draft.accountId) { pushToast({ message: "Pick an account", kind: "warn" }); return; }
    if (!draft.subject?.trim()) { pushToast({ message: "Subject is required", kind: "warn" }); return; }
    const next = {
      ...draft,
      ownerName: owner?.name || draft.ownerName,
      scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
    };
    if (isNew) {
      addActivity(next);
      pushToast({ message: `Activity logged · ${draft.subject}` });
    } else {
      updateActivity(activity.id, next);
      pushToast({ message: `Activity updated · ${draft.subject}` });
    }
    onClose?.();
  };

  const markComplete = () => {
    completeActivity(activity?.id, {
      summary: draft.summary, outcome: draft.outcome, nextAction: draft.nextAction, nextActionAt: draft.nextActionAt,
    });
    pushToast({ message: `Marked complete · ${draft.subject}` });
    onClose?.();
  };

  const remove = () => {
    if (!activity?.id) return;
    if (!confirm(`Remove this activity? "${draft.subject}"`)) return;
    removeActivity(activity.id);
    pushToast({ message: `Removed · ${draft.subject}` });
    onClose?.();
  };

  const kindMeta = KIND_BY_ID[draft.kind] || ACTIVITY_KINDS[0];
  const accentColor = kindMeta.color;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={isNew ? "Log activity" : "Edit activity"}
      title={draft.subject || "Untitled activity"}
      fullPage
      contentMaxWidth="max-w-4xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          {!isNew && <GhostBtn small danger onClick={remove}><Trash2 size={11} /> Remove</GhostBtn>}
          <div className="flex-1" />
          {!isNew && draft.status !== "completed" && (
            <GhostBtn small onClick={markComplete}><CheckCircle2 size={11} /> Mark complete</GhostBtn>
          )}
          <PrimaryBtn small onClick={save}><Save size={12} /> {isNew ? "Log activity" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      {/* Header card */}
      <div className="p-4 mb-5 flex items-start gap-3" style={{
        backgroundColor: `${accentColor}10`,
        border: `1px solid ${accentColor}40`,
        borderInlineStart: `4px solid ${accentColor}`,
      }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ActivityKindChip kindId={draft.kind} />
            <ActivityStatusChip status={effectiveActivityStatus(draft)} />
            {draft.outcome && (
              <span style={{
                color: OUTCOME_BY_ID[draft.outcome].color,
                fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.16em",
                padding: "2px 7px", border: `1px solid ${OUTCOME_BY_ID[draft.outcome].color}`,
              }}>{OUTCOME_BY_ID[draft.outcome].label}</span>
            )}
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6 }}>
            {kindMeta.hint}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Kind + account */}
        <div className="p-5" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            Type & account
          </div>

          <FormGroup label="Activity kind">
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_KINDS.map((k) => {
                const sel = draft.kind === k.id;
                const Icon = KIND_ICON[k.id] || NotebookPen;
                return (
                  <button
                    key={k.id}
                    onClick={() => set({ kind: k.id })}
                    style={{
                      padding: "0.4rem 0.75rem",
                      backgroundColor: sel ? `${k.color}1F` : "transparent",
                      border: `1px solid ${sel ? k.color : p.border}`,
                      color: sel ? k.color : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      whiteSpace: "nowrap", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <Icon size={11} /> {k.label}
                  </button>
                );
              })}
            </div>
          </FormGroup>

          {!lockedAccount && (
            <>
              <FormGroup label="Account type" className="mt-4">
                <SelectField
                  value={draft.accountKind}
                  onChange={(v) => set({ accountKind: v })}
                  options={[
                    { value: "corporate", label: "Corporate account" },
                    { value: "agent",     label: "Travel agent" },
                    { value: "prospect",  label: "Prospect (pre-contract)" },
                  ]}
                />
              </FormGroup>
              <FormGroup label="Account" className="mt-4">
                <SearchableAccountPicker
                  p={p}
                  accounts={accounts}
                  value={draft.accountId}
                  accountKind={draft.accountKind}
                  onSelect={(a) => set({ accountId: a.id, accountName: a.name })}
                  onCreate={(name, prospectKind) => {
                    const created = createAccount(name, prospectKind);
                    if (created?.id) set({ accountId: created.id, accountName: created.name });
                  }}
                />
              </FormGroup>
            </>
          )}
          {lockedAccount && (
            <div className="mt-4 p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                Account
              </div>
              <div style={{ color: p.textPrimary, fontWeight: 600 }}>{lockedAccount.name}</div>
              <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{lockedAccount.id}</div>
            </div>
          )}
        </div>

        {/* When + who */}
        <div className="p-5" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            When & who
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label={draft.kind === "task" || draft.kind === "note" ? "Due date / time" : "Scheduled date / time"}>
              <input
                type="datetime-local"
                value={toLocalDtInput(draft.scheduledAt)}
                onChange={(e) => set({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                }}
              />
            </FormGroup>
            <FormGroup label="Duration (min)">
              <input
                type="number" min={0} step={5}
                value={draft.durationMin || ""}
                onChange={(e) => set({ durationMin: parseInt(e.target.value, 10) || 0 })}
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                }}
              />
            </FormGroup>
            <FormGroup label="Owner (sales rep)" className="sm:col-span-2">
              <SelectField
                value={draft.ownerId}
                onChange={(v) => {
                  const u = adminUsers?.find((x) => x.id === v);
                  set({ ownerId: v, ownerName: u?.name || "" });
                }}
                options={(adminUsers || []).map((u) => ({ value: u.id, label: `${u.name} · ${u.title || u.role}` }))}
              />
            </FormGroup>
            <FormGroup label="Status" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_STATUSES.filter((s) => !s.derived).map((s) => {
                  const sel = draft.status === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => set({ status: s.id, completedAt: s.id === "completed" ? (draft.completedAt || new Date().toISOString()) : draft.completedAt })}
                      style={{
                        padding: "0.35rem 0.7rem",
                        backgroundColor: sel ? `${s.color}1F` : "transparent",
                        border: `1px solid ${sel ? s.color : p.border}`,
                        color: sel ? s.color : p.textSecondary,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >{s.label}</button>
                  );
                })}
              </div>
            </FormGroup>
          </div>
        </div>

        {/* Subject + contact + location */}
        <div className="p-5 lg:col-span-2" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            Details
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Subject *" className="sm:col-span-2">
              <TextField value={draft.subject} onChange={(v) => set({ subject: v })} placeholder="e.g. Quarterly business review · BAPCO" />
            </FormGroup>
            <FormGroup label="Contact (the person we met / called)">
              <TextField value={draft.contactName} onChange={(v) => set({ contactName: v })} placeholder="e.g. Yusuf Al-Khalifa" />
            </FormGroup>
            <FormGroup label={draft.kind === "visit" ? "Location *" : "Location"}>
              <TextField value={draft.location} onChange={(v) => set({ location: v })} placeholder={draft.kind === "visit" ? "Client's office address" : "Optional"} />
            </FormGroup>
          </div>
        </div>

        {/* Summary / minutes */}
        <div className="p-5 lg:col-span-2" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Summary / Minutes of meeting
            </div>
            <div className="flex items-center gap-2">
              {ACTIVITY_OUTCOMES.map((o) => {
                const sel = draft.outcome === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => set({ outcome: sel ? null : o.id })}
                    title={o.hint}
                    style={{
                      padding: "0.3rem 0.7rem",
                      backgroundColor: sel ? `${o.color}1F` : "transparent",
                      border: `1px solid ${sel ? o.color : p.border}`,
                      color: sel ? o.color : p.textMuted,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >{o.label}</button>
                );
              })}
            </div>
          </div>
          <textarea
            value={draft.summary || ""}
            onChange={(e) => set({ summary: e.target.value })}
            rows={6}
            placeholder={draft.kind === "meeting" || draft.kind === "visit"
              ? "Capture the minutes — attendees, key points discussed, decisions made, follow-ups…"
              : "What was said? Outcome? Any commitments or numbers?"}
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical",
              lineHeight: 1.55,
            }}
          />
        </div>

        {/* Next action */}
        <div className="p-5 lg:col-span-2" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            Next action
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormGroup label="What needs to happen next" className="sm:col-span-2">
              <TextField value={draft.nextAction} onChange={(v) => set({ nextAction: v })} placeholder="e.g. Send revised proposal · Confirm dates · Loop in legal" />
            </FormGroup>
            <FormGroup label="By when">
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
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// SearchableAccountPicker — typeahead combobox for picking an account
// (corporate / agent / prospect) within the activity editor. Filters
// the list as the operator types and surfaces a "+ Create" affordance
// when the typed name doesn't match an existing account, so a sales
// rep can capture a brand-new lead without leaving the activity flow.
// ---------------------------------------------------------------------------
function SearchableAccountPicker({ p, accounts, value, accountKind, onSelect, onCreate }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [prospectKind, setProspectKind] = useState("agent");
  const wrapRef = useRef(null);

  const selected = accounts.find((a) => a.id === value) || null;
  const ql = query.trim().toLowerCase();
  const filtered = ql
    ? accounts.filter((a) => a.name.toLowerCase().includes(ql) || (a.id || "").toLowerCase().includes(ql))
    : accounts;
  const exactMatch = ql ? accounts.find((a) => a.name.toLowerCase() === ql) : null;
  const showCreate = ql && !exactMatch;

  // Close on outside click / Escape so the dropdown behaves like the
  // browser's native combobox.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown",   onKey);
    };
  }, [open]);

  const placeholder = accountKind === "corporate" ? "Search corporate accounts…"
                    : accountKind === "agent"     ? "Search travel agents…"
                    : "Search prospects…";
  const newLabel    = accountKind === "corporate" ? "Corporate"
                    : accountKind === "agent"     ? "Travel agent"
                    : "Prospect";

  const pick = (a) => {
    onSelect(a);
    setQuery("");
    setOpen(false);
  };
  const create = () => {
    if (!ql) return;
    onCreate(query.trim(), accountKind === "prospect" ? prospectKind : null);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      {/* Selected pill or empty state */}
      {selected ? (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            border: `1px solid ${p.border}`,
            backgroundColor: p.bgPanelAlt,
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          <Users size={13} style={{ color: p.accent }} />
          <div className="flex-1 min-w-0">
            <div style={{ color: p.textPrimary, fontSize: "0.86rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selected.name}
            </div>
            {selected.id && (
              <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{selected.id}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect({ id: "", name: "" })}
            title="Clear selection"
            style={{ color: p.textMuted, padding: 4, background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = p.danger)}
            onMouseLeave={(e) => (e.currentTarget.style.color = p.textMuted)}
          ><X size={13} /></button>
          <button
            type="button"
            onClick={() => { setOpen(true); }}
            style={{
              color: p.accent, fontFamily: "'Manrope', sans-serif",
              fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase",
              fontWeight: 700, background: "transparent", border: `1px solid ${p.accent}`,
              padding: "0.3rem 0.55rem", cursor: "pointer", marginInlineStart: 4,
            }}
          >Change</button>
        </div>
      ) : (
        <div className="flex items-center"
          style={{ border: `1px solid ${open ? p.accent : p.border}`, backgroundColor: p.inputBg }}>
          <Search size={13} style={{ color: p.textMuted, marginInlineStart: 10 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 outline-none"
            style={{
              backgroundColor: "transparent", color: p.textPrimary,
              padding: "0.55rem 0.65rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
              border: "none", minWidth: 0,
            }}
          />
        </div>
      )}

      {/* Dropdown panel — only when no selection (or the operator
          asked to "Change" the selected account). */}
      {open && (
        <div
          className="absolute z-30 mt-1 w-full"
          style={{
            backgroundColor: p.bgPanel,
            border: `1px solid ${p.border}`,
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            maxHeight: 320, overflowY: "auto",
          }}
        >
          {/* Inline search when changing an existing selection */}
          {selected && (
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
                <Search size={13} style={{ color: p.textMuted, marginInlineStart: 10 }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  autoFocus
                  className="flex-1 outline-none"
                  style={{
                    backgroundColor: "transparent", color: p.textPrimary,
                    padding: "0.5rem 0.65rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                    border: "none", minWidth: 0,
                  }}
                />
              </div>
            </div>
          )}

          {filtered.length === 0 && !showCreate && (
            <div className="px-4 py-6 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
              No matches. Type a name to create a new account.
            </div>
          )}

          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a)}
              className="w-full text-start px-3 py-2 flex items-center gap-2"
              style={{
                background: "transparent", border: "none",
                borderBottom: `1px solid ${p.border}`,
                cursor: "pointer", fontFamily: "'Manrope', sans-serif",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = p.bgHover || `${p.accent}10`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Users size={12} style={{ color: p.textMuted, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div style={{ color: p.textPrimary, fontSize: "0.84rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {highlight(a.name, ql, p.accent)}
                </div>
                {a.id && (
                  <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{a.id}</div>
                )}
              </div>
            </button>
          ))}

          {showCreate && (
            <div className="px-3 py-3" style={{ borderTop: `1px dashed ${p.border}`, backgroundColor: `${p.accent}08` }}>
              {accountKind === "prospect" && (
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    Prospect type
                  </span>
                  {[
                    { id: "corporate", label: "Corporate" },
                    { id: "agent",     label: "Travel agent" },
                  ].map((k) => {
                    const active = prospectKind === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setProspectKind(k.id)}
                        style={{
                          fontFamily: "'Manrope', sans-serif",
                          fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                          padding: "0.2rem 0.55rem",
                          backgroundColor: active ? `${p.accent}1F` : "transparent",
                          border: `1px solid ${active ? p.accent : p.border}`,
                          color: active ? p.accent : p.textMuted, cursor: "pointer",
                        }}
                      >{k.label}</button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={create}
                className="w-full text-start px-3 py-2 flex items-center gap-2"
                style={{
                  border: `1px solid ${p.accent}`,
                  color: p.accent, backgroundColor: "transparent",
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${p.accent}1A`)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Plus size={12} />
                <span>Create <strong>"{query.trim()}"</strong> as a new {newLabel.toLowerCase()}</span>
              </button>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 6, lineHeight: 1.5 }}>
                Captures the name + a fresh ID right now. Fill in contact details and contract terms later in the {newLabel} section.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Highlights the matching substring inside a name. Returns a React
// fragment so the caller can drop it directly into JSX.
function highlight(text, query, color) {
  const t = String(text || "");
  if (!query) return t;
  const i = t.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return t;
  return (
    <>
      {t.slice(0, i)}
      <strong style={{ color, fontWeight: 700 }}>{t.slice(i, i + query.length)}</strong>
      {t.slice(i + query.length)}
    </>
  );
}

// ---------------------------------------------------------------------------
// AccountActivities — drop-in panel for a per-account workspace tab.
// Shows the activity log scoped to a single account, with a "Log activity"
// CTA, filter chips, and an inline editor drawer.
// ---------------------------------------------------------------------------
export function AccountActivities({ accountKind, accountId, accountName }) {
  const p = usePalette();
  const items = useFilteredActivities({ accountKind, accountId });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("open"); // "open" | "all" | kind

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (filter === "all")  return true;
      if (filter === "open") return a.effective === "scheduled" || a.effective === "overdue";
      if (filter === "done") return a.effective === "completed";
      return a.kind === filter;
    });
  }, [items, filter]);

  const counts = useMemo(() => {
    const out = { open: 0, done: 0, overdue: 0, total: items.length };
    items.forEach((a) => {
      if (a.effective === "completed") out.done++;
      else if (a.effective === "overdue") { out.open++; out.overdue++; }
      else if (a.effective === "scheduled") out.open++;
    });
    return out;
  }, [items]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Activities & follow-ups
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, lineHeight: 1.2 }}>
            {counts.open} open · {counts.done} completed
            {counts.overdue > 0 && <span style={{ color: p.danger, fontSize: "1rem", marginInlineStart: 12 }}>· {counts.overdue} overdue</span>}
          </div>
        </div>
        <PrimaryBtn small onClick={() => setCreating(true)}>
          <Plus size={11} /> Log activity
        </PrimaryBtn>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: "open", label: "Open", count: counts.open, color: p.accent },
          { id: "done", label: "Completed", count: counts.done, color: p.success },
          { id: "all",  label: "All",  count: counts.total, color: p.textSecondary },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "0.35rem 0.85rem",
              backgroundColor: filter === f.id ? `${f.color}1F` : "transparent",
              border: `1px solid ${filter === f.id ? f.color : p.border}`,
              color: filter === f.id ? f.color : p.textSecondary,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.64rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >{f.label} <span style={{ marginInlineStart: 4 }}>· {f.count}</span></button>
        ))}
        <span style={{ color: p.textMuted, padding: "0 6px" }}>|</span>
        {ACTIVITY_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setFilter(filter === k.id ? "all" : k.id)}
            style={{
              padding: "0.35rem 0.7rem",
              backgroundColor: filter === k.id ? `${k.color}1F` : "transparent",
              border: `1px solid ${filter === k.id ? k.color : p.border}`,
              color: filter === k.id ? k.color : p.textMuted,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >{k.label}</button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center" style={{ border: `1px dashed ${p.border}`, color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
          {items.length === 0
            ? `No activities yet for ${accountName}. Log a visit, call, or meeting to start the trail.`
            : "No activities match the current filter."}
          <div className="mt-3">
            <PrimaryBtn small onClick={() => setCreating(true)}><Plus size={11} /> Log first activity</PrimaryBtn>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <ActivityCard key={a.id} activity={a} onEdit={setEditing} onComplete={(act) => setEditing({ ...act, _autoComplete: true })} />
          ))}
        </div>
      )}

      {creating && (
        <ActivityEditor
          activity={null}
          lockedAccount={{ kind: accountKind, id: accountId, name: accountName }}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ActivityEditor
          activity={editing}
          lockedAccount={{ kind: editing.accountKind || accountKind, id: editing.accountId || accountId, name: editing.accountName || accountName }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivitiesDashboard — full sales-activity dashboard. KPI strip · daily
// timeline by activity kind · account-engagement leaderboard · sales-rep
// productivity · full activity log. Used both at the top-level "Activities"
// tab and inside Reports → Activities.
// ---------------------------------------------------------------------------
const PERIODS = [
  { id: "day",   label: "Daily",   days: 1 },
  { id: "week",  label: "Weekly",  days: 7 },
  { id: "month", label: "Monthly", days: 30 },
];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays    = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isoOf      = (d) => startOfDay(d).toISOString().slice(0, 10);
const fmtShortDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtFullDate  = (d) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const navBtnStyle = (p) => ({
  padding: "0.4rem 0.55rem", backgroundColor: "transparent",
  border: `1px solid ${p.border}`, color: p.textMuted, cursor: "pointer",
});

function downloadActivityCsv(rows, filename) {
  if (!rows.length) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  pushToast({ message: `Downloaded · ${filename}` });
}

export function ActivitiesDashboard({ embedded = false }) {
  const p = usePalette();
  const { activities } = useData();
  const [period, setPeriod] = useState(PERIODS[1]);
  const [anchor, setAnchor] = useState(() => new Date());
  const [filterKind,    setFilterKind]    = useState("all");
  const [filterScope,   setFilterScope]   = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [filterOwner,   setFilterOwner]   = useState("all");
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [editing,  setEditing]  = useState(null);
  const [creating, setCreating] = useState(false);
  // Drill-down: when an account row in the leaderboard is clicked, open the
  // detail drawer for that account. Holds the resolved {accountKind, accountId, accountName}.
  const [accountDrillFor, setAccountDrillFor] = useState(null);
  // Ref on the activity log so KPI-tile clicks can scroll the user to the
  // filtered result they just narrowed to.
  const activityLogRef = useRef(null);
  const scrollToLog = () => {
    if (activityLogRef.current) {
      activityLogRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  // Apply a KPI-tile filter preset and scroll to the activity log so the
  // operator sees the filtered list immediately.
  const applyKpiFilter = (preset) => {
    setFilterKind("all");
    setFilterScope("all");
    setFilterOwner("all");
    setFilterStatus(preset.status ?? "all");
    setFilterOutcome(preset.outcome ?? "all");
    setTimeout(scrollToLog, 50);
  };

  const windowStart = useMemo(
    () => period.id === "day" ? startOfDay(anchor) : startOfDay(addDays(anchor, -(period.days - 1))),
    [period, anchor]
  );
  const windowEnd = useMemo(() => startOfDay(anchor), [anchor]);

  // Period stepper (← → · today)
  const move    = (delta) => setAnchor(addDays(anchor, delta * period.days));
  const goToday = () => setAnchor(new Date());
  const isToday = isoOf(anchor) === isoOf(new Date());

  const within = (a) => {
    const d = a.completedAt ? new Date(a.completedAt) : a.scheduledAt ? new Date(a.scheduledAt) : null;
    if (!d) return false;
    const t = startOfDay(d).getTime();
    return t >= windowStart.getTime() && t <= windowEnd.getTime();
  };

  const decorated = useMemo(
    () => activities.map((a) => ({ ...a, effective: effectiveActivityStatus(a) })),
    [activities]
  );

  const filtered = useMemo(() => {
    return decorated
      .filter(within)
      .filter((a) => filterKind    === "all" || a.kind        === filterKind)
      .filter((a) => filterScope   === "all" || a.accountKind === filterScope)
      .filter((a) => filterStatus  === "all" || a.effective   === filterStatus)
      .filter((a) => filterOwner   === "all" || a.ownerId     === filterOwner)
      .filter((a) => filterOutcome === "all" || a.outcome     === filterOutcome)
      .sort((a, b) => {
        const aDt = new Date(a.scheduledAt || a.completedAt || a.createdAt || 0).getTime();
        const bDt = new Date(b.scheduledAt || b.completedAt || b.createdAt || 0).getTime();
        return bDt - aDt;
      });
  }, [decorated, windowStart, windowEnd, filterKind, filterScope, filterStatus, filterOwner, filterOutcome]);

  const stats = useMemo(() => {
    const total      = filtered.length;
    const completed  = filtered.filter((a) => a.effective === "completed").length;
    const overdue    = filtered.filter((a) => a.effective === "overdue").length;
    const scheduled  = filtered.filter((a) => a.effective === "scheduled").length;
    const positive   = filtered.filter((a) => a.outcome === "positive").length;
    const completionRate = (completed + overdue + scheduled) > 0
      ? Math.round((completed / (completed + overdue + scheduled)) * 100)
      : 0;
    const winRate = completed > 0 ? Math.round((positive / completed) * 100) : null;

    const byKind = {};
    ACTIVITY_KINDS.forEach((k) => { byKind[k.id] = 0; });
    filtered.forEach((a) => { byKind[a.kind] = (byKind[a.kind] || 0) + 1; });

    const byScope = { corporate: 0, agent: 0, prospect: 0 };
    filtered.forEach((a) => { byScope[a.accountKind] = (byScope[a.accountKind] || 0) + 1; });

    const byOwner = {};
    filtered.forEach((a) => {
      const key = a.ownerId || "(unassigned)";
      if (!byOwner[key]) byOwner[key] = { id: key, name: a.ownerName || "Unassigned", total: 0, completed: 0, positive: 0 };
      byOwner[key].total++;
      if (a.effective === "completed") byOwner[key].completed++;
      if (a.outcome === "positive")   byOwner[key].positive++;
    });

    const byAccount = {};
    filtered.forEach((a) => {
      const key = `${a.accountKind}:${a.accountId}`;
      if (!byAccount[key]) byAccount[key] = {
        accountKind: a.accountKind, accountId: a.accountId, accountName: a.accountName,
        total: 0, lastTouch: null, lastKind: null,
      };
      byAccount[key].total++;
      const dt = a.completedAt || a.scheduledAt;
      if (dt && (!byAccount[key].lastTouch || new Date(dt) > new Date(byAccount[key].lastTouch))) {
        byAccount[key].lastTouch = dt;
        byAccount[key].lastKind = a.kind;
      }
    });

    return { total, completed, overdue, scheduled, completionRate, winRate, byKind, byScope, byOwner, byAccount, positive };
  }, [filtered]);

  const timeline = useMemo(() => {
    const days = period.days;
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(addDays(windowStart, i)).getTime();
      const iso = new Date(d).toISOString().slice(0, 10);
      const slot = { date: iso, total: 0 };
      ACTIVITY_KINDS.forEach((k) => { slot[k.id] = 0; });
      filtered.forEach((a) => {
        const dt = a.completedAt || a.scheduledAt;
        if (!dt) return;
        if (isoOf(new Date(dt)) === iso) {
          slot[a.kind] = (slot[a.kind] || 0) + 1;
          slot.total++;
        }
      });
      out.push(slot);
    }
    return out;
  }, [filtered, windowStart, period]);
  const peakDay = Math.max(1, ...timeline.map((t) => t.total));

  const owners = useMemo(() => {
    const m = new Map();
    activities.forEach((a) => { if (a.ownerId) m.set(a.ownerId, a.ownerName); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [activities]);

  const exportRows = () => filtered.map((a) => ({
    id: a.id, kind: a.kind, status: a.effective,
    account_kind: a.accountKind, account_id: a.accountId, account: a.accountName,
    subject: a.subject || "",
    scheduled_at: a.scheduledAt || "",
    completed_at: a.completedAt || "",
    duration_min: a.durationMin || "",
    contact: a.contactName || "",
    location: a.location || "",
    outcome: a.outcome || "",
    next_action: a.nextAction || "",
    next_action_at: a.nextActionAt || "",
    owner: a.ownerName || "",
    summary: (a.summary || "").replace(/\s+/g, " ").slice(0, 400),
  }));
  const onDownload = () => downloadActivityCsv(exportRows(), `activities-${period.id}-${isoOf(anchor)}.csv`);

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Sales activities"
          intro="Every visit, call, meeting, email and follow-up logged against corporate accounts, travel agents and prospects. Drill into productivity, outcomes and engagement."
          action={<PrimaryBtn onClick={() => setCreating(true)}><Plus size={13} /> Log activity</PrimaryBtn>}
        />
      )}

      {/* Period + actions */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {PERIODS.map((pp) => (
              <button
                key={pp.id}
                onClick={() => setPeriod(pp)}
                style={{
                  padding: "0.4rem 0.9rem",
                  backgroundColor: period.id === pp.id ? `${p.accent}1F` : "transparent",
                  border: `1px solid ${period.id === pp.id ? p.accent : p.border}`,
                  color: period.id === pp.id ? p.accent : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{pp.label}</button>
            ))}
            <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "0 8px" }}>·</span>
            <button onClick={() => move(-1)} title={`Previous ${period.label.toLowerCase()}`} style={navBtnStyle(p)}><ChevronLeft size={14} /></button>
            <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600, minWidth: 220, textAlign: "center" }}>
              {period.id === "day" ? fmtFullDate(windowEnd) : `${fmtShortDate(windowStart)} → ${fmtShortDate(windowEnd)}`}
            </span>
            <button onClick={() => move(1)} title={`Next ${period.label.toLowerCase()}`} style={navBtnStyle(p)}><ChevronRight size={14} /></button>
            {!isToday && (
              <button onClick={goToday} title="Snap back to today"
                style={{
                  padding: "0.4rem 0.85rem", backgroundColor: "transparent",
                  border: `1px solid ${p.border}`, color: p.textMuted,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
              >Today</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={onDownload}><Download size={11} /> CSV</GhostBtn>
            <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
            {embedded && (
              <PrimaryBtn small onClick={() => setCreating(true)}><Plus size={11} /> Log activity</PrimaryBtn>
            )}
          </div>
        </div>
      </Card>

      {/* KPI strip — every tile becomes a filter shortcut into the log */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat
          label="Total touches"
          value={stats.total}
          hint={`${period.label.toLowerCase()} · all kinds`}
          color={p.accent}
          ctaLabel="View all"
          onClick={() => applyKpiFilter({ status: "all", outcome: "all" })}
        />
        <Stat
          label="Completed"
          value={stats.completed}
          hint={`${stats.completionRate}% completion rate`}
          color={p.success}
          ctaLabel="View"
          onClick={() => applyKpiFilter({ status: "completed" })}
        />
        <Stat
          label="Scheduled"
          value={stats.scheduled}
          hint="Future-dated, on track"
          ctaLabel="View"
          onClick={() => applyKpiFilter({ status: "scheduled" })}
        />
        <Stat
          label="Overdue"
          value={stats.overdue}
          hint={stats.overdue === 0 ? "All caught up" : "Need follow-up"}
          color={stats.overdue > 0 ? p.danger : p.textPrimary}
          ctaLabel="View"
          onClick={() => applyKpiFilter({ status: "overdue" })}
        />
        <Stat
          label="Positive outcome"
          value={stats.winRate != null ? `${stats.winRate}%` : "—"}
          hint={`${stats.positive} of ${stats.completed} completed`}
          color={p.success}
          ctaLabel="View"
          onClick={() => applyKpiFilter({ status: "completed", outcome: "positive" })}
        />
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-3 items-center">
          <span style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            Filters
          </span>
          <div style={{ minWidth: 160 }}>
            <SelectField
              value={filterKind}
              onChange={setFilterKind}
              options={[{ value: "all", label: "All activity kinds" }, ...ACTIVITY_KINDS.map((k) => ({ value: k.id, label: k.label }))]}
            />
          </div>
          <div style={{ minWidth: 170 }}>
            <SelectField
              value={filterScope}
              onChange={setFilterScope}
              options={[
                { value: "all",       label: "All accounts" },
                { value: "corporate", label: "Corporates only" },
                { value: "agent",     label: "Travel agents only" },
                { value: "prospect",  label: "Prospects only" },
              ]}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <SelectField
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "all",       label: "All statuses" },
                { value: "scheduled", label: "Scheduled" },
                { value: "completed", label: "Completed" },
                { value: "overdue",   label: "Overdue" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <SelectField
              value={filterOwner}
              onChange={setFilterOwner}
              options={[{ value: "all", label: "All sales reps" }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
          </div>
          <div style={{ minWidth: 170 }}>
            <SelectField
              value={filterOutcome}
              onChange={setFilterOutcome}
              options={[{ value: "all", label: "All outcomes" }, ...ACTIVITY_OUTCOMES.map((o) => ({ value: o.id, label: o.label }))]}
            />
          </div>
          {(filterKind !== "all" || filterScope !== "all" || filterStatus !== "all" || filterOwner !== "all" || filterOutcome !== "all") && (
            <button
              onClick={() => { setFilterKind("all"); setFilterScope("all"); setFilterStatus("all"); setFilterOwner("all"); setFilterOutcome("all"); }}
              style={{
                color: p.accent, fontSize: "0.62rem", letterSpacing: "0.22em",
                textTransform: "uppercase", fontWeight: 700,
                padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, background: "transparent", cursor: "pointer",
              }}
            >Reset filters</button>
          )}
          <span style={{ marginInlineStart: "auto", color: p.textMuted, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
            {filtered.length} {filtered.length === 1 ? "activity" : "activities"} shown
          </span>
        </div>
      </Card>

      {/* Daily timeline + Mix */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="Daily activity timeline" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1.5" style={{ minHeight: 200 }}>
              {timeline.map((t) => (
                <div key={t.date} className="flex flex-col items-center" style={{ flex: 1, minWidth: 22 }}>
                  <div className="flex flex-col-reverse" style={{ height: 160, justifyContent: "flex-end", width: "100%" }}>
                    {ACTIVITY_KINDS.map((k) => {
                      const n = t[k.id] || 0;
                      if (n === 0) return null;
                      const h = (n / peakDay) * 160;
                      return (
                        <div key={k.id}
                          title={`${k.label}: ${n}`}
                          style={{ width: "100%", height: h, backgroundColor: k.color }} />
                      );
                    })}
                  </div>
                  <div style={{
                    color: p.textMuted, fontSize: "0.6rem",
                    fontFamily: "'Manrope', sans-serif", marginTop: 4,
                    transform: timeline.length > 14 ? "rotate(-50deg)" : "none",
                    transformOrigin: "center top", whiteSpace: "nowrap",
                  }}>{fmtShortDate(t.date)}</div>
                  {timeline.length <= 14 && t.total > 0 && (
                    <div style={{ color: p.textPrimary, fontSize: "0.7rem", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {t.total}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
              {ACTIVITY_KINDS.map((k) => (
                <span key={k.id} className="inline-flex items-center gap-2">
                  <span style={{ width: 10, height: 10, backgroundColor: k.color, display: "inline-block" }} />
                  {k.label}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Activity mix">
          <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
            By kind
          </div>
          <div className="space-y-2 mb-4">
            {ACTIVITY_KINDS.map((k) => {
              const n = stats.byKind[k.id] || 0;
              const pct = stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
              return (
                <div key={k.id}>
                  <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.76rem" }}>
                    <span style={{ color: p.textPrimary, fontWeight: 600 }}>{k.label}</span>
                    <span style={{ color: p.textMuted }}>{n} · {pct}%</span>
                  </div>
                  <div className="h-1.5" style={{ backgroundColor: p.border }}>
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: k.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
            By account type
          </div>
          <div className="space-y-2">
            {[
              { id: "corporate", label: "Corporates",     color: "#D97706" },
              { id: "agent",     label: "Travel agents",  color: "#7C3AED" },
              { id: "prospect",  label: "Prospects",      color: "#2563EB" },
            ].map((sc) => {
              const n = stats.byScope[sc.id] || 0;
              const pct = stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
              return (
                <div key={sc.id}>
                  <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.76rem" }}>
                    <span style={{ color: p.textPrimary, fontWeight: 600 }}>{sc.label}</span>
                    <span style={{ color: p.textMuted }}>{n} · {pct}%</span>
                  </div>
                  <div className="h-1.5" style={{ backgroundColor: p.border }}>
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: sc.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Productivity + Top engaged accounts */}
      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Card title="Sales-rep productivity" padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>Owner</Th>
                <Th align="end">Total</Th>
                <Th align="end">Completed</Th>
                <Th align="end">Positive</Th>
                <Th align="end">Win rate</Th>
              </tr>
            </thead>
            <tbody>
              {Object.values(stats.byOwner).length === 0 ? (
                <tr><Td className="px-3 py-6" align="center" muted>No activity in this window.</Td></tr>
              ) : Object.values(stats.byOwner).sort((a, b) => b.total - a.total).map((o) => {
                const winRate = o.completed > 0 ? Math.round((o.positive / o.completed) * 100) : null;
                return (
                  <tr key={o.id}>
                    <Td>{o.name}</Td>
                    <Td align="end">{o.total}</Td>
                    <Td align="end" muted>{o.completed}</Td>
                    <Td align="end" style={{ color: p.success, fontWeight: 600 }}>{o.positive}</Td>
                    <Td align="end" style={{ color: winRate !== null && winRate >= 50 ? p.success : winRate !== null ? p.warn : p.textMuted, fontWeight: 600 }}>
                      {winRate !== null ? `${winRate}%` : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>

        <Card
          title="Most engaged accounts"
          padded={false}
          action={
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
              Click a row for the full account activity history.
            </span>
          }
        >
          <TableShell>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th align="end">Touches</Th>
                <Th>Last contact</Th>
              </tr>
            </thead>
            <tbody>
              {Object.values(stats.byAccount).length === 0 ? (
                <tr><Td className="px-3 py-6" align="center" muted>No activity in this window.</Td></tr>
              ) : Object.values(stats.byAccount).sort((a, b) => b.total - a.total).slice(0, 10).map((a) => {
                const k = KIND_BY_ID[a.lastKind];
                return (
                  <tr
                    key={`${a.accountKind}:${a.accountId}`}
                    style={{ cursor: "pointer", transition: "background-color 120ms" }}
                    onClick={() => setAccountDrillFor({ accountKind: a.accountKind, accountId: a.accountId, accountName: a.accountName })}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <Td><span style={{ color: p.textPrimary, fontWeight: 600 }}>{a.accountName}</span></Td>
                    <Td>
                      <span style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        color: a.accountKind === "corporate" ? "#D97706" : a.accountKind === "agent" ? "#7C3AED" : "#2563EB",
                      }}>{a.accountKind}</span>
                    </Td>
                    <Td align="end" style={{ color: p.accent, fontWeight: 700 }}>{a.total}</Td>
                    <Td muted>
                      {a.lastTouch ? fmtShortDate(a.lastTouch) : "—"}
                      {k && <span style={{ marginInlineStart: 6, color: k.color, fontSize: "0.7rem", fontWeight: 700 }}>· {k.label}</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      </div>

      {/* Activity log — full cards (scroll target for KPI-tile clicks) */}
      <div ref={activityLogRef} style={{ scrollMarginTop: 24 }} />
      <Card title={`Activity log · ${filtered.length}`}>
        {filtered.length === 0 ? (
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", textAlign: "center", padding: "2rem 0" }}>
            No activities match the current filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 50).map((a) => (
              <ActivityCard key={a.id} activity={a} onEdit={setEditing} onComplete={(act) => setEditing({ ...act })} showAccount />
            ))}
            {filtered.length > 50 && (
              <div style={{ color: p.textMuted, fontSize: "0.78rem", textAlign: "center", padding: "0.5rem 0" }}>
                Showing first 50 of {filtered.length}. Tighten filters or download CSV for the full set.
              </div>
            )}
          </div>
        )}
      </Card>

      {creating && <ActivityEditor activity={null} onClose={() => setCreating(false)} />}
      {editing  && <ActivityEditor activity={editing} onClose={() => setEditing(null)} />}

      {/* Account drill-down — opens when an operator clicks a row in the
          "Most engaged accounts" leaderboard. Independent of the dashboard's
          period selector; the drawer has its own date range so the operator
          can see the account's full history regardless of what's in window. */}
      {accountDrillFor && (
        <AccountActivityDrawer
          account={accountDrillFor}
          onClose={() => setAccountDrillFor(null)}
          onEditActivity={(act) => setEditing(act)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountActivityDrawer — full-page drill-down for a single account from the
// "Most engaged accounts" leaderboard. Independent date filters (Today /
// Last 7 days / Last 30 days / All time / Custom), KPI strip, timeline by
// activity kind, kind/owner/outcome breakdowns, full activity log with edit,
// and a "Log new activity" CTA that opens the editor with this account
// already locked.
// ---------------------------------------------------------------------------
function AccountActivityDrawer({ account, onClose, onEditActivity }) {
  const p = usePalette();
  const { activities, agreements, agencies, prospects } = useData();

  // Date range — defaults to "All time" so the operator sees the full history.
  const todayIso = isoOf(new Date());
  const [rangeKind, setRangeKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to,   setTo]   = useState(todayIso);
  // "Log new activity" launches a separate editor with this account locked.
  const [creatingForAccount, setCreatingForAccount] = useState(false);

  useEffect(() => {
    const today = new Date();
    if (rangeKind === "day") {
      setFrom(isoOf(today)); setTo(isoOf(today));
    } else if (rangeKind === "week") {
      setFrom(isoOf(addDays(today, -6))); setTo(isoOf(today));
    } else if (rangeKind === "month") {
      setFrom(isoOf(addDays(today, -29))); setTo(isoOf(today));
    } else if (rangeKind === "all") {
      setFrom(""); setTo(isoOf(today));
    }
  }, [rangeKind]);

  // Resolve the live account record from the appropriate registry so the
  // drawer header can show address / contact info beyond just the name.
  const liveAccount = useMemo(() => {
    if (account.accountKind === "corporate") return (agreements || []).find((x) => x.id === account.accountId) || null;
    if (account.accountKind === "agent")     return (agencies   || []).find((x) => x.id === account.accountId) || null;
    if (account.accountKind === "prospect")  return (prospects  || []).find((x) => x.id === account.accountId) || null;
    return null;
  }, [account, agreements, agencies, prospects]);

  // All activities ever logged against this account.
  const allAccountActivities = useMemo(() => {
    return (activities || [])
      .filter((a) => a.accountKind === account.accountKind && a.accountId === account.accountId)
      .map((a) => ({ ...a, effective: effectiveActivityStatus(a) }));
  }, [activities, account]);

  // Apply the date filter.
  const filtered = useMemo(() => {
    return allAccountActivities.filter((a) => {
      const d = (a.completedAt || a.scheduledAt || "").slice(0, 10);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }).sort((a, b) => {
      const aDt = new Date(a.scheduledAt || a.completedAt || a.createdAt || 0).getTime();
      const bDt = new Date(b.scheduledAt || b.completedAt || b.createdAt || 0).getTime();
      return bDt - aDt;
    });
  }, [allAccountActivities, from, to]);

  // Headline numbers
  const total      = filtered.length;
  const completed  = filtered.filter((a) => a.effective === "completed").length;
  const overdue    = filtered.filter((a) => a.effective === "overdue").length;
  const scheduled  = filtered.filter((a) => a.effective === "scheduled").length;
  const positive   = filtered.filter((a) => a.outcome === "positive").length;
  const winRate    = completed > 0 ? Math.round((positive / completed) * 100) : null;
  const allTimeCount = allAccountActivities.length;

  // Last + next contact
  const lastTouch  = filtered.find((a) => a.completedAt);
  const nextTouch  = filtered.filter((a) => a.scheduledAt && !a.completedAt)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];

  // By kind
  const byKind = useMemo(() => {
    const out = {};
    ACTIVITY_KINDS.forEach((k) => { out[k.id] = { id: k.id, label: k.label, color: k.color, total: 0, completed: 0 }; });
    filtered.forEach((a) => {
      if (!out[a.kind]) out[a.kind] = { id: a.kind, label: a.kind, color: p.accent, total: 0, completed: 0 };
      out[a.kind].total++;
      if (a.effective === "completed") out[a.kind].completed++;
    });
    return Object.values(out).filter((k) => k.total > 0).sort((a, b) => b.total - a.total);
  }, [filtered, p.accent]);

  // By owner (sales rep)
  const byOwner = useMemo(() => {
    const out = {};
    filtered.forEach((a) => {
      const key = a.ownerId || "(unassigned)";
      if (!out[key]) out[key] = { id: key, name: a.ownerName || "Unassigned", total: 0, completed: 0, positive: 0 };
      out[key].total++;
      if (a.effective === "completed") out[key].completed++;
      if (a.outcome === "positive")    out[key].positive++;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Daily timeline by kind
  const trend = useMemo(() => {
    if (!from && !to && allAccountActivities.length === 0) return [];
    const earliestIso = allAccountActivities.reduce((acc, a) => {
      const d = (a.completedAt || a.scheduledAt || a.createdAt || "").slice(0, 10);
      return d && (!acc || d < acc) ? d : acc;
    }, "");
    const start = from ? startOfDay(new Date(from)) : startOfDay(new Date(earliestIso || todayIso));
    const end   = to   ? startOfDay(new Date(to))   : startOfDay(new Date());
    const days  = Math.min(180, Math.max(1, Math.round((end - start) / 86400000) + 1));
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(addDays(start, i));
      const iso = isoOf(d);
      const row = { date: iso, total: 0 };
      ACTIVITY_KINDS.forEach((k) => { row[k.id] = 0; });
      filtered.forEach((a) => {
        const dt = (a.completedAt || a.scheduledAt || "").slice(0, 10);
        if (dt === iso) {
          row[a.kind] = (row[a.kind] || 0) + 1;
          row.total++;
        }
      });
      out.push(row);
    }
    return out;
  }, [filtered, from, to, allAccountActivities, todayIso]);
  const peakDay = Math.max(1, ...trend.map((t) => t.total));

  // CSV export
  const exportCsv = () => {
    if (filtered.length === 0) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
    const rows = filtered.map((a) => ({
      id: a.id,
      kind: KIND_BY_ID[a.kind]?.label || a.kind,
      status: a.effective,
      scheduled: a.scheduledAt || "",
      completed: a.completedAt || "",
      subject: a.subject || "",
      contact: a.contactName || "",
      location: a.location || "",
      duration_min: a.durationMin || 0,
      outcome: a.outcome || "",
      next_action: a.nextAction || "",
      next_action_at: a.nextActionAt || "",
      owner: a.ownerName || "",
      summary: (a.summary || "").replace(/\s+/g, " ").slice(0, 400),
    }));
    const slug = (account.accountName || "account").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadActivityCsv(rows, `account-${slug}-activity-${from || "all"}_${to || "today"}.csv`);
  };

  // Account-type chip color
  const typeColor = account.accountKind === "corporate" ? "#D97706"
    : account.accountKind === "agent" ? "#7C3AED"
    : account.accountKind === "prospect" ? "#2563EB"
    : p.accent;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Account activity · ${account.accountKind.toUpperCase()}${account.accountId ? ` · ${account.accountId}` : ""}`}
      title={account.accountName}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
            {filtered.length} {filtered.length === 1 ? "touch" : "touches"} in window · all-time <strong style={{ color: p.textPrimary }}>{allTimeCount}</strong>
          </span>
          <div className="flex-1" />
          <GhostBtn small onClick={exportCsv}><Download size={11} /> Export CSV</GhostBtn>
          <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
          <PrimaryBtn small onClick={() => setCreatingForAccount(true)}><Plus size={11} /> Log activity</PrimaryBtn>
        </>
      }
    >
      {/* Account profile chip */}
      {liveAccount && (
        <Card title="Account profile" className="mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Type</div>
              <div style={{ color: typeColor, marginTop: 4, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.7rem" }}>
                {account.accountKind}
              </div>
            </div>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Primary contact</div>
              <div style={{ color: p.textPrimary, marginTop: 4 }}>{liveAccount.contactName || liveAccount.primaryContact || liveAccount.contact || "—"}</div>
            </div>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Phone</div>
              <div style={{ color: p.textPrimary, marginTop: 4 }}>{liveAccount.phone || "—"}</div>
            </div>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Email</div>
              <div style={{ color: p.textPrimary, marginTop: 4, wordBreak: "break-all" }}>{liveAccount.email || "—"}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Date range pills */}
      <Card title="Date range" className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { id: "day",    label: "Today" },
            { id: "week",   label: "Last 7 days" },
            { id: "month",  label: "Last 30 days" },
            { id: "all",    label: "All time" },
            { id: "custom", label: "Custom" },
          ].map((opt) => {
            const sel = rangeKind === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setRangeKind(opt.id)}
                style={{
                  padding: "0.4rem 0.95rem",
                  backgroundColor: sel ? `${p.accent}1F` : "transparent",
                  border: `1px solid ${sel ? p.accent : p.border}`,
                  color: sel ? p.accent : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{opt.label}</button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormGroup label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setRangeKind("custom"); }}
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </FormGroup>
          <FormGroup label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setRangeKind("custom"); }}
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </FormGroup>
        </div>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat label="Total touches" value={total}     hint={`All-time ${allTimeCount}`} color={p.accent} />
        <Stat label="Completed"     value={completed} hint={total > 0 ? `${Math.round((completed / total) * 100)}% of touches` : "—"} color={p.success} />
        <Stat label="Scheduled"     value={scheduled} hint="Future-dated, on track" />
        <Stat label="Overdue"       value={overdue}   hint={overdue === 0 ? "All caught up" : "Need follow-up"} color={overdue > 0 ? p.danger : p.textPrimary} />
        <Stat label="Positive outcome" value={winRate != null ? `${winRate}%` : "—"} hint={`${positive} of ${completed} completed`} color={p.success} />
      </div>

      {/* Last / next contact summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <Card title="Last contact">
          {lastTouch ? (
            <div>
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", fontWeight: 600 }}>
                {lastTouch.subject}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                <span style={{
                  color: KIND_BY_ID[lastTouch.kind]?.color,
                  backgroundColor: `${KIND_BY_ID[lastTouch.kind]?.color}1F`,
                  border: `1px solid ${KIND_BY_ID[lastTouch.kind]?.color}`,
                  padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                }}>{KIND_BY_ID[lastTouch.kind]?.label || lastTouch.kind}</span>
                <span style={{ color: p.textMuted }}>{fmtShortDate(lastTouch.completedAt)} · {lastTouch.ownerName}</span>
              </div>
              {lastTouch.summary && (
                <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 8, lineHeight: 1.5 }}>
                  {lastTouch.summary}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No completed touches in this window.</div>
          )}
        </Card>
        <Card title="Next scheduled">
          {nextTouch ? (
            <div>
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", fontWeight: 600 }}>
                {nextTouch.subject}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                <span style={{
                  color: KIND_BY_ID[nextTouch.kind]?.color,
                  backgroundColor: `${KIND_BY_ID[nextTouch.kind]?.color}1F`,
                  border: `1px solid ${KIND_BY_ID[nextTouch.kind]?.color}`,
                  padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                }}>{KIND_BY_ID[nextTouch.kind]?.label || nextTouch.kind}</span>
                <span style={{ color: nextTouch.effective === "overdue" ? p.danger : p.textMuted }}>
                  {fmtShortDate(nextTouch.scheduledAt)} · {nextTouch.ownerName}
                </span>
                {nextTouch.effective === "overdue" && (
                  <span style={{ color: p.danger, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.6rem" }}>Overdue</span>
                )}
              </div>
              {nextTouch.location && (
                <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 8 }}>
                  {nextTouch.location}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>Nothing scheduled. Use “Log activity” to plan the next touch.</div>
          )}
        </Card>
      </div>

      {/* Trend + breakdowns */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="Touch timeline" className="lg:col-span-2">
          {trend.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No activity in this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1.5" style={{ minHeight: 200 }}>
                {trend.map((t) => (
                  <div key={t.date} className="flex flex-col items-center" style={{ flex: 1, minWidth: 18 }}>
                    <div className="flex flex-col-reverse" style={{ height: 160, justifyContent: "flex-end", width: "100%" }}>
                      {ACTIVITY_KINDS.map((k) => {
                        const n = t[k.id] || 0;
                        if (n === 0) return null;
                        const h = (n / peakDay) * 160;
                        return (
                          <div key={k.id}
                            title={`${k.label}: ${n}`}
                            style={{ width: "100%", height: h, backgroundColor: k.color }} />
                        );
                      })}
                    </div>
                    {trend.length <= 31 && (
                      <div style={{
                        color: p.textMuted, fontSize: "0.58rem",
                        fontFamily: "'Manrope', sans-serif", marginTop: 4,
                        transform: trend.length > 14 ? "rotate(-50deg)" : "none",
                        transformOrigin: "center top", whiteSpace: "nowrap",
                      }}>{fmtShortDate(t.date)}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
                {byKind.map((k) => (
                  <span key={k.id} className="inline-flex items-center gap-2">
                    <span style={{ width: 10, height: 10, backgroundColor: k.color, display: "inline-block" }} />
                    {k.label} · {k.total}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="By activity kind">
          {byKind.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No activity in this window.</div>
          ) : (
            <div className="space-y-2">
              {byKind.map((k) => {
                const pct = total > 0 ? Math.round((k.total / total) * 100) : 0;
                return (
                  <div key={k.id}>
                    <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                      <span style={{ color: p.textPrimary, fontWeight: 600 }}>{k.label}</span>
                      <span style={{ color: p.textMuted }}>{k.total} · {pct}%</span>
                    </div>
                    <div className="h-1.5" style={{ backgroundColor: p.border }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: k.color }} />
                    </div>
                    {k.completed > 0 && (
                      <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                        {k.completed} completed
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Sales-rep contributions */}
      {byOwner.length > 0 && (
        <Card title={`Sales-rep contributions · ${byOwner.length}`} padded={false} className="mb-5">
          <TableShell>
            <thead>
              <tr>
                <Th>Owner</Th>
                <Th align="end">Touches</Th>
                <Th align="end">Completed</Th>
                <Th align="end">Positive</Th>
                <Th align="end">Win rate</Th>
              </tr>
            </thead>
            <tbody>
              {byOwner.map((o) => {
                const wr = o.completed > 0 ? Math.round((o.positive / o.completed) * 100) : null;
                return (
                  <tr key={o.id}>
                    <Td>{o.name}</Td>
                    <Td align="end">{o.total}</Td>
                    <Td align="end" muted>{o.completed}</Td>
                    <Td align="end" style={{ color: p.success, fontWeight: 600 }}>{o.positive}</Td>
                    <Td align="end" style={{ color: wr !== null && wr >= 50 ? p.success : wr !== null ? p.warn : p.textMuted, fontWeight: 600 }}>
                      {wr !== null ? `${wr}%` : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* Full activity log for this account */}
      <Card title={`Activity log · ${filtered.length}`}>
        {filtered.length === 0 ? (
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", textAlign: "center", padding: "2rem 0" }}>
            No activities in this window.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                onEdit={(act) => { onEditActivity?.(act); onClose(); }}
                onComplete={(act) => { onEditActivity?.(act); onClose(); }}
                showAccount={false}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Locked-account editor — opens when "Log activity" is clicked */}
      {creatingForAccount && (
        <ActivityEditor
          activity={null}
          onClose={() => setCreatingForAccount(false)}
          lockedAccount={{
            kind: account.accountKind,
            id:   account.accountId,
            name: account.accountName,
          }}
        />
      )}
    </Drawer>
  );
}
