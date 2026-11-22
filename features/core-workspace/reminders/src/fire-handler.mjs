import { nextOccurrenceAfter } from './time-recurrence.mjs';

/**
 * S08-owned reminder job handler. S00 wires this into worker/jobs after the
 * worker contract/power registration CR is accepted. Side effects are injected
 * so the handler cannot bypass the registered-power executor or S16A device
 * notification allow-list.
 */
export function createReminderFireHandler(deps) {
  for (const name of ['findReminder', 'verifyApproval', 'runPower', 'sendNotification', 'markFired', 'requeue']) {
    if (typeof deps?.[name] !== 'function') throw new TypeError(`missing reminder fire dependency: ${name}`);
  }
  return async function reminderFireHandler({ job, signal, log }) {
    const reminderId = typeof job?.payload?.reminder_id === 'string' ? job.payload.reminder_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(reminderId)) throw new Error('reminder job payload is invalid');
    if (signal?.aborted) throw new Error('reminder job aborted');
    const reminder = await deps.findReminder({ reminderId, ownerId: job.owner_id });
    if (!reminder || reminder.state !== 'pending') return { skipped: 'not_pending' };
    if (typeof reminder.approved_decision_id !== 'string' || !await deps.verifyApproval({ ownerId: job.owner_id, decisionId: reminder.approved_decision_id, powerId: 'reminders.create' })) {
      throw new Error('reminder owner approval could not be verified');
    }
    const nowMs = typeof deps.now === 'function' ? Number(deps.now()) : Date.now();
    if (!Number.isFinite(nowMs)) throw new Error('worker clock unavailable');
    if (new Date(reminder.remind_at).getTime() > nowMs) return { skipped: 'not_due' };

    // Only the reminder id is in the job/audit log. Sensitive display text is
    // fetched at fire time and delivered only to the explicitly permitted device.
    const result = await deps.runPower({
      powerId: 'reminders.fire', ownerId: job.owner_id, confirmed: true,
      why: 'User-approved scheduled reminder became due.',
      run: async () => {
        await deps.sendNotification({ ownerId: job.owner_id, reminder, idempotencyKey: `reminder:${reminderId}:${reminder.remind_at}` });
        if (reminder.repeat_rule) {
          const nextAt = nextOccurrenceAfter(reminder.remind_at, reminder.repeat_rule, reminder.time_zone || 'Asia/Kolkata', new Date(nowMs));
          await deps.requeue({ ownerId: job.owner_id, reminderId, runAt: nextAt });
          await deps.markFired({ ownerId: job.owner_id, reminderId, firedAt: new Date().toISOString(), nextAt: nextAt.toISOString(), keepPending: true });
          return { recurring: true, next_at: nextAt.toISOString() };
        }
        await deps.markFired({ ownerId: job.owner_id, reminderId, firedAt: new Date().toISOString(), keepPending: false });
        return { recurring: false };
      },
    });
    if (!result || typeof result !== 'object' || result.executed !== true) throw new Error('reminder fire power blocked or did not confirm execution');
    const value = result.result;
    const recurring = Boolean(value && typeof value === 'object' && 'recurring' in value && value.recurring);
    log?.info?.(recurring ? 'reminder recurrence advanced' : 'reminder delivered', { reminder_id: reminderId });
    return { fired: true, ...(value && typeof value === 'object' ? value : { recurring }) };
  };
}
