# Chat memory interface (S07/S22)

`MemoryService` is the only chat-facing reader/writer. Construct one service per request with the authenticated owner-scoped store, kill-switch reader, optional model-gateway embedder and optional S08 reminder hand-off.

## Normal chat turn (T1 only by default)

```ts
const r = await mem.recall({ text: userMessage, maxItems: 8, maxChars: 3200 });
// r.block contains the T1 card + T1 relevant rows only.
// A missing purpose can never fetch T2.
```

## Purpose-scoped T2

When Amit asks about sensitive information or a task genuinely needs it, S22/S07 sets exactly one purpose:

```ts
const workout = await mem.recall({ text: 'kal ki exercise plan', purpose: 'plan_workout' });
const status = await mem.recall({ text: 'mera din kaisa tha', purpose: 'day_status' });
const medicine = await mem.recall({ text: 'Metformin ka reminder', purpose: 'medicine_reminder' });
const budget = await mem.recall({ text: 'mera monthly budget', purpose: 'budget' });
const explicitQuestion = await mem.recall({ text: 'mera wazan kya tha', purpose: 'ask' });
```

No `allowPrivate` boolean exists. The store and database apply the same purpose/tag filter; service code also refuses to return T2 without a purpose. Purpose-scoped query text is not sent to an embedding provider. T2 is never embedded.

Use tracking is ID/count only. Do not log memory text, user query, medicine name, money figure, purpose-specific result text or full prompt. A model gets only the matching rows for that task.

## Save and care

```ts
const w = await mem.remember({ text, kind, origin: 'chat'|'voice', actor: 'jarvis', explicit, about, subject_key, source, confirmed });
// w.verdict.verdict: save | ask | refuse | skip
// Direct T2 save: w.verdict.userMessage = 'Note kar liya (private).'
// Self-harm/abuse: always follow w.verdict.care; only a short generic summary can be saved on explicit remember.
```

A direct medicine timing save may return `reminder_request`. This is a typed S08 hand-off only; it is not proof that a reminder/notification was created. Amit selected a visible lock-screen label containing medicine name + time. If AM/PM is unclear, S08 must ask before scheduling.

## Forget / export

- `findToForget(text)` is called only after Amit asks to forget a subject. Show the matching row and require confirmation before `forget(id, true)`.
- User-requested export includes T2; keep the export behind the authenticated owner session. Do not send export contents to events/logs.
- `sab bhool jao` remains app-tap-only with exact count.

## Compaction

`compactSensitiveHistory()` is a guarded hook for a private S22/S13 job. It considers only T2 workout/weight fact/episode rows older than 365 days, excludes medicine/family/money/emotion/location/milestone rows, requires a valid summary first, then deletes only selected source IDs. It does nothing unless an approved private summarizer is injected and the kill switch is off. No scheduler or summarizer is connected by S09 yet.
