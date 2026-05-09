---
marp: true
theme: default
paginate: true
size: 16:9
---

# The Lodge Suites
## System Overview — Training & Business Development

*Juffair · Manama · Bahrain · 72 Suites · "We Speak Your Language"*

Internal deck — not for external distribution without approval.

---

## Agenda

1. **System at a glance** — what we built, what it does, where it lives
2. **Guest experience** — homepage, booking engine, loyalty
3. **Partner Portal** — Corporate · Travel Agent · Admin
4. **Operational workflows** — day-in-the-life walkthroughs
5. **Business development** — value props by audience
6. **Roadmap & integrations** — what's mocked vs. real
7. **Appendix** — cheat sheets · glossary · FAQ

---

# Part 1 — System at a Glance

---

## What is The Lodge Suites?

A **luxury serviced-apartment property** in Juffair, Manama:

- **72 suites** across four types — Studio · One-Bed · Two-Bed · Three-Bed
- Opened **November 2020** · Boutique five-star · Long-stay specialist
- Address: Building 916, Road 4019, Block 340, Shabab Avenue, Juffair
- Phone: **+973 1616 8146** · Instagram: **@thelodgesuites**
- Tagline: **"We Speak Your Language"**

The system on display is the **digital front-of-house**: a public website, a guest portal, and a complete operator portal for corporate sales, travel-agent management, and back-office operations.

---

## Two surfaces, one codebase

| Surface | Audience | Purpose |
|---|---|---|
| **Public site** | Walk-up guests | Discover the property, see suites, check availability, book direct |
| **Guest Portal** | LS Privilege members | Manage upcoming stays, view points, redeem rewards, tier benefits |
| **Corporate Tab** | Corporate bookers | Submit RFPs, view net-rate contracts, see folio history |
| **Travel Agent Tab** | Agency partners | Manage bookings, raise invoices, track commissions |
| **Admin Tab** | Hotel staff | Run operations: rates, availability, comms, finance, sales pipeline |

A **single React app** serves all five — modals open the right surface based on who's signed in.

---

## Brand identity

- **Aesthetic** — dark / gold art-deco. Cream paper, deep ink, signature gold (`#C9A961`).
- **Type** — Cormorant Garamond (display serif) + Manrope (sans). Always paired.
- **Voice** — quiet, confident, hospitality-first. No exclamation marks; no salesy adjectives.
- **Currency** — **BHD**, three-decimal precision (e.g. `BHD 42.000`). Never displayed in another currency without an explicit conversion.
- **Languages** — English (LTR) and Arabic (RTL), toggle in the top-right.

Brand consistency is enforced in code — there is one design system file and one brand-color object. Adding a new section to the site automatically inherits these.

---

## Tech stack (one-line summary)

- **Vite 5 + React 18 + Tailwind 3** — single-page app
- **Lucide-react** — every icon in the system
- **No router, no state library, no UI framework** — intentional simplicity
- **All state is client-side and in-memory** — every interactive feature is mocked so the UX can be validated before backend integration
- Deploys as a static bundle (≈ 460 kB gzipped) to any CDN / Vercel / Netlify

The system is built to be **wired to real backends one slot at a time** — we'll come back to which slots are mocked vs. real.

---

# Part 2 — Guest Experience

*For training: front office, reservations, marketing*

---

## Homepage anatomy

A long-form scroll — eight sections, each tells one story:

1. **Hero** — booking widget + Juffair imagery + 5-star rating
2. **Intro strip** — "We Speak Your Language" brand statement
3. **Suites** — four cards, each linked to "Book this suite"
4. **Offers** — active packages with one-click apply
5. **LS Privilege** — three-tier loyalty grid + Join CTA
6. **Amenities** — facility icons
7. **Corporate** — RFP entry point for B2B traffic
8. **Gallery + FAQ + Contact** — closer panels

Footer holds: Press, Gift Vouchers, Juffair Guide, Career, RFP, Partner Portal sign-in.

