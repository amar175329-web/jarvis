import { FormEvent, useEffect, useState } from 'react';
import { reminderApi, taskApi, type Reminder, type Task } from '../src/api-client';
import { parseNaturalLanguage } from '../src/natural-language.mjs';
import { classifySensitivity } from '../src/sensitivity.mjs';
import './task-manager.css';

type Tab = 'tasks' | 'reminders';
type PendingConfirm =
  | { kind: 'natural'; text: string; promptText: string }
  | { kind: 'task'; payload: { title: string; due_at: string | null; priority: number; repeat_rule: string | null; time_zone: string }; promptText: string }
  | { kind: 'reminder'; payload: { text: string; remind_at: string; repeat_rule: string | null; time_zone: string }; promptText: string };

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
function isoToIstDateTime(value: string | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = Object.fromEntries(parts.filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}
function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: TIME_ZONE }) : 'No due date';
}
function cleanNeedsConfirmationQuestion(reason?: unknown, fallback?: string): string {
  if (reason === 'midnight_date') return 'raat 12 baje aaj ya kal ki?';
  if (reason === 'night_after_midnight') return 'Sawal: Raat ke baad (AM) ka time hai — aaj ya kal ki date confirm karo.';
  if (reason === 'title_missing') return 'Sawal: Kya yaad dilana hai? Task ya reminder ka naam likho.';
  if (reason === 'am_pm_ambiguous' || reason === 'time_ambiguous') return 'Sawal: Yeh subah (AM) hai ya shaam (PM)? Exact time confirm karo (jaise "subah 7 baje" ya "shaam 7 baje").';
  return fallback ? `Sawal: ${fallback}` : 'Sawal: Time ambiguous hai. Subah (AM) ya shaam (PM) confirm karo.';
}

