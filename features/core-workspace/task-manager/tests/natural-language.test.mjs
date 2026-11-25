import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalLanguage } from '../src/natural-language.mjs';

const now = new Date('2026-11-21T12:00:00.000Z'); // 17:30 in Asia/Kolkata

test('Hindi/Hinglish medicine example parses tomorrow 07:00 IST without exposing title through a safe API contract', () => {
  const result = parseNaturalLanguage('kal subah 7 baje dawai yaad dilana', { now });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.kind, 'reminder');
  assert.equal(result.title, 'dawai');
  assert.equal(result.sensitive, true);
  assert.equal(result.due_at, '2026-11-22T01:30:00.000Z');
});

test('Devanagari relative date, evening time and medicine title parse deterministically', () => {
  const result = parseNaturalLanguage('परसों शाम 6 बजे दवा याद दिलाना', { now });
  assert.equal(result.status, 'ready');
  assert.equal(result.title, 'दवा');
  assert.equal(result.due_at, '2026-11-23T12:30:00.000Z');
  assert.equal(result.sensitive, true);
});

test('ambiguous 7 baje asks for AM/PM instead of guessing', () => {
  const result = parseNaturalLanguage('kal 7 baje meeting', { now });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.reason, 'am_pm_ambiguous');
  assert.equal(result.title, 'meeting');
});

test('daily repeat and priority are extracted from Roman Hindi', () => {
  const result = parseNaturalLanguage('roz subah 8 baje walk high priority', { now });
  assert.equal(result.status, 'ready');
  assert.equal(result.title, 'walk');
  assert.equal(result.repeat_rule, 'FREQ=DAILY');
  assert.equal(result.priority, 3);
  assert.equal(result.due_at, '2026-11-22T02:30:00.000Z');
});

test('date-only task gets end-of-day deadline in IST', () => {
  const result = parseNaturalLanguage('kal assignment submit karna', { now });
  assert.equal(result.status, 'ready');
  assert.equal(result.due_at, '2026-11-22T18:29:00.000Z');
});

test('unrelated number in task title is not mistaken for a time', () => {
  const result = parseNaturalLanguage('buy 2 apples', { now });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'no_schedule_detected');
});


test('medicine-related insulin phrase is classified as sensitive too', () => {
  const parsed = parseNaturalLanguage('kal subah 7 baje insulin reminder', { now: new Date('2026-11-21T12:00:00.000Z') });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sensitive, true);
});

test('har roz subah 6 baje walk extracts DAILY repeat and only walk as title', () => {
  const result = parseNaturalLanguage('har roz subah 6 baje walk', { now });
  assert.equal(result.status, 'ready');
  assert.equal(result.title, 'walk');
  assert.equal(result.repeat_rule, 'FREQ=DAILY');
  assert.equal(result.due_at, '2026-11-22T00:30:00.000Z');
});

test('priority values are extracted and removed from the task title', () => {
  const samples = [
    ['priority high', 3],
    ['priority low', 1],
    ['priority urgent', 3],
    ['priority zaroori', 3],
    ['high', 3],
    ['low', 1],
    ['urgent', 3],
    ['zaroori', 3],
  ];
  for (const [marker, priority] of samples) {
    const result = parseNaturalLanguage(`kal subah 7 baje walk ${marker}`, { now });
    assert.equal(result.status, 'ready', marker);
    assert.equal(result.title, 'walk', marker);
    assert.equal(result.priority, priority, marker);
  }
});

test('schedule without a subject asks what to remember', () => {
  const result = parseNaturalLanguage('kal subah 7 baje yaad dilana', { now });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.reason, 'title_missing');
  assert.equal(result.title, '');
  assert.equal(result.kind, 'reminder');
});

test('exact LEAD privacy probes are classified sensitive by the parser', () => {
  for (const phrase of ['kal 8 baje metformin lena', 'kal 8 baje goli khani hai']) {
    const result = parseNaturalLanguage(phrase, { now });
    assert.equal(result.sensitive, true, phrase);
  }
});

// P31 Time-Parse Rules Tests
const now1858 = new Date('2026-11-22T18:58:00+05:30');
const INVALID_MSG = "Time samajh nahi aaya. 'aaj 10 pm' ya '22:00' likho.";

