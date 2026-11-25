export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export type Task = {
  id: string; title: string; notes?: string | null; due_at: string | null; ends_at?: string | null;
  status: TaskStatus; priority: 1 | 2 | 3; focus_today: boolean; repeat_rule?: string | null;
  time_zone?: string;
};
export type ReminderState = 'pending' | 'done' | 'fired' | 'cancelled';
export type Reminder = {
  id: string; text: string; remind_at: string; repeat_rule: string | null;
  time_zone?: string; state: ReminderState;
};
export type TodayProjection = {
  date: string; time_zone: string;
  focus: { open_count: number; overdue_count: number; top_tasks: Task[] };
  schedule: Array<{ id: string; kind: 'task' | 'reminder'; title: string; at: string; status: string; priority?: number }>;
};
export type RequestOptions = { keepalive?: boolean };
export type JarvisError = Error & {
  code?: string; rawMessage?: string; status?: number; details?: Record<string, any>;
};

export async function jarvisPost<T>(path: string, body: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', keepalive: options.keepalive === true,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const error = new Error('Network dikkat, dobara try karo', { cause }) as JarvisError;
    error.code = 'network_error';
    error.rawMessage = 'Network dikkat, dobara try karo';
    throw error;
  }
  let payload: any;
  try { payload = await response.json(); }
  catch { throw new Error('JARVIS se valid response nahi mila.') as JarvisError; }
  if (!response.ok || payload?.ok !== true) {
    const code = payload?.error?.code ?? 'request_failed';
    const message = payload?.error?.message ?? 'Request complete nahi hui.';
    const err = new Error(message) as JarvisError;
    err.code = code;
    err.rawMessage = message;
    err.status = response.status;
    err.details = payload?.error?.details;
    throw err;
  }
  return payload.data as T;
}

export const taskApi = {
  list: (options?: RequestOptions) => jarvisPost<{ tasks: Task[] }>('/api/tasks/tasks.list', {}, options),
  today: (options?: RequestOptions) => jarvisPost<TodayProjection>('/api/tasks/tasks.today', {}, options),
  naturalAdd: (text: string, confirmed = false, allowClash = false, allowDuplicate = false, options?: RequestOptions) =>
    jarvisPost<{ kind: 'task' | 'reminder'; item: Task | Reminder }>('/api/tasks/tasks.natural-add', { text, confirmed, allow_clash: allowClash, allow_duplicate: allowDuplicate }, options),
  complete: (id: string, confirmed = false, options?: RequestOptions) =>
    jarvisPost<{ task: Task; next_task?: Task | null }>('/api/tasks/tasks.complete', { id, confirmed }, options),
  update: (id: string, fields: Record<string, unknown>, confirmed = false, allowClash = false, options?: RequestOptions) =>
    jarvisPost<{ task: Task }>('/api/tasks/tasks.update', { id, ...fields, confirmed, allow_clash: allowClash }, options),
  createTask: (data: Record<string, unknown>, confirmed = false, allowClash = false, options?: RequestOptions) =>
    jarvisPost<{ task: Task }>('/api/tasks/tasks.create', { ...data, confirmed, allow_clash: allowClash }, options),
  cancel: (id: string, confirmed = false, options?: RequestOptions) =>
    jarvisPost<{ task: Task }>('/api/tasks/tasks.cancel', { id, confirmed }, options),
  delete: (id: string, confirmed = false, options?: RequestOptions) =>
    jarvisPost<{ deleted: true; id: string }>('/api/tasks/tasks.delete', { id, confirmed }, options),
};

export const reminderApi = {
  list: (options?: RequestOptions) => jarvisPost<{ reminders: Reminder[] }>('/api/reminders/reminders.list', {}, options),
  create: (data: Record<string, unknown>, confirmed = false, allowDuplicate = false, options?: RequestOptions) =>
    jarvisPost<{ reminder: Reminder }>('/api/reminders/reminders.create', { ...data, confirmed, allow_duplicate: allowDuplicate }, options),
  cancel: (id: string, confirmed = false, options?: RequestOptions) =>
    jarvisPost<{ reminder: Reminder; cancelled?: true }>('/api/reminders/reminders.cancel', { id, confirmed }, options),
  update: (id: string, fields: Record<string, unknown>, confirmed = false, allowDuplicate = false, options?: RequestOptions) =>
    jarvisPost<{ reminder: Reminder }>('/api/reminders/reminders.update', { id, ...fields, confirmed, allow_duplicate: allowDuplicate }, options),
  complete: (id: string, confirmed = false, options?: RequestOptions) =>
    jarvisPost<{ reminder: Reminder }>('/api/reminders/reminders.complete', { id, confirmed }, options),
  delete: (id: string, confirmed = false, options?: RequestOptions) =>
    jarvisPost<{ deleted: true; id: string }>('/api/reminders/reminders.delete', { id, confirmed }, options),
  consumeMemory: (request: Record<string, unknown>, options?: RequestOptions) =>
    jarvisPost<{ status: string }>('/api/reminders/reminders.consume-memory', { request }, options),
};
