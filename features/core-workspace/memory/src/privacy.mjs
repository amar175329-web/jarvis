import { classifySensitivity } from '../../task-manager/src/sensitivity.mjs';

const PRIVATE_CATEGORIES = new Set([
  'health', 'money_figure', 'abuse', 'minor', 'self_harm', 'other_sensitive',
  'sensitive_self', 'contact_pii', 'emotion', 'family', 'location',
]);

function textOf(values) {
  return values.flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => typeof value === 'string')
    .join('\n')
    .slice(0, 120_000);
}

/**
 * Uses the shared S08 guard plus packages/memory's existing classifier and secret detector.
 * The memory classifier and secret detector are injected by LEAD from packages/memory;
 * missing dependencies fail closed instead of silently downgrading private content.
 */
export function classifyWorkspaceContent(context, values, explicitlyPrivate = false) {
  if (typeof context?.classifyMemoryText !== 'function' || typeof context?.findMemorySecrets !== 'function') {
    throw new Error('privacy dependencies unavailable');
  }
  const text = textOf(values);
  const shared = classifySensitivity(text);
  const memory = context.classifyMemoryText(text);
  const secretFindings = context.findMemorySecrets(text);
  if (!memory || !Array.isArray(memory.categories) || !Array.isArray(secretFindings)) {
    throw new Error('privacy classifier response invalid');
  }
  const privateByMemory = memory.categories.some((category) => PRIVATE_CATEGORIES.has(category));
  const sensitive = explicitlyPrivate || shared.sensitive || privateByMemory;
  return {
    private: sensitive,
    tier: sensitive ? 'sensitive' : 'normal',
    no_embed: sensitive,
    secret: secretFindings.length > 0,
  };
}

export function privatePlaceholder(row) {
  return {
    id: String(row.id),
    label: 'Private item',
    badge: 'private',
    updated_at: row.updated_at ?? row.created_at ?? null,
  };
}

export function isStoredPrivate(row) {
  return row?.private === true || row?.tier === 'sensitive' || row?.no_embed === true;
}

export function normalMemoryRecord(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    source: row.source,
    why: row.why,
    tags: Array.isArray(row.tags) ? row.tags : [],
    pinned: row.pinned === true,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at ?? null,
  };
}

export function normalWorkspaceRecord(row, kind) {
  if (kind === 'note') return {
    id: row.id, kind, title: row.title, body_md: row.body_md,
    tags: Array.isArray(row.tags) ? row.tags : [], project_id: row.project_id ?? null,
    pinned: row.pinned === true, status: row.status, revision: row.revision ?? null,
    created_at: row.created_at, updated_at: row.updated_at,
  };
  if (kind === 'project') return {
    id: row.id, kind, name: row.name, goal: row.goal ?? '', status: row.status,
    next_step: row.next_step ?? '', due_at: row.due_at ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [], created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return {
    id: row.id, kind, mime: row.mime, size_bytes: Number(row.size_bytes ?? 0),
    status: row.status, project_id: row.project_id ?? null,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}
