import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BedDouble, Calendar as CalIcon, Check, CheckCircle2, ChevronRight, Copy, Download,
  Edit2, Eye, FileText, Gift, Layers, Mail, Plus, Printer, Receipt, Save, Search, Send, Trash2, X,
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
  const { giftCards, issueGiftCard, updateGiftCard, removeGiftCard, rooms, invoices, payments } = useData();
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
function GiftCardCreator({ p, rooms, existing, onClose, onCreate }) {
  const defaultRoomId = rooms?.find((r) => r.id === "one-bed")?.id || rooms?.[0]?.id || "studio";
  const [draft, setDraft] = useState({
    tierId: "10n",
    roomId: defaultRoomId,
    recipientName: "", recipientEmail: "",
    senderName:    "", senderEmail:    "",
    message: "",
    delivery: "email",
    deliverOn: "",
    overridePaid: "", // optional manual override of the computed net price
    paymentMethod: "card",
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const room = useMemo(() => (rooms || []).find((r) => r.id === draft.roomId) || rooms?.[0], [rooms, draft.roomId]);
  const tier = useMemo(() => GIFT_CARD_TIERS.find((t) => t.id === draft.tierId) || GIFT_CARD_TIERS[0], [draft.tierId]);
  const price = useMemo(
    () => computeGiftCardPrice({ nights: tier.nights, discountPct: tier.discountPct, ratePerNight: room?.price || 0 }),
    [tier, room]
  );

  // Preview the code so the operator knows what will land on the card
  // before they hit Save.
  const previewCode = useMemo(() => generateGiftCardCode(existing), []);

  const valid = !!draft.recipientName.trim() && !!draft.senderName.trim();

  const save = () => {
    if (!valid) { pushToast({ message: "Recipient + sender name are required.", kind: "warn" }); return; }
    onCreate({
      tierId: tier.id,
      roomId: room.id,
      totalNights: tier.nights,
      discountPct: tier.discountPct,
      ratePerNight: room?.price || 0,
      faceValue: price.gross,
      paidAmount: draft.overridePaid ? Number(draft.overridePaid) : price.net,
      recipientName:  draft.recipientName.trim(),
      recipientEmail: draft.recipientEmail.trim(),
      senderName:     draft.senderName.trim(),
      senderEmail:    draft.senderEmail.trim(),
      message:        draft.message.trim(),
      delivery:       draft.delivery,
      deliverOn:      draft.deliverOn || null,
    }, { paymentMethod: draft.paymentMethod || "card" });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Gift card"
      title="Issue a card"
      contentMaxWidth="max-w-3xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} small><Save size={11} /> Issue card</PrimaryBtn>
        </>
      }
    >
      <Card title="Suite + tier">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormGroup label="Suite type">
            <SelectField
              value={draft.roomId}
              onChange={(v) => set({ roomId: v })}
              options={(rooms || []).map((r) => ({
                value: r.id,
                label: `${ROOM_LABEL_SHORT[r.id] || r.id} · ${formatCurrency(r.price)}/night`,
              }))}
            />
          </FormGroup>
          <FormGroup label="Night tier">
            <SelectField
              value={draft.tierId}
              onChange={(v) => set({ tierId: v })}
              options={GIFT_CARD_TIERS.map((t) => ({
                value: t.id,
                label: `${t.nights} nights · ${t.discountPct}% off · ${t.label}`,
              }))}
            />
          </FormGroup>
        </div>

        {/* Computed price preview */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <PreviewStat p={p} label="Gross"        value={formatCurrency(price.gross)} />
          <PreviewStat p={p} label="Discount"     value={`− ${formatCurrency(price.discount)}`} accent={p.success} />
          <PreviewStat p={p} label="Net to buyer" value={formatCurrency(price.net)}   accent={p.accent} />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="mt-2 px-3 py-2" style={{ backgroundColor: `${p.success}10`, border: `1px solid ${p.success}40` }}>
          <div style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Accounting</div>
          <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
            Issuing creates the card AND posts a matching invoice (kind: gift_card) + payment receipt for the buyer. Both records reference the card via giftCardId so the folio links across modules.
          </div>
        </div>
      </Card>

      <Card title="Recipient" className="mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormGroup label="Name *">
            <TextField value={draft.recipientName} onChange={(v) => set({ recipientName: v })} placeholder="Layla Al-Khalifa" />
          </FormGroup>
          <FormGroup label="Email">
            <TextField type="email" value={draft.recipientEmail} onChange={(v) => set({ recipientEmail: v })} placeholder="recipient@example.com" />
          </FormGroup>
        </div>
      </Card>

      <Card title="Sender" className="mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormGroup label="Name *">
            <TextField value={draft.senderName} onChange={(v) => set({ senderName: v })} placeholder="Yusuf Al-Khalifa" />
          </FormGroup>
          <FormGroup label="Email">
            <TextField type="email" value={draft.senderEmail} onChange={(v) => set({ senderEmail: v })} placeholder="you@example.com" />
          </FormGroup>
        </div>
      </Card>

      <Card title="Delivery & message" className="mt-5">
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
          <div className="sm:col-span-2">
            <FormGroup label="Personal message">
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
        </div>
      </Card>

      <div className="mt-4 px-4 py-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>Code preview</div>
        <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.92rem", color: p.accent, letterSpacing: "0.04em", fontWeight: 600 }}>{previewCode}</code>
        <div style={{ color: p.textMuted, fontSize: "0.72rem", marginTop: 4 }}>
          Codes are collision-checked. The exact value is regenerated on Save so two operators creating at once never end up with the same code.
        </div>
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Detail drawer — view + edit a single card, see redemption history,
// cancel/expire if needed, copy the code to share.
// ─────────────────────────────────────────────────────────────────────────
function GiftCardDetail({ p, card, onClose, onUpdate, onRemove }) {
  const { invoices, payments, hotelInfo } = useData();
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormGroup label="Recipient name">
            <TextField value={draft.recipientName || ""} onChange={(v) => set({ recipientName: v })} />
          </FormGroup>
          <FormGroup label="Recipient email">
            <TextField type="email" value={draft.recipientEmail || ""} onChange={(v) => set({ recipientEmail: v })} />
          </FormGroup>
          <FormGroup label="Sender name">
            <TextField value={draft.senderName || ""} onChange={(v) => set({ senderName: v })} />
          </FormGroup>
          <FormGroup label="Sender email">
            <TextField type="email" value={draft.senderEmail || ""} onChange={(v) => set({ senderEmail: v })} />
          </FormGroup>
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
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
