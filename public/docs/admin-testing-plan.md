# The Lodge Suites — Admin Testing & Training Plan

**Purpose** — A structured, hands-on walkthrough that takes a new admin user from "first login" through every operational surface of the system. Use it for onboarding, pre-launch UAT, and ongoing change-validation. Each phase ends with a feedback capture point so we can prioritise the next round of upgrades.

**Time commitment** — Approximately **6–8 hours total**, ideally split across **2–3 sittings**. Phase 1–3 can be tackled in one sitting (~2.5h); Phase 4–6 in another; Phase 7–10 in a third.

**Tester profile** — Anyone with `owner`, `gm`, or `fom` role permissions. Some sections (Staff & Access, Property Info, Currency master) are owner-only.

**How to use this plan**
1. Tick each checkbox as you complete the test.
2. Use the feedback prompt at the end of each phase to capture friction, missing features, or bugs.
3. At the end, fill the **Overall Feedback Summary** and submit.

---

## PHASE 0 — Pre-flight (30 minutes)

Before testing anything, get the environment ready.

### 0.1 Login & First Look
- [ ] Receive admin credentials from owner.
- [ ] Open the site, click the **Owner / Admin** entry on the partner portal.
- [ ] Sign in. Confirm you land on the **Dashboard**.
- [ ] Take a screenshot of the dashboard "as it loads" for baseline comparison later.

### 0.2 Familiarisation
- [ ] Click each top-level admin tab once: Dashboard, Bookings, Stop-Sale & OTA, Calendar, Rooms & Rates, Offers, Extras, Loyalty, Corporate, Agents, Invoices, Payments, Reports, Maintenance, Staff & Access, Property Info, Tax Setup, Email Templates, Site Content, Notifications.
- [ ] Note any tab that errors, looks blank, or takes more than 2 seconds to render.

### 0.3 Environment Sanity
- [ ] Verify the **footer copyright year** is current (Property Info → Operations → Copyright year).
- [ ] Verify **hotel name and address** match the live property in the footer.
- [ ] Verify the **currency code** in any monetary value matches the property setting (Property Info → Currency & decimals).

**🗒️ Phase 0 feedback prompt** — *Did anything fail to load or look obviously wrong? Any obvious branding / typo issues on first sight?*

---

## PHASE 1 — Property & Identity Setup (45 minutes)

The single source of truth for the property's legal identity, contact details, banking, and operational settings. Every printed document flows from here.

### 1.1 Identity & Address (Property Info)
- [ ] Open **Property Info**. Confirm the trading name, legal entity, tagline, address, area, country.
- [ ] Update the trading name to a test value (e.g. "The Lodge Suites — TEST"). Save.
- [ ] Reload the site. Confirm the homepage hero, footer, and partner portal headers all reflect the new name.
- [ ] Revert to the real name.

### 1.2 Legal Registration
- [ ] Enter a real CR number and VAT number.
- [ ] Generate a sample invoice from Invoices → New Invoice. Verify the CR / VAT line appears in the footer.

### 1.3 Banking & Contact
- [ ] Enter real IBAN, bank name, all email addresses (front office, reservations, accounts, FOM, sales, press), phone, WhatsApp, website.
- [ ] Generate a sample contract from Corporate → New Contract → Preview. Verify the bank block is correct in the footer.

### 1.4 Operations
- [ ] Verify check-in time `14:00`, check-out time `12:00`.
- [ ] Save copyright year.

### 1.5 Currency & Decimals
- [ ] Change currency code from `BHD` to `USD`, decimals to `2`. Save.
- [ ] Open any room rate card, package, or booking summary. Confirm the label is now `USD` with 2 decimals.
- [ ] **Revert to `BHD` / 3 decimals**.

### 1.6 Weekend Days
- [ ] Confirm Friday + Saturday are selected (Bahrain default).
- [ ] Open Rooms & Rates → pick any room → check `weekend rate` field.
- [ ] Create a test booking spanning a Thursday → Saturday (in the partner portal). Verify the rail shows a weekday/weekend split in the breakdown.

### 1.7 Apple Wallet Pass IDs (optional, owner-only)
- [ ] Confirm Pass Type ID + Apple Team ID are populated.
- [ ] (Production wiring is downstream — just confirm the fields persist on Save.)

