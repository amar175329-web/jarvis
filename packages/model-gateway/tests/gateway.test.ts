import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, checkBudget, computeCost, envKeys, memoryUsageStore, supabaseUsageStore, type ModelSpec, type Provider, type GatewayRequest } from '../src/index.ts';
import { createLogger, memorySink } from '../../logging/src/index.ts';
import { fixedClock } from '../../shared/src/index.ts';

const NOW = '2026-11-07T11:40:00Z'; // 17:10 IST
const KEY = ['s', 'k-test-abcdefghijklmnopqrstuvwxyz'].join(''); // assembled at run time: no literal key in the repo
const spec: ModelSpec[] = [
  { provider: 'anthropic', model: 'big', price: { in_per_mtok: 3, out_per_mtok: 15 } },
  { provider: 'gemini', model: 'flash', free: true, maxRequestsPerDay: 2 },
  { provider: 'openai', model: 'mystery' }, // no price
];
const req = (o: Partial<GatewayRequest> = {}): GatewayRequest => ({ provider: 'anthropic', model: 'big', task: 't', input: 'SECRET PROMPT TEXT', maxOutputTokens: 1000, estimatedInputTokens: 1000, ...o });

function setup(o: { kill?: boolean | 'throw'; budget?: any; provider?: Partial<Provider>; env?: Record<string, string> } = {}) {
  const sink = memorySink(); const usage = memoryUsageStore(); usage.now = () => new Date(NOW);
  const seen: any[] = [];
  const mk = (name: string): Provider => ({ name, invoke: async (a) => { seen.push(a); return { text: 'hello', tokensIn: 1000, tokensOut: 500 }; }, ...o.provider });
  const gw = createGateway({
    kill: { read: async () => { if (o.kill === 'throw') throw new Error('db down'); return { kill: !!o.kill, epoch: 0 }; } },
    usage, keys: envKeys({ ANTHROPIC_API_KEY: KEY, GEMINI_API_KEY: 'g'.repeat(30), OPENAI_API_KEY: 'o'.repeat(30), ...o.env }),
    providers: [mk('anthropic'), mk('gemini'), mk('openai')], models: spec, budget: o.budget ?? { perDayUsd: 1, perMonthUsd: 10, perModelDayUsd: { 'anthropic/big': 0.5 } },
    logger: createLogger({ service: 'gateway', sinks: [sink], clock: fixedClock(NOW) }), clock: fixedClock(NOW), timeoutMs: 200,
  });
  return { gw, usage, sink, seen };
}

