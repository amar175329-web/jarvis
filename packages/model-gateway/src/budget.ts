import type { Budget, ModelSpec, Price, UsageSummary } from './types.ts';

export const modelKey = (s: { provider: string; model: string }) => `${s.provider}/${s.model}`;
export const computeCost = (tokensIn: number, tokensOut: number, p: Price): number => (tokensIn * p.in_per_mtok + tokensOut * p.out_per_mtok) / 1_000_000;
/** Worst case cost of one call: all estimated input tokens + the full output allowance. Free models cost 0. */
export function worstCaseCost(spec: ModelSpec, estIn: number, maxOut: number): number | null {
  if (spec.free) return 0;
  return spec.price ? computeCost(estIn, maxOut, spec.price) : null;
}

export type BudgetDecision = { allow: true; warning?: string } | { allow: false; code: 'budget_exceeded' | 'unpriced_model'; message: string };

export function checkBudget(a: { budget: Budget; usage: UsageSummary; spec: ModelSpec; estIn: number; maxOut: number }): BudgetDecision {
  const { budget, usage, spec } = a;
  const worst = worstCaseCost(spec, a.estIn, a.maxOut);
  if (worst === null) return { allow: false, code: 'unpriced_model', message: `no price set for ${modelKey(spec)}; add it to the model prices before using it` };
  const key = modelKey(spec);
  const reqs = usage.modelDayRequests[key] ?? 0;
  if (spec.maxRequestsPerDay !== undefined && reqs >= spec.maxRequestsPerDay) return { allow: false, code: 'budget_exceeded', message: `${key}: today's free request limit (${spec.maxRequestsPerDay}) is used up` };
  const limits: [string, number | undefined, number][] = [
    ['daily budget', budget.perDayUsd, usage.dayUsd],
    ['monthly budget', budget.perMonthUsd, usage.monthUsd],
    [`${key} daily budget`, budget.perModelDayUsd?.[key], usage.modelDayUsd[key] ?? 0],
  ];
  const warnAt = budget.warnAt ?? 0.8; let warning: string | undefined;
  for (const [name, cap, used] of limits) {
    if (cap === undefined) continue;
    if (used + worst > cap + 1e-12) return { allow: false, code: 'budget_exceeded', message: `${name} of $${cap} would be exceeded (used $${used.toFixed(4)}, this call could cost up to $${worst.toFixed(4)})` };
    if (cap > 0 && (used + worst) / cap >= warnAt) warning = `${name}: ${Math.round(((used + worst) / cap) * 100)}% used`;
  }
  return warning ? { allow: true, warning } : { allow: true };
}