### 1.8 Press & Spokesperson
- [ ] Confirm spokesperson name + title + press email are set.
- [ ] Open the public website **Press** page and verify they appear correctly.

**🗒️ Phase 1 feedback prompt** — *Were any property fields missing that you'd expect to manage? Did saving feel responsive? Anything in the printed-document preview that didn't match what you'd entered?*

---

## PHASE 2 — Rooms, Rates & Inventory (45 minutes)

### 2.1 Room Types
- [ ] Open **Rooms & Rates**. Confirm 4 room types exist (Lodge Studio, One-Bedroom Suite, Deluxe Two-Bedroom Suite, Luxury Three-Bedroom Suite).
- [ ] Edit the Studio — change the weekday price by **±BHD 1**. Save.
- [ ] Verify the change appears on the public site **Rooms** section AND in the partner portal booking flow.
- [ ] Revert.

### 2.2 Weekend Rate
- [ ] Confirm each room type has a weekend rate (15–20% premium over weekday).
- [ ] Edit One-Bedroom weekend rate. Save.
- [ ] Create a booking spanning Fri/Sat. Confirm the weekend rate kicks in for those nights.

### 2.3 Extra Bed Configuration
- [ ] Verify One-Bed, Two-Bed, Three-Bed offer extra beds with the correct max count and per-night fee.
- [ ] Studio should NOT offer extra beds.

### 2.4 Tax Setup
- [ ] Open **Tax Setup**. Confirm the active pattern (default: 10% Service Charge → 5% Government Levy → 10% VAT, compound).
- [ ] Open the "Worked example" card on the right. Verify the math: a BHD 100 room ends at ~BHD 126.5 gross.
- [ ] Create a new pattern called "TEST — Flat 5%". Save.
- [ ] Switch active pattern to TEST. Open the public booking flow and confirm the tax line shows the new pattern. Revert to the original.

### 2.5 Inventory (72 Units)
- [ ] Open Rooms & Rates → scroll to **Inventory**. Verify the 4 per-type cards show the correct unit counts (16 Studios, 32 One-Beds, 16 Two-Beds, 8 Three-Beds = 72 total).
- [ ] Click the **All types** filter. Confirm it lists the proper room type names (not the description).
- [ ] Filter to **Studio**. Verify only 16 unit chips appear.
- [ ] Click any unit chip — confirm it opens the unit detail and shows room number, floor, view, status.
- [ ] Change a unit's status to **Out of order**. Save. Verify the per-type card now shows it in the OOO count.
- [ ] Revert.

**🗒️ Phase 2 feedback prompt** — *Are all 72 units correctly mapped to floors? Should we be able to attach photos per unit? Per-unit pricing override needed?*

---

## PHASE 3 — Public Site & B2C Booking Flow (60 minutes)

This is what your direct guests see. Test it end-to-end like you're a real guest.

### 3.1 Homepage & Discovery
- [ ] Visit the site in **incognito** (no login).
- [ ] Verify the hero copy reads correctly.
- [ ] Scroll through Suites, Packages, Loyalty, FAQs, Press, Contact.
- [ ] Try the **language toggle** if Arabic exists — verify direction flips to RTL and key strings translate.

### 3.2 B2C Booking — Standard Flow
- [ ] Click **Book a Stay** on the hero.
- [ ] **Step 1 (dates)**: Pick a 3-night window in 2 weeks. Add 2 adults + 1 child.
- [ ] **Step 2 (suite)**: Pick One-Bedroom Suite × 1. Verify per-night rate, total, weekday/weekend breakdown.
- [ ] **Step 3 (extras)**: Add Breakfast.
- [ ] **Step 4 (guest)**: Fill in name, email, mobile (with country code), country.
- [ ] **Step 5 (payment)**: Pick **Pay on arrival** and toggle "Hold my room with a card". Fill in test card details (use 4242 4242 4242 4242).
- [ ] Confirm. Verify:
  - Toast appears with the booking ID.
  - Booking appears in admin **Bookings** list with the right total, paymentTiming, cardOnFile, guaranteed=true.

