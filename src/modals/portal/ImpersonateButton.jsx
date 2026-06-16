import React from "react";
import { UserCheck } from "lucide-react";
import { usePalette } from "./theme.jsx";
import { useData } from "../../data/store.jsx";
import { pushToast } from "./admin/ui.jsx";

// ---------------------------------------------------------------------------
// ImpersonateButton — contextual "Log in as" for a single account. Dropped
// into the Corporate / Agency workspace headers and the member profile so an
// operator can jump straight into that exact account's Guest Portal without
// hunting through the global picker.
//
// Reuses the audited `startImpersonation` action: the App watches the
// resulting `impersonation` state and auto-opens the pre-authenticated Guest
// Portal, which carries an "Exit impersonation" banner. Every start/end is
// written to the Activity Log. Available to any signed-in operator; disabled
// while an impersonation is already active (the store forbids nesting) or when
// the account has no portal login to assume.
// ---------------------------------------------------------------------------

// Resolve the primary portal-login user for an account.
function resolveTarget(kind, account) {
  if (!account) return null;
  if (kind === "member") {
    if (!account.email) return null;
    return { kind: "member", accountId: account.id, userId: account.id, displayName: account.name, email: account.email };
  }
  // corporate | agent — prefer the flagged primary user, else first user, else POC.
  const users = Array.isArray(account.users) ? account.users : [];
  const primary = users.find((u) => u.primary) || users.find((u) => (u.role || "") === "primary") || users[0];
  if (primary && primary.email) {
    return { kind, accountId: account.id, userId: primary.id, displayName: primary.name, email: primary.email };
  }
  if (account.pocEmail) {
    return { kind, accountId: account.id, userId: null, displayName: account.pocName || "Primary contact", email: account.pocEmail };
  }
  return null;
}

export function ImpersonateButton({ kind, account, label, small = true }) {
  const p = usePalette();
  const { staffSession, staffImpersonation, impersonation, startImpersonation } = useData();
  if (!staffSession) return null; // operator chrome only

  const target = resolveTarget(kind, account);
  const busy = !!(staffImpersonation || impersonation);
  const disabled = !target || busy;
  const reason = !target
    ? "No portal login on this account yet"
    : busy
      ? "End the current impersonation first"
      : `Log in as ${target.displayName}`;
  const name = target?.displayName || "this account";

  const go = () => {
    if (disabled) { if (!target || busy) pushToast({ message: reason, kind: "warn" }); return; }
    if (!window.confirm(`Log in as ${name} (${target.email})?\n\nYou'll see their portal exactly as they do. Every action is logged, and you can return any time via "Exit impersonation".`)) return;
    startImpersonation(target, { id: staffSession.id, name: staffSession.name, role: staffSession.role });
    pushToast({ message: `Now signed in as ${name}` });
  };

  return (
    <button
      onClick={go}
      disabled={disabled}
      title={reason}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: small ? "0.45rem 0.85rem" : "0.55rem 1.1rem",
        border: `1px solid ${p.accent}`, color: p.accent, backgroundColor: "transparent",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em",
        textTransform: "uppercase", fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = p.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <UserCheck size={11} /> {label || "Log in as"}
    </button>
  );
}
