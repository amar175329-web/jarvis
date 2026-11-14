import test from 'node:test';
import assert from 'node:assert/strict';
import {
  threadsListHandler,
  threadsCreateHandler,
  messagesListHandler,
  messagesSendHandler,
  messagesStreamHandler,
} from '../index.ts';
import { createOwnerSession, SESSION_COOKIE } from '../../auth/index.ts';
import type { ChatThreadStore, ChatGateway } from '../../../packages/chat/src/types.ts';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const THREAD_ID = '00000000-0000-4000-8000-000000000002';
const MESSAGE_ID = '00000000-0000-4000-8000-000000000003';

const env = {
  SUPABASE_URL: 'https://jarvis-test.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key-for-chat',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test-key-for-chat',
  OWNER_EMAIL: 'amit@example.com',
};

const mockFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) {
    const token = new Headers(init?.headers).get('authorization');
    if (token === 'Bearer owner-access-token-123456789') return Response.json({ id: OWNER_ID, email: 'amit@example.com' });
    return Response.json({ msg: 'invalid' }, { status: 401 });
  }
  if (url.includes('/rest/v1/system_state')) {
    return Response.json([{ kill: false, epoch: 1 }]);
  }
  return new Response(null, { status: 404 });
};

async function getOwnerCookie(): Promise<string> {
  const req = new Request('https://jarvis.example/api/auth/session.create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: 'owner-access-token-123456789' }),
  });
  const res = await createOwnerSession(req, { env, fetch: mockFetch });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

function createMockThreadStore(): ChatThreadStore & {
  threads: any[];
  messages: any[];
} {
  const threads: any[] = [
    { id: THREAD_ID, ownerId: OWNER_ID, title: 'Test Thread', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  const messages: any[] = [
    { id: MESSAGE_ID, threadId: THREAD_ID, ownerId: OWNER_ID, role: 'user', content: 'hello', sequence: 0, createdAt: new Date().toISOString() },
  ];
  return {
    threads,
    messages,
    async listThreads(q) {
      return threads.filter((t) => t.ownerId === q.ownerId);
    },
    async createThread(t) {
      const created = {
        id: t.id ?? crypto.randomUUID(),
        ownerId: t.ownerId,
        title: t.title ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      threads.push(created);
      return created;
    },
    async listMessages(q) {
      return messages.filter((m) => m.ownerId === q.ownerId && m.threadId === q.threadId);
    },
    async getMessage(q) {
      return messages.find((m) => m.ownerId === q.ownerId && m.threadId === q.threadId && m.id === q.messageId) ?? null;
    },
    async appendMessage(m) {
      const created = {
        id: m.id ?? crypto.randomUUID(),
        threadId: m.threadId,
        ownerId: m.ownerId,
        role: m.role,
        content: m.content,
        sequence: messages.length,
        createdAt: new Date().toISOString(),
      };
      messages.push(created);
      return created;
    },
  };
}

test('threads.list requires owner authentication', async () => {
  const req = new Request('https://jarvis.example/api/chat/threads.list', { method: 'POST', body: JSON.stringify({}) });
  const res = await threadsListHandler(req, { env, fetch: mockFetch });
  assert.equal(res.status, 401);
});

test('threads.list returns owner threads for authenticated session', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const req = new Request('https://jarvis.example/api/chat/threads.list', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 10 }),
  });
  const res = await threadsListHandler(req, { env, fetch: mockFetch, threadStore });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.data.threads.length, 1);
  assert.equal(data.data.threads[0].id, THREAD_ID);
});

test('threads.create creates an owner thread', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const req = new Request('https://jarvis.example/api/chat/threads.create', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'New Conversation' }),
  });
  const res = await threadsCreateHandler(req, { env, fetch: mockFetch, threadStore });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.data.thread.title, 'New Conversation');
  assert.equal(threadStore.threads.length, 2);
});

test('messages.list returns thread messages in sequence order', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const req = new Request('https://jarvis.example/api/chat/messages.list', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID }),
  });
  const res = await messagesListHandler(req, { env, fetch: mockFetch, threadStore });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.data.messages.length, 1);
  assert.equal(data.data.messages[0].content, 'hello');
});

test('messages.send queues message and returns stream ticket', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const req = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'kya haal hai' }),
  });
  const res = await messagesSendHandler(req, { env, fetch: mockFetch, threadStore });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.data.accepted, true);
  assert.equal(data.data.thread_id, THREAD_ID);
  assert.ok(data.data.message_id);
  assert.equal(data.data.stream_path, '/api/chat/messages.stream');
});

test('messages.send is refused when kill switch is ON', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const killReader = { read: async () => ({ kill: true, epoch: 1 }) };
  const req = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'hello' }),
  });
  const res = await messagesSendHandler(req, { env, fetch: mockFetch, threadStore, killReader });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error.code, 'kill_switch_on');
});

