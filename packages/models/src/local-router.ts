import type { LocalHealth, ModelRouteDecision } from './local-types.ts';
import { invokeLocalModel } from './local-runner.ts';

export const LOCAL_HEALTH_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes

/**
 * localHealthy ka matlab "zarurat par start ho sakta hai":
 * (models.local_health.ok === true aur 3 minute se purana nahi)
 */
export function isLocalHealthy(health: LocalHealth | null | undefined, now = new Date()): boolean {
  if (!health) return false;
  if (health.ok !== true) return false;
  if (!health.checked_at) return false;

  const checkedTime = new Date(health.checked_at).getTime();
  if (isNaN(checkedTime)) return false;

  const age = now.getTime() - checkedTime;
  if (age < 0) return true; // slight clock skew allowance
  return age <= LOCAL_HEALTH_MAX_AGE_MS;
}

/**
 * Routes requests based on privacy and local health:
 * - Private sawaal: sirf local model par jayega.
 * - Agar local model healthy nahi hai (ya start fail ho): "abhi band" jawab do, cloud par KABHI nahi.
 */
export function routeModelRequest(input: {
  text: string;
  isPrivate: boolean;
  intent?: 'extraction' | 'conversation';
  health?: LocalHealth | null;
  now?: Date;
  cloudSlot?: { provider: string; model: string } | null;
}): ModelRouteDecision {
  const healthy = isLocalHealthy(input.health, input.now);

  if (input.isPrivate) {
    if (!healthy) {
      return {
        status: 'unavailable',
        message: 'abhi band',
        code: 'local_model_unavailable',
        isPrivate: true,
        reason: 'local model is not healthy or health check is older than 3 minutes; private data never goes to cloud',
      };
    }

    if (input.intent === 'extraction') {
      return {
        status: 'routed',
        target: 'local',
        model: 'rules-1b-extractor',
        isPrivate: true,
        reason: 'private extraction -> routed to rules + 1b hybrid extractor',
      };
    }

    if (input.intent === 'conversation') {
      return {
        status: 'routed',
        target: 'local',
        model: 'gemma-3-1b-it',
        isPrivate: true,
        reason: 'private open chat -> routed to local 1B (limited / सीमित on phone CPU)',
      };
    }

    return {
      status: 'routed',
      target: 'local',
      model: 'gemma-3-1b-it',
      isPrivate: true,
      reason: 'private data -> routed strictly to local model (1B primary)',
    };
  }

  // Non-private requests
  if (input.cloudSlot?.model) {
    return {
      status: 'routed',
      target: 'cloud',
      model: input.cloudSlot.model,
      isPrivate: false,
      reason: 'non-private request -> routed to cloud slot',
    };
  }

  if (healthy) {
    return {
      status: 'routed',
      target: 'local',
      model: 'gemma-3-1b-it',
      isPrivate: false,
      reason: 'non-private request -> local model available',
    };
  }

  return {
    status: 'unconfigured',
    message: 'No model available for this request.',
    reason: 'cloud slot unconfigured and local model unavailable',
  };
}

/**
 * Executes a private query end-to-end:
 * If local healthy is false, or if starting/running fails, returns "abhi band" (never cloud).
 */
export async function executePrivateRequest(input: {
  text: string;
  health?: LocalHealth | null;
  runner?: (text: string) => ReturnType<typeof invokeLocalModel>;
  now?: Date;
}): Promise<
  | { ok: true; text: string; durationMs?: number }
  | { ok: false; message: 'abhi band'; code: 'local_model_unavailable'; reason: string }
> {
  if (!isLocalHealthy(input.health, input.now)) {
    return {
      ok: false,
      message: 'abhi band',
      code: 'local_model_unavailable',
      reason: 'local model is not healthy or check is stale (> 3 minutes); cloud refused for private data',
    };
  }

  const run = input.runner ?? invokeLocalModel;
  try {
    const res = run(input.text);
    if (!res.ok) {
      return {
        ok: false,
        message: 'abhi band',
        code: 'local_model_unavailable',
        reason: res.reason || 'Local model execution failed; private data never goes to cloud',
      };
    }
    return {
      ok: true,
      text: res.text,
      durationMs: res.durationMs,
    };
  } catch (err) {
    return {
      ok: false,
      message: 'abhi band',
      code: 'local_model_unavailable',
      reason: `Local model start/run crashed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
