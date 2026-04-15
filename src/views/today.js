// today.js — The main timeline view for the current day.

import { listEntriesByDay, deleteEntry, getEntry, dayKey, onDbChanged } from '../db.js';
import {
  formatTime,
  formatDateLong,
  formatWeekday,
  greetingFor,
  elapsedBetween,
} from '../helpers/date.js';
import { renderTopbar } from '../components/topbar.js';
import { showFab } from '../components/fab.js';
import { openNewEntryModal } from './new-entry.js';
import { setHTML, escapeHtml } from '../safe-dom.js';

const TYPE_META = {
  finished: { label: '✓ Finished', color: 'text-secondary', border: 'border-secondary/40' },
  starting: { label: '→ Starting Next', color: 'text-tertiary', border: 'border-tertiary/40' },
  feeling: { label: '♡ Feeling', color: 'text-error', border: 'border-error/40' },
  distraction: { label: '⚡ Distraction', color: 'text-on-tertiary-container', border: 'border-on-tertiary-container/40' },
  idea: { label: '💡 Idea', color: 'text-primary', border: 'border-primary/40' },
};

export async function render(root) {
  showFab();
  const today = dayKey(Date.now());
  const now = Date.now();

  setHTML(
    root,
    `${renderTopbar({
      title: `${greetingFor(now)}, ${formatWeekday(now)}`,
      subtitle: formatDateLong(now),
    })}
    <section id="timeline" class="px-6 md:px-12 max-w-3xl mx-auto"></section>`
  );

  const refresh = async () => {
    const entries = await listEntriesByDay(today);
    setHTML(
      root.querySelector('#timeline'),
      entries.length ? renderTimeline(entries) : renderEmpty()
    );
    bindEntryActions(root, refresh);
    bindEmptyAction(root, refresh);
    scrollToLatest(root);
  };

  await refresh();

  // Auto-refresh whenever the DB changes — covers:
  //   • local saves (FAB → modal → addEntry)
  //   • local edits/deletes
  //   • remote sync pulls
  const off = onDbChanged(() => { refresh(); });
  return { dispose() { off(); } };
}

// Scroll the page to the bottom so the latest entry is in view.
// Triggered on initial render, after every save, and after every remote pull.
//
// We intentionally always scroll — the user explicitly asked for this even when
// new entries arrive via sync from another device. If you've manually scrolled
// up to read an old entry and then a sync brings in a new one, you'll be moved
// back to the bottom — this matches the "live timeline" feel they want.
function scrollToLatest(root) {
  // Two rAFs: first lets the new DOM commit, second lets the browser layout it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const articles = root.querySelectorAll('#timeline article');
      if (!articles.length) return;
      // window.scrollTo is more reliable than scrollIntoView for "go to absolute bottom"
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth',
      });
    });
  });
}

function renderTimeline(entries) {
  const parts = [];
  entries.forEach((e, i) => {
    parts.push(renderCard(e));
    if (i < entries.length - 1) parts.push(renderGap(e.ts, entries[i + 1].ts));
  });
  return parts.join('');
}

function renderCard(e) {
  const meta = TYPE_META[e.type] ?? { label: '', color: '', border: 'border-outline-variant/20' };
  const tagsHTML = (e.tags ?? [])
    .map((t) => `<span class="font-label text-[11px] text-tertiary/70">#${escapeHtml(t)}</span>`)
    .join(' ');
  const moodHTML = e.mood
    ? `<div class="flex gap-1 items-center">
        <span class="font-label text-[10px] text-on-surface/40 uppercase tracking-widest">Mood</span>
        ${dots(e.mood, 'bg-primary')}
      </div>`
    : '';
  const energyHTML = e.energy
    ? `<div class="flex gap-1 items-center">
        <span class="font-label text-[10px] text-on-surface/40 uppercase tracking-widest">Energy</span>
        ${dots(e.energy, 'bg-secondary')}
      </div>`
    : '';
  const typePill = e.type
    ? `<span class="font-label text-[10px] uppercase tracking-widest ${meta.color}">${meta.label}</span>`
    : '';

  return `
    <article data-id="${escapeHtml(e.id)}"
      class="bg-surface-container-low rounded-xl p-6 md:p-8 border-l-2 ${meta.border} relative group mb-2">
      <div class="flex justify-between items-start mb-3 gap-3">
        <span class="font-label text-[11px] text-on-surface/60 tracking-wider">${formatTime(e.ts)}</span>
        ${typePill}
      </div>
      <p class="text-lg md:text-xl font-headline leading-relaxed text-on-surface whitespace-pre-wrap">${escapeHtml(
        e.body
      )}</p>
      <div class="flex items-center gap-4 mt-4 flex-wrap">${moodHTML} ${energyHTML} ${tagsHTML}</div>
      <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition flex gap-1">
        <button data-act="edit" aria-label="Edit"
          class="p-1.5 rounded hover:bg-surface-container-high text-on-surface/40 hover:text-on-surface">
          <span class="material-symbols-outlined text-base">edit</span>
        </button>
        <button data-act="delete" aria-label="Delete"
          class="p-1.5 rounded hover:bg-surface-container-high text-on-surface/40 hover:text-error">
          <span class="material-symbols-outlined text-base">delete</span>
        </button>
      </div>
    </article>`;
}

function renderGap(prevTs, nextTs) {
  return `<div class="h-16 flex items-center pl-6 my-1">
    <div class="dashed-line w-px h-full"></div>
    <span class="font-label text-[10px] text-on-surface/30 uppercase tracking-widest ml-6 italic">${elapsedBetween(
      prevTs,
      nextTs
    )} pause</span>
  </div>`;
}

function renderEmpty() {
  return `
    <div class="py-24 text-center">
      <div class="text-6xl mb-4 opacity-40">🌿</div>
      <h3 class="font-headline italic text-2xl mb-2">A blank page</h3>
      <p class="font-label text-sm text-on-surface/50 mb-8 max-w-xs mx-auto">Nothing captured yet today. Take a breath, then add the moment.</p>
      <button id="empty-add" class="px-6 py-3 rounded-full bg-primary text-on-primary font-label text-xs font-bold tracking-wider">ADD YOUR FIRST ENTRY</button>
    </div>`;
}

function dots(n, cls) {
  let out = '<div class="flex gap-1">';
  for (let i = 0; i < 5; i++) {
    out += `<span class="w-1.5 h-1.5 rounded-full ${i < n ? cls : 'bg-surface-variant'}"></span>`;
  }
  out += '</div>';
  return out;
}

function bindEntryActions(root, refresh) {
  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const action = btn.dataset.act;
      if (action === 'delete') {
        if (!confirm('Delete this entry?')) return;
        await deleteEntry(id);
        refresh();
      } else if (action === 'edit') {
        const entry = await getEntry(id);
        openNewEntryModal({ entry, onSaved: refresh });
      }
    });
  });
}

function bindEmptyAction(root, refresh) {
  const btn = root.querySelector('#empty-add');
  if (btn) btn.addEventListener('click', () => openNewEntryModal({ onSaved: refresh }));
}
