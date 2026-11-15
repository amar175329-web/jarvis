import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { checkLocalHealth } from '../../src/health.ts';
import { pingHealthOnce } from '../../src/health-ping.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_SH = path.resolve(__dirname, '../run.sh');
const LOG_FILE = path.resolve(__dirname, 'stability_log.txt');
const RESULTS_FILE = path.resolve(__dirname, 'stability_results.json');

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function getMem() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = text.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (m) return Math.floor(parseInt(m[1], 10) / 1024);
  } catch {}
  const out = execSync('free -m', { encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.startsWith('Mem:'));
  const parts = line.trim().split(/\s+/);
  return parseInt(parts[6] || parts[parts.length - 1], 10) || 0;
}

function isServerRunning() {
  try {
    const statusRes = spawnSync(RUN_SH, ['status'], { encoding: 'utf8' });
    if (statusRes.stdout) {
      const data = JSON.parse(statusRes.stdout.trim());
      return !!data.running;
    }
  } catch {}
  return false;
}

const MODEL_NAME = process.env.LOCAL_MODEL_NAME || (process.env.LOCAL_MODEL_PATH?.includes('1b') ? 'gemma-3-1b-it' : 'gemma-3-270m-it');

const FEW_SHOT_PROMPTS = [
  {
    role: 'system',
    content: 'You extract task and time in JSON format with exact keys "काम" and "समय". Return only JSON with the exact task from the user sentence.',
  },
  { role: 'user', content: 'कल सुबह सात बजे योga करना है' },
  { role: 'assistant', content: '{"काम": "योga करना है", "समय": "कल सुबह 7:00 बजे"}' },
  { role: 'user', content: 'आज दोपहर में बैंक जाना है' },
  { role: 'assistant', content: '{"काम": "बैंक जाना है", "समय": "आज दोपहर"}' },
  { role: 'user', content: 'raat 9 baje dadi ko call karna hai' },
  { role: 'assistant', content: '{"काम": "dadi ko call karna hai", "समय": "raat 9:00 baje"}' },
];

function checkMismatch(inputText, result) {
  if (!result || !result.काम || !result.समय) {
    return { ok: false, reason: 'Missing keys "काम" or "समय"' };
  }
  const normInput = inputText.toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ');
  const normTask = String(result.काम).toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ');
  const normTime = String(result.समय).toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ');

  // Task check: at least one significant keyword (>2 chars) from task must be in input
  const taskWords = normTask.split(' ').filter((w) => w.length > 2);
  const taskInInput = taskWords.length > 0 && taskWords.some((w) => normInput.includes(w));

  // Time check: at least one significant keyword from time must be in input
  const timeWords = normTime.split(' ').filter((w) => w.length > 1);
  const timeInInput = timeWords.length > 0 && timeWords.some((w) => normInput.includes(w));

  if (!taskInInput && !timeInInput) {
    return { ok: false, reason: `Both task ("${result.काम}") and time ("${result.समय}") do not match input ("${inputText}")` };
  }
  if (!taskInInput) {
    return { ok: false, reason: `Task ("${result.काम}") does not match input sentence ("${inputText}")` };
  }
  if (!timeInInput) {
    return { ok: false, reason: `Time ("${result.समय}") does not match input sentence ("${inputText}")` };
  }
  return { ok: true, reason: 'Task and time match input text keywords' };
}

