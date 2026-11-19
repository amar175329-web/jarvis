export type Tier = 'free' | 'almost_zero' | 'paid_big' | 'local';
export type SizeClass = 'small' | 'big';
export type Depth = 'FAST' | 'NORMAL' | 'DEEP';
export type Task = 'chat' | 'reasoning' | 'summarize' | 'code' | 'creative' | 'action' | 'extract';
export type PriceBracketUsd = {
  over_prompt_tokens: number;
  in: number;
  out: number;
  cache_read?: number;
  cache_write_5m?: number;
  cache_write_1h?: number;
};
/** USD per 1M tokens. */
export type PriceUsd = {
  in: number;
  out: number;
  cache_read?: number;
  cache_write_5m?: number;
  cache_write_1h?: number;
  bracket?: PriceBracketUsd;
};
export type PriceStep = { from: string; price: PriceUsd }; // from = UTC date YYYY-MM-DD (inclusive)
export type LimitStatus = 'official' | 'third_party_unverified' | 'user_confirmed';
export type Limits = { rpd?: number; rpm?: number; reset_tz: string; status: LimitStatus; source_url: string };
export type ModelStatus = 'verified' | 'unverified' | 'needs_model_id' | 'no_host';
export type ModelEntry = {
  id: string; provider: string; adapter: string; model: string;
  tier: Tier; size: SizeClass; privacy: 'cloud' | 'local';
  enabled: boolean; free: boolean;
  price_schedule?: PriceStep[]; limits?: Limits;
  max_prompt_tokens?: number; context_window?: number;
  data_use: { trains_on_inputs: boolean | 'unknown'; source_url: string; note: string };
  source: { url: string; checked_on: string };
  status: ModelStatus; notes?: string;
  rank?: number;
};
export type Registry = { schema: number; checked_on: string; note: string; models: ModelEntry[] };
export * from './local-types.ts';
