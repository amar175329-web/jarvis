import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeMedicineReminderRequest } from '../src/memory-handoff.mjs';

const base = {
  memory_id: '123e4567-e89b-42d3-a456-426614174000', private: true,
  label: 'Dawai X', time_text: '7 baje subah', display_text: 'Dawai X · 7:00 AM',
  needs_time_confirmation: false, lock_screen_visible: true,
};

test('S09 T2 hand-off with unknown date asks for date; does not create reminder', () => {
  const result = consumeMedicineReminderRequest(base);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.reason, 'date_missing_from_s09_contract');
  assert.equal(result.handoff.private, true);
});

test('S09 hand-off AM/PM ambiguity is preserved as a confirmation gate', () => {
  const result = consumeMedicineReminderRequest({ ...base, needs_time_confirmation: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.reason, 'am_pm_ambiguous');
});

test('T2 request never reports ready while private vault is not integrated', () => {
  const result = consumeMedicineReminderRequest({ ...base, date_text: 'kal' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'private_reminder_vault_not_available');
});

test('invalid/private=false hand-off is rejected', () => {
  assert.deepEqual(consumeMedicineReminderRequest({ ...base, private: false }), { ok: false, code: 'invalid_medicine_reminder_request' });
});

test('unexpected T2 hand-off fields are rejected rather than copied forward', () => {
  assert.deepEqual(consumeMedicineReminderRequest({ ...base, extra: 'secret' }), { ok: false, code: 'unexpected_fields' });
});