### 3.3 B2C Booking — Pay-Now (Non-refundable)
- [ ] Start a new booking. At Step 5 pick **Pay now (Save 5%)**.
- [ ] Verify the rail shows a 5% discount line.
- [ ] Fill in card details. Confirm.
- [ ] Verify the booking lands at `paymentStatus: pending` (admin records the transaction ID afterwards).

### 3.4 Gift Vouchers
- [ ] Open the footer → **Gift Vouchers**.
- [ ] Verify denominations show the configured currency code + 3 decimals.
- [ ] Send a test voucher to a fake recipient. Verify the toast and the value summary.

### 3.5 Card-on-File Vault (Admin)
- [ ] Back in admin, open the booking from 3.2.
- [ ] Scroll to **Card on file**. Verify the card is masked (•••• 4242).
- [ ] If you have the `card_vault_view` permission, click reveal. Confirm the full PAN displays.
- [ ] Click **Mark as charged**, enter a transaction ID. Verify the booking flips to `paid` and the transaction ID is recorded in the audit log.

**🗒️ Phase 3 feedback prompt** — *Did the booking flow feel natural? Any step where the guest would get confused? Should we capture passport / ID upfront for international guests?*

---

## PHASE 4 — Partner Portal: Corporate + Agent (60 minutes)

### 4.1 Corporate Contracts
- [ ] Open **Corporate** tab. Verify the seeded accounts (BAPCO, GFH, Investcorp Air, Ministry of Interior).
- [ ] Click any account → open the **Workspace** drawer. Review Overview, Bookings, Invoices, Statement.
- [ ] Open a contract → **Preview**. Verify:
  - Hotel header matches Property Info.
  - Currency label matches Currency master.
  - Rate table shows weekday / weekend / monthly columns.
  - Tax summary line reads from active tax pattern.
  - Banking block in footer.

### 4.2 Corporate Contract — New
- [ ] Create a new contract. Pick **Pre-payment (cash)** as payment terms.
- [ ] Set negotiated rates for at least 2 room types.
- [ ] Save. Verify it persists across page reload.

### 4.3 Travel Agent Contracts
- [ ] Open **Agents** tab. Verify Globepass, Cleartrip, etc.
- [ ] Verify the Commission workspace shows live data (not mock — it should reflect actual stayed agent bookings).
- [ ] Create a new agency with **9% commission, Net 30**.

### 4.4 Signed Contract Upload
- [ ] Open any contract → upload a test PDF signed copy.
- [ ] Verify it appears under the partner's workspace **Signed contract** card.
- [ ] Confirm the 15-day expiry banner triggers for contracts ending within 15 days.

### 4.5 Partner Login Test
- [ ] Note one corporate account's email + password.
- [ ] Sign out → sign back in as that corporate. Confirm you land on the **Corporate Portal** with the right account context.
- [ ] Try the **Book a stay** flow — confirm rates are the contracted rates (not rack).

### 4.6 Travel Agent Login + Booking
- [ ] Sign in as a travel agent (one with non-zero commission).
- [ ] Make a test booking. At the confirm step, tick **Deduct commission from this booking**.
- [ ] Verify:
  - The rail total drops by the commission amount.
  - The auto-issued commission invoice appears in the Commission tab.
  - The auto-issued booking AR invoice appears in the Invoices tab.

**🗒️ Phase 4 feedback prompt** — *Are the contract templates close enough to what you actually sign in print? Any clause/section missing? Should commission rules vary by room type or season?*

---

## PHASE 5 — Loyalty Program (30 minutes)

### 5.1 Tier Setup
- [ ] Open **Loyalty** tab. Verify tiers: Silver / Gold / Platinum with the correct benefits matrix.
- [ ] Edit Gold earn rate from 1.0 to 1.5. Save. Verify the change reflects in the public Loyalty page.
- [ ] Revert.

### 5.2 Member Enrollment
- [ ] Open the public **Join LS Privilege** modal.
- [ ] Sign up a test member. Verify they appear in admin Loyalty → Members.
- [ ] Confirm the member can log in via the portal and lands on the Member Portal.

### 5.3 Wallet Pass
- [ ] As the test member, open **My Membership** → **Add to Apple Wallet**.
- [ ] Verify the QR code renders and encodes the member id.
- [ ] (Real .pkpass signing requires the production signing service; the bundle itself should download.)

