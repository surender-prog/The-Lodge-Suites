import React from "react";
import {
  AlertCircle, ArrowRight, BedDouble, Calendar as CalendarIcon, ChartPie,
  Coins, FileText, Hotel, LogIn, LogOut, Mail, Sparkles, TrendingUp, Users,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { fmtDate } from "../../../../utils/date.js";
import { useData } from "../../../../data/store.jsx";
import { Card, PageHeader, Stat } from "../ui.jsx";

// ---------------------------------------------------------------------------
// Channel mix — links each channel to a meaningful destination. Most channel
// rows route to Hotel Admin → Stop-Sale & OTA where the channel manager
// status, rate-push, and stop-sale tools live; the Direct row routes to the
// Bookings tab so the operator can see who came in directly.
// ---------------------------------------------------------------------------
function makeChannelMix(p) {
  return [
    { id: "direct",     label: "Direct",       pct: 38, color: p.accent,        nav: { tab: "bookings" } },
    { id: "booking",    label: "Booking.com",  pct: 22, color: p.accentBright,  nav: { tab: "admin", sub: "stopsale" } },
    { id: "almosafer",  label: "Almosafer",    pct: 14, color: p.accentDeep,    nav: { tab: "admin", sub: "stopsale" } },
    { id: "expedia",    label: "Expedia",      pct: 11, color: p.success,       nav: { tab: "admin", sub: "stopsale" } },
    { id: "agoda",      label: "Agoda",        pct:  8, color: p.warn,          nav: { tab: "admin", sub: "stopsale" } },
    { id: "corporate",  label: "Corporate",    pct:  7, color: p.textMuted,     nav: { tab: "corporate" } },
  ];
}

function makeHeatmap(rooms) {
  const days = 14;
  const today = new Date();
  const rows = rooms.map((r, ri) => {
    const cells = Array.from({ length: days }, (_, di) => {
      const seed = (ri + 1) * 31 + di * 17 + r.price;
      const occ = ((Math.sin(seed) + 1) / 2);
      const stop = (ri === 2 && di >= 3 && di <= 5);
      const sold = !stop && occ > 0.85;
      return { occ, stop, sold };
    });
    return { roomId: r.id, cells };
  });
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
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
  const { rooms, bookings, expiringContracts } = useData();

  const tonightSold = bookings.filter(b => b.status === "in-house").length + 56;
  const occPct = Math.round(tonightSold / 72 * 100);

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
          value={`${tonightSold}/72`}
          hint={`${occPct}% occ.`}
          color={occPct >= 80 ? p.success : occPct >= 60 ? p.warn : p.danger}
          onClick={() => go("admin", "calendar")}
          ctaLabel="Open calendar"
        />
        <Stat
          label="Active Stop-Sales"
          value="1"
          hint="Action needed"
          color={p.warn}
          onClick={() => go("admin", "stopsale")}
          ctaLabel="Manage stop-sale"
        />
        <Stat
          label="ADR (MTD)"
          value={`${t("common.bhd")} 64`}
          hint="+BHD 4 vs LY"
          onClick={() => go("admin", "calendar")}
          ctaLabel="Open rates"
        />
        <Stat
          label="RevPAR (MTD)"
          value={`${t("common.bhd")} 51`}
          hint="+12% YoY"
          onClick={() => go("admin", "calendar")}
          ctaLabel="Open rates"
        />
      </div>

      {/* Today snapshot + channel mix */}
      <div className="grid lg:grid-cols-3 gap-4 mt-7">
        <Card title="Today" action={<span style={{ color: p.textMuted, fontSize: "0.72rem", fontFamily: "'Manrope', sans-serif" }}>{fmtDate(new Date().toISOString().slice(0,10), lang)}</span>} padded={false} className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[
              { id: "arrivals",   label: "Arrivals",     value: 14, icon: LogIn,    color: p.success,     onClick: () => go("bookings"),       cta: "View bookings" },
              { id: "departures", label: "Departures",   value: 11, icon: LogOut,   color: p.warn,        onClick: () => go("bookings"),       cta: "View bookings" },
              { id: "inHouse",    label: "In-house",     value: 58, icon: Users,    color: p.textPrimary, onClick: () => go("bookings"),       cta: "View bookings" },
              { id: "vip",        label: "VIPs",         value:  3, icon: Sparkles, color: p.accent,      onClick: () => go("admin", "loyalty"), cta: "Open LS Privilege" },
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
            <ChannelDonut data={makeChannelMix(p)} size={120} />
            <div className="flex-1 min-w-0 space-y-0.5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
              {makeChannelMix(p).map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(c.nav.tab, c.nav.sub)}
                  className="flex items-center gap-2 w-full px-2 py-1 transition-colors"
                  style={{ backgroundColor: "transparent", cursor: "pointer", textAlign: "start" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  title={c.nav.tab === "admin" ? "Open Stop-Sale & OTA" : c.nav.tab === "bookings" ? "View bookings" : "Open Corporate Accounts"}
                >
                  <span style={{ width: 8, height: 8, backgroundColor: c.color, flexShrink: 0 }} />
                  <span style={{ color: p.textSecondary, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                  <span style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.pct}%</span>
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
      <Heatmap rooms={rooms} onCellClick={() => go("admin", "calendar")} />
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

function ChannelDonut({ data, size = 120 }) {
  const r = size / 2;
  const inner = r * 0.62;
  const total = data.reduce((s, d) => s + d.pct, 0) || 100;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {data.map((d, i) => {
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

function Heatmap({ rooms, onCellClick }) {
  const t = useT();
  const { lang } = useLang();
  const p = usePalette();
  const { rows, dates } = React.useMemo(() => makeHeatmap(rooms), [rooms]);
  const dayLabel = (d) => d.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", { day: "numeric", month: "short" });
  const todayKey = new Date().toISOString().slice(0, 10);

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
            const isToday = d.toISOString().slice(0, 10) === todayKey;
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
                return (
                  <button
                    key={di}
                    onClick={onCellClick}
                    title={`${dayLabel(dates[di])} · ${cell.stop ? "Stop-sale" : cell.sold ? "Sold out" : `${occPct}%`} · click to open calendar`}
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
