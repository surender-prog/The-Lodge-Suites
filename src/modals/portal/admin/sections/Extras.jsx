import React, { useState } from "react";
import { Edit2, Plus, Save, Trash2 } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT } from "../../../../i18n/LanguageContext.jsx";
import { priceLabelFor, useData, formatCurrency } from "../../../../data/store.jsx";
import { Icon } from "../../../../components/Icon.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, Stat, TableShell, Td, Th, TextField } from "../ui.jsx";

const ICON_OPTIONS = [
  { value: "Coffee",   label: "Coffee · breakfast" },
  { value: "Car",      label: "Car · transfers" },
  { value: "Sparkles", label: "Sparkles · spa" },
  { value: "Heart",    label: "Heart · romance" },
  { value: "Hotel",    label: "Hotel · room services" },
  { value: "Waves",    label: "Waves · pool / wellness" },
  { value: "Flame",    label: "Flame · sauna" },
  { value: "ChefHat",  label: "Chef hat · in-suite dining" },
  { value: "Baby",     label: "Baby · family" },
  { value: "Briefcase",label: "Briefcase · business" },
  { value: "Wifi",     label: "WiFi · connectivity" },
  { value: "Dumbbell", label: "Dumbbell · fitness" },
];
const PRICING_OPTIONS = [
  { value: "per-stay",            label: "Per stay (one-time)" },
  { value: "per-night",           label: "Per night" },
  { value: "per-guest",           label: "Per guest (one-time)" },
  { value: "per-guest-per-night", label: "Per guest, per night" },
];

function emptyDraft() {
  return { id: "", title: "", note: "", icon: "Sparkles", amount: 0, pricing: "per-stay", active: true };
}

