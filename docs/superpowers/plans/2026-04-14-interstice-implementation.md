# Interstice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first interstitial-journaling PWA called **Interstice** — vanilla HTML/CSS/JS, IndexedDB storage, mobile-first responsive, with the cozy walnut/cream aesthetic from the Stitch mockups.

**Architecture:** Single-page app with hash-based routing. ES-module JavaScript, no build step. Tailwind CSS via CDN with a custom theme matching the mockups. Each view is a module that exports `render(container, params)`. Data lives in IndexedDB via a small Promise-based wrapper. PWA manifest + service worker for offline use.

**Tech Stack:** HTML5, ES modules, Tailwind CSS (CDN), IndexedDB (native API), Web App Manifest, Service Worker. Optional: `npx serve` for local dev. No npm dependencies in the shipped app.

**XSS safety policy:** All user-supplied content (entry body, tags, search query) MUST be escaped through a shared `escapeHtml()` helper before being interpolated into any markup string. Every view writes its rendered markup through a single shared `setHTML(el, html)` wrapper in `src/safe-dom.js` so the XSS surface is auditable in one place. Task 1 includes a regression test that confirms a `<script>` tag in an entry body is rendered inert.

---

## File Structure

```
journaling app/
  index.html                          SPA shell
  manifest.webmanifest                PWA manifest
  sw.js                               Service worker (cache-first)
  styles.css                          Custom CSS beyond Tailwind
  icons/                              PWA icons (192, 512, maskable-512)
  test.html                           In-browser test page for db.js
  tests/db.test.js                    Smoke tests for IndexedDB layer
  src/
    app.js                            Boot: open DB, mount router, register SW
    db.js                             IndexedDB wrapper
    router.js                         Hash router
    theme.js                          Dark/light/system theme application
    shortcuts.js                      Global keyboard shortcuts
    safe-dom.js                       escapeHtml + setHTML wrapper
    helpers/
      date.js                         date formatting + streak
      prefs.js                        localStorage prefs
    components/
      nav.js                          Sidebar (md+) + bottom tabs (mobile)
      topbar.js                       Sticky top bar
      fab.js                          Floating "+" action button
    views/
      onboarding.js                   First-launch slides
      today.js                        Today timeline
      new-entry.js                    Bottom-sheet entry modal
      calendar.js                     Month grid + filters
      day-detail.js                   Past day timeline + summary
      search.js                       Search + filters
      about.js                        Explainer + embedded video + credit
      settings.js                     Theme, export, import, clear, install
  docs/superpowers/
    specs/2026-04-14-interstice-design.md
    plans/2026-04-14-interstice-implementation.md
```

**File responsibilities:**

- `index.html` — single shell with `#nav-root`, `#view-root`, `#fab-root`, `#modal-root`, `#toast-root`. Loads Tailwind via CDN with our custom theme tokens (matching Stitch). Loads `src/app.js` as a module.
- `app.js` — boot order: applies theme, opens DB, renders nav, registers shortcuts, mounts router, registers service worker.
- `db.js` — single object store `entries` keyed by `id` with indexes `by_ts` and `by_day`. Exposes `addEntry`, `getEntry`, `updateEntry`, `deleteEntry`, `listEntriesByDay`, `listEntriesByRange`, `searchEntries`, `getAllTags`, `clearAll`, `exportAll`, `importAll`, `estimateUsage`, `dayKey`.
- `router.js` — hash patterns: `#/today`, `#/calendar?month=YYYY-MM`, `#/day/YYYY-MM-DD`, `#/search?q=…`, `#/settings`, `#/about`, `#/onboarding`. Calls the matching view's `render(root, params)`.
- `safe-dom.js` — exports `escapeHtml(s)` and `setHTML(el, html)`; every view writes markup through `setHTML` so XSS risk is auditable in one place.
- Each `views/*.js` exports `render(container, params)` returning `{ dispose? }`.

