import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMemoryText, findMemorySecrets, isPrivateText,
  redactPrivateText, sanitizeActivityDetail, safeActivityTarget,
} from '../src/privacy.ts';

test('privacy uses the shared S08 classifier and real S09 classifier/secret detector', () => {
  const cases = [
    ['metformin lena', true],
    ['papa ki bimari', true],
    ['password is hunter2', true],
    ['OTP 482913', true],
    ['doodh lana', false],
  ];
  for (const [value, expected] of cases) assert.equal(isPrivateText(value), expected, value);
  assert.ok(classifyMemoryText('papa ki bimari').categories.includes('health'));
  assert.ok(findMemorySecrets('password is hunter2').some((finding) => finding.kind === 'password'));
  assert.ok(findMemorySecrets('OTP 482913').some((finding) => finding.kind === 'otp'));
});

test('redacted display does not return private text', () => {
  assert.equal(redactPrivateText('metformin lena'), 'Private message hidden');
  assert.equal(redactPrivateText('papa ki bimari'), 'Private message hidden');
  assert.equal(redactPrivateText('doodh lana'), 'doodh lana');
});

test('activity metadata keeps safe keys and replaces private free text', () => {
  const detail = sanitizeActivityDetail({
    why: 'papa ki bimari',
    result: 'blocked',
    body: 'password is hunter2',
    count: 2,
  });
  assert.equal(detail.why, 'Private detail hidden');
  assert.equal(detail.result, 'blocked');
  assert.equal(detail.count, 2);
  assert.equal('body' in detail, false);
  assert.equal(safeActivityTarget('metformin lena'), 'private_item');
  assert.equal(safeActivityTarget('chat_thread'), 'chat_thread');
  assert.equal(safeActivityTarget('hunter2'), 'item');
});
