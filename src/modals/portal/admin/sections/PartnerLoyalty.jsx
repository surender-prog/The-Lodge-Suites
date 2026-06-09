import React, { useEffect, useMemo, useState } from "react";
import { Award, Crown, Gem, Sparkles, Star, Heart, ArrowUp, ArrowDown, Plus, Trash2, Check, Save, RotateCcw } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData, makeTierCrud } from "../../../../data/store.jsx";
import { Card, GhostBtn, PageHeader, PrimaryBtn, SelectField, TextField, pushToast } from "../ui.jsx";

const TIER_ICONS = { Award, Crown, Gem, Sparkles, Star, Heart };
const ICON_OPTIONS = [
  { value: "Award", label: "Award" }, { value: "Crown", label: "Crown" }, { value: "Gem", label: "Gem" },
  { value: "Sparkles", label: "Sparkles" }, { value: "Star", label: "Star" }, { value: "Heart", label: "Heart" },
];
const COLOR_OPTIONS = [
  { value: "#A8A8A8", label: "Silver" }, { value: "#C9A961", label: "Gold" }, { value: "#D4B97A", label: "Champagne" },
  { value: "#B5564B", label: "Ruby" }, { value: "#5C8A4E", label: "Emerald" }, { value: "#1B3A5C", label: "Sapphire" },
  { value: "#5C2A2F", label: "Burgundy" }, { value: "#2D2F36", label: "Onyx" },
];