---

## Suite catalog (live pricing)

| Suite | Size | Sleeps | Rack rate | Extra bed |
|---|---|---|---|---|
| **Lodge Studio** | 43 m² | 2 (2A or 1A+1C) | **BHD 38** / night | — |
| **One-Bedroom Suite** | 60 m² | 3 (2A+1C, 1A+2C…) | **BHD 44** / night | +1 adult, BHD 15 |
| **Two-Bedroom Suite** | 140 m² | 5 (4A + 3C max) | **BHD 78** / night | +1 adult, BHD 18 |
| **Three-Bedroom Suite** | 150 m² | 6 (4A + 4C max) | **BHD 96** / night | +1 adult, BHD 18 |

All include kitchenette, 55" Smart TV, soundproofed windows. Rates **exclude 10% taxes** (5% VAT + 5% service).

Capacity model is enforced in the booking engine — guests **cannot** over-book a Studio with 3 people; a smart hint suggests the right suite type instead.

---

## The booking engine — four steps

**Step 1 — Dates** · check-in / check-out / adults / children. Calendar enforces ≥ 1 night, no past dates.

**Step 2 — Suite** · multi-room cart. Per-room +/- stepper. Auto-applied capacity rules. Eligible-offer chips appear if the dates qualify for an active package. Per-room offer pricing shown side-by-side with rack rate.

**Step 3 — Extras** · Airport Transfer, Welcome Hamper, Late Check-out, Spa Voucher, Crib, etc. Pricing scales with party size or nights as configured.

**Step 4 — Confirm** · Name (required) · Country · Email · Phone (with country code). Required-field validation with red asterisks. Choose **Pay now (5% off, non-refundable)** or **Pay on arrival** (with or without a card on file).

**Step 5** is the success page — booking reference, summary, "Add to calendar," next steps.

---

## Pay-now vs. Pay-on-arrival

Two payment paths, each with clear consequences for the guest and the front office.

| | **Pay now** | **Pay on arrival (card on file)** | **Pay on arrival (no card)** |
|---|---|---|---|
| Discount | **5% off** the room | — | — |
| Refundable? | **No** — non-refundable | Yes — cancel up to 24h before arrival | Yes |
| Card captured? | Yes — charged at booking | Yes — held only | No |
| Hotel guarantee | Confirmed | Confirmed | **Held until 15:00 on arrival day** — released to walk-ins after 3 PM |
| Folio status | `paid` | `deposit` | `pending` |

Front office tip: if a non-guaranteed booking hasn't checked in by 3 PM, the channel manager auto-releases the room.

---

## LS Privilege — loyalty program

Three tiers. Discount applied directly at booking; points accrue per BHD spent.

| Tier | Member rate | Points / BHD | Welcome | Upgrade | Late check-out | Other |
|---|---|---|---|---|---|---|
| **Silver** (1–9 nights) | **5% off** | 1 pt / BHD | Bottle of water | When available | — | Free WiFi |
| **Gold** (10–24 nights) | **10% off** | 1.5 pts / BHD | In-suite amenity | When available | To 14:00 | + free night after 20 nights stayed |
| **Platinum** (25+ nights / yr) | **15% off** | 2 pts / BHD | Premium amenity + flowers | **Guaranteed** (one tier up) | **Guaranteed** to 16:00 | + annual free night + suite upgrade |

Auto-detection: when a guest enters their email at step 4, the system recognises existing members and applies their tier rate before they confirm.

---

## Offers (packages)

Configurable from the Admin → Offers section. Examples:

- **Spa & Stay** — From BHD 79 / night · room + 1× spa voucher / day
- **Bed & Breakfast** — From BHD 52 / night · room + breakfast for two
- **Romantic Escape** — From BHD 99 first night · room + chocolates + late check-out
- **Long Stay (14+ nights)** — Auto-discount tier
- **Eid / F1 / National Day** event-window supplements

