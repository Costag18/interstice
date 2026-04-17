// nav.js — Persistent navigation. Sidebar on >=md, bottom-tab on mobile.

import { navigate } from '../router.js';
import { setHTML } from '../safe-dom.js';
import { getPrefs, setPref } from '../helpers/prefs.js';

const items = [
  { name: 'today', label: 'Today', icon: 'edit_note' },
  { name: 'stickies', label: 'Stickies', icon: 'sticky_note_2' },
  { name: 'calendar', label: 'Calendar', icon: 'calendar_month' },
  { name: 'search', label: 'Search', icon: 'search' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export function renderNav(root) {
  const sidebarLinks = items.map(sideLink).join('');
  const bottomLinks = items.map(bottomLink).join('');

  // Apply persisted sidebar state before paint so main content margin stays
  // in sync without a flash.
  applySidebarState(getPrefs().sidebarCollapsed);

  const markup = `
    <aside class="hidden md:flex h-screen fixed left-0 top-0 flex-col py-8 bg-background z-30 border-r border-outline-variant/10 sidebar" data-side>
      <div class="sidebar-head mb-10 px-4">
        <h1 class="text-2xl font-headline italic text-on-surface sidebar-title">Interstice</h1>
        <p class="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface/40 mt-1 sidebar-sub">The Analog Pause</p>
      </div>
      <nav class="flex-1 space-y-2 px-3" data-nav="side">${sidebarLinks}</nav>
      <div class="mt-auto px-4 py-3 flex items-center gap-2 text-on-surface/40 sidebar-foot">
        <span class="material-symbols-outlined text-base">lock</span>
        <span class="font-label text-[10px] uppercase tracking-widest sidebar-foot-text">Saved on this device</span>
      </div>
      <button type="button" data-sidebar-toggle aria-label="Collapse sidebar"
        class="absolute top-4 -right-3 w-6 h-6 rounded-full bg-surface-container-high border border-outline-variant/20
        flex items-center justify-center text-on-surface/60 hover:text-on-surface hover:bg-surface-container-highest transition-colors shadow">
        <span class="material-symbols-outlined text-base sidebar-toggle-icon">chevron_left</span>
      </button>
    </aside>
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-container/95 backdrop-blur-xl border-t border-outline-variant/10 px-2 py-2 flex justify-around" data-nav="bottom">
      ${bottomLinks}
    </nav>`;

  setHTML(root, markup);

  root.addEventListener('click', (e) => {
    const tog = e.target.closest('[data-sidebar-toggle]');
    if (tog) {
      e.preventDefault();
      const next = !getPrefs().sidebarCollapsed;
      setPref('sidebarCollapsed', next);
      applySidebarState(next);
      return;
    }
    const a = e.target.closest('[data-go]');
    if (!a) return;
    e.preventDefault();
    navigate(`#/${a.dataset.go}`);
  });

  document.addEventListener('route:changed', (e) => updateActive(e.detail.name));
  updateActive(location.hash.replace(/^#\//, '').split('/')[0] || 'today');
}

// Apply the collapsed/expanded state to the document root so CSS can drive
// sidebar width + main content margin in one shot. Also flip the toggle icon.
function applySidebarState(collapsed) {
  document.documentElement.classList.toggle('sidebar-collapsed', !!collapsed);
  const icon = document.querySelector('.sidebar-toggle-icon');
  if (icon) icon.textContent = collapsed ? 'chevron_right' : 'chevron_left';
  const btn = document.querySelector('[data-sidebar-toggle]');
  if (btn) btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

function sideLink(it) {
  return `<a href="#/${it.name}" data-go="${it.name}" data-name="${it.name}" title="${it.label}"
    class="sidebar-link flex items-center gap-4 py-3 px-4 rounded-lg text-on-surface/60 hover:bg-surface-container hover:text-on-surface transition-colors">
    <span class="material-symbols-outlined">${it.icon}</span>
    <span class="font-label text-sm tracking-tight sidebar-link-label">${it.label}</span></a>`;
}

function bottomLink(it) {
  return `<a href="#/${it.name}" data-go="${it.name}" data-name="${it.name}"
    class="flex flex-col items-center gap-1 px-4 py-2 text-on-surface/60 hover:text-primary transition-colors">
    <span class="material-symbols-outlined">${it.icon}</span>
    <span class="font-label text-[10px]">${it.label}</span></a>`;
}

function updateActive(name) {
  document.querySelectorAll('[data-name]').forEach((el) => {
    const active = el.dataset.name === name;
    const isSide = !!el.closest('[data-nav="side"]');
    el.classList.toggle('text-primary', active);
    el.classList.toggle('font-bold', active && isSide);
    el.classList.toggle('bg-surface-container', active && isSide);
    el.classList.toggle('border-l-2', active && isSide);
    el.classList.toggle('border-primary', active && isSide);
    el.classList.toggle('text-on-surface/60', !active);
  });
}
