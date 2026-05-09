import React, { useEffect, useState } from "react";
import {
  Activity, AlertCircle, BarChart3, Briefcase, Building2, Eye, EyeOff, Hotel,
  KeyRound, Lock, LogIn, LogOut, Mail, ShieldCheck, Sparkles, UserCheck, Users, X,
} from "lucide-react";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData } from "../data/store.jsx";
import { CorporateTab } from "./portal/CorporateTab.jsx";
import { AgentTab } from "./portal/AgentTab.jsx";
import { AdminTab } from "./portal/AdminTab.jsx";
import { ActivitiesTab } from "./portal/ActivitiesTab.jsx";
import { Dashboard } from "./portal/admin/sections/Dashboard.jsx";
import { Bookings } from "./portal/admin/sections/Bookings.jsx";
import { Loyalty }  from "./portal/admin/sections/Loyalty.jsx";
import { ToastHost, pushToast } from "./portal/admin/ui.jsx";
import { PortalThemeProvider, ThemeToggle, usePalette } from "./portal/theme.jsx";
import { NotificationBell } from "../components/NotificationBell.jsx";

export const PartnerPortal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <PortalThemeProvider defaultTheme="light">
      <PartnerPortalInner onClose={onClose} />
    </PortalThemeProvider>
  );
};

