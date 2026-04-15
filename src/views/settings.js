// settings.js — Theme, export/import, install, shortcuts reference, storage usage, clear-all.
//
// Spec corrections vs Stitch mockup:
//   • No fictitious storage cap — show real bytes used, no fake "X / 50 MB" line.
//   • No "Force Sync" shortcut — local-only app, nothing to sync.
//   • Use cloud_off icon in the topbar (handled by topbar component).
//   • No fake user avatar in the sidebar (handled in nav component).

import { renderTopbar } from '../components/topbar.js';
import { showFab } from '../components/fab.js';
import { exportAll, importAll, clearAll, estimateUsage, listAllEntries } from '../db.js';
import { applyTheme } from '../theme.js';
import { getPrefs, setPref } from '../helpers/prefs.js';
import { setHTML, escapeHtml, escapeAttr } from '../safe-dom.js';
import {
  connect,
  disconnect,
  syncNow,
  getSyncStatus,
  setAutoSync,
  onSyncStatus,
  enableEncryption,
  disableEncryption,
  changePassphrase,
  lockNow,
  onPassphraseNeeded,
} from '../sync.js';

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});

export async function render(root) {
  showFab();
  const prefs = getPrefs();
  const usage = await estimateUsage();
  const usedMB = usage && typeof usage.usage === 'number' ? (usage.usage / 1024 / 1024).toFixed(2) : '—';
  const all = await listAllEntries();

  setHTML(
    root,
    `${renderTopbar({ title: 'Settings', subtitle: 'Your sanctuary, your rules' })}
    <section class="px-6 md:px-12 max-w-4xl mx-auto space-y-6 pb-16">

      <div class="bg-surface-container-low rounded-2xl p-6">
        <h3 class="font-headline text-xl mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">palette</span>Theme
        </h3>
        <div class="grid grid-cols-3 gap-3" id="theme-grp">
          ${themeBtn('dark', prefs.theme === 'dark')}
          ${themeBtn('light', prefs.theme === 'light')}
          ${themeBtn('system', prefs.theme === 'system')}
        </div>
      </div>

      <div class="bg-surface-container-low rounded-2xl p-6" id="sync-section">
        ${renderSyncSection()}
      </div>

      <div class="bg-surface-container-low rounded-2xl p-6">
        <h3 class="font-headline text-xl mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">archive</span>Backup &amp; Restore
        </h3>
        <p class="font-body text-sm text-on-surface/60 mb-4 italic">Your only safety net. Export regularly.</p>
        <div class="grid sm:grid-cols-2 gap-3">
          <button id="exp-md" class="bg-surface-container-high p-4 rounded-xl text-left hover:bg-surface-bright transition group">
            <div class="flex justify-between items-start">
              <span class="material-symbols-outlined text-primary">markdown</span>
              <span class="material-symbols-outlined text-on-surface/30 opacity-0 group-hover:opacity-100 transition">download</span>
            </div>
            <div class="font-label text-sm font-semibold mt-3">Export Markdown</div>
            <div class="font-label text-[11px] text-on-surface/60 mt-1">Readable in any editor.</div>
          </button>
          <button id="exp-json" class="bg-surface-container-high p-4 rounded-xl text-left hover:bg-surface-bright transition group">
            <div class="flex justify-between items-start">
              <span class="material-symbols-outlined text-tertiary">data_object</span>
              <span class="material-symbols-outlined text-on-surface/30 opacity-0 group-hover:opacity-100 transition">download</span>
            </div>
            <div class="font-label text-sm font-semibold mt-3">Export JSON</div>
            <div class="font-label text-[11px] text-on-surface/60 mt-1">Full backup, can be re-imported.</div>
          </button>
          <label class="sm:col-span-2 bg-surface-container p-4 rounded-xl border-2 border-dashed border-outline-variant/30 hover:border-primary/40 transition cursor-pointer flex items-center gap-3">
            <span class="material-symbols-outlined text-on-surface/60">upload_file</span>
            <div class="flex-1">
              <div class="font-label text-sm font-semibold">Import from JSON backup</div>
              <div class="font-label text-[11px] text-on-surface/50">Will merge with existing entries.</div>
            </div>
            <input id="imp" type="file" accept="application/json,.json" class="hidden" />
          </label>
        </div>
      </div>

      <div class="bg-surface-container-low rounded-2xl p-6">
        <h3 class="font-headline text-xl mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">install_mobile</span>Install as App
        </h3>
        <p class="font-body text-sm text-on-surface/60 mb-4">Add Interstice to your home screen for offline use and one-tap capture.</p>
        <button id="install" class="px-6 py-3 rounded-full bg-secondary-container text-on-secondary-container font-label text-xs font-bold tracking-widest">
          ${deferredInstall ? 'INSTALL NOW' : 'INSTALL UNAVAILABLE'}
        </button>
      </div>

      <div class="bg-surface-container-low rounded-2xl p-6">
        <h3 class="font-headline text-xl mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-on-surface/60">keyboard</span>Keyboard Shortcuts
        </h3>
        <div class="grid sm:grid-cols-2 gap-x-8 gap-y-3 font-label text-xs">
          ${shortcut('New entry', 'N')}
          ${shortcut('Search', '⌘ K / Ctrl K')}
          ${shortcut('Set entry type', '1 – 5 (in modal)')}
          ${shortcut('Save entry', '⌘ ⏎ / Ctrl ⏎')}
          ${shortcut('Close modal', 'Esc')}
        </div>
      </div>

      <div class="bg-surface-container-low rounded-2xl p-6">
        <h3 class="font-headline text-xl mb-2">Local Footprint</h3>
        <p class="font-label text-[11px] text-on-surface/50 mb-4">Stored entirely in your browser's IndexedDB. No cloud, no servers, no telemetry.</p>
        <div class="flex items-baseline gap-3 flex-wrap">
          <div class="font-headline text-2xl">${usedMB} MB</div>
          <div class="font-label text-xs text-on-surface/40 uppercase tracking-widest">used by ${all.length} entr${all.length === 1 ? 'y' : 'ies'}</div>
        </div>
        <button id="clear" class="mt-6 px-6 py-3 rounded-full bg-error-container/20 border border-error/30 text-error font-label text-xs font-bold tracking-widest hover:bg-error-container/40">
          CLEAR ALL DATA
        </button>
      </div>

      <footer class="py-8 text-center opacity-70">
        <a href="#/about" class="font-label text-xs underline underline-offset-4 hover:text-primary">About Interstice &amp; the inspiration</a>
        <p class="font-label text-[10px] mt-3 text-on-surface/40">Inspired by Novie by the Sea's video on interstitial journaling.</p>
      </footer>
    </section>`
  );

  // Theme buttons
  root.querySelector('#theme-grp').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    const t = b.dataset.theme;
    setPref('theme', t);
    applyTheme(t);
    setHTML(
      root.querySelector('#theme-grp'),
      ['dark', 'light', 'system'].map((x) => themeBtn(x, x === t)).join('')
    );
  });

  root.querySelector('#exp-md').addEventListener('click', exportMarkdown);
  root.querySelector('#exp-json').addEventListener('click', exportJson);
  root.querySelector('#imp').addEventListener('change', importJson);
  root.querySelector('#install').addEventListener('click', triggerInstall);
  root.querySelector('#clear').addEventListener('click', confirmClear);

  // Sync section — interactive
  bindSyncSection(root);
  const offStatus = onSyncStatus(() => {
    const sec = root.querySelector('#sync-section');
    if (sec) {
      setHTML(sec, renderSyncSection());
      bindSyncSection(root);
    }
  });

  // Passphrase modal — global, fires whenever sync needs to unlock.
  const offPass = onPassphraseNeeded(({ submit, cancel, envelope }) => {
    openPassphraseModal({ mode: 'unlock', submit, cancel, envelope });
  });

  return { dispose() { offStatus(); offPass(); } };
}

