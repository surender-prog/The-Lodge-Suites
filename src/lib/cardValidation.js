// cardValidation.js — real credit-card validation shared across every card
// capture surface (public booking, member portal, corporate drawer, admin
// "book on behalf", admin card vault). Pure functions, no React, so they
// can be unit-tested in Node and reused anywhere.
//
// Goal: reject dummy / test data. A plain Luhn check is NOT enough on its
// own because the well-known gateway test numbers (4242 4242 4242 4242,
// 4111…, 5555…, 378282…) all PASS Luhn. So we layer:
//   1. structural checks (digits, length-by-brand)
//   2. Luhn checksum
//   3. an explicit deny-list of known test PANs + obviously-fake patterns
//      (all-same digit, simple ascending/descending sequences)
//   4. brand acceptance against what the property has finalised
//   5. expiry not in the past, CVV length matching the brand
//
// This is front-of-house sanity validation, not a substitute for a real
// payment gateway authorisation — the only true "is this card real" test is
// an auth/$0 verification, which a gateway integration would add later.

// ── Brand catalogue ────────────────────────────────────────────────────
// Each brand: id (stable key, matches detectCardBrand output), label, the
// IIN/BIN prefix test, valid PAN lengths, and CVV length.
export const CARD_BRANDS = [
  { id: "Visa",       label: "Visa",             test: (d) => /^4/.test(d),                         lengths: [13, 16, 19], cvv: [3] },
  { id: "Mastercard", label: "Mastercard",       test: (d) => /^(5[1-5]|2[2-7])/.test(d),           lengths: [16],         cvv: [3] },
  { id: "Amex",       label: "American Express",  test: (d) => /^3[47]/.test(d),                     lengths: [15],         cvv: [3, 4] },
  { id: "Discover",   label: "Discover",         test: (d) => /^(6011|65|64[4-9]|622)/.test(d),     lengths: [16, 19],     cvv: [3] },
  { id: "Diners",     label: "Diners Club",      test: (d) => /^(36|38|30[0-5])/.test(d),           lengths: [14, 16, 19], cvv: [3] },
  { id: "JCB",        label: "JCB",              test: (d) => /^35(2[89]|[3-8][0-9])/.test(d),      lengths: [16, 19],     cvv: [3] },
];

// Brands a property may accept by default until the admin finalises the list.
export const DEFAULT_ACCEPTED_CARD_BRANDS = ["Visa", "Mastercard", "Amex"];

// Known test / sample PANs that pass Luhn but must never be accepted as real.
const TEST_PANS = new Set([
  "4242424242424242", "4111111111111111", "4012888888881881", "4000056655665556",
  "5555555555554444", "5105105105105100", "2223003122003222", "5200828282828210",
  "378282246310005",  "371449635398431",  "6011111111111117", "6011000990139424",
  "30569309025904",   "38520000023237",   "3530111333300000", "3566002020360505",
  "6011000000000000", "4000000000000002",
]);

// Strip to digits.
const digitsOf = (s) => String(s || "").replace(/\D/g, "");

