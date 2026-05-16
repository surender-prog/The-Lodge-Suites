import React from "react";
import { Download, Mail, Printer, Send, X } from "lucide-react";
import { usePalette } from "./theme.jsx";
import { legalLine, summarizeTax, useData, formatCurrency, resolveCurrency, getCurrentCurrency, MEAL_PLANS, mealPlanLabel, mealPlanSupplement, enabledMealPlansFor } from "../../data/store.jsx";
import { ensurePlanList, resolveDefaultPlan } from "./ContractEditor.jsx";

// ---------------------------------------------------------------------------
// ContractDocument — printable contract layout shared between Corporate and
// Travel-Agent contracts. The same data shape feeds:
//   • <ContractPreviewModal /> — in-app preview drawer
//   • buildContractHtml() — self-contained HTML string for download / print
//
// The visual is intentionally close to the source PDFs / DOCX agreements:
// black on cream paper, classic typography, A4 print-ready.
//
// Property identity (legal name, address, CR/VAT) is sourced from the
// Property admin section via `useData().hotelInfo`. Non-component callers
// (HTML / email helpers) accept it explicitly as the `hotel` option.
// ---------------------------------------------------------------------------

const FALLBACK_HOTEL = {
  name:     "The Lodge Suites",
  legal:    "The Lodge Hotel Apartments W.L.L.",
  tagline:  "We Speak Your Language",
  address:  "Building 916, Road 4019, Block 340",
  area:     "Shabab Avenue, Juffair, Manama",
  country:  "Kingdom of Bahrain",
  cr:       "#####",
  vat:      "#####",
  phone:    "+973 1616 8146",
  whatsapp: "+973 3306 9641",
  email:    "frontoffice@thelodgesuites.com",
  emailFom: "fom@thelodgesuites.com",
  emailSales: "sales@exploremena.com",
  website:  "www.thelodgesuites.com",
  checkIn:  "14:00",
  checkOut: "12:00",
};

const ROOM_KEYS = [
  { key: "studio",   label: "Lodge Studio",            size: "43 sqm",  level: "9–16",  occ: "2 Adults",            beds: "1 King" },
  { key: "oneBed",   label: "Classic One-Bedroom Suite", size: "60 sqm",  level: "9–16",  occ: "2 Adults + 1 Child",  beds: "1 King" },
  { key: "twoBed",   label: "Deluxe Two-Bedroom Suite", size: "142 sqm", level: "17–24", occ: "4 Adults + 1 Child",  beds: "2 King" },
  { key: "threeBed", label: "Luxury Three-Bedroom",     size: "150 sqm", level: "17–24", occ: "4 Adults + 2 Children", beds: "3 King" },
];

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const todayLong = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------------------
// Field readers — both kinds use slightly different keys for the rate maps,
// so wrap them in a small reader helper that returns a normalized record.
// ---------------------------------------------------------------------------
function readRates(c, kind) {
  const isCorp = kind === "corporate";
  return {
    name:    isCorp ? c.account : c.name,
    daily:   isCorp ? (c.dailyRates   || {}) : (c.dailyNet   || {}),
    weekend: isCorp ? (c.weekendRates || {}) : (c.weekendNet || {}),
    monthly: isCorp ? (c.monthlyRates || {}) : (c.monthlyNet || {}),
    industry: c.industry,
    commissionPct: c.commissionPct,
    marketingFundPct: c.marketingFundPct,
  };
}

const hasAnyRates = (m) => Object.values(m || {}).some(v => Number(v) > 0);

