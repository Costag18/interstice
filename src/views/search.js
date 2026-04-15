// search.js — Live search across all entries with type/tag/mood filters.

import { searchEntries, getAllTags, onDbChanged } from '../db.js';
import { formatDateShort, formatWeekday } from '../helpers/date.js';
import { renderTopbar } from '../components/topbar.js';
import { showFab } from '../components/fab.js';
import { navigate } from '../router.js';
import { setHTML, escapeHtml, escapeAttr } from '../safe-dom.js';

const RECENT_KEY = 'interstice:recent-search';

export async function render(root, params) {
  showFab();
  const initialQ = params.q ?? '';
  const tags = await getAllTags();

  setHTML(
    root,
    `${renderTopbar({ title: 'Search', subtitle: 'Find a moment' })}
    <section class="px-6 md:px-12 max-w-4xl mx-auto">
      <div class="relative mb-6">
        <span class="absolute left-0 top-1/2 -translate-y-1/2 text-primary pointer-events-none">
          <span class="material-symbols-outlined text-2xl md:text-3xl">search</span>
        </span>
        <input id="q" type="search" placeholder="Search for ideas, feelings, tags…" value="${escapeAttr(initialQ)}"
          class="w-full bg-transparent border-none focus:ring-0 text-2xl md:text-4xl font-headline italic placeholder:text-on-surface/20 pl-12 py-3" />
      </div>
      ${renderRecents()}
      <div id="filters" class="flex flex-wrap gap-2 mb-8 border-y border-outline-variant/10 py-4">
        ${typeFilter()}
        ${tagFilter(tags)}
        ${moodFilter()}
      </div>
      <div id="results" class="space-y-6"></div>
    </section>`
  );

  const state = { q: initialQ, types: [], tags: [], mood: null };
  const qEl = root.querySelector('#q');
  qEl.focus();

  let timer;
  qEl.addEventListener('input', () => {
    state.q = qEl.value;
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  qEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveRecent(state.q);
      run();
    }
  });

  // Recent chips
  root.querySelectorAll('[data-recent]').forEach((el) => {
    el.addEventListener('click', () => {
      qEl.value = el.dataset.recent;
      state.q = el.dataset.recent;
      run();
    });
  });

  // Filters
  root.querySelector('#filters').addEventListener('change', () => {
    state.types = [...root.querySelectorAll('[data-filter="type"]:checked')].map((c) => c.value);
    state.tags = [...root.querySelectorAll('[data-filter="tag"]:checked')].map((c) => c.value);
    const moodEl = root.querySelector('[data-filter="mood"]:checked');
    state.mood = moodEl ? Number(moodEl.value) : null;
    run();
  });

  await run();
  // Re-run the search if entries arrive via remote sync
  const off = onDbChanged(() => { run(); });

  async function run() {
    const results = await searchEntries(state);
    const out = root.querySelector('#results');
    if (!results.length) {
      const empty = state.q || state.types.length || state.tags.length || state.mood !== null ? 'Nothing found' : 'Type something to begin';
      setHTML(
        out,
        `<div class="py-20 text-center opacity-40">
          <span class="material-symbols-outlined text-5xl mb-2 block">auto_awesome</span>
          <p class="font-headline italic text-xl">${empty}</p>
        </div>`
      );
      return;
    }
    setHTML(out, results.map((e) => card(e, state.q)).join(''));
    out.querySelectorAll('[data-day]').forEach((a) => {
      a.addEventListener('click', () => navigate(`#/day/${a.dataset.day}`));
    });
  }

  return { dispose() { off(); } };
}

function card(e, q) {
  const snippet = highlight(e.body, q);
  const tags = (e.tags ?? []).length
    ? `<div class="flex gap-2 mt-2 flex-wrap">${e.tags
        .map((t) => `<span class="text-[10px] font-label px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface/40">#${escapeHtml(t)}</span>`)
        .join('')}</div>`
    : '';
  return `<article data-day="${escapeAttr(e.day)}" class="grid md:grid-cols-[140px_1fr] gap-3 md:gap-4 group cursor-pointer p-3 -mx-3 rounded-lg hover:bg-surface-container-low transition">
    <div class="md:pt-1">
      <p class="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface/40">${formatDateShort(e.ts)}</p>
      <p class="font-label text-[10px] text-tertiary/50 italic mt-1">${formatWeekday(e.ts)}</p>
    </div>
    <div>
      <p class="font-headline text-lg leading-snug group-hover:text-primary transition whitespace-pre-wrap">${snippet}</p>
      ${tags}
    </div>
  </article>`;
}

function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q || !q.trim()) return safe;
  const pattern = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${pattern})`, 'ig');
  return safe.replace(re, '<mark class="bg-primary/20 text-primary px-0.5 rounded">$1</mark>');
}

