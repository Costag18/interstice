// ask-llm.js — Opens a modal that packages the user's journal into a rich
// prompt they can paste into ChatGPT / Claude / Gemini / any LLM to get
// pattern analysis of productivity, energy, mood, distractions, etc.
//
// The prompt ships with:
//   • A role + task for the LLM (productivity/wellbeing coach)
//   • Concrete analysis questions (productivity, energy, mood, distractions, transitions)
//   • Summary statistics computed locally
//   • The full entry history grouped by day, in readable markdown
//
// All work is client-side. Nothing leaves the device until the user explicitly
// pastes the prompt somewhere.

import { listEntriesByRange } from './db.js';
import { formatTime, formatDateLong } from './helpers/date.js';
import { setHTML, escapeHtml } from './safe-dom.js';

const RANGES = {
  '7d':  { label: 'Last 7 days',  days: 7  },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
  'all': { label: 'All time',     days: null },
};
const DEFAULT_RANGE = '30d';

export async function openAskLLMModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;

  let currentRange = DEFAULT_RANGE;

  const repaint = async () => {
    const { prompt, summary } = await buildPrompt(currentRange);
    setHTML(root, modalMarkup(currentRange, prompt, summary));
    wire();
  };

  const wire = () => {
    root.querySelector('#ask-close').addEventListener('click', close);
    root.querySelector('#ask-bg').addEventListener('click', (e) => {
      if (e.target.id === 'ask-bg') close();
    });
    root.querySelectorAll('[data-range]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        currentRange = btn.dataset.range;
        await repaint();
      });
    });
    root.querySelector('#ask-copy').addEventListener('click', async () => {
      const textarea = root.querySelector('#ask-preview');
      try {
        await navigator.clipboard.writeText(textarea.value);
        const btn = root.querySelector('#ask-copy');
        const original = btn.innerHTML;
        setHTML(btn, `<span class="material-symbols-outlined text-base">check</span>COPIED`);
        btn.classList.add('bg-secondary');
        btn.classList.remove('bg-primary');
        setTimeout(() => {
          setHTML(btn, original);
          btn.classList.remove('bg-secondary');
          btn.classList.add('bg-primary');
        }, 1800);
      } catch {
        // Older Safari / iframe contexts may block clipboard writes
        textarea.select();
        alert('Clipboard blocked. The text is selected — press ⌘C / Ctrl+C.');
      }
    });
  };

  const close = () => setHTML(root, '');

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  await repaint();
}

// ─── Prompt construction ────────────────────────────────────────────────────

async function buildPrompt(rangeKey) {
  const r = RANGES[rangeKey] ?? RANGES[DEFAULT_RANGE];
  const now = Date.now();
  const from = r.days ? now - r.days * 86400 * 1000 : 0;
  const entries = await listEntriesByRange(from, now);

  const summary = computeSummary(entries, r.label);
  if (!entries.length) {
    return {
      prompt: `You haven't captured any entries in the selected window (${r.label}). Try widening the range, or come back after a few days of journaling.`,
      summary,
    };
  }

  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  const orderedDays = [...byDay.keys()].sort();

  const header = `You are a thoughtful productivity and wellbeing coach.

Below is a journal kept using "interstitial journaling" — short timestamped notes captured in the moments BETWEEN tasks throughout the day. Each entry has:
  • a type: Finished, Starting Next, Feeling, Distraction, or Idea
  • an optional mood rating (1–5, where 5 = best)
  • an optional energy rating (1–5, where 5 = most energetic)
  • free-form tags

Your task: analyze this data and share specific, evidence-based patterns you notice. Focus on:

1. PRODUCTIVITY — When does this person tend to finish things? What contexts (tags, types of work, times of day, days of week) correlate with more "Finished" entries? Are there productive streaks?

2. ENERGY — How does energy fluctuate across the day? What activities or tags precede high-energy or low-energy states? Any recurring crashes or peaks?

3. MOOD — What's the overall mood trend across the period? What contexts correlate with high-mood vs low-mood entries? Is there a relationship between mood and productivity?

4. DISTRACTIONS — What pulls their attention most often? Does it follow particular tasks or times of day? Are there tags or hours where distractions cluster?

5. TRANSITIONS — Look at what's before vs after "Starting Next" entries. Does this person typically set a clear intention, or drift? What kinds of tasks tend to be abandoned mid-flow?

6. SURPRISES — Anything genuinely counter-intuitive in the data that I should know about myself?

Be specific — cite concrete entries when making claims (e.g. "On April 12 at 3:14pm you noted '...'"). Avoid generic productivity advice. Where you find a clear pattern, suggest one or two small experiments I could try this week to test it.

═══════════════════════════════════════════════════════════════════════════

## SUMMARY

Period: ${r.label}
Days with at least one entry: ${byDay.size}
Total entries: ${entries.length}
Entry type breakdown: ${formatTypeBreakdown(entries)}
Average mood: ${summary.avgMood} (from ${summary.moodCount} rated entries)
Average energy: ${summary.avgEnergy} (from ${summary.energyCount} rated entries)
Top tags: ${summary.topTagsString || '(none)'}

═══════════════════════════════════════════════════════════════════════════

## ENTRIES

`;

  let body = '';
  for (const day of orderedDays) {
    const dayEntries = byDay.get(day).sort((a, b) => a.ts - b.ts);
    body += `### ${formatDateLong(dayEntries[0].ts)}\n\n`;
    for (const e of dayEntries) {
      const meta = [];
      if (e.mood != null) meta.push(`mood ${e.mood}/5`);
      if (e.energy != null) meta.push(`energy ${e.energy}/5`);
      if ((e.tags || []).length) meta.push(e.tags.map((t) => `#${t}`).join(' '));
      const typeLabel = e.type ? e.type.charAt(0).toUpperCase() + e.type.slice(1) : 'Note';
      body += `**${formatTime(e.ts)} — ${typeLabel}**\n${e.body}\n`;
      if (meta.length) body += `_${meta.join(' · ')}_\n`;
      body += '\n';
    }
  }

  return { prompt: header + body, summary };
}

