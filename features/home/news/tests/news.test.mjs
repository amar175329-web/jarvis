import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicNewsItems, sanitizePublicSummary } from '../src/normalize.mjs';
import { ACTIONS, handle, NEWS_READ_POWER, NEWS_SUMMARIZE_POWER } from '../src/handler.mjs';
const OWNER = '11111111-1111-4111-8111-111111111111';
const HOSTS = ['news.example.org'];
const RAW = [
  { title: ' <b>Public</b> headline &amp; update ', summary: '<script>steal()</script><p>Public summary</p>', link: 'https://news.example.org/story/1?utm_source=home#top', source: 'Example News', publishedAt: '2026-11-23T07:00:00Z', privateNote: 'Amit private task' },
  { title: 'Unsafe host', link: 'https://evil.example.com/story/2' },
  { title: 'HTTP not accepted', link: 'http://news.example.org/story/3' },
];
const req = (action, body = {}) => new Request(`https://jarvis.test/api/tasks/${action}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('news exposes only list and summarize actions', () => assert.deepEqual(ACTIONS, ['news.list', 'news.summarize']));

test('public news normalization allowlists HTTPS sources and strips markup/tracking', () => {
  const items = normalizePublicNewsItems(RAW, { allowedHosts: HOSTS });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Public headline & update');
  assert.equal(items[0].summary, 'Public summary');
  assert.equal(items[0].url, 'https://news.example.org/story/1');
  assert.equal(JSON.stringify(items).includes('privateNote'), false);
  assert.equal(JSON.stringify(items).includes('Amit private'), false);
});

test('public summary text is bounded plain text', () => {
  assert.equal(sanitizePublicSummary('<b>Headline</b> &amp; context'), 'Headline & context');
  assert.equal(sanitizePublicSummary('x'.repeat(1000)).length, 800);
});

test('news.list reads public feed without passing owner data and uses registered power', async () => {
  let feedArgs = 'not-called', power;
  const response = await handle('news.list', req('news.list'), {
    ownerId: OWNER, publicNewsHosts: HOSTS,
    readPublicNews: async (...args) => { feedArgs = args; return RAW; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(feedArgs, []);
  assert.equal(power.powerId, NEWS_READ_POWER);
  const body = await response.json();
  assert.equal(body.data.items.length, 1);
  assert.equal(JSON.stringify(body).includes('Amit private'), false);
});

test('summarizer receives only public news DTOs, never owner/session/private context', async () => {
  let summaryInput, power;
  const response = await handle('news.summarize', req('news.summarize', { confirmed: true }), {
    ownerId: OWNER, publicNewsHosts: HOSTS,
    readPublicNews: async () => RAW,
    summarizePublicNews: async (input) => { summaryInput = input; return 'Public briefing'; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
  });
  assert.equal(response.status, 200);
  assert.equal(power.powerId, NEWS_SUMMARIZE_POWER);
  assert.equal(power.confirmed, true);
  assert.deepEqual(Object.keys(summaryInput), ['items']);
  assert.deepEqual(Object.keys(summaryInput.items[0]).sort(), ['published_at', 'source', 'summary', 'title', 'url']);
  assert.equal(JSON.stringify(summaryInput).includes(OWNER), false);
  assert.equal(JSON.stringify(summaryInput).includes('Amit private'), false);
  assert.deepEqual(await response.json(), { ok: true, data: { summary: 'Public briefing', item_count: 1 } });
});

test('summary is abhi band without routed model adapter; missing gate fails closed', async () => {
  const noConfirm = await handle('news.summarize', req('news.summarize'), { ownerId: OWNER, publicNewsHosts: HOSTS, readPublicNews: async () => RAW, summarizePublicNews: async () => 'Never called', runPower: async () => ({ ok: true, result: {} }) });
  assert.equal(noConfirm.status, 409);
  const disabled = await handle('news.summarize', req('news.summarize', { confirmed: true }), { ownerId: OWNER, publicNewsHosts: HOSTS, readPublicNews: async () => RAW, runPower: async () => ({ ok: true, result: {} }) });
  assert.equal(disabled.status, 503);
  const denied = await handle('news.list', req('news.list'), { ownerId: OWNER, publicNewsHosts: HOSTS, readPublicNews: async () => RAW, runPower: async () => ({ ok: false, status: 403, code: 'forbidden' }) });
  assert.equal(denied.status, 403);
});