test('cost maths: 1000 in + 500 out at $3/$15 per million = $0.0105', () => {
  assert.ok(Math.abs(computeCost(1000, 500, { in_per_mtok: 3, out_per_mtok: 15 }) - 0.0105) < 1e-12);
});
test('happy path: calls the model, records usage and cost, returns text', async () => {
  const { gw, usage, seen } = setup();
  const r = await gw.call(req()); assert.ok(r.ok && r.text === 'hello' && Math.abs(r.usage.costUsd - 0.0105) < 1e-9);
  assert.equal(usage.rows.length, 1); assert.deepEqual([usage.rows[0].provider, usage.rows[0].ok, usage.rows[0].tokens_out], ['anthropic', true, 500]);
  assert.equal(seen[0].apiKey, KEY); assert.equal(seen[0].model, 'big');
});
test('kill switch ON: refused, nothing called, nothing recorded', async () => {
  const { gw, usage, seen } = setup({ kill: true }); const r = await gw.call(req());
  assert.ok(!r.ok && r.code === 'kill_switch_on'); assert.equal(seen.length, 0); assert.equal(usage.rows.length, 0);
});
test('kill switch unreadable: refused (fail-closed)', async () => {
  const { gw, seen } = setup({ kill: 'throw' }); assert.equal(((await gw.call(req())) as any).code, 'kill_switch_on'); assert.equal(seen.length, 0);
});
test('unknown model / provider refused', async () => {
  const { gw } = setup();
  assert.equal(((await gw.call(req({ model: 'nope' }))) as any).code, 'unknown_model');
  const g2 = createGateway({ ...({} as any), kill: { read: async () => ({ kill: false, epoch: 0 }) }, usage: memoryUsageStore(), keys: envKeys({}), providers: [], models: spec, budget: {}, logger: createLogger({ service: 'g', sinks: [] }) });
  assert.equal(((await g2.call(req())) as any).code, 'unknown_provider');
});
test('model without a price is refused; we never guess a price', async () => {
  const { gw, seen } = setup(); const r = await gw.call(req({ provider: 'openai', model: 'mystery' }));
  assert.ok(!r.ok && r.code === 'unpriced_model'); assert.equal(seen.length, 0);
});
test('daily budget: blocks the call that COULD push us over, before spending', async () => {
  const { gw, usage, seen } = setup({ budget: { perDayUsd: 0.02 } });
  assert.ok((await gw.call(req())).ok); // worst case 0.018, used 0.0105 afterwards
  const r2 = await gw.call(req()); // used 0.0105 + worst 0.018 > 0.02
  assert.ok(!r2.ok && r2.code === 'budget_exceeded'); assert.equal(seen.length, 1); assert.equal(usage.rows.length, 1);
});
test('per-model and monthly caps are enforced; warning at 80%', async () => {
  const a = setup({ budget: { perModelDayUsd: { 'anthropic/big': 0.01 } } }); assert.equal(((await a.gw.call(req())) as any).code, 'budget_exceeded');
  const b = setup({ budget: { perMonthUsd: 0.02 } }); const r = await b.gw.call(req()); assert.ok(r.ok && /monthly budget: \d+% used/.test(r.warning!));
});
test('free model: costs 0, but its daily request limit is enforced', async () => {
  const { gw, usage } = setup(); const q = req({ provider: 'gemini', model: 'flash' });
  assert.ok((await gw.call(q)).ok); assert.ok((await gw.call(q)).ok);
  assert.equal(usage.rows.every((x) => x.cost_usd === 0), true);
  assert.equal(((await gw.call(q)) as any).code, 'budget_exceeded');
});
test('yesterday (India time) does not count against today', async () => {
  const { gw, usage } = setup({ budget: { perDayUsd: 0.02 } });
  usage.rows.push({ provider: 'anthropic', model: 'big', tokens_in: 1, tokens_out: 1, cost_usd: 5, ok: true, ts: new Date('2026-11-06T18:29:00Z') }); // 23:59 IST on the 6th
  assert.ok((await gw.call(req())).ok);
  const m = setup({ budget: { perDayUsd: 0.02 } }); m.usage.rows.push({ provider: 'anthropic', model: 'big', tokens_in: 1, tokens_out: 1, cost_usd: 5, ok: true, ts: new Date('2026-11-06T18:31:00Z') }); // 00:01 IST on the 7th
  assert.equal(((await m.gw.call(req())) as any).code, 'budget_exceeded');
});
test('usage cannot be read: spending is blocked (fail-closed)', async () => {
  const { gw } = setup(); (gw as any); const sink = memorySink();
  const g = createGateway({ kill: { read: async () => ({ kill: false, epoch: 0 }) }, usage: { summary: async () => { throw new Error('x'); }, record: async () => {} }, keys: envKeys({ ANTHROPIC_API_KEY: KEY }), providers: [{ name: 'anthropic', invoke: async () => ({ text: '', tokensIn: 0, tokensOut: 0 }) }], models: spec, budget: {}, logger: createLogger({ service: 'g', sinks: [sink] }) });
  assert.equal(((await g.call(req())) as any).code, 'budget_exceeded');
});
test('missing key: tells which variable to set, never a value', async () => {
  const { gw } = setup({ env: { ANTHROPIC_API_KEY: '  ' } }); const r = await gw.call(req());
  assert.ok(!r.ok && r.code === 'no_key' && r.message.includes('ANTHROPIC_API_KEY'));
});
test('provider error: usage row written as failed, error is generic', async () => {
  const { gw, usage } = setup({ provider: { invoke: async () => { throw new Error(`401 invalid key ${KEY}`); } } }); const r = await gw.call(req());
  assert.ok(!r.ok && r.code === 'provider_error' && !JSON.stringify(r).includes('k-test-abc'));
  assert.deepEqual([usage.rows[0].ok, usage.rows[0].cost_usd], [false, 0]);
});
test('timeout: slow provider is aborted', async () => {
  const { gw } = setup({ provider: { invoke: (a: any) => new Promise((_, rej) => a.signal.addEventListener('abort', () => rej(new Error('aborted')))) } });
  assert.equal(((await gw.call(req())) as any).code, 'timeout');
});
test('logs never contain the key, the prompt or the answer', async () => {
  const { gw, sink } = setup({ provider: { invoke: async () => { throw new Error(`bad ${KEY}`); } } });
  await gw.call(req()); const { gw: gw2, sink: sink2 } = setup(); await gw2.call(req());
  const all = JSON.stringify([...sink.entries, ...sink2.entries]);
  assert.ok(!all.includes(KEY) && !all.includes('SECRET PROMPT') && !all.includes('"hello"'));
  assert.ok(sink2.entries.some((e) => e.msg === 'model call ok'));
});
test('envKeys: default names match .env.example; custom provider name works', () => {
  const k = envKeys({ GEMINI_API_KEY: 'abc', MY_PROV_API_KEY: 'z' });
  assert.deepEqual([k.envName('anthropic'), k.envName('openai'), k.envName('gemini'), k.envName('my-prov'), k.get('gemini'), k.get('my-prov'), k.get('openai')], ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'MY_PROV_API_KEY', 'abc', 'z', undefined]);
});
test('checkBudget directly: unpriced non-free refused, free passes', () => {
  assert.equal((checkBudget({ budget: {}, usage: { dayUsd: 0, monthUsd: 0, modelDayUsd: {}, modelDayRequests: {} }, spec: spec[2], estIn: 1, maxOut: 1 }) as any).code, 'unpriced_model');
  assert.ok(checkBudget({ budget: { perDayUsd: 0 }, usage: { dayUsd: 0, monthUsd: 0, modelDayUsd: {}, modelDayRequests: {} }, spec: spec[1], estIn: 1, maxOut: 1 }).allow);
});
test('supabase usage store: right URLs and headers, reads this month, writes owner_id', async () => {
  const calls: any[] = [];
  const f = (async (url: string, init: any) => { calls.push({ url, init }); return init?.method === 'POST' ? { ok: true, status: 201 } : { ok: true, status: 200, json: async () => [{ provider: 'anthropic', model: 'big', cost_usd: '0.5', ts: NOW }] }; }) as any;
  const s = supabaseUsageStore({ url: 'https://x.supabase.co', serviceKey: 'SVC', ownerId: 'owner-1', fetch: f });
  const sum = await s.summary(new Date('2026-11-06T18:30:00Z'), new Date('2026-10-31T18:30:00Z'));
  assert.equal(sum.dayUsd, 0.5); assert.equal(sum.modelDayRequests['anthropic/big'], 1);
  assert.match(calls[0].url, /model_usage\?select=provider,model,cost_usd,ts&owner_id=eq\.owner-1&ts=gte\./); assert.equal(calls[0].init.headers.apikey, 'SVC');
  await s.record({ provider: 'p', model: 'm', tokens_in: 1, tokens_out: 2, cost_usd: 0, ok: true });
  assert.equal(JSON.parse(calls[1].init.body).owner_id, 'owner-1');
  const bad = supabaseUsageStore({ url: 'u', serviceKey: 'k', ownerId: 'o', fetch: (async () => ({ ok: false, status: 500 })) as any });
  await assert.rejects(bad.summary(new Date(), new Date()), /HTTP 500/); await assert.rejects(bad.record({} as any), /HTTP 500/);
});

test('audio model gateway interface is type-only and exposes metadata/reference contracts', async () => {
  const adapter: import('../src/types.ts').AudioModelAdapter = {
    async transcribe(request) { return { text: `transcribed:${request.mime_type}`, language: request.language }; },
    async speak(request) { return { audio_ref: `audio:${request.voice_id ?? 'default'}`, mime_type: 'audio/webm' }; },
  };
  const result = await adapter.transcribe({ audio_ref: 'storage://voice/input-1', mime_type: 'audio/webm', language: 'hi-IN' });
  assert.equal(result.text, 'transcribed:audio/webm');
  // This structural test does not wire an adapter into createGateway or call a model provider.
});
