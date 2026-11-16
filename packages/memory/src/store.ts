// THE interface. Everything above (service, chat recall, routes, jobs) talks only to MemoryStore.
// Today: SupabaseMemoryStore. Later: Neon or Turso adapters behind the same interface (they must pass src/testing/contract.ts).
// Rules every store keeps: (1) one owner per store object, never an owner id per call; (2) forget = HARD delete (row, vector, links, derived rows);
// (3) private rows never get a vector; (4) no store-specific type or SQL leaks out of this file.
import type { ForgetResult, Kind, Link, LinkType, ListQuery, Memory, MemoryPatch, NewMemory, Page, SearchHit, SearchQuery, StoreStats } from './types.ts';
import { KINDS, MEMORY_TIERS, MemoryError, SOURCES, type MemoryTier } from './types.ts';
import { LIMITS } from './rules.ts';

export interface MemoryStore {
  readonly id: string;       // 'supabase' | 'memory' | 'neon' | 'turso'
  readonly ownerId: string;
  capabilities(): { vector: boolean; dim: number | null };
  create(input: NewMemory, opts?: { supersedes?: string }): Promise<Memory>;
  get(id: string): Promise<Memory | null>;
  /** Optimistic: throws MemoryError('conflict') if the row changed since `expectedRevision`. Text change clears the vector. */
  update(id: string, patch: MemoryPatch, expectedRevision: number): Promise<Memory>;
  list(q: ListQuery): Promise<Page<Memory>>;
  /** Returns candidates only (keyword overlap and/or vector similarity). Ranking is done by search.ts so every store ranks the same way. */
  search(q: SearchQuery): Promise<SearchHit[]>;
  pinned(max: number): Promise<Memory[]>;
  touch(ids: string[], now: Date): Promise<void>;
  /** vector=null means "intentionally never embedded" (e.g. text had a secret): row is marked and not picked again. */
  setEmbedding(id: string, vector: number[] | null, model: string): Promise<void>;
  findBySubjectKey(kind: Kind, subjectKey: string, tier?: MemoryTier): Promise<Memory | null>;
  pendingEmbeddings(limit: number): Promise<Memory[]>;
  forget(id: string): Promise<ForgetResult>;
  /** Deletes everything of this owner. `expectedCount` must equal the current count (what Amit saw on screen), else conflict. */
  forgetAll(expectedCount: number): Promise<ForgetResult>;
  exportPage(offset: number, limit: number): Promise<Memory[]>;
  stats(): Promise<StoreStats>;
  link(l: { src_type: LinkType; src_id: string; rel: string; dst_type: LinkType; dst_id: string }): Promise<Link>;
  unlink(id: string): Promise<void>;
  neighbors(type: LinkType, id: string, limit: number): Promise<Link[]>;
  noteDecline(fingerprint: string, now: Date): Promise<void>;
  wasDeclined(fingerprint: string, now: Date): Promise<boolean>;
  /** Daily retention job (service role on the worker). */
  purge(now: Date): Promise<{ expired: number; superseded: number; declines: number }>;
}

export const LINK_TYPES: LinkType[] = ['memory', 'note', 'file', 'project', 'task', 'person'];

/** Same checks in every store, so a bad row is refused the same way everywhere (and the database CHECKs mirror these). */
export function validateNew(m: NewMemory): void {
  const bad = (msg: string): never => { throw new MemoryError('invalid', msg); };
  if (!KINDS.includes(m.kind)) bad(`kind must be one of ${KINDS.join(', ')}`);
  if (!SOURCES.includes(m.source)) bad(`source must be one of ${SOURCES.join(', ')}`);
  if (!MEMORY_TIERS.includes(m.tier)) bad(`tier must be one of ${MEMORY_TIERS.join(', ')}`);
  if ((m.tier === 'sensitive') !== m.private) bad('tier=sensitive and private=true must match; T2 is always private');
  if (!m.title.trim() || m.title.length > LIMITS.titleChars) bad(`title 1..${LIMITS.titleChars} chars`);
  const max = m.kind === 'episode' || m.kind === 'knowledge' ? LIMITS.episodeBodyChars : LIMITS.bodyChars;
  if (!m.body.trim() || m.body.length > max) bad(`body 1..${max} chars`);
  if (m.why.trim().length < 3 || m.why.length > LIMITS.whyChars) bad(`why 3..${LIMITS.whyChars} chars (every memory must say why it exists)`);
  if (!(m.confidence >= 0 && m.confidence <= 1)) bad('confidence 0..1');
  if (m.source === 'inferred' && m.confidence > 0.7) bad('inferred memory cannot have confidence above 0.7');
  if (m.tags.length > LIMITS.tags || m.tags.some((t) => !t || t.length > LIMITS.tagChars)) bad('tags: up to 12, each 1..40 chars');
  if (m.subject_key !== null && (m.subject_key.length === 0 || m.subject_key.length > LIMITS.subjectKeyChars)) bad('subject_key length');
  if ((m.ref_type === null) !== (m.ref_id === null)) bad('ref_type and ref_id go together');
  if (m.expires_at !== null && Number.isNaN(Date.parse(m.expires_at))) bad('expires_at must be a date');
}
