import { validateEvent } from './validate.ts';
import type { Envelope } from './envelope.ts';

export type OutboxStore = {
  /** Insert only once per idempotency key. */
  put(event: Envelope): Promise<'created' | 'duplicate'>;
  /** Oldest first; implementations must preserve insertion order. */
  list(limit: number): Promise<Envelope[]>;
  remove(idempotencyKey: string): Promise<void>;
  count(): Promise<number>;
};

export type SendResult = { ok: true } | { ok: false; status?: number };
export type FlushResult = { sent: number; remaining: number; stoppedBy: 'empty' | 'transport' | 'server' | 'client' };

/** A portable offline event queue. Browser and Android supply their own durable OutboxStore. */
export class EventOutbox {
  private readonly store: OutboxStore;
  constructor(store: OutboxStore) { this.store = store; }

  async enqueue(input: unknown): Promise<'created' | 'duplicate'> {
    const checked = validateEvent(input);
    if (!checked.ok) throw new Error(`event rejected: ${checked.error.code}`);
    const key = checked.event.idempotency_key;
    if (!key) throw new Error('offline events require idempotency_key');
    return this.store.put(checked.event);
  }

  /** On any failed send the event stays queued; replay is safe because the server is idempotent. */
  async flush(send: (event: Envelope) => Promise<SendResult>, batchSize = 25): Promise<FlushResult> {
    const batch = await this.store.list(Math.max(1, Math.min(100, Math.trunc(batchSize))));
    if (!batch.length) return { sent: 0, remaining: await this.store.count(), stoppedBy: 'empty' };
    let sent = 0;
    let stoppedBy: FlushResult['stoppedBy'] = 'empty';
    for (const event of batch) {
      let result: SendResult;
      try { result = await send(event); }
      catch { stoppedBy = 'transport'; break; }
      if (result.ok) {
        await this.store.remove(event.idempotency_key!);
        sent++;
        continue;
      }
      stoppedBy = result.status === undefined || result.status >= 500 || result.status === 429 ? 'server' : 'client';
      break;
    }
    return { sent, remaining: await this.store.count(), stoppedBy };
  }
}

/** HTTP transport for the owner/device event endpoint. Credentials remain in HttpOnly cookies. */
export function eventHttpTransport(fetcher: typeof fetch = fetch, endpoint = '/api/system/events.emit') {
  return async (event: Envelope): Promise<SendResult> => {
    const response = await fetcher(endpoint, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(event),
    });
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  };
}
