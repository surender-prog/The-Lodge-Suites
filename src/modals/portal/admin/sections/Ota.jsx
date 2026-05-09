import React from "react";
import {
  AlertTriangle, BarChart3, Bell, CheckCircle2, Clock, Globe, RefreshCw,
  Shield, Sparkles, Wifi, Zap,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { Card, PageHeader, pushToast } from "../ui.jsx";
import { useData } from "../../../../data/store.jsx";

// ---------------------------------------------------------------------------
// OTA — placeholder home for the future direct channel-manager integration.
// The existing OTA email composer + stop-sale push lives under the
// Stop-Sale section for now; this page advertises the full integration
// roadmap and is gated as "Coming soon" until the backend connectors land.
// ---------------------------------------------------------------------------
const ROADMAP = [
  {
    icon: Wifi,
    title: "Live channel manager",
    body: "Real-time push of availability, rates and restrictions to every connected OTA — no more nightly CSV uploads.",
    eta: "Phase 1",
  },
  {
    icon: BarChart3,
    title: "Rate-parity monitor",
    body: "Continuously compare your rates across Booking.com, Expedia, Agoda and Almosafer. Alerts the moment a partner under-cuts you.",
    eta: "Phase 1",
  },
  {
    icon: Zap,
    title: "Instant stop-sale push",
    body: "Toggle stop-sale on the calendar — channels pick it up within seconds. No more hunting through five extranets.",
    eta: "Phase 1",
  },
  {
    icon: RefreshCw,
    title: "Two-way reservation sync",
    body: "OTA bookings flow into the property folio; cancellations, modifications and no-shows post back automatically.",
    eta: "Phase 2",
  },
  {
    icon: Shield,
    title: "Commission reconciliation",
    body: "Per-channel commission tracking and automated month-end statements with deduction support.",
    eta: "Phase 2",
  },
  {
    icon: Sparkles,
    title: "Yield-managed rates",
    body: "AI-driven rate suggestions that respect your contracted ceilings and flex with demand, occupancy and lead time.",
    eta: "Phase 3",
  },
];

export const Ota = () => {
  const p = usePalette();
  const { channels = [] } = useData();
  const liveChannels   = channels.filter((c) => c.status === "live").length;
  const pausedChannels = channels.filter((c) => c.status === "paused").length;

  const notify = () => pushToast({ message: "We'll let you know the moment OTA goes live." });

  return (
    <div>
      <PageHeader
        title="OTA · Channel manager"
        intro="Direct, real-time integration with online travel agencies. Today, channel updates run via the email composer in Stop-Sale; this dashboard becomes the live control room when the channel-manager API ships."
      />

      {/* Coming soon hero */}
      <div className="mb-6"
        style={{
          backgroundColor: p.bgPanel,
          border: `1px solid ${p.border}`,
          borderInlineStart: `4px solid ${p.accent}`,
          padding: "32px 36px",
          backgroundImage: `radial-gradient(circle at 100% 0%, ${p.accent}14 0%, transparent 55%)`,
        }}
      >
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span style={{
            backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
            fontFamily: "'Manrope', sans-serif",
            fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
            padding: "5px 12px",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Clock size={11} /> Coming soon
          </span>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.04em" }}>
            Targeting Q3 2026 · Phase 1 rollout
          </span>
        </div>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic",
          fontSize: "clamp(1.7rem, 3vw, 2.3rem)",
          color: p.textPrimary,
          fontWeight: 500, lineHeight: 1.1, margin: 0,
        }}>
          Direct, two-way connectivity with every channel.
        </h2>
        <p className="mt-3" style={{
          color: p.textSecondary, fontFamily: "'Manrope', sans-serif",
          fontSize: "0.92rem", lineHeight: 1.7, maxWidth: 760,
        }}>
          We're building a first-class channel manager that pushes availability and rates the moment they change in your calendar — and pulls reservations into your folio without a manual import. Until then, the existing OTA email composer (under <strong style={{ color: p.textPrimary }}>Stop-Sale</strong>) remains the source of truth.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={notify}
            style={{
              backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
              border: `1px solid ${p.accent}`,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "0.55rem 1.05rem", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <Bell size={12} /> Notify me when ready
          </button>
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
            We'll send a single email — no follow-ups.
          </span>
        </div>
      </div>

      {/* Snapshot of current connections + warning that they're informational only */}
      <Card title="Connected channels · informational" className="mb-6">
        <div className="flex items-start gap-2 p-3 mb-4"
          style={{
            backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`,
            color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
            lineHeight: 1.55,
          }}
        >
          <AlertTriangle size={14} style={{ color: p.warn, marginTop: 2, flexShrink: 0 }} />
          <span>
            Channel records below are <strong style={{ color: p.textPrimary }}>read-only previews</strong> until the API integration ships.
            Live availability/rate updates still happen through the email composer in <strong style={{ color: p.textPrimary }}>Stop-Sale</strong>.
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {channels.map((c) => {
            const live = c.status === "live";
            return (
              <div
                key={c.id}
                className="p-4"
                style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, opacity: 0.85 }}
              >
                <div className="flex items-center gap-2">
                  {c.brandColor && (
                    <span style={{
                      width: 22, height: 22, flexShrink: 0,
                      backgroundColor: c.brandColor, color: "#FFFFFF",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Cormorant Garamond', serif", fontSize: "0.78rem", fontWeight: 700,
                    }}>{c.initials || c.name?.[0]}</span>
                  )}
                  <span style={{ fontFamily: "'Manrope', sans-serif", color: p.textPrimary, fontWeight: 700, fontSize: "0.82rem" }}>{c.name}</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5"
                  style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, color: live ? p.success : p.textMuted }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: live ? p.success : p.textMuted, display: "inline-block" }} />
                  {c.status}
                </div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", marginTop: 6 }}>
                  {c.bookings7d || 0} bookings · 7d
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2"
          style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
          <Pill p={p} color={p.success} icon={<CheckCircle2 size={11} />} label={`${liveChannels} live`} />
          <Pill p={p} color={p.warn}    icon={<AlertTriangle size={11} />} label={`${pausedChannels} paused`} />
          <Pill p={p} color={p.accent}  icon={<Globe size={11} />}        label={`${channels.length} total`} />
        </div>
      </Card>

      {/* Roadmap */}
      <Card title="What's coming" padded={false} className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ borderTop: `1px solid ${p.border}` }}>
          {ROADMAP.map((item, i) => {
            const Ic = item.icon;
            const lastInRow = (i + 1) % 3 === 0;
            return (
              <div
                key={item.title}
                className="p-5"
                style={{
                  borderInlineEnd: lastInRow ? "none" : `1px solid ${p.border}`,
                  borderBottom: i < ROADMAP.length - 3 ? `1px solid ${p.border}` : "none",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span style={{
                    width: 30, height: 30, borderRadius: 999,
                    backgroundColor: `${p.accent}1A`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Ic size={14} style={{ color: p.accent }} />
                  </span>
                  <span style={{
                    color: p.accent, fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                    padding: "1px 6px", border: `1px solid ${p.accent}`, marginInlineStart: "auto",
                  }}>{item.eta}</span>
                </div>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem",
                  color: p.textPrimary, fontWeight: 600, lineHeight: 1.15, marginTop: 6,
                }}>
                  {item.title}
                </div>
                <div style={{
                  color: p.textMuted, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.82rem", lineHeight: 1.55, marginTop: 6,
                }}>
                  {item.body}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Footer note */}
      <div className="text-center" style={{
        color: p.textMuted, fontFamily: "'Manrope', sans-serif",
        fontSize: "0.78rem", lineHeight: 1.7, padding: "12px 16px",
      }}>
        Need an urgent channel update today? Use <strong style={{ color: p.textPrimary }}>Stop-Sale</strong> · Compose channel-partner notification.
      </div>
    </div>
  );
};

function Pill({ p, color, icon, label }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5"
      style={{
        backgroundColor: `${color}14`, border: `1px solid ${color}40`,
        color, fontWeight: 700, letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {icon} {label}
    </span>
  );
}
