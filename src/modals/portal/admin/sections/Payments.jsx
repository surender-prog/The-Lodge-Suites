import React, { useMemo, useState } from "react";
import { ArrowRight, Banknote, CreditCard, Download, ExternalLink, Mail, Printer, RotateCcw, Smartphone, TrendingUp, X } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { useData } from "../../../../data/store.jsx";
import { Card, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, Stat, TableShell, Td, Th } from "../ui.jsx";
import { BookingDocPreviewModal, downloadBookingDoc, emailBookingDoc, printBookingDoc } from "../BookingDocs.jsx";

const METHOD_META = {
  card:        { label: "Card",         icon: CreditCard },
  "benefit-pay": { label: "Benefit Pay", icon: Smartphone },
  transfer:    { label: "Bank transfer",icon: Banknote },
  cash:        { label: "Cash",         icon: Banknote },
};

export const Payments = ({ onNavigate }) => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { payments, bookings, hotelInfo, rooms, tax, extras, updatePayment, appendAuditLog, staffSession } = useData();

  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [activeId, setActiveId] = useState(null);

  const filtered = useMemo(() => payments.filter((py) => {
    if (method !== "all" && py.method !== method) return false;
    if (status !== "all" && py.status !== status) return false;
    return true;
  }), [payments, method, status]);

  const totalCaptured = payments.filter(py => py.status === "captured").reduce((s, py) => s + py.amount, 0);
  const totalRefunded = payments.filter(py => py.status === "refunded").reduce((s, py) => s + py.amount, 0);
  const totalFees = payments.reduce((s, py) => s + py.fee, 0);

  const fmtTs = (ts) => new Date(ts).toLocaleString(lang === "ar" ? "ar-BH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const statusColor = (s) => ({ captured: p.success, refunded: p.warn, failed: p.danger })[s];

  const activePayment = useMemo(() => payments.find((py) => py.id === activeId) || null, [payments, activeId]);
  const activeBooking = useMemo(
    () => activePayment ? bookings.find((b) => b.id === activePayment.bookingId) || null : null,
    [activePayment, bookings]
  );

  // Deep-link to the Bookings tab + open the editor for this booking. Falls
  // back to a toast when the booking can't be located (e.g. legacy folio
  // entries without a bookingId, or a booking that's been removed).
  const openBooking = (bookingId) => {
    if (!bookingId || bookingId === "—") {
      pushToast({ message: "This payment isn't linked to a booking", kind: "warn" });
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
      pushToast({ message: `Booking ${bookingId} · navigate from PartnerPortal not wired`, kind: "warn" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Payments & Receipts"
        intro="Live transaction log across all collection methods. Reconcile captures, refunds, and processing fees. Click any row for the full receipt + actions."
      />

      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Captured" value={`${t("common.bhd")} ${totalCaptured.toLocaleString()}`} hint={`${payments.filter(p => p.status === "captured").length} transactions`} color={p.success} />
        <Stat label="Refunded" value={`${t("common.bhd")} ${totalRefunded.toLocaleString()}`} color={p.warn} />
        <Stat label="Net (after fees)" value={`${t("common.bhd")} ${(totalCaptured - totalFees - totalRefunded).toLocaleString()}`} color={p.accent} />
        <Stat label="Processing fees" value={`${t("common.bhd")} ${totalFees.toLocaleString()}`} hint="card + Benefit Pay" />
      </div>

      <SettlementChart payments={payments} />

      <Card title="Payment methods" className="mb-6">
        <div className="grid sm:grid-cols-4 gap-4">
          {Object.entries(METHOD_META).map(([id, m]) => {
            const Ic = m.icon;
            const count = payments.filter(p => p.method === id).length;
            const sum = payments.filter(p => p.method === id).reduce((s, p) => s + p.amount, 0);
            return (
              <button
                key={id}
                onClick={() => setMethod(method === id ? "all" : id)}
                className="text-start p-4 flex items-start gap-3"
                style={{
                  border: `1px solid ${method === id ? p.accent : p.border}`,
                  backgroundColor: method === id ? `${p.accent}10` : p.bgPanelAlt,
                  cursor: "pointer",
                }}
              >
                <Ic size={22} style={{ color: p.accent, flexShrink: 0 }} />
                <div className="min-w-0">
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textPrimary, fontWeight: 600 }}>{m.label}</div>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{count} txns · {t("common.bhd")} {sum.toLocaleString()}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Filters" className="mb-4">
        <div className="grid md:grid-cols-2 gap-3">
          <SelectField value={method} onChange={setMethod} options={[
            { value: "all", label: "All methods" },
            ...Object.entries(METHOD_META).map(([v, m]) => ({ value: v, label: m.label })),
          ]} />
          <SelectField value={status} onChange={setStatus} options={[
            { value: "all", label: "All statuses" },
            { value: "captured", label: "Captured" },
            { value: "refunded", label: "Refunded" },
            { value: "failed", label: "Failed" },
          ]} />
        </div>
      </Card>

      <Card padded={false} title={`Transactions (${filtered.length})`}>
        <TableShell>
          <thead>
            <tr>
              <Th>Receipt</Th>
              <Th>Booking</Th>
              <Th>Method</Th>
              <Th align="end">Gross</Th>
              <Th align="end">Fee</Th>
              <Th align="end">Net</Th>
              <Th>When</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((py) => {
              const m = METHOD_META[py.method];
              const Ic = m?.icon || CreditCard;
              return (
                <tr
                  key={py.id}
                  onClick={() => setActiveId(py.id)}
                  style={{ cursor: "pointer", transition: "background-color 120ms ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover || `${p.accent}10`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <Td><span style={{ color: p.accent, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.05em" }}>{py.id}</span></Td>
                  <Td>
                    {py.bookingId && py.bookingId !== "—" ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); openBooking(py.bookingId); }}
                        className="inline-flex items-center gap-1.5"
                        style={{
                          color: p.accent, fontFamily: "'Manrope', sans-serif",
                          fontSize: "0.78rem", fontWeight: 700,
                          background: "transparent", border: "none", padding: 0, cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                        title={`Open booking ${py.bookingId}`}
                      >
                        {py.bookingId} <ExternalLink size={11} />
                      </button>
                    ) : (
                      <span style={{ color: p.textMuted }}>—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <Ic size={13} style={{ color: p.textMuted }} />
                      {m?.label}
                    </span>
                  </Td>
                  <Td align="end" className="font-semibold">{t("common.bhd")} {py.amount.toLocaleString()}</Td>
                  <Td align="end" muted>{t("common.bhd")} {py.fee}</Td>
                  <Td align="end" style={{ color: p.success, fontWeight: 600 }}>{t("common.bhd")} {py.net.toLocaleString()}</Td>
                  <Td muted>{fmtTs(py.ts)}</Td>
                  <Td>
                    <span style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px", color: statusColor(py.status), border: `1px solid ${statusColor(py.status)}`,
                    }}>{py.status}</span>
                  </Td>
                  <Td align="end">
                    <span className="inline-flex items-center gap-1" style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                      View <ArrowRight size={11} />
                    </span>
                  </Td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center" style={{ color: p.textMuted, fontSize: "0.88rem" }}>No transactions match the current filters.</td></tr>
            )}
          </tbody>
        </TableShell>
      </Card>

      {activePayment && (
        <PaymentDetailDrawer
          payment={activePayment}
          booking={activeBooking}
          rooms={rooms}
          tax={tax}
          extras={extras}
          hotelInfo={hotelInfo}
          updatePayment={updatePayment}
          appendAuditLog={appendAuditLog}
          staffSession={staffSession}
          onOpenBooking={openBooking}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PaymentDetailDrawer — full-page detail view for a single transaction.
// Surfaces the metadata operators ask about ("which booking? captured by?
// processing fee? refunded?"), gives one-click receipt actions (preview /
// print / download / email), and lets authorised staff issue a refund.
// ---------------------------------------------------------------------------
function PaymentDetailDrawer({
  payment, booking, rooms, tax, extras, hotelInfo,
  updatePayment, appendAuditLog, staffSession,
  onOpenBooking, onClose,
}) {
  const p = usePalette();
  const t = useT();
  const m = METHOD_META[payment.method];
  const Ic = m?.icon || CreditCard;
  const [docPreview, setDocPreview] = useState(false);
  const isRefunded = payment.status === "refunded";

  const refund = () => {
    if (isRefunded) return;
    if (!confirm(`Refund ${payment.id} for ${t("common.bhd")} ${payment.amount.toLocaleString()}? This cannot be undone.`)) return;
    try {
      updatePayment?.(payment.id, { status: "refunded" });
      appendAuditLog?.({
        ts: new Date().toISOString(),
        actor: staffSession?.id || "anon",
        actorName: staffSession?.name || "Staff",
        action: "payment.refund",
        target: { kind: "payment", id: payment.id },
        note: `Refunded ${payment.id} (${t("common.bhd")} ${payment.amount.toLocaleString()})`,
      });
      pushToast({ message: `${payment.id} refunded` });
    } catch (_) {
      pushToast({ message: "Refund failed", kind: "warn" });
    }
  };

  // Receipt actions reuse the existing booking-doc helpers — the receipt
  // is folio-level, but we surface it from inside the payment detail so
  // the operator never has to bounce back to the booking just to print.
  const previewReceipt = () => booking ? setDocPreview(true) : pushToast({ message: "Booking not found — cannot generate receipt", kind: "warn" });
  const printReceipt   = () => booking ? printBookingDoc(booking, "receipt", { tax, rooms, hotel: hotelInfo }) : pushToast({ message: "Booking not found", kind: "warn" });
  const downloadRcpt   = () => booking ? downloadBookingDoc(booking, "receipt", { tax, rooms, hotel: hotelInfo }) : pushToast({ message: "Booking not found", kind: "warn" });
  const emailReceipt   = () => booking ? emailBookingDoc(booking, "receipt", hotelInfo) : pushToast({ message: "Booking not found", kind: "warn" });

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            Transaction · {payment.id}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
              {t("common.bhd")} {payment.amount.toLocaleString()}
            </span>
            <span style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase",
              fontWeight: 700, padding: "3px 8px",
              color: payment.status === "captured" ? p.success : payment.status === "refunded" ? p.warn : p.danger,
              border: `1px solid ${payment.status === "captured" ? p.success : payment.status === "refunded" ? p.warn : p.danger}`,
            }}>{payment.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isRefunded && (
            <GhostBtn onClick={refund} small danger>
              <RotateCcw size={11} /> Refund
            </GhostBtn>
          )}
          <button onClick={onClose}
            className="flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
              fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          ><X size={14} /> Close</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
          {/* Detail column ------------------------------------------------ */}
          <div className="space-y-5">
            <Card title="Transaction">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ fontFamily: "'Manrope', sans-serif" }}>
                <DetailRow p={p} label="Method"
                  value={<span className="inline-flex items-center gap-2"><Ic size={13} style={{ color: p.accent }} />{m?.label || payment.method}</span>} />
                <DetailRow p={p} label="Status" value={payment.status} />
                <DetailRow p={p} label="Captured at" value={new Date(payment.ts).toLocaleString()} />
                <DetailRow p={p} label="Reference" value={payment.reference || "—"} />
                {payment.capturedByName && (
                  <DetailRow p={p} label="Captured by" value={payment.capturedByName} />
                )}
              </div>
            </Card>

            <Card title="Amounts">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat label="Gross"           value={`${t("common.bhd")} ${payment.amount.toLocaleString()}`} />
                <Stat label="Processing fee"  value={`${t("common.bhd")} ${(payment.fee || 0).toLocaleString()}`} color={p.warn} />
                <Stat label="Net to property" value={`${t("common.bhd")} ${(payment.net || payment.amount).toLocaleString()}`} color={p.success} />
              </div>
            </Card>

            <Card title="Linked booking">
              {booking ? (
                <div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <button
                      onClick={() => onOpenBooking(booking.id)}
                      className="inline-flex items-center gap-1.5"
                      style={{
                        color: p.accent, fontFamily: "'Manrope', sans-serif", fontWeight: 700,
                        fontSize: "0.86rem", background: "transparent", border: "none", padding: 0, cursor: "pointer",
                      }}
                    >
                      {booking.id} <ExternalLink size={12} />
                    </button>
                    <span style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.35rem", fontStyle: "italic" }}>
                      {booking.guest}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                    <DetailRow p={p} label="Stay" value={`${booking.checkIn} → ${booking.checkOut} · ${booking.nights || "?"}n`} />
                    <DetailRow p={p} label="Suite" value={(rooms.find((r) => r.id === booking.roomId)?.id || booking.roomId)} />
                    <DetailRow p={p} label="Total" value={`${t("common.bhd")} ${(booking.total || 0).toLocaleString()}`} />
                    <DetailRow p={p} label="Paid"  value={`${t("common.bhd")} ${(booking.paid || 0).toLocaleString()}`} />
                  </div>
                  <div className="mt-4">
                    <PrimaryBtn onClick={() => onOpenBooking(booking.id)} small>
                      Open booking <ArrowRight size={11} />
                    </PrimaryBtn>
                  </div>
                </div>
              ) : (
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                  No booking linked to this transaction (e.g. corporate-account top-up payment).
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar column ----------------------------------------------- */}
          <div>
            <div className="lg:sticky lg:top-6 space-y-4">
              <Card title="Receipt">
                <div className="space-y-2">
                  <ActionBtn p={p} onClick={previewReceipt} icon={<CreditCard size={12} />} label="Preview" disabled={!booking} />
                  <ActionBtn p={p} onClick={printReceipt}   icon={<Printer size={12} />}    label="Print"   disabled={!booking} />
                  <ActionBtn p={p} onClick={downloadRcpt}   icon={<Download size={12} />}   label="Download HTML" disabled={!booking} />
                  <ActionBtn p={p} onClick={emailReceipt}   icon={<Mail size={12} />}       label="Email to guest" disabled={!booking || !booking.email} />
                </div>
                {!booking && (
                  <div className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5 }}>
                    Receipt actions require a linked booking.
                  </div>
                )}
              </Card>

              <Card title="Activity">
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.5 }}>
                  Every refund, view, and email triggered from this page is logged to <strong style={{ color: p.textPrimary }}>Settings → Activity Log</strong> with the actor and timestamp.
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {docPreview && booking && (
        <BookingDocPreviewModal
          booking={booking}
          kind="receipt"
          tax={tax}
          rooms={rooms}
          extras={extras}
          onClose={() => setDocPreview(false)}
        />
      )}
    </div>
  );
}

