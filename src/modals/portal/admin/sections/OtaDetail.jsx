import React, { useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowDown, ArrowDownCircle, ArrowUpCircle, Check, Coins,
  Eye, EyeOff, Inbox, Link2, Mail, Pause, Play, Plus, RefreshCw, Save, Send,
  Settings, Shield, Sliders, TrendingUp, Trash2, Wifi, WifiOff, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT } from "../../../../i18n/LanguageContext.jsx";
import { useData } from "../../../../data/store.jsx";
import {
  Card, FormGroup, GhostBtn, PrimaryBtn, pushToast, SelectField, TableShell,
  Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// OtaChannelDrawer — full-page detail page for one OTA / channel-manager
// connection. Six tabs: Overview · Connection · Commercial · Mappings ·
// Sync log · Communications.
//
// Reads the live channel from `useData().channels` (so external mutations
// reflect instantly) and writes back through `upsertChannel`.
// ---------------------------------------------------------------------------

const STATUS_VISUAL = {
  live:   { label: "Live",   color: "#16A34A" },
  paused: { label: "Paused", color: "#64748B" },
  error:  { label: "Error",  color: "#DC2626" },
};

const PARITY_VISUAL = {
  ok:   { label: "Parity OK",   color: "#16A34A" },
  warn: { label: "Parity warn", color: "#D97706" },
  fail: { label: "Parity fail", color: "#DC2626" },
  "n/a":{ label: "N/A",         color: "#64748B" },
};

const PAYMENT_MODELS = [
  { value: "commission", label: "Commission · OTA collects, settles after stay" },
  { value: "merchant",   label: "Merchant of record · OTA collects, settles Net" },
  { value: "net-rate",   label: "Net rate · OTA charges its own price"           },
  { value: "prepaid",    label: "Pre-paid · OTA collects in full upfront"        },
];

const SYNC_TYPE_VISUAL = {
  "push.availability": { label: "Push availability", icon: ArrowUpCircle, color: "#2563EB" },
  "push.rates":        { label: "Push rates",        icon: ArrowUpCircle, color: "#7C3AED" },
  "push.restrictions": { label: "Push restrictions", icon: ArrowUpCircle, color: "#7C3AED" },
  "pull.bookings":     { label: "Pull bookings",     icon: ArrowDownCircle, color: "#16A34A" },
  "pull.cancellations":{ label: "Pull cancellations",icon: ArrowDownCircle, color: "#D97706" },
  "config.update":     { label: "Config update",     icon: Settings,      color: "#64748B" },
};

const fmtBhd = (n) => `BHD ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}`;
const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const relTime = (iso) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export function OtaChannelDrawer({ channel: initialChannel, onClose }) {
  const p = usePalette();
  const t = useT();
  const { channels, rooms, upsertChannel, toggleChannelStatus, appendChannelSyncEvent } = useData();

  // Always read the latest record from the store so toggles / saves reflect live.
  const channel = channels.find((c) => c.id === initialChannel.id) || initialChannel;

  const [tab, setTab] = useState("overview");

  if (!channel) return null;

  const status = STATUS_VISUAL[channel.status] || STATUS_VISUAL.paused;
  const parity = PARITY_VISUAL[channel.parity] || PARITY_VISUAL["n/a"];

  const triggerPush = () => {
    appendChannelSyncEvent(channel.id, {
      type: "push.availability", status: "success",
      message: "Manual push · 30 days × " + (channel.roomMap?.filter(m => m.linked).length || 0) + " rooms",
    });
    pushToast({ message: `Availability pushed to ${channel.name}` });
  };
  const togglePause = () => {
    toggleChannelStatus(channel.id);
    appendChannelSyncEvent(channel.id, {
      type: "config.update", status: "success",
      message: channel.status === "live" ? "Channel paused by operator" : "Channel resumed by operator",
    });
    pushToast({ message: channel.status === "live" ? `${channel.name} paused` : `${channel.name} resumed`, kind: channel.status === "live" ? "warn" : "success" });
  };
  const testConnection = () => {
    appendChannelSyncEvent(channel.id, {
      type: "config.update", status: "success",
      message: "Connection test · OK · 124ms round-trip",
    });
    pushToast({ message: `${channel.name} · connection healthy (124ms)` });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="flex items-center gap-3 min-w-0">
          <div style={{
            width: 44, height: 44, flexShrink: 0,
            backgroundColor: channel.brandColor || p.accent,
            color: "#FFFFFF",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 700,
            border: `1px solid ${channel.brandColor || p.accent}`,
          }}>{channel.initials || channel.name?.[0] || "?"}</div>
          <div className="min-w-0">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
              OTA channel · {channel.id}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
              {channel.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={testConnection}
            className="inline-flex items-center gap-2"
            style={{ padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, backgroundColor: "transparent" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
          ><Activity size={11} /> Test connection</button>
          <button onClick={triggerPush} disabled={channel.status === "paused"}
            className="inline-flex items-center gap-2"
            style={{
              padding: "0.45rem 0.85rem",
              backgroundColor: channel.status === "paused" ? "transparent" : p.accent,
              color: channel.status === "paused" ? p.textDim : (p.theme === "light" ? "#FFFFFF" : "#15161A"),
              border: `1px solid ${channel.status === "paused" ? p.border : p.accent}`,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              cursor: channel.status === "paused" ? "not-allowed" : "pointer",
            }}
          ><RefreshCw size={11} /> Push availability</button>
          <button onClick={togglePause}
            className="inline-flex items-center gap-2"
            style={{
              padding: "0.45rem 0.85rem",
              backgroundColor: "transparent",
              color: channel.status === "live" ? p.warn : p.success,
              border: `1px solid ${channel.status === "live" ? p.warn : p.success}`,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
          >
            {channel.status === "live" ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2"
            style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}` }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          ><X size={14} /> Close</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
          {/* Identity banner */}
          <div className="p-5 mb-6 flex items-center gap-4 flex-wrap" style={{
            backgroundColor: `${channel.brandColor || p.accent}10`,
            border: `1px solid ${channel.brandColor || p.accent}40`,
            borderInlineStart: `4px solid ${channel.brandColor || p.accent}`,
          }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5" style={chipStyle(status.color)}>
                <span style={dotStyle(status.color)} />
                {channel.status === "live" ? <Wifi size={10} /> : <WifiOff size={10} />}
                {status.label}
              </span>
              <span className="inline-flex items-center gap-1.5" style={chipStyle(parity.color)}>
                <span style={dotStyle(parity.color)} />
                {parity.label}
              </span>
              {channel.parity === "warn" && (
                <span style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 600 }}>
                  · Action recommended
                </span>
              )}
            </div>
            <div className="flex-1" />
            <div className="text-end" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", color: p.textMuted }}>
              <div>Last sync: <strong style={{ color: p.textPrimary }}>{relTime(channel.lastSyncAt)}</strong> · {fmtTime(channel.lastSyncAt)}</div>
              <div style={{ marginTop: 2 }}>Endpoint: <code style={{ fontFamily: "ui-monospace, Menlo, monospace", color: p.textSecondary }}>{channel.endpoint || "—"}</code></div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-6" style={{ backgroundColor: p.border }}>
            <KpiTile label="Bookings · 7d"  value={channel.bookings7d || 0}                    hint={`${channel.bookings30d || 0} this month · ${channel.bookingsYtd || 0} YTD`} icon={Inbox}        color={p.textPrimary} p={p} />
            <KpiTile label="Revenue · 30d"   value={fmtBhd(channel.revenue30d || 0)}            hint={`${fmtBhd(channel.revenueYtd || 0)} YTD`}                                                          icon={Coins}        color={p.success}     p={p} />
            <KpiTile label="Avg ADR"          value={fmtBhd(channel.avgAdr || 0)}                hint={`${channel.commissionPct || 0}% commission · ${channel.paymentTerms || "—"}`}                  icon={TrendingUp}   color={p.accent}      p={p} />
            <KpiTile label="Cancellation rate" value={`${(channel.cancellationRate || 0).toFixed(1)}%`} hint={(channel.cancellationRate || 0) > 15 ? "Above book-level" : "Within target"}                                                            icon={AlertCircle}  color={(channel.cancellationRate || 0) > 15 ? p.warn : p.success} p={p} />
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <Tab id="overview"  label="Overview"      active={tab === "overview"}  onClick={() => setTab("overview")}  p={p} />
            <Tab id="connection" label="Connection"    active={tab === "connection"} onClick={() => setTab("connection")} p={p} />
            <Tab id="commercial" label="Commercial"    active={tab === "commercial"} onClick={() => setTab("commercial")} p={p} />
            <Tab id="mappings"  label="Mappings"      count={channel.roomMap?.length || 0} active={tab === "mappings"} onClick={() => setTab("mappings")} p={p} />
            <Tab id="syncLog"   label="Sync log"      count={channel.syncLog?.length || 0}   active={tab === "syncLog"}    onClick={() => setTab("syncLog")}    p={p} />
            <Tab id="comms"     label="Communications" active={tab === "comms"}    onClick={() => setTab("comms")}    p={p} />
          </div>

          {tab === "overview"   && <OverviewSection channel={channel} p={p} />}
          {tab === "connection" && <ConnectionSection channel={channel} upsertChannel={upsertChannel} p={p} />}
          {tab === "commercial" && <CommercialSection channel={channel} upsertChannel={upsertChannel} p={p} />}
          {tab === "mappings"   && <MappingsSection channel={channel} rooms={rooms} t={t} upsertChannel={upsertChannel} p={p} />}
          {tab === "syncLog"    && <SyncLogSection channel={channel} p={p} />}
          {tab === "comms"      && <CommsSection channel={channel} upsertChannel={upsertChannel} p={p} />}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview — at-a-glance summary + recent sync events.
// ---------------------------------------------------------------------------
function OverviewSection({ channel, p }) {
  const recentSync = (channel.syncLog || []).slice(0, 5);
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card title="Connection summary">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          <Row label="Hotel ID"      value={channel.hotelId} mono p={p} />
          <Row label="Push interval" value={`${channel.pushIntervalMinutes || 0} min`} p={p} />
          <Row label="Last sync"     value={`${relTime(channel.lastSyncAt)}`} hint={fmtTime(channel.lastSyncAt)} p={p} />
          <Row label="Sync status"   value={channel.lastSyncStatus || "—"} color={channel.lastSyncStatus === "success" ? p.success : channel.lastSyncStatus === "warn" ? p.warn : p.danger} p={p} />
          <Row label="Min stay"      value={`${channel.minStay || 1} night${(channel.minStay || 1) === 1 ? "" : "s"}`} p={p} />
          <Row label="Max stay"      value={`${channel.maxStay || 30} nights`} p={p} />
          <Row label="Lead-in"       value={`${channel.leadInHours || 0}h`} p={p} />
          <Row label="Linked rooms"  value={`${channel.roomMap?.filter(m => m.linked).length || 0}/${channel.roomMap?.length || 0}`} p={p} />
        </div>
        {channel.notes && (
          <div className="mt-4 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.6 }}>
            {channel.notes}
          </div>
        )}
      </Card>

      <Card title="Recent sync events" padded={false}>
        {recentSync.length === 0 ? (
          <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
            No sync events recorded yet.
          </div>
        ) : recentSync.map((evt) => (
          <SyncRow key={evt.id} evt={evt} p={p} />
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection — API credentials, endpoint, push interval. Fields are
// editable; secrets show masked previews and reveal on toggle.
// ---------------------------------------------------------------------------
function ConnectionSection({ channel, upsertChannel, p }) {
  const [draft, setDraft] = useState({
    hotelId:      channel.hotelId       || "",
    endpoint:     channel.endpoint      || "",
    apiKeyMasked: channel.apiKeyMasked  || "",
    apiSecretMasked: channel.apiSecretMasked || "",
    pushIntervalMinutes: channel.pushIntervalMinutes || 30,
  });
  const [showSecret, setShowSecret] = useState(false);
  const dirty = ["hotelId", "endpoint", "apiKeyMasked", "apiSecretMasked", "pushIntervalMinutes"].some(k => String(draft[k]) !== String(channel[k] || ""));

  const save = () => {
    upsertChannel({ ...channel, ...draft, pushIntervalMinutes: Number(draft.pushIntervalMinutes) });
    pushToast({ message: `${channel.name} · connection settings saved` });
  };
  const reset = () => setDraft({
    hotelId: channel.hotelId || "",
    endpoint: channel.endpoint || "",
    apiKeyMasked: channel.apiKeyMasked || "",
    apiSecretMasked: channel.apiSecretMasked || "",
    pushIntervalMinutes: channel.pushIntervalMinutes || 30,
  });

  return (
    <Card title={<><Link2 size={12} className="inline mr-1.5" /> Connection settings</>} action={dirty && (
      <div className="flex items-center gap-2">
        <GhostBtn onClick={reset} small>Discard</GhostBtn>
        <PrimaryBtn onClick={save} small><Save size={11} /> Save</PrimaryBtn>
      </div>
    )}>
      <div className="grid sm:grid-cols-2 gap-4">
        <FormGroup label="Hotel ID (provided by channel)">
          <TextField value={draft.hotelId} onChange={(v) => setDraft({ ...draft, hotelId: v })} />
        </FormGroup>
        <FormGroup label="Push interval (minutes)">
          <TextField type="number" value={draft.pushIntervalMinutes} onChange={(v) => setDraft({ ...draft, pushIntervalMinutes: v })} suffix="min" />
        </FormGroup>
        <FormGroup label="Endpoint URL" className="sm:col-span-2">
          <TextField value={draft.endpoint} onChange={(v) => setDraft({ ...draft, endpoint: v })} placeholder="https://api.…" />
        </FormGroup>
        <FormGroup label="API key">
          <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
            <input
              type={showSecret ? "text" : "password"}
              value={draft.apiKeyMasked}
              onChange={(e) => setDraft({ ...draft, apiKeyMasked: e.target.value })}
              className="flex-1 outline-none"
              style={{ backgroundColor: "transparent", color: p.textPrimary, padding: "0.6rem 0.75rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem", border: "none", minWidth: 0 }}
            />
            <button onClick={() => setShowSecret((v) => !v)} title={showSecret ? "Hide" : "Reveal"}
              style={{ color: p.textMuted, padding: "0 12px", borderInlineStart: `1px solid ${p.border}` }}>
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </FormGroup>
        <FormGroup label="API secret">
          <input
            type={showSecret ? "text" : "password"}
            value={draft.apiSecretMasked}
            onChange={(e) => setDraft({ ...draft, apiSecretMasked: e.target.value })}
            className="w-full outline-none"
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.84rem" }}
          />
        </FormGroup>
      </div>
      <p className="mt-4" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
        <Shield size={11} className="inline mr-1.5" style={{ color: p.accent }} />
        API credentials are stored encrypted at rest on the backend. Editing here updates the channel manager push routine within minutes — test the connection from the header before relying on changes.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Commercial — payment model, commission, payment terms, restrictions.
// ---------------------------------------------------------------------------
function CommercialSection({ channel, upsertChannel, p }) {
  const [draft, setDraft] = useState({
    paymentModel:  channel.paymentModel  || "commission",
    commissionPct: channel.commissionPct ?? 15,
    paymentTerms:  channel.paymentTerms  || "Net 30",
    contractStart: channel.contractStart || "",
    contractEnd:   channel.contractEnd   || "",
    minStay:       channel.minStay       ?? 1,
    maxStay:       channel.maxStay       ?? 30,
    leadInHours:   channel.leadInHours   ?? 0,
    cancellationPolicy: channel.cancellationPolicy || "",
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify({
    paymentModel:  channel.paymentModel  || "commission",
    commissionPct: channel.commissionPct ?? 15,
    paymentTerms:  channel.paymentTerms  || "Net 30",
    contractStart: channel.contractStart || "",
    contractEnd:   channel.contractEnd   || "",
    minStay:       channel.minStay       ?? 1,
    maxStay:       channel.maxStay       ?? 30,
    leadInHours:   channel.leadInHours   ?? 0,
    cancellationPolicy: channel.cancellationPolicy || "",
  });

  const save = () => {
    upsertChannel({ ...channel, ...draft,
      commissionPct: Number(draft.commissionPct),
      minStay: Number(draft.minStay),
      maxStay: Number(draft.maxStay),
      leadInHours: Number(draft.leadInHours),
    });
    pushToast({ message: `${channel.name} · commercial terms saved` });
  };

  return (
    <div className="space-y-6">
      <Card title={<><Coins size={12} className="inline mr-1.5" /> Payment model & commission</>} action={dirty && (
        <PrimaryBtn onClick={save} small><Save size={11} /> Save</PrimaryBtn>
      )}>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormGroup label="Payment model">
            <SelectField value={draft.paymentModel} onChange={(v) => setDraft({ ...draft, paymentModel: v })} options={PAYMENT_MODELS} />
          </FormGroup>
          <FormGroup label="Commission %">
            <TextField type="number" value={draft.commissionPct} onChange={(v) => setDraft({ ...draft, commissionPct: v })} suffix="%" />
          </FormGroup>
          <FormGroup label="Payment terms">
            <SelectField value={draft.paymentTerms} onChange={(v) => setDraft({ ...draft, paymentTerms: v })} options={["On stay", "Net 15", "Net 30", "Net 45", "Net 60"]} />
          </FormGroup>
          <FormGroup label="Contract period">
            <div className="grid grid-cols-2 gap-2">
              <TextField type="date" value={draft.contractStart} onChange={(v) => setDraft({ ...draft, contractStart: v })} />
              <TextField type="date" value={draft.contractEnd}   onChange={(v) => setDraft({ ...draft, contractEnd:   v })} />
            </div>
          </FormGroup>
        </div>
      </Card>

      <Card title={<><Sliders size={12} className="inline mr-1.5" /> Restrictions & policies</>}>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormGroup label="Min stay (nights)">
            <TextField type="number" value={draft.minStay} onChange={(v) => setDraft({ ...draft, minStay: v })} suffix="nt" />
          </FormGroup>
          <FormGroup label="Max stay (nights)">
            <TextField type="number" value={draft.maxStay} onChange={(v) => setDraft({ ...draft, maxStay: v })} suffix="nt" />
          </FormGroup>
          <FormGroup label="Lead-in (hours)">
            <TextField type="number" value={draft.leadInHours} onChange={(v) => setDraft({ ...draft, leadInHours: v })} suffix="h" />
          </FormGroup>
        </div>
        <div className="mt-4">
          <FormGroup label="Cancellation policy text (shown on the OTA)">
            <textarea
              value={draft.cancellationPolicy}
              onChange={(e) => setDraft({ ...draft, cancellationPolicy: e.target.value })}
              rows={2}
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
                padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif",
                fontSize: "0.86rem", resize: "vertical",
              }}
            />
          </FormGroup>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mappings — room types & rate plans linked to the channel's external IDs.
// ---------------------------------------------------------------------------
function MappingsSection({ channel, rooms, t, upsertChannel, p }) {
  const updateRoomMap = (roomId, patch) => {
    const next = (channel.roomMap || []).map(m => m.roomId === roomId ? { ...m, ...patch } : m);
    upsertChannel({ ...channel, roomMap: next });
  };
  const updateRatePlanMap = (planId, patch) => {
    const next = (channel.ratePlanMap || []).map(m => m.planId === planId ? { ...m, ...patch } : m);
    upsertChannel({ ...channel, ratePlanMap: next });
  };
  const addRatePlan = () => {
    const next = [...(channel.ratePlanMap || []), {
      planId: `plan-${Date.now()}`,
      externalId: "",
      externalName: "",
      active: false,
    }];
    upsertChannel({ ...channel, ratePlanMap: next });
  };
  const removeRatePlan = (planId) => {
    const next = (channel.ratePlanMap || []).filter(m => m.planId !== planId);
    upsertChannel({ ...channel, ratePlanMap: next });
  };

  return (
    <div className="space-y-6">
      <Card title="Room type mappings" padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th>Our suite</Th>
              <Th>External ID</Th>
              <Th>External name</Th>
              <Th align="end">Linked</Th>
            </tr>
          </thead>
          <tbody>
            {(channel.roomMap || []).map((m) => {
              const room = rooms.find((r) => r.id === m.roomId);
              return (
                <tr key={m.roomId}>
                  <Td>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: p.textPrimary }}>
                      {room ? t(`rooms.${room.id}.name`) : m.roomId}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{m.roomId}</div>
                  </Td>
                  <Td>
                    <input
                      value={m.externalId || ""}
                      onChange={(e) => updateRoomMap(m.roomId, { externalId: e.target.value, linked: !!e.target.value && !!m.externalName })}
                      placeholder="e.g. BK-1234567-1"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.4rem 0.6rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem" }}
                    />
                  </Td>
                  <Td>
                    <input
                      value={m.externalName || ""}
                      onChange={(e) => updateRoomMap(m.roomId, { externalName: e.target.value, linked: !!e.target.value && !!m.externalId })}
                      placeholder="e.g. Studio · King"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.4rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}
                    />
                  </Td>
                  <Td align="end">
                    <button onClick={() => updateRoomMap(m.roomId, { linked: !m.linked })}
                      title={m.linked ? "Unlink" : "Link"}
                      style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "3px 9px",
                        color: m.linked ? p.success : p.textMuted,
                        backgroundColor: m.linked ? `${p.success}1F` : "transparent",
                        border: `1px solid ${m.linked ? p.success : p.border}`,
                      }}
                    >{m.linked ? "✓ Linked" : "Not linked"}</button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      <Card title={`Rate plan mappings · ${channel.ratePlanMap?.length || 0}`} padded={false}
        action={
          <button onClick={addRatePlan}
            className="inline-flex items-center gap-1.5"
            style={{ padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          ><Plus size={11} /> Add rate plan</button>
        }
      >
        {(channel.ratePlanMap || []).length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
            No rate plans mapped to this channel yet. <button onClick={addRatePlan} style={{ color: p.accent, fontWeight: 700 }}>Add the first one →</button>
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Internal plan ID</Th>
                <Th>External ID</Th>
                <Th>External name</Th>
                <Th align="end">Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(channel.ratePlanMap || []).map((m) => (
                <tr key={m.planId}>
                  <Td>
                    <input
                      value={m.planId} disabled
                      className="w-full outline-none"
                      style={{ backgroundColor: "transparent", color: p.textMuted, border: `1px solid ${p.border}`, padding: "0.4rem 0.6rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", opacity: 0.7 }}
                    />
                  </Td>
                  <Td>
                    <input
                      value={m.externalId || ""}
                      onChange={(e) => updateRatePlanMap(m.planId, { externalId: e.target.value })}
                      placeholder="e.g. RP-101"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.4rem 0.6rem", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem" }}
                    />
                  </Td>
                  <Td>
                    <input
                      value={m.externalName || ""}
                      onChange={(e) => updateRatePlanMap(m.planId, { externalName: e.target.value })}
                      placeholder="e.g. Best Available Rate"
                      className="w-full outline-none"
                      style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.4rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}
                    />
                  </Td>
                  <Td align="end">
                    <button onClick={() => updateRatePlanMap(m.planId, { active: !m.active })}
                      style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "3px 9px",
                        color: m.active ? p.success : p.textMuted,
                        backgroundColor: m.active ? `${p.success}1F` : "transparent",
                        border: `1px solid ${m.active ? p.success : p.border}`,
                      }}
                    >{m.active ? "Active" : "Inactive"}</button>
                  </Td>
                  <Td align="end">
                    <button onClick={() => removeRatePlan(m.planId)} title="Remove"
                      style={{ color: p.danger, padding: "0.3rem 0.5rem", border: `1px solid ${p.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
                    ><Trash2 size={11} /></button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync log — full audit trail with filter + status pills.
// ---------------------------------------------------------------------------
function SyncLogSection({ channel, p }) {
  const [filter, setFilter] = useState("all");
  const log = useMemo(() => {
    const all = channel.syncLog || [];
    if (filter === "all") return all;
    return all.filter((l) => l.type?.startsWith(filter));
  }, [channel.syncLog, filter]);

  return (
    <Card title={`Sync log · ${log.length}`} padded={false}>
      <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Filter</span>
        {[
          { id: "all",     label: "All" },
          { id: "push",    label: "Pushes" },
          { id: "pull",    label: "Pulls" },
          { id: "config",  label: "Config" },
        ].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: "0.3rem 0.7rem",
              backgroundColor: filter === f.id ? `${p.accent}1F` : "transparent",
              border: `1px solid ${filter === f.id ? p.accent : p.border}`,
              color: filter === f.id ? p.accent : p.textSecondary,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
          >{f.label}</button>
        ))}
      </div>
      {log.length === 0 ? (
        <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
          No events match this filter.
        </div>
      ) : log.map((evt) => <SyncRow key={evt.id} evt={evt} p={p} />)}
    </Card>
  );
}

function SyncRow({ evt, p }) {
  const visual = SYNC_TYPE_VISUAL[evt.type] || { label: evt.type, icon: Activity, color: p.textMuted };
  const Ic = visual.icon;
  const statusColor = evt.status === "success" ? p.success : evt.status === "warn" ? p.warn : evt.status === "error" ? p.danger : p.textMuted;
  return (
    <div className="px-5 py-3 flex items-start gap-3" style={{ borderTop: `1px solid ${p.border}` }}>
      <span className="flex items-center justify-center" style={{
        width: 32, height: 32, flexShrink: 0,
        backgroundColor: `${visual.color}15`, color: visual.color,
        border: `1px solid ${visual.color}40`,
      }}>
        <Ic size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", fontWeight: 700 }}>{visual.label}</span>
          <span style={chipStyle(statusColor)}>
            <span style={dotStyle(statusColor)} />
            {evt.status}
          </span>
        </div>
        <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 2 }}>{evt.message}</div>
      </div>
      <div className="text-end" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", flexShrink: 0 }}>
        <div>{relTime(evt.ts)}</div>
        <div style={{ color: p.textDim, marginTop: 2 }}>{fmtTime(evt.ts)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Communications — contact email + per-event notification toggles.
// ---------------------------------------------------------------------------
function CommsSection({ channel, upsertChannel, p }) {
  const [draft, setDraft] = useState({
    contactEmail:        channel.contactEmail        || "",
    notifyStopsale:      channel.notifyStopsale      ?? true,
    notifyRateUpdate:    channel.notifyRateUpdate    ?? true,
    notifyAllotment:     channel.notifyAllotment     ?? true,
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify({
    contactEmail:        channel.contactEmail        || "",
    notifyStopsale:      channel.notifyStopsale      ?? true,
    notifyRateUpdate:    channel.notifyRateUpdate    ?? true,
    notifyAllotment:     channel.notifyAllotment     ?? true,
  });
  const save = () => {
    upsertChannel({ ...channel, ...draft });
    pushToast({ message: `${channel.name} · communication settings saved` });
  };
  const sendTest = () => {
    if (!draft.contactEmail) { pushToast({ message: "No contact email set", kind: "warn" }); return; }
    const href = `mailto:${encodeURIComponent(draft.contactEmail)}?subject=${encodeURIComponent(`[TEST] ${channel.name} · channel manager check`)}&body=${encodeURIComponent(`This is a test message from The Lodge Suites' distribution composer to confirm the contact email for ${channel.name} is reachable.\n\nKind regards,\nReservations Team`)}`;
    window.location.href = href;
  };

  return (
    <Card title={<><Mail size={12} className="inline mr-1.5" /> Channel communications</>} action={
      <div className="flex items-center gap-2">
        <GhostBtn onClick={sendTest} small><Send size={11} /> Send test</GhostBtn>
        {dirty && <PrimaryBtn onClick={save} small><Save size={11} /> Save</PrimaryBtn>}
      </div>
    }>
      <FormGroup label="Primary contact email">
        <TextField type="email" value={draft.contactEmail} onChange={(v) => setDraft({ ...draft, contactEmail: v })} placeholder="connectivity@partner.com" />
      </FormGroup>
      <div className="mt-5">
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
          Auto-notify on
        </div>
        <div className="space-y-2">
          {[
            { key: "notifyStopsale",   label: "Stop-sale events",          hint: "When a date is closed across all channels" },
            { key: "notifyRateUpdate", label: "Rate-plan updates",         hint: "When negotiated rates change for any room" },
            { key: "notifyAllotment",  label: "Allotment / inventory release", hint: "When the property pushes an inventory refresh" },
          ].map((it) => (
            <label key={it.key} className="flex items-start gap-3 p-3 cursor-pointer" style={{
              border: `1px solid ${draft[it.key] ? p.accent : p.border}`,
              backgroundColor: draft[it.key] ? p.bgHover : "transparent",
            }}>
              <input type="checkbox" checked={!!draft[it.key]} onChange={(e) => setDraft({ ...draft, [it.key]: e.target.checked })} style={{ marginTop: 4 }} />
              <div className="flex-1">
                <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: 600 }}>{it.label}</div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 2 }}>{it.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Local primitives
// ---------------------------------------------------------------------------
function chipStyle(base) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "'Manrope', sans-serif",
    fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase",
    fontWeight: 700, whiteSpace: "nowrap",
    padding: "3px 9px",
    color: base, backgroundColor: `${base}1F`, border: `1px solid ${base}`,
  };
}
const dotStyle = (base) => ({ width: 7, height: 7, borderRadius: 999, backgroundColor: base, display: "inline-block", flexShrink: 0 });

function Tab({ id, label, count, active, onClick, p }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: active ? `${p.accent}1F` : "transparent",
        border: `1px solid ${active ? p.accent : p.border}`,
        color: active ? p.accent : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
    >
      {label}
      {count !== null && count !== undefined && (
        <span style={{ marginInlineStart: 2, color: active ? p.accent : p.textMuted, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontSize: "0.7rem" }}>· {count}</span>
      )}
    </button>
  );
}

function KpiTile({ label, value, hint, icon: Icon, color, p }) {
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel }}>
      <div className="flex items-start justify-between gap-2">
        <Icon size={14} style={{ color: p.accent, flexShrink: 0 }} />
      </div>
      <div className="mt-2" style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem",
        color: color || p.textPrimary, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 4, fontWeight: 700 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Row({ label, value, mono, color, hint, p }) {
  return (
    <div>
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{
        color: color || p.textPrimary,
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : "'Manrope', sans-serif",
        fontSize: "0.86rem", fontWeight: mono || color ? 700 : 600, marginTop: 4,
        wordBreak: "break-word",
      }}>{value || "—"}</div>
      {hint && <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
