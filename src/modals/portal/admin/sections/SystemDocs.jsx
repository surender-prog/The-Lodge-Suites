import React, { useMemo, useState } from "react";
import {
  BookOpen, Building2, Calendar as CalendarIcon, Check, CheckCircle2, ChevronRight, Clock,
  ClipboardCheck, Copy, Download, Eye, FileEdit, FileText, Globe, Layers,
  Mail, Maximize2, Megaphone, Printer, Send, Sparkles, Star, Target, Trash2, UserCheck, Users, Wrench, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { Card, Drawer, FormGroup, GhostBtn, PageHeader, PrimaryBtn, SelectField, TableShell, Td, Th, TextField, pushToast } from "../ui.jsx";
import { useData, TESTING_PLAN_PHASES, TESTING_PLAN_FEEDBACK_FIELDS } from "../../../../data/store.jsx";
import { fetchTestingPlanMarkdown, renderTestingPlanHtml, renderTestingPlanWordHtml } from "../../../../utils/renderTestingPlan.js";

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
  // Hands-on testing plan — phase-by-phase walkthrough an admin uses to
  // validate every operational surface. Drives onboarding, UAT, and
  // post-release change-validation; feedback prompts at the end of each
  // phase channel back into the upgrade backlog.
  testingPlan: "/docs/admin-testing-plan.md",
};

