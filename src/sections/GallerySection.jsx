import React from "react";
import { C } from "../data/tokens.js";
import { useData } from "../data/store.jsx";
import { DEFAULT_GALLERY_ITEMS } from "../data/gallery.js";
import { SectionLabel, SectionTitle } from "../components/primitives.jsx";
import { useT } from "../i18n/LanguageContext.jsx";

// GallerySection — public masonry gallery on the home page.
//
// Reads from `siteContent.galleryItems` first (the SiteContent CMS lets the
// operator add, remove, reorder and re-caption images at runtime). When the
// CMS hasn't been touched the value is `null`, so we fall back to the
// bundled `DEFAULT_GALLERY_ITEMS` from data/gallery.js — and captions for
// those defaults still flow through the i18n strings so they translate.
export const GallerySection = () => {
  const t = useT();
  const { siteContent } = useData();
  const cmsItems = siteContent?.galleryItems;
  const usingDefaults = !cmsItems;
  const items = (cmsItems && cmsItems.length > 0) ? cmsItems : DEFAULT_GALLERY_ITEMS;

  return (
    <section id="gallery" className="py-24 px-6" style={{ backgroundColor: C.bgCharcoal }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <SectionLabel light>{t("gallery.label")}</SectionLabel>
          <SectionTitle light italic={t("gallery.titleB")}>{t("gallery.titleA")}</SectionTitle>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ gridAutoRows: "minmax(180px, auto)" }}>
          {items.map((item, i) => {
            // Captions: when running on defaults, prefer the i18n string
            // (so the gallery captions translate). When the operator has
            // edited the gallery, the caption stored on the item wins.
            const caption = usingDefaults
              ? t(`gallery.items.${item.id}`)
              : (item.caption || "");
            return (
              <div
                key={item.id || i}
                className="relative overflow-hidden group cursor-pointer"
                style={{
                  // First and third items span 2 columns to create the
                  // editorial masonry rhythm. Other items span 1.
                  gridColumn: i === 0 ? "span 2" : i === 2 ? "span 2" : "span 1",
                  gridRow: item.h === "tall" ? "span 2" : "span 1",
                }}
              >
                <img src={item.src} alt={caption} className="w-full h-full object-cover absolute inset-0 transition-transform duration-1000 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {caption && (
                  <div className="absolute bottom-4 start-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", color: C.cream, fontSize: "1.1rem"
                  }}>{caption}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
