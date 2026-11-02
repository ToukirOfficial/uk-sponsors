import type { RegisterMeta } from "./store.js";

export const STALE_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function ageInDays(meta: RegisterMeta, now: Date): number {
  return Math.floor((now.getTime() - new Date(meta.downloadedAt).getTime()) / DAY_MS);
}

/** "2 November 2026", or "an unknown date". */
export function formatRegisterDate(date: string | null): string {
  if (!date) return "an unknown date";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A one-line reminder if the local data is over a week old, otherwise null. */
export function staleReminder(meta: RegisterMeta, now: Date): string | null {
  const days = ageInDays(meta, now);
  if (days <= STALE_AFTER_DAYS) return null;
  return `Note: your sponsor data is ${days} days old (register dated ${formatRegisterDate(meta.registerDate)}). Run "uk-sponsors update" for the latest.`;
}