export const SystemDocs = () => {
  const p = usePalette();
  const {
    adminUsers, staffSession,
    testingPlanAssignments,
    assignTestingPlan,
    updateTestingPhase,
    updateTestingFeedback,
    removeTestingPlanAssignment,
  } = useData();

  // Assignment workflow state — the picker drawer (Assign button), the
  // detail drawer (View on an existing assignment), and a transient
  // confirm modal for removal.
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState(null);

  // The candidate pool for assignment: UAT testers first, then every
  // active staff with a role broader than reservations / housekeeping.
  // Owners can technically self-assign, but we surface tester accounts
  // first so the obvious choice is the dedicated UAT seat.
  const candidates = useMemo(() => {
    const list = (adminUsers || []).filter((u) => u.status === "active");
    const score = (u) => (u.isUatTester ? 0 : u.role === "owner" ? 3 : u.role === "gm" ? 1 : u.role === "fom" ? 1 : 2);
    return list.slice().sort((a, b) => score(a) - score(b));
  }, [adminUsers]);

  const activeAssignment = useMemo(
    () => (testingPlanAssignments || []).find((a) => a.id === activeAssignmentId),
    [testingPlanAssignments, activeAssignmentId]
  );

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

  // Wrap a string in a Blob → object URL → anchor-click → revoke.
  // Used for the on-the-fly testing-plan downloads where the file
  // content is rendered client-side from the source markdown rather
  // than served as a static asset.
  const downloadBlob = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    pushToast({ message: `Downloading ${filename}…` });
  };

  // ─── Testing plan downloads ────────────────────────────────────────────
  // Three flavours, one source of truth (the markdown file).
  //   PDF — render to brand-styled HTML, open in a hidden iframe, trigger
  //         the browser print dialog; user picks "Save as PDF".
  //   DOC — render to Word-flavoured HTML (MS Office namespaces + ProgId)
  //         and download as a .doc file. Opens cleanly in Word / Google
  //         Docs / Pages with formatting intact.
  //   MD  — the raw markdown source (kept for editors who want plain text).
  const fetchPlan = async () => {
    try {
      return await fetchTestingPlanMarkdown(ASSETS.testingPlan);
    } catch (e) {
      pushToast({ message: "Couldn't load testing plan source. Try again.", kind: "warn" });
      throw e;
    }
  };

  const downloadTestingPlanPdf = async () => {
    let md;
    try { md = await fetchPlan(); } catch (_) { return; }
    const html = renderTestingPlanHtml(md);
    // Open the rendered HTML in a hidden iframe and fire the browser
    // print dialog. Same pattern as the system-presentation Print path —
    // it's the most reliable way to produce a PDF without server-side
    // rendering or a heavy PDF library.
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right    = "-9999px";
      iframe.style.bottom   = "-9999px";
      iframe.style.width    = "0";
      iframe.style.height   = "0";
      iframe.style.border   = "0";
      iframe.src            = url;
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (_) {
            const w = window.open(url, "_blank", "noopener,noreferrer");
            if (!w) pushToast({ message: "Pop-up blocked — allow it for this site to print.", kind: "warn" });
          }
          setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 8000);
        }, 600);
      };
      document.body.appendChild(iframe);
      pushToast({ message: "Print dialog opening — pick 'Save as PDF' to export." });
    } catch (_) {
      // Fallback — download the HTML so the user can print from a real tab.
      downloadBlob(html, "the-lodge-suites-admin-testing-plan.html", "text/html;charset=utf-8");
    }
  };

  const downloadTestingPlanDoc = async () => {
    let md;
    try { md = await fetchPlan(); } catch (_) { return; }
    const html = renderTestingPlanWordHtml(md);
    // application/msword + .doc extension is the magic combo: Word /
    // Google Docs / Pages all open the file as an editable document and
    // honour the embedded styles. Saving inside Word writes a real
    // .docx — we avoid shipping a docx-zip builder dependency.
    downloadBlob(html, "the-lodge-suites-admin-testing-plan.doc", "application/msword");
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
              {/* Admin testing & training plan — three flavours, one
                  source of truth (the canonical markdown at
                  /docs/admin-testing-plan.md). PDF + DOC are generated
                  client-side on click so a markdown edit reflows both
                  derived formats automatically. */}
              <div className="pt-3 mt-3" style={{ borderTop: `1px dashed ${p.border}` }}>
                <div style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.62rem", letterSpacing: "0.22em",
                  textTransform: "uppercase", color: p.textMuted, fontWeight: 700,
                  marginBottom: 8,
                }}>Admin testing & training plan</div>
                <div className="space-y-2">
                  <DownloadRow
                    p={p}
                    Icon={Printer}
                    title="Download as PDF"
                    hint="Brand-styled · opens print dialog · pick 'Save as PDF'"
                    onClick={downloadTestingPlanPdf}
                    cta="Print"
                  />
                  <DownloadRow
                    p={p}
                    Icon={FileEdit}
                    title="Download as Word (.doc)"
                    hint="Opens in Word / Google Docs / Pages · editable"
                    onClick={downloadTestingPlanDoc}
                    cta="Download"
                  />
                  <DownloadRow
                    p={p}
                    Icon={ClipboardCheck}
                    title="Download as Markdown"
                    hint="Plain-text source · GitHub-ready · raw checklist"
                    onClick={() => download(ASSETS.testingPlan, "the-lodge-suites-admin-testing-plan.md")}
                    cta="Download"
                  />
                </div>
              </div>
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

      {/* ─────────────────────────────────────────────────────────────────
          Admin testing & training plan — assignment workspace.
          Owner picks a tester from the UAT roster, the assignment lands
          in `testingPlanAssignments`, and the tester then works through
          each phase with progress + free-text feedback captured per
          row. The Overall Feedback Summary at the bottom collates into
          the next iteration's upgrade backlog.
          ──────────────────────────────────────────────────────────── */}
      <div className="mt-8" style={{ borderTop: `1px solid ${p.border}`, paddingTop: "2rem" }}>
        <PageHeader
          title="Admin testing & training plan"
          intro="Assign the 10-phase plan to a UAT tester. Their progress and feedback are tracked here so we can prioritise the next iteration. Each tester gets dedicated credentials — see Staff & Access for the seeded uat1@ / uat2@ / uat3@ accounts."
          action={
            <PrimaryBtn onClick={() => setAssignOpen(true)}>
              <Send size={12} /> Assign to a tester
            </PrimaryBtn>
          }
        />

        <TestingAssignmentBoard
          p={p}
          assignments={testingPlanAssignments}
          onOpen={(id) => setActiveAssignmentId(id)}
        />
      </div>

      {/* Assignment picker — pick a tester, hand them the plan. */}
      {assignOpen && (
        <AssignTesterDrawer
          p={p}
          candidates={candidates}
          existingAssignments={testingPlanAssignments}
          onClose={() => setAssignOpen(false)}
          onAssign={(testerId) => {
            const id = assignTestingPlan({ testerId, owner: staffSession });
            if (id) {
              const t = candidates.find((c) => c.id === testerId);
              pushToast({ message: `Testing plan assigned to ${t?.name || "tester"} · ${t?.email || ""}` });
              setAssignOpen(false);
              setActiveAssignmentId(id);
            } else {
              pushToast({ message: "Couldn't create assignment — tester not found.", kind: "warn" });
            }
          }}
        />
      )}

      {/* Per-assignment detail — phase tracker + overall feedback. */}
      {activeAssignment && (
        <AssignmentDetailDrawer
          p={p}
          assignment={activeAssignment}
          onClose={() => setActiveAssignmentId(null)}
          onPhasePatch={(phaseId, patch) => updateTestingPhase(activeAssignment.id, phaseId, patch)}
          onFeedbackPatch={(patch) => updateTestingFeedback(activeAssignment.id, patch)}
          onRemove={() => {
            if (!confirm(`Remove the testing plan assignment for ${activeAssignment.testerName}? Their captured progress + feedback will be lost.`)) return;
            removeTestingPlanAssignment(activeAssignment.id);
            setActiveAssignmentId(null);
            pushToast({ message: "Assignment removed.", kind: "warn" });
          }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// TestingAssignmentBoard — list of every assignment with a progress bar.
// Empty state nudges the operator to assign the plan to a UAT tester.
// ─────────────────────────────────────────────────────────────────────────
function TestingAssignmentBoard({ p, assignments, onOpen }) {
  if (!assignments || assignments.length === 0) {
    return (
      <Card padded>
        <div className="flex items-start gap-3" style={{ color: p.textMuted, fontSize: "0.86rem", lineHeight: 1.6 }}>
          <ClipboardCheck size={18} style={{ color: p.accent, flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ color: p.textPrimary, fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>
              No active assignments
            </div>
            <div style={{ marginTop: 4 }}>
              Click <strong>Assign to a tester</strong> to hand the plan to one of the dedicated UAT logins. Each phase carries its own feedback prompt so we can collate the upgrade backlog directly from their experience.
            </div>
          </div>
        </div>
      </Card>
    );
  }
  const sorted = assignments.slice().sort((a, b) => String(b.assignedAt || "").localeCompare(String(a.assignedAt || "")));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {sorted.map((a) => {
        const phases = Array.isArray(a.phases) ? a.phases : [];
        const total  = phases.length || 1;
        const done   = phases.filter((ph) => ph.status === "completed").length;
        const active = phases.filter((ph) => ph.status === "in-progress").length;
        const pct    = Math.round((done / total) * 100);
        const statusColor = a.status === "completed" ? p.success : a.status === "in-progress" ? p.warn : p.textMuted;
        const statusLabel = a.status === "completed" ? "Completed" : a.status === "in-progress" ? "In progress" : "Pending";
        return (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            className="text-start p-4 transition-colors"
            style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}`, cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
                  {a.testerName}
                </div>
                <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
                  {a.testerEmail}
                </div>
              </div>
              <span style={{
                color: statusColor, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
                padding: "3px 8px", border: `1px solid ${statusColor}`, whiteSpace: "nowrap",
              }}>{statusLabel}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-3" style={{ height: 6, backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
              <div style={{ width: `${pct}%`, height: "100%", backgroundColor: p.accent }} />
            </div>
            <div className="flex items-center justify-between mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem", color: p.textMuted }}>
              <span>{done} of {total} phases done{active > 0 ? ` · ${active} active` : ""}</span>
              <span style={{ color: p.accent, fontWeight: 700 }}>{pct}%</span>
            </div>
            <div className="flex items-center gap-1.5 mt-3" style={{ color: p.accent, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              <Eye size={11} /> View progress <ChevronRight size={11} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AssignTesterDrawer — picker UI. The owner picks a tester from the
// candidate pool; UAT-tagged accounts surface first.
// ─────────────────────────────────────────────────────────────────────────
function AssignTesterDrawer({ p, candidates, existingAssignments, onClose, onAssign }) {
  const [pickedId, setPickedId] = useState(candidates.find((c) => c.isUatTester)?.id || "");
  const activeIds = new Set((existingAssignments || []).filter((a) => a.status !== "completed").map((a) => a.testerId));
  const picked = candidates.find((c) => c.id === pickedId);
  const alreadyHasOpen = picked ? activeIds.has(picked.id) : false;
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Testing plan"
      title="Assign to a tester"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <PrimaryBtn onClick={() => onAssign(pickedId)} small>
            <Send size={11} /> Send assignment
          </PrimaryBtn>
        </>
      }
    >
      <Card title="Tester pool">
        <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
          UAT-tagged accounts are at the top. The picked tester receives the same 10-phase plan that's downloadable from <strong>Downloads → Admin testing & training plan</strong>. Hand them their credentials separately.
        </p>
        <div className="space-y-2">
          {candidates.map((c) => {
            const sel = pickedId === c.id;
            const open = activeIds.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setPickedId(c.id)}
                className="w-full text-start p-3 transition-colors"
                style={{
                  backgroundColor: sel ? p.bgHover : p.bgPanel,
                  border: `1px solid ${sel ? p.accent : p.border}`,
                  cursor: "pointer",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ color: p.textPrimary, fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", fontWeight: 600 }}>{c.name}</span>
                      {c.isUatTester && (
                        <span style={{ color: p.accent, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "2px 6px", border: `1px solid ${p.accent}` }}>UAT</span>
                      )}
                      {open && (
                        <span style={{ color: p.warn, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, padding: "2px 6px", border: `1px solid ${p.warn}` }}>Has open plan</span>
                      )}
                    </div>
                    <div style={{ color: p.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
                      {c.title} · {c.email}
                    </div>
                  </div>
                  {sel && <Check size={14} style={{ color: p.accent, flexShrink: 0 }} />}
                </div>
              </button>
            );
          })}
        </div>
        {alreadyHasOpen && (
          <p className="mt-3" style={{ color: p.warn, fontSize: "0.78rem", lineHeight: 1.55, fontFamily: "'Manrope', sans-serif" }}>
            This tester already has an open assignment — the same one will be reused rather than duplicated. Remove the open assignment from the board first if you want a fresh start.
          </p>
        )}
      </Card>

      <Card title="What happens next" className="mt-4">
        <ol className="space-y-2" style={{ paddingInlineStart: 18, color: p.textSecondary, fontSize: "0.84rem", lineHeight: 1.6 }}>
          <li>An assignment record lands on the board below. Status = Pending.</li>
          <li>Share the tester's email + password with them (Staff &amp; Access → tester row → Copy).</li>
          <li>Send them the <strong>Admin testing & training plan</strong> markdown download.</li>
          <li>As they work through each phase they (or you) update the phase status + feedback in the assignment drawer.</li>
          <li>At sign-off they fill the Overall Feedback Summary — that becomes the input to the next iteration.</li>
        </ol>
      </Card>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AssignmentDetailDrawer — the working surface. Phase-by-phase status +
// feedback, plus the eight sign-off fields and a 1-5 confidence rating.
// ─────────────────────────────────────────────────────────────────────────
function AssignmentDetailDrawer({ p, assignment, onClose, onPhasePatch, onFeedbackPatch, onRemove }) {
  const totalPhases = (assignment.phases || []).length || 1;
  const donePhases = (assignment.phases || []).filter((ph) => ph.status === "completed").length;
  const pct = Math.round((donePhases / totalPhases) * 100);
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`Assignment · ${assignment.id}`}
      title={`${assignment.testerName} · testing plan`}
      fullPage
      contentMaxWidth="max-w-5xl"
      footer={
        <>
          <GhostBtn onClick={onRemove} small danger><Trash2 size={11} /> Remove assignment</GhostBtn>
          <PrimaryBtn onClick={onClose} small><Check size={11} /> Done</PrimaryBtn>
        </>
      }
    >
      {/* Header summary */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3" style={{ fontFamily: "'Manrope', sans-serif" }}>
          <SummaryStat p={p} label="Tester" value={assignment.testerName} hint={assignment.testerEmail} />
          <SummaryStat p={p} label="Assigned by" value={assignment.assignedByName} hint={fmtRelative(assignment.assignedAt)} />
          <SummaryStat p={p} label="Status" value={statusLabel(assignment.status)} hint={`${donePhases} of ${totalPhases} phases · ${pct}%`} />
          <SummaryStat p={p} label="Confidence" value={assignment.confidence != null ? `${assignment.confidence} / 5` : "—"} hint="Self-reported at sign-off" />
        </div>
        <div className="mt-3" style={{ height: 6, backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}` }}>
          <div style={{ width: `${pct}%`, height: "100%", backgroundColor: p.accent }} />
        </div>
      </Card>

      {/* Phase tracker */}
      <Card title="Phases" padded={false} className="mt-5">
        <TableShell>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Phase</Th>
              <Th>Scope</Th>
              <Th>Status</Th>
              <Th>Feedback</Th>
            </tr>
          </thead>
          <tbody>
            {(assignment.phases || []).map((ph) => {
              const meta = TESTING_PLAN_PHASES.find((x) => String(x.id) === String(ph.id)) || {};
              const sc = ph.status === "completed" ? p.success : ph.status === "in-progress" ? p.warn : p.textMuted;
              return (
                <tr key={ph.id} style={{ borderTop: `1px solid ${p.border}` }}>
                  <Td>
                    <span style={{ color: p.accent, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem" }}>
                      {String(ph.id).padStart(2, "0")}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ color: p.textPrimary, fontWeight: 600 }}>{ph.label}</div>
                    <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{meta.duration || ""}</div>
                  </Td>
                  <Td muted>{meta.scope || ""}</Td>
                  <Td>
                    <SelectField
                      value={ph.status || "pending"}
                      onChange={(v) => onPhasePatch(ph.id, { status: v })}
                      options={[
                        { value: "pending", label: "Pending" },
                        { value: "in-progress", label: "In progress" },
                        { value: "completed", label: "Completed" },
                      ]}
                    />
                    <div className="mt-1" style={{ color: sc, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
                      ● {statusLabel(ph.status)}
                    </div>
                  </Td>
                  <Td>
                    <textarea
                      value={ph.feedback || ""}
                      onChange={(e) => onPhasePatch(ph.id, { feedback: e.target.value })}
                      rows={2}
                      placeholder="Friction, missing fields, ideas raised during this phase…"
                      className="w-full"
                      style={{
                        backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
                        padding: "0.5rem 0.65rem", fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.82rem", lineHeight: 1.45, resize: "vertical",
                      }}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      {/* Overall feedback */}
      <Card title="Overall feedback (sign-off)" className="mt-5">
        <p style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", lineHeight: 1.55, marginBottom: 12 }}>
          Filled by the tester once they finish all phases. The categories feed the next iteration's backlog — anything under <strong>Showstoppers</strong> blocks go-live.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TESTING_PLAN_FEEDBACK_FIELDS.map((field) => (
            <FormGroup key={field.key} label={field.label}>
              <textarea
                value={(assignment.overallFeedback || {})[field.key] || ""}
                onChange={(e) => onFeedbackPatch({ overallFeedback: { [field.key]: e.target.value } })}
                rows={3}
                placeholder={field.placeholder}
                className="w-full"
                style={{
                  backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${p.border}`,
                  padding: "0.55rem 0.7rem", fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.84rem", lineHeight: 1.5, resize: "vertical",
                }}
              />
            </FormGroup>
          ))}
          <FormGroup label="Confidence rating (1–5)">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => {
                const sel = assignment.confidence === n;
                return (
                  <button
                    key={n}
                    onClick={() => onFeedbackPatch({ confidence: n })}
                    style={{
                      width: 38, height: 38,
                      backgroundColor: sel ? p.accent : "transparent",
                      color: sel ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                      border: `1px solid ${sel ? p.accent : p.border}`,
                      fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.borderColor = p.accent; }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.borderColor = p.border; }}
                  >
                    {n}
                  </button>
                );
              })}
              <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", marginInlineStart: 6 }}>
                1 = not ready · 5 = production-ready
              </span>
            </div>
          </FormGroup>
        </div>
      </Card>
    </Drawer>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────
function statusLabel(s) {
  return s === "completed" ? "Completed" : s === "in-progress" ? "In progress" : "Pending";
}
function fmtRelative(iso) {
  if (!iso) return "—";
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffH = (now - then) / 3600000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))} min ago`;
  if (diffH < 24) return `${Math.round(diffH)} h ago`;
  if (diffH < 24 * 7) return `${Math.round(diffH / 24)} d ago`;
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function SummaryStat({ p, label, value, hint }) {
  return (
    <div style={{ backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`, padding: "10px 14px" }}>
      <div style={{ color: p.textMuted, fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div className="mt-1" style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 500, lineHeight: 1.15 }}>{value || "—"}</div>
      {hint && <div className="mt-1" style={{ color: p.textMuted, fontSize: "0.7rem" }}>{hint}</div>}
    </div>
  );
}

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
