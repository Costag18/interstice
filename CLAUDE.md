# Interstice — CLAUDE.md

## What this is

A **local-first interstitial journaling PWA** called Interstice. Users capture short, timestamped notes *between* tasks throughout the day — what they finished, what's next, how they feel. Designed for ADHD-friendly low-friction capture. Inspired by [Novie by the Sea's video](https://www.youtube.com/watch?v=UFidZJhxz84).

Live at **https://interstice-two.vercel.app**. GitHub repo: **https://github.com/Costag18/interstice**.

## Tech stack

- **Vanilla HTML / ES modules / IndexedDB** — no framework, no build step, no npm dependencies in shipped code
- **Tailwind CSS via CDN** with a custom theme (walnut/cream/terracotta/sage palette, Newsreader serif + Plus Jakarta Sans)
- **PWA** — `manifest.webmanifest` + cache-first service worker (`sw.js`)
- **Hash-based SPA router** — `#/today`, `#/calendar`, `#/day/YYYY-MM-DD`, `#/search`, `#/settings`, `#/about`, `#/onboarding`
- **Optional sync** — private GitHub Gist via REST API, with optional AES-256-GCM E2E encryption
- **Deployed on Vercel** as a static site. Auto-deploys on push to `main` via GitHub integration.

## Running locally

```bash
npx serve . -p 5173
# open http://localhost:5173/
```

IndexedDB + ES modules require an http origin — `file://` won't work.

## File structure

```
index.html                    SPA shell (inline splash CSS, Tailwind config, 5 root containers)
styles.css                    Grain overlay, light-mode overrides, scrollbar, dashed-line connector
manifest.webmanifest          PWA manifest
sw.js                         Cache-first service worker (bump CACHE version string on every deploy)
vercel.json                   Static deploy config + headers for SW/manifest
icons/                        PWA icons (192, 512, maskable-512)

src/
  app.js                      Boot: theme > openDB > nav > shortcuts > auto-sync > router > dismiss splash
  db.js                       IndexedDB wrapper. Single object store `entries` keyed by `id`.
                              Indexes: `by_ts`, `by_day`. Meta store for caching AES keys.
                              Exports: addEntry, updateEntry, deleteEntry, getEntry,
                              listEntriesByDay, listEntriesByRange, listAllEntries,
                              searchEntries, getAllTags, clearAll, exportAll, importAll,
                              syncImport, onDbChanged, estimateUsage, dayKey,
                              setMetaValue, getMetaValue, deleteMetaValue
  router.js                   Hash router. Each view = dynamic import then render(root, params).
  theme.js                    Dark/light/system toggle. Persists via prefs.js.
  shortcuts.js                N = new entry, Cmd+K = search
  safe-dom.js                 escapeHtml() + setHTML() — single XSS audit surface
  sync.js                     GitHub Gist sync engine. Pull on boot + focus + 20s poll.
                              Push debounced 1.5s after writes. Exponential backoff on errors.
  sync-meta.js                localStorage-backed sync metadata + tombstones (90-day TTL)
  crypto.js                   AES-256-GCM + PBKDF2-SHA256 (600K iter). wrap/unwrap/deriveKey.
  ask-llm.js                  Modal that packages journal into an LLM prompt for pattern analysis.

  helpers/
    date.js                   formatTime, formatDateLong, greetingFor, elapsedBetween, calcStreak, etc.
    prefs.js                  localStorage prefs (theme, onboarded)

  components/
    nav.js                    Sidebar (md+) + bottom tabs (mobile). No user avatar — local-only.
    topbar.js                 Sticky header with sync indicator (cloud_off / cloud_done / lock / spinning)
    fab.js                    Floating "+" button, wired to openNewEntryModal()

  views/
    today.js                  Main timeline. Auto-refreshes via onDbChanged. Rolls over at midnight.
    new-entry.js              Bottom-sheet modal. Type chips, mood/energy dots, tag autocomplete.
    calendar.js               Month grid with intensity dots, streak, "Analyze with LLM" button.
    day-detail.js             Past-day timeline + summary stats + mood sparkline.
    search.js                 Live search with type/tag/mood filters, highlighted matches.
    settings.js               Theme, sync (GitHub gist), encryption, export/import, PWA install, clear.
    about.js                  Explainer + embedded YouTube video + credit to Novie by the Sea.
    onboarding.js             4-slide first-launch flow.

test.html + tests/db.test.js  12 in-browser smoke tests (CRUD, search, export/import, XSS regression)
```

## Entry schema

```
{
  id:        string     // crypto.randomUUID()
  ts:        number     // epoch ms
  day:       string     // "YYYY-MM-DD" local time, derived from ts
  type:      string|null // "finished" | "starting" | "feeling" | "distraction" | "idea"
  body:      string
  mood:      1..5|null
  energy:    1..5|null
  tags:      string[]
  createdAt: number
  updatedAt: number
}
```

## Key architectural decisions

### XSS safety
All views build markup as template strings. User-supplied content (body, tags, search query) MUST go through `escapeHtml()` from `safe-dom.js`. All markup is written via `setHTML(el, html)` — a single chokepoint using `Range.createContextualFragment`. Never write raw HTML assignment directly in view code.

### Sync model
- Each device has its own IndexedDB. The gist is the sync relay.
- Pull on boot, on tab focus, and every 20s while visible.
- Push debounced 1.5s after any DB change.
- Conflict: latest `updatedAt` wins per entry.
- Deletes: soft tombstones in localStorage, propagated via the gist payload, pruned after 90 days.
- Errors: exponential backoff (30s then 5min cap), auto-recovery. Manual "Try Again" bypasses backoff.

### Encryption (optional)
- AES-256-GCM, key derived via PBKDF2-SHA256 (600K iterations).
- Derived key cached in IndexedDB with `extractable: false`.
- Envelope stored in gist: `{ schema: "interstice/v1+enc", kdf, iterations, salt, iv, ciphertext }`.
- When device #2 pulls an encrypted gist, a passphrase modal fires.

### Midnight rollover
Today view tracks `currentDay`. A `setTimeout` fires 1s past midnight, plus `visibilitychange` and `onDbChanged` both re-check. The topbar greeting, date heading, and entry list all refresh.

### Service worker versioning
The SW cache string (e.g. `interstice-v8`) MUST be bumped on every code change. Old caches are cleaned on `activate`. If you forget to bump it, users get stale code until their browser fetches the new SW file.

## Common tasks

### Add a new view
1. Create `src/views/myview.js` exporting `render(root, params)` returning `{ dispose() {} }`.
2. Register it in `src/router.js` inside `mountRouter()`.
3. Add the file path to the `SHELL` array in `sw.js` and bump the cache version.
4. If it shows entry data, subscribe to `onDbChanged` and re-render on changes.

### Add a nav item
Edit `src/components/nav.js` — the `items` array at the top.

### Modify the theme tokens
The Tailwind config is inline in `index.html` inside a `<script>` tag. The color tokens match the Stitch mockups exactly. Light-mode overrides are in `styles.css`.

### Test changes
Run `npx serve . -p 5173` and open `/test.html` for DB smoke tests. For views, manually walk through each screen. The Claude Preview tool can also be used for programmatic verification.

### Deploy
Just `git push` to `main`. Vercel auto-deploys in ~3s. Or manually: `vercel --prod`.

## Style guide

- **Cozy and warm aesthetic**: walnut dark (#1a120b), cream text (#f0dfd4), terracotta primary (#ffb59a), sage secondary (#b1ceb0), honey tertiary (#f0bd8b)
- **Typography**: Newsreader (serif) for headlines + body; Plus Jakarta Sans for labels/UI chrome
- **Tone of microcopy**: gentle, encouraging, second-person. "Take a breath, then capture the moment." Never gamified or pushy.
- **Privacy-first language**: "Saved on this device", never "uploaded" or "synced to the cloud" (even though gist sync exists, it is opt-in and the default is local-only)

## Known quirks / watch out for

- The Write tool security hook blocks files containing the DOM property for setting element HTML directly. Always use `setHTML()` from `safe-dom.js` instead. Even comments referencing that property name can trigger the hook.
- Tailwind CDN logs a "should not be used in production" warning — cosmetic, harmless.
- The Claude Preview iframe does not support `window.scrollTo` (iframe sizes to content with no overflow), so scroll behavior can only be verified on the deployed site or a real browser tab.
- `validateTokenShape()` in sync.js rejects fine-grained PATs (`github_pat_...`) up front — they genuinely cannot access gists. Only classic tokens (`ghp_...`) work.
- IndexedDB version is currently 2 (added `meta` store for encryption key cache). If you add another object store, bump `DB_VERSION` and handle the upgrade in `openDB()`.

## Credit
Inspired by [Novie by the Sea](https://www.youtube.com/@novie-bythesea)'s video [*The BEST Productivity Method Ever for ADHD | Interstitial Journaling*](https://www.youtube.com/watch?v=UFidZJhxz84). The About screen embeds this video with a prominent credit stating the user did not create it.
