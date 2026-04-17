// stickies.js — The Stickies view. Implements the two analog methods from
// Novie by the Sea's sticky-notes video:
//   1. Brain Dump  — unload everything, drag into NOW / LATER piles, toss the rest.
//   2. Parking Lot — capture interrupting thoughts while you work; triage later.
//
// Method 3 (interstitial journaling on sticky notes) from the same video lives
// on the Today view — it's the core Interstice experience already.
//
// Sticky notes are stored in their own IndexedDB store (`notes`), entirely
// separate from journal entries. They have their own sync pipeline pass via
// the existing gist payload and their own tombstones. They do not show up in
// the Today timeline, search, or calendar — stickies and journal are separate
// products sharing a shell.

import {
  addNote,
  updateNote,
  deleteNote,
  listAllNotes,
  onDbChanged,
} from '../db.js';
import { renderTopbar } from '../components/topbar.js';
import { hideFab } from '../components/fab.js';
import { setHTML, escapeHtml } from '../safe-dom.js';

// Three paper colors drawn from the existing walnut palette. Rotated deterministically
// per note based on creation time so stickies never all look identical.
const PAPER_COLORS = {
  honey: { bg: '#f0bd8b', ink: '#2a1a06' },
  terracotta: { bg: '#ffb59a', ink: '#431301' },
  sage: { bg: '#b1ceb0', ink: '#1d3621' },
};
const PAPER_ORDER = ['honey', 'terracotta', 'sage'];

const PEN_COLORS = {
  black: '#1a1308',
  blue: '#1f4fd1',
  red: '#c42b2b',
};

// Coordinate system for the per-sticky SVG stroke layer. Fixed viewBox so strokes
// scale with the rendered sticky regardless of screen size.
const CANVAS_SIZE = 100;

// Main entry point called by the router.
export async function render(root, params) {
  hideFab();

  // View state — lives in a closure so it's scoped to this mount and cleaned
  // up when the router disposes the view.
  const state = {
    tab: params?.tab === 'parking' ? 'parking' : 'dump',
    drawMode: false,
    pen: 'black',       // 'black' | 'blue' | 'red'
    eraser: false,
    notes: [],
    menuOpenFor: null,  // note id whose ⋯ menu is open
    composerColor: 'honey', // picked paper color for the next sticky
    // `busy` = a pointer-based operation is in progress (drag/draw/erase/
    // animating away). While busy, paint() is suppressed so a mid-operation
    // sync-pull or DB-change doesn't wipe the SVG stroke being drawn, the
    // sticky being dragged, or the shred animation. Any paint() attempted
    // during busy sets paintPending — flushed once the op completes.
    busy: false,
    paintPending: false,
  };

  // Is the user typing into an input/textarea inside this view? If so, a
  // setHTML repaint would blow away the in-progress edit (editInline's
  // textarea, or a composer draft). Treat that the same as `busy`.
  function hasFocusedEditor() {
    const a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && root.contains(a));
  }

  // Rebuild the DOM tree from scratch. Stickies are cheap to re-render and
  // this lets us stay stateless at the element level — no fragile diffing.
  // Listeners live on the stable `root` element and persist across re-paints —
  // attaching them here (only once) prevents handler duplication on every DB
  // change, which would otherwise flip toggle-state twice per click.
  async function paint() {
    if (state.busy || hasFocusedEditor()) {
      state.paintPending = true;
      return;
    }
    state.notes = await listAllNotes();
    setHTML(root, shellMarkup(state));
    const surface = root.querySelector('[data-surface]');
    paintSurface(surface, state);
  }

  function setBusy(on) {
    state.busy = on;
    if (!on) tryFlushPending();
  }
  function tryFlushPending() {
    if (state.paintPending && !state.busy && !hasFocusedEditor()) {
      state.paintPending = false;
      paint();
    }
  }
  // Expose on state so the free-standing pointer handlers can toggle busy
  // without an extra arg threaded through every signature.
  state.setBusy = setBusy;

  // An AbortController lets every listener on `root` / `document` be torn
  // down in one call on view dispose — otherwise they'd leak across mounts
  // (navigate away and back) and duplicate every toggle.
  const ac = new AbortController();
  const signal = ac.signal;

  // When focus leaves a composer/textarea, retry any deferred paint so the
  // surface catches up to remote changes that arrived while the user was typing.
  root.addEventListener('focusout', () => setTimeout(tryFlushPending, 0), { signal });

  wireHeader(root, state, paint, signal);
  wireSurfaceDelegated(root, state, paint, signal);
  await paint();
  const unsub = onDbChanged(paint);

  // Close any open ⋯ menu if the user clicks outside.
  const onDocClick = (e) => {
    if (!state.menuOpenFor) return;
    const menu = root.querySelector('[data-menu]');
    const trigger = root.querySelector(`[data-menu-toggle="${state.menuOpenFor}"]`);
    if (menu && !menu.contains(e.target) && trigger && !trigger.contains(e.target)) {
      state.menuOpenFor = null;
      paint();
    }
  };
  document.addEventListener('pointerdown', onDocClick, { signal });

  return {
    dispose() {
      unsub();
      ac.abort();
    },
  };
}

// ─── Top-level markup ───────────────────────────────────────────────────────

