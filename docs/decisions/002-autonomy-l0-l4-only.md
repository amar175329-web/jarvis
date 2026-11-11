# Autonomy = L0-L4 only
Status: Accepted (Amit)

Context: v11 mixed "risk" (low/medium/high) and autonomy levels.

Decision: manifest.json has only autonomy_default (L0..L4). There is no risk field. Dangerous powers are capped at L0-L2 by S22.

Consequences: Simpler for every squad. check fails if a manifest contains "risk".
