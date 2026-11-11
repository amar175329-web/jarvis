// Screenshot test: the new React app must look EXACTLY like _reference/JARVIS-ui-reference.html (no visible difference (colour differences of 1 out of 255 are ignored)).
// Needs: npm run build first, and Playwright with Chromium (global or local). Run: npm run test:visual
// Both pages are loaded with animations frozen and the boot screen skipped, so the picture is the same every time.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '../dist');
const refFile = path.join(here, '../_reference/JARVIS-ui-reference.html');
if (!fs.existsSync(dist)) { console.error('FAIL: run "npm run build" first'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/ref') { res.setHeader('content-type', 'text/html'); return res.end(fs.readFileSync(refFile)); }
  const f = path.join(dist, url === '/' ? 'index.html' : url);
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(0);
const port = server.address().port;

const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const sizes = { mobile390: { width: 390, height: 844 }, desktop1440: { width: 1440, height: 900 } };
const outDir = path.join(here, 'visual-out'); fs.mkdirSync(outDir, { recursive: true });

async function shot(browser, url, size, page) {
  const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // same fallback fonts in both pages, offline-safe
  await p.goto(`http://localhost:${port}${url}`, { waitUntil: 'load' });
  await p.addStyleTag({ content: FREEZE });
  if (page === 'more') { await p.locator('button.nav-item', { hasText: 'More Features' }).click(); await p.evaluate(() => window.scrollTo(0, 0)); }
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const buf = await p.screenshot({ fullPage: true });
  await ctx.close(); return PNG.sync.read(buf);
}

const browser = await chromium.launch();
let fail = 0;
// A screenshot can rarely catch the page half-painted, so each picture is retaken up to 3 times; a real difference fails every time.
async function compare(size, page) {
  let last;
  for (let t = 0; t < 3; t++) {
    const a = await shot(browser, '/ref', size, page), b = await shot(browser, '/', size, page);
    if (a.width !== b.width || a.height !== b.height) { last = { a, b, n: -1 }; continue; }
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.01 });
    last = { a, b, n, diff }; if (n === 0) break;
  }
  return last;
}
for (const [sn, size] of Object.entries(sizes)) for (const page of ['home', 'more']) {
  const name = `${page}-${sn}`;
  const { a, b, n, diff } = await compare(size, page);
  if (n === -1) { console.log(`FAIL ${name}: size ${a.width}x${a.height} vs ${b.width}x${b.height}`); fail++; continue; }
  if (n) { fs.writeFileSync(path.join(outDir, `${name}-diff.png`), PNG.sync.write(diff)); fs.writeFileSync(path.join(outDir, `${name}-ref.png`), PNG.sync.write(a)); fs.writeFileSync(path.join(outDir, `${name}-new.png`), PNG.sync.write(b)); }
  console.log(`${n === 0 ? 'PASS' : 'FAIL'} ${name} (${a.width}x${a.height}): ${n} different pixels`);
  if (n) fail++;
}
await browser.close(); server.close();
console.log(fail ? `\n${fail} FAILED` : '\nALL SAME: no visible difference');
process.exit(fail ? 1 : 0);
