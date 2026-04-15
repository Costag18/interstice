// new-entry.js — Bottom-sheet modal for creating or editing an entry.
//
// API:
//   openNewEntryModal({ entry?, onSaved? })  — entry present means "edit mode".
//   render(root) is a no-op; the modal isn't a route, but new-entry.js still has
//   to expose render so the router can lazy-import it.

import { addEntry, updateEntry, getAllTags } from '../db.js';
import { setHTML, escapeHtml, escapeAttr } from '../safe-dom.js';

const TYPES = [
  { id: 'finished', label: 'Finished', icon: 'done_all' },
  { id: 'starting', label: 'Starting Next', icon: 'forward' },
  { id: 'feeling', label: 'Feeling', icon: 'favorite' },
  { id: 'distraction', label: 'Distraction', icon: 'bolt' },
  { id: 'idea', label: 'Idea', icon: 'lightbulb' },
];

const PROMPTS = {
  finished: 'What did you just finish?',
  starting: "What's next?",
  feeling: 'How are you feeling?',
  distraction: 'What pulled you away?',
  idea: 'Capture the spark…',
  null: 'Take a breath, then capture the moment.',
};

export function render(root) {
  // Routing here is a no-op; the modal is opened imperatively.
  location.hash = '#/today';
  return { dispose() {} };
}

export async function openNewEntryModal({ entry = null, onSaved = () => {} } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const editing = !!entry;
  const state = {
    ts: entry?.ts ?? Date.now(),
    type: entry?.type ?? null,
    body: entry?.body ?? '',
    mood: entry?.mood ?? null,
    energy: entry?.energy ?? null,
    tags: Array.isArray(entry?.tags) ? [...entry.tags] : [],
  };

  const allTags = await getAllTags();

  setHTML(root, modalMarkup(state, allTags, editing));

  const tsInput = root.querySelector('#ts-input');
  tsInput.value = toLocalInputValue(state.ts);

  const bodyInput = root.querySelector('#body-input');
  setTimeout(() => bodyInput.focus(), 60);

  const close = () => {
    document.removeEventListener('keydown', onGlobalKey);
    setHTML(root, '');
  };

  const onGlobalKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      doSave(false);
    }
  };
  document.addEventListener('keydown', onGlobalKey);

  root.querySelector('#close-btn').addEventListener('click', close);
  root.querySelector('#modal-bg').addEventListener('click', (e) => {
    if (e.target.id === 'modal-bg') close();
  });

  tsInput.addEventListener('input', (e) => {
    const v = parseLocalInputValue(e.target.value);
    if (!Number.isNaN(v)) state.ts = v;
  });

  bodyInput.addEventListener('input', (e) => {
    state.body = e.target.value;
  });

  root.querySelector('#type-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-type]');
    if (!c) return;
    state.type = state.type === c.dataset.type ? null : c.dataset.type;
    setHTML(root.querySelector('#type-chips'), TYPES.map((t) => chip(t, state.type === t.id)).join(''));
    bodyInput.placeholder = PROMPTS[state.type ?? 'null'];
  });

  ['mood', 'energy'].forEach((key) => {
    root.querySelector(`[data-slider="${key}"]`).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-val]');
      if (!btn) return;
      const v = Number(btn.dataset.val);
      state[key] = state[key] === v ? null : v;
      setHTML(root.querySelector(`[data-slider="${key}"] .dots`), dotsMarkup(key, state[key]));
    });
  });

  bindTagInput(root, state, allTags);

  root.querySelector('#save').addEventListener('click', () => doSave(false));
  const saveAdd = root.querySelector('#save-add');
  if (saveAdd) saveAdd.addEventListener('click', () => doSave(true));

  // Number keys 1..5 set the entry type when not typing in body.
  root.addEventListener('keydown', (e) => {
    if (e.target === bodyInput) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '1' && e.key <= '5') {
      const idx = Number(e.key) - 1;
      if (TYPES[idx]) {
        state.type = state.type === TYPES[idx].id ? null : TYPES[idx].id;
        setHTML(root.querySelector('#type-chips'), TYPES.map((t) => chip(t, state.type === t.id)).join(''));
        bodyInput.placeholder = PROMPTS[state.type ?? 'null'];
      }
    }
  });

  async function doSave(addAnother) {
    if (!state.body.trim()) {
      bodyInput.focus();
      bodyInput.classList.add('ring-2', 'ring-error');
      setTimeout(() => bodyInput.classList.remove('ring-2', 'ring-error'), 800);
      return;
    }
    try {
      if (editing) await updateEntry(entry.id, state);
      else await addEntry(state);
      toast('saved on this device');
      onSaved();
      if (addAnother) {
        state.ts = Date.now();
        state.type = null;
        state.body = '';
        state.mood = null;
        state.energy = null;
        state.tags = [];
        tsInput.value = toLocalInputValue(state.ts);
        bodyInput.value = '';
        bodyInput.placeholder = PROMPTS.null;
        setHTML(root.querySelector('#type-chips'), TYPES.map((t) => chip(t, false)).join(''));
        setHTML(root.querySelector('[data-slider="mood"] .dots'), dotsMarkup('mood', null));
        setHTML(root.querySelector('[data-slider="energy"] .dots'), dotsMarkup('energy', null));
        rerenderTagArea(root, state, allTags);
        bodyInput.focus();
      } else {
        close();
      }
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    }
  }
}

