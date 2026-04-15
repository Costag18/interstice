// topbar.js — Returns the markup string for the sticky top header used on most views.
//
// The right-side cluster shows:
//   • a sync indicator (cloud_off when not connected, cloud_done when synced,
//     spinning progress when syncing, error when failing). The whole cluster
//     links to Settings so users can act on it.
//   • whatever the caller passes via `right`.

import { escapeHtml } from '../safe-dom.js';
import { getSyncStatus } from '../sync.js';

export function renderTopbar({ title, subtitle, right = '' } = {}) {
  return `
    <header class="flex justify-between items-start px-6 md:px-12 pt-8 md:pt-12 pb-6 gap-4">
      <div class="min-w-0">
        ${
          subtitle
            ? `<span class="font-label text-[10px] text-tertiary uppercase tracking-[0.2em]">${escapeHtml(
                subtitle
              )}</span>`
            : ''
        }
        <h2 class="text-3xl md:text-4xl font-headline italic text-on-surface mt-1 leading-tight">${escapeHtml(
          title || ''
        )}</h2>
      </div>
      <div class="flex items-center gap-3 text-on-surface/50 shrink-0">
        ${syncIndicator()}
        ${right}
      </div>
    </header>`;
}

function syncIndicator() {
  const s = getSyncStatus();
  if (!s.connected) {
    return `<a href="#/settings" title="Saved on this device only — click to set up sync"
      class="flex items-center gap-1.5 text-on-surface/40 hover:text-on-surface transition">
      <span class="material-symbols-outlined">cloud_off</span>
    </a>`;
  }
  if (s.phase === 'syncing') {
    return `<a href="#/settings" title="Syncing now…"
      class="flex items-center gap-1.5 text-tertiary">
      <span class="material-symbols-outlined animate-spin">progress_activity</span>
      <span class="hidden sm:inline font-label text-[10px] uppercase tracking-widest">Syncing</span>
    </a>`;
  }
  if (s.phase === 'error') {
    return `<a href="#/settings" title="Sync error — click for details"
      class="flex items-center gap-1.5 text-error">
      <span class="material-symbols-outlined">cloud_off</span>
      <span class="hidden sm:inline font-label text-[10px] uppercase tracking-widest">Sync error</span>
    </a>`;
  }
  const last = s.lastSyncAt ? relativeTime(s.lastSyncAt) : 'never';
  return `<a href="#/settings" title="Last synced ${escapeHtml(last)}"
    class="flex items-center gap-1.5 text-secondary hover:text-on-surface transition">
    <span class="material-symbols-outlined">cloud_done</span>
    <span class="hidden sm:inline font-label text-[10px] uppercase tracking-widest">${escapeHtml(last)}</span>
  </a>`;
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
