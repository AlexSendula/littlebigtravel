import { type TripEvent, type TripStop } from "./tripData";

export type PlannerItemKind = "stay" | "tripBlock" | "flight" | "transport" | "activity" | "roadtrip" | "day";
export type PlannerDayDisplayMode = "daily" | "span";
export type PlannerTransportMode = "flight" | "car" | "bus" | "train" | "taxi" | "other";
export type PlannerStayType = "apartment" | "hostel" | "hotel" | "campsite" | "camper" | "friend_family" | "overnight_transport" | "tbd" | "other";
export type PlannerBlockType = "hike" | "road_loop" | "overnight_subtrip" | "guided_tour" | "retreat" | "other";

export type PlannerCustomDayRange = {
  id: string;
  startDate: string;
  endDate?: string;
  dayDisplayMode: PlannerDayDisplayMode;
};

export type PlannerBreakdownEntry = {
  id: string;
  date: string;
  title: string;
  note: string;
};

export type PlannerItem = {
  id: string;
  kind: PlannerItemKind;
  title: string;
  note: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  baseId: string;
  baseName?: string;
  destinationId?: string;
  fromBaseId?: string;
  toBaseId?: string;
  fromLabel?: string;
  toLabel?: string;
  fromCoordinates?: [number, number];
  toCoordinates?: [number, number];
  fromCountry?: string;
  toCountry?: string;
  fromCountryCode?: string;
  toCountryCode?: string;
  fromMapStopId?: string;
  toMapStopId?: string;
  stayType?: PlannerStayType;
  placeLabel?: string;
  placeAddress?: string;
  placeCoordinates?: [number, number];
  placeCountry?: string;
  placeCountryCode?: string;
  placeMapStopId?: string;
  bookingReference?: string;
  accessCode?: string;
  contactName?: string;
  contactPhone?: string;
  blockType?: PlannerBlockType;
  overnightEntries?: PlannerBreakdownEntry[];
  isStartingTravel?: boolean;
  autoLinkedItemsEnabled?: boolean;
  hiddenAutoLinkedItems?: string[];
  transportMode?: PlannerTransportMode;
  sourceStopId?: string;
  sourceEventKey?: string;
  showOnMap?: boolean;
  source: "seed" | "manual";
  order: number;
  breakdown?: PlannerBreakdownEntry[];
};

export type PlannerDayGroup = {
  dayIso: string;
  dayLabel: string;
  items: PlannerItem[];
};

export type PlannerSection = {
  baseId: string;
  baseName: string;
  mapStopId?: string;
  defaultDayIso?: string;
  arriveLabel: string;
  leaveLabel: string;
  days: PlannerDayGroup[];
};

export type PlannerCustomBase = {
  id: string;
  baseName: string;
  startDate: string;
  endDate?: string;
  note?: string;
  hiddenDays?: string[];
  coordinates?: [number, number];
  country?: string;
  countryCode?: string;
  mapStopId?: string;
  dayDisplayMode?: PlannerDayDisplayMode;
  dayRanges?: PlannerCustomDayRange[];
};

export type PlannerTimelineKind = "transport" | "activity" | "note";

export type PlannerBaseCityRecord = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  mapStopId?: string;
  note?: string;
  dayDisplayMode?: PlannerDayDisplayMode;
  dayRanges?: PlannerCustomDayRange[];
  source: "seed" | "manual" | "derived";
};

export type PlannerTimelineEntry = {
  id: string;
  item: PlannerItem;
  kind: PlannerTimelineKind;
  base?: PlannerBaseCityRecord;
  destinationStopId?: string;
  fromBase?: PlannerBaseCityRecord;
  toBase?: PlannerBaseCityRecord;
  dayIso: string;
  dayLabel: string;
  dateLabel: string;
  timeLabel?: string;
};

export type PlannerTimelineDay = {
  dayIso: string;
  dayLabel: string;
  entries: PlannerTimelineEntry[];
};

export type PlannerTimelineModel = {
  bases: PlannerBaseCityRecord[];
  days: PlannerTimelineDay[];
};

const STORAGE_KEY = "argentina-vacation-planner-v1";
const STORAGE_VERSION = 1;
const CUSTOM_BASES_STORAGE_KEY = "argentina-vacation-planner-custom-bases-v1";
const TRIP_YEAR = 2026;

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CATEGORY_TO_KIND: Record<TripEvent["category"], PlannerItemKind> = {
  Stay: "stay",
  Flight: "flight",
  Transport: "transport",
  Activity: "activity",
  Roadtrip: "roadtrip",
  Day: "day",
};

