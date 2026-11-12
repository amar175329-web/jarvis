# Memory friend tiers & relationship boundaries
Status: Accepted (Amit / LEAD, 2026-11-11)

Context: In JARVIS, Amit is the primary owner and friend. People mentioned in Amit's life have different degrees of closeness and trust (stranger, acquaintance, colleague, friend, inner_circle, family). Memory retention, automatic recall, and cross-person context boundaries must respect relationship tiers to prevent accidental exposure, inappropriate assumptions, or context bleed.

Decision:
1. **Relationship Tiers**:
   - `stranger`: No proactive recall. Inferred memories forbidden. Only explicit facts saved if Amit directs.
   - `acquaintance` / `colleague`: Professional facts only (workplace, project role, explicit public contact info). Inferred confidence capped at 0.5.
   - `friend`: Casual context, preferences, shared episodes, birthdays. Inferred confidence up to 0.7.
   - `inner_circle`: High-trust personal friends. Contextual check-ins allowed; sensitive preferences permitted with confirmation.
   - `family`: Deep relationship context. Default `private: true` for any sensitive or conflict-related mentions.

2. **Cross-Person Isolation**:
   - Memories about other people (`subject: 'other'`) are strictly partitioned.
   - Context about Person A is never recalled into conversations or tasks involving Person B unless explicitly authorized via `data.share-personal` (L2 power).

3. **Invariable Privacy Constraints**:
   - Section 3 of `memory-behaviour.md` (NEVER store financials, health, abuse, minor data, secrets, OTPs) holds across all tiers unconditionally.
   - A higher tier never bypasses safety refusals or redaction rules.

4. **Implementation**:
   - Tiers are recorded on `person` kind memories via `tags` (`tier:friend`, etc.) and mapped in `memory_links`.
   - Retention and recall filtering in `packages/memory` enforce tier thresholds before memories enter prompt context.
