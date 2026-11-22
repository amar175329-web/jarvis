function localParts(date, timeZone) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(p.filter((v) => v.type !== 'literal').map((v) => [v.type, Number(v.value)]));
}
function localToUtc(p, timeZone) {
  const target = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second ?? 0);
  let guess = target;
  for (let i = 0; i < 4; i += 1) {
    const seen = localParts(new Date(guess), timeZone);
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const delta = target - seenUtc;
    guess += delta;
    if (!delta) break;
  }
  return new Date(guess);
}
function shift(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { ...parts, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
function byday(rule) {
  const m = /(?:^|;)BYDAY=([A-Z,]+)/.exec(rule ?? '');
  return m ? m[1].split(',') : [];
}
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function nextOccurrence(from, rule, timeZone = 'Asia/Kolkata') {
  const source = new Date(from);
  if (!Number.isFinite(source.getTime()) || typeof rule !== 'string') throw new TypeError('valid date and repeat rule are required');
  const p = localParts(source, timeZone);
  const normalized = rule.toUpperCase();
  let next = null;
  if (normalized === 'FREQ=DAILY') next = shift(p, 1);
  else if (normalized === 'FREQ=WEEKLY') next = shift(p, 7);
  else if (normalized.startsWith('FREQ=WEEKLY;BYDAY=')) {
    const days = byday(normalized);
    for (let i = 1; i <= 7; i += 1) {
      const candidate = shift(p, i);
      const weekday = WEEKDAYS[new Date(Date.UTC(candidate.year, candidate.month - 1, candidate.day)).getUTCDay()];
      if (days.includes(weekday)) { next = candidate; break; }
    }
  } else if (normalized === 'FREQ=MONTHLY') {
    const d = new Date(Date.UTC(p.year, p.month, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    next = { ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: Math.min(p.day, last) };
  }
  if (!next) throw new TypeError('unsupported repeat rule');
  return localToUtc(next, timeZone);
}

export function isSupportedRepeatRule(rule) {
  return ['FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'].includes(String(rule ?? '').toUpperCase());
}


/** Return the next scheduled time strictly after `after`, skipping missed periods. */
export function nextOccurrenceAfter(from, rule, timeZone = 'Asia/Kolkata', after = new Date()) {
  const boundary = new Date(after);
  if (!Number.isFinite(boundary.getTime())) throw new TypeError('valid recurrence boundary is required');
  let next = nextOccurrence(from, rule, timeZone);
  let skipped = 0;
  while (next.getTime() <= boundary.getTime() && skipped < 400) {
    next = nextOccurrence(next, rule, timeZone);
    skipped += 1;
  }
  if (next.getTime() <= boundary.getTime()) throw new RangeError('recurrence schedule exceeds supported catch-up window');
  return next;
}
