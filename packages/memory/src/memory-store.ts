// Reference store in memory (tests, local dev, and the model for every real adapter). Same rules as the real ones.
import type { ForgetResult, Kind, Link, LinkType, ListQuery, Memory, MemoryPatch, MemoryTier, NewMemory, Page, SearchHit, SearchQuery, StoreStats } from './types.ts';
import { MemoryError } from './types.ts';
import { DAY, LIST_MAX_PAGE, RETENTION_DAYS } from './rules.ts';
import { LINK_TYPES, validateNew, type MemoryStore } from './store.ts';
import { overlap } from './text.ts';
import { purposeAllowsSensitive } from './classify.ts';

type Row = { owner: string; m: Memory; vec: number[] | null };
export type InMemoryDb = { rows: Map<string, Row>; links: Map<string, { owner: string; l: Link }>; declines: Map<string, { owner: string; at: number }>; seq: number };
export const createInMemoryDb = (): InMemoryDb => ({ rows: new Map(), links: new Map(), declines: new Map(), seq: 0 });

export function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
const uuid = (db: InMemoryDb): string => { db.seq++; const h = db.seq.toString(16).padStart(12, '0'); return `00000000-0000-4000-8000-${h}`; };
const live = (m: Memory, now: number): boolean => m.status === 'active' && (m.expires_at === null || Date.parse(m.expires_at) > now);

export class InMemoryStore implements MemoryStore {
  readonly id = 'memory'; readonly ownerId: string; private db: InMemoryDb; private dim: number; private clock: () => Date;
  constructor(db: InMemoryDb, ownerId: string, opts: { dim?: number; now?: () => Date } = {}) { this.db = db; this.ownerId = ownerId; this.dim = opts.dim ?? 768; this.clock = opts.now ?? (() => new Date()); }
  capabilities() { return { vector: true, dim: this.dim }; }
  private mine(id: string): Row | null { const r = this.db.rows.get(id); return r && r.owner === this.ownerId ? r : null; }
  private all(): Row[] { return [...this.db.rows.values()].filter((r) => r.owner === this.ownerId); }

