import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../../../packages/db/migrations/0070_s09_workspace_private.sql', import.meta.url);

test('0070 is proposal-only and declares the T1/T2 columns with forced owner RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /^-- PROPOSAL ONLY/m);
  for (const table of ['projects', 'notes', 'files']) {
    assert.match(sql, new RegExp(`alter table public\\.${table}\\s+`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.%I enable row level security`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.%I force row level security`, 'i'));
  }
  assert.match(sql, /revoke all on public\.%I from anon, public/i);
  assert.match(sql, /status = 'quarantined'/i);
  assert.match(sql, /comment on column public\.files\.private/i);
});
