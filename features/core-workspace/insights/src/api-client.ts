import { jarvisPost } from '../../task-manager/src/api-client';

export type InsightsOverview = {
  period_days: 7 | 30;
  tasks: { total: number; todo: number; doing: number; done: number; cancelled: number; overdue: number; completion_rate: number };
  activity: { total: number; successful: number; daily: Array<{ date: string; count: number }> };
  truncated: boolean;
  generated_at: string;
};
export const insightsApi = {
  overview: (period_days: 7 | 30 = 7, confirmed = false) =>
    jarvisPost<InsightsOverview>('/api/tasks/insights.overview', { period_days, confirmed }),
};
