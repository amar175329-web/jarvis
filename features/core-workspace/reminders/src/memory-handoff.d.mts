export type MedicineReminderRequest = {
  memory_id: string; private: true; label: string; time_text: string; display_text: string;
  needs_time_confirmation: boolean; lock_screen_visible: true; date_text?: string; time_zone?: string;
};
export function consumeMedicineReminderRequest(value: MedicineReminderRequest):
  | { ok: false; code: string }
  | { ok: true; status: 'needs_confirmation' | 'blocked'; reason: string; handoff: Omit<MedicineReminderRequest, 'needs_time_confirmation'> };
