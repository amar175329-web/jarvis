import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { extractByRules } from '../rules.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_SH = path.resolve(__dirname, '../run.sh');
const CASES_FILE = path.resolve(__dirname, 'cases.json');
const RESULTS_FILE = path.resolve(__dirname, 'results.json');

const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));

function getMem() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = text.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (m) return Math.floor(parseInt(m[1], 10) / 1024);
  } catch {
    // fallback
  }
  const out = execSync('free -m', { encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.startsWith('Mem:'));
  const parts = line.trim().split(/\s+/);
  return parseInt(parts[6] || parts[parts.length - 1], 10) || 0;
}

function stopServer() {
  try {
    spawnSync(RUN_SH, ['stop'], { encoding: 'utf8' });
  } catch {}
}

const FEW_SHOT_MESSAGES = [
  {
    role: 'system',
    content: 'You extract task and time in JSON format with exact keys "काम" and "समय". Return only JSON.',
  },
  { role: 'user', content: 'कल सुबह सात बजे योगा करना है' },
  { role: 'assistant', content: '{"काम": "योगा करना है", "समय": "कल सुबह 7:00 बजे"}' },
  { role: 'user', content: 'आज दोपहर में बैंक जाना है' },
  { role: 'assistant', content: '{"काम": "बैंक जाना है", "समय": "आज दोपहर"}' },
  { role: 'user', content: 'raat 9 baje dadi ko call karna hai' },
  { role: 'assistant', content: '{"काम": "dadi ko call karna hai", "समय": "raat 9:00 baje"}' },
];

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    काम: { type: 'string' },
    समय: { type: 'string' },
  },
  required: ['काम', 'समय'],
};

function callModel(promptText, modelPath) {
  const payload = JSON.stringify({
    messages: [
      ...FEW_SHOT_MESSAGES,
      { role: 'user', content: promptText },
    ],
    json_schema: JSON_SCHEMA,
    max_tokens: 100,
    temperature: 0.1,
  });

  const env = { ...process.env, LOCAL_MODEL_PATH: modelPath };
  const res = spawnSync(RUN_SH, ['request', payload], {
    encoding: 'utf8',
    env,
    timeout: 90000,
  });

  if (res.status !== 0 || !res.stdout) {
    return { ok: false, raw: res.stderr || res.stdout || 'failed' };
  }

  try {
    const parsed = JSON.parse(res.stdout);
    const content = parsed.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return { ok: true, data, raw: content, timings: parsed.timings };
    }
    return { ok: false, raw: content };
  } catch (e) {
    return { ok: false, raw: res.stdout, error: String(e) };
  }
}

function normalizeStr(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ').trim();
}

function isMatch(extracted, expected) {
  if (!extracted || !extracted.काम || !extracted.समय) return false;

  const extTask = normalizeStr(extracted.काम);
  const expTask = normalizeStr(expected.काम);
  const extTime = normalizeStr(extracted.समय);
  const expTime = normalizeStr(expected.समय);

  // Task check: task contains main keywords
  const taskKeywords = expTask.split(' ').filter((w) => w.length > 2);
  const taskOk = taskKeywords.length > 0 && taskKeywords.some((kw) => extTask.includes(kw));

  // Time check: time contains expected keywords
  const timeKeywords = expTime.split(' ').filter((w) => w.length > 1);
  const timeOk = timeKeywords.length > 0 && timeKeywords.some((kw) => extTime.includes(kw));

  return taskOk && timeOk;
}

