import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, searchShellItems, SEARCH_INDEX_SIZE } from '../src/search-index.mjs';

test('global search normalizes Unicode and Hinglish input locally', () => {
  assert.equal(normalizeSearchText('  SETTINGS  '), 'settings');
  assert.equal(searchShellItems('settings kholo')[0].id, 'settings');
  assert.equal(searchShellItems('aaj')[0].destination, 'today');
});

test('global search is limited to curated destinations, not arbitrary private records', () => {
  assert.ok(SEARCH_INDEX_SIZE < 30);
  assert.equal(searchShellItems('metformin').length, 0);
  assert.equal(searchShellItems('bank account 1234').length, 0);
  assert.equal(searchShellItems('alerts').length, 0);
  assert.equal(searchShellItems('band karo').length, 0);
});

test('global search respects a bounded result count', () => {
  assert.ok(searchShellItems('a', { limit: 999 }).length <= 12);
  assert.deepEqual(searchShellItems('   '), []);
});