function shellMarkup(state) {
  const dumpActive = state.tab === 'dump';
  const parkingActive = state.tab === 'parking';
  // Wrap the topbar in a sticky container so the drawing toolbar (which
  // lives in its right slot) floats at the top of the viewport as the user
  // scrolls through a long pile of stickies.
  return `
    <div class="sticky top-0 z-20 bg-background/90 backdrop-blur-sm">
      ${renderTopbar({
        title: 'Sticky notes',
        subtitle: 'Brain dump · Parking lot',
        right: drawToolbar(state),
      })}
    </div>
    <section class="px-4 md:px-12 max-w-6xl mx-auto pb-32">
      <div class="flex gap-1 p-1 rounded-full bg-surface-container-low w-max mx-auto mb-6" role="tablist">
        ${tabBtn('dump', 'Brain dump', dumpActive)}
        ${tabBtn('parking', 'Parking lot', parkingActive)}
      </div>
      <p class="text-center text-xs md:text-sm font-label uppercase tracking-[0.2em] text-on-surface/40 mb-6">
        ${dumpActive
          ? 'Empty your head · drag into Now or Later · toss the rest'
          : 'Capture every interrupting thought · triage when you come up for air'}
      </p>
      <div data-surface data-tab="${state.tab}" data-draw-mode="${state.drawMode ? '1' : '0'}" data-eraser-mode="${state.eraser ? '1' : '0'}"></div>
    </section>`;
}

function tabBtn(name, label, active) {
  const cls = active
    ? 'bg-primary text-on-primary'
    : 'text-on-surface/60 hover:text-on-surface';
  return `<button type="button" data-tab-go="${name}"
    class="px-5 py-2 rounded-full font-label text-xs uppercase tracking-[0.2em] transition-colors ${cls}">
    ${escapeHtml(label)}
  </button>`;
}

// Toolbar in the topbar's right slot — toggles draw mode, picks pen color, eraser.
function drawToolbar(state) {
  const penBtn = (color) => {
    const active = state.drawMode && !state.eraser && state.pen === color;
    const style = `background:${PEN_COLORS[color]}`;
    const ring = active ? 'ring-2 ring-offset-2 ring-offset-background ring-on-surface' : '';
    return `<button type="button" data-pen="${color}" aria-label="${color} pen"
      class="w-7 h-7 rounded-full transition-transform ${ring} ${state.drawMode ? '' : 'opacity-40'}"
      style="${style}"></button>`;
  };
  const eraserActive = state.drawMode && state.eraser;
  return `
    <div class="flex items-center gap-2">
      <button type="button" data-draw-toggle aria-pressed="${state.drawMode}"
        title="Toggle draw mode"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label text-[10px] uppercase tracking-widest transition-colors
        ${state.drawMode ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface/60 hover:text-on-surface'}">
        <span class="material-symbols-outlined text-base">edit</span>
        <span class="hidden sm:inline">${state.drawMode ? 'Drawing' : 'Draw'}</span>
      </button>
      ${penBtn('black')}
      ${penBtn('blue')}
      ${penBtn('red')}
      <button type="button" data-eraser aria-pressed="${eraserActive}" title="Eraser"
        class="w-7 h-7 rounded-full flex items-center justify-center transition-colors
        ${eraserActive ? 'bg-on-surface text-background' : 'bg-surface-container text-on-surface/60'}
        ${state.drawMode ? '' : 'opacity-40'}">
        <span class="material-symbols-outlined text-base">ink_eraser</span>
      </button>
    </div>`;
}

// ─── Surface (the current tab's board) ──────────────────────────────────────

function paintSurface(surface, state) {
  setHTML(surface, state.tab === 'dump' ? dumpMarkup(state) : parkingMarkup(state));
}

function dumpMarkup(state) {
  const byBucket = { unsorted: [], now: [], later: [] };
  for (const n of state.notes) {
    if (n.kind !== 'dump') continue;
    const b = byBucket[n.bucket] ? n.bucket : 'unsorted';
    byBucket[b].push(n);
  }
  return `
    ${composerMarkup('dump', state)}
    <div class="mt-6">
      ${pileMarkup('unsorted', 'Unsorted', byBucket.unsorted, state, {
        hint: 'New stickies land here. Drag them into Now or Later.',
        accent: 'text-on-surface/40',
      })}
    </div>
    <div class="mt-6 grid md:grid-cols-2 gap-4 md:gap-6">
      ${pileMarkup('now', 'Now', byBucket.now, state, {
        hint: 'Actually happens today.',
        accent: 'text-primary',
      })}
      ${pileMarkup('later', 'Later', byBucket.later, state, {
        hint: 'Matters, but not today.',
        accent: 'text-secondary',
      })}
    </div>
    ${trashBarMarkup()}`;
}

function parkingMarkup(state) {
  const notes = state.notes.filter((n) => n.kind === 'parking');
  return `
    ${composerMarkup('parking', state)}
    <div class="mt-6">
      ${pileMarkup('parking', 'Parking lot', notes, state, {
        hint: 'Interrupting thoughts live here until you come up for air.',
        accent: 'text-tertiary',
      })}
    </div>
    ${trashBarMarkup()}`;
}

