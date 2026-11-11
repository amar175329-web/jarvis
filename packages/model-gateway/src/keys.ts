import type { KeyProvider } from './types.ts';
// Keys come from environment variables (names are in .env.example). They are server-side only; the gateway never returns them.
const DEFAULT_ENV: Record<string, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
export function envKeys(env: Record<string, string | undefined> = process.env, names: Record<string, string> = DEFAULT_ENV): KeyProvider {
  return {
    envName: (p) => names[p] ?? `${p.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
    get(p) { const v = env[this.envName(p)]; return v && v.trim() ? v.trim() : undefined; },
  };
}
