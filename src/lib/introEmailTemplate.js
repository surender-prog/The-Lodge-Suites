// introEmailTemplate.js — composes the introductory-email subject + body that
// sales sends to a new corporate / travel-agent contact after an activity is
// logged. Pure module; no React. The body is the standard intro the operator
// signed off on; only the OPENING sentence varies by activity kind so the email
// feels native to whatever just happened (a call vs a visit vs an email
// exchange). Recipient resolution lives in the modal/store, not here.

// Placeholder substitution for SAVED templates. Operators who customise the
// body and hit "Save as default" should keep {{name}}, {{account}}, {{hotel}},
// {{opener}}, {{owner}} as markers — those get filled in fresh on each send,
// so the saved template stays reusable across different recipients.
export function substituteTemplateVars(text, vars = {}) {
  let out = String(text || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v == null ? "" : String(v));
  }
  return out;
}

// Auto-replace resolved values BACK with their placeholders so an operator
// can hit "Save as default" without manually inserting markers. Sorted by
// value-length DESC so longer values (e.g. full account name) substitute
// before shorter overlapping ones (e.g. the city in the address). Empty
// values are skipped — they'd no-op the entire body.
export function templatizeFromValues(text, vars = {}) {
  let out = String(text || "");
  const entries = Object.entries(vars)
    .filter(([_k, v]) => v && String(v).trim())
    .sort((a, b) => String(b[1]).length - String(a[1]).length);
  for (const [k, v] of entries) {
    out = out.split(String(v)).join(`{{${k}}}`);
  }
  return out;
}

