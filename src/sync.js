// sync.js — GitHub Gist sync engine.
//
// Why a gist? Each user already has GitHub auth. A private gist is durable,
// versioned, free, and accessible from every browser via the GitHub REST API.
// The user creates a Personal Access Token (PAT) once per device with `gist`
// scope and pastes it in. The token never leaves their device.
//
// Sync model:
//   • Pull: download gist, run db.syncImport (latest updatedAt wins, tombstones applied)
//   • Push: read full local DB + tombstones, write to the gist
//   • Auto: pull on app open, push debounced 5s after every DB change
//
// Conflicts: latest-updatedAt-wins per entry. Adequate for a personal journal.

import { listAllEntries, syncImport, onDbChanged } from './db.js';
import { getMeta, setMeta, getTombstones, mergeTombstones, clearMeta, clearTombstones } from './sync-meta.js';

const GIST_FILENAME = 'interstice.json';
const GIST_DESCRIPTION = 'Interstice — interstitial journaling sync (private)';
const PUSH_DEBOUNCE_MS = 5000;
const STATE_LISTENERS = new Set();

let pushTimer = null;
let inFlight = null;
let dirtyDuringFlight = false;
let state = { phase: 'idle', error: null }; // phase: idle | syncing | error | offline

// ─── Public API ─────────────────────────────────────────────────────────────

export function getSyncStatus() {
  const meta = getMeta();
  return {
    connected: !!meta.token,
    login: meta.login,
    gistId: meta.gistId,
    lastSyncAt: meta.lastSyncAt,
    autoSync: meta.autoSync,
    phase: state.phase,
    error: state.error,
  };
}

export function onSyncStatus(fn) {
  STATE_LISTENERS.add(fn);
  return () => STATE_LISTENERS.delete(fn);
}

// Verify token + cache login + (optionally) discover an existing gist.
export async function connect(token) {
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new Error('Token looks invalid.');
  }
  const user = await ghFetch('/user', { token });
  if (!user.login) throw new Error('Token rejected by GitHub.');
  setMeta({ token, login: user.login, lastError: null });

  // Try to find an existing Interstice gist on this account.
  const gists = await ghFetch('/gists?per_page=100', { token });
  const existing = (Array.isArray(gists) ? gists : []).find(
    (g) => g?.files && g.files[GIST_FILENAME] && g.description === GIST_DESCRIPTION
  );
  if (existing) {
    setMeta({ gistId: existing.id });
  }
  return user.login;
}

export function disconnect() {
  clearMeta();
  clearTombstones();
  setState({ phase: 'idle', error: null });
}

export function setAutoSync(on) {
  setMeta({ autoSync: !!on });
  notifyStatus();
}

// Pull from gist into local DB.
export async function pull() {
  const meta = getMeta();
  if (!meta.token || !meta.gistId) return; // no remote yet
  setState({ phase: 'syncing', error: null });
  try {
    const gist = await ghFetch(`/gists/${meta.gistId}`, { token: meta.token });
    const file = gist?.files?.[GIST_FILENAME];
    if (!file) throw new Error('Gist has no interstice.json file');
    const text = file.truncated ? await fetch(file.raw_url).then((r) => r.text()) : file.content;
    const payload = JSON.parse(text);
    if (payload?.tombstones) mergeTombstones(payload.tombstones);
    await syncImport(payload);
    setMeta({ lastSyncAt: Date.now(), lastError: null });
    setState({ phase: 'idle', error: null });
  } catch (e) {
    setMeta({ lastError: String(e.message || e) });
    setState({ phase: 'error', error: String(e.message || e) });
    throw e;
  }
}

// Push current local state to gist (creates the gist on first push).
export async function push() {
  const meta = getMeta();
  if (!meta.token) return;
  setState({ phase: 'syncing', error: null });
  try {
    const entries = await listAllEntries();
    const tombstones = getTombstones();
    const payload = {
      schema: 'interstice/v1',
      exportedAt: Date.now(),
      device: navigator.userAgent.slice(0, 80),
      entries,
      tombstones,
    };
    const body = JSON.stringify(payload, null, 2);

    if (!meta.gistId) {
      // Create
      const created = await ghFetch('/gists', {
        token: meta.token,
        method: 'POST',
        body: {
          description: GIST_DESCRIPTION,
          public: false,
          files: { [GIST_FILENAME]: { content: body } },
        },
      });
      setMeta({ gistId: created.id });
    } else {
      // Update
      await ghFetch(`/gists/${meta.gistId}`, {
        token: meta.token,
        method: 'PATCH',
        body: { files: { [GIST_FILENAME]: { content: body } } },
      });
    }
    setMeta({ lastSyncAt: Date.now(), lastError: null });
    setState({ phase: 'idle', error: null });
  } catch (e) {
    setMeta({ lastError: String(e.message || e) });
    setState({ phase: 'error', error: String(e.message || e) });
    throw e;
  }
}

// Pull-then-push, with reentrancy protection.
export async function syncNow() {
  if (inFlight) {
    dirtyDuringFlight = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      await pull();
      await push();
    } finally {
      inFlight = null;
      if (dirtyDuringFlight) {
        dirtyDuringFlight = false;
        scheduleAutoPush();
      }
    }
  })();
  return inFlight;
}

// Wire up auto-sync. Call once at app boot.
export function startAutoSync() {
  // Pull on boot
  if (getMeta().token && getMeta().autoSync) {
    syncNow().catch((e) => console.warn('Initial sync failed:', e));
  }
  // Debounced push after each DB change
  onDbChanged(() => {
    if (getMeta().token && getMeta().autoSync) scheduleAutoPush();
  });
  // Pull when the tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getMeta().token && getMeta().autoSync) {
      // Fire-and-forget
      pull().catch(() => {});
    }
  });
}

function scheduleAutoPush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (inFlight) { dirtyDuringFlight = true; return; }
    push().catch((e) => console.warn('Auto push failed:', e));
  }, PUSH_DEBOUNCE_MS);
}

// ─── GitHub REST helper ─────────────────────────────────────────────────────

async function ghFetch(path, { token, method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) throw new Error('GitHub token rejected (401). Reconnect with a fresh token.');
  if (resp.status === 403) throw new Error('GitHub denied the request (403). Token may be missing the `gist` scope.');
  if (!resp.ok) {
    let detail = '';
    try { detail = (await resp.json())?.message || ''; } catch {}
    throw new Error(`GitHub ${resp.status}${detail ? `: ${detail}` : ''}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

function setState(next) {
  state = { ...state, ...next };
  notifyStatus();
}

function notifyStatus() {
  for (const fn of STATE_LISTENERS) {
    try { fn(getSyncStatus()); } catch {}
  }
}