Each offer carries:
- **Eligible suites** (whitelist)
- **Min/max guests**, min/max nights, valid date windows
- **Pricing mode** — per-night · first-night flat · whole-stay flat
- **Auto-applied vs. promo-code-only**

---

## Multilingual support

- **English** (default, LTR)
- **Arabic** (RTL — full right-to-left flip, including iconography and number formatting)

Every string lives in `src/i18n/translations.js`. To add a third language:
1. Add a new key set to the translations file
2. Add the language to the picker in the Header
3. Test RTL/LTR direction (Arabic is the only RTL today)

Every section, modal, and email template is fully translated.

---

# Part 3 — Partner Portal

*For training: corporate sales, travel agent desk, GM, owner*

---

## Portal layout

The Partner Portal opens as a **full-screen overlay** from the Header. Three top-level tabs:

| Tab | Who signs in here | What they do |
|---|---|---|
| **Corporate** | A booker at BAPCO, GFH, etc. | Submit RFPs · view their net-rate contract · see folio history |
| **Travel Agent** | An agency partner | Raise invoices · check commission · upload tour vouchers |
| **Admin** | Hotel staff (Owner / GM / FOM / etc.) | Run the entire operation |

Each surface has its own colour palette and navigation, but the underlying React app and data store are shared.

---

## Corporate Tab — overview

For B2B bookers at named Net Rate accounts.

**Sample seeded accounts** (placeholders — replace before launch):

- **BAPCO** — Bahrain Petroleum Company
- **GFH** — Investment bank
- **Investcorp Air** — Crew layovers (rooms blocked Wed/Sat)
- **Ministry of Interior** — Government

What a corporate user can do:
- View their **negotiated rates** by suite type
- See their **active rate sheet** and any seasonal supplements
- Submit a new **RFP** for a future engagement
- Browse their **booking history** and folio status

---

## Travel Agent Tab — overview

For OTA / wholesaler / FIT agent partners.

What an agent user can do:
- View their **commission bracket** (typically 10–15%, depending on production)
- Raise an **invoice** for a stay, attach the voucher, and submit
- See **pending vs. paid** invoice status
- Pull a **commission statement** for a date range
- Upload a **rate-confirmation PDF** for the booker on the other end

The agent surface is intentionally clean — no operations clutter, just bookings, invoices, statements.

---

## Admin Tab — sidebar map

The Admin sidebar groups 18 sections by function:

**Operations** — Dashboard · Calendar · Bookings · Stop-Sale & OTA · Maintenance
**Inventory** — Rooms & Rates · Offers & Packages · Extras
**Sales** — Corporate Accounts · Travel Agents · RFPs in flight
**Guest** — LS Privilege (members CRM)
**Finance** — Invoices · Payments · Tax Setup
**Comms** — Email Templates · Email SMTP · Site Content (CMS)
**Admin** — Staff & Access · Audit Log · Hotel Info

Sections you can see depend on your role permissions.

---

## Admin → Dashboard

Front-page KPIs at-a-glance:

- **Today** — arrivals, departures, in-house, occupancy %
- **This week** — RevPAR, ADR, total revenue (BHD)
- **Pipeline** — RFPs in negotiation, prospects by stage
- **Operational** — open maintenance jobs, stop-sale gaps, channel-sync errors
- **Notifications** — recent booking activity, member sign-ups, password resets

Designed so a GM walking in at 9 AM has the entire previous-day picture on one screen.

---

## Admin → Calendar

A 30-day **occupancy heat map** by suite type:

- Each cell = one date × one suite type
- Cell colour shows availability: green (open), amber (limited), red (sold out), grey (stop-sale)
- Click a cell → override the price, close out, or block for maintenance
- Event templates (Eid, F1, Saudi National Day) auto-apply seasonal supplements
- Pull-forward / push-back by clicking the date headers

This is the **single source of truth for stop-sale, rate overrides, and event pricing**.

---

## Admin → Bookings

Full reservations register:

