import { IMG } from "./images.js";
import { C } from "./tokens.js";

// Translations for title / inclusions live in src/i18n/translations.js
// (packages.{id}.title / .nights / .inclusions).
//
// Each package can carry conditions that constrain how it can be booked:
//   • roomIds      — array of room IDs the offer is bookable against. Empty = any.
//   • roomPricing  — per-room { price, saving } map keyed by room ID. The
//                    homepage card surfaces the LOWEST price; the booking
//                    screen renders the matching price when a guest picks
//                    that suite. Falls back to the package-level `price` /
//                    `saving` fields when an entry is missing.
//   • minNights    — required minimum stay length (1 = at least 1 night).
//   • maxNights    — required maximum stay length (0 = no upper bound).
//   • bookingValidFrom / bookingValidTo — ISO dates bracketing when the
//                    offer can be reserved (empty = no booking-window cap).
//   • stayValidFrom / stayValidTo       — ISO dates bracketing when the
//                    stay itself must take place (empty = always valid).
//   • pricingMode  — controls how the per-room price is applied across the
//                    stay length:
//                      "per-night"   (default) — price × nights, saving × nights
//                      "first-night" — first night at offer price, the rest at
//                                      the suite's standard rack rate
//                      "flat"        — single fee for the whole stay
// Guest constraints are derived live from the chosen suite's occupancy —
// the admin no longer configures min/max guests on the offer.
export const PACKAGES = [
  {
    id: "spa-stay",
    image: IMG.spa,
    icon: "Sparkles",
    color: C.gold,
    roomIds: ["one-bed", "two-bed", "three-bed"],
    roomPricing: {
      "one-bed":   { price: 79,  saving: 22 },
      "two-bed":   { price: 119, saving: 35 },
      "three-bed": { price: 169, saving: 52 },
    },
    minNights: 1, maxNights: 3,
    pricingMode: "per-night",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  },
  {
    id: "breakfast-included",
    image: IMG.breakfast,
    icon: "Coffee",
    color: C.goldBright,
    roomIds: [],
    roomPricing: {
      "studio":    { price: 52,  saving: 12 },
      "one-bed":   { price: 64,  saving: 14 },
      "two-bed":   { price: 89,  saving: 18 },
      "three-bed": { price: 109, saving: 22 },
    },
    minNights: 1, maxNights: 0,
    pricingMode: "per-night",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  },
  {
    id: "staycation",
    image: IMG.poolside,
    icon: "Waves",
    color: C.gold,
    featured: true,
    roomIds: ["studio", "one-bed"],
    roomPricing: {
      "studio":  { price: 145, saving: 35 },
      "one-bed": { price: 195, saving: 45 },
    },
    minNights: 2, maxNights: 3,
    pricingMode: "flat",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  },
  {
    id: "romantic",
    image: IMG.romantic,
    icon: "Heart",
    color: C.burgundy,
    roomIds: ["one-bed", "two-bed"],
    roomPricing: {
      "one-bed": { price: 99,  saving: 28 },
      "two-bed": { price: 139, saving: 38 },
    },
    minNights: 1, maxNights: 2,
    pricingMode: "first-night",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  },
  {
    id: "family",
    image: IMG.family,
    icon: "Baby",
    color: C.navy,
    roomIds: ["two-bed", "three-bed"],
    roomPricing: {
      "two-bed":   { price: 120, saving: 40 },
      "three-bed": { price: 165, saving: 55 },
    },
    minNights: 2, maxNights: 7,
    pricingMode: "per-night",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  },
  {
    id: "extended",
    image: IMG.livingRoom,
    icon: "Hotel",
    color: C.gold,
    roomIds: [],
    roomPricing: {
      "studio":    { price: 36, saving: 30 },
      "one-bed":   { price: 42, saving: 36 },
      "two-bed":   { price: 65, saving: 56 },
      "three-bed": { price: 79, saving: 72 },
    },
    minNights: 7, maxNights: 0,
    pricingMode: "per-night",
    bookingValidFrom: "", bookingValidTo: "",
    stayValidFrom: "",    stayValidTo: "",
  },
];