function themeBtn(t, active) {
  const icon = { dark: 'dark_mode', light: 'light_mode', system: 'settings_brightness' }[t];
  const label = t.charAt(0).toUpperCase() + t.slice(1);
  return `<button data-theme="${t}" class="flex flex-col items-center gap-2 p-4 rounded-xl ${
    active ? 'bg-surface-container-high border border-primary/30' : 'bg-surface-container hover:bg-surface-bright'
  } transition">
    <span class="material-symbols-outlined text-3xl ${active ? 'text-primary' : 'text-on-surface/60'}">${icon}</span>
    <span class="font-label text-[11px] uppercase tracking-widest ${active ? 'text-on-surface' : 'text-on-surface/60'}">${label}</span>
  </button>`;
}

function shortcut(label, keys) {
  return `<div class="flex justify-between items-center">
    <span class="text-on-surface-variant">${escapeHtml(label)}</span>
    <kbd class="bg-surface-container-highest px-2 py-1 rounded text-primary border border-primary/20">${escapeHtml(keys)}</kbd>
  </div>`;
}

async function exportJson() {
  const dump = await exportAll();
  download(`interstice-${stamp()}.json`, JSON.stringify(dump, null, 2), 'application/json');
}

async function exportMarkdown() {
  const dump = await exportAll();
  const byDay = new Map();
  for (const e of dump.entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  let md = `# Interstice export\n\n_Exported ${new Date().toLocaleString()}_\n\n`;
  for (const day of [...byDay.keys()].sort()) {
    md += `## ${day}\n\n`;
    for (const e of byDay.get(day).sort((a, b) => a.ts - b.ts)) {
      const time = new Date(e.ts).toLocaleTimeString();
      md += `**${time}** — _${e.type ?? 'note'}_\n\n${e.body}\n\n`;
      if ((e.tags ?? []).length) md += `Tags: ${e.tags.map((t) => '`#' + t + '`').join(' ')}\n\n`;
      const stats = [];
      if (e.mood) stats.push(`Mood ${e.mood}/5`);
      if (e.energy) stats.push(`Energy ${e.energy}/5`);
      if (stats.length) md += stats.join(' · ') + '\n\n';
      md += `---\n\n`;
    }
  }
  download(`interstice-${stamp()}.md`, md, 'text/markdown');
}

async function importJson(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    const result = await importAll(data, { merge: true });
    alert(`Imported ${result.added} entries (${result.skipped} skipped).`);
    location.hash = '#/today';
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
}

function triggerInstall() {
  if (!deferredInstall) {
    alert(
      "The browser hasn't offered install yet. Try again after using the app a bit, or use your browser's install option."
    );
    return;
  }
  deferredInstall.prompt();
  deferredInstall.userChoice.then(() => {
    deferredInstall = null;
  });
}

async function confirmClear() {
  if (!confirm('This will permanently delete every entry. Export first if you want a backup. Continue?')) return;
  if (!confirm('Last chance — really delete everything?')) return;
  await clearAll();
  alert('All entries cleared.');
  location.hash = '#/today';
}

function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ─── Sync section ────────────────────────────────────────────────────────────

function renderSyncSection() {
  const status = getSyncStatus();
  const tokenLink =
    'https://github.com/settings/tokens/new?scopes=gist&description=Interstice%20Sync';
  const header = `<h3 class="font-headline text-xl mb-3 flex items-center gap-2">
    <span class="material-symbols-outlined text-tertiary">cloud_sync</span>Sync (private GitHub gist)
  </h3>`;

  if (!status.connected) {
    return `${header}
      <p class="font-body text-sm text-on-surface/60 mb-4 italic">Optional. Sync your entries between devices via a private gist on your GitHub account. Stays under your control. Disconnect anytime.</p>
      <details class="mb-4 bg-surface-container rounded-xl p-4 group">
        <summary class="font-label text-xs cursor-pointer flex items-center gap-2 select-none">
          <span class="material-symbols-outlined text-base group-open:rotate-90 transition-transform">chevron_right</span>
          How it works
        </summary>
        <ol class="font-body text-sm text-on-surface-variant mt-3 ml-2 space-y-2 list-decimal list-inside">
          <li>Open GitHub and create a token with <code class="font-mono text-tertiary">gist</code> scope.</li>
          <li>Copy the token. Paste it below, then click Connect.</li>
          <li>The app creates one private gist on your account and syncs to it.</li>
          <li>Repeat the same setup on your other device using the same GitHub account.</li>
        </ol>
      </details>

      <div class="mb-4 bg-tertiary/10 border border-tertiary/30 rounded-xl p-4 flex gap-3">
        <span class="material-symbols-outlined text-tertiary shrink-0">save</span>
        <div class="font-body text-sm text-on-surface-variant leading-relaxed">
          <strong class="text-on-surface">Save your token somewhere safe before closing the GitHub tab.</strong>
          GitHub only shows the token <em>once</em> — after that you can't view it again. To set up sync on your other device, you'll need to paste this same token there.
          Easiest path: email it to yourself, save it in a password manager, or send it to yourself in a private chat. Treat it like a password — it grants access to your gists.
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <a href="${tokenLink}" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-primary-container text-on-primary-container font-label text-xs font-bold whitespace-nowrap hover:brightness-110">
          <span class="material-symbols-outlined text-base">open_in_new</span>
          1. Open GitHub to create token
        </a>
      </div>
      <div class="flex flex-col sm:flex-row gap-3">
        <input id="gh-token" type="password" autocomplete="off" spellcheck="false" placeholder="2. Paste token here (ghp_… or github_pat_…)"
          class="flex-1 bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
        <button id="gh-connect" class="px-6 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold tracking-widest">CONNECT</button>
      </div>
      ${status.error ? `<p class="mt-3 font-label text-xs text-error">${escapeHtml(status.error)}</p>` : ''}`;
  }

  const last = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : 'never';
  const phaseChip = phasePill(status);

  return `${header}
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-secondary">person</span>
        <div class="min-w-0">
          <div class="font-label text-sm font-semibold truncate">${escapeHtml(status.login || '?')}</div>
          <div class="font-label text-[11px] text-on-surface/50">Last sync: ${escapeHtml(last)}</div>
        </div>
      </div>
      ${phaseChip}
    </div>

    <div class="flex flex-wrap gap-3 mb-4">
      <button id="sync-now" class="px-5 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold tracking-widest">SYNC NOW</button>
      <label class="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container font-label text-xs cursor-pointer">
        <input id="auto-sync" type="checkbox" ${status.autoSync ? 'checked' : ''} class="rounded text-primary" />
        Auto-sync
      </label>
      <button id="sync-disconnect" class="ml-auto px-5 py-2.5 rounded-full border border-error/40 text-error font-label text-xs font-bold tracking-widest hover:bg-error-container/20">DISCONNECT</button>
    </div>

    ${status.gistId ? `<a href="https://gist.github.com/${escapeAttr(status.gistId)}" target="_blank" rel="noopener noreferrer"
      class="font-label text-[11px] text-on-surface/40 hover:text-primary inline-flex items-center gap-1">
      View gist on GitHub
      <span class="material-symbols-outlined text-xs">open_in_new</span>
    </a>` : '<span class="font-label text-[11px] text-on-surface/40">Gist will be created on your first sync.</span>'}
    ${status.error ? `<p class="mt-3 font-label text-xs text-error">${escapeHtml(status.error)}</p>` : ''}

    ${renderEncryptionBlock(status)}`;
}

function renderEncryptionBlock(status) {
  const heading = `<h4 class="font-headline text-base mt-8 mb-3 flex items-center gap-2">
    <span class="material-symbols-outlined text-base ${status.encryptionEnabled ? 'text-secondary' : 'text-on-surface/40'}">${status.encryptionEnabled ? 'lock' : 'lock_open'}</span>
    End-to-end encryption
  </h4>`;

  if (!status.encryptionEnabled) {
    return `<div class="border-t border-outline-variant/10 pt-2">
      ${heading}
      <p class="font-body text-sm text-on-surface/60 mb-3 italic">Off — gist is private but readable by anyone with your GitHub token. Turn on encryption to wrap the gist in AES-256 with a passphrase only you know.</p>
      <button id="enc-enable" class="px-5 py-2 rounded-full bg-secondary-container text-on-secondary-container font-label text-xs font-bold tracking-widest">ENCRYPT WITH A PASSPHRASE</button>
    </div>`;
  }

  return `<div class="border-t border-outline-variant/10 pt-2">
    ${heading}
    <p class="font-body text-sm text-on-surface/60 mb-3">Gist is wrapped in <strong class="text-on-surface not-italic">AES-256-GCM</strong> with a key derived from your passphrase via <strong class="text-on-surface not-italic">PBKDF2-SHA256</strong> (600,000 iterations). Your passphrase never leaves this device. ${status.encryptionUnlocked ? '<span class="text-secondary">Currently unlocked on this device.</span>' : '<span class="text-tertiary">Currently locked.</span>'}</p>
    <div class="flex flex-wrap gap-2">
      <button id="enc-change" class="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant font-label text-xs">Change passphrase</button>
      ${status.encryptionUnlocked ? '<button id="enc-lock" class="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant font-label text-xs">Lock now</button>' : ''}
      <button id="enc-disable" class="ml-auto px-4 py-2 rounded-full border border-error/40 text-error font-label text-xs">Turn off encryption</button>
    </div>
  </div>`;
}

function phasePill(status) {
  if (status.phase === 'syncing')
    return `<span class="font-label text-[10px] uppercase tracking-widest text-tertiary flex items-center gap-2">
      <span class="material-symbols-outlined text-base animate-spin">progress_activity</span>Syncing</span>`;
  if (status.phase === 'error')
    return `<span class="font-label text-[10px] uppercase tracking-widest text-error">Error</span>`;
  return `<span class="font-label text-[10px] uppercase tracking-widest text-secondary flex items-center gap-1">
    <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>OK</span>`;
}

function bindSyncSection(root) {
  const sec = root.querySelector('#sync-section');
  if (!sec) return;

  // Disconnected state
  const tokenInput = sec.querySelector('#gh-token');
  const connectBtn = sec.querySelector('#gh-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) { tokenInput.focus(); return; }
      connectBtn.textContent = 'CONNECTING…';
      connectBtn.disabled = true;
      try {
        const login = await connect(token);
        // Trigger first sync immediately
        await syncNow();
        // status listener will re-render
        alert(`Connected as ${login}. First sync complete.`);
      } catch (e) {
        alert(`Connect failed: ${e.message}`);
        connectBtn.textContent = 'CONNECT';
        connectBtn.disabled = false;
      }
    });
    tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectBtn.click(); });
  }

  // Connected state
  const syncBtn = sec.querySelector('#sync-now');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      try { await syncNow(); }
      catch (e) { alert(`Sync failed: ${e.message}`); }
    });
  }
  const autoBox = sec.querySelector('#auto-sync');
  if (autoBox) autoBox.addEventListener('change', (e) => setAutoSync(e.target.checked));

  const disBtn = sec.querySelector('#sync-disconnect');
  if (disBtn) {
    disBtn.addEventListener('click', async () => {
      if (!confirm('Disconnect from GitHub? Your local entries are kept. The gist on GitHub stays — you can delete it manually if you like.')) return;
      await disconnect();
    });
  }

  // Encryption controls
  const encEnable = sec.querySelector('#enc-enable');
  if (encEnable) encEnable.addEventListener('click', () => openPassphraseModal({ mode: 'set' }));

  const encChange = sec.querySelector('#enc-change');
  if (encChange) encChange.addEventListener('click', () => openPassphraseModal({ mode: 'change' }));

  const encLock = sec.querySelector('#enc-lock');
  if (encLock) encLock.addEventListener('click', async () => {
    await lockNow();
    alert('Locked. The cached key has been wiped from this device. The next sync will require your passphrase again.');
  });

  const encDisable = sec.querySelector('#enc-disable');
  if (encDisable) encDisable.addEventListener('click', async () => {
    if (!confirm('Turn off encryption? Your gist will be rewritten as plaintext on the next push. Anyone with your GitHub token will be able to read its contents.')) return;
    try { await disableEncryption(); }
    catch (e) { alert(`Could not disable: ${e.message}`); }
  });
}

