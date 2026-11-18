import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createZenProvider,
  createLocalProvider,
  registerChatProviderAdapters,
} from '../src/providers.ts';
import { handleMessage } from '../src/pipeline.ts';
import { CARE_REPLY } from '../src/care.ts';
import { createGateway } from '../../model-gateway/src/gateway.ts';
import { memoryUsageStore } from '../../model-gateway/src/stores.ts';
import { createLogger } from '../../logging/src/index.ts';
import {
  loadDefaultRegistry,
  toModelSpecs,
  runChainStream,
  type ModelEntry,
  type Slot,
} from '../../models/src/index.ts';
import type { GatewayRequest, GatewayResult } from '../../model-gateway/src/types.ts';

function makeSseResponse(events: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${ev}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

// -----------------------------------------------------------------------------
// 1. Requirement 6 (Spec shart 9): Cache tokens verification across providers
// -----------------------------------------------------------------------------

test('Req 6 / Spec 9: Anthropic adapter parses tokensIn, tokensOut, cacheRead, cacheWrite from SSE', async () => {
  const events = [
    JSON.stringify({
      type: 'message_start',
      message: {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        usage: {
          input_tokens: 120,
          cache_read_input_tokens: 450,
          cache_creation_input_tokens: 80,
        },
      },
    }),
    JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello ' },
    }),
    JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'world!' },
    }),
    JSON.stringify({
      type: 'message_delta',
      usage: {
        output_tokens: 25,
      },
    }),
  ];

  const provider = createAnthropicProvider(async () => makeSseResponse(events));
  const res = await provider.invoke({
    model: 'claude-3-5-sonnet',
    input: { user: 'hi' },
    maxOutputTokens: 100,
    apiKey: 'test-key',
    signal: new AbortController().signal,
  });

  assert.equal(res.text, 'Hello world!');
  assert.equal(res.tokensIn, 120);
  assert.equal(res.tokensOut, 25);
  assert.equal(res.cacheReadTokens, 450);
  assert.equal(res.cacheWriteTokens, 80);
});

test('Req 6 / Spec 9: OpenAI adapter parses cached_tokens and splits uncached input tokens', async () => {
  const events = [
    JSON.stringify({
      choices: [{ delta: { content: 'Namaste ' } }],
    }),
    JSON.stringify({
      choices: [{ delta: { content: 'Amitji' } }],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 35,
        prompt_tokens_details: {
          cached_tokens: 150,
        },
      },
    }),
  ];

  const provider = createOpenAIProvider(async () => makeSseResponse(events));
  const res = await provider.invoke({
    model: 'gpt-4o-mini',
    input: { user: 'namaste' },
    maxOutputTokens: 50,
    apiKey: 'test-key',
    signal: new AbortController().signal,
  });

  assert.equal(res.text, 'Namaste Amitji');
  // Total prompt 200 - 150 cached = 50 uncached input tokens
  assert.equal(res.tokensIn, 50);
  assert.equal(res.tokensOut, 35);
  assert.equal(res.cacheReadTokens, 150);
});

test('Req 6 / Spec 9: Gemini adapter parses cachedContentTokenCount and uncached input tokens', async () => {
  const events = [
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Gemini ' }] } }],
    }),
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Response' }] } }],
      usageMetadata: {
        promptTokenCount: 300,
        candidatesTokenCount: 42,
        cachedContentTokenCount: 220,
      },
    }),
  ];

  const provider = createGeminiProvider(async () => makeSseResponse(events));
  const res = await provider.invoke({
    model: 'gemini-2.0-flash',
    input: { user: 'hi' },
    maxOutputTokens: 50,
    apiKey: 'test-key',
    signal: new AbortController().signal,
  });

  assert.equal(res.text, 'Gemini Response');
  // Total prompt 300 - 220 cached = 80 uncached input tokens
  assert.equal(res.tokensIn, 80);
  assert.equal(res.tokensOut, 42);
  assert.equal(res.cacheReadTokens, 220);
});

