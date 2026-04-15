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

import { listAllEntries, syncImport, onDbChanged, setMetaValue, getMetaValue, deleteMetaValue } from './db.js';
import { getMeta, setMeta, getTombstones, mergeTombstones, clearMeta, clearTombstones } from './sync-meta.js';
import {
  deriveKey,
  wrapWithKey,
  unwrapWithKey,
  isEncryptedEnvelope,
  envelopeSalt,
  SCHEMA_PLAIN,
} from './crypto.js';

const GIST_FILENAME = 'interstice.json';
const GIST_DESCRIPTION = 'Interstice — interstitial journaling sync (private)';
const PUSH_DEBOUNCE_MS = 1500;            // batched, but felt-as-instant
const POLL_INTERVAL_MS = 20_000;           // when visible+connected, pull every 20s
const ERROR_BACKOFF_MIN_MS = 30_000;       // after first error, wait 30s
const ERROR_BACKOFF_MAX_MS = 5 * 60_000;   // cap at 5 minutes
const KEY_CACHE_FIELD = 'sync-encryption-key';
const STATE_LISTENERS = new Set();
const PASSPHRASE_LISTENERS = new Set();

// Module-scope unlock context — survives within a single page load.
// Promise that resolves to the AES key once unlocked.
let unlockPromise = null;

let pushTimer = null;
let inFlight = null;
let dirtyDuringFlight = false;
let consecutiveErrors = 0;               // drives polling backoff
let nextPollDueAt = 0;                   // wall-clock ms; polling loop skips until then
let state = { phase: 'idle', error: null, unlocked: false }; // phase: idle | syncing | error

