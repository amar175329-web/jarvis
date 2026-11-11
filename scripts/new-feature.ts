// npm run new-feature -- <path> --owner S01 --does "one plain line" [--kind feature] [--uses id,id] [--autonomy L0]
// Folder-First steps 1-4: folder -> KNOWLEDGE.md -> manifest.json (planned) -> register. Code comes AFTER this.
import { execSync } from 'node:child_process';
import { ROOT, OWNER_PHASE, allDirs, isUnit, exists, writeFile, knowledgeTemplate, idOf, schema } from './lib.ts';

const a = process.argv.slice(2);
const rel = (a[0] ?? '').replace(/\/+$/, '');
const opt = (k: string, d = '') => { const i = a.indexOf(`--${k}`); return i > -1 ? (a[i + 1] ?? d) : d; };
const fail = (m: string): never => { console.error('NEW-FEATURE FAILED: ' + m); process.exit(1); };

if (!rel) fail('usage: npm run new-feature -- <path> --owner S01 --does "plain line"');
if (!isUnit(rel)) fail(`"${rel}" is not a unit path. Units live at: features/<group>/<name>, library/<kind>/<name>, packages/<name>, self|memory|command-center|worker/<name>.`);
if (exists(rel)) fail(`${rel} already exists.`);
const name = rel.split('/').pop() as string, area = rel.split('/')[0];
const twin = allDirs().find((d) => d !== rel && isUnit(d) && d.split('/').pop() === name && d.split('/')[0] === area);
if (twin) fail(`"${name}" already exists at ${twin}. One thing, one home: extend that instead.`);
const owner = opt('owner', 'UNASSIGNED'), does = opt('does');
if (!does) fail('--does "one plain line" is required (what is this thing?)');
if (!(owner in OWNER_PHASE)) fail(`unknown owner "${owner}"`);
const defaults: Record<string, string> = { features: 'feature', packages: 'package', self: 'self-part', memory: 'memory-category', 'command-center': 'ops-part', worker: 'worker-part' };
const kind = opt('kind', area === 'library' ? ({ tools: 'tool', apps: 'app', recipes: 'recipe', skills: 'skill', plugins: 'plugin', mcp: 'mcp', integrations: 'integration', models: 'model', agents: 'agent', bots: 'bot', devices: 'device', themes: 'theme', automations: 'automation' } as Record<string, string>)[rel.split('/')[1]] ?? 'tool' : defaults[area]);
if (!schema.properties.kind.enum.includes(kind)) fail(`unknown kind "${kind}"`);
const autonomy = opt('autonomy', area === 'library' ? 'L1' : 'L0');
const manifest = { id: idOf(rel), name, kind, group: area === 'features' || area === 'library' ? rel.split('/')[1] : area, owner_squad: owner, phase: OWNER_PHASE[owner], status: 'planned', does, uses: opt('uses') ? opt('uses').split(',') : [], knows: [], autonomy_default: autonomy, version: '0.0.1' };
writeFile(`${rel}/KNOWLEDGE.md`, knowledgeTemplate({ name, status: 'planned', what: does, can: [does], how: `Not written yet. ${owner} writes this BEFORE any code (Folder-First step 2).`, power: `${autonomy} (provisional; S22 confirms).`, owner }));
writeFile(`${rel}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Created ${rel}/KNOWLEDGE.md and manifest.json (planned). Running register...`);
execSync('node scripts/register.ts', { cwd: ROOT, stdio: 'inherit' });
console.log(`Next: fill KNOWLEDGE.md properly, commit this step alone as "folder-first: ${name}", THEN write code.`);