function composerMarkup(kind, state) {
  const placeholder =
    kind === 'parking'
      ? 'A thought just interrupted you. Write it down, Enter, back to work.'
      : 'One thought per note. Press Enter to capture another.';
  const swatch = (c) => {
    const active = state.composerColor === c;
    const ring = active ? 'ring-2 ring-offset-2 ring-offset-background ring-on-surface' : 'opacity-60 hover:opacity-100';
    return `<button type="button" data-composer-color="${c}" aria-label="${c} paper"
      class="w-5 h-5 rounded-full transition ${ring}"
      style="background:${PAPER_COLORS[c].bg}"></button>`;
  };
  return `
    <div class="bg-surface-container-low/60 rounded-2xl p-4 md:p-5 border border-outline-variant/20">
      <label class="block font-label text-[10px] uppercase tracking-[0.25em] text-on-surface/50 mb-2">
        ${kind === 'parking' ? 'Park a thought' : 'New sticky'}
      </label>
      <div class="flex gap-3 items-stretch">
        <input type="text" data-composer="${kind}" autocomplete="off"
          placeholder="${escapeHtml(placeholder)}"
          class="flex-1 bg-transparent border-b border-outline-variant/30 focus:border-primary outline-none
          py-2 text-base md:text-lg font-body placeholder:text-on-surface/30">
        <button type="button" data-composer-submit="${kind}"
          class="px-4 py-2 rounded-full bg-primary text-on-primary font-label text-xs uppercase tracking-widest
          hover:brightness-110 active:scale-95 transition">
          Capture
        </button>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <span class="font-label text-[10px] uppercase tracking-[0.25em] text-on-surface/40">Paper</span>
        ${swatch('honey')}${swatch('terracotta')}${swatch('sage')}
      </div>
    </div>`;
}

function pileMarkup(bucket, label, notes, state, { hint, accent } = {}) {
  const bodyCls =
    bucket === 'now' || bucket === 'later'
      ? 'min-h-[180px] bg-surface-container/40'
      : bucket === 'parking'
      ? 'min-h-[220px] bg-surface-container/30'
      : 'min-h-[140px] bg-transparent';
  return `
    <div class="rounded-3xl border border-dashed border-outline-variant/25 ${bodyCls} p-4 md:p-5"
      data-drop="${bucket}">
      <div class="flex items-baseline justify-between mb-3">
        <h3 class="font-headline italic text-xl md:text-2xl ${accent || 'text-on-surface'}">${escapeHtml(label)}</h3>
        <span class="font-label text-[10px] uppercase tracking-widest text-on-surface/40">
          ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>
      ${hint ? `<p class="font-label text-[11px] text-on-surface/40 mb-3">${escapeHtml(hint)}</p>` : ''}
      <div class="flex flex-wrap gap-3 md:gap-4">
        ${notes.map((n) => stickyMarkup(n, state)).join('')}
      </div>
    </div>`;
}

function trashBarMarkup() {
  return `
    <div class="fixed left-4 right-4 md:left-64 md:right-12 bottom-4 md:bottom-4 z-30 pointer-events-none">
      <div data-drop="trash"
        class="rounded-full border border-dashed border-error/40 bg-background/80 backdrop-blur
        py-3 flex items-center justify-center gap-3 text-error/70 font-label text-[10px] uppercase tracking-[0.25em]
        pointer-events-auto transition-colors">
        <span class="material-symbols-outlined text-base">content_cut</span>
        Never — drop here to shred
      </div>
      <p class="mt-1.5 text-center font-label text-[9px] uppercase tracking-[0.3em] text-on-surface/35">
        · or fling a sticky off any edge of the screen to toss it ·
      </p>
    </div>`;
}

function stickyMarkup(note, state) {
  const palette = PAPER_COLORS[note.color] || PAPER_COLORS.honey;
  const rot = typeof note.rotation === 'number' ? note.rotation : 0;
  const menuOpen = state.menuOpenFor === note.id;
  const safeText = escapeHtml(note.text || '').replace(/\n/g, '<br>');
  const strokesSvg = strokesToSvg(note.strokes || [], state);
  const fontSize = clampFontSize(note.fontSize);
  return `
    <div class="sticky-note group relative select-none"
      data-sticky="${escapeHtml(note.id)}"
      style="--rot:${rot}deg; --paper:${palette.bg}; --ink:${palette.ink};
             --sticky-font-size:${fontSize}px;
             transform: rotate(var(--rot));">
      <div class="sticky-paper">
        <div class="sticky-text" data-sticky-text>${safeText || '<span class="opacity-40">(empty)</span>'}</div>
        ${strokesSvg}
      </div>
      <button type="button" data-menu-toggle="${escapeHtml(note.id)}" aria-haspopup="true"
        class="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center
        text-[color:var(--ink)] opacity-60 hover:opacity-100 hover:bg-black/10 transition"
        style="transform: rotate(calc(var(--rot) * -1));">
        <span class="material-symbols-outlined text-base">more_horiz</span>
      </button>
      ${menuOpen ? stickyMenuMarkup(note) : ''}
    </div>`;
}

function stickyMenuMarkup(note) {
  const swatch = (c) => {
    const active = note.color === c;
    const ring = active ? 'ring-2 ring-offset-2 ring-offset-surface-container-high ring-on-surface' : 'hover:scale-110';
    return `<button type="button" data-color-change="${c}" data-note-id="${escapeHtml(note.id)}"
      aria-label="Change to ${c}"
      class="w-5 h-5 rounded-full transition ${ring}"
      style="background:${PAPER_COLORS[c].bg}"></button>`;
  };
  const fontSize = clampFontSize(note.fontSize);
  return `
    <div data-menu data-menu-for="${escapeHtml(note.id)}"
      class="absolute top-8 right-1 z-10 min-w-[180px] rounded-xl bg-surface-container-high shadow-2xl
      border border-outline-variant/20 py-1 text-sm font-label"
      style="transform: rotate(calc(var(--rot) * -1));">
      <button type="button" data-menu-action="edit" data-id="${escapeHtml(note.id)}"
        class="w-full text-left px-4 py-2 hover:bg-surface-container-highest flex items-center gap-2">
        <span class="material-symbols-outlined text-base">edit</span> Edit
      </button>
      <div class="px-4 py-2 flex items-center gap-2 border-t border-outline-variant/10">
        <span class="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface/50 mr-1">Color</span>
        ${swatch('honey')}${swatch('terracotta')}${swatch('sage')}
      </div>
      <div class="px-4 py-2 flex items-center gap-2 border-t border-outline-variant/10">
        <span class="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface/50 mr-1">Size</span>
        <button type="button" data-size-delta="-2" data-note-id="${escapeHtml(note.id)}"
          aria-label="Smaller text"
          class="w-6 h-6 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface/70 text-[11px]">
          A<span class="text-[8px] align-sub">−</span>
        </button>
        <span class="tabular-nums text-[11px] text-on-surface/60 min-w-[34px] text-center">${fontSize}px</span>
        <button type="button" data-size-delta="2" data-note-id="${escapeHtml(note.id)}"
          aria-label="Larger text"
          class="w-6 h-6 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface/80 text-[14px]">
          A<span class="text-[10px] align-super">+</span>
        </button>
      </div>
      <button type="button" data-menu-action="done" data-id="${escapeHtml(note.id)}"
        class="w-full text-left px-4 py-2 hover:bg-surface-container-highest flex items-center gap-2 border-t border-outline-variant/10">
        <span class="material-symbols-outlined text-base">flight_takeoff</span> Mark as done
      </button>
    </div>`;
}

