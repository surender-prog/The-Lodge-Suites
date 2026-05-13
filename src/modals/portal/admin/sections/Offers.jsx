import React, { useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, Baby, BedDouble, CalendarRange, Check, ChefHat, Coffee, Crown, Dumbbell,
  Edit2, Eye, EyeOff, Flame, Heart, Hotel, ImageIcon, Plus, Save, Sparkles,
  Star, Trash2, Type as TypeIcon, Users as UsersIcon, Waves,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT } from "../../../../i18n/LanguageContext.jsx";
import { useData, describePackageConditions, packagePriceSuffix, PACKAGE_PRICING_MODES, getPackageMinPrice, formatCurrency } from "../../../../data/store.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, SelectField, Stat, TableShell, Td, Th, TextField } from "../ui.jsx";
import { IMG } from "../../../../data/images.js";
import { C } from "../../../../data/tokens.js";

// Editable defaults — note these are stored alongside the package, separate
// from the i18n strings so admin can override on the fly.
//
// Icons are surfaced as a visual button picker (lucide components) so the
// operator can see what they're choosing without remembering the names.
const ICON_OPTIONS = [
  { value: "Sparkles", label: "Sparkles", Cmp: Sparkles },
  { value: "Coffee",   label: "Coffee",   Cmp: Coffee   },
  { value: "Waves",    label: "Waves",    Cmp: Waves    },
  { value: "Heart",    label: "Heart",    Cmp: Heart    },
  { value: "Baby",     label: "Family",   Cmp: Baby     },
  { value: "Hotel",    label: "Hotel",    Cmp: Hotel    },
  { value: "Crown",    label: "Crown",    Cmp: Crown    },
  { value: "Flame",    label: "Flame",    Cmp: Flame    },
  { value: "Dumbbell", label: "Wellness", Cmp: Dumbbell },
  { value: "ChefHat",  label: "Dining",   Cmp: ChefHat  },
];
const IMAGE_OPTIONS = [
  { value: IMG.spa,        label: "Bath amenity tray (spa)" },
  { value: IMG.breakfast,  label: "Suite dining (breakfast)" },
  { value: IMG.poolside,   label: "Pool" },
  { value: IMG.romantic,   label: "Sea view bedroom (romantic)" },
  { value: IMG.family,     label: "Kids playroom (family)" },
  { value: IMG.livingRoom, label: "Living room (long stay)" },
];
const COLOR_OPTIONS = [
  { value: C.gold,       label: "Gold" },
  { value: C.goldBright, label: "Gold bright" },
  { value: C.goldDeep,   label: "Gold deep" },
  { value: C.burgundy,   label: "Burgundy" },
  { value: C.navy,       label: "Navy" },
];

function emptyDraft() {
  return {
    id: "", title: "", nights: "From 1 night",
    image: IMAGE_OPTIONS[0].value,
    icon: "Sparkles",
    inclusions: ["", "", "", ""],
    color: C.gold,
    featured: false,
    active: true,
    // Booking conditions — empty arrays / 0 mean "no constraint" so a brand
    // new offer is bookable against every suite by default.
    roomIds: [],
    roomPricing: {},
    minNights: 1, maxNights: 0,
    pricingMode: "per-night",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  };
}

