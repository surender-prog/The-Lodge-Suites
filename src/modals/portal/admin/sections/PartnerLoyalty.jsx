import React, { useState } from "react";
import { Award, Crown, Gem, Sparkles, Star, Heart, ArrowUp, ArrowDown, Plus, Trash2, Check } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData } from "../../../../data/store.jsx";
import { Card, GhostBtn, PageHeader, PrimaryBtn, SelectField, TextField } from "../ui.jsx";

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

// One editable tier card (name, qualify threshold, earn rate, icon/colour,
// intro, benefit list with on/off toggles). Drives the shared tier-CRUD action
// set passed in `actions` (same shape as the member tier editor).
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
// shared points economy. Mirrors the member LS Privilege editor but is fully
// self-contained so it can never affect the member program.
export const PartnerLoyalty = () => {
  const p = usePalette();
  const {
    corporateTiers, agencyTiers, corporateTierActions, agencyTierActions,
    partnerLoyalty, setPartnerLoyalty,
  } = useData();

  const [kind, setKind] = useState("corporate");
  const tiers = kind === "corporate" ? corporateTiers : agencyTiers;
  const actions = kind === "corporate" ? corporateTierActions : agencyTierActions;
  const qualifyUnit = partnerLoyalty?.qualifyBy === "revenue" ? "BHD" : "nights";

  const pill = (active) => ({
    padding: "8px 18px", cursor: "pointer", fontFamily: "'Manrope', sans-serif",
    fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700,
    border: `1px solid ${active ? p.accent : p.border}`,
    backgroundColor: active ? p.accent : "transparent",
    color: active ? p.bgPage : p.textMuted,
  });
  const lbl = { fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700, marginBottom: 4 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title="Partner Loyalty"
        intro="Points + tiers for corporate accounts and travel agencies. Tiers are awarded automatically by lifetime volume; enable the programme per account from each account's workspace. Edits here apply the next time points accrue."
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
            <TextField type="number" value={partnerLoyalty.redeemBhdPerPoints} onChange={(v) => setPartnerLoyalty((l) => ({ ...l, redeemBhdPerPoints: Math.max(1, Number(v) || 1) }))} suffix="pts = BHD 1" />
          </div>
          <div>
            <div style={lbl}>Qualify tiers by</div>
            <SelectField
              value={partnerLoyalty.qualifyBy || "nights"}
              onChange={(v) => setPartnerLoyalty((l) => ({ ...l, qualifyBy: v }))}
              options={[{ value: "nights", label: "Lifetime room-nights" }, { value: "revenue", label: "Lifetime revenue (BHD)" }]}
            />
          </div>
          <div>
            <div style={lbl}>Gift-card denominations</div>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              {(partnerLoyalty.giftCard?.denominations || [20, 50, 100]).map((d) => (
                <span key={d} style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", fontWeight: 600, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "8px 12px" }}>BHD {d}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontFamily: "'Manrope', sans-serif", fontSize: "0.76rem", color: p.textMuted, lineHeight: 1.5 }}>
          Points convert to BHD credit on a future booking, or (coming next) a fixed-value third-party gift card in the denominations above. Gift-card brands (e.g. Lulu, Sharaf DG, City Centre, Centrepoint) and the redemption flow arrive in the next phase.
        </div>
      </Card>
    </div>
  );
};
