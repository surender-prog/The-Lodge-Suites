import { useEffect, useRef } from "react";
import { supabase, SUPABASE_CONFIGURED, hasSupabaseSession } from "./supabase.js";

// Tables that accept anon writes from public surfaces of the site.
//   bookings — homepage walk-up reservations
//   members  — LS Privilege self-join
// Everything else is staff-only; we skip the network call when not signed
// in to avoid noisy RLS rejection warnings.
const ANON_WRITABLE_TABLES = new Set(["bookings", "members"]);

// Single-fire warnings so the console doesn't fill up during anon
// browsing. Once a table reports "no session, skipping" we don't
// repeat that for the same table.
const skipWarnedFor = new Set();
function warnSkipOnce(table) {
  if (skipWarnedFor.has(table)) return;
  skipWarnedFor.add(table);
  // eslint-disable-next-line no-console
  console.info(`[${table}] persistence skipped — sign in to persist changes to this table.`);
}

// ─── Generic JSONB-entity sync helpers ────────────────────────────────────
//
// Phase 2 stores most slices in a tiny `(id, data jsonb)` table. The full
// React-shape object lives in the `data` column. These helpers make every
// slice in store.jsx use the same fetch / upsert / delete pattern:
//
//   • fetchAll(table)          → array<object>  | null  (null = not configured / failed)
//   • upsertRow(table, item)   → { ok, error?, skipped? }
//   • deleteRow(table, id)     → { ok, error?, skipped? }
//   • fetchSingleton(key)      → object | null
//   • upsertSingleton(key, v)  → { ok, error?, skipped? }
//   • bulkReplace(table, list) → { ok, count, error? }
//
// All of them short-circuit to a no-op when Supabase isn't configured, so
// the app keeps working in mock-only mode (e.g. in CI, in a fork without
// .env.local, or before the schema is applied).

