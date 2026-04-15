// topbar.js — Returns the markup string for the sticky top header used on most views.

import { escapeHtml } from '../safe-dom.js';

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
      <div class="flex items-center gap-4 text-on-surface/50 shrink-0">
        <span class="material-symbols-outlined" title="All entries are saved on this device only">cloud_off</span>
        ${right}
      </div>
    </header>`;
}