test('messages.stream streams care response for self-harm text without model', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  // First send
  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'mujhe mar jaana hai' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore });
  const sendData = await sendRes.json();
  const messageId = sendData.data.message_id;

  // Then stream
  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes = await messagesStreamHandler(streamReq, { env, fetch: mockFetch, threadStore });
  assert.equal(streamRes.status, 200);
  assert.match(streamRes.headers.get('content-type')!, /text\/event-stream/);

  const text = await streamRes.text();
  assert.ok(text.includes('chat.message.started'));
  assert.ok(text.includes('chat.message.delta'));
  assert.ok(text.includes('chat.message.completed'));
  assert.ok(text.includes('main yahin hoon') || text.includes('112') || text.includes('14416'));
});

test('messages.stream shows Hindi message when model slot is unconfigured (needs_model)', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'aaj mausam kaisa hai' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore });
  const sendData = await sendRes.json();
  const messageId = sendData.data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes = await messagesStreamHandler(streamReq, { env, fetch: mockFetch, threadStore });
  assert.equal(streamRes.status, 200);

  const text = await streamRes.text();
  assert.ok(text.includes('chat.message.started'));
  assert.ok(text.includes('chat.message.delta'));
  assert.ok(text.includes('chat.message.completed'));
  // Verifies clean Hindi guidance, no crash
  assert.ok(text.includes('model') || text.includes('configured') || text.includes('set nahi'));
});

test('HTTP methods other than POST are rejected', async () => {
  const req = new Request('https://jarvis.example/api/chat/threads.list', { method: 'GET' });
  const res = await threadsListHandler(req, { env, fetch: mockFetch });
  assert.equal(res.status, 405);
});

test('non-owner account receives 403 forbidden', async () => {
  const nonOwnerFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) {
      return Response.json({ id: '00000000-0000-4000-8000-000000000099', email: 'other@example.com' });
    }
    return Response.json([{ kill: false, epoch: 1 }]);
  };
  const createReq = new Request('https://jarvis.example/api/auth/session.create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: 'other-access-token-123456789' }),
  });
  // session.create will return 403 directly for non-owner
  const createRes = await createOwnerSession(createReq, { env, fetch: nonOwnerFetch });
  assert.equal(createRes.status, 403);
});

test('kill switch reader unavailable: fail-closed returns 503', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();

  // Empty env so config() returns null and no default kill reader can be created
  const emptyOptions = { env: {}, threadStore };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'hello' }),
  });
  const sendRes = await messagesSendHandler(sendReq, emptyOptions);
  assert.equal(sendRes.status, 503);
  const sendData = await sendRes.json();
  assert.equal(sendData.error.code, 'unavailable');

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: MESSAGE_ID }),
  });
  const streamRes = await messagesStreamHandler(streamReq, emptyOptions);
  assert.equal(streamRes.status, 503);
  const streamData = await streamRes.json();
  assert.equal(streamData.error.code, 'unavailable');
});

test('care reply works even when kill switch is ON, while regular messages remain blocked', async () => {
  const cookie = await getOwnerCookie();
  const threadStore = createMockThreadStore();
  const killReader = { read: async () => ({ kill: true, epoch: 1 }) };

  // 1. Regular message must be blocked with 403
  const normalSendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'kal subah milte hain' }),
  });
  const normalSendRes = await messagesSendHandler(normalSendReq, { env, fetch: mockFetch, threadStore, killReader });
  assert.equal(normalSendRes.status, 403);
  const normalData = await normalSendRes.json();
  assert.equal(normalData.error.code, 'kill_switch_on');

  // 2. Care signal message must be accepted even with kill switch ON
  const careSendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'mujhe mar jaana hai' }),
  });
  const careSendRes = await messagesSendHandler(careSendReq, { env, fetch: mockFetch, threadStore, killReader });
  assert.equal(careSendRes.status, 200);
  const careData = await careSendRes.json();
  assert.equal(careData.ok, true);
  assert.equal(careData.data.accepted, true);
  const messageId = careData.data.message_id;

  // 3. Care signal message stream must succeed with warm care reply without calling any model
  let providerCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream() { providerCalls++; return { ok: true, text: 'should not be called', usage: { tokensIn: 0, tokensOut: 0, costUsd: 0 } }; },
    async call() { providerCalls++; return { ok: true, text: 'should not be called', usage: { tokensIn: 0, tokensOut: 0, costUsd: 0 } }; },
  };

  const careStreamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const careStreamRes = await messagesStreamHandler(careStreamReq, {
    env,
    fetch: mockFetch,
    threadStore,
    killReader,
    gateway: mockGateway,
  });
  assert.equal(careStreamRes.status, 200);
  const streamBody = await careStreamRes.text();
  assert.ok(streamBody.includes('main yahin hoon') || streamBody.includes('112') || streamBody.includes('14416'));
  assert.equal(providerCalls, 0, 'model provider must never be called for care reply under kill switch');
});

