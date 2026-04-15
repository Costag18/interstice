// app.js — Boot sequence for Interstice.
// 1. Apply stored theme (so first paint is correct).
// 2. Open IndexedDB (memoized; views call openDB themselves too).
// 3. Render persistent navigation (sidebar + bottom tabs).
// 4. Register global keyboard shortcuts.
// 5. Mount the hash router into #view-root.
// 6. Register the service worker (best-effort; no-op when unsupported).

import { openDB } from './db.js';
import { applyStoredTheme } from './theme.js';
import { mountRouter } from './router.js';
import { renderNav } from './components/nav.js';
import { registerShortcuts } from './shortcuts.js';
import { getPrefs } from './helpers/prefs.js';
import { startAutoSync } from './sync.js';

async function boot() {
  applyStoredTheme();
  await openDB();
  renderNav(document.getElementById('nav-root'));
  registerShortcuts();
  startAutoSync(); // pulls on boot if a token is stored, debounces pushes after writes

  // First-launch redirect to onboarding (only if no explicit hash already).
  if (!getPrefs().onboarded && !location.hash) {
    location.hash = '#/onboarding';
  }

  mountRouter(document.getElementById('view-root'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Service worker is best-effort; failing here is fine in dev.
    });
  }
}

boot().catch((err) => {
  console.error('Interstice failed to boot:', err);
  const root = document.getElementById('view-root');
  if (root) {
    root.textContent = 'Failed to start. See console for details.';
  }
});
