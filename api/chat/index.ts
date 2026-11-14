import { ROUTES } from '../../packages/contracts/src/routes.ts';
import { readOwnerSession, clearSessionCookie } from '../auth/index.ts';
import {
  createRlsChatThreadStore,
  handleMessage,
  registerChatProviderAdapters,
  EMPTY_MODEL_ROUTER_CONFIG,
  type ChatInput,
  type ChatThreadStore,
  type ChatGateway,
  type ModelRouterConfig,
  type ChatStreamEvent,
  type ChatMessage,
} from '../../packages/chat/src/index.ts';
import { createGateway } from '../../packages/model-gateway/src/gateway.ts';
import { supabaseUsageStore, memoryUsageStore } from '../../packages/model-gateway/src/stores.ts';
import type { UsageStore, ModelSpec } from '../../packages/model-gateway/src/types.ts';
import { emitEvent, supabaseEventStore } from '../../packages/events/src/index.ts';
import { createLogger } from '../../packages/logging/src/index.ts';
import { detectCareSignal } from '../../packages/chat/src/care.ts';
import type { KillSwitchReader, KillState } from '../../shared/src/index.ts';

export type ChatOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  gateway?: ChatGateway;
  threadStore?: ChatThreadStore;
  killReader?: KillSwitchReader;
  modelConfig?: ModelRouterConfig;
  usageStore?: UsageStore;
  models?: ModelSpec[];
};

type ChatConfig = {
  url: string;
  anonKey: string;
  serviceKey?: string;
  env: Record<string, string | undefined>;
  fetcher: typeof fetch;
};

const DEFAULT_MODEL_SPECS: ModelSpec[] = [
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', price: { in_per_mtok: 3, out_per_mtok: 15 } },
  { provider: 'anthropic', model: 'claude', price: { in_per_mtok: 3, out_per_mtok: 15 } },
  { provider: 'gemini', model: 'gemini-1.5-flash', free: true, maxRequestsPerDay: 1500 },
  { provider: 'gemini', model: 'gemini-2.0-flash-exp', free: true, maxRequestsPerDay: 1500 },
  { provider: 'openai', model: 'gpt-4o-mini', price: { in_per_mtok: 0.15, out_per_mtok: 0.6 } },
  { provider: 'openai', model: 'gpt-4o', price: { in_per_mtok: 2.5, out_per_mtok: 10 } },
];

function config(options: ChatOptions): ChatConfig | null {
  const env = options.env ?? process.env;
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceKey, env, fetcher: options.fetch ?? fetch };
}

function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers });
}

function fail(status: number, code: string, message: string, headers: HeadersInit = {}) {
  return json(status, { ok: false, error: { code, message } }, { 'cache-control': 'no-store', ...headers });
}

function method(request: Request, expected: string) {
  return request.method === expected ? null : fail(405, 'bad_request', `method not allowed; use ${expected}`);
}

