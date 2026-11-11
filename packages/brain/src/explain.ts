// Explainability: every action keeps a one-line why (table decisions). Amit can ask "tumne ye kyun kiya?".
export type DecisionRow = { id: string; trace_id?: string; power_id?: string; level: number | null; request: string; why: string; result: string; created_at: string };
export function requireWhy(why: string): string {
  const w = why.trim().replace(/\s+/g, ' ');
  if (!w) throw new Error('every decision needs a one-line why');
  return w.length > 200 ? w.slice(0, 197) + '...' : w;
}
export function explain(rows: DecisionRow[], q: { powerId?: string; contains?: string } = {}): string {
  const hit = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
    .find((r) => (!q.powerId || r.power_id === q.powerId) && (!q.contains || r.request.toLowerCase().includes(q.contains.toLowerCase())));
  if (!hit) return 'Mujhe iska koi record nahi mila.';
  const lv = hit.level == null ? '' : ` (L${hit.level})`;
  return `Maine "${hit.request}" par ${hit.power_id ?? 'jawab'} use kiya${lv}. Wajah: ${hit.why}. Natija: ${hit.result}.`;
}
