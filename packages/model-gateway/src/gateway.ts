// The one door to every AI model. Order is fixed: kill switch -> known model -> provider -> worst-case budget -> key -> timeout/call -> usage.
// Prompts, provider chunks, answers and keys are never logged.
import { KilledError, readKillFailClosed, type KillSwitchReader, type Clock, systemClock } from '../../shared/src/index.ts';
import { startOfDayIST, startOfMonthIST } from '../../locale/src/index.ts';
import type { Logger } from '../../logging/src/index.ts';
import { checkBudget, computeCost, modelKey } from './budget.ts';
import type { Budget, GatewayRequest, GatewayResult, KeyProvider, ModelSpec, Provider, ProviderChunkHandler, UsageStore } from './types.ts';

export type GatewayOptions = {
  kill: KillSwitchReader; usage: UsageStore; keys: KeyProvider; providers: Provider[]; models: ModelSpec[];
  budget: Budget; logger: Logger; clock?: Clock; timeoutMs?: number;
};

export function createGateway(o: GatewayOptions) {
  const clock = o.clock ?? systemClock;
  const providers = new Map(o.providers.map((p) => [p.name, p]));
  const models = new Map(o.models.map((m) => [modelKey(m), m]));

  function registerProvider(provider: Provider): void {
    if (!provider.name.trim()) throw new Error('provider name is required');
    providers.set(provider.name, provider);
  }

  async function run(req: GatewayRequest, onChunk?: ProviderChunkHandler): Promise<GatewayResult> {
    const log = o.logger.child({ provider: req.provider, model: req.model, task: req.task });
    const fail = (code: Extract<GatewayResult, { ok: false }>['code'], message: string): GatewayResult => {
      // Only safe codes and static status are logged; never log provider bodies/chunks, request text or secrets.
      log.warn('model call refused', { code });
      return { ok: false, code, message };
    };

    // Preserve the gateway's mandatory order. No provider call may happen before all gates pass.
    if ((await readKillFailClosed(o.kill)).kill) return fail('kill_switch_on', new KilledError().message);
    const spec = models.get(modelKey(req));
    if (!spec) return fail('unknown_model', `model ${modelKey(req)} is not in the allowed list`);
    const provider = providers.get(req.provider);
    if (!provider) return fail('unknown_provider', `no adapter for provider ${req.provider}`);

    const now = clock.now();
    let usage;
    try { usage = await o.usage.summary(startOfDayIST(now), startOfMonthIST(now)); }
    catch { return fail('budget_exceeded', 'could not read usage, so spending is blocked (fail-closed)'); }
    // checkBudget charges the full configured max output plus estimated input (worst case), BEFORE a key or call.
    const decision = checkBudget({ budget: o.budget, usage, spec, estIn: req.estimatedInputTokens, maxOut: req.maxOutputTokens });
    if (!decision.allow) return fail(decision.code, decision.message);

    const apiKey = o.keys.get(req.provider);
    if (!apiKey) return fail('no_key', `no key for ${req.provider}: set ${o.keys.envName(req.provider)}`);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 60_000);
    let chunkCount = 0;
    try {
      const forwardChunk: ProviderChunkHandler | undefined = onChunk ? async (chunk) => {
        if (ctl.signal.aborted) throw new Error('model stream aborted');
        if (!chunk) return;
        chunkCount++;
        await onChunk(chunk);
      } : undefined;
      const result = await provider.invoke({
        model: req.model, input: req.input, maxOutputTokens: req.maxOutputTokens,
        apiKey, signal: ctl.signal, ...(forwardChunk ? { onChunk: forwardChunk } : {}),
      });
      // Compatibility for older Provider implementations that return one final text only.
      if (onChunk && chunkCount === 0 && result.text) await onChunk(result.text);
      const costUsd = spec.free ? 0 : computeCost(result.tokensIn, result.tokensOut, spec.price!);
      await o.usage.record({ provider: req.provider, model: req.model, task: req.task, tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: costUsd, ok: true });
      log.info('model call ok', { tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: costUsd });
      return { ok: true, text: result.text, usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd }, ...(decision.warning ? { warning: decision.warning } : {}) };
    } catch (error) {
      const timedOut = ctl.signal.aborted;
      await o.usage.record({ provider: req.provider, model: req.model, task: req.task, tokens_in: 0, tokens_out: 0, cost_usd: 0, ok: false }).catch(() => {});
      // Error message may include a key or prompt from a provider SDK; omit it completely.
      log.error('model call failed', { timed_out: timedOut });
      return { ok: false, code: timedOut ? 'timeout' : 'provider_error', message: timedOut ? 'the model took too long' : 'the model provider returned an error' };
    } finally { clearTimeout(timer); }
  }

  return {
    call: (request: GatewayRequest) => run(request),
    callStream: (request: GatewayRequest, onChunk: ProviderChunkHandler) => run(request, onChunk),
    registerProvider,
  };
}
export type Gateway = ReturnType<typeof createGateway>;
