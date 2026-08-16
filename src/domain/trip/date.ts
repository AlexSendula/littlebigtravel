const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function parseIsoDate(isoDate?: string) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function isoToUtcMs(isoDate?: string) {
  const parsed = parseIsoDate(isoDate);
  return parsed ? parsed.getTime() : Number.NaN;
}

export function isoFromUtcMs(utcMs: number) {
  const date = new Date(utcMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addDaysToIso(isoDate: string, days: number) {
  const baseMs = isoToUtcMs(isoDate);
  if (!Number.isFinite(baseMs)) return isoDate;
  return isoFromUtcMs(baseMs + days * 24 * 60 * 60 * 1000);
}

export function normalizeDateRange(startDate: string, endDate?: string) {
  if (!endDate) return { startDate, endDate: undefined };
  return endDate >= startDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

export function coerceDateRange(startDate: string, endDate?: string) {
  return normalizeDateRange(startDate, endDate);
}

export function formatIsoDate(isoDate: string) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;
  return `${parsed.getUTCDate()} ${MONTH_LABELS[parsed.getUTCMonth()]}`;
}

export function formatPlannerItemDate(startDate: string, endDate?: string) {
  if (!endDate || endDate === startDate) return formatIsoDate(startDate);
  return `${formatIsoDate(startDate)} - ${formatIsoDate(endDate)}`;
}

export function dateRange(startDate?: string, endDate?: string) {
  if (!startDate) return [];
  const startMs = isoToUtcMs(startDate);
  if (!Number.isFinite(startMs)) return [];
  const endMsRaw = endDate ? isoToUtcMs(endDate) : startMs;
  const endMs = Number.isFinite(endMsRaw) ? endMsRaw : startMs;
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  const days: string[] = [];
  for (let point = from; point <= to; point += 24 * 60 * 60 * 1000) {
    days.push(isoFromUtcMs(point));
  }
  return days;
}
