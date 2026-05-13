// renderTestingPlan.js — minimal Markdown → HTML converter tailored to
// the admin testing & training plan. Supports the exact subset of
// Markdown used in `public/docs/admin-testing-plan.md` (and only that
// subset) so we don't have to ship a generic parser dependency.
//
// Why bespoke instead of a library?
//   • marked / remark + plugins are ~50–80 KB minified; we'd pay for
//     features (autolinks, syntax highlighting, footnotes) we don't use.
//   • The plan's syntax is a fixed dialect — headings, lists, checkboxes,
//     bold/italic, inline code, horizontal rules, a single table. 60-line
//     regex pass covers all of it.
//
// Two output flavours:
//   • renderTestingPlanHtml(md)       → brand-styled HTML for the PDF
//                                       print path (full font stack, page
//                                       rules, gold accents).
//   • renderTestingPlanWordHtml(md)   → same HTML body wrapped in the
//                                       Microsoft Office HTML container
//                                       (xmlns:o + xmlns:w + ProgId meta)
//                                       so a .doc download opens cleanly
//                                       in Word with formatting intact.

// ─── Inline conversions (run on every line of body text) ─────────────────
function inline(s) {
  let t = s;
  // Escape angle brackets that aren't part of an HTML entity already.
  // The plan body never embeds raw HTML, so this is safe.
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Bold first (greedier match) then italic so `**foo**` doesn't get
  // partially converted to `<em>foo*</em>`. Single underscores are not
  // treated as italic to match the plan's style.
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[\s(])\*(?=\S)([^*]+?)\*(?=$|[\s.,;:)!?])/g, "$1<em>$2</em>");
  // Inline code.
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Em-dash already typed as Unicode in the source; nothing to do.
  return t;
}

// Convert "- [ ] foo" / "- [x] foo" into a checkbox + label.
function renderChecklistItem(text) {
  const m = text.match(/^\[( |x|X)\]\s+(.*)$/);
  if (!m) return `<li>${inline(text)}</li>`;
  const checked = m[1].toLowerCase() === "x";
  return `<li class="cbx"><span class="box${checked ? " on" : ""}" aria-hidden="true">${checked ? "&#10003;" : ""}</span><span>${inline(m[2])}</span></li>`;
}

