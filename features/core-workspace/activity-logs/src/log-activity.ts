import {
  safeActivityTarget,
  sanitizeActivityDetail,
  isPrivateText,
  PRIVATE_ACTIVITY_LABEL,
} from './privacy.ts';

export type ActivityLogInput = {
  actor: string;
  action: string;
  target?: string | null;
  detail?: Record<string, unknown>;
  why: string;
  ok: boolean;
  decision_id?: string | null;
};

export type ActivityLogContext = {
  /** Inserts using the caller's authenticated Supabase user token + anon key. */
  insert: (row: Record<string, unknown>) => Promise<{ id?: string | number } | void>;
};

const ACTOR = /^(owner|jarvis|worker|system|s[0-9]{2}[a-z]?)$/i;
const ACTION = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Unified S05 activity logger. Call after the originating action has passed its power gate.
 * Only allow-listed metadata is written; private user text is replaced before storage.
 */
export async function logActivity(input: ActivityLogInput, context: ActivityLogContext): Promise<{ ok: true; id?: string | number } | { ok: false; code: 'bad_request' | 'unavailable' }> {
  if (!context || typeof context.insert !== 'function'
    || !ACTOR.test(input.actor) || !ACTION.test(input.action) || isPrivateText(input.action)
    || typeof input.why !== 'string' || !input.why.trim() || typeof input.ok !== 'boolean') {
    return { ok: false, code: 'bad_request' };
  }
  const why = input.why.normalize('NFKC').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240);
  const detail = sanitizeActivityDetail({ ...(input.detail ?? {}), why: isPrivateText(why) ? PRIVATE_ACTIVITY_LABEL : why });
  const row: Record<string, unknown> = {
    actor: input.actor.toLowerCase(),
    action: input.action,
    target: safeActivityTarget(input.target),
    detail,
    ok: input.ok,
  };
  if (input.decision_id && UUID.test(input.decision_id)) row.decision_id = input.decision_id;
  try {
    const saved = await context.insert(row);
    return { ok: true, ...(saved?.id !== undefined ? { id: saved.id } : {}) };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}