test('Req 6 / Spec 9: OpenCode Zen provider (OpenAI-compatible) parses cached tokens', async () => {
  const events = [
    JSON.stringify({
      choices: [{ delta: { content: 'Zen ' } }],
    }),
    JSON.stringify({
      choices: [{ delta: { content: 'Fast' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 15,
        prompt_tokens_details: {
          cached_tokens: 60,
        },
      },
    }),
  ];

  const provider = createZenProvider(async () => makeSseResponse(events));
  assert.equal(provider.name, 'opencode-zen');
  const res = await provider.invoke({
    model: 'big-pickle',
    input: { user: 'hi' },
    maxOutputTokens: 20,
    apiKey: 'test-zen-key',
    signal: new AbortController().signal,
  });

  assert.equal(res.text, 'Zen Fast');
  assert.equal(res.tokensIn, 40);
  assert.equal(res.tokensOut, 15);
  assert.equal(res.cacheReadTokens, 60);
});

// -----------------------------------------------------------------------------
// 2. Requirement 7 (Spec shart 10): tier + fallback_from recorded in usage rows
// -----------------------------------------------------------------------------

test('Req 7 / Spec 10: router runChainStream passes tier and fallback_from across chain', async () => {
  const recordedCalls: GatewayRequest[] = [];
  const fakeGateway = {
    async callStream(req: GatewayRequest, onChunk: any) {
      recordedCalls.push(req);
      if (req.model === 'm1') {
        return { ok: false as const, code: 'provider_error' as const, message: 'rate limit' };
      }
      await onChunk('success from m2');
      return { ok: true as const, text: 'success from m2', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0 } };
    },
  };

  const chain: Slot[] = [
    { id: 'zen/free-slot-1', provider: 'opencode-zen', model: 'm1', tier: 'free' },
    { id: 'zen/almost-zero-slot-2', provider: 'opencode-zen', model: 'm2', tier: 'almost_zero' },
  ];

  const res = await runChainStream(
    fakeGateway,
    chain,
    { input: 'test', maxOutputTokens: 50, estimatedInputTokens: 20 },
    'normal',
    async () => {},
  );

  assert.equal(res.result.ok, true);
  assert.equal(recordedCalls.length, 2);

  // First call: tier is 'free', fallback_from is undefined
  assert.equal(recordedCalls[0].tier, 'free');
  assert.equal(recordedCalls[0].fallback_from, undefined);

  // Second call: tier is 'almost_zero', fallback_from is first slot's id
  assert.equal(recordedCalls[1].tier, 'almost_zero');
  assert.equal(recordedCalls[1].fallback_from, 'zen/free-slot-1');
});

// -----------------------------------------------------------------------------
// 3. Requirement 9: Comprehensive Tests (a) through (h)
// -----------------------------------------------------------------------------

test('Req 9(a): T2 memory wala prompt kabhi Zen/cloud nahi jata (0 cloud calls)', async () => {
  let cloudCallCount = 0;
  const mockGateway = {
    async callStream(req: GatewayRequest) {
      if (req.provider !== 'local') cloudCallCount++;
      return { ok: true, text: 'cloud reply', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0 } };
    },
  };

  const reg = loadDefaultRegistry().models;
  const memoryPort = {
    async recall() {
      // Memory returns a private hit (T2 memory recall)
      return { block: 'Amit ko BP ki dawai subah leni hai', private_hits: 1 };
    },
    async remember() { return { verdict: { verdict: 'save' } }; },
  };

  const result = await handleMessage(
    { text: 'kavita sunao' },
    {
      killSwitch: { read: async () => ({ kill: false, epoch: 1 }) },
      gateway: mockGateway,
      memory: memoryPort as any,
      registry: reg,
      settings: { paidBigEnabled: false, localHealthy: false },
    },
  );

  assert.equal(cloudCallCount, 0, 'cloud model must NEVER be called when T2 memory hit is present');
  assert.equal(result.status, 'needs_model');
  assert.ok(result.text.includes('Ye private baat hai') || result.text.includes('local model chalu nahi hai'));
});

