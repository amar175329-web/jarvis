// Small things every part of JARVIS needs. No dependencies. Keep this tiny: anything bigger gets its own package.

// ----- time you can fake in tests -----
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
export const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });
}

// ----- kill switch, as every worker/gateway/agent sees it -----
// The kill switch lives in the database (system_state). Anything that acts must check it first. FAIL-CLOSED: if we cannot read it, we act as if it is ON.
export type KillState = { kill: boolean; epoch: number };
export interface KillSwitchReader { read(): Promise<KillState> }
export class KilledError extends Error {
  constructor(message = 'kill switch is on') { super(message); this.name = 'KilledError'; }
}
export async function readKillFailClosed(reader: KillSwitchReader): Promise<KillState> {
  try {
    const s = await reader.read();
    if (typeof s?.kill !== 'boolean' || !Number.isInteger(s?.epoch)) return { kill: true, epoch: -1 };
    return s;
  } catch { return { kill: true, epoch: -1 }; }
}
export async function assertNotKilled(reader: KillSwitchReader): Promise<KillState> {
  const s = await readKillFailClosed(reader);
  if (s.kill) throw new KilledError();
  return s;
}

// ----- errors that say whether trying again can help -----
export class NonRetryableError extends Error {
  constructor(message: string) { super(message); this.name = 'NonRetryableError'; }
}

// ----- retry waiting time: base * 2^(attempt-1), capped, with jitter (0..1 from `rand`) -----
export function backoffMs(attempt: number, baseMs = 2000, maxMs = 5 * 60_000, rand: () => number = Math.random): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + (exp / 2) * rand());
}

export function newId(): string { return crypto.randomUUID(); }
