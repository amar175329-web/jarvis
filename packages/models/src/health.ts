import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { LocalHealth } from './local-types.ts';

export function getAvailableRamMb(): number {
  try {
    if (fs.existsSync('/proc/meminfo')) {
      const text = fs.readFileSync('/proc/meminfo', 'utf8');
      const m = text.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (m) return Math.floor(parseInt(m[1], 10) / 1024);
    }
    const out = execSync('free -m', { encoding: 'utf8' });
    const line = out.split('\n').find((l) => l.startsWith('Mem:'));
    if (line) {
      const parts = line.trim().split(/\s+/);
      const avail = parts[6] || parts[parts.length - 1];
      return parseInt(avail, 10) || 0;
    }
  } catch {
    // fallback
  }
  return 0;
}

export function findLlamaBinary(customPath?: string): string | null {
  if (customPath !== undefined) {
    return fs.existsSync(customPath) ? customPath : null;
  }
  const candidates = [
    '/usr/local/bin/llama-server',
    '/root/llama-bin/llama-server',
    '/usr/bin/llama-server',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const which = execSync('command -v llama-server', { encoding: 'utf8' }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {
    // ignore
  }
  return null;
}

export function findModelFile(customPath?: string): string | null {
  if (customPath !== undefined) {
    return fs.existsSync(customPath) ? customPath : null;
  }
  const home = os.homedir();
  const candidates = [
    process.env.LOCAL_MODEL_PATH,
    path.join(home, 'models', 'gemma-3-1b-it-Q4_K_M.gguf'),
    path.join(home, 'models', 'google_gemma-3-1b-it-Q4_K_M.gguf'),
    '/root/models/gemma-3-1b-it-Q4_K_M.gguf',
    '/root/models/google_gemma-3-1b-it-Q4_K_M.gguf',
    path.join(home, 'models', 'gemma-3-270m-it-Q4_K_M.gguf'),
    path.join(home, 'models', 'google_gemma-3-270m-it-Q4_K_M.gguf'),
    '/root/models/gemma-3-270m-it-Q4_K_M.gguf',
    '/root/models/google_gemma-3-270m-it-Q4_K_M.gguf',
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function isLlamaServerRunning(port = 8080): boolean {
  const pidFile = '/tmp/jarvis_llama_server.pid';
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        process.kill(pid, 0); // throws if process is not running
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Health check: NEVER starts the model.
 * Verifies:
 * (a) llama-server binary exists
 * (b) model file exists
 * (c) available RAM >= 800 MB
 * ok means "can start on demand when needed"
 */
export function checkLocalHealth(options?: {
  minRamMb?: number;
  binaryPath?: string;
  modelPath?: string;
  port?: number;
}): LocalHealth {
  const minRam = options?.minRamMb ?? 800;
  const binary = Boolean(findLlamaBinary(options?.binaryPath));
  const model = Boolean(findModelFile(options?.modelPath));
  const freeRamMb = getAvailableRamMb();
  const ok = binary && model && freeRamMb >= minRam;
  const running = isLlamaServerRunning(options?.port ?? 8080);

  return {
    ok,
    checked_at: new Date().toISOString(),
    running,
    free_ram_mb: freeRamMb,
    binary,
    model,
  };
}

export function loadJarvisEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envPath = path.join(os.homedir(), '.jarvis.env');
  if (fs.existsSync(envPath)) {
    try {
      const text = fs.readFileSync(envPath, 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (!env[k] && v) env[k] = v;
        }
      }
    } catch {
      // ignore
    }
  }
  return env;
}

/**
 * Writes health result to settings table on jarvis-test project:
 * key: "models.local_health"
 * value: { ok, checked_at, running }
 */
export async function writeLocalHealthSetting(
  health: LocalHealth,
  options?: { supabaseUrl?: string; serviceRoleKey?: string; fetch?: typeof fetch }
): Promise<boolean> {
  const f = options?.fetch ?? fetch;
  const env = loadJarvisEnv();
  const url = (options?.supabaseUrl || env.TEST_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = options?.serviceRoleKey || env.TEST_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return false;

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Discover owner from system_state
    const stateRes = await f(`${url}/rest/v1/system_state?select=owner_id&limit=1`, { headers });
    if (!stateRes.ok) return false;
    const stateRows = (await stateRes.json()) as Array<{ owner_id: string }>;
    if (!stateRows?.length || !stateRows[0].owner_id) return false;
    const ownerId = stateRows[0].owner_id;

    // 2. Upsert into settings table
    const payload = {
      owner_id: ownerId,
      key: 'models.local_health',
      value: {
        ok: health.ok,
        checked_at: health.checked_at,
        running: health.running,
        free_ram_mb: health.free_ram_mb,
      },
    };

    const postRes = await f(`${url}/rest/v1/settings?on_conflict=owner_id,key`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload),
    });

    return postRes.ok;
  } catch {
    return false;
  }
}
