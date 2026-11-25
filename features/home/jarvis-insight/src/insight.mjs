import { classifySensitivity } from '../../../core-workspace/task-manager/src/sensitivity.mjs';

const SAFE_ACTIVITY_ACTIONS = new Set([
  'browser.search', 'browser.navigate', 'bots.run', 'code.task',
  'browser.read', 'agent.run',
]);
const SAFE_ACTORS = new Set(['api', 'worker', 'system', 'jarvis', 'web', 'android', 'auth', 'tasks', 'reminders', 's00', 's05', 's08']);
const OPAQUE_TARGET = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9]{1,20}|req_[0-9a-f]{8,32})$/i;
const ADDITIONAL_PRIVATE_CONTEXT = /\b(?:family|mother|mom|mum|father|dad|parent|parents|brother|sister|wife|husband|son|daughter|child|children|kid|uncle|aunt|grandma|grandmother|grandpa|grandfather|cousin|salary|income|rent|loan|emi|investment|investments|savings|budget|money|cash|rupees|password|passcode|otp)\b|₹|रुपये|पैसे|परिवार|माँ|माता|पिता|भाई|बहन|बेटा|बेटी/iu;

function hasPrivateTaskContext(title, notes = '') {
  if (typeof title !== 'string' || (notes !== null && notes !== undefined && typeof notes !== 'string')) return true;
  const content = `${title}\n${notes ?? ''}`;
  return classifySensitivity(content).sensitive || ADDITIONAL_PRIVATE_CONTEXT.test(content);
}

function hasDetailContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
  return true;
}

function safeActivityRow(row) {
  if (!row || typeof row !== 'object') return false;
  const actor = typeof row.actor === 'string' ? row.actor.trim().toLowerCase() : '';
  const action = typeof row.action === 'string' ? row.action.trim().toLowerCase() : '';
  const target = typeof row.target === 'string' ? row.target.trim() : '';
  if (!SAFE_ACTORS.has(actor) || !SAFE_ACTIVITY_ACTIONS.has(action) || (target && !OPAQUE_TARGET.test(target))) return false;
  if (hasDetailContent(row.detail)) return false;
  const classifierInput = `${actor} ${action} ${target && !OPAQUE_TARGET.test(target) ? target : ''}`;
  return !classifySensitivity(classifierInput).sensitive && !ADDITIONAL_PRIVATE_CONTEXT.test(classifierInput);
}

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { key: `${values.year}-${values.month}-${values.day}`, label: values.weekday };
}

function parsedDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateKeys(now, timeZone) {
  const today = dateParts(now, timeZone).key;
  const base = new Date(`${today}T12:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base.getTime() - (6 - index) * 86_400_000);
    return dateParts(date, 'UTC');
  });
}

/** Aggregates safe metadata only. It never returns raw task/activity text. */
export function deriveInsight({ tasks = [], activity = [], now = new Date(), timeZone = 'Asia/Kolkata' } = {}) {
  if (!Array.isArray(tasks) || !Array.isArray(activity) || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('valid tasks, activity and now required');
  }
  let effectiveTimeZone = timeZone;
  let days;
  try { days = dateKeys(now, effectiveTimeZone); } catch { effectiveTimeZone = 'Asia/Kolkata'; days = dateKeys(now, effectiveTimeZone); }
  const byDay = new Map(days.map((day) => [day.key, { ...day, safe_completions: 0, public_actions: 0 }]));
  let safeTasks = 0;
  let completedTasks = 0;

  for (const task of tasks.slice(0, 500)) {
    if (!task || typeof task !== 'object' || hasPrivateTaskContext(task.title, task.notes)) continue;
    const created = parsedDate(task.created_at);
    if (created) {
      const key = dateParts(created, effectiveTimeZone).key;
      if (byDay.has(key)) safeTasks += 1;
    }
    if (task.status === 'done') {
      const completed = parsedDate(task.completed_at) ?? parsedDate(task.updated_at);
      if (completed) {
        const key = dateParts(completed, effectiveTimeZone).key;
        if (byDay.has(key)) {
          byDay.get(key).safe_completions += 1;
          completedTasks += 1;
        }
      }
    }
  }

  for (const row of activity.slice(0, 500)) {
    if (!safeActivityRow(row)) continue;
    const timestamp = parsedDate(row.ts);
    if (!timestamp) continue;
    const key = dateParts(timestamp, effectiveTimeZone).key;
    if (byDay.has(key)) byDay.get(key).public_actions += 1;
  }

  const values = [...byDay.values()].map((day) => day.safe_completions + day.public_actions);
  const total = values.reduce((sum, value) => sum + value, 0);
  const activeDays = values.filter((value) => value > 0).length;
  const bars = [...byDay.values()].map((day) => ({
    day: day.label,
    value: day.safe_completions + day.public_actions,
    safe_completions: day.safe_completions,
    public_actions: day.public_actions,
  }));

  let headline = 'A little progress adds up.';
  let tip = 'Abhi enough data nahi hai — thoda activity aane par yahan pattern dikhega.';
  if (total > 0 && activeDays >= 5) {
    headline = 'Consistency ban rahi hai.';
    tip = 'Isi simple rhythm ko maintain rakho; ek waqt mein ek kaam.';
  } else if (completedTasks > 0) {
    headline = 'Progress move ho rahi hai.';
    tip = 'Jo chhote steps complete ho rahe hain, unhe steady rakho.';
  } else if (total > 0) {
    headline = 'Aapka JARVIS active raha hai.';
    tip = 'Aaj ek clear next step choose karna useful ho sakta hai.';
  }

  return { headline, tip, active_days: activeDays, safe_task_count: safeTasks, completed_task_count: completedTasks, bars };
}
