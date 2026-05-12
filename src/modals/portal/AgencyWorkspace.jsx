import React, { useMemo, useState } from "react";
import {
  AlertCircle, BedDouble, Briefcase, Building2, Calendar as CalendarIcon, Check,
  Coins, Copy, Crown, Download, Edit2, ExternalLink, Eye, EyeOff, FileText, Inbox,
  KeyRound, Layers, Lock, Mail, Paperclip, Phone, Plus, Printer,
  Receipt as ReceiptIcon, ScrollText, Send, Shield, Star, Trash2, User2,
  UserPlus, X,
} from "lucide-react";
import { usePalette } from "./theme.jsx";
import { useData, legalLine } from "../../data/store.jsx";
import { pushToast } from "./admin/ui.jsx";
import { BookingDocPreviewModal } from "./admin/BookingDocs.jsx";
import { AccountActivities } from "./ActivityHub.jsx";

// ---------------------------------------------------------------------------
// AgencyWorkspaceDrawer — full-page operator workspace for one travel-agent
// account. Mirrors the CorporateWorkspace pattern with commission-specific
// concepts: commission %, marketing fund, settlement tracking, per-booking
// commission earned. Tabs: Overview · Bookings · Invoices · Receipts ·
// Users · Statement.
// ---------------------------------------------------------------------------

// Default fallback. Live values come from `useData().hotelInfo` and are
// edited in the Property admin section. Statement helpers below close over
// the resolved value via closures created inside the component.
const FALLBACK_HOTEL = {
  name:    "The Lodge Suites",
  legal:   "The Lodge Hotel Apartments W.L.L.",
  address: "Building 916, Road 4019, Block 340",
  area:    "Shabab Avenue, Juffair, Manama",
  country: "Kingdom of Bahrain",
  cr:      "#####",
  vat:     "#####",
  phone:   "+973 1616 8146",
  email:   "frontoffice@thelodgesuites.com",
  emailAccounts: "accounts@thelodgesuites.bh",
  website: "www.thelodgesuites.com",
  iban:    "BH## NBOB ##############",
  bank:    "National Bank of Bahrain",
};