- Filter by **status** (confirmed · paid · deposit · pending · cancelled · no-show)
- Filter by **arrival date**, channel, suite type, member tier
- Click a row → drawer with full folio, guest details, payment history, comms log
- Quick actions — **modify dates** · **add extras** · **cancel** · **upgrade** · **email confirmation**
- Export filtered set to CSV

This is where the front desk lives.

---

## Admin → Stop-Sale & OTA channels

Push availability and rates to OTA partners with one click.

**Configured channels** (toggle to enable per channel):
- **Booking.com**
- **Expedia**
- **Agoda**
- **Hotelbeds**
- **Almosafer** *(dominant Saudi/GCC OTA — never skip it)*

For each channel:
- Connection status (last sync timestamp, success/error)
- Rate parity check (vs. direct)
- Stop-sale push / lift
- 30-day allotment visibility

Composer at the bottom: send a **batch update email** to all channels at once when a major change is needed.

---

## Admin → Rooms & Rates

Inline editor for the suite catalogue:

- Edit rack rate, occupancy, max adults / max children, square metres
- Toggle extra-bed availability and configure fee + capacity adders
- Reorder photography (drag & drop)
- Mark a suite as "popular" for the homepage badge
- Soft-delete a suite type (hidden from public, kept for historical bookings)

Changes propagate **immediately** to the booking engine. No publish step.

---

## Admin → Offers & Packages

Build promotions without touching code:

- **Title, hero image, description**
- **Eligible suites** — checkbox list
- **Date validity windows** — multiple ranges allowed
- **Pricing mode** — per-night flat · first-night flat · whole-stay flat
- **Min nights / max nights / min guests / max guests**
- **Auto-apply** when eligible, or **promo-code only**
- **Inclusions** — free text list (e.g. "1 spa voucher · daily breakfast")

Activate / deactivate with one toggle. The homepage **Offers** section reads from this catalogue live.

---

## Admin → Extras

Booking-modal add-ons. Each entry:

- Title (translated)
- Pricing rule — per booking · per night · per guest · per night per guest
- Active toggle
- Default selected (yes/no)
- Eligible suites (whitelist)

Examples that ship today: Airport Transfer · Welcome Hamper · Crib · Late Check-out · Spa Voucher · Daily Housekeeping Top-up.

---

## Admin → LS Privilege (members CRM)

Full-fledged member management:

- **Search** members by name, email, phone, member code
- View **points balance**, lifetime nights, tier history
- **Award / redeem points** manually with a reason note
- **Move tier** with audit trail
- **Suspend / reinstate** member
- **Verify ID** (CPR / passport upload)
- **Email member** directly (uses templates)
- See full **booking history** in a side drawer

Owner has a "Log in as member" feature that opens the **Guest Portal as that member** — invaluable for support escalations.

---

## Admin → Email Templates

Every transactional email lives here:

- Booking confirmation · cancellation · modification
- Pre-arrival check-in instructions
- Loyalty enrolment · tier upgrade · points statement
- Corporate RFP intake · proposal sent · contract executed
- Travel agent: rate sheet · invoice issued · commission paid
- OTA channel: rate update · stop-sale notice · allotment refresh

Each template:
- HTML editor with `{{merge_tags}}` (e.g. `{{guestName}}`, `{{checkIn}}`, `{{rateStudio}}`)
- Live preview pane
- Test-send to your own inbox
- Translation pair (English + Arabic)

---

## Admin → Email SMTP *(new)*

Configure the outbound email transport for all transactional mail.

**Status banner** at the top — green when connection verified, amber if untested, red on failure.

**Four configuration cards:**
1. **Server** — host, port, encryption (TLS/SSL/none)
2. **Authentication** — username, password (eye-toggle to reveal)
3. **Sender identity** — From name, From email, Reply-to
4. **Test & verify** — sends a test email and reports success/failure

**Quick-setup chip strip:** one-click presets for **Gmail · Outlook · Yahoo · SendGrid · Mailgun · Amazon SES · Zoho Mail · Postmark**. Each preset auto-fills the right host/port/encryption.

