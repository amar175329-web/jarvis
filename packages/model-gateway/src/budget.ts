import type { Budget, ModelSpec, Price, UsageSummary } from './types.ts';

export const modelKey = (s: { provider: string; model: string }) => `${s.provider}/${s.model}`;

export type CacheTokensInput = {
  cacheRead?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
};

export function computeCost(
  tokensIn: number,
  tokensOut: number,
  p: Price,
  cache?: CacheTokensInput
): number {
  const cRead = cache?.cacheRead ?? 0;
  const cWrite5m = cache?.cacheWrite5m ?? 0;
  const cWrite1h = cache?.cacheWrite1h ?? 0;
  const totalInputTokens = tokensIn + cRead + cWrite5m + cWrite1h;

  const useBracket = Boolean(p.bracket && totalInputTokens > p.bracket.over_prompt_tokens);
  const inRate = useBracket ? p.bracket!.in_per_mtok : p.in_per_mtok;
  const outRate = useBracket ? p.bracket!.out_per_mtok : p.out_per_mtok;

  const cacheReadRate = useBracket
    ? (p.bracket!.cache_read_per_mtok ?? p.cache_read_per_mtok ?? inRate)
    : (p.cache_read_per_mtok ?? inRate);

  const cacheWrite5mRate = useBracket
    ? (p.bracket!.cache_write_5m_per_mtok ?? p.cache_write_5m_per_mtok ?? inRate)
    : (p.cache_write_5m_per_mtok ?? inRate);

  const cacheWrite1hRate = useBracket
    ? (p.bracket!.cache_write_1h_per_mtok ?? p.cache_write_1h_per_mtok ?? inRate)
    : (p.cache_write_1h_per_mtok ?? inRate);

  return (
    tokensIn * inRate +
    tokensOut * outRate +
    cRead * cacheReadRate +
    cWrite5m * cacheWrite5mRate +
    cWrite1h * cacheWrite1hRate
  ) / 1_000_000;
}

/** Worst case cost of one call: all estimated input tokens + the full output allowance. Free models cost 0. Always calculated from the most expensive price tier. */
export function worstCaseCost(spec: ModelSpec, estIn: number, maxOut: number): number | null {
  if (spec.free) return 0;
  if (!spec.price) return null;
  const p = spec.price;
  const baseCost = computeCost(estIn, maxOut, { in_per_mtok: p.in_per_mtok, out_per_mtok: p.out_per_mtok });
  if (!p.bracket) return baseCost;
  const bracketCost = computeCost(estIn, maxOut, { in_per_mtok: p.bracket.in_per_mtok, out_per_mtok: p.bracket.out_per_mtok });
  return Math.max(baseCost, bracketCost);
}

/**
 * Computes start of day (midnight 00:00:00) in the given IANA timezone for the instant `now`, accounting for DST.
 * Default timezone is Asia/Kolkata.
 */
export function startOfDayInTz(now: Date, tz: string = 'Asia/Kolkata'): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;
  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);

  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);

  const dFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  function getOffsetMs(instantMs: number): number {
    const p: Record<string, string> = {};
    for (const item of dFmt.formatToParts(new Date(instantMs))) p[item.type] = item.value;
    const localUtc = Date.UTC(
      parseInt(p.year, 10),
      parseInt(p.month, 10) - 1,
      parseInt(p.day, 10),
      parseInt(p.hour, 10),
      parseInt(p.minute, 10),
      parseInt(p.second, 10)
    );
    return localUtc - instantMs;
  }

  for (let i = 0; i < 3; i++) {
    const offset = getOffsetMs(guess);
    const targetLocal = Date.UTC(year, month - 1, day, 0, 0, 0);
    const currentLocal = guess + offset;
    const diff = targetLocal - currentLocal;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
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
