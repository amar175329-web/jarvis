// npm run check  ->  enforces FOLDER_FIRST_RULE.md. Runs in CI and before every merge. Optional: --base origin/main
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, HEADINGS, layout, schema, allDirs, isUnit, isContainer, loadUnits, buildRegistry, danglingLinks, parseKnowledge, hasRealContent, exists, read } from './lib.ts';

const errors: string[] = [];
const { units, errors: unitErrors } = loadUnits();
errors.push(...unitErrors);

// 1. top-level orphans + required root files
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'legacy' && !layout.areas.includes(e.name)) errors.push(`${e.name}/: top-level folder is not in layout.json "areas" (orphan)`);
}
for (const f of ['START_HERE.md', 'FOLDER_FIRST_RULE.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.gitignore', 'package.json']) if (!exists(f)) errors.push(`${f}: required root file is missing`);

// 2. KNOWLEDGE.md in every unit and container, with all fixed headings
const statuses: string[] = schema.properties.status.enum;
for (const rel of allDirs().filter((d) => isUnit(d) || isContainer(d))) {
  const kp = `${rel}/KNOWLEDGE.md`;
  if (!exists(kp)) { errors.push(`${rel}: folder has no KNOWLEDGE.md`); continue; }
  const { sections } = parseKnowledge(read(kp));
  for (const h of HEADINGS) if (!(h in sections)) errors.push(`${kp}: missing heading "${h}:"`);
  const st = (sections['STATUS'] ?? '').split(/\s/)[0];
  if (!statuses.includes(st)) errors.push(`${kp}: STATUS must be one of ${statuses.join(', ')}`);
  const u = units.find((x) => x.rel === rel);
  if (u) {
    if (st !== u.manifest.status) errors.push(`${kp}: STATUS "${st}" does not match manifest status "${u.manifest.status}"`);
    if (['built', 'tested', 'live'].includes(u.manifest.status)) {
      if (!hasRealContent(sections['WHAT IT CAN DO'])) errors.push(`${kp}: status is ${u.manifest.status} but WHAT IT CAN DO is empty`);
      if (!hasRealContent(sections['HOW IT WORKS'])) errors.push(`${kp}: status is ${u.manifest.status} but HOW IT WORKS is empty`);
    }
  }
}


