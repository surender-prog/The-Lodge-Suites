import { useEffect, useRef } from "react";
import { supabase, SUPABASE_CONFIGURED, hasSupabaseSession } from "./supabase.js";

// Tables that accept anon writes from public surfaces of the site.
//   bookings — homepage walk-up reservations
//   members  — LS Privilege self-join
//   messages — member / corporate / agent portal chat (no Supabase auth
//              session; insert-only via messages_anyone_insert RLS)
// Everything else is staff-only; we skip the network call when not signed
// in to avoid noisy RLS rejection warnings.
const ANON_WRITABLE_TABLES = new Set(["bookings", "members", "messages"]);

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

// Content-aware diff via JSON.stringify. We need this (not just reference
// equality) so that state updates produced by inbound realtime events —
// which always create a new array reference even when the payload is
// identical to what we already had — don't trigger an echo write back to
// Supabase. For the slice sizes we deal with (≤ a few hundred rows of
// small JSON objects) stringify is cheap and avoids per-field deep-equal.
function serialize(value) {
  try { return JSON.stringify(value); } catch { return null; }
}

// `hydrated` is a BOOLEAN piece of state (not a ref). Passing state means
// this effect re-evaluates when hydration flips true — which closes a
// race where fetchAll resolves AFTER the first value-change effect fires:
//
//   1. effect runs with value=initial, hydrated=false  → skipped
//   2. fetchAll resolves → setValue(dbRows). effect runs with hydrated
//      still false → skipped. lastSerialized stays null.
//   3. Promise.all().finally() flips hydrated → true. effect re-runs
//      with the latest value and now hydrated=true → records baseline.
//   4. Owner edits → effect runs → diff vs. baseline → WRITES.
//
// Before this fix `hydrated` was a ref, so step 3 never re-ran the
// effect and the owner's first edit was silently absorbed as the
// baseline — meaning their first save never reached the database.
export function useSlicePersistence(table, value, hydrated) {
  const timeoutRef         = useRef(null);
  const lastSerializedRef  = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    const next = serialize(value);
    if (next === null) return;          // value is non-serialisable; skip
    if (lastSerializedRef.current === null) {
      // First post-hydration observation: record the baseline silently
      // so we don't immediately echo whatever fetchAll just loaded back
      // into the DB. Real edits (or inbound realtime updates) bump the
      // serialised content past this baseline on the next pass.
      lastSerializedRef.current = next;
      return;
    }
    if (next === lastSerializedRef.current) return;  // unchanged content
    lastSerializedRef.current = next;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      bulkReplace(table, Array.isArray(value) ? value : []);
    }, 600);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, hydrated]);
}