test('P31: kal raat 9 baje => tomorrow 21:00 IST (not 09:00 AM)', () => {
  const r = parseNaturalLanguage('kal raat 9 baje call karna', { now: now1858 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ready');
  assert.equal(r.due_at, new Date('2026-11-23T21:00:00+05:30').toISOString());
});

test('P31: aaj raat 10 baje at 18:58 IST => today 22:00 IST ready (not time_already_passed_today)', () => {
  const r = parseNaturalLanguage('aaj raat 10 baje doodh lana', { now: now1858 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ready');
  assert.equal(r.title, 'doodh lana');
  assert.equal(r.due_at, new Date('2026-11-22T22:00:00+05:30').toISOString());
});

test('P31: aaj shaam 8 baje => today 20:00 IST', () => {
  const r = parseNaturalLanguage('aaj shaam 8 baje walk', { now: now1858 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ready');
  assert.equal(r.due_at, new Date('2026-11-22T20:00:00+05:30').toISOString());
});

test('P31: dopahar 12 baje => 12:00 IST & dopahar 5 baje => 17:00 IST', () => {
  const r12 = parseNaturalLanguage('kal dopahar 12 baje lunch', { now: now1858 });
  assert.equal(r12.ok, true);
  assert.equal(r12.status, 'ready');
  assert.equal(r12.due_at, new Date('2026-11-23T12:00:00+05:30').toISOString());

  const r5 = parseNaturalLanguage('kal dopahar 5 baje chai', { now: now1858 });
  assert.equal(r5.ok, true);
  assert.equal(r5.status, 'ready');
  assert.equal(r5.due_at, new Date('2026-11-23T17:00:00+05:30').toISOString());
});

test('P31: raat 12 baje => needs_confirmation midnight_date', () => {
  const r = parseNaturalLanguage('aaj raat 12 baje backup chalana', { now: now1858 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.reason, 'midnight_date');
  assert.equal(r.message, 'raat 12 baje aaj ya kal ki?');
});

test('P31: raat 2 baje => needs_confirmation night_after_midnight', () => {
  const r = parseNaturalLanguage('raat 2 baje server check', { now: now1858 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.reason, 'night_after_midnight');
});

test('P31: invalid daypart-hour combos return ok:false with clear Hinglish message', () => {
  for (const phrase of [
    'aaj shaam 11 baje meeting',
    'aaj shaam 2 baje meeting',
    'kal subah 12 baje walk',
    'aaj raat 6 baje dinner',
  ]) {
    const r = parseNaturalLanguage(phrase, { now: now1858 });
    assert.equal(r.ok, false, phrase);
    assert.equal(r.code, 'invalid_time', phrase);
    assert.equal(r.message, INVALID_MSG, phrase);
  }
});

test('P31: subah 9 baje => 09:00 IST', () => {
  const r = parseNaturalLanguage('kal subah 9 baje standup', { now: now1858 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ready');
  assert.equal(r.due_at, new Date('2026-11-23T09:00:00+05:30').toISOString());
});

test('P31: explicit aaj 10 pm and aaj 22:00 work as before', () => {
  const rPm = parseNaturalLanguage('aaj 10 pm review', { now: now1858 });
  assert.equal(rPm.ok, true);
  assert.equal(rPm.status, 'ready');
  assert.equal(rPm.due_at, new Date('2026-11-22T22:00:00+05:30').toISOString());

  const r24 = parseNaturalLanguage('aaj 22:00 review', { now: now1858 });
  assert.equal(r24.ok, true);
  assert.equal(r24.status, 'ready');
  assert.equal(r24.due_at, new Date('2026-11-22T22:00:00+05:30').toISOString());
});

test('P31: Devanagari "आज रात 10 बजे दूध लाना" and trailing daypart "aaj 10 baje raat doodh lana"', () => {
  const rDeva = parseNaturalLanguage('आज रात 10 बजे दूध लाना', { now: now1858 });
  assert.equal(rDeva.ok, true);
  assert.equal(rDeva.status, 'ready');
  assert.equal(rDeva.title, 'दूध लाना');
  assert.equal(rDeva.due_at, new Date('2026-11-22T22:00:00+05:30').toISOString());

  const rTrailing = parseNaturalLanguage('aaj 10 baje raat doodh lana', { now: now1858 });
  assert.equal(rTrailing.ok, true);
  assert.equal(rTrailing.status, 'ready');
  assert.equal(rTrailing.title, 'doodh lana');
  assert.equal(rTrailing.due_at, new Date('2026-11-22T22:00:00+05:30').toISOString());
});

test('time ranges: "kal 3 se 4 baje" asks existing AM/PM confirmation', () => {
  const result = parseNaturalLanguage('kal 3 se 4 baje meeting', { now });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.reason, 'am_pm_ambiguous');
  assert.equal(result.title, 'meeting');
});

test('time ranges: "kal shaam 3 se 4 baje meeting" creates a 15:00-16:00 interval', () => {
  const result = parseNaturalLanguage('kal shaam 3 se 4 baje meeting', { now });
  assert.equal(result.status, 'ready');
  assert.equal(result.title, 'meeting');
  assert.equal(result.due_at, '2026-11-22T09:30:00.000Z');
  assert.equal(result.ends_at, '2026-11-22T10:30:00.000Z');
});

test('time ranges: explicit PM suffix is inherited across both endpoints', () => {
  const result = parseNaturalLanguage('kal 3 se 4 pm meeting', { now });
  assert.equal(result.status, 'ready');
  assert.equal(result.title, 'meeting');
  assert.equal(result.due_at, '2026-11-22T09:30:00.000Z');
  assert.equal(result.ends_at, '2026-11-22T10:30:00.000Z');
});

test('time ranges: end must be later than start', () => {
  const result = parseNaturalLanguage('kal shaam 4 se 3 baje meeting', { now });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_time_range');
});

test('yaad dilao and yaad karana are reminder intent and are removed from title', () => {
  for (const phrase of ['kal shaam 6 baje meeting yaad dilao', 'kal subah 7 baje meeting yaad karana']) {
    const result = parseNaturalLanguage(phrase, { now });
    assert.equal(result.status, 'ready', phrase);
    assert.equal(result.kind, 'reminder', phrase);
    assert.equal(result.title, 'meeting', phrase);
  }
});


test('bare remind phrase is routed to a reminder and removed from its title', () => {
  const result = parseNaturalLanguage('kal subah 8 baje remind dentist appointment', { now: '2026-11-23T05:00:00.000Z', timeZone: 'Asia/Kolkata' });
  assert.equal(result.status, 'ready');
  assert.equal(result.kind, 'reminder');
  assert.equal(result.title, 'dentist appointment');
});

test('time ranges: "kal shaam 3 se 4 meeting" works without repeating baje', () => {
  const result = parseNaturalLanguage('kal shaam 3 se 4 meeting', { now: '2026-11-23T05:00:00.000Z', timeZone: 'Asia/Kolkata' });
  assert.equal(result.status, 'ready');
  assert.equal(result.title, 'meeting');
  assert.equal(new Date(result.due_at).toISOString(), '2026-11-24T09:30:00.000Z');
  assert.equal(new Date(result.ends_at).toISOString(), '2026-11-24T10:30:00.000Z');
});