const fmtBhd  = (n) => `BHD ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfYearISO = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

const STATUS_BASE = {
  "confirmed":   "#2563EB",
  "in-house":    "#16A34A",
  "checked-out": "#64748B",
  "cancelled":   "#DC2626",
};
const PAYMENT_BASE = {
  paid:     "#16A34A",
  deposit:  "#D97706",
  invoiced: "#2563EB",
  pending:  "#DC2626",
};
const INVOICE_BASE = {
  paid:     "#16A34A",
  issued:   "#2563EB",
  overdue:  "#DC2626",
  partial:  "#D97706",
  draft:    "#64748B",
};

function chipStyle(base) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em",
    textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap",
    padding: "3px 9px",
    color: base, backgroundColor: `${base}1F`, border: `1px solid ${base}`,
  };
}
const dot = (base) => ({ width: 7, height: 7, borderRadius: 999, backgroundColor: base, display: "inline-block", flexShrink: 0 });

export function AgencyWorkspaceDrawer({ agency: initialAgency, onClose, onEditContract, onPreviewContract }) {
  const p = usePalette();
  const { agencies, bookings, invoices, payments, rooms, tax, extras, activities, hotelInfo, upsertAgency } = useData();
  const HOTEL = hotelInfo || FALLBACK_HOTEL;

  // Live agency reading from store so user / password changes flow back.
  const agency = agencies.find((a) => a.id === initialAgency.id) || initialAgency;

  const [tab, setTab] = useState("overview");
  const [bookingPreview, setBookingPreview] = useState(null);
  const [stmtFrom, setStmtFrom] = useState(startOfYearISO());
  const [stmtTo,   setStmtTo]   = useState(todayISO());

  // ---- Match bookings/invoices/payments to this agency ------------------
  const agentBookings = useMemo(() => {
    return bookings
      .filter((b) => b.agencyId === agency.id || (b.source === "agent" && !b.agencyId))
      .sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
  }, [bookings, agency.id]);

  const agentInvoices = useMemo(() => {
    return invoices
      .filter((i) => i.clientType === "agent" && (i.clientName === agency.name || i.agencyId === agency.id))
      .sort((a, b) => new Date(b.issued) - new Date(a.issued));
  }, [invoices, agency.name, agency.id]);

  const agentPayments = useMemo(() => {
    const bookingIds = new Set(agentBookings.map((b) => b.id));
    return payments
      .filter((pmt) => bookingIds.has(pmt.bookingId) || agentInvoices.some((i) => i.bookingId === pmt.bookingId))
      .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [payments, agentBookings, agentInvoices]);

  // ---- KPIs --------------------------------------------------------------
  const kpis = useMemo(() => {
    const ytdBookings = agency.ytdBookings || 0;
    const ytdRevenue  = agency.ytdRevenue  || 0;
    const ytdComm     = agency.ytdCommission || 0;
    const targetPct   = agency.targetBookings > 0 ? Math.round((ytdBookings / agency.targetBookings) * 100) : 0;
    const pendingComm = agentBookings.filter(b => b.status === "stayed" && !b.invoiced).reduce((s, b) => s + (b.comm || 0), 0);
    const outstanding = agentInvoices.reduce((s, i) => s + ((i.amount || 0) - (i.paid || 0)), 0);
    const overdueCount = agentInvoices.filter(i => i.status === "overdue").length;
    const inHouse  = agentBookings.filter((b) => b.status === "in-house").length;
    const upcoming = agentBookings.filter((b) => b.status === "confirmed").length;
    return { ytdBookings, ytdRevenue, ytdComm, targetPct, pendingComm, outstanding, overdueCount, inHouse, upcoming };
  }, [agency, agentBookings, agentInvoices]);

  // ---- Statement period filter ------------------------------------------
  const statementInvoices = useMemo(() => agentInvoices.filter((i) => {
    const d = i.issued; return (!stmtFrom || d >= stmtFrom) && (!stmtTo || d <= stmtTo);
  }), [agentInvoices, stmtFrom, stmtTo]);

  const statementPayments = useMemo(() => agentPayments.filter((pmt) => {
    const d = (pmt.ts || "").slice(0, 10); return (!stmtFrom || d >= stmtFrom) && (!stmtTo || d <= stmtTo);
  }), [agentPayments, stmtFrom, stmtTo]);

  const statementTotals = useMemo(() => {
    const charged = statementInvoices.reduce((s, i) => s + (i.amount || 0), 0);
    const received = statementPayments.reduce((s, pmt) => s + (pmt.amount || 0), 0);
    const opening = agentInvoices
      .filter((i) => i.issued < stmtFrom)
      .reduce((s, i) => s + ((i.amount || 0) - (i.paid || 0)), 0);
    const closing = opening + charged - received;
    return { charged, received, opening, closing };
  }, [statementInvoices, statementPayments, agentInvoices, stmtFrom]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            Travel-agent workspace · {agency.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {agency.name}
          </div>
        </div>
        <button onClick={onClose}
          className="flex items-center gap-2"
          style={{
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
            fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        ><X size={14} /> Close</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
          {/* Identity banner */}
          <div className="p-6 mb-6 flex items-start gap-5 flex-wrap" style={{
            backgroundColor: `${p.accent}10`,
            border: `1px solid ${p.accent}40`,
            borderInlineStart: `4px solid ${p.accent}`,
          }}>
            <div className="flex items-center justify-center" style={{
              width: 72, height: 72, flexShrink: 0,
              border: `2px solid ${p.accent}`,
              backgroundColor: p.bgPanelAlt, color: p.accent,
            }}>
              <Briefcase size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.9rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
                  {agency.name}
                </h3>
                <span style={chipStyle(statusColorForContract(p, agency.status))}>
                  <span style={dot(statusColorForContract(p, agency.status))} />
                  {agency.status}
                </span>
                <span style={{
                  fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  padding: "2px 8px", color: p.accent, border: `1px solid ${p.accent}`, backgroundColor: `${p.accent}10`,
                }}>
                  {agency.commissionPct ?? 0}% commission
                  {agency.marketingFundPct ? ` + ${agency.marketingFundPct}% MF` : ""}
                </span>
              </div>
              <div className="mt-2" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em" }}>
                {agency.id}
              </div>
              <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                {agency.pocName && <span className="inline-flex items-center gap-1.5"><User2 size={11} style={{ color: p.accent }} /> {agency.pocName}</span>}
                {(agency.pocEmail || agency.contact) && <><span style={{ color: p.textMuted }}>·</span><span className="inline-flex items-center gap-1.5"><Mail size={11} style={{ color: p.accent }} /> {agency.pocEmail || agency.contact}</span></>}
                {agency.pocPhone && <><span style={{ color: p.textMuted }}>·</span><span className="inline-flex items-center gap-1.5"><Phone size={11} style={{ color: p.accent }} /> {agency.pocPhone}</span></>}
              </div>
              <div className="mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                Contract term: <strong style={{ color: p.textPrimary }}>{fmtDate(agency.startsOn)} → {fmtDate(agency.endsOn)}</strong>
                {agency.creditLimit ? <> · Credit limit: <strong style={{ color: p.textPrimary }}>{fmtBhd(agency.creditLimit)}</strong></> : null}
                {agency.paymentTerms ? <> · Payment: <strong style={{ color: p.textPrimary }}>{agency.paymentTerms}</strong></> : null}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={onPreviewContract}
                className="inline-flex items-center gap-1.5"
                style={{ padding: "0.45rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent, backgroundColor: "transparent", fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              ><Eye size={11} /> View contract</button>
              <button onClick={onEditContract}
                className="inline-flex items-center gap-1.5"
                style={{ padding: "0.45rem 0.85rem", backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              ><Edit2 size={11} /> Manage contract</button>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-6" style={{ backgroundColor: p.border }}>
            <Kpi label="YTD bookings"    value={`${kpis.ytdBookings}/${agency.targetBookings || 0}`}      hint={`${kpis.targetPct}% of plan`}                            color={kpis.targetPct >= 95 ? p.success : kpis.targetPct >= 70 ? p.warn : p.danger} icon={CalendarIcon} p={p} />
            <Kpi label="YTD revenue"     value={fmtBhd(kpis.ytdRevenue)}                                  hint={`${agency.ytdBookings || 0} bookings stayed`}            color={p.success}     icon={Coins} p={p} />
            <Kpi label="YTD commission"  value={fmtBhd(kpis.ytdComm)}                                     hint={`${agency.commissionPct ?? 0}% rate · ${fmtBhd(kpis.pendingComm)} pending`} color={p.accent}      icon={ScrollText} p={p} />
            <Kpi label="Outstanding"     value={fmtBhd(kpis.outstanding)}                                  hint={kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : "All current"}            color={kpis.overdueCount > 0 ? p.danger : kpis.outstanding > 0 ? p.warn : p.success} icon={AlertCircle}  p={p} />
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <Tab id="overview"   label="Overview"   count={null} active={tab === "overview"}   onClick={() => setTab("overview")}   p={p} />
            <Tab id="bookings"   label="Bookings"   count={agentBookings.length} active={tab === "bookings"} onClick={() => setTab("bookings")} p={p} />
            <Tab id="activities" label="Activities" count={(activities || []).filter((a) => a.accountKind === "agent" && a.accountId === agency.id).length} active={tab === "activities"} onClick={() => setTab("activities")} p={p} />
            <Tab id="invoices"   label="Invoices"   count={agentInvoices.length} active={tab === "invoices"} onClick={() => setTab("invoices")} p={p} />
            <Tab id="receipts"   label="Receipts"   count={agentPayments.length} active={tab === "receipts"} onClick={() => setTab("receipts")} p={p} />
            <Tab id="users"      label="Users"      count={(agency.users?.length || (agency.pocName ? 1 : 0))} active={tab === "users"} onClick={() => setTab("users")} p={p} />
            <Tab id="statement"  label="Statement"  count={null} active={tab === "statement"} onClick={() => setTab("statement")} p={p} />
          </div>

          {tab === "overview" && (
            <OverviewSection
              agency={agency} kpis={kpis} bookings={agentBookings}
              invoices={agentInvoices} payments={agentPayments} p={p}
              onSeeBookings={() => setTab("bookings")}
              onSeeInvoices={() => setTab("invoices")}
            />
          )}
          {tab === "bookings" && (
            <BookingsSection
              bookings={agentBookings} rooms={rooms} agency={agency} p={p}
              onPreviewInvoice={(b) => setBookingPreview({ booking: b, kind: "invoice" })}
              onPreviewReceipt={(b) => setBookingPreview({ booking: b, kind: "receipt" })}
            />
          )}
          {tab === "activities" && (
            <AccountActivities
              accountKind="agent"
              accountId={agency.id}
              accountName={agency.name}
            />
          )}
          {tab === "invoices" && (
            <InvoicesSection invoices={agentInvoices} bookings={agentBookings} agency={agency} p={p}
              onPreviewInvoice={(b) => setBookingPreview({ booking: b, kind: "invoice" })}
            />
          )}
          {tab === "receipts" && (
            <ReceiptsSection payments={agentPayments} bookings={agentBookings} agency={agency} p={p}
              onPreviewReceipt={(b) => setBookingPreview({ booking: b, kind: "receipt" })}
            />
          )}
          {tab === "users" && (
            <UsersSection agency={agency} upsertAgency={upsertAgency} p={p} />
          )}
          {tab === "statement" && (
            <StatementSection
              agency={agency}
              from={stmtFrom} to={stmtTo}
              setFrom={setStmtFrom} setTo={setStmtTo}
              invoices={statementInvoices} payments={statementPayments} totals={statementTotals}
              allInvoices={agentInvoices}
              p={p}
            />
          )}
        </div>
      </main>

      {bookingPreview && (
        <BookingDocPreviewModal
          booking={bookingPreview.booking}
          kind={bookingPreview.kind}
          tax={tax}
          rooms={rooms}
          extras={extras}
          onClose={() => setBookingPreview(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewSection({ agency, kpis, bookings, invoices, payments, p, onSeeBookings, onSeeInvoices }) {
  const recentBookings = bookings.slice(0, 5);
  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <CardBlock title="Recent bookings" action={
        <button onClick={onSeeBookings} className="inline-flex items-center gap-1.5"
          style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          See all {bookings.length} →
        </button>
      } p={p}>
        {recentBookings.length === 0 ? (
          <Empty p={p} text="No bookings on file for this agency yet." />
        ) : recentBookings.map((b) => (
          <div key={b.id} className="px-5 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <span style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700 }}>{b.id}</span>
                <span style={{ color: p.textPrimary, marginInlineStart: 8, fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem" }}>{b.guest}</span>
              </div>
              <span style={chipStyle(STATUS_BASE[b.status] || "#6B7280")}>
                <span style={dot(STATUS_BASE[b.status] || "#6B7280")} />
                {b.status}
              </span>
            </div>
            <div className="flex justify-between gap-2 mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
              <span>{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} · {b.nights} night{b.nights === 1 ? "" : "s"} · {fmtBhd(b.value || b.total)}</span>
              {b.comm > 0 && <span style={{ color: p.accent, fontWeight: 700 }}>+{fmtBhd(b.comm)} comm.</span>}
            </div>
          </div>
        ))}
      </CardBlock>

      <CardBlock title="Recent invoices" action={
        <button onClick={onSeeInvoices} className="inline-flex items-center gap-1.5"
          style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          See all {invoices.length} →
        </button>
      } p={p}>
        {recentInvoices.length === 0 ? (
          <Empty p={p} text="No commission invoices have been raised against this agency yet." />
        ) : recentInvoices.map((i) => {
          const balance = (i.amount || 0) - (i.paid || 0);
          return (
            <div key={i.id} className="px-5 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700 }}>{i.id}</span>
                <span style={chipStyle(INVOICE_BASE[i.status] || "#6B7280")}>
                  <span style={dot(INVOICE_BASE[i.status] || "#6B7280")} />
                  {i.status}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-2">
                <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                  Issued {fmtDate(i.issued)} · due {fmtDate(i.due)}
                </span>
                <span style={{ color: balance > 0 ? p.warn : p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtBhd(i.amount)}{balance > 0 ? <span style={{ color: p.danger, marginInlineStart: 6 }}>· {fmtBhd(balance)} due</span> : null}
                </span>
              </div>
            </div>
          );
        })}
      </CardBlock>

      <CardBlock title="Contract & commercials" p={p} className="lg:col-span-2">
        <div className="px-5 py-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Commission rate" value={`${agency.commissionPct ?? 0}%`} accent p={p} />
          <Field label="Marketing fund"  value={agency.marketingFundPct ? `${agency.marketingFundPct}%` : "—"} p={p} />
          <Field label="Payment terms"   value={agency.paymentTerms || "—"} p={p} />
          <Field label="Credit limit"    value={agency.creditLimit ? fmtBhd(agency.creditLimit) : "—"} p={p} />
          <Field label="YTD bookings"    value={`${kpis.ytdBookings}`} p={p} />
          <Field label="YTD revenue"     value={fmtBhd(kpis.ytdRevenue)} p={p} />
          <Field label="YTD commission"  value={fmtBhd(kpis.ytdComm)} accent p={p} />
          <Field label="Pacing"          value={`${kpis.targetPct}% of plan`} color={kpis.targetPct >= 95 ? p.success : kpis.targetPct >= 70 ? p.warn : p.danger} p={p} />
        </div>
        {agency.notes && (
          <div className="px-5 py-4" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Notes</div>
            <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{agency.notes}</div>
          </div>
        )}
      </CardBlock>

      {/* Signed contract — admin-uploaded countersigned PDF/image. Only
          render when present so the partner-facing view stays uncluttered
          for accounts still finalising paperwork. */}
      {agency.signedContractUrl && (
        <SignedContractCard account={agency} p={p} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignedContractCard — surfaces the countersigned contract uploaded in the
// admin ContractEditor. Shows filename, upload date, and Open / Download
// links that target the long-lived signed Supabase Storage URL.
// ---------------------------------------------------------------------------
function SignedContractCard({ account, p }) {
  return (
    <CardBlock title={<><Paperclip size={12} className="inline mr-1.5" /> Signed contract</>} p={p} className="lg:col-span-2">
      <div className="px-5 py-4 flex items-start gap-3 flex-wrap">
        <FileText size={22} style={{ color: p.accent, flexShrink: 0, marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <a
            href={account.signedContractUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.9rem",
              fontWeight: 700, wordBreak: "break-word", textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            {account.signedContractFilename || "Signed contract"}
          </a>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.76rem", marginTop: 4 }}>
            {account.signedContractUploadedAt
              ? <>Uploaded · {fmtDate(account.signedContractUploadedAt.slice(0, 10))}</>
              : "Uploaded"}
          </div>
        </div>
        <a
          href={account.signedContractUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={account.signedContractFilename || undefined}
          title="Download signed contract"
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "0.45rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent, backgroundColor: "transparent",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.accent}10`; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <Download size={11} /> Download
        </a>
      </div>
    </CardBlock>
  );
}

