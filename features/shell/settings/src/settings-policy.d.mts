export const SETTINGS_KEY: string;
export const DEFAULT_SHELL_PREFERENCES: Readonly<{ language: string; timeZone: string; reduceMotion: boolean }>;
export function parseShellPreferences(value: unknown): { language: string; timeZone: string; reduceMotion: boolean };
export function validateShellPreferencePatch(input: unknown): { ok: true; value: { language: string; timeZone: string; reduceMotion: boolean } } | { ok: false; message: string };
