// hybrid.js — Desk view. Journal (Today) and Stickies side-by-side on wide
// screens, stacked vertically on narrow ones. A single Swap button flips the
// order (left↔right on wide, top↔bottom on narrow). Each pane renders the
// real Today / Stickies view in embedded mode so features stay in sync
// without a separate implementation.

import { renderTopbar } from '../components/topbar.js';
import { showFab } from '../components/fab.js';
import { setHTML } from '../safe-dom.js';
import { getPrefs, setPref } from '../helpers/prefs.js';

export async function render(root) {
  // The journal pane owns the FAB — it's the shortcut for "new entry"
  // which belongs to the journal side of the desk.
  showFab();

  let swapped = !!getPrefs().hybridSwap;

  const swapBtn = `
    <button type="button" data-hybrid-swap aria-label="Swap panes" title="Swap panes"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label text-[10px] uppercase tracking-widest
      bg-surface-container text-on-surface/60 hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined text-base">swap_horiz</span>
      <span class="hidden sm:inline">Swap</span>
    </button>`;

  // The outer container locks to the viewport (minus topbar and mobile
  // bottom-nav), the inner grid fills the remaining height, and the two
  // panes each flex-1 with their own overflow — so journal and stickies
  // scroll independently.
  setHTML(
    root,
    `${renderTopbar({ title: 'Desk', subtitle: 'Journal · Stickies', right: swapBtn })}
     <section class="px-4 md:px-8 lg:px-12 max-w-7xl mx-auto" style="height: calc(100dvh - 11rem);">
       <div data-hybrid-grid class="h-full flex flex-col lg:flex-row gap-4">
         <div data-pane="journal"
           class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-surface-container-low/30 border border-outline-variant/15 relative"></div>
         <div data-pane="stickies"
           class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-surface-container-low/30 border border-outline-variant/15 relative"></div>
       </div>
     </section>`
  );

  applySwap();

  const ac = new AbortController();
  root.querySelector('[data-hybrid-swap]').addEventListener('click', () => {
    swapped = !swapped;
    setPref('hybridSwap', swapped);
    applySwap();
  }, { signal: ac.signal });

  function applySwap() {
    const grid = root.querySelector('[data-hybrid-grid]');
    if (!grid) return;
    // Swap uses -reverse variants at both breakpoints so the button flips
    // both the landscape (row) and portrait (col) layouts in one click.
    grid.classList.toggle('flex-col', !swapped);
    grid.classList.toggle('lg:flex-row', !swapped);
    grid.classList.toggle('flex-col-reverse', swapped);
    grid.classList.toggle('lg:flex-row-reverse', swapped);
  }

  const journalPane = root.querySelector('[data-pane="journal"]');
  const stickiesPane = root.querySelector('[data-pane="stickies"]');

  const [todayMod, stickiesMod] = await Promise.all([
    import('./today.js'),
    import('./stickies.js'),
  ]);
  const todayHandle = await todayMod.render(journalPane, { embedded: true });
  const stickiesHandle = await stickiesMod.render(stickiesPane, { embedded: true });

  return {
    dispose() {
      try { todayHandle?.dispose?.(); } catch {}
      try { stickiesHandle?.dispose?.(); } catch {}
      ac.abort();
    },
  };
}
