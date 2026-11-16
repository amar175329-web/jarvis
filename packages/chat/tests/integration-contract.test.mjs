import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('S07 API routes are owner-authenticated and expose list/create/send/stream schemas', () => {
  const source = read('../../contracts/src/routes.ts');
  const names = [
    'chat.threads.list', 'chat.threads.create', 'chat.messages.list',
    'chat.messages.send', 'chat.messages.stream',
  ];
  for (const name of names) {
    const start = source.indexOf(`'${name}': route({`);
    assert.notEqual(start, -1, `${name} route exists`);
    const end = source.indexOf('\n  }),', start);
    assert.notEqual(end, -1, `${name} route closes`);
    const block = source.slice(start, end);
    assert.match(block, /auth:\s*'owner'/, `${name} requires owner auth`);
    assert.match(block, /input:\s*z\.object\([\s\S]*?\)\.strict\(\)/, `${name} has strict zod input`);
    assert.match(block, /output:/, `${name} has zod output`);
  }
  assert.match(source, /type:\s*z\.literal\('chat\.message\.delta'\)[\s\S]*?text:\s*z\.string\(\)/, 'delta text is confined to authenticated stream-frame schema');
});

test('chat event registry contains metadata-only chat names, not message or file contents', () => {
  const source = read('../../events/src/registry.ts');
  const start = source.indexOf('// S07 CHAT events');
  const end = source.indexOf('// S09 MEMORY events', start);
  assert.ok(start >= 0 && end > start, 'chat registry block exists');
  const block = source.slice(start, end);
  for (const name of [
    'chat.thread.created', 'chat.message.created', 'chat.message.started',
    'chat.message.delta', 'chat.message.completed', 'chat.message.error',
    'chat.attachment.referenced',
  ]) assert.ok(block.includes(`'${name}'`), `${name} registered`);
  assert.doesNotMatch(block, /\b(?:text|content|storage_ref|file_ref|transcript)\s*:/i, 'stored chat events contain no content or file references');
  assert.match(block, /index:\s*z\.number\(\)\.int\(\)\.min\(0\)/, 'delta event stores only sequence metadata');
});
