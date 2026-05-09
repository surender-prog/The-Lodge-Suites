import { IMG } from "./images.js";

// Pricing in BHD, per night (rack rate, excl. 10% taxes). Translations live in
// src/i18n/translations.js (rooms.{id}.name / .short / .description / .features).
//
// Capacity model
// --------------
// `occupancy`   — HARD total ceiling. The combined adult + child count for
//                 any booking line cannot exceed `occupancy × qty` (plus any
//                 extra beds in play).
// `maxAdults`   — Optional sub-cap on adults per suite. Defaults to
//                 `occupancy` when not set, i.e. "no further restriction".
// `maxChildren` — Optional sub-cap on children per suite. Defaults to
//                 `occupancy` when not set.
//
// In other words: the operator can pick ANY combination of adults and
// children that fits inside the occupancy total, unless they explicitly
// dial down `maxAdults` or `maxChildren` to forbid certain combinations
// (e.g. "no children at all" → set `maxChildren: 0`). For the Lodge today:
//
//   Studio        →  occupancy 2 · max 2 adults · max 1 child
//                    Allowed combos: 2A · 1A+1C · 1C · 2C is blocked
//                    (kids never travel without an accompanying adult).
//   One-Bed       →  occupancy 3 · max 2 adults · max 2 children
//                    Allowed combos: 2A · 2A+1C · 1A+2C · 1A+1C · 1A · etc.
//   Two-Bed       →  occupancy 5 · max 4 adults · max 3 children
//   Three-Bed     →  occupancy 6 · max 4 adults · max 4 children
//
// Extra-bed model
// ---------------
//   extraBedAvailable / maxExtraBeds / extraBedFee / extraBedAdds
// — see the Rooms admin for live editing. An extra bed adds capacity on
// top of `occupancy`, so a One-Bed (occupancy 3) with 1 extra bed accepts
// 4 sleepers total, etc.
export const ROOMS = [
  {
    id: "studio",
    sqm: 43,
    occupancy: 2,
    maxAdults: 2,
    maxChildren: 1,
    price: 38,
    image: IMG.studioSuite,
    extraBedAvailable: false,
    maxExtraBeds: 0,
    extraBedFee: 0,
    extraBedAdds: { adults: 0, children: 0 },
  },
  {
    id: "one-bed",
    sqm: 60,
    occupancy: 3,
    maxAdults: 2,
    maxChildren: 2,
    price: 44,
    image: IMG.oneBedroom,
    popular: true,
    extraBedAvailable: true,
    maxExtraBeds: 1,
    extraBedFee: 15,
    // A One-Bed extra bed is a rollaway in the lounge — adds one adult
    // sleeper. Doesn't increase the child cap (already covered by the
    // sofa-bed policy in the suite).
    extraBedAdds: { adults: 1, children: 0 },
  },
  {
    id: "two-bed",
    sqm: 140,
    occupancy: 5,
    maxAdults: 4,
    maxChildren: 3,
    price: 78,
    image: IMG.twoBedroom,
    extraBedAvailable: true,
    maxExtraBeds: 1,
    extraBedFee: 18,
    extraBedAdds: { adults: 1, children: 0 },
  },
  {
    id: "three-bed",
    sqm: 150,
    occupancy: 6,
    maxAdults: 4,
    maxChildren: 4,
    price: 96,
    image: IMG.threeBedroom,
    extraBedAvailable: true,
    maxExtraBeds: 2,
    extraBedFee: 18,
    extraBedAdds: { adults: 1, children: 0 },
  },
];
