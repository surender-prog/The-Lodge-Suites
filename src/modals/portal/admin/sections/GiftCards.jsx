import React, { useEffect, useMemo, useState } from "react";
import {
  BedDouble, Calendar as CalIcon, Check, CheckCircle2, ChevronRight, Copy, Edit2,
  Gift, Layers, Mail, Plus, Receipt, Save, Search, Send, Trash2, X,
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

export const GiftCards = () => {
  const p = usePalette();
  const { giftCards, addGiftCard, updateGiftCard, removeGiftCard, rooms } = useData();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search,       setSearch]       = useState("");
  const [creating,     setCreating]     = useState(false);
  const [viewing,      setViewing]      = useState(null);

  // Derived KPIs — single sweep over the slice so the strip stays cheap.
  const stats = useMemo(() => {
    const totalIssued    = giftCards.length;
    const totalNights    = giftCards.reduce((s, c) => s + (c.totalNights || 0), 0);
    const nightsUsed     = giftCards.reduce((s, c) => s + (c.nightsUsed || 0), 0);
    const nightsLeft     = Math.max(0, totalNights - nightsUsed);
    const facePaid       = giftCards.reduce((s, c) => s + (c.paidAmount || 0), 0);
    const activeCount    = giftCards.filter((c) => c.status === "issued").length;
    const redeemedCount  = giftCards.filter((c) => c.status === "redeemed").length;
    return { totalIssued, totalNights, nightsUsed, nightsLeft, facePaid, activeCount, redeemedCount };
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

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Active cards"        value={stats.activeCount} hint={`${stats.totalIssued} issued lifetime`} color={p.accent} />
        <Stat label="Outstanding nights"  value={stats.nightsLeft}  hint={`${stats.nightsUsed} redeemed of ${stats.totalNights}`} color={stats.nightsLeft > 0 ? p.warn : p.success} />
        <Stat label="Redeemed"            value={stats.redeemedCount} hint="Cards fully consumed" color={p.success} />
        <Stat label="Revenue collected"   value={formatCurrency(stats.facePaid)} hint="Sum of buyer-paid amounts" />
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
          onCreate={(payload) => {
            const saved = addGiftCard(payload);
            setCreating(false);
            if (saved) {
              pushToast({ message: `Gift card ${saved.code} issued.` });
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
    });
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
        <div className="mt-3">
          <FormGroup label="Override paid amount (optional)">
            <TextField
              type="number"
              value={draft.overridePaid}
              onChange={(v) => set({ overridePaid: v })}
              placeholder={`Defaults to ${formatCurrency(price.net)}`}
            />
          </FormGroup>
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
  const [draft, setDraft] = useState(card);
  useEffect(() => { setDraft(card); }, [card.id]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(card);

  const remaining = (card.totalNights || 0) - (card.nightsUsed || 0);
  const tier = GIFT_CARD_TIERS.find((t) => t.id === card.tierId);
  const sc = card.status === "issued" ? p.success : card.status === "redeemed" ? p.textMuted : card.status === "cancelled" ? p.danger : p.warn;
  const history = Array.isArray(card.redemptionHistory) ? card.redemptionHistory : [];

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
    </Drawer>
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
