import type { ExtractionEngine, ImportCandidate, ImportProviderTripContext, ImportSource } from "./types";

const TRANSPORT_KEYWORDS = /\b(flight|airline|boarding|itinerary|ticket|train|bus|taxi|transfer|transport)\b/i;
const STAY_KEYWORDS = /\b(hotel|hostel|apartment|booking|reservation|check[-\s]?in|check[-\s]?out|accommodation|stay)\b/i;
const ACTIVITY_KEYWORDS = /\b(activity|tour|hike|museum|ticket|experience|excursion)\b/i;

const FIELD_ALIASES: Record<string, string[]> = {
  from: ["from", "origin", "departure place", "depart from", "leaving from"],
  to: ["to", "destination", "arrival place", "arrive at", "arriving in"],
  depart: ["depart", "departs", "departing", "departure", "departure date", "departure time", "outbound", "take off"],
  arrive: ["arrive", "arrives", "arriving", "arrival", "arrival date", "arrival time", "landing"],
  stay: ["stay", "hotel", "hostel", "apartment", "property", "accommodation", "place"],
  checkIn: ["check-in", "check in", "checkin"],
  checkOut: ["check-out", "check out", "checkout"],
  activity: ["activity", "tour", "event", "experience"],
  city: ["city", "base", "destination city"],
};

function sourceText(source: ImportSource) {
  return [source.subject, source.snippet, source.bodyText].filter(Boolean).join("\n");
}

function cleanFieldValue(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s:-]+/, "")
    .replace(/[.;,\s]+$/, "")
    .trim();
}

function findField(text: string, field: keyof typeof FIELD_ALIASES) {
  const aliases = FIELD_ALIASES[field];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.match(new RegExp(`^\\s*${escaped}\\s*[:\\-]\\s*(.+)$`, "i"));
      if (match?.[1]) return cleanFieldValue(match[1]);
    }
  }
  return undefined;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

function inferredYearForMonth(context: ImportProviderTripContext, month: string) {
  const start = context.trip.startDate;
  const end = context.trip.endDate;
  if (!start) return undefined;
  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  const endYear = end ? Number(end.slice(0, 4)) : startYear;
  if (!Number.isFinite(startYear)) return undefined;
  if (Number.isFinite(endYear) && endYear > startYear && Number(month) < startMonth) return String(endYear);
  return String(startYear);
}

function normalizeDate(raw?: string, context?: ImportProviderTripContext) {
  if (!raw) return undefined;
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  const dayMonth = raw.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\.?\\s*,?\\s*(20\\d{2})?\\b`, "i"));
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].toLowerCase()];
    const year = dayMonth[3] ?? (context ? inferredYearForMonth(context, month) : undefined);
    if (month && year) return `${year}-${month}-${dayMonth[1].padStart(2, "0")}`;
  }
  const monthDay = raw.match(new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(20\\d{2})?\\b`, "i"));
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    const year = monthDay[3] ?? (context ? inferredYearForMonth(context, month) : undefined);
    if (month && year) return `${year}-${month}-${monthDay[2].padStart(2, "0")}`;
  }
  return undefined;
}

function normalizeTime(raw?: string) {
  if (!raw) return undefined;
  const match = raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*([ap]\.?m\.?)?\b/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function noteForSource(source: ImportSource) {
  return `Imported from Gmail: ${source.subject}`;
}

function candidateId(source: ImportSource, kind: string) {
  return `${source.provider}:${source.messageId}:${kind}`;
}

function transportModeForText(text: string) {
  if (/\bflight|airline|boarding\b/i.test(text)) return "flight";
  if (/\btrain\b/i.test(text)) return "train";
  if (/\bbus\b/i.test(text)) return "bus";
  if (/\btaxi|transfer\b/i.test(text)) return "taxi";
  return "other";
}

function textLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => cleanFieldValue(line))
    .filter(Boolean);
}

function cleanRouteLabel(value: string) {
  return cleanFieldValue(value)
    .replace(/\s*\(([A-Z0-9]{2,5})\)\s*/g, " ")
    .replace(/\b(?:is|has been|was|will be|confirmed|booked|scheduled)\b.*$/i, "")
    .replace(/\b(?:depart(?:s|ure|ing)?|arriv(?:e|es|al|ing)|flight|ticket|booking)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[.;,\s]+$/, "")
    .trim();
}

function findRouteLabels(text: string) {
  const fromField = findField(text, "from");
  const toField = findField(text, "to");
  if (fromField && toField) return { fromLabel: cleanRouteLabel(fromField), toLabel: cleanRouteLabel(toField) };

  const lines = textLines(text);
  for (const line of lines) {
    if (/\([A-Z0-9]{2,5}\)/.test(line) || /^(route|itinerary|trip|journey)\b/i.test(line)) {
      const route = line.match(/^(.+?)\s+(?:to|→)\s+(.+)$/i);
      if (route?.[1] && route[2]) {
        return { fromLabel: cleanRouteLabel(route[1]), toLabel: cleanRouteLabel(route[2]) };
      }
    }
  }

  for (const line of lines) {
    const fromTo = line.match(/\bfrom\s+(.+?)\s+(?:to|→)\s+(.+?)(?:$|[.;])/i);
    if (fromTo?.[1] && fromTo[2]) {
      return { fromLabel: cleanRouteLabel(fromTo[1]), toLabel: cleanRouteLabel(fromTo[2]) };
    }
  }

  return { fromLabel: fromField ? cleanRouteLabel(fromField) : undefined, toLabel: toField ? cleanRouteLabel(toField) : undefined };
}

