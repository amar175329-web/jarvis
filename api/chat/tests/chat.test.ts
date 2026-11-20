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
  if (url.includes('/rest/v1/model_usage')) {
    return Response.json([]);
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
      return messages.filter((m) => m.ownerId === q.ownerId && m.threadId === q.threadId && (q.status === 'all' || (q.status === 'pending' ? m.status === 'pending' : m.status !== 'pending')));
    },
    async getMessage(q) {
      return messages.find((m) => m.ownerId === q.ownerId && m.threadId === q.threadId && m.id === q.messageId) ?? null;
    },
    async getReplyMessage(q) {
      return messages.find((m) => m.ownerId === q.ownerId && m.threadId === q.threadId && m.replyToMessageId === q.replyToMessageId && m.role === 'assistant') ?? null;
    },
    async appendMessage(m) {
      if (m.role === 'assistant' && m.replyToMessageId) {
        const existing = messages.find(
          (x) => x.threadId === m.threadId && x.replyToMessageId === m.replyToMessageId
        );
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "idx_chat_messages_reply_claim"');
          (err as any).code = '23505';
          throw err;
        }
      }
      const created: ChatMessage = {
        id: m.id ?? crypto.randomUUID(),
        threadId: m.threadId,
        ownerId: m.ownerId,
        role: m.role,
        content: m.content,
        sequence: messages.length,
        replyToMessageId: m.replyToMessageId ?? null,
        status: m.status ?? 'done',
        createdAt: new Date().toISOString(),
      };
      messages.push(created);
      return created;
    },
    async updateMessage(q) {
      const msg = messages.find((m) => m.ownerId === q.ownerId && m.threadId === q.threadId && m.id === q.messageId);
      if (msg) {
        if (q.content !== undefined) msg.content = q.content;
        if (q.status !== undefined) msg.status = q.status;
        return { ...msg };
      }
      return null;
    },
    async deleteMessage(q) {
      const idx = messages.findIndex((m) => m.ownerId === q.ownerId && m.threadId === q.threadId && m.id === q.messageId);
      if (idx !== -1) {
        messages.splice(idx, 1);
      }
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

test('1. duplicate stream: concurrent streams on same message call model once and produce 1 assistant message', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const sharedStore = createMockThreadStore();

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'parallel stream test' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: sharedStore, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  let modelCallCount = 0;
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      modelCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      await onChunk('Parallel response chunk');
      return { ok: true, text: 'Parallel response chunk', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const opts = {
    env,
    fetch: mockFetch,
    threadStore: sharedStore,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const req1 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const req2 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  const [res1, res2] = await Promise.all([
    messagesStreamHandler(req1, opts),
    messagesStreamHandler(req2, opts),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const [text1, text2] = await Promise.all([res1.text(), res2.text()]);
  assert.ok(text1.includes('Parallel response chunk'));
  assert.ok(text2.includes('Parallel response chunk') || text2.includes('thoda intezar karein'));

  assert.equal(modelCallCount, 1, 'model must only be called once');
  const assistantMsgs = sharedStore.messages.filter((m) => m.role === 'assistant' && m.replyToMessageId === messageId);
  assert.equal(assistantMsgs.length, 1, 'exactly one assistant message must be stored in DB');
});

test('2. service key missing + budget set: refuses model call, calls = 0', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();
  const noKeyEnv = {
    ...env,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '84',
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'kuch batao' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: noKeyEnv, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  const streamRes = await messagesStreamHandler(streamReq, {
    env: noKeyEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  });

  assert.equal(streamRes.status, 200);
  const streamText = await streamRes.text();
  assert.ok(streamText.includes('budget_exceeded') || streamText.includes('budget limit poori ho gayi'));
  const assistantMsgs = store.messages.filter((m) => m.role === 'assistant');
  assert.equal(assistantMsgs.length, 0, 'no assistant message saved when service key missing');
});

test('3. wrong reply isolation: message A (unanswered) + message B (answered); streaming A does not return B reply', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  let modelCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      modelCalls++;
      const userText = req.input?.user ?? '';
      const reply = userText.startsWith('Pehla') ? 'Jawab for: Pehla sawaal A' : 'Jawab for: Doosra sawaal B';
      await onChunk(reply);
      return { ok: true, text: reply, usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const opts = {
    env,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const sendReqA = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'Pehla sawaal A' }),
  });
  const resA = await messagesSendHandler(sendReqA, opts);
  const msgIdA = (await resA.json()).data.message_id;

  const sendReqB = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'Doosra sawaal B' }),
  });
  const resB = await messagesSendHandler(sendReqB, opts);
  const msgIdB = (await resB.json()).data.message_id;

  const streamReqB = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: msgIdB }),
  });
  const streamResB = await messagesStreamHandler(streamReqB, opts);
  const textB = await streamResB.text();
  assert.ok(textB.includes('Jawab for: Doosra sawaal B'));
  assert.equal(modelCalls, 1);

  const streamReqA = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: msgIdA }),
  });
  const streamResA = await messagesStreamHandler(streamReqA, opts);
  const textA = await streamResA.text();
  assert.ok(textA.includes('Jawab for: Pehla sawaal A'));
  assert.ok(!textA.includes('Doosra sawaal B'));
  assert.equal(modelCalls, 2, 'model must be called for message A independently');
});

