import type { Trip } from "../trip/types";
import { addDaysToIso } from "../trip/date";

const BOOKING_KEYWORDS = [
  "booking",
  "reservation",
  "confirmation",
  "itinerary",
  "flight",
  "hotel",
  "hostel",
  "check-in",
  "check in",
  "ticket",
  "tour",
];

function gmailDate(value: string) {
  return value.replaceAll("-", "/");
}

export function tripImportDateRange(trip: Trip) {
  const dates = [
    trip.startDate,
    trip.endDate,
    ...trip.planner.items.flatMap((item) => [item.startDate, item.endDate ?? item.startDate]),
    ...trip.planner.customBases.flatMap((base) => [base.startDate, base.endDate ?? base.startDate]),
  ].filter((date): date is string => Boolean(date));

  if (dates.length === 0) return undefined;
  const sorted = [...dates].sort();
  return {
    startDate: addDaysToIso(sorted[0], -14),
    endDate: addDaysToIso(sorted.at(-1) ?? sorted[0], 14),
  };
}

export function tripImportPlaceTerms(trip: Trip) {
  const terms = new Set<string>();
  const add = (value?: string) => {
    const cleaned = value?.split(",")[0]?.trim();
    if (cleaned && cleaned.length >= 3) terms.add(cleaned);
  };

  for (const base of trip.planner.customBases) add(base.baseName);
  for (const item of trip.planner.items) {
    add(item.fromLabel);
    add(item.toLabel);
    add(item.baseName);
    add(item.placeLabel);
  }

  return [...terms].slice(0, 8);
}

export function buildGmailCandidateQueries(trip: Trip) {
  const dateRange = tripImportDateRange(trip);
  const dateFilter = dateRange
    ? ` after:${gmailDate(dateRange.startDate)} before:${gmailDate(addDaysToIso(dateRange.endDate, 1))}`
    : "";
  const keywordFilter = `(${BOOKING_KEYWORDS.map((keyword) => `"${keyword}"`).join(" OR ")})`;
  const placeTerms = tripImportPlaceTerms(trip);

  if (placeTerms.length === 0) {
    return [`${keywordFilter}${dateFilter}`.trim()];
  }

  return placeTerms.map((term) => `${keywordFilter} "${term}"${dateFilter}`.trim());
}