// Keep per-sticky text size in a tight, readable range.
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_DEFAULT = 15;
function clampFontSize(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : FONT_SIZE_DEFAULT;
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, n));
}

function strokesToSvg(strokes, state) {
  if (!strokes.length && !state.drawMode) return '';
  // Each stroke renders as a <g> containing:
  //   1. A wide invisible "hit" path (10 device px, pointer-events: stroke) —
  //      the eraser can hit anywhere near the line, not just on the thin ink.
  //   2. The visible thin ink path — pointer-events: none so it can't shadow
  //      the hit path.
  // Grouping under the <g data-stroke-idx> makes erase-drag trivial: lift the
  // group and both layers disappear together.
  const paths = strokes
    .map((s, i) => {
      const hex = PEN_COLORS[s.color] || PEN_COLORS.black;
      const d = String(s.d || '').replace(/"/g, '');
      return `<g data-stroke-idx="${i}">
        <path d="${d}" fill="none" stroke="transparent"
          stroke-width="10" stroke-linecap="round" stroke-linejoin="round"
          pointer-events="stroke" vector-effect="non-scaling-stroke"></path>
        <path d="${d}" fill="none" stroke="${hex}"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
          pointer-events="none" vector-effect="non-scaling-stroke"></path>
      </g>`;
    })
    .join('');
  return `<svg class="sticky-canvas" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}"
    preserveAspectRatio="none" data-canvas
    style="pointer-events:${state.drawMode ? 'auto' : 'none'}">${paths}</svg>`;
}

// ─── Event wiring ───────────────────────────────────────────────────────────

function wireHeader(root, state, paint, signal) {
  // Tab switch
  root.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-tab-go]');
    if (tabBtn) {
      state.tab = tabBtn.dataset.tabGo;
      await paint();
      return;
    }
    const drawBtn = e.target.closest('[data-draw-toggle]');
    if (drawBtn) {
      state.drawMode = !state.drawMode;
      if (!state.drawMode) state.eraser = false;
      await paint();
      return;
    }
    const pen = e.target.closest('[data-pen]');
    if (pen) {
      state.drawMode = true;
      state.eraser = false;
      state.pen = pen.dataset.pen;
      await paint();
      return;
    }
    const eraser = e.target.closest('[data-eraser]');
    if (eraser) {
      state.drawMode = true;
      state.eraser = !state.eraser;
      await paint();
      return;
    }
  }, { signal });
}

// All listeners attached to the stable `root` element. Re-paints replace the
// children but not the listeners, so toggles stay correct across paints.
function wireSurfaceDelegated(root, state, paint, signal) {
  // Composer — Enter to submit
  root.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('[data-composer]');
    if (!input) return;
    e.preventDefault();
    await captureFromComposer(input, state, paint);
  }, { signal });
  // Clicks inside the surface (composer submit, menu toggles, menu actions)
  root.addEventListener('click', async (e) => {
    const surface = root.querySelector('[data-surface]');
    const submit = e.target.closest('[data-composer-submit]');
    if (submit) {
      const kind = submit.dataset.composerSubmit;
      const input = root.querySelector(`[data-composer="${kind}"]`);
      await captureFromComposer(input, state, paint);
      return;
    }
    const composerSwatch = e.target.closest('[data-composer-color]');
    if (composerSwatch) {
      state.composerColor = composerSwatch.dataset.composerColor;
      await paint();
      return;
    }
    const changeSwatch = e.target.closest('[data-color-change]');
    if (changeSwatch) {
      e.stopPropagation();
      const id = changeSwatch.dataset.noteId;
      const color = changeSwatch.dataset.colorChange;
      state.menuOpenFor = null;
      await updateNote(id, { color });
      return;
    }
    const sizeBtn = e.target.closest('[data-size-delta]');
    if (sizeBtn) {
      e.stopPropagation();
      const id = sizeBtn.dataset.noteId;
      const delta = parseFloat(sizeBtn.dataset.sizeDelta);
      const note = state.notes.find((n) => n.id === id);
      const cur = clampFontSize(note?.fontSize);
      const next = clampFontSize(cur + delta);
      if (next === cur) return; // already at a bound
      // Keep the menu open so the user can tap A-/A+ several times in a row.
      // paint() will run after updateNote → onDbChanged and re-render the
      // menu with the new size because state.menuOpenFor still points here.
      await updateNote(id, { fontSize: next });
      return;
    }
    const toggle = e.target.closest('[data-menu-toggle]');
    if (toggle) {
      e.stopPropagation();
      const id = toggle.dataset.menuToggle;
      state.menuOpenFor = state.menuOpenFor === id ? null : id;
      await paint();
      return;
    }
    const action = e.target.closest('[data-menu-action]');
    if (action) {
      e.stopPropagation();
      const id = action.dataset.id;
      const kind = action.dataset.menuAction;
      // Close the menu up-front so state stays coherent, but remove the DOM
      // directly rather than triggering a full paint — a paint would undo
      // editInline's textarea swap and clobber the edit in progress.
      state.menuOpenFor = null;
      const menuEl = root.querySelector('[data-menu]');
      if (menuEl) menuEl.remove();
      if (kind === 'done') {
        await throwOffAndDelete(id, surface);
        await paint();
      } else if (kind === 'edit') {
        // editInline swaps text for a textarea, focuses it, and saves on blur.
        // The blur-save fires updateNote → onDbChanged → paint automatically.
        await editInline(surface, id, state);
      }
      return;
    }
  }, { signal });

  // Pointer-based drag OR draw OR erase. Delegated at root level.
  root.addEventListener('pointerdown', (e) => {
    const surface = root.querySelector('[data-surface]');
    if (!surface) return;
    onPointerDown(e, state, surface, paint);
  }, { signal });
}