// ---------------------------------------------------------------------------
// Bookings — table with per-row preview shortcuts + commission column.
// ---------------------------------------------------------------------------
function BookingsSection({ bookings, rooms, agency, p, onPreviewInvoice, onPreviewReceipt }) {
  if (bookings.length === 0) {
    return <CardBlock title="Bookings" p={p}><Empty p={p} text="No bookings on file for this agency yet." /></CardBlock>;
  }
  return (
    <CardBlock title={`Bookings · ${bookings.length}`} p={p}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              {["Reference","Guest","Suite","Stay","Nights","Stay value","Commission","Status","Actions"].map((h) => (
                <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const room = rooms.find((r) => r.id === b.roomId);
              const hasPayment = (b.paid || 0) > 0;
              const stayValue = b.value || b.total || 0;
              return (
                <tr key={b.id} style={{ borderTop: `1px solid ${p.border}`, opacity: b.invoiced ? 0.7 : 1 }}>
                  <td className="px-4 py-3" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap" }}>{b.id || b.ref}</td>
                  <td className="px-4 py-3" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: p.textPrimary }}>{b.guest}</td>
                  <td className="px-4 py-3" style={{ color: p.textSecondary, whiteSpace: "nowrap" }}>{b.suite || (room?.id === "studio" ? "Studio" : room?.id === "one-bed" ? "1-Bed" : room?.id === "two-bed" ? "2-Bed" : room?.id === "three-bed" ? "3-Bed" : "—")}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap" }}>{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}</td>
                  <td className="px-4 py-3" style={{ fontVariantNumeric: "tabular-nums" }}>{b.nights}</td>
                  <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBhd(stayValue)}</td>
                  <td className="px-4 py-3" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {b.comm ? `+${fmtBhd(b.comm)}` : "—"}
                    {b.invoiced && <div style={{ color: p.success, fontSize: "0.65rem", fontWeight: 600, marginTop: 2 }}>✓ invoiced</div>}
                  </td>
                  <td className="px-4 py-3"><span style={chipStyle(STATUS_BASE[b.status] || "#6B7280")}><span style={dot(STATUS_BASE[b.status] || "#6B7280")} />{b.status}</span></td>
                  <td className="px-4 py-3 text-end">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <RowIconBtn title="Preview invoice / folio" icon={FileText} onClick={() => onPreviewInvoice(b)} p={p} />
                      <RowIconBtn title={hasPayment ? "Preview receipt" : "No payment yet"} icon={ReceiptIcon} onClick={() => onPreviewReceipt(b)} disabled={!hasPayment} p={p} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardBlock>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
function InvoicesSection({ invoices, bookings, agency, p, onPreviewInvoice }) {
  if (invoices.length === 0) {
    return <CardBlock title="Commission invoices" p={p}><Empty p={p} text="No commission invoices have been raised against this agency yet." /></CardBlock>;
  }
  return (
    <CardBlock title={`Commission invoices · ${invoices.length}`} p={p}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              {["Invoice","Booking","Issued","Due","Amount","Paid","Balance","Status","Actions"].map((h) => (
                <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => {
              const balance = (i.amount || 0) - (i.paid || 0);
              const linked = bookings.find((b) => b.id === i.bookingId);
              return (
                <tr key={i.id} style={{ borderTop: `1px solid ${p.border}` }}>
                  <td className="px-4 py-3" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap" }}>{i.id}</td>
                  <td className="px-4 py-3" style={{ color: p.textSecondary, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.74rem" }}>{i.bookingId === "—" ? "—" : i.bookingId}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap" }}>{fmtDate(i.issued)}</td>
                  <td className="px-4 py-3" style={{ color: i.status === "overdue" ? p.danger : p.textMuted, fontWeight: i.status === "overdue" ? 700 : 500, whiteSpace: "nowrap" }}>{fmtDate(i.due)}</td>
                  <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(i.amount)}</td>
                  <td className="px-4 py-3" style={{ color: p.success, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(i.paid)}</td>
                  <td className="px-4 py-3" style={{ color: balance > 0 ? p.danger : p.success, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(balance)}</td>
                  <td className="px-4 py-3"><span style={chipStyle(INVOICE_BASE[i.status] || "#6B7280")}><span style={dot(INVOICE_BASE[i.status] || "#6B7280")} />{i.status}</span></td>
                  <td className="px-4 py-3 text-end">
                    {linked ? (
                      <RowIconBtn title="Preview invoice document" icon={FileText} onClick={() => onPreviewInvoice(linked)} p={p} />
                    ) : (
                      <span style={{ color: p.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>Manual</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardBlock>
  );
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------
function ReceiptsSection({ payments, bookings, agency, p, onPreviewReceipt }) {
  if (payments.length === 0) {
    return <CardBlock title="Receipts" p={p}><Empty p={p} text="No commission payments received yet." /></CardBlock>;
  }
  const total = payments.reduce((s, pmt) => s + (pmt.amount || 0), 0);
  return (
    <CardBlock title={`Receipts · ${payments.length} · ${fmtBhd(total)} received`} p={p}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              {["Receipt","Date","Booking","Method","Amount","Net","Status","Actions"].map((h) => (
                <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((pmt) => {
              const linked = bookings.find((b) => b.id === pmt.bookingId);
              const isRefund = pmt.status === "refunded";
              return (
                <tr key={pmt.id} style={{ borderTop: `1px solid ${p.border}`, opacity: isRefund ? 0.6 : 1 }}>
                  <td className="px-4 py-3" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap" }}>{pmt.id}</td>
                  <td className="px-4 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap" }}>{fmtDate((pmt.ts || "").slice(0, 10))}</td>
                  <td className="px-4 py-3" style={{ color: p.textSecondary, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.74rem" }}>{pmt.bookingId === "—" ? "—" : pmt.bookingId}</td>
                  <td className="px-4 py-3" style={{ color: p.textSecondary, textTransform: "capitalize" }}>{pmt.method}</td>
                  <td className="px-4 py-3" style={{ color: isRefund ? p.danger : p.success, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {isRefund ? "− " : ""}{fmtBhd(pmt.amount)}
                  </td>
                  <td className="px-4 py-3" style={{ color: p.textMuted, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(pmt.net)}</td>
                  <td className="px-4 py-3"><span style={chipStyle(isRefund ? "#DC2626" : "#16A34A")}>{pmt.status}</span></td>
                  <td className="px-4 py-3 text-end">
                    {linked && !isRefund && (
                      <RowIconBtn title="Preview receipt" icon={ReceiptIcon} onClick={() => onPreviewReceipt(linked)} p={p} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardBlock>
  );
}

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------
function StatementSection({ agency, from, to, setFrom, setTo, invoices, payments, totals, allInvoices, p }) {
  const download = () => {
    const html = buildStatementHtml({ agency, from, to, invoices, payments, totals });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const safeId = String(agency.id || "agency").replace(/[^A-Za-z0-9_-]/g, "_");
    const a = document.createElement("a");
    a.href = url; a.download = `LS-Statement-${safeId}-${from}-to-${to}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const print = () => {
    const html = buildStatementHtml({ agency, from, to, invoices, payments, totals });
    const win = window.open("", "_blank", "width=900,height=900");
    if (!win) return;
    win.document.open(); win.document.write(html); win.document.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 350);
  };
  const sendEmail = () => {
    const subject = `${HOTEL.name} · Commission statement · ${agency.name} · ${fmtDate(from)} → ${fmtDate(to)}`;
    const body = [
      `Dear ${agency.pocName || "Partner"},`,
      "",
      `Please find your commission statement for the period ${fmtDate(from)} → ${fmtDate(to)}.`,
      "",
      `Agency:                ${agency.name}`,
      `Contract:              ${agency.id}`,
      `Commission rate:       ${agency.commissionPct || 0}%${agency.marketingFundPct ? ` + ${agency.marketingFundPct}% MF` : ""}`,
      `Period:                ${fmtDate(from)} → ${fmtDate(to)}`,
      "",
      `Opening balance:       ${fmtBhd(totals.opening)}`,
      `Charges in period:     ${fmtBhd(totals.charged)}`,
      `Payments in period:    ${fmtBhd(totals.received)}`,
      `Closing balance:       ${fmtBhd(totals.closing)}`,
      "",
      `For queries, please contact ${HOTEL.emailAccounts} or call ${HOTEL.phone}.`,
      "",
      "Kind regards,",
      "Accounts Team",
      HOTEL.name,
    ].join("\n");
    const to_  = agency.pocEmail || agency.contact || "";
    window.location.href = `mailto:${encodeURIComponent(to_)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const aging = useMemo(() => buildAging(allInvoices), [allInvoices]);

  return (
    <CardBlock title="Commission statement" action={
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={sendEmail} className="inline-flex items-center gap-1.5"
          style={{ padding: "0.4rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
        ><Mail size={11} /> Email</button>
        <button onClick={print} className="inline-flex items-center gap-1.5"
          style={{ padding: "0.4rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
        ><Printer size={11} /> Print</button>
        <button onClick={download} className="inline-flex items-center gap-1.5"
          style={{ padding: "0.4rem 0.85rem", backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
        ><Download size={11} /> Download statement</button>
      </div>
    } p={p}>
      <div className="px-5 py-4 grid sm:grid-cols-3 gap-3" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>From</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.45rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", width: "100%" }}
          />
        </div>
        <div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.45rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", width: "100%" }}
          />
        </div>
        <div className="flex items-end gap-1.5 flex-wrap">
          <RangeBtn label="This month" onClick={() => { const d = new Date(); setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10)); setTo(todayISO()); }} p={p} />
          <RangeBtn label="This year"  onClick={() => { setFrom(startOfYearISO()); setTo(todayISO()); }} p={p} />
          <RangeBtn label="Last 90d"   onClick={() => { setFrom(new Date(Date.now() - 90 * 86400_000).toISOString().slice(0,10)); setTo(todayISO()); }} p={p} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ backgroundColor: p.border }}>
        <Kpi label="Opening balance"  value={fmtBhd(totals.opening)}  hint={`As of ${fmtDate(from)}`}                                            color={totals.opening > 0 ? p.warn : p.textMuted} icon={Layers}     p={p} />
        <Kpi label="Charges in period" value={fmtBhd(totals.charged)} hint={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}    color={p.textPrimary} icon={FileText} p={p} />
        <Kpi label="Payments in period" value={fmtBhd(totals.received)} hint={`${payments.length} receipt${payments.length === 1 ? "" : "s"}`} color={p.success} icon={ReceiptIcon} p={p} />
        <Kpi label="Closing balance"   value={fmtBhd(totals.closing)} hint={`As of ${fmtDate(to)}`}                                              color={totals.closing > 0 ? p.danger : p.success} icon={Coins}    p={p} />
      </div>

      <div className="overflow-x-auto" style={{ borderTop: `1px solid ${p.border}` }}>
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              {["Date","Reference","Description","Charge","Payment","Balance"].map((h) => (
                <th key={h} className="text-start px-4 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <LedgerRows invoices={invoices} payments={payments} opening={totals.opening} p={p} />
          </tbody>
        </table>
      </div>

      {aging.total > 0 && (
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
          <div className="flex items-baseline justify-between mb-3">
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Outstanding aging
            </span>
            <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {fmtBhd(aging.total)} total
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "current", label: "Current",     base: "#16A34A" },
              { key: "thirty",  label: "31–60 days",  base: "#D97706" },
              { key: "sixty",   label: "61–90 days",  base: "#B45309" },
              { key: "ninety",  label: "90+ days",    base: "#DC2626" },
            ].map((b) => (
              <div key={b.key}>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>{b.label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: b.base, display: "inline-block" }} />
                  <span style={{ color: b.base, fontFamily: "'Manrope', sans-serif", fontSize: "0.94rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBhd(aging[b.key])}</span>
                </div>
                <div className="mt-2 h-1" style={{ backgroundColor: p.border }}>
                  <div className="h-full" style={{ width: `${aging.total > 0 ? Math.round((aging[b.key] / aging.total) * 100) : 0}%`, backgroundColor: b.base }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CardBlock>
  );
}

function LedgerRows({ invoices, payments, opening, p }) {
  const lines = [
    ...invoices.map((i) => ({ kind: "charge",  date: i.issued, ref: i.id, desc: `Commission invoice${i.bookingId && i.bookingId !== "—" ? " · " + i.bookingId : ""}`, amount: i.amount || 0 })),
    ...payments.map((pmt) => ({ kind: "payment", date: (pmt.ts || "").slice(0, 10), ref: pmt.id, desc: `Payment received · ${pmt.method}${pmt.bookingId && pmt.bookingId !== "—" ? " · " + pmt.bookingId : ""}`, amount: pmt.amount || 0, refund: pmt.status === "refunded" })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let bal = opening;
  return (
    <>
      <tr style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <td className="px-4 py-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontStyle: "italic" }}>—</td>
        <td className="px-4 py-3" style={{ color: p.textMuted, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.74rem" }}>—</td>
        <td className="px-4 py-3" style={{ color: p.textSecondary, fontStyle: "italic" }}>Opening balance</td>
        <td className="px-4 py-3"></td>
        <td className="px-4 py-3"></td>
        <td className="px-4 py-3" style={{ color: opening > 0 ? p.warn : p.textMuted, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "end", whiteSpace: "nowrap" }}>{fmtBhd(opening)}</td>
      </tr>
      {lines.map((l, i) => {
        if (l.kind === "charge") bal += l.amount;
        else if (l.refund) bal += l.amount;
        else bal -= l.amount;
        return (
          <tr key={i} style={{ borderTop: `1px solid ${p.border}` }}>
            <td className="px-4 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap" }}>{fmtDate(l.date)}</td>
            <td className="px-4 py-3" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.74rem", fontWeight: 700 }}>{l.ref}</td>
            <td className="px-4 py-3" style={{ color: p.textSecondary }}>{l.desc}</td>
            <td className="px-4 py-3" style={{ color: l.kind === "charge" ? p.warn : p.textDim, fontVariantNumeric: "tabular-nums", textAlign: "end", whiteSpace: "nowrap", fontWeight: l.kind === "charge" ? 700 : 500 }}>
              {l.kind === "charge" ? fmtBhd(l.amount) : "—"}
            </td>
            <td className="px-4 py-3" style={{ color: l.kind === "payment" ? (l.refund ? p.danger : p.success) : p.textDim, fontVariantNumeric: "tabular-nums", textAlign: "end", whiteSpace: "nowrap", fontWeight: l.kind === "payment" ? 700 : 500 }}>
              {l.kind === "payment" ? `${l.refund ? "−" : ""}${fmtBhd(l.amount)}` : "—"}
            </td>
            <td className="px-4 py-3" style={{ color: p.textPrimary, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "end", whiteSpace: "nowrap" }}>{fmtBhd(bal)}</td>
          </tr>
        );
      })}
      {lines.length === 0 && (
        <tr style={{ borderTop: `1px solid ${p.border}` }}>
          <td colSpan={6} className="px-4 py-8 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
            No charges or payments in this period.
          </td>
        </tr>
      )}
    </>
  );
}

function buildAging(invoices) {
  const today = Date.now();
  const buckets = { current: 0, thirty: 0, sixty: 0, ninety: 0, total: 0 };
  invoices.forEach((i) => {
    const balance = (i.amount || 0) - (i.paid || 0);
    if (balance <= 0) return;
    const dueMs = new Date(i.due).getTime();
    const ageDays = Math.max(0, Math.round((today - dueMs) / 86400_000));
    if (ageDays <= 30)      buckets.current += balance;
    else if (ageDays <= 60) buckets.thirty  += balance;
    else if (ageDays <= 90) buckets.sixty   += balance;
    else                    buckets.ninety  += balance;
    buckets.total += balance;
  });
  return buckets;
}

function buildStatementHtml({ agency, from, to, invoices, payments, totals }) {
  const merged = [
    ...invoices.map((i) => ({ kind: "charge",  date: i.issued, ref: i.id, desc: `Commission invoice${i.bookingId && i.bookingId !== "—" ? " · " + i.bookingId : ""}`, amount: i.amount || 0 })),
    ...payments.map((pmt) => ({ kind: "payment", date: (pmt.ts || "").slice(0, 10), ref: pmt.id, desc: `Payment received · ${pmt.method}${pmt.bookingId && pmt.bookingId !== "—" ? " · " + pmt.bookingId : ""}`, amount: pmt.amount || 0, refund: pmt.status === "refunded" })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let bal = totals.opening;
  const rows = merged.map((l) => {
    if (l.kind === "charge") bal += l.amount;
    else if (l.refund)       bal += l.amount;
    else                     bal -= l.amount;
    return `<tr>
      <td>${fmtDate(l.date)}</td>
      <td style="font-family:ui-monospace,Menlo,monospace; color:#8A7A4F;"><strong>${esc(l.ref)}</strong></td>
      <td>${esc(l.desc)}</td>
      <td class="num charge">${l.kind === "charge" ? fmtBhd(l.amount) : "—"}</td>
      <td class="num payment">${l.kind === "payment" ? `${l.refund ? "−" : ""}${fmtBhd(l.amount)}` : "—"}</td>
      <td class="num"><strong>${fmtBhd(bal)}</strong></td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Commission statement · ${esc(agency.name)} · ${esc(from)} to ${esc(to)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Manrope', system-ui, sans-serif; color: #15161A; background: #F5F1E8; margin: 0; padding: 30px; line-height: 1.55; font-size: 13px; }
  .doc { background: #FBF8F1; padding: 44px 56px; max-width: 920px; margin: 0 auto; box-shadow: 0 4px 22px rgba(0,0,0,0.08); }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 600; font-size: 2.3rem; margin: 0; line-height: 1.05; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 1.7rem; margin: 0; letter-spacing: 0.05em; }
  h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 1.4rem; margin: 26px 0 8px; }
  .eyebrow { font-size: 0.66rem; letter-spacing: 0.28em; text-transform: uppercase; color: #8A7A4F; font-weight: 700; }
  .muted { color: #555; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #15161A; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 22px; }
  .totals { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin: 22px 0; }
  .totals .cell { padding: 12px; background: rgba(201,169,97,0.08); border: 1px solid #d8d2c4; }
  .totals .label { font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; color: #8A7A4F; font-weight: 700; }
  .totals .value { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.5rem; font-weight: 600; color: #15161A; margin-top: 6px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
  th { border-bottom: 1.5px solid #15161A; padding: 8px 10px; text-align: start; font-size: 0.66rem; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; background: rgba(201,169,97,0.08); }
  th.num, td.num { text-align: right; }
  td { border-bottom: 1px solid #d8d2c4; padding: 8px 10px; vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
  td.num.charge { color: #B45309; }
  td.num.payment { color: #15803D; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #C9A961; font-size: 0.7rem; color: #666; text-align: center; letter-spacing: 0.05em; }
  @media print { body { background: #FBF8F1; padding: 0; } .doc { box-shadow: none; padding: 0; } }
</style>
</head><body>
<div class="doc">
  <div class="header">
    <div>
      <h1>${esc(HOTEL.name)}</h1>
      <div class="eyebrow" style="margin-top:4px;">${esc(HOTEL.address)} · ${esc(HOTEL.area)}</div>
      <div class="muted" style="font-size:0.74rem; margin-top:4px;">${esc([HOTEL.country, legalLine(HOTEL)].filter(Boolean).join(" · "))}</div>
    </div>
    <div style="text-align:right;">
      <h2>Commission Statement</h2>
      <div class="muted" style="margin-top:4px; font-size:0.74rem;">Period · ${esc(fmtDate(from))} → ${esc(fmtDate(to))}</div>
      <div class="muted" style="font-size:0.74rem; margin-top:2px;">Issued ${esc(fmtDate(todayISO()))}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Travel agent</div>
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.4rem; font-weight:600;">${esc(agency.name)}</div>
      <div class="muted" style="font-size:0.78rem;">${(agency.commissionPct || 0)}% commission${agency.marketingFundPct ? ` + ${agency.marketingFundPct}% MF` : ""}</div>
      ${agency.pocName  ? `<div style="margin-top:8px;">Attn: <strong>${esc(agency.pocName)}</strong></div>` : ""}
      ${(agency.pocEmail || agency.contact) ? `<div class="muted">${esc(agency.pocEmail || agency.contact)}</div>` : ""}
      ${agency.pocPhone ? `<div class="muted">${esc(agency.pocPhone)}</div>` : ""}
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Contract</div>
      <div style="font-family:'Cormorant Garamond', Georgia, serif; font-size:1.2rem; font-weight:600;">${esc(agency.id)}</div>
      <div class="muted" style="font-size:0.84rem; margin-top:4px;">${esc(fmtDate(agency.startsOn))} → ${esc(fmtDate(agency.endsOn))}</div>
      ${agency.paymentTerms ? `<div class="muted" style="font-size:0.78rem; margin-top:4px;">Payment terms: ${esc(agency.paymentTerms)}</div>` : ""}
      ${agency.creditLimit ? `<div class="muted" style="font-size:0.78rem;">Credit limit: ${fmtBhd(agency.creditLimit)}</div>` : ""}
    </div>
  </div>

  <div class="totals">
    <div class="cell"><div class="label">Opening balance</div><div class="value">${fmtBhd(totals.opening)}</div></div>
    <div class="cell"><div class="label">Charges</div><div class="value">${fmtBhd(totals.charged)}</div></div>
    <div class="cell"><div class="label">Payments</div><div class="value">${fmtBhd(totals.received)}</div></div>
    <div class="cell" style="background:rgba(201,169,97,0.16);"><div class="label">Closing balance</div><div class="value">${fmtBhd(totals.closing)}</div></div>
  </div>

  <h3>Ledger</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Reference</th><th>Description</th><th class="num">Charge</th><th class="num">Payment</th><th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="muted">—</td>
        <td class="muted">—</td>
        <td><em>Opening balance</em></td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num"><strong>${fmtBhd(totals.opening)}</strong></td>
      </tr>
      ${rows || `<tr><td colspan="6" class="muted" style="text-align:center; padding:24px;">No charges or payments in this period.</td></tr>`}
    </tbody>
  </table>

  <p style="margin-top:22px; font-size:0.86rem; line-height:1.7;">
    For any queries about this statement, please contact <strong>${esc(HOTEL.emailAccounts)}</strong> or call <strong>${esc(HOTEL.phone)}</strong>. Payments to <strong>${esc(HOTEL.bank)}</strong>, IBAN <strong>${esc(HOTEL.iban)}</strong>, quoting reference <strong>${esc(agency.id)}</strong>.
  </p>

  <div class="footer">
    ${esc(HOTEL.legal)} · ${esc(HOTEL.address)}, ${esc(HOTEL.area)} · ${esc(HOTEL.country)} · ${esc(HOTEL.phone)} · ${esc(HOTEL.email)} · ${esc(HOTEL.website)}
  </div>
</div>
</body></html>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statusColorForContract(p, status) {
  return ({ active: p.success, draft: p.warn, review: p.warn, suspended: p.danger, expired: p.textDim })[status] || p.textMuted;
}

// ---------------------------------------------------------------------------
// Users tab — same multi-user pattern as the corporate workspace, with
// agent-specific roles (Primary · Reservations · Accounts · Viewer).
// ---------------------------------------------------------------------------
const ROLE_OPTIONS = [
  { value: "primary",     label: "Primary",       hint: "Main agency contact · full access",      base: "#9A7E40" },
  { value: "reservations",label: "Reservations",  hint: "Can place bookings · read invoices",     base: "#2563EB" },
  { value: "accounts",    label: "Accounts",      hint: "Receives statements · manages payments", base: "#D97706" },
  { value: "viewer",      label: "Viewer",        hint: "Read-only access",                       base: "#64748B" },
];
const ROLE_BY_VALUE = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r]));

function deriveUsers(agency) {
  if (Array.isArray(agency.users) && agency.users.length > 0) return agency.users;
  if (agency.pocName || agency.pocEmail || agency.pocPhone || agency.contact) {
    return [{
      id:         "USR-PRIMARY",
      name:       agency.pocName  || "Primary contact",
      email:      agency.pocEmail || agency.contact || "",
      phone:      agency.pocPhone || "",
      role:       "primary",
      primary:    true,
      createdAt:  agency.signedOn || new Date().toISOString().slice(0, 10),
      lastLogin:  null,
    }];
  }
  return [];
}

function generatePassword() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += charset[Math.floor(Math.random() * charset.length)];
  return pwd;
}

function UsersSection({ agency, upsertAgency, p }) {
  const users = deriveUsers(agency);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pwId, setPwId] = useState(null);

  const persist = (next) => upsertAgency({ ...agency, users: next });

  const addUser = (data) => {
    const id = `USR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const isFirst = users.length === 0;
    const next = [...users, { ...data, id, primary: isFirst, createdAt: new Date().toISOString().slice(0, 10), lastLogin: null }];
    persist(next);
    setAdding(false);
    pushToast({ message: `User added · ${data.name}` });
  };
  const updateUser = (id, patch) => persist(users.map((u) => u.id === id ? { ...u, ...patch } : u));
  const removeUser = (id) => {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    if (u.primary) { pushToast({ message: "Set another user as primary before removing this one", kind: "warn" }); return; }
    if (!confirm(`Remove ${u.name}? They will lose portal access immediately.`)) return;
    persist(users.filter((x) => x.id !== id));
    pushToast({ message: `Removed · ${u.name}`, kind: "warn" });
  };
  const setPrimary = (id) => {
    const next = users.map((u) => ({ ...u, primary: u.id === id, role: u.id === id ? "primary" : (u.role === "primary" ? "viewer" : u.role) }));
    persist(next);
    pushToast({ message: "Primary contact updated" });
  };

  return (
    <CardBlock title={`Users & access · ${users.length}`} action={
      <button onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1.5"
        style={{
          padding: "0.4rem 0.85rem",
          backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
          border: `1px solid ${p.accent}`,
          fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
          letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        }}
      ><UserPlus size={11} /> Add user</button>
    } p={p}>
      {adding && (
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
          <AddUserForm onCancel={() => setAdding(false)} onAdd={addUser} p={p} />
        </div>
      )}
      {users.length === 0 ? (
        <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
          No users on this account yet.
          <button onClick={() => setAdding(true)} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Add the first user →</button>
        </div>
      ) : users.map((u, idx) => (
        <UserCard
          key={u.id}
          user={u}
          isFirst={idx === 0}
          editing={editingId === u.id}
          showPassword={pwId === u.id}
          onEdit={() => setEditingId(editingId === u.id ? null : u.id)}
          onSaveEdit={(patch) => { updateUser(u.id, patch); setEditingId(null); pushToast({ message: `Saved · ${u.name}` }); }}
          onCancelEdit={() => setEditingId(null)}
          onTogglePassword={() => setPwId(pwId === u.id ? null : u.id)}
          onSetPassword={(pw) => { updateUser(u.id, { password: pw, passwordSetAt: new Date().toISOString(), passwordTemporary: false }); setPwId(null); pushToast({ message: `Password updated for ${u.name}` }); }}
          onGenerateTemp={() => {
            const pw = generatePassword();
            updateUser(u.id, { password: pw, passwordSetAt: new Date().toISOString(), passwordTemporary: true });
            return pw;
          }}
          onSendReset={() => {
            if (!u.email) { pushToast({ message: "No email on file for this user", kind: "warn" }); return; }
            pushToast({ message: `Reset link sent to ${u.email}` });
          }}
          onRemove={() => removeUser(u.id)}
          onSetPrimary={() => setPrimary(u.id)}
          p={p}
        />
      ))}
      <div className="px-5 py-3" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
        <Shield size={11} className="inline mr-1.5" style={{ color: p.accent }} />
        Each user has their own login. The <strong>Primary</strong> user receives commission statements and is the main contractual contact. <strong>Reservations</strong> users can place bookings, <strong>Accounts</strong> users receive invoices, and <strong>Viewers</strong> get read-only access.
      </div>
    </CardBlock>
  );
}

function UserCard({ user, isFirst, editing, showPassword, onEdit, onSaveEdit, onCancelEdit, onTogglePassword, onSetPassword, onGenerateTemp, onSendReset, onRemove, onSetPrimary, p }) {
  const role = ROLE_BY_VALUE[user.role] || ROLE_BY_VALUE.viewer;
  const initials = (user.name || "").split(" ").map(s => s[0] || "").slice(0, 2).join("").toUpperCase() || "·";

  return (
    <div className="px-5 py-4" style={{ borderTop: isFirst ? "none" : `1px solid ${p.border}` }}>
      <div className="flex items-start gap-4 flex-wrap">
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          backgroundColor: `${role.base}1F`, border: `2px solid ${role.base}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: role.base, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: "1.05rem",
        }}>{initials}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.textPrimary, fontWeight: 600 }}>
              {user.name || "(unnamed)"}
            </span>
            {user.primary && (
              <span className="inline-flex items-center gap-1" title="Primary contact"
                style={{ fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", color: p.theme === "light" ? "#FFFFFF" : "#15161A", backgroundColor: p.accent, border: `1px solid ${p.accent}` }}>
                <Star size={9} /> Primary
              </span>
            )}
            <span style={{ fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", color: role.base, backgroundColor: `${role.base}1F`, border: `1px solid ${role.base}` }}>
              {role.label}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}>
            {user.email ? <span className="inline-flex items-center gap-1.5"><Mail size={11} style={{ color: p.accent }} /> {user.email}</span> : <span style={{ color: p.warn }}>No email on file</span>}
            {user.phone && <><span style={{ color: p.textMuted }}>·</span><span className="inline-flex items-center gap-1.5"><Phone size={11} style={{ color: p.accent }} /> {user.phone}</span></>}
          </div>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            {user.createdAt && <span>Added {fmtDate(user.createdAt)}</span>}
            {user.lastLogin && <><span style={{ color: p.textDim }}>·</span><span>Last login {fmtDate((user.lastLogin || "").slice(0, 10))}</span></>}
            {user.password ? (
              <><span style={{ color: p.textDim }}>·</span>
                <span style={{ color: user.passwordTemporary ? p.warn : p.success, fontWeight: 600 }}>
                  Password {user.passwordTemporary ? "temporary" : "set"}{user.passwordSetAt ? ` · ${fmtDate(user.passwordSetAt.slice(0, 10))}` : ""}
                </span>
              </>
            ) : (
              <><span style={{ color: p.textDim }}>·</span>
                <span style={{ color: p.warn, fontWeight: 600 }}>No password set</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <UserActionBtn icon={Lock}  label="Password" onClick={onTogglePassword} active={showPassword} p={p} />
          <UserActionBtn icon={Edit2} label="Edit"     onClick={onEdit} active={editing} p={p} />
          {!user.primary && <UserActionBtn icon={Crown}  label="Set primary" onClick={onSetPrimary} p={p} />}
          {!user.primary && <UserActionBtn icon={Trash2} label="Remove"      onClick={onRemove} danger p={p} />}
        </div>
      </div>

      {showPassword && <PasswordPanel user={user} onSetPassword={onSetPassword} onGenerateTemp={onGenerateTemp} onSendReset={onSendReset} p={p} />}
      {editing && <EditUserForm user={user} onSave={onSaveEdit} onCancel={onCancelEdit} p={p} />}
    </div>
  );
}

function UserActionBtn({ icon: Icon, label, onClick, active, danger, p }) {
  const c = danger ? p.danger : (active ? p.accent : p.textSecondary);
  return (
    <button onClick={onClick} title={label}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "0.35rem 0.7rem",
        backgroundColor: active ? p.bgHover : "transparent",
        border: `1px solid ${active ? p.accent : p.border}`,
        color: c,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    ><Icon size={11} /> {label}</button>
  );
}

function PasswordPanel({ user, onSetPassword, onGenerateTemp, onSendReset, p }) {
  const [mode, setMode] = useState(null);
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [generated, setGenerated] = useState(null);

  const save = () => {
    if (!pw || pw.length < 6) { pushToast({ message: "Password must be at least 6 characters", kind: "warn" }); return; }
    if (pw !== confirmPw)     { pushToast({ message: "Passwords don't match", kind: "warn" }); return; }
    onSetPassword(pw);
    setPw(""); setConfirmPw(""); setShow(false); setMode(null);
  };
  const handleGenerate = () => {
    const newPw = onGenerateTemp();
    setGenerated(newPw);
    setMode("generated");
  };
  const copyGenerated = async () => {
    if (!generated) return;
    try { await navigator.clipboard.writeText(generated); pushToast({ message: "Password copied" }); }
    catch { pushToast({ message: "Clipboard not available", kind: "warn" }); }
  };

  return (
    <div className="mt-4 p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, borderInlineStart: `4px solid ${p.accent}` }}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <KeyRound size={12} style={{ color: p.accent }} />
        <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          Password actions · {user.name}
        </span>
      </div>

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode("set")}
            className="inline-flex items-center gap-1.5"
            style={{ padding: "0.45rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
          ><Lock size={11} /> Set new password</button>
          <button onClick={handleGenerate}
            className="inline-flex items-center gap-1.5"
            style={{ padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
          ><KeyRound size={11} /> Generate temporary</button>
          <button onClick={onSendReset}
            disabled={!user.email}
            className="inline-flex items-center gap-1.5"
            style={{
              padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              opacity: user.email ? 1 : 0.55, cursor: user.email ? "pointer" : "not-allowed",
            }}
          ><Send size={11} /> Send reset link</button>
        </div>
      )}

      {mode === "set" && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>New password</div>
            <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password"
                className="flex-1 outline-none"
                style={{ backgroundColor: "transparent", color: p.textPrimary, padding: "0.55rem 0.75rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.86rem", border: "none", minWidth: 0 }}
              />
              <button onClick={() => setShow((v) => !v)} title={show ? "Hide" : "Show"}
                style={{ color: p.textMuted, padding: "0 12px", borderInlineStart: `1px solid ${p.border}` }}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
          <div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Confirm password</div>
            <input type={show ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Re-enter"
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.75rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.86rem" }}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
            <button onClick={save}
              className="inline-flex items-center gap-1.5"
              style={{ padding: "0.5rem 1rem", backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A", border: `1px solid ${p.accent}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}
            ><Check size={11} /> Save password</button>
            <button onClick={() => { setMode(null); setPw(""); setConfirmPw(""); }}
              style={{ padding: "0.5rem 1rem", color: p.textMuted, border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
            >Cancel</button>
          </div>
        </div>
      )}

      {mode === "generated" && generated && (
        <div className="flex items-center gap-3 flex-wrap p-3" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}` }}>
          <div className="flex-1 min-w-0">
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>One-time password</div>
            <div style={{ color: p.textPrimary, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "1rem", fontWeight: 700, marginTop: 4, letterSpacing: "0.05em" }}>{generated}</div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 4 }}>
              Share with {user.name} via a secure channel. They'll be prompted to change it on first login.
            </div>
          </div>
          <button onClick={copyGenerated}
            className="inline-flex items-center gap-1.5"
            style={{ padding: "0.45rem 0.85rem", backgroundColor: p.success, color: "#FFFFFF", border: `1px solid ${p.success}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
          ><Copy size={11} /> Copy</button>
          <button onClick={() => { setGenerated(null); setMode(null); }}
            style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}` }}
          >Done</button>
        </div>
      )}
    </div>
  );
}

function AddUserForm({ onCancel, onAdd, p }) {
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", role: "reservations", sendInvite: true });
  const valid = draft.name.trim() && draft.email.includes("@");

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={12} style={{ color: p.accent }} />
        <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          Add new user
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <FieldLbl label="Full name *" p={p}>
          <Inp value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. Reem Al-Mahmood" p={p} />
        </FieldLbl>
        <FieldLbl label="Email *" p={p}>
          <Inp type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} placeholder="email@agency.com" p={p} />
        </FieldLbl>
        <FieldLbl label="Phone" p={p}>
          <Inp value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} placeholder="+973…" p={p} />
        </FieldLbl>
        <FieldLbl label="Role" p={p}>
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            className="outline-none cursor-pointer"
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", width: "100%" }}>
            {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label} · {r.hint}</option>))}
          </select>
        </FieldLbl>
      </div>
      <label className="mt-3 inline-flex items-center gap-2" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", cursor: "pointer" }}>
        <input type="checkbox" checked={draft.sendInvite} onChange={(e) => setDraft({ ...draft, sendInvite: e.target.checked })} />
        Send portal-invite email with first-login instructions
      </label>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button onClick={() => valid && onAdd(draft)} disabled={!valid}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: valid ? p.accent : "transparent",
            color: valid ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textDim,
            border: `1px solid ${valid ? p.accent : p.border}`,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
            cursor: valid ? "pointer" : "default",
          }}
        ><UserPlus size={11} /> Add user</button>
        <button onClick={onCancel}
          style={{ padding: "0.5rem 1rem", color: p.textMuted, border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
        >Cancel</button>
      </div>
    </div>
  );
}

function EditUserForm({ user, onSave, onCancel, p }) {
  const [draft, setDraft] = useState({
    name:  user.name  || "",
    email: user.email || "",
    phone: user.phone || "",
    role:  user.role  || "viewer",
  });
  const valid = draft.name.trim() && draft.email.includes("@");
  const isPrimary = user.primary;

  return (
    <div className="mt-4 p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, borderInlineStart: `4px solid ${p.accent}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Edit2 size={11} style={{ color: p.accent }} />
        <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          Edit user · {user.name}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <FieldLbl label="Full name *" p={p}><Inp value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} p={p} /></FieldLbl>
        <FieldLbl label="Email *" p={p}><Inp type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} p={p} /></FieldLbl>
        <FieldLbl label="Phone" p={p}><Inp value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} p={p} /></FieldLbl>
        <FieldLbl label="Role" p={p}>
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            disabled={isPrimary}
            className="outline-none cursor-pointer"
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", width: "100%", opacity: isPrimary ? 0.6 : 1 }}>
            {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value} disabled={isPrimary && r.value !== "primary"}>{r.label} · {r.hint}</option>))}
          </select>
        </FieldLbl>
      </div>
      {isPrimary && (
        <p className="mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
          Primary contacts are locked to the Primary role. Demote this user by setting another as primary first.
        </p>
      )}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button onClick={() => valid && onSave(draft)} disabled={!valid}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: valid ? p.accent : "transparent",
            color: valid ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textDim,
            border: `1px solid ${valid ? p.accent : p.border}`,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
            cursor: valid ? "pointer" : "default",
          }}
        ><Check size={11} /> Save changes</button>
        <button onClick={onCancel}
          style={{ padding: "0.5rem 1rem", color: p.textMuted, border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
        >Cancel</button>
      </div>
    </div>
  );
}

function FieldLbl({ label, children, p }) {
  return (
    <label className="block">
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function Inp({ value, onChange, type = "text", placeholder, p }) {
  return (
    <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full outline-none"
      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Local primitives
// ---------------------------------------------------------------------------
function CardBlock({ title, action, children, p, className = "" }) {
  return (
    <div className={className} style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-5 py-3.5 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>{title}</div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Tab({ id, label, count, active, onClick, p }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: active ? `${p.accent}1F` : "transparent",
        border: `1px solid ${active ? p.accent : p.border}`,
        color: active ? p.accent : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
      {count !== null && count !== undefined && (
        <span style={{ marginInlineStart: 2, color: active ? p.accent : p.textMuted, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontSize: "0.7rem" }}>· {count}</span>
      )}
    </button>
  );
}

function Kpi({ label, value, hint, icon: Icon, color, p }) {
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel }}>
      <div className="flex items-start justify-between gap-2">
        <Icon size={14} style={{ color: p.accent, flexShrink: 0 }} />
      </div>
      <div className="mt-2" style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem",
        color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 4, fontWeight: 700 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Field({ label, value, accent, color, p }) {
  return (
    <div>
      <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>{label}</div>
      <div style={{ color: color || (accent ? p.accent : p.textPrimary), fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: accent || color ? 700 : 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Empty({ text, p }) {
  return (
    <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>{text}</div>
  );
}

function RangeBtn({ label, onClick, p }) {
  return (
    <button onClick={onClick}
      style={{ padding: "0.4rem 0.7rem", border: `1px solid ${p.border}`, color: p.textSecondary, backgroundColor: "transparent", fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
    >{label}</button>
  );
}

function RowIconBtn({ title, icon: Icon, onClick, p, disabled }) {
  return (
    <button title={title} onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: disabled ? p.textDim : p.textSecondary,
        border: `1px solid ${p.border}`, backgroundColor: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    ><Icon size={12} /></button>
  );
}
