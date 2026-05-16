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

export const CalendarView = ({ onNavigate }) => {
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

      <CellEditor selected={selected} onClose={() => setSelected(null)} occMap={occMap} onNavigate={onNavigate} />

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
