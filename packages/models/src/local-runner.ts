import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LocalHealth } from './local-types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUN_SCRIPT_PATH = path.resolve(__dirname, '../local/run.sh');

export type LocalInvokeResult = {
  ok: true;
  text: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  timings?: {
    prompt_ms?: number;
    prompt_per_second?: number;
    predicted_ms?: number;
    predicted_per_second?: number;
  };
  durationMs: number;
};

export type LocalUnavailableResult = {
  ok: false;
  code: 'local_model_unavailable';
  message: 'unavailable' | 'abhi band';
  reason: string;
};

export function invokeLocalModel(
  input: string | { messages: Array<{ role: string; content: string }>; max_tokens?: number; temperature?: number },
  envOverrides: Record<string, string> = {}
): LocalInvokeResult | LocalUnavailableResult {
  const t0 = performance.now();
  let payload: string;

  if (typeof input === 'string') {
    payload = JSON.stringify({
      messages: [{ role: 'user', content: input }],
      max_tokens: 512,
      temperature: 0.1,
    });
  } else {
    payload = JSON.stringify(input);
  }

  const res = spawnSync(RUN_SCRIPT_PATH, ['request', payload], {
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
    timeout: 60000,
  });

  const durationMs = Math.round(performance.now() - t0);
  const stdout = (res.stdout || '').trim();
  const stderr = (res.stderr || '').trim();

  if (res.status !== 0 || stdout.startsWith('unavailable') || stderr.startsWith('unavailable')) {
    return {
      ok: false,
      code: 'local_model_unavailable',
      message: 'unavailable',
      reason: stderr || stdout || 'Local runner returned non-zero status',
    };
  }

  try {
    const parsed = JSON.parse(stdout);
    const text = parsed.choices?.[0]?.message?.content?.trim() || '';
    return {
      ok: true,
      text,
      usage: parsed.usage,
      timings: parsed.timings,
      durationMs,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'local_model_unavailable',
      message: 'unavailable',
      reason: `Failed to parse response: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function stopLocalModel(): void {
  try {
    spawnSync(RUN_SCRIPT_PATH, ['stop'], { encoding: 'utf8' });
  } catch {
    // ignore
  }
}

export function getLocalModelStatus(): LocalHealth {
  try {
    const res = spawnSync(RUN_SCRIPT_PATH, ['status'], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const data = JSON.parse(res.stdout.trim());
      return {
        ok: Boolean(data.ok),
        checked_at: new Date().toISOString(),
        running: Boolean(data.running),
        free_ram_mb: data.free_ram_mb,
        binary: data.binary,
        model: data.model,
      };
    }
  } catch {
    // ignore
  }
  return {
    ok: false,
    checked_at: new Date().toISOString(),
    running: false,
  };
}
