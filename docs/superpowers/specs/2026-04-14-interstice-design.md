# Interstice — Design Spec

> A local-first interstitial journaling PWA inspired by *"The BEST Productivity Method Ever for ADHD | Interstitial Journaling"* by Novie by the Sea (https://www.youtube.com/watch?v=UFidZJhxz84).

## What it is

A browser-based journal optimized for **interstitial entries** — quick, timestamped notes captured *between* tasks throughout the day. Designed for low-friction capture, especially helpful for ADHD.

## Hard requirements

- **100% local storage.** All data lives in the browser's IndexedDB. No accounts, no servers, no cloud sync, no analytics.
- **Mobile-first responsive.** Designed for one-handed phone capture, scales to tablet (two-pane) and desktop (three-pane).
- **Installable PWA.** Works offline once installed.
- **Cozy, warm aesthetic** — walnut + cream + terracotta + sage palette; Newsreader serif + Plus Jakarta Sans pairing; warm dark mode default with paper-light alternative.
- **Credit the source.** A dedicated About / Learn screen embeds the original YouTube video and clearly states the user did not create it; all credit to Novie by the Sea.

## Feature set (15 features)

### Core (the journaling loop)
1. One-tap **New Entry** button always visible (FAB on mobile, persistent button on desktop)
2. **Auto-timestamp** on every entry (editable)
3. **Entry types** as quick-pick chips: *Finished · Starting next · Feeling · Distraction · Idea*
4. **Today timeline** — chronological list with elapsed-time gap indicators between cards
5. **Browser-only IndexedDB** storage, surfaced gently with a "saved on this device" indicator

### Helpful additions
6. **Optional rotating prompts** in the entry body ("What did you just finish?" / "What's next?" / "How are you feeling?")
7. **Mood + Energy** sliders (1–5 dots each, optional)
8. **Tags** (free-form, autocomplete from past tags)
9. **Day Summary** — auto-stats: hours tracked, entry count, top tags, mood trend sparkline
10. **Calendar / History** — month grid with per-day intensity dots, filterable
11. **Search** across all entries with type/tag/date/mood filters
12. **Export** to Markdown and JSON (the user's only backup mechanism)
13. **Import** from a previously exported JSON file
14. **Keyboard shortcuts** — `N` new entry, `1–5` entry type, `Enter` save, `⌘K`/`Ctrl+K` search
15. **Installable PWA** with offline service worker; **light + dark theme** toggle (default dark)

## Screens (8 total)

1. **Onboarding** — first-launch only; 4 paged slides explaining the method, the steps, and the privacy promise
2. **Today / Home** — main timeline view with FAB
3. **New Entry** — bottom-sheet modal with timestamp, type chips, body, mood/energy, tags
4. **Calendar / History** — month grid + streak indicator + filter chips
5. **Day Detail** — past-day timeline with auto-summary card
6. **Search** — search bar + filters + result snippets
7. **About / Learn** — explainer + embedded video + credit + "Why this method?" cards
8. **Settings** — theme, export, import, shortcuts reference, PWA install, storage usage, clear-all

## Tech stack (decided)

- **Vanilla HTML / CSS / JS** with ES modules
- **Tailwind CSS via CDN** with a custom config matching the Stitch mockups
- **IndexedDB** via plain API (small wrapper, no Dexie)
- **Hash-based router** (`#/today`, `#/calendar`, `#/day/2026-04-13`, etc.) for no-build SPA
- **PWA manifest + service worker** for offline / installable
- **Tested manually in browser** plus a tiny `test.html` for the DB layer

## Visual reference

The 8 Stitch-generated HTML mockups (Onboarding, Today, New Entry, Calendar, Day Detail, Search, About, Settings) are the source of truth for visual styling. Implementation should faithfully translate them into the running app, with the following corrections decided during review:

- Drop the fictitious 50 MB storage cap — show actual bytes used, no fake limit
- Drop the "Force Sync ⌘S" shortcut — the app is local-only, nothing to sync
- Replace the `sync_saved_locally` icon in the top bar with a `lock` or `cloud_off` icon
- Drop the fake user avatar + "Elias Thorne / The Archivist" — single-user local app, no profile needed
- Keep the slightly literary microcopy ("Atmosphere", "Vigor", "The Analog Pause") — it suits the brand

## Out of scope (explicitly NOT building)

- Accounts, login, user management
- Cloud sync, server, backend of any kind
- Sharing, social, multi-user
- Notifications / reminders (could be added later as a v2)
- AI summarization or insights
- Encryption beyond what the browser provides for IndexedDB

## Success criteria

The user can:
1. Open the app fresh, see onboarding, dismiss it
2. Create their first entry in under 5 seconds from app launch
3. Add multiple entries throughout a day, see them on the Today timeline with gaps
4. Open a past day from the Calendar and see its summary
5. Search past entries by text or tag
6. Export their data as Markdown or JSON
7. Install the app to their home screen and use it offline
8. Watch the credit video on the About screen and visit the creator's channel
