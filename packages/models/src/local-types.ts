export type LocalHealth = {
  ok: boolean;
  checked_at: string;
  running: boolean;
  free_ram_mb?: number;
  binary?: boolean;
  model?: boolean;
};

export type ModelSpeedStats = {
  cold_start_ms: number;
  warm_avg_ms: number;
  prompt_tps: number;
  generation_tps: number;
  context_window: number;
  threads: number;
};

export type RegisteredModel = {
  id: string;
  name: string;
  provider: string;
  model: string;
  official_source_url: string;
  checked_on: string;
  file_size_bytes: number;
  file_size_mb: number;
  license: string;
  status: 'verified' | 'unverified';
  speed?: ModelSpeedStats;
};

export type ModelRouteDecision =
  | {
      status: 'routed';
      target: 'local' | 'cloud';
      model: string;
      isPrivate: boolean;
      reason: string;
    }
  | {
      status: 'unavailable';
      message: 'abhi band';
      code: 'local_model_unavailable';
      isPrivate: boolean;
      reason: string;
    }
  | {
      status: 'unconfigured';
      message: string;
      reason: string;
    };