// Wrap plain text in minimal brand-aligned HTML — used when a SAVED template
// is loaded (we don't have the original section structure to re-render the
// gold-callout box, so we fall back to a clean <p>-per-paragraph layout).
export function plainTextToHtml(text) {
  const esc = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = String(text || "").split(/\n{2,}/);
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#15161A;max-width:640px;font-size:14px;line-height:1.55;">${
    paragraphs.map((p) => `<p style="margin:0 0 12px;white-space:pre-line;">${esc(p)}</p>`).join("")
  }</div>`;
}

// Pulled out so the modal can resolve the kind-specific opener without
// rebuilding the entire email (used when applying a saved template).
export function openerForKind(kind) {
  return OPENER_BY_KIND[String(kind || "").toLowerCase()] || FALLBACK_OPENER;
}

const OPENER_BY_KIND = {
  call:    "Thank you for taking my call earlier today. As discussed, I'd like to formally introduce The Lodge Suites and share an exclusive partnership offer for your organisation.",
  email:   "Further to our recent email exchange, I'd like to formally introduce The Lodge Suites and share an exclusive partnership offer for your organisation.",
  visit:   "It was a pleasure meeting with you during our recent visit. I'd like to take this opportunity to formally introduce The Lodge Suites and share an exclusive partnership offer for your organisation.",
  meeting: "It was a pleasure meeting with you recently. I'd like to take this opportunity to formally introduce The Lodge Suites and share an exclusive partnership offer for your organisation.",
  task:    "I'd like to take this opportunity to formally introduce The Lodge Suites and share an exclusive partnership offer for your organisation.",
  note:    "I'd like to take this opportunity to formally introduce The Lodge Suites and share an exclusive partnership offer for your organisation.",
};

const FALLBACK_OPENER = OPENER_BY_KIND.meeting;

// Honorifics / titles the operator might enter in the Contact field instead
// of a real name ("Mr.", "Mrs", "Dr"). Treated as if no name were provided so
// we don't render greetings like "Dear Mr.,".
const TITLE_ONLY = /^(mr|mrs|ms|miss|mister|dr|sir|madam|prof|engr|eng)\.?$/i;

// Pull the most natural first name out of a contact-name string. Returns ""
// when only a title or nothing usable was provided.
function firstNameFrom(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  if (TITLE_ONLY.test(n)) return "";
  const tokens = n.split(/\s+/);
  // "Mr Yusuf" -> "Yusuf"; "Dr Sarah Holloway" -> "Sarah"; etc.
  const first = tokens.find((t) => !TITLE_ONLY.test(t));
  return first || "";
}

const greetingFor = (name) => {
  const first = firstNameFrom(name);
  return first ? `Dear ${first}` : "Dear Sir/Madam";
};

// Exported so the modal can use the SAME resolution for placeholder
// substitution as the default body uses for its greeting.
export function resolveGreetingName(name) {
  return firstNameFrom(name);
}

const signOff = ({ ownerName, ownerTitle, hotelName, phone, email } = {}) => {
  const lines = [];
  if (ownerName) lines.push(ownerName);
  if (ownerTitle) lines.push(ownerTitle);
  lines.push(hotelName || "The Lodge Suites");
  const contact = [phone, email].filter(Boolean).join("  ·  ");
  if (contact) lines.push(contact);
  return lines;
};

// buildIntroEmail — returns { subject, bodyText, bodyHtml }.
//   activity: { kind, contactName, accountName, accountKind, ownerName }
//   hotel:    { name, phone, email }
//   owner:    { name, title, email } — overrides activity.ownerName when set
export function buildIntroEmail({ activity = {}, hotel = {}, owner = {} } = {}) {
  const kind = String(activity.kind || "").toLowerCase();
  const opener = OPENER_BY_KIND[kind] || FALLBACK_OPENER;
  const greeting = greetingFor(activity.contactName);
  const accountName = String(activity.accountName || "").trim();
  const hotelName = hotel.name || "The Lodge Suites";

  const subject = `Introduction & partnership offer · ${hotelName}${accountName ? " · " + accountName : ""}`;

  const ownerName  = owner.name  || activity.ownerName || "";
  const ownerTitle = owner.title || "";
  const ownerEmail = owner.email || hotel.emailSales || hotel.email || "";
  const ownerPhone = hotel.phone || "";

  const sig = signOff({ ownerName, ownerTitle, hotelName, phone: ownerPhone, email: ownerEmail });

  // Plain-text body (canonical) — uses the body of the introduction template
  // the operator provided, with the kind-aware opener stitched in.
  const text = [
    `${greeting},`,
    "",
    `Greetings from ${hotelName}.`,
    "",
    opener,
    "",
    `${hotelName} is a premium all-suite property located in the heart of ${hotel.area || "Bahrain"}, offering spacious accommodations and personalised hospitality services tailored to the needs of both business and leisure travellers. Our suites feature furnished kitchenettes, 55\" Smart TVs, soundproofed windows, complimentary high-speed Wi-Fi and dedicated guest services — a comfortable environment ideal for corporate and extended-stay guests. We are committed to delivering exceptional hospitality while providing competitive corporate rates designed to suit your organisation's requirements.`,
    "",
    `As part of our commitment to establishing a successful partnership with your esteemed organisation, we are pleased to introduce a limited-time corporate offer whereby your company may avail ONE COMPLIMENTARY STAY at our property.`,
    "",
    `Terms & Conditions:`,
    `  •  The complimentary stay is subject to prior reservation and availability.`,
    `  •  The offer is not applicable on weekends and public holidays.`,
    `  •  The complimentary stay is limited to a maximum of two (2) consecutive nights.`,
    `  •  The offer is valid exclusively for corporate / travel-agent partners and cannot be exchanged for cash or transferred to third parties.`,
    "",
    `Additionally, as a gesture of our appreciation and to further support your business needs, we would be delighted to extend complimentary usage of our meeting / conference room facilities for your guests staying at the hotel, subject to prior booking and availability.`,
    "",
    `We believe that these exclusive benefits, combined with our commitment to outstanding service, will make ${hotelName} a preferred accommodation choice for your employees, business associates and visiting guests.`,
    "",
    `Please find our hotel Fact Sheet attached for your kind consideration. We would welcome the opportunity to discuss your accommodation requirements in greater detail and tailor our offerings to best suit your organisation's needs. Should you wish to arrange a property visit, please do not hesitate to contact me at your convenience.`,
    "",
    `Thank you for your time and consideration. We look forward to building a long-lasting and mutually beneficial partnership with your esteemed organisation.`,
    "",
    `Kind regards,`,
    ...sig,
  ].join("\n");

  // HTML body — mirror the text, brand-aligned light layout. The email server
  // sends both `text` and `html`; the html version is rendered when the
  // recipient's client supports it.
  const esc = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const p = (s) => `<p style="margin:0 0 12px;line-height:1.55;">${esc(s)}</p>`;
  const li = (s) => `<li style="margin:0 0 6px;line-height:1.5;">${esc(s)}</li>`;
  const sigHtml = sig.map((l, i) =>
    `<div style="line-height:1.45;${i === 0 ? "font-weight:600;color:#15161A;" : "color:#7A7464;font-size:13px;"}">${esc(l)}</div>`
  ).join("");

  const html = [
    `<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#15161A;max-width:640px;font-size:14px;">`,
      p(`${greeting},`),
      p(`Greetings from ${hotelName}.`),
      p(opener),
      p(`${hotelName} is a premium all-suite property located in the heart of ${hotel.area || "Bahrain"}, offering spacious accommodations and personalised hospitality services tailored to the needs of both business and leisure travellers. Our suites feature furnished kitchenettes, 55″ Smart TVs, soundproofed windows, complimentary high-speed Wi-Fi and dedicated guest services — a comfortable environment ideal for corporate and extended-stay guests. We are committed to delivering exceptional hospitality while providing competitive corporate rates designed to suit your organisation's requirements.`),
      `<div style="border-inline-start:3px solid #C9A961;background:#FBF7EC;padding:12px 16px;margin:0 0 16px;">`,
        `<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C9A961;font-weight:700;margin-bottom:6px;">Limited-time partner offer</div>`,
        `<div style="font-weight:600;color:#15161A;margin-bottom:8px;">One complimentary stay (up to two nights) at our property.</div>`,
        `<ul style="margin:0;padding-inline-start:18px;color:#3F3B33;font-size:13px;">`,
          li("Subject to prior reservation and availability."),
          li("Not applicable on weekends and public holidays."),
          li("Limited to a maximum of two (2) consecutive nights."),
          li("Exclusively for corporate / travel-agent partners; cannot be exchanged for cash or transferred."),
        `</ul>`,
      `</div>`,
      p(`As a gesture of appreciation, we are also pleased to extend complimentary use of our meeting / conference room for your guests staying with us, subject to prior booking and availability.`),
      p(`Please find our hotel Fact Sheet attached for your kind consideration. We'd welcome the opportunity to discuss your accommodation requirements in greater detail and tailor our offerings to best suit your organisation's needs. Should you wish to arrange a property visit, please do not hesitate to contact me at your convenience.`),
      p(`Thank you for your time and consideration. We look forward to building a long-lasting and mutually beneficial partnership.`),
      `<div style="margin-top:18px;">Kind regards,</div>`,
      `<div style="margin-top:6px;">${sigHtml}</div>`,
    `</div>`,
  ].join("");

  return { subject, bodyText: text, bodyHtml: html };
}
