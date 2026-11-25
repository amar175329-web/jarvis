export type NotificationView = { id: string; title: string; createdAt: string; unread: boolean };
export function notificationLabel(type: unknown): string | null;
export function projectNotification(row: unknown, readThrough?: string | null): NotificationView | null;
export function readThroughFromSetting(value: unknown): string | null;
export function latestEventTime(rows: unknown[]): string | null;
export const NOTIFICATION_EVENT_TYPES: readonly string[];
