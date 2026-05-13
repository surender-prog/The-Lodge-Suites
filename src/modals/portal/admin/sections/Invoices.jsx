import React, { useMemo, useState } from "react";
import { ArrowRight, Bell, CheckCircle2, CreditCard, Download, ExternalLink, FileText, Plus, Save, Search, Send, Trash2, X } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { fmtDate, inDays } from "../../../../utils/date.js";
import { applyTaxes, inverseApplyTaxes, useData } from "../../../../data/store.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, Stat, TableShell, Td, Th, TextField } from "../ui.jsx";

const STATUS_LABEL = { paid: "Paid", issued: "Issued", overdue: "Overdue", void: "Void" };

// Bucket invoices by days overdue.
function ageBucket(invoice, today = new Date()) {
  if (invoice.status === "paid" || invoice.status === "void") return null;
  const due = new Date(invoice.due);
  const days = Math.round((today - due) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "current";
  if (days <= 30) return "thirty";
  if (days <= 60) return "sixty";
  return "ninety";
}

export const Invoices = ({ onNavigate }) => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { invoices, bookings } = useData();

  // Deep-link to the Bookings tab + open that booking's editor. Falls
  // back to a toast when the booking can't be located (legacy invoices
  // without a `bookingId`, or bookings that have since been removed).
  const openBooking = (bookingId) => {
    if (!bookingId || bookingId === "—") {
      pushToast({ message: "This invoice isn't linked to a booking", kind: "warn" });
      return;
    }
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) {
      pushToast({ message: `Booking ${bookingId} not found`, kind: "warn" });
      return;
    }
    if (typeof onNavigate === "function") {
      onNavigate("bookings", null, { bookingId });
    } else {
      pushToast({ message: `Booking ${bookingId} · navigate not wired`, kind: "warn" });
    }
  };

  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  // "kind" discriminates booking-AR from commission-AP. "all" shows both.
  const [kind, setKind] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [viewing, setViewing] = useState(null);
  const [generating, setGenerating] = useState(null); // { booking? } | null
  const [paying, setPaying] = useState(null); // invoice | null

  // Bookings without an invoice yet — these are ripe for "+ Generate".
  const unbilled = useMemo(() => {
    const billed = new Set(invoices.map(i => i.bookingId).filter(b => b && b !== "—"));
    return bookings.filter(b => !billed.has(b.id) && b.status !== "cancelled");
  }, [invoices, bookings]);

  const filtered = useMemo(() => {
    const ql = search.trim().toLowerCase();
    return invoices.filter((iv) => {
      if (status !== "all" && iv.status !== status) return false;
      if (type !== "all" && iv.clientType !== type) return false;
      // Treat missing `kind` as "booking" (legacy invoices default).
      if (kind !== "all" && (iv.kind || "booking") !== kind) return false;
      if (dateFrom && iv.issued < dateFrom) return false;
      if (dateTo && iv.issued > dateTo) return false;
      if (!ql) return true;
      return iv.id.toLowerCase().includes(ql)
        || iv.clientName.toLowerCase().includes(ql)
        || (iv.bookingId || "").toLowerCase().includes(ql);
    });
  }, [invoices, status, type, kind, dateFrom, dateTo, search]);

  const totals = invoices.reduce((acc, iv) => {
    acc.amount += iv.amount;
    acc.paid += iv.paid;
    if (iv.status === "overdue") acc.overdue += iv.amount;
    if (iv.status === "issued")  acc.outstanding += iv.amount - iv.paid;
    return acc;
  }, { amount: 0, paid: 0, overdue: 0, outstanding: 0 });

  const aging = useMemo(() => {
    const buckets = { current: 0, thirty: 0, sixty: 0, ninety: 0 };
    for (const iv of invoices) {
      const b = ageBucket(iv);
      if (b) buckets[b] += iv.amount - iv.paid;
    }
    return buckets;
  }, [invoices]);

  const statusColor = (s) => ({ paid: p.success, issued: p.accent, overdue: p.danger, void: p.textMuted })[s];
  const sendReminder = (iv) => pushToast({ message: `Reminder sent to ${iv.clientName}` });

  return (
    <div>
      <PageHeader
        title="Invoices"
        intro="Folio and corporate/agent invoices in one place. Generate from any existing booking with pre-filled folio lines."
        action={<PrimaryBtn small onClick={() => setGenerating({})}><Plus size={11} /> Generate invoice</PrimaryBtn>}
      />

      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Issued (YTD)" value={`${t("common.bhd")} ${totals.amount.toLocaleString()}`} hint={`${invoices.length} invoices`} />
        <Stat label="Collected" value={`${t("common.bhd")} ${totals.paid.toLocaleString()}`} hint={`${Math.round(totals.paid / Math.max(1, totals.amount) * 100)}%`} color={p.success} />
        <Stat label="Outstanding" value={`${t("common.bhd")} ${totals.outstanding.toLocaleString()}`} color={p.warn} />
        <Stat label="Awaiting invoice" value={unbilled.length} hint={unbilled.length > 0 ? "Bookings · click + Generate" : "All caught up"} color={unbilled.length > 0 ? p.warn : p.success} />
      </div>

      <AgingCard aging={aging} />

      <Card title="Filters" className="mb-4">
        <div className="grid md:grid-cols-6 gap-3">
          <div>
            <div className="flex items-center" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <Search size={14} style={{ color: p.textMuted, marginInlineStart: 10 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search no., client, booking…"
                className="flex-1 outline-none"
                style={{ padding: "0.55rem 0.75rem", color: p.textPrimary, backgroundColor: "transparent", fontSize: "0.85rem", border: "none", minWidth: 0 }}
              />
            </div>
          </div>
          <SelectField value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <SelectField value={type} onChange={setType} options={[
            { value: "all", label: "All clients" },
            { value: "guest", label: "Guests" },
            { value: "corporate", label: "Corporate" },
            { value: "agent", label: "Travel agents" },
          ]} />
          <SelectField value={kind} onChange={setKind} options={[
            { value: "all", label: "All kinds" },
            { value: "booking", label: "Booking (AR)" },
            { value: "commission", label: "Commission (AP)" },
          ]} />
          <TextField type="date" value={dateFrom} onChange={setDateFrom} placeholder="From" />
          <TextField type="date" value={dateTo} onChange={setDateTo} placeholder="To" />
        </div>
      </Card>

      <Card padded={false} title={`Invoices (${filtered.length})`}>
        <TableShell>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Client</Th>
              <Th>Booking</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th align="end">Amount</Th>
              <Th align="end">Paid</Th>
              <Th align="end">Balance</Th>
              <Th>Status</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((iv) => {
              const balance = iv.amount - iv.paid;
              return (
                <tr
                  key={iv.id}
                  onClick={() => setViewing(iv)}
                  style={{ cursor: "pointer", transition: "background-color 120ms ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover || `${p.accent}10`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <Td>
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewing(iv); }}
                      className="inline-flex items-center gap-1.5"
                      style={{
                        color: p.accent, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.05em",
                        background: "transparent", border: "none", padding: 0, cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                      title={`Open invoice ${iv.id}`}
                    >
                      {iv.id} <ExternalLink size={11} />
                    </button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.02rem", color: p.textPrimary }}>{iv.clientName}</span>
                      {(iv.kind || "booking") === "commission" && (
                        <span
                          title="Hotel pays the agent — commission payable"
                          style={{
                            fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                            padding: "1px 6px", color: p.success, border: `1px solid ${p.success}`,
                            backgroundColor: `${p.success}14`,
                          }}
                        >Commission</span>
                      )}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", textTransform: "capitalize" }}>{iv.clientType}</div>
                  </Td>
                  <Td>
                    {iv.bookingId && iv.bookingId !== "—" ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); openBooking(iv.bookingId); }}
                        className="inline-flex items-center gap-1.5"
                        style={{
                          color: p.accent, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.04em",
                          background: "transparent", border: "none", padding: 0, cursor: "pointer",
                          fontFamily: "'Manrope', sans-serif",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                        title={`Open booking ${iv.bookingId}`}
                      >
                        {iv.bookingId} <ExternalLink size={11} />
                      </button>
                    ) : (
                      <span style={{ color: p.textMuted }}>—</span>
                    )}
                  </Td>
                  <Td muted>{fmtDate(iv.issued, lang)}</Td>
                  <Td muted>{fmtDate(iv.due, lang)}</Td>
                  <Td align="end" className="font-semibold">{t("common.bhd")} {iv.amount.toLocaleString()}</Td>
                  <Td align="end">{t("common.bhd")} {iv.paid.toLocaleString()}</Td>
                  <Td align="end" style={{ color: balance > 0 ? p.warn : p.success, fontWeight: 600 }}>{t("common.bhd")} {balance.toLocaleString()}</Td>
                  <Td>
                    <span style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px", color: statusColor(iv.status), border: `1px solid ${statusColor(iv.status)}`,
                    }}>{STATUS_LABEL[iv.status]}</span>
                  </Td>
                  <Td align="end">
                    <div className="flex items-center gap-3 justify-end">
                      <button title="Download PDF" onClick={(e) => { e.stopPropagation(); pushToast({ message: `${iv.id} downloaded` }); }} style={{ color: p.textMuted, background: "transparent", border: "none", cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.color = p.accent} onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}><Download size={13} /></button>
                      <button title="Send to client" onClick={(e) => { e.stopPropagation(); pushToast({ message: `${iv.id} sent to ${iv.clientName}` }); }} style={{ color: p.textMuted, background: "transparent", border: "none", cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.color = p.accent} onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}><Send size={13} /></button>
                      {iv.status !== "paid" && iv.status !== "void" && (
                        <>
                          <button title="Mark as paid" onClick={(e) => { e.stopPropagation(); setPaying(iv); }} style={{ color: p.textMuted, background: "transparent", border: "none", cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.color = p.success} onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}><CheckCircle2 size={13} /></button>
                          <button title="Send reminder" onClick={(e) => { e.stopPropagation(); sendReminder(iv); }} style={{ color: p.textMuted, background: "transparent", border: "none", cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.color = p.warn} onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}><Bell size={13} /></button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center" style={{ color: p.textMuted, fontSize: "0.88rem" }}>
                  No invoices match the current filters.
                  <button onClick={() => setGenerating({})} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Generate one →</button>
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
      </Card>

      {viewing && <InvoiceDetail invoice={viewing} onClose={() => setViewing(null)} onMarkPaid={() => { setViewing(null); setPaying(viewing); }} onOpenBooking={(id) => { setViewing(null); openBooking(id); }} />}
      {generating && <InvoiceGenerator preset={generating} onClose={() => setGenerating(null)} unbilled={unbilled} />}
      {paying && <MarkPaidDrawer invoice={paying} onClose={() => setPaying(null)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Aging buckets visualization (unchanged + click-to-batch).
// ---------------------------------------------------------------------------
function AgingCard({ aging }) {
  const t = useT();
  const p = usePalette();
  const total = Object.values(aging).reduce((s, n) => s + n, 0) || 1;
  const BUCKETS = [
    { key: "current", label: "Current",        color: p.success, hint: "Within terms" },
    { key: "thirty",  label: "1–30 days late", color: p.warn,    hint: "First reminder" },
    { key: "sixty",   label: "31–60 days",     color: p.warn,    hint: "Second reminder" },
    { key: "ninety",  label: "60+ days · escalate", color: p.danger, hint: "Manager action" },
  ];
  const overall = aging.thirty + aging.sixty + aging.ninety;

  return (
    <Card title="Receivables aging" className="mb-6" padded={false}
      action={
        overall > 0 ? (
          <button
            onClick={() => pushToast({ message: `Reminder batch queued for ${BUCKETS.filter(b => b.key !== "current" && aging[b.key] > 0).length} ageing buckets` })}
            style={{
              color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}
          >
            <Bell size={11} className="inline mr-1.5" /> Send batch reminders
          </button>
        ) : null
      }
    >
      <div className="px-5 py-4 grid sm:grid-cols-4 gap-3">
        {BUCKETS.map((b) => {
          const value = aging[b.key];
          const pct = Math.round((value / total) * 100);
          return (
            <div key={b.key} className="p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
              <div className="flex items-baseline justify-between">
                <span style={{ color: b.color, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>{b.label}</span>
                <span style={{ color: p.textMuted, fontSize: "0.7rem", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: value > 0 ? b.color : p.textMuted, fontWeight: 500, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {t("common.bhd")} {value.toLocaleString()}
              </div>
              <div className="mt-2 h-1" style={{ backgroundColor: p.border }}>
                <div className="h-full" style={{ width: `${pct}%`, backgroundColor: b.color }} />
              </div>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", marginTop: 6 }}>{b.hint}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invoice generator — full-page. Pick an existing booking, pre-fill folio
// lines from the booking + tax config, then create the invoice.
// ---------------------------------------------------------------------------
function InvoiceGenerator({ preset, onClose, unbilled }) {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { bookings, rooms, tax, addInvoice, agreements, agencies, members } = useData();

  const billable = useMemo(() => {
    return bookings.filter(b => b.status !== "cancelled");
  }, [bookings]);

  const [step, setStep] = useState(preset?.booking ? "details" : "pick");
  const [selected, setSelected] = useState(preset?.booking || null);
  const [search, setSearch] = useState("");
  const [filterUnbilled, setFilterUnbilled] = useState(true);

  const filteredBookings = useMemo(() => {
    const ql = search.trim().toLowerCase();
    let list = filterUnbilled ? unbilled : billable;
    if (!ql) return list;
    return list.filter(b =>
      b.id.toLowerCase().includes(ql)
      || b.guest.toLowerCase().includes(ql)
      || b.email.toLowerCase().includes(ql)
    );
  }, [billable, unbilled, filterUnbilled, search]);

  if (step === "pick") {
    return (
      <Drawer
        open={true}
        onClose={onClose}
        eyebrow="New invoice"
        title="Pick a booking"
        fullPage
        contentMaxWidth="max-w-4xl"
        footer={<GhostBtn onClick={onClose} small>Cancel</GhostBtn>}
      >
        <Card title={filterUnbilled ? `Bookings without an invoice (${unbilled.length})` : `All bookings (${billable.length})`} padded={false}
          action={
            <button onClick={() => setFilterUnbilled(!filterUnbilled)}
              style={{
                color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              }}
            >
              {filterUnbilled ? "Show all bookings →" : "Show only unbilled →"}
            </button>
          }
        >
          <div className="px-5 pt-3 pb-4">
            <div className="flex items-center" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
              <Search size={14} style={{ color: p.textMuted, marginInlineStart: 10 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, guest name, email…"
                className="flex-1 outline-none"
                style={{ padding: "0.65rem 0.75rem", color: p.textPrimary, backgroundColor: "transparent", fontSize: "0.86rem", border: "none", minWidth: 0 }}
                autoFocus
              />
            </div>
          </div>
          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {filteredBookings.length === 0 ? (
              <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                No bookings to invoice.
              </div>
            ) : (
              <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", color: p.textSecondary }}>
                <tbody>
                  {filteredBookings.map((b) => (
                    <tr key={b.id}
                      style={{ borderTop: `1px solid ${p.border}`, cursor: "pointer" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      onClick={() => { setSelected(b); setStep("details"); }}
                    >
                      <td className="px-5 py-3">
                        <div style={{ color: p.accent, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.05em" }}>{b.id}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", textTransform: "capitalize" }}>{b.source}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.02rem", color: p.textPrimary }}>{b.guest}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{b.email}</div>
                      </td>
                      <td className="px-3 py-3" style={{ color: p.textMuted }}>{t(`rooms.${b.roomId}.name`)}</td>
                      <td className="px-3 py-3" style={{ color: p.textMuted, whiteSpace: "nowrap" }}>{fmtDate(b.checkIn, lang)} → {fmtDate(b.checkOut, lang)}</td>
                      <td className="px-3 py-3 text-end" style={{ fontWeight: 600 }}>{t("common.bhd")} {b.total.toLocaleString()}</td>
                      <td className="px-5 py-3 text-end">
                        <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                          Pick →
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </Drawer>
    );
  }

  // step === "details"
  return <InvoiceDetailsStep booking={selected} onClose={onClose} onBack={() => setStep("pick")} />;
}

// Second step of the generator — fill in folio lines, due date, and create.
function InvoiceDetailsStep({ booking, onClose, onBack }) {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { tax, addInvoice, agreements, agencies, members } = useData();

  // Resolve client type/name from booking source.
  const clientFromBooking = useMemo(() => {
    if (booking.source === "corporate") {
      // Best-guess the agreement by matching against active agreements.
      const agr = agreements[0];
      return { clientType: "corporate", clientName: agr?.account || booking.guest };
    }
    if (booking.source === "agent") {
      const agt = agencies[0];
      return { clientType: "agent", clientName: agt?.name || booking.guest };
    }
    return { clientType: "guest", clientName: booking.guest };
  }, [booking, agreements, agencies]);

  const [draft, setDraft] = useState(() => ({
    bookingId: booking.id,
    clientType: clientFromBooking.clientType,
    clientName: clientFromBooking.clientName,
    issued: new Date().toISOString().slice(0, 10),
    due: clientFromBooking.clientType === "guest" ? new Date().toISOString().slice(0, 10) : inDays(30),
    notes: "",
    extras: [],
    // Default to a booking-AR invoice. Operators can flip this on when the
    // invoice is the hotel's payable to a travel agent.
    kind: "booking",
  }));

  const subtotal = booking.rate * booking.nights;
  const extrasTotal = draft.extras.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const taxResult = applyTaxes(subtotal + extrasTotal, tax, booking.nights);
  const total = Math.round(taxResult.gross);

  const addExtra = () => setDraft((d) => ({ ...d, extras: [...d.extras, { id: `ex-${Date.now()}`, name: "", amount: 0 }] }));
  const updateExtra = (id, patch) => setDraft((d) => ({ ...d, extras: d.extras.map(e => e.id === id ? { ...e, ...patch } : e) }));
  const removeExtra = (id) => setDraft((d) => ({ ...d, extras: d.extras.filter(e => e.id !== id) }));

  const create = () => {
    // Only agent invoices can ride the commission ledger. Force booking
    // otherwise so a stray draft value can't leak across client types.
    const kind = draft.clientType === "agent" && draft.kind === "commission" ? "commission" : "booking";
    addInvoice({
      bookingId: booking.id,
      clientType: draft.clientType,
      clientName: draft.clientName,
      issued: draft.issued,
      due: draft.due,
      amount: total,
      paid: 0,
      status: draft.due < new Date().toISOString().slice(0, 10) ? "overdue" : "issued",
      kind,
    });
    pushToast({ message: `${kind === "commission" ? "Commission invoice" : "Invoice"} generated for ${draft.clientName}` });
    onClose();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="New invoice"
      title={`Invoice · ${booking.id}`}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          <GhostBtn onClick={onBack} small>← Pick another booking</GhostBtn>
          <div className="flex-1" />
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={create} small><Save size={11} /> Create invoice</PrimaryBtn>
        </>
      }
    >
      {/* Booking summary strip */}
      <div className="p-4 mb-6 flex items-center justify-between flex-wrap gap-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: p.textPrimary }}>{booking.guest}</span>
            <span style={{ color: p.accent, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em" }}>{booking.id}</span>
            <span style={{
              fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              padding: "2px 8px", color: p.textMuted, border: `1px solid ${p.border}`,
            }}>{booking.source}</span>
          </div>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4 }}>
            {t(`rooms.${booking.roomId}.name`)} · {fmtDate(booking.checkIn, lang)} → {fmtDate(booking.checkOut, lang)} · {booking.nights} {booking.nights === 1 ? "night" : "nights"}
          </div>
        </div>
        <div className="text-end">
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Booking value</div>
          <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", fontWeight: 600 }}>{t("common.bhd")} {booking.total.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: editable invoice form */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Invoice details">
            <div className="grid md:grid-cols-2 gap-4">
              <FormGroup label="Bill to (client name)">
                <TextField value={draft.clientName} onChange={(v) => setDraft({ ...draft, clientName: v })} />
              </FormGroup>
              <FormGroup label="Client type">
                <SelectField value={draft.clientType} onChange={(v) => setDraft({ ...draft, clientType: v })} options={[
                  { value: "guest", label: "Guest" },
                  { value: "corporate", label: "Corporate" },
                  { value: "agent", label: "Travel agent" },
                ]} />
              </FormGroup>
              <FormGroup label="Issued">
                <TextField type="date" value={draft.issued} onChange={(v) => setDraft({ ...draft, issued: v })} />
              </FormGroup>
              <FormGroup label="Due">
                <TextField type="date" value={draft.due} onChange={(v) => setDraft({ ...draft, due: v })} />
              </FormGroup>
            </div>
            <FormGroup label="Notes (visible to client)" className="mt-4">
              <TextField value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Thank-you note, payment instructions, …" />
            </FormGroup>
            {draft.clientType === "agent" && (
              <label
                className="mt-4 flex items-start gap-2 cursor-pointer"
                style={{ padding: "0.7rem 0.85rem", border: `1px solid ${draft.kind === "commission" ? p.success : p.border}`, backgroundColor: draft.kind === "commission" ? `${p.success}10` : "transparent" }}
              >
                <input
                  type="checkbox"
                  checked={draft.kind === "commission"}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.checked ? "commission" : "booking" })}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", fontWeight: 600 }}>
                    Commission invoice (hotel pays the agent)
                  </span>
                  <span style={{ display: "block", color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 2 }}>
                    Use for commission payable to the agency. Lands in the agent's Commission ledger, not their Invoices tab.
                  </span>
                </span>
              </label>
            )}
          </Card>

          <Card title="Extras (optional)" padded={false}
            action={
              <button onClick={addExtra} className="flex items-center gap-1.5"
                style={{
                  padding: "0.35rem 0.7rem", border: `1px solid ${p.success}`, color: p.success,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                }}
              >
                <Plus size={11} /> Add line
              </button>
            }
          >
            {draft.extras.length === 0 ? (
              <div className="px-5 py-8 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
                No extras. Add F&B, spa, transfers, or any ad-hoc charges above the room rate.
              </div>
            ) : (
              <div className="px-5 py-4 space-y-3">
                {draft.extras.map((e) => (
                  <div key={e.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <TextField value={e.name} onChange={(v) => updateExtra(e.id, { name: v })} placeholder="e.g. Airport transfer · 2 pax" />
                    </div>
                    <div style={{ width: 140 }}>
                      <TextField type="number" value={e.amount} onChange={(v) => updateExtra(e.id, { amount: Number(v) })} suffix="BHD" />
                    </div>
                    <button onClick={() => removeExtra(e.id)} title="Remove line"
                      style={{ color: p.danger, padding: "0.4rem 0.5rem", border: `1px solid ${p.border}` }}
                      onMouseEnter={(e2) => { e2.currentTarget.style.borderColor = p.danger; e2.currentTarget.style.backgroundColor = p.bgHover; }}
                      onMouseLeave={(e2) => { e2.currentTarget.style.borderColor = p.border; e2.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: summary & preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <Card title="Folio preview" padded={false}>
            <div className="p-5 space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
              <SummaryRow label={`Room × ${booking.nights} nights @ ${t("common.bhd")} ${booking.rate}`} value={`${t("common.bhd")} ${subtotal.toLocaleString()}`} />
              {draft.extras.filter(e => e.name).map((e) => (
                <SummaryRow key={e.id} label={e.name || "Extra"} value={`${t("common.bhd")} ${(Number(e.amount) || 0).toLocaleString()}`} />
              ))}
              {extrasTotal > 0 && <div style={{ height: 1, backgroundColor: p.border, margin: "6px 0" }} />}
              <SummaryRow label="Subtotal" value={`${t("common.bhd")} ${(subtotal + extrasTotal).toLocaleString()}`} />
              {taxResult.lines.map((line) => {
                const note = line.type === "percentage" ? `${line.rate}%${line.calculation === "compound" ? " · compound" : ""}` : `${t("common.bhd")} ${line.amount}`;
                return (
                  <SummaryRow key={line.id} label={`+ ${line.name} · ${note}`} value={`${t("common.bhd")} ${line.taxAmount.toFixed(3)}`} muted />
                );
              })}
              <div className="pt-3 mt-3 flex justify-between items-baseline" style={{ borderTop: `2px solid ${p.border}` }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary }}>Total</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: p.accent, fontWeight: 700 }}>{t("common.bhd")} {total.toLocaleString()}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Drawer>
  );
}

function SummaryRow({ label, value, muted }) {
  const p = usePalette();
  return (
    <div className="flex justify-between gap-2">
      <span style={{ color: p.textMuted, fontSize: muted ? "0.78rem" : "0.85rem" }}>{label}</span>
      <span style={{ color: muted ? p.textMuted : p.textPrimary, fontWeight: muted ? 500 : 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mark-as-paid drawer — capture amount, payment method, and write a payment
// record + update the invoice in one shot.
// ---------------------------------------------------------------------------
function MarkPaidDrawer({ invoice, onClose }) {
  const t = useT();
  const p = usePalette();
  const { updateInvoice, addPayment } = useData();
  const balance = invoice.amount - invoice.paid;
  const [draft, setDraft] = useState({
    amount: balance,
    method: "card",
    reference: "",
  });

  const apply = () => {
    const amt = Number(draft.amount) || 0;
    if (amt <= 0) { pushToast({ message: "Enter an amount greater than 0", kind: "warn" }); return; }
    const newPaid = invoice.paid + amt;
    const newStatus = newPaid >= invoice.amount ? "paid" : invoice.status;
    updateInvoice(invoice.id, { paid: newPaid, status: newStatus });
    addPayment({
      bookingId: invoice.bookingId,
      method: draft.method,
      amount: amt,
    });
    pushToast({ message: `${t("common.bhd")} ${amt.toLocaleString()} · ${invoice.id} ${newStatus === "paid" ? "settled" : "partial payment"}` });
    onClose();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="Receive payment"
      title={`Mark ${invoice.id} as paid`}
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={apply} small><CheckCircle2 size={12} /> Apply payment</PrimaryBtn>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Outstanding</div>
          <div style={{ color: p.warn, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", fontWeight: 600 }}>{t("common.bhd")} {balance.toLocaleString()}</div>
          <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{invoice.clientName}</div>
        </div>
        <FormGroup label="Amount received">
          <TextField type="number" value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} suffix="BHD" />
        </FormGroup>
        <FormGroup label="Method">
          <SelectField value={draft.method} onChange={(v) => setDraft({ ...draft, method: v })} options={[
            { value: "card", label: "Card" },
            { value: "benefit-pay", label: "Benefit Pay" },
            { value: "transfer", label: "Bank transfer" },
            { value: "cash", label: "Cash" },
          ]} />
        </FormGroup>
        <FormGroup label="Reference (optional)">
          <TextField value={draft.reference} onChange={(v) => setDraft({ ...draft, reference: v })} placeholder="Transaction ID, cheque no., …" />
        </FormGroup>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Invoice detail drawer — folio breakdown + activity log + Mark-as-paid CTA.
// ---------------------------------------------------------------------------
function InvoiceDetail({ invoice, onClose, onMarkPaid, onOpenBooking }) {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { tax } = useData();

  const subtotal = Math.round(inverseApplyTaxes(invoice.amount, tax, 1));
  const breakdown = applyTaxes(subtotal, tax, 1);
  const balance = invoice.amount - invoice.paid;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={invoice.id}
      title={invoice.clientName}
      fullPage
      contentMaxWidth="max-w-4xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Close</GhostBtn>
          {invoice.bookingId && invoice.bookingId !== "—" && (
            <GhostBtn small onClick={() => onOpenBooking?.(invoice.bookingId)}><ExternalLink size={11} /> Open booking</GhostBtn>
          )}
          <GhostBtn small onClick={() => pushToast({ message: `${invoice.id} downloaded` })}><Download size={11} /> Download PDF</GhostBtn>
          <GhostBtn small onClick={() => pushToast({ message: `${invoice.id} sent to ${invoice.clientName}` })}><Send size={11} /> Send to client</GhostBtn>
          {balance > 0 && invoice.status !== "void" && (
            <PrimaryBtn small onClick={onMarkPaid}><CreditCard size={11} /> Mark as paid</PrimaryBtn>
          )}
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Amount" value={`${t("common.bhd")} ${invoice.amount.toLocaleString()}`} />
        <Stat label="Collected" value={`${t("common.bhd")} ${invoice.paid.toLocaleString()}`} color={p.success} />
        <Stat label="Balance" value={`${t("common.bhd")} ${balance.toLocaleString()}`} color={balance > 0 ? p.warn : p.success} hint={balance > 0 ? "Outstanding" : "Settled"} />
      </div>

      <Card title="Folio breakdown" padded={false}>
        <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", color: p.textSecondary }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${p.border}` }}>
              <td className="px-5 py-3" style={{ color: p.textMuted }}>Room charges (subtotal)</td>
              <td className="px-5 py-3 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {subtotal.toLocaleString()}</td>
            </tr>
            {breakdown.lines.map((line) => {
              const note = line.type === "percentage"
                ? `${line.rate}%${line.calculation === "compound" ? " · compound" : ""}`
                : `${t("common.bhd")} ${line.amount}`;
              return (
                <tr key={line.id} style={{ borderBottom: `1px solid ${p.border}` }}>
                  <td className="px-5 py-3" style={{ color: p.textMuted }}>{line.name} <span style={{ color: p.textDim, fontSize: "0.74rem" }}>· {note}</span></td>
                  <td className="px-5 py-3 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {line.taxAmount.toLocaleString()}</td>
                </tr>
              );
            })}
            <tr>
              <td className="px-5 py-3" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary, fontWeight: 600 }}>Total invoiced</td>
              <td className="px-5 py-3 text-end" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {invoice.amount.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="Meta" className="mt-6">
        <div className="grid sm:grid-cols-2 gap-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", color: p.textSecondary }}>
          <div className="flex justify-between items-center" style={{ borderBottom: `1px solid ${p.border}`, paddingBottom: 8 }}>
            <span style={{ color: p.textMuted }}>Booking reference</span>
            {invoice.bookingId && invoice.bookingId !== "—" ? (
              <button
                onClick={() => onOpenBooking?.(invoice.bookingId)}
                className="inline-flex items-center gap-1.5"
                style={{
                  color: p.accent, fontWeight: 700, fontSize: "0.84rem",
                  background: "transparent", border: "none", padding: 0, cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                title={`Open booking ${invoice.bookingId}`}
              >
                {invoice.bookingId} <ExternalLink size={12} />
              </button>
            ) : (
              <span style={{ color: p.textMuted }}>—</span>
            )}
          </div>
          <Row label="Client type" value={invoice.clientType} />
          <Row label="Kind" value={(invoice.kind || "booking") === "commission" ? "Commission (hotel → agent)" : "Booking (client → hotel)"} />
          <Row label="Issued" value={fmtDate(invoice.issued, lang)} />
          <Row label="Due" value={fmtDate(invoice.due, lang)} />
        </div>
      </Card>

      <Card title="Activity" className="mt-6">
        <ul className="space-y-2.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}>
          <Activity color={p.accent}  text={`${(invoice.kind || "booking") === "commission" ? "Commission invoice issued" : "Issued"} on ${fmtDate(invoice.issued, lang)}`} />
          {invoice.paid > 0 && <Activity color={p.success} text={`Payment received · ${t("common.bhd")} ${invoice.paid.toLocaleString()}`} />}
          {invoice.status === "overdue" && <Activity color={p.danger}  text={`Marked overdue (due ${fmtDate(invoice.due, lang)})`} />}
        </ul>
      </Card>
    </Drawer>
  );
}

function Row({ label, value }) {
  const p = usePalette();
  return (
    <div className="flex justify-between" style={{ borderBottom: `1px solid ${p.border}`, paddingBottom: 8 }}>
      <span style={{ color: p.textMuted }}>{label}</span>
      <span style={{ color: p.textPrimary, textTransform: "capitalize", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Activity({ color, text }) {
  const p = usePalette();
  return (
    <li className="flex items-center gap-3">
      <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color, flexShrink: 0 }} />
      <span style={{ color: p.textSecondary }}>{text}</span>
    </li>
  );
}
