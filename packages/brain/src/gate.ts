// The ONE gate every acting squad calls before using a power. Brain = policy. Enforcement is harness/permissions; kill switch is safety/.
import { type Level } from './levels.ts';
import type { Power, Registry } from './power-registry.ts';

export type KillState = 'off' | 'on' | 'unreadable'; // unreadable is treated as ON
export type Mode = 'deny' | 'observe' | 'suggest' | 'ask_confirm' | 'act_then_tell' | 'act_silent';
export type GateResult = { allow: boolean; mode: Mode; level: Level | null; reason: string };

export function gate(reg: Registry, powerId: string, kill: KillState): GateResult {
  if (kill !== 'off') return { allow: false, mode: 'deny', level: null, reason: kill === 'on' ? 'kill switch is ON' : 'kill switch unreadable: treated as ON' };
  const p = reg.get(powerId);
  if (!p) return { allow: false, mode: 'deny', level: null, reason: 'unknown power: register it first (starts at L0)' };
  return fromPower(p);
}

export function fromPower(p: Power): GateResult {
  let lvl = Math.min(p.autonomy_current, p.max_level) as Level;
  const risky = !p.reversible || (p.tags?.length ?? 0) > 0;
  if (risky && lvl > 2) lvl = 2;
  if (lvl === 4 && !p.reversible) lvl = 3;
  switch (lvl) {
    case 0: return { allow: false, mode: 'observe', level: 0, reason: 'L0: observe only' };
    case 1: return { allow: false, mode: 'suggest', level: 1, reason: 'L1: suggest only' };
    case 2: return { allow: true, mode: 'ask_confirm', level: 2, reason: 'L2: act only after Amit confirms' };
    case 3: return { allow: true, mode: 'act_then_tell', level: 3, reason: 'L3: act, then tell Amit' };
    default: return { allow: true, mode: 'act_silent', level: 4, reason: 'L4: silent (safe and reversible)' };
  }
}
