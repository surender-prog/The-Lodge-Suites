import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowRight, Bell, BookOpen, CalendarCheck, Check,
  CheckCheck, ChevronRight, Coins, Inbox, LogIn, LogOut, Receipt, X,
} from "lucide-react";
import { useData } from "../data/store.jsx";
import { fmtRelative, NOTIFICATION_KINDS, filterForStaff, filterForGuest } from "../utils/notifications.js";

// ---------------------------------------------------------------------------
// NotificationBell — shared bell + drawer used by:
//   • Partner Portal header  (audience="staff")
//   • Guest Portal session bar (audience="guest", session={kind,accountId,…})
//
// Layout & legibility
//   The panel is a full-height side drawer with generous typography and a
//   filter strip across the top so a long feed stays scannable. Each row
//   is a "card" with a severity stripe, a kind icon, a title, body, meta,
//   and a "View →" affordance — hovering a row reveals the click target.
//   Clicking either marks the row as read (if it doesn't navigate) or
//   triggers the optional `onSelect` callback so the host can deep-link
//   to the related booking / invoice / payment.
// ---------------------------------------------------------------------------

// Map each notification kind to an icon. Keeps the row scan-friendly even
// for staff users who get a few dozen events a day.
const ICON_BY_KIND = {
  "booking-new":       BookOpen,
  "booking-confirmed": CalendarCheck,
  "booking-checkin":   LogIn,
  "booking-checkout":  LogOut,
  "booking-cancelled": AlertTriangle,
  "booking-status":    BookOpen,
  "invoice-issued":    Receipt,
  "invoice-paid":      CheckCheck,
  "invoice-overdue":   AlertTriangle,
  "invoice-cancelled": AlertTriangle,
  "payment-received":  Coins,
  "payment-refunded":  Coins,
};

const SEVERITY_COLORS = {
  info:    { ink: "#2563EB", bg: "rgba(37,99,235,0.12)", bd: "rgba(37,99,235,0.45)" },
  success: { ink: "#16A34A", bg: "rgba(22,163,74,0.12)", bd: "rgba(22,163,74,0.45)" },
  warn:    { ink: "#D97706", bg: "rgba(217,119,6,0.12)", bd: "rgba(217,119,6,0.45)" },
  danger:  { ink: "#DC2626", bg: "rgba(220,38,38,0.12)", bd: "rgba(220,38,38,0.45)" },
};

// Filter tabs across the top of the drawer. The "All" tab keeps the
// unfiltered feed; the others narrow by `refType` so the operator can
// find a specific class of event quickly. "Unread" is a special case
// that filters by the read flag rather than refType.
const FILTERS = [
  { id: "all",       label: "All",      match: () => true },
  { id: "unread",    label: "Unread",   match: (n) => !n.read },
  { id: "bookings",  label: "Bookings", match: (n) => n.refType === "booking" },
  { id: "invoices",  label: "Invoices", match: (n) => n.refType === "invoice" },
  { id: "payments",  label: "Payments", match: (n) => n.refType === "payment" },
];

