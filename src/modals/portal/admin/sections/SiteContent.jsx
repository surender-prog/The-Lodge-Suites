import React, { useMemo, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowUp, Building2, ChefHat, ExternalLink, Eye,
  Globe, HelpCircle, Image as ImageIcon, ImagePlus, Layout, MapPin, Megaphone,
  Plus, RotateCcw, Save, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData } from "../../../../data/store.jsx";
import { CMS_IMAGE_KEYS, IMG } from "../../../../data/images.js";
import { AMENITIES } from "../../../../data/amenities.js";
import { FAQS }      from "../../../../data/faqs.js";
import { DEFAULT_GALLERY_ITEMS } from "../../../../data/gallery.js";
import {
  Card, FormGroup, GhostBtn, PageHeader, PrimaryBtn, pushToast,
  TextField,
} from "../ui.jsx";
import { useT } from "../../../../i18n/LanguageContext.jsx";

// ---------------------------------------------------------------------------
// SiteContent — the public-website CMS. Every editable surface routes through
// the same store-backed override layer (`siteContent.textOverrides` for copy,
// `siteContent.imageOverrides` for hero/marketing images), so a save here
// instantly re-renders the public site with no rebuild.
//
// What's editable:
//   • Hero — eyebrow, two-line title, body, three stats, best-rate strip
//   • Intro strip — label + 3 body lines + tagline
//   • Site amenities — section heading + per-item label & note
//   • FAQs — section heading + each Q&A pair
//   • Contact — title, address, labels, map block
//   • Images — five marketing-page images (hero, lobby, pool, logo)
//
// What's intentionally NOT here:
//   • Suite content → Rooms & Rates section
//   • Offers / packages → Offers section
//   • LS Privilege tiers → Loyalty section
//   • Booking flow / extras → Extras section
//   • Email templates → Email Templates section
//
// Operator UX: every field shows the current value (override OR default) in
// the input, plus a tiny "Reset" pencil that clears the override and snaps
// back to the bundled default. A counter in the toolbar tells the operator
// how many fields are currently overridden.
// ---------------------------------------------------------------------------

// Field — composed of (a) a label, (b) the controlled input that writes back
// through `setSiteText`, and (c) a "Reset" pill that clears the override.
function CmsField({ path, label, hint, multiline = false, placeholder, defaultValue }) {
  const p = usePalette();
  const t = useT();
  const { siteContent, setSiteText } = useData();
  const overrides = siteContent?.textOverrides || {};
  const isOverridden = Object.prototype.hasOwnProperty.call(overrides, path);
  const value = isOverridden ? overrides[path] : (defaultValue != null ? String(defaultValue) : t(path));
  const InputTag = multiline ? "textarea" : "input";
  return (
    <FormGroup label={label}>
      <div className="flex" style={{ border: `1px solid ${isOverridden ? p.accent : p.border}`, backgroundColor: p.inputBg }}>
        <InputTag
          value={value}
          onChange={(e) => setSiteText(path, e.target.value)}
          placeholder={placeholder || t(path)}
          rows={multiline ? 3 : undefined}
          className="flex-1 outline-none"
          style={{
            backgroundColor: "transparent", color: p.textPrimary,
            padding: "0.6rem 0.75rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
            border: "none", minWidth: 0, resize: multiline ? "vertical" : "none",
          }}
        />
        {isOverridden && (
          <button
            type="button"
            title="Reset to default"
            onClick={() => setSiteText(path, "")}
            className="flex items-center px-3"
            style={{ color: p.textMuted, borderInlineStart: `1px solid ${p.border}`, background: "transparent" }}
            onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
            onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
      {isOverridden && (
        <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 4 }}>
          Override active
        </div>
      )}
    </FormGroup>
  );
}