---

## Admin → Maintenance

Defect tracker for the property:

- Log a job — title, description, suite affected, severity, photo
- Status pipeline: **Reported → Triaged → Dispatched → In Progress → Done → Verified**
- Assign to a **vendor** from the directory (HVAC · electrical · plumbing · IT · housekeeping)
- Capture **parts cost + labor cost** on completion
- Maintain a vendor scorecard (response time, repeat-issue rate)
- Block the suite in inventory until verified — auto-stops sale

Front office submits jobs from the Bookings drawer; housekeeping closes them.

---

## Admin → Invoices, Payments, Tax

**Invoices** — folios for guests, partner invoices for corporate / agent accounts. Issue, void, credit-note, email.

**Payments** — receipts, refunds, settlements. Card-vault entries are 30-day retained, role-gated (Owner / GM / FOM / Accounts only).

**Tax Setup** — Bahrain VAT (5%) + service charge (5%). Configurable per-booking or per-suite-type if rules ever diverge. Pattern-based system means a new tax can be added without touching pricing logic.

---

## Admin → RFPs in flight

Sales pipeline — every RFP with status, value, and next action.

Pipeline stages:
**Identified → Qualified → Contacted → Discovery → Proposal → Negotiation → Won / Lost**

For each prospect:
- Aging timer (e.g. *5 days at Proposal*)
- Suggested **next action** (system-recommended)
- Notes, attachments, scheduled follow-ups
- Convert to **active corporate / agent account** on Won

Visualised as a Kanban board, sortable by aging or value.

---

## Admin → Staff & Access

Role-based access control. Out-of-the-box roles:

| Role | Sections |
|---|---|
| **Owner** | All 18 sections |
| **General Manager** | All except Staff & Access |
| **Front Office Manager** | Ops + Inventory + Members + Comms |
| **Reservations** | Dashboard · Calendar · Bookings · Members |
| **Housekeeping** | Dashboard · Calendar · Rooms · Maintenance |
| **Sales / B2B** | Dashboard · Corporate · Agents · RFPs · Comms |
| **Accounts** | Dashboard · Invoices · Payments · Tax · Corporate · Agents |
| **Marketing** | Dashboard · Offers · Comms · Members |
| **Read-only** | Dashboard only (auditors, family) |

Every role can be cloned and tweaked. Permissions are scoped per section — finer-grained per-record rules sit on top.

---

## Admin → Audit Log

Every privileged action is recorded:

- Sign-in / sign-out with IP + device
- Permission changes
- Impersonation start / end
- Booking created / modified / cancelled
- Prospect converted
- Vendor dispatched
- Email template edited
- SMTP config updated
- Tax pattern changed

Filterable by actor, kind, date range. Read-only — cannot be edited or deleted by anyone except Owner-class accounts.

---

# Part 4 — Operational Workflows

*Day-in-the-life walkthroughs for training*

---

## Workflow A — Direct booking

**Channel:** the public website.

1. Guest lands on homepage from a Google search or Instagram link
2. Sets dates + party in the Hero booking widget · clicks **FIND SUITE**
3. Lands on Step 2 (Suite) — sees per-room offer chips and a smart capacity hint
4. Picks a One-Bedroom Suite + 1 extra bed → clicks **Continue**
5. Selects Airport Transfer extra
6. Enters contact details — system auto-detects Silver-tier match → 5% applied
7. Chooses **Pay now (5% off non-refundable)** → Step 5 confirmation
8. Receives transactional email; reservation appears in Admin → Bookings within 1 second

**KPI:** time from landing to confirmation < 90 seconds for a standard stay.

---

## Workflow B — Corporate RFP

**Channel:** the Corporate tab in the Partner Portal.

