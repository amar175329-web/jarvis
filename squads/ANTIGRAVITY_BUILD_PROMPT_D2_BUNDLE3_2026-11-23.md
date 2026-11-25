# Antigravity Build Prompt — D2 Shell Bundle (3)

Use `jarvis-repo-P31-D2-bundle3.zip` as the reviewed D2 working tree or apply `JARVIS_D2_BUNDLE3_P31.patch` to the exact P31 baseline. Preserve every unrelated P31 change.

1. Read `squads/CR_D2_SHELL_BUNDLE3_2026-11-23.md` and `squads/CR_D2_NEWS_PLACEMENT_2026-11-23.md` first. Implement only the accepted CRs.
2. Do not overwrite the feature files; mount the eight local components at the exact slots described in the CR. Never redesign approved Home/Sidebar spacing, tokens, typography, or icons. Do not edit `HomePage.tsx`.
3. Extend only existing routes/functions: mount notifications/settings/devices in `api/tasks/index.ts`; mount `system.power-off` through existing `api/system/index.ts` / existing kill.set route. Add the three approved rewrites to existing `vercel.json` only after LEAD accepts. Do not add any `api/` file or Vercel function.
4. Preserve owner auth + RLS: server modules receive owner bearer + Supabase anon key. Never put service-role secrets in app code. Keep no-store responses, rotated-cookie behaviour, and metadata-only DTOs.
5. Notifications are read + unread only. Do not create, schedule, poll, enqueue, or fire reminders; D1a owns all reminder firing.
6. Pairing remains unavailable until S17 provides its separate accepted pairing contract and S22 power. Keep its CTA disabled.
7. For PowerOff, keep state blocked until existing `kill.get` verifies a valid `{kill:false,epoch}`. Wire `kill:true` to `system.power-off` through S22 and `executePower`; require owner session, explicit `confirm:true`, a one-line why audit, and persisted-state verification. No automatic `kill:false` on boot, refresh, deploy, reconnect, or worker recovery. Require explicit manual owner confirmation for the existing recovery/kill-off path; never let an agent or model re-arm the system.
8. Route page destinations for Settings and Connect; mount ProfileStatus using `/api/auth/session.get` user plus the sanitized devices projection. Search must remain local curated navigation only.
9. Boot: replace old Boot with BootSequence, not both. Respect reduced motion.
10. For News, follow the separate CR: Insights > News & Briefing preferred; More/sidebar fallback. Home remains untouched. Optional cloud summary receives public-news DTOs only through model-gateway/models router; no Amit data or hardcoded provider/model/price.
11. Regenerate `self/registry/*.json` using the repo registration script; do not commit generated registry JSON in the D2 patch. Keep manifests and KNOWLEDGE files consistent.
12. Run all existing repository tests plus the new D2 Node suite. Run `npm ci`, app TypeScript/Vite build, available Zod/PGlite checks and a 390px browser overflow test in the integrated environment. Report every test not run; never mark an unrun check PASS.