test('Req 9(b): Private + local down -> 0 cloud calls, returns "abhi band"', async () => {
  let cloudCallCount = 0;
  const mockGateway = {
    async callStream(req: GatewayRequest) {
      if (req.provider !== 'local') cloudCallCount++;
      return { ok: true, text: 'cloud reply' };
    },
  };

  const reg = loadDefaultRegistry().models;
  // Private text triggering privacy classifier
  const result = await handleMessage(
    { text: 'mera blood pressure 140/90 hai aur diabetes ki dawai chal rahi hai' },
    {
      killSwitch: { read: async () => ({ kill: false, epoch: 1 }) },
      gateway: mockGateway,
      registry: reg,
      settings: { paidBigEnabled: false, localHealthy: false },
    },
  );

  assert.equal(cloudCallCount, 0, '0 cloud calls when private text and local down');
  assert.equal(result.status, 'needs_model');
  assert.ok(result.text.includes('Ye private baat hai') && result.text.includes('chat band hai'));
});

test('Req 9(c): Zen free limit / 429 -> agla slot, ya saaf error', async () => {
  const attemptedModels: string[] = [];
  const mockGateway = {
    async callStream(req: GatewayRequest, onChunk: any) {
      attemptedModels.push(req.model);
      if (req.model === 'first-free') {
        // 429 / free limit error
        return { ok: false as const, code: 'provider_error' as const, message: 'Free usage limit reached' };
      }
      await onChunk('Fallback success');
      return { ok: true as const, text: 'Fallback success', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0 } };
    },
  };

  const customRegistry: ModelEntry[] = [
    {
      id: 'opencode-zen/first-free',
      provider: 'opencode-zen',
      adapter: 'openai',
      model: 'first-free',
      tier: 'free',
      size: 'small',
      privacy: 'cloud',
      enabled: true,
      free: true,
      limits: { reset_tz: 'UTC', status: 'official', source_url: 'https://opencode.ai/docs' },
      data_use: { trains_on_inputs: false, source_url: 'https://opencode.ai', note: '' },
      source: { url: 'https://opencode.ai', checked_on: '2026-11-18' },
      status: 'verified',
    },
    {
      id: 'opencode-zen/second-free',
      provider: 'opencode-zen',
      adapter: 'openai',
      model: 'second-free',
      tier: 'free',
      size: 'small',
      privacy: 'cloud',
      enabled: true,
      free: true,
      limits: { reset_tz: 'UTC', status: 'official', source_url: 'https://opencode.ai/docs' },
      data_use: { trains_on_inputs: false, source_url: 'https://opencode.ai', note: '' },
      source: { url: 'https://opencode.ai', checked_on: '2026-11-18' },
      status: 'verified',
    },
  ];

  const result = await handleMessage(
    { text: 'namaste jarvis' },
    {
      killSwitch: { read: async () => ({ kill: false, epoch: 1 }) },
      gateway: mockGateway,
      registry: customRegistry,
      settings: { paidBigEnabled: false, localHealthy: false },
    },
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.text, 'Fallback success');
  assert.deepEqual(attemptedModels, ['first-free', 'second-free']);
});

test('Req 9(d): Key missing -> saaf message naming env variable, never leaks key value', async () => {
  const store = memoryUsageStore();
  const kill = { read: async () => ({ kill: false, epoch: 1 }) };
  const gw = createGateway({
    kill,
    usage: store,
    keys: {
      get: () => undefined,
      envName: (p) => `${p.toUpperCase()}_API_KEY`,
    },
    providers: [{
      name: 'opencode-zen',
      invoke: async () => ({ text: 'ok', tokensIn: 1, tokensOut: 1 }),
    }],
    models: [{ provider: 'opencode-zen', model: 'big-pickle', free: true }],
    budget: { perDayUsd: 1, perMonthUsd: 10 },
    logger: createLogger({ service: 'test', sinks: [] }),
  });

  const res = await gw.call({
    provider: 'opencode-zen',
    model: 'big-pickle',
    task: 'chat',
    input: 'test',
    maxOutputTokens: 10,
    estimatedInputTokens: 5,
  });

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.code, 'no_key');
    assert.ok(res.message.includes('OPENCODE-ZEN_API_KEY'));
    // Ensure no secret or undefined literal value is printed
    assert.ok(!res.message.includes('undefined'));
  }
});

