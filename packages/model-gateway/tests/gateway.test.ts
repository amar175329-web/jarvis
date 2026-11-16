import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, checkBudget, computeCost, worstCaseCost, startOfDayInTz, summarize, envKeys, memoryUsageStore, supabaseUsageStore, type ModelSpec, type Provider, type GatewayRequest } from '../src/index.ts';
import { createLogger, memorySink } from '../../logging/src/logger.ts';
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

test('callStream forwards live chunks and preserves usage accounting', async () => {
  const chunks: string[] = [];
  const { gw, usage, seen } = setup({ provider: { invoke: async (args) => {
    seen.push(args);
    await args.onChunk?.('first ');
    await args.onChunk?.('second');
    return { text: 'first second', tokensIn: 12, tokensOut: 3 };
  } } });
  const result = await gw.callStream(req(), (chunk) => { chunks.push(chunk); });
  assert.ok(result.ok);
  assert.equal(result.text, 'first second');
  assert.deepEqual(chunks, ['first ', 'second']);
  assert.equal(usage.rows.length, 1);
  assert.deepEqual([usage.rows[0]?.tokens_in, usage.rows[0]?.tokens_out, usage.rows[0]?.ok], [12, 3, true]);
});

test('callStream still blocks kill, unpriced model, budget and missing key before any delta', async () => {
  const blocked = async (gw: ReturnType<typeof setup>['gw'], code: string, request: GatewayRequest = req()) => {
    const chunks: string[] = [];
    const result = await gw.callStream(request, (chunk) => { chunks.push(chunk); });
    assert.ok(!result.ok && result.code === code);
    assert.deepEqual(chunks, []);
  };
  const killed = setup({ kill: true }); await blocked(killed.gw, 'kill_switch_on'); assert.equal(killed.seen.length, 0);
  const unpriced = setup(); await blocked(unpriced.gw, 'unpriced_model', req({ provider: 'openai', model: 'mystery' }));
  const budget = setup({ budget: { perDayUsd: 0 } }); await blocked(budget.gw, 'budget_exceeded'); assert.equal(budget.seen.length, 0);
  const noKey = setup({ env: { ANTHROPIC_API_KEY: '' } }); await blocked(noKey.gw, 'no_key'); assert.equal(noKey.seen.length, 0);
});

test('registered provider adapters can be added without bypassing model allow-list', async () => {
  const { gw, seen } = setup();
  gw.registerProvider({ name: 'custom', invoke: async (args) => ({ text: 'custom', tokensIn: 1, tokensOut: 1 }) });
  const result = await gw.call(req({ provider: 'custom', model: 'big' }));
  assert.ok(!result.ok && result.code === 'unknown_model');
  assert.equal(seen.length, 0);
});

// ==================== CR-2 Tests ====================

test('CR-2: computeCost calculates with explicit cache read, 5m write, and 1h write prices', () => {
  const p = {
    in_per_mtok: 0.1,
    out_per_mtok: 0.5,
    cache_read_per_mtok: 0.01,
    cache_write_5m_per_mtok: 0.125,
    cache_write_1h_per_mtok: 0.20,
  };
  const cost = computeCost(1000, 500, p, {
    cacheRead: 2000,
    cacheWrite5m: 1000,
    cacheWrite1h: 500,
  });
  // 1000*0.1 + 500*0.5 + 2000*0.01 + 1000*0.125 + 500*0.2 = 100 + 250 + 20 + 125 + 100 = 595 / 1e6 = 0.000595
  assert.ok(Math.abs(cost - 0.000595) < 1e-12);
});

test('CR-2: computeCost falls back to regular in_per_mtok if cache price is omitted (safe overestimate)', () => {
  const p = { in_per_mtok: 2.0, out_per_mtok: 10.0 };
  const cost = computeCost(1000, 500, p, { cacheRead: 3000, cacheWrite5m: 1000 });
  // in: 1000*2 = 2000, out: 500*10 = 5000, cacheRead: 3000*2 = 6000, cacheWrite5m: 1000*2 = 2000 => 15000 / 1e6 = 0.015
  assert.ok(Math.abs(cost - 0.015) < 1e-12);
});

test('CR-2: computeCost bracket threshold: base rate at or below threshold', () => {
  const p = {
    in_per_mtok: 0.10,
    out_per_mtok: 0.50,
    cache_read_per_mtok: 0.01,
    bracket: {
      over_prompt_tokens: 100000,
      in_per_mtok: 0.50,
      out_per_mtok: 2.50,
      cache_read_per_mtok: 0.05,
    },
  };
  // Exactly 100,000 prompt tokens (80,000 in + 20,000 cacheRead): should use base price
  const cost = computeCost(80000, 1000, p, { cacheRead: 20000 });
  // 80000 * 0.10 + 1000 * 0.50 + 20000 * 0.01 = 8000 + 500 + 200 = 8700 / 1e6 = 0.0087
  assert.ok(Math.abs(cost - 0.0087) < 1e-12);
});

