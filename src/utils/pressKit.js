// pressKit.js — generators for the four downloadable Press-page assets.
// Everything is produced client-side from the in-app data so the operator
// can hand a journalist real files without round-tripping a CMS.
//
//   1. Brand logo pack         → ZIP of SVGs + README + colors.json
//   2. Property fact sheet     → printable HTML (1-page A4 layout)
//   3. High-resolution photos  → ZIP of curated /images/* JPGs + README
//   4. Brand typography & colour → multi-page printable HTML guide
//
// HTML-based assets are designed for browser "Save as PDF" — they include
// `@media print` rules with page breaks so the output reads as a real PDF.
// The Preview action opens the same HTML in a new tab; the Download action
// saves the .html file directly.

import { encodeZip, downloadBlob } from "./zipEncoder.js";

// ---------------------------------------------------------------------------
// Brand constants — identical across every artefact for visual consistency
// ---------------------------------------------------------------------------
const HOTEL = {
  name:    "The Lodge Suites",
  legal:   "The Lodge Hotel Apartments W.L.L.",
  tagline: "We Speak Your Language",
  address: "Building 916, Road 4019, Block 340",
  area:    "Shabab Avenue, Juffair, Manama",
  country: "Kingdom of Bahrain",
  phone:   "+973 1616 8146",
  whatsapp:"+973 3306 9641",
  email:   "frontoffice@thelodgesuites.com",
  press:   "press@thelodgesuites.com",
  ig:      "@thelodgesuites",
  website: "https://www.thelodgesuites.com",
  opened:  "November 2020",
  suites:  72,
};

const PALETTE = [
  { name: "Lodge Gold",    hex: "#C9A961", rgb: "201, 169, 97",  cmyk: "0, 16, 52, 21",   role: "Primary accent · highlights, CTAs, dividers" },
  { name: "Gold Bright",   hex: "#DDC183", rgb: "221, 193, 131", cmyk: "0, 13, 41, 13",   role: "Hover states, decorative pulls" },
  { name: "Gold Deep",     hex: "#9A7E40", rgb: "154, 126, 64",  cmyk: "0, 18, 58, 40",   role: "Type-on-cream, secondary chrome" },
  { name: "Bg Deep",       hex: "#15161A", rgb: "21, 22, 26",    cmyk: "19, 15, 0, 90",   role: "Primary surface · headers, hero" },
  { name: "Bg Charcoal",   hex: "#1E2024", rgb: "30, 32, 36",    cmyk: "17, 11, 0, 86",   role: "Section backgrounds" },
  { name: "Bg Panel",      hex: "#2D2F36", rgb: "45, 47, 54",    cmyk: "17, 13, 0, 79",   role: "Cards, elevated surfaces" },
  { name: "Cream",         hex: "#F5F1E8", rgb: "245, 241, 232", cmyk: "0, 2, 5, 4",      role: "Body text on dark · secondary surfaces" },
  { name: "Paper",         hex: "#FAF7F0", rgb: "250, 247, 240", cmyk: "0, 1, 4, 2",      role: "Editorial body background" },
  { name: "Text on Dark",  hex: "#E8E2D4", rgb: "232, 226, 212", cmyk: "0, 3, 9, 9",      role: "Body type on dark surfaces" },
  { name: "Text Muted",    hex: "#9B9588", rgb: "155, 149, 136", cmyk: "0, 4, 12, 39",    role: "Captions, helper copy" },
  { name: "Navy",          hex: "#1B3A5C", rgb: "27, 58, 92",    cmyk: "71, 37, 0, 64",   role: "Editorial accent" },
  { name: "Burgundy",      hex: "#5C2A2F", rgb: "92, 42, 47",    cmyk: "0, 54, 49, 64",   role: "Editorial accent" },
];

const TYPE = {
  display: { family: "Cormorant Garamond", role: "Editorial headlines, suite names, tier titles, hero", weights: "Light 300 · Regular 400 · Italic 400 · Medium 500", source: "Google Fonts" },
  body:    { family: "Manrope",            role: "Body text, UI labels, captions, navigation",          weights: "Regular 400 · Medium 500 · Semibold 600 · Bold 700",  source: "Google Fonts" },
};

const SUITE_TYPES = [
  { name: "Lodge Studio",                  size: "43 m²",  level: "Floors 9-16",  occ: "2 adults",            beds: "1 King" },
  { name: "Classic One-Bedroom Suite",     size: "60 m²",  level: "Floors 9-16",  occ: "2 adults + 1 child",  beds: "1 King" },
  { name: "Deluxe Two-Bedroom Suite",      size: "142 m²", level: "Floors 17-24", occ: "4 adults + 1 child",  beds: "2 King" },
  { name: "Luxury Three-Bedroom Suite",    size: "150 m²", level: "Floors 17-24", occ: "4 adults + 2 children", beds: "3 King" },
];

const SIGNATURE_AMENITIES = [
  "24-hour multilingual front desk", "Outdoor pool & sundeck", "Sauna & wellness floor",
  "Fully-equipped gym", "Private kitchen in every suite", "55-inch Smart TV in every suite",
  "Soundproofed windows", "Children's play room", "Billiards lounge",
  "24-hour business centre", "Daily housekeeping", "Express check-in & check-out",
];

