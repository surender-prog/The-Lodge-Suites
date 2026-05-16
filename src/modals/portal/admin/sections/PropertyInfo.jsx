import React, { useState } from "react";
import { Building2, Calendar as CalendarIcon, CalendarDays, Coins, CreditCard, FileBadge, Globe, Mail, MapPin, Phone, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData, legalLine, formatCurrency } from "../../../../data/store.jsx";
import { Card, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, SelectField, TextField } from "../ui.jsx";

// ---------------------------------------------------------------------------
// PropertyInfo — central record for the property's legal & contact identity.
// Editing here is the single source of truth: changes flow into every
// printable document (confirmation / invoice / receipt / contract), the
// public website footer, the partner-portal headers, and any other surface
// that surfaces the legal address line "CR No. X · VAT No. Y".
// ---------------------------------------------------------------------------
export const PropertyInfo = () => {
  const p = usePalette();
  const {
    hotelInfo, updateHotelInfo, resetHotelInfo,
    eventSupplements, upsertEventSupplement, removeEventSupplement, resetEventSupplements,
  } = useData();
  const [draft, setDraft] = useState(hotelInfo);

  const dirty = JSON.stringify(draft) !== JSON.stringify(hotelInfo);
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    updateHotelInfo(draft);
    pushToast({ message: "Property info saved · documents and footer updated" });
  };
  const reset = () => setDraft(hotelInfo);
  const resetToDefault = () => {
    if (!confirm("Restore property info to the bundled defaults? This wipes any edits.")) return;
    resetHotelInfo();
    pushToast({ message: "Property info reset to defaults" });
  };

  return (
    <div>
      <PageHeader
        title="Property info"
        intro="Single source of truth for the hotel's legal identity, contact details, and banking. These values populate the website footer, every printable confirmation / invoice / receipt / contract, and the headers in the corporate and travel-agent portals."
        action={
          <>
            <GhostBtn onClick={resetToDefault} small>
              <RotateCcw size={11} /> Reset defaults
            </GhostBtn>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* Form column ---------------------------------------------------- */}
        <div className="space-y-5">
          {/* Identity */}
          <Card title="Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Trading name">
                <TextField value={draft.name} onChange={(v) => update({ name: v })} placeholder="The Lodge Suites" />
              </FormGroup>
              <FormGroup label="Legal entity">
                <TextField value={draft.legal} onChange={(v) => update({ legal: v })} placeholder="The Lodge Hotel Apartments W.L.L." />
              </FormGroup>
              <FormGroup label="Tagline" className="sm:col-span-2">
                <TextField value={draft.tagline || ""} onChange={(v) => update({ tagline: v })} placeholder="We Speak Your Language" />
              </FormGroup>
            </div>
          </Card>

          {/* Address */}
          <Card title="Address">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Street / building">
                <TextField value={draft.address} onChange={(v) => update({ address: v })} placeholder="Building 916, Road 4019, Block 340" />
              </FormGroup>
              <FormGroup label="Area / city">
                <TextField value={draft.area} onChange={(v) => update({ area: v })} placeholder="Shabab Avenue, Juffair, Manama" />
              </FormGroup>
              <FormGroup label="Country" className="sm:col-span-2">
                <TextField value={draft.country} onChange={(v) => update({ country: v })} placeholder="Kingdom of Bahrain" />
              </FormGroup>
            </div>
          </Card>

          {/* Legal registration */}
          <Card title="Legal registration">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Commercial registration (CR)">
                <TextField value={draft.cr} onChange={(v) => update({ cr: v })} placeholder="123456-1" />
              </FormGroup>
              <FormGroup label="Tax registration (VAT)">
                <TextField value={draft.vat} onChange={(v) => update({ vat: v })} placeholder="200000123400002" />
              </FormGroup>
              <div className="sm:col-span-2 mt-1 px-3 py-2.5" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                  Document footer line
                </div>
                <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", marginTop: 4 }}>
                  {legalLine(draft) || <span style={{ color: p.textMuted, fontStyle: "italic" }}>— enter CR / VAT to render this line —</span>}
                </div>
              </div>
            </div>
          </Card>

          {/* Contact */}
          <Card title="Contact">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Front desk phone">
                <TextField value={draft.phone} onChange={(v) => update({ phone: v })} placeholder="+973 1616 8146" />
              </FormGroup>
              <FormGroup label="WhatsApp">
                <TextField value={draft.whatsapp || ""} onChange={(v) => update({ whatsapp: v })} placeholder="+973 3306 9641" />
              </FormGroup>
              <FormGroup label="Front desk email">
                <TextField type="email" value={draft.email} onChange={(v) => update({ email: v })} placeholder="frontoffice@thelodgesuites.com" />
              </FormGroup>
              <FormGroup label="Reservations email">
                <TextField type="email" value={draft.emailReservations || ""} onChange={(v) => update({ emailReservations: v })} placeholder="reservations@thelodgesuites.com" />
              </FormGroup>
              <FormGroup label="Accounts email">
                <TextField type="email" value={draft.emailAccounts || ""} onChange={(v) => update({ emailAccounts: v })} placeholder="accounts@thelodgesuites.bh" />
              </FormGroup>
              <FormGroup label="FOM email">
                <TextField type="email" value={draft.emailFom || ""} onChange={(v) => update({ emailFom: v })} placeholder="fom@thelodgesuites.com" />
              </FormGroup>
              <FormGroup label="Sales email">
                <TextField type="email" value={draft.emailSales || ""} onChange={(v) => update({ emailSales: v })} placeholder="sales@exploremena.com" />
              </FormGroup>
              <FormGroup label="Website">
                <TextField value={draft.website} onChange={(v) => update({ website: v })} placeholder="www.thelodgesuites.com" />
              </FormGroup>
            </div>
          </Card>

          {/* Banking */}
          <Card title="Banking · invoice settlements">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Bank name">
                <TextField value={draft.bank || ""} onChange={(v) => update({ bank: v })} placeholder="National Bank of Bahrain" />
              </FormGroup>
              <FormGroup label="IBAN">
                <TextField value={draft.iban || ""} onChange={(v) => update({ iban: v })} placeholder="BH## NBOB ##############" />
              </FormGroup>
            </div>
          </Card>

          {/* Press & media — surfaces on the public Press page (Footer → Press)
              for the press-relations contact card and the spokesperson block. */}
          <Card title="Press & media">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Press email" className="sm:col-span-2">
                <TextField type="email" value={draft.emailPress || ""} onChange={(v) => update({ emailPress: v })} placeholder="press@thelodgesuites.com" />
              </FormGroup>
              <FormGroup label="Spokesperson name">
                <TextField value={draft.spokespersonName || ""} onChange={(v) => update({ spokespersonName: v })} placeholder="Aparajeet Mathad" />
              </FormGroup>
              <FormGroup label="Spokesperson title">
                <TextField value={draft.spokespersonTitle || ""} onChange={(v) => update({ spokespersonTitle: v })} placeholder="Front Office Manager" />
              </FormGroup>
            </div>
          </Card>

          {/* Apple Wallet pass — identifiers baked into the generated .pkpass
              bundle. Change these only when the hotel's Pass Type ID
              certificate or developer team account changes. */}
          <Card title="Membership pass · Apple Wallet">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Pass Type ID">
                <TextField value={draft.passTypeId || ""} onChange={(v) => update({ passTypeId: v })} placeholder="pass.com.thelodgesuites.privilege" />
              </FormGroup>
              <FormGroup label="Apple Team ID">
                <TextField value={draft.appleTeamId || ""} onChange={(v) => update({ appleTeamId: v })} placeholder="<your-team-id-once-enrolled>" />
              </FormGroup>
              <div className="sm:col-span-2 mt-1 px-3 py-2.5" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                  About these fields
                </div>
                <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
                  Baked into every generated <code style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>.pkpass</code> for LS Privilege members. The Pass Type ID and Team ID identify the hotel's Apple Developer account on the wallet pass; the signing service uses them to produce a Wallet-installable file.
                </div>
              </div>
            </div>
          </Card>

          {/* Currency & decimals — the master setting that drives every
              monetary string across the system (booking totals, invoices,
              folios, contracts, the public website, exported reports).
              BHD is sub-divided into 1,000 fils so 3 decimals are the
              norm; operators on a 2-decimal currency (AED / USD / EUR)
              should drop the trailing digit. */}
          <Card title="Currency & decimals">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormGroup label="Currency code">
                <TextField
                  value={draft.currency || ""}
                  onChange={(v) => update({ currency: v.toUpperCase().slice(0, 6) })}
                  placeholder="BHD"
                />
              </FormGroup>
              <FormGroup label="Decimals">
                <TextField
                  type="number"
                  value={String(draft.currencyDecimals ?? 3)}
                  onChange={(v) => {
                    const n = parseInt(v, 10);
                    update({ currencyDecimals: Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 3 });
                  }}
                  placeholder="3"
                />
              </FormGroup>
              <div className="flex flex-col">
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
                  Preview
                </div>
                <div className="flex items-center gap-2 px-3" style={{
                  flex: 1,
                  border: `1px solid ${p.border}`,
                  backgroundColor: p.bgPanelAlt,
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: "1.25rem",
                  color: p.accent,
                  fontWeight: 600,
                }}>
                  <Coins size={14} style={{ color: p.accent }} />
                  {formatCurrency(1234.5678, draft.currency || "BHD", draft.currencyDecimals ?? 3)}
                </div>
              </div>
              <div className="sm:col-span-3 mt-1 px-3 py-2.5" style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
                <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                  About these fields
                </div>
                <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4, lineHeight: 1.55 }}>
                  The code (up to 6 characters) is the label printed in front of every amount — change to <code style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>AED</code>, <code style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>USD</code>, <code style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>EUR</code>, etc. when operating outside Bahrain. Decimals control how many fractional digits appear (BHD uses 3 for fils; most other currencies use 2).
                </div>
              </div>
            </div>
          </Card>

          {/* Operations */}
          <Card title="Operations">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormGroup label="Check-in time">
                <TextField value={draft.checkIn || ""} onChange={(v) => update({ checkIn: v })} placeholder="14:00" />
              </FormGroup>
              <FormGroup label="Check-out time">
                <TextField value={draft.checkOut || ""} onChange={(v) => update({ checkOut: v })} placeholder="12:00" />
              </FormGroup>
              <FormGroup label="Copyright year">
                <TextField value={draft.copyrightYear || ""} onChange={(v) => update({ copyrightYear: v })} placeholder={String(new Date().getFullYear())} />
              </FormGroup>
            </div>
          </Card>

          {/* Event-period supplements — property-wide master for the
              high-demand windows (Eid, F1, Ironman, NYE, etc.). Every
              booking surface reads from this list so a date or amount
              edit flows through contracts, agency rates, walk-up
              bookings, and reports at once. */}
          <EventSupplementsCard
            p={p}
            events={eventSupplements || []}
            onUpsert={upsertEventSupplement}
            onRemove={removeEventSupplement}
            onReset={resetEventSupplements}
          />

          {/* Weekend days — which days of the week are billed at the per-suite
              weekend rate. Picks are stored as JS day-of-week numbers
              (0 = Sun … 6 = Sat). Bahrain & the wider GCC use Fri+Sat by
              default; operators outside the region typically pick Sat+Sun. */}
          <Card title="Weekend days">
            <p style={{ color: p.textSecondary, fontSize: "0.86rem", lineHeight: 1.6, marginBottom: 12 }}>
              Click a day to toggle it as a weekend. Bookings will use each suite's <strong>weekend rate</strong> (set in Rooms &amp; Rates) on these days; every other day uses the weekday rate.
            </p>
            <WeekendDaysPicker
              value={Array.isArray(draft.weekendDays) ? draft.weekendDays : [5, 6]}
              onChange={(next) => update({ weekendDays: next })}
              p={p}
            />
            <div className="mt-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55 }}>
              Most properties in Bahrain &amp; the GCC use Friday + Saturday. Operators outside the GCC typically pick Saturday + Sunday.
            </div>
          </Card>

          {/* Save row */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {dirty && <GhostBtn onClick={reset} small><RotateCcw size={11} /> Discard</GhostBtn>}
            <PrimaryBtn onClick={save} small><Save size={12} /> Save changes</PrimaryBtn>
          </div>
        </div>

        {/* Sidebar — preview of the document header */}
        <div>
          <div className="lg:sticky lg:top-6 space-y-4">
            <SidebarCard p={p} title="Where this appears">
              <UseRow p={p} icon={<FileBadge size={14} />} title="Reservation confirmations" hint="Header & footer of every booking voucher (preview / print / email)." />
              <UseRow p={p} icon={<FileBadge size={14} />} title="Invoices & receipts" hint="Bill-to header, footer line, banking block." />
              <UseRow p={p} icon={<FileBadge size={14} />} title="Corporate & travel-agent contracts" hint="Top-of-document legal block on every signed contract." />
              <UseRow p={p} icon={<Globe size={14} />} title="Website footer" hint="Copyright line on the public homepage." />
              <UseRow p={p} icon={<Building2 size={14} />} title="Partner portal headers" hint="Corporate and Agent workspace document headers." />
              <UseRow p={p} icon={<Coins size={14} />} title="Every monetary value" hint={`All amounts render as ${formatCurrency(0, draft.currency || "BHD", draft.currencyDecimals ?? 3)}. Changing the currency reflows the entire system.`} />
            </SidebarCard>

            <SidebarCard p={p} title="Header preview">
              <div className="p-4" style={{ backgroundColor: "#FBF8F1", color: "#15161A", border: `1px solid ${p.border}`, fontFamily: "'Manrope', sans-serif" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.6rem", fontStyle: "italic", lineHeight: 1.05 }}>
                  {draft.name || "The Lodge Suites"}
                </div>
                <div style={{
                  fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase",
                  color: "#8A7A4F", fontWeight: 700, marginTop: 6,
                }}>
                  {[draft.address, draft.area].filter(Boolean).join(" · ") || "Address"}
                </div>
                <div style={{ fontSize: "0.74rem", color: "#444", marginTop: 4 }}>
                  {[draft.country, legalLine(draft)].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: "0.74rem", color: "#444", marginTop: 6 }}>
                  {draft.phone} · {draft.email}
                </div>
              </div>
            </SidebarCard>

            <SidebarCard p={p} title="Footer preview">
              <div className="p-4" style={{
                backgroundColor: "#15161A", color: "#9A9489",
                border: `1px solid ${p.border}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem",
              }}>
                © {draft.copyrightYear || new Date().getFullYear()} {draft.name} · {draft.area || draft.country}
                {legalLine(draft) ? ` · ${legalLine(draft)}` : ""}
              </div>
              <div className="mt-2" style={{ color: p.textMuted, fontSize: "0.72rem", lineHeight: 1.5, fontFamily: "'Manrope', sans-serif" }}>
                Mirrors what guests see at the bottom of the public website.
              </div>
            </SidebarCard>
          </div>
        </div>
      </div>
    </div>
  );
};

function SidebarCard({ p, title, children }) {
  return (
    <div style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
          {title}
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function UseRow({ p, icon, title, hint }) {
  return (
    <div className="flex items-start gap-2.5">
      <span style={{ color: p.accent, marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div className="min-w-0">
        <div style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", fontWeight: 600 }}>{title}</div>
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", lineHeight: 1.5, marginTop: 2 }}>{hint}</div>
      </div>
    </div>
  );
}

// Toggle-pill row for the seven days of the week. Selected days are stored
// as their JS getDay() index (0 = Sun … 6 = Sat) so they can be checked
// directly with `weekendDays.includes(date.getDay())`.
const WEEKDAY_LABELS = [
  { index: 0, short: "Sun" },
  { index: 1, short: "Mon" },
  { index: 2, short: "Tue" },
  { index: 3, short: "Wed" },
  { index: 4, short: "Thu" },
  { index: 5, short: "Fri" },
  { index: 6, short: "Sat" },
];
function WeekendDaysPicker({ value, onChange, p }) {
  const set = new Set(Array.isArray(value) ? value.map((n) => Number(n)) : []);
  const toggle = (idx) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    onChange(Array.from(next).sort((a, b) => a - b));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAY_LABELS.map((day) => {
        const active = set.has(day.index);
        return (
          <button
            key={day.index}
            type="button"
            onClick={() => toggle(day.index)}
            aria-pressed={active}
            style={{
              padding: "0.45rem 0.95rem",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: active ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
              backgroundColor: active ? p.accent : "transparent",
              border: `1px solid ${active ? p.accent : p.border}`,
              cursor: "pointer",
              minWidth: 64,
              textAlign: "center",
            }}
            onMouseEnter={(e) => {
              if (!active) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }
            }}
            onMouseLeave={(e) => {
              if (!active) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }
            }}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EventSupplementsCard — property-wide master for Eid / F1 / Ironman /
// NYE-style demand windows. Operators edit rows inline; every change is
// persisted to the `event_supplements` singleton and flows through to
// every consumer that reads useData().eventSupplements:
//
//   • ContractEditor (corporate + agency)  — "Import from master" picker
//   • Public BookingModal                  — auto-supplement during stays
//                                            that overlap an active event
//   • Calendar grid (planned)              — visible event ribbon
//   • Reports                              — segment revenue by event
//
// Each row stores: id, name, fromDate, toDate, supplement, active, scope.
// Rows can be deactivated rather than deleted so a cancelled-this-year
// event keeps its dates ready for next year.
// ─────────────────────────────────────────────────────────────────────────
function EventSupplementsCard({ p, events, onUpsert, onRemove, onReset }) {
  const sorted = [...(events || [])].sort((a, b) => {
    const av = a.fromDate || "";
    const bv = b.fromDate || "";
    return av.localeCompare(bv);
  });

  const newRowId = () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const addRow = () => {
    const today = new Date().toISOString().slice(0, 10);
    onUpsert({
      id: newRowId(),
      name: "",
      fromDate: today,
      toDate: today,
      supplement: 0,
      active: true,
      scope: "all",
    });
  };

  return (
    <Card title="Event-period supplements" action={
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{
          color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
          letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
        }}>
          {sorted.length} period{sorted.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={addRow}
          className="flex items-center gap-1.5"
          style={{
            padding: "0.4rem 0.85rem", border: `1px solid ${p.accent}`,
            color: p.accent, backgroundColor: "transparent",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Plus size={11} /> Add period
        </button>
        {sorted.length > 0 && (
          <button
            onClick={() => {
              if (!confirm("Reset the event-period master to the bundled Bahrain defaults (Eid · F1 · Ironman · NYE)? Custom events you've added will be lost.")) return;
              onReset();
              pushToast({ message: "Event-period master reset to defaults" });
            }}
            className="flex items-center gap-1.5"
            style={{
              padding: "0.4rem 0.85rem", border: `1px solid ${p.border}`,
              color: p.textMuted, backgroundColor: "transparent",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          >
            <RotateCcw size={11} /> Reset defaults
          </button>
        )}
      </div>
    }>
      <p style={{ color: p.textSecondary, fontSize: "0.86rem", lineHeight: 1.6, marginBottom: 12 }}>
        Property-wide master for the high-demand windows. Supplements stack on top of any contracted rate during the event window (inclusive of starting and finishing dates). One edit here flows into every contract import, every walk-up booking, and the calendar grid — keeping a single source of truth across the system.
      </p>

      {sorted.length === 0 ? (
        <div className="px-2 py-8 text-center" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
          <CalendarDays size={20} style={{ color: p.textMuted, opacity: 0.45, margin: "0 auto 8px" }} />
          No event periods set.
          <button onClick={addRow} style={{ color: p.accent, fontWeight: 700, marginInlineStart: 6, textDecoration: "underline" }}>
            Add the first period →
          </button>
          <span style={{ display: "block", marginTop: 6 }}>
            or <button onClick={onReset} style={{ color: p.accent, fontWeight: 700, textDecoration: "underline" }}>load the Bahrain defaults</button> (Eid · F1 · Ironman · NYE).
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((evt) => (
            <EventRow key={evt.id} p={p} evt={evt}
              onUpdate={(patch) => onUpsert({ ...evt, ...patch })}
              onRemove={() => {
                if (!confirm(`Remove "${evt.name || "this event"}" from the master? Existing contracts that already imported it keep their copy; only future imports will lose this row.`)) return;
                onRemove(evt.id);
              }}
            />
          ))}
          <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", lineHeight: 1.55, marginTop: 10 }}>
            Supplements apply per room, per night, on top of the contracted or rack rate during the event window. Set <strong>Scope</strong> to limit who sees the event (e.g. corporate-only blackouts). Toggle <strong>Active</strong> off to retire an event temporarily without losing its dates.
          </p>
        </div>
      )}
    </Card>
  );
}

function EventRow({ p, evt, onUpdate, onRemove }) {
  // Light validation: from must be ≤ to. We don't block the input —
  // operators sometimes type dates out of order while editing — but we
  // surface a soft warning so they catch swapped pairs before saving
  // anywhere downstream.
  const fromOk = !!evt.fromDate;
  const toOk   = !!evt.toDate;
  const orderOk = !fromOk || !toOk || evt.fromDate <= evt.toDate;
  const dayCount = (() => {
    if (!fromOk || !toOk) return 0;
    const a = new Date(evt.fromDate);
    const b = new Date(evt.toDate);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.abs(Math.round((b - a) / 86400000)) + 1;
  })();

  return (
    <div style={{
      border: `1px solid ${evt.active === false ? p.border : p.accent + "40"}`,
      borderInlineStart: `3px solid ${evt.active === false ? p.border : p.accent}`,
      padding: "0.7rem 0.85rem", backgroundColor: p.bgPanelAlt,
      opacity: evt.active === false ? 0.65 : 1,
    }}>
      <div className="grid gap-2 items-end" style={{
        gridTemplateColumns: "minmax(150px,1.4fr) minmax(130px,1fr) minmax(130px,1fr) minmax(120px,0.9fr) minmax(120px,0.9fr) auto auto",
      }}>
        <FormGroup label="Event">
          <TextField value={evt.name || ""} onChange={(v) => onUpdate({ name: v })} placeholder="e.g. Formula 1" />
        </FormGroup>
        <FormGroup label="From">
          <TextField type="date" value={evt.fromDate || ""} onChange={(v) => onUpdate({ fromDate: v })} />
        </FormGroup>
        <FormGroup label="To">
          <TextField type="date" value={evt.toDate || ""} onChange={(v) => onUpdate({ toDate: v })} />
        </FormGroup>
        <FormGroup label="Supplement">
          <TextField type="number" value={evt.supplement ?? 0} onChange={(v) => onUpdate({ supplement: Number(v) || 0 })} suffix="BHD" />
        </FormGroup>
        <FormGroup label="Scope">
          <SelectField
            value={evt.scope || "all"}
            onChange={(v) => onUpdate({ scope: v })}
            options={[
              { value: "all",       label: "All bookings" },
              { value: "corporate", label: "Corporate only" },
              { value: "agent",     label: "Travel agent only" },
              { value: "direct",    label: "Direct / walk-up only" },
            ]}
          />
        </FormGroup>
        {/* Active toggle */}
        <button
          onClick={() => onUpdate({ active: evt.active === false })}
          title={evt.active === false ? "Inactive — click to re-enable" : "Active — click to disable"}
          style={{
            padding: "0.55rem 0.4rem",
            color: evt.active === false ? p.textMuted : p.success,
            border: `1px solid ${evt.active === false ? p.border : p.success}`,
            backgroundColor: "transparent",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem",
            letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", alignSelf: "end", marginBottom: 0,
          }}
        >
          {evt.active === false ? "Off" : "On"}
        </button>
        <button
          onClick={onRemove}
          title="Remove event"
          style={{
            color: p.danger, padding: "0.55rem", border: `1px solid ${p.border}`,
            backgroundColor: "transparent",
            alignSelf: "end", marginBottom: 0, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.danger; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted }}>
        <span><CalendarIcon size={10} style={{ display: "inline", marginInlineEnd: 4, verticalAlign: -1 }} />
          {dayCount > 0 ? `${dayCount} night${dayCount === 1 ? "" : "s"}` : "Set a valid date range"}
        </span>
        {!orderOk && (
          <span style={{ color: p.warn, fontWeight: 700 }}>
            Date range is reversed — "From" must be on or before "To".
          </span>
        )}
        {(evt.supplement ?? 0) > 0 && dayCount > 0 && (
          <span>
            ≈ <strong style={{ color: p.accent }}>{formatCurrency((evt.supplement || 0) * dayCount)}</strong> per room across the window
          </span>
        )}
      </div>
    </div>
  );
}
