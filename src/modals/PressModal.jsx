import React, { useState } from "react";
import {
  Award, Calendar, Camera, Download, ExternalLink, Eye, FileText, Mail,
  Newspaper, Phone, Quote, Star, User2,
} from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG } from "../data/images.js";
import { EditorialPage, PageSection } from "./EditorialPage.jsx";
import { pushToast } from "./portal/admin/ui.jsx";
import {
  buildLogoPackZip, previewLogoPackHtml,
  buildFactSheetHtml,
  buildPhotoSelectionZip,
  buildBrandGuideHtml,
  openHtmlInNewTab, downloadHtml, downloadBlob,
} from "../utils/pressKit.js";

// ---------------------------------------------------------------------------
// Press — editorial page that the Footer "Press" link opens. Contains:
//   • Recent coverage (mocked) with publication, headline, date, link
//   • Awards & recognitions
//   • Media kit downloads (logo, fact sheet, photography request)
//   • A pull-quote from the GM
//   • Press-relations contact card
// ---------------------------------------------------------------------------

const COVERAGE = [
  {
    id: "ctw-2026-april",
    publication: "Condé Nast Traveller",
    headline: "Boutique stays redefining the Gulf — twelve properties to know in 2026",
    blurb: "“Where Manama's noise gives way to a quieter, more residential way of staying — every suite a fully-fitted apartment, every floor a refuge above the bustle of Juffair.”",
    date: "April 2026", section: "Editor's Pick",
    href: "#",
  },
  {
    id: "ah-2026-feb",
    publication: "Al Hayat",
    headline: "الجفير: الحيّ الذي يفوز بصمت في عام 2026",
    blurb: "“The Juffair district has quietly become a destination of its own — and The Lodge Suites is the property the locals quote when they recommend it.”",
    date: "February 2026", section: "Local Stories",
    href: "#",
  },
  {
    id: "tt-2026-jan",
    publication: "Travel + Leisure Middle East",
    headline: "The new long-stay calculus: when an apartment beats a hotel",
    blurb: "“Soundproofed windows, full kitchens, and a Front Office Manager who knows you by name from night one.”",
    date: "January 2026", section: "Long Reads",
    href: "#",
  },
  {
    id: "btn-2025-nov",
    publication: "Bahrain This Month",
    headline: "Five years of The Lodge — how a 72-suite property quietly redefined hospitality in Juffair",
    blurb: "“The five-year anniversary issue's cover story tracks the growth of one of Manama's most consistently mentioned addresses among the diplomatic and corporate-relocation set.”",
    date: "November 2025", section: "Cover Story",
    href: "#",
  },
];

const AWARDS = [
  { year: "2026", title: "Boutique Hotel of the Year",          authority: "Middle East Hotel Awards",    note: "Long-stay & serviced-residence category" },
  { year: "2025", title: "Best Serviced Apartment, Bahrain",    authority: "World Travel Awards",          note: "National winner · third consecutive year" },
  { year: "2025", title: "Excellence in Guest Service",         authority: "Tripadvisor Travellers' Choice", note: "Top 5% of properties globally" },
  { year: "2024", title: "Sustainable Hospitality Recognition", authority: "Green Globe",                   note: "Gold certification · property-wide programme" },
];

