import React, { useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, BookmarkPlus, Check, ChevronDown, Edit2, Plus, Save, Trash2, Zap } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT } from "../../../../i18n/LanguageContext.jsx";
import { applyTaxes, useData, formatCurrency } from "../../../../data/store.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, Stat, TableShell, Td, Th, TextField } from "../ui.jsx";

const APPLIES_TO_LABEL = { all: "All charges", room: "Room rate only", extras: "Extras only" };
const APPLIES_TO_OPTIONS = [
  { value: "all",    label: "All charges" },
  { value: "room",   label: "Room rate only" },
  { value: "extras", label: "Extras only" },
];
const CHARGE_PER_OPTIONS = [
  { value: "room-night",   label: "Per room / night" },
  { value: "person-night", label: "Per person / night" },
  { value: "stay",         label: "Per stay (one-time)" },
];
const CALC_OPTIONS = [
  { value: "straight", label: "Straight" },
  { value: "compound", label: "Compound" },
];
const PRICING_OPTIONS = [
  { value: "exclusive", label: "Exclusive" },
  { value: "inclusive", label: "Inclusive" },
];

// Bahrain tax components. Patterns are the only way to configure tax — the
// Tax Components editor lives inside the pattern create/edit drawer.
export const TaxSetup = () => {
  const t = useT();
  const p = usePalette();
  const { tax, rooms, taxPatterns, activePatternId } = useData();

  const sampleRoom = rooms[0];
  const sampleResult = sampleRoom ? applyTaxes(sampleRoom.price, tax, 1) : { gross: 0, totalTax: 0, lines: [] };
  const totalPct = (tax.components || []).filter(c => c.type === "percentage").reduce((s, c) => s + c.rate, 0);
  const totalFixed = (tax.components || []).filter(c => c.type === "fixed").reduce((s, c) => s + c.amount, 0);
  const activePattern = taxPatterns.find(x => x.id === activePatternId);

  return (
    <div>
      <PageHeader
        title="Tax Setup"
        intro="Tax components are configured inside named patterns — pick or create a pattern below, then apply it. The active pattern drives the worked example and rate preview."
      />

      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Active pattern" value={activePattern?.name || "—"} hint={activePattern?.builtIn ? "Built-in" : "Custom"} color={p.accent} />
        <Stat label="Combined %" value={`${totalPct}%`} hint={`${(tax.components || []).filter(c => c.type === "percentage").length} percentage component${totalPct ? "s" : ""}`} />
        <Stat label="Fixed components" value={`${t("common.bhd")} ${totalFixed}`} hint="Per-night / per-stay levies" />
        <Stat label="Display mode" value={tax.taxInclusiveDisplay ? "Inclusive" : "Exclusive"} hint="Public-facing rates" />
      </div>

      <TaxPatternsCard />

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Card title="Active pattern · summary">
          {activePattern ? (
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: p.textPrimary, fontWeight: 600 }}>
                  {activePattern.name}
                </span>
                {activePattern.builtIn && (
                  <span style={{
                    fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                    padding: "2px 6px", color: p.textMuted, border: `1px solid ${p.border}`,
                  }}>Built-in</span>
                )}
              </div>
              <p style={{ color: p.textMuted, fontSize: "0.78rem", lineHeight: 1.55, marginTop: 6 }}>
                {activePattern.description}
              </p>
              <div className="mt-4 pt-4 space-y-2" style={{ borderTop: `1px solid ${p.border}` }}>
                {(tax.components || []).length === 0 ? (
                  <div style={{ color: p.textMuted, fontStyle: "italic" }}>No tax components</div>
                ) : (
                  tax.components.map((c, idx) => {
                    const isPct = c.type === "percentage";
                    return (
                      <div key={c.id} className="flex items-center gap-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}>
                        <span style={{
                          width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
                          border: `1px solid ${p.accent}`, color: p.accent,
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", fontWeight: 700,
                        }}>{idx + 1}</span>
                        <span style={{ color: p.textPrimary, fontWeight: 600, flex: 1 }}>{c.name}</span>
                        <span style={{ color: p.textMuted, fontSize: "0.72rem", letterSpacing: "0.05em" }}>
                          {APPLIES_TO_LABEL[c.appliesTo]}
                        </span>
                        <span style={{ color: c.calculation === "compound" ? p.warn : p.textMuted, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                          {c.calculation}
                        </span>
                        <span style={{ color: isPct ? p.accent : p.success, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "end" }}>
                          {isPct ? `${c.rate}%` : `${t("common.bhd")} ${c.amount}`}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>No pattern active.</div>
          )}
        </Card>

        <Card title="Worked example">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", color: p.textSecondary }}>
            <Row label={`Net rate (${t(`rooms.${sampleRoom?.id}.name`) || "Room"})`} value={`${t("common.bhd")} ${sampleRoom?.price ?? 0}`} />
            {sampleResult.lines.map((line) => {
              const compound = line.calculation === "compound";
              const note = line.type === "percentage" ? `${line.rate}% ${compound ? "compound" : ""}` : `${t("common.bhd")} ${line.amount}`;
              return (
                <Row
                  key={line.id}
                  label={<>+ {line.name} <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>· {note}</span></>}
                  value={formatCurrency(line.taxAmount)}
                />
              );
            })}
            <div className="pt-3 mt-3 flex justify-between items-baseline" style={{ borderTop: `2px solid ${p.border}` }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.textPrimary }}>Gross at checkout</span>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 600 }}>{formatCurrency(sampleResult.gross)}</span>
            </div>
            <p className="mt-4" style={{ color: p.textMuted, fontSize: "0.75rem", lineHeight: 1.6 }}>
              Compound percentage rates apply to (net + previous taxes). Straight percentage rates apply to the net only.
            </p>
          </div>
        </Card>
      </div>

      <RoomPreview />
    </div>
  );
};

function Row({ label, value }) {
  const p = usePalette();
  return (
    <div className="flex justify-between py-1 gap-2" style={{ color: p.textMuted }}>
      <span style={{ minWidth: 0 }}>{label}</span>
      <span style={{ color: p.textPrimary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable typed-row tax components editor. Lives inside the pattern editor.
// ---------------------------------------------------------------------------
function TaxComponentsEditor({ components, onChange }) {
  const p = usePalette();

  const update = (id, patch) => onChange(components.map((c) => c.id === id ? { ...c, ...patch } : c));
  const remove = (id) => onChange(components.filter(c => c.id !== id));
  const move = (id, dir) => {
    const idx = components.findIndex(c => c.id === id);
    if (idx < 0) return;
    const next = [...components];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const addPercentage = () => {
    onChange([...components, {
      id: `pct-${Date.now()}`, name: "New tax", type: "percentage",
      rate: 0, appliesTo: "all", pricing: "exclusive", calculation: "straight",
    }]);
  };
  const addFixed = () => {
    onChange([...components, {
      id: `fx-${Date.now()}`, name: "New fee", type: "fixed",
      amount: 0, appliesTo: "room", chargePer: "room-night", calculation: "straight",
    }]);
  };

  const hasCompound = components.some(c => c.calculation === "compound");

  return (
    <Card
      padded={false}
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <span>Tax components</span>
          <span style={{
            fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            padding: "2px 7px", color: p.textMuted, border: `1px solid ${p.border}`,
            borderRadius: 999, fontVariantNumeric: "tabular-nums",
          }}>{components.length}</span>
          {hasCompound && (
            <span style={{
              color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 7px", border: `1px solid ${p.accent}`, marginLeft: 4,
            }}>
              <ChevronDown size={10} /> Order matters for compounding
            </span>
          )}
        </div>
      }
      action={
        <div className="flex items-center gap-2">
          <button onClick={addPercentage} className="flex items-center gap-1.5"
            style={{
              padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`,
              color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
          >
            <Plus size={11} /> Add %
          </button>
          <button onClick={addFixed} className="flex items-center gap-1.5"
            style={{
              padding: "0.4rem 0.85rem", border: `1px solid ${p.success}`,
              color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
          >
            <Plus size={11} /> Add fixed
          </button>
        </div>
      }
    >
      {components.length === 0 ? (
        <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
          No components in this pattern. Click <strong style={{ color: p.accent }}>Add %</strong> or <strong style={{ color: p.success }}>Add fixed</strong> above to get started.
        </div>
      ) : (
        <div className="px-5 py-5 space-y-4">
          {components.map((c, idx) => (
            <ComponentRow
              key={c.id}
              index={idx}
              component={c}
              isFirst={idx === 0}
              isLast={idx === components.length - 1}
              onChange={(patch) => update(c.id, patch)}
              onRemove={() => remove(c.id)}
              onMoveUp={() => move(c.id, "up")}
              onMoveDown={() => move(c.id, "down")}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ComponentRow({ index, component, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown }) {
  const p = usePalette();
  const isPct = component.type === "percentage";
  const badgeColor = isPct ? p.accent : p.success;
  const badgeLabel = isPct ? "% Percentage" : "$ Fixed";

  return (
    <div style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span style={{
            width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${p.accent}`, color: p.accent,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}>{index + 1}</span>
          <div className="flex flex-col">
            <button onClick={onMoveUp} disabled={isFirst} title="Move up"
              style={{ color: isFirst ? p.textDim : p.textMuted, padding: "1px", cursor: isFirst ? "default" : "pointer" }}
              onMouseEnter={(e) => { if (!isFirst) e.currentTarget.style.color = p.accent; }}
              onMouseLeave={(e) => { if (!isFirst) e.currentTarget.style.color = p.textMuted; }}
            ><ArrowUp size={11} /></button>
            <button onClick={onMoveDown} disabled={isLast} title="Move down"
              style={{ color: isLast ? p.textDim : p.textMuted, padding: "1px", cursor: isLast ? "default" : "pointer" }}
              onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.color = p.accent; }}
              onMouseLeave={(e) => { if (!isLast) e.currentTarget.style.color = p.textMuted; }}
            ><ArrowDown size={11} /></button>
          </div>
        </div>

        <input
          value={component.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 outline-none"
          style={{
            backgroundColor: "transparent", color: p.textPrimary,
            border: "none", padding: "0.4rem 0.6rem",
            fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", fontWeight: 600,
            minWidth: 0,
          }}
          placeholder="Component name"
        />

        <span style={{
          fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700,
          padding: "3px 9px", color: badgeColor, border: `1px solid ${badgeColor}`,
          flexShrink: 0,
        }}>{badgeLabel}</span>

        <button onClick={onRemove} title="Remove component"
          style={{ color: p.danger, padding: "6px 7px", border: `1px solid ${p.border}`, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; e.currentTarget.style.backgroundColor = p.bgHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = "transparent"; }}
        ><Trash2 size={13} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 py-4">
        {isPct ? (
          <FormGroup label="Rate">
            <TextField type="number" value={component.rate} onChange={(v) => onChange({ rate: Number(v) })} suffix="%" />
          </FormGroup>
        ) : (
          <FormGroup label="Amount">
            <TextField type="number" value={component.amount} onChange={(v) => onChange({ amount: Number(v) })} suffix="BHD" />
          </FormGroup>
        )}
        <FormGroup label="Applies to">
          <Dropdown value={component.appliesTo} onChange={(v) => onChange({ appliesTo: v })} options={APPLIES_TO_OPTIONS} />
        </FormGroup>
        {isPct ? (
          <FormGroup label="Pricing">
            <Dropdown value={component.pricing || "exclusive"} onChange={(v) => onChange({ pricing: v })} options={PRICING_OPTIONS} />
          </FormGroup>
        ) : (
          <FormGroup label="Charge per">
            <Dropdown value={component.chargePer || "room-night"} onChange={(v) => onChange({ chargePer: v })} options={CHARGE_PER_OPTIONS} />
          </FormGroup>
        )}
        <FormGroup label="Calculation">
          <Dropdown value={component.calculation || "straight"} onChange={(v) => onChange({ calculation: v })} options={CALC_OPTIONS} />
        </FormGroup>
      </div>
    </div>
  );
}

function Dropdown({ value, onChange, options }) {
  const p = usePalette();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full outline-none cursor-pointer"
      style={{
        backgroundColor: p.inputBg,
        color: p.textPrimary,
        border: `1px solid ${p.border}`,
        padding: "0.55rem 0.7rem",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.86rem",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Pattern editor — full-page drawer used by both "+ New pattern" and per-row
// edit. Hosts the components editor + name + description + display toggle.
// ---------------------------------------------------------------------------
function PatternEditor({ mode, initial, onClose, onSave, isActive }) {
  const p = usePalette();
  const t = useT();
  const [draft, setDraft] = useState(() => initial || {
    name: "",
    description: "",
    config: { taxInclusiveDisplay: false, components: [] },
    builtIn: false,
  });

  const components = draft.config?.components || [];
  const setComponents = (next) => setDraft((d) => ({ ...d, config: { ...d.config, components: next } }));
  const setDisplay = (taxInclusiveDisplay) => setDraft((d) => ({ ...d, config: { ...d.config, taxInclusiveDisplay } }));

  const sampleRate = 38;
  const preview = applyTaxes(sampleRate, draft.config, 1);

  // Dirty-state detection — compares draft against the original `initial`
  // snapshot so we can disable the Save button when nothing has changed and
  // warn the operator if they try to close with unsaved edits.
  const dirty = useMemo(() => {
    if (mode === "create") return draft.name.trim().length > 0 || components.length > 0;
    if (!initial) return false;
    return JSON.stringify({
      name:        draft.name,
      description: draft.description,
      config:      draft.config,
    }) !== JSON.stringify({
      name:        initial.name,
      description: initial.description,
      config:      initial.config,
    });
  }, [draft, initial, mode, components.length]);

  // Lightweight per-component validation surface.
  const validationError = useMemo(() => {
    if (!draft.name?.trim()) return "Give the pattern a name first";
    for (const c of components) {
      if (!c.name?.trim()) return `One component is missing a name`;
      if (c.type === "percentage" && (c.rate === undefined || c.rate === null || isNaN(Number(c.rate)))) return `${c.name} · rate is required`;
      if (c.type === "fixed" && (c.amount === undefined || c.amount === null || isNaN(Number(c.amount)))) return `${c.name} · amount is required`;
    }
    return null;
  }, [draft.name, components]);

  const save = () => {
    if (validationError) { pushToast({ message: validationError, kind: "warn" }); return; }
    if (!dirty) { pushToast({ message: "No changes to save", kind: "warn" }); return; }
    onSave(draft);
  };

  const handleClose = () => {
    if (dirty && !confirm("Discard unsaved changes? Your edits to this pattern will be lost.")) return;
    onClose();
  };

  const totalPct = components.filter(c => c.type === "percentage").reduce((s, c) => s + c.rate, 0);

  return (
    <Drawer
      open={true}
      onClose={handleClose}
      eyebrow={
        <span className="inline-flex items-center gap-2">
          {mode === "create" ? "New pattern" : "Edit pattern"}
          {dirty && (
            <span className="inline-flex items-center gap-1.5" style={{
              fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "1px 7px", color: p.warn, border: `1px solid ${p.warn}`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: p.warn, display: "inline-block" }} />
              Unsaved
            </span>
          )}
          {isActive && (
            <span style={{
              fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "1px 7px", color: p.success, border: `1px solid ${p.success}`,
            }}>Active · saves apply live</span>
          )}
        </span>
      }
      title={draft.name || "Untitled pattern"}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          {validationError && (
            <span className="inline-flex items-center gap-1.5" style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
              <AlertCircle size={12} /> {validationError}
            </span>
          )}
          <div className="flex-1" />
          <GhostBtn onClick={handleClose} small>{dirty ? "Discard" : "Close"}</GhostBtn>
          <button
            onClick={save}
            disabled={!dirty || !!validationError}
            className="inline-flex items-center gap-2"
            style={{
              backgroundColor: (dirty && !validationError) ? p.accent : "transparent",
              color: (dirty && !validationError) ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textDim,
              border: `1px solid ${(dirty && !validationError) ? p.accent : p.border}`,
              padding: "0.45rem 0.95rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
              cursor: (dirty && !validationError) ? "pointer" : "not-allowed",
            }}
          >
            {isActive ? <Zap size={11} /> : <Save size={11} />}
            {mode === "create" ? "Create pattern" : isActive ? "Save & apply live" : "Save changes"}
          </button>
        </>
      }
    >
      <Card title="Identity">
        <div className="grid md:grid-cols-2 gap-4">
          <FormGroup label="Pattern name">
            <TextField value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. Eid promotion" />
          </FormGroup>
          <FormGroup label="Description (internal)">
            <TextField value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} placeholder="When to apply this pattern" />
          </FormGroup>
        </div>
      </Card>

      <div className="mt-6">
        <TaxComponentsEditor components={components} onChange={setComponents} />
      </div>

      <Card title="Display setting" className="mt-6">
        <label className="flex items-start gap-3 cursor-pointer" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
          <input
            type="checkbox"
            checked={draft.config?.taxInclusiveDisplay || false}
            onChange={(e) => setDisplay(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <div>
            <div style={{ color: p.textPrimary, fontWeight: 600 }}>Display tax-inclusive (gross) rates on the public site</div>
            <div style={{ color: p.textMuted, fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
              When on, room cards and rate searches show the gross price. When off, they show the net rate with "excl. taxes" labelling. Either way, the same gross applies at checkout.
            </div>
          </div>
        </label>
      </Card>

      <Card title="Live preview · Lodge Studio (BHD 38 net)" className="mt-6">
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
          <Row label="Net rate" value={`${t("common.bhd")} 38`} />
          {preview.lines.map((line) => {
            const note = line.type === "percentage" ? `${line.rate}%${line.calculation === "compound" ? " · compound" : ""}` : `${t("common.bhd")} ${line.amount}`;
            return (
              <Row key={line.id} label={<>+ {line.name} <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>· {note}</span></>} value={formatCurrency(line.taxAmount)} />
            );
          })}
          <div className="pt-3 mt-3 flex justify-between items-baseline" style={{ borderTop: `2px solid ${p.border}` }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.textPrimary }}>Gross at checkout</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 600 }}>{formatCurrency(preview.gross)}</span>
          </div>
          <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 8 }}>
            Combined {totalPct}% on percentage components.
          </div>
        </div>
      </Card>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Room rate preview — uses applyTaxes so the matrix reflects whatever
// component configuration is currently set (compound, applies-to scope, etc).
// ---------------------------------------------------------------------------
function RoomPreview() {
  const t = useT();
  const p = usePalette();
  const { rooms, tax } = useData();

  const grossOf = (rate, nights = 1) => applyTaxes(rate, tax, nights).gross;

  return (
    <Card title="Rate preview · all suites" className="mt-6" padded={false}
      action={
        <button
          onClick={() => pushToast({ message: "Tax components saved · live for next booking" })}
          style={{
            color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}
        >
          <Save size={11} className="inline mr-1.5" /> Apply to live rates
        </button>
      }
    >
      <TableShell>
        <thead>
          <tr>
            <Th>Suite</Th>
            <Th align="end">Net rate</Th>
            <Th align="end">+ Tax</Th>
            <Th align="end">Gross / night</Th>
            <Th align="end">3-night gross</Th>
            <Th align="end">7-night gross</Th>
            <Th align="end">Δ vs net</Th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => {
            const oneNight = grossOf(r.price, 1);
            const taxComponent = oneNight - r.price;
            const deltaPct = r.price > 0 ? Math.round((taxComponent / r.price) * 100) : 0;
            return (
              <tr key={r.id}>
                <Td>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary }}>{t(`rooms.${r.id}.name`)}</div>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{r.sqm} m² · sleeps {r.occupancy}</div>
                </Td>
                <Td align="end">{t("common.bhd")} {r.price}</Td>
                <Td align="end" muted>+ {formatCurrency(taxComponent)}</Td>
                <Td align="end" className="font-semibold" style={{ color: p.accent, fontWeight: 700 }}>{t("common.bhd")} {Math.round(oneNight)}</Td>
                <Td align="end">{t("common.bhd")} {Math.round(grossOf(r.price, 3))}</Td>
                <Td align="end">{t("common.bhd")} {Math.round(grossOf(r.price, 7))}</Td>
                <Td align="end" style={{ color: p.warn, fontWeight: 600 }}>+{deltaPct}%</Td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tax patterns library — list view with Apply / Edit / Delete per row,
// plus "+ New pattern" and "Save current as pattern" actions in the header.
// All component editing happens inside the PatternEditor drawer.
// ---------------------------------------------------------------------------
function TaxPatternsCard() {
  const t = useT();
  const p = usePalette();
  const { tax, taxPatterns, activePatternId, applyTaxPattern, saveTaxPattern, removeTaxPattern, setTaxPatterns, setTax } = useData();
  const [editor, setEditor] = useState(null); // { mode: 'create' | 'edit', initial }

  const apply = (id) => {
    applyTaxPattern(id);
    const pat = taxPatterns.find(x => x.id === id);
    pushToast({ message: `Applied · ${pat?.name}` });
  };

  const remove = (id) => {
    const pat = taxPatterns.find(x => x.id === id);
    if (!pat) return;
    const msg = pat.builtIn
      ? `Remove built-in pattern "${pat.name}"? It will only return after a page refresh.`
      : `Remove pattern "${pat.name}"?`;
    if (!confirm(msg)) return;
    removeTaxPattern(id);
    pushToast({ message: `Removed · ${pat.name}`, kind: "warn" });
  };

  // Save / create handlers from the editor.
  const handleSave = (draft) => {
    const componentCount = draft.config?.components?.length || 0;
    const compHint = `${componentCount} component${componentCount === 1 ? "" : "s"}`;
    if (editor.mode === "create") {
      const id = saveTaxPattern({ name: draft.name, description: draft.description });
      // saveTaxPattern snapshots the current `tax` config — overwrite with the
      // draft's components so the new pattern reflects the editor's state.
      setTaxPatterns((ps) => ps.map(p => p.id === id ? { ...p, config: draft.config } : p));
      // Apply the new pattern so the operator can see its effect.
      setTax({ ...draft.config });
      pushToast({ message: `Created · ${draft.name} · ${compHint} · applied to live rates` });
    } else {
      // Edit existing — update components/display, keep id/name/description if changed.
      setTaxPatterns((ps) => ps.map(p => p.id === draft.id ? {
        ...p, name: draft.name, description: draft.description, config: draft.config,
      } : p));
      // If the edited pattern is currently active, sync the live tax config.
      const isActive = draft.id === activePatternId;
      if (isActive) setTax({ ...draft.config });
      pushToast({
        message: isActive
          ? `Saved · ${draft.name} · ${compHint} · live rates updated`
          : `Saved · ${draft.name} · ${compHint} · click Apply to use it on live rates`,
      });
    }
    setEditor(null);
  };

  const newPattern = () => setEditor({
    mode: "create",
    initial: {
      name: "",
      description: "",
      config: { taxInclusiveDisplay: tax.taxInclusiveDisplay, components: tax.components ? [...tax.components] : [] },
      builtIn: false,
    },
  });

  const editPattern = (pat) => setEditor({
    mode: "edit",
    initial: {
      id: pat.id,
      name: pat.name,
      description: pat.description,
      config: { ...pat.config, components: [...(pat.config?.components || [])] },
      builtIn: pat.builtIn,
    },
  });

  // Detect drift from the active pattern (local edits not yet saved).
  const activePattern = taxPatterns.find(x => x.id === activePatternId);
  const drifted = activePattern && (
    JSON.stringify(activePattern.config?.components ?? []) !== JSON.stringify(tax.components ?? [])
    || activePattern.config?.taxInclusiveDisplay !== tax.taxInclusiveDisplay
  );

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span>Tax patterns</span>
          <span style={{
            fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            padding: "2px 7px", color: p.textMuted, border: `1px solid ${p.border}`,
            borderRadius: 999, fontVariantNumeric: "tabular-nums",
          }}>{taxPatterns.length}</span>
        </div>
      }
      className="mb-6"
      padded={false}
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={newPattern}
            className="flex items-center gap-1.5"
            style={{
              padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`,
              backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            }}
          >
            <Plus size={11} /> New pattern
          </button>
          {drifted && (
            <button
              onClick={() => {
                const name = prompt("Save current configuration as a new pattern · name?");
                if (!name?.trim()) return;
                saveTaxPattern({ name, description: "Captured from live configuration." });
                pushToast({ message: `Saved · ${name}` });
              }}
              className="flex items-center gap-1.5"
              style={{
                padding: "0.4rem 0.85rem", border: `1px solid ${p.warn}`,
                color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <BookmarkPlus size={11} /> Save edits as pattern
            </button>
          )}
        </div>
      }
    >
      <p className="px-5 pt-4" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.55 }}>
        Pick a pattern to apply, edit one to tweak its components, or create a new pattern from scratch. Any pattern can be removed; built-in patterns return on the next page refresh.
      </p>

      <TableShell className="mt-3">
        <thead>
          <tr>
            <Th>Pattern</Th>
            <Th>Components</Th>
            <Th align="end">Combined</Th>
            <Th align="end">Fixed</Th>
            <Th>Display</Th>
            <Th>Status</Th>
            <Th align="end">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {taxPatterns.map((pat) => {
            const isActive = pat.id === activePatternId;
            const cfg = pat.config || {};
            const comps = cfg.components || [];
            const totalPct = comps.filter(c => c.type === "percentage").reduce((s, c) => s + c.rate, 0);
            const totalFx = comps.filter(c => c.type === "fixed").reduce((s, c) => s + c.amount, 0);
            return (
              <tr
                key={pat.id}
                style={{
                  borderTop: `1px solid ${p.border}`,
                  backgroundColor: isActive ? p.bgPanelAlt : "transparent",
                  borderInlineStart: isActive ? `3px solid ${p.accent}` : "3px solid transparent",
                }}
              >
                <Td>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary, fontWeight: 600 }}>
                      {pat.name}
                    </span>
                    {pat.builtIn && (
                      <span style={{
                        fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                        padding: "1px 6px", color: p.textMuted, border: `1px solid ${p.border}`,
                      }}>Built-in</span>
                    )}
                  </div>
                  <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.45, marginTop: 4, maxWidth: 380 }}>
                    {pat.description}
                  </div>
                </Td>
                <Td>
                  {comps.length === 0 ? (
                    <span style={{ color: p.textMuted, fontStyle: "italic", fontSize: "0.78rem" }}>No components</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {comps.map((c) => (
                        <span key={c.id} title={`${c.name} · ${APPLIES_TO_LABEL[c.appliesTo] || c.appliesTo} · ${c.calculation}`} style={{
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                          padding: "2px 7px",
                          color: c.type === "percentage" ? p.accent : p.success,
                          border: `1px solid ${c.type === "percentage" ? p.accent : p.success}`,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}>
                          {c.name} · {c.type === "percentage" ? `${c.rate}%` : `${t("common.bhd")} ${c.amount}`}
                        </span>
                      ))}
                    </div>
                  )}
                </Td>
                <Td align="end" className="font-semibold" style={{ color: p.accent, fontWeight: 700 }}>{totalPct}%</Td>
                <Td align="end">{totalFx > 0 ? `${t("common.bhd")} ${totalFx}` : "—"}</Td>
                <Td>
                  <span style={{
                    fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    padding: "2px 8px",
                    color: cfg.taxInclusiveDisplay ? p.warn : p.textMuted,
                    border: `1px solid ${cfg.taxInclusiveDisplay ? p.warn : p.border}`,
                  }}>
                    {cfg.taxInclusiveDisplay ? "Inclusive" : "Exclusive"}
                  </span>
                </Td>
                <Td>
                  {isActive && !drifted ? (
                    <span className="inline-flex items-center gap-1.5" style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px", color: p.success, border: `1px solid ${p.success}`,
                    }}>
                      <Check size={10} /> Active
                    </span>
                  ) : isActive && drifted ? (
                    <span style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px", color: p.warn, border: `1px solid ${p.warn}`,
                    }}>Edited</span>
                  ) : (
                    <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
                      Idle
                    </span>
                  )}
                </Td>
                <Td align="end">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => apply(pat.id)}
                      disabled={isActive && !drifted}
                      title="Apply this pattern"
                      style={{
                        padding: "0.35rem 0.7rem",
                        border: `1px solid ${isActive && !drifted ? p.border : p.accent}`,
                        color: isActive && !drifted ? p.textMuted : p.accent,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        cursor: isActive && !drifted ? "default" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => { if (!(isActive && !drifted)) e.currentTarget.style.backgroundColor = p.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      {isActive && drifted ? "Reset" : "Apply"}
                    </button>
                    <button
                      onClick={() => editPattern(pat)}
                      title="Edit this pattern"
                      style={{
                        color: p.textMuted, padding: "0.35rem 0.6rem", border: `1px solid ${p.border}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => remove(pat.id)}
                      title={pat.builtIn ? "Remove built-in pattern (returns on refresh)" : "Remove custom pattern"}
                      style={{
                        color: p.danger, padding: "0.35rem 0.6rem", border: `1px solid ${p.border}`,
                      }}
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
          {taxPatterns.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                No patterns saved.
                <button onClick={newPattern} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Create the first pattern →</button>
              </td>
            </tr>
          )}
        </tbody>
      </TableShell>

      {editor && (
        <PatternEditor
          mode={editor.mode}
          initial={editor.initial}
          isActive={editor.mode === "edit" && editor.initial?.id === activePatternId}
          onClose={() => setEditor(null)}
          onSave={handleSave}
        />
      )}
    </Card>
  );
}