async function captureFromComposer(input, state, paint) {
  if (!input) return;
  const text = String(input.value || '').trim();
  if (!text) return;
  await addNote({
    kind: state.tab === 'parking' ? 'parking' : 'dump',
    bucket: state.tab === 'parking' ? null : 'unsorted',
    text,
    color: PAPER_COLORS[state.composerColor] ? state.composerColor : 'honey',
    rotation: randomRotation(),
    order: Date.now(),
  });
  input.value = '';
  input.focus();
  // paint will fire via onDbChanged → paint
}

function randomRotation() {
  return (Math.random() * 6 - 3);
}

// ─── Pointer handling (drag, draw, erase) ───────────────────────────────────

function onPointerDown(e, state, surface, paint) {
  // Ignore right clicks and modifier+click
  if (e.button !== 0) return;

  const sticky = e.target.closest('[data-sticky]');
  if (!sticky) return;

  // If click originated on the ⋯ button or menu, let the click handler handle it.
  if (e.target.closest('[data-menu-toggle]') || e.target.closest('[data-menu]')) return;

  // If the click landed on a textarea/input (e.g. the edit-in-place textarea
  // covering the sticky), let the field handle it natively. Starting a drag
  // here would steal the focus and, while paint() is suppressed by the focused
  // editor, leave the sticky lifted into position:fixed — repeated clicks
  // would compound the inline width/height and balloon the note.
  if (e.target.closest('input, textarea')) return;

  // DRAW / ERASE mode: strokes on the sticky's canvas
  if (state.drawMode) {
    const canvas = sticky.querySelector('[data-canvas]');
    if (!canvas) return;
    const id = sticky.dataset.sticky;
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;

    if (state.eraser) {
      startErasing(e, canvas, note, state);
      return;
    }

    startDrawing(e, canvas, note, state);
    return;
  }

  // DRAG mode: lift sticky and follow pointer
  startDragging(e, sticky, state, surface, paint);
}

// Drag-erase: while the pointer is down, any stroke the cursor passes over is
// removed (visually immediate; DB commit happens once on pointerup).
function startErasing(e, canvas, note, state) {
  e.preventDefault();
  // Block paint() for the duration of the erase — otherwise a remote sync
  // pull or concurrent DB write would rebuild the SVG and wipe the half-
  // erased strokes mid-drag.
  state.setBusy(true);
  const removed = new Set();

  const tryErase = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    const group = el?.closest?.('g[data-stroke-idx]');
    if (!group) return;
    const idx = +group.dataset.strokeIdx;
    if (removed.has(idx)) return;
    removed.add(idx);
    group.remove();
  };

  tryErase(e.clientX, e.clientY);
  try { canvas.setPointerCapture(e.pointerId); } catch {}

  const onMove = (ev) => tryErase(ev.clientX, ev.clientY);
  const onUp = async () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    if (!removed.size) { state.setBusy(false); return; }
    const strokes = (note.strokes || []).filter((_, i) => !removed.has(i));
    await updateNote(note.id, { strokes });
    state.setBusy(false);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function startDrawing(e, canvas, note, state) {
  e.preventDefault();
  // Block paint() for the duration of the stroke so a remote sync pull or
  // concurrent DB write can't wipe the half-drawn line out from under us.
  state.setBusy(true);
  const svgPt = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((ev.clientY - rect.top) / rect.height) * CANVAS_SIZE;
    return {
      x: Math.max(0, Math.min(CANVAS_SIZE, x)).toFixed(1),
      y: Math.max(0, Math.min(CANVAS_SIZE, y)).toFixed(1),
    };
  };

  const first = svgPt(e);
  const stroke = { color: state.pen, d: `M${first.x} ${first.y}` };
  const hex = PEN_COLORS[state.pen] || PEN_COLORS.black;
  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', stroke.d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', hex);
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  canvas.appendChild(path);
  try { canvas.setPointerCapture(e.pointerId); } catch {}

  const onMove = (ev) => {
    const p = svgPt(ev);
    stroke.d += ` L${p.x} ${p.y}`;
    path.setAttribute('d', stroke.d);
  };
  const onUp = async () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    const strokes = [...(note.strokes || []), stroke];
    await updateNote(note.id, { strokes });
    state.setBusy(false);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
}

