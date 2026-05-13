import React, { useMemo, useState } from "react";
import {
  Accessibility, BedDouble, Building2, Check, Coins, Edit2, Filter, Image as ImageIcon,
  Layers, LayoutGrid, Link2, List, Plus, RotateCcw, Save, Trash2, Users, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT } from "../../../../i18n/LanguageContext.jsx";
import {
  applyTaxes, ROOM_UNIT_STATUSES, ROOM_VIEWS, useData, formatCurrency,
} from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";

// ---------------------------------------------------------------------------
// Rooms & Rates
//   1. Room types — public-facing categories with rack rate (existing)
//   2. Room units — individual physical suites with floor / view / status
// ---------------------------------------------------------------------------

const STATUS_BY_ID = Object.fromEntries(ROOM_UNIT_STATUSES.map((s) => [s.id, s]));
const VIEW_BY_ID   = Object.fromEntries(ROOM_VIEWS.map((v) => [v.id, v]));

export const RoomsRates = () => {
  const t = useT();
  const p = usePalette();
  const { rooms, updateRoom, tax, roomUnits } = useData();
  const [editingRate, setEditingRate] = useState(null);
  const [draft, setDraft] = useState({});

  // Open the editor with a full snapshot of the room — every field the
  // editor shows must be in the draft so unsaved edits stay reactive.
  const startEdit = (room) => {
    setEditingRate(room.id);
    setDraft({
      price:        room.price,
      // Weekend rate falls back to the weekday rate when the room has
      // never been edited — gives the operator a sensible default to
      // dial up rather than a blank "0".
      priceWeekend: room.priceWeekend ?? room.price,
      sqm:         room.sqm,
      occupancy:   room.occupancy,
      maxAdults:   room.maxAdults   ?? room.occupancy,
      maxChildren: room.maxChildren ?? 0,
      extraBedAvailable: !!room.extraBedAvailable,
      maxExtraBeds:      Number(room.maxExtraBeds || 0),
      extraBedFee:       Number(room.extraBedFee || 0),
      extraBedAddsAdults:   room.extraBedAdds?.adults   ?? 1,
      extraBedAddsChildren: room.extraBedAdds?.children ?? 0,
    });
  };
  const save = () => {
    const safe = (n) => Math.max(0, Number(n) || 0);
    updateRoom(editingRate, {
      price:        safe(draft.price),
      priceWeekend: safe(draft.priceWeekend),
      sqm:         safe(draft.sqm),
      occupancy:   safe(draft.occupancy),
      maxAdults:   safe(draft.maxAdults),
      maxChildren: safe(draft.maxChildren),
      extraBedAvailable: !!draft.extraBedAvailable,
      maxExtraBeds:      draft.extraBedAvailable ? Math.max(0, safe(draft.maxExtraBeds)) : 0,
      extraBedFee:       draft.extraBedAvailable ? safe(draft.extraBedFee) : 0,
      extraBedAdds: {
        adults:   draft.extraBedAvailable ? safe(draft.extraBedAddsAdults)   : 0,
        children: draft.extraBedAvailable ? safe(draft.extraBedAddsChildren) : 0,
      },
    });
    pushToast({ message: `Saved · ${t(`rooms.${editingRate}.name`) || editingRate}` });
    setEditingRate(null);
  };

  const grossOf = (rate) => Math.round(applyTaxes(rate, tax, 1).gross);
  const editingRoom = rooms.find((r) => r.id === editingRate);

  const lowestRate = rooms.length > 0 ? Math.min(...rooms.map((r) => r.price)) : 0;

  // Per-type unit counts derived from the canonical roomUnits list
  const unitCountByType = useMemo(() => {
    const out = {};
    rooms.forEach((r) => { out[r.id] = 0; });
    (roomUnits || []).forEach((u) => {
      out[u.roomTypeId] = (out[u.roomTypeId] || 0) + 1;
    });
    return out;
  }, [rooms, roomUnits]);

  const totalUnits  = roomUnits?.length || 0;
  const activeUnits = (roomUnits || []).filter((u) => u.status === "active").length;
  const oooUnits    = (roomUnits || []).filter((u) => u.status === "out-of-order").length;

  return (
    <div>
      <PageHeader
        title="Rooms & Rates"
        intro="Public-facing room types, rack rates, and the canonical list of every physical suite. Room numbers created here propagate to bookings, calendar overrides and maintenance jobs."
      />

      {/* ── Top KPIs ─────────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Active room types" value={rooms.length} />
        <Stat label="Inventory (units)" value={totalUnits} hint={`${activeUnits} active · ${oooUnits} out of order`} color={p.accent} />
        <Stat label="Lowest rate" value={formatCurrency(lowestRate)} hint="excl. tax" color={p.success} />
        <Stat label="Tax-inclusive lowest" value={formatCurrency(grossOf(lowestRate))} hint="At checkout" />
      </div>

      {/* ── Room types ──────────────────────────────────────────────── */}
      <Card padded={false} title="Room types" className="mb-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th align="end">Size</Th>
              <Th align="end">Sleeps</Th>
              <Th align="end">Units</Th>
              <Th align="end">Rate (excl. tax)</Th>
              <Th align="end">Rate (incl. tax)</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <Td>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary }}>{t(`rooms.${r.id}.name`)}</div>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{r.id}</div>
                </Td>
                <Td align="end">{r.sqm} m²</Td>
                <Td align="end">{r.occupancy}</Td>
                <Td align="end" style={{ color: p.accent, fontWeight: 700 }}>{unitCountByType[r.id] || 0}</Td>
                <Td align="end" className="font-semibold">{formatCurrency(r.price)}</Td>
                <Td align="end" muted>{formatCurrency(grossOf(r.price))}</Td>
                <Td>
                  <span style={{
                    fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    padding: "2px 8px", color: p.success, border: `1px solid ${p.success}`,
                  }}>Live</span>
                </Td>
                <Td align="end">
                  <button onClick={() => startEdit(r)} className="inline-flex items-center gap-1.5"
                    style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                    <Edit2 size={11} /> Edit
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Card>

      <p className="mb-7" style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.78rem" }}>
        Tax-inclusive rates derive from the current Tax Setup configuration: {(tax.components || []).length} component{(tax.components || []).length === 1 ? "" : "s"}, combined {(tax.components || []).filter(c => c.type === "percentage").reduce((s, c) => s + c.rate, 0)}% on the room rate.
      </p>

      {/* ── Room units ──────────────────────────────────────────────── */}
      <RoomUnitsManager />

      {/* Rate editor — full page so the operator can see capacity, pricing
          and extra-bed config side by side, plus a live preview of how it
          will appear to a guest in the booking flow. */}
      {editingRate && editingRoom && (
        <RoomTypeEditor
          room={editingRoom}
          draft={draft}
          setDraft={setDraft}
          tax={tax}
          unitCount={unitCountByType[editingRoom.id] || 0}
          onCancel={() => setEditingRate(null)}
          onSave={save}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// RoomTypeEditor — full-page editor for a single room type. Lives in the same
// `Drawer fullPage` chrome the unit editor uses, so the visual rhythm across
// Rooms & Rates stays consistent.
// ---------------------------------------------------------------------------
function RoomTypeEditor({ room, draft, setDraft, tax, unitCount, onCancel, onSave }) {
  const t = useT();
  const p = usePalette();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Live derived figures so the operator can see the impact of every edit
  // without committing.
  const rate         = Number(draft.price) || 0;
  const rateWeekend  = Number(draft.priceWeekend) || 0;
  const grossPN      = Math.round(applyTaxes(rate, tax, 1).gross);
  const grossWeekend = Math.round(applyTaxes(rateWeekend, tax, 1).gross);
  const ebFee        = draft.extraBedAvailable ? (Number(draft.extraBedFee) || 0) : 0;
  const grossWithBed = Math.round(applyTaxes(rate + ebFee, tax, 1).gross);
  const adultCap = Number(draft.maxAdults)   || 0;
  const childCap = Number(draft.maxChildren) || 0;
  const baseTotal = adultCap + childCap;
  const ebAddsA = Number(draft.extraBedAddsAdults)   || 0;
  const ebAddsC = Number(draft.extraBedAddsChildren) || 0;
  const ebMax   = Number(draft.maxExtraBeds) || 0;
  const ebTotalCap = draft.extraBedAvailable ? ebMax * (ebAddsA + ebAddsC) : 0;

  return (
    <Drawer
      open={true}
      onClose={onCancel}
      eyebrow={`Edit room type · ${room.id}`}
      title={t(`rooms.${room.id}.name`) || room.id}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          <GhostBtn small onClick={onCancel}>Cancel</GhostBtn>
          <div className="flex-1" />
          <PrimaryBtn small onClick={onSave}><Save size={12} /> Save changes</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Identity card — read-only context, with the suite hero image */}
        <Card title="Identity" className="lg:col-span-1">
          {room.image && (
            <div style={{
              width: "100%", aspectRatio: "16/10",
              backgroundImage: `url(${room.image})`,
              backgroundSize: "cover", backgroundPosition: "center",
              border: `1px solid ${p.border}`,
            }} />
          )}
          <div className="mt-4 space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
            <Detail label="Type id"  value={room.id} mono p={p} />
            <Detail label="Inventory" value={`${unitCount} unit${unitCount === 1 ? "" : "s"}`} p={p} />
            <Detail label="Public name" value={t(`rooms.${room.id}.name`) || "—"} p={p} />
          </div>
          <p className="mt-3" style={{ color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.55 }}>
            Public name &amp; copy live in <strong>Site Content → Rooms</strong> — edit translation strings there. This editor controls operational fields (rate, capacity, extra bed).
          </p>
        </Card>

        {/* Pricing + size */}
        <Card title="Pricing &amp; size" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormGroup label="Weekday rate (BHD / night, excl. tax)">
              <TextField type="number" value={draft.price} onChange={(v) => set({ price: v })} suffix="BHD" />
            </FormGroup>
            <FormGroup label="Weekend rate (BHD / night, excl. tax)">
              <TextField type="number" value={draft.priceWeekend ?? draft.price} onChange={(v) => set({ priceWeekend: v })} suffix="BHD" />
            </FormGroup>
            <FormGroup label="Size">
              <TextField type="number" value={draft.sqm} onChange={(v) => set({ sqm: v })} suffix="m²" />
            </FormGroup>
          </div>
          <div className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
            The set of "weekend days" is operator-configurable in <strong>Property Info → Weekend days</strong>. Set the weekday and weekend rates to the same value if you don't want to differentiate.
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>Weekday gross</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>
                {formatCurrency(grossPN)}
              </div>
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>incl. VAT / service / tourism levy</div>
            </div>
            <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>Weekend gross</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>
                {formatCurrency(grossWeekend)}
              </div>
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>incl. taxes</div>
            </div>
            <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>With extra bed</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: draft.extraBedAvailable ? p.accent : p.textMuted, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>
                {draft.extraBedAvailable ? formatCurrency(grossWithBed) : "—"}
              </div>
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                {draft.extraBedAvailable ? `+ BHD ${ebFee}/night per bed (excl. tax)` : "Extra bed not offered"}
              </div>
            </div>
          </div>
        </Card>

        {/* Capacity */}
        <Card title="Capacity" className="lg:col-span-3">
          <p style={{ color: p.textSecondary, fontSize: "0.86rem", lineHeight: 1.6, marginBottom: 14 }}>
            <strong>Total occupancy</strong> is the hard ceiling — any booking line's <em>adults + children</em> must fit inside it. <strong>Max adults</strong> and <strong>Max children</strong> are <em>optional sub-caps</em>: leave them equal to occupancy to allow any mix, or dial them down to forbid specific combinations (e.g. set Max children to <code>0</code> to refuse children entirely on a suite type). Extra beds (configured below) layer on top of all three.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormGroup label="Total occupancy (hard ceiling)">
              <input
                type="number" min={1}
                value={draft.occupancy}
                onChange={(e) => set({ occupancy: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Adults + children combined cannot exceed this.</div>
            </FormGroup>
            <FormGroup label="Max adults (optional sub-cap)">
              <input
                type="number" min={0}
                value={draft.maxAdults}
                onChange={(e) => set({ maxAdults: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Set equal to occupancy for "no restriction".</div>
            </FormGroup>
            <FormGroup label="Max children (optional sub-cap)">
              <input
                type="number" min={0}
                value={draft.maxChildren}
                onChange={(e) => set({ maxChildren: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Set to <code>0</code> to refuse children entirely.</div>
            </FormGroup>
          </div>

          {/* Allowed-combinations preview — generates the matrix of valid
              adult/child splits the operator's current settings allow. Helps
              the operator sanity-check policy at a glance. */}
          <div className="mt-4 p-3" style={{ backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`, borderInlineStart: `3px solid ${p.accent}` }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: p.accent, marginBottom: 8 }}>
              Allowed combinations
            </div>
            {(() => {
              const occ = Number(draft.occupancy) || 0;
              const aCap = Number(draft.maxAdults)   || 0;
              const cCap = Number(draft.maxChildren) || 0;
              if (occ <= 0) return <div style={{ color: p.textMuted, fontSize: "0.82rem" }}>Set occupancy ≥ 1 to see allowed combinations.</div>;
              const combos = [];
              for (let a = 0; a <= aCap; a++) {
                for (let c = 0; c <= cCap; c++) {
                  if (a + c >= 1 && a + c <= occ) {
                    combos.push({ a, c });
                  }
                }
              }
              if (combos.length === 0) {
                return <div style={{ color: p.warn, fontSize: "0.82rem" }}>Current caps disallow every combination — guests can't book this suite. Raise occupancy or one of the sub-caps.</div>;
              }
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {combos.map(({ a, c }) => (
                      <span key={`${a}-${c}`} style={{
                        padding: "3px 10px", fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.74rem", fontWeight: 700,
                        // Theme-aware "ink": dark in light mode, cream in dark
                        // mode — both readable on the gold-tinted background.
                        color: p.textPrimary,
                        backgroundColor: `${p.accent}25`,
                        border: `1px solid ${p.accent}`,
                        letterSpacing: "0.04em",
                      }}>
                        {a > 0 ? `${a}A` : ""}{a > 0 && c > 0 ? "+" : ""}{c > 0 ? `${c}C` : ""}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 8 }}>
                    {combos.length} combination{combos.length === 1 ? "" : "s"} valid · ceiling <strong style={{ color: p.textPrimary }}>{occ}</strong>
                    {draft.extraBedAvailable && ebMax > 0 && (
                      <> · with up to {ebMax} extra bed{ebMax === 1 ? "" : "s"} the ceiling rises to <strong style={{ color: p.textPrimary }}>{occ + ebMax * (ebAddsA + ebAddsC)}</strong></>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Extra-bed configuration */}
        <Card title="Extra-bed configuration" className="lg:col-span-3" action={
          <div className="flex items-center gap-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            <BedDouble size={13} style={{ color: draft.extraBedAvailable ? p.accent : p.textMuted }} />
            <span style={{ color: draft.extraBedAvailable ? p.accent : p.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
              {draft.extraBedAvailable ? "Offered" : "Not offered"}
            </span>
          </div>
        }>
          {/* Master toggle */}
          <div className="p-3 flex items-start justify-between gap-3 flex-wrap" style={{
            backgroundColor: draft.extraBedAvailable ? `${p.accent}10` : p.bgPanelAlt,
            border: `1px solid ${draft.extraBedAvailable ? p.accent : p.border}`,
            borderInlineStart: `3px solid ${draft.extraBedAvailable ? p.accent : p.border}`,
          }}>
            <div className="flex items-start gap-3">
              <BedDouble size={16} style={{ color: draft.extraBedAvailable ? p.accent : p.textMuted, marginTop: 2 }} />
              <div>
                <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.86rem" }}>Offer extra bed for this suite</div>
                <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 2, maxWidth: 540, lineHeight: 1.5 }}>
                  Sofa-bed or rollaway. When enabled, guests can add up to the configured maximum during the booking flow. Each bed is billed at the per-night fee below and adds the configured capacity.
                </div>
              </div>
            </div>
            <button
              onClick={() => set({ extraBedAvailable: !draft.extraBedAvailable })}
              style={{
                width: 44, height: 24, borderRadius: 999,
                backgroundColor: draft.extraBedAvailable ? p.accent : p.border,
                position: "relative", border: "none", cursor: "pointer", flexShrink: 0,
              }}
              aria-pressed={draft.extraBedAvailable}
              aria-label="Toggle extra bed availability"
            >
              <span style={{
                position: "absolute", top: 2, left: draft.extraBedAvailable ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%",
                backgroundColor: "#fff", transition: "left 120ms",
              }} />
            </button>
          </div>

          {/* Detail fields — only meaningful when the toggle is on */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4" style={{ opacity: draft.extraBedAvailable ? 1 : 0.45 }}>
            <FormGroup label="Max extra beds">
              <input
                type="number" min={0} max={4}
                disabled={!draft.extraBedAvailable}
                value={draft.maxExtraBeds}
                onChange={(e) => set({ maxExtraBeds: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Hard cap, e.g. <code>1</code> or <code>2</code>.</div>
            </FormGroup>
            <FormGroup label="Fee (BHD / night, excl. tax)">
              <input
                type="number" min={0}
                disabled={!draft.extraBedAvailable}
                value={draft.extraBedFee}
                onChange={(e) => set({ extraBedFee: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Per bed, per night.</div>
            </FormGroup>
            <FormGroup label="Adds adult sleeper">
              <input
                type="number" min={0} max={2}
                disabled={!draft.extraBedAvailable}
                value={draft.extraBedAddsAdults}
                onChange={(e) => set({ extraBedAddsAdults: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Per bed.</div>
            </FormGroup>
            <FormGroup label="Adds child sleeper">
              <input
                type="number" min={0} max={2}
                disabled={!draft.extraBedAvailable}
                value={draft.extraBedAddsChildren}
                onChange={(e) => set({ extraBedAddsChildren: e.target.value })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
              <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>Per bed.</div>
            </FormGroup>
          </div>
        </Card>

        {/* Live booking-card preview */}
        <Card title="Booking-flow preview" className="lg:col-span-3">
          <p style={{ color: p.textMuted, fontSize: "0.78rem", marginBottom: 12 }}>
            How this suite will appear in step 2 of the public booking flow with current values.
          </p>
          <div className="flex gap-4 p-3" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            {room.image && <div style={{ width: 130, height: 100, backgroundImage: `url(${room.image})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: p.textPrimary, fontWeight: 500 }}>
                  {t(`rooms.${room.id}.name`) || room.id}
                </h4>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.accent, fontWeight: 500 }}>
                  {formatCurrency(rate)}<span style={{ fontSize: "0.7rem", color: p.textMuted, fontFamily: "'Manrope', sans-serif", letterSpacing: "0.1em" }}> /night</span>
                </div>
              </div>
              <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 6 }}>
                {draft.sqm || 0} m² · sleeps up to <strong>{Number(draft.occupancy) || 0}</strong>
                {/* Mirror the public-facing caption — only surface
                    "adults only" when children are forbidden; the full
                    sub-cap matrix lives in the Capacity card above for
                    operator reference. */}
                {childCap === 0 && (
                  <span style={{ color: p.warn, fontWeight: 600 }}> · adults only</span>
                )}
              </div>
              {draft.extraBedAvailable && ebMax > 0 && (
                <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4 }}>
                  <BedDouble size={11} style={{ display: "inline", marginInlineEnd: 4 }} />
                  Extra bed available · up to {ebMax} · BHD {ebFee}/night each
                  {ebAddsA + ebAddsC > 0 && <> · adds {ebAddsA > 0 ? `${ebAddsA} adult${ebAddsA === 1 ? "" : "s"}` : ""}{ebAddsA > 0 && ebAddsC > 0 ? " + " : ""}{ebAddsC > 0 ? `${ebAddsC} child${ebAddsC === 1 ? "" : "ren"}` : ""}/bed</>}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </Drawer>
  );
}

// Tiny detail row for the Identity card. Mono = monospace value (used for ids).
function Detail({ label, value, mono, p }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{
        color: p.textPrimary,
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : undefined,
        fontSize: mono ? "0.82rem" : "0.86rem",
        fontWeight: mono ? 600 : 500,
      }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoomUnitsManager — list + filters + add/edit/bulk-add for individual suites.
// ---------------------------------------------------------------------------
function RoomUnitsManager() {
  const t = useT();
  const p = usePalette();
  const { rooms, roomUnits, removeRoomUnit, setRoomUnitStatus } = useData();

  const [filterType,   setFilterType]   = useState("all");
  const [filterFloor,  setFilterFloor]  = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view,         setView]         = useState("list"); // list | grid
  const [editing,  setEditing]  = useState(null);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const floors = useMemo(() => {
    const set = new Set();
    (roomUnits || []).forEach((u) => set.add(u.floor));
    return Array.from(set).sort((a, b) => a - b);
  }, [roomUnits]);

  const filtered = useMemo(() => {
    return (roomUnits || [])
      .filter((u) => filterType   === "all" || u.roomTypeId === filterType)
      .filter((u) => filterFloor  === "all" || String(u.floor) === String(filterFloor))
      .filter((u) => filterStatus === "all" || u.status === filterStatus)
      .sort((a, b) => Number(a.number) - Number(b.number));
  }, [roomUnits, filterType, filterFloor, filterStatus]);

  // Per-type breakdown
  const byType = useMemo(() => {
    const out = {};
    rooms.forEach((r) => { out[r.id] = { active: 0, ooo: 0, reserved: 0, total: 0 }; });
    (roomUnits || []).forEach((u) => {
      if (!out[u.roomTypeId]) out[u.roomTypeId] = { active: 0, ooo: 0, reserved: 0, total: 0 };
      out[u.roomTypeId].total++;
      if (u.status === "active") out[u.roomTypeId].active++;
      else if (u.status === "out-of-order") out[u.roomTypeId].ooo++;
      else if (u.status === "reserved") out[u.roomTypeId].reserved++;
    });
    return out;
  }, [rooms, roomUnits]);

  const removeUnit = (u) => {
    if (!confirm(`Remove unit ${u.number}? It will be removed from inventory immediately.`)) return;
    removeRoomUnit(u.id);
    pushToast({ message: `Removed · room ${u.number}` });
  };

  return (
    <div>
      {/* Per-type summary cards — surface every field the operator can edit
          for this room type so the inventory pane doubles as a quick
          reference. Clicking a card filters the unit table to that type. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        {rooms.map((r) => {
          const v = byType[r.id] || { active: 0, ooo: 0, reserved: 0, total: 0 };
          // Resolve i18n strings — fall back to humanised id when a
          // translation isn't present so a freshly-added type still
          // renders cleanly.
          const typeName = t(`rooms.${r.id}.name`) || r.id;
          const typeShort = t(`rooms.${r.id}.short`);
          const isActive = filterType === r.id;
          // Pricing block — show weekday / weekend if they differ so the
          // operator sees the spread at a glance.
          const wkPrice = Number(r.price) || 0;
          const wePrice = Number(r.priceWeekend) || wkPrice;
          const priceLabel = wePrice && wePrice !== wkPrice
            ? `${formatCurrency(wkPrice)} · weekend ${formatCurrency(wePrice)}`
            : `${formatCurrency(wkPrice)} / night`;
          // Capacity block — combines headcount limits with the floor area
          // and extra-bed policy for a single information-dense line.
          const capacityParts = [
            r.sqm ? `${r.sqm} m²` : null,
            r.maxAdults != null ? `${r.maxAdults} adult${r.maxAdults === 1 ? "" : "s"}` : null,
            r.maxChildren != null ? `${r.maxChildren} child${r.maxChildren === 1 ? "" : "ren"}` : null,
          ].filter(Boolean);
          return (
            <button
              key={r.id}
              onClick={() => setFilterType(isActive ? "all" : r.id)}
              className="p-4 text-start transition-colors"
              style={{
                backgroundColor: isActive ? p.bgHover : p.bgPanel,
                border: `1px solid ${isActive ? p.accent : p.border}`,
                borderInlineStart: `3px solid ${isActive ? p.accent : "transparent"}`,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = p.border; }}
            >
              {/* Eyebrow — room id badge for quick scanning when the
                  operator knows the technical key. */}
              <div style={{ color: p.accent, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                {r.id}
              </div>
              {/* Room type name — the headline. Cormorant Garamond like
                  the room cards on the public site so this pane mirrors
                  the guest-facing identity. */}
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.35rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1, marginTop: 4 }}>
                {typeName}
              </div>
              {/* Short description — the same one-liner the booking
                  surfaces use. Falls back to the longer description when
                  the short isn't translated. */}
              {typeShort && (
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 6, lineHeight: 1.5 }}>
                  {typeShort}
                </div>
              )}
              {/* Capacity + size — one compact info line. */}
              {capacityParts.length > 0 && (
                <div style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 8, letterSpacing: "0.04em" }}>
                  {capacityParts.join(" · ")}
                </div>
              )}
              {/* Extra-bed policy — only when available so the card stays
                  uncluttered for studios. */}
              {r.extraBedAvailable && r.maxExtraBeds > 0 && (
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 4 }}>
                  + up to {r.maxExtraBeds} extra bed{r.maxExtraBeds === 1 ? "" : "s"} · {formatCurrency(r.extraBedFee || 0)}/night
                </div>
              )}
              {/* Pricing pill — weekday + weekend at a glance. */}
              <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", fontWeight: 700, marginTop: 8, letterSpacing: "0.02em" }}>
                {priceLabel}
              </div>
              {/* Unit count headline — matches the original card style. */}
              <div className="flex items-baseline gap-2" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${p.border}` }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1 }}>
                  {v.total}
                </span>
                <span style={{ color: p.textMuted, fontSize: "0.72rem", letterSpacing: "0.04em" }}>
                  {v.total === 1 ? "unit" : "units"} in inventory
                </span>
              </div>
              {/* Status counts — active / OOO / reserved. */}
              <div className="flex items-center gap-3 mt-1.5" style={{ fontSize: "0.72rem", color: p.textMuted, flexWrap: "wrap" }}>
                <span style={{ color: p.success, fontWeight: 600 }}>● {v.active} active</span>
                {v.ooo > 0 && <span style={{ color: p.danger, fontWeight: 600 }}>● {v.ooo} OOO</span>}
                {v.reserved > 0 && <span style={{ color: p.warn, fontWeight: 600 }}>● {v.reserved} held</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters + view toggle + actions */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex flex-wrap gap-2 items-center">
          <span style={{ color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
            <Filter size={11} style={{ display: "inline", marginInlineEnd: 4 }} /> Filters
          </span>
          <div style={{ minWidth: 150 }}>
            <SelectField
              value={filterType}
              onChange={setFilterType}
              options={[{ value: "all", label: "All types" }, ...rooms.map((r) => ({ value: r.id, label: t(`rooms.${r.id}.short`) || r.id }))]}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <SelectField
              value={filterFloor}
              onChange={setFilterFloor}
              options={[{ value: "all", label: "All floors" }, ...floors.map((f) => ({ value: String(f), label: `Floor ${f}` }))]}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <SelectField
              value={filterStatus}
              onChange={setFilterStatus}
              options={[{ value: "all", label: "All statuses" }, ...ROOM_UNIT_STATUSES.map((s) => ({ value: s.id, label: s.label }))]}
            />
          </div>
          {(filterType !== "all" || filterFloor !== "all" || filterStatus !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterFloor("all"); setFilterStatus("all"); }}
              style={{
                color: p.accent, fontSize: "0.62rem", letterSpacing: "0.22em",
                textTransform: "uppercase", fontWeight: 700,
                padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, background: "transparent", cursor: "pointer",
              }}
            >Reset</button>
          )}
          <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>
            {filtered.length} {filtered.length === 1 ? "unit" : "units"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex" style={{ border: `1px solid ${p.border}` }}>
            <button
              onClick={() => setView("list")}
              title="List view"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem",
                backgroundColor: view === "list" ? p.accent : "transparent",
                color: view === "list" ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                border: "none", borderInlineEnd: `1px solid ${p.border}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
              }}
            ><List size={11} /> List</button>
            <button
              onClick={() => setView("grid")}
              title="Floor-plan grid"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem",
                backgroundColor: view === "grid" ? p.accent : "transparent",
                color: view === "grid" ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                border: "none",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
              }}
            ><LayoutGrid size={11} /> Grid</button>
          </div>
          <GhostBtn small onClick={() => setBulkOpen(true)}><Layers size={11} /> Bulk add</GhostBtn>
          <PrimaryBtn small onClick={() => setCreating(true)}><Plus size={11} /> Add unit</PrimaryBtn>
        </div>
      </div>

      {/* Body — list or grid */}
      {view === "list" && (
        <Card title={`Units · ${filtered.length}`} padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Type</Th>
                <Th align="end">Floor</Th>
                <Th>View</Th>
                <Th>Status</Th>
                <Th>Flags</Th>
                <Th>Notes</Th>
                <Th align="end">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><Td className="px-3 py-8" align="center" muted colSpan={8}>
                  No units match the filters.
                </Td></tr>
              )}
              {filtered.map((u) => {
                const room = rooms.find((r) => r.id === u.roomTypeId);
                const status = STATUS_BY_ID[u.status] || ROOM_UNIT_STATUSES[0];
                const view = VIEW_BY_ID[u.view];
                return (
                  <tr key={u.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setEditing(u)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <Td>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary, fontWeight: 600 }}>
                        #{u.number}
                      </div>
                      <div style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.05em", marginTop: 2 }}>{u.id}</div>
                    </Td>
                    <Td>{room ? (t(`rooms.${room.id}.name`) || room.id) : u.roomTypeId}</Td>
                    <Td align="end" muted>Floor {u.floor}</Td>
                    <Td muted>{view?.label || "—"}</Td>
                    <Td>
                      <span style={chip(status.color)}>
                        <span style={dot(status.color)} />
                        {status.label}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {u.accessible && (
                          <span title="Accessible / disabled access" style={{ color: p.accent, fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Accessibility size={11} /> A11y
                          </span>
                        )}
                        {u.connectingId && (
                          <span title="Connecting suite" style={{ color: p.accent, fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Link2 size={11} /> Connect
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td muted style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.notes || ""}
                    </Td>
                    <Td align="end">
                      <div className="inline-flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setEditing(u)} title="Edit"
                          style={iconBtn(p)}
                          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                        ><Edit2 size={11} /></button>
                        <button onClick={() => removeUnit(u)} title="Remove"
                          style={iconBtn(p)}
                          onMouseEnter={(e) => { e.currentTarget.style.color = p.danger; e.currentTarget.style.borderColor = p.danger; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                        ><Trash2 size={11} /></button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}

      {view === "grid" && (
        <FloorGrid units={filtered} rooms={rooms} onEdit={setEditing} />
      )}

      {/* Editors */}
      {creating && <UnitEditor unit={null} onClose={() => setCreating(false)} />}
      {editing  && <UnitEditor unit={editing} onClose={() => setEditing(null)} />}
      {bulkOpen && <BulkAddDrawer onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FloorGrid — units rendered floor-by-floor as small numbered tiles
// ---------------------------------------------------------------------------
function FloorGrid({ units, rooms, onEdit }) {
  const t = useT();
  const p = usePalette();
  const byFloor = useMemo(() => {
    const out = new Map();
    units.forEach((u) => {
      if (!out.has(u.floor)) out.set(u.floor, []);
      out.get(u.floor).push(u);
    });
    out.forEach((arr) => arr.sort((a, b) => Number(a.number) - Number(b.number)));
    return out;
  }, [units]);

  if (units.length === 0) {
    return (
      <div className="p-8 text-center" style={{ border: `1px dashed ${p.border}`, color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
        No units match the filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(byFloor.keys()).sort((a, b) => b - a).map((floor) => (
        <div key={floor} style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Floor {floor}
            </div>
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem" }}>
              {byFloor.get(floor).length} units
            </span>
          </div>
          <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {byFloor.get(floor).map((u) => {
              const room = rooms.find((r) => r.id === u.roomTypeId);
              const status = STATUS_BY_ID[u.status] || ROOM_UNIT_STATUSES[0];
              return (
                <button
                  key={u.id}
                  onClick={() => onEdit(u)}
                  title={`${room ? (t(`rooms.${room.id}.name`) || room.id) : u.roomTypeId} · ${VIEW_BY_ID[u.view]?.label || u.view} · ${status.label}${u.notes ? ` · ${u.notes}` : ""}`}
                  className="p-2 text-center transition-colors"
                  style={{
                    backgroundColor: `${status.color}10`,
                    border: `1.5px solid ${status.color}40`,
                    borderInlineStart: `4px solid ${status.color}`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${status.color}25`; e.currentTarget.style.borderColor = status.color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${status.color}10`; e.currentTarget.style.borderColor = `${status.color}40`; e.currentTarget.style.borderInlineStartColor = status.color; }}
                >
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 600 }}>
                    {u.number}
                  </div>
                  <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>
                    {room ? (t(`rooms.${room.id}.short`) || room.id) : u.roomTypeId}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnitEditor — drawer to add or edit a single unit
// ---------------------------------------------------------------------------
function UnitEditor({ unit, onClose }) {
  const t = useT();
  const p = usePalette();
  const { rooms, roomUnits, addRoomUnit, updateRoomUnit, removeRoomUnit, setRoomUnitStatus } = useData();
  const isNew = !unit?.id;

  const [draft, setDraft] = useState(() => ({
    number: "", roomTypeId: rooms[0]?.id || "studio", floor: 1,
    view: "garden", status: "active", accessible: false, connectingId: null, notes: "",
    ...unit,
  }));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const otherUnits = (roomUnits || []).filter((u) => u.id !== unit?.id);
  const numberTaken = otherUnits.some((u) => String(u.number) === String(draft.number).trim());

  const save = () => {
    if (!String(draft.number).trim()) { pushToast({ message: "Room number is required", kind: "warn" }); return; }
    if (numberTaken) { pushToast({ message: `Room ${draft.number} already exists`, kind: "warn" }); return; }
    if (!draft.roomTypeId) { pushToast({ message: "Pick a room type", kind: "warn" }); return; }
    if (isNew) {
      addRoomUnit(draft);
      pushToast({ message: `Unit added · room ${draft.number}` });
    } else {
      updateRoomUnit(unit.id, draft);
      pushToast({ message: `Unit updated · room ${draft.number}` });
    }
    onClose?.();
  };

  const remove = () => {
    if (!unit?.id) return;
    if (!confirm(`Remove unit ${unit.number}? This can't be undone.`)) return;
    removeRoomUnit(unit.id);
    pushToast({ message: `Removed · room ${unit.number}` });
    onClose?.();
  };

  const room = rooms.find((r) => r.id === draft.roomTypeId);
  const status = STATUS_BY_ID[draft.status] || ROOM_UNIT_STATUSES[0];

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={isNew ? "Add unit" : `Edit unit · ${unit.id}`}
      title={isNew ? `New room number` : `Room ${unit.number}`}
      fullPage
      contentMaxWidth="max-w-3xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          {!isNew && <GhostBtn small danger onClick={remove}><Trash2 size={11} /> Remove</GhostBtn>}
          <div className="flex-1" />
          <PrimaryBtn small onClick={save}><Save size={12} /> {isNew ? "Add unit" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Identity">
          <FormGroup label="Room number *">
            <TextField
              value={draft.number}
              onChange={(v) => set({ number: v })}
              placeholder="e.g. 304"
            />
            {numberTaken && (
              <div style={{ color: p.danger, fontSize: "0.74rem", marginTop: 4 }}>
                Already in use — pick another number.
              </div>
            )}
          </FormGroup>
          <FormGroup label="Room type *" className="mt-4">
            <SelectField
              value={draft.roomTypeId}
              onChange={(v) => set({ roomTypeId: v })}
              options={rooms.map((r) => ({ value: r.id, label: t(`rooms.${r.id}.name`) || r.id }))}
            />
            {room && (
              <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 4 }}>
                {room.sqm} m² · sleeps {room.occupancy} · {formatCurrency(room.price)}/night
              </div>
            )}
          </FormGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FormGroup label="Floor">
              <input
                type="number" min={0}
                value={draft.floor}
                onChange={(e) => set({ floor: parseInt(e.target.value, 10) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
            <FormGroup label="View">
              <SelectField
                value={draft.view || ""}
                onChange={(v) => set({ view: v })}
                options={[{ value: "", label: "—" }, ...ROOM_VIEWS.map((v) => ({ value: v.id, label: v.label }))]}
              />
            </FormGroup>
          </div>
        </Card>

        <Card title="Status & flags">
          <FormGroup label="Status">
            <div className="flex flex-wrap gap-2">
              {ROOM_UNIT_STATUSES.map((s) => {
                const sel = draft.status === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => set({ status: s.id })}
                    title={s.hint}
                    style={{
                      padding: "0.4rem 0.85rem",
                      backgroundColor: sel ? `${s.color}1F` : "transparent",
                      border: `1px solid ${sel ? s.color : p.border}`,
                      color: sel ? s.color : p.textSecondary,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  ><span style={dot(s.color)} /> {s.label}</button>
                );
              })}
            </div>
            <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 6 }}>{status.hint}</div>
          </FormGroup>

          <FormGroup label="Connecting suite (paired with another unit)" className="mt-4">
            <SelectField
              value={draft.connectingId || ""}
              onChange={(v) => set({ connectingId: v || null })}
              options={[{ value: "", label: "— None —" }, ...otherUnits.map((u) => ({ value: u.id, label: `Room ${u.number} · ${u.id}` }))]}
            />
          </FormGroup>

          <div className="mt-4 p-3 flex items-start justify-between gap-3 flex-wrap" style={{
            backgroundColor: draft.accessible ? `${p.accent}10` : p.bgPanelAlt,
            border: `1px solid ${draft.accessible ? p.accent : p.border}`,
            borderInlineStart: `3px solid ${draft.accessible ? p.accent : p.border}`,
          }}>
            <div className="flex items-start gap-3">
              <Accessibility size={16} style={{ color: draft.accessible ? p.accent : p.textMuted, marginTop: 2 }} />
              <div>
                <div style={{ color: p.textPrimary, fontWeight: 700, fontSize: "0.86rem" }}>Accessible / disabled access</div>
                <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 2 }}>
                  Wider doorways, grab bars, roll-in shower. Pre-allocated to qualifying guests.
                </div>
              </div>
            </div>
            <button
              onClick={() => set({ accessible: !draft.accessible })}
              style={{
                width: 44, height: 24, borderRadius: 999,
                backgroundColor: draft.accessible ? p.accent : p.border,
                position: "relative", border: "none", cursor: "pointer", flexShrink: 0,
              }}
              aria-pressed={draft.accessible}
            >
              <span style={{
                position: "absolute", top: 2, left: draft.accessible ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%",
                backgroundColor: "#fff", transition: "left 120ms",
              }} />
            </button>
          </div>
        </Card>

        <Card title="Notes" className="lg:col-span-2">
          <textarea
            value={draft.notes || ""}
            onChange={(e) => set({ notes: e.target.value })}
            rows={3}
            placeholder="Quirks, current maintenance state, owner remarks…"
            className="w-full outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", resize: "vertical",
            }}
          />
        </Card>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// BulkAddDrawer — generate a range of room numbers in one go
// ---------------------------------------------------------------------------
function BulkAddDrawer({ onClose }) {
  const t = useT();
  const p = usePalette();
  const { rooms, roomUnits, addRoomUnits } = useData();

  const [draft, setDraft] = useState({
    roomTypeId: rooms[0]?.id || "studio",
    floor: 1, view: "garden", status: "active",
    fromNumber: "", toNumber: "", padTo: 0, prefix: "",
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Compute the list to be added
  const generated = useMemo(() => {
    const from = parseInt(draft.fromNumber, 10);
    const to   = parseInt(draft.toNumber, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
    const taken = new Set((roomUnits || []).map((u) => String(u.number)));
    const out = [];
    for (let i = from; i <= to; i++) {
      const padded = draft.padTo > 0 ? String(i).padStart(draft.padTo, "0") : String(i);
      const number = `${draft.prefix || ""}${padded}`;
      out.push({
        number, roomTypeId: draft.roomTypeId, floor: draft.floor,
        view: draft.view, status: draft.status,
        accessible: false, connectingId: null, notes: "",
        skipped: taken.has(number),
      });
    }
    return out;
  }, [draft, roomUnits]);

  const willCreate = generated.filter((u) => !u.skipped).length;
  const willSkip   = generated.filter((u) => u.skipped).length;

  const save = () => {
    const fresh = generated.filter((u) => !u.skipped);
    if (fresh.length === 0) { pushToast({ message: "No new units to create", kind: "warn" }); return; }
    addRoomUnits(fresh);
    pushToast({ message: `Bulk added · ${fresh.length} new unit${fresh.length === 1 ? "" : "s"}${willSkip > 0 ? ` (${willSkip} skipped, already exist)` : ""}` });
    onClose?.();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="Bulk add"
      title="Generate a range of room numbers"
      fullPage
      contentMaxWidth="max-w-3xl"
      footer={
        <>
          <GhostBtn small onClick={onClose}>Cancel</GhostBtn>
          <div className="flex-1" />
          <PrimaryBtn small onClick={save}>
            <Save size={12} /> Create {willCreate} unit{willCreate === 1 ? "" : "s"}
          </PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Range">
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="From number *">
              <TextField value={draft.fromNumber} onChange={(v) => set({ fromNumber: v })} placeholder="101" />
            </FormGroup>
            <FormGroup label="To number *">
              <TextField value={draft.toNumber} onChange={(v) => set({ toNumber: v })} placeholder="115" />
            </FormGroup>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FormGroup label="Prefix (optional)">
              <TextField value={draft.prefix} onChange={(v) => set({ prefix: v })} placeholder="e.g. A" />
            </FormGroup>
            <FormGroup label="Pad to digits">
              <input
                type="number" min={0} max={6}
                value={draft.padTo}
                onChange={(e) => set({ padTo: parseInt(e.target.value, 10) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
          </div>
          <div className="mt-3" style={{ color: p.textMuted, fontSize: "0.74rem" }}>
            Pad-to-digits zero-fills numbers below the threshold (e.g. <code>3</code> turns 1 into 001).
          </div>
        </Card>

        <Card title="Defaults">
          <FormGroup label="Room type">
            <SelectField
              value={draft.roomTypeId}
              onChange={(v) => set({ roomTypeId: v })}
              options={rooms.map((r) => ({ value: r.id, label: t(`rooms.${r.id}.name`) || r.id }))}
            />
          </FormGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FormGroup label="Floor">
              <input
                type="number" min={0}
                value={draft.floor}
                onChange={(e) => set({ floor: parseInt(e.target.value, 10) || 0 })}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </FormGroup>
            <FormGroup label="View">
              <SelectField
                value={draft.view || ""}
                onChange={(v) => set({ view: v })}
                options={[{ value: "", label: "—" }, ...ROOM_VIEWS.map((v) => ({ value: v.id, label: v.label }))]}
              />
            </FormGroup>
          </div>
          <FormGroup label="Status" className="mt-4">
            <SelectField
              value={draft.status}
              onChange={(v) => set({ status: v })}
              options={ROOM_UNIT_STATUSES.map((s) => ({ value: s.id, label: s.label }))}
            />
          </FormGroup>
        </Card>

        <Card title={`Preview · ${generated.length} number${generated.length === 1 ? "" : "s"}`} className="lg:col-span-2">
          {generated.length === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.84rem" }}>
              Enter a valid number range (from ≤ to) to preview the units.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto p-2"
                style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                {generated.map((u) => (
                  <span key={u.number} title={u.skipped ? "Already exists — will be skipped" : "Will be created"}
                    style={{
                      padding: "3px 9px", fontSize: "0.72rem",
                      fontFamily: "'Manrope', sans-serif", fontWeight: 700,
                      color: u.skipped ? p.textMuted : p.success,
                      backgroundColor: u.skipped ? "transparent" : `${p.success}1A`,
                      border: `1px solid ${u.skipped ? p.border : p.success}`,
                      textDecoration: u.skipped ? "line-through" : "none",
                    }}
                  >{u.number}</span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4" style={{ fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif" }}>
                <span style={{ color: p.success, fontWeight: 700 }}>● {willCreate} new</span>
                {willSkip > 0 && <span style={{ color: p.textMuted }}>● {willSkip} already exist (will skip)</span>}
              </div>
            </>
          )}
        </Card>
      </div>
    </Drawer>
  );
}

// ─── Shared chip / dot styles ────────────────────────────────────────────
function chip(color) {
  return {
    color, backgroundColor: `${color}1F`, border: `1px solid ${color}`,
    padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
    whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 5,
  };
}
function dot(color) {
  return { width: 7, height: 7, borderRadius: "50%", backgroundColor: color };
}
function iconBtn(p) {
  return {
    width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: p.textMuted, border: `1px solid ${p.border}`, backgroundColor: "transparent", cursor: "pointer",
  };
}
