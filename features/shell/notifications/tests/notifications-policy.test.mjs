import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationLabel, projectNotification, readThroughFromSetting, latestEventTime } from '../src/notifications-policy.mjs';

const safe = { id: 'n-1', type: 'device.paired', ts: '2026-11-23T04:00:00.000Z', payload: { secret: 'must not escape' }, source: 'private-source' };
test('notifications map only fixed type labels and metadata', () => {
  assert.deepEqual(projectNotification(safe, null), { id: 'n-1', title: 'Device connected', createdAt: '2026-11-23T04:00:00.000Z', unread: true });
  assert.equal(notificationLabel('activity.logged'), null);
  assert.equal(projectNotification({ ...safe, type: 'activity.logged' }), null);
});
test('read cursor changes unread status without returning payload', () => {
  assert.equal(readThroughFromSetting({ through: '2026-11-23T04:00:00Z' }), '2026-11-23T04:00:00.000Z');
  assert.equal(projectNotification(safe, '2026-11-23T05:00:00Z').unread, false);
  assert.equal(projectNotification(safe, 'invalid').unread, true);
});
test('latest event time ignores invalid timestamps', () => {
  assert.equal(latestEventTime([{ ts: 'bad' }, { ts: '2026-11-23T04:00:00Z' }, { ts: '2026-11-23T03:00:00Z' }]), '2026-11-23T04:00:00.000Z');
  assert.equal(latestEventTime([]), null);
});
