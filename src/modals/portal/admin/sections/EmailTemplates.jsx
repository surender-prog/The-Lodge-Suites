import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle, Bell, BookOpen, Briefcase, Building2, Check, ChevronDown, Copy,
  CreditCard, Edit2, Eye, FileText, Inbox, Mail, MailOpen, Megaphone, Plus,
  Power, Save, Search, Send, Settings, Sparkles, Tag, Trash2, X, Zap,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData } from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// Categories — drive the colour, icon, and grouping of every template.
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { id: "booking",   label: "Booking",   icon: BookOpen,   color: "accent"  },
  { id: "payment",   label: "Payment",   icon: CreditCard, color: "success" },
  { id: "invoice",   label: "Invoice",   icon: FileText,   color: "warn"    },
  { id: "loyalty",   label: "Loyalty",   icon: Sparkles,   color: "accent"  },
  { id: "contracts", label: "Contracts", icon: Briefcase,  color: "accent"  },
  { id: "ota",       label: "OTA",       icon: Inbox,      color: "warn"    },
  { id: "marketing", label: "Marketing", icon: Megaphone,  color: "success" },
  { id: "internal",  label: "Internal",  icon: Settings,   color: "textMuted" },
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// ---------------------------------------------------------------------------
// Trigger events grouped by category. The `auto` flag indicates the
// template is dispatched automatically by the system; `manual` flags
// templates the operator triggers from a workflow (e.g. RFP responses).
// ---------------------------------------------------------------------------
const TRIGGER_EVENTS = [
  // Booking
  { value: "booking.created",       label: "Booking created",        category: "booking" },
  { value: "booking.confirmed",     label: "Booking confirmed (paid)", category: "booking" },
  { value: "booking.modified",      label: "Booking modified",       category: "booking" },
  { value: "booking.cancelled",     label: "Booking cancelled",      category: "booking" },
  { value: "booking.precheck",      label: "Pre-arrival reminder (3 days)", category: "booking" },
  { value: "booking.checkinday",    label: "Check-in day welcome",   category: "booking" },
  { value: "booking.checkedin",    label: "Guest checked in",       category: "booking" },
  { value: "booking.checkedout",    label: "Guest checked out",      category: "booking" },
  { value: "booking.noshow",        label: "No-show flagged",        category: "booking" },
  // Payment
  { value: "payment.received",      label: "Payment received",       category: "payment" },
  { value: "payment.refunded",      label: "Refund issued",          category: "payment" },
  { value: "payment.failed",        label: "Payment failed",         category: "payment" },
  { value: "payment.deposit",       label: "Deposit captured",       category: "payment" },
  // Invoice
  { value: "invoice.issued",        label: "Invoice issued",         category: "invoice" },
  { value: "invoice.reminder",      label: "Invoice payment reminder (7d)", category: "invoice" },
  { value: "invoice.overdue",       label: "Invoice overdue",        category: "invoice" },
  // Loyalty
  { value: "loyalty.enrolled",      label: "Member enrolled",        category: "loyalty" },
  { value: "loyalty.tier_upgrade",  label: "Tier upgraded",          category: "loyalty" },
  { value: "loyalty.points_earned", label: "Points earned (post-stay)", category: "loyalty" },
  { value: "loyalty.points_redeemed", label: "Points redeemed",      category: "loyalty" },
  { value: "loyalty.free_night",    label: "Free-night unlocked",    category: "loyalty" },
  { value: "loyalty.statement",     label: "Member statement (monthly)", category: "loyalty" },
  { value: "loyalty.anniversary",   label: "Membership anniversary", category: "loyalty" },
  // Contracts
  { value: "contract.issued.corporate", label: "Corporate contract dispatched", category: "contracts" },
  { value: "contract.issued.agent",     label: "Travel-agent contract dispatched", category: "contracts" },
  { value: "contract.renewal",      label: "Contract renewal (60d before)", category: "contracts" },
  { value: "contract.expired",      label: "Contract expired",       category: "contracts" },
  { value: "rfp.received",          label: "RFP received",           category: "contracts" },
  { value: "agency.statement",      label: "Agency commission statement", category: "contracts" },
  // OTA / Channel
  { value: "ota.stopsale",          label: "Stop-sale dispatched",   category: "ota" },
  { value: "ota.rateupdate",        label: "Rate / allotment update", category: "ota" },
  { value: "ota.allotment",         label: "Allotment refresh",      category: "ota" },
  // Marketing
  { value: "marketing.newsletter",   label: "Newsletter dispatched",  category: "marketing" },
  { value: "marketing.special_offer", label: "Special offer launch",  category: "marketing" },
  { value: "marketing.birthday",    label: "Member birthday",        category: "marketing" },
  { value: "marketing.winback",     label: "Win-back · dormant",     category: "marketing" },
  // Internal
  { value: "internal.daily_handover", label: "Daily ops handover",   category: "internal" },
  { value: "internal.maintenance",   label: "Maintenance / disruption", category: "internal" },
];
const TRIGGER_BY_VALUE = Object.fromEntries(TRIGGER_EVENTS.map(e => [e.value, e]));

