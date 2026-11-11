// Local test of migrations/0001_core.sql on a real Postgres (pglite + pgvector). Supabase's auth is stubbed.
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import fs from 'node:fs';
const db = new PGlite({ extensions: { vector } });
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const as = async (u) => { await db.exec('reset role'); await db.exec(u ? `set role authenticated; select set_config('request.jwt.claim.sub','${u}',false);` : `set role anon; select set_config('request.jwt.claim.sub','',false);`); };
const fails = async (sql) => { try { await db.exec(sql); return false; } catch (e) { return e.message; } };

await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 insert into auth.users values ('${A}'),('${B}');`);
await db.exec(fs.readFileSync(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8'));
await db.exec(`grant usage on schema public, auth, extensions to authenticated, anon, service_role; grant all on all tables in schema public to authenticated, anon, service_role; grant all on all functions in schema public to authenticated, anon, service_role; alter role service_role bypassrls;`);
await db.exec(`revoke all on all tables in schema public from anon;`);
ok('migration applies', true);
await db.exec(fs.readFileSync(new URL('../migrations/0003_events_idempotency.sql', import.meta.url), 'utf8'));
ok('migration 0003 applies', true);
await db.exec(fs.readFileSync(new URL('../migrations/0004_jobs.sql', import.meta.url), 'utf8'));
await db.exec(`grant all on public.jobs to authenticated; revoke all on public.jobs from anon;`); // Supabase does this automatically; the stub does not
ok('migration 0004 applies', true);
await db.exec(fs.readFileSync(new URL('../migrations/0005_event_rate_limits.sql', import.meta.url), 'utf8'));
ok('migration 0005 applies (local PGlite only)', true);

// RLS
await as(A); await db.exec(`insert into tasks(title) values ('A secret task')`);
await as(B); ok('B cannot see A rows', (await db.query('select * from tasks')).rows.length === 0);
ok('B cannot insert as A', !!(await fails(`insert into tasks(owner_id,title) values ('${A}','x')`)));
await as(null); ok('anon is locked out', !!(await fails('select * from tasks')));
await as(A); ok('A sees own row', (await db.query('select * from tasks')).rows.length === 1);

// power cap
ok('power above cap is refused', !!(await fails(`insert into powers(id,name,autonomy_default,autonomy_current,max_level) values ('message.send','send',1,3,2)`)));
await db.exec(`insert into powers(id,name,autonomy_default,autonomy_current,max_level) values ('message.send','send',1,2,2)`);
ok('power within cap is accepted', true);
ok('bad power id is refused', !!(await fails(`insert into powers(id,name,autonomy_default,autonomy_current,max_level) values ('Bad Id','x',0,0,0)`)));

// kill switch, fail-closed
await db.exec(`insert into devices(id,name,kind) values ('11111111-1111-1111-1111-111111111111','Amit phone','phone')`);
const D = '11111111-1111-1111-1111-111111111111';
ok('no system_state row => command refused (fail-closed)', !!(await fails(`insert into phone_commands(device_id,command) values ('${D}','{"op":"open","app":"youtube"}')`)));
await db.exec('select init_owner()');
await db.exec(`insert into phone_commands(device_id,command,idempotency_key) values ('${D}','{"op":"open","app":"youtube"}','k1')`);
ok('duplicate idempotency key refused', !!(await fails(`insert into phone_commands(device_id,command,idempotency_key) values ('${D}','{}','k1')`)));
let c = (await db.query(`select * from claim_phone_command('${D}')`)).rows[0];
ok('phone claims its command', c && c.state === 'sent');
await db.exec(`insert into phone_commands(device_id,command) values ('${D}','{"op":"scroll"}')`);
await db.exec(`update system_state set kill = true`);
ok('kill ON cancels waiting commands', (await db.query(`select state from phone_commands where command->>'op'='scroll'`)).rows[0].state === 'cancelled');
ok('kill ON refuses new commands', !!(await fails(`insert into phone_commands(device_id,command) values ('${D}','{}')`)));
ok('kill ON: claim hands out nothing', (await db.query(`select * from claim_phone_command('${D}')`)).rows[0]?.id == null);
await db.exec(`update system_state set kill = false`);
ok('epoch increased after switching', (await db.query('select epoch from system_state')).rows[0].epoch === 2);
await db.exec(`insert into phone_commands(device_id,command,expires_at) values ('${D}','{"op":"late"}', now() - interval '1 minute')`).catch(() => {});
ok('expired command is never handed out', (await db.query(`select * from claim_phone_command('${D}')`)).rows[0]?.id == null);

// kill epoch: an old queued command from before a kill cycle must not run
await db.exec(`insert into phone_commands(device_id,command) values ('${D}','{"op":"old"}')`);
await db.exec(`reset role`); await db.exec(`update phone_commands set kill_epoch = 0 where command->>'op'='old'`); await as(A);
ok('command from an older epoch is never handed out', (await db.query(`select * from claim_phone_command('${D}')`)).rows[0]?.id == null);

// B cannot claim A's commands
await as(B); ok('B cannot claim A commands', (await db.query(`select * from claim_phone_command('${D}')`)).rows[0]?.id == null);

// memory + vector
await as(A);
await db.exec(`insert into memories(kind,title,body,embedding) values ('fact','Amit likes chai','Amit ko chai pasand hai', '[${Array(768).fill(0.01).join(',')}]')`);
ok('memory with 768-dim embedding stored', (await db.query('select count(*)::int n from memories')).rows[0].n === 1);
ok('bad memory kind refused', !!(await fails(`insert into memories(kind,title,body) values ('nonsense','x','y')`)));

// retention
await db.exec('reset role');
await db.exec(`insert into events(owner_id,type,source,ts) values ('${A}','task.created','test', now() - interval '30 days'), ('${A}','task.created','test', now())`);
const r = (await db.query('select public.purge_old_rows() as r')).rows[0].r;
ok('purge removes only old events', r.events === 1 && (await db.query('select count(*)::int n from events')).rows[0].n === 1);
ok('event type must be dot.case', !!(await fails(`insert into events(owner_id,type,source) values ('${A}','BadType','t')`)));
// 0003: events idempotency
await db.exec(`insert into events(owner_id,type,source,idempotency_key) values ('${A}','task.created','t','k1')`);
ok('same idempotency_key for same owner is refused', !!(await fails(`insert into events(owner_id,type,source,idempotency_key) values ('${A}','task.created','t','k1')`)));
await db.exec(`insert into events(owner_id,type,source,idempotency_key) values ('${B}','task.created','t','k1')`);
ok('same key for another owner is allowed', true);
await db.exec(`insert into events(owner_id,type,source) values ('${A}','task.created','t'),('${A}','task.created','t')`);
ok('events without a key can repeat', true);

// 0004: jobs queue
await db.exec('reset role');
await db.exec(`delete from system_state`);
const jobsA = async (sql) => (await db.query(sql)).rows;
await db.exec(`insert into jobs(owner_id,kind,run_at) values ('${A}','system.keepalive', now() - interval '1 minute')`);
await as(A); await db.exec(`update system_state set kill = true`); await db.exec('reset role');
ok('claim_job gives nothing while system_state is missing (fail-closed)', (await jobsA(`select * from claim_job('w1')`))[0]?.id == null);
await as(A); await db.exec(`select init_owner()`); await db.exec(`update system_state set kill = true`); await db.exec('reset role');
ok('claim_job gives nothing while kill is on', (await jobsA(`select * from claim_job('w1')`))[0]?.id == null);
await as(A); await db.exec(`update system_state set kill = false`); await db.exec('reset role');
let jb = (await jobsA(`select * from claim_job('w1', 30)`))[0];
ok('claim_job hands out the due job: running, attempt 1, leased to w1', jb && jb.state === 'running' && jb.attempts === 1 && jb.locked_by === 'w1');
ok('a second worker gets nothing while the lease is valid', (await jobsA(`select * from claim_job('w2')`))[0]?.id == null);
ok('heartbeat by the owner of the lease works; by another worker fails', (await jobsA(`select heartbeat_job('${jb.id}','w1',30) as r`))[0].r === true && (await jobsA(`select heartbeat_job('${jb.id}','w2',30) as r`))[0].r === false);
ok('another worker cannot finish the job', (await jobsA(`select * from finish_job('${jb.id}','w2',true)`))[0]?.id == null);
let fin = (await jobsA(`select * from finish_job('${jb.id}','w1',false,null,'boom',0)`))[0];
ok('failed attempt goes back to queued with the error (attempts left)', fin.state === 'queued' && fin.error === 'boom' && fin.locked_by === null);
jb = (await jobsA(`select * from claim_job('w1')`))[0]; ok('retry is claimed again, attempt 2', jb.attempts === 2);
fin = (await jobsA(`select * from finish_job('${jb.id}','w1',false,null,'no retry',0,false)`))[0]; ok('p_retry=false fails the job at once', fin.state === 'failed' && fin.finished_at !== null);
await db.exec(`insert into jobs(owner_id,kind,max_attempts) values ('${A}','system.purge',2)`);
for (let i = 0; i < 2; i++) { const c = (await jobsA(`select * from claim_job('w1')`))[0]; await jobsA(`select * from finish_job('${c.id}','w1',false,null,'x',0)`); }
ok('attempts used up => failed, not queued forever', (await jobsA(`select state from jobs where kind='system.purge'`))[0].state === 'failed');
await db.exec(`insert into jobs(owner_id,kind,max_attempts,state,attempts,locked_by,locked_until) values ('${A}','crash.test',3,'running',1,'dead-worker', now() - interval '1 minute')`);
jb = (await jobsA(`select * from claim_job('w9')`))[0]; ok('a job whose worker died (lease expired) is taken again', jb && jb.kind === 'crash.test' && jb.attempts === 2 && jb.locked_by === 'w9');
await db.exec(`update jobs set state='running', attempts=3, max_attempts=3, locked_by='dead', locked_until = now() - interval '1 minute' where kind='crash.test'`);
await jobsA(`select * from claim_job('w9')`); ok('expired lease on the last attempt => failed', (await jobsA(`select state from jobs where kind='crash.test'`))[0].state === 'failed');
await db.exec(`insert into jobs(owner_id,kind,run_at) values ('${A}','later.job', now() + interval '1 hour')`);
ok('a job scheduled for later is not handed out yet', (await jobsA(`select * from claim_job('w1')`))[0]?.id == null);
await as(A); await db.exec(`update system_state set kill = true`); await db.exec('reset role');
await db.exec(`insert into jobs(owner_id,kind) values ('${A}','during.kill')`);
ok('kill switch ON: no job is handed out', (await jobsA(`select * from claim_job('w1')`))[0]?.id == null);
await as(A); await db.exec(`update system_state set kill = false`); await db.exec('reset role');
await db.exec(`insert into jobs(owner_id,kind,idempotency_key) values ('${A}','dup.job','k')`);
ok('same idempotency_key for the same owner is refused', !!(await fails(`insert into jobs(owner_id,kind,idempotency_key) values ('${A}','dup.job','k')`)));
ok('bad kind is refused', !!(await fails(`insert into jobs(owner_id,kind) values ('${A}','Bad Kind')`)));
await db.exec(`insert into jobs(owner_id,kind,state,finished_at) values ('${A}','old.done','done', now() - interval '31 days'),('${A}','new.done','done', now() - interval '1 day')`);
ok('purge_old_jobs removes only finished jobs older than 30 days', (await jobsA(`select purge_old_jobs() as n`))[0].n === 1 && (await jobsA(`select 1 from jobs where kind='new.done'`)).length === 1);
await as(B); ok('B cannot see A jobs', (await db.query('select * from jobs')).rows.length === 0);
ok('B cannot add a job for A', !!(await fails(`insert into jobs(owner_id,kind) values ('${A}','x.y')`)));
await as(A); ok('A can read own jobs', (await db.query('select * from jobs')).rows.length > 0);
// 0004 privilege audit: ALL four SECURITY DEFINER functions are service_role-only.
const protectedFunctions = [
  ['claim_job', 'public.claim_job(text,integer)', `select * from claim_job('permission-test')`],
  ['heartbeat_job', 'public.heartbeat_job(uuid,text,integer)', `select heartbeat_job(gen_random_uuid(),'permission-test',30)`],
  ['finish_job', 'public.finish_job(uuid,text,boolean,jsonb,text,integer,boolean)', `select * from finish_job(gen_random_uuid(),'permission-test',true)`],
  ['purge_old_jobs (the fourth function)', 'public.purge_old_jobs()', `select purge_old_jobs()`],
];
for (const [name, signature, call] of protectedFunctions) {
  const p = (await db.query(`select has_function_privilege('service_role','${signature}','EXECUTE') as service, has_function_privilege('authenticated','${signature}','EXECUTE') as owner, has_function_privilege('anon','${signature}','EXECUTE') as anon`)).rows[0];
  ok(`0004 ${name}: EXECUTE granted to service_role only`, p.service === true && p.owner === false && p.anon === false);
  await as(A); ok(`authenticated cannot execute 0004 ${name}`, !!(await fails(call)));
  await as(null); ok(`anon cannot execute 0004 ${name}`, !!(await fails(call)));
  await db.exec('reset role; set role service_role');
  ok(`service_role can execute 0004 ${name}`, !(await fails(call)));
  await db.exec('reset role');
}

// 0005 rate limit: atomic per-owner window, service_role-only; audit function changes state and records activity.
await db.exec(`set role service_role`);
const hit1 = (await db.query(`select consume_event_rate_limit('${A}',2,3600) as ok`)).rows[0].ok;
const hit2 = (await db.query(`select consume_event_rate_limit('${A}',2,3600) as ok`)).rows[0].ok;
const hit3 = (await db.query(`select consume_event_rate_limit('${A}',2,3600) as ok`)).rows[0].ok;
const hitOther = (await db.query(`select consume_event_rate_limit('${B}',2,3600) as ok`)).rows[0].ok;
ok('event rate limit allows first two, blocks third, isolates owners', hit1 && hit2 && !hit3 && hitOther);
const killBefore = (await db.query(`select epoch from system_state where owner_id='${A}' and id=1`)).rows[0].epoch;
const auditState = (await db.query(`select * from set_system_kill('${A}',true,'device:test','permission test')`)).rows[0];
const auditRow = (await db.query(`select action,actor,detail->>'reason' as reason from activity_log where owner_id='${A}' order by id desc limit 1`)).rows[0];
ok('service-only set_system_kill updates state and creates audit record', auditState.kill === true && auditState.epoch === killBefore + 1 && auditRow.action === 'kill_switch.enabled' && auditRow.reason === 'permission test');
await db.exec('reset role');
await as(A); ok('authenticated cannot call event rate-limit RPC', !!(await fails(`select consume_event_rate_limit('${A}',2,60)`)));
ok('authenticated cannot call atomic kill/audit RPC', !!(await fails(`select * from set_system_kill('${A}',false,'owner:test','x')`)));
await as(null); ok('anon cannot call event rate-limit RPC', !!(await fails(`select consume_event_rate_limit('${A}',2,60)`)));
ok('anon cannot call atomic kill/audit RPC', !!(await fails(`select * from set_system_kill('${A}',false,'owner:test','x')`)));
await db.exec('reset role');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
