import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { reminderApi, taskApi, type Reminder, type Task } from '../src/api-client';
import { parseNaturalLanguage } from '../src/natural-language.mjs';
import { classifySensitivity } from '../src/sensitivity.mjs';
import {
  OPEN_REMINDER_STATES, OPEN_TASK_STATES,
  countOpenTasks, splitByState, replaceById, removeById, runOptimisticMutation,
  createDeferredActionQueue, createAutoDismissTimer, friendlyActionError,
} from '../src/optimistic-actions.mjs';
import './task-manager.css';

type Tab = 'tasks' | 'reminders';
type TaskFields = { title: string; due_at: string | null; ends_at: string | null; priority: number; repeat_rule: string | null; time_zone: string };
type ReminderFields = { text: string; remind_at: string; repeat_rule: string | null; time_zone: string };
type PendingConfirm =
  | { kind: 'natural'; text: string; promptText: string }
  | { kind: 'task'; payload: TaskFields; promptText: string }
  | { kind: 'reminder'; payload: ReminderFields; promptText: string };
type PromptTarget = { kind: 'task' | 'reminder'; id: string };
type ClashPrompt = { message: string; retry: () => Promise<void> };
type UndoKey = string;

const TIME_ZONE = 'Asia/Kolkata';
const REPEAT_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdays' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
];

function istDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${match[1]}T${match[2]}:00+05:30`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function isoToIstDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = Object.fromEntries(parts.filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}
function displayDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: TIME_ZONE }) : 'No due date';
}
function displayTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }) : '';
}
function cleanNeedsConfirmationQuestion(reason?: unknown, fallback?: string): string {
  if (reason === 'midnight_date') return 'raat 12 baje aaj ya kal ki?';
  if (reason === 'night_after_midnight') return 'Sawal: Raat ke baad (AM) ka time hai — aaj ya kal ki date confirm karo.';
  if (reason === 'title_missing') return 'Sawal: Kya yaad dilana hai? Task ya reminder ka naam likho.';
  if (reason === 'am_pm_ambiguous' || reason === 'time_ambiguous') return 'Sawal: Yeh subah (AM) hai ya shaam (PM)? Exact time confirm karo (jaise "subah 7 baje" ya "shaam 7 baje").';
  return fallback ? `Sawal: ${fallback}` : 'Sawal: Time ambiguous hai. Subah (AM) ya shaam (PM) confirm karo.';
}
function itemKey(kind: 'task' | 'reminder', id: string): UndoKey { return `${kind}:${id}`; }
function sortByTime<T extends { id: string; due_at?: string | null; remind_at?: string | null; created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.due_at ?? a.remind_at ?? '9999').localeCompare(String(b.due_at ?? b.remind_at ?? '9999')));
}
function conflictMessage(error: any, duplicate = false): string {
  if (duplicate) return 'Yahi text isi minute par reminder pehle se hai. Phir bhi banana hai?';
  const conflicts = Array.isArray(error?.details?.clashes) ? error.details.clashes : error?.details?.clash ? [error.details.clash] : [];
  const first = conflicts[0];
  if (!first) return 'Is samay par ek task pehle se scheduled hai. Dusra samay chunein?';
  const start = displayTime(first.due_at);
  const end = displayTime(first.ends_at);
  const time = end ? `${start} se ${end}` : start;
  return `${time} '${String(first.title ?? 'Task')}' pehle se hai. Dusra samay chunein?`;
}

export function TaskManagerPage() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [natural, setNatural] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newEndsAt, setNewEndsAt] = useState('');
  const [newPriority, setNewPriority] = useState('2');
  const [newRepeat, setNewRepeat] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retryVisible, setRetryVisible] = useState(false);
  const [retryAction, setRetryAction] = useState<(() => Promise<void> | void) | null>(null);
  const [clarifyQuestion, setClarifyQuestion] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [pendingClash, setPendingClash] = useState<ClashPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelPrompt, setCancelPrompt] = useState<PromptTarget | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<PromptTarget | null>(null);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editPriority, setEditPriority] = useState('2');
  const [editRepeat, setEditRepeat] = useState('');
  const [editingReminderId, setEditingReminderId] = useState('');
  const [editReminderText, setEditReminderText] = useState('');
  const [editReminderAt, setEditReminderAt] = useState('');
  const [editReminderRepeat, setEditReminderRepeat] = useState('');
  const [undoKeys, setUndoKeys] = useState<Record<string, true>>({});
  const [removingKeys, setRemovingKeys] = useState<Record<string, true>>({});
  const queueRef = useRef(createDeferredActionQueue({ delayMs: 5000 }));
  const cancelPromptTimer = useRef(createAutoDismissTimer({ delayMs: 5000 }));
  const deleteFadeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const transitionSnapshots = useRef(new Map<string, Task | Reminder>());

  const clearNotices = () => { setMessage(''); setError(''); setRetryVisible(false); setRetryAction(null); setClarifyQuestion(''); setPendingClash(null); };
  const beginAction = () => { clearNotices(); };
  const showError = (cause: unknown, retry?: () => Promise<void> | void) => {
    const friendly = friendlyActionError(cause);
    setMessage('');
    setError(friendly);
    setRetryVisible(true);
    setRetryAction(() => retry ?? (() => refresh(false)));
  };
  const refresh = useCallback(async (quiet = false) => {
    try {
      const [taskData, reminderData] = await Promise.all([taskApi.list(), reminderApi.list()]);
      setTasks(taskData.tasks);
      setReminders(reminderData.reminders);
      if (!quiet) { setError(''); setRetryVisible(false); setRetryAction(null); }
    } catch (cause) {
      // Focus/visibility/30-second reconciliation is intentionally silent;
      // only an explicit page load or user Retry surfaces a list-fetch error.
      if (!quiet) showError(cause);
    }
  }, []);
  const retryFailedAction = async () => {
    const retry = retryAction ?? (() => refresh(false));
    beginAction(); setBusy(true);
    try { await retry(); }
    catch (cause) { showError(cause, retry); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    void refresh(false);
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const onPageHide = () => { void queueRef.current.flushAll(); };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 30_000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelPromptTimer.current.clear();
      for (const timer of deleteFadeTimers.current.values()) clearTimeout(timer);
      deleteFadeTimers.current.clear();
      void queueRef.current.flushAll();
    };
  }, [refresh]);

  const showConflictIfNeeded = (cause: any, retry: () => Promise<void>): boolean => {
    if (cause?.code === 'time_clash') {
      setError(''); setMessage(''); setRetryVisible(false);
      setPendingClash({ message: conflictMessage(cause), retry });
      return true;
    }
    if (cause?.code === 'duplicate_reminder') {
      setError(''); setMessage(''); setRetryVisible(false);
      setPendingClash({ message: conflictMessage(cause, true), retry });
      return true;
    }
    return false;
  };

  const addNatural = (event: FormEvent) => {
    event.preventDefault(); beginAction(); setPendingConfirm(null);
    const raw = natural.trim();
    if (!raw) return;
    if (classifySensitivity(raw).sensitive) { setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.'); return; }
    const parsed = parseNaturalLanguage(raw, { timeZone: TIME_ZONE }) as any;
    if (!parsed?.ok) { setError(parsed?.message || 'Date/time clear nahi hua; details dobara likho.'); return; }
    if (parsed.status !== 'ready') { setClarifyQuestion(cleanNeedsConfirmationQuestion(parsed.reason, parsed.message)); return; }
    if (parsed.sensitive) { setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.'); return; }
    const label = parsed.kind === 'reminder' ? 'reminder' : 'task';
    const endText = parsed.ends_at ? ` se ${displayTime(parsed.ends_at)}` : '';
    setPendingConfirm({ kind: 'natural', text: raw, promptText: `Main ye ${label} banaun? ${parsed.title}, ${displayDate(parsed.due_at)}${endText}` });
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault(); beginAction(); setPendingConfirm(null);
    const dueAt = istDateTimeToIso(newDue);
    const endsAt = istDateTimeToIso(newEndsAt);
    if (newDue && !dueAt) { setError('Due date/time valid nahi hai.'); return; }
    if (newEndsAt && !endsAt) { setError('Ends at ka time valid nahi hai.'); return; }
    if (endsAt && (!dueAt || new Date(endsAt).getTime() <= new Date(dueAt).getTime())) { setError('Ends at, Due date/time ke baad hona chahiye.'); return; }
    const title = newTitle.trim();
    if (!title) return;
    if (classifySensitivity(title).sensitive) { setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.'); return; }
    const payload = { title, due_at: dueAt, ends_at: endsAt, priority: Number(newPriority), repeat_rule: newRepeat || null, time_zone: TIME_ZONE };
    setPendingConfirm({ kind: 'task', payload, promptText: `Main ye task banaun? ${title}, ${displayDate(dueAt)}${endsAt ? ` se ${displayTime(endsAt)}` : ''}` });
  };

  const addReminder = (event: FormEvent) => {
    event.preventDefault(); beginAction(); setPendingConfirm(null);
    const dueAt = istDateTimeToIso(remindAt);
    if (!dueAt) { setError('Reminder date/time valid nahi hai.'); return; }
    const text = reminderText.trim();
    if (!text) return;
    if (classifySensitivity(text).sensitive) { setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.'); return; }
    const payload = { text, remind_at: dueAt, repeat_rule: repeat || null, time_zone: TIME_ZONE };
    setPendingConfirm({ kind: 'reminder', payload, promptText: `Main ye reminder banaun? ${text}, ${displayDate(dueAt)}` });
  };

  const saveCreatedItem = (kind: 'task' | 'reminder', item: Task | Reminder) => {
    if (!item?.id) { const error = new Error('Kaam ho gaya, list abhi nahi aayi') as Error & { code: string }; error.code = 'list_refresh_failed'; throw error; }
    if (kind === 'task') setTasks((current) => replaceById(current, item.id, item as Task));
    else setReminders((current) => replaceById(current, item.id, item as Reminder));
  };

  const executeCreate = async (current: PendingConfirm, allowClash = false, allowDuplicate = false) => {
    if (current.kind === 'natural') {
      const result = await taskApi.naturalAdd(current.text, true, allowClash, allowDuplicate);
      saveCreatedItem(result.kind, result.item);
      setNatural('');
      setPendingConfirm(null);
      setMessage(result.kind === 'reminder' ? 'Reminder save ho gaya.' : 'Task add ho gaya.');
      return;
    }
    if (current.kind === 'task') {
      const result = await taskApi.createTask(current.payload, true, allowClash);
      saveCreatedItem('task', result.task);
      setNewTitle(''); setNewDue(''); setNewEndsAt(''); setNewPriority('2'); setNewRepeat(''); setPendingConfirm(null);
      setMessage('Task add ho gaya.');
      return;
    }
    const result = await reminderApi.create(current.payload, true, allowDuplicate);
    saveCreatedItem('reminder', result.reminder);
    setReminderText(''); setRemindAt(''); setRepeat(''); setPendingConfirm(null);
    setMessage('Reminder save ho gaya.');
  };

  const confirmPendingYes = async () => {
    if (!pendingConfirm) return;
    const current = pendingConfirm;
    beginAction(); setBusy(true);
    try {
      await executeCreate(current);
    } catch (cause: any) {
      if (showConflictIfNeeded(cause, () => executeCreate(current, cause?.code === 'time_clash', cause?.code === 'duplicate_reminder'))) return;
      if (cause?.code === 'confirmation_required' || cause?.details?.status === 'needs_confirmation') {
        setPendingConfirm(null);
        setClarifyQuestion(cleanNeedsConfirmationQuestion(cause?.details?.reason, cause?.rawMessage));
      } else {
        setPendingConfirm(null); showError(cause, () => executeCreate(current));
      }
    } finally { setBusy(false); }
  };
  const confirmPendingNo = () => { beginAction(); setPendingConfirm(null); setMessage('Action cancel kar diya.'); };

  const runClashOverride = async () => {
    if (!pendingClash) return;
    const current = pendingClash;
    setPendingClash(null); setBusy(true); beginAction();
    try { await current.retry(); }
    catch (cause: any) {
      if (!showConflictIfNeeded(cause, current.retry)) showError(cause);
    } finally { setBusy(false); }
  };

  const startCancelPrompt = (kind: 'task' | 'reminder', id: string) => {
    beginAction();
    setCancelPrompt({ kind, id });
    cancelPromptTimer.current.schedule(() => setCancelPrompt(null));
  };
  const dismissCancelPrompt = () => {
    cancelPromptTimer.current.clear(); setCancelPrompt(null);
  };
  const startDeletePrompt = (kind: 'task' | 'reminder', id: string) => { beginAction(); setDeletePrompt({ kind, id }); };

  const deferTaskTransition = (task: Task, nextStatus: 'done' | 'cancelled') => {
    beginAction();
    const key = itemKey('task', task.id);
    transitionSnapshots.current.set(key, task);
    const optimistic = { ...task, status: nextStatus } as Task;
    setTasks((current) => replaceById(current, task.id, optimistic));
    setUndoKeys((current) => ({ ...current, [key]: true }));
    queueRef.current.schedule(key, async (keepalive) => {
      setUndoKeys((current) => { const next = { ...current }; delete next[key]; return next; });
      try {
        if (nextStatus === 'done') {
          const result = await taskApi.complete(task.id, true, { keepalive });
          if (result.task) setTasks((current) => replaceById(current, task.id, result.task));
          if (result.next_task) setTasks((current) => replaceById(current, result.next_task!.id, result.next_task!));
        } else {
          const result = await taskApi.cancel(task.id, true, { keepalive });
          if (result.task) setTasks((current) => replaceById(current, task.id, result.task));
        }
        transitionSnapshots.current.delete(key);
        if (!keepalive) setMessage(nextStatus === 'done' ? 'Task complete ho gaya.' : 'Task cancel ho gaya.');
      } catch (cause) {
        transitionSnapshots.current.delete(key);
        setTasks((current) => replaceById(current, task.id, task));
        if (!keepalive) showError(cause, () => deferTaskTransition(task, nextStatus));
      }
    }, (cause) => { transitionSnapshots.current.delete(key); setTasks((current) => replaceById(current, task.id, task)); showError(cause, () => deferTaskTransition(task, nextStatus)); });
  };

  const deferReminderTransition = (reminder: Reminder, nextState: 'done' | 'cancelled') => {
    beginAction();
    const key = itemKey('reminder', reminder.id);
    transitionSnapshots.current.set(key, reminder);
    const optimistic = { ...reminder, state: nextState } as Reminder;
    setReminders((current) => replaceById(current, reminder.id, optimistic));
    setUndoKeys((current) => ({ ...current, [key]: true }));
    queueRef.current.schedule(key, async (keepalive) => {
      setUndoKeys((current) => { const next = { ...current }; delete next[key]; return next; });
      try {
        if (nextState === 'done') {
          const result = await reminderApi.complete(reminder.id, true, { keepalive });
          if (result.reminder) setReminders((current) => replaceById(current, reminder.id, result.reminder));
        } else {
          const result = await reminderApi.cancel(reminder.id, true, { keepalive });
          if (result.reminder) setReminders((current) => replaceById(current, reminder.id, result.reminder!));
        }
        transitionSnapshots.current.delete(key);
        if (!keepalive) setMessage(nextState === 'done' ? 'Reminder done ho gaya.' : 'Reminder cancel ho gaya.');
      } catch (cause) {
        transitionSnapshots.current.delete(key);
        setReminders((current) => replaceById(current, reminder.id, reminder));
        if (!keepalive) showError(cause, () => deferReminderTransition(reminder, nextState));
      }
    }, (cause) => { transitionSnapshots.current.delete(key); setReminders((current) => replaceById(current, reminder.id, reminder)); showError(cause, () => deferReminderTransition(reminder, nextState)); });
  };

  const undoTransition = (kind: 'task' | 'reminder', id: string) => {
    const key = itemKey(kind, id);
    if (!queueRef.current.cancel(key)) return;
    const original = transitionSnapshots.current.get(key);
    transitionSnapshots.current.delete(key);
    setUndoKeys((current) => { const next = { ...current }; delete next[key]; return next; });
    if (original && kind === 'task') setTasks((current) => replaceById(current, id, original as Task));
    else if (original) setReminders((current) => replaceById(current, id, original as Reminder));
    setError(''); setMessage('Undo ho gaya.'); setRetryVisible(false);
  };

  const performDelete = async (kind: 'task' | 'reminder', id: string) => {
    beginAction(); setDeletePrompt(null);
    const key = itemKey(kind, id);
    if (kind === 'task') {
      const before = tasks.find((item) => item.id === id);
      if (!before) return;
      setRemovingKeys((current) => ({ ...current, [key]: true }));
      const timer = setTimeout(() => {
        setTasks((current) => removeById(current, id));
        setRemovingKeys((current) => { const next = { ...current }; delete next[key]; return next; });
        deleteFadeTimers.current.delete(key);
      }, 190);
      deleteFadeTimers.current.set(key, timer);
      try { await taskApi.delete(id, true); setMessage('Task permanently delete ho gaya.'); }
      catch (cause) {
        clearTimeout(timer); deleteFadeTimers.current.delete(key);
        setRemovingKeys((current) => { const next = { ...current }; delete next[key]; return next; });
        setTasks((current) => replaceById(current, id, before));
        showError(cause, () => performDelete('task', id));
      }
      return;
    }
    const before = reminders.find((item) => item.id === id);
    if (!before) return;
    setRemovingKeys((current) => ({ ...current, [key]: true }));
    const timer = setTimeout(() => {
      setReminders((current) => removeById(current, id));
      setRemovingKeys((current) => { const next = { ...current }; delete next[key]; return next; });
      deleteFadeTimers.current.delete(key);
    }, 190);
    deleteFadeTimers.current.set(key, timer);
    try { await reminderApi.delete(id, true); setMessage('Reminder permanently delete ho gaya.'); }
    catch (cause) {
      clearTimeout(timer); deleteFadeTimers.current.delete(key);
      setRemovingKeys((current) => { const next = { ...current }; delete next[key]; return next; });
      setReminders((current) => replaceById(current, id, before));
      showError(cause, () => performDelete('reminder', id));
    }
  };

  const startTaskEdit = (task: Task) => {
    beginAction(); setEditingTaskId(task.id); setEditTitle(task.title); setEditDue(isoToIstDateTime(task.due_at));
    setEditEndsAt(isoToIstDateTime(task.ends_at)); setEditPriority(String(task.priority)); setEditRepeat(task.repeat_rule ?? '');
  };
  const saveTaskEdit = async (event: FormEvent) => {
    event.preventDefault(); if (!editingTaskId) return;
    beginAction();
    const original = tasks.find((item) => item.id === editingTaskId);
    if (!original) return;
    const dueAt = istDateTimeToIso(editDue);
    const endsAt = istDateTimeToIso(editEndsAt);
    if (editDue && !dueAt) { setError('Due date/time valid nahi hai.'); return; }
    if (editEndsAt && !endsAt) { setError('Ends at ka time valid nahi hai.'); return; }
    if (endsAt && (!dueAt || new Date(endsAt).getTime() <= new Date(dueAt).getTime())) { setError('Ends at, Due date/time ke baad hona chahiye.'); return; }
    const title = editTitle.trim();
    if (!title || classifySensitivity(title).sensitive) { setError('Yeh private hai? Is title ko public list mein save nahi kar sakte.'); return; }
    const fields = { title, due_at: dueAt, ends_at: endsAt, priority: Number(editPriority), repeat_rule: editRepeat || null, time_zone: TIME_ZONE };
    const updated = { ...original, ...fields } as Task;
    const run = async (allowClash: boolean) => {
      const result = await runOptimisticMutation({
        snapshot: () => original,
        optimistic: () => setTasks((current) => replaceById(current, original.id, updated)),
        request: () => taskApi.update(original.id, fields, true, allowClash),
        commit: (result: any) => setTasks((current) => replaceById(current, original.id, result.task)),
        rollback: (snapshot: Task) => setTasks((current) => replaceById(current, original.id, snapshot)),
      });
      if (result.ok === false) throw result.error;
      setEditingTaskId(''); setMessage('Task update ho gaya.');
    };
    setBusy(true);
    try { await run(false); }
    catch (cause: any) {
      if (!showConflictIfNeeded(cause, () => run(true))) showError(cause, () => run(false));
    } finally { setBusy(false); }
  };

  const startReminderEdit = (reminder: Reminder) => {
    beginAction(); setEditingReminderId(reminder.id); setEditReminderText(reminder.text);
    setEditReminderAt(isoToIstDateTime(reminder.remind_at)); setEditReminderRepeat(reminder.repeat_rule ?? '');
  };
  const saveReminderEdit = async (event: FormEvent) => {
    event.preventDefault(); if (!editingReminderId) return;
    beginAction();
    const original = reminders.find((item) => item.id === editingReminderId);
    if (!original) return;
    const text = editReminderText.trim();
    const remindAtIso = istDateTimeToIso(editReminderAt);
    if (!text || !remindAtIso) { setError('Reminder text aur date/time dono sahi hone chahiye.'); return; }
    if (classifySensitivity(text).sensitive) { setError('Yeh private hai? Is reminder ko public list mein save nahi kar sakte.'); return; }
    const fields = { text, remind_at: remindAtIso, repeat_rule: editReminderRepeat || null, time_zone: TIME_ZONE };
    const updated = { ...original, ...fields } as Reminder;
    const run = async (allowDuplicate: boolean) => {
      const result = await runOptimisticMutation({
        snapshot: () => original,
        optimistic: () => setReminders((current) => replaceById(current, original.id, updated)),
        request: () => reminderApi.update(original.id, fields, true, allowDuplicate),
        commit: (result: any) => setReminders((current) => replaceById(current, original.id, result.reminder)),
        rollback: (snapshot: Reminder) => setReminders((current) => replaceById(current, original.id, snapshot)),
      });
      if (result.ok === false) throw result.error;
      setEditingReminderId(''); setMessage('Reminder update ho gaya.');
    };
    setBusy(true);
    try { await run(false); }
    catch (cause: any) {
      if (!showConflictIfNeeded(cause, () => run(true))) showError(cause, () => run(false));
    } finally { setBusy(false); }
  };

  const taskGroups = splitByState(sortByTime(tasks), 'status', OPEN_TASK_STATES);
  const reminderGroups = splitByState(sortByTime(reminders), 'state', OPEN_REMINDER_STATES);
  const pendingReminderCount = reminders.filter((item) => OPEN_REMINDER_STATES.includes(item.state)).length;

  return <section className="page active s08-page s08-manager" aria-labelledby="s08-manager-title">
    <div className="s08-page-heading"><div><h2 id="s08-manager-title">Task Manager</h2><p>Hindi ya Hinglish mein add karo, ya details manually set karo.</p></div></div>
    <form className="card s08-natural-form" onSubmit={addNatural}>
      <label htmlFor="s08-natural">Natural-language add</label>
      <div className="s08-input-row"><input id="s08-natural" value={natural} onChange={(e) => setNatural(e.target.value)} placeholder="Kal subah 7 baje meeting yaad dilana" maxLength={1000} /><button type="submit" disabled={busy || !natural.trim()}>Add</button></div>
      <small>Aaj/kal/parson, time range, repeat aur priority supported. “Kal 7 baje” ambiguous ho to AM/PM confirm karna padega.</small>
    </form>

    {pendingConfirm && <section className="card s08-confirm-card" role="region" aria-label="Confirmation required" id="s08-confirm-box">
      <p id="s08-confirm-prompt">{pendingConfirm.promptText}</p>
      <div className="s08-confirm-actions"><button id="s08-confirm-yes" className="s08-confirm-yes" type="button" disabled={busy} onClick={() => void confirmPendingYes()}>Haan</button><button id="s08-confirm-no" className="s08-inline-action" type="button" disabled={busy} onClick={confirmPendingNo}>Nahi</button></div>
    </section>}
    {pendingClash && <section className="card s08-confirm-card s08-clash-card" role="alert"><p>{pendingClash.message}</p><div className="s08-confirm-actions"><button className="s08-inline-action" type="button" onClick={() => { setPendingClash(null); setPendingConfirm(null); }}>Samay badlo</button><button className="s08-confirm-yes" type="button" disabled={busy} onClick={() => void runClashOverride()}>Phir bhi banao</button></div></section>}
    {clarifyQuestion && <div className="s08-alert" role="alert" id="s08-clarify-box">{clarifyQuestion}</div>}
    {error && <div className="s08-alert" role="alert">{error} {retryVisible && <button className="s08-inline-action" type="button" disabled={busy} onClick={() => void retryFailedAction()}>Retry</button>}</div>}
    {message && <div className="s08-success" role="status">{message}</div>}
    {!!Object.keys(undoKeys).length && <div className="s08-undo-strip" role="status">{Object.keys(undoKeys).map((key) => {
      const [kind, id] = key.split(':') as ['task' | 'reminder', string];
      const label = kind === 'task' ? tasks.find((item) => item.id === id)?.title ?? 'Task' : reminders.find((item) => item.id === id)?.text ?? 'Reminder';
      return <span className="s08-undo-entry" key={key}><span>{label} move hua.</span><button className="s08-inline-action" type="button" onClick={() => undoTransition(kind, id)}>Undo</button></span>;
    })}</div>}

    <div className="s08-tabs" role="tablist" aria-label="Tasks and reminders">
      <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'active' : ''} type="button" onClick={() => setTab('tasks')}>Tasks ({countOpenTasks(tasks)})</button>
      <button role="tab" aria-selected={tab === 'reminders'} className={tab === 'reminders' ? 'active' : ''} type="button" onClick={() => setTab('reminders')}>Reminders ({pendingReminderCount})</button>
    </div>

    {tab === 'tasks' ? <>
      <form className="card s08-task-form" onSubmit={addTask}>
        <label htmlFor="s08-task-title">New task</label>
        <input id="s08-task-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task ka naam" maxLength={500} required />
        <div className="s08-fields-grid"><label>Due date & time (IST)<input type="datetime-local" value={newDue} onChange={(e) => setNewDue(e.target.value)} /></label><label>Ends at (optional)<input type="datetime-local" value={newEndsAt} onChange={(e) => setNewEndsAt(e.target.value)} /></label><label>Priority<select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}><option value="1">Low</option><option value="2">Normal</option><option value="3">High</option></select></label><label>Repeat<select value={newRepeat} onChange={(e) => setNewRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
        <button type="submit" disabled={busy || !newTitle.trim()}>Create task</button>
      </form>
      <section className="card s08-manager-list"><div className="card-head"><div className="card-title"><span className="symbol t-emerald"><svg className="i" aria-hidden="true"><use href="#i-ntasks" /></svg></span> Your tasks</div></div>
        {taskGroups.active.length ? <ul>{taskGroups.active.map((task) => <li key={task.id} className={`s08-task-row ${removingKeys[itemKey('task', task.id)] ? 's08-fade-out' : ''}`}>
          <span className="s08-priority" data-priority={task.priority} /><div className="s08-item-copy"><b>{task.title}</b><small>{displayDate(task.due_at)}{task.ends_at ? ` – ${displayTime(task.ends_at)}` : ''} · Priority {task.priority} · {task.status}{task.repeat_rule ? ' · Repeats' : ''}</small></div>
          <div className="s08-actions"><button className="s08-inline-action" type="button" onClick={() => startTaskEdit(task)}>Edit</button><button className="s08-inline-action" type="button" onClick={() => deferTaskTransition(task, 'done')}>Done</button><button className="s08-inline-action" type="button" onClick={() => startCancelPrompt('task', task.id)}>Cancel</button><button className="s08-inline-action" type="button" onClick={() => startDeletePrompt('task', task.id)}>Delete</button>{undoKeys[itemKey('task', task.id)] && <button className="s08-inline-action" type="button" onClick={() => undoTransition('task', task.id)}>Undo</button>}</div>
          {cancelPrompt?.kind === 'task' && cancelPrompt.id === task.id && <div className="s08-row-confirm"><span>Pakka cancel karein?</span><button className="s08-confirm-yes" type="button" onClick={() => { dismissCancelPrompt(); deferTaskTransition(task, 'cancelled'); }}>Haan, cancel karo</button><button className="s08-inline-action" type="button" onClick={dismissCancelPrompt}>Nahi</button></div>}
          {deletePrompt?.kind === 'task' && deletePrompt.id === task.id && <div className="s08-row-confirm"><span>Pakka delete? Wapas nahi aayega.</span><button className="s08-confirm-yes" type="button" onClick={() => void performDelete('task', task.id)}>Haan, delete</button><button className="s08-inline-action" type="button" onClick={() => setDeletePrompt(null)}>Nahi</button></div>}
          {editingTaskId === task.id && <form className="s08-edit-form" onSubmit={saveTaskEdit}><label>Task title<input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={500} required /></label><div className="s08-fields-grid"><label>Due date & time (IST)<input type="datetime-local" value={editDue} onChange={(e) => setEditDue(e.target.value)} /></label><label>Ends at<input type="datetime-local" value={editEndsAt} onChange={(e) => setEditEndsAt(e.target.value)} /></label><label>Priority<select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}><option value="1">Low</option><option value="2">Normal</option><option value="3">High</option></select></label><label>Repeat<select value={editRepeat} onChange={(e) => setEditRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="s08-actions"><button className="s08-inline-action" type="submit" disabled={busy}>Save</button><button className="s08-inline-action" type="button" onClick={() => setEditingTaskId('')}>Close</button></div></form>}
        </li>)}</ul> : <p className="s08-muted">Abhi koi open task nahi hai.</p>}
        {!!taskGroups.archived.length && <details className="s08-archive"><summary>Cancelled / Done ({taskGroups.archived.length})</summary><ul>{taskGroups.archived.map((task) => <li key={task.id} className={`s08-task-row ${removingKeys[itemKey('task', task.id)] ? 's08-fade-out' : ''}`}><span className="s08-priority" data-priority={task.priority} /><div className="s08-item-copy"><b>{task.title}</b><small>{displayDate(task.due_at)} · {task.status}</small></div><div className="s08-actions">{undoKeys[itemKey('task', task.id)] && <button className="s08-inline-action" type="button" onClick={() => undoTransition('task', task.id)}>Undo</button>}<button className="s08-inline-action" type="button" onClick={() => startDeletePrompt('task', task.id)}>Delete</button></div>{deletePrompt?.kind === 'task' && deletePrompt.id === task.id && <div className="s08-row-confirm"><span>Pakka delete? Wapas nahi aayega.</span><button className="s08-confirm-yes" type="button" onClick={() => void performDelete('task', task.id)}>Haan, delete</button><button className="s08-inline-action" type="button" onClick={() => setDeletePrompt(null)}>Nahi</button></div>}</li>)}</ul></details>}
      </section>
    </> : <>
      <form className="card s08-reminder-form" onSubmit={addReminder}><label htmlFor="s08-reminder-text">Reminder</label><input id="s08-reminder-text" value={reminderText} onChange={(e) => setReminderText(e.target.value)} placeholder="Reminder ka naam" maxLength={500} required /><label htmlFor="s08-remind-at">Date & time (IST)</label><input id="s08-remind-at" type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required /><label htmlFor="s08-repeat">Repeat</label><select id="s08-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="submit" disabled={busy || !reminderText.trim() || !remindAt}>Save reminder</button></form>
      <section className="card s08-manager-list"><div className="card-head"><div className="card-title"><span className="symbol t-cyan"><svg className="i" aria-hidden="true"><use href="#i-bell" /></svg></span> Your reminders</div></div>
        {reminderGroups.active.length ? <ul>{reminderGroups.active.map((reminder) => <li key={reminder.id} className={`s08-reminder-row ${removingKeys[itemKey('reminder', reminder.id)] ? 's08-fade-out' : ''}`}><span className="s08-reminder-dot" /><div className="s08-item-copy"><b>{reminder.text}</b><small>{displayDate(reminder.remind_at)} · {reminder.state}{reminder.repeat_rule ? ' · Repeats' : ''}</small></div><div className="s08-actions"><button className="s08-inline-action" type="button" onClick={() => startReminderEdit(reminder)}>Edit</button><button className="s08-inline-action" type="button" onClick={() => deferReminderTransition(reminder, 'done')}>Done</button><button className="s08-inline-action" type="button" onClick={() => startCancelPrompt('reminder', reminder.id)}>Cancel</button><button className="s08-inline-action" type="button" onClick={() => startDeletePrompt('reminder', reminder.id)}>Delete</button>{undoKeys[itemKey('reminder', reminder.id)] && <button className="s08-inline-action" type="button" onClick={() => undoTransition('reminder', reminder.id)}>Undo</button>}</div>
          {cancelPrompt?.kind === 'reminder' && cancelPrompt.id === reminder.id && <div className="s08-row-confirm"><span>Pakka cancel karein?</span><button className="s08-confirm-yes" type="button" onClick={() => { dismissCancelPrompt(); deferReminderTransition(reminder, 'cancelled'); }}>Haan, cancel karo</button><button className="s08-inline-action" type="button" onClick={dismissCancelPrompt}>Nahi</button></div>}
          {deletePrompt?.kind === 'reminder' && deletePrompt.id === reminder.id && <div className="s08-row-confirm"><span>Pakka delete? Wapas nahi aayega.</span><button className="s08-confirm-yes" type="button" onClick={() => void performDelete('reminder', reminder.id)}>Haan, delete</button><button className="s08-inline-action" type="button" onClick={() => setDeletePrompt(null)}>Nahi</button></div>}
          {editingReminderId === reminder.id && <form className="s08-edit-form" onSubmit={saveReminderEdit}><label>Reminder text<input value={editReminderText} onChange={(e) => setEditReminderText(e.target.value)} maxLength={500} required /></label><div className="s08-fields-grid"><label>Date & time (IST)<input type="datetime-local" value={editReminderAt} onChange={(e) => setEditReminderAt(e.target.value)} required /></label><label>Repeat<select value={editReminderRepeat} onChange={(e) => setEditReminderRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="s08-actions"><button className="s08-inline-action" type="submit" disabled={busy}>Save</button><button className="s08-inline-action" type="button" onClick={() => setEditingReminderId('')}>Close</button></div></form>}
        </li>)}</ul> : <p className="s08-muted">Abhi koi pending reminder nahi hai.</p>}
        {!!reminderGroups.archived.length && <details className="s08-archive"><summary>Cancelled / Done ({reminderGroups.archived.length})</summary><ul>{reminderGroups.archived.map((reminder) => <li key={reminder.id} className={`s08-reminder-row ${removingKeys[itemKey('reminder', reminder.id)] ? 's08-fade-out' : ''}`}><span className="s08-reminder-dot" /><div className="s08-item-copy"><b>{reminder.text}</b><small>{displayDate(reminder.remind_at)} · {reminder.state}</small></div><div className="s08-actions">{undoKeys[itemKey('reminder', reminder.id)] && <button className="s08-inline-action" type="button" onClick={() => undoTransition('reminder', reminder.id)}>Undo</button>}<button className="s08-inline-action" type="button" onClick={() => startDeletePrompt('reminder', reminder.id)}>Delete</button></div>{deletePrompt?.kind === 'reminder' && deletePrompt.id === reminder.id && <div className="s08-row-confirm"><span>Pakka delete? Wapas nahi aayega.</span><button className="s08-confirm-yes" type="button" onClick={() => void performDelete('reminder', reminder.id)}>Haan, delete</button><button className="s08-inline-action" type="button" onClick={() => setDeletePrompt(null)}>Nahi</button></div>}</li>)}</ul></details>}
      </section>
    </>}
  </section>;
}
