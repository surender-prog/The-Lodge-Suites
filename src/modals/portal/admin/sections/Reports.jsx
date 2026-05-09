import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarRange, ChevronLeft, ChevronRight, Coins, DoorOpen,
  Download, ExternalLink, Printer, RefreshCcw, TrendingDown, TrendingUp, Wrench,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { MAINTENANCE_CATEGORIES, useData, applyTaxes } from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th,
} from "../ui.jsx";
import { ActivitiesDashboard } from "../../ActivityHub.jsx";

// ---------------------------------------------------------------------------
// Reports — three operations dashboards in one section: Activities, Revenue
// and forward-looking Availability. Each has its own period selector, KPI
// strip, time-series chart, detail table, and a CSV download. All data is
// derived live from the bookings / payments / invoices / calendar stores so
// the reports stay in sync with whatever the operator just edited.
// ---------------------------------------------------------------------------

// Property inventory — derived from room types. The hotel has 72 suites; the
// split below totals 72 (30 + 24 + 12 + 6). When the inventory model lands
// on the Rooms section as an editable field, swap this for room.inventory.
const ROOM_INVENTORY = {
  studio: 30, "one-bed": 24, "two-bed": 12, "three-bed": 6,
};
const TOTAL_INVENTORY = Object.values(ROOM_INVENTORY).reduce((s, n) => s + n, 0);

// Hotel marketing-friendly labels; rooms.id is the canonical key.
const ROOM_LABEL = {
  studio: "Studio", "one-bed": "One-bed", "two-bed": "Two-bed", "three-bed": "Three-bed",
};

// Vivid source palette mirrored from the bookings/dashboard sections.
const SOURCE_COLOR = {
  direct:    "#16A34A",
  ota:       "#2563EB",
  corporate: "#D97706",
  agent:     "#7C3AED",
  walk:      "#0891B2",
};
const SOURCE_LABEL = {
  direct:    "Direct",
  ota:       "OTA",
  corporate: "Corporate",
  agent:     "Travel agent",
  walk:      "Walk-in",
};

// ─── Utilities ────────────────────────────────────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isoOf = (d) => startOfDay(d).toISOString().slice(0, 10);
const dayMs = 86400000;
const fmtShort = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtFull  = (d) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtMonth = (d) => new Date(d).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

// Sum over an array safely.
const sum = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// Build a CSV string and trigger a browser download.
const downloadCsv = (rows, filename) => {
  if (!rows.length) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  pushToast({ message: `Downloaded · ${filename}` });
};

// Periods used by Activities + Revenue reports.
const PERIODS = [
  { id: "day",   label: "Daily",   days: 1,  hint: "Today" },
  { id: "week",  label: "Weekly",  days: 7,  hint: "Last 7 days" },
  { id: "month", label: "Monthly", days: 30, hint: "Last 30 days" },
];

