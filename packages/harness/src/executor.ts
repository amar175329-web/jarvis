// The single execution gateway for powers in JARVIS runtime.
// Every power execution MUST flow through executePower, which evaluates brain gate()
// with safety kill switch state fail-closed before invoking the power action.
import { gate, type GateResult, type KillState } from '../../brain/src/gate.ts';
import type { Registry } from '../../brain/src/power-registry.ts';
import { readKillSwitch, type KillSwitchStore } from '../../safety/src/index.ts';

export interface DecisionLogEntry {
  powerId: string;
  ownerId: string;
  timestamp: string;
  gateResult: GateResult;
  executed: boolean;
  confirmed?: boolean;
  error?: string;
  durationMs?: number;
}

export interface ExecutePowerOptions<T> {
  reg: Registry;
  powerId: string;
  store: KillSwitchStore;
  ownerId: string;
  confirmed?: boolean;
  run: () => Promise<T> | T;
  onDecisionLog?: (entry: DecisionLogEntry) => void | Promise<void>;
}

export interface ExecutePowerResult<T> {
  executed: boolean;
  gate: GateResult;
  result?: T;
  error?: Error;
  decisionLog: DecisionLogEntry;
}

export async function executePower<T>(
  options: ExecutePowerOptions<T>
): Promise<ExecutePowerResult<T>> {
  const { reg, powerId, store, ownerId, confirmed = false, run, onDecisionLog } = options;

  // 1. Read kill switch state fail-closed
  const killRes = await readKillSwitch(store, ownerId);
  let killState: KillState = 'unreadable';
  if (killRes.ok) {
    killState = killRes.state.kill ? 'on' : 'off';
  } else {
    killState = 'unreadable';
  }

  // 2. Evaluate brain gate policy
  const gateResult = gate(reg, powerId, killState);

  const start = Date.now();
  const decisionLog: DecisionLogEntry = {
    powerId,
    ownerId,
    timestamp: new Date().toISOString(),
    gateResult,
    executed: false,
    confirmed,
  };

  // 3. Permission checks
  if (!gateResult.allow) {
    if (onDecisionLog) await onDecisionLog(decisionLog);
    return { executed: false, gate: gateResult, decisionLog };
  }

  // L2 requires explicit confirmation
  if (gateResult.mode === 'ask_confirm' && !confirmed) {
    decisionLog.error = 'L2 power requires explicit confirmation';
    if (onDecisionLog) await onDecisionLog(decisionLog);
    return {
      executed: false,
      gate: gateResult,
      error: new Error('L2 power requires explicit confirmation'),
      decisionLog,
    };
  }

  // 4. Safe execution of the power
  try {
    const result = await run();
    decisionLog.executed = true;
    decisionLog.durationMs = Date.now() - start;
    if (onDecisionLog) await onDecisionLog(decisionLog);
    return { executed: true, gate: gateResult, result, decisionLog };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    decisionLog.executed = false;
    decisionLog.error = error.message;
    decisionLog.durationMs = Date.now() - start;
    if (onDecisionLog) await onDecisionLog(decisionLog);
    return { executed: false, gate: gateResult, error, decisionLog };
  }
}
