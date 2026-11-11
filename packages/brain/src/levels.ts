// Autonomy levels. ONLY L0-L4 exist (no low/medium/high). Numbers 0-4 match the powers table.
export type Level = 0 | 1 | 2 | 3 | 4;
export const LEVEL_MEANING: Record<Level, string> = {
  0: 'observe only', 1: 'suggest', 2: 'act after Amit confirms', 3: 'act, then tell Amit', 4: 'act silently (safe + reversible only)',
};
export const DANGEROUS_MAX: Level = 2; // pay, send/call, delete, install, share personal data: never above L2
export function isLevel(n: unknown): n is Level { return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 4; }
export function label(n: Level): string { return `L${n}`; }
export function clamp(n: number, cap: Level): Level {
  const v = Math.max(0, Math.min(4, Math.trunc(n)));
  return Math.min(v, cap) as Level;
}
