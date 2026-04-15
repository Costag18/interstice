// calendar.js — Month grid showing entry-count intensity per day, with a streak counter.

import { listEntriesByRange, dayKey, onDbChanged } from '../db.js';
import { renderTopbar } from '../components/topbar.js';
import { showFab } from '../components/fab.js';
import { calcStreak } from '../helpers/date.js';
import { navigate } from '../router.js';
import { setHTML } from '../safe-dom.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function render(root, params) {
  showFab();

  // Cursor month — defaults to today
  const cursor = params.month ? parseMonth(params.month) : new Date();
  cursor.setDate(1);
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

  const [entries, streakSrc] = await Promise.all([
    listEntriesByRange(monthStart, monthEnd),
    listEntriesByRange(Date.now() - 60 * 86400 * 1000, Date.now()),
  ]);

  const byDay = new Map();
  for (const e of entries) {
    const arr = byDay.get(e.day) ?? [];
    arr.push(e);
    byDay.set(e.day, arr);
  }
  const streakDays = [...new Set(streakSrc.map((e) => e.day))].sort((a, b) => b.localeCompare(a));
  const streak = calcStreak(streakDays);

  setHTML(
    root,
    `${renderTopbar({ title: 'Calendar', subtitle: 'Your reflections, mapped' })}
    <section class="px-6 md:px-12 max-w-6xl mx-auto">
      <div class="flex justify-between items-center mb-8 gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <button data-nav="prev" aria-label="Previous month"
            class="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface/70">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <h3 class="text-2xl font-headline">${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}</h3>
          <button data-nav="next" aria-label="Next month"
            class="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface/70">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div class="bg-surface-container-low px-4 py-2 rounded-xl flex items-center gap-2">
          <span class="text-lg">🔥</span>
          <span class="font-label text-sm font-semibold text-primary">${streak}-day streak</span>
        </div>
      </div>
      <div class="bg-surface-container-low rounded-3xl p-4 md:p-10">
        <div class="grid grid-cols-7 gap-y-4 text-center">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            .map((d) => `<div class="font-label text-[10px] uppercase tracking-widest text-on-surface/30">${d}</div>`)
            .join('')}
          ${renderDays(cursor, byDay)}
        </div>
      </div>
    </section>`
  );

  root.querySelector('[data-nav="prev"]').addEventListener('click', () => {
    const m = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    navigate(`#/calendar?month=${formatMonth(m)}`);
  });
  root.querySelector('[data-nav="next"]').addEventListener('click', () => {
    const m = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    navigate(`#/calendar?month=${formatMonth(m)}`);
  });
  root.querySelectorAll('[data-day]').forEach((c) => {
    c.addEventListener('click', () => navigate(`#/day/${c.dataset.day}`));
  });

  // Refresh on any DB change (local edit OR remote pull)
  const off = onDbChanged(() => { render(root, params); });
  return { dispose() { off(); } };
}

function renderDays(cursor, byDay) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = first.getDay();
  const lastDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const todayKey = dayKey(Date.now());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div></div>');
  for (let d = 1; d <= lastDate; d++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const count = (byDay.get(key) ?? []).length;
    const intensity = count === 0 ? 'opacity-0' : count < 2 ? 'bg-primary/30' : count < 4 ? 'bg-primary/60' : 'bg-primary';
    const isToday = key === todayKey;
    const numCls = isToday
      ? 'text-on-surface font-bold ring-2 ring-primary/40 rounded-full w-9 h-9 flex items-center justify-center'
      : 'text-on-surface/50';
    cells.push(`
      <button data-day="${key}" aria-label="${d}, ${count} entries"
        class="h-20 flex flex-col items-center gap-2 rounded-lg hover:bg-surface-container transition cursor-pointer">
        <span class="font-headline text-lg ${numCls}">${d}</span>
        <span class="w-2 h-2 rounded-full ${intensity}"></span>
      </button>`);
  }
  return cells.join('');
}

function parseMonth(s) {
  const [y, m] = s.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function formatMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
