import test from 'node:test';
import assert from 'node:assert/strict';
import { focusProgress } from '../src/progress.mjs';

test('focus percentage is derived from completed-today and configured daily goal', () => {
  assert.equal(focusProgress({ completed_today: 2, daily_goal: 4 }), 50);
});

test('missing S08 goal metrics stay unknown instead of inventing a percentage', () => {
  assert.equal(focusProgress({ open_count: 3, overdue_count: 1 }), null);
  assert.equal(focusProgress({ completed_today: 2, daily_goal: null }), null);
  assert.equal(focusProgress({ completed_today: 2, daily_goal: 0 }), null);
});

test('focus percentage is bounded to the configured goal ring', () => {
  assert.equal(focusProgress({ completed_today: 5, daily_goal: 4 }), 100);
  assert.equal(focusProgress({ completed_today: 0, daily_goal: 4 }), 0);
});
