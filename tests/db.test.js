// In-browser smoke tests for db.js. Open via test.html under a local server.
import {
  openDB,
  addEntry,
  listEntriesByDay,
  searchEntries,
  clearAll,
  exportAll,
  importAll,
  getAllTags,
  dayKey,
  updateEntry,
  deleteEntry,
  getEntry,
} from '../src/db.js';
import { escapeHtml, setHTML } from '../src/safe-dom.js';

const out = document.getElementById('out');
let pass = 0,
  fail = 0;

function log(msg, ok = true) {
  const el = document.createElement('div');
  el.className = ok ? 'ok' : 'fail';
  el.textContent = (ok ? '✓ ' : '✗ ') + msg;
  out.appendChild(el);
  if (ok) pass++;
  else fail++;
}

function group(label) {
  const h = document.createElement('h2');
  h.textContent = label;
  out.appendChild(h);
}

async function expect(label, fn) {
  try {
    await fn();
    log(label, true);
  } catch (e) {
    log(`${label} — ${e.message}`, false);
    console.error(e);
  }
}

await openDB();
await clearAll();

group('CRUD');

await expect('addEntry returns an entry with id, day, ts', async () => {
  const e = await addEntry({ body: 'hello world', type: 'finished', tags: ['t1', 'morning'] });
  if (!e.id || !e.day || !e.ts) throw new Error('missing fields');
});

await expect('getEntry returns the same entry', async () => {
  const e = await addEntry({ body: 'fetch me', tags: ['x'] });
  const g = await getEntry(e.id);
  if (!g || g.body !== 'fetch me') throw new Error('not found');
});

await expect('updateEntry merges patch and refreshes day if ts changes', async () => {
  const e = await addEntry({ body: 'before', tags: [] });
  const newTs = Date.now() - 86400 * 1000; // yesterday
  const u = await updateEntry(e.id, { body: 'after', ts: newTs });
  if (u.body !== 'after') throw new Error('body not updated');
  if (u.day !== dayKey(newTs)) throw new Error(`day not refreshed: ${u.day} vs ${dayKey(newTs)}`);
});

await expect('deleteEntry removes the row', async () => {
  const e = await addEntry({ body: 'doomed' });
  await deleteEntry(e.id);
  const g = await getEntry(e.id);
  if (g) throw new Error('entry still present');
});

group('Queries');

await expect('listEntriesByDay returns today entries sorted ascending', async () => {
  const today = dayKey(Date.now());
  const list = await listEntriesByDay(today);
  if (list.length < 1) throw new Error('expected at least one entry today');
  for (let i = 1; i < list.length; i++) {
    if (list[i].ts < list[i - 1].ts) throw new Error('not sorted ascending');
  }
});

await expect('searchEntries by text matches body', async () => {
  const r = await searchEntries({ q: 'hello' });
  if (r.length < 1) throw new Error('no body match');
});

await expect('searchEntries by tag matches', async () => {
  const r = await searchEntries({ tags: ['t1'] });
  if (r.length < 1) throw new Error('no tag match');
});

await expect('searchEntries by type matches', async () => {
  const r = await searchEntries({ types: ['finished'] });
  if (r.length < 1) throw new Error('no type match');
});

await expect('getAllTags returns sorted unique tags with counts', async () => {
  const tags = await getAllTags();
  if (!tags.length) throw new Error('no tags returned');
  if (typeof tags[0].count !== 'number') throw new Error('missing count');
});

group('Export / Import round-trip');

await expect('exportAll then importAll round-trips entries', async () => {
  const dump = await exportAll();
  if (!dump.entries.length) throw new Error('export was empty');
  await clearAll();
  const result = await importAll(dump);
  if (result.added < dump.entries.length) throw new Error(`only added ${result.added}/${dump.entries.length}`);
});

await expect('importAll rejects an invalid payload', async () => {
  let threw = false;
  try {
    await importAll({ schema: 'bogus', entries: [] });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('should have thrown');
});

group('XSS regression');

await expect('script tag in entry body is rendered inert via escapeHtml', async () => {
  await clearAll();
  const malicious = '<script>window.__pwned = true;</script><img src=x onerror="window.__pwned=true">';
  await addEntry({ body: malicious, tags: ['<svg/onload=alert(1)>'] });
  const all = await listEntriesByDay(dayKey(Date.now()));
  const e = all[0];

  // Render the body the same way every view does: escape, then setHTML.
  const stage = document.createElement('div');
  stage.style.display = 'none';
  document.body.appendChild(stage);

  const tagMarkup = e.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('');
  setHTML(stage, `<p>${escapeHtml(e.body)}</p>${tagMarkup}`);

  // Allow any handler to fire (it shouldn't).
  await new Promise((r) => setTimeout(r, 30));

  if (window.__pwned) throw new Error('XSS payload executed');
  if (stage.querySelectorAll('script').length) throw new Error('script tag was injected');
  if (stage.querySelectorAll('img').length) throw new Error('img tag was injected');
  stage.remove();
});

const summary = document.createElement('div');
summary.className = 'summary ' + (fail === 0 ? 'ok' : 'fail');
summary.textContent = `Done — ${pass} passed, ${fail} failed`;
out.appendChild(summary);