**Entry shape (the only schema):**

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID via `crypto.randomUUID()` |
| `ts` | number | Epoch milliseconds |
| `day` | string | `YYYY-MM-DD` in local time, derived from `ts` |
| `type` | string \| null | `finished` / `starting` / `feeling` / `distraction` / `idea` |
| `body` | string | The entry text |
| `mood` | 1..5 \| null | Optional |
| `energy` | 1..5 \| null | Optional |
| `tags` | string[] | Free-form, no `#` prefix |
| `createdAt` | number | Epoch ms |
| `updatedAt` | number | Epoch ms |

---

## Task 0 — Project Scaffold

**Files:** create `.gitignore`, `index.html`, `styles.css`, `manifest.webmanifest`, `icons/*`, `src/app.js`, `src/safe-dom.js`

- [ ] **Step 1:** Initialize git in the working directory: `git init` then `git branch -M main`.
- [ ] **Step 2:** Write `.gitignore` excluding `node_modules`, `.firecrawl`, `.DS_Store`, `*.log`, `.vscode/`.
- [ ] **Step 3:** Write `index.html` — a single shell containing the Tailwind CDN script and the full `tailwind.config` block (color tokens copied verbatim from any of the Stitch mockup files in the chat). Body contains five empty container divs: `#nav-root`, `#view-root` (`md:ml-64 min-h-screen pb-24 md:pb-0`), `#fab-root`, `#modal-root`, `#toast-root`. Loads `src/app.js` as a module.
- [ ] **Step 4:** Write `styles.css` — grain overlay (the SVG noise filter pattern used in the mockups), `.material-symbols-outlined` font-variation, `.dashed-line` for timeline gap connectors, light-mode class overrides, webkit-scrollbar styling.
- [ ] **Step 5:** Write `manifest.webmanifest` — name "Interstice — The Analog Pause", short_name "Interstice", standalone display, theme_color `#1a120b`, icons array referencing the three PWA icons.
- [ ] **Step 6:** Generate three solid `#1a120b` PWA icons (192, 512, maskable-512) with a cream "I" glyph. If ImageMagick is available, generate them; otherwise leave as a TODO — the manifest still works in dev.
- [ ] **Step 7:** Write `src/safe-dom.js` — exports `escapeHtml(s)` (replaces `& < > " '` with HTML entities) and `setHTML(el, html)` (one-line wrapper that performs the markup assignment so every view goes through one auditable spot for XSS).
- [ ] **Step 8:** Write `src/app.js` boot stub — imports `openDB`, `applyStoredTheme`, `mountRouter`, `renderNav`, `registerShortcuts`. Calls them in order, then registers the service worker.
- [ ] **Step 9:** Smoke test: `npx --yes serve . -p 5173` and open in browser. Expect dark walnut background and console errors about missing modules (those are fixed in subsequent tasks).
- [ ] **Step 10:** Commit: `scaffold: PWA shell, Tailwind theme, manifest, app boot`.

---

## Task 1 — IndexedDB Layer + Smoke Tests

**Files:** create `src/db.js`, `test.html`, `tests/db.test.js`

- [ ] **Step 1:** Implement `src/db.js` with the schema described in "Entry shape" above:
  - `openDB()` — returns a memoized `Promise<IDBDatabase>`. On `onupgradeneeded`, create the `entries` store keyed by `id` with indexes `by_ts` (on `ts`) and `by_day` (on `day`).
  - `dayKey(ts)` — returns local-time `YYYY-MM-DD`.
  - `addEntry(partial)` — fills defaults, generates `id` via `crypto.randomUUID()`, derives `day`, stamps `createdAt`/`updatedAt`, calls `store.add`.
  - `updateEntry(id, patch)` — fetch, merge, write back, refresh `day` if `ts` changed.
  - `deleteEntry(id)`, `getEntry(id)`.
  - `listEntriesByDay(day)` — uses `by_day` index; sorts by `ts` ascending.
  - `listEntriesByRange(fromTs, toTs)` — uses `by_ts` index with `IDBKeyRange.bound`.
  - `listAllEntries()` — sorted by `ts` desc.
  - `searchEntries({ q, types, tags, mood, fromTs, toTs })` — in-memory filter over `listAllEntries()` (acceptable; thousands of entries fit easily in memory).
  - `getAllTags()` — returns `[{ tag, count }]` sorted by count desc.
  - `clearAll()`, `exportAll()` (returns `{ schema: "interstice/v1", exportedAt, entries }`), `importAll(payload, { merge })`.
  - `estimateUsage()` — wraps `navigator.storage.estimate()`.
