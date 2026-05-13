import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Save, Trash2 } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { useData, formatCurrency } from "../../../../data/store.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, SelectField, Stat, TextField } from "../ui.jsx";

// Convert a Date → 'YYYY-MM-DD' in local time so cell edits don't drift across
// timezones at midnight.
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function buildRange(start, count) {
  const out = [];
  const s = new Date(start);
  for (let i = 0; i < count; i++) {
    const d = new Date(s);
    d.setDate(s.getDate() + i);
    out.push(d);
  }
  return out;
}

function cellState(room, override) {
  const rate = override?.rate ?? room.price;
  const stopSale = !!override?.stopSale;
  const blocked = override?.blocked ?? 0;
  return { rate, stopSale, blocked, reason: override?.reason || "" };
}

export const CalendarView = () => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { rooms, calendar, setCalendarCell, bookings } = useData();

  // Date range: default = today + next N days. User can pan by day, week,
  // or month and jump back to today instantly.
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dayCount, setDayCount] = useState(30);
  const dates = useMemo(() => buildRange(anchor, dayCount), [anchor, dayCount]);
  const isToday = isoDay(anchor) === isoDay(new Date());

  const [selected, setSelected] = useState(null); // { roomId, dateISO }

  // For bulk editing — let user select a date range + room.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRoom, setBulkRoom] = useState(rooms[0]?.id);
  const [bulkFrom, setBulkFrom] = useState(isoDay(anchor));
  const [bulkTo, setBulkTo] = useState(isoDay(dates[dates.length - 1] || anchor));
  const [bulkRate, setBulkRate] = useState("");
  const [bulkStop, setBulkStop] = useState(false);
  const [bulkReason, setBulkReason] = useState("");

  // Headcount of bookings per room per day → drives occupancy hue.
  const occMap = useMemo(() => {
    const m = {};
    for (const b of bookings) {
      const start = new Date(b.checkIn);
      const end = new Date(b.checkOut);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const k = `${b.roomId}|${isoDay(d)}`;
        m[k] = (m[k] || 0) + 1;
      }
    }
    return m;
  }, [bookings]);

  // Generic anchor mutator — keeps the bulk-edit defaults synced with the
  // calendar window so the bulk drawer always opens with the current range.
  const setAnchorAndBulk = (next) => {
    next.setHours(0, 0, 0, 0);
    setAnchor(next);
    setBulkFrom(isoDay(next));
    const lastDay = new Date(next);
    lastDay.setDate(lastDay.getDate() + dayCount - 1);
    setBulkTo(isoDay(lastDay));
  };

  const panDays = (delta) => {
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + delta);
    setAnchorAndBulk(next);
  };

  const panMonth = (delta) => {
    const next = new Date(anchor);
    next.setMonth(anchor.getMonth() + delta);
    setAnchorAndBulk(next);
  };

  const goToday = () => {
    const d = new Date();
    setAnchorAndBulk(d);
  };

  const jumpToDate = (iso) => {
    if (!iso) return;
    const d = new Date(iso);
    if (isNaN(d)) return;
    setAnchorAndBulk(d);
  };

  const monthLabel = anchor.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { month: "long", year: "numeric" });
  const rangeLabel = useMemo(() => {
    if (dates.length === 0) return "";
    const fmt = (d) => d.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${fmt(dates[0])} → ${fmt(dates[dates.length - 1])}`;
  }, [dates, lang]);

  const applyBulk = () => {
    const start = new Date(bulkFrom);
    const end = new Date(bulkTo);
    if (isNaN(start) || isNaN(end)) return;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const patch = {};
      if (bulkRate) patch.rate = Number(bulkRate);
      patch.stopSale = bulkStop;
      if (bulkReason) patch.reason = bulkReason;
      setCalendarCell(bulkRoom, isoDay(d), patch);
    }
    setBulkOpen(false);
    setBulkRate(""); setBulkStop(false); setBulkReason("");
  };

  const revenueWindow = useMemo(() => {
    let total = 0;
    for (const date of dates) {
      const k = isoDay(date);
      for (const r of rooms) {
        const ov = calendar[`${r.id}|${k}`];
        const { rate, stopSale } = cellState(r, ov);
        const occ = occMap[`${r.id}|${k}`] || 0;
        if (!stopSale) total += rate * occ;
      }
    }
    return total;
  }, [dates, rooms, calendar, occMap]);

  const stopSaleCount = Object.values(calendar).filter(v => v.stopSale).length;

  const dayLabel = (d) => d.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { day: "numeric", weekday: "short" });

  return (
    <div>
      <PageHeader
        title="Calendar"
        intro={`Manage rates, availability, stop-sales and room blocks across all suites starting today (${rangeLabel}). Pan back or forward by day, week, or month, or jump to any date.`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <SelectField value={dayCount} onChange={(v) => setDayCount(Number(v))} options={[
              { value:  7, label: "7 days"  },
              { value: 14, label: "14 days" },
              { value: 30, label: "30 days" },
              { value: 45, label: "45 days" },
              { value: 60, label: "60 days" },
              { value: 90, label: "90 days" },
            ]} />
            <PrimaryBtn onClick={() => setBulkOpen(true)} small>Bulk edit</PrimaryBtn>
          </div>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Window" value={`${dayCount} days`} hint={rangeLabel} />
        <Stat label="Forecast revenue" value={formatCurrency(revenueWindow)} hint="Based on current bookings × rates" color={p.success} />
        <Stat label="Stop-sale dates" value={stopSaleCount} hint={stopSaleCount === 0 ? "All open" : "Across all rooms"} color={stopSaleCount > 0 ? p.warn : p.success} />
      </div>

      <Card padded={false}
        title={
          <div className="flex items-center gap-3 flex-wrap">
            {/* Pan-back controls — month / week / day */}
            <div className="flex items-center" style={{ border: `1px solid ${p.border}` }}>
              <NavStepBtn label="Month" tooltip="Back one month" onClick={() => panMonth(-1)} icon={ChevronsLeft} p={p} />
              <NavStepBtn label="Week"  tooltip="Back one week"  onClick={() => panDays(-7)}  icon={ChevronLeft}  p={p} divider />
              <NavStepBtn label="Day"   tooltip="Back one day"   onClick={() => panDays(-1)}  icon={ChevronLeft}  p={p} divider compact />
            </div>
            {/* Date jump + range label */}
            <div className="flex items-center gap-2">
              <CalendarDays size={13} style={{ color: p.accent }} />
              <input
                type="date"
                value={isoDay(anchor)}
                onChange={(e) => jumpToDate(e.target.value)}
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.4rem 0.6rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
                }}
              />
              <span style={{
                color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                letterSpacing: "0.04em", whiteSpace: "nowrap",
              }}>
                → +{dayCount - 1} day{dayCount === 1 ? "" : "s"}
              </span>
            </div>
            {/* Pan-forward controls */}
            <div className="flex items-center" style={{ border: `1px solid ${p.border}` }}>
              <NavStepBtn label="Day"   tooltip="Forward one day"   onClick={() => panDays(1)}   icon={ChevronRight}  p={p} compact />
              <NavStepBtn label="Week"  tooltip="Forward one week"  onClick={() => panDays(7)}   icon={ChevronRight}  p={p} divider />
              <NavStepBtn label="Month" tooltip="Forward one month" onClick={() => panMonth(1)} icon={ChevronsRight} p={p} divider />
            </div>
            {/* Today */}
            <button
              onClick={goToday}
              disabled={isToday}
              title="Snap back to today"
              style={{
                padding: "0.4rem 0.85rem",
                backgroundColor: isToday ? "transparent" : p.accent,
                color: isToday ? p.textDim : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
                border: `1px solid ${isToday ? p.border : p.accent}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                cursor: isToday ? "default" : "pointer",
              }}
            >
              Today
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto p-4">
          <div style={{ display: "grid", gridTemplateColumns: `minmax(160px, 1fr) repeat(${dates.length}, minmax(56px, 1fr))`, gap: 2, fontFamily: "'Manrope', sans-serif" }}>
            <div />
            {dates.map((d) => {
              const isWeekend = [5, 6].includes(d.getDay()); // Fri/Sat in BH
              const isToday = isoDay(d) === isoDay(new Date());
              return (
                <div key={isoDay(d)} className="text-center"
                  style={{
                    fontSize: "0.6rem", padding: "6px 2px", lineHeight: 1.25,
                    color: isToday ? p.accent : isWeekend ? p.textSecondary : p.textMuted,
                    fontWeight: isToday ? 700 : isWeekend ? 600 : 500,
                    backgroundColor: isWeekend ? p.bgPanelAlt : "transparent",
                    borderBottom: isToday ? `2px solid ${p.accent}` : "2px solid transparent",
                  }}
                >
                  {dayLabel(d)}
                </div>
              );
            })}

            {rooms.map((r) => (
              <React.Fragment key={r.id}>
                <div className="flex flex-col justify-center" style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: p.textPrimary,
                  paddingInlineEnd: 8, whiteSpace: "nowrap",
                }}>
                  {t(`rooms.${r.id}.name`)}
                  <span style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.05em", fontFamily: "'Manrope', sans-serif" }}>
                    {t("common.bhd")} {r.price} base
                  </span>
                </div>
                {dates.map((d) => {
                  const k = isoDay(d);
                  const ov = calendar[`${r.id}|${k}`];
                  const { rate, stopSale, blocked } = cellState(r, ov);
                  const occCount = occMap[`${r.id}|${k}`] || 0;
                  const overridden = !!ov;
                  const occHigh = occCount > 1;
                  let bg = p.cellBase;
                  if (stopSale) bg = p.danger;
                  else if (overridden) bg = p.theme === "light" ? "rgba(154,126,64,0.18)" : "rgba(201,169,97,0.18)";
                  else if (occHigh) bg = p.theme === "light" ? "rgba(92,138,78,0.18)" : "rgba(127,169,112,0.18)";
                  const fg = stopSale ? "#FFFFFF" : p.textPrimary;
                  return (
                    <button
                      key={k}
                      onClick={() => setSelected({ roomId: r.id, dateISO: k })}
                      title={`${dayLabel(d)} · ${stopSale ? "Stop-sale" : `${occCount} booked`}`}
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        border: `1px solid ${p.border}`,
                        borderInlineStart: overridden ? `2px solid ${p.accent}` : `1px solid ${p.border}`,
                        height: 56,
                        padding: 4,
                        textAlign: "center",
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        position: "relative",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{rate}</span>
                      <span style={{ fontSize: "0.58rem", opacity: 0.75 }}>
                        {stopSale ? "STOP" : blocked > 0 ? `${blocked}B` : occCount > 0 ? `${occCount}♦` : "·"}
                      </span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </Card>

      <CellEditor selected={selected} onClose={() => setSelected(null)} occMap={occMap} />

      <Drawer
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk edit"
        footer={<><GhostBtn onClick={() => setBulkOpen(false)} small>Cancel</GhostBtn><PrimaryBtn onClick={applyBulk} small>Apply</PrimaryBtn></>}
      >
        <div className="space-y-4">
          <FormGroup label="Room type">
            <SelectField value={bulkRoom} onChange={setBulkRoom} options={rooms.map(r => ({ value: r.id, label: t(`rooms.${r.id}.name`) }))} />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="From"><TextField type="date" value={bulkFrom} onChange={setBulkFrom} /></FormGroup>
            <FormGroup label="To"><TextField type="date" value={bulkTo} onChange={setBulkTo} /></FormGroup>
          </div>
          <FormGroup label="New rate (BHD)"><TextField type="number" value={bulkRate} onChange={setBulkRate} placeholder="leave blank to keep" suffix="BHD" /></FormGroup>
          <label className="flex items-center gap-2" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
            <input type="checkbox" checked={bulkStop} onChange={(e) => setBulkStop(e.target.checked)} /> Apply stop-sale across this range
          </label>
          <FormGroup label="Reason / note"><TextField value={bulkReason} onChange={setBulkReason} placeholder="Group block, refurb, weekend uplift…" /></FormGroup>
        </div>
      </Drawer>
    </div>
  );
};

// Compact label-icon button used inside the calendar's pan controls.
// `compact` collapses to icon-only (used for the "Day" buttons that sit
// between Week and the date picker), `divider` adds an inline-start border
// so the buttons sit flush in a single segmented bar.
function NavStepBtn({ label, tooltip, onClick, icon: Icon, p, divider, compact }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className="flex items-center"
      style={{
        gap: 4,
        padding: compact ? "0.45rem 0.55rem" : "0.45rem 0.7rem",
        backgroundColor: "transparent",
        color: p.textSecondary,
        border: "none",
        borderInlineStart: divider ? `1px solid ${p.border}` : "none",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.62rem",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.backgroundColor = p.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <Icon size={12} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

function CellEditor({ selected, onClose, occMap }) {
  const t = useT();
  const p = usePalette();
  const { rooms, calendar, setCalendarCell } = useData();
  const room = rooms.find(r => r.id === selected?.roomId);
  const ov = selected ? calendar[`${selected.roomId}|${selected.dateISO}`] : null;
  const initial = room && selected ? cellState(room, ov) : null;

  const [rate, setRate] = useState(initial?.rate ?? "");
  const [stopSale, setStopSale] = useState(initial?.stopSale ?? false);
  const [blocked, setBlocked] = useState(initial?.blocked ?? 0);
  const [reason, setReason] = useState(initial?.reason ?? "");

  React.useEffect(() => {
    if (initial) { setRate(initial.rate); setStopSale(initial.stopSale); setBlocked(initial.blocked); setReason(initial.reason); }
  }, [selected]);

  if (!selected || !room) return null;

  const save = () => {
    setCalendarCell(selected.roomId, selected.dateISO, {
      rate: Number(rate),
      stopSale,
      blocked: Number(blocked),
      reason,
    });
    onClose();
  };
  const reset = () => { setCalendarCell(selected.roomId, selected.dateISO, null); onClose(); };

  const occCount = occMap[`${selected.roomId}|${selected.dateISO}`] || 0;
  const dateLabel = new Date(selected.dateISO).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Drawer
      open={!!selected}
      onClose={onClose}
      title={`${t(`rooms.${room.id}.name`)} · ${selected.dateISO}`}
      footer={
        <>
          <GhostBtn onClick={reset} small danger><Trash2 size={12} /> Reset to default</GhostBtn>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={12} /> Save</PrimaryBtn>
        </>
      }
    >
      <div className="space-y-5">
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem" }}>{dateLabel}</div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Booked tonight" value={occCount} color={occCount > 0 ? p.success : p.textMuted} />
          <Stat label="Base rate" value={`${t("common.bhd")} ${room.price}`} />
        </div>

        <FormGroup label="Rate (BHD)"><TextField type="number" value={rate} onChange={setRate} suffix="BHD" /></FormGroup>
        <FormGroup label="Rooms blocked (off-market for ops)"><TextField type="number" value={blocked} onChange={setBlocked} /></FormGroup>
        <label className="flex items-center gap-2" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={stopSale} onChange={(e) => setStopSale(e.target.checked)} /> Stop-sale (close availability)
        </label>
        <FormGroup label="Reason / note"><TextField value={reason} onChange={setReason} placeholder="Group block, refurb, weekend uplift…" /></FormGroup>
      </div>
    </Drawer>
  );
}
