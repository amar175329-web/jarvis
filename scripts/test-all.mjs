// npm run test:all -> runs every package's tests and prints one summary. Needs `npm install` in packages that have dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dirs = [];
for (const top of ['packages', 'worker', 'api', 'app']) {
  if (top === 'app') { dirs.push('app'); continue; }
  for (const n of fs.readdirSync(top)) { const d = path.join(top, n); if (fs.existsSync(path.join(d, 'package.json'))) dirs.push(d); }
}
const only = process.argv.slice(2);
const rows = []; let bad = 0;
for (const d of dirs.sort()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
  const script = 'test';
  if (!pkg.scripts?.[script] || (only.length && !only.some((o) => d.includes(o)))) continue;
  const r = spawnSync('npm', ['run', script, '--silent'], { cwd: d, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = /# pass (\d+)/.exec(out) ?? /(\d+) passed/.exec(out); const f = /# fail (\d+)/.exec(out) ?? /(\d+) failed/.exec(out);
  const pass = m ? +m[1] : (out.match(/^PASS /gm) || []).length; const fail = (f ? +f[1] : 0) + (out.match(/^FAIL /gm) || []).length;
  const ok = r.status === 0 && fail === 0; if (!ok) bad++;
  console.log(`\n===== ${d} · ${ok ? 'PASS' : 'FAIL'} =====\n${out.trim() || '(no test output)'}\n`);
  rows.push([d, ok ? 'PASS' : 'FAIL', `${pass} passed, ${fail} failed`]);
}
console.log('\n' + rows.map(([d, s, t]) => `${s.padEnd(5)} ${d.padEnd(24)} ${t}`).join('\n'));
const total = rows.reduce((n, r) => n + (+(/(\d+) passed/.exec(r[2])?.[1] ?? 0)), 0);
console.log(`\n${bad ? bad + ' PACKAGE(S) FAILED' : 'ALL PASSED'}: ${total} tests in ${rows.length} packages`);
process.exit(bad ? 1 : 0);