- [ ] **Step 2:** Write `test.html` with a tiny pass/fail UI styled to match the app theme.
- [ ] **Step 3:** Write `tests/db.test.js` with these assertions:
  - `addEntry` returns an entry with `id` and `day`.
  - `listEntriesByDay(today)` returns at least one row after adding.
  - `searchEntries({ q: "hello" })` matches body text.
  - `searchEntries({ tags: ["t1"] })` matches by tag.
  - `exportAll` then `importAll` round-trips entries.
  - `getAllTags` returns sorted unique tags with counts.
  - **XSS regression test:** add an entry whose body is `<script>alert(1)</script>`, render it via `escapeHtml`, then assert that `document.querySelectorAll("script")` does NOT find the injected tag.
- [ ] **Step 4:** Run tests in browser at `/test.html` — expect all green.
- [ ] **Step 5:** Commit: `feat(db): IndexedDB layer with CRUD, search, export/import + smoke tests`.

---

## Task 2 — Helpers (date, prefs, theme)

**Files:** create `src/helpers/date.js`, `src/helpers/prefs.js`, `src/theme.js`

- [ ] **Step 1:** Write `src/helpers/date.js` exporting: `formatTime`, `formatDateLong`, `formatDateShort`, `formatWeekday`, `greetingFor` (Good morning / afternoon / evening / Quiet night), `elapsedBetween(aTs, bTs)` (returns "47m" or "1h 12m"), `startOfDay`, `endOfDay`, `parseDayKey("YYYY-MM-DD")`, `calcStreak(daysDescending)`.
- [ ] **Step 2:** Write `src/helpers/prefs.js` — `getPrefs()` reads JSON from `localStorage["interstice:prefs"]` merged over defaults `{ theme: "system", onboarded: false }`. `setPref(key, value)` persists.
- [ ] **Step 3:** Write `src/theme.js` — `applyStoredTheme()` reads prefs and calls `applyTheme(value)`. `applyTheme("dark"|"light"|"system")` toggles `html.dark`/`html.light` classes and updates the `meta[name="theme-color"]` content. Listens for `(prefers-color-scheme: dark)` changes when in `system` mode.
- [ ] **Step 4:** Reload — page should still render with the cozy palette and grain overlay visible.
- [ ] **Step 5:** Commit: `feat: date/format helpers, prefs storage, theme toggle`.

---

## Task 3 — Hash Router + Layout Components

**Files:** create `src/router.js`, `src/components/nav.js`, `src/components/topbar.js`, `src/components/fab.js`. Plus 8 stub view modules.

