import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../migrations/0004_jobs.sql', import.meta.url), 'utf8');
const names = ['claim_job', 'heartbeat_job', 'finish_job', 'purge_old_jobs'];
const grants = sql.slice(sql.indexOf('-- Only the server (service_role) may run these.'));

test('migration 0004 defines exactly the four protected job functions', () => {
  for (const name of names) assert.match(sql, new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i'), `${name} definition missing`);
});
for (const name of names) {
  test(`migration 0004 revokes PUBLIC/anon/authenticated EXECUTE from ${name}`, () => {
    assert.match(grants, new RegExp(`revoke all on function[\\s\\S]*?public\\.${name}\\s*\\([^)]*\\)[\\s\\S]*?from public, anon, authenticated`, 'i'));
  });
  test(`migration 0004 grants EXECUTE on ${name} only to service_role`, () => {
    assert.match(grants, new RegExp(`grant execute on function[\\s\\S]*?public\\.${name}\\s*\\([^)]*\\)[\\s\\S]*?to service_role`, 'i'));
    assert.doesNotMatch(grants, new RegExp(`grant execute on function[^;]*public\\.${name}[^;]*to (?:public|anon|authenticated)`, 'i'));
  });
}
