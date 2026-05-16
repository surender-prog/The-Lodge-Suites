import React, { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BedDouble, Briefcase, CalendarDays, Check, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, Coffee, Lock, Moon, RotateCcw, Save, Sparkles,
  Sun, Trash2, TrendingUp, Users, Utensils, Wrench, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import {
  useData, formatCurrency, MEAL_PLANS, applyTaxes, mealPlanLabel, mealPlanSupplement,
} from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, SelectField, Stat, TableShell,
  Td, Th, TextField,
} from "../ui.jsx";

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

// Day-of-week codes the operator can mix and match in the bulk editor.
// 0 = Sunday, … 6 = Saturday.
const DOW = [
  { id: 0, short: "Sun" }, { id: 1, short: "Mon" }, { id: 2, short: "Tue" },
  { id: 3, short: "Wed" }, { id: 4, short: "Thu" }, { id: 5, short: "Fri" }, { id: 6, short: "Sat" },
];

// Default Bahrain weekend used as a fallback when hotelInfo.weekendDays
// hasn't been hydrated yet. Kept narrow so we don't accidentally treat
// weekdays as weekends mid-render.
const DEFAULT_WEEKEND_DAYS = [5, 6];

export const CalendarView = ({ onNavigate }) => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { rooms, calendar, setCalendarCell, bookings, hotelInfo } = useData();

  // Weekend-day set sourced from Property Info → Weekend days. Falls back
  // to Bahrain's Fri/Sat default while the singleton is hydrating.
  const weekendDays = (hotelInfo?.weekendDays && hotelInfo.weekendDays.length > 0)
    ? hotelInfo.weekendDays
    : DEFAULT_WEEKEND_DAYS;
  const isWeekendDate = (d) => weekendDays.includes(d.getDay());

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

  // Bulk editor state — supports MULTIPLE simultaneous date ranges and
  // multi-suite scope. Each range is { id, from, to, label } so an
  // operator can build, e.g. "F1 weekend + National Day weekend + New
  // Year's eve" in one shot and apply one consistent patch across all
  // of them. See `applyBulk` for how the cells are unioned.
  const [bulkOpen, setBulkOpen] = useState(false);

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

  // Anchor mutator — bulk-editor defaults derive from the live window
  // anyway, so this just normalises the date and updates the anchor.
  const setAnchorAndBulk = (next) => {
    next.setHours(0, 0, 0, 0);
    setAnchor(next);
  };

  // Derived seed values for the bulk editor — opens pre-filled with the
  // currently-visible range so the operator's first action is usually a
  // tweak, not a from-scratch input.
  const bulkFrom = isoDay(anchor);
  const bulkTo   = useMemo(() => {
    const last = new Date(anchor);
    last.setDate(anchor.getDate() + dayCount - 1);
    return isoDay(last);
  }, [anchor, dayCount]);

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

  // applyBulk — unions every date inside every range, deduplicates by
  // ISO key, intersects with the day-of-week filter (if set), then
  // patches each (roomId × date) cell with the supplied changes. The
  // patch is MERGED with any existing override so we don't blow away
  // unrelated fields (e.g. a stop-sale cell keeping its reason text
  // when the operator only meant to bump the rate).
  const applyBulk = ({ ranges, roomIds, dowFilter, patch, mode, clearFields }) => {
    if (!ranges || ranges.length === 0) return 0;
    if (!roomIds || roomIds.length === 0) return 0;
    const isoSet = new Set();
    for (const r of ranges) {
      if (!r.from || !r.to) continue;
      const start = new Date(r.from);
      const end   = new Date(r.to);
      if (isNaN(start) || isNaN(end)) continue;
      // Swap if reversed so the operator's UX is forgiving.
      const lo = start <= end ? start : end;
      const hi = start <= end ? end   : start;
      for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
        if (dowFilter && dowFilter.length > 0 && !dowFilter.includes(d.getDay())) continue;
        isoSet.add(isoDay(d));
      }
    }
    let touched = 0;
    isoSet.forEach((iso) => {
      roomIds.forEach((rid) => {
        const existing = calendar[`${rid}|${iso}`] || {};
        let next = mode === "replace" ? { ...patch } : { ...existing, ...patch };
        // Field-level "clear" support: when the operator picks "Clear"
        // for a field we delete it explicitly so the cell falls back to
        // the suite's default.
        if (clearFields && clearFields.length > 0) {
          clearFields.forEach((f) => { delete next[f]; });
        }
        setCalendarCell(rid, iso, next);
        touched += 1;
      });
    });
    setBulkOpen(false);
    return touched;
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
          {/* Legend strip — explains the weekend tint so a first-time
              operator can read the calendar at a glance. */}
          <div className="flex items-center gap-3 flex-wrap mb-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem" }}>
            <span style={{ color: p.textMuted, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Legend</span>
            <LegendChip p={p} swatch={p.accent + "22"} border={p.accent + "55"} label={`Weekend (${weekendDays.map((d) => DOW[d]?.short).filter(Boolean).join(" / ")})`} />
            <LegendChip p={p} swatch={p.accent} border={p.accent} label="Today" textColor={p.theme === "light" ? "#FFFFFF" : "#15161A"} />
            <LegendChip p={p} swatch={p.danger} border={p.danger} label="Stop-sale" textColor="#FFFFFF" />
            <LegendChip p={p} swatch={p.theme === "light" ? "rgba(154,126,64,0.18)" : "rgba(201,169,97,0.18)"} border={p.accent + "55"} label="Override" />
            <LegendChip p={p} swatch={p.theme === "light" ? "rgba(92,138,78,0.18)" : "rgba(127,169,112,0.18)"} border={p.success + "55"} label="High occupancy" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `minmax(160px, 1fr) repeat(${dates.length}, minmax(56px, 1fr))`, gap: 2, fontFamily: "'Manrope', sans-serif" }}>
            <div />
            {dates.map((d) => {
              const isWeekend = isWeekendDate(d);
              const isToday = isoDay(d) === isoDay(new Date());
              return (
                <div key={isoDay(d)} className="text-center"
                  style={{
                    fontSize: "0.6rem", padding: "6px 2px", lineHeight: 1.25,
                    color: isToday ? p.accent : isWeekend ? p.accent : p.textMuted,
                    fontWeight: isToday ? 700 : isWeekend ? 700 : 500,
                    letterSpacing: isWeekend ? "0.04em" : 0,
                    // Stronger gold-tinted background for weekend columns —
                    // theme-aware so the contrast reads correctly in both
                    // light and dark palettes. The previous "bgPanelAlt"
                    // was too subtle to register as a deliberate signal.
                    backgroundColor: isWeekend
                      ? (p.theme === "light" ? "rgba(201,169,97,0.18)" : "rgba(201,169,97,0.14)")
                      : "transparent",
                    borderTop: isWeekend ? `2px solid ${p.accent}` : "2px solid transparent",
                    borderBottom: isToday ? `2px solid ${p.accent}` : "2px solid transparent",
                  }}
                  title={isWeekend ? `Weekend (${DOW[d.getDay()]?.short})` : undefined}
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
                  const isWeekend = isWeekendDate(d);
                  // Layered background — stop-sale > override > high-occ >
                  // weekend tint > base. Weekend is the bottom of the
                  // stack so it never masks a more important signal but
                  // still reads on otherwise-blank cells.
                  let bg = p.cellBase;
                  if (isWeekend) bg = p.theme === "light" ? "rgba(201,169,97,0.10)" : "rgba(201,169,97,0.08)";
                  if (occHigh && !overridden && !stopSale) bg = p.theme === "light" ? "rgba(92,138,78,0.18)" : "rgba(127,169,112,0.18)";
                  if (overridden && !stopSale) bg = p.theme === "light" ? "rgba(154,126,64,0.18)" : "rgba(201,169,97,0.18)";
                  if (stopSale) bg = p.danger;
                  const fg = stopSale ? "#FFFFFF" : p.textPrimary;
                  return (
                    <button
                      key={k}
                      onClick={() => setSelected({ roomId: r.id, dateISO: k })}
                      title={`${dayLabel(d)}${isWeekend ? " · weekend" : ""} · ${stopSale ? "Stop-sale" : `${occCount} booked`}`}
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        border: `1px solid ${p.border}`,
                        borderInlineStart: overridden ? `2px solid ${p.accent}` : `1px solid ${p.border}`,
                        // Subtle gold top stripe on weekend cells echoes the
                        // header — keeps the column visually unified
                        // top-to-bottom without overpowering the data.
                        borderTop: isWeekend && !stopSale ? `2px solid ${p.accent}` : `1px solid ${p.border}`,
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

      <CellEditor selected={selected} onClose={() => setSelected(null)} occMap={occMap} onNavigate={onNavigate} />

      {bulkOpen && (
        <BulkEditor
          rooms={rooms}
          weekendDays={weekendDays}
          anchor={anchor}
          defaultFrom={bulkFrom}
          defaultTo={bulkTo}
          onClose={() => setBulkOpen(false)}
          onApply={applyBulk}
        />
      )}
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

// ─────────────────────────────────────────────────────────────────────────
// CellEditor — full-page calendar cell editor.
//
// Opens when the operator clicks any cell in the calendar grid. Provides:
//   • Hero header with date, day-of-week badge, weekend/today chips,
//     a Back button and (via the Drawer chrome) a Close button.
//   • 4-stat snapshot — bookings tonight, units sold, available, base rate.
//   • Quick presets — one-click templates for common ops (weekend
//     uplift, Ramadan HB, group block, maintenance close, clear).
//   • Pricing card — rate edit + live gross with current tax pattern +
//     variance vs. base rate.
//   • Availability card — rooms blocked, stop-sale toggle, with a
//     computed "available units tonight" line.
//   • Meal plan card — visual tile picker for the four plans + "no
//     override" option.
//   • Reason / note — free-text annotation.
//   • Right rail — bookings affected on this night (clickable rows for
//     deep-link). Empty state for unbooked nights.
//
// Footer: Reset to default · Cancel · Save changes.
// ─────────────────────────────────────────────────────────────────────────
function CellEditor({ selected, onClose, occMap, onNavigate }) {
  const t = useT();
  const p = usePalette();
  const { rooms, calendar, setCalendarCell, bookings, roomUnits, hotelInfo, tax } = useData();
  const room = rooms.find(r => r.id === selected?.roomId);
  const ov = selected ? calendar[`${selected.roomId}|${selected.dateISO}`] : null;
  const initial = room && selected ? cellState(room, ov) : null;

  const [rate, setRate] = useState(initial?.rate ?? "");
  const [stopSale, setStopSale] = useState(initial?.stopSale ?? false);
  const [blocked, setBlocked] = useState(initial?.blocked ?? 0);
  const [reason, setReason] = useState(initial?.reason ?? "");
  // Per-day meal plan override — "" means "no override" (booking flow
  // uses whatever the guest picked / the channel default). Setting it
  // forces a specific plan for this date, e.g. a "BB included" promo
  // weekend or a Ramadan iftar HB push.
  const [mealPlan, setMealPlan] = useState(ov?.mealPlan ?? "");

  React.useEffect(() => {
    if (initial) { setRate(initial.rate); setStopSale(initial.stopSale); setBlocked(initial.blocked); setReason(initial.reason); }
    setMealPlan(ov?.mealPlan ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.roomId, selected?.dateISO]);

  // Inventory + occupancy maths — all derived inside the hooks-stable
  // section so we can show "X of Y units booked" instead of just a
  // bookings count. Falls back to 0 when room_units hasn't been
  // populated yet (early hydration).
  const occCount  = occMap[`${selected?.roomId}|${selected?.dateISO}`] || 0;
  const inventory = useMemo(() => {
    if (!selected || !roomUnits) return 0;
    return roomUnits.filter((u) => u.roomTypeId === selected.roomId && u.status !== "out-of-order").length;
  }, [roomUnits, selected]);
  // Bookings touching this night — pull the actual reservation records so
  // the right-rail list can show the affected guests.
  const tonightsBookings = useMemo(() => {
    if (!selected) return [];
    const target = new Date(selected.dateISO);
    return (bookings || []).filter((b) => {
      if (b.roomId !== selected.roomId) return false;
      const ci = new Date(b.checkIn);
      const co = new Date(b.checkOut);
      return target >= ci && target < co;
    });
  }, [bookings, selected]);

  // Derived insights
  const isToday = selected ? selected.dateISO === isoDay(new Date()) : false;
  const dateObj = selected ? new Date(selected.dateISO) : null;
  const dayOfWeek = dateObj ? dateObj.getDay() : 0; // 0=Sun, 5=Fri, 6=Sat
  // Weekend detection uses the property's configured weekend days (admin
  // sets this in Property Info). Falls back to the Bahrain default (Fri/Sat)
  // when nothing's been configured yet.
  const weekendDays = hotelInfo?.weekendDays && hotelInfo.weekendDays.length > 0
    ? hotelInfo.weekendDays
    : [5, 6];
  const isWeekendDay = weekendDays.includes(dayOfWeek);
  const baseRate     = room ? (isWeekendDay ? (room.priceWeekend ?? room.price) : room.price) : 0;
  const ratePreview  = Number(rate) || 0;
  const variance     = ratePreview - baseRate;
  const variancePct  = baseRate > 0 ? Math.round((variance / baseRate) * 100) : 0;
  // Gross preview with current tax pattern so the operator sees what the
  // guest actually pays. Pure derived — no state.
  const grossPreview = useMemo(() => {
    if (!ratePreview) return 0;
    try { return Math.round(applyTaxes(ratePreview, tax, 1).gross); } catch { return ratePreview; }
  }, [ratePreview, tax]);
  const baseGross    = useMemo(() => {
    if (!baseRate) return 0;
    try { return Math.round(applyTaxes(baseRate, tax, 1).gross); } catch { return baseRate; }
  }, [baseRate, tax]);

  const unitsBookedTonight = occCount;
  const unitsBlockedNow    = Math.max(0, Number(blocked) || 0);
  const unitsAvailable     = Math.max(0, inventory - unitsBookedTonight - unitsBlockedNow);

  // Dirty check — drives the Save button's emphasis.
  const dirty = ratePreview !== (initial?.rate ?? 0)
    || stopSale !== (initial?.stopSale ?? false)
    || Number(blocked) !== (initial?.blocked ?? 0)
    || reason !== (initial?.reason ?? "")
    || mealPlan !== (ov?.mealPlan ?? "");

  if (!selected || !room) return null;

  const save = () => {
    setCalendarCell(selected.roomId, selected.dateISO, {
      rate: Number(rate),
      stopSale,
      blocked: Number(blocked),
      reason,
      // Persist null when blank so we don't pollute the cell with empty strings.
      mealPlan: mealPlan || null,
    });
    onClose();
  };
  const reset = () => {
    if (!confirm("Reset this date to defaults? All overrides on this cell will be cleared.")) return;
    setCalendarCell(selected.roomId, selected.dateISO, null);
    onClose();
  };

  // Quick preset templates — common operator ops mapped to one-click
  // applies. Each preset updates the LOCAL state (operator still has to
  // hit Save to commit) so it's safe to experiment with.
  const applyPreset = (preset) => {
    if (preset === "weekend-uplift") {
      // +10% off the BASE weekday rate (not the current rate). Sets a
      // sensible "weekend boost" without compounding past edits.
      const boosted = Math.round((room.price || 0) * 1.10);
      setRate(boosted);
      setReason(reason || "Weekend uplift");
    } else if (preset === "ramadan-hb") {
      setMealPlan("hb");
      setReason(reason || "Ramadan iftar HB");
    } else if (preset === "bb-weekend") {
      setMealPlan("bb");
      setReason(reason || "BB-included weekend promo");
    } else if (preset === "group-block") {
      setStopSale(true);
      setReason(reason || "Group block");
    } else if (preset === "maintenance") {
      setStopSale(true);
      setBlocked(inventory);
      setReason(reason || "Out-of-order — maintenance");
    } else if (preset === "clear") {
      setRate(room.price);
      setStopSale(false);
      setBlocked(0);
      setReason("");
      setMealPlan("");
    }
  };

  const dateLabel = new Date(selected.dateISO).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const shortDate = new Date(selected.dateISO).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const roomName  = t(`rooms.${room.id}.name`) || room.id;

  return (
    <Drawer
      open={!!selected}
      onClose={onClose}
      eyebrow={`Calendar override · ${shortDate}`}
      title={`${roomName} · ${dateLabel}`}
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={reset} small danger><Trash2 size={12} /> Reset to default</GhostBtn>
          <div className="flex-1" />
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={12} /> Save changes</PrimaryBtn>
        </>
      }
    >
      {/* Back-to-calendar nav bar — visually distinct from the Drawer's
          own Close button (which sits in the top-right). Operators get
          a clear "go back" affordance plus the cell context chips. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2"
          style={{
            color: p.textSecondary, padding: "0.5rem 0.85rem",
            border: `1px solid ${p.border}`, backgroundColor: p.bgPanel, cursor: "pointer",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
        >
          <ArrowLeft size={12} /> Back to calendar
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{
            color: isWeekendDay ? p.warn : p.textMuted,
            border: `1px solid ${isWeekendDay ? p.warn : p.border}`,
            padding: "0.3rem 0.7rem", fontFamily: "'Manrope', sans-serif",
            fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {isWeekendDay ? <><Moon size={10} /> Weekend</> : <><Sun size={10} /> Weekday</>}
          </span>
          {isToday && (
            <span style={{
              color: p.accent, backgroundColor: `${p.accent}10`,
              border: `1px solid ${p.accent}`,
              padding: "0.3rem 0.7rem", fontFamily: "'Manrope', sans-serif",
              fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}>
              Today
            </span>
          )}
          {stopSale && (
            <span style={{
              color: p.danger, backgroundColor: `${p.danger}10`,
              border: `1px solid ${p.danger}`,
              padding: "0.3rem 0.7rem", fontFamily: "'Manrope', sans-serif",
              fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <Lock size={10} /> Stop-sale
            </span>
          )}
          {ov && (
            <span style={{
              color: p.accent, fontFamily: "'Manrope', sans-serif",
              fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}>
              · Cell has overrides
            </span>
          )}
        </div>
      </div>

      {/* 4-stat snapshot strip — gives the operator immediate context
          before they reach for any control. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Booked tonight" value={`${unitsBookedTonight} / ${inventory}`}
          color={unitsBookedTonight === 0 ? p.textMuted : unitsBookedTonight >= inventory ? p.danger : p.success}
          hint={inventory === 0 ? "No inventory set up" : `${Math.round((unitsBookedTonight / Math.max(1, inventory)) * 100)}% occupancy`} />
        <Stat label="Available now" value={unitsAvailable}
          color={unitsAvailable === 0 ? p.danger : unitsAvailable <= 2 ? p.warn : p.success}
          hint={stopSale ? "Stop-sale active — closed" : `${unitsBlockedNow} blocked off-market`} />
        <Stat label="Base rate" value={formatCurrency(baseRate)}
          hint={isWeekendDay ? "Weekend rate from Rooms & Rates" : "Weekday rate from Rooms & Rates"} />
        <Stat label="Selling rate (net)" value={formatCurrency(ratePreview)}
          color={variance === 0 ? p.textPrimary : variance > 0 ? p.accent : p.warn}
          hint={
            variance === 0 ? "Matches base" :
            variance > 0 ? `+ ${formatCurrency(Math.abs(variance))} (+${variancePct}%) vs base` :
            `− ${formatCurrency(Math.abs(variance))} (${variancePct}%) vs base`
          } />
      </div>

      {/* Quick presets — one-click templates for the operations the
          calendar editor is opened for 80% of the time. Each preset
          mutates the LOCAL state; operator still has to hit Save. */}
      <Card title="Quick presets" padded className="mb-6">
        <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 12 }}>
          One-click templates for the most common cell edits. Tap one to populate the fields below — your changes still need Save.
        </p>
        <div className="flex flex-wrap gap-2">
          <PresetBtn p={p} onClick={() => applyPreset("weekend-uplift")} icon={TrendingUp}>+10% weekend uplift</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("bb-weekend")}     icon={Coffee}>BB-included weekend</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("ramadan-hb")}     icon={Utensils}>Ramadan iftar HB</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("group-block")}    icon={Users}>Group block</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("maintenance")}    icon={Wrench}>Maintenance close</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("clear")}          icon={RotateCcw} danger>Clear all</PresetBtn>
        </div>
      </Card>

      {/* Main grid — left column carries the edit cards; right column
          surfaces the bookings affected by this cell + tax preview. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* Left column ----------------------------------------------------- */}
        <div className="space-y-6">
          {/* Pricing */}
          <Card title="Pricing" padded>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Selling rate (BHD, excl. tax)">
                <TextField type="number" value={rate} onChange={setRate} suffix="BHD" />
              </FormGroup>
              <FormGroup label="Variance vs. base rate">
                <div style={{
                  border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt,
                  padding: "0.6rem 0.75rem", color: variance === 0 ? p.textMuted : variance > 0 ? p.accent : p.warn,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {variance === 0 ? "No change" : `${variance > 0 ? "+" : ""}${formatCurrency(variance)} (${variancePct > 0 ? "+" : ""}${variancePct}%)`}
                </div>
              </FormGroup>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>Base gross</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>
                  {formatCurrency(baseGross)}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.68rem", marginTop: 2 }}>incl. taxes</div>
              </div>
              <div className="p-4" style={{
                backgroundColor: variance === 0 ? p.bgPanelAlt : `${p.accent}10`,
                border: `1px solid ${variance === 0 ? p.border : p.accent}`,
                borderInlineStart: `3px solid ${variance === 0 ? p.border : p.accent}`,
              }}>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>This cell gross</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.accent, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>
                  {formatCurrency(grossPreview)}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.68rem", marginTop: 2 }}>what the guest pays</div>
              </div>
              <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>Tax loaded</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: p.textPrimary, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>
                  {formatCurrency(Math.max(0, grossPreview - ratePreview))}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.68rem", marginTop: 2 }}>VAT + service + tourism</div>
              </div>
            </div>
          </Card>

          {/* Availability */}
          <Card title="Availability" padded>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Rooms blocked (off-market for ops)">
                <TextField type="number" value={blocked} onChange={setBlocked} />
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 6, lineHeight: 1.55 }}>
                  Maintenance, refurb, owner-occupied — anything off-market for the night. Max <strong>{inventory}</strong>.
                </div>
              </FormGroup>
              <div>
                <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
                  Stop-sale
                </div>
                <button
                  onClick={() => setStopSale(!stopSale)}
                  className="flex items-center justify-between gap-3 w-full"
                  style={{
                    padding: "0.7rem 0.85rem",
                    border: `1px solid ${stopSale ? p.danger : p.border}`,
                    backgroundColor: stopSale ? `${p.danger}10` : p.inputBg,
                    color: stopSale ? p.danger : p.textSecondary,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                    fontWeight: 600, cursor: "pointer",
                  }}
                  aria-pressed={stopSale}
                >
                  <span className="flex items-center gap-2">
                    <Lock size={12} /> {stopSale ? "Close availability (active)" : "Close availability"}
                  </span>
                  <span style={{
                    width: 36, height: 20, borderRadius: 999,
                    backgroundColor: stopSale ? p.danger : p.border,
                    position: "relative", flexShrink: 0,
                  }}>
                    <span style={{
                      position: "absolute", top: 2, left: stopSale ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%",
                      backgroundColor: "#fff", transition: "left 120ms",
                    }} />
                  </span>
                </button>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 6, lineHeight: 1.55 }}>
                  Closes the suite to ALL new bookings (direct + OTA) for this date. Existing reservations are untouched.
                </div>
              </div>
            </div>
            {/* Live "available units" line */}
            <div className="mt-4 p-3 flex items-start gap-3"
              style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <BedDouble size={16} style={{ color: p.accent, marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textSecondary, lineHeight: 1.55 }}>
                {stopSale ? (
                  <><strong style={{ color: p.danger }}>Stop-sale active</strong> — no new bookings can take this suite tonight.</>
                ) : unitsAvailable > 0 ? (
                  <><strong style={{ color: p.success }}>{unitsAvailable} unit{unitsAvailable === 1 ? "" : "s"}</strong> of {roomName} still bookable tonight (after {unitsBookedTonight} sold + {unitsBlockedNow} blocked).</>
                ) : (
                  <><strong style={{ color: p.warn }}>Fully committed</strong> — every {roomName} is either sold or blocked tonight.</>
                )}
              </div>
            </div>
          </Card>

          {/* Meal plan override */}
          <Card title="Meal plan override" padded>
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 12 }}>
              Forces a specific plan on bookings that include this date for this suite. Useful for promos like "BB-included weekends" or Ramadan iftar HB pushes. Leave at <strong>No override</strong> to honour whatever the guest picked at checkout.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <MealPlanTile p={p} selected={mealPlan === ""} onClick={() => setMealPlan("")}
                title="No override" short="—" hint="Use booking's choice" supplement={null} />
              {MEAL_PLANS.map((m) => {
                const supp = mealPlanSupplement(room, m.code);
                return (
                  <MealPlanTile key={m.code} p={p}
                    selected={mealPlan === m.code}
                    onClick={() => setMealPlan(m.code)}
                    title={m.label} short={m.short} hint={m.blurb} supplement={supp}
                  />
                );
              })}
            </div>
          </Card>

          {/* Reason / note */}
          <Card title="Reason / note" padded>
            <FormGroup label="Why this override (visible to operators)">
              <TextField value={reason} onChange={setReason} placeholder="Group block, refurb, weekend uplift, F1 weekend uplift, Ramadan HB push, …" />
            </FormGroup>
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
              Shows on the calendar grid tooltip and on the Stop-sale &amp; OTA report. Keep it short and operational.
            </p>
          </Card>
        </div>

        {/* Right column --------------------------------------------------- */}
        <div className="space-y-6">
          {/* Bookings tonight */}
          <Card title={`Bookings tonight · ${tonightsBookings.length}`} padded={false}>
            {tonightsBookings.length === 0 ? (
              <div className="px-5 py-7 text-center" style={{
                color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.55,
              }}>
                <BedDouble size={20} style={{ color: p.textMuted, opacity: 0.45, margin: "0 auto 8px" }} />
                No reservations for {roomName} on this date — overrides won't affect any existing bookings.
              </div>
            ) : (
              <div>
                {tonightsBookings.slice(0, 8).map((b) => {
                  const ci = new Date(b.checkIn).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  const co = new Date(b.checkOut).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  return (
                    <button key={b.id}
                      onClick={() => { if (onNavigate) onNavigate({ section: "bookings", params: { bookingId: b.id } }); onClose(); }}
                      className="w-full text-start px-5 py-3 transition-colors"
                      style={{
                        borderTop: `1px solid ${p.border}`,
                        backgroundColor: "transparent", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgPanelAlt; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.7rem", color: p.accent, fontWeight: 600 }}>
                          {b.id}
                        </code>
                        <span style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                          {b.source || "direct"}
                        </span>
                      </div>
                      <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", marginTop: 4 }}>
                        {b.guest || "Guest"}
                      </div>
                      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 2 }}>
                        {ci} → {co} · {b.nights}n · {b.guests} guest{b.guests === 1 ? "" : "s"}
                        {b.mealPlan && b.mealPlan !== "ro" && (
                          <span style={{ color: p.accent, marginInlineStart: 6, fontWeight: 700 }}>· {b.mealPlan.toUpperCase()}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {tonightsBookings.length > 8 && (
                  <div className="px-5 py-3" style={{ borderTop: `1px solid ${p.border}`, color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", textAlign: "center" }}>
                    + {tonightsBookings.length - 8} more
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Suite reference */}
          <Card title="Suite reference" padded>
            <div className="space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
              <RefRow p={p} label="Type" value={roomName} />
              <RefRow p={p} label="Inventory" value={`${inventory} unit${inventory === 1 ? "" : "s"}`} />
              <RefRow p={p} label="Weekday rate" value={formatCurrency(room.price)} />
              <RefRow p={p} label="Weekend rate" value={formatCurrency(room.priceWeekend ?? room.price)} />
              <RefRow p={p} label="Occupancy" value={`up to ${room.occupancy}`} />
            </div>
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 10, lineHeight: 1.55 }}>
              Master values live in <strong>Rooms &amp; Rates</strong>. This cell overrides the rate / availability for just this date.
            </p>
          </Card>

          {/* Save-state hint */}
          {dirty && (
            <div className="p-3 flex items-start gap-2" style={{
              backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}45`,
              color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>You have unsaved changes. Tap <strong>Save changes</strong> in the footer to commit, or <strong>Cancel</strong> to discard.</span>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers used only by the full-page CellEditor — kept local to avoid
// polluting the ui.jsx surface.
// ─────────────────────────────────────────────────────────────────────────
function PresetBtn({ p, onClick, icon: Ic, children, danger }) {
  const fg = danger ? p.danger : p.textSecondary;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2"
      style={{
        padding: "0.5rem 0.85rem",
        border: `1px solid ${p.border}`,
        backgroundColor: p.bgPanelAlt,
        color: fg,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 600,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = danger ? p.danger : p.accent; e.currentTarget.style.color = danger ? p.danger : p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = fg; }}
    >
      <Ic size={12} /> {children}
    </button>
  );
}

function MealPlanTile({ p, selected, onClick, title, short, hint, supplement }) {
  return (
    <button onClick={onClick}
      className="text-start p-3 transition-colors"
      style={{
        border: `1px solid ${selected ? p.accent : p.border}`,
        backgroundColor: selected ? `${p.accent}10` : p.bgPanel,
        borderInlineStart: `3px solid ${selected ? p.accent : "transparent"}`,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = p.accent; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = p.border; }}
      aria-pressed={selected}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: p.textPrimary, fontWeight: 500 }}>
          {title}
        </span>
        <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
          {short}
        </span>
      </div>
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 4, lineHeight: 1.5 }}>
        {hint}
      </div>
      {supplement !== null && supplement !== undefined && (
        <div style={{ color: supplement > 0 ? p.accent : p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontWeight: 700, marginTop: 6, letterSpacing: "0.04em" }}>
          {supplement > 0 ? `+ ${formatCurrency(supplement)} / adult / night` : "Included"}
        </div>
      )}
      {selected && (
        <div className="mt-2 inline-flex items-center gap-1" style={{
          color: p.accent, fontFamily: "'Manrope', sans-serif",
          fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
        }}>
          <Check size={10} /> Selected
        </div>
      )}
    </button>
  );
}

function RefRow({ p, label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ color: p.textPrimary, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LegendChip — tiny swatch + label pair used in the grid header legend
// strip. `swatch` is the fill colour; `border` is the outline (so a
// "stop-sale red" chip reads correctly even on a white page).
// ─────────────────────────────────────────────────────────────────────────
function LegendChip({ p, swatch, border, label, textColor }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{
      padding: "2px 8px",
      backgroundColor: swatch,
      border: `1px solid ${border}`,
      color: textColor || p.textSecondary,
      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
      letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BulkEditor — full-page workspace for bulk rate / availability /
// meal-plan / stop-sale edits across MULTIPLE date ranges and MULTIPLE
// suites in one apply. Built to replace the cramped side-drawer bulk
// editor and unblock the common ops:
//
//   • "Bump weekend rates +10% across the next two months"
//   • "F1 weekend + National Day weekend = group block"
//   • "Ramadan iftar HB push every Thu / Fri / Sat in March"
//   • "Maintenance close the Studio across two specific weeks"
//
// Layout:
//   ┌── Back to calendar ─────────────────── × Close ──┐
//   │  Scope · Ranges · Changes · Presets · Preview     │
//   └─── Reset · Cancel · Apply (N cells) ──────────────┘
// ─────────────────────────────────────────────────────────────────────────
function BulkEditor({ rooms, weekendDays, anchor, defaultFrom, defaultTo, onClose, onApply }) {
  const t = useT();
  const p = usePalette();

  // Scope — which suites the patch applies to. Defaults to all so the
  // common case ("everything") is a single click.
  const [roomIds, setRoomIds] = useState(rooms.map((r) => r.id));
  // Day-of-week filter — empty array means "all days". Operator can
  // narrow to weekend-only / weekday-only / a specific chip combo.
  const [dowFilter, setDowFilter] = useState([]);

  // Ranges — an array of { id, from, to, label }. Start with one range
  // seeded from the calendar window so the editor opens valid. The id
  // is stable so React keys don't reshuffle on edits.
  const newRangeId = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const [ranges, setRanges] = useState([
    { id: newRangeId(), from: defaultFrom, to: defaultTo, label: "" },
  ]);

  // Patch fields — each field has a tri-state:
  //   • value present  → set this value on every targeted cell
  //   • value blank    → leave the existing cell value untouched
  //   • "clear" flagged → explicitly remove the field from the cell
  //                       (operator wants to undo an earlier override
  //                        without manually resetting each cell)
  const [rate,      setRate]      = useState("");
  const [rateMode,  setRateMode]  = useState("set");   // "set" | "uplift-pct" | "uplift-bhd"
  const [blocked,   setBlocked]   = useState("");
  const [stopSale,  setStopSale]  = useState("ignore"); // "ignore" | "on" | "off"
  const [mealPlan,  setMealPlan]  = useState("");      // "" = leave / "ro/bb/hb/fb" / "__clear__"
  const [reason,    setReason]    = useState("");

  // ─── range CRUD ──
  const addRange = () => setRanges((rs) => rs.concat({ id: newRangeId(), from: isoDay(anchor), to: isoDay(anchor), label: "" }));
  const updateRange = (id, patch) => setRanges((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRange = (id) => setRanges((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  // ─── room scope helpers ──
  const toggleRoom = (id) => setRoomIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id)));
  const selectAllRooms = () => setRoomIds(rooms.map((r) => r.id));
  const clearRooms     = () => setRoomIds([]);

  // ─── dow filter helpers ──
  const toggleDow = (d) => setDowFilter((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : cur.concat(d).sort()));
  const onlyWeekends = () => setDowFilter([...weekendDays].sort());
  const onlyWeekdays = () => setDowFilter([0, 1, 2, 3, 4, 5, 6].filter((d) => !weekendDays.includes(d)));
  const allDays      = () => setDowFilter([]);

  // ─── live preview — how many cells will this touch? ──
  const cellCount = useMemo(() => {
    let dayCount = 0;
    const seen = new Set();
    for (const r of ranges) {
      if (!r.from || !r.to) continue;
      const a = new Date(r.from);
      const b = new Date(r.to);
      if (isNaN(a) || isNaN(b)) continue;
      const lo = a <= b ? a : b;
      const hi = a <= b ? b : a;
      for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
        if (dowFilter.length > 0 && !dowFilter.includes(d.getDay())) continue;
        const k = isoDay(d);
        if (seen.has(k)) continue;
        seen.add(k);
        dayCount += 1;
      }
    }
    return dayCount * roomIds.length;
  }, [ranges, roomIds, dowFilter]);

  // Cells with anything actually changing — used by the "Apply" CTA
  // gate so the operator can't accidentally fire a no-op apply.
  const hasChange = rate !== "" || blocked !== "" || stopSale !== "ignore" || mealPlan !== "" || reason !== "";

  // ─── presets — mutate LOCAL state; operator still hits Apply. ──
  const applyPreset = (kind) => {
    if (kind === "weekend-uplift") {
      setRate("10");           // "10" interpreted as +10% by uplift-pct
      setRateMode("uplift-pct");
      setReason(reason || "Weekend uplift");
      setDowFilter([...weekendDays].sort());
    } else if (kind === "ramadan-hb") {
      setMealPlan("hb");
      setReason(reason || "Ramadan iftar HB");
    } else if (kind === "bb-weekend") {
      setMealPlan("bb");
      setDowFilter([...weekendDays].sort());
      setReason(reason || "BB-included weekend promo");
    } else if (kind === "group-block") {
      setStopSale("on");
      setReason(reason || "Group block");
    } else if (kind === "maintenance") {
      setStopSale("on");
      setBlocked("0");
      setReason(reason || "Maintenance close");
    } else if (kind === "reset") {
      setRate(""); setRateMode("set"); setBlocked(""); setStopSale("ignore");
      setMealPlan(""); setReason("");
      setDowFilter([]);
    }
  };

  // ─── compute the actual patch handed to onApply ──
  const handleApply = () => {
    if (cellCount === 0) {
      pushApplyToast("No cells in scope — adjust your date ranges or room selection.");
      return;
    }
    if (!hasChange) {
      pushApplyToast("Pick at least one change to apply.");
      return;
    }
    const patch = {};
    const clearFields = [];
    // Rate — three modes:
    if (rate !== "" && Number.isFinite(Number(rate))) {
      if (rateMode === "set") {
        patch.rate = Number(rate);
      }
      // For uplift modes the rate field carries the delta; the actual
      // base-rate lookup happens per-cell during apply. We hand a
      // sentinel function over `__rateUplift` that the parent applyBulk
      // resolves cell-by-cell. To keep the patch JSON-clean we instead
      // expand uplift into individual cells *outside* applyBulk, by
      // pre-resolving room.base × (1 + pct/100) for each room.
      // (Implementation in onApply below.)
    }
    if (blocked !== "" && Number.isFinite(Number(blocked))) patch.blocked = Number(blocked);
    if (stopSale === "on")  patch.stopSale = true;
    if (stopSale === "off") patch.stopSale = false;
    if (mealPlan === "__clear__") clearFields.push("mealPlan");
    else if (mealPlan)            patch.mealPlan = mealPlan;
    if (reason !== "")  patch.reason = reason;

    // Uplift modes are resolved per-room here: we expand the bulk apply
    // into one call per room with that room's effective base-rate
    // patched in. Other fields ride along on each call.
    if (rate !== "" && (rateMode === "uplift-pct" || rateMode === "uplift-bhd")) {
      const delta = Number(rate) || 0;
      const isPct = rateMode === "uplift-pct";
      let total = 0;
      roomIds.forEach((rid) => {
        const room = rooms.find((r) => r.id === rid);
        if (!room) return;
        // Use the WEEKDAY rate as the base when an uplift is applied
        // — keeps "+10% weekend uplift" intuitive (10% of the
        // weekday rack). Operator can switch to weekend-rate uplift
        // by selecting the weekend rate explicitly later.
        const base = Number(room.price) || 0;
        const next = isPct
          ? Math.round(base * (1 + delta / 100))
          : Math.round(base + delta);
        const cellPatch = { ...patch, rate: next };
        total += onApply({ ranges, roomIds: [rid], dowFilter, patch: cellPatch, mode: "merge", clearFields });
      });
      pushApplyToast(`${total} cell${total === 1 ? "" : "s"} updated · ${isPct ? `+${delta}% uplift on weekday base` : `+${formatCurrency(delta)} uplift on weekday base`}`);
      return;
    }

    // Default path — single patch handed to the parent.
    const touched = onApply({ ranges, roomIds, dowFilter, patch, mode: "merge", clearFields });
    pushApplyToast(`${touched} cell${touched === 1 ? "" : "s"} updated.`);
  };

  // Local toast helper — avoids importing pushToast from ui.jsx in the
  // editor's render path (which is already heavy on imports).
  function pushApplyToast(msg) {
    try {
      // eslint-disable-next-line no-undef
      window.dispatchEvent(new CustomEvent("ls-toast", { detail: { message: msg } }));
    } catch (_) { /* no-op */ }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Bulk calendar edit"
      title="Apply changes across multiple ranges & suites"
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn small onClick={() => applyPreset("reset")}><RotateCcw size={11} /> Reset all</GhostBtn>
          <div className="flex-1" />
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn small onClick={handleApply}>
            <Save size={11} /> Apply to {cellCount.toLocaleString()} cell{cellCount === 1 ? "" : "s"}
          </PrimaryBtn>
        </>
      }
    >
      {/* Back-to-calendar nav (mirror of the CellEditor pattern) */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2"
          style={{
            color: p.textSecondary, padding: "0.5rem 0.85rem",
            border: `1px solid ${p.border}`, backgroundColor: p.bgPanel, cursor: "pointer",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
        >
          <ArrowLeft size={12} /> Back to calendar
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{
            color: cellCount === 0 ? p.warn : p.accent,
            backgroundColor: cellCount === 0 ? `${p.warn}10` : `${p.accent}10`,
            border: `1px solid ${cellCount === 0 ? p.warn : p.accent}`,
            padding: "0.3rem 0.7rem", fontFamily: "'Manrope', sans-serif",
            fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}>
            {cellCount.toLocaleString()} cell{cellCount === 1 ? "" : "s"} in scope
          </span>
          {ranges.length > 1 && (
            <span style={{
              color: p.textSecondary, border: `1px solid ${p.border}`,
              padding: "0.3rem 0.7rem", fontFamily: "'Manrope', sans-serif",
              fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}>
              {ranges.length} ranges
            </span>
          )}
        </div>
      </div>

      {/* Quick presets row */}
      <Card title="Quick presets" padded className="mb-6">
        <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 12 }}>
          One-click templates for the most common bulk edits. Each populates the scope + changes below — tap Apply when you're ready to commit.
        </p>
        <div className="flex flex-wrap gap-2">
          <PresetBtn p={p} onClick={() => applyPreset("weekend-uplift")} icon={TrendingUp}>+10% weekend uplift</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("bb-weekend")}     icon={Coffee}>BB-included weekend</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("ramadan-hb")}     icon={Utensils}>Ramadan iftar HB</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("group-block")}    icon={Users}>Group block</PresetBtn>
          <PresetBtn p={p} onClick={() => applyPreset("maintenance")}    icon={Wrench}>Maintenance close</PresetBtn>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        <div className="space-y-6">
          {/* Scope: rooms + day-of-week */}
          <Card title="Scope" padded action={
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem" }}>
              {roomIds.length} of {rooms.length} suite{rooms.length === 1 ? "" : "s"} · {dowFilter.length === 0 ? "all days" : `${dowFilter.length} day filter`}
            </span>
          }>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Suites
              </div>
              <div className="flex gap-1.5">
                <button onClick={selectAllRooms}
                  style={chipBtnStyle(p, false, false)}
                  title="Select every suite"
                ><Check size={11} /> All</button>
                <button onClick={clearRooms}
                  style={chipBtnStyle(p, false, false)}
                  title="Clear suite selection"
                ><X size={11} /> None</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {rooms.map((r) => {
                const sel = roomIds.includes(r.id);
                return (
                  <button key={r.id}
                    onClick={() => toggleRoom(r.id)}
                    style={chipBtnStyle(p, sel, false)}
                    aria-pressed={sel}
                  >
                    {sel ? <Check size={11} /> : <BedDouble size={11} />} {t(`rooms.${r.id}.name`)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Day-of-week filter
              </div>
              <div className="flex gap-1.5">
                <button onClick={onlyWeekends} style={chipBtnStyle(p, false, false)} title="Restrict to weekend days only"><Moon size={11} /> Weekends only</button>
                <button onClick={onlyWeekdays} style={chipBtnStyle(p, false, false)} title="Restrict to weekday days only"><Sun size={11} /> Weekdays only</button>
                <button onClick={allDays}      style={chipBtnStyle(p, false, false)} title="No day-of-week restriction">All days</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DOW.map((d) => {
                const sel = dowFilter.includes(d.id);
                const isWE = weekendDays.includes(d.id);
                return (
                  <button key={d.id}
                    onClick={() => toggleDow(d.id)}
                    style={{
                      ...chipBtnStyle(p, sel, false),
                      borderColor: sel ? p.accent : (isWE ? p.accent + "55" : p.border),
                      color: sel ? p.accent : (isWE ? p.accent : p.textSecondary),
                    }}
                    aria-pressed={sel}
                  >
                    {sel ? <Check size={11} /> : null} {d.short}
                  </button>
                );
              })}
            </div>
            {dowFilter.length > 0 && (
              <div className="mt-2" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", lineHeight: 1.5 }}>
                Only nights falling on the highlighted days will be touched within each range. Clear the filter (or tap "All days") to apply to every date in range.
              </div>
            )}
          </Card>

          {/* Date ranges */}
          <Card title={`Date ranges · ${ranges.length}`} padded={false} action={
            <GhostBtn small onClick={addRange}>
              <Plus size={11} /> Add range
            </GhostBtn>
          }>
            <div>
              {ranges.map((r, i) => {
                const dayCount = (() => {
                  if (!r.from || !r.to) return 0;
                  const a = new Date(r.from);
                  const b = new Date(r.to);
                  if (isNaN(a) || isNaN(b)) return 0;
                  return Math.abs(Math.round((b - a) / 86400000)) + 1;
                })();
                return (
                  <div key={r.id} className="px-5 py-4"
                    style={{ borderBottom: i === ranges.length - 1 ? "none" : `1px solid ${p.border}` }}>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,auto] gap-3 items-end">
                      <FormGroup label={`Range ${i + 1} · From`}>
                        <TextField type="date" value={r.from} onChange={(v) => updateRange(r.id, { from: v })} />
                      </FormGroup>
                      <FormGroup label="To">
                        <TextField type="date" value={r.to} onChange={(v) => updateRange(r.id, { to: v })} />
                      </FormGroup>
                      <FormGroup label="Label (optional)">
                        <TextField value={r.label} onChange={(v) => updateRange(r.id, { label: v })}
                          placeholder="e.g. F1 weekend" />
                      </FormGroup>
                      <div style={{ paddingBottom: 6 }}>
                        <button
                          onClick={() => removeRange(r.id)}
                          disabled={ranges.length === 1}
                          title={ranges.length === 1 ? "Keep at least one range" : "Remove this range"}
                          style={{
                            padding: "0.55rem 0.7rem",
                            color: ranges.length === 1 ? p.textMuted : p.danger,
                            border: `1px solid ${p.border}`,
                            backgroundColor: "transparent",
                            cursor: ranges.length === 1 ? "not-allowed" : "pointer",
                            opacity: ranges.length === 1 ? 0.4 : 1,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                          }}
                          onMouseEnter={(e) => { if (ranges.length > 1) e.currentTarget.style.borderColor = p.danger; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
                          aria-label="Remove range"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 6 }}>
                      {dayCount} day{dayCount === 1 ? "" : "s"} in this range
                      {r.label ? ` · "${r.label}"` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Changes */}
          <Card title="Changes to apply" padded>
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 14 }}>
              Leave a field blank to leave it untouched on each cell. Existing overrides are preserved field-by-field — we only patch what you explicitly change.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rate */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    Rate
                  </div>
                  <div className="flex gap-1.5">
                    {[
                      { id: "set",         label: "Set absolute (BHD)" },
                      { id: "uplift-pct",  label: "Uplift +%" },
                      { id: "uplift-bhd",  label: "Uplift +BHD" },
                    ].map((m) => (
                      <button key={m.id}
                        onClick={() => setRateMode(m.id)}
                        style={chipBtnStyle(p, rateMode === m.id, false)}
                        aria-pressed={rateMode === m.id}
                      >
                        {rateMode === m.id ? <Check size={11} /> : null} {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <TextField
                  type="number"
                  value={rate}
                  onChange={setRate}
                  placeholder={
                    rateMode === "set"        ? "Leave blank to keep · e.g. 48"
                    : rateMode === "uplift-pct" ? "Leave blank to keep · e.g. 10 = +10%"
                                                : "Leave blank to keep · e.g. 8 = +BHD 8"
                  }
                  suffix={rateMode === "uplift-pct" ? "%" : "BHD"}
                />
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 6, lineHeight: 1.5 }}>
                  {rateMode === "set"
                    ? "Replaces the selling rate on every targeted cell with this BHD value."
                    : rateMode === "uplift-pct"
                      ? "Recomputes per suite as weekday-base × (1 + %/100). Best for weekend uplifts and high-demand surges."
                      : "Recomputes per suite as weekday-base + BHD. Useful for fixed event surcharges."}
                </div>
              </div>

              {/* Stop-sale tri-state */}
              <FormGroup label="Stop-sale">
                <div className="flex gap-1.5">
                  {[
                    { id: "ignore", label: "No change", icon: null },
                    { id: "on",     label: "Close (stop-sale)", icon: Lock, danger: true },
                    { id: "off",    label: "Open (re-enable)",  icon: Check, success: true },
                  ].map((opt) => {
                    const sel = stopSale === opt.id;
                    const Ic = opt.icon;
                    return (
                      <button key={opt.id}
                        onClick={() => setStopSale(opt.id)}
                        style={chipBtnStyle(p, sel, false,
                          opt.danger ? p.danger : opt.success ? p.success : null)}
                        aria-pressed={sel}
                      >
                        {Ic ? <Ic size={11} /> : null} {opt.label}
                      </button>
                    );
                  })}
                </div>
              </FormGroup>

              {/* Blocked units */}
              <FormGroup label="Rooms blocked (off-market)">
                <TextField
                  type="number"
                  value={blocked}
                  onChange={setBlocked}
                  placeholder="Leave blank to keep · e.g. 4"
                />
              </FormGroup>

              {/* Meal plan override */}
              <FormGroup label="Meal plan override">
                <SelectField
                  value={mealPlan}
                  onChange={setMealPlan}
                  options={[
                    { value: "",          label: "— Leave unchanged —" },
                    { value: "__clear__", label: "Clear override (use booking's choice)" },
                    ...MEAL_PLANS.map((m) => ({ value: m.code, label: `${m.short} · ${m.label}` })),
                  ]}
                />
              </FormGroup>

              {/* Reason */}
              <FormGroup label="Reason / note" className="sm:col-span-2">
                <TextField
                  value={reason}
                  onChange={setReason}
                  placeholder="Group block · F1 weekend · Ramadan iftar HB · Maintenance · …"
                />
              </FormGroup>
            </div>
          </Card>
        </div>

        {/* Right rail — live preview */}
        <div className="space-y-6">
          <Card title="Live preview" padded>
            <div className="space-y-3">
              <PreviewRow p={p} label="Cells in scope" value={cellCount.toLocaleString()} accent={cellCount === 0 ? p.warn : p.accent} />
              <PreviewRow p={p} label="Suites" value={`${roomIds.length} of ${rooms.length}`} />
              <PreviewRow p={p} label="Ranges" value={ranges.length} />
              <PreviewRow p={p} label="Day filter" value={
                dowFilter.length === 0
                  ? "All days"
                  : dowFilter.map((d) => DOW[d]?.short).filter(Boolean).join(" · ")
              } />
              <PreviewRow p={p} label="Changes" value={
                [
                  rate !== "" ? (rateMode === "set" ? `Rate → ${formatCurrency(Number(rate) || 0)}` : `Rate uplift ${rateMode === "uplift-pct" ? `+${rate}%` : `+${formatCurrency(Number(rate) || 0)}`}`) : null,
                  blocked !== "" ? `Blocked → ${blocked}` : null,
                  stopSale === "on" ? "Stop-sale ON" : stopSale === "off" ? "Stop-sale OFF" : null,
                  mealPlan === "__clear__" ? "Meal plan cleared" : mealPlan ? `Meal plan → ${mealPlan.toUpperCase()}` : null,
                  reason !== "" ? "Reason set" : null,
                ].filter(Boolean).join(" · ") || "—"
              } accent={hasChange ? p.accent : p.textMuted} />
            </div>
            <div className="mt-4 p-3" style={{
              backgroundColor: cellCount === 0 || !hasChange ? `${p.warn}10` : `${p.success}10`,
              border: `1px solid ${cellCount === 0 || !hasChange ? p.warn : p.success}55`,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55,
              color: cellCount === 0 || !hasChange ? p.warn : p.success,
            }}>
              {cellCount === 0
                ? "Nothing in scope yet — add or widen a range and pick at least one suite."
                : !hasChange
                  ? "Pick at least one change above. Otherwise Apply would be a no-op."
                  : `Ready to apply to ${cellCount.toLocaleString()} cell${cellCount === 1 ? "" : "s"}.`}
            </div>
          </Card>

          <Card title="Existing ranges" padded>
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.76rem", lineHeight: 1.55 }}>
              Each range above is independent — overlapping ranges are deduplicated automatically, so "16–25 May + 20–30 May" only counts 16–30 once.
            </p>
            <div className="mt-3 space-y-2">
              {ranges.map((r, i) => {
                const dayCount = (() => {
                  if (!r.from || !r.to) return 0;
                  const a = new Date(r.from);
                  const b = new Date(r.to);
                  if (isNaN(a) || isNaN(b)) return 0;
                  return Math.abs(Math.round((b - a) / 86400000)) + 1;
                })();
                return (
                  <div key={r.id} className="p-2" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                    <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", fontWeight: 700 }}>
                      {r.label || `Range ${i + 1}`}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                      {r.from || "—"} → {r.to || "—"} · {dayCount}d
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </Drawer>
  );
}

// Chip-style button used inside Scope / DOW / mode rows. `selected`
// gives the active state; `accentColor` lets the tri-state stop-sale
// buttons render in red / green.
function chipBtnStyle(p, selected, _disabled, accentColor) {
  const c = accentColor || p.accent;
  return {
    padding: "0.4rem 0.8rem",
    border: `1px solid ${selected ? c : p.border}`,
    backgroundColor: selected ? `${c}1F` : "transparent",
    color: selected ? c : p.textSecondary,
    fontFamily: "'Manrope', sans-serif",
    fontSize: "0.7rem", fontWeight: 700,
    letterSpacing: "0.04em", cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}

function PreviewRow({ p, label, value, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{
        color: accent || p.textPrimary,
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.86rem",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        textAlign: "end",
        maxWidth: "65%",
      }}>{value}</span>
    </div>
  );
}
