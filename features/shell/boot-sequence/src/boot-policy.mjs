export const BOOT_STEPS = Object.freeze(['INITIALIZING CORE', 'LOADING NEURAL LINK', 'SYNCING YOUR WORKSPACE', 'ALL SYSTEMS ONLINE']);
export function bootStepAt(elapsedMs, steps = BOOT_STEPS, intervalMs = 520) {
  if (!Array.isArray(steps) || steps.length === 0) return '';
  const index = Math.max(0, Math.min(steps.length - 1, Math.floor(Math.max(0, Number(elapsedMs) || 0) / intervalMs)));
  return steps[index];
}
export function shouldSkipBoot(reducedMotion) { return reducedMotion === true; }
