// day-detail.js — Past-day timeline + summary stats + mood sparkline.

import { listEntriesByDay } from '../db.js';
import { formatTime, formatDateLong, parseDayKey, elapsedBetween } from '../helpers/date.js';
import { showFab } from '../components/fab.js';
import { navigate } from '../router.js';
import { setHTML, escapeHtml } from '../safe-dom.js';

export async function render(root, params) {
  showFab();
  const day = params._?.[0];
  if (!day) {
    navigate('#/calendar');
    return { dispose() {} };
  }
  const entries = await listEntriesByDay(day);

  const totalMin = entries.length > 1 ? Math.round((entries[entries.length - 1].ts - entries[0].ts) / 60000) : 0;
  const tagCounts = new Map();
  for (const e of entries) for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const moods = entries.filter((e) => e.mood != null).map((e) => e.mood);
  const avgMood = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : '—';

  setHTML(
    root,
    `
    <header class="px-6 md:px-12 pt-8 md:pt-12 pb-6 flex items-center gap-4">
      <button id="back" aria-label="Back" class="p-2 -ml-2 rounded-full hover:bg-surface-container text-on-surface/70">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="min-w-0">
        <span class="font-label text-[10px] text-tertiary uppercase tracking-[0.2em]">Day Detail</span>
        <h2 class="text-2xl md:text-3xl font-headline italic leading-tight">${escapeHtml(formatDateLong(parseDayKey(day)))}</h2>
      </div>
    </header>
    <section class="px-6 md:px-12 max-w-4xl mx-auto mb-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      ${stat('Entries', String(entries.length), 'edit_note')}
      ${stat('Hours tracked', formatHours(totalMin), 'avg_pace')}
      ${stat('Top tag', topTag ? '#' + escapeHtml(topTag) : '—', 'sell')}
      ${stat('Avg mood', String(avgMood), 'favorite')}
    </section>
    ${moods.length ? `
      <section class="px-6 md:px-12 max-w-4xl mx-auto mb-12">
        <div class="bg-surface-container-low rounded-2xl p-6">
          <span class="font-label text-[10px] uppercase tracking-widest text-on-surface/50 block mb-3">Mood Trajectory</span>
          ${sparkline(moods)}
        </div>
      </section>` : ''}
    <section class="px-6 md:px-12 max-w-3xl mx-auto pb-12">
      ${entries.length ? renderTimeline(entries) : `<p class="font-headline italic text-on-surface/40 py-12 text-center">No entries on this day.</p>`}
    </section>`
  );

  root.querySelector('#back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else navigate('#/calendar');
  });
  return { dispose() {} };
}

function stat(label, value, icon) {
  return `<div class="bg-surface-container-low p-4 rounded-xl">
    <div class="flex items-center gap-2 text-on-surface/40 mb-1">
      <span class="material-symbols-outlined text-base">${icon}</span>
      <span class="font-label text-[10px] uppercase tracking-widest">${escapeHtml(label)}</span>
    </div>
    <div class="font-headline text-xl md:text-2xl truncate">${value}</div>
  </div>`;
}

function formatHours(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function sparkline(values) {
  const w = 320,
    h = 40,
    max = 5,
    min = 1;
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - ((v - min) / (max - min)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full h-12 text-primary">
    <polyline fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />
  </svg>`;
}

function renderTimeline(entries) {
  return entries
    .map((e, i) => {
      const gap = i > 0
        ? `<div class="h-12 flex items-center pl-4 my-1">
            <div class="dashed-line w-px h-full"></div>
            <span class="ml-6 font-label text-[10px] uppercase tracking-widest text-on-surface/30 italic">${elapsedBetween(entries[i - 1].ts, e.ts)} pause</span>
          </div>`
        : '';
      const tags = (e.tags ?? []).length
        ? `<div class="flex gap-2 mt-3 flex-wrap">${e.tags
            .map((t) => `<span class="font-label text-[11px] text-tertiary/70">#${escapeHtml(t)}</span>`)
            .join('')}</div>`
        : '';
      return (
        gap +
        `<article class="bg-surface-container-low rounded-xl p-6 md:p-8 mb-2">
          <div class="flex justify-between items-start mb-3">
            <span class="font-label text-[11px] text-on-surface/60 tracking-wider">${formatTime(e.ts)}</span>
            ${e.type ? `<span class="font-label text-[10px] uppercase tracking-widest text-tertiary">${escapeHtml(e.type)}</span>` : ''}
          </div>
          <p class="text-lg font-headline leading-relaxed whitespace-pre-wrap">${escapeHtml(e.body)}</p>
          ${tags}
        </article>`
      );
    })
    .join('');
}
