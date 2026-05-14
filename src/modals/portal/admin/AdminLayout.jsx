import React, { useEffect, useRef, useState } from "react";
import {
  Activity, AlertCircle, BadgeCheck, BookOpen, Briefcase, Calendar as CalendarIcon, CalendarClock, ChevronDown, Clock,
  CreditCard, FileText, Gift, Globe, Hotel, LineChart, Mail, MessageCircle, Plus, Receipt, Server, Settings as SettingsIcon, ShieldCheck, Tag, Wifi, Wrench,
} from "lucide-react";
import { usePalette } from "../theme.jsx";
import { CalendarView }      from "./sections/CalendarView.jsx";
import { RoomsRates }        from "./sections/RoomsRates.jsx";
import { Offers }            from "./sections/Offers.jsx";
import { Extras }            from "./sections/Extras.jsx";
import { Invoices }          from "./sections/Invoices.jsx";
import { Payments }          from "./sections/Payments.jsx";
import { TaxSetup }          from "./sections/TaxSetup.jsx";
import { StopSaleOta }       from "./sections/StopSaleOta.jsx";
import { EmailTemplates }    from "./sections/EmailTemplates.jsx";
import { StaffAccess }       from "./sections/StaffAccess.jsx";
import { Reports }           from "./sections/Reports.jsx";
import { ScheduledReports }  from "./sections/ScheduledReports.jsx";
import { Maintenance }       from "./sections/Maintenance.jsx";
import { ActivityLog }       from "./sections/ActivityLog.jsx";
import { SiteContent }       from "./sections/SiteContent.jsx";
import { Messages }          from "./sections/Messages.jsx";
import { PropertyInfo }      from "./sections/PropertyInfo.jsx";
import { Ota }               from "./sections/Ota.jsx";
import { EmailSmtp }         from "./sections/EmailSmtp.jsx";
import { SystemDocs }        from "./sections/SystemDocs.jsx";
import { GiftCards }         from "./sections/GiftCards.jsx";

// Hotel Admin sub-nav. Dashboard and Bookings are now top-level tabs in
// PartnerPortal, so they're no longer listed here. The Operations dropdown
// retains the remaining back-office sub-sections.
const NAV = [
  { id: "calendar",    label: "Calendar",     icon: CalendarIcon },
  { id: "rooms",       label: "Rooms & Rates",icon: Hotel },
  { id: "offers",      label: "Offers",       icon: Tag },
  { id: "maintenance", label: "Maintenance",  icon: Wrench },
  {
    type: "group", id: "ops", label: "Operations", icon: Briefcase,
    items: [
      { id: "extras",      label: "Extras",            icon: Plus,         hint: "Booking-modal add-ons catalogue" },
      { id: "giftCards",   label: "Gift Cards",        icon: Gift,         hint: "Advance-purchase night packs · issue, track, redeem" },
      { id: "reports",     label: "Reports",           icon: LineChart,    hint: "Activities, revenue & forward-looking availability" },
      { id: "invoices",    label: "Invoices",          icon: FileText,     hint: "Folio and partner invoices" },
      { id: "payments",    label: "Payments",          icon: CreditCard,   hint: "Receipts, refunds, settlements" },
      { id: "messages",    label: "Messages",          icon: MessageCircle,hint: "Two-way chat with corporate, agent & member accounts" },
      { id: "activity",    label: "Activity Log",      icon: Activity,     hint: "Audit trail · sign-ins, impersonation, changes" },
    ],
  },
  {
    type: "group", id: "settings", label: "Settings", icon: SettingsIcon,
    items: [
      { id: "property",    label: "Property Info",     icon: BadgeCheck,   hint: "Legal name, CR & VAT, address, banking — appears on every document & footer" },
      { id: "tax",         label: "Tax Setup",         icon: Receipt,      hint: "VAT, levy, service charge" },
      { id: "emails",      label: "Email Templates",   icon: Mail,         hint: "Guest, partner & operations comms" },
      { id: "smtp",        label: "Email SMTP",        icon: Server,       hint: "Outbound mail server · host, port, credentials, sender identity" },
      { id: "siteContent", label: "Site Content",      icon: Globe,        hint: "Public marketing site copy & images — hero, intro, amenities, FAQs, contact" },
      { id: "schedules",   label: "Scheduled Reports", icon: CalendarClock,hint: "Cron-style daily/weekly/monthly email reports" },
      { id: "staff",       label: "Staff & Access",    icon: ShieldCheck,  hint: "Operator users, roles & permissions" },
      { id: "docs",        label: "System Overview",   icon: BookOpen,     hint: "Training & business-development deck · Markdown · HTML · Print to PDF" },
    ],
  },
  { id: "stopsale",  label: "Stop-Sale", icon: AlertCircle, danger: true },
  { id: "ota",       label: "OTA",       icon: Wifi, badge: "Soon" },
];

