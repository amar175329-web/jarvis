export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export type Task = {
  id: string; title: string; due_at: string | null; status: TaskStatus;
  priority: 1 | 2 | 3; focus_today: boolean; repeat_rule?: string | null;
};
export type Reminder = {
  id: string; text: string; remind_at: string; repeat_rule: string | null; state: 'pending' | 'fired' | 'cancelled';
};
export type TodayProjection = {
  date: string; time_zone: string;
  focus: { open_count: number; overdue_count: number; top_tasks: Task[] };
  schedule: Array<{ id: string; kind: 'task' | 'reminder'; title: string; at: string; status: string; priority?: number }>;
};

export async function jarvisPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: any;
  try { payload = await response.json(); } catch { throw new Error('JARVIS se valid response nahi mila.'); }
  if (!response.ok || payload?.ok !== true) {
    const code = payload?.error?.code ?? 'request_failed';
    const message = payload?.error?.message ?? 'Request complete nahi hui.';
    const err = new Error(`${message} (${code})`) as Error & { code?: string; rawMessage?: string; status?: number; details?: Record<string, unknown> };
    err.code = code;
    err.rawMessage = message;
    err.status = response.status;
    err.details = payload?.error?.details;
    throw err;
  }
  return payload.data as T;
}

export const taskApi = {
  list: () => jarvisPost<{ tasks: Task[] }>('/api/tasks/tasks.list'),
  today: () => jarvisPost<TodayProjection>('/api/tasks/tasks.today'),
  naturalAdd: (text: string, confirmed = false) => jarvisPost<{ kind: 'task' | 'reminder'; item: Task | Reminder }>('/api/tasks/tasks.natural-add', { text, confirmed }),
  complete: (id: string, confirmed = false) => jarvisPost<{ task: Task; next_task?: Task | null }>('/api/tasks/tasks.complete', { id, confirmed }),
  update: (id: string, fields: Record<string, unknown>, confirmed = false) => jarvisPost<{ task: Task }>('/api/tasks/tasks.update', { id, ...fields, confirmed }),
  createTask: (data: Record<string, unknown>, confirmed = false) => jarvisPost<{ task: Task }>('/api/tasks/tasks.create', { ...data, confirmed }),
  cancel: (id: string, confirmed = false) => jarvisPost<{ task: Task }>('/api/tasks/tasks.cancel', { id, confirmed }),
};

export const reminderApi = {
  list: () => jarvisPost<{ reminders: Reminder[] }>('/api/reminders/reminders.list'),
  create: (data: Record<string, unknown>, confirmed = false) => jarvisPost<{ reminder: Reminder }>('/api/reminders/reminders.create', { ...data, confirmed }),
  cancel: (id: string, confirmed = false) => jarvisPost<{ cancelled: true }>('/api/reminders/reminders.cancel', { id, confirmed }),
  consumeMemory: (request: Record<string, unknown>) => jarvisPost<{ status: string }>('/api/reminders/reminders.consume-memory', { request }),
};
