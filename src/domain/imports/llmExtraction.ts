import type { ExtractionEngine, ImportCandidate, ImportProviderTripContext, ImportSource } from "./types";
import type { PlannerStayType, PlannerTransportMode } from "../trip/types";

const IMPORT_LLM_SCHEMA_VERSION = 1;
const TRANSPORT_MODES: PlannerTransportMode[] = ["flight", "car", "bus", "train", "taxi", "other"];
const STAY_TYPES: PlannerStayType[] = ["apartment", "hostel", "hotel", "campsite", "camper", "other"];
const CANDIDATE_KINDS = ["startingTravel", "transport", "stay", "activity"] as const;

export type ImportLlmRequest = {
  schemaVersion: number;
  prompt: string;
  source: ImportSource;
  context: ImportProviderTripContext;
};

export type ImportLlmRuntime = {
  id: string;
  generateJson: (request: ImportLlmRequest) => Promise<unknown>;
};

type LlmCandidate = {
  kind?: unknown;
  confidence?: unknown;
  title?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  fromLabel?: unknown;
  toLabel?: unknown;
  placeLabel?: unknown;
  placeAddress?: unknown;
  baseLabel?: unknown;
  transportMode?: unknown;
  stayType?: unknown;
  bookingReference?: unknown;
  note?: unknown;
};

function sourceText(source: ImportSource) {
  const attachmentText = source.attachmentTexts
    ?.filter((attachment) => attachment.status === "extracted" && attachment.text)
    .map((attachment) => [`Attachment: ${attachment.name}`, attachment.text].join("\n"))
    .join("\n\n");
  return [source.subject, source.snippet, source.bodyText, attachmentText].filter(Boolean).join("\n\n");
}

