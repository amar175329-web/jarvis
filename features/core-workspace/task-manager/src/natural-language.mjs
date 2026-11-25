import { classifySensitivity } from './sensitivity.mjs';

const ZONE = 'Asia/Kolkata';
const DEVA_DIGITS = '०१२३४५६७८९';
const DAY_WORDS = new Map([
  ['aaj', 'today'], ['आज', 'today'], ['today', 'today'],
  ['kal', 'tomorrow'], ['कल', 'tomorrow'], ['tomorrow', 'tomorrow'],
  ['parso', 'day_after'], ['parson', 'day_after'], ['परसों', 'day_after'],
  ['monday', 'weekday:1'], ['सोमवार', 'weekday:1'], ['somwar', 'weekday:1'],
  ['tuesday', 'weekday:2'], ['मंगलवार', 'weekday:2'], ['mangalwar', 'weekday:2'],
  ['wednesday', 'weekday:3'], ['बुधवार', 'weekday:3'], ['budhwar', 'weekday:3'],
  ['thursday', 'weekday:4'], ['गुरुवार', 'weekday:4'], ['guruwar', 'weekday:4'],
  ['friday', 'weekday:5'], ['शुक्रवार', 'weekday:5'], ['shukrawar', 'weekday:5'],
  ['saturday', 'weekday:6'], ['शनिवार', 'weekday:6'], ['shaniwar', 'weekday:6'],
  ['sunday', 'weekday:7'], ['रविवार', 'weekday:7'], ['इतवार', 'weekday:7'], ['ravivar', 'weekday:7'], ['itwar', 'weekday:7'],
]);
const DAYPARTS = [
  { re: /\b(subah|savere|morning)\b|सुबह|सवेरे|भोर/iu, name: 'morning', from: 4, to: 11 },
  { re: /\b(dopahar|dopehar|afternoon)\b|दोपहर/iu, name: 'afternoon', from: 12, to: 16 },
  { re: /\b(shaam|sham|evening)\b|शाम/iu, name: 'evening', from: 17, to: 19 },
  { re: /\b(raat|night)\b|रात/iu, name: 'night', from: 20, to: 23 },
];
const HOUR_WORDS = new Map([
  ['ek', 1], ['one', 1], ['do', 2], ['two', 2], ['teen', 3], ['three', 3], ['char', 4], ['four', 4],
  ['paanch', 5], ['panch', 5], ['five', 5], ['chhe', 6], ['chhah', 6], ['six', 6], ['saat', 7], ['seven', 7],
  ['aath', 8], ['eight', 8], ['nau', 9], ['nine', 9], ['das', 10], ['ten', 10], ['gyarah', 11], ['eleven', 11],
  ['barah', 12], ['twelve', 12], ['एक', 1], ['दो', 2], ['तीन', 3], ['चार', 4], ['पांच', 5], ['पाँच', 5],
  ['छह', 6], ['छः', 6], ['सात', 7], ['आठ', 8], ['नौ', 9], ['दस', 10], ['ग्यारह', 11], ['बारह', 12],
]);

function normalizeDigits(value) {
  return String(value).replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d)));
}

function partsAt(date, timeZone = ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

function localDateParts(date, timeZone = ZONE) {
  const p = partsAt(date, timeZone);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}

function shiftDate({ year, month, day }, offset) {
  const d = new Date(Date.UTC(year, month - 1, day + offset));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function localToUtc({ year, month, day, hour, minute = 0, second = 0 }, timeZone = ZONE) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = target;
  for (let i = 0; i < 4; i += 1) {
    const seen = localDateParts(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const delta = target - seenAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess);
}

function dayOffset(token, nowParts) {
  if (!token) return null;
  const normalized = token.toLowerCase();
  const kind = DAY_WORDS.get(normalized);
  if (!kind) return null;
  if (kind === 'today') return 0;
  if (kind === 'tomorrow') return 1;
  if (kind === 'day_after') return 2;
  if (kind.startsWith('weekday:')) {
    const target = Number(kind.split(':')[1]);
    const todayIso = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)).getUTCDay() || 7;
    return (target - todayIso + 7) % 7 || 7;
  }
  return null;
}

