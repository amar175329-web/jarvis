import { checkLocalHealth, writeLocalHealthSetting } from './health.ts';

export async function pingHealthOnce(): Promise<boolean> {
  const health = checkLocalHealth();
  return writeLocalHealthSetting(health);
}

export function startHealthPingLoop(intervalMs = 60000): () => void {
  const run = async () => {
    try {
      await pingHealthOnce();
    } catch {
      // ignore network errors in background loop
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}

// When run directly as CLI:
if (process.argv[1]?.endsWith('health-ping.ts')) {
  pingHealthOnce().then((ok) => {
    console.log(`Health ping finished. Success: ${ok}`);
    process.exit(ok ? 0 : 1);
  });
}
