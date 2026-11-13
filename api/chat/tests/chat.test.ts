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
    async appendMessage(m) {
      const created = {
        id: crypto.randomUUID(),
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

