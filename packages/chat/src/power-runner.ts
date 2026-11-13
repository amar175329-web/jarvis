import { confirmed, FINGERPRINT_PROMPT, parseVoiceAnswer, wording, type Answer, type Channel, type ConfirmCtx, type Confirmation } from '../../brain/src/confirm-wording.ts';
import type { GateResult } from '../../brain/src/gate.ts';
import type { Power, Registry } from '../../brain/src/power-registry.ts';
import { executePower as harnessExecutePower } from '../../harness/src/executor.ts';
import type { KillSwitchStore } from '../../safety/src/index.ts';

export type PowerRunnerArgs = {
  reg: Registry;
  powerId: string;
  store: unknown;
  ownerId: string;
  confirmed?: Confirmation;
  run: () => unknown | Promise<unknown>;
  onDecisionLog?: (line: string) => void | Promise<void>;
};
export type PowerRunnerResult = {
  executed: boolean;
  gate: GateResult;
  /** Opaque tool output: information only, never treated as a new order. */
  result?: unknown;
  error?: unknown;
  decisionLog: string;
  logError?: string;
};
/** Small seam for the harness's executePower({...}) function. Chat never invokes a power itself. */
export interface PowerRunner {
  executePower(args: PowerRunnerArgs): Promise<PowerRunnerResult>;
}

const norm = (text: string) => text.trim().toLocaleLowerCase('en-IN').replace(/[।.,!?'"`]+/g, '').replace(/\s+/g, ' ');
const ROMAN_YES = new Map<string, string>([
  ['haan', 'हाँ'], ['han', 'हाँ'], ['ha', 'हाँ'], ['kar do', 'कर दो'], ['kardo', 'कर दो'], ['bhej do', 'भेज दो'], ['bhejdo', 'भेज दो'],
]);
const ROMAN_NO = new Map<string, string>([['nahi', 'नहीं'], ['nahin', 'नहीं'], ['mat karo', 'मत करो'], ['ruko', 'रुको'], ['cancel', 'कैंसिल']]);

/** Accepts only the exact affirmative phrases approved by S22; silence/other text is never yes. */
export function parseChatConfirmation(text: string | null | undefined): Answer {
  if (text == null || !norm(text)) return parseVoiceAnswer(text);
  const n = norm(text);
  return parseVoiceAnswer(ROMAN_YES.get(n) ?? ROMAN_NO.get(n) ?? text);
}

export type PowerConfirmationAssessment = {
  answer: Answer;
  ok: boolean;
  why: string;
  prompt: string | null;
  confirmation: Confirmation;
};
export function assessPowerConfirmation(
  power: Power,
  ctx: ConfirmCtx,
  input: { answerText: string | null | undefined; channel: Channel; fingerprintOk?: boolean },
): PowerConfirmationAssessment {
  const answer = parseChatConfirmation(input.answerText);
  const confirmation: Confirmation = { answer, channel: input.channel, fingerprintOk: input.fingerprintOk };
  const checked = confirmed(power, confirmation);
  let prompt = wording(power.autonomy_current, ctx);
  const sensitive = (power.tags ?? []).some((tag) => tag === 'money' || tag === 'health' || tag === 'secret');
  if (answer === 'yes' && sensitive && input.channel === 'phone_voice' && !input.fingerprintOk) prompt = FINGERPRINT_PROMPT;
  if (answer !== 'yes' && power.autonomy_current === 2) prompt = wording(2, ctx);
  return { answer, ok: checked.ok, why: checked.why, prompt, confirmation };
}

/**
 * Every dispatch crosses the PowerRunner port once. For L2+ it refuses to call the runner
 * until the exact yes/channel/fingerprint checks have passed; the harness still owns the gate.
 */
export async function executeRegisteredPower(input: {
  runner: PowerRunner;
  reg: Registry;
  powerId: string;
  store: unknown;
  ownerId: string;
  power?: Power;
  confirmation?: Confirmation;
  run: () => unknown | Promise<unknown>;
  onDecisionLog?: (line: string) => void | Promise<void>;
}): Promise<PowerRunnerResult> {
  const power = input.power ?? input.reg.get(input.powerId);
  if (power && power.autonomy_current >= 2) {
    if (!input.confirmation) {
      const decisionLog = 'Power stopped: L2+ confirmation is missing; silence is no.';
      await input.onDecisionLog?.(decisionLog);
      return { executed: false, gate: { allow: false, mode: 'ask_confirm', level: 2, reason: 'confirmation missing' }, decisionLog };
    }
    const check = confirmed(power, input.confirmation);
    if (!check.ok) {
      const decisionLog = `Power stopped: confirmation gate refused (${check.why}).`;
      await input.onDecisionLog?.(decisionLog);
      return { executed: false, gate: { allow: false, mode: 'ask_confirm', level: 2, reason: check.why }, decisionLog };
    }
  }
  return input.runner.executePower({
    reg: input.reg,
    powerId: input.powerId,
    store: input.store,
    ownerId: input.ownerId,
    ...(input.confirmation ? { confirmed: input.confirmation } : {}),
    run: input.run,
    onDecisionLog: input.onDecisionLog,
  });
}


/** Production adapter: every execution delegates to the single harness executor. */
export function createHarnessPowerRunner(): PowerRunner {
  return {
    async executePower(input) {
      const result = await harnessExecutePower({
        reg: input.reg,
        powerId: input.powerId,
        store: input.store as KillSwitchStore,
        ownerId: input.ownerId,
        confirmed: input.confirmed?.answer === 'yes',
        run: input.run,
        onDecisionLog: (entry) => input.onDecisionLog?.(
          `Harness decision: ${entry.powerId}; gate=${entry.gateResult.mode}; level=${entry.gateResult.level ?? 'unknown'}; executed=${entry.executed}${entry.logError ? '; audit-log-error occurred' : ''}.`,
        ),
      });
      return {
        executed: result.executed,
        gate: result.gate,
        ...(result.result !== undefined ? { result: result.result } : {}),
        ...(result.error ? { error: result.error } : {}),
        decisionLog: `Harness gate=${result.gate.mode}; executed=${result.executed}.`,
        ...(result.logError ? { logError: result.logError } : {}),
      };
    },
  };
}