- [ ] **Step 1:** Write `src/router.js` — `mountRouter(root)` registers all view loaders (dynamic `import()`), listens for `hashchange`, parses `#/<name>[/<rest>][?<qs>]`, calls the matching loader, renders into `#view-root`. Calls the previous view's `dispose()` if any. Defaults to `#/today` when hash is empty. Dispatches `route:changed` on document for nav highlighting.
- [ ] **Step 2:** Write `src/components/nav.js` — `renderNav(root)` injects two markup blocks: a `hidden md:flex` left sidebar (matching the Stitch sidebar exactly: brand block, four nav items, "Saved on this device" footer with `lock` icon, **NO user avatar**) and a `md:hidden fixed bottom-0` bottom-tab nav. Click-delegates to `navigate(...)`. Listens for `route:changed` to update active styling (primary color + left border on the active item).
- [ ] **Step 3:** Write `src/components/topbar.js` — exports `renderTopbar({ title, subtitle, right })` returning a header markup string. Right side has a `cloud_off` icon (the local-only indicator — replaces the misleading `sync_saved_locally` from the mockups).
- [ ] **Step 4:** Write `src/components/fab.js` — `showFab()` mounts the floating "+" button into `#fab-root` and wires its click to `openNewEntryModal()`. `hideFab()` clears it. The FAB sits `bottom-20 right-6 md:bottom-12 md:right-12` so it clears the mobile bottom nav.
- [ ] **Step 5:** Write 8 stub view modules so the router can resolve. Each stub exports `render(root)` that paints a placeholder string ("Today (placeholder)" etc.). Also create `new-entry.js` exporting `openNewEntryModal` (currently a `console.log`).
- [ ] **Step 6:** Reload — clicking each nav item updates the placeholder; URL hash updates; active nav item gets primary color.
- [ ] **Step 7:** Commit: `feat: hash router, side+bottom nav, topbar, FAB, view stubs`.

---

## Task 4 — Today View

**Files:** modify `src/views/today.js`. **Visual reference:** Stitch "Today / Home" mockup.

- [ ] **Step 1:** Replace the stub with a real implementation that:
  - Calls `showFab()`.
  - Loads `listEntriesByDay(dayKey(Date.now()))`.
  - Renders the topbar with greeting + weekday and `formatDateLong(now)` subtitle.
  - Renders one card per entry, with a gap connector between consecutive cards. Card matches Stitch markup: timestamp top-left, type chip top-right (color-mapped per type), large `font-headline` body text, mood dots and tag chips at bottom, edit/delete icons appearing on hover.
  - Empty state when no entries: warm "blank page" illustration + "ADD YOUR FIRST ENTRY" button.
  - All user-derived strings (body, tags) pass through `escapeHtml()`.
  - Hover on a card reveals edit + delete buttons; delete asks `confirm()` then `deleteEntry` + re-render; edit opens `openNewEntryModal({ entry, onSaved: refresh })`.
- [ ] **Step 2:** Test — empty state shows; add an entry via FAB after Task 5; see it appear with timestamp.
- [ ] **Step 3:** Commit: `feat(today): timeline view with cards, gaps, empty state`.

---

## Task 5 — New Entry Modal

**Files:** modify `src/views/new-entry.js`. **Visual reference:** Stitch "New Entry" mockup.

- [ ] **Step 1:** Implement `openNewEntryModal({ entry, onSaved })` that mounts a modal into `#modal-root`:
  - On mobile (`<md`): slides up from bottom, full width, rounded top.
  - On desktop: centered card, max-width 2xl.
  - Top: `datetime-local` input pre-filled with the entry's local time (editable). Close (X) button.
  - Type chip row: 5 quick-pick chips (Finished, Starting Next, Feeling, Distraction, Idea); clicking one toggles selection (single-select) and updates the textarea's placeholder to a matching prompt.
  - Body: large 5-row textarea with `font-headline`. Rotating placeholder per type.
  - Mood + Energy: two parallel rows of 5 dots each; click N to set 1–N filled, click again to deselect.
  - Tag input: chips area with an `<input list="tag-list">`. Enter or `,` adds a tag; Backspace on empty input removes the last. Datalist is populated from `getAllTags()` for autocomplete.
  - Footer: "Save & Add Another" (only when not editing) + "Save Entry" / "Save Changes". Keyboard hints visible on `md:`.
  - Keyboard: Esc closes; Cmd/Ctrl + Enter saves.
  - On save: `addEntry(state)` or `updateEntry(entry.id, state)`, shows a "✓ saved on this device" toast in `#toast-root`, calls `onSaved()`, closes.
  - All chip labels and tag values escape via `escapeHtml`.