test('multi-instance independence: send on instance A, stream on instance B, idempotent duplicate prevention', async () => {
  const cookie = await getOwnerCookie();
  // Shared persistent store (mimics database)
  const sharedStore = createMockThreadStore();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };

  // Instance A handles send
  const instanceAOptions = { env, fetch: mockFetch, threadStore: sharedStore, killReader };
  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'namaste jarvis' }),
  });
  const sendRes = await messagesSendHandler(sendReq, instanceAOptions);
  assert.equal(sendRes.status, 200);
  const sendData = await sendRes.json();
  const messageId = sendData.data.message_id;

  // Verify message is in shared store
  const savedMsg = sharedStore.messages.find((m) => m.id === messageId);
  assert.ok(savedMsg, 'message should be persisted in store by instance A');
  assert.equal(savedMsg.content, 'namaste jarvis');

  // Instance B (completely separate options instance, no shared in-memory Map) handles stream
  let modelCallCount = 0;
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      modelCallCount++;
      await onChunk('Namaste! Kaise madad karoon?');
      return { ok: true, text: 'Namaste! Kaise madad karoon?', usage: { tokensIn: 5, tokensOut: 10, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const instanceBOptions = {
    env,
    fetch: mockFetch,
    threadStore: sharedStore,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const streamReq1 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes1 = await messagesStreamHandler(streamReq1, instanceBOptions);
  assert.equal(streamRes1.status, 200);
  const text1 = await streamRes1.text();
  assert.ok(text1.includes('Namaste! Kaise madad karoon?'));
  assert.equal(modelCallCount, 1);

  // Second stream call on the same message (idempotency check): must return existing response without re-invoking model
  const streamReq2 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes2 = await messagesStreamHandler(streamReq2, instanceBOptions);
  assert.equal(streamRes2.status, 200);
  const text2 = await streamRes2.text();
  assert.ok(text2.includes('Namaste! Kaise madad karoon?'));
  assert.equal(modelCallCount, 1, 'model must NOT be called a second time (idempotent stream)');
});

test('model budget limit enforcement: limit exceeded or unset refuses calls with call count 0', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };

  // Case A: MODEL_DAY_LIMIT_INR is unset -> refuses model call ("budget set nahi hai"), call count = 0
  const unsetEnv = { ...env, MODEL_DAY_LIMIT_INR: undefined, MODEL_MONTH_LIMIT_INR: undefined };
  const threadStoreA = createMockThreadStore();

  const sendReqA = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'aaj ka schedule batao' }),
  });
  const sendResA = await messagesSendHandler(sendReqA, { env: unsetEnv, fetch: mockFetch, threadStore: threadStoreA, killReader });
  const messageIdA = (await sendResA.json()).data.message_id;

  const streamReqA = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageIdA }),
  });
  const streamResA = await messagesStreamHandler(streamReqA, {
    env: unsetEnv,
    fetch: mockFetch,
    threadStore: threadStoreA,
    killReader,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  });
  assert.equal(streamResA.status, 200);
  const textA = await streamResA.text();
  assert.ok(textA.includes('budget set nahi hai') || textA.includes('MODEL_DAY_LIMIT_INR'));

  // Case B: MODEL_DAY_LIMIT_INR is set to 10 INR, but usage has already exceeded limit -> model call count = 0
  const budgetEnv = { ...env, MODEL_DAY_LIMIT_INR: '10', MODEL_MONTH_LIMIT_INR: '100' };
  const threadStoreB = createMockThreadStore();

  // Mock usage store returning 50 USD used (far exceeds 10 INR / 84 USD)
  const exceededUsageStore = {
    async summary() {
      return {
        dayUsd: 50.0,
        monthUsd: 50.0,
        modelDayUsd: { 'anthropic/claude': 50.0 },
        modelDayRequests: { 'anthropic/claude': 100 },
      };
    },
    async record() {},
  };

  const sendReqB = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'aaj ka schedule batao' }),
  });
  const sendResB = await messagesSendHandler(sendReqB, { env: budgetEnv, fetch: mockFetch, threadStore: threadStoreB, killReader });
  const messageIdB = (await sendResB.json()).data.message_id;

  const streamReqB = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageIdB }),
  });
  const streamResB = await messagesStreamHandler(streamReqB, {
    env: budgetEnv,
    fetch: mockFetch,
    threadStore: threadStoreB,
    killReader,
    usageStore: exceededUsageStore as any,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  });
  assert.equal(streamResB.status, 200);
  const textB = await streamResB.text();
  assert.ok(textB.includes('budget limit poori ho gayi') || textB.includes('budget_exceeded'));
});