async function bodyJson(request: Request): Promise<any | null> {
  const n = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(n) && n > 50_000) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 50_000) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function preserveRotatedCookie(response: Response, setCookie?: string): Response {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.set('set-cookie', setCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function defaultKillReader(c: ChatConfig, defaultOwnerId?: string): KillSwitchReader {
  return {
    async read(ownerId?: string): Promise<KillState> {
      const oid = ownerId ?? defaultOwnerId;
      try {
        const url = new URL(`${c.url}/rest/v1/system_state`);
        const search: Record<string, string> = { select: 'kill,epoch', id: 'eq.1', limit: '1' };
        if (oid) search.owner_id = `eq.${oid}`;
        url.search = new URLSearchParams(search).toString();
        const key = c.serviceKey || c.anonKey;
        const headers: Record<string, string> = { apikey: key };
        if (key.includes('.')) headers.Authorization = `Bearer ${key}`;
        const r = await c.fetcher(url, { headers });
        if (!r.ok) return { kill: true, epoch: -1 };
        const rows = await r.json() as any[];
        if (Array.isArray(rows) && rows[0] && typeof rows[0].kill === 'boolean') {
          return { kill: rows[0].kill, epoch: rows[0].epoch ?? 0 };
        }
      } catch { /* fail-closed */ }
      return { kill: true, epoch: -1 };
    },
  };
}

async function emitMetadataEvent(c: ChatConfig | null, ownerId: string, type: string, payload: Record<string, unknown>) {
  if (!c?.serviceKey) return;
  try {
    const store = supabaseEventStore({ url: c.url, serviceKey: c.serviceKey, fetch: c.fetcher, limitPerMinute: 120 });
    const envelope = {
      type,
      payload,
      idempotency_key: crypto.randomUUID(),
    };
    await emitEvent(store, ownerId, envelope);
  } catch {
    // Audit/metadata event failures must not fail user chat requests.
  }
}

// Route: chat.threads.list (POST /api/chat/threads.list)
export async function threadsListHandler(request: Request, options: ChatOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options);
  const owner = await readOwnerSession(request, { env: c?.env ?? options.env, fetch: c?.fetcher ?? options.fetch });
  if (!owner.ok) return fail(owner.status, owner.status === 401 ? 'unauthorized' : owner.status === 403 ? 'forbidden' : 'unavailable', owner.message, owner.clearCookie ? { 'set-cookie': clearSessionCookie() } : {});
  if (!c && !options.threadStore) return fail(503, 'unavailable', 'chat API is not configured');

  const body = (await bodyJson(request)) ?? {};
  const parsed = ROUTES['chat.threads.list'].input.safeParse(body);
  if (!parsed.success) return preserveRotatedCookie(fail(400, 'bad_request', 'invalid threads list request'), owner.setCookie);

  const store = options.threadStore ?? createRlsChatThreadStore({ supabaseUrl: c!.url, anonKey: c!.anonKey, accessToken: owner.accessToken, fetcher: c!.fetcher });
  try {
    const threads = store.listThreads ? await store.listThreads({ ownerId: owner.user.id, before: parsed.data.before, limit: parsed.data.limit }) : [];
    const next_before = threads.length === parsed.data.limit ? threads[threads.length - 1]?.createdAt : undefined;
    return preserveRotatedCookie(json(200, { ok: true, data: { threads, next_before } }, { 'cache-control': 'no-store' }), owner.setCookie);
  } catch {
    return preserveRotatedCookie(fail(503, 'unavailable', 'threads list is unavailable'), owner.setCookie);
  }
}

// Route: chat.threads.create (POST /api/chat/threads.create)
export async function threadsCreateHandler(request: Request, options: ChatOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options);
  const owner = await readOwnerSession(request, { env: c?.env ?? options.env, fetch: c?.fetcher ?? options.fetch });
  if (!owner.ok) return fail(owner.status, owner.status === 401 ? 'unauthorized' : owner.status === 403 ? 'forbidden' : 'unavailable', owner.message, owner.clearCookie ? { 'set-cookie': clearSessionCookie() } : {});
  if (!c && !options.threadStore) return fail(503, 'unavailable', 'chat API is not configured');

  const body = (await bodyJson(request)) ?? {};
  const parsed = ROUTES['chat.threads.create'].input.safeParse(body);
  if (!parsed.success) return preserveRotatedCookie(fail(400, 'bad_request', 'invalid thread create request'), owner.setCookie);

  const store = options.threadStore ?? createRlsChatThreadStore({ supabaseUrl: c!.url, anonKey: c!.anonKey, accessToken: owner.accessToken, fetcher: c!.fetcher });
  try {
    const thread = store.createThread ? await store.createThread({ ownerId: owner.user.id, title: parsed.data.title ?? null }) : {
      id: crypto.randomUUID(), ownerId: owner.user.id, title: parsed.data.title ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await emitMetadataEvent(c, owner.user.id, 'chat.thread.created', { thread_id: thread.id });
    return preserveRotatedCookie(json(200, { ok: true, data: { thread } }, { 'cache-control': 'no-store' }), owner.setCookie);
  } catch {
    return preserveRotatedCookie(fail(503, 'unavailable', 'thread creation failed'), owner.setCookie);
  }
}

// Route: chat.messages.list (POST /api/chat/messages.list)
export async function messagesListHandler(request: Request, options: ChatOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options);
  const owner = await readOwnerSession(request, { env: c?.env ?? options.env, fetch: c?.fetcher ?? options.fetch });
  if (!owner.ok) return fail(owner.status, owner.status === 401 ? 'unauthorized' : owner.status === 403 ? 'forbidden' : 'unavailable', owner.message, owner.clearCookie ? { 'set-cookie': clearSessionCookie() } : {});
  if (!c && !options.threadStore) return fail(503, 'unavailable', 'chat API is not configured');

  const body = await bodyJson(request);
  const parsed = ROUTES['chat.messages.list'].input.safeParse(body);
  if (!parsed.success) return preserveRotatedCookie(fail(400, 'bad_request', 'invalid messages list request'), owner.setCookie);

  const store = options.threadStore ?? createRlsChatThreadStore({ supabaseUrl: c!.url, anonKey: c!.anonKey, accessToken: owner.accessToken, fetcher: c!.fetcher });
  try {
    const rows = await store.listMessages({
      ownerId: owner.user.id,
      threadId: parsed.data.thread_id,
      limit: parsed.data.limit,
      beforeSequence: parsed.data.before_sequence,
    });
    // Return in sequence order ascending for clean chat display
    const messages = rows.slice().sort((a, b) => a.sequence - b.sequence).map((row) => ({
      id: row.id,
      thread_id: row.threadId,
      role: row.role,
      content: row.content,
      sequence: row.sequence,
      created_at: row.createdAt,
    }));
    const next_before_sequence = rows.length === parsed.data.limit && rows.length > 0
      ? Math.min(...rows.map((r) => r.sequence))
      : undefined;
    return preserveRotatedCookie(json(200, { ok: true, data: { messages, next_before_sequence } }, { 'cache-control': 'no-store' }), owner.setCookie);
  } catch {
    return preserveRotatedCookie(fail(503, 'unavailable', 'message list is unavailable'), owner.setCookie);
  }
}

