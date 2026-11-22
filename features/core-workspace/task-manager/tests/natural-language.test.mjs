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
