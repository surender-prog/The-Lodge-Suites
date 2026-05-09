import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Award, BedDouble, Calendar, Check, Copy, Crown, Edit2, Eye, EyeOff, Gem, Heart, KeyRound, Lock, Mail, Plus, RotateCcw, Save, Search, Send, Shield, ShieldCheck, Sparkles, Star, Trash2, Wallet, X } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { fmtDate, inDays, nightsBetween } from "../../../../utils/date.js";
import { useData } from "../../../../data/store.jsx";
import { Icon } from "../../../../components/Icon.jsx";
import { Card, Drawer, FileUpload, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, Stat, TableShell, Td, Th, TextField } from "../ui.jsx";
import { WalletCardDrawer } from "./WalletCard.jsx";

const TIER_ICON = { silver: Award, gold: Crown, platinum: Gem };
const COUNTRIES = ["Bahrain", "Saudi Arabia", "UAE", "Kuwait", "Qatar", "Oman", "United Kingdom", "United States", "India", "Japan", "Italy", "Other"];
const ID_TYPES = [
  { value: "",         label: "—" },
  { value: "passport", label: "Passport" },
  { value: "cpr",      label: "CPR (Bahrain)" },
  { value: "national", label: "National ID" },
  { value: "driving",  label: "Driving licence" },
];

const ICON_OPTIONS = [
  { value: "Award",    label: "Award (medal)" },
  { value: "Crown",    label: "Crown" },
  { value: "Gem",      label: "Gem" },
  { value: "Sparkles", label: "Sparkles" },
  { value: "Heart",    label: "Heart" },
  { value: "Star",     label: "Star" },
];

const COLOR_PRESETS = [
  { value: "#A8A8A8", label: "Silver" },
  { value: "#C9A961", label: "Gold" },
  { value: "#D4B97A", label: "Champagne" },
  { value: "#B5564B", label: "Ruby" },
  { value: "#5C8A4E", label: "Emerald" },
  { value: "#1B3A5C", label: "Sapphire" },
  { value: "#5C2A2F", label: "Burgundy" },
  { value: "#2D2F36", label: "Onyx" },
];

function isVerified(m) {
  return !!(m.photo && m.idDoc && m.idNumber);
}