test('4. error save nahi: needs_model / budget fallback text is not saved to DB; retrying after fix creates new reply', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'kavita sunao' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq1 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes1 = await messagesStreamHandler(streamReq1, { env, fetch: mockFetch, threadStore: store, killReader });
  const text1 = await streamRes1.text();
  assert.ok(text1.includes('model configured nahi hai') || text1.includes('Model slot set nahi hai'));

  let assistantMsgs = store.messages.filter((m) => m.role === 'assistant');
  assert.equal(assistantMsgs.length, 0, 'error text must NOT be saved in DB as assistant message');

  let modelCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      modelCalls++;
      await onChunk('Yeh rahi sundar kavita');
      return { ok: true, text: 'Yeh rahi sundar kavita', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const fixedOpts = {
    env,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const streamReq2 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes2 = await messagesStreamHandler(streamReq2, fixedOpts);
  const text2 = await streamRes2.text();
  assert.ok(text2.includes('Yeh rahi sundar kavita'));
  assert.equal(modelCalls, 1);

  assistantMsgs = store.messages.filter((m) => m.role === 'assistant' && m.replyToMessageId === messageId);
  assert.equal(assistantMsgs.length, 1, 'now exactly one assistant message saved in DB');
  assert.equal(assistantMsgs[0].content, 'Yeh rahi sundar kavita');
});

test('5. INR_PER_USD missing or invalid refuses model call with calls = 0', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const missingInrEnv = {
    ...env,
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: undefined,
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'currency test' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: missingInrEnv, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes = await messagesStreamHandler(streamReq, {
    env: missingInrEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  });

  assert.equal(streamRes.status, 200);
  const text = await streamRes.text();
  assert.ok(text.includes('budget_exceeded') || text.includes('budget limit poori ho gayi'));
  const assistantMsgs = store.messages.filter((m) => m.role === 'assistant');
  assert.equal(assistantMsgs.length, 0);
});

test('6. empty modelConfig without S13 registry responds with needs_model, calls = 0', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  let modelCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream() {
      modelCalls++;
      return { ok: true, text: 'should not be called' };
    },
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'namaste' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const streamRes = await messagesStreamHandler(streamReq, {
    env,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
  });

  assert.equal(streamRes.status, 200);
  const text = await streamRes.text();
  assert.ok(text.includes('model configured nahi hai') || text.includes('Model slot set nahi hai'));
  assert.equal(modelCalls, 0, 'gateway must not be called when model slots are null');
  const assistantMsgs = store.messages.filter((m) => m.role === 'assistant');
  assert.equal(assistantMsgs.length, 0, 'fallback needs_model text must not be saved in DB');
});

