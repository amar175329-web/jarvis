// When to ask ONE short question vs pick a sensible default and say so. Thresholds are tunable defaults.
import type { Power } from './power-registry.ts';
export const THRESH = { proceed: 0.85, defaultAndSay: 0.5, capped: 0.95 };
export type Ambiguity = { action: 'proceed' | 'default_and_say' | 'ask_one'; reason: string };

export function decideAmbiguity(confidence: number, power?: Pick<Power, 'max_level' | 'reversible' | 'tags'> | null): Ambiguity {
  const c = Math.max(0, Math.min(1, confidence));
  const capped = !!power && (power.max_level <= 2 || !power.reversible || (power.tags?.length ?? 0) > 0);
  // never guess on anything capped at L2 or below: it must be clearly stated, else ask
  if (capped) return c >= THRESH.capped ? { action: 'proceed', reason: 'clear instruction on a capped power' } : { action: 'ask_one', reason: 'capped power: never guess' };
  if (c >= THRESH.proceed) return { action: 'proceed', reason: 'confident' };
  if (c >= THRESH.defaultAndSay) return { action: 'default_and_say', reason: 'safe default, will say which one' };
  return { action: 'ask_one', reason: 'too unsure' };
}
// ONE question, max 3 tappable options (Amit prefers options on screen), short Hinglish.
export function oneQuestion(q: string, options: string[]): { text: string; options: string[] } {
  if (!q.trim()) throw new Error('question is empty');
  return { text: q.trim().replace(/\?+$/, '') + '?', options: options.slice(0, 3) };
}