// 2b. stronger rules (S00 audit P0/P1)
const NEED_CONTENT = ['STATUS', 'WHAT IT IS', 'WHAT IT CAN DO', 'WHAT IT CANNOT DO / LIMITS', 'HOW IT WORKS', 'POWER LEVEL & CONFIRMATION', 'CHANGE LOG'];
for (const rel of allDirs().filter((d) => isUnit(d) || isContainer(d))) {
  const kp = `${rel}/KNOWLEDGE.md`;
  if (!exists(kp)) continue;
  const { sections } = parseKnowledge(read(kp));
  for (const h of NEED_CONTENT) if (h in sections && !sections[h].trim()) errors.push(`${kp}: heading "${h}:" is empty (write something, even "Not written yet.")`);
}
for (const u of units) {
  const m = u.manifest;
  if (m.owner_squad === 'UNASSIGNED' && m.status !== 'planned') errors.push(`${u.rel}: owner_squad is UNASSIGNED so status cannot go above planned`);
  if (m.evidence !== null && m.evidence !== undefined) {
    const e = m.evidence;
    if (typeof e.test_id !== 'string' || !e.test_id) errors.push(`${u.rel}: evidence needs a non-empty test_id`);
    if (typeof e.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(e.commit)) errors.push(`${u.rel}: evidence needs a commit sha (7-40 hex)`);
    if (typeof e.ci_run !== 'string' || !/^https:\/\//.test(e.ci_run)) errors.push(`${u.rel}: evidence needs a ci_run https link`);
  }
  if (['tested', 'live'].includes(m.status) && !m.evidence) errors.push(`${u.rel}: status ${m.status} needs evidence {test_id, commit, ci_run}`);
  // no empty scaffolding: a unit still "planned" may hold only manifest.json and KNOWLEDGE.md
  if (m.status === 'planned' && /^(features|library|packages|worker)\//.test(u.rel)) {
    const extra = fs.readdirSync(path.join(ROOT, u.rel)).filter((n) => n !== 'manifest.json' && n !== 'KNOWLEDGE.md');
    if (extra.length) errors.push(`${u.rel}: status is planned but it already has ${extra.join(', ')} (planned units hold only manifest.json + KNOWLEDGE.md; move to built when real code arrives)`);
  }
}
for (const d of allDirs()) {
  const entries = fs.readdirSync(path.join(ROOT, d));
  if (!entries.length) errors.push(`${d}/: empty folder (no empty scaffolding; create it when real code arrives)`);
}

// 3. links, agent offices, registry freshness
errors.push(...danglingLinks(units));
for (const u of units.filter((x) => x.rel.startsWith('library/agents/'))) {
  const o = `command-center/agents/${u.rel.split('/')[2]}`;
  if (!exists(`${o}/manifest.json`)) errors.push(`${o}: agent office missing (run: npm run register)`);
}
if (!errors.length) {
  for (const [file, text] of Object.entries(buildRegistry(units))) if (!exists(file) || read(file) !== text) errors.push(`${file}: registry is stale (run: npm run register)`);
}

// 4. personal data and secrets never live in the repo
const walk = (rel: string): string[] => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.git') ? [] : e.isDirectory() ? walk(`${rel}/${e.name}`) : [`${rel}/${e.name}`]);
for (const f of walk('memory')) if (!/\/(KNOWLEDGE\.md|manifest\.json)$/.test(f)) errors.push(`${f}: memory/ may hold only KNOWLEDGE.md and manifest.json (personal data lives in the database, never in git)`);
for (const f of walk('.')) if (/(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example')) errors.push(`${f}: secret file must not be in the repo (only .env.example with names)`);


// 4b. secret scan: keys must never sit inside ANY text file (md, json, ts, html ...)
const SECRET_PATTERNS: [string, RegExp][] = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['JWT (Supabase anon/service key looks like this)', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Slack/Telegram-style token', /\b(?:xox[abp]-[A-Za-z0-9-]{10,}|\d{8,10}:AA[A-Za-z0-9_-]{30,})/],
];
const TEXT_EXT = /\.(md|json|ts|tsx|js|mjs|cjs|html|css|sql|yml|yaml|toml|txt|kt|kts|xml|gradle|properties|sh|example)$/;
for (const f of walk('.')) {
  if (!TEXT_EXT.test(f) && !f.endsWith('.env.example')) continue;
  if (f.startsWith('./scripts/check.ts')) continue; // holds the patterns themselves
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) errors.push(`${f}: looks like a ${label} (secrets never go in the repo; use env vars / vault)`);
  // service_role = master key: only server-side code may even mention it
  if (/service_role/i.test(text) && /^\.\/(app|android|features)\//.test(f)) errors.push(`${f}: "service_role" must never appear in client code (app/, android/, features/)`);
}

// 5. code changed => KNOWLEDGE.md and manifest.version must change in the same change (needs --base)
const bi = process.argv.indexOf('--base');
if (bi > -1) {
  const base = process.argv[bi + 1];
  try {
    const changed = execSync(`git diff --name-only ${base}...HEAD`, { cwd: ROOT }).toString().split('\n').filter(Boolean);
    for (const u of units) {
      const mine = changed.filter((f) => f.startsWith(u.rel + '/') && !/\/(KNOWLEDGE\.md|manifest\.json)$/.test(f) && !f.startsWith('self/registry/'));
      if (!mine.length) continue;
      if (!changed.includes(`${u.rel}/KNOWLEDGE.md`)) errors.push(`${u.rel}: code changed but KNOWLEDGE.md was not updated`);
      let before: string | null = null;
      try { before = JSON.parse(execSync(`git show ${base}:${u.rel}/manifest.json`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).version; } catch { /* new unit */ }
      if (before !== null && before === u.manifest.version) errors.push(`${u.rel}: code changed but manifest.version was not bumped (still ${before})`);
    }
  } catch { errors.push(`could not diff against "${base}" (does that ref exist?)`); }
}

if (errors.length) { console.error(`CHECK FAILED (${errors.length}):\n` + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }
console.log(`CHECK PASSED: ${units.length} units, ${allDirs().filter(isContainer).length} containers${bi > -1 ? ', diff rule checked' : ' (diff rule skipped: pass --base <ref> in CI)'}.`);
