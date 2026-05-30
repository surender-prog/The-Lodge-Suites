import { supabase, SUPABASE_CONFIGURED } from "./supabase.js";
import { ROOMS as INITIAL_ROOMS } from "../data/rooms.js";

// ─── Room label resolver ─────────────────────────────────────────────────
// Single source of truth for "what should I render for this room type?".
// The hierarchy is:
//   1. The active-language i18n string  (rooms.<id>.name)
//   2. The operator-set publicName on the room row (DB column added in 017)
//   3. A humanised version of the id  ("superioronebedroom" → "Superior
//      One Bedroom") so even brand-new types without a translation OR a
//      saved name render readably until the operator fills one in.
//
// Pass the active translator (from useT()) and the room object. The id
// string fallback is acceptable when you only have the id available
// (e.g. legacy code paths) — humanise it from the slug.

function humaniseRoomId(id) {
  if (!id) return "";
  // Split camelCase + snake/kebab + digit-letter boundaries, then title-case.
  const spaced = String(id)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Walk every night in [checkIn, checkOut) and surface the first
// blocker that would prevent a gift-card booking from being accepted:
//   * stop-sale flag in the calendar overrides for this room/date
//   * any active event-supplement window that covers this date
// Returns null when the window is clear, otherwise an object the UI
// can show as an inline warning + reason. Pure — no React deps.
export function giftCardBookingBlockers({ roomId, checkIn, checkOut, calendar, eventSupplements }) {
  if (!roomId || !checkIn || !checkOut) return null;
  const start = new Date(checkIn);
  const end   = new Date(checkOut);
  if (isNaN(start) || isNaN(end) || end <= start) return null;
  const stopSaleHits = [];
  const eventHits    = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const cell = calendar?.[`${roomId}|${iso}`];
    if (cell?.stopSale) stopSaleHits.push({ date: iso, reason: cell.reason || "Stop-sale" });
    (eventSupplements || []).forEach((evt) => {
      if (!evt || evt.active === false) return;
      const f = new Date(evt.fromDate);
      const t = new Date(evt.toDate);
      if (isNaN(f) || isNaN(t)) return;
      if (d >= f && d <= t) {
        // Different surfaces label events with different field names —
        // `name` is the canonical one (used by eventSupplements seed),
        // but contracts attached to RFPs use `label`. Fall through both.
        eventHits.push({ date: iso, eventId: evt.id, label: evt.name || evt.label || "Event window" });
      }
    });
  }
  if (stopSaleHits.length === 0 && eventHits.length === 0) return null;
  return {
    stopSale: stopSaleHits,
    events:   eventHits,
    // De-duped one-line summary the caller can drop into a warning.
    summary: (() => {
      const parts = [];
      if (stopSaleHits.length) {
        const reasons = [...new Set(stopSaleHits.map((h) => h.reason))].slice(0, 3).join(", ");
        parts.push(`Stop-sale on ${stopSaleHits.length} night${stopSaleHits.length === 1 ? "" : "s"}${reasons ? ` (${reasons})` : ""}`);
      }
      if (eventHits.length) {
        const evtLabels = [...new Set(eventHits.map((h) => h.label))].slice(0, 3).join(", ");
        parts.push(`Event window: ${evtLabels}`);
      }
      return parts.join(" · ");
    })(),
  };
}

export function roomLabel(room, t) {
  if (!room && !arguments.length) return "";
  const id = typeof room === "string" ? room : room?.id;
  if (!id) return "";
  // Try i18n first. Translator returns the key itself when the path
  // doesn't resolve — detect that and treat as miss.
  const key = `rooms.${id}.name`;
  const fromI18n = typeof t === "function" ? t(key) : null;
  if (fromI18n && fromI18n !== key) return fromI18n;
  // Operator-set name (DB)
  const fromRow = typeof room === "object" ? room?.publicName : null;
  if (fromRow && String(fromRow).trim()) return String(fromRow).trim();
  // Last resort — humanise the slug
  return humaniseRoomId(id);
}