function ImageField({ imgKey, label, hint }) {
  const p = usePalette();
  const { siteContent, setSiteImage } = useData();
  const override = siteContent?.imageOverrides?.[imgKey];
  const isOverridden = !!override;
  const fallback = IMG[imgKey] || "";
  const value = override ?? fallback;
  return (
    <FormGroup label={label}>
      <div className="grid grid-cols-1 md:grid-cols-[180px,1fr] gap-3 items-start">
        <div style={{
          width: "100%", aspectRatio: "16/10",
          backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`,
          backgroundImage: value ? `url(${value})` : "none",
          backgroundSize: "cover", backgroundPosition: "center",
        }} />
        <div>
          <div className="flex" style={{ border: `1px solid ${isOverridden ? p.accent : p.border}`, backgroundColor: p.inputBg }}>
            <input
              value={value}
              onChange={(e) => setSiteImage(imgKey, e.target.value)}
              placeholder={fallback}
              className="flex-1 outline-none"
              style={{
                backgroundColor: "transparent", color: p.textPrimary,
                padding: "0.6rem 0.75rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                border: "none", minWidth: 0,
              }}
            />
            {isOverridden && (
              <button
                type="button"
                title="Reset to default"
                onClick={() => setSiteImage(imgKey, "")}
                className="flex items-center px-3"
                style={{ color: p.textMuted, borderInlineStart: `1px solid ${p.border}`, background: "transparent" }}
                onMouseEnter={(e) => e.currentTarget.style.color = p.accent}
                onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
          {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 6 }}>{hint}</div>}
          <div style={{ color: p.textMuted, fontSize: "0.66rem", marginTop: 4, fontFamily: "ui-monospace, Menlo, monospace" }}>
            Default: <span style={{ color: p.textPrimary }}>{fallback}</span>
          </div>
          {isOverridden && (
            <div style={{ color: p.accent, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 4 }}>
              Override active
            </div>
          )}
        </div>
      </div>
    </FormGroup>
  );
}

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------
const TABS = [
  { id: "hero",       label: "Hero",       icon: Megaphone },
  { id: "intro",      label: "Intro",      icon: Sparkles },
  { id: "amenities",  label: "Amenities",  icon: ChefHat },
  { id: "gallery",    label: "Gallery",    icon: Layout },
  { id: "faqs",       label: "FAQs",       icon: HelpCircle },
  { id: "contact",    label: "Contact",    icon: MapPin },
  { id: "images",     label: "Images",     icon: ImageIcon },
];

export const SiteContent = () => {
  const p = usePalette();
  const { siteContent, resetSiteContent } = useData();
  const [tab, setTab]       = useState("hero");
  const [search, setSearch] = useState("");

  const textOverrides  = siteContent?.textOverrides  || {};
  const imageOverrides = siteContent?.imageOverrides || {};
  const galleryItems   = siteContent?.galleryItems;
  // Treat the gallery as an "override" for the KPI counter the same way
  // text/image edits are counted, so the operator sees a true total of
  // edited surfaces.
  const galleryOverridden = galleryItems !== null && galleryItems !== undefined;
  const overrideCount = Object.keys(textOverrides).length + Object.keys(imageOverrides).length + (galleryOverridden ? 1 : 0);
  const galleryDisplayCount = galleryOverridden
    ? galleryItems.length
    : DEFAULT_GALLERY_ITEMS.length;

  const matches = (label) => !search.trim() || label.toLowerCase().includes(search.trim().toLowerCase());

  const onResetAll = () => {
    if (overrideCount === 0) return;
    if (!confirm(`Reset all ${overrideCount} site-content override${overrideCount === 1 ? "" : "s"}?\n\nThis snaps every edited field back to the bundled default. The action can't be undone.`)) return;
    resetSiteContent();
    pushToast({ message: "Site content reset to defaults" });
  };

  return (
    <div>
      <PageHeader
        title="Site Content"
        intro="Edit the public marketing site without redeploying. Every save here renders live on the home page; reset any field to snap back to the bundled default."
        action={
          <div className="flex items-center gap-2">
            <GhostBtn small onClick={() => window.open("/", "_blank", "noopener,noreferrer")}>
              <Eye size={13} /> Preview site
            </GhostBtn>
            {overrideCount > 0 && (
              <GhostBtn small onClick={onResetAll}>
                <RotateCcw size={13} /> Reset all
              </GhostBtn>
            )}
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <CmsKpi label="Active overrides" value={overrideCount} hint={overrideCount === 0 ? "All defaults" : `${Object.keys(textOverrides).length} text · ${Object.keys(imageOverrides).length} image${galleryOverridden ? " · gallery" : ""}`} />
        <CmsKpi label="Editable surfaces" value={TABS.length} hint="Hero · Intro · Amenities · Gallery · FAQs · Contact · Images" />
        <CmsKpi label="Gallery items" value={galleryDisplayCount} hint={galleryOverridden ? "Operator-edited" : "Using defaults"} />
        <CmsKpi label="FAQs"      value={FAQS.length}      hint={`${FAQS.length * 2} editable strings`} />
      </div>

      {/* Mocked-pipeline notice */}
      <div className="mb-6 p-4 flex items-start gap-3" style={{
        backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`,
        borderInlineStart: `3px solid ${p.warn}`,
      }}>
        <AlertCircle size={14} style={{ color: p.warn, marginTop: 2 }} />
        <div style={{ color: p.textSecondary, fontSize: "0.82rem", lineHeight: 1.5 }}>
          <strong>In-memory CMS.</strong> Per CLAUDE.md, edits live in the data store only. When the production CMS backend lands (or git-based content publishing), the same override shape persists — no UI changes needed.
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((tt) => {
          const Icon = tt.icon;
          const active = tab === tt.id;
          return (
            <button key={tt.id} onClick={() => setTab(tt.id)}
              className="inline-flex items-center gap-2"
              style={{
                padding: "0.5rem 0.95rem",
                backgroundColor: active ? p.accent : "transparent",
                color: active ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textSecondary,
                border: `1px solid ${active ? p.accent : p.border}`,
                fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; } }}
            ><Icon size={12} /> {tt.label}</button>
          );
        })}
      </div>

      {/* Search */}
      {(tab === "amenities" || tab === "faqs") && (
        <Card className="mb-5">
          <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
            <span className="flex items-center px-3" style={{ color: p.textMuted }}><Search size={14} /></span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by id or label…"
              className="flex-1 outline-none"
              style={{ backgroundColor: "transparent", color: p.textPrimary, padding: "0.6rem 0.5rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", border: "none", minWidth: 0 }}
            />
          </div>
        </Card>
      )}

      {tab === "hero"      && <HeroEditor />}
      {tab === "intro"     && <IntroEditor />}
      {tab === "amenities" && <AmenitiesEditor matches={matches} />}
      {tab === "gallery"   && <GalleryEditor />}
      {tab === "faqs"      && <FaqsEditor      matches={matches} />}
      {tab === "contact"   && <ContactEditor />}
      {tab === "images"    && <ImagesEditor />}
    </div>
  );
};

function CmsKpi({ label, value, hint }) {
  const p = usePalette();
  return (
    <div className="p-4" style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.7rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6, fontWeight: 700 }}>{label}</div>
      {hint && <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO editor
// ---------------------------------------------------------------------------
function HeroEditor() {
  return (
    <Card title="Hero · home-page banner">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CmsField path="common.location"     label="Eyebrow location chip" hint="Tiny gold chip above the title — e.g. 'Juffair · Manama · Bahrain'." />
        <CmsField path="hero.bestRate"       label="Best-rate banner"       hint="Caption shown under the booking widget." />
        <CmsField path="hero.h1Line1"        label="Title — line 1" />
        <CmsField path="hero.h1Line2"        label="Title — line 2 (italic gold)" />
      </div>
      <CmsField path="hero.body" label="Body paragraph" multiline className="mt-4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <CmsField path="hero.rating"         label="Stat 1 · rating" />
        <CmsField path="hero.seventyTwo"     label="Stat 2 · suite count" />
        <CmsField path="hero.opened"         label="Stat 3 · opened year" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <CmsField path="hero.fields.checkIn"  label="Booking widget · check-in label" />
        <CmsField path="hero.fields.checkOut" label="Booking widget · check-out label" />
        <CmsField path="hero.fields.adults"   label="Booking widget · adults label" />
        <CmsField path="hero.fields.children" label="Booking widget · children label" />
      </div>
      <div className="mt-6">
        <ImageField imgKey="heroNight" label="Hero image (night signage)" hint="Background image filling the hero. Use a /images/… path or a full URL. Aim for landscape, ≥ 2400px wide." />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// INTRO editor
// ---------------------------------------------------------------------------
function IntroEditor() {
  return (
    <Card title="Intro strip · positioning band">
      <CmsField path="intro.label"   label="Eyebrow" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <CmsField path="intro.body1" label="Line 1" multiline />
        <CmsField path="intro.body2" label="Line 2" multiline />
        <CmsField path="intro.body3" label="Line 3" multiline />
      </div>
      <CmsField path="intro.tagline" label="Tagline (closing line)" className="mt-4" />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AMENITIES editor — section heading + per-item copy
// ---------------------------------------------------------------------------
function AmenitiesEditor({ matches }) {
  return (
    <>
      <Card title="Amenities · section heading" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CmsField path="amenities.label"   label="Eyebrow" />
          <CmsField path="amenities.titleA"  label="Title (regular)" />
          <CmsField path="amenities.titleB"  label="Title (italic)" />
        </div>
        <CmsField path="amenities.intro" label="Section intro paragraph" multiline className="mt-4" />
      </Card>

      <Card title={`Amenities · ${AMENITIES.length} items`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {AMENITIES.filter((a) => matches(a.id)).map((a) => (
            <AmenityCard key={a.id} amenity={a} />
          ))}
        </div>
      </Card>
    </>
  );
}

function AmenityCard({ amenity }) {
  const p = usePalette();
  return (
    <div className="p-4" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{
          fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          color: p.accent, padding: "2px 7px",
          backgroundColor: `${p.accent}1F`, border: `1px solid ${p.accent}`,
        }}>{amenity.id}</span>
        <span style={{ color: p.textMuted, fontSize: "0.7rem" }}>icon: <code style={{ color: p.textPrimary }}>{amenity.icon}</code></span>
      </div>
      <CmsField path={`amenities.items.${amenity.id}.label`} label="Label" />
      <div className="mt-3">
        <CmsField path={`amenities.items.${amenity.id}.note`} label="Note" multiline />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQs editor
// ---------------------------------------------------------------------------
function FaqsEditor({ matches }) {
  return (
    <>
      <Card title="FAQs · section heading" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CmsField path="faq.label" label="Eyebrow" />
          <CmsField path="faq.title" label="Title" />
        </div>
      </Card>

      <Card title={`FAQs · ${FAQS.length} entries`}>
        <div className="space-y-4">
          {FAQS.filter((f) => matches(f.id)).map((f) => (
            <FaqCard key={f.id} faq={f} />
          ))}
        </div>
      </Card>
    </>
  );
}

function FaqCard({ faq }) {
  const p = usePalette();
  return (
    <div className="p-4" style={{ border: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{
          fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
          color: p.accent, padding: "2px 7px",
          backgroundColor: `${p.accent}1F`, border: `1px solid ${p.accent}`,
        }}>{faq.id}</span>
      </div>
      <CmsField path={`faq.items.${faq.id}.q`} label="Question" />
      <div className="mt-3">
        <CmsField path={`faq.items.${faq.id}.a`} label="Answer" multiline />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONTACT editor
// ---------------------------------------------------------------------------
function ContactEditor() {
  return (
    <>
      <Card title="Contact · section heading" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CmsField path="contact.label"  label="Eyebrow" />
          <CmsField path="contact.titleA" label="Title (regular)" />
          <CmsField path="contact.titleB" label="Title (italic)" />
        </div>
      </Card>

      <Card title="Address" className="mb-5">
        <CmsField path="contact.addressLabel" label="Address label" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
          <CmsField path="contact.addressLine1" label="Line 1" />
          <CmsField path="contact.addressLine2" label="Line 2" />
          <CmsField path="contact.addressLine3" label="Line 3" />
        </div>
      </Card>

      <Card title="Channels" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CmsField path="contact.phoneLabel"        label="Phone label" />
          <CmsField path="contact.reservationsLabel" label="Reservations label" />
          <CmsField path="contact.followLabel"       label="Follow-us label" />
        </div>
      </Card>

      <Card title="Map block">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CmsField path="contact.mapName"   label="Map place name" />
          <CmsField path="contact.mapCoords" label="Coordinates / area note" />
          <CmsField path="contact.openMaps"  label="Open-in-Maps CTA" />
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// GALLERY editor — full CRUD over the public-page gallery items.
// `siteContent.galleryItems` is null until the operator edits anything,
// then becomes a materialised array of `{ id, src, h, caption }`. The
// public GallerySection reads from this list with the bundled defaults
// as a fallback.
// ---------------------------------------------------------------------------
function GalleryEditor() {
  const p = usePalette();
  const {
    siteContent, setGalleryItems, addGalleryItem, updateGalleryItem,
    removeGalleryItem, moveGalleryItem, resetGallery,
  } = useData();
  const items = siteContent?.galleryItems;
  const isOverridden = items !== null && items !== undefined;
  // The list shown in the editor — either the materialised CMS list or
  // the bundled defaults (read-only-feeling unless the operator edits).
  const displayItems = isOverridden ? items : DEFAULT_GALLERY_ITEMS;

  // First-touch helper: when the operator clicks Add or edits a default
  // item, materialise the defaults into the store so subsequent edits
  // have something concrete to mutate.
  const ensureMaterialised = () => {
    if (!isOverridden) setGalleryItems(DEFAULT_GALLERY_ITEMS.slice());
  };

  const onAdd = () => {
    if (!isOverridden) {
      setGalleryItems([
        ...DEFAULT_GALLERY_ITEMS,
        { id: `g-${Date.now().toString(36)}`, src: "", h: "wide", caption: "" },
      ]);
    } else {
      addGalleryItem({});
    }
    pushToast({ message: "New gallery item added at the end of the list" });
  };

  const onPatch = (index, patch) => {
    ensureMaterialised();
    // After materialising in the next render, the index is the same. We
    // dispatch the patch synchronously so it lands on the materialised list.
    if (!isOverridden) {
      const next = DEFAULT_GALLERY_ITEMS.map((item, i) => i === index ? { ...item, ...patch } : item);
      setGalleryItems(next);
    } else {
      updateGalleryItem(index, patch);
    }
  };

  const onRemove = (index) => {
    if (displayItems.length <= 1) {
      pushToast({ message: "The gallery needs at least one image. Add another before removing this.", kind: "warn" });
      return;
    }
    if (!confirm(`Remove "${displayItems[index]?.caption || displayItems[index]?.id || "this image"}" from the gallery?`)) return;
    if (!isOverridden) {
      const next = DEFAULT_GALLERY_ITEMS.filter((_, i) => i !== index);
      setGalleryItems(next);
    } else {
      removeGalleryItem(index);
    }
    pushToast({ message: "Gallery item removed" });
  };

  const onMove = (index, dir) => {
    ensureMaterialised();
    if (!isOverridden) {
      const next = DEFAULT_GALLERY_ITEMS.slice();
      const target = index + dir;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      setGalleryItems(next);
    } else {
      moveGalleryItem(index, dir);
    }
  };

  const onReset = () => {
    if (!isOverridden) return;
    if (!confirm(`Reset the gallery to its bundled default of ${DEFAULT_GALLERY_ITEMS.length} items?\n\nAll added items will be removed and edits to existing items will be undone.`)) return;
    resetGallery();
    pushToast({ message: "Gallery reset to defaults" });
  };

  return (
    <>
      <Card
        title={`Gallery items · ${displayItems.length}`}
        action={
          <div className="flex items-center gap-2">
            {isOverridden && (
              <GhostBtn small onClick={onReset}>
                <RotateCcw size={11} /> Reset gallery
              </GhostBtn>
            )}
            <PrimaryBtn small onClick={onAdd}>
              <ImagePlus size={11} /> Add image
            </PrimaryBtn>
          </div>
        }
        className="mb-5"
      >
        <p style={{ color: p.textSecondary, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.6 }}>
          The public Gallery section uses an editorial masonry grid — the <strong style={{ color: p.textPrimary }}>1st</strong> and <strong style={{ color: p.textPrimary }}>3rd</strong> items span two columns; <strong style={{ color: p.textPrimary }}>tall</strong> items span two rows. Reorder to control the rhythm.
        </p>
        {!isOverridden && (
          <div className="mt-3 p-3 flex items-start gap-2" style={{ backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`, borderInlineStart: `3px solid ${p.warn}` }}>
            <AlertCircle size={13} style={{ color: p.warn, marginTop: 2, flexShrink: 0 }} />
            <div style={{ color: p.textSecondary, fontSize: "0.82rem", lineHeight: 1.55 }}>
              You're viewing the <strong>bundled defaults</strong>. Any edit (add, remove, reorder, change a caption) materialises these into the CMS — you can always reset later.
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {displayItems.map((item, index) => (
          <GalleryItemRow
            key={item.id || index}
            index={index}
            total={displayItems.length}
            item={item}
            onPatch={(patch) => onPatch(index, patch)}
            onRemove={() => onRemove(index)}
            onMove={(dir) => onMove(index, dir)}
          />
        ))}
      </div>
    </>
  );
}

function GalleryItemRow({ index, total, item, onPatch, onRemove, onMove }) {
  const p = usePalette();
  const isHero = index === 0 || index === 2;
  const spanLabel = isHero ? "spans 2 cols" : "spans 1 col";
  return (
    <Card padded={false}>
      <div className="grid grid-cols-1 md:grid-cols-[180px,1fr,auto] gap-4 p-4 items-start">
        {/* Live thumbnail preview — same aspect rule as the public site */}
        <div style={{
          width: "100%", aspectRatio: item.h === "tall" ? "3/4" : "16/10",
          backgroundColor: p.bgPanelAlt, border: `1px solid ${p.border}`,
          backgroundImage: item.src ? `url(${item.src})` : "none",
          backgroundSize: "cover", backgroundPosition: "center",
          position: "relative",
        }}>
          {/* Position badge so the operator sees where this lands in the grid */}
          <span style={{
            position: "absolute", top: 6, insetInlineStart: 6,
            color: "#FFFFFF", backgroundColor: "rgba(21,22,26,0.78)",
            border: `1px solid rgba(255,255,255,0.18)`,
            padding: "2px 7px", fontSize: "0.55rem",
            letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
            fontFamily: "'Manrope', sans-serif",
          }}>#{index + 1}</span>
        </div>

        {/* Editable fields */}
        <div className="min-w-0 space-y-3">
          <FormGroup label="Image URL">
            <input
              value={item.src || ""}
              onChange={(e) => onPatch({ src: e.target.value })}
              placeholder="/images/your-photo.jpg or https://…"
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary,
                border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
              }}
            />
          </FormGroup>
          <FormGroup label="Caption (shown on hover)">
            <input
              value={item.caption || ""}
              onChange={(e) => onPatch({ caption: e.target.value })}
              placeholder="The Lobby"
              className="w-full outline-none"
              style={{
                backgroundColor: p.inputBg, color: p.textPrimary,
                border: `1px solid ${p.border}`, padding: "0.55rem 0.7rem",
                fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
              }}
            />
          </FormGroup>
          <div className="flex items-center gap-3 flex-wrap">
            <FormGroup label="Aspect">
              <div className="flex gap-2">
                {[
                  { id: "wide", label: "Wide", note: "1 row" },
                  { id: "tall", label: "Tall", note: "2 rows" },
                ].map((opt) => {
                  const sel = (item.h || "wide") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => onPatch({ h: opt.id })}
                      style={{
                        padding: "0.4rem 0.85rem",
                        backgroundColor: sel ? `${p.accent}1F` : "transparent",
                        border: `1px solid ${sel ? p.accent : p.border}`,
                        color: sel ? p.accent : p.textSecondary,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
                        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >{opt.label} <span style={{ opacity: 0.7, marginInlineStart: 4 }}>· {opt.note}</span></button>
                  );
                })}
              </div>
            </FormGroup>
            <span style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", marginTop: 16 }}>
              Position #{index + 1} · {spanLabel}
            </span>
          </div>
        </div>

        {/* Reorder + delete */}
        <div className="flex md:flex-col items-end gap-2">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move up"
            style={iconBtnStyle(p, index === 0)}
            aria-label="Move up"
          ><ArrowUp size={13} /></button>
          <button
            onClick={() => onMove(+1)}
            disabled={index === total - 1}
            title="Move down"
            style={iconBtnStyle(p, index === total - 1)}
            aria-label="Move down"
          ><ArrowDown size={13} /></button>
          <button
            onClick={onRemove}
            title="Remove image"
            style={{ ...iconBtnStyle(p, false), color: p.danger, borderColor: `${p.danger}40` }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${p.danger}14`; e.currentTarget.style.borderColor = p.danger; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = `${p.danger}40`; }}
            aria-label="Remove image"
          ><Trash2 size={13} /></button>
        </div>
      </div>
    </Card>
  );
}

function iconBtnStyle(p, disabled) {
  return {
    width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
    border: `1px solid ${disabled ? p.border : p.border}`,
    color: disabled ? p.textMuted : p.textSecondary,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    flexShrink: 0,
  };
}

// ---------------------------------------------------------------------------
// IMAGES editor — overrides for the curated CMS image set
// ---------------------------------------------------------------------------
function ImagesEditor() {
  return (
    <Card title={`Marketing-page images · ${CMS_IMAGE_KEYS.length}`}>
      <div className="space-y-5">
        {CMS_IMAGE_KEYS.map((img) => (
          <ImageField key={img.key} imgKey={img.key} label={img.label} hint={img.hint} />
        ))}
      </div>
      <div className="mt-5 p-3 flex items-start gap-2" style={{ backgroundColor: "transparent", border: `1px dashed currentColor`, color: "var(--ls-textMuted, #6B665C)" }}>
        <ImageIcon size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: "0.78rem", lineHeight: 1.55 }}>
          For a full asset upload pipeline (drag-drop, S3, CDN), wire the SiteContent admin to the production media service. The override shape stays the same — `imageOverrides[key] = url` — so no other code changes are needed.
        </div>
      </div>
    </Card>
  );
}
