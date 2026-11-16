// INR display + INR budget conversion. NO hardcoded rate: a missing rate means "unknown": callers fail closed / hide INR.
export type Fx = { inrPerUsd: number; source: 'env' | 'settings'; checked_on?: string; stale: boolean };
const STALE_DAYS = 7;
export function readFx(a: { env?: Record<string, string | undefined>; settings?: { inr_per_usd?: number; checked_on?: string } | null; now: Date }): Fx | null {
  const e = Number(a.env?.INR_PER_USD);
  if (Number.isFinite(e) && e > 0) return { inrPerUsd: e, source: 'env', stale: false };
  const s = a.settings;
  if (s && Number.isFinite(s.inr_per_usd) && (s.inr_per_usd as number) > 0) {
    const age = s.checked_on ? (a.now.getTime() - new Date(s.checked_on + 'T00:00:00Z').getTime()) / 86_400_000 : Infinity;
    return { inrPerUsd: s.inr_per_usd as number, source: 'settings', checked_on: s.checked_on, stale: age > STALE_DAYS };
  }
  return null;
}
export const usdToInr = (usd: number, fx: Fx | null): number | null => (fx ? usd * fx.inrPerUsd : null);
export const inrToUsd = (inr: number, fx: Fx | null): number | null => (fx ? inr / fx.inrPerUsd : null);
export function formatMoney(usd: number, fx: Fx | null, wantInr: boolean): string {
  const u = `$${usd.toFixed(usd < 0.01 ? 5 : 4)}`;
  const inr = wantInr ? usdToInr(usd, fx) : null;
  return inr === null ? u : `${u} (~Rs ${inr.toFixed(2)})`;
}
