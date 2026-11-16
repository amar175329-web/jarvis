import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLocalHealth, writeLocalHealthSetting } from '../src/health.ts';

test('checkLocalHealth does not start model and returns required shape', () => {
  const health = checkLocalHealth();
  assert.equal(typeof health.ok, 'boolean');
  assert.equal(typeof health.checked_at, 'string');
  assert.equal(typeof health.running, 'boolean');
  assert.ok(!isNaN(new Date(health.checked_at).getTime()));
  assert.equal(typeof health.free_ram_mb, 'number');
  assert.equal(typeof health.binary, 'boolean');
  assert.equal(typeof health.model, 'boolean');
});

test('checkLocalHealth returns ok=false if RAM is below 800 MB', () => {
  const health = checkLocalHealth({ minRamMb: 999999 });
  assert.equal(health.ok, false);
});

test('checkLocalHealth returns ok=false if binary or model is missing', () => {
  const healthBadBin = checkLocalHealth({ binaryPath: '/nonexistent/llama-server' });
  assert.equal(healthBadBin.ok, false);
  assert.equal(healthBadBin.binary, false);

  const healthBadModel = checkLocalHealth({ modelPath: '/nonexistent/model.gguf' });
  assert.equal(healthBadModel.ok, false);
  assert.equal(healthBadModel.model, false);
});

test('writeLocalHealthSetting sends upsert to settings table with correct format', async () => {
  let capturedUrl = '';
  let capturedBody = '';
  let capturedHeaders: any = {};

  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if (u.includes('system_state')) {
      return new Response(JSON.stringify([{ owner_id: 'test-owner-uuid-123' }]), { status: 200 });
    }
    if (u.includes('settings')) {
      capturedUrl = u;
      capturedBody = String(init?.body);
      capturedHeaders = init?.headers;
      return new Response('[]', { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };

  const health = {
    ok: true,
    checked_at: new Date().toISOString(),
    running: false,
    free_ram_mb: 1800,
  };

  const ok = await writeLocalHealthSetting(health, {
    supabaseUrl: 'https://fake-project.supabase.co',
    serviceRoleKey: 'fake-service-key',
    fetch: fakeFetch as any,
  });

  assert.equal(ok, true);
  assert.ok(capturedUrl.includes('settings?on_conflict=owner_id,key'));
  const payload = JSON.parse(capturedBody);
  assert.equal(payload.owner_id, 'test-owner-uuid-123');
  assert.equal(payload.key, 'models.local_health');
  assert.equal(payload.value.ok, true);
  assert.equal(payload.value.running, false);
  assert.equal(typeof payload.value.checked_at, 'string');
});
