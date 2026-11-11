// S22 BRAIN contracts (accepted by LEAD 2026-11-10 from contracts-proposal/brain.ts). Shapes only; no secrets, no fingerprint data.
import { z } from 'zod';
export const Level = z.number().int().min(0).max(4);
export const PowerId = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
export const Power = z.object({ id: PowerId, name: z.string(), owner_squad: z.string(), description: z.string().nullable().optional(),
  autonomy_default: Level, autonomy_current: Level, max_level: Level, needs_confirm: z.boolean(), reversible: z.boolean() }).strict()
  .refine((p) => p.autonomy_current <= p.max_level && p.autonomy_default <= p.max_level, 'level above max_level');
export const GateRequest = z.object({ power_id: PowerId, trace_id: z.string().min(1).max(100) }).strict();
export const GateResult = z.object({ allow: z.boolean(), mode: z.enum(['deny', 'observe', 'suggest', 'ask_confirm', 'act_then_tell', 'act_silent']), level: Level.nullable(), reason: z.string().max(300) }).strict();
export const ConfirmNeeded = z.object({ trace_id: z.string().min(1).max(100), power_id: PowerId, text: z.string().max(300), channel: z.enum(['phone_voice', 'app_tap', 'app_voice']), needs_fingerprint: z.boolean() }).strict();
export const ConfirmAnswered = z.object({ trace_id: z.string().min(1).max(100), answer: z.enum(['yes', 'no', 'unclear', 'no_answer']), fingerprint_ok: z.boolean().optional() }).strict();
export const SecretHandle = z.string().regex(/^\{\{secret:[a-z0-9-]+\}\}$/);
