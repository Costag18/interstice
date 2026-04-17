// about.js — Explainer screen + embedded video + credit to Novie by the Sea.
// This screen is the user's specifically-requested feature.

import { renderTopbar } from '../components/topbar.js';
import { hideFab } from '../components/fab.js';
import { setHTML } from '../safe-dom.js';

export function render(root) {
  hideFab();

  setHTML(
    root,
    `${renderTopbar({ title: 'What is interstitial journaling?', subtitle: 'About & Inspiration' })}
    <section class="px-6 md:px-12 max-w-5xl mx-auto pb-16">

      <div class="grid lg:grid-cols-12 gap-8 lg:gap-12 mb-16 items-center">
        <div class="lg:col-span-7 space-y-5 text-base md:text-lg leading-relaxed text-on-surface-variant">
          <p>Interstitial journaling is the practice of writing a few sentences in the cracks of your day — right after you finish one task and before you start the next.</p>
          <p>Instead of mindlessly scrolling, you pause. You note what you just did, what's about to happen, and how you feel. Two minutes, maybe less.</p>
          <p>It works as a cognitive buffer: it empties your working memory, marks your transitions, and quietly builds a record of what your days were actually like — not the polished story you'd write at midnight.</p>
        </div>
        <div class="lg:col-span-5">
          <div class="aspect-square rounded-3xl overflow-hidden bg-surface-container-low rotate-2 shadow-2xl flex items-center justify-center">
            <div class="text-7xl md:text-8xl opacity-70">⏳</div>
          </div>
        </div>
      </div>

      <div class="bg-surface-container-low rounded-[2rem] p-4 md:p-8 mb-16">
        <div class="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl bg-black">
          <iframe class="w-full h-full"
            src="https://www.youtube.com/embed/UFidZJhxz84"
            title="The BEST Productivity Method Ever for ADHD | Interstitial Journaling — by Novie by the Sea"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen></iframe>
        </div>
        <div class="mt-6 flex flex-col md:flex-row gap-6 justify-between md:items-center">
          <div class="max-w-md">
            <span class="font-label text-[10px] uppercase tracking-[0.2em] text-secondary block mb-2">Inspiration & Credit</span>
            <p class="font-body text-sm text-on-surface-variant italic">
              Video by <strong class="text-on-surface not-italic">Novie by the Sea</strong>.
              <em>I did not create this video.</em> All credit goes to the original creator.
              Watch it for the full explanation that inspired this app.
            </p>
          </div>
          <a href="https://www.youtube.com/@novie-bythesea" target="_blank" rel="noopener noreferrer"
             class="inline-flex items-center gap-2 px-6 py-3 bg-primary-container text-on-primary-container rounded-full font-label text-xs font-bold whitespace-nowrap shadow-lg hover:brightness-110 transition">
            Visit Novie by the Sea
            <span class="material-symbols-outlined text-base">open_in_new</span>
          </a>
        </div>
      </div>

      <h3 class="text-2xl md:text-3xl font-headline mb-6 flex items-center gap-4">
        Sticky notes — three analog methods
        <span class="h-px flex-1 bg-outline-variant/30"></span>
      </h3>
      <p class="text-base md:text-lg leading-relaxed text-on-surface-variant mb-6 max-w-3xl">
        The <a href="#/stickies" class="text-primary underline-offset-4 hover:underline">Stickies</a>
        section implements two of the three sticky-note methods from the video below
        — Brain Dump and Parking Lot. The third method (interstitial journaling on
        sticky notes) <em>is</em> Interstice's Today view.
      </p>

      <div class="bg-surface-container-low rounded-[2rem] p-4 md:p-8 mb-16">
        <div class="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl bg-black">
          <iframe class="w-full h-full"
            src="https://www.youtube.com/embed/AQcPtIMuOqw"
            title="Stop Using Apps for ADHD Focus. Try This Instead. — by Novie by the Sea"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen></iframe>
        </div>
        <div class="mt-6 flex flex-col md:flex-row gap-6 justify-between md:items-center">
          <div class="max-w-md">
            <span class="font-label text-[10px] uppercase tracking-[0.2em] text-secondary block mb-2">Inspiration & Credit</span>
            <p class="font-body text-sm text-on-surface-variant italic">
              Video by <strong class="text-on-surface not-italic">Novie by the Sea</strong>.
              <em>I did not create this video.</em> All credit to the original creator.
              This is what inspired the Stickies section.
            </p>
          </div>
          <a href="#/stickies"
             class="inline-flex items-center gap-2 px-6 py-3 bg-primary-container text-on-primary-container rounded-full font-label text-xs font-bold whitespace-nowrap shadow-lg hover:brightness-110 transition">
            Open Stickies
            <span class="material-symbols-outlined text-base">sticky_note_2</span>
          </a>
        </div>
      </div>

      <h3 class="text-2xl md:text-3xl font-headline mb-6 flex items-center gap-4">
        Why this method
        <span class="h-px flex-1 bg-outline-variant/30"></span>
      </h3>
      <div class="grid md:grid-cols-3 gap-6 mb-16">
        ${pillar('neurology', 'tertiary', 'ADHD-friendly', 'Short bursts work with the way an ADHD brain transitions. No "wall of awful" before a long journaling session — just a sentence or two when the timing is right.')}
        ${pillar('bolt', 'secondary', 'Low-friction', "No prompts to wrestle with, no forced format. A timestamp and your current state — that's the whole ritual.")}
        ${pillar('visibility', 'primary', 'Real self-awareness', 'Logging in real time catches moods and patterns the late-night recap version always misses.')}
      </div>

      <footer class="py-12 border-t border-outline-variant/20 text-center font-label text-xs text-on-surface/40">
        Saved on this device · Built with care · Inspired by Novie by the Sea
      </footer>
    </section>`
  );

  return { dispose() {} };
}

function pillar(icon, color, title, body) {
  // Color classes are constructed at compile-time so Tailwind picks them up.
  const colorMap = {
    tertiary: { bg: 'bg-tertiary/10', text: 'text-tertiary', heading: 'text-tertiary' },
    secondary: { bg: 'bg-secondary/10', text: 'text-secondary', heading: 'text-secondary' },
    primary: { bg: 'bg-primary/10', text: 'text-primary', heading: 'text-primary' },
  };
  const c = colorMap[color] ?? colorMap.primary;
  return `<div class="bg-surface-container p-6 md:p-8 rounded-2xl">
    <div class="w-12 h-12 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-4">
      <span class="material-symbols-outlined">${icon}</span>
    </div>
    <h4 class="font-headline text-xl font-bold mb-3 ${c.heading}">${title}</h4>
    <p class="font-body text-sm leading-relaxed text-on-surface-variant">${body}</p>
  </div>`;
}
