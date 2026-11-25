/**
 * Derive a truthful focus-goal percentage only from the optional S08 fields.
 * Missing metrics are unknown, not zero and never inferred from open_count.
 */
export function focusProgress(focus) {
  if (!focus || typeof focus !== 'object') return null;
  const completed = focus.completed_today;
  const goal = focus.daily_goal;
  if (!Number.isInteger(completed) || completed < 0 || !Number.isInteger(goal) || goal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((completed / goal) * 100)));
}