// ─── Passphrase modal ──────────────────────────────────────────────────────
//
// mode: 'set' | 'change' | 'unlock'
//   set    — first-time encryption setup. Two fields, big warning.
//   change — rotate to a new passphrase. Two fields.
//   unlock — provide passphrase to decrypt the existing gist. One field.
function openPassphraseModal({ mode, submit, cancel, envelope } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const titles = { set: 'Set a passphrase', change: 'Change your passphrase', unlock: 'Enter your passphrase' };
  const blurbs = {
    set: 'Choose a passphrase to encrypt your gist. Long random phrases are stronger than short cryptic ones.',
    change: 'Pick a new passphrase. Your gist will be re-encrypted with it on the next push.',
    unlock: 'Your gist is encrypted. Enter the passphrase you set when you first turned on encryption — most likely on your other device.',
  };
  const isUnlock = mode === 'unlock';

  setHTML(
    root,
    `<div id="pp-bg" class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div class="w-full max-w-md bg-surface-container-low rounded-2xl shadow-2xl p-6 md:p-8" role="dialog" aria-modal="true">
        <div class="flex justify-between items-start mb-4">
          <h3 class="font-headline text-xl">${escapeHtml(titles[mode])}</h3>
          <button id="pp-close" aria-label="Close" class="p-1 rounded hover:bg-surface-container text-on-surface/60">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <p class="font-body text-sm text-on-surface/70 mb-4">${escapeHtml(blurbs[mode])}</p>
        ${
          mode === 'set'
            ? `<div class="bg-error-container/15 border border-error/30 rounded-xl p-3 mb-4 flex gap-3">
              <span class="material-symbols-outlined text-error shrink-0">warning</span>
              <p class="font-body text-xs text-on-surface leading-relaxed">
                <strong>If you forget this passphrase, your encrypted gist becomes unreadable forever.</strong>
                Save it somewhere safe (a password manager is ideal). You'll need to type it once on every device that syncs.
              </p>
            </div>`
            : ''
        }
        <input id="pp1" type="password" autocomplete="new-password" autofocus
          placeholder="Passphrase"
          class="w-full mb-3 bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-primary" />
        ${
          isUnlock
            ? ''
            : `<input id="pp2" type="password" autocomplete="new-password"
                placeholder="Confirm passphrase"
                class="w-full mb-3 bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-primary" />`
        }
        <div id="pp-error" class="font-label text-xs text-error mb-3 hidden"></div>
        <div class="flex gap-3 justify-end">
          <button id="pp-cancel" class="px-5 py-2 rounded-full border border-outline-variant text-on-surface-variant font-label text-xs">Cancel</button>
          <button id="pp-submit" class="px-6 py-2 rounded-full bg-primary text-on-primary font-label text-xs font-bold tracking-widest">${isUnlock ? 'UNLOCK' : 'SAVE'}</button>
        </div>
      </div>
    </div>`
  );

  const close = () => {
    document.removeEventListener('keydown', onKey);
    setHTML(root, '');
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
    if (e.key === 'Enter' && document.activeElement?.id?.startsWith('pp')) { e.preventDefault(); doSubmit(); }
  };
  document.addEventListener('keydown', onKey);

  const errEl = root.querySelector('#pp-error');
  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  };

  const doCancel = () => {
    if (cancel) cancel();
    close();
  };

  const doSubmit = async () => {
    const v1 = root.querySelector('#pp1').value;
    const v2 = root.querySelector('#pp2')?.value;
    if (!v1 || v1.length < 4) return showError('Passphrase too short (min 4 characters).');
    if (!isUnlock && v1 !== v2) return showError("The two passphrases don't match.");

    const submitBtn = root.querySelector('#pp-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = isUnlock ? 'UNLOCKING…' : 'SAVING…';
    try {
      if (mode === 'set') await enableEncryption(v1);
      else if (mode === 'change') await changePassphrase(v1);
      else if (mode === 'unlock') await submit(v1); // resolves the unlock promise; will throw if wrong
      close();
      if (mode === 'set') alert('Encryption is on. Your gist is now encrypted with your passphrase.');
    } catch (e) {
      showError(e.message || String(e));
      submitBtn.disabled = false;
      submitBtn.textContent = isUnlock ? 'UNLOCK' : 'SAVE';
    }
  };

  root.querySelector('#pp-submit').addEventListener('click', doSubmit);
  root.querySelector('#pp-cancel').addEventListener('click', doCancel);
  root.querySelector('#pp-close').addEventListener('click', doCancel);
  root.querySelector('#pp-bg').addEventListener('click', (e) => { if (e.target.id === 'pp-bg') doCancel(); });
}