// One editable tier card. Drives the shared tier-CRUD action set passed in
// `actions` (operating on the local DRAFT, committed on Save).
function TierCard({ tier, idx, total, actions, qualifyUnit, p }) {
  const Icon = TIER_ICONS[tier.icon] || Award;
  const lbl = { fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, marginBottom: 4 };
  return (
    <Card padded>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Icon size={22} style={{ color: tier.color || p.accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField value={tier.name} onChange={(v) => actions.updateTier(idx, { name: v })} placeholder="Tier name" />
        </div>
        {tier.featured && (
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: p.accent, border: `1px solid ${p.accent}`, padding: "3px 7px" }}>Featured</span>
        )}
        {tier.builtIn && (
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase", color: p.textMuted, border: `1px solid ${p.border}`, padding: "3px 7px" }}>Built-in</span>
        )}
        <button type="button" title="Move up" disabled={idx === 0} onClick={() => actions.moveTier(idx, "up")} style={{ color: idx === 0 ? p.border : p.textMuted, padding: 4, cursor: idx === 0 ? "default" : "pointer" }}><ArrowUp size={15} /></button>
        <button type="button" title="Move down" disabled={idx === total - 1} onClick={() => actions.moveTier(idx, "down")} style={{ color: idx === total - 1 ? p.border : p.textMuted, padding: 4, cursor: idx === total - 1 ? "default" : "pointer" }}><ArrowDown size={15} /></button>
        {!tier.builtIn && (
          <button type="button" title="Delete tier" onClick={() => actions.removeTier(tier.id)} style={{ color: p.danger, padding: 4, cursor: "pointer" }}><Trash2 size={15} /></button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={lbl}>Qualify from</div>
          <TextField type="number" value={tier.qualifyMin ?? 0} onChange={(v) => actions.updateTier(idx, { qualifyMin: Math.max(0, Number(v) || 0) })} suffix={qualifyUnit} />
        </div>
        <div>
          <div style={lbl}>Earn rate</div>
          <TextField type="number" value={tier.earnRate ?? 1} onChange={(v) => actions.updateTier(idx, { earnRate: Math.max(0, Number(v) || 0) })} suffix="× pts/BHD" />
        </div>
        <div>
          <div style={lbl}>Icon</div>
          <SelectField value={tier.icon || "Award"} onChange={(v) => actions.updateTier(idx, { icon: v })} options={ICON_OPTIONS} />
        </div>
        <div>
          <div style={lbl}>Colour</div>
          <SelectField value={tier.color || "#C9A961"} onChange={(v) => actions.updateTier(idx, { color: v })} options={COLOR_OPTIONS} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={lbl}>Intro / tagline</div>
        <TextField value={tier.intro || ""} onChange={(v) => actions.updateTier(idx, { intro: v })} placeholder="Short description shown to the partner" />
      </div>

      <div style={lbl}>Benefits</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {(tier.benefits || []).map((b) => (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button" onClick={() => actions.toggleBenefit(idx, b.id)} title={b.on ? "Active — click to disable" : "Disabled — click to enable"}
              style={{ width: 22, height: 22, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${b.on ? p.accent : p.border}`, backgroundColor: b.on ? p.accent : "transparent", color: b.on ? p.bgPage : "transparent", cursor: "pointer" }}
            >
              <Check size={13} />
            </button>
            <div style={{ flex: 1, minWidth: 0, opacity: b.on ? 1 : 0.55 }}>
              <TextField value={b.label} onChange={(v) => actions.updateBenefit(idx, b.id, { label: v })} />
            </div>
            <button type="button" title="Remove benefit" onClick={() => actions.removeBenefit(idx, b.id)} style={{ color: p.textMuted, padding: 4, cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <GhostBtn small onClick={() => actions.addBenefit(idx)}><Plus size={13} /> Add benefit</GhostBtn>
      </div>
    </Card>
  );
}

// Admin editor for the two B2B loyalty ladders (corporate + agency) and the
// shared points economy. Edits are buffered in a local DRAFT and only written
// to the store (and persisted) on Save — mirroring the member-economy editor.
export const PartnerLoyalty = () => {
  const p = usePalette();
  const {
    corporateTiers, agencyTiers, partnerLoyalty,
    setCorporateTiers, setAgencyTiers, setPartnerLoyalty,
  } = useData();

  const [kind, setKind] = useState("corporate");

  // Local draft of everything editable on this tab. `touched` distinguishes a
  // user edit from an inbound store change (hydration / realtime) so the sync
  // effect below can refresh the draft only while there are no pending edits.
  const [draftCorp, setDraftCorp] = useState(corporateTiers);
  const [draftAgency, setDraftAgency] = useState(agencyTiers);
  const [draftEcon, setDraftEcon] = useState(partnerLoyalty);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) {
      setDraftCorp(corporateTiers);
      setDraftAgency(agencyTiers);
      setDraftEcon(partnerLoyalty);
    }
  }, [corporateTiers, agencyTiers, partnerLoyalty, touched]);

  // Touch-marking draft setters so any tier/benefit edit flips `touched`.
  const editCorp = useMemo(() => (u) => { setTouched(true); setDraftCorp(u); }, []);
  const editAgency = useMemo(() => (u) => { setTouched(true); setDraftAgency(u); }, []);
  const corpActions = useMemo(() => makeTierCrud(editCorp), [editCorp]);
  const agencyActions = useMemo(() => makeTierCrud(editAgency), [editAgency]);
  const editEcon = (patch) => { setTouched(true); setDraftEcon((l) => ({ ...l, ...patch })); };

  const tiers = kind === "corporate" ? draftCorp : draftAgency;
  const actions = kind === "corporate" ? corpActions : agencyActions;
  const qualifyUnit = draftEcon?.qualifyBy === "revenue" ? "BHD" : "nights";

  // Gift-card brand catalogue — edited in the same draft, committed on Save.
  const brands = draftEcon.giftCard?.brands || [];
  const patchGiftCard = (patch) => editEcon({ giftCard: { denominations: [20, 50, 100], ...(draftEcon.giftCard || {}), ...patch } });
  const addBrand = () => patchGiftCard({ brands: [...brands, { id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`, name: "New brand", active: true }] });
  const updateBrand = (id, patch) => patchGiftCard({ brands: brands.map((b) => b.id === id ? { ...b, ...patch } : b) });
  const removeBrand = (id) => patchGiftCard({ brands: brands.filter((b) => b.id !== id) });

  const save = () => {
    setCorporateTiers(draftCorp);
    setAgencyTiers(draftAgency);
    setPartnerLoyalty(draftEcon);
    setTouched(false);
    pushToast({ message: "Partner loyalty saved" });
  };
  const discard = () => {
    setDraftCorp(corporateTiers);
    setDraftAgency(agencyTiers);
    setDraftEcon(partnerLoyalty);
    setTouched(false);
  };

  const pill = (active) => ({
    padding: "8px 18px", cursor: "pointer", fontFamily: "'Manrope', sans-serif",
    fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700,
    border: `1px solid ${active ? p.accent : p.border}`,
    backgroundColor: active ? p.accent : "transparent",
    color: active ? p.bgPage : p.textMuted,
  });
  const lbl = { fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, marginBottom: 4 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
      <PageHeader
        title="Partner Loyalty"
        intro="Points + tiers for corporate accounts and travel agencies. Tiers are awarded automatically by lifetime volume; enable the programme per account from each account's workspace. Edit the ladders + economy here, then Save."
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {touched
              ? <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.accent, fontWeight: 600 }}>● Unsaved changes</span>
              : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.success, fontWeight: 600 }}><Check size={13} /> Saved</span>}
          </div>
        }
      />

      {/* Ladder switch */}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={pill(kind === "corporate")} onClick={() => setKind("corporate")}>Corporate</button>
        <button type="button" style={pill(kind === "agent")} onClick={() => setKind("agent")}>Agencies</button>
      </div>

      {/* Tier ladder */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tiers.map((tier, idx) => (
          <TierCard key={tier.id} tier={tier} idx={idx} total={tiers.length} actions={actions} qualifyUnit={qualifyUnit} p={p} />
        ))}
        <div>
          <PrimaryBtn small onClick={() => actions.addTier({ name: "New tier", qualifyMin: 0, earnRate: 1, icon: "Star", color: "#5C8A4E", intro: "", benefits: [] })}>
            <Plus size={14} /> Add {kind === "corporate" ? "corporate" : "agency"} tier
          </PrimaryBtn>
        </div>
      </div>

      {/* Points economy (shared) */}
      <Card title="Points economy" padded>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <div>
            <div style={lbl}>Redemption rate</div>
            <TextField type="number" value={draftEcon.redeemBhdPerPoints} onChange={(v) => editEcon({ redeemBhdPerPoints: Math.max(1, Number(v) || 1) })} suffix="pts = BHD 1" />
          </div>
          <div>
            <div style={lbl}>Qualify tiers by</div>
            <SelectField
              value={draftEcon.qualifyBy || "nights"}
              onChange={(v) => editEcon({ qualifyBy: v })}
              options={[{ value: "nights", label: "Lifetime room-nights" }, { value: "revenue", label: "Lifetime revenue (BHD)" }]}
            />
          </div>
          <div>
            <div style={lbl}>Gift-card denominations</div>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              {(draftEcon.giftCard?.denominations || [20, 50, 100]).map((d) => (
                <span key={d} style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", fontWeight: 600, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "8px 12px" }}>BHD {d}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontFamily: "'Manrope', sans-serif", fontSize: "0.76rem", color: p.textMuted, lineHeight: 1.5 }}>
          Points convert to BHD credit on a future booking, or a fixed-value third-party gift card in the denominations above — redeemed by staff from each account's Loyalty tab.
        </div>
      </Card>

      {/* Gift-card brands (draft — committed on Save) */}
      <Card title="Gift-card brands" padded>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
          Retail brands a partner can request a fixed-value gift card from. These show when staff issue a card from an account's Loyalty tab, and to partners in their portal.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {brands.length === 0 && (
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textMuted }}>No brands yet — add Lulu, Sharaf DG, City Centre, Centrepoint…</div>
          )}
          {brands.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button" onClick={() => updateBrand(b.id, { active: !b.active })} title={b.active ? "Active — click to disable" : "Disabled — click to enable"}
                style={{ width: 22, height: 22, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${b.active ? p.accent : p.border}`, backgroundColor: b.active ? p.accent : "transparent", color: b.active ? p.bgPage : "transparent", cursor: "pointer" }}
              >
                <Check size={13} />
              </button>
              <div style={{ flex: 1, minWidth: 0, opacity: b.active ? 1 : 0.55 }}>
                <TextField value={b.name} onChange={(v) => updateBrand(b.id, { name: v })} placeholder="Brand name" />
              </div>
              <button type="button" title="Remove brand" onClick={() => removeBrand(b.id)} style={{ color: p.textMuted, padding: 4, cursor: "pointer" }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <GhostBtn small onClick={addBrand}><Plus size={13} /> Add brand</GhostBtn>
        </div>
      </Card>

      {/* Sticky Save bar — only when there are unsaved edits */}
      {touched && (
        <div style={{
          position: "sticky", bottom: 0, marginTop: 4, zIndex: 5,
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10,
          padding: "12px 14px", backgroundColor: p.bgPanel, border: `1px solid ${p.accent}`,
          boxShadow: "0 -6px 18px rgba(0,0,0,0.12)",
        }}>
          <span style={{ flex: 1, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textMuted }}>
            You have unsaved changes to the partner-loyalty tiers / economy.
          </span>
          <GhostBtn small onClick={discard}><RotateCcw size={13} /> Discard</GhostBtn>
          <PrimaryBtn small onClick={save}><Save size={14} /> Save changes</PrimaryBtn>
        </div>
      )}
    </div>
  );
};