// Horizons used by Availability calendar.
const HORIZONS = [
  { id: "30",  label: "Next 30 days",  days: 30 },
  { id: "90",  label: "Next 3 months", days: 90 },
  { id: "180", label: "Next 6 months", days: 180 },
];

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------
//
// Reports surfaces three lenses on the same operational data:
//   • Activities — sales follow-up dashboard (also available as a top-level
//     tab; the same `ActivitiesDashboard` component is shared)
//   • Revenue — financial performance for the chosen period
//   • Availability — forward-looking inventory heatmap
// ---------------------------------------------------------------------------
export const Reports = () => {
  const p = usePalette();
  const [section, setSection] = useState("activities");

  return (
    <div>
      <PageHeader
        title="Reports"
        intro="Operational, financial and forward-looking reports drawn live from bookings, folios, payments, calendar overrides and sales activities."
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        <SubTab active={section === "activities"}    onClick={() => setSection("activities")}    icon={Activity}      p={p}>Activities</SubTab>
        <SubTab active={section === "revenue"}       onClick={() => setSection("revenue")}       icon={Coins}         p={p}>Revenue</SubTab>
        <SubTab active={section === "availability"}  onClick={() => setSection("availability")}  icon={CalendarRange} p={p}>Availability</SubTab>
        <SubTab active={section === "maintenance"}   onClick={() => setSection("maintenance")}   icon={Wrench}        p={p}>Maintenance</SubTab>
      </div>

      {section === "activities" && (
        <div>
          <div className="mb-5 p-4 flex items-center justify-between gap-3 flex-wrap" style={{
            backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`,
            borderInlineStart: `3px solid ${p.accent}`,
          }}>
            <div className="flex items-center gap-2">
              <Activity size={14} style={{ color: p.accent }} />
              <span style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}>
                Sales activity now also lives at the top level —
                <span style={{ color: p.accent, fontWeight: 700, marginInlineStart: 4 }}>Partner Portal → Activities</span>
                — for one-click access during the day.
              </span>
            </div>
          </div>
          <ActivitiesDashboard embedded />
        </div>
      )}
      {section === "revenue"      && <RevenueReport />}
      {section === "availability" && <AvailabilityReport />}
      {section === "maintenance"  && <MaintenanceReport />}
    </div>
  );
};

function SubTab({ active, onClick, icon: Icon, children, p }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 transition-colors"
      style={{
        padding: "0.65rem 1.1rem",
        backgroundColor: active ? p.accent : "transparent",
        color: active ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
        border: `1px solid ${active ? p.accent : p.border}`,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
        letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = p.border;  e.currentTarget.style.color = p.textSecondary; } }}
    >
      <Icon size={13} /> {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Period selector — shared by Activities + Revenue reports.
// ---------------------------------------------------------------------------
function PeriodPicker({ period, setPeriod, anchor, setAnchor, p }) {
  const stepDays = period.days;
  const move = (delta) => setAnchor(addDays(anchor, delta * stepDays));
  const goToday = () => setAnchor(new Date());
  const isToday = isoOf(anchor) === isoOf(new Date());

  // Compute the visible window so the operator can see exactly what's
  // included in the current report.
  const windowStart = period.id === "day" ? anchor : addDays(anchor, -(period.days - 1));
  const windowEnd   = anchor;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PERIODS.map((pp) => (
        <button
          key={pp.id}
          onClick={() => setPeriod(pp)}
          style={{
            padding: "0.4rem 0.9rem",
            backgroundColor: period.id === pp.id ? `${p.accent}1F` : "transparent",
            border: `1px solid ${period.id === pp.id ? p.accent : p.border}`,
            color: period.id === pp.id ? p.accent : p.textSecondary,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {pp.label}
        </button>
      ))}
      <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "0 8px" }}>·</span>
      <button onClick={() => move(-1)} title={`Previous ${period.label.toLowerCase()}`} style={navBtn(p)}><ChevronLeft size={14} /></button>
      <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600, minWidth: 220, textAlign: "center" }}>
        {period.id === "day" ? fmtFull(windowEnd) : `${fmtShort(windowStart)} → ${fmtShort(windowEnd)}`}
      </span>
      <button onClick={() => move(1)} title={`Next ${period.label.toLowerCase()}`} style={navBtn(p)}><ChevronRight size={14} /></button>
      {!isToday && (
        <button onClick={goToday} title="Snap back to today"
          style={{
            padding: "0.4rem 0.85rem", backgroundColor: "transparent",
            border: `1px solid ${p.border}`, color: p.textMuted,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        >Today</button>
      )}
    </div>
  );
}

const navBtn = (p) => ({
  padding: "0.4rem 0.55rem", backgroundColor: "transparent",
  border: `1px solid ${p.border}`, color: p.textMuted, cursor: "pointer",
});

// ---------------------------------------------------------------------------
// RevenueReport — financial performance for the same period model.
// Shows total room revenue, ADR, occupancy %, RevPAR, source/suite mix,
// payments captured, refunds, and outstanding receivables.
// ---------------------------------------------------------------------------
function RevenueReport() {
  const p = usePalette();
  const { bookings, payments, invoices, tax } = useData();
  const [period, setPeriod] = useState(PERIODS[2]);
  const [anchor, setAnchor] = useState(() => new Date());

  const windowStart = useMemo(
    () => period.id === "day" ? startOfDay(anchor) : startOfDay(addDays(anchor, -(period.days - 1))),
    [period, anchor]
  );
  const windowEnd = useMemo(() => startOfDay(anchor), [anchor]);

  // For each booking, compute the portion of its stay that falls inside
  // the selected window — that's the room-night value we count.
  const recognised = useMemo(() => {
    const winStartMs = windowStart.getTime();
    const winEndMs   = windowEnd.getTime() + dayMs;
    const out = [];
    bookings.forEach((b) => {
      if (b.status === "cancelled") return;
      const ci = startOfDay(new Date(b.checkIn)).getTime();
      const co = startOfDay(new Date(b.checkOut)).getTime();
      const overlapStart = Math.max(ci, winStartMs);
      const overlapEnd   = Math.min(co, winEndMs);
      const overlapNights = Math.max(0, Math.round((overlapEnd - overlapStart) / dayMs));
      if (overlapNights === 0) return;
      const rate = b.rate || (b.total / Math.max(1, b.nights || 1));
      out.push({
        booking: b,
        nights: overlapNights,
        revenue: rate * overlapNights,
        rate,
      });
    });
    return out;
  }, [bookings, windowStart, windowEnd]);

  const totals = useMemo(() => {
    const roomRevenue = sum(recognised, (r) => r.revenue);
    const roomNights  = sum(recognised, (r) => r.nights);
    const adr         = roomNights > 0 ? roomRevenue / roomNights : 0;
    const availableNights = TOTAL_INVENTORY * period.days;
    const occupancy   = availableNights > 0 ? roomNights / availableNights : 0;
    const revpar      = availableNights > 0 ? roomRevenue / availableNights : 0;

    // Tax estimate from the active tax model — applied to the recognised
    // room revenue. When taxes are inclusive in stored prices we still
    // surface the implied tax for the ledger.
    const taxBreakdown = applyTaxes(roomRevenue, tax, Math.max(1, roomNights));
    const taxCollected = taxBreakdown.totalTax;

    // Source split
    const bySource = {};
    recognised.forEach((r) => {
      const k = r.booking.source;
      if (!bySource[k]) bySource[k] = { revenue: 0, nights: 0 };
      bySource[k].revenue += r.revenue;
      bySource[k].nights  += r.nights;
    });

    // Suite split
    const byRoom = {};
    recognised.forEach((r) => {
      const k = r.booking.roomId;
      if (!byRoom[k]) byRoom[k] = { revenue: 0, nights: 0 };
      byRoom[k].revenue += r.revenue;
      byRoom[k].nights  += r.nights;
    });

    return { roomRevenue, roomNights, adr, occupancy, revpar, taxCollected, bySource, byRoom };
  }, [recognised, tax, period]);

  // Payments + refunds inside the window (uses payments.ts)
  const paymentStats = useMemo(() => {
    const inWin = payments.filter((p) => {
      if (!p.ts) return false;
      const t = startOfDay(new Date(p.ts)).getTime();
      return t >= windowStart.getTime() && t <= windowEnd.getTime();
    });
    const captured = inWin.filter((p) => p.status === "captured");
    const refunded = inWin.filter((p) => p.status === "refunded");
    return {
      captured: sum(captured, (p) => p.amount),
      refunded: sum(refunded, (p) => p.amount),
      fees:     sum(captured, (p) => p.fee),
      count:    inWin.length,
    };
  }, [payments, windowStart, windowEnd]);

  const receivables = useMemo(() => {
    const open = invoices.filter((i) => i.status !== "paid");
    return {
      total: sum(open, (i) => i.amount - (i.paid || 0)),
      count: open.length,
      overdue: open.filter((i) => i.status === "overdue").length,
    };
  }, [invoices]);

  // Daily revenue trend
  const trend = useMemo(() => {
    const days = period.days;
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(addDays(windowStart, i)).getTime();
      let revenue = 0;
      let nights  = 0;
      recognised.forEach((r) => {
        const ci = startOfDay(new Date(r.booking.checkIn)).getTime();
        const co = startOfDay(new Date(r.booking.checkOut)).getTime();
        if (d >= ci && d < co) {
          revenue += r.rate;
          nights  += 1;
        }
      });
      out.push({ date: new Date(d).toISOString().slice(0, 10), revenue, nights });
    }
    return out;
  }, [recognised, windowStart, period]);

  const peak = Math.max(1, ...trend.map((t) => t.revenue));

  // CSV export
  const exportRows = () => trend.map((t) => ({
    date: t.date,
    room_nights: t.nights,
    occupancy_pct: ((t.nights / TOTAL_INVENTORY) * 100).toFixed(1),
    revenue_bhd: t.revenue.toFixed(3),
  }));
  const downloadCsvFile = () =>
    downloadCsv(exportRows(), `revenue-${period.id}-${isoOf(anchor)}.csv`);

  return (
    <div>
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PeriodPicker period={period} setPeriod={setPeriod} anchor={anchor} setAnchor={setAnchor} p={p} />
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={downloadCsvFile}><Download size={11} /> CSV</GhostBtn>
            <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
          </div>
        </div>
      </Card>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Stat label="Room revenue" value={`BHD ${totals.roomRevenue.toFixed(0)}`} hint={`${totals.roomNights} room-nights`} color={p.accent} />
        <Stat label="ADR"          value={`BHD ${totals.adr.toFixed(2)}`}        hint="Average daily rate" />
        <Stat label="Occupancy"    value={`${(totals.occupancy * 100).toFixed(1)}%`} hint={`${totals.roomNights} of ${TOTAL_INVENTORY * period.days} nights`} color={totals.occupancy >= 0.7 ? p.success : totals.occupancy >= 0.5 ? p.warn : p.textPrimary} />
        <Stat label="RevPAR"       value={`BHD ${totals.revpar.toFixed(2)}`}     hint="Revenue / available room" />
      </div>

      {/* Cash KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Payments captured" value={`BHD ${paymentStats.captured.toFixed(0)}`} hint={`${paymentStats.count} txn · fees BHD ${paymentStats.fees.toFixed(2)}`} color={p.success} />
        <Stat label="Refunds"            value={`BHD ${paymentStats.refunded.toFixed(0)}`} hint={paymentStats.refunded === 0 ? "None this period" : "Reversed payments"} color={paymentStats.refunded > 0 ? p.danger : p.textPrimary} />
        <Stat label="Tax collected"      value={`BHD ${totals.taxCollected.toFixed(0)}`}   hint="Estimated from active tax model" />
        <Stat label="Outstanding A/R"    value={`BHD ${receivables.total.toFixed(0)}`}     hint={`${receivables.count} open · ${receivables.overdue} overdue`} color={receivables.overdue > 0 ? p.danger : p.warn} />
      </div>

      {/* Daily revenue trend + Source/Suite mix */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="Daily revenue trend" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1.5" style={{ minHeight: 200 }}>
              {trend.map((t) => {
                const h = (t.revenue / peak) * 160;
                return (
                  <div key={t.date} className="flex flex-col items-center" style={{ flex: 1, minWidth: 22 }}>
                    <div title={`BHD ${t.revenue.toFixed(0)} · ${t.nights} nights`}
                      style={{ width: "100%", height: h || 1, backgroundColor: p.accent }} />
                    <div style={{
                      color: p.textMuted, fontSize: "0.6rem",
                      fontFamily: "'Manrope', sans-serif", marginTop: 4,
                      transform: trend.length > 14 ? "rotate(-50deg)" : "none",
                      transformOrigin: "center top", whiteSpace: "nowrap",
                    }}>{fmtShort(t.date)}</div>
                    {trend.length <= 14 && (
                      <div style={{ color: p.textPrimary, fontSize: "0.7rem", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {t.revenue > 0 ? Math.round(t.revenue) : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
              <Legend color={p.accent} label="Recognised room revenue · BHD per day" />
            </div>
          </div>
        </Card>

        <Card title="Channel mix · revenue">
          {Object.keys(totals.bySource).length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No bookings touched this window.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(totals.bySource).sort((a, b) => b[1].revenue - a[1].revenue).map(([src, v]) => {
                const pct = totals.roomRevenue > 0 ? Math.round((v.revenue / totals.roomRevenue) * 100) : 0;
                const c = SOURCE_COLOR[src] || p.accent;
                return (
                  <div key={src}>
                    <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                      <span style={{ color: p.textPrimary, fontWeight: 600 }}>{SOURCE_LABEL[src] || src}</span>
                      <span style={{ color: p.textMuted }}>BHD {v.revenue.toFixed(0)} · {pct}%</span>
                    </div>
                    <div className="h-1.5" style={{ backgroundColor: p.border }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: c }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Suite mix */}
      <Card title="Suite mix" padded={false} className="mb-5">
        <TableShell>
          <thead>
            <tr>
              <Th>Suite</Th>
              <Th align="end">Inventory</Th>
              <Th align="end">Nights sold</Th>
              <Th align="end">Occupancy</Th>
              <Th align="end">Revenue</Th>
              <Th align="end">ADR</Th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(ROOM_INVENTORY).map(([roomId, units]) => {
              const v = totals.byRoom[roomId] || { revenue: 0, nights: 0 };
              const occ = v.nights / Math.max(1, units * period.days);
              const adr = v.nights > 0 ? v.revenue / v.nights : 0;
              return (
                <tr key={roomId}>
                  <Td>{ROOM_LABEL[roomId] || roomId}</Td>
                  <Td align="end" muted>{units}</Td>
                  <Td align="end">{v.nights}</Td>
                  <Td align="end" style={{ color: occ >= 0.7 ? p.success : occ >= 0.5 ? p.warn : p.textPrimary, fontWeight: 600 }}>
                    {(occ * 100).toFixed(1)}%
                  </Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 600 }}>BHD {v.revenue.toFixed(0)}</Td>
                  <Td align="end" muted>BHD {adr.toFixed(2)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AvailabilityReport — forward-looking inventory heatmap. Per-day, per-room
// occupancy for 30 / 90 / 180 days. Stop-sale overrides come from the
// calendar store; bookings count toward "sold" cells. Hover to see the
// breakdown; click a date to scroll-to that day in the calendar section
// (deep-link is wired by the parent if available).
// ---------------------------------------------------------------------------
function AvailabilityReport() {
  const p = usePalette();
  const { bookings, calendar } = useData();
  const [horizon, setHorizon] = useState(HORIZONS[1]);
  const start = startOfDay(new Date());
  const end   = addDays(start, horizon.days - 1);

  // Compute per-day, per-room occupancy ----------------------------------
  const grid = useMemo(() => {
    const days = [];
    for (let i = 0; i < horizon.days; i++) {
      const d = startOfDay(addDays(start, i));
      const iso = d.toISOString().slice(0, 10);
      const ts  = d.getTime();
      const row = { date: iso, byRoom: {}, total: { sold: 0, units: 0, stopSale: false } };
      Object.entries(ROOM_INVENTORY).forEach(([roomId, units]) => {
        // Sold count = bookings on this date for this room type
        const sold = bookings.filter((b) => {
          if (b.status === "cancelled") return false;
          if (b.roomId !== roomId) return false;
          const ci = startOfDay(new Date(b.checkIn)).getTime();
          const co = startOfDay(new Date(b.checkOut)).getTime();
          return ts >= ci && ts < co;
        }).length;
        // Stop-sale override (any cell for this room+date with stopSale=true)
        const ov = calendar[`${roomId}|${iso}`];
        const stopSale = !!ov?.stopSale;
        const rate     = ov?.rate;
        row.byRoom[roomId] = { sold, units, stopSale, rate };
        row.total.sold  += sold;
        row.total.units += units;
        if (stopSale) row.total.stopSale = true;
      });
      days.push(row);
    }
    return days;
  }, [bookings, calendar, horizon]);

  const summary = useMemo(() => {
    const totalAvailableNights = grid.reduce((s, d) => s + (d.total.units - d.total.sold), 0);
    const totalSoldNights      = grid.reduce((s, d) => s + d.total.sold, 0);
    const totalNightsCapacity  = grid.reduce((s, d) => s + d.total.units, 0);
    const peak = grid.reduce((m, d) => {
      const occ = d.total.sold / d.total.units;
      return occ > m.occ ? { date: d.date, occ } : m;
    }, { date: "", occ: 0 });
    const trough = grid.reduce((m, d) => {
      const occ = d.total.sold / d.total.units;
      return occ < m.occ ? { date: d.date, occ } : m;
    }, { date: "", occ: 1 });
    const stopSaleDays = grid.filter((d) => d.total.stopSale).length;
    const sellOutDays  = grid.filter((d) => d.total.sold >= d.total.units).length;
    return {
      totalAvailableNights, totalSoldNights, totalNightsCapacity,
      avgOcc: totalSoldNights / Math.max(1, totalNightsCapacity),
      peak, trough, stopSaleDays, sellOutDays,
    };
  }, [grid]);

  // Cell colour — green high availability → red sold-out
  const cellColor = (sold, units, stopSale) => {
    if (stopSale) return { bg: `${p.danger}25`, fg: p.danger };
    if (units === 0) return { bg: p.bgPanelAlt, fg: p.textMuted };
    const occ = sold / units;
    if (sold >= units)   return { bg: `${p.danger}30`, fg: p.danger };
    if (occ >= 0.85)     return { bg: `${p.warn}30`,   fg: p.warn };
    if (occ >= 0.6)      return { bg: `${p.warn}15`,   fg: p.textPrimary };
    if (occ >= 0.3)      return { bg: `${p.success}15`,fg: p.textPrimary };
    return { bg: `${p.success}25`, fg: p.success };
  };

  // Group by month for sticky header
  const months = useMemo(() => {
    const out = [];
    grid.forEach((d) => {
      const dt = new Date(d.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      let m = out.find((x) => x.key === key);
      if (!m) { m = { key, label: fmtMonth(dt), days: [] }; out.push(m); }
      m.days.push(d);
    });
    return out;
  }, [grid]);

  // CSV export
  const exportRows = () => {
    const rows = [];
    grid.forEach((d) => {
      Object.entries(d.byRoom).forEach(([roomId, v]) => {
        rows.push({
          date: d.date,
          room: ROOM_LABEL[roomId] || roomId,
          inventory: v.units,
          sold: v.sold,
          available: v.units - v.sold,
          occupancy_pct: ((v.sold / v.units) * 100).toFixed(1),
          stop_sale: v.stopSale ? "yes" : "no",
          override_rate: v.rate ?? "",
        });
      });
    });
    return rows;
  };
  const downloadCsvFile = () =>
    downloadCsv(exportRows(), `availability-${horizon.id}d-${isoOf(start)}.csv`);

  const cellWidth = horizon.days <= 30 ? 44 : horizon.days <= 90 ? 28 : 20;

  return (
    <div>
      {/* Horizon selector + actions */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {HORIZONS.map((h) => (
              <button
                key={h.id}
                onClick={() => setHorizon(h)}
                style={{
                  padding: "0.4rem 0.9rem",
                  backgroundColor: horizon.id === h.id ? `${p.accent}1F` : "transparent",
                  border: `1px solid ${horizon.id === h.id ? p.accent : p.border}`,
                  color: horizon.id === h.id ? p.accent : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {h.label}
              </button>
            ))}
            <span style={{ color: p.textMuted, fontSize: "0.7rem", padding: "0 8px" }}>·</span>
            <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 600 }}>
              {fmtShort(start)} → {fmtShort(end)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={downloadCsvFile}><Download size={11} /> CSV</GhostBtn>
            <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
          </div>
        </div>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Avg occupancy"        value={`${(summary.avgOcc * 100).toFixed(1)}%`} hint={`${summary.totalSoldNights.toLocaleString()} of ${summary.totalNightsCapacity.toLocaleString()} nights`} color={summary.avgOcc >= 0.7 ? p.success : summary.avgOcc >= 0.5 ? p.warn : p.textPrimary} />
        <Stat label="Available nights"     value={summary.totalAvailableNights.toLocaleString()} hint={`Across ${horizon.days} days`} color={p.accent} />
        <Stat label="Peak day"             value={summary.peak.date ? `${(summary.peak.occ * 100).toFixed(0)}%` : "—"} hint={summary.peak.date ? fmtShort(summary.peak.date) : ""} color={p.warn} />
        <Stat label="Sell-out days"        value={summary.sellOutDays} hint={summary.stopSaleDays > 0 ? `${summary.stopSaleDays} stop-sale days` : "No stop-sale days"} color={summary.sellOutDays > 0 ? p.danger : p.success} />
      </div>

      {/* Heatmap */}
      <Card title={`Availability heatmap · ${horizon.label}`} padded={false} className="mb-5">
        <div className="overflow-x-auto" style={{ backgroundColor: p.bgPanel }}>
          <div style={{ display: "inline-block", minWidth: "100%" }}>
            {/* Month strip */}
            <div className="flex" style={{ borderBottom: `1px solid ${p.border}`, position: "sticky", top: 0, backgroundColor: p.bgPanelAlt, zIndex: 1 }}>
              <div style={{
                width: 110, minWidth: 110, padding: "0.5rem 0.7rem",
                color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                borderInlineEnd: `1px solid ${p.border}`,
              }}>Suite / Date</div>
              {months.map((m) => (
                <div key={m.key} style={{
                  width: m.days.length * cellWidth,
                  padding: "0.5rem 0.7rem",
                  color: p.accent, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  borderInlineEnd: `1px solid ${p.border}`,
                  whiteSpace: "nowrap",
                }}>
                  {m.label} <span style={{ color: p.textMuted, fontWeight: 500, marginInlineStart: 6 }}>· {m.days.length}d</span>
                </div>
              ))}
            </div>

            {/* Day numbers */}
            <div className="flex" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
              <div style={{
                width: 110, minWidth: 110, padding: "0.4rem 0.7rem",
                borderInlineEnd: `1px solid ${p.border}`,
                color: p.textMuted, fontSize: "0.7rem",
              }}>Day</div>
              {grid.map((d) => {
                const dt = new Date(d.date);
                const dow = dt.getDay();
                const isWeekend = dow === 5 || dow === 6;  // Fri/Sat in BH
                return (
                  <div key={d.date} title={fmtFull(d.date)} style={{
                    width: cellWidth, minWidth: cellWidth,
                    padding: "0.3rem 0",
                    color: isWeekend ? p.warn : p.textMuted,
                    fontSize: cellWidth >= 28 ? "0.68rem" : "0.6rem",
                    fontFamily: "'Manrope', sans-serif", fontWeight: isWeekend ? 700 : 500,
                    textAlign: "center", borderInlineEnd: `1px solid ${p.border}`,
                  }}>
                    {dt.getDate()}
                  </div>
                );
              })}
            </div>

            {/* Per-room rows */}
            {Object.entries(ROOM_INVENTORY).map(([roomId, units]) => (
              <div key={roomId} className="flex" style={{ borderBottom: `1px solid ${p.border}` }}>
                <div style={{
                  width: 110, minWidth: 110, padding: "0.55rem 0.7rem",
                  borderInlineEnd: `1px solid ${p.border}`,
                  color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "0.95rem",
                  display: "flex", flexDirection: "column", justifyContent: "center",
                }}>
                  <div>{ROOM_LABEL[roomId] || roomId}</div>
                  <div style={{ color: p.textMuted, fontSize: "0.66rem", fontFamily: "'Manrope', sans-serif" }}>
                    {units} suites
                  </div>
                </div>
                {grid.map((d) => {
                  const v = d.byRoom[roomId];
                  const c = cellColor(v.sold, v.units, v.stopSale);
                  const occ = v.sold / Math.max(1, v.units);
                  return (
                    <div
                      key={d.date}
                      title={`${fmtFull(d.date)} · ${ROOM_LABEL[roomId]} · sold ${v.sold}/${v.units} (${(occ * 100).toFixed(0)}%)${v.stopSale ? " · STOP-SALE" : ""}${v.rate ? ` · rate BHD ${v.rate}` : ""}`}
                      style={{
                        width: cellWidth, minWidth: cellWidth, height: 36,
                        backgroundColor: c.bg, color: c.fg,
                        borderInlineEnd: `1px solid ${p.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "'Manrope', sans-serif", fontSize: cellWidth >= 28 ? "0.68rem" : "0.58rem",
                        fontWeight: 700, fontVariantNumeric: "tabular-nums",
                        position: "relative",
                      }}
                    >
                      {v.stopSale ? "✕" : v.sold === 0 ? "" : `${v.units - v.sold}`}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Totals row */}
            <div className="flex" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
              <div style={{
                width: 110, minWidth: 110, padding: "0.55rem 0.7rem",
                borderInlineEnd: `1px solid ${p.border}`,
                color: p.accent, fontFamily: "'Manrope', sans-serif",
                fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              }}>
                Total · {TOTAL_INVENTORY}
              </div>
              {grid.map((d) => {
                const c = cellColor(d.total.sold, d.total.units, d.total.stopSale);
                const avail = d.total.units - d.total.sold;
                return (
                  <div
                    key={d.date}
                    title={`${fmtFull(d.date)} · ${avail} of ${d.total.units} available`}
                    style={{
                      width: cellWidth, minWidth: cellWidth, height: 36,
                      backgroundColor: c.bg, color: c.fg,
                      borderInlineEnd: `1px solid ${p.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Manrope', sans-serif", fontSize: cellWidth >= 28 ? "0.7rem" : "0.6rem",
                      fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {avail}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-5 py-3 flex items-center gap-5 flex-wrap" style={{ borderTop: `1px solid ${p.border}` }}>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Legend
          </span>
          <SwatchLegend bg={`${p.success}25`} fg={p.success} label="High availability (< 30% sold)" />
          <SwatchLegend bg={`${p.success}15`} fg={p.textPrimary} label="Healthy (30–60%)" />
          <SwatchLegend bg={`${p.warn}15`}    fg={p.textPrimary} label="Filling (60–85%)" />
          <SwatchLegend bg={`${p.warn}30`}    fg={p.warn} label="Tight (85–99%)" />
          <SwatchLegend bg={`${p.danger}30`}  fg={p.danger} label="Sold out" />
          <SwatchLegend bg={`${p.danger}25`}  fg={p.danger} label="✕ Stop-sale" />
        </div>
      </Card>

      {/* Forecast hints */}
      <Card title="Forecast notes" className="mb-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <ForecastTile
            icon={TrendingUp} color={p.warn}
            label="Peak demand"
            value={summary.peak.date ? fmtFull(summary.peak.date) : "—"}
            hint={summary.peak.date ? `${(summary.peak.occ * 100).toFixed(0)}% occupancy. Consider rate uplift / yield rules.` : "Not enough data yet."}
            p={p}
          />
          <ForecastTile
            icon={TrendingDown} color={p.success}
            label="Lowest demand"
            value={summary.trough.date ? fmtFull(summary.trough.date) : "—"}
            hint={summary.trough.date ? `${(summary.trough.occ * 100).toFixed(0)}% occupancy. Push promotions or last-minute deals.` : ""}
            p={p}
          />
          <ForecastTile
            icon={DoorOpen} color={p.accent}
            label="Sell-out days"
            value={summary.sellOutDays}
            hint={summary.sellOutDays > 0 ? "Rooms close to fully booked — push waitlist offers." : "No sell-out days in horizon."}
            p={p}
          />
          <ForecastTile
            icon={RefreshCcw} color={p.danger}
            label="Stop-sale days"
            value={summary.stopSaleDays}
            hint={summary.stopSaleDays > 0 ? "Calendar overrides applied — review before re-opening." : "Inventory is fully open."}
            p={p}
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MaintenanceReport — operational spend tracking. Surfaces total cost broken
// down by category, vendor, and (the headline view) **per room** so the GM
// can see which suites are bleeding money. All figures derived live from
// the maintenanceJobs store; only completed jobs count toward spend.
// ---------------------------------------------------------------------------
const MAINT_CAT_COLOR = Object.fromEntries(MAINTENANCE_CATEGORIES.map((c) => [c.id, c.color]));
const MAINT_CAT_LABEL = Object.fromEntries(MAINTENANCE_CATEGORIES.map((c) => [c.id, c.label]));
const ROOM_TYPE_LABEL = { studio: "Studio", "one-bed": "One-bed", "two-bed": "Two-bed", "three-bed": "Three-bed" };

function MaintenanceReport() {
  const p = usePalette();
  const { maintenanceJobs, maintenanceVendors, roomUnits } = useData();
  const [period, setPeriod] = useState(PERIODS[2]);   // monthly default
  const [anchor, setAnchor] = useState(() => new Date());
  // Pagination + drill-down state for the room-wise table
  const [pageSize, setPageSize] = useState(10);
  const [roomHistoryFor, setRoomHistoryFor] = useState(null);
  // Pagination + drill-down state for the vendor-wise table
  const [vendorPageSize, setVendorPageSize] = useState(10);
  const [vendorHistoryFor, setVendorHistoryFor] = useState(null);
  // KPI tile drill-down — opens a job list scoped to whichever tile was clicked.
  const [jobListScope, setJobListScope] = useState(null);

  const windowStart = useMemo(
    () => period.id === "day" ? startOfDay(anchor) : startOfDay(addDays(anchor, -(period.days - 1))),
    [period, anchor]
  );
  const windowEnd = useMemo(() => startOfDay(anchor), [anchor]);

  // Spend events: only completed jobs whose completedAt falls in the window.
  // (Jobs in progress add no spend yet.)
  const inWindow = useMemo(() => {
    return (maintenanceJobs || [])
      .filter((j) => j.status === "completed" && j.completedAt)
      .filter((j) => {
        const t = startOfDay(new Date(j.completedAt)).getTime();
        return t >= windowStart.getTime() && t <= windowEnd.getTime();
      });
  }, [maintenanceJobs, windowStart, windowEnd]);

  // KPIs ────────────────────────────────────────────────────────────────
  const totalSpend     = sum(inWindow, (j) => j.totalCost);
  const partsSpend     = sum(inWindow, (j) => j.productCost);
  const laborSpend     = sum(inWindow, (j) => j.laborCost);
  const jobCount       = inWindow.length;
  const avgPerJob      = jobCount > 0 ? totalSpend / jobCount : 0;
  const openCount      = (maintenanceJobs || []).filter((j) => j.status !== "completed" && j.status !== "cancelled").length;
  const criticalOpen   = (maintenanceJobs || []).filter((j) => j.priority === "critical" && j.status !== "completed" && j.status !== "cancelled").length;

  // Avg resolution hours
  const resolutions = inWindow
    .map((j) => (j.reportedAt && j.completedAt) ? (new Date(j.completedAt) - new Date(j.reportedAt)) / 3600000 : null)
    .filter((h) => h != null && h > 0);
  const avgResolution = resolutions.length > 0 ? resolutions.reduce((s, h) => s + h, 0) / resolutions.length : 0;

  // By category ─────────────────────────────────────────────────────────
  const byCategory = useMemo(() => {
    const out = {};
    MAINTENANCE_CATEGORIES.forEach((c) => { out[c.id] = { id: c.id, label: c.label, color: c.color, total: 0, parts: 0, labor: 0, count: 0 }; });
    inWindow.forEach((j) => {
      const k = out[j.category];
      if (!k) return;
      k.total += j.totalCost || 0;
      k.parts += j.productCost || 0;
      k.labor += j.laborCost || 0;
      k.count += 1;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [inWindow]);

  const topCategory = byCategory.find((c) => c.total > 0);

  // By vendor ───────────────────────────────────────────────────────────
  const byVendor = useMemo(() => {
    const out = {};
    inWindow.forEach((j) => {
      const id = j.vendorId || "—";
      if (!out[id]) {
        const v = (maintenanceVendors || []).find((x) => x.id === j.vendorId);
        out[id] = { id, name: v?.name || j.vendorName || "Unassigned", total: 0, count: 0 };
      }
      out[id].total += j.totalCost || 0;
      out[id].count += 1;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [inWindow, maintenanceVendors]);

  // Room-wise expense ──────────────────────────────────────────────────
  // Group by unit number (free-text) and enrich with the canonical roomUnits
  // registry when possible (room type, floor). Sort by total spend desc.
  const byRoom = useMemo(() => {
    const out = {};
    inWindow.forEach((j) => {
      const num = (j.unitNumber || "").trim();
      const key = num || "(no unit)";
      if (!out[key]) {
        const unit = (roomUnits || []).find((u) => u.number === num) || null;
        out[key] = {
          key, number: num,
          roomTypeId: j.roomId || unit?.roomTypeId,
          floor: unit?.floor,
          unitId: unit?.id,
          jobCount: 0, parts: 0, labor: 0, total: 0,
          categories: new Set(),
          lastJobAt: null, lastJobTitle: null, lastCategory: null,
        };
      }
      const r = out[key];
      r.jobCount += 1;
      r.parts += j.productCost || 0;
      r.labor += j.laborCost   || 0;
      r.total += j.totalCost   || 0;
      r.categories.add(j.category);
      const completedAt = j.completedAt || j.reportedAt;
      if (completedAt && (!r.lastJobAt || new Date(completedAt) > new Date(r.lastJobAt))) {
        r.lastJobAt = completedAt;
        r.lastJobTitle = j.title;
        r.lastCategory = j.category;
      }
    });
    return Object.values(out)
      .map((r) => ({ ...r, categories: Array.from(r.categories) }))
      .sort((a, b) => b.total - a.total);
  }, [inWindow, roomUnits]);

  // Daily spend trend ───────────────────────────────────────────────────
  const trend = useMemo(() => {
    const days = period.days;
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(addDays(windowStart, i));
      const iso = d.toISOString().slice(0, 10);
      const t = d.getTime();
      let parts = 0, labor = 0, count = 0;
      inWindow.forEach((j) => {
        const jt = startOfDay(new Date(j.completedAt)).getTime();
        if (jt === t) {
          parts += j.productCost || 0;
          labor += j.laborCost   || 0;
          count += 1;
        }
      });
      out.push({ date: iso, parts, labor, total: parts + labor, count });
    }
    return out;
  }, [inWindow, windowStart, period]);
  const peakDay = Math.max(1, ...trend.map((t) => t.total));

  // Detailed job rows for the bottom table ─────────────────────────────
  const detailRows = useMemo(() => {
    return inWindow.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [inWindow]);

  // CSV export — room-wise expense (the headline view)
  const exportRoomWiseCsv = () => {
    if (byRoom.length === 0) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
    const rows = byRoom.map((r) => ({
      unit_number: r.number || "",
      room_type:   ROOM_TYPE_LABEL[r.roomTypeId] || r.roomTypeId || "",
      floor:       r.floor ?? "",
      jobs:        r.jobCount,
      parts_bhd:   r.parts.toFixed(3),
      labor_bhd:   r.labor.toFixed(3),
      total_bhd:   r.total.toFixed(3),
      categories:  r.categories.map((c) => MAINT_CAT_LABEL[c] || c).join(" · "),
      last_job:    r.lastJobAt ? fmtShort(r.lastJobAt) : "",
      last_title:  r.lastJobTitle || "",
    }));
    downloadCsv(rows, `maintenance-rooms-${period.id}-${isoOf(anchor)}.csv`);
  };

  const exportJobsCsv = () => {
    if (detailRows.length === 0) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
    const rows = detailRows.map((j) => ({
      id: j.id,
      completed: j.completedAt || "",
      unit: j.unitNumber || "",
      room_type: ROOM_TYPE_LABEL[j.roomId] || j.roomId || "",
      title: j.title,
      category: MAINT_CAT_LABEL[j.category] || j.category,
      vendor: j.vendorName || "",
      parts_bhd: (j.productCost || 0).toFixed(3),
      labor_hours: j.laborHours || 0,
      labor_bhd: (j.laborCost || 0).toFixed(3),
      total_bhd: (j.totalCost || 0).toFixed(3),
    }));
    downloadCsv(rows, `maintenance-jobs-${period.id}-${isoOf(anchor)}.csv`);
  };

  return (
    <div>
      {/* Header bar */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PeriodPicker period={period} setPeriod={setPeriod} anchor={anchor} setAnchor={setAnchor} p={p} />
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={exportRoomWiseCsv}><Download size={11} /> Room-wise CSV</GhostBtn>
            <GhostBtn small onClick={exportJobsCsv}><Download size={11} /> Jobs CSV</GhostBtn>
            <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
          </div>
        </div>
      </Card>

      {/* KPI strip — every tile drills into the relevant job list */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat
          label="Total spend"
          value={`BHD ${totalSpend.toFixed(0)}`}
          hint={`Parts BHD ${partsSpend.toFixed(0)} · Labor BHD ${laborSpend.toFixed(0)}`}
          color={p.accent}
          ctaLabel="View jobs"
          onClick={() => setJobListScope({
            kind: "completed",
            eyebrow: `${period.label} · ${fmtShort(windowStart)} → ${fmtShort(windowEnd)}`,
            title: `Completed jobs · BHD ${totalSpend.toFixed(0)} total`,
            sortBy: "cost",
          })}
        />
        <Stat
          label="Jobs completed"
          value={jobCount}
          hint={jobCount > 0 ? `Avg cost BHD ${avgPerJob.toFixed(0)}` : "—"}
          ctaLabel="View jobs"
          onClick={() => setJobListScope({
            kind: "completed",
            eyebrow: `${period.label} · ${fmtShort(windowStart)} → ${fmtShort(windowEnd)}`,
            title: `Completed jobs · ${jobCount}`,
            sortBy: "date",
          })}
        />
        <Stat
          label="Avg resolution"
          value={avgResolution > 0 ? `${avgResolution.toFixed(1)}h` : "—"}
          hint="Reported → completed"
          ctaLabel="View jobs"
          onClick={() => setJobListScope({
            kind: "resolution",
            eyebrow: `${period.label} · ${fmtShort(windowStart)} → ${fmtShort(windowEnd)}`,
            title: `Resolution timing · ${jobCount} job${jobCount === 1 ? "" : "s"}`,
            sortBy: "resolution",
          })}
        />
        <Stat
          label="Open jobs"
          value={openCount}
          hint={criticalOpen > 0 ? `${criticalOpen} critical` : "No criticals"}
          color={criticalOpen > 0 ? p.danger : p.textPrimary}
          ctaLabel="View open"
          onClick={() => setJobListScope({
            kind: "open",
            eyebrow: "All open & in-progress jobs",
            title: `Open jobs · ${openCount}${criticalOpen > 0 ? ` · ${criticalOpen} critical` : ""}`,
            sortBy: "priority",
          })}
        />
        <Stat
          label="Top category"
          value={topCategory ? topCategory.label : "—"}
          hint={topCategory ? `BHD ${topCategory.total.toFixed(0)} · ${topCategory.count} jobs` : "No spend"}
          color={topCategory ? topCategory.color : p.textMuted}
          ctaLabel={topCategory ? "View jobs" : undefined}
          onClick={topCategory ? () => setJobListScope({
            kind: "category",
            categoryId: topCategory.id,
            eyebrow: `${period.label} · ${fmtShort(windowStart)} → ${fmtShort(windowEnd)}`,
            title: `${topCategory.label} jobs · BHD ${topCategory.total.toFixed(0)}`,
            sortBy: "cost",
          }) : undefined}
        />
      </div>

      {/* KPI tile drill-down — generic job list drawer */}
      {jobListScope && (
        <JobListDrawer
          scope={jobListScope}
          inWindow={inWindow}
          windowStart={windowStart}
          windowEnd={windowEnd}
          onClose={() => setJobListScope(null)}
        />
      )}

      {/* Spend trend + Category mix */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="Daily spend trend · BHD" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1.5" style={{ minHeight: 200 }}>
              {trend.map((t) => {
                const partsH = (t.parts / peakDay) * 160;
                const laborH = (t.labor / peakDay) * 160;
                return (
                  <div key={t.date} className="flex flex-col items-center" style={{ flex: 1, minWidth: 22 }}>
                    <div className="flex flex-col-reverse" style={{ height: 160, justifyContent: "flex-end", width: "100%" }}>
                      <div title={`Parts: BHD ${t.parts.toFixed(0)}`} style={{ width: "100%", height: partsH, backgroundColor: p.accent }} />
                      <div title={`Labor: BHD ${t.labor.toFixed(0)}`} style={{ width: "100%", height: laborH, backgroundColor: p.accentDeep }} />
                    </div>
                    <div style={{
                      color: p.textMuted, fontSize: "0.6rem",
                      fontFamily: "'Manrope', sans-serif", marginTop: 4,
                      transform: trend.length > 14 ? "rotate(-50deg)" : "none",
                      transformOrigin: "center top", whiteSpace: "nowrap",
                    }}>{fmtShort(t.date)}</div>
                    {trend.length <= 14 && t.total > 0 && (
                      <div style={{ color: p.textPrimary, fontSize: "0.7rem", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(t.total)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
              <Legend color={p.accent}     label="Parts (products)" />
              <Legend color={p.accentDeep} label="Labor (manpower)" />
            </div>
          </div>
        </Card>

        <Card title="Spend by category">
          {byCategory.every((c) => c.total === 0) ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No completed maintenance jobs in this window.</div>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => {
                const pct = totalSpend > 0 ? Math.round((c.total / totalSpend) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                      <span style={{ color: p.textPrimary, fontWeight: 600 }}>{c.label}</span>
                      <span style={{ color: p.textMuted }}>BHD {c.total.toFixed(0)} · {pct}%</span>
                    </div>
                    <div className="h-1.5" style={{ backgroundColor: p.border }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Vendor breakdown + Quick numbers */}
      <Card
        title={`Vendor spend · ${byVendor.length}`}
        padded={false}
        className="mb-5"
        action={
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            Click a row to see the full job history of that vendor.
          </span>
        }
      >
        <TableShell>
          <thead>
            <tr>
              <Th>Rank</Th>
              <Th>Vendor</Th>
              <Th align="end">Jobs</Th>
              <Th align="end">Spend</Th>
              <Th align="end">Avg / job</Th>
              <Th align="end">Share</Th>
            </tr>
          </thead>
          <tbody>
            {byVendor.length === 0 && (
              <tr><Td className="px-3 py-6" align="center" muted colSpan={6}>No vendor invoices in this window.</Td></tr>
            )}
            {byVendor.slice(0, vendorPageSize).map((v, idx) => {
              const pct = totalSpend > 0 ? Math.round((v.total / totalSpend) * 100) : 0;
              const avg = v.count > 0 ? v.total / v.count : 0;
              const rankColor = idx === 0 ? p.danger : idx <= 2 ? p.warn : p.textMuted;
              return (
                <tr key={v.id}
                  style={{ cursor: "pointer", transition: "background-color 120ms" }}
                  onClick={() => setVendorHistoryFor(v)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Td>
                    <div className="inline-flex items-center justify-center" style={{
                      width: 28, height: 28, borderRadius: "50%",
                      backgroundColor: `${rankColor}1F`, color: rankColor,
                      border: `1px solid ${rankColor}`,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 800,
                    }}>{idx + 1}</div>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{v.name}</div>
                    {v.id !== "—" && <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{v.id}</div>}
                  </Td>
                  <Td align="end">{v.count}</Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 700 }}>BHD {v.total.toFixed(0)}</Td>
                  <Td align="end" muted>BHD {avg.toFixed(0)}</Td>
                  <Td align="end" muted>{pct}%</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>

        {/* Page-size footer */}
        {byVendor.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
              Showing <strong style={{ color: p.textPrimary }}>{Math.min(vendorPageSize, byVendor.length)}</strong> of {byVendor.length} vendors · ranked by total spend.
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Show
              </span>
              {[10, 20, 30, 50, 100, "all"].map((opt) => {
                const val = opt === "all" ? Number.MAX_SAFE_INTEGER : opt;
                const sel = vendorPageSize === val;
                const label = opt === "all" ? "All" : String(opt);
                return (
                  <button
                    key={String(opt)}
                    onClick={() => setVendorPageSize(val)}
                    style={{
                      padding: "0.3rem 0.7rem",
                      backgroundColor: sel ? `${p.accent}1F` : "transparent",
                      border: `1px solid ${sel ? p.accent : p.border}`,
                      color: sel ? p.accent : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Vendor history drawer — drill-down with full date filtering */}
      {vendorHistoryFor && (
        <VendorExpenseDrawer
          vendor={vendorHistoryFor}
          onClose={() => setVendorHistoryFor(null)}
        />
      )}

      {/* ── ROOM-WISE EXPENSE (headline view) ───────────────────────── */}
      <Card
        title={`Room-wise expense · ${byRoom.length} ${byRoom.length === 1 ? "room" : "rooms"} · sorted by spend`}
        padded={false}
        className="mb-5"
        action={
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            Click a row to see the full expense history of that room.
          </span>
        }
      >
        <TableShell>
          <thead>
            <tr>
              <Th>Rank</Th>
              <Th>Room</Th>
              <Th>Suite type</Th>
              <Th align="end">Floor</Th>
              <Th align="end">Jobs</Th>
              <Th>Categories touched</Th>
              <Th align="end">Parts</Th>
              <Th align="end">Labor</Th>
              <Th align="end">Total spend</Th>
              <Th>Last job</Th>
            </tr>
          </thead>
          <tbody>
            {byRoom.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted colSpan={10}>
                No room expenses recorded in this window. As maintenance jobs complete, totals will roll up here per unit.
              </Td></tr>
            )}
            {byRoom.slice(0, pageSize).map((r, idx) => {
              const pct = totalSpend > 0 ? Math.round((r.total / totalSpend) * 100) : 0;
              const rankColor = idx === 0 ? p.danger : idx <= 2 ? p.warn : p.textMuted;
              return (
                <tr key={r.key}
                  style={{ cursor: "pointer", transition: "background-color 120ms" }}
                  onClick={() => setRoomHistoryFor(r)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Td>
                    <div className="inline-flex items-center justify-center" style={{
                      width: 28, height: 28, borderRadius: "50%",
                      backgroundColor: `${rankColor}1F`, color: rankColor,
                      border: `1px solid ${rankColor}`,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 800,
                    }}>{idx + 1}</div>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem" }}>
                      #{r.number || "—"}
                    </div>
                    {r.unitId && (
                      <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>{r.unitId}</div>
                    )}
                  </Td>
                  <Td muted>{ROOM_TYPE_LABEL[r.roomTypeId] || r.roomTypeId || "—"}</Td>
                  <Td align="end" muted>{r.floor != null ? `Floor ${r.floor}` : "—"}</Td>
                  <Td align="end">{r.jobCount}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.categories.map((cid) => {
                        const color = MAINT_CAT_COLOR[cid] || p.accent;
                        return (
                          <span key={cid} style={{
                            color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
                            padding: "2px 7px", fontSize: "0.55rem", fontWeight: 700,
                            letterSpacing: "0.16em", textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}>{MAINT_CAT_LABEL[cid] || cid}</span>
                        );
                      })}
                    </div>
                  </Td>
                  <Td align="end" muted>BHD {r.parts.toFixed(0)}</Td>
                  <Td align="end" muted>BHD {r.labor.toFixed(0)}</Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    <div>BHD {r.total.toFixed(0)}</div>
                    {pct > 0 && <div style={{ color: p.textMuted, fontSize: "0.7rem", fontWeight: 400, marginTop: 2 }}>{pct}% of total</div>}
                  </Td>
                  <Td muted>
                    {r.lastJobAt ? (
                      <>
                        <div>{fmtShort(r.lastJobAt)}</div>
                        <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.lastJobTitle}
                        </div>
                      </>
                    ) : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>

        {/* Page-size footer */}
        {byRoom.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
              Showing <strong style={{ color: p.textPrimary }}>{Math.min(pageSize, byRoom.length)}</strong> of {byRoom.length} rooms · ranked by total spend.
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Show
              </span>
              {[10, 20, 30, 50, 100, "all"].map((opt) => {
                const val = opt === "all" ? Number.MAX_SAFE_INTEGER : opt;
                const sel = pageSize === val;
                const label = opt === "all" ? "All" : String(opt);
                return (
                  <button
                    key={String(opt)}
                    onClick={() => setPageSize(val)}
                    style={{
                      padding: "0.3rem 0.7rem",
                      backgroundColor: sel ? `${p.accent}1F` : "transparent",
                      border: `1px solid ${sel ? p.accent : p.border}`,
                      color: sel ? p.accent : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Room history drawer — drill-down with full date filtering */}
      {roomHistoryFor && (
        <RoomExpenseDrawer
          room={roomHistoryFor}
          onClose={() => setRoomHistoryFor(null)}
        />
      )}

      {/* Detailed job log */}
      <Card title={`Job detail · ${detailRows.length} completed in window`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>Completed</Th>
              <Th>Job</Th>
              <Th>Unit</Th>
              <Th>Category</Th>
              <Th>Vendor</Th>
              <Th align="end">Parts</Th>
              <Th align="end">Labor</Th>
              <Th align="end">Total</Th>
            </tr>
          </thead>
          <tbody>
            {detailRows.length === 0 && (
              <tr><Td className="px-3 py-6" align="center" muted colSpan={8}>No completed jobs in this window.</Td></tr>
            )}
            {detailRows.map((j) => {
              const color = MAINT_CAT_COLOR[j.category] || p.accent;
              return (
                <tr key={j.id}>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{fmtShort(j.completedAt)}</Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{j.title}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{j.id}</div>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>#{j.unitNumber || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{ROOM_TYPE_LABEL[j.roomId] || j.roomId}</div>
                  </Td>
                  <Td>
                    <span style={{
                      color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
                      padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                      letterSpacing: "0.16em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>{MAINT_CAT_LABEL[j.category] || j.category}</span>
                  </Td>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{j.vendorName || "—"}</Td>
                  <Td align="end" muted>BHD {(j.productCost || 0).toFixed(0)}</Td>
                  <Td align="end" muted>BHD {(j.laborCost || 0).toFixed(0)}</Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>BHD {(j.totalCost || 0).toFixed(0)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoomExpenseDrawer — full-page drill-down for a single room. Independent
// date filters (Daily / Weekly / Monthly / Custom) so the operator can dig
// back across the whole maintenance history of one unit, regardless of
// what the parent report's window is set to. Headline figures · category
// + vendor breakdown · spend trend · full job log · CSV export.
// ---------------------------------------------------------------------------
function RoomExpenseDrawer({ room, onClose }) {
  const p = usePalette();
  const { maintenanceJobs, maintenanceVendors, roomUnits } = useData();

  // Date filter — defaults to "All time" so the drawer shows the full
  // history of the room. The pills snap the from/to fields to canonical
  // ranges; "Custom" lets the operator pick any from/to.
  const todayIso = isoOf(new Date());
  const [rangeKind, setRangeKind] = useState("all"); // "day" | "week" | "month" | "custom" | "all"
  const [from, setFrom] = useState("");
  const [to,   setTo]   = useState(todayIso);

  // When the operator clicks a pill we snap the dates accordingly. Custom
  // leaves whatever's there.
  useEffect(() => {
    const today = new Date();
    if (rangeKind === "day") {
      setFrom(isoOf(today)); setTo(isoOf(today));
    } else if (rangeKind === "week") {
      setFrom(isoOf(addDays(today, -6))); setTo(isoOf(today));
    } else if (rangeKind === "month") {
      setFrom(isoOf(addDays(today, -29))); setTo(isoOf(today));
    } else if (rangeKind === "all") {
      setFrom(""); setTo(isoOf(today));
    }
  }, [rangeKind]);

  // Resolve the canonical room-unit metadata (suite type, floor, view…) by
  // matching the unitNumber against the registry.
  const liveUnit = useMemo(() => {
    if (room.unitId) return (roomUnits || []).find((u) => u.id === room.unitId);
    return (roomUnits || []).find((u) => u.number === room.number);
  }, [roomUnits, room]);

  // All completed jobs for this room number across history
  const allRoomJobs = useMemo(() => {
    return (maintenanceJobs || [])
      .filter((j) => j.unitNumber === room.number && j.status === "completed");
  }, [maintenanceJobs, room.number]);

  // Apply the date filter to get the "in-window" subset
  const filtered = useMemo(() => {
    return allRoomJobs.filter((j) => {
      if (!j.completedAt) return false;
      const d = (j.completedAt || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [allRoomJobs, from, to]);

  const totalSpend = sum(filtered, (j) => j.totalCost);
  const partsSpend = sum(filtered, (j) => j.productCost);
  const laborSpend = sum(filtered, (j) => j.laborCost);
  const jobCount   = filtered.length;
  const avgPerJob  = jobCount > 0 ? totalSpend / jobCount : 0;

  // All-time totals (for the secondary "vs all-time" hint)
  const allTimeTotal = sum(allRoomJobs, (j) => j.totalCost);
  const sharePctOfAllTime = allTimeTotal > 0 ? Math.round((totalSpend / allTimeTotal) * 100) : 0;

  // By category
  const byCategory = useMemo(() => {
    const out = {};
    filtered.forEach((j) => {
      if (!out[j.category]) out[j.category] = { id: j.category, total: 0, count: 0 };
      out[j.category].total += j.totalCost || 0;
      out[j.category].count += 1;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // By vendor
  const byVendor = useMemo(() => {
    const out = {};
    filtered.forEach((j) => {
      const id = j.vendorId || "—";
      if (!out[id]) {
        const v = (maintenanceVendors || []).find((x) => x.id === j.vendorId);
        out[id] = { id, name: v?.name || j.vendorName || "Unassigned", total: 0, count: 0 };
      }
      out[id].total += j.totalCost || 0;
      out[id].count += 1;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [filtered, maintenanceVendors]);

  // Daily trend across the filtered window (auto-scales to range length)
  const trend = useMemo(() => {
    if (!from && !to) return [];
    const start = from ? startOfDay(new Date(from)) : startOfDay(new Date(allRoomJobs[allRoomJobs.length - 1]?.completedAt || todayIso));
    const end   = to   ? startOfDay(new Date(to))   : startOfDay(new Date());
    const days  = Math.min(120, Math.max(1, Math.round((end - start) / dayMs) + 1));
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(addDays(start, i));
      const iso = d.toISOString().slice(0, 10);
      let parts = 0, labor = 0;
      filtered.forEach((j) => {
        if (isoOf(new Date(j.completedAt)) === iso) {
          parts += j.productCost || 0;
          labor += j.laborCost   || 0;
        }
      });
      out.push({ date: iso, parts, labor, total: parts + labor });
    }
    return out;
  }, [filtered, from, to, allRoomJobs, todayIso]);
  const peakDay = Math.max(1, ...trend.map((t) => t.total));

  // CSV export — just this room's filtered jobs
  const exportCsv = () => {
    if (filtered.length === 0) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
    const rows = filtered.map((j) => ({
      id: j.id,
      completed: j.completedAt || "",
      title: j.title,
      category: MAINT_CAT_LABEL[j.category] || j.category,
      subcategory: j.subcategory || "",
      area: j.area || "",
      vendor: j.vendorName || "",
      vendor_id: j.vendorId || "",
      parts_bhd: (j.productCost || 0).toFixed(3),
      labor_hours: j.laborHours || 0,
      labor_rate: j.laborRate || 0,
      labor_bhd: (j.laborCost || 0).toFixed(3),
      total_bhd: (j.totalCost || 0).toFixed(3),
      resolution: (j.resolution || "").replace(/\s+/g, " ").slice(0, 240),
    }));
    downloadCsv(rows, `room-${room.number}-expense-${from || "all"}_${to || "today"}.csv`);
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Room expense history · ${room.unitId || ""}`}
      title={`Room ${room.number}${liveUnit ? ` · ${ROOM_TYPE_LABEL[liveUnit.roomTypeId] || liveUnit.roomTypeId} · Floor ${liveUnit.floor}` : ""}`}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
            {jobCount} {jobCount === 1 ? "job" : "jobs"} in window · all-time total <strong style={{ color: p.textPrimary }}>BHD {allTimeTotal.toFixed(0)}</strong>
          </span>
          <div className="flex-1" />
          <GhostBtn small onClick={exportCsv}><Download size={11} /> Export CSV</GhostBtn>
          <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
        </>
      }
    >
      {/* Date-range pills + custom inputs */}
      <Card title="Date range" className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { id: "day",    label: "Today" },
            { id: "week",   label: "Last 7 days" },
            { id: "month",  label: "Last 30 days" },
            { id: "all",    label: "All time" },
            { id: "custom", label: "Custom" },
          ].map((opt) => {
            const sel = rangeKind === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setRangeKind(opt.id)}
                style={{
                  padding: "0.4rem 0.95rem",
                  backgroundColor: sel ? `${p.accent}1F` : "transparent",
                  border: `1px solid ${sel ? p.accent : p.border}`,
                  color: sel ? p.accent : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{opt.label}</button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormGroup label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setRangeKind("custom"); }}
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </FormGroup>
          <FormGroup label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setRangeKind("custom"); }}
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </FormGroup>
        </div>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat label="Total spend"    value={`BHD ${totalSpend.toFixed(0)}`} hint={`${sharePctOfAllTime}% of all-time spend`} color={p.accent} />
        <Stat label="Parts"          value={`BHD ${partsSpend.toFixed(0)}`} hint="Products bought" />
        <Stat label="Labor"          value={`BHD ${laborSpend.toFixed(0)}`} hint="Manpower hours" />
        <Stat label="Jobs completed" value={jobCount}                       hint={jobCount > 0 ? `Avg BHD ${avgPerJob.toFixed(0)}/job` : "—"} />
        <Stat label="All-time spend" value={`BHD ${allTimeTotal.toFixed(0)}`} hint={`${allRoomJobs.length} total job${allRoomJobs.length === 1 ? "" : "s"}`} />
      </div>

      {/* Trend + breakdowns */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="Spend timeline · BHD" className="lg:col-span-2">
          {trend.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>Pick a date range to see the spend timeline.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1.5" style={{ minHeight: 200 }}>
                {trend.map((t) => {
                  const partsH = (t.parts / peakDay) * 160;
                  const laborH = (t.labor / peakDay) * 160;
                  return (
                    <div key={t.date} className="flex flex-col items-center" style={{ flex: 1, minWidth: 18 }}>
                      <div className="flex flex-col-reverse" style={{ height: 160, justifyContent: "flex-end", width: "100%" }}>
                        <div title={`Parts: BHD ${t.parts.toFixed(0)}`} style={{ width: "100%", height: partsH, backgroundColor: p.accent }} />
                        <div title={`Labor: BHD ${t.labor.toFixed(0)}`} style={{ width: "100%", height: laborH, backgroundColor: p.accentDeep }} />
                      </div>
                      {trend.length <= 31 && (
                        <div style={{
                          color: p.textMuted, fontSize: "0.58rem",
                          fontFamily: "'Manrope', sans-serif", marginTop: 4,
                          transform: trend.length > 14 ? "rotate(-50deg)" : "none",
                          transformOrigin: "center top", whiteSpace: "nowrap",
                        }}>{fmtShort(t.date)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
                <Legend color={p.accent}     label="Parts" />
                <Legend color={p.accentDeep} label="Labor" />
              </div>
            </div>
          )}
        </Card>

        <Card title="Spend by category">
          {byCategory.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No spend in this window.</div>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => {
                const color = MAINT_CAT_COLOR[c.id] || p.accent;
                const pct = totalSpend > 0 ? Math.round((c.total / totalSpend) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                      <span style={{ color: p.textPrimary, fontWeight: 600 }}>{MAINT_CAT_LABEL[c.id] || c.id}</span>
                      <span style={{ color: p.textMuted }}>BHD {c.total.toFixed(0)} · {pct}%</span>
                    </div>
                    <div className="h-1.5" style={{ backgroundColor: p.border }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                      {c.count} job{c.count === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Vendor + Job log */}
      {byVendor.length > 0 && (
        <Card title={`Vendor spend · ${byVendor.length}`} padded={false} className="mb-5">
          <TableShell>
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th align="end">Jobs</Th>
                <Th align="end">Spend</Th>
                <Th align="end">Share</Th>
              </tr>
            </thead>
            <tbody>
              {byVendor.map((v) => {
                const pct = totalSpend > 0 ? Math.round((v.total / totalSpend) * 100) : 0;
                return (
                  <tr key={v.id}>
                    <Td>
                      <div style={{ color: p.textPrimary, fontWeight: 600 }}>{v.name}</div>
                      {v.id !== "—" && <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{v.id}</div>}
                    </Td>
                    <Td align="end">{v.count}</Td>
                    <Td align="end" style={{ color: p.accent, fontWeight: 700 }}>BHD {v.total.toFixed(0)}</Td>
                    <Td align="end" muted>{pct}%</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* Detailed job log for this room */}
      <Card title={`Job history · ${filtered.length} ${filtered.length === 1 ? "job" : "jobs"}`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>Completed</Th>
              <Th>Job</Th>
              <Th>Category</Th>
              <Th>Vendor</Th>
              <Th align="end">Parts</Th>
              <Th align="end">Labor</Th>
              <Th align="end">Total</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted colSpan={7}>
                No completed jobs for room {room.number} in this window.
              </Td></tr>
            )}
            {filtered.map((j) => {
              const color = MAINT_CAT_COLOR[j.category] || p.accent;
              return (
                <tr key={j.id}>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{fmtShort(j.completedAt)}</Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{j.title}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{j.id}</div>
                    {j.resolution && (
                      <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4, maxWidth: 460, lineHeight: 1.45 }}>
                        {j.resolution}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span style={{
                      color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
                      padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                      letterSpacing: "0.16em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>{MAINT_CAT_LABEL[j.category] || j.category}</span>
                  </Td>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{j.vendorName || "—"}</Td>
                  <Td align="end" muted>BHD {(j.productCost || 0).toFixed(0)}</Td>
                  <Td align="end" muted>BHD {(j.laborCost || 0).toFixed(0)}</Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>BHD {(j.totalCost || 0).toFixed(0)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// VendorExpenseDrawer — full-page drill-down for a single vendor. Mirror of
// RoomExpenseDrawer but pivoted on vendorId. Independent date filters
// (Today / Last 7 days / Last 30 days / Custom / All time), KPI strip,
// spend timeline (Parts vs Labor), category mix, room-by-room breakdown of
// where the vendor worked, full job log, and CSV export.
// ---------------------------------------------------------------------------
function VendorExpenseDrawer({ vendor, onClose }) {
  const p = usePalette();
  const { maintenanceJobs, maintenanceVendors, roomUnits } = useData();

  const todayIso = isoOf(new Date());
  const [rangeKind, setRangeKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to,   setTo]   = useState(todayIso);

  useEffect(() => {
    const today = new Date();
    if (rangeKind === "day") {
      setFrom(isoOf(today)); setTo(isoOf(today));
    } else if (rangeKind === "week") {
      setFrom(isoOf(addDays(today, -6))); setTo(isoOf(today));
    } else if (rangeKind === "month") {
      setFrom(isoOf(addDays(today, -29))); setTo(isoOf(today));
    } else if (rangeKind === "all") {
      setFrom(""); setTo(isoOf(today));
    }
  }, [rangeKind]);

  // Resolve full vendor record from the registry, when present.
  const liveVendor = useMemo(
    () => (maintenanceVendors || []).find((x) => x.id === vendor.id) || null,
    [maintenanceVendors, vendor.id]
  );

  // All completed jobs ever booked to this vendor.
  const allVendorJobs = useMemo(() => {
    return (maintenanceJobs || [])
      .filter((j) => j.status === "completed")
      .filter((j) => {
        if (vendor.id === "—") return !j.vendorId;
        return j.vendorId === vendor.id;
      });
  }, [maintenanceJobs, vendor.id]);

  // Apply the date filter.
  const filtered = useMemo(() => {
    return allVendorJobs.filter((j) => {
      if (!j.completedAt) return false;
      const d = (j.completedAt || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [allVendorJobs, from, to]);

  const totalSpend = sum(filtered, (j) => j.totalCost);
  const partsSpend = sum(filtered, (j) => j.productCost);
  const laborSpend = sum(filtered, (j) => j.laborCost);
  const jobCount   = filtered.length;
  const avgPerJob  = jobCount > 0 ? totalSpend / jobCount : 0;

  // All-time vendor totals (for "vs all-time" hint)
  const allTimeTotal = sum(allVendorJobs, (j) => j.totalCost);
  const sharePctOfAllTime = allTimeTotal > 0 ? Math.round((totalSpend / allTimeTotal) * 100) : 0;

  // Avg resolution hours (reportedAt → completedAt) for this vendor in window.
  const resolutionHours = filtered
    .map((j) => (j.reportedAt && j.completedAt) ? (new Date(j.completedAt) - new Date(j.reportedAt)) / 3600000 : null)
    .filter((h) => h != null && h > 0);
  const avgResolution = resolutionHours.length > 0
    ? resolutionHours.reduce((s, h) => s + h, 0) / resolutionHours.length
    : 0;

  // Category mix
  const byCategory = useMemo(() => {
    const out = {};
    filtered.forEach((j) => {
      if (!out[j.category]) out[j.category] = { id: j.category, total: 0, count: 0 };
      out[j.category].total += j.totalCost || 0;
      out[j.category].count += 1;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Rooms touched by this vendor
  const byRoom = useMemo(() => {
    const out = {};
    filtered.forEach((j) => {
      const num = (j.unitNumber || "").trim() || "(no unit)";
      if (!out[num]) {
        const unit = (roomUnits || []).find((u) => u.number === num) || null;
        out[num] = {
          number: num,
          roomTypeId: j.roomId || unit?.roomTypeId,
          floor: unit?.floor,
          unitId: unit?.id,
          total: 0, count: 0,
        };
      }
      out[num].total += j.totalCost || 0;
      out[num].count += 1;
    });
    return Object.values(out).sort((a, b) => b.total - a.total);
  }, [filtered, roomUnits]);

  // Daily trend across the window
  const trend = useMemo(() => {
    if (!from && !to) return [];
    const start = from ? startOfDay(new Date(from)) : startOfDay(new Date(allVendorJobs[allVendorJobs.length - 1]?.completedAt || todayIso));
    const end   = to   ? startOfDay(new Date(to))   : startOfDay(new Date());
    const days  = Math.min(120, Math.max(1, Math.round((end - start) / dayMs) + 1));
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(addDays(start, i));
      const iso = d.toISOString().slice(0, 10);
      let parts = 0, labor = 0;
      filtered.forEach((j) => {
        if (isoOf(new Date(j.completedAt)) === iso) {
          parts += j.productCost || 0;
          labor += j.laborCost   || 0;
        }
      });
      out.push({ date: iso, parts, labor, total: parts + labor });
    }
    return out;
  }, [filtered, from, to, allVendorJobs, todayIso]);
  const peakDay = Math.max(1, ...trend.map((t) => t.total));

  // CSV export — all filtered jobs for this vendor.
  const exportCsv = () => {
    if (filtered.length === 0) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
    const rows = filtered.map((j) => ({
      id: j.id,
      completed: j.completedAt || "",
      title: j.title,
      room: j.unitNumber || "",
      room_type: ROOM_TYPE_LABEL[j.roomId] || j.roomId || "",
      category: MAINT_CAT_LABEL[j.category] || j.category,
      subcategory: j.subcategory || "",
      area: j.area || "",
      parts_bhd: (j.productCost || 0).toFixed(3),
      labor_hours: j.laborHours || 0,
      labor_rate: j.laborRate || 0,
      labor_bhd: (j.laborCost || 0).toFixed(3),
      total_bhd: (j.totalCost || 0).toFixed(3),
      resolution: (j.resolution || "").replace(/\s+/g, " ").slice(0, 240),
    }));
    const safeName = (vendor.name || "vendor").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadCsv(rows, `vendor-${safeName}-expense-${from || "all"}_${to || "today"}.csv`);
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Vendor expense history${vendor.id !== "—" ? ` · ${vendor.id}` : ""}`}
      title={`${vendor.name}${liveVendor?.category ? ` · ${liveVendor.category}` : ""}`}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
            {jobCount} {jobCount === 1 ? "job" : "jobs"} in window · all-time total <strong style={{ color: p.textPrimary }}>BHD {allTimeTotal.toFixed(0)}</strong>
          </span>
          <div className="flex-1" />
          <GhostBtn small onClick={exportCsv}><Download size={11} /> Export CSV</GhostBtn>
          <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
        </>
      }
    >
      {/* Vendor profile chip */}
      {liveVendor && (
        <Card title="Vendor profile" className="mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Contact</div>
              <div style={{ color: p.textPrimary, marginTop: 4 }}>{liveVendor.contactName || "—"}</div>
            </div>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Phone</div>
              <div style={{ color: p.textPrimary, marginTop: 4 }}>{liveVendor.phone || "—"}</div>
            </div>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Email</div>
              <div style={{ color: p.textPrimary, marginTop: 4 }}>{liveVendor.email || "—"}</div>
            </div>
            <div>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>Status</div>
              <div style={{ color: liveVendor.active === false ? p.textMuted : p.success || p.accent, marginTop: 4, fontWeight: 600 }}>
                {liveVendor.active === false ? "Inactive" : "Active"}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Date-range pills + custom inputs */}
      <Card title="Date range" className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { id: "day",    label: "Today" },
            { id: "week",   label: "Last 7 days" },
            { id: "month",  label: "Last 30 days" },
            { id: "all",    label: "All time" },
            { id: "custom", label: "Custom" },
          ].map((opt) => {
            const sel = rangeKind === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setRangeKind(opt.id)}
                style={{
                  padding: "0.4rem 0.95rem",
                  backgroundColor: sel ? `${p.accent}1F` : "transparent",
                  border: `1px solid ${sel ? p.accent : p.border}`,
                  color: sel ? p.accent : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{opt.label}</button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormGroup label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setRangeKind("custom"); }}
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </FormGroup>
          <FormGroup label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setRangeKind("custom"); }}
              className="w-full outline-none"
              style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </FormGroup>
        </div>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat label="Total spend"    value={`BHD ${totalSpend.toFixed(0)}`} hint={`${sharePctOfAllTime}% of all-time spend`} color={p.accent} />
        <Stat label="Parts billed"   value={`BHD ${partsSpend.toFixed(0)}`} hint="Products supplied" />
        <Stat label="Labor billed"   value={`BHD ${laborSpend.toFixed(0)}`} hint="Manpower hours" />
        <Stat label="Jobs completed" value={jobCount}                       hint={jobCount > 0 ? `Avg BHD ${avgPerJob.toFixed(0)}/job` : "—"} />
        <Stat label="Avg resolution" value={avgResolution > 0 ? `${avgResolution.toFixed(1)} h` : "—"} hint="Reported → completed" />
      </div>

      {/* Trend + breakdowns */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="Spend timeline · BHD" className="lg:col-span-2">
          {trend.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>Pick a date range to see the spend timeline.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1.5" style={{ minHeight: 200 }}>
                {trend.map((t) => {
                  const partsH = (t.parts / peakDay) * 160;
                  const laborH = (t.labor / peakDay) * 160;
                  return (
                    <div key={t.date} className="flex flex-col items-center" style={{ flex: 1, minWidth: 18 }}>
                      <div className="flex flex-col-reverse" style={{ height: 160, justifyContent: "flex-end", width: "100%" }}>
                        <div title={`Parts: BHD ${t.parts.toFixed(0)}`} style={{ width: "100%", height: partsH, backgroundColor: p.accent }} />
                        <div title={`Labor: BHD ${t.labor.toFixed(0)}`} style={{ width: "100%", height: laborH, backgroundColor: p.accentDeep }} />
                      </div>
                      {trend.length <= 31 && (
                        <div style={{
                          color: p.textMuted, fontSize: "0.58rem",
                          fontFamily: "'Manrope', sans-serif", marginTop: 4,
                          transform: trend.length > 14 ? "rotate(-50deg)" : "none",
                          transformOrigin: "center top", whiteSpace: "nowrap",
                        }}>{fmtShort(t.date)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
                <Legend color={p.accent}     label="Parts" />
                <Legend color={p.accentDeep} label="Labor" />
              </div>
            </div>
          )}
        </Card>

        <Card title="Spend by category">
          {byCategory.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>No spend in this window.</div>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => {
                const color = MAINT_CAT_COLOR[c.id] || p.accent;
                const pct = totalSpend > 0 ? Math.round((c.total / totalSpend) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between mb-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                      <span style={{ color: p.textPrimary, fontWeight: 600 }}>{MAINT_CAT_LABEL[c.id] || c.id}</span>
                      <span style={{ color: p.textMuted }}>BHD {c.total.toFixed(0)} · {pct}%</span>
                    </div>
                    <div className="h-1.5" style={{ backgroundColor: p.border }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                      {c.count} job{c.count === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Rooms touched by this vendor */}
      {byRoom.length > 0 && (
        <Card title={`Rooms serviced · ${byRoom.length}`} padded={false} className="mb-5">
          <TableShell>
            <thead>
              <tr>
                <Th>Room</Th>
                <Th>Suite type</Th>
                <Th align="end">Floor</Th>
                <Th align="end">Jobs</Th>
                <Th align="end">Spend</Th>
                <Th align="end">Share</Th>
              </tr>
            </thead>
            <tbody>
              {byRoom.map((r) => {
                const pct = totalSpend > 0 ? Math.round((r.total / totalSpend) * 100) : 0;
                return (
                  <tr key={r.number}>
                    <Td>
                      <div style={{ color: p.textPrimary, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem" }}>
                        #{r.number}
                      </div>
                      {r.unitId && (
                        <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{r.unitId}</div>
                      )}
                    </Td>
                    <Td muted>{ROOM_TYPE_LABEL[r.roomTypeId] || r.roomTypeId || "—"}</Td>
                    <Td align="end" muted>{r.floor != null ? `Floor ${r.floor}` : "—"}</Td>
                    <Td align="end">{r.count}</Td>
                    <Td align="end" style={{ color: p.accent, fontWeight: 700 }}>BHD {r.total.toFixed(0)}</Td>
                    <Td align="end" muted>{pct}%</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* Detailed job log for this vendor */}
      <Card title={`Job history · ${filtered.length} ${filtered.length === 1 ? "job" : "jobs"}`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>Completed</Th>
              <Th>Job</Th>
              <Th>Room</Th>
              <Th>Category</Th>
              <Th align="end">Parts</Th>
              <Th align="end">Labor</Th>
              <Th align="end">Total</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted colSpan={7}>
                No completed jobs for {vendor.name} in this window.
              </Td></tr>
            )}
            {filtered.map((j) => {
              const color = MAINT_CAT_COLOR[j.category] || p.accent;
              return (
                <tr key={j.id}>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{fmtShort(j.completedAt)}</Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{j.title}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{j.id}</div>
                    {j.resolution && (
                      <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4, maxWidth: 460, lineHeight: 1.45 }}>
                        {j.resolution}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>#{j.unitNumber || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{ROOM_TYPE_LABEL[j.roomId] || j.roomId}</div>
                  </Td>
                  <Td>
                    <span style={{
                      color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
                      padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                      letterSpacing: "0.16em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>{MAINT_CAT_LABEL[j.category] || j.category}</span>
                  </Td>
                  <Td align="end" muted>BHD {(j.productCost || 0).toFixed(0)}</Td>
                  <Td align="end" muted>BHD {(j.laborCost || 0).toFixed(0)}</Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>BHD {(j.totalCost || 0).toFixed(0)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// JobListDrawer — generic full-page list of maintenance jobs scoped by which
// KPI tile was clicked. Supported scopes:
//   completed   — completed jobs in the parent window (sortBy=cost|date)
//   resolution  — completed jobs sorted by reported→completed time
//   open        — all open + in-progress jobs (any age, sorted by priority)
//   category    — completed jobs in a specific category
// Includes a sort dropdown, KPI summary, full job table with resolution
// hours, and CSV export. Designed to be re-usable across all KPI tiles.
// ---------------------------------------------------------------------------
function JobListDrawer({ scope, inWindow, windowStart, windowEnd, onClose }) {
  const p = usePalette();
  const { maintenanceJobs } = useData();

  const [sortBy, setSortBy] = useState(scope.sortBy || "date");

  // Resolve the list of jobs based on scope kind.
  const jobs = useMemo(() => {
    if (scope.kind === "open") {
      return (maintenanceJobs || []).filter(
        (j) => j.status !== "completed" && j.status !== "cancelled"
      );
    }
    if (scope.kind === "category") {
      return (inWindow || []).filter((j) => j.category === scope.categoryId);
    }
    // "completed" + "resolution" — both operate on the parent window's completed set
    return inWindow || [];
  }, [scope, inWindow, maintenanceJobs]);

  // Decorate with computed resolution hours so we can sort + display.
  const decorated = useMemo(() => {
    const PRIO_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
    return jobs.map((j) => {
      const resHours = (j.reportedAt && j.completedAt)
        ? (new Date(j.completedAt) - new Date(j.reportedAt)) / 3600000
        : null;
      const ageHours = j.reportedAt
        ? (Date.now() - new Date(j.reportedAt).getTime()) / 3600000
        : null;
      return { ...j, _resHours: resHours, _ageHours: ageHours, _prioRank: PRIO_RANK[j.priority] ?? 9 };
    });
  }, [jobs]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...decorated];
    if (sortBy === "cost") arr.sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0));
    else if (sortBy === "resolution") arr.sort((a, b) => (b._resHours || 0) - (a._resHours || 0));
    else if (sortBy === "priority") arr.sort((a, b) => a._prioRank - b._prioRank || (b._ageHours || 0) - (a._ageHours || 0));
    else /* date */ arr.sort((a, b) => new Date(b.completedAt || b.reportedAt || 0) - new Date(a.completedAt || a.reportedAt || 0));
    return arr;
  }, [decorated, sortBy]);

  // KPI summary
  const total      = sum(sorted, (j) => j.totalCost);
  const partsTotal = sum(sorted, (j) => j.productCost);
  const laborTotal = sum(sorted, (j) => j.laborCost);
  const resVals    = sorted.map((j) => j._resHours).filter((h) => h != null && h > 0);
  const avgRes     = resVals.length > 0 ? resVals.reduce((s, h) => s + h, 0) / resVals.length : 0;
  const isOpenScope = scope.kind === "open";

  // Color tokens for status / priority chips
  const statusColor = (s) =>
    s === "completed" ? "#16A34A" :
    s === "in-progress" ? "#2563EB" :
    s === "scheduled" ? "#D97706" :
    s === "cancelled" ? p.textMuted :
    p.accent;
  const prioColor = (pr) =>
    pr === "critical" ? p.danger :
    pr === "high"     ? "#D97706" :
    pr === "medium"   ? "#2563EB" :
    pr === "low"      ? p.textMuted :
    p.accent;

  // CSV export
  const exportCsv = () => {
    if (sorted.length === 0) { pushToast({ message: "Nothing to export", kind: "warn" }); return; }
    const rows = sorted.map((j) => ({
      id: j.id,
      status: j.status,
      priority: j.priority || "",
      reported: j.reportedAt || "",
      completed: j.completedAt || "",
      resolution_hours: j._resHours != null ? j._resHours.toFixed(1) : "",
      age_hours: j._ageHours != null ? j._ageHours.toFixed(1) : "",
      title: j.title,
      room: j.unitNumber || "",
      room_type: ROOM_TYPE_LABEL[j.roomId] || j.roomId || "",
      category: MAINT_CAT_LABEL[j.category] || j.category,
      vendor: j.vendorName || "",
      parts_bhd: (j.productCost || 0).toFixed(3),
      labor_bhd: (j.laborCost || 0).toFixed(3),
      total_bhd: (j.totalCost || 0).toFixed(3),
      resolution_notes: (j.resolution || "").replace(/\s+/g, " ").slice(0, 240),
    }));
    const slug = (scope.kind === "category" ? scope.categoryId : scope.kind);
    downloadCsv(rows, `maintenance-jobs-${slug}-${isoOf(new Date())}.csv`);
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={scope.eyebrow || "Maintenance jobs"}
      title={scope.title || "Maintenance jobs"}
      fullPage
      contentMaxWidth="max-w-7xl"
      footer={
        <>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
            {sorted.length} {sorted.length === 1 ? "job" : "jobs"}
          </span>
          <div className="flex-1" />
          <GhostBtn small onClick={exportCsv}><Download size={11} /> Export CSV</GhostBtn>
          <GhostBtn small onClick={() => window.print()}><Printer size={11} /> Print</GhostBtn>
        </>
      }
    >
      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Job count"     value={sorted.length} />
        {!isOpenScope && (
          <>
            <Stat label="Total spend" value={`BHD ${total.toFixed(0)}`} hint={`Parts BHD ${partsTotal.toFixed(0)} · Labor BHD ${laborTotal.toFixed(0)}`} color={p.accent} />
            <Stat label="Avg cost"    value={sorted.length > 0 ? `BHD ${(total / sorted.length).toFixed(0)}` : "—"} />
            <Stat label="Avg resolution" value={avgRes > 0 ? `${avgRes.toFixed(1)}h` : "—"} hint="Reported → completed" />
          </>
        )}
        {isOpenScope && (
          <>
            <Stat label="Critical" value={sorted.filter((j) => j.priority === "critical").length} color={p.danger} />
            <Stat label="High"     value={sorted.filter((j) => j.priority === "high").length} />
            <Stat label="In-progress" value={sorted.filter((j) => j.status === "in-progress").length} color="#2563EB" />
          </>
        )}
      </div>

      {/* Sort + scope chip */}
      <Card title="Sort" className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "date",       label: "Most recent" },
            { id: "cost",       label: "Highest cost" },
            { id: "resolution", label: "Longest resolution", scopes: ["completed", "resolution", "category"] },
            { id: "priority",   label: "Priority + age", scopes: ["open"] },
          ].filter((opt) => !opt.scopes || opt.scopes.includes(scope.kind))
            .map((opt) => {
              const sel = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  style={{
                    padding: "0.4rem 0.95rem",
                    backgroundColor: sel ? `${p.accent}1F` : "transparent",
                    border: `1px solid ${sel ? p.accent : p.border}`,
                    color: sel ? p.accent : p.textSecondary,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >{opt.label}</button>
              );
            })}
        </div>
      </Card>

      {/* Job list */}
      <Card title={`Job list · ${sorted.length}`} padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>{isOpenScope ? "Reported" : "Completed"}</Th>
              <Th>Job</Th>
              <Th>Room</Th>
              <Th>Category</Th>
              {isOpenScope && <Th>Status</Th>}
              {isOpenScope && <Th>Priority</Th>}
              <Th>Vendor</Th>
              {!isOpenScope && <Th align="end">Parts</Th>}
              {!isOpenScope && <Th align="end">Labor</Th>}
              {!isOpenScope && <Th align="end">Total</Th>}
              <Th align="end">{isOpenScope ? "Age" : "Resolution"}</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><Td className="px-3 py-8" align="center" muted colSpan={isOpenScope ? 8 : 9}>
                No jobs match this view.
              </Td></tr>
            )}
            {sorted.map((j) => {
              const catColor = MAINT_CAT_COLOR[j.category] || p.accent;
              return (
                <tr key={j.id}>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{fmtShort(isOpenScope ? j.reportedAt : (j.completedAt || j.reportedAt))}</Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{j.title}</div>
                    <div style={{ color: p.accent, fontSize: "0.66rem", marginTop: 2 }}>{j.id}</div>
                    {!isOpenScope && j.resolution && (
                      <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4, maxWidth: 460, lineHeight: 1.45 }}>
                        {j.resolution}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>#{j.unitNumber || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{ROOM_TYPE_LABEL[j.roomId] || j.roomId}</div>
                  </Td>
                  <Td>
                    <span style={{
                      color: catColor, backgroundColor: `${catColor}1F`, border: `1px solid ${catColor}`,
                      padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                      letterSpacing: "0.16em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>{MAINT_CAT_LABEL[j.category] || j.category}</span>
                  </Td>
                  {isOpenScope && (
                    <Td>
                      <span style={{
                        color: statusColor(j.status), backgroundColor: `${statusColor(j.status)}1F`, border: `1px solid ${statusColor(j.status)}`,
                        padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                        letterSpacing: "0.16em", textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}>{j.status}</span>
                    </Td>
                  )}
                  {isOpenScope && (
                    <Td>
                      {j.priority ? (
                        <span style={{
                          color: prioColor(j.priority), backgroundColor: `${prioColor(j.priority)}1F`, border: `1px solid ${prioColor(j.priority)}`,
                          padding: "2px 7px", fontSize: "0.58rem", fontWeight: 700,
                          letterSpacing: "0.16em", textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}>{j.priority}</span>
                      ) : <span style={{ color: p.textMuted }}>—</span>}
                    </Td>
                  )}
                  <Td muted style={{ whiteSpace: "nowrap" }}>{j.vendorName || "—"}</Td>
                  {!isOpenScope && <Td align="end" muted>BHD {(j.productCost || 0).toFixed(0)}</Td>}
                  {!isOpenScope && <Td align="end" muted>BHD {(j.laborCost || 0).toFixed(0)}</Td>}
                  {!isOpenScope && (
                    <Td align="end" style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      BHD {(j.totalCost || 0).toFixed(0)}
                    </Td>
                  )}
                  <Td align="end" muted style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {isOpenScope
                      ? (j._ageHours != null ? `${j._ageHours.toFixed(1)} h` : "—")
                      : (j._resHours != null ? `${j._resHours.toFixed(1)} h` : "—")}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span style={{ width: 10, height: 10, backgroundColor: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

function SwatchLegend({ bg, fg, label }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
      <span style={{ width: 18, height: 14, backgroundColor: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 700 }}>—</span>
      {label}
    </span>
  );
}

function ForecastTile({ icon: Icon, label, value, hint, color, p }) {
  return (
    <div className="p-4" style={{
      backgroundColor: `${color}10`,
      border: `1px solid ${color}40`,
      borderInlineStart: `3px solid ${color}`,
    }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} style={{ color }} />
        <span style={{ color, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: p.textPrimary, lineHeight: 1.1, fontWeight: 500 }}>
        {value}
      </div>
      <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 4, lineHeight: 1.5 }}>
        {hint}
      </div>
    </div>
  );
}

function chipStyle(color) {
  return {
    color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
    padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
    whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}
function dotStyle(color) {
  return { width: 7, height: 7, borderRadius: "50%", backgroundColor: color };
}