function PartnerPortalInner({ onClose }) {
  const t = useT();
  const p = usePalette();
  const { staffSession, signOutStaff, staffImpersonation, endStaffImpersonation } = useData();
  const [tab, setTab] = useState("dashboard");
  const [adminSection, setAdminSection] = useState("calendar");
  const [adminParams, setAdminParams] = useState(null);
  // Top-level Bookings tab params — lets sibling sections (e.g. Payments
  // inside Admin) deep-link to a specific booking by id.
  const [bookingsParams, setBookingsParams] = useState(null);
  const [loyaltyParams, setLoyaltyParams] = useState(null);

  // Lock scroll on the body while the portal owns the viewport.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Cross-tab nav helper — Dashboard tiles, the bookings table, etc. use
  // this to deep-link into the Bookings tab, into a specific Hotel Admin
  // sub-section, into LS Privilege, or onto the Corporate / Agent tabs.
  const navigate = (targetTab, subSection, params) => {
    if (targetTab === "admin" && subSection === "loyalty") {
      setLoyaltyParams(params || null);
      setTab("loyalty");
    } else if (targetTab === "loyalty") {
      setLoyaltyParams(params || null);
      setTab("loyalty");
    } else {
      if (targetTab === "admin" && subSection) setAdminSection(subSection);
      if (targetTab === "admin")    setAdminParams(params || null);
      if (targetTab === "bookings") setBookingsParams(params || null);
      setTab(targetTab);
    }
    setTimeout(() => {
      const main = document.querySelector("main.flex-1.overflow-y-auto");
      if (main) main.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  };

  const tabs = [
    { id: "dashboard",  label: t("portal.tabs.dashboard"),  icon: BarChart3 },
    { id: "bookings",   label: t("portal.tabs.bookings"),   icon: Users },
    { id: "activities", label: t("portal.tabs.activities"), icon: Activity },
    { id: "corporate",  label: t("portal.tabs.corporate"),  icon: Building2 },
    { id: "agent",      label: t("portal.tabs.agent"),      icon: Briefcase },
    { id: "loyalty",    label: t("portal.tabs.loyalty"),    icon: Sparkles },
    { id: "admin",      label: t("portal.tabs.admin"),      icon: Hotel },
  ];

  // Login gate — show the staff login screen until a valid session exists.
  if (!staffSession) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: p.bgPage }}>
        <StaffLogin onClose={onClose} />
        <ToastHost />
      </div>
    );
  }

  const initials = (staffSession.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const avatarColor = staffSession.avatarColor || p.accent;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: p.bgPage }}>
      {/* App-bar — responsive layout. Identity chip is desktop-only,
          action buttons collapse to icons on mobile so the welcome title
          never overflows. */}
      <header className="flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 md:px-10 py-3 sm:py-4" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Lock size={16} style={{ color: p.accent, flexShrink: 0 }} />
          <div className="min-w-0">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.28em", textTransform: "uppercase", color: p.accent, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t("portal.label")}
            </div>
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(1rem, 3.6vw, 1.4rem)",
              fontStyle: "italic", color: p.textPrimary, lineHeight: 1.05,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              Welcome back, {staffSession.name?.split(" ")[0] || "operator"}.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Signed-in identity chip — desktop only (saves the most width) */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              backgroundColor: `${avatarColor}1F`, color: avatarColor,
              border: `1.5px solid ${avatarColor}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: "0.78rem",
            }}>{initials}</div>
            <div className="min-w-0">
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 600, lineHeight: 1.2 }}>
                {staffSession.name}
              </div>
              <div style={{ color: avatarColor, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>
                {staffSession.role}
              </div>
            </div>
          </div>
          <NotificationBell
            audience="staff"
            palette={p}
            onSelect={(n) => {
              // Deep-link based on the related record. Bookings live on
              // the top-level Bookings tab; invoices and payments are
              // operations sub-sections under Hotel Admin.
              if (n.refType === "booking") navigate("bookings");
              else if (n.refType === "invoice") navigate("admin", "invoices");
              else if (n.refType === "payment") navigate("admin", "payments");
            }}
          />
          <ThemeToggle />
          <button
            onClick={() => { signOutStaff(); pushToast({ message: "Signed out" }); }}
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center gap-2 flex-shrink-0"
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              color: p.textMuted,
              padding: "0.45rem", border: `1px solid ${p.border}`,
              backgroundColor: "transparent", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          >
            <LogOut size={14} />
            <span className="hidden sm:inline" style={{ paddingInlineEnd: "0.4rem" }}>Sign out</span>
          </button>
          <button
            onClick={onClose}
            title="Exit portal"
            aria-label="Exit portal"
            className="flex items-center gap-2 flex-shrink-0"
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              color: p.textMuted,
              padding: "0.45rem", border: `1px solid ${p.border}`,
              backgroundColor: "transparent", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          >
            <X size={14} />
            <span className="hidden sm:inline" style={{ paddingInlineEnd: "0.4rem" }}>Exit</span>
          </button>
        </div>
      </header>

      {/* Staff impersonation banner — only visible while the Owner is signed
          in as a teammate. Spans the full width above the tab strip so the
          operator can never miss that they're not in their own session. */}
      {staffImpersonation && (
        <div className="px-6 md:px-10 py-3 flex items-center justify-between gap-3 flex-wrap" style={{
          backgroundColor: `${p.warn}1F`,
          borderBottom: `2px solid ${p.warn}`,
        }}>
          <div className="flex items-center gap-3 min-w-0">
            <UserCheck size={16} style={{ color: p.warn, flexShrink: 0 }} />
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.4 }}>
              <strong>{staffImpersonation.by?.name || "Owner"}</strong> signed in as{" "}
              <strong>{staffImpersonation.targetUser?.name}</strong>
              {staffImpersonation.targetUser?.title ? <span style={{ color: p.textMuted }}> · {staffImpersonation.targetUser.title}</span> : null}
              {staffImpersonation.targetUser?.role ? <span style={{ color: p.textMuted }}> · {staffImpersonation.targetUser.role}</span> : null}
              <span style={{ color: p.textMuted, marginInlineStart: 8, fontSize: "0.74rem" }}>
                · audit-logged
              </span>
            </div>
          </div>
          <button
            onClick={() => { endStaffImpersonation(); pushToast({ message: "Impersonation ended · welcome back" }); }}
            className="flex items-center gap-2 flex-shrink-0"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
              fontWeight: 700, color: p.warn,
              padding: "0.45rem 0.85rem", border: `1px solid ${p.warn}`,
              backgroundColor: "transparent", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.warn}1F`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <X size={14} /> Stop impersonating
          </button>
        </div>
      )}

      {/* Tabs row */}
      <nav className="flex flex-wrap px-6 md:px-10" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        {tabs.map((tt) => {
          const TabIcon = tt.icon;
          const active = tab === tt.id;
          return (
            <button
              key={tt.id}
              onClick={() => setTab(tt.id)}
              className="flex items-center gap-2 transition-colors"
              style={{
                padding: "1rem 1.6rem",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.74rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: active ? p.accent : p.textMuted,
                borderBottom: active ? `2px solid ${p.accent}` : "2px solid transparent",
                backgroundColor: active ? p.bgActiveTab : "transparent",
              }}
            >
              <TabIcon size={14} /> {tt.label}
            </button>
          );
        })}
      </nav>

      {/* Body — full-bleed scroll area */}
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: p.bgPage }}>
        <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-8">
          {tab === "dashboard"  && <Dashboard onNavigate={navigate} />}
          {tab === "bookings"   && <Bookings onNavigate={navigate} params={bookingsParams} clearParams={() => setBookingsParams(null)} />}
          {tab === "activities" && <ActivitiesTab />}
          {tab === "corporate"  && <CorporateTab />}
          {tab === "agent"      && <AgentTab />}
          {tab === "loyalty"    && <Loyalty params={loyaltyParams} clearParams={() => setLoyaltyParams(null)} />}
          {tab === "admin"      && <AdminTab section={adminSection} onSectionChange={setAdminSection} params={adminParams} clearParams={() => setAdminParams(null)} onNavigate={navigate} />}
        </div>
      </main>

      {/* Toasts shared across every tab (admin sections + others) */}
      <ToastHost />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaffLogin — gate screen for the operator portal. Validates email +