// ---------------------------------------------------------------------------
// Press-kit assets — every entry knows how to render its own preview and
// produce its own downloadable file (real ZIP / HTML, generated client-side
// in `utils/pressKit.js`). The press page card calls into these handlers.
// ---------------------------------------------------------------------------
const ASSETS = [
  {
    id: "logo",
    icon: Camera,
    title: "Brand logo pack",
    size: "ZIP · 11 SVGs",
    hint: "Wordmark and monogram in light, dark, gold-accent and monochrome variants — plus colour tokens and a usage README.",
    preview: () => openHtmlInNewTab(previewLogoPackHtml()),
    download: async () => {
      const blob = await buildLogoPackZip();
      downloadBlob(blob, "the-lodge-suites-logo-pack.zip");
      pushToast({ message: "Brand logo pack downloaded · 11 SVGs + README + colour tokens" });
    },
    canPreview: true,
  },
  {
    id: "factsheet",
    icon: FileText,
    title: "Property fact sheet",
    size: "HTML · 1 page · print-ready",
    hint: "One-pager with property facts, suite-type breakdown, signature amenities, distribution, and press contact.",
    preview: () => openHtmlInNewTab(buildFactSheetHtml(), { print: false }),
    download: () => {
      downloadHtml(buildFactSheetHtml(), "the-lodge-suites-fact-sheet.html");
      pushToast({ message: "Fact sheet downloaded · open in a browser and use Print → Save as PDF for the PDF version" });
    },
    canPreview: true,
  },
  {
    id: "photos",
    icon: Camera,
    title: "High-resolution photography",
    size: "ZIP · 12 images + contact sheet",
    hint: "Curated editorial selection across exteriors, suites, lobby and amenities. Includes a contact-sheet HTML index.",
    preview: null, // generated zip is too heavy to preview before download
    canPreview: false,
    needsProgress: true,
  },
  {
    id: "fonts",
    icon: FileText,
    title: "Brand typography & colour",
    size: "HTML · 11 pages · print-ready",
    hint: "Cormorant Garamond + Manrope specimens, the full Lodge palette, voice principles, and editorial examples.",
    preview: () => openHtmlInNewTab(buildBrandGuideHtml(), { print: false }),
    download: () => {
      downloadHtml(buildBrandGuideHtml(), "the-lodge-suites-brand-guide.html");
      pushToast({ message: "Brand guide downloaded · open in a browser and use Print → Save as PDF for the PDF version" });
    },
    canPreview: true,
  },
];

