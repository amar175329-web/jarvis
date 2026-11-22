const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate S09's T2 hand-off without copying private values into logs/events. */
export function consumeMedicineReminderRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'invalid_medicine_reminder_request' };
  const allowed = ['memory_id', 'private', 'label', 'time_text', 'display_text', 'needs_time_confirmation', 'lock_screen_visible', 'date_text', 'time_zone'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return { ok: false, code: 'unexpected_fields' };
  if (!UUID.test(String(value.memory_id ?? '')) || value.private !== true || value.lock_screen_visible !== true ||
      typeof value.label !== 'string' || !value.label.trim() || value.label.length > 200 ||
      typeof value.time_text !== 'string' || !value.time_text.trim() || value.time_text.length > 80 ||
      typeof value.display_text !== 'string' || !value.display_text.trim() || value.display_text.length > 240 ||
      typeof value.needs_time_confirmation !== 'boolean') {
    return { ok: false, code: 'invalid_medicine_reminder_request' };
  }
  const safe = {
    memory_id: value.memory_id,
    private: true,
    label: value.label.trim(),
    time_text: value.time_text.trim(),
    display_text: value.display_text.trim(),
    lock_screen_visible: true,
    ...(typeof value.date_text === 'string' && value.date_text.trim() ? { date_text: value.date_text.trim().slice(0, 40) } : {}),
    ...(typeof value.time_zone === 'string' && value.time_zone.trim() ? { time_zone: value.time_zone.trim().slice(0, 64) } : {}),
  };
  if (value.needs_time_confirmation) return { ok: true, status: 'needs_confirmation', reason: 'am_pm_ambiguous', handoff: safe };
  if (!safe.date_text) return { ok: true, status: 'needs_confirmation', reason: 'date_missing_from_s09_contract', handoff: safe };
  // S19's approved T2 vault is not wired yet. Never persist this payload in clear text.
  return { ok: true, status: 'blocked', reason: 'private_reminder_vault_not_available', handoff: safe };
}
