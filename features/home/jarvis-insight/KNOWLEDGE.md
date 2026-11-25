# jarvis-insight
STATUS: built
WHAT IT IS: Home JARVIS Insight card with a concise deterministic pattern summary and seven-day mini-bars.
WHAT IT CAN DO:
- (built) Aggregate allowlisted action metadata and non-sensitive task status/date metadata for the last seven days.
- (built) Produce fixed, non-personalized Hindi/Hinglish tips from counts only.
- (built) Exclude tasks whose title matches the shared sensitivity classifier or the feature local family/finance deny-list; never return task titles, activity detail or targets.
WHAT IT CANNOT DO / LIMITS:
- Cannot send Amit's data, private text, health, medicine, money, family, credentials or uncertain content to any cloud model.
- Does not call a local model (not running) or any model; suggestions are deterministic and explainable.
- Does not add a table, migration, API function or new dependency.
HOW IT WORKS: LEAD mounts the handler inside the existing shared API function with owner-scoped readers and `executePower`. The handler uses the shared S08 sensitivity classifier, aggregates only safe metadata and returns a small fixed DTO.
INPUTS / OUTPUTS: Input: bounded tasks (`title,notes,status,created_at,completed_at,updated_at`) and activity rows (`action,ts,actor,target,detail`) for server-only sensitivity checks. Raw task/activity text never enters the output. Output: 7 daily bars, safe counts, one fixed headline and tip. Existing tables: `tasks`, `activity_log`.
USES / USED BY: Uses `api.tasks` and `features.core-workspace.task-manager` shared sensitivity classifier; used by Home shell.
POWER LEVEL & CONFIRMATION: `home.jarvis-insight.read` starts L0, read-only; every read is behind `executePower`, audit why and fail-closed kill check.
EXAMPLES: “Pichhle 7 din mein 4 din activity rahi”; suggest one small pending task without naming it; hide a health-related task title from counts.
KNOWN ISSUES: Existing datasets may be too sparse for a meaningful pattern; card must show “Abhi enough data nahi hai” rather than fabricate trends.
CHANGE LOG:
- 2026-11-23 - P29 bundle (2) implemented feature-local UI, guarded handler and Node tests; no API/schema/app-shell edits - version 0.1.0.
- (append-only) 2026-11-23 - P29 Folder-First specification for local-only, metadata-based insights - version 0.0.2.
