import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, Briefcase, Building2, Check, Eye, FileText, Inbox, Plus, Search, Send, Tag, Trash2, Users, X } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useT, useLang } from "../../../../i18n/LanguageContext.jsx";
import { fmtDate } from "../../../../utils/date.js";
import { useData } from "../../../../data/store.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, TableShell, Td, Th, TextField } from "../ui.jsx";

// Recipient type metadata used for tabs, chips, and the send-summary line.
// OTAs are intentionally absent — channel-side updates run via the live
// channel-manager feed (see the OTA tab) so no email-composer recipients
// represent OTAs anymore.
const RECIPIENT_TYPES = [
  { id: "agent",     label: "Agents",      icon: Briefcase, colorKey: "success" },
  { id: "corporate", label: "Corporates",  icon: Building2, colorKey: "warn"    },
  { id: "custom",    label: "Custom",      icon: Inbox,     colorKey: "textPrimary" },
];
const TYPE_BY_ID = Object.fromEntries(RECIPIENT_TYPES.map((t) => [t.id, t]));

// Email templates the operator can pre-load into the composer.
const TEMPLATES = [
  {
    id: "stop-sale",
    label: "Stop-sale notification",
    subject: "Stop-sale notification — The Lodge Suites",
    body: "Dear partner,\n\nPlease note the following stop-sale instruction:\n\n• Room type: {{ROOM}}\n• Stop dates: {{FROM}} – {{TO}}\n• Reason: {{REASON}}\n\nKindly close availability across all channels for the dates above. Reservations already confirmed will be honoured.\n\nWith regards,\nReservations Team\nThe Lodge Suites · Juffair, Manama",
  },
  {
    id: "rate-update",
    label: "Rate update",
    subject: "Updated rates · The Lodge Suites",
    body: "Dear partner,\n\nPlease load the following revised rates with effect from {{EFFECTIVE_DATE}}:\n\n• Lodge Studio — BHD 38\n• One-Bedroom Suite — BHD 44\n• Deluxe Two-Bedroom Suite — BHD 78\n• Luxury Three-Bedroom Suite — BHD 96\n\nRates are net of commission, exclusive of 10% government tax and 5% service charge.\n\nKindly confirm receipt and load by EOB.\n\nWith regards,\nReservations Team\nThe Lodge Suites · Juffair, Manama",
  },
  {
    id: "promo-launch",
    label: "Promotion launch",
    subject: "New promotion · {{PROMO_NAME}}",
    body: "Dear partner,\n\nWe're launching a new promotion across direct and connected channels:\n\n• Promotion: {{PROMO_NAME}}\n• Discount: {{DISCOUNT}}\n• Eligible stay dates: {{ELIGIBLE_DATES}}\n• Booking window: {{BOOKING_WINDOW}}\n\nPlease activate the offer in your extranet at your earliest convenience and share with your distribution network.\n\nWith regards,\nMarketing Team\nThe Lodge Suites · Juffair, Manama",
  },
  {
    id: "policy-update",
    label: "Policy update",
    subject: "Policy update · cancellation & deposit terms",
    body: "Dear partner,\n\nThis is to advise of the following policy update:\n\n• Free cancellation: up to {{HOURS}} hours before arrival\n• Deposit: {{DEPOSIT}}\n• Effective date: {{EFFECTIVE_DATE}}\n\nPlease apply this update across your distribution platforms by {{LOAD_BY}}.\n\nWith regards,\nReservations Team\nThe Lodge Suites · Juffair, Manama",
  },
];

// Catalog of placeholder tokens the templates support. Each carries a
// short hint (shown in the picker) and a sample value used to seed the
// preview when the operator hasn't filled in real values yet. Adding a
// new placeholder is one row here — the picker, value form, and
// substitution helpers all read this list.
const PLACEHOLDER_CATALOG = [
  { id: "ROOM",            label: "{{ROOM}}",            hint: "Suite name",                 sample: "Lodge Studio" },
  { id: "FROM",            label: "{{FROM}}",            hint: "Stop-sale start date",       sample: "1 Jun 2026" },
  { id: "TO",              label: "{{TO}}",              hint: "Stop-sale end date",         sample: "5 Jun 2026" },
  { id: "REASON",          label: "{{REASON}}",          hint: "Why we're closing",          sample: "Refurbishment of the wellness floor" },
  { id: "EFFECTIVE_DATE",  label: "{{EFFECTIVE_DATE}}",  hint: "Date a change takes effect", sample: "1 Jul 2026" },
  { id: "PROMO_NAME",      label: "{{PROMO_NAME}}",      hint: "Promotion name",             sample: "Summer escape · 20% off" },
  { id: "DISCOUNT",        label: "{{DISCOUNT}}",        hint: "Promotional discount",       sample: "20% off best-flexible" },
  { id: "ELIGIBLE_DATES",  label: "{{ELIGIBLE_DATES}}",  hint: "Stay window",                sample: "1 Jul – 31 Aug 2026" },
  { id: "BOOKING_WINDOW",  label: "{{BOOKING_WINDOW}}",  hint: "When the offer can be booked", sample: "Now – 30 Jun 2026" },
  { id: "HOURS",           label: "{{HOURS}}",           hint: "Free-cancellation window",   sample: "48" },
  { id: "DEPOSIT",         label: "{{DEPOSIT}}",         hint: "Deposit amount",             sample: "1 night charge at booking" },
  { id: "LOAD_BY",         label: "{{LOAD_BY}}",         hint: "Deadline to load update",    sample: "EOB Friday, 30 May 2026" },
];
const PLACEHOLDER_INDEX = Object.fromEntries(PLACEHOLDER_CATALOG.map((p) => [p.id, p]));