function startDragging(e, sticky, state, surface, paint) {
  e.preventDefault();
  // Block paint() until the drag animation + DB write all settle. Without
  // this, an incoming sync-pull would rebuild the surface mid-drag and the
  // dragged sticky would vanish.
  state.setBusy(true);
  const id = sticky.dataset.sticky;
  const startX = e.clientX;
  const startY = e.clientY;
  const baseRot = getComputedRotation(sticky);

  // Snapshot the sticky's starting rect and lift it out of layout with
  // position:fixed so its flex slot collapses. A same-size placeholder takes
  // its spot; as the cursor moves, we shuffle the placeholder to the current
  // insertion slot which reflows the other notes and opens a visible gap.
  const startRect = sticky.getBoundingClientRect();
  const originParent = sticky.parentElement;
  const originNext = sticky.nextSibling;

  const placeholder = document.createElement('div');
  placeholder.className = 'sticky-placeholder';
  placeholder.style.width = startRect.width + 'px';
  placeholder.style.height = startRect.height + 'px';
  originParent.insertBefore(placeholder, sticky);

  sticky.style.position = 'fixed';
  sticky.style.left = startRect.left + 'px';
  sticky.style.top = startRect.top + 'px';
  sticky.style.width = startRect.width + 'px';
  sticky.style.height = startRect.height + 'px';
  sticky.style.margin = '0';

  // Visuals for the lifted state
  sticky.classList.add('sticky-dragging');
  sticky.style.zIndex = '50';
  sticky.style.willChange = 'transform';
  // Take the sticky out of hit-testing entirely while it's dragging. This way
  // elementFromPoint — used for highlight AND drop detection — returns the
  // zone under the cursor instead of the sticky (which is position:fixed but
  // still absorbs hits by default).
  sticky.style.pointerEvents = 'none';
  try { sticky.setPointerCapture(e.pointerId); } catch {}

  let lastX = startX;
  let lastY = startY;
  let lastT = performance.now();
  let vx = 0, vy = 0;

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    sticky.style.transform = `translate(${dx}px, ${dy}px) rotate(${baseRot + dx * 0.02}deg) scale(1.05)`;
    // velocity for flick detection
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    vx = (ev.clientX - lastX) / dt;
    vy = (ev.clientY - lastY) / dt;
    lastX = ev.clientX;
    lastY = ev.clientY;
    lastT = now;
    // hover highlights + placeholder gap
    highlightDropUnder(ev.clientX, ev.clientY, surface);
    repositionPlaceholder(placeholder, sticky, ev.clientX, ev.clientY, surface);
  };

  const onUp = async (ev) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    try { sticky.releasePointerCapture(ev.pointerId); } catch {}
    clearDropHighlights(surface);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const offScreen =
      ev.clientX < 0 || ev.clientX > vw || ev.clientY < 0 || ev.clientY > vh;
    // Velocity check is only used when the drop *didn't* land on any zone —
    // otherwise a fast drop on "Now" would always register as a toss.
    const flicking = Math.hypot(vx, vy) > 2.0;
    // IMPORTANT: detect the drop zone BEFORE restoring pointer-events.
    // The dragged sticky was visually translated to the drop location; if it
    // were hittable again it would shadow the zone underneath and
    // elementFromPoint would return the sticky's DOM parent (origin bucket).
    const zone = dropZoneUnder(ev.clientX, ev.clientY);
    // Capture the final drag transform before anything mutates it — crumple
    // / toss animations build on top of it so the sticky collapses/flies from
    // where the cursor actually dropped it, not from its DOM origin.
    const releaseTransform = sticky.style.transform || '';
    // Now safely restore pointer-events (for the next drag cycle on this sticky
    // if it survives this drop).
    sticky.classList.remove('sticky-dragging');
    sticky.style.pointerEvents = '';

    // Priority: explicit drop zone wins over flick/off-screen detection.
    if (zone === 'trash') {
      placeholder.remove();
      await shredAtDropPoint(sticky, id, releaseTransform);
      state.setBusy(false);
      return;
    }
    if (
      zone === 'parking' ||
      zone === 'unsorted' ||
      zone === 'now' ||
      zone === 'later'
    ) {
      const targetBucket = zone === 'parking' ? null : zone;
      const note = state.notes.find((n) => n.id === id);
      // Use the placeholder's final position (which reflects the gap the user
      // saw) as the authoritative insertion slot — more accurate than
      // re-running elementFromPoint when the cursor hovers between notes.
      const patch = computePlaceholderPatch({
        placeholder,
        dragNote: note,
        targetBucket,
        state,
      }) || computeReorderPatch({
        dropX: ev.clientX,
        dropY: ev.clientY,
        dragId: id,
        dragNote: note,
        targetBucket,
        state,
        surface,
      });
      placeholder.remove();
      // Always clear the lifted inline styles before handing off to paint.
      // If paint is suppressed (e.g. user is typing in another sticky's
      // textarea), the sticky would otherwise stay stuck in position:fixed
      // with the width/height read from its rotated bounding box — and on
      // the next click startDragging would re-read that inflated rect,
      // growing the sticky by a few pixels with each tap.
      restoreFromDrag(sticky);
      await updateNote(id, patch);
      state.setBusy(false);
      return;
    }
    // No zone hit. Fall back to off-screen / flick detection.
    if (offScreen || flicking) {
      placeholder.remove();
      await tossOffScreen(sticky, vx, vy);
      await deleteNote(id);
      state.setBusy(false);
      return;
    }
    // Nowhere to go — put the sticky back where it was.
    restoreFromDrag(sticky);
    placeholder.remove();
    state.setBusy(false);
    paint();
  };

  // Listen on window so the drop still fires if the pointer slips off the sticky.
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// During drag, reposition the placeholder so the gap tracks the cursor.
// If the cursor is over a valid pile, the placeholder is (re)inserted at the
// correct slot within that pile; that triggers a natural flex reflow, shifting
// the other notes out of the way.
function repositionPlaceholder(placeholder, sticky, clientX, clientY, surface) {
  const zone = dropZoneUnder(clientX, clientY);
  if (!zone || zone === 'trash') {
    if (placeholder.parentElement) placeholder.remove();
    return;
  }
  const pile = surface.querySelector(`[data-drop="${zone}"]`);
  if (!pile) return;
  const container = pile.querySelector('.flex.flex-wrap') || pile;
  const siblings = [...container.children].filter((el) => el !== placeholder && el !== sticky && el.matches('[data-sticky]'));
  let insertBefore = null;
  for (const el of siblings) {
    const r = el.getBoundingClientRect();
    if (clientY < r.top || (clientY < r.bottom && clientX < r.left + r.width / 2)) {
      insertBefore = el;
      break;
    }
  }
  if (insertBefore) {
    if (placeholder.nextElementSibling !== insertBefore) container.insertBefore(placeholder, insertBefore);
  } else {
    if (placeholder.parentElement !== container || placeholder !== container.lastElementChild) container.appendChild(placeholder);
  }
}

