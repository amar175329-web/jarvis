import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  nextAuthStateFromSession,
  mapOwnerEnterError,
  shouldRelockOnStatus,
} from '../src/ownerLockPolicy.ts';

test('session.get 200+ok unlocks app; 401/500/non-ok keeps app locked', () => {
  assert.equal(nextAuthStateFromSession(200, true), 'unlocked');
  assert.equal(nextAuthStateFromSession(200, false), 'locked');
  assert.equal(nextAuthStateFromSession(401, false), 'locked');
  assert.equal(nextAuthStateFromSession(503, false), 'locked');
});

test('429 and 503 return distinct, clear Hinglish messages', () => {
  const m401 = mapOwnerEnterError(401);
  const m429 = mapOwnerEnterError(429);
  const m503 = mapOwnerEnterError(503);
  assert.match(m401, /galat/i);
  assert.match(m429, /kuch der baad/i);
  assert.match(m503, /service abhi band/i);
  assert.notEqual(m401, m429);
  assert.notEqual(m429, m503);
});

test('401 and 403 trigger full-app relock; 200/500 do not', () => {
  assert.equal(shouldRelockOnStatus(401), true);
  assert.equal(shouldRelockOnStatus(403), true);
  assert.equal(shouldRelockOnStatus(200), false);
  assert.equal(shouldRelockOnStatus(500), false);
});

test('OwnerLock never writes key to localStorage, sessionStorage, or URL', () => {
  const src = fs.readFileSync(new URL('../src/components/OwnerLock.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /localStorage|sessionStorage|history\.pushState|location\.search|location\.hash/);
  assert.match(src, /placeholder="Owner key daalo"/);
});