// Returns the unique placeholder ids referenced inside the supplied
// strings. Order is preserved so the value form renders in document
// order. Unknown tokens still render — they just don't get a sample.
function detectPlaceholders(...strings) {
  const seen = new Set();
  const ids = [];
  const re = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
  for (const s of strings) {
    const text = String(s || "");
    let m;
    while ((m = re.exec(text)) != null) {
      const id = m[1];
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
  }
  return ids;
}

// Substitutes placeholders in `template` using the supplied values map.
// Falls back to the catalog sample, and finally to the original token
// (so unknown placeholders stay visible rather than vanishing silently).
function substitutePlaceholders(template, values = {}) {
  return String(template || "").replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (raw, id) => {
    if (values[id] != null && String(values[id]).length > 0) return values[id];
    if (PLACEHOLDER_INDEX[id]?.sample) return PLACEHOLDER_INDEX[id].sample;
    return raw;
  });
}

// Stop-sales now derive directly from the calendar overrides — any cell with
// stopSale:true is a stop-sale entry.
function stopSalesFromCalendar(calendar) {
  const groups = {};
  for (const [key, v] of Object.entries(calendar)) {
    if (!v.stopSale) continue;
    const [roomId, date] = key.split("|");
    const k = `${roomId}|${v.reason || "—"}`;
    groups[k] = groups[k] || { roomId, reason: v.reason || "—", dates: [] };
    groups[k].dates.push(date);
  }
  return Object.values(groups).map(g => {
    g.dates.sort();
    return { roomId: g.roomId, reason: g.reason, from: g.dates[0], to: g.dates[g.dates.length - 1], count: g.dates.length };
  });
}