type DateRange = {
  startIso: string;
  endIso: string;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function buildIsoDate(day: number, monthLabel: string, year: number = TRIP_YEAR) {
  const monthIndex = MONTH_LOOKUP[monthLabel.toLowerCase()];
  if (monthIndex === undefined || day < 1 || day > 31) {
    return undefined;
  }
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseDateLabel(rawLabel: string): DateRange | undefined {
  const trimmed = rawLabel.trim();
  const rangeMatch = trimmed.match(/^(\d{1,2})(?:\s([A-Za-z]{3}))?\s*-\s*(\d{1,2})\s([A-Za-z]{3})$/);
  if (rangeMatch) {
    const [, startDayRaw, explicitStartMonth, endDayRaw, endMonth] = rangeMatch;
    const startDay = Number.parseInt(startDayRaw, 10);
    const endDay = Number.parseInt(endDayRaw, 10);
    const startMonth = explicitStartMonth ?? endMonth;
    const startIso = buildIsoDate(startDay, startMonth);
    const endIso = buildIsoDate(endDay, endMonth);
    if (!startIso || !endIso) return undefined;
    return { startIso, endIso };
  }

  const singleMatch = trimmed.match(/^(\d{1,2})\s([A-Za-z]{3})$/);
  if (singleMatch) {
    const [, dayRaw, month] = singleMatch;
    const day = Number.parseInt(dayRaw, 10);
    const iso = buildIsoDate(day, month);
    if (!iso) return undefined;
    return { startIso: iso, endIso: iso };
  }

  return undefined;
}

function normalizeDateRange(startDate: string, endDate?: string) {
  if (!endDate) return { startDate, endDate: undefined };
  return endDate >= startDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

function normalizeTimeValue(time?: string) {
  if (!time || typeof time !== "string") return undefined;
  const trimmed = time.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeTransportMode(mode: unknown, kind?: PlannerItemKind): PlannerTransportMode | undefined {
  if (mode === "flight" || mode === "car" || mode === "bus" || mode === "train" || mode === "taxi" || mode === "other") {
    return mode;
  }
  if (mode === "road") return "car";
  if (mode === "local") return "other";
  if (kind === "flight") return "flight";
  if (kind === "roadtrip") return "car";
  if (kind === "transport") return "bus";
  return undefined;
}

function isPlannerKind(value: string): value is PlannerItemKind {
  return value === "stay" || value === "tripBlock" || value === "flight" || value === "transport" || value === "activity" || value === "roadtrip" || value === "day";
}

function isPlannerSource(value: string): value is PlannerItem["source"] {
  return value === "seed" || value === "manual";
}

function isPlannerBreakdownEntry(value: unknown): value is PlannerBreakdownEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlannerBreakdownEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.date === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.note === "string"
  );
}

function isPlannerItem(value: unknown): value is PlannerItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlannerItem>;
  const transportMode = (candidate as { transportMode?: unknown }).transportMode;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.startDate === "string" &&
    (candidate.startTime === undefined || typeof candidate.startTime === "string") &&
    (candidate.endTime === undefined || typeof candidate.endTime === "string") &&
    typeof candidate.baseId === "string" &&
    (candidate.baseName === undefined || typeof candidate.baseName === "string") &&
    (candidate.fromBaseId === undefined || typeof candidate.fromBaseId === "string") &&
    (candidate.toBaseId === undefined || typeof candidate.toBaseId === "string") &&
    (candidate.fromLabel === undefined || typeof candidate.fromLabel === "string") &&
    (candidate.toLabel === undefined || typeof candidate.toLabel === "string") &&
    (candidate.fromCoordinates === undefined ||
      (Array.isArray(candidate.fromCoordinates) &&
        candidate.fromCoordinates.length === 2 &&
        typeof candidate.fromCoordinates[0] === "number" &&
        typeof candidate.fromCoordinates[1] === "number")) &&
    (candidate.toCoordinates === undefined ||
      (Array.isArray(candidate.toCoordinates) &&
        candidate.toCoordinates.length === 2 &&
        typeof candidate.toCoordinates[0] === "number" &&
        typeof candidate.toCoordinates[1] === "number")) &&
    (candidate.fromCountry === undefined || typeof candidate.fromCountry === "string") &&
    (candidate.toCountry === undefined || typeof candidate.toCountry === "string") &&
    (candidate.fromCountryCode === undefined || typeof candidate.fromCountryCode === "string") &&
    (candidate.toCountryCode === undefined || typeof candidate.toCountryCode === "string") &&
    (candidate.fromMapStopId === undefined || typeof candidate.fromMapStopId === "string") &&
    (candidate.toMapStopId === undefined || typeof candidate.toMapStopId === "string") &&
    (candidate.stayType === undefined ||
      candidate.stayType === "apartment" ||
      candidate.stayType === "hostel" ||
      candidate.stayType === "hotel" ||
      candidate.stayType === "campsite" ||
      candidate.stayType === "camper" ||
      candidate.stayType === "friend_family" ||
      candidate.stayType === "overnight_transport" ||
      candidate.stayType === "tbd" ||
      candidate.stayType === "other") &&
    (candidate.placeLabel === undefined || typeof candidate.placeLabel === "string") &&
    (candidate.placeAddress === undefined || typeof candidate.placeAddress === "string") &&
    (candidate.placeCoordinates === undefined ||
      (Array.isArray(candidate.placeCoordinates) &&
        candidate.placeCoordinates.length === 2 &&
        typeof candidate.placeCoordinates[0] === "number" &&
        typeof candidate.placeCoordinates[1] === "number")) &&
    (candidate.placeCountry === undefined || typeof candidate.placeCountry === "string") &&
    (candidate.placeCountryCode === undefined || typeof candidate.placeCountryCode === "string") &&
    (candidate.placeMapStopId === undefined || typeof candidate.placeMapStopId === "string") &&
    (candidate.bookingReference === undefined || typeof candidate.bookingReference === "string") &&
    (candidate.accessCode === undefined || typeof candidate.accessCode === "string") &&
    (candidate.contactName === undefined || typeof candidate.contactName === "string") &&
    (candidate.contactPhone === undefined || typeof candidate.contactPhone === "string") &&
    (candidate.blockType === undefined ||
      candidate.blockType === "hike" ||
      candidate.blockType === "road_loop" ||
      candidate.blockType === "overnight_subtrip" ||
      candidate.blockType === "guided_tour" ||
      candidate.blockType === "retreat" ||
      candidate.blockType === "other") &&
    (candidate.overnightEntries === undefined ||
      (Array.isArray(candidate.overnightEntries) && candidate.overnightEntries.every(isPlannerBreakdownEntry))) &&
    (candidate.isStartingTravel === undefined || typeof candidate.isStartingTravel === "boolean") &&
    (candidate.autoLinkedItemsEnabled === undefined || typeof candidate.autoLinkedItemsEnabled === "boolean") &&
    (candidate.hiddenAutoLinkedItems === undefined ||
      (Array.isArray(candidate.hiddenAutoLinkedItems) && candidate.hiddenAutoLinkedItems.every((value) => typeof value === "string"))) &&
    (candidate.showOnMap === undefined || typeof candidate.showOnMap === "boolean") &&
    (transportMode === undefined ||
      transportMode === "flight" ||
      transportMode === "car" ||
      transportMode === "bus" ||
      transportMode === "train" ||
      transportMode === "taxi" ||
      transportMode === "other" ||
      transportMode === "road" ||
      transportMode === "local") &&
    isPlannerSource(candidate.source ?? "") &&
    typeof candidate.order === "number" &&
    (candidate.breakdown === undefined ||
      (Array.isArray(candidate.breakdown) && candidate.breakdown.every(isPlannerBreakdownEntry))) &&
    isPlannerKind(candidate.kind ?? "")
  );
}