function typeFilter() {
  const types = ['finished', 'starting', 'feeling', 'distraction', 'idea'];
  return `<details class="relative">
    <summary class="list-none cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-primary/30">
      <span class="material-symbols-outlined text-sm">auto_stories</span>
      <span class="font-label text-xs">Entry type</span>
      <span class="material-symbols-outlined text-xs">keyboard_arrow_down</span>
    </summary>
    <div class="absolute mt-2 bg-surface-container rounded-xl p-3 z-20 border border-outline-variant/20 space-y-1 shadow-xl min-w-[10rem]">
      ${types
        .map(
          (t) =>
            `<label class="flex items-center gap-2 font-label text-xs px-2 py-1 cursor-pointer hover:bg-surface-container-high rounded">
              <input type="checkbox" data-filter="type" value="${t}" class="rounded text-primary"> ${t}</label>`
        )
        .join('')}
    </div>
  </details>`;
}

function tagFilter(tags) {
  if (!tags.length) return '';
  return `<details class="relative">
    <summary class="list-none cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-primary/30">
      <span class="material-symbols-outlined text-sm">sell</span>
      <span class="font-label text-xs">Tags</span>
      <span class="material-symbols-outlined text-xs">keyboard_arrow_down</span>
    </summary>
    <div class="absolute mt-2 bg-surface-container rounded-xl p-3 z-20 border border-outline-variant/20 max-h-64 overflow-auto space-y-1 min-w-[14rem] shadow-xl">
      ${tags
        .map(
          (t) =>
            `<label class="flex items-center gap-2 font-label text-xs px-2 py-1 cursor-pointer hover:bg-surface-container-high rounded">
              <input type="checkbox" data-filter="tag" value="${escapeAttr(t.tag)}" class="rounded text-primary">
              <span>#${escapeHtml(t.tag)}</span>
              <span class="ml-auto text-on-surface/30">${t.count}</span>
            </label>`
        )
        .join('')}
    </div>
  </details>`;
}

function moodFilter() {
  return `<details class="relative">
    <summary class="list-none cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-primary/30">
      <span class="material-symbols-outlined text-sm">favorite</span>
      <span class="font-label text-xs">Mood</span>
      <span class="material-symbols-outlined text-xs">keyboard_arrow_down</span>
    </summary>
    <div class="absolute mt-2 bg-surface-container rounded-xl p-3 z-20 border border-outline-variant/20 flex gap-3 shadow-xl">
      ${[1, 2, 3, 4, 5]
        .map(
          (v) =>
            `<label class="flex flex-col items-center gap-1 cursor-pointer">
              <input type="radio" name="mood" data-filter="mood" value="${v}" class="text-primary">
              <span class="font-label text-[10px]">${v}</span>
            </label>`
        )
        .join('')}
    </div>
  </details>`;
}

function renderRecents() {
  let recents = [];
  try {
    recents = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    recents = [];
  }
  if (!recents.length) return '';
  return `<div class="mt-4 mb-6 flex flex-wrap gap-2 items-center">
    <span class="font-label text-[10px] uppercase tracking-widest text-on-surface/40 mr-2">Recent</span>
    ${recents
      .slice(0, 5)
      .map(
        (q) =>
          `<button data-recent="${escapeAttr(q)}" class="px-3 py-1 rounded-full bg-surface-container text-on-surface/70 font-label text-xs hover:bg-surface-container-high">${escapeHtml(q)}</button>`
      )
      .join('')}
  </div>`;
}

function saveRecent(q) {
  if (!q || !q.trim()) return;
  let recents = [];
  try {
    recents = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    recents = [];
  }
  recents = [q.trim(), ...recents.filter((x) => x !== q.trim())].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}
