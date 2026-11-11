import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ROUTES, ROUTE_PATH_RE, ERROR_STATUS, ErrorBodySchema, errorBody, okBody, NAMED } from '../src/index.ts';
import { EVENT_TYPES } from '../../events/src/index.ts';
import { build, outDir } from '../scripts/generate.ts';

const now = new Date().toISOString();
const id = () => randomUUID();
const device = { id: id(), name: 'Amit phone', kind: 'phone', paired_at: now };
const command = { id: id(), device_id: id(), command: { op: 'youtube.pause' }, state: 'queued', kill_epoch: 0, created_at: now, expires_at: now };

test('every route path is /api/<group>/<action> and unique', () => {
  const seen = new Set<string>();
  for (const [name, r] of Object.entries(ROUTES)) {
    assert.match(r.path, ROUTE_PATH_RE, name);
    assert.ok(!seen.has(r.path), `duplicate ${r.path}`); seen.add(r.path);
    assert.equal(r.path, '/api/' + name.split('.')[0] + '/' + name.split('.').slice(1).join('.'), `name/path mismatch for ${name}`);
  }
});
test('every error code used by a route exists; every code has an HTTP status', () => {
  for (const r of Object.values(ROUTES)) for (const e of r.errors) assert.ok(e in ERROR_STATUS, e);
  for (const [c, s] of Object.entries(ERROR_STATUS)) assert.ok(s >= 400 && s < 600, c);
});
test('error format: errorBody produces a valid body with the right status', () => {
  const e = errorBody('kill_switch_on', 'Kill switch chalu hai', { request_id: 'r1' });
  assert.equal(e.status, 423);
  assert.ok(ErrorBodySchema.safeParse(e.body).success);
  assert.ok(!ErrorBodySchema.safeParse({ ok: false, error: { code: 'whatever', message: 'x' } }).success);
  assert.ok(!ErrorBodySchema.safeParse({ ok: false, error: { code: 'internal', message: 'x', stack: 'secret' } }).success);
});
test('success wrapper is { ok: true, data }', () => {
  assert.ok(okBody(ROUTES['system.health'].output).safeParse({ ok: true, data: { status: 'ok', ts: now } }).success);
});
test('good requests parse, bad requests fail (strict)', () => {
  assert.ok(ROUTES['auth.devices.pair'].input.safeParse({ name: 'tv', kind: 'tv' }).success);
  assert.ok(!ROUTES['auth.devices.pair'].input.safeParse({ name: 'tv', kind: 'toaster' }).success);
  assert.ok(!ROUTES['auth.devices.pair'].input.safeParse({ name: 'tv', kind: 'tv', admin: true }).success);
  assert.ok(ROUTES['phone.commands.create'].input.safeParse({ device_id: id(), command: { op: 'app.open', args: { app: 'youtube' } } }).success);
  assert.ok(!ROUTES['phone.commands.create'].input.safeParse({ device_id: 'x', command: { op: 'app.open' } }).success);
  assert.ok(!ROUTES['phone.commands.ack'].input.safeParse({ command_id: id(), state: 'queued' }).success);
  assert.ok(!ROUTES['system.events.list'].input.safeParse({ limit: 5000 }).success);
});
test('responses parse: device, command, nullable claim, kill state', () => {
  assert.ok(ROUTES['auth.devices.list'].output.safeParse({ devices: [device] }).success);
  assert.ok(ROUTES['phone.commands.claim'].output.safeParse({ command: null }).success);
  assert.ok(ROUTES['phone.commands.claim'].output.safeParse({ command }).success);
  assert.ok(ROUTES['system.kill.get'].output.safeParse({ kill: false, epoch: 0 }).success);
  assert.ok(!ROUTES['phone.commands.create'].output.safeParse({ command: { ...command, state: 'sleeping' } }).success);
});
test('device list never has a token field; only pair returns one', () => {
  assert.ok(!ROUTES['auth.devices.list'].output.safeParse({ devices: [{ ...device, token: 'secret' }] }).success);
  assert.ok(ROUTES['auth.devices.pair'].output.safeParse({ device, token: 'x'.repeat(40) }).success);
});
test('events.emit uses the same envelope as packages/events', () => {
  const ev = { id: id(), type: 'activity.logged', source: 't', ts: now, payload: { summary: 'x' }, version: 1, idempotency_key: 'event-key-1' };
  assert.ok(ROUTES['system.events.emit'].input.safeParse(ev).success);
  assert.ok('activity.logged' in EVENT_TYPES);
});
test('states and kinds match the database', () => {
  const sql = fs.readFileSync(new URL('../../db/migrations/0001_core.sql', import.meta.url), 'utf8');
  for (const s of NAMED.PhoneCommandState.options) assert.ok(sql.includes(`'${s}'`), `state ${s} missing in SQL`);
  for (const k of NAMED.DeviceKind.options) assert.ok(sql.includes(`'${k}'`), `kind ${k} missing in SQL`);
});
test('safety flags: commands and pairing stop at kill switch; kill, ack and cancel never do', () => {
  assert.equal(ROUTES['phone.commands.create'].killSensitive, true);
  assert.equal(ROUTES['phone.commands.claim'].killSensitive, true);
  assert.equal(ROUTES['auth.devices.pair'].killSensitive, true);
  for (const n of ['system.kill.set', 'system.kill.get', 'phone.commands.ack', 'phone.commands.cancel', 'system.health'] as const) assert.equal(ROUTES[n].killSensitive, false, n);
});
test('generated artifacts cover every declared route and preserve critical request fields', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('routes.json', outDir), 'utf8'));
  const paths = new Set(saved.routes.map((r: any) => r.path));
  for (const r of Object.values(ROUTES)) assert.ok(paths.has(r.path), `generated route missing: ${r.path}`);
  const emit = saved.definitions.SystemEventsEmitRequest;
  assert.ok(emit.required.includes('idempotency_key'), 'generated event intake must require an idempotency key');
  assert.ok(saved.definitions.VoiceTranscribeRequest.properties.audio_ref, 'voice contract must carry an audio reference');
  assert.ok(!saved.definitions.VoiceTranscribeRequest.properties.audio_bytes, 'voice contract must not carry raw audio bytes');
  const kotlinFile = fs.readFileSync(new URL('kotlin/JarvisContracts.kt', outDir), 'utf8');
  for (const r of Object.values(ROUTES)) assert.ok(kotlinFile.includes(`"${r.path}"`), `generated Kotlin route missing: ${r.path}`);
  assert.match(kotlinFile, /val idempotencyKey: String/);
});
test('generated Kotlin has every route and no broken types', () => {
  const kt = build().kotlin;
  for (const r of Object.values(ROUTES)) assert.ok(kt.includes(`"${r.path}"`), r.path);
  assert.ok(!/: (id|paired_at)\b/.test(kt), 'unresolved $ref leaked into Kotlin');
  assert.ok(!kt.includes('undefined'));
});


