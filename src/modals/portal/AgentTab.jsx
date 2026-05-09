import React, { useMemo, useState } from "react";
import {
  ArrowRight, Award, BedDouble, Briefcase, Building2, CalendarClock, CalendarDays,
  ChevronLeft, Clock, Coins, Copy, Download, Edit2, Eye, FileSpreadsheet, FileText,
  Inbox, Layers, Mail, Percent, Phone, Plus, Receipt, ScrollText, Send, Sparkles,
  Target, Telescope, TrendingUp, User2, Users, X, Zap,
} from "lucide-react";
import { Logo } from "../../components/Logo.jsx";
import { GoldBtn } from "../../components/primitives.jsx";
import { useT, useLang } from "../../i18n/LanguageContext.jsx";
import { fmtDate } from "../../utils/date.js";
import { useData, legalLine } from "../../data/store.jsx";
import { usePalette } from "./theme.jsx";
import { ContractEditor, defaultAgencyDraft } from "./ContractEditor.jsx";
import { ContractPreviewModal, downloadContract, emailContract } from "./ContractDocument.jsx";
import { AgencyWorkspaceDrawer } from "./AgencyWorkspace.jsx";
import { ProspectExplorerDrawer } from "./ProspectExplorer.jsx";

const SAMPLE_BOOKINGS = [
  // Globepass Travel — top agent, 2 stays pending invoice + 1 invoiced
  { ref: "LSA-7805", agencyId: "AGT-0124", guest: "P. Rashid",     checkIn: "2026-04-22", checkOut: "2026-04-25", nights:  3, suite: "1-Bed",  value: 174, comm: 17, status: "stayed",    invoiced: false },
  { ref: "LSA-7821", agencyId: "AGT-0124", guest: "L. Caretti",    checkIn: "2026-05-04", checkOut: "2026-05-08", nights:  4, suite: "1-Bed",  value: 232, comm: 23, status: "stayed",    invoiced: false },
  { ref: "LSA-7843", agencyId: "AGT-0124", guest: "M. Al-Ansari",  checkIn: "2026-05-12", checkOut: "2026-05-19", nights:  7, suite: "Studio", value: 294, comm: 29, status: "stayed",    invoiced: true  },
  // Cleartrip Bahrain — 1 pending, 1 future
  { ref: "LSA-7895", agencyId: "AGT-0211", guest: "F. Hassan",     checkIn: "2026-04-15", checkOut: "2026-04-20", nights:  5, suite: "Studio", value: 220, comm: 20, status: "stayed",    invoiced: false },
  { ref: "LSA-7902", agencyId: "AGT-0211", guest: "K. Tanaka",     checkIn: "2026-06-01", checkOut: "2026-06-04", nights:  3, suite: "2-Bed",  value: 267, comm: 24, status: "confirmed", invoiced: false },
  // Almosafer Wholesale — 2 pending, 1 future
  { ref: "LSA-7770", agencyId: "AGT-0287", guest: "A. Sharif",     checkIn: "2026-04-10", checkOut: "2026-04-13", nights:  3, suite: "Studio", value: 132, comm: 16, status: "stayed",    invoiced: false },
  { ref: "LSA-7812", agencyId: "AGT-0287", guest: "J. Williams",   checkIn: "2026-05-01", checkOut: "2026-05-05", nights:  4, suite: "2-Bed",  value: 312, comm: 38, status: "stayed",    invoiced: false },
  { ref: "LSA-7958", agencyId: "AGT-0287", guest: "S. Holloway",   checkIn: "2026-06-18", checkOut: "2026-07-02", nights: 14, suite: "1-Bed",  value: 812, comm: 97, status: "confirmed", invoiced: false },
  // Gulf DMC — already settled
  { ref: "LSA-7920", agencyId: "AGT-0344", guest: "R. Park",       checkIn: "2026-04-08", checkOut: "2026-04-10", nights:  2, suite: "Studio", value:  88, comm:  7, status: "stayed",    invoiced: true  },
  // Innovative Travels — oldest pending
  { ref: "LSA-7888", agencyId: "AGT-0392", guest: "N. Khoury",     checkIn: "2026-04-05", checkOut: "2026-04-09", nights:  4, suite: "1-Bed",  value: 232, comm: 16, status: "stayed",    invoiced: false },
];

// Aging bucket colors are derived from the active palette so light/dark modes
// keep semantic meaning while staying readable.
function makeAging(p) {
  return [
    { bucket: "current", value: 1840, color: p.success },
    { bucket: "thirty",  value:  920, color: p.warn },
    { bucket: "sixty",   value:  340, color: p.warn },
    { bucket: "ninety",  value:  110, color: p.danger },
  ];
}