// Luhn checksum.
export function luhnValid(num) {
  const d = digitsOf(num);
  if (d.length < 12) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// Brand id for a PAN, or null if it matches no known brand prefix.
export function brandOf(num) {
  const d = digitsOf(num);
  const b = CARD_BRANDS.find((x) => x.test(d));
  return b ? b.id : null;
}

// Obvious fakes beyond the explicit deny-list: all-identical digits, or a
// straight ascending / descending run (1234…, 9876…). These can incidentally
// pass Luhn, so catch them structurally.
function isPatternedFake(d) {
  if (/^(\d)\1+$/.test(d)) return true;                       // 0000…, 4444…
  const asc = "01234567890123456789";
  const desc = "98765432109876543210";
  if (asc.includes(d) || desc.includes(d)) return true;       // 123456…, 987654…
  return false;
}

// Is this PAN a known dummy / test / patterned-fake number?
export function isTestPan(num) {
  const d = digitsOf(num);
  if (!d) return false;
  if (TEST_PANS.has(d)) return true;
  if (isPatternedFake(d)) return true;
  return false;
}

// Validate an expiry string. Accepts "MM/YY", "MM/YYYY", "MMYY", "MM YY".
// Returns { ok, reason }. Rejects malformed, impossible months, and past
// months (a card expiring this month is still valid through month-end).
export function validateExpiry(exp) {
  const s = String(exp || "").trim();
  const m = s.match(/^(\d{1,2})\s*[/\-\s]?\s*(\d{2}|\d{4})$/);
  if (!m) return { ok: false, reason: "Enter expiry as MM/YY." };
  const month = parseInt(m[1], 10);
  let year = parseInt(m[2], 10);
  if (m[2].length === 2) year += 2000;
  if (month < 1 || month > 12) return { ok: false, reason: "Expiry month must be 01–12." };
  // Last day of the expiry month, end of day.
  const expEnd = new Date(year, month, 0, 23, 59, 59, 999);
  if (expEnd.getTime() < Date.now()) return { ok: false, reason: "Card has expired." };
  // Sanity ceiling — cards are rarely issued >20y out; catches typos like 2099.
  if (year > new Date().getFullYear() + 20) return { ok: false, reason: "Expiry year looks invalid." };
  return { ok: true };
}

// Full card validation. Returns { ok, brand, errors: {number,name,exp,cvv} }.
// `acceptedBrands` is the property's finalised list (array of brand ids); when
// omitted, every recognised brand is allowed. `cvv` is optional — only
// validated when provided (the admin vault capture may omit it).
export function validateCard(
  { name, number, exp, cvv } = {},
  { acceptedBrands = null, requireCvv = true } = {}
) {
  const errors = {};
  const d = digitsOf(number);
  const brand = brandOf(d);

  // Name
  if (name != null && String(name).trim().length < 2) {
    errors.name = "Enter the cardholder name.";
  }

  // Number
  if (!d) {
    errors.number = "Enter the card number.";
  } else if (!brand) {
    errors.number = "Unrecognised card type.";
  } else {
    const meta = CARD_BRANDS.find((b) => b.id === brand);
    if (!meta.lengths.includes(d.length)) {
      errors.number = `That doesn't look like a valid ${meta.label} number.`;
    } else if (!luhnValid(d)) {
      errors.number = "Card number failed validation — check the digits.";
    } else if (isTestPan(d)) {
      errors.number = "Test / dummy card numbers aren't accepted. Enter a real card.";
    } else if (Array.isArray(acceptedBrands) && acceptedBrands.length > 0 && !acceptedBrands.includes(brand)) {
      const allowed = acceptedBrands
        .map((id) => (CARD_BRANDS.find((b) => b.id === id)?.label) || id)
        .join(", ");
      errors.number = `This property accepts ${allowed} only.`;
    }
  }

  // Expiry
  if (exp != null || requireCvv) {
    const e = validateExpiry(exp);
    if (!e.ok) errors.exp = e.reason;
  }

  // CVV — length depends on brand (Amex = 4).
  if (requireCvv || (cvv != null && String(cvv).length > 0)) {
    const c = digitsOf(cvv);
    const allowedCvv = (CARD_BRANDS.find((b) => b.id === brand)?.cvv) || [3, 4];
    if (!c) errors.cvv = "Enter the CVV.";
    else if (!allowedCvv.includes(c.length)) errors.cvv = `CVV must be ${allowedCvv.join(" or ")} digits.`;
  }

  return { ok: Object.keys(errors).length === 0, brand, errors };
}

// Format a partial PAN with brand-aware grouping as the user types
// (Amex → 4-6-5, everything else → groups of 4). Pure display helper.
export function formatCardNumber(input) {
  const d = digitsOf(input).slice(0, 19);
  if (/^3[47]/.test(d)) {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  }
  return d.replace(/(.{4})/g, "$1 ").trim();
}