// Build an {order, bucket?} patch from where the placeholder currently sits.
// The placeholder's live DOM position maps 1:1 to the note order the user saw
// just before releasing, so this is more reliable than re-deriving the slot
// from the cursor's release coordinates.
function computePlaceholderPatch({ placeholder, dragNote, targetBucket, state }) {
  if (!placeholder.parentElement) return null;
  const container = placeholder.parentElement;
  const siblings = [...container.children].filter((el) => el.matches('[data-sticky]'));
  // Pool filtered to the target bucket, ordered by their DOM order (matches
  // what the user sees). We use order values halfway between neighbors.
  const pool = siblings
    .map((el) => state.notes.find((n) => n.id === el.dataset.sticky))
    .filter(Boolean);

  // Find placeholder index among siblings
  const kids = [...container.children];
  let insertAt = pool.length;
  let walked = 0;
  for (const k of kids) {
    if (k === placeholder) { insertAt = walked; break; }
    if (k.matches('[data-sticky]')) walked++;
  }
  const prev = pool[insertAt - 1];
  const next = pool[insertAt];
  let newOrder;
  if (!prev && !next) newOrder = Date.now();
  else if (!prev) newOrder = (next.order ?? 1) - 1;
  else if (!next) newOrder = (prev.order ?? 0) + 1;
  else newOrder = ((prev.order ?? 0) + (next.order ?? 0)) / 2;

  const patch = { order: newOrder };
  if (state.tab === 'dump' && dragNote && dragNote.bucket !== targetBucket) {
    patch.bucket = targetBucket;
  }
  return patch;
}

// Undo the inline styles that startDragging applied so the sticky falls back
// into normal flex layout cleanly. Called on any onUp path that doesn't
// animate the sticky out — including reorder/no-op paths where paint() may
// be suppressed (user is editing elsewhere) and therefore can't be relied on
// to rebuild the DOM as cleanup.
// Restore the base rotate(var(--rot)) transform rather than clearing to an
// empty string: the rotation is set inline by stickyMarkup, and a blank
// transform would leave the sticky un-rotated until the next paint.
function restoreFromDrag(sticky) {
  sticky.style.position = '';
  sticky.style.left = '';
  sticky.style.top = '';
  sticky.style.width = '';
  sticky.style.height = '';
  sticky.style.margin = '';
  sticky.style.transform = 'rotate(var(--rot))';
  sticky.style.zIndex = '';
  sticky.style.willChange = '';
  sticky.style.pointerEvents = '';
}