// ---------------------------------------------------------------------------
// SVG helpers — every logo file in the brand pack is an inline SVG built
// from these small primitives. Using SVG keeps file sizes tiny and looks
// crisp at any size; the recipient can convert to PNG/PDF as needed.
// ---------------------------------------------------------------------------
function svgWordmark({ ink, accent, bg, w = 600, h = 200 }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <title>The Lodge Suites · Wordmark</title>
  ${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ""}
  <g font-family="'Cormorant Garamond', Georgia, serif" text-anchor="middle">
    <text x="${w / 2}" y="${h * 0.46}" font-size="${h * 0.34}" font-weight="400" letter-spacing="6" fill="${ink}">THE LODGE</text>
    <text x="${w / 2}" y="${h * 0.78}" font-size="${h * 0.14}" font-weight="400" letter-spacing="14" fill="${accent}">S U I T E S</text>
  </g>
  <line x1="${w * 0.32}" y1="${h * 0.55}" x2="${w * 0.4}" y2="${h * 0.55}" stroke="${accent}" stroke-width="1"/>
  <line x1="${w * 0.6}"  y1="${h * 0.55}" x2="${w * 0.68}" y2="${h * 0.55}" stroke="${accent}" stroke-width="1"/>
</svg>`;
}

function svgMonogram({ ink, accent, bg, size = 256 }) {
  const s = size;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
  <title>The Lodge Suites · Monogram</title>
  ${bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : ""}
  <rect x="${s * 0.06}" y="${s * 0.06}" width="${s * 0.88}" height="${s * 0.88}" fill="none" stroke="${accent}" stroke-width="1.5"/>
  <text x="${s / 2}" y="${s * 0.66}" text-anchor="middle"
        font-family="'Cormorant Garamond', Georgia, serif"
        font-size="${s * 0.55}" font-style="italic" font-weight="400"
        fill="${ink}" letter-spacing="-2">LS</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// 1 · BRAND LOGO PACK
// ---------------------------------------------------------------------------
export async function buildLogoPackZip() {
  const enc = new TextEncoder();
  const goldHex = "#C9A961";
  const darkHex = "#15161A";
  const creamHex = "#F5F1E8";

  // Eight SVG variants — every combination an editorial designer typically asks for.
  const files = [
    { name: "wordmark/dark-on-cream.svg",   data: enc.encode(svgWordmark({ ink: darkHex,  accent: goldHex,  bg: creamHex })) },
    { name: "wordmark/light-on-dark.svg",   data: enc.encode(svgWordmark({ ink: creamHex, accent: goldHex,  bg: darkHex })) },
    { name: "wordmark/transparent-dark.svg",data: enc.encode(svgWordmark({ ink: darkHex,  accent: goldHex,  bg: null })) },
    { name: "wordmark/transparent-light.svg",data: enc.encode(svgWordmark({ ink: creamHex, accent: goldHex, bg: null })) },
    { name: "wordmark/monochrome-black.svg",data: enc.encode(svgWordmark({ ink: darkHex,  accent: darkHex,  bg: null })) },
    { name: "wordmark/monochrome-white.svg",data: enc.encode(svgWordmark({ ink: creamHex, accent: creamHex, bg: null })) },
    { name: "monogram/dark-on-cream.svg",   data: enc.encode(svgMonogram({ ink: darkHex,  accent: goldHex,  bg: creamHex })) },
    { name: "monogram/light-on-dark.svg",   data: enc.encode(svgMonogram({ ink: creamHex, accent: goldHex,  bg: darkHex })) },
    { name: "monogram/gold-on-dark.svg",    data: enc.encode(svgMonogram({ ink: goldHex,  accent: goldHex,  bg: darkHex })) },
    { name: "monogram/transparent-dark.svg",data: enc.encode(svgMonogram({ ink: darkHex,  accent: goldHex,  bg: null })) },
    { name: "monogram/transparent-light.svg",data: enc.encode(svgMonogram({ ink: creamHex, accent: goldHex, bg: null })) },
    { name: "colors.json", data: enc.encode(JSON.stringify({
      hotel: HOTEL.name,
      version: "2026.1",
      generated: new Date().toISOString(),
      palette: PALETTE,
    }, null, 2)) },
    { name: "README.md", data: enc.encode(`# ${HOTEL.name} · Brand Logo Pack

> ${HOTEL.tagline}

This pack contains every approved variant of the Lodge wordmark and monogram, plus brand colour tokens.

---

## What's inside

\`\`\`
wordmark/
  dark-on-cream.svg          — primary editorial use
  light-on-dark.svg          — dark-background editorial
  transparent-dark.svg       — paste anywhere on a light surface
  transparent-light.svg      — paste anywhere on a dark surface
  monochrome-black.svg       — single-colour print, dark
  monochrome-white.svg       — single-colour print, light

monogram/
  dark-on-cream.svg          — favicon, app icon, social avatar
  light-on-dark.svg
  gold-on-dark.svg           — accent placement only
  transparent-dark.svg
  transparent-light.svg

colors.json                  — full brand palette as machine-readable JSON
\`\`\`

## Clearspace

Always leave a margin equal to the height of the wordmark "S" character around the logo.
On the monogram, leave 8% of the mark size as clearspace.

## Minimum size

- Wordmark: 120 px wide on screen, 25 mm in print
- Monogram: 24 px / 8 mm

## Don'ts

1. Do not skew, rotate, or distort the wordmark
2. Do not place the wordmark on busy photography without a darkened overlay
3. Do not change the gold accent colour — pair it with the approved palette
4. Do not redraw the type — use the supplied SVG only

## Brand colours (also in \`colors.json\`)

${PALETTE.slice(0, 6).map(c => `- **${c.name}** \`${c.hex}\` · ${c.role}`).join("\n")}