export async function runEvaluation() {
  console.log('====================================================');
  console.log('STARTING EVALUATION: 20 Cases across 4 Methods');
  console.log('====================================================\n');

  const allResults = {};

  // -------------------------------------------------------------------
  // METHOD C: Rules (नियम-वाला एक्सट्रैक्टर)
  // -------------------------------------------------------------------
  console.log('>>> Evaluating Method C: Rules Extractor (packages/models/local/rules.ts) <<<');
  const memRulesBefore = getMem();
  const rulesItems = [];
  const rulesT0 = performance.now();
  let rulesFirstTime = 0;
  let rulesSubsequentTotal = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const tStart = performance.now();
    const res = extractByRules(c.text);
    const duration = (performance.now() - tStart) / 1000;

    if (i === 0) rulesFirstTime = duration;
    else rulesSubsequentTotal += duration;

    const correct = isMatch(res, c.expected);
    rulesItems.push({
      id: c.id,
      text: c.text,
      script: c.script,
      extracted: res,
      expected: c.expected,
      correct,
      durationSec: duration,
    });
  }

  const memRulesAfter = getMem();
  const rulesDevaCorrect = rulesItems.filter((x) => x.script === 'devanagari' && x.correct).length;
  const rulesRomanCorrect = rulesItems.filter((x) => x.script === 'roman' && x.correct).length;
  const rulesTotalCorrect = rulesItems.filter((x) => x.correct).length;

  allResults.C_Rules = {
    method: 'Rules Extractor',
    totalCorrect: rulesTotalCorrect,
    devaCorrect: `${rulesDevaCorrect}/15`,
    romanCorrect: `${rulesRomanCorrect}/5`,
    firstRequestSec: Number(rulesFirstTime.toFixed(4)),
    subsequentAvgSec: Number((rulesSubsequentTotal / (cases.length - 1)).toFixed(4)),
    ramBeforeMb: memRulesBefore,
    ramAfterMb: memRulesAfter,
    items: rulesItems,
  };
  console.log(`Method C Result: ${rulesTotalCorrect}/20 correct (Deva: ${rulesDevaCorrect}/15, Roman: ${rulesRomanCorrect}/5)\n`);

  // -------------------------------------------------------------------
  // METHOD A: Gemma 3 270M (Few-shot + JSON schema)
  // -------------------------------------------------------------------
  console.log('>>> Evaluating Method A: Gemma 3 270M Instruct (Few-Shot + Schema) <<<');
  stopServer();
  const model270mPath = '/root/models/google_gemma-3-270m-it-Q4_K_M.gguf';
  const mem270Before = getMem();
  const items270 = [];
  let first270Time = 0;
  let sub270Total = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const ramNow = getMem();
    if (ramNow < 800) {
      console.warn(`[WARNING] RAM below 800 MB (${ramNow} MB). Stopping Method A!`);
      break;
    }

    const tStart = performance.now();
    const res = callModel(c.text, model270mPath);
    const duration = (performance.now() - tStart) / 1000;

    if (i === 0) first270Time = duration;
    else sub270Total += duration;

    const data = res.ok ? res.data : null;
    const correct = res.ok && isMatch(data, c.expected);
    items270.push({
      id: c.id,
      text: c.text,
      script: c.script,
      extracted: data,
      raw: res.raw,
      correct,
      durationSec: duration,
    });
    console.log(`  [270M] Case ${c.id}/20: ${correct ? 'PASS' : 'FAIL'} (${duration.toFixed(2)}s)`);
  }

  const mem270After = getMem();
  stopServer();

  const deva270Correct = items270.filter((x) => x.script === 'devanagari' && x.correct).length;
  const roman270Correct = items270.filter((x) => x.script === 'roman' && x.correct).length;
  const total270Correct = items270.filter((x) => x.correct).length;

  allResults.A_Gemma270M = {
    method: 'Gemma 3 270M Instruct',
    totalCorrect: total270Correct,
    devaCorrect: `${deva270Correct}/15`,
    romanCorrect: `${roman270Correct}/5`,
    firstRequestSec: Number(first270Time.toFixed(2)),
    subsequentAvgSec: Number((sub270Total / (items270.length - 1)).toFixed(2)),
    ramBeforeMb: mem270Before,
    ramAfterMb: mem270After,
    items: items270,
  };
  console.log(`Method A Result: ${total270Correct}/20 correct (Deva: ${deva270Correct}/15, Roman: ${roman270Correct}/5)\n`);

  // -------------------------------------------------------------------
  // METHOD B: Gemma 3 1B (Few-shot + JSON schema)
  // -------------------------------------------------------------------
  console.log('>>> Evaluating Method B: Gemma 3 1B Instruct (Few-Shot + Schema) <<<');
  stopServer();
  const model1bPath = '/root/models/google_gemma-3-1b-it-Q4_K_M.gguf';
  const mem1bBefore = getMem();
  console.log(`Available RAM before starting Gemma 1B: ${mem1bBefore} MB`);

  const items1b = [];
  let first1bTime = 0;
  let sub1bTotal = 0;
  let stoppedDueToRam = false;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const ramNow = getMem();
    if (ramNow < 800) {
      console.warn(`[RAM SAFETY STOP] Available RAM ${ramNow} MB is below 800 MB threshold! Halting Method B.`);
      stoppedDueToRam = true;
      break;
    }

    const tStart = performance.now();
    const res = callModel(c.text, model1bPath);
    const duration = (performance.now() - tStart) / 1000;

    const ramAfterCall = getMem();
    if (ramAfterCall < 800) {
      console.warn(`[RAM SAFETY STOP] Available RAM dropped to ${ramAfterCall} MB (<800 MB) after case ${c.id}! Halting Method B.`);
      stoppedDueToRam = true;
      break;
    }

    if (i === 0) first1bTime = duration;
    else sub1bTotal += duration;

    const data = res.ok ? res.data : null;
    const correct = res.ok && isMatch(data, c.expected);
    items1b.push({
      id: c.id,
      text: c.text,
      script: c.script,
      extracted: data,
      raw: res.raw,
      correct,
      durationSec: duration,
    });
    console.log(`  [1B] Case ${c.id}/20: ${correct ? 'PASS' : 'FAIL'} (${duration.toFixed(2)}s, RAM: ${ramAfterCall}MB)`);
  }

  const mem1bAfter = getMem();
  stopServer();

  const deva1bCorrect = items1b.filter((x) => x.script === 'devanagari' && x.correct).length;
  const roman1bCorrect = items1b.filter((x) => x.script === 'roman' && x.correct).length;
  const total1bCorrect = items1b.filter((x) => x.correct).length;

  allResults.B_Gemma1B = {
    method: 'Gemma 3 1B Instruct',
    totalCorrect: total1bCorrect,
    devaCorrect: `${deva1bCorrect}/${items1b.filter((x) => x.script === 'devanagari').length}`,
    romanCorrect: `${roman1bCorrect}/${items1b.filter((x) => x.script === 'roman').length}`,
    firstRequestSec: Number(first1bTime.toFixed(2)),
    subsequentAvgSec: items1b.length > 1 ? Number((sub1bTotal / (items1b.length - 1)).toFixed(2)) : 0,
    ramBeforeMb: mem1bBefore,
    ramAfterMb: mem1bAfter,
    stoppedDueToRam,
    casesCompleted: items1b.length,
    items: items1b,
  };
  console.log(`Method B Result: ${total1bCorrect}/${items1b.length} correct\n`);

  // -------------------------------------------------------------------
  // METHOD D: Hybrid (नियम + मॉडल)
  // -------------------------------------------------------------------
  console.log('>>> Evaluating Method D: Hybrid (Rules First -> Model Fallback if needed) <<<');
  stopServer();
  const memHybridBefore = getMem();
  const itemsHybrid = [];
  let firstHybridTime = 0;
  let subHybridTotal = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const tStart = performance.now();
    // Rule step
    const ruleRes = extractByRules(c.text);
    let finalRes = ruleRes;
    let usedMethod = 'rules';

    // If rules confidence is partial or failed, fallback to Gemma 270M
    if (!ruleRes.success || ruleRes.confidence !== 'high') {
      const modelRes = callModel(c.text, model270mPath);
      if (modelRes.ok && modelRes.data) {
        finalRes = {
          success: true,
          काम: modelRes.data.काम || ruleRes.काम,
          समय: modelRes.data.समय || ruleRes.समय,
          confidence: 'high',
          method: 'model_fallback',
        };
        usedMethod = 'model';
      }
    }

    const duration = (performance.now() - tStart) / 1000;
    if (i === 0) firstHybridTime = duration;
    else subHybridTotal += duration;

    const correct = isMatch(finalRes, c.expected);
    itemsHybrid.push({
      id: c.id,
      text: c.text,
      script: c.script,
      extracted: finalRes,
      usedMethod,
      correct,
      durationSec: duration,
    });
  }

  const memHybridAfter = getMem();
  stopServer();

  const devaHybridCorrect = itemsHybrid.filter((x) => x.script === 'devanagari' && x.correct).length;
  const romanHybridCorrect = itemsHybrid.filter((x) => x.script === 'roman' && x.correct).length;
  const totalHybridCorrect = itemsHybrid.filter((x) => x.correct).length;

  allResults.D_Hybrid = {
    method: 'Hybrid (Rules + Model Fallback)',
    totalCorrect: totalHybridCorrect,
    devaCorrect: `${devaHybridCorrect}/15`,
    romanCorrect: `${romanHybridCorrect}/5`,
    firstRequestSec: Number(firstHybridTime.toFixed(4)),
    subsequentAvgSec: Number((subHybridTotal / (cases.length - 1)).toFixed(4)),
    ramBeforeMb: memHybridBefore,
    ramAfterMb: memHybridAfter,
    items: itemsHybrid,
  };
  console.log(`Method D Result: ${totalHybridCorrect}/20 correct (Deva: ${devaHybridCorrect}/15, Roman: ${romanHybridCorrect}/5)\n`);

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
  console.log(`Results saved to ${RESULTS_FILE}`);
  return allResults;
}

if (process.argv[1]?.endsWith('run_eval.mjs')) {
  runEvaluation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Evaluation failed:', err);
      process.exit(1);
    });
}
