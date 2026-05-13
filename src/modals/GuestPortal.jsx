import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, BedDouble, Briefcase, Building2, Calendar,
  CalendarDays, CheckCircle2, ChevronLeft, ClipboardList, Coins, Copy, CreditCard,
  Crown, Download, Edit2, Eye, EyeOff, FileText, Image as ImageIcon, KeyRound, Link as LinkIcon,
  Lock, LogIn, LogOut, Mail, MessageCircle, Minus, Phone, Plus, Printer,
  Receipt as ReceiptIcon, Save, Send, Share2, Shield, Sparkles, Star, Trash2,
  User, UserCircle2, Users, Wallet, X, Zap,
} from "lucide-react";
import {
  buildPkpassBlob, buildMembershipCardPng, buildShareText,
  whatsAppShareUrl, emailShareUrl, nativeShare, downloadBlob, tierVisuals, hotel,
} from "../utils/membershipPass.js";
import { useT } from "../i18n/LanguageContext.jsx";
import { useData, applyTaxes, priceExtra, priceLabelFor, legalLine, roomFitsParty, buildCardOnFile, nightlyBreakdown } from "../data/store.jsx";
import { Icon as ExtraIcon } from "../components/Icon.jsx";
import { PortalThemeProvider, ThemeToggle, usePalette } from "./portal/theme.jsx";
import { ToastHost, pushToast } from "./portal/admin/ui.jsx";
import { NotificationBell } from "../components/NotificationBell.jsx";
import { MessageThread } from "../components/MessageThread.jsx";

// ---------------------------------------------------------------------------
// GuestPortal — self-service portal for the three customer cohorts:
//   1. Corporate accounts (companies with negotiated rates)
//   2. Travel agents (agencies with commission contracts)
//   3. LS Privilege members (loyalty guests)
//
// Single login resolver checks all three credential stores and routes the
// authenticated user to the right portal experience. Each portal exposes:
// Dashboard · Bookings · Invoices · Receipts · Statements · Profile.
//
// All data flows live from the store, so an operator-side edit (e.g. issuing
// an invoice) appears in the guest's portal on next render.
// ---------------------------------------------------------------------------

export const GuestPortal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <PortalThemeProvider defaultTheme="light">
      <GuestPortalInner onClose={onClose} />
    </PortalThemeProvider>
  );
};

function GuestPortalInner({ onClose }) {
  const p = usePalette();
  const data = useData();
  const { impersonation, endImpersonation } = data;

  // When the Owner triggers impersonation from Staff & Access, the store's
  // `impersonation` state is set. We hydrate a session from it on mount so
  // the portal opens already signed-in as the chosen user.
  const [session, setSession] = useState(() => impersonation ? {
    kind: impersonation.kind,
    accountId: impersonation.accountId,
    userId: impersonation.userId,
    displayName: impersonation.displayName,
    email: impersonation.email,
    impersonated: true,
  } : null);

  // If impersonation kicks in after the modal is open (e.g. Owner opens this
  // modal first then triggers impersonation), reflect it in the session.
  useEffect(() => {
    if (impersonation && (!session || session.accountId !== impersonation.accountId)) {
      setSession({
        kind: impersonation.kind,
        accountId: impersonation.accountId,
        userId: impersonation.userId,
        displayName: impersonation.displayName,
        email: impersonation.email,
        impersonated: true,
      });
    }
  }, [impersonation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll while the portal owns the viewport
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Wraps onClose to also end an active impersonation session so the audit
  // log captures the exit and the operator returns to a clean state.
  const exitAndClose = () => {
    if (impersonation) endImpersonation();
    onClose?.();
  };

  // Notification → tab navigation handoff. The bell sits in the outer
  // header but each sub-portal (Corporate / Agent / Member) owns its own
  // tab state. When the user clicks a notification we drop the target
  // tab here; each sub-portal's effect picks it up and calls setTab,
  // then clears the pending value via `consumePendingNav`.
  const [pendingNav, setPendingNav] = useState(null);
  const consumePendingNav = () => setPendingNav(null);
  // Map a notification to the right tab id within the active sub-portal.
  // The tab IDs are consistent across all three sub-portals (Corporate,
  // Agent, Member) — only the labels differ ("Folios" vs "Invoices").
  const notifToTab = (n) => {
    if (n.refType === "booking") return "bookings";
    if (n.refType === "invoice") return "invoices";
    if (n.refType === "payment") return "receipts";
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: p.bgPage }}>
      {/* App-bar — responsive layout. On mobile the eyebrow + welcome
          title shrink to fit available width and the action buttons go
          icon-only; on sm+ everything gets the full label. */}
      <header className="flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 md:px-10 py-3 sm:py-4" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Lock size={16} style={{ color: p.accent, flexShrink: 0 }} />
          <div className="min-w-0">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.28em", textTransform: "uppercase", color: p.accent, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Guest Portal · Self-service
            </div>
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              // Smaller on mobile so a long welcome name doesn't blow up
              // the row height. clamp() so it scales smoothly.
              fontSize: "clamp(1rem, 3.6vw, 1.4rem)",
              fontStyle: "italic",
              color: p.textPrimary,
              lineHeight: 1.05,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {session ? `Welcome, ${session.displayName}` : "Sign in to your account"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Notification bell — visible only when a session is active so
              we have something to scope to. The audience filter pulls only
              this user's account-level notifications. */}
          {session && (
            <NotificationBell
              audience="guest"
              session={session}
              palette={p}
              onSelect={(n) => {
                const tab = notifToTab(n);
                if (tab) setPendingNav({ tab, refId: n.refId });
              }}
            />
          )}
          <ThemeToggle />
          {session && !impersonation && (
            <button
              onClick={() => { setSession(null); pushToast({ message: "Signed out" }); }}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center gap-2 flex-shrink-0"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.66rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: p.textMuted,
                padding: "0.45rem",
                border: `1px solid ${p.border}`,
                backgroundColor: "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
            >
              <LogOut size={14} />
              <span className="hidden sm:inline" style={{ paddingInlineEnd: "0.4rem" }}>Sign out</span>
            </button>
          )}
          {impersonation && (
            <button
              onClick={() => { endImpersonation(); setSession(null); onClose?.(); pushToast({ message: "Impersonation ended" }); }}
              title="Exit impersonation"
              aria-label="Exit impersonation"
              className="flex items-center gap-2 flex-shrink-0"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                color: "#FFFFFF", backgroundColor: "#7C3AED",
                padding: "0.45rem", border: `1px solid #7C3AED`,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#6D28D9"; e.currentTarget.style.borderColor = "#6D28D9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#7C3AED"; e.currentTarget.style.borderColor = "#7C3AED"; }}
            >
              <Shield size={14} />
              <span className="hidden md:inline" style={{ paddingInlineEnd: "0.4rem" }}>Exit impersonation</span>
            </button>
          )}
          <button
            onClick={exitAndClose}
            title="Exit portal"
            aria-label="Exit portal"
            className="flex items-center gap-2 flex-shrink-0"
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: p.textMuted,
              padding: "0.45rem",
              border: `1px solid ${p.border}`,
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          >
            <X size={14} />
            <span className="hidden sm:inline" style={{ paddingInlineEnd: "0.4rem" }}>Exit</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: p.bgPage }}>
        {impersonation && (
          <div className="px-6 md:px-10 py-3" style={{
            backgroundColor: "#7C3AED", color: "#FFFFFF",
            borderBottom: `1px solid ${p.border}`,
          }}>
            <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Shield size={16} />
                <div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, opacity: 0.85 }}>
                    Impersonation active · Super-admin override
                  </div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", fontWeight: 600 }}>
                    {impersonation.by?.name || "Owner"} signed in as <strong>{impersonation.displayName}</strong> ({impersonation.email})
                  </div>
                </div>
              </div>
              <button
                onClick={() => { endImpersonation(); setSession(null); onClose?.(); pushToast({ message: "Impersonation ended" }); }}
                className="inline-flex items-center gap-2"
                style={{
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  color: "#7C3AED", backgroundColor: "#FFFFFF",
                  padding: "0.45rem 0.95rem", border: "1px solid #FFFFFF",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
              >
                <X size={12} /> End impersonation
              </button>
            </div>
          </div>
        )}
        {!session ? (
          <LoginPanel data={data} onSignIn={setSession} />
        ) : session.kind === "corporate" ? (
          <CorporatePortal session={session} setSession={setSession} pendingNav={pendingNav} consumePendingNav={consumePendingNav} />
        ) : session.kind === "agent" ? (
          <AgentPortal session={session} setSession={setSession} pendingNav={pendingNav} consumePendingNav={consumePendingNav} />
        ) : (
          <MemberPortal session={session} setSession={setSession} pendingNav={pendingNav} consumePendingNav={consumePendingNav} />
        )}
      </main>

      <ToastHost />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoginPanel — unified login. Checks corporate users → agent users →
// members in order. Falls back to corporate POC and agency POC when no
// users array exists (legacy data).
// ---------------------------------------------------------------------------
function LoginPanel({ data, onSignIn }) {
  const p = usePalette();
  const { agreements, agencies, members, hotelInfo } = data;
  // Forgot-password mailto uses the live front-desk email from Property
  // Info, falling back to the historic mailbox if hotelInfo isn't loaded.
  const supportEmail = (hotelInfo && hotelInfo.email) || "frontoffice@thelodgesuites.com";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);

  const tryLogin = (e) => {
    e?.preventDefault?.();
    const em = email.trim().toLowerCase();
    const pw = password;
    if (!em || !pw) { setError("Enter email and password."); return; }

    // 1. Corporate users
    for (const a of agreements) {
      const u = (a.users || []).find((u) => (u.email || "").toLowerCase() === em && u.password === pw);
      if (u) {
        onSignIn({
          kind: "corporate", accountId: a.id, userId: u.id,
          displayName: u.name, email: u.email, role: u.role,
        });
        pushToast({ message: `Welcome back, ${u.name}` });
        return;
      }
    }

    // 2. Agency users
    for (const a of agencies) {
      const u = (a.users || []).find((u) => (u.email || "").toLowerCase() === em && u.password === pw);
      if (u) {
        onSignIn({
          kind: "agent", accountId: a.id, userId: u.id,
          displayName: u.name, email: u.email, role: u.role,
        });
        pushToast({ message: `Welcome back, ${u.name}` });
        return;
      }
    }

    // 3. LS Privilege members
    const member = members.find((m) => (m.email || "").toLowerCase() === em && m.password === pw);
    if (member) {
      onSignIn({
        kind: "member", accountId: member.id, userId: member.id,
        displayName: member.name, email: member.email, tier: member.tier,
      });
      pushToast({ message: `Welcome back, ${member.name}` });
      return;
    }

    setError("Email or password didn't match. Try the demo credentials below.");
  };

  const fill = (em, pw) => { setEmail(em); setPassword(pw); setError(null); };

  const demoCreds = [
    { kind: "Corporate · BAPCO",      email: "sara.h@bapco.com.bh",  password: "LodgeStay-2026", color: "#D97706", icon: Building2 },
    { kind: "Corporate · GFH",        email: "y.mannai@gfh.com",     password: "LodgeStay-2026", color: "#D97706", icon: Building2 },
    { kind: "Travel Agent · Globepass", email: "reem@globepass.bh",  password: "AgentLogin-2026", color: "#7C3AED", icon: Briefcase },
    { kind: "Travel Agent · Cleartrip", email: "v.iyer@cleartrip.com",password: "AgentLogin-2026", color: "#7C3AED", icon: Briefcase },
    { kind: "LS Privilege · Gold",    email: "l.alkhalifa@example.com", password: "Member-2026",   color: "#C9A961", icon: Crown },
    { kind: "LS Privilege · Platinum",email: "s.holloway@example.com",  password: "Member-2026",   color: "#D4B97A", icon: Sparkles },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Login form */}
        <div className="lg:col-span-2">
          <div className="mb-8">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
              Sign in
            </div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.4rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1, marginTop: 6 }}>
              Welcome back.
            </h2>
            <p style={{ color: p.textMuted, fontSize: "0.92rem", marginTop: 8, lineHeight: 1.55 }}>
              Sign in to view your bookings, invoices, receipts and statements. The same form works for corporate accounts, travel agents and LS Privilege members — we'll route you to the right home.
            </p>
          </div>

          <form onSubmit={tryLogin} className="space-y-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, padding: 24 }}>
            <div>
              <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>
                Email address
              </label>
              <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
                <span className="flex items-center px-3" style={{ color: p.textMuted }}><Mail size={14} /></span>
                <input
                  type="email" autoFocus
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="you@company.com"
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
              className="w-full inline-flex items-center justify-center gap-2"
              style={{
                backgroundColor: p.accent,
                color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                border: `1px solid ${p.accent}`,
                padding: "0.9rem 1rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            >
              <LogIn size={14} /> Sign in
            </button>
            <div className="text-center" style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 4 }}>
              Forgot password? <a href={`mailto:${supportEmail}?subject=Portal%20password%20reset`} style={{ color: p.accent, fontWeight: 700 }}>Email front office →</a>
            </div>
          </form>
        </div>

        {/* Demo credentials sidebar */}
        <div className="lg:col-span-3">
          <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
            Demo accounts
          </div>
          <p style={{ color: p.textMuted, fontSize: "0.86rem", marginBottom: 14, maxWidth: 580 }}>
            Click any tile to auto-fill the form. The portal supports three account types — corporate, travel agent, and LS Privilege loyalty member — each with its own dashboard and document set.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {demoCreds.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.email}
                  onClick={() => fill(d.email, d.password)}
                  className="text-start p-4 transition-colors"
                  style={{
                    backgroundColor: `${d.color}0E`,
                    border: `1px solid ${d.color}40`,
                    borderInlineStart: `3px solid ${d.color}`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${d.color}1F`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${d.color}0E`; }}
                >
                  <div className="flex items-center gap-2" style={{ color: d.color, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 6 }}>
                    <Icon size={12} /> {d.kind}
                  </div>
                  <div style={{ color: p.textPrimary, fontSize: "0.84rem", fontWeight: 600 }}>{d.email}</div>
                  <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 3, fontFamily: "'Manrope', sans-serif" }}>
                    Password · <code style={{ color: p.accent }}>{d.password}</code>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Shared building blocks for the three portal experiences
// ===========================================================================

