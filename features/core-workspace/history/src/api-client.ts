export type HistoryThread = {
  id: string; title: string; private: boolean; created_at: string; updated_at: string;
};
export type HistoryMessage = {
  id: string; thread_id: string; role: 'user' | 'assistant'; content: string;
  private: boolean; sequence: number; created_at: string;
};
type Envelope<T> = { ok: true; data: T } | { ok: false; error?: { message?: string; code?: string } };

export class HistoryRequestError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'HistoryRequestError'; }
}

async function post<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/tasks/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as Envelope<T> | null;
  if (!response.ok || !result || result.ok !== true) {
    throw new HistoryRequestError(
      result && result.ok === false ? result.error?.message ?? 'History request failed.' : 'History request failed.',
      result && result.ok === false ? result.error?.code ?? 'unavailable' : 'unavailable',
    );
  }
  return result.data;
}

export const historyApi = {
  threads: (input: { before?: string; limit?: number; confirmed?: boolean } = {}) =>
    post<{ threads: HistoryThread[]; next_before?: string }>('history.threads.list', input),
  messages: (threadId: string, input: { before_sequence?: number; limit?: number; confirmed?: boolean } = {}) =>
    post<{ messages: HistoryMessage[]; next_before_sequence?: number }>('history.messages.list', { thread_id: threadId, ...input }),
};