// ─── Block-level pass ────────────────────────────────────────────────────
// Walks the markdown line-by-line, tracking what kind of block we're in,
// and emits balanced HTML. State machine handles: paragraph · unordered
// list · ordered list · table · code block (the plan only uses a
// language-less table once but we support it generically).
function renderBody(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableHead = false;
  let para = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inline(para.join(" ").trim())}</p>`);
    para = [];
  };
  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };
  const closeTable = () => {
    if (inTable) { out.push("</tbody></table>"); inTable = false; tableHead = false; }
  };
  const closeAll = () => { flushPara(); closeLists(); closeTable(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");

    // Blank line — ends paragraphs and lists.
    if (line.trim() === "") {
      closeAll();
      continue;
    }

    // Horizontal rule.
    if (/^-{3,}$/.test(line.trim())) {
      closeAll();
      out.push("<hr />");
      continue;
    }

    // Headings — # / ## / ### / #### only.
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeAll();
      const n = h[1].length;
      out.push(`<h${n}>${inline(h[2].trim())}</h${n}>`);
      continue;
    }

    // Unordered list — `- ` prefix. Checklist items get special markup.
    const ul = line.match(/^\s*-\s+(.*)$/);
    if (ul) {
      flushPara();
      closeTable();
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(renderChecklistItem(ul[1]));
      continue;
    }

    // Ordered list — `1. ` style.
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      closeTable();
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // Tables — pipe-delimited rows. Two-row minimum (header + separator)
    // before content rows. The separator is `|---|---|`.
    if (line.startsWith("|") && line.endsWith("|")) {
      flushPara();
      closeLists();
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      // The separator row is just dashes; treat as a noop signal that
      // the previous row was the header.
      const isSep = cells.every((c) => /^:?-{2,}:?$/.test(c));
      if (!inTable) {
        out.push("<table><thead><tr>" + cells.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
        inTable = true;
        tableHead = true;
        continue;
      }
      if (isSep && tableHead) {
        tableHead = false;
        continue;
      }
      out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      continue;
    } else if (inTable) {
      closeTable();
    }

    // Default — paragraph continuation. Collapse soft-wraps into one
    // <p> per blank-line-separated block.
    para.push(line.trim());
  }
  closeAll();
  return out.join("\n");
}

// ─── Print-ready HTML doc (used for the PDF download) ────────────────────
// Loads the same brand fonts as the rest of the system and ships a
// `@page` rule + checkbox visuals so the printed copy is readable on A4.
function htmlShell(bodyHtml, { title = "The Lodge Suites — Admin Testing & Training Plan", subtitle = "" } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Manrope', system-ui, -apple-system, sans-serif;
    color: #15161A; background: #F5F1E8;
    margin: 0; padding: 30px; line-height: 1.55; font-size: 12.5px;
  }
  .doc {
    background: #FBF8F1; padding: 44px 56px;
    max-width: 880px; margin: 0 auto;
    box-shadow: 0 4px 22px rgba(0,0,0,0.05);
  }
  .header {
    padding-bottom: 18px; margin-bottom: 22px;
    border-bottom: 2px solid #15161A;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 18px;
  }
  .header .brand {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.8rem; font-style: italic; line-height: 1.05;
  }
  .header .eyebrow {
    font-size: 0.66rem; letter-spacing: 0.28em;
    text-transform: uppercase; color: #8A7A4F; font-weight: 700; margin-top: 6px;
  }
  .header .subtitle {
    font-size: 0.78rem; color: #444; margin-top: 4px;
  }
  h1 {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 500; font-size: 2.2rem; line-height: 1.05;
    margin: 0 0 14px;
  }
  h2 {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 600; font-size: 1.45rem; line-height: 1.15;
    margin: 28px 0 10px; padding-top: 8px;
    border-top: 1px solid #d8d2c4;
  }
  h3 {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 600; font-size: 1.15rem;
    margin: 18px 0 8px; color: #15161A;
  }
  h4 {
    font-family: 'Manrope', sans-serif;
    font-size: 0.78rem; letter-spacing: 0.22em; text-transform: uppercase;
    font-weight: 700; color: #8A7A4F; margin: 16px 0 6px;
  }
  p { margin: 0 0 10px; }
  strong { color: #15161A; font-weight: 700; }
  em { color: #444; }
  code {
    font-family: ui-monospace, Menlo, monospace;
    background: rgba(201,169,97,0.12);
    padding: 1px 5px; border-radius: 2px;
    font-size: 0.85em;
  }
  hr {
    border: none; border-top: 1px solid #d8d2c4; margin: 18px 0;
  }
  ul, ol { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 4px; line-height: 1.55; }
  li.cbx { list-style: none; display: flex; gap: 8px; align-items: flex-start; margin-left: -16px; }
  li.cbx .box {
    flex-shrink: 0;
    display: inline-block; width: 13px; height: 13px;
    border: 1.5px solid #15161A; background: #FFFFFF;
    margin-top: 4px; text-align: center; line-height: 11px;
    font-size: 11px; font-weight: 700; color: #15161A;
  }
  li.cbx .box.on { background: #C9A961; border-color: #8A7A4F; color: #15161A; }
  table {
    width: 100%; border-collapse: collapse;
    margin: 10px 0 14px; font-size: 0.92em;
  }
  th, td {
    border: 1px solid #d8d2c4; padding: 6px 9px;
    text-align: left; vertical-align: top;
  }
  th {
    background: rgba(201,169,97,0.10);
    font-size: 0.66rem; letter-spacing: 0.18em;
    text-transform: uppercase; font-weight: 700; color: #15161A;
  }
  .footer {
    margin-top: 28px; padding-top: 14px;
    border-top: 1px solid #C9A961;
    font-size: 0.66rem; color: #666; text-align: center;
    letter-spacing: 0.04em;
  }
  /* Print rules — keep checkbox/page-break behaviour sensible. */
  @media print {
    body { background: #FFFFFF; padding: 0; }
    .doc { box-shadow: none; padding: 0; max-width: none; }
    h2, h3 { page-break-after: avoid; }
    ul, ol, table { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="doc">
  <div class="header">
    <div>
      <div class="brand">The Lodge Suites</div>
      <div class="eyebrow">Admin Testing &amp; Training Plan</div>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    </div>
    <div style="text-align: right; font-family: 'Manrope', sans-serif; font-size: 0.66rem; color: #666; letter-spacing: 0.04em;">
      Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
    </div>
  </div>
  ${bodyHtml}
  <div class="footer">
    The Lodge Suites · Building 916, Road 4019, Block 340 · Shabab Avenue, Juffair, Manama · Kingdom of Bahrain
  </div>
</div>
</body>
</html>`;
}

