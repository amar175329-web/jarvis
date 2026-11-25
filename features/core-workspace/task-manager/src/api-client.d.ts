export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export type Task = { id: string; title: string; notes?: string | null; due_at: string | null; ends_at?: string | null; status: TaskStatus; priority: 1 | 2 | 3; focus_today: boolean; repeat_rule?: string | null; time_zone?: string };
export type ReminderState = 'pending' | 'done' | 'fired' | 'cancelled';
export type Reminder = { id: string; text: string; remind_at: string; repeat_rule: string | null; time_zone?: string; state: ReminderState };
export type TodayProjection = { date: string; time_zone: string; focus: { open_count: number; overdue_count: number; top_tasks: Task[] }; schedule: Array<{ id: string; kind: 'task' | 'reminder'; title: string; at: string; status: string; priority?: number }> };
export type RequestOptions = { keepalive?: boolean };
export function jarvisPost<T>(path: string, body?: Record<string, unknown>, options?: RequestOptions): Promise<T>;
export const taskApi: {
  list(options?: RequestOptions): Promise<{ tasks: Task[] }>;
  today(options?: RequestOptions): Promise<TodayProjection>;
  naturalAdd(text: string, confirmed?: boolean, allowClash?: boolean, allowDuplicate?: boolean, options?: RequestOptions): Promise<{ kind: 'task' | 'reminder'; item: Task | Reminder }>;
  complete(id: string, confirmed?: boolean, options?: RequestOptions): Promise<{ task: Task; next_task?: Task | null }>;
  update(id: string, fields: Record<string, unknown>, confirmed?: boolean, allowClash?: boolean, options?: RequestOptions): Promise<{ task: Task }>;
  createTask(data: Record<string, unknown>, confirmed?: boolean, allowClash?: boolean, options?: RequestOptions): Promise<{ task: Task }>;
  cancel(id: string, confirmed?: boolean, options?: RequestOptions): Promise<{ task: Task }>;
  delete(id: string, confirmed?: boolean, options?: RequestOptions): Promise<{ deleted: true; id: string }>;
};
export const reminderApi: {
  list(options?: RequestOptions): Promise<{ reminders: Reminder[] }>;
  create(data: Record<string, unknown>, confirmed?: boolean, allowDuplicate?: boolean, options?: RequestOptions): Promise<{ reminder: Reminder }>;
  cancel(id: string, confirmed?: boolean, options?: RequestOptions): Promise<{ reminder: Reminder; cancelled?: true }>;
  update(id: string, fields: Record<string, unknown>, confirmed?: boolean, allowDuplicate?: boolean, options?: RequestOptions): Promise<{ reminder: Reminder }>;
  complete(id: string, confirmed?: boolean, options?: RequestOptions): Promise<{ reminder: Reminder }>;
  delete(id: string, confirmed?: boolean, options?: RequestOptions): Promise<{ deleted: true; id: string }>;
  consumeMemory(request: Record<string, unknown>, options?: RequestOptions): Promise<{ status: string }>;
};
