import { supabase, SUPABASE_CONFIGURED } from "./supabase.js";
import { ROOMS as INITIAL_ROOMS } from "../data/rooms.js";

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
    isActive:           row.is_active !== false,
    displayOrder:       row.display_order || 0,
  };
}

/** Convert a partial camelCase patch into a snake_case Supabase update. */
export function clientPatchToDb(patch) {
  const out = {};
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
