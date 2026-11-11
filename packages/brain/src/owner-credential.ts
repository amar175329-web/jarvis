// Owner fingerprint policy (Amit's decision). Policy only: the real biometric check is the phone OS + S19/S16A.
// JARVIS never sees fingerprint data. It only gets "this credential verified" from the device.
export type Credential = { id: string; owner: boolean; created_at: string };
export type Session = { ownerLoggedIn: boolean; verifiedCredentialId?: string };

// First enrolment: only once, only inside Amit's own logged-in session, and it becomes THE owner credential.
export function canEnrollOwner(existing: Credential[], s: Session): { ok: boolean; why: string } {
  if (existing.some((c) => c.owner)) return { ok: false, why: 'owner fingerprint already set' };
  if (!s.ownerLoggedIn) return { ok: false, why: 'owner fingerprint can only be set inside the owner login' };
  return { ok: true, why: 'first-time owner enrolment' };
}
// More fingerprints can be added, but only after the owner fingerprint verifies.
export function canAddCredential(existing: Credential[], s: Session): { ok: boolean; why: string } {
  const owner = existing.find((c) => c.owner);
  if (!owner) return { ok: false, why: 'set the owner fingerprint first' };
  if (s.verifiedCredentialId !== owner.id) return { ok: false, why: 'owner fingerprint must verify first' };
  return { ok: true, why: 'owner verified' };
}
// The owner credential is never deleted while JARVIS exists. No app button, no API, no AI path.
export function canDeleteCredential(c: Credential): { ok: boolean; why: string } {
  return c.owner ? { ok: false, why: 'owner fingerprint is permanent' } : { ok: true, why: 'extra fingerprint, owner may remove' };
}
