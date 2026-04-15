# Interstice — The Analog Pause

A local-first **interstitial journaling** PWA. Capture the short notes that live between tasks — what you just finished, what you're starting next, how you're feeling.

🔗 **Live: https://interstice-two.vercel.app**

## Inspired by

This app was inspired by [**Novie by the Sea**](https://www.youtube.com/@novie-bythesea)'s video [*The BEST Productivity Method Ever for ADHD | Interstitial Journaling*](https://www.youtube.com/watch?v=UFidZJhxz84). I did not create that video — all credit goes to the original creator. The video is embedded inside the app's About screen with full attribution.

## What it does

- **One-tap entry capture** — quick, timestamped notes between tasks
- **Five entry types** — Finished · Starting Next · Feeling · Distraction · Idea
- **Mood + energy** sliders, free-form tags, autocomplete
- **Today timeline** with elapsed-time gap markers between entries
- **Calendar** with intensity dots and streak counter
- **Day Detail** with auto-summary stats (entries, hours tracked, top tag, mood sparkline)
- **Search** across all entries with type / tag / mood filters
- **Export / Import** to Markdown or JSON — your only backup mechanism
- **Theme toggle** (warm dark / paper light / system)
- **Keyboard shortcuts** — `N` new entry · `⌘K` search · `1–5` set type · `⌘⏎` save · `Esc` close
- **Installable PWA** with offline support

## Privacy

100% local. All entries live in your browser's IndexedDB. No accounts, no servers, no cloud sync, no analytics. Export to JSON regularly if you want a backup.

## Stack

Plain HTML / ES modules / IndexedDB / Tailwind CDN. No build step, no npm dependencies in the shipped app. Service worker for offline. Deployed on Vercel.

## Run locally

```bash
npx serve . -p 5173
# open http://localhost:5173/
```

(IndexedDB and ES modules need an http origin — opening `index.html` directly via `file://` will fail to load modules.)

## License

MIT — feel free to fork and remix.
