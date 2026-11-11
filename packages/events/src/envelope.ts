// The ONE event envelope every squad uses. Matches public.events (0001_core.sql + 0003).
import { z } from 'zod';

export const EVENT_TYPE_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/; // same rule as the database check
export const MAX_PAYLOAD_BYTES = 16384; // same limit as the database (free-tier guard, decision 009)
export const ENVELOPE_VERSION = 1;

export const EnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().regex(EVENT_TYPE_RE, 'event type must be dot.case, e.g. task.created'),
  source: z.string().min(1).max(100), // who sent it: 'phone', 'api.core-workspace', 'worker'
  ts: z.string().datetime({ offset: true }), // stored as UTC; shown as Asia/Kolkata by the UI
  payload: z.record(z.unknown()),
  correlation_id: z.string().uuid().optional(), // ties all events of one job together
  version: z.literal(ENVELOPE_VERSION),
  idempotency_key: z.string().min(1).max(128).optional(), // same key again = same event, stored once
}).strict();

export type Envelope = z.infer<typeof EnvelopeSchema>;

export function payloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}
