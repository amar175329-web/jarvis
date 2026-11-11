// MemoryStore on Supabase, through PostgREST (fetch only, no SDK). First home of the memory (decision 001).
// Two ways to run: owner JWT (app/api: RLS protects) or service_role (worker jobs). BOTH always add owner_id filters, so a bug cannot read another owner's rows.
// NOT yet run against a real Supabase (Antigravity does that on a test project). Request shapes are tested with a fake fetch.
import type { ForgetResult, Kind, Link, LinkType, ListQuery, Memory, MemoryPatch, NewMemory, Page, SearchHit, SearchQuery, StoreStats } from './types.ts';
import { MemoryError } from './types.ts';
import { LIST_MAX_PAGE } from './rules.ts';
import { validateNew, type MemoryStore } from './store.ts';

export type SupabaseStoreConfig = { url: string; apiKey: string; ownerId: string; getBearer: () => Promise<string> | string; fetch?: typeof fetch; dim?: number };
const COLS = 'id,kind,title,body,source,confidence,why,private,subject,subject_key,tags,pinned,status,superseded_by,valid_to,revision,ref_type,ref_id,tokens,embedding_model,embedded_at,created_at,updated_at,expires_at,last_used_at,use_count';
const vec = (v: number[]): string => '[' + v.map((x) => Number(x.toFixed(6))).join(',') + ']';
const q = (s: string): string => encodeURIComponent(s);

