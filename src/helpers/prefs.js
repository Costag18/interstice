// prefs.js — Tiny localStorage-backed user preferences.

const KEY = 'interstice:prefs';
const defaults = { theme: 'system', onboarded: false };

export function getPrefs() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

export function setPref(key, value) {
  const p = getPrefs();
  p[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    console.warn('localStorage write failed', e);
  }
  return p;
}
