import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BedDouble, Calendar as CalIcon, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Crown, Download,
  Edit2, Eye, FileText, Gift, Layers, Mail, Plus, Printer, Receipt, Save, Search, Send, Trash2, User as UserIcon, UserCheck, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import {
  useData, formatCurrency, GIFT_CARD_TIERS, computeGiftCardPrice,
  generateGiftCardCode,
} from "../../../../data/store.jsx";
import {
  Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  SelectField, Stat, TableShell, Td, Th, TextField,
} from "../ui.jsx";
import {
  GiftCardDocPreviewModal,
  downloadGiftCardDoc,
  printGiftCardDoc,
  emailGiftCardDoc,
} from "../GiftCardDocs.jsx";

// ---------------------------------------------------------------------------
// GiftCards — admin workspace for the gift-card pre-purchase programme.
//   • Stats strip — issued / redeemed / outstanding nights / face value
//   • Filterable list of every card
//   • Issue-card drawer (operator pays offline + records the issuance)
//   • Detail drawer with the redemption history and edit fields
// Live data comes from the giftCards slice in DataContext.
// ---------------------------------------------------------------------------

const STATUS_LABEL = {
  issued:    "Issued",
  redeemed:  "Redeemed",
  cancelled: "Cancelled",
  expired:   "Expired",
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
};
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};

const ROOM_LABEL_SHORT = { studio: "Studio", "one-bed": "One-Bed", "two-bed": "Two-Bed", "three-bed": "Three-Bed" };

// Quote-safely render the field for CSV. RFC4180 — wrap in double quotes,
// double up any embedded quote. Used by the Export CSV button to dump
// the currently-filtered list to a spreadsheet-friendly file.
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function exportGiftCardsCsv(cards) {
  if (!cards || cards.length === 0) {
    pushToast({ message: "Nothing to export — current filter is empty.", kind: "warn" });
    return;
  }
  const header = [
    "Code", "Card ID", "Status", "Tier", "Suite", "Total nights", "Used", "Remaining",
    "Discount %", "Rate / night", "Face value", "Paid amount",
    "Recipient name", "Recipient email", "Sender name", "Sender email",
    "Purchase date", "Valid until", "Message",
  ];
  const rows = cards.map((c) => ([
    c.code, c.id, c.status,
    (GIFT_CARD_TIERS.find((t) => t.id === c.tierId)?.label) || c.tierId || "—",
    ROOM_LABEL_SHORT[c.roomId] || c.roomId || "—",
    c.totalNights || 0, c.nightsUsed || 0, (c.totalNights || 0) - (c.nightsUsed || 0),
    c.discountPct || 0, c.ratePerNight || 0, c.faceValue || 0, c.paidAmount || 0,
    c.recipientName, c.recipientEmail, c.senderName, c.senderEmail,
    c.purchaseDate, c.validUntil, c.message,
  ]));
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gift-cards-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  pushToast({ message: `Exported ${cards.length} ${cards.length === 1 ? "card" : "cards"} to CSV.` });
}