// ---------------------------------------------------------------------------
// Sample variables — keyed by the placeholder name. The preview substitutes
// these values into `{{...}}` tags. New custom placeholders that aren't in
// this table simply render as their literal text in the preview.
// ---------------------------------------------------------------------------
const SAMPLE_VARS = {
  // Hotel — universal
  hotelName:        "The Lodge Suites",
  hotelPhone:       "+973 1616 8146",
  hotelEmail:       "frontoffice@thelodgesuites.com",
  hotelAddress:     "Building 916, Road 4019, Block 340, Juffair, Manama, Bahrain",
  checkInTime:      "14:00",
  checkOutTime:     "12:00",
  today:            new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  // Booking
  guestName:        "Sarah Holloway",
  bookingId:        "LS-A8K2N4",
  roomType:         "Classic One-Bedroom Suite",
  checkInDate:      "12 May 2026",
  checkOutDate:     "19 May 2026",
  nights:           "7",
  guestCount:       "2",
  rate:             "BHD 44",
  totalAmount:      "BHD 339",
  cancellationCharge: "BHD 44",
  refundAmount:     "BHD 295",
  noShowCharge:     "BHD 44",
  // Payment
  amount:           "BHD 339",
  paymentMethod:    "Visa **** 4242",
  transactionId:    "TXN-7LK9MN",
  paymentDate:      "28 April 2026",
  // Invoice
  invoiceId:        "INV-2026-00184",
  issueDate:        "28 April 2026",
  dueDate:          "28 May 2026",
  paymentTerms:     "Net 30",
  accountName:      "BAPCO",
  pocName:          "Sara Al-Hammadi",
  contactName:      "Sara Al-Hammadi",
  // Loyalty
  memberName:       "Sarah Holloway",
  memberId:         "LS-P-D4E5F6",
  tier:             "Platinum",
  points:           "4,920",
  redeemableBhd:    "49",
  earnRate:         "1.5",
  pointsEarned:     "510",
  redeemedPoints:   "1,500",
  redeemedAmount:   "15",
  lifetimeNights:   "31",
  yearsAsMember:    "2",
  monthStays:       "2",
  monthNights:      "9",
  monthPointsEarned: "510",
  monthPointsRedeemed: "0",
  statementMonth:   "April 2026",
  tierBenefits:     "  · 24-hour late check-out\n  · Suite upgrade subject to availability\n  · Welcome amenity in-suite\n  · 1.5× points on every direct booking",
  // Contract / Agent
  contractId:       "AGR-2026-001",
  validFrom:        "1 January 2026",
  validTo:          "31 December 2026",
  creditLimit:      "BHD 10,000",
  commissionPct:    "10",
  rateStudio:       "32",
  rateOneBed:       "45",
  rateTwoBed:       "75",
  rateThreeBed:     "92",
  allotmentStudio:  "5",
  allotmentOneBed:  "8",
  allotmentTwoBed:  "3",
  allotmentThreeBed: "2",
  // RFP
  rfpId:            "RFP-7821",
  roomNights:       "320",
  // Agency statement
  monthBookings:    "5",
  monthStayValue:   "1,840",
  monthCommission:  "184",
  ytdCommission:    "1,248",
  paymentStatus:    "Settled · Net 30",
  // OTA
  startDate:        "10 April 2026",
  endDate:          "12 April 2026",
  effectiveDate:    "1 May 2026",
  roomTypes:        "All categories",
  reason:           "Formula 1 weekend",
  // Marketing
  newsletterMonth:  "April 2026",
  newsItem1:        "New all-day breakfast menu launches in the lobby café",
  newsItem2:        "Rooftop sunset yoga every Friday",
  newsItem3:        "Saudi National Day stay-and-explore package",
  offerHeadline:    "Stay 3, Pay 2 · Suite Escape",
  offerDetail:      "Book any suite for 3 nights and pay for 2. Includes breakfast for two, late check-out at 18:00 and complimentary airport transfer.",
  offerCode:        "STAY3PAY2",
  offerValidFrom:   "1 May 2026",
  offerValidTo:     "30 June 2026",
  // Internal
  arrivals:         "8",
  departures:       "5",
  inHouse:          "42",
  vipGuests:        "1 · LS-P-M4N5O6 (Platinum)",
  longStayCount:    "3",
  maintenanceFlags: "Suite 1602 · AC servicing 14:00",
  allergyFlags:     "Suite 904 · gluten-free breakfast",
  forecastOccupancy: "82",
};