// ─── Real-time slice sync ─────────────────────────────────────────────────
//
// useRealtimeSlice(table, setValue, hydratedRef, options?)
//
// Subscribes to postgres_changes on a JSONB-entity table (id text PK +
// data jsonb shape). Every INSERT / UPDATE / DELETE event from Supabase
// is folded into the local React state via `setValue`. Together with
// the content-aware `useSlicePersistence` above this gives a tight
// "any tab edits → all tabs see it" loop without an echo storm:
//
//   Tab A: addAdminUser()  → local setAdminUsers([...prev, x])
//                           → useSlicePersistence fires bulkReplace
//                           → Supabase INSERT lands in admin_users
//                           → realtime broadcasts INSERT to all tabs
//   Tab A: realtime callback updates state with identical content
//                           → useSlicePersistence sees stringify match,
//                             skips a redundant write
//   Tab B: realtime callback updates state with new content
//                           → useSlicePersistence first sees new content,
//                             schedules a write — but the JSON in DB is
//                             already correct, so bulkReplace upserts the
//                             same rows. Supabase MAY emit a no-op
//                             notification; even if it does, the next
//                             pass sees no content change and bails.
//
// Caveat: the realtime payload's `data` column is JSON — we map back to
// the slice's React shape by reading `row.data`. The id key collisions
// across tabs are inherently impossible because Supabase enforces the
// primary key on the server.
//
// Options:
//   • onConflict(localItem, incoming) — optional resolver for the rare
//     case where the local item has been edited but not yet persisted.
//     Defaults to "remote wins" which is the right call for shared
//     operational data (admin users, calendar overrides, bookings…).
//
// Returns nothing. The channel is torn down automatically on unmount.
export function useRealtimeSlice(table, setValue, hydrated, options = {}) {
  const { onConflict } = options;
  // Mirror the latest `hydrated` boolean into a ref so the postgres
  // callback can read it without re-subscribing on every flip. The
  // channel lifecycle stays tied to `table`.
  const hydratedRef = useRef(hydrated);
  useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return undefined;
    let cancelled = false;

    // Build the channel inside the effect so React's strict-mode double-
    // mount in development doesn't leave a dangling subscription.
    const channel = supabase
      .channel(`realtime:public:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (cancelled) return;
          // Hydration must complete before we touch state — otherwise a
          // burst of seed events on first connect would race with the
          // initial fetchAll and we'd end up showing partial data.
          if (!hydratedRef.current) return;

          const eventType = payload.eventType || payload.type;
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const incoming = payload.new?.data;
            if (!incoming || incoming.id === undefined) return;
            setValue((cur) => {
              const list = Array.isArray(cur) ? cur : [];
              const idx = list.findIndex((x) => x && x.id === incoming.id);
              if (idx === -1) return [...list, incoming];
              // Optional conflict resolution; remote-wins by default.
              const resolved = typeof onConflict === "function"
                ? onConflict(list[idx], incoming)
                : incoming;
              const out = list.slice();
              out[idx] = resolved;
              return out;
            });
          } else if (eventType === "DELETE") {
            // payload.old.id is the row PK, which equals item.id.
            const removedId = payload.old?.id;
            if (removedId === undefined || removedId === null) return;
            setValue((cur) => {
              const list = Array.isArray(cur) ? cur : [];
              return list.filter((x) => x && String(x.id) !== String(removedId));
            });
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch (_) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);
}

// Content-aware singleton persistence. Same reasoning as the slice
// variant: inbound realtime events produce identical-content state
// updates that we must not re-upsert, and the first post-hydration
// observation is the baseline (not a change worth pushing back).
// `hydrated` is a BOOLEAN state (not a ref) so this effect re-runs
// when hydration flips true and correctly records the baseline at
// that moment — see the long comment on useSlicePersistence for why.
export function useSingletonPersistence(key, value, hydrated) {
  const timeoutRef        = useRef(null);
  const lastSerializedRef = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    const next = serialize(value);
    if (next === null) return;
    if (lastSerializedRef.current === null) {
      lastSerializedRef.current = next;
      return;
    }
    if (next === lastSerializedRef.current) return;
    lastSerializedRef.current = next;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      upsertSingleton(key, value);
    }, 600);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, hydrated]);
}

// ─── Real-time singleton sync ─────────────────────────────────────────────
//
// useRealtimeSingleton(key, setValue, hydratedRef)
//
// Subscribes to postgres_changes on `public.singletons` filtered by the
// row's key. The payload shape is { key, value, updated_at, ... }; we
// hand value through to setValue. Inserts and updates both apply; a
// delete reverts to null so the consumer can decide whether to fall
// back to its bundled default.
//
// One channel per singleton key — keeps the WebSocket filter granular
// so a flurry of hotel_info edits doesn't wake up every component that
// also reads `tiers` or `tax`.
export function useRealtimeSingleton(key, setValue, hydrated) {
  // Same ref-mirror pattern as useRealtimeSlice so the channel
  // subscribes once per key and the callback reads the live `hydrated`.
  const hydratedRef = useRef(hydrated);
  useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return undefined;
    let cancelled = false;
    const channel = supabase
      .channel(`realtime:public:singletons:${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "singletons",
          filter: `key=eq.${key}`,
        },
        (payload) => {
          if (cancelled) return;
          if (!hydratedRef.current) return;
          const eventType = payload.eventType || payload.type;
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const incoming = payload.new?.value;
            if (incoming === undefined) return;
            setValue(incoming);
          } else if (eventType === "DELETE") {
            setValue(null);
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch (_) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// ─── Real-time sync for non-JSONB tables ──────────────────────────────────
//
// useRealtimeTable(table, setValue, hydratedRef, { rowToClient, getId })
//
// For tables that pre-date the JSONB-entity pattern (currently just
// `rooms`, which has its own columnar schema with snake_case columns
// and a dbRoomToClient mapper). The hook is shape-agnostic — pass in
// a rowToClient function that converts a Supabase row into the React-
// shape the slice expects, and a getId helper that pulls the id off
// the row (defaults to `row.id`).
//
// INSERT / UPDATE — apply rowToClient(payload.new) and upsert into the
// slice array by id.
// DELETE        — filter the slice by id.
export function useRealtimeTable(table, setValue, hydrated, options = {}) {
  const { rowToClient = (row) => row, getId = (row) => row?.id } = options;
  // Mirror hydrated boolean → ref so the channel doesn't re-subscribe.
  const hydratedRef = useRef(hydrated);
  useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return undefined;
    let cancelled = false;
    const channel = supabase
      .channel(`realtime:public:${table}:rows`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (cancelled) return;
          if (!hydratedRef.current) return;
          const eventType = payload.eventType || payload.type;
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const incoming = rowToClient(payload.new);
            const id = getId(payload.new) ?? incoming?.id;
            if (id === undefined || id === null) return;
            setValue((cur) => {
              const list = Array.isArray(cur) ? cur : [];
              const idx = list.findIndex((x) => x && getId(x) === id || x?.id === id);
              if (idx === -1) return [...list, incoming];
              const out = list.slice();
              out[idx] = incoming;
              return out;
            });
          } else if (eventType === "DELETE") {
            const id = getId(payload.old);
            if (id === undefined || id === null) return;
            setValue((cur) => {
              const list = Array.isArray(cur) ? cur : [];
              return list.filter((x) => x && (getId(x) !== id) && (x.id !== id));
            });
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch (_) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);
}

// ─── Object-map slice helpers ──────────────────────────────────────────
//
// Some slices are stored in React state as a key → value object map
// (e.g. calendar_overrides keyed by `${roomId}|${YYYY-MM-DD}`) rather
// than an array of records. The array-shape helpers above silently
// break those slices: fetchAll throws away the row id, bulkReplace
// coerces to an empty array, and the realtime listener clobbers the
// map with an array. The three helpers below close that gap.
//
//   fetchEntityMap(table)        — returns { [row.id]: row.data } | null
//   useObjectSlicePersistence    — diff & upsert/delete by key
//   useObjectRealtimeSlice       — apply INSERT/UPDATE/DELETE to the map
//
// The DB row layout is identical to the array variant: `(id text, data
// jsonb)`. The only difference is what the React state looks like.

/** Fetch every row in a JSONB-entity table as a key → data map. */
export async function fetchEntityMap(table) {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id, data");
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[${table}] fetch (as map) failed:`, error.message);
      return null;
    }
    const map = {};
    (data || []).forEach((r) => {
      if (r && r.id !== undefined && r.id !== null && r.data) {
        map[String(r.id)] = r.data;
      }
    });
    return map;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[${table}] fetch (as map) threw:`, err?.message || err);
    return null;
  }
}

/**
 * Diff-based persistence for object-map slices. On every change we
 * compute additions / updates / deletions against the last-known map,
 * then push only the diff to Supabase. Same content-aware + hydration-
 * race-safe semantics as useSlicePersistence — see its header for the
 * full rationale on why `hydrated` is state, not a ref.
 */
export function useObjectSlicePersistence(table, valueMap, hydrated) {
  const timeoutRef        = useRef(null);
  const lastMapRef        = useRef(null);   // snapshot of the previous content
  const lastSerializedRef = useRef(null);   // for fast diff detection
  useEffect(() => {
    if (!hydrated) return;
    const next = serialize(valueMap || {});
    if (next === null) return;
    if (lastSerializedRef.current === null) {
      // First post-hydration observation — record the baseline silently
      // so we don't echo whatever fetchEntityMap just loaded.
      lastSerializedRef.current = next;
      lastMapRef.current = { ...(valueMap || {}) };
      return;
    }
    if (next === lastSerializedRef.current) return;
    const prev = lastMapRef.current || {};
    const curr = valueMap || {};
    lastSerializedRef.current = next;
    lastMapRef.current = { ...curr };
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      // Skip when there's no auth — RLS would reject writes anyway.
      if (!hasSupabaseSession()) {
        warnSkipOnce(table);
        return;
      }
      // Build the diff
      const prevKeys = new Set(Object.keys(prev));
      const currKeys = new Set(Object.keys(curr));
      const toUpsert = [];
      const toDelete = [];
      currKeys.forEach((k) => {
        if (!prevKeys.has(k) || serialize(prev[k]) !== serialize(curr[k])) {
          toUpsert.push({ id: k, data: curr[k] });
        }
      });
      prevKeys.forEach((k) => {
        if (!currKeys.has(k)) toDelete.push(k);
      });
      try {
        if (toUpsert.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < toUpsert.length; i += CHUNK) {
            const slice = toUpsert.slice(i, i + CHUNK);
            const { error } = await supabase
              .from(table)
              .upsert(slice, { onConflict: "id" });
            if (error) {
              // eslint-disable-next-line no-console
              console.warn(`[${table}] map upsert failed:`, error.message);
              return;
            }
          }
        }
        if (toDelete.length > 0) {
          const { error } = await supabase.from(table).delete().in("id", toDelete);
          if (error) {
            // eslint-disable-next-line no-console
            console.warn(`[${table}] map delete-stale failed:`, error.message);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[${table}] map persistence threw:`, err?.message || err);
      }
    }, 600);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMap, hydrated]);
}

/**
 * Real-time sync for object-map slices. Each INSERT / UPDATE writes the
 * row's `data` value at the row's `id` key; DELETE removes the key.
 */
export function useObjectRealtimeSlice(table, setValueMap, hydrated) {
  const hydratedRef = useRef(hydrated);
  useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return undefined;
    let cancelled = false;
    const channel = supabase
      .channel(`realtime:public:${table}:map`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (cancelled) return;
          if (!hydratedRef.current) return;
          const eventType = payload.eventType || payload.type;
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const id = payload.new?.id;
            const data = payload.new?.data;
            if (id === undefined || id === null || data === undefined) return;
            setValueMap((cur) => ({ ...(cur || {}), [String(id)]: data }));
          } else if (eventType === "DELETE") {
            const id = payload.old?.id;
            if (id === undefined || id === null) return;
            setValueMap((cur) => {
              if (!cur || !(String(id) in cur)) return cur;
              const out = { ...cur };
              delete out[String(id)];
              return out;
            });
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch (_) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);
}
