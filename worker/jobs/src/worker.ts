// The worker: takes jobs one at a time, runs them safely, reports back. Portable: it only needs a JobStore.
// Safety rules: (1) kill switch is read before every claim and while a job runs, fail-closed; (2) a job gets a lease that
// a heartbeat renews, so a crashed worker's job is picked up again; (3) every job has a timeout; (4) one job at a time.
import { KilledError, NonRetryableError, backoffMs, readKillFailClosed, sleep, systemClock, type Clock } from '../../../packages/shared/src/index.ts';
import type { Logger } from '../../../packages/logging/src/index.ts';
import type { Handler, Job, JobStore } from './types.ts';

export type WorkerOptions = {
  store: JobStore; handlers: Record<string, Handler>; logger: Logger; workerId: string; clock?: Clock;
  leaseSeconds?: number; heartbeatMs?: number; pollMs?: number; jobTimeoutMs?: number; killPollMs?: number; retryBaseMs?: number; graceMs?: number;
  recurring?: { kind: string; everyMs: number }[];
};
export type TickResult = 'killed' | 'idle' | 'ran' | 'error';

export class Worker {
  private o: Required<Omit<WorkerOptions, 'recurring'>> & { recurring: { kind: string; everyMs: number }[] };
  private stopping = new AbortController();
  private current: Promise<void> | null = null;
  private lastBucket = new Map<string, number>();

  constructor(o: WorkerOptions) {
    this.o = { clock: systemClock, leaseSeconds: 60, heartbeatMs: 0, pollMs: 5000, jobTimeoutMs: 120_000, killPollMs: 5000, retryBaseMs: 5000, graceMs: 20_000, recurring: [], ...o };
  }

  async tick(): Promise<TickResult> {
    const { store, logger: log } = this.o;
    const k = await readKillFailClosed(store);
    if (k.kill) { log.warn('kill switch is on (or unreadable): not taking jobs'); return 'killed'; }
    await this.scheduleRecurring();
    let job: Job | null;
    try { job = await store.claim(this.o.workerId, this.o.leaseSeconds); }
    catch (e) { log.error('could not claim a job', { error: e }); return 'error'; }
    if (!job) return 'idle';
    this.current = this.execute(job).finally(() => { this.current = null; });
    await this.current;
    return 'ran';
  }

  private async scheduleRecurring(): Promise<void> {
    const now = this.o.clock.now().getTime();
    for (const r of this.o.recurring) {
      const bucket = Math.floor(now / r.everyMs);
      if (this.lastBucket.get(r.kind) === bucket) continue;
      try { await this.o.store.enqueue({ kind: r.kind, idempotencyKey: `${r.kind}:${bucket}` }); this.lastBucket.set(r.kind, bucket); }
      catch (e) { this.o.logger.warn('could not schedule recurring job', { kind: r.kind, error: e }); }
    }
  }

  private async execute(job: Job): Promise<void> {
    const { store, workerId } = this.o;
    const log = this.o.logger.child({ job_id: job.id, kind: job.kind, attempt: job.attempts });
    const handler = this.o.handlers[job.kind];
    if (!handler) { log.error('no handler for this job kind'); await this.finish(job, { ok: false, error: `no handler for ${job.kind}`, retry: false }, log); return; }

    const ctl = new AbortController(); let leaseLost = false;
    const abort = (reason: unknown) => { if (!ctl.signal.aborted) ctl.abort(reason); };
    const timeout = setTimeout(() => abort(new Error('job timed out')), this.o.jobTimeoutMs);
    const beat = setInterval(async () => { try { if (!(await store.heartbeat(job.id, workerId, this.o.leaseSeconds))) { leaseLost = true; abort(new Error('lease lost')); } } catch { /* try again next beat */ } }, Math.max(10, this.o.heartbeatMs || (this.o.leaseSeconds * 1000) / 3));
    const killWatch = setInterval(async () => { if ((await readKillFailClosed(store)).kill) abort(new KilledError()); }, this.o.killPollMs);
    const aborted = new Promise<never>((_, rej) => ctl.signal.addEventListener('abort', () => rej(ctl.signal.reason), { once: true }));
    aborted.catch(() => {});
    const t0 = Date.now();
    try {
      const result = await Promise.race([handler({ job, signal: ctl.signal, log, store }), aborted]);
      if (leaseLost) return;
      log.info('job done', { ms: Date.now() - t0 });
      await this.finish(job, { ok: true, result: result ?? null }, log);
    } catch (e) {
      if (leaseLost) { log.warn('lease lost; another worker owns this job now'); return; }
      const killed = e instanceof KilledError;
      const nonRetry = e instanceof NonRetryableError;
      log.error(killed ? 'job stopped by kill switch' : 'job failed', { error: e, ms: Date.now() - t0 });
      await this.finish(job, { ok: false, error: killed ? 'stopped by kill switch' : String((e as Error)?.message ?? e), retry: !nonRetry, retryInSeconds: Math.ceil(backoffMs(job.attempts, this.o.retryBaseMs) / 1000) }, log);
    } finally { clearTimeout(timeout); clearInterval(beat); clearInterval(killWatch); }
  }

  private async finish(job: Job, o: Parameters<JobStore['finish']>[2], log: Logger): Promise<void> {
    try { const r = await this.o.store.finish(job.id, this.o.workerId, o); if (!r) log.warn('finish ignored: the job is no longer ours'); }
    catch (e) { log.error('could not report job result (it will be retried when the lease ends)', { error: e }); }
  }

  /** Main loop. Returns after stop(). */
  async run(): Promise<void> {
    const { logger: log } = this.o;
    log.info('worker started', { worker_id: this.o.workerId });
    while (!this.stopping.signal.aborted) {
      let r: TickResult;
      try { r = await this.tick(); } catch (e) { log.error('unexpected error in loop', { error: e }); r = 'error'; }
      if (r !== 'ran') await sleep(r === 'error' ? this.o.pollMs * 2 : this.o.pollMs, this.stopping.signal);
    }
    log.info('worker stopped');
  }

  /** Graceful stop: no new jobs; waits for the running job up to graceMs. */
  async stop(): Promise<void> {
    this.stopping.abort();
    if (this.current) await Promise.race([this.current, sleep(this.o.graceMs)]);
  }
}