export const StopSaleOta = () => {
  const t = useT();
  const p = usePalette();
  const { lang } = useLang();
  const { rooms, calendar, setCalendarCell, agencies, agreements } = useData();

  const stopSales = stopSalesFromCalendar(calendar);

  // Custom one-off recipients added inline by the operator (cleared each
  // session — like the rest of the mocked store).
  const [customRecipients, setCustomRecipients] = useState([]);
  const [newCustom, setNewCustom] = useState({ name: "", email: "" });

  // Selection persists by recipient ID across tab/filter changes.
  const [selected, setSelected] = useState(() => new Set());

  const [activeTab, setActiveTab] = useState("agent");
  const [recipientFilter, setRecipientFilter] = useState("");

  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [activeTemplate, setActiveTemplate] = useState(TEMPLATES[0].id);
  const [sent, setSent] = useState(false);

  // Custom templates the operator creates inline. Persisted in component
  // state so they survive tab switches within the session, just like
  // `customRecipients`. The new-template modal saves into here; deletion
  // strips a custom template (built-ins are protected).
  const [customTemplates, setCustomTemplates] = useState([]);
  const [newTemplate, setNewTemplate] = useState(null); // null | { label, subject, body }
  const allTemplates = useMemo(
    () => [...TEMPLATES.map((t) => ({ ...t, builtIn: true })), ...customTemplates],
    [customTemplates]
  );

  // Placeholder workflow — the token chip picker inserts at the body
  // textarea's caret position; the per-template value form drives the
  // preview substitution. Values persist across template switches so an
  // operator who tweaks templates mid-flow doesn't have to re-type.
  const bodyRef = useRef(null);
  const [placeholderValues, setPlaceholderValues] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const usedPlaceholders = useMemo(
    () => detectPlaceholders(subject, body),
    [subject, body]
  );

  // Insert the supplied token at the textarea caret. Falls back to
  // appending at the end when the textarea hasn't been focused yet.
  const insertPlaceholder = (token) => {
    const ta = bodyRef.current;
    if (!ta) {
      setBody((b) => `${b}${token}`);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end   = ta.selectionEnd   ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    // Restore caret position immediately after the inserted token.
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + token.length;
      try { ta.setSelectionRange(caret, caret); } catch (_) {}
    });
  };

  // ---- Build the recipient catalogue -------------------------------------
  // OTA channels intentionally aren't surfaced here — channel-side updates
  // are pushed by the live channel-manager feed (see the OTA tab) so the
  // email composer sticks to human partners (agents, corporates, custom).
  const allRecipients = useMemo(() => {
    const out = [];
    agencies.forEach((a) => {
      out.push({
        id:    `agt-${a.id}`,
        name:  a.name,
        email: a.pocEmail || a.contact,
        type:  "agent",
        meta:  `${a.id} · ${a.commissionPct}% · ${a.status}`,
        statusKey: a.status,
      });
    });
    agreements.forEach((a) => {
      out.push({
        id:    `crp-${a.id}`,
        name:  a.account,
        email: a.pocEmail,
        type:  "corporate",
        meta:  `${a.id} · ${a.industry || "—"} · ${a.status}`,
        statusKey: a.status,
        disabled: !a.pocEmail,
      });
    });
    customRecipients.forEach((r) => {
      out.push({ ...r, type: "custom", meta: "Added manually" });
    });
    return out;
  }, [agencies, agreements, customRecipients]);

  // Filter for the active tab + search. "all" returns the whole catalogue.
  const filteredRecipients = useMemo(() => {
    const q = recipientFilter.trim().toLowerCase();
    return allRecipients.filter((r) => {
      if (activeTab !== "all" && r.type !== activeTab) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.email || ""} ${r.meta || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allRecipients, activeTab, recipientFilter]);

  // Counts per tab — total available + currently-selected.
  const counts = useMemo(() => {
    const c = { all: allRecipients.length, agent: 0, corporate: 0, custom: 0 };
    const s = { all: 0,                    agent: 0, corporate: 0, custom: 0 };
    allRecipients.forEach((r) => {
      if (c[r.type] != null) c[r.type] += 1;
      if (selected.has(r.id)) {
        if (s[r.type] != null) s[r.type] += 1;
        s.all += 1;
      }
    });
    return { available: c, selected: s };
  }, [allRecipients, selected]);

  // Selected recipients full record list — used for the send summary.
  const selectedList = useMemo(() => allRecipients.filter((r) => selected.has(r.id)), [allRecipients, selected]);

  const toggleRecipient = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filteredRecipients.length > 0 && filteredRecipients.every((r) => selected.has(r.id) || r.disabled);
  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredRecipients.forEach((r) => next.delete(r.id));
      } else {
        filteredRecipients.forEach((r) => { if (!r.disabled) next.add(r.id); });
      }
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const addCustomRecipient = () => {
    const name  = newCustom.name.trim();
    const email = newCustom.email.trim();
    if (!name || !email.includes("@")) {
      pushToast({ message: "Add a name and a valid email address", kind: "warn" });
      return;
    }
    if (allRecipients.some((r) => r.email?.toLowerCase() === email.toLowerCase())) {
      pushToast({ message: `${email} is already in the list`, kind: "warn" });
      return;
    }
    const id = `cst-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setCustomRecipients((prev) => [...prev, { id, name, email }]);
    setSelected((prev) => new Set(prev).add(id));
    setNewCustom({ name: "", email: "" });
    pushToast({ message: `${name} added` });
    if (activeTab !== "custom" && activeTab !== "all") setActiveTab("custom");
  };

  const removeCustomRecipient = (id) => {
    setCustomRecipients((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const sendEmail = () => {
    if (selectedList.length === 0) {
      pushToast({ message: "Select at least one recipient", kind: "warn" });
      return;
    }
    setSent(true);
    const breakdown = RECIPIENT_TYPES
      .filter((rt) => counts.selected[rt.id] > 0)
      .map((rt) => `${counts.selected[rt.id]} ${rt.label.toLowerCase()}`).join(" · ");
    pushToast({ message: `Sent to ${selectedList.length} recipient${selectedList.length === 1 ? "" : "s"} · ${breakdown}` });
    setTimeout(() => setSent(false), 3500);
  };

  const loadTemplate = (id) => {
    const tpl = allTemplates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setActiveTemplate(id);
  };

  const saveNewTemplate = (draft) => {
    const id = `custom-${Date.now().toString(36)}`;
    const tpl = {
      id,
      label: (draft.label || "").trim() || "Untitled template",
      subject: draft.subject || "",
      body: draft.body || "",
      builtIn: false,
    };
    setCustomTemplates((prev) => [...prev, tpl]);
    setSubject(tpl.subject);
    setBody(tpl.body);
    setActiveTemplate(id);
    setNewTemplate(null);
    pushToast({ message: `Template saved · ${tpl.label}` });
  };
  const removeCustomTemplate = (id) => {
    if (!confirm("Remove this custom template? This can't be undone.")) return;
    setCustomTemplates((prev) => prev.filter((t) => t.id !== id));
    if (activeTemplate === id) {
      // Fallback to the first built-in so the composer never lands on
      // a deleted template.
      const first = TEMPLATES[0];
      setSubject(first.subject); setBody(first.body); setActiveTemplate(first.id);
    }
    pushToast({ message: "Template removed" });
  };

  const removeStop = (roomId, from, to) => {
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      const ov = calendar[`${roomId}|${k}`];
      if (ov?.stopSale) setCalendarCell(roomId, k, { ...ov, stopSale: false });
    }
  };

  return (
    <div>
      <PageHeader
        title="Stop-Sale"
        intro="Active stop-sales pulled live from the calendar. Compose channel-partner notifications below — the OTA email composer can target multiple platforms in one send. (Direct API channel-manager integration is on the way — see the OTA tab.)"
      />

      <Card title="Active stop-sales" padded={false} className="mb-6">
        {stopSales.length === 0 ? (
          <div className="p-6 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}>
            No stop-sales currently active. Add them via the Calendar.
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Room type</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th align="end">Nights</Th>
                <Th>Reason</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {stopSales.map((s, i) => (
                <tr key={i}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} style={{ color: p.warn }} />
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", color: p.textPrimary }}>{t(`rooms.${s.roomId}.name`)}</span>
                    </div>
                  </Td>
                  <Td muted>{fmtDate(s.from, lang)}</Td>
                  <Td muted>{fmtDate(s.to, lang)}</Td>
                  <Td align="end">{s.count}</Td>
                  <Td muted>{s.reason}</Td>
                  <Td align="end">
                    <button onClick={() => removeStop(s.roomId, s.from, s.to)} className="inline-flex items-center gap-1.5"
                      style={{ color: p.danger, fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      <Trash2 size={11} /> Lift
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card title="Distribution composer · OTAs · Travel agents · Corporates"
        action={
          <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
            <FileText size={11} className="inline mr-1.5" /> Templates · pick a starter below
          </span>
        }
      >
        {/* Template chooser */}
        {!sent && (
          <div className="flex flex-wrap gap-2 mb-5 items-center">
            {allTemplates.map((tpl) => {
              const active = tpl.id === activeTemplate;
              return (
                <span key={tpl.id} className="inline-flex items-stretch"
                  style={{
                    border: `1px solid ${active ? p.accent : p.border}`,
                    backgroundColor: active ? p.bgPanelAlt : "transparent",
                  }}
                >
                  <button
                    onClick={() => loadTemplate(tpl.id)}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      padding: "0.45rem 0.85rem",
                      color: active ? p.accent : p.textSecondary,
                      backgroundColor: "transparent",
                      border: "none",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.7rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {tpl.label}
                    {!tpl.builtIn && (
                      <span style={{
                        fontSize: "0.5rem", letterSpacing: "0.18em", color: p.accent,
                        padding: "1px 4px", border: `1px solid ${p.accent}`, marginInlineStart: 2,
                      }}>Custom</span>
                    )}
                  </button>
                  {!tpl.builtIn && (
                    <button
                      onClick={() => removeCustomTemplate(tpl.id)}
                      title={`Remove "${tpl.label}"`}
                      style={{
                        padding: "0.45rem 0.55rem",
                        backgroundColor: "transparent",
                        borderInlineStart: `1px solid ${active ? p.accent : p.border}`,
                        border: "none",
                        borderInlineStart: `1px solid ${active ? p.accent : p.border}`,
                        color: p.textMuted, cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = p.danger)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = p.textMuted)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              );
            })}
            <button
              onClick={() => setNewTemplate({
                // Pre-seed with whatever's currently in the composer so an
                // operator can iterate on a built-in then save it as a new
                // template without copy-pasting.
                label: "", subject, body,
              })}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "0.45rem 0.85rem",
                border: `1px dashed ${p.accent}`,
                color: p.accent,
                backgroundColor: "transparent",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.7rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 700,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.accent}10`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <Plus size={11} /> New template
            </button>
          </div>
        )}

        {sent ? (
          <div className="py-8 text-center">
            <Check size={50} style={{ color: p.success, margin: "0 auto" }} strokeWidth={1.5} />
            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", color: p.textPrimary, marginTop: 16 }}>Dispatched</h4>
            <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.9rem", marginTop: 6 }}>
              Sent to {selectedList.length} recipient{selectedList.length === 1 ? "" : "s"}{" · "}
              {RECIPIENT_TYPES.filter((rt) => counts.selected[rt.id] > 0).map((rt) => `${counts.selected[rt.id]} ${rt.label.toLowerCase()}`).join(" · ")}
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6">
            {/* Recipients column */}
            <div>
              {/* Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <RecipientTab id="all"  label="All" count={counts.available.all} sel={counts.selected.all} active={activeTab === "all"} onClick={() => setActiveTab("all")} p={p} />
                {RECIPIENT_TYPES.map((rt) => (
                  <RecipientTab
                    key={rt.id}
                    id={rt.id}
                    label={rt.label}
                    icon={rt.icon}
                    color={p[rt.colorKey]}
                    count={counts.available[rt.id]}
                    sel={counts.selected[rt.id]}
                    active={activeTab === rt.id}
                    onClick={() => setActiveTab(rt.id)}
                    p={p}
                  />
                ))}
              </div>

              {/* Search + bulk toggle */}
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={12} style={{ position: "absolute", insetInlineStart: 10, top: "50%", transform: "translateY(-50%)", color: p.textMuted, pointerEvents: "none" }} />
                  <input
                    value={recipientFilter}
                    onChange={(e) => setRecipientFilter(e.target.value)}
                    placeholder="Search name or email…"
                    className="w-full outline-none"
                    style={{
                      backgroundColor: p.inputBg, color: p.textPrimary,
                      border: `1px solid ${p.border}`,
                      paddingInlineStart: "1.9rem", paddingInlineEnd: recipientFilter ? "1.9rem" : "0.7rem",
                      paddingBlock: "0.5rem",
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
                    }}
                  />
                  {recipientFilter && (
                    <button onClick={() => setRecipientFilter("")} title="Clear"
                      style={{ position: "absolute", insetInlineEnd: 8, top: "50%", transform: "translateY(-50%)", color: p.textMuted }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  onClick={toggleAllFiltered}
                  disabled={filteredRecipients.length === 0}
                  style={{
                    padding: "0.4rem 0.7rem",
                    color: filteredRecipients.length === 0 ? p.textDim : p.textSecondary,
                    border: `1px solid ${p.border}`, backgroundColor: "transparent",
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    whiteSpace: "nowrap",
                    cursor: filteredRecipients.length === 0 ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (filteredRecipients.length > 0) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
                  onMouseLeave={(e) => { if (filteredRecipients.length > 0) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
                >
                  {allFilteredSelected ? "Clear" : "All"}
                </button>
              </div>

              {/* Recipient list */}
              <div className="space-y-1.5" style={{ maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
                {filteredRecipients.length === 0 ? (
                  <div className="px-3 py-6 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", border: `1px dashed ${p.border}` }}>
                    {recipientFilter ? "No matches in this tab." : "No recipients in this group yet."}
                  </div>
                ) : filteredRecipients.map((r) => (
                  <RecipientRow
                    key={r.id}
                    rec={r}
                    selected={selected.has(r.id)}
                    onToggle={() => toggleRecipient(r.id)}
                    onRemove={r.type === "custom" ? () => removeCustomRecipient(r.id) : undefined}
                    p={p}
                  />
                ))}
              </div>

              {/* Add custom recipient */}
              <div className="mt-4 p-3" style={{ border: `1px dashed ${p.border}`, backgroundColor: p.bgPanelAlt }}>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                  Add custom recipient
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={newCustom.name}
                    onChange={(e) => setNewCustom({ ...newCustom, name: e.target.value })}
                    placeholder="Name (e.g. New OTA)"
                    className="flex-1 outline-none"
                    style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.45rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", minWidth: 0 }}
                  />
                  <input
                    value={newCustom.email}
                    type="email"
                    onChange={(e) => setNewCustom({ ...newCustom, email: e.target.value })}
                    placeholder="email@example.com"
                    className="flex-1 outline-none"
                    style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.45rem 0.6rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", minWidth: 0 }}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustomRecipient(); }}
                  />
                  <button onClick={addCustomRecipient}
                    style={{
                      padding: "0.45rem 0.85rem",
                      backgroundColor: p.accent, color: p.theme === "light" ? "#FFFFFF" : "#15161A",
                      border: `1px solid ${p.accent}`,
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
                      letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                      whiteSpace: "nowrap", cursor: "pointer",
                    }}
                  ><Plus size={11} className="inline mr-1" /> Add</button>
                </div>
              </div>

              {counts.selected.all > 0 && (
                <button
                  onClick={clearAll}
                  className="mt-3 inline-flex items-center gap-1.5"
                  style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = p.danger; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; }}
                >
                  <Trash2 size={11} /> Clear all selected
                </button>
              )}
            </div>

            {/* Composer column */}
            <div className="space-y-4">
              <FormGroup label="Subject"><TextField value={subject} onChange={setSubject} /></FormGroup>

              {/* Placeholder picker — chips that insert tokens at the
                  body caret. Tokens already used in the current draft
                  highlight in gold so the operator can see at a glance
                  which fields still need values. */}
              <FormGroup label="Insert placeholder">
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDER_CATALOG.map((ph) => {
                    const inUse = usedPlaceholders.includes(ph.id);
                    return (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => insertPlaceholder(ph.label)}
                        className="inline-flex items-center gap-1.5"
                        title={`${ph.hint} · sample: ${ph.sample}`}
                        style={{
                          fontFamily: "ui-monospace, Menlo, monospace",
                          fontSize: "0.7rem", fontWeight: 600,
                          padding: "0.3rem 0.55rem",
                          backgroundColor: inUse ? `${p.accent}1A` : p.bgPanelAlt,
                          border: `1px solid ${inUse ? p.accent : p.border}`,
                          color: inUse ? p.accent : p.textSecondary,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!inUse) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }
                        }}
                        onMouseLeave={(e) => {
                          if (!inUse) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }
                        }}
                      >
                        <Tag size={10} /> {ph.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 6, lineHeight: 1.5 }}>
                  Click to drop the token into the body at your cursor. Gold tokens are already used in the current draft.
                </div>
              </FormGroup>

              <FormGroup label="Body">
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full outline-none"
                  style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.85rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", lineHeight: 1.7, resize: "vertical" }} />
              </FormGroup>

              {/* Detected placeholders — inline form so the operator can
                  fill in real values, watch the preview update, and (in
                  a real-mailer wiring) send pre-substituted bodies. */}
              {usedPlaceholders.length > 0 && (
                <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px dashed ${p.border}` }}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      <Tag size={10} style={{ display: "inline", marginInlineEnd: 4, verticalAlign: -1 }} />
                      Fill in placeholders · {usedPlaceholders.length}
                    </span>
                    <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
                      Drives the preview · empty falls back to sample.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {usedPlaceholders.map((id) => {
                      const meta = PLACEHOLDER_INDEX[id] || { hint: "Custom token", sample: "" };
                      return (
                        <div key={id}>
                          <div className="flex items-baseline justify-between">
                            <span style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.7rem", fontWeight: 600 }}>{`{{${id}}}`}</span>
                            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem" }}>{meta.hint}</span>
                          </div>
                          <input
                            value={placeholderValues[id] ?? ""}
                            onChange={(e) => setPlaceholderValues((v) => ({ ...v, [id]: e.target.value }))}
                            placeholder={meta.sample || "value"}
                            className="w-full outline-none mt-1"
                            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.45rem 0.65rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected summary chips */}
              {selectedList.length > 0 && (
                <div className="p-3" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      Will send to {selectedList.length} recipient{selectedList.length === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: "0.66rem" }}>
                      {RECIPIENT_TYPES.filter((rt) => counts.selected[rt.id] > 0).map((rt) => (
                        <span key={rt.id} style={{
                          fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                          padding: "1px 6px", color: p[rt.colorKey], border: `1px solid ${p[rt.colorKey]}`,
                        }}>{counts.selected[rt.id]} {rt.label}</span>
                      ))}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap" style={{ maxHeight: 60, overflowY: "auto" }}>
                    {selectedList.slice(0, 30).map((r) => (
                      <span key={r.id} title={r.email}
                        style={{
                          fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem",
                          padding: "1px 6px", color: p.textSecondary,
                          border: `1px solid ${p.border}`,
                          backgroundColor: p.bgPanel,
                        }}>{r.name}</span>
                    ))}
                    {selectedList.length > 30 && (
                      <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem" }}>
                        +{selectedList.length - 30} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between flex-wrap gap-3">
                <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                  Templates use <code style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace" }}>{`{{PLACEHOLDERS}}`}</code> — fill the form above to drive the preview before sending.
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <GhostBtn small onClick={() => setShowPreview(true)}>
                    <Eye size={12} /> Preview
                  </GhostBtn>
                  <PrimaryBtn onClick={sendEmail}>
                    Send · {selectedList.length} <Send size={13} />
                  </PrimaryBtn>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {showPreview && (
        <EmailPreviewModal
          subject={subject}
          body={body}
          values={placeholderValues}
          recipients={selectedList}
          onClose={() => setShowPreview(false)}
        />
      )}

      {newTemplate && (
        <NewTemplateModal
          initial={newTemplate}
          existingLabels={allTemplates.map((t) => t.label.toLowerCase())}
          onSave={saveNewTemplate}
          onClose={() => setNewTemplate(null)}
        />
      )}

    </div>
  );
};

// ---------------------------------------------------------------------------
// NewTemplateModal — full-page editor for a custom email template. Two
// columns: the form on the left (name, subject, body, placeholder picker)
// and a sticky live preview on the right that mirrors the EmailPreviewModal
// rendering. Pre-seeds with whatever the operator was already composing
// and validates a unique label before saving.
// ---------------------------------------------------------------------------
function NewTemplateModal({ initial, existingLabels = [], onSave, onClose }) {
  const p = usePalette();
  const [draft, setDraft] = useState({
    label: initial?.label || "",
    subject: initial?.subject || "",
    body: initial?.body || "",
  });
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  // Track which field had focus last so the placeholder picker knows
  // where to insert. Defaults to the body, the more common target.
  const [activeField, setActiveField] = useState("body");

  const trimmedLabel = draft.label.trim();
  const labelTaken   = trimmedLabel && existingLabels.includes(trimmedLabel.toLowerCase());
  const canSave      = trimmedLabel.length > 0 && draft.subject.trim().length > 0 && draft.body.trim().length > 0 && !labelTaken;

  // Detect placeholders + render the preview substitution. The new
  // template won't have user-supplied values yet, so this always falls
  // back to the catalog samples.
  const usedPlaceholders = useMemo(
    () => detectPlaceholders(draft.subject, draft.body),
    [draft.subject, draft.body]
  );
  const renderedSubject = useMemo(() => substitutePlaceholders(draft.subject, {}), [draft.subject]);
  const renderedBody    = useMemo(() => substitutePlaceholders(draft.body,    {}), [draft.body]);

  const insertPlaceholder = (token) => {
    const ta = activeField === "subject" ? subjectRef.current : bodyRef.current;
    const key = activeField;
    if (!ta) {
      setDraft((d) => ({ ...d, [key]: `${d[key]}${token}` }));
      return;
    }
    const start = ta.selectionStart ?? draft[key].length;
    const end   = ta.selectionEnd   ?? draft[key].length;
    const next = draft[key].slice(0, start) + token + draft[key].slice(end);
    setDraft((d) => ({ ...d, [key]: next }));
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + token.length;
      try { ta.setSelectionRange(caret, caret); } catch (_) {}
    });
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="New template"
      title={trimmedLabel || "Untitled template"}
      fullPage
      contentMaxWidth="max-w-6xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={canSave ? () => onSave(draft) : undefined}
            small
          >
            <Plus size={11} /> Save template
          </PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-6">
        {/* Form column ---------------------------------------------------- */}
        <div className="space-y-5">
          <Card title="Identity">
            <FormGroup label="Template name (shown on the chip)">
              <TextField
                value={draft.label}
                onChange={(v) => setDraft((d) => ({ ...d, label: v }))}
                placeholder="e.g. Christmas blackout · partner notice"
              />
              {labelTaken && (
                <div style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginTop: 6 }}>
                  A template with this name already exists — pick another.
                </div>
              )}
            </FormGroup>
          </Card>

          {/* Placeholder picker — same chips as the main composer so the
              operator can drop the same tokens into the new body. */}
          <Card title="Insert placeholder">
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDER_CATALOG.map((ph) => {
                const inUse = usedPlaceholders.includes(ph.id);
                return (
                  <button
                    key={ph.id}
                    type="button"
                    onClick={() => insertPlaceholder(ph.label)}
                    className="inline-flex items-center gap-1.5"
                    title={`${ph.hint} · sample: ${ph.sample}`}
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: "0.7rem", fontWeight: 600,
                      padding: "0.3rem 0.55rem",
                      backgroundColor: inUse ? `${p.accent}1A` : p.bgPanelAlt,
                      border: `1px solid ${inUse ? p.accent : p.border}`,
                      color: inUse ? p.accent : p.textSecondary,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!inUse) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }
                    }}
                    onMouseLeave={(e) => {
                      if (!inUse) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }
                    }}
                  >
                    <Tag size={10} /> {ph.label}
                  </button>
                );
              })}
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", marginTop: 8, lineHeight: 1.5 }}>
              Tokens drop into the field that was last focused — Subject or Body. Gold tokens are already used in the current draft.
            </div>
          </Card>

          <Card title="Email body">
            <FormGroup label="Subject">
              <input
                ref={subjectRef}
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                onFocus={() => setActiveField("subject")}
                placeholder="e.g. {{PROMO_NAME}} · The Lodge Suites"
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.6rem 0.75rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}
              />
            </FormGroup>

            <FormGroup label="Body" className="mt-4">
              <textarea
                ref={bodyRef}
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                onFocus={() => setActiveField("body")}
                rows={16}
                placeholder={"Dear partner,\n\n…"}
                className="w-full outline-none"
                style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`, padding: "0.85rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.7, resize: "vertical" }}
              />
            </FormGroup>
          </Card>
        </div>

        {/* Preview column — sticky on desktop ----------------------------- */}
        <div>
          <div className="lg:sticky lg:top-6 space-y-3">
            <div className="flex items-center gap-2"
              style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              <Eye size={12} /> Live preview
            </div>

            <div style={{
              backgroundColor: "#FBF8F1", color: "#15161A",
              border: `1px solid ${p.border}`, padding: "24px 28px",
            }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: "#6B665C", letterSpacing: "0.04em", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#15161A" }}>From:</strong> Reservations · The Lodge Suites</div>
                <div><strong style={{ color: "#15161A" }}>To:</strong> Partners · Travel agents · Corporates</div>
                <div><strong style={{ color: "#15161A" }}>Subject:</strong> {renderedSubject || <span style={{ color: "#A09887" }}>—</span>}</div>
              </div>
              <div style={{
                borderTop: "1px solid rgba(0,0,0,0.12)",
                marginTop: 14, paddingTop: 18,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.7,
                color: "#15161A", whiteSpace: "pre-wrap",
                minHeight: 200,
              }}>
                {renderedBody || (
                  <span style={{ color: "#A09887", fontStyle: "italic" }}>
                    Start typing in the body to see the preview.
                  </span>
                )}
              </div>
            </div>

            {usedPlaceholders.length > 0 && (
              <div className="p-3"
                style={{
                  backgroundColor: p.bgPanelAlt, border: `1px dashed ${p.border}`,
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.6,
                }}
              >
                <div style={{ color: p.accent, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
                  Placeholders in this template · {usedPlaceholders.length}
                </div>
                <div style={{ color: p.textSecondary }}>
                  Preview is showing the catalog sample for each. Operators will fill in real values when they pick this template in the composer.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// EmailPreviewModal — full-screen preview of the composed email with all
// placeholders substituted. Falls back to the catalog sample for any
// placeholder the operator hasn't filled in. Lists the recipients along
// the top so the operator can confirm reach before sending.
// ---------------------------------------------------------------------------
function EmailPreviewModal({ subject, body, values, recipients, onClose }) {
  const p = usePalette();
  const renderedSubject = substitutePlaceholders(subject, values);
  const renderedBody    = substitutePlaceholders(body,    values);
  const usedIds         = detectPlaceholders(subject, body);
  const unfilled        = usedIds.filter((id) => !(values[id] && String(values[id]).length > 0));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            Email preview
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.45rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {renderedSubject || "—"}
          </div>
        </div>
        <button onClick={onClose}
          className="flex items-center gap-2 flex-shrink-0"
          style={{
            fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
            fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
            background: "transparent", cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
        ><X size={14} /> Close preview</button>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: p.bgPanelAlt }}>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
          {/* Recipients band */}
          <div className="p-4 mb-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              To · {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
            </div>
            {recipients.length === 0 ? (
              <div className="mt-1.5" style={{ color: p.warn, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
                No recipients selected — pick at least one before sending.
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {recipients.slice(0, 40).map((r) => (
                  <span key={r.id} title={r.email}
                    style={{
                      fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem",
                      padding: "1px 8px", color: p.textSecondary,
                      border: `1px solid ${p.border}`,
                      backgroundColor: p.bgPanelAlt,
                    }}>{r.name}</span>
                ))}
                {recipients.length > 40 && (
                  <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem" }}>
                    + {recipients.length - 40} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Unfilled-placeholder note */}
          {unfilled.length > 0 && (
            <div className="p-3 mb-4 flex items-start gap-2"
              style={{
                backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55,
                color: p.textSecondary,
              }}
            >
              <AlertCircle size={14} style={{ color: p.warn, flexShrink: 0, marginTop: 2 }} />
              <span>
                {unfilled.length === 1 ? "1 placeholder" : `${unfilled.length} placeholders`} have no value yet — preview is using the sample fallback for: {" "}
                {unfilled.map((id, i) => (
                  <code key={id} style={{ color: p.accent, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {`{{${id}}}`}{i < unfilled.length - 1 ? ", " : ""}
                  </code>
                ))}.
              </span>
            </div>
          )}

          {/* Email card — paper-ish background, monospace-ish "From" header */}
          <div style={{
            backgroundColor: "#FBF8F1", color: "#15161A",
            border: `1px solid ${p.border}`,
            padding: "32px 36px",
          }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: "#6B665C", letterSpacing: "0.04em", lineHeight: 1.7 }}>
              <div><strong style={{ color: "#15161A" }}>From:</strong> Reservations · The Lodge Suites &lt;reservations@thelodgesuites.com&gt;</div>
              <div><strong style={{ color: "#15161A" }}>To:</strong> {recipients.length === 0 ? "—" : recipients.map((r) => r.name).join(", ")}</div>
              <div><strong style={{ color: "#15161A" }}>Subject:</strong> {renderedSubject}</div>
            </div>
            <div style={{
              borderTop: "1px solid rgba(0,0,0,0.12)",
              marginTop: 14, paddingTop: 18,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", lineHeight: 1.7,
              color: "#15161A", whiteSpace: "pre-wrap",
            }}>
              {renderedBody}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipientTab — pill that filters the recipient list by type. Shows the
// available count and the currently-selected count from that group.
// ---------------------------------------------------------------------------
function RecipientTab({ id, label, icon: Icon, color, count, sel, active, onClick, p }) {
  const c = color || p.accent;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "0.4rem 0.75rem",
        backgroundColor: active ? `${c}1F` : "transparent",
        border: `1px solid ${active ? c : p.border}`,
        color: active ? c : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        whiteSpace: "nowrap", cursor: "pointer",
      }}
    >
      {Icon && <Icon size={11} />}
      {label}
      <span style={{
        marginInlineStart: 2,
        fontVariantNumeric: "tabular-nums",
        color: active ? c : p.textMuted,
        fontWeight: 600, letterSpacing: "0.04em",
      }}>
        {sel}/{count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// RecipientRow — single recipient checkbox row. Shows name, email,
// type-coded chip, optional metadata (channel status / commission %),
// and a remove button for custom-added rows.
// ---------------------------------------------------------------------------
function RecipientRow({ rec, selected, onToggle, onRemove, p }) {
  const type = TYPE_BY_ID[rec.type] || TYPE_BY_ID.custom;
  const typeColor = p[type.colorKey] || p.accent;
  const disabled = !!rec.disabled;

  return (
    <label
      className="flex items-start gap-2 p-2.5"
      style={{
        border: `1px solid ${selected ? typeColor : p.border}`,
        backgroundColor: selected ? `${typeColor}10` : "transparent",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontFamily: "'Manrope', sans-serif", color: p.textPrimary, fontWeight: 600, fontSize: "0.84rem" }}>
            {rec.name || "(unnamed)"}
          </span>
          <span style={{
            fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            padding: "1px 6px", color: typeColor, border: `1px solid ${typeColor}`,
          }}>
            {type.label === "Corporates" ? "Corp" : type.label === "Agents" ? "Agent" : type.label}
          </span>
          {rec.live && (
            <span className="inline-flex items-center gap-1" title="Channel live"
              style={{ color: p.success, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
              <Wifi size={10} /> Live
            </span>
          )}
          {rec.paused && (
            <span className="inline-flex items-center gap-1" title="Channel paused"
              style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
              <WifiOff size={10} /> Paused
            </span>
          )}
        </div>
        <div style={{
          color: rec.email ? p.textMuted : p.warn,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: "0.7rem", marginTop: 3, wordBreak: "break-all",
        }}>
          {rec.email || "No email on file"}
        </div>
        {rec.meta && (
          <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", marginTop: 2 }}>
            {rec.meta}
          </div>
        )}
      </div>
      {onRemove && (
        <button onClick={(e) => { e.preventDefault(); onRemove(); }} title="Remove custom recipient"
          style={{ color: p.textMuted, padding: 4, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = p.danger; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; }}
        >
          <X size={12} />
        </button>
      )}
    </label>
  );
}
