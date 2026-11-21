export type AuthGateState = 'loading' | 'locked' | 'unlocked';

export function nextAuthStateFromSession(status: number, okFlag: boolean): AuthGateState {
  if (status === 200 && okFlag) return 'unlocked';
  return 'locked';
}

export function mapOwnerEnterError(status: number): string {
  if (status === 429) {
    return 'Bahut zyada galat koshishein. Kuch der baad koshish karo.';
  }
  if (status === 503 || status >= 500 || status === 0) {
    return 'Service abhi band hai. Kuch der baad koshish karo.';
  }
  return 'Galat owner key. Dobara koshish karo.';
}

export function shouldRelockOnStatus(status: number): boolean {
  return status === 401 || status === 403;
}
