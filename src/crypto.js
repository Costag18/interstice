// crypto.js — End-to-end encryption for the gist sync payload.
//
// Cipher:  AES-256-GCM      (authenticated encryption, native Web Crypto)
// KDF:     PBKDF2-SHA256    (600,000 iterations — OWASP 2023)
// Salt:    16 bytes random  (per envelope)
// IV:      12 bytes random  (per encryption)
//
// Public envelope shape (what gets stored in the gist):
//   {
//     schema:     "interstice/v1+enc",
//     kdf:        "PBKDF2-SHA256",
//     iterations: 600000,
//     salt:       "<base64>",
//     iv:         "<base64>",
//     ciphertext: "<base64>"   // ciphertext + auth tag concatenated by GCM
//   }
//
// Keys returned from deriveKey are non-extractable: the underlying key bytes
// can be USED for crypto operations but cannot be read back via the API. This
// means even an XSS attacker can only decrypt while the page is loaded — they
// can't exfiltrate the key itself.

const ITERATIONS = 600_000;
const KDF_HASH = 'SHA-256';
const KEY_LENGTH = 256;       // bits, AES-256
const SALT_BYTES = 16;
const IV_BYTES = 12;

export const SCHEMA_PLAIN = 'interstice/v1';
export const SCHEMA_ENCRYPTED = 'interstice/v1+enc';

// ─── Public API ─────────────────────────────────────────────────────────────

export async function deriveKey(passphrase, saltBytes) {
  if (!passphrase || passphrase.length < 1) throw new Error('Passphrase is empty');
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: KDF_HASH },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    /* extractable */ false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a plaintext string with a passphrase. Generates fresh salt + IV.
// Returns the full envelope object.
export async function wrap(passphrase, plaintext) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    schema: SCHEMA_ENCRYPTED,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ct)),
  };
}

// Encrypt with an already-derived CryptoKey (faster — no PBKDF2). Returns the
// envelope WITHOUT salt (caller must reuse the salt that produced this key).
export async function wrapWithKey(key, salt, plaintext) {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    schema: SCHEMA_ENCRYPTED,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ct)),
  };
}

// Decrypt an envelope using a passphrase. Returns the plaintext string.
// Throws on wrong passphrase or tampered ciphertext (GCM auth tag mismatch).
export async function unwrap(passphrase, envelope) {
  validateEnvelope(envelope);
  const salt = b64ToBytes(envelope.salt);
  const iv = b64ToBytes(envelope.iv);
  const ct = b64ToBytes(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt);
  return decryptWithKey(key, iv, ct);
}

// Decrypt an envelope with an already-derived key. Faster than unwrap.
// Returns plaintext or throws.
export async function unwrapWithKey(key, envelope) {
  validateEnvelope(envelope);
  if (b64ToBytes(envelope.salt).length !== SALT_BYTES) throw new Error('Bad salt length');
  const iv = b64ToBytes(envelope.iv);
  const ct = b64ToBytes(envelope.ciphertext);
  return decryptWithKey(key, iv, ct);
}

// Returns the raw salt bytes inside an envelope. Used when caching a
// derived key so we know which salt produced it.
export function envelopeSalt(envelope) {
  validateEnvelope(envelope);
  return b64ToBytes(envelope.salt);
}

export function isEncryptedEnvelope(payload) {
  return !!payload && payload.schema === SCHEMA_ENCRYPTED;
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function decryptWithKey(key, iv, ct) {
  let buf;
  try {
    buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    throw new Error('Wrong passphrase or corrupted data.');
  }
  return new TextDecoder().decode(buf);
}

function validateEnvelope(env) {
  if (!env || env.schema !== SCHEMA_ENCRYPTED) throw new Error('Not an encrypted envelope');
  if (env.kdf !== 'PBKDF2-SHA256') throw new Error(`Unsupported KDF ${env.kdf}`);
  if (typeof env.iterations !== 'number' || env.iterations < 100_000) throw new Error('Suspicious iteration count');
  if (!env.salt || !env.iv || !env.ciphertext) throw new Error('Envelope missing fields');
}

function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