// ─── Tiny base64 helpers (mirror crypto.js's, kept local to avoid coupling) ─
function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64ToBytes(s) {
  const bin = atob(s || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getSyncStatus() {
  const meta = getMeta();
  return {
    connected: !!meta.token,
    login: meta.login,
    gistId: meta.gistId,
    lastSyncAt: meta.lastSyncAt,
    autoSync: meta.autoSync,
    encryptionEnabled: !!meta.encryptionEnabled,
    encryptionUnlocked: state.unlocked,
    phase: state.phase,
    error: state.error,
  };
}

export function onSyncStatus(fn) {
  STATE_LISTENERS.add(fn);
  return () => STATE_LISTENERS.delete(fn);
}

// UI subscribes here. The handler receives a callback `submit(passphrase)`
// it should call once the user types the passphrase. Returns an unsubscribe.
export function onPassphraseNeeded(fn) {
  PASSPHRASE_LISTENERS.add(fn);
  return () => PASSPHRASE_LISTENERS.delete(fn);
}

// ─── Encryption controls ────────────────────────────────────────────────────

// Enable encryption with a fresh passphrase. Derives a key, caches it, and
// triggers a push so the gist is rewritten as ciphertext immediately.
export async function enableEncryption(passphrase) {
  if (!passphrase || passphrase.length < 4) throw new Error('Passphrase too short.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  await setMetaValue(KEY_CACHE_FIELD, key);
  setMeta({ encryptionEnabled: true, encryptionSaltB64: bytesToB64(salt) });
  setState({ unlocked: true });
  // Force a push so the gist is encrypted immediately.
  await push();
}

// Provide passphrase to unlock an already-encrypted gist (used when this is
// device #2 pulling an encrypted payload it can't decrypt yet).
export async function unlock(passphrase, envelope) {
  const salt = envelope ? envelopeSalt(envelope) : b64ToBytes(getMeta().encryptionSaltB64 || '');
  if (!salt || !salt.length) throw new Error('Missing salt to derive key.');
  const key = await deriveKey(passphrase, salt);
  // Test the key against the envelope before caching.
  if (envelope) await unwrapWithKey(key, envelope);
  await setMetaValue(KEY_CACHE_FIELD, key);
  setMeta({ encryptionEnabled: true, encryptionSaltB64: bytesToB64(salt) });
  setState({ unlocked: true });
  return key;
}

// Forget the cached key. Next pull/push will require the passphrase again.
export async function lockNow() {
  await deleteMetaValue(KEY_CACHE_FIELD);
  unlockPromise = null;
  setState({ unlocked: false });
}

// Turn encryption off entirely. The next push writes plaintext to the gist.
export async function disableEncryption() {
  await deleteMetaValue(KEY_CACHE_FIELD);
  unlockPromise = null;
  setMeta({ encryptionEnabled: false, encryptionSaltB64: null });
  setState({ unlocked: false });
  // Push immediately so the gist is rewritten as plaintext.
  if (getMeta().token) await push();
}

// Rotate to a new passphrase. Requires the current key to be unlocked.
export async function changePassphrase(newPassphrase) {
  if (!newPassphrase || newPassphrase.length < 4) throw new Error('Passphrase too short.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(newPassphrase, salt);
  await setMetaValue(KEY_CACHE_FIELD, key);
  setMeta({ encryptionEnabled: true, encryptionSaltB64: bytesToB64(salt) });
  setState({ unlocked: true });
  await push();
}

// Quick format sanity check — does this look like a plausible GitHub token?
// Classic PAT: ghp_ followed by 36 chars = 40 total.
// Fine-grained: github_pat_ followed by ~82 chars = 93 total. (Fine-grained
// tokens can NOT access gists, so we warn up front if we see one.)
export function validateTokenShape(raw) {
  const token = String(raw || '').trim();
  if (token.length < 20) return { ok: false, reason: 'Token is too short. Classic PATs look like "ghp_…" (40 chars).' };
  if (token.startsWith('github_pat_')) {
    return {
      ok: false,
      reason: 'This is a FINE-GRAINED token. Fine-grained tokens can\'t access gists — GitHub rejects them with 403. You need a CLASSIC token (starts with "ghp_").',
    };
  }
  if (!token.startsWith('ghp_')) {
    return {
      ok: false,
      reason: 'This doesn\'t look like a classic GitHub personal access token. Expected format: "ghp_" followed by 36 characters.',
    };
  }
  return { ok: true, token };
}

// Verify token + cache login + (optionally) discover an existing gist.
export async function connect(token) {
  const check = validateTokenShape(token);
  if (!check.ok) throw new Error(check.reason);
  token = check.token;

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
  recordSuccess();
  return user.login;
}

export async function disconnect() {
  clearMeta();
  clearTombstones();
  await deleteMetaValue(KEY_CACHE_FIELD).catch(() => {});
  unlockPromise = null;
  setState({ phase: 'idle', error: null, unlocked: false });
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
    let payload = JSON.parse(text);

    // If the gist is encrypted, get/derive the key and decrypt.
    if (isEncryptedEnvelope(payload)) {
      // Remember encryption is in use (so a fresh device knows).
      setMeta({ encryptionEnabled: true, encryptionSaltB64: payload.salt });
      const key = await ensureUnlockedKey(payload);
      const plaintext = await unwrapWithKey(key, payload);
      payload = JSON.parse(plaintext);
    } else if (meta.encryptionEnabled) {
      // We expected encryption but got plaintext — gist was reset elsewhere.
      // Don't auto-disable; warn and continue with plaintext.
      console.warn('Gist is plaintext but encryption flag was set. Disabling.');
      setMeta({ encryptionEnabled: false, encryptionSaltB64: null });
      await deleteMetaValue(KEY_CACHE_FIELD);
      setState({ unlocked: false });
    }

    if (payload?.tombstones) mergeTombstones(payload.tombstones);
    await syncImport(payload);
    setMeta({ lastSyncAt: Date.now(), lastError: null });
    setState({ phase: 'idle', error: null });
    recordSuccess();
  } catch (e) {
    recordFailure();
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
      schema: SCHEMA_PLAIN,
      exportedAt: Date.now(),
      device: navigator.userAgent.slice(0, 80),
      entries,
      tombstones,
    };
    const plaintext = JSON.stringify(payload, null, 2);

    let body;
    if (meta.encryptionEnabled) {
      const key = await ensureUnlockedKey(); // may prompt UI
      const salt = b64ToBytes(getMeta().encryptionSaltB64 || '');
      const envelope = await wrapWithKey(key, salt, plaintext);
      body = JSON.stringify(envelope);
    } else {
      body = plaintext;
    }

    if (!meta.gistId) {
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
      await ghFetch(`/gists/${meta.gistId}`, {
        token: meta.token,
        method: 'PATCH',
        body: { files: { [GIST_FILENAME]: { content: body } } },
      });
    }
    setMeta({ lastSyncAt: Date.now(), lastError: null });
    setState({ phase: 'idle', error: null });
    recordSuccess();
  } catch (e) {
    recordFailure();
    setMeta({ lastError: String(e.message || e) });
    setState({ phase: 'error', error: String(e.message || e) });
    throw e;
  }
}

function recordSuccess() {
  consecutiveErrors = 0;
  nextPollDueAt = 0;
}

function recordFailure() {
  consecutiveErrors++;
  // 30s, 60s, 120s, 240s, 300s (cap)
  const delay = Math.min(ERROR_BACKOFF_MIN_MS * Math.pow(2, consecutiveErrors - 1), ERROR_BACKOFF_MAX_MS);
  nextPollDueAt = Date.now() + delay;
}

// Resolve the cached key. If absent, fire the passphrase-needed event and
// wait for the UI to call back with a passphrase.
async function ensureUnlockedKey(envelopeForVerification = null) {
  // Try cached key first
  let key = await getMetaValue(KEY_CACHE_FIELD);
  if (key) {
    setState({ unlocked: true });
    return key;
  }
  // Re-use any in-flight unlock attempt
  if (unlockPromise) return unlockPromise;
  unlockPromise = (async () => {
    if (PASSPHRASE_LISTENERS.size === 0) {
      throw new Error('Passphrase required but no UI is registered.');
    }
    return new Promise((resolve, reject) => {
      let resolved = false;
      const submit = async (passphrase) => {
        if (resolved) return;
        try {
          const k = await unlock(passphrase, envelopeForVerification);
          resolved = true;
          resolve(k);
        } catch (e) {
          throw e; // re-throw so the modal can show "wrong passphrase"
        }
      };
      const cancel = () => {
        if (resolved) return;
        resolved = true;
        reject(new Error('Unlock cancelled.'));
      };
      for (const fn of PASSPHRASE_LISTENERS) {
        try { fn({ submit, cancel, envelope: envelopeForVerification }); } catch (e) { console.warn(e); }
      }
    });
  })();
  try {
    return await unlockPromise;
  } finally {
    unlockPromise = null;
  }
}

// Pull-then-push, with reentrancy protection.
// Always bypasses the polling backoff — user clicked a button, they're telling
// the app to try NOW regardless of recent failures.
export async function syncNow() {
  if (inFlight) {
    dirtyDuringFlight = true;
    return inFlight;
  }
  nextPollDueAt = 0; // manual action resets the backoff so the next poll can fire normally
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
export async function startAutoSync() {
  // Hydrate "unlocked" state if a cached key already exists
  try {
    const cached = await getMetaValue(KEY_CACHE_FIELD);
    if (cached) setState({ unlocked: true });
  } catch {}

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
      pull().catch(() => {});
    }
  });

  // Periodic pull while the tab is visible and connected. Catches changes
  // pushed from another device.
  //
  // Important change from the earlier impl: we DO retry when state.phase is
  // 'error'. If the error was transient (GitHub hiccup, flaky network, brief
  // rate limit), we recover on our own. To avoid hammering when the error is
  // persistent (bad token), consecutive failures increase a backoff delay
  // (30s → 60s → 120s → ... capped at 5min). The backoff resets on any
  // success, and also on any manual syncNow / reconnect.
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const m = getMeta();
    if (!m.token || !m.autoSync) return;
    if (state.phase === 'syncing') return;
    if (Date.now() < nextPollDueAt) return;
    pull().catch(() => {});
  }, POLL_INTERVAL_MS);
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
  if (resp.status === 401) {
    throw new Error(
      'GitHub rejected the token (401). It was revoked, expired, or typed wrong. ' +
      'Create a new CLASSIC token with the "gist" scope and reconnect.'
    );
  }
  if (resp.status === 403) {
    // The most common cause of 403 on /gists is using a fine-grained PAT
    // (github_pat_...). Fine-grained PATs do not support gists at all.
    throw new Error(
      'GitHub denied the request (403). The most likely cause: you used a ' +
      'FINE-GRAINED token (github_pat_...). Fine-grained tokens can\'t access gists. ' +
      'Create a CLASSIC token (ghp_...) with the "gist" scope and reconnect.'
    );
  }
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