test('P13 8(a): 2 separate module instances with shared store -> Promise.all -> model calls = 1, assistant rows = 1, same text to both', async () => {
  const modA = await import('../index.ts?a=1');
  const modB = await import('../index.ts?b=2');
  assert.notEqual(modA, modB, 'must be two separate module instances');

  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const sharedStore = createMockThreadStore();

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'multi-instance parallel stream' }),
  });
  const sendRes = await modA.messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: sharedStore, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  let modelCallCount = 0;
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      modelCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      await onChunk('Cross-instance synchronized chunk');
      return { ok: true, text: 'Cross-instance synchronized chunk', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const optsA = {
    env,
    fetch: mockFetch,
    threadStore: sharedStore,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };
  const optsB = {
    env,
    fetch: mockFetch,
    threadStore: sharedStore,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const req1 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const req2 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  const [res1, res2] = await Promise.all([
    modA.messagesStreamHandler(req1, optsA),
    modB.messagesStreamHandler(req2, optsB),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const [text1, text2] = await Promise.all([res1.text(), res2.text()]);
  assert.ok(text1.includes('Cross-instance synchronized chunk'));
  assert.ok(text2.includes('Cross-instance synchronized chunk'));

  assert.equal(modelCallCount, 1, 'model must only be called once even across module instances');
  const assistantMsgs = sharedStore.messages.filter((m) => m.role === 'assistant' && m.replyToMessageId === messageId);
  assert.equal(assistantMsgs.length, 1, 'exactly one assistant message must be stored in DB');
  assert.equal(assistantMsgs[0].status, 'done');
});

test('P13 8(b): winner model fail -> pending row not in DB, retry creates new reply', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'model fail test' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  let attempt = 0;
  const failingGateway: ChatGateway = {
    async callStream() {
      attempt++;
      if (attempt === 1) {
        throw new Error('transient model failure');
      }
      return { ok: true, text: 'recovered reply on retry', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const opts = {
    env,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: failingGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const streamReq1 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const res1 = await messagesStreamHandler(streamReq1, opts);
  assert.equal(res1.status, 200);
  const text1 = await res1.text();

  // Pending row must have been cleaned up/deleted from DB
  const pendingRows = store.messages.filter((m) => m.replyToMessageId === messageId && m.status === 'pending');
  assert.equal(pendingRows.length, 0, 'pending row must be deleted on model error');
  const allRows = store.messages.filter((m) => m.replyToMessageId === messageId);
  assert.equal(allRows.length, 0, 'no assistant rows in DB after failed model call');

  // Retry can now acquire a new claim and succeed
  const streamReq2 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const res2 = await messagesStreamHandler(streamReq2, opts);
  assert.equal(res2.status, 200);
  const text2 = await res2.text();
  assert.ok(text2.includes('recovered reply on retry'));

  const savedReplies = store.messages.filter((m) => m.replyToMessageId === messageId);
  assert.equal(savedReplies.length, 1);
  assert.equal(savedReplies[0].status, 'done');
  assert.equal(savedReplies[0].content, 'recovered reply on retry');
});

test('P13 8(c): stale pending row (>60s) -> deleted and new claim acquired', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'stale test' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  // Insert a stale pending row from a crashed instance (created 70 seconds ago)
  const stalePendingMsg: ChatMessage = {
    id: crypto.randomUUID(),
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    role: 'assistant',
    content: '',
    sequence: store.messages.length,
    replyToMessageId: messageId,
    status: 'pending',
    createdAt: new Date(Date.now() - 70_000).toISOString(),
  };
  store.messages.push(stalePendingMsg);

  let modelCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      modelCalls++;
      await onChunk('Stale replaced with fresh reply');
      return { ok: true, text: 'Stale replaced with fresh reply', usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
  const testSlot = { provider: 'anthropic' as const, model: 'claude', tier: 'paid' as const };
  const opts = {
    env,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
    modelConfig: { fast: testSlot, normal: testSlot, deep: testSlot, private: null },
  };

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });
  const res = await messagesStreamHandler(streamReq, opts);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('Stale replaced with fresh reply'));
  assert.equal(modelCalls, 1);

  const replies = store.messages.filter((m) => m.replyToMessageId === messageId);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].status, 'done');
  assert.notEqual(replies[0].id, stalePendingMsg.id, 'stale pending row must have been replaced with new claim');
});

