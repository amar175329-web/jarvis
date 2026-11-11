import { readKillFailClosed, type KillState, type KillSwitchReader } from '../../shared/src/index.ts';

export type KillActor =
  | { kind: 'owner'; ownerId: string; email: string }
  | { kind: 'device'; ownerId: string; deviceId: string };
export type KillStateRecord = KillState & { changed_at?: string };
export interface KillSwitchStore {
  read(ownerId: string): Promise<KillStateRecord | null>;
  write(ownerId: string, kill: boolean, changedBy: string, reason?: string): Promise<KillStateRecord | null>;
}
export type KillReadResult =
  | { ok: true; state: KillStateRecord }
  | { ok: false; code: 'unavailable'; failClosed: KillState };
export type KillWriteResult =
  | { ok: true; state: KillStateRecord }
  | { ok: false; code: 'forbidden' | 'unavailable'; failClosed?: KillState };

export async function readKillSwitch(store: KillSwitchStore, ownerId: string): Promise<KillReadResult> {
  let observed: KillStateRecord | null = null;
  const reader: KillSwitchReader = { read: async () => {
    observed = await store.read(ownerId);
    if (!observed || typeof observed.kill !== 'boolean' || !Number.isInteger(observed.epoch) || observed.epoch < 0) throw new Error('kill state missing or malformed');
    return observed;
  } };
  const safe = await readKillFailClosed(reader);
  if (safe.epoch < 0 || !observed) return { ok: false, code: 'unavailable', failClosed: { kill: true, epoch: -1 } };
  return { ok: true, state: observed };
}

export async function setKillSwitch(store: KillSwitchStore, actor: KillActor, kill: boolean, reason?: string): Promise<KillWriteResult> {
  if (actor.kind === 'device' && kill === false) return { ok: false, code: 'forbidden' };
  if (!kill) {
    const current = await readKillSwitch(store, actor.ownerId);
    if (!current.ok) return { ok: false, code: 'unavailable', failClosed: current.failClosed };
  }
  const changedBy = actor.kind === 'owner' ? `owner:${actor.email}` : `device:${actor.deviceId}`;
  try {
    const state = await store.write(actor.ownerId, kill, changedBy, reason?.slice(0, 500));
    if (!state || typeof state.kill !== 'boolean' || !Number.isInteger(state.epoch) || state.epoch < 0) {
      return { ok: false, code: 'unavailable', failClosed: { kill: true, epoch: -1 } };
    }
    return { ok: true, state };
  } catch {
    return { ok: false, code: 'unavailable', failClosed: { kill: true, epoch: -1 } };
  }
}
