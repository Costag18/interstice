// date.js — Pure date/time helpers. All times use the user's local timezone.

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateLong(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateShort(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatWeekday(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
}

export function greetingFor(ts = Date.now()) {
  const h = new Date(ts).getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Quiet night';
}

// Returns "47m" or "1h 12m" or "just now".
export function elapsedBetween(aTs, bTs) {
  const ms = Math.max(0, bTs - aTs);
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function parseDayKey(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// `days` is an array of unique YYYY-MM-DD keys, sorted descending.
// Returns the count of consecutive days ending today.
export function calcStreak(days) {
  if (!days || !days.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    const expectedKey = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(
      expected.getDate()
    ).padStart(2, '0')}`;
    if (days[i] === expectedKey) streak++;
    else break;
  }
  return streak;
}
