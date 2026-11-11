// Thinking depth router. Rules first (cheap, no model call). Every number below is a TUNABLE default.
import type { GateResult } from './gate.ts';
export type Depth = 'FAST' | 'NORMAL' | 'DEEP';
export type Budget = { maxOutputTokens: number; maxMs: number; maxSteps: number };
export const BUDGETS: Record<Depth, Budget> = {
  FAST: { maxOutputTokens: 300, maxMs: 3000, maxSteps: 1 },
  NORMAL: { maxOutputTokens: 1500, maxMs: 15000, maxSteps: 5 },
  DEEP: { maxOutputTokens: 6000, maxMs: 60000, maxSteps: 12 },
};
export type RouteInput = { text: string; power?: GateResult | null; tags?: string[]; ambiguous?: boolean; failedBefore?: boolean };
export type Route = { depth: Depth; reason: string; budget: Budget };

const RISKY = /(paisa|पैसा|pay|payment|भुगतान|transfer|buy|kharid|खरीद|bhej|भेज|send|call|delete|हटा|मिटा|install|password|पासवर्ड|share)/i;
const MULTI = /(\baur phir\b|और फिर|\bthen\b|\bafter that\b|step by step|plan|योजना|\bsab\b.*\bkar\b)/i;
const GREET = /^(hi|hello|hey|namaste|नमस्ते|हाय|thanks|shukriya|धन्यवाद|ok|okay|theek hai|ठीक है)\W*$/i;

export function route(i: RouteInput): Route {
  const t = i.text.trim();
  const mk = (depth: Depth, reason: string): Route => ({ depth, reason, budget: BUDGETS[depth] });
  if ((i.tags?.length ?? 0) > 0) return mk('DEEP', 'money/secret/message/personal power');
  if (RISKY.test(t)) return mk('DEEP', 'risky words (money, message, delete, install, password)');
  if (i.power && (i.power.level ?? 0) <= 2 && i.power.mode === 'ask_confirm') return mk('DEEP', 'power needs confirmation');
  if (i.ambiguous) return mk('DEEP', 'ambiguous request');
  if (i.failedBefore) return mk('DEEP', 'escalated after failure');
  if (MULTI.test(t) || t.length > 280) return mk('NORMAL', 'multi-step or long request');
  if (GREET.test(t) || t.length <= 40) return mk('FAST', 'short/simple');
  return mk('NORMAL', 'default');
}
export function escalate(d: Depth): Depth { return d === 'FAST' ? 'NORMAL' : 'DEEP'; }
