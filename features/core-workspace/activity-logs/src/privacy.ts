/**
 * Shared S05 privacy projection.
 * Always run S08's shared sensitivity function. S09's maintained memory classifiers
 * add family/emotion/location coverage and real secret detection; no local regex clone.
 */
import { classifySensitivity } from '../../task-manager/src/sensitivity.mjs';
import { classify } from '../../../../packages/memory/src/classify.ts';
import { findSecrets } from '../../../../packages/memory/src/redact.ts';

export const PRIVATE_MESSAGE_LABEL = 'Private message hidden';
export const PRIVATE_ACTIVITY_LABEL = 'Private detail hidden';

export function classifyMemoryText(value: unknown) {
  if (typeof value !== 'string') {
    return { categories: ['unsupported-content'], care: null as null, private: true };
  }
  const result = classify(value);
  return { ...result, private: result.categories.length > 0 };
}

export function findMemorySecrets(value: string) {
  return findSecrets(value);
}

export function isPrivateText(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const shared = classifySensitivity(value);
  const memory = classifyMemoryText(value);
  const secrets = findMemorySecrets(value);
  return shared.sensitive || memory.private || secrets.length > 0;
}

export function redactPrivateText(value: unknown, label = PRIVATE_MESSAGE_LABEL): string {
  if (typeof value !== 'string') return label;
  return isPrivateText(value) ? label : value;
}

/** Allow only typed metadata into activity_log.detail; never store free-form payloads. */
const SAFE_DETAIL_KEYS = new Set([
  'why', 'result', 'status', 'count', 'kind', 'source', 'duration_ms',
  'error_code', 'power_id', 'decision_id', 'limit', 'filter',
]);

export function sanitizeActivityDetail(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue;
    if (typeof raw === 'string') {
      const trimmed = raw.normalize('NFKC').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240);
      safe[key] = isPrivateText(trimmed) ? PRIVATE_ACTIVITY_LABEL : trimmed;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      safe[key] = raw;
    } else if (typeof raw === 'boolean') {
      safe[key] = raw;
    }
  }
  return safe;
}

export function safeActivityTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const target = value.normalize('NFKC').trim().slice(0, 120);
  if (!target) return null;
  if (isPrivateText(target)) return 'private_item';
  // Only known entity labels or opaque UUIDs; never persist arbitrary user text.
  const entityTypes = new Set(['task', 'reminder', 'chat_thread', 'chat_history', 'activity_log', 'note', 'file', 'project', 'device', 'model', 'power', 'job', 'system_state']);
  if (entityTypes.has(target)) return target;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target) ? target : 'item';
}
