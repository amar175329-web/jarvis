// Checks the things a person can click: page switch, search filter, chat send. Needs: npm run build, Playwright.
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = path.join(dist, u === '/' ? 'index.html' : u); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', types[path.extname(f)] ?? 'text/plain'); r.end(fs.readFileSync(f)); }).listen(0);
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await c.newPage();
await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
await p.goto(`http://localhost:${server.address().port}/`);
let fail = 0; const ok = (n, v) => { console.log((v ? 'PASS ' : 'FAIL ') + n); if (!v) fail++; };
ok('starts on Home', (await p.textContent('#page-title')) === 'Home' && await p.locator('#home-page.active').count() === 1);
await p.locator('button.nav-item', { hasText: 'More Features' }).click();
ok('More page opens, title and placeholder change', (await p.textContent('#page-title')) === 'More' && await p.getAttribute('#global-search', 'placeholder') === 'Search features...' && await p.locator('#more-page.active').count() === 1);
const total = await p.locator('#feature-grid .group:visible').count();
await p.fill('#global-search', 'zzzzqqq'); ok('search with no match hides all groups', await p.locator('#feature-grid .group:visible').count() === 0);
await p.fill('#global-search', ''); ok('clearing search shows groups again', await p.locator('#feature-grid .group:visible').count() === total && total > 0);
await p.locator('button.nav-item', { hasText: 'Home' }).first().click();
await p.fill('#chat-input', 'hello'); ok('send button turns ready', await p.locator('#send-btn.ready').count() === 1);
await p.press('#chat-input', 'Enter');
ok('my message shows and box clears', (await p.textContent('.msg.me')) === 'hello' && (await p.inputValue('#chat-input')) === '');
await p.waitForSelector('.msg.ai.done', { timeout: 5000 }); ok('AI reply types out fully', (await p.textContent('.msg.ai')).startsWith('Message received.'));
// Authenticated safety control (the normal reference/preview path has no session and remains pixel-identical).
let kill = false; const writes = [];
await p.route('**/api/system/kill.get', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { kill, epoch: 0 } }) }));
await p.route('**/api/system/kill.set', async (r) => {
  const body = r.request().postDataJSON(); writes.push(body); kill = body.kill;
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { kill, epoch: writes.length } }) });
});
await p.reload(); await p.waitForSelector('[data-testid="kill-switch"]');
ok('authenticated owner sees kill switch state', await p.locator('[data-testid="kill-switch"]').textContent() === 'Safety OFF');
await p.locator('[data-testid="kill-switch"]').click();
await p.waitForFunction(() => document.querySelector('[data-testid="kill-switch"]')?.textContent === 'Safety ON');
ok('owner app can turn kill ON', kill === true && writes.length === 1 && writes[0].kill === true);
await p.locator('[data-testid="kill-switch"]').click();
await p.waitForFunction(() => document.querySelector('[data-testid="kill-switch"]')?.textContent === 'Safety OFF');
ok('owner app can turn kill OFF', kill === false && writes.length === 2 && writes[1].kill === false);

await b.close(); server.close(); process.exit(fail ? 1 : 0);
