import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalHealthy, routeModelRequest, executePrivateRequest, LOCAL_HEALTH_MAX_AGE_MS } from '../src/local-router.ts';
import type { LocalHealth } from '../src/local-types.ts';

test('isLocalHealthy: true when ok=true and checked within 3 minutes', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const freshHealth: LocalHealth = {
    ok: true,
    checked_at: new Date('2026-11-15T09:58:30Z').toISOString(), // 1.5 min old
    running: false,
  };
  assert.equal(isLocalHealthy(freshHealth, now), true);
});

test('isLocalHealthy: false when health check is older than 3 minutes', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const staleHealth: LocalHealth = {
    ok: true,
    checked_at: new Date('2026-11-15T09:56:59Z').toISOString(), // 3 min 1 sec old
    running: false,
  };
  assert.equal(isLocalHealthy(staleHealth, now), false);
});

test('isLocalHealthy: false when ok is false or health is null', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  assert.equal(isLocalHealthy(null, now), false);
  assert.equal(isLocalHealthy(undefined, now), false);

  const notOkHealth: LocalHealth = {
    ok: false,
    checked_at: new Date('2026-11-15T09:59:30Z').toISOString(),
    running: false,
  };
  assert.equal(isLocalHealthy(notOkHealth, now), false);
});

test('routeModelRequest: private request routes to local model when healthy', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const health: LocalHealth = {
    ok: true,
    checked_at: new Date('2026-11-15T09:59:00Z').toISOString(),
    running: false,
  };

  const decision = routeModelRequest({
    text: 'mera secret password aur bank balance',
    isPrivate: true,
    health,
    now,
  });

  assert.equal(decision.status, 'routed');
  if (decision.status === 'routed') {
    assert.equal(decision.target, 'local');
    assert.equal(decision.model, 'gemma-3-1b-it');
    assert.equal(decision.isPrivate, true);
  }
});

test('routeModelRequest: private extraction routes to rules-1b-extractor', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const health: LocalHealth = {
    ok: true,
    checked_at: new Date('2026-11-15T09:59:00Z').toISOString(),
    running: true,
  };

  const decision = routeModelRequest({
    text: 'kal subah 8 baje private dawai leni hai',
    isPrivate: true,
    intent: 'extraction',
    health,
    now,
  });

  assert.equal(decision.status, 'routed');
  if (decision.status === 'routed') {
    assert.equal(decision.target, 'local');
    assert.equal(decision.model, 'rules-1b-extractor');
  }
});

test('routeModelRequest: private open chat routes to local 1B with limited note', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const health: LocalHealth = {
    ok: true,
    checked_at: new Date('2026-11-15T09:59:00Z').toISOString(),
    running: true,
  };

  const decision = routeModelRequest({
    text: 'tum kaun ho aur mere baare mein kya jante ho',
    isPrivate: true,
    intent: 'conversation',
    health,
    now,
  });

  assert.equal(decision.status, 'routed');
  if (decision.status === 'routed') {
    assert.equal(decision.target, 'local');
    assert.equal(decision.model, 'gemma-3-1b-it');
    assert.ok(decision.reason.includes('सीमित'));
  }
});

test('routeModelRequest: private request returns "abhi band" when local is not healthy (never cloud)', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const staleHealth: LocalHealth = {
    ok: true,
    checked_at: new Date('2026-11-15T09:50:00Z').toISOString(), // 10 min old
    running: false,
  };

  const decision = routeModelRequest({
    text: 'private health report',
    isPrivate: true,
    health: staleHealth,
    now,
    cloudSlot: { provider: 'openai', model: 'gpt-4o' }, // Cloud must be completely ignored
  });

  assert.equal(decision.status, 'unavailable');
  if (decision.status === 'unavailable') {
    assert.equal(decision.message, 'abhi band');
    assert.equal(decision.code, 'local_model_unavailable');
    assert.equal(decision.isPrivate, true);
  }
});

test('routeModelRequest: non-private request can route to cloud slot if provided', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const decision = routeModelRequest({
    text: 'duniya ka sabse uncha parvat kaun sa hai',
    isPrivate: false,
    cloudSlot: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
    now,
  });

  assert.equal(decision.status, 'routed');
  if (decision.status === 'routed') {
    assert.equal(decision.target, 'cloud');
    assert.equal(decision.model, 'claude-3-5-sonnet');
    assert.equal(decision.isPrivate, false);
  }
});

test('executePrivateRequest: returns "abhi band" when health is stale without calling runner', async () => {
  let runnerCalled = false;
  const fakeRunner = () => {
    runnerCalled = true;
    return { ok: true as const, text: 'output', durationMs: 100 };
  };

  const now = new Date('2026-11-15T10:00:00Z');
  const res = await executePrivateRequest({
    text: 'private text',
    health: { ok: true, checked_at: new Date('2026-11-15T09:40:00Z').toISOString(), running: false },
    runner: fakeRunner as any,
    now,
  });

  assert.equal(runnerCalled, false);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.message, 'abhi band');
    assert.equal(res.code, 'local_model_unavailable');
  }
});

test('executePrivateRequest: returns "abhi band" when runner fails or crashes', async () => {
  const failingRunner = () => {
    return { ok: false as const, code: 'local_model_unavailable' as const, message: 'unavailable' as const, reason: 'RAM below 800 MB' };
  };

  const now = new Date('2026-11-15T10:00:00Z');
  const res = await executePrivateRequest({
    text: 'private text',
    health: { ok: true, checked_at: new Date('2026-11-15T09:59:00Z').toISOString(), running: false },
    runner: failingRunner as any,
    now,
  });

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.message, 'abhi band');
  }
});

test('executePrivateRequest: returns text when runner succeeds', async () => {
  const goodRunner = (prompt: string) => {
    return { ok: true as const, text: `Answer to: ${prompt}`, durationMs: 150 };
  };

  const now = new Date('2026-11-15T10:00:00Z');
  const res = await executePrivateRequest({
    text: 'kal subah 8 baje dawai',
    health: { ok: true, checked_at: new Date('2026-11-15T09:59:00Z').toISOString(), running: false },
    runner: goodRunner as any,
    now,
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.text, 'Answer to: kal subah 8 baje dawai');
  }
});