// Route: chat.messages.send (POST /api/chat/messages.send)
export async function messagesSendHandler(request: Request, options: ChatOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options);
  const owner = await readOwnerSession(request, { env: c?.env ?? options.env, fetch: c?.fetcher ?? options.fetch });
  if (!owner.ok) return fail(owner.status, owner.status === 401 ? 'unauthorized' : owner.status === 403 ? 'forbidden' : 'unavailable', owner.message, owner.clearCookie ? { 'set-cookie': clearSessionCookie() } : {});

  // Check kill switch (fail-closed)
  const killReader = options.killReader ?? (c ? defaultKillReader(c, owner.user.id) : null);
  if (!killReader) {
    return preserveRotatedCookie(fail(503, 'unavailable', 'kill switch reader is unavailable (fail-closed)'), owner.setCookie);
  }
  let killState: KillState;
  try {
    killState = await killReader.read(owner.user.id);
  } catch {
    return preserveRotatedCookie(fail(503, 'unavailable', 'kill switch unreadable'), owner.setCookie);
  }

  const body = await bodyJson(request);
  const parsed = ROUTES['chat.messages.send'].input.safeParse(body);
  if (!parsed.success) return preserveRotatedCookie(fail(400, 'bad_request', 'invalid message send payload'), owner.setCookie);

  const isCare = detectCareSignal(parsed.data.text);
  if (killState.kill && !isCare) {
    return preserveRotatedCookie(fail(403, 'kill_switch_on', 'Kill switch ON hai, main kuch nahi kar raha.'), owner.setCookie);
  }

  const store = options.threadStore ?? (c ? createRlsChatThreadStore({ supabaseUrl: c.url, anonKey: c.anonKey, accessToken: owner.accessToken, fetcher: c.fetcher }) : null);
  if (!store) {
    return preserveRotatedCookie(fail(503, 'unavailable', 'chat thread store is not configured'), owner.setCookie);
  }

  const message_id = parsed.data.message_id ?? crypto.randomUUID();
  const thread_id = parsed.data.thread_id;

  try {
    await store.appendMessage({
      id: message_id,
      ownerId: owner.user.id,
      threadId: thread_id,
      role: 'user',
      content: parsed.data.text,
    });
  } catch {
    return preserveRotatedCookie(fail(503, 'unavailable', 'failed to append message to thread store'), owner.setCookie);
  }

  // Emit metadata-only event
  await emitMetadataEvent(c, owner.user.id, 'chat.message.created', { thread_id, message_id, role: 'user' });
  if (parsed.data.attachments) {
    for (const att of parsed.data.attachments) {
      await emitMetadataEvent(c, owner.user.id, 'chat.attachment.referenced', {
        thread_id,
        message_id,
        attachment_id: att.id,
        mime_type: att.mime_type,
      });
    }
  }

  return preserveRotatedCookie(json(200, {
    ok: true,
    data: {
      accepted: true,
      thread_id,
      message_id,
      stream_path: '/api/chat/messages.stream',
    },
  }, { 'cache-control': 'no-store' }), owner.setCookie);
}

