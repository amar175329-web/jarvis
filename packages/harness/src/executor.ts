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
  logError?: string;
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
  logError?: string;
  decisionLog: DecisionLogEntry;
}

async function emitLog(
  onDecisionLog: ((entry: DecisionLogEntry) => void | Promise<void>) | undefined,
  entry: DecisionLogEntry
): Promise<string | undefined> {
  if (!onDecisionLog) return undefined;
  try {
    await onDecisionLog(entry);
    return undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    entry.logError = msg;
    return msg;
  }
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
    const logError = await emitLog(onDecisionLog, decisionLog);
    return { executed: false, gate: gateResult, logError, decisionLog };
  }

  // L2 requires explicit confirmation
  if (gateResult.mode === 'ask_confirm' && !confirmed) {
    decisionLog.error = 'L2 power requires explicit confirmation';
    const logError = await emitLog(onDecisionLog, decisionLog);
    return {
      executed: false,
      gate: gateResult,
      error: new Error('L2 power requires explicit confirmation'),
      logError,
      decisionLog,
    };
  }

  // 4. Safe execution of the power: isolate run() from logging
  let runResult: T;
  try {
    runResult = await run();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    decisionLog.executed = false;
    decisionLog.error = error.message;
    decisionLog.durationMs = Date.now() - start;
    const logError = await emitLog(onDecisionLog, decisionLog);
    return { executed: false, gate: gateResult, error, logError, decisionLog };
  }

  // run() succeeded: mark executed true, logging failure must never mask success
  decisionLog.executed = true;
  decisionLog.durationMs = Date.now() - start;
  const logError = await emitLog(onDecisionLog, decisionLog);
  return { executed: true, gate: gateResult, result: runResult, logError, decisionLog };
}
