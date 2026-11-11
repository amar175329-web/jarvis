import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateEvent, EVENT_TYPES, EVENT_TYPE_RE } from '../src/index.ts';

const mk = (type: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id: randomUUID(), type, source: 'test', ts: new Date().toISOString(), payload, version: 1, ...extra });

test('every registered type name is dot.case', () => {
  for (const t of Object.keys(EVENT_TYPES)) assert.match(t, EVENT_TYPE_RE, t);
});
test('live types name their own table; stored types have none', () => {
  for (const [t, d] of Object.entries(EVENT_TYPES)) {
    if (d.live) assert.ok(['phone_commands', 'system_state', 'tasks', 'reminders'].includes(d.liveVia), t);
    else assert.equal('liveVia' in d, false, t);
  }
});
test('events table is never a live route', () => {
  for (const d of Object.values(EVENT_TYPES)) if (d.live) assert.notEqual(d.liveVia as string, 'events');
});
test('valid live event: task.created via tasks', () => {
  const r = validateEvent(mk('task.created', { task_id: randomUUID(), title: 'doodh lana' }));
  assert.ok(r.ok && r.live && r.liveVia === 'tasks');
});
test('valid live event: phone command via phone_commands, with idempotency + correlation', () => {
  const r = validateEvent(mk('phone.command.done', { command_id: randomUUID(), device_id: randomUUID() }, { idempotency_key: 'abc', correlation_id: randomUUID() }));
  assert.ok(r.ok && r.live && r.liveVia === 'phone_commands' && r.event.idempotency_key === 'abc');
});
test('kill switch event is live via system_state', () => {
  const r = validateEvent(mk('system.kill.changed', { kill: true, epoch: 3 }));
  assert.ok(r.ok && r.live && r.liveVia === 'system_state');
});
test('valid stored event: activity.logged is not live', () => {
  const r = validateEvent(mk('activity.logged', { summary: 'app khula' }));
  assert.ok(r.ok && !r.live && r.liveVia === undefined);
});
test('unknown type is rejected', () => {
  const r = validateEvent(mk('made.up.thing', {}));
  assert.ok(!r.ok && r.error.code === 'unknown_type');
});
test('inherited names like constructor / toString are not types', () => {
  assert.ok(!validateEvent(mk('constructor.x', {})).ok);
  assert.equal((validateEvent(mk('toString', {})) as any).error.code, 'bad_envelope');
});
test('bad type format is a bad envelope', () => {
  const r = validateEvent(mk('BadType', {}));
  assert.ok(!r.ok && r.error.code === 'bad_envelope');
});
test('wrong payload is rejected', () => {
  const r = validateEvent(mk('task.created', { task_id: 'not-a-uuid' }));
  assert.ok(!r.ok && r.error.code === 'bad_payload');
});
test('extra payload fields are rejected (strict)', () => {
  const r = validateEvent(mk('activity.logged', { summary: 'x', sneaky: 1 }));
  assert.ok(!r.ok && r.error.code === 'bad_payload');
});
test('payload of 16 KB or more is rejected', () => {
  const r = validateEvent(mk('activity.logged', { summary: 'x', pad: 'a'.repeat(17000) }));
  assert.ok(!r.ok && r.error.code === 'payload_too_large');
});
test('envelope: bad version, bad id, missing source, extra field', () => {
  assert.ok(!validateEvent(mk('activity.logged', { summary: 'x' }, { version: 2 })).ok);
  assert.ok(!validateEvent(mk('activity.logged', { summary: 'x' }, { id: 'nope' })).ok);
  assert.ok(!validateEvent(mk('activity.logged', { summary: 'x' }, { source: '' })).ok);
  assert.ok(!validateEvent(mk('activity.logged', { summary: 'x' }, { extra: 1 })).ok);
});
test('non-object input never throws', () => {
  for (const v of [null, undefined, 5, 'x', []]) assert.ok(!validateEvent(v).ok);
});

test('S21 voice event contracts exist, remain stored-only, and carry metadata only', () => {
  const expected = ['voice.session.started','voice.session.ended','voice.speech.started','voice.speech.interrupted','voice.stop.requested','persona.mode.changed'];
  for (const name of expected) {
    assert.ok(Object.hasOwn(EVENT_TYPES, name), `${name} is registered`);
    assert.equal(EVENT_TYPES[name as keyof typeof EVENT_TYPES].live, false, `${name} is stored-only`);
  }
  const sid = randomUUID();
  assert.ok(validateEvent(mk('voice.session.started', { session_id: sid, source: 'phone' })).ok);
  assert.ok(validateEvent(mk('voice.speech.started', { session_id: sid, speech_id: randomUUID(), direction: 'input', language: 'hi-IN' })).ok);
  assert.ok(!validateEvent(mk('voice.session.started', { session_id: sid, source: 'phone', audio: 'base64-audio' })).ok);
  assert.ok(!validateEvent(mk('voice.speech.interrupted', { session_id: sid, speech_id: randomUUID(), transcript: 'private words' })).ok);
});
test('voice event payloads obey the same strict 16 KB bound', () => {
  const r = validateEvent(mk('voice.session.ended', { session_id: randomUUID(), reason: 'error', large: 'x'.repeat(17000) }));
  assert.ok(!r.ok && (r.error.code === 'bad_payload' || r.error.code === 'payload_too_large'));
});
