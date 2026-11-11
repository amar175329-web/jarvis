import { validateEvent } from './validate.ts';
import type { Envelope } from './envelope.ts';
import type { EventStore } from './store.ts';

export type EmitResult =
  | { ok: true; event_id: string; duplicate: boolean; live: boolean }
  | { ok: false; code: 'bad_request' | 'payload_too_large' | 'rate_limited' | 'unavailable'; message: string };

export async function emitEvent(store: EventStore, ownerId: string, input: unknown): Promise<EmitResult> {
  const checked = validateEvent(input);
  if (!checked.ok) {
    const code = checked.error.code === 'payload_too_large' ? 'payload_too_large' : 'bad_request';
    return { ok: false, code, message: checked.error.message };
  }
  const event: Envelope = checked.event;
  if (!event.idempotency_key) return { ok: false, code: 'bad_request', message: 'idempotency_key is required' };
  try {
    if (!(await store.consumeRateLimit(ownerId))) return { ok: false, code: 'rate_limited', message: 'event rate limit reached; keep the event queued and retry later' };
    const saved = await store.insert(ownerId, event, checked.live);
    return { ok: true, ...saved, live: checked.live };
  } catch {
    return { ok: false, code: 'unavailable', message: 'event storage is unavailable; keep the event queued and retry later' };
  }
}