function findLineForAliases(text: string, field: "depart" | "arrive") {
  const aliases = FIELD_ALIASES[field];
  return textLines(text).find((line) => {
    if (!aliases.some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line))) return false;
    return Boolean(normalizeTime(line) || normalizeDate(line));
  });
}

function dateLikeLines(text: string, context: ImportProviderTripContext) {
  return textLines(text).filter((line) => Boolean(normalizeDate(line, context) || normalizeTime(line)));
}

function extractTransportCandidate(source: ImportSource, text: string, context: ImportProviderTripContext): ImportCandidate | undefined {
  if (!TRANSPORT_KEYWORDS.test(text)) return undefined;
  const { fromLabel, toLabel } = findRouteLabels(text);
  const dateLines = dateLikeLines(text, context);
  const departRaw = findField(text, "depart") ?? findLineForAliases(text, "depart") ?? dateLines[0];
  const arriveRaw = findField(text, "arrive") ?? findLineForAliases(text, "arrive") ?? dateLines.find((line) => line !== departRaw);
  const startDate = normalizeDate(departRaw, context);
  const endDate = normalizeDate(arriveRaw, context) ?? startDate;
  if (!fromLabel || !toLabel || !startDate) return undefined;
  const transportMode = transportModeForText(text);
  const confidence = transportMode === "flight" && endDate ? 0.94 : 0.88;
  return {
    id: candidateId(source, "starting-travel"),
    provider: source.provider,
    sourceId: source.id,
    kind: "startingTravel",
    confidence,
    title: `${fromLabel} to ${toLabel}`,
    startDate,
    endDate,
    startTime: normalizeTime(departRaw),
    endTime: normalizeTime(arriveRaw),
    fromLabel,
    toLabel,
    transportMode,
    note: noteForSource(source),
  };
}

function extractStayCandidate(source: ImportSource, text: string, context: ImportProviderTripContext): ImportCandidate | undefined {
  if (!STAY_KEYWORDS.test(text)) return undefined;
  const placeLabel = findField(text, "stay");
  const checkInRaw = findField(text, "checkIn");
  const checkOutRaw = findField(text, "checkOut");
  const startDate = normalizeDate(checkInRaw, context);
  const endDate = normalizeDate(checkOutRaw, context) ?? startDate;
  if (!placeLabel || !startDate) return undefined;
  const baseLabel = findField(text, "city");
  const stayType = /\bhostel\b/i.test(text) ? "hostel" : /\bhotel\b/i.test(text) ? "hotel" : "apartment";
  return {
    id: candidateId(source, "stay"),
    provider: source.provider,
    sourceId: source.id,
    kind: "stay",
    confidence: endDate ? 0.92 : 0.86,
    title: placeLabel,
    startDate,
    endDate,
    startTime: normalizeTime(checkInRaw),
    endTime: normalizeTime(checkOutRaw),
    placeLabel,
    placeAddress: placeLabel,
    baseLabel,
    stayType,
    note: noteForSource(source),
  };
}

function extractActivityCandidate(source: ImportSource, text: string, context: ImportProviderTripContext): ImportCandidate | undefined {
  if (!ACTIVITY_KEYWORDS.test(text)) return undefined;
  const placeLabel = findField(text, "activity") ?? findField(text, "stay");
  const dateRaw = findField(text, "depart") ?? findField(text, "checkIn");
  const startDate = normalizeDate(dateRaw, context);
  if (!placeLabel || !startDate) return undefined;
  return {
    id: candidateId(source, "activity"),
    provider: source.provider,
    sourceId: source.id,
    kind: "activity",
    confidence: 0.78,
    title: placeLabel,
    startDate,
    startTime: normalizeTime(dateRaw),
    placeLabel,
    placeAddress: placeLabel,
    note: noteForSource(source),
  };
}

export function scoreImportSource(source: ImportSource) {
  const text = sourceText(source);
  let score = 0;
  if (TRANSPORT_KEYWORDS.test(text)) score += 0.42;
  if (STAY_KEYWORDS.test(text)) score += 0.36;
  if (ACTIVITY_KEYWORDS.test(text)) score += 0.2;
  if (/\bconfirm(ed|ation)?|reservation|booking|itinerary|ticket\b/i.test(text)) score += 0.25;
  if (new RegExp(`\\b20\\d{2}-\\d{1,2}-\\d{1,2}\\b|\\b\\d{1,2}/\\d{1,2}/20\\d{2}\\b|\\b\\d{1,2}\\s+(${MONTH_PATTERN})\\b|\\b(${MONTH_PATTERN})\\.?\\s+\\d{1,2}\\b`, "i").test(text)) score += 0.18;
  return Math.min(1, score);
}

export const deterministicExtractionEngine: ExtractionEngine = {
  id: "deterministic-v1",
  extractCandidates(source: ImportSource, context: ImportProviderTripContext) {
    if (scoreImportSource(source) < 0.45) return [];
    const text = sourceText(source);
    return [extractTransportCandidate(source, text, context), extractStayCandidate(source, text, context), extractActivityCandidate(source, text, context)].filter(
      (candidate): candidate is ImportCandidate => Boolean(candidate),
    );
  },
};
