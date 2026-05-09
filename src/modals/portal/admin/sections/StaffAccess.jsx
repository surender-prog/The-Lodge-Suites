import React, { useMemo, useState } from "react";
import {
  Briefcase, Building2, Check, Copy, Crown, Edit2, Eye, EyeOff, KeyRound, Lock,
  Mail, Plus, RotateCcw, Save, Search, Shield, ShieldCheck, ShieldOff,
  Sparkles, Trash2, UserCheck, UserPlus, Users, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { ADMIN_ROLES, PERMISSIONS, useData } from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// Staff & Access — admin/operator users with role-based permissions to manage
// the entire portal: corporates, agents, LS Privilege members, bookings,
// folios and more. Modeled in the same shape as the loyalty-member profile
// drawer so the UX rhymes between guest and staff management.
// ---------------------------------------------------------------------------

const STATUS_BASE = {
  active:    { label: "Active",    color: "#16A34A" },
  suspended: { label: "Suspended", color: "#DC2626" },
  invited:   { label: "Invited",   color: "#2563EB" },
};

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
};

// Group permissions by category for the matrix renderer.
function groupedPerms() {
  const groups = {};
  PERMISSIONS.forEach((perm) => {
    if (!groups[perm.category]) groups[perm.category] = [];
    groups[perm.category].push(perm);
  });
  return Object.entries(groups);
}