export function TaskManagerPage() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [natural, setNatural] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newPriority, setNewPriority] = useState('2');
  const [newRepeat, setNewRepeat] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [clarifyQuestion, setClarifyQuestion] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState('');
  const [cancelTaskId, setCancelTaskId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editPriority, setEditPriority] = useState('2');
  const [editRepeat, setEditRepeat] = useState('');

  const refresh = async () => {
    const [taskData, reminderData] = await Promise.all([taskApi.list(), reminderApi.list()]);
    setTasks(taskData.tasks); setReminders(reminderData.reminders);
  };
  useEffect(() => { refresh().catch((e) => setError(e instanceof Error ? e.message : 'Data load nahi hua.')); }, []);

  const addNatural = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage(''); setClarifyQuestion(''); setPendingConfirm(null);
    const raw = natural.trim();
    if (!raw) return;
    if (classifySensitivity(raw).sensitive) {
      setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.');
      return;
    }
    const parsed = parseNaturalLanguage(raw, { timeZone: TIME_ZONE }) as any;
    if (!parsed?.ok) {
      setError(parsed?.message || 'Date/time clear nahi hua; details dobara likho.');
      return;
    }
    if (parsed.status !== 'ready') {
      setClarifyQuestion(cleanNeedsConfirmationQuestion(parsed.reason, parsed.message));
      return;
    }
    if (parsed.sensitive) {
      setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.');
      return;
    }
    const timeStr = displayDate(parsed.due_at ?? null);
    const kindLabel = parsed.kind === 'reminder' ? 'reminder' : 'task';
    setPendingConfirm({
      kind: 'natural',
      text: raw,
      promptText: `Main ye ${kindLabel} banaun? ${parsed.title}, ${timeStr}`,
    });
  };
  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage(''); setClarifyQuestion(''); setPendingConfirm(null);
    const dueAt = istDateTimeToIso(newDue);
    if (newDue && !dueAt) {
      setError('Due date/time valid nahi hai.');
      return;
    }
    const title = newTitle.trim();
    if (!title) return;
    if (classifySensitivity(title).sensitive) {
      setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.');
      return;
    }
    setPendingConfirm({
      kind: 'task',
      payload: { title, due_at: dueAt, priority: Number(newPriority), repeat_rule: newRepeat || null, time_zone: TIME_ZONE },
      promptText: `Main ye task banaun? ${title}, ${displayDate(dueAt)}`,
    });
  };
  const addReminder = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage(''); setClarifyQuestion(''); setPendingConfirm(null);
    const dueAt = istDateTimeToIso(remindAt);
    if (!dueAt) {
      setError('Reminder date/time valid nahi hai.');
      return;
    }
    const text = reminderText.trim();
    if (!text) return;
    if (classifySensitivity(text).sensitive) {
      setError('Yeh private hai? Abhi sirf normal tasks/reminders save hote hain.');
      return;
    }
    setPendingConfirm({
      kind: 'reminder',
      payload: { text, remind_at: dueAt, repeat_rule: repeat || null, time_zone: TIME_ZONE },
      promptText: `Main ye reminder banaun? ${text}, ${displayDate(dueAt)}`,
    });
  };
  const confirmPendingYes = async () => {
    if (!pendingConfirm) return;
    const current = pendingConfirm;
    setBusy(true); setError(''); setMessage(''); setClarifyQuestion('');
    try {
      if (current.kind === 'natural') {
        const result = await taskApi.naturalAdd(current.text, true);
        setNatural(''); setPendingConfirm(null); await refresh();
        setMessage(result.kind === 'reminder' ? 'Reminder save ho gaya.' : 'Task add ho gaya.');
      } else if (current.kind === 'task') {
        await taskApi.createTask(current.payload, true);
        setNewTitle(''); setNewDue(''); setNewPriority('2'); setNewRepeat(''); setPendingConfirm(null); await refresh();
        setMessage('Task add ho gaya.');
      } else {
        await reminderApi.create(current.payload, true);
        setReminderText(''); setRemindAt(''); setRepeat(''); setPendingConfirm(null); await refresh();
        setMessage('Reminder save ho gaya.');
      }
    } catch (e: any) {
      setPendingConfirm(null);
      if (e?.code === 'confirmation_required' || e?.details?.status === 'needs_confirmation') {
        setClarifyQuestion(cleanNeedsConfirmationQuestion(e?.details?.reason, e?.rawMessage));
      } else {
        setError(e instanceof Error ? e.message : 'Add nahi hua.');
      }
    } finally {
      setBusy(false);
    }
  };
  const confirmPendingNo = () => {
    setPendingConfirm(null);
    setMessage('Action cancel kar diya.');
  };
  const completeTask = async (id: string) => {
    setBusy(true); setError('');
    try { const result = await taskApi.complete(id, true); await refresh(); setMessage(result.next_task ? 'Task complete; next repeat scheduled.' : 'Task complete ho gaya.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Task update nahi hua.'); }
    finally { setBusy(false); }
  };
  const startEdit = (task: Task) => {
    setEditingId(task.id); setEditTitle(task.title); setEditDue(isoToIstDateTime(task.due_at));
    setEditPriority(String(task.priority)); setEditRepeat(task.repeat_rule ?? ''); setError('');
  };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault(); if (!editingId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const dueAt = istDateTimeToIso(editDue);
      if (editDue && !dueAt) throw new Error('Due date/time valid nahi hai.');
      await taskApi.update(editingId, { title: editTitle, due_at: dueAt, priority: Number(editPriority), repeat_rule: editRepeat || null, time_zone: TIME_ZONE }, true);
      setEditingId(''); await refresh(); setMessage('Task update ho gaya.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Task update nahi hua.'); }
    finally { setBusy(false); }
  };
  const cancelTask = async (id: string) => {
    if (cancelTaskId !== id) { setCancelTaskId(id); return; }
    setBusy(true); setError('');
    try { await taskApi.cancel(id, true); setCancelTaskId(''); await refresh(); setMessage('Task cancel ho gaya.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Task cancel nahi hua.'); }
    finally { setBusy(false); }
  };
  const cancelReminder = async (id: string) => {
    if (cancelId !== id) { setCancelId(id); return; }
    setBusy(true); setError('');
    try { await reminderApi.cancel(id, true); setCancelId(''); await refresh(); setMessage('Reminder cancel ho gaya.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Reminder cancel nahi hua.'); }
    finally { setBusy(false); }
  };

  return <section className="page active s08-page s08-manager" aria-labelledby="s08-manager-title">
    <div className="s08-page-heading"><div><h2 id="s08-manager-title">Task Manager</h2><p>Hindi ya Hinglish mein add karo, ya details manually set karo.</p></div></div>
    <form className="card s08-natural-form" onSubmit={addNatural}>
      <label htmlFor="s08-natural">Natural-language add</label>
      <div className="s08-input-row"><input id="s08-natural" value={natural} onChange={(e) => setNatural(e.target.value)} placeholder="Kal subah 7 baje meeting yaad dilana" maxLength={1000} /><button type="submit" disabled={busy || !natural.trim()}>{busy ? 'Saving…' : 'Add'}</button></div>
      <small>Aaj/kal/parson, din, time, repeat aur priority supported. “Kal 7 baje” ambiguous ho to AM/PM confirm karna padega.</small>
    </form>
    {pendingConfirm && (
      <section className="card s08-confirm-card" role="region" aria-label="Confirmation required" id="s08-confirm-box">
        <p id="s08-confirm-prompt">{pendingConfirm.promptText}</p>
        <div className="s08-confirm-actions">
          <button id="s08-confirm-yes" className="s08-confirm-yes" type="button" disabled={busy} onClick={confirmPendingYes}>Haan</button>
          <button id="s08-confirm-no" className="s08-inline-action" type="button" disabled={busy} onClick={confirmPendingNo}>Nahi</button>
        </div>
      </section>
    )}
    {clarifyQuestion && <div className="s08-alert" role="alert" id="s08-clarify-box">{clarifyQuestion}</div>}
    {error && <div className="s08-alert" role="alert">{error}</div>}{message && <div className="s08-success" role="status">{message}</div>}
    <div className="s08-tabs" role="tablist" aria-label="Tasks and reminders"><button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Tasks ({tasks.length})</button><button role="tab" aria-selected={tab === 'reminders'} className={tab === 'reminders' ? 'active' : ''} onClick={() => setTab('reminders')}>Reminders ({reminders.length})</button></div>
    {tab === 'tasks' ? <>
      <form className="card s08-task-form" onSubmit={addTask}>
        <label htmlFor="s08-task-title">New task</label><input id="s08-task-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task ka naam" maxLength={500} required />
        <div className="s08-fields-grid"><label>Due date & time (IST)<input type="datetime-local" value={newDue} onChange={(e) => setNewDue(e.target.value)} /></label><label>Priority<select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}><option value="1">Low</option><option value="2">Normal</option><option value="3">High</option></select></label><label>Repeat<select value={newRepeat} onChange={(e) => setNewRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
        <button type="submit" disabled={busy || !newTitle.trim()}>{busy ? 'Saving…' : 'Create task'}</button>
      </form>
      <section className="card s08-manager-list"><div className="card-head"><div className="card-title"><span className="symbol t-emerald"><svg className="i" aria-hidden="true"><use href="#i-ntasks" /></svg></span> Your tasks</div></div>
        {tasks.length ? <ul>{tasks.map((task) => <li key={task.id} className="s08-task-row"><span className="s08-priority" data-priority={task.priority} /><div className="s08-item-copy"><b>{task.title}</b><small>{displayDate(task.due_at)} · Priority {task.priority} · {task.status}{task.repeat_rule ? ' · Repeats' : ''}</small></div><div className="s08-actions">{task.status !== 'done' && task.status !== 'cancelled' && <><button className="s08-inline-action" type="button" disabled={busy} onClick={() => startEdit(task)}>Edit</button><button className="s08-inline-action" type="button" disabled={busy} onClick={() => completeTask(task.id)}>Done</button><button className="s08-inline-action" type="button" disabled={busy} onClick={() => cancelTask(task.id)}>{cancelTaskId === task.id ? 'Confirm' : 'Cancel'}</button></>}</div>
          {editingId === task.id && <form className="s08-edit-form" onSubmit={saveEdit}><label>Task title<input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={500} required /></label><div className="s08-fields-grid"><label>Due date & time (IST)<input type="datetime-local" value={editDue} onChange={(e) => setEditDue(e.target.value)} /></label><label>Priority<select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}><option value="1">Low</option><option value="2">Normal</option><option value="3">High</option></select></label><label>Repeat<select value={editRepeat} onChange={(e) => setEditRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="s08-actions"><button className="s08-inline-action" type="submit" disabled={busy}>Save</button><button className="s08-inline-action" type="button" onClick={() => setEditingId('')}>Close</button></div></form>}
        </li>)}</ul> : <p className="s08-muted">No tasks yet. Upar natural language ya quick form use karo.</p>}
      </section>
    </> : <>
      <form className="card s08-reminder-form" onSubmit={addReminder}><label htmlFor="s08-reminder-text">Reminder</label><input id="s08-reminder-text" value={reminderText} onChange={(e) => setReminderText(e.target.value)} placeholder="Reminder ka naam" maxLength={500} required /><label htmlFor="s08-remind-at">Date & time (IST)</label><input id="s08-remind-at" type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required /><label htmlFor="s08-repeat">Repeat</label><select id="s08-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="submit" disabled={busy || !reminderText.trim() || !remindAt}>{busy ? 'Saving…' : 'Save reminder'}</button></form>
      <section className="card s08-manager-list"><div className="card-head"><div className="card-title"><span className="symbol t-cyan"><svg className="i" aria-hidden="true"><use href="#i-bell" /></svg></span> Your reminders</div></div>
        {reminders.length ? <ul>{reminders.map((reminder) => <li key={reminder.id}><span className="s08-reminder-dot" /><div className="s08-item-copy"><b>{reminder.text}</b><small>{displayDate(reminder.remind_at)} · {reminder.state}{reminder.repeat_rule ? ' · Repeats' : ''}</small></div>{reminder.state === 'pending' && <button className="s08-inline-action" type="button" disabled={busy} onClick={() => cancelReminder(reminder.id)}>{cancelId === reminder.id ? 'Confirm cancel' : 'Cancel'}</button>}</li>)}</ul> : <p className="s08-muted">No reminders yet.</p>}
      </section>
    </>}
  </section>;
}
