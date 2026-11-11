import type { Envelope } from './envelope.ts';

export type StoredEventResult = { event_id: string; duplicate: boolean };
export interface EventStore {
  consumeRateLimit(ownerId: string): Promise<boolean>;
  insert(ownerId: string, event: Envelope, live: boolean): Promise<StoredEventResult>;
  list(ownerId: string, options: { type?: string; before?: string; limit: number }): Promise<Envelope[]>;
}

/** Supabase PostgREST adapter. Uses service_role only on the server. */
export function supabaseEventStore(o: { url: string; serviceKey: string; fetch?: typeof fetch; limitPerMinute?: number }): EventStore {
  const f = o.fetch ?? fetch;
  const base = o.url.replace(/\/$/, '');
  const headers = { apikey: o.serviceKey, Authorization: `Bearer ${o.serviceKey}`, 'content-type': 'application/json' };
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await f(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status} on ${String(init.method ?? 'GET')} ${path.split('?')[0]}`);
    return response;
  }
  return {
    async consumeRateLimit(ownerId) {
      const response = await request('rpc/consume_event_rate_limit', {
        method: 'POST', body: JSON.stringify({ p_owner_id: ownerId, p_limit: o.limitPerMinute ?? 60, p_window_seconds: 60 }),
      });
      const value = await response.json();
      if (typeof value !== 'boolean') throw new Error('event rate-limit RPC returned an invalid result');
      return value;
    },
    async insert(ownerId, event, live) {
      const row = {
        id: event.id, owner_id: ownerId, type: event.type, source: event.source, ts: event.ts,
        payload: event.payload, correlation_id: event.correlation_id ?? null,
        version: event.version, realtime: live, idempotency_key: event.idempotency_key,
      };
      const key = encodeURIComponent(event.idempotency_key!);
      const response = await request('events?on_conflict=owner_id%2Cidempotency_key', {
        method: 'POST', body: JSON.stringify(row),
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      });
      const inserted = await response.json() as { id: string }[];
      if (Array.isArray(inserted) && inserted[0]?.id) return { event_id: inserted[0].id, duplicate: false };
      const existingResponse = await request(`events?select=id&owner_id=eq.${encodeURIComponent(ownerId)}&idempotency_key=eq.${key}&limit=1`);
      const existing = await existingResponse.json() as { id: string }[];
      if (!Array.isArray(existing) || !existing[0]?.id) throw new Error('idempotent event row could not be recovered');
      return { event_id: existing[0].id, duplicate: true };
    },
    async list(ownerId, options) {
      const q = new URLSearchParams({ select: 'id,type,source,ts,payload,correlation_id,version,idempotency_key', owner_id: `eq.${ownerId}`, order: 'ts.desc', limit: String(options.limit) });
      if (options.type) q.set('type', `eq.${options.type}`);
      if (options.before) q.set('ts', `lt.${options.before}`);
      const response = await request(`events?${q.toString()}`);
      return await response.json() as Envelope[];
    },
  };
}
