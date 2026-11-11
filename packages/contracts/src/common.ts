import { z } from 'zod';
import { EnvelopeSchema } from '../../events/src/index.ts';

export const Uuid = z.string().uuid();
export const UtcTime = z.string().datetime({ offset: true });
export const IdempotencyKey = z.string().min(1).max(128);
export const Empty = z.object({}).strict();

// ----- named shapes (generated once in Kotlin, reused by many routes) -----
export const DeviceKind = z.enum(['phone', 'tv', 'computer', 'agent', 'machine-agent']); // same list as devices.kind in the database
export const PhoneCommandState = z.enum(['queued', 'sent', 'running', 'done', 'failed', 'cancelled', 'expired']); // same as phone_commands.state

export const Device = z.object({
  id: Uuid, name: z.string().min(1).max(100), kind: DeviceKind,
  paired_at: UtcTime, last_seen: UtcTime.optional(), revoked_at: UtcTime.optional(),
}).strict();

// The phone command body. Which `op` values exist belongs to S16A/S16B; S00 only fixes the outer shape.
export const PhoneCommandBody = z.object({ op: z.string().min(1).max(100), args: z.record(z.unknown()).optional() }).strict();

export const PhoneCommand = z.object({
  id: Uuid, device_id: Uuid, command: PhoneCommandBody, state: PhoneCommandState,
  idempotency_key: IdempotencyKey.optional(), kill_epoch: z.number().int().min(0),
  created_at: UtcTime, expires_at: UtcTime, claimed_at: UtcTime.optional(), finished_at: UtcTime.optional(),
  result: z.record(z.unknown()).optional(), error: z.string().max(1000).optional(),
}).strict();

export const KillState = z.object({ kill: z.boolean(), epoch: z.number().int().min(0), changed_at: UtcTime.optional() }).strict();

export const Envelope = EnvelopeSchema;

export const NAMED = { Envelope, Device, PhoneCommandBody, PhoneCommand, KillState, DeviceKind, PhoneCommandState } as const;
