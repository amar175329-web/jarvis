// PROPOSAL for packages/contracts (only S00/LEAD may add it). NOT RUN here: zod is not installed in this sandbox.
import { z } from 'zod';
export const Level = z.number().int().min(0).max(4);
export const PowerId = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
export const Power = z.object({ id: PowerId, name: z.string(), owner_squad: z.string(), description: z.string().nullable().optional(),
  autonomy_default: Level, autonomy_current: Level, max_level: Level, needs_confirm: z.boolean(), reversible: z.boolean() }).strict()
  .refine((p) => p.autonomy_current <= p.max_level, 'current above max');
export const GateRequest = z.object({ power_id: PowerId, trace_id: z.string() }).strict();
export const GateResult = z.object({ allow: z.boolean(), mode: z.enum(['deny', 'observe', 'suggest', 'ask_confirm', 'act_then_tell', 'act_silent']), level: Level.nullable(), reason: z.string() }).strict();
export const ConfirmNeeded = z.object({ trace_id: z.string(), power_id: PowerId, text: z.string().max(300), channel: z.enum(['phone_voice', 'app_tap', 'app_voice']), needs_fingerprint: z.boolean() }).strict();
export const ConfirmAnswered = z.object({ trace_id: z.string(), answer: z.enum(['yes', 'no', 'unclear', 'no_answer']), fingerprint_ok: z.boolean().optional() }).strict();
export const DecisionMade = z.object({ trace_id: z.string(), power_id: PowerId.optional(), level: Level.nullable(), request: z.string().max(500), why: z.string().min(1).max(200), result: z.string() }).strict();
// Rule for all brain.* events: never carry passwords, secrets, or fingerprint data. Secrets travel only as {{secret:name}} handles.
export const SecretHandle = z.string().regex(/^\{\{secret:[a-z0-9-]+\}\}$/);
export const BRAIN_EVENTS = ['brain.decision.made', 'brain.action.requested', 'brain.confirm.needed', 'brain.confirm.answered', 'brain.action.done', 'terminal-strip.update'] as const;
