// Shared types for packages/memory (S09). No dependencies. Real data lives in the database (decision 006), never in git.
export const KINDS = ['profile', 'person', 'project', 'episode', 'fact', 'preference', 'routine', 'knowledge'] as const;
export type Kind = (typeof KINDS)[number];
export const SOURCES = ['amit_said', 'observed', 'inferred'] as const;
export type Source = (typeof SOURCES)[number];
export const MEMORY_TIERS = ['normal', 'sensitive'] as const;
/** T3/locked values are deliberately not a row tier: raw secrets never enter memory. */
export type MemoryTier = (typeof MEMORY_TIERS)[number];
export const MEMORY_PURPOSES = ['plan_workout', 'day_status', 'medicine_reminder', 'budget', 'ask'] as const;
export type MemoryPurpose = (typeof MEMORY_PURPOSES)[number];
// Where a candidate came from. Only chat/voice/ui (Amit himself) can create memories. web/screen/message/tool/file text is DATA, never a memory.
export const ORIGINS = ['chat', 'voice', 'ui', 'import', 'job', 'web', 'screen', 'message', 'tool', 'file'] as const;
export type Origin = (typeof ORIGINS)[number];
export type Actor = 'amit_ui' | 'jarvis'; // amit_ui = Amit's own tap in the Memory screen; jarvis = JARVIS writing on its own
export type KillState = 'off' | 'on' | 'unreadable'; // unreadable is treated as ON (fail closed)
export type RefType = 'note' | 'file' | 'project';
export type Subject = 'amit' | 'other';

export type Memory = {
  id: string; kind: Kind; title: string; body: string;
  source: Source; confidence: number; why: string;
  tier: MemoryTier; private: boolean; subject: Subject; subject_key: string | null;
  tags: string[]; pinned: boolean;
  status: 'active' | 'superseded'; superseded_by: string | null; valid_to: string | null;
  revision: number; ref_type: RefType | null; ref_id: string | null;
  tokens: string[]; embedding_model: string | null; embedded_at: string | null;
  created_at: string; updated_at: string; expires_at: string | null; last_used_at: string | null; use_count: number;
};
// What a candidate gives when creating. The store fills id, timestamps, revision, status.
export type NewMemory = {
  kind: Kind; title: string; body: string; source: Source; confidence: number; why: string;
  tier: MemoryTier; private: boolean; subject: Subject; subject_key: string | null; tags: string[]; pinned: boolean;
  ref_type: RefType | null; ref_id: string | null; tokens: string[]; expires_at: string | null;
};
export type MemoryPatch = Partial<Pick<NewMemory, 'title' | 'body' | 'tags' | 'tier' | 'private' | 'pinned' | 'expires_at' | 'kind' | 'why' | 'source' | 'confidence' | 'tokens' | 'subject_key'>>;

export type ListQuery = { kinds?: Kind[]; includePrivate?: boolean; includeSuperseded?: boolean; tag?: string; limit?: number; offset?: number; order?: 'recent' | 'oldest' };
export type Page<T> = { items: T[]; total: number | null };
/** No boolean escape hatch: a sensitive row is searchable only under an explicit, typed purpose. */
export type SearchQuery = { tokens: string[]; embedding?: number[]; kinds?: Kind[]; purpose?: MemoryPurpose; limit: number; now: Date };
export type SearchHit = { memory: Memory; sim: number | null; kw: number }; // sim 0..1 (cosine), kw = share of query tokens found
export type StoreStats = { memories: number; with_vector: number; pending_embeddings: number; private_count: number; table_mb: number | null; db_mb: number | null; notes: number; files: number; projects: number };
export type LinkType = 'memory' | 'note' | 'file' | 'project' | 'task' | 'person';
export type Link = { id: string; src_type: LinkType; src_id: string; rel: string; dst_type: LinkType; dst_id: string; created_at: string };
export type ForgetResult = { deleted: number; derived_deleted: number; links_deleted: number };

export class MemoryError extends Error {
  code: 'not_found' | 'conflict' | 'invalid' | 'forbidden' | 'unavailable';
  constructor(code: MemoryError['code'], message: string) { super(message); this.code = code; this.name = 'MemoryError'; }
}
