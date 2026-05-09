# The Lodge Suites — Hotel Website

A single-page React app for **The Lodge Suites**, a 72-suite boutique hotel apartment in Juffair, Manama, Bahrain. Includes a guest-facing booking experience and an operator-facing partner portal (Corporate / Travel Agent / Admin).

Built with **Vite + React 18 + Tailwind CSS** and `lucide-react` for iconography. Designed in a dark/gold art-deco aesthetic to match the brand.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server (http://localhost:5173)
npm run dev

# 3. Production build
npm run build
npm run preview
```

Requires **Node.js 18+**.

---

## What's in the box

### Guest-facing
- **Hero** with embedded 5-field booking widget
- **Booking modal** — 5-step flow (Dates → Suite → Extras → Confirm → Confirmation)
- **Suite types** — Deluxe Studio, One-Bedroom, Two-Bedroom, Presidential (BHD pricing)
- **Combined packages** — Spa & Stay, B&B, Bahraini Staycation, Romantic, Family, Long-Stay (with social-share funnels)
- **LS Privilege rewards** — Silver / Gold / Platinum tiers with full benefits matrix
- Amenities, gallery, FAQ, contact, footer

### Partner Portal (modal in header)
- **Corporate tab** — RFP submission, Net Rate ledger
- **Travel Agent tab** — Bookings + commission invoice generator
- **Admin tab** — Stop-Sale manager, OTA email composer (Booking.com, Expedia, Agoda, Hotelbeds, Almosafer)

---

## Project structure

```
lodge-suites/
├── index.html              # Vite entry, Google Fonts loaded here
├── package.json
├── vite.config.js
├── tailwind.config.js      # Brand color tokens (`ls-gold`, `ls-deep`, etc.)
├── postcss.config.js
├── CLAUDE.md               # Project context for Claude Code
└── src/
    ├── main.jsx            # React DOM entry
    ├── App.jsx             # The entire app (large single-file component)
    └── index.css           # Tailwind directives + base styles
```

`src/App.jsx` is intentionally a single ~2200-line file with all sections, modals, and data co-located — easier to navigate while iterating. Once the structure stabilizes, split it into `src/sections/`, `src/modals/`, and `src/data/`.

---

## Brand tokens

Available as Tailwind utilities (see `tailwind.config.js`):

| Token              | Hex       | Usage                    |
| ------------------ | --------- | ------------------------ |
| `ls-deep`          | `#15161A` | Page background          |
| `ls-charcoal`      | `#1E2024` | Section background       |
| `ls-elev`          | `#26282E` | Elevated surfaces        |
| `ls-panel`         | `#2D2F36` | Cards, inputs            |
| `ls-gold`          | `#C9A961` | Primary brand accent     |
| `ls-goldBright`    | `#DDC183` | Hover / highlight        |
| `ls-goldDeep`      | `#9A7E40` | Pressed / active         |
| `ls-cream`         | `#F5F1E8` | Light backgrounds        |
| `ls-textOnDark`    | `#E8E2D4` | Body text on dark        |
| `ls-textMuted`     | `#9B9588` | Secondary text           |

Currently `App.jsx` uses inline `style={{ color: C.gold }}` patterns via a `C` constants object. As you refactor, prefer Tailwind utilities (`text-ls-gold`, `bg-ls-charcoal`, etc.).

Fonts: `font-display` → Cormorant Garamond (serif headings), `font-sans` → Manrope (body).

---

## Replacing placeholder images

The `IMG` constant near the top of `src/App.jsx` currently holds Unsplash URLs. To use the property's real photography:

1. Drop your photos into `public/images/` (create the folder).
2. Update each `IMG.*` entry, e.g. `IMG.heroExterior = "/images/exterior-night.jpg"`.

Vite serves anything in `public/` from the site root.

---

## What still needs real backend wiring

The following features are UI-complete but **front-end only**. Document this clearly when handing off to the development team:

| Feature                     | What it currently does                           | What it needs                                |
| --------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Booking confirmation        | Generates a fake confirmation number client-side | PMS integration (e.g. Cloudbeds, Opera, Mews) |
| Payment                     | No payment step                                  | Payment gateway (Benefit Pay, Stripe, etc.)  |
| Travel Agent invoice        | Renders printable HTML invoice                   | Persist to DB, email PDF, accounting export  |
| Corporate RFP submission    | Logs to console                                  | Email to sales + CRM record (HubSpot/Zoho)   |
| Stop-sale manager           | Local state only                                 | Channel manager API (SiteMinder, Cloudbeds)  |
| OTA email composer          | Opens `mailto:` with prefilled body              | Transactional email service (SendGrid, SES)  |
| LS Privilege loyalty        | UI only                                          | Loyalty backend or PMS loyalty module        |
| Live availability / pricing | Static                                           | PMS rate/availability API                    |

---

## Live testing — Supabase setup

The app ships with mocked client-side state so it works without a backend. To enable persistence (real bookings, member accounts, payments, etc.) wire up Supabase.

### One-time setup

```bash
# 1. Install (already in package.json)
npm install

# 2. Copy the env template
cp .env.example .env.local

# 3. Open .env.local and fill in:
#    VITE_SUPABASE_URL=<your project URL>
#    VITE_SUPABASE_ANON_KEY=<your anon/public key>
#    Both are visible at Supabase Studio → Project Settings → API.

# 4. Apply the schema. Either:
#    a) Open Supabase Studio → SQL Editor → New query → paste supabase/schema.sql → Run
#    b) Or via CLI: supabase db push --file supabase/schema.sql

# 5. Restart the dev server — Vite reads env vars only on boot
npm run dev
```

Confirm the connection by opening the browser console — you should *not* see the `[Supabase] not configured` warning.

### Files

```
.env.example              # Template — committed to git
.env.local                # Your real keys — gitignored, never commit
src/lib/supabase.js       # Singleton client + withSupabase() guard
supabase/
  └── schema.sql          # Phase 1 schema (rooms, packages, extras,
                          #   members, bookings, payments + RLS)
```

### Phased migration plan

The codebase has 34 client-side state slices in `src/data/store.jsx`. Migrating them all at once is risky; we move them table-by-table.

| Phase | Scope | What ships |
|---|---|---|
| **1 — Booking flow** *(this schema)* | rooms · packages · extras · members · bookings · payments | Live direct-book testing |
| **2 — Operations** | calendar overrides · maintenance jobs · vendors · channels · stop-sale · audit log | Front-office daily ops |
| **3 — Sales pipeline** | RFPs · prospects · activities · corporate accounts · agent accounts | B2B workflows |
| **4 — Comms & content** | email templates · SMTP config · site CMS · gallery · scheduled reports · notifications | Marketing / outbound |
| **5 — Auth hardening** | replace permissive RLS with role-based policies; staff table; impersonation audit | Production-ready security |

Each phase has its own `supabase/migrations/NNN_*.sql` file (to be created when the time comes). Don't run them out of order.

### RLS notice

The starter Row-Level Security policies in `schema.sql` are intentionally permissive (any authenticated user is treated as staff). **Tighten them before exposing the project to the public internet.** Specifically:

- Replace `auth.role() = 'authenticated'` with a real staff/role check
- The `bookings_anon_insert` policy lets any client create a booking; rate-limit it via Supabase Edge Functions or move booking creation behind an authenticated guest-portal flow
- The service-role key (in Supabase dashboard, never put it in `.env.local`) bypasses RLS entirely — only use it in server-side scripts

## License

Proprietary — © The Lodge Suites, Bahrain.
