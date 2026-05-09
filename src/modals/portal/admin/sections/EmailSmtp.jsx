import React, { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Eye, EyeOff, Lock, Mail, RotateCcw, Save,
  Send, Server, ShieldCheck, Wifi, Zap,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData, SMTP_PROVIDER_PRESETS } from "../../../../data/store.jsx";
import { Card, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, TextField } from "../ui.jsx";

// ---------------------------------------------------------------------------
// EmailSmtp — Settings → Email SMTP. Single source of truth for the
// outbound mail server used by every transactional email (booking
// confirmations, invoices, receipts, reminders, partner notices). The
// form mirrors the standard SMTP fields plus a quick-setup row for the
// most common providers and a "Test SMTP Connection" button that fakes
// a connection probe on the mock store.
// ---------------------------------------------------------------------------
const ENCRYPTION_OPTIONS = [
  { value: "none", label: "None (plaintext · port 25)" },
  { value: "tls",  label: "STARTTLS (port 587)" },
  { value: "ssl",  label: "SSL/TLS (port 465)" },
];

export const EmailSmtp = () => {
  const p = usePalette();
  const { smtpConfig, updateSmtpConfig, resetSmtpConfig } = useData();
  const [draft, setDraft] = useState(smtpConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(smtpConfig);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // ── Configuration save / reset ────────────────────────────────────
  const save = () => {
    updateSmtpConfig(draft);
    pushToast({ message: "SMTP configuration saved" });
  };
  const discard = () => setDraft(smtpConfig);
  const resetToDefault = () => {
    if (!confirm("Reset SMTP configuration to defaults? Credentials will be wiped.")) return;
    resetSmtpConfig();
    setDraft({ ...smtpConfig });
    pushToast({ message: "SMTP configuration reset" });
  };

  // ── Provider quick-setup ──────────────────────────────────────────
  const applyPreset = (preset) => {
    set({
      host: preset.host,
      port: preset.port,
      encryption: preset.encryption,
    });
    pushToast({ message: `${preset.label} preset applied — enter credentials to finish` });
  };

  // ── Connection test (mocked) ──────────────────────────────────────
  // Real integrations would hit a backend `/smtp/test` endpoint. The
  // mock surfaces the same UX (loading state, success/failure feedback,
  // last-tested timestamp) so the visual works against a real backend
  // when one's wired in.
  const testConnection = () => {
    if (testing) return;
    if (!draft.host || !draft.port) {
      pushToast({ message: "Enter host and port before testing", kind: "warn" });
      return;
    }
    setTesting(true);
    setTimeout(() => {
      const ok = Boolean(draft.username && draft.password && draft.fromEmail);
      const ts = new Date().toISOString();
      const next = {
        ...draft,
        lastTestedAt: ts,
        lastTestStatus: ok ? "success" : "failed",
        lastTestMessage: ok
          ? `Connected to ${draft.host}:${draft.port} as ${draft.username}`
          : "Missing credentials or sender — fill in username, password and From email.",
      };
      setDraft(next);
      updateSmtpConfig(next);
      setTesting(false);
      pushToast({
        message: ok ? "SMTP test passed" : "SMTP test failed — check credentials",
        kind: ok ? undefined : "warn",
      });
    }, 1100);
  };

  // ── Test email send (mocked) ──────────────────────────────────────
  const sendTestEmail = () => {
    const to = (draft.testEmailRecipient || "").trim();
    if (!/.+@.+\..+/.test(to)) {
      pushToast({ message: "Enter a valid recipient email", kind: "warn" });
      return;
    }
    if (draft.lastTestStatus !== "success") {
      pushToast({ message: "Test the SMTP connection first", kind: "warn" });
      return;
    }
    pushToast({ message: `Test email queued to ${to}` });
  };

  const banner = bannerState(draft);

  return (
    <div>
      <PageHeader
        title="Email SMTP"
        intro="Configure the outbound mail server used by every transactional email — booking confirmations, invoices, receipts, partner notices and scheduled reports."
        action={
          <GhostBtn onClick={resetToDefault} small>
            <RotateCcw size={11} /> Reset defaults
          </GhostBtn>
        }
      />

      {/* Status banner — connection state + global enable toggle */}
      <div className="p-4 mb-6 flex items-center justify-between gap-3 flex-wrap"
        style={{
          backgroundColor: banner.bg,
          border: `1px solid ${banner.border}`,
          borderInlineStart: `4px solid ${banner.color}`,
        }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <banner.icon size={20} style={{ color: banner.color, marginTop: 2, flexShrink: 0 }} />
          <div className="min-w-0">
            <div style={{
              color: banner.color, fontFamily: "'Manrope', sans-serif",
              fontSize: "0.78rem", letterSpacing: "0.04em", fontWeight: 700,
            }}>
              {banner.title}
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 2, lineHeight: 1.5 }}>
              {banner.body}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 flex-shrink-0" style={{ fontFamily: "'Manrope', sans-serif" }}>
          <span style={{
            color: draft.enabled ? p.success : p.textMuted,
            fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}>
            {draft.enabled ? "Enabled" : "Disabled"}
          </span>
          <ToggleSwitch
            checked={!!draft.enabled}
            onChange={(v) => set({ enabled: v })}
            color={p.success}
            track={p.border}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Server configuration */}
        <Card title={<><Server size={12} className="inline mr-1.5" /> Server configuration</>}>
          <FormGroup label="SMTP Host">
            <TextField
              value={draft.host}
              onChange={(v) => set({ host: v })}
              placeholder="smtp.gmail.com"
            />
          </FormGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FormGroup label="Port">
              <TextField
                type="number"
                value={draft.port}
                onChange={(v) => set({ port: Number(v) || 0 })}
                placeholder="587"
              />
            </FormGroup>
            <FormGroup label="Encryption">
              <SelectField
                value={draft.encryption}
                onChange={(v) => set({ encryption: v })}
                options={ENCRYPTION_OPTIONS}
              />
            </FormGroup>
          </div>
        </Card>

        {/* Authentication */}
        <Card title={<><Lock size={12} className="inline mr-1.5" /> Authentication</>}>
          <FormGroup label="Username">
            <TextField
              value={draft.username}
              onChange={(v) => set({ username: v })}
              placeholder="reservations@thelodgesuites.com"
            />
          </FormGroup>
          <FormGroup label="Password / App Password" className="mt-4">
            <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <input
                type={showPassword ? "text" : "password"}
                value={draft.password}
                onChange={(e) => set({ password: e.target.value })}
                placeholder="••••••••••••••••"
                className="flex-1 outline-none"
                style={{
                  backgroundColor: "transparent", color: p.textPrimary,
                  padding: "0.6rem 0.75rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
                  border: "none", minWidth: 0,
                }}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  color: p.textMuted,
                  padding: "0.5rem 0.75rem",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderInlineStart: `1px solid ${p.border}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = p.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.color = p.textMuted)}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <ProviderHint p={p} draft={draft} />
          </FormGroup>
        </Card>

        {/* Sender identity */}
        <Card title={<><Mail size={12} className="inline mr-1.5" /> Sender identity</>}>
          <FormGroup label="From name">
            <TextField
              value={draft.fromName}
              onChange={(v) => set({ fromName: v })}
              placeholder="The Lodge Suites · Reservations"
            />
          </FormGroup>
          <FormGroup label="From email" className="mt-4">
            <TextField
              type="email"
              value={draft.fromEmail}
              onChange={(v) => set({ fromEmail: v })}
              placeholder="reservations@thelodgesuites.com"
            />
          </FormGroup>
          <FormGroup label="Reply-to email" className="mt-4">
            <TextField
              type="email"
              value={draft.replyTo}
              onChange={(v) => set({ replyTo: v })}
              placeholder="reservations@thelodgesuites.com"
            />
          </FormGroup>
        </Card>

        {/* Test & verify */}
        <Card title={<><Wifi size={12} className="inline mr-1.5" /> Test & verify</>}>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 12 }}>
            Verify the connection and send a test email before going live.
          </div>

          <button
            onClick={testConnection}
            disabled={testing}
            className="w-full inline-flex items-center justify-center gap-2"
            style={{
              backgroundColor: testing ? p.bgPanelAlt : `${p.accent}14`,
              color: p.accent,
              border: `1px solid ${p.accent}`,
              padding: "0.65rem 1rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              cursor: testing ? "wait" : "pointer",
            }}
          >
            <ShieldCheck size={12} />
            {testing ? "Testing connection…" : "Test SMTP connection"}
          </button>

          {/* Test result line */}
          {draft.lastTestStatus && (
            <div
              className="p-2.5 mt-3 flex items-start gap-2"
              style={{
                backgroundColor: `${draft.lastTestStatus === "success" ? p.success : p.danger}10`,
                border: `1px solid ${draft.lastTestStatus === "success" ? p.success : p.danger}45`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5,
                color: p.textPrimary,
              }}
            >
              {draft.lastTestStatus === "success" ? (
                <CheckCircle2 size={12} style={{ color: p.success, marginTop: 2, flexShrink: 0 }} />
              ) : (
                <AlertTriangle size={12} style={{ color: p.danger, marginTop: 2, flexShrink: 0 }} />
              )}
              <div className="min-w-0">
                <div style={{ fontWeight: 700, color: draft.lastTestStatus === "success" ? p.success : p.danger }}>
                  {draft.lastTestStatus === "success" ? "Last test passed" : "Last test failed"}
                </div>
                <div style={{ color: p.textMuted, marginTop: 2 }}>
                  {draft.lastTestMessage}
                </div>
                {draft.lastTestedAt && (
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                    {new Date(draft.lastTestedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          <FormGroup label="Send test email to" className="mt-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <TextField
                  type="email"
                  value={draft.testEmailRecipient}
                  onChange={(v) => set({ testEmailRecipient: v })}
                  placeholder="test@example.com"
                />
              </div>
              <button
                onClick={sendTestEmail}
                disabled={!draft.testEmailRecipient}
                style={{
                  backgroundColor: draft.testEmailRecipient ? p.success : p.bgPanelAlt,
                  color: draft.testEmailRecipient ? "#FFFFFF" : p.textMuted,
                  border: `1px solid ${draft.testEmailRecipient ? p.success : p.border}`,
                  padding: "0 1rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: draft.testEmailRecipient ? "pointer" : "not-allowed",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                <Send size={12} /> Send
              </button>
            </div>
          </FormGroup>
        </Card>
      </div>

      {/* Quick-setup providers */}
      <Card title={<><Zap size={12} className="inline mr-1.5" /> Quick setup — popular providers</>} className="mt-5">
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 12 }}>
          One click fills in host, port, and encryption. You still need to enter your credentials.
        </div>
        <div className="flex flex-wrap gap-2">
          {SMTP_PROVIDER_PRESETS.map((preset) => {
            const active = draft.host === preset.host;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="inline-flex items-center gap-2"
                title={preset.note}
                style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.72rem", letterSpacing: "0.04em", fontWeight: 600,
                  padding: "0.5rem 0.9rem",
                  backgroundColor: active ? `${p.accent}14` : p.bgPanel,
                  border: `1px solid ${active ? p.accent : p.border}`,
                  color: active ? p.accent : p.textPrimary,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!active) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; }
                }}
                onMouseLeave={(e) => {
                  if (!active) { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textPrimary; }
                }}
              >
                {preset.label}
                {active && <CheckCircle2 size={11} />}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Save row */}
      <div className="flex items-center justify-end gap-3 mt-6">
        {dirty && <GhostBtn onClick={discard} small><RotateCcw size={11} /> Discard</GhostBtn>}
        <PrimaryBtn onClick={save} small disabled={!dirty}>
          <Save size={12} /> Save changes
        </PrimaryBtn>
      </div>
    </div>
  );
};

// Resolves the status banner state from the current draft. Three flavours:
//   • disabled: SMTP off — outbound mail won't go through.
//   • untested: enabled but never successfully tested — warn yellow.
//   • connected: tested + passed — success green.
function bannerState(draft) {
  if (!draft.enabled) {
    return {
      title: "SMTP disabled",
      body: "Outbound transactional emails are paused. Toggle Enable to start delivering.",
      icon: AlertTriangle, color: "#A0826A",
      bg: "rgba(160,130,106,0.10)", border: "rgba(160,130,106,0.35)",
    };
  }
  if (draft.lastTestStatus === "success") {
    return {
      title: "SMTP connected",
      body: draft.lastTestedAt
        ? `Last tested: ${new Date(draft.lastTestedAt).toLocaleString()}`
        : "Connection verified.",
      icon: CheckCircle2, color: "#16A34A",
      bg: "rgba(22,163,74,0.10)", border: "rgba(22,163,74,0.35)",
    };
  }
  if (draft.lastTestStatus === "failed") {
    return {
      title: "SMTP test failed",
      body: draft.lastTestMessage || "Last connection attempt failed.",
      icon: AlertTriangle, color: "#DC2626",
      bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.35)",
    };
  }
  return {
    title: "SMTP enabled · not yet tested",
    body: "Run the connection test to verify your credentials before going live.",
    icon: AlertTriangle, color: "#D97706",
    bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.35)",
  };
}

// Provider-specific hint shown under the password field. Falls back to a
// generic note when the host doesn't match any of the known presets.
function ProviderHint({ p, draft }) {
  const preset = SMTP_PROVIDER_PRESETS.find((x) => x.host === draft.host);
  const note = preset?.note || "Use an account-specific password where the provider supports one — never your everyday account password.";
  return (
    <div style={{
      color: p.textMuted, fontFamily: "'Manrope', sans-serif",
      fontSize: "0.74rem", lineHeight: 1.55, marginTop: 6,
    }}>
      {note}
    </div>
  );
}

// Lightweight toggle switch — themed via the supplied accent color so it
// works on both light and dark palettes.
function ToggleSwitch({ checked, onChange, color = "#16A34A", track = "rgba(0,0,0,0.18)" }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 40, height: 22, borderRadius: 999,
        backgroundColor: checked ? color : track,
        position: "relative", border: "none", cursor: "pointer",
        transition: "background-color 160ms",
      }}
    >
      <span
        style={{
          position: "absolute", top: 3, insetInlineStart: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: 999,
          backgroundColor: "#FFFFFF",
          transition: "inset-inline-start 160ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
