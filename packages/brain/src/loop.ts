// The one thinking loop for every task: perceive -> understand -> context -> decide -> act -> verify -> learn -> report.
// Ports are small interfaces so S07/S09/S16B/S15 plug in without changing this file.
import { gate, type KillState, type GateResult } from './gate.ts';
import { route, type Route } from './depth-router.ts';
import type { Registry } from './power-registry.ts';
import { confirmed, type Confirmation } from './confirm-wording.ts';

export type Source = 'amit' | 'schedule' | 'web' | 'screen' | 'message' | 'tool'; // only amit + schedule may give orders
export type Percept = { id: string; source: Source; text: string; at: string };
export type Decision = { kind: 'answer' | 'plan' | 'act' | 'ask' | 'silent'; powerId?: string; why: string; text?: string };
export type Outcome = { status: 'done' | 'asked' | 'suggested' | 'observed' | 'denied' | 'silent' | 'failed'; why: string; depth: Route['depth']; steps: string[] };

export interface Ports {
  kill(): Promise<KillState>;
  context(p: Percept): Promise<unknown>;
  decide(p: Percept, ctx: unknown, route: Route): Promise<Decision>;
  confirm(powerId: string, d: Decision): Promise<Confirmation>;
  act(powerId: string, d: Decision): Promise<{ ok: boolean; detail?: string }>;
  verify(powerId: string, r: { ok: boolean }): Promise<boolean>;
  learn(p: Percept, d: Decision, ok: boolean): Promise<void>;
  report(text: string): Promise<void>;
  logDecision(row: { trace: string; power?: string; level: number | null; request: string; why: string; result: string }): Promise<void>;
}
const isOrder = (s: Source) => s === 'amit' || s === 'schedule';

export async function runLoop(p: Percept, reg: Registry, ports: Ports): Promise<Outcome> {
  const steps: string[] = ['perceive'];
  const done = async (o: Omit<Outcome, 'steps'>, level: number | null, power?: string): Promise<Outcome> => {
    await ports.logDecision({ trace: p.id, power, level, request: p.text.slice(0, 500), why: o.why, result: o.status });
    return { ...o, steps };
  };
  // 0. kill switch first. unreadable counts as ON.
  const k = await ports.kill();
  if (k !== 'off') return done({ status: 'denied', why: 'kill switch ON or unreadable', depth: 'FAST' }, null);
  steps.push('understand', 'context');
  const ctx = await ports.context(p);
  const prelim = route({ text: p.text });
  steps.push('decide');
  const d = await ports.decide(p, ctx, prelim);
  if (d.kind !== 'act' || !d.powerId) {
    await ports.learn(p, d, true); steps.push('learn');
    if (d.text) { await ports.report(d.text); steps.push('report'); }
    return done({ status: d.kind === 'silent' ? 'silent' : 'done', why: d.why, depth: prelim.depth }, null);
  }
  // injection defence: text from web/screen/message/tool is DATA. It can never start an action.
  if (!isOrder(p.source)) return done({ status: 'denied', why: `text from ${p.source} is data, not an order`, depth: prelim.depth }, null, d.powerId);
  const g: GateResult = gate(reg, d.powerId, k);
  const power = reg.get(d.powerId);
  const r = route({ text: p.text, power: g, tags: power?.tags });
  if (!g.allow) {
    const st = g.mode === 'suggest' ? 'suggested' : g.mode === 'observe' ? 'observed' : 'denied';
    if (d.text) await ports.report(d.text);
    return done({ status: st, why: g.reason, depth: r.depth }, g.level, d.powerId);
  }
  if (g.mode === 'ask_confirm') {
    steps.push('confirm');
    const c = await ports.confirm(d.powerId, d);
    const ok = confirmed({ id: d.powerId, tags: power?.tags }, c);
    if (!ok.ok) return done({ status: 'asked', why: ok.why, depth: r.depth }, g.level, d.powerId);
  }
  // re-check kill right before acting (it may have flipped while we waited)
  if ((await ports.kill()) !== 'off') return done({ status: 'denied', why: 'kill switch turned ON before acting', depth: r.depth }, g.level, d.powerId);
  steps.push('act');
  const res = await ports.act(d.powerId, d);
  steps.push('verify');
  const ok = res.ok && (await ports.verify(d.powerId, res));
  steps.push('learn'); await ports.learn(p, d, ok);
  if (g.mode !== 'act_silent') { steps.push('report'); await ports.report(ok ? (d.text ?? 'Ho gaya.') : 'Nahi ho paya.'); }
  return done({ status: ok ? 'done' : 'failed', why: d.why, depth: r.depth }, g.level, d.powerId);
}
