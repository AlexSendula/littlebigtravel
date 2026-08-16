export const TBD_ARRIVAL_SORT_TIME = "00:00";
export const TBD_CHECK_IN_SORT_TIME = "15:00";
export const TBD_CHECK_OUT_SORT_TIME = "10:00";
export const TBD_DEPARTURE_SORT_TIME = "23:59";

export function normalizeTimeValue(time?: string) {
  if (!time || typeof time !== "string") return undefined;
  const trimmed = time.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function formatPlannerTime(startTime?: string, endTime?: string) {
  const normalizedStart = normalizeTimeValue(startTime);
  const normalizedEnd = normalizeTimeValue(endTime);
  if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd}`;
  return normalizedStart ?? normalizedEnd;
}

export function compareIsoDateTime(leftDate: string, leftTime: string | undefined, rightDate: string, rightTime: string | undefined) {
  const dateCompare = leftDate.localeCompare(rightDate);
  if (dateCompare !== 0) return dateCompare;
  const normalizedLeft = normalizeTimeValue(leftTime) ?? "23:59";
  const normalizedRight = normalizeTimeValue(rightTime) ?? "23:59";
  return normalizedLeft.localeCompare(normalizedRight);
}