export class SupabaseMemoryStore implements MemoryStore {
  readonly id = 'supabase'; readonly ownerId: string; private c: SupabaseStoreConfig; private f: typeof fetch;
  constructor(cfg: SupabaseStoreConfig) {
    if (!/^[0-9a-f-]{36}$/i.test(cfg.ownerId)) throw new MemoryError('invalid', 'ownerId must be a uuid');
    this.ownerId = cfg.ownerId; this.c = cfg; this.f = cfg.fetch ?? fetch;
  }
  capabilities() { return { vector: true, dim: this.c.dim ?? 768 }; }
  private async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; data: any; range: string | null }> {
    const res = await this.f(`${this.c.url}/rest/v1/${path}`, { method, headers: { apikey: this.c.apiKey, Authorization: `Bearer ${await this.c.getBearer()}`, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (res.status === 401 || res.status === 403) throw new MemoryError('forbidden', 'database refused (login or RLS)');
    if (res.status >= 500 || res.status === 0) throw new MemoryError('unavailable', 'database unavailable');
    if (res.status >= 400) throw new MemoryError(res.status === 409 ? 'conflict' : 'invalid', String(data?.message ?? 'bad request').slice(0, 200));
    return { status: res.status, data, range: res.headers.get('content-range') };
  }
  private get own(): string { return `owner_id=eq.${this.ownerId}`; }
  async create(input: NewMemory, opts: { supersedes?: string } = {}): Promise<Memory> {
    validateNew(input);
    const r = await this.call('POST', 'rpc/memory_create', { p_owner: this.ownerId, p_row: input, p_supersedes: opts.supersedes ?? null });
    return r.data as Memory;
  }
  async get(id: string): Promise<Memory | null> { const r = await this.call('GET', `memories?id=eq.${q(id)}&${this.own}&select=${COLS}`); return r.data?.[0] ?? null; }
  async update(id: string, patch: MemoryPatch, expectedRevision: number): Promise<Memory> {
    const r = await this.call('PATCH', `memories?id=eq.${q(id)}&${this.own}&revision=eq.${expectedRevision}&select=${COLS}`, { ...patch, revision: expectedRevision + 1, ...(patch.title !== undefined || patch.body !== undefined || patch.tags !== undefined || patch.private ? { embedding: null, embedding_model: null, embedded_at: null } : {}) }, { Prefer: 'return=representation' });
    if (!r.data?.length) { const cur = await this.get(id); throw new MemoryError(cur ? 'conflict' : 'not_found', cur ? 'memory changed since you read it' : 'memory not found'); }
    return r.data[0];
  }
  async list(l: ListQuery): Promise<Page<Memory>> {
    const limit = Math.min(l.limit ?? 50, LIST_MAX_PAGE); const f = [this.own, 'or=(expires_at.is.null,expires_at.gt.' + q(new Date().toISOString()) + ')'];
    if (!l.includeSuperseded) f.push('status=eq.active'); if (!l.includePrivate) f.push('private=eq.false');
    if (l.kinds?.length) f.push(`kind=in.(${l.kinds.join(',')})`); if (l.tag) f.push(`tags=cs.{${q(l.tag)}}`);
    const r = await this.call('GET', `memories?${f.join('&')}&select=${COLS}&order=created_at.${l.order === 'oldest' ? 'asc' : 'desc'},id.asc&limit=${limit}&offset=${l.offset ?? 0}`, undefined, { Prefer: 'count=exact' });
    const total = r.range ? Number(r.range.split('/')[1]) : null; return { items: r.data ?? [], total: Number.isFinite(total) ? total : null };
  }
  async search(s: SearchQuery): Promise<SearchHit[]> {
    const r = await this.call('POST', 'rpc/memory_search', { p_owner: this.ownerId, p_tokens: s.tokens, p_embedding: s.embedding ? vec(s.embedding) : null, p_kinds: s.kinds ?? null, p_limit: s.limit, p_allow_private: s.allowPrivate, p_now: s.now.toISOString() });
    return (r.data ?? []).map((row: any) => ({ memory: row.memory as Memory, sim: row.sim ?? null, kw: Number(row.kw ?? 0) }));
  }
  async pinned(max: number): Promise<Memory[]> { const r = await this.call('GET', `memories?${this.own}&pinned=eq.true&private=eq.false&status=eq.active&select=${COLS}&order=created_at.asc&limit=${Math.min(max, 50)}`); return r.data ?? []; }
  async touch(ids: string[], now: Date): Promise<void> { if (ids.length) await this.call('POST', 'rpc/memory_touch', { p_owner: this.ownerId, p_ids: ids.slice(0, 50), p_now: now.toISOString() }); }
  async setEmbedding(id: string, v: number[] | null, model: string): Promise<void> {
    const r = await this.call('PATCH', `memories?id=eq.${q(id)}&${this.own}&private=eq.false&select=id`, v === null ? { embedding: null, embedding_model: 'skipped', embedded_at: new Date().toISOString() } : { embedding: vec(v), embedding_model: model, embedded_at: new Date().toISOString() }, { Prefer: 'return=representation' });
    if (!r.data?.length) throw new MemoryError('forbidden', 'not found, or private (private rows never get a vector)');
  }
  async findBySubjectKey(kind: Kind, key: string): Promise<Memory | null> { const r = await this.call('GET', `memories?${this.own}&kind=eq.${kind}&subject_key=eq.${q(key)}&status=eq.active&select=${COLS}&limit=1`); return r.data?.[0] ?? null; }
  async pendingEmbeddings(limit: number): Promise<Memory[]> { const r = await this.call('GET', `memories?${this.own}&embedding_model=is.null&private=eq.false&status=eq.active&select=${COLS}&order=created_at.asc&limit=${Math.min(limit, 100)}`); return r.data ?? []; }
  async forget(id: string): Promise<ForgetResult> { const r = await this.call('POST', 'rpc/memory_forget', { p_owner: this.ownerId, p_id: id }); return r.data as ForgetResult; }
  async forgetAll(expectedCount: number): Promise<ForgetResult> { const r = await this.call('POST', 'rpc/memory_forget_all', { p_owner: this.ownerId, p_expected: expectedCount }); return r.data as ForgetResult; }
  async exportPage(offset: number, limit: number): Promise<Memory[]> { const r = await this.call('GET', `memories?${this.own}&select=${COLS}&order=created_at.asc,id.asc&limit=${Math.min(limit, 1000)}&offset=${offset}`); return r.data ?? []; }
  async stats(): Promise<StoreStats> { const r = await this.call('POST', 'rpc/memory_stats', { p_owner: this.ownerId }); return r.data as StoreStats; }
  async link(l: { src_type: LinkType; src_id: string; rel: string; dst_type: LinkType; dst_id: string }): Promise<Link> { const r = await this.call('POST', 'memory_links?on_conflict=owner_id,src_type,src_id,rel,dst_type,dst_id', { ...l, owner_id: this.ownerId }, { Prefer: 'return=representation,resolution=merge-duplicates' }); return r.data[0]; }
  async unlink(id: string): Promise<void> { await this.call('DELETE', `memory_links?id=eq.${q(id)}&${this.own}`); }
  async neighbors(type: LinkType, id: string, limit: number): Promise<Link[]> { const r = await this.call('GET', `memory_links?${this.own}&or=(and(src_type.eq.${type},src_id.eq.${q(id)}),and(dst_type.eq.${type},dst_id.eq.${q(id)}))&limit=${Math.min(limit, 100)}`); return r.data ?? []; }
  async noteDecline(fp: string, now: Date): Promise<void> { await this.call('POST', 'memory_declines?on_conflict=owner_id,fingerprint', { owner_id: this.ownerId, fingerprint: fp, created_at: now.toISOString() }, { Prefer: 'resolution=merge-duplicates' }); }
  async wasDeclined(fp: string, now: Date): Promise<boolean> { const r = await this.call('GET', `memory_declines?${this.own}&fingerprint=eq.${q(fp)}&created_at=gt.${q(new Date(now.getTime() - 180 * 86_400_000).toISOString())}&select=fingerprint&limit=1`); return !!r.data?.length; }
  async purge(now: Date): Promise<{ expired: number; superseded: number; declines: number }> { const r = await this.call('POST', 'rpc/purge_memory_rows', { p_owner: this.ownerId, p_now: now.toISOString() }); return r.data; }
}
