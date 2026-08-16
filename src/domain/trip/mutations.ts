import type { PlannerItem } from "./types";

export function createPlannerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `manual:${crypto.randomUUID()}`;
  }
  return `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function slugifyBaseCity(baseCity: string) {
  return baseCity
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nextDayOrder(items: PlannerItem[], baseId: string, dayIso: string) {
  const maxOrder = items
    .filter((item) => item.baseId === baseId && item.startDate === dayIso)
    .reduce((best, item) => Math.max(best, item.order), -100);
  return maxOrder + 100;
}
