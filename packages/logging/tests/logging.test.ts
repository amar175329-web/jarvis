import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, memorySink, consoleSink, redact, redactString, REDACTED, toActivityRow, newRequestId, runHealth, toHealthResponse, dbSizeCheck } from '../src/index.ts';
import { fixedClock } from '../../shared/src/index.ts';

// Fake secrets are assembled at run time so the repo's secret scanner does not see a literal key in the file.
const p = (...x: string[]) => x.join('');
const JWT = p('ey', 'JhbGciOiJIUzI1NiJ9.', 'ey', 'Jyb2xlIjoic2VydmljZV9yb2xlIn0.', 'abcdefghijklmnop12345');
const H = p('ey', 'Jh'); // start of the fake JWT
const clock = fixedClock('2026-11-07T11:40:00Z');

test('secret field NAMES are hidden', () => {
  const r = redact({ user: 'amit', password: 'hunter2', SUPABASE_SERVICE_ROLE_KEY: 'x', nested: { api_key: 'abc', Authorization: 'Bearer zzz', token: 't', ok: 1 } }) as any;
  assert.equal(r.user, 'amit'); assert.equal(r.password, REDACTED); assert.equal(r.SUPABASE_SERVICE_ROLE_KEY, REDACTED);
  assert.equal(r.nested.api_key, REDACTED); assert.equal(r.nested.Authorization, REDACTED); assert.equal(r.nested.token, REDACTED); assert.equal(r.nested.ok, 1);
});
test('secret-looking VALUES are hidden even in innocent fields', () => {
  assert.ok(!redactString(`call failed with ${JWT}`).includes(H));
  assert.ok(!redactString(p('key s', 'k-abcdefghijklmnopqrstuvwx used')).includes(p('s','k-abcdef')));
  assert.ok(!redactString(p('AI', 'zaSyA1234567890abcdefghijklmnop')).includes(p('AI','zaSy')));
  assert.ok(!redactString(p('gh', 'p_abcdefghijklmnopqrstuvwxyz0123')).includes(p('gh','p_abc')));
  assert.ok(!redactString(p('sb_', 'secret_abcdefghijklmnop')).includes('abcdefgh'));
  assert.ok(!redactString('Authorization: Bearer abcdefghijklmnopqrstuv').includes('abcdefghijkl'));
  const db = redactString('connect postgresql://postgres:SuperSecret99@db.x.supabase.co:5432/postgres');
  assert.ok(!db.includes('SuperSecret99') && db.includes('@db.x.supabase.co'));
  assert.equal(redactString('plain message about tasks'), 'plain message about tasks');
});
test('errors are flattened, cycles cut, big things truncated', () => {
  const e = new Error(`boom ${JWT}`); const r = redact({ e }) as any;
  assert.equal(r.e.name, 'Error'); assert.ok(!r.e.message.includes(H));
  const a: any = { n: 1 }; a.self = a; assert.equal((redact(a) as any).self, '[Circular]');
  assert.ok((redact('x'.repeat(5000)) as string).length < 2100);
  assert.equal((redact(Array.from({ length: 80 }, (_, i) => i)) as unknown[]).length, 51);
  assert.equal(redact(10n), '10');
});
test('logger writes one JSON entry with time, level, service, bindings', () => {
  const s = memorySink(); const log = createLogger({ service: 'worker', sinks: [s], clock }).child({ request_id: 'req_1' });
  log.info('job done', { job: 'system.keepalive', service_role: JWT });
  const e = s.entries[0];
  assert.deepEqual([e.ts, e.level, e.service, e.msg, e.request_id, e.job, e.service_role], ['2026-11-07T11:40:00.000Z', 'info', 'worker', 'job done', 'req_1', 'system.keepalive', REDACTED]);
});
test('level filter works; a broken sink never breaks the program', () => {
  const s = memorySink(); const log = createLogger({ service: 'x', level: 'warn', sinks: [{ write() { throw new Error('sink down'); } }, s], clock });
  log.info('quiet'); log.debug('quiet'); log.warn('loud'); log.error('louder');
  assert.deepEqual(s.entries.map((e) => e.msg), ['loud', 'louder']);
});
test('console sink: errors to stderr, info to stdout, one JSON line each', () => {
  const out: string[] = [], err: string[] = [];
  const log = createLogger({ service: 'api', sinks: [consoleSink((s) => out.push(s), (s) => err.push(s))], clock });
  log.info('a'); log.error('b');
  assert.equal(out.length, 1); assert.equal(err.length, 1); assert.equal(JSON.parse(err[0]).msg, 'b');
});
test('activity_log rows only for warn and error', () => {
  const s = memorySink(); const log = createLogger({ service: 'worker', sinks: [s], clock });
  log.info('x'); log.error('bad', { request_id: 'req_9', code: 7 });
  assert.equal(toActivityRow(s.entries[0]), null);
  const row = toActivityRow(s.entries[1])!;
  assert.deepEqual([row.actor, row.action, row.target, row.ok, (row.detail as any).code], ['worker', 'log.error', 'req_9', false, 7]);
});
test('request ids look right and differ', () => { const a = newRequestId(), b = newRequestId(); assert.match(a, /^req_[0-9a-f]{16}$/); assert.notEqual(a, b); });

test('health: all ok -> ok', async () => {
  const r = await runHealth([{ name: 'db', critical: true, run: async () => ({ ok: true }) }], clock);
  assert.equal(r.status, 'ok'); assert.equal(r.ts, '2026-11-07T11:40:00.000Z');
});
test('health: critical failing -> down; non-critical failing -> degraded; throwing and slow checks handled', async () => {
  const bad = { name: 'db', critical: true, run: async () => { throw new Error(`cannot connect ${JWT}`); } };
  const r1 = await runHealth([bad], clock); assert.equal(r1.status, 'down'); assert.ok(!JSON.stringify(r1).includes(H));
  const r2 = await runHealth([{ name: 'size', critical: false, run: async () => ({ ok: false, detail: 'big' }) }], clock); assert.equal(r2.status, 'degraded');
  const r3 = await runHealth([{ name: 'slow', critical: true, timeoutMs: 30, run: () => new Promise(() => {}) }], clock); assert.equal(r3.status, 'down'); assert.equal(r3.components[0].detail, 'timeout');
});
test('health response follows the contract: ok -> 200 {status:ok}; down -> 503 unavailable; no details leak', async () => {
  const ok = toHealthResponse(await runHealth([{ name: 'db', critical: true, run: async () => ({ ok: true }) }], clock)) as any;
  assert.equal(ok.status, 200); assert.deepEqual(Object.keys(ok.body.data).sort(), ['status', 'ts']);
  const down = toHealthResponse(await runHealth([{ name: 'db', critical: true, run: async () => ({ ok: false, detail: 'secret detail' }) }], clock)) as any;
  assert.equal(down.status, 503); assert.equal(down.body.error.code, 'unavailable'); assert.ok(!JSON.stringify(down).includes('secret detail'));
});
test('db size guard: warns at 400 MB (decision 009)', async () => {
  assert.equal((await runHealth([dbSizeCheck(async () => 120)], clock)).status, 'ok');
  const r = await runHealth([dbSizeCheck(async () => 410)], clock); assert.equal(r.status, 'degraded');
  assert.match((await runHealth([dbSizeCheck(async () => 490)], clock)).components[0].detail!, /almost full/);
});