// password against the live adminUsers store and only lets active accounts
// in. Demo credentials are listed on the right so the operator can test
// every role without leaving the screen.
// ---------------------------------------------------------------------------
function StaffLogin({ onClose }) {
  const p = usePalette();
  const t = useT();
  const { adminUsers, signInStaff } = useData();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!email.trim() || !password) {
      setError("Enter email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    // Tiny delay so the operator perceives an authentication beat.
    setTimeout(() => {
      const result = signInStaff(email, password);
      if (!result.ok) {
        setError(result.error);
      } else {
        pushToast({ message: `Welcome back, ${result.user.name}` });
      }
      setBusy(false);
    }, 350);
  };

  const fill = (em, pw) => { setEmail(em); setPassword(pw); setError(null); };

  // Quick-pick chips — drawn from the live adminUsers store so any new
  // operator added in Staff & Access shows up here immediately.
  const demoCreds = (adminUsers || [])
    .filter((u) => u.status === "active" && u.password)
    .slice(0, 8);

  // Group by role for the sidebar
  const ROLE_COLORS = {
    owner: "#7C3AED", gm: "#0F766E", fom: "#2563EB",
    reservations: "#0891B2", housekeeping: "#0D9488",
    sales: "#D97706", accounts: "#BE123C",
    marketing: "#C9A961", readonly: "#64748B",
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: p.bgPage }}>
      {/* Top bar with brand + exit */}
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="flex items-center gap-3 min-w-0">
          <Lock size={16} style={{ color: p.accent, flexShrink: 0 }} />
          <div className="min-w-0">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 600 }}>
              {t("portal.label")}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1 }}>
              Operator sign-in
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ThemeToggle />
          <button
            onClick={onClose}
            className="flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              color: p.textMuted,
              padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
            aria-label="Exit"
          >
            <X size={14} /> Exit
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Login form */}
          <div className="lg:col-span-2">
            <div className="mb-7">
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
                Sign in
              </div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.4rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1, marginTop: 6 }}>
                Welcome to the operator portal.
              </h2>
              <p style={{ color: p.textMuted, fontSize: "0.92rem", marginTop: 8, lineHeight: 1.55 }}>
                Sign in with your staff credentials. Permissions are scoped by role — sign-ins are written to the audit log.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, padding: 24 }}>
              <div>
                <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Work email
                </label>
                <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
                  <span className="flex items-center px-3" style={{ color: p.textMuted }}><Mail size={14} /></span>
                  <input
                    type="email" autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="you@thelodgesuites.com"
                    className="flex-1 outline-none"
                    style={{
                      backgroundColor: "transparent", color: p.textPrimary,
                      padding: "0.7rem 0.5rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.9rem",
                      border: "none", minWidth: 0,
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Password
                </label>
                <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
                  <span className="flex items-center px-3" style={{ color: p.textMuted }}><KeyRound size={14} /></span>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="••••••••"
                    className="flex-1 outline-none"
                    style={{
                      backgroundColor: "transparent", color: p.textPrimary,
                      padding: "0.7rem 0.5rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.9rem",
                      border: "none", minWidth: 0,
                    }}
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="flex items-center px-3" style={{ color: p.textMuted, borderInlineStart: `1px solid ${p.border}` }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3" style={{
                  backgroundColor: `${p.danger}10`, border: `1px solid ${p.danger}40`,
                  color: p.danger, fontSize: "0.84rem",
                }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2"
                style={{
                  backgroundColor: busy ? p.border : p.accent,
                  color: busy ? p.textMuted : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
                  border: `1px solid ${busy ? p.border : p.accent}`,
                  padding: "0.9rem 1rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                  fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase",
                  cursor: busy ? "wait" : "pointer",
                }}
                onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; } }}
                onMouseLeave={(e) => { if (!busy) { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
              >
                <LogIn size={14} /> {busy ? "Signing in…" : "Sign in"}
              </button>

              <div className="text-center" style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 4 }}>
                Forgot password? <a href="mailto:gm@thelodgesuites.com?subject=Operator%20portal%20password%20reset" style={{ color: p.accent, fontWeight: 700 }}>Email the GM →</a>
              </div>
            </form>

            <div className="mt-5 p-4 flex items-start gap-3" style={{ backgroundColor: `${p.accent}08`, border: `1px solid ${p.accent}30` }}>
              <ShieldCheck size={14} style={{ color: p.accent, marginTop: 2, flexShrink: 0 }} />
              <div style={{ color: p.textSecondary, fontSize: "0.78rem", lineHeight: 1.5 }}>
                Owners and finance roles are required to enable two-factor authentication. Configure MFA from <strong>Hotel Admin → Operations → Staff & Access</strong>.
              </div>
            </div>
          </div>

          {/* Demo credentials */}
          <div className="lg:col-span-3">
            <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
              Demo accounts
            </div>
            <p style={{ color: p.textMuted, fontSize: "0.86rem", marginBottom: 14, maxWidth: 580 }}>
              Click any tile to auto-fill the form. Each role has scoped permissions — owners get everything, housekeeping sees only maintenance + room status, accounts handle folios + payments, and so on.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {demoCreds.map((u) => {
                const color = ROLE_COLORS[u.role] || p.accent;
                return (
                  <button
                    key={u.id}
                    onClick={() => fill(u.email, u.password)}
                    className="text-start p-4 transition-colors"
                    style={{
                      backgroundColor: `${color}0E`,
                      border: `1px solid ${color}40`,
                      borderInlineStart: `3px solid ${color}`,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${color}1F`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${color}0E`; }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span style={{ color, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                        {u.role}
                      </span>
                      {u.mfa && (
                        <span title="MFA enabled" style={{ color: p.success, fontSize: "0.6rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <ShieldCheck size={11} /> MFA
                        </span>
                      )}
                    </div>
                    <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", fontWeight: 500, lineHeight: 1.2 }}>
                      {u.name}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{u.title}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6, fontFamily: "'Manrope', sans-serif" }}>
                      Email · <code style={{ color: p.textPrimary }}>{u.email}</code>
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2, fontFamily: "'Manrope', sans-serif" }}>
                      Password · <code style={{ color }}>{u.password}</code>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
