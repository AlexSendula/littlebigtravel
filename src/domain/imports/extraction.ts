import type { ExtractionEngine, ImportCandidate, ImportProviderTripContext, ImportSource } from "./types";

const TRANSPORT_KEYWORDS = /\b(flight|airline|boarding|itinerary|ticket|train|bus|taxi|transfer|transport)\b/i;
const STAY_KEYWORDS = /\b(hotel|hostel|apartment|booking|reservation|check[-\s]?in|check[-\s]?out|accommodation|stay)\b/i;
const ACTIVITY_KEYWORDS = /\b(activity|tour|hike|museum|ticket|experience|excursion)\b/i;

const FIELD_ALIASES: Record<string, string[]> = {
  from: ["from", "origin", "departure place", "depart from"],
  to: ["to", "destination", "arrival place", "arrive at"],
  depart: ["depart", "departure", "departure date", "departure time"],
  arrive: ["arrive", "arrival", "arrival date", "arrival time"],
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

function normalizeDate(raw?: string) {
  if (!raw) return undefined;
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  return undefined;
}

function normalizeTime(raw?: string) {
  if (!raw) return undefined;
  const match = raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!match) return undefined;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
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

function extractTransportCandidate(source: ImportSource, text: string): ImportCandidate | undefined {
  if (!TRANSPORT_KEYWORDS.test(text)) return undefined;
  const fromLabel = findField(text, "from");
  const toLabel = findField(text, "to");
  const departRaw = findField(text, "depart");
  const arriveRaw = findField(text, "arrive");
  const startDate = normalizeDate(departRaw);
  const endDate = normalizeDate(arriveRaw) ?? startDate;
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

function extractStayCandidate(source: ImportSource, text: string): ImportCandidate | undefined {
  if (!STAY_KEYWORDS.test(text)) return undefined;
  const placeLabel = findField(text, "stay");
  const checkInRaw = findField(text, "checkIn");
  const checkOutRaw = findField(text, "checkOut");
  const startDate = normalizeDate(checkInRaw);
  const endDate = normalizeDate(checkOutRaw) ?? startDate;
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

function extractActivityCandidate(source: ImportSource, text: string): ImportCandidate | undefined {
  if (!ACTIVITY_KEYWORDS.test(text)) return undefined;
  const placeLabel = findField(text, "activity") ?? findField(text, "stay");
  const dateRaw = findField(text, "depart") ?? findField(text, "checkIn");
  const startDate = normalizeDate(dateRaw);
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
  if (/\b20\d{2}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/20\d{2}\b/.test(text)) score += 0.18;
  return Math.min(1, score);
}

export const deterministicExtractionEngine: ExtractionEngine = {
  id: "deterministic-v1",
  extractCandidates(source: ImportSource, _context: ImportProviderTripContext) {
    if (scoreImportSource(source) < 0.45) return [];
    const text = sourceText(source);
    return [extractTransportCandidate(source, text), extractStayCandidate(source, text), extractActivityCandidate(source, text)].filter(
      (candidate): candidate is ImportCandidate => Boolean(candidate),
    );
  },
};