  async create(input: NewMemory, opts: { supersedes?: string } = {}): Promise<Memory> {
    validateNew(input); const now = this.clock().toISOString();
    const m: Memory = { ...input, tags: [...input.tags], tokens: [...input.tokens], id: uuid(this.db), status: 'active', superseded_by: null, valid_to: null, revision: 1, embedding_model: null, embedded_at: null, created_at: now, updated_at: now, last_used_at: null, use_count: 0 };
    if (opts.supersedes) { const old = this.mine(opts.supersedes); if (!old) throw new MemoryError('not_found', 'memory to supersede not found'); old.m = { ...old.m, status: 'superseded', superseded_by: m.id, valid_to: now, updated_at: now }; old.vec = null; }
    this.db.rows.set(m.id, { owner: this.ownerId, m, vec: null });
    return { ...m };
  }
  async get(id: string): Promise<Memory | null> { const r = this.mine(id); return r ? { ...r.m } : null; }
  async update(id: string, patch: MemoryPatch, expectedRevision: number): Promise<Memory> {
    const r = this.mine(id); if (!r) throw new MemoryError('not_found', 'memory not found');
    if (r.m.revision !== expectedRevision) throw new MemoryError('conflict', 'memory changed since you read it');
    const next: Memory = { ...r.m, ...patch, tags: patch.tags ? [...patch.tags] : r.m.tags, tokens: patch.tokens ? [...patch.tokens] : r.m.tokens, revision: r.m.revision + 1, updated_at: this.clock().toISOString() };
    const textChanged = (patch.title !== undefined && patch.title !== r.m.title) || (patch.body !== undefined && patch.body !== r.m.body) || (patch.tags !== undefined);
    if (textChanged || next.private || next.tier === 'sensitive') { next.embedding_model = null; next.embedded_at = null; r.vec = null; } // changed text or now private: old vector is wrong or forbidden
    validateNew({ ...next, ref_type: next.ref_type, ref_id: next.ref_id } as NewMemory);
    r.m = next; return { ...next };
  }
  async list(q: ListQuery): Promise<Page<Memory>> {
    const now = this.clock().getTime(); const limit = Math.min(q.limit ?? 50, LIST_MAX_PAGE);
    let rows = this.all().map((r) => r.m).filter((m) => (q.includeSuperseded || m.status === 'active') && (m.expires_at === null || Date.parse(m.expires_at) > now) && (q.includePrivate || !m.private) && (!q.kinds || q.kinds.includes(m.kind)) && (!q.tag || m.tags.includes(q.tag)));
    rows.sort((a, b) => (q.order === 'oldest' ? 1 : -1) * (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
    return { items: rows.slice(q.offset ?? 0, (q.offset ?? 0) + limit).map((m) => ({ ...m })), total: rows.length };
  }
  async search(q: SearchQuery): Promise<SearchHit[]> {
    const now = q.now.getTime(); const pool: SearchHit[] = [];
    for (const r of this.all()) {
      const m = r.m; if (!live(m, now) || (m.tier === 'sensitive' && (!q.purpose || !purposeAllowsSensitive(m.tags, q.purpose))) || (q.kinds && !q.kinds.includes(m.kind))) continue;
      const kw = overlap(q.tokens, m.tokens); const sim = q.embedding && r.vec ? Math.max(0, cosine(q.embedding, r.vec)) : null;
      if (kw > 0 || sim !== null) pool.push({ memory: { ...m }, sim, kw });
    }
    const byKw = [...pool].sort((a, b) => b.kw - a.kw).filter((h) => h.kw > 0).slice(0, q.limit);
    const bySim = [...pool].filter((h) => h.sim !== null).sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0)).slice(0, q.limit);
    const seen = new Set<string>(); return [...byKw, ...bySim].filter((h) => (seen.has(h.memory.id) ? false : (seen.add(h.memory.id), true)));
  }
  async pinned(max: number): Promise<Memory[]> { const now = this.clock().getTime(); return this.all().map((r) => r.m).filter((m) => m.pinned && !m.private && live(m, now)).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(0, max).map((m) => ({ ...m })); }
  async touch(ids: string[], now: Date): Promise<void> { for (const id of ids) { const r = this.mine(id); if (r) r.m = { ...r.m, last_used_at: now.toISOString(), use_count: r.m.use_count + 1 }; } }
  async findBySubjectKey(kind: Kind, subjectKey: string, tier: MemoryTier = 'normal'): Promise<Memory | null> { const now = this.clock().getTime(); const r = this.all().find((x) => x.m.kind === kind && x.m.subject_key === subjectKey && x.m.tier === tier && live(x.m, now)); return r ? { ...r.m } : null; }
  async setEmbedding(id: string, vector: number[] | null, model: string): Promise<void> {
    const r = this.mine(id); if (!r) throw new MemoryError('not_found', 'memory not found');
    if (vector === null) { r.vec = null; r.m = { ...r.m, embedding_model: 'skipped', embedded_at: this.clock().toISOString() }; return; }
    if (r.m.private || r.m.tier === 'sensitive') throw new MemoryError('forbidden', 'T2 sensitive memory never gets a vector');
    if (vector.length !== this.dim) throw new MemoryError('invalid', `vector must have ${this.dim} numbers`);
    r.vec = [...vector]; r.m = { ...r.m, embedding_model: model, embedded_at: this.clock().toISOString() };
  }
  async pendingEmbeddings(limit: number): Promise<Memory[]> { const now = this.clock().getTime(); return this.all().map((r) => r.m).filter((m) => live(m, now) && !m.private && m.tier === 'normal' && m.embedding_model === null).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(0, limit).map((m) => ({ ...m })); }
  async forget(id: string): Promise<ForgetResult> {
    if (!this.mine(id)) return { deleted: 0, derived_deleted: 0, links_deleted: 0 };
    const doomed = new Set<string>([id]); let derived = 0;
    for (const { owner, l } of this.db.links.values()) if (owner === this.ownerId && l.rel === 'derived_from' && l.dst_type === 'memory' && l.dst_id === id && l.src_type === 'memory' && this.mine(l.src_id)) { if (!doomed.has(l.src_id)) { doomed.add(l.src_id); derived++; } }
    let links = 0;
    for (const [lid, { owner, l }] of [...this.db.links]) if (owner === this.ownerId && ((l.src_type === 'memory' && doomed.has(l.src_id)) || (l.dst_type === 'memory' && doomed.has(l.dst_id)))) { this.db.links.delete(lid); links++; }
    for (const d of doomed) this.db.rows.delete(d);
    return { deleted: 1, derived_deleted: derived, links_deleted: links };
  }
  async forgetAll(expectedCount: number): Promise<ForgetResult> {
    const mine = this.all(); if (mine.length !== expectedCount) throw new MemoryError('conflict', `expected ${expectedCount} memories but there are ${mine.length}`);
    let links = 0; for (const r of mine) this.db.rows.delete(r.m.id);
    for (const [lid, { owner }] of [...this.db.links]) if (owner === this.ownerId) { this.db.links.delete(lid); links++; }
    for (const [fp, { owner }] of [...this.db.declines]) if (owner === this.ownerId) this.db.declines.delete(fp);
    return { deleted: mine.length, derived_deleted: 0, links_deleted: links };
  }
  async exportPage(offset: number, limit: number): Promise<Memory[]> { return this.all().map((r) => r.m).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1)).slice(offset, offset + limit).map((m) => ({ ...m })); }
  async stats(): Promise<StoreStats> {
    const rows = this.all(); const bytes = rows.reduce((n, r) => n + r.m.body.length + r.m.title.length + (r.vec ? this.dim * 2 : 0) + 400, 0);
    return { memories: rows.length, with_vector: rows.filter((r) => r.vec).length, pending_embeddings: rows.filter((r) => !r.vec && !r.m.private && r.m.status === 'active').length, private_count: rows.filter((r) => r.m.private).length, table_mb: Math.round(bytes / 1048576 * 10) / 10, db_mb: null, notes: 0, files: 0, projects: 0 };
  }
  async link(l: { src_type: LinkType; src_id: string; rel: string; dst_type: LinkType; dst_id: string }): Promise<Link> {
    if (!LINK_TYPES.includes(l.src_type) || !LINK_TYPES.includes(l.dst_type)) throw new MemoryError('invalid', 'unknown link type');
    if (!/^[a-z_]{2,40}$/.test(l.rel)) throw new MemoryError('invalid', 'rel: 2..40 chars a-z and _');
    if (l.src_type === 'memory' && !this.mine(l.src_id)) throw new MemoryError('not_found', 'source memory not found');
    if (l.dst_type === 'memory' && !this.mine(l.dst_id)) throw new MemoryError('not_found', 'target memory not found');
    for (const { owner, l: e } of this.db.links.values()) if (owner === this.ownerId && e.src_type === l.src_type && e.src_id === l.src_id && e.rel === l.rel && e.dst_type === l.dst_type && e.dst_id === l.dst_id) return { ...e };
    const link: Link = { ...l, id: uuid(this.db), created_at: this.clock().toISOString() }; this.db.links.set(link.id, { owner: this.ownerId, l: link }); return { ...link };
  }
  async unlink(id: string): Promise<void> { const e = this.db.links.get(id); if (e && e.owner === this.ownerId) this.db.links.delete(id); }
  async neighbors(type: LinkType, id: string, limit: number): Promise<Link[]> { return [...this.db.links.values()].filter((e) => e.owner === this.ownerId && ((e.l.src_type === type && e.l.src_id === id) || (e.l.dst_type === type && e.l.dst_id === id))).slice(0, Math.min(limit, 100)).map((e) => ({ ...e.l })); }
  async noteDecline(fp: string, now: Date): Promise<void> { this.db.declines.set(this.ownerId + '|' + fp, { owner: this.ownerId, at: now.getTime() }); }
  async wasDeclined(fp: string, now: Date): Promise<boolean> { const d = this.db.declines.get(this.ownerId + '|' + fp); return !!d && now.getTime() - d.at < RETENTION_DAYS.declineKeep * DAY; }
  async purge(now: Date): Promise<{ expired: number; superseded: number; declines: number }> {
    let expired = 0, superseded = 0, declines = 0; const t = now.getTime();
    for (const r of this.all()) {
      const m = r.m;
      if (m.expires_at !== null && Date.parse(m.expires_at) + RETENTION_DAYS.expiredGrace * DAY < t) { this.db.rows.delete(m.id); expired++; }
      else if (m.status === 'superseded' && m.valid_to && Date.parse(m.valid_to) + RETENTION_DAYS.supersededKeep * DAY < t) { this.db.rows.delete(m.id); superseded++; }
    }
    for (const [k, d] of [...this.db.declines]) if (d.owner === this.ownerId && t - d.at > RETENTION_DAYS.declineKeep * DAY) { this.db.declines.delete(k); declines++; }
    return { expired, superseded, declines };
  }
}
