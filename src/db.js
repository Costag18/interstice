// db.js — Thin Promise-based wrapper around the IndexedDB API.
//
// Schema:
//   Object store `entries` keyed by `id` (uuid).
//   Indexes: `by_ts` (epoch ms) and `by_day` (local YYYY-MM-DD).
//
// Entry shape:
//   { id, ts, day, type, body, mood, energy, tags, createdAt, updatedAt }
//
// All read methods return Promises. Search and tag aggregation are in-memory
// over the full set — fine for tens of thousands of entries.

const DB_NAME = 'interstice';
const DB_VERSION = 2;
const STORE = 'entries';
const META_STORE = 'meta';

let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by_ts', 'ts');
        store.createIndex('by_day', 'day');
      }
      // v2: add meta store for caching the (non-extractable) AES key
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked. Close other tabs running Interstice.'));
  });
  return dbPromise;
}

function tx(mode = 'readonly') {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function metaTx(mode = 'readonly') {
  return openDB().then((db) => db.transaction(META_STORE, mode).objectStore(META_STORE));
}

// Cache an arbitrary value under a key in the meta store. CryptoKeys with
// extractable=false are storable here via the structured-clone algorithm.
export async function setMetaValue(key, value) {
  const store = await metaTx('readwrite');
  await req2promise(store.put(value, key));
}

export async function getMetaValue(key) {
  const store = await metaTx();
  return req2promise(store.get(key));
}

export async function deleteMetaValue(key) {
  const store = await metaTx('readwrite');
  await req2promise(store.delete(key));
}

function req2promise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Local-time YYYY-MM-DD key (NOT UTC) so "today" matches the user's wall clock.
export function dayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function addEntry(partial) {
  const ts = partial.ts ?? Date.now();
  const now = Date.now();
  const entry = {
    id: uid(),
    ts,
    day: dayKey(ts),
    type: partial.type ?? null,
    body: partial.body ?? '',
    mood: partial.mood ?? null,
    energy: partial.energy ?? null,
    tags: Array.isArray(partial.tags) ? partial.tags : [],
    createdAt: now,
    updatedAt: now,
  };
  const store = await tx('readwrite');
  await req2promise(store.add(entry));
  notifyChanged();
  return entry;
}

export async function updateEntry(id, patch) {
  const store = await tx('readwrite');
  const existing = await req2promise(store.get(id));
  if (!existing) throw new Error(`No entry with id ${id}`);
  const merged = { ...existing, ...patch, updatedAt: Date.now() };
  if (patch.ts && patch.ts !== existing.ts) merged.day = dayKey(patch.ts);
  await req2promise(store.put(merged));
  notifyChanged();
  return merged;
}

export async function deleteEntry(id) {
  const store = await tx('readwrite');
  await req2promise(store.delete(id));
  // Record a tombstone so sync can propagate the deletion to other devices.
  try {
    const { recordTombstone } = await import('./sync-meta.js');
    recordTombstone(id);
  } catch {
    /* sync metadata is best-effort */
  }
  notifyChanged();
}

// Sync helper: import a synced payload that may include tombstones.
// Resolution rules:
//   1. Apply remote tombstones first — delete those entries from local DB.
//   2. For every remote entry: keep whichever side has the larger `updatedAt`.
//   3. Local-only entries are left alone (they'll be pushed on the next sync).
export async function syncImport(payload) {
  if (!payload || payload.schema !== 'interstice/v1' || !Array.isArray(payload.entries)) {
    throw new Error('Invalid sync payload');
  }
  const remoteTombstones = payload.tombstones || {};
  const store = await tx('readwrite');

  // Apply remote tombstones (skip notifyChanged so we don't spam listeners)
  for (const id of Object.keys(remoteTombstones)) {
    try { await req2promise(store.delete(id)); } catch {}
  }

  // Merge entries by id — latest updatedAt wins
  for (const remote of payload.entries) {
    if (!remote.id || !remote.ts) continue;
    if (remoteTombstones[remote.id]) continue; // deleted
    const existing = await req2promise(store.get(remote.id));
    if (!existing || (remote.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      await req2promise(
        store.put({
          ...remote,
          day: remote.day ?? dayKey(remote.ts),
          tags: Array.isArray(remote.tags) ? remote.tags : [],
        })
      );
    }
  }
  notifyChanged();
}

// ─── Change notifications (used by sync's debounced auto-push) ──────────────
const listeners = new Set();
export function onDbChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChanged() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

export async function getEntry(id) {
  const store = await tx();
  return req2promise(store.get(id));
}

export async function listEntriesByDay(day) {
  const store = await tx();
  const idx = store.index('by_day');
  const rows = await req2promise(idx.getAll(day));
  return rows.sort((a, b) => a.ts - b.ts);
}

export async function listEntriesByRange(fromTs, toTs) {
  const store = await tx();
  const idx = store.index('by_ts');
  const range = IDBKeyRange.bound(fromTs, toTs);
  const rows = await req2promise(idx.getAll(range));
  return rows.sort((a, b) => a.ts - b.ts);
}

export async function listAllEntries() {
  const store = await tx();
  const rows = await req2promise(store.getAll());
  return rows.sort((a, b) => b.ts - a.ts);
}

export async function searchEntries({
  q = '',
  types = [],
  tags = [],
  mood = null,
  fromTs = null,
  toTs = null,
} = {}) {
  const all = await listAllEntries();
  const ql = String(q || '').trim().toLowerCase();
  return all.filter((e) => {
    if (ql) {
      const inBody = e.body.toLowerCase().includes(ql);
      const inTags = (e.tags ?? []).some((t) => t.toLowerCase().includes(ql));
      if (!inBody && !inTags) return false;
    }
    if (types.length && !types.includes(e.type)) return false;
    if (tags.length && !tags.every((t) => (e.tags ?? []).includes(t))) return false;
    if (mood !== null && e.mood !== mood) return false;
    if (fromTs !== null && e.ts < fromTs) return false;
    if (toTs !== null && e.ts > toTs) return false;
    return true;
  });
}

export async function getAllTags() {
  const all = await listAllEntries();
  const counts = new Map();
  for (const e of all) for (const t of e.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

export async function clearAll() {
  const store = await tx('readwrite');
  await req2promise(store.clear());
}

export async function exportAll() {
  const entries = await listAllEntries();
  return { schema: 'interstice/v1', exportedAt: Date.now(), entries };
}

export async function importAll(payload, { merge = true } = {}) {
  if (!payload || payload.schema !== 'interstice/v1' || !Array.isArray(payload.entries)) {
    throw new Error('Invalid backup file: expected schema "interstice/v1".');
  }
  if (!merge) await clearAll();
  const store = await tx('readwrite');
  let added = 0,
    skipped = 0;
  for (const e of payload.entries) {
    if (!e.id || !e.ts) {
      skipped++;
      continue;
    }
    try {
      await req2promise(
        store.put({
          ...e,
          day: e.day ?? dayKey(e.ts),
          tags: Array.isArray(e.tags) ? e.tags : [],
        })
      );
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped };
}

export async function estimateUsage() {
  if (!('storage' in navigator) || !navigator.storage.estimate) return null;
  return navigator.storage.estimate();
}