export const Loyalty = ({ params, clearParams }) => {
  const t = useT();
  const p = usePalette();
  const { tiers, members, loyalty, setLoyalty, addTier } = useData();

  const [creatingMember, setCreatingMember] = useState(false);
  const [editingMember, setEditingMember]   = useState(null);
  const [bookingFor, setBookingFor]         = useState(null);
  const [editingTier, setEditingTier]       = useState(null);
  const [walletFor, setWalletFor]           = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);

  // Auto-open the requested member profile when navigated here from
  // another tab (e.g. clicking a member-guest's name in the Bookings tab).
  // Once consumed, clear the param so it doesn't re-fire on re-renders.
  useEffect(() => {
    if (!params?.memberId) return;
    const m = members.find((x) => x.id === params.memberId);
    if (m) setViewingProfile(m);
    if (clearParams) clearParams();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.memberId]);

  const [memberSearch, setMemberSearch] = useState("");
  const [memberTierFilter, setMemberTierFilter] = useState("all");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");

  const tierMembers = (id) => members.filter(m => m.tier === id).length;
  const totalPoints = members.reduce((s, m) => s + m.points, 0);
  const equivalentBhd = Math.round(totalPoints / loyalty.redeemBhdPerPoints);
  const topTier = tiers[tiers.length - 1];
  const verifiedCount = members.filter(isVerified).length;
  const verifiedPct = members.length ? Math.round((verifiedCount / members.length) * 100) : 0;

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (memberTierFilter !== "all" && m.tier !== memberTierFilter) return false;
      if (memberStatusFilter === "verified" && !isVerified(m)) return false;
      if (memberStatusFilter === "pending"  &&  isVerified(m)) return false;
      if (!q) return true;
      const hay = `${m.name} ${m.email} ${m.id} ${m.phone || ""} ${m.country || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [members, memberSearch, memberTierFilter, memberStatusFilter]);

  // Points-economy globals — kept as a draft so the user can review/cancel
  // before committing. The committed value flows into every member's
  // redeemable-BHD calculation across the app.
  const [loyaltyDraft, setLoyaltyDraft] = useState({
    redeemBhdPerPoints: String(loyalty.redeemBhdPerPoints),
    freeNightAfterPts:  String(loyalty.freeNightAfterPts),
  });
  const dRed  = Number(loyaltyDraft.redeemBhdPerPoints);
  const dFree = Number(loyaltyDraft.freeNightAfterPts);
  const loyaltyDirty =
    dRed  !== loyalty.redeemBhdPerPoints ||
    dFree !== loyalty.freeNightAfterPts;
  const loyaltyValid =
    Number.isFinite(dRed)  && dRed  >= 1 &&
    Number.isFinite(dFree) && dFree >= 1;
  const newLiability = members.reduce((s, m) => s + Math.floor(m.points / Math.max(1, dRed)), 0);

  const saveLoyalty = () => {
    if (!loyaltyDirty) return;
    if (!loyaltyValid) {
      pushToast({ message: "Both values must be whole numbers ≥ 1", kind: "warn" });
      return;
    }
    const next = {
      redeemBhdPerPoints: Math.round(dRed),
      freeNightAfterPts:  Math.round(dFree),
    };
    setLoyalty(next);
    setLoyaltyDraft({
      redeemBhdPerPoints: String(next.redeemBhdPerPoints),
      freeNightAfterPts:  String(next.freeNightAfterPts),
    });
    pushToast({ message: "Points economy · saved" });
  };

  const discardLoyalty = () => {
    setLoyaltyDraft({
      redeemBhdPerPoints: String(loyalty.redeemBhdPerPoints),
      freeNightAfterPts:  String(loyalty.freeNightAfterPts),
    });
    pushToast({ message: "Changes discarded", kind: "warn" });
  };

  const resetLoyaltyDefaults = () => {
    setLoyaltyDraft({ redeemBhdPerPoints: "100", freeNightAfterPts: "5000" });
  };

  const newTier = () => {
    const id = `tier-${Date.now()}`;
    setEditingTier({
      mode: "create",
      draft: {
        id, name: "", nightsLabel: "", intro: "",
        icon: "Award", color: "#C9A961", earnRate: 1,
        builtIn: false, benefits: [],
      },
    });
  };
  const editTier = (tier) => {
    setEditingTier({ mode: "edit", draft: { ...tier, benefits: [...tier.benefits] } });
  };

  return (
    <div>
      <PageHeader
        title="LS Privilege"
        intro="Tiers, benefits, points economy, and member roster. Edits propagate to the homepage Rewards section. Create new tiers for partner programmes or seasonal lifts."
        action={
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={newTier}><Plus size={11} /> New tier</GhostBtn>
            <PrimaryBtn onClick={() => setCreatingMember(true)} small><Plus size={12} /> New member</PrimaryBtn>
          </div>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Stat label="Total members" value={members.length} hint="active accounts" />
        <Stat label="Verified · KYC" value={`${verifiedPct}%`} hint={`${verifiedCount} of ${members.length} complete`} color={verifiedPct >= 80 ? p.success : p.warn} />
        <Stat label="Outstanding points" value={totalPoints.toLocaleString()} hint={`= ${t("common.bhd")} ${equivalentBhd.toLocaleString()} liability`} color={p.warn} />
        <Stat label="Free-night threshold" value={loyalty.freeNightAfterPts.toLocaleString()} hint="points required" />
        <Stat label={`Earn @ ${topTier?.name || "top tier"}`} value={`${topTier?.earnRate || 1}× pt/BHD`} color={p.accent} />
      </div>

      <TiersGrid tiers={tiers} tierMembers={tierMembers} onEdit={editTier} onNew={newTier} />

      <Card
        title={
          <div className="flex items-center gap-2">
            <span>Points economy</span>
            {loyaltyDirty ? (
              <span style={{
                fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                padding: "2px 7px", color: p.warn, border: `1px solid ${p.warn}`,
              }}>Unsaved</span>
            ) : (
              <span className="inline-flex items-center gap-1" style={{
                fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                padding: "2px 7px", color: p.success, border: `1px solid ${p.success}`,
              }}><Check size={9} /> Saved</span>
            )}
          </div>
        }
        className="mt-6"
        action={
          <div className="flex items-center gap-2">
            <button onClick={resetLoyaltyDefaults} title="Restore defaults (100 pts / BHD, 5000 pts free-night)"
              style={{
                color: p.textMuted, padding: "0.4rem 0.65rem", border: `1px solid ${p.border}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
            ><RotateCcw size={11} /> Defaults</button>
            <GhostBtn onClick={discardLoyalty} small>{loyaltyDirty ? "Discard" : "Cancel"}</GhostBtn>
            <button
              onClick={saveLoyalty}
              disabled={!loyaltyDirty || !loyaltyValid}
              style={{
                backgroundColor: (loyaltyDirty && loyaltyValid) ? p.accent : "transparent",
                color: (loyaltyDirty && loyaltyValid) ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textDim,
                border: `1px solid ${(loyaltyDirty && loyaltyValid) ? p.accent : p.border}`,
                padding: "0.45rem 0.95rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 8,
                cursor: (loyaltyDirty && loyaltyValid) ? "pointer" : "default",
              }}
            >
              <Save size={11} /> Save changes
            </button>
          </div>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <FormGroup label="Redemption rate (points per BHD off)">
            <TextField
              type="number"
              value={loyaltyDraft.redeemBhdPerPoints}
              onChange={(v) => setLoyaltyDraft((d) => ({ ...d, redeemBhdPerPoints: v }))}
              suffix="pts"
            />
          </FormGroup>
          <FormGroup label="Free-night threshold">
            <TextField
              type="number"
              value={loyaltyDraft.freeNightAfterPts}
              onChange={(v) => setLoyaltyDraft((d) => ({ ...d, freeNightAfterPts: v }))}
              suffix="pts"
            />
          </FormGroup>
        </div>

        {!loyaltyValid && (
          <div className="mt-4 px-3 py-2 inline-flex items-center gap-2" style={{
            color: p.danger, border: `1px solid ${p.danger}`, fontFamily: "'Manrope', sans-serif",
            fontSize: "0.78rem", lineHeight: 1.4,
          }}>
            Both values must be whole numbers ≥ 1.
          </div>
        )}

        {loyaltyDirty && loyaltyValid && (
          <div className="mt-5 p-4" style={{
            backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`,
            borderInlineStart: `4px solid ${p.warn}`,
          }}>
            <div style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
              Impact preview · {members.length} member{members.length === 1 ? "" : "s"}
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <ImpactRow
                label="Redemption rate"
                from={`${loyalty.redeemBhdPerPoints} pts / BHD`}
                to={`${dRed} pts / BHD`}
                delta={dRed - loyalty.redeemBhdPerPoints}
                deltaSuffix="pts"
                p={p}
              />
              <ImpactRow
                label="Free-night threshold"
                from={`${loyalty.freeNightAfterPts.toLocaleString()} pts`}
                to={`${dFree.toLocaleString()} pts`}
                delta={dFree - loyalty.freeNightAfterPts}
                deltaSuffix="pts"
                p={p}
              />
              <ImpactRow
                label="Outstanding liability"
                from={`${t("common.bhd")} ${equivalentBhd.toLocaleString()}`}
                to={`${t("common.bhd")} ${newLiability.toLocaleString()}`}
                delta={newLiability - equivalentBhd}
                deltaSuffix={t("common.bhd")}
                deltaSuffixBefore
                p={p}
              />
            </div>
            <p className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
              Saving will recalculate the redeemable BHD shown on every member's card and on the homepage rewards section.
            </p>
          </div>
        )}

        <p className="mt-4" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.6 }}>
          Members can redeem accumulated points against any future stay at the rate above. Per-tier earn rates (points-per-BHD) live on each tier — open the tier editor to change them. Points are only awarded on direct bookings; OTAs are excluded.
        </p>
      </Card>

      <Card
        title={
          <div className="flex items-center gap-2">
            <span>Members</span>
            <span style={{
              fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              padding: "2px 7px", color: p.textMuted, border: `1px solid ${p.border}`,
              borderRadius: 999, fontVariantNumeric: "tabular-nums",
            }}>
              {filteredMembers.length}{filteredMembers.length !== members.length && ` / ${members.length}`}
            </span>
          </div>
        }
        padded={false}
        className="mt-6"
        action={<PrimaryBtn onClick={() => setCreatingMember(true)} small><Plus size={11} /> Add</PrimaryBtn>}
      >
        {/* Filter bar — search + tier + verification status */}
        <div className="px-5 py-3.5 flex items-center gap-3 flex-wrap" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
          <div className="relative flex-1 min-w-[200px]" style={{ maxWidth: 360 }}>
            <Search size={13} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: p.textMuted, pointerEvents: "none" }} />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search name, email, ID, phone, country…"
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary,
                border: `1px solid ${p.border}`,
                paddingInlineStart: "2.2rem", paddingInlineEnd: memberSearch ? "2.2rem" : "0.75rem",
                paddingBlock: "0.55rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
              }}
            />
            {memberSearch && (
              <button onClick={() => setMemberSearch("")}
                style={{ position: "absolute", insetInlineEnd: 8, top: "50%", transform: "translateY(-50%)", color: p.textMuted }}
                title="Clear">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip active={memberTierFilter === "all"} onClick={() => setMemberTierFilter("all")} p={p}>All tiers</FilterChip>
            {tiers.map((tt) => (
              <FilterChip key={tt.id}
                active={memberTierFilter === tt.id}
                color={tt.color}
                onClick={() => setMemberTierFilter(tt.id)}
                p={p}
              >
                {tt.name}
              </FilterChip>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip active={memberStatusFilter === "all"}      onClick={() => setMemberStatusFilter("all")}      p={p}>All</FilterChip>
            <FilterChip active={memberStatusFilter === "verified"} onClick={() => setMemberStatusFilter("verified")} color={p.success} p={p}>Verified</FilterChip>
            <FilterChip active={memberStatusFilter === "pending"}  onClick={() => setMemberStatusFilter("pending")}  color={p.warn}    p={p}>Pending</FilterChip>
          </div>
        </div>

        <TableShell>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Email</Th>
              <Th>Verified</Th>
              <Th>Tier</Th>
              <Th align="end">Points</Th>
              <Th align="end">Redeemable</Th>
              <Th align="end">Lifetime nights</Th>
              <Th>Joined</Th>
              <Th align="end">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((m) => {
              const tier = tiers.find(t2 => t2.id === m.tier);
              const redeemable = Math.floor(m.points / loyalty.redeemBhdPerPoints);
              const verified = isVerified(m);
              const partial = !verified && (m.idNumber || m.photo);
              return (
                <tr key={m.id}>
                  <Td>
                    <button
                      onClick={() => setViewingProfile(m)}
                      title="Open profile"
                      className="flex items-center gap-3 group transition-colors"
                      style={{
                        backgroundColor: "transparent",
                        textAlign: "start",
                        padding: 0,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <Avatar member={m} tier={tier} />
                      <div className="min-w-0">
                        <div className="group-hover:underline" style={{
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: "1.05rem",
                          color: p.textPrimary,
                          textDecorationColor: p.accent,
                          textUnderlineOffset: 3,
                        }}>{m.name}</div>
                        <div style={{ color: p.accent, fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.05em" }}>{m.id}</div>
                      </div>
                    </button>
                  </Td>
                  <Td muted>{m.email}</Td>
                  <Td>
                    {verified ? (
                      <span className="inline-flex items-center gap-1.5" style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px", color: p.success, border: `1px solid ${p.success}`,
                      }}><ShieldCheck size={10} /> Verified</span>
                    ) : partial ? (
                      <span className="inline-flex items-center gap-1.5" style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px", color: p.warn, border: `1px solid ${p.warn}`,
                      }}>Partial</span>
                    ) : (
                      <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
                        Pending
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span style={{
                      fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      padding: "2px 8px",
                      color: tier?.color, border: `1px solid ${tier?.color}`,
                    }}>{tier?.name || m.tier}</span>
                  </Td>
                  <Td align="end" className="font-semibold">{m.points.toLocaleString()}</Td>
                  <Td align="end" muted>{t("common.bhd")} {redeemable}</Td>
                  <Td align="end">{m.lifetimeNights}</Td>
                  <Td muted>{m.joined}</Td>
                  <Td align="end">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => setViewingProfile(m)} className="inline-flex items-center gap-1.5"
                        title="View full profile, bookings & security"
                        style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                        onMouseEnter={(e) => e.currentTarget.style.color = p.accentDeep}
                        onMouseLeave={(e) => e.currentTarget.style.color = p.accent}
                      >
                        <Eye size={11} /> Profile
                      </button>
                      <button onClick={() => setWalletFor(m)} className="inline-flex items-center gap-1.5"
                        title="Issue wallet card · Apple & Google"
                        style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                        onMouseEnter={(e) => e.currentTarget.style.color = p.accentDeep}
                        onMouseLeave={(e) => e.currentTarget.style.color = p.accent}
                      >
                        <Wallet size={11} /> Card
                      </button>
                      <button onClick={() => setBookingFor(m)} className="inline-flex items-center gap-1.5"
                        title="Book on behalf"
                        style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                        <BedDouble size={11} /> Book
                      </button>
                      <button onClick={() => setEditingMember({ ...m })} className="inline-flex items-center gap-1.5"
                        title="Edit member"
                        style={{ color: p.textSecondary, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                        onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                        onMouseLeave={(e) => e.currentTarget.style.color = p.textSecondary}
                      >
                        <Edit2 size={11} /> Edit
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
            {filteredMembers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                  {members.length === 0 ? (
                    <>No members yet. <button onClick={() => setCreatingMember(true)} style={{ color: p.accent, fontWeight: 700 }}>Enrol the first one →</button></>
                  ) : (
                    <>No members match these filters.
                      <button onClick={() => { setMemberSearch(""); setMemberTierFilter("all"); setMemberStatusFilter("all"); }} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Reset filters →</button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
      </Card>

      {creatingMember && <NewMemberDrawer onClose={() => setCreatingMember(false)} />}
      {editingMember  && <EditMemberDrawer member={editingMember} onClose={() => setEditingMember(null)} />}
      {bookingFor     && <BookOnBehalfDrawer member={bookingFor} onClose={() => setBookingFor(null)} />}
      {editingTier    && <TierEditor mode={editingTier.mode} draft={editingTier.draft} onClose={() => setEditingTier(null)} />}
      {walletFor      && <WalletCardDrawer member={walletFor} onClose={() => setWalletFor(null)} />}
      {viewingProfile && (
        <MemberProfileDrawer
          member={viewingProfile}
          onClose={() => setViewingProfile(null)}
          onEdit={() => { const m = viewingProfile; setViewingProfile(null); setEditingMember({ ...m }); }}
          onBook={() => { const m = viewingProfile; setViewingProfile(null); setBookingFor(m); }}
          onWallet={() => { const m = viewingProfile; setViewingProfile(null); setWalletFor(m); }}
        />
      )}
    </div>
  );
};

// Side-by-side from→to with a coloured delta — used in the Points Economy
// impact preview so the operator can sense-check before committing.
function ImpactRow({ label, from, to, delta, deltaSuffix, deltaSuffixBefore, p }) {
  const dir   = delta === 0 ? "neutral" : delta > 0 ? "up" : "down";
  const color = dir === "neutral" ? p.textMuted : dir === "up" ? p.warn : p.success;
  const sign  = dir === "up" ? "+" : "";
  const formatted = `${sign}${Math.abs(delta).toLocaleString() === Math.abs(delta).toString() ? (delta).toLocaleString() : delta}`;
  return (
    <div>
      <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif" }}>
        <span style={{ color: p.textMuted, fontSize: "0.82rem", textDecoration: "line-through", textDecorationColor: p.textDim }}>{from}</span>
        <span style={{ color: p.textMuted, fontSize: "0.82rem" }}>→</span>
        <span style={{ color: p.textPrimary, fontSize: "0.96rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{to}</span>
      </div>
      {delta !== 0 && (
        <div className="mt-1" style={{ color, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}>
          {dir === "up" ? "+" : "−"}{deltaSuffixBefore ? `${deltaSuffix} ` : ""}{Math.abs(delta).toLocaleString()}{!deltaSuffixBefore && deltaSuffix ? ` ${deltaSuffix}` : ""}
        </div>
      )}
    </div>
  );
}

// Compact pill toggle used in the Members filter bar.
function FilterChip({ children, active, color, onClick, p }) {
  const base = color || p.accent;
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.35rem 0.75rem",
        backgroundColor: active ? `${base}1F` : "transparent",
        border: `1px solid ${active ? base : p.border}`,
        color: active ? base : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = base; e.currentTarget.style.color = base; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textSecondary; } }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tiers list — table-style row per tier with reorder, member count, and
// per-row Edit / Delete actions.
// ---------------------------------------------------------------------------
function TiersGrid({ tiers, tierMembers, onEdit, onNew }) {
  const p = usePalette();
  const t = useT();
  const { removeTier, moveTier, members } = useData();

  const remove = (tier) => {
    const assigned = members.filter(m => m.tier === tier.id).length;
    if (assigned > 0) {
      pushToast({ message: `Cannot remove · ${assigned} members are still on ${tier.name}`, kind: "warn" });
      return;
    }
    if (!confirm(`Remove tier "${tier.name}"?${tier.builtIn ? " (Built-in tiers reappear after refresh.)" : ""}`)) return;
    removeTier(tier.id);
    pushToast({ message: `Removed · ${tier.name}`, kind: "warn" });
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span>Tiers</span>
          <span style={{
            fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            padding: "2px 7px", color: p.textMuted, border: `1px solid ${p.border}`,
            borderRadius: 999, fontVariantNumeric: "tabular-nums",
          }}>{tiers.length}</span>
        </div>
      }
      padded={false}
      action={
        <button
          onClick={onNew}
          className="flex items-center gap-1.5"
          style={{
            padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`,
            backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
          }}
        >
          <Plus size={11} /> New tier
        </button>
      }
    >
      <TableShell>
        <thead>
          <tr>
            <Th />
            <Th>Tier</Th>
            <Th>Threshold</Th>
            <Th>Intro</Th>
            <Th align="end">Earn</Th>
            <Th>Benefits</Th>
            <Th align="end">Members</Th>
            <Th align="end">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, idx) => {
            const isFirst = idx === 0;
            const isLast  = idx === tiers.length - 1;
            const memberCount = tierMembers(tier.id);
            const benefitsActive = tier.benefits.filter(b => b.on).length;
            return (
              <tr key={tier.id}>
                <Td>
                  <div className="flex items-center gap-1">
                    <span style={{
                      width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${p.accent}`, color: p.accent,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}>{idx + 1}</span>
                    <div className="flex flex-col">
                      <button onClick={() => moveTier(idx, "up")} disabled={isFirst} title="Move up"
                        style={{ color: isFirst ? p.textDim : p.textMuted, padding: 1, cursor: isFirst ? "default" : "pointer" }}
                        onMouseEnter={(e) => { if (!isFirst) e.currentTarget.style.color = p.accent; }}
                        onMouseLeave={(e) => { if (!isFirst) e.currentTarget.style.color = p.textMuted; }}
                      ><ArrowUp size={11} /></button>
                      <button onClick={() => moveTier(idx, "down")} disabled={isLast} title="Move down"
                        style={{ color: isLast ? p.textDim : p.textMuted, padding: 1, cursor: isLast ? "default" : "pointer" }}
                        onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.color = p.accent; }}
                        onMouseLeave={(e) => { if (!isLast) e.currentTarget.style.color = p.textMuted; }}
                      ><ArrowDown size={11} /></button>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center justify-center" style={{
                      width: 28, height: 28, borderRadius: 999,
                      backgroundColor: `${tier.color}1F`,
                      border: `1px solid ${tier.color}`,
                      color: tier.color, flexShrink: 0,
                    }}>
                      <Icon name={tier.icon} size={14} />
                    </span>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: tier.color, fontWeight: 600 }}>
                      {tier.name}
                    </span>
                    {tier.builtIn && (
                      <span style={{
                        fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                        padding: "1px 6px", color: p.textMuted, border: `1px solid ${p.border}`,
                      }}>Built-in</span>
                    )}
                    {tier.featured && (
                      <span style={{
                        fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                        padding: "1px 6px", color: p.accent, border: `1px solid ${p.accent}`,
                      }}>Featured</span>
                    )}
                  </div>
                </Td>
                <Td muted style={{ whiteSpace: "nowrap" }}>{tier.nightsLabel || "—"}</Td>
                <Td muted>
                  <div style={{ maxWidth: 280, fontSize: "0.78rem", lineHeight: 1.45 }}>
                    {tier.intro || <em style={{ color: p.textDim }}>—</em>}
                  </div>
                </Td>
                <Td align="end" className="font-semibold" style={{ color: p.accent, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {tier.earnRate}× <span style={{ color: p.textMuted, fontSize: "0.7rem", fontWeight: 500 }}>pt/BHD</span>
                </Td>
                <Td>
                  <div className="flex items-center gap-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                    <span style={{ color: p.textPrimary, fontWeight: 600 }}>{benefitsActive}</span>
                    <span style={{ color: p.textMuted }}>/ {tier.benefits.length}</span>
                    <span style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>active</span>
                  </div>
                </Td>
                <Td align="end" style={{ fontVariantNumeric: "tabular-nums" }}>{memberCount}</Td>
                <Td align="end">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => onEdit(tier)} className="flex items-center gap-1.5"
                      style={{
                        padding: "0.35rem 0.7rem", border: `1px solid ${p.accent}`, color: p.accent,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <Edit2 size={11} /> Edit
                    </button>
                    <button onClick={() => remove(tier)} title={tier.builtIn ? "Remove built-in (returns on refresh)" : "Remove tier"}
                      style={{ color: p.danger, padding: "0.35rem 0.6rem", border: `1px solid ${p.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; e.currentTarget.style.backgroundColor = p.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = "transparent"; }}
                    ><Trash2 size={12} /></button>
                  </div>
                </Td>
              </tr>
            );
          })}
          {tiers.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
                No tiers yet.
                <button onClick={onNew} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Create the first tier →</button>
              </td>
            </tr>
          )}
        </tbody>
      </TableShell>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TierEditor — full-page drawer with identity / visual / earn / benefits.
