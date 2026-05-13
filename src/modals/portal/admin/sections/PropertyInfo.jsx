import React, { useState } from "react";
import { Building2, Coins, CreditCard, FileBadge, Globe, Mail, MapPin, Phone, RotateCcw, Save } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData, legalLine, formatCurrency } from "../../../../data/store.jsx";
import { Card, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast, TextField } from "../ui.jsx";

// ---------------------------------------------------------------------------
// PropertyInfo — central record for the property's legal & contact identity.
// Editing here is the single source of truth: changes flow into every
// printable document (confirmation / invoice / receipt / contract), the
// public website footer, the partner-portal headers, and any other surface
// that surfaces the legal address line "CR No. X · VAT No. Y".
// ---------------------------------------------------------------------------
export const PropertyInfo = () => {
  const p = usePalette();
  const { hotelInfo, updateHotelInfo, resetHotelInfo } = useData();
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