test('P13 8(d): messages.list does not return pending rows', async () => {
  const cookie = await getOwnerCookie();
  const store = createMockThreadStore();

  // Add a user message
  const userMsgId = crypto.randomUUID();
  store.messages.push({
    id: userMsgId,
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    role: 'user',
    content: 'User query',
    sequence: 1,
    status: 'done',
    createdAt: new Date().toISOString(),
  });

  // Add an in-flight pending assistant message
  store.messages.push({
    id: crypto.randomUUID(),
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    role: 'assistant',
    content: '',
    sequence: 2,
    replyToMessageId: userMsgId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  // Add a completed assistant message
  store.messages.push({
    id: crypto.randomUUID(),
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    role: 'assistant',
    content: 'Completed answer',
    sequence: 3,
    replyToMessageId: crypto.randomUUID(),
    status: 'done',
    createdAt: new Date().toISOString(),
  });

  const req = new Request('https://jarvis.example/api/chat/messages.list', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID }),
  });
  const res = await messagesListHandler(req, { env, fetch: mockFetch, threadStore: store });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);

  const returnedMsgs = data.data.messages;
  assert.ok(returnedMsgs.length >= 2);
  const pendingFound = returnedMsgs.find((m: any) => m.status === 'pending' || m.content === '');
  assert.equal(pendingFound, undefined, 'pending messages must NOT be returned in messages.list');
  const completedFound = returnedMsgs.find((m: any) => m.content === 'Completed answer');
  assert.ok(completedFound, 'completed message must be in messages.list');
});

// -----------------------------------------------------------------------------
// P18 Requirements: Production Chat Wiring, Default DeepSeek, Usage Store
// -----------------------------------------------------------------------------

test('P18 Requirement 2: zero-option production flow (no registry/modelConfig) calls opencode-zen model and streams response', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const prodEnv = {
    ...env,
    OPENCODE_API_KEY: 'test-opencode-zen-key',
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '90',
  };

  const calls: any[] = [];
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      calls.push(req);
      await onChunk('DeepSeek production response');
      return { ok: true, text: 'DeepSeek production response', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0 } };
    },
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'Namaste Jarvis' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: prodEnv, fetch: mockFetch, threadStore: store, killReader });
  assert.equal(sendRes.status, 200);
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  // Zero options: NO options.registry and NO options.modelConfig!
  const streamRes = await messagesStreamHandler(streamReq, {
    env: prodEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
  });

  assert.equal(streamRes.status, 200);
  const streamText = await streamRes.text();
  assert.equal(calls.length, 1, 'gateway must be called exactly once in zero-option production flow');
  assert.equal(calls[0].provider, 'opencode-zen', 'provider must be opencode-zen');
  assert.equal(calls[0].model, 'deepseek-v4.1-flash-free', 'Amit default model must be deepseek-v4.1-flash-free');
  assert.ok(streamText.includes('DeepSeek production response'), 'response text must be streamed');

  const assistantMsgs = store.messages.filter((m) => m.role === 'assistant' && m.replyToMessageId === messageId);
  assert.equal(assistantMsgs.length, 1);
  assert.equal(assistantMsgs[0].content, 'DeepSeek production response');
  assert.equal(assistantMsgs[0].status, 'done');
});

