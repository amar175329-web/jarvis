import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGateway, memoryUsageStore, envKeys, type Provider } from '../../model-gateway/src/index.ts';
import { createLogger, memorySink } from '../../logging/src/logger.ts';
import { fixedClock } from '../../shared/src/index.ts';
import { routeModel, runChain, toModelSpecs, validateRegistry, priceAt, readFx, inrToUsd, formatMoney, PROVIDER_KEY_ENV, aliasProvider, type Registry, type ModelEntry, type RouteInput, type Task, type Depth } from '../src/index.ts';

const reg: Registry = JSON.parse(fs.readFileSync(new URL('../registry/models.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-11-14T10:00:00Z');
const byId = (id: string) => reg.models.find((m) => m.id === id)!;
const input = (o: Partial<RouteInput> = {}): RouteInput => ({
  task: 'chat', depth: 'FAST', privacy: 'normal', registry: reg.models, settings: { paidBigEnabled: false, localHealthy: false },
  usage: { dayRequests: {}, dayUsd: 0, monthUsd: 0 }, budget: { perDayUsd: 1, perMonthUsd: 10 }, now: NOW, estIn: 1000, maxOut: 300, hasKey: () => true, ...o,
});

test('registry file is valid: verified entries have official https source + date; paid_big ships disabled', () => {
  assert.deepEqual(validateRegistry(reg), []);
  for (const m of reg.models.filter((x) => x.status === 'verified' && x.privacy === 'cloud')) { assert.match(m.source.url, /^https:\/\//); assert.match(m.source.checked_on, /^\d{4}-\d{2}-\d{2}$/); }
  assert.ok(reg.models.filter((m) => m.tier === 'paid_big').every((m) => m.enabled === false));
});

test('missing/unverified price = refuse (gateway never even knows the model)', async () => {
  const specs = toModelSpecs(reg, NOW);
  assert.equal(specs.find((s) => s.model === 'gpt-6-luna'), undefined);
  assert.equal(specs.find((s) => s.model === 'not-chosen-yet'), undefined);
  const sink = memorySink(); const usage = memoryUsageStore(); usage.now = () => NOW;
  const p: Provider = { name: 'openai', invoke: async () => ({ text: 'x', tokensIn: 1, tokensOut: 1 }) };
  const gw = createGateway({ kill: { read: async () => ({ kill: false, epoch: 0 }) }, usage, keys: envKeys({ OPENAI_API_KEY: 'o'.repeat(30) }), providers: [p], models: specs, budget: { perDayUsd: 1 }, logger: createLogger({ service: 't', sinks: [sink], clock: fixedClock('2026-11-14T10:00:00Z') }), clock: fixedClock('2026-11-14T10:00:00Z') });
  const r = await gw.call({ provider: 'openai', model: 'gpt-6-luna', input: 'hi', maxOutputTokens: 10, estimatedInputTokens: 10 });
  assert.equal(r.ok, false); assert.equal((r as any).code, 'unknown_model');
  // a paid entry with its price removed is dropped too
  const stripped: Registry = { ...reg, models: reg.models.map((m) => (m.id === 'anthropic/claude-haiku-5-5' ? { ...m, price_schedule: undefined } : m)) };
  assert.equal(toModelSpecs(stripped, NOW).find((s) => s.model === 'claude-haiku-5-5'), undefined);
});

test('price schedule follows official dates (Argon doubles 2026-12-01)', () => {
  const a = byId('gemini-paid/gemini-4-argon');
  assert.equal(priceAt(a, new Date('2026-11-30T23:00:00Z'))!.in, 2);
  assert.equal(priceAt(a, new Date('2026-12-01T00:00:00Z'))!.out, 20);
  assert.equal(priceAt(byId('anthropic/claude-opus-5-5'), NOW)!.cache_read, 0.2);
});

test('free limit reached -> next free slot -> then almost-zero, with a notice; never paid_big', () => {
  const r1 = routeModel(input());
  assert.equal(r1.status, 'routed'); if (r1.status !== 'routed') return;
  assert.equal(r1.chain[0].tier, 'free'); assert.equal(r1.chain[0].size ?? 'small', 'small');
  assert.ok(r1.chain.some((s) => s.tier === 'almost_zero')); assert.ok(r1.notices.length === 1);
  const used = { 'gemini-free/gemini-3.5-flash-lite': 500 };
  const r2 = routeModel(input({ usage: { dayRequests: used, dayUsd: 0, monthUsd: 0 } }));
  assert.equal(r2.status, 'routed'); if (r2.status !== 'routed') return;
  assert.equal(r2.chain[0].id, 'gemini-free/gemini-3.1-flash-lite');
  const all = Object.fromEntries(reg.models.filter((m) => m.free).map((m) => [m.id, 9999]));
  const r3 = routeModel(input({ usage: { dayRequests: all, dayUsd: 0, monthUsd: 0 } }));
  assert.equal(r3.status, 'routed'); if (r3.status !== 'routed') return;
  assert.equal(r3.chain[0].tier, 'almost_zero'); assert.match(r3.notices[0], /almost-zero/);
  assert.ok(r3.chain.every((s) => s.tier !== 'paid_big'));
});

test('private -> only local; no local = refused, never cloud (even with free + paid keys present)', () => {
  const r = routeModel(input({ privacy: 'private' }));
  assert.equal(r.status, 'refused'); if (r.status === 'refused') assert.equal(r.code, 'private_needs_local');
  const localOn: ModelEntry[] = reg.models.map((m) => (m.tier === 'local' ? { ...m, enabled: true, status: 'verified' as const } : m));
  const ok = routeModel(input({ privacy: 'private', registry: localOn, settings: { paidBigEnabled: true, localHealthy: true } }));
  assert.equal(ok.status, 'routed'); if (ok.status === 'routed') { assert.equal(ok.chain.length, 1); assert.equal(ok.chain[0].tier, 'local'); }
  const unhealthy = routeModel(input({ privacy: 'private', registry: localOn, settings: { paidBigEnabled: true, localHealthy: false } }));
  assert.equal(unhealthy.status, 'refused');
});

test('paid_big is never in any chain unless Amit enabled it AND the model is enabled', () => {
  const tasks: Task[] = ['chat', 'reasoning', 'summarize', 'code', 'creative', 'action', 'extract']; const depths: Depth[] = ['FAST', 'NORMAL', 'DEEP'];
  for (const task of tasks) for (const depth of depths) {
    for (const settings of [{ paidBigEnabled: false, localHealthy: false }, { paidBigEnabled: true, localHealthy: false }]) {
      const r = routeModel(input({ task, depth, settings }));
      if (r.status === 'routed') assert.ok(r.chain.every((s) => s.tier !== 'paid_big'), `${task}/${depth}/${settings.paidBigEnabled}`); // all paid_big entries ship disabled
    }
  }
  const opened: ModelEntry[] = reg.models.map((m) => (m.id === 'anthropic/claude-opus-5-5' ? { ...m, enabled: true } : m));
  const off = routeModel(input({ task: 'code', depth: 'DEEP', registry: opened, settings: { paidBigEnabled: false, localHealthy: false } }));
  assert.ok(off.status === 'routed' && off.chain.every((s) => s.tier !== 'paid_big'));
  const on = routeModel(input({ task: 'code', depth: 'DEEP', registry: opened, settings: { paidBigEnabled: true, localHealthy: false } }));
  assert.ok(on.status === 'routed' && on.chain[0].id === 'anthropic/claude-opus-5-5');
  const light = routeModel(input({ task: 'chat', depth: 'DEEP', registry: opened, settings: { paidBigEnabled: true, localHealthy: false } }));
  assert.ok(light.status === 'routed' && light.chain.every((s) => s.tier !== 'paid_big')); // paid_big only for heavy tasks
});

test('budget and prompt-size guards skip models in the router', () => {
  const tight = routeModel(input({ usage: { dayRequests: Object.fromEntries(reg.models.filter((m) => m.free).map((m) => [m.id, 9999])), dayUsd: 0.99999, monthUsd: 0 } }));
  assert.equal(tight.status, 'refused');
  const big = routeModel(input({ estIn: 150_000, usage: { dayRequests: Object.fromEntries(reg.models.filter((m) => m.free).map((m) => [m.id, 9999])), dayUsd: 0, monthUsd: 0 } }));
  assert.ok(big.status === 'routed' && big.chain.every((s) => s.id !== 'anthropic/claude-haiku-5-5')); // Haiku capped at 100K prompt
  const nokey = routeModel(input({ hasKey: (p) => p !== 'gemini-free' }));
  assert.ok(nokey.status === 'routed' && nokey.chain.every((s) => s.provider !== 'gemini-free'));
});

test('runChain: falls to next on budget/provider error, stops on kill switch, blocks private->cloud', async () => {
  const chain = [{ id: 'a/x', provider: 'a', model: 'x', tier: 'free' as const }, { id: 'b/y', provider: 'b', model: 'y', tier: 'almost_zero' as const }];
  const base = { input: 'hi', maxOutputTokens: 10, estimatedInputTokens: 10 };
  const ok = (text: string) => ({ ok: true as const, text, usage: { tokensIn: 1, tokensOut: 1, costUsd: 0 } });
  const r1 = await runChain({ call: async (r) => (r.provider === 'a' ? { ok: false, code: 'budget_exceeded', message: 'x' } : ok('B')) }, chain, base, 'normal');
  assert.equal(r1.result.ok, true); assert.deepEqual(r1.tried.map((t) => t.id), ['a/x', 'b/y']); assert.equal(r1.usedTier, 'almost_zero');
  const r2 = await runChain({ call: async () => ({ ok: false, code: 'kill_switch_on', message: 'k' }) }, chain, base, 'normal');
  assert.equal(r2.tried.length, 1);
  await assert.rejects(() => runChain({ call: async () => ok('leak') }, chain, base, 'private'), /private data/);
});

test('INR: no hardcoded rate; env/settings only; stale flagged; unknown rate hides INR', () => {
  assert.equal(readFx({ now: NOW }), null);
  assert.equal(inrToUsd(100, null), null); assert.equal(formatMoney(0.5, null, true), '$0.5000');
  const e = readFx({ env: { INR_PER_USD: '90' }, now: NOW })!; assert.equal(e.inrPerUsd, 90); assert.equal(inrToUsd(90, e), 1);
  const s = readFx({ settings: { inr_per_usd: 91, checked_on: '2026-11-01' }, now: NOW })!; assert.equal(s.stale, true);
  assert.match(formatMoney(1, readFx({ env: { INR_PER_USD: '90' }, now: NOW }), true), /Rs 90\.00/);
  assert.equal(readFx({ env: { INR_PER_USD: 'abc' }, now: NOW }), null);
});

test('alias providers keep separate keys for free vs paid Gemini', () => {
  const base: Provider = { name: 'gemini', invoke: async () => ({ text: '', tokensIn: 0, tokensOut: 0 }) };
  assert.equal(aliasProvider(base, 'gemini-free').name, 'gemini-free');
  const k = envKeys({ GEMINI_FREE_API_KEY: 'f'.repeat(30), GEMINI_PAID_API_KEY: 'p'.repeat(30) }, PROVIDER_KEY_ENV);
  assert.notEqual(k.get('gemini-free'), k.get('gemini-paid'));
});

test('CR-2: toModelSpecs correctly passes cache prices, resetTz, and bracket', () => {
  const specs = toModelSpecs(reg, new Date('2026-11-16T10:00:00Z'));

  // Haiku 5.5 should have base cache prices and bracket
  const haiku = specs.find((s) => s.model === 'claude-haiku-5-5');
  assert.ok(haiku);
  assert.equal(haiku.price?.in_per_mtok, 0.1);
  assert.equal(haiku.price?.out_per_mtok, 0.5);
  assert.equal(haiku.price?.cache_read_per_mtok, 0.01);
  assert.equal(haiku.price?.cache_write_5m_per_mtok, 0.125);
  assert.equal(haiku.price?.cache_write_1h_per_mtok, 0.2);

  assert.ok(haiku.price?.bracket);
  assert.equal(haiku.price.bracket.over_prompt_tokens, 100000);
  assert.equal(haiku.price.bracket.in_per_mtok, 0.5);
  assert.equal(haiku.price.bracket.out_per_mtok, 2.5);
  assert.equal(haiku.price.bracket.cache_read_per_mtok, 0.05);
  assert.equal(haiku.price.bracket.cache_write_5m_per_mtok, 0.625);
  assert.equal(haiku.price.bracket.cache_write_1h_per_mtok, 1.0);

  // Free Gemini models should pass resetTz: 'America/Los_Angeles'
  const freeGemini = specs.find((s) => s.model === 'gemini-3.5-flash-lite' && s.free);
  assert.ok(freeGemini);
  assert.equal(freeGemini.resetTz, 'America/Los_Angeles');
  assert.equal(freeGemini.maxRequestsPerDay, 500);
});
