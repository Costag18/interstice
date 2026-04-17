// hybrid.js — Desk view. Journal (Today) and Stickies side-by-side on wide
// screens, stacked vertically on narrow ones. The view has no topbar of its
// own so the two panes can claim the full viewport; a small floating bar
// (sync indicator + swap button) hovers centered at the top. A draggable
// divider between the panes lets the user change the split ratio.
//
// FAB lives inside the journal pane only — it's the "new entry" shortcut
// and doesn't belong over the stickies side.

import { syncIndicator } from '../components/topbar.js';
import { hideFab } from '../components/fab.js';
import { openNewEntryModal } from './new-entry.js';
import { setHTML } from '../safe-dom.js';
import { getPrefs, setPref } from '../helpers/prefs.js';

const MIN_RATIO = 0.18;
const MAX_RATIO = 0.82;

export async function render(root) {
  // Global FAB is hidden — we render a pane-local one inside the journal
  // pane so the user can't hit "new entry" from over the stickies side.
  hideFab();

  const prefs = getPrefs();
  let swapped = !!prefs.hybridSwap;
  let splitRatio = clampRatio(prefs.hybridSplit);

  const ac = new AbortController();
  const signal = ac.signal;

  // Floating top-center bar. Fixed to the viewport so it sits above both
  // panes regardless of the sidebar / mobile nav. Holds the sync indicator
  // and the swap button — the minimal controls the Desk still needs.
  const floatingBar = `
    <div class="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2
      bg-surface-container/70 backdrop-blur-md rounded-full px-3 py-1.5
      border border-outline-variant/15 shadow-lg">
      ${syncIndicator()}
      <span class="w-px h-4 bg-outline-variant/30"></span>
      <button type="button" data-hybrid-swap aria-label="Swap panes" title="Swap panes"
        class="flex items-center gap-1.5 px-2 py-1 rounded-full font-label text-[10px] uppercase tracking-widest
        text-on-surface/60 hover:text-on-surface hover:bg-surface-container-high transition-colors">
        <span class="material-symbols-outlined text-base">swap_horiz</span>
        <span class="hidden sm:inline">Swap</span>
      </button>
    </div>`;

  // Outer container: full viewport height minus the mobile bottom-nav (on
  // desktop the nav is hidden so the full 100dvh is usable).
  // The grid inside is a flex container with two panes and one divider.
  setHTML(
    root,
    `${floatingBar}
     <section class="h-[calc(100dvh-5.5rem)] md:h-[100dvh] px-0">
       <div data-hybrid-grid class="h-full flex flex-col lg:flex-row">
         <div data-pane="journal"
           class="min-h-0 overflow-y-auto bg-surface-container-low/30 relative">
           <!-- today.js mounts into the host; keeping it a separate child
                means the FAB wrapper below survives today.js's setHTML
                rebuilds. min-height:100% makes the host at least as tall
                as the pane's viewport so the sticky-bottom FAB wrapper
                below it lands on the pane's bottom edge even when today.js
                is in its empty state with very little content. -->
           <div data-journal-host style="min-height: 100%"></div>
           <!-- Zero-height sticky wrapper at the end of the pane. bottom:0
                pins it to the pane viewport's bottom; the FAB inside is
                absolutely positioned so it hovers above that pin point. -->
           <div class="sticky bottom-0 h-0 pointer-events-none z-20">
             <button type="button" data-desk-fab aria-label="New entry"
               class="absolute right-4 bottom-4 w-14 h-14 rounded-full bg-primary text-on-primary
               shadow-lg hover:scale-105 active:scale-95 transition-transform
               flex items-center justify-center pointer-events-auto">
               <span class="material-symbols-outlined text-3xl">add</span>
             </button>
           </div>
         </div>
         <div data-divider class="hybrid-divider" role="separator" aria-orientation="vertical"
           aria-label="Resize panes" tabindex="0"></div>
         <div data-pane="stickies"
           class="min-h-0 overflow-y-auto bg-surface-container-low/30 relative"></div>
       </div>
     </section>`
  );

  applyLayout();

  // Swap
  root.querySelector('[data-hybrid-swap]').addEventListener('click', () => {
    swapped = !swapped;
    setPref('hybridSwap', swapped);
    applyLayout();
  }, { signal });

  // Pane-local FAB → new-entry modal
  root.querySelector('[data-desk-fab]').addEventListener('click', () => {
    openNewEntryModal();
  }, { signal });

  // Draggable divider
  wireDivider(root, () => ({
    swapped,
    setRatio(r) { splitRatio = clampRatio(r); applyRatio(); },
    commitRatio() { setPref('hybridSplit', splitRatio); },
  }), signal);

  function applyLayout() {
    const grid = root.querySelector('[data-hybrid-grid]');
    if (!grid) return;
    grid.classList.toggle('flex-col', !swapped);
    grid.classList.toggle('lg:flex-row', !swapped);
    grid.classList.toggle('flex-col-reverse', swapped);
    grid.classList.toggle('lg:flex-row-reverse', swapped);
    applyRatio();
  }

  function applyRatio() {
    const journalPane = root.querySelector('[data-pane="journal"]');
    const stickiesPane = root.querySelector('[data-pane="stickies"]');
    if (!journalPane || !stickiesPane) return;
    // flex-grow carries the ratio; flex-basis 0 lets it grow from zero.
    journalPane.style.flex = `${splitRatio} 1 0`;
    stickiesPane.style.flex = `${1 - splitRatio} 1 0`;
  }

  const journalHost = root.querySelector('[data-journal-host]');
  const stickiesPane = root.querySelector('[data-pane="stickies"]');
  const [todayMod, stickiesMod] = await Promise.all([
    import('./today.js'),
    import('./stickies.js'),
  ]);
  const todayHandle = await todayMod.render(journalHost, { embedded: true });
  const stickiesHandle = await stickiesMod.render(stickiesPane, { embedded: true });

  return {
    dispose() {
      try { todayHandle?.dispose?.(); } catch {}
      try { stickiesHandle?.dispose?.(); } catch {}
      ac.abort();
      document.body.classList.remove('hybrid-resizing');
    },
  };
}

