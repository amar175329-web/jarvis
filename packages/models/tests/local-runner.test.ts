import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RUN_SCRIPT_PATH, getLocalModelStatus, stopLocalModel } from '../src/local-runner.ts';

test('RUN_SCRIPT_PATH exists and is executable', () => {
  assert.ok(fs.existsSync(RUN_SCRIPT_PATH));
  const stats = fs.statSync(RUN_SCRIPT_PATH);
  // executable check: mode & 0o111 != 0
  assert.ok((stats.mode & 0o111) !== 0, 'run.sh must be executable');
});

test('getLocalModelStatus returns valid status object', () => {
  const status = getLocalModelStatus();
  assert.equal(typeof status.ok, 'boolean');
  assert.equal(typeof status.running, 'boolean');
  assert.ok(!isNaN(new Date(status.checked_at).getTime()));
});

test('stopLocalModel executes without throwing', () => {
  assert.doesNotThrow(() => {
    stopLocalModel();
  });
});
