// Property photography lives in public/images and is referenced from the site root.
// All filenames were renamed from their original numeric IDs to descriptive slugs.
//
// CMS overrides
// -------------
// `IMG.<key>` is the BUILT-IN default. Operators can override the keys listed
// in CMS_IMAGE_KEYS below from the SiteContent admin section — the override
// is held in the data store under `siteContent.imageOverrides` and consumed
// via the `useImg(key)` hook below. If a key has no override, `useImg`
// returns the default from this catalog.
import { useData } from "./store.jsx";

export const IMG = {
  // Exterior
  heroExterior:        "/images/exterior-day.jpg",
  heroNight:           "/images/exterior-night-signage.jpg",
  exteriorEntrance:    "/images/exterior-entrance.jpg",
  exteriorFlowers:     "/images/exterior-flowers-sign.jpg",

  // Lobby & reception
  lobby:               "/images/lobby-main.jpg",
  lobby2:              "/images/lobby-lounge.jpg",
  lobbyReception:      "/images/lobby-reception.jpg",
  receptionDetail:     "/images/reception-detail.jpg",

  // Suites — used by ROOMS array
  studioSuite:         "/images/suite-studio-open-plan.jpg",
  oneBedroom:          "/images/suite-bedroom-chandelier.jpg",
  twoBedroom:          "/images/suite-living-kitchen.jpg",
  threeBedroom:        "/images/presidential-living.jpg",

  // Suite interiors
  bedMirror:           "/images/suite-bed-mirror.jpg",
  bedNightstand:       "/images/suite-bed-nightstand.jpg",
  bedPillows:          "/images/suite-bed-pillows.jpg",
  bedroomBlue:         "/images/suite-bedroom-blue.jpg",
  bedroomNavy:         "/images/suite-bedroom-navy.jpg",
  bedroomDay:          "/images/suite-bedroom-day.jpg",
  bedroomWindow:       "/images/suite-bedroom-window.jpg",
  bedroomCityView:     "/images/suite-bedroom-cityview.jpg",
  bedroomSeaView:      "/images/suite-bedroom-seaview.jpg",
  bedroomMirror:       "/images/suite-bedroom-mirror.jpg",
  livingRoom:          "/images/suite-living-bright.jpg",
  livingCorner:        "/images/suite-living-corner.jpg",
  livingDining:        "/images/suite-living-dining.jpg",
  diningArea:          "/images/suite-dining-view.jpg",
  diningNook:          "/images/suite-nook-seaview.jpg",

  // Kitchens & bathrooms
  kitchen:             "/images/suite-kitchen-bright.jpg",
  kitchenDining:       "/images/suite-kitchen-dining.jpg",
  bathroom:            "/images/bath-full.jpg",
  bathShower:          "/images/bath-shower-wall.jpg",
  bathAmenity:         "/images/bath-amenity-tray.jpg",

  // Wellness
  pool:                "/images/pool-day.jpg",
  poolside:            "/images/pool-day.jpg",
  sauna:               "/images/sauna.jpg",
  spaCorridor:         "/images/spa-corridor.jpg",
  gym:                 "/images/gym.jpg",
  spa:                 "/images/bath-amenity-tray.jpg",

  // Family / leisure
  kidsPlay:            "/images/kids-playroom.jpg",
  kidsBallPool:        "/images/kids-ball-pool.jpg",
  family:              "/images/kids-playroom.jpg",
  billiards:           "/images/billiards-table.jpg",
  billiardsDetail:     "/images/billiards-detail.jpg",

  // Business
  business:            "/images/business-meeting-room.jpg",

  // Views & lifestyle
  cityView:            "/images/view-city-window.jpg",
  romantic:            "/images/suite-bedroom-seaview.jpg",
  breakfast:           "/images/suite-dining-view.jpg",

  // Decor / details
  detailVase:          "/images/detail-vase-sculpture.jpg",
  detailBlueChair:     "/images/detail-blue-chair.jpg",
  detailBlueArmchairs: "/images/detail-blue-armchairs.jpg",

  // Brand assets
  logo:                "/images/logo.png",
};

// Marketing-site images that the SiteContent CMS exposes for editing.
// (The full IMG catalog is intentionally NOT all editable — only the surfaces
// an operator should reasonably swap from the admin.)
export const CMS_IMAGE_KEYS = [
  { key: "heroNight",     label: "Hero · night signage", hint: "Main hero image at the top of the home page." },
  { key: "heroExterior",  label: "Hero · day exterior",  hint: "Daytime exterior used in editorial blocks." },
  { key: "lobby",         label: "Lobby · main",         hint: "Lobby photo for editorial sections." },
  { key: "pool",          label: "Pool · day",           hint: "Wellness highlight." },
  { key: "logo",          label: "Brand · logo",         hint: "Logo on dark surfaces." },
];

// useImg(key) — returns the operator override if set, else the bundled
// default from IMG. Pass a known key from this catalog. Falls back to the
// raw `key` string only if no default exists.
export function useImg(key) {
  const { siteContent } = useData();
  const override = siteContent?.imageOverrides?.[key];
  if (override) return override;
  return IMG[key] || key;
}
