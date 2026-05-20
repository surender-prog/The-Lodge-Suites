import React, { useMemo } from "react";
import {
  AlertCircle, ArrowRight, BedDouble, Calendar as CalendarIcon, ChartPie,
  Coins, FileText, Hotel, LogIn, LogOut, Mail, Sparkles, TrendingUp, Users,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { fmtDate } from "../../../../utils/date.js";
import { useData, formatCurrency, effectiveSellLimit } from "../../../../data/store.jsx";
import { Card, PageHeader, Stat } from "../ui.jsx";

// ─────────────────────────────────────────────────────────────────────────
// Date helpers used by every dashboard computation. Everything works in
// local time so a booking with checkIn = today renders as "arriving
// today" rather than "tomorrow" because of a UTC offset.
// ─────────────────────────────────────────────────────────────────────────
function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}
// A booking is "in-house tonight" when today falls in [checkIn, checkOut).
// Status filter keeps cancelled / pending stays out. Pending isn't
// occupying a room yet so we exclude it too.
function isInHouseOn(booking, dateISO) {
  if (!booking?.checkIn || !booking?.checkOut) return false;
  if (["cancelled", "no-show"].includes(booking.status)) return false;
  return dateISO >= booking.checkIn && dateISO < booking.checkOut;
}
function nightsInRange(booking, fromISO, toExclusiveISO) {
  if (!booking?.checkIn || !booking?.checkOut) return 0;
  if (["cancelled", "no-show"].includes(booking.status)) return 0;
  const lo = booking.checkIn > fromISO ? booking.checkIn : fromISO;
  const hi = booking.checkOut < toExclusiveISO ? booking.checkOut : toExclusiveISO;
  if (lo >= hi) return 0;
  const a = new Date(lo); a.setHours(0, 0, 0, 0);
  const b = new Date(hi); b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

// ---------------------------------------------------------------------------
// Channel mix — counts bookings from the last 30 days (by check-in date) and
// groups them by their `source` field (direct / ota / corporate / agent /
// member). We surface only buckets that have at least one booking so the
// donut doesn't have hairline slices for empty segments. Each row links to a
// section that gives the operator more context for that channel.
// ---------------------------------------------------------------------------
function buildChannelMix({ bookings, p, todayISO }) {
  const cutoffISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalISO(d);
  })();
  const buckets = { direct: 0, ota: 0, corporate: 0, agent: 0, member: 0 };
  (bookings || []).forEach((b) => {
    if (!b?.checkIn || b.checkIn < cutoffISO || b.checkIn > todayISO) return;
    if (["cancelled", "no-show"].includes(b.status)) return;
    const src = b.source || "direct";
    if (buckets[src] !== undefined) buckets[src] += 1;
  });
  const total = Object.values(buckets).reduce((s, n) => s + n, 0);
  // Display order — Direct first (it's the most valuable channel for the
  // hotel), member next (loyalty), then OTAs and partner accounts.
  const rows = [
    { id: "direct",    label: "Direct",       count: buckets.direct,    color: p.accent,        nav: { tab: "bookings" } },
    { id: "member",    label: "LS Privilege", count: buckets.member,    color: p.warn,          nav: { tab: "admin", sub: "loyalty" } },
    { id: "ota",       label: "OTA channels", count: buckets.ota,       color: p.accentBright,  nav: { tab: "admin", sub: "stopsale" } },
    { id: "corporate", label: "Corporate",    count: buckets.corporate, color: p.accentDeep,    nav: { tab: "corporate" } },
    { id: "agent",     label: "Travel agent", count: buckets.agent,     color: p.success,       nav: { tab: "agent" } },
  ];
  // Compute percentages; when total is zero the donut renders as a hairline
  // empty ring (each row gets an equal share so the SVG still draws something
  // meaningful instead of NaN paths).
  if (total === 0) {
    return { rows: rows.map((r) => ({ ...r, pct: 0 })), total };
  }
  return {
    rows: rows.map((r) => ({ ...r, pct: Math.round((r.count / total) * 100) })),
    total,
  };
}