// ─── Markup helpers ─────────────────────────────────────────────────────────

function modalMarkup(state, allTags, editing) {
  return `
    <div id="modal-bg" class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 bg-black/50 backdrop-blur-sm">
      <div class="w-full md:max-w-2xl bg-surface-container-low rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="p-6 md:p-10 space-y-8">
          <div class="flex justify-between items-start gap-4">
            <div class="min-w-0">
              <label class="font-label text-[10px] text-on-surface/50 uppercase tracking-widest block mb-1" for="ts-input">When</label>
              <input id="ts-input" type="datetime-local"
                class="bg-transparent border-b border-dashed border-outline-variant text-lg md:text-xl font-headline focus:outline-none focus:border-primary" />
            </div>
            <button id="close-btn" aria-label="Close"
              class="p-2 rounded-full hover:bg-surface-container text-on-surface/60">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div id="type-chips" class="flex flex-wrap gap-2">${TYPES.map((t) =>
            chip(t, state.type === t.id)
          ).join('')}</div>

          <div>
            <label class="sr-only" for="body-input">Entry body</label>
            <textarea id="body-input" rows="5" placeholder="${escapeAttr(PROMPTS[state.type ?? 'null'])}"
              class="w-full bg-transparent border-none p-0 text-xl md:text-2xl font-headline leading-relaxed focus:ring-0 placeholder-on-surface/30 resize-none">${escapeHtml(
                state.body
              )}</textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            ${slider('mood', 'Mood', state.mood)}
            ${slider('energy', 'Energy', state.energy)}
          </div>

          <div>
            <label class="font-label text-[10px] text-on-surface/50 uppercase tracking-widest block mb-2">Tags</label>
            <div id="tag-area" class="flex flex-wrap gap-2 p-3 rounded-xl bg-surface-container">
              ${state.tags.map(renderTag).join('')}
              <input id="tag-input" list="tag-list" placeholder="+ add tag"
                class="bg-transparent border-none focus:ring-0 text-sm font-label flex-1 min-w-[8rem] p-0 placeholder-on-surface/40" />
            </div>
            <datalist id="tag-list">${allTags
              .map((t) => `<option value="${escapeAttr(t.tag)}"></option>`)
              .join('')}</datalist>
          </div>
        </div>

        <div class="bg-surface-container-high/50 px-6 md:px-10 py-5 flex justify-between items-center gap-4 sticky bottom-0">
          <span class="hidden md:flex gap-3 opacity-50 font-label text-[10px] uppercase tracking-widest text-on-surface">
            <span><kbd class="px-1.5 py-0.5 border border-on-surface/30 rounded">⌘ ⏎</kbd> save</span>
            <span><kbd class="px-1.5 py-0.5 border border-on-surface/30 rounded">Esc</kbd> close</span>
            <span><kbd class="px-1.5 py-0.5 border border-on-surface/30 rounded">1–5</kbd> type</span>
          </span>
          <div class="flex gap-3 ml-auto">
            ${editing ? '' : `<button id="save-add" class="px-5 py-2.5 rounded-full border border-outline-variant text-on-surface-variant font-label text-xs hover:bg-surface-container">Save & Add Another</button>`}
            <button id="save" class="px-8 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold">${
              editing ? 'Save Changes' : 'Save Entry'
            }</button>
          </div>
        </div>
      </div>
    </div>`;
}

