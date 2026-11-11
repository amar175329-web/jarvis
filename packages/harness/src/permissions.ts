// Harness permission enforcement: calls brain's gate() before every power execution,
// translating kill state from safety (fail-closed).
import { gate, type GateResult, type KillState } from '../../brain/src/gate.ts';
import type { Registry } from '../../brain/src/power-registry.ts';
import { readKillSwitch, type KillSwitchStore } from '../../safety/src/index.ts';

export async function checkPowerPermission(
  reg: Registry,
  powerId: string,
  store: KillSwitchStore,
  ownerId: string
): Promise<GateResult> {
  const killRes = await readKillSwitch(store, ownerId);
  let killState: KillState = 'unreadable';
  if (killRes.ok) {
    killState = killRes.state.kill ? 'on' : 'off';
  } else {
    killState = 'unreadable';
  }
  return gate(reg, powerId, killState);
}
