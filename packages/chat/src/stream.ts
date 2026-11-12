import type { ChatStreamEvent } from './types.ts';

/** Splits code points (not UTF-16 halves) and preserves exact source order. */
export function splitReply(text: string, chunkSize = 48): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError('chunkSize must be a positive integer');
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += chunkSize) chunks.push(chars.slice(i, i + chunkSize).join(''));
  return chunks;
}

export async function emitReply(
  text: string,
  emit: (event: ChatStreamEvent) => void | Promise<void>,
  ids: { threadId?: string; messageId?: string } = {},
  chunkSize = 48,
): Promise<void> {
  await emit({ type: 'chat.message.started', ...ids });
  const chunks = splitReply(text, chunkSize);
  for (let index = 0; index < chunks.length; index++) {
    await emit({ type: 'chat.message.delta', ...ids, index, text: chunks[index]! });
  }
  await emit({ type: 'chat.message.completed', ...ids });
}
