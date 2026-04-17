// router.js — Hash-based router. Lazy-loads each view module on first visit.
//
// Patterns:
//   #/today
//   #/calendar?month=YYYY-MM
//   #/day/YYYY-MM-DD
//   #/search?q=...
//   #/settings
//   #/about
//   #/onboarding

const routes = new Map();
let currentDispose = null;
let viewRoot = null;

function registerRoute(name, loader) {
  routes.set(name, loader);
}

export function mountRouter(root) {
  viewRoot = root;
  registerRoute('today', () => import('./views/today.js'));
  registerRoute('calendar', () => import('./views/calendar.js'));
  registerRoute('day', () => import('./views/day-detail.js'));
  registerRoute('stickies', () => import('./views/stickies.js'));
  registerRoute('hybrid', () => import('./views/hybrid.js'));
  registerRoute('search', () => import('./views/search.js'));
  registerRoute('about', () => import('./views/about.js'));
  registerRoute('settings', () => import('./views/settings.js'));
  registerRoute('onboarding', () => import('./views/onboarding.js'));

  window.addEventListener('hashchange', handle);
  if (!location.hash) location.hash = '#/today';
  else handle();
}

export function navigate(hash) {
  if (location.hash === hash) handle();
  else location.hash = hash;
}

async function handle() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  const name = segments[0] || 'today';
  const rest = segments.slice(1);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (rest.length) params._ = rest;

  const loader = routes.get(name) ?? routes.get('today');
  if (currentDispose) {
    try {
      currentDispose();
    } catch (e) {
      console.warn('view dispose failed', e);
    }
    currentDispose = null;
  }
  while (viewRoot.firstChild) viewRoot.removeChild(viewRoot.firstChild);

  try {
    const mod = await loader();
    const result = await mod.render(viewRoot, params);
    currentDispose = result?.dispose ?? null;
  } catch (e) {
    console.error(`view "${name}" failed to render`, e);
    viewRoot.textContent = `Failed to render ${name}. See console.`;
  }

  document.dispatchEvent(new CustomEvent('route:changed', { detail: { name } }));
  window.scrollTo(0, 0);
}
