# CR-S08-B3-S22 — Mutation powers

**Decision owner:** S22 / LEAD. **No registry JSON or DB seed is changed in this patch.** Seed only after acceptance through the S22-approved power management path.

Register these four power IDs (exact spelling):

| Power ID | Owner | autonomy_default | autonomy_current | max_level | needs_confirm | reversible |
|---|---|---:|---:|---:|---|---|
| `tasks.delete` | S08 | 2 | 2 | 2 | true | false |
| `reminders.update` | S08 | 2 | 2 | 2 | true | true |
| `reminders.complete` | S08 | 2 | 2 | 2 | true | true |
| `reminders.delete` | S08 | 2 | 2 | 2 | true | false |

All four are personal-data mutations and must fail closed if the power is missing, disabled, below/above its cap incorrectly, owner mismatch occurs, kill-switch state is ON/unreadable, or audit intent cannot be written. The client sends `confirmed: true` only after the corresponding explicit Save / Done / `Haan, delete` UI action. No code sets the power level itself and no new autonomy is inferred from this CR.

Retain L2 confirmation and max-level 2 for existing `tasks.create`, `tasks.update`, `tasks.complete`, `tasks.cancel`, `reminders.create`, and `reminders.cancel` powers. For hard delete powers `reversible=false` is mandatory.

Audit `request` must be the power ID and `why` a generic phrase. No title, reminder text, clash title/time, medicine label or other user-entered content may be copied to `decisions`, `activity_log`, telemetry or error metadata.