function computeSummary(entries, rangeLabel) {
  const moods = entries.map((e) => e.mood).filter((v) => v != null);
  const energies = entries.map((e) => e.energy).filter((v) => v != null);
  const tagCounts = new Map();
  for (const e of entries) for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    rangeLabel,
    entryCount: entries.length,
    avgMood: moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) + '/5' : 'n/a',
    moodCount: moods.length,
    avgEnergy: energies.length ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) + '/5' : 'n/a',
    energyCount: energies.length,
    topTagsString: topTags.map(([t, c]) => `#${t} (${c})`).join(', '),
  };
}

function formatTypeBreakdown(entries) {
  const counts = { finished: 0, starting: 0, feeling: 0, distraction: 0, idea: 0, note: 0 };
  for (const e of entries) {
    const key = e.type && counts.hasOwnProperty(e.type) ? e.type : 'note';
    counts[key]++;
  }
  const nice = [];
  if (counts.finished)    nice.push(`${counts.finished} Finished`);
  if (counts.starting)    nice.push(`${counts.starting} Starting Next`);
  if (counts.feeling)     nice.push(`${counts.feeling} Feeling`);
  if (counts.distraction) nice.push(`${counts.distraction} Distraction`);
  if (counts.idea)        nice.push(`${counts.idea} Idea`);
  if (counts.note)        nice.push(`${counts.note} untyped`);
  return nice.join(', ') || '(none)';
}

// ─── Markup ─────────────────────────────────────────────────────────────────

function modalMarkup(currentRange, prompt, summary) {
  const rangeButtons = Object.entries(RANGES)
    .map(([key, r]) => {
      const active = key === currentRange;
      const cls = active
        ? 'bg-primary text-on-primary border-primary'
        : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/40';
      return `<button data-range="${key}"
        class="px-4 py-1.5 rounded-full border font-label text-xs tracking-wider transition ${cls}">
        ${r.label}
      </button>`;
    })
    .join('');

  const charCount = prompt.length.toLocaleString();
  const wordCount = Math.round(prompt.split(/\s+/).length).toLocaleString();

  return `
    <div id="ask-bg" class="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-6 bg-black/60 backdrop-blur-sm">
      <div class="w-full md:max-w-3xl bg-surface-container-low rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="ask-title">
        <div class="p-6 md:p-8 pb-4 flex justify-between items-start gap-4 shrink-0">
          <div class="min-w-0">
            <h3 id="ask-title" class="font-headline text-2xl flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">psychology</span>
              Analyze with an LLM
            </h3>
            <p class="font-body text-sm text-on-surface/60 mt-2 leading-relaxed">
              This packages your journal into a prompt you can paste into ChatGPT, Claude, Gemini, or any LLM to get pattern analysis of your productivity, energy, mood, distractions, and transitions.
            </p>
          </div>
          <button id="ask-close" aria-label="Close" class="p-2 rounded-full hover:bg-surface-container text-on-surface/60 shrink-0">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="px-6 md:px-8 py-3 flex flex-wrap gap-2">
          ${rangeButtons}
        </div>

        <div class="px-6 md:px-8 py-2">
          <div class="bg-tertiary/10 border border-tertiary/30 rounded-xl p-3 flex gap-3 mb-3">
            <span class="material-symbols-outlined text-tertiary shrink-0 text-base">privacy_tip</span>
            <div class="font-body text-xs text-on-surface-variant leading-relaxed">
              The prompt contains your entries. When you paste it into an LLM, it travels to that provider and their privacy policy applies. Nothing leaves this device until you paste it yourself.
            </div>
          </div>

          <div class="flex items-center justify-between text-[11px] font-label uppercase tracking-widest text-on-surface/40 mb-1">
            <span>Preview</span>
            <span>${summary.entryCount} entries · ${wordCount} words · ${charCount} chars</span>
          </div>
        </div>

        <div class="px-6 md:px-8 flex-1 overflow-hidden flex flex-col min-h-0">
          <textarea id="ask-preview" readonly
            class="flex-1 w-full bg-surface-container rounded-xl p-4 font-mono text-xs text-on-surface-variant resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[40vh]">${escapeHtml(prompt)}</textarea>
        </div>

        <div class="p-6 md:p-8 pt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shrink-0">
          <p class="font-label text-[11px] text-on-surface/40 leading-relaxed">
            Tip: After copying, paste into a fresh chat in your preferred LLM. Longer responses sometimes come out better in Claude or Gemini than ChatGPT's shorter default answers.
          </p>
          <button id="ask-copy"
            class="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-on-primary font-label text-xs font-bold tracking-widest shadow-lg hover:brightness-110 transition">
            <span class="material-symbols-outlined text-base">content_copy</span>
            COPY PROMPT
          </button>
        </div>
      </div>
    </div>`;
}