export const PressModal = ({ open, onClose }) => {
  // Per-asset busy state so the photo ZIP can show a "Bundling N/M images" hint.
  const [busyId, setBusyId] = useState(null);
  const [photoProgress, setPhotoProgress] = useState(null);

  const handlePreview = (asset) => {
    if (busyId) return;
    asset.preview?.();
  };

  const handleDownload = async (asset) => {
    if (busyId) return;
    setBusyId(asset.id);
    try {
      if (asset.id === "photos") {
        // Photo ZIP fetches a dozen real /images/* JPGs and packs them.
        // Surface progress so the user knows it's working.
        setPhotoProgress({ index: 0, total: 12, file: "" });
        const blob = await buildPhotoSelectionZip(setPhotoProgress);
        downloadBlob(blob, "the-lodge-suites-press-photography.zip");
        pushToast({ message: "Press photography ZIP downloaded · contact sheet included" });
      } else {
        await asset.download();
      }
    } catch (e) {
      pushToast({ message: `Couldn't generate ${asset.title.toLowerCase()}. Try again or email press@thelodgesuites.com.`, kind: "warn" });
    } finally {
      setBusyId(null);
      setPhotoProgress(null);
    }
  };

  return (
    <EditorialPage
      open={open}
      onClose={onClose}
      eyebrow="Press & Media"
      title="In conversation,"
      italic="quietly."
      intro="A short selection of coverage, awards, brand assets and a direct line to the press office. We're a small team, but we answer every request."
      heroImage={IMG.lobbyReception}
      cta={
        <a
          href="mailto:press@thelodgesuites.com?subject=Press%20enquiry"
          style={{
            padding: "0.95rem 1.6rem", backgroundColor: C.gold, color: C.bgDeep,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
            letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
            border: `1px solid ${C.gold}`, cursor: "pointer", whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.goldBright; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.gold; }}
        >
          <Mail size={13} /> Press enquiry
        </a>
      }
    >
      {/* Pull-quote from the GM */}
      <section className="mb-16">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-2">
            <Quote size={48} style={{ color: C.gold }} />
          </div>
          <blockquote className="lg:col-span-10" style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(1.6rem, 2.6vw, 2.2rem)", fontWeight: 400, fontStyle: "italic",
            color: C.bgDeep, lineHeight: 1.4,
          }}>
            “The Lodge has never tried to be the loudest hotel in Manama.
            <span style={{ color: C.goldDeep }}> It has always tried to be the most thoughtful one</span> — for the people who travel often, stay longer than a tourist, and want a residence that runs like a five-star.”
            <footer className="mt-5 flex items-center gap-3" style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
              fontStyle: "normal", color: C.textDim,
            }}>
              <span style={{
                width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
                backgroundColor: `${C.gold}1F`, border: `1px solid ${C.gold}`,
                color: C.goldDeep,
              }}><User2 size={16} /></span>
              <span><strong style={{ color: C.bgDeep }}>Aparajeet Mathad</strong> · Front Office Manager, The Lodge Suites</span>
            </footer>
          </blockquote>
        </div>
      </section>

      {/* Recent coverage */}
      <PageSection
        eyebrow="Recent coverage"
        title="In the"
        italic="press."
        intro="A curated selection — drop us a line if you'd like the full clippings file."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {COVERAGE.map((c) => (
            <article key={c.id} className="p-7" style={{ backgroundColor: C.cream }}>
              <div className="flex items-center justify-between gap-3 mb-3" style={{
                fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              }}>
                <span style={{ color: C.goldDeep }}>{c.publication}</span>
                <span style={{ color: C.textDim }}>{c.date} · {c.section}</span>
              </div>
              <h3 style={{
                fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem",
                color: C.bgDeep, fontWeight: 500, lineHeight: 1.2,
              }}>
                {c.headline}
              </h3>
              <p style={{
                fontFamily: "'Manrope', sans-serif", color: C.textDim,
                fontSize: "0.9rem", lineHeight: 1.7, marginTop: 12, fontStyle: "italic",
              }}>
                {c.blurb}
              </p>
              <a href={c.href}
                className="mt-4 inline-flex items-center gap-1.5"
                style={{
                  color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                  letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = C.gold}
                onMouseLeave={(e) => e.currentTarget.style.color = C.goldDeep}
              >
                Read the article <ExternalLink size={11} />
              </a>
            </article>
          ))}
        </div>
      </PageSection>

      {/* Awards */}
      <PageSection
        eyebrow="Recognitions"
        title="Awards &"
        italic="acknowledgements."
        intro="Nice things written about us by people who write nice things for a living."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {AWARDS.map((a) => (
            <div key={a.title + a.year} className="p-6" style={{ backgroundColor: C.cream }}>
              <div className="flex items-center justify-between mb-3">
                <Award size={22} style={{ color: C.goldDeep }} />
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontStyle: "italic",
                  color: C.goldDeep, fontWeight: 400,
                }}>{a.year}</span>
              </div>
              <h4 style={{
                fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem",
                color: C.bgDeep, fontWeight: 500, lineHeight: 1.2,
              }}>
                {a.title}
              </h4>
              <div style={{
                fontFamily: "'Manrope', sans-serif", color: C.goldDeep,
                fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 10,
              }}>
                {a.authority}
              </div>
              <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.82rem", marginTop: 6, lineHeight: 1.55 }}>
                {a.note}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      {/* Press kit */}
      <PageSection
        eyebrow="Press kit"
        title="Brand"
        italic="assets."
        intro="Real downloadable files — generated for you on demand. Open the preview to inspect what's inside before you download."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {ASSETS.map((a) => {
            const busy = busyId === a.id;
            return (
              <div key={a.id} className="p-6" style={{
                backgroundColor: C.cream, border: `1px solid rgba(0,0,0,0.08)`,
                borderInlineStart: `3px solid ${C.gold}`,
              }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <a.icon size={24} style={{ color: C.goldDeep }} />
                  <span style={{
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                    letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                    color: C.goldDeep, padding: "2px 7px",
                    border: `1px solid ${C.goldDeep}`,
                  }}>{a.size}</span>
                </div>
                <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
                  {a.title}
                </h4>
                <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.84rem", marginTop: 6, lineHeight: 1.6 }}>
                  {a.hint}
                </p>

                {/* Photo ZIP shows fetch progress so the user knows it's working. */}
                {a.id === "photos" && busy && photoProgress && (
                  <div className="mt-4 p-3" style={{ backgroundColor: C.paper, border: `1px solid rgba(0,0,0,0.08)` }}>
                    <div style={{
                      color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
                      fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
                    }}>
                      Bundling · {photoProgress.index} of {photoProgress.total}
                    </div>
                    <div style={{ color: C.bgDeep, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.72rem", marginTop: 4 }}>
                      {photoProgress.file || "Preparing…"}
                    </div>
                    <div className="mt-2 h-1" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
                      <div className="h-full" style={{
                        width: `${(photoProgress.index / Math.max(1, photoProgress.total)) * 100}%`,
                        backgroundColor: C.gold, transition: "width 200ms",
                      }} />
                    </div>
                  </div>
                )}

                {/* Action row — Preview + Download */}
                <div className="mt-5 flex items-center gap-2 flex-wrap">
                  {a.canPreview && (
                    <button
                      onClick={() => handlePreview(a)}
                      disabled={busy}
                      style={{
                        ...assetBtnStyle, backgroundColor: "transparent",
                        color: C.bgDeep, border: `1px solid rgba(21,22,26,0.2)`,
                        opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer",
                      }}
                      onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = C.goldDeep; e.currentTarget.style.color = C.goldDeep; } }}
                      onMouseLeave={(e) => { if (!busy) { e.currentTarget.style.borderColor = "rgba(21,22,26,0.2)"; e.currentTarget.style.color = C.bgDeep; } }}
                    ><Eye size={11} /> Preview</button>
                  )}
                  <button
                    onClick={() => handleDownload(a)}
                    disabled={busy}
                    style={{
                      ...assetBtnStyle, backgroundColor: busy ? "rgba(201,169,97,0.4)" : C.gold,
                      color: C.bgDeep, border: `1px solid ${busy ? "rgba(201,169,97,0.4)" : C.gold}`,
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => { if (!busy) e.currentTarget.style.backgroundColor = C.goldBright; }}
                    onMouseLeave={(e) => { if (!busy) e.currentTarget.style.backgroundColor = C.gold; }}
                  ><Download size={11} /> {busy ? "Building…" : "Download"}</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* HTML → PDF tip — covers the fact sheet + brand guide flow */}
        <div className="mt-6 p-4 flex items-start gap-3" style={{ backgroundColor: C.cream, border: `1px solid rgba(0,0,0,0.08)`, borderInlineStart: `3px solid ${C.goldDeep}` }}>
          <FileText size={14} style={{ color: C.goldDeep, marginTop: 3, flexShrink: 0 }} />
          <div style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.6 }}>
            <strong style={{ color: C.bgDeep }}>Need a PDF?</strong> The fact sheet and brand guide download as print-optimised HTML. Open them in any browser and use <em>Print → Save as PDF</em> — the page-break and margin styles are already baked in for A4 output.
          </div>
        </div>
      </PageSection>

      {/* Press contact */}
      <section style={{ marginBottom: "1rem" }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          <div className="p-9" style={{ backgroundColor: C.bgDeep, color: C.cream }}>
            <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Press relations
            </div>
            <h3 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem",
              fontWeight: 400, color: C.cream, lineHeight: 1.1, marginTop: 10,
            }}>
              We answer<br />
              <span style={{ fontStyle: "italic", color: C.gold }}>every request.</span>
            </h3>
            <p style={{ color: C.textOnDark, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", lineHeight: 1.75, marginTop: 16, opacity: 0.85 }}>
              For interviews, stays for editorial features, photography, or fact-checking — write directly to the press office. We aim to respond within one business day.
            </p>
            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem" }}>
              <div>
                <div style={{ color: C.gold, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Email</div>
                <a href="mailto:press@thelodgesuites.com" style={{ color: C.cream, textDecoration: "none" }}>press@thelodgesuites.com</a>
              </div>
              <div>
                <div style={{ color: C.gold, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Phone</div>
                <a href="tel:+97316168146" style={{ color: C.cream, direction: "ltr", textDecoration: "none" }}>+973 1616 8146</a>
              </div>
              <div>
                <div style={{ color: C.gold, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>WhatsApp</div>
                <a href="https://wa.me/97333069641" target="_blank" rel="noopener noreferrer" style={{ color: C.cream, direction: "ltr", textDecoration: "none" }}>+973 3306 9641</a>
              </div>
              <div>
                <div style={{ color: C.gold, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Hours</div>
                <span style={{ color: C.cream }}>Sun–Thu, 09:00–18:00 AST</span>
              </div>
            </div>
          </div>
          <div className="p-9" style={{ backgroundColor: C.cream }}>
            <div style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Spokesperson
            </div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: C.bgDeep, fontWeight: 500, marginTop: 10, lineHeight: 1.15 }}>
              Aparajeet Mathad
            </h3>
            <div style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginTop: 4 }}>
              Front Office Manager
            </div>
            <p style={{ color: C.textDim, fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem", lineHeight: 1.7, marginTop: 14 }}>
              Available for interviews on hospitality operations in Bahrain, long-stay travel, the Juffair district's transformation, and the boutique-five-star category. Comfortable on-record in English and Hindi.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-2" style={{ backgroundColor: `${C.goldDeep}14`, border: `1px solid ${C.goldDeep}`, color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
              <Newspaper size={11} /> Briefings on request
            </div>
          </div>
        </div>
      </section>
    </EditorialPage>
  );
};

// Shared style for the asset Preview / Download buttons. Kept at the bottom
// of the file because it's only used inside the press-kit grid above.
const assetBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "0.6rem 1rem",
  fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
  letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
  whiteSpace: "nowrap",
};
