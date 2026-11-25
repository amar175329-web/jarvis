# news
STATUS: built
WHAT IT IS: Home News card for public headlines from configured allowlisted sources.
WHAT IT CAN DO:
- (built) Read up to 6 normalized public news items from a server-side allowlisted feed adapter.
- (built) Strip markup and return only source, title, short description, publication time and safe HTTPS URL.
- (built) Optionally summarize public news only through `packages/models` router and `packages/model-gateway`; disabled (abhi band) when the shared router/gateway, budget, or power adapter is unavailable.
WHAT IT CANNOT DO / LIMITS:
- Amit's tasks, activity, memory, chats, settings, profile or any other owner data must never be passed to a cloud model or public feed provider.
- News content is untrusted data; it cannot trigger tools, browser actions, commands or power changes.
- Does not add a news API function, new dependency, database table or migration.
HOW IT WORKS: LEAD mounts the plain handler in the shared API function. It calls a public-only feed adapter without passing ownerId/session context, validates HTTPS source hosts, then optionally calls an injected summarizer wired exclusively to `routeModel`/`runChain` and model-gateway with only public feed DTOs.
INPUTS / OUTPUTS: Input: empty request or `{summary:boolean}`; output: max 6 public `NewsItem` DTOs plus optional bounded public summary. No owner data is an input.
USES / USED BY: Uses `api.tasks`, `packages.models` and `packages.model-gateway`; used by Home shell after LEAD approves a display placement.
POWER LEVEL & CONFIRMATION: `home.news.read` starts L0; optional `home.news.summarize` requires explicit confirmation and a registered L2 power. Cloud summarization is separately gated and budgeted; kill switch, registry, gateway and model-router failures are fail-closed (headlines may still display without summary).
EXAMPLES: Show public headlines; hide unsafe/non-HTTPS/out-of-allowlist URLs; summarize only public story titles/snippets after the summary power is enabled.
KNOWN ISSUES: Current approved `HomePage.tsx` has no News card slot. Component is built independently; S00/LEAD must approve where it mounts before Antigravity adds it to the shell.
CHANGE LOG:
- 2026-11-23 - P29 bundle (2) implemented feature-local UI, guarded handler and Node tests; no API/schema/app-shell edits - version 0.1.0.
- (append-only) 2026-11-23 - P29 Folder-First specification for public-only news and optional routed summary - version 0.0.2.