const daysUntil = (iso) => {
  if (!iso) return 0;
  return Math.round((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
};

const statusColorFromName = (p, status) => ({
  active:    p.success,
  draft:     p.warn,
  review:    p.warn,
  suspended: p.danger,
  expired:   p.textDim,
})[status] || p.textMuted;

export const AgentTab = () => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { agencies, upsertAgency, removeAgency, prospects, hotelInfo } = useData();
  const [bookings] = useState(SAMPLE_BOOKINGS);
  const [selected, setSelected] = useState({});
  const [view, setView] = useState("dashboard");
  const [showInvoice, setShowInvoice] = useState(false);
  const [editingAgency, setEditingAgency] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [workspaceFor, setWorkspaceFor] = useState(null);
  const [prospectsOpen, setProspectsOpen] = useState(false);
  const [filter, setFilter] = useState({ status: "all" });
  // Booking-detail drill-down — opens when an operator clicks a reference in
  // the agent commission table. Holds the full booking record.
  const [bookingDetailFor, setBookingDetailFor] = useState(null);

  // Cross-section nav helpers — KPI tile clicks send the operator to a
  // pre-filtered contracts view, the bookings table, or the workspace for
  // the top agent.
  const goToContracts = (override = {}) => {
    setFilter((prev) => ({ status: "all", ...prev, ...override }));
    setView("contracts");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };
  const scrollToBookings = () => {
    const el = document.getElementById("agent-bookings-table");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Build the leaderboard from store data so commission edits update it live.
  const TOP_AGENTS = [...agencies]
    .sort((a, b) => b.ytdRevenue - a.ytdRevenue)
    .slice(0, 5)
    .map(a => ({ name: a.name, bookings: a.ytdBookings, revenue: a.ytdRevenue, commission: a.ytdCommission, id: a.id, commissionPct: a.commissionPct, status: a.status }));

  const toggleSelect = (ref) => setSelected((s) => ({ ...s, [ref]: !s[ref] }));
  const selectedBookings = bookings.filter((b) => selected[b.ref]);
  const invoiceTotal = selectedBookings.reduce((s, b) => s + b.comm, 0);
  const aging = makeAging(p);

  // ---- Derived analytics off the live store ------------------------------
  const totals = useMemo(() => {
    const ytdRev   = agencies.reduce((s, a) => s + (a.ytdRevenue    || 0), 0);
    const ytdComm  = agencies.reduce((s, a) => s + (a.ytdCommission || 0), 0);
    const ytdBook  = agencies.reduce((s, a) => s + (a.ytdBookings   || 0), 0);
    const target   = agencies.reduce((s, a) => s + (a.targetBookings|| 0), 0);
    const avgComm  = agencies.length ? (agencies.reduce((s, a) => s + (a.commissionPct || 0), 0) / agencies.length) : 0;
    const expiring = agencies.filter(a => {
      const d = daysUntil(a.endsOn);
      return d >= 0 && d <= 60;
    }).length;
    const onContract = agencies.filter(a => a.status === "active").length;
    const totalCredit = agencies.reduce((s, a) => s + (a.creditLimit || 0), 0);
    const topAgent = [...agencies].sort((a, b) => b.ytdRevenue - a.ytdRevenue)[0];
    return { ytdRev, ytdComm, ytdBook, target, avgComm, expiring, onContract, totalCredit, topAgent };
  }, [agencies]);

  const filteredAgencies = useMemo(() => agencies.filter((a) => {
    if (filter.status !== "all" && a.status !== filter.status) return false;
    return true;
  }), [agencies, filter]);

  // ---- Invoice view ------------------------------------------------------
  if (showInvoice) {
    const today = new Date().toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
    return (
      <div>
        <button onClick={() => setShowInvoice(false)} className="mb-4 flex items-center gap-2" style={{ color: p.textMuted, fontSize: "0.78rem", letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif" }}>
          <ChevronLeft size={14} /> {t("portal.back")}
        </button>
        <div className="bg-white text-black p-10" style={{ color: "#000" }}>
          <div className="flex justify-between items-start pb-7 mb-7" style={{ borderBottom: "2px solid #000" }}>
            <Logo size={56} color="#1F2024" textColor="#1F2024" />
            <div className="text-end">
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.3rem", letterSpacing: "0.06em" }}>{t("portal.agent.invoiceHeading")}</div>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", marginTop: 4 }}>
                #{`INV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`} · {today}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 mb-8" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
            <div>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{t("portal.agent.issuedBy")}</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600 }}>{hotelInfo?.name || "The Lodge Suites"}</div>
              <div>{hotelInfo?.address || "Building 916, Road 4019, Block 340"}</div>
              <div>{hotelInfo?.area || "Shabab Avenue, Juffair, Manama"}</div>
              <div>{[hotelInfo?.country || "Kingdom of Bahrain", hotelInfo ? legalLine(hotelInfo) : "CR No. #####"].filter(Boolean).join(" · ")}</div>
              <div className="mt-2">{hotelInfo?.emailAccounts || "accounts@thelodgesuites.bh"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{t("portal.agent.payableTo")}</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600 }}>{t("portal.agent.payableToName")}</div>
              <div>Account ID: AGT-0124</div>
              <div>{t("portal.agent.commission")}</div>
              <div className="mt-2">{t("portal.agent.paymentTerms")}</div>
            </div>
          </div>
          <table className="w-full mb-6" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #000" }}>
                {["Reference","Guest","Check-in","Nights","Suite","Stay value","Commission"].map(h => (
                  <th key={h} className="text-start py-2.5" style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedBookings.map((b) => (
                <tr key={b.ref} style={{ borderBottom: "1px solid #ddd" }}>
                  <td className="py-2.5">{b.ref}</td>
                  <td className="py-2.5">{b.guest}</td>
                  <td className="py-2.5">{fmtDate(b.checkIn, lang)}</td>
                  <td className="py-2.5">{b.nights}</td>
                  <td className="py-2.5">{b.suite}</td>
                  <td className="py-2.5">{t("common.bhd")} {b.value}</td>
                  <td className="py-2.5" style={{ fontWeight: 600 }}>{t("common.bhd")} {b.comm}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <div className="w-72" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.9rem" }}>
              <div className="flex justify-between py-1.5"><span>{t("portal.agent.subtotal")}</span><span>{t("common.bhd")} {invoiceTotal}</span></div>
              <div className="flex justify-between py-1.5"><span>{t("portal.agent.tax")}</span><span>{t("common.bhd")} 0</span></div>
              <div className="flex justify-between py-3 mt-2" style={{ borderTop: "2px solid #000", fontSize: "1.1rem", fontWeight: 700, fontFamily: "'Cormorant Garamond', serif" }}>
                <span>{t("portal.agent.totalDue")}</span><span>{t("common.bhd")} {invoiceTotal}</span>
              </div>
            </div>
          </div>
          <p className="mt-10" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: "#555", lineHeight: 1.7 }}>
            {t("portal.agent.thanks")}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <GoldBtn outline onClick={() => setShowInvoice(false)}>{t("portal.agent.editSelection")}</GoldBtn>
          <GoldBtn>{t("portal.agent.sendToAgent")} <Send size={14} /></GoldBtn>
        </div>
      </div>
    );
  }

  // ---- Contracts view ----------------------------------------------------
  if (view === "contracts") {
    return (
      <div>
        <button onClick={() => setView("dashboard")} className="mb-4 flex items-center gap-2" style={{ color: p.textMuted, fontSize: "0.78rem", letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif" }}>
          <ChevronLeft size={14} /> {t("portal.back")}
        </button>
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", color: p.textPrimary, fontWeight: 500 }}>Travel-agent contracts</h3>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.9rem", marginTop: 4, maxWidth: 640 }}>
              Commission-based and net-rate contracts with daily and monthly negotiated rates, term dates, payment terms, and YTD performance against booking targets.
            </p>
          </div>
          <GoldBtn small onClick={() => setEditingAgency(defaultAgencyDraft(agencies.map(a => a.id)))}>
            <Plus size={13} /> New contract
          </GoldBtn>
        </div>

        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <SmallStat label="Active contracts" value={totals.onContract} hint={`${agencies.length} total`} color={p.accent} />
          <SmallStat label="Avg commission %" value={`${totals.avgComm.toFixed(1)}%`} color={p.success} />
          <SmallStat label="Expiring in 60 days" value={totals.expiring} color={totals.expiring > 0 ? p.warn : p.success} />
          <SmallStat label="Total credit extended" value={`${t("common.bhd")} ${totals.totalCredit.toLocaleString()}`} hint={`Across ${agencies.length} agencies`} />
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-2 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
          <span style={{ color: p.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, fontSize: "0.62rem" }}>Filter</span>
          <FilterPill active={filter.status === "all"}       onClick={() => setFilter({ status: "all"       })} p={p}>All</FilterPill>
          <FilterPill active={filter.status === "active"}    onClick={() => setFilter({ status: "active"    })} color={p.success} p={p}>Active</FilterPill>
          <FilterPill active={filter.status === "review"}    onClick={() => setFilter({ status: "review"    })} color={p.warn}    p={p}>In review</FilterPill>
          <FilterPill active={filter.status === "draft"}     onClick={() => setFilter({ status: "draft"     })} color={p.warn}    p={p}>Draft</FilterPill>
          <FilterPill active={filter.status === "suspended"} onClick={() => setFilter({ status: "suspended" })} color={p.danger}  p={p}>Suspended</FilterPill>
        </div>

        <div className="overflow-x-auto" style={{ border: `1px solid ${p.border}` }}>
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
            <thead>
              <tr style={{ backgroundColor: p.bgPanelAlt }}>
                {["Contract","Agency","Commission","Daily net · S/1/2/3","Monthly net · S/1/2/3","Term","YTD performance","Actions"].map(h => (
                  <th key={h} className="text-start px-3 py-3" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAgencies.map((a) => {
                const dn = a.dailyNet   || {};
                const mn = a.monthlyNet || {};
                const hasNet = (dn.studio || dn.oneBed || dn.twoBed || dn.threeBed);
                const remaining = daysUntil(a.endsOn);
                const expiringSoon = remaining >= 0 && remaining <= 60;
                const sc = statusColorFromName(p, a.status);
                const targetPct = a.targetBookings > 0 ? Math.round(((a.ytdBookings || 0) / a.targetBookings) * 100) : 0;
                return (
                  <tr key={a.id} style={{ borderTop: `1px solid ${p.border}` }}>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap" }}>
                      <div style={{ color: p.accent, fontWeight: 700, fontSize: "0.74rem", letterSpacing: "0.05em" }}>{a.id}</div>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span style={{
                          fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                          padding: "1px 6px", display: "inline-block",
                          color: sc, border: `1px solid ${sc}`,
                        }}>{a.status}</span>
                        {a.sourceDoc && (
                          <span title={`Imported from ${a.sourceDoc}`}
                            style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.accent, border: `1px solid ${p.accent}`,
                            }}>Imported</span>
                        )}
                        {(a.eventSupplements?.length || 0) > 0 && (
                          <span title="Event-period supplements set"
                            style={{
                              fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                              padding: "1px 6px", color: p.warn, border: `1px solid ${p.warn}`,
                            }}>+{a.eventSupplements.length} evt</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => setWorkspaceFor(a)}
                        title="Open agency workspace"
                        className="group text-start"
                        style={{ backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        <div className="group-hover:underline" style={{
                          fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem",
                          color: p.textPrimary,
                          textDecorationColor: p.accent,
                          textUnderlineOffset: 3,
                        }}>{a.name}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{a.contact}</div>
                      </button>
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap" }}>
                      <div style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {a.commissionPct === 0 ? "Net rate" : `${a.commissionPct}%`}
                      </div>
                      {a.marketingFundPct ? (
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>+{a.marketingFundPct}% MF</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: hasNet ? p.textPrimary : p.textDim }}>
                      {hasNet ? `${dn.studio || 0} / ${dn.oneBed || 0} / ${dn.twoBed || 0} / ${dn.threeBed || 0}` : "Commission-only"}
                      {a.weekendNet && (a.weekendNet.studio || a.weekendNet.oneBed || a.weekendNet.twoBed || a.weekendNet.threeBed)
                        ? <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                            Wkd {a.weekendNet.studio || 0}/{a.weekendNet.oneBed || 0}/{a.weekendNet.twoBed || 0}/{a.weekendNet.threeBed || 0}
                          </div>
                        : null}
                    </td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: hasNet ? p.accent : p.textDim, fontWeight: hasNet ? 600 : 400 }}>
                      {hasNet ? `${(mn.studio || 0).toLocaleString()} / ${(mn.oneBed || 0).toLocaleString()} / ${(mn.twoBed || 0).toLocaleString()} / ${(mn.threeBed || 0).toLocaleString()}` : "—"}
                      {Number(a.accommodationFee) > 0 && (
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, fontWeight: 500 }}>
                          + BHD {Number(a.accommodationFee).toFixed(3)} fee
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                      <div>{a.startsOn} → {a.endsOn}</div>
                      <div style={{ color: expiringSoon ? p.warn : p.textDim, fontSize: "0.7rem", marginTop: 2 }}>
                        {remaining < 0 ? `Expired ${Math.abs(remaining)}d ago` : `${remaining}d remaining`}
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ minWidth: 180 }}>
                      <div className="flex items-baseline justify-between gap-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ fontWeight: 700 }}>{a.ytdBookings} bkgs</span>
                        <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>/ {a.targetBookings || 0}</span>
                      </div>
                      <div className="mt-1 h-1" style={{ backgroundColor: p.border }}>
                        <div className="h-full" style={{ width: `${Math.min(100, targetPct)}%`, backgroundColor: p.accent }} />
                      </div>
                      <div style={{ color: p.success, fontSize: "0.72rem", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                        {t("common.bhd")} {(a.ytdCommission || 0).toLocaleString()} paid
                      </div>
                    </td>
                    <td className="px-3 py-3 text-end">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <RowIconBtn
                          title="Preview rate sheet"
                          icon={Eye}
                          onClick={() => setPreviewing(a)}
                          p={p}
                        />
                        <RowIconBtn
                          title="Download contract (HTML)"
                          icon={Download}
                          onClick={() => downloadContract(a, "agent", { hotel: hotelInfo })}
                          p={p}
                        />
                        <RowIconBtn
                          title={(a.pocEmail || a.contact) ? `Email to ${a.pocEmail || a.contact}` : "No email on file"}
                          icon={Mail}
                          onClick={() => emailContract(a, "agent", hotelInfo)}
                          p={p}
                          disabled={!(a.pocEmail || a.contact)}
                        />
                        <button onClick={() => setWorkspaceFor(a)} className="inline-flex items-center gap-1.5 ml-1"
                          title="Open agency workspace · Bookings · Invoices · Receipts · Users · Statement"
                          style={{ color: p.success, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.success}` }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Briefcase size={11} /> Account
                        </button>
                        <button onClick={() => setEditingAgency({ ...a })} className="inline-flex items-center gap-1.5 ml-1"
                          style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.accent}` }}>
                          <Edit2 size={11} /> Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAgencies.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                    No agencies match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editingAgency && (
          <ContractEditor
            open
            kind="agent"
            contract={editingAgency}
            onClose={() => setEditingAgency(null)}
            onSave={(a) => { upsertAgency(a); setEditingAgency(null); }}
            onRemove={(id) => { removeAgency(id); setEditingAgency(null); }}
          />
        )}
        {previewing && (
          <ContractPreviewModal
            contract={previewing}
            kind="agent"
            onClose={() => setPreviewing(null)}
          />
        )}
        {workspaceFor && (
          <AgencyWorkspaceDrawer
            agency={workspaceFor}
            onClose={() => setWorkspaceFor(null)}
            onEditContract={() => { const a = workspaceFor; setWorkspaceFor(null); setEditingAgency({ ...a }); }}
            onPreviewContract={() => { const a = workspaceFor; setWorkspaceFor(null); setPreviewing(a); }}
          />
        )}
      </div>
    );
  }

  // ---- Dashboard ---------------------------------------------------------
  return (
    <div>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.2rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>{t("portal.agent.title")}</h3>
      <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.92rem", marginTop: 6 }}>{t("portal.agent.intro")}</p>

      {/* Primary KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-7">
        <KpiTile
          label={t("portal.agent.stats.open")}
          value={bookings.filter(b => b.status === "confirmed").length}
          trend={`${bookings.filter(b => b.status === "stayed" && !b.invoiced).length} ready to invoice`}
          icon={Clock}
          p={p}
          onClick={scrollToBookings}
          ctaLabel="View bookings"
        />
        <KpiTile
          label="YTD commission"
          value={`${t("common.bhd")} ${totals.ytdComm.toLocaleString()}`}
          trend={`${totals.avgComm.toFixed(1)}% avg`}
          icon={Coins}
          color={p.accent}
          p={p}
          onClick={() => goToContracts({ status: "all" })}
          ctaLabel="View contracts"
        />
        <KpiTile
          label="YTD agency revenue"
          value={`${t("common.bhd")} ${(totals.ytdRev / 1000).toFixed(1)}k`}
          trend={`${totals.ytdBook} bookings`}
          icon={TrendingUp}
          p={p}
          onClick={() => goToContracts({ status: "all" })}
          ctaLabel="View contracts"
        />
        <KpiTile
          label="Top agent"
          value={totals.topAgent?.name || "—"}
          trend={totals.topAgent ? `${t("common.bhd")} ${totals.topAgent.ytdCommission.toLocaleString()} paid` : ""}
          icon={Award}
          small
          p={p}
          onClick={() => totals.topAgent && setWorkspaceFor(totals.topAgent)}
          ctaLabel="Open workspace"
        />
      </div>

      {/* Secondary KPIs — contract health */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <KpiTile
          label="Active contracts"
          value={totals.onContract}
          trend={`${agencies.length} agencies`}
          icon={Users}
          p={p}
          compact
          onClick={() => goToContracts({ status: "active" })}
          ctaLabel="View active"
        />
        <KpiTile
          label="Expiring in 60 days"
          value={totals.expiring}
          trend={totals.expiring > 0 ? "Renewals required" : "All current"}
          color={totals.expiring > 0 ? p.warn : p.success}
          icon={Target}
          p={p}
          compact
          onClick={() => goToContracts({ status: "all" })}
          ctaLabel="View renewals"
        />
        <KpiTile
          label="YTD bookings vs target"
          value={`${totals.ytdBook}/${totals.target || 0}`}
          trend={totals.target > 0 ? `${Math.round((totals.ytdBook / totals.target) * 100)}% of plan` : "No target"}
          icon={Target}
          p={p}
          compact
          onClick={() => goToContracts({ status: "all" })}
          ctaLabel="View pacing"
        />
        <KpiTile
          label="Credit extended"
          value={`${t("common.bhd")} ${totals.totalCredit.toLocaleString()}`}
          trend="Across all contracts"
          icon={ScrollText}
          p={p}
          compact
          onClick={() => goToContracts({ status: "all" })}
          ctaLabel="View contracts"
        />
      </div>

      {/* Commission Workspace + sidebar action cards */}
      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <CommissionWorkspace
            bookings={bookings}
            agencies={agencies}
            selected={selected}
            setSelected={setSelected}
            onOpenInvoice={() => setShowInvoice(true)}
            onScrollToBookings={() => {
              const el = document.getElementById("agent-bookings-table");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            p={p} t={t}
          />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <DashCard p={p} icon={Telescope}
            title="Discover prospects"
            body="Search the web for new travel agencies in the GCC, Saudi, India and beyond. Capture leads and convert qualified ones into draft agreements."
            cta={`${prospects.filter(pr => pr.kind === "agent").length} prospects in pipeline`}
            accentBg
            onClick={() => setProspectsOpen(true)}
          />
          <DashCard p={p} icon={Percent}
            title="Manage contracts"
            body="Daily / monthly net rates, commission %, marketing fund and payment terms."
            cta="Open contracts"
            onClick={() => setView("contracts")}
          />
        </div>
      </div>

      {/* Bookings + invoice builder */}
      <div className="mt-7 flex items-center justify-between flex-wrap gap-3" id="agent-bookings-table">
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary }}>{t("portal.agent.bookingsTitle")}</h4>
        <div className="flex gap-3 items-center">
          {invoiceTotal > 0 && (
            <span style={{ fontFamily: "'Manrope', sans-serif", color: p.accent, fontSize: "0.85rem" }}>
              {selectedBookings.length} {t("portal.agent.selected")} · {t("common.bhd")} {invoiceTotal}
            </span>
          )}
          <GoldBtn small onClick={() => setShowInvoice(true)}><Receipt size={14} /> {t("portal.agent.raiseInvoice")}</GoldBtn>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto" style={{ border: `1px solid ${p.border}` }}>
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
          <thead>
            <tr style={{ backgroundColor: p.bgPanelAlt }}>
              {["", "Reference","Agency","Guest","Check-in","Nights","Suite","Stay","Comm.","Status"].map(h => (
                <th key={h} className="text-start px-3 py-3" style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const sc = b.invoiced ? p.textDim : b.status === "stayed" ? p.success : p.warn;
              const ag = agencies.find(a => a.id === b.agencyId);
              return (
                <tr key={b.ref} style={{ borderTop: `1px solid ${p.border}`, opacity: b.invoiced ? 0.55 : 1 }}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" disabled={b.invoiced || b.status !== "stayed"} checked={!!selected[b.ref]} onChange={() => toggleSelect(b.ref)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setBookingDetailFor(b)}
                      title="Open booking detail"
                      className="inline-flex items-center gap-1.5"
                      style={{
                        color: p.accent, fontWeight: 600, fontSize: "0.78rem",
                        background: "transparent", border: "none", padding: 0,
                        cursor: "pointer", textDecoration: "underline",
                        textDecorationColor: `${p.accent}66`,
                        textUnderlineOffset: 3,
                        fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = p.accent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = `${p.accent}66`; }}
                    >
                      {b.ref}
                    </button>
                  </td>
                  <td className="px-3 py-2.5" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ color: p.textPrimary, fontWeight: 600, fontSize: "0.84rem" }}>{ag?.name || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.04em" }}>{b.agencyId}</div>
                  </td>
                  <td className="px-3 py-2.5" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: p.textPrimary }}>{b.guest}</td>
                  <td className="px-3 py-2.5">{fmtDate(b.checkIn, lang)}</td>
                  <td className="px-3 py-2.5">{b.nights}</td>
                  <td className="px-3 py-2.5">{b.suite}</td>
                  <td className="px-3 py-2.5">{t("common.bhd")} {b.value}</td>
                  <td className="px-3 py-2.5" style={{ color: p.accent, fontWeight: 600 }}>{t("common.bhd")} {b.comm}</td>
                  <td className="px-3 py-2.5">
                    <span style={{
                      fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "3px 9px",
                      color: sc, border: `1px solid ${sc}`,
                    }}>
                      {b.invoiced ? t("portal.agent.status.invoiced") : t(`portal.agent.status.${b.status}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leaderboard + aging */}
      <div className="grid lg:grid-cols-3 gap-4 mt-7">
        <div className="lg:col-span-2" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              <Award size={13} /> {t("portal.agent.leaderboardHeading")}
            </div>
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
              Click an agency to open its workspace · bookings · invoices · users
            </span>
          </div>

          {/* Aggregate strip — totals across the top 5 so the operator can
              see how concentrated the quarter is */}
          {(() => {
            const tBook = TOP_AGENTS.reduce((s, x) => s + (x.bookings || 0), 0);
            const tRev  = TOP_AGENTS.reduce((s, x) => s + (x.revenue || 0), 0);
            const tComm = TOP_AGENTS.reduce((s, x) => s + (x.commission || 0), 0);
            return (
              <div className="px-6 py-3 grid grid-cols-3 gap-3" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                <Mini label="Bookings" value={tBook.toLocaleString()} hint={`avg ${TOP_AGENTS.length ? Math.round(tBook / TOP_AGENTS.length) : 0}`} p={p} />
                <Mini label={t("portal.agent.leaderboardHeaders.revenue")} value={`${t("common.bhd")} ${tRev.toLocaleString()}`} hint={`avg ${t("common.bhd")} ${TOP_AGENTS.length ? Math.round(tRev / TOP_AGENTS.length).toLocaleString() : 0}`} p={p} />
                <Mini label={t("portal.agent.leaderboardHeaders.commission")} value={`${t("common.bhd")} ${tComm.toLocaleString()}`} hint={tRev > 0 ? `${((tComm / tRev) * 100).toFixed(1)}% blended` : ""} accent p={p} />
              </div>
            );
          })()}

          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
              <thead>
                <tr style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", backgroundColor: p.bgPanelAlt }}>
                  <th className="text-start px-6 py-3 font-semibold">{t("portal.agent.leaderboardHeaders.agent")}</th>
                  <th className="text-end px-3 py-3 font-semibold">{t("portal.agent.leaderboardHeaders.bookings")}</th>
                  <th className="text-end px-3 py-3 font-semibold">{t("portal.agent.leaderboardHeaders.revenue")}</th>
                  <th className="text-end px-6 py-3 font-semibold">{t("portal.agent.leaderboardHeaders.commission")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const tRev = TOP_AGENTS.reduce((s, x) => s + (x.revenue || 0), 0) || 1;
                  return TOP_AGENTS.map((a, i) => {
                    const max = TOP_AGENTS[0].revenue || 1;
                    const pct = Math.round((a.revenue / max) * 100);
                    const sharePct = Math.round((a.revenue / tRev) * 100);
                    const rankColor = i === 0 ? p.accent : i <= 2 ? p.accentDeep : p.textMuted;
                    const fullAgency = agencies.find((ag) => ag.id === a.id);
                    const statusColor = a.status === "active" ? p.success : a.status === "draft" ? p.warn : a.status === "review" ? p.warn : p.textMuted;
                    return (
                      <tr
                        key={a.id || a.name}
                        style={{ borderTop: `1px solid ${p.border}`, cursor: fullAgency ? "pointer" : "default", transition: "background-color 120ms" }}
                        onClick={() => fullAgency && setWorkspaceFor(fullAgency)}
                        onMouseEnter={(e) => { if (fullAgency) e.currentTarget.style.backgroundColor = p.bgHover; }}
                        onMouseLeave={(e) => { if (fullAgency) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex-shrink-0" style={{
                              width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              border: `1px solid ${rankColor}`,
                              backgroundColor: i === 0 ? `${rankColor}1F` : "transparent",
                              color: rankColor,
                              fontSize: "0.74rem", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                              borderRadius: "50%",
                            }}>{i === 0 ? <Award size={13} /> : i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.08rem", color: p.textPrimary }}>{a.name}</span>
                                {a.commissionPct != null && (
                                  <span title="Commission rate" style={{
                                    color: p.accent, border: `1px solid ${p.accent}`,
                                    backgroundColor: `${p.accent}14`,
                                    fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700,
                                    padding: "1px 6px", whiteSpace: "nowrap",
                                  }}>{a.commissionPct}% comm</span>
                                )}
                                {a.status && a.status !== "active" && (
                                  <span style={{
                                    color: statusColor, border: `1px solid ${statusColor}`,
                                    fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700,
                                    padding: "1px 6px", whiteSpace: "nowrap",
                                  }}>{a.status}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5" style={{ fontSize: "0.66rem" }}>
                                <div className="flex-1 h-1" style={{ backgroundColor: p.border, minWidth: 60 }}>
                                  <div className="h-full" style={{ width: `${pct}%`, backgroundColor: rankColor, transition: "width 400ms" }} />
                                </div>
                                <span style={{ color: p.textMuted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{sharePct}% of top 5</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-end" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{a.bookings}</td>
                        <td className="px-3 py-3 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {a.revenue.toLocaleString()}</td>
                        <td className="px-6 py-3 text-end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          <div>{t("common.bhd")} {a.commission.toLocaleString()}</div>
                          {/* Hover affordance — kept invisible on rest, surfaced in muted gold on row hover */}
                          {fullAgency && (
                            <div className="row-cta" style={{
                              color: p.accent, fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                              marginTop: 3, opacity: 0.55,
                            }}>Open →</div>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}`, color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <Clock size={13} /> {t("portal.agent.agingHeading")}
          </div>
          <div className="p-5 space-y-4">
            {aging.map((a) => {
              const total = aging.reduce((s, x) => s + x.value, 0);
              const pct = total > 0 ? Math.round((a.value / total) * 100) : 0;
              return (
                <div key={a.bucket}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textSecondary }}>{t(`portal.agent.agingBuckets.${a.bucket}`)}</div>
                    <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: a.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {t("common.bhd")} {a.value.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5" style={{ backgroundColor: p.border }}>
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: a.color, transition: "width 400ms" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Travel agencies — quick edit + jump to contracts */}
      <div className="mt-7" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
        <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <FileText size={13} /> Travel agencies
          </div>
          <div className="flex items-center gap-3">
            <span style={{ color: p.textMuted, fontSize: "0.7rem", fontFamily: "'Manrope', sans-serif" }}>{agencies.length} accounts</span>
            <button onClick={() => setView("contracts")} className="inline-flex items-center gap-1.5"
              style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Manage all <ScrollText size={11} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary }}>
            <thead>
              <tr style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>
                <th className="text-start px-6 py-3 font-semibold">Agency</th>
                <th className="text-start px-3 py-3 font-semibold">Contact</th>
                <th className="text-end px-3 py-3 font-semibold">Commission</th>
                <th className="text-end px-3 py-3 font-semibold">YTD bookings</th>
                <th className="text-end px-3 py-3 font-semibold">YTD revenue</th>
                <th className="text-start px-3 py-3 font-semibold">Term</th>
                <th className="text-start px-3 py-3 font-semibold">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => {
                const remaining = daysUntil(a.endsOn);
                const expiringSoon = remaining >= 0 && remaining <= 60;
                const sc = statusColorFromName(p, a.status);
                return (
                  <tr key={a.id} style={{ borderTop: `1px solid ${p.border}` }}>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => setWorkspaceFor(a)}
                        title="Open agency workspace"
                        className="group text-start"
                        style={{ backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        <div className="group-hover:underline" style={{
                          fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary,
                          textDecorationColor: p.accent, textUnderlineOffset: 3,
                        }}>{a.name}</div>
                        <div style={{ color: p.accent, fontSize: "0.66rem", fontWeight: 600 }}>{a.id}</div>
                      </button>
                    </td>
                    <td className="px-3 py-3" style={{ color: p.textMuted }}>{a.contact}</td>
                    <td className="px-3 py-3 text-end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {a.commissionPct}%{a.marketingFundPct ? <span style={{ color: p.textMuted, fontSize: "0.7rem", fontWeight: 500 }}> +{a.marketingFundPct}% MF</span> : null}
                    </td>
                    <td className="px-3 py-3 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{a.ytdBookings}</td>
                    <td className="px-3 py-3 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {a.ytdRevenue.toLocaleString()}</td>
                    <td className="px-3 py-3" style={{ whiteSpace: "nowrap", fontSize: "0.78rem", color: p.textMuted }}>
                      <div>{a.endsOn || "—"}</div>
                      <div style={{ color: expiringSoon ? p.warn : p.textDim, fontSize: "0.7rem" }}>
                        {a.endsOn ? (remaining < 0 ? `Expired ${Math.abs(remaining)}d ago` : `${remaining}d remaining`) : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px",
                        color: sc, border: `1px solid ${sc}`,
                      }}>{a.status}</span>
                    </td>
                    <td className="px-6 py-3 text-end">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <RowIconBtn title="Preview rate sheet" icon={Eye}      onClick={() => setPreviewing(a)} p={p} />
                        <RowIconBtn title="Download contract"  icon={Download} onClick={() => downloadContract(a, "agent", { hotel: hotelInfo })} p={p} />
                        <RowIconBtn
                          title={(a.pocEmail || a.contact) ? `Email to ${a.pocEmail || a.contact}` : "No email on file"}
                          icon={Mail}
                          onClick={() => emailContract(a, "agent", hotelInfo)}
                          disabled={!(a.pocEmail || a.contact)}
                          p={p}
                        />
                        <button onClick={() => setWorkspaceFor(a)} className="inline-flex items-center gap-1.5 ml-1"
                          title="Open agency workspace · Bookings · Invoices · Receipts · Users · Statement"
                          style={{ color: p.success, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.success}` }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.success}1A`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Briefcase size={11} /> Account
                        </button>
                        <button onClick={() => setEditingAgency({ ...a })} className="inline-flex items-center gap-1.5 ml-1"
                          style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "0.35rem 0.6rem", border: `1px solid ${p.accent}` }}>
                          <Edit2 size={11} /> Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingAgency && (
        <ContractEditor
          open
          kind="agent"
          contract={editingAgency}
          onClose={() => setEditingAgency(null)}
          onSave={(a) => { upsertAgency(a); setEditingAgency(null); }}
          onRemove={(id) => { removeAgency(id); setEditingAgency(null); }}
        />
      )}
      {previewing && (
        <ContractPreviewModal
          contract={previewing}
          kind="agent"
          onClose={() => setPreviewing(null)}
        />
      )}
      {workspaceFor && (
        <AgencyWorkspaceDrawer
          agency={workspaceFor}
          onClose={() => setWorkspaceFor(null)}
          onEditContract={() => { const a = workspaceFor; setWorkspaceFor(null); setEditingAgency({ ...a }); }}
          onPreviewContract={() => { const a = workspaceFor; setWorkspaceFor(null); setPreviewing(a); }}
        />
      )}
      {bookingDetailFor && (
        <AgentBookingDrawer
          booking={bookingDetailFor}
          agencies={agencies}
          selected={!!selected[bookingDetailFor.ref]}
          onSelectToggle={() => toggleSelect(bookingDetailFor.ref)}
          onOpenAgency={(agency) => { setBookingDetailFor(null); setWorkspaceFor(agency); }}
          onClose={() => setBookingDetailFor(null)}
        />
      )}
      {prospectsOpen && (
        <ProspectExplorerDrawer
          open
          kind="agent"
          onClose={() => setProspectsOpen(false)}
          onConvert={(prospect) => {
            // Promote the prospect into a fresh agency-draft so the operator
            // can immediately turn the lead into a contract negotiation.
            setProspectsOpen(false);
            const draft = defaultAgencyDraft(agencies.map((a) => a.id));
            setEditingAgency({
              ...draft,
              name: prospect.name,
              specialty: prospect.industry || draft.specialty,
              pocName:  prospect.contactName  || "",
              pocEmail: prospect.contactEmail || "",
              pocPhone: prospect.contactPhone || "",
              notes: `Converted from prospect ${prospect.id} · ${prospect.source || "Web research"}\n${prospect.notes || ""}`.trim(),
            });
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function SmallStat({ label, value, hint, color }) {
  const p = usePalette();
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// Mini stat — compact summary tile used in the leaderboard's aggregate strip.
function Mini({ label, value, hint, accent, p }) {
  return (
    <div>
      <div style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem",
        color: accent ? p.accent : p.textPrimary,
        fontWeight: 500, lineHeight: 1.05,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 4, fontWeight: 700 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentBookingDrawer — full-page detail view for an agent-channel booking.
// Surfaces every field on the row (guest, stay window, suite type, stay value,
// commission split) plus the linked agency block with a one-click jump into
// the agency workspace. Includes "Select for invoice / Deselect" and a
// status-aware contextual hint that explains why the row may not be billable.
// ---------------------------------------------------------------------------
function AgentBookingDrawer({ booking, agencies, selected, onSelectToggle, onOpenAgency, onClose }) {
  const p = usePalette();
  const t = useT();
  const { lang } = useLang();
  const agency = useMemo(() => agencies.find((a) => a.id === booking.agencyId) || null, [agencies, booking.agencyId]);

  const statusBase = booking.invoiced ? p.textDim : booking.status === "stayed" ? p.success : booking.status === "confirmed" ? p.warn : p.textMuted;
  const checkOutIso = booking.checkOut;
  const commPct = booking.value > 0 ? Math.round((booking.comm / booking.value) * 100) : 0;
  const billable = booking.status === "stayed" && !booking.invoiced;

  const copyRef = async () => {
    try { await navigator.clipboard.writeText(booking.ref); }
    catch {}
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            Agent booking · {booking.ref}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {booking.guest} · {booking.suite}
          </div>
        </div>
        <button onClick={onClose}
          className="flex items-center gap-2 flex-shrink-0"
          style={{
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
            fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        ><X size={14} /> Close</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-8">
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
              <BedDouble size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.9rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
                  {booking.guest}
                </h3>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", fontWeight: 700, padding: "3px 9px",
                  color: statusBase, backgroundColor: `${statusBase}1F`, border: `1px solid ${statusBase}`,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: statusBase }} />
                  {booking.invoiced ? t("portal.agent.status.invoiced") : t(`portal.agent.status.${booking.status}`)}
                </span>
                {selected && (
                  <span style={{
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em",
                    textTransform: "uppercase", fontWeight: 700, padding: "3px 9px",
                    color: p.accent, border: `1px solid ${p.accent}`, backgroundColor: `${p.accent}1F`,
                  }}>Selected for invoice</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.04em" }}>
                {booking.ref}
                <button onClick={copyRef} title="Copy reference"
                  style={{ background: "transparent", border: "none", color: p.textMuted, padding: 2, cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                  onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
                >
                  <Copy size={12} />
                </button>
              </div>
              <div className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                {fmtDate(booking.checkIn, lang)} → {fmtDate(checkOutIso, lang)} · {booking.nights} night{booking.nights === 1 ? "" : "s"} · {booking.suite}
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {billable && (
                <button onClick={onSelectToggle}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    padding: "0.5rem 0.95rem",
                    backgroundColor: selected ? "transparent" : p.accent,
                    color: selected ? p.accent : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
                    border: `1px solid ${p.accent}`,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                ><Receipt size={11} /> {selected ? "Remove from invoice" : "Select for invoice"}</button>
              )}
              {agency && (
                <button onClick={() => onOpenAgency(agency)}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    padding: "0.5rem 0.95rem",
                    backgroundColor: "transparent", color: p.textPrimary,
                    border: `1px solid ${p.border}`,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textPrimary; }}
                ><Briefcase size={11} /> Open agency</button>
              )}
            </div>
          </div>

          {/* Status hint — explains why a row may be inactive for invoicing */}
          {!billable && (
            <div className="p-3 mb-6 flex items-start gap-3" style={{
              backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`,
              borderInlineStart: `3px solid ${p.warn}`,
            }}>
              <Clock size={14} style={{ color: p.warn, marginTop: 2, flexShrink: 0 }} />
              <div style={{ color: p.textSecondary, fontSize: "0.84rem", lineHeight: 1.55 }}>
                {booking.invoiced
                  ? <>This booking has already been included on a commission invoice. It can no longer be selected.</>
                  : booking.status === "confirmed"
                    ? <>The guest hasn't checked in yet. Commission becomes billable once the stay completes (status moves to <em>stayed</em>).</>
                    : <>This booking is not currently in a billable state.</>}
              </div>
            </div>
          )}

          {/* KPI strip — stay value, commission, marketing fund (if any), nightly value */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-6" style={{ backgroundColor: p.border }}>
            <DetailKpi label="Stay value"   value={`${t("common.bhd")} ${(booking.value || 0).toLocaleString()}`} icon={Coins}      color={p.success} hint={`${t("common.bhd")} ${booking.nights > 0 ? Math.round(booking.value / booking.nights).toLocaleString() : "—"}/night`} p={p} />
            <DetailKpi label="Commission"   value={`${t("common.bhd")} ${(booking.comm  || 0).toLocaleString()}`} icon={Percent}    color={p.accent}  hint={`${commPct}% of stay value`} p={p} />
            <DetailKpi label="Nights"       value={booking.nights}                                 icon={CalendarDays}   color={p.textPrimary} hint={booking.suite} p={p} />
            <DetailKpi label="Status"       value={booking.invoiced ? "Invoiced" : booking.status} icon={booking.invoiced ? Receipt : Clock} color={statusBase} hint={booking.invoiced ? "Settled" : billable ? "Ready to invoice" : "Awaiting stay"} p={p} />
          </div>

          {/* Two-column detail grid */}
          <div className="grid lg:grid-cols-2 gap-5 mb-6">
            {/* Guest + stay */}
            <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
              <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}`, color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                <User2 size={12} /> Guest &amp; stay
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                <DetailField label="Guest"     value={booking.guest} accent p={p} />
                <DetailField label="Suite"     value={booking.suite} p={p} />
                <DetailField label="Check-in"  value={fmtDate(booking.checkIn, lang)} p={p} />
                <DetailField label="Check-out" value={fmtDate(checkOutIso, lang)} p={p} />
                <DetailField label="Nights"    value={booking.nights} p={p} />
                <DetailField label="Reference" value={booking.ref} mono p={p} />
              </div>
            </div>

            {/* Agency block */}
            <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
              <div className="px-5 py-3 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
                <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                  <Building2 size={12} /> Booking agency
                </div>
                {agency && (
                  <button onClick={() => onOpenAgency(agency)}
                    className="inline-flex items-center gap-1.5"
                    style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, background: "transparent", border: "none", cursor: "pointer" }}
                  >Open workspace <ArrowRight size={11} /></button>
                )}
              </div>
              <div className="px-5 py-4">
                {agency ? (
                  <>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>{agency.name}</div>
                    <div className="mt-1" style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.74rem", fontWeight: 700 }}>{agency.id}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                      <DetailField label="Specialty"     value={agency.specialty || "—"} p={p} />
                      <DetailField label="Commission"    value={`${agency.commissionPct ?? 0}%${agency.marketingFundPct ? ` + ${agency.marketingFundPct}% MF` : ""}`} accent p={p} />
                      <DetailField label="Contact"       value={agency.pocName || agency.contact || "—"} p={p} />
                      <DetailField label="Email"         value={agency.pocEmail || agency.email || "—"} p={p} />
                      <DetailField label="Phone"         value={agency.pocPhone || agency.phone || "—"} p={p} />
                      <DetailField label="Status"        value={agency.status || "—"} p={p} />
                    </div>
                  </>
                ) : (
                  <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>
                    Agency <strong style={{ color: p.textPrimary }}>{booking.agencyId}</strong> isn't in the live registry. The booking was logged under a legacy ID.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Commission breakdown */}
          <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}`, color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              <Coins size={12} /> Commission breakdown
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                <DetailField label="Stay value"          value={`${t("common.bhd")} ${(booking.value || 0).toLocaleString()}`} p={p} />
                <DetailField label="Commission rate"     value={`${commPct}%`} p={p} />
                <DetailField label="Commission BHD"      value={`${t("common.bhd")} ${(booking.comm || 0).toLocaleString()}`} accent p={p} />
                <DetailField label="Net to hotel"        value={`${t("common.bhd")} ${((booking.value || 0) - (booking.comm || 0)).toLocaleString()}`} p={p} />
              </div>
              {agency && agency.commissionPct != null && commPct !== Number(agency.commissionPct) && (
                <div className="mt-4 p-3 flex items-start gap-2" style={{ backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`, borderInlineStart: `3px solid ${p.warn}` }}>
                  <Sparkles size={14} style={{ color: p.warn, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ color: p.textSecondary, fontSize: "0.78rem", lineHeight: 1.5 }}>
                    Commission on this booking ({commPct}%) doesn't match the contracted rate of <strong style={{ color: p.textPrimary }}>{agency.commissionPct}%</strong>. This may be a manual override or a legacy booking taken on different terms.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DetailKpi({ label, value, hint, icon: Icon, color, p }) {
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel }}>
      <div className="flex items-center gap-2 mb-1" style={{ color: color || p.accent }}>
        <Icon size={12} />
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.35rem", color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function DetailField({ label, value, accent, mono, p }) {
  return (
    <div>
      <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{
        color: accent ? p.accent : p.textPrimary,
        marginTop: 4, fontWeight: accent ? 700 : 500,
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : undefined,
        letterSpacing: mono ? "0.04em" : undefined,
        fontVariantNumeric: "tabular-nums", wordBreak: "break-word",
      }}>{value}</div>
    </div>
  );
}

function KpiTile({ label, value, trend, icon: Icon, color, p, compact, small, onClick, ctaLabel }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="p-5 group transition-colors"
      style={{
        backgroundColor: p.bgPanel,
        border: `1px solid ${p.border}`,
        cursor: onClick ? "pointer" : "default",
        textAlign: "start",
        width: "100%",
        outline: "none",
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.backgroundColor = p.bgHover; } }}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.borderColor = p.border;  e.currentTarget.style.backgroundColor = p.bgPanel; } }}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon size={compact ? 16 : 20} style={{ color: p.accent, flexShrink: 0 }} />
        {trend && <div style={{ color: p.success, fontSize: "0.66rem", fontFamily: "'Manrope', sans-serif", textAlign: "end" }}>{trend}</div>}
      </div>
      <div className="mt-4" style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: small ? "1.2rem" : compact ? "1.6rem" : "2rem",
        color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
        whiteSpace: small ? "nowrap" : "normal",
        overflow: small ? "hidden" : "visible",
        textOverflow: small ? "ellipsis" : "clip",
      }}>{value}</div>
      <div className="flex items-center justify-between gap-2" style={{ marginTop: 4 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>{label}</div>
        {onClick && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}
          >{ctaLabel || "Open"} →</div>
        )}
      </div>
    </Tag>
  );
}

function DashCard({ icon: Icon, title, body, cta, onClick, accentBg, p }) {
  return (
    <button onClick={onClick} className="text-start p-7 group transition-all"
      style={{
        backgroundColor: accentBg ? `${p.accent}10` : p.bgPanel,
        border: `1px solid ${accentBg ? p.accent : p.border}`,
      }}>
      <Icon size={26} style={{ color: p.accent }} />
      <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, marginTop: 14 }}>{title}</h4>
      <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.88rem", marginTop: 6, lineHeight: 1.6 }}>{body}</p>
      <div className="mt-4 flex items-center gap-2" style={{ color: p.accent, fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        {cta}
      </div>
    </button>
  );
}

function FilterPill({ children, active, color, onClick, p }) {
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

// Compact icon-only row action — used for Preview / Download / Email so the
// actions cell stays narrow and consistent.
// ---------------------------------------------------------------------------
// CommissionWorkspace — replaces the old single-CTA "Raise commission
// invoices" card. Shows live KPIs, a per-agency pending breakdown with
// one-click quick-invoice, and bulk-invoice / CSV-export actions.
// ---------------------------------------------------------------------------
function CommissionWorkspace({ bookings, agencies, selected, setSelected, onOpenInvoice, onScrollToBookings, p, t }) {
  const pending = useMemo(() => bookings.filter(b => b.status === "stayed" && !b.invoiced), [bookings]);

  const totalReady = useMemo(() => pending.reduce((s, b) => s + (b.comm || 0), 0), [pending]);

  const oldestPending = useMemo(() => {
    if (pending.length === 0) return null;
    return pending.reduce((oldest, b) => {
      const ref = oldest?.checkOut || oldest?.checkIn;
      const cur = b.checkOut || b.checkIn;
      return !oldest || new Date(cur) < new Date(ref) ? b : oldest;
    }, null);
  }, [pending]);

  const oldestDays = useMemo(() => {
    if (!oldestPending) return 0;
    const ref = oldestPending.checkOut || oldestPending.checkIn;
    const ms  = Date.now() - new Date(ref).getTime();
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  }, [oldestPending]);

  const pendingByAgency = useMemo(() => {
    const map = new Map();
    pending.forEach((b) => {
      const id = b.agencyId || "unknown";
      if (!map.has(id)) map.set(id, { agencyId: id, bookings: [], total: 0, oldest: null });
      const e = map.get(id);
      e.bookings.push(b);
      e.total += b.comm || 0;
      const cur = b.checkOut || b.checkIn;
      if (!e.oldest || new Date(cur) < new Date(e.oldest.checkOut || e.oldest.checkIn)) e.oldest = b;
    });
    return [...map.values()]
      .map((e) => ({ ...e, agency: agencies.find((a) => a.id === e.agencyId) }))
      .sort((a, b) => b.total - a.total);
  }, [pending, agencies]);

  const invoicedCount = bookings.filter(b => b.invoiced).length;
  const ytdPaid       = bookings.filter(b => b.invoiced).reduce((s, b) => s + (b.comm || 0), 0);

  const invoiceForAgency = (agencyId) => {
    const next = {};
    pending.filter(b => b.agencyId === agencyId).forEach(b => { next[b.ref] = true; });
    setSelected(next);
    onOpenInvoice();
  };

  const invoiceAll = () => {
    if (pending.length === 0) return;
    const next = {};
    pending.forEach(b => { next[b.ref] = true; });
    setSelected(next);
    onOpenInvoice();
  };

  const exportPendingCsv = () => {
    if (pending.length === 0) return;
    const header = ["Reference", "Agency ID", "Agency name", "Guest", "Check-in", "Check-out", "Nights", "Suite", "Stay value (BHD)", "Commission (BHD)"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    pending.forEach((b) => {
      const ag = agencies.find(a => a.id === b.agencyId);
      lines.push([b.ref, b.agencyId, ag?.name, b.guest, b.checkIn, b.checkOut, b.nights, b.suite, b.value, b.comm].map(esc).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pending-commissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <div style={{
      backgroundColor: `${p.accent}10`,
      border: `1px solid ${p.accent}`,
    }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-start justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-start gap-3">
          <Receipt size={26} style={{ color: p.accent, marginTop: 2 }} />
          <div>
            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, lineHeight: 1.1 }}>
              Commission workspace
            </h4>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.86rem", marginTop: 4, lineHeight: 1.5, maxWidth: 580 }}>
              Bundle stayed agent bookings into payable invoices. Quick-invoice an entire agency or pick line-by-line below.
            </p>
          </div>
        </div>
        {pending.length > 0 && (
          <div className="text-end" style={{ flexShrink: 0 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 600, lineHeight: 1 }}>
              {t("common.bhd")} {totalReady.toLocaleString()}
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 4, fontWeight: 700 }}>
              ready to invoice
            </div>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ backgroundColor: p.border }}>
        <WorkspaceKpi label="Pending bookings" value={pending.length} color={pending.length > 0 ? p.warn : p.success} hint={pending.length === 0 ? "All settled" : `${pendingByAgency.length} ${pendingByAgency.length === 1 ? "agency" : "agencies"}`} icon={Inbox} p={p} />
        <WorkspaceKpi label="Oldest pending" value={oldestPending ? `${oldestDays}d` : "—"} color={oldestDays > 30 ? p.danger : oldestDays > 14 ? p.warn : p.success} hint={oldestPending ? `${oldestPending.ref} · ${(agencies.find(a => a.id === oldestPending.agencyId)?.name) || "—"}` : "No pending"} icon={CalendarClock} p={p} />
        <WorkspaceKpi label="Already invoiced" value={invoicedCount} hint={`${t("common.bhd")} ${ytdPaid.toLocaleString()} settled`} icon={Layers} p={p} />
        <WorkspaceKpi label="Top awaiting" value={pendingByAgency[0]?.agency?.name || "—"} hint={pendingByAgency[0] ? `${t("common.bhd")} ${pendingByAgency[0].total.toLocaleString()} · ${pendingByAgency[0].bookings.length} bkg` : ""} icon={Sparkles} p={p} small />
      </div>

      {/* Per-agency pending list */}
      <div style={{ backgroundColor: p.bgPanel }}>
        <div className="px-6 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <Inbox size={11} /> Pending by agent
          </div>
          {pendingByAgency.length > 0 && (
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
              {pendingByAgency.length} {pendingByAgency.length === 1 ? "agency" : "agencies"}
            </span>
          )}
        </div>
        {pendingByAgency.length === 0 ? (
          <div className="px-6 py-8 flex items-center gap-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
            <span style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: `${p.success}1A`, color: p.success, border: `1px solid ${p.success}40` }}>
              <Sparkles size={14} />
            </span>
            <div>
              <div style={{ color: p.textPrimary, fontWeight: 600 }}>All caught up</div>
              <div style={{ marginTop: 2 }}>Every stayed agent booking has been invoiced. New stays will appear here as guests check out.</div>
            </div>
          </div>
        ) : (
          <div>
            {pendingByAgency.map((entry, idx) => {
              const oldestDate = entry.oldest?.checkOut || entry.oldest?.checkIn;
              const ageDays = oldestDate ? Math.max(0, Math.round((Date.now() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24))) : 0;
              const ageColor = ageDays > 30 ? p.danger : ageDays > 14 ? p.warn : p.textMuted;
              return (
                <div key={entry.agencyId} className="px-6 py-3 grid items-center gap-3"
                  style={{
                    gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,0.6fr) auto",
                    borderTop: idx === 0 ? "none" : `1px solid ${p.border}`,
                    backgroundColor: idx % 2 === 0 ? "transparent" : p.bgPanelAlt,
                  }}
                >
                  <div className="min-w-0">
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.agency?.name || entry.agencyId}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                      {entry.agency?.commissionPct != null ? `${entry.agency.commissionPct}% commission · ` : ""}{entry.agency?.paymentTerms || "—"}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                    <strong>{entry.bookings.length}</strong>
                    <span style={{ color: p.textMuted, fontSize: "0.74rem", marginInlineStart: 6 }}>{entry.bookings.length === 1 ? "booking" : "bookings"}</span>
                    {ageDays > 0 && (
                      <div style={{ color: ageColor, fontSize: "0.7rem", marginTop: 2, fontWeight: 600 }}>
                        oldest {ageDays}d
                      </div>
                    )}
                  </div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.94rem", color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {t("common.bhd")} {entry.total.toLocaleString()}
                  </div>
                  <button
                    onClick={() => invoiceForAgency(entry.agencyId)}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: p.accent,
                      color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                      border: `1px solid ${p.accent}`,
                      padding: "0.4rem 0.85rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      whiteSpace: "nowrap", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                    title={`Bundle ${entry.bookings.length} bookings into one invoice for ${entry.agency?.name}`}
                  >
                    <Zap size={11} /> Quick invoice
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-6 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <button
          onClick={onScrollToBookings}
          className="inline-flex items-center gap-1.5"
          style={{
            color: p.textSecondary, padding: "0.5rem 0.95rem", border: `1px solid ${p.border}`,
            backgroundColor: "transparent",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
        >
          <Edit2 size={11} /> Build custom invoice
        </button>
        <button
          onClick={invoiceAll}
          disabled={pending.length === 0}
          className="inline-flex items-center gap-1.5"
          style={{
            color: pending.length === 0 ? p.textDim : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
            backgroundColor: pending.length === 0 ? "transparent" : p.accent,
            border: `1px solid ${pending.length === 0 ? p.border : p.accent}`,
            padding: "0.5rem 0.95rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            cursor: pending.length === 0 ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => { if (pending.length > 0) { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; } }}
          onMouseLeave={(e) => { if (pending.length > 0) { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
        >
          <Zap size={11} /> Invoice all · {pending.length}
        </button>
        <div className="flex-1" />
        <button
          onClick={exportPendingCsv}
          disabled={pending.length === 0}
          className="inline-flex items-center gap-1.5"
          style={{
            color: pending.length === 0 ? p.textDim : p.textSecondary,
            border: `1px solid ${p.border}`, backgroundColor: "transparent",
            padding: "0.5rem 0.95rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            cursor: pending.length === 0 ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => { if (pending.length > 0) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
          onMouseLeave={(e) => { if (pending.length > 0) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
        >
          <FileSpreadsheet size={11} /> Export CSV
        </button>
      </div>
    </div>
  );
}

function WorkspaceKpi({ label, value, hint, icon: Icon, color, p, small }) {
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel }}>
      <div className="flex items-start justify-between gap-2">
        <Icon size={14} style={{ color: p.accent, flexShrink: 0 }} />
      </div>
      <div className="mt-2" style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: small ? "1rem" : "1.5rem",
        color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.1,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: small ? "nowrap" : "normal",
        overflow: small ? "hidden" : "visible",
        textOverflow: small ? "ellipsis" : "clip",
      }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 4, fontWeight: 700 }}>{label}</div>
      {hint && (
        <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 4, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {hint}
        </div>
      )}
    </div>
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