function compact(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n[truncated]`;
}

function tripPlaces(context: ImportProviderTripContext) {
  const terms = new Set<string>();
  const add = (value?: string) => {
    const cleaned = value?.trim();
    if (cleaned) terms.add(cleaned);
  };
  for (const base of context.planner.customBases) add(base.baseName);
  for (const item of context.planner.items) {
    add(item.fromLabel);
    add(item.toLabel);
    add(item.baseName);
    add(item.placeLabel);
    add(item.placeAddress);
  }
  return [...terms].slice(0, 30);
}

export function buildImportLlmPrompt(source: ImportSource, context: ImportProviderTripContext) {
  const trip = context.trip;
  const places = tripPlaces(context);
  return [
    "You extract travel planner items from one email for the LBT trip planner.",
    "Return only valid JSON. Do not include markdown, comments, or explanations.",
    "",
    "JSON shape:",
    JSON.stringify(
      {
        candidates: [
          {
            kind: "startingTravel | transport | stay | activity",
            confidence: "number from 0 to 1",
            title: "short human title",
            startDate: "YYYY-MM-DD when known",
            endDate: "YYYY-MM-DD when known",
            startTime: "HH:mm 24-hour when known",
            endTime: "HH:mm 24-hour when known",
            fromLabel: "route origin for travel",
            toLabel: "route destination for travel",
            placeLabel: "hotel/activity/place name",
            placeAddress: "full address if present",
            baseLabel: "base city if clear",
            transportMode: "flight | car | bus | train | taxi | other",
            stayType: "apartment | hostel | hotel | campsite | camper | other",
            bookingReference: "booking or confirmation reference if present",
            note: "only useful extra booking detail",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Extract all obvious route legs; outbound and return flights must be separate candidates.",
    "- Use startingTravel only for the first route into the trip when there is no existing starting travel.",
    "- Use transport for later routes between trip destinations.",
    "- Use stay for accommodation with check-in/check-out dates.",
    "- Use activity only for booked tours, hikes, events, tickets, or reservations that are not transport or stays.",
    "- Do not invent dates, times, places, addresses, or booking details.",
    "- Do not extract discount, marketing, newsletter, account-confirmation, generic quote, or receipt-only emails as planner items.",
    "- Keep titles short. Never use a paragraph, policy text, legal text, or marketing copy as a title.",
    "- Prefer dates inside the email over the email received date.",
    "- Use the active trip dates and places only as context, not as data to invent missing fields.",
    "",
    `Trip: ${trip.name}`,
    `Trip dates: ${trip.startDate ?? "unknown"} to ${trip.endDate ?? trip.startDate ?? "unknown"}`,
    `Known trip places: ${places.length > 0 ? places.join("; ") : "none yet"}`,
    "",
    `Email subject: ${source.subject}`,
    source.from ? `Email from: ${source.from}` : undefined,
    source.receivedAt ? `Email received: ${source.receivedAt}` : undefined,
    source.attachmentNames?.length ? `Attachments: ${source.attachmentNames.join(", ")}` : undefined,
    "",
    "Email text:",
    compact(sourceText(source), 12000),
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  return text && /^20\d{2}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function timeValue(value: unknown) {
  const text = stringValue(value);
  return text && /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : undefined;
}

function confidenceValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.86;
  return Math.max(0, Math.min(1, value));
}

function transportModeValue(value: unknown): PlannerTransportMode | undefined {
  const text = stringValue(value)?.toLowerCase();
  return TRANSPORT_MODES.find((mode) => mode === text);
}

function stayTypeValue(value: unknown): PlannerStayType | undefined {
  const text = stringValue(value)?.toLowerCase();
  return STAY_TYPES.find((type) => type === text);
}

function candidateKindValue(value: unknown): ImportCandidate["kind"] | undefined {
  const text = stringValue(value);
  return CANDIDATE_KINDS.find((kind) => kind === text);
}

function parseJsonishResponse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const jsonText = fenced ?? trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!objectMatch) return undefined;
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return undefined;
    }
  }
}

function candidateArrayFromResponse(value: unknown): LlmCandidate[] {
  const parsed = parseJsonishResponse(value);
  if (Array.isArray(parsed)) return parsed.filter((candidate): candidate is LlmCandidate => Boolean(candidate && typeof candidate === "object"));
  if (!parsed || typeof parsed !== "object") return [];
  const candidates = (parsed as { candidates?: unknown }).candidates;
  return Array.isArray(candidates) ? candidates.filter((candidate): candidate is LlmCandidate => Boolean(candidate && typeof candidate === "object")) : [];
}

function candidateId(source: ImportSource, kind: ImportCandidate["kind"], index: number) {
  return `${source.provider}:${source.messageId}:llm-${index + 1}-${kind}`;
}

function defaultTitle(candidate: LlmCandidate, kind: ImportCandidate["kind"]) {
  const title = stringValue(candidate.title);
  if (title && title.length <= 90 && !/[.!?]\s+[A-Z0-9]/.test(title)) return title;
  const fromLabel = stringValue(candidate.fromLabel);
  const toLabel = stringValue(candidate.toLabel);
  if ((kind === "startingTravel" || kind === "transport") && fromLabel && toLabel) return `${fromLabel} to ${toLabel}`;
  return stringValue(candidate.placeLabel) ?? "Imported item";
}

function noteForSource(source: ImportSource, candidate: LlmCandidate) {
  return stringValue(candidate.note) ?? `Imported from Gmail: ${source.subject}`;
}

function isStructurallyImportable(candidate: ImportCandidate) {
  if (candidate.title.length > 90 || /[.!?]\s+[A-Z0-9]/.test(candidate.title)) return false;
  if ((candidate.kind === "startingTravel" || candidate.kind === "transport") && candidate.fromLabel && candidate.toLabel && candidate.startDate) return true;
  if (candidate.kind === "stay" && candidate.placeLabel && candidate.startDate) return true;
  if (candidate.kind === "activity" && candidate.title && candidate.startDate) return true;
  return false;
}

export function parseImportLlmCandidates(source: ImportSource, response: unknown): ImportCandidate[] {
  return candidateArrayFromResponse(response)
    .map((raw, index): ImportCandidate | undefined => {
      const kind = candidateKindValue(raw.kind);
      if (!kind) return undefined;
      const title = defaultTitle(raw, kind);
      const candidate: ImportCandidate = {
        id: candidateId(source, kind, index),
        provider: source.provider,
        sourceId: source.id,
        kind,
        confidence: confidenceValue(raw.confidence),
        title,
        startDate: dateValue(raw.startDate),
        endDate: dateValue(raw.endDate),
        startTime: timeValue(raw.startTime),
        endTime: timeValue(raw.endTime),
        fromLabel: stringValue(raw.fromLabel),
        toLabel: stringValue(raw.toLabel),
        placeLabel: stringValue(raw.placeLabel),
        placeAddress: stringValue(raw.placeAddress),
        baseLabel: stringValue(raw.baseLabel),
        transportMode: transportModeValue(raw.transportMode),
        stayType: stayTypeValue(raw.stayType),
        bookingReference: stringValue(raw.bookingReference)?.toUpperCase(),
        note: noteForSource(source, raw),
      };
      return isStructurallyImportable(candidate) ? candidate : undefined;
    })
    .filter((candidate): candidate is ImportCandidate => Boolean(candidate));
}

export function createLlmExtractionEngine(runtime: ImportLlmRuntime, fallback?: ExtractionEngine): ExtractionEngine {
  return {
    id: `llm:${runtime.id}`,
    async extractCandidates(source, context) {
      try {
        const request: ImportLlmRequest = {
          schemaVersion: IMPORT_LLM_SCHEMA_VERSION,
          prompt: buildImportLlmPrompt(source, context),
          source,
          context,
        };
        return parseImportLlmCandidates(source, await runtime.generateJson(request));
      } catch {
        return fallback ? Promise.resolve(fallback.extractCandidates(source, context)) : [];
      }
    },
  };
}