/** Fetch every row from a JSONB-entity table, return raw `data` blobs. */
export async function fetchAll(table) {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("data, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[${table}] fetch failed:`, error.message);
      return null;
    }
    return (data || []).map((r) => r.data).filter(Boolean);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[${table}] fetch threw:`, err?.message || err);
    return null;
  }
}

/**
 * Upsert one entity. The item must have an `id` field — that becomes the
 * primary key on `public.<table>.id`, and the entire object goes into the
 * `data` column. Subsequent upserts replace `data` wholesale (which is
 * the React-state semantics our reducers already use).
 */
export async function upsertRow(table, item) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  if (!hasSupabaseSession() && !ANON_WRITABLE_TABLES.has(table)) {
    warnSkipOnce(table);
    return { ok: false, skipped: true, reason: "no auth" };
  }
  if (!item || item.id === undefined || item.id === null || item.id === "") {
    return { ok: false, error: "missing id" };
  }
  try {
    // Anon callers can only INSERT (no UPDATE) — even ON CONFLICT DO
    // NOTHING is rejected by Supabase RLS because the policy framework
    // checks the UPDATE branch at parse time. So for anon we use plain
    // .insert() and accept that duplicate-id collisions would error.
    // The flows that need anon writes (homepage booking, LS Privilege
    // join) always generate fresh ids so collisions don't happen.
    const isAuthed = hasSupabaseSession();
    const row = { id: String(item.id), data: item };
    const q = isAuthed
      ? supabase.from(table).upsert(row, { onConflict: "id" })
      : supabase.from(table).insert(row);
    const { error } = await q;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[${table}] write ${item.id} failed:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[${table}] write threw:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Delete a row by id. */
export async function deleteRow(table, id) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  if (id === undefined || id === null || id === "") return { ok: false, error: "missing id" };
  try {
    const { error } = await supabase.from(table).delete().eq("id", String(id));
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[${table}] delete ${id} failed:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[${table}] delete threw:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Sync the entire contents of a slice to a table. We compute the diff
 * against the current DB state and apply targeted upserts + deletes —
 * avoids the "delete-all-then-insert" pattern (which doesn't survive
 * RLS for anon users, and is wasteful for large tables).
 *
 * Strategy:
 *   1. Fetch current ids from the DB
 *   2. Upsert every row in `list` (insert new, update existing)
 *   3. Delete rows whose ids are no longer in `list`
 *
 * For tables that allow anon insert but not anon delete (e.g.
 * `bookings` for walk-up reservations), the delete step silently fails
 * with no harm — the new rows still land via upsert.
 */
export async function bulkReplace(table, list) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  // For anon-writable tables, the targeted addX helpers in store.jsx
  // already fire a per-row insert. The bulk-replace pass would try to
  // re-insert all bundled mock rows + the new one, which fails for anon
  // (no UPDATE permission, so even ignoreDuplicates upserts get
  // rejected). Skip bulk for anon — the direct insert is the canonical
  // write path for walk-up bookings / member joins.
  if (!hasSupabaseSession()) {
    warnSkipOnce(table);
    return { ok: false, skipped: true, reason: "no auth (use upsertRow instead)" };
  }
  if (!Array.isArray(list)) return { ok: false, error: "list must be an array" };
  try {
    const rows = list
      .filter((it) => it && it.id !== undefined && it.id !== null && it.id !== "")
      .map((it) => ({ id: String(it.id), data: it }));
    const wantIds = new Set(rows.map((r) => r.id));

    // 1) Upsert every row (authenticated only — anon path is handled
    //    directly via upsertRow from the addX helpers).
    if (rows.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const ins = await supabase
          .from(table)
          .upsert(slice, { onConflict: "id" });
        if (ins.error) {
          // eslint-disable-next-line no-console
          console.warn(`[${table}] bulkReplace upsert failed:`, ins.error.message);
          return { ok: false, error: ins.error.message };
        }
      }
    }

    // 2) Delete stale rows — only for authenticated callers (anon usually
    //    can't delete; we'd just fail silently and leave the row, which
    //    is preferable to a hard error). We skip the delete for anon.
    if (hasSupabaseSession()) {
      const existing = await supabase.from(table).select("id");
      if (!existing.error && Array.isArray(existing.data)) {
        const stale = existing.data.map((r) => r.id).filter((id) => !wantIds.has(id));
        if (stale.length > 0) {
          const del = await supabase.from(table).delete().in("id", stale);
          if (del.error) {
            // eslint-disable-next-line no-console
            console.warn(`[${table}] bulkReplace delete-stale failed:`, del.error.message);
            // Not fatal — upserts already landed
          }
        }
      }
    }

    return { ok: true, count: rows.length };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[${table}] bulkReplace threw:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Singleton helpers ────────────────────────────────────────────────────
// Each config blob lives as a single row in `singletons` keyed by name.
// Use these for hotelInfo, smtpConfig, siteContent, loyalty, tiers, tax,
// activeTaxPatternId — anything where there's exactly one of it per app.

export async function fetchSingleton(key) {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    const { data, error } = await supabase
      .from("singletons")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[singletons] fetch ${key} failed:`, error.message);
      return null;
    }
    return data?.value ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[singletons] fetch ${key} threw:`, err?.message || err);
    return null;
  }
}

export async function upsertSingleton(key, value) {
  if (!SUPABASE_CONFIGURED) return { ok: false, skipped: true };
  if (!hasSupabaseSession()) {
    warnSkipOnce(`singletons/${key}`);
    return { ok: false, skipped: true, reason: "no auth" };
  }
  try {
    const { error } = await supabase
      .from("singletons")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[singletons] upsert ${key} failed:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[singletons] upsert ${key} threw:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── React hooks — slice / singleton auto-sync ────────────────────────────
//
// useSlicePersistence(table, value, hydratedRef)
//   Watches a slice's value. After hydration completes (hydratedRef.current
//   becomes true), every change is debounced 600 ms and then bulkReplaced
//   into the matching JSONB-entity table. Effectively turns "any setSlice
//   call" into "eventually persist the new shape".
//
// useSingletonPersistence(key, value, hydratedRef)
//   Same idea for singletons. The whole `value` object becomes
//   singletons.value where singletons.key = key.
//
// The 600ms debounce groups burst edits (slider drags, rapid button
// clicks) into a single network call. For the testing phase this is fast
// enough that the operator never feels staleness, while keeping the
// request rate sensible.

function shallowDiff(prev, next) {
  // Quick equality so we don't fire a network call when the slice is
  // re-rendered without actually changing. References-only — JSONB diffs
  // are best done server-side anyway.
  if (prev === next) return false;
  if (Array.isArray(prev) && Array.isArray(next) && prev.length !== next.length) return true;
  return true;
}

export function useSlicePersistence(table, value, hydratedRef) {
  const timeoutRef = useRef(null);
  const lastRef    = useRef(value);
  useEffect(() => {
    if (!hydratedRef?.current) return;
    if (!shallowDiff(lastRef.current, value)) return;
    lastRef.current = value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      bulkReplace(table, Array.isArray(value) ? value : []);
    }, 600);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

export function useSingletonPersistence(key, value, hydratedRef) {
  const timeoutRef = useRef(null);
  const lastRef    = useRef(value);
  useEffect(() => {
    if (!hydratedRef?.current) return;
    if (lastRef.current === value) return;
    lastRef.current = value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      upsertSingleton(key, value);
    }, 600);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
