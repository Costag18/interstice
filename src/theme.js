// theme.js — Apply dark/light/system theme by toggling html classes
// and updating the theme-color meta. Listens for system changes.

import { getPrefs } from './helpers/prefs.js';

export function applyStoredTheme() {
  applyTheme(getPrefs().theme);
}

export function applyTheme(theme /* 'dark' | 'light' | 'system' */) {
  const root = document.documentElement;
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && sysDark);
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1a120b' : '#f5ebdd');
}

// React to system-theme changes when the user's preference is "system".
if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (getPrefs().theme === 'system') applyStoredTheme();
  });
}
