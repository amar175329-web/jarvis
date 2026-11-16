// Router: task x depth x privacy -> ordered chain. Private -> LOCAL only. paid_big only when Amit enabled it. Never silent paid_big.
import type { Depth, ModelEntry, SizeClass, Task, Tier } from './types.ts';
import { priceAt, validateEntry } from './registry.ts';
import type { GatewayRequest, GatewayResult } from '../../model-gateway/src/types.ts';

export type Settings = { paidBigEnabled: boolean; localHealthy: boolean };
export type Usage = { dayRequests: Record<string, number>; dayUsd: number; monthUsd: number };
export type RouteInput = {
  task: Task; depth: Depth; privacy: 'normal' | 'private'; registry: ModelEntry[]; settings: Settings; usage: Usage;
  budget: { perDayUsd?: number; perMonthUsd?: number }; now: Date; estIn: number; maxOut: number; hasKey: (provider: string) => boolean;
};
export type Slot = { id: string; provider: string; model: string; tier: Tier };
export type Route =
  | { status: 'routed'; chain: Slot[]; notices: string[] }
  | { status: 'refused'; code: 'private_needs_local' | 'no_candidate'; message: string };

type Step = [Tier, SizeClass | 'any'];
const HEAVY: Task[] = ['reasoning', 'code', 'creative'];
export function ladder(depth: Depth, task: Task, paidBig: boolean): Step[] {
  const heavy = HEAVY.includes(task);
  if (depth === 'FAST') return [['free', 'small'], ['free', 'big'], ['almost_zero', 'small']];
  if (depth === 'NORMAL') return heavy ? [['free', 'big'], ['almost_zero', 'any'], ['free', 'small']] : [['free', 'small'], ['free', 'big'], ['almost_zero', 'any']];
  const deep: Step[] = heavy ? [['free', 'big'], ['almost_zero', 'any']] : [['free', 'big'], ['almost_zero', 'any'], ['free', 'small']];
  return heavy && paidBig ? [['paid_big', 'any'], ...deep] : deep; // paid_big only for heavy + DEEP and only when Amit enabled it
}

function usable(e: ModelEntry, i: RouteInput): boolean {
  if (!e.enabled || e.status !== 'verified' || validateEntry(e).length) return false;
  if (!i.hasKey(e.provider)) return false;
  if (e.max_prompt_tokens !== undefined && i.estIn > e.max_prompt_tokens) return false;
  if (e.context_window !== undefined && i.estIn + i.maxOut > e.context_window) return false;
  if (e.free) { const cap = e.limits?.rpd; return cap === undefined || (i.usage.dayRequests[e.id] ?? 0) < cap; }
  const p = priceAt(e, i.now); if (!p) return false;
  const worst = (i.estIn * p.in + i.maxOut * p.out) / 1e6;
  if (i.budget.perDayUsd !== undefined && i.usage.dayUsd + worst > i.budget.perDayUsd) return false;
  if (i.budget.perMonthUsd !== undefined && i.usage.monthUsd + worst > i.budget.perMonthUsd) return false;
  return true;
}
const slot = (e: ModelEntry): Slot => ({ id: e.id, provider: e.provider, model: e.model, tier: e.tier });

export function routeModel(i: RouteInput): Route {
  if (i.privacy === 'private') {
    const local = i.settings.localHealthy ? i.registry.filter((e) => e.privacy === 'local' && e.tier === 'local' && usable(e, i)) : [];
    if (!local.length) return { status: 'refused', code: 'private_needs_local', message: 'Ye private baat hai, isliye sirf local model par ho sakti hai. Abhi local model chalu nahi hai, to chat band hai. Main ise cloud par nahi bhejunga.' };
    return { status: 'routed', chain: [slot(local[0])], notices: [] }; // no cloud fallback, ever
  }
  const chain: Slot[] = []; const seen = new Set<string>();
  for (const [tier, size] of ladder(i.depth, i.task, i.settings.paidBigEnabled)) {
    for (const e of i.registry) {
      if (e.privacy !== 'cloud' || e.tier !== tier || (size !== 'any' && e.size !== size) || seen.has(e.id)) continue;
      if (tier === 'paid_big' && !i.settings.paidBigEnabled) continue;
      if (usable(e, i)) { chain.push(slot(e)); seen.add(e.id); }
    }
  }
  if (!chain.length) return { status: 'refused', code: 'no_candidate', message: 'Abhi koi allowed model available nahi hai (limit khatam, key nahi, ya budget). Settings dekho.' };
  const notices: string[] = [];
  if (chain[0].tier === 'almost_zero') notices.push('Is baar almost-zero (paid, cents) model use hoga.');
  else if (chain.some((s) => s.tier === 'almost_zero')) notices.push('Free limit khatam hone par almost-zero (paid, cents) model par jaunga.');
  return { status: 'routed', chain, notices };
}

/** Tries the chain in order through the gateway. Stops at kill switch. Throws if private data would reach a non-local slot. */
export async function runChain(
  gw: { call(r: GatewayRequest): Promise<GatewayResult> }, chain: Slot[],
  base: Omit<GatewayRequest, 'provider' | 'model'>, privacy: 'normal' | 'private',
): Promise<{ result: GatewayResult; tried: { id: string; code?: string }[]; usedTier?: Tier }> {
  const tried: { id: string; code?: string }[] = []; let last: GatewayResult = { ok: false, code: 'unknown_model', message: 'empty chain' };
  for (const s of chain) {
    if (privacy === 'private' && s.tier !== 'local') throw new Error('private data must never reach a cloud model');
    const r = await gw.call({ ...base, provider: s.provider, model: s.model });
    if (r.ok) { tried.push({ id: s.id }); return { result: r, tried, usedTier: s.tier }; }
    tried.push({ id: s.id, code: r.code }); last = r;
    if (r.code === 'kill_switch_on') break;
  }
  return { result: last, tried };
}
