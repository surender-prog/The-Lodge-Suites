import React from "react";
import {
  BookOpen, Building2, Calendar as CalendarIcon, Download, FileText, Globe, Layers,
  Mail, Maximize2, Megaphone, Printer, Sparkles, Target, Users, Wrench,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { Card, GhostBtn, PageHeader, PrimaryBtn, pushToast } from "../ui.jsx";

// ---------------------------------------------------------------------------
// SystemDocs — internal training & business-development deck.
// Hosts the master "System Overview" presentation as a one-stop hub:
//   • Inline TOC / chapter map so operators can scan what's covered
//   • Three download options: Markdown source, Printable HTML, Print-to-PDF
//   • Direct link to open the full HTML deck in a new tab
// The deck files live in /public/docs/ so they're served as static assets.
// ---------------------------------------------------------------------------

// Chapter map — mirrors the seven parts of the master deck. Counts are
// approximate and match what's in the published HTML; if the HTML is
// regenerated with new slides, adjust the counts here too.
const PARTS = [
  {
    id: "overview", num: "01", title: "System at a Glance",
    slides: 5, audience: "Everyone — orientation", icon: Layers,
    bullets: [
      "What The Lodge Suites is — 72 suites, Juffair, opened 2020",
      "Two surfaces, one codebase — public site, guest portal, three operator tabs",
      "Brand identity — dark/gold art-deco · Cormorant + Manrope · BHD",
      "Tech stack — Vite 5 · React 18 · Tailwind 3 · Lucide-react",
    ],
  },
  {
    id: "guest", num: "02", title: "Guest Experience",
    slides: 7, audience: "Front office · reservations · marketing", icon: Sparkles,
    bullets: [
      "Homepage anatomy — eight sections that tell one story",
      "Suite catalog with live pricing (Studio 38 → Three-Bed 96)",
      "Four-step booking engine — dates, suite, extras, confirm",
      "Pay-now (5% off non-refundable) vs. Pay-on-arrival paths",
      "LS Privilege loyalty — Silver / Gold / Platinum (5% / 10% / 15%)",
      "Offers · packages · multilingual (English + Arabic RTL)",
    ],
  },
  {
    id: "portal", num: "03", title: "Partner Portal",
    slides: 16, audience: "All admin roles", icon: Building2,
    bullets: [
      "Three top-level tabs — Corporate · Travel Agent · Admin",
      "Admin sidebar map — 18 sections, six functional groups",
      "Each section walked through: Calendar, Bookings, Stop-Sale, Rooms,",
      "Offers, Extras, LS Privilege, Email Templates, Email SMTP,",
      "Maintenance, Invoices · Payments · Tax, RFPs, Staff, Audit Log",
    ],
  },
  {
    id: "workflows", num: "04", title: "Operational Workflows",
    slides: 5, audience: "Day-in-the-life training", icon: Target,
    bullets: [
      "A — Direct booking · landing → confirmation in 90s",
      "B — Corporate RFP · Identified → Won, with system memory",
      "C — Stop-sale push to OTAs · F1 weekend, one operator",
      "D — Maintenance ticket · 'no hot water' to verified suite",
      "E — OTA email composer · allotment refresh in 3 minutes",
    ],
  },
  {
    id: "biz-dev", num: "05", title: "Business Development",
    slides: 7, audience: "Sales · GM · ownership", icon: Megaphone,
    bullets: [
      "Why one-stop matters — direct-first in software",
      "Audience: corporate buyer · travel agency · OTA · ownership",
      "Differentiators vs. Bahrain serviced-apartment competitors",
      "Pricing levers (sales toolkit) — five levers, weakest to strongest",
    ],
  },
  {
    id: "roadmap", num: "06", title: "Roadmap & Mocked List",
    slides: 2, audience: "Owners · technical leadership", icon: CalendarIcon,
    bullets: [
      "Honest disclosure — what's mocked today and where it's going",
      "Three roadmap horizons — near-term · medium · long",
    ],
  },
  {
    id: "appendix", num: "07", title: "Appendix",
    slides: 4, audience: "Quick reference for operators", icon: BookOpen,
    bullets: [
      "Cheat sheet — front office daily tasks",
      "Cheat sheet — sales daily tasks",
      "Glossary — PMS, OTA, RFP, ADR, RevPAR, allotment, folio, etc.",
      "Frequently asked operator questions",
    ],
  },
];

// Public asset paths — these resolve to /public/docs/*. Keep in sync with
// the actual files under /public/docs/. Markdown is downloadable as-is;
// HTML is openable in a new tab and prints cleanly to PDF.
const ASSETS = {
  markdown: "/docs/system-presentation.md",
  html:     "/docs/system-presentation.html",
};

export const SystemDocs = () => {
  const p = usePalette();

  // Open the HTML deck in a new tab — the deck has its own toolbar with
  // Print/Save and Download buttons, so once it's open the operator has
  // full control without coming back to this page.
  const openHtml = () => {
    window.open(ASSETS.html, "_blank", "noopener,noreferrer");
  };

  // Trigger the browser's native print dialog on the embedded HTML deck.
  // We do this by opening the HTML in a hidden iframe, waiting for it to
  // settle, then calling iframe.contentWindow.print(). Falls back to a
  // new-tab-and-print if the iframe approach is blocked.
  const printDeck = () => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right    = "-9999px";
      iframe.style.bottom   = "-9999px";
      iframe.style.width    = "0";
      iframe.style.height   = "0";
      iframe.style.border   = "0";
      iframe.src            = ASSETS.html;
      iframe.onload = () => {
        // The deck's web fonts may still be loading at this point; give
        // them a beat to land before triggering the print dialog so the
        // PDF doesn't render with a fallback font.
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (_) {
            // Cross-origin or sandbox blocked the call — fall back to a
            // new tab so the user can hit Cmd-P themselves.
            window.open(ASSETS.html, "_blank", "noopener,noreferrer");
          }
          // Tear the iframe down after a delay so the print dialog
          // doesn't lose the source mid-render.
          setTimeout(() => iframe.remove(), 5000);
        }, 600);
      };
      document.body.appendChild(iframe);
      pushToast({ message: "Print dialog opening — choose 'Save as PDF' to export." });
    } catch (e) {
      // Final fallback — open in a new tab and let the user print there.
      window.open(ASSETS.html, "_blank", "noopener,noreferrer");
    }
  };

  // Force-download a static asset by setting `download` on a temporary
  // anchor. Works for the markdown source (which a browser would
  // otherwise display inline rather than save).
  const download = (href, filename) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    pushToast({ message: `Downloading ${filename}…` });
  };

  return (
    <div>
      <PageHeader
        title="System overview deck"
        intro="Master training and business-development presentation for The Lodge Suites operating system. Use it to onboard new staff, walk corporate prospects through the platform, or hand to ownership for a single-screen view of what's been built. Downloads below."
        action={
          <PrimaryBtn onClick={openHtml}>
            <Maximize2 size={12} /> Open full deck
          </PrimaryBtn>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* ── Left column — chapter map ───────────────────────────────── */}
        <div className="space-y-4">
          <Card title="What's inside" padded={false}>
            <div className="divide-y" style={{ borderColor: p.border }}>
              {PARTS.map((part) => {
                const Ic = part.icon;
                return (
                  <div key={part.id} className="px-5 py-4 flex gap-4" style={{ borderColor: p.border }}>
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: 44, height: 44,
                        backgroundColor: "rgba(201,169,97,0.10)",
                        border: `1px solid ${p.accent}`,
                        color: p.accent,
                      }}
                    >
                      <Ic size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span style={{
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: "1.5rem", fontWeight: 500,
                          color: p.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                        }}>{part.num}</span>
                        <h3 style={{
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: "1.4rem", fontWeight: 500, color: p.textPrimary,
                          letterSpacing: "-0.005em", margin: 0,
                        }}>{part.title}</h3>
                        <span style={{
                          fontFamily: "'Manrope', sans-serif",
                          fontSize: "0.62rem", letterSpacing: "0.2em",
                          textTransform: "uppercase", fontWeight: 700,
                          color: p.textMuted,
                        }}>{part.slides} slide{part.slides === 1 ? "" : "s"}</span>
                      </div>
                      <div className="mt-1" style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase",
                        color: p.textMuted, fontWeight: 600,
                      }}>{part.audience}</div>
                      <ul className="mt-2.5 space-y-1.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {part.bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2"
                            style={{
                              fontFamily: "'Manrope', sans-serif",
                              fontSize: "0.85rem", color: p.textSecondary,
                              lineHeight: 1.55,
                            }}>
                            <span style={{
                              flexShrink: 0,
                              width: 4, height: 4, borderRadius: "50%",
                              backgroundColor: p.accent, marginTop: 8,
                            }} />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Sharing notice */}
          <Card title="Before sharing externally" padded>
            <ul className="space-y-2" style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.85rem", color: p.textSecondary, lineHeight: 1.6,
              listStyle: "none", padding: 0, margin: 0,
            }}>
              <li className="flex items-start gap-2">
                <span style={{
                  flexShrink: 0, width: 4, height: 4, borderRadius: "50%",
                  backgroundColor: p.warn, marginTop: 8,
                }} />
                <span>Part 6 ("What's mocked") is honest by design — soften the wording before sending to investors or owners if you'd rather lead with the production-ready surface.</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{
                  flexShrink: 0, width: 4, height: 4, borderRadius: "50%",
                  backgroundColor: p.warn, marginTop: 8,
                }} />
                <span>The Corporate Tab slide names sample accounts (BAPCO, GFH, Investcorp Air, MoI) as placeholders. Replace with real signed accounts before showing to a prospect from any of those companies.</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{
                  flexShrink: 0, width: 4, height: 4, borderRadius: "50%",
                  backgroundColor: p.warn, marginTop: 8,
                }} />
                <span>The deck contains internal pricing (BHD 38 / 44 / 78 / 96) — already public on the site, but worth confirming before forwarding to OTAs whose contracts require parity.</span>
              </li>
            </ul>
          </Card>
        </div>

        {/* ── Right column — download/export panel ────────────────────── */}
        <div className="space-y-4">
          <Card title="Downloads" padded>
            <div className="space-y-3">
              <DownloadRow
                p={p}
                Icon={FileText}
                title="Markdown source"
                hint=".md · 32 KB · readable in any editor"
                onClick={() => download(ASSETS.markdown, "the-lodge-suites-system-overview.md")}
                cta="Download"
              />
              <DownloadRow
                p={p}
                Icon={Globe}
                title="Printable HTML deck"
                hint="Brand-styled · opens in a new tab"
                onClick={openHtml}
                cta="Open"
              />
              <DownloadRow
                p={p}
                Icon={Printer}
                title="Print-ready PDF"
                hint="Opens browser print dialog · choose 'Save as PDF'"
                onClick={printDeck}
                cta="Print"
              />
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${p.border}` }}>
              <div style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.62rem", letterSpacing: "0.22em",
                textTransform: "uppercase", color: p.textMuted, fontWeight: 700,
                marginBottom: 6,
              }}>Need slides instead?</div>
              <p style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.78rem", color: p.textSecondary, lineHeight: 1.55,
                margin: 0,
              }}>
                Convert the Markdown to PowerPoint with Marp:
              </p>
              <pre style={{
                marginTop: 8, padding: "10px 12px",
                backgroundColor: p.bgPanelAlt,
                border: `1px solid ${p.border}`,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.72rem", color: p.textPrimary,
                lineHeight: 1.6, overflowX: "auto",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{`npx @marp-team/marp-cli@latest \\
  the-lodge-suites-system-overview.md \\
  -o presentation.pptx`}</pre>
            </div>
          </Card>

          {/* At-a-glance stats */}
          <Card title="At a glance" padded>
            <div className="grid grid-cols-2 gap-3">
              <Stat p={p} value="58" label="Slides" />
              <Stat p={p} value="7" label="Parts" />
              <Stat p={p} value="2" label="Audiences" />
              <Stat p={p} value="EN" label="Language" />
            </div>
            <div className="mt-4" style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "0.72rem", color: p.textMuted, lineHeight: 1.6,
            }}>
              Designed for a 45–60 minute walkthrough end-to-end. Audiences:
              new staff (training) and prospects/owners (business development).
            </div>
          </Card>

          {/* Audiences chip strip */}
          <Card title="Best for" padded>
            <div className="flex flex-wrap gap-2">
              {[
                { Ic: Users,    label: "New staff onboarding" },
                { Ic: Building2, label: "Corporate prospects" },
                { Ic: Megaphone, label: "OTA / agent partners" },
                { Ic: Wrench,    label: "Operations training" },
                { Ic: Mail,      label: "Marketing collateral" },
              ].map((a, i) => {
                const Ic = a.Ic;
                return (
                  <div key={i} className="inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: "rgba(201,169,97,0.08)",
                      border: `1px solid ${p.border}`,
                      padding: "5px 10px",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.72rem", color: p.textSecondary,
                    }}>
                    <Ic size={11} style={{ color: p.accent }} />
                    {a.label}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ── Local primitives — kept inside this file because they're only used
// here and don't justify polluting the shared ui.jsx. The download row
// matches the visual language of the SMTP page's quick-setup chips.
function DownloadRow({ p, Icon, title, hint, onClick, cta }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 group transition-colors"
      style={{
        textAlign: "start",
        backgroundColor: p.bgPanelAlt,
        border: `1px solid ${p.border}`,
        padding: "10px 12px",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor     = p.accent;
        e.currentTarget.style.backgroundColor = p.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor     = p.border;
        e.currentTarget.style.backgroundColor = p.bgPanelAlt;
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 32, height: 32,
          backgroundColor: "rgba(201,169,97,0.10)",
          border: `1px solid ${p.accent}`,
          color: p.accent,
        }}
      >
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.86rem", color: p.textPrimary, fontWeight: 600,
        }}>{title}</div>
        <div style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.7rem", color: p.textMuted, marginTop: 1,
        }}>{hint}</div>
      </div>
      <span
        className="flex-shrink-0 inline-flex items-center gap-1.5"
        style={{
          color: p.accent,
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.62rem", letterSpacing: "0.18em",
          textTransform: "uppercase", fontWeight: 700,
        }}
      >
        <Download size={11} />
        {cta}
      </span>
    </button>
  );
}

function Stat({ p, value, label }) {
  return (
    <div style={{
      backgroundColor: p.bgPanelAlt,
      border: `1px solid ${p.border}`,
      padding: "12px 14px",
    }}>
      <div style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: "1.7rem", color: p.accent, fontWeight: 500,
        lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div className="mt-1" style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.6rem", letterSpacing: "0.22em",
        textTransform: "uppercase", color: p.textMuted, fontWeight: 700,
      }}>{label}</div>
    </div>
  );
}
