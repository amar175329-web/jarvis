// The one door to every AI model. Order is fixed: kill switch -> known model -> budget -> key -> call -> record.
// Nobody else calls a provider directly. Prompts and answers are never logged here; keys never leave this file except to the provider call.
import { KilledError, readKillFailClosed, type KillSwitchReader, type Clock, systemClock } from '../../shared/src/index.ts';
import { startOfDayIST, startOfMonthIST } from '../../locale/src/index.ts';
import type { Logger } from '../../logging/src/index.ts';
import { checkBudget, computeCost, modelKey } from './budget.ts';
import type { Budget, GatewayRequest, GatewayResult, KeyProvider, ModelSpec, Provider, UsageStore } from './types.ts';

export type GatewayOptions = {
  kill: KillSwitchReader; usage: UsageStore; keys: KeyProvider; providers: Provider[]; models: ModelSpec[];
  budget: Budget; logger: Logger; clock?: Clock; timeoutMs?: number;
};

export function createGateway(o: GatewayOptions) {
  const clock = o.clock ?? systemClock;
  const providers = new Map(o.providers.map((p) => [p.name, p]));
  const models = new Map(o.models.map((m) => [modelKey(m), m]));

  async function call(req: GatewayRequest): Promise<GatewayResult> {
    const log = o.logger.child({ provider: req.provider, model: req.model, task: req.task });
    const fail = (code: Extract<GatewayResult, { ok: false }>['code'], message: string): GatewayResult => { log.warn('model call refused', { code, message }); return { ok: false, code, message }; };

    if ((await readKillFailClosed(o.kill)).kill) return fail('kill_switch_on', new KilledError().message);
    const spec = models.get(modelKey(req));
    if (!spec) return fail('unknown_model', `model ${modelKey(req)} is not in the allowed list`);
    const provider = providers.get(req.provider);
    if (!provider) return fail('unknown_provider', `no adapter for provider ${req.provider}`);

    const now = clock.now();
    let usage;
    try { usage = await o.usage.summary(startOfDayIST(now), startOfMonthIST(now)); }
    catch { return fail('budget_exceeded', 'could not read usage, so spending is blocked (fail-closed)'); }
    const d = checkBudget({ budget: o.budget, usage, spec, estIn: req.estimatedInputTokens, maxOut: req.maxOutputTokens });
    if (!d.allow) return fail(d.code, d.message);

    const apiKey = o.keys.get(req.provider);
    if (!apiKey) return fail('no_key', `no key for ${req.provider}: set ${o.keys.envName(req.provider)}`);

    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 60_000);
    try {
      const r = await provider.invoke({ model: req.model, input: req.input, maxOutputTokens: req.maxOutputTokens, apiKey, signal: ctl.signal });
      const costUsd = spec.free ? 0 : computeCost(r.tokensIn, r.tokensOut, spec.price!);
      await o.usage.record({ provider: req.provider, model: req.model, task: req.task, tokens_in: r.tokensIn, tokens_out: r.tokensOut, cost_usd: costUsd, ok: true });
      log.info('model call ok', { tokens_in: r.tokensIn, tokens_out: r.tokensOut, cost_usd: costUsd });
      return { ok: true, text: r.text, usage: { tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd }, ...(d.warning ? { warning: d.warning } : {}) };
    } catch (e) {
      const timedOut = ctl.signal.aborted;
      // A failed or timed-out call may still have been billed by the provider; we record it with zero tokens so the request count is right.
      await o.usage.record({ provider: req.provider, model: req.model, task: req.task, tokens_in: 0, tokens_out: 0, cost_usd: 0, ok: false }).catch(() => {});
      log.error('model call failed', { error: e, timed_out: timedOut });
      return { ok: false, code: timedOut ? 'timeout' : 'provider_error', message: timedOut ? 'the model took too long' : 'the model provider returned an error' };
    } finally { clearTimeout(timer); }
  }
  return { call };
}
export type Gateway = ReturnType<typeof createGateway>;