// One-line tagline for a room (the "Smart-functional living for the
// solo traveller or couple." subtext under each suite tile). Same
// resolution order as roomLabel:
//   i18n string → row.publicShort/short → synthesised "X m² · sleeps Y"
// so custom suites without an i18n entry still render a useful
// description instead of "rooms.superioronebedroom.short".
export function roomShort(room, t) {
  if (!room && !arguments.length) return "";
  const id = typeof room === "string" ? room : room?.id;
  if (!id) return "";
  const key = `rooms.${id}.short`;
  const fromI18n = typeof t === "function" ? t(key) : null;
  if (fromI18n && fromI18n !== key) return fromI18n;
  if (typeof room === "object") {
    const fromRow = room?.publicShort || room?.short;
    if (fromRow && String(fromRow).trim()) return String(fromRow).trim();
    // Synthesised fallback. Carries the same shape as the bundled
    // i18n strings so the layout doesn't reflow visually.
    const parts = [];
    if (room.sqm) parts.push(`${room.sqm} m²`);
    if (room.occupancy) parts.push(`sleeps up to ${room.occupancy}`);
    if (parts.length) return parts.join(" · ");
  }
  return "";
}

/**
 * Sort an array of rooms by price ascending. Pure; returns a new array
 * (does not mutate the input). Falls back to display_order then id when
 * prices tie or are missing so the order is deterministic even on a
 * fresh DB where every suite shares the seed rate. Use this anywhere
 * rooms are listed for selection (booking flow, gift-card upgrade
 * picker, public Rooms section, etc.) so customers always read the
 * catalogue cheapest-first.
 */