// Resolve a drop into an {order, bucket?} patch.
// Walks the target pile in reading order (top-down, then left-to-right within
// a row) and picks the insertion slot closest to the cursor, then assigns an
// `order` value midway between its neighbors. If the sticky is crossing into
// a new bucket, includes the bucket change in the patch.
function computeReorderPatch({ dropX, dropY, dragId, dragNote, targetBucket, state, surface }) {
  const pool = state.notes
    .filter((n) => {
      if (n.id === dragId) return false;
      if (state.tab === 'parking') return n.kind === 'parking';
      return n.kind === 'dump' && n.bucket === targetBucket;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let insertAt = pool.length;
  for (let i = 0; i < pool.length; i++) {
    const el = surface.querySelector(`[data-sticky="${CSS.escape(pool[i].id)}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    // Reading order: cursor above this note OR on the same row but left of its centre.
    if (dropY < r.top || (dropY < r.bottom && dropX < r.left + r.width / 2)) {
      insertAt = i;
      break;
    }
  }

  const prev = pool[insertAt - 1];
  const next = pool[insertAt];
  let newOrder;
  if (!prev && !next) newOrder = Date.now();
  else if (!prev) newOrder = (next.order ?? 1) - 1;
  else if (!next) newOrder = (prev.order ?? 0) + 1;
  else newOrder = ((prev.order ?? 0) + (next.order ?? 0)) / 2;

  const patch = { order: newOrder };
  if (state.tab === 'dump' && dragNote && dragNote.bucket !== targetBucket) {
    patch.bucket = targetBucket;
  }
  return patch;
}

function snapBack(sticky, paint) {
  sticky.style.transition = 'transform 180ms ease-out';
  sticky.style.transform = '';
  setTimeout(() => {
    sticky.style.transition = '';
    sticky.style.zIndex = '';
    sticky.style.willChange = '';
    paint();
  }, 200);
}

function getComputedRotation(sticky) {
  const raw = sticky.style.getPropertyValue('--rot') || '0deg';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function dropZoneUnder(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const zone = el?.closest?.('[data-drop]');
  return zone ? zone.dataset.drop : null;
}

function highlightDropUnder(x, y, surface) {
  const zone = dropZoneUnder(x, y);
  surface.querySelectorAll('[data-drop]').forEach((el) => {
    el.classList.toggle('drop-hot', el.dataset.drop === zone);
  });
  const trash = document.querySelector('[data-drop="trash"]');
  if (trash) trash.classList.toggle('drop-hot', zone === 'trash');
}

function clearDropHighlights(surface) {
  surface.querySelectorAll('[data-drop]').forEach((el) => el.classList.remove('drop-hot'));
  const trash = document.querySelector('[data-drop="trash"]');
  if (trash) trash.classList.remove('drop-hot');
}

// ─── Animations ─────────────────────────────────────────────────────────────

async function tossOffScreen(sticky, vx, vy) {
  const dirX = vx >= 0 ? 1 : -1;
  const dirY = vy <= 0 ? -1 : 1;
  const tx = dirX * (window.innerWidth + 300);
  const ty = dirY * (window.innerHeight + 300);
  sticky.style.transition = 'transform 380ms ease-in, opacity 380ms ease-in';
  sticky.style.transform = `translate(${tx}px, ${ty}px) rotate(${dirX * 720}deg) scale(0.6)`;
  sticky.style.opacity = '0';
  await sleep(390);
}

// Shred the sticky into vertical strips that fall and scatter away from the
// cursor drop point. Clones .sticky-paper (including its text and drawn
// strokes) N times, clips each clone to a vertical slice, and lets the CSS
// keyframes handle the tumble. Feels much more destructive than a plain fade.
const SHRED_STRIPS = 7;
async function shredAtDropPoint(sticky, id, releaseTransform) {
  const paper = sticky.querySelector('.sticky-paper');
  if (!paper) {
    // Fallback: plain fade if the paper layer isn't there for some reason.
    sticky.style.transition = 'transform 300ms ease-in, opacity 300ms ease-in';
    if (releaseTransform) sticky.style.transform = `${releaseTransform} scale(0.2)`;
    sticky.style.opacity = '0';
    await sleep(320);
    await deleteNote(id);
    return;
  }
  // Take the interactive bits out of the picture before we replace the paper.
  sticky.querySelectorAll('[data-menu-toggle], [data-menu]').forEach((el) => {
    el.style.display = 'none';
  });
  // Swap the live paper for N clipped clones layered on top of each other.
  const wrap = document.createElement('div');
  wrap.className = 'sticky-shred-wrap';
  for (let i = 0; i < SHRED_STRIPS; i++) {
    const clone = paper.cloneNode(true);
    clone.classList.add('sticky-shred');
    const l = ((i / SHRED_STRIPS) * 100).toFixed(3);
    const r = (((i + 1) / SHRED_STRIPS) * 100).toFixed(3);
    // Inset-clip to a vertical slice (slightly negative Y so drop shadows
    // aren't chopped off).
    clone.style.clipPath = `polygon(${l}% -5%, ${r}% -5%, ${r}% 105%, ${l}% 105%)`;
    clone.style.animationDelay = (i * 22) + 'ms';
    // Wider drift so the strips clearly separate across the screen.
    clone.style.setProperty('--drift', ((i - (SHRED_STRIPS - 1) / 2) * 44) + 'px');
    clone.style.setProperty('--spin', (((i % 2 === 0 ? 1 : -1) * (18 + i * 4))) + 'deg');
    wrap.appendChild(clone);
  }
  paper.style.visibility = 'hidden';
  sticky.appendChild(wrap);
  // Total = last delay (6*22=132ms) + 720ms keyframe ≈ 852ms.
  await sleep(870);
  await deleteNote(id);
}

async function throwOffAndDelete(id, surface) {
  const sticky = surface.querySelector(`[data-sticky="${CSS.escape(id)}"]`);
  if (sticky) {
    sticky.style.transition = 'transform 380ms ease-in, opacity 380ms ease-in';
    sticky.style.transform = `translate(120vw, -40vh) rotate(720deg) scale(0.5)`;
    sticky.style.opacity = '0';
    await sleep(390);
  }
  await deleteNote(id);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Edit flow ──────────────────────────────────────────────────────────────

async function editInline(surface, id, state) {
  const sticky = surface.querySelector(`[data-sticky="${CSS.escape(id)}"]`);
  if (!sticky) return;
  const textEl = sticky.querySelector('[data-sticky-text]');
  if (!textEl) return;

  // Block paint() for the duration of the edit. hasFocusedEditor() already
  // covers the typing phase, but an explicit busy flag also covers the tiny
  // gap between replaceWith and focus, and the save() await.
  state?.setBusy?.(true);

  // Replace static text with a textarea that autosizes. Keep the paper rotated
  // so the edit feels continuous with the sticky below.
  const currentText = await getNoteText(id);
  const ta = document.createElement('textarea');
  ta.value = currentText;
  ta.className = 'sticky-edit';
  textEl.replaceWith(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const save = async () => {
    const v = String(ta.value || '').trim();
    await updateNote(id, { text: v });
    state?.setBusy?.(false);
    // paint fires via onDbChanged
  };
  ta.addEventListener('blur', save, { once: true });
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ta.blur(); }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ta.blur(); }
  });
}

async function getNoteText(id) {
  const { getNote } = await import('../db.js');
  const n = await getNote(id);
  return n?.text || '';
}