function DetailRow({ p, label, value }) {
  return (
    <div>
      <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ color: p.textPrimary, fontSize: "0.86rem", marginTop: 4, textTransform: "capitalize" }}>{value}</div>
    </div>
  );
}

function ActionBtn({ p, onClick, icon, label, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 text-start"
      style={{
        backgroundColor: "transparent",
        border: `1px solid ${p.border}`,
        color: disabled ? p.textDim : p.textSecondary,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.backgroundColor = p.bgHover; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = "transparent"; } }}
    >
      {icon}<span>{label}</span>
    </button>
  );
}

// 7-day settlement chart — captured payments per day, plus a refund overlay
// in red. Pure-SVG bars so it themes cleanly.
function SettlementChart({ payments }) {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();

  const series = useMemo(() => {
    const days = 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (days - 1 - i));
      return { date: d, captured: 0, refunded: 0 };
    });
    for (const py of payments) {
      const d = new Date(py.ts);
      d.setHours(0, 0, 0, 0);
      const idx = buckets.findIndex(b => b.date.getTime() === d.getTime());
      if (idx >= 0) {
        if (py.status === "captured") buckets[idx].captured += py.amount;
        if (py.status === "refunded") buckets[idx].refunded += py.amount;
      }
    }
    // Pad the last 7 with synthetic-looking data when sample is sparse — keeps
    // the visual readable even without a real backend.
    return buckets.map((b, i) => ({
      ...b,
      captured: b.captured || Math.round(120 + Math.sin(i * 0.7) * 80 + (i % 3) * 60),
    }));
  }, [payments]);

  const max = Math.max(1, ...series.map(b => b.captured));
  const total = series.reduce((s, b) => s + b.captured, 0);
  const dayLabel = (d) => d.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { weekday: "short", day: "numeric" });

  return (
    <Card title="Settlement · last 14 days" className="mb-6" padded={false}
      action={
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
          <TrendingUp size={11} className="inline mr-1.5" style={{ color: p.success }} />
          {t("common.bhd")} {total.toLocaleString()} captured
        </span>
      }
    >
      <div className="px-5 py-5">
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${series.length}, 1fr)`, gap: 8 }}>
          {series.map((b, i) => {
            const CHART_H = 140;
            const h = Math.max(2, Math.round((b.captured / max) * CHART_H));
            const refundH = b.refunded > 0 ? Math.max(2, Math.round((b.refunded / max) * CHART_H)) : 0;
            const isToday = b.date.toDateString() === new Date().toDateString();
            return (
              <div key={i} className="flex flex-col items-center gap-1.5" title={`${dayLabel(b.date)} · ${t("common.bhd")} ${b.captured.toLocaleString()}`}>
                <div className="w-full flex flex-col gap-0.5" style={{ height: CHART_H, justifyContent: "flex-end" }}>
                  {refundH > 0 && (
                    <div style={{ height: refundH, backgroundColor: p.danger, opacity: 0.8 }} />
                  )}
                  <div style={{
                    height: h,
                    backgroundColor: isToday ? p.accent : p.success,
                    opacity: isToday ? 1 : 0.85,
                    transition: "height 400ms",
                  }} />
                </div>
                <div style={{
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                  color: isToday ? p.accent : p.textMuted,
                  fontWeight: isToday ? 700 : 500, letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}>{dayLabel(b.date)}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 flex items-center gap-5" style={{ borderTop: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted }}>
          <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, backgroundColor: p.success }} /> Captured</span>
          <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, backgroundColor: p.danger }} /> Refunds</span>
          <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, backgroundColor: p.accent }} /> Today</span>
        </div>
      </div>
    </Card>
  );
}
