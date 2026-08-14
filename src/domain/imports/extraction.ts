import type { ExtractionEngine, ImportCandidate, ImportProviderTripContext, ImportSource } from "./types";

const TRANSPORT_KEYWORDS = /\b(flights?|airlines?|boarding|itinerar(?:y|ies)|tickets?|trains?|buses?|taxi|taxis|transfers?|transport)\b/i;
const STAY_KEYWORDS = /\b(hotel|hostel|apartment|booking|reservation|check[-\s]?in|check[-\s]?out|accommodation|stay)\b/i;
const ACTIVITY_KEYWORDS = /\b(activity|tour|hike|museum|ticket|experience|excursion)\b/i;
const NEGATIVE_SOURCE_KEYWORDS =
  /\b(newsletter|discount|promo|promotion|sale|coupon|deal|account confirmation|verify your account|password|receipt(?:s)? of your purchase|published programs?|customi[sz]ed quote|not modifiable|reservation executive|municipal regulations|terms and conditions)\b/i;
const RECEIPT_ONLY_KEYWORDS = /\b(receipt|invoice|payment received|purchase receipt)\b/i;
const BOOKING_REFERENCE_PATTERN =
  /\b(?:booking|reservation|confirmation|reference|booking code|booking number|reservation number|confirmation number)\s*(?:#|no\.?|number|code|id)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i;

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
  const attachmentText = source.attachmentTexts
    ?.filter((attachment) => attachment.status === "extracted" && attachment.text)
    .map((attachment) => [`Attachment: ${attachment.name}`, attachment.text].join("\n"))
    .join("\n\n");
  return [source.subject, source.snippet, source.bodyText, attachmentText].filter(Boolean).join("\n");
}

function cleanFieldValue(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s:-]+/, "")
    .replace(/[.;,\s]+$/, "")
    .trim();
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hasSentencePunctuation(value: string) {
  return /[.!?]\s+[A-Z0-9]/.test(value);
}

function isUsableLabel(value?: string) {
  if (!value) return false;
  const cleaned = compactWhitespace(value);
  if (cleaned.length < 2 || cleaned.length > 120) return false;
  if (hasSentencePunctuation(cleaned)) return false;
  if (/\b(?:published|modifiable|municipal regulations|customi[sz]ed quote|please contact|does not provide)\b/i.test(cleaned)) return false;
  return true;
}

