import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedRepeatRule, nextOccurrence } from '../src/time-recurrence.mjs';

test('daily recurrence preserves 07:00 IST across the next local day', () => {
  const next = nextOccurrence('2026-11-22T01:30:00.000Z', 'FREQ=DAILY');
  assert.equal(next.toISOString(), '2026-11-23T01:30:00.000Z');
});

test('weekday recurrence skips Saturday and Sunday', () => {
  const next = nextOccurrence('2026-11-20T03:30:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  assert.equal(next.toISOString(), '2026-11-23T03:30:00.000Z');
});

test('monthly recurrence clamps to the final day in shorter months', () => {
  const next = nextOccurrence('2026-01-31T03:30:00.000Z', 'FREQ=MONTHLY');
  assert.equal(next.toISOString(), '2026-02-28T03:30:00.000Z');
});

test('unsupported recurrence is rejected', () => {
  assert.equal(isSupportedRepeatRule('FREQ=YEARLY'), false);
  assert.throws(() => nextOccurrence('2026-01-01T00:00:00Z', 'FREQ=YEARLY'), /unsupported/);
});

test('late recurring jobs skip missed periods and return the next future occurrence', async () => {
  const { nextOccurrenceAfter } = await import('../src/time-recurrence.mjs');
  const next = nextOccurrenceAfter('2026-11-22T01:30:00.000Z', 'FREQ=DAILY', 'Asia/Kolkata', '2026-11-24T03:00:00.000Z');
  assert.equal(next.toISOString(), '2026-11-25T01:30:00.000Z');
});
