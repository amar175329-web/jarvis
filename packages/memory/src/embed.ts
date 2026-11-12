// Embeddings: how text becomes a 768-number vector, ONLY through the model gateway (kill switch + model list + budget + key + usage record).
// This package never calls a model provider directly. Private memories and text with secrets are never embedded.
import { redactText, findSecrets } from './redact.ts';
import type { KillState, Memory } from './types.ts';
import type { MemoryStore } from './store.ts';

export const EMBED_DIM = 768;
export type EmbedKind = 'document' | 'query';
export type EmbedResult = { ok: true; vectors: number[][]; model: string } | { ok: false; code: string; message: string };
export interface Embedder { readonly model: string; readonly dim: number; embed(texts: string[], kind: EmbedKind): Promise<EmbedResult> }

/** The shape packages/model-gateway must offer (CONTRACT REQUEST to S00/S13): same chain as call(): kill -> model list -> budget -> key -> call -> usage record. */
export interface EmbedGateway {
  embed(req: { provider: string; model: string; task: string; texts: string[]; taskType: 'retrieval_document' | 'retrieval_query'; dim: number; estimatedInputTokens: number }):
    Promise<{ ok: true; vectors: number[][]; usage: { tokensIn: number; costUsd: number } } | { ok: false; code: string; message: string }>;
}
export function gatewayEmbedder(gw: EmbedGateway, o: { provider: string; model: string; dim?: number }): Embedder {
  const dim = o.dim ?? EMBED_DIM;
  return {
    model: `${o.provider}/${o.model}@${dim}`, dim,
    async embed(texts, kind) {
      const r = await gw.embed({ provider: o.provider, model: o.model, task: 'memory.embed', texts, taskType: kind === 'query' ? 'retrieval_query' : 'retrieval_document', dim, estimatedInputTokens: Math.ceil(texts.join(' ').length / 3) });
      if (!r.ok) return r;
      if (r.vectors.length !== texts.length || r.vectors.some((v) => v.length !== dim)) return { ok: false, code: 'bad_vectors', message: `provider returned wrong shape (wanted ${texts.length} x ${dim})` };
      return { ok: true, vectors: r.vectors.map(l2normalize), model: this.model };
    },
  };
}

/** Truncated (Matryoshka) vectors are not unit length: normalise so cosine distance behaves. */
export function l2normalize(v: number[]): number[] { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n); return n === 0 ? v.slice() : v.map((x) => x / n); }

/** The text that is allowed to leave for an embedding model, or null = never embed this row. */
export function prepareEmbedText(m: Pick<Memory, 'title' | 'body' | 'private' | 'status'>): string | null {
  if (m.private || m.tier === 'sensitive' || m.status !== 'active') return null;
  const t = `${m.title}. ${m.body}`; if (findSecrets(t).length) return null;
  return redactText(t).slice(0, 2000);
}

export type EmbedMode = 'off' | 'cloud' | 'local';
export type EmbedBatchResult = { embedded: number; skipped: number; failed: number; stopped: null | 'embeddings_off' | 'kill_switch' | 'budget_or_key' | 'error' };
const STOP_CODES = new Set(['kill_switch_on', 'budget_exceeded', 'no_key', 'unpriced_model', 'unknown_model', 'unknown_provider']);

/** One pass of the worker job `memory.embed`. Safe to run every few minutes: it stops at the first kill/budget/key problem. */
export async function runEmbedBatch(d: { store: MemoryStore; embedder: Embedder | null; mode: EmbedMode; kill: KillState; limit?: number }): Promise<EmbedBatchResult> {
  const res: EmbedBatchResult = { embedded: 0, skipped: 0, failed: 0, stopped: null };
  if (d.mode === 'off' || !d.embedder) return { ...res, stopped: 'embeddings_off' };
  if (d.kill !== 'off') return { ...res, stopped: 'kill_switch' };
  const pending = await d.store.pendingEmbeddings(d.limit ?? 20); if (!pending.length) return res;
  const ready: { m: Memory; text: string }[] = [];
  for (const m of pending) { const text = prepareEmbedText(m); if (text === null) { await d.store.setEmbedding(m.id, null, 'skipped'); res.skipped++; } else ready.push({ m, text }); }
  if (!ready.length) return res;
  const r = await d.embedder.embed(ready.map((x) => x.text), 'document');
  if (!r.ok) { res.failed = ready.length; res.stopped = r.code === 'kill_switch_on' ? 'kill_switch' : STOP_CODES.has(r.code) ? 'budget_or_key' : 'error'; return res; }
  for (let i = 0; i < ready.length; i++) { try { await d.store.setEmbedding(ready[i]!.m.id, r.vectors[i]!, r.model); res.embedded++; } catch { res.failed++; } }
  return res;
}