test('CR-2: computeCost bracket threshold: higher bracket rate above threshold', () => {
  const p = {
    in_per_mtok: 0.10,
    out_per_mtok: 0.50,
    cache_read_per_mtok: 0.01,
    bracket: {
      over_prompt_tokens: 100000,
      in_per_mtok: 0.50,
      out_per_mtok: 2.50,
      cache_read_per_mtok: 0.05,
    },
  };
  // 100,001 prompt tokens (80,001 in + 20,000 cacheRead): crosses into bracket
  const cost = computeCost(80001, 1000, p, { cacheRead: 20000 });
  // 80001 * 0.50 + 1000 * 2.50 + 20000 * 0.05 = 40000.5 + 2500 + 1000 = 43500.5 / 1e6 = 0.0435005
  assert.ok(Math.abs(cost - 0.0435005) < 1e-12);
});

test('CR-2: worstCaseCost always estimates from the most expensive price tier', () => {
  const specWithBracket: ModelSpec = {
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    price: {
      in_per_mtok: 0.10,
      out_per_mtok: 0.50,
      bracket: {
        over_prompt_tokens: 100000,
        in_per_mtok: 0.50,
        out_per_mtok: 2.50,
      },
    },
  };
  // Even for 5000 estIn + 1000 maxOut, worst case picks the highest rate (bracket: $0.50 / $2.50)
  // 5000 * 0.50 + 1000 * 2.50 = 2500 + 2500 = 5000 / 1e6 = 0.005
  const worst = worstCaseCost(specWithBracket, 5000, 1000);
  assert.equal(worst, 0.005);
});

test('CR-2: startOfDayInTz: winter boundary for America/Los_Angeles is 08:00 UTC (15 Nov 2026)', () => {
  const d = new Date('2026-11-15T15:30:00Z');
  const start = startOfDayInTz(d, 'America/Los_Angeles');
  assert.equal(start.toISOString(), '2026-11-15T08:00:00.000Z');

  // Instant just before midnight in LA (07:59:59 UTC on 15 Nov is still 14 Nov in LA)
  const justBefore = new Date('2026-11-15T07:59:59Z');
  const startBefore = startOfDayInTz(justBefore, 'America/Los_Angeles');
  assert.equal(startBefore.toISOString(), '2026-11-14T08:00:00.000Z');
});

test('CR-2: startOfDayInTz: summer boundary for America/Los_Angeles is 07:00 UTC (15 July 2026)', () => {
  const d = new Date('2026-07-15T15:30:00Z');
  const start = startOfDayInTz(d, 'America/Los_Angeles');
  assert.equal(start.toISOString(), '2026-07-15T07:00:00.000Z');
});

test('CR-2: startOfDayInTz: DST transition date 8 March 2026 for America/Los_Angeles is 08:00 UTC', () => {
  const d = new Date('2026-03-08T18:00:00Z');
  const start = startOfDayInTz(d, 'America/Los_Angeles');
  assert.equal(start.toISOString(), '2026-03-08T08:00:00.000Z');
});

test('CR-2: summarize counts modelDayRequests by model resetTz while dayUsd remains IST', () => {
  // IST day start for 15 Nov 2026 is 14 Nov 18:30 UTC
  const istDayStart = new Date('2026-11-14T18:30:00Z');
  const istMonthStart = new Date('2026-11-01T00:00:00Z');
  // LA day start for 15 Nov 2026 is 15 Nov 08:00 UTC
  const laDayStart = new Date('2026-11-15T08:00:00Z');

  const rows = [
    // Row 1: 06:00 UTC on 15 Nov. In IST, it is 11:30 AM (TODAY). In LA, it is 10:00 PM on 14 Nov (YESTERDAY).
    { provider: 'gemini', model: 'flash', cost_usd: 0.50, ts: '2026-11-15T06:00:00Z' },
    // Row 2: 09:00 UTC on 15 Nov. In IST, it is TODAY. In LA, it is TODAY.
    { provider: 'gemini', model: 'flash', cost_usd: 0.20, ts: '2026-11-15T09:00:00Z' },
  ];

  const result = summarize(rows, istDayStart, istMonthStart, {
    'gemini/flash': laDayStart,
  });

  // USD total covers all rows from IST day start ($0.50 + $0.20 = $0.70)
  assert.equal(result.dayUsd, 0.70);
  assert.equal(result.modelDayUsd['gemini/flash'], 0.70);
  // modelDayRequests only counts rows since LA day start (Row 2 only => 1 request!)
  assert.equal(result.modelDayRequests['gemini/flash'], 1);
});

