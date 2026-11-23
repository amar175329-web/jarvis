import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const API_ROOT = path.join(REPO_ROOT, 'api');

function walkApiTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'node_modules') continue;
      out.push(...walkApiTs(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

function isVercelIgnoredChatShim(relPath: string): boolean {
  return /^api\/chat\/(threads|messages)\..+\.ts$/.test(relPath);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function createFakeNodeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let ended = false;
  let body: unknown = null;
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(v: number) { statusCode = v; },
    status(code: number) { statusCode = code; return res; },
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = String(v); },
    send(payload: unknown) { ended = true; body = payload; return res; },
    end(payload?: unknown) { ended = true; if (payload !== undefined) body = payload; return res; },
    write(chunk: unknown) { body = (body ? String(body) : '') + String(chunk); return true; },
    get headersSent() { return ended; },
    get _ended() { return ended; },
    get _status() { return statusCode; },
    get _headers() { return headers; },
    get _body() { return body; },
  };
  return res;
}

test('vercelignore excludes api/chat/{threads,messages}.*.ts shims (served via /api/chat rewrite)', () => {
  const ignoreText = fs.readFileSync(path.join(REPO_ROOT, '.vercelignore'), 'utf8');
  assert.match(ignoreText, /api\/chat\/threads\.\*\.ts/);
  assert.match(ignoreText, /api\/chat\/messages\.\*\.ts/);
});

test('every deployed api/**/*.ts default export responds within 2s for both Node (req,res) and Web Request', async () => {
  const files = walkApiTs(API_ROOT);
  const checked: string[] = [];

  for (const absPath of files) {
    const relPath = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    if (isVercelIgnoredChatShim(relPath)) continue;

    const mod = await import(pathToFileURL(absPath).href);
    if (typeof mod.default !== 'function') continue; // library index.ts without default export (e.g. api/auth/index.ts, api/system/index.ts)

    const method = typeof mod.GET === 'function' ? 'GET' : 'POST';
    const urlPath = '/' + relPath.replace(/\.ts$/, '').replace(/\/index$/, '');

    // 1. Fake Node (req, res) invocation — must call res.send or res.end within 2s
    const fakeReq: any = {
      method,
      url: urlPath,
      headers: { host: 'localhost', 'x-forwarded-proto': 'https', 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: {} } : {}),
    };
    const fakeRes = createFakeNodeRes();
    await withTimeout(Promise.resolve(mod.default(fakeReq, fakeRes)), 2000, `Node (req,res) ${relPath}`);
    assert.equal(fakeRes._ended, true, `${relPath} default export did not call res.send/res.end in Node (req,res) mode`);
    assert.ok(fakeRes._status >= 200 && fakeRes._status < 600, `${relPath} invalid HTTP status ${fakeRes._status}`);

    // 2. Web Request invocation (no res) — must return a Web Response within 2s
    const webReq = new Request(`https://example.test${urlPath}`, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const webRes = await withTimeout(Promise.resolve(mod.default(webReq)), 2000, `Web Request ${relPath}`);
    assert.ok(webRes instanceof Response, `${relPath} default export did not return Response for Web Request`);

    checked.push(relPath);
  }

  assert.ok(checked.includes('api/system/kill.get.ts'), 'api/system/kill.get.ts must be checked');
  assert.ok(checked.includes('api/system/kill.set.ts'), 'api/system/kill.set.ts must be checked');
  assert.ok(checked.includes('api/system/events.emit.ts'), 'api/system/events.emit.ts must be checked');
  assert.ok(checked.includes('api/system/events.list.ts'), 'api/system/events.list.ts must be checked');
  assert.ok(checked.includes('api/auth/session.get.ts'), 'api/auth/session.get.ts must be checked');
  assert.ok(checked.includes('api/tasks/index.ts'), 'api/tasks/index.ts must be checked');
  assert.ok(checked.includes('api/chat/index.ts'), 'api/chat/index.ts must be checked');
});