test('Req 9(e): Kill ON -> chain ruk jaye immediately, 0 model calls', async () => {
  let modelCallCount = 0;
  const mockGateway = {
    async callStream() {
      modelCallCount++;
      return { ok: true, text: 'should not happen' };
    },
  };

  const reg = loadDefaultRegistry().models;
  const result = await handleMessage(
    { text: 'weather batao' },
    {
      killSwitch: { read: async () => ({ kill: true, epoch: 1 }) },
      gateway: mockGateway,
      registry: reg,
    },
  );

  assert.equal(result.status, 'killed');
  assert.equal(result.text, 'Kill switch ON hai, main kuch nahi kar raha.');
  assert.equal(modelCallCount, 0);
});

test('Req 9(f): Care reply router tak nahi pahunchta, returns locally even under kill ON', async () => {
  let modelCallCount = 0;
  const mockGateway = {
    async callStream() {
      modelCallCount++;
      return { ok: true, text: 'should not run' };
    },
  };

  const result = await handleMessage(
    { text: 'jeene ka mann nahi kar raha' },
    {
      killSwitch: { read: async () => ({ kill: true, epoch: 1 }) },
      gateway: mockGateway,
    },
  );

  assert.equal(result.status, 'care');
  assert.equal(result.text, CARE_REPLY);
  assert.equal(modelCallCount, 0, 'care reply must bypass router and gateway completely');
});

test('Req 9(g): Budget unset / INR rate missing -> 0 model calls', async () => {
  let modelCalls = 0;
  const mockGateway = {
    async callStream() {
      modelCalls++;
      return { ok: true, text: 'unreachable' };
    },
    async call() {
      modelCalls++;
      return { ok: true, text: 'unreachable' };
    },
  };

  const reg: ModelEntry[] = [
    {
      id: 'opencode-zen/paid-model',
      provider: 'opencode-zen',
      adapter: 'openai',
      model: 'paid-model',
      tier: 'almost_zero',
      size: 'small',
      privacy: 'cloud',
      enabled: true,
      free: false,
      price_schedule: [{ from: '2026-01-01', price: { in: 0.1, out: 0.4 } }],
      data_use: { trains_on_inputs: false, source_url: 'https://opencode.ai', note: '' },
      source: { url: 'https://opencode.ai', checked_on: '2026-11-18' },
      status: 'verified',
    },
  ];

  // Budget unset in RouteInput -> router skips paid model and refuses
  const result = await handleMessage(
    { text: 'code likho' },
    {
      killSwitch: { read: async () => ({ kill: false, epoch: 1 }) },
      gateway: mockGateway,
      registry: reg,
      budget: undefined, // Unset budget
      settings: { paidBigEnabled: false, localHealthy: false },
    },
  );

  assert.equal(result.status, 'needs_model');
  assert.equal(modelCalls, 0, '0 model calls when budget is unset');
});

test('Req 9(h): Streaming: fallback sirf pehle delta se pehle (delta ke baad no fallback)', async () => {
  const attemptedSlots: string[] = [];
  const emittedDeltas: string[] = [];

  const fakeGateway = {
    async callStream(req: GatewayRequest, onChunk: any) {
      attemptedSlots.push(req.model);
      if (req.model === 'slot-1') {
        // Emit a chunk BEFORE failing
        await onChunk('Initial partial answer');
        return { ok: false as const, code: 'provider_error' as const, message: 'connection dropped mid-stream' };
      }
      await onChunk('Slot 2 answer');
      return { ok: true as const, text: 'Slot 2 answer', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0 } };
    },
  };

  const chain: Slot[] = [
    { id: 'zen/s1', provider: 'opencode-zen', model: 'slot-1', tier: 'free' },
    { id: 'zen/s2', provider: 'opencode-zen', model: 'slot-2', tier: 'free' },
  ];

  const res = await runChainStream(
    fakeGateway,
    chain,
    { input: 'test prompt', maxOutputTokens: 20, estimatedInputTokens: 10 },
    'normal',
    async (delta) => { emittedDeltas.push(delta); },
  );

  // Because slot 1 emitted a delta, fallback to slot 2 is FORBIDDEN
  assert.equal(res.result.ok, false);
  assert.deepEqual(attemptedSlots, ['slot-1'], 'must NOT fall back to slot 2 after first delta has been emitted');
  assert.deepEqual(emittedDeltas, ['Initial partial answer']);
});