// ---------------------------------------------------------------------------
function TierEditor({ mode, draft: initial, onClose }) {
  const p = usePalette();
  const { addTier, setTiers, tiers } = useData();
  const [draft, setDraft] = useState(initial);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const updateBenefit = (id, patch) => set({ benefits: draft.benefits.map(b => b.id === id ? { ...b, ...patch } : b) });
  const removeBenefit = (id) => set({ benefits: draft.benefits.filter(b => b.id !== id) });
  const addBenefit = () => {
    const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    set({ benefits: [...draft.benefits, { id, label: "New benefit", on: true }] });
  };
  const moveBenefit = (id, dir) => {
    const idx = draft.benefits.findIndex(b => b.id === id);
    if (idx < 0) return;
    const next = [...draft.benefits];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    set({ benefits: next });
  };

  const save = () => {
    if (!draft.name.trim()) { pushToast({ message: "Give the tier a name first", kind: "warn" }); return; }
    if (mode === "create") {
      addTier(draft);
      pushToast({ message: `Created · ${draft.name}` });
    } else {
      setTiers((ts) => ts.map(t => t.id === draft.id ? draft : t));
      pushToast({ message: `Saved · ${draft.name}` });
    }
    onClose();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={mode === "create" ? "New tier" : "Edit tier"}
      title={draft.name || "Untitled tier"}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={11} /> {mode === "create" ? "Create tier" : "Save changes"}</PrimaryBtn>
        </>
      }
    >
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form column — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Identity">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormGroup label="Tier name">
                  <TextField value={draft.name} onChange={(v) => set({ name: v })} placeholder="e.g. Platinum Elite" />
                </FormGroup>
                <FormGroup label="Threshold label">
                  <TextField value={draft.nightsLabel} onChange={(v) => set({ nightsLabel: v })} placeholder="e.g. 50+ nights / year" />
                </FormGroup>
              </div>
              <FormGroup label="Intro line (homepage tagline)">
                <TextField value={draft.intro} onChange={(v) => set({ intro: v })} placeholder="A short, evocative line for the public site." />
              </FormGroup>
              <label className="flex items-center gap-2" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={!!draft.featured} onChange={(e) => set({ featured: e.target.checked })} />
                Mark as Featured (shows the "Most chosen" ribbon on the homepage)
              </label>
            </div>
          </Card>

          <Card title="Visual">
            <div className="grid grid-cols-2 gap-4">
              <FormGroup label="Icon">
                <SelectField value={draft.icon} onChange={(v) => set({ icon: v })} options={ICON_OPTIONS} />
              </FormGroup>
              <FormGroup label="Earn rate (points per BHD spent)">
                <TextField type="number" value={draft.earnRate} onChange={(v) => set({ earnRate: Number(v) })} suffix="pt/BHD" />
              </FormGroup>
            </div>
            <div className="mt-4">
              <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
                Color
              </div>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button key={preset.value} onClick={() => set({ color: preset.value })}
                    className="flex items-center gap-2"
                    title={preset.label}
                    style={{
                      padding: "0.4rem 0.7rem",
                      border: `2px solid ${draft.color === preset.value ? preset.value : p.border}`,
                      backgroundColor: draft.color === preset.value ? `${preset.value}18` : "transparent",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textSecondary,
                    }}
                  >
                    <span style={{ width: 14, height: 14, backgroundColor: preset.value, borderRadius: 3 }} />
                    {preset.label}
                  </button>
                ))}
                <div className="flex items-center gap-2" style={{ marginInlineStart: 4 }}>
                  <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>Custom hex</span>
                  <input
                    type="text"
                    value={draft.color}
                    onChange={(e) => set({ color: e.target.value })}
                    placeholder="#C9A961"
                    style={{
                      backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
                      padding: "0.4rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
                      width: 110,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card title={`Benefits (${draft.benefits.length})`} padded={false}
            action={
              <button onClick={addBenefit} className="flex items-center gap-1.5"
                style={{
                  padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                }}
              >
                <Plus size={11} /> Add benefit
              </button>
            }
          >
            {draft.benefits.length === 0 ? (
              <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
                No benefits yet. <button onClick={addBenefit} style={{ color: p.accent, fontWeight: 700 }}>Add one →</button>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-2">
                {draft.benefits.map((b, idx) => (
                  <div key={b.id} className="flex items-center gap-2" style={{ border: `1px solid ${p.border}`, padding: "0.5rem 0.75rem", backgroundColor: p.bgPanel }}>
                    <div className="flex flex-col">
                      <button onClick={() => moveBenefit(b.id, "up")} disabled={idx === 0}
                        style={{ color: idx === 0 ? p.textDim : p.textMuted, padding: 1, cursor: idx === 0 ? "default" : "pointer" }}
                        onMouseEnter={(e) => { if (idx !== 0) e.currentTarget.style.color = p.accent; }}
                        onMouseLeave={(e) => { if (idx !== 0) e.currentTarget.style.color = p.textMuted; }}
                      ><ArrowUp size={11} /></button>
                      <button onClick={() => moveBenefit(b.id, "down")} disabled={idx === draft.benefits.length - 1}
                        style={{ color: idx === draft.benefits.length - 1 ? p.textDim : p.textMuted, padding: 1, cursor: idx === draft.benefits.length - 1 ? "default" : "pointer" }}
                        onMouseEnter={(e) => { if (idx !== draft.benefits.length - 1) e.currentTarget.style.color = p.accent; }}
                        onMouseLeave={(e) => { if (idx !== draft.benefits.length - 1) e.currentTarget.style.color = p.textMuted; }}
                      ><ArrowDown size={11} /></button>
                    </div>
                    <button onClick={() => updateBenefit(b.id, { on: !b.on })} title={b.on ? "Included" : "Excluded"}
                      style={{
                        width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                        backgroundColor: b.on ? draft.color : "transparent",
                        border: `1px solid ${b.on ? draft.color : p.border}`,
                        color: b.on ? "#fff" : p.textMuted,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {b.on ? "✓" : ""}
                    </button>
                    <input
                      value={b.label}
                      onChange={(e) => updateBenefit(b.id, { label: e.target.value })}
                      className="flex-1 outline-none"
                      style={{
                        backgroundColor: "transparent", color: p.textPrimary,
                        border: "none", padding: "0.4rem 0.5rem",
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem",
                        opacity: b.on ? 1 : 0.6,
                      }}
                      placeholder="Benefit description"
                    />
                    <button onClick={() => removeBenefit(b.id)} title="Remove benefit"
                      style={{ color: p.danger, padding: "0.3rem 0.45rem", border: `1px solid ${p.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; e.currentTarget.style.backgroundColor = p.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.backgroundColor = "transparent"; }}
                    ><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sticky preview column */}
        <div className="lg:sticky lg:top-4 self-start">
          <Card padded={false}
            title={
              <div className="flex items-center gap-2">
                <Icon name={draft.icon} size={14} style={{ color: draft.color }} />
                <span style={{ color: draft.color }}>{draft.name || "Untitled"}</span>
              </div>
            }
          >
            <div className="px-5 pt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Live preview · homepage card
            </div>
            <div className="px-5 pt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
              {draft.nightsLabel || "—"}
            </div>
            <div className="px-5 pt-2 pb-3" style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1rem", lineHeight: 1.4 }}>
              {draft.intro || "Add an intro to catch the eye on the homepage."}
            </div>
            <div className="px-5 pb-3" style={{ color: draft.color, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              Earn rate
            </div>
            <div className="px-5 pb-3" style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem" }}>
              {draft.earnRate} <span style={{ color: p.textMuted, fontSize: "0.85rem" }}>points / BHD</span>
            </div>
            <div className="border-t" style={{ borderColor: p.border }}>
              {draft.benefits.length === 0 ? (
                <div className="px-5 py-3" style={{ color: p.textMuted, fontStyle: "italic", fontSize: "0.78rem" }}>No benefits configured.</div>
              ) : draft.benefits.map((b) => (
                <div key={b.id} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${p.border}`, opacity: b.on ? 1 : 0.4 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3,
                    backgroundColor: b.on ? draft.color : "transparent",
                    border: `1px solid ${b.on ? draft.color : p.border}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: p.textSecondary }}>{b.label || <em style={{ color: p.textMuted }}>(empty)</em>}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// New / edit member drawers — unchanged shape, kept here for completeness.
// ---------------------------------------------------------------------------
function VerificationCard({ draft, set }) {
  const p = usePalette();
  return (
    <Card title={<><ShieldCheck size={13} className="inline mr-1.5" /> Identity verification</>}>
      <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55, marginBottom: 16 }}>
        Capture a portrait photo and an official ID document. Required for direct check-in and for redeeming points against future stays.
      </p>
      <div className="grid md:grid-cols-[160px_1fr] gap-5">
        <FileUpload
          variant="photo"
          label="Member photo"
          value={draft.photo}
          onChange={(f) => set({ photo: f })}
          hint="JPG / PNG, max 5MB"
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="ID type">
              <SelectField value={draft.idType || ""} onChange={(v) => set({ idType: v })} options={ID_TYPES} />
            </FormGroup>
            <FormGroup label="ID number">
              <TextField value={draft.idNumber} onChange={(v) => set({ idNumber: v })} placeholder="e.g. 880412345" />
            </FormGroup>
          </div>
          <FormGroup label="Expiry date">
            <TextField type="date" value={draft.idExpiry} onChange={(v) => set({ idExpiry: v })} />
          </FormGroup>
          <FormGroup label="ID document scan">
            <FileUpload
              variant="document"
              value={draft.idDoc}
              onChange={(f) => set({ idDoc: f })}
              hint="JPG, PNG or PDF · max 10MB"
            />
          </FormGroup>
        </div>
      </div>
    </Card>
  );
}

function NewMemberDrawer({ onClose }) {
  const p = usePalette();
  const t = useT();
  const { addMember, tiers } = useData();
  const [draft, setDraft] = useState({
    name: "", email: "", phone: "", country: "Bahrain", tier: tiers[0]?.id || "silver",
    lifetimeNights: 0, points: 0,
    photo: null, idType: "", idNumber: "", idExpiry: "", idDoc: null,
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const valid = draft.name.trim() && draft.email.includes("@");

  const save = () => {
    if (!valid) return;
    addMember(draft);
    onClose();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="New"
      title="Enrol member"
      fullPage
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={12} /> Enrol member</PrimaryBtn>
        </>
      }
    >
      <Card title="Identity">
        <div className="space-y-4">
          <FormGroup label="Full name"><TextField value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} /></FormGroup>
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="Email"><TextField type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} /></FormGroup>
            <FormGroup label="Phone"><TextField value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} placeholder="+973…" /></FormGroup>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="Country"><SelectField value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} options={COUNTRIES} /></FormGroup>
            <FormGroup label="Starting tier">
              <SelectField value={draft.tier} onChange={(v) => setDraft({ ...draft, tier: v })}
                options={tiers.map(t => ({ value: t.id, label: t.name }))} />
            </FormGroup>
          </div>
        </div>
      </Card>

      <div className="mt-6"><VerificationCard draft={draft} set={set} /></div>

      <Card title="Opening balance" className="mt-6">
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Opening points"><TextField type="number" value={draft.points} onChange={(v) => setDraft({ ...draft, points: Number(v) })} suffix="pts" /></FormGroup>
          <FormGroup label="Lifetime nights"><TextField type="number" value={draft.lifetimeNights} onChange={(v) => setDraft({ ...draft, lifetimeNights: Number(v) })} /></FormGroup>
        </div>
        <p className="mt-4" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.6 }}>
          A member ID will be generated automatically based on the chosen tier and applied to the next booking.
        </p>
      </Card>
    </Drawer>
  );
}

function EditMemberDrawer({ member, onClose }) {
  const p = usePalette();
  const t = useT();
  const { updateMember, removeMember, loyalty, tiers } = useData();
  const [draft, setDraft] = useState(member);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const [pointsDelta, setPointsDelta] = useState(0);
  const [pointsReason, setPointsReason] = useState("");

  const save = () => {
    const finalPoints = Math.max(0, Number(draft.points) + Number(pointsDelta || 0));
    updateMember(member.id, { ...draft, points: finalPoints });
    onClose();
  };

  const remove = () => {
    if (confirm(`Remove member "${member.name}"? This cannot be undone.`)) {
      removeMember(member.id);
      onClose();
    }
  };

  const redeemable = Math.floor((Number(draft.points) + Number(pointsDelta || 0)) / loyalty.redeemBhdPerPoints);

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={member.name}
      fullPage
      footer={
        <>
          <GhostBtn onClick={remove} small danger><Trash2 size={11} /> Remove member</GhostBtn>
          <div className="flex-1" />
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={12} /> Save changes</PrimaryBtn>
        </>
      }
    >
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Stat label="Member ID" value={member.id} hint={`Joined ${member.joined}`} color={p.accent} />
        <Stat label="Current points" value={(Number(draft.points) + Number(pointsDelta || 0)).toLocaleString()} hint={`= ${t("common.bhd")} ${redeemable} redeemable`} color={p.textPrimary} />
        <Stat label="Lifetime nights" value={draft.lifetimeNights || 0} color={p.success} />
      </div>

      <Card title="Identity">
        <div className="space-y-4">
          <FormGroup label="Full name"><TextField value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} /></FormGroup>
          <FormGroup label="Email"><TextField type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} /></FormGroup>
          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="Tier">
              <SelectField value={draft.tier} onChange={(v) => setDraft({ ...draft, tier: v })}
                options={tiers.map(t => ({ value: t.id, label: t.name }))} />
            </FormGroup>
            <FormGroup label="Lifetime nights"><TextField type="number" value={draft.lifetimeNights} onChange={(v) => setDraft({ ...draft, lifetimeNights: Number(v) })} /></FormGroup>
          </div>
        </div>
      </Card>

      <div className="mt-6"><VerificationCard draft={draft} set={set} /></div>

      <Card title="Points adjustment" className="mt-6">
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Current balance">
            <TextField type="number" value={draft.points} onChange={(v) => setDraft({ ...draft, points: Number(v) })} suffix="pts" />
          </FormGroup>
          <FormGroup label="Adjust by (±)">
            <TextField type="number" value={pointsDelta} onChange={(v) => setPointsDelta(v)} placeholder="e.g. +500 or -100" suffix="pts" />
          </FormGroup>
        </div>
        {Number(pointsDelta) !== 0 && (
          <div className="mt-4">
            <FormGroup label="Reason / note (audit trail)"><TextField value={pointsReason} onChange={setPointsReason} placeholder="Goodwill, manual award, redemption…" /></FormGroup>
          </div>
        )}
        <div className="mt-4 p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
          <div className="flex justify-between" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
            <span style={{ color: p.textMuted }}>New balance</span>
            <span style={{ color: p.textPrimary, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {(Number(draft.points) + Number(pointsDelta || 0)).toLocaleString()} pts
            </span>
          </div>
          <div className="flex justify-between mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
            <span style={{ color: p.textMuted }}>Redeemable</span>
            <span style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t("common.bhd")} {redeemable}</span>
          </div>
        </div>
      </Card>
    </Drawer>
  );
}

function BookOnBehalfDrawer({ member, onClose }) {
  const p = usePalette();
  const t = useT();
  const { rooms, addBooking, calendar, updateMember, loyalty, tiers } = useData();
  const memberTier = tiers.find(t2 => t2.id === member.tier);
  const earnRate = memberTier?.earnRate || 1;
  const [draft, setDraft] = useState({
    roomId:   rooms[0]?.id,
    checkIn:  inDays(7),
    checkOut: inDays(10),
    guests:   2,
    redeemPoints: 0,
    notes:    "",
  });

  const room = rooms.find(r => r.id === draft.roomId);
  const nights = nightsBetween(draft.checkIn, draft.checkOut);

  const avgRate = useMemo(() => {
    if (!room || nights === 0) return 0;
    let sum = 0, count = 0;
    const start = new Date(draft.checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = `${room.id}|${d.toISOString().slice(0, 10)}`;
      const r = calendar[k]?.rate ?? room.price;
      sum += r; count += 1;
    }
    return count ? sum / count : room.price;
  }, [room, nights, draft.checkIn, draft.roomId, calendar]);

  const subtotal = Math.round(avgRate * nights);
  const discountFromPoints = Math.min(subtotal, Math.floor(Number(draft.redeemPoints || 0) / loyalty.redeemBhdPerPoints));
  const total = Math.max(0, subtotal - discountFromPoints);
  const pointsEarned = Math.round(total * earnRate);

  const valid = nights > 0 && room && Number(draft.redeemPoints || 0) <= member.points;

  const submit = () => {
    if (!valid) return;
    const id = `LS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    addBooking({
      id,
      guest: member.name,
      email: member.email,
      source: "direct",
      roomId: draft.roomId,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      nights,
      guests: Number(draft.guests),
      rate: Math.round(avgRate),
      total,
      paid: 0,
      status: "confirmed",
      paymentStatus: "pending",
    });
    const nextPoints = Math.max(0, member.points - Number(draft.redeemPoints || 0) + pointsEarned);
    updateMember(member.id, {
      points: nextPoints,
      lifetimeNights: member.lifetimeNights + nights,
    });
    onClose();
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="New booking"
      title={`Book for ${member.name}`}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} small><Save size={12} /> Confirm booking</PrimaryBtn>
        </>
      }
    >
      <div className="p-4 mb-6 flex items-center justify-between flex-wrap gap-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: p.textPrimary }}>{member.name}</div>
          <div style={{ color: p.accent, fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", marginTop: 2 }}>
            {member.id} · {memberTier?.name || member.tier} · {member.email}
          </div>
        </div>
        <div className="text-end">
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Available points</div>
          <div style={{ color: p.accent, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", fontWeight: 600 }}>{member.points.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Reservation">
            <div className="space-y-4">
              <FormGroup label="Suite">
                <SelectField value={draft.roomId} onChange={(v) => setDraft({ ...draft, roomId: v })}
                  options={rooms.map(r => ({ value: r.id, label: `${t(`rooms.${r.id}.name`)} · ${t("common.bhd")} ${r.price}/night` }))} />
              </FormGroup>
              <div className="grid grid-cols-2 gap-4">
                <FormGroup label="Check-in"><TextField type="date" value={draft.checkIn} onChange={(v) => setDraft({ ...draft, checkIn: v })} /></FormGroup>
                <FormGroup label="Check-out"><TextField type="date" value={draft.checkOut} onChange={(v) => setDraft({ ...draft, checkOut: v })} /></FormGroup>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormGroup label="Guests"><TextField type="number" value={draft.guests} onChange={(v) => setDraft({ ...draft, guests: v })} /></FormGroup>
                <FormGroup label={`Redeem points (max ${member.points.toLocaleString()})`}>
                  <TextField type="number" value={draft.redeemPoints} onChange={(v) => setDraft({ ...draft, redeemPoints: v })} suffix="pts" />
                </FormGroup>
              </div>
              <FormGroup label="Notes (internal)"><TextField value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="High floor, late arrival…" /></FormGroup>
            </div>
          </Card>

          {!valid && Number(draft.redeemPoints || 0) > member.points && (
            <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.danger}`, color: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
              Cannot redeem more than the member's available points ({member.points.toLocaleString()}).
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4 self-start">
          <Card title="Summary" padded={false}>
            <div className="p-5 space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
              <SummaryRow label={`Suite × ${nights} ${nights === 1 ? "night" : "nights"}`} value={`${t("common.bhd")} ${subtotal.toLocaleString()}`} />
              <SummaryRow label="Avg nightly rate" value={`${t("common.bhd")} ${Math.round(avgRate)}`} muted />
              {discountFromPoints > 0 && <SummaryRow label="Points redemption" value={`− ${t("common.bhd")} ${discountFromPoints.toLocaleString()}`} accent />}
              <div className="pt-3 mt-3 flex justify-between items-baseline" style={{ borderTop: `1px solid ${p.border}` }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: p.textPrimary }}>Total</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.accent, fontWeight: 700 }}>{t("common.bhd")} {total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mt-3 pt-3" style={{ color: p.success, fontSize: "0.78rem", borderTop: `1px solid ${p.border}` }}>
                <span>Points earned (post-stay)</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>+{pointsEarned.toLocaleString()} pts</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Drawer>
  );
}

function SummaryRow({ label, value, muted, accent }) {
  const p = usePalette();
  return (
    <div className="flex justify-between">
      <span style={{ color: p.textMuted }}>{label}</span>
      <span style={{ color: accent ? p.accent : muted ? p.textMuted : p.textPrimary, fontWeight: accent ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Avatar({ member, tier }) {
  const p = usePalette();
  const initials = (member.name || "").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const tierColor = tier?.color || p.accent;
  if (member.photo?.url) {
    return (
      <img src={member.photo.url} alt={member.name}
        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `2px solid ${tierColor}`, flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: 36, height: 36, borderRadius: "50%",
      backgroundColor: p.bgPanelAlt, border: `2px solid ${tierColor}`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      color: tierColor, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: "0.95rem",
    }}>{initials}</div>
  );
}

// Larger avatar for the profile drawer header.
function ProfileAvatar({ member, tier, size = 84 }) {
  const p = usePalette();
  const initials = (member.name || "").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const tierColor = tier?.color || p.accent;
  const fontSize = Math.max(20, Math.round(size * 0.4));
  if (member.photo?.url) {
    return (
      <img src={member.photo.url} alt={member.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `3px solid ${tierColor}`, flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      backgroundColor: p.bgPanelAlt, border: `3px solid ${tierColor}`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      color: tierColor, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
      fontSize,
    }}>{initials}</div>
  );
}

// ---------------------------------------------------------------------------
// MemberProfileDrawer — the rich, full-page profile shown when an operator
// clicks "Profile" on a row. Covers identity, tier, bookings, security, and
// quick actions (book on behalf · issue wallet card · edit details).
// ---------------------------------------------------------------------------
function MemberProfileDrawer({ member, onClose, onEdit, onBook, onWallet }) {
  const p = usePalette();
  const t = useT();
  const { tiers, loyalty, bookings, rooms, updateMember } = useData();

  const tier = tiers.find((tt) => tt.id === member.tier);
  const verified = isVerified(member);

  // Bookings for this member — match by guest name, with email as a stronger
  // secondary signal when the booking carries one. Sorted newest first.
  const memberBookings = useMemo(() => {
    const byEmail = (b) => member.email && b.email && b.email.toLowerCase() === member.email.toLowerCase();
    const byName  = (b) => b.guest && member.name && b.guest.toLowerCase() === member.name.toLowerCase();
    return bookings
      .filter((b) => byEmail(b) || byName(b))
      .sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
  }, [bookings, member.email, member.name]);

  const totalSpend  = memberBookings.reduce((s, b) => s + (b.total || 0), 0);
  const upcomingCount = memberBookings.filter((b) => b.status === "confirmed").length;
  const inHouseCount  = memberBookings.filter((b) => b.status === "in-house").length;

  const redeemable = Math.floor(member.points / loyalty.redeemBhdPerPoints);

  // Tier change ----------------------------------------------------------------
  const changeTier = (newTierId) => {
    if (newTierId === member.tier) return;
    const target = tiers.find((tt) => tt.id === newTierId);
    if (!target) return;
    if (!confirm(`Move ${member.name} from ${tier?.name || member.tier} to ${target.name}? Earn rate, benefits, and member-card colour will update immediately.`)) return;
    updateMember(member.id, { tier: newTierId });
    pushToast({ message: `Tier updated · ${member.name} is now ${target.name}` });
  };

  // Password / security --------------------------------------------------------
  const [pwMode, setPwMode] = useState(null); // null | "set" | "link"
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [tempPw, setTempPw] = useState(null);

  const sendResetLink = () => {
    if (!member.email) {
      pushToast({ message: "No email on file — set one before sending a reset link", kind: "warn" });
      return;
    }
    pushToast({ message: `Password reset link sent to ${member.email}` });
    setPwMode(null);
  };

  const setNewPassword = () => {
    if (!newPw || newPw.length < 6) {
      pushToast({ message: "Password must be at least 6 characters", kind: "warn" });
      return;
    }
    if (newPw !== confirmPw) {
      pushToast({ message: "Passwords don't match", kind: "warn" });
      return;
    }
    updateMember(member.id, { password: newPw, passwordSetAt: new Date().toISOString() });
    pushToast({ message: `Password updated for ${member.name}` });
    setPwMode(null); setNewPw(""); setConfirmPw(""); setShowPw(false);
  };

  const generateTempPassword = () => {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
    let pwd = "";
    for (let i = 0; i < 10; i++) pwd += charset[Math.floor(Math.random() * charset.length)];
    setTempPw(pwd);
    updateMember(member.id, { password: pwd, passwordSetAt: new Date().toISOString(), passwordTemporary: true });
  };

  const copyTempPassword = async () => {
    if (!tempPw) return;
    try { await navigator.clipboard.writeText(tempPw); pushToast({ message: "Temporary password copied" }); }
    catch { pushToast({ message: "Clipboard not available", kind: "warn" }); }
  };

  const tierColor = tier?.color || p.accent;
  const memberSinceLabel = member.joined
    ? new Date(member.joined).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="Member profile"
      title={member.name}
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Close</GhostBtn>
          <div className="flex-1" />
          <GhostBtn onClick={onWallet} small><Wallet size={11} /> Wallet card</GhostBtn>
          <GhostBtn onClick={onBook}   small><BedDouble size={11} /> Book on behalf</GhostBtn>
          <PrimaryBtn onClick={onEdit} small><Edit2 size={12} /> Edit details</PrimaryBtn>
        </>
      }
    >
      {/* Header — avatar + identity block */}
      <div className="p-6 mb-6 flex items-start gap-5 flex-wrap" style={{
        backgroundColor: `${tierColor}10`,
        border: `1px solid ${tierColor}40`,
        borderInlineStart: `4px solid ${tierColor}`,
      }}>
        <ProfileAvatar member={member} tier={tier} size={88} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.9rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
              {member.name}
            </h3>
            {verified ? (
              <span className="inline-flex items-center gap-1.5" style={{
                fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                padding: "2px 8px", color: p.success, border: `1px solid ${p.success}`, backgroundColor: `${p.success}15`,
              }}><ShieldCheck size={10} /> Verified</span>
            ) : (
              <span style={{
                fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                padding: "2px 8px", color: p.warn, border: `1px solid ${p.warn}`, backgroundColor: `${p.warn}15`,
              }}>KYC pending</span>
            )}
          </div>
          <div style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", marginTop: 4 }}>
            {member.id}
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
            {member.email && <span className="inline-flex items-center gap-1.5"><Mail size={11} style={{ color: p.accent }} /> {member.email}</span>}
            {member.phone && <span style={{ color: p.textMuted }}>·</span>}
            {member.phone && <span>{member.phone}</span>}
            {member.country && <span style={{ color: p.textMuted }}>·</span>}
            {member.country && <span>{member.country}</span>}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5" style={{
              fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              padding: "3px 9px", color: tierColor, border: `1px solid ${tierColor}`, backgroundColor: `${tierColor}1F`,
            }}>
              <Icon name={tier?.icon || "Award"} size={10} /> {tier?.name || member.tier}
            </span>
            <span style={{ color: p.textMuted, fontSize: "0.74rem" }}>
              Member since {memberSinceLabel}
            </span>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Points balance"   value={member.points.toLocaleString()} hint={`= ${t("common.bhd")} ${redeemable} redeemable`} color={p.accent} />
        <Stat label="Lifetime nights"  value={member.lifetimeNights || 0} hint={`${memberBookings.length} stay${memberBookings.length === 1 ? "" : "s"} on file`} color={p.success} />
        <Stat label="Lifetime spend"   value={`${t("common.bhd")} ${totalSpend.toLocaleString()}`} hint={tier ? `Earn ${tier.earnRate}× pt/BHD` : ""} />
        <Stat
          label="Status"
          value={inHouseCount > 0 ? "In-house" : upcomingCount > 0 ? `${upcomingCount} upcoming` : "—"}
          hint={inHouseCount > 0 ? "Currently staying" : upcomingCount > 0 ? "Future bookings" : "No active stays"}
          color={inHouseCount > 0 ? p.success : upcomingCount > 0 ? p.accent : p.textMuted}
        />
      </div>

      {/* Tier management */}
      <Card title={<><Crown size={12} className="inline mr-1.5" /> Tier management</>} className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
            Current → New
          </span>
          {tiers.map((tt) => {
            const active = member.tier === tt.id;
            return (
              <button key={tt.id} onClick={() => changeTier(tt.id)}
                title={active ? "Current tier" : `Move to ${tt.name}`}
                disabled={active}
                className="inline-flex items-center gap-2"
                style={{
                  padding: "0.45rem 0.85rem",
                  backgroundColor: active ? `${tt.color}1F` : "transparent",
                  border: `1px solid ${active ? tt.color : p.border}`,
                  color: active ? tt.color : p.textSecondary,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  cursor: active ? "default" : "pointer",
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = tt.color; e.currentTarget.style.color = tt.color; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.color = p.textSecondary; } }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: tt.color, display: "inline-block" }} />
                {tt.name}
                {active && <span style={{ color: tt.color, fontWeight: 800, marginInlineStart: 4 }}>· current</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-4" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55 }}>
          Click any tier above to move {member.name.split(" ")[0]} into it. The change applies immediately — earn rate becomes the new tier's rate, the wallet card adopts the new tier colour, and the homepage rewards section reflects the new benefits.
        </p>
      </Card>

      {/* Security & password */}
      <Card title={<><Shield size={12} className="inline mr-1.5" /> Security &amp; password</>} className="mb-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <div>
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", fontWeight: 600 }}>
              {member.password
                ? <>Password set{member.passwordTemporary ? " · temporary" : ""}{member.passwordSetAt ? ` on ${new Date(member.passwordSetAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</>
                : "No password set yet"}
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 2 }}>
              Members log in to the LS Privilege portal with their email and password.
            </div>
          </div>
          {tempPw && (
            <div className="inline-flex items-center gap-2 p-2" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}` }}>
              <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>One-time password</span>
              <code style={{ color: p.textPrimary, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.86rem", fontWeight: 700 }}>{tempPw}</code>
              <button onClick={copyTempPassword} title="Copy" style={{ color: p.success, padding: 4 }}><Copy size={12} /></button>
            </div>
          )}
        </div>

        {pwMode === null && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPwMode("set")}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.accent}`, color: p.accent,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            ><Lock size={11} /> Set new password</button>
            <button onClick={generateTempPassword}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
            ><KeyRound size={11} /> Generate temporary password</button>
            <button onClick={sendResetLink}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`, color: p.textSecondary,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                opacity: member.email ? 1 : 0.55,
                cursor: member.email ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => { if (member.email) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
              onMouseLeave={(e) => { if (member.email) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
              disabled={!member.email}
            ><Send size={11} /> Send reset link</button>
          </div>
        )}

        {pwMode === "set" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <FormGroup label="New password">
              <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="flex-1 outline-none"
                  style={{
                    backgroundColor: "transparent", color: p.textPrimary,
                    padding: "0.6rem 0.75rem", fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: "0.88rem", border: "none", minWidth: 0,
                  }}
                />
                <button onClick={() => setShowPw((v) => !v)} title={showPw ? "Hide" : "Show"}
                  style={{ color: p.textMuted, padding: "0 12px", borderInlineStart: `1px solid ${p.border}` }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </FormGroup>
            <FormGroup label="Confirm new password">
              <TextField type={showPw ? "text" : "password"} value={confirmPw} onChange={setConfirmPw} placeholder="Re-enter" />
            </FormGroup>
            <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
              <PrimaryBtn onClick={setNewPassword} small><Save size={11} /> Save password</PrimaryBtn>
              <GhostBtn onClick={() => { setPwMode(null); setNewPw(""); setConfirmPw(""); }} small>Cancel</GhostBtn>
              {newPw && newPw.length < 6 && (
                <span style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                  Minimum 6 characters
                </span>
              )}
              {newPw && confirmPw && newPw !== confirmPw && (
                <span style={{ color: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                  Passwords don't match
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Bookings list */}
      <Card title={<><Calendar size={12} className="inline mr-1.5" /> Bookings ({memberBookings.length})</>} padded={false}
        action={<PrimaryBtn onClick={onBook} small><Plus size={11} /> New booking</PrimaryBtn>}
        className="mb-6"
      >
        {memberBookings.length === 0 ? (
          <div className="px-5 py-10 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
            No bookings on file for {member.name.split(" ")[0]}.
            <button onClick={onBook} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 8 }}>Book the first stay →</button>
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Suite</Th>
                <Th>Stay</Th>
                <Th align="end">Nights</Th>
                <Th align="end">Total</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
              </tr>
            </thead>
            <tbody>
              {memberBookings.map((b) => {
                const room = rooms.find((r) => r.id === b.roomId);
                const statusColor = b.status === "in-house" ? "#16A34A"
                  : b.status === "confirmed" ? "#2563EB"
                  : b.status === "cancelled" ? "#DC2626"
                  : "#64748B";
                const paymentColor = b.paymentStatus === "paid" ? "#16A34A"
                  : b.paymentStatus === "deposit" ? "#D97706"
                  : b.paymentStatus === "invoiced" ? "#2563EB"
                  : "#DC2626";
                return (
                  <tr key={b.id}>
                    <Td>
                      <div style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", fontWeight: 700 }}>{b.id}</div>
                      <div style={{ color: p.textMuted, fontSize: "0.66rem", letterSpacing: "0.05em", marginTop: 2 }}>{b.source || "direct"}</div>
                    </Td>
                    <Td>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", color: p.textPrimary }}>
                        {room ? t(`rooms.${room.id}.name`) : b.roomId}
                      </div>
                    </Td>
                    <Td muted>{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}</Td>
                    <Td align="end">{b.nights}</Td>
                    <Td align="end" className="font-semibold">{t("common.bhd")} {(b.total || 0).toLocaleString()}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5" style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px", color: statusColor, border: `1px solid ${statusColor}`, backgroundColor: `${statusColor}15`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: statusColor, display: "inline-block" }} />
                        {b.status}
                      </span>
                    </Td>
                    <Td>
                      <span style={{
                        fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        padding: "2px 8px", color: paymentColor, border: `1px solid ${paymentColor}`, backgroundColor: `${paymentColor}15`,
                      }}>
                        {b.paymentStatus}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      {/* Identity / KYC summary */}
      <Card title="Identity & KYC">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
          <ProfileRow label="Email"        value={member.email}        p={p} />
          <ProfileRow label="Phone"        value={member.phone}        p={p} />
          <ProfileRow label="Country"      value={member.country}      p={p} />
          <ProfileRow label="ID type"      value={(member.idType || "").toUpperCase()} p={p} />
          <ProfileRow label="ID number"    value={member.idNumber}     mono p={p} />
          <ProfileRow label="ID expiry"    value={member.idExpiry}     p={p} />
          <ProfileRow label="Member since" value={memberSinceLabel}    p={p} />
          <ProfileRow label="Verification" value={verified ? "Complete" : "Pending KYC"} color={verified ? p.success : p.warn} p={p} />
          <ProfileRow label="Photo"        value={member.photo ? "On file" : "Not uploaded"} p={p} />
          <ProfileRow label="ID document"  value={member.idDoc ? "On file" : "Not uploaded"} p={p} />
        </div>
      </Card>
    </Drawer>
  );
}

function ProfileRow({ label, value, mono, color, p }) {
  return (
    <div>
      <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{
        color: color || (value ? p.textPrimary : p.textDim),
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : "'Manrope', sans-serif",
        fontSize: "0.86rem", fontWeight: mono || color ? 700 : 500, marginTop: 4,
        wordBreak: "break-word",
      }}>{value || "—"}</div>
    </div>
  );
}
