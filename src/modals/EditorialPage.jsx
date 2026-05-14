import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { C } from "../data/tokens.js";
import { Crosshatch } from "../components/Crosshatch.jsx";

// ---------------------------------------------------------------------------
// EditorialPage — shared full-screen page chrome used by the secondary
// marketing pages (Gift Vouchers, Juffair, Press). Locks body scroll while
// open, paints a dark cinematic hero from a passed-in image, and renders
// the supplied children on a cream paper canvas. Per CLAUDE.md the site
// has no router, so these "pages" are full-viewport modals — they exit on
// Esc or via the close button and they restore scroll on close.
// ---------------------------------------------------------------------------
export const EditorialPage = ({
  open, onClose,
  eyebrow,                     // small uppercase chip above the title
  title,                       // big serif headline
  italic,                      // italic gold sub-line
  intro,                       // body paragraph below the title
  heroImage,                   // background image url for the hero
  children,                    // page sections
  cta,                         // optional react node rendered to the right of the hero header
}) => {
  // Scroll lock + Esc-to-close — match the rest of the modal family.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Track whether the user has scrolled past the hero so the sticky
  // mini-toolbar (Back to home + close) only appears after the hero has
  // scrolled out of view. While the hero is still visible the in-hero
  // buttons handle the same actions, so we don't double up.
  const scrollRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // 280 px = about the point where the hero title block exits the
      // viewport on common laptop heights. Small enough that the toolbar
      // doesn't pop in immediately but big enough that the in-hero
      // buttons remain the obvious affordance up top.
      setScrolled(el.scrollTop > 280);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  if (!open) return null;

  return (
    <div ref={scrollRef} className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: C.paper }}>
      {/* Floating mini-toolbar — fades in once the hero scrolls off so
          the guest still has a one-tap exit deep into the page. Fixed
          (not sticky) so it doesn't reserve any layout space while
          hidden, and so it always pins to the viewport top regardless
          of which scroll container we're nested inside. */}
      <div
        className="fixed inset-x-0 top-0 z-[60] transition-opacity"
        style={{
          opacity: scrolled ? 1 : 0,
          pointerEvents: scrolled ? "auto" : "none",
          backgroundColor: "rgba(21,22,26,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div className="px-6 md:px-10 py-3 flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="inline-flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              color: C.gold, padding: "0.4rem 0.8rem",
              border: `1px solid ${C.gold}`, backgroundColor: "transparent", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${C.gold}1F`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <ArrowLeft size={11} /> Back to home
          </button>
          <button onClick={onClose}
            aria-label="Close"
            style={{
              color: C.cream, padding: 7,
              border: `1px solid ${C.border}`, backgroundColor: "transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = C.gold; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.cream; e.currentTarget.style.borderColor = C.border; }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Hero — cinematic dark band with the page title. No longer
          `flex-shrink-0` because the outer container is a single
          natural scroll context; the hero scrolls away with everything
          else and the floating toolbar above takes over for
          navigation once it's out of view. */}
      <header className="relative" style={{ backgroundColor: C.bgDeep, minHeight: 360 }}>
        {heroImage && (
          <div className="absolute inset-0">
            <img src={heroImage} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{
              background: `linear-gradient(180deg, rgba(21,22,26,0.55) 0%, rgba(21,22,26,0.65) 60%, rgba(21,22,26,0.95) 100%)`,
            }} />
            <Crosshatch opacity={0.05} />
          </div>
        )}

        {/* Top bar */}
        <div className="relative px-6 md:px-10 py-5 flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="inline-flex items-center gap-2"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              color: C.gold, padding: "0.55rem 0.95rem",
              border: `1px solid ${C.gold}`, backgroundColor: "transparent", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${C.gold}1F`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <ArrowLeft size={13} /> Back to home
          </button>
          <button onClick={onClose}
            aria-label="Close"
            style={{
              color: C.cream, padding: 8,
              border: `1px solid ${C.border}`, backgroundColor: "rgba(21,22,26,0.55)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = C.gold; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.cream; e.currentTarget.style.borderColor = C.border; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Title block */}
        <div className="relative px-6 md:px-10 pt-6 pb-12 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-8">
              {eyebrow && (
                <div style={{
                  color: C.gold, fontFamily: "'Manrope', sans-serif",
                  fontSize: "0.7rem", letterSpacing: "0.32em", textTransform: "uppercase",
                  fontWeight: 700, marginBottom: 16,
                }}>
                  <span style={{ borderBottom: `1px solid ${C.gold}`, paddingBottom: 4 }}>{eyebrow}</span>
                </div>
              )}
              <h1 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(2.4rem, 5vw, 4.2rem)",
                fontWeight: 300, color: C.cream,
                lineHeight: 1.02, letterSpacing: "-0.012em",
                marginBottom: italic ? 4 : 0,
              }}>
                {title}
                {italic && (
                  <>
                    <br />
                    <span style={{ fontStyle: "italic", color: C.gold, fontWeight: 400 }}>{italic}</span>
                  </>
                )}
              </h1>
              {intro && (
                <p style={{
                  color: C.textOnDark, fontFamily: "'Manrope', sans-serif",
                  fontSize: "1rem", lineHeight: 1.7, maxWidth: 620, marginTop: 18, opacity: 0.88,
                }}>
                  {intro}
                </p>
              )}
            </div>
            {cta && <div className="lg:col-span-4 flex justify-end">{cta}</div>}
          </div>
        </div>
      </header>

      {/* Body — no longer a separate scroll context. Lives inside the
          page's natural document flow under the hero so the wheel /
          touchpad scrolls everything together. */}
      <main style={{ backgroundColor: C.paper }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-14 md:py-20">
          {children}
        </div>
      </main>
    </div>
  );
};

// Section heading — reuse across pages for visual consistency.
export const PageSection = ({ eyebrow, title, italic, intro, children, narrow = false }) => (
  <section className={narrow ? "max-w-3xl mx-auto" : ""} style={{ marginBottom: "4rem" }}>
    <div className="grid lg:grid-cols-12 gap-8 mb-10">
      <div className="lg:col-span-5">
        {eyebrow && (
          <div style={{
            color: C.goldDeep, fontFamily: "'Manrope', sans-serif",
            fontSize: "0.66rem", letterSpacing: "0.3em", textTransform: "uppercase",
            fontWeight: 700, marginBottom: 10,
          }}>{eyebrow}</div>
        )}
        {title && (
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(1.85rem, 3.4vw, 2.7rem)",
            fontWeight: 400, color: C.bgDeep,
            lineHeight: 1.05, letterSpacing: "-0.01em",
          }}>
            {title}
            {italic && (
              <>
                {" "}
                <span style={{ fontStyle: "italic", color: C.goldDeep }}>{italic}</span>
              </>
            )}
          </h2>
        )}
      </div>
      {intro && (
        <p className="lg:col-span-6 lg:col-start-7" style={{
          fontFamily: "'Manrope', sans-serif", color: C.textDim,
          fontSize: "1rem", lineHeight: 1.8,
        }}>
          {intro}
        </p>
      )}
    </div>
    {children}
  </section>
);