export const Extras = () => {
  const t = useT();
  const p = usePalette();
  const { extras, upsertExtra, removeExtra, toggleExtra } = useData();
  const [editing, setEditing] = useState(null); // { mode: "create" | "edit", draft }

  const startEdit = (extra) => setEditing({ mode: "edit", draft: { ...extra } });
  const startCreate = () => setEditing({ mode: "create", draft: emptyDraft() });

  const save = () => {
    const d = editing.draft;
    if (!d.title.trim()) { pushToast({ message: "Give the extra a title first", kind: "warn" }); return; }
    upsertExtra(d);
    pushToast({ message: `${editing.mode === "create" ? "Added" : "Updated"} · ${d.title}` });
    setEditing(null);
  };

  const remove = (extra) => {
    if (!confirm(`Remove "${extra.title}"?`)) return;
    removeExtra(extra.id);
    pushToast({ message: `Removed · ${extra.title}`, kind: "warn" });
  };

  const activeCount = extras.filter(e => e.active !== false).length;
  const avgAmount = extras.length ? Math.round(extras.reduce((s, e) => s + e.amount, 0) / extras.length) : 0;

  return (
    <div>
      <PageHeader
        title="Extras & add-ons"
        intro="Optional add-ons surfaced in the booking modal at step 3 (Personalise your stay). Toggle off to hide; deactivated extras stay in admin but vanish from the public flow."
        action={<PrimaryBtn onClick={startCreate} small><Plus size={12} /> New extra</PrimaryBtn>}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Active extras" value={activeCount} hint={`${extras.length - activeCount} hidden`} color={p.success} />
        <Stat label="Total catalogue" value={extras.length} />
        <Stat label="Avg list price" value={`${t("common.bhd")} ${avgAmount}`} color={p.accent} />
      </div>

      <Card title="All extras" padded={false}>
        <TableShell>
          <thead>
            <tr>
              <Th />
              <Th>Add-on</Th>
              <Th>Pricing</Th>
              <Th align="end">Amount</Th>
              <Th>Status</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {extras.map((extra) => {
              const isActive = extra.active !== false;
              return (
                <tr key={extra.id}>
                  <Td>
                    <div className="flex items-center justify-center" style={{
                      width: 36, height: 36,
                      backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`,
                      color: p.accent,
                    }}>
                      <Icon name={extra.icon} size={18} />
                    </div>
                  </Td>
                  <Td>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", color: p.textPrimary, fontWeight: 600 }}>{extra.title}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>{extra.note}</div>
                  </Td>
                  <Td>
                    <span style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px", color: p.textMuted, border: `1px solid ${p.border}`,
                      whiteSpace: "nowrap",
                    }}>
                      {PRICING_OPTIONS.find(o => o.value === extra.pricing)?.label || extra.pricing}
                    </span>
                  </Td>
                  <Td align="end" style={{ fontWeight: 700, color: p.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                    {priceLabelFor(extra)}
                  </Td>
                  <Td>
                    <button onClick={() => toggleExtra(extra.id)} style={{
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
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(extra)} title="Edit"
                        style={{ color: p.textMuted, padding: "0.35rem 0.6rem", border: `1px solid ${p.border}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => remove(extra)} title="Remove"
                        style={{ color: p.danger, padding: "0.35rem 0.6rem", border: `1px solid ${p.border}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; e.currentTarget.style.backgroundColor = p.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
            {extras.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: p.textMuted, fontSize: "0.88rem" }}>
                No extras yet. <button onClick={startCreate} style={{ color: p.accent, fontWeight: 700 }}>Create the first one →</button>
              </td></tr>
            )}
          </tbody>
        </TableShell>
      </Card>

      {editing && <ExtraEditor mode={editing.mode} draft={editing.draft} onChange={(patch) => setEditing((e) => ({ ...e, draft: { ...e.draft, ...patch } }))} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Full-page editor for a single extra. Live preview at the bottom shows what
// the operator's edit looks like in the booking modal context.
// ---------------------------------------------------------------------------
function ExtraEditor({ mode, draft, onChange, onClose, onSave }) {
  const t = useT();
  const p = usePalette();
  const previewTotal = (() => {
    // Demo with 2 adults / 3 nights — reasonable midpoint for the preview.
    const a = Number(draft.amount) || 0;
    switch (draft.pricing) {
      case "per-guest-per-night": return a * 2 * 3;
      case "per-night":           return a * 3;
      case "per-guest":           return a * 2;
      default:                    return a;
    }
  })();

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={mode === "create" ? "New" : "Edit"}
      title={draft.title || "Untitled extra"}
      fullPage
      contentMaxWidth="max-w-3xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={onSave} small><Save size={11} /> {mode === "create" ? "Create extra" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      <Card title="Identity">
        <div className="space-y-4">
          <FormGroup label="Title">
            <TextField value={draft.title} onChange={(v) => onChange({ title: v })} placeholder="e.g. Daily breakfast" />
          </FormGroup>
          <FormGroup label="Note (one-line description)">
            <TextField value={draft.note} onChange={(v) => onChange({ note: v })} placeholder="Buffet at the lobby café" />
          </FormGroup>
          <FormGroup label="Icon">
            <SelectField value={draft.icon} onChange={(v) => onChange({ icon: v })} options={ICON_OPTIONS} />
          </FormGroup>
        </div>
      </Card>

      <Card title="Pricing" className="mt-6">
        <div className="grid md:grid-cols-2 gap-4">
          <FormGroup label="Amount (BHD)">
            <TextField type="number" value={draft.amount} onChange={(v) => onChange({ amount: Number(v) })} suffix="BHD" />
          </FormGroup>
          <FormGroup label="Charged">
            <SelectField value={draft.pricing} onChange={(v) => onChange({ pricing: v })} options={PRICING_OPTIONS} />
          </FormGroup>
        </div>
        <div className="mt-4 p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
          <div style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Preview · 2 guests, 3 nights</div>
          <div className="flex justify-between mt-2">
            <span style={{ color: p.textPrimary }}>{priceLabelFor(draft)}</span>
            <span style={{ color: p.accent, fontWeight: 700 }}>= {formatCurrency(previewTotal)}</span>
          </div>
        </div>
      </Card>

      <Card title="Visibility" className="mt-6">
        <label className="flex items-start gap-3 cursor-pointer" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
          <input type="checkbox" checked={draft.active !== false} onChange={(e) => onChange({ active: e.target.checked })} style={{ marginTop: 3 }} />
          <div>
            <div style={{ color: p.textPrimary, fontWeight: 600 }}>Show this extra in the booking modal</div>
            <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
              When off, the extra is hidden from the public booking flow but stays in this list. Useful for seasonal items or work-in-progress copy.
            </div>
          </div>
        </label>
      </Card>

      <Card title="Live preview · how guests see it" className="mt-6">
        <div className="p-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
          <div className="flex items-start gap-4">
            <input type="checkbox" disabled style={{ marginTop: 4 }} />
            <Icon name={draft.icon} size={22} style={{ color: p.accent, marginTop: 2 }} />
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary, fontWeight: 500 }}>
                  {draft.title || "Untitled extra"}
                </span>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.accent, fontWeight: 600 }}>
                  {priceLabelFor(draft)}
                </span>
              </div>
              <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.78rem", marginTop: 4 }}>{draft.note}</div>
            </div>
          </div>
        </div>
      </Card>
    </Drawer>
  );
}