// Derive a count summary like "12 / 16 scopes" for a permissions array.
function permsSummary(perms) {
  const total = PERMISSIONS.length;
  const have  = perms?.length || 0;
  if (have === total) return "All scopes";
  if (have === 0)     return "No access";
  return `${have} / ${total} scopes`;
}

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------
export const StaffAccess = () => {
  const p = usePalette();
  const { adminUsers, staffSession, staffImpersonation, startStaffImpersonation } = useData();

  const [search, setSearch]       = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editing,  setEditing]    = useState(null);   // existing user being edited
  const [creating, setCreating]   = useState(false);  // new-user drawer flag
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  // The Owner is treated as the active "super admin" and is the actor for
  // any impersonation event. Prefer the actually signed-in operator; fall
  // back to the first owner record / first user for the demo session.
  const owner = adminUsers.find((u) => u.id === staffSession?.id) || adminUsers.find((u) => u.role === "owner") || adminUsers[0];
  const actorIsOwner = (staffSession?.role || owner?.role) === "owner" && !staffImpersonation;

  // Trigger a staff-on-staff impersonation. Confirms with the operator,
  // shows a toast on result, and the Partner Portal banner / re-render
  // happens automatically when staffSession swaps.
  const goImpersonateStaff = (target) => {
    if (!actorIsOwner) {
      pushToast({ message: "Only the Owner can log in as a teammate.", kind: "warn" });
      return;
    }
    if (target.id === staffSession?.id) {
      pushToast({ message: "You're already signed in as this user.", kind: "warn" });
      return;
    }
    if (target.status !== "active") {
      pushToast({ message: "Suspended accounts can't be impersonated. Reactivate first.", kind: "warn" });
      return;
    }
    if (!confirm(`Log in as ${target.name} (${target.title || target.role})?\n\nYou'll see the portal exactly as ${target.name.split(" ")[0]} sees it. Every action is logged. Use "Stop impersonating" in the banner to return to your Owner session.`)) return;
    const res = startStaffImpersonation(target);
    if (res?.ok) {
      pushToast({ message: `Now signed in as ${target.name}` });
    } else if (res?.error) {
      pushToast({ message: res.error, kind: "warn" });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adminUsers
      .filter((u) => filterRole   === "all" || u.role   === filterRole)
      .filter((u) => filterStatus === "all" || u.status === filterStatus)
      .filter((u) => {
        if (!q) return true;
        const hay = [u.name, u.email, u.title, u.phone, u.id].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [adminUsers, search, filterRole, filterStatus]);

  // Top-of-page KPIs.
  const total      = adminUsers.length;
  const active     = adminUsers.filter((u) => u.status === "active").length;
  const suspended  = adminUsers.filter((u) => u.status === "suspended").length;
  const ownerCount = adminUsers.filter((u) => u.role === "owner").length;
  const mfaCount   = adminUsers.filter((u) => u.mfa).length;

  return (
    <div>
      <PageHeader
        title="Staff & Access"
        intro="Create operator accounts and assign permissions for managing corporates, travel agents, LS Privilege members, bookings, folios and the rest of the portal."
        action={
          <div className="flex items-center gap-2">
            <GhostBtn onClick={() => setImpersonateOpen(true)}>
              <UserCheck size={13} /> Login as user
            </GhostBtn>
            <PrimaryBtn onClick={() => setCreating(true)}>
              <UserPlus size={13} /> Invite staff
            </PrimaryBtn>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Total staff"   value={total}      hint={`${active} active · ${suspended} suspended`} />
        <Stat label="With MFA"      value={`${mfaCount} / ${total}`} hint="Two-factor enabled" color={mfaCount === total ? p.success : p.warn} />
        <Stat label="Owners"        value={ownerCount} hint="Unrestricted accounts" color={ownerCount > 1 ? p.warn : p.textPrimary} />
        <Stat label="Roles in use"  value={new Set(adminUsers.map((u) => u.role)).size} hint={`of ${ADMIN_ROLES.length} preset roles`} />
      </div>

      {/* Filter row */}
      <Card className="mb-6">
        <div className="flex items-stretch gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <span className="flex items-center px-3" style={{ color: p.textMuted }}><Search size={14} /></span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, ID…"
                className="flex-1 outline-none"
                style={{
                  backgroundColor: "transparent", color: p.textPrimary,
                  padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
                  border: "none", minWidth: 0,
                }}
              />
            </div>
          </div>
          <div style={{ minWidth: 200 }}>
            <SelectField
              value={filterRole}
              onChange={setFilterRole}
              options={[{ value: "all", label: "All roles" }, ...ADMIN_ROLES.map((r) => ({ value: r.id, label: r.name }))]}
            />
          </div>
          <div style={{ minWidth: 180 }}>
            <SelectField
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "all",       label: "All statuses" },
                { value: "active",    label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "invited",   label: "Invited" },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Roles legend */}
      <Card title={`Role presets · ${ADMIN_ROLES.length}`} className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {ADMIN_ROLES.map((role) => {
            const count = adminUsers.filter((u) => u.role === role.id).length;
            return (
              <div key={role.id}
                className="p-3"
                style={{
                  backgroundColor: `${role.color}0F`,
                  border: `1px solid ${role.color}40`,
                  borderInlineStart: `3px solid ${role.color}`,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div style={{ color: role.color, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    {role.name}
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif" }}>
                    {count} {count === 1 ? "user" : "users"}
                  </div>
                </div>
                <div style={{ color: p.textSecondary, fontSize: "0.78rem", lineHeight: 1.45 }}>
                  {role.description}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 6 }}>
                  {role.permissions.length === PERMISSIONS.length ? "All permissions" : `${role.permissions.length} permissions`}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Staff table */}
      <Card title={`Staff · ${filtered.length} of ${total}`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Role</Th>
              <Th>Access</Th>
              <Th>Status</Th>
              <Th>MFA</Th>
              <Th>Last login</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><Td className="px-3 py-6" align="center" muted>No staff match the current filters.</Td></tr>
            )}
            {filtered.map((u) => {
              const role = ADMIN_ROLES.find((r) => r.id === u.role);
              const status = STATUS_BASE[u.status] || STATUS_BASE.active;
              return (
                <tr key={u.id} style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Td>
                    <button
                      className="flex items-center gap-3 text-start"
                      onClick={() => setEditing(u)}
                      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
                    >
                      <UserAvatar user={u} size={36} />
                      <div className="min-w-0">
                        <div className="hover:underline" style={{ color: p.textPrimary, fontWeight: 600, fontSize: "0.86rem" }}>
                          {u.name}
                        </div>
                        <div style={{ color: p.textMuted, fontSize: "0.72rem" }}>
                          {u.title || "—"} · {u.id}
                        </div>
                      </div>
                    </button>
                  </Td>
                  <Td>
                    {role ? (
                      <span style={{
                        color: role.color,
                        backgroundColor: `${role.color}1F`,
                        border: `1px solid ${role.color}`,
                        padding: "3px 9px",
                        fontSize: "0.6rem", fontWeight: 700,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: role.color }} />
                        {role.name}
                      </span>
                    ) : "—"}
                  </Td>
                  <Td muted>{permsSummary(u.permissions)}</Td>
                  <Td>
                    <span style={{
                      color: status.color,
                      backgroundColor: `${status.color}1F`,
                      border: `1px solid ${status.color}`,
                      padding: "3px 9px",
                      fontSize: "0.6rem", fontWeight: 700,
                      letterSpacing: "0.18em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: status.color }} />
                      {status.label}
                    </span>
                  </Td>
                  <Td>
                    {u.mfa ? (
                      <span className="flex items-center gap-1" style={{ color: p.success, fontSize: "0.78rem", fontWeight: 600 }}>
                        <ShieldCheck size={13} /> On
                      </span>
                    ) : (
                      <span className="flex items-center gap-1" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
                        <ShieldOff size={13} /> Off
                      </span>
                    )}
                  </Td>
                  <Td muted>{fmtDateTime(u.lastLogin)}</Td>
                  <Td align="end">
                    <div className="flex items-center justify-end gap-1">
                      {/* Owner-only "Login as" — only renders for the active
                          Owner against teammates. Suspended accounts and the
                          actor's own row are filtered out. */}
                      {actorIsOwner && u.id !== staffSession?.id && u.status === "active" && (
                        <IconButton
                          title={`Log in as ${u.name}`}
                          onClick={(e) => { e.stopPropagation(); goImpersonateStaff(u); }}
                        ><UserCheck size={13} /></IconButton>
                      )}
                      <IconButton title="Open profile" onClick={() => setEditing(u)}><Edit2 size={13} /></IconButton>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      {creating && <StaffEditorDrawer onClose={() => setCreating(false)} />}
      {editing  && <StaffEditorDrawer user={editing} onClose={() => setEditing(null)} />}
      {impersonateOpen && (
        <ImpersonateDrawer
          owner={owner}
          onClose={() => setImpersonateOpen(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ImpersonateDrawer — Owner-level "log in as user". Picks a target from
// the corporate users / agency users / LS Privilege members lists, then
// calls `startImpersonation` which writes an audit log entry and sets
// the impersonation session that App.jsx watches to auto-open the Guest
// Portal pre-authenticated as the chosen user.
// ---------------------------------------------------------------------------
function ImpersonateDrawer({ owner, onClose }) {
  const p = usePalette();
  const {
    agreements, agencies, members, adminUsers, staffSession, staffImpersonation,
    startImpersonation, startStaffImpersonation,
  } = useData();
  const [tab, setTab]   = useState("staff");
  const [search, setSearch] = useState("");
  // The actor must be an Owner, AND must be running their own session (not
  // already inside an impersonation) — otherwise nesting impersonations would
  // make the audit trail meaningless.
  const isOwner = (staffSession?.role || owner?.role) === "owner" && !staffImpersonation;

  // Build candidate lists per kind. Each candidate carries enough metadata
  // to construct a valid Guest Portal / staff session.
  const candidates = useMemo(() => {
    const corporate = [];
    agreements.forEach((a) => {
      (a.users || []).forEach((u) => {
        corporate.push({
          kind: "corporate", accountId: a.id, userId: u.id,
          displayName: u.name, email: u.email,
          subtitle: `${a.account} · ${u.role || u.title || "user"}`,
          accent: "#D97706",
        });
      });
      // POC fallback when no users array
      if ((a.users || []).length === 0 && a.pocEmail) {
        corporate.push({
          kind: "corporate", accountId: a.id, userId: null,
          displayName: a.pocName || "Primary contact", email: a.pocEmail,
          subtitle: `${a.account} · point of contact`,
          accent: "#D97706",
        });
      }
    });
    const agent = [];
    agencies.forEach((a) => {
      (a.users || []).forEach((u) => {
        agent.push({
          kind: "agent", accountId: a.id, userId: u.id,
          displayName: u.name, email: u.email,
          subtitle: `${a.name} · ${u.role || u.title || "user"}`,
          accent: "#7C3AED",
        });
      });
      if ((a.users || []).length === 0 && a.pocEmail) {
        agent.push({
          kind: "agent", accountId: a.id, userId: null,
          displayName: a.pocName || "Primary contact", email: a.pocEmail,
          subtitle: `${a.name} · point of contact`,
          accent: "#7C3AED",
        });
      }
    });
    const member = members.map((m) => ({
      kind: "member", accountId: m.id, userId: m.id,
      displayName: m.name, email: m.email,
      subtitle: `${m.id} · ${m.tier || "member"}`,
      accent: "#C9A961",
    }));
    // Staff candidates — exclude the active operator from the list so they
    // can't pick themselves. Carry the full record so we can pass it to
    // `startStaffImpersonation` directly.
    const staff = adminUsers
      .filter((u) => u.id !== staffSession?.id)
      .map((u) => ({
        kind: "staff", accountId: u.id, userId: u.id,
        displayName: u.name, email: u.email,
        subtitle: `${u.title || u.role} · ${u.id}${u.status !== "active" ? ` · ${u.status}` : ""}`,
        accent: "#16A34A",
        // raw record kept so the start action gets the full user object
        _record: u,
        _disabled: u.status !== "active",
      }));
    return { staff, corporate, agent, member };
  }, [agreements, agencies, members, adminUsers, staffSession]);

  const list = candidates[tab] || [];
  const q = search.trim().toLowerCase();
  const filtered = list.filter((c) => {
    if (!q) return true;
    return [c.displayName, c.email, c.subtitle, c.accountId].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const goImpersonate = (target) => {
    if (!isOwner) {
      pushToast({ message: "Only the Owner can impersonate other users.", kind: "warn" });
      return;
    }
    // Staff branch — call the staff-specific action that swaps `staffSession`
    // and surfaces the Partner Portal banner.
    if (target.kind === "staff") {
      if (target._disabled) {
        pushToast({ message: "Suspended accounts can't be impersonated. Reactivate first.", kind: "warn" });
        return;
      }
      if (!confirm(`Log in as ${target.displayName} (${target.subtitle})?\n\nThe portal will switch to their permissions and the action is audit-logged.`)) return;
      const res = startStaffImpersonation(target._record);
      if (res?.ok) {
        pushToast({ message: `Now signed in as ${target.displayName}` });
        onClose?.();
      } else if (res?.error) {
        pushToast({ message: res.error, kind: "warn" });
      }
      return;
    }
    // Guest branch — open the Guest Portal pre-authenticated as the target.
    if (!confirm(`Log in as ${target.displayName} (${target.email})? Every action you take will be logged to the audit trail.`)) return;
    startImpersonation(target, { id: owner.id, name: owner.name, role: owner.role });
    pushToast({ message: `Now signed in as ${target.displayName}` });
    onClose?.();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="Super-admin"
      title="Log in as another user"
      fullPage
      contentMaxWidth="max-w-4xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          <div className="flex-1" />
          <span style={{ color: p.textMuted, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
            All impersonation events are audit-logged automatically.
          </span>
        </>
      }
    >
      {/* Permission gate */}
      {!isOwner && (
        <div className="p-4 mb-5" style={{
          backgroundColor: `${p.danger}10`, border: `1px solid ${p.danger}40`,
          borderInlineStart: `3px solid ${p.danger}`,
          color: p.danger, fontSize: "0.86rem",
        }}>
          <strong>Restricted.</strong> Only an Owner can log in as another user. Ask an Owner to grant you the role first.
        </div>
      )}

      <div className="p-4 mb-5" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`, borderInlineStart: `3px solid ${p.accent}` }}>
        <div className="flex items-start gap-3">
          <Shield size={16} style={{ color: p.accent, marginTop: 2, flexShrink: 0 }} />
          <div style={{ color: p.textPrimary, fontSize: "0.86rem", lineHeight: 1.55 }}>
            Acting as <strong>{staffSession?.name || owner?.name}</strong> ({staffSession?.role || owner?.role}). Pick a target — <strong>Staff</strong> swaps the operator portal to that teammate's permissions; <strong>Corporate / Travel agent / LS Privilege</strong> opens their Guest Portal pre-authenticated. A banner stays visible during impersonation with a <strong>Stop impersonating</strong> action. Every start &amp; end event is written to the <strong>Activity Log</strong>.
          </div>
        </div>
      </div>

      {/* Kind tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <KindTab id="staff"     label={`Staff · ${candidates.staff.length}`}         icon={ShieldCheck} active={tab === "staff"} onClick={() => setTab("staff")} p={p} />
        <KindTab id="corporate" label={`Corporate · ${candidates.corporate.length}`} icon={Building2} active={tab === "corporate"} onClick={() => setTab("corporate")} p={p} />
        <KindTab id="agent"     label={`Travel agent · ${candidates.agent.length}`} icon={Briefcase} active={tab === "agent"} onClick={() => setTab("agent")} p={p} />
        <KindTab id="member"    label={`LS Privilege · ${candidates.member.length}`} icon={Sparkles} active={tab === "member"} onClick={() => setTab("member")} p={p} />
      </div>

      {/* Search */}
      <Card className="mb-4">
        <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
          <span className="flex items-center px-3" style={{ color: p.textMuted }}><Search size={14} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, account…"
            className="flex-1 outline-none"
            style={{ backgroundColor: "transparent", color: p.textPrimary, padding: "0.6rem 0.5rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", border: "none", minWidth: 0 }}
          />
        </div>
      </Card>

      {/* Candidate list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.length === 0 && (
          <div className="col-span-full p-6 text-center" style={{ border: `1px dashed ${p.border}`, color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
            No {tab} users match the search.
          </div>
        )}
        {filtered.map((c) => {
          const enabled = isOwner && !c._disabled;
          return (
            <button
              key={`${c.kind}:${c.accountId}:${c.userId || "poc"}`}
              onClick={() => goImpersonate(c)}
              disabled={!enabled}
              className="text-start p-3 transition-colors"
              style={{
                backgroundColor: p.bgPanel,
                border: `1px solid ${c.accent}40`,
                borderInlineStart: `3px solid ${c.accent}`,
                cursor: enabled ? "pointer" : "not-allowed",
                opacity: enabled ? 1 : 0.55,
              }}
              onMouseEnter={(e) => { if (enabled) e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { if (enabled) e.currentTarget.style.backgroundColor = p.bgPanel; }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.92rem" }}>
                  {c.displayName}
                </div>
                <span style={{
                  color: c.accent, backgroundColor: `${c.accent}1F`, border: `1px solid ${c.accent}`,
                  padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}>{c.kind}</span>
              </div>
              <div style={{ color: p.textMuted, fontSize: "0.78rem" }}>{c.email}</div>
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{c.subtitle}</div>
              <div className="mt-3 inline-flex items-center gap-1.5" style={{
                color: c._disabled ? p.danger : c.accent,
                fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              }}>
                {c._disabled
                  ? <><ShieldOff size={11} /> Suspended · cannot impersonate</>
                  : <><UserCheck size={11} /> Log in as user →</>}
              </div>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}

function KindTab({ id, label, icon: Icon, active, onClick, p }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.5rem 0.95rem",
        backgroundColor: active ? p.accent : "transparent",
        color: active ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
        border: `1px solid ${active ? p.accent : p.border}`,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// IconButton — small admin-row action button.
// ---------------------------------------------------------------------------
function IconButton({ children, onClick, title, danger = false }) {
  const p = usePalette();
  const c = danger ? p.danger : p.textMuted;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        backgroundColor: "transparent",
        border: `1px solid ${p.border}`,
        color: c,
        padding: "5px 7px",
        cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = danger ? p.danger : p.accent; e.currentTarget.style.borderColor = danger ? p.danger : p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = c; e.currentTarget.style.borderColor = p.border; }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// UserAvatar — initials inside a colored circle, matching member-avatar shape.
// ---------------------------------------------------------------------------
function UserAvatar({ user, size = 44 }) {
  const p = usePalette();
  const initials = (user.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const fontSize = Math.max(13, Math.round(size * 0.4));
  const color = user.avatarColor || p.accent;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      backgroundColor: `${color}1F`, border: `2px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      color, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize,
    }}>{initials}</div>
  );
}

// ---------------------------------------------------------------------------
// StaffEditorDrawer — full-page editor for create/edit. Cards: identity,
// role + permissions matrix, security (MFA + password actions), status.
// ---------------------------------------------------------------------------
function StaffEditorDrawer({ user, onClose }) {
  const p = usePalette();
  const { adminUsers, addAdminUser, updateAdminUser, removeAdminUser, toggleAdminUserStatus, setAdminUserPassword } = useData();
  const isNew = !user;

  // The edit drawer always reads the "live" user from the store so password /
  // permission changes elsewhere flow back into the form on next render.
  const live = isNew ? null : (adminUsers.find((x) => x.id === user.id) || user);

  const [draft, setDraft] = useState(() => isNew ? {
    name: "", email: "", phone: "", title: "",
    role: "reservations",
    permissions: ADMIN_ROLES.find((r) => r.id === "reservations").permissions,
    status: "active", mfa: false,
    avatarColor: ADMIN_ROLES.find((r) => r.id === "reservations").color,
    notes: "",
  } : { ...live });

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Switching role auto-applies that role's permission set unless the user has
  // already customised it (we still confirm to keep the change explicit).
  const switchRole = (roleId) => {
    const role = ADMIN_ROLES.find((r) => r.id === roleId);
    if (!role) return;
    const samePerms = JSON.stringify([...(draft.permissions || [])].sort()) === JSON.stringify([...role.permissions].sort());
    if (!samePerms && draft.role !== roleId) {
      const ok = confirm(`Switch role to ${role.name} and apply its preset permissions? Custom toggles you've made will be replaced.`);
      if (!ok) { set({ role: roleId }); return; }
    }
    set({ role: roleId, permissions: [...role.permissions], avatarColor: role.color });
  };

  const togglePerm = (permId) => {
    const has = draft.permissions.includes(permId);
    set({ permissions: has ? draft.permissions.filter((x) => x !== permId) : [...draft.permissions, permId] });
  };

  const role = ADMIN_ROLES.find((r) => r.id === draft.role);

  // Save -----------------------------------------------------------------
  const save = () => {
    if (!draft.name.trim()) { pushToast({ message: "Name is required", kind: "warn" }); return; }
    if (!draft.email.trim() || !/.+@.+\..+/.test(draft.email)) { pushToast({ message: "A valid email is required", kind: "warn" }); return; }
    if (!draft.role) { pushToast({ message: "Pick a role", kind: "warn" }); return; }
    if (isNew) {
      addAdminUser({ ...draft, password: draft.password || autoTempPassword() });
      pushToast({ message: `Staff invited · ${draft.name} · ${role?.name || "role"} access` });
    } else {
      updateAdminUser(user.id, draft);
      pushToast({ message: `Staff updated · ${draft.name}` });
    }
    onClose();
  };

  const remove = () => {
    if (!live) return;
    if (live.role === "owner" && adminUsers.filter((u) => u.role === "owner").length === 1) {
      pushToast({ message: "Can't remove the only owner — promote another user first.", kind: "warn" });
      return;
    }
    if (!confirm(`Remove ${live.name}? They lose access immediately. This can't be undone.`)) return;
    removeAdminUser(live.id);
    pushToast({ message: `Removed · ${live.name}` });
    onClose();
  };

  const toggleStatus = () => {
    if (!live) return;
    toggleAdminUserStatus(live.id);
    pushToast({ message: live.status === "active" ? `Suspended · ${live.name}` : `Reactivated · ${live.name}` });
  };

  // Password actions ------------------------------------------------------
  const [pwMode, setPwMode] = useState(null);   // null | "set" | "link"
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [tempPw, setTempPw] = useState(null);

  const sendResetLink = () => {
    if (!live?.email) { pushToast({ message: "No email on file", kind: "warn" }); return; }
    pushToast({ message: `Password reset link emailed to ${live.email}` });
    setPwMode(null);
  };

  const setNewPassword = () => {
    if (!newPw || newPw.length < 6) { pushToast({ message: "Password must be at least 6 characters", kind: "warn" }); return; }
    if (newPw !== confirmPw) { pushToast({ message: "Passwords don't match", kind: "warn" }); return; }
    setAdminUserPassword(live.id, newPw);
    pushToast({ message: `Password updated for ${live.name}` });
    setPwMode(null); setNewPw(""); setConfirmPw(""); setShowPw(false);
  };

  const generateTempPassword = () => {
    const pw = autoTempPassword();
    setTempPw(pw);
    if (live) setAdminUserPassword(live.id, pw);
  };

  const copyTempPassword = async () => {
    if (!tempPw) return;
    try { await navigator.clipboard.writeText(tempPw); pushToast({ message: "Temporary password copied" }); }
    catch { pushToast({ message: "Clipboard not available", kind: "warn" }); }
  };

  const accentColor = role?.color || p.accent;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={isNew ? "Invite staff" : "Staff member"}
      title={isNew ? "New operator account" : (draft.name || live?.name || "—")}
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          {!isNew && (
            <GhostBtn onClick={remove} small danger><Trash2 size={11} /> Remove</GhostBtn>
          )}
          <div className="flex-1" />
          {!isNew && (
            <GhostBtn onClick={toggleStatus} small>
              {live?.status === "active" ? <><ShieldOff size={11} /> Suspend</> : <><ShieldCheck size={11} /> Reactivate</>}
            </GhostBtn>
          )}
          <PrimaryBtn onClick={save} small><Save size={12} /> {isNew ? "Send invite" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      {/* Header banner */}
      <div className="p-6 mb-6 flex items-start gap-5 flex-wrap" style={{
        backgroundColor: `${accentColor}10`,
        border: `1px solid ${accentColor}40`,
        borderInlineStart: `4px solid ${accentColor}`,
      }}>
        <UserAvatar user={{ ...draft, avatarColor: accentColor }} size={88} />
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", color: accentColor, fontWeight: 700 }}>
            {role?.name || "Role"} · {permsSummary(draft.permissions)}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.95rem", color: p.textPrimary, lineHeight: 1.05, fontWeight: 500, marginTop: 2 }}>
            {draft.name || "Untitled operator"}
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.82rem", marginTop: 4 }}>
            {draft.email || "—"} {draft.phone ? `· ${draft.phone}` : ""}
          </div>
          {!isNew && (
            <div className="flex flex-wrap gap-3 mt-3" style={{ fontSize: "0.72rem", color: p.textMuted }}>
              <span>ID · <span style={{ color: p.textSecondary, fontWeight: 600 }}>{live.id}</span></span>
              <span>Created · {fmtDate(live.createdAt)}</span>
              <span>Last login · {fmtDateTime(live.lastLogin)}</span>
              <span>MFA · {live.mfa ? "Enabled" : "Disabled"}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identity ----------------------------------------------------- */}
        <Card title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Full name *">
              <TextField value={draft.name}  onChange={(v) => set({ name: v })}  placeholder="e.g. Aparajeet Mathad" />
            </FormGroup>
            <FormGroup label="Job title">
              <TextField value={draft.title} onChange={(v) => set({ title: v })} placeholder="Front Office Manager" />
            </FormGroup>
            <FormGroup label="Work email *">
              <TextField value={draft.email} onChange={(v) => set({ email: v })} placeholder="name@thelodgesuites.com" />
            </FormGroup>
            <FormGroup label="Phone">
              <TextField value={draft.phone} onChange={(v) => set({ phone: v })} placeholder="+973 …" />
            </FormGroup>
            <FormGroup label="Status" className="sm:col-span-2">
              <SelectField
                value={draft.status}
                onChange={(v) => set({ status: v })}
                options={[
                  { value: "active",    label: "Active — can sign in" },
                  { value: "suspended", label: "Suspended — locked out" },
                  { value: "invited",   label: "Invited — awaiting first sign-in" },
                ]}
              />
            </FormGroup>
            <FormGroup label="Internal notes" className="sm:col-span-2">
              <textarea
                value={draft.notes || ""}
                onChange={(e) => set({ notes: e.target.value })}
                rows={3}
                placeholder="Shift, ownership, escalation path…"
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical",
                }}
              />
            </FormGroup>
          </div>
        </Card>

        {/* Role + MFA --------------------------------------------------- */}
        <Card title="Role & sign-in">
          <FormGroup label="Role *">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ADMIN_ROLES.map((r) => {
                const sel = draft.role === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => switchRole(r.id)}
                    className="text-start p-3 transition-colors"
                    style={{
                      backgroundColor: sel ? `${r.color}14` : "transparent",
                      border: `1px solid ${sel ? r.color : p.border}`,
                      borderInlineStart: `3px solid ${sel ? r.color : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: r.color }} />
                      <span style={{
                        color: sel ? r.color : p.textPrimary,
                        fontFamily: "'Manrope', sans-serif", fontWeight: 700,
                        fontSize: "0.74rem", letterSpacing: "0.18em", textTransform: "uppercase",
                      }}>{r.name}</span>
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.4 }}>
                      {r.description}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>
                      {r.permissions.length === PERMISSIONS.length ? "All permissions" : `${r.permissions.length} of ${PERMISSIONS.length} permissions`}
                    </div>
                  </button>
                );
              })}
            </div>
          </FormGroup>

          <div className="mt-5 p-4" style={{
            backgroundColor: draft.mfa ? `${p.success}10` : p.bgPanelAlt,
            border: `1px solid ${draft.mfa ? p.success : p.border}`,
            borderInlineStart: `3px solid ${draft.mfa ? p.success : p.border}`,
          }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <Shield size={16} style={{ color: draft.mfa ? p.success : p.textMuted, marginTop: 2 }} />
                <div>
                  <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.86rem" }}>
                    Two-factor authentication
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 2, maxWidth: 420 }}>
                    Required for owners and finance roles. The portal will challenge for a TOTP code on every new device.
                  </div>
                </div>
              </div>
              <button
                onClick={() => set({ mfa: !draft.mfa })}
                style={{
                  width: 44, height: 24, borderRadius: 999,
                  backgroundColor: draft.mfa ? p.success : p.border,
                  position: "relative", border: "none", cursor: "pointer", flexShrink: 0,
                }}
                aria-pressed={draft.mfa}
                aria-label="Toggle MFA"
              >
                <span style={{
                  position: "absolute", top: 2, left: draft.mfa ? 22 : 2,
                  width: 20, height: 20, borderRadius: "50%",
                  backgroundColor: "#fff", transition: "left 120ms",
                }} />
              </button>
            </div>
          </div>
        </Card>

        {/* Permissions matrix ------------------------------------------- */}
        <Card title={`Permissions · ${permsSummary(draft.permissions)}`} className="lg:col-span-2">
          <div style={{ color: p.textMuted, fontSize: "0.78rem", marginBottom: 12 }}>
            Each scope corresponds to a portal section. Owners and General Managers should have everything; Sales / Accounts only need their lanes. Toggle individual scopes to override the role preset.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {groupedPerms().map(([category, perms]) => {
              const allOn = perms.every((perm) => draft.permissions.includes(perm.id));
              const someOn = perms.some((perm) => draft.permissions.includes(perm.id));
              const setAll = (on) => {
                const ids = perms.map((perm) => perm.id);
                set({
                  permissions: on
                    ? Array.from(new Set([...draft.permissions, ...ids]))
                    : draft.permissions.filter((x) => !ids.includes(x)),
                });
              };
              return (
                <div key={category} className="p-4" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 700 }}>
                      {category} · {perms.filter((perm) => draft.permissions.includes(perm.id)).length} / {perms.length}
                    </div>
                    <button
                      onClick={() => setAll(!allOn)}
                      style={{
                        color: allOn ? p.danger : p.success,
                        background: "transparent", border: "none", cursor: "pointer",
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      }}
                    >
                      {allOn ? "Disable all" : someOn ? "Enable rest" : "Enable all"}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {perms.map((perm) => {
                      const on = draft.permissions.includes(perm.id);
                      return (
                        <button
                          key={perm.id}
                          onClick={() => togglePerm(perm.id)}
                          className="w-full text-start flex items-start gap-3 p-2 transition-colors"
                          style={{
                            backgroundColor: on ? `${p.success}0F` : "transparent",
                            border: `1px solid ${on ? p.success : p.border}`,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{
                            width: 18, height: 18, flexShrink: 0,
                            border: `1.5px solid ${on ? p.success : p.border}`,
                            backgroundColor: on ? p.success : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            marginTop: 1,
                          }}>
                            {on && <Check size={12} color="#fff" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div style={{ color: p.textPrimary, fontWeight: 600, fontSize: "0.82rem" }}>
                              {perm.label}
                            </div>
                            <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 1 }}>
                              {perm.hint}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Security ---------------------------------------------------- */}
        {!isNew && (
          <Card title="Password & security" className="lg:col-span-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <button
                onClick={() => { setPwMode("set"); setTempPw(null); }}
                className="text-start p-4 transition-colors"
                style={{
                  border: `1px solid ${pwMode === "set" ? p.accent : p.border}`,
                  backgroundColor: pwMode === "set" ? p.bgHover : "transparent",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Lock size={14} style={{ color: p.accent }} />
                  <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.84rem" }}>Set new password</div>
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.76rem" }}>
                  Choose a password yourself. The operator will be asked to change it on next sign-in.
                </div>
              </button>
              <button
                onClick={generateTempPassword}
                className="text-start p-4 transition-colors"
                style={{
                  border: `1px solid ${tempPw ? p.accent : p.border}`,
                  backgroundColor: tempPw ? p.bgHover : "transparent",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound size={14} style={{ color: p.accent }} />
                  <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.84rem" }}>Generate temporary password</div>
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.76rem" }}>
                  Auto-generate a 10-character password and copy it to share with the operator.
                </div>
              </button>
              <button
                onClick={() => { setPwMode("link"); setTempPw(null); }}
                className="text-start p-4 transition-colors"
                style={{
                  border: `1px solid ${pwMode === "link" ? p.accent : p.border}`,
                  backgroundColor: pwMode === "link" ? p.bgHover : "transparent",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Mail size={14} style={{ color: p.accent }} />
                  <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.84rem" }}>Email reset link</div>
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.76rem" }}>
                  Send a one-time password reset link to <span style={{ color: p.textSecondary }}>{live?.email || "—"}</span>.
                </div>
              </button>
            </div>

            {/* Set new password form */}
            {pwMode === "set" && (
              <div className="mt-4 p-4" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormGroup label="New password">
                    <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
                      <input
                        type={showPw ? "text" : "password"}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="Min 6 characters"
                        className="flex-1 outline-none"
                        style={{
                          backgroundColor: "transparent", color: p.textPrimary,
                          padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
                          border: "none", minWidth: 0,
                        }}
                      />
                      <button onClick={() => setShowPw((s) => !s)} className="flex items-center px-3" style={{ color: p.textMuted, borderInlineStart: `1px solid ${p.border}` }}>
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </FormGroup>
                  <FormGroup label="Confirm password">
                    <TextField type={showPw ? "text" : "password"} value={confirmPw} onChange={setConfirmPw} placeholder="Repeat" />
                  </FormGroup>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <GhostBtn small onClick={() => { setPwMode(null); setNewPw(""); setConfirmPw(""); }}>Cancel</GhostBtn>
                  <PrimaryBtn small onClick={setNewPassword}><Save size={11} /> Save password</PrimaryBtn>
                </div>
              </div>
            )}

            {/* Reset link form */}
            {pwMode === "link" && (
              <div className="mt-4 p-4 flex items-center justify-between gap-3 flex-wrap" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                <div style={{ color: p.textSecondary, fontSize: "0.86rem" }}>
                  Send a one-time reset link to <span style={{ color: p.textPrimary, fontWeight: 600 }}>{live?.email || "—"}</span>. The link expires after 24 hours.
                </div>
                <div className="flex gap-2">
                  <GhostBtn small onClick={() => setPwMode(null)}>Cancel</GhostBtn>
                  <PrimaryBtn small onClick={sendResetLink}><Mail size={11} /> Send link</PrimaryBtn>
                </div>
              </div>
            )}

            {/* Temporary password preview */}
            {tempPw && (
              <div className="mt-4 p-4" style={{ border: `1px solid ${p.success}`, backgroundColor: `${p.success}0F` }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <KeyRound size={16} style={{ color: p.success }} />
                    <div>
                      <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.84rem" }}>Temporary password generated</div>
                      <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>Share securely with the operator. They will be asked to change it on next sign-in.</div>
                    </div>
                  </div>
                  <code style={{
                    color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "1.05rem",
                    fontWeight: 600, padding: "6px 14px", backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, letterSpacing: "0.12em",
                  }}>{tempPw}</code>
                  <GhostBtn small onClick={copyTempPassword}><Copy size={11} /> Copy</GhostBtn>
                </div>
              </div>
            )}

            <div className="mt-4" style={{ color: p.textMuted, fontSize: "0.74rem" }}>
              Last password update · {live?.passwordUpdatedAt ? fmtDateTime(live.passwordUpdatedAt) : (live?.passwordSetAt ? fmtDateTime(live.passwordSetAt) : "Never rotated")}
            </div>
          </Card>
        )}

        {/* Activity ---------------------------------------------------- */}
        {!isNew && (
          <Card title="Activity" className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ActivityRow label="Last login"     value={fmtDateTime(live.lastLogin)} hint="From the audit trail." />
              <ActivityRow label="Account created" value={fmtDate(live.createdAt)}     hint="When the operator was first invited." />
              <ActivityRow label="Status"          value={STATUS_BASE[live.status]?.label || "—"} hint="Suspend to revoke access without deleting." color={STATUS_BASE[live.status]?.color} />
            </div>
            <div className="mt-4 p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, color: p.textMuted, fontSize: "0.74rem" }}>
              When the portal is wired to a real backend, this card will list the last 50 sign-ins, IP addresses, and any sensitive actions (rate changes, refunds, contract edits) attributed to this user.
            </div>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// ActivityRow — small metric tile inside the Activity card.
// ---------------------------------------------------------------------------
function ActivityRow({ label, value, hint, color }) {
  const p = usePalette();
  return (
    <div className="p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.24em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: color || p.textPrimary, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// autoTempPassword — generates a random 10-char password using a charset
// excluding ambiguous glyphs (0/O, 1/l/I).
// ---------------------------------------------------------------------------
function autoTempPassword() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += charset[Math.floor(Math.random() * charset.length)];
  return pw;
}
