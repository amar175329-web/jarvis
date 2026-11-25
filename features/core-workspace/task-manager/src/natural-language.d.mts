export type NaturalParseResult =
  | { ok: false; code: string; title?: string; kind?: 'task' | 'reminder'; priority?: number }
  | { ok: true; status: 'needs_confirmation'; reason: string; title: string; kind: 'task' | 'reminder'; sensitive: boolean; priority: number; repeat_rule: string | null; date_text?: string | null; time_text?: string }
  | { ok: true; status: 'ready'; kind: 'task' | 'reminder'; title: string; sensitive: boolean; due_at: string; ends_at?: string; time_zone: string; priority: number; repeat_rule: string | null; date_text: string | null; parsed_by: 'deterministic-rules' };
export function parseNaturalLanguage(input: string, options?: { now?: Date | string | number; timeZone?: string }): NaturalParseResult;
export function getLocalDateParts(date: Date | string | number, timeZone?: string): { year: number; month: number; day: number; hour: number; minute: number; second: number };

export { classifySensitivity } from './sensitivity.mjs';