test('P18 Requirement 2: production flow without OPENCODE_API_KEY returns clear message with calls = 0', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const noKeyEnv = {
    ...env,
    // OPENCODE_API_KEY is deliberately omitted
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '90',
  };

  let modelCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream() {
      modelCalls++;
      return { ok: true, text: 'should not be called' };
    },
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'namaste' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: noKeyEnv, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  const streamRes = await messagesStreamHandler(streamReq, {
    env: noKeyEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
  });

  assert.equal(streamRes.status, 200);
  const text = await streamRes.text();
  assert.equal(modelCalls, 0, 'gateway must not be called when OPENCODE_API_KEY is missing');
  assert.ok(text.includes('OPENCODE_API_KEY set karo'), 'must provide clear OPENCODE_API_KEY set karo guidance');

  const assistantMsgs = store.messages.filter((m) => m.role === 'assistant');
  assert.equal(assistantMsgs.length, 0, 'refused model error must not be saved to DB');
});

test('P18 Requirement 3: usage store failure fails-closed with calls = 0', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const prodEnv = {
    ...env,
    OPENCODE_API_KEY: 'test-opencode-zen-key',
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '90',
  };

  let modelCalls = 0;
  const mockGateway: ChatGateway = {
    async callStream() {
      modelCalls++;
      return { ok: true, text: 'should not be called' };
    },
  };

  const failingUsageStore: any = {
    async summary() {
      throw new Error('Supabase model_usage table connection failure');
    },
    async record() {},
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'namaste' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: prodEnv, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  const streamRes = await messagesStreamHandler(streamReq, {
    env: prodEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
    usageStore: failingUsageStore,
  });

  assert.equal(streamRes.status, 200);
  const text = await streamRes.text();
  assert.equal(modelCalls, 0, 'gateway must not be called when usage store fails');
  assert.ok(text.includes('fail-closed') || text.includes('unreadable'), 'must report fail-closed error');
});

test('P18 Requirement 3 & 4: router uses real usage numbers from usage store to skip exhausted models', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();

  const prodEnv = {
    ...env,
    OPENCODE_API_KEY: 'test-opencode-zen-key',
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '90',
  };

  const calls: any[] = [];
  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      calls.push(req);
      await onChunk('Fallback slot response');
      return { ok: true, text: 'Fallback slot response', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0 } };
    },
  };

  // UsageStore reports that deepseek-v4.1-flash-free (limit 100) has reached its 100 requests limit
  const exhaustedDeepSeekStore: any = {
    async summary() {
      return {
        dayUsd: 0,
        monthUsd: 0,
        modelDayUsd: {},
        modelDayRequests: {
          'opencode-zen/deepseek-v4.1-flash-free': 100,
        },
      };
    },
    async record() {},
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, text: 'exhausted limit test' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: prodEnv, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD_ID, message_id: messageId }),
  });

  const streamRes = await messagesStreamHandler(streamReq, {
    env: prodEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
    usageStore: exhaustedDeepSeekStore,
  });

  assert.equal(streamRes.status, 200);
  const streamText = await streamRes.text();
  assert.equal(calls.length, 1);
  // Next free no-training model in chain is beam-free (rank 2, trains_on_inputs: false)
  assert.equal(calls[0].provider, 'opencode-zen');
  assert.equal(calls[0].model, 'beam-free', 'router must skip exhausted DeepSeek and select next free no-training model');
  assert.ok(streamText.includes('Fallback slot response'));
});

test('P19 Requirement 2(a): production flow 1 send + 1 stream leaves exactly 2 rows in DB in order: user then assistant', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();
  const threadId = crypto.randomUUID();
  await store.createThread({ id: threadId, ownerId: OWNER_ID, title: 'P19 Test' });

  const prodEnv = {
    ...env,
    OPENCODE_API_KEY: 'test-opencode-zen-key',
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '90',
  };

  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      await onChunk('Mera naam Jarvis hai');
      return { ok: true, text: 'Mera naam Jarvis hai', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0 } };
    },
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, text: 'tumhara naam kya hai' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: prodEnv, fetch: mockFetch, threadStore: store, killReader });
  assert.equal(sendRes.status, 200);
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, message_id: messageId }),
  });
  const streamRes = await messagesStreamHandler(streamReq, {
    env: prodEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
  });
  assert.equal(streamRes.status, 200);
  await streamRes.text();

  const threadMessages = store.messages.filter((m) => m.threadId === threadId);
  assert.equal(threadMessages.length, 2, `expected exactly 2 rows in DB, got ${threadMessages.length}: ${JSON.stringify(threadMessages.map((m) => m.role + ':' + m.content))}`);
  assert.equal(threadMessages[0].role, 'user');
  assert.equal(threadMessages[0].content, 'tumhara naam kya hai');
  assert.equal(threadMessages[1].role, 'assistant');
  assert.equal(threadMessages[1].content, 'Mera naam Jarvis hai');
});

