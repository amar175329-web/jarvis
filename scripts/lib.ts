// Shared helpers for register / check / new-feature. Zero dependencies (Node >= 22.18 runs .ts directly).
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const HEADINGS = ['STATUS', 'WHAT IT IS', 'WHAT IT CAN DO', 'WHAT IT CANNOT DO / LIMITS', 'HOW IT WORKS', 'INPUTS / OUTPUTS', 'USES / USED BY', 'POWER LEVEL & CONFIRMATION', 'EXAMPLES', 'KNOWN ISSUES', 'CHANGE LOG'];
export const OWNER_PHASE: Record<string, number> = { S00: 1, S01: 1, S02: 1, S03: 1, S04: 2, S05: 1, S06: 1, S07: 1, S08: 1, S09: 1, S10: 2, S11: 2, S12: 2, S13: 2, S14: 2, S15: 2, S16A: 1, S16B: 1, S17: 3, S18: 3, S19: 3, S20: 3, S21: 1, S22: 1, LEAD: 1, UNASSIGNED: 1 };

export type Layout = { areas: string[]; containers: string[]; units: string[] };
export const layout: Layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/manifest-schema/layout.json'), 'utf8'));
export const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/manifest-schema/manifest.schema.json'), 'utf8'));

const SKIP = new Set(['node_modules', '.git', 'legacy']);
export function allDirs(rel = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    out.push(r, ...allDirs(r));
  }
  return out;
}
const matches = (rel: string, pat: string) => {
  const a = rel.split('/'), b = pat.split('/');
  return a.length === b.length && b.every((s, i) => s === '*' || s === a[i]);
};
export const isExempt = (rel: string) => rel.split('/').some((s) => s.startsWith('_'));
export const isUnit = (rel: string) => !isExempt(rel) && layout.units.some((p) => matches(rel, p));
export const isContainer = (rel: string) => !isExempt(rel) && layout.containers.some((p) => matches(rel, p));
export const idOf = (rel: string) => rel.split('/').join('.');

export const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
export const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
export const writeFile = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true }); fs.writeFileSync(path.join(ROOT, rel), text); };

// ---- manifest validation, driven by contracts/manifest-schema/manifest.schema.json (single source of truth)
export function validateManifest(m: any, rel: string): string[] {
  const errs: string[] = [];
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return [`${rel}: manifest must be an object`];
  const props = schema.properties as Record<string, any>;
  for (const k of schema.required) if (!(k in m)) errs.push(`${rel}: missing field "${k}"`);
  for (const k of Object.keys(m)) if (!(k in props)) errs.push(`${rel}: unknown field "${k}"${k === 'risk' ? ' (there is no "risk" field: use autonomy_default L0-L4)' : ''}`);
  for (const [k, def] of Object.entries<any>(props)) {
    if (!(k in m)) continue;
    const v = m[k];
    const types = Array.isArray(def.type) ? def.type : [def.type];
    const actual = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v;
    if (!types.includes(actual)) { errs.push(`${rel}: "${k}" must be ${types.join('|')}`); continue; }
    if (def.enum && !def.enum.includes(v)) errs.push(`${rel}: "${k}" must be one of ${def.enum.join(', ')} (got ${JSON.stringify(v)})`);
    if (def.pattern && typeof v === 'string' && !new RegExp(def.pattern).test(v)) errs.push(`${rel}: "${k}" has wrong format (${v})`);
    if (def.minLength && typeof v === 'string' && v.length < def.minLength) errs.push(`${rel}: "${k}" is empty`);
    if (def.type === 'array' && Array.isArray(v) && v.some((x) => typeof x !== 'string')) errs.push(`${rel}: "${k}" must be a list of ids`);
  }
  if (typeof m.id === 'string' && m.id !== idOf(rel)) errs.push(`${rel}: id must be "${idOf(rel)}" (got "${m.id}")`);
  return errs;
}

// ---- KNOWLEDGE.md parsing (fixed headings so JARVIS can parse it)
export function parseKnowledge(text: string) {
  const lines = text.split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) ?? '').slice(2).trim();
  const sections: Record<string, string> = {};
  let cur: string | null = null;
  for (const line of lines) {
    const h = HEADINGS.find((x) => line.startsWith(`${x}:`));
    if (h) { cur = h; sections[h] = line.slice(h.length + 1).trim(); }
    else if (cur) sections[cur] += `\n${line}`;
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].trim();
  return { title, sections };
}
export const hasRealContent = (text = '') =>
  text.split('\n').map((l) => l.trim()).filter((l) => l && !/\(planned\)/i.test(l) && !/^(not written yet|to be written|tbd)/i.test(l) && l !== '-').length > 0;

