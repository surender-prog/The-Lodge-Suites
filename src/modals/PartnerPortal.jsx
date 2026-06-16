import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, BarChart3, Briefcase, Building2, Eye, EyeOff, Hotel,
  Handshake, KeyRound, Lock, LogIn, LogOut, Mail, ShieldCheck, Sparkles, UserCheck, Users, X,
} from "lucide-react";
import { useT } from "../i18n/LanguageContext.jsx";
import {
  useData,
  hasPermission, hasAnyPermission,
  TOP_TAB_PERMISSION, ADMIN_SECTION_PERMISSION,
} from "../data/store.jsx";
import { CorporateTab } from "./portal/CorporateTab.jsx";
import { AgentTab } from "./portal/AgentTab.jsx";
import { AdminTab } from "./portal/AdminTab.jsx";
import { ActivitiesTab } from "./portal/ActivitiesTab.jsx";
import { Dashboard } from "./portal/admin/sections/Dashboard.jsx";
import { Bookings } from "./portal/admin/sections/Bookings.jsx";
import { Loyalty }  from "./portal/admin/sections/Loyalty.jsx";
import { PartnerLoyalty } from "./portal/admin/sections/PartnerLoyalty.jsx";
import { ImpersonateDrawer } from "./portal/admin/sections/StaffAccess.jsx";
import { ToastHost, pushToast } from "./portal/admin/ui.jsx";
import { PortalThemeProvider, ThemeToggle, usePalette } from "./portal/theme.jsx";
import { NotificationBell, MessagesQuickButton } from "../components/NotificationBell.jsx";

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
  // Global "Log in as" picker — reachable from the header by any operator.
  const [impersonateOpen, setImpersonateOpen] = useState(false);

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
    { id: "partnerLoyalty", label: t("portal.tabs.partnerLoyalty"), icon: Handshake },
    { id: "admin",      label: t("portal.tabs.admin"),      icon: Hotel },
  ];

  // Permission-filtered tabs. Most rows map to a single permission via
  // TOP_TAB_PERMISSION; the Hotel Admin tab is special — it's visible
  // when the operator has access to ANY of its sub-sections (i.e. at
  // least one admin function they're allowed to use). A pure "Owner"
  // permission set lights up everything; a Marketing user without
  // dashboard-only restrictions still sees Hotel Admin → Offers; a
  // read-only auditor only sees Dashboard.
  const visibleTabs = useMemo(() => {
    if (!staffSession) return tabs;
    const adminSubPerms = Object.values(ADMIN_SECTION_PERMISSION);
    return tabs.filter((tt) => {
      if (tt.id === "admin") return hasAnyPermission(staffSession, adminSubPerms);
      return hasPermission(staffSession, TOP_TAB_PERMISSION[tt.id]);
    });
    // tabs is rebuilt every render off useT; depending on staffSession
    // is the meaningful trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffSession]);

  // Snap the active tab to one the operator can actually see. Prevents
  // the body rendering an unauthorised section when the user signs in
  // as a role whose default tab (dashboard) isn't in their permission
  // set, or a role downgrade strips them of their current tab live.
  useEffect(() => {
    if (!staffSession) return;
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tt) => tt.id === tab)) {
      setTab(visibleTabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs, tab, staffSession]);

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
          <MessagesQuickButton
            audience="staff"
            palette={p}
            onOpen={() => navigate("admin", "messages")}
          />
          <NotificationBell
            audience="staff"
            palette={p}
            onSelect={(n) => {
              // Deep-link based on the related record. Bookings live on
              // the top-level Bookings tab; invoices and payments are
              // operations sub-sections under Hotel Admin. The `refId`
              // is forwarded as a param so the destination section
              // opens the *specific* record (booking editor / invoice
              // detail / payment row) rather than dumping the operator
              // on the list view and asking them to hunt.
              if (n.refType === "booking") {
                navigate("bookings", null, { bookingId: n.refId });
              } else if (n.refType === "invoice") {
                navigate("admin", "invoices", { invoiceId: n.refId });
              } else if (n.refType === "payment") {
                navigate("admin", "payments", { paymentId: n.refId });
              }
            }}
          />
          {!staffImpersonation && (
            <button
              onClick={() => setImpersonateOpen(true)}
              title="Log in as a member, travel agent or corporate account"
              aria-label="Log in as another account"
              className="flex items-center gap-2 flex-shrink-0"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                color: p.accent,
                padding: "0.45rem 0.7rem", border: `1px solid ${p.accent}`,
                backgroundColor: "transparent", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <UserCheck size={14} />
              <span className="hidden md:inline" style={{ paddingInlineEnd: "0.4rem" }}>Log in as</span>
            </button>
          )}
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
        {visibleTabs.map((tt) => {
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
          {tab === "partnerLoyalty" && <PartnerLoyalty />}
          {tab === "admin"      && <AdminTab section={adminSection} onSectionChange={setAdminSection} params={adminParams} clearParams={() => setAdminParams(null)} onNavigate={navigate} />}
        </div>
      </main>

      {/* Global "Log in as" picker — any operator can open their members /
          travel agents / corporates here; staff-on-staff stays Owner-only. */}
      {impersonateOpen && (
        <ImpersonateDrawer owner={staffSession} onClose={() => setImpersonateOpen(false)} />
      )}

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
  const { signInStaff } = useData();

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
    setTimeout(async () => {
      try {
        const result = await signInStaff(email, password);
        if (!result.ok) {
          setError(result.error);
        } else {
          pushToast({ message: `Welcome back, ${result.user.name}` });
        }
      } catch (_) {
        setError("Sign-in failed — please try again.");
      } finally {
        setBusy(false);
      }
    }, 350);
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
        <div className="max-w-md mx-auto">
          {/* Login form */}
          <div>
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
        </div>
      </div>
    </div>
  );
}
