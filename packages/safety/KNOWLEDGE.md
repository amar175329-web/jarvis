# safety
STATUS: built
WHAT IT IS: JARVIS का fail-closed safety gate. यह kill-switch state पढ़ता है और तय करता है कि owner/device क्या कर सकते हैं।
WHAT IT CAN DO:
- `readKillSwitch(store, ownerId)` असली state न मिले, malformed हो या DB पढ़ न पाए तो `{kill:true, epoch:-1}` वाला unavailable परिणाम देता है।
- `setKillSwitch(...)` paired device को केवल ON करने देता है; OFF केवल owner कर सकता है। OFF से पहले state सफलतापूर्वक पढ़ी जानी चाहिए।
- Write failure या invalid response को कभी OFF success नहीं बताता। Server API audit सहित atomic DB RPC बुलाती है।
- Tests owner ON/OFF, device ON, device OFF denial, missing row, read/write outage और fail-closed result जाँचते हैं।
WHAT IT CANNOT DO / LIMITS:
- यह अकेले Supabase नहीं बुलाता; store adapter caller देता है।
- कोई privileged action खुद execute नहीं करता; action routes/worker अलग safety checks करेंगे।
- Database audit और atomic update के लिए migration `0005_event_rate_limits.sql` आवश्यक है; यह bundle इसे real Supabase पर apply नहीं करता।
HOW IT WORKS: `src/index.ts` caller के role की जाँच करता है; `readKillFailClosed` shared helper से state पढ़ता है। Device OFF को write से पहले रोकता है। Owner OFF से पहले current row पढ़ता है। API adapter migration 0005 के `set_system_kill` RPC से state और audit एक transaction में लिखता है।
INPUTS / OUTPUTS: In: `KillSwitchStore`, owner ID, `KillActor`, desired boolean। Out: typed success या forbidden/unavailable fail-closed result। Test: `npm test`।
USES / USED BY: Uses `packages.shared`; used by `api/system`, future worker and phone/API guards.
POWER LEVEL & CONFIRMATION: L0. OFF के लिए owner identity और explicit API request आवश्यक; device capability केवल ON.
EXAMPLES: Device request `{kill:false}` -> 403; DB read timeout -> 503 और UI में Safety blocked/ON.
KNOWN ISSUES: Native Android UI/storage adapter अलग S16A responsibility है; current app-side web control and device-token API are implemented here.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S00.
- 2026-11-07 - Fail-closed reader/writer, owner/device capability rules and 6 unit tests added; planned -> built - 0.1.0