// ─── Word-flavoured HTML (the .doc download) ──────────────────────────────
// Word opens HTML containers labelled with the right MS namespaces +
// ProgId meta as a native Word document. Formatting (headings, lists,
// bold, tables, checkbox glyphs) survives the import. Saving inside Word
// then writes a real .doc/.docx — operators end up with an editable
// document without us having to ship a docx-zip-builder library.
function wordShell(bodyHtml) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="ProgId" content="Word.Document" />
<meta name="Generator" content="Microsoft Word 15" />
<meta name="Originator" content="Microsoft Word 15" />
<title>The Lodge Suites — Admin Testing &amp; Training Plan</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #15161A; }
  h1 { font-family: 'Cambria', 'Cormorant Garamond', Georgia, serif; font-size: 22pt; color: #15161A; margin: 0 0 12pt; }
  h2 { font-family: 'Cambria', Georgia, serif; font-size: 16pt; color: #15161A; margin: 18pt 0 6pt; border-bottom: 0.5pt solid #C9A961; padding-bottom: 3pt; }
  h3 { font-family: 'Cambria', Georgia, serif; font-size: 13pt; color: #15161A; margin: 12pt 0 4pt; }
  h4 { font-size: 10pt; letter-spacing: 2pt; text-transform: uppercase; color: #8A7A4F; margin: 10pt 0 4pt; }
  p { margin: 0 0 8pt; }
  strong { font-weight: bold; }
  em { font-style: italic; color: #555; }
  code { font-family: Consolas, monospace; background: #F5F1E8; padding: 1pt 3pt; font-size: 10pt; }
  ul, ol { margin: 0 0 10pt 24pt; }
  li { margin-bottom: 3pt; }
  li.cbx { list-style: none; }
  li.cbx .box {
    display: inline-block; width: 10pt; height: 10pt;
    border: 0.75pt solid #15161A; margin-right: 6pt; text-align: center;
    font-size: 9pt;
  }
  li.cbx .box.on { background: #C9A961; }
  table { border-collapse: collapse; margin: 6pt 0; width: 100%; }
  th, td { border: 0.5pt solid #888; padding: 4pt 8pt; vertical-align: top; }
  th { background: #F5F1E8; font-weight: bold; font-size: 9pt; }
  hr { border: 0; border-top: 0.5pt solid #d8d2c4; margin: 10pt 0; }
</style>
</head>
<body>
<h1>The Lodge Suites — Admin Testing &amp; Training Plan</h1>
<p><em>Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</em></p>
${bodyHtml}
<p><br /></p>
<p style="font-size: 8pt; color: #666; text-align: center;">
  The Lodge Suites · Building 916, Road 4019, Block 340 · Shabab Avenue, Juffair, Manama · Kingdom of Bahrain
</p>
</body>
</html>`;
}

// ─── Public API ──────────────────────────────────────────────────────────
export function renderTestingPlanHtml(markdown) {
  return htmlShell(renderBody(markdown), {
    subtitle: "Hand-on UAT walkthrough · 10 phases · ~6–8h",
  });
}

export function renderTestingPlanWordHtml(markdown) {
  return wordShell(renderBody(markdown));
}

// Convenience — fetch the canonical markdown file and yield the rendered
// HTML / Word strings. The same source feeds both flavours so a future
// markdown edit reflows the PDF + DOC downloads automatically.
export async function fetchTestingPlanMarkdown(url = "/docs/admin-testing-plan.md") {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch testing plan markdown: HTTP ${res.status}`);
  return res.text();
}