export const Offers = () => {
  const t = useT();
  const p = usePalette();
  const { packages, upsertPackage, removePackage, togglePackage } = useData();
  const [editing, setEditing] = useState(null); // { mode: 'edit'|'create', draft }

  const startEdit = (pkg) => {
    setEditing({
      mode: "edit",
      draft: {
        id: pkg.id,
        title: t(`packages.${pkg.id}.title`) || pkg.title || "",
        nights: t(`packages.${pkg.id}.nights`) || pkg.nights || "",
        image: pkg.image,
        icon: pkg.icon,
        inclusions: t(`packages.${pkg.id}.inclusions`) || pkg.inclusions || [""],
        color: pkg.color,
        featured: !!pkg.featured,
        active: pkg.active !== false,
        roomIds: Array.isArray(pkg.roomIds) ? pkg.roomIds : [],
        roomPricing: pkg.roomPricing && typeof pkg.roomPricing === "object"
          ? Object.fromEntries(Object.entries(pkg.roomPricing).map(([id, v]) => [id, {
              price:  Number(v?.price)  || 0,
              saving: Number(v?.saving) || 0,
            }]))
          // Legacy single-price offers — promote to a per-room matrix using
          // the old global price/saving so editing in the new UI is seamless.
          : (Array.isArray(pkg.roomIds) && pkg.roomIds.length > 0
              ? Object.fromEntries(pkg.roomIds.map((id) => [id, { price: Number(pkg.price) || 0, saving: Number(pkg.saving) || 0 }]))
              : (pkg.price ? { _any: { price: Number(pkg.price) || 0, saving: Number(pkg.saving) || 0 } } : {})),
        minNights: Number(pkg.minNights) || 0,
        maxNights: Number(pkg.maxNights) || 0,
        pricingMode: pkg.pricingMode || "per-night",
        bookingValidFrom: pkg.bookingValidFrom || "",
        bookingValidTo:   pkg.bookingValidTo   || "",
        stayValidFrom:    pkg.stayValidFrom    || "",
        stayValidTo:      pkg.stayValidTo      || "",
      },
    });
  };
  const startCreate = () => setEditing({ mode: "create", draft: emptyDraft() });

  const save = () => {
    const d = editing.draft;
    const id = d.id || `offer-${Date.now()}`;
    // Normalise the per-room pricing matrix: drop empty entries, coerce
    // numbers, and strip the legacy `_any` fallback when the operator has
    // since defined eligible suites.
    const normalisedPricing = {};
    for (const [rid, entry] of Object.entries(d.roomPricing || {})) {
      if (rid === "_any" && Array.isArray(d.roomIds) && d.roomIds.length > 0) continue;
      const price  = Number(entry?.price)  || 0;
      const saving = Number(entry?.saving) || 0;
      if (price <= 0 && saving <= 0) continue;
      normalisedPricing[rid] = { price, saving };
    }
    // Headline price/saving = the lowest in the matrix (used as a fallback
    // by the legacy code paths that still read `pkg.price`).
    const min = getPackageMinPrice({ roomPricing: normalisedPricing });
    upsertPackage({
      id,
      title: d.title,
      nights: d.nights,
      image: d.image,
      price:  min.price,
      saving: min.saving,
      icon: d.icon,
      inclusions: (d.inclusions || []).filter(Boolean),
      color: d.color,
      featured: d.featured,
      active: d.active,
      roomIds: Array.isArray(d.roomIds) ? d.roomIds : [],
      roomPricing: normalisedPricing,
      minNights: Number(d.minNights) || 0,
      maxNights: Number(d.maxNights) || 0,
      pricingMode: d.pricingMode || "per-night",
      bookingValidFrom: d.bookingValidFrom || "",
      bookingValidTo:   d.bookingValidTo   || "",
      stayValidFrom:    d.stayValidFrom    || "",
      stayValidTo:      d.stayValidTo      || "",
    });
    setEditing(null);
  };

  const updateDraft = (patch) => setEditing((e) => ({ ...e, draft: { ...e.draft, ...patch } }));
  const updateInclusion = (i, v) => updateDraft({ inclusions: editing.draft.inclusions.map((x, idx) => idx === i ? v : x) });
  const addInclusion = () => updateDraft({ inclusions: [...editing.draft.inclusions, ""] });
  const removeInclusion = (i) => updateDraft({ inclusions: editing.draft.inclusions.filter((_, idx) => idx !== i) });
  const moveInclusion = (i, dir) => {
    const arr = [...editing.draft.inclusions];
    const target = i + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[i], arr[target]] = [arr[target], arr[i]];
    updateDraft({ inclusions: arr });
  };

  const activeCount = packages.filter(p => p.active !== false).length;
  const featuredCount = packages.filter(p => p.featured).length;
  const avgSaving = packages.length
    ? Math.round(packages.reduce((s, p) => s + (getPackageMinPrice(p).saving || 0), 0) / packages.length)
    : 0;

  return (
    <div>
      <PageHeader
        title="Offers & Packages"
        intro="Bundled experiences shown on the homepage and in rate searches. Toggle off to hide; deactivated offers remain in admin but vanish from the public site."
        action={<PrimaryBtn onClick={startCreate} small><Plus size={12} /> New offer</PrimaryBtn>}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Active offers" value={activeCount} hint={`${packages.length - activeCount} hidden`} color={p.success} />
        <Stat label="Featured" value={featuredCount} hint="Shown with 'Most Popular' badge" />
        <Stat label="Avg saving" value={formatCurrency(avgSaving)} color={p.accent} />
      </div>

      <Card padded={false} title="All offers">
        <TableShell>
          <thead>
            <tr>
              <Th />
              <Th>Offer</Th>
              <Th align="end">From</Th>
              <Th align="end">Saving</Th>
              <Th>Featured</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => {
              const title = t(`packages.${pkg.id}.title`) || pkg.title;
              const isActive = pkg.active !== false;
              const headline = getPackageMinPrice(pkg);
              return (
                <tr key={pkg.id}>
                  <Td>
                    <img src={pkg.image} alt="" style={{ width: 72, height: 48, objectFit: "cover", border: `1px solid ${p.border}` }} />
                  </Td>
                  <Td>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary }}>{title}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{pkg.id}</div>
                  </Td>
                  <Td align="end">{formatCurrency(headline.price)}</Td>
                  <Td align="end" className="font-semibold" >{formatCurrency(headline.saving)}</Td>
                  <Td>{pkg.featured ? "★" : "—"}</Td>
                  <Td>
                    <button onClick={() => togglePackage(pkg.id)} style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px",
                      color: isActive ? p.success : p.textDim,
                      border: `1px solid ${isActive ? p.success : p.border}`,
                      cursor: "pointer",
                    }}>
                      {isActive ? "Live" : "Hidden"}
                    </button>
                  </Td>
                  <Td align="end">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => startEdit(pkg)} className="inline-flex items-center gap-1.5"
                        style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                        <Edit2 size={11} /> Edit
                      </button>
                      <button onClick={() => { if (confirm(`Remove "${title}"?`)) removePackage(pkg.id); }} className="inline-flex items-center gap-1.5"
                        style={{ color: p.danger, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        eyebrow={editing?.mode === "create" ? "New" : "Edit"}
        title={editing?.mode === "create" ? "New offer" : (editing?.draft?.title || "Offer")}
        fullPage
        contentMaxWidth="max-w-6xl"
        footer={
          <>
            <GhostBtn onClick={() => setEditing(null)} small>Cancel</GhostBtn>
            <PrimaryBtn onClick={save} small><Save size={12} /> Save offer</PrimaryBtn>
          </>
        }
      >
        {editing && (
          <OfferEditor
            draft={editing.draft}
            mode={editing.mode}
            updateDraft={updateDraft}
            updateInclusion={updateInclusion}
            addInclusion={addInclusion}
            removeInclusion={removeInclusion}
            moveInclusion={moveInclusion}
            t={t}
          />
        )}
      </Drawer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// OfferEditor — full-page editor with two columns:
//   • Left  — form sections (Identity, Pricing, Visual, Inclusions, Visibility)
//   • Right — sticky live preview that mirrors the homepage offer card so the
//             operator sees exactly how their changes will look on the public
//             site, including the Most Popular ribbon, accent-colour saving
//             chip, and inclusion list.
// ---------------------------------------------------------------------------
function OfferEditor({ draft, mode, updateDraft, updateInclusion, addInclusion, removeInclusion, moveInclusion, t }) {
  const p = usePalette();
  const { rooms } = useData();

  const total = (Number(draft.price) || 0) + (Number(draft.saving) || 0);
  const filledInclusions = (draft.inclusions || []).filter(Boolean);

  const toggleRoomId = (id) => {
    const isOn = (draft.roomIds || []).includes(id);
    const nextIds = isOn ? draft.roomIds.filter((x) => x !== id) : [...(draft.roomIds || []), id];
    // Mirror in the pricing matrix — adding a room seeds an empty row,
    // removing wipes it. Operators can always rebuild the row by toggling
    // the room back on.
    const nextPricing = { ...(draft.roomPricing || {}) };
    if (isOn) {
      delete nextPricing[id];
    } else if (!nextPricing[id]) {
      // Inherit any existing legacy `_any` defaults so toggling rooms on
      // doesn't wipe a price the operator already typed.
      const seed = nextPricing._any || { price: 0, saving: 0 };
      nextPricing[id] = { price: Number(seed.price) || 0, saving: Number(seed.saving) || 0 };
    }
    // Drop the `_any` fallback once explicit suites are configured.
    if (nextIds.length > 0 && nextPricing._any) delete nextPricing._any;
    updateDraft({ roomIds: nextIds, roomPricing: nextPricing });
  };
  const updateRoomPrice = (roomId, patch) => {
    const next = { ...(draft.roomPricing || {}) };
    next[roomId] = { ...(next[roomId] || { price: 0, saving: 0 }), ...patch };
    updateDraft({ roomPricing: next });
  };
  const roomLabel = (id) => t(`rooms.${id}.name`) || id;
  const conditionsLine = describePackageConditions(draft, roomLabel) || "No constraints — bookable against any suite, any nights, any dates.";

  // Resolve the rows the per-room price matrix should render. When the
  // operator hasn't selected any rooms yet, fall back to a single "any
  // suite" row so they can still set a default price; once they pick
  // rooms, render one row per chosen suite.
  const pricingRows = (draft.roomIds || []).length > 0
    ? draft.roomIds.map((id) => ({ id, label: roomLabel(id), occupancy: rooms.find((r) => r.id === id)?.occupancy || null }))
    : [{ id: "_any", label: "Any suite (default)", occupancy: null }];
  // Lowest price in the matrix — surfaced as the headline on the homepage.
  const headline = getPackageMinPrice(draft);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6">
      {/* Form column ------------------------------------------------------ */}
      <div className="space-y-5">
        {/* Identity */}
        <SectionCard title="Identity" subtitle="What guests see at the top of the offer card.">
          <FormGroup label="Title">
            <TextField value={draft.title} onChange={(v) => updateDraft({ title: v })} placeholder="Spa & Stay" />
          </FormGroup>
          <FormGroup label="Eyebrow / nights line">
            <TextField value={draft.nights} onChange={(v) => updateDraft({ nights: v })} placeholder="From 1 night" />
            <Hint p={p}>Short copy above the title — usually a stay length or eligibility note.</Hint>
          </FormGroup>
        </SectionCard>

        {/* Pricing */}
        <SectionCard
          title="Pricing"
          subtitle="One row per eligible suite — the homepage card surfaces the LOWEST price as 'From BHD X'; the booking screen shows each suite's specific price when a guest picks it."
        >
          {/* Per-room price/saving matrix */}
          <div className="overflow-x-auto" style={{ border: `1px solid ${p.border}` }}>
            <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: p.bgPanelAlt }}>
                  <th className="text-start px-4 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>Suite</th>
                  <th className="text-start px-4 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>Public price</th>
                  <th className="text-start px-4 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>Saving</th>
                  <th className="text-start px-4 py-2.5" style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.accent, fontWeight: 700, borderBottom: `1px solid ${p.border}` }}>Original</th>
                </tr>
              </thead>
              <tbody>
                {pricingRows.map((row) => {
                  const entry  = (draft.roomPricing || {})[row.id] || { price: 0, saving: 0 };
                  const orig   = (Number(entry.price) || 0) + (Number(entry.saving) || 0);
                  const isMin  = headline.roomId === row.id || (headline.roomId == null && row.id === "_any");
                  return (
                    <tr key={row.id} style={{ borderTop: `1px solid ${p.border}`, backgroundColor: isMin ? `${p.accent}0A` : "transparent" }}>
                      <td className="px-4 py-2.5" style={{ color: p.textPrimary, fontWeight: 600 }}>
                        {row.label}
                        {isMin && (
                          <span className="ms-2" style={{
                            fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                            color: p.accent, padding: "1px 5px", border: `1px solid ${p.accent}`,
                          }}>From — homepage</span>
                        )}
                        {row.occupancy != null && (
                          <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
                            Sleeps up to {row.occupancy} · guest count auto-fills from this
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2" style={{ width: 150 }}>
                        <TextField type="number" value={entry.price} onChange={(v) => updateRoomPrice(row.id, { price: Number(v) || 0 })} suffix="BHD" />
                      </td>
                      <td className="px-3 py-2" style={{ width: 130 }}>
                        <TextField type="number" value={entry.saving} onChange={(v) => updateRoomPrice(row.id, { saving: Number(v) || 0 })} suffix="BHD" />
                      </td>
                      <td className="px-4 py-2.5" style={{ color: p.textMuted, fontVariantNumeric: "tabular-nums" }}>
                        BHD {orig}
                        <div style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: p.textMuted, marginTop: 2 }}>auto</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Hint p={p}>
            {(draft.roomIds || []).length === 0
              ? "Toggle eligible suites in the Booking conditions section to add per-suite pricing rows."
              : <>Headline price <strong>BHD {headline.price}</strong> from <strong>{roomLabel(headline.roomId)}</strong> — that's what guests see on the homepage offer card.</>}
          </Hint>

          {/* Pricing mode — controls how the price scales across nights. */}
          <FormGroup label="Pricing rule" className="mt-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PACKAGE_PRICING_MODES.map((m) => {
                const active = (draft.pricingMode || "per-night") === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => updateDraft({ pricingMode: m.value })}
                    className="text-start p-3"
                    style={{
                      border: `1.5px solid ${active ? p.accent : p.border}`,
                      backgroundColor: active ? `${p.accent}1A` : p.bgPanelAlt,
                      cursor: "pointer", fontFamily: "'Manrope', sans-serif",
                    }}
                  >
                    <div style={{ color: active ? p.accent : p.textPrimary, fontWeight: 700, fontSize: "0.84rem" }}>
                      {m.label}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 4, lineHeight: 1.5 }}>
                      {m.hint}
                    </div>
                  </button>
                );
              })}
            </div>
            <Hint p={p}>
              {(() => {
                const mode = draft.pricingMode || "per-night";
                const price = headline.price;
                if (mode === "per-night")   return <>3-night example total: <strong>BHD {price * 3}</strong> ({price} × 3) using the headline suite.</>;
                if (mode === "first-night") return <>3-night example: <strong>BHD {price}</strong> first night + 2 × suite rack rate for nights 2–3.</>;
                return <>3-night example total: <strong>BHD {price}</strong> — flat fee regardless of nights.</>;
              })()}
            </Hint>
          </FormGroup>
        </SectionCard>

        {/* Visual */}
        <SectionCard title="Visual" subtitle="Choose the hero image, badge icon, and accent colour.">
          <FormGroup label="Hero image">
            <ImageTilePicker
              value={draft.image}
              options={IMAGE_OPTIONS}
              onChange={(v) => updateDraft({ image: v })}
              p={p}
            />
          </FormGroup>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
            <FormGroup label="Icon (badge)">
              <IconButtonPicker
                value={draft.icon}
                options={ICON_OPTIONS}
                onChange={(v) => updateDraft({ icon: v })}
                accent={draft.color}
                p={p}
              />
            </FormGroup>
            <FormGroup label="Accent colour">
              <ColorSwatchPicker
                value={draft.color}
                options={COLOR_OPTIONS}
                onChange={(v) => updateDraft({ color: v })}
                p={p}
              />
            </FormGroup>
          </div>
        </SectionCard>

        {/* Inclusions */}
        <SectionCard
          title={`Inclusions · ${filledInclusions.length}`}
          subtitle="Bullet points displayed under the title. Each appears with a checkmark on the card."
        >
          <div className="space-y-2">
            {(draft.inclusions || []).map((inc, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{
                  color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                  letterSpacing: "0.22em", fontWeight: 700, width: 24, textAlign: "center", flexShrink: 0,
                }}>{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <TextField value={inc} onChange={(v) => updateInclusion(i, v)} placeholder={`Inclusion ${i + 1}`} />
                </div>
                <div className="flex items-center" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                  <IconBtn p={p} disabled={i === 0} onClick={() => moveInclusion(i, -1)} aria="Move up"><ArrowUp size={13} /></IconBtn>
                  <span style={{ width: 1, alignSelf: "stretch", backgroundColor: p.border }} />
                  <IconBtn p={p} disabled={i === draft.inclusions.length - 1} onClick={() => moveInclusion(i, 1)} aria="Move down"><ArrowDown size={13} /></IconBtn>
                  <span style={{ width: 1, alignSelf: "stretch", backgroundColor: p.border }} />
                  <IconBtn p={p} onClick={() => removeInclusion(i)} danger aria="Remove inclusion"><Trash2 size={13} /></IconBtn>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <GhostBtn onClick={addInclusion} small><Plus size={11} /> Add inclusion</GhostBtn>
            </div>
          </div>
        </SectionCard>

        {/* Booking conditions */}
        <SectionCard
          title="Booking conditions"
          subtitle="Constraints applied when a guest books this offer. Guest count is auto-derived from the chosen suite's occupancy — no manual cap needed."
        >
          {/* Suite eligibility */}
          <FormGroup label="Eligible suites">
            <div className="flex flex-wrap gap-2">
              {(rooms || []).map((r) => {
                const active = (draft.roomIds || []).includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoomId(r.id)}
                    className="inline-flex items-center gap-2"
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
                      padding: "0.45rem 0.85rem",
                      backgroundColor: active ? `${p.accent}1F` : p.bgPanelAlt,
                      border: `1px solid ${active ? p.accent : p.border}`,
                      color: active ? p.accent : p.textMuted,
                      cursor: "pointer",
                    }}
                    title={`Sleeps up to ${r.occupancy}`}
                  >
                    <BedDouble size={11} /> {roomLabel(r.id)}
                  </button>
                );
              })}
            </div>
            <Hint p={p}>Selecting suites adds matching rows to the Pricing matrix above. Leave all unselected for no restriction (the "Any suite" default price applies to every type).</Hint>
          </FormGroup>

          {/* Stay-length range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <FormGroup label="Min nights">
              <TextField type="number" value={draft.minNights} onChange={(v) => updateDraft({ minNights: Number(v) || 0 })} placeholder="0 = no minimum" />
            </FormGroup>
            <FormGroup label="Max nights">
              <TextField type="number" value={draft.maxNights} onChange={(v) => updateDraft({ maxNights: Number(v) || 0 })} placeholder="0 = no maximum" />
            </FormGroup>
          </div>

          {/* Occupancy hint — derived from chosen suites */}
          <div className="mt-4 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px dashed ${p.border}` }}>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Guest occupancy · auto from suite
            </div>
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", marginTop: 6, lineHeight: 1.6 }}>
              {(draft.roomIds || []).length === 0 ? (
                <span style={{ color: p.textMuted }}>Pick eligible suites above and the per-suite occupancy will appear here.</span>
              ) : (
                <ul style={{ listStyle: "disc", paddingInlineStart: 18, margin: 0 }}>
                  {(draft.roomIds || []).map((rid) => {
                    const r = rooms.find((x) => x.id === rid);
                    if (!r) return null;
                    return (
                      <li key={rid}>
                        <strong>{roomLabel(rid)}</strong> — sleeps up to {r.occupancy}
                        {(r.maxAdults != null || r.maxChildren != null) && (
                          <span style={{ color: p.textMuted }}>
                            {" "}({r.maxAdults != null ? `max ${r.maxAdults} adult${r.maxAdults === 1 ? "" : "s"}` : ""}
                            {r.maxAdults != null && r.maxChildren != null ? ", " : ""}
                            {r.maxChildren != null ? `max ${r.maxChildren} child${r.maxChildren === 1 ? "" : "ren"}` : ""})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Validity — when bookings can be placed AND when the stay has
              to fall. Both are optional. */}
          <FormGroup label="Booking window (when guests can place the booking)" className="mt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField type="date" value={draft.bookingValidFrom} onChange={(v) => updateDraft({ bookingValidFrom: v })} placeholder="From" />
              <TextField type="date" value={draft.bookingValidTo}   onChange={(v) => updateDraft({ bookingValidTo:   v })} placeholder="To" />
            </div>
            <Hint p={p}>Leave both empty to allow bookings at any time.</Hint>
          </FormGroup>

          <FormGroup label="Stay window (the dates of the actual stay)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField type="date" value={draft.stayValidFrom} onChange={(v) => updateDraft({ stayValidFrom: v })} placeholder="From" />
              <TextField type="date" value={draft.stayValidTo}   onChange={(v) => updateDraft({ stayValidTo:   v })} placeholder="To" />
            </div>
            <Hint p={p}>Leave both empty to allow stays on any date — perfect for evergreen offers.</Hint>
          </FormGroup>

          <div className="mt-4 p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Conditions summary
            </div>
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", marginTop: 4, lineHeight: 1.5 }}>
              {conditionsLine}
            </div>
          </div>
        </SectionCard>

        {/* Visibility */}
        <SectionCard title="Visibility" subtitle="Control whether this offer appears publicly and how prominent it is.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ToggleCard
              p={p}
              checked={!!draft.featured}
              onChange={(v) => updateDraft({ featured: v })}
              icon={<Star size={16} />}
              title="Featured"
              hint='Adds a "Most Popular" ribbon and a gold border on the homepage.'
            />
            <ToggleCard
              p={p}
              checked={draft.active !== false}
              onChange={(v) => updateDraft({ active: v })}
              icon={draft.active !== false ? <Eye size={16} /> : <EyeOff size={16} />}
              title="Active"
              hint="When off, this offer is hidden on the public site but kept here for editing."
            />
          </div>
        </SectionCard>
      </div>

      {/* Preview column --------------------------------------------------- */}
      <div>
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="flex items-center gap-2" style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
            <Eye size={12} /> Live preview
          </div>
          <OfferCardPreview draft={draft} t={t} p={p} />
          <div style={{ color: p.textMuted, fontSize: "0.74rem", lineHeight: 1.5, fontFamily: "'Manrope', sans-serif" }}>
            This mirrors the homepage card. Toggle Featured to see the gold border and "Most Popular" ribbon.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — kept local so they share editor styling and palette.
// ---------------------------------------------------------------------------

// Card wrapper for a section of the editor — title + subtitle + body.
function SectionCard({ title, subtitle, children }) {
  const p = usePalette();
  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 4, fontFamily: "'Manrope', sans-serif", lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// Tiny helper text under a field (nudges, derivations, etc.)
function Hint({ p, children }) {
  return (
    <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 6, fontFamily: "'Manrope', sans-serif", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// Icon-only button used inside the inclusions row controls.
function IconBtn({ p, onClick, children, disabled, danger, aria }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      style={{
        backgroundColor: "transparent",
        color: disabled ? p.textDim : danger ? p.danger : p.textMuted,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0.55rem 0.65rem",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = danger ? p.danger : p.accent; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.color = danger ? p.danger : p.textMuted; }}
    >
      {children}
    </button>
  );
}

// Image tile picker — displays each option as a real thumbnail. The active
// one shows a gold border + filled checkmark badge.
function ImageTilePicker({ value, options, onChange, p }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="relative overflow-hidden text-start"
            style={{
              border: `2px solid ${active ? p.accent : p.border}`,
              backgroundColor: p.bgPanelAlt,
              cursor: "pointer", padding: 0, aspectRatio: "4/3",
            }}
          >
            <img src={opt.value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div className="absolute inset-x-0 bottom-0 px-2 py-1.5"
              style={{
                background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)",
                color: "#fff", fontSize: "0.66rem", fontWeight: 600,
                fontFamily: "'Manrope', sans-serif",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >{opt.label}</div>
            {active && (
              <div className="absolute top-2 end-2 flex items-center justify-center"
                style={{
                  backgroundColor: p.accent, color: "#FFF", width: 22, height: 22,
                  borderRadius: 999,
                }}
              >
                <Check size={13} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Visual icon picker — each option is a button showing the lucide icon.
function IconButtonPicker({ value, options, onChange, accent, p }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        const Cmp = opt.Cmp;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex flex-col items-center justify-center gap-1"
            style={{
              border: `1.5px solid ${active ? p.accent : p.border}`,
              backgroundColor: active ? `${p.accent}1A` : p.bgPanelAlt,
              padding: "0.55rem 0.4rem", cursor: "pointer",
            }}
            title={opt.label}
          >
            <Cmp size={16} style={{ color: active ? (accent || p.accent) : p.textMuted }} />
            <span style={{
              color: active ? p.accent : p.textMuted,
              fontSize: "0.6rem", letterSpacing: "0.04em",
              fontFamily: "'Manrope', sans-serif", fontWeight: active ? 700 : 500,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
            }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Colour swatch picker — large round chips, gold ring on the active one.
function ColorSwatchPicker({ value, options, onChange, p }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex items-center gap-2"
            style={{
              backgroundColor: active ? `${opt.value}14` : p.bgPanelAlt,
              border: `1.5px solid ${active ? opt.value : p.border}`,
              padding: "0.45rem 0.7rem 0.45rem 0.45rem", cursor: "pointer",
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: "50%",
              backgroundColor: opt.value,
              border: `2px solid ${active ? "#FFF" : "transparent"}`,
              boxShadow: active ? `0 0 0 2px ${opt.value}` : "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              {active && <Check size={11} color="#FFF" />}
            </span>
            <span style={{ color: active ? p.textPrimary : p.textMuted, fontSize: "0.78rem", fontWeight: active ? 700 : 500 }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Toggle styled as a card — used for Featured / Active flags.
function ToggleCard({ p, checked, onChange, icon, title, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="text-start w-full flex items-start gap-3 p-3"
      style={{
        backgroundColor: checked ? `${p.accent}14` : p.bgPanelAlt,
        border: `1.5px solid ${checked ? p.accent : p.border}`,
        cursor: "pointer", fontFamily: "'Manrope', sans-serif",
      }}
    >
      <span style={{
        flexShrink: 0, width: 32, height: 32,
        borderRadius: 999,
        backgroundColor: checked ? p.accent : p.bgPanel,
        color: checked ? "#FFF" : p.textMuted,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${checked ? p.accent : p.border}`,
      }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ color: checked ? p.accent : p.textPrimary, fontWeight: 700, fontSize: "0.86rem" }}>
            {title}
          </span>
          <span style={{
            marginInlineStart: "auto", fontSize: "0.6rem", letterSpacing: "0.18em",
            textTransform: "uppercase", fontWeight: 700,
            color: checked ? p.success : p.textMuted,
          }}>{checked ? "On" : "Off"}</span>
        </div>
        <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2, lineHeight: 1.5 }}>{hint}</div>
      </div>
    </button>
  );
}

// Faithful preview of the homepage offer card.
function OfferCardPreview({ draft, t, p }) {
  const inclusions = (draft.inclusions || []).filter(Boolean);
  const accent = draft.color || C.gold;
  const Icn = ICON_OPTIONS.find((o) => o.value === draft.icon)?.Cmp || Sparkles;
  const headline = getPackageMinPrice(draft);
  const total = headline.price + headline.saving;
  const conditions = describePackageConditions(draft, (id) => t(`rooms.${id}.short`) || t(`rooms.${id}.name`) || id);

  return (
    <div
      className="overflow-hidden flex flex-col"
      style={{
        backgroundColor: C.cream,
        border: `1px solid ${draft.featured ? C.gold : "rgba(0,0,0,0.08)"}`,
        boxShadow: draft.featured ? "0 20px 40px rgba(201,169,97,0.18)" : "0 6px 18px rgba(0,0,0,0.06)",
      }}
    >
      <div className="relative" style={{ aspectRatio: "4/3" }}>
        <img src={draft.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div className="absolute top-3 start-3 flex items-center gap-2 px-3 py-1.5"
          style={{ backgroundColor: C.bgDeep, color: accent }}>
          <Icn size={12} />
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
            Save up to BHD {headline.saving}
          </span>
        </div>
        {draft.featured && (
          <div className="absolute top-3 end-3 px-3 py-1.5"
            style={{
              backgroundColor: C.gold, color: C.bgDeep,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.55rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            }}>
            Most Popular
          </div>
        )}
        {draft.active === false && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
            <div className="flex items-center gap-2 px-3 py-1.5"
              style={{
                backgroundColor: "#FFF", color: "#26282E",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              }}>
              <EyeOff size={12} /> Hidden
            </div>
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col" style={{ color: C.bgDeep }}>
        <div style={{
          color: "#6B665C", fontFamily: "'Manrope', sans-serif",
          fontSize: "0.6rem", letterSpacing: "0.28em",
          textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
        }}>{draft.nights || "From 1 night"}</div>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontWeight: 500, lineHeight: 1.1 }}>
          {draft.title || "Untitled offer"}
        </h3>
        {inclusions.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {inclusions.slice(0, 5).map((inc, i) => (
              <li key={i} className="flex items-start gap-2"
                style={{ color: "#6B665C", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55 }}>
                <Check size={11} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 4 }} />
                <span>{inc}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4" style={{ color: "#A09887", fontSize: "0.78rem", fontStyle: "italic", fontFamily: "'Manrope', sans-serif" }}>
            Add inclusions to see them listed here.
          </div>
        )}
        {conditions && (
          <div className="mt-3 px-2.5 py-1.5"
            style={{
              backgroundColor: "rgba(201,169,97,0.10)",
              border: "1px dashed rgba(154,126,64,0.40)",
              color: C.goldDeep,
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.66rem", letterSpacing: "0.04em", lineHeight: 1.5,
            }}>
            {conditions}
          </div>
        )}
        <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <div>
            <span style={{ color: "#6B665C", fontSize: "0.66rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>From</span>
            <div className="flex items-baseline gap-2">
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1 }}>
                BHD {headline.price}
              </div>
              <span style={{ color: "#6B665C", fontSize: "0.66rem", letterSpacing: "0.08em", fontFamily: "'Manrope', sans-serif" }}>
                {packagePriceSuffix(draft)}
              </span>
              {headline.saving > 0 && (
                <div style={{ color: "#A09887", textDecoration: "line-through", fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif" }}>
                  BHD {total}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5"
            style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Reserve <ArrowRight size={12} />
          </div>
        </div>
      </div>
    </div>
  );
}