function detectDate(text, nowParts) {
  const words = [...text.matchAll(/[\p{L}\p{M}]+/gu)];
  for (const m of words) {
    const token = m[0].toLowerCase();
    if (DAY_WORDS.has(token)) return { token, offset: dayOffset(token, nowParts), span: [m.index, m.index + m[0].length] };
  }
  return null;
}

function detectDaypart(text) {
  for (const item of DAYPARTS) {
    const m = item.re.exec(text);
    if (m) return { ...item, span: [m.index, m.index + m[0].length] };
  }
  return null;
}

function detectTime(text) {
  const normalized = normalizeDigits(text);
  const numeric = /(\b\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:baje|बजे|o'clock)?/iu.exec(normalized);
  if (numeric && (numeric[2] !== undefined || numeric[3] !== undefined || /(?:baje|बजे|o'clock)/iu.test(numeric[0]))) {
    const hour = Number(numeric[1]);
    const minute = Number(numeric[2] ?? 0);
    const suffix = (numeric[3] ?? '').replaceAll('.', '').toLowerCase();
    const explicit = Boolean(suffix);
    return { hour, minute, suffix, explicit, span: [numeric.index, numeric.index + numeric[0].length] };
  }
  const word = /([\p{L}]+)\s*(?:baje|बजे)/iu.exec(text);
  if (word && HOUR_WORDS.has(word[1].toLowerCase())) return { hour: HOUR_WORDS.get(word[1].toLowerCase()), minute: 0, suffix: '', explicit: false, span: [word.index, word.index + word[0].length] };
  return null;
}

const INVALID_TIME_MSG = "Time samajh nahi aaya. 'aaj 10 pm' ya '22:00' likho.";

function normalizeSuffix(value) {
  return String(value ?? '').replaceAll('.', '').toLowerCase();
}

/** Detect a same-day time interval such as "3 se 4 baje" or "3 pm to 4 pm". */
function detectTimeRange(text) {
  const normalized = normalizeDigits(text);
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:baje|बजे)?\s*(?:se|से|to|तक|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:baje|बजे)?/iu;
  const match = re.exec(normalized);
  if (!match) return null;
  let startSuffix = normalizeSuffix(match[3]);
  let endSuffix = normalizeSuffix(match[6]);
  if (!startSuffix && endSuffix) startSuffix = endSuffix;
  if (!endSuffix && startSuffix) endSuffix = startSuffix;
  return {
    start: { hour: Number(match[1]), minute: Number(match[2] ?? 0), suffix: startSuffix, explicit: Boolean(startSuffix) },
    end: { hour: Number(match[4]), minute: Number(match[5] ?? 0), suffix: endSuffix, explicit: Boolean(endSuffix) },
    span: [match.index, match.index + match[0].length],
  };
}

function resolveHour(time, daypart, allowRangeStart = false) {
  if (!time) return null;
  let hour = time.hour;
  if (!Number.isInteger(hour) || hour < 0 || hour > 24 || time.minute < 0 || time.minute > 59 || (hour === 24 && time.minute !== 0)) return { invalid: true };
  if (time.suffix) {
    if (hour < 1 || hour > 12) return { invalid: true };
    hour = hour % 12 + (time.suffix === 'pm' ? 12 : 0);
  } else if (hour >= 13) {
    // 24-hour values are unambiguous.
  } else if (daypart) {
    if (daypart.name === 'morning') {
      if (hour >= 5 && hour <= 11) { /* AM */ }
      else return { invalid: true };
    } else if (daypart.name === 'afternoon') {
      if (hour === 12) hour = 12;
      else if (hour >= 1 && hour <= 5) hour += 12;
      else return { invalid: true };
    } else if (daypart.name === 'evening') {
      if (hour >= 4 && hour <= 9 || allowRangeStart && hour === 3) hour += 12;
      else return { invalid: true };
    } else if (daypart.name === 'night') {
      if (hour >= 8 && hour <= 11) hour += 12;
      else if (hour === 12) return { needsConfirmation: 'midnight_date', message: 'raat 12 baje aaj ya kal ki?' };
      else if (hour >= 1 && hour <= 4) return { needsConfirmation: 'night_after_midnight', message: 'Raat ke baad (AM) ka time hai — aaj ya kal ki date confirm karo.' };
      else return { invalid: true };
    } else {
      return { invalid: true };
    }
  } else if (hour >= 1 && hour <= 12) {
    return { ambiguous: true };
  }
  return { hour, minute: time.minute };
}

function detectRepeat(text) {
  const rules = [
    { rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', re: /\b(?:weekdays|every\s+weekday|mon\s*[-–]\s*fri|har\s+working\s+day)\b|हर\s*(?:कामकाजी\s*)?दिन/iu },
    { rule: 'FREQ=DAILY', re: /\b(?:daily|every\s+day|everyday|har\s+roz|har\s+din|roz)\b|रोज़|रोज|हर\s*दिन|प्रतिदिन/iu },
    { rule: 'FREQ=WEEKLY', re: /\b(?:weekly|every\s+week|har\s+hafte)\b|हर\s*हफ्ते/iu },
    { rule: 'FREQ=MONTHLY', re: /\b(?:monthly|every\s+month|har\s+mahine)\b|हर\s*महीने/iu },
  ];
  for (const item of rules) {
    const match = item.re.exec(text);
    if (match) return { rule: item.rule, span: [match.index, match.index + match[0].length] };
  }
  return { rule: null, span: null };
}

function detectPriority(text) {
  const high = /\b(?:priority\s+(?:high|urgent|zaroori)|high\s+priority|high|urgent|zaroori|very\s+important|important|jaldi)\b|ज़रूरी|महत्वपूर्ण|तुरंत/iu.exec(text);
  const low = /\b(?:priority\s+low|low\s+priority|low|not\s+urgent)\b|कम\s*ज़रूरी/iu.exec(text);
  const match = high ?? low;
  return {
    value: high ? 3 : low ? 1 : 2,
    span: match ? [match.index, match.index + match[0].length] : null,
  };
}

function cleanTitle(text, spans) {
  let chars = text.split('');
  for (const span of spans.filter(Boolean)) {
    const [start, end] = span;
    for (let i = start; i < end; i += 1) chars[i] = ' ';
  }
  let title = chars.join('')
    .replace(/\b(?:remind(?:\s+me)?|please|yaad\s+(?:dila(?:na|o)?|dilao|kar(?:na|ana)?|rakhna)|reminder|alarm|task|add|create|schedule|set\s+(?:a\s+)?reminder|remember|yaad\s+rakhna)\b/giu, ' ')
    .replace(/(?:याद\s*(?:दिलाना|करना|रखना)|रिमाइंड(?:र)?|अलार्म|कृपया|कर\s*देना)/gu, ' ')
    .replace(/[;,|]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  title = title.replace(/^(?:ki|ko|for|to|on|at|mein|me|पर|को|के लिए)\s+/iu, '')
    .replace(/\s+(?:ko|ke liye|kar dena|please)$/iu, '').trim();
  return title;
}

/** Deterministic Hindi/Hinglish parser. Ambiguous time never gets silently scheduled. */
export function parseNaturalLanguage(input, options = {}) {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, code: 'empty_input' };
  const timeZone = options.timeZone ?? ZONE;
  const now = options.now ? new Date(options.now) : new Date();
  if (!Number.isFinite(now.getTime())) return { ok: false, code: 'invalid_now' };
  const nowParts = localDateParts(now, timeZone);
  const text = normalizeDigits(input.trim());
  const date = detectDate(text, nowParts);
  const daypart = detectDaypart(text);
  const timeRange = detectTimeRange(text);
  const time = timeRange?.start ?? detectTime(text);
  const endTime = timeRange?.end ?? null;
  const repeat = detectRepeat(text);
  const priorityResult = detectPriority(text);
  const spans = [date?.span, daypart?.span, timeRange?.span ?? time?.span, repeat.span, priorityResult.span];
  const title = cleanTitle(text, spans);
  const sensitivity = classifySensitivity(text);
  const sensitive = sensitivity.sensitive;
  const looksReminder = /\b(?:remind|reminder|alarm)\b|\byaad\s+(?:dila(?:na|o)?|dilao|kar(?:na|ana)?)\b|याद\s*(?:दिला|कर)|रिमाइंडर/iu.test(text) || sensitive;
  const kind = looksReminder ? 'reminder' : 'task';
  const priorityValue = priorityResult.value;
  const repeatRule = repeat.rule;
  const resolved = resolveHour(time, daypart, Boolean(timeRange));
  const resolvedEnd = endTime ? resolveHour(endTime, daypart, true) : null;

  if (!title) return { ok: true, status: 'needs_confirmation', reason: 'title_missing', title: '', kind, sensitive, priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null };

  if (time && resolved?.invalid || endTime && resolvedEnd?.invalid) return { ok: false, code: 'invalid_time', message: INVALID_TIME_MSG, title, kind, sensitive };
  if (time && resolved?.needsConfirmation) return { ok: true, status: 'needs_confirmation', reason: resolved.needsConfirmation, message: resolved.message, title, kind, sensitive, priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null, time_text: `${time.hour}:${String(time.minute).padStart(2, '0')}` };
  if (endTime && resolvedEnd?.needsConfirmation) return { ok: true, status: 'needs_confirmation', reason: resolvedEnd.needsConfirmation, message: resolvedEnd.message, title, kind, sensitive, priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null, time_text: `${endTime.hour}:${String(endTime.minute).padStart(2, '0')}` };
  if (time && (resolved?.ambiguous || endTime && resolvedEnd?.ambiguous)) return { ok: true, status: 'needs_confirmation', reason: 'am_pm_ambiguous', title, kind, sensitive, priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null, time_text: timeRange ? `${time.hour}:${String(time.minute).padStart(2, '0')}-${endTime.hour}:${String(endTime.minute).padStart(2, '0')}` : `${time.hour}:${String(time.minute).padStart(2, '0')}` };
  if (daypart && !time) return { ok: true, status: 'needs_confirmation', reason: 'exact_time_required', title, kind, sensitive, priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null };
  if (!date && !time && !daypart && !repeatRule) return { ok: false, code: 'no_schedule_detected', title, kind, sensitive, priority: priorityValue };

  const offset = date ? date.offset : 0;
  const day = shiftDate(nowParts, offset);
  const hasTime = Boolean(time && resolved && !resolved.ambiguous);
  const hour = hasTime ? resolved.hour : 23;
  const minute = hasTime ? resolved.minute : 59;
  let dueDay = day;
  let dueAt = localToUtc({ ...dueDay, hour, minute, second: 0 }, timeZone);
  if (!date && hasTime && dueAt.getTime() <= now.getTime()) {
    dueDay = shiftDate(nowParts, 1);
    dueAt = localToUtc({ ...dueDay, hour, minute, second: 0 }, timeZone);
  }
  let endsAt = null;
  if (endTime && resolvedEnd && !resolvedEnd.ambiguous) {
    endsAt = localToUtc({ ...dueDay, hour: resolvedEnd.hour, minute: resolvedEnd.minute, second: 0 }, timeZone);
    if (endsAt.getTime() <= dueAt.getTime()) return { ok: false, code: 'invalid_time_range', message: 'End time start time ke baad hona chahiye.', title, kind, sensitive };
  }
  if (date?.token && DAY_WORDS.get(date.token.toLowerCase()) === 'today' && dueAt.getTime() < now.getTime()) {
    return { ok: true, status: 'needs_confirmation', reason: 'time_already_passed_today', title, kind, sensitive, priority: priorityValue, repeat_rule: repeatRule };
  }
  if (kind === 'reminder' && !hasTime) return { ok: true, status: 'needs_confirmation', reason: 'exact_time_required', title, kind, sensitive, priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null };

  return {
    ok: true, status: 'ready', kind, title, sensitive, due_at: dueAt.toISOString(), ...(endsAt ? { ends_at: endsAt.toISOString() } : {}), time_zone: timeZone,
    priority: priorityValue, repeat_rule: repeatRule, date_text: date?.token ?? null,
    parsed_by: 'deterministic-rules',
  };
}

export function getLocalDateParts(date, timeZone = ZONE) {
  return localDateParts(new Date(date), timeZone);
}