- [ ] **Step 2:** The route `#/new-entry` is unused — `render(...)` for `new-entry.js` redirects to `#/today` (the modal is opened imperatively from FAB / shortcut / edit button).
- [ ] **Step 3:** Test — open from FAB, fill body, pick type, set mood, add tags, save. Confirm it appears on Today timeline.
- [ ] **Step 4:** Commit: `feat(new-entry): bottom-sheet modal with chips, mood/energy, tags`.

---

## Task 6 — Calendar View

**Files:** modify `src/views/calendar.js`. **Visual reference:** Stitch "Calendar / History" mockup.

- [ ] **Step 1:** Implement — reads `?month=YYYY-MM` from params (defaults to current month). Loads `listEntriesByRange(monthStart, monthEnd)`, groups by `day`. Loads a 60-day window separately to compute `calcStreak`.
  - Topbar.
  - Row above the grid: prev/next chevrons + month/year heading (left) + "🔥 N-day streak" pill (right).
  - 7-column grid: weekday headers, leading empty cells, then one cell per day with the date number and an intensity dot (opacity 0 / 30% / 60% / 100% based on entry count). Today's number gets a primary ring.
  - Click a day → `navigate("#/day/<dayKey>")`.
  - Prev/next chevrons → `navigate("#/calendar?month=YYYY-MM")`.
- [ ] **Step 2:** Test — navigate to `#/calendar`, see today highlighted, click prev/next, click a day with entries → opens Day Detail.
- [ ] **Step 3:** Commit: `feat(calendar): month grid with intensity dots, streak, navigation`.

---

## Task 7 — Day Detail View

**Files:** modify `src/views/day-detail.js`. **Visual reference:** Stitch "Day Detail" mockup.

- [ ] **Step 1:** Implement — reads day key from `params._[0]`. Loads `listEntriesByDay(day)`.
  - Header row: back button + "Day Detail" eyebrow + `formatDateLong(parseDayKey(day))`.
  - 4 stat cards: Entries count, Hours tracked (last - first ts), Top tag, Avg mood.
  - Mood trajectory: SVG `<polyline>` sparkline of entries' mood values (only renders when ≥1 mood is recorded).
  - Full timeline: same card pattern as Today, with elapsed gap connectors between entries.
  - "No entries on this day" state if empty.
- [ ] **Step 2:** Test by clicking a day on the Calendar.
- [ ] **Step 3:** Commit: `feat(day-detail): timeline with summary stats and mood sparkline`.

---

## Task 8 — Search View

**Files:** modify `src/views/search.js`. **Visual reference:** Stitch "Search" mockup.

- [ ] **Step 1:** Implement — reads `?q=` from params for initial query.
  - Large headline-style search input (`font-headline`, italic, primary search icon).
  - Recent-searches chips (stored in `localStorage["interstice:recent-search"]`, capped at 5).
  - Filter row with collapsible `<details>` chips: Entry Type (multi-select checkboxes), Tags (multi-select from `getAllTags()`), Mood (1–5 radio).
  - Result cards: date column on left, snippet on right with matched terms wrapped in `<mark>`. Click → `navigate("#/day/<day>")`.
  - Debounced (~120ms) input → `searchEntries(state)` → re-render results.
  - Empty states: friendly copy when nothing typed yet, "Nothing found" when query has no matches.
  - `escapeHtml` first, then `<mark>`-wrap matches with a regex-escaped query.
- [ ] **Step 2:** Test — type a query that matches something, see highlighted match. Toggle a tag filter. Toggle a mood radio.
- [ ] **Step 3:** Commit: `feat(search): live search with filters and highlighted snippets`.

---

## Task 9 — Settings View

**Files:** modify `src/views/settings.js`. **Visual reference:** Stitch "Settings" mockup, with corrections from the spec.