export function sortRoomsByPrice(rooms) {
  if (!Array.isArray(rooms)) return [];
  return [...rooms].sort((a, b) => {
    const pa = Number(a?.price);
    const pb = Number(b?.price);
    const va = Number.isFinite(pa) ? pa : Infinity;
    const vb = Number.isFinite(pb) ? pb : Infinity;
    if (va !== vb) return va - vb;
    const da = Number(a?.displayOrder) || 0;
    const db = Number(b?.displayOrder) || 0;
    if (da !== db) return da - db;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

// ─── Rooms slice ↔ Supabase ──────────────────────────────────────────────
//
// The DB stores room rows in snake_case (Postgres convention); the app's
// React state uses camelCase. These mappers keep that boundary clean:
//
//   dbRoomToClient(row)    — Supabase row → React-shape room
//   clientPatchToDb(patch) — React patch  → snake_case update payload
//
// A few client-only fields (currently just `image`) aren't yet stored in
// the DB. We merge them in from the matching INITIAL_ROOMS entry so the
// homepage cards keep their photography until the operator uploads real
// images via the admin (which will then write `image_url`).

/** Convert one Supabase row into the camelCase shape the app expects. */
export function dbRoomToClient(row) {
  const seed = INITIAL_ROOMS.find((r) => r.id === row.id);
  // Weekend rate falls back to the weekday rate when the column is null —
  // covers legacy tables on the old schema (pre-migration 005) and rows
  // that have been added but not yet had a weekend rate filled in.
  const weekdayPrice = Number(row.price);
  const weekendPrice = row.price_weekend != null
    ? Number(row.price_weekend)
    : weekdayPrice;
  return {
    id:                 row.id,
    // Operator-set public name. Falls back to whatever the bundled seed
    // calls itself so legacy rows (created before migration 017) still
    // have a readable label even before the operator opens the editor.
    publicName:         row.name || seed?.publicName || null,
    sqm:                row.sqm,
    occupancy:          row.occupancy,
    // The app expects defined values; DB stores nullable sub-caps that
    // mean "no further restriction" (i.e. fall back to occupancy).
    maxAdults:          row.max_adults   ?? row.occupancy,
    maxChildren:        row.max_children ?? row.occupancy,
    price:              weekdayPrice,
    priceWeekend:       weekendPrice,
    image:              row.image_url || seed?.image || null,
    popular:            !!row.popular,
    extraBedAvailable:  !!row.extra_bed_available,
    maxExtraBeds:       row.max_extra_beds || 0,
    extraBedFee:        Number(row.extra_bed_fee || 0),
    extraBedAdds:       row.extra_bed_adds || { adults: 0, children: 0 },
    // Meal plan catalogue per suite — see DEFAULT_MEAL_PLANS_FOR_ROOM
    // for the canonical shape. Falls back to the seeded defaults so
    // legacy rows (pre-migration 009) render with sensible values.
    mealPlans:          row.meal_plans || seed?.mealPlans || null,
    // Optional master cap on bookable units for this type. When null the
    // calendar / booking engine falls back to the active room_units count.
    // Useful when the hotel wants to hold inventory back (corporate-only,
    // owner blocks, walk-in stock) without removing physical rooms.
    sellLimit:          row.sell_limit != null ? Number(row.sell_limit) : null,
    // Per-night upgrade supplement charged when a gift card from a
    // lower-fee room is redeemed against this room. Stored on every
    // suite — the booking flow computes the differential as
    // max(0, target.fee - source.fee).
    giftCardUpgradeFeePerNight: Number(row.gift_card_upgrade_fee_per_night || 0),
    isActive:           row.is_active !== false,
    displayOrder:       row.display_order || 0,
  };
}

/** Convert a partial camelCase patch into a snake_case Supabase update. */
export function clientPatchToDb(patch) {
  const out = {};
  if (patch.publicName         !== undefined) out.name                 = patch.publicName;
  if (patch.sqm                !== undefined) out.sqm                  = patch.sqm;
  if (patch.occupancy          !== undefined) out.occupancy            = patch.occupancy;
  if (patch.maxAdults          !== undefined) out.max_adults           = patch.maxAdults;
  if (patch.maxChildren        !== undefined) out.max_children         = patch.maxChildren;
  if (patch.price              !== undefined) out.price                = patch.price;
  if (patch.priceWeekend       !== undefined) out.price_weekend        = patch.priceWeekend;
  if (patch.image              !== undefined) out.image_url            = patch.image;
  if (patch.popular            !== undefined) out.popular              = patch.popular;
  if (patch.extraBedAvailable  !== undefined) out.extra_bed_available  = patch.extraBedAvailable;
  if (patch.maxExtraBeds       !== undefined) out.max_extra_beds       = patch.maxExtraBeds;
  if (patch.extraBedFee        !== undefined) out.extra_bed_fee        = patch.extraBedFee;
  if (patch.extraBedAdds       !== undefined) out.extra_bed_adds       = patch.extraBedAdds;
  if (patch.mealPlans          !== undefined) out.meal_plans           = patch.mealPlans;
  if (patch.sellLimit          !== undefined) {
    // null = "no override, fall back to active unit count". Stored
    // exactly that way in DB so the constraint check stays readable.
    const v = patch.sellLimit;
    out.sell_limit = (v === null || v === "" || Number.isNaN(Number(v))) ? null : Number(v);
  }
  if (patch.giftCardUpgradeFeePerNight !== undefined) {
    const v = Number(patch.giftCardUpgradeFeePerNight);
    out.gift_card_upgrade_fee_per_night = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  if (patch.isActive           !== undefined) out.is_active            = patch.isActive;
  if (patch.displayOrder       !== undefined) out.display_order        = patch.displayOrder;
  return out;
}

// ─── Network helpers ──────────────────────────────────────────────────────
// These are designed to be cheap to call when Supabase isn't configured —
// they short-circuit and let the app stay on its bundled mock data.

/**
 * Fetch all rooms from Supabase. Returns:
 *   • null         — Supabase isn't configured (caller should keep mock data)
 *   • Array<Room>  — fresh rows in the app's camelCase shape
 *   • throws       — only on programmer error; network errors are logged
 *                    and the function returns null so the UI never crashes
 */
export async function fetchRooms() {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[rooms] fetch failed:", error.message);
      return null;
    }
    return (data || []).map(dbRoomToClient);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rooms] fetch threw:", err?.message || err);
    return null;
  }
}

/**
 * Persist a patch to a single room. Returns { ok, error, skipped } where
 * `skipped: true` means we couldn't even attempt — caller should treat
 * the optimistic local update as the source of truth.
 *
 * The caller is responsible for the optimistic local state update;
 * this function does not modify React state.
 */
export async function persistRoomPatch(id, patch) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  const dbPatch = clientPatchToDb(patch);
  if (Object.keys(dbPatch).length === 0) return { ok: true, skipped: true };
  try {
    const { error } = await supabase
      .from("rooms")
      .update(dbPatch)
      .eq("id", id);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[rooms] persist failed for", id, "—", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rooms] persist threw for", id, "—", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Insert a brand-new room type. Returns { ok, error, skipped }. The
 * `room` argument is the same camelCase shape we use everywhere else
 * (id, price, priceWeekend, occupancy, mealPlans, …) — we convert to
 * the snake_case row layout here.
 *
 * RLS: the staff-only INSERT policy on public.rooms means anon callers
 * silently no-op (returns skipped); store.jsx still updates the local
 * slice optimistically so the new type appears in the editor even
 * when offline.
 */
export async function persistRoomInsert(room) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  if (!room || !room.id) return { ok: false, error: "missing id" };
  const dbRow = {
    id: room.id,
    ...clientPatchToDb(room),
  };
  try {
    const { error } = await supabase.from("rooms").insert(dbRow);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[rooms] insert failed for", room.id, "—", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rooms] insert threw for", room.id, "—", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Upload a hero image for a room type to the public `rooms` Supabase
 * Storage bucket and return its public URL. Caller is responsible for
 * setting that URL on `room.image` via persistRoomPatch / addRoom.
 *
 *   uploadRoomImage(file, roomId) → { ok, url?, filename?, path?, error? }
 *
 * The path layout keeps every uploaded photo discoverable per room:
 *   rooms/<roomId>/hero-<timestamp>.<ext>
 *
 * Skips when Supabase isn't configured (offline / demo / CI).
 */
const ROOM_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (matches bucket policy)
const ROOM_IMAGE_ALLOWED   = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function uploadRoomImage(file, roomId) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  if (!file) return { ok: false, error: "no file" };
  if (!roomId) return { ok: false, error: "missing roomId" };
  if (file.size > ROOM_IMAGE_MAX_BYTES) {
    return { ok: false, error: `File too large. Max ${Math.round(ROOM_IMAGE_MAX_BYTES / 1024 / 1024)} MB.` };
  }
  if (file.type && !ROOM_IMAGE_ALLOWED.includes(file.type)) {
    return { ok: false, error: "Unsupported image type. Use JPEG, PNG, WebP, or AVIF." };
  }
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  const path = `${roomId}/hero-${Date.now()}${ext}`;
  try {
    const { error: uploadErr } = await supabase.storage
      .from("rooms")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (uploadErr) {
      // eslint-disable-next-line no-console
      console.warn("[rooms] image upload failed for", roomId, "—", uploadErr.message);
      return { ok: false, error: uploadErr.message };
    }
    const { data } = supabase.storage.from("rooms").getPublicUrl(path);
    return {
      ok: true,
      url: data?.publicUrl || null,
      filename: file.name,
      path,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rooms] image upload threw for", roomId, "—", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Delete a room type. Returns { ok, error, skipped }. The caller is
 * responsible for refusing the call when any room_units / bookings
 * still reference the type — there's no DB cascade on this table.
 */
export async function persistRoomRemove(id) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  if (!id) return { ok: false, error: "missing id" };
  try {
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[rooms] delete failed for", id, "—", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rooms] delete threw for", id, "—", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
