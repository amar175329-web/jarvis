// Power registry: every capability JARVIS has. A NEW connection/plugin/skill = a NEW ROW here. No brain code changes.
// Unknown power => fail closed (see gate.ts). New power starts at L0 until Amit raises it.
import { type Level, isLevel, DANGEROUS_MAX } from './levels.ts';

export type Tag = 'money' | 'health' | 'secret' | 'message' | 'personal';
export type Power = {
  id: string; name: string; owner_squad: string; description?: string | null;
  autonomy_default: Level; autonomy_current: Level; max_level: Level;
  needs_confirm: boolean; reversible: boolean; tags?: Tag[];
};
export const POWER_ID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/; // same rule as the database check

export type Registry = { get(id: string): Power | undefined; list(): Power[]; has(id: string): boolean };

export function validatePower(p: Power): string[] {
  const e: string[] = [];
  if (!POWER_ID.test(p.id)) e.push('id must look like area.action (lowercase, digits, hyphens)');
  for (const k of ['autonomy_default', 'autonomy_current', 'max_level'] as const) if (!isLevel(p[k])) e.push(`${k} must be 0-4`);
  if (isLevel(p.max_level)) {
    if (p.autonomy_current > p.max_level) e.push('autonomy_current is above max_level');
    if (p.autonomy_default > p.max_level) e.push('autonomy_default is above max_level');
  }
  const risky = !p.reversible || (p.tags?.length ?? 0) > 0;
  if (risky && p.max_level > DANGEROUS_MAX) e.push('dangerous or tagged power must have max_level <= 2');
  if (p.max_level === 4 && !p.reversible) e.push('L4 is only for reversible things');
  return e;
}

export function makeRegistry(powers: Power[]): Registry {
  const m = new Map<string, Power>();
  for (const p of powers) {
    const errs = validatePower(p);
    if (errs.length) throw new Error(`bad power ${p.id}: ${errs.join('; ')}`);
    if (m.has(p.id)) throw new Error(`duplicate power ${p.id}`);
    m.set(p.id, p);
  }
  return { get: (id) => m.get(id), list: () => [...m.values()], has: (id) => m.has(id) };
}

// For plugins / new connections: build a safe new power. Always starts at L0 (observe) and needs confirm.
export function newPlugPower(a: { id: string; name: string; owner_squad: string; description?: string; dangerous: boolean; max_level?: Level; tags?: Tag[] }): Power {
  const cap: Level = a.dangerous ? Math.min(a.max_level ?? DANGEROUS_MAX, DANGEROUS_MAX) as Level : (a.max_level ?? 3);
  return { id: a.id, name: a.name, owner_squad: a.owner_squad, description: a.description ?? null, autonomy_default: 0, autonomy_current: 0, max_level: cap, needs_confirm: true, reversible: !a.dangerous, tags: a.tags };
}