export function knowledgeTemplate(o: { name: string; status: string; what: string; can: string[]; how: string; uses?: string; power: string; owner: string }) {
  return `# ${o.name}
STATUS: ${o.status}
WHAT IT IS: ${o.what}
WHAT IT CAN DO:
${o.can.map((c) => `- (planned) ${c}`).join('\n')}
WHAT IT CANNOT DO / LIMITS:
- Nothing is built yet. Everything above is planned.
HOW IT WORKS: ${o.how}
INPUTS / OUTPUTS: Not written yet.
USES / USED BY: ${o.uses ?? 'None recorded yet (must match manifest "uses" and "knows").'}
POWER LEVEL & CONFIRMATION: ${o.power}
EXAMPLES: Not written yet.
KNOWN ISSUES: None known (nothing built).
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: ${o.owner}.
`;
}

// ---- units, registry
export type Unit = { rel: string; manifest: any };
export function loadUnits(): { units: Unit[]; errors: string[] } {
  const units: Unit[] = [], errors: string[] = [];
  for (const rel of allDirs().filter(isUnit)) {
    const mp = `${rel}/manifest.json`;
    if (!exists(mp)) { errors.push(`${rel}: unit folder has no manifest.json`); continue; }
    try { const manifest = JSON.parse(read(mp)); units.push({ rel, manifest }); errors.push(...validateManifest(manifest, rel)); }
    catch { errors.push(`${mp}: not valid JSON`); }
  }
  return { units, errors };
}

export function buildRegistry(units: Unit[]): Record<string, string> {
  const sorted = [...units].sort((a, b) => a.rel.localeCompare(b.rel));
  const usedBy: Record<string, string[]> = {};
  for (const u of sorted) for (const t of [...u.manifest.uses, ...u.manifest.knows]) (usedBy[t] ??= []).push(u.manifest.id);
  const brief = (u: Unit) => ({ id: u.manifest.id, name: u.manifest.name, kind: u.manifest.kind, group: u.manifest.group, owner_squad: u.manifest.owner_squad, phase: u.manifest.phase, status: u.manifest.status, does: u.manifest.does, autonomy_default: u.manifest.autonomy_default, version: u.manifest.version, path: u.rel });
  const know = Object.fromEntries(sorted.map((u) => {
    const p = exists(`${u.rel}/KNOWLEDGE.md`) ? parseKnowledge(read(`${u.rel}/KNOWLEDGE.md`)).sections : {};
    return [u.manifest.id, { status: p['STATUS'] ?? null, what_it_is: p['WHAT IT IS'] ?? null, can_do: p['WHAT IT CAN DO'] ?? null, limits: p['WHAT IT CANNOT DO / LIMITS'] ?? null }];
  }));
  const j = (x: unknown) => JSON.stringify(x, null, 2) + '\n';
  return {
    'self/registry/units.json': j(sorted.map(brief)),
    'self/registry/features.json': j(sorted.filter((u) => u.manifest.kind === 'feature').map(brief)),
    'self/registry/library.json': j(sorted.filter((u) => u.rel.startsWith('library/')).map(brief)),
    'self/registry/status.json': j(Object.fromEntries(sorted.map((u) => [u.manifest.id, { status: u.manifest.status, evidence: u.manifest.evidence ?? null }]))),
    'self/registry/graph.json': j(Object.fromEntries(sorted.map((u) => [u.manifest.id, { uses: u.manifest.uses, knows: u.manifest.knows, used_by: [...new Set(usedBy[u.manifest.id] ?? [])].sort() }]))),
    'self/registry/knowledge-index.json': j(know),
  };
}
export const danglingLinks = (units: Unit[]) => {
  const ids = new Set(units.map((u) => u.manifest.id)); const errs: string[] = [];
  for (const u of units) for (const t of [...u.manifest.uses, ...u.manifest.knows]) if (!ids.has(t)) errs.push(`${u.rel}: links to unknown id "${t}"`);
  return errs;
};
