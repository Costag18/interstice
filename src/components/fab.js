// fab.js — Floating action button. Mounts/unmounts cleanly per route.

import { setHTML } from '../safe-dom.js';
import { openNewEntryModal } from '../views/new-entry.js';

let mounted = false;

export function showFab() {
  if (mounted) return;
  const root = document.getElementById('fab-root');
  setHTML(
    root,
    `<button id="fab" aria-label="New entry"
      class="fixed bottom-24 right-6 md:bottom-12 md:right-12 w-16 h-16 rounded-full bg-primary text-on-primary shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40">
      <span class="material-symbols-outlined text-3xl">add</span>
    </button>`
  );
  document.getElementById('fab').addEventListener('click', () => openNewEntryModal());
  mounted = true;
}

export function hideFab() {
  const root = document.getElementById('fab-root');
  if (root) setHTML(root, '');
  mounted = false;
}
