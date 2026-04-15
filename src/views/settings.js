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
import { setHTML, escapeHtml } from '../safe-dom.js';

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

  return { dispose() {} };
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