function cleanTitle(value: string) {
  return compactWhitespace(value)
    .replace(/[.;,\s]+$/, "")
    .slice(0, 90)
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

function normalizeYear(raw?: string) {
  if (!raw) return undefined;
  if (raw.length === 2) return `20${raw}`;
  return raw;
}

function dateMatchesFromText(raw?: string, context?: ImportProviderTripContext) {
  if (!raw) return [];
  const matches: Array<{ index: number; date: string }> = [];

  for (const match of raw.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    if (match.index === undefined) continue;
    matches.push({ index: match.index, date: `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` });
  }

  for (const match of raw.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/g)) {
    if (match.index === undefined) continue;
    const year = normalizeYear(match[3]);
    if (year) matches.push({ index: match.index, date: `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` });
  }

  const dayMonthPattern = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\.?\\s*,?\\s*(20\\d{2})?\\b`, "gi");
  for (const match of raw.matchAll(dayMonthPattern)) {
    if (match.index === undefined) continue;
    const month = MONTHS[match[2].toLowerCase()];
    const year = match[3] ?? (context ? inferredYearForMonth(context, month) : undefined);
    if (month && year) matches.push({ index: match.index, date: `${year}-${month}-${match[1].padStart(2, "0")}` });
  }

  const monthDayPattern = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(20\\d{2})?\\b`, "gi");
  for (const match of raw.matchAll(monthDayPattern)) {
    if (match.index === undefined) continue;
    const month = MONTHS[match[1].toLowerCase()];
    const year = match[3] ?? (context ? inferredYearForMonth(context, month) : undefined);
    if (month && year) matches.push({ index: match.index, date: `${year}-${month}-${match[2].padStart(2, "0")}` });
  }

  const seen = new Set<string>();
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((match) => {
      const key = `${match.index}:${match.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((match) => match.date);
}

function normalizeDate(raw?: string, context?: ImportProviderTripContext) {
  return dateMatchesFromText(raw, context)[0];
}

function normalizeLastDate(raw?: string, context?: ImportProviderTripContext) {
  const dates = dateMatchesFromText(raw, context);
  return dates.at(-1);
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

function extractBookingReference(text: string) {
  const match = text.match(BOOKING_REFERENCE_PATTERN);
  return match?.[1]?.replace(/-+$/, "").toUpperCase();
}

function hasRouteEvidence(text: string) {
  if (findField(text, "from") && findField(text, "to") && (findField(text, "depart") || findLineForAliases(text, "depart"))) return true;
  return textLines(text).some((line) => Boolean(routeFromLine(line))) && Boolean(findLineForAliases(text, "depart") || findLineForAliases(text, "arrive"));
}

function hasStayEvidence(text: string) {
  return Boolean(findField(text, "stay") && (findField(text, "checkIn") || findField(text, "checkOut")));
}

function hasActivityEvidence(text: string, context: ImportProviderTripContext) {
  return Boolean((findField(text, "activity") || /\b(ticket|tour|hike|excursion|museum|experience)\b/i.test(text)) && dateLikeLines(textLines(text), context).length > 0);
}

function hasDatedBookingEvidence(text: string) {
  const positiveKeyword = /\b(flights?|boarding|itinerar(?:y|ies)|tickets?|hotel|hostel|apartment|reservation|booking|confirmation|check[-\s]?in|check[-\s]?out|tour|hike|excursion)\b/i.test(
    text,
  );
  const dateEvidence =
    /\b20\d{2}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/(?:\d{2}|20\d{2})\b/i.test(text) ||
    new RegExp(`\\b\\d{1,2}\\s+(${MONTH_PATTERN})\\b|\\b(${MONTH_PATTERN})\\.?\\s+\\d{1,2}\\b`, "i").test(text);
  return Boolean(extractBookingReference(text) && positiveKeyword && dateEvidence);
}

function sourceLooksInformationalOnly(text: string, context: ImportProviderTripContext) {
  if (!NEGATIVE_SOURCE_KEYWORDS.test(text)) return false;
  if (hasDatedBookingEvidence(text)) return false;
  return !hasRouteEvidence(text) && !hasStayEvidence(text) && !hasActivityEvidence(text, context);
}

function hasStrongImportEvidence(text: string) {
  const hasRoute = Boolean((findField(text, "from") && findField(text, "to")) || textLines(text).some((line) => Boolean(routeFromLine(line))));
  const hasStay = Boolean(findField(text, "stay") && (findField(text, "checkIn") || findField(text, "checkOut")));
  return hasRoute || hasStay || hasDatedBookingEvidence(text);
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

function indexedTextLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ index, text: cleanFieldValue(line) }))
    .filter((line) => line.text.length > 0);
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

function routeFromLine(line: string) {
  const routePrefixPattern = "(?:route|itinerary|trip|journey|flight|segment|leg|outbound|inbound|return)(?:\\s+flight)?";
  const routePrefix = new RegExp(`^${routePrefixPattern}\\s*[:#-]\\s*`, "i");
  const hasPrefix = routePrefix.test(line);
  const hasCode = /\([A-Z0-9]{2,5}\)/.test(line);
  const hasArrow = /→/.test(line);
  const normalized = line.replace(routePrefix, "");
  const route = normalized.match(/^(.+?)\s+(?:to|→|[-–—])\s+(.+)$/i);
  if (!route?.[1] || !route[2]) return undefined;
  const fromPart = cleanFieldValue(route[1]);
  const toPart = cleanFieldValue(route[2]);
  const fromLabel = cleanRouteLabel(route[1]);
  const toLabel = cleanRouteLabel(route[2]);
  if (!isUsableLabel(fromLabel) || !isUsableLabel(toLabel)) return undefined;
  const directLabelRoute =
    /^[A-Z][^.!?:]{1,90}(?:,\s*[A-Z][^.!?:]{1,90})?$/.test(fromPart) &&
    /^[A-Z][^.!?:]{1,90}(?:,\s*[A-Z][^.!?:]{1,90})?$/.test(toPart) &&
    !/\bfrom\b/i.test(fromPart);
  if (!hasPrefix && !hasCode && !hasArrow && !directLabelRoute) return undefined;
  return {
    fromLabel,
    toLabel,
  };
}

function lineHasAlias(line: string, field: "depart" | "arrive") {
  return FIELD_ALIASES[field].some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line));
}

