import test from 'node:test';
import assert from 'node:assert/strict';
import { canToggleKill, killButtonLabel, parseKillRead, parseKillWrite } from '../src/components/kill-switch-policy.ts';

test('anonymous and absent API routes hide the owner-only control', () => {
  assert.equal(parseKillRead(401, null), null);
  assert.equal(parseKillRead(403, null), null);
  assert.equal(parseKillRead(404, null), null);
});
test('verified switch state is shown with the server epoch', () => {
  const view = parseKillRead(200, { ok: true, data: { kill: false, epoch: 3 } });
  assert.deepEqual(view, { visible: true, kill: false, unavailable: false, saving: false, epoch: 3 });
  assert.equal(killButtonLabel(view), 'Turn kill switch ON');
  assert.equal(canToggleKill(view), true);
});
test('server outage, malformed response and invalid epoch fail closed as ON', () => {
  for (const view of [parseKillRead(503, {}), parseKillRead(200, { ok: true, data: { kill: false, epoch: -1 } }), parseKillRead(200, { ok: false })]) {
    assert.ok(view && view.visible && view.kill && view.unavailable && !canToggleKill(view));
    assert.equal(killButtonLabel(view), 'Safety unavailable — treated as ON');
  }
});
test('a verified ON state is not mistaken for an unavailable state', () => {
  const view = parseKillRead(200, { ok: true, data: { kill: true, epoch: 4 } });
  assert.ok(view && view.kill && !view.unavailable && canToggleKill(view));
  assert.equal(killButtonLabel(view), 'Turn kill switch OFF');
});
test('any failed or unverifiable write returns a disabled fail-closed view', () => {
  for (const view of [parseKillWrite(403, {}), parseKillWrite(503, {}), parseKillWrite(200, { ok: true, data: { kill: false, epoch: -1 } })]) {
    assert.ok(view.visible && view.kill && view.unavailable && !canToggleKill(view));
  }
});
test('only a valid server confirmation changes the displayed state after write', () => {
  assert.deepEqual(parseKillWrite(200, { ok: true, data: { kill: true, epoch: 5 } }), { visible: true, kill: true, unavailable: false, saving: false, epoch: 5 });
});