test('auth session routes are token-bridge scaffolding, not password endpoints', () => {
  assert.equal(ROUTES['auth.session.create'].path, '/api/auth/session.create');
  assert.equal(ROUTES['auth.session.get'].path, '/api/auth/session.get');
  assert.equal(ROUTES['auth.session.delete'].path, '/api/auth/session.delete');
  assert.ok(ROUTES['auth.session.create'].input.safeParse({ access_token: 'x'.repeat(30), refresh_token: 'y'.repeat(30) }).success);
  assert.ok(!ROUTES['auth.session.create'].input.safeParse({ email: 'a@b.com', password: 'secret' }).success);
});
test('events.emit requires an owner-scoped idempotency key', () => {
  const base = { id: id(), type: 'activity.logged', source: 'app', ts: now, payload: { summary: 'x' }, version: 1 };
  assert.ok(ROUTES['system.events.emit'].input.safeParse({ ...base, idempotency_key: 'unique-key' }).success);
  assert.ok(!ROUTES['system.events.emit'].input.safeParse(base).success);
});
test('S21 approved voice API contracts exist with metadata references, not binary audio fields', () => {
  const sid = id();
  assert.equal(ROUTES['voice.transcribe'].path, '/api/voice/transcribe');
  assert.equal(ROUTES['voice.speak'].path, '/api/voice/speak');
  assert.ok(ROUTES['voice.transcribe'].input.safeParse({ session_id: sid, audio_ref: 'storage://audio/1', mime_type: 'audio/webm' }).success);
  assert.ok(!ROUTES['voice.transcribe'].input.safeParse({ session_id: sid, audio_bytes: 'base64' }).success);
  assert.ok(ROUTES['voice.speak'].input.safeParse({ session_id: sid, text: 'Namaste' }).success);
  assert.equal(ROUTES['voice.transcribe'].killSensitive, true);
  assert.equal(ROUTES['voice.speak'].killSensitive, true);
});
