import type { ChatMessage, ChatThread, ChatThreadStore } from './types.ts';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Row = {
  id: string; thread_id: string; owner_id: string; role: 'user' | 'assistant';
  content: string; sequence: number | string; created_at: string;
};

/**
 * RLS-backed chat_messages and chat_threads adapter. It uses the user's Supabase access token plus the anon key;
 * it deliberately has no service-role option and never falls back to MemoryService or events.
 */
export function createRlsChatThreadStore(input: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  fetcher?: FetchLike;
}): Required<ChatThreadStore> {
  const base = new URL('/rest/v1/chat_messages', input.supabaseUrl);
  const threadsBase = new URL('/rest/v1/chat_threads', input.supabaseUrl);
  const fetcher = input.fetcher ?? fetch;
  const pending = new Map<string, Promise<void>>();

  const headers = (extra: Record<string, string> = {}) => ({
    apikey: input.anonKey,
    authorization: `Bearer ${input.accessToken}`,
    ...extra,
  });
  async function readRows(url: URL): Promise<Row[]> {
    const response = await fetcher(url, { method: 'GET', headers: headers() });
    if (!response.ok) throw new Error('chat RLS read failed');
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows)) throw new Error('chat RLS response invalid');
    return rows as Row[];
  }
  async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    pending.set(key, queued);
    await previous;
    try { return await action(); }
    finally {
      release();
      if (pending.get(key) === queued) pending.delete(key);
    }
  }

  return {
    async listThreads(query) {
      const url = new URL(threadsBase);
      url.searchParams.set('select', 'id,owner_id,title,created_at,updated_at');
      url.searchParams.set('owner_id', `eq.${query.ownerId}`);
      if (query.before) url.searchParams.set('created_at', `lt.${query.before}`);
      url.searchParams.set('order', 'created_at.desc');
      url.searchParams.set('limit', String(Math.max(1, Math.min(100, query.limit ?? 30))));
      const response = await fetcher(url, { method: 'GET', headers: headers() });
      if (!response.ok) throw new Error('chat threads RLS read failed');
      const rows = await response.json() as unknown;
      if (!Array.isArray(rows)) throw new Error('chat threads RLS response invalid');
      return (rows as Array<Record<string, unknown>>).map((r): ChatThread => ({
        id: String(r.id),
        ownerId: String(r.owner_id),
        title: typeof r.title === 'string' ? r.title : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));
    },
    async createThread(inputThread) {
      const threadId = inputThread.id ?? crypto.randomUUID();
      const response = await fetcher(threadsBase, {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json', prefer: 'return=representation' }),
        body: JSON.stringify({
          id: threadId,
          owner_id: inputThread.ownerId,
          title: inputThread.title ?? null,
        }),
      });
      if (!response.ok) throw new Error('chat thread RLS create failed');
      const rows = await response.json() as unknown;
      if (Array.isArray(rows) && rows[0]) {
        const r = rows[0] as Record<string, unknown>;
        return {
          id: String(r.id),
          ownerId: String(r.owner_id),
          title: typeof r.title === 'string' ? r.title : null,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        };
      }
      const now = new Date().toISOString();
      return {
        id: threadId,
        ownerId: inputThread.ownerId,
        title: inputThread.title ?? null,
        createdAt: now,
        updatedAt: now,
      };
    },
    async listMessages(query) {
      const url = new URL(base);
      url.searchParams.set('select', 'id,thread_id,owner_id,role,content,sequence,created_at');
      url.searchParams.set('owner_id', `eq.${query.ownerId}`);
      url.searchParams.set('thread_id', `eq.${query.threadId}`);
      if (query.beforeSequence !== undefined) {
        url.searchParams.set('sequence', `lt.${query.beforeSequence}`);
      }
      url.searchParams.set('order', 'sequence.desc');
      url.searchParams.set('limit', String(Math.max(1, Math.min(100, query.limit))));
      const rows = await readRows(url);
      return rows.map((row): ChatMessage => ({
        id: row.id,
        threadId: row.thread_id,
        ownerId: row.owner_id,
        role: row.role,
        content: row.content,
        sequence: Number(row.sequence),
        createdAt: row.created_at,
      }));
    },
    async appendMessage(message) {
      await serial(`${message.ownerId}:${message.threadId}`, async () => {
        const latest = new URL(base);
        latest.searchParams.set('select', 'sequence');
        latest.searchParams.set('owner_id', `eq.${message.ownerId}`);
        latest.searchParams.set('thread_id', `eq.${message.threadId}`);
        latest.searchParams.set('order', 'sequence.desc');
        latest.searchParams.set('limit', '1');
        const rows = await readRows(latest);
        const sequence = rows.length ? Number(rows[0]!.sequence) + 1 : 0;
        const response = await fetcher(base, {
          method: 'POST',
          headers: headers({ 'content-type': 'application/json', prefer: 'return=minimal' }),
          body: JSON.stringify({
            owner_id: message.ownerId,
            thread_id: message.threadId,
            role: message.role,
            content: message.content,
            sequence,
          }),
        });
        if (!response.ok) throw new Error('chat RLS write failed');
      });
    },
  };
}