function isPlannerCustomDayRange(value: unknown): value is PlannerCustomDayRange {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlannerCustomDayRange>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.startDate) &&
    (candidate.endDate === undefined || (typeof candidate.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.endDate))) &&
    (candidate.dayDisplayMode === "daily" || candidate.dayDisplayMode === "span")
  );
}

function isPlannerCustomBase(value: unknown): value is PlannerCustomBase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlannerCustomBase>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.baseName === "string" &&
    candidate.baseName.length > 0 &&
    typeof candidate.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.startDate) &&
    (candidate.endDate === undefined || (typeof candidate.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.endDate))) &&
    (candidate.note === undefined || typeof candidate.note === "string") &&
    (candidate.hiddenDays === undefined ||
      (Array.isArray(candidate.hiddenDays) &&
        candidate.hiddenDays.every((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)))) &&
    (candidate.coordinates === undefined ||
      (Array.isArray(candidate.coordinates) &&
        candidate.coordinates.length === 2 &&
        typeof candidate.coordinates[0] === "number" &&
        typeof candidate.coordinates[1] === "number")) &&
    (candidate.country === undefined || typeof candidate.country === "string") &&
    (candidate.countryCode === undefined || typeof candidate.countryCode === "string") &&
    (candidate.mapStopId === undefined || typeof candidate.mapStopId === "string") &&
    (candidate.dayDisplayMode === undefined || candidate.dayDisplayMode === "daily" || candidate.dayDisplayMode === "span") &&
    (candidate.dayRanges === undefined ||
      (Array.isArray(candidate.dayRanges) && candidate.dayRanges.every(isPlannerCustomDayRange)))
  );
}

