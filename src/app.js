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

  const viewRoot = document.getElementById('view-root');
  // Belt-and-braces splash dismissal:
  //  1) the router fires route:changed when the first view renders, AND
  //  2) a MutationObserver fires when content first lands in view-root.
  // Whichever wins, dismissSplash is idempotent.
  document.addEventListener('route:changed', dismissSplash, { once: true });
  const mo = new MutationObserver(() => {
    if (viewRoot.firstChild) {
      mo.disconnect();
      dismissSplash();
    }
  });
  mo.observe(viewRoot, { childList: true });

  mountRouter(viewRoot);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Service worker is best-effort; failing here is fine in dev.
    });
  }
}

function dismissSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 400); // matches CSS transition
}

boot().catch((err) => {
  console.error('Interstice failed to boot:', err);
  const root = document.getElementById('view-root');
  if (root) {
    root.textContent = 'Failed to start. See console for details.';
  }
  dismissSplash();
});

// Hard fallback: even if boot hangs, never trap the user on the splash longer
// than 8 s. They'll see whatever did manage to render (or a blank state).
setTimeout(dismissSplash, 8000);