// ---------------------------------------------------------------------------
// Heatmap data — one row per room TYPE, 14 columns starting today.
//   • inventory per type = the effective sell limit (master admin cap, or
//     active room_units count when no override is set). Lets the operator
//     hold inventory back / overbook from one place without touching the
//     room_units registry.
//   • sold-on-day = bookings whose roomId matches the type and the day falls
//     within [checkIn, checkOut). Cancelled / no-show stays are excluded.
//   • stop-sale = any calendar override for this type-day with stopSale=true.
//   • occ fraction = clamped (sold / inventory) so a fully-booked type still
//     renders as the strong "sold-out" cell even if our sample bookings
//     temporarily over-count a type because the seed data isn't unit-aware.
// ---------------------------------------------------------------------------
function makeHeatmap({ rooms, bookings, roomUnits, calendar }) {
  const days = 14;
  const today = startOfToday();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
  const rows = (rooms || []).map((r) => {
    // effectiveSellLimit applies the admin's master cap. Clamp to 1 so
    // a newly-created type with no inventory yet still renders a cell.
    const inventory = Math.max(effectiveSellLimit(r, roomUnits || []), 1);
    const cells = dates.map((d) => {
      const dateISO = toLocalISO(d);
      // Sold count — every active booking that overlaps this date for this type
      const sold = (bookings || []).reduce((n, b) => {
        if (b.roomId !== r.id) return n;
        return n + (isInHouseOn(b, dateISO) ? 1 : 0);
      }, 0);
      const key = `${r.id}|${dateISO}`;
      const stop = !!(calendar && calendar[key] && calendar[key].stopSale);
      const occ = Math.min(1, sold / inventory);
      const soldOut = !stop && occ >= 1;
      return { occ, stop, sold: soldOut, count: sold, inventory };
    });
    return { roomId: r.id, cells };
  });
  return { rows, dates };
}

function cellColor(p, cell) {
  if (cell.stop) return p.danger;
  if (cell.sold) return p.accent;
  const a = Math.max(0.06, cell.occ * 0.55);
  return p.theme === "light"
    ? `rgba(154, 126, 64, ${a.toFixed(2)})`
    : `rgba(201, 169, 97, ${a.toFixed(2)})`;
}