// Route: chat.messages.stream (POST /api/chat/messages.stream) - SSE
export async function messagesStreamHandler(request: Request, options: ChatOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options);
  const owner = await readOwnerSession(request, { env: c?.env ?? options.env, fetch: c?.fetcher ?? options.fetch });
  if (!owner.ok) return fail(owner.status, owner.status === 401 ? 'unauthorized' : owner.status === 403 ? 'forbidden' : 'unavailable', owner.message, owner.clearCookie ? { 'set-cookie': clearSessionCookie() } : {});

  // Check kill switch (fail-closed)
  const killReader = options.killReader ?? (c ? defaultKillReader(c, owner.user.id) : null);
  if (!killReader) {
    return preserveRotatedCookie(fail(503, 'unavailable', 'kill switch reader is unavailable (fail-closed)'), owner.setCookie);
  }
  let killState: KillState;
  try {
    killState = await killReader.read(owner.user.id);
  } catch {
    return preserveRotatedCookie(fail(503, 'unavailable', 'kill switch unreadable'), owner.setCookie);
  }

  const body = await bodyJson(request);
  const parsed = ROUTES['chat.messages.stream'].input.safeParse(body);
  if (!parsed.success) return preserveRotatedCookie(fail(400, 'bad_request', 'invalid stream request payload'), owner.setCookie);

  const threadStore = options.threadStore ?? (c ? createRlsChatThreadStore({ supabaseUrl: c.url, anonKey: c.anonKey, accessToken: owner.accessToken, fetcher: c.fetcher }) : null);
  if (!threadStore) {
    return preserveRotatedCookie(fail(503, 'unavailable', 'chat thread store is not configured'), owner.setCookie);
  }

  let userMessage: ChatMessage | null = null;
  if (threadStore.getMessage) {
    userMessage = await threadStore.getMessage({ ownerId: owner.user.id, threadId: parsed.data.thread_id, messageId: parsed.data.message_id });
  } else {
    const rows = await threadStore.listMessages({ ownerId: owner.user.id, threadId: parsed.data.thread_id, limit: 100 });
    userMessage = rows.find((m) => m.id === parsed.data.message_id) ?? null;
  }
  if (!userMessage) {
    return preserveRotatedCookie(fail(404, 'not_found', 'message stream not found or expired'), owner.setCookie);
  }

  const isCare = detectCareSignal(userMessage.content);
  if (killState.kill && !isCare) {
    return preserveRotatedCookie(fail(403, 'kill_switch_on', 'Kill switch ON hai, main kuch nahi kar raha.'), owner.setCookie);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (owner.setCookie) headers['set-cookie'] = owner.setCookie;

  // Idempotency: check if an assistant reply already exists following this user message in this thread
  const history = await threadStore.listMessages({ ownerId: owner.user.id, threadId: parsed.data.thread_id, limit: 50 });
  const existingReply = history.find((m) => m.role === 'assistant' && m.sequence > userMessage!.sequence);

  if (existingReply) {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.started', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.delta', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, index: 0, text: existingReply.content })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.completed', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, chunk_count: 1 })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers });
  }

  // Model gateway & budget limits: read strictly from env/settings (MODEL_DAY_LIMIT_INR, MODEL_MONTH_LIMIT_INR)
  const env = c?.env ?? options.env ?? process.env;
  const dayLimitInrStr = env.MODEL_DAY_LIMIT_INR;
  const monthLimitInrStr = env.MODEL_MONTH_LIMIT_INR;
  const hasDayLimit = dayLimitInrStr !== undefined && dayLimitInrStr.trim() !== '' && !Number.isNaN(Number(dayLimitInrStr));
  const hasMonthLimit = monthLimitInrStr !== undefined && monthLimitInrStr.trim() !== '' && !Number.isNaN(Number(monthLimitInrStr));
  const budgetConfigured = hasDayLimit && hasMonthLimit;

  let gateway: ChatGateway;
  if (options.gateway) {
    gateway = options.gateway;
  } else if (!budgetConfigured) {
    // Budget is not set in env/settings: refuse model call ("budget set nahi hai"), strictly no guessing
    gateway = {
      async callStream() {
        return { ok: false, code: 'budget_exceeded', message: 'budget set nahi hai: MODEL_DAY_LIMIT_INR aur MODEL_MONTH_LIMIT_INR set karein' };
      },
      async call() {
        return { ok: false, code: 'budget_exceeded', message: 'budget set nahi hai: MODEL_DAY_LIMIT_INR aur MODEL_MONTH_LIMIT_INR set karein' };
      },
    };
  } else {
    const inrPerUsd = Number(env.INR_PER_USD ?? '84');
    const perDayUsd = Number(dayLimitInrStr) / inrPerUsd;
    const perMonthUsd = Number(monthLimitInrStr) / inrPerUsd;

    const usageStore = options.usageStore ?? (c?.serviceKey
      ? supabaseUsageStore({ url: c.url, serviceKey: c.serviceKey, ownerId: owner.user.id, fetch: c.fetcher })
      : memoryUsageStore());

    const rawGateway = createGateway({
      kill: killReader,
      usage: usageStore,
      keys: {
        get(provider) {
          if (provider === 'anthropic') return env.ANTHROPIC_API_KEY;
          if (provider === 'openai') return env.OPENAI_API_KEY;
          if (provider === 'gemini') return env.GEMINI_API_KEY;
          return undefined;
        },
        envName(provider) { return `${provider.toUpperCase()}_API_KEY`; },
      },
      providers: [],
      models: options.models ?? DEFAULT_MODEL_SPECS,
      budget: { perDayUsd, perMonthUsd },
      logger: createLogger({ service: 'chat', sinks: [] }),
    });
    registerChatProviderAdapters(rawGateway, c?.fetcher);
    gateway = rawGateway;
  }

  const modelConfig = options.modelConfig ?? EMPTY_MODEL_ROUTER_CONFIG;

  const chatInput: ChatInput = {
    threadId: parsed.data.thread_id,
    messageId: userMessage.id,
    text: userMessage.content,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let chunkCount = 0;
      let streamStarted = false;

      const sendFrame = (frame: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      };

      const emit = async (event: ChatStreamEvent) => {
        if (event.type === 'chat.message.started') {
          streamStarted = true;
          sendFrame({ type: 'chat.message.started', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id });
          await emitMetadataEvent(c, owner.user.id, 'chat.message.started', { thread_id: parsed.data.thread_id, message_id: parsed.data.message_id });
        } else if (event.type === 'chat.message.delta') {
          if (!streamStarted) {
            streamStarted = true;
            sendFrame({ type: 'chat.message.started', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id });
            await emitMetadataEvent(c, owner.user.id, 'chat.message.started', { thread_id: parsed.data.thread_id, message_id: parsed.data.message_id });
          }
          chunkCount++;
          sendFrame({ type: 'chat.message.delta', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, index: event.index, text: event.text });
          await emitMetadataEvent(c, owner.user.id, 'chat.message.delta', { thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, index: event.index });
        } else if (event.type === 'chat.message.completed') {
          sendFrame({ type: 'chat.message.completed', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, chunk_count: chunkCount });
          await emitMetadataEvent(c, owner.user.id, 'chat.message.completed', { thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, chunk_count: chunkCount });
        } else if (event.type === 'chat.message.error') {
          sendFrame({ type: 'chat.message.error', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, code: event.code });
          await emitMetadataEvent(c, owner.user.id, 'chat.message.error', { thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, code: event.code });
        }
      };

      try {
        const result = await handleMessage(chatInput, {
          killSwitch: killReader,
          threads: threadStore,
          ownerId: owner.user.id,
          gateway,
          modelConfig,
          emit,
        });

        if (result.status === 'needs_model' || result.status === 'failed') {
          // Model slot is unconfigured, or budget limit exceeded / budget not set
          const fallbackText = result.text || (result.status === 'needs_model'
            ? 'Model slot set nahi hai. Settings mein model configure karein.'
            : 'Model call execute nahi ho saki.');
          if (!streamStarted) {
            await emit({ type: 'chat.message.started' });
          }
          await emit({ type: 'chat.message.delta', index: 0, text: fallbackText });
          await emit({ type: 'chat.message.completed' });
          try {
            await threadStore.appendMessage({ ownerId: owner.user.id, threadId: parsed.data.thread_id, role: 'assistant', content: fallbackText });
          } catch { /* persistence failure handled cleanly */ }
        }
      } catch (err: any) {
        sendFrame({ type: 'chat.message.error', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, code: err?.code ?? 'internal_error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers });
}

// Default export routing all chat endpoints when consolidated on Vercel
export default async function handler(request: Request, options: ChatOptions = {}): Promise<Response> {
  const url = new URL(request.url);
  const pathname = request.headers.get('x-matched-path') || url.pathname;
  if (pathname.endsWith('/threads.list')) return threadsListHandler(request, options);
  if (pathname.endsWith('/threads.create')) return threadsCreateHandler(request, options);
  if (pathname.endsWith('/messages.list')) return messagesListHandler(request, options);
  if (pathname.endsWith('/messages.send')) return messagesSendHandler(request, options);
  if (pathname.endsWith('/messages.stream')) return messagesStreamHandler(request, options);
  return Response.json({ ok: false, error: { code: 'not_found', message: `chat route not found for ${pathname}` } }, { status: 404 });
}
