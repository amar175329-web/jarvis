export const BOOT_STEPS: readonly string[];
export function bootStepAt(elapsedMs: number, steps?: readonly string[], intervalMs?: number): string;
export function shouldSkipBoot(reducedMotion: boolean): boolean;
