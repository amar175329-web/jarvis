import { ROUTES } from '../../packages/contracts/src/routes.ts';
import { readOwnerSession, clearSessionCookie } from '../auth/index.ts';
import {
  createRlsChatThreadStore,
  handleMessage,
  registerChatProviderAdapters,
  createGeminiProvider,
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
import { startOfDayIST, startOfMonthIST } from '../../packages/locale/src/index.ts';
import { startOfDayInTz } from '../../packages/model-gateway/src/budget.ts';
import {
  toModelSpecs,
  loadDefaultRegistry,
  type ModelEntry,
  type Settings,
  type Usage,
} from '../../packages/models/src/index.ts';

export type ChatOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  gateway?: ChatGateway;
  threadStore?: ChatThreadStore;
  killReader?: KillSwitchReader;
  modelConfig?: ModelRouterConfig;
  usageStore?: UsageStore;
  models?: ModelSpec[];
  registry?: ModelEntry[];
  settings?: Settings;
  usage?: Usage;
  budget?: { perDayUsd?: number; perMonthUsd?: number };
};

type ChatConfig = {
  url: string;
  anonKey: string;
  serviceKey?: string;
  env: Record<string, string | undefined>;
  fetcher: typeof fetch;
};

async function pollForCompletedReply(
  store: ChatThreadStore,
  ownerId: string,
  threadId: string,
  replyToMessageId: string,
  maxWaitMs = 20_000,
  intervalMs = 500,
): Promise<ChatMessage | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    let reply: ChatMessage | null = null;
    if (store.getReplyMessage) {
      reply = await store.getReplyMessage({ ownerId, threadId, replyToMessageId });
    } else {
      const msgs = await store.listMessages({ ownerId, threadId, limit: 20, status: 'all' });
      reply = msgs.find((m) => m.role === 'assistant' && m.replyToMessageId === replyToMessageId) ?? null;
    }
    if (reply && reply.status === 'done') {
      return reply;
    }
    if (!reply) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

function streamCompletedReply(
  completedReply: ChatMessage,
  threadId: string,
  messageId: string,
  headers: Record<string, string>,
): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.started', thread_id: threadId, message_id: messageId })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.delta', thread_id: threadId, message_id: messageId, index: 0, text: completedReply.content })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.completed', thread_id: threadId, message_id: messageId, chunk_count: 1 })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

