import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Lock, Minus, Plus, Sparkles, Tag, X } from "lucide-react";
import { C } from "../data/tokens.js";
import { Icon } from "../components/Icon.jsx";
import { Field, Input, Select, GoldBtn } from "../components/primitives.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";
import { CountrySelect } from "../components/CountrySelect.jsx";
import { findCountryByCode, parsePhone, DEFAULT_COUNTRY_CODE } from "../data/countryCodes.js";
import { useT, useLang } from "../i18n/LanguageContext.jsx";
import { fmtDate, inDays, nightsBetween, todayISO } from "../utils/date.js";
import { priceExtra, priceLabelFor, useData, evalPackageEligibility, describePackageConditions, roomFitsParty, computePackageCharge, computePackageSaving, packagePriceSuffix, getPackageRoomPrice, getPackageMinPrice, buildCardOnFile, CARD_VAULT_RETENTION_DAYS } from "../data/store.jsx";

export const BookingModal = ({ open, onClose, initial }) => {
  const t = useT();
  const { lang } = useLang();
  const { rooms: ROOMS, activeExtras, activePackages, addBooking, members, addMember, tiers, loyalty } = useData();
  // Tier discount table — single source of truth for both the booking-
  // modal's "register me as Silver" flow and the existing-member welcome-
  // back path. Mirrors what the customer portal uses.
  const TIER_DISCOUNT = { silver: 5, gold: 10, platinum: 15 };
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    // Default to today + a 1-night stay so the calendar opens valid and the
    // form never submits a check-in in the past or a 0-night booking.
    checkIn: todayISO(), checkOut: inDays(1),
    adults: 2, children: 0,
    // Multi-room support — each entry is { id: roomId, qty: count }.
    // Backward-compat: a single `room` prop (e.g. when launching from
    // "Book this suite" CTAs on the homepage) is normalised into a
    // single-row rooms array on open.
    rooms: [{ id: (ROOMS[1] || ROOMS[0])?.id, qty: 1 }],
    package: null,
    addOns: {},
    name: "", email: "", phone: "", country: DEFAULT_COUNTRY_CODE,
    cardName: "", cardNum: "", cardExp: "", cardCvc: "",
    paymentTiming: "later", // "later" — held only, charged on arrival; "now" — capture card on file
    // Guarantee mode — only meaningful when paymentTiming === "later":
    //   "card" — card on file holds the room all day
    //   "none" — no card; booking is held only until 3pm on the arrival day
    guaranteeMode: "none",
    member: false, memberCode: "",
    notes: "",
    confirmCode: "",
  });

  useEffect(() => {
    if (open && initial) {
      setData((d) => {
        const next = { ...d, ...initial };
        // Backward-compat: external entry points pass a single `room` object.
        // Normalise to the multi-row shape so the rest of the modal works.
        if (initial.room && !initial.rooms) {
          next.rooms = [{ id: initial.room.id, qty: 1 }];
        }
        delete next.room;

        // Package pre-fill: when an offer is supplied, clamp the booking to
        // the offer's constraints so the guest lands on a valid configuration.
        // We only auto-pick a suite when the offer has exactly one eligible
        // type — otherwise the guest still chooses on step 2 (constrained to
        // the eligible list there).
        const pkg = initial.package;
        if (pkg) {
          const minNights = Number(pkg.minNights) || 0;
          const minGuests = Number(pkg.minGuests) || 0;
          const maxGuests = Number(pkg.maxGuests) || 0;
          if (minNights > 0) {
            const dt = new Date(next.checkIn || todayISO());
            dt.setDate(dt.getDate() + minNights);
            next.checkOut = dt.toISOString().slice(0, 10);
          }
          if (minGuests > 0) {
            // Spread the required minimum across adults first, then children.
            // The guest can adjust upward in step 1.
            const declared = (Number(next.adults) || 0) + (Number(next.children) || 0);
            if (declared < minGuests) {
              next.adults = Math.max(Number(next.adults) || 1, minGuests);
              next.children = 0;
            }
          }
          if (maxGuests > 0) {
            const declared = (Number(next.adults) || 0) + (Number(next.children) || 0);
            if (declared > maxGuests) {
              next.adults = Math.min(Number(next.adults) || maxGuests, maxGuests);
              next.children = Math.max(0, maxGuests - (Number(next.adults) || 0));
            }
          }
          // Single-eligible-room offers auto-select that room so step 2 is a
          // confirmation rather than a picker.
          const allowed = Array.isArray(pkg.roomIds) ? pkg.roomIds : [];
          if (allowed.length === 1) {
            next.rooms = [{ id: allowed[0], qty: 1, extraBeds: 0 }];
          } else if (allowed.length > 1 && next.rooms?.length === 1 && !allowed.includes(next.rooms[0]?.id)) {
            // Existing pre-selected suite is no longer eligible — drop it.
            next.rooms = [];
          }
        }

        return next;
      });
      setStep(initial.step || 1);
    }
    if (open) setStep(initial?.step || 1);
  }, [open, initial]);

  // ── Step-4 contact / payment validation ────────────────────────────────
  // Required: name, country, email (well-formed), phone (with national
  // digits past the dial code). When the operator hits Confirm with any
  // of these missing, we keep them on step 4 and surface an inline error
  // strip + a per-field warning border. `fieldErr` is keyed off the
  // submission attempt — it stays empty until the operator first clicks
  // Confirm so a fresh form doesn't look angry.
  // NOTE: these hooks MUST live above the `if (!open) return null` early
  // return below — otherwise React sees a different hook count between
  // closed and open renders and unmounts the whole modal (blank screen).
  const [confirmError, setConfirmError] = useState("");
  const [fieldErr, setFieldErr] = useState({});
  // Clear validation noise as the operator types.
  useEffect(() => {
    if (!confirmError && Object.keys(fieldErr).length === 0) return;
    const errs = {};
    if (!String(data.name || "").trim())  errs.name = true;
    if (!data.country)                    errs.country = true;
    if (!/.+@.+\..+/.test(data.email || "")) errs.email = true;
    const { national } = parsePhone(data.phone || "");
    if (!String(national || "").replace(/\D/g, "").length) errs.phone = true;
    setFieldErr(errs);
    if (Object.keys(errs).length === 0) setConfirmError("");
  }, [data.name, data.country, data.email, data.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const nights = nightsBetween(data.checkIn, data.checkOut);

  // Calendar bounds — never let the operator pick a check-in in the past,
  // and force check-out to be strictly after check-in (min 1 night).
  const today = todayISO();
  const minCheckOut = data.checkIn ? (() => {
    const d = new Date(data.checkIn); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })() : today;
  // Setters that auto-bump check-out so the booking always represents
  // at least one valid night.
  const setCheckIn = (v) => {
    setData((d) => {
      const next = { ...d, checkIn: v };
      if (!v) return next;
      const out = new Date(v); out.setDate(out.getDate() + 1);
      const minOutIso = out.toISOString().slice(0, 10);
      if (!d.checkOut || d.checkOut <= v) next.checkOut = minOutIso;
      return next;
    });
  };
  const setCheckOut = (v) => {
    setData((d) => {
      if (v && d.checkIn && v <= d.checkIn) {
        const out = new Date(d.checkIn); out.setDate(out.getDate() + 1);
        return { ...d, checkOut: out.toISOString().slice(0, 10) };
      }
      return { ...d, checkOut: v };
    });
  };

  // Resolve the rooms array into runtime entries with the live ROOMS data.
  // Each row gets { room, qty, extraBeds, roomRev, extraBedRev, lineRevenue }
  // so the per-suite line on the summary panel can show both contributions.
  // `extraBeds` is the per-line count of rollaways the operator added; it's
  // capped at room.maxExtraBeds × qty in the stepper below.
  const roomLines = (data.rooms || [])
    .filter((r) => r && r.qty > 0)
    .map((r) => {
      const room = ROOMS.find((x) => x.id === r.id);
      if (!room) return null;
      const extraBeds   = Math.max(0, Number(r.extraBeds) || 0);
      const ebFee       = Number(room.extraBedFee || 0);
      const roomRev     = room.price * nights * r.qty;
      const extraBedRev = (room.extraBedAvailable ? ebFee * extraBeds * nights : 0);
      return {
        room, qty: r.qty,
        extraBeds, extraBedFee: ebFee,
        roomRev, extraBedRev,
        lineRevenue: roomRev + extraBedRev,
      };
    })
    .filter(Boolean);
  const roomTotal       = roomLines.reduce((s, l) => s + l.lineRevenue, 0);
  const extraBedRevenue = roomLines.reduce((s, l) => s + l.extraBedRev, 0);
  const totalRooms      = roomLines.reduce((s, l) => s + l.qty, 0);
  const totalExtraBeds  = roomLines.reduce((s, l) => s + l.extraBeds, 0);
  // Capacity model — three checks layered so the operator can mix rules
  // freely without forbidding sensible combinations.
  //
  //   totalCapacity   — HARD ceiling on total head-count (adults + children)
  //                     across all picked suites. occupancy × qty per line,
  //                     plus extra-bed adders. This is the rule that prevents
  //                     "2 adults + 1 child" from fitting in a Studio (which
  //                     sleeps 2 total).
  //   adultsCapacity  — Sub-cap on adults only. Defaults to occupancy when
  //                     `maxAdults` isn't declared, so it never restricts on
  //                     its own beyond the total.
  //   childrenCapacity — Same idea, but for children. Defaults to occupancy
  //                     so that — by default — any child/adult split fits.
  //                     Set `maxChildren: 0` on a type to forbid children
  //                     altogether on that suite.
  const totalCapacity = roomLines.reduce((s, l) => {
    const base = (l.room.occupancy ?? 0) * l.qty;
    const fromBeds = l.room.extraBedAvailable
      ? ((l.room.extraBedAdds?.adults ?? 0) + (l.room.extraBedAdds?.children ?? 0)) * l.extraBeds
      : 0;
    return s + base + fromBeds;
  }, 0);
  const adultsCapacity   = roomLines.reduce((s, l) => {
    const base = (l.room.maxAdults ?? l.room.occupancy ?? 0) * l.qty;
    const fromBeds = l.room.extraBedAvailable ? (l.room.extraBedAdds?.adults ?? 0) * l.extraBeds : 0;
    return s + base + fromBeds;
  }, 0);
  const childrenCapacity = roomLines.reduce((s, l) => {
    const base = (l.room.maxChildren ?? l.room.occupancy ?? 0) * l.qty;
    const fromBeds = l.room.extraBedAvailable ? (l.room.extraBedAdds?.children ?? 0) * l.extraBeds : 0;
    return s + base + fromBeds;
  }, 0);
  const partySize     = (Number(data.adults) || 0) + (Number(data.children) || 0);
  const leadRoom      = roomLines[0]?.room || ROOMS[1] || ROOMS[0];

  // Compute add-on lines dynamically from the active extras catalogue —
  // billed against the declared party size, not per-room caps.
  const addOnLines = activeExtras
    .filter((e) => data.addOns[e.id])
    .map((e) => ({ id: e.id, title: e.title, total: priceExtra(e, { adults: Math.max(1, partySize), nights }) }));
  const addOnTotal = addOnLines.reduce((s, l) => s + l.total, 0);

  // ── Package handling ───────────────────────────────────────────────────
  // When an offer is applied, the suite charge is replaced by the package
  // price. The actual amount charged depends on the package's pricingMode:
  //   • "per-night"   — price × nights
  //   • "first-night" — price + (rack rate × remaining nights)
  //   • "flat"        — single fee for the whole stay
  // Eligibility is re-evaluated whenever the dates / party / suite
  // selection changes; failures show inline so the guest can adjust and
  // stay on a valid configuration.
  const pkg = data.package || null;
  const pkgEval = pkg ? evalPackageEligibility(pkg, {
    roomIds: roomLines.map((l) => l.room.id),
    nights,
    checkIn: data.checkIn,
    today,
  }) : null;
  const pkgTitle = pkg ? (t(`packages.${pkg.id}.title`) || pkg.title || "Offer") : null;
  const pkgConditions = pkg ? describePackageConditions(pkg, (id) => t(`rooms.${id}.name`) || id) : "";
  const pkgMode = pkg ? (pkg.pricingMode || "per-night") : null;
  // Pick the room to price the offer against. We always price against the
  // FIRST selected suite — guests typically pick one suite per booking
  // anyway. When no suite is selected yet (step 1), fall back to the
  // package's lowest entry so the running total stays sensible.
  const pkgRoomId = pkg ? (roomLines[0]?.room?.id || null) : null;
  const pkgRoomPrice = pkg
    ? (pkgRoomId ? getPackageRoomPrice(pkg, pkgRoomId) : getPackageMinPrice(pkg))
    : { price: 0, saving: 0 };
  // Per-night rack rate to use for "first-night" mode — fall back to the
  // first selected room (or the lead room) so the math still resolves
  // before the guest reaches step 2.
  const pkgBaseRate = pkg ? (roomLines[0]?.room?.price || leadRoom?.price || 0) : 0;
  const pkgCharge   = pkg ? computePackageCharge(pkg, pkgRoomId, pkgBaseRate, nights) : 0;
  const pkgSaving   = pkg ? computePackageSaving(pkg, pkgRoomId, nights)               : 0;
  // The portion of the package charge that's package vs. extra rack-rate
  // nights — used to break out the line items in the right summary panel
  // for "first-night" mode.
  const pkgFirstNight = pkg && pkgMode === "first-night" ? pkgRoomPrice.price                              : 0;
  const pkgRackNights = pkg && pkgMode === "first-night" ? Math.max(0, +(pkgCharge - pkgRoomPrice.price).toFixed(3)) : 0;
  // Suites the offer can be booked against, when constrained.
  const allowedRoomIds = pkg && Array.isArray(pkg.roomIds) ? pkg.roomIds : [];
  const isRoomAllowedForPkg = (id) => allowedRoomIds.length === 0 || allowedRoomIds.includes(id);

  // ── Eligible offers — surface unsolicited matches ──────────────────────
  // When NO offer is applied yet, scan active offers and surface those that
  // would fully qualify with the current selection. Click-to-apply lets the
  // guest swap the rack-rate booking for an offer-priced one without leaving
  // the flow.
  const eligibleOffers = !pkg ? (activePackages || []).filter((o) => {
    const ev = evalPackageEligibility(o, {
      roomIds: roomLines.map((l) => l.room.id),
      nights,
      checkIn: data.checkIn,
      today,
    });
    return ev.ok && roomLines.length > 0;
  }) : [];

  // ── Member discount ─────────────────────────────────────────────────
  // Two paths produce a discount, both mutually exclusive with packages
  // (offers already carry their own savings).
  //
  //   1. Existing member — when the email entered in step 4 matches a
  //      LS Privilege member already in the store, we look up their tier
  //      and apply that tier's discount automatically. The toggle copy on
  //      step 1 shifts to "Welcome back" so the guest knows we recognised
  //      them.
  //   2. New Silver registration — when the toggle is on AND the email
  //      doesn't match any existing member, we apply the 5% Silver rate
  //      to this booking and create the member record on confirm.
  const memberMatch = (data.email || "").trim()
    ? (members || []).find((m) => (m.email || "").toLowerCase() === data.email.trim().toLowerCase())
    : null;
  const memberTier = memberMatch
    ? (memberMatch.tier || "silver").toLowerCase()
    : (data.member ? "silver" : null);
  const memberPct = memberTier ? (TIER_DISCOUNT[memberTier] || 0) : 0;
  const memberDiscount = memberPct && !pkg ? Math.round(roomTotal * (memberPct / 100)) : 0;
  // Suite line in the summary — package charge (per the chosen pricing
  // rule) replaces the per-night rack rate when an offer is applied. Tax
  // + add-ons still pile on top.
  const stayCharge = pkg ? pkgCharge : roomTotal;
  // Pay-now discount — 5% off the stay charge in exchange for the booking
  // becoming non-refundable. Stacks with the offer/member discount because
  // it's an entirely separate concession (the guest is giving up the
  // refund right). Computed against `stayCharge` (post-offer, pre-tax)
  // and applied alongside the member discount.
  const PAY_NOW_DISCOUNT_PCT = 5;
  const payNowDiscount = data.paymentTiming === "now"
    ? Math.round(stayCharge * (PAY_NOW_DISCOUNT_PCT / 100))
    : 0;
  const subtotal = Math.max(0, stayCharge + addOnTotal - memberDiscount - payNowDiscount);
  const tax = Math.round(subtotal * 0.10);
  const total = subtotal + tax;

  // ─ Multi-room helpers used by step 2 ────────────────────────────────
  const setRoomQty = (roomId, delta) => {
    setData((d) => {
      const list = (d.rooms || []).slice();
      const idx = list.findIndex((r) => r.id === roomId);
      if (idx >= 0) {
        const nextQty = Math.max(0, (list[idx].qty || 0) + delta);
        if (nextQty === 0) list.splice(idx, 1);
        else {
          const room = ROOMS.find((x) => x.id === roomId);
          const cap  = (room?.maxExtraBeds || 0) * nextQty;
          // If the operator dropped the qty under the existing extra-bed
          // count, snap extra beds down to the new ceiling.
          const newExtraBeds = Math.min(list[idx].extraBeds || 0, cap);
          list[idx] = { ...list[idx], qty: nextQty, extraBeds: newExtraBeds };
        }
      } else if (delta > 0) {
        list.push({ id: roomId, qty: delta, extraBeds: 0 });
      }
      return { ...d, rooms: list };
    });
  };
  // Step the per-line extra-bed count. Capped by `room.maxExtraBeds × qty`
  // and gated by `extraBedAvailable` so disallowed rooms can't be tampered.
  const setExtraBeds = (roomId, delta) => {
    setData((d) => {
      const list = (d.rooms || []).slice();
      const idx = list.findIndex((r) => r.id === roomId);
      if (idx < 0) return d;
      const room = ROOMS.find((x) => x.id === roomId);
      if (!room?.extraBedAvailable) return d;
      const cap = (room.maxExtraBeds || 0) * (list[idx].qty || 0);
      const next = Math.min(cap, Math.max(0, (list[idx].extraBeds || 0) + delta));
      list[idx] = { ...list[idx], extraBeds: next };
      return { ...d, rooms: list };
    });
  };
  const qtyForRoom       = (roomId) => (data.rooms || []).find((r) => r.id === roomId)?.qty       || 0;
  const extraBedsForRoom = (roomId) => (data.rooms || []).find((r) => r.id === roomId)?.extraBeds || 0;

  // Step 2 → step 3 gate: at least one suite picked AND every capacity
  // check is satisfied. Three checks run independently and ALL must pass:
  //   1. Adults fit the adult sub-cap
  //   2. Children fit the child sub-cap
  //   3. adults + children fit the suite's hard occupancy ceiling
  // This lets a Studio (occupancy 2, max adults 2, max children 1) accept
  // "1 adult + 1 child" cleanly — both sub-caps pass and 2 ≤ occupancy 2 —
  // while still blocking "2 adults + 1 child" (3 > 2).
  // Step gates also enforce package eligibility when an offer is applied,
  // so the user can't continue through invalid offer configurations.
  const canAdvanceFromStep1 = nights >= 1
    && data.checkIn >= today
    && (!pkg || (() => {
      const ev = evalPackageEligibility(pkg, {
        roomIds: [], nights, checkIn: data.checkIn, today,
      });
      // On step 1 we only check nights + booking/stay windows — the suite
      // hasn't been picked yet, so don't fail the gate on suite-specific
      // failures.
      return !ev.failures.some((f) => /night|book|stay/i.test(f));
    })());
  const canAdvanceFromStep2 = roomLines.length > 0
    && adultsCapacity   >= (Number(data.adults)   || 0)
    && childrenCapacity >= (Number(data.children) || 0)
    && totalCapacity    >= partySize
    && (!pkg || (pkgEval && pkgEval.ok));

  const next = () => {
    if (step === 1 && !canAdvanceFromStep1) return;
    if (step === 2 && !canAdvanceFromStep2) return;
    setStep((s) => Math.min(5, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const validateContact = () => {
    const errs = {};
    if (!String(data.name || "").trim())  errs.name = true;
    if (!data.country)                    errs.country = true;
    if (!/.+@.+\..+/.test(data.email || "")) errs.email = true;
    const { national } = parsePhone(data.phone || "");
    if (!String(national || "").replace(/\D/g, "").length) errs.phone = true;
    setFieldErr(errs);
    if (Object.keys(errs).length === 0) {
      setConfirmError("");
      return true;
    }
    const labels = {
      name:    "Full name",
      country: "Country",
      email:   "Valid email",
      phone:   "Phone number",
    };
    setConfirmError(`Please complete the required field${Object.keys(errs).length === 1 ? "" : "s"}: ${Object.keys(errs).map((k) => labels[k]).join(" · ")}.`);
    return false;
  };

  const confirm = () => {
    if (!validateContact()) return;
    const code = "LS" + Math.random().toString(36).slice(2, 8).toUpperCase();
    setData((d) => ({ ...d, confirmCode: code }));
    // Persist a booking record. When an offer is applied, stamp the
    // package id, title and saving on the booking so dashboards and the
    // guest's confirmation can surface it.
    try {
      const lead = roomLines[0]?.room || ROOMS[1] || ROOMS[0];
      // Capture the card-on-file when the guest provided card data.
      // For "Pay now", a card is required so we always store it. For
      // "Pay on arrival" the card is optional — only present when the
      // guest opted into the guarantee. Without a card the booking is
      // non-guaranteed and held until 3pm on arrival day.
      const hasCardData = data.paymentTiming && (data.cardName || data.cardNum);
      const cardOnFile = hasCardData
        ? buildCardOnFile({ name: data.cardName, number: data.cardNum, exp: data.cardExp })
        : null;
      // Resolve guarantee + holdUntil. Pay-now is always guaranteed.
      // Pay-on-arrival is guaranteed only when a card was captured.
      // Non-guaranteed bookings carry a `holdUntil` of 15:00 on the
      // arrival date so the front-office can release at the deadline.
      const guaranteed = data.paymentTiming === "now" || cardOnFile != null;
      const holdUntil = !guaranteed && data.checkIn
        ? `${data.checkIn}T15:00:00`
        : null;

      // ── LS Privilege handoff ──────────────────────────────────────
      // Resolve the member context for this booking. Three branches:
      //   (a) Existing member matched — reuse their id, stamp source.
      //   (b) New Silver registration toggled on with valid email — add
      //       a new Silver member to the store (points start earning
      //       from this stay), reuse the new id.
      //   (c) Neither — booking remains "direct".
      let memberId   = memberMatch ? memberMatch.id : null;
      let memberKind = memberMatch ? "member" : "direct";
      const newSilver = !memberMatch && data.member && data.email && data.email.includes("@");
      if (newSilver) {
        const tierLetter = "S";
        const newId = `LS-${tierLetter}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        // Earn rate × total = points earned from this stay. Mirrors the
        // BookStayTab member booking flow inside the customer portal.
        const tierObj = (tiers || []).find((t) => t.id === "silver");
        const earnRate = tierObj?.earnRate || 1;
        const points = Math.round((total || 0) * earnRate);
        try {
          addMember?.({
            id:    newId,
            name:  data.name || "Guest",
            email: (data.email || "").trim().toLowerCase(),
            phone: data.phone || "",
            country: findCountryByCode(data.country)?.name || "",
            tier:  "silver",
            points,
            lifetimeNights: nights,
            joined: new Date().toISOString().slice(0, 10),
            verified: false,
            password: "",
          });
          memberId = newId;
          memberKind = "member";
        } catch (_) {}
      }

      addBooking({
        id: code,
        guest: data.name || "Guest",
        email: data.email || "",
        phone: data.phone || "",
        source: memberKind,
        memberId,
        roomId: lead?.id || ROOMS[0]?.id,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        nights,
        guests: partySize,
        rate: pkg ? Math.round(pkgCharge / Math.max(1, nights)) : (lead?.price || 0),
        total,
        // Pay-now no longer means "money received". Capturing the card
        // is not the same as charging it — the hotel records the actual
        // transaction afterwards (Card on File panel → "Mark as charged"),
        // at which point `paid` rolls up to total and `paymentStatus`
        // flips to "paid". Until then, Pay-now sits at zero just like
        // Pay-on-arrival.
        paid: 0,
        status: "confirmed",
        // Non-guaranteed bookings stay "pending" on the payment ledger
        // (no deposit, no card) so dashboards can flag them quickly. Pay-
        // on-arrival WITH a card stays "deposit" (the existing default).
        // Pay-now also sits at "pending" until the operator records the
        // actual charge via the Card on File panel.
        paymentStatus: data.paymentTiming === "now" ? "pending"
                      : guaranteed                   ? "deposit"
                      :                                 "pending",
        paymentTiming: data.paymentTiming || "later",
        cardOnFile,
        // Guarantee metadata. `holdUntil` is null for guaranteed bookings
        // (no release deadline) and 15:00 on the arrival day for non-
        // guaranteed bookings — the front office uses this to walk-in
        // release after 3pm if the guest hasn't arrived.
        guaranteed,
        guaranteeMode: guaranteed ? "card" : "none",
        holdUntil,
        notes: data.notes || "",
        offerId: pkg ? pkg.id : null,
        offerTitle: pkg ? pkgTitle : null,
        offerSaving: pkg ? pkgSaving : 0,
        memberDiscountPct: memberPct || 0,
        memberDiscount,
        // Pay-now non-refundable terms — persisted so the admin can see
        // which folio was sold non-refundable and the booking-detail
        // page can render the corresponding cancellation policy.
        payNowDiscountPct: data.paymentTiming === "now" ? PAY_NOW_DISCOUNT_PCT : 0,
        payNowDiscount,
        nonRefundable: data.paymentTiming === "now",
        extras: addOnLines.map((l) => ({ id: l.id, title: l.title, price: l.total })),
      });
    } catch (_) {
      // Fail silently — the modal still confirms locally for the guest.
    }
    setStep(5);
  };

  const titleForStep = (s) => t(`booking.title${s}`);
  const progressLabels = t("booking.progress");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <div className="min-h-screen flex items-start md:items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl my-8" style={{ backgroundColor: C.paper, border: `1px solid ${C.gold}` }}>
          <div className="flex items-center justify-between p-6" style={{ backgroundColor: C.bgDeep, color: C.cream }}>
            <div>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.3em", textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>
                {t("booking.headerLabel")}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontStyle: "italic", color: C.cream, lineHeight: 1 }}>
                {titleForStep(step)}
              </div>
            </div>
            <button onClick={onClose} style={{ color: C.textMuted }} onMouseEnter={(e) => e.currentTarget.style.color = C.gold}><X size={22} /></button>
          </div>

          {step < 5 && Array.isArray(progressLabels) && (
            <div className="flex" style={{ borderBottom: `1px solid rgba(0,0,0,0.1)` }}>
              {progressLabels.map((s, i) => (
                <div key={i} className="flex-1 text-center py-3" style={{
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase",
                  color: step > i + 1 ? C.goldDeep : step === i + 1 ? C.bgDeep : C.textDim,
                  fontWeight: step === i + 1 ? 700 : 500,
                  borderBottom: step === i + 1 ? `2px solid ${C.gold}` : "2px solid transparent",
                  backgroundColor: step > i + 1 ? "rgba(201,169,97,0.06)" : "transparent",
                }}>
                  {step > i + 1 && <Check size={11} className="inline mr-1.5" />}
                  {i + 1}. {s}
                </div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-3">
            <div className="md:col-span-2 p-8">
              {step === 1 && (
                <div className="space-y-5">
                  {/* Offer banner — when an offer was opened from the
                      Packages section, surface it here with its conditions
                      and a Remove control. The banner colour switches to
                      warn-yellow if the current selection breaks one of
                      the offer's conditions, listing the specific reason
                      so the guest knows what to adjust. */}
                  {pkg && (
                    <OfferBanner
                      pkg={pkg} pkgTitle={pkgTitle}
                      headlinePrice={pkgRoomPrice}
                      conditions={pkgConditions}
                      eligibility={pkgEval}
                      onRemove={() => setData((d) => ({ ...d, package: null }))}
                      t={t}
                    />
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={t("hero.fields.checkIn")} dark={false}><Input type="date" dark={false} value={data.checkIn}  onChange={setCheckIn}  min={today} /></Field>
                    <Field label={t("hero.fields.checkOut")} dark={false}><Input type="date" dark={false} value={data.checkOut} onChange={setCheckOut} min={minCheckOut} /></Field>
                  </div>
                  {/* Stay summary — confirms at a glance that the dates form
                      a valid stay of at least one night. */}
                  <div style={{
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
                    color: nights >= 1 ? C.goldDeep : C.warn,
                    fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                  }}>
                    {nights >= 1
                      ? <>{nights} {nights === 1 ? t("common.night") : t("common.nights")} · check-in {fmtDate(data.checkIn, lang)} → check-out {fmtDate(data.checkOut, lang)}</>
                      : <>Pick at least one night to continue.</>}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={t("hero.fields.adults")} dark={false}>
                      <Select value={data.adults} dark={false} onChange={(v) => setData({ ...data, adults: +v })}
                        options={[1,2,3,4,5,6].map(n => ({ value: n, label: `${n} ${n === 1 ? t("common.adult") : t("common.adults")}` }))} />
                    </Field>
                    <Field label={t("hero.fields.children")} dark={false}>
                      <Select value={data.children} dark={false} onChange={(v) => setData({ ...data, children: +v })}
                        options={[0,1,2,3,4].map(n => ({ value: n, label: `${n} ${n === 1 ? t("common.child") : t("common.children")}` }))} />
                    </Field>
                  </div>
                  {/* LS Privilege prompt — toggles between "register as
                      Silver" (default) and a "Welcome back" banner when
                      the entered email matches an existing member. The
                      auto-detection runs as soon as step 4's email is
                      filled in, so by the time the guest sees the summary
                      they already know which tier rate is being applied. */}
                  {memberMatch ? (
                    <div className="p-4 flex items-start gap-3" style={{
                      backgroundColor: "rgba(201,169,97,0.10)",
                      border: `1px solid ${C.gold}`,
                      borderInlineStart: `4px solid ${C.gold}`,
                    }}>
                      <Icon name="Crown" size={16} style={{ color: C.goldDeep, marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", color: C.bgDeep, fontWeight: 700 }}>
                          {t("booking.memberWelcomeBack")
                            .replace("{{name}}", memberMatch.name)
                            .replace("{{tier}}", (memberMatch.tier || "silver").charAt(0).toUpperCase() + (memberMatch.tier || "silver").slice(1))}
                        </div>
                        <div className="mt-1" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: C.textDim, lineHeight: 1.55 }}>
                          {t("booking.memberWelcomeBackHint").replace("{{pct}}", String(memberPct))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex items-start gap-3" style={{ backgroundColor: "rgba(201,169,97,0.08)", border: `1px solid ${C.border}` }}>
                      <Icon name="Sparkles" size={16} style={{ color: C.goldDeep, marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem", color: C.bgDeep, fontWeight: 600 }}>{t("booking.memberPrompt")}</div>
                        <label className="flex items-center gap-2 mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: C.textDim }}>
                          <input type="checkbox" checked={data.member} onChange={(e) => setData({ ...data, member: e.target.checked })} />
                          {t("booking.memberApply")}
                        </label>
                        {data.member && (
                          <div className="mt-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", color: C.textDim, lineHeight: 1.5 }}>
                            {t("booking.memberSilverHint")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  {pkg && (
                    <OfferBanner
                      pkg={pkg} pkgTitle={pkgTitle}
                      headlinePrice={pkgRoomPrice}
                      conditions={pkgConditions}
                      eligibility={pkgEval}
                      onRemove={() => setData((d) => ({ ...d, package: null }))}
                      t={t}
                    />
                  )}

                  {/* Eligible-offer hint — when the guest's current selection
                      qualifies for an active offer (and one isn't already
                      applied), surface it as a one-click apply chip so they
                      can swap rack rate for the offer price without going
                      back to the homepage. */}
                  {!pkg && eligibleOffers.length > 0 && (
                    <EligibleOffersStrip
                      offers={eligibleOffers}
                      onApply={(o) => setData((d) => ({ ...d, package: o }))}
                      t={t}
                    />
                  )}

                  {/* Smart hint — three independent checks (total ceiling,
                      adult sub-cap, child sub-cap). When one fails we recommend
                      the specific suite types that would satisfy that exact
                      dimension, so the operator doesn't have to figure out
                      which suite to pick from a generic message. */}
                  {(() => {
                    const declaredA = Number(data.adults)   || 0;
                    const declaredC = Number(data.children) || 0;
                    const adultsOK   = adultsCapacity   >= declaredA;
                    const childrenOK = childrenCapacity >= declaredC;
                    const totalOK    = totalCapacity    >= partySize;
                    const allOK      = totalRooms > 0 && adultsOK && childrenOK && totalOK;
                    const bg   = allOK ? "rgba(127,169,112,0.10)" : "rgba(184,133,46,0.10)";
                    const bd   = allOK ? "rgba(127,169,112,0.4)"  : "rgba(184,133,46,0.4)";
                    const ic   = allOK ? C.success : C.warn;
                    const partyDesc = `${data.adults} adult${data.adults === 1 ? "" : "s"}${declaredC > 0 ? ` + ${data.children} child${declaredC === 1 ? "" : "ren"}` : ""}`;

                    // Recommendation lookup — for each failure mode, list the
                    // suite type names that would satisfy the declared count
                    // for THAT dimension, irrespective of the others. The
                    // operator can then mix and match: pick one of these for
                    // the children, add another for adult headcount, etc.
                    const fitsAdults   = ROOMS.filter((r) => (r.maxAdults   ?? r.occupancy) >= declaredA);
                    const fitsChildren = ROOMS.filter((r) => (r.maxChildren ?? r.occupancy) >= declaredC);
                    const fitsTotal    = ROOMS.filter((r) => (r.occupancy   ?? 0)             >= partySize);
                    const list = (rs) => rs
                      .map((r) => t(`rooms.${r.id}.name`) || r.id)
                      .reduce((acc, name, i, arr) => {
                        if (i === 0) return name;
                        if (i === arr.length - 1) return `${acc} or ${name}`;
                        return `${acc}, ${name}`;
                      }, "");

                    return (
                      <div className="p-3 flex items-start gap-2" style={{
                        backgroundColor: bg, border: `1px solid ${bd}`,
                        fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem",
                      }}>
                        <Icon name="Sparkles" size={14} style={{ color: ic, flexShrink: 0, marginTop: 3 }} />
                        <div style={{ color: C.bgDeep, lineHeight: 1.55 }}>
                          {totalRooms === 0 ? (
                            <>Pick suites for your party of <strong>{partyDesc}</strong>. Each suite type has a total head-count cap — any mix of adults and children fits up to that cap (e.g. a Studio sleeps 2 in any combination of 2 adults or 1 adult + 1 child). Mix multiple suites if you need more space.</>
                          ) : !totalOK ? (
                            // Total ceiling is the most common failure (e.g.
                            // 2A+1C in a Studio = 3 > occupancy 2). Recommend
                            // suite types whose occupancy alone covers the
                            // party, and otherwise tell the operator to add
                            // another suite.
                            <>Selected suites sleep <strong>{totalCapacity} guest{totalCapacity === 1 ? "" : "s"}</strong> in total; you've declared <strong>{partyDesc}</strong>. {fitsTotal.length > 0
                              ? <>One <strong>{list(fitsTotal)}</strong> would fit your party in a single suite — or add another suite to the current selection.</>
                              : <>No single suite type sleeps your full party — add multiple suites (e.g. 2 Studios sleep 4) or use extra beds where allowed.</>}</>
                          ) : !adultsOK ? (
                            <>Selected suites accept <strong>{adultsCapacity} adult{adultsCapacity === 1 ? "" : "s"}</strong> max; you've declared <strong>{data.adults}</strong>. {fitsAdults.length > 0
                              ? <>These suite types accept {data.adults}+ adults: <strong>{list(fitsAdults)}</strong>. Pick one of those, or add another suite to the current selection.</>
                              : <>Even a single suite of any type can't hold {data.adults} adults — split your party across multiple suites.</>}</>
                          ) : !childrenOK ? (
                            <>Selected suites accept <strong>{childrenCapacity} child{childrenCapacity === 1 ? "" : "ren"}</strong> max; you've declared <strong>{data.children}</strong>. {fitsChildren.length > 0
                              ? <>These suite types allow {data.children}+ child{declaredC === 1 ? "" : "ren"}: <strong>{list(fitsChildren)}</strong>. Pick one of those, or add another suite to the current selection.</>
                              : <>No suite type allows {data.children} children — try splitting across multiple suites.</>}</>
                          ) : (
                            <><strong>{totalRooms}</strong> suite{totalRooms === 1 ? "" : "s"} selected · sleeps up to <strong>{totalCapacity}</strong> · party of <strong>{partyDesc}</strong>.</>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {ROOMS.map((r) => {
                    const qty            = qtyForRoom(r.id);
                    const extraBeds      = extraBedsForRoom(r.id);
                    const ebCap          = (r.maxExtraBeds || 0) * qty;
                    const ebUnit         = Number(r.extraBedFee || 0);
                    const roomSubtotal   = r.price * nights * qty;
                    const ebSubtotal     = r.extraBedAvailable ? ebUnit * extraBeds * nights : 0;
                    const lineSubtotal   = roomSubtotal + ebSubtotal;
                    const ebShow         = qty > 0 && r.extraBedAvailable && (r.maxExtraBeds || 0) > 0;
                    const pkgEligible    = isRoomAllowedForPkg(r.id);
                    const blockedByPkg   = pkg && !pkgEligible;
                    // Per-room offer price — shown on each card so the
                    // guest can see how the offer scales across suite types
                    // without committing to one yet.
                    const offerEntry     = pkg && pkgEligible ? getPackageRoomPrice(pkg, r.id) : null;
                    // Per-room single-unit fit check. Disable the +/- when
                    // the suite (incl. max extra beds) cannot hold the
                    // declared party. Already-selected rows stay
                    // interactive so the user can decrement back to zero.
                    const fit            = roomFitsParty(r, data.adults, data.children);
                    const blockedByFit   = !fit.ok && qty === 0;
                    const blocked        = blockedByPkg || blockedByFit;
                    const blockReason    = blockedByPkg
                      ? "Not eligible for the applied offer"
                      : (!fit.ok ? fit.reason : "");
                    return (
                      <div key={r.id}
                        className="flex gap-4 p-3 transition-colors"
                        style={{
                          border: `1px solid ${qty > 0 ? C.gold : "rgba(0,0,0,0.1)"}`,
                          backgroundColor: qty > 0 ? "rgba(201,169,97,0.06)" : C.cream,
                          opacity: blocked ? 0.5 : 1,
                          position: "relative",
                        }}
                      >
                        {blocked && blockReason && (
                          <div
                            style={{
                              position: "absolute",
                              top: 8, insetInlineEnd: 8, zIndex: 1,
                              backgroundColor: blockedByPkg ? "rgba(184,133,46,0.92)" : "rgba(154,58,48,0.92)",
                              color: "#FFF",
                              fontFamily: "'Manrope', sans-serif",
                              fontSize: "0.6rem", letterSpacing: "0.18em",
                              textTransform: "uppercase", fontWeight: 700,
                              padding: "3px 8px",
                            }}
                          >
                            {blockedByPkg ? "Not eligible" : "Too small"}
                          </div>
                        )}
                        <img src={r.image} alt="" style={{ width: 130, height: 100, objectFit: "cover", flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500 }}>
                              {t(`rooms.${r.id}.name`)}
                            </h4>
                            <div style={{ textAlign: "end" }}>
                              {offerEntry ? (
                                <>
                                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: pkg.color || C.goldDeep, fontWeight: 600 }}>
                                    {t("common.bhd")} {offerEntry.price}
                                    <span style={{ fontSize: "0.7rem", color: C.textDim, fontFamily: "'Manrope', sans-serif", letterSpacing: "0.1em" }}> {packagePriceSuffix(pkg)}</span>
                                  </div>
                                  <div style={{ color: C.textDim, fontSize: "0.72rem", textDecoration: "line-through", fontFamily: "'Manrope', sans-serif" }}>
                                    {t("common.bhd")} {r.price} / night
                                  </div>
                                  <div style={{ color: pkg.color || C.goldDeep, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 1 }}>
                                    Offer
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", color: C.goldDeep, fontWeight: 500 }}>
                                  {t("common.bhd")} {r.price}
                                  <span style={{ fontSize: "0.7rem", color: C.textDim, fontFamily: "'Manrope', sans-serif", letterSpacing: "0.1em" }}> {t("common.perNight")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.82rem", marginTop: 4 }}>{t(`rooms.${r.id}.short`)}</p>
                          <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
                            <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.72rem" }}>
                              {r.sqm} m² · sleeps up to <strong style={{ color: C.bgDeep }}>{r.occupancy}</strong>
                              {/* Hide operator-facing sub-cap detail from
                                  guests. The smart capacity banner above
                                  already steps in and explains in plain
                                  language whenever a guest's declared mix
                                  doesn't fit. We DO surface "adults only"
                                  because it's a hard policy guests need to
                                  know up front before they pick the room. */}
                              {(r.maxChildren ?? r.occupancy) === 0 && (
                                <span style={{ color: C.warn, fontWeight: 600 }}> · adults only</span>
                              )}
                              {r.extraBedAvailable && (r.maxExtraBeds || 0) > 0 && (
                                <span style={{ marginInlineStart: 8, color: C.goldDeep }}>· extra bed BHD {ebUnit}/night</span>
                              )}
                              {qty > 0 && nights >= 1 && (
                                <span style={{ marginInlineStart: 12 }}>
                                  {qty} × {nights} {nights === 1 ? t("common.night") : t("common.nights")}
                                  {ebShow && extraBeds > 0 ? <> + {extraBeds} bed × BHD {ebUnit} × {nights}n</> : null}
                                  {" "}= <strong style={{ color: C.goldDeep }}>{t("common.bhd")} {lineSubtotal}</strong>
                                </span>
                              )}
                            </div>
                            {/* +/- stepper */}
                            <div className="inline-flex items-stretch" style={{ border: `1px solid rgba(0,0,0,0.15)` }}>
                              <button
                                onClick={() => setRoomQty(r.id, -1)}
                                disabled={qty === 0}
                                style={{
                                  width: 36, color: qty > 0 ? C.bgDeep : "rgba(0,0,0,0.3)",
                                  borderInlineEnd: "1px solid rgba(0,0,0,0.15)",
                                  cursor: qty > 0 ? "pointer" : "not-allowed",
                                  background: "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}
                                aria-label="Decrease quantity"
                              ><Minus size={14} /></button>
                              <div style={{
                                minWidth: 44, padding: "0.4rem 0.6rem",
                                textAlign: "center",
                                color: qty > 0 ? C.goldDeep : C.textDim,
                                fontFamily: "'Cormorant Garamond', serif",
                                fontSize: "1.15rem", fontWeight: 600,
                              }}>{qty}</div>
                              <button
                                onClick={() => setRoomQty(r.id, +1)}
                                disabled={blocked}
                                title={blocked ? blockReason : undefined}
                                style={{
                                  width: 36, color: blocked ? "rgba(0,0,0,0.3)" : C.goldDeep,
                                  borderInlineStart: "1px solid rgba(0,0,0,0.15)",
                                  cursor: blocked ? "not-allowed" : "pointer",
                                  background: "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}
                                aria-label="Increase quantity"
                              ><Plus size={14} /></button>
                            </div>
                          </div>
                          {blocked && blockReason && (
                            <div style={{
                              fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
                              color: blockedByPkg ? C.goldDeep : C.warn,
                              marginTop: 6, lineHeight: 1.5,
                            }}>{blockReason}</div>
                          )}

                          {/* Extra-bed stepper — only shown when at least one
                              suite of this type is in the cart and the type
                              offers extra beds. Stays inside the same card so
                              the operator never has to scroll past the suite
                              they're configuring. */}
                          {ebShow && (
                            <div className="mt-3 p-3 flex items-center justify-between gap-3 flex-wrap"
                              style={{
                                backgroundColor: extraBeds > 0 ? "rgba(201,169,97,0.10)" : "rgba(0,0,0,0.04)",
                                border: `1px dashed ${extraBeds > 0 ? C.gold : "rgba(0,0,0,0.18)"}`,
                              }}>
                              <div style={{ fontFamily: "'Manrope', sans-serif", color: C.bgDeep, fontSize: "0.78rem", lineHeight: 1.5 }}>
                                <strong>Extra bed</strong>
                                <span style={{ color: C.textDim }}>
                                  {" "}— up to {ebCap} for this {qty === 1 ? "suite" : `${qty}-suite line`} · BHD {ebUnit}/night each
                                  {(r.extraBedAdds?.adults || 0) + (r.extraBedAdds?.children || 0) > 0 && (
                                    <> · adds {[
                                      (r.extraBedAdds?.adults   || 0) > 0 ? `${r.extraBedAdds.adults} adult${r.extraBedAdds.adults === 1 ? "" : "s"}` : null,
                                      (r.extraBedAdds?.children || 0) > 0 ? `${r.extraBedAdds.children} child${r.extraBedAdds.children === 1 ? "" : "ren"}` : null,
                                    ].filter(Boolean).join(" + ")}/bed</>
                                  )}
                                </span>
                              </div>
                              <div className="inline-flex items-stretch" style={{ border: `1px solid rgba(0,0,0,0.15)`, backgroundColor: C.cream }}>
                                <button
                                  onClick={() => setExtraBeds(r.id, -1)}
                                  disabled={extraBeds === 0}
                                  style={{
                                    width: 32, color: extraBeds > 0 ? C.bgDeep : "rgba(0,0,0,0.3)",
                                    borderInlineEnd: "1px solid rgba(0,0,0,0.15)",
                                    cursor: extraBeds > 0 ? "pointer" : "not-allowed",
                                    background: "transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                  aria-label="Remove extra bed"
                                ><Minus size={13} /></button>
                                <div style={{
                                  minWidth: 38, padding: "0.35rem 0.6rem",
                                  textAlign: "center",
                                  color: extraBeds > 0 ? C.goldDeep : C.textDim,
                                  fontFamily: "'Cormorant Garamond', serif",
                                  fontSize: "1.05rem", fontWeight: 600,
                                }}>{extraBeds}</div>
                                <button
                                  onClick={() => setExtraBeds(r.id, +1)}
                                  disabled={extraBeds >= ebCap}
                                  style={{
                                    width: 32, color: extraBeds < ebCap ? C.goldDeep : "rgba(0,0,0,0.3)",
                                    borderInlineStart: "1px solid rgba(0,0,0,0.15)",
                                    cursor: extraBeds < ebCap ? "pointer" : "not-allowed",
                                    background: "transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                  aria-label="Add extra bed"
                                ><Plus size={13} /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.bgDeep, marginBottom: 8 }}>{t("booking.addToYourStay")}</h4>
                  {activeExtras.length === 0 ? (
                    <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.85rem" }}>
                      No extras configured at the moment — your suite already includes our standard amenities.
                    </p>
                  ) : activeExtras.map((extra) => (
                    <label key={extra.id} className="flex items-start gap-4 p-4 cursor-pointer transition-colors"
                      style={{ border: `1px solid ${data.addOns[extra.id] ? C.gold : "rgba(0,0,0,0.1)"}`, backgroundColor: data.addOns[extra.id] ? "rgba(201,169,97,0.06)" : C.cream }}>
                      <input type="checkbox" checked={!!data.addOns[extra.id]} onChange={(e) => setData({ ...data, addOns: { ...data.addOns, [extra.id]: e.target.checked } })} className="mt-1.5" />
                      <Icon name={extra.icon} size={22} style={{ color: C.goldDeep, marginTop: 2 }} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: C.bgDeep, fontWeight: 500 }}>{extra.title}</span>
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.82rem", color: C.goldDeep, fontWeight: 600 }}>{priceLabelFor(extra)}</span>
                        </div>
                        <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.78rem", marginTop: 2 }}>{extra.note}</div>
                      </div>
                    </label>
                  ))}
                  <Field label={t("booking.notesLabel")} dark={false}>
                    <textarea
                      value={data.notes}
                      onChange={(e) => setData({ ...data, notes: e.target.value })}
                      placeholder={t("booking.notesPh")}
                      rows={3}
                      className="w-full outline-none"
                      style={{ backgroundColor: "transparent", border: `1px solid rgba(0,0,0,0.15)`, padding: "0.7rem 0.85rem", fontSize: "0.9rem", fontFamily: "'Manrope', sans-serif", color: C.bgDeep, resize: "none" }}
                    />
                  </Field>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  {/* Top-of-form summary error — only renders when the
                      operator clicked Confirm with missing required
                      fields, so it doesn't nag a fresh form. */}
                  {confirmError && (
                    <div
                      className="p-3 flex items-start gap-2"
                      role="alert"
                      style={{
                        backgroundColor: `${C.danger || "#9A3A30"}10`,
                        border: `1px solid ${C.danger || "#9A3A30"}45`,
                        color: C.bgDeep, fontFamily: "'Manrope', sans-serif",
                        fontSize: "0.78rem", lineHeight: 1.55,
                      }}
                    >
                      <span style={{ color: C.danger || "#9A3A30", fontWeight: 700 }}>!</span>
                      <span>{confirmError}</span>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={<>{t("booking.fields.name")} <RequiredMark /></>} dark={false}>
                      <Input
                        dark={false}
                        value={data.name}
                        onChange={(v) => setData({ ...data, name: v })}
                        invalid={fieldErr.name}
                      />
                    </Field>
                    <Field label={<>{t("booking.fields.country")} <RequiredMark /></>} dark={false}>
                      <div style={{
                        outline: fieldErr.country ? `1px solid ${C.danger}` : "none",
                        outlineOffset: -1,
                      }}>
                      <CountrySelect
                        value={data.country}
                        onChange={(code, country) => {
                          // Auto-sync the phone country code when the
                          // operator picks a country. We preserve the
                          // user-typed national digits and only swap
                          // the dial-code prefix, so a half-typed phone
                          // doesn't get clobbered.
                          setData((d) => {
                            const { national } = parsePhone(d.phone);
                            return {
                              ...d,
                              country: code,
                              phone: `${country.dial} ${national}`.trim(),
                            };
                          });
                        }}
                      />
                      </div>
                    </Field>
                  </div>
                  <Field label={<>{t("booking.fields.email")} <RequiredMark /></>} dark={false}>
                    <Input
                      dark={false}
                      type="email"
                      value={data.email}
                      onChange={(v) => setData({ ...data, email: v })}
                      invalid={fieldErr.email}
                    />
                  </Field>
                  <Field label={<>{t("booking.fields.phone")} <RequiredMark /></>} dark={false}>
                    <div style={{
                      outline: fieldErr.phone ? `1px solid ${C.danger}` : "none",
                      outlineOffset: -1,
                    }}>
                      <PhoneInput
                        value={data.phone}
                        onChange={(v) => setData({ ...data, phone: v })}
                        defaultCountry={data.country || DEFAULT_COUNTRY_CODE}
                      />
                    </div>
                  </Field>

                  {/* Payment timing — three flavours:
                        • Pay on arrival without a card (default) — booking
                          is non-guaranteed and released at 3pm on arrival
                          day if the guest hasn't checked in.
                        • Pay on arrival WITH a card — held all day; card
                          on file as guarantee against late cancel / no-show.
                        • Pay now — card charged immediately at booking. */}
                  <div className="pt-4 mt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                    <div className="flex items-center gap-2 mb-3" style={{ color: C.bgDeep, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem" }}>
                      <Lock size={14} style={{ color: C.goldDeep }} /> Payment
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 mb-3">
                      <PaymentChoice
                        active={data.paymentTiming === "later"}
                        title="Pay on arrival"
                        hint="Card optional. Without one, booking is non-guaranteed and held until 3pm on arrival day."
                        onClick={() => setData((d) => ({ ...d, paymentTiming: "later" }))}
                      />
                      <PaymentChoice
                        active={data.paymentTiming === "now"}
                        title="Pay now"
                        badge={`Save ${PAY_NOW_DISCOUNT_PCT}%`}
                        hint={`${PAY_NOW_DISCOUNT_PCT}% off the stay in exchange for non-refundable terms. Card charged immediately.`}
                        onClick={() => setData((d) => ({ ...d, paymentTiming: "now" }))}
                      />
                    </div>

                    {/* Pay-on-arrival branch: explicit guarantee toggle.
                        Default is "non-guaranteed" so the form stays
                        empty and the guest can confirm without a card.
                        Toggling it ON reveals the card form below. */}
                    {data.paymentTiming === "later" && (
                      <>
                        <label
                          className="flex items-start gap-3 p-3 mb-3"
                          style={{
                            backgroundColor: data.guaranteeMode === "card" ? `${C.gold}14` : "rgba(0,0,0,0.02)",
                            border: `1px solid ${data.guaranteeMode === "card" ? C.gold : "rgba(0,0,0,0.12)"}`,
                            cursor: "pointer", fontFamily: "'Manrope', sans-serif",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={data.guaranteeMode === "card"}
                            onChange={(e) => setData((d) => ({ ...d, guaranteeMode: e.target.checked ? "card" : "none" }))}
                            style={{ marginTop: 4, flexShrink: 0 }}
                          />
                          <div>
                            <div style={{ color: C.bgDeep, fontWeight: 700, fontSize: "0.86rem" }}>
                              Hold my room with a card
                            </div>
                            <div style={{ color: C.textDim, fontSize: "0.78rem", lineHeight: 1.55, marginTop: 2 }}>
                              Recommended for late arrivals. The room is held all day — you're only charged if you cancel after the deadline or no-show. Card details auto-purge {CARD_VAULT_RETENTION_DAYS} days after the stay.
                            </div>
                          </div>
                        </label>

                        {/* Non-guaranteed banner — gentle warn-yellow to
                            make the trade-off clear without alarm. */}
                        {data.guaranteeMode !== "card" && (
                          <div
                            className="p-3 flex items-start gap-2 mb-3"
                            style={{
                              backgroundColor: "rgba(184,133,46,0.08)",
                              border: "1px solid rgba(184,133,46,0.45)",
                              color: C.bgDeep, fontFamily: "'Manrope', sans-serif",
                              fontSize: "0.78rem", lineHeight: 1.55,
                            }}
                          >
                            <Lock size={12} style={{ color: C.warn || "#B8852E", marginTop: 3, flexShrink: 0 }} />
                            <span>
                              <strong>Non-guaranteed booking.</strong> No card on file — your room is held until <strong>3pm</strong> on the arrival day. After that, we may release it to walk-in guests if you haven't checked in. To hold the room all day, tick "Hold my room with a card" above.
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Card form — required for Pay-now, optional for
                        Pay-on-arrival (only shown when guarantee toggle
                        is ticked). The CVC is captured but never stored
                        on the booking record. */}
                    {(data.paymentTiming === "now" || (data.paymentTiming === "later" && data.guaranteeMode === "card")) && (
                      <div className="p-3 mt-2" style={{ backgroundColor: "rgba(201,169,97,0.06)", border: `1px dashed ${C.gold}` }}>
                        <div className="flex items-start gap-2 mb-3" style={{ color: C.bgDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", lineHeight: 1.55 }}>
                          <Lock size={12} style={{ color: C.goldDeep, marginTop: 3, flexShrink: 0 }} />
                          <span>
                            {data.paymentTiming === "later"
                              ? <>Card held on file as guarantee. Charged only if you cancel late or no-show. The card details auto-purge {CARD_VAULT_RETENTION_DAYS} days after booking and are visible only to authorised property managers.</>
                              : <>Charged immediately. A receipt is emailed to your address. The card details auto-purge {CARD_VAULT_RETENTION_DAYS} days after the stay and are visible only to authorised property managers.</>}
                          </span>
                        </div>

                        {/* Non-refundable terms — only when Pay-now is
                            active. Acknowledgement is implicit via the
                            checkbox so the guest can't proceed without
                            seeing what they're agreeing to. */}
                        {data.paymentTiming === "now" && (
                          <div
                            className="p-3 mb-3"
                            style={{
                              backgroundColor: `${C.warn || "#B8852E"}10`,
                              border: `1px solid ${C.warn || "#B8852E"}45`,
                              fontFamily: "'Manrope', sans-serif",
                              fontSize: "0.78rem", lineHeight: 1.6, color: C.bgDeep,
                            }}
                          >
                            <div style={{
                              color: C.warn || "#B8852E",
                              fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase",
                              fontWeight: 700, marginBottom: 6,
                            }}>
                              Non-refundable rate · Save {PAY_NOW_DISCOUNT_PCT}%
                            </div>
                            <ul style={{ paddingInlineStart: 18, listStyle: "disc", margin: 0 }}>
                              <li>The full stay is charged immediately and is <strong>non-refundable</strong>.</li>
                              <li>No refunds for cancellations, modifications, no-shows, or early check-out.</li>
                              <li>Date or suite changes are not permitted on this rate.</li>
                              <li>If you may need flexibility, choose <em>Pay on arrival</em> instead.</li>
                            </ul>
                          </div>
                        )}
                        <Field label={t("booking.fields.cardName")} dark={false}><Input dark={false} value={data.cardName} onChange={(v) => setData({ ...data, cardName: v })} /></Field>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <div className="col-span-3"><Field label={t("booking.fields.cardNum")} dark={false}><Input dark={false} placeholder="•••• •••• •••• ••••" value={data.cardNum} onChange={(v) => setData({ ...data, cardNum: v })} /></Field></div>
                          <Field label={t("booking.fields.exp")} dark={false}><Input dark={false} placeholder="MM/YY" value={data.cardExp} onChange={(v) => setData({ ...data, cardExp: v })} /></Field>
                          <Field label={t("booking.fields.cvc")} dark={false}><Input dark={false} placeholder="•••" value={data.cardCvc} onChange={(v) => setData({ ...data, cardCvc: v })} /></Field>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center mb-6" style={{ width: 76, height: 76, borderRadius: "50%", backgroundColor: "rgba(127,169,112,0.15)", border: `1px solid ${C.success}` }}>
                    <Check size={36} style={{ color: C.success }} strokeWidth={2} />
                  </div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.65rem", letterSpacing: "0.3em", textTransform: "uppercase", color: C.goldDeep, fontWeight: 600 }}>
                    {t("booking.confirmedRef")}
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.8rem", color: C.bgDeep, fontWeight: 500, letterSpacing: "0.04em", marginTop: 6, direction: "ltr" }}>
                    {data.confirmCode}
                  </div>
                  <p className="mt-4 max-w-md mx-auto" style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.92rem", lineHeight: 1.7 }}>
                    {t("booking.confirmedBody1")} <strong style={{ color: C.bgDeep }}>{data.email || t("booking.fields.email")}</strong>
                    {t("booking.confirmedBody2")} <strong style={{ color: C.bgDeep }}>{fmtDate(data.checkIn, lang)}</strong>.
                  </p>
                  <div className="mt-8 inline-flex flex-wrap justify-center gap-3">
                    <GoldBtn outline onClick={onClose}>{t("common.close")}</GoldBtn>
                    <GoldBtn onClick={onClose}>{t("booking.addToCalendar")}</GoldBtn>
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-1 p-7" style={{ backgroundColor: C.bgElev, color: C.cream }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>
                {t("booking.summaryLabel")}
              </div>
              <div className="mt-4 pb-4" style={{ borderBottom: `1px solid ${C.border}` }}>
                <img src={leadRoom.image} alt="" style={{ width: "100%", height: 120, objectFit: "cover", marginBottom: 12 }} />
                {roomLines.length === 0 ? (
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 500, color: C.textMuted, fontStyle: "italic" }}>
                    Select your suite{partySize > 1 ? "s" : ""}
                  </div>
                ) : roomLines.length === 1 ? (
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 500 }}>
                    {t(`rooms.${roomLines[0].room.id}.name`)}
                    {roomLines[0].qty > 1 && (
                      <span style={{ color: C.gold, fontSize: "1rem", marginInlineStart: 8 }}>× {roomLines[0].qty}</span>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 500 }}>
                      {totalRooms} suites
                    </div>
                    <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.74rem", color: C.textMuted, marginTop: 2 }}>
                      {roomLines.map((l) => `${l.qty} × ${t(`rooms.${l.room.id}.short`) || l.room.id}`).join(" · ")}
                    </div>
                  </div>
                )}
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: C.textMuted, marginTop: 4 }}>
                  {fmtDate(data.checkIn, lang)} → {fmtDate(data.checkOut, lang)} · {nights} {nights === 1 ? t("common.night") : t("common.nights")}
                </div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", color: C.textMuted, marginTop: 2 }}>
                  {data.adults} {data.adults === 1 ? t("common.adult") : t("common.adults")}
                  {data.children ? `, ${data.children} ${data.children === 1 ? t("common.child") : t("common.children")}` : ""}
                  {totalExtraBeds > 0 ? `, ${totalExtraBeds} extra bed${totalExtraBeds === 1 ? "" : "s"}` : ""}
                </div>
              </div>

              <div className="space-y-2 mt-4" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem" }}>
                {pkg ? (
                  <>
                    <div className="flex items-center gap-1.5" style={{ color: C.gold, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
                      <Tag size={10} /> Offer applied
                    </div>
                    {pkgMode === "per-night" ? (
                      <div className="flex justify-between">
                        <span style={{ color: C.cream, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.05rem" }}>
                          {pkgTitle}
                          <span style={{ color: C.textMuted, fontStyle: "normal", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginInlineStart: 6 }}>
                            {t("common.bhd")} {pkgRoomPrice.price} × {nights}n
                          </span>
                        </span>
                        <span>{t("common.bhd")} {pkgCharge}</span>
                      </div>
                    ) : pkgMode === "first-night" ? (
                      <>
                        <div className="flex justify-between">
                          <span style={{ color: C.cream, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.05rem" }}>
                            {pkgTitle}
                            <span style={{ color: C.textMuted, fontStyle: "normal", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginInlineStart: 6 }}>
                              1st night
                            </span>
                          </span>
                          <span>{t("common.bhd")} {pkgFirstNight}</span>
                        </div>
                        {nights > 1 && (
                          <div className="flex justify-between" style={{ color: C.textMuted, fontSize: "0.82rem" }}>
                            <span>+ {nights - 1} more night{nights - 1 === 1 ? "" : "s"} at suite rate</span>
                            <span>{t("common.bhd")} {pkgRackNights}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex justify-between">
                        <span style={{ color: C.cream, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.05rem" }}>
                          {pkgTitle}
                          <span style={{ color: C.textMuted, fontStyle: "normal", fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginInlineStart: 6 }}>
                            full stay
                          </span>
                        </span>
                        <span>{t("common.bhd")} {pkgCharge}</span>
                      </div>
                    )}
                    {pkgSaving > 0 && (
                      <div className="flex justify-between" style={{ color: C.goldDeep, fontSize: "0.78rem" }}>
                        <span>You save</span>
                        <span>− {t("common.bhd")} {pkgSaving}</span>
                      </div>
                    )}
                    {roomLines.length > 0 && (
                      <div style={{ color: C.textMuted, fontSize: "0.74rem", marginTop: 2 }}>
                        Booked against {roomLines.map((l) => `${t(`rooms.${l.room.id}.short`) || l.room.id}${l.qty > 1 ? ` × ${l.qty}` : ""}`).join(" · ")}
                      </div>
                    )}
                  </>
                ) : roomLines.length === 0 ? (
                  <div className="flex justify-between" style={{ color: C.textMuted, fontStyle: "italic" }}>
                    <span>{t("booking.suiteLine")}</span><span>—</span>
                  </div>
                ) : (
                  roomLines.map((l) => (
                    <React.Fragment key={l.room.id}>
                      <div className="flex justify-between">
                        <span style={{ color: C.textMuted }}>
                          {t(`rooms.${l.room.id}.short`) || l.room.id}{l.qty > 1 ? ` × ${l.qty}` : ""} · {nights}n
                        </span>
                        <span>{t("common.bhd")} {l.roomRev}</span>
                      </div>
                      {l.extraBeds > 0 && (
                        <div className="flex justify-between" style={{ color: C.goldDeep, fontSize: "0.8rem" }}>
                          <span>+ {l.extraBeds} extra bed{l.extraBeds === 1 ? "" : "s"} · {nights}n</span>
                          <span>{t("common.bhd")} {l.extraBedRev}</span>
                        </div>
                      )}
                    </React.Fragment>
                  ))
                )}
                {addOnLines.map((line) => (
                  <div key={line.id} className="flex justify-between"><span style={{ color: C.textMuted }}>{line.title}</span><span>{t("common.bhd")} {line.total}</span></div>
                ))}
                {memberDiscount > 0 && (
                  <div className="flex justify-between" style={{ color: C.gold }}>
                    <span>
                      {(memberTier || "silver").charAt(0).toUpperCase() + (memberTier || "silver").slice(1)} member · {memberPct}% off
                    </span>
                    <span>− {t("common.bhd")} {memberDiscount}</span>
                  </div>
                )}
                {payNowDiscount > 0 && (
                  <div className="flex justify-between" style={{ color: C.success || "#16A34A" }}>
                    <span>Pay-now · {PAY_NOW_DISCOUNT_PCT}% off (non-refundable)</span>
                    <span>− {t("common.bhd")} {payNowDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}><span style={{ color: C.textMuted }}>{t("booking.taxLine")}</span><span>{t("common.bhd")} {tax}</span></div>
                <div className="flex justify-between pt-3 mt-2" style={{ borderTop: `1px solid ${C.border}`, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.gold }}>
                  <span>{t("booking.total")}</span><span>{t("common.bhd")} {total}</span>
                </div>

                {/* Guarantee status — shown when the operator gets to step
                    4 (i.e. has chosen the payment timing). Helps the guest
                    confirm their hold is in place (or that it isn't). */}
                {step >= 4 && (
                  <div className="pt-3 mt-2" style={{
                    borderTop: `1px solid ${C.border}`,
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "0.74rem", color: C.textMuted, lineHeight: 1.6,
                  }}>
                    {data.paymentTiming === "now" ? (
                      <span>
                        <Lock size={10} style={{ display: "inline", marginInlineEnd: 6, color: C.success || "#16A34A", verticalAlign: -1 }} />
                        Guaranteed · charged at booking
                      </span>
                    ) : data.guaranteeMode === "card" ? (
                      <span>
                        <Lock size={10} style={{ display: "inline", marginInlineEnd: 6, color: C.success || "#16A34A", verticalAlign: -1 }} />
                        Guaranteed · card on file as hold
                      </span>
                    ) : (
                      <span style={{ color: C.warn || "#B8852E" }}>
                        <Lock size={10} style={{ display: "inline", marginInlineEnd: 6, verticalAlign: -1 }} />
                        Non-guaranteed · room held until 3pm on {fmtDate(data.checkIn, lang)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {step < 5 && (
                <div className="mt-7 flex flex-col gap-2">
                  {step === 4 ? (
                    <GoldBtn onClick={confirm} full>{t("booking.confirmCta")}</GoldBtn>
                  ) : step === 2 ? (
                    <GoldBtn onClick={next} full disabled={!canAdvanceFromStep2}>
                      {totalRooms === 0
                        ? "Pick a suite to continue"
                        : totalCapacity < partySize
                          ? "Suite too small for the party"
                          : adultsCapacity < (Number(data.adults) || 0)
                            ? "Not enough adult capacity"
                            : childrenCapacity < (Number(data.children) || 0)
                              ? "Not enough child capacity"
                              : <>{t("common.continue")} <ArrowRight size={14} /></>}
                    </GoldBtn>
                  ) : step === 1 ? (
                    <GoldBtn onClick={next} full disabled={!canAdvanceFromStep1}>
                      {canAdvanceFromStep1
                        ? <>{t("common.continue")} <ArrowRight size={14} /></>
                        : "Pick valid dates to continue"}
                    </GoldBtn>
                  ) : (
                    <GoldBtn onClick={next} full>{t("common.continue")} <ArrowRight size={14} /></GoldBtn>
                  )}
                  {step > 1 && (
                    <button onClick={back} className="text-center py-2" style={{ fontFamily: "'Manrope', sans-serif", color: C.textMuted, fontSize: "0.78rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                      ← {t("common.goBack")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tiny red asterisk used next to required-field labels in step 4.
function RequiredMark() {
  return (
    <span aria-hidden="true" style={{ color: C.danger || "#9A3A30", marginInlineStart: 2 }}>*</span>
  );
}

// ---------------------------------------------------------------------------
// PaymentChoice — chip-style toggle between Pay-now and Pay-on-arrival.
// Used in step 4. Renders a tinted-fill card when active, a neutral
// outline otherwise, with explanation text underneath the title.
// ---------------------------------------------------------------------------
function PaymentChoice({ active, title, hint, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-start p-3 relative"
      style={{
        backgroundColor: active ? `${C.gold}1A` : "rgba(0,0,0,0.02)",
        border: `1.5px solid ${active ? C.gold : "rgba(0,0,0,0.12)"}`,
        cursor: "pointer", fontFamily: "'Manrope', sans-serif",
      }}
    >
      {badge && (
        <span style={{
          position: "absolute", top: -10, insetInlineEnd: 12,
          backgroundColor: C.success || "#16A34A",
          color: "#FFFFFF",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase",
          fontWeight: 700,
          padding: "3px 9px",
        }}>{badge}</span>
      )}
      <div className="flex items-center gap-2">
        <span style={{
          width: 14, height: 14, borderRadius: "50%",
          border: `2px solid ${active ? C.gold : "rgba(0,0,0,0.25)"}`,
          backgroundColor: active ? C.gold : "transparent",
          flexShrink: 0,
        }} />
        <span style={{ color: active ? C.goldDeep : C.bgDeep, fontSize: "0.85rem", fontWeight: 700 }}>
          {title}
        </span>
      </div>
      <div style={{ color: C.textDim, fontSize: "0.74rem", marginTop: 4, lineHeight: 1.5 }}>
        {hint}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// OfferBanner — header chip that surfaces an applied offer at the top of
// step 1 / step 2. Switches to a warn colour when the current selection
// breaks one of the offer's conditions and lists the specific reasons so
// the guest can adjust.
// ---------------------------------------------------------------------------
function OfferBanner({ pkg, pkgTitle, headlinePrice, conditions, eligibility, onRemove, t }) {
  const ok = !eligibility || eligibility.ok;
  const accent = pkg.color || C.gold;
  const bg = ok ? `${accent}14` : "rgba(184,133,46,0.10)";
  const bd = ok ? accent : "rgba(184,133,46,0.45)";
  const Ic = ok ? Sparkles : AlertTriangle;
  const ic = ok ? accent : C.warn;
  const priceSuffix = packagePriceSuffix(pkg);
  const headPrice  = headlinePrice?.price  ?? Number(pkg.price)  ?? 0;
  const headSaving = headlinePrice?.saving ?? Number(pkg.saving) ?? 0;

  return (
    <div className="p-3 flex items-start gap-3"
      style={{
        backgroundColor: bg, border: `1px solid ${bd}`,
        borderInlineStart: `4px solid ${accent}`,
        fontFamily: "'Manrope', sans-serif",
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}><Ic size={16} style={{ color: ic }} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: accent, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            <Tag size={10} style={{ display: "inline", marginInlineEnd: 4 }} /> Offer applied
          </span>
          <span style={{ color: C.bgDeep, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", fontStyle: "italic", lineHeight: 1, fontWeight: 600 }}>
            {pkgTitle}
          </span>
          <span style={{ color: accent, fontSize: "0.78rem", fontWeight: 700, fontFamily: "'Cormorant Garamond', serif" }}>
            BHD {headPrice}
          </span>
          <span style={{ color: C.textDim, fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.04em" }}>
            {priceSuffix}
          </span>
          {headSaving > 0 && (
            <span style={{ color: C.success, fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
              Save BHD {headSaving}
            </span>
          )}
        </div>
        {conditions && (
          <div style={{ color: C.textDim, fontSize: "0.78rem", marginTop: 4, lineHeight: 1.5 }}>
            {conditions}
          </div>
        )}
        {!ok && eligibility?.failures?.length > 0 && (
          <ul className="mt-2 space-y-1" style={{ color: C.warn, fontSize: "0.78rem", paddingInlineStart: 16, listStyle: "disc", lineHeight: 1.5 }}>
            {eligibility.failures.map((f, i) => (<li key={i}>{f}</li>))}
          </ul>
        )}
      </div>
      <button
        onClick={onRemove}
        title="Remove offer"
        style={{
          flexShrink: 0,
          color: C.textDim, padding: "0.25rem 0.5rem",
          fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
          letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
          background: "transparent", border: `1px solid rgba(0,0,0,0.18)`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = C.warn; e.currentTarget.style.borderColor = C.warn; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = C.textDim; e.currentTarget.style.borderColor = "rgba(0,0,0,0.18)"; }}
      >
        Remove
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EligibleOffersStrip — shown on step 2 when no offer is applied but the
// current selection qualifies for one or more active offers. One click
// applies the offer; pricing instantly recalculates.
// ---------------------------------------------------------------------------
function EligibleOffersStrip({ offers, onApply, t }) {
  return (
    <div className="p-3"
      style={{
        backgroundColor: "rgba(201,169,97,0.08)",
        border: `1px dashed ${C.gold}`,
        fontFamily: "'Manrope', sans-serif",
      }}
    >
      <div className="flex items-center gap-1.5" style={{ color: C.goldDeep, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
        <Sparkles size={11} /> Your selection qualifies for {offers.length === 1 ? "this offer" : "these offers"}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {offers.map((o) => {
          const title = t(`packages.${o.id}.title`) || o.title || o.id;
          const min = getPackageMinPrice(o);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onApply(o)}
              className="inline-flex items-center gap-2"
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "0.78rem", fontWeight: 600,
                color: C.bgDeep, backgroundColor: C.cream,
                border: `1px solid ${C.gold}`,
                padding: "0.4rem 0.75rem",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${C.gold}26`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.cream; }}
            >
              <Tag size={11} style={{ color: C.goldDeep }} />
              <span>{title}</span>
              <span style={{ color: C.goldDeep, fontWeight: 700 }}>From BHD {min.price}</span>
              <span style={{ color: C.textDim, fontSize: "0.66rem", fontWeight: 600 }}>
                {packagePriceSuffix(o)}
              </span>
              {min.saving > 0 && (
                <span style={{ color: C.success, fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginInlineStart: 2 }}>
                  Save up to {min.saving}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