- [ ] **Step 1:** Implement these sections in order:
  1. **Theme** — three buttons (Dark / Light / System); active one gets primary border + filled icon. Click writes `setPref("theme", value)` and calls `applyTheme(value)`.
  2. **Backup & Restore** — two export cards (Markdown, JSON) and a drop-zone label wrapping a hidden file input for import. Markdown export groups entries by day, formats as `**HH:MM** — _type_\n\nbody\n\nTags: #t1 #t2\n\n---`. JSON export uses `exportAll()`. Import calls `importAll(parsed, { merge: true })` and shows the count via `alert()`.
  3. **Install as App** — button calls the deferred `beforeinstallprompt` event captured at module load. If unavailable, button shows "INSTALL UNAVAILABLE" and explains to use the browser's install option.
  4. **Keyboard Shortcuts** — static reference list: `N` new entry, `⌘K / Ctrl+K` search, `1–5` set type (in modal), `⌘⏎ / Ctrl+⏎` save, `Esc` close. **No "Force Sync" entry — local app, nothing to sync.**
  5. **Local Footprint** — calls `estimateUsage()`, shows "X.XX MB used" with **NO fictitious cap**. Below: "CLEAR ALL DATA" button (error-tinted) with double `confirm()` before calling `clearAll()`.
  6. Footer: link to About, "Inspired by Novie by the Sea's video on interstitial journaling."
- [ ] **Step 2:** Test all theme switches, both export formats, import a previously-exported file, the clear-all flow.
- [ ] **Step 3:** Commit: `feat(settings): theme, export MD/JSON, import, PWA install, clear, storage`.

---

## Task 10 — About / Learn View (with the video)

**Files:** modify `src/views/about.js`. **Visual reference:** Stitch "About / Learn" mockup. **This is the screen the user specifically requested.**

- [ ] **Step 1:** Implement — calls `hideFab()` (no FAB on the info page).
  - Hero row: "What is interstitial journaling?" + 3 short paragraphs explaining the practice. Right column: a decorative illustration card.
  - **Video card** — `aspect-video` `<iframe>` with `src="https://www.youtube.com/embed/UFidZJhxz84"`, title attributing the video to Novie by the Sea, standard YouTube `allow` and `referrerpolicy` attributes, `allowfullscreen`.
  - **Credit caption** directly under the video: *"Video by Novie by the Sea. I did not create this video. All credit goes to the original creator. Watch it for the full explanation that inspired this app."*
  - Right of the caption: a button → `https://www.youtube.com/@novie-bythesea` with `target="_blank"` and `rel="noopener noreferrer"`.
  - "Why this method" — 3-card grid: ADHD-friendly (tertiary), Low-friction (secondary), Real self-awareness (primary). Each card has icon + title + paragraph.
  - Footer line: "Saved on this device · Built with care · Inspired by Novie by the Sea".
- [ ] **Step 2:** Test — `#/about` shows the video iframe loaded, credit visible, channel button opens a new tab.
- [ ] **Step 3:** Commit: `feat(about): explainer with embedded video and credit to Novie by the Sea`.

---

## Task 11 — Onboarding (first-launch)

**Files:** modify `src/views/onboarding.js`, `src/app.js`.

- [ ] **Step 1:** Implement — 4 paged slides with prev/next + skip:
  1. *The Analog Pause* / **Interstice** / Capture the moments between tasks.
  2. *The method* / **What is interstitial journaling?** / A short note in the cracks of your day.
  3. *How it works* / **Three small steps** / 1 · finished, 2 · linger, 3 · intent.
  4. *Privacy* / **A private sanctuary** / Your entries live only on this device.
  
  Final slide button reads "Start Journaling", calls `setPref("onboarded", true)` then `navigate("#/today")`. Skip in top-right corner does the same.
- [ ] **Step 2:** Modify `src/app.js` — before mounting the router, check `if (!getPrefs().onboarded && !location.hash) location.hash = "#/onboarding";`.
- [ ] **Step 3:** Test by clearing localStorage in DevTools and reloading.
- [ ] **Step 4:** Commit: `feat(onboarding): four-slide first-launch flow with skip`.

---

