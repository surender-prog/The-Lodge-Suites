import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Briefcase, Building2, Calculator, CalendarCheck, Check, CheckCircle2, ChevronDown, Coins, Copy, CreditCard, Download, Edit2, Eye, EyeOff, FileText, FileCheck, Gift, Globe, Hotel as HotelIcon, Lock, LogIn, LogOut, Mail, MessageCircle, MoreHorizontal, Phone, Plus, Printer, Receipt, RotateCcw, Save, Search, ShieldCheck, Sparkles, Trash2, Upload, User as UserIcon, Users as UsersIcon, X } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { fmtDate, inDays, nightsBetween } from "../../../../utils/date.js";
import { useData, applyTaxes, roomFitsParty, canViewCardOnFile, maskCardNumber, revealCardNumber, hasFullPan, cardOnFileExpired, buildCardOnFile, CARD_VAULT_RETENTION_DAYS, describePackageConditions, packagePriceSuffix, getPackageRoomPrice, formatCurrency, MEAL_PLANS, mealPlanLabel, roomTypeAvailable } from "../../../../data/store.jsx";
import { Card, Drawer, FileUpload, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, Stat, TableShell, Td, Th, TextField } from "../ui.jsx";
import { BookingDocPreviewModal, emailBookingDoc, printBookingDoc, printPreAuthForm } from "../BookingDocs.jsx";
import { roomLabel } from "../../../../lib/rooms.js";

const STATUS_LABEL = {
  "in-house":    "In-house",
  "confirmed":   "Confirmed",
  "on-request":  "On request",
  "checked-out": "Checked-out",
  "rejected":    "Rejected",
  "sold-out":    "Sold-out",
  "cancelled":   "Cancelled",
};

// Allowed status transitions. Hard-rules surface in the row-action menu
// (only valid next statuses render) and in the editor's "Change status"
// modal (same). Terminal statuses have empty arrays so no further
// transitions are offered without an explicit re-open.
//
//   on-request ─┬─► confirmed ──► in-house ─┬─► checked-out
//               │                            └─► cancelled
//               ├─► in-house (walk-in approved)
//               ├─► cancelled
//               ├─► rejected
//               └─► sold-out
//   confirmed ──┴─► (same as above, minus self & "confirmed → confirmed")
const ALLOWED_TRANSITIONS = {
  "on-request":  ["confirmed", "in-house", "cancelled", "rejected", "sold-out"],
  "confirmed":   ["in-house", "cancelled", "rejected", "sold-out"],
  "in-house":    ["checked-out", "cancelled"],
  "checked-out": [],
  "rejected":    [],
  "sold-out":    [],
  "cancelled":   [],
};

const PAYMENT_LABEL = {
  paid:      "Paid",
  deposit:   "Deposit",
  invoiced:  "Invoiced",
  pending:   "Pending",
};

const SOURCE_LABEL = {
  direct:    "Direct",
  ota:       "OTA",
  agent:     "Agent",
  corporate: "Corporate",
  member:    "Member",
};

// Vivid, semantically-meaningful colours for each booking status, payment
// state, and source channel. Each chip uses tinted-fill (12% alpha bg) +
// solid border + matching text + a small leading dot, mirroring the RFP
// pipeline pill style so the dashboard reads consistently across surfaces.
const STATUS_BASE = {
  "confirmed":   "#2563EB", // blue   — future booking, scheduled
  "in-house":    "#16A34A", // green  — guest currently staying
  "on-request":  "#D97706", // amber  — awaiting hotel confirmation
  "checked-out": "#64748B", // slate  — completed, archived
  "rejected":    "#9F1239", // rose   — hotel declined the request
  "sold-out":    "#7C3AED", // purple — no availability for these dates
  "cancelled":   "#DC2626", // red    — cancelled
};

const PAYMENT_BASE = {
  paid:     "#16A34A", // green
  deposit:  "#D97706", // amber  — partial settled
  invoiced: "#2563EB", // blue   — sent, awaiting
  pending:  "#DC2626", // red    — unpaid, action required
};

const SOURCE_BASE = {
  direct:    "#9A7E40", // gold     — direct guest, primary brand colour
  ota:       "#0891B2", // teal     — channel partner
  agent:     "#7C3AED", // purple   — wholesaler / travel agent
  corporate: "#D97706", // amber    — corporate account
  member:    "#16A34A", // green    — LS Privilege member
};

// Inline-style helpers — use one of these wherever a status / payment /
// source pill is rendered so the visual stays in sync.
function chipStyle(base) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "'Manrope', sans-serif",
    fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase",
    fontWeight: 700, whiteSpace: "nowrap",
    padding: "3px 9px",
    color: base,
    backgroundColor: `${base}1F`,
    border: `1px solid ${base}`,
  };
}
const dotStyle = (base) => ({
  width: 7, height: 7, borderRadius: 999,
  backgroundColor: base, display: "inline-block", flexShrink: 0,
});

const statusChip  = (s) => chipStyle(STATUS_BASE[s]   || "#6B7280");
const statusDot   = (s) => dotStyle(STATUS_BASE[s]    || "#6B7280");
const paymentChip = (s) => chipStyle(PAYMENT_BASE[s]  || "#6B7280");
const paymentDot  = (s) => dotStyle(PAYMENT_BASE[s]   || "#6B7280");
const sourceChip  = (s) => chipStyle(SOURCE_BASE[s]   || "#6B7280");
const sourceDot   = (s) => dotStyle(SOURCE_BASE[s]    || "#6B7280");