const SECTIONS = {
  calendar:    CalendarView,
  rooms:       RoomsRates,
  offers:      Offers,
  extras:      Extras,
  giftCards:   GiftCards,
  maintenance: Maintenance,
  reports:     Reports,
  schedules:   ScheduledReports,
  invoices:    Invoices,
  payments:    Payments,
  tax:         TaxSetup,
  property:    PropertyInfo,
  emails:      EmailTemplates,
  smtp:        EmailSmtp,
  messages:    Messages,
  siteContent: SiteContent,
  staff:       StaffAccess,
  activity:    ActivityLog,
  stopsale:    StopSaleOta,
  ota:         Ota,
  docs:        SystemDocs,
};

export const AdminLayout = ({ section: controlledSection, onSectionChange, params, clearParams, onNavigate }) => {
  const p = usePalette();
  const [internalSection, setInternalSection] = useState("calendar");
  const section = controlledSection ?? internalSection;
  const setSection = onSectionChange ?? setInternalSection;
  const Active = SECTIONS[section] || CalendarView;

  return (
    <div>
      <nav
        className="-mx-6 md:-mx-10 -mt-8 mb-6 overflow-x-auto sticky top-0 z-10"
        style={{
          borderBottom: `1px solid ${p.border}`,
          backgroundColor: p.bgPanel,
        }}
      >
        <div className="flex px-6 md:px-10">
          {NAV.map((item) => {
            if (item.type === "group") {
              return (
                <NavGroup
                  key={item.id}
                  group={item}
                  current={section}
                  onSelect={setSection}
                />
              );
            }
            const Ic = item.icon;
            const active = section === item.id;
            const accentColor = item.danger ? p.danger : p.accent;
            const idleColor   = item.danger ? p.danger : p.textSecondary;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className="flex items-center gap-2 transition-colors flex-shrink-0"
                style={{
                  padding: "0.85rem 1.1rem",
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.72rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: active ? 700 : item.danger ? 700 : 500,
                  color: active ? accentColor : idleColor,
                  borderBottom: active ? `2px solid ${accentColor}` : "2px solid transparent",
                  backgroundColor: active ? (item.danger ? `${p.danger}10` : p.bgPanelAlt) : "transparent",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = accentColor; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = idleColor; }}
              >
                <Ic size={14} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      backgroundColor: p.accent,
                      color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.5rem", letterSpacing: "0.18em", textTransform: "uppercase",
                      fontWeight: 700, padding: "1px 5px", marginInlineStart: 2,
                    }}
                  >
                    <Clock size={8} /> {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div>
        <Active params={params} clearParams={clearParams} onNavigate={onNavigate} />
      </div>
    </div>
  );
};

// Dropdown trigger + panel for a NAV group. Closes on outside-click or Esc.
// The panel is rendered in a portal-style fixed layer so it isn't clipped by
// the parent nav's overflow-x-auto.
function NavGroup({ group, current, onSelect }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const Ic = group.icon;
  const active = group.items.some((s) => s.id === current);
  const activeChild = group.items.find((s) => s.id === current);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom, left: r.left, minWidth: Math.max(280, r.width) });
  };

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => updateCoords();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 transition-colors flex-shrink-0"
        style={{
          padding: "0.85rem 1.1rem",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: active ? 700 : 500,
          color: active ? p.accent : p.textSecondary,
          borderBottom: active ? `2px solid ${p.accent}` : "2px solid transparent",
          backgroundColor: active ? p.bgPanelAlt : "transparent",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = p.accent; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = p.textSecondary; }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Ic size={14} />
        <span>{group.label}</span>
        {activeChild && (
          <span style={{ color: p.textMuted, fontWeight: 500, marginInlineStart: 2, textTransform: "none", letterSpacing: "0.04em" }}>
            · {activeChild.label}
          </span>
        )}
        <ChevronDown size={12} style={{ transition: "transform 160ms", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && coords && (
        <div
          ref={panelRef}
          role="menu"
          className="fixed z-[55]"
          style={{
            top: coords.top,
            left: coords.left,
            minWidth: coords.minWidth,
            backgroundColor: p.bgPanel,
            border: `1px solid ${p.border}`,
            borderTop: "none",
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
          }}
        >
          {group.items.map((s) => {
            const SubIc = s.icon;
            const isCurrent = s.id === current;
            return (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); setOpen(false); }}
                role="menuitem"
                className="w-full text-start flex items-start gap-3 px-4 py-3 transition-colors"
                style={{
                  borderBottom: `1px solid ${p.border}`,
                  backgroundColor: isCurrent ? p.bgPanelAlt : "transparent",
                  borderInlineStart: isCurrent ? `3px solid ${p.accent}` : "3px solid transparent",
                  fontFamily: "'Manrope', sans-serif",
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = p.bgHover; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <SubIc size={14} style={{ color: isCurrent ? p.accent : p.textMuted, marginTop: 3, flexShrink: 0 }} />
                <div className="min-w-0">
                  <div style={{
                    fontSize: "0.78rem",
                    fontWeight: isCurrent ? 700 : 600,
                    color: isCurrent ? p.accent : p.textPrimary,
                    letterSpacing: "0.04em",
                  }}>{s.label}</div>
                  {s.hint && (
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, lineHeight: 1.4 }}>
                      {s.hint}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