function buildSeedId(parts: string[]) {
  return `seed:${parts.join(":").replace(/[^a-zA-Z0-9:_-]/g, "_")}`;
}

function itemSort(left: PlannerItem, right: PlannerItem) {
  const start = left.startDate.localeCompare(right.startDate);
  if (start !== 0) return start;
  const order = left.order - right.order;
  if (order !== 0) return order;
  return left.title.localeCompare(right.title);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function labelFromBaseId(baseId: string) {
  const normalized = baseId.startsWith("custom:") ? baseId.slice(7) : baseId;
  return normalized
    .split(/[-_]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function sectionDateBounds(sectionItems: PlannerItem[]) {
  if (sectionItems.length === 0) return undefined;
  let min = sectionItems[0].startDate;
  let max = sectionItems[0].endDate ?? sectionItems[0].startDate;
  for (const item of sectionItems) {
    if (item.startDate < min) min = item.startDate;
    const itemEnd = item.endDate ?? item.startDate;
    if (itemEnd > max) max = itemEnd;
  }
  return { min, max };
}

export function plannerKindLabel(kind: PlannerItemKind) {
  switch (kind) {
    case "stay":
      return "Stay";
    case "tripBlock":
      return "Trip block";
    case "flight":
      return "Flight";
    case "transport":
      return "Transport";
    case "activity":
      return "Activity";
    case "roadtrip":
      return "Roadtrip";
    case "day":
      return "Day";
    default:
      return "Item";
  }
}

export function formatIsoDate(isoDate: string) {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!year || !month || !day) return isoDate;
  return `${day} ${MONTH_LABELS[Math.max(0, Math.min(11, month - 1))]}`;
}

export function formatPlannerItemDate(startDate: string, endDate?: string) {
  if (!endDate || endDate === startDate) return formatIsoDate(startDate);
  return `${formatIsoDate(startDate)} - ${formatIsoDate(endDate)}`;
}

export function formatPlannerTime(startTime?: string, endTime?: string) {
  const normalizedStart = normalizeTimeValue(startTime);
  const normalizedEnd = normalizeTimeValue(endTime);
  if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd}`;
  return normalizedStart ?? normalizedEnd;
}

function compareIsoDateTime(leftDate: string, leftTime: string | undefined, rightDate: string, rightTime: string | undefined) {
  const dateCompare = leftDate.localeCompare(rightDate);
  if (dateCompare !== 0) return dateCompare;
  const normalizedLeft = normalizeTimeValue(leftTime) ?? "23:59";
  const normalizedRight = normalizeTimeValue(rightTime) ?? "23:59";
  return normalizedLeft.localeCompare(normalizedRight);
}

export function buildSeedPlannerItems(stops: TripStop[]) {
  const bases = stops.filter((stop) => stop.kind === "base");
  let orderCounter = 0;
  const items: PlannerItem[] = [];

  for (const base of bases) {
    const baseRange = parseDateLabel(base.dates);
    const baseStart = baseRange?.startIso;
    const baseEnd = baseRange?.endIso;
    const aggregateSignatures: Array<{ nameNorm: string; startDate: string; endDate?: string }> = [];

    const sideTrips = stops.filter((stop) => stop.parentId === base.id);
    for (const trip of sideTrips) {
      const tripRange = parseDateLabel(trip.dates) ?? (baseStart ? { startIso: baseStart, endIso: baseEnd ?? baseStart } : undefined);
      const parsedTripEvents = trip.events
        .map((event, index) => {
          const eventRange = parseDateLabel(event.date) ?? tripRange;
          if (!eventRange) return undefined;
          return { event, eventRange, index };
        })
        .filter((value): value is { event: TripEvent; eventRange: DateRange; index: number } => Boolean(value))
        .sort((left, right) => left.eventRange.startIso.localeCompare(right.eventRange.startIso));
      const distinctTripDays = new Set(parsedTripEvents.map((entry) => entry.eventRange.startIso));
      const shouldCollapseTrip = parsedTripEvents.length > 1 && distinctTripDays.size > 1;

      if (shouldCollapseTrip) {
        const firstDate = parsedTripEvents[0]?.eventRange.startIso ?? tripRange?.startIso;
        const lastDate = parsedTripEvents[parsedTripEvents.length - 1]?.eventRange.endIso ?? tripRange?.endIso;
        if (!firstDate) continue;
        const collapsedEnd = lastDate && lastDate !== firstDate ? lastDate : undefined;
      items.push({
        id: buildSeedId([trip.id, "trip-collapsed"]),
        kind: CATEGORY_TO_KIND[parsedTripEvents[0].event.category],
        title: trip.name,
        note: trip.summary,
        startDate: firstDate,
        endDate: collapsedEnd,
        baseId: base.id,
        baseName: base.name,
        destinationId: trip.id,
        sourceStopId: trip.id,
        source: "seed",
          order: orderCounter,
          breakdown: parsedTripEvents.map((entry) => ({
            id: buildSeedId([trip.id, "segment", String(entry.index)]),
            date: entry.eventRange.startIso,
            title: entry.event.title,
            note: entry.event.note,
          })),
        });
        aggregateSignatures.push({
          nameNorm: normalizeText(trip.name),
          startDate: firstDate,
          endDate: collapsedEnd,
        });
        orderCounter += 100;
        continue;
      }

      if (trip.events.length === 0 && tripRange) {
        items.push({
          id: buildSeedId([trip.id, "fallback"]),
          kind: "activity",
          title: trip.name,
          note: trip.summary,
          startDate: tripRange.startIso,
          endDate: tripRange.endIso !== tripRange.startIso ? tripRange.endIso : undefined,
          baseId: base.id,
          baseName: base.name,
          destinationId: trip.id,
          sourceStopId: trip.id,
          source: "seed",
          order: orderCounter,
        });
        orderCounter += 100;
        continue;
      }

      parsedTripEvents.forEach(({ event, eventRange, index }) => {
        items.push({
          id: buildSeedId([trip.id, "trip", String(index), event.date, event.title]),
          kind: CATEGORY_TO_KIND[event.category],
          title: event.title,
          note: event.note,
          startDate: eventRange.startIso,
          endDate: eventRange.endIso !== eventRange.startIso ? eventRange.endIso : undefined,
          baseId: base.id,
          baseName: base.name,
          destinationId: trip.id,
          sourceStopId: trip.id,
          sourceEventKey: `${event.date}:${event.title}`,
          source: "seed",
          order: orderCounter,
        });
        orderCounter += 100;
      });
    }

    base.events.forEach((event, index) => {
      const eventRange = parseDateLabel(event.date) ?? (baseStart ? { startIso: baseStart, endIso: baseEnd ?? baseStart } : undefined);
      if (!eventRange) return;

      const eventTitleNorm = normalizeText(event.title);
      const eventNoteNorm = normalizeText(event.note);
      const eventEnd = eventRange.endIso !== eventRange.startIso ? eventRange.endIso : undefined;
      const isAggregateDuplicate = aggregateSignatures.some(
        (signature) =>
          signature.startDate === eventRange.startIso &&
          (signature.endDate ?? signature.startDate) === (eventEnd ?? eventRange.startIso) &&
          (eventTitleNorm.includes(signature.nameNorm) ||
            eventNoteNorm.includes(signature.nameNorm) ||
            signature.nameNorm.includes(eventTitleNorm)),
      );
      if (isAggregateDuplicate) return;

      items.push({
        id: buildSeedId([base.id, "base", String(index), event.date, event.title]),
        kind: CATEGORY_TO_KIND[event.category],
        title: event.title,
        note: event.note,
        startDate: eventRange.startIso,
        endDate: eventEnd,
        baseId: base.id,
        baseName: base.name,
        destinationId: base.id,
        sourceStopId: base.id,
        sourceEventKey: `${event.date}:${event.title}`,
        source: "seed",
        order: orderCounter,
      });
      orderCounter += 100;
    });
  }

  return [...items].sort(itemSort);
}

export function loadPlannerItems() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as { version?: number; items?: unknown };
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) {
      return [];
    }

    return parsed.items
      .filter(isPlannerItem)
      .filter((item) => item.source !== "seed")
      .map((item) => {
        const normalized = normalizeDateRange(item.startDate, item.endDate);
        return {
          ...item,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
          startTime: normalizeTimeValue(item.startTime),
          endTime: normalizeTimeValue(item.endTime),
          transportMode: normalizeTransportMode(item.transportMode, item.kind),
        };
      })
      .sort(itemSort);
  } catch {
    return [];
  }
}

export function persistPlannerItems(items: PlannerItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        items,
      }),
    );
  } catch {
    // Ignore persistence failures so planning still works in private or restricted modes.
  }
}

function inferTimelineKind(kind: PlannerItemKind): PlannerTimelineKind {
  if (kind === "flight" || kind === "transport" || kind === "roadtrip") return "transport";
  if (kind === "activity" || kind === "tripBlock") return "activity";
  return "note";
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function baseSourceRank(source: PlannerBaseCityRecord["source"]) {
  if (source === "manual") return 0;
  if (source === "derived") return 1;
  return 2;
}

function baseIncludesDate(base: PlannerBaseCityRecord, dayIso?: string) {
  if (!dayIso || !base.startDate) return false;
  const endDate = base.endDate ?? base.startDate;
  return base.startDate <= dayIso && dayIso <= endDate;
}

function compareBaseMatchPreference(
  left: PlannerBaseCityRecord,
  right: PlannerBaseCityRecord,
  dayIso?: string,
  baseUsage?: Map<string, number>,
) {
  const leftContainsDate = baseIncludesDate(left, dayIso);
  const rightContainsDate = baseIncludesDate(right, dayIso);
  if (leftContainsDate !== rightContainsDate) return leftContainsDate ? -1 : 1;

  const usage = (baseUsage?.get(right.id) ?? 0) - (baseUsage?.get(left.id) ?? 0);
  if (usage !== 0) return usage;

  const sourceRank = baseSourceRank(left.source) - baseSourceRank(right.source);
  if (sourceRank !== 0) return sourceRank;

  const leftStart = left.startDate ?? "9999-12-31";
  const rightStart = right.startDate ?? "9999-12-31";
  if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);

  return left.name.localeCompare(right.name);
}

function legacyBasePlaceholder(item: PlannerItem) {
  return item.kind === "stay" && /^stay in\s+/i.test(item.title.trim()) && !item.startTime && !item.endTime && !item.destinationId;
}

function inferTransportEndpoints(
  item: PlannerItem,
  baseById: Map<string, PlannerBaseCityRecord>,
  baseUsage: Map<string, number>,
) {
  const bases = [...baseById.values()];
  const bestBase = (candidates: PlannerBaseCityRecord[], dayIso?: string) =>
    [...candidates].sort((left, right) => compareBaseMatchPreference(left, right, dayIso, baseUsage))[0];

  const findBaseByLabel = (label: string, dayIso?: string) => {
    const normalizedLabel = normalizeName(label);
    const exact = bestBase(
      bases.filter((base) => normalizeName(base.name) === normalizedLabel),
      dayIso,
    );
    if (exact) return exact;

    const primaryLabel = label.split(",")[0] ?? label;
    const normalizedPrimary = normalizeName(primaryLabel);
    const primary = bestBase(
      bases.filter((base) => normalizeName(base.name) === normalizedPrimary),
      dayIso,
    );
    if (primary) return primary;

    return bases
      .filter((base) => {
        const normalizedBase = normalizeName(base.name);
        return normalizedBase.length >= 4 && normalizedLabel.startsWith(normalizedBase);
      })
      .sort((left, right) => {
        const length = normalizeName(right.name).length - normalizeName(left.name).length;
        if (length !== 0) return length;
        return compareBaseMatchPreference(left, right, dayIso, baseUsage);
      })[0];
  };

  const explicitFrom = item.fromBaseId ? baseById.get(item.fromBaseId) : undefined;
  const explicitTo = item.toBaseId ? baseById.get(item.toBaseId) : undefined;
  if (explicitFrom || explicitTo) {
    return { fromBase: explicitFrom, toBase: explicitTo };
  }

  const labeledFrom = item.fromLabel ? findBaseByLabel(item.fromLabel, item.startDate) : undefined;
  const labeledTo = item.toLabel ? findBaseByLabel(item.toLabel, item.endDate ?? item.startDate) : undefined;
  if (labeledFrom || labeledTo) {
    return { fromBase: labeledFrom, toBase: labeledTo };
  }

  const title = item.title.trim();
  const routeMatch = title.match(/^(.+?)\s+to\s+(.+)$/i);
  if (routeMatch) {
    const [, fromLabelRaw, toLabelRaw] = routeMatch;
    const fromBase = findBaseByLabel(fromLabelRaw, item.startDate);
    const toBase = findBaseByLabel(toLabelRaw, item.endDate ?? item.startDate);
    return { fromBase, toBase };
  }

  const shortToMatch = title.match(/\bto\s+(.+)$/i);
  if (shortToMatch) {
    const toBase = findBaseByLabel(shortToMatch[1], item.endDate ?? item.startDate);
    const fromBase = baseById.get(item.baseId);
    return { fromBase, toBase };
  }

  return { fromBase: baseById.get(item.baseId), toBase: undefined };
}

export function buildPlannerTimelineModel(
  items: PlannerItem[],
  baseStops: TripStop[],
  customBases: PlannerCustomBase[] = [],
): PlannerTimelineModel {
  const baseById = new Map<string, PlannerBaseCityRecord>();
  for (const stop of baseStops) {
    const range = parseDateLabel(stop.dates);
    baseById.set(stop.id, {
      id: stop.id,
      name: stop.name,
      startDate: range?.startIso,
      endDate: range?.endIso,
      mapStopId: stop.id,
      source: "seed",
    });
  }

  for (const customBase of customBases) {
    baseById.set(customBase.id, {
      id: customBase.id,
      name: customBase.baseName,
      startDate: customBase.startDate,
      endDate: customBase.endDate,
      note: customBase.note,
      mapStopId: customBase.mapStopId,
      dayDisplayMode: customBase.dayDisplayMode,
      dayRanges: customBase.dayRanges,
      source: "manual",
    });
  }

  // Ensure bases inferred from timeline rows exist even when they were created from legacy data.
  for (const item of items) {
    if (!baseById.has(item.baseId)) {
      baseById.set(item.baseId, {
        id: item.baseId,
        name: item.baseName?.trim() || labelFromBaseId(item.baseId),
        startDate: item.startDate,
        endDate: item.endDate ?? item.startDate,
        source: "derived",
      });
      continue;
    }
    const base = baseById.get(item.baseId)!;
    if (!base.startDate || item.startDate < base.startDate) base.startDate = item.startDate;
    const itemEnd = item.endDate ?? item.startDate;
    if (!base.endDate || itemEnd > base.endDate) base.endDate = itemEnd;
  }

  const bases = [...baseById.values()].sort((left, right) => {
    const leftStart = left.startDate ?? "9999-12-31";
    const rightStart = right.startDate ?? "9999-12-31";
    if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
    return left.name.localeCompare(right.name);
  });
  const baseUsage = new Map<string, number>();
  for (const item of items) {
    if (item.isStartingTravel) continue;
    for (const baseId of [item.baseId, item.fromBaseId, item.toBaseId]) {
      if (!baseId) continue;
      baseUsage.set(baseId, (baseUsage.get(baseId) ?? 0) + 1);
    }
  }
  const dayMap = new Map<string, PlannerTimelineEntry[]>();
  const sortedItems = [...items]
    .filter((item) => !legacyBasePlaceholder(item))
    .sort((left, right) => {
      const dateTime = compareIsoDateTime(left.startDate, left.startTime, right.startDate, right.startTime);
      if (dateTime !== 0) return dateTime;
      const order = left.order - right.order;
      if (order !== 0) return order;
      return left.title.localeCompare(right.title);
    });

  for (const item of sortedItems) {
    const base = baseById.get(item.baseId);
    const kind = inferTimelineKind(item.kind);
    const route = kind === "transport" ? inferTransportEndpoints(item, baseById, baseUsage) : { fromBase: undefined, toBase: undefined };
    const entry: PlannerTimelineEntry = {
      id: item.id,
      item,
      kind,
      base,
      destinationStopId: item.destinationId,
      fromBase: route.fromBase,
      toBase: route.toBase,
      dayIso: item.startDate,
      dayLabel: formatIsoDate(item.startDate),
      dateLabel: formatPlannerItemDate(item.startDate, item.endDate),
      timeLabel: formatPlannerTime(item.startTime, item.endTime),
    };

    if (!dayMap.has(item.startDate)) {
      dayMap.set(item.startDate, []);
    }
    dayMap.get(item.startDate)!.push(entry);
  }

  const days = [...dayMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayIso, entries]) => ({
      dayIso,
      dayLabel: formatIsoDate(dayIso),
      entries,
    }));

  return { bases, days };
}

export function loadPlannerCustomBases() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_BASES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const customBases = parsed.filter(isPlannerCustomBase);
    return [...customBases].sort((left, right) => {
      if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
      return left.baseName.localeCompare(right.baseName);
    });
  } catch {
    return [];
  }
}

export function persistPlannerCustomBases(customBases: PlannerCustomBase[]) {
  if (typeof window === "undefined") return;
  try {
    const sorted = [...customBases].sort((left, right) => {
      if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
      return left.baseName.localeCompare(right.baseName);
    });
    window.localStorage.setItem(CUSTOM_BASES_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // Ignore persistence failures so planning still works in restricted modes.
  }
}

export function buildPlannerSections(
  items: PlannerItem[],
  baseStops: TripStop[],
  customBases: PlannerCustomBase[] = [],
): PlannerSection[] {
  const knownBaseById = new Map(baseStops.map((base) => [base.id, base]));
  const customBaseById = new Map(customBases.map((base) => [base.id, base]));
  const itemsByBase = new Map<string, PlannerItem[]>();
  for (const item of items) {
    if (!itemsByBase.has(item.baseId)) {
      itemsByBase.set(item.baseId, []);
    }
    itemsByBase.get(item.baseId)!.push(item);
  }

  const sectionBaseIds = new Set<string>([
    ...baseStops.map((base) => base.id).filter((baseId) => itemsByBase.has(baseId)),
    ...itemsByBase.keys(),
    ...customBaseById.keys(),
  ]);

  const sectionData = [...sectionBaseIds].map((baseId) => {
    const knownBase = knownBaseById.get(baseId);
    const customBase = customBaseById.get(baseId);
    const baseRange = knownBase ? parseDateLabel(knownBase.dates) : undefined;
    const sectionItems = (itemsByBase.get(baseId) ?? []).sort(itemSort);
    const dayMap = new Map<string, PlannerItem[]>();

    for (const item of sectionItems) {
      if (!dayMap.has(item.startDate)) {
        dayMap.set(item.startDate, []);
      }
      dayMap.get(item.startDate)!.push(item);
    }

    // Keep the planner focused by default: only show dates that have items.
    // Users can still add plans for any date from the section-level add button.
    const days = [...dayMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dayIso, dayItems]) => ({
        dayIso,
        dayLabel: formatIsoDate(dayIso),
        items: dayItems.sort(itemSort),
      }));

    const fallbackName = sectionItems.find((item) => item.baseName && item.baseName.trim().length > 0)?.baseName?.trim();
    const baseName = knownBase?.name ?? customBase?.baseName ?? fallbackName ?? labelFromBaseId(baseId) ?? "Trip Base";
    const bounds = sectionDateBounds(sectionItems);
    const startDate = baseRange?.startIso ?? customBase?.startDate ?? bounds?.min;
    const endDate = baseRange?.endIso ?? customBase?.endDate ?? bounds?.max;
    const arriveLabel = startDate ? formatIsoDate(startDate) : "Dates TBD";
    const leaveLabel = endDate ? formatIsoDate(endDate) : "Dates TBD";
    const sortDate = startDate || bounds?.min || "9999-12-31";
    const knownOrder = baseStops.findIndex((base) => base.id === baseId);

    return {
      baseId,
      baseName,
      defaultDayIso: startDate,
      mapStopId: knownBase?.id,
      arriveLabel,
      leaveLabel,
      days,
      sortDate,
      knownOrder,
    };
  });

  return sectionData
    .sort((left, right) => {
      if (left.sortDate !== right.sortDate) return left.sortDate.localeCompare(right.sortDate);
      if (left.knownOrder !== right.knownOrder) {
        const leftKnown = left.knownOrder >= 0;
        const rightKnown = right.knownOrder >= 0;
        if (leftKnown && rightKnown) return left.knownOrder - right.knownOrder;
        if (leftKnown && !rightKnown) return -1;
        if (!leftKnown && rightKnown) return 1;
      }
      return left.baseName.localeCompare(right.baseName);
    })
    .map(({ sortDate: _sortDate, knownOrder: _knownOrder, ...section }) => section);
}

export function movePlannerItemWithinDay(items: PlannerItem[], itemId: string, direction: -1 | 1) {
  const target = items.find((item) => item.id === itemId);
  if (!target) return items;

  const group = items
    .filter((item) => item.baseId === target.baseId && item.startDate === target.startDate)
    .sort((left, right) => left.order - right.order);
  const index = group.findIndex((item) => item.id === itemId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= group.length) return items;

  const reordered = [...group];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(swapIndex, 0, moved);
  const nextOrderById = new Map<string, number>();
  reordered.forEach((item, itemIndex) => {
    nextOrderById.set(item.id, itemIndex * 100);
  });

  return items.map((item) => (nextOrderById.has(item.id) ? { ...item, order: nextOrderById.get(item.id)! } : item));
}

export function nextDayOrder(items: PlannerItem[], baseId: string, dayIso: string) {
  const maxOrder = items
    .filter((item) => item.baseId === baseId && item.startDate === dayIso)
    .reduce((best, item) => Math.max(best, item.order), -100);
  return maxOrder + 100;
}

export function coerceDateRange(startDate: string, endDate?: string) {
  return normalizeDateRange(startDate, endDate);
}
