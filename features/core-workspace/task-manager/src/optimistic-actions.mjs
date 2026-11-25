export const OPEN_TASK_STATES = Object.freeze(['todo', 'doing']);
export const ARCHIVED_TASK_STATES = Object.freeze(['done', 'cancelled']);
export const OPEN_REMINDER_STATES = Object.freeze(['pending']);
export const ARCHIVED_REMINDER_STATES = Object.freeze(['done', 'fired', 'cancelled']);

export function countOpenTasks(tasks) {
  return tasks.filter((task) => OPEN_TASK_STATES.includes(task.status)).length;
}

export function splitByState(items, stateKey, activeStates) {
  const active = [];
  const archived = [];
  for (const item of items) (activeStates.includes(item[stateKey]) ? active : archived).push(item);
  return { active, archived };
}

export function replaceById(items, id, replacement) {
  let found = false;
  const result = items.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return replacement;
  });
  return found ? result : [...result, replacement];
}

export function removeById(items, id) {
  return items.filter((item) => item.id !== id);
}

/** Apply a local change immediately; restore the exact prior item if the request fails. */
export async function runOptimisticMutation({ snapshot, optimistic, request, commit, rollback, onError }) {
  const before = snapshot();
  optimistic();
  try {
    const result = await request();
    commit(result);
    return { ok: true, result };
  } catch (error) {
    rollback(before);
    onError?.(error);
    return { ok: false, error };
  }
}

/** Small reusable timeout for inline Cancel prompts that expire back to the normal row. */
export function createAutoDismissTimer({ delayMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  return {
    schedule(onExpire) {
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => { timer = null; onExpire(); }, delayMs);
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    get active() { return timer !== null; },
  };
}

/** Five-second undo queue. `run(true)` means a pagehide/unmount flush using fetch keepalive. */
export function createDeferredActionQueue({ delayMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const pending = new Map();

  function cancel(key) {
    const entry = pending.get(key);
    if (!entry) return false;
    clearTimer(entry.timer);
    pending.delete(key);
    return true;
  }

  function schedule(key, run, onError = () => {}) {
    cancel(key);
    const entry = { run, onError, timer: null };
    entry.timer = setTimer(() => {
      if (pending.get(key) !== entry) return;
      pending.delete(key);
      Promise.resolve().then(() => run(false)).catch(onError);
    }, delayMs);
    pending.set(key, entry);
    return () => cancel(key);
  }

  async function flushAll() {
    const entries = [...pending.entries()];
    pending.clear();
    for (const [, entry] of entries) clearTimer(entry.timer);
    return Promise.allSettled(entries.map(([, entry]) => Promise.resolve().then(() => entry.run(true)).catch((error) => {
      entry.onError(error);
      throw error;
    })));
  }

  return { schedule, cancel, flushAll, has: (key) => pending.has(key), get size() { return pending.size; } };
}

export function friendlyActionError(error) {
  if (error?.code === 'network_error' || error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(error?.message ?? ''))) {
    return 'Network dikkat, dobara try karo';
  }
  if (error?.code === 'privacy_confirmation') return 'Yeh private hai? Is text ko public list mein save nahi kar sakte.';
  if (error?.code === 'list_refresh_failed') return 'Kaam ho gaya, list abhi nahi aayi';
  return error?.rawMessage || 'Kaam nahi hua. Dobara check karke try karo.';
}
