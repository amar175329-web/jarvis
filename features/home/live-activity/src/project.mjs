const SAFE_JOB_LABELS = new Map([
  ['browser.search', { label: 'Researching the web', icon: 'globe' }],
  ['browser.navigate', { label: 'Exploring the web', icon: 'globe' }],
  ['browser.read', { label: 'Reading a webpage', icon: 'globe' }],
  ['code.task', { label: 'Working on a project', icon: 'code' }],
  ['agents.run', { label: 'Running a JARVIS task', icon: 'spark' }],
  ['bots.run', { label: 'Running a background task', icon: 'bot' }],
  ['reminders.fire', { label: 'Reminder activity', icon: 'clock' }],
  ['terminal.process', { label: 'Terminal task', icon: 'code' }],
]);
const ACTIVE_STATES = new Set(['queued', 'running', 'sent']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validTime(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '';
  return new Date(value).toISOString();
}

/** Metadata-only projection: never inspect payload, command, result, error or device name. */
export function projectLiveActivity({ jobs = [], phoneCommands = [], limit = 5 } = {}) {
  if (!Array.isArray(jobs) || !Array.isArray(phoneCommands)) return [];
  const output = [];
  for (const row of jobs) {
    if (!row || typeof row !== 'object' || !UUID.test(String(row.id ?? ''))) continue;
    const info = SAFE_JOB_LABELS.get(String(row.kind ?? '').toLowerCase());
    const state = String(row.state ?? '').toLowerCase();
    if (!info || !['queued', 'running'].includes(state)) continue;
    output.push({
      id: String(row.id), label: info.label, icon: info.icon,
      state, state_label: state === 'queued' ? 'Queued' : 'Running',
      created_at: validTime(row.created_at), source: 'job',
      can_stop: state === 'queued',
    });
  }
  for (const row of phoneCommands) {
    if (!row || typeof row !== 'object' || !UUID.test(String(row.id ?? ''))) continue;
    const state = String(row.state ?? '').toLowerCase();
    if (!ACTIVE_STATES.has(state)) continue;
    output.push({
      id: String(row.id), label: 'Phone action', icon: 'phone',
      state, state_label: state === 'queued' ? 'Queued' : state === 'sent' ? 'Sent to device' : 'Running',
      created_at: validTime(row.created_at), source: 'phone',
      can_stop: state === 'queued',
    });
  }
  return output
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
    .slice(0, Math.max(0, Math.min(5, Number.isInteger(limit) ? limit : 5)));
}

export function isCancellableLiveActivity({ id, source, state }) {
  return UUID.test(String(id ?? '')) && ['job', 'phone'].includes(source) && state === 'queued';
}
