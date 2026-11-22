export type FireReminder = {
  id: string; owner_id: string; state: 'pending' | 'fired' | 'cancelled'; remind_at: string;
  repeat_rule: string | null; time_zone?: string | null; approved_decision_id: string;
  display_text?: string | null; is_private?: boolean;
};
export function createReminderFireHandler(deps: {
  findReminder(args: { reminderId: string; ownerId: string }): Promise<FireReminder | null>;
  verifyApproval(args: { ownerId: string; decisionId: string; powerId: 'reminders.create' }): Promise<boolean>;
  runPower(args: { powerId: 'reminders.fire'; ownerId: string; why: string; confirmed: true; run: () => Promise<unknown> }): Promise<{ executed: boolean; result?: unknown }>;
  sendNotification(args: { ownerId: string; reminder: FireReminder; idempotencyKey: string }): Promise<unknown>;
  markFired(args: { ownerId: string; reminderId: string; firedAt: string; nextAt?: string; keepPending: boolean }): Promise<void>;
  requeue(args: { ownerId: string; reminderId: string; runAt: Date }): Promise<void>;
  now?(): number;
}): (ctx: { job: { owner_id: string; payload: Record<string, unknown> }; signal: AbortSignal; log?: { info?: (message: string, meta?: Record<string, unknown>) => void } }) => Promise<unknown>;
