# CR-D2-NEWS-PLACEMENT — News without changing approved Home

Date: 2026-11-23
Owner: D2 / S06; approval: LEAD + S04/S00
Status: proposed only

## Recommendation: add News & Briefing inside the existing Insights destination

Do **not** put News back into `HomePage.tsx` and do not add a Home card. Mount the existing `features/home/news` feature as a dedicated `News & Briefing` section/tab under the existing Insights area (S04), preferably at route key `insights/news` while preserving the current Insights shell entry and visual hierarchy.

- Keep the existing Home screen and all approved cards unchanged.
- Use the current Insights navigation destination. Add a small local `News & Briefing` subsection/tab within that page, not a top-level Home tile.
- News items must remain public-web content only. The News DTO passed to any allowed cloud summarizer may contain only public article headline, snippet, canonical URL, source, and published date; never mix Amit's tasks, chats, files, activity, profile, or other owner data.
- The News page must remain useful without a model: show public headlines/snippets and links. If model gateway or pricing/routing is unavailable, do not call a hardcoded model; show the non-summary public feed / `abhi band` status.
- Use model-gateway + models router if and only if an optional cloud summary is requested/allowed. Do not send Amit-owned data in that call.

## Alternative if Insights route is not ready

Add `News & Briefing` as a child item under the existing More/sidebar navigation (S00-owned), not a Home card. Do not add a new global top-level section until LEAD agrees on route ownership.

## Acceptance criteria

1. `HomePage.tsx` remains byte-for-byte unchanged by the News mount.
2. News is reachable from Insights (preferred) or More/sidebar (fallback).
3. No private owner data is read, joined, or supplied to a cloud model.
4. Public-news-only fallback works if models are unavailable; no hardcoded model, provider, or price.
5. Mobile 390px layout has no horizontal overflow.

## Integration note from D1b Bundle 3 (added by LEAD, 2026-11-25)

D1b's Insights page already contains an empty labelled placeholder: `features/core-workspace/insights/ui/InsightsPage.tsx` with `data-integration-slot="CR_D2_NEWS_PLACEMENT"`. When D2's News & Briefing is accepted, mount it in that slot (or replace the placeholder with the `insights/news` tab above) while keeping the current S10 page wrapper and approved UI tokens. The slot must never be fed from private owner text, task notes, memory or activity details. D2 owns the provider/data source, refresh and privacy review; S10/D1b does not implement News or models. A separate D1b version of this CR was dropped in favour of this one during merge.
