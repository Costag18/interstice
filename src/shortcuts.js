// shortcuts.js — Global keyboard shortcuts.
//   N        — open new entry modal (when not typing in a field)
//   ⌘K/Ctrl+K — go to search
// Modal-internal shortcuts (Esc, ⌘⏎, 1–5) live in views/new-entry.js.

import { navigate } from './router.js';
import { openNewEntryModal } from './views/new-entry.js';

export function registerShortcuts() {
  document.addEventListener('keydown', (e) => {
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const inEditable = document.activeElement?.isContentEditable;

    // ⌘K / Ctrl+K — go to search (works even from a field)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      navigate('#/search');
      return;
    }

    if (inField || inEditable) return;

    // N — new entry (skip when a modal is already open)
    if ((e.key === 'n' || e.key === 'N') && !document.getElementById('modal-bg')) {
      e.preventDefault();
      openNewEntryModal({
        onSaved: () => {
          if (location.hash === '#/today' || location.hash === '') {
            // re-render today by replaying the route
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }
        },
      });
    }
  });
}
