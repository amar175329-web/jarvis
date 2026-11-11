# API routes = /api/<group>/<action>
Status: Accepted (LEAD)

Context: Squads are temporary, groups (customize, core-workspace, bots, ...) are permanent.

Decision: Routes look like /api/customize/skills.list. Events use dot.case (task.created).

Consequences: MASTER_CONTEXT was updated to match.