function chip(t, active) {
  const cls = active
    ? 'bg-primary/15 border-primary text-primary'
    : 'border-outline-variant/30 text-on-surface/70 hover:border-primary/50';
  return `<button data-type="${t.id}"
    class="px-4 py-2 rounded-full border ${cls} font-label text-xs flex items-center gap-2 transition-colors">
    <span class="material-symbols-outlined text-sm">${t.icon}</span>${t.label}</button>`;
}

function slider(key, label, value) {
  return `<div data-slider="${key}" class="space-y-2">
    <label class="font-label text-[10px] text-on-surface/50 uppercase tracking-widest">${label}</label>
    <div class="dots">${dotsMarkup(key, value)}</div>
  </div>`;
}

function dotsMarkup(key, value) {
  const fill = key === 'mood' ? 'bg-primary' : 'bg-secondary';
  let out = '<div class="flex gap-3">';
  for (let v = 1; v <= 5; v++) {
    const active = value && v <= value;
    out += `<button data-val="${v}" aria-label="Set ${key} ${v}"
      class="w-3 h-3 rounded-full ${active ? fill : 'bg-surface-variant hover:bg-on-surface/20'} transition-colors"></button>`;
  }
  out += '</div>';
  return out;
}

function renderTag(t) {
  return `<span class="bg-surface-container-high px-3 py-1 rounded-md text-[11px] font-label flex items-center gap-1.5">
    #${escapeHtml(t)}
    <button data-rm-tag="${escapeAttr(t)}" class="text-on-surface/40 hover:text-error" aria-label="Remove tag">
      <span class="material-symbols-outlined text-[12px]">close</span>
    </button>
  </span>`;
}

function bindTagInput(root, state, allTags) {
  const area = root.querySelector('#tag-area');
  area.addEventListener('click', (e) => {
    const x = e.target.closest('[data-rm-tag]');
    if (!x) return;
    state.tags = state.tags.filter((t) => t !== x.dataset.rmTag);
    rerenderTagArea(root, state, allTags);
  });
  attachTagInputHandler(root, state, allTags);
}

function attachTagInputHandler(root, state, allTags) {
  const input = root.querySelector('#tag-input');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      const t = input.value.trim().replace(/^#/, '');
      if (!state.tags.includes(t)) state.tags.push(t);
      input.value = '';
      rerenderTagArea(root, state, allTags);
    } else if (e.key === 'Backspace' && !input.value && state.tags.length) {
      state.tags.pop();
      rerenderTagArea(root, state, allTags);
    }
  });
}

function rerenderTagArea(root, state, allTags) {
  const area = root.querySelector('#tag-area');
  setHTML(
    area,
    `${state.tags.map(renderTag).join('')}
    <input id="tag-input" list="tag-list" placeholder="+ add tag"
      class="bg-transparent border-none focus:ring-0 text-sm font-label flex-1 min-w-[8rem] p-0 placeholder-on-surface/40" />`
  );
  const input = root.querySelector('#tag-input');
  input.focus();
  attachTagInputHandler(root, state, allTags);
}

function toLocalInputValue(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInputValue(s) {
  return new Date(s).getTime();
}

function toast(msg) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className =
    'toast bg-surface-container-high text-on-surface px-4 py-2 rounded-full shadow-xl font-label text-xs flex items-center gap-2 border border-outline-variant/20';
  setHTML(
    el,
    `<span class="material-symbols-outlined text-base text-secondary">check_circle</span>${escapeHtml(msg)}`
  );
  root.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
