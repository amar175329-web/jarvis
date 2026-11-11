// npm run register  ->  validates every manifest, creates agent offices, rebuilds self/registry/*. Hardened further in S00 part 7.
import { loadUnits, buildRegistry, danglingLinks, exists, read, writeFile, knowledgeTemplate, type Unit } from './lib.ts';

let { units, errors } = loadUnits();
if (errors.length) { console.error('REGISTER FAILED:\n' + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }

// Every agent in library/agents gets its own office in command-center/agents (created here, never by hand).
let created = 0;
for (const u of units.filter((x) => x.rel.startsWith('library/agents/'))) {
  const name = u.rel.split('/')[2], rel = `command-center/agents/${name}`;
  if (exists(`${rel}/manifest.json`)) continue;
  const manifest = { id: `command-center.agents.${name}`, name: `${u.manifest.name} office`, kind: 'agent-office', group: 'agents', owner_squad: 'S18', phase: 3, status: 'planned', does: `Work office for ${u.manifest.name}: what was handed over, what it did, what we learned.`, uses: [u.manifest.id], knows: [], autonomy_default: 'L0', version: '0.0.1' };
  writeFile(`${rel}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  writeFile(`${rel}/KNOWLEDGE.md`, knowledgeTemplate({ name: manifest.name, status: 'planned', what: manifest.does, can: ['Keep the work log, inbox/outbox and lessons for this agent (folders are created when real work arrives)'], how: 'Not written yet. Created automatically by scripts/register when the agent was added to library/agents.', uses: `Uses ${u.manifest.id}.`, power: 'L0 (it only records; it does not act).', owner: 'S18' }));
  created++;
}
if (created) ({ units, errors } = loadUnits());
errors.push(...danglingLinks(units));
if (errors.length) { console.error('REGISTER FAILED:\n' + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }

let changed = 0;
for (const [file, text] of Object.entries(buildRegistry(units))) {
  if (!exists(file) || read(file) !== text) { writeFile(file, text); changed++; }
}
console.log(`REGISTER OK: ${units.length} units, ${created} agent office(s) created, ${changed} registry file(s) rewritten.`);