1. Booker at BAPCO signs in → sees their net-rate contract
2. Submits a new RFP for a 3-month project (12 engineers, 1-Bed suites, weekly stays)
3. Admin receives a notification → RFP appears in **RFPs in flight** at *Identified*
4. Sales user qualifies + drafts a proposal → moves to *Proposal*
5. After agreement, marks **Won** → system creates an active corporate contract
6. Future bookings against this contract auto-apply the negotiated rate

**KPI:** RFP response time < 24h. Proposal-to-Won conversion target: 35%.

---

## Workflow C — Stop-sale push to OTAs

**Channel:** Admin → Stop-Sale & OTA.

1. F1 weekend hits the calendar — demand spikes 90 days out
2. GM opens the Calendar, selects 10 April – 12 April, raises rate by 20%
3. Opens **Stop-Sale & OTA** → ticks Booking.com, Expedia, Agoda, Hotelbeds, Almosafer
4. Hits **Push** → system queues the rate update, syncs over the next 60s
5. Each channel reports back with success/error
6. Audit log records the push: actor, channel, payload size, timestamps

**KPI:** rate parity drift < 1% across all channels at any time.

---

## Workflow D — Maintenance ticket

**Channel:** Admin → Maintenance.

1. Front desk takes a call — Suite 502 reports no hot water
2. Reservations user opens the Bookings drawer for that folio → **Log maintenance**
3. Job auto-pre-fills with suite + guest details → severity *High* → photo upload
4. System dispatches to plumbing vendor + suspends the suite from sale
5. Vendor arrives, replaces a heater unit, marks job *Done* with parts cost
6. Housekeeping verifies the suite the next morning → marks *Verified*
7. Suite released back to inventory; full audit trail kept on the folio

**KPI:** *Reported → Verified* in < 6 hours for "no hot water" class issues.

---

## Workflow E — Email composition (OTA batch)

**Channel:** Admin → Email Templates → OTA composer.

1. Allotments are dropping for next week — GM wants a quick refresh push
2. Opens the OTA composer → recipient toggle group: Booking.com, Expedia, Agoda, Hotelbeds, **Almosafer**
3. Loads the *"Allotment refresh"* template
4. Merge tags auto-fill from current inventory: rates, allotments, valid dates
5. Preview pane shows the final email side-by-side per recipient
6. **Test send** to GM's own inbox → review → **Send**
7. Audit log records each transmission

**KPI:** ≤ 3 minutes from "I need to refresh allotments" to "email sent".

---

# Part 5 — Business Development

*Sales narratives by audience*

---

## Why a serviced-apartment website needs all this

Most boutique hotels run on a generic PMS dashboard plus three or four point-tools (a separate channel manager, separate CRM, separate emailer). The result:

- Data lives in five systems → manual reconciliation
- Every staff role has a learning curve per tool
- Ownership has no single view of the property
- Adding a new corporate account or OTA touches three tools

**The Lodge Suites system collapses this into one operator surface** with role-gated access. One sign-in, one source of truth, one audit trail.

This is what a **"direct-first"** strategy looks like in software.

---

## Audience: corporate buyer

**Pain points we solve:**
- "I don't want to email my booker every time someone needs a room."
- "I need to see folio history to reconcile against my AP."
- "I want a contract, not a rate quote per booking."

**What the system gives them:**
- Self-serve corporate portal with their negotiated rate
- Bookings hit their account in real time — no email loop
- Statement export by month, by employee, by cost centre
- Single point of contact (their account manager) visible from the portal

**Sales narrative:** *"Your bookers manage Lodge stays the way they manage their own calendar — no friction, no waiting."*

---

## Audience: travel agency / FIT desk

**Pain points we solve:**
- "Hotels make me email rate sheets — they're stale by the time I quote."
- "Commission tracking is a black box."
- "Voucher uploads via WhatsApp are a mess."

**What the system gives them:**
- Live rate sheet inside the Travel Agent tab
- Commission visible per booking the moment it confirms
- Voucher upload = drag-and-drop into the booking
- Statement export per month

**Sales narrative:** *"You see your production, your commission, and your invoices in real time. We pay against the system, not against email threads."*