// Group placeholders for the "Insert variable" picker.
const VARIABLE_GROUPS = [
  { label: "Hotel", keys: ["hotelName", "hotelPhone", "hotelEmail", "hotelAddress", "checkInTime", "checkOutTime", "today"] },
  { label: "Booking", keys: ["guestName", "bookingId", "roomType", "checkInDate", "checkOutDate", "nights", "guestCount", "rate", "totalAmount", "cancellationCharge", "refundAmount", "noShowCharge"] },
  { label: "Payment", keys: ["amount", "paymentMethod", "transactionId", "paymentDate"] },
  { label: "Invoice", keys: ["invoiceId", "issueDate", "dueDate", "paymentTerms", "accountName", "pocName"] },
  { label: "Loyalty", keys: ["memberName", "memberId", "tier", "points", "redeemableBhd", "earnRate", "pointsEarned", "redeemedPoints", "redeemedAmount", "lifetimeNights", "yearsAsMember", "tierBenefits", "statementMonth", "monthStays", "monthNights", "monthPointsEarned", "monthPointsRedeemed"] },
  { label: "Contract / Agent", keys: ["contractId", "accountName", "pocName", "validFrom", "validTo", "creditLimit", "commissionPct", "rateStudio", "rateOneBed", "rateTwoBed", "rateThreeBed", "allotmentStudio", "allotmentOneBed", "allotmentTwoBed", "allotmentThreeBed", "rfpId", "roomNights", "monthBookings", "monthStayValue", "monthCommission", "ytdCommission", "paymentStatus"] },
  { label: "OTA", keys: ["startDate", "endDate", "effectiveDate", "roomTypes", "reason"] },
  { label: "Marketing", keys: ["newsletterMonth", "newsItem1", "newsItem2", "newsItem3", "offerHeadline", "offerDetail", "offerCode", "offerValidFrom", "offerValidTo"] },
  { label: "Internal", keys: ["arrivals", "departures", "inHouse", "vipGuests", "longStayCount", "maintenanceFlags", "allergyFlags", "forecastOccupancy"] },
];