function streamErrorFrame(
  threadId: string,
  messageId: string,
  code: string,
  headers: Record<string, string>,
): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat.message.error', thread_id: threadId, message_id: messageId, code })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

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
      status: 'done',
    });
    // Requirement 6: Chat history/list mein pending rows mat dikhao (messages.list aur model context mein sirf status 'done').
    const doneRows = rows.filter((r) => r.status !== 'pending');
    // Return in sequence order ascending for clean chat display
    const messages = doneRows.slice().sort((a, b) => a.sequence - b.sequence).map((row) => ({
      id: row.id,
      thread_id: row.threadId,
      role: row.role,
      content: row.content,
      sequence: row.sequence,
      created_at: row.createdAt,
    }));
    const next_before_sequence = doneRows.length === parsed.data.limit && doneRows.length > 0
      ? Math.min(...doneRows.map((r) => r.sequence))
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

  // 1. Check if an assistant reply already exists in DB for this message
  let existingReply: ChatMessage | null = null;
  if (threadStore.getReplyMessage) {
    existingReply = await threadStore.getReplyMessage({
      ownerId: owner.user.id,
      threadId: parsed.data.thread_id,
      replyToMessageId: userMessage.id,
    });
  } else {
    const history = await threadStore.listMessages({ ownerId: owner.user.id, threadId: parsed.data.thread_id, limit: 50, status: 'all' });
    existingReply = history.find((m) => m.role === 'assistant' && m.replyToMessageId === userMessage!.id) ?? null;
  }

  if (existingReply) {
    if (existingReply.status === 'done') {
      return streamCompletedReply(existingReply, parsed.data.thread_id, parsed.data.message_id, headers);
    }
    // Existing reply is 'pending'
    const ageMs = Date.now() - new Date(existingReply.createdAt).getTime();
    if (ageMs > 60_000) {
      // Stale pending row (>60s) from crash: delete it and proceed to acquire new claim
      if (threadStore.deleteMessage) {
        try {
          await threadStore.deleteMessage({
            ownerId: owner.user.id,
            threadId: parsed.data.thread_id,
            messageId: existingReply.id,
          });
        } catch { /* clean ignore */ }
      }
      existingReply = null;
    } else {
      // Active in-flight stream from another instance: wait for it without calling model
      const completed = await pollForCompletedReply(threadStore, owner.user.id, parsed.data.thread_id, userMessage.id);
      if (completed && completed.status === 'done') {
        return streamCompletedReply(completed, parsed.data.thread_id, parsed.data.message_id, headers);
      }
      return streamErrorFrame(parsed.data.thread_id, parsed.data.message_id, 'stream_in_progress', headers);
    }
  }

  // 2. DB-level claim BEFORE model call: insert assistant row with status 'pending'
  let claimRow: ChatMessage | null = null;
  const claimMessageId = crypto.randomUUID();
  try {
    const inserted = await threadStore.appendMessage({
      id: claimMessageId,
      ownerId: owner.user.id,
      threadId: parsed.data.thread_id,
      role: 'assistant',
      content: '',
      replyToMessageId: userMessage.id,
      status: 'pending',
    });
    claimRow = (inserted as ChatMessage) ?? {
      id: claimMessageId,
      threadId: parsed.data.thread_id,
      ownerId: owner.user.id,
      role: 'assistant',
      content: '',
      sequence: 0,
      replyToMessageId: userMessage.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const isUniqueViolation = err?.code === '23505' || /unique|duplicate/i.test(err?.message ?? '');
    if (!isUniqueViolation) {
      // Requirement 7: Unique violation ko chup-chaap nigalna band: saaf code do.
      throw err;
    }
    // Unique violation: lost the concurrent insert race!
  }

  if (!claimRow) {
    // Another instance won the claim race: wait for it without calling model
    const completed = await pollForCompletedReply(threadStore, owner.user.id, parsed.data.thread_id, userMessage.id);
    if (completed && completed.status === 'done') {
      return streamCompletedReply(completed, parsed.data.thread_id, parsed.data.message_id, headers);
    }
    return streamErrorFrame(parsed.data.thread_id, parsed.data.message_id, 'stream_in_progress', headers);
  }

  // Model gateway & budget limits: read strictly from env/settings (MODEL_DAY_LIMIT_INR, MODEL_MONTH_LIMIT_INR)
  const env = c?.env ?? options.env ?? process.env;
  const dayLimitInrStr = env.MODEL_DAY_LIMIT_INR;
  const monthLimitInrStr = env.MODEL_MONTH_LIMIT_INR;
  const hasDayLimit = dayLimitInrStr !== undefined && dayLimitInrStr.trim() !== '' && !Number.isNaN(Number(dayLimitInrStr));
  const hasMonthLimit = monthLimitInrStr !== undefined && monthLimitInrStr.trim() !== '' && !Number.isNaN(Number(monthLimitInrStr));
  const budgetConfigured = hasDayLimit && hasMonthLimit;

  const inrPerUsdVal = env.INR_PER_USD;
  const inrPerUsd = (inrPerUsdVal !== undefined && inrPerUsdVal.trim() !== '') ? Number(inrPerUsdVal) : NaN;

  const usageStore: UsageStore | undefined = options.usageStore ?? (c?.url && c?.serviceKey ? supabaseUsageStore({ url: c.url, serviceKey: c.serviceKey, ownerId: owner.user.id, fetch: c.fetcher }) : undefined);

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
  } else if (Number.isNaN(inrPerUsd) || inrPerUsd <= 0) {
    // CR-3: INR_PER_USD missing / invalid -> refuse model call
    gateway = {
      async callStream() {
        return { ok: false, code: 'budget_exceeded', message: 'INR_PER_USD rate missing: cannot calculate INR budget' };
      },
      async call() {
        return { ok: false, code: 'budget_exceeded', message: 'INR_PER_USD rate missing: cannot calculate INR budget' };
      },
    };
  } else if (!usageStore) {
    // Requirement 2: SERVICE KEY NA HO + budget set: DO NOT fall back to memoryUsageStore! Fail-closed.
    gateway = {
      async callStream() {
        return { ok: false, code: 'budget_exceeded', message: 'SUPABASE_SERVICE_ROLE_KEY missing: persistent usage store required when budget is set' };
      },
      async call() {
        return { ok: false, code: 'budget_exceeded', message: 'SUPABASE_SERVICE_ROLE_KEY missing: persistent usage store required when budget is set' };
      },
    };
  } else {
    const perDayUsd = Number(dayLimitInrStr) / inrPerUsd;
    const perMonthUsd = Number(monthLimitInrStr) / inrPerUsd;

    const loadedRegistry = options.registry
      ? { schema: 1, checked_on: new Date().toISOString(), note: '', models: options.registry }
      : loadDefaultRegistry();

    const rawGateway = createGateway({
      kill: killReader,
      usage: usageStore,
      keys: {
        get(provider) {
          if (provider === 'anthropic') return env.ANTHROPIC_API_KEY;
          if (provider === 'openai') return env.OPENAI_API_KEY;
          if (provider === 'gemini') return env.GEMINI_API_KEY;
          if (provider === 'gemini-free') return env.GEMINI_FREE_API_KEY || env.GEMINI_API_KEY;
          if (provider === 'gemini-paid') return env.GEMINI_PAID_API_KEY || env.GEMINI_API_KEY;
          if (provider === 'opencode-zen') return env.OPENCODE_API_KEY;
          if (provider === 'local') return env.LOCAL_MODEL_TOKEN;
          return undefined;
        },
        envName(provider) {
          if (provider === 'opencode-zen') return 'OPENCODE_API_KEY';
          if (provider === 'gemini-free') return 'GEMINI_FREE_API_KEY';
          if (provider === 'gemini-paid') return 'GEMINI_PAID_API_KEY';
          if (provider === 'local') return 'LOCAL_MODEL_TOKEN';
          return `${provider.toUpperCase()}_API_KEY`;
        },
      },
      providers: [],
      models: options.models ?? toModelSpecs(loadedRegistry, new Date()),
      budget: { perDayUsd, perMonthUsd },
      logger: createLogger({ service: 'chat', sinks: [] }),
    });
    registerChatProviderAdapters(rawGateway, c?.fetcher, {
      url: env.LOCAL_MODEL_URL,
      token: env.LOCAL_MODEL_TOKEN,
    });
    const geminiAdapter = createGeminiProvider(c?.fetcher);
    rawGateway.registerProvider({ ...geminiAdapter, name: 'gemini-free' });
    rawGateway.registerProvider({ ...geminiAdapter, name: 'gemini-paid' });
    gateway = rawGateway;
  }

  const modelConfig = options.modelConfig;

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
        const loadedRegistryForHandle = options.registry
          ? { schema: 1, checked_on: new Date().toISOString(), note: '', models: options.registry }
          : loadDefaultRegistry();

        const activeModels = options.registry ?? loadedRegistryForHandle.models;
        const now = new Date();

        let currentUsage: Usage;
        if (options.usage) {
          currentUsage = options.usage;
        } else if (!isCare && usageStore) {
          try {
            const modelDayStarts: Record<string, Date> = {};
            for (const m of activeModels) {
              const tz = m.limits?.reset_tz ?? 'Asia/Kolkata';
              modelDayStarts[m.id] = startOfDayInTz(now, tz);
            }
            const summary = await usageStore.summary(startOfDayIST(now), startOfMonthIST(now), modelDayStarts);
            currentUsage = {
              dayRequests: summary.modelDayRequests ?? {},
              dayUsd: summary.dayUsd ?? 0,
              monthUsd: summary.monthUsd ?? 0,
            };
          } catch {
            // Requirement 3: Usage padhi na jaye -> model call refuse (fail-closed, spec shart 6)
            if (claimRow.id && threadStore.deleteMessage) {
              try {
                await threadStore.deleteMessage({
                  ownerId: owner.user.id,
                  threadId: parsed.data.thread_id,
                  messageId: claimRow.id,
                });
              } catch { /* clean ignore */ }
            }
            if (!streamStarted) {
              await emit({ type: 'chat.message.started' });
            }
            await emit({
              type: 'chat.message.delta',
              index: 0,
              text: 'Model usage store unreadable (fail-closed); spending is blocked.',
            });
            await emit({ type: 'chat.message.completed' });
            return;
          }
        } else {
          currentUsage = { dayRequests: {}, dayUsd: 0, monthUsd: 0 };
        }

        const result = await handleMessage(chatInput, {
          killSwitch: killReader,
          threads: threadStore,
          ownerId: owner.user.id,
          userMessagePersisted: true,
          gateway,
          modelConfig: options.modelConfig,
          registry: activeModels,
          settings: options.settings ?? {
            paidBigEnabled: false,
            localHealthy: false,
          },
          usage: currentUsage,
          budget: budgetConfigured ? { perDayUsd: Number(dayLimitInrStr) / inrPerUsd, perMonthUsd: Number(monthLimitInrStr) / inrPerUsd } : undefined,
          now,
          hasKey: (provider) => {
            if (provider === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
            if (provider === 'openai') return Boolean(env.OPENAI_API_KEY);
            if (provider === 'gemini') return Boolean(env.GEMINI_API_KEY);
            if (provider === 'gemini-free') return Boolean(env.GEMINI_FREE_API_KEY || env.GEMINI_API_KEY);
            if (provider === 'gemini-paid') return Boolean(env.GEMINI_PAID_API_KEY || env.GEMINI_API_KEY);
            if (provider === 'opencode-zen') return Boolean(env.OPENCODE_API_KEY);
            if (provider === 'local') return Boolean(env.LOCAL_MODEL_TOKEN);
            return false;
          },
          emit,
        });

        if (result.status === 'ok' || result.status === 'care') {
          if (claimRow.id && threadStore.updateMessage) {
            try {
              await threadStore.updateMessage({
                ownerId: owner.user.id,
                threadId: parsed.data.thread_id,
                messageId: claimRow.id,
                content: result.text,
                status: 'done',
              });
            } catch { /* clean ignore */ }
          }
        } else if (result.status === 'needs_model' || result.status === 'failed') {
          // Requirement 4: Agar jeetne wale ka model fail/error ho: pending row DELETE karo (error text save nahi hoga, P12 gap 4 ka niyam), taaki retry chal sake.
          if (claimRow.id && threadStore.deleteMessage) {
            try {
              await threadStore.deleteMessage({
                ownerId: owner.user.id,
                threadId: parsed.data.thread_id,
                messageId: claimRow.id,
              });
            } catch { /* clean ignore */ }
          }
          const fallbackText = result.text || (result.status === 'needs_model'
            ? 'Model slot set nahi hai. Settings mein model configure karein.'
            : 'Model call execute nahi ho saki.');
          if (!streamStarted) {
            await emit({ type: 'chat.message.started' });
          }
          await emit({ type: 'chat.message.delta', index: 0, text: fallbackText });
          await emit({ type: 'chat.message.completed' });
          // ERROR SAVE NAHI: Do not persist fallbackText to chat_messages in DB!
        } else {
          if (claimRow.id && threadStore.deleteMessage) {
            try {
              await threadStore.deleteMessage({
                ownerId: owner.user.id,
                threadId: parsed.data.thread_id,
                messageId: claimRow.id,
              });
            } catch { /* clean ignore */ }
          }
        }
      } catch (err: any) {
        if (claimRow.id && threadStore.deleteMessage) {
          try {
            await threadStore.deleteMessage({
              ownerId: owner.user.id,
              threadId: parsed.data.thread_id,
              messageId: claimRow.id,
            });
          } catch { /* clean ignore */ }
        }
        sendFrame({ type: 'chat.message.error', thread_id: parsed.data.thread_id, message_id: parsed.data.message_id, code: err?.code ?? 'internal_error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers });
}

async function toWebRequest(req: any): Promise<Request> {
  if (req instanceof Request) return req;
  if (req && typeof req.headers?.get === 'function') return req as Request;

  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const url = new URL(req.url || '/', `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers || {})) {
    if (val !== undefined) {
      if (Array.isArray(val)) {
        for (const v of val) headers.append(key, v);
      } else {
        headers.set(key, String(val));
      }
    }
  }

  const method = req.method || 'GET';
  let body: any = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } else if (typeof req[Symbol.asyncIterator] === 'function') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length > 0) {
        body = Buffer.concat(chunks).toString('utf8');
      }
    }
  }

  return new Request(url, {
    method,
    headers,
    body,
  });
}

async function handleChatRequest(request: Request, options: ChatOptions = {}): Promise<Response> {
  const url = new URL(request.url, 'http://localhost');
  const pathname = request.headers.get('x-matched-path') || url.pathname;
  if (pathname.endsWith('/threads.list')) return threadsListHandler(request, options);
  if (pathname.endsWith('/threads.create')) return threadsCreateHandler(request, options);
  if (pathname.endsWith('/messages.list')) return messagesListHandler(request, options);
  if (pathname.endsWith('/messages.send')) return messagesSendHandler(request, options);
  if (pathname.endsWith('/messages.stream')) return messagesStreamHandler(request, options);
  return Response.json({ ok: false, error: { code: 'not_found', message: `chat route not found for ${pathname}` } }, { status: 404 });
}

export async function POST(request: Request, options: ChatOptions = {}): Promise<Response> {
  return handleChatRequest(request, options);
}

export async function GET(request: Request, options: ChatOptions = {}): Promise<Response> {
  return handleChatRequest(request, options);
}

// Default export supporting both Web standard Request and Node.js (req, res)
export default async function handler(req: any, resOrOptions: any = {}): Promise<Response | void> {
  const isNodeRes = resOrOptions && typeof resOrOptions.setHeader === 'function';
  const options: ChatOptions = isNodeRes ? {} : (resOrOptions ?? {});

  try {
    const webRequest = await toWebRequest(req);
    const response = await handleChatRequest(webRequest, options);

    if (isNodeRes) {
      resOrOptions.statusCode = response.status;
      for (const [key, val] of response.headers.entries()) {
        resOrOptions.setHeader(key, val);
      }
      if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resOrOptions.write(Buffer.from(value));
        }
        resOrOptions.end();
      } else {
        const arrayBuffer = await response.arrayBuffer();
        resOrOptions.end(Buffer.from(arrayBuffer));
      }
      return;
    }

    return response;
  } catch (err: any) {
    console.error('CHAT HANDLER FATAL:', err);
    if (isNodeRes) {
      if (!resOrOptions.headersSent) {
        resOrOptions.statusCode = 500;
        resOrOptions.setHeader('content-type', 'application/json');
        resOrOptions.end(JSON.stringify({ ok: false, error: { code: 'internal_error', message: String(err?.message || err) } }));
      }
      return;
    }
    return Response.json({ ok: false, error: { code: 'internal_error', message: String(err?.message || err) } }, { status: 500 });
  }
}
