export type Price = { in_per_mtok: number; out_per_mtok: number }; // USD per 1 million tokens
export type ModelSpec = {
  provider: string; model: string;
  free?: boolean; // free-tier model: costs 0 but still has request limits
  price?: Price; // needed for every non-free model; without it the gateway refuses (we never guess a price)
  maxRequestsPerDay?: number; // for free tiers
};
export type Budget = {
  perDayUsd?: number; perMonthUsd?: number; // all models together, India days/months
  perModelDayUsd?: Record<string, number>; // key "provider/model"
  warnAt?: number; // 0..1, default 0.8
};
export type UsageSummary = { dayUsd: number; monthUsd: number; modelDayUsd: Record<string, number>; modelDayRequests: Record<string, number> };
export type UsageRow = { provider: string; model: string; task?: string; tokens_in: number; tokens_out: number; cost_usd: number; ok: boolean };

export interface UsageStore {
  /** Totals since the start of today and this month (India time). */
  summary(dayStart: Date, monthStart: Date): Promise<UsageSummary>;
  record(row: UsageRow): Promise<void>;
}
export interface KeyProvider { get(provider: string): string | undefined; envName(provider: string): string }
export type ProviderResult = { text: string; tokensIn: number; tokensOut: number };
export type ProviderChunkHandler = (delta: string) => void | Promise<void>;
export interface Provider {
  name: string;
  /** Optional streaming callback. Existing providers remain compatible. */
  invoke(args: { model: string; input: unknown; maxOutputTokens: number; apiKey: string; signal: AbortSignal; onChunk?: ProviderChunkHandler }): Promise<ProviderResult>;
}
export type GatewayRequest = { provider: string; model: string; task?: string; input: unknown; maxOutputTokens: number; estimatedInputTokens: number };
export type GatewayErrorCode = 'kill_switch_on' | 'unknown_model' | 'unknown_provider' | 'unpriced_model' | 'budget_exceeded' | 'no_key' | 'provider_error' | 'timeout';
export type GatewayResult =
  | { ok: true; text: string; usage: { tokensIn: number; tokensOut: number; costUsd: number }; warning?: string }
  | { ok: false; code: GatewayErrorCode; message: string };

// S21/S13/S07 interface contract only. No provider adapter, audio processing, or routing is implemented here.
export type AudioTranscriptionRequest = {
  audio_ref: string; mime_type: string; language?: string; signal?: AbortSignal;
  metadata?: Record<string, string | number | boolean>;
};
export type AudioTranscriptionResult = { text: string; language?: string; duration_ms?: number };
export type AudioSynthesisRequest = {
  text: string; language?: string; voice_id?: string; persona_mode?: string; signal?: AbortSignal;
  metadata?: Record<string, string | number | boolean>;
};
export type AudioSynthesisResult = { audio_ref: string; mime_type: string; duration_ms?: number };
export interface AudioModelAdapter {
  transcribe(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResult>;
  speak(request: AudioSynthesisRequest): Promise<AudioSynthesisResult>;
}