## Task 12 — Keyboard Shortcuts

**Files:** modify `src/shortcuts.js`.

- [ ] **Step 1:** Implement `registerShortcuts()` listening on document `keydown`:
  - Skip handling when `document.activeElement` is INPUT/TEXTAREA/SELECT.
  - `Cmd/Ctrl + K` → `navigate("#/search")`.
  - `N` (no modifiers) → `openNewEntryModal()`.
  - The modal owns its own `Esc` and `Cmd/Ctrl + Enter` handlers (Task 5).
- [ ] **Step 2:** Test — press `N` on Today, modal opens. Press `Cmd K` / `Ctrl K`, navigate to search.
- [ ] **Step 3:** Commit: `feat: global keyboard shortcuts (N, Cmd+K)`.

---

## Task 13 — Service Worker (offline shell)

**Files:** create `sw.js`.

- [ ] **Step 1:** Write a cache-first service worker with a versioned cache name (`interstice-v1`). Pre-cache the SHELL list (every file in `src/`, `index.html`, `styles.css`, `manifest.webmanifest`, the icons). On `install` skip-waiting; on `activate` clean old caches and claim clients. On `fetch`: skip cross-origin (fonts, YouTube), cache-first for same-origin, fall back to `index.html` on offline navigation failure.
- [ ] **Step 2:** Test — DevTools → Application → Service Workers → "activated". Throttle Network to "Offline" → reload → app shell renders.
- [ ] **Step 3:** Commit: `feat(pwa): cache-first service worker for offline shell`.

---

## Task 14 — Polish, End-to-End Walkthrough, Apply Spec Corrections

- [ ] **Step 1:** Verify mobile (375px) layout for every screen. Flag and fix any overflow or unreadable text.
- [ ] **Step 2:** Verify desktop (1280px) layout. Sidebar visible, FAB positioned correctly, content centered with sensible max-width.
- [ ] **Step 3:** Run the full happy path:
  1. Clear localStorage → reload → onboarding plays.
  2. Finish onboarding → Today empty state.
  3. Add 3 entries throughout the day; observe gap labels appear correctly.
  4. Open Calendar — today has dots, streak shows "1-day streak".
  5. Click yesterday (no entries) → empty Day Detail.
  6. Search for a word in one entry → highlighted match → click → opens that day.
  7. Settings → toggle Light theme → page restyled. Toggle back to Dark.
  8. Settings → Export JSON → file downloads. Import the same file → "Imported X entries".
  9. About → YouTube iframe plays. Click "Visit Novie by the Sea" → new tab.
  10. Press `N` outside any input → new entry modal opens.
  11. DevTools → Network → Offline → reload → app still works.
- [ ] **Step 4:** Re-confirm spec corrections are applied:
  - [ ] No fictitious 50 MB storage cap (Settings shows real `MB used`).
  - [ ] No "Force Sync" shortcut anywhere.
  - [ ] Topbar uses `cloud_off` icon, not `sync_saved_locally`.
  - [ ] No fake user avatar / "Elias Thorne / The Archivist" in the sidebar.
- [ ] **Step 5:** Commit any fixes from this pass: `polish: end-to-end pass, mobile/desktop verification, spec corrections`.

---

## Self-Review

- **Spec coverage:** Every feature in the spec maps to a task. The 8 screens map 1-to-1 to Tasks 4–11. Storage, theme, shortcuts, PWA covered in Tasks 1–2, 9, 12–13.
- **Type consistency:** `dayKey()` produces `YYYY-MM-DD`. The router uses the same format in `#/day/<dayKey>`. The entry shape is consistent across `db.js` and every view.
- **No placeholders:** every task names exact files, exact behaviour, exact references to the visual mockup, and explicit corrections that need applying.
- **Scope check:** This is one cohesive product. No subsystems hiding. Single plan is correct.
- **XSS:** Centralized in `safe-dom.js`; every view interpolates user content via `escapeHtml()`; Task 1 includes a regression test.