// Palette can be a usePalette() result or null — when null we render a
// dark-on-cream variant suitable for the public Guest Portal banner.
export const NotificationBell = ({ audience = "staff", session = null, palette = null, onSelect = null }) => {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useData();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  // Two refs: the bell trigger (so we know clicks on the bell don't count
  // as "outside"), and the portaled panel (same reason).
  const ref = useRef(null);
  const panelRef = useRef(null);

  // Filter notifications for the active audience. Staff always see the
  // staff feed; guests see only what's tagged for their identity.
  const audienceList = useMemo(() => {
    if (audience === "staff") return filterForStaff(notifications);
    return filterForGuest(notifications, session);
  }, [notifications, audience, session]);

  // Predicate factory used by markAll + clear so the operator's bulk
  // actions only touch their own audience's slice.
  const audiencePredicate = useMemo(() => {
    if (audience === "staff") return (n) => n.recipientType === "staff";
    return (n) => n.recipientType === session?.kind && (n.recipientId === session?.accountId || n.recipientId === session?.userId);
  }, [audience, session]);

  // Apply the active filter on top of the audience list.
  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    return audienceList.filter(f.match);
  }, [audienceList, filter]);

  const unread = audienceList.filter((n) => !n.read).length;

  // Per-tab counts so the chips show "Bookings · 4" etc.
  const tabCounts = useMemo(() => {
    const out = {};
    FILTERS.forEach((f) => { out[f.id] = audienceList.filter(f.match).length; });
    return out;
  }, [audienceList]);

  // Esc to close + click outside both the bell trigger AND the portaled
  // panel. We have to check both because the panel is no longer a DOM
  // descendant of the bell wrapper (it's portaled into <body>).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const inBell  = ref.current && ref.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inBell && !inPanel) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Theme — derive base ink/border colours from the palette when supplied,
  // otherwise fall back to the public-site dark hero palette.
  const ink         = palette?.textPrimary  || "#F5F1E8";
  const inkSoft     = palette?.textSecondary || palette?.textPrimary || "#E8E2D4";
  const border      = palette?.border       || "rgba(201,169,97,0.18)";
  const bgPanel     = palette?.bgPanel      || "#15161A";
  const bgPanelAlt  = palette?.bgPanelAlt   || "#1E2024";
  const bgPage      = palette?.bgPage       || "#0F1014";
  const bgHover     = palette?.bgHover      || "rgba(201,169,97,0.06)";
  const accent      = palette?.accent       || "#C9A961";
  const muted       = palette?.textMuted    || "#9B9588";

  const handleRowClick = (n) => {
    if (!n.read) markNotificationRead(n.id);
    if (onSelect) {
      onSelect(n);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      {/* Bell trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Notifications${unread > 0 ? ` · ${unread} unread` : ""}`}
        aria-label={`Notifications${unread > 0 ? ` · ${unread} unread` : ""}`}
        style={{
          width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "transparent",
          border: `1px solid ${border}`,
          color: unread > 0 ? accent : muted,
          cursor: "pointer", position: "relative",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = unread > 0 ? accent : muted; e.currentTarget.style.borderColor = border; }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6,
            minWidth: 18, height: 18,
            padding: "0 5px",
            backgroundColor: "#DC2626", color: "#FFFFFF",
            borderRadius: 999, border: `1.5px solid ${bgPanel}`,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
            fontWeight: 700, letterSpacing: "0.02em",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {/* Dropdown panel — rendered through a portal directly into <body>
          so it's immune to ancestor `overflow:hidden` / transform / etc.
          Always uses `position: fixed` so the coordinates reference the
          viewport. Tailwind utilities flip positioning + sizing at `sm`
          (640px): full-width sheet on mobile, 460px floating panel
          pinned to the top-right gutter on desktop. */}
      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="
            fixed inset-x-2 top-[60px] z-[1000]
            sm:inset-x-auto sm:right-4 sm:top-[64px]
            sm:w-[460px] sm:max-w-[calc(100vw-32px)]
          "
          style={{
            maxHeight: "min(78vh, 640px)",
            backgroundColor: bgPanel,
            border: `1px solid ${border}`,
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="min-w-0">
              <div style={{ color: accent, fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
                Notifications
              </div>
              <div style={{ color: ink, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.4rem", lineHeight: 1.05, marginTop: 3 }}>
                {unread === 0 ? "All caught up" : `${unread} unread`}
              </div>
              <div style={{ color: muted, fontSize: "0.74rem", marginTop: 4, lineHeight: 1.5 }}>
                {audience === "staff"
                  ? "Booking, invoice and payment events for the operations team."
                  : "Updates about your account at The Lodge Suites."}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {unread > 0 && (
                <button
                  onClick={() => markAllNotificationsRead(audiencePredicate)}
                  title="Mark all as read"
                  style={{
                    color: muted, fontSize: "0.58rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    padding: "0.4rem 0.7rem", border: `1px solid ${border}`,
                    backgroundColor: "transparent", cursor: "pointer", whiteSpace: "nowrap",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = border; }}
                ><Check size={10} /> All read</button>
              )}
              <button onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  color: muted, padding: 7,
                  border: `1px solid ${border}`,
                  backgroundColor: "transparent", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = border; }}
              ><X size={13} /></button>
            </div>
          </div>

          {/* Filter strip */}
          <div className="px-5 py-2.5 flex flex-wrap gap-1.5" style={{ borderBottom: `1px solid ${border}` }}>
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count = tabCounts[f.id] || 0;
              // Hide tabs with 0 count — except All / Unread which are
              // always available — so the strip stays clean.
              if (count === 0 && f.id !== "all" && f.id !== "unread") return null;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    padding: "0.3rem 0.65rem",
                    backgroundColor: active ? accent : "transparent",
                    color: active ? bgPanel : muted,
                    border: `1px solid ${active ? accent : border}`,
                    fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent; } }}
                  onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = border; } }}
                >
                  {f.label}
                  {count > 0 && (
                    <span style={{
                      backgroundColor: active ? bgPanel : `${accent}25`,
                      color: active ? accent : muted,
                      padding: "1px 5px", fontSize: "0.6rem", letterSpacing: 0,
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* List body */}
          <div className="flex-1" style={{ overflowY: "auto" }}>
            {list.length === 0 ? (
              <div className="text-center" style={{ padding: "2.5rem 1.5rem", color: muted, fontSize: "0.84rem" }}>
                <Inbox size={28} style={{ margin: "0 auto 10px", opacity: 0.55 }} />
                <div style={{ color: ink, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", fontStyle: "italic" }}>
                  {filter === "unread" ? "Nothing new"
                    : filter === "bookings" ? "No booking events yet"
                    : filter === "invoices" ? "No invoice events yet"
                    : filter === "payments" ? "No payment events yet"
                    : "Nothing here yet"}
                </div>
                <div style={{ marginTop: 6, lineHeight: 1.5, maxWidth: 280, marginInline: "auto" }}>
                  {audience === "staff"
                    ? "Booking, invoice and payment events will appear here as they happen."
                    : "Updates about your bookings, invoices and payments will appear here."}
                </div>
              </div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {list.map((n) => {
                  const Icon = ICON_BY_KIND[n.kind] || Bell;
                  const sev  = SEVERITY_COLORS[n.severity] || SEVERITY_COLORS.info;
                  const meta = NOTIFICATION_KINDS[n.kind];
                  const clickable = !n.read || !!onSelect;
                  return (
                    <li
                      key={n.id}
                      onClick={() => clickable && handleRowClick(n)}
                      style={{
                        display: "flex", flexDirection: "column", gap: 6,
                        padding: "0.85rem 1.1rem",
                        borderBottom: `1px solid ${border}`,
                        borderInlineStart: `3px solid ${n.read ? "transparent" : sev.ink}`,
                        backgroundColor: n.read ? "transparent" : bgPanelAlt,
                        cursor: clickable ? "pointer" : "default",
                      }}
                      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.backgroundColor = bgHover; }}
                      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.backgroundColor = n.read ? "transparent" : bgPanelAlt; }}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Icon chip */}
                        <span style={{
                          flexShrink: 0,
                          width: 30, height: 30,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: sev.bg, border: `1px solid ${sev.bd}`, color: sev.ink,
                        }}>
                          <Icon size={14} />
                        </span>
                        {/* Title + meta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <h4 style={{
                              margin: 0,
                              color: ink,
                              fontFamily: "'Cormorant Garamond', serif",
                              fontStyle: "italic", fontWeight: 500,
                              fontSize: "1.05rem", lineHeight: 1.25,
                              letterSpacing: "-0.005em",
                            }}>
                              {n.title}
                            </h4>
                            <span style={{
                              color: muted, fontSize: "0.66rem",
                              whiteSpace: "nowrap", flexShrink: 0,
                              fontVariantNumeric: "tabular-nums",
                            }}>{fmtRelative(n.ts)}</span>
                          </div>
                          {n.body && (
                            <p style={{
                              margin: "4px 0 0",
                              color: inkSoft, fontSize: "0.8rem",
                              lineHeight: 1.55, opacity: n.read ? 0.85 : 1,
                            }}>
                              {n.body}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Footer row — kind chip + ref + click affordance */}
                      <div className="flex items-center justify-between gap-3" style={{ paddingInlineStart: 40 }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {meta && (
                            <span style={{
                              fontSize: "0.52rem",
                              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "2px 7px",
                              color: sev.ink, backgroundColor: sev.bg, border: `1px solid ${sev.bd}`,
                            }}>{meta.label}</span>
                          )}
                          {n.refId && (
                            <span style={{
                              fontFamily: "ui-monospace, Menlo, monospace",
                              fontSize: "0.66rem", color: accent, letterSpacing: "0.04em", fontWeight: 600,
                            }}>{n.refId}</span>
                          )}
                        </div>
                        {clickable && (
                          <span style={{
                            color: muted, fontSize: "0.55rem",
                            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                            display: "inline-flex", alignItems: "center", gap: 4,
                            whiteSpace: "nowrap",
                          }}>
                            {onSelect ? "View" : "Mark read"} <ArrowRight size={10} />
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${border}`, backgroundColor: bgPanelAlt }}>
            <span style={{ color: muted, fontSize: "0.66rem" }}>
              {audienceList.length === 0
                ? "No events yet"
                : `${list.length} of ${audienceList.length} · oldest 200 retained`}
            </span>
            {audience === "staff" && (
              <span style={{ color: muted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                Live feed
              </span>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
