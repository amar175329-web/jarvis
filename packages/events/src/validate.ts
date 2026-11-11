// validateEvent: the one gate for every event. Returns a result, never throws.
import { EnvelopeSchema, MAX_PAYLOAD_BYTES, payloadBytes, type Envelope } from './envelope.ts';
import { EVENT_TYPES, type EventTypeName, type LiveTable } from './registry.ts';

export type ValidateError = { code: 'bad_envelope' | 'unknown_type' | 'bad_payload' | 'payload_too_large'; message: string; issues?: unknown };
export type ValidateResult =
  | { ok: true; event: Envelope; live: boolean; liveVia?: LiveTable }
  | { ok: false; error: ValidateError };

export function validateEvent(input: unknown): ValidateResult {
  const env = EnvelopeSchema.safeParse(input);
  if (!env.success) return { ok: false, error: { code: 'bad_envelope', message: 'envelope is not valid', issues: env.error.issues } };
  const event = env.data;
  if (!Object.hasOwn(EVENT_TYPES, event.type)) return { ok: false, error: { code: 'unknown_type', message: `event type '${event.type}' is not in the registry` } };
  if (payloadBytes(event.payload) >= MAX_PAYLOAD_BYTES) return { ok: false, error: { code: 'payload_too_large', message: `payload must be under ${MAX_PAYLOAD_BYTES} bytes` } };
  const def = EVENT_TYPES[event.type as EventTypeName];
  const p = def.payload.safeParse(event.payload);
  if (!p.success) return { ok: false, error: { code: 'bad_payload', message: `payload does not match '${event.type}'`, issues: p.error.issues } };
  return def.live ? { ok: true, event, live: true, liveVia: def.liveVia } : { ok: true, event, live: false };
}