export const Dashboard = ({ onNavigate }) => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const {
    rooms, bookings, expiringContracts,
    roomUnits, calendar, members,
  } = useData();

  // ─────────────────────────────────────────────────────────────────
  // Live operational metrics — every tile on this dashboard reads
  // from a single useMemo so a state change (new booking, new stop-
  // sale, member upgrade) refreshes the cards without re-rendering
  // the whole tree. todayISO is captured once per render so all the
  // memos compare against the same date boundary.
  // ─────────────────────────────────────────────────────────────────
  const todayISO = toLocalISO(new Date());

  // Sellable inventory — sum of each type's effective sell limit. The
  // limit defaults to active room_units count but is overridable per
  // type in Rooms & Rates → Room editor → "Max units released for
  // sale". Falls back to the legacy 72 only when both rooms and
  // room_units are empty (very early hydration).
  const sellableInventory = useMemo(() => {
    if (!rooms || rooms.length === 0) return (roomUnits || []).length || 72;
    return rooms.reduce(
      (sum, r) => sum + effectiveSellLimit(r, roomUnits || []),
      0
    );
  }, [rooms, roomUnits]);

  // Tonight occupancy — count bookings that are in-house on today.
  // We treat any booking that straddles today as in-house, regardless
  // of its `status` field, so the dashboard agrees with the calendar
  // even when the front desk hasn't manually flipped a booking to
  // in-house yet (e.g. early-morning arrivals).
  const tonightStats = useMemo(() => {
    const sold = (bookings || []).filter((b) => isInHouseOn(b, todayISO)).length;
    const pct = sellableInventory > 0
      ? Math.round((sold / sellableInventory) * 100)
      : 0;
    return { sold, pct, inventory: sellableInventory };
  }, [bookings, sellableInventory, todayISO]);

  // Active stop-sales — count distinct *type-days* in the future (or
  // today) that carry a stopSale flag. Past stop-sales aren't actionable
  // any more, so they're excluded from the headline number.
  const stopSaleCount = useMemo(() => {
    if (!calendar) return 0;
    let n = 0;
    Object.entries(calendar).forEach(([key, v]) => {
      if (!v?.stopSale) return;
      const parts = key.split("|");
      const dateISO = parts[1];
      if (!dateISO) return;
      if (dateISO >= todayISO) n += 1;
    });
    return n;
  }, [calendar, todayISO]);

  // ADR + RevPAR (MTD) — month-to-date. We compute revenue as the room
  // rate × nights-in-MTD for every booking that overlaps the MTD window
  // and isn't cancelled. Falls back to `total / nights` if `rate` is
  // missing on a record. Available room-nights = inventory × days-elapsed.
  const mtdStats = useMemo(() => {
    const monthStart = startOfMonth();
    const tomorrow = new Date(); tomorrow.setHours(0,0,0,0); tomorrow.setDate(tomorrow.getDate() + 1);
    const fromISO = toLocalISO(monthStart);
    const toExclusiveISO = toLocalISO(tomorrow);
    let revenue = 0;
    let nightsSold = 0;
    (bookings || []).forEach((b) => {
      const n = nightsInRange(b, fromISO, toExclusiveISO);
      if (n <= 0) return;
      const perNight = Number(b.rate)
        || (b.total && b.nights ? Number(b.total) / Number(b.nights) : 0)
        || 0;
      nightsSold += n;
      revenue += perNight * n;
    });
    const daysElapsed = daysBetween(monthStart, tomorrow); // inclusive of today
    const availableNights = Math.max(1, sellableInventory * daysElapsed);
    return {
      adr: nightsSold > 0 ? revenue / nightsSold : 0,
      revpar: availableNights > 0 ? revenue / availableNights : 0,
      revenue, nightsSold, availableNights,
    };
  }, [bookings, sellableInventory]);

  // Today snapshot — arrivals (checkIn === today), departures
  // (checkOut === today), in-house (overlaps tonight) and VIPs
  // (in-house guests who are platinum LS Privilege members). Matching
  // a member uses the booking email since bookings don't carry a
  // memberId yet.
  const todayStats = useMemo(() => {
    const live = (b) => !["cancelled", "no-show"].includes(b?.status);
    const arrivals   = (bookings || []).filter((b) => live(b) && b.checkIn  === todayISO).length;
    const departures = (bookings || []).filter((b) => live(b) && b.checkOut === todayISO).length;
    const inHouse    = (bookings || []).filter((b) => isInHouseOn(b, todayISO)).length;
    const platinumEmails = new Set(
      (members || [])
        .filter((m) => (m.tier || "").toLowerCase() === "platinum")
        .map((m) => (m.email || "").toLowerCase())
        .filter(Boolean)
    );
    const vip = (bookings || []).filter((b) =>
      isInHouseOn(b, todayISO) && platinumEmails.has((b.email || "").toLowerCase())
    ).length;
    return { arrivals, departures, inHouse, vip };
  }, [bookings, members, todayISO]);

  // Channel mix — recomputed when bookings or palette change.
  const channelMix = useMemo(
    () => buildChannelMix({ bookings, p, todayISO }),
    [bookings, p, todayISO]
  );

  // MTD revenue formatted — used as a sub-label so the operator sees
  // the absolute number behind ADR/RevPAR without opening Reports.
  const mtdRevenueFmt = useMemo(
    () => formatCurrency(Math.round(mtdStats.revenue)),
    [mtdStats.revenue]
  );

  // Safe wrapper — falls back to a no-op if the parent didn't supply a nav
  // handler (e.g. when the Dashboard is rendered standalone in tests).
  const go = (target, sub, params) => {
    if (typeof onNavigate === "function") onNavigate(target, sub, params);
  };

  return (
    <div>
      <PageHeader title="Hotel Operations" intro="Inventory, channel distribution, and partner communications. Tap any tile to open the matching section." />

      {/* Renewal warning — surfaces every active corporate / agency contract
          expiring in 15 days or less so account managers can chase a
          counter-signed renewal before the rate sheet lapses. */}
      {expiringContracts && expiringContracts.length > 0 && (
        <ExpiringContractsBanner items={expiringContracts} p={p} go={go} />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Tonight"
          value={`${tonightStats.sold}/${tonightStats.inventory}`}
          hint={`${tonightStats.pct}% occ.`}
          color={tonightStats.pct >= 80 ? p.success : tonightStats.pct >= 60 ? p.warn : p.danger}
          onClick={() => go("admin", "calendar")}
          ctaLabel="Open calendar"
        />
        <Stat
          label="Active Stop-Sales"
          value={String(stopSaleCount)}
          hint={stopSaleCount > 0 ? "Action needed" : "All channels open"}
          color={stopSaleCount > 0 ? p.warn : p.success}
          onClick={() => go("admin", "stopsale")}
          ctaLabel="Manage stop-sale"
        />
        <Stat
          label="ADR (MTD)"
          value={formatCurrency(mtdStats.adr)}
          hint={`${mtdStats.nightsSold} room-night${mtdStats.nightsSold === 1 ? "" : "s"} sold`}
          onClick={() => go("admin", "calendar")}
          ctaLabel="Open rates"
        />
        <Stat
          label="RevPAR (MTD)"
          value={formatCurrency(mtdStats.revpar)}
          hint={`Revenue ${mtdRevenueFmt}`}
          onClick={() => go("admin", "calendar")}
          ctaLabel="Open rates"
        />
      </div>

      {/* Today snapshot + channel mix */}
      <div className="grid lg:grid-cols-3 gap-4 mt-7">
        <Card title="Today" action={<span style={{ color: p.textMuted, fontSize: "0.72rem", fontFamily: "'Manrope', sans-serif" }}>{fmtDate(new Date().toISOString().slice(0,10), lang)}</span>} padded={false} className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[
              { id: "arrivals",   label: "Arrivals",     value: todayStats.arrivals,   icon: LogIn,    color: p.success,     onClick: () => go("bookings"),       cta: "View bookings" },
              { id: "departures", label: "Departures",   value: todayStats.departures, icon: LogOut,   color: p.warn,        onClick: () => go("bookings"),       cta: "View bookings" },
              { id: "inHouse",    label: "In-house",     value: todayStats.inHouse,    icon: Users,    color: p.textPrimary, onClick: () => go("bookings"),       cta: "View bookings" },
              { id: "vip",        label: "VIPs",         value: todayStats.vip,        icon: Sparkles, color: p.accent,      onClick: () => go("admin", "loyalty"), cta: "Open LS Privilege" },
            ].map((m, i, all) => {
              const Ic = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={m.onClick}
                  className="p-5 group transition-colors text-start"
                  style={{
                    borderInlineEnd: i < all.length - 1 ? `1px solid ${p.border}` : "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Ic size={18} style={{ color: m.color }} />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                    >→</div>
                  </div>
                  <div className="mt-3" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.1rem", color: m.color, fontWeight: 500, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6 }}>{m.label}</div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5"
                    style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                  >{m.cta}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card
          title={<><ChartPie size={13} className="inline mr-1.5" /> Channel mix · 30d</>}
          padded={false}
          action={
            <button onClick={() => go("admin", "stopsale")} className="inline-flex items-center gap-1.5"
              title="Manage channels"
              style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
            >Manage <ArrowRight size={11} /></button>
          }
        >
          <div className="p-5 flex items-center gap-5">
            <ChannelDonut data={channelMix.rows} size={120} empty={channelMix.total === 0} p={p} />
            <div className="flex-1 min-w-0 space-y-0.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
              {channelMix.total === 0 && (
                <div style={{ color: p.textMuted, fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}>
                  No bookings in the last 30 days.
                </div>
              )}
              {channelMix.rows.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(c.nav.tab, c.nav.sub)}
                  className="flex items-center gap-2 w-full px-2 py-1 transition-colors"
                  style={{ backgroundColor: "transparent", cursor: "pointer", textAlign: "start" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  title={c.nav.tab === "admin" ? "Open Stop-Sale & OTA" : c.nav.tab === "bookings" ? "View bookings" : c.nav.tab === "corporate" ? "Open Corporate Accounts" : c.nav.tab === "agent" ? "Open Travel Agencies" : "Open LS Privilege"}
                >
                  <span style={{ width: 8, height: 8, backgroundColor: c.color, flexShrink: 0 }} />
                  <span style={{ color: p.textSecondary, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                  <span style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {channelMix.total === 0 ? "—" : `${c.pct}%`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Quick action shortcuts — open commonly-used admin sub-sections in
          one click without going through the Hotel Admin tab nav. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
        <Shortcut label="Calendar"   icon={CalendarIcon} onClick={() => go("admin", "calendar")} p={p} />
        <Shortcut label="Rooms & rates" icon={Hotel}     onClick={() => go("admin", "rooms")} p={p} />
        <Shortcut label="LS Privilege" icon={Sparkles}   onClick={() => go("admin", "loyalty")} p={p} />
        <Shortcut label="Invoices"   icon={FileText}     onClick={() => go("admin", "invoices")} p={p} />
        <Shortcut label="Email templates" icon={Mail}    onClick={() => go("admin", "emails")} p={p} />
        <Shortcut label="Stop-Sale & OTA" icon={AlertCircle} onClick={() => go("admin", "stopsale")} danger p={p} />
      </div>

      {/* 14-day heat-map */}
      <Heatmap
        rooms={rooms}
        bookings={bookings}
        roomUnits={roomUnits}
        calendar={calendar}
        onCellClick={() => go("admin", "calendar")}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// ExpiringContractsBanner — gold-on-amber warning rail listing each contract
// (corporate or agency) due to expire within 15 days. Clicking through routes
// to the matching tab so the account manager can pull up the editor and chase
// a renewal. Renders nothing when the list is empty (the parent gates that
// already, but the guard is defensive).
// ---------------------------------------------------------------------------
function ExpiringContractsBanner({ items, p, go }) {
  if (!items || items.length === 0) return null;
  const tone = p.warn;
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  return (
    <div className="mb-6 p-4 flex items-start gap-3" style={{
      backgroundColor: `${tone}14`,
      border: `1px solid ${tone}55`,
      borderInlineStart: `4px solid ${tone}`,
    }}>
      <AlertCircle size={18} style={{ color: tone, flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <div style={{
          color: tone, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
          letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
        }}>
          {items.length} contract{items.length === 1 ? "" : "s"} expire in 15 days or less
        </div>
        <div className="mt-2 space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 flex-wrap" style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textPrimary,
            }}>
              <div className="min-w-0">
                <span style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginInlineEnd: 6 }}>
                  {it.kind === "corporate" ? "Corporate" : "Agent"}
                </span>
                <strong style={{ color: p.textPrimary }}>{it.accountName}</strong>
                <span style={{ color: p.textMuted, marginInlineStart: 6, fontSize: "0.78rem" }}>· {it.accountId}</span>
              </div>
              <div className="flex items-center gap-3" style={{ fontSize: "0.78rem" }}>
                <span style={{ color: it.daysLeft <= 7 ? p.danger : tone, fontWeight: 700 }}>
                  {it.daysLeft} day{it.daysLeft === 1 ? "" : "s"} left
                </span>
                <span style={{ color: p.textMuted }}>· ends {fmt(it.endsOn)}</span>
                <button
                  type="button"
                  onClick={() => go(it.kind === "corporate" ? "corporate" : "agent", null, { contractId: it.accountId })}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                    letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                    padding: "0.3rem 0.7rem", border: `1px solid ${p.accent}`,
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.accent}14`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  Review contract <ArrowRight size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Shortcut({ label, icon: Icon, onClick, danger, p }) {
  const c = danger ? p.danger : p.accent;
  return (
    <button
      onClick={onClick}
      className="p-4 transition-colors"
      style={{
        backgroundColor: p.bgPanel,
        border: `1px solid ${p.border}`,
        textAlign: "start",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = c; e.currentTarget.style.backgroundColor = p.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = p.bgPanel; }}
    >
      <Icon size={18} style={{ color: c }} />
      <div className="mt-2" style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700, letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ color: c, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 2 }}>
        Open →
      </div>
    </button>
  );
}

function ChannelDonut({ data, size = 120, empty = false, p }) {
  const r = size / 2;
  const inner = r * 0.62;
  // Empty state — render a single ring outline so the card still has visual
  // presence when there are zero recent bookings.
  if (empty) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={r} cy={r} r={r - 1} fill="none" stroke={p ? p.border : "#d4cdb6"} strokeWidth="1" />
        <circle cx={r} cy={r} r={inner + 1} fill="none" stroke={p ? p.border : "#d4cdb6"} strokeWidth="1" />
      </svg>
    );
  }
  const total = data.reduce((s, d) => s + (d.pct || 0), 0) || 100;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {data.filter((d) => d.pct > 0).map((d, i) => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += d.pct;
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const large = d.pct / total > 0.5 ? 1 : 0;
        const x1 = r + r * Math.cos(start), y1 = r + r * Math.sin(start);
        const x2 = r + r * Math.cos(end),   y2 = r + r * Math.sin(end);
        const xi1 = r + inner * Math.cos(end),   yi1 = r + inner * Math.sin(end);
        const xi2 = r + inner * Math.cos(start), yi2 = r + inner * Math.sin(start);
        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi2} ${yi2} Z`;
        return <path key={d.id || i} d={path} fill={d.color} />;
      })}
    </svg>
  );
}

function Heatmap({ rooms, bookings, roomUnits, calendar, onCellClick }) {
  const t = useT();
  const { lang } = useLang();
  const p = usePalette();
  const { rows, dates } = React.useMemo(
    () => makeHeatmap({ rooms, bookings, roomUnits, calendar }),
    [rooms, bookings, roomUnits, calendar]
  );
  const dayLabel = (d) => d.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { day: "numeric", month: "short" });
  const todayKey = toLocalISO(new Date());

  return (
    <Card
      title="Inventory · next 14 days"
      action={
        <div className="flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
          {[
            { color: p.cellBase, label: "Open" },
            { color: p.theme === "light" ? "rgba(154,126,64,0.45)" : "rgba(201,169,97,0.45)", label: "Busy" },
            { color: p.accent, label: "Sold out" },
            { color: p.danger, label: "Stop-sale" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, backgroundColor: l.color, border: `1px solid ${p.border}` }} />
              {l.label}
            </div>
          ))}
          {onCellClick && (
            <button onClick={onCellClick} className="inline-flex items-center gap-1.5"
              style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginInlineStart: 6 }}
            >Edit calendar <ArrowRight size={11} /></button>
          )}
        </div>
      }
      padded={false}
      className="mt-7"
    >
      <div className="overflow-x-auto p-4">
        <div style={{ display: "grid", gridTemplateColumns: `minmax(140px, 1fr) repeat(${dates.length}, minmax(34px, 1fr))`, gap: 4, fontFamily: "'Manrope', sans-serif" }}>
          <div />
          {dates.map((d) => {
            const isToday = toLocalISO(d) === todayKey;
            return (
              <div key={d.toISOString()} className="text-center" style={{
                fontSize: "0.6rem", color: isToday ? p.accent : p.textMuted, letterSpacing: "0.04em",
                lineHeight: 1.2, padding: "4px 0",
                borderBottom: isToday ? `1px solid ${p.accent}` : "1px solid transparent",
                fontWeight: isToday ? 700 : 500,
              }}>
                {dayLabel(d)}
              </div>
            );
          })}
          {rows.map((row) => (
            <React.Fragment key={row.roomId}>
              <div className="flex items-center" style={{
                fontFamily: "'Cormorant Garamond', serif", fontSize: "0.92rem", color: p.textPrimary,
                paddingInlineEnd: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {t(`rooms.${row.roomId}.name`)}
              </div>
              {row.cells.map((cell, di) => {
                const occPct = Math.round(cell.occ * 100);
                const tooltipStatus = cell.stop
                  ? "Stop-sale"
                  : cell.sold
                    ? `Sold out · ${cell.count}/${cell.inventory}`
                    : `${occPct}% · ${cell.count}/${cell.inventory} sold`;
                return (
                  <button
                    key={di}
                    onClick={onCellClick}
                    title={`${dayLabel(dates[di])} · ${tooltipStatus} · click to open calendar`}
                    style={{
                      backgroundColor: cellColor(p, cell),
                      height: 26,
                      border: `1px solid ${p.border}`,
                      cursor: "pointer",
                      transition: "transform 120ms",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.06)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Card>
  );
}
