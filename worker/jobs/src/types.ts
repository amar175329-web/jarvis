import type { KillSwitchReader } from '../../../packages/shared/src/index.ts';
import type { Logger } from '../../../packages/logging/src/index.ts';

export type Job = { id: string; owner_id: string; kind: string; payload: Record<string, unknown>; state: string; attempts: number; max_attempts: number; run_at: string; error?: string | null };
export type FinishOutcome = { ok: boolean; result?: unknown; error?: string; retryInSeconds?: number; retry?: boolean };
export type EnqueueInput = { kind: string; payload?: Record<string, unknown>; runAt?: Date; idempotencyKey?: string; maxAttempts?: number };

/** Everything the worker needs from the database. SupabaseStore is the real one; tests use a local Postgres. */
export interface JobStore extends KillSwitchReader {
  claim(workerId: string, leaseSeconds: number): Promise<Job | null>;
  heartbeat(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  finish(jobId: string, workerId: string, o: FinishOutcome): Promise<Job | null>;
  enqueue(j: EnqueueInput): Promise<'created' | 'duplicate'>;
  ping(): Promise<void>; // a REAL query (keeps the free Supabase project awake)
  purge(): Promise<number>;
}
export type JobContext = { job: Job; signal: AbortSignal; log: Logger; store: JobStore };
export type Handler = (ctx: JobContext) => Promise<unknown>;
