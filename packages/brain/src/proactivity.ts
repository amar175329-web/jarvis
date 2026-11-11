// When JARVIS speaks without being asked. Amit chose "zyada": no tight daily cap; focus mode = silent.
// Anti-spam guards (hourly cap, topic cooldown) are tunable defaults.
import type { KillState } from './gate.ts';
export type Topic = 'reminder' | 'clash' | 'briefing' | 'pattern' | 'info' | 'failure';
export type Cue = { id: string; topic: Topic; priority: 'urgent' | 'normal' | 'low'; userSet?: boolean };
export type Spoken = { id: string; topic: Topic; at: number };
export type PState = { focus: boolean; kill: KillState; spoken: Spoken[] };
export type PPolicy = { quietStartHour: number; quietEndHour: number; perHourCap: number; topicCooldownMin: number };
export const DEFAULT_PPOLICY: PPolicy = { quietStartHour: 23, quietEndHour: 6, perHourCap: 6, topicCooldownMin: 20 };
export type SpeakDecision = { act: 'speak' | 'queue' | 'drop'; reason: string };

export function istHour(now: Date): number { return new Date(now.getTime() + 5.5 * 3600_000).getUTCHours(); }
export function inQuiet(now: Date, p: PPolicy): boolean {
  const h = istHour(now); return p.quietStartHour > p.quietEndHour ? h >= p.quietStartHour || h < p.quietEndHour : h >= p.quietStartHour && h < p.quietEndHour;
}
export function decideSpeak(cue: Cue, st: PState, now: Date, pol: PPolicy = DEFAULT_PPOLICY): SpeakDecision {
  if (st.kill !== 'off') return { act: 'drop', reason: 'kill switch ON or unreadable: stay silent' };
  if (st.spoken.some((s) => s.id === cue.id)) return { act: 'drop', reason: 'already told' };
  if (st.focus) return { act: 'queue', reason: 'focus mode: hold for the digest after focus ends' };
  if (inQuiet(now, pol) && !(cue.userSet && cue.topic === 'reminder')) return { act: 'queue', reason: 'quiet hours (only reminders Amit set himself may speak)' };
  if (cue.priority === 'low') return { act: 'queue', reason: 'low priority goes to the digest' };
  if (cue.priority === 'urgent') return { act: 'speak', reason: 'urgent' };
  const t = now.getTime();
  if (st.spoken.filter((s) => t - s.at < 3600_000).length >= pol.perHourCap) return { act: 'queue', reason: 'hourly limit reached' };
  if (st.spoken.some((s) => s.topic === cue.topic && t - s.at < pol.topicCooldownMin * 60_000)) return { act: 'queue', reason: 'same topic just told' };
  return { act: 'speak', reason: 'ok to speak' };
}
