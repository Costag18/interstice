// sync-meta.js — All sync-related metadata lives in localStorage.
//
// Why localStorage and not IndexedDB? It's small, synchronous, and easy to
// reason about. Tombstones grow at most ~30 bytes per deleted entry and are
// pruned after 90 days.

const META_KEY = 'interstice:sync-meta';
const TOMB_KEY = 'interstice:tombstones';
const TOMB_TTL_MS = 90 * 24 * 3600 * 1000;

const META_DEFAULTS = {
  token: null,        // GitHub PAT
  login: null,        // GitHub login (cached for UI)
  gistId: null,       // The gist used for sync
  lastSyncAt: null,   // epoch ms
  lastError: null,    // string | null
  autoSync: true,     // master toggle
};

export function getMeta() {
  try {
    return { ...META_DEFAULTS, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') };
  } catch {
    return { ...META_DEFAULTS };
  }
}

export function setMeta(patch) {
  const m = { ...getMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(m));
  return m;
}

export function clearMeta() {
  localStorage.removeItem(META_KEY);
}

// Tombstones: { entryId: deletedAtTimestamp }
export function getTombstones() {
  try {
    return JSON.parse(localStorage.getItem(TOMB_KEY) || '{}');
  } catch {
    return {};
  }
}

export function recordTombstone(id) {
  const t = getTombstones();
  t[id] = Date.now();
  localStorage.setItem(TOMB_KEY, JSON.stringify(t));
}

export function mergeTombstones(remote) {
  if (!remote || typeof remote !== 'object') return getTombstones();
  const local = getTombstones();
  const merged = { ...local };
  for (const [id, ts] of Object.entries(remote)) {
    if (typeof ts !== 'number') continue;
    if (!merged[id] || ts > merged[id]) merged[id] = ts;
  }
  pruneTombstones(merged);
  localStorage.setItem(TOMB_KEY, JSON.stringify(merged));
  return merged;
}

export function clearTombstones() {
  localStorage.removeItem(TOMB_KEY);
}

function pruneTombstones(obj) {
  const cutoff = Date.now() - TOMB_TTL_MS;
  for (const [id, ts] of Object.entries(obj)) if (ts < cutoff) delete obj[id];
}
