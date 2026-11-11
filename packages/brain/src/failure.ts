// Failure and kill-switch behaviour in one place.
export const KILL_MESSAGE = 'Kill switch ON hai, main kuch nahi kar raha.';
export type Running = { traceId: string; status: 'running' | 'halted' };
// On kill: everything stops at once. Nothing new is started. We do NOT run "cleanup" that acts on the world; we only mark and log.
export function onKill(running: Running[]): { halted: Running[]; message: string } {
  return { halted: running.map((r) => ({ ...r, status: 'halted' as const })), message: KILL_MESSAGE };
}
// After kill: only Amit turning it OFF resumes. JARVIS never turns it off. A halted plan is not resumed automatically.
export const MAY_JARVIS_TURN_KILL_OFF = false;
export function helpMessage(what: string, why: string): string { return `Mujhe madad chahiye: ${what}. Wajah: ${why}.`; }
export const FALLBACKS = ['retry once (only if reversible)', 'safer alternative power', 're-plan (max 2)', 'ask Amit for help'] as const;