### 5.4 Points Earning & Redemption
- [ ] In admin Loyalty, manually add 1,000 points to the test member.
- [ ] As the member, make a booking. Toggle **Redeem points**. Verify the discount applies and points deduct.
- [ ] Confirm the booking has the right `pointsRedeemed` stamp in admin.

**🗒️ Phase 5 feedback prompt** — *Should there be a 4th tier? Should redemption be capped at X% of the room rate? Wallet pass aesthetic concerns?*

---

## PHASE 6 — Bookings, Invoices, Payments (75 minutes)

### 6.1 Bookings List
- [ ] Open **Bookings**. Verify:
  - Newest bookings appear at the top.
  - Pagination control shows 10 / 20 / 50 / 100 options.
  - All status, payment-status, source filters work.

### 6.2 Booking Detail
- [ ] Open any booking. Verify:
  - Guest details, dates, suite, occupancy.
  - Charges card with weekday/weekend breakdown when applicable.
  - Card on file (if captured).
  - Audit log entries.
- [ ] Edit the booking — change check-out date by 1 night. Save.
- [ ] Click **Recalc**. Confirm the tax + total update correctly.

### 6.3 Booking Documents
- [ ] On a booking, click **Confirmation** → preview → download HTML. Verify hotel header, charges, footer.
- [ ] Click **Folio (invoice)** → preview → download. Verify currency, tax breakdown, banking footer.
- [ ] Click **Receipt** → preview → download.

### 6.4 Delete Booking (managers with permission only)
- [ ] If you have `bookings_delete` permission, try the delete flow.
- [ ] Type the booking reference to confirm. Verify the booking disappears and an audit-log `booking-deleted` entry is created.

### 6.5 Invoices
- [ ] Open **Invoices**. Verify filter by Kind (Booking AR vs Commission AP) works.
- [ ] Open an issued invoice → mark as paid via the **Record payment** flow. Choose a method, enter an amount, save.
- [ ] Verify the invoice flips to `paid` (or `partial`), the payment shows up in **Payments**, and the audit log captures it.

### 6.6 Refunds
- [ ] On a paid payment, click **Refund**. Confirm.
- [ ] Verify the refund appears as a negative entry and the invoice balance recalculates.

### 6.7 Manual Booking (admin)
- [ ] Open **Bookings** → **New booking**.
- [ ] Pick source = **Corporate**, choose a Pre-payment contract.
- [ ] Pick a room, dates, guests.
- [ ] At the Payment card, choose **Pay now**. Verify the card capture fields appear.
- [ ] Fill in card details. Save.
- [ ] Verify the booking lands at `pending` and the card is on file.

**🗒️ Phase 6 feedback prompt** — *Any field missing from the booking edit drawer? Any report column missing from the bookings list?*

---

## PHASE 7 — Channel Manager, Stop-Sale & OTA (30 minutes)

### 7.1 OTA Connections
- [ ] Open **Stop-Sale & OTA**. Verify all 5 channels (Booking.com, Expedia, Agoda, Hotelbeds, Almosafer).
- [ ] Open Almosafer → confirm config + last-sync timestamp.

### 7.2 Stop-Sale
- [ ] Open **Calendar**.
- [ ] Pick a future date, mark a room type as Stop-Sale.
- [ ] Save. Verify the date cell now shows the stop-sale marker.
- [ ] Try to book that date+room from the partner portal — confirm it's blocked.

### 7.3 Push Availability / Rates
- [ ] On any channel, click **Push availability** and **Push rates**.
- [ ] Verify a sync log entry is created with the timestamp.

### 7.4 OTA Email Composer
- [ ] Open the OTA email composer.
- [ ] Compose a stop-sale notification. Choose at least 3 of the 5 channels.
- [ ] Verify the email body preview is correct. (Sending is mocked — confirm the toast.)

**🗒️ Phase 7 feedback prompt** — *Which channels should integrate first in production? Any restriction (CTA / CTD / min-stay) missing?*

---

## PHASE 8 — Reports, Maintenance, Notifications (45 minutes)