export const GiftCards = () => {
  const p = usePalette();
  const { giftCards, issueGiftCard, updateGiftCard, removeGiftCard, rooms, invoices, payments, members } = useData();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search,       setSearch]       = useState("");
  const [creating,     setCreating]     = useState(false);
  const [viewing,      setViewing]      = useState(null);

  // Derived KPIs — single sweep over the slice so the strip stays cheap.
  // Outputs the headline numbers plus three derived collections used by
  // the secondary cards below (tier distribution, expiring soon, lifetime
  // liability).
  const stats = useMemo(() => {
    const now = Date.now();
    const ms30 = 30 * 24 * 3600 * 1000;
    const totalIssued    = giftCards.length;
    const totalNights    = giftCards.reduce((s, c) => s + (c.totalNights || 0), 0);
    const nightsUsed     = giftCards.reduce((s, c) => s + (c.nightsUsed || 0), 0);
    const nightsLeft     = Math.max(0, totalNights - nightsUsed);
    const facePaid       = giftCards.reduce((s, c) => s + (c.paidAmount || 0), 0);
    const activeCount    = giftCards.filter((c) => c.status === "issued").length;
    const redeemedCount  = giftCards.filter((c) => c.status === "redeemed").length;
    // Outstanding liability — the rack-rate value of nights still owed
    // back to recipients. This is the headline figure on the balance
    // sheet for unredeemed gift cards.
    const outstandingValue = giftCards.reduce((s, c) => {
      if (c.status !== "issued") return s;
      const remaining = (c.totalNights || 0) - (c.nightsUsed || 0);
      return s + (remaining * (c.ratePerNight || 0));
    }, 0);
    // Tier distribution — by night-tier id. Drives the small chart card.
    const byTier = GIFT_CARD_TIERS.map((t) => ({
      ...t,
      count: giftCards.filter((c) => c.tierId === t.id).length,
    }));
    // Cards expiring in the next 30 days (still issued, not redeemed).
    const expiringSoon = giftCards
      .filter((c) => c.status === "issued" && c.validUntil)
      .map((c) => ({ card: c, daysLeft: Math.ceil((new Date(c.validUntil).getTime() - now) / 86400000) }))
      .filter((x) => x.daysLeft >= 0 && x.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    // Lifetime by-suite breakdown — operators want to know which suite
    // type drives most gift-card revenue.
    const bySuite = ["studio", "one-bed", "two-bed", "three-bed"].map((id) => {
      const cards = giftCards.filter((c) => c.roomId === id);
      return {
        id,
        count: cards.length,
        nights: cards.reduce((s, c) => s + (c.totalNights || 0), 0),
        revenue: cards.reduce((s, c) => s + (c.paidAmount || 0), 0),
      };
    });
    // Redemption rate — what % of total issued nights have actually been
    // redeemed. Headline KPI for marketing's gift-card programme.
    const redemptionRate = totalNights > 0 ? Math.round((nightsUsed / totalNights) * 100) : 0;
    return {
      totalIssued, totalNights, nightsUsed, nightsLeft, facePaid,
      activeCount, redeemedCount, outstandingValue,
      byTier, bySuite, expiringSoon, redemptionRate,
    };
  }, [giftCards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return giftCards.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (!q) return true;
      return [c.code, c.recipientName, c.recipientEmail, c.senderName, c.senderEmail, c.id]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    }).slice().sort((a, b) => String(b.purchaseDate || "").localeCompare(String(a.purchaseDate || "")));
  }, [giftCards, filterStatus, search]);

  return (
    <div>
      <PageHeader
        title="Gift Cards"
        intro="Advance-purchase night packs. Each card represents N nights at a specific suite type, sold at a tiered bulk discount. Track issuance, redemption, and the outstanding liability — every card flows live from the same store the public Gift Vouchers page writes to."
        action={
          <PrimaryBtn onClick={() => setCreating(true)}>
            <Plus size={12} /> Issue card
          </PrimaryBtn>
        }
      />

      {/* KPI strip — primary headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Stat label="Active cards"        value={stats.activeCount} hint={`${stats.totalIssued} issued lifetime`} color={p.accent} />
        <Stat label="Outstanding nights"  value={stats.nightsLeft}  hint={`${stats.nightsUsed} redeemed · ${stats.redemptionRate}% redemption`} color={stats.nightsLeft > 0 ? p.warn : p.success} />
        <Stat label="Outstanding liability" value={formatCurrency(stats.outstandingValue)} hint="Rack value of unredeemed nights" color={stats.outstandingValue > 0 ? p.warn : p.success} />
        <Stat label="Revenue collected"   value={formatCurrency(stats.facePaid)} hint={`${stats.redeemedCount} fully consumed`} />
      </div>

      {/* Secondary KPI strip — tier distribution + expiring + per-suite revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        {/* Tier distribution */}
        <Card title="Tier mix" padded>
          {stats.totalIssued === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.82rem" }}>No cards issued yet.</div>
          ) : (
            <div className="space-y-2">
              {stats.byTier.map((t) => {
                const pct = stats.totalIssued > 0 ? Math.round((t.count / stats.totalIssued) * 100) : 0;
                return (
                  <div key={t.id}>
                    <div className="flex items-center justify-between" style={{ fontSize: "0.74rem", fontFamily: "'Manrope', sans-serif" }}>
                      <span style={{ color: p.textSecondary }}>{t.nights}n · {t.discountPct}% — {t.label}</span>
                      <span style={{ color: p.textPrimary, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
                    </div>
                    <div className="mt-1" style={{ height: 4, backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                      <div style={{ width: `${pct}%`, height: "100%", backgroundColor: p.accent }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Expiring within 30 days */}
        <Card title={`Expiring · ${stats.expiringSoon.length}`} padded>
          {stats.expiringSoon.length === 0 ? (
            <div className="flex items-start gap-2" style={{ color: p.textMuted, fontSize: "0.82rem" }}>
              <CheckCircle2 size={14} style={{ color: p.success, flexShrink: 0, marginTop: 2 }} />
              <span>No cards expiring in the next 30 days.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.expiringSoon.slice(0, 4).map((x) => {
                const colour = x.daysLeft <= 7 ? p.danger : x.daysLeft <= 14 ? p.warn : p.textMuted;
                return (
                  <button key={x.card.id}
                    onClick={() => setViewing(x.card)}
                    className="w-full text-start p-2 transition-colors"
                    style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.72rem", color: p.accent, fontWeight: 600 }}>{x.card.code}</code>
                      <span style={{ color: colour, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                        {x.daysLeft === 0 ? "Today" : x.daysLeft === 1 ? "1 day" : `${x.daysLeft} days`}
                      </span>
                    </div>
                    <div style={{ color: p.textPrimary, fontSize: "0.78rem", marginTop: 2 }}>{x.card.recipientName} · {(x.card.totalNights || 0) - (x.card.nightsUsed || 0)} nights left</div>
                  </button>
                );
              })}
              {stats.expiringSoon.length > 4 && (
                <div style={{ color: p.textMuted, fontSize: "0.72rem", textAlign: "center", marginTop: 6 }}>
                  + {stats.expiringSoon.length - 4} more
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Per-suite revenue */}
        <Card title="By suite type" padded>
          {stats.totalIssued === 0 ? (
            <div style={{ color: p.textMuted, fontSize: "0.82rem" }}>No cards issued yet.</div>
          ) : (
            <div className="space-y-2">
              {stats.bySuite.filter((s) => s.count > 0).map((s) => (
                <div key={s.id} className="flex items-center justify-between" style={{ fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <BedDouble size={12} style={{ color: p.accent, flexShrink: 0 }} />
                    <span style={{ color: p.textSecondary }}>{ROOM_LABEL_SHORT[s.id]}</span>
                    <span style={{ color: p.textMuted, fontSize: "0.7rem" }}>· {s.count} cards · {s.nights}n</span>
                  </div>
                  <span style={{ color: p.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(s.revenue)}</span>
                </div>
              ))}
              {stats.bySuite.every((s) => s.count === 0) && (
                <div style={{ color: p.textMuted, fontSize: "0.82rem" }}>No revenue yet.</div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Filter bar */}
      <Card padded={false} className="mb-4">
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2 flex-1 min-w-[220px]" style={{
            border: `1px solid ${p.border}`,
            padding: "0.4rem 0.7rem",
            backgroundColor: p.inputBg,
          }}>
            <Search size={13} style={{ color: p.textMuted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code · recipient · sender"
              className="w-full outline-none"
              style={{ backgroundColor: "transparent", color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}
            />
          </div>
          <SelectField
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "all",       label: "All statuses" },
              { value: "issued",    label: "Issued (active)" },
              { value: "redeemed",  label: "Redeemed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "expired",   label: "Expired" },
            ]}
          />
          <GhostBtn small onClick={() => exportGiftCardsCsv(filtered)}>
            <Download size={11} /> Export CSV
          </GhostBtn>
        </div>
        <TableShell>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Recipient</Th>
              <Th>Suite · Tier</Th>
              <Th align="end">Nights (used / total)</Th>
              <Th align="end">Discount</Th>
              <Th align="end">Paid</Th>
              <Th>Purchase</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><Td className="px-4 py-6" align="center" muted colSpan={9}>No gift cards match this filter.</Td></tr>
            )}
            {filtered.map((c) => {
              const remaining = (c.totalNights || 0) - (c.nightsUsed || 0);
              const sc = c.status === "issued" ? p.success : c.status === "redeemed" ? p.textMuted : c.status === "cancelled" ? p.danger : p.warn;
              return (
                <tr key={c.id}
                  style={{ borderTop: `1px solid ${p.border}`, cursor: "pointer", transition: "background-color 120ms" }}
                  onClick={() => setViewing(c)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = p.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Td>
                    <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.78rem", color: p.accent, fontWeight: 600, letterSpacing: "0.04em" }}>{c.code}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 2 }}>{c.id}</div>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600, fontSize: "0.86rem" }}>{c.recipientName || "—"}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{c.recipientEmail || ""}</div>
                  </Td>
                  <Td muted>
                    <div>{ROOM_LABEL_SHORT[c.roomId] || c.roomId}</div>
                    <div style={{ fontSize: "0.7rem", marginTop: 2 }}>
                      {(GIFT_CARD_TIERS.find((t) => t.id === c.tierId)?.label) || `${c.totalNights}-night`}
                    </div>
                  </Td>
                  <Td align="end">
                    <strong style={{ color: p.textPrimary }}>{c.nightsUsed || 0}</strong>
                    <span style={{ color: p.textMuted }}> / {c.totalNights || 0}</span>
                    {remaining > 0 && c.status === "issued" && (
                      <div style={{ color: p.success, fontSize: "0.7rem", marginTop: 2 }}>{remaining} left</div>
                    )}
                  </Td>
                  <Td align="end" muted>{c.discountPct}%</Td>
                  <Td align="end" style={{ color: p.accent, fontWeight: 600 }}>{formatCurrency(c.paidAmount)}</Td>
                  <Td muted style={{ whiteSpace: "nowrap" }}>{fmtDate(c.purchaseDate)}</Td>
                  <Td>
                    <span style={{
                      color: sc, border: `1px solid ${sc}`, padding: "2px 7px",
                      fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    }}>{STATUS_LABEL[c.status] || c.status}</span>
                  </Td>
                  <Td>
                    <ChevronRight size={14} style={{ color: p.textMuted }} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      {creating && (
        <GiftCardCreator
          p={p}
          rooms={rooms}
          existing={giftCards}
          members={members || []}
          onClose={() => setCreating(false)}
          onCreate={(payload, opts) => {
            // issueGiftCard creates the card AND posts the matching
            // invoice + payment receipt, so the operator sees the full
            // accounting trail without separate steps.
            const saved = issueGiftCard(payload, opts);
            setCreating(false);
            if (saved) {
              pushToast({ message: `Gift card ${saved.code} issued · invoice + receipt posted.` });
              setViewing(saved);
            }
          }}
        />
      )}

      {viewing && (
        <GiftCardDetail
          p={p}
          card={viewing}
          onClose={() => setViewing(null)}
          onUpdate={(patch) => updateGiftCard(viewing.id, patch)}
          onRemove={() => {
            if (!confirm(`Remove gift card ${viewing.code}? This cannot be undone and any unredeemed nights are forfeit.`)) return;
            removeGiftCard(viewing.id);
            setViewing(null);
            pushToast({ message: "Gift card removed.", kind: "warn" });
          }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Creator drawer — used by admin to record offline-sold cards (corporate
// bulk, walk-up gifting). Same shape as the public composer; the
// difference is that admin can set the recipient + sender manually and
// optionally pre-pick a custom paid amount when invoicing offline.
// ─────────────────────────────────────────────────────────────────────────
function GiftCardCreator({ p, rooms, existing, members, onClose, onCreate }) {
  const defaultRoomId = rooms?.find((r) => r.id === "one-bed")?.id || rooms?.[0]?.id || "studio";
  // Gift cards are member-only — both the recipient AND the buyer must
  // be LS Privilege members. We carry the picked member ids; the
  // denormalised name + email used on the printable docs are derived at
  // save time from the chosen member records.
  const [draft, setDraft] = useState({
    tierId: "10n",
    roomId: defaultRoomId,
    recipientMemberId: "",
    senderMemberId:    "",
    message: "",
    notes: "",                       // operator-only notes
    delivery: "email",
    deliverOn: "",
    overridePaid: "",                // optional manual override of the computed net price
    paymentMethod: "card",
    purchaseDate: new Date().toISOString().slice(0, 10),
    validityDays:  "",               // optional override of default 365
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const recipientMember = useMemo(() => (members || []).find((m) => m.id === draft.recipientMemberId), [members, draft.recipientMemberId]);
  const senderMember    = useMemo(() => (members || []).find((m) => m.id === draft.senderMemberId), [members, draft.senderMemberId]);

  const room = useMemo(() => (rooms || []).find((r) => r.id === draft.roomId) || rooms?.[0], [rooms, draft.roomId]);
  const tier = useMemo(() => GIFT_CARD_TIERS.find((t) => t.id === draft.tierId) || GIFT_CARD_TIERS[0], [draft.tierId]);
  const price = useMemo(
    () => computeGiftCardPrice({ nights: tier.nights, discountPct: tier.discountPct, ratePerNight: room?.price || 0 }),
    [tier, room]
  );
  // Compute the matching validity end-date for the price-rail preview.
  // 365-day default unless the operator overrode it.
  const validUntilPreview = useMemo(() => {
    const days = Math.max(1, Math.min(3650, Number(draft.validityDays) || 365));
    const d = new Date(draft.purchaseDate || new Date().toISOString().slice(0, 10));
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, [draft.purchaseDate, draft.validityDays]);
  // Average price per night after discount — surfaced in the rail so
  // the operator can quote a "from BHD X / night" headline to the buyer.
  const perNight = tier.nights > 0 ? price.net / tier.nights : 0;
  // Preview the code so the operator knows what will land on the card
  // before they hit Save. Regenerated on each save so concurrent
  // operators don't collide.
  const previewCode = useMemo(() => generateGiftCardCode(existing), []);

  // Validation — both sides must be picked members. Gift cards are
  // member-only, so a free-text name doesn't count.
  const sameMember = !!draft.recipientMemberId && draft.recipientMemberId === draft.senderMemberId;
  const valid = !!recipientMember && !!senderMember && !sameMember;

  const save = () => {
    if (!recipientMember) { pushToast({ message: "Pick a recipient member.", kind: "warn" }); return; }
    if (!senderMember)    { pushToast({ message: "Pick a sender (buyer) member.", kind: "warn" }); return; }
    if (sameMember)       { pushToast({ message: "Recipient and sender must be different members.", kind: "warn" }); return; }
    const purchaseISO = draft.purchaseDate || new Date().toISOString().slice(0, 10);
    const validity = Math.max(1, Math.min(3650, Number(draft.validityDays) || 365));
    const validUntil = (() => {
      const d = new Date(purchaseISO);
      d.setDate(d.getDate() + validity);
      return d.toISOString().slice(0, 10);
    })();
    onCreate({
      tierId: tier.id,
      roomId: room.id,
      totalNights: tier.nights,
      discountPct: tier.discountPct,
      ratePerNight: room?.price || 0,
      faceValue: price.gross,
      paidAmount: draft.overridePaid ? Number(draft.overridePaid) : price.net,
      // Canonical pointers to the loyalty records — drives downstream
      // member-history rollups, redemption gating, and tier-aware
      // statement views. Name/email fields below stay denormalised so
      // printable docs render without an additional join.
      recipientMemberId: recipientMember.id,
      recipientName:     recipientMember.name,
      recipientEmail:    recipientMember.email,
      senderMemberId:    senderMember.id,
      senderName:        senderMember.name,
      senderEmail:       senderMember.email,
      message:        draft.message.trim(),
      notes:          draft.notes.trim(),
      delivery:       draft.delivery,
      deliverOn:      draft.deliverOn || null,
      purchaseDate:   purchaseISO,
      validUntil,
    }, { paymentMethod: draft.paymentMethod || "card" });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Gift card"
      title="Issue a card"
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={11} /> Issue card · {formatCurrency(draft.overridePaid ? Number(draft.overridePaid) : price.net)}</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* ─── Form column ──────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Suite picker — visual cards. Operator sees rack rate +
              the per-night cost dropping as the discount tier deepens. */}
          <Card title="Suite type">
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
              The card is issued for one suite type — the recipient redeems against the same type. Studios let you gift more nights for less; the Three-Bedroom is a premium gift.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {(rooms || []).map((r) => {
                const sel = draft.roomId === r.id;
                return (
                  <button key={r.id}
                    onClick={() => set({ roomId: r.id })}
                    className="text-start p-3 transition-colors"
                    style={{
                      backgroundColor: sel ? p.bgHover : p.bgPanel,
                      border: `1px solid ${sel ? p.accent : p.border}`,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.borderColor = p.accent; }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.borderColor = p.border; }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <BedDouble size={14} style={{ color: p.accent, flexShrink: 0 }} />
                      {sel && <Check size={13} style={{ color: p.accent }} />}
                    </div>
                    <div className="mt-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.15 }}>
                      {ROOM_LABEL_SHORT[r.id] || r.id}
                    </div>
                    <div className="mt-1" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
                      Rack {formatCurrency(r.price)}/n
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Tier picker — visual cards with per-tier net price computed
              against the selected suite's rack rate. */}
          <Card title="Night tier">
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
              Six preset tiers. The discount stacks the more nights you buy. Each tier shows the price for the currently picked suite.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {GIFT_CARD_TIERS.map((t) => {
                const sel = draft.tierId === t.id;
                const tp  = computeGiftCardPrice({ nights: t.nights, discountPct: t.discountPct, ratePerNight: room?.price || 0 });
                return (
                  <button key={t.id}
                    onClick={() => set({ tierId: t.id })}
                    className="text-start p-3 transition-colors"
                    style={{
                      backgroundColor: sel ? p.bgHover : p.bgPanel,
                      border: `1px solid ${sel ? p.accent : p.border}`,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.borderColor = p.accent; }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.borderColor = p.border; }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1 }}>
                        {t.nights}<span style={{ fontSize: "0.74rem", color: p.textMuted, fontStyle: "italic", marginInlineStart: 4 }}>nights</span>
                      </span>
                      <span style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, padding: "2px 6px", border: `1px solid ${p.accent}` }}>
                        − {t.discountPct}%
                      </span>
                    </div>
                    <div className="mt-1" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                      {t.label}
                    </div>
                    <div className="mt-2 pt-2 flex items-baseline justify-between" style={{ borderTop: `1px solid ${p.border}` }}>
                      <span style={{ color: p.textMuted, fontSize: "0.7rem", textDecoration: "line-through" }}>{formatCurrency(tp.gross)}</span>
                      <span style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 500 }}>
                        {formatCurrency(tp.net)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Recipient — LS Privilege member only */}
          <Card title="Recipient">
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
              Gift cards are issued to <strong style={{ color: p.textPrimary }}>LS Privilege members</strong> only. Pick the recipient from the member directory. If they're not a member yet, enrol them in <em>Loyalty</em> first.
            </p>
            <MemberPicker
              p={p}
              label="Recipient"
              members={members}
              value={draft.recipientMemberId}
              excludeId={draft.senderMemberId}
              onChange={(id) => set({ recipientMemberId: id })}
              placeholder="Pick the member who'll receive the prepaid nights"
            />
          </Card>

          {/* Sender (buyer) — also member-only */}
          <Card title="Sender (buyer)">
            <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
              Admin can issue on behalf of any member buying the gift. The buyer must be a different member from the recipient.
            </p>
            <MemberPicker
              p={p}
              label="Sender"
              members={members}
              value={draft.senderMemberId}
              excludeId={draft.recipientMemberId}
              onChange={(id) => set({ senderMemberId: id })}
              placeholder="Pick the member paying for the card"
            />
            {sameMember && (
              <div className="mt-2 px-3 py-2" style={{ backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`, color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                Sender and recipient can't be the same member.
              </div>
            )}
          </Card>

          {/* Pricing + accounting */}
          <Card title="Pricing & payment">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Override paid amount (optional)">
                <TextField
                  type="number"
                  value={draft.overridePaid}
                  onChange={(v) => set({ overridePaid: v })}
                  placeholder={`Defaults to ${formatCurrency(price.net)}`}
                />
              </FormGroup>
              <FormGroup label="Payment method">
                <SelectField
                  value={draft.paymentMethod}
                  onChange={(v) => set({ paymentMethod: v })}
                  options={[
                    { value: "card",        label: "Card" },
                    { value: "benefit-pay", label: "Benefit Pay" },
                    { value: "transfer",    label: "Bank transfer" },
                    { value: "cash",        label: "Cash" },
                  ]}
                />
              </FormGroup>
            </div>
            <div className="mt-4 px-3 py-2" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}40` }}>
              <div style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Accounting</div>
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
                Issuing creates the card AND posts a matching invoice (kind: gift_card) + payment receipt for the buyer. Both records reference the card via giftCardId so the folio links across modules.
              </div>
            </div>
          </Card>

          {/* Delivery / message / notes */}
          <Card title="Delivery, message & validity">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Format">
                <SelectField
                  value={draft.delivery}
                  onChange={(v) => set({ delivery: v })}
                  options={[
                    { value: "email", label: "Email PDF" },
                    { value: "print", label: "Printed certificate" },
                  ]}
                />
              </FormGroup>
              <FormGroup label="Deliver on (optional)">
                <TextField type="date" value={draft.deliverOn} onChange={(v) => set({ deliverOn: v })} />
              </FormGroup>
              <FormGroup label="Purchase date">
                <TextField type="date" value={draft.purchaseDate} onChange={(v) => set({ purchaseDate: v })} />
              </FormGroup>
              <FormGroup label="Validity (days, default 365)">
                <TextField
                  type="number"
                  value={draft.validityDays}
                  onChange={(v) => set({ validityDays: v })}
                  placeholder="365"
                />
              </FormGroup>
              <div className="sm:col-span-2">
                <FormGroup label="Personal message (printed on certificate)">
                  <textarea
                    value={draft.message}
                    onChange={(e) => set({ message: e.target.value })}
                    rows={3}
                    placeholder="A line or two — included on the printed certificate or above the PDF."
                    className="w-full"
                    style={{
                      backgroundColor: p.inputBg, color: p.textPrimary,
                      border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                      lineHeight: 1.5, resize: "vertical",
                    }}
                  />
                </FormGroup>
              </div>
              <div className="sm:col-span-2">
                <FormGroup label="Internal notes (operator-only · never shown to buyer/recipient)">
                  <textarea
                    value={draft.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    rows={2}
                    placeholder="Channel, special handling, refund authorisations, etc."
                    className="w-full"
                    style={{
                      backgroundColor: p.inputBg, color: p.textPrimary,
                      border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                      lineHeight: 1.5, resize: "vertical",
                    }}
                  />
                </FormGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* ─── Sticky pricing rail ─────────────────────────────────── */}
        <div>
          <div className="lg:sticky lg:top-4 space-y-4">
            <Card padded={false}>
              <div className="px-5 py-4" style={{ borderBottom: `1px solid ${p.border}` }}>
                <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
                  Card preview
                </div>
                <div className="mt-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
                  {tier.nights} nights · {ROOM_LABEL_SHORT[room?.id] || room?.id}
                </div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4 }}>
                  {tier.label} · {tier.discountPct}% buyer discount
                </div>
              </div>
              <div className="px-5 py-4 space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
                <RailRow p={p} label={`Rack · ${tier.nights} × ${formatCurrency(room?.price || 0)}`} value={formatCurrency(price.gross)} muted />
                <RailRow p={p} label={`Discount · ${tier.discountPct}%`} value={`− ${formatCurrency(price.discount)}`} accent={p.success} />
                <div style={{ height: 1, backgroundColor: p.border, margin: "6px 0" }} />
                <RailRow p={p} label="Net to buyer" value={formatCurrency(price.net)} bold accent={p.accent} />
                {draft.overridePaid && Number(draft.overridePaid) !== price.net && (
                  <RailRow p={p} label="Override paid" value={formatCurrency(Number(draft.overridePaid))} accent={p.warn} />
                )}
                <div style={{ color: p.textMuted, fontSize: "0.72rem", textAlign: "right", marginTop: 4 }}>
                  ≈ {formatCurrency(perNight)} / night
                </div>
              </div>
            </Card>

            {/* Card metadata preview */}
            <Card padded>
              <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                Card metadata
              </div>
              <div className="mt-3 space-y-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
                <div>
                  <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>Code preview</div>
                  <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.92rem", color: p.accent, letterSpacing: "0.04em", fontWeight: 600 }}>{previewCode}</code>
                  <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2, lineHeight: 1.5 }}>
                    Collision-checked; regenerated on Save to avoid concurrent clashes.
                  </div>
                </div>
                <div style={{ height: 1, backgroundColor: p.border, margin: "6px 0" }} />
                <RailRow p={p} label="Purchase date" value={fmtDate(draft.purchaseDate)} />
                <RailRow p={p} label="Valid until"   value={fmtDate(validUntilPreview)} />
                <RailRow p={p} label="Delivery"      value={draft.delivery === "email" ? "Email PDF" : "Printed certificate"} />
                {draft.deliverOn && <RailRow p={p} label="Deliver on" value={fmtDate(draft.deliverOn)} />}
              </div>
            </Card>

            {/* Validation summary */}
            {!valid && (
              <Card padded>
                <div className="flex items-start gap-2" style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.55 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>Recipient and sender names are required before you can issue the card. Email is optional but recommended for delivery.</span>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// Right-rail single line — label on the left, value on the right.
// `bold` toggles the headline total weight; `accent` overrides the value
// colour for discount + override-paid lines so the eye lands on changes.
function RailRow({ p, label, value, bold = false, accent, muted = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: muted ? p.textMuted : p.textSecondary }}>{label}</span>
      <span style={{
        color: accent || (bold ? p.textPrimary : p.textPrimary),
        fontWeight: bold ? 700 : 600,
        fontVariantNumeric: "tabular-nums",
        fontFamily: bold ? "'Cormorant Garamond', serif" : "'Manrope', sans-serif",
        fontSize: bold ? "1.4rem" : "0.86rem",
      }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Detail drawer — view + edit a single card, see redemption history,
// cancel/expire if needed, copy the code to share.
// ─────────────────────────────────────────────────────────────────────────
function GiftCardDetail({ p, card, onClose, onUpdate, onRemove }) {
  const { invoices, payments, hotelInfo, members } = useData();
  const [draft, setDraft] = useState(card);
  // Which doc to preview — null hides the modal, "invoice" / "receipt"
  // pops the matching GiftCardDocPreviewModal.
  const [previewKind, setPreviewKind] = useState(null);
  useEffect(() => { setDraft(card); }, [card.id]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(card);

  const remaining = (card.totalNights || 0) - (card.nightsUsed || 0);
  const tier = GIFT_CARD_TIERS.find((t) => t.id === card.tierId);
  const sc = card.status === "issued" ? p.success : card.status === "redeemed" ? p.textMuted : card.status === "cancelled" ? p.danger : p.warn;
  const history = Array.isArray(card.redemptionHistory) ? card.redemptionHistory : [];

  // Match the invoice + payment records that issueGiftCard posted
  // alongside this card. Used by the docs panel below.
  const invoice = (invoices || []).find((i) => i.giftCardId === card.id || i.giftCardCode === card.code) || null;
  const payment = (payments || []).find((py) => py.giftCardId === card.id || py.giftCardCode === card.code) || null;

  const copyCode = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(card.code);
    pushToast({ message: `Copied ${card.code} to clipboard.` });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`Gift card · ${card.id}`}
      title={`${card.recipientName} · ${card.totalNights} nights`}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          <GhostBtn onClick={onRemove} small danger><Trash2 size={11} /> Remove</GhostBtn>
          <GhostBtn onClick={onClose} small>Close</GhostBtn>
          {dirty && (
            <PrimaryBtn onClick={() => { onUpdate(draft); pushToast({ message: "Card updated" }); }} small><Save size={11} /> Save</PrimaryBtn>
          )}
        </>
      }
    >
      <Card padded={false}>
        <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div>
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Code
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "1.1rem", color: p.textPrimary, letterSpacing: "0.06em", fontWeight: 600 }}>
                {card.code}
              </code>
              <button
                onClick={copyCode}
                style={{
                  color: p.textMuted, padding: "0.3rem 0.7rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  border: `1px solid ${p.border}`, backgroundColor: "transparent", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
              ><Copy size={10} /> Copy</button>
            </div>
          </div>
          <span style={{
            color: sc, border: `1px solid ${sc}`, padding: "4px 10px",
            fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          }}>{STATUS_LABEL[card.status] || card.status}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ backgroundColor: p.border }}>
          <DetailStat p={p} label="Nights total"   value={card.totalNights || 0} />
          <DetailStat p={p} label="Used"            value={card.nightsUsed || 0} accent={p.warn} />
          <DetailStat p={p} label="Remaining"       value={remaining}            accent={remaining > 0 ? p.success : p.textMuted} />
          <DetailStat p={p} label="Paid"            value={formatCurrency(card.paidAmount)} accent={p.accent} />
        </div>
      </Card>

      <Card title="Card details" className="mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormGroup label="Suite type">
            <SelectField
              value={draft.roomId || card.roomId}
              onChange={(v) => set({ roomId: v })}
              options={[
                { value: "studio",    label: "Lodge Studio" },
                { value: "one-bed",   label: "One-Bedroom Suite" },
                { value: "two-bed",   label: "Two-Bedroom Suite" },
                { value: "three-bed", label: "Three-Bedroom Suite" },
              ]}
            />
          </FormGroup>
          <FormGroup label="Tier">
            <SelectField
              value={draft.tierId || card.tierId}
              onChange={(v) => set({ tierId: v })}
              options={GIFT_CARD_TIERS.map((t) => ({
                value: t.id,
                label: `${t.nights}n · ${t.discountPct}% · ${t.label}`,
              }))}
            />
          </FormGroup>
          <FormGroup label="Status">
            <SelectField
              value={draft.status || card.status}
              onChange={(v) => set({ status: v })}
              options={[
                { value: "issued",    label: "Issued (active)" },
                { value: "redeemed",  label: "Redeemed (no balance)" },
                { value: "cancelled", label: "Cancelled (void)" },
                { value: "expired",   label: "Expired (validity lapsed)" },
              ]}
            />
          </FormGroup>
          <FormGroup label="Valid until">
            <TextField type="date" value={draft.validUntil || ""} onChange={(v) => set({ validUntil: v })} />
          </FormGroup>
        </div>
      </Card>

      <Card title="Recipient & sender" className="mt-5">
        <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", lineHeight: 1.55, marginBottom: 12 }}>
          Both sides are LS Privilege members. Pick a different member to reassign the card; the printable invoice + receipt will refresh on the next render.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 6 }}>
              Recipient
            </div>
            <MemberPicker
              p={p}
              label="Recipient"
              members={members}
              value={draft.recipientMemberId || ""}
              excludeId={draft.senderMemberId}
              onChange={(id) => {
                const m = (members || []).find((x) => x.id === id);
                set({
                  recipientMemberId: id,
                  recipientName:     m?.name  || draft.recipientName,
                  recipientEmail:    m?.email || draft.recipientEmail,
                });
              }}
              placeholder="Pick a recipient member"
            />
          </div>
          <div>
            <div style={{ color: p.textMuted, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Manrope', sans-serif", fontWeight: 700, marginBottom: 6 }}>
              Sender (buyer)
            </div>
            <MemberPicker
              p={p}
              label="Sender"
              members={members}
              value={draft.senderMemberId || ""}
              excludeId={draft.recipientMemberId}
              onChange={(id) => {
                const m = (members || []).find((x) => x.id === id);
                set({
                  senderMemberId: id,
                  senderName:     m?.name  || draft.senderName,
                  senderEmail:    m?.email || draft.senderEmail,
                });
              }}
              placeholder="Pick a sender member"
            />
          </div>
          {/* Fallback editable fields for legacy cards that don't have a
              member id stamped yet. Helpful when the operator migrates
              an old free-text card into the new model. */}
          {(!draft.recipientMemberId || !draft.senderMemberId) && (
            <div className="lg:col-span-2 px-3 py-2" style={{ backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40` }}>
              <div style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Legacy free-text fields</div>
              <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
                This card was created before the member-only model and still carries free-text recipient/sender. Pick a member above to upgrade it. The current text values are below for reference and can be edited until a member is picked.
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!draft.recipientMemberId && (
                  <>
                    <FormGroup label="Recipient name (legacy)">
                      <TextField value={draft.recipientName || ""} onChange={(v) => set({ recipientName: v })} />
                    </FormGroup>
                    <FormGroup label="Recipient email (legacy)">
                      <TextField type="email" value={draft.recipientEmail || ""} onChange={(v) => set({ recipientEmail: v })} />
                    </FormGroup>
                  </>
                )}
                {!draft.senderMemberId && (
                  <>
                    <FormGroup label="Sender name (legacy)">
                      <TextField value={draft.senderName || ""} onChange={(v) => set({ senderName: v })} />
                    </FormGroup>
                    <FormGroup label="Sender email (legacy)">
                      <TextField type="email" value={draft.senderEmail || ""} onChange={(v) => set({ senderEmail: v })} />
                    </FormGroup>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="lg:col-span-2">
            <FormGroup label="Personal message">
              <textarea
                value={draft.message || ""}
                onChange={(e) => set({ message: e.target.value })}
                rows={3}
                className="w-full"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                  lineHeight: 1.5, resize: "vertical",
                }}
              />
            </FormGroup>
          </div>
          <div className="lg:col-span-2">
            <FormGroup label="Internal notes">
              <textarea
                value={draft.notes || ""}
                onChange={(e) => set({ notes: e.target.value })}
                rows={2}
                className="w-full"
                placeholder="Operator-only — payment reference, channel, special handling…"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary,
                  border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem",
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
                  lineHeight: 1.5, resize: "vertical",
                }}
              />
            </FormGroup>
          </div>
        </div>
      </Card>

      {/* Accounting docs — invoice + receipt for the buyer's purchase.
          Both are posted automatically when the card is issued via
          issueGiftCard. The buttons preview, download (HTML), print
          (browser print → Save as PDF), or email the doc to the buyer. */}
      <Card title="Invoice & receipt" className="mt-5">
        <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
          The buyer's purchase is recorded in two ledgers — an invoice (what they owed) and a payment receipt (proof of capture). Both are linked to this card by id and surface in the main <strong>Invoices</strong> + <strong>Payments</strong> admin sections too.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <DocRow
            p={p}
            kind="invoice"
            label="Invoice"
            refId={invoice?.id}
            amount={invoice?.amount ?? card.paidAmount}
            issuedDate={invoice?.issued ?? card.purchaseDate}
            status={invoice ? (invoice.status || "issued") : "missing"}
            onPreview={() => setPreviewKind("invoice")}
            onDownload={() => downloadGiftCardDoc(card, "invoice", { hotel: hotelInfo, invoice, payment })}
            onPrint={() => printGiftCardDoc(card, "invoice", { hotel: hotelInfo, invoice, payment })}
            onEmail={() => emailGiftCardDoc(card, "invoice", hotelInfo)}
          />
          <DocRow
            p={p}
            kind="receipt"
            label="Payment receipt"
            refId={payment?.id}
            amount={payment?.amount ?? card.paidAmount}
            issuedDate={payment?.ts ?? card.purchaseDate}
            status={payment ? (payment.status || "captured") : "missing"}
            extra={payment?.method ? `Method: ${(payment.method || "").charAt(0).toUpperCase() + (payment.method || "").slice(1)}` : null}
            onPreview={() => setPreviewKind("receipt")}
            onDownload={() => downloadGiftCardDoc(card, "receipt", { hotel: hotelInfo, invoice, payment })}
            onPrint={() => printGiftCardDoc(card, "receipt", { hotel: hotelInfo, invoice, payment })}
            onEmail={() => emailGiftCardDoc(card, "receipt", hotelInfo)}
          />
        </div>
      </Card>

      <Card title={`Redemption history · ${history.length}`} padded={false} className="mt-5">
        {history.length === 0 ? (
          <div className="px-5 py-6" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
            No redemptions yet. As the recipient redeems prepaid nights at booking, entries appear here with the booking id, date, nights consumed, and saving.
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Redeemed at</Th>
                <Th align="end">Nights</Th>
                <Th align="end">Saving</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${p.border}` }}>
                  <Td><code style={{ fontFamily: "ui-monospace, Menlo, monospace", color: p.accent, fontSize: "0.78rem" }}>{h.bookingId || "—"}</code></Td>
                  <Td muted>{fmtDateTime(h.redeemedAt)}</Td>
                  <Td align="end" style={{ color: p.textPrimary, fontWeight: 600 }}>{h.nights}</Td>
                  <Td align="end" style={{ color: p.success, fontWeight: 600 }}>{formatCurrency(h.savings)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {previewKind && (
        <GiftCardDocPreviewModal
          card={card}
          kind={previewKind}
          onClose={() => setPreviewKind(null)}
        />
      )}
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DocRow — invoice / receipt card with Preview · Download · Print · Email.
// Mirrors the BookingDocs row visual so the operator sees a consistent
// affordance across the system. `status` is rendered as a small pill in
// the success colour when present, warning colour when the doc record is
// missing (which would be the case for legacy cards issued before the
// auto-accounting wiring landed).
// ─────────────────────────────────────────────────────────────────────────
function DocRow({ p, kind, label, refId, amount, issuedDate, status, extra, onPreview, onDownload, onPrint, onEmail }) {
  const isMissing = status === "missing";
  const sc = isMissing ? p.warn : p.success;
  const Icon = kind === "receipt" ? Receipt : FileText;
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span style={{
            width: 36, height: 36, flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            backgroundColor: `${p.accent}1A`, border: `1px solid ${p.accent}`,
            color: p.accent,
          }}>
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", fontWeight: 600 }}>{label}</div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.7rem", color: p.accent, letterSpacing: "0.04em", fontWeight: 600 }}>{refId || "Generated on demand"}</code>
              <span style={{ color: sc, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "2px 7px", border: `1px solid ${sc}` }}>
                {isMissing ? "On demand" : status}
              </span>
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 4 }}>
              {fmtDate(issuedDate)} · <strong style={{ color: p.textPrimary }}>{formatCurrency(amount)}</strong>
              {extra ? <> · {extra}</> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <DocActionBtn p={p} onClick={onPreview}  icon={Eye}      label="Preview" />
        <DocActionBtn p={p} onClick={onDownload} icon={Download} label="Download" />
        <DocActionBtn p={p} onClick={onPrint}    icon={Printer}  label="Print" />
        <DocActionBtn p={p} onClick={onEmail}    icon={Mail}     label="Email" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MemberPicker — searchable picker scoped to LS Privilege members.
// Used by the Gift Card issuance flow to enforce the member-only rule
// for both recipient + sender. Renders a closed-state chip showing the
// picked member (name, email, tier, points, lifetime nights) and pops
// a search dropdown on click. `excludeId` is the OTHER member already
// picked on the form (sender when this is the recipient picker, and
// vice versa) — used to filter that row out of the list so the
// operator can't pick the same person for both sides.
// ─────────────────────────────────────────────────────────────────────────
const TIER_PILL = {
  silver:   { bg: "rgba(148,163,184,0.18)", ink: "#94A3B8", label: "Silver" },
  gold:     { bg: "rgba(201,169,97,0.18)",   ink: "#C9A961", label: "Gold" },
  platinum: { bg: "rgba(196,181,253,0.20)", ink: "#C4B5FD", label: "Platinum" },
};
function MemberRowChip({ p, member, compact = false }) {
  if (!member) return null;
  const tier = TIER_PILL[member.tier] || TIER_PILL.silver;
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span style={{
        width: compact ? 30 : 34, height: compact ? 30 : 34, flexShrink: 0,
        borderRadius: "50%", backgroundColor: `${tier.ink}25`,
        border: `1px solid ${tier.ink}`,
        color: tier.ink, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
        fontSize: compact ? "0.86rem" : "0.94rem",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {(member.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: compact ? "0.82rem" : "0.9rem", fontWeight: 600 }}>
            {member.name}
          </span>
          <span style={{
            color: tier.ink, backgroundColor: tier.bg, border: `1px solid ${tier.ink}55`,
            padding: "1px 6px", fontSize: "0.56rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
          }}>{tier.label}</span>
          {member.verified && (
            <span title="ID verified" style={{ color: p.success, display: "inline-flex" }}>
              <UserCheck size={11} />
            </span>
          )}
        </div>
        <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 2 }}>
          {member.email}
        </div>
        {!compact && (
          <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>
            <code style={{ fontFamily: "ui-monospace, Menlo, monospace", color: p.accent, fontSize: "0.66rem" }}>{member.id}</code>
            <span> · {Number(member.points || 0).toLocaleString()} pts · {member.lifetimeNights || 0} nights</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberPicker({ p, label, members, value, onChange, placeholder, excludeId }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const picked = (members || []).find((m) => m.id === value);

  // Outside-click + Esc to close. Stays mounted so the picked state
  // survives close-reopen cycles inside the same form session.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (members || []).filter((m) => {
      if (excludeId && m.id === excludeId) return false;
      if (!ql) return true;
      return [m.name, m.email, m.id, m.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(ql));
    }).slice(0, 50);
  }, [members, q, excludeId]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-start"
        style={{
          backgroundColor: p.inputBg, color: p.textPrimary,
          border: `1px solid ${picked ? p.accent : p.border}`,
          padding: picked ? "0.7rem 0.85rem" : "0.85rem 0.9rem",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        }}
      >
        {picked ? (
          <>
            <div className="flex-1 min-w-0">
              <MemberRowChip p={p} member={picked} />
            </div>
            <ChevronDown size={14} style={{ color: p.textMuted, flexShrink: 0 }} />
          </>
        ) : (
          <>
            <span style={{
              width: 30, height: 30, flexShrink: 0,
              borderRadius: "50%", backgroundColor: p.bgPanelAlt,
              border: `1px dashed ${p.border}`, color: p.textMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              <UserIcon size={13} />
            </span>
            <span style={{ flex: 1, color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
              {placeholder || `Pick a ${label || "member"}`}
            </span>
            <ChevronDown size={14} style={{ color: p.textMuted, flexShrink: 0 }} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-[100] mt-1" style={{
          backgroundColor: p.bgPanel, border: `1px solid ${p.accent}`,
          boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
          maxHeight: 360, display: "flex", flexDirection: "column",
        }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
            <Search size={13} style={{ color: p.textMuted }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, phone, or LS-…-…"
              className="flex-1 outline-none"
              style={{ backgroundColor: "transparent", color: p.textPrimary, fontSize: "0.84rem", fontFamily: "'Manrope', sans-serif" }}
            />
            {picked && (
              <button onClick={() => { onChange(""); setOpen(false); }} title="Clear"
                style={{ color: p.textMuted, padding: "2px 6px", border: `1px solid ${p.border}`, fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", backgroundColor: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = p.warn; e.currentTarget.style.borderColor = p.warn; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
              >Clear</button>
            )}
          </div>
          <div className="overflow-y-auto" style={{ flex: 1 }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center" style={{ color: p.textMuted, fontSize: "0.84rem", fontFamily: "'Manrope', sans-serif" }}>
                <div>No members match this search.</div>
                <div style={{ fontSize: "0.74rem", marginTop: 6, lineHeight: 1.5 }}>
                  Need to enrol someone new? Open <strong style={{ color: p.textPrimary }}>Admin → Loyalty</strong> and add a member first.
                </div>
              </div>
            ) : (
              filtered.map((m) => {
                const sel = m.id === value;
                return (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false); setQ(""); }}
                    className="w-full text-start p-3 transition-colors"
                    style={{
                      backgroundColor: sel ? p.bgHover : "transparent",
                      borderBottom: `1px solid ${p.border}`,
                      borderLeft: sel ? `3px solid ${p.accent}` : "3px solid transparent",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.backgroundColor = p.bgHover; }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <MemberRowChip p={p} member={m} />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DocActionBtn({ p, onClick, icon: Ic, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: p.textSecondary, padding: "0.4rem 0.7rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
        letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
        border: `1px solid ${p.border}`, backgroundColor: "transparent", cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
    >
      <Ic size={11} /> {label}
    </button>
  );
}

function PreviewStat({ p, label, value, accent }) {
  return (
    <div style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, padding: "10px 12px" }}>
      <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div className="mt-1" style={{ color: accent || p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function DetailStat({ p, label, value, accent }) {
  return (
    <div style={{ backgroundColor: p.bgPanel, padding: "14px 16px" }}>
      <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div className="mt-1" style={{ color: accent || p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", fontWeight: 500, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
