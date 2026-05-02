import type { Trip } from "../trip/types";
import { addDaysToIso } from "../trip/date";

export const GMAIL_BOOKING_KEYWORDS = [
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

const DEFAULT_GMAIL_RECENCY_FILTER = "newer_than:18m";
const GENERIC_TRIP_NAME_TERMS = new Set([
  "trip",
  "travel",
  "vacation",
  "holiday",
  "planner",
  "plan",
  "test",
  "import",
]);

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
  const addTripNameTerms = (name?: string) => {
    for (const segment of (name ?? "").split(/[,&/|+-]/)) {
      const cleaned = segment
        .replace(/\b20\d{2}\b/g, "")
        .split(/\s+/)
        .filter((word) => {
          const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
          return normalized.length >= 3 && !GENERIC_TRIP_NAME_TERMS.has(normalized);
        })
        .join(" ")
        .trim();
      if (cleaned.length >= 3) terms.add(cleaned);
    }
  };

  addTripNameTerms(trip.name);
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
  const keywordFilter = `(${GMAIL_BOOKING_KEYWORDS.map((keyword) => `"${keyword}"`).join(" OR ")})`;
  const placeTerms = tripImportPlaceTerms(trip);
  // Gmail after:/before: filters search the email received date, not travel dates inside
  // confirmations. Use a broad recency filter so future bookings received before a trip
  // are still scanned, then let local scoring/extraction decide what is relevant.
  const recencyFilter = DEFAULT_GMAIL_RECENCY_FILTER;

  if (placeTerms.length === 0) {
    return [`${keywordFilter} ${recencyFilter}`.trim()];
  }

  return placeTerms.map((term) => `${keywordFilter} "${term}" ${recencyFilter}`.trim());
}
