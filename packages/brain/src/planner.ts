// Planner: goal -> steps. Each step = power + inputs + expected result + level (from the gate). Re-plans on failure, with hard stops.
import { BUDGETS, type Depth } from './depth-router.ts';
import { gate, type KillState, type Mode } from './gate.ts';
import type { Registry } from './power-registry.ts';

export type Step = { id: string; powerId: string; inputs: Record<string, unknown>; expect: string };
export type Plan = { goal: string; depth: Depth; steps: Step[] };
export type StepView = { id: string; powerId: string; mode: Mode; level: number | null };
export type PlanCheck = { ok: boolean; issues: string[]; view: StepView[]; needsConfirm: string[] };

export function checkPlan(plan: Plan, reg: Registry, kill: KillState): PlanCheck {
  const issues: string[] = []; const view: StepView[] = []; const needsConfirm: string[] = [];
  if (plan.steps.length === 0) issues.push('plan has no steps');
  if (plan.steps.length > BUDGETS[plan.depth].maxSteps) issues.push(`too many steps for ${plan.depth} (max ${BUDGETS[plan.depth].maxSteps})`);
  const seen = new Set<string>();
  for (const s of plan.steps) {
    if (seen.has(s.id)) issues.push(`duplicate step id ${s.id}`); seen.add(s.id);
    if (!s.expect.trim()) issues.push(`step ${s.id} has no expected result`);
    const g = gate(reg, s.powerId, kill);
    view.push({ id: s.id, powerId: s.powerId, mode: g.mode, level: g.level });
    if (!g.allow) issues.push(`step ${s.id}: ${g.reason}`);
    if (g.mode === 'ask_confirm') needsConfirm.push(s.id);
  }
  return { ok: issues.length === 0, issues, view, needsConfirm };
}

export type RunIO = {
  kill(): Promise<KillState>;
  confirm(step: Step): Promise<boolean>;
  run(step: Step): Promise<{ ok: boolean; error?: string }>;
  replan(plan: Plan, failed: Step, error: string): Promise<Plan | null>;
};
export type RunResult = { status: 'done' | 'halted' | 'blocked' | 'needs_help'; completed: string[]; reason: string };
export const LIMITS = { retriesPerStep: 1, replans: 2 };

export async function executePlan(plan: Plan, reg: Registry, io: RunIO): Promise<RunResult> {
  const completed: string[] = []; let replans = 0; let steps = plan.steps; let i = 0; let executed = 0;
  const cap = BUDGETS[plan.depth].maxSteps + LIMITS.replans * BUDGETS[plan.depth].maxSteps;
  while (i < steps.length) {
    const s = steps[i];
    const k = await io.kill();
    if (k !== 'off') return { status: 'halted', completed, reason: 'kill switch ON or unreadable: stopped' };
    if (++executed > cap) return { status: 'needs_help', completed, reason: 'step limit reached' };
    const g = gate(reg, s.powerId, k);
    if (!g.allow) return { status: 'blocked', completed, reason: `step ${s.id}: ${g.reason}` };
    if (g.mode === 'ask_confirm' && !(await io.confirm(s))) return { status: 'blocked', completed, reason: `step ${s.id}: not confirmed` };
    if ((await io.kill()) !== 'off') return { status: 'halted', completed, reason: 'kill switch turned ON before the step' };
    const p = reg.get(s.powerId)!;
    let r = await io.run(s);
    // never auto-retry something that cannot be undone (could double-send / double-pay)
    if (!r.ok && p.reversible && (p.tags?.length ?? 0) === 0) for (let a = 0; a < LIMITS.retriesPerStep && !r.ok; a++) r = await io.run(s);
    if (r.ok) { completed.push(s.id); i++; continue; }
    if (!p.reversible || (p.tags?.length ?? 0) > 0) return { status: 'needs_help', completed, reason: `step ${s.id} failed on a risky power: no auto-retry, asking Amit` };
    if (replans >= LIMITS.replans) return { status: 'needs_help', completed, reason: `step ${s.id} failed after retries and ${replans} re-plans` };
    const np = await io.replan({ ...plan, steps }, s, r.error ?? 'failed'); replans++;
    if (!np || np.steps.length === 0) return { status: 'needs_help', completed, reason: `step ${s.id} failed and no new plan` };
    const chk = checkPlan(np, reg, k); if (!chk.ok) return { status: 'blocked', completed, reason: `new plan refused: ${chk.issues[0]}` };
    steps = np.steps; i = 0;
  }
  return { status: 'done', completed, reason: 'all steps done' };
}