// Render a template by replacing {{key}} placeholders with sample values.
function renderTemplate(text, vars = SAMPLE_VARS) {
  return (text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{{${key}}}`));
}

// Auto-discover {{placeholders}} actually used in subject + body.
function discoverPlaceholders(template) {
  const re = /\{\{(\w+)\}\}/g;
  const seen = new Set();
  const text = `${template.subject || ""}\n${template.body || ""}`;
  let m;
  while ((m = re.exec(text))) seen.add(m[1]);
  return [...seen];
}

// ---------------------------------------------------------------------------
// Main section — list view with filters + KPI strip + actions.
// ---------------------------------------------------------------------------
export const EmailTemplates = () => {
  const p = usePalette();
  const {
    emailTemplates, upsertEmailTemplate, removeEmailTemplate,
    toggleEmailTemplate, duplicateEmailTemplate,
  } = useData();

  const [editing, setEditing] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const totals = useMemo(() => {
    const active   = emailTemplates.filter(t => t.active).length;
    const auto     = emailTemplates.filter(t => t.trigger?.auto).length;
    const builtIn  = emailTemplates.filter(t => t.builtIn).length;
    const custom   = emailTemplates.length - builtIn;
    const byCat    = {};
    emailTemplates.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + 1; });
    const topCat   = Object.entries(byCat).sort(([,a], [,b]) => b - a)[0]?.[0];
    return { active, auto, builtIn, custom, topCat };
  }, [emailTemplates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emailTemplates.filter((t) => {
      if (filterCat !== "all" && t.category !== filterCat) return false;
      if (filterStatus === "active" && !t.active) return false;
      if (filterStatus === "disabled" && t.active) return false;
      if (filterStatus === "auto" && !t.trigger?.auto) return false;
      if (filterStatus === "manual" && t.trigger?.auto) return false;
      if (filterStatus === "custom" && t.builtIn) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.description} ${t.category} ${t.subject} ${t.body} ${t.trigger?.event || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [emailTemplates, search, filterCat, filterStatus]);

  const newTemplate = () => {
    setEditing({
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: "", category: "booking", description: "",
      trigger: { event: "booking.confirmed", auto: false, delayMinutes: 0 },
      subject: "",
      body:
`Dear {{guestName}},

[Write your message here. Use the variable picker on the right to insert dynamic placeholders like {{bookingId}} or {{checkInDate}}.]

Kind regards,
{{hotelName}}`,
      fromName: "The Lodge Suites",
      fromEmail: "frontoffice@thelodgesuites.com",
      replyTo: "frontoffice@thelodgesuites.com",
      cc: "", bcc: "",
      active: false, builtIn: false,
      _new: true,
    });
  };

  return (
    <div>
      <PageHeader
        title="Email templates"
        intro="Every guest- and partner-facing communication the hotel sends, managed centrally with placeholders for dynamic content. Editing a built-in template overrides its content; disable rather than delete to silence a workflow."
        action={<PrimaryBtn onClick={newTemplate} small><Plus size={12} /> New template</PrimaryBtn>}
      />

      {/* KPI strip */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Stat label="Total templates" value={emailTemplates.length} hint={`${totals.builtIn} built-in · ${totals.custom} custom`} />
        <Stat label="Active" value={totals.active} hint={`${emailTemplates.length - totals.active} disabled`} color={totals.active === emailTemplates.length ? p.success : p.warn} />
        <Stat label="Auto-sent" value={totals.auto} hint={`${emailTemplates.length - totals.auto} manual`} color={p.accent} />
        <Stat label="Categories" value={CATEGORIES.length} hint={totals.topCat ? `Most: ${CATEGORY_BY_ID[totals.topCat]?.label}` : ""} />
        <Stat label="Custom templates" value={totals.custom} hint="Editable + removable" color={p.success} />
      </div>

      {/* Filter bar */}
      <Card padded={false} className="mb-4">
        <div className="px-5 py-3.5 flex items-center gap-3 flex-wrap" style={{ backgroundColor: p.bgPanelAlt, borderBottom: `1px solid ${p.border}` }}>
          <div className="relative flex-1 min-w-[220px]" style={{ maxWidth: 380 }}>
            <Search size={13} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: p.textMuted, pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, subject, body, trigger…"
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary,
                border: `1px solid ${p.border}`,
                paddingInlineStart: "2.2rem", paddingInlineEnd: search ? "2.2rem" : "0.75rem",
                paddingBlock: "0.55rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} title="Clear"
                style={{ position: "absolute", insetInlineEnd: 8, top: "50%", transform: "translateY(-50%)", color: p.textMuted }}>
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip active={filterCat === "all"} onClick={() => setFilterCat("all")} p={p}>All categories</FilterChip>
            {CATEGORIES.map((c) => (
              <FilterChip key={c.id} active={filterCat === c.id} onClick={() => setFilterCat(c.id)} color={p[c.color]} p={p}>{c.label}</FilterChip>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip active={filterStatus === "all"}      onClick={() => setFilterStatus("all")}      p={p}>All</FilterChip>
            <FilterChip active={filterStatus === "active"}   onClick={() => setFilterStatus("active")}   color={p.success} p={p}>Active</FilterChip>
            <FilterChip active={filterStatus === "disabled"} onClick={() => setFilterStatus("disabled")} color={p.warn}    p={p}>Disabled</FilterChip>
            <FilterChip active={filterStatus === "auto"}     onClick={() => setFilterStatus("auto")}     color={p.accent}  p={p}>Automated</FilterChip>
            <FilterChip active={filterStatus === "manual"}   onClick={() => setFilterStatus("manual")}   p={p}>Manual</FilterChip>
            <FilterChip active={filterStatus === "custom"}   onClick={() => setFilterStatus("custom")}   p={p}>Custom only</FilterChip>
          </div>
        </div>

        <TableShell>
          <thead>
            <tr>
              <Th>Template</Th>
              <Th>Category</Th>
              <Th>Trigger</Th>
              <Th>Subject preview</Th>
              <Th>Status</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tpl) => {
              const cat = CATEGORY_BY_ID[tpl.category];
              const Ic  = cat?.icon || Mail;
              const catColor = p[cat?.color] || p.accent;
              const trigger = TRIGGER_BY_VALUE[tpl.trigger?.event];
              const renderedSubject = renderTemplate(tpl.subject);
              return (
                <tr key={tpl.id}>
                  <Td>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center" style={{
                        width: 32, height: 32, flexShrink: 0,
                        backgroundColor: `${catColor}1A`,
                        border: `1px solid ${catColor}40`,
                        color: catColor,
                      }}>
                        <Ic size={14} />
                      </span>
                      <div className="min-w-0">
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary }}>{tpl.name}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, lineHeight: 1.4, maxWidth: 340 }}>{tpl.description}</div>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {tpl.builtIn ? (
                            <span style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.textMuted, border: `1px solid ${p.border}`,
                            }}>Built-in</span>
                          ) : (
                            <span style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.success, border: `1px solid ${p.success}`,
                            }}>Custom</span>
                          )}
                          <span style={{
                            fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            padding: "1px 6px", color: p.textMuted, fontFamily: "ui-monospace, Menlo, monospace",
                          }} title="Template ID">{tpl.id}</span>
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px",
                      color: catColor, border: `1px solid ${catColor}`,
                    }}>{cat?.label || tpl.category}</span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5" style={{ fontSize: "0.78rem" }}>
                      {tpl.trigger?.auto ? <Zap size={11} style={{ color: p.accent }} /> : <Send size={11} style={{ color: p.textMuted }} />}
                      <span style={{ color: p.textPrimary }}>{trigger?.label || tpl.trigger?.event || "—"}</span>
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                      {tpl.trigger?.auto ? "Automated" : "Manual trigger"}
                      {tpl.trigger?.delayMinutes ? ` · delay ${formatDelay(tpl.trigger.delayMinutes)}` : ""}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontSize: "0.78rem", lineHeight: 1.5, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {renderedSubject || <em style={{ color: p.textDim }}>—</em>}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, fontFamily: "ui-monospace, Menlo, monospace" }}>
                      → {tpl.fromEmail}
                    </div>
                  </Td>
                  <Td>
                    <button
                      onClick={() => { toggleEmailTemplate(tpl.id); pushToast({ message: `${tpl.name} · ${tpl.active ? "disabled" : "enabled"}`, kind: tpl.active ? "warn" : "success" }); }}
                      title={tpl.active ? "Disable template" : "Enable template"}
                      className="inline-flex items-center gap-1.5"
                      style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px",
                        color: tpl.active ? p.success : p.textMuted,
                        backgroundColor: tpl.active ? `${p.success}1A` : "transparent",
                        border: `1px solid ${tpl.active ? p.success : p.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <Power size={9} /> {tpl.active ? "Active" : "Disabled"}
                    </button>
                  </Td>
                  <Td align="end">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <RowIconBtn title="Preview rendered email"
                        icon={Eye}
                        onClick={() => setPreviewing(tpl)} p={p} />
                      <RowIconBtn title="Duplicate to a new draft"
                        icon={Copy}
                        onClick={() => { duplicateEmailTemplate(tpl.id); pushToast({ message: `Duplicated · ${tpl.name}` }); }}
                        p={p} />
                      <RowIconBtn title="Send a test email (mailto)"
                        icon={MailOpen}
                        onClick={() => sendTestEmail(tpl)} p={p} />
                      <button onClick={() => setEditing({ ...tpl })} className="inline-flex items-center gap-1.5 ml-1"
                        style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.accent}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <Edit2 size={11} /> Edit
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                  {emailTemplates.length === 0 ? (
                    <>No templates yet. <button onClick={newTemplate} style={{ color: p.accent, fontWeight: 700 }}>Create the first one →</button></>
                  ) : (
                    <>No templates match these filters.
                      <button onClick={() => { setSearch(""); setFilterCat("all"); setFilterStatus("all"); }} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Reset filters →</button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
      </Card>

      {editing && (
        <TemplateEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => { upsertEmailTemplate(t); setEditing(null); pushToast({ message: `Saved · ${t.name || "template"}` }); }}
          onRemove={(id) => { removeEmailTemplate(id); setEditing(null); pushToast({ message: "Removed", kind: "warn" }); }}
        />
      )}
      {previewing && (
        <TemplatePreview
          template={previewing}
          onClose={() => setPreviewing(null)}
          onEdit={() => { setEditing(previewing); setPreviewing(null); }}
        />
      )}
    </div>
  );
};

// Format a delay in minutes as a human-readable string.
function formatDelay(mins) {
  if (!mins) return "0m";
  const abs = Math.abs(mins);
  const sign = mins < 0 ? "-" : "+";
  if (abs >= 1440) return `${sign}${Math.round(abs / 1440)}d`;
  if (abs >= 60)   return `${sign}${Math.round(abs / 60)}h`;
  return `${sign}${abs}m`;
}

function sendTestEmail(tpl) {
  const subject = renderTemplate(tpl.subject);
  const body    = renderTemplate(tpl.body);
  const to      = tpl.replyTo || tpl.fromEmail || "";
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("[TEST] " + subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
  pushToast({ message: "Mail composer opened with rendered template" });
}

// ---------------------------------------------------------------------------
// TemplateEditor — full-page drawer with form + sticky live-preview.
// ---------------------------------------------------------------------------
function TemplateEditor({ draft: initial, onClose, onSave, onRemove }) {
  const p = usePalette();
  const [draft, setDraft] = useState(initial);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setTrigger = (patch) => setDraft((d) => ({ ...d, trigger: { ...(d.trigger || {}), ...patch } }));

  const subjectRef = useRef(null);
  const bodyRef    = useRef(null);
  const [activeField, setActiveField] = useState("body");

  const insertVariable = (key) => {
    const placeholder = `{{${key}}}`;
    const fld = activeField === "subject" ? "subject" : "body";
    const ref = activeField === "subject" ? subjectRef : bodyRef;
    const current = draft[fld] || "";
    const el = ref.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      const next  = current.slice(0, start) + placeholder + current.slice(end);
      set({ [fld]: next });
      // restore caret after the inserted placeholder
      setTimeout(() => {
        try {
          el.focus();
          const pos = start + placeholder.length;
          el.setSelectionRange(pos, pos);
        } catch (_) {}
      }, 0);
    } else {
      set({ [fld]: current + placeholder });
    }
  };

  const valid = !!draft.name?.trim() && !!draft.subject?.trim() && !!draft.body?.trim();

  const usedPlaceholders = useMemo(() => discoverPlaceholders(draft), [draft.subject, draft.body]);

  const triggerOptions = useMemo(() => {
    const ofCat = TRIGGER_EVENTS.filter(e => e.category === draft.category);
    return [...ofCat, ...TRIGGER_EVENTS.filter(e => e.category !== draft.category)];
  }, [draft.category]);

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={draft._new ? "New template" : (draft.builtIn ? "Edit · built-in" : "Edit template")}
      title={draft.name || "Untitled template"}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          {!draft._new && !draft.builtIn && (
            <>
              <GhostBtn onClick={() => onRemove(draft.id)} small danger><Trash2 size={11} /> Delete</GhostBtn>
              <div className="flex-1" />
            </>
          )}
          {draft.builtIn && (
            <>
              <span className="inline-flex items-center gap-1.5" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                <AlertCircle size={12} /> Built-in templates can't be deleted — disable instead.
              </span>
              <div className="flex-1" />
            </>
          )}
          <GhostBtn onClick={() => sendTestEmail(draft)} small><MailOpen size={11} /> Test send</GhostBtn>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={() => valid && onSave(draft)} small><Save size={12} /> {draft._new ? "Create template" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: form */}
        <div className="space-y-6">
          <Card title="Identity">
            <div className="space-y-4">
              <FormGroup label="Template name">
                <TextField value={draft.name} onChange={(v) => set({ name: v })} placeholder="e.g. Booking confirmation · long-stay" />
              </FormGroup>
              <FormGroup label="Description">
                <TextField value={draft.description} onChange={(v) => set({ description: v })} placeholder="One-line summary shown in the templates list" />
              </FormGroup>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormGroup label="Category">
                  <SelectField value={draft.category} onChange={(v) => set({ category: v })}
                    options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))} />
                </FormGroup>
                <FormGroup label="Status">
                  <div className="flex gap-2">
                    <button onClick={() => set({ active: true })}
                      style={{
                        flex: 1, padding: "0.55rem 0.75rem",
                        backgroundColor: draft.active ? `${p.success}1F` : "transparent",
                        border: `1px solid ${draft.active ? p.success : p.border}`,
                        color: draft.active ? p.success : p.textSecondary,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                      }}><Power size={11} className="inline mr-1.5" /> Active</button>
                    <button onClick={() => set({ active: false })}
                      style={{
                        flex: 1, padding: "0.55rem 0.75rem",
                        backgroundColor: !draft.active ? `${p.warn}1F` : "transparent",
                        border: `1px solid ${!draft.active ? p.warn : p.border}`,
                        color: !draft.active ? p.warn : p.textSecondary,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                      }}>Disabled</button>
                  </div>
                </FormGroup>
              </div>
            </div>
          </Card>

          <Card title="Trigger">
            <div className="space-y-4">
              <FormGroup label="Event">
                <SelectField
                  value={draft.trigger?.event || ""}
                  onChange={(v) => setTrigger({ event: v })}
                  options={triggerOptions.map(e => ({ value: e.value, label: `${CATEGORY_BY_ID[e.category]?.label} · ${e.label}` }))}
                />
              </FormGroup>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormGroup label="Send mode">
                  <div className="flex gap-2">
                    <button onClick={() => setTrigger({ auto: true })}
                      style={{
                        flex: 1, padding: "0.55rem 0.75rem",
                        backgroundColor: draft.trigger?.auto ? `${p.accent}1F` : "transparent",
                        border: `1px solid ${draft.trigger?.auto ? p.accent : p.border}`,
                        color: draft.trigger?.auto ? p.accent : p.textSecondary,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                      }}><Zap size={11} className="inline mr-1.5" /> Automated</button>
                    <button onClick={() => setTrigger({ auto: false })}
                      style={{
                        flex: 1, padding: "0.55rem 0.75rem",
                        backgroundColor: !draft.trigger?.auto ? `${p.textMuted}1F` : "transparent",
                        border: `1px solid ${!draft.trigger?.auto ? p.textSecondary : p.border}`,
                        color: !draft.trigger?.auto ? p.textPrimary : p.textSecondary,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                      }}><Send size={11} className="inline mr-1.5" /> Manual</button>
                  </div>
                </FormGroup>
                <FormGroup label="Delay (minutes · negative = before event)">
                  <TextField type="number" value={draft.trigger?.delayMinutes ?? 0} onChange={(v) => setTrigger({ delayMinutes: Number(v) })} suffix="min" />
                </FormGroup>
              </div>
              <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
                Delay examples: <code style={{ color: p.accent }}>+1440</code> sends 24h after the event (e.g. post-departure), <code style={{ color: p.accent }}>-4320</code> sends 3 days before (pre-arrival reminder), <code style={{ color: p.accent }}>0</code> sends immediately.
              </p>
            </div>
          </Card>

          <Card title="Sender">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormGroup label="From name"><TextField value={draft.fromName} onChange={(v) => set({ fromName: v })} /></FormGroup>
              <FormGroup label="From email"><TextField type="email" value={draft.fromEmail} onChange={(v) => set({ fromEmail: v })} /></FormGroup>
              <FormGroup label="Reply-to"><TextField type="email" value={draft.replyTo} onChange={(v) => set({ replyTo: v })} /></FormGroup>
              <FormGroup label="CC"><TextField type="email" value={draft.cc} onChange={(v) => set({ cc: v })} placeholder="comma,separated" /></FormGroup>
              <FormGroup label="BCC" className="sm:col-span-2"><TextField type="email" value={draft.bcc} onChange={(v) => set({ bcc: v })} placeholder="comma,separated" /></FormGroup>
            </div>
          </Card>

          <Card title="Subject line">
            <input
              ref={subjectRef}
              value={draft.subject ?? ""}
              onFocus={() => setActiveField("subject")}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder="e.g. Your stay at {{hotelName}} is confirmed · {{bookingId}}"
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
                padding: "0.65rem 0.8rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem",
              }}
            />
            <p className="mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
              Rendered: <span style={{ color: p.textPrimary, fontWeight: 600 }}>{renderTemplate(draft.subject) || <em style={{ color: p.textDim }}>(empty)</em>}</span>
            </p>
          </Card>

          <Card title="Body">
            <textarea
              ref={bodyRef}
              value={draft.body ?? ""}
              onFocus={() => setActiveField("body")}
              onChange={(e) => set({ body: e.target.value })}
              rows={18}
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
                padding: "0.85rem 0.95rem",
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "0.85rem",
                lineHeight: 1.65, resize: "vertical",
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
                Use <code style={{ color: p.accent, fontFamily: "ui-monospace, monospace" }}>{`{{placeholder}}`}</code> syntax. The picker on the right inserts at the cursor position in whichever field was last focused.
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>Insert into</span>
                <button
                  onClick={() => { setActiveField("subject"); subjectRef.current?.focus(); }}
                  style={{
                    padding: "0.3rem 0.7rem",
                    backgroundColor: activeField === "subject" ? `${p.accent}1F` : "transparent",
                    border: `1px solid ${activeField === "subject" ? p.accent : p.border}`,
                    color: activeField === "subject" ? p.accent : p.textSecondary,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  }}>Subject</button>
                <button
                  onClick={() => { setActiveField("body"); bodyRef.current?.focus(); }}
                  style={{
                    padding: "0.3rem 0.7rem",
                    backgroundColor: activeField === "body" ? `${p.accent}1F` : "transparent",
                    border: `1px solid ${activeField === "body" ? p.accent : p.border}`,
                    color: activeField === "body" ? p.accent : p.textSecondary,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  }}>Body</button>
              </div>
            </div>
            {usedPlaceholders.length > 0 && (
              <div className="mt-3 flex items-baseline gap-2 flex-wrap" style={{ paddingTop: 12, borderTop: `1px solid ${p.border}` }}>
                <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Placeholders used</span>
                {usedPlaceholders.map((k) => (
                  <span key={k} style={{
                    fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.72rem",
                    padding: "1px 6px",
                    color: SAMPLE_VARS[k] !== undefined ? p.accent : p.warn,
                    border: `1px solid ${SAMPLE_VARS[k] !== undefined ? p.accent : p.warn}`,
                  }}>
                    {`{{${k}}}`}{SAMPLE_VARS[k] === undefined && " · custom"}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: sticky preview + variable picker */}
        <aside className="space-y-4 lg:sticky lg:top-4 self-start">
          <Card padded={false}
            title={
              <div className="flex items-center gap-2">
                <Eye size={12} /> <span>Live preview</span>
              </div>
            }
          >
            <PreviewBlock template={draft} p={p} />
          </Card>

          <Card padded={false} title={<><Tag size={11} className="inline mr-1.5" />Variables</>}>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {VARIABLE_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className="px-4 py-2" style={{
                    backgroundColor: p.bgPanelAlt,
                    color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                    borderBottom: `1px solid ${p.border}`,
                  }}>
                    {g.label}
                  </div>
                  <div className="px-3 py-2 flex flex-wrap gap-1.5" style={{ borderBottom: `1px solid ${p.border}` }}>
                    {g.keys.map((key) => (
                      <button
                        key={key}
                        onClick={() => insertVariable(key)}
                        title={`Insert {{${key}}} (sample: ${SAMPLE_VARS[key] || "—"})`}
                        style={{
                          padding: "0.25rem 0.55rem",
                          backgroundColor: "transparent",
                          border: `1px solid ${p.border}`,
                          color: p.textSecondary,
                          fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.68rem",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
                      >
                        {`{{${key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="px-4 py-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", lineHeight: 1.55 }}>
              Click any variable to insert it at the cursor in the {activeField === "subject" ? <strong style={{ color: p.accent }}>subject</strong> : <strong style={{ color: p.accent }}>body</strong>}. Variables outside this list still render as their literal placeholder in the preview.
            </p>
          </Card>
        </aside>
      </div>
    </Drawer>
  );
}

// Renders a styled "envelope" preview of subject + body with sample data.
function PreviewBlock({ template, p }) {
  return (
    <div>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>From</div>
        <div style={{ color: p.textPrimary, fontSize: "0.84rem", fontWeight: 600, marginTop: 2 }}>
          {template.fromName} <span style={{ color: p.textMuted, fontWeight: 400 }}>&lt;{template.fromEmail}&gt;</span>
        </div>
      </div>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Subject</div>
        <div style={{ color: p.textPrimary, fontSize: "0.92rem", fontWeight: 700, marginTop: 4, fontFamily: "'Cormorant Garamond', serif" }}>
          {renderTemplate(template.subject) || <em style={{ color: p.textDim, fontWeight: 400 }}>(no subject)</em>}
        </div>
      </div>
      <pre style={{
        backgroundColor: p.bgPanel, color: p.textPrimary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        padding: "16px 18px", margin: 0, maxHeight: 380, overflowY: "auto",
      }}>
        {renderTemplate(template.body) || "(empty body)"}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplatePreview — read-only modal showing the rendered email.
// ---------------------------------------------------------------------------
function TemplatePreview({ template, onClose, onEdit }) {
  const p = usePalette();
  const cat = CATEGORY_BY_ID[template.category];
  const trigger = TRIGGER_BY_VALUE[template.trigger?.event];

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Preview · ${cat?.label || template.category}`}
      title={template.name}
      fullPage
      contentMaxWidth="max-w-4xl"
      footer={
        <>
          <GhostBtn onClick={() => sendTestEmail(template)} small><MailOpen size={11} /> Test send</GhostBtn>
          <div className="flex-1" />
          <GhostBtn onClick={onClose} small>Close</GhostBtn>
          <PrimaryBtn onClick={onEdit} small><Edit2 size={11} /> Edit template</PrimaryBtn>
        </>
      }
    >
      <Card padded={false}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <PreviewMeta label="Trigger" value={trigger?.label || template.trigger?.event} accent p={p} />
            <PreviewMeta label="Send mode" value={template.trigger?.auto ? "Automated" : "Manual"} accent={template.trigger?.auto} p={p} />
            <PreviewMeta label="Status" value={template.active ? "Active" : "Disabled"} color={template.active ? p.success : p.warn} p={p} />
            <PreviewMeta label="Type" value={template.builtIn ? "Built-in" : "Custom"} p={p} />
            <PreviewMeta label="From" value={`${template.fromName} <${template.fromEmail}>`} mono p={p} />
            <PreviewMeta label="Reply-to" value={template.replyTo} mono p={p} />
            {template.cc && <PreviewMeta label="CC" value={template.cc} mono p={p} />}
            {template.bcc && <PreviewMeta label="BCC" value={template.bcc} mono p={p} />}
          </div>
        </div>
        <PreviewBlock template={template} p={p} />
      </Card>

      {/* Raw template — for backend integration / debugging */}
      <Card title="Raw template" padded={false} className="mt-6">
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
          Subject (with placeholders)
        </div>
        <pre style={{ padding: "12px 18px", margin: 0, color: p.textPrimary, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem", whiteSpace: "pre-wrap" }}>{template.subject}</pre>
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
          Body (with placeholders)
        </div>
        <pre style={{ padding: "16px 18px", margin: 0, color: p.textPrimary, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{template.body}</pre>
      </Card>
    </Drawer>
  );
}

function PreviewMeta({ label, value, color, accent, mono, p }) {
  return (
    <div>
      <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{
        color: color || (accent ? p.accent : p.textPrimary),
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : "'Manrope', sans-serif",
        fontSize: "0.86rem", fontWeight: 600, marginTop: 4, wordBreak: "break-word",
      }}>{value || "—"}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function FilterChip({ children, active, color, onClick, p }) {
  const c = color || p.accent;
  return (
    <button onClick={onClick}
      style={{
        padding: "0.3rem 0.7rem",
        backgroundColor: active ? `${c}1F` : "transparent",
        border: `1px solid ${active ? c : p.border}`,
        color: active ? c : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        whiteSpace: "nowrap", cursor: "pointer",
      }}>{children}</button>
  );
}

function RowIconBtn({ title, icon: Icon, onClick, p, disabled }) {
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: disabled ? p.textDim : p.textSecondary,
        border: `1px solid ${p.border}`, backgroundColor: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
    >
      <Icon size={12} />
    </button>
  );
}
