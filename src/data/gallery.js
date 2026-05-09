import { IMG } from "./images.js";

// Default gallery items that the public Gallery section renders out of the
// box. The SiteContent CMS can replace this list at runtime — the public
// component reads from the store first and falls back to this default when
// the CMS hasn't been touched.
//
// Item shape:
//   id      — stable identifier used as the React key
//   src     — image URL (defaults below point to the bundled /images/* files,
//             but the CMS accepts any path or external URL)
//   h       — "tall" | "wide" — controls the masonry row span
//   caption — caption shown on hover (free text; no i18n lookup once the
//             CMS has been edited, so the operator can write captions in
//             whichever language they want)
export const DEFAULT_GALLERY_ITEMS = [
  { id: "lobby",     src: IMG.lobby,    h: "tall", caption: "The Lobby" },
  { id: "pool",      src: IMG.pool,     h: "wide", caption: "Rooftop Pool" },
  { id: "cityView",  src: IMG.cityView, h: "wide", caption: "Juffair Skyline" },
  { id: "bathroom",  src: IMG.bathroom, h: "tall", caption: "Suite Bathroom" },
  { id: "kitchen",   src: IMG.kitchen,  h: "wide", caption: "Suite Kitchen" },
  { id: "gym",       src: IMG.gym,      h: "wide", caption: "Fitness Centre" },
];
