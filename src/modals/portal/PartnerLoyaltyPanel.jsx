import React, { useState } from "react";
import { Award, Crown, Gem, Sparkles, Star, Heart, Check } from "lucide-react";
import { usePalette } from "./theme.jsx";
import { useData, formatCurrency } from "../../data/store.jsx";
import { pushToast } from "./admin/ui.jsx";

// Tier icons map to the same lucide set the tier editor offers.
const TIER_ICONS = { Award, Crown, Gem, Sparkles, Star, Heart };

const fmtTs = (ts) => {
  try { return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return ""; }
};

// Per-account B2B loyalty panel — the admin activation gate plus the
// points / tier / lifetime display once enabled. Reused by both the
// Corporate and Agency workspaces (kind = "corporate" | "agent").
export function PartnerLoyaltyPanel({ kind, accountId }) {
  const p = usePalette();
  const {
    agreements, agencies, corporateTiers, agencyTiers, partnerLoyalty,
    toggleAccountLoyalty, adjustPartnerPoints, redeemPartnerPoints, issuePartnerGiftCard,
  } = useData();

  const list = kind === "corporate" ? agreements : agencies;
  const account = list.find((a) => a.id === accountId);
  const tiers = kind === "corporate" ? corporateTiers : agencyTiers;

  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [redeemPts, setRedeemPts] = useState("");
  const [giftBrand, setGiftBrand] = useState("");
  const [giftDenom, setGiftDenom] = useState(50);
  const [giftCode, setGiftCode] = useState("");

  if (!account) return null;

  const enabled = !!account.loyaltyEnabled;
  const points = Number(account.points || 0);
  const tier = tiers.find((t) => t.id === account.tier) || null;
  const TierIcon = TIER_ICONS[tier?.icon] || Award;
  const perBhd = Number(partnerLoyalty?.redeemBhdPerPoints) || 100;
  const redeemable = Math.floor(points / perBhd);
  const history = (account.pointsHistory || []).slice().reverse().slice(0, 5);
  const fmtBhd = (n) => formatCurrency(Number(n || 0));

  const submitAdjust = () => {
    const d = Math.round(Number(delta) || 0);
    if (!d) return;
    adjustPartnerPoints(kind, accountId, d, note.trim());
    setDelta(""); setNote("");
  };

  // Redemption (staff-executed — partners request, staff fulfils here) --------
  const activeBrands = (partnerLoyalty?.giftCard?.brands || []).filter((b) => b.active);
  const denoms = partnerLoyalty?.giftCard?.denominations || [20, 50, 100];
  const giftCost = Number(giftDenom || 0) * perBhd;
  const doRedeemCredit = () => {
    const pts = Math.round(Number(redeemPts) || 0);
    if (!pts) return;
    const ok = redeemPartnerPoints(kind, accountId, pts, "BHD credit");
    if (ok) { setRedeemPts(""); pushToast({ message: `Redeemed ${pts.toLocaleString()} pts → ${fmtBhd(Math.floor(pts / perBhd))} credit` }); }
    else pushToast({ message: "Not enough points for that redemption" });
  };
  const doIssueGift = () => {
    if (!giftBrand || !giftDenom) return;
    const ok = issuePartnerGiftCard(kind, accountId, giftBrand, Number(giftDenom), giftCode.trim());
    if (ok) { setGiftCode(""); pushToast({ message: `Issued BHD ${giftDenom} gift card` }); }
    else pushToast({ message: "Not enough points for that gift card" });
  };

  const card = { backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, borderRadius: 0, padding: 16 };
  const tile = { backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, padding: "12px 14px" };
  const labelStyle = { fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: p.textMuted, fontWeight: 700 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Activation header */}
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.35rem", color: p.textPrimary }}>
            Partner loyalty
          </div>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: p.textMuted, marginTop: 2, maxWidth: 520, lineHeight: 1.5 }}>
            {enabled
              ? "Active — this account earns points on stayed bookings and is placed on a tier automatically by lifetime volume."
              : "Optional programme, off by default. Enable it to start accruing points and tier status for this account."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleAccountLoyalty(kind, accountId)}
          style={{
            flexShrink: 0,
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 16px", cursor: "pointer",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.16em",
            textTransform: "uppercase", fontWeight: 700,
            border: `1px solid ${enabled ? p.success : p.accent}`,
            backgroundColor: enabled ? p.success : "transparent",
            color: enabled ? "#fff" : p.accent,
          }}
        >
          {enabled ? <><Check size={13} /> Enabled</> : "Enable"}
        </button>
      </div>

      {enabled && (
        <>
          {/* KPI tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <div style={tile}>
              <div style={labelStyle}>Points balance</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.6rem", color: p.textPrimary, marginTop: 2 }}>{points.toLocaleString()}</div>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted }}>≈ {fmtBhd(redeemable)} redeemable</div>
            </div>
            <div style={tile}>
              <div style={labelStyle}>Tier</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
                <TierIcon size={18} style={{ color: tier?.color || p.accent }} />
                <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", color: p.textPrimary }}>{tier ? tier.name : "—"}</span>
              </div>
              {tier && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted }}>{tier.earnRate}× pts / BHD</div>}
            </div>
            <div style={tile}>
              <div style={labelStyle}>Lifetime nights</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.6rem", color: p.textPrimary, marginTop: 2 }}>{Number(account.lifetimeNights || 0).toLocaleString()}</div>
            </div>
            <div style={tile}>
              <div style={labelStyle}>Lifetime revenue</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.6rem", color: p.textPrimary, marginTop: 2 }}>{fmtBhd(account.lifetimeRevenue)}</div>
            </div>
          </div>

          {/* Current tier benefits */}
          {tier?.benefits?.some((b) => b.on) && (
            <div style={card}>
              <div style={labelStyle}>{tier.name} benefits</div>
              <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {tier.benefits.filter((b) => b.on).map((b) => (
                  <li key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textPrimary }}>
                    <Check size={13} style={{ color: p.accent, flexShrink: 0 }} /> {b.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manual adjust */}
          <div style={{ ...card, display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={labelStyle}>Adjust points</div>
              <input
                type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+ / − points"
                style={{ marginTop: 4, width: 130, padding: "8px 10px", backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={labelStyle}>Note (optional)</div>
              <input
                value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. goodwill credit"
                style={{ marginTop: 4, width: "100%", padding: "8px 10px", backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
              />
            </div>
            <button
              type="button" onClick={submitAdjust} disabled={!Math.round(Number(delta) || 0)}
              style={{
                padding: "9px 16px", cursor: Math.round(Number(delta) || 0) ? "pointer" : "not-allowed",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700,
                border: `1px solid ${p.accent}`, backgroundColor: p.accent, color: p.bgPage,
                opacity: Math.round(Number(delta) || 0) ? 1 : 0.5,
              }}
            >
              Apply
            </button>
          </div>

          {/* Redeem points — staff-executed (partners request via their portal) */}
          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Redeem points</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* BHD credit */}
              <div style={{ border: `1px solid ${p.border}`, padding: 12 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: "0.84rem", color: p.textPrimary, marginBottom: 6 }}>BHD credit</div>
                <input
                  type="number" value={redeemPts} onChange={(e) => setRedeemPts(e.target.value)} placeholder="Points to redeem"
                  style={{ width: "100%", padding: "8px 10px", backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                />
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted, margin: "5px 0 8px" }}>
                  ≈ {fmtBhd(Math.floor((Number(redeemPts) || 0) / perBhd))} · applied to a future folio
                </div>
                <button
                  type="button" onClick={doRedeemCredit}
                  disabled={!Math.round(Number(redeemPts) || 0) || Math.round(Number(redeemPts) || 0) > points}
                  style={{ width: "100%", padding: "9px 12px", cursor: "pointer", fontFamily: "'Manrope', sans-serif", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, border: `1px solid ${p.accent}`, backgroundColor: p.accent, color: p.bgPage, opacity: (!Math.round(Number(redeemPts) || 0) || Math.round(Number(redeemPts) || 0) > points) ? 0.5 : 1 }}
                >
                  Redeem credit
                </button>
              </div>
              {/* Third-party gift card */}
              <div style={{ border: `1px solid ${p.border}`, padding: 12 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: "0.84rem", color: p.textPrimary, marginBottom: 6 }}>Gift card</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={giftBrand} onChange={(e) => setGiftBrand(e.target.value)} style={{ flex: 1, minWidth: 0, padding: "8px 8px", backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}>
                    <option value="">Brand…</option>
                    {activeBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select value={giftDenom} onChange={(e) => setGiftDenom(Number(e.target.value))} style={{ width: 96, padding: "8px 8px", backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem" }}>
                    {denoms.map((d) => <option key={d} value={d}>BHD {d}</option>)}
                  </select>
                </div>
                <input
                  value={giftCode} onChange={(e) => setGiftCode(e.target.value)} placeholder="Card code (optional)"
                  style={{ width: "100%", marginTop: 6, padding: "8px 10px", backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                />
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted, margin: "5px 0 8px" }}>
                  Cost: {giftCost.toLocaleString()} pts{activeBrands.length === 0 ? " · add brands in Partner Loyalty" : ""}
                </div>
                <button
                  type="button" onClick={doIssueGift}
                  disabled={!giftBrand || giftCost > points}
                  style={{ width: "100%", padding: "9px 12px", cursor: "pointer", fontFamily: "'Manrope', sans-serif", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, border: `1px solid ${p.accent}`, backgroundColor: p.accent, color: p.bgPage, opacity: (!giftBrand || giftCost > points) ? 0.5 : 1 }}
                >
                  Issue gift card
                </button>
              </div>
            </div>
          </div>

          {/* Recent ledger */}
          {history.length > 0 && (
            <div style={card}>
              <div style={labelStyle}>Recent activity</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontFamily: "'Manrope', sans-serif", fontSize: "0.8rem", borderBottom: i < history.length - 1 ? `1px solid ${p.border}` : "none", paddingBottom: 6 }}>
                    <span style={{ color: p.textMuted }}>
                      {fmtTs(h.ts)} · {h.kind === "earn" ? `Earned on ${h.bookingId}` : h.kind === "giftcard" ? `${h.brand || "Gift card"} · BHD ${h.denomination}${h.code ? ` · ${h.code}` : ""}` : h.kind === "redeem" ? `Redeemed${h.bhd ? ` · ${fmtBhd(h.bhd)} credit` : ""}` : (h.note || "Manual adjust")}
                    </span>
                    <strong style={{ color: h.points >= 0 ? p.success : p.danger, whiteSpace: "nowrap" }}>
                      {h.points >= 0 ? "+" : ""}{Number(h.points).toLocaleString()} pts
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
