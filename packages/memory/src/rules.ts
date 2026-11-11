// The numbers of the memory rules in ONE place. Human text: self/identity/memory-behaviour.md. Change a number here = bump manifest version + KNOWLEDGE change log.
import type { Kind } from './types.ts';

export const LIMITS = { titleChars: 200, bodyChars: 1000, episodeBodyChars: 2000, whyChars: 200, tags: 12, tagChars: 40, tokens: 64, subjectKeyChars: 80 } as const;
export const DAY = 86_400_000;
export const RETENTION_DAYS = {
  ephemeral: 14,        // "ek baar ki zaroorat"
  inferred: 90,         // andaza: mit jaata hai jab tak Amit dobara pakka na kare
  episode: 365,         // kaam ke episodes
  afterDueDate: 30,     // tarikh wali yaad: tarikh ke 30 din baad
  supersededKeep: 90,   // purani (badli hui) yaad itne din reh kar hard delete
  expiredGrace: 7,      // expire hone ke baad itne din baad purge job hard delete karta hai (search mein turant band)
  declineKeep: 180,     // "nahi" kaha hua candidate itne din dobara nahi poochha jaata
} as const;
// Recency: how fast a kind "gets old" for ranking only (never deleted because of this). 0 = never decays.
export const RECENCY_HALF_LIFE_DAYS: Record<Kind, number> = { profile: 0, preference: 0, person: 0, knowledge: 0, project: 120, routine: 180, fact: 240, episode: 45 };
// A remembered thing older than this (days since last update) is "old": JARVIS checks lightly ("ab bhi wahi hai na?")
export const STALE_AFTER_DAYS: Partial<Record<Kind, number>> = { routine: 180, fact: 365, project: 120, preference: 540 };

export const RANK = {
  withVector: { sim: 0.50, kw: 0.25, recency: 0.15, confidence: 0.10 },
  keywordOnly: { kw: 0.60, recency: 0.25, confidence: 0.15 },
  minSim: 0.50,           // vector-only hits below this are dropped (starting value; tune with the real model)
  candidatePool: 40,      // store returns this many, TS re-ranks and cuts
} as const;
export const RECALL = { maxItems: 8, maxChars: 3200, cardChars: 800, cardMaxItems: 8 } as const;

// Size alarms (REPORT + decision proposal 013): when ANY alarm fires, "ab bada store jodna chahiye".
export const GROWTH = {
  warn: { db_mb: 320, memories: 24_000, search_p95_ms: 400, pending_embeddings: 500 },
  alarm: { db_mb: 400, memories: 30_000, search_p95_ms: 700 },
  probesRequired: 3,      // p95 slow must be seen on 3 daily probes in a row before alarm
} as const;
export const EXPORT_PAGE = 500;
export const LIST_MAX_PAGE = 200;