// ---------------------------------------------------------------------------
// React preview component — used in the <ContractPreviewModal />.
// ---------------------------------------------------------------------------
export function ContractDocumentView({ contract, kind }) {
  const data = useData();
  const HOTEL = data?.hotelInfo || FALLBACK_HOTEL;
  // Tax summary pulled live from the configured Tax Setup pattern so any
  // rate / name / component change in admin updates every contract.
  const TAX_LABEL = summarizeTax(data?.tax) || "10% Service Charge, 5% Government Levy, 10% VAT";
  const r = readRates(contract, kind);
  const isCorp = kind === "corporate";
  const showWeekday = hasAnyRates(r.daily);
  const showWeekend = hasAnyRates(r.weekend);
  const showMonthly = hasAnyRates(r.monthly);

  // Running-footer text — kept identical to what the printed @page
  // @bottom-* boxes emit so the preview matches the printed output.
  // (The running header is suppressed on page 1 in both surfaces
  // since the inline banner below covers the same ground.)
  //
  // Compact format: legal name + CR + VAT only. The address, phone
  // and email already live on the cover page's "Issued by" block,
  // so the running footer doesn't need to repeat them on every
  // subsequent page — that just made the line so long it
  // overflowed into the page-counter box on the right.
  const runningFooter = [HOTEL.legal || HOTEL.name, legalLine(HOTEL)].filter(Boolean).join(" · ");

  return (
    // A4-shaped page (210 × 297 mm) so the on-screen preview matches
    // what comes out of the printer. The preview shows ONE page — the
    // browser's print engine handles the rest of the pagination
    // automatically when buildContractHtml is opened in a print
    // iframe (see printContract / downloadContract). The faux running
    // header + footer bands render via positioned overlays so the
    // operator can see roughly what'll appear on every printed page.
    <div style={{
      width: "210mm", minHeight: "297mm",
      margin: "0 auto", backgroundColor: "#FBF8F1", color: "#15161A",
      // First page: shorter top padding because the inline title
      // banner IS the header. Other pages (handled by print's @page
      // rule, not by this preview) reserve a 22mm top margin for the
      // running header band.
      padding: "16mm 16mm 28mm 16mm",
      fontFamily: "'Manrope', sans-serif", fontSize: "10pt", lineHeight: 1.55,
      boxShadow: "0 4px 22px rgba(0,0,0,0.12)",
      position: "relative",
    }}>
      {/* No faux running header on the preview — the preview shows
          page 1, where the inline title banner below already carries
          the property identity. The @page :first rule in
          buildContractHtml suppresses the running header on the
          printed page 1 to match. The running header DOES appear on
          page 2+ when the document spans multiple pages — but that
          only happens at print time. */}

      {/* Faux running footer band — kept on the preview because the
          inline footer was removed from the document body; the only
          place the legal line shows in the preview is here. Matches
          the @page @bottom-* margin boxes that print on every page. */}
      <div style={{
        position: "absolute", bottom: "10mm", left: "16mm", right: "16mm",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        paddingTop: "3mm",
        borderTop: "0.5pt solid rgba(201,169,97,0.55)",
        fontFamily: "'Manrope', sans-serif", fontSize: "7pt", color: "#666",
        pointerEvents: "none",
      }}>
        <span>{runningFooter}</span>
        <span style={{ whiteSpace: "nowrap" }}>Page 1</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 18, borderBottom: "2px solid #15161A" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "2.3rem", fontStyle: "italic", lineHeight: 1.05 }}>{HOTEL.name}</div>
          <div style={{ fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", color: "#8A7A4F", fontWeight: 700, marginTop: 4 }}>{HOTEL.tagline}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.78rem" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.6rem", letterSpacing: "0.05em" }}>
            {isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract Rates"}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.74rem", color: "#444" }}>
            #{contract.id} · Issued {todayLong()}
          </div>
        </div>
      </div>

      {/* Recipient + property identity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginTop: 24 }}>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F", marginBottom: 6 }}>Issued to</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", fontWeight: 600 }}>{r.name || "—"}</div>
          {isCorp && r.industry && <div style={{ color: "#444", fontSize: "0.78rem" }}>{r.industry}</div>}
          {/* Registered address — mirrored from the partner's CR
              certificate. Multi-line so we render each line cleanly
              with whitespace preserved. */}
          {contract.companyAddress && (
            <div style={{ color: "#444", fontSize: "0.78rem", marginTop: 6, whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {contract.companyAddress}
            </div>
          )}
          {/* Statutory IDs — CR + VAT. We render them on every contract
              so the partner's bank / accounts has the legal record at
              the top of the document. Expiry dates included for the
              hotel's own renewal-tracking dashboard; redacted from
              the printed copy via a small caption only on signed
              documents (handled by the operator). */}
          {(contract.crNumber || contract.vatNumber) && (
            <div style={{ color: "#444", fontSize: "0.78rem", marginTop: 8, lineHeight: 1.55 }}>
              {contract.crNumber && (
                <div>CR No.: <strong style={{ color: "#15161A" }}>{contract.crNumber}</strong>
                  {contract.crExpiry && <span style={{ color: "#888", marginInlineStart: 6 }}>· valid to {fmtDate(contract.crExpiry)}</span>}
                </div>
              )}
              {contract.vatNumber && (
                <div>VAT No.: <strong style={{ color: "#15161A" }}>{contract.vatNumber}</strong>
                  {contract.vatExpiry && <span style={{ color: "#888", marginInlineStart: 6 }}>· valid to {fmtDate(contract.vatExpiry)}</span>}
                </div>
              )}
            </div>
          )}
          {contract.pocName  && <div style={{ marginTop: 8 }}>Attn: <strong>{contract.pocName}</strong></div>}
          {contract.pocEmail && <div style={{ color: "#444" }}>{contract.pocEmail}</div>}
          {contract.pocPhone && <div style={{ color: "#444" }}>{contract.pocPhone}</div>}
        </div>
        <div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, color: "#8A7A4F", marginBottom: 6 }}>Issued by</div>
          {/* Legal name + statutory IDs + phone numbers all use
              white-space: nowrap so the column doesn't break long
              tokens like "W.L.L.", "VAT No. 220017519800002", or
              "+973 3306 9641" onto a new line. The address (multi-
              line free text) wraps freely. */}
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.2rem", fontWeight: 600, whiteSpace: "nowrap" }}>{HOTEL.legal}</div>
          <div style={{ color: "#444" }}>{HOTEL.address}</div>
          <div style={{ color: "#444" }}>{HOTEL.area}</div>
          <div style={{ color: "#444" }}>
            <span style={{ whiteSpace: "nowrap" }}>{HOTEL.country}</span>
            {HOTEL.cr  && <> · <span style={{ whiteSpace: "nowrap" }}>CR No. {HOTEL.cr}</span></>}
            {HOTEL.vat && <> · <span style={{ whiteSpace: "nowrap" }}>VAT No. {HOTEL.vat}</span></>}
          </div>
          <div style={{ color: "#444", marginTop: 6 }}>
            <span style={{ whiteSpace: "nowrap" }}>T: {HOTEL.phone}</span>
            {HOTEL.whatsapp && <> · <span style={{ whiteSpace: "nowrap" }}>WhatsApp: {HOTEL.whatsapp}</span></>}
          </div>
          <div style={{ color: "#444", whiteSpace: "nowrap" }}>{HOTEL.email}</div>
        </div>
      </div>

      {/* Greeting */}
      <p style={{ marginTop: 26, fontSize: "0.92rem", lineHeight: 1.7 }}>
        Greetings from <strong>{HOTEL.name}</strong>! We are pleased to extend the following negotiated rate agreement
        to <strong>{r.name || "your organisation"}</strong>, a boutique luxury serviced-apartment property of 72 elegantly
        appointed suites in Juffair, Manama. The rates set out below are valid from <strong>{fmtDate(contract.startsOn)}</strong>
        {" "}to <strong>{fmtDate(contract.endsOn)}</strong> and supersede all previous quotations and communications.
      </p>

      {/* Suite categories reference table */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Suite categories</h3>
      <table style={tblStyle} cellPadding={0}>
        <thead>
          <tr>
            <th style={thStyle}>Suite type</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Floor</th>
            <th style={thStyle}>Occupancy</th>
            <th style={thStyle}>Bedding</th>
          </tr>
        </thead>
        <tbody>
          {ROOM_KEYS.map((rk) => (
            <tr key={rk.key}>
              <td style={tdStyle}><strong>{rk.label}</strong></td>
              <td style={tdStyle}>{rk.size}</td>
              <td style={tdStyle}>{rk.level} flr.</td>
              <td style={tdStyle}>{rk.occ}</td>
              <td style={tdStyle}>{rk.beds}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Rate table */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 28, marginBottom: 8 }}>
        Negotiated rates {!isCorp ? <span style={{ fontSize: "0.78rem", color: "#666", fontStyle: "italic", marginInlineStart: 8 }}>(Net &amp; non-commissionable)</span> : null}
      </h3>
      {(showWeekday || showWeekend || showMonthly) ? (
        <table style={tblStyle} cellPadding={0}>
          <thead>
            <tr>
              <th style={thStyle}>Suite type</th>
              {showWeekday && <th style={thStyle}>Weekday {isCorp ? "rate" : "net"}</th>}
              {showWeekend && <th style={thStyle}>Weekend {isCorp ? "rate" : "net"}</th>}
              {showMonthly && <th style={thStyle}>Monthly {isCorp ? "rate" : "net"}</th>}
            </tr>
          </thead>
          <tbody>
            {ROOM_KEYS.map((rk) => {
              const d  = Number(r.daily[rk.key]   || 0);
              const w  = Number(r.weekend[rk.key] || 0);
              const m  = Number(r.monthly[rk.key] || 0);
              const allZero = d === 0 && w === 0 && m === 0;
              if (allZero) return null;
              return (
                <tr key={rk.key}>
                  <td style={tdStyle}><strong>{rk.label}</strong></td>
                  {showWeekday && <td style={tdNumStyle}>{d > 0 ? formatCurrency(d) : "—"}</td>}
                  {showWeekend && <td style={tdNumStyle}>{w > 0 ? formatCurrency(w) : "—"}</td>}
                  {showMonthly && <td style={tdNumStyle}>{m > 0 ? formatCurrency(m) : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#666", fontStyle: "italic" }}>No rates have been set on this contract.</p>
      )}

      {/* Commercial summary line */}
      <div style={{ marginTop: 14, fontSize: "0.84rem", lineHeight: 1.7, color: "#222" }}>
        <p>
          {contract.taxIncluded
            ? <>All rates above are in <strong>{getCurrentCurrency().code}</strong>, <strong>inclusive</strong> of {TAX_LABEL}, on a per-room, per-night basis (room only).</>
            : <>All rates above are in <strong>{getCurrentCurrency().code}</strong>, exclusive of taxes ({TAX_LABEL}) which will be added at invoicing.</>
          }
        </p>
        {Number(contract.accommodationFee) > 0 && (
          <p style={{ marginTop: 6 }}>
            A <strong>Hotel Accommodation Fee of {formatCurrency(Number(contract.accommodationFee))} net per room per night</strong> is additional and not included in the contracted rates.
          </p>
        )}
        {!isCorp && (typeof r.commissionPct === "number") && (
          <p style={{ marginTop: 6 }}>
            <strong>Commission:</strong>{" "}
            {r.commissionPct === 0
              ? <>Net &amp; non-commissionable.</>
              : <>{r.commissionPct}% on stayed value{r.marketingFundPct ? ` plus ${r.marketingFundPct}% marketing fund` : ""}, payable on departure.</>}
          </p>
        )}
        {Number(contract.weekendUpliftPct) > 0 && !showWeekend && (
          <p style={{ marginTop: 6 }}>
            Weekend uplift of <strong>{contract.weekendUpliftPct}%</strong> applies to all rates from Thursday to Friday inclusive.
          </p>
        )}
      </div>

      {/* Inclusions */}
      {Object.values(contract.inclusions || {}).some(Boolean) && (
        <>
          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Inclusions</h3>
          <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.7 }}>
            {contract.inclusions?.breakfast    && <li>Daily breakfast</li>}
            {contract.inclusions?.lateCheckOut && <li>Guaranteed late check-out (subject to availability)</li>}
            {contract.inclusions?.parking      && <li>Complimentary on-site parking</li>}
            {contract.inclusions?.wifi         && <li>High-speed Wi-Fi throughout the property</li>}
            {contract.inclusions?.meetingRoom  && <li>Meeting room access (subject to availability)</li>}
          </ul>
        </>
      )}

      {/* Meal plans — rendered when the contract negotiates any plan
          beyond RO. Documents EVERY available plan with its per-suite
          supplement so the corporate / agent has a written record of
          the full F&B menu they can pick from at booking. The default
          plan (the one that pre-fills on new bookings) is starred. */}
      {(() => {
        const planList = ensurePlanList(contract.availablePlans, contract.defaultMealPlan)
          .filter((c) => c !== "ro");
        if (planList.length === 0) return null;
        const defPlan = resolveDefaultPlan(contract.availablePlans, contract.defaultMealPlan);
        const planObjs = planList.map((c) => MEAL_PLANS.find((m) => m.code === c)).filter(Boolean);
        const rooms = data?.rooms || [];
        const isMulti = planList.length > 1;
        return (
          <>
            <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>
              Meal plans · {planObjs.map((p) => p.short).join(" · ")}
            </h3>
            <p style={{ fontSize: "0.84rem", color: "#444", marginBottom: 8 }}>
              {isMulti ? (
                <>This {isCorp ? "agreement" : "contract"} includes <strong>{planObjs.length} meal plans</strong>: {planObjs.map((p) => p.label).join(", ")}. The booking creator can pick any of them at reservation time; <strong>{MEAL_PLANS.find((p) => p.code === defPlan)?.label} ({defPlan.toUpperCase()})</strong> pre-fills as the default. The per-suite supplements below apply per adult, per night, on top of the contracted accommodation rate.</>
              ) : (
                <>All reservations under this {isCorp ? "agreement" : "contract"} are issued on the <strong>{planObjs[0].label} ({planObjs[0].short})</strong> plan by default. {planObjs[0].blurb} Per-stay overrides remain available at booking.</>
              )}
            </p>
            <table style={tblStyle} cellPadding={0}>
              <thead>
                <tr>
                  <th style={thStyle}>Suite</th>
                  {planObjs.map((pl) => (
                    <th key={pl.code} style={{
                      ...thStyle, textAlign: "end",
                      backgroundColor: pl.code === defPlan ? "rgba(201,169,97,0.22)" : "rgba(201,169,97,0.08)",
                    }}>
                      {pl.code === defPlan ? "★ " : ""}{pl.short}
                      <div style={{ fontSize: "0.56rem", opacity: 0.7, marginTop: 2, letterSpacing: "0.04em" }}>
                        {pl.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rooms.map((rm) => (
                  <tr key={rm.id}>
                    <td style={tdStyle}>
                      <strong>
                        {rm.id === "studio"    ? "Lodge Studio" :
                         rm.id === "one-bed"   ? "One-Bedroom Suite" :
                         rm.id === "two-bed"   ? "Two-Bedroom Suite" :
                         rm.id === "three-bed" ? "Three-Bedroom Suite" : rm.id}
                      </strong>
                    </td>
                    {planObjs.map((pl) => {
                      const supp = mealPlanSupplement(rm, pl.code);
                      return (
                        <td key={pl.code} style={{
                          ...tdNumStyle,
                          backgroundColor: pl.code === defPlan ? "rgba(201,169,97,0.10)" : "transparent",
                          fontWeight: pl.code === defPlan ? 700 : 600,
                        }}>
                          {supp > 0 ? `+ ${formatCurrency(supp)}` : "Included"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "0.78rem", color: "#666", marginTop: 8, lineHeight: 1.6 }}>
              Supplements are levied per occupying adult per night, in addition to the contracted accommodation rate. Children under 12 dine complimentary from the children's menu under any plan. {isMulti ? "Plans can be mixed across stays for the same guest; reservations confirm one plan per stay." : "Plans may be substituted on request subject to the F&B team's confirmation at least 24 hours prior to arrival."}
            </p>
          </>
        );
      })()}

      {/* House privileges */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>House privileges</h3>
      <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.7, columns: 2 }}>
        <li>24-hour Front Desk</li>
        <li>Express check-in &amp; check-out</li>
        <li>Daily housekeeping</li>
        <li>24-hour security</li>
        <li>Concierge service</li>
        <li>Wireless high-speed internet</li>
        <li>Airport shuttle (chargeable)</li>
        <li>24-hour business centre</li>
      </ul>

      {/* Event supplements */}
      {(contract.eventSupplements || []).length > 0 && (
        <>
          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Event-period supplements</h3>
          <p style={{ fontSize: "0.84rem", color: "#444", marginBottom: 8 }}>
            The hotel allocates a limited number of rooms during major events, with the following supplements applied per room, per night, on top of the contracted rate. Inclusive of starting and finishing dates.
          </p>
          <table style={tblStyle} cellPadding={0}>
            <thead>
              <tr>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Dates</th>
                <th style={thStyle}>Supplement</th>
              </tr>
            </thead>
            <tbody>
              {contract.eventSupplements.map((evt) => (
                <tr key={evt.id}>
                  <td style={tdStyle}><strong>{evt.name}</strong></td>
                  <td style={tdStyle}>
                    {fmtDate(evt.fromDate)}{evt.fromDate !== evt.toDate ? ` → ${fmtDate(evt.toDate)}` : ""}
                  </td>
                  <td style={tdNumStyle}>{formatCurrency(Number(evt.supplement))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Terms & conditions */}
      <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Terms &amp; conditions</h3>
      <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.7, fontSize: "0.84rem" }}>
        <li>Validity: <strong>{fmtDate(contract.startsOn)}</strong> to <strong>{fmtDate(contract.endsOn)}</strong>{contract.signedOn ? ` · Signed on ${fmtDate(contract.signedOn)}` : ""}.</li>
        <li>Check-in {HOTEL.checkIn} · Check-out {HOTEL.checkOut}. Visitors require valid ID or passport at the front desk.</li>
        <li>Children up to 11 years stay free of charge in existing bedding.</li>
        <li>Rooms are subject to stop-sale based on house occupancy; advance bookings are encouraged.</li>
        {contract.cancellationPolicy && <li><strong>Cancellation:</strong> {contract.cancellationPolicy}</li>}
        <li>Payment terms: <strong>{contract.paymentTerms}</strong>{Number(contract.creditLimit) > 0 ? ` · credit limit ${formatCurrency(Number(contract.creditLimit))}` : ""}.</li>
        {!isCorp && <li>Reservations: email <strong>{HOTEL.email}</strong> / <strong>{HOTEL.emailFom}</strong>; WhatsApp {HOTEL.whatsapp}.</li>}
        {isCorp && <li>Direct billing requires CR copy and (for government accounts) an LPO at booking confirmation.</li>}
      </ul>

      {/* Notes */}
      {contract.notes && (
        <>
          <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.4rem", marginTop: 24, marginBottom: 8 }}>Additional notes</h3>
          <p style={{ fontSize: "0.84rem", lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#333" }}>{contract.notes}</p>
        </>
      )}

      {/* Closing */}
      <p style={{ marginTop: 28, fontSize: "0.88rem", lineHeight: 1.7 }}>
        We hope that the above information and privilege rates are to your satisfaction and we look forward to having
        your valued guests stay with us at <strong>{HOTEL.name}</strong>. Should you require any clarifications, please
        contact us at <strong>{HOTEL.email}</strong> or <strong>{HOTEL.emailSales}</strong>.
      </p>
      <p style={{ marginTop: 6, fontSize: "0.88rem", lineHeight: 1.7 }}>
        Kindly counter-sign this letter to confirm acceptance of the terms.
      </p>

      {/* Signatures */}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}>
        <div>
          <div style={{ borderTop: "1px solid #15161A", paddingTop: 6, fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#666", fontWeight: 700 }}>For {HOTEL.name}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.1rem", fontWeight: 600, marginTop: 18 }}>Aparajeet Mathad</div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>Front Office Manager</div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>{HOTEL.phone} · {HOTEL.emailFom}</div>
        </div>
        <div>
          <div style={{ borderTop: "1px solid #15161A", paddingTop: 6, fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#666", fontWeight: 700 }}>Accepted by</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.1rem", fontWeight: 600, marginTop: 18 }}>
            {contract.pocName || `For ${r.name || "the company"}`}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>Authorised Signatory</div>
          <div style={{ fontSize: "0.78rem", color: "#444" }}>Company Seal &amp; Date</div>
        </div>
      </div>

      {/* Inline footer removed — the running footer band at the
          bottom of the preview (and the @page @bottom-* margin
          boxes in print) carry the legal line + page number on
          every page. Keeping the inline footer here showed the
          legal info twice on page 1. */}
    </div>
  );
}

const tblStyle  = { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", marginTop: 4 };
const thStyle   = { borderBottom: "1.5px solid #15161A", padding: "8px 10px", textAlign: "start", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: "#15161A", backgroundColor: "rgba(201,169,97,0.08)" };
const tdStyle   = { borderBottom: "1px solid #d8d2c4", padding: "8px 10px", verticalAlign: "top", color: "#222" };
const tdNumStyle = { ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#15161A" };

// ---------------------------------------------------------------------------
// Self-contained HTML for download — produces a styled, printable single
// HTML file that mirrors <ContractDocumentView />.
// ---------------------------------------------------------------------------
export function buildContractHtml(contract, kind, { hotel, tax, rooms } = {}) {
  // Pull the live tax-summary string from the current Tax Setup if a
  // `tax` config was passed by the caller; otherwise fall back to the
  // bundled-default label so non-React callers (legacy exports) still
  // produce a sane document.
  const TAX_LABEL = summarizeTax(tax) || "10% Service Charge, 5% Government Levy, 10% VAT";
  const HOTEL = hotel || FALLBACK_HOTEL;
  const r = readRates(contract, kind);
  const isCorp = kind === "corporate";
  const showWeekday = hasAnyRates(r.daily);
  const showWeekend = hasAnyRates(r.weekend);
  const showMonthly = hasAnyRates(r.monthly);

  const rateRows = ROOM_KEYS.map((rk) => {
    const d = Number(r.daily[rk.key]   || 0);
    const w = Number(r.weekend[rk.key] || 0);
    const m = Number(r.monthly[rk.key] || 0);
    if (d === 0 && w === 0 && m === 0) return "";
    return `<tr>
      <td><strong>${rk.label}</strong></td>
      ${showWeekday ? `<td class="num">${d > 0 ? escapeHtml(formatCurrency(d)) : "—"}</td>` : ""}
      ${showWeekend ? `<td class="num">${w > 0 ? escapeHtml(formatCurrency(w)) : "—"}</td>` : ""}
      ${showMonthly ? `<td class="num">${m > 0 ? escapeHtml(formatCurrency(m)) : "—"}</td>` : ""}
    </tr>`;
  }).filter(Boolean).join("");

  const incl = [
    contract.inclusions?.breakfast    && "Daily breakfast",
    contract.inclusions?.lateCheckOut && "Guaranteed late check-out (subject to availability)",
    contract.inclusions?.parking      && "Complimentary on-site parking",
    contract.inclusions?.wifi         && "High-speed Wi-Fi throughout the property",
    contract.inclusions?.meetingRoom  && "Meeting room access (subject to availability)",
  ].filter(Boolean);

  const events = (contract.eventSupplements || []).map((evt) => `<tr>
    <td><strong>${escapeHtml(evt.name || "")}</strong></td>
    <td>${fmtDate(evt.fromDate)}${evt.fromDate !== evt.toDate ? " → " + fmtDate(evt.toDate) : ""}</td>
    <td class="num">${escapeHtml(formatCurrency(Number(evt.supplement)))}</td>
  </tr>`).join("");

  // Build the running header / footer strings up front so the @page
  // margin boxes (Chrome's print engine renders these on every page)
  // pull live values straight from the contract + property record.
  // The escapeHtml + string concatenation is intentional — the CSS
  // `content:` property takes a single quoted string, not HTML.
  const docTitle = isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract Rates";
  const runningHeader = `${HOTEL.name} · ${docTitle} · #${contract.id}`;
  // Compact legal line — legal name + CR + VAT. See the matching
  // helper in ContractDocumentView for why the address/phone/email
  // are dropped from the running footer.
  const runningFooter = [HOTEL.legal || HOTEL.name, legalLine(HOTEL)].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)} · ${escapeHtml(contract.id)}</title>
<style>
  /* ──────────────────────────────────────────────────────────────────
     A4 print layout with running header + footer on every page.

     @page margin boxes are part of CSS Paged Media and are rendered
     by Chrome's print engine (which is what window.print() runs
     against from the iframe in printContract). The four key boxes
     used here:
       @top-left  · property name + tagline (small caps, gold)
       @top-right · document title + contract id
       @bottom-left  · full legal line
       @bottom-right · "Page X of Y" counter
     A4 = 210 × 297 mm; we leave 22mm top + 22mm bottom so the
     running bands have breathing room without crowding content.
  ────────────────────────────────────────────────────────────────── */
  @page {
    size: A4;
    /* The running header / footer occupy the top + bottom margins.
       16mm sides keeps the body content well clear of the page
       edge; 24mm top + 20mm bottom give the bands room without
       crowding content. */
    margin: 24mm 16mm 20mm 16mm;

    /* Running header — short hotel name on the left, contract id
       on the right. white-space:nowrap on both stops the browser
       from stacking the text vertically when the corner box is
       narrower than the content. The narrow corner boxes overflow
       inward (toward each other) rather than wrapping, which is
       what we want. */
    @top-left-corner { content: ""; }
    @top-left {
      content: "${escapeForCssContent(HOTEL.name)} \\00B7  ${escapeForCssContent(HOTEL.tagline || "")}";
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: 9.5pt;
      color: #8A7A4F;
      white-space: nowrap;
      vertical-align: bottom;
      padding-bottom: 3mm;
      border-bottom: 0.5pt solid rgba(201,169,97,0.55);
      text-align: left;
    }
    @top-right {
      content: "${escapeForCssContent(docTitle)} \\00B7  #${escapeForCssContent(contract.id)}";
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 7.5pt;
      letter-spacing: 0.04em;
      color: #555;
      white-space: nowrap;
      vertical-align: bottom;
      padding-bottom: 3mm;
      border-bottom: 0.5pt solid rgba(201,169,97,0.55);
      text-align: right;
    }
    @top-right-corner { content: ""; }

    @bottom-left-corner { content: ""; }
    @bottom-left {
      content: "${escapeForCssContent(runningFooter)}";
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 6.5pt;
      color: #666;
      white-space: nowrap;
      vertical-align: top;
      padding-top: 3mm;
      border-top: 0.5pt solid rgba(201,169,97,0.55);
      text-align: left;
    }
    @bottom-right {
      content: "Page " counter(page) " / " counter(pages);
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 6.5pt;
      color: #666;
      white-space: nowrap;
      vertical-align: top;
      padding-top: 3mm;
      border-top: 0.5pt solid rgba(201,169,97,0.55);
      text-align: right;
    }
    @bottom-right-corner { content: ""; }
  }
  /* First page already has the big inline title banner (hotel name +
     tagline + agreement title) — suppressing the running header there
     so the page doesn't show the same property identity twice. The
     running footer (legal line + Page X of Y) stays on every page,
     including the first, because the inline footer was removed. */
  @page :first {
    @top-left  { content: ""; border-bottom: none; }
    @top-right { content: ""; border-bottom: none; }
    margin-top: 16mm;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Manrope', system-ui, -apple-system, sans-serif;
    color: #15161A;
    background: #EFE9DA;
    line-height: 1.55;
    font-size: 11pt;
  }

  /* Screen preview — render the document as stacked A4 sheets so
     operators see exactly what'll come out of the printer. Each
     .page element is a 210 × 297 mm card with the same inner padding
     (16mm sides, 22mm top/bottom) that print uses. */
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 12mm auto;
    padding: 22mm 16mm 22mm 16mm;
    background: #FBF8F1;
    box-shadow: 0 4px 22px rgba(0,0,0,0.12);
    position: relative;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  /* Faux running header / footer for SCREEN preview only — print
     gets these from the @page margin boxes above. */
  @media screen {
    .page::before {
      content: "${escapeForCssContent(HOTEL.name)} \\00B7  ${escapeForCssContent(HOTEL.tagline || "")}";
      position: absolute;
      top: 8mm; left: 16mm; right: 16mm;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: 10pt;
      color: #8A7A4F;
      padding-bottom: 3mm;
      border-bottom: 0.5pt solid rgba(201,169,97,0.55);
    }
    .page::after {
      content: "${escapeForCssContent(runningFooter)}";
      position: absolute;
      bottom: 8mm; left: 16mm; right: 16mm;
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 7pt;
      color: #666;
      padding-top: 3mm;
      border-top: 0.5pt solid rgba(201,169,97,0.55);
      text-align: left;
    }
  }
  @media print {
    body { background: #FBF8F1; }
    .page {
      box-shadow: none;
      margin: 0;
      padding: 0;
      width: auto;
      min-height: 0;
      page-break-after: auto;
    }
  }

  h1, h2, h3, .display { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; }
  h1 { font-size: 22pt; font-style: italic; margin: 0; line-height: 1.05; }
  h2 { font-size: 14pt; margin: 0; letter-spacing: 0.04em; }
  h3 { font-size: 13pt; margin: 18pt 0 6pt; page-break-after: avoid; page-break-inside: avoid; }
  .eyebrow { font-size: 7.5pt; letter-spacing: 0.28em; text-transform: uppercase; color: #8A7A4F; font-weight: 700; }
  .muted { color: #555; }
  .accent { color: #8A7A4F; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14pt; border-bottom: 1.5pt solid #15161A; }
  /* Recipient + property identity block. The "Issued by" column
     carries a 30-character legal name + a 16-digit VAT + a long
     WhatsApp number, so we give it more width than the recipient
     column (1fr) to stop those lines from wrapping mid-token. */
  .meta { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.25fr); gap: 18pt; margin-top: 18pt; page-break-inside: avoid; }
  .meta .display { white-space: nowrap; overflow: visible; }
  /* Phone + VAT lines mustn't break mid-token. */
  .meta .nowrap-line { white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 4pt; page-break-inside: auto; }
  th { border-bottom: 1pt solid #15161A; padding: 6pt 8pt; text-align: start; font-size: 7.5pt; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; background: rgba(201,169,97,0.08); }
  td { border-bottom: 0.5pt solid #d8d2c4; padding: 6pt 8pt; vertical-align: top; }
  /* Don't allow a row to split across a page break — better to bump
     the whole row onto the next page than render half a cell. */
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; } /* table header repeats on each page */
  tfoot { display: table-footer-group; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #15161A; }
  ul.cols { columns: 2; margin: 0; padding-inline-start: 22pt; }
  ul { margin: 0; padding-inline-start: 22pt; line-height: 1.7; }
  /* Signature block + closing paragraph belong together on the
     final page — split would look unprofessional. */
  .sig { margin-top: 30pt; display: grid; grid-template-columns: 1fr 1fr; gap: 42pt; page-break-inside: avoid; }
  .sig .line { border-top: 0.5pt solid #15161A; padding-top: 4pt; font-size: 7.5pt; letter-spacing: 0.22em; text-transform: uppercase; color: #666; font-weight: 700; }
  .pill { display: inline-block; padding: 1px 8px; font-size: 7pt; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; border: 1px solid #C9A961; color: #8A7A4F; margin-inline-start: 8px; }
</style>
</head><body>
<div class="page">
  <div class="header">
    <div>
      <h1>${escapeHtml(HOTEL.name)}</h1>
      <div class="eyebrow" style="margin-top:4px;">${escapeHtml(HOTEL.tagline)}</div>
    </div>
    <div style="text-align:right; font-size:0.78rem;">
      <h2>${escapeHtml(isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract Rates")}</h2>
      <div class="muted" style="margin-top:4px; font-size:0.74rem;">#${escapeHtml(contract.id)} · Issued ${escapeHtml(todayLong())}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Issued to</div>
      <div class="display" style="font-size:1.4rem;">${escapeHtml(r.name || "—")}</div>
      ${isCorp && r.industry ? `<div class="muted" style="font-size:0.78rem;">${escapeHtml(r.industry)}</div>` : ""}
      ${contract.companyAddress ? `<div class="muted" style="font-size:0.78rem;margin-top:6px;white-space:pre-line;line-height:1.5;">${escapeHtml(contract.companyAddress)}</div>` : ""}
      ${(contract.crNumber || contract.vatNumber) ? `<div class="muted" style="font-size:0.78rem;margin-top:8px;line-height:1.55;">
        ${contract.crNumber ? `<div>CR No.: <strong style="color:#15161A;">${escapeHtml(contract.crNumber)}</strong>${contract.crExpiry ? `<span style="color:#888;margin-left:6px;">· valid to ${escapeHtml(fmtDate(contract.crExpiry))}</span>` : ""}</div>` : ""}
        ${contract.vatNumber ? `<div>VAT No.: <strong style="color:#15161A;">${escapeHtml(contract.vatNumber)}</strong>${contract.vatExpiry ? `<span style="color:#888;margin-left:6px;">· valid to ${escapeHtml(fmtDate(contract.vatExpiry))}</span>` : ""}</div>` : ""}
      </div>` : ""}
      ${contract.pocName  ? `<div style="margin-top:8px;">Attn: <strong>${escapeHtml(contract.pocName)}</strong></div>` : ""}
      ${contract.pocEmail ? `<div class="muted">${escapeHtml(contract.pocEmail)}</div>` : ""}
      ${contract.pocPhone ? `<div class="muted">${escapeHtml(contract.pocPhone)}</div>` : ""}
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:6px;">Issued by</div>
      <div class="display" style="font-size:1.2rem; white-space:nowrap;">${escapeHtml(HOTEL.legal)}</div>
      <div class="muted">${escapeHtml(HOTEL.address)}</div>
      <div class="muted">${escapeHtml(HOTEL.area)}</div>
      <!-- Country / CR / VAT — each token wrapped in nowrap so e.g.
           "VAT No. 220017519800002" never breaks between "VAT No." and
           the number itself. Tokens are still separated by middle dots
           and can wrap between tokens if the column is narrow. -->
      <div class="muted">
        <span style="white-space:nowrap;">${escapeHtml(HOTEL.country)}</span>${HOTEL.cr  ? ` &middot; <span style="white-space:nowrap;">CR No. ${escapeHtml(HOTEL.cr)}</span>`  : ""}${HOTEL.vat ? ` &middot; <span style="white-space:nowrap;">VAT No. ${escapeHtml(HOTEL.vat)}</span>` : ""}
      </div>
      <div class="muted" style="margin-top:6px;">
        <span style="white-space:nowrap;">T: ${escapeHtml(HOTEL.phone)}</span>${HOTEL.whatsapp ? ` &middot; <span style="white-space:nowrap;">WhatsApp: ${escapeHtml(HOTEL.whatsapp)}</span>` : ""}
      </div>
      <div class="muted" style="white-space:nowrap;">${escapeHtml(HOTEL.email)}</div>
    </div>
  </div>

  <p style="margin-top:26px; font-size:0.92rem; line-height:1.7;">
    Greetings from <strong>${escapeHtml(HOTEL.name)}</strong>! We are pleased to extend the following negotiated rate
    agreement to <strong>${escapeHtml(r.name || "your organisation")}</strong>, a boutique luxury serviced-apartment
    property of 72 elegantly appointed suites in Juffair, Manama. The rates set out below are valid from
    <strong>${escapeHtml(fmtDate(contract.startsOn))}</strong> to <strong>${escapeHtml(fmtDate(contract.endsOn))}</strong>
    and supersede all previous quotations and communications.
  </p>

  <h3>Suite categories</h3>
  <table>
    <thead><tr><th>Suite type</th><th>Size</th><th>Floor</th><th>Occupancy</th><th>Bedding</th></tr></thead>
    <tbody>
      ${ROOM_KEYS.map((rk) => `<tr><td><strong>${escapeHtml(rk.label)}</strong></td><td>${rk.size}</td><td>${rk.level} flr.</td><td>${rk.occ}</td><td>${rk.beds}</td></tr>`).join("")}
    </tbody>
  </table>

  <h3>Negotiated rates ${!isCorp ? `<span class="muted" style="font-size:0.78rem; font-style:italic; font-family:Manrope, sans-serif; font-weight:400;">(Net &amp; non-commissionable)</span>` : ""}</h3>
  ${rateRows ? `<table>
    <thead><tr>
      <th>Suite type</th>
      ${showWeekday ? `<th>Weekday ${isCorp ? "rate" : "net"}</th>` : ""}
      ${showWeekend ? `<th>Weekend ${isCorp ? "rate" : "net"}</th>` : ""}
      ${showMonthly ? `<th>Monthly ${isCorp ? "rate" : "net"}</th>` : ""}
    </tr></thead>
    <tbody>${rateRows}</tbody>
  </table>` : `<p class="muted" style="font-style:italic;">No rates have been set on this contract.</p>`}

  <div style="margin-top:14px; font-size:0.84rem; line-height:1.7; color:#222;">
    <p>${contract.taxIncluded
      ? `All rates above are in <strong>${escapeHtml(getCurrentCurrency().code)}</strong>, <strong>inclusive</strong> of ${TAX_LABEL}, on a per-room, per-night basis (room only).`
      : `All rates above are in <strong>${escapeHtml(getCurrentCurrency().code)}</strong>, exclusive of taxes (${TAX_LABEL}) which will be added at invoicing.`}</p>
    ${Number(contract.accommodationFee) > 0
      ? `<p style="margin-top:6px;">A <strong>Hotel Accommodation Fee of ${escapeHtml(formatCurrency(Number(contract.accommodationFee)))} net per room per night</strong> is additional and not included in the contracted rates.</p>`
      : ""}
    ${(!isCorp && typeof r.commissionPct === "number")
      ? `<p style="margin-top:6px;"><strong>Commission:</strong> ${r.commissionPct === 0 ? "Net &amp; non-commissionable." : `${r.commissionPct}% on stayed value${r.marketingFundPct ? ` plus ${r.marketingFundPct}% marketing fund` : ""}, payable on departure.`}</p>`
      : ""}
    ${(Number(contract.weekendUpliftPct) > 0 && !showWeekend)
      ? `<p style="margin-top:6px;">Weekend uplift of <strong>${contract.weekendUpliftPct}%</strong> applies to all rates from Thursday to Friday inclusive.</p>`
      : ""}
  </div>

  ${incl.length > 0 ? `<h3>Inclusions</h3><ul>${incl.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}

  ${(() => {
    // Meal plans section — every available plan (RO is the rack
    // baseline, omitted). Default plan is starred and gold-tinted.
    const planList = ensurePlanList(contract.availablePlans, contract.defaultMealPlan).filter((c) => c !== "ro");
    if (planList.length === 0) return "";
    const defPlan  = resolveDefaultPlan(contract.availablePlans, contract.defaultMealPlan);
    const planObjs = planList.map((c) => MEAL_PLANS.find((m) => m.code === c)).filter(Boolean);
    const isMulti  = planObjs.length > 1;

    const headerCells = planObjs.map((pl) => {
      const isDef = pl.code === defPlan;
      const bg = isDef ? "rgba(201,169,97,0.22)" : "rgba(201,169,97,0.08)";
      return `<th class="num" style="background:${bg};">${isDef ? "★ " : ""}${escapeHtml(pl.short)}<div style="font-size:0.56rem;opacity:0.7;margin-top:2px;letter-spacing:0.04em;">${escapeHtml(pl.label)}</div></th>`;
    }).join("");

    const roomRows = (rooms || []).map((rm) => {
      const name = rm.id === "studio"    ? "Lodge Studio"
                : rm.id === "one-bed"   ? "One-Bedroom Suite"
                : rm.id === "two-bed"   ? "Two-Bedroom Suite"
                : rm.id === "three-bed" ? "Three-Bedroom Suite" : rm.id;
      const cells = planObjs.map((pl) => {
        const supp = mealPlanSupplement(rm, pl.code);
        const isDef = pl.code === defPlan;
        const bg = isDef ? "background:rgba(201,169,97,0.10);" : "";
        return `<td class="num" style="${bg}font-weight:${isDef ? 700 : 600};">${supp > 0 ? `+ ${escapeHtml(formatCurrency(supp))}` : "Included"}</td>`;
      }).join("");
      return `<tr><td><strong>${escapeHtml(name)}</strong></td>${cells}</tr>`;
    }).join("");

    const intro = isMulti
      ? `This ${isCorp ? "agreement" : "contract"} includes <strong>${planObjs.length} meal plans</strong>: ${planObjs.map((pl) => escapeHtml(pl.label)).join(", ")}. The booking creator can pick any of them at reservation time; <strong>${escapeHtml(MEAL_PLANS.find((p) => p.code === defPlan)?.label || "")} (${escapeHtml(defPlan.toUpperCase())})</strong> pre-fills as the default. The per-suite supplements below apply per adult, per night, on top of the contracted accommodation rate.`
      : `All reservations under this ${isCorp ? "agreement" : "contract"} are issued on the <strong>${escapeHtml(planObjs[0].label)} (${escapeHtml(planObjs[0].short)})</strong> plan by default. ${escapeHtml(planObjs[0].blurb)} Per-stay overrides remain available at booking.`;

    const footer = isMulti
      ? "Plans can be mixed across stays for the same guest; reservations confirm one plan per stay."
      : "Plans may be substituted on request subject to the F&amp;B team's confirmation at least 24 hours prior to arrival.";

    return `<h3>Meal plans · ${escapeHtml(planObjs.map((pl) => pl.short).join(" · "))}</h3>
      <p class="muted" style="font-size:0.84rem; margin-bottom:8px;">${intro}</p>
      <table><thead><tr><th>Suite</th>${headerCells}</tr></thead><tbody>${roomRows}</tbody></table>
      <p style="font-size:0.78rem; color:#666; margin-top:8px; line-height:1.6;">
        Supplements are levied per occupying adult per night, in addition to the contracted accommodation rate. Children under 12 dine complimentary from the children's menu under any plan. ${footer}
      </p>`;
  })()}

  <h3>House privileges</h3>
  <ul class="cols">
    <li>24-hour Front Desk</li>
    <li>Express check-in &amp; check-out</li>
    <li>Daily housekeeping</li>
    <li>24-hour security</li>
    <li>Concierge service</li>
    <li>Wireless high-speed internet</li>
    <li>Airport shuttle (chargeable)</li>
    <li>24-hour business centre</li>
  </ul>

  ${events ? `<h3>Event-period supplements</h3>
  <p class="muted" style="font-size:0.84rem; margin-bottom:8px;">The hotel allocates a limited number of rooms during major events, with the following supplements applied per room, per night, on top of the contracted rate. Inclusive of starting and finishing dates.</p>
  <table><thead><tr><th>Event</th><th>Dates</th><th>Supplement</th></tr></thead><tbody>${events}</tbody></table>` : ""}

  <h3>Terms &amp; conditions</h3>
  <ul style="font-size:0.84rem;">
    <li>Validity: <strong>${escapeHtml(fmtDate(contract.startsOn))}</strong> to <strong>${escapeHtml(fmtDate(contract.endsOn))}</strong>${contract.signedOn ? ` · Signed on ${escapeHtml(fmtDate(contract.signedOn))}` : ""}.</li>
    <li>Check-in ${HOTEL.checkIn} · Check-out ${HOTEL.checkOut}. Visitors require valid ID or passport at the front desk.</li>
    <li>Children up to 11 years stay free of charge in existing bedding.</li>
    <li>Rooms are subject to stop-sale based on house occupancy; advance bookings are encouraged.</li>
    ${contract.cancellationPolicy ? `<li><strong>Cancellation:</strong> ${escapeHtml(contract.cancellationPolicy)}</li>` : ""}
    <li>Payment terms: <strong>${escapeHtml(contract.paymentTerms || "—")}</strong>${Number(contract.creditLimit) > 0 ? ` · credit limit ${escapeHtml(formatCurrency(Number(contract.creditLimit)))}` : ""}.</li>
    ${!isCorp ? `<li>Reservations: email <strong>${escapeHtml(HOTEL.email)}</strong> / <strong>${escapeHtml(HOTEL.emailFom)}</strong>; WhatsApp ${escapeHtml(HOTEL.whatsapp)}.</li>` : ""}
    ${isCorp ? `<li>Direct billing requires CR copy and (for government accounts) an LPO at booking confirmation.</li>` : ""}
  </ul>

  ${contract.notes ? `<h3>Additional notes</h3><p style="font-size:0.84rem; line-height:1.7; white-space:pre-wrap; color:#333;">${escapeHtml(contract.notes)}</p>` : ""}

  <p style="margin-top:28px; font-size:0.88rem; line-height:1.7;">
    We hope that the above information and privilege rates are to your satisfaction and we look forward to having
    your valued guests stay with us at <strong>${escapeHtml(HOTEL.name)}</strong>. Should you require any clarifications,
    please contact us at <strong>${escapeHtml(HOTEL.email)}</strong> or <strong>${escapeHtml(HOTEL.emailSales)}</strong>.
  </p>
  <p style="margin-top:6px; font-size:0.88rem; line-height:1.7;">
    Kindly counter-sign this letter to confirm acceptance of the terms.
  </p>

  <div class="sig">
    <div>
      <div class="line">For ${escapeHtml(HOTEL.name)}</div>
      <div class="display" style="font-size:1.1rem; margin-top:18px;">Aparajeet Mathad</div>
      <div class="muted" style="font-size:0.78rem;">Front Office Manager</div>
      <div class="muted" style="font-size:0.78rem;">${escapeHtml(HOTEL.phone)} · ${escapeHtml(HOTEL.emailFom)}</div>
    </div>
    <div>
      <div class="line">Accepted by</div>
      <div class="display" style="font-size:1.1rem; margin-top:18px;">${escapeHtml(contract.pocName || `For ${r.name || "the company"}`)}</div>
      <div class="muted" style="font-size:0.78rem;">Authorised Signatory</div>
      <div class="muted" style="font-size:0.78rem;">Company Seal &amp; Date</div>
    </div>
  </div>
  <!-- Inline footer removed — running footer is now drawn by the
       @page @bottom-left / @bottom-right margin boxes on every printed
       page, and by the .page::after pseudo-element on screen. -->
</div>
</body></html>`;
}

// CSS `content:` strings are sensitive to backslashes, quotes, and any
// character that would close the string. Escape minimally so the
// running-header / footer content renders as plain text. The
// double-backslash unicode sequence `\\00B7` is left intact so it
// becomes a real CSS unicode escape — the middle dot separator.
function escapeForCssContent(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r?\n/g, " ");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Side-effect helpers — download HTML, open mailto:, print via popup.
// Each can be called directly from a row action button (without opening
// the preview drawer) or from inside the preview itself.
// ---------------------------------------------------------------------------
export function downloadContract(contract, kind, opts = {}) {
  const html = buildContractHtml(contract, kind, opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const safeId = String(contract.id || "contract").replace(/[^A-Za-z0-9_-]/g, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `LS-${kind === "corporate" ? "Corporate" : "Wholesaler"}-${safeId}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function printContract(contract, kind, opts = {}) {
  const html = buildContractHtml(contract, kind, opts);
  // Iframe approach — works without a pop-up blocker exception (the
  // window.open path was getting silently blocked in Chrome's default
  // policy). We mount a hidden iframe, write the HTML into it, wait
  // for resources to load, fire print, then clean up.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const fire = () => {
    try {
      const w = iframe.contentWindow;
      if (!w) return;
      w.focus();
      w.print();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[printContract] print failed:", err);
    }
    // Detach a bit after the print dialog is dismissed so the browser
    // has time to actually start the print job.
    setTimeout(() => {
      try { iframe.parentNode?.removeChild(iframe); } catch (_) { /* no-op */ }
    }, 2000);
  };

  // Some browsers fire `load` reliably for srcdoc; others don't. We
  // double-up with a setTimeout fallback so the print dialog always
  // pops within ~700ms even if the load event is missed.
  let printed = false;
  const once = () => { if (printed) return; printed = true; fire(); };
  iframe.onload = once;
  // srcdoc is the cleanest way to hand a fully-formed HTML document
  // to an iframe — beats document.open()/write() which sometimes
  // races against the load event.
  iframe.srcdoc = html;
  setTimeout(once, 700);
  return true;
}

export function emailContract(contract, kind, hotel, tax) {
  const HOTEL = hotel || FALLBACK_HOTEL;
  const TAX_LABEL = summarizeTax(tax) || "10% Service Charge, 5% Gov. Levy and 10% VAT";
  const r = readRates(contract, kind);
  const isCorp = kind === "corporate";
  const subject = `${HOTEL.name} · ${isCorp ? "Corporate Rate Agreement" : "Wholesaler Contract"} · ${contract.id}`;

  const lines = [
    `Dear ${contract.pocName || (r.name || "Partner")},`,
    "",
    `Please find below a summary of the negotiated ${isCorp ? "rate agreement" : "wholesaler contract"} between ${HOTEL.name} and ${r.name || "your organisation"}.`,
    "",
    `Contract:        ${contract.id}`,
    `Validity:        ${fmtDate(contract.startsOn)} → ${fmtDate(contract.endsOn)}`,
    `Status:          ${contract.status || "—"}`,
    contract.signedOn ? `Signed on:       ${fmtDate(contract.signedOn)}` : null,
    !isCorp && (typeof r.commissionPct === "number")
      ? `Commission:      ${r.commissionPct === 0 ? "Net & non-commissionable" : `${r.commissionPct}%${r.marketingFundPct ? ` + ${r.marketingFundPct}% MF` : ""}`}`
      : null,
    `Payment terms:   ${contract.paymentTerms || "—"}`,
    Number(contract.creditLimit) > 0 ? `Credit limit:    ${formatCurrency(Number(contract.creditLimit))}` : null,
    "",
    `NEGOTIATED RATES (${getCurrentCurrency().code}):`,
  ].filter(Boolean);

  ROOM_KEYS.forEach((rk) => {
    const d = Number(r.daily[rk.key] || 0);
    const w = Number(r.weekend[rk.key] || 0);
    const m = Number(r.monthly[rk.key] || 0);
    if (d === 0 && w === 0 && m === 0) return;
    const parts = [];
    if (d) parts.push(`Weekday ${d}`);
    if (w) parts.push(`Weekend ${w}`);
    if (m) parts.push(`Monthly ${m.toLocaleString()}`);
    lines.push(`  • ${rk.label.padEnd(28)} ${parts.join(" · ")}`);
  });

  if (Number(contract.accommodationFee) > 0) {
    lines.push("");
    lines.push(`Plus Hotel Accommodation Fee of ${formatCurrency(Number(contract.accommodationFee))} per room per night.`);
  }
  if (contract.taxIncluded) {
    lines.push(`All rates inclusive of ${TAX_LABEL}.`);
  }

  if ((contract.eventSupplements || []).length > 0) {
    lines.push("");
    lines.push("EVENT-PERIOD SUPPLEMENTS:");
    contract.eventSupplements.forEach((evt) => {
      lines.push(`  • ${evt.name} · ${fmtDate(evt.fromDate)}${evt.fromDate !== evt.toDate ? ` → ${fmtDate(evt.toDate)}` : ""} · +${formatCurrency(Number(evt.supplement))}`);
    });
  }

  if (contract.cancellationPolicy) {
    lines.push("");
    lines.push(`Cancellation: ${contract.cancellationPolicy}`);
  }

  lines.push(
    "",
    "The full signed contract document is attached for your records. Please counter-sign and return to confirm acceptance of the terms.",
    "",
    "Kind regards,",
    "Aparajeet Mathad",
    "Front Office Manager",
    `${HOTEL.name}`,
    `${HOTEL.phone} · ${HOTEL.emailFom}`,
  );

  const body = lines.join("\n");
  const to   = contract.pocEmail || (kind === "agent" ? contract.contact : "");
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

// ---------------------------------------------------------------------------
// ContractPreviewModal — full-page preview with toolbar (Email · Download ·
// Print · Close).
// ---------------------------------------------------------------------------
export function ContractPreviewModal({ contract, kind, onClose }) {
  const data = useData();
  const hotel = data?.hotelInfo;
  const rooms = data?.rooms;
  const p = usePalette();
  if (!contract) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
      <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="min-w-0">
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
            Contract preview · {contract.id}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>
            {kind === "corporate" ? contract.account : contract.name} · {kind === "corporate" ? "Corporate Rate Agreement" : "Wholesaler Contract"}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ToolbarBtn onClick={() => emailContract(contract, kind, hotel)}    icon={Mail}    label="Email" p={p} />
          <ToolbarBtn onClick={() => downloadContract(contract, kind, { hotel, rooms })} icon={Download} label="Download" p={p} primary />
          <ToolbarBtn onClick={() => printContract(contract, kind, { hotel, rooms })}    icon={Printer} label="Print" p={p} />
          <button onClick={onClose}
            className="flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
              fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
          ><X size={14} /> Close</button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: "#EFE9DA" }}>
        <div className="py-8 px-4">
          <ContractDocumentView contract={contract} kind={kind} />
        </div>
      </main>
    </div>
  );
}

function ToolbarBtn({ onClick, icon: Icon, label, p, primary }) {
  return (
    <button onClick={onClick}
      style={{
        backgroundColor: primary ? p.accent : "transparent",
        color: primary ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
        border: `1px solid ${primary ? p.accent : p.border}`,
        padding: "0.45rem 0.95rem",
        fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!primary) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
      onMouseLeave={(e) => { if (!primary) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