---

## Audience: OTA channel manager

**Pain points we solve:**
- "Hotels don't push updates in time — we lose conversions to stale inventory."
- "Rate parity drifts — we get complaints from guests."
- "Allotment communication is over WhatsApp."

**What the system gives them:**
- One-click push from Stop-Sale to all five channels
- Rate parity check baked into the dashboard
- Audit log for every push (forensic when a complaint comes in)
- Almosafer treated as a first-class peer of Booking.com (Saudi/GCC weight)

**Sales narrative:** *"Our channel manager workflow is one screen, five clicks, full audit trail. Tell us when you need updates and we'll push them in real time."*

---

## Audience: hotel ownership / asset manager

**Pain points we solve:**
- "I want a single screen for the property, not five logins."
- "I need to see RFP pipeline next to actual revenue."
- "I want to log in as a guest to see what they see."

**What the system gives them:**
- Dashboard with operational + sales + finance KPIs in one place
- Pipeline value alongside booked revenue
- "Log in as member" / "Log in as staff" impersonation with audit trail
- Read-only role for family-office stakeholders or auditors

**Sales narrative:** *"You don't need to ask the GM what's happening — the system tells you. Trust, but verify."*

---

## Differentiators vs. competitors

Versus typical Bahrain serviced-apartment competitors (Fraser Suites, Ascott, Movenpick Living, etc.):

| Capability | Lodge Suites | Typical competitor |
|---|---|---|
| Direct-booking discount logic | **Built-in (5% pay-now + 5/10/15% loyalty stack)** | Usually flat 5% or none |
| Multi-room cart in one flow | **Yes** | Sequential workflow |
| Auto-detect existing member at email | **Yes** | Manual sign-in required |
| OTA composer with batch send | **Yes** | Usually external tool |
| Maintenance ticket → auto-stopsale | **Yes** | Manual coordination |
| Operator + corporate + agent in one app | **Yes** | Three separate logins |
| Public-facing Arabic RTL | **Native** | Often poor or partial |

---

## Pricing levers (sales toolkit)

Five levers a sales lead can pull, listed weakest to strongest:

1. **Best Rate Guarantee** banner on the public site (always visible)
2. **Pay-now 5% off non-refundable** — direct-booking incentive
3. **LS Privilege** — 5/10/15% by tier, stacks on Pay-now
4. **Active offers** (Spa & Stay, B&B, Romantic Escape, Long-Stay)
5. **Corporate / Agent net rates** — bespoke contract pricing

The system **enforces stacking rules** — e.g. Platinum 15% + Pay-now 5% can stack, but a corporate net rate can't be combined with member discount (the operator picks the better of the two on confirmation).

---

## Pipeline & reporting

The Admin → RFPs section gives Sales their forecast in one screen:

- Total pipeline value (BHD) by stage
- Aging cohorts (5 days at Proposal · 14 days at Negotiation)
- Win-rate by source (referral, direct, agent intro)
- Forecast vs. actual revenue, monthly
- Activity log: who did what, when

Same data feeds the Owner Dashboard — so ownership sees pipeline alongside actual.

---

# Part 6 — Roadmap & What's Mocked

---

## Honest disclosure: what's mocked

Today, every interactive feature is **mocked client-side** so the UX can be reviewed before infrastructure is committed. Specifically:

| Feature | Mocked → wired to |
|---|---|
| Booking submission | → **PMS API** (Cloudbeds / Mews / Opera) |
| Payments | → **Payment gateway** (Benefit Pay locally · Stripe + 3DS globally) |
| Travel agent invoice persistence | → **Accounting integration** (Xero / Zoho Books) |
| Corporate RFP form | → **CRM** (HubSpot / native) + email |
| Stop-sale manager | → **Channel manager API** (SiteMinder / RateGain) |
| OTA email composer | → **Transactional email** (SendGrid / Postmark / Amazon SES) |
| Loyalty enrolment | → **Loyalty backend** (custom or Salesforce Loyalty) |
| Live availability / pricing | → **PMS API** |