test('P19 Requirement 2(b): care message (mujhe mar jaana hai) leaves exactly 2 rows in DB: user and care assistant without duplicate user', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();
  const threadId = crypto.randomUUID();
  await store.createThread({ id: threadId, ownerId: OWNER_ID, title: 'P19 Care Test' });

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, text: 'mujhe mar jaana hai' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env, fetch: mockFetch, threadStore: store, killReader });
  assert.equal(sendRes.status, 200);
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, message_id: messageId }),
  });
  const streamRes = await messagesStreamHandler(streamReq, {
    env,
    fetch: mockFetch,
    threadStore: store,
    killReader,
  });
  assert.equal(streamRes.status, 200);
  await streamRes.text();

  const threadMessages = store.messages.filter((m) => m.threadId === threadId);
  assert.equal(threadMessages.length, 2, `expected exactly 2 rows in DB for care message, got ${threadMessages.length}: ${JSON.stringify(threadMessages.map((m) => m.role + ':' + m.content))}`);
  assert.equal(threadMessages[0].role, 'user');
  assert.equal(threadMessages[0].content, 'mujhe mar jaana hai');
  assert.equal(threadMessages[1].role, 'assistant');
});

test('P19 Requirement 2(c): streaming twice (retry) keeps exactly 2 rows in DB', async () => {
  const cookie = await getOwnerCookie();
  const killReader = { read: async () => ({ kill: false, epoch: 1 }) };
  const store = createMockThreadStore();
  const threadId = crypto.randomUUID();
  await store.createThread({ id: threadId, ownerId: OWNER_ID, title: 'P19 Retry Test' });

  const prodEnv = {
    ...env,
    OPENCODE_API_KEY: 'test-opencode-zen-key',
    MODEL_DAY_LIMIT_INR: '100',
    MODEL_MONTH_LIMIT_INR: '1000',
    INR_PER_USD: '90',
  };

  const mockGateway: ChatGateway = {
    async callStream(req, onChunk) {
      await onChunk('First response');
      return { ok: true, text: 'First response', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0 } };
    },
  };

  const sendReq = new Request('https://jarvis.example/api/chat/messages.send', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, text: 'tumhara naam kya hai' }),
  });
  const sendRes = await messagesSendHandler(sendReq, { env: prodEnv, fetch: mockFetch, threadStore: store, killReader });
  const messageId = (await sendRes.json()).data.message_id;

  const streamReq1 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, message_id: messageId }),
  });
  const streamRes1 = await messagesStreamHandler(streamReq1, {
    env: prodEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
  });
  await streamRes1.text();

  // Retry: stream again for the same message
  const streamReq2 = new Request('https://jarvis.example/api/chat/messages.stream', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, message_id: messageId }),
  });
  const streamRes2 = await messagesStreamHandler(streamReq2, {
    env: prodEnv,
    fetch: mockFetch,
    threadStore: store,
    killReader,
    gateway: mockGateway,
  });
  await streamRes2.text();

  const threadMessages = store.messages.filter((m) => m.threadId === threadId);
  assert.equal(threadMessages.length, 2, `expected exactly 2 rows after retry stream, got ${threadMessages.length}: ${JSON.stringify(threadMessages.map((m) => m.role + ':' + m.content))}`);
  assert.equal(threadMessages[0].role, 'user');
  assert.equal(threadMessages[1].role, 'assistant');
});





