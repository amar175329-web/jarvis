// Registry rules: a model is usable only if it is VERIFIED (official source URL + checked date + price, or free with a request cap).
import fs from 'node:fs';
import type { ModelEntry, PriceUsd, Registry } from './types.ts';
import type { ModelSpec, Provider } from '../../model-gateway/src/types.ts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function priceAt(e: ModelEntry, now: Date): PriceUsd | null {
  const day = now.toISOString().slice(0, 10);
  const steps = [...(e.price_schedule ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  let cur: PriceUsd | null = null;
  for (const s of steps) if (s.from <= day) cur = s.price;
  return cur;
}

export function validateEntry(e: ModelEntry): string[] {
  const errs: string[] = [];
  if (e.id !== `${e.provider}/${e.model}`) errs.push(`${e.id}: id must be provider/model`);
  if (e.status === 'verified') {
    if (e.privacy === 'cloud' && !/^https:\/\//.test(e.source.url)) errs.push(`${e.id}: verified needs an https source url`);
    if (e.privacy === 'cloud' && !DATE.test(e.source.checked_on)) errs.push(`${e.id}: verified needs checked_on date`);
    if (e.privacy === 'cloud' && !e.free && !(e.price_schedule?.length)) errs.push(`${e.id}: verified paid model needs price_schedule`);
    if (e.free && e.privacy === 'cloud' && !e.limits) errs.push(`${e.id}: free cloud model needs limits (request cap)`);
  }
  if (e.tier === 'local' && e.privacy !== 'local') errs.push(`${e.id}: local tier must have privacy local`);
  if (e.privacy === 'local' && e.tier !== 'local') errs.push(`${e.id}: privacy local must be tier local`);
  return errs;
}
/** Checks the registry file as SHIPPED in git: paid_big models must be off. (At run time Amit may switch one on in settings.) */
export function validateRegistry(r: Registry): string[] {
  return r.models.flatMap((e) => [...validateEntry(e), ...(e.tier === 'paid_big' && e.enabled ? [`${e.id}: paid_big must ship disabled (Amit turns it on)`] : [])]);
}

/** Entries the gateway may know. Anything unverified/unpriced is left out, so the gateway answers unknown_model (refuse). */
export function toModelSpecs(r: Registry, now: Date): ModelSpec[] {
  const out: ModelSpec[] = [];
  for (const e of r.models) {
    if (e.status !== 'verified' || validateEntry(e).length) continue;
    if (e.free) {
      out.push({
        provider: e.provider,
        model: e.model,
        free: true,
        ...(e.limits?.rpd !== undefined ? { maxRequestsPerDay: e.limits.rpd } : {}),
        ...(e.limits?.reset_tz ? { resetTz: e.limits.reset_tz } : {}),
      });
      continue;
    }
    const p = priceAt(e, now);
    if (!p) continue;
    out.push({
      provider: e.provider,
      model: e.model,
      price: {
        in_per_mtok: p.in,
        out_per_mtok: p.out,
        ...(p.cache_read !== undefined ? { cache_read_per_mtok: p.cache_read } : {}),
        ...(p.cache_write_5m !== undefined ? { cache_write_5m_per_mtok: p.cache_write_5m } : {}),
        ...(p.cache_write_1h !== undefined ? { cache_write_1h_per_mtok: p.cache_write_1h } : {}),
        ...(p.bracket
          ? {
              bracket: {
                over_prompt_tokens: p.bracket.over_prompt_tokens,
                in_per_mtok: p.bracket.in,
                out_per_mtok: p.bracket.out,
                ...(p.bracket.cache_read !== undefined ? { cache_read_per_mtok: p.bracket.cache_read } : {}),
                ...(p.bracket.cache_write_5m !== undefined ? { cache_write_5m_per_mtok: p.bracket.cache_write_5m } : {}),
                ...(p.bracket.cache_write_1h !== undefined ? { cache_write_1h_per_mtok: p.bracket.cache_write_1h } : {}),
              },
            }
          : {}),
      },
      ...(e.limits?.reset_tz ? { resetTz: e.limits.reset_tz } : {}),
    });
  }
  return out;
}

/** gemini-free and gemini-paid share one adapter but use different keys (free project vs billed project). */
export function aliasProvider(base: Provider, name: string): Provider { return { ...base, name }; }
export const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
  'gemini-free': 'GEMINI_FREE_API_KEY', 'gemini-paid': 'GEMINI_PAID_API_KEY',
  'opencode-zen': 'OPENCODE_API_KEY', local: 'LOCAL_MODEL_TOKEN',
};

export function loadDefaultRegistry(): Registry {
  return JSON.parse(fs.readFileSync(new URL('../registry/models.json', import.meta.url), 'utf8'));
}