function findRouteLabels(text: string) {
  const fromField = findField(text, "from");
  const toField = findField(text, "to");
  if (fromField && toField) return { fromLabel: cleanRouteLabel(fromField), toLabel: cleanRouteLabel(toField) };

  const lines = textLines(text);
  for (const line of lines) {
    if (/\([A-Z0-9]{2,5}\)/.test(line) || /^(route|itinerary|trip|journey)\b/i.test(line)) {
      const route = routeFromLine(line);
      if (route) return route;
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

type TransportSegment = {
  index: number;
  fromLabel: string;
  toLabel: string;
  departRaw?: string;
  arriveRaw?: string;
};

function findLineForAliases(text: string, field: "depart" | "arrive") {
  const aliases = FIELD_ALIASES[field];
  return textLines(text).find((line) => {
    if (!lineHasAlias(line, field)) return false;
    return Boolean(normalizeTime(line) || normalizeDate(line));
  });
}

function dateLikeLines(lines: string[], context: ImportProviderTripContext) {
  return lines.filter((line) => Boolean(normalizeDate(line, context) || normalizeTime(line)));
}

function findDateRangeLine(text: string, context: ImportProviderTripContext, hintPattern: RegExp) {
  return textLines(text).find((line) => {
    if (!hintPattern.test(line) && !/\b(?:from|to|until|through|[-–—])\b/i.test(line)) return false;
    return dateMatchesFromText(line, context).length >= 2;
  });
}

function routeSegmentsFromText(text: string, context: ImportProviderTripContext): TransportSegment[] {
  const indexedLines = indexedTextLines(text);
  const routeLines = indexedLines
    .map((line) => {
      const route = routeFromLine(line.text);
      if (!route?.fromLabel || !route.toLabel) return undefined;
      return { ...line, ...route };
    })
    .filter((line): line is { index: number; text: string; fromLabel: string; toLabel: string } => Boolean(line));

  if (routeLines.length === 0) return [];

  return routeLines
    .map((routeLine, routeIndex): TransportSegment | undefined => {
      const nextRouteLine = routeLines[routeIndex + 1];
      const startIndex = routeLine.index;
      const endIndex = nextRouteLine ? nextRouteLine.index : routeLine.index + 10;
      const windowLines = indexedLines
        .filter((line) => line.index >= startIndex && line.index < endIndex)
        .map((line) => line.text);
      const departRaw = windowLines.find((line) => lineHasAlias(line, "depart") && Boolean(normalizeDate(line, context) || normalizeTime(line)));
      const arriveRaw = windowLines.find((line) => lineHasAlias(line, "arrive") && Boolean(normalizeDate(line, context) || normalizeTime(line)));
      const fallbackDateLines = dateLikeLines(
        windowLines.filter((line) => line !== departRaw && line !== arriveRaw),
        context,
      );
      const segmentDepartRaw = departRaw ?? fallbackDateLines[0];
      const segmentArriveRaw = arriveRaw ?? fallbackDateLines.find((line) => line !== segmentDepartRaw);
      if (!segmentDepartRaw) return undefined;
      return {
        index: routeIndex,
        fromLabel: routeLine.fromLabel,
        toLabel: routeLine.toLabel,
        departRaw: segmentDepartRaw,
        arriveRaw: segmentArriveRaw,
      };
    })
    .filter((segment): segment is TransportSegment => Boolean(segment));
}

function globalTransportSegment(text: string, context: ImportProviderTripContext): TransportSegment | undefined {
  const { fromLabel, toLabel } = findRouteLabels(text);
  if (!fromLabel || !toLabel) return undefined;
  const arriveRaw = findField(text, "arrive") ?? findLineForAliases(text, "arrive");
  const fallbackDateLines = dateLikeLines(textLines(text), context).filter((line) => line !== arriveRaw);
  const departRaw = findField(text, "depart") ?? findLineForAliases(text, "depart") ?? fallbackDateLines[0];
  if (!departRaw) return undefined;
  return {
    index: 0,
    fromLabel,
    toLabel,
    departRaw,
    arriveRaw,
  };
}

function normalizedBaseLabel(value: string) {
  return cleanRouteLabel(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function fromMatchesExistingBase(fromLabel: string, context: ImportProviderTripContext) {
  const normalizedFrom = normalizedBaseLabel(fromLabel);
  return context.planner.customBases.some((base) => normalizedBaseLabel(base.baseName) === normalizedFrom);
}

function transportCandidateKind(segment: TransportSegment, context: ImportProviderTripContext): Extract<ImportCandidate["kind"], "startingTravel" | "transport"> {
  const hasStartingTravel = context.planner.items.some((item) => item.isStartingTravel);
  if (segment.index === 0 && !hasStartingTravel && !fromMatchesExistingBase(segment.fromLabel, context)) return "startingTravel";
  return "transport";
}

function extractTransportCandidates(source: ImportSource, text: string, context: ImportProviderTripContext): ImportCandidate[] {
  if (!TRANSPORT_KEYWORDS.test(text)) return [];
  if (sourceLooksInformationalOnly(text, context)) return [];
  const segments = routeSegmentsFromText(text, context);
  const routeSegments = segments.length > 0 ? segments : [globalTransportSegment(text, context)].filter((segment): segment is TransportSegment => Boolean(segment));
  const bookingReference = extractBookingReference(text);
  const candidates: ImportCandidate[] = routeSegments.flatMap((segment) => {
    const fromLabel = segment.fromLabel;
    const toLabel = segment.toLabel;
    const departRaw = segment.departRaw;
    const arriveRaw = segment.arriveRaw;
    const startDate = normalizeDate(departRaw, context);
    const endDate = normalizeDate(arriveRaw, context) ?? normalizeLastDate(departRaw, context) ?? startDate;
    if (!isUsableLabel(fromLabel) || !isUsableLabel(toLabel) || !startDate) return [];
    const transportMode = transportModeForText(text);
    const confidence = transportMode === "flight" && endDate ? 0.94 : 0.88;
    const kind = transportCandidateKind(segment, context);
    const title = cleanTitle(`${fromLabel} to ${toLabel}`);
    return [
      {
        id: candidateId(source, `${kind === "startingTravel" ? "starting-travel" : "transport"}-${segment.index + 1}`),
        provider: source.provider,
        sourceId: source.id,
        kind,
        confidence,
        title,
        startDate,
        endDate,
        startTime: normalizeTime(departRaw),
        endTime: normalizeTime(arriveRaw),
        fromLabel,
        toLabel,
        transportMode,
        bookingReference,
        note: noteForSource(source),
      },
    ];
  });
  const seen = new Set<string>();
  const hasStartingTravelByRoute = new Set(
    candidates
      .filter((candidate) => candidate.kind === "startingTravel")
      .map((candidate) => [candidate.fromLabel, candidate.toLabel, candidate.startDate, candidate.endDate].join("|").toLowerCase()),
  );
  return candidates.filter((candidate) => {
    const routeKey = [candidate.fromLabel, candidate.toLabel, candidate.startDate, candidate.endDate].join("|").toLowerCase();
    if (candidate.kind === "transport" && hasStartingTravelByRoute.has(routeKey)) return false;
    const key = [candidate.kind, routeKey].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractStayCandidate(source: ImportSource, text: string, context: ImportProviderTripContext): ImportCandidate | undefined {
  if (!STAY_KEYWORDS.test(text)) return undefined;
  if (sourceLooksInformationalOnly(text, context)) return undefined;
  const placeLabel = findField(text, "stay");
  const stayRangeRaw = findDateRangeLine(text, context, /\b(stay|booking|reservation|dates?|night|nights|check[-\s]?in|check[-\s]?out)\b/i);
  const checkInRaw = findField(text, "checkIn") ?? stayRangeRaw;
  const checkOutRaw = findField(text, "checkOut") ?? stayRangeRaw;
  const startDate = normalizeDate(checkInRaw, context);
  const endDate = normalizeLastDate(checkOutRaw, context) ?? startDate;
  if (!placeLabel || !isUsableLabel(placeLabel) || !startDate) return undefined;
  const baseLabel = findField(text, "city");
  const stayType = /\bhostel\b/i.test(text) ? "hostel" : /\bhotel\b/i.test(text) ? "hotel" : "apartment";
  const bookingReference = extractBookingReference(text);
  return {
    id: candidateId(source, "stay"),
    provider: source.provider,
    sourceId: source.id,
    kind: "stay",
    confidence: endDate ? 0.92 : 0.86,
    title: cleanTitle(placeLabel),
    startDate,
    endDate,
    startTime: normalizeTime(checkInRaw),
    endTime: normalizeTime(checkOutRaw),
    placeLabel,
    placeAddress: placeLabel,
    baseLabel,
    stayType,
    bookingReference,
    note: noteForSource(source),
  };
}

function extractActivityCandidate(source: ImportSource, text: string, context: ImportProviderTripContext): ImportCandidate | undefined {
  if (!ACTIVITY_KEYWORDS.test(text)) return undefined;
  if (sourceLooksInformationalOnly(text, context)) return undefined;
  const placeLabel = findField(text, "activity") ?? findField(text, "stay");
  const dateRaw = findField(text, "depart") ?? findField(text, "checkIn") ?? findDateRangeLine(text, context, /\b(activity|tour|ticket|hike|excursion|event|date)\b/i);
  const startDate = normalizeDate(dateRaw, context);
  if (!placeLabel || !isUsableLabel(placeLabel) || !startDate) return undefined;
  const bookingReference = extractBookingReference(text);
  return {
    id: candidateId(source, "activity"),
    provider: source.provider,
    sourceId: source.id,
    kind: "activity",
    confidence: 0.78,
    title: cleanTitle(placeLabel),
    startDate,
    startTime: normalizeTime(dateRaw),
    placeLabel,
    placeAddress: placeLabel,
    bookingReference,
    note: noteForSource(source),
  };
}

export function scoreImportSource(source: ImportSource) {
  const text = sourceText(source);
  if (/\b(account confirmation|verify your account|password reset)\b/i.test(text)) return 0.1;
  if (/\b(not modifiable|customi[sz]ed quote|published programs?)\b/i.test(text) && !hasRouteEvidence(text) && !hasStayEvidence(text)) {
    return 0.34;
  }
  const strongEvidence = hasStrongImportEvidence(text);
  if ((NEGATIVE_SOURCE_KEYWORDS.test(text) || RECEIPT_ONLY_KEYWORDS.test(text)) && !strongEvidence) return 0.34;
  let score = 0;
  if (TRANSPORT_KEYWORDS.test(text)) score += 0.42;
  if (STAY_KEYWORDS.test(text)) score += 0.36;
  if (ACTIVITY_KEYWORDS.test(text)) score += 0.2;
  if (/\bconfirm(ed|ation)?|reservation|booking|itinerary|ticket\b/i.test(text)) score += 0.25;
  if (new RegExp(`\\b20\\d{2}-\\d{1,2}-\\d{1,2}\\b|\\b\\d{1,2}/\\d{1,2}/20\\d{2}\\b|\\b\\d{1,2}\\s+(${MONTH_PATTERN})\\b|\\b(${MONTH_PATTERN})\\.?\\s+\\d{1,2}\\b`, "i").test(text)) score += 0.18;
  if (NEGATIVE_SOURCE_KEYWORDS.test(text) && !strongEvidence) score -= 0.45;
  if (RECEIPT_ONLY_KEYWORDS.test(text) && !strongEvidence && !TRANSPORT_KEYWORDS.test(text) && !STAY_KEYWORDS.test(text)) score -= 0.25;
  return Math.max(0, Math.min(1, score));
}

export const deterministicExtractionEngine: ExtractionEngine = {
  id: "deterministic-v1",
  extractCandidates(source: ImportSource, context: ImportProviderTripContext) {
    if (scoreImportSource(source) < 0.45) return [];
    const text = sourceText(source);
    if (sourceLooksInformationalOnly(text, context)) return [];
    return [...extractTransportCandidates(source, text, context), extractStayCandidate(source, text, context), extractActivityCandidate(source, text, context)].filter(
      (candidate): candidate is ImportCandidate => Boolean(candidate),
    );
  },
};