The brand-color object, design tokens, and component library are **production-ready**.

---

## Roadmap

**Near-term (next 90 days)**
- PMS integration (booking + availability + rates)
- Payment gateway (Benefit Pay + Stripe)
- Transactional email service (SendGrid recommended)

**Medium-term (90–180 days)**
- Channel manager wiring
- Real loyalty backend with points expiry
- Native mobile-app shell (PWA → optional native)

**Long-term (180+ days)**
- Full i18n expansion (add at least 1 European + 1 Asian language)
- AI concierge (in-suite voice assistant)
- Smart dynamic pricing (yield management based on occupancy + lead time)

---

# Part 7 — Appendix

---

## Cheat sheet: front office daily tasks

**Morning (07:30)**
- Open Admin → Dashboard → review yesterday's check-outs and today's arrivals
- Check Maintenance — any open jobs that affect today's check-ins?
- Review the Stop-sale push log — any failed channel sync overnight?

**During the day**
- Bookings register sorted by arrival time
- Process modifications and cancellations through the booking drawer
- Log every guest issue as a maintenance job (even if minor)

**Afternoon (15:00)**
- Walk-in release — non-guaranteed bookings that haven't checked in
- Review tomorrow's arrivals — any VIPs flagged in member CRM?

**End of day**
- Reconcile payments → mark settlements
- Close the day on the dashboard

---

## Cheat sheet: sales daily tasks

**Morning**
- Admin → RFPs in flight → sort by aging
- Reach out to anything > 7 days at Proposal stage
- Review yesterday's incoming corporate inquiries

**During the day**
- Move prospects through the pipeline as conversations happen
- Log every call / email as an activity (with notes)

**End of day**
- Update forecast (any new Won / Lost?)
- Schedule tomorrow's follow-ups

---

## Glossary

- **PMS** — Property Management System (the system of record for bookings)
- **OTA** — Online Travel Agency (Booking.com, Expedia, Agoda, etc.)
- **RFP** — Request for Proposal (a corporate buyer's formal rate inquiry)
- **FIT** — Fully Independent Traveler (vs. group / package)
- **ADR** — Average Daily Rate
- **RevPAR** — Revenue per Available Room
- **Stop-sale** — Closing inventory to a specific channel or date
- **Allotment** — Pre-allocated rooms held for a partner (negotiated)
- **Net rate** — Wholesale rate (without commission baked in)
- **Folio** — A guest's full bill at check-out
- **Card on file** — Captured card held against a booking; never auto-charged

---

## Frequently asked questions

**Q: Can a guest book without an account?**
Yes. Step 4 captures the minimum required (name, country, email, phone). LS Privilege enrolment is optional.

**Q: What happens if Almosafer is missing from the OTA composer?**
Re-add it via Admin → Stop-Sale → Channels → "Add channel". Almosafer is **mandatory** for the GCC market — never ship without it.

**Q: How do I add an Arabic-only offer?**
Offer copy is bilingual by default — fill in the English fields, then the Arabic fields. The public site shows the right language based on the visitor's selection.

**Q: Can the front desk see saved card numbers?**
Only the last four digits, only within 30 days of capture, and only roles **Owner / GM / FOM / Accounts** have permission. Audit log records every access.

**Q: How do I add a new staff role?**
Admin → Staff & Access → "New role" → clone the closest existing role → tweak permissions → save. New users can be assigned to it immediately.

---

## Implementation contacts

- **Product owner** — *to fill in*
- **Technical lead** — *to fill in*
- **Hotel GM** — *to fill in*
- **Marketing lead** — *to fill in*
- **Repository** — *to fill in*

This deck is an internal document. Confirm before sharing externally — particularly the *What's mocked* slide (Part 6).

---

## Thank you

Questions? Open a ticket against the project repository or reach the technical lead directly.

*The Lodge Suites · Juffair · We Speak Your Language*
