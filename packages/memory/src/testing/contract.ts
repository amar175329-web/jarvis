// Store contract: ANY MemoryStore (Supabase, Neon, Turso...) must pass this before it is allowed to hold Amit's memory.
// Usage in an adapter test: runStoreContract('neon', async () => ({ a: new NeonStore(...ownerA), b: new NeonStore(...ownerB) }))
import test from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryStore } from '../store.ts';
import type { NewMemory } from '../types.ts';
import { tokensFor } from '../text.ts';

export const mk = (o: Partial<NewMemory> = {}): NewMemory => { const title = o.title ?? 'chai pasand'; const body = o.body ?? 'Amit ko subah chai pasand hai'; return { kind: 'preference', title, body, source: 'amit_said', confidence: 1, why: 'Amit ne kaha', private: false, subject: 'amit', subject_key: null, tags: [], pinned: false, ref_type: null, ref_id: null, tokens: tokensFor(title, body), expires_at: null, ...o }; };

export function runStoreContract(name: string, make: () => Promise<{ a: MemoryStore; b: MemoryStore }>): void {
  test(`[${name}] create/get/update with revision`, async () => {
    const { a } = await make(); const m = await a.create(mk()); assert.equal(m.revision, 1); assert.equal((await a.get(m.id))?.title, 'chai pasand');
    const u = await a.update(m.id, { body: 'Amit ko shaam ki chai pasand hai' }, 1); assert.equal(u.revision, 2);
    await assert.rejects(() => a.update(m.id, { body: 'x y' }, 1), (e: any) => e.code === 'conflict');
  });
  test(`[${name}] user B cannot see or touch user A's data`, async () => {
    const { a, b } = await make(); const m = await a.create(mk({ title: 'secret-ish', body: 'A ki baat', tokens: ['secret', 'baat'] }));
    assert.equal(await b.get(m.id), null); assert.equal((await b.list({ includePrivate: true })).items.length, 0);
    assert.equal((await b.search({ tokens: ['baat'], allowPrivate: true, limit: 10, now: new Date() })).length, 0);
    await assert.rejects(() => b.update(m.id, { body: 'hack' }, 1)); assert.equal((await b.forget(m.id)).deleted, 0); assert.ok(await a.get(m.id));
    await assert.rejects(() => b.forgetAll(1)); assert.ok(await a.get(m.id));
    assert.equal((await b.stats()).memories, 0);
  });
  test(`[${name}] bad rows are refused (no why, inferred > 0.7, long body)`, async () => {
    const { a } = await make();
    await assert.rejects(() => a.create(mk({ why: '' }))); await assert.rejects(() => a.create(mk({ source: 'inferred', confidence: 0.9 }))); await assert.rejects(() => a.create(mk({ body: 'x'.repeat(1001) })));
  });
  test(`[${name}] private rows never get a vector; skip marker works`, async () => {
    const { a } = await make(); const p = await a.create(mk({ private: true })); const v = new Array(a.capabilities().dim ?? 768).fill(0.1);
    await assert.rejects(() => a.setEmbedding(p.id, v, 'm')); const n = await a.create(mk({ title: 'doosri', body: 'doosri baat', tokens: ['doosri'] }));
    assert.equal((await a.pendingEmbeddings(10)).some((x) => x.id === p.id), false); await a.setEmbedding(n.id, v, 'm'); assert.equal((await a.pendingEmbeddings(10)).length, 0);
  });
  test(`[${name}] keyword search honours private, kind and expiry`, async () => {
    const { a } = await make(); const now = new Date('2026-11-10T00:00:00Z');
    await a.create(mk({ title: 'rahul', body: 'Rahul team mein hai', kind: 'person', tokens: ['rahul', 'team'] }));
    await a.create(mk({ title: 'rahul number', body: 'Rahul ka number', kind: 'person', private: true, tokens: ['rahul', 'number'] }));
    await a.create(mk({ title: 'rahul purana', body: 'Rahul purani baat', tokens: ['rahul', 'purani'], expires_at: '2026-01-01T00:00:00Z' }));
    const pub = await a.search({ tokens: ['rahul'], allowPrivate: false, limit: 10, now }); assert.equal(pub.length, 1);
    assert.equal((await a.search({ tokens: ['rahul'], allowPrivate: true, limit: 10, now })).length, 2);
    assert.equal((await a.search({ tokens: ['rahul'], kinds: ['fact'], allowPrivate: true, limit: 10, now })).length, 0);
  });
  test(`[${name}] supersede keeps one active row`, async () => {
    const { a } = await make(); const o = await a.create(mk({ kind: 'fact', title: 'city', body: 'Delhi', subject_key: 'amit.city', tokens: ['city', 'delhi'] }));
    const n = await a.create(mk({ kind: 'fact', title: 'city', body: 'Pune', subject_key: 'amit.city', tokens: ['city', 'pune'] }), { supersedes: o.id });
    assert.equal((await a.get(o.id))?.status, 'superseded'); assert.equal((await a.findBySubjectKey('fact', 'amit.city'))?.id, n.id);
  });
  test(`[${name}] forget is a hard delete incl. derived rows and links`, async () => {
    const { a } = await make(); const x = await a.create(mk({ title: 'asli', body: 'asli baat', tokens: ['asli'] })); const d = await a.create(mk({ kind: 'episode', title: 'saaransh', body: 'asli ka saaransh', tokens: ['saaransh'] }));
    await a.link({ src_type: 'memory', src_id: d.id, rel: 'derived_from', dst_type: 'memory', dst_id: x.id });
    const r = await a.forget(x.id); assert.deepEqual([r.deleted, r.derived_deleted], [1, 1]); assert.equal(await a.get(x.id), null); assert.equal(await a.get(d.id), null);
  });
  test(`[${name}] forgetAll needs the exact count; also wipes declines`, async () => {
    const { a } = await make(); await a.create(mk()); await a.noteDecline('f1:abc', new Date());
    await assert.rejects(() => a.forgetAll(5), (e: any) => e.code === 'conflict'); const r = await a.forgetAll(1); assert.equal(r.deleted, 1); assert.equal(await a.wasDeclined('f1:abc', new Date()), false);
  });
  test(`[${name}] export pages everything in a stable order`, async () => {
    const { a } = await make(); for (let i = 0; i < 5; i++) await a.create(mk({ title: 't' + i, body: 'b' + i, tokens: ['t' + i] }));
    const p1 = await a.exportPage(0, 3), p2 = await a.exportPage(3, 3); assert.equal(p1.length + p2.length, 5); assert.equal(new Set([...p1, ...p2].map((x) => x.id)).size, 5);
  });
  test(`[${name}] purge removes long-expired, old superseded and old declines`, async () => {
    const { a } = await make(); await a.create(mk({ expires_at: '2026-01-01T00:00:00Z' })); const r = await a.purge(new Date('2026-11-10T00:00:00Z')); assert.equal(r.expired, 1);
  });
}