### 8.1 Reports — Revenue
- [ ] Open **Reports** → Revenue. Verify period filter, ADR, RevPAR, occupancy chart.
- [ ] Confirm all monetary values show the configured currency + decimals.
- [ ] Click any room-type bar → verify the per-room breakdown table.
- [ ] Click **Export CSV** → verify the file downloads with the right columns.

### 8.2 Reports — Tax Collected
- [ ] Open the Tax Report. Verify per-component breakdown matches the active tax pattern.
- [ ] Confirm gross billed + taxable base + total tax math reconciles.

### 8.3 Reports — Activities
- [ ] Open the Activities dashboard. Verify the recent activity feed (bookings, invoices, payments, etc.).
- [ ] Filter to "Last 7 days". Confirm the chart updates.

### 8.4 Maintenance
- [ ] Open **Maintenance**. Verify the jobs list.
- [ ] Create a new job: pick a category (AC / Electrical / Plumbing / etc.), assign a unit, add parts cost + labor cost. Save.
- [ ] Verify the job appears in the open list. Move it through diagnosed → in-progress → completed.

### 8.5 Vendors
- [ ] Open Maintenance → **Vendors** tab.
- [ ] Add a new vendor. Save.
- [ ] Confirm the new vendor appears in the dropdown when creating a job.

### 8.6 Notifications
- [ ] Open the notification **bell** (top-right). Verify recent activity entries (new bookings, invoice issued, etc.).
- [ ] Mark all as read. Verify the badge clears.
- [ ] Confirm that creating a new test booking generates a fresh notification.

**🗒️ Phase 8 feedback prompt** — *Any KPI missing from the Revenue dashboard? Should maintenance jobs trigger automatic vendor emails?*

---

## PHASE 9 — Staff & Access Control (30 minutes)

### 9.1 Roles & Permissions
- [ ] Open **Staff & Access**. Verify the seeded roles (Owner, GM, Front Office Manager, Accounts, Sales, Reservations, Housekeeping).
- [ ] Open one staff member → review their permissions matrix.
- [ ] Toggle ON `bookings_delete` for a Reservations staff member. Save.
- [ ] Sign in as that staff. Verify the **Delete booking** action is now visible.
- [ ] Revert.

### 9.2 Card Vault Access
- [ ] Confirm only roles with `card_vault_view` permission can reveal stored PANs.
- [ ] Test by signing in as a staff without that permission and trying to view a card-on-file — it should stay masked.

### 9.3 Audit Trail
- [ ] Perform 3 mutations (e.g. edit a booking, issue an invoice, refund a payment).
- [ ] Verify each appears in the **Audit log** with the right actor, timestamp, and action.

**🗒️ Phase 9 feedback prompt** — *Any permission gap? Roles too coarse / too fine? Should we add a Read-only role?*

---

## PHASE 10 — Site Content CMS, Email Templates, Final Polish (30 minutes)

### 10.1 Site Content CMS
- [ ] Open **Site Content**. Edit the hero headline. Save.
- [ ] Reload the public site. Verify the new headline appears.
- [ ] Revert.
- [ ] Edit a room's hero image override. Save. Verify the new image appears on the Rooms section.

### 10.2 Gallery
- [ ] Open Site Content → **Gallery**.
- [ ] Upload a new image. Save.
- [ ] Verify it appears on the public Gallery page.

### 10.3 Email Templates
- [ ] Open **Email Templates**. Pick one (Booking Confirmation / Invoice Issued / Receipt / etc.).
- [ ] Edit a placeholder. Save.
- [ ] Send a test (mocked). Verify the toast and the rendered preview.

### 10.4 System Presentation
- [ ] Open admin → System Presentation (the training deck).
- [ ] Download HTML + Markdown.
- [ ] Verify both render correctly.

**🗒️ Phase 10 feedback prompt** — *Any CMS field we should be able to edit but currently can't? Email template missing for a real-world scenario?*

---

## INTEGRATION TESTS (45 minutes)

End-to-end scenarios that touch multiple modules. Do these after the per-module phases pass.

### IT-1: Direct Guest Stay (full lifecycle)
- [ ] Guest books on the public site (Pay-on-arrival + card guarantee).
- [ ] Reservations confirms in admin.
- [ ] Guest checks in on arrival day (status → in-house).
- [ ] Charge captured via Card-on-file panel + transaction ID.
- [ ] Guest checks out (status → checked-out).
- [ ] Folio invoice generated; receipt emailed.
- [ ] Booking appears in revenue report.
- [ ] Notification fires at each lifecycle change.