function sendQuery(text) {
  const payload = JSON.stringify({
    messages: [
      ...FEW_SHOT_PROMPTS,
      { role: 'user', content: text },
    ],
    json_schema: {
      type: 'object',
      properties: {
        काम: { type: 'string' },
        समय: { type: 'string' },
      },
      required: ['काम', 'समय'],
    },
    max_tokens: 100,
    temperature: 0.1,
  });

  const t0 = performance.now();
  const res = spawnSync(RUN_SH, ['request', payload], {
    encoding: 'utf8',
    timeout: 60000,
  });
  const duration = (performance.now() - t0) / 1000;

  let parsed = null;
  if (res.status === 0 && res.stdout) {
    try {
      const resp = JSON.parse(res.stdout);
      const content = resp.choices?.[0]?.message?.content?.trim() || '';
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
  }

  const mismatch = parsed ? checkMismatch(text, parsed) : { ok: false, reason: 'Failed to parse JSON' };

  return {
    ok: res.status === 0 && !!parsed && mismatch.ok,
    durationSec: Number(duration.toFixed(2)),
    result: parsed,
    mismatch,
    modelName: MODEL_NAME,
    fullQuery: text,
    raw: res.stdout || res.stderr,
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const TOTAL_DURATION_SEC = parseInt(process.env.STABILITY_DURATION_SEC || '1800', 10); // default 30 minutes = 1800s
  const IDLE_LIMIT_SEC = parseInt(process.env.LOCAL_IDLE_SECONDS || String((parseInt(process.env.LOCAL_IDLE_MINUTES || '5', 10)) * 60), 10);
  const POLL_INTERVAL_MS = parseInt(process.env.STABILITY_POLL_MS || (TOTAL_DURATION_SEC > 120 ? '60000' : '5000'), 10);

  fs.writeFileSync(LOG_FILE, `=== STABILITY TEST START: ${new Date().toISOString()} ===\n`, 'utf8');

  log(`Starting Stability Test. Duration: ${TOTAL_DURATION_SEC}s (${(TOTAL_DURATION_SEC / 60).toFixed(1)} mins), Idle timeout: ${IDLE_LIMIT_SEC}s, Poll: ${POLL_INTERVAL_MS}ms`);
  log(`Initial Available RAM: ${getMem()} MB`);

  const events = [];
  const startTime = Date.now();
  let crashes = 0;

  // Make sure server starts fresh
  spawnSync(RUN_SH, ['stop'], { encoding: 'utf8' });
  await sleep(1000);

  // Check 1: Cold start at t=0
  log('--- Phase 1: Initial Cold Start & Inference (t = 0m) ---');
  const ramBefore1 = getMem();
  const q1 = sendQuery('कल सुबह 8 बजे दवाई लेनी है');
  const ramAfter1 = getMem();
  const s1Running = isServerRunning();
  log(`Query 1 [Cold Start] | Model: ${q1.modelName} | Full Query: "${q1.fullQuery}"`);
  log(`  Duration: ${q1.durationSec}s | RAM: ${ramBefore1}MB -> ${ramAfter1}MB | Server Running: ${s1Running}`);
  log(`  Extracted: ${JSON.stringify(q1.result)}`);
  log(`  Mismatch Check: ${q1.mismatch.ok ? 'PASS (Match OK)' : 'FAIL (' + q1.mismatch.reason + ')'}`);
  events.push({ timeSec: 0, type: 'cold_query', query: q1.fullQuery, ...q1, ramBefore: ramBefore1, ramAfter: ramAfter1, serverRunning: s1Running });

  // Warm query
  const waitWarmMs = TOTAL_DURATION_SEC > 120 ? 10000 : 2000;
  await sleep(waitWarmMs);
  log('--- Phase 2: Warm Inference Test ---');
  const q2 = sendQuery('आज दोपहर 2 बजे मीटिंग है');
  log(`Query 2 [Warm] | Model: ${q2.modelName} | Full Query: "${q2.fullQuery}"`);
  log(`  Duration: ${q2.durationSec}s | Server Running: ${isServerRunning()}`);
  log(`  Extracted: ${JSON.stringify(q2.result)}`);
  log(`  Mismatch Check: ${q2.mismatch.ok ? 'PASS (Match OK)' : 'FAIL (' + q2.mismatch.reason + ')'}`);
  events.push({ timeSec: Math.floor((Date.now() - startTime) / 1000), type: 'warm_query', query: q2.fullQuery, ...q2 });

  let midQuerySent = false;
  let observedIdleShutdown1 = false;
  let observedIdleShutdown2 = false;
  let lastQueryTimeSec = Math.floor((Date.now() - startTime) / 1000);

  const midTargetSec = TOTAL_DURATION_SEC > 120 ? Math.floor(TOTAL_DURATION_SEC / 2) : Math.floor(TOTAL_DURATION_SEC * 0.55);

  while ((Date.now() - startTime) / 1000 < TOTAL_DURATION_SEC) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const elapsedMin = (elapsedSec / 60).toFixed(1);

    // Non-intrusive Health Check every loop
    const health = checkLocalHealth();
    const running = isServerRunning();
    const mem = getMem();

    log(`[t=${elapsedMin}m / ${elapsedSec}s] Health OK=${health.ok}, Server Running=${running}, Available RAM=${mem}MB`);

    // Verify 1st idle shutdown
    const idleElapsed = elapsedSec - lastQueryTimeSec;
    if (idleElapsed >= (IDLE_LIMIT_SEC + 5) && !running && !observedIdleShutdown1 && !midQuerySent) {
      observedIdleShutdown1 = true;
      log(`[VERIFIED] Server automatically shut down on idle after ${IDLE_LIMIT_SEC}s! RAM freed: ${mem}MB`);
      events.push({ timeSec: elapsedSec, type: 'idle_shutdown_1', ram: mem, success: true });
    }

    // Mid-point test query
    if (elapsedSec >= midTargetSec && !midQuerySent) {
      midQuerySent = true;
      log('--- Phase 3: Mid-Point Auto-Restart & Inference ---');
      const ramBeforeMid = getMem();
      const qMid = sendQuery('सोमवार शाम 5 बजे टीम मीटिंग है');
      const ramAfterMid = getMem();
      log(`Query 3 [Mid Auto-Restart] | Model: ${qMid.modelName} | Full Query: "${qMid.fullQuery}"`);
      log(`  Duration: ${qMid.durationSec}s | RAM: ${ramBeforeMid}MB -> ${ramAfterMid}MB | Server Running: ${isServerRunning()}`);
      log(`  Extracted: ${JSON.stringify(qMid.result)}`);
      log(`  Mismatch Check: ${qMid.mismatch.ok ? 'PASS (Match OK)' : 'FAIL (' + qMid.mismatch.reason + ')'}`);
      events.push({ timeSec: elapsedSec, type: 'mid_query', query: qMid.fullQuery, ...qMid, ramBefore: ramBeforeMid, ramAfter: ramAfterMid });
      lastQueryTimeSec = Math.floor((Date.now() - startTime) / 1000);
    }

    // Verify 2nd idle shutdown
    const idleElapsedAfterMid = elapsedSec - lastQueryTimeSec;
    if (midQuerySent && idleElapsedAfterMid >= (IDLE_LIMIT_SEC + 5) && !running && !observedIdleShutdown2) {
      observedIdleShutdown2 = true;
      log(`[VERIFIED] Server automatically shut down second time after ${IDLE_LIMIT_SEC}s idle! RAM freed: ${mem}MB`);
      events.push({ timeSec: elapsedSec, type: 'idle_shutdown_2', ram: mem, success: true });
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Final query
  log('--- Phase 4: Final Inference Verification ---');
  const ramBeforeFinal = getMem();
  const qFinal = sendQuery('शुक्रवार दोपहर 2 बजे बिजली का बिल भरना है');
  const ramAfterFinal = getMem();
  log(`Query 4 [Final Verification] | Model: ${qFinal.modelName} | Full Query: "${qFinal.fullQuery}"`);
  log(`  Duration: ${qFinal.durationSec}s | RAM: ${ramBeforeFinal}MB -> ${ramAfterFinal}MB | Server Running: ${isServerRunning()}`);
  log(`  Extracted: ${JSON.stringify(qFinal.result)}`);
  log(`  Mismatch Check: ${qFinal.mismatch.ok ? 'PASS (Match OK)' : 'FAIL (' + qFinal.mismatch.reason + ')'}`);
  events.push({
    timeSec: Math.floor((Date.now() - startTime) / 1000),
    type: 'final_query',
    query: qFinal.fullQuery,
    ...qFinal,
    ramBefore: ramBeforeFinal,
    ramAfter: ramAfterFinal,
  });

  const totalTimeSec = Math.floor((Date.now() - startTime) / 1000);
  log(`=== STABILITY TEST COMPLETED: Total elapsed ${totalTimeSec}s (${(totalTimeSec / 60).toFixed(1)} mins) ===`);
  log(`Total Crashes: ${crashes}`);
  log(`Idle Shutdown 1 Verified: ${observedIdleShutdown1}`);
  log(`Idle Shutdown 2 Verified: ${observedIdleShutdown2}`);
  log(`Final RAM: ${getMem()} MB`);

  const summary = {
    test: 'Stability and Lifecycle Test',
    status: crashes === 0 && qFinal.ok ? 'PASSED' : 'FAILED',
    totalDurationSec: totalTimeSec,
    totalCrashes: crashes,
    idleShutdown1Verified: observedIdleShutdown1,
    idleShutdown2Verified: observedIdleShutdown2,
    events,
    completedAt: new Date().toISOString(),
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Stability test summary saved to ${RESULTS_FILE}`);
}

main().catch((err) => {
  log(`Stability test fatal error: ${err.stack || err}`);
  process.exit(1);
});