test('CR-2: gateway enforces free model limit according to Pacific day reset', async () => {
  const modelSpecWithTz: ModelSpec[] = [
    { provider: 'gemini', model: 'flash', free: true, maxRequestsPerDay: 1, resetTz: 'America/Los_Angeles' },
  ];
  const sink = memorySink();
  const usage = memoryUsageStore();
  const callTime = new Date('2026-11-15T09:00:00Z'); // 1:00 AM PST today

  // A call made at 07:30 UTC on 15 Nov (11:30 PM PST on 14 Nov, yesterday in LA)
  usage.rows.push({
    provider: 'gemini',
    model: 'flash',
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0,
    ok: true,
    ts: new Date('2026-11-15T07:30:00Z'),
  });

  const p: Provider = { name: 'gemini', invoke: async () => ({ text: 'ok', tokensIn: 100, tokensOut: 50 }) };
  const gw = createGateway({
    kill: { read: async () => ({ kill: false, epoch: 0 }) },
    usage,
    keys: envKeys({ GEMINI_API_KEY: 'g'.repeat(30) }),
    providers: [p],
    models: modelSpecWithTz,
    budget: {},
    logger: createLogger({ service: 'gateway', sinks: [sink], clock: fixedClock('2026-11-15T09:00:00Z') }),
    clock: fixedClock('2026-11-15T09:00:00Z'),
  });

  // 1st call today (after 08:00 UTC LA reset) succeeds because yesterday's request does not count!
  const r1 = await gw.call({ provider: 'gemini', model: 'flash', input: 'hi', maxOutputTokens: 50, estimatedInputTokens: 100 });
  assert.ok(r1.ok);

  // 2nd call today hits the 1 req/day limit and is blocked!
  const r2 = await gw.call({ provider: 'gemini', model: 'flash', input: 'hi again', maxOutputTokens: 50, estimatedInputTokens: 100 });
  assert.ok(!r2.ok && r2.code === 'budget_exceeded');
});

test('CR-2: gateway records new optional fields (cache tokens, tier, fallback_from)', async () => {
  const { gw, usage } = setup({
    provider: {
      invoke: async () => ({
        text: 'cached response',
        tokensIn: 500,
        tokensOut: 100,
        cacheReadTokens: 1500,
        cacheWriteTokens: 800,
        cacheWrite1hTokens: 200,
      }),
    },
  });

  const r = await gw.call(req({
    tier: 'almost_zero',
    fallback_from: 'gemini-free/gemini-3.5-flash-lite',
  }));

  assert.ok(r.ok);
  assert.equal(r.usage.tokensIn, 500);
  assert.equal(r.usage.cacheReadTokens, 1500);
  assert.equal(r.usage.cacheWriteTokens, 800);
  assert.equal(r.usage.cacheWrite1hTokens, 200);

  assert.equal(usage.rows.length, 1);
  const row = usage.rows[0];
  assert.equal(row.tokens_in, 500);
  assert.equal(row.cache_read_tokens, 1500);
  assert.equal(row.cache_write_tokens, 800);
  assert.equal(row.tier, 'almost_zero');
  assert.equal(row.fallback_from, 'gemini-free/gemini-3.5-flash-lite');
});

test('CR-2: supabaseUsageStore writes cache_read_tokens, cache_write_tokens, tier, and fallback_from', async () => {
  const calls: any[] = [];
  const fakeFetch = async (url: string, opts: any) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({}) };
  };
  const store = supabaseUsageStore({ url: 'https://sb.test', serviceKey: 'sec.ret', ownerId: 'user-42', fetch: fakeFetch as any });

  await store.record({
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    tokens_in: 100,
    tokens_out: 200,
    cost_usd: 0.001,
    ok: true,
    cache_read_tokens: 300,
    cache_write_tokens: 400,
    tier: 'almost_zero',
    fallback_from: 'gemini-free/gemini-3.5-flash-lite',
  });

  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.owner_id, 'user-42');
  assert.equal(body.tokens_in, 100);
  assert.equal(body.cache_read_tokens, 300);
  assert.equal(body.cache_write_tokens, 400);
  assert.equal(body.tier, 'almost_zero');
  assert.equal(body.fallback_from, 'gemini-free/gemini-3.5-flash-lite');
});

test('CR-2: backward compatibility: calls without new fields work seamlessly and preserve defaults', async () => {
  const { gw, usage } = setup();
  // Standard call without tier, fallback_from, or cache tokens
  const r = await gw.call(req());
  assert.ok(r.ok);
  assert.equal(usage.rows.length, 1);
  const row = usage.rows[0];
  assert.equal(row.cache_read_tokens, 0);
  assert.equal(row.cache_write_tokens, 0);
  assert.equal(row.tier, undefined);
  assert.equal(row.fallback_from, undefined);
});

test('CR-2: provider failure records zeroed tokens with tier and fallback_from preserved', async () => {
  const { gw, usage } = setup({
    provider: { invoke: async () => { throw new Error('API failure'); } },
  });
  const r = await gw.call(req({ tier: 'almost_zero', fallback_from: 'gemini-free/gemini-3.5-flash-lite' }));
  assert.ok(!r.ok && r.code === 'provider_error');
  assert.equal(usage.rows.length, 1);
  const row = usage.rows[0];
  assert.equal(row.ok, false);
  assert.equal(row.tokens_in, 0);
  assert.equal(row.tokens_out, 0);
  assert.equal(row.cost_usd, 0);
  assert.equal(row.cache_read_tokens, 0);
  assert.equal(row.cache_write_tokens, 0);
  assert.equal(row.tier, 'almost_zero');
  assert.equal(row.fallback_from, 'gemini-free/gemini-3.5-flash-lite');
});