### IT-2: Corporate Net-30 Stay
- [ ] Corporate logs into their portal, books a stay.
- [ ] Booking is invoiced Net-30 against the contract.
- [ ] Guest stays, checks out.
- [ ] Accounts records partial payment, then full payment.
- [ ] Invoice marked paid; statement updates.

### IT-3: Agent Booking with Commission Deduction
- [ ] Agent books a stay on behalf of their guest.
- [ ] Agent ticks "Deduct commission from this booking".
- [ ] Guest stays, checks out.
- [ ] Verify: net AR invoice for the agent, paid commission invoice for the hotel.

### IT-4: Member with Points Redemption
- [ ] Member books a stay, redeems 500 points.
- [ ] Stay completes, points earned on the new spend.
- [ ] Verify lifetime points + tier-progress update correctly.

### IT-5: Pre-payment Cash + Pay-now (Partner)
- [ ] Corporate with Pre-payment (cash) terms books, picks Pay-now.
- [ ] Card captured; booking pending.
- [ ] Admin records transaction ID → booking flips to paid.
- [ ] Verify the 5% pay-now discount applied correctly.

**🗒️ Integration feedback prompt** — *Which end-to-end flow felt clunky? Where did context get lost between modules?*

---

## OVERALL FEEDBACK SUMMARY

Please complete this section after all phases:

**1. Showstoppers (block go-live)** — _list bugs that absolutely must be fixed before production_

**2. High-priority gaps** — _features that are critical for day-to-day operations but not blocking_

**3. Nice-to-haves** — _improvements that would speed up your work but aren't urgent_

**4. UX friction points** — _places where the UI got in your way (extra clicks, confusing labels, unclear states)_

**5. Missing reports / data exports** — _data you need to extract but can't_

**6. Training material gaps** — _topics this plan didn't cover that the next admin will need_

**7. Integration wishlist** — _third-party services we should hook up (PMS, payment gateway, accounting, CRM, channel manager, SMS, e-signature, etc.)_

**8. Overall confidence rating (1–5)** — _how ready does the system feel for live operations?_

**9. Recommended next iteration focus** — _which module / surface gets the next round of investment?_

---

## SIGN-OFF

| Tester | Role | Phases completed | Sign-off date | Confidence (1–5) |
|--------|------|------------------|---------------|-------------------|
| _____ | _____ | _____ | _____ | _____ |

Once all phases are signed off and the overall feedback summary is filled, send this completed document to the owner. We'll review and prioritise the next development sprint based on the findings.

---

## APPENDIX A — Quick Reference

**Admin entry point** — Sign in via the Owner / Admin tab on the partner portal.
**Demo accounts** — Listed in the project README under "Demo accounts".
**Currency master** — Property Info → Currency & decimals.
**Tax pattern** — Tax Setup → activate one pattern at a time.
**Card vault retention** — 30 days after capture, auto-purges.
**Weekend days default** — Friday + Saturday (Bahrain). Editable in Property Info.
**Loyalty tiers** — Silver / Gold / Platinum (editable in Loyalty admin).
**OTA channels** — Booking.com, Expedia, Agoda, Hotelbeds, Almosafer.
**Per-suite count** — 16 Studios + 32 One-Beds + 16 Two-Beds + 8 Three-Beds = 72.

## APPENDIX B — Common Issues & Workarounds

- **Data didn't persist after save** — Confirm you're signed in (not anonymous). Anonymous sessions can read public data but most writes need authentication.
- **Currency label didn't update** — Hard-refresh the browser (Cmd+Shift+R) — the i18n + ambient cache picks up on next render.
- **Booking flow shows wrong rate** — Confirm the partner is on the right contract and the contract has non-zero negotiated rates for that room type.
- **Tax pattern not applied** — Only one pattern is `active` at a time. Activate from Tax Setup before testing.
- **Wallet pass empty** — Real `.pkpass` signing requires the production signing service. The download itself is the bundled structure; full Wallet install needs the signature.
