import React, { useMemo, useState } from "react";
import {
  Activity, AlertCircle, Calendar, Download, Filter, KeyRound, LogIn, LogOut,
  Search, Send, Shield, ShieldCheck, Trash2, User, UserCheck, Users, Wrench, Zap,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { AUDIT_KINDS, useData } from "../../../../data/store.jsx";
import {
  Card, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// ActivityLog — admin audit trail. Records every meaningful action the
// system observes: sign-ins, impersonation start/end, password changes,
// permission edits, bookings created from the portal, vendor dispatch, etc.
// Each entry carries actor + (optional) target + free-form details + IP.
// ---------------------------------------------------------------------------

const KIND_ICON = {
  "login": LogIn,
  "logout": LogOut,
  "impersonate-start": UserCheck,
  "impersonate-end": Shield,
  "password-change": KeyRound,
  "permissions-change": ShieldCheck,
  "booking-created": Calendar,
  "prospect-converted": Send,
  "vendor-call": Wrench,
  "data-export": Download,
};

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};
const fmtRelative = (iso) => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(ms / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(ms / 86400000);
  return `${days}d ago`;
};

export const ActivityLog = () => {
  const p = usePalette();
  const { auditLogs, adminUsers, clearAuditLogs } = useData();

  const [filterKind,  setFilterKind]  = useState("all");
  const [filterActor, setFilterActor] = useState("all");
  const [filterDate,  setFilterDate]  = useState("7d");
  const [search,      setSearch]      = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = (() => {
      const now = Date.now();
      if (filterDate === "1d") return now - 86400000;
      if (filterDate === "7d") return now - 7 * 86400000;
      if (filterDate === "30d") return now - 30 * 86400000;
      return 0;
    })();
    return (auditLogs || [])
      .filter((l) => filterKind === "all" || l.kind === filterKind)
      .filter((l) => filterActor === "all" || l.actorId === filterActor)
      .filter((l) => {
        if (cutoff === 0) return true;
        const t = new Date(l.ts).getTime();
        return Number.isFinite(t) && t >= cutoff;
      })
      .filter((l) => {
        if (!q) return true;
        const hay = [l.actorName, l.targetName, l.details, l.kind, l.id, l.ip].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [auditLogs, filterKind, filterActor, filterDate, search]);

  const stats = useMemo(() => {
    const total = (auditLogs || []).length;
    const today = (auditLogs || []).filter((l) => {
      const d = new Date(l.ts);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const impersonations = (auditLogs || []).filter((l) => l.kind === "impersonate-start").length;
    const logins = (auditLogs || []).filter((l) => l.kind === "login").length;
    return { total, today, impersonations, logins };
  }, [auditLogs]);

  const owners = useMemo(() => {
    const m = new Map();
    (auditLogs || []).forEach((l) => { if (l.actorId) m.set(l.actorId, l.actorName); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [auditLogs]);

  const exportCsv = () => {
    if (filtered.length === 0) { pushToast({ message: "No rows to export", kind: "warn" }); return; }
    const cols = ["id", "ts", "kind", "actor_id", "actor_name", "actor_role", "target_kind", "target_id", "target_name", "details", "ip"];
    const rows = filtered.map((l) => [l.id, l.ts, l.kind, l.actorId || "", l.actorName || "", l.actorRole || "", l.targetKind || "", l.targetId || "", l.targetName || "", (l.details || "").replace(/[\r\n]/g, " "), l.ip || ""]);
    const csv = [cols.join(","), ...rows.map((r) => r.map((v) => /[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    pushToast({ message: `Exported ${filtered.length} log entries` });
  };

  const clearAll = () => {
    if (!confirm(`Clear all ${(auditLogs || []).length} audit log entries? This can't be undone in the mocked store.`)) return;
    clearAuditLogs();
    pushToast({ message: "Audit log cleared" });
  };

  return (
    <div>
      <PageHeader
        title="Activity Log"
        intro="Audit trail of every meaningful action: sign-ins, impersonation, password changes, permission edits, bookings, vendor dispatch and exports. Filter by kind, actor, or time window."
        action={
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={exportCsv}><Download size={11} /> CSV</GhostBtn>
            <GhostBtn small danger onClick={clearAll}><Trash2 size={11} /> Clear</GhostBtn>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Total events"      value={stats.total}          hint={`${(auditLogs || []).length} entries on file`} />
        <Stat label="Today"             value={stats.today}          hint="Events recorded today" color={p.accent} />
        <Stat label="Sign-ins"          value={stats.logins}         hint="Authenticated sessions" color={p.success} />
        <Stat label="Impersonations"    value={stats.impersonations} hint="Owner override sessions" color={p.warn} />
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-3 items-center">
          <span style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            <Filter size={11} style={{ display: "inline", marginInlineEnd: 4 }} /> Filters
          </span>
          <div style={{ minWidth: 220 }}>
            <SelectField
              value={filterKind}
              onChange={setFilterKind}
              options={[{ value: "all", label: "All event kinds" }, ...AUDIT_KINDS.map((k) => ({ value: k.id, label: k.label }))]}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <SelectField
              value={filterActor}
              onChange={setFilterActor}
              options={[{ value: "all", label: "All actors" }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
          </div>
          <div style={{ minWidth: 160 }}>
            <SelectField
              value={filterDate}
              onChange={setFilterDate}
              options={[
                { value: "1d",  label: "Last 24 hours" },
                { value: "7d",  label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
                { value: "all", label: "All time" },
              ]}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <span className="flex items-center px-3" style={{ color: p.textMuted }}><Search size={14} /></span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actor, target, details, IP…"
                className="flex-1 outline-none"
                style={{ backgroundColor: "transparent", color: p.textPrimary, padding: "0.6rem 0.5rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", border: "none", minWidth: 0 }}
              />
            </div>
          </div>
          {(filterKind !== "all" || filterActor !== "all" || filterDate !== "7d" || search) && (
            <button
              onClick={() => { setFilterKind("all"); setFilterActor("all"); setFilterDate("7d"); setSearch(""); }}
              style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, background: "transparent" }}
            >Reset</button>
          )}
          <span style={{ marginInlineStart: "auto", color: p.textMuted, fontSize: "0.74rem" }}>
            {filtered.length} {filtered.length === 1 ? "event" : "events"}
          </span>
        </div>
      </Card>

      {/* Log table */}
      <Card title={`Events · ${filtered.length}`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Event</Th>
              <Th>Actor</Th>
              <Th>Target</Th>
              <Th>Details</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted colSpan={6}>
                No events match the filters.
              </Td></tr>
            )}
            {filtered.map((l) => {
              const kind = AUDIT_KINDS.find((k) => k.id === l.kind) || { label: l.kind, color: p.textMuted };
              const Icon = KIND_ICON[l.kind] || Activity;
              return (
                <tr key={l.id}>
                  <Td muted style={{ whiteSpace: "nowrap" }}>
                    <div>{fmtDateTime(l.ts)}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{fmtRelative(l.ts)}</div>
                  </Td>
                  <Td>
                    <span style={{
                      color: kind.color, backgroundColor: `${kind.color}1F`, border: `1px solid ${kind.color}`,
                      padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
                      letterSpacing: "0.18em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                      <Icon size={10} /> {kind.label}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{l.actorName || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                      {l.actorId} {l.actorRole ? `· ${l.actorRole}` : ""}
                    </div>
                  </Td>
                  <Td>
                    {l.targetName ? (
                      <>
                        <div style={{ color: p.textSecondary }}>{l.targetName}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                          {l.targetId} {l.targetKind ? `· ${l.targetKind}` : ""}
                        </div>
                      </>
                    ) : <span style={{ color: p.textMuted }}>—</span>}
                  </Td>
                  <Td muted style={{ maxWidth: 360, lineHeight: 1.45 }}>{l.details || "—"}</Td>
                  <Td muted style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", whiteSpace: "nowrap" }}>{l.ip || "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </div>
  );
};