export const Bookings = ({ onNavigate, params, clearParams }) => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { bookings, rooms, members } = useData();

  // Match a booking guest to an LS Privilege member by email so we can
  // deep-link the guest-name click to their member profile.
  const memberByEmail = (email) => {
    if (!email) return null;
    const lower = email.trim().toLowerCase();
    return members.find((m) => m.email && m.email.toLowerCase() === lower) || null;
  };
  const openGuest = (b) => {
    const m = memberByEmail(b.email);
    if (m && typeof onNavigate === "function") {
      onNavigate("admin", "loyalty", { memberId: m.id });
      return;
    }
    setEditing({ ...b });
  };

  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [room, setRoom] = useState("all");
  // Payment filter — added so the "Filtered paid" KPI tile and similar
  // collection-status workflows have a real lever to pull. "all" leaves
  // payment unconstrained.
  const [payment, setPayment] = useState("all");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  // Deep-link handoff — when a sibling section (e.g. Payments) navigates
  // here with `{ bookingId }`, open that booking's editor immediately.
  React.useEffect(() => {
    if (!params?.bookingId) return;
    const target = bookings.find((b) => b.id === params.bookingId);
    if (target) setEditing({ ...target });
    clearParams?.();
  }, [params, bookings, clearParams]);

  // Scroll target — the four KPI tiles snap the page to the reservations
  // table after they apply their filter, so the operator never has to hunt
  // for the result they just narrowed to.
  const tableRef = useRef(null);
  const scrollToTable = () => {
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };
  // Reset every filter back to "all" and clear the search box. Used by the
  // Total bookings tile + the existing "Reset" affordance below.
  const resetFilters = () => {
    setQ(""); setSource("all"); setStatus("all"); setRoom("all"); setPayment("all");
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    // Newest first — sort by createdAt when present, fall back to checkIn
    // date (older seeded records lack createdAt). Strings compare lex which
    // is correct for ISO-8601 timestamps and YYYY-MM-DD dates.
    const matches = bookings.filter((b) => {
      if (source !== "all" && b.source !== source) return false;
      if (status !== "all" && b.status !== status) return false;
      if (room !== "all" && b.roomId !== room) return false;
      if (payment !== "all" && b.paymentStatus !== payment) return false;
      if (!ql) return true;
      return b.id.toLowerCase().includes(ql) || b.guest.toLowerCase().includes(ql) || b.email.toLowerCase().includes(ql);
    });
    return matches.slice().sort((a, b) => {
      const aKey = a.createdAt || a.checkIn || "";
      const bKey = b.createdAt || b.checkIn || "";
      if (aKey || bKey) return String(bKey).localeCompare(String(aKey));
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  }, [bookings, q, source, status, room, payment]);

  // Pagination — operator chooses page size; new bookings appear at the top
  // of page 1 because the list is sorted newest-first above.
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  // Reset to page 0 when filters change so the operator doesn't end up on
  // an empty trailing page after narrowing the result set.
  useEffect(() => { setPage(0); }, [q, source, status, room, payment, pageSize]);
  const totalPages   = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage     = Math.min(page, totalPages - 1);
  const pageStart    = safePage * pageSize;
  const pageEnd      = Math.min(pageStart + pageSize, filtered.length);
  const pageItems    = filtered.slice(pageStart, pageEnd);

  const totalValue = filtered.reduce((s, b) => s + b.total, 0);
  const totalPaid = filtered.reduce((s, b) => s + b.paid, 0);
  const inHouse = bookings.filter((b) => b.status === "in-house").length;

  const sourceColor = (src) => ({
    direct: p.accent, ota: p.warn, agent: p.success, corporate: p.textMuted,
  })[src] || p.textMuted;
  const paymentColor = (s) => ({
    paid: p.success, deposit: p.warn, invoiced: p.accent, pending: p.danger,
  })[s] || p.textMuted;

  return (
    <div>
      <PageHeader
        title="Bookings"
        intro="All reservations across direct, OTA, agent, and corporate channels. Filter, search, and act on payment status."
        action={<PrimaryBtn onClick={() => setCreating(true)} small><Plus size={12} /> New booking</PrimaryBtn>}
      />

      {/* KPI strip — every tile drills into the reservations table with the
          appropriate filter applied. The page scrolls to the table on click
          so the operator sees the result immediately. */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Total bookings"
          value={bookings.length}
          ctaLabel="View all"
          onClick={() => { resetFilters(); scrollToTable(); }}
        />
        <Stat
          label="In-house tonight"
          value={inHouse}
          color={p.success}
          ctaLabel="View"
          onClick={() => {
            // Snap status filter; preserve other filters (search/source/room)
            // so the operator can stack "in-house + corporate" if they want.
            setStatus("in-house");
            scrollToTable();
          }}
        />
        <Stat
          label="Filtered value"
          value={formatCurrency(totalValue)}
          hint={`${filtered.length} bookings`}
          ctaLabel="View list"
          onClick={() => scrollToTable()}
        />
        <Stat
          label="Filtered paid"
          value={formatCurrency(totalPaid)}
          hint={`${Math.round(totalPaid / Math.max(1, totalValue) * 100)}% collected`}
          color={p.accent}
          ctaLabel="View paid"
          onClick={() => { setPayment("paid"); scrollToTable(); }}
        />
      </div>

      <SourceMixCard bookings={bookings} setSource={setSource} activeSource={source} />

      <Card
        title="Filters"
        className="mb-4"
        action={
          // Reset surfaces only when at least one filter is active. Mirrors
          // the same affordance used in the Activities and Reports admin
          // sections so the muscle memory transfers.
          (q || source !== "all" || status !== "all" || room !== "all" || payment !== "all") ? (
            <GhostBtn small onClick={resetFilters}>Reset filters</GhostBtn>
          ) : null
        }
      >
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <div className="flex items-center" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <Search size={14} style={{ color: p.textMuted, marginInlineStart: 10 }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search ref, guest, email…"
                className="flex-1 outline-none"
                style={{ padding: "0.55rem 0.75rem", color: p.textPrimary, backgroundColor: "transparent", fontSize: "0.85rem", border: "none", minWidth: 0 }}
              />
            </div>
          </div>
          <SelectField value={source} onChange={setSource} options={[
            { value: "all", label: "All sources" },
            ...Object.entries(SOURCE_LABEL).map(([v, l]) => ({ value: v, label: l })),
          ]} />
          <SelectField value={status} onChange={setStatus} options={[
            { value: "all", label: "All statuses" },
            ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })),
          ]} />
          <SelectField value={room} onChange={setRoom} options={[
            { value: "all", label: "All room types" },
            ...rooms.map((r) => ({ value: r.id, label: roomLabel(r, t) })),
          ]} />
          <SelectField value={payment} onChange={setPayment} options={[
            { value: "all", label: "All payments" },
            ...Object.entries(PAYMENT_LABEL).map(([v, l]) => ({ value: v, label: l })),
          ]} />
        </div>
      </Card>

      {/* Reservations table — scroll target for the four KPI tiles */}
      <div ref={tableRef} style={{ scrollMarginTop: 24 }} />
      <Card padded={false} title={`Reservations (${filtered.length})`}>
        <TableShell>
          <thead>
            <tr>
              <Th>Reference</Th>
              <Th>Guest</Th>
              <Th>Source</Th>
              <Th>Room</Th>
              <Th>Dates</Th>
              <Th align="end">Nights</Th>
              <Th align="end">Total</Th>
              <Th>Payment</Th>
              <Th>Status</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((b) => {
              // "Void" bookings — cancelled / rejected / sold-out — are
              // rows for stays that didn't happen. Strike them through and
              // dim the row so the operator can scan past them at a glance
              // while the record stays on file for the audit trail.
              const isVoid = ["cancelled", "rejected", "sold-out"].includes(b.status);
              const voidLine = isVoid ? { textDecoration: "line-through", textDecorationThickness: "1px" } : undefined;
              return (
              <tr key={b.id} style={isVoid ? { opacity: 0.6 } : undefined}>
                <Td>
                  <button
                    onClick={() => setEditing({ ...b })}
                    title="Open booking"
                    className="group text-start"
                    style={{ backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    <div className="group-hover:underline"
                      style={{
                        color: p.accent, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.05em",
                        textDecorationColor: p.accent, textUnderlineOffset: 3,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        ...voidLine,
                      }}>{b.id}</div>
                  </button>
                </Td>
                <Td>
                  {(() => {
                    const guestMember = memberByEmail(b.email);
                    return (
                      <button
                        onClick={() => openGuest(b)}
                        title={guestMember ? `Open ${b.guest}'s LS Privilege profile` : `Open booking for ${b.guest}`}
                        className="group text-start"
                        style={{ backgroundColor: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="group-hover:underline" style={{
                            fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem",
                            color: p.textPrimary,
                            textDecorationColor: p.accent, textUnderlineOffset: 3,
                            ...voidLine,
                          }}>{b.guest}</div>
                          {guestMember && (
                            <span title={`LS Privilege · ${guestMember.id}`}
                              style={{
                                fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                                padding: "1px 6px", color: p.accent, border: `1px solid ${p.accent}`, backgroundColor: `${p.accent}10`,
                              }}>★ Member</span>
                          )}
                        </div>
                        {b.email && (
                          <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{b.email}</div>
                        )}
                      </button>
                    );
                  })()}
                </Td>
                <Td>
                  <span style={sourceChip(b.source)}>
                    <span style={sourceDot(b.source)} />
                    {SOURCE_LABEL[b.source]}
                  </span>
                </Td>
                <Td style={voidLine}>{roomLabel(rooms.find((r) => r.id === b.roomId) || b.roomId, t)}</Td>
                <Td muted style={voidLine}>{fmtDate(b.checkIn, lang)} → {fmtDate(b.checkOut, lang)}</Td>
                <Td align="end" style={voidLine}>{b.nights}</Td>
                <Td align="end" className="font-semibold" style={voidLine}>{formatCurrency(b.total)}</Td>
                <Td>
                  {/* Distinguish "Pay-now, card captured, awaiting the
                      operator's Mark-as-charged" from a plain pending
                      pay-on-arrival booking. Both render in amber, but
                      the awaiting-charge variant labels the card-on-
                      file action explicitly so the AR team knows to
                      run the gateway and record the transaction. */}
                  {b.paymentStatus === "pending" && b.cardOnFile ? (
                    <span style={chipStyle(PAYMENT_BASE.deposit)}>
                      <span style={dotStyle(PAYMENT_BASE.deposit)} />
                      Card · awaiting charge
                    </span>
                  ) : (
                    <span style={paymentChip(b.paymentStatus)}>
                      <span style={paymentDot(b.paymentStatus)} />
                      {PAYMENT_LABEL[b.paymentStatus]}
                    </span>
                  )}
                </Td>
                <Td>
                  <span style={statusChip(b.status)}>
                    <span style={statusDot(b.status)} />
                    {STATUS_LABEL[b.status]}
                  </span>
                  {b.hotelConfirmationNo && (
                    <div
                      title="Hotel confirmation no."
                      style={{
                        marginTop: 4,
                        color: p.textMuted,
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.7rem",
                        letterSpacing: "0.04em",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {b.hotelConfirmationNo}
                    </div>
                  )}
                </Td>
                <Td align="end">
                  <RowActions booking={b} onEdit={() => setEditing({ ...b })} />
                </Td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center" style={{ color: p.textMuted, fontSize: "0.88rem" }}>No bookings match the current filters.</td></tr>
            )}
          </tbody>
        </TableShell>
        {/* Pagination footer — only render when there's more than one page's
            worth of data; the page-size selector still shows up so the
            operator can switch their preferred density on smaller filtered
            sets too. */}
        {filtered.length > 0 && (
          <div
            className="flex items-center justify-between gap-3 flex-wrap px-4 py-3"
            style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}
          >
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textMuted }}>
              Showing <strong style={{ color: p.textPrimary }}>{pageStart + 1}</strong>
              –<strong style={{ color: p.textPrimary }}>{pageEnd}</strong>
              {" "}of <strong style={{ color: p.textPrimary }}>{filtered.length}</strong>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.62rem", letterSpacing: "0.22em",
                  textTransform: "uppercase", color: p.textMuted, fontWeight: 700,
                }}>Rows per page</span>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageSize(n)}
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.72rem", fontWeight: 700,
                      padding: "4px 10px",
                      backgroundColor: pageSize === n ? p.accent : "transparent",
                      color: pageSize === n ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                      border: `1px solid ${pageSize === n ? p.accent : p.border}`,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5" style={{ borderInlineStart: `1px solid ${p.border}`, paddingInlineStart: 12 }}>
                <button
                  onClick={() => setPage((x) => Math.max(0, x - 1))}
                  disabled={safePage === 0}
                  style={{
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", fontWeight: 700,
                    padding: "4px 10px",
                    color: safePage === 0 ? p.textMuted : p.textPrimary,
                    border: `1px solid ${p.border}`, backgroundColor: "transparent",
                    cursor: safePage === 0 ? "not-allowed" : "pointer",
                  }}
                >‹ Prev</button>
                <span style={{
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem",
                  color: p.textSecondary, padding: "0 8px",
                }}>
                  Page <strong style={{ color: p.textPrimary }}>{safePage + 1}</strong> of {totalPages}
                </span>
                <button
                  onClick={() => setPage((x) => Math.min(totalPages - 1, x + 1))}
                  disabled={safePage >= totalPages - 1}
                  style={{
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", fontWeight: 700,
                    padding: "4px 10px",
                    color: safePage >= totalPages - 1 ? p.textMuted : p.textPrimary,
                    border: `1px solid ${p.border}`, backgroundColor: "transparent",
                    cursor: safePage >= totalPages - 1 ? "not-allowed" : "pointer",
                  }}
                >Next ›</button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {creating && <BookingCreator onClose={() => setCreating(false)} />}
      {editing  && <BookingEditor booking={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Source mix card — visual breakdown of how bookings break down by channel,
// with click-to-filter behaviour. Sits above the filters so the operator can
// see the mix at a glance and drill in.
// ---------------------------------------------------------------------------
function SourceMixCard({ bookings, setSource, activeSource }) {
  const p = usePalette();
  const t = useT();
  const tally = useMemo(() => {
    const out = { direct: 0, member: 0, ota: 0, agent: 0, corporate: 0 };
    let value = 0;
    for (const b of bookings) {
      out[b.source] = (out[b.source] || 0) + 1;
      value += b.total;
    }
    return { out, value };
  }, [bookings]);
  const total = bookings.length || 1;
  const SOURCES = [
    { id: "direct",    color: p.accent,       hint: "Website + walk-in" },
    { id: "member",    color: p.success,      hint: "LS Privilege" },
    { id: "ota",       color: p.warn,         hint: "Booking, Expedia, etc." },
    { id: "agent",     color: p.accentBright, hint: "Travel agencies" },
    { id: "corporate", color: p.textMuted,    hint: "Corporate accounts" },
  ];
  return (
    <Card title="Mix · all channels" className="mb-4" padded={false}>
      <div className="px-5 py-4 grid sm:grid-cols-5 gap-3">
        {SOURCES.map((s) => {
          const n = tally.out[s.id] || 0;
          const pct = Math.round((n / total) * 100);
          const isActive = activeSource === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSource(activeSource === s.id ? "all" : s.id)}
              className="text-start p-3 transition-colors"
              style={{
                border: `1px solid ${isActive ? s.color : p.border}`,
                backgroundColor: isActive ? p.bgPanelAlt : "transparent",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: s.color, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{SOURCE_LABEL[s.id]}</span>
                <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                {n}
              </div>
              <div className="mt-2 h-1" style={{ backgroundColor: p.border }}>
                <div className="h-full" style={{ width: `${pct}%`, backgroundColor: s.color, transition: "width 400ms" }} />
              </div>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", marginTop: 4 }}>{s.hint}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Per-row actions. Inline icon buttons for the most common operations + a
// kebab popover for the long tail (cancel / check-in / check-out / refund).
// ---------------------------------------------------------------------------
function RowActions({ booking, onEdit }) {
  const p = usePalette();
  const t = useT();
  const { updateBooking, removeBooking, addInvoice, invoices, tax, rooms, extras, staffSession, appendAuditLog, hotelInfo, members, releaseGiftCardForBooking } = useData();
  const { lang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [docPreview, setDocPreview] = useState(null); // "invoice" | "receipt" | null
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [whatsAppPreview, setWhatsAppPreview] = useState(false);
  const [statusChange, setStatusChange] = useState(null); // target status string, or null
  const ref = useRef(null);

  const alreadyBilled = invoices.some(i => i.bookingId === booking.id);
  const hasPayment    = (booking.paid || 0) > 0;
  // Operator must hold `bookings_delete` for the destructive entry to render.
  const canDeleteBooking = Array.isArray(staffSession?.permissions)
    && staffSession.permissions.includes("bookings_delete");

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const sendEmail = () => {
    pushToast({ message: `Confirmation email sent to ${booking.email}` });
  };
  // Resolve the customer's phone, preferring the value captured at booking
  // time and falling back to the linked LS Privilege member record. The
  // public booking flow always asks for a number, but staff-created
  // corporate / agent bookings often skip it — try memberId first, then
  // email match, so we recover the phone whenever the guest is also on
  // file as a member.
  const customerPhone = (() => {
    const direct = (booking.phone || "").trim();
    if (direct) return direct;
    if (!Array.isArray(members)) return "";
    let m = booking.memberId ? members.find((x) => x.id === booking.memberId) : null;
    if (!m && booking.email) {
      const lower = String(booking.email).trim().toLowerCase();
      m = members.find((x) => (x.email || "").toLowerCase() === lower);
    }
    return (m?.phone || "").trim();
  })();
  // WhatsApp accepts the international number as digits only (no leading
  // +, no spaces, no dashes). Anything left after stripping is the phone
  // the deep link should target — the preview modal's "Open in WhatsApp"
  // button is shown only when waDigits is long enough to be plausible.
  const waDigits = customerPhone.replace(/\D/g, "");
  // Pre-fill the confirmation message with the operational essentials:
  // booking id, suite, dates, party, total. Each line carries a leading
  // emoji so the message scans quickly on a phone (WhatsApp ignores HTML
  // styling, but renders Unicode emoji + *bold* asterisks correctly on
  // every platform). The status line uses a glyph + uppercase bold word
  // so it stands out as the headline of the message.
  const buildWhatsAppMessage = () => {
    const room       = rooms.find((r) => r.id === booking.roomId);
    const suiteName  = room ? roomLabel(room, t) : booking.roomId;
    const checkInD   = fmtDate(booking.checkIn, lang);
    const checkOutD  = fmtDate(booking.checkOut, lang);
    const checkInT   = hotelInfo?.checkIn  || "14:00";
    const checkOutT  = hotelInfo?.checkOut || "12:00";
    const hotel      = hotelInfo?.name || "The Lodge Suites";
    const phoneLine  = hotelInfo?.phone ? `\n📞 For changes call ${hotelInfo.phone}.` : "";
    const totalStr   = formatCurrency(booking.total || 0);
    const partyLine  = (booking.guests || 1) === 1
      ? "1 guest"
      : `${booking.guests} guests`;
    const nightsLine = (booking.nights || 1) === 1
      ? "1 night"
      : `${booking.nights} nights`;
    // Map each booking status to an operator-recognisable glyph + a
    // headline word. Anything unknown falls back to a neutral receipt.
    const STATUS_BADGE = {
      "confirmed":   { icon: "✅", label: "CONFIRMED"   },
      "in-house":    { icon: "🏨", label: "IN-HOUSE"    },
      "on-request":  { icon: "⏳", label: "ON REQUEST"  },
      "checked-out": { icon: "👋", label: "CHECKED OUT" },
      "rejected":    { icon: "🚫", label: "REJECTED"    },
      "sold-out":    { icon: "🛑", label: "SOLD OUT"    },
      "cancelled":   { icon: "❌", label: "CANCELLED"   },
    };
    const badge = STATUS_BADGE[booking.status] || { icon: "🧾", label: String(booking.status || "BOOKING").toUpperCase() };
    const hotelRef = (booking.hotelConfirmationNo || "").trim();
    return [
      `Hello ${booking.guest || "guest"},`,
      "",
      `${badge.icon} Your reservation at *${hotel}* is *${badge.label}*.`,
      "",
      `🧾 *Booking* ${booking.id}`,
      // Hotel's own PMS reference, shown only when the operator has filled
      // it in — guests usually quote this on arrival, not our internal id.
      ...(hotelRef ? [`🏨 *Hotel Ref* ${hotelRef}`] : []),
      `🛏️ *Suite* ${suiteName}`,
      `🛬 *Check-in* ${checkInD} from ${checkInT}`,
      `🛫 *Check-out* ${checkOutD} by ${checkOutT}`,
      `🌙 *Stay* ${nightsLine} · ${partyLine}`,
      `💳 *Total* ${totalStr}`,
      "",
      `We look forward to welcoming you to Juffair.${phoneLine}`,
    ].join("\n");
  };
  // Open a small preview modal so the operator SEES the message before
  // copying. A silent navigator.clipboard.writeText() looks broken when
  // it's blocked by a sandboxed iframe, missing document focus, or a
  // restrictive Permissions-Policy header — the visible textarea is the
  // reliable fallback (operator can always select-all + Cmd/Ctrl+C
  // manually even if the auto-copy fails).
  const sendInvoice = () => {
    pushToast({ message: `Invoice for ${booking.id} dispatched` });
  };
  const markPaid = () => {
    updateBooking(booking.id, { paymentStatus: "paid", paid: booking.total });
    pushToast({ message: `${booking.id} marked as paid` });
  };
  // Status changes route through StatusChangeDialog → applyStatusChange so
  // every transition stamps a remark + actor + timestamp into both
  // booking.statusLog (for inline history in the editor) and audit_logs
  // (for the global audit trail). Direct setStatus calls would leak past
  // the remark requirement and break the workflow contract.
  const requestStatus = (next) => {
    const allowed = ALLOWED_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(next)) {
      pushToast({
        message: `Cannot move ${STATUS_LABEL[booking.status]} → ${STATUS_LABEL[next] || next}.`,
        kind: "warn",
      });
      return;
    }
    setStatusChange(next);
  };
  const applyStatusChange = (next, remark) => {
    const trimmed = String(remark || "").trim();
    if (!trimmed) {
      pushToast({ message: "A remark is required for every status change.", kind: "warn" });
      return false;
    }
    const ts = new Date().toISOString();
    const entry = {
      ts,
      actorId:   staffSession?.id   || "anon",
      actorName: staffSession?.name || "Staff",
      actorRole: staffSession?.role || null,
      from: booking.status,
      to:   next,
      remark: trimmed,
    };
    const nextLog = Array.isArray(booking.statusLog) ? [...booking.statusLog, entry] : [entry];
    updateBooking(booking.id, { status: next, statusLog: nextLog });
    // Release held gift-card nights when the booking falls out of the
    // active set — they return to the card's balance. No-op for bookings
    // that don't redeem a card.
    if (["cancelled", "rejected", "sold-out"].includes(next) && booking.redeemingGiftCardId) {
      try { releaseGiftCardForBooking(booking.id); } catch (_) {}
    }
    try {
      appendAuditLog?.({
        kind: "booking-status-change",
        actorId:   entry.actorId,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        targetKind: "booking",
        targetId:   booking.id,
        targetName: booking.guest || null,
        details: `Status ${STATUS_LABEL[entry.from] || entry.from} → ${STATUS_LABEL[entry.to] || entry.to} · ${trimmed}`
          + (["cancelled", "rejected", "sold-out"].includes(next) && booking.redeemingGiftCardId
              ? ` · released ${booking.giftCardNightsRequested || 0} night(s) back to ${booking.redeemingGiftCardCode}`
              : ""),
      });
    } catch (_) {}
    pushToast({
      message: `${booking.id}: ${STATUS_LABEL[next] || next}`,
      kind: next === "cancelled" || next === "rejected" || next === "sold-out" ? "warn" : "success",
    });
    setStatusChange(null);
    return true;
  };
  const allowedNext = ALLOWED_TRANSITIONS[booking.status] || [];
  // Hard-delete invoked from the row kebab. Same audit-log + toast pattern
  // as the drawer's danger-zone action — gated by `bookings_delete` and
  // requires "type to confirm" via the shared modal.
  const deletePermanently = () => {
    if (!canDeleteBooking) return;
    try { removeBooking(booking.id); } catch (_) {}
    try {
      appendAuditLog?.({
        kind: "booking-deleted",
        actorId: staffSession?.id || "anon",
        actorName: staffSession?.name || "Staff",
        actorRole: staffSession?.role || null,
        targetKind: "booking",
        targetId: booking.id,
        targetName: booking.guest || null,
        details: "Permanently deleted from DB",
      });
    } catch (_) {}
    pushToast({ message: `Booking deleted · ${booking.id}`, kind: "warn" });
    setConfirmDelete(false);
  };
  const generateInvoice = () => {
    const today = new Date().toISOString().slice(0, 10);
    const due = booking.source === "guest" || booking.source === "direct" ? today
              : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    addInvoice({
      bookingId: booking.id,
      clientType: booking.source === "corporate" ? "corporate" : booking.source === "agent" ? "agent" : "guest",
      clientName: booking.guest,
      issued: today,
      due,
      amount: booking.total,
      paid: 0,
      status: "issued",
      // Booking-AR — the client owes the hotel for the stay. Commission
      // payables are issued separately from the AgentTab commission flow.
      kind: "booking",
    });
    pushToast({ message: `Invoice generated for ${booking.id}` });
  };

  return (
    <div className="flex items-center gap-2 justify-end relative" ref={ref}>
      <IconBtn title="Send confirmation email" onClick={sendEmail}><Mail size={13} /></IconBtn>
      <IconBtn title="View invoice / folio" onClick={() => setDocPreview("invoice")}><FileText size={13} /></IconBtn>
      <IconBtn
        title={hasPayment ? "View payment receipt" : "No payment received yet"}
        onClick={() => hasPayment && setDocPreview("receipt")}
        disabled={!hasPayment}
      ><Receipt size={13} /></IconBtn>
      <IconBtn title="Edit booking" onClick={onEdit}><Edit2 size={13} /></IconBtn>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        title="More actions"
        style={{ color: p.textMuted, padding: "4px 6px", border: `1px solid ${p.border}` }}
        onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
      >
        <MoreHorizontal size={13} />
      </button>
      {menuOpen && (
        <div className="absolute end-0 top-full mt-1 z-20 min-w-[200px]" style={{
          backgroundColor: p.bgPanel, border: `1px solid ${p.border}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
        }}>
          {!alreadyBilled ? (
            <MenuItem icon={FileText} label="Generate invoice" onClick={() => { setMenuOpen(false); generateInvoice(); }} />
          ) : (
            <MenuItem icon={FileText} label="Resend invoice" onClick={() => { setMenuOpen(false); sendInvoice(); }} />
          )}
          <MenuItem icon={MessageCircle} label="WhatsApp message" onClick={() => { setMenuOpen(false); setWhatsAppPreview(true); }} />
          {booking.paymentStatus !== "paid" && (
            <MenuItem icon={CheckCircle2} label="Mark as paid" onClick={() => { setMenuOpen(false); markPaid(); }} />
          )}
          {/* Status transitions — only what the workflow allows from the
              current state. Each route opens StatusChangeDialog so the
              operator must leave a remark before it lands. */}
          {allowedNext.includes("confirmed") && (
            <MenuItem icon={CheckCircle2} label="Confirm booking" onClick={() => { setMenuOpen(false); requestStatus("confirmed"); }} />
          )}
          {allowedNext.includes("in-house") && (
            <MenuItem icon={LogIn} label="Check in" onClick={() => { setMenuOpen(false); requestStatus("in-house"); }} />
          )}
          {allowedNext.includes("checked-out") && (
            <MenuItem icon={LogOut} label="Check out" onClick={() => { setMenuOpen(false); requestStatus("checked-out"); }} />
          )}
          {(allowedNext.includes("rejected") || allowedNext.includes("sold-out") || allowedNext.includes("cancelled")) && (
            <div style={{ height: 1, backgroundColor: p.border }} />
          )}
          {allowedNext.includes("rejected") && (
            <MenuItem icon={Ban} label="Reject booking" onClick={() => { setMenuOpen(false); requestStatus("rejected"); }} danger />
          )}
          {allowedNext.includes("sold-out") && (
            <MenuItem icon={Ban} label="Mark sold-out" onClick={() => { setMenuOpen(false); requestStatus("sold-out"); }} danger />
          )}
          {allowedNext.includes("cancelled") && (
            <MenuItem icon={Ban} label="Cancel booking" onClick={() => { setMenuOpen(false); requestStatus("cancelled"); }} danger />
          )}
          {canDeleteBooking && (
            <MenuItem icon={Trash2} label="Delete permanently" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} danger />
          )}
        </div>
      )}
      {docPreview && (
        <BookingDocPreviewModal
          booking={booking}
          kind={docPreview}
          tax={tax}
          rooms={rooms}
          extras={extras}
          onClose={() => setDocPreview(null)}
        />
      )}
      {confirmDelete && (
        <DeleteBookingConfirmModal
          booking={booking}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={deletePermanently}
        />
      )}
      {whatsAppPreview && (
        <WhatsAppMessagePreview
          booking={booking}
          message={buildWhatsAppMessage()}
          phone={customerPhone}
          waDigits={waDigits}
          onClose={() => setWhatsAppPreview(false)}
        />
      )}
      {statusChange && (
        <StatusChangeDialog
          booking={booking}
          nextStatus={statusChange}
          onCancel={() => setStatusChange(null)}
          onConfirm={(remark) => applyStatusChange(statusChange, remark)}
        />
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children, disabled }) {
  const p = usePalette();
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        color: disabled ? p.textDim : p.textMuted,
        padding: "4px 6px",
        border: `1px solid ${p.border}`,
        backgroundColor: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; } }}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon: Ic, label, onClick, danger }) {
  const p = usePalette();
  return (
    <button onClick={onClick} className="w-full text-start flex items-center gap-2 px-3 py-2"
      style={{ color: danger ? p.danger : p.textSecondary }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgPanelAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
      <Ic size={12} /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BookingCreator — full-page form with searchable client picker.
// ---------------------------------------------------------------------------
const SOURCE_OPTIONS = [
  { id: "direct",    label: "Direct guest",   icon: UserIcon,   note: "Walk-in / phone / website" },
  { id: "member",    label: "LS Privilege member", icon: UsersIcon, note: "Search by name, email or member ID" },
  { id: "corporate", label: "Corporate account", icon: Building2, note: "Apply negotiated net rate" },
  { id: "agent",     label: "Travel agent",    icon: UsersIcon,  note: "Commission paid to agency" },
];

function BookingCreator({ onClose }) {
  const t = useT();
  const p = usePalette();
  const { rooms, members, agreements, agencies, calendar, addBooking, updateMember, loyalty, tiers, bookings, roomUnits, staffSession } = useData();

  const [source, setSource] = useState("direct");
  const [client, setClient] = useState(null); // member / agreement / agency object
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [draft, setDraft] = useState({
    roomId: rooms[0]?.id,
    checkIn: inDays(7),
    checkOut: inDays(10),
    guests: 2,
    notes: "",
    redeemPoints: 0,
  });
  // Pre-payment branch — when a corporate/agent client's underlying
  // contract is on "Pre-payment (cash)" terms, the admin needs to pick
  // the same Pay-on-arrival / Pay-now choice the partner / B2C surfaces
  // present, and capture a card on file when Pay-now is selected. Reset
  // whenever the client or source changes so the staff member confirms
  // the choice explicitly before each save.
  const [paymentTiming, setPaymentTiming] = useState("later"); // "later" | "now"
  const [cardName, setCardName] = useState("");
  const [cardNum,  setCardNum]  = useState("");
  const [cardExp,  setCardExp]  = useState("");
  const [cardCvc,  setCardCvc]  = useState("");
  useEffect(() => {
    setPaymentTiming("later");
    setCardName(""); setCardNum(""); setCardExp(""); setCardCvc("");
  }, [source, client?.id]);
  const PAY_NOW_DISCOUNT_PCT = 5;

  const isPrepay = (source === "corporate" || source === "agent")
    && (client?.paymentTerms || "") === "Pre-payment (cash)";
  const needsCard = isPrepay && paymentTiming === "now";
  const cardComplete = !!cardName.trim() && !!cardNum.trim() && !!cardExp.trim() && !!cardCvc.trim();
  const cardMissing = needsCard && !cardComplete;

  const room = rooms.find(r => r.id === draft.roomId);
  const nights = nightsBetween(draft.checkIn, draft.checkOut);

  // Choose the right rate for the chosen source. Long stays (≥ 30 nights)
  // use the corporate / agent monthly rate (divided to a per-night equivalent
  // for the calendar render); shorter stays use the daily contract rate.
  const baseRate = useMemo(() => {
    if (!room) return 0;
    const longStay = nights >= 30;
    const pickFromMap = (map) => {
      if (!map) return 0;
      if (room.id === "studio")    return map.studio   || 0;
      if (room.id === "one-bed")   return map.oneBed   || 0;
      if (room.id === "two-bed")   return map.twoBed   || 0;
      if (room.id === "three-bed") return map.threeBed || 0;
      return 0;
    };
    if (source === "corporate" && client) {
      if (longStay) {
        const monthly = pickFromMap(client.monthlyRates);
        if (monthly > 0) return Math.round(monthly / 30);
      }
      const daily = pickFromMap(client.dailyRates);
      if (daily > 0) return daily;
    }
    if (source === "agent" && client) {
      if (longStay) {
        const monthly = pickFromMap(client.monthlyNet);
        if (monthly > 0) return Math.round(monthly / 30);
      }
      const daily = pickFromMap(client.dailyNet);
      if (daily > 0) return daily;
    }
    return room.price;
  }, [source, client, room, nights]);

  // Average rate across the booking window — uses calendar overrides where
  // present, otherwise falls back to the source-specific base rate.
  const avgRate = useMemo(() => {
    if (!room || nights === 0) return baseRate;
    let sum = 0, count = 0;
    const start = new Date(draft.checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = `${room.id}|${d.toISOString().slice(0, 10)}`;
      const r = calendar[k]?.rate ?? baseRate;
      sum += r; count += 1;
    }
    return count ? sum / count : baseRate;
  }, [room, nights, draft.checkIn, draft.roomId, calendar, baseRate]);

  const subtotal = Math.round(avgRate * nights);
  const memberDiscount = source === "member" && client?.tier === "platinum" ? Math.round(subtotal * 0.15)
                      : source === "member" && client?.tier === "gold"     ? Math.round(subtotal * 0.10)
                      : source === "member" && client?.tier === "silver"   ? Math.round(subtotal * 0.05)
                      : 0;
  const pointsDiscount = source === "member" && client
    ? Math.min(subtotal - memberDiscount, Math.floor(Number(draft.redeemPoints || 0) / loyalty.redeemBhdPerPoints))
    : 0;
  const agentCommission = source === "agent" && client ? Math.round(subtotal * (client.commissionPct / 100)) : 0;
  // Pre-payment Pay-now discount — mirrors the partner/B2C 5% saving on
  // the room subtotal. Only applies when the contract is pre-payment AND
  // the admin chose Pay-now.
  const payNowDiscount = (isPrepay && paymentTiming === "now")
    ? Math.round(subtotal * (PAY_NOW_DISCOUNT_PCT / 100))
    : 0;
  const total = Math.max(0, subtotal - memberDiscount - pointsDiscount - payNowDiscount);

  // What name/email lands on the booking record.
  const finalGuest = source === "direct" ? guestName : (client?.name || client?.account || "");
  const finalEmail = source === "direct" ? guestEmail : (client?.email || client?.contact || "");

  const valid = (
    nights > 0 && room &&
    (source === "direct" ? guestName.trim() && guestEmail.includes("@") : !!client) &&
    Number(draft.redeemPoints || 0) <= (client?.points || 0) &&
    !cardMissing
  );

  const submit = () => {
    if (!valid) {
      if (cardMissing) {
        pushToast({ message: "Card details required for Pay-now bookings.", kind: "warn" });
      }
      return;
    }
    const id = `LS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // Card on file — captured only for pre-payment Pay-now bookings, the
    // raw PAN is masked by buildCardOnFile before persistence and
    // auto-purges after the configured retention window.
    const cardOnFile = needsCard
      ? buildCardOnFile({ name: cardName, number: cardNum, exp: cardExp })
      : null;
    const guaranteed = cardOnFile != null;
    // Payment status mapping mirrors the partner-portal BookStayTab
    // contract — pre-payment Pay-now sits at "pending" until the admin
    // records the transaction ID via the Card-on-file panel; corporate
    // Net-X bills as "invoiced"; everything else as "pending".
    const paymentStatus = isPrepay
      ? "pending"
      : (source === "corporate" ? "invoiced" : "pending");
    const isAvailable = roomTypeAvailable(draft.roomId, draft.checkIn, draft.checkOut, 1, {
      rooms, bookings, roomUnits,
    });
    const initialStatus = isAvailable ? "confirmed" : "on-request";
    const initialStatusRemark = isAvailable
      ? "Auto-confirmed at booking — inventory available."
      : "Auto-routed to On request — suite sold out for the requested window. Front desk to confirm or reject.";
    addBooking({
      id,
      guest: finalGuest,
      email: finalEmail,
      source,
      roomId: draft.roomId,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      nights,
      guests: Number(draft.guests),
      rate: Math.round(avgRate),
      total,
      paid: 0,
      status: initialStatus,
      statusLog: [{
        ts: new Date().toISOString(),
        actorId:   staffSession?.id   || "anon",
        actorName: staffSession?.name || "Staff",
        actorRole: staffSession?.role || null,
        from: null,
        to: initialStatus,
        remark: initialStatusRemark,
      }],
      paymentStatus,
      paymentTiming: isPrepay ? paymentTiming : "later",
      nonRefundable: isPrepay && paymentTiming === "now",
      payNowDiscountPct: (isPrepay && paymentTiming === "now") ? PAY_NOW_DISCOUNT_PCT : 0,
      payNowDiscount,
      cardOnFile,
      guaranteed,
      guaranteeMode: guaranteed ? "card" : "none",
    });
    if (source === "member" && client) {
      const tier = tiers.find((t) => t.id === client.tier);
      const earnRate = tier?.earnRate || 1;
      const pointsEarned = Math.round(total * earnRate);
      updateMember(client.id, {
        points: Math.max(0, client.points - Number(draft.redeemPoints || 0) + pointsEarned),
        lifetimeNights: client.lifetimeNights + nights,
      });
    }
    pushToast({ message: `Booking ${id} created${source === "direct" ? "" : " · confirmation queued"}` });
    onClose();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="New booking"
      title="Create reservation"
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} small><Save size={12} /> Create booking</PrimaryBtn>
        </>
      }
    >
      <Card title="Source">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SOURCE_OPTIONS.map((o) => {
            const Ic = o.icon;
            const active = source === o.id;
            return (
              <button
                key={o.id}
                onClick={() => { setSource(o.id); setClient(null); }}
                className="text-start p-4 transition-all"
                style={{
                  backgroundColor: active ? p.bgHover : "transparent",
                  border: `1px solid ${active ? p.accent : p.border}`,
                }}
              >
                <Ic size={18} style={{ color: active ? p.accent : p.textMuted }} />
                <div className="mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textPrimary, fontWeight: 600 }}>{o.label}</div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 2, lineHeight: 1.4 }}>{o.note}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Client picker — search-driven for member/corporate/agent */}
      <Card title="Client" className="mt-6">
        {source === "direct" ? (
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="Guest name"><TextField value={guestName} onChange={setGuestName} /></FormGroup>
            <FormGroup label="Email"><TextField type="email" value={guestEmail} onChange={setGuestEmail} /></FormGroup>
          </div>
        ) : (
          <ClientPicker
            source={source}
            members={members}
            agreements={agreements}
            agencies={agencies}
            selected={client}
            onSelect={setClient}
          />
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <Card title="Reservation">
            <div className="space-y-4">
              <FormGroup label="Suite">
                <SelectField
                  value={draft.roomId}
                  onChange={(v) => setDraft({ ...draft, roomId: v })}
                  options={rooms.map((r) => {
                    // Treat the declared headcount as adults — admin
                    // creator doesn't split adults/children separately.
                    const fit = roomFitsParty(r, Number(draft.guests) || 0, 0);
                    const baseLabel = `${roomLabel(r, t)} · ${t("common.bhd")} ${r.price}/night base`;
                    return {
                      value: r.id,
                      label: fit.ok ? baseLabel : `${baseLabel} — ${fit.reason}`,
                      disabled: !fit.ok,
                    };
                  })}
                />
                {(() => {
                  const r = rooms.find((x) => x.id === draft.roomId);
                  const fit = r ? roomFitsParty(r, Number(draft.guests) || 0, 0) : { ok: true };
                  if (fit.ok) return null;
                  return (
                    <div style={{
                      marginTop: 6,
                      color: p.warn, fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.74rem", lineHeight: 1.5,
                    }}>
                      {fit.reason} — pick a larger suite or reduce the guest count.
                    </div>
                  );
                })()}
              </FormGroup>
              <div className="grid grid-cols-2 gap-4">
                <FormGroup label="Check-in"><TextField type="date" value={draft.checkIn} onChange={(v) => setDraft({ ...draft, checkIn: v })} /></FormGroup>
                <FormGroup label="Check-out"><TextField type="date" value={draft.checkOut} onChange={(v) => setDraft({ ...draft, checkOut: v })} /></FormGroup>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormGroup label="Guests"><TextField type="number" value={draft.guests} onChange={(v) => setDraft({ ...draft, guests: v })} /></FormGroup>
                {source === "member" && client && (
                  <FormGroup label={`Redeem points (max ${client.points.toLocaleString()})`}>
                    <TextField type="number" value={draft.redeemPoints} onChange={(v) => setDraft({ ...draft, redeemPoints: v })} suffix="pts" />
                  </FormGroup>
                )}
              </div>
              <FormGroup label="Notes (internal)"><TextField value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="High floor, late arrival, special occasion…" /></FormGroup>
            </div>
          </Card>

          {/* Pre-payment branch — shown only when the selected corporate /
              agency contract is on "Pre-payment (cash)" terms. Mirrors the
              partner-portal BookStayTab / CorporateBookingDrawer flow:
              Pay-now (with card capture) or Pay-on-arrival cash. Card
              capture is required for Pay-now to guarantee the booking. */}
          {isPrepay && (
            <Card title="Payment" className="mt-6">
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentTiming("later")}
                  className="text-start p-4 transition-all"
                  style={{
                    backgroundColor: paymentTiming === "later" ? p.bgHover : "transparent",
                    border: `1px solid ${paymentTiming === "later" ? p.accent : p.border}`,
                  }}
                >
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textPrimary, fontWeight: 600 }}>Pay on arrival</div>
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 4, lineHeight: 1.4 }}>
                    Settled in cash at check-in. Booking held against the contract until then.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentTiming("now")}
                  className="text-start p-4 transition-all"
                  style={{
                    backgroundColor: paymentTiming === "now" ? p.bgHover : "transparent",
                    border: `1px solid ${paymentTiming === "now" ? p.accent : p.border}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textPrimary, fontWeight: 600 }}>Pay now</span>
                    <span style={{
                      color: p.accent, fontSize: "0.58rem", letterSpacing: "0.22em",
                      textTransform: "uppercase", fontWeight: 700,
                      border: `1px solid ${p.accent}`, padding: "2px 6px",
                    }}>Save {PAY_NOW_DISCOUNT_PCT}%</span>
                  </div>
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 4, lineHeight: 1.4 }}>
                    Card charged immediately. Non-refundable.
                  </div>
                </button>
              </div>
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
                      Non-refundable rate · Save {PAY_NOW_DISCOUNT_PCT}%
                    </div>
                    Capture a card to guarantee the room. The booking sits at
                    Pending until the transaction ID is recorded on the
                    Card-on-file panel.
                  </div>
                  {/* Card capture — raw PAN never persists; buildCardOnFile
                      masks before write. */}
                  <div className="mt-3 grid gap-3">
                    <FormGroup label="Name on card">
                      <TextField value={cardName} onChange={setCardName} />
                    </FormGroup>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-3">
                        <FormGroup label="Card number">
                          <TextField value={cardNum} onChange={setCardNum} placeholder="•••• •••• •••• ••••" />
                        </FormGroup>
                      </div>
                      <FormGroup label="Exp"><TextField value={cardExp} onChange={setCardExp} placeholder="MM/YY" /></FormGroup>
                      <FormGroup label="CVC"><TextField value={cardCvc} onChange={setCardCvc} placeholder="•••" /></FormGroup>
                    </div>
                    {cardMissing && (
                      <div style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5 }}>
                        Card details required for Pay-now bookings.
                      </div>
                    )}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-4 self-start">
          <Card title="Summary" padded={false}>
            <div className="p-5 space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
              <SummaryRow label="Source" value={SOURCE_LABEL[source] || source} />
              <SummaryRow label="Client" value={finalGuest || "—"} muted />
              <SummaryRow label={`Suite × ${nights} ${nights === 1 ? "night" : "nights"}`} value={formatCurrency(subtotal)} />
              <SummaryRow label="Avg rate" value={`${t("common.bhd")} ${Math.round(avgRate)}`} muted />
              {memberDiscount  > 0 && <SummaryRow label="Member tier discount" value={`− ${formatCurrency(memberDiscount)}`} accent />}
              {pointsDiscount  > 0 && <SummaryRow label="Points redemption" value={`− ${formatCurrency(pointsDiscount)}`} accent />}
              {payNowDiscount  > 0 && <SummaryRow label={`Pay-now · ${PAY_NOW_DISCOUNT_PCT}% off`} value={`− ${formatCurrency(payNowDiscount)}`} accent />}
              <div className="pt-3 mt-3 flex justify-between items-baseline" style={{ borderTop: `1px solid ${p.border}` }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.textPrimary }}>Guest total</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 700 }}>{formatCurrency(total)}</span>
              </div>
              {agentCommission > 0 && (
                <div className="flex justify-between mt-3 pt-3" style={{ color: p.warn, fontSize: "0.78rem", borderTop: `1px solid ${p.border}` }}>
                  <span>Commission to agency ({client?.commissionPct}%)</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>− {formatCurrency(agentCommission)}</span>
                </div>
              )}
            </div>
          </Card>

          {!valid && source === "direct" && (
            <p className="mt-3" style={{ color: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem" }}>
              Add the guest's name and a valid email.
            </p>
          )}
          {!valid && source !== "direct" && !client && (
            <p className="mt-3" style={{ color: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem" }}>
              Pick a {(SOURCE_LABEL[source] || source).toLowerCase()} above to continue.
            </p>
          )}
          {cardMissing && (
            <p className="mt-3" style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem" }}>
              Card details required for Pay-now bookings.
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// Searchable client picker — filters live from the data store.
function ClientPicker({ source, members, agreements, agencies, selected, onSelect }) {
  const p = usePalette();
  const t = useT();
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (source === "member") {
      const items = members.map(m => ({
        kind: "member", id: m.id, name: m.name, sub: `${m.email} · ${m.id}`,
        meta: t(`rewards.tiers.${m.tier}.name`),
        raw: m,
      }));
      return ql ? items.filter(i => i.name.toLowerCase().includes(ql) || i.sub.toLowerCase().includes(ql)) : items;
    }
    if (source === "corporate") {
      const items = agreements.map(a => {
        const d = a.dailyRates || {};
        return {
          kind: "corporate", id: a.id, name: a.account, sub: `${a.id} · ${a.startsOn} → ${a.endsOn}`,
          meta: `${d.studio || 0}/${d.oneBed || 0}/${d.twoBed || 0}/${d.threeBed || 0} BHD`,
          raw: a,
        };
      });
      return ql ? items.filter(i => i.name.toLowerCase().includes(ql) || i.id.toLowerCase().includes(ql)) : items;
    }
    if (source === "agent") {
      const items = agencies.map(a => ({
        kind: "agent", id: a.id, name: a.name, sub: `${a.id} · ${a.contact}`,
        meta: `${a.commissionPct}% comm.`,
        raw: a,
      }));
      return ql ? items.filter(i => i.name.toLowerCase().includes(ql) || i.id.toLowerCase().includes(ql)) : items;
    }
    return [];
  }, [source, q, members, agreements, agencies, t]);

  return (
    <div>
      <div className="flex items-center mb-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
        <Search size={14} style={{ color: p.textMuted, marginInlineStart: 10 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            source === "member" ? "Search member by name, email, or LS-…-…" :
            source === "corporate" ? "Search corporate account…" :
            "Search travel agency…"
          }
          className="flex-1 outline-none"
          style={{ padding: "0.65rem 0.75rem", color: p.textPrimary, backgroundColor: "transparent", fontSize: "0.86rem", border: "none", minWidth: 0 }}
        />
      </div>

      <div className="max-h-[260px] overflow-y-auto" style={{ border: `1px solid ${p.border}` }}>
        {list.length === 0 && (
          <div className="px-4 py-6 text-center" style={{ color: p.textMuted, fontSize: "0.85rem" }}>
            No matches.
          </div>
        )}
        {list.map((row) => {
          const active = selected?.id === row.raw.id;
          return (
            <button key={row.id} onClick={() => onSelect(row.raw)}
              className="w-full text-start px-4 py-3 flex items-center justify-between gap-3"
              style={{
                backgroundColor: active ? p.bgHover : "transparent",
                borderTop: `1px solid ${p.border}`,
                borderInlineStart: active ? `3px solid ${p.accent}` : "3px solid transparent",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = p.bgPanelAlt; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <div className="min-w-0">
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary }}>{row.name}</div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 1 }}>{row.sub}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em" }}>{row.meta}</span>
                {active && <Check size={14} style={{ color: p.accent }} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, muted, accent }) {
  const p = usePalette();
  return (
    <div className="flex justify-between">
      <span style={{ color: p.textMuted }}>{label}</span>
      <span style={{ color: accent ? p.accent : muted ? p.textMuted : p.textPrimary, fontWeight: accent ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookingEditor — full-page two-column editor for an existing reservation.
//
// Left  — comprehensive form (Guest · Stay · Pricing · Status & payment · Notes
//         · Extras) with live-derived nights, subtotal, and balance.
// Right — sticky sidebar with: snapshot chips, document actions (preview /
//         print / email confirmation, invoice, receipt) and lifecycle actions
//         (mark paid, check-in / out, generate invoice, cancel). Saving is
//         done via the standard footer Save button.
// ---------------------------------------------------------------------------
function BookingEditor({ booking, onClose }) {
  const t = useT();
  const p = usePalette();
  const data = useData();
  const { rooms, agreements, agencies, members, invoices, payments, packages, tax, taxPatterns, activePatternId, extras, hotelInfo, staffSession, updateBooking, removeBooking, addInvoice, addPayment, appendAuditLog, giftCards, redeemGiftCard, releaseGiftCardForBooking } = data;
  const [draft, setDraft] = useState(booking);
  const [docPreview, setDocPreview] = useState(null); // "confirmation" | "invoice" | "receipt" | null
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  // The pill picker shouldn't let operators bypass the workflow. We open
  // the same StatusChangeDialog the row-action menu uses so every change
  // carries a remark + audit-trail entry. The editor also commits the
  // change immediately to the live record (not just the draft) so the
  // history line is preserved even if the operator hits Cancel afterwards.
  const allowedEditorNext = ALLOWED_TRANSITIONS[draft.status] || [];
  const applyEditorStatusChange = (next, remark) => {
    const trimmed = String(remark || "").trim();
    if (!trimmed) return false;
    const ts = new Date().toISOString();
    const entry = {
      ts,
      actorId:   staffSession?.id   || "anon",
      actorName: staffSession?.name || "Staff",
      actorRole: staffSession?.role || null,
      from: draft.status,
      to:   next,
      remark: trimmed,
    };
    const nextLog = Array.isArray(draft.statusLog) ? [...draft.statusLog, entry] : [entry];
    updateBooking(booking.id, { status: next, statusLog: nextLog });
    setDraft((d) => ({ ...d, status: next, statusLog: nextLog }));
    // Release held gift-card nights when the booking exits the active set.
    if (["cancelled", "rejected", "sold-out"].includes(next) && draft.redeemingGiftCardId) {
      try { releaseGiftCardForBooking(booking.id); } catch (_) {}
    }
    try {
      appendAuditLog?.({
        kind: "booking-status-change",
        actorId:   entry.actorId,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        targetKind: "booking",
        targetId:   booking.id,
        targetName: booking.guest || null,
        details: `Status ${STATUS_LABEL[entry.from] || entry.from} → ${STATUS_LABEL[entry.to] || entry.to} · ${trimmed}`
          + (["cancelled", "rejected", "sold-out"].includes(next) && draft.redeemingGiftCardId
              ? ` · released ${draft.giftCardNightsRequested || 0} night(s) back to ${draft.redeemingGiftCardCode}`
              : ""),
      });
    } catch (_) {}
    pushToast({
      message: `${booking.id}: ${STATUS_LABEL[next] || next}`,
      kind: next === "cancelled" || next === "rejected" || next === "sold-out" ? "warn" : "success",
    });
    setPendingStatus(null);
    return true;
  };
  // Operator must hold `bookings_delete` to see / use the destructive
  // "Delete booking permanently" action below the Lifecycle card.
  const canDeleteBooking = Array.isArray(staffSession?.permissions)
    && staffSession.permissions.includes("bookings_delete");

  // Resolve the offer record (when this booking was placed against one)
  // so the sidebar can render its conditions, savings and per-room price.
  const bookingPkg = booking.offerId ? (packages || []).find((x) => x.id === booking.offerId) : null;
  // Live transactions on this booking — drives the inline ledger in the
  // sidebar and the "received" badge on the Record-payment header.
  const bookingPayments = useMemo(
    () => (payments || []).filter((py) => py.bookingId === booking.id),
    [payments, booking.id]
  );

  const nights      = nightsBetween(draft.checkIn, draft.checkOut);
  const subtotal    = (Number(draft.rate)  || 0) * (nights || 0);
  const extrasList  = Array.isArray(draft.extras) ? draft.extras : [];
  const extrasTotal = extrasList.reduce((s, e) => s + (Number(e.price) || 0), 0);
  // Live tax calculation — runs the configured tax pattern (Settings →
  // Tax Setup) against the room subtotal + extras. The result drives the
  // "Tax (BHD)" row, the live total, and the breakdown shown on Save so
  // booking.taxLines / taxAmount on the record stay in sync with edits.
  const liveTaxBase = +(subtotal + extrasTotal).toFixed(3);
  const liveTaxResult = applyTaxes(liveTaxBase, tax, Math.max(1, nights || 1));
  const liveTaxAmount = liveTaxResult.totalTax;
  const liveTaxLines  = liveTaxResult.lines;
  const liveTotal     = liveTaxResult.gross;
  const grandTotal  = Number(draft.total) || 0;
  const paid        = Number(draft.paid)  || 0;
  const balance     = Math.max(0, +(grandTotal - paid).toFixed(3));
  // When the stored breakdown is missing (older bookings), fall back to
  // the legacy "total − subtotal − extras" implied-tax estimate so the row
  // doesn't go blank on records taken before the unified engine landed.
  const storedTaxAmount = Number(draft.taxAmount);
  const storedTaxLines  = Array.isArray(draft.taxLines) ? draft.taxLines : null;
  const hasStoredBreakdown = Number.isFinite(storedTaxAmount) || (storedTaxLines && storedTaxLines.length > 0);
  const taxAmount   = hasStoredBreakdown
    ? Math.max(0, +(storedTaxAmount || 0).toFixed(3))
    : Math.max(0, +(grandTotal - subtotal - extrasTotal).toFixed(3));

  const dirty = JSON.stringify(draft) !== JSON.stringify(booking);
  const hasInvoice  = invoices.some((i) => i.bookingId === booking.id);
  const hasPayment  = (booking.paid || 0) > 0;

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Recalc — runs the tax engine against the current rate / extras, then
  // updates total, taxAmount, taxLines and the pattern stamp on the draft
  // so subsequent saves persist the new breakdown.
  const recalcTotal = () => {
    const activePattern = (taxPatterns || []).find((p) => p.id === activePatternId);
    update({
      total: +liveTotal.toFixed(3),
      taxAmount: liveTaxAmount,
      taxBase: liveTaxBase,
      taxLines: liveTaxLines,
      taxPatternId: activePatternId || draft.taxPatternId || null,
      taxPatternName: activePattern?.name || draft.taxPatternName || null,
    });
    pushToast({ message: `Total recalculated · ${formatCurrency(liveTotal)} · tax ${formatCurrency(liveTaxAmount)}` });
  };

  const removeExtra = (idx) => {
    const next = extrasList.filter((_, i) => i !== idx);
    const nextExtrasTotal = next.reduce((s, e) => s + (Number(e.price) || 0), 0);
    const removed = (extrasList[idx]?.price) || 0;
    update({
      extras: next,
      // keep total in sync with the extras line removed
      total: +Math.max(0, grandTotal - removed).toFixed(3),
    });
    pushToast({ message: "Extra removed from booking" });
  };

  const save = () => {
    updateBooking(booking.id, {
      ...draft,
      nights: nightsBetween(draft.checkIn, draft.checkOut),
      total: Number(draft.total) || 0,
      paid:  Number(draft.paid)  || 0,
      rate:  Number(draft.rate)  || 0,
      guests: Number(draft.guests) || 0,
      // Persist whatever tax breakdown the draft carries (set by Recalc
      // or untouched from the original record). Numbers coerced so the
      // Reports aggregation doesn't trip on string-typed legacy values.
      taxAmount:  Number(draft.taxAmount)  || 0,
      taxBase:    Number(draft.taxBase)    || 0,
      taxLines:   Array.isArray(draft.taxLines) ? draft.taxLines : [],
      taxPatternId:   draft.taxPatternId   || null,
      taxPatternName: draft.taxPatternName || null,
    });
    pushToast({ message: `${booking.id} saved` });
    onClose();
  };

  const reset = () => setDraft(booking);

  // ---- Lifecycle / inline actions ----------------------------------------
  const markPaid   = () => { update({ paymentStatus: "paid", paid: grandTotal }); pushToast({ message: "Marked paid (unsaved)" }); };
  const checkIn    = () => { update({ status: "in-house" });   pushToast({ message: "Status set to in-house (unsaved)" }); };
  const checkOut   = () => { update({ status: "checked-out" }); pushToast({ message: "Status set to checked-out (unsaved)" }); };
  // Route the sidebar cancel through the same StatusChangeDialog the pill
  // picker uses — so it captures a remark, writes the audit entry, and
  // releases any held gift-card nights via applyEditorStatusChange. (The
  // old "unsaved draft" shortcut skipped all three.)
  const cancelBkg  = () => { setPendingStatus("cancelled"); };

  // Hard-delete from the DB. Gated by the `bookings_delete` permission and
  // a "type the booking reference to confirm" modal — this is the only
  // destructive action in the portal that bypasses the soft-cancel audit
  // trail, so it carries an explicit `booking-deleted` audit-log entry of
  // its own. Persistence layer (useSlicePersistence on `bookings`) syncs
  // the removal to Supabase on the next bulkReplace sweep.
  const deleteBookingPermanently = () => {
    if (!canDeleteBooking) return;
    try { removeBooking(booking.id); } catch (_) {}
    try {
      appendAuditLog?.({
        kind: "booking-deleted",
        actorId: staffSession?.id || "anon",
        actorName: staffSession?.name || "Staff",
        actorRole: staffSession?.role || null,
        targetKind: "booking",
        targetId: booking.id,
        targetName: booking.guest || null,
        details: "Permanently deleted from DB",
      });
    } catch (_) {}
    pushToast({ message: `Booking deleted · ${booking.id}`, kind: "warn" });
    setConfirmDelete(false);
    onClose();
  };

  const genInvoice = () => {
    const today = new Date().toISOString().slice(0, 10);
    const due   = booking.source === "guest" || booking.source === "direct" ? today
                : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    addInvoice({
      bookingId: booking.id,
      clientType: booking.source === "corporate" ? "corporate" : booking.source === "agent" ? "agent" : "guest",
      clientName: booking.guest,
      issued: today, due,
      amount: grandTotal, paid: 0, status: "issued",
      // Booking-AR — what the client owes the hotel for this stay.
      kind: "booking",
    });
    pushToast({ message: `Invoice generated for ${booking.id}` });
  };

  // The latest values get sent to docs — we want to preview WHAT WILL BE SAVED.
  const previewBooking = { ...booking, ...draft, nights };

  // ---- Source-dependent account picker -----------------------------------
  // When the source is corporate/agent we offer the matching account list as
  // a dropdown so operators can move a booking between contracts without
  // editing JSON directly. Member uses a friendly name + ID picker.
  const accountOptions = (() => {
    if (draft.source === "corporate") {
      return [{ value: "", label: "—" }].concat(agreements.map((a) => ({ value: a.id, label: `${a.account} · ${a.id}` })));
    }
    if (draft.source === "agent") {
      return [{ value: "", label: "—" }].concat(agencies.map((a) => ({ value: a.id, label: `${a.name} · ${a.id}` })));
    }
    if (draft.source === "member") {
      return [{ value: "", label: "—" }].concat(members.map((m) => ({ value: m.id, label: `${m.name} · ${m.tier} · ${m.id}` })));
    }
    return null;
  })();
  const accountFieldLabel  = draft.source === "corporate" ? "Linked corporate account"
                          : draft.source === "agent"      ? "Linked travel agency"
                          : draft.source === "member"     ? "Linked LS Privilege member"
                          : null;
  const accountFieldKey    = draft.source === "corporate" ? "accountId"
                          : draft.source === "agent"      ? "agencyId"
                          : draft.source === "member"     ? "memberId"
                          : null;
  const accountFieldValue  = accountFieldKey ? (draft[accountFieldKey] || "") : "";

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`${booking.id}${dirty ? " · Unsaved changes" : ""}`}
      title={`Edit · ${booking.guest}`}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          {dirty && (
            <GhostBtn onClick={reset} small>
              <RotateCcw size={11} /> Reset
            </GhostBtn>
          )}
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={12} /> Save changes</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* Form column ----------------------------------------------------- */}
        <div className="space-y-5">
          {/* Guest */}
          <Card title="Guest">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Guest name">
                <TextField value={draft.guest} onChange={(v) => update({ guest: v })} placeholder="Full name" />
              </FormGroup>
              <FormGroup label="Email">
                <TextField type="email" value={draft.email} onChange={(v) => update({ email: v })} placeholder="guest@example.com" />
              </FormGroup>
              <FormGroup label="Phone">
                <TextField value={draft.phone || ""} onChange={(v) => update({ phone: v })} placeholder="+973 ..." />
              </FormGroup>
              <FormGroup label="Source / channel">
                <SelectField
                  value={draft.source}
                  onChange={(v) => update({ source: v, accountId: undefined, agencyId: undefined, memberId: undefined })}
                  options={Object.entries(SOURCE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                />
              </FormGroup>
              {accountOptions && accountFieldLabel && (
                <FormGroup label={accountFieldLabel} className="sm:col-span-2">
                  <SelectField
                    value={accountFieldValue}
                    onChange={(v) => update({ [accountFieldKey]: v || undefined })}
                    options={accountOptions}
                  />
                </FormGroup>
              )}
              {(booking.bookedByName || booking.bookedByEmail) && (
                <div className="sm:col-span-2 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Booked by</div>
                  <div style={{ color: p.textPrimary, fontSize: "0.86rem", marginTop: 4 }}>
                    {booking.bookedByName}{booking.bookedByEmail ? ` · ${booking.bookedByEmail}` : ""}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Stay */}
          <Card title="Stay">
            <div className="space-y-4">
              <FormGroup label="Suite">
                <SelectField
                  value={draft.roomId}
                  onChange={(v) => update({ roomId: v })}
                  options={rooms.map((r) => {
                    const fit = roomFitsParty(r, Number(draft.guests) || 0, 0);
                    const base = roomLabel(r, t);
                    return {
                      value: r.id,
                      label: fit.ok ? base : `${base} — ${fit.reason}`,
                      disabled: !fit.ok,
                    };
                  })}
                />
                {(() => {
                  const r = rooms.find((x) => x.id === draft.roomId);
                  const fit = r ? roomFitsParty(r, Number(draft.guests) || 0, 0) : { ok: true };
                  if (fit.ok) return null;
                  return (
                    <div style={{
                      marginTop: 6, color: p.warn,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5,
                    }}>
                      {fit.reason} — pick a larger suite or reduce the guest count.
                    </div>
                  );
                })()}
              </FormGroup>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Check-in">
                  <TextField type="date" value={draft.checkIn} onChange={(v) => update({ checkIn: v })} />
                </FormGroup>
                <FormGroup label="Check-out">
                  <TextField type="date" value={draft.checkOut} onChange={(v) => update({ checkOut: v })} />
                </FormGroup>
                <FormGroup label="Nights">
                  <ReadOnlyField p={p} value={`${nights} ${nights === 1 ? "night" : "nights"}`} hint="Auto · derived from dates" />
                </FormGroup>
              </div>
              {/* Hotel confirmation number — the PMS-issued reference the
                  front desk gives guests (distinct from our internal
                  booking id). Surfaced in the WhatsApp confirmation and
                  under the status chip in the bookings list. */}
              <FormGroup label="Hotel confirmation no.">
                <TextField
                  value={draft.hotelConfirmationNo || ""}
                  onChange={(v) => update({ hotelConfirmationNo: v })}
                  placeholder="e.g. LDG-25-04123"
                />
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 6 }}>
                  PMS / channel-manager reference. Shown to the guest in WhatsApp confirmations and under the status chip in this list.
                </div>
              </FormGroup>
              <FormGroup label="Guests">
                <TextField type="number" value={draft.guests} onChange={(v) => update({ guests: Number(v) || 0 })} />
              </FormGroup>
              {/* Meal plan — flips the F&B inclusion on the folio. The
                  supplement that was charged at booking sits on
                  `mealPlanTotal`; changing the plan here doesn't
                  retroactively re-bill (use Recalc in Pricing for that).
                  Defaults to RO when the booking pre-dates the field. */}
              <FormGroup label="Meal plan">
                <SelectField
                  value={draft.mealPlan || "ro"}
                  onChange={(v) => update({ mealPlan: v, mealPlanLabel: mealPlanLabel(v) })}
                  options={MEAL_PLANS.map((m) => ({ value: m.code, label: `${m.short} · ${m.label}` }))}
                />
                {Number(draft.mealPlanTotal) > 0 && (
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 6 }}>
                    Supplement on folio: <strong style={{ color: p.accent }}>{formatCurrency(draft.mealPlanTotal)}</strong>
                  </div>
                )}
              </FormGroup>
            </div>
          </Card>

          {/* Gift-card redemption — reconciliation panel. Only shown when
              this booking draws on a gift card. Surfaces the card code +
              the nights/charges split so accounts can tie the booking to
              the card ledger and debit the right number of nights on
              approval. Read-only: the link is set at booking time. */}
          {draft.redeemingGiftCardCode && (
            <Card title="Gift-card redemption">
              <div className="p-4" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}55`, borderInlineStart: `3px solid ${p.accent}` }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      Redeemed against card
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.95rem", color: p.textPrimary, letterSpacing: "0.06em" }}>
                        {draft.redeemingGiftCardCode}
                      </code>
                      <button
                        onClick={() => { try { navigator.clipboard?.writeText(draft.redeemingGiftCardCode); pushToast({ message: "Gift-card code copied." }); } catch (_) {} }}
                        title="Copy code"
                        style={{ color: p.accent, padding: "2px 7px", border: `1px solid ${p.accent}`, backgroundColor: "transparent", fontFamily: "'Manrope', sans-serif", fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                      ><Copy size={10} /> Copy</button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px mt-4" style={{ backgroundColor: p.border }}>
                  <div className="p-3" style={{ backgroundColor: p.bgPanel }}>
                    <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Nights from card</div>
                    <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", fontWeight: 500, marginTop: 2 }}>
                      {Number(draft.giftCardNightsRequested) || draft.nights || 0}
                    </div>
                  </div>
                  <div className="p-3" style={{ backgroundColor: p.bgPanel }}>
                    <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Upgrade top-up</div>
                    <div style={{ color: Number(draft.giftCardUpgradeCost) > 0 ? p.textPrimary : p.textMuted, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", fontWeight: 500, marginTop: 2 }}>
                      {formatCurrency(Number(draft.giftCardUpgradeCost) || 0)}
                    </div>
                  </div>
                  <div className="p-3" style={{ backgroundColor: p.bgPanel }}>
                    <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Overflow (rack)</div>
                    <div style={{ color: Number(draft.giftCardOverflowCost) > 0 ? p.warn : p.textMuted, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", fontWeight: 500, marginTop: 2 }}>
                      {formatCurrency(Number(draft.giftCardOverflowCost) || 0)}
                    </div>
                  </div>
                </div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 10, lineHeight: 1.5 }}>
                  On approval, debit <strong style={{ color: p.textPrimary }}>{Number(draft.giftCardNightsRequested) || draft.nights || 0}</strong> night{(Number(draft.giftCardNightsRequested) || draft.nights) === 1 ? "" : "s"} from card <strong style={{ color: p.textPrimary }}>{draft.redeemingGiftCardCode}</strong> in the Gift Cards section. The top-up{Number(draft.giftCardOverflowCost) > 0 ? " + overflow" : ""} is collected separately.
                </div>
              </div>
            </Card>
          )}

          {/* Status & lifecycle — the current status is informational (not
              clickable); operators flip via the "Change to →" pills below,
              which open StatusChangeDialog so every transition lands with
              a required remark and an audit-trail entry. Terminal statuses
              (cancelled / rejected / sold-out / checked-out) hide the
              picker since no further moves are allowed. */}
          <Card title="Status & lifecycle">
            <FormGroup label="Reservation status">
              <div className="flex items-center gap-2 flex-wrap">
                <span style={chipStyle(STATUS_BASE[draft.status] || "#6B7280")}>
                  <span style={dotStyle(STATUS_BASE[draft.status] || "#6B7280")} />
                  {STATUS_LABEL[draft.status] || draft.status}
                </span>
                {draft.hotelConfirmationNo && (
                  <span style={{
                    color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.72rem", letterSpacing: "0.04em",
                  }}>· Hotel ref {draft.hotelConfirmationNo}</span>
                )}
              </div>
              {allowedEditorNext.length > 0 ? (
                <div className="mt-3">
                  <div style={{
                    color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.6rem", letterSpacing: "0.22em",
                    textTransform: "uppercase", fontWeight: 700, marginBottom: 6,
                  }}>Change to →</div>
                  <div className="flex flex-wrap gap-2">
                    {allowedEditorNext.map((nextS) => {
                      const c = STATUS_BASE[nextS] || "#6B7280";
                      return (
                        <button
                          key={nextS}
                          type="button"
                          onClick={() => setPendingStatus(nextS)}
                          style={{
                            ...chipStyle(c),
                            cursor: "pointer",
                            border: `1px solid ${c}`,
                            background: "transparent",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c + "1A"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <span style={dotStyle(c)} />
                          {STATUS_LABEL[nextS] || nextS}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p style={{
                  marginTop: 8,
                  color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.72rem", lineHeight: 1.55,
                }}>
                  Terminal state — no further transitions. Re-open from history if this was set in error.
                </p>
              )}
            </FormGroup>
            <div className="mt-4">
              <FormGroup label="Payment status">
                <ChipPicker
                  p={p}
                  value={draft.paymentStatus}
                  onChange={(v) => update({ paymentStatus: v })}
                  options={Object.entries(PAYMENT_LABEL).map(([k, l]) => ({ value: k, label: l, color: PAYMENT_BASE[k] }))}
                />
              </FormGroup>
            </div>
            {/* Status history — one row per transition, newest first. The
                audit trail also lands in audit_logs for global visibility. */}
            <div className="mt-5">
              <div style={{
                color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                fontSize: "0.6rem", letterSpacing: "0.22em",
                textTransform: "uppercase", fontWeight: 700, marginBottom: 8,
              }}>Status history</div>
              {Array.isArray(draft.statusLog) && draft.statusLog.length > 0 ? (
                <div className="space-y-2">
                  {[...draft.statusLog].reverse().map((e, i) => {
                    const fc = STATUS_BASE[e.from] || "#6B7280";
                    const tc = STATUS_BASE[e.to]   || "#6B7280";
                    return (
                      <div key={i} className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                          <span style={chipStyle(fc)}>
                            <span style={dotStyle(fc)} />
                            {STATUS_LABEL[e.from] || e.from || "—"}
                          </span>
                          <span style={{ color: p.textMuted, fontWeight: 700 }}>→</span>
                          <span style={chipStyle(tc)}>
                            <span style={dotStyle(tc)} />
                            {STATUS_LABEL[e.to] || e.to}
                          </span>
                          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginInlineStart: "auto" }}>
                            {fmtDate(e.ts)} · {e.actorName || "Staff"}{e.actorRole ? ` · ${e.actorRole}` : ""}
                          </span>
                        </div>
                        <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.5 }}>
                          {e.remark || <em style={{ color: p.textMuted }}>(no remark)</em>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.5 }}>
                  No status changes recorded yet. Future transitions will be logged here with the operator's remark.
                </p>
              )}
            </div>
          </Card>

          {/* Pricing */}
          <Card
            title="Pricing"
            action={
              <button
                onClick={recalcTotal}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  color: p.accent, border: `1px solid ${p.accent}`,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                  letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  padding: "0.35rem 0.7rem", backgroundColor: "transparent", cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = p.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                title="Set total to (rate × nights) + extras"
              >
                <Calculator size={11} /> Recalc
              </button>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Rate (BHD/night)">
                <TextField type="number" value={draft.rate} onChange={(v) => update({ rate: Number(v) || 0 })} suffix="BHD" />
              </FormGroup>
              {/* Rate breakdown — surfaced inline between the rate input
                  and the subtotal when the booking was placed with a
                  mixed-bucket stay. Legacy bookings without the breakdown
                  fields fall back to the "Subtotal" hint below. Spans
                  both columns so the line reads cleanly. */}
              {(Number(draft.weekdayNights) > 0 && Number(draft.weekendNights) > 0) && (
                <div className="sm:col-span-2 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                    Rate breakdown
                  </div>
                  <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55 }}>
                    {draft.weekdayNights} weekday × {formatCurrency(Number(draft.rateWeekday || 0))}
                    {" + "}
                    {draft.weekendNights} weekend × {formatCurrency(Number(draft.rateWeekend || 0))}
                  </div>
                </div>
              )}
              <FormGroup label="Subtotal (auto)">
                <ReadOnlyField p={p} value={formatCurrency(subtotal)} hint={`${draft.rate || 0} × ${nights} ${nights === 1 ? "night" : "nights"}`} />
              </FormGroup>
              <FormGroup label="Total (BHD)">
                <TextField type="number" value={draft.total} onChange={(v) => update({ total: Number(v) || 0 })} suffix="BHD" />
              </FormGroup>
              <FormGroup label="Paid (BHD)">
                <TextField type="number" value={draft.paid} onChange={(v) => update({ paid: Number(v) || 0 })} suffix="BHD" />
              </FormGroup>
              <FormGroup label="Balance (auto)">
                <ReadOnlyField p={p} value={formatCurrency(balance)} valueColor={balance > 0 ? p.warn : p.success} hint={balance > 0 ? "Outstanding" : "Settled"} />
              </FormGroup>
              {extrasTotal > 0 && (
                <FormGroup label="Extras subtotal">
                  <ReadOnlyField p={p} value={formatCurrency(extrasTotal)} hint={`${extrasList.length} item${extrasList.length === 1 ? "" : "s"}`} />
                </FormGroup>
              )}
              <FormGroup label="Tax (BHD)">
                <ReadOnlyField
                  p={p}
                  value={formatCurrency(taxAmount)}
                  hint={hasStoredBreakdown
                    ? (storedTaxLines && storedTaxLines.length > 0
                        ? `${storedTaxLines.length} component${storedTaxLines.length === 1 ? "" : "s"} · ${draft.taxPatternName || "stored"}`
                        : "Stored on record")
                    : "Implied · total − subtotal − extras"}
                />
              </FormGroup>
              <FormGroup label="Live tax (Recalc)">
                <ReadOnlyField
                  p={p}
                  value={formatCurrency(liveTaxAmount)}
                  hint={liveTaxLines.length > 0
                    ? liveTaxLines.map((l) => {
                        const r = l.type === "percentage"
                          ? `${l.rate}%${l.calculation === "compound" ? " comp" : ""}`
                          : `BHD ${l.amount}/n`;
                        return `${l.name} ${r}`;
                      }).join(" · ")
                    : "No tax components configured"}
                />
              </FormGroup>
            </div>

            {/* Stored tax breakdown — one row per component so operators
                can see what the booking was originally taxed on. Hidden
                when the record predates the unified engine (no taxLines). */}
            {storedTaxLines && storedTaxLines.length > 0 && (
              <div className="mt-4 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, marginBottom: 6 }}>
                  Tax breakdown {draft.taxPatternName ? `· ${draft.taxPatternName}` : ""}
                </div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                  {storedTaxLines.map((line, i) => {
                    const rateLabel = line.type === "percentage"
                      ? `${line.rate}%${line.calculation === "compound" ? " · compound" : ""}`
                      : `BHD ${line.amount}/night`;
                    return (
                      <div key={line.id || i} className="flex items-center justify-between py-1" style={{ color: p.textSecondary }}>
                        <span>{line.name} <span style={{ color: p.textMuted, fontSize: "0.7rem" }}>· {rateLabel}</span></span>
                        <span style={{ color: p.textPrimary, fontWeight: 600 }}>{formatCurrency(Number(line.taxAmount || 0))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {draft.source === "agent" && (
              <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormGroup label="Commission %">
                    <TextField type="number" value={draft.commPct ?? ""} onChange={(v) => update({ commPct: Number(v) || 0 })} suffix="%" />
                  </FormGroup>
                  <FormGroup label="Commission earned (BHD)">
                    <TextField type="number" value={draft.comm ?? ""} onChange={(v) => update({ comm: Number(v) || 0 })} suffix="BHD" />
                  </FormGroup>
                </div>
                {draft.commissionDeducted && (
                  <div className="mt-3 p-3 flex items-start gap-2" style={{
                    backgroundColor: `${p.success}10`,
                    border: `1px solid ${p.success}40`,
                    borderInlineStart: `3px solid ${p.success}`,
                  }}>
                    <div style={{ marginTop: 2, color: p.success, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif" }}>
                      Paid at booking
                    </div>
                    <div style={{ color: p.textSecondary, fontSize: "0.84rem", lineHeight: 1.55, fontFamily: "'Manrope', sans-serif" }}>
                      Commission · deducted at booking · <strong style={{ color: p.textPrimary }}>{formatCurrency(Number(draft.commissionDeductedAmount ?? draft.comm ?? 0))}</strong>. An auto-paid commission invoice was issued at confirmation; this booking is excluded from commission-invoice bundling.
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Extras (display + remove) */}
          {extrasList.length > 0 && (
            <Card title={`Extras · ${extrasList.length}`} padded={false}>
              <div className="overflow-x-auto">
                <TableShell>
                  <thead>
                    <tr>
                      <Th>Extra</Th>
                      <Th align="end">Price (BHD)</Th>
                      <Th align="end" />
                    </tr>
                  </thead>
                  <tbody>
                    {extrasList.map((e, i) => (
                      <tr key={`${e.id || e.title}-${i}`}>
                        <Td>{e.title}</Td>
                        <Td align="end" className="font-semibold">{(Number(e.price) || 0).toLocaleString()}</Td>
                        <Td align="end">
                          <button onClick={() => removeExtra(i)} className="inline-flex items-center gap-1.5"
                            style={{ color: p.danger, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "0.25rem 0.55rem", border: `1px solid ${p.danger}`, backgroundColor: "transparent", cursor: "pointer" }}>
                            <Trash2 size={11} /> Remove
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </div>
            </Card>
          )}

          {/* Internal notes / requests */}
          <Card title="Special requests & notes">
            <FormGroup label="Notes (visible on confirmation)">
              <TextAreaField p={p} value={draft.notes || ""} onChange={(v) => update({ notes: v })} placeholder="Late arrival, dietary, transfer, etc." rows={4} />
            </FormGroup>
            <FormGroup label="Internal note (operator-only)" className="mt-4">
              <TextAreaField p={p} value={draft.internalNote || ""} onChange={(v) => update({ internalNote: v })} placeholder="Visible only inside the admin panel." rows={3} />
            </FormGroup>
          </Card>
        </div>

        {/* Sidebar column -------------------------------------------------- */}
        <div>
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Snapshot */}
            <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, borderInlineStart: `4px solid ${STATUS_BASE[draft.status] || p.accent}` }}>
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
                <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
                  Snapshot
                </div>
                <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.4rem", lineHeight: 1.1, marginTop: 2 }}>
                  {booking.id}
                </div>
              </div>
              <div className="px-4 py-3 space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                <SnapRow p={p} label="Status">
                  <span style={statusChip(draft.status)}>
                    <span style={statusDot(draft.status)} />
                    {STATUS_LABEL[draft.status] || draft.status}
                  </span>
                </SnapRow>
                <SnapRow p={p} label="Payment">
                  <span style={paymentChip(draft.paymentStatus)}>
                    <span style={paymentDot(draft.paymentStatus)} />
                    {PAYMENT_LABEL[draft.paymentStatus] || draft.paymentStatus}
                  </span>
                </SnapRow>
                <SnapRow p={p} label="Stay" value={`${nights} ${nights === 1 ? "night" : "nights"} · ${draft.guests || 0} ${draft.guests === 1 ? "guest" : "guests"}`} />
                <SnapRow p={p} label="Total" value={formatCurrency(grandTotal)} accent />
                {draft.taxPatternName && (
                  <div className="flex justify-between" style={{ fontSize: "0.66rem", color: p.textMuted, fontFamily: "'Manrope', sans-serif", letterSpacing: "0.02em" }}>
                    <span style={{ color: p.textMuted }}>Tax pattern</span>
                    <span style={{ color: p.textSecondary }}>{draft.taxPatternName}</span>
                  </div>
                )}
                <SnapRow p={p} label="Paid"  value={formatCurrency(paid)} success={paid > 0} />
                <SnapRow p={p} label="Balance" value={formatCurrency(balance)} warn={balance > 0} success={balance === 0 && paid > 0} />
              </div>
            </div>

            {/* Documents */}
            <SidebarCard title="Documents" p={p}>
              <SidebarHeading p={p} icon={<Sparkles size={11} />}>Reservation confirmation</SidebarHeading>
              <SidebarBtn p={p} icon={<FileText size={12} />} label="Preview"  onClick={() => setDocPreview("confirmation")} />
              <SidebarBtn p={p} icon={<Printer  size={12} />} label="Print"    onClick={() => printBookingDoc(previewBooking, "confirmation", { tax, rooms, hotel: hotelInfo })} />
              <SidebarBtn p={p} icon={<Mail     size={12} />} label="Email to guest" onClick={() => emailBookingDoc(previewBooking, "confirmation", hotelInfo)} />

              <SidebarHeading p={p} icon={<FileText size={11} />} className="mt-3">Invoice</SidebarHeading>
              <SidebarBtn p={p} icon={<FileText size={12} />} label="Preview"        onClick={() => setDocPreview("invoice")} />
              <SidebarBtn p={p} icon={<Printer  size={12} />} label="Print"          onClick={() => printBookingDoc(previewBooking, "invoice", { tax, rooms, hotel: hotelInfo })} />
              <SidebarBtn p={p} icon={<Mail     size={12} />} label="Email to guest" onClick={() => emailBookingDoc(previewBooking, "invoice", hotelInfo)} />

              <SidebarHeading p={p} icon={<Receipt size={11} />} className="mt-3">Receipt</SidebarHeading>
              <SidebarBtn p={p} icon={<Receipt size={12} />} label="Preview" onClick={() => setDocPreview("receipt")} disabled={!hasPayment} />
              <SidebarBtn p={p} icon={<Mail    size={12} />} label="Email to guest" onClick={() => emailBookingDoc(previewBooking, "receipt", hotelInfo)} disabled={!hasPayment} />
            </SidebarCard>

            {/* Lifecycle */}
            <SidebarCard title="Lifecycle" p={p}>
              {paid < grandTotal && (
                <SidebarBtn p={p} icon={<CheckCircle2 size={12} />} label="Mark as paid" onClick={markPaid} />
              )}
              {draft.status === "confirmed" && (
                <SidebarBtn p={p} icon={<LogIn size={12} />} label="Check guest in" onClick={checkIn} />
              )}
              {draft.status === "in-house" && (
                <SidebarBtn p={p} icon={<LogOut size={12} />} label="Check guest out" onClick={checkOut} />
              )}
              {!hasInvoice && (
                <SidebarBtn p={p} icon={<FileText size={12} />} label="Generate invoice" onClick={genInvoice} />
              )}
              {draft.status !== "cancelled" && (
                <SidebarBtn p={p} icon={<Ban size={12} />} label="Cancel booking" onClick={cancelBkg} danger />
              )}
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 8, lineHeight: 1.5, fontFamily: "'Manrope', sans-serif" }}>
                Lifecycle actions update the draft. Press <strong>Save changes</strong> below to commit.
              </div>
            </SidebarCard>

            {/* Offer applied — visible only when this booking was made
                against an LS Privilege package. Surfaces title, savings,
                pricing rule and per-room price so the operator never has
                to dig into the offers admin to understand a folio. */}
            {(booking.offerId || booking.offerTitle) && (
              <OfferAppliedCard
                p={p}
                booking={booking}
                pkg={bookingPkg}
                t={t}
              />
            )}

            {/* Record payment — opens an inline form for collecting CC /
                Benefit Pay / Bank transfer / Cash, writes a transaction
                row, updates the booking's paid + status, and surfaces the
                receipt actions immediately. */}
            <RecordPaymentPanel
              p={p}
              booking={booking}
              draft={draft}
              update={update}
              balance={balance}
              transactions={bookingPayments}
              addPayment={addPayment}
              updateBooking={updateBooking}
              appendAuditLog={appendAuditLog}
              staffSession={staffSession}
              giftCards={giftCards}
              redeemGiftCard={redeemGiftCard}
              onPreviewReceipt={() => setDocPreview("receipt")}
              onEmailReceipt={() => emailBookingDoc(previewBooking, "receipt", hotelInfo)}
              expanded={recordingPayment}
              setExpanded={setRecordingPayment}
              t={t}
            />

            {/* Card on file — gated to authorised managers. Always renders
                so unauthorised staff see the "no permission" hint and know
                to escalate; managers see the masked card + reveal button. */}
            <CardVaultPanel
              p={p}
              booking={booking}
              draft={draft}
              update={update}
              staffSession={staffSession}
              appendAuditLog={appendAuditLog}
              updateBooking={updateBooking}
              addPayment={addPayment}
            />

            {/* Guarantee documents — passport copy, card copy, signed
                pre-authorisation. Manager-gated like the card vault. */}
            <GuaranteeDocsPanel
              p={p}
              booking={booking}
              draft={draft}
              update={update}
              staffSession={staffSession}
              appendAuditLog={appendAuditLog}
              updateBooking={updateBooking}
              rooms={rooms}
              hotelInfo={hotelInfo}
            />

            {/* Quick contact */}
            <SidebarCard title="Reach the guest" p={p}>
              {draft.email && (
                <SidebarBtn p={p} icon={<Mail size={12} />} label={draft.email} onClick={() => { window.location.href = `mailto:${draft.email}?subject=${encodeURIComponent(`Booking ${booking.id}`)}`; }} />
              )}
              {draft.phone && (
                <SidebarBtn p={p} icon={<Phone size={12} />} label={draft.phone} onClick={() => { window.location.href = `tel:${draft.phone}`; }} />
              )}
              {!draft.email && !draft.phone && (
                <div style={{ color: p.textMuted, fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif" }}>
                  No contact details on file. Add an email or phone above.
                </div>
              )}
            </SidebarCard>

            {/* Danger zone — only rendered for operators that explicitly hold
                the `bookings_delete` permission. Hard-deletes the booking
                from the store; the soft-cancel "Cancel booking" action in
                the Lifecycle card above preserves the audit trail and is
                what most operators should be using. */}
            {canDeleteBooking && (
              <SidebarCard title="Danger zone" p={p}>
                <SidebarBtn
                  p={p}
                  icon={<Trash2 size={12} />}
                  label="Delete booking permanently"
                  onClick={() => setConfirmDelete(true)}
                  danger
                />
                <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 8, lineHeight: 1.5, fontFamily: "'Manrope', sans-serif" }}>
                  Removes <strong style={{ color: p.textPrimary }}>{booking.id}</strong> from the database. Use <strong>Cancel booking</strong> above if you just need to mark this reservation as cancelled.
                </div>
              </SidebarCard>
            )}
          </div>
        </div>
      </div>

      {/* Doc preview modal — full-screen, sits on top of the editor.       */}
      {docPreview && (
        <BookingDocPreviewModal
          booking={previewBooking}
          kind={docPreview}
          tax={tax}
          rooms={rooms}
          extras={extras}
          onClose={() => setDocPreview(null)}
        />
      )}

      {/* Type-to-confirm hard-delete modal — gated by `bookings_delete`. */}
      {confirmDelete && (
        <DeleteBookingConfirmModal
          booking={booking}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={deleteBookingPermanently}
        />
      )}
      {pendingStatus && (
        <StatusChangeDialog
          booking={draft}
          nextStatus={pendingStatus}
          onCancel={() => setPendingStatus(null)}
          onConfirm={(remark) => applyEditorStatusChange(pendingStatus, remark)}
        />
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// StatusChangeDialog — every booking status transition lands here. The
// remark is REQUIRED (operator must type something before Confirm enables)
// so the audit trail always carries a "why". Renders the from → to flow
// with the same colour swatches used everywhere else for continuity.
// ---------------------------------------------------------------------------
function StatusChangeDialog({ booking, nextStatus, onCancel, onConfirm }) {
  const p = usePalette();
  const [remark, setRemark] = useState("");
  const armed = remark.trim().length > 0;
  const fromColor = STATUS_BASE[booking.status] || "#6B7280";
  const toColor   = STATUS_BASE[nextStatus]    || "#6B7280";
  const destructive = nextStatus === "cancelled" || nextStatus === "rejected" || nextStatus === "sold-out";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg"
        style={{ backgroundColor: p.bgPanel, border: `1px solid ${destructive ? p.danger : p.accent}`, fontFamily: "'Manrope', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
          <span style={{ color: destructive ? p.danger : p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Change reservation status · {booking.id}
          </span>
        </div>
        <div className="px-5 py-4" style={{ color: p.textSecondary, fontSize: "0.84rem", lineHeight: 1.55 }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
            <span style={chipStyle(fromColor)}>
              <span style={dotStyle(fromColor)} />
              {STATUS_LABEL[booking.status] || booking.status}
            </span>
            <span style={{ color: p.textMuted, fontWeight: 700 }}>→</span>
            <span style={chipStyle(toColor)}>
              <span style={dotStyle(toColor)} />
              {STATUS_LABEL[nextStatus] || nextStatus}
            </span>
          </div>
          <label style={{ display: "block", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Remark · required
          </label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder={
              nextStatus === "cancelled" ? "Why is this booking being cancelled? (e.g. guest no-show, overbooking shift, duplicate)" :
              nextStatus === "rejected"  ? "Why is the request being rejected? (e.g. unsuitable dates, no inventory)" :
              nextStatus === "sold-out"  ? "Note the period / suite type that's sold out and how the guest will be informed" :
              nextStatus === "in-house"  ? "Check-in note (room handed over, ID copy taken, any special arrangements)" :
              nextStatus === "checked-out" ? "Check-out note (folio settled, deposit released, any incidentals)" :
              nextStatus === "confirmed" ? "Confirmation note (inventory allocated, hotel ref issued, payment terms)" :
              "Brief note explaining this status change"
            }
            rows={4}
            autoFocus
            style={{
              width: "100%", padding: "0.55rem 0.7rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${armed ? (destructive ? p.danger : p.accent) : p.border}`, outline: "none",
              resize: "vertical",
            }}
          />
          <p style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
            This remark is appended to the booking's audit trail (Status history card in the editor + global audit log) and visible to every operator with access to this booking.
          </p>
        </div>
        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${p.border}` }}>
          <button
            onClick={onCancel}
            style={{
              backgroundColor: "transparent",
              color: p.textMuted,
              border: `1px solid ${p.border}`,
              padding: "0.5rem 1rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", fontWeight: 600,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (armed) onConfirm(remark); }}
            disabled={!armed}
            style={{
              backgroundColor: armed ? (destructive ? p.danger : p.accent) : "transparent",
              color: armed ? "#FFFFFF" : p.textDim,
              border: `1px solid ${armed ? (destructive ? p.danger : p.accent) : p.border}`,
              padding: "0.5rem 1rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", fontWeight: 700,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: armed ? "pointer" : "not-allowed",
            }}
          >
            Confirm change
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhatsAppMessagePreview — small modal that renders the pre-built
// confirmation text in a textarea so the operator can SEE what's being
// shared, and offers a Copy button + a direct "Open in WhatsApp" deep
// link when a phone number is on file. Falls back to manual select-all
// when the async Clipboard API is blocked (sandboxed previews, missing
// document focus, restrictive Permissions-Policy headers).
// ---------------------------------------------------------------------------
function WhatsAppMessagePreview({ booking, message, phone, waDigits, onClose }) {
  const p = usePalette();
  const taRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  // Auto-select the text on mount so the operator can Cmd/Ctrl+C
  // immediately even if the Copy button's clipboard write is blocked.
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    requestAnimationFrame(() => { try { el.focus(); el.select(); } catch (_) {} });
  }, []);
  const handleCopy = async () => {
    setCopyErr(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else if (taRef.current) {
        taRef.current.focus();
        taRef.current.select();
        const ok = document.execCommand("copy");
        if (!ok) throw new Error("execCommand returned false");
      } else {
        throw new Error("no clipboard available");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      pushToast({ message: "WhatsApp message copied to clipboard." });
    } catch (_) {
      setCopyErr(true);
      // Re-select so the operator can copy with the keyboard shortcut.
      try { taRef.current?.focus(); taRef.current?.select(); } catch (_) {}
    }
  };
  const waUrl = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(message)}` : null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl"
        style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
          <MessageCircle size={14} style={{ color: p.accent }} />
          <span style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            WhatsApp message · {booking.id}
          </span>
        </div>
        <div className="px-5 py-4" style={{ color: p.textSecondary, fontSize: "0.82rem", lineHeight: 1.55 }}>
          <p style={{ color: p.textMuted, fontSize: "0.74rem", marginBottom: 10 }}>
            {phone
              ? <>Number on file: <strong style={{ color: p.textPrimary }}>{phone}</strong>. Copy the text below or open WhatsApp with this message pre-filled.</>
              : <>No mobile number on file. Copy the text below and paste into any WhatsApp chat (web, desktop, or mobile).</>
            }
          </p>
          <textarea
            ref={taRef}
            readOnly
            value={message}
            rows={Math.min(16, Math.max(8, message.split("\n").length + 1))}
            style={{
              width: "100%",
              padding: "0.7rem 0.85rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.84rem",
              lineHeight: 1.5,
              backgroundColor: p.inputBg,
              color: p.textPrimary,
              border: `1px solid ${p.border}`,
              outline: "none",
              resize: "vertical",
              whiteSpace: "pre-wrap",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = p.accent; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = p.border; }}
          />
          {copyErr && (
            <p style={{ color: p.warn, fontSize: "0.72rem", marginTop: 8 }}>
              Auto-copy was blocked by the browser. The text is selected — press <strong>{navigator.platform?.includes("Mac") ? "⌘C" : "Ctrl+C"}</strong> to copy manually.
            </p>
          )}
        </div>
        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${p.border}` }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              color: p.textMuted,
              border: `1px solid ${p.border}`,
              padding: "0.5rem 1rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", fontWeight: 600,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Close
          </button>
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: "transparent",
                color: p.accent,
                border: `1px solid ${p.accent}`,
                padding: "0.5rem 1rem",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.66rem", fontWeight: 700,
                letterSpacing: "0.2em", textTransform: "uppercase",
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                textDecoration: "none",
              }}
            >
              <MessageCircle size={12} /> Open in WhatsApp
            </a>
          )}
          <button
            onClick={handleCopy}
            style={{
              backgroundColor: copied ? p.success : p.accent,
              color: "#FFFFFF",
              border: `1px solid ${copied ? p.success : p.accent}`,
              padding: "0.5rem 1rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", fontWeight: 700,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              transition: "background-color 200ms",
            }}
          >
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy message</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteBookingConfirmModal — destructive-action confirm. Requires the
// operator to type the booking reference exactly to enable the Delete
// button. Sits on top of the BookingEditor Drawer.
// ---------------------------------------------------------------------------
function DeleteBookingConfirmModal({ booking, onCancel, onConfirm }) {
  const p = usePalette();
  const expected = String(booking.reference || booking.id || "").trim();
  const [typed, setTyped] = useState("");
  const armed = typed.trim() === expected && expected.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg"
        style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.danger}`, fontFamily: "'Manrope', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
          <Trash2 size={14} style={{ color: p.danger }} />
          <span style={{ color: p.danger, fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Delete booking permanently?
          </span>
        </div>
        <div className="px-5 py-4" style={{ color: p.textSecondary, fontSize: "0.84rem", lineHeight: 1.55 }}>
          <p>
            This will <strong style={{ color: p.danger }}>REMOVE</strong>{" "}
            <strong style={{ color: p.textPrimary }}>{expected}</strong>{" "}
            from the database. The booking row, its folio history, payments, and audit-trail entries linked to it will all be gone. This action <strong>CANNOT</strong> be undone.
          </p>
          <p style={{ marginTop: 10 }}>
            If you just want to mark it as no-show or cancelled, use the status buttons above instead — those keep the audit trail.
          </p>
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
              Type the booking reference to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expected}
              autoFocus
              style={{
                width: "100%", padding: "0.55rem 0.7rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                backgroundColor: p.inputBg, color: p.textPrimary,
                border: `1px solid ${armed ? p.danger : p.border}`, outline: "none",
                letterSpacing: "0.02em",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = armed ? p.danger : p.accent; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = armed ? p.danger : p.border; }}
            />
          </div>
        </div>
        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${p.border}` }}>
          <button
            onClick={onCancel}
            style={{
              backgroundColor: "transparent",
              color: p.textMuted,
              border: `1px solid ${p.border}`,
              padding: "0.5rem 1rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", fontWeight: 600,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={armed ? onConfirm : undefined}
            disabled={!armed}
            style={{
              backgroundColor: armed ? p.danger : "transparent",
              color: armed ? "#FFFFFF" : p.textDim,
              border: `1px solid ${armed ? p.danger : p.border}`,
              padding: "0.5rem 1rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", fontWeight: 700,
              letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: armed ? "pointer" : "not-allowed",
              opacity: armed ? 1 : 0.55,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Trash2 size={12} /> Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Editor sub-components — kept in this file because they share styling
// and the palette / chip helpers above.
// -----------------------------------------------------------------------

// Read-only display with the look of an input. Used for derived values
// (nights, subtotal, balance) so the layout matches the editable fields.
function ReadOnlyField({ p, value, hint, valueColor }) {
  return (
    <div>
      <div className="flex items-center" style={{
        border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt,
        padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif",
        color: valueColor || p.textPrimary, fontSize: "0.88rem",
        fontWeight: 600, fontVariantNumeric: "tabular-nums",
      }}>
        <span>{value}</span>
      </div>
      {hint && (
        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4, fontFamily: "'Manrope', sans-serif" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// Chip-style picker — replaces the bare `<select>` for a much friendlier
// status / payment toggle. Each option is rendered in its semantic color.
function ChipPicker({ p, value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        const color = o.color || p.accent;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="inline-flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              padding: "0.45rem 0.85rem",
              backgroundColor: active ? `${color}1F` : p.bgPanelAlt,
              border: `1px solid ${active ? color : p.border}`,
              color: active ? color : p.textMuted,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: color, display: "inline-block", flexShrink: 0 }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TextAreaField({ p, value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value || ""}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full outline-none"
      style={{
        backgroundColor: p.inputBg, color: p.textPrimary,
        border: `1px solid ${p.border}`,
        padding: "0.6rem 0.75rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
        resize: "vertical",
      }}
    />
  );
}

function SidebarCard({ title, p, children }) {
  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          {title}
        </div>
      </div>
      <div className="px-3 py-3 space-y-1.5">{children}</div>
    </div>
  );
}

function SidebarHeading({ p, icon, children, className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 px-1 ${className}`}
      style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
      {icon}{children}
    </div>
  );
}

function SidebarBtn({ p, icon, label, onClick, disabled, danger }) {
  const baseColor = danger ? p.danger : p.textSecondary;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 text-start"
      style={{
        fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
        backgroundColor: "transparent",
        border: `1px solid ${disabled ? p.border : danger ? p.danger : p.border}`,
        color: disabled ? p.textDim : baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = danger ? p.danger : p.accent; e.currentTarget.style.borderColor = danger ? p.danger : p.accent; e.currentTarget.style.backgroundColor = p.bgHover; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = baseColor; e.currentTarget.style.borderColor = danger ? p.danger : p.border; e.currentTarget.style.backgroundColor = "transparent"; } }}
    >
      {icon}<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
  );
}

function SnapRow({ p, label, value, children, accent, success, warn }) {
  const color = accent ? p.accent : success ? p.success : warn ? p.warn : p.textPrimary;
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      {children ? children : (
        <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardVaultPanel — secured display of a guest's stored card. The card data
// is captured by the BookingModal during checkout (or by the Booking
// admin tools) and held for CARD_VAULT_RETENTION_DAYS days, after which
// it auto-purges on render. SECURITY: only the last 4 digits + brand are
// ever stored (see buildCardOnFile) — there is no full PAN to reveal. The
// `card_vault_view` permission (managed in Staff & Access) still gates the
// manager-only actions (mark-as-charged, remove). CARD_VAULT_ROLES acts as
// a backwards-compat default when the session's permissions array is empty.
// ---------------------------------------------------------------------------
function CardVaultPanel({ p, booking, draft, update, staffSession, appendAuditLog, updateBooking, addPayment }) {
  const card = draft.cardOnFile;
  const role = (staffSession?.role || "").toLowerCase();
  const allowed = canViewCardOnFile(staffSession);
  const expired = card ? cardOnFileExpired(card) : false;
  // Charge-recording state machine. "idle" → primary "Mark as charged"
  // button. "form" → inline transaction-id form. After confirm we flip
  // back to "idle" and the panel renders the charged-summary row.
  const [chargeMode, setChargeMode] = React.useState("idle");
  const [txId, setTxId] = React.useState("");
  const [chargeNotes, setChargeNotes] = React.useState("");

  // Full-number reveal. Masked by default; a manager can reveal the full PAN
  // to key a manual charge into the terminal. Every reveal is audit-logged
  // and the number auto-re-hides after 30s so it isn't left on screen.
  const [revealed, setRevealed] = React.useState(false);
  const revealTimer = React.useRef(null);
  const canReveal = allowed && card && hasFullPan(card);
  const fullNumber = revealed && canReveal ? revealCardNumber(card) : "";
  React.useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);
  // Re-hide whenever the card changes / panel re-renders for a different booking.
  React.useEffect(() => { setRevealed(false); }, [booking.id]);

  const toggleReveal = () => {
    if (!canReveal) return;
    if (revealed) {
      setRevealed(false);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      return;
    }
    setRevealed(true);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setRevealed(false), 30000);
    try {
      appendAuditLog?.({
        ts: new Date().toISOString(),
        actor: staffSession?.id || "anon",
        actorName: staffSession?.name || "Staff",
        action: "card-vault.reveal",
        target: { kind: "booking", id: booking.id },
        note: `Revealed full card number (•••• ${card.last4 || "????"}) for booking ${booking.id}`,
      });
    } catch (_) {}
  };

  const copyFull = () => {
    if (!canReveal) return;
    const digits = revealCardNumber(card).replace(/\s/g, "");
    if (!digits) return;
    try {
      navigator.clipboard?.writeText(digits);
      pushToast({ message: "Full card number copied" });
      try {
        appendAuditLog?.({
          ts: new Date().toISOString(),
          actor: staffSession?.id || "anon",
          actorName: staffSession?.name || "Staff",
          action: "card-vault.copy-full",
          target: { kind: "booking", id: booking.id },
          note: `Copied full card number (•••• ${card.last4 || "????"}) for booking ${booking.id}`,
        });
      } catch (_) {}
    } catch (_) {
      pushToast({ message: "Copy failed", kind: "warn" });
    }
  };

  // Auto-purge on render once the retention window passes. The booking
  // hits the store with `cardOnFile: null` and an audit-log entry so the
  // change is traceable.
  React.useEffect(() => {
    if (card && expired) {
      update({ cardOnFile: null });
      try { updateBooking(booking.id, { cardOnFile: null }); } catch (_) {}
      try {
        appendAuditLog?.({
          ts: new Date().toISOString(),
          actor: "system",
          actorName: "System (retention policy)",
          action: "card-vault.purge",
          target: { kind: "booking", id: booking.id },
          note: `Card-on-file auto-purged after ${CARD_VAULT_RETENTION_DAYS}-day retention window`,
        });
      } catch (_) {}
    }
  }, [card, expired]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeCard = () => {
    if (!allowed) return;
    if (!confirm("Remove the card on file? This cannot be undone.")) return;
    update({ cardOnFile: null });
    try { updateBooking(booking.id, { cardOnFile: null }); } catch (_) {}
    try {
      appendAuditLog?.({
        ts: new Date().toISOString(),
        actor: staffSession?.id || "anon",
        actorName: staffSession?.name || "Staff",
        action: "card-vault.remove",
        target: { kind: "booking", id: booking.id },
        note: `Card-on-file manually removed for booking ${booking.id}`,
      });
    } catch (_) {}
    pushToast({ message: "Card-on-file removed" });
  };
  const copyMasked = () => {
    if (!card) return;
    try {
      navigator.clipboard?.writeText(maskCardNumber(card));
      pushToast({ message: "Masked number copied" });
    } catch (_) {
      pushToast({ message: "Copy failed", kind: "warn" });
    }
  };

  // Confirm the charge entered in the inline form. Records a payment,
  // flips the booking to paid, stamps the transaction metadata, and
  // appends an audit-log entry. The hotel actually charges the card
  // outside the app (Benefit Pay terminal or a gateway), so this step
  // is purely "transcribe what just happened".
  const recordCharge = () => {
    if (!allowed) return;
    const trimmed = (txId || "").trim();
    if (trimmed.length < 4) {
      pushToast({ message: "Enter a transaction ID (4+ characters)", kind: "warn" });
      return;
    }
    const chargedAt = new Date().toISOString();
    const chargedBy = staffSession?.name || staffSession?.email || "—";
    const amount = Number(booking.total) || Number(draft.total) || 0;
    const notes = (chargeNotes || "").trim() || null;
    try {
      updateBooking?.(booking.id, {
        paymentStatus: "paid",
        paid: amount,
        paymentTransactionId: trimmed,
        paymentChargedAt: chargedAt,
        paymentChargedBy: chargedBy,
      });
      update?.({
        paymentStatus: "paid",
        paid: amount,
        paymentTransactionId: trimmed,
        paymentChargedAt: chargedAt,
        paymentChargedBy: chargedBy,
      });
    } catch (_) {}
    try {
      addPayment?.({
        id: `PAY-${Date.now()}`,
        bookingId: booking.id,
        kind: "charge",
        method: "card",
        amount,
        currency: "BHD",
        reference: trimmed,
        notes,
        capturedBy: staffSession?.id || "system",
        capturedByName: chargedBy,
      });
    } catch (_) {}
    try {
      appendAuditLog?.({
        ts: chargedAt,
        actor: staffSession?.id || "anon",
        actorName: chargedBy,
        action: "payment.charge-recorded",
        target: { kind: "booking", id: booking.id },
        note: `Recorded card-on-file charge of ${formatCurrency(amount)} · txn ${trimmed}${notes ? ` · ${notes}` : ""}`,
      });
    } catch (_) {}
    pushToast({ message: `Charge recorded · ${trimmed}`, kind: "success" });
    setTxId("");
    setChargeNotes("");
    setChargeMode("idle");
  };

  // Days remaining until the card auto-purges (negative = already
  // expired, but we render the purged state below).
  const daysLeft = card?.expiresAt
    ? Math.max(0, Math.ceil((new Date(card.expiresAt).getTime() - Date.now()) / 86400000))
    : null;

  const charged = draft.paymentStatus === "paid" && !!draft.paymentTransactionId;
  const canMarkCharged = card && draft.paymentStatus === "pending";

  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2">
          <CreditCard size={12} style={{ color: p.accent }} />
          <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Card on file
          </span>
        </div>
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", border: `1px solid ${p.border}` }}>
          <Lock size={9} style={{ display: "inline", marginInlineEnd: 3, verticalAlign: -1 }} />
          Manager only
        </span>
      </div>
      <div className="px-4 py-3 space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
        {!card ? (
          <div style={{ color: p.textMuted, fontSize: "0.78rem", lineHeight: 1.5 }}>
            No card stored for this booking.
            {draft.paymentTiming === "later" && <> Payment is set to <strong>charge on arrival</strong>.</>}
          </div>
        ) : (
          <>
            {/* Headline — masked by default. A manager can reveal the full
                number to key a manual charge into the terminal; the reveal is
                audit-logged and auto-hides after 30s. Legacy cards captured
                before full-PAN storage show masked only (no reveal). */}
            <div className="flex items-center justify-between gap-2">
              <div style={{ color: revealed ? p.accent : p.textPrimary, fontWeight: 700, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>
                {revealed ? fullNumber : maskCardNumber(card)}
              </div>
              <div className="flex items-center gap-2">
                {canReveal && (
                  <button
                    type="button"
                    onClick={toggleReveal}
                    title={revealed ? "Hide number" : "View full number"}
                    style={{ background: "transparent", border: "none", color: revealed ? p.accent : p.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", padding: 2 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                    onMouseLeave={(e) => e.currentTarget.style.color = revealed ? p.accent : p.textMuted}
                    aria-label={revealed ? "Hide full card number" : "View full card number"}
                  >
                    {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
                <span style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", border: `1px solid ${p.border}` }}>
                  {card.brand || "Card"}
                </span>
              </div>
            </div>
            {revealed && (
              <div style={{ color: p.textMuted, fontSize: "0.62rem", marginTop: -2 }}>
                Auto-hides in 30s · this view is logged
              </div>
            )}
            {allowed && card.last4 && !hasFullPan(card) && (
              <div className="p-2 flex items-start gap-2" style={{ backgroundColor: p.bgPanelAlt, border: `1px dashed ${p.border}`, color: p.textMuted, fontSize: "0.7rem", lineHeight: 1.5 }}>
                <ShieldCheck size={11} style={{ marginTop: 2, flexShrink: 0, color: p.accent }} />
                <span>This card was captured before full-number storage, so only the last 4 digits are on file. Re-capture the card to enable full-number view.</span>
              </div>
            )}
            <SnapRow p={p} label="Cardholder" value={card.name || "—"} />
            <SnapRow p={p} label="Expiry"     value={card.exp  || "—"} />
            <SnapRow p={p} label="Captured"   value={fmtDate(card.capturedAt) || "—"} />
            <SnapRow
              p={p} label="Auto-purges"
              value={daysLeft != null ? `${fmtDate(card.expiresAt)} · in ${daysLeft}d` : "—"}
              warn={daysLeft != null && daysLeft <= 3}
            />
            <SnapRow p={p} label="Charge timing"
              value={(draft.paymentTiming === "now"
                ? (charged ? "Charged" : "Pay-now · awaiting charge")
                : "Hold only · charged on arrival")} />

            {/* Charged summary — once the operator has flipped the
                booking to paid via "Mark as charged", surface the
                transaction id + who/when as a read-only row so the
                audit trail is visible inline. */}
            {charged && (
              <div className="mt-1 p-2.5" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}40`, fontSize: "0.74rem", lineHeight: 1.5 }}>
                <div className="flex items-center gap-2" style={{ color: p.success, fontWeight: 700 }}>
                  <Check size={12} />
                  <span>Charged · {draft.paymentTransactionId}</span>
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.68rem", marginTop: 2 }}>
                  {fmtDate(draft.paymentChargedAt) || "—"} · by {draft.paymentChargedBy || "—"}
                </div>
              </div>
            )}

            {/* Mark-as-charged inline form. Operator has clicked the
                primary button; we collect a transaction id (mandatory)
                and optional gateway notes, then flip the booking to
                paid + stamp the metadata + write an audit entry. */}
            {allowed && chargeMode === "form" && (
              <div className="mt-1 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.accent}`, fontFamily: "'Manrope', sans-serif" }}>
                <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                  Record charge
                </div>
                <label style={{ display: "block", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                  Transaction ID
                </label>
                <input
                  type="text"
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  placeholder="e.g. BNF-2026-04829"
                  autoFocus
                  style={{
                    width: "100%", padding: "0.55rem 0.7rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                    backgroundColor: p.inputBg, color: p.textPrimary,
                    border: `1px solid ${p.border}`, outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = p.accent; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = p.border; }}
                />
                <label style={{ display: "block", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginTop: 10, marginBottom: 4 }}>
                  Gateway / notes (optional)
                </label>
                <input
                  type="text"
                  value={chargeNotes}
                  onChange={(e) => setChargeNotes(e.target.value)}
                  placeholder="Benefit Pay terminal · auth 8421"
                  style={{
                    width: "100%", padding: "0.55rem 0.7rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                    backgroundColor: p.inputBg, color: p.textPrimary,
                    border: `1px solid ${p.border}`, outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = p.accent; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = p.border; }}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={recordCharge}
                    style={{
                      backgroundColor: p.accent,
                      color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                      border: `1px solid ${p.accent}`,
                      padding: "0.45rem 0.95rem",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.66rem", fontWeight: 700,
                      letterSpacing: "0.2em", textTransform: "uppercase",
                      cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <Check size={11} /> Confirm charge
                  </button>
                  <button
                    onClick={() => { setChargeMode("idle"); setTxId(""); setChargeNotes(""); }}
                    style={{
                      backgroundColor: "transparent",
                      color: p.textMuted,
                      border: `1px solid ${p.border}`,
                      padding: "0.45rem 0.95rem",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.66rem", fontWeight: 600,
                      letterSpacing: "0.18em", textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Action row */}
            <div className="flex flex-wrap gap-2 pt-1">
              {allowed ? (
                <>
                  {canReveal && (
                    <SidebarBtn p={p} icon={revealed ? <EyeOff size={12} /> : <Eye size={12} />} label={revealed ? "Hide number" : "View full number"} onClick={toggleReveal} />
                  )}
                  {canReveal && (
                    <SidebarBtn p={p} icon={<Copy size={12} />} label="Copy full number" onClick={copyFull} />
                  )}
                  <SidebarBtn p={p} icon={<Copy size={12} />} label="Copy masked" onClick={copyMasked} />
                  {canMarkCharged && chargeMode !== "form" && (
                    <button
                      onClick={() => { setChargeMode("form"); setTxId(""); setChargeNotes(""); }}
                      style={{
                        backgroundColor: p.accent,
                        color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                        border: `1px solid ${p.accent}`,
                        padding: "0.5rem 0.85rem",
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.66rem", fontWeight: 700,
                        letterSpacing: "0.2em", textTransform: "uppercase",
                        cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Check size={12} /> Mark as charged
                    </button>
                  )}
                  <SidebarBtn p={p} icon={<Trash2 size={12} />} label="Remove card on file" onClick={removeCard} danger />
                </>
              ) : (
                <div className="p-2.5 flex items-start gap-2 w-full" style={{ backgroundColor: p.bgPanelAlt, border: `1px dashed ${p.border}`, color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.5 }}>
                  <ShieldCheck size={12} style={{ marginTop: 2, flexShrink: 0, color: p.accent }} />
                  <span>
                    Your role (<strong style={{ color: p.textPrimary }}>{role || "—"}</strong>) doesn't include the
                    {" "}<strong style={{ color: p.textPrimary }}>View card on file</strong> permission.
                    {" "}Ask the Owner to grant it from <strong style={{ color: p.textPrimary }}>Staff &amp; Access</strong>.
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        <div style={{ color: p.textMuted, fontSize: "0.66rem", lineHeight: 1.5, marginTop: 6 }}>
          Full number stored to enable manual terminal charges · CVV is never stored · reveals are logged · records auto-purge {CARD_VAULT_RETENTION_DAYS} days after capture.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuaranteeDocsPanel — booking-guarantee paperwork the front desk collects to
// manually charge a card and secure the reservation. Three mandatory items:
//   1. Passport / photo-ID copy of the booker
//   2. Credit-card copy (front, middle digits masked)
//   3. Signed credit-card pre-authorisation form
// Manager-gated identically to the card vault (canViewCardOnFile). Each slot
// supports upload-from-desktop (or scan) with a thumbnail, a Received/Verified
// status with who+when, and view / replace / remove — all audit-logged. The
// pre-auth form can be generated as a printable A4 for the booker to sign.
// Files are stored on the booking under `guaranteeDocs` (base64 data URL, in
// keeping with the in-memory store; a production media pipeline can swap the
// data URL for a CDN URL with no shape change).
// ---------------------------------------------------------------------------
const GUARANTEE_DOC_SLOTS = [
  { key: "passport", label: "Passport / ID copy", hint: "Booker's passport or photo ID.", icon: UserIcon },
  { key: "cardCopy", label: "Credit-card copy",   hint: "Front of card · mask the middle digits.", icon: CreditCard },
  { key: "preAuth",  label: "Signed pre-authorisation", hint: "Pre-auth form filled & signed by the booker.", icon: FileCheck },
];

function GuaranteeDocsPanel({ p, booking, draft, update, staffSession, appendAuditLog, updateBooking, rooms, hotelInfo }) {
  const role = (staffSession?.role || "").toLowerCase();
  const allowed = canViewCardOnFile(staffSession);
  const docs = draft.guaranteeDocs || {};
  const completeCount = GUARANTEE_DOC_SLOTS.filter((s) => docs[s.key]?.file).length;
  const verifiedCount = GUARANTEE_DOC_SLOTS.filter((s) => docs[s.key]?.verified).length;

  const writeDocs = (nextDocs, auditNote) => {
    update({ guaranteeDocs: nextDocs });
    try { updateBooking(booking.id, { guaranteeDocs: nextDocs }); } catch (_) {}
    if (auditNote) {
      try {
        appendAuditLog?.({
          ts: new Date().toISOString(),
          actor: staffSession?.id || "anon",
          actorName: staffSession?.name || "Staff",
          action: "guarantee-docs.update",
          target: { kind: "booking", id: booking.id },
          note: auditNote,
        });
      } catch (_) {}
    }
  };

  const onUpload = (slot, file) => {
    if (!allowed || !file?.url) return;
    const next = {
      ...docs,
      [slot.key]: {
        file: file.url,
        name: file.name || "upload",
        type: file.type || "",
        uploadedAt: new Date().toISOString(),
        uploadedBy: staffSession?.name || "Staff",
        verified: false,
      },
    };
    writeDocs(next, `Uploaded ${slot.label} for booking ${booking.id}`);
    pushToast({ message: `${slot.label} uploaded` });
  };

  const toggleVerified = (slot) => {
    if (!allowed) return;
    const cur = docs[slot.key];
    if (!cur?.file) return;
    const nowVerified = !cur.verified;
    const next = {
      ...docs,
      [slot.key]: {
        ...cur,
        verified: nowVerified,
        verifiedAt: nowVerified ? new Date().toISOString() : null,
        verifiedBy: nowVerified ? (staffSession?.name || "Staff") : null,
      },
    };
    writeDocs(next, `${nowVerified ? "Verified" : "Un-verified"} ${slot.label} for booking ${booking.id}`);
  };

  const removeDoc = (slot) => {
    if (!allowed) return;
    if (!confirm(`Remove the ${slot.label.toLowerCase()}? This cannot be undone.`)) return;
    const next = { ...docs };
    delete next[slot.key];
    writeDocs(next, `Removed ${slot.label} for booking ${booking.id}`);
    pushToast({ message: `${slot.label} removed` });
  };

  const viewDoc = (slot) => {
    const f = docs[slot.key]?.file;
    if (!f) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<title>${slot.label} · ${booking.id}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${f}" style="max-width:100%;max-height:100vh;object-fit:contain;"/></body>`);
      w.document.close();
    }
  };

  const downloadPreAuth = () => {
    try { printPreAuthForm(booking, { rooms, hotel: hotelInfo }); }
    catch (_) { pushToast({ message: "Couldn't open the pre-auth form", kind: "warn" }); }
  };

  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={12} style={{ color: p.accent }} />
          <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Guarantee documents
          </span>
        </div>
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", border: `1px solid ${p.border}` }}>
          <Lock size={9} style={{ display: "inline", marginInlineEnd: 3, verticalAlign: -1 }} />
          Manager only
        </span>
      </div>

      {!allowed ? (
        <div className="px-4 py-3">
          <div className="p-2.5 flex items-start gap-2" style={{ backgroundColor: p.bgPanelAlt, border: `1px dashed ${p.border}`, color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.5 }}>
            <ShieldCheck size={12} style={{ marginTop: 2, flexShrink: 0, color: p.accent }} />
            <span>
              Your role (<strong style={{ color: p.textPrimary }}>{role || "—"}</strong>) doesn't include the
              {" "}<strong style={{ color: p.textPrimary }}>View card on file</strong> permission required to manage guarantee documents.
            </span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3" style={{ fontFamily: "'Manrope', sans-serif" }}>
          {/* Progress + pre-auth form download */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span style={{ color: completeCount === GUARANTEE_DOC_SLOTS.length ? p.success : p.textMuted, fontSize: "0.74rem", fontWeight: 600 }}>
              {completeCount}/{GUARANTEE_DOC_SLOTS.length} collected · {verifiedCount} verified
            </span>
            <SidebarBtn p={p} icon={<Download size={12} />} label="Pre-auth form (print)" onClick={downloadPreAuth} />
          </div>

          {GUARANTEE_DOC_SLOTS.map((slot) => {
            const d = docs[slot.key];
            const Icon = slot.icon;
            return (
              <div key={slot.key} style={{ border: `1px solid ${d?.verified ? `${p.success}55` : p.border}`, backgroundColor: p.bgPanelAlt, padding: "0.7rem 0.8rem" }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={13} style={{ color: p.accent, flexShrink: 0 }} />
                    <span style={{ color: p.textPrimary, fontSize: "0.78rem", fontWeight: 700 }}>{slot.label}</span>
                  </div>
                  {d?.file ? (
                    <span style={{ color: d.verified ? p.success : p.warn, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", border: `1px solid ${d.verified ? p.success : p.warn}` }}>
                      {d.verified ? "Verified" : "Received"}
                    </span>
                  ) : (
                    <span style={{ color: p.textMuted, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "1px 6px", border: `1px solid ${p.border}` }}>
                      Missing
                    </span>
                  )}
                </div>

                {!d?.file ? (
                  <>
                    <FileUpload
                      variant="cover"
                      accept="image/*,application/pdf"
                      value={null}
                      onChange={(file) => onUpload(slot, file)}
                      hint={slot.hint}
                    />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      {/* Thumbnail (image) or doc chip (pdf) */}
                      {(d.type || "").startsWith("image/") || (typeof d.file === "string" && d.file.startsWith("data:image")) ? (
                        <button onClick={() => viewDoc(slot)} title="View full size" style={{ padding: 0, border: `1px solid ${p.border}`, cursor: "pointer", background: "none", flexShrink: 0 }}>
                          <img src={d.file} alt={slot.label} style={{ width: 56, height: 56, objectFit: "cover", display: "block" }} />
                        </button>
                      ) : (
                        <button onClick={() => viewDoc(slot)} title="Open document" style={{ width: 56, height: 56, border: `1px solid ${p.border}`, background: p.bgPanel, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FileText size={18} style={{ color: p.accent }} />
                        </button>
                      )}
                      <div className="min-w-0" style={{ fontSize: "0.68rem", color: p.textMuted, lineHeight: 1.5 }}>
                        <div style={{ color: p.textPrimary, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{d.name}</div>
                        <div>{fmtDate(d.uploadedAt)} · {d.uploadedBy}</div>
                        {d.verified && <div style={{ color: p.success }}>Verified {fmtDate(d.verifiedAt)} · {d.verifiedBy}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <SidebarBtn p={p} icon={<Eye size={12} />} label="View" onClick={() => viewDoc(slot)} />
                      <SidebarBtn p={p} icon={<Check size={12} />} label={d.verified ? "Un-verify" : "Mark verified"} onClick={() => toggleVerified(slot)} />
                      <SidebarBtn p={p} icon={<Trash2 size={12} />} label="Remove" onClick={() => removeDoc(slot)} danger />
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <div style={{ color: p.textMuted, fontSize: "0.66rem", lineHeight: 1.5 }}>
            Sensitive documents — keep handling to authorised staff. Mask the middle card digits on any card copy. Retain only as long as your booking-guarantee policy requires.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OfferAppliedCard — surfaces the LS Privilege package this booking was
// made against, including the package title, savings, pricing rule and the
// per-room price that was charged. Renders only when the booking carries
// an offerId / offerTitle.
// ---------------------------------------------------------------------------
function OfferAppliedCard({ p, booking, pkg, t }) {
  const accent = pkg?.color || p.accent;
  const title  = booking.offerTitle || (pkg ? (t(`packages.${pkg.id}.title`) || pkg.title) : null) || "Offer";
  const saving = Number(booking.offerSaving || 0);
  const conditions = pkg
    ? describePackageConditions(pkg, (id) => t(`rooms.${id}.name`) || id)
    : "";
  const roomPrice = pkg && booking.roomId ? getPackageRoomPrice(pkg, booking.roomId) : null;
  const priceSuffix = pkg ? packagePriceSuffix(pkg) : "";

  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, borderInlineStart: `4px solid ${accent}` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2">
          <Sparkles size={12} style={{ color: accent }} />
          <span style={{ color: accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Offer applied
          </span>
        </div>
        {saving > 0 && (
          <span style={{
            color: p.success, fontFamily: "'Manrope', sans-serif",
            fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            padding: "1px 6px", border: `1px solid ${p.success}`, backgroundColor: `${p.success}1F`,
          }}>Save {formatCurrency(saving)}</span>
        )}
      </div>
      <div className="px-4 py-3 space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
        <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.3rem", lineHeight: 1.1 }}>
          {title}
        </div>
        {conditions && (
          <div style={{ color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.5 }}>{conditions}</div>
        )}
        {roomPrice && roomPrice.price > 0 && (
          <SnapRow
            p={p}
            label="Offer price"
            value={`${formatCurrency(roomPrice.price)} ${priceSuffix}`}
            accent
          />
        )}
        {pkg?.pricingMode && (
          <SnapRow
            p={p} label="Pricing rule"
            value={pkg.pricingMode === "per-night" ? "Per night" : pkg.pricingMode === "first-night" ? "First night + rack rate" : "Flat per stay"}
          />
        )}
        {booking.offerId && (
          <SnapRow p={p} label="Reference" value={booking.offerId} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecordPaymentPanel — sidebar workflow for collecting payment against a
// booking. Operator picks a method (Card / Benefit Pay / Bank transfer /
// Cash), enters the amount (defaults to the outstanding balance), adds an
// optional reference, and submits. The submission writes a row to the
// payments store, bumps the booking's `paid` total + payment status,
// drops an audit log entry, and surfaces the just-created receipt for
// preview / email.
// ---------------------------------------------------------------------------
const PAYMENT_METHODS = [
  { value: "card",        label: "Card",         icon: CreditCard, feePct: 2.5 },
  { value: "benefit-pay", label: "Benefit Pay",  icon: Phone,      feePct: 0.5 },
  { value: "transfer",    label: "Bank transfer",icon: Coins,      feePct: 0   },
  { value: "cash",        label: "Cash",         icon: Coins,      feePct: 0   },
  { value: "gift-card",   label: "Gift card",    icon: Gift,       feePct: 0   },
];

function RecordPaymentPanel({
  p, booking, draft, update, balance, transactions = [],
  addPayment, updateBooking, appendAuditLog, staffSession,
  giftCards = [], redeemGiftCard,
  onPreviewReceipt, onEmailReceipt, expanded, setExpanded, t,
}) {
  const [method, setMethod] = React.useState("card");
  const [amount, setAmount] = React.useState(balance > 0 ? balance : (booking.total || 0));
  const [ref, setRef] = React.useState("");
  const [status, setStatus] = React.useState("captured");
  const [lastReceipt, setLastReceipt] = React.useState(null);
  // Gift-card tender — looked up by code, applied by nights. The card is
  // night-priced (ratePerNight), so applying it = redeeming N nights worth
  // N × ratePerNight in BHD.
  const [gcCode, setGcCode] = React.useState("");
  const [gcNights, setGcNights] = React.useState(1);

  // Sync default amount with balance whenever the panel is reopened so a
  // partial payment leaves the next default at the new balance.
  React.useEffect(() => {
    if (expanded) {
      setAmount(balance > 0 ? balance : 0);
      setMethod("card");
      setRef("");
      setStatus("captured");
      setGcCode("");
      setGcNights(1);
    }
  }, [expanded, balance]);

  // Resolve the typed code against the card book (case-insensitive).
  const gcMatch = React.useMemo(() => {
    const code = gcCode.trim().toLowerCase();
    if (!code) return null;
    return (giftCards || []).find((c) => (c.code || "").toLowerCase() === code) || null;
  }, [gcCode, giftCards]);

  // Derived redeemability + remaining balance for the matched card.
  const gcInfo = React.useMemo(() => {
    if (!gcMatch) return null;
    const todayISO = new Date().toISOString().slice(0, 10);
    const remainingNights = Math.max(0, (gcMatch.totalNights || 0) - (gcMatch.nightsUsed || 0));
    const rate = Number(gcMatch.ratePerNight) || 0;
    const remainingValue = +(remainingNights * rate).toFixed(3);
    const expired = gcMatch.validUntil ? gcMatch.validUntil < todayISO : false;
    const alreadyOnBooking = (gcMatch.redemptionHistory || []).some((e) => e.bookingId === booking.id);
    let reason = null;
    if (alreadyOnBooking)             reason = "Already applied to this booking";
    else if (gcMatch.status === "cancelled") reason = "Card is cancelled";
    else if (expired)                 reason = "Card has expired";
    else if (remainingNights <= 0)    reason = "No nights remaining on this card";
    else if (rate <= 0)               reason = "Card has no nightly value set";
    const redeemable = !reason;
    return { remainingNights, rate, remainingValue, expired, alreadyOnBooking, redeemable, reason };
  }, [gcMatch, booking.id]);

  // When a usable card is matched, default the nights to whatever covers the
  // outstanding balance (capped at the card's remaining nights).
  React.useEffect(() => {
    if (method !== "gift-card" || !gcInfo?.redeemable) return;
    const need = balance > 0 ? Math.max(1, Math.ceil(balance / gcInfo.rate)) : gcInfo.remainingNights;
    setGcNights(Math.min(gcInfo.remainingNights, need));
  }, [method, gcMatch, balance]); // eslint-disable-line react-hooks/exhaustive-deps

  // BHD value of the gift-card application currently configured.
  const gcAmount = gcInfo?.redeemable ? +(Math.min(gcInfo.remainingNights, Math.max(1, Number(gcNights) || 0)) * gcInfo.rate).toFixed(3) : 0;
  const isGiftCard = method === "gift-card";
  const recordAmount = isGiftCard ? gcAmount : Number(amount || 0);
  const canSubmit = isGiftCard ? (gcInfo?.redeemable && gcAmount > 0) : recordAmount > 0;

  const submit = () => {
    // ── Gift-card tender ──────────────────────────────────────────────
    // Redeem whole nights off the matched card and post the BHD value to
    // the folio. Keyed by booking.id so the redemption shows the booking in
    // the card ledger and is auto-credited back if the booking is cancelled.
    if (isGiftCard) {
      if (!gcMatch) { pushToast({ message: "Enter a valid gift card code", kind: "warn" }); return; }
      if (!gcInfo?.redeemable) { pushToast({ message: gcInfo?.reason || "This gift card can't be applied", kind: "warn" }); return; }
      const nights = Math.min(gcInfo.remainingNights, Math.max(1, Number(gcNights) || 0));
      const amt = +(nights * gcInfo.rate).toFixed(3);
      const id = `PAY-${Math.floor(1000 + Math.random() * 9000)}`;
      const ts = new Date().toISOString();
      const record = {
        id, bookingId: booking.id,
        method: "gift-card", amount: amt, fee: 0, net: amt,
        ts, status: "captured",
        reference: gcMatch.code,
        giftCardId: gcMatch.id, giftCardCode: gcMatch.code,
        note: `${nights} night${nights === 1 ? "" : "s"} redeemed from gift card ${gcMatch.code}`,
        capturedBy: staffSession?.id || "system",
        capturedByName: staffSession?.name || "System",
      };
      try { redeemGiftCard?.({ id: gcMatch.id, nights, bookingId: booking.id, savings: amt }); } catch (_) {}
      try { addPayment?.(record); } catch (_) {}
      const nextPaid = +((Number(booking.paid) || 0) + amt).toFixed(3);
      const nextPaymentStatus = nextPaid >= (Number(booking.total) || 0) ? "paid"
                              : nextPaid > 0                              ? "deposit"
                              : booking.paymentStatus;
      try {
        updateBooking?.(booking.id, { paid: nextPaid, paymentStatus: nextPaymentStatus });
        update?.({ paid: nextPaid, paymentStatus: nextPaymentStatus });
      } catch (_) {}
      try {
        appendAuditLog?.({
          ts, actor: staffSession?.id || "anon",
          actorName: staffSession?.name || "Staff",
          action: "payment.giftcard",
          target: { kind: "booking", id: booking.id },
          note: `Applied gift card ${gcMatch.code} (${nights} night${nights === 1 ? "" : "s"} · ${formatCurrency(amt)}) to folio (${id})`,
        });
      } catch (_) {}
      pushToast({ message: `Gift card applied · ${formatCurrency(amt)} · ${id}` });
      setLastReceipt(record);
      setExpanded(false);
      return;
    }

    const amt = Math.max(0, Number(amount) || 0);
    if (amt <= 0) {
      pushToast({ message: "Enter an amount greater than zero", kind: "warn" });
      return;
    }
    const meta = PAYMENT_METHODS.find((m) => m.value === method) || PAYMENT_METHODS[0];
    const fee  = method === "card" || method === "benefit-pay"
      ? +(amt * (meta.feePct / 100)).toFixed(3)
      : 0;
    const net = +(amt - fee).toFixed(3);
    const id  = `PAY-${Math.floor(1000 + Math.random() * 9000)}`;
    const ts  = new Date().toISOString();
    const record = {
      id, bookingId: booking.id,
      method, amount: amt, fee, net,
      ts, status,
      reference: ref || "",
      capturedBy: staffSession?.id || "system",
      capturedByName: staffSession?.name || "System",
    };
    try { addPayment?.(record); } catch (_) {}

    // Roll the booking's running paid total + lifecycle status forward.
    if (status === "captured") {
      const nextPaid = +((Number(booking.paid) || 0) + amt).toFixed(3);
      const nextPaymentStatus = nextPaid >= (Number(booking.total) || 0) ? "paid"
                              : nextPaid > 0                              ? "deposit"
                              : booking.paymentStatus;
      try {
        updateBooking?.(booking.id, { paid: nextPaid, paymentStatus: nextPaymentStatus });
        update?.({ paid: nextPaid, paymentStatus: nextPaymentStatus });
      } catch (_) {}
    }

    try {
      appendAuditLog?.({
        ts, actor: staffSession?.id || "anon",
        actorName: staffSession?.name || "Staff",
        action: "payment.record",
        target: { kind: "booking", id: booking.id },
        note: `Recorded ${meta.label} payment of ${formatCurrency(amt)} (${id})`,
      });
    } catch (_) {}

    pushToast({ message: `${meta.label} payment ${status === "captured" ? "captured" : "logged"} · ${id}` });
    setLastReceipt(record);
    setExpanded(false);
  };

  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2">
          <Receipt size={12} style={{ color: p.accent }} />
          <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            Collect payment
          </span>
        </div>
        {transactions.length > 0 && (
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.04em" }}>
            {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Inline transactions ledger */}
        {transactions.length > 0 && (
          <div style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            {transactions.map((py, idx) => (
              <div key={py.id} className="px-3 py-2 flex items-center justify-between gap-2"
                style={{ borderTop: idx === 0 ? "none" : `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                <div className="min-w-0">
                  <div style={{ color: p.accent, fontWeight: 700, fontSize: "0.74rem" }}>{py.id}</div>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 1 }}>
                    {(PAYMENT_METHODS.find((m) => m.value === py.method)?.label) || py.method}
                    {" · "}{fmtDate(py.ts)}
                  </div>
                </div>
                <div className="text-end">
                  <div style={{ color: py.status === "refunded" ? p.danger : p.textPrimary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {py.status === "refunded" ? "− " : ""}{formatCurrency(py.amount)}
                  </div>
                  <div style={{ color: py.status === "captured" ? p.success : py.status === "refunded" ? p.danger : p.textMuted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                    {py.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!expanded ? (
          <>
            {balance > 0 ? (
              <SidebarBtn p={p} icon={<Plus size={12} />} label={`Record payment · ${formatCurrency(balance)} due`} onClick={() => setExpanded(true)} />
            ) : (
              <div style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5 }}>
                <CheckCircle2 size={11} style={{ display: "inline", marginInlineEnd: 4, verticalAlign: -1 }} />
                Folio is settled. Use the action below to record an additional charge if needed.
              </div>
            )}
            {balance === 0 && (
              <SidebarBtn p={p} icon={<Plus size={12} />} label="Record additional payment" onClick={() => setExpanded(true)} />
            )}
            {lastReceipt && (
              <div className="mt-1 p-2.5" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}40` }}>
                <div style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                  Just recorded · {lastReceipt.id}
                </div>
                <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4 }}>
                  {formatCurrency(lastReceipt.amount)} · {(PAYMENT_METHODS.find((m) => m.value === lastReceipt.method)?.label) || lastReceipt.method}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <SidebarBtn p={p} icon={<Eye size={12} />}     label="Preview receipt" onClick={onPreviewReceipt} />
                  <SidebarBtn p={p} icon={<Mail size={12} />}    label="Email receipt"   onClick={onEmailReceipt} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3" style={{ fontFamily: "'Manrope', sans-serif" }}>
            {/* Method picker */}
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Method</div>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const Ic = m.icon;
                  const active = method === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      className="flex items-center gap-2 px-2.5 py-2"
                      style={{
                        backgroundColor: active ? `${p.accent}1F` : p.bgPanelAlt,
                        border: `1px solid ${active ? p.accent : p.border}`,
                        color: active ? p.accent : p.textMuted,
                        cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                      }}
                    >
                      <Ic size={12} /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isGiftCard ? (
              <div className="space-y-3">
                {/* Gift card lookup */}
                <div>
                  <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Gift card code</div>
                  <input
                    value={gcCode}
                    onChange={(e) => setGcCode(e.target.value)}
                    placeholder="e.g. LS-GC-DEMO-AAAA"
                    className="w-full outline-none"
                    style={{
                      backgroundColor: p.inputBg, color: p.textPrimary,
                      border: `1px solid ${gcCode && !gcMatch ? p.danger : p.border}`,
                      padding: "0.55rem 0.7rem",
                      fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem", letterSpacing: "0.04em",
                    }}
                  />
                  {gcCode && !gcMatch && (
                    <div style={{ color: p.danger, fontSize: "0.7rem", marginTop: 5 }}>No gift card matches that code.</div>
                  )}
                </div>

                {/* Matched card summary */}
                {gcMatch && (
                  <div className="p-2.5" style={{ border: `1px solid ${gcInfo?.redeemable ? `${p.accent}55` : `${p.danger}55`}`, backgroundColor: p.bgPanelAlt }}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, fontSize: "0.78rem" }}>{gcMatch.code}</div>
                      <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700 }}>{gcMatch.status}</div>
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 3, lineHeight: 1.5 }}>
                      {gcInfo?.remainingNights} night{gcInfo?.remainingNights === 1 ? "" : "s"} left · {formatCurrency(gcInfo?.remainingValue || 0)} value · {formatCurrency(gcInfo?.rate || 0)}/night
                      {gcMatch.validUntil ? ` · valid to ${fmtDate(gcMatch.validUntil)}` : ""}
                    </div>
                    {!gcInfo?.redeemable && (
                      <div style={{ color: p.danger, fontSize: "0.72rem", marginTop: 6, fontWeight: 600 }}>
                        <Ban size={11} style={{ display: "inline", marginInlineEnd: 4, verticalAlign: -1 }} />{gcInfo?.reason}
                      </div>
                    )}
                  </div>
                )}

                {/* Nights to apply */}
                {gcMatch && gcInfo?.redeemable && (
                  <div>
                    <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Nights to apply</div>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="Fewer nights"
                        onClick={() => setGcNights((n) => Math.max(1, (Number(n) || 1) - 1))}
                        style={{ width: 34, height: 34, border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, color: p.textPrimary, cursor: "pointer", fontWeight: 700, fontSize: "1rem" }}>−</button>
                      <div style={{ minWidth: 44, textAlign: "center", color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "1rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {Math.min(gcInfo.remainingNights, Math.max(1, Number(gcNights) || 1))}
                      </div>
                      <button type="button" aria-label="More nights"
                        onClick={() => setGcNights((n) => Math.min(gcInfo.remainingNights, (Number(n) || 1) + 1))}
                        style={{ width: 34, height: 34, border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, color: p.textPrimary, cursor: "pointer", fontWeight: 700, fontSize: "1rem" }}>+</button>
                      <div style={{ color: p.textMuted, fontSize: "0.72rem", marginInlineStart: 4 }}>of {gcInfo.remainingNights} available</div>
                    </div>
                    <div style={{ color: p.success, fontSize: "0.78rem", marginTop: 8, fontWeight: 600 }}>
                      = {formatCurrency(gcAmount)} applied to folio
                      {balance > 0 ? ` · ${formatCurrency(Math.max(0, +(balance - gcAmount).toFixed(3)))} balance after` : ""}
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <>
            {/* Amount */}
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Amount (BHD)</div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full outline-none"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`,
                  padding: "0.55rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
                }}
              />
              {balance > 0 && Number(amount) !== balance && (
                <button
                  onClick={() => setAmount(balance)}
                  style={{
                    color: p.accent, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase",
                    fontWeight: 700, marginTop: 6, background: "transparent", border: "none", cursor: "pointer", padding: 0,
                  }}
                >Set to balance · {formatCurrency(balance)}</button>
              )}
            </div>

            {/* Reference + status */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Reference (optional)</div>
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder={method === "transfer" ? "Bank ref · IBAN trail"
                              : method === "cash"     ? "Cash drawer slip #"
                              : method === "benefit-pay" ? "Benefit Pay txn ID"
                              : "Last 4 / authorisation"}
                  className="w-full outline-none"
                  style={{
                    backgroundColor: p.inputBg, color: p.textPrimary,
                    border: `1px solid ${p.border}`,
                    padding: "0.55rem 0.7rem",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                  }}
                />
              </div>
              <div>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Status</div>
                <div className="flex flex-wrap gap-2">
                  {["captured", "pending", "failed"].map((s) => {
                    const active = s === status;
                    const color  = s === "captured" ? p.success : s === "pending" ? p.warn : p.danger;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className="inline-flex items-center gap-2"
                        style={{
                          fontFamily: "'Manrope', sans-serif",
                          fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                          padding: "0.4rem 0.8rem",
                          backgroundColor: active ? `${color}1F` : p.bgPanelAlt,
                          border: `1px solid ${active ? color : p.border}`,
                          color: active ? color : p.textMuted,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: color, display: "inline-block" }} />
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            </>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={submit}
                disabled={!canSubmit}
                style={{
                  flex: 1,
                  backgroundColor: p.accent, color: "#FFF",
                  border: `1px solid ${p.accent}`,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  padding: "0.55rem 0.85rem", cursor: canSubmit ? "pointer" : "not-allowed",
                  opacity: canSubmit ? 1 : 0.5,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {isGiftCard
                  ? <><Gift size={12} /> Apply · {formatCurrency(recordAmount)}</>
                  : <><CheckCircle2 size={12} /> Record · {formatCurrency(recordAmount)}</>}
              </button>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  backgroundColor: "transparent", color: p.textMuted,
                  border: `1px solid ${p.border}`,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  padding: "0.55rem 0.85rem", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
