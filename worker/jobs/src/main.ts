// npm start  ->  runs the worker on this computer. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in git, never in chat).
import os from 'node:os';
import { createLogger, type Level } from '../../../packages/logging/src/index.ts';
import { builtinHandlers, defaultRecurring } from './handlers.ts';
import { discoverOwner, supabaseJobStore } from './supabase-store.ts';
import { Worker } from './worker.ts';

const log = createLogger({ service: 'worker', level: (process.env.LOG_LEVEL as Level) || 'info' });
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { log.error('missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; see .env.example'); process.exit(1); }
if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) { log.error('SUPABASE_URL must be https'); process.exit(1); }

const ownerId = await discoverOwner(url, key);
const worker = new Worker({
  store: supabaseJobStore({ url, serviceKey: key, ownerId }), handlers: builtinHandlers, recurring: defaultRecurring,
  logger: log, workerId: process.env.WORKER_ID || `${os.hostname()}-${process.pid}`,
});
const stop = () => { log.info('stop requested; finishing the current job'); worker.stop().then(() => process.exit(0)); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await worker.run();