…plus six neutrals and editorial accents — see \`colors.json\` for the full set.

## Typography

- **Cormorant Garamond** — display headlines (Light 300, Regular 400, Italic, Medium 500)
- **Manrope** — body, UI, navigation (400, 500, 600, 700)

Both are Google Fonts.

## Press contact

${HOTEL.press}
${HOTEL.phone}

${HOTEL.address}
${HOTEL.area}, ${HOTEL.country}

—

Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · Version 2026.1 · For editorial use under our press policy.
`) },
  ];

  return encodeZip(files, { mime: "application/zip" });
}

export function previewLogoPackHtml() {
  const wordmarkDark  = svgWordmark({ ink: "#15161A", accent: "#C9A961", bg: null });
  const wordmarkLight = svgWordmark({ ink: "#F5F1E8", accent: "#C9A961", bg: null });
  const monoDark      = svgMonogram({ ink: "#15161A", accent: "#C9A961", bg: null, size: 220 });
  const monoLight     = svgMonogram({ ink: "#F5F1E8", accent: "#C9A961", bg: null, size: 220 });
  const monoMono      = svgMonogram({ ink: "#15161A", accent: "#15161A", bg: null, size: 220 });
  return baseHtml({
    title: `${HOTEL.name} · Logo pack preview`,
    body: `
      <header class="hero">
        <div class="eyebrow">Brand Logo Pack · Preview</div>
        <h1>The mark, in every approved variant.</h1>
        <p class="lead">A sampler of the SVGs included in the download. The downloaded ZIP contains six wordmark variants, five monogram variants, a brand-palette JSON, and a usage README.</p>
      </header>
      <section class="grid">
        <figure class="cream"><div class="art">${wordmarkDark}</div><figcaption>Wordmark · dark on cream</figcaption></figure>
        <figure class="dark"><div class="art">${wordmarkLight}</div><figcaption>Wordmark · light on dark</figcaption></figure>
        <figure class="cream"><div class="art" style="display:flex;justify-content:center;">${monoDark}</div><figcaption>Monogram · dark on cream</figcaption></figure>
        <figure class="dark"><div class="art" style="display:flex;justify-content:center;">${monoLight}</div><figcaption>Monogram · light on dark</figcaption></figure>
        <figure class="cream"><div class="art" style="display:flex;justify-content:center;">${monoMono}</div><figcaption>Monogram · monochrome</figcaption></figure>
      </section>
      <section class="palette">
        <h2>Brand palette</h2>
        <div class="swatches">
          ${PALETTE.slice(0, 6).map(c => `
            <div class="sw">
              <div class="chip" style="background:${c.hex};${["#F5F1E8","#FAF7F0","#E8E2D4"].includes(c.hex) ? "border:1px solid #ddd;" : ""}"></div>
              <div class="meta">
                <strong>${c.name}</strong>
                <span class="hex">${c.hex}</span>
                <span class="role">${c.role}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `,
    extraCss: `
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin: 40px 0; }
      figure { margin: 0; padding: 36px 28px; border: 1px solid rgba(0,0,0,0.08); }
      figure.cream { background: #F5F1E8; }
      figure.dark  { background: #15161A; color: #F5F1E8; }
      figure.dark figcaption { color: #C9A961; }
      figure .art svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
      figcaption { margin-top: 18px; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; color: #9A7E40; }
      .palette { margin: 64px 0 32px; }
      .swatches { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 18px; }
      .sw { display: flex; gap: 16px; align-items: center; }
      .sw .chip { width: 72px; height: 72px; flex-shrink: 0; }
      .sw .meta { display: flex; flex-direction: column; gap: 3px; font-size: 12px; line-height: 1.4; }
      .sw strong { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; color: #15161A; font-weight: 500; }
      .sw .hex { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; font-size: 11px; color: #9A7E40; }
      .sw .role { color: #6B665C; }
    `,
  });
}

// ---------------------------------------------------------------------------
// 2 · PROPERTY FACT SHEET (1-page printable HTML)
// ---------------------------------------------------------------------------
export function buildFactSheetHtml() {
  const wordmark = svgWordmark({ ink: "#15161A", accent: "#C9A961", bg: null, w: 360, h: 110 });
  return baseHtml({
    title: `${HOTEL.name} · Fact Sheet`,
    print: true,
    body: `
      <article class="page">
        <header class="head">
          <div class="logo">${wordmark}</div>
          <div class="meta">
            <div class="eyebrow">Property fact sheet</div>
            <div class="issued">Issued ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
          </div>
        </header>

        <section class="positioning">
          <p>A boutique-five-star serviced residence of <strong>${HOTEL.suites} suites</strong> in Juffair, Manama. Designed for guests who travel often and stay long — corporates, families, and quietly discerning leisure travellers.</p>
        </section>

        <section class="cols">
          <div class="col">
            <h3>At a glance</h3>
            <table>
              <tr><th>Operator</th><td>${HOTEL.legal}</td></tr>
              <tr><th>Opened</th><td>${HOTEL.opened}</td></tr>
              <tr><th>Suites</th><td>${HOTEL.suites} · across 4 categories</td></tr>
              <tr><th>Floors</th><td>9–24 (residential)</td></tr>
              <tr><th>Category</th><td>Boutique five-star · long-stay</td></tr>
              <tr><th>Address</th><td>${HOTEL.address}<br>${HOTEL.area}<br>${HOTEL.country}</td></tr>
              <tr><th>Phone</th><td>${HOTEL.phone}</td></tr>
              <tr><th>Email</th><td>${HOTEL.email}</td></tr>
              <tr><th>Website</th><td>${HOTEL.website.replace("https://", "")}</td></tr>
              <tr><th>Instagram</th><td>${HOTEL.ig}</td></tr>
            </table>
          </div>

          <div class="col">
            <h3>Suite categories</h3>
            <table class="suites">
              <thead><tr><th>Suite</th><th>Size</th><th>Floor</th><th>Occupancy</th></tr></thead>
              <tbody>
                ${SUITE_TYPES.map(s => `
                  <tr><td><strong>${s.name}</strong></td><td>${s.size}</td><td>${s.level}</td><td>${s.occ}</td></tr>
                `).join("")}
              </tbody>
            </table>
            <p class="footnote">All suites: fully-equipped private kitchen · private bathroom with bathtub · 55" Smart TV · soundproofed windows · climate control.</p>
          </div>
        </section>

        <section>
          <h3>Signature amenities</h3>
          <ul class="amenities">
            ${SIGNATURE_AMENITIES.map(a => `<li>${a}</li>`).join("")}
          </ul>
        </section>

        <section class="cols small">
          <div class="col">
            <h3>Loyalty</h3>
            <p><strong>LS Privilege</strong> — three tiers (Silver, Gold, Platinum) with member rates from booking one, suite upgrades, late check-out, and free-night certificates as the tiers advance.</p>
          </div>
          <div class="col">
            <h3>Distribution</h3>
            <p>Direct via thelodgesuites.com · GDS · Booking.com · Expedia · Agoda · Hotelbeds · Almosafer (and other regional OTAs). Corporate &amp; Travel-Agent accounts on negotiated rate.</p>
          </div>
          <div class="col">
            <h3>Press contact</h3>
            <p><strong>${HOTEL.press}</strong><br>${HOTEL.phone}<br>WhatsApp ${HOTEL.whatsapp}</p>
          </div>
        </section>

        <footer class="foot">
          <span><strong>${HOTEL.name}</strong> · ${HOTEL.tagline}</span>
          <span>${HOTEL.address}, ${HOTEL.area}, ${HOTEL.country}</span>
        </footer>
      </article>
    `,
    extraCss: `
      @page { size: A4; margin: 14mm; }
      body { background: #FAF7F0; }
      .page { max-width: 800px; margin: 24px auto; background: #fff; padding: 36px 44px; box-shadow: 0 1px 0 rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.06); }
      @media print { .page { box-shadow: none; border: none; padding: 0; margin: 0; max-width: 100%; } body { background: #fff; } }
      .head { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 18px; border-bottom: 2px solid #15161A; }
      .head .logo svg { display: block; height: 70px; width: auto; }
      .head .meta { text-align: right; }
      .head .eyebrow { color: #9A7E40; font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 700; }
      .head .issued { font-size: 11px; color: #444; margin-top: 4px; }
      .positioning p { font-size: 14px; line-height: 1.65; color: #222; margin: 22px 0 10px; }
      h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; font-weight: 500; color: #15161A; margin: 22px 0 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      table th, table td { text-align: left; padding: 7px 0; border-bottom: 1px solid rgba(0,0,0,0.07); vertical-align: top; }
      table th { width: 30%; color: #9A7E40; font-weight: 600; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; }
      table.suites th { width: auto; padding-bottom: 6px; }
      table.suites tbody td { font-size: 11.5px; }
      .footnote { margin-top: 8px; color: #6B665C; font-size: 10.5px; line-height: 1.55; font-style: italic; }
      .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 12px 0; }
      .cols.small { grid-template-columns: repeat(3, 1fr); }
      .cols.small p { font-size: 11.5px; line-height: 1.65; color: #333; }
      .amenities { columns: 3; column-gap: 26px; padding-left: 18px; margin: 6px 0 0; font-size: 12px; line-height: 1.7; }
      .amenities li { break-inside: avoid; }
      .foot { display: flex; justify-content: space-between; gap: 20px; margin-top: 24px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.1); font-size: 10.5px; color: #6B665C; }
    `,
  });
}

// ---------------------------------------------------------------------------
// 3 · HIGH-RESOLUTION PHOTOGRAPHY
// Curated selection of /images/* assets the hotel publishes to press. We
// fetch them client-side, package into a ZIP, and include a contact-sheet
// HTML file so the recipient sees thumbnails + filenames at a glance.
// ---------------------------------------------------------------------------
const PRESS_PHOTO_SELECTION = [
  { file: "exterior-night-signage.jpg", caption: "Property exterior · night, signage detail",  category: "Exterior" },
  { file: "exterior-day.jpg",            caption: "Property exterior · day",                     category: "Exterior" },
  { file: "lobby-main.jpg",              caption: "Lobby · main reception",                       category: "Public spaces" },
  { file: "lobby-lounge.jpg",            caption: "Lobby · lounge seating",                       category: "Public spaces" },
  { file: "suite-bedroom-chandelier.jpg",caption: "One-Bedroom Suite · bedroom",                  category: "Suites" },
  { file: "suite-living-kitchen.jpg",    caption: "Two-Bedroom Suite · open-plan living",         category: "Suites" },
  { file: "presidential-living.jpg",     caption: "Three-Bedroom Suite · living area",            category: "Suites" },
  { file: "suite-studio-open-plan.jpg",  caption: "Lodge Studio · interior",                       category: "Suites" },
  { file: "pool-day.jpg",                caption: "Outdoor pool · daytime",                        category: "Wellness" },
  { file: "gym.jpg",                     caption: "Gym · cardio area",                             category: "Wellness" },
  { file: "sauna.jpg",                   caption: "Sauna",                                          category: "Wellness" },
  { file: "kids-playroom.jpg",           caption: "Children's playroom",                            category: "Family" },
];

async function fetchAsBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function buildPhotoSelectionZip(onProgress) {
  const enc = new TextEncoder();
  const fetched = [];
  for (let i = 0; i < PRESS_PHOTO_SELECTION.length; i++) {
    const p = PRESS_PHOTO_SELECTION[i];
    onProgress?.({ index: i + 1, total: PRESS_PHOTO_SELECTION.length, file: p.file });
    try {
      const bytes = await fetchAsBytes(`/images/${p.file}`);
      fetched.push({ ...p, bytes, ok: true });
    } catch (e) {
      fetched.push({ ...p, ok: false });
    }
  }

  // Pack the photos into a category subtree
  const files = fetched.filter((f) => f.ok).map((f) => ({
    name: `photography/${slug(f.category)}/${f.file}`,
    data: f.bytes,
  }));

  // Contact sheet — HTML index of every photo with caption + filename
  const indexHtml = baseHtml({
    title: `${HOTEL.name} · Photography contact sheet`,
    body: `
      <header class="hero">
        <div class="eyebrow">Press photography</div>
        <h1>Curated selection.</h1>
        <p class="lead">${fetched.filter(f => f.ok).length} images included. Open <code>photography/&lt;category&gt;/</code> for the originals; this contact sheet is your visual index.</p>
      </header>
      <section class="grid">
        ${fetched.map(f => f.ok ? `
          <figure>
            <img src="${slug(f.category)}/${f.file}" alt="${f.caption}">
            <figcaption>
              <span class="cap">${f.caption}</span>
              <span class="file">${slug(f.category)}/${f.file}</span>
            </figcaption>
          </figure>
        ` : "").join("")}
      </section>
    `,
    extraCss: `
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 28px; }
      figure { margin: 0; }
      figure img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; border: 1px solid rgba(0,0,0,0.08); }
      figcaption { display: flex; flex-direction: column; gap: 3px; padding: 10px 0; font-size: 11px; }
      figcaption .cap { color: #15161A; font-weight: 600; }
      figcaption .file { color: #9A7E40; font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; }
    `,
  });

  files.push({
    name: "photography/contact-sheet.html",
    data: enc.encode(indexHtml),
  });

  files.push({
    name: "photography/README.md",
    data: enc.encode(`# ${HOTEL.name} · Press Photography

Curated press selection · ${fetched.filter(f => f.ok).length} images.

## How to use

These images are released for editorial use about ${HOTEL.name}, with credit "${HOTEL.name}" or "Courtesy of ${HOTEL.name}". For commercial / advertising use, please contact ${HOTEL.press}.

Open \`contact-sheet.html\` in any browser for a visual index with filenames.

## Categories

${[...new Set(fetched.filter(f => f.ok).map(f => f.category))].map(c => `- ${c}`).join("\n")}

## High-resolution / additional shots

The selection here is the editorial-friendly subset of our press library.
For 5K+ resolutions, additional angles, or a custom shot list, contact:

**${HOTEL.press}**
${HOTEL.phone} (also WhatsApp on ${HOTEL.whatsapp})

—

Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
`),
  });

  return encodeZip(files, { mime: "application/zip" });
}

function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

// ---------------------------------------------------------------------------
// 4 · BRAND TYPOGRAPHY & COLOUR — multi-page printable guide
// ---------------------------------------------------------------------------
export function buildBrandGuideHtml() {
  const wordmark = svgWordmark({ ink: "#F5F1E8", accent: "#C9A961", bg: null, w: 480, h: 150 });
  return baseHtml({
    title: `${HOTEL.name} · Brand typography & colour`,
    print: true,
    body: `
      <!-- COVER -->
      <section class="page cover">
        <div class="cover-mark">${wordmark}</div>
        <div class="cover-text">
          <div class="eyebrow gold">Brand Standards</div>
          <h1>Typography &amp; Colour.</h1>
          <p class="lead">A short guide to how we look on a page, on a screen, and in print. For editorial designers, partners, and our own teams.</p>
        </div>
        <footer class="cover-foot">
          <span>${HOTEL.name}</span>
          <span>Issued ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          <span>Version 2026.1</span>
        </footer>
      </section>

      <!-- INTRO -->
      <section class="page light">
        <h2 class="display">A quietly luxurious system.</h2>
        <p>The visual language of ${HOTEL.name} is built on contrast: serif against sans-serif, dark against cream, and an art-deco gold accent that earns its way onto every page. The system is permissive but consistent — it can be loud at the right moment and quiet most of the time.</p>
        <div class="principles">
          <div class="principle"><div class="num">01</div><h4>One serif, one sans</h4><p>No additional families. The two work together; nothing else fits.</p></div>
          <div class="principle"><div class="num">02</div><h4>Gold as accent, never field</h4><p>The Lodge gold is for highlights, dividers, and the occasional headline word. Never as a full background colour.</p></div>
          <div class="principle"><div class="num">03</div><h4>Dark dominates editorial</h4><p>For hero blocks and contemplative spaces. Cream paper is for body text and reading.</p></div>
        </div>
      </section>

      <!-- TYPE — DISPLAY -->
      <section class="page light">
        <div class="eyebrow">Typography · 01</div>
        <h2 class="display">Cormorant Garamond.</h2>
        <p class="lead">${TYPE.display.role}. Available in ${TYPE.display.weights}. Source: ${TYPE.display.source}.</p>
        <div class="specimen serif">
          <div class="row big" style="font-weight:300;">A boutique residence,</div>
          <div class="row big italic" style="font-weight:400;color:#9A7E40;">quietly luxurious.</div>
          <div class="row med">Seventy-two suites overlooking Juffair</div>
          <div class="row sml" style="font-style:italic;">For those who travel often and stay long.</div>
          <div class="alphabet">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 — &amp; .,;:!?"'</div>
        </div>
      </section>

      <!-- TYPE — BODY -->
      <section class="page light">
        <div class="eyebrow">Typography · 02</div>
        <h2 class="display">Manrope.</h2>
        <p class="lead">${TYPE.body.role}. Available in ${TYPE.body.weights}. Source: ${TYPE.body.source}.</p>
        <div class="specimen sans">
          <div class="row med" style="font-weight:700;letter-spacing:0.22em;text-transform:uppercase;">Section eyebrow</div>
          <div class="row med">Body paragraph at 14 px / 1.6 line-height. The Lodge's body voice is precise but never mechanical — long sentences when they earn the room, short ones when nothing else needs saying.</div>
          <div class="row sml" style="color:#6B665C;">Caption · supporting copy at 11 px.</div>
          <div class="alphabet sans">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 — &amp; .,;:!?"'</div>
        </div>
      </section>

      <!-- TYPE PAIRING -->
      <section class="page light">
        <div class="eyebrow">Typography · 03</div>
        <h2 class="display">Pairing rules.</h2>
        <ul class="rules">
          <li><strong>Headlines &amp; pull-quotes</strong> always in Cormorant Garamond. Italic gold for emphasis is allowed in line-2 of a two-line headline.</li>
          <li><strong>Sub-titles &amp; eyebrow chips</strong> always in Manrope. 0.22em–0.3em letter-spacing, uppercase, gold.</li>
          <li><strong>Body copy</strong> always in Manrope, regular weight, 14–16 px on screen, 11–12 pt in print.</li>
          <li><strong>Numbers in tables</strong> always tabular-nums (Manrope feature: <code>font-variant-numeric: tabular-nums</code>).</li>
          <li><strong>Never mix</strong> a sans headline with a serif body. The serif always sits above.</li>
        </ul>
      </section>

      <!-- COLOUR — GOLD FAMILY -->
      <section class="page light">
        <div class="eyebrow">Colour · 01</div>
        <h2 class="display">The gold family.</h2>
        <p>Three values do every job. <strong>Lodge Gold</strong> is the hero — accents, dividers, focused highlights. <strong>Bright</strong> is for hover and decorative pulls. <strong>Deep</strong> reads cleanly as type on a cream surface.</p>
        <div class="palette-grid">
          ${PALETTE.slice(0, 3).map(c => paletteCard(c)).join("")}
        </div>
      </section>

      <!-- COLOUR — DARK FAMILY -->
      <section class="page light">
        <div class="eyebrow">Colour · 02</div>
        <h2 class="display">The dark surfaces.</h2>
        <p>Three almost-blacks for layering. The deepest is for hero and primary chrome; the mid-tone for sections; the panel tone for cards and elevated surfaces. Always keep at least 4.5:1 contrast for body text.</p>
        <div class="palette-grid">
          ${PALETTE.slice(3, 6).map(c => paletteCard(c)).join("")}
        </div>
      </section>

      <!-- COLOUR — NEUTRALS -->
      <section class="page light">
        <div class="eyebrow">Colour · 03</div>
        <h2 class="display">Cream &amp; neutrals.</h2>
        <p>Cream is for paper and body-on-dark. Paper is the editorial canvas. The text-on-dark and muted tones are for layered information hierarchy on dark surfaces.</p>
        <div class="palette-grid">
          ${PALETTE.slice(6, 10).map(c => paletteCard(c)).join("")}
        </div>
      </section>

      <!-- COLOUR — ACCENTS -->
      <section class="page light">
        <div class="eyebrow">Colour · 04</div>
        <h2 class="display">Editorial accents.</h2>
        <p>Used sparingly — never as a primary surface, never paired with gold in the same field. Reserve for charts, status pills, and editorial pull-quotes.</p>
        <div class="palette-grid">
          ${PALETTE.slice(10).map(c => paletteCard(c)).join("")}
        </div>
      </section>

      <!-- USAGE EXAMPLES -->
      <section class="page light">
        <div class="eyebrow">Examples</div>
        <h2 class="display">In context.</h2>
        <div class="examples">
          <div class="ex dark">
            <div class="eyebrow gold">Editorial · dark hero</div>
            <div class="example-h">A boutique residence,<br><em>quietly luxurious.</em></div>
            <div class="example-p">Seventy-two suites overlooking Juffair and the Arabian sea.</div>
          </div>
          <div class="ex cream">
            <div class="eyebrow">Editorial · cream paper</div>
            <div class="example-h dark-text">Seventy-two homes <em>for every length of stay.</em></div>
            <div class="example-p dark-text">A mid-tone surface for body type and reading flow.</div>
          </div>
        </div>
      </section>

      <!-- VOICE -->
      <section class="page light">
        <div class="eyebrow">Voice</div>
        <h2 class="display">How we sound.</h2>
        <ul class="voice">
          <li><strong>We don't shout.</strong> If a line needs an exclamation point, it usually needs an edit instead.</li>
          <li><strong>We say things plainly.</strong> "Seventy-two suites" not "luxurious accommodation options."</li>
          <li><strong>We trust the reader.</strong> A short paragraph that ends well beats a long one that explains too much.</li>
          <li><strong>We use the second person carefully.</strong> "You" works for invitations; for everything else, "guests" or "the suite" is more honest.</li>
          <li><strong>We don't translate.</strong> Arabic and English exist side by side, both in their natural register, neither rendered into the other's idiom.</li>
        </ul>
      </section>

      <!-- ACK -->
      <section class="page light">
        <div class="eyebrow">Acknowledgements</div>
        <h2 class="display">Credits &amp; contact.</h2>
        <div class="cols small">
          <div class="col">
            <h4>Typography</h4>
            <p>Cormorant Garamond — Christian Thalmann (CatHarsis Fonts)<br>Manrope — Mikhail Sharanda<br>Both via Google Fonts.</p>
          </div>
          <div class="col">
            <h4>Photography</h4>
            <p>In-house · property archive 2020–2026.<br>Editorial requests: ${HOTEL.press}.</p>
          </div>
          <div class="col">
            <h4>Brand contact</h4>
            <p><strong>${HOTEL.press}</strong><br>${HOTEL.phone}<br>WhatsApp ${HOTEL.whatsapp}</p>
          </div>
        </div>
        <footer class="ack-foot">
          ${HOTEL.name} · ${HOTEL.address}, ${HOTEL.area}, ${HOTEL.country}
        </footer>
      </section>
    `,
    extraCss: `
      @page { size: A4; margin: 0; }
      body { background: #efeae0; }
      .page { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; padding: 30mm 24mm; box-shadow: 0 1px 0 rgba(0,0,0,0.05); page-break-after: always; box-sizing: border-box; }
      .page.cover { background: #15161A; color: #F5F1E8; display: flex; flex-direction: column; justify-content: space-between; }
      .page.cover .cover-mark svg { display: block; height: 110px; margin-bottom: 60px; }
      .page.cover h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 64px; font-weight: 300; line-height: 1.05; color: #F5F1E8; }
      .page.cover .lead { font-size: 14px; color: #E8E2D4; max-width: 480px; margin-top: 24px; line-height: 1.7; opacity: 0.9; }
      .page.cover .eyebrow.gold { color: #C9A961; font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase; font-weight: 700; margin-bottom: 24px; }
      .page.cover .cover-foot { display: flex; justify-content: space-between; gap: 12px; font-size: 10.5px; color: #C9A961; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; }
      @media print { body { background: white; } .page { margin: 0; box-shadow: none; padding: 24mm 20mm; } }
      h2.display { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 42px; font-weight: 400; line-height: 1.05; margin: 0 0 18px; color: #15161A; }
      .eyebrow { color: #9A7E40; font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 700; margin-bottom: 14px; }
      .lead { font-size: 14px; line-height: 1.7; color: #333; margin: 0 0 18px; max-width: 540px; }
      .principles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 28px; }
      .principle { padding: 16px 18px; border-left: 2px solid #C9A961; }
      .principle .num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; color: #9A7E40; font-style: italic; }
      .principle h4 { margin: 6px 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; color: #15161A; }
      .principle p { font-size: 12px; color: #555; line-height: 1.6; }
      .specimen { margin-top: 30px; padding: 28px 0; border-top: 1px solid rgba(0,0,0,0.08); border-bottom: 1px solid rgba(0,0,0,0.08); }
      .specimen.serif .row, .specimen.serif .alphabet { font-family: 'Cormorant Garamond', Georgia, serif; }
      .specimen.sans  .row, .specimen.sans  .alphabet { font-family: 'Manrope', Arial, sans-serif; }
      .specimen .row.big { font-size: 56px; line-height: 1; margin-bottom: 8px; color: #15161A; }
      .specimen .row.big.italic { font-style: italic; }
      .specimen .row.med { font-size: 18px; line-height: 1.55; margin-bottom: 6px; color: #333; }
      .specimen .row.sml { font-size: 13px; line-height: 1.55; color: #555; }
      .specimen .alphabet { margin-top: 22px; font-size: 16px; color: #6B665C; line-height: 1.5; letter-spacing: 0.04em; }
      .rules { padding-left: 20px; line-height: 1.85; font-size: 13px; color: #333; }
      .rules li { margin-bottom: 12px; }
      .rules code { background: #F5F1E8; padding: 1px 5px; font-size: 11px; }
      .palette-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 20px; }
      .pal-card { border: 1px solid rgba(0,0,0,0.08); }
      .pal-card .swatch { height: 100px; }
      .pal-card .pal-meta { padding: 12px 14px; }
      .pal-card .pal-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; color: #15161A; }
      .pal-card .pal-hex { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #9A7E40; margin: 4px 0; }
      .pal-card .pal-rgb { font-size: 10px; color: #6B665C; }
      .pal-card .pal-role { font-size: 10.5px; color: #555; margin-top: 6px; line-height: 1.5; }
      .examples { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
      .ex { padding: 28px; min-height: 200px; }
      .ex.dark { background: #15161A; }
      .ex.cream { background: #F5F1E8; }
      .ex .eyebrow.gold { color: #C9A961; }
      .example-h { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; line-height: 1.1; margin: 14px 0 10px; color: #F5F1E8; font-weight: 300; }
      .example-h em { color: #C9A961; font-weight: 400; }
      .example-h.dark-text { color: #15161A; }
      .example-h.dark-text em { color: #9A7E40; }
      .example-p { font-size: 12px; line-height: 1.6; color: #E8E2D4; opacity: 0.85; }
      .example-p.dark-text { color: #555; }
      .voice { padding-left: 0; list-style: none; max-width: 660px; }
      .voice li { padding: 14px 0; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 13px; line-height: 1.7; color: #333; }
      .voice li strong { color: #15161A; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 500; display: block; margin-bottom: 4px; }
      .cols.small { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 18px; }
      .cols.small h4 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 500; color: #15161A; margin: 0 0 6px; }
      .cols.small p { font-size: 11.5px; line-height: 1.7; color: #444; }
      .ack-foot { margin-top: 60px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 10px; color: #6B665C; letter-spacing: 0.06em; }
    `,
  });
}

function paletteCard(c) {
  const isLight = ["#F5F1E8","#FAF7F0","#E8E2D4","#DDC183"].includes(c.hex);
  return `
    <div class="pal-card">
      <div class="swatch" style="background:${c.hex};${isLight ? "border-bottom:1px solid #ddd;" : ""}"></div>
      <div class="pal-meta">
        <div class="pal-name">${c.name}</div>
        <div class="pal-hex">${c.hex}</div>
        <div class="pal-rgb">RGB ${c.rgb} · CMYK ${c.cmyk}</div>
        <div class="pal-role">${c.role}</div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// HTML shell — used by every preview / printable artefact for visual
// consistency. Loads Google Fonts and applies the brand resets.
// ---------------------------------------------------------------------------
function baseHtml({ title, body, extraCss = "", print = false }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Manrope:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Manrope', -apple-system, Arial, sans-serif; color: #15161A; background: #FAF7F0; font-size: 14px; line-height: 1.55; }
    main, article { max-width: 980px; margin: 0 auto; padding: 32px 24px 80px; }
    .hero { padding: 40px 0 30px; border-bottom: 2px solid #15161A; margin-bottom: 30px; }
    .hero .eyebrow { color: #9A7E40; font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 700; margin-bottom: 14px; }
    .hero h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 44px; line-height: 1.05; font-weight: 400; margin: 0 0 14px; color: #15161A; }
    .hero .lead { font-size: 15px; color: #444; line-height: 1.7; max-width: 640px; }
    h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 400; color: #15161A; margin: 28px 0 14px; }
    code { font-family: ui-monospace, Menlo, monospace; font-size: 0.86em; color: #9A7E40; }
    ${print ? "" : "/* on-screen only */"}
    ${extraCss}
  </style>
</head>
<body>${print ? body : `<main>${body}</main>`}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API: open a preview in a new tab, OR download a file.
// ---------------------------------------------------------------------------
export function openHtmlInNewTab(htmlString, options = {}) {
  const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  // Revoke after a delay so the new tab has time to load
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (options.print && win) {
    win.addEventListener("load", () => setTimeout(() => win.print(), 500), { once: true });
  }
  return win;
}

export function downloadHtml(htmlString, filename) {
  const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
  downloadBlob(blob, filename);
}

export { downloadBlob };