function PortalLayout({ session, setSession, banner, tabs, tab, setTab, children }) {
  const p = usePalette();
  return (
    <div>
      {banner}
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
                padding: "1rem 1.4rem",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.7rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: active ? p.accent : p.textMuted,
                borderBottom: active ? `2px solid ${p.accent}` : "2px solid transparent",
                backgroundColor: active ? p.bgActiveTab || p.bgPanelAlt : "transparent",
              }}
            >
              <TabIcon size={13} /> {tt.label}
            </button>
          );
        })}
      </nav>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, color }) {
  const p = usePalette();
  return (
    <div className="p-5" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.9rem", color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6, fontWeight: 700 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Card({ title, children, className = "", padded = true, action }) {
  const p = usePalette();
  return (
    <div className={className} style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      {(title || action) && (
        <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
          {title && (
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              {title}
            </div>
          )}
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </div>
  );
}

function statusChip(p, status) {
  const map = {
    confirmed:  { color: "#2563EB", label: "Confirmed" },
    "in-house": { color: "#16A34A", label: "In-house" },
    "checked-out": { color: "#64748B", label: "Checked out" },
    cancelled:  { color: "#DC2626", label: "Cancelled" },
    paid:       { color: "#16A34A", label: "Paid" },
    issued:     { color: "#2563EB", label: "Issued" },
    overdue:    { color: "#DC2626", label: "Overdue" },
    captured:   { color: "#16A34A", label: "Captured" },
    refunded:   { color: "#DC2626", label: "Refunded" },
  };
  const m = map[status] || { color: p.textMuted, label: status };
  return (
    <span style={{
      color: m.color, backgroundColor: `${m.color}1F`, border: `1px solid ${m.color}`,
      padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

function fmtBhd(n) {
  return `BHD ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
const ROOM_LABEL = { studio: "Studio", "one-bed": "One-bed", "two-bed": "Two-bed", "three-bed": "Three-bed" };

// Negotiated-rate dictionaries (corporate / agent) use camelCase keys for
// the four suite types. Map a public room id to that key.
const ROOM_RATE_KEY = { studio: "studio", "one-bed": "oneBed", "two-bed": "twoBed", "three-bed": "threeBed" };

// LS Privilege member discount per tier — applied to the rack rate.
// Numbers mirror the seeded benefits ("5% / 10% / 15% member rate").
const MEMBER_DISCOUNT_PCT = { silver: 5, gold: 10, platinum: 15 };

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso, n) => {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const nightsBetweenISO = (a, b) => {
  if (!a || !b) return 0;
  const ms = new Date(b) - new Date(a);
  return Math.max(0, Math.round(ms / 86400000));
};

function downloadHtmlFile(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ===========================================================================
// CorporatePortal
// ===========================================================================
function CorporatePortal({ session, setSession, pendingNav, consumePendingNav }) {
  const p = usePalette();
  const data = useData();
  const { agreements, bookings, invoices, payments, upsertAgreement } = data;
  const agreement = agreements.find((a) => a.id === session.accountId);
  const [tab, setTab] = useState("dashboard");
  // Selected booking — when non-null, the bookings tab renders BookingDetail
  // instead of the list. Cleared on tab change or via the back button.
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // Pick up notification-driven navigation (from the bell in the outer
  // header). The notification's refType maps to a tab id in the parent
  // GuestPortalInner via `notifToTab`; we just consume the value here
  // and call setTab. If the notification points at a specific booking
  // we open its detail view directly.
  useEffect(() => {
    if (pendingNav?.tab) {
      setTab(pendingNav.tab);
      if (pendingNav.tab === "bookings" && pendingNav.refId) {
        setSelectedBookingId(pendingNav.refId);
      }
      consumePendingNav?.();
    }
  }, [pendingNav]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear booking selection whenever the user navigates away from the
  // bookings tab so coming back lands on the list, not a stale detail.
  useEffect(() => { if (tab !== "bookings") setSelectedBookingId(null); }, [tab]);

  if (!agreement) return <NoAccount p={p} />;

  // Filter scopes by account
  const accBookings = useMemo(
    () => bookings.filter((b) => b.source === "corporate" && b.accountId === agreement.id),
    [bookings, agreement.id]
  );
  const accInvoices = useMemo(
    () => invoices.filter((i) => i.clientType === "corporate" && i.clientName?.toLowerCase().includes(agreement.account.toLowerCase())),
    [invoices, agreement]
  );
  const bookingIds = new Set(accBookings.map((b) => b.id));
  const accPayments = useMemo(
    () => payments.filter((pay) => bookingIds.has(pay.bookingId)),
    [payments, accBookings] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const tabs = [
    { id: "dashboard",  label: "Dashboard",  icon: Building2 },
    { id: "book",       label: "Book stay",  icon: CalendarDays },
    { id: "bookings",   label: "Bookings",   icon: BedDouble },
    { id: "invoices",   label: "Invoices",   icon: FileText },
    { id: "receipts",   label: "Receipts",   icon: ReceiptIcon },
    { id: "statement",  label: "Statement",  icon: Wallet },
    { id: "messages",   label: "Messages",   icon: MessageCircle },
    { id: "profile",    label: "Profile",    icon: UserCircle2 },
  ];

  return (
    <PortalLayout
      session={session} setSession={setSession}
      tabs={tabs} tab={tab} setTab={setTab}
      banner={<AccountBanner kindLabel="Corporate Account" name={agreement.account} subtitle={`${agreement.industry} · Contract ${agreement.id}`} session={session} accent="#D97706" />}
    >
      {tab === "dashboard"  && <CorpDashboard agreement={agreement} bookings={accBookings} invoices={accInvoices} setTab={setTab} />}
      {tab === "book"       && <BookStayTab session={session} kind="corporate" account={agreement} onComplete={(next) => next && setTab(next)} />}
      {tab === "bookings"   && (
        selectedBookingId ? (
          <BookingDetail
            booking={accBookings.find((b) => b.id === selectedBookingId)}
            invoices={accInvoices.filter((i) => i.bookingId === selectedBookingId)}
            payments={accPayments.filter((pay) => pay.bookingId === selectedBookingId)}
            viewer={{ type: "corporate", id: agreement.id, name: `${session.displayName} · ${agreement.account}` }}
            palette={p}
            kindLabel="corporate"
            channelLabel={`Corporate · ${agreement.account}`}
            policyText={agreement.cancellationPolicy}
            onBack={() => setSelectedBookingId(null)}
            onOpenInvoices={() => setTab("invoices")}
            onOpenReceipts={() => setTab("receipts")}
          />
        ) : (
          <BookingsList bookings={accBookings} kindLabel="corporate" onSelect={(b) => setSelectedBookingId(b.id)} />
        )
      )}
      {tab === "invoices"   && <InvoicesList invoices={accInvoices} bookings={accBookings} />}
      {tab === "receipts"   && <ReceiptsList payments={accPayments} bookings={accBookings} />}
      {tab === "statement"  && <StatementView account={agreement} kind="corporate" invoices={accInvoices} payments={accPayments} />}
      {tab === "messages"   && <CustomerMessagesTab kind="corporate" account={agreement} session={session} bookings={accBookings} />}
      {tab === "profile"    && <CorporateProfileTab session={session} agreement={agreement} upsertAgreement={upsertAgreement} setSession={setSession} />}
    </PortalLayout>
  );
}

function CorpDashboard({ agreement, bookings, invoices, setTab }) {
  const p = usePalette();
  const inHouse  = bookings.filter((b) => b.status === "in-house").length;
  const upcoming = bookings.filter((b) => b.status === "confirmed").length;
  const ytdNights = agreement.ytdNights || 0;
  const ytdSpend  = agreement.ytdSpend  || 0;
  const targetPct = Math.round((ytdNights / Math.max(1, agreement.targetNights || 1)) * 100);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.amount - (i.paid || 0)), 0);
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="YTD nights" value={ytdNights} hint={`${targetPct}% of target`} color={targetPct >= 80 ? p.success : p.accent} />
        <Stat label="YTD spend"  value={fmtBhd(ytdSpend)}  hint="Across all bookings" color={p.accent} />
        <Stat label="In-house"   value={inHouse}            hint={`${upcoming} upcoming`} />
        <Stat label="Outstanding" value={fmtBhd(outstanding)} hint={overdueCount > 0 ? `${overdueCount} overdue` : "No overdue"} color={overdueCount > 0 ? p.danger : outstanding > 0 ? p.warn : p.success} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Contract summary" className="lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <Detail label="Contract"        value={agreement.id} />
            <Detail label="Term"            value={`${fmtDate(agreement.startsOn)} → ${fmtDate(agreement.endsOn)}`} />
            <Detail label="Payment terms"   value={agreement.paymentTerms || "—"} />
            <Detail label="Credit limit"    value={fmtBhd(agreement.creditLimit || 0)} />
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
            Negotiated daily rates (BHD)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(agreement.dailyRates || {}).map(([k, v]) => (
              <div key={k} className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>{k}</div>
                <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Quick links">
          <QuickAction icon={CalendarDays} label="Book a stay" hint="Multiple rooms · contracted rates" onClick={() => setTab("book")} />
          <QuickAction icon={BedDouble} label="View bookings" hint={`${bookings.length} total`}     onClick={() => setTab("bookings")} />
          <QuickAction icon={FileText}  label="Invoices"      hint={`${invoices.length} folios`}    onClick={() => setTab("invoices")} />
          <QuickAction icon={Wallet}    label="Statement"     hint="Aged ledger · downloadable"     onClick={() => setTab("statement")} />
          <QuickAction icon={UserCircle2} label="Profile"     hint="Manage users & contact details" onClick={() => setTab("profile")} />
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// AgentPortal
// ===========================================================================
function AgentPortal({ session, setSession, pendingNav, consumePendingNav }) {
  const p = usePalette();
  const data = useData();
  const { agencies, bookings, invoices, payments, upsertAgency } = data;
  const agency = agencies.find((a) => a.id === session.accountId);
  const [tab, setTab] = useState("dashboard");
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // Notification-driven nav handoff (see CorporatePortal).
  useEffect(() => {
    if (pendingNav?.tab) {
      setTab(pendingNav.tab);
      if (pendingNav.tab === "bookings" && pendingNav.refId) {
        setSelectedBookingId(pendingNav.refId);
      }
      consumePendingNav?.();
    }
  }, [pendingNav]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab !== "bookings") setSelectedBookingId(null); }, [tab]);

  if (!agency) return <NoAccount p={p} />;

  const accBookings = useMemo(
    () => bookings.filter((b) => b.source === "agent" && b.agencyId === agency.id),
    [bookings, agency.id]
  );
  // All agent-tagged invoices for this agency. Kept for back-compat and for
  // anything that needs the full ledger (e.g. dashboard outstanding totals).
  const accInvoices = useMemo(
    () => invoices.filter((i) => i.clientType === "agent" && i.clientName?.toLowerCase().includes(agency.name.toLowerCase())),
    [invoices, agency]
  );
  // Booking ledger — what the agency owes the hotel for stays. Treat missing
  // `kind` as "booking" so legacy invoices keep working.
  const accBookingInvoices = useMemo(
    () => accInvoices.filter((i) => (i.kind || "booking") === "booking"),
    [accInvoices]
  );
  // Commission ledger — what the hotel owes the agency for bringing the
  // business. Only invoices explicitly tagged `kind: "commission"`.
  const accCommissionInvoices = useMemo(
    () => accInvoices.filter((i) => i.kind === "commission"),
    [accInvoices]
  );
  const bookingIds = new Set(accBookings.map((b) => b.id));
  const accPayments = useMemo(
    () => payments.filter((pay) => bookingIds.has(pay.bookingId)),
    [payments, accBookings] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const tabs = [
    { id: "dashboard",  label: "Dashboard",  icon: Briefcase },
    { id: "book",       label: "Book stay",  icon: CalendarDays },
    { id: "bookings",   label: "Bookings",   icon: BedDouble },
    { id: "invoices",   label: "Invoices",   icon: FileText },
    { id: "receipts",   label: "Receipts",   icon: ReceiptIcon },
    { id: "statement",  label: "Commission", icon: Coins },
    { id: "messages",   label: "Messages",   icon: MessageCircle },
    { id: "profile",    label: "Profile",    icon: UserCircle2 },
  ];

  return (
    <PortalLayout
      session={session} setSession={setSession}
      tabs={tabs} tab={tab} setTab={setTab}
      banner={<AccountBanner kindLabel="Travel Agent" name={agency.name} subtitle={`Commission ${agency.commissionPct}% · Contract ${agency.id}`} session={session} accent="#7C3AED" />}
    >
      {tab === "dashboard" && <AgentDashboard agency={agency} bookings={accBookings} invoices={accInvoices} setTab={setTab} />}
      {tab === "book"      && <BookStayTab session={session} kind="agent" account={agency} onComplete={(next) => next && setTab(next)} />}
      {tab === "bookings"  && (
        selectedBookingId ? (
          <BookingDetail
            booking={accBookings.find((b) => b.id === selectedBookingId)}
            invoices={accBookingInvoices.filter((i) => i.bookingId === selectedBookingId)}
            payments={accPayments.filter((pay) => pay.bookingId === selectedBookingId)}
            viewer={{ type: "agent", id: agency.id, name: `${session.displayName} · ${agency.name}` }}
            palette={p}
            kindLabel="agent"
            channelLabel={`Travel agent · ${agency.name}`}
            policyText={agency.cancellationPolicy}
            onBack={() => setSelectedBookingId(null)}
            onOpenInvoices={() => setTab("invoices")}
            onOpenReceipts={() => setTab("receipts")}
          />
        ) : (
          <BookingsList bookings={accBookings} kindLabel="agent" showCommission onSelect={(b) => setSelectedBookingId(b.id)} />
        )
      )}
      {tab === "invoices"  && <InvoicesList invoices={accBookingInvoices} bookings={accBookings} />}
      {tab === "receipts"  && <ReceiptsList payments={accPayments} bookings={accBookings} />}
      {tab === "statement" && <StatementView account={agency} kind="agent" invoices={accCommissionInvoices} payments={accPayments} ledger="commission" />}
      {tab === "messages"  && <CustomerMessagesTab kind="agent" account={agency} session={session} bookings={accBookings} />}
      {tab === "profile"   && <AgentProfileTab session={session} agency={agency} upsertAgency={upsertAgency} setSession={setSession} />}
    </PortalLayout>
  );
}

function AgentDashboard({ agency, bookings, invoices, setTab }) {
  const p = usePalette();
  const ytdRev = agency.ytdRevenue || 0;
  const ytdComm = agency.ytdCommission || 0;
  const ytdBookings = agency.ytdBookings || bookings.length;
  const targetPct = Math.round((ytdBookings / Math.max(1, agency.targetBookings || 1)) * 100);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.amount - (i.paid || 0)), 0);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="YTD bookings"   value={ytdBookings}        hint={`${targetPct}% of target`} color={targetPct >= 80 ? p.success : p.accent} />
        <Stat label="YTD revenue"    value={fmtBhd(ytdRev)}     hint="Net rates × room-nights" color={p.accent} />
        <Stat label="YTD commission" value={fmtBhd(ytdComm)}    hint={`${agency.commissionPct}% of revenue`} color={p.success} />
        <Stat label="Outstanding"    value={fmtBhd(outstanding)} hint={outstanding > 0 ? "Pending settlement" : "All settled"} color={outstanding > 0 ? p.warn : p.success} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Contract terms" className="lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <Detail label="Contract"         value={agency.id} />
            <Detail label="Term"             value={`${fmtDate(agency.startsOn)} → ${fmtDate(agency.endsOn)}`} />
            <Detail label="Commission %"     value={`${agency.commissionPct}%`} />
            <Detail label="Marketing fund"   value={`${agency.marketingFundPct || 0}%`} />
            <Detail label="Payment terms"    value={agency.paymentTerms || "—"} />
            <Detail label="Credit limit"     value={fmtBhd(agency.creditLimit || 0)} />
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
            Daily net rates (BHD)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(agency.dailyNet || {}).map(([k, v]) => (
              <div key={k} className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>{k}</div>
                <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600, marginTop: 4 }}>{v || "—"}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Quick links">
          <QuickAction icon={CalendarDays} label="Book a stay" hint="Multiple rooms · net rates"     onClick={() => setTab("book")} />
          <QuickAction icon={BedDouble} label="Bookings"     hint={`${bookings.length} total`}    onClick={() => setTab("bookings")} />
          <QuickAction icon={FileText}  label="Invoices"     hint={`${invoices.length} folios`}   onClick={() => setTab("invoices")} />
          <QuickAction icon={Coins}     label="Commission"   hint="Statement & payouts"           onClick={() => setTab("statement")} />
          <QuickAction icon={UserCircle2} label="Profile"    hint="Update contact / users"         onClick={() => setTab("profile")} />
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// MemberPortal — LS Privilege
// ===========================================================================
// ---------------------------------------------------------------------------
// CustomerMessagesTab — Messages tab inside Corporate / Agent / Member
// portals. Shows a thread switcher (General + per-booking threads) on
// the left and the active thread on the right. Auto-marks inbound
// messages as read when the operator opens a thread.
// ---------------------------------------------------------------------------
function CustomerMessagesTab({ kind, account, session, bookings }) {
  const p = usePalette();
  const { messages } = useData();

  // Customer-side viewer identity. The MessageThread component uses this
  // to align bubbles, mark inbound messages read, and stamp outgoing
  // messages with the right name + accountId.
  const viewer = {
    type: kind, // "corporate" | "agent" | "member"
    id:   kind === "member" ? account.id : account.id,
    name: kind === "corporate"
      ? `${session.displayName} · ${account.account || account.name || ""}`
      : kind === "agent"
        ? `${session.displayName} · ${account.name || ""}`
        : session.displayName,
  };

  // Build the thread switcher: one general thread + per-booking threads.
  const generalKey = `account:${kind}:${account.id}`;
  const accountLabel = kind === "corporate" ? account.account : kind === "agent" ? account.name : account.name;
  const threads = useMemo(() => {
    const out = [{
      key: generalKey,
      label: `General · ${accountLabel}`,
      sub: "Account-level questions, requests, follow-ups.",
    }];
    // Show every booking that already has a thread, plus all bookings
    // (so the customer can start a fresh thread on any reservation).
    (bookings || []).forEach((b) => {
      out.push({
        key: `booking:${b.id}`,
        label: `${b.id} · ${b.guest}`,
        sub: `${b.checkIn} → ${b.checkOut} · ${b.nights || "?"}n · ${b.status}`,
      });
    });
    return out;
  }, [bookings, accountLabel, generalKey]);

  // Per-thread unread count (inbound only — anything not from this viewer).
  const unreadByKey = useMemo(() => {
    const out = {};
    (messages || []).forEach((m) => {
      if (m.read) return;
      if (m.fromType === viewer.type) return;
      out[m.threadKey] = (out[m.threadKey] || 0) + 1;
    });
    return out;
  }, [messages, viewer.type]);

  const [activeKey, setActiveKey] = useState(generalKey);
  const activeThread = threads.find((t) => t.key === activeKey) || threads[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-5">
      {/* Thread switcher — sticks on desktop, scrolls inline on mobile */}
      <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Threads
          </div>
          <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.2rem", lineHeight: 1.1, marginTop: 2 }}>
            {threads.length} {threads.length === 1 ? "conversation" : "conversations"}
          </div>
        </div>
        <ul className="py-1" style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "min(560px, 70vh)", overflowY: "auto" }}>
          {threads.map((t) => {
            const active = activeKey === t.key;
            const unread = unreadByKey[t.key] || 0;
            return (
              <li key={t.key}>
                <button
                  onClick={() => setActiveKey(t.key)}
                  className="w-full text-start"
                  style={{
                    padding: "0.7rem 1rem",
                    backgroundColor: active ? `${p.accent}14` : "transparent",
                    borderInlineStart: `3px solid ${active ? p.accent : "transparent"}`,
                    border: "none",
                    borderBottom: `1px solid ${p.border}`,
                    cursor: "pointer", fontFamily: "'Manrope', sans-serif",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = p.bgHover || `${p.accent}10`; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div style={{
                      color: active ? p.accent : p.textPrimary,
                      fontWeight: 600, fontSize: "0.86rem", lineHeight: 1.25,
                    }}>{t.label}</div>
                    {unread > 0 && (
                      <span style={{
                        backgroundColor: "#DC2626", color: "#FFFFFF",
                        padding: "1px 6px", fontSize: "0.6rem", fontWeight: 700,
                        flexShrink: 0,
                      }}>{unread}</span>
                    )}
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 3, lineHeight: 1.4 }}>
                    {t.sub}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Active thread */}
      {activeThread && (
        <MessageThread
          threadKey={activeThread.key}
          viewer={viewer}
          palette={p}
          title={activeThread.label}
          subtitle={activeThread.sub}
          placeholder={
            activeThread.key.startsWith("booking:")
              ? "Ask the front-desk team about this booking…"
              : "Send a question to the hotel team…"
          }
        />
      )}
    </div>
  );
}

function MemberPortal({ session, setSession, pendingNav, consumePendingNav }) {
  const p = usePalette();
  const data = useData();
  const { members, tiers, loyalty, bookings, invoices, payments, updateMember } = data;
  const member = members.find((m) => m.id === session.accountId);
  const [tab, setTab] = useState("dashboard");
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // Notification-driven nav handoff (see CorporatePortal).
  useEffect(() => {
    if (pendingNav?.tab) {
      setTab(pendingNav.tab);
      if (pendingNav.tab === "bookings" && pendingNav.refId) {
        setSelectedBookingId(pendingNav.refId);
      }
      consumePendingNav?.();
    }
  }, [pendingNav]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab !== "bookings") setSelectedBookingId(null); }, [tab]);

  if (!member) return <NoAccount p={p} />;

  const tier = tiers.find((t) => t.id === member.tier);

  const myBookings = useMemo(() => {
    const lower = (member.email || "").toLowerCase();
    // Match three ways: by memberId stamp on bookings the member created
    // (covers "book for someone else"), by guest email (their own stays),
    // and by guest name (legacy data without email).
    return bookings.filter((b) =>
      b.memberId === member.id ||
      (b.email && b.email.toLowerCase() === lower) ||
      (b.guest && b.guest.toLowerCase() === member.name.toLowerCase())
    );
  }, [bookings, member.id, member.email, member.name]);
  const myBookingIds = new Set(myBookings.map((b) => b.id));
  const myInvoices = useMemo(
    () => invoices.filter((i) => myBookingIds.has(i.bookingId)),
    [invoices, myBookings] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const myPayments = useMemo(
    () => payments.filter((pay) => myBookingIds.has(pay.bookingId)),
    [payments, myBookings] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Sparkles },
    { id: "book",      label: "Book stay", icon: CalendarDays },
    { id: "bookings",  label: "Bookings",  icon: BedDouble },
    { id: "invoices",  label: "Folios",    icon: FileText },
    { id: "receipts",  label: "Receipts",  icon: ReceiptIcon },
    { id: "statement", label: "Statement", icon: Wallet },
    { id: "messages",  label: "Messages",  icon: MessageCircle },
    { id: "profile",   label: "Profile",   icon: UserCircle2 },
  ];

  return (
    <PortalLayout
      session={session} setSession={setSession}
      tabs={tabs} tab={tab} setTab={setTab}
      banner={<AccountBanner kindLabel="LS Privilege" name={member.name} subtitle={`${tier?.name || member.tier} member · ${member.id}`} session={session} accent={tier?.color || "#C9A961"} />}
    >
      {tab === "dashboard" && <MemberDashboard member={member} tier={tier} loyalty={loyalty} bookings={myBookings} setTab={setTab} />}
      {tab === "book"      && <BookStayTab session={session} kind="member" account={member} onComplete={(next) => next && setTab(next)} />}
      {tab === "bookings"  && (
        selectedBookingId ? (
          <BookingDetail
            booking={myBookings.find((b) => b.id === selectedBookingId)}
            invoices={myInvoices.filter((i) => i.bookingId === selectedBookingId)}
            payments={myPayments.filter((pay) => pay.bookingId === selectedBookingId)}
            viewer={{ type: "member", id: member.id, name: session.displayName }}
            palette={p}
            kindLabel="guest"
            channelLabel={`LS Privilege · ${tier?.name || member.tier} member`}
            policyText="Free cancellation up to 24h before arrival. Less than 24h: one-night charge."
            onBack={() => setSelectedBookingId(null)}
            onOpenInvoices={() => setTab("invoices")}
            onOpenReceipts={() => setTab("receipts")}
          />
        ) : (
          <BookingsList bookings={myBookings} kindLabel="guest" onSelect={(b) => setSelectedBookingId(b.id)} />
        )
      )}
      {tab === "invoices"  && <InvoicesList invoices={myInvoices} bookings={myBookings} />}
      {tab === "receipts"  && <ReceiptsList payments={myPayments} bookings={myBookings} />}
      {tab === "statement" && <StatementView account={member} kind="member" invoices={myInvoices} payments={myPayments} />}
      {tab === "messages"  && <CustomerMessagesTab kind="member" account={member} session={session} bookings={myBookings} />}
      {tab === "profile"   && <MemberProfileTab session={session} member={member} updateMember={updateMember} setSession={setSession} />}
    </PortalLayout>
  );
}

function MemberDashboard({ member, tier, loyalty, bookings, setTab }) {
  const p = usePalette();
  const tierColor = tier?.color || p.accent;
  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);
  const upcoming = bookings.filter((b) => b.status === "confirmed").length;
  const inHouse  = bookings.filter((b) => b.status === "in-house").length;
  const completed = bookings.filter((b) => b.status === "checked-out").length;
  const totalSpend = bookings.reduce((s, b) => s + (b.total || 0), 0);

  return (
    <div>
      {/* Privilege card */}
      <div className="p-5 mb-6" style={{
        backgroundColor: `${tierColor}10`,
        border: `1px solid ${tierColor}40`,
        borderInlineStart: `4px solid ${tierColor}`,
      }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div style={{ color: tierColor, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              {tier?.name || "Member"} · {tier?.nightsLabel || "—"}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.05, marginTop: 4 }}>
              {member.points.toLocaleString()} points
            </div>
            <div style={{ color: p.textMuted, fontSize: "0.84rem", marginTop: 4 }}>
              ≈ {fmtBhd(redeemable)} redeemable · {member.lifetimeNights} lifetime nights
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(tier?.benefits || []).filter((b) => b.on).slice(0, 4).map((b) => (
              <span key={b.id} style={{
                color: tierColor, backgroundColor: `${tierColor}1A`, border: `1px solid ${tierColor}`,
                padding: "4px 10px", fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif", fontWeight: 600,
              }}>{b.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Upcoming"        value={upcoming} hint="Confirmed bookings" color={p.accent} />
        <Stat label="In-house"        value={inHouse} />
        <Stat label="Completed stays" value={completed} hint="All-time" />
        <Stat label="Lifetime spend"  value={fmtBhd(totalSpend)} hint="Points-eligible" color={p.success} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Tier benefits" className="lg:col-span-2">
          {(tier?.benefits || []).length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No benefits configured for this tier.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {tier.benefits.map((b) => (
                <div key={b.id} className="flex items-start gap-2 p-3" style={{
                  backgroundColor: b.on ? `${tierColor}10` : p.bgPanelAlt,
                  border: `1px solid ${b.on ? tierColor : p.border}`,
                }}>
                  <CheckCircle2 size={14} style={{ color: b.on ? tierColor : p.textMuted, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ color: b.on ? p.textPrimary : p.textMuted, fontSize: "0.84rem", lineHeight: 1.4, textDecoration: b.on ? "none" : "line-through" }}>
                    {b.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Quick links">
          <QuickAction icon={CalendarDays} label="Book a stay" hint="Member rate · earn points"        onClick={() => setTab("book")} />
          <QuickAction icon={BedDouble}  label="My bookings"  hint={`${bookings.length} total`}        onClick={() => setTab("bookings")} />
          <QuickAction icon={FileText}   label="Folios"       hint="Stay receipts and invoices"       onClick={() => setTab("invoices")} />
          <QuickAction icon={Wallet}     label="Statement"    hint="Lifetime ledger"                  onClick={() => setTab("statement")} />
          <QuickAction icon={UserCircle2} label="Profile"     hint="Personal details · password"     onClick={() => setTab("profile")} />
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// Shared list views
// ===========================================================================
function BookingsList({ bookings, kindLabel = "guest", showCommission = false, onSelect }) {
  const p = usePalette();
  if (bookings.length === 0) return <EmptyState label="No bookings yet" hint={`Reservations linked to your ${kindLabel} account will appear here.`} />;

  const total = bookings.reduce((s, b) => s + (b.total || 0), 0);
  const totalNights = bookings.reduce((s, b) => s + (b.nights || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Bookings"      value={bookings.length} />
        <Stat label="Room-nights"   value={totalNights} />
        <Stat label="Total value"   value={fmtBhd(total)} color={p.accent} />
        <Stat label="Average stay"  value={`${(totalNights / Math.max(1, bookings.length)).toFixed(1)} nights`} />
      </div>
      <Card title={`${bookings.length} bookings`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
            <thead>
              <tr style={{ backgroundColor: p.bgPanelAlt }}>
                {["Reference", "Guest", "Suite", "Check-in", "Check-out", "Nights", "Total", showCommission ? "Comm." : null, "Status", onSelect ? "" : null].filter((h) => h !== null).map((h, i) => (
                  <th key={`${h}-${i}`} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const clickable = !!onSelect;
                return (
                  <tr
                    key={b.id}
                    onClick={clickable ? () => onSelect(b) : undefined}
                    style={{
                      borderTop: `1px solid ${p.border}`,
                      cursor: clickable ? "pointer" : "default",
                      transition: "background-color 120ms ease",
                    }}
                    onMouseEnter={(e) => { if (clickable) e.currentTarget.style.backgroundColor = p.bgHover || `${p.accent}10`; }}
                    onMouseLeave={(e) => { if (clickable) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 600 }}>{b.id}</td>
                    <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600 }}>{b.guest}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{ROOM_LABEL[b.roomId] || b.roomId}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(b.checkIn)}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(b.checkOut)}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{b.nights}</td>
                    <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 600 }}>{fmtBhd(b.total)}</td>
                    {showCommission && (
                      <td className="px-4 py-3" style={{ color: p.success, fontWeight: 600 }}>
                        {b.comm != null ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>{fmtBhd(b.comm)}</span>
                            {b.commissionDeducted && (
                              <span style={{
                                color: p.success, backgroundColor: `${p.success}1A`, border: `1px solid ${p.success}40`,
                                padding: "1px 6px", fontSize: "0.54rem", letterSpacing: "0.16em",
                                textTransform: "uppercase", fontWeight: 700,
                              }}>
                                Paid at booking
                              </span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3">{statusChip(p, b.status)}</td>
                    {clickable && (
                      <td className="px-4 py-3 text-end">
                        <span className="inline-flex items-center gap-1" style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                          View <ArrowRight size={11} />
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookingDetail — full reservation view for a customer-side booking. Opens
// when the user clicks a row in BookingsList or arrives via a notification
// click. Renders:
//   • Hero header (guest, suite, dates, status chips)
//   • Stay summary (dates, occupancy, channel, booked-by, notes)
//   • Charges card (rate, extras, taxes, total, paid, balance)
//   • Linked invoices and payment receipts (downloadable)
//   • Cancellation policy (cohort-specific text)
//   • Inline message thread for this booking — guests can chat with the
//     front-desk team without leaving the page.
// ---------------------------------------------------------------------------
function BookingDetail({
  booking, invoices = [], payments = [], extras = [],
  viewer, palette, kindLabel = "guest",
  policyText, channelLabel,
  onBack, onOpenInvoices, onOpenReceipts,
}) {
  const p = palette;
  const { hotelInfo } = useData();
  if (!booking) {
    return (
      <div>
        <BackBar p={p} onBack={onBack} label="Back to bookings" />
        <EmptyState label="Booking not found" hint="This reservation may have been removed or transferred to another account." />
      </div>
    );
  }

  const downloadConfirmation = () => {
    const html = bookingConfirmHtml(booking, { policyText, channelLabel, hotel: hotelInfo });
    downloadHtmlFile(html, `${booking.id}-confirmation.html`);
    pushToast({ message: `Downloaded · ${booking.id}` });
  };
  const downloadInvoice = (inv) => {
    const html = invoiceHtml(inv, [booking], hotelInfo);
    downloadHtmlFile(html, `${inv.id}.html`);
    pushToast({ message: `Downloaded · ${inv.id}` });
  };
  const downloadReceipt = (pay) => {
    const html = receiptHtml(pay, [booking], hotelInfo);
    downloadHtmlFile(html, `${pay.id}.html`);
    pushToast({ message: `Downloaded · ${pay.id}` });
  };

  // Charge breakdown — derived from stored fields. Prefer the explicit
  // `taxAmount` stamp when present; only reverse-compute as a fallback for
  // legacy bookings written before the field existed. When the commission
  // was deducted at booking, `total` is the net obligation and we surface
  // the deduction as its own line so the math reconciles for the booker.
  const subtotal       = (booking.rate || 0) * (booking.nights || 0);
  const extrasList     = Array.isArray(booking.extras) ? booking.extras : extras;
  const extrasSum      = extrasList.reduce((s, e) => s + (Number(e.price) || 0), 0);
  const grandTotal     = Number(booking.total) || 0;
  const commissionCut  = booking.commissionDeducted ? Number(booking.commissionDeductedAmount ?? booking.comm ?? 0) : 0;
  const taxAmount      = (typeof booking.taxAmount === "number")
    ? booking.taxAmount
    : Math.max(0, +(grandTotal + commissionCut - subtotal - extrasSum).toFixed(3));
  const grossBookingTotal = Math.max(0, +(subtotal + extrasSum + taxAmount).toFixed(3));
  const paid           = Number(booking.paid) || 0;
  const balance        = Math.max(0, +(grandTotal - paid).toFixed(3));

  const totalPaidPayments = payments.reduce((s, x) => s + (x.status === "captured" ? (Number(x.amount) || 0) : 0), 0);
  const totalDueInvoices  = invoices.reduce((s, x) => s + Math.max(0, (Number(x.amount) || 0) - (Number(x.paid) || 0)), 0);

  return (
    <div>
      <BackBar p={p} onBack={onBack} label="Back to bookings" />

      {/* Hero */}
      <div className="p-6 mb-5" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, borderInlineStart: `4px solid ${p.accent}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Booking · {booking.id}
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.8rem, 4.2vw, 2.4rem)", color: p.textPrimary, fontWeight: 500, lineHeight: 1.05, marginTop: 4 }}>
              {booking.guest}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2" style={{ color: p.textMuted, fontSize: "0.92rem", fontFamily: "'Manrope', sans-serif" }}>
              <span style={{ color: p.textPrimary, fontWeight: 600 }}>{ROOM_LABEL[booking.roomId] || booking.roomId}</span>
              <span>·</span>
              <span>{fmtDate(booking.checkIn)} → {fmtDate(booking.checkOut)}</span>
              <span>·</span>
              <span>{booking.nights} {booking.nights === 1 ? "night" : "nights"}</span>
              <span>·</span>
              <span>{booking.guests} {booking.guests === 1 ? "guest" : "guests"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusChip(p, booking.status)}
            {booking.paymentStatus && statusChip(p, booking.paymentStatus)}
          </div>
        </div>
      </div>

      {/* 3-col grid: Stay · Charges · Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Stay summary */}
        <Card title="Stay summary" className="lg:col-span-1">
          <div className="space-y-4">
            <Detail label="Check-in"  value={`${fmtDate(booking.checkIn)} · from 14:00`} />
            <Detail label="Check-out" value={`${fmtDate(booking.checkOut)} · by 12:00`} />
            <Detail label="Suite"     value={ROOM_LABEL[booking.roomId] || booking.roomId} />
            <Detail label="Occupancy" value={`${booking.guests} ${booking.guests === 1 ? "guest" : "guests"}`} />
            {channelLabel && <Detail label="Channel" value={channelLabel} />}
            {booking.bookedByName && booking.bookedByEmail && booking.bookedByEmail !== booking.email && (
              <Detail label="Booked by" value={`${booking.bookedByName} · ${booking.bookedByEmail}`} />
            )}
            {booking.email && <Detail label="Guest email" value={booking.email} />}
            {booking.phone && <Detail label="Guest phone" value={booking.phone} />}
            {booking.notes && (
              <div>
                <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>Special requests</div>
                <div style={{ color: p.textPrimary, fontSize: "0.88rem", marginTop: 4, lineHeight: 1.5 }}>{booking.notes}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Charges */}
        <Card title="Charges" className="lg:col-span-1">
          <ChargeRow label={`${ROOM_LABEL[booking.roomId] || booking.roomId} · ${booking.nights} ${booking.nights === 1 ? "night" : "nights"} @ ${fmtBhd(booking.rate)}`} value={fmtBhd(subtotal)} p={p} />
          {extrasList.length > 0 && (
            <>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>
                Extras
              </div>
              {extrasList.map((e, i) => (
                <ChargeRow key={`${e.id || e.title}-${i}`} label={e.title} value={fmtBhd(e.price)} p={p} subtle />
              ))}
            </>
          )}
          {taxAmount > 0 && <ChargeRow label="Taxes & service" value={fmtBhd(taxAmount)} p={p} subtle />}
          <div style={{ borderTop: `1px solid ${p.border}`, marginTop: 14, paddingTop: 12 }}>
            {commissionCut > 0 ? (
              <>
                <ChargeRow label="Booking total" value={fmtBhd(grossBookingTotal)} p={p} subtle />
                <ChargeRow label="Commission deducted" value={`− ${fmtBhd(commissionCut)}`} p={p} success />
                <ChargeRow label="Net due" value={fmtBhd(grandTotal)} p={p} bold accent />
              </>
            ) : (
              <ChargeRow label="Total" value={fmtBhd(grandTotal)} p={p} bold accent />
            )}
            {paid > 0 && <ChargeRow label="Paid" value={fmtBhd(paid)} p={p} success />}
            {balance > 0 && <ChargeRow label="Balance due" value={fmtBhd(balance)} p={p} warn />}
            {balance === 0 && paid > 0 && (
              <div className="flex items-center gap-2 mt-2" style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600 }}>
                <CheckCircle2 size={14} /> Settled in full
              </div>
            )}
          </div>
          {booking.comm != null && (
            <div className="mt-4 pt-3" style={{ borderTop: `1px dashed ${p.border}`, color: p.textMuted, fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif" }}>
              {booking.commissionDeducted ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span>Commission · deducted at booking · paid:</span>
                  <span style={{ color: p.success, fontWeight: 700 }}>{fmtBhd(booking.commissionDeductedAmount ?? booking.comm)}</span>
                  <span style={{
                    color: p.success, backgroundColor: `${p.success}1A`, border: `1px solid ${p.success}40`,
                    padding: "2px 8px", fontSize: "0.6rem", letterSpacing: "0.18em",
                    textTransform: "uppercase", fontWeight: 700,
                  }}>
                    Paid at booking
                  </span>
                </div>
              ) : (
                <>Commission earned: <span style={{ color: p.success, fontWeight: 700 }}>{fmtBhd(booking.comm)}</span></>
              )}
            </div>
          )}
        </Card>

        {/* Actions + policy */}
        <Card title="Actions" className="lg:col-span-1">
          <QuickAction icon={Download} label="Download confirmation" hint="HTML voucher you can print" onClick={downloadConfirmation} />
          {invoices.length > 0 && onOpenInvoices && (
            <QuickAction icon={FileText} label={`View ${invoices.length === 1 ? "invoice" : `${invoices.length} invoices`}`} hint={totalDueInvoices > 0 ? `Outstanding ${fmtBhd(totalDueInvoices)}` : "All invoices settled"} onClick={onOpenInvoices} />
          )}
          {payments.length > 0 && onOpenReceipts && (
            <QuickAction icon={ReceiptIcon} label={`Payment receipts · ${payments.length}`} hint={`Captured ${fmtBhd(totalPaidPayments)}`} onClick={onOpenReceipts} />
          )}
          {(() => {
            // Derive live property contact details so an admin edit in
            // Property Info shows up on every booking detail page. Falls
            // back to the historic literals when hotelInfo isn't loaded.
            const frontDeskPhone = (hotelInfo && hotelInfo.phone) || "+973 1616 8146";
            const frontDeskTel   = `tel:${frontDeskPhone.replace(/[^+\d]/g, "")}`;
            const reservationsEmail = (hotelInfo && (hotelInfo.emailReservations || hotelInfo.email)) || "reservations@thelodgesuites.com";
            const reservationsMail  = `mailto:${reservationsEmail}?subject=${encodeURIComponent(`Booking ${booking.id}`)}`;
            return (
              <>
                <QuickAction icon={Phone} label="Call the front desk" hint={`${frontDeskPhone} · 24h`} onClick={() => { window.location.href = frontDeskTel; }} />
                <QuickAction icon={Mail} label="Email reservations" hint={reservationsEmail} onClick={() => { window.location.href = reservationsMail; }} />
              </>
            );
          })()}
          {policyText && (
            <div className="mt-4 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                Cancellation policy
              </div>
              <div style={{ color: p.textPrimary, fontSize: "0.84rem", marginTop: 4, lineHeight: 1.5 }}>{policyText}</div>
            </div>
          )}
        </Card>
      </div>

      {/* Linked invoices */}
      {invoices.length > 0 && (
        <Card title={`Invoices · ${invoices.length}`} padded={false} className="mb-5">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
              <thead>
                <tr style={{ backgroundColor: p.bgPanelAlt }}>
                  {["Invoice", "Issued", "Due", "Amount", "Paid", "Balance", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const bal = (i.amount || 0) - (i.paid || 0);
                  return (
                    <tr key={i.id} style={{ borderTop: `1px solid ${p.border}` }}>
                      <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 600 }}>{i.id}</td>
                      <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(i.issued)}</td>
                      <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(i.due)}</td>
                      <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600 }}>{fmtBhd(i.amount)}</td>
                      <td className="px-4 py-3" style={{ color: p.success, fontWeight: 600 }}>{fmtBhd(i.paid || 0)}</td>
                      <td className="px-4 py-3" style={{ color: bal > 0 ? p.warn : p.success, fontWeight: 600 }}>{fmtBhd(bal)}</td>
                      <td className="px-4 py-3">{statusChip(p, i.status)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => downloadInvoice(i)} className="inline-flex items-center gap-1.5"
                          style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.3rem 0.65rem", border: `1px solid ${p.accent}`, backgroundColor: "transparent", cursor: "pointer" }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        ><Download size={11} /> Download</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Linked receipts */}
      {payments.length > 0 && (
        <Card title={`Payment receipts · ${payments.length}`} padded={false} className="mb-5">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
              <thead>
                <tr style={{ backgroundColor: p.bgPanelAlt }}>
                  {["Receipt", "Date", "Method", "Amount", "Fee", "Net", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id} style={{ borderTop: `1px solid ${p.border}` }}>
                    <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 600 }}>{pay.id}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(pay.ts)}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted, textTransform: "capitalize" }}>{(pay.method || "—").replace(/-/g, " ")}</td>
                    <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600 }}>{fmtBhd(pay.amount)}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtBhd(pay.fee || 0)}</td>
                    <td className="px-4 py-3" style={{ color: p.success, fontWeight: 600 }}>{fmtBhd(pay.net || pay.amount)}</td>
                    <td className="px-4 py-3">{statusChip(p, pay.status)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => downloadReceipt(pay)} className="inline-flex items-center gap-1.5"
                        style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.3rem 0.65rem", border: `1px solid ${p.accent}`, backgroundColor: "transparent", cursor: "pointer" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      ><Download size={11} /> Download</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Inline message thread for this booking */}
      {viewer && (
        <div>
          <div className="flex items-center gap-2 mb-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <MessageCircle size={12} /> Conversation about this booking
          </div>
          <MessageThread
            threadKey={`booking:${booking.id}`}
            viewer={viewer}
            palette={p}
            title={`${booking.id} · ${booking.guest}`}
            subtitle={`${fmtDate(booking.checkIn)} → ${fmtDate(booking.checkOut)} · ${booking.nights || "?"}n · ${booking.status}`}
            placeholder="Ask the front-desk team about this booking…"
          />
        </div>
      )}
    </div>
  );
}