function clampRatio(r) {
  const n = typeof r === 'number' && Number.isFinite(r) ? r : 0.5;
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, n));
}

// Attach pointer handlers to the divider. `getCtx()` is a callback so we
// always read the latest swapped / setRatio / commitRatio from the caller's
// closure (swapped can change mid-session; we don't want a stale snapshot).
function wireDivider(root, getCtx, signal) {
  const divider = root.querySelector('[data-divider]');
  if (!divider) return;

  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const { swapped } = getCtx();
    const grid = root.querySelector('[data-hybrid-grid]');
    if (!grid) return;
    const horizontal = window.matchMedia('(min-width: 1024px)').matches;

    try { divider.setPointerCapture(e.pointerId); } catch {}
    divider.classList.add('hybrid-dragging');
    document.body.classList.add('hybrid-resizing');

    const onMove = (ev) => {
      const rect = grid.getBoundingClientRect();
      let raw;
      if (horizontal) {
        raw = (ev.clientX - rect.left) / rect.width;
      } else {
        raw = (ev.clientY - rect.top) / rect.height;
      }
      // flex-row-reverse / flex-col-reverse flip the visual order, so the
      // cursor position along the axis now measures the *other* pane. Invert.
      if (swapped) raw = 1 - raw;
      getCtx().setRatio(raw);
    };

    const onUp = () => {
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
      divider.removeEventListener('pointercancel', onUp);
      try { divider.releasePointerCapture(e.pointerId); } catch {}
      divider.classList.remove('hybrid-dragging');
      document.body.classList.remove('hybrid-resizing');
      getCtx().commitRatio();
    };

    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
    divider.addEventListener('pointercancel', onUp);
  }, { signal });
}
