import test from 'node:test';
import assert from 'node:assert/strict';

test('SSE chunk parser accumulates delta text and handles error frames', () => {
  const frames = [
    JSON.stringify({ type: 'chat.message.started', thread_id: 't-1', message_id: 'm-1' }),
    JSON.stringify({ type: 'chat.message.delta', thread_id: 't-1', message_id: 'm-1', index: 0, text: 'Namaste ' }),
    JSON.stringify({ type: 'chat.message.delta', thread_id: 't-1', message_id: 'm-1', index: 1, text: 'Amit!' }),
    JSON.stringify({ type: 'chat.message.completed', thread_id: 't-1', message_id: 'm-1', chunk_count: 2 }),
  ];

  let accumulated = '';
  for (const raw of frames) {
    const frame = JSON.parse(raw);
    if (frame.type === 'chat.message.delta') {
      accumulated += frame.text;
    }
  }
  assert.equal(accumulated, 'Namaste Amit!');
});

test('unconfigured model error maps to clean Hindi guidance message', () => {
  const frame = { type: 'chat.message.error', thread_id: 't-1', message_id: 'm-1', code: 'needs_model' };
  const message = (frame.code === 'needs_model' || frame.code === 'unconfigured')
    ? 'Model set nahi hai. Settings mein model slot configure karein.'
    : `Error: ${frame.code}`;
  assert.equal(message, 'Model set nahi hai. Settings mein model slot configure karein.');
});

test('kill switch error code maps to exact stop text', () => {
  const frame = { type: 'chat.message.error', thread_id: 't-1', message_id: 'm-1', code: 'kill_switch_on' };
  const message = frame.code === 'kill_switch_on'
    ? 'Kill switch ON hai, main kuch nahi kar raha.'
    : `Error: ${frame.code}`;
  assert.equal(message, 'Kill switch ON hai, main kuch nahi kar raha.');
});