// Small "← Back" header used by sub-detail views.
function BackBar({ p, onBack, label }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 mb-4"
      style={{
        color: p.textMuted, fontFamily: "'Manrope', sans-serif",
        fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
        fontWeight: 700, backgroundColor: "transparent", border: "none", cursor: "pointer",
        padding: "0.25rem 0",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = p.accent)}
      onMouseLeave={(e) => (e.currentTarget.style.color = p.textMuted)}
    >
      <ChevronLeft size={14} /> {label}
    </button>
  );
}

// One row in the Charges card.
function ChargeRow({ label, value, p, bold = false, subtle = false, accent = false, success = false, warn = false }) {
  const color = accent ? p.accent : success ? p.success : warn ? p.warn : (subtle ? p.textMuted : p.textPrimary);
  return (
    <div className="flex items-center justify-between gap-3" style={{
      fontFamily: "'Manrope', sans-serif",
      fontSize: bold ? "0.95rem" : "0.86rem",
      color,
      fontWeight: bold ? 700 : 500,
      padding: subtle ? "3px 0" : "5px 0",
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function InvoicesList({ invoices, bookings }) {
  const p = usePalette();
  const { hotelInfo } = useData();
  if (invoices.length === 0) return <EmptyState label="No invoices yet" hint="Invoices issued against your account will appear here for download." />;

  const totalDue = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.amount - (i.paid || 0)), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paid || 0), 0);

  const downloadInvoice = (inv) => {
    const html = invoiceHtml(inv, bookings, hotelInfo);
    downloadHtmlFile(html, `${inv.id}.html`);
    pushToast({ message: `Downloaded · ${inv.id}` });
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Invoices"     value={invoices.length} />
        <Stat label="Total billed" value={fmtBhd(invoices.reduce((s, i) => s + (i.amount || 0), 0))} color={p.accent} />
        <Stat label="Total paid"   value={fmtBhd(totalPaid)} color={p.success} />
        <Stat label="Outstanding"  value={fmtBhd(totalDue)}  color={totalDue > 0 ? p.warn : p.success} />
      </div>
      <Card title={`${invoices.length} invoices`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
            <thead>
              <tr style={{ backgroundColor: p.bgPanelAlt }}>
                {["Invoice", "Booking", "Issued", "Due", "Amount", "Paid", "Balance", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const balance = (i.amount || 0) - (i.paid || 0);
                return (
                  <tr key={i.id} style={{ borderTop: `1px solid ${p.border}` }}>
                    <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 600 }}>{i.id}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{i.bookingId || "—"}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(i.issued)}</td>
                    <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(i.due)}</td>
                    <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600 }}>{fmtBhd(i.amount)}</td>
                    <td className="px-4 py-3" style={{ color: p.success, fontWeight: 600 }}>{fmtBhd(i.paid || 0)}</td>
                    <td className="px-4 py-3" style={{ color: balance > 0 ? p.warn : p.success, fontWeight: 600 }}>{fmtBhd(balance)}</td>
                    <td className="px-4 py-3">{statusChip(p, i.status)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => downloadInvoice(i)} className="inline-flex items-center gap-1.5"
                        style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.3rem 0.65rem", border: `1px solid ${p.accent}` }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      ><Download size={11} /> Download</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReceiptsList({ payments, bookings }) {
  const p = usePalette();
  const { hotelInfo } = useData();
  if (payments.length === 0) return <EmptyState label="No receipts yet" hint="Payment receipts for your account will appear here for download." />;

  const captured = payments.filter((p) => p.status === "captured").reduce((s, p) => s + (p.amount || 0), 0);
  const refunded = payments.filter((p) => p.status === "refunded").reduce((s, p) => s + (p.amount || 0), 0);

  const downloadReceipt = (pay) => {
    const html = receiptHtml(pay, bookings, hotelInfo);
    downloadHtmlFile(html, `${pay.id}.html`);
    pushToast({ message: `Downloaded · ${pay.id}` });
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Receipts"   value={payments.length} />
        <Stat label="Captured"   value={fmtBhd(captured)} color={p.success} />
        <Stat label="Refunded"   value={fmtBhd(refunded)} color={refunded > 0 ? p.danger : p.textMuted} />
        <Stat label="Net"        value={fmtBhd(captured - refunded)} color={p.accent} />
      </div>
      <Card title={`${payments.length} receipts`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
            <thead>
              <tr style={{ backgroundColor: p.bgPanelAlt }}>
                {["Receipt", "Date", "Booking", "Method", "Amount", "Fee", "Net", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((pay) => (
                <tr key={pay.id} style={{ borderTop: `1px solid ${p.border}` }}>
                  <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 600 }}>{pay.id}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtDate(pay.ts)}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted }}>{pay.bookingId || "—"}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted, textTransform: "capitalize" }}>{(pay.method || "—").replace(/-/g, " ")}</td>
                  <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600 }}>{fmtBhd(pay.amount)}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted }}>{fmtBhd(pay.fee || 0)}</td>
                  <td className="px-4 py-3" style={{ color: p.success, fontWeight: 600 }}>{fmtBhd(pay.net || pay.amount)}</td>
                  <td className="px-4 py-3">{statusChip(p, pay.status)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => downloadReceipt(pay)} className="inline-flex items-center gap-1.5"
                      style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.3rem 0.65rem", border: `1px solid ${p.accent}` }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    ><Download size={11} /> Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatementView({ account, kind, invoices, payments, ledger = "booking" }) {
  const p = usePalette();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().slice(0, 10));
  const [to,   setTo]   = useState(today);

  // `ledger` controls the rhetoric of the page. "commission" means the
  // money flow is hotel → agent, so we relabel charged/paid/balance to
  // describe commission earned vs paid out. "booking" keeps the
  // traditional AR statement copy.
  const isCommission = ledger === "commission";
  const copy = isCommission
    ? {
        title:           "Commission ledger",
        downloadAction:  "Download commission ledger",
        downloadToast:   "Commission ledger downloaded",
        statCharged:     "Commission earned",
        statPaid:        "Commission paid",
        statBalance:     "Commission owed by hotel",
        rowType:         "Commission invoice",
        filePrefix:      "Commission",
      }
    : {
        title:           "Statement",
        downloadAction:  "Download statement",
        downloadToast:   "Statement downloaded",
        statCharged:     "Charged",
        statPaid:        "Paid",
        statBalance:     "Closing balance",
        rowType:         "Invoice",
        filePrefix:      "Statement",
      };

  const filteredInv = invoices.filter((i) => (!from || i.issued >= from) && (!to || i.issued <= to));
  const filteredPay = isCommission
    // The commission ledger is "hotel pays agent" only — we don't pool the
    // agency's own card-payment activity into this view. The "paid" column
    // is sourced from the invoice's own `paid` amount instead.
    ? []
    : payments.filter((pay) => {
        const d = (pay.ts || "").slice(0, 10);
        return (!from || d >= from) && (!to || d <= to);
      });

  const totalCharged = filteredInv.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid    = filteredInv.reduce((s, i) => s + (i.paid || 0), 0);
  const balance      = totalCharged - totalPaid;

  const downloadStatement = () => {
    const html = statementHtml({ account, kind, from, to, invoices: filteredInv, payments: filteredPay, ledger });
    const fname = `${copy.filePrefix}-${(account.id || account.name).toString().replace(/\s+/g, "_")}-${from}_${to}.html`;
    downloadHtmlFile(html, fname);
    pushToast({ message: copy.downloadToast });
  };

  // Commission ledger sources the "paid" column from the invoice itself
  // (the hotel either settled the commission or it's still outstanding).
  // Booking ledger keeps the original "interleave invoices + payments" view.
  const ledgerRows = isCommission
    ? filteredInv.map((i) => ({ kind: copy.rowType, date: i.issued, ref: i.id, charged: i.amount, paid: i.paid || 0 }))
    : [
        ...filteredInv.map((i) => ({ kind: copy.rowType, date: i.issued, ref: i.id, charged: i.amount, paid: 0 })),
        ...filteredPay.map((pay) => ({ kind: "Payment", date: (pay.ts || "").slice(0, 10), ref: pay.id, charged: 0, paid: pay.amount * (pay.status === "refunded" ? -1 : 1) })),
      ];

  return (
    <div>
      <Card className="mb-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }} />
            </div>
            <div>
              <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }} />
            </div>
            <button onClick={() => { setFrom(new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().slice(0, 10)); setTo(today); }}
              style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.4rem 0.85rem", border: `1px solid ${p.border}` }}
            >Last 3 months</button>
          </div>
          <button onClick={downloadStatement} className="inline-flex items-center gap-1.5"
            style={{ backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, padding: "0.55rem 1rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
          ><Download size={12} /> {copy.downloadAction}</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Window"        value={`${fmtDate(from)} → ${fmtDate(to)}`} />
        <Stat label={copy.statCharged} value={fmtBhd(totalCharged)} color={p.accent} />
        <Stat label={copy.statPaid}    value={fmtBhd(totalPaid)}    color={p.success} />
        <Stat label={copy.statBalance} value={fmtBhd(balance)}      color={balance > 0 ? p.warn : p.success} />
      </div>

      <Card title={`${copy.title} · ${ledgerRows.length} ${ledgerRows.length === 1 ? "row" : "rows"}`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
            <thead>
              <tr style={{ backgroundColor: p.bgPanelAlt }}>
                {["Date", "Type", "Reference", copy.statCharged, copy.statPaid].map((h) => (
                  <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledgerRows
                .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
                .map((row, idx) => (
                  <tr key={idx} style={{ borderTop: `1px solid ${p.border}` }}>
                    <td className="px-4 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap" }}>{fmtDate(row.date)}</td>
                    <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600 }}>{row.kind}</td>
                    <td className="px-4 py-3" style={{ color: p.accent }}>{row.ref}</td>
                    <td className="px-4 py-3" style={{ color: row.charged > 0 ? p.textPrimary : p.textMuted, fontWeight: row.charged > 0 ? 600 : 400 }}>
                      {row.charged > 0 ? fmtBhd(row.charged) : "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: row.paid > 0 ? p.success : row.paid < 0 ? p.danger : p.textMuted, fontWeight: row.paid !== 0 ? 600 : 400 }}>
                      {row.paid !== 0 ? fmtBhd(Math.abs(row.paid)) + (row.paid < 0 ? " (refund)" : "") : "—"}
                    </td>
                  </tr>
                ))}
              {ledgerRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: p.textMuted }}>
                  {isCommission ? "No commission activity in this window." : "No activity in this window."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// Profile tabs
// ===========================================================================
function CorporateProfileTab({ session, agreement, upsertAgreement, setSession }) {
  const p = usePalette();
  const me = (agreement.users || []).find((u) => u.id === session.userId);
  const [draft, setDraft] = useState({
    name: me?.name || agreement.pocName || "",
    email: me?.email || agreement.pocEmail || "",
    phone: me?.phone || agreement.pocPhone || "",
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    if (!me) { pushToast({ message: "Profile editing unavailable for legacy POC accounts", kind: "warn" }); return; }
    upsertAgreement({
      ...agreement,
      users: agreement.users.map((u) => u.id === me.id ? { ...u, ...draft } : u),
    });
    setSession({ ...session, displayName: draft.name, email: draft.email });
    pushToast({ message: "Profile updated" });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Your details">
        <Field label="Name"  value={draft.name}  onChange={(v) => set({ name: v })} />
        <Field label="Email" value={draft.email} onChange={(v) => set({ email: v })} className="mt-4" />
        <Field label="Phone" value={draft.phone} onChange={(v) => set({ phone: v })} className="mt-4" />
        <div className="mt-5 flex justify-end">
          <button onClick={save}
            style={{ backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, padding: "0.55rem 1.1rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          ><Save size={11} style={{ display: "inline", marginInlineEnd: 6 }} /> Save changes</button>
        </div>
      </Card>

      <PasswordCard
        currentValue={me?.password}
        onSave={(newPw) => {
          if (!me) { pushToast({ message: "Password change unavailable for legacy POC", kind: "warn" }); return; }
          upsertAgreement({
            ...agreement,
            users: agreement.users.map((u) => u.id === me.id ? { ...u, password: newPw, passwordUpdatedAt: new Date().toISOString() } : u),
          });
          pushToast({ message: "Password updated" });
        }}
      />

      <Card title="Account team" className="lg:col-span-2">
        {(agreement.users || []).length === 0 ? (
          <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No additional users registered for this account.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agreement.users.map((u) => (
              <div key={u.id} className="p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
                <div style={{ color: p.textPrimary, fontWeight: 600 }}>{u.name}</div>
                <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{u.email}</div>
                <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginTop: 6 }}>
                  {u.role}{u.id === me?.id ? " · you" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AgentProfileTab({ session, agency, upsertAgency, setSession }) {
  const p = usePalette();
  const me = (agency.users || []).find((u) => u.id === session.userId);
  const [draft, setDraft] = useState({
    name: me?.name || agency.pocName || "",
    email: me?.email || agency.pocEmail || "",
    phone: me?.phone || agency.pocPhone || "",
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    if (!me) { pushToast({ message: "Profile editing unavailable for legacy POC accounts", kind: "warn" }); return; }
    upsertAgency({
      ...agency,
      users: agency.users.map((u) => u.id === me.id ? { ...u, ...draft } : u),
    });
    setSession({ ...session, displayName: draft.name, email: draft.email });
    pushToast({ message: "Profile updated" });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Your details">
        <Field label="Name"  value={draft.name}  onChange={(v) => set({ name: v })} />
        <Field label="Email" value={draft.email} onChange={(v) => set({ email: v })} className="mt-4" />
        <Field label="Phone" value={draft.phone} onChange={(v) => set({ phone: v })} className="mt-4" />
        <div className="mt-5 flex justify-end">
          <button onClick={save}
            style={{ backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, padding: "0.55rem 1.1rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
          ><Save size={11} style={{ display: "inline", marginInlineEnd: 6 }} /> Save changes</button>
        </div>
      </Card>

      <PasswordCard
        currentValue={me?.password}
        onSave={(newPw) => {
          if (!me) { pushToast({ message: "Password change unavailable for legacy POC", kind: "warn" }); return; }
          upsertAgency({
            ...agency,
            users: agency.users.map((u) => u.id === me.id ? { ...u, password: newPw, passwordUpdatedAt: new Date().toISOString() } : u),
          });
          pushToast({ message: "Password updated" });
        }}
      />
    </div>
  );
}

function MemberProfileTab({ session, member, updateMember, setSession }) {
  const p = usePalette();
  const data = useData();
  const [draft, setDraft] = useState({
    name: member.name, email: member.email, phone: member.phone, country: member.country,
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    updateMember(member.id, draft);
    setSession({ ...session, displayName: draft.name, email: draft.email });
    pushToast({ message: "Profile updated" });
  };

  // Resolve the live tier definition so the membership pass picks up benefits
  // and colour straight from the loyalty programme settings.
  const tierMeta = useMemo(
    () => (data.tiers || []).find((t) => t.id === member.tier) || null,
    [data.tiers, member.tier]
  );

  return (
    <div className="space-y-5">
      <MembershipPassCard member={member} tierMeta={tierMeta} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Your details">
          <Field label="Name"     value={draft.name}    onChange={(v) => set({ name: v })} />
          <Field label="Email"    value={draft.email}   onChange={(v) => set({ email: v })} className="mt-4" />
          <Field label="Phone"    value={draft.phone}   onChange={(v) => set({ phone: v })} className="mt-4" />
          <Field label="Country"  value={draft.country} onChange={(v) => set({ country: v })} className="mt-4" />
          <div className="mt-5 flex justify-end">
            <button onClick={save}
              style={{ backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, padding: "0.55rem 1.1rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
            ><Save size={11} style={{ display: "inline", marginInlineEnd: 6 }} /> Save changes</button>
          </div>
        </Card>

        <PasswordCard
          currentValue={member.password}
          onSave={(newPw) => {
            updateMember(member.id, { password: newPw, passwordUpdatedAt: new Date().toISOString() });
            pushToast({ message: "Password updated" });
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MembershipPassCard — visual LS Privilege wallet card + actions to download
// (.pkpass and PNG) and share (WhatsApp · Email · system share · copy link).
//
// The .pkpass blob is generated client-side from a structurally valid pass.json
// + manifest.json + brand assets bundled into a STORE-method ZIP. Apple Wallet
// requires the manifest to be PKCS#7-signed with an Apple Pass Type ID cert,
// which only a server-side signing service can do — so the bundle ships with a
// placeholder "signature" file. The pkpass loads correctly in every previewer
// and is one server-side signing call away from a Wallet-installable pass.
// ---------------------------------------------------------------------------
function MembershipPassCard({ member, tierMeta }) {
  const p = usePalette();
  const { hotelInfo } = useData();
  // Property name shown next to the member ID — read from the live admin
  // record so a rename in Property Info propagates here. Falls back to the
  // membership-pass stub when hotelInfo isn't available.
  const hotelName = (hotelInfo && hotelInfo.name) || hotel.name;
  const tier = tierVisuals(member.tier);
  const [busy, setBusy] = useState(null); // "pkpass" | "png" | "share"
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  const slug = (member.name || "member").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const downloadPkpass = async () => {
    if (busy) return;
    setBusy("pkpass");
    try {
      const blob = await buildPkpassBlob({ member, tierMeta, hotel: hotelInfo });
      downloadBlob(blob, `${slug}-${member.id}.pkpass`);
      pushToast({ message: "Membership pass downloaded · open it on iPhone to add to Wallet" });
    } catch (e) {
      pushToast({ message: "Couldn't generate pass — try a desktop browser", kind: "warn" });
    } finally { setBusy(null); }
  };

  const downloadPng = async () => {
    if (busy) return;
    setBusy("png");
    try {
      const bytes = await buildMembershipCardPng({ member, tierMeta, hotel: hotelInfo });
      const blob = new Blob([bytes], { type: "image/png" });
      downloadBlob(blob, `${slug}-${member.id}-card.png`);
      pushToast({ message: "Card image downloaded" });
    } catch (e) {
      pushToast({ message: "Couldn't render card image", kind: "warn" });
    } finally { setBusy(null); }
  };

  const shareSystem = async () => {
    if (busy) return;
    setBusy("share");
    try {
      // Build both the pkpass and the PNG so the system share sheet has
      // attachable files on platforms that support `navigator.canShare({files})`.
      const passBlob = await buildPkpassBlob({ member, tierMeta, hotel: hotelInfo });
      const pngBytes = await buildMembershipCardPng({ member, tierMeta, hotel: hotelInfo });
      const passFile = new File([passBlob], `${slug}-${member.id}.pkpass`, { type: "application/vnd.apple.pkpass" });
      const pngFile  = new File([pngBytes], `${slug}-${member.id}.png`,    { type: "image/png" });
      const ok = await nativeShare({ member, files: [passFile, pngFile], hotel: hotelInfo });
      if (!ok) {
        // Fallback: open the share menu so the operator picks WhatsApp/Email/etc.
        setShareMenuOpen(true);
      } else {
        setShareMenuOpen(false);
      }
    } catch (e) {
      setShareMenuOpen(true);
    } finally { setBusy(null); }
  };

  const openWhatsApp = () => {
    window.open(whatsAppShareUrl({ member, hotel: hotelInfo }), "_blank", "noopener,noreferrer");
    setShareMenuOpen(false);
    pushToast({ message: "Tip · download the .pkpass first to attach in WhatsApp" });
  };

  const openEmail = () => {
    window.location.href = emailShareUrl({ member, hotel: hotelInfo });
    setShareMenuOpen(false);
    pushToast({ message: "Tip · download the .pkpass first to attach to the email" });
  };

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText({ member, hotel: hotelInfo }));
      pushToast({ message: "Copied to clipboard" });
    } catch {
      pushToast({ message: "Clipboard not available — copy manually", kind: "warn" });
    }
    setShareMenuOpen(false);
  };

  // Brand-aligned button style for the action row. Pulled out so all five
  // buttons stay visually consistent.
  const actionBtn = (primary = false) => ({
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "0.6rem 1rem",
    backgroundColor: primary ? p.accent : "transparent",
    color: primary ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textPrimary,
    border: `1px solid ${primary ? p.accent : p.border}`,
    fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
    cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
    whiteSpace: "nowrap",
  });

  return (
    <Card title={`LS Privilege membership pass · ${tier.label}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-6 items-start">
        {/* Visual card preview — mirrors what the .pkpass / PNG download looks like */}
        <div
          className="relative overflow-hidden flex-shrink-0"
          style={{
            width: 320, height: 506,
            background: "linear-gradient(180deg, #15161A 0%, #1F2026 100%)",
            border: `1px solid ${tier.deep}`,
            boxShadow: "0 24px 48px -16px rgba(0,0,0,0.6)",
          }}
        >
          {/* Tier band */}
          <div style={{ height: 6, backgroundColor: tier.accent }} />
          {/* Header */}
          <div className="px-5 pt-5 flex items-start justify-between">
            <div>
              <div style={{ color: tier.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.56rem", letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 700 }}>
                {hotelName}
              </div>
              <div style={{ color: "#FEF8E6", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.45rem", marginTop: 2, lineHeight: 1 }}>
                LS Privilege
              </div>
            </div>
            <div style={{ color: tier.accent, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.85rem", lineHeight: 1, textAlign: "right" }}>
              {tier.label}
            </div>
          </div>

          <div className="mx-5 my-4" style={{ height: 1, backgroundColor: "rgba(201,169,97,0.30)" }} />

          {/* Member name */}
          <div className="px-5">
            <div style={{
              color: "#FEF8E6", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              fontSize: "1.65rem", lineHeight: 1.1,
            }}>{member.name}</div>
          </div>

          {/* ID + points */}
          <div className="px-5 mt-5 flex items-end justify-between">
            <div>
              <div style={{ color: tier.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Member ID
              </div>
              <div style={{ color: "#FEF8E6", fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", fontWeight: 700, marginTop: 3, letterSpacing: "0.04em" }}>
                {member.id}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: tier.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Points
              </div>
              <div style={{ color: "#FEF8E6", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.55rem", lineHeight: 1, marginTop: 2 }}>
                {(member.points || 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Joined + nights */}
          <div className="px-5 mt-5 flex items-end justify-between">
            <div>
              <div style={{ color: tier.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Member since
              </div>
              <div style={{ color: "#FEF8E6", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1rem", marginTop: 2 }}>
                {member.joined ? new Date(member.joined).toLocaleDateString("en-GB", { year: "numeric", month: "short" }) : "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: tier.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Lifetime nights
              </div>
              <div style={{ color: "#FEF8E6", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1rem", marginTop: 2 }}>
                {member.lifetimeNights || 0}
              </div>
            </div>
          </div>

          {/* QR area (decorative — the real QR is rendered by Apple Wallet from the pass.json) */}
          <div className="absolute" style={{ left: "50%", bottom: 24, transform: "translateX(-50%)" }}>
            <div style={{ width: 124, height: 124, backgroundColor: "#FEF8E6", padding: 8 }}>
              <div style={{
                width: "100%", height: "100%",
                background: `repeating-linear-gradient(45deg, #15161A 0 5px, transparent 5px 10px),
                             repeating-linear-gradient(-45deg, #15161A 0 5px, transparent 5px 10px)`,
                opacity: 0.8,
              }} />
            </div>
            <div style={{ color: tier.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.5rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, textAlign: "center", marginTop: 6 }}>
              Scan at front desk
            </div>
          </div>
        </div>

        {/* Right column: copy + actions */}
        <div>
          <p style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", lineHeight: 1.6 }}>
            Save your LS Privilege card as an image and share it anywhere. Front-desk colleagues at{" "}
            <strong style={{ color: p.textPrimary }}>{hotelName}</strong> will look you up by the QR code or your member ID{" "}
            <strong style={{ color: p.accent, letterSpacing: "0.04em" }}>{member.id}</strong>.
          </p>

          {/* Honest disclosure — Apple Wallet add requires server-side signing.
              The placeholder signature in the bundled .pkpass keeps the file
              structurally valid for inspection but iOS won't add it to Wallet
              until the hotel's Pass Type ID signing service is wired up. */}
          <div className="mt-4 p-3 flex items-start gap-3" style={{
            backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`,
            borderInlineStart: `3px solid ${p.warn}`,
          }}>
            <AlertCircle size={14} style={{ color: p.warn, marginTop: 2, flexShrink: 0 }} />
            <div style={{ color: p.textSecondary, fontSize: "0.82rem", lineHeight: 1.55 }}>
              <strong style={{ color: p.textPrimary }}>Apple Wallet pending.</strong> Adding to Wallet needs a signature from
              {" "}{hotelName}'s Apple Pass Type ID certificate, which lives on a hotel signing service that isn't wired up yet.
              Until then, use <em>Save as image</em> or <em>Share</em> below — they work on every device.
            </div>
          </div>

          {/* Primary actions — the channels that actually work today */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={downloadPng} disabled={!!busy} style={actionBtn(true)}>
              <ImageIcon size={13} /> {busy === "png" ? "Rendering…" : "Save as image"}
            </button>
            <button onClick={shareSystem} disabled={!!busy} style={actionBtn()}>
              <Share2 size={13} /> {busy === "share" ? "Preparing…" : "Share"}
            </button>
            <button onClick={openWhatsApp} disabled={!!busy} style={actionBtn()}>
              <MessageCircle size={13} /> WhatsApp
            </button>
            <button onClick={openEmail} disabled={!!busy} style={actionBtn()}>
              <Mail size={13} /> Email
            </button>
            <button onClick={copyShareText} disabled={!!busy} style={actionBtn()}>
              <Copy size={13} /> Copy details
            </button>
          </div>

          {/* Secondary action — unsigned .pkpass for IT / signing-pipeline use */}
          <div className="mt-3 flex flex-wrap items-center gap-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", color: p.textMuted }}>
            <button
              onClick={downloadPkpass}
              disabled={!!busy}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", border: "none",
                color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase",
                fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                textDecoration: "underline", textUnderlineOffset: 4, opacity: busy ? 0.6 : 1,
                padding: 0,
              }}
            >
              <Wallet size={11} /> {busy === "pkpass" ? "Building…" : "Download .pkpass (unsigned)"}
            </button>
            <span style={{ fontSize: "0.7rem" }}>For inspection or your IT signing pipeline.</span>
          </div>

          {/* Fallback share menu — surfaces when Web Share API is unavailable
              and we want to nudge the user to an explicit channel. */}
          {shareMenuOpen && (
            <div className="mt-3 p-3" style={{
              backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`,
              borderInlineStart: `3px solid ${p.accent}`,
            }}>
              <div className="flex items-start justify-between gap-3">
                <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.5 }}>
                  System share isn't available on this device. Use one of the channel buttons above — WhatsApp, Email or Copy details.
                </div>
                <button onClick={() => setShareMenuOpen(false)} style={{ color: p.textMuted, padding: 2 }} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Helpful pro-tips */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
            <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div className="flex items-center gap-2 mb-1" style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                <ImageIcon size={11} /> Save as image
              </div>
              <div style={{ color: p.textSecondary, lineHeight: 1.55 }}>
                Best universal option — a high-res PNG that works on every phone and chat app. Front desk can scan or read your member ID directly off the image.
              </div>
            </div>
            <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div className="flex items-center gap-2 mb-1" style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                <Wallet size={11} /> Wallet status
              </div>
              <div style={{ color: p.textSecondary, lineHeight: 1.55 }}>
                Apple Wallet add-to-pass needs the hotel's Pass Type ID signing service. Once that goes live, the same button generates a Wallet-installable pass with no UI change.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PasswordCard({ currentValue, onSave }) {
  const p = usePalette();
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [error,   setError]   = useState(null);

  const submit = () => {
    setError(null);
    if (!current || !next || !confirm) { setError("Fill in all three fields."); return; }
    if (current !== currentValue) { setError("Current password doesn't match."); return; }
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setError("New password doesn't match confirmation."); return; }
    onSave(next);
    setCurrent(""); setNext(""); setConfirm("");
  };

  return (
    <Card title="Change password">
      <div className="space-y-4">
        <PwField label="Current password" value={current} onChange={setCurrent} show={showPw} setShow={setShowPw} />
        <PwField label="New password"     value={next}    onChange={setNext}    show={showPw} setShow={setShowPw} />
        <PwField label="Confirm new password" value={confirm} onChange={setConfirm} show={showPw} setShow={setShowPw} />
        {error && (
          <div className="flex items-center gap-2 p-3" style={{
            backgroundColor: `${p.danger}10`, border: `1px solid ${p.danger}40`,
            color: p.danger, fontSize: "0.84rem",
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={submit}
            style={{ backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, padding: "0.55rem 1.1rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
          ><Lock size={11} style={{ display: "inline", marginInlineEnd: 6 }} /> Update password</button>
        </div>
      </div>
    </Card>
  );
}

function PwField({ label, value, onChange, show, setShow }) {
  const p = usePalette();
  return (
    <div>
      <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>{label}</label>
      <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 outline-none"
          style={{
            backgroundColor: "transparent", color: p.textPrimary,
            padding: "0.6rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
            border: "none", minWidth: 0,
          }}
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center px-3" style={{ color: p.textMuted, borderInlineStart: `1px solid ${p.border}` }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Small utilities used by all three portals
// ===========================================================================
function AccountBanner({ kindLabel, name, subtitle, session, accent }) {
  const p = usePalette();
  return (
    <div className="px-6 md:px-10 py-6" style={{
      backgroundColor: `${accent}10`,
      borderBottom: `1px solid ${p.border}`,
      borderTop: `1px solid ${p.border}`,
    }}>
      <div className="max-w-[1400px] mx-auto flex items-end justify-between flex-wrap gap-4">
        <div>
          <div style={{ color: accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 700 }}>
            {kindLabel}
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.1rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.05, marginTop: 4 }}>
            {name}
          </h2>
          <div style={{ color: p.textMuted, fontSize: "0.84rem", marginTop: 4 }}>
            {subtitle}
          </div>
        </div>
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
          Signed in as <strong style={{ color: p.textPrimary }}>{session.displayName}</strong> · {session.email}
        </div>
      </div>
    </div>
  );
}

function NoAccount({ p }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <AlertCircle size={28} style={{ color: p.danger, margin: "0 auto" }} />
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: p.textPrimary, marginTop: 12 }}>
        Account not found
      </h2>
      <p style={{ color: p.textMuted, marginTop: 6 }}>
        We couldn't load your account. Please sign out and try again, or contact front office.
      </p>
    </div>
  );
}

function Detail({ label, value }) {
  const p = usePalette();
  return (
    <div>
      <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>{label}</div>
      <div style={{ color: p.textPrimary, fontSize: "0.92rem", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", className = "", placeholder }) {
  const p = usePalette();
  return (
    <div className={className}>
      <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>{label}</label>
      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full outline-none"
        style={{
          backgroundColor: p.inputBg, color: p.textPrimary,
          border: `1px solid ${p.border}`, padding: "0.6rem 0.7rem",
          fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
        }}
      />
    </div>
  );
}

function QuickAction({ icon: Icon, label, hint, onClick }) {
  const p = usePalette();
  return (
    <button
      onClick={onClick}
      className="w-full text-start flex items-center gap-3 p-3 transition-colors"
      style={{ backgroundColor: "transparent", border: `1px solid ${p.border}`, marginTop: 6, cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; e.currentTarget.style.borderColor = p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = p.border; }}
    >
      <Icon size={16} style={{ color: p.accent, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div style={{ color: p.textPrimary, fontSize: "0.86rem", fontWeight: 600 }}>{label}</div>
        <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{hint}</div>
      </div>
      <ArrowRight size={14} style={{ color: p.textMuted }} />
    </button>
  );
}

function EmptyState({ label, hint }) {
  const p = usePalette();
  return (
    <div className="p-12 text-center" style={{ border: `1px dashed ${p.border}`, color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: p.textPrimary, marginBottom: 6 }}>
        {label}
      </div>
      <div>{hint}</div>
    </div>
  );
}

// ===========================================================================
// HTML builders for downloadable invoice / receipt / statement
// ===========================================================================
// Default property identity used when a doc helper is invoked without an
// explicit hotel argument (e.g. legacy callers). Live values flow in from
// `useData().hotelInfo` via the React components that build these docs.
const FALLBACK_HOTEL = {
  name:    "The Lodge Suites",
  address: "Building 916, Road 4019, Block 340",
  area:    "Juffair · Manama",
  country: "Bahrain",
  phone:   "+973 1616 8146",
  cr: "", vat: "",
};

function docShell({ title, body, hotel }) {
  const H = hotel || FALLBACK_HOTEL;
  const legal = legalLine(H);
  const footerLine = [
    H.name && `<strong>${esc(H.name)}</strong>`,
    H.address && esc(H.address),
    H.area && esc(H.area),
    H.country && esc(H.country),
    H.phone && esc(H.phone),
    legal && esc(legal),
  ].filter(Boolean).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body { margin: 0; background: #FAF7F0; font-family: -apple-system, "Manrope", Arial, sans-serif; color: #26282E; }
    .wrap { max-width: 760px; margin: 0 auto; padding: 32px; }
    .panel { background: #fff; border: 1px solid rgba(154,126,64,0.20); padding: 36px; }
    h1, h2 { font-family: "Cormorant Garamond", Georgia, serif; color: #15161A; margin: 0; font-weight: 500; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; margin-top: 8px; }
    .eyebrow { font-size: 11px; letter-spacing: 0.28em; text-transform: uppercase; color: #9A7E40; font-weight: 700; }
    .muted { color: #6B665C; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
    th { text-align: start; padding: 10px 12px; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #9A7E40; font-weight: 700; background: #F5F1E8; border-bottom: 1px solid rgba(154,126,64,0.20); }
    td { padding: 10px 12px; border-top: 1px solid rgba(154,126,64,0.14); }
    .total { font-family: "Cormorant Garamond", Georgia, serif; font-size: 22px; color: #9A7E40; font-weight: 600; }
    .footer { color: #6B665C; font-size: 11px; text-align: center; padding-top: 24px; }
  </style></head><body><div class="wrap"><div class="panel">${body}</div>
  <div class="footer">${footerLine}</div></div></body></html>`;
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function invoiceHtml(inv, bookings, hotel) {
  const b = bookings.find((x) => x.id === inv.bookingId);
  return docShell({
    hotel,
    title: inv.id,
    body: `
    <div class="eyebrow">Invoice</div>
    <h1>${esc(inv.id)}</h1>
    <div class="muted" style="margin-top:6px;">Issued ${esc(fmtDate(inv.issued))} · Due ${esc(fmtDate(inv.due))}</div>
    <table>
      <tr><th>Client</th><td>${esc(inv.clientName)} · ${esc(inv.clientType)}</td></tr>
      <tr><th>Booking</th><td>${esc(inv.bookingId || "—")}${b ? ` · ${esc(b.guest)} · ${esc(ROOM_LABEL[b.roomId] || b.roomId)} · ${esc(fmtDate(b.checkIn))} → ${esc(fmtDate(b.checkOut))}` : ""}</td></tr>
      <tr><th>Status</th><td>${esc(inv.status)}</td></tr>
    </table>
    <table>
      <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
      <tr><td>${b ? `Stay · ${b.nights} room-nights · ${esc(ROOM_LABEL[b.roomId] || b.roomId)}` : "Charges"}</td><td style="text-align:right;">${esc(fmtBhd(inv.amount))}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right;" class="total">${esc(fmtBhd(inv.amount))}</td></tr>
      <tr><td>Paid</td><td style="text-align:right;color:#16A34A;font-weight:700;">${esc(fmtBhd(inv.paid || 0))}</td></tr>
      <tr><td>Balance due</td><td style="text-align:right;color:#9A3A30;font-weight:700;">${esc(fmtBhd((inv.amount || 0) - (inv.paid || 0)))}</td></tr>
    </table>
    `,
  });
}

function bookingConfirmHtml(b, { policyText, channelLabel, hotel } = {}) {
  const subtotal       = (b.rate || 0) * (b.nights || 0);
  const extrasList     = Array.isArray(b.extras) ? b.extras : [];
  const extrasSum      = extrasList.reduce((s, e) => s + (Number(e.price) || 0), 0);
  const grandTotal     = Number(b.total) || 0;
  const commissionCut  = b.commissionDeducted ? Number(b.commissionDeductedAmount ?? b.comm ?? 0) : 0;
  const taxAmount      = (typeof b.taxAmount === "number")
    ? b.taxAmount
    : Math.max(0, +(grandTotal + commissionCut - subtotal - extrasSum).toFixed(3));
  const grossBookingTotal = Math.max(0, +(subtotal + extrasSum + taxAmount).toFixed(3));
  const paid           = Number(b.paid) || 0;
  const balance        = Math.max(0, +(grandTotal - paid).toFixed(3));
  const phone = (hotel && hotel.phone) || "+973 1616 8146";
  const front = (hotel && hotel.email) || "reservations@thelodgesuites.com";
  return docShell({
    hotel,
    title: `${b.id} · Confirmation`,
    body: `
    <div class="eyebrow">Booking confirmation</div>
    <h1>${esc(b.id)}</h1>
    <h2>${esc(b.guest)}</h2>
    <div class="muted" style="margin-top:6px;">${esc(ROOM_LABEL[b.roomId] || b.roomId)} · ${esc(fmtDate(b.checkIn))} → ${esc(fmtDate(b.checkOut))} · ${esc(b.nights)} ${b.nights === 1 ? "night" : "nights"} · ${esc(b.guests)} ${b.guests === 1 ? "guest" : "guests"}</div>
    <table>
      <tr><th>Status</th><td style="text-transform:capitalize;">${esc(b.status)}</td></tr>
      <tr><th>Payment</th><td style="text-transform:capitalize;">${esc(b.paymentStatus || "—")}</td></tr>
      ${channelLabel ? `<tr><th>Channel</th><td>${esc(channelLabel)}</td></tr>` : ""}
      <tr><th>Check-in</th><td>${esc(fmtDate(b.checkIn))} · from 14:00</td></tr>
      <tr><th>Check-out</th><td>${esc(fmtDate(b.checkOut))} · by 12:00</td></tr>
      ${b.email ? `<tr><th>Guest email</th><td>${esc(b.email)}</td></tr>` : ""}
      ${b.phone ? `<tr><th>Guest phone</th><td>${esc(b.phone)}</td></tr>` : ""}
      ${b.bookedByName ? `<tr><th>Booked by</th><td>${esc(b.bookedByName)}${b.bookedByEmail ? ` · ${esc(b.bookedByEmail)}` : ""}</td></tr>` : ""}
      ${b.notes ? `<tr><th>Special requests</th><td>${esc(b.notes)}</td></tr>` : ""}
    </table>
    <table>
      <tr><th>Charge</th><th style="text-align:right;">Amount</th></tr>
      <tr><td>${esc(ROOM_LABEL[b.roomId] || b.roomId)} · ${esc(b.nights)} ${b.nights === 1 ? "night" : "nights"} @ ${esc(fmtBhd(b.rate))}</td><td style="text-align:right;">${esc(fmtBhd(subtotal))}</td></tr>
      ${extrasList.map((e) => `<tr><td>Extra · ${esc(e.title)}</td><td style="text-align:right;">${esc(fmtBhd(e.price))}</td></tr>`).join("")}
      ${taxAmount > 0 ? `<tr><td>Taxes &amp; service</td><td style="text-align:right;">${esc(fmtBhd(taxAmount))}</td></tr>` : ""}
      ${commissionCut > 0 ? `<tr><td>Booking total</td><td style="text-align:right;">${esc(fmtBhd(grossBookingTotal))}</td></tr>` : ""}
      ${commissionCut > 0 ? `<tr><td>Commission deducted</td><td style="text-align:right;color:#16A34A;font-weight:700;">− ${esc(fmtBhd(commissionCut))}</td></tr>` : ""}
      <tr><td><strong>${commissionCut > 0 ? "Net due" : "Total"}</strong></td><td style="text-align:right;" class="total">${esc(fmtBhd(grandTotal))}</td></tr>
      ${paid > 0 ? `<tr><td>Paid</td><td style="text-align:right;color:#16A34A;font-weight:700;">${esc(fmtBhd(paid))}</td></tr>` : ""}
      ${balance > 0 ? `<tr><td>Balance due</td><td style="text-align:right;color:#9A3A30;font-weight:700;">${esc(fmtBhd(balance))}</td></tr>` : ""}
    </table>
    ${policyText ? `<div class="muted" style="margin-top:18px;font-size:13px;line-height:1.55;"><strong style="color:#9A7E40;letter-spacing:0.18em;text-transform:uppercase;font-size:11px;display:block;margin-bottom:4px;">Cancellation policy</strong>${esc(policyText)}</div>` : ""}
    <div class="muted" style="margin-top:18px;font-size:12px;">Front desk: ${esc(phone)} (24h) · ${esc(front)}</div>
    `,
  });
}

function receiptHtml(pay, bookings, hotel) {
  const b = bookings.find((x) => x.id === pay.bookingId);
  return docShell({
    hotel,
    title: pay.id,
    body: `
    <div class="eyebrow">Payment receipt</div>
    <h1>${esc(pay.id)}</h1>
    <div class="muted" style="margin-top:6px;">Captured ${esc(fmtDate(pay.ts))}</div>
    <table>
      <tr><th>Booking</th><td>${esc(pay.bookingId || "—")}${b ? ` · ${esc(b.guest)} · ${esc(fmtDate(b.checkIn))} → ${esc(fmtDate(b.checkOut))}` : ""}</td></tr>
      <tr><th>Method</th><td style="text-transform:capitalize;">${esc((pay.method || "—").replace(/-/g, " "))}</td></tr>
      <tr><th>Status</th><td>${esc(pay.status)}</td></tr>
    </table>
    <table>
      <tr><th>Item</th><th style="text-align:right;">Amount</th></tr>
      <tr><td>Gross</td><td style="text-align:right;">${esc(fmtBhd(pay.amount))}</td></tr>
      <tr><td>Processing fee</td><td style="text-align:right;color:#6B665C;">${esc(fmtBhd(pay.fee || 0))}</td></tr>
      <tr><td><strong>Net to property</strong></td><td style="text-align:right;" class="total">${esc(fmtBhd(pay.net || pay.amount))}</td></tr>
    </table>
    `,
  });
}

// ===========================================================================
// BookStayTab — multi-room booking + extras + immediate confirmation
// ===========================================================================
//
// Three flavours of rate look-up depending on `kind`:
//   corporate → agreement.dailyRates / monthlyRates (per-account contract)
//   agent     → agency.dailyNet      / monthlyNet
//   member    → public rack rate from rooms[] minus tier discount (5/10/15%)
//
// Each booking row creates one record in the bookings store. Extras are
// attached to the lead row. The store then drives every other tab (Bookings,
// Invoices, Statements, Dashboard KPIs) — no extra plumbing required.
//
// 4-step wizard mirrors the public booking modal (Dates · Suite · Extras ·
// Confirm) with a sticky "Your reservation" rail showing the running total.
function BookStayTab({ session, kind, account, onComplete }) {
  const p = usePalette();
  const { rooms, tiers, loyalty, activeExtras, tax, taxPatterns, activePatternId, addBooking, addInvoice, hotelInfo } = useData();

  const today = todayISO();
  const [step,     setStep]     = useState(1);
  const [checkIn,  setCheckIn]  = useState(today);
  const [checkOut, setCheckOut] = useState(addDaysISO(today, 3));
  // Top-level guest counts — declared upfront like the public booking widget
  // and used as smart defaults when the user adds rooms in step 2.
  const [totalAdults,   setTotalAdults]   = useState(2);
  const [totalChildren, setTotalChildren] = useState(0);
  const [stays,    setStays]    = useState([]);
  const [pickedExtras, setPickedExtras] = useState({});
  const [requestNotes, setRequestNotes] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  // Pre-payment branch — when the partner's underlying contract is on
  // "Pre-payment (cash)" terms (corporate or agency), surface the same
  // Pay-on-arrival / Pay-now-save-5% choice the public B2C BookingModal
  // shows in step 4. Default to "later" so the booker confirms it
  // explicitly before any charge.
  const isPrepay = (kind === "corporate" || kind === "agent")
    && (account?.paymentTerms || "") === "Pre-payment (cash)";
  const [paymentTiming, setPaymentTiming] = useState("later"); // "later" | "now"
  const PAY_NOW_DISCOUNT_PCT = 5;

  // Agent-only — opt-in to settle the booking net of commission upfront.
  // When ticked, the booking carries a `commissionDeducted` flag and an
  // auto-paid commission invoice is issued at confirm; the agency owes the
  // hotel net amount (total − commission) rather than the full net rate.
  // Only relevant when kind === "agent" AND the agency contract carries a
  // non-zero commission. Reset to false if the kind/contract changes.
  const [deductCommission, setDeductCommission] = useState(false);
  const agentCommissionPct = kind === "agent" ? Number(account?.commissionPct || 0) : 0;
  const canDeductCommission = kind === "agent" && agentCommissionPct > 0;
  useEffect(() => {
    if (!canDeductCommission && deductCommission) setDeductCommission(false);
  }, [canDeductCommission, deductCommission]);

  // Card-on-file capture — only required (and only rendered) when the
  // partner's contract is on pre-payment terms AND they choose Pay-now.
  // Mirrors the public BookingModal's required-card flow.
  const [cardName, setCardName] = useState("");
  const [cardNum,  setCardNum]  = useState("");
  const [cardExp,  setCardExp]  = useState("");
  const [cardCvc,  setCardCvc]  = useState("");
  const needsCard = isPrepay && paymentTiming === "now";
  const cardComplete = !!cardName.trim() && !!cardNum.trim() && !!cardExp.trim() && !!cardCvc.trim();
  const cardMissing = needsCard && !cardComplete;

  // Booking on behalf — toggle between booking for yourself (default) or
  // capturing a different guest's name / email / mobile (all required).
  const [bookFor,    setBookFor]    = useState("self"); // "self" | "other"
  const [guestName,  setGuestName]  = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Resolved guest used when constructing the booking + reservation rail
  const guest = bookFor === "other"
    ? { name: guestName.trim(), email: guestEmail.trim().toLowerCase(), phone: guestPhone.trim() }
    : { name: session.displayName, email: session.email, phone: "" };

  // Lightweight validity (proper validation for required fields runs later)
  const guestValid = bookFor === "self" ? true : (
    !!guest.name &&
    /.+@.+\..+/.test(guest.email) &&
    /^\+?[\d\s().\-]{6,20}$/.test(guest.phone)
  );

  // Date guards — guarantee ≥ 1 night and prevent past check-ins.
  const handleCheckIn = (v) => {
    const safe = v < today ? today : v;
    setCheckIn(safe);
    if (checkOut <= safe) setCheckOut(addDaysISO(safe, 1));
  };
  const handleCheckOut = (v) => {
    const minOut = addDaysISO(checkIn, 1);
    setCheckOut(v < minOut ? minOut : v);
  };

  const nights = nightsBetweenISO(checkIn, checkOut);
  const isLongStay = nights >= 30;

  // Resolve the weekday + weekend nightly rate for a given room under the
  // current account context. Three branches:
  //   • Corporate / agent — contracted dailyRates × (1 + weekendUpliftPct/100).
  //     Long-stay monthly bookings use the flat monthly-equivalent for both
  //     buckets (no weekend uplift on monthly contracts).
  //   • Member — public rack rate (room.price / room.priceWeekend) discounted
  //     by the tier %.
  const ratePairFor = (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    const rackWeekday = Number(room?.price || 0);
    const rackWeekend = Number(room?.priceWeekend ?? room?.price ?? 0);
    if (kind === "corporate" || kind === "agent") {
      const key = ROOM_RATE_KEY[roomId] || roomId;
      const monthly = kind === "corporate" ? (account.monthlyRates || {}) : (account.monthlyNet || {});
      const daily   = kind === "corporate" ? (account.dailyRates   || {}) : (account.dailyNet   || {});
      if (isLongStay && monthly[key]) {
        const r = Math.round((monthly[key] / 30) * 1000) / 1000;
        return { weekday: r, weekend: r };
      }
      const weekday = daily[key] || rackWeekday;
      const uplift  = Number(account.weekendUpliftPct || 0);
      const weekend = Math.round(weekday * (1 + uplift / 100) * 1000) / 1000;
      return { weekday, weekend };
    }
    const tierId = account.tier;
    const discount = MEMBER_DISCOUNT_PCT[tierId] || 0;
    const factor = 1 - discount / 100;
    return {
      weekday: Math.round(rackWeekday * factor * 1000) / 1000,
      weekend: Math.round(rackWeekend * factor * 1000) / 1000,
    };
  };

  // Legacy rateFor — kept so any caller that wants a single nightly figure
  // for display still works. Returns the weekday rate (or the flat monthly
  // equivalent on long-stay bookings, since both buckets match there).
  const rateFor = (roomId) => ratePairFor(roomId).weekday;

  const stayTotals = useMemo(() => stays.map((s) => {
    const pair = ratePairFor(s.roomId);
    const room = rooms.find((r) => r.id === s.roomId);
    const qty = Number(s.quantity) || 1;
    // Weekday/weekend-aware breakdown for ONE suite — multiply by qty for
    // multi-line bookings. Falls back to `pair.weekday × nights` when the
    // stay has zero nights (empty cart on step 1).
    const breakdown = nightlyBreakdown({
      checkIn, checkOut, room,
      weekendDays: hotelInfo?.weekendDays,
      overrideWeekday: pair.weekday,
      overrideWeekend: pair.weekend,
    });
    const roomRevenue = breakdown.total * qty;
    // Extra-bed support — rolls up the per-line beds × per-bed fee × nights.
    // The fee is the operator-set rack fee; corporate / agent agreements
    // don't currently negotiate the extra-bed line, so it bills at rack.
    const extraBeds   = Math.max(0, Number(s.extraBeds) || 0);
    const ebFee       = Number(room?.extraBedFee || 0);
    const extraBedRev = (room?.extraBedAvailable ? ebFee * extraBeds * nights : 0);
    // `rate` keeps the legacy display semantics: weekday rate (or flat
    // monthly-equivalent when both buckets match).
    return { ...s, rate: pair.weekday, rateWeekday: pair.weekday, rateWeekend: pair.weekend, roomRevenue, extraBeds, extraBedFee: ebFee, extraBedRev, breakdown };
  }), [stays, nights, checkIn, checkOut, kind, account, rooms, hotelInfo?.weekendDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subtotal — rooms + extra beds, before extras and tax. Each booking row
  // already accounts for nights × qty so the sum is straightforward.
  const subTotalRoom = stayTotals.reduce((sum, s) => sum + s.roomRevenue + s.extraBedRev, 0);
  const totalExtraBeds = stayTotals.reduce((sum, s) => sum + (s.extraBeds * (Number(s.quantity) || 1)), 0);
  const totalRooms   = stayTotals.reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);
  // Per-suite guest count summed from the stays array — used for the
  // booking record's `guests` field and the per-room display. This is
  // capped by suite occupancy (e.g. a studio caps at 2 adults).
  const totalGuests  = stayTotals.reduce((sum, s) => sum + (Number(s.adults) + Number(s.children)) * (Number(s.quantity) || 1), 0);
  // Declared party size from Step 1 — drives extras pricing because a
  // per-pax extra (e.g. breakfast) bills for every guest staying, even when
  // the picked suite type can't hold them all by itself.
  const partySize = Math.max(1, (Number(totalAdults) || 0) + (Number(totalChildren) || 0));

  const extrasList = (activeExtras || []).filter((e) => pickedExtras[e.id]);
  const extrasTotal = extrasList.reduce((sum, e) => sum + priceExtra(e, { adults: partySize, nights: Math.max(1, nights) }), 0);

  // Pay-now incentive — 5% off the room subtotal when a pre-payment-
  // contracted partner opts to settle at booking. Mirrors the public
  // BookingModal so the saving is the same across surfaces. Does not stack
  // on top of extras / tax — flat percentage on rooms-only.
  const payNowDiscount = (isPrepay && paymentTiming === "now")
    ? Math.round(subTotalRoom * (PAY_NOW_DISCOUNT_PCT / 100))
    : 0;

  const taxIncluded = kind !== "member" && !!account.taxIncluded;
  const roomsAfterDiscount = Math.max(0, subTotalRoom - payNowDiscount);
  const taxBreakdown = taxIncluded
    ? { totalTax: 0, gross: roomsAfterDiscount + extrasTotal }
    : applyTaxes(roomsAfterDiscount + extrasTotal, tax, Math.max(1, nights));
  const grandTotal = taxIncluded ? roomsAfterDiscount + extrasTotal : taxBreakdown.gross;

  const tier = kind === "member" ? tiers.find((t) => t.id === account.tier) : null;
  const pointsEarned = kind === "member" && tier ? Math.round((tier.earnRate || 1) * grandTotal) : 0;
  const memberDiscountPct = kind === "member" ? (MEMBER_DISCOUNT_PCT[account.tier] || 0) : 0;
  // Commission base — rooms-only after pay-now discount. Matches the
  // per-line commission in confirm() (booking.comm = roomTotal × pct/100,
  // where roomTotal excludes extra beds and is net of the pay-now split).
  // Sum across all booking rows equals this number, so the rail's displayed
  // commission stays consistent with the figures stamped on each booking.
  const roomGrossSum  = stayTotals.reduce((sum, s) => sum + (s.roomRevenue || 0), 0);
  const commissionBase = Math.max(0, roomGrossSum - payNowDiscount);
  const agentCommission = kind === "agent"
    ? Math.round((commissionBase * (account.commissionPct || 0) / 100) * 1000) / 1000
    : 0;
  // Final calculation — when the agent opts to settle this booking net of
  // commission, deduct the accrued commission from the displayed grand
  // total and from each booking line's `total`. The auto-issued AR booking
  // invoice (kind:"booking") is raised for this net amount, and the
  // commission invoice (kind:"commission") is auto-issued as paid for the
  // deducted figure. Together the agent's net obligation matches what the
  // rail surfaces.
  const commissionDeduction = (kind === "agent" && canDeductCommission && deductCommission)
    ? agentCommission
    : 0;
  const grandTotalNet = Math.max(0, Math.round((grandTotal - commissionDeduction) * 1000) / 1000);

  const addRoomType = (roomId) => {
    setStays((ss) => {
      const existing = ss.find((s) => s.roomId === roomId);
      if (existing) {
        return ss.map((s) => s.roomId === roomId ? { ...s, quantity: (Number(s.quantity) || 0) + 1 } : s);
      }
      const room = rooms.find((r) => r.id === roomId);
      // Pre-fill per-room adults/children from the top-level totals, capped
      // by the suite's published occupancy.
      const cap = room?.occupancy || 4;
      return [...ss, {
        id: `r-${Date.now()}-${roomId}`, roomId,
        quantity: 1,
        adults:   Math.max(1, Math.min(totalAdults || 1, cap)),
        children: Math.max(0, Math.min(totalChildren || 0, 4)),
        extraBeds: 0,
        notes: "",
      }];
    });
  };
  const decRoomType = (roomId) => {
    setStays((ss) => {
      const existing = ss.find((s) => s.roomId === roomId);
      if (!existing) return ss;
      if ((Number(existing.quantity) || 0) <= 1) return ss.filter((s) => s.roomId !== roomId);
      const room = rooms.find((r) => r.id === roomId);
      const nextQty = existing.quantity - 1;
      const cap = (room?.maxExtraBeds || 0) * nextQty;
      return ss.map((s) => s.roomId === roomId
        ? { ...s, quantity: nextQty, extraBeds: Math.min(s.extraBeds || 0, cap) }
        : s);
    });
  };
  // Per-line extra-bed stepper. Capped by room.maxExtraBeds × line quantity
  // and disabled altogether if the room type doesn't offer extra beds.
  const setExtraBedsForRoom = (roomId, delta) => {
    setStays((ss) => {
      const existing = ss.find((s) => s.roomId === roomId);
      if (!existing) return ss;
      const room = rooms.find((r) => r.id === roomId);
      if (!room?.extraBedAvailable) return ss;
      const cap = (room.maxExtraBeds || 0) * (existing.quantity || 0);
      const next = Math.min(cap, Math.max(0, (existing.extraBeds || 0) + delta));
      return ss.map((s) => s.roomId === roomId ? { ...s, extraBeds: next } : s);
    });
  };
  const updateStay = (id, patch) => setStays((ss) => ss.map((s) => s.id === id ? { ...s, ...patch } : s));
  const removeStay = (id) => setStays((ss) => ss.filter((s) => s.id !== id));
  const qtyForRoom = (roomId) => (stays.find((s) => s.roomId === roomId)?.quantity) || 0;

  const canAdvance = {
    1: nights >= 1 && guestValid,
    2: stays.length > 0,
    3: true,
    4: true,
  };
  const goNext = () => { if (canAdvance[step]) setStep((s) => Math.min(4, s + 1)); };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const confirm = () => {
    if (nights < 1) { pushToast({ message: "Pick at least 1 night.", kind: "warn" }); return; }
    if (stays.length === 0) { pushToast({ message: "Pick at least one suite.", kind: "warn" }); return; }
    if (!guestValid) {
      pushToast({ message: "Guest name, email and mobile number are all required.", kind: "warn" });
      setStep(1);
      return;
    }
    if (cardMissing) {
      pushToast({ message: "Card details required for Pay-now bookings.", kind: "warn" });
      return;
    }
    // Card-on-file — captured only for Pay-now on a pre-payment contract.
    // buildCardOnFile masks the PAN before persistence; the raw number never
    // lives in the store. Bookings with a card on file are flagged
    // guaranteed so the front office knows the room is held all day.
    const cardOnFile = needsCard
      ? buildCardOnFile({ name: cardName, number: cardNum, exp: cardExp })
      : null;
    const guaranteed = cardOnFile != null;
    const created = [];
    let extrasAttached = false;
    // Per-line pay-now discount allocation — split the savings evenly across
    // every booking row so the per-line totals stay consistent with the
    // displayed grand total. Allocated on the room subtotal only (matches
    // the headline calculation above).
    const totalRoomLines = stayTotals.reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);
    const perLineDiscount = totalRoomLines > 0
      ? Math.round((payNowDiscount / totalRoomLines) * 1000) / 1000
      : 0;
    // Pattern lookup once per confirm() — every per-line booking gets the
    // same pattern stamp.
    const activePattern = (taxPatterns || []).find((p) => p.id === activePatternId);
    stayTotals.forEach((s) => {
      const qty = Number(s.quantity) || 1;
      for (let i = 0; i < qty; i++) {
        // Weekday/weekend-aware suite charge — sum of nightly rates from
        // the breakdown rather than a single rate × nights, so a stay
        // spanning Thu→Sat prices each night against its own bucket.
        const roomTotalGross = s.breakdown?.total ?? (s.rate * nights);
        const lineDiscount = perLineDiscount;
        const roomTotal = Math.max(0, roomTotalGross - lineDiscount);
        const isLead = !extrasAttached;
        const lineExtras = isLead ? extrasTotal : 0;
        // Run the configured tax pattern once for this line and keep both
        // the totalTax (for the row total) and the per-component lines so
        // the Tax Report can aggregate. Tax-included contracts emit an
        // empty lines array and zero amount.
        const lineTaxBase = roomTotal + lineExtras;
        const lineTaxResult = taxIncluded
          ? { totalTax: 0, lines: [] }
          : applyTaxes(lineTaxBase, tax, Math.max(1, nights));
        const lineTax = lineTaxResult.totalTax;
        // Commission deduction at booking — when the agent opts to settle
        // net of commission, drop this line's commission from `total` so
        // the booking record stamps the net obligation. Tax stays on the
        // gross room base for accounting; only the bottom-line drops.
        const lineCommissionDeduction = (kind === "agent" && canDeductCommission && deductCommission)
          ? Math.round((roomTotal * (account.commissionPct || 0) / 100) * 1000) / 1000
          : 0;
        const total = Math.round((roomTotal + lineExtras + lineTax - lineCommissionDeduction) * 1000) / 1000;
        const bookedByOther = bookFor === "other";
        // Payment status mapping mirrors the public BookingModal contract.
        // For pre-payment-contracted partners, pay-now captures the card
        // and marks the stay non-refundable, but the actual charge is
        // recorded afterwards from the admin Card on File panel ("Mark as
        // charged"). Until then the booking sits at "pending" with paid 0.
        let lineStatus, linePaid;
        if (kind === "member") {
          lineStatus = "paid"; linePaid = total;
        } else if (isPrepay && paymentTiming === "now") {
          lineStatus = "pending"; linePaid = 0;
        } else if (isPrepay && paymentTiming === "later") {
          lineStatus = "pending"; linePaid = 0;
        } else if (kind === "corporate") {
          lineStatus = "invoiced"; linePaid = 0;
        } else {
          lineStatus = "deposit"; linePaid = 0;
        }
        const booking = {
          // Primary guest who's actually staying — falls back to the booker
          // when "Book for myself" is selected.
          guest: guest.name,
          email: guest.email,
          phone: guest.phone,
          // Audit trail — who placed the booking. For "self" this matches the
          // guest; for "other" it's the logged-in user.
          bookedById:   session.userId || session.accountId,
          bookedByName: session.displayName,
          bookedByEmail: session.email,
          source: kind === "agent" ? "agent" : kind === "corporate" ? "corporate" : "direct",
          roomId: s.roomId, checkIn, checkOut, nights,
          guests: Number(s.adults) + Number(s.children),
          rate: s.rate, total,
          paid: linePaid,
          status: "confirmed",
          paymentStatus: lineStatus,
          paymentTiming: isPrepay ? paymentTiming : "later",
          nonRefundable: isPrepay && paymentTiming === "now",
          payNowDiscountPct: (isPrepay && paymentTiming === "now") ? PAY_NOW_DISCOUNT_PCT : 0,
          payNowDiscount: lineDiscount,
          cardOnFile,
          guaranteed,
          guaranteeMode: guaranteed ? "card" : "none",
          notes: [
            s.notes,
            requestNotes,
            bookedByOther ? `Booked by ${session.displayName} (${session.email})` : null,
          ].filter(Boolean).join(" · "),
          extras: isLead && extrasList.length > 0
            ? extrasList.map((e) => ({ id: e.id, title: e.title, price: priceExtra(e, { adults: partySize, nights }) }))
            : [],
          // Tax breakdown — stamped per booking row so the admin Tax
          // Report can aggregate components across stays. taxBase is the
          // pre-tax total this row was assessed on (room + line extras −
          // line discount). taxLines / taxAmount are empty / 0 when the
          // contract is tax-inclusive.
          taxAmount: lineTax,
          taxBase: lineTaxBase,
          taxLines: lineTaxResult.lines || [],
          taxPatternId: taxIncluded ? null : (activePatternId || null),
          taxPatternName: taxIncluded ? "Inclusive (contract)" : (activePattern?.name || null),
          // Weekday/weekend split — stamped per booking row so the admin
          // Bookings drawer + folio can render the breakdown line.
          nightlyBreakdown: s.breakdown?.perNight || null,
          weekdayNights:    s.breakdown?.weekdayNights || 0,
          weekendNights:    s.breakdown?.weekendNights || 0,
          rateWeekday:      s.rateWeekday || s.rate || 0,
          rateWeekend:      s.rateWeekend || s.rate || 0,
        };
        if (kind === "corporate") booking.accountId = account.id;
        if (kind === "agent") {
          booking.agencyId = account.id;
          booking.comm = Math.round((roomTotal * (account.commissionPct || 0) / 100) * 1000) / 1000;
          // Deduct-at-booking branch — stamp the booking with the flag so
          // the AR side knows the commission is already settled and won't
          // bundle it onto a later commission invoice. We keep
          // `booking.total` as the full net rate (gross billable) and
          // record the deducted amount separately so the balance owed by
          // the agency = total − commissionDeductedAmount − paid.
          if (canDeductCommission && deductCommission && booking.comm > 0) {
            booking.commissionDeducted = true;
            booking.commissionDeductedAmount = booking.comm;
          }
        }
        if (kind === "member")    booking.memberId = account.id;
        const saved = addBooking(booking);
        created.push({ roomId: s.roomId, total, bookingId: saved?.id, comm: booking.comm || 0, commissionDeducted: !!booking.commissionDeducted });
        if (isLead) extrasAttached = true;
      }
    });
    // Auto-issue a "paid" commission invoice per line when the agent opted
    // to deduct commission at booking. Each booking row gets its own
    // invoice so the agent ledger ties the deduction to a specific stay.
    if (kind === "agent" && canDeductCommission && deductCommission) {
      created.forEach((c) => {
        if (!c.commissionDeducted || !c.comm || c.comm <= 0) return;
        addInvoice({
          clientType: "agent",
          clientName: account.name,
          bookingId: c.bookingId,
          issued: todayISO(),
          due:    todayISO(),
          amount: c.comm,
          paid:   c.comm,
          status: "paid",
          // Commission flow — money the hotel owes the agent. Tagged so it
          // surfaces in the agent's Commission tab, not the Invoices tab.
          kind: "commission",
          description: `Commission · auto-deducted at booking ${c.bookingId}`,
        });
      });
      // Pair the paid commission invoice with an AR booking invoice (the
      // net amount the agent now owes the hotel) when the contract isn't
      // pre-payment — pay-now / pay-on-arrival contracts settle directly,
      // no Net-X invoice required. The AR invoice is the agent-side
      // counterpart of the corporate Net-X invoice issued below.
      if (!isPrepay) {
        const leadTotal = created.reduce((s, c) => s + (c.total || 0), 0);
        if (leadTotal > 0) {
          addInvoice({
            clientType: "agent", clientName: account.name, bookingId: null,
            issued: todayISO(),
            due: addDaysISO(todayISO(), parseInt((account.paymentTerms || "Net 30").match(/\d+/)?.[0] || "30", 10)),
            amount: leadTotal, paid: 0, status: "issued",
            // Booking-AR — agent owes the hotel net of commission.
            kind: "booking",
            description: `Booking · net of commission · ${created.length} ${created.length === 1 ? "stay" : "stays"}`,
          });
        }
      }
    }
    // Skip the auto-issue invoice when the corporate contract is prepay —
    // the funds either landed at booking (pay-now) or will land in cash on
    // arrival (pay-on-arrival); AR doesn't need a Net-X invoice in either
    // case.
    if (kind === "corporate" && !isPrepay) {
      const leadTotal = created.reduce((s, c) => s + c.total, 0);
      addInvoice({
        clientType: "corporate", clientName: account.account, bookingId: null,
        issued: todayISO(),
        due: addDaysISO(todayISO(), parseInt((account.paymentTerms || "Net 30").match(/\d+/)?.[0] || "30", 10)),
        amount: leadTotal, paid: 0, status: "issued",
        // Booking-AR — corporate owes the hotel under Net-X terms.
        kind: "booking",
      });
    }
    pushToast({ message: `Booking confirmed · ${created.length} room${created.length === 1 ? "" : "s"} · ${nights} nights · ${fmtBhd(grandTotalNet)}` });
    setConfirmation({ count: created.length, total: grandTotalNet, checkIn, checkOut, nights, kind, account });
    onComplete?.();
  };

  if (confirmation) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-8 text-center" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}40`, borderInlineStart: `4px solid ${p.success}` }}>
          <div className="inline-flex items-center justify-center mb-4" style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: `${p.success}1F` }}>
            <CheckCircle2 size={36} style={{ color: p.success }} />
          </div>
          <div style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Booking confirmed
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1, marginTop: 6 }}>
            We've held {confirmation.count} room{confirmation.count === 1 ? "" : "s"} for {confirmation.nights} nights.
          </h2>
          <p style={{ color: p.textMuted, fontSize: "0.92rem", marginTop: 8 }}>
            {fmtDate(confirmation.checkIn)} → {fmtDate(confirmation.checkOut)}
          </p>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.2rem", color: p.accent, fontWeight: 600, marginTop: 16 }}>
            {fmtBhd(confirmation.total)}
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.82rem", marginTop: 4 }}>
            {confirmation.kind === "corporate" ? "Billed to your corporate account · Invoice issued"
             : confirmation.kind === "agent"   ? "Logged against your agency contract · Commission accrued"
             : "Charge captured on file · Points credited"}
          </div>
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            <button
              onClick={() => { setConfirmation(null); setStep(1); setStays([]); setPickedExtras({}); setRequestNotes(""); }}
              style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.55rem 1.1rem", border: `1px solid ${p.border}`, background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
            >Book another</button>
            <button
              onClick={() => onComplete?.("bookings")}
              style={{ backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, padding: "0.55rem 1.1rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
            >View my bookings <ArrowRight size={11} style={{ display: "inline", marginInlineStart: 6 }} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Stepper step={step} onJump={(s) => {
        if (s <= step) setStep(s);
        else if (s === 2 && canAdvance[1]) setStep(s);
        else if ((s === 3 || s === 4) && canAdvance[1] && canAdvance[2]) setStep(s);
      }} canAdvance={canAdvance} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 space-y-5">
          {step === 1 && (
            <>
              <DatesStep
                checkIn={checkIn} checkOut={checkOut}
                onCheckIn={handleCheckIn} onCheckOut={handleCheckOut}
                today={today} nights={nights} isLongStay={isLongStay} kind={kind}
                totalAdults={totalAdults} setTotalAdults={setTotalAdults}
                totalChildren={totalChildren} setTotalChildren={setTotalChildren}
              />
              <div className="mt-5">
                <GuestStep
                  session={session}
                  bookFor={bookFor} setBookFor={setBookFor}
                  guestName={guestName}   setGuestName={setGuestName}
                  guestEmail={guestEmail} setGuestEmail={setGuestEmail}
                  guestPhone={guestPhone} setGuestPhone={setGuestPhone}
                  guestValid={guestValid}
                />
              </div>
            </>
          )}
          {step === 2 && (
            <SuiteStep
              rooms={rooms} stays={stays}
              addRoomType={addRoomType} decRoomType={decRoomType}
              updateStay={updateStay} removeStay={removeStay}
              qtyForRoom={qtyForRoom}
              setExtraBedsForRoom={setExtraBedsForRoom}
              rateFor={rateFor} nights={nights}
              partySize={partySize}
              totalAdults={totalAdults}
              totalChildren={totalChildren}
            />
          )}
          {step === 3 && (
            <ExtrasStep
              activeExtras={activeExtras} pickedExtras={pickedExtras} setPickedExtras={setPickedExtras}
              partySize={partySize} nights={nights}
              requestNotes={requestNotes} setRequestNotes={setRequestNotes}
            />
          )}
          {step === 4 && (
            <ConfirmStep
              checkIn={checkIn} checkOut={checkOut} nights={nights}
              stayTotals={stayTotals} extrasList={extrasList} partySize={partySize}
              taxBreakdown={taxBreakdown} taxIncluded={taxIncluded}
              subTotalRoom={subTotalRoom} extrasTotal={extrasTotal} grandTotal={grandTotal}
              commissionDeduction={commissionDeduction} grandTotalNet={grandTotalNet}
              requestNotes={requestNotes}
              kind={kind} account={account} session={session}
              tier={tier} pointsEarned={pointsEarned} memberDiscountPct={memberDiscountPct} agentCommission={agentCommission}
              guest={guest} bookFor={bookFor}
              totalAdults={totalAdults} totalChildren={totalChildren}
              isPrepay={isPrepay} paymentTiming={paymentTiming} setPaymentTiming={setPaymentTiming}
              payNowDiscount={payNowDiscount} payNowDiscountPct={PAY_NOW_DISCOUNT_PCT}
              cardName={cardName} setCardName={setCardName}
              cardNum={cardNum}   setCardNum={setCardNum}
              cardExp={cardExp}   setCardExp={setCardExp}
              cardCvc={cardCvc}   setCardCvc={setCardCvc}
              cardMissing={cardMissing}
              canDeductCommission={canDeductCommission}
              deductCommission={deductCommission}
              setDeductCommission={setDeductCommission}
            />
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4 space-y-4">
            <ReservationRail
              p={p}
              checkIn={checkIn} checkOut={checkOut} nights={nights}
              stayTotals={stayTotals} partySize={partySize}
              extrasList={extrasList}
              subTotalRoom={subTotalRoom} grandTotal={grandTotal}
              taxBreakdown={taxBreakdown} taxIncluded={taxIncluded}
              guest={guest} bookFor={bookFor}
              totalAdults={totalAdults} totalChildren={totalChildren}
              payNowDiscount={payNowDiscount} payNowDiscountPct={PAY_NOW_DISCOUNT_PCT}
              commissionDeduction={commissionDeduction}
              commissionPct={kind === "agent" ? account?.commissionPct : 0}
              grandTotalNet={grandTotalNet}
            />

            {step < 4 ? (
              <button
                onClick={goNext}
                disabled={!canAdvance[step]}
                className="w-full inline-flex items-center justify-center gap-2"
                style={{
                  backgroundColor: canAdvance[step] ? p.accent : p.border,
                  color: canAdvance[step] ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textMuted,
                  border: `1px solid ${canAdvance[step] ? p.accent : p.border}`,
                  padding: "0.95rem 1rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                  fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase",
                  cursor: canAdvance[step] ? "pointer" : "not-allowed",
                }}
              >Continue <ArrowRight size={14} /></button>
            ) : (
              <button
                onClick={confirm}
                disabled={cardMissing}
                className="w-full inline-flex items-center justify-center gap-2"
                style={{
                  backgroundColor: cardMissing ? p.border : p.accent,
                  color: cardMissing ? p.textMuted : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
                  border: `1px solid ${cardMissing ? p.border : p.accent}`,
                  padding: "0.95rem 1rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                  fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase",
                  cursor: cardMissing ? "not-allowed" : "pointer",
                }}
              ><CheckCircle2 size={14} /> Confirm · {fmtBhd(grandTotalNet)}</button>
            )}
            {cardMissing && (
              <div style={{ color: p.warn, fontSize: "0.72rem", textAlign: "center", lineHeight: 1.55, fontFamily: "'Manrope', sans-serif" }}>
                Card details required for Pay-now bookings.
              </div>
            )}

            {step > 1 && (
              <button
                onClick={goBack}
                className="w-full text-center"
                style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.55rem 0", background: "transparent", border: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
              >← Back</button>
            )}

            <div style={{ color: p.textMuted, fontSize: "0.72rem", textAlign: "center", lineHeight: 1.55 }}>
              By confirming you agree to our cancellation policy. Confirmation is sent immediately to <strong>{session.email}</strong>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step header ────────────────────────────────────────────────────────
function Stepper({ step, onJump, canAdvance }) {
  const p = usePalette();
  const steps = [
    { n: 1, label: "Dates",   enabled: true },
    { n: 2, label: "Suite",   enabled: canAdvance[1] },
    { n: 3, label: "Extras",  enabled: canAdvance[1] && canAdvance[2] },
    { n: 4, label: "Confirm", enabled: canAdvance[1] && canAdvance[2] },
  ];
  return (
    <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
      {steps.map((s, idx) => {
        const isActive = step === s.n;
        const isPast = step > s.n;
        const isClickable = s.enabled || isPast;
        return (
          <button
            key={s.n}
            onClick={() => isClickable && onJump(s.n)}
            disabled={!isClickable}
            className="flex-1 px-4 py-3 flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: isActive ? p.bgPanelAlt : "transparent",
              borderInlineEnd: idx < steps.length - 1 ? `1px solid ${p.border}` : "none",
              borderBottom: isActive ? `2px solid ${p.accent}` : "2px solid transparent",
              color: isActive ? p.accent : isPast ? p.success : p.textMuted,
              cursor: isClickable ? "pointer" : "not-allowed",
              opacity: isClickable ? 1 : 0.55,
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.74rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {isPast ? <CheckCircle2 size={13} /> : (
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                backgroundColor: isActive ? p.accent : "transparent",
                color: isActive ? (p.theme === "light" ? "#fff" : "#15161A") : (isClickable ? p.textMuted : p.border),
                border: `1px solid ${isActive ? p.accent : p.border}`,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.66rem", fontWeight: 800,
              }}>{s.n}</span>
            )}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 1 · Dates + party size ────────────────────────────────────────
function DatesStep({ checkIn, checkOut, onCheckIn, onCheckOut, today, nights, isLongStay, kind, totalAdults, setTotalAdults, totalChildren, setTotalChildren }) {
  const p = usePalette();
  const totalGuests = (Number(totalAdults) || 0) + (Number(totalChildren) || 0);
  return (
    <Card title="When you'd like to stay">
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div>
          <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>Check-in</label>
          <input
            type="date" value={checkIn} min={today}
            onChange={(e) => onCheckIn(e.target.value)}
            className="w-full outline-none"
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}
          />
        </div>
        <div>
          <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>Check-out</label>
          <input
            type="date" value={checkOut} min={addDaysISO(checkIn, 1)}
            onChange={(e) => onCheckOut(e.target.value)}
            className="w-full outline-none"
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}
          />
        </div>
        <div>
          <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>Total nights</label>
          <div style={{
            backgroundColor: nights >= 1 ? `${p.accent}10` : p.bgPanelAlt,
            border: `1px solid ${nights >= 1 ? p.accent : p.border}`,
            padding: "0.6rem 0.7rem",
            color: nights >= 1 ? p.accent : p.textMuted,
            fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600,
          }}>
            {nights} {nights === 1 ? "night" : "nights"}
          </div>
        </div>
        <NumberStepper
          label="Adults"
          value={totalAdults}
          onChange={setTotalAdults}
          min={1} max={20} p={p}
        />
        <NumberStepper
          label="Children"
          value={totalChildren}
          onChange={setTotalChildren}
          min={0} max={10} p={p}
        />
      </div>

      <div className="mt-4 flex items-center justify-between flex-wrap gap-2" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
        <span>Same-day check-in is supported · check-out must be at least 1 night after check-in.</span>
        {totalGuests > 0 && (
          <span style={{ color: p.accent, fontWeight: 600 }}>
            <Users size={11} style={{ display: "inline", marginInlineEnd: 4 }} />
            {totalGuests} guest{totalGuests === 1 ? "" : "s"} total
          </span>
        )}
      </div>

      {isLongStay && (kind === "corporate" || kind === "agent") && (
        <div className="mt-3 p-3 inline-flex items-center gap-2" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}40`, color: p.success, fontSize: "0.82rem", fontWeight: 600 }}>
          <Zap size={13} /> Long-stay rate applied · {nights} nights ≥ 30 → monthly net pricing
        </div>
      )}
    </Card>
  );
}

// ─── Step 1 · Guest details (Who's staying?) ───────────────────────────
function GuestStep({ session, bookFor, setBookFor, guestName, setGuestName, guestEmail, setGuestEmail, guestPhone, setGuestPhone, guestValid }) {
  const p = usePalette();
  const isOther = bookFor === "other";
  const emailValid = !guestEmail || /.+@.+\..+/.test(guestEmail);
  const phoneValid = !guestPhone || /^\+?[\d\s().\-]{6,20}$/.test(guestPhone);

  return (
    <Card title="Who's staying?">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setBookFor("self")}
          className="text-start p-3 transition-colors"
          style={{
            backgroundColor: !isOther ? `${p.accent}10` : "transparent",
            border: `1px solid ${!isOther ? p.accent : p.border}`,
            cursor: "pointer",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <UserCircle2 size={16} style={{ color: !isOther ? p.accent : p.textMuted }} />
            <span style={{
              color: !isOther ? p.accent : p.textPrimary,
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}>
              Book for myself
            </span>
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.78rem", lineHeight: 1.45 }}>
            Stay registered under <strong style={{ color: p.textPrimary }}>{session.displayName}</strong> · {session.email}
          </div>
        </button>
        <button
          onClick={() => setBookFor("other")}
          className="text-start p-3 transition-colors"
          style={{
            backgroundColor: isOther ? `${p.accent}10` : "transparent",
            border: `1px solid ${isOther ? p.accent : p.border}`,
            cursor: "pointer",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} style={{ color: isOther ? p.accent : p.textMuted }} />
            <span style={{
              color: isOther ? p.accent : p.textPrimary,
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}>
              Book for someone else
            </span>
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.78rem", lineHeight: 1.45 }}>
            Capture the guest's name, email and mobile so we can welcome them by name on arrival.
          </div>
        </button>
      </div>

      {isOther && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field
              label="Guest name *"
              value={guestName}
              onChange={setGuestName}
              placeholder="Full name as on ID"
            />
            <Field
              label="Email *"
              value={guestEmail}
              onChange={setGuestEmail}
              type="email"
              placeholder="guest@example.com"
            />
            <Field
              label="Mobile no. *"
              value={guestPhone}
              onChange={setGuestPhone}
              type="tel"
              placeholder="+973 …"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-3 items-center">
            {!guestName && (
              <span style={{ color: p.warn, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
                <AlertCircle size={11} style={{ display: "inline", marginInlineEnd: 4 }} /> Name is required
              </span>
            )}
            {guestEmail && !emailValid && (
              <span style={{ color: p.danger, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
                <AlertCircle size={11} style={{ display: "inline", marginInlineEnd: 4 }} /> Email looks invalid
              </span>
            )}
            {guestPhone && !phoneValid && (
              <span style={{ color: p.danger, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
                <AlertCircle size={11} style={{ display: "inline", marginInlineEnd: 4 }} /> Mobile looks invalid
              </span>
            )}
            {guestValid && (
              <span style={{ color: p.success, fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={11} /> Guest details captured
              </span>
            )}
          </div>

          <div className="mt-3 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textMuted, fontSize: "0.78rem", lineHeight: 1.5 }}>
            <strong style={{ color: p.textPrimary }}>Booking for {guestName || "your guest"}</strong> ·
            confirmation will be sent to <strong style={{ color: p.textPrimary }}>{guestEmail || "their email"}</strong>,
            with a copy to you ({session.email}). The booking is logged under your account so it appears in your bookings list and statements.
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Step 2 · Suite ─────────────────────────────────────────────────────
function SuiteStep({ rooms, stays, addRoomType, decRoomType, updateStay, removeStay, qtyForRoom, setExtraBedsForRoom, rateFor, nights, partySize = 1, totalAdults = 0, totalChildren = 0 }) {
  const t = useT();
  const p = usePalette();

  // Smart capacity hint — three checks (total ceiling + adult sub-cap +
  // child sub-cap), identical rule set to the public BookingModal so guests
  // see the same language whether they're signed in or not. The hard total
  // ceiling is checked first because it's the most common reason a combo
  // fails (e.g. 2A+1C in a Studio = 3 > occupancy 2). Each failure
  // recommends the specific suite types that would satisfy that exact
  // dimension, so the operator doesn't have to guess.
  const totalRooms = stays.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  const lineSum = (selector) => stays.reduce((sum, s) => {
    const room = rooms.find((r) => r.id === s.roomId);
    const qty  = Number(s.quantity)  || 0;
    const beds = Number(s.extraBeds) || 0;
    const base = (selector.base?.(room) ?? 0) * qty;
    const fromBeds = room?.extraBedAvailable
      ? (selector.beds?.(room) ?? 0) * beds
      : 0;
    return sum + base + fromBeds;
  }, 0);
  const totalCapacity = lineSum({
    base: (r) => r?.occupancy ?? 0,
    beds: (r) => (r?.extraBedAdds?.adults ?? 0) + (r?.extraBedAdds?.children ?? 0),
  });
  const adultsCapacityLine = lineSum({
    base: (r) => r?.maxAdults ?? r?.occupancy ?? 0,
    beds: (r) => r?.extraBedAdds?.adults ?? 0,
  });
  const childrenCapacityLine = lineSum({
    base: (r) => r?.maxChildren ?? r?.occupancy ?? 0,
    beds: (r) => r?.extraBedAdds?.children ?? 0,
  });

  // Recommendation list for each failure mode — names of suite types that
  // satisfy the declared count along that single dimension.
  const fitsAdults   = rooms.filter((r) => (r.maxAdults   ?? r.occupancy) >= (Number(totalAdults)   || 0));
  const fitsChildren = rooms.filter((r) => (r.maxChildren ?? r.occupancy) >= (Number(totalChildren) || 0));
  const fitsTotal    = rooms.filter((r) => (r.occupancy   ?? 0)            >= partySize);
  const namedList = (rs) => rs
    .map((r) => t(`rooms.${r.id}.name`) || r.id)
    .reduce((acc, name, i, arr) => {
      if (i === 0) return name;
      if (i === arr.length - 1) return `${acc} or ${name}`;
      return `${acc}, ${name}`;
    }, "");
  const partyDesc = `${totalAdults} adult${totalAdults === 1 ? "" : "s"}${(Number(totalChildren) || 0) > 0 ? ` + ${totalChildren} child${totalChildren === 1 ? "" : "ren"}` : ""}`;

  const banner = (() => {
    if (totalCapacity === 0) return {
      tone: "info",
      text: <>Pick suites for your party of <strong>{partyDesc}</strong>. Each suite type has a total head-count cap — any mix of adults and children fits inside that cap (e.g. a Studio sleeps 2 in any combination of 2 adults or 1 adult + 1 child). Mix multiple suites if your party is larger.</>,
    };
    if (totalCapacity < partySize) return {
      tone: "warn",
      text: <>Selected suites sleep <strong>{totalCapacity} guest{totalCapacity === 1 ? "" : "s"}</strong> in total; you've declared <strong>{partyDesc}</strong>. {fitsTotal.length > 0
        ? <>One <strong>{namedList(fitsTotal)}</strong> would fit your party in a single suite — or add another suite to the current selection.</>
        : <>No single suite type sleeps your full party — add multiple suites or use extra beds where allowed.</>}</>,
    };
    if (adultsCapacityLine < (Number(totalAdults) || 0)) return {
      tone: "warn",
      text: <>Selected suites accept <strong>{adultsCapacityLine} adult{adultsCapacityLine === 1 ? "" : "s"}</strong> max; you've declared <strong>{totalAdults}</strong>. {fitsAdults.length > 0
        ? <>These suite types accept {totalAdults}+ adults: <strong>{namedList(fitsAdults)}</strong>. Pick one of those, or add another suite.</>
        : <>Split your party across multiple suites.</>}</>,
    };
    if (childrenCapacityLine < (Number(totalChildren) || 0)) return {
      tone: "warn",
      text: <>Selected suites accept <strong>{childrenCapacityLine} child{childrenCapacityLine === 1 ? "" : "ren"}</strong> max; you've declared <strong>{totalChildren}</strong>. {fitsChildren.length > 0
        ? <>These suite types allow {totalChildren}+ child{(Number(totalChildren) || 0) === 1 ? "" : "ren"}: <strong>{namedList(fitsChildren)}</strong>. Pick one of those, or add another suite.</>
        : <>No suite type allows {totalChildren} children — split across multiple suites.</>}</>,
    };
    return {
      tone: "ok",
      text: <><strong>{totalRooms}</strong> suite{totalRooms === 1 ? "" : "s"} selected · sleeps up to <strong>{totalCapacity}</strong> · party of <strong>{partyDesc}</strong>.</>,
    };
  })();
  const bannerColor = banner.tone === "ok" ? p.success : banner.tone === "warn" ? p.warn : p.accent;

  return (
    <>
      <Card title="Choose your suite">
        <div className="p-3 mb-3 flex items-start gap-2" style={{
          backgroundColor: `${bannerColor}10`,
          border: `1px solid ${bannerColor}40`,
          borderInlineStart: `3px solid ${bannerColor}`,
        }}>
          <Sparkles size={14} style={{ color: bannerColor, flexShrink: 0, marginTop: 2 }} />
          <div style={{ color: p.textPrimary, fontSize: "0.84rem", lineHeight: 1.55 }}>
            {banner.text}
          </div>
        </div>
        <div style={{ color: p.textMuted, fontSize: "0.84rem", marginBottom: 12 }}>
          Tap <strong style={{ color: p.accent }}>+</strong> to add a suite to your stay. You can mix multiple suite types in one booking.
        </div>
        <div className="space-y-3">
          {rooms.map((r) => {
            const qty       = qtyForRoom(r.id);
            const rate      = rateFor(r.id);
            const stayLine  = stays.find((s) => s.roomId === r.id);
            const extraBeds = Number(stayLine?.extraBeds || 0);
            const ebCap     = (r.maxExtraBeds || 0) * qty;
            const ebFee     = Number(r.extraBedFee || 0);
            const ebShow    = qty > 0 && r.extraBedAvailable && (r.maxExtraBeds || 0) > 0;
            const roomSub   = rate * nights * qty;
            const ebSub     = ebShow ? ebFee * extraBeds * nights : 0;
            const subtotal  = roomSub + ebSub;
            // Per-room single-unit fit check — disable picking when the
            // suite's max capacity (incl. all available extra beds)
            // can't hold the declared party. Already-selected rows stay
            // interactive so the user can step back to zero.
            const fit       = roomFitsParty(r, totalAdults, totalChildren);
            const blocked   = !fit.ok && qty === 0;
            return (
              <div key={r.id}
                className="flex items-stretch gap-4 p-3"
                style={{
                  border: `1px solid ${qty > 0 ? p.accent : p.border}`,
                  backgroundColor: qty > 0 ? `${p.accent}08` : "transparent",
                  opacity: blocked ? 0.5 : 1,
                  position: "relative",
                }}
              >
                {blocked && (
                  <div
                    style={{
                      position: "absolute",
                      top: 8, insetInlineEnd: 8, zIndex: 1,
                      backgroundColor: "rgba(154,58,48,0.92)",
                      color: "#FFF",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.6rem", letterSpacing: "0.18em",
                      textTransform: "uppercase", fontWeight: 700,
                      padding: "3px 8px",
                    }}
                  >
                    Too small
                  </div>
                )}
                {r.image && (
                  <img src={r.image} alt={r.id}
                    style={{ width: 110, height: 90, objectFit: "cover", flexShrink: 0 }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: p.textPrimary, fontWeight: 500 }}>
                      {t(`rooms.${r.id}.name`) || r.id}
                    </div>
                    <div>
                      <span style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600 }}>
                        {fmtBhd(rate)}
                      </span>
                      <span style={{ color: p.textMuted, fontSize: "0.74rem", marginInlineStart: 6 }}>/ night</span>
                    </div>
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.82rem", marginTop: 4, lineHeight: 1.5 }}>
                    {t(`rooms.${r.id}.short`) || `${r.sqm} m² · sleeps ${r.occupancy}`}
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                    <div style={{ color: p.textMuted, fontSize: "0.72rem" }}>
                      {r.sqm} m² · sleeps up to <strong style={{ color: p.textPrimary }}>{r.occupancy}</strong>
                      {/* Operator-facing sub-cap detail (max X adults / max
                          Y children) is intentionally hidden from guests —
                          the validation banner explains a bad mix in plain
                          language. "Adults only" is the one policy that
                          stays visible because guests need it before
                          choosing the room. */}
                      {(r.maxChildren ?? r.occupancy) === 0 && (
                        <span style={{ color: p.warn, fontWeight: 600 }}> · adults only</span>
                      )}
                      {r.extraBedAvailable && (r.maxExtraBeds || 0) > 0 && (
                        <span style={{ marginInlineStart: 8, color: p.accent }}>· extra bed {fmtBhd(ebFee)}/night</span>
                      )}
                      {qty > 0 && nights >= 1 && (
                        <span style={{ marginInlineStart: 12 }}>
                          {qty} × {nights} nights
                          {ebShow && extraBeds > 0 ? <> + {extraBeds} bed × {fmtBhd(ebFee)} × {nights}n</> : null}
                          {" "}= <strong style={{ color: p.accent }}>{fmtBhd(subtotal)}</strong>
                        </span>
                      )}
                    </div>
                    <div className="inline-flex items-stretch" style={{ border: `1px solid ${p.border}` }}>
                      <button
                        onClick={() => decRoomType(r.id)}
                        disabled={qty === 0}
                        style={{
                          width: 36, color: qty > 0 ? p.textPrimary : p.textMuted,
                          borderInlineEnd: `1px solid ${p.border}`,
                          cursor: qty > 0 ? "pointer" : "not-allowed",
                          background: "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      ><Minus size={13} /></button>
                      <div style={{
                        minWidth: 44, padding: "0.5rem 0.7rem",
                        textAlign: "center",
                        color: qty > 0 ? p.accent : p.textMuted,
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: "1.1rem", fontWeight: 600,
                      }}>{qty}</div>
                      <button
                        onClick={() => addRoomType(r.id)}
                        disabled={blocked}
                        title={blocked ? fit.reason : undefined}
                        style={{
                          width: 36, color: blocked ? p.textMuted : p.accent,
                          borderInlineStart: `1px solid ${p.border}`,
                          cursor: blocked ? "not-allowed" : "pointer",
                          background: "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      ><Plus size={13} /></button>
                    </div>
                  </div>
                  {blocked && fit.reason && (
                    <div style={{
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
                      color: p.warn, marginTop: 6, lineHeight: 1.5,
                    }}>{fit.reason}</div>
                  )}

                  {/* Extra-bed stepper — surfaces only after a suite is added
                      and only for types that allow rollaways. Capped at
                      maxExtraBeds × line quantity. */}
                  {ebShow && (
                    <div className="mt-3 p-3 flex items-center justify-between gap-3 flex-wrap"
                      style={{
                        backgroundColor: extraBeds > 0 ? `${p.accent}10` : p.bgPanelAlt,
                        border: `1px dashed ${extraBeds > 0 ? p.accent : p.border}`,
                      }}>
                      <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.5 }}>
                        <strong>Extra bed</strong>
                        <span style={{ color: p.textMuted }}>
                          {" "}— up to {ebCap} for this {qty === 1 ? "suite" : `${qty}-suite line`} · {fmtBhd(ebFee)}/night each
                          {(r.extraBedAdds?.adults || 0) + (r.extraBedAdds?.children || 0) > 0 && (
                            <> · adds {[
                              (r.extraBedAdds?.adults   || 0) > 0 ? `${r.extraBedAdds.adults} adult${r.extraBedAdds.adults === 1 ? "" : "s"}` : null,
                              (r.extraBedAdds?.children || 0) > 0 ? `${r.extraBedAdds.children} child${r.extraBedAdds.children === 1 ? "" : "ren"}` : null,
                            ].filter(Boolean).join(" + ")}/bed</>
                          )}
                        </span>
                      </div>
                      <div className="inline-flex items-stretch" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
                        <button
                          onClick={() => setExtraBedsForRoom?.(r.id, -1)}
                          disabled={extraBeds === 0}
                          style={{
                            width: 32, color: extraBeds > 0 ? p.textPrimary : p.textMuted,
                            borderInlineEnd: `1px solid ${p.border}`,
                            cursor: extraBeds > 0 ? "pointer" : "not-allowed",
                            background: "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                          aria-label="Remove extra bed"
                        ><Minus size={13} /></button>
                        <div style={{
                          minWidth: 38, padding: "0.35rem 0.6rem",
                          textAlign: "center",
                          color: extraBeds > 0 ? p.accent : p.textMuted,
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: "1.05rem", fontWeight: 600,
                        }}>{extraBeds}</div>
                        <button
                          onClick={() => setExtraBedsForRoom?.(r.id, +1)}
                          disabled={extraBeds >= ebCap}
                          style={{
                            width: 32, color: extraBeds < ebCap ? p.accent : p.textMuted,
                            borderInlineStart: `1px solid ${p.border}`,
                            cursor: extraBeds < ebCap ? "pointer" : "not-allowed",
                            background: "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                          aria-label="Add extra bed"
                        ><Plus size={13} /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {stays.length > 0 && (
        <Card title="Guests & special requests" className="mt-5">
          <div className="space-y-3">
            {stays.map((s) => {
              const room = rooms.find((r) => r.id === s.roomId);
              return (
                <div key={s.id} className="p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 500 }}>
                        {t(`rooms.${s.roomId}.name`) || s.roomId}
                      </span>
                      <span style={{ color: p.accent, marginInlineStart: 8, fontWeight: 700, fontSize: "0.82rem" }}>× {s.quantity}</span>
                    </div>
                    <button onClick={() => removeStay(s.id)} title="Remove"
                      style={{ color: p.textMuted, padding: "0.25rem 0.55rem", border: `1px solid ${p.border}`, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, background: "transparent", display: "inline-flex", alignItems: "center", gap: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = p.danger; e.currentTarget.style.borderColor = p.danger; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                    ><Trash2 size={11} /> Remove</button>
                  </div>
                  {(() => {
                    const occ  = room?.occupancy ?? 4;
                    const aCap = room?.maxAdults   ?? occ;
                    const cCap = room?.maxChildren ?? occ;
                    // Cap each stepper by the most restrictive of: the
                    // suite's per-type cap AND whatever's left in the
                    // total-occupancy budget after the other side's
                    // current value.
                    const adultsMax   = Math.min(aCap, Math.max(1, occ - (Number(s.children) || 0)));
                    const childrenMax = Math.min(cCap, Math.max(0, occ - (Number(s.adults)   || 0)));
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <NumberStepper label="Adults"   value={s.adults}   onChange={(v) => updateStay(s.id, { adults: v })}   min={1} max={adultsMax}   p={p} />
                        <NumberStepper label="Children" value={s.children} onChange={(v) => updateStay(s.id, { children: v })} min={0} max={childrenMax} p={p} />
                        <div>
                          <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>Special requests</label>
                          <input
                            value={s.notes || ""}
                            onChange={(e) => updateStay(s.id, { notes: e.target.value })}
                            placeholder="e.g. higher floor, quiet wing"
                            className="w-full outline-none"
                            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

// ─── Step 3 · Extras ────────────────────────────────────────────────────
function ExtrasStep({ activeExtras, pickedExtras, setPickedExtras, partySize, nights, requestNotes, setRequestNotes }) {
  const p = usePalette();
  return (
    <>
      <Card title={`Add to your stay · ${(activeExtras || []).length} available`}>
        {(activeExtras || []).length === 0 ? (
          <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>
            No add-ons configured at the moment — your suite already includes our standard amenities.
          </div>
        ) : (
          <div className="space-y-2">
            {activeExtras.map((e) => {
              const sel = !!pickedExtras[e.id];
              const computed = priceExtra(e, { adults: partySize, nights: Math.max(1, nights) });
              return (
                <label key={e.id} className="flex items-start gap-3 p-3 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: sel ? `${p.accent}10` : "transparent",
                    border: `1px solid ${sel ? p.accent : p.border}`,
                  }}
                >
                  <input type="checkbox" checked={sel}
                    onChange={() => setPickedExtras((m) => ({ ...m, [e.id]: !sel }))}
                    className="mt-1.5"
                  />
                  {e.icon && (
                    <ExtraIcon name={e.icon} size={20} style={{ color: p.accent, marginTop: 3, flexShrink: 0 }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 500 }}>
                        {e.title}
                      </span>
                      <div className="flex items-baseline gap-3">
                        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.accent, fontWeight: 600 }}>
                          {priceLabelFor(e)}
                        </span>
                        {sel && (
                          <span style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                            {fmtBhd(computed)}
                          </span>
                        )}
                      </div>
                    </div>
                    {e.note && (
                      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.78rem", marginTop: 2, lineHeight: 1.45 }}>
                        {e.note}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Anything else we should know?" className="mt-5">
        <textarea
          value={requestNotes}
          onChange={(e) => setRequestNotes(e.target.value)}
          rows={3}
          placeholder="Dietary preferences · arrival time · transport · accessibility needs…"
          className="w-full outline-none"
          style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical" }}
        />
      </Card>
    </>
  );
}

// ─── Step 4 · Confirm ───────────────────────────────────────────────────
function ConfirmStep({
  checkIn, checkOut, nights, stayTotals, extrasList, partySize,
  taxBreakdown, taxIncluded, subTotalRoom, extrasTotal, grandTotal,
  commissionDeduction = 0, grandTotalNet,
  requestNotes, kind, account, session, tier, pointsEarned, memberDiscountPct, agentCommission,
  guest, bookFor, totalAdults, totalChildren,
  isPrepay, paymentTiming, setPaymentTiming, payNowDiscount, payNowDiscountPct,
  cardName, setCardName, cardNum, setCardNum, cardExp, setCardExp, cardCvc, setCardCvc, cardMissing,
  canDeductCommission, deductCommission, setDeductCommission,
}) {
  const t = useT();
  const p = usePalette();
  return (
    <>
      <Card title="Review & confirm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Detail label="Check-in"  value={fmtDate(checkIn)} />
          <Detail label="Check-out" value={fmtDate(checkOut)} />
          <Detail label="Total nights" value={`${nights} ${nights === 1 ? "night" : "nights"}`} />
        </div>

        {/* Guest summary */}
        <div className="mt-4 p-3" style={{
          backgroundColor: bookFor === "other" ? `${p.accent}10` : p.bgPanelAlt,
          border: `1px solid ${bookFor === "other" ? p.accent : p.border}`,
          borderInlineStart: `3px solid ${bookFor === "other" ? p.accent : p.border}`,
        }}>
          <div className="flex items-center gap-2 mb-1">
            {bookFor === "other" ? <Users size={14} style={{ color: p.accent }} /> : <UserCircle2 size={14} style={{ color: p.textMuted }} />}
            <span style={{ color: bookFor === "other" ? p.accent : p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
              {bookFor === "other" ? "Booking for guest" : "Booking for yourself"}
            </span>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary, fontWeight: 500 }}>
            {guest.name}
          </div>
          <div className="flex flex-wrap gap-3 mt-1" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
            <span><Mail size={11} style={{ display: "inline", marginInlineEnd: 4 }} />{guest.email}</span>
            {guest.phone && <span><Phone size={11} style={{ display: "inline", marginInlineEnd: 4 }} />{guest.phone}</span>}
          </div>
          {bookFor === "other" && (
            <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6 }}>
              Booked by {session.displayName} ({session.email}) — confirmation goes to both inboxes.
            </div>
          )}
        </div>

        <div className="mt-4" style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
          Suites
        </div>
        <div className="space-y-2">
          {stayTotals.map((s) => (
            <div key={s.id} className="p-3 flex items-center justify-between flex-wrap gap-2" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
              <div className="min-w-0">
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 500 }}>
                  {t(`rooms.${s.roomId}.name`) || s.roomId} <span style={{ color: p.accent, fontWeight: 700, fontSize: "0.84rem" }}>× {s.quantity}</span>
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
                  {s.adults} adult{s.adults === 1 ? "" : "s"}{s.children > 0 ? ` · ${s.children} child${s.children === 1 ? "" : "ren"}` : ""}
                  {s.notes ? ` · ${s.notes}` : ""}
                </div>
              </div>
              <div className="text-end">
                <div style={{ color: p.textMuted, fontSize: "0.72rem" }}>{fmtBhd(s.rate)} × {nights} × {s.quantity}</div>
                <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", fontWeight: 600 }}>{fmtBhd(s.roomRevenue)}</div>
              </div>
            </div>
          ))}
        </div>
        {extrasList.length > 0 && (
          <>
            <div className="mt-4" style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 8 }}>
              Add-ons
            </div>
            <div className="space-y-1">
              {extrasList.map((e) => (
                <div key={e.id} className="flex items-center justify-between" style={{ color: p.textSecondary, fontSize: "0.86rem" }}>
                  <span>+ {e.title}</span>
                  <span style={{ color: p.accent, fontWeight: 600 }}>{fmtBhd(priceExtra(e, { adults: partySize, nights: Math.max(1, nights) }))}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {requestNotes && (
          <div className="mt-4 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
            <div style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 4 }}>
              Your notes
            </div>
            <div style={{ color: p.textSecondary, fontSize: "0.84rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{requestNotes}</div>
          </div>
        )}
      </Card>

      {kind === "member" && memberDiscountPct > 0 && (
        <div className="mt-5 p-4" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`, borderInlineStart: `3px solid ${p.accent}` }}>
          <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            LS Privilege · {tier?.name}
          </div>
          <div className="mt-2" style={{ color: p.textPrimary, fontSize: "0.86rem" }}>
            <strong>{memberDiscountPct}%</strong> member rate already applied to every suite.
          </div>
          {pointsEarned > 0 && (
            <div className="mt-1" style={{ color: p.textPrimary, fontSize: "0.86rem" }}>
              You'll earn <strong style={{ color: p.accent }}>{pointsEarned.toLocaleString()} points</strong> ({tier?.earnRate || 1} pts / BHD).
            </div>
          )}
        </div>
      )}
      {kind === "corporate" && !isPrepay && (
        <div className="mt-5 p-4" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`, borderInlineStart: `3px solid ${p.accent}` }}>
          <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            Corporate · {account.account}
          </div>
          <div className="mt-2" style={{ color: p.textPrimary, fontSize: "0.84rem", lineHeight: 1.5 }}>
            Charged to your contract on <strong>{account.paymentTerms || "Net 30"}</strong>. An invoice will be issued automatically against {account.id}.
          </div>
        </div>
      )}
      {kind === "agent" && !isPrepay && (
        <div className="mt-5 p-4" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`, borderInlineStart: `3px solid ${p.accent}` }}>
          <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            Agency · {account.name}
          </div>
          <div className="mt-2" style={{ color: p.textPrimary, fontSize: "0.84rem" }}>
            Booked at your net rates. <strong>{account.commissionPct}%</strong> commission accrued (≈ {fmtBhd(agentCommission)}).
          </div>
          {canDeductCommission && (
            <DeductCommissionToggle
              p={p}
              checked={!!deductCommission}
              onChange={(v) => setDeductCommission?.(v)}
              subtotal={subTotalRoom}
              bookingTotal={grandTotal}
              commissionPct={account.commissionPct}
              commissionAmount={agentCommission}
            />
          )}
        </div>
      )}

      {/* Pre-payment branch — when the underlying contract is on "Pre-payment
          (cash)" terms, swap the standard billed-to-account banner for the
          same Pay-on-arrival / Pay-now choice the public B2C BookingModal
          surfaces. Pricing for the room is still pulled from the contract
          (corporate dailyRates / agent dailyNet) — only the payment step
          changes here. */}
      {isPrepay && (
        <div className="mt-5 p-4" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`, borderInlineStart: `3px solid ${p.accent}` }}>
          <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            {kind === "corporate" ? <>Corporate · {account.account}</> : <>Agency · {account.name}</>}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            <PortalPaymentChoice
              active={paymentTiming === "later"}
              title="Pay on arrival"
              hint="Settled in cash at check-in. Booking held against the contract until then."
              onClick={() => setPaymentTiming?.("later")}
              p={p}
            />
            <PortalPaymentChoice
              active={paymentTiming === "now"}
              title="Pay now"
              hint={`${payNowDiscountPct}% off in exchange for non-refundable terms. Charged immediately.`}
              badge={`Save ${payNowDiscountPct}%`}
              onClick={() => setPaymentTiming?.("now")}
              p={p}
            />
          </div>
          <p className="mt-3" style={{ color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.55 }}>
            Pre-payment terms · this contract requires payment at booking. Choose pay-on-arrival or pay-now.
          </p>
          {paymentTiming === "now" && (
            <>
              <div className="mt-3 p-3" style={{
                backgroundColor: `${p.warn}14`,
                border: `1px solid ${p.warn}45`,
                fontSize: "0.78rem", lineHeight: 1.55, color: p.textPrimary,
              }}>
                <div style={{
                  color: p.warn, fontSize: "0.58rem", letterSpacing: "0.22em",
                  textTransform: "uppercase", fontWeight: 700, marginBottom: 4,
                }}>
                  Non-refundable rate · Save {payNowDiscountPct}%
                </div>
                The full stay is charged immediately and is non-refundable. No refunds for cancellations, modifications, no-shows, or early check-out.
              </div>
              {/* Card-on-file capture — mirrors the public BookingModal's
                  required-card pattern. The raw PAN is never persisted;
                  buildCardOnFile masks before write. */}
              <div className="mt-3 grid gap-3">
                <label className="block">
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Name on card</div>
                  <input
                    value={cardName}
                    onChange={(e) => setCardName?.(e.target.value)}
                    className="w-full outline-none"
                    style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                  />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block col-span-3">
                    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Card number</div>
                    <input
                      value={cardNum}
                      onChange={(e) => setCardNum?.(e.target.value)}
                      placeholder="•••• •••• •••• ••••"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                    />
                  </label>
                  <label className="block">
                    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Exp</div>
                    <input
                      value={cardExp}
                      onChange={(e) => setCardExp?.(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                    />
                  </label>
                  <label className="block">
                    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>CVC</div>
                    <input
                      value={cardCvc}
                      onChange={(e) => setCardCvc?.(e.target.value)}
                      placeholder="•••"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
                    />
                  </label>
                </div>
                {cardMissing && (
                  <div style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5 }}>
                    Card details required for Pay-now bookings.
                  </div>
                )}
              </div>
            </>
          )}
          {/* Pre-payment branch · still allow agencies to deduct commission
              from the amount paid (pay-now → charged net of commission;
              pay-on-arrival → cash collected net of commission). */}
          {kind === "agent" && canDeductCommission && (
            <DeductCommissionToggle
              p={p}
              checked={!!deductCommission}
              onChange={(v) => setDeductCommission?.(v)}
              subtotal={subTotalRoom}
              bookingTotal={grandTotal}
              commissionPct={account.commissionPct}
              commissionAmount={agentCommission}
              prepay
              paymentTiming={paymentTiming}
            />
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DeductCommissionToggle — checkbox banner on the agent confirm step that
// lets the booker settle this stay net of commission. When ticked:
//   • renders a small subtotal / − commission / net due breakdown
//   • the parent flags the booking with commissionDeducted=true and
//     auto-issues a paid commission invoice on confirm()
// Reads from the active palette so it adapts to light/dark mode.
// ---------------------------------------------------------------------------
function DeductCommissionToggle({ p, checked, onChange, subtotal, commissionPct, commissionAmount, bookingTotal, prepay = false, paymentTiming = "later" }) {
  // Headline number — the booking total when supplied (so the mini-
  // breakdown stays in sync with the rail). Falls back to the room
  // subtotal for legacy callers that pre-date the bookingTotal prop.
  const grossLine = (typeof bookingTotal === "number" && bookingTotal > 0) ? bookingTotal : Number(subtotal || 0);
  const netDue = Math.max(0, Math.round((grossLine - Number(commissionAmount || 0)) * 1000) / 1000);
  const grossLabel = (typeof bookingTotal === "number" && bookingTotal > 0) ? "Booking total" : "Subtotal";
  return (
    <div className="mt-3 p-3" style={{
      backgroundColor: p.bgPanelAlt,
      border: `1px solid ${checked ? p.accent : p.border}`,
      borderInlineStart: `3px solid ${checked ? p.accent : p.border}`,
    }}>
      <label className="flex items-start gap-2" style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange?.(!!e.target.checked)}
          style={{ marginTop: 3, accentColor: p.accent, cursor: "pointer" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: p.textPrimary, fontFamily: "'Manrope', sans-serif",
            fontSize: "0.86rem", fontWeight: 600,
          }}>
            Deduct commission from this booking
          </div>
          <div className="mt-1" style={{
            color: p.textMuted, fontFamily: "'Manrope', sans-serif",
            fontSize: "0.76rem", lineHeight: 1.5,
          }}>
            {prepay
              ? paymentTiming === "now"
                ? "Pay the net of commission upfront. We'll auto-issue a paid commission invoice for your records."
                : "Net of commission collected at check-in. We'll auto-issue a paid commission invoice for your records."
              : "Pay the net of commission upfront. We'll auto-issue a paid commission invoice for your records."
            }
          </div>
        </div>
      </label>
      {checked && (
        <div className="mt-3 p-3" style={{
          backgroundColor: `${p.accent}10`,
          border: `1px solid ${p.accent}40`,
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.84rem",
        }}>
          <div className="flex items-baseline justify-between py-1" style={{ color: p.textSecondary }}>
            <span>{grossLabel}</span>
            <span style={{ color: p.textPrimary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtBhd(grossLine)}
            </span>
          </div>
          <div className="flex items-baseline justify-between py-1" style={{ color: p.textSecondary }}>
            <span>− {commissionPct}% commission</span>
            <span style={{ color: p.warn, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              − {fmtBhd(commissionAmount)}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1 pt-2" style={{
            borderTop: `1px solid ${p.border}`,
          }}>
            <span style={{ color: p.textPrimary, fontWeight: 600 }}>
              {prepay && paymentTiming === "now" ? "Net due now" : "Net due"}
            </span>
            <span style={{ color: p.accent, fontWeight: 700, fontSize: "1rem", fontVariantNumeric: "tabular-nums" }}>
              {fmtBhd(netDue)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Pay-now / Pay-on-arrival chip — chip-style toggle inside the partner-
// portal Confirm step. Mirrors the public BookingModal's PaymentChoice but
// reads the palette so it adapts to light/dark themes.
function PortalPaymentChoice({ active, title, hint, badge, onClick, p }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-start p-3 relative"
      style={{
        backgroundColor: active ? `${p.accent}1F` : p.bgPanelAlt,
        border: `1.5px solid ${active ? p.accent : p.border}`,
        cursor: "pointer", fontFamily: "'Manrope', sans-serif",
      }}
    >
      {badge && (
        <span style={{
          position: "absolute", top: -10, insetInlineEnd: 12,
          backgroundColor: p.success, color: "#FFFFFF",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase",
          fontWeight: 700, padding: "3px 9px",
        }}>{badge}</span>
      )}
      <div className="flex items-center gap-2">
        <span style={{
          width: 14, height: 14, borderRadius: "50%",
          border: `2px solid ${active ? p.accent : p.border}`,
          backgroundColor: active ? p.accent : "transparent",
          flexShrink: 0,
        }} />
        <span style={{ color: active ? p.accent : p.textPrimary, fontSize: "0.85rem", fontWeight: 700 }}>
          {title}
        </span>
      </div>
      <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 4, lineHeight: 1.5 }}>
        {hint}
      </div>
    </button>
  );
}

// ─── Sticky reservation rail ────────────────────────────────────────────
function ReservationRail({ p, checkIn, checkOut, nights, stayTotals, partySize, extrasList, subTotalRoom, grandTotal, taxBreakdown, taxIncluded, guest, bookFor, totalAdults, totalChildren, payNowDiscount = 0, payNowDiscountPct = 0, commissionDeduction = 0, commissionPct = 0, grandTotalNet }) {
  const t = useT();
  const guestsLabel = (() => {
    const a = Number(totalAdults) || 0;
    const c = Number(totalChildren) || 0;
    if (!a && !c) return null;
    return [
      a > 0 ? `${a} adult${a === 1 ? "" : "s"}` : null,
      c > 0 ? `${c} child${c === 1 ? "" : "ren"}` : null,
    ].filter(Boolean).join(", ");
  })();
  return (
    <Card title="Your reservation">
      <div style={{ color: p.textMuted, fontSize: "0.78rem", marginBottom: 8 }}>
        {fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights} {nights === 1 ? "night" : "nights"}
        {guestsLabel && <span> · {guestsLabel}</span>}
      </div>
      {guest?.name && (
        <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
          {bookFor === "other" ? <Users size={13} style={{ color: p.accent, flexShrink: 0 }} /> : <UserCircle2 size={13} style={{ color: p.textMuted, flexShrink: 0 }} />}
          <div className="min-w-0">
            <div style={{ color: p.textPrimary, fontSize: "0.84rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {guest.name}
            </div>
            {bookFor === "other" && (
              <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 1 }}>
                Booked for guest
              </div>
            )}
          </div>
        </div>
      )}
      {stayTotals.length === 0 ? (
        <div className="p-3" style={{ border: `1px dashed ${p.border}`, color: p.textMuted, fontSize: "0.82rem", textAlign: "center" }}>
          Select your suite to continue.
        </div>
      ) : (
        <div className="space-y-1.5" style={{ fontSize: "0.86rem" }}>
          {stayTotals.map((s) => {
            const br = s.breakdown || {};
            const mixed = br.weekdayNights > 0 && br.weekendNights > 0;
            return (
              <React.Fragment key={s.id}>
                <div className="flex items-center justify-between">
                  <span style={{ color: p.textSecondary }}>{t(`rooms.${s.roomId}.short`) || s.roomId} × {s.quantity}</span>
                  <span style={{ color: p.textPrimary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(s.roomRevenue)}</span>
                </div>
                {/* Weekday/weekend split — shown when the stay spans both
                    buckets so the guest sees how the room subtotal
                    decomposes. */}
                {mixed && (
                  <>
                    <div className="flex items-center justify-between" style={{ color: p.textMuted, fontSize: "0.72rem", paddingInlineStart: 12 }}>
                      <span>{br.weekdayNights} × weekday × {fmtBhd(br.rateWeekday)}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBhd(br.weekdayNights * br.rateWeekday * s.quantity)}</span>
                    </div>
                    <div className="flex items-center justify-between" style={{ color: p.textMuted, fontSize: "0.72rem", paddingInlineStart: 12 }}>
                      <span>{br.weekendNights} × weekend × {fmtBhd(br.rateWeekend)}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBhd(br.weekendNights * br.rateWeekend * s.quantity)}</span>
                    </div>
                  </>
                )}
              </React.Fragment>
            );
          })}
          <div style={{ height: 1, backgroundColor: p.border, margin: "8px 0" }} />
          <div className="flex items-center justify-between" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
            <span>Room subtotal</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBhd(subTotalRoom)}</span>
          </div>
          {payNowDiscount > 0 && (
            <div className="flex items-center justify-between" style={{ color: p.accent, fontSize: "0.78rem", fontWeight: 700 }}>
              <span>Pay-now · {payNowDiscountPct}% off</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>− {fmtBhd(payNowDiscount)}</span>
            </div>
          )}
          {extrasList.map((e) => (
            <div key={e.id} className="flex items-center justify-between" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
              <span>+ {e.title}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBhd(priceExtra(e, { adults: partySize, nights: Math.max(1, nights) }))}</span>
            </div>
          ))}
          {!taxIncluded && taxBreakdown.totalTax > 0 && (
            <div className="flex items-center justify-between" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
              <span>Tax & levies</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBhd(taxBreakdown.totalTax)}</span>
            </div>
          )}
          {taxIncluded && (
            <div style={{ color: p.textMuted, fontSize: "0.74rem", fontStyle: "italic" }}>
              All taxes are included in your contract rate.
            </div>
          )}
          {/* Booking-total row appears whenever a commission deduction
              follows — separates the gross figure from the net obligation
              so the agent sees both. When there's no deduction this is
              omitted and the bottom row keeps showing the headline total. */}
          {commissionDeduction > 0 && (
            <div className="flex items-center justify-between" style={{ color: p.textMuted, fontSize: "0.78rem" }}>
              <span>Booking total</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtBhd(grandTotal)}</span>
            </div>
          )}
          {commissionDeduction > 0 && (
            <div className="flex items-center justify-between" style={{ color: p.success, fontSize: "0.78rem", fontWeight: 700 }}>
              <span>Commission deducted{commissionPct ? ` · ${commissionPct}%` : ""}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>− {fmtBhd(commissionDeduction)}</span>
            </div>
          )}
          <div style={{ height: 1, backgroundColor: p.border, margin: "10px 0" }} />
          <div className="flex items-center justify-between">
            <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              {commissionDeduction > 0 ? "Net due" : "Total"}
            </span>
            <span style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtBhd(commissionDeduction > 0 ? (grandTotalNet ?? grandTotal) : grandTotal)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

// Small +/- stepper used for guest counts
function NumberStepper({ label, value, onChange, min = 0, max = 99, p }) {
  return (
    <div>
      <label style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, display: "block", marginBottom: 6 }}>{label}</label>
      <div className="flex items-stretch" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
        <button onClick={() => onChange(Math.max(min, (Number(value) || 0) - 1))}
          style={{ width: 32, color: p.textMuted, borderInlineEnd: `1px solid ${p.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
          onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
        ><Minus size={12} /></button>
        <input
          type="number" min={min} max={max}
          value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || 0)))}
          className="flex-1 text-center outline-none"
          style={{ backgroundColor: "transparent", color: p.textPrimary, border: "none", padding: "0.6rem 0", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", minWidth: 0, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
        />
        <button onClick={() => onChange(Math.min(max, (Number(value) || 0) + 1))}
          style={{ width: 32, color: p.textMuted, borderInlineStart: `1px solid ${p.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
          onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
        ><Plus size={12} /></button>
      </div>
    </div>
  );
}

function statementHtml({ account, kind, from, to, invoices, payments, ledger = "booking" }) {
  const isCommission = ledger === "commission";
  const charged = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const paid    = invoices.reduce((s, i) => s + (i.paid || 0), 0);
  const balance = charged - paid;
  const accountName = account.account || account.name || account.id;
  // Commission ledger renders one row per invoice with the invoice's own
  // paid amount; the booking ledger interleaves invoices and discrete
  // payment records.
  const rows = isCommission
    ? invoices
        .map((i) => ({ kind: "Commission invoice", date: i.issued, ref: i.id, charged: i.amount, paid: i.paid || 0 }))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [
        ...invoices.map((i) => ({ kind: "Invoice", date: i.issued, ref: i.id, charged: i.amount, paid: 0 })),
        ...payments.map((pay) => ({ kind: "Payment", date: (pay.ts || "").slice(0, 10), ref: pay.id, charged: 0, paid: pay.amount * (pay.status === "refunded" ? -1 : 1) })),
      ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const labels = isCommission
    ? { eyebrow: "Commission ledger", docTitle: "Commission ledger", charged: "Commission earned", paid: "Commission paid", balance: "Commission owed by hotel", ledger: "Commission ledger", chargedCol: "Earned", paidCol: "Paid" }
    : { eyebrow: "Statement of account", docTitle: "Statement", charged: "Total charged", paid: "Total paid", balance: "Closing balance", ledger: "Ledger", chargedCol: "Charged", paidCol: "Paid" };

  return docShell({
    title: `${labels.docTitle} · ${accountName}`,
    body: `
    <div class="eyebrow">${esc(labels.eyebrow)} · ${esc(kind)}</div>
    <h1>${esc(accountName)}</h1>
    <div class="muted" style="margin-top:6px;">Period · ${esc(fmtDate(from))} → ${esc(fmtDate(to))}</div>
    <table>
      <tr><th>${esc(labels.charged)}</th><td style="text-align:right;">${esc(fmtBhd(charged))}</td></tr>
      <tr><th>${esc(labels.paid)}</th><td style="text-align:right;color:#16A34A;font-weight:700;">${esc(fmtBhd(paid))}</td></tr>
      <tr><th>${esc(labels.balance)}</th><td style="text-align:right;" class="total">${esc(fmtBhd(balance))}</td></tr>
    </table>
    <h2>${esc(labels.ledger)}</h2>
    <table>
      <tr><th>Date</th><th>Type</th><th>Reference</th><th style="text-align:right;">${esc(labels.chargedCol)}</th><th style="text-align:right;">${esc(labels.paidCol)}</th></tr>
      ${rows.map((r) => `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.kind)}</td><td>${esc(r.ref)}</td><td style="text-align:right;">${r.charged > 0 ? esc(fmtBhd(r.charged)) : "—"}</td><td style="text-align:right;color:${r.paid > 0 ? "#16A34A" : r.paid < 0 ? "#9A3A30" : "#6B665C"};">${r.paid !== 0 ? esc(fmtBhd(Math.abs(r.paid))) + (r.paid < 0 ? " (refund)" : "") : "—"}</td></tr>`).join("")}
      ${rows.length === 0 ? `<tr><td colspan="5" style="text-align:center;color:#6B665C;">${isCommission ? "No commission activity in this window." : "No activity in this window."}</td></tr>` : ""}
    </table>
    `,
  });
}
