# CR-S10-S00-SHELL-MOUNT — Insights and Boards tabs

**Owner:** S00
**Raised by:** D1b / S10

Please wire the existing inert Insights and Boards sidebar rows using the approved page/shell pattern. S10 deliberately did not modify `app/src`, so this is a separate shell-owned change.

Requested exact changes:
1. Extend `app/src/types.ts` `Page` union with `insights` and `boards`.
2. In `app/src/components/Sidebar.tsx`, convert existing Insights and Boards `<div className="nav-item ...">` rows to buttons using the same `page === 'insights'/'boards'` active class and `onNav('insights'/'boards')`. Preserve icons `#i-nins` and `#i-nboard`, tokens, spacing and order.
3. In `app/src/App.tsx`, import `InsightsPage` from `../../features/core-workspace/insights/ui/InsightsPage` and `BoardsPage` from `../../features/core-workspace/boards/ui/BoardsPage`, then mount `{page === 'insights' && <InsightsPage />}` and `{page === 'boards' && <BoardsPage />}` beside the existing Today/Tasks pages.
4. Do not redesign the sidebar/cards or edit `vercel.json`. Keep the mobile layout at 390px free of horizontal page overflow.

The S10 page components own their feature UI; S00 owns navigation and page selection.
