// onboarding.js — First-launch 4-slide intro with prev/next/skip.

import { setPref } from '../helpers/prefs.js';
import { hideFab } from '../components/fab.js';
import { navigate } from '../router.js';
import { setHTML } from '../safe-dom.js';

const SLIDES = [
  {
    eyebrow: 'The Analog Pause',
    title: 'Interstice',
    body: 'Capture the moments between tasks.',
    icon: '🌿',
  },
  {
    eyebrow: 'The method',
    title: 'What is interstitial journaling?',
    body: 'A short note in the cracks of your day — right after you finish one thing, before you start the next.',
    icon: '⏳',
  },
  {
    eyebrow: 'How it works',
    title: 'Three small steps',
    body: 'Note what you finished. Capture any lingering thought. Set the intent for what comes next.',
    icon: '✦',
  },
  {
    eyebrow: 'Privacy',
    title: 'A private sanctuary',
    body: 'Your entries live only on this device. No accounts, no servers, no trackers.',
    icon: '🔒',
  },
];

export function render(root) {
  hideFab();
  let i = 0;
  paint();

  function paint() {
    const s = SLIDES[i];
    setHTML(
      root,
      `
      <section class="min-h-[80vh] md:min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
        <button id="skip" class="absolute top-6 right-6 font-label text-xs text-on-surface/40 hover:text-on-surface">Skip</button>

        <div class="text-6xl md:text-7xl mb-8 opacity-80">${s.icon}</div>
        <span class="font-label text-[10px] uppercase tracking-[0.3em] text-tertiary mb-4 block">${s.eyebrow}</span>
        <h1 class="font-headline italic text-4xl md:text-6xl mb-6 leading-tight">${s.title}</h1>
        <p class="text-base md:text-xl text-on-surface-variant max-w-md leading-relaxed">${s.body}</p>

        <div class="flex gap-2 mt-12">
          ${SLIDES.map((_, idx) => `<span class="w-2 h-2 rounded-full ${idx === i ? 'bg-primary' : 'bg-on-surface/20'}"></span>`).join('')}
        </div>

        <div class="flex gap-4 mt-12">
          ${i > 0 ? '<button id="back" class="px-6 py-3 rounded-full border border-outline-variant text-on-surface-variant font-label text-xs hover:bg-surface-container">Back</button>' : ''}
          <button id="next" class="px-10 py-3 rounded-full bg-primary text-on-primary font-label text-xs font-bold tracking-widest">${
            i === SLIDES.length - 1 ? 'START JOURNALING' : 'NEXT'
          }</button>
        </div>
      </section>`
    );

    root.querySelector('#next').addEventListener('click', () => {
      if (i === SLIDES.length - 1) finish();
      else {
        i++;
        paint();
      }
    });
    const back = root.querySelector('#back');
    if (back) back.addEventListener('click', () => { i--; paint(); });
    root.querySelector('#skip').addEventListener('click', finish);
  }

  function finish() {
    setPref('onboarded', true);
    navigate('#/today');
  }

  return { dispose() {} };
}
