# CLAUDE.md

This file gives Claude Code (claude.ai/code) the context it needs to work effectively in this repository.

## Project

**The Lodge Suites** — luxury serviced apartment website for a 72-suite property in Juffair, Manama, Bahrain. Single-page React app with two surfaces: a guest-facing booking experience and an operator-facing partner portal (Corporate / Travel Agent / Admin tabs).

The site is a marketing + light-operations frontend. The intent is to eventually wire it to a PMS, channel manager, payment gateway, and CRM — but every interactive feature is currently mocked client-side so the UX can be reviewed and iterated on without infrastructure.

## Stack

- **Vite 5** — dev server and build
- **React 18** — single default-exported `App` component in `src/App.jsx`
- **Tailwind CSS 3** — `tailwind.config.js` extends a brand palette under the `ls-*` namespace
- **lucide-react** — all icons; do not introduce other icon libraries
- **Google Fonts** — Cormorant Garamond (display serif) + Manrope (sans), loaded via `<link>` in `index.html`

No router, no state library, no UI framework (shadcn etc.), no animation library. Keep it that way unless there's a clear reason to add one.

## Commands

```bash
npm install        # First time only
npm run dev        # Local dev server on :5173
npm run build      # Production build to /dist
npm run preview    # Preview the production build
npm run lint       # ESLint (configure as needed)
```

## File layout

```
src/
├── main.jsx       # ReactDOM entry — leave alone unless adding providers
├── App.jsx        # ~2200 lines, the whole app
└── index.css      # Tailwind directives + base styles
index.html         # Vite entry, fonts loaded here
tailwind.config.js # Brand color tokens
```

`App.jsx` is intentionally one large file at this stage. Constants, helpers, sections, and modals all live in it so navigation is just a single Cmd-F. Don't split it up reactively — wait until the structure stabilizes, then extract in this order: `src/data/` (constants), `src/components/` (helpers like `Logo`, `GoldBtn`), `src/sections/` (Hero, Rooms, Packages…), `src/modals/` (BookingModal, PartnerPortal, JoinModal).

## Code conventions in App.jsx

- **Color tokens** — there is a `C` object near the top with hex values. Existing code uses inline `style={{ color: C.gold }}`. Tailwind utilities like `text-ls-gold` are also available via the config. When adding new code, prefer Tailwind utilities; only fall back to inline `C.*` for dynamic values that can't be expressed as utilities (e.g. interpolated alpha).
- **Data arrays** — `ROOMS`, `PACKAGES`, `TIERS`, `AMENITIES`, `FAQS`, `SOCIALS` live near the top. Edit these for content changes; do not hard-code copy inside JSX.
- **Helper components** — `Logo`, `Crosshatch`, `GoldBtn`, `SectionLabel`, `SectionTitle`, `Field`, `Input`, `Select`, `Icon` are reusable. Use them. Do not re-style buttons inline.
- **Modals** — opened/closed via local `useState` in the root `App` component. The pattern is: `const [bookingOpen, setBookingOpen] = useState(false)` + `<BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />`. Stick to it.
- **Pricing** — all prices are in BHD (Bahraini Dinars), three-decimal precision when displayed (e.g. `BHD 42.000`). Never show a different currency without an explicit conversion.

## Domain notes

- **The hotel** — 72 suites, opened Nov 2020, located on Shabab Avenue in Juffair (Manama). Building 916, Road 4019, Block 340. Phone +973 1616 8146. Instagram `@thelodgesuites`. Tagline "We Speak Your Language".
- **Suite types** — Deluxe Studio (BHD 42), One-Bedroom Suite (BHD 58), Two-Bedroom Suite (BHD 89), Presidential Suite (BHD 175). All have kitchenettes, 55" Smart TVs, soundproofed windows.
- **Loyalty program** — "LS Privilege", three tiers: Silver / Gold / Platinum. Benefits matrix is in the `TIERS` array.
- **Check-in 14:00 / Check-out 12:00** — referenced in multiple places, keep consistent.
- **Channels** — when working on the OTA email composer, the recipient list is Booking.com, Expedia, Agoda, Hotelbeds, Almosafer. Almosafer is the dominant Saudi/GCC OTA — don't forget it.
- **Net Rate accounts** (in the Corporate tab) — sample accounts are BAPCO, GFH, Investcorp Air, Ministry of Interior. Treat these as placeholders; real account names should be confirmed with the hotel before going live.

## What's mocked vs. real

Everything is mocked. Specifically, the following need real backends before launch:

- Booking submission → PMS API
- Payments → payment gateway (locally Benefit Pay is dominant in Bahrain; Stripe + 3DS is a reasonable global default)
- Travel agent invoice persistence → DB + accounting integration
- Corporate RFP form → email + CRM
- Stop-sale manager → channel manager API
- OTA email composer → transactional email service
- Loyalty enrollment → loyalty backend
- Live availability/pricing → PMS

When asked to "make X work end-to-end", clarify which backend is being chosen before writing integration code. Don't guess.

## Imagery

The `IMG` constant at the top of `App.jsx` currently points to Unsplash URLs as placeholders. Replace with files in `public/images/` (referenced as `/images/foo.jpg`) when real photography is provided. Some original property photos exist in the parent project folder (filenames like `275748857.jpg`) — they need to be copied into `public/images/` and the `IMG` paths updated.

## Things not to do

- Don't add a router (`react-router`) — there's only one page. Modals handle the secondary surfaces.
- Don't add `localStorage` / `sessionStorage` for state. If persistence is needed, that's a backend conversation.
- Don't introduce shadcn, MUI, Chakra, or another component library — the design system is bespoke.
- Don't replace `lucide-react` with another icon set.
- Don't change the font pairing (Cormorant Garamond + Manrope) without the hotel's marketing approval — it's part of the brand identity.
- Don't make the design "lighter" or "flatter" by default — the dark/gold art-deco aesthetic is deliberate. Propose changes; don't make them silently.

## Common requests and how to handle them

- **"Add a new room type"** → edit the `ROOMS` array. The grid auto-renders.
- **"Change a price"** → edit `ROOMS` or `PACKAGES`. Don't hunt through JSX.
- **"Add a new amenity icon"** → add to `AMENITIES` array. Use a `lucide-react` icon name as the `icon` field.
- **"New OTA channel"** → add to the channel list inside `AdminTab` (search for `Booking.com` to find it). Update the email composer's recipient toggle group too.
- **"Make the rewards program 4 tiers"** → edit the `TIERS` array. The benefits matrix renders from it; add a new column object.
- **"Translate to Arabic"** → not yet scaffolded. The site is LTR English. Adding `dir="rtl"` support and an `i18n` layer is a project of its own; flag it before starting.

## When in doubt

Ask before refactoring. The single-file structure is a feature for now. The brand palette is a feature. The mocked-backend boundaries are a feature. If a request seems to push against any of those, clarify scope first.
