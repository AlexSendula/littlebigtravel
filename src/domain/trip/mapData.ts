import { formatPlannerItemDate } from "./date";
import { displayBaseName, normalizeFullPlaceKey, normalizePlaceKey } from "./places";
import type { PlannerCustomBase, PlannerItem } from "./types";
import { tripStops, type TransportMode, type TripLeg, type TripStop } from "../../tripData";

type PlannerMapData = {
  stops: TripStop[];
  legs: TripLeg[];
  stopById: Map<string, TripStop>;
};

const DATES_TBD = "Dates TBD";
// Activities far enough from their parent base become map stops automatically.
// Nearby restaurants/shops stay in the itinerary unless the user opts in.
const OUTSIDE_BASE_ACTIVITY_DISTANCE_KM = 35;
const staticStopById = new Map(tripStops.map((stop) => [stop.id, stop]));
const staticStopByName = new Map(tripStops.map((stop) => [normalizePlaceKey(stop.name), stop]));
const externalTravelPlaces = [
  { city: "Amsterdam", country: "Netherlands", countryCode: "NL", coordinates: [4.9041, 52.3676] as [number, number] },
  { city: "Rotterdam", country: "Netherlands", countryCode: "NL", coordinates: [4.4777, 51.9244] as [number, number] },
  { city: "Utrecht", country: "Netherlands", countryCode: "NL", coordinates: [5.1214, 52.0907] as [number, number] },
  { city: "Brussels", country: "Belgium", countryCode: "BE", coordinates: [4.3517, 50.8503] as [number, number] },
  { city: "Madrid", country: "Spain", countryCode: "ES", coordinates: [-3.7038, 40.4168] as [number, number] },
  { city: "Lisbon", country: "Portugal", countryCode: "PT", coordinates: [-9.1393, 38.7223] as [number, number] },
  { city: "Paris", country: "France", countryCode: "FR", coordinates: [2.3522, 48.8566] as [number, number] },
  { city: "Frankfurt", country: "Germany", countryCode: "DE", coordinates: [8.6821, 50.1109] as [number, number] },
  { city: "Lima", country: "Peru", countryCode: "PE", coordinates: [-77.0428, -12.0464] as [number, number] },
  { city: "Montevideo", country: "Uruguay", countryCode: "UY", coordinates: [-56.1645, -34.9011] as [number, number] },
];
const externalTravelPlaceByName = new Map(externalTravelPlaces.map((place) => [normalizePlaceKey(place.city), place]));

type PlaceStopMetadata = {
  coordinates?: [number, number];
  country?: string;
  countryCode?: string;
  mapStopId?: string;
  parentId?: string;
  kind?: TripStop["kind"];
  date?: string;
  endDate?: string;
  sortTime?: string;
  sortPriority?: number;
  sectionIndex?: number;
};

type StopSortMeta = {
  startDate: string;
  sortTime: string;
  priority: number;
  sequence: number;
  locked?: boolean;
  sectionIndex?: number;
};

function formatRange(startDate?: string, endDate?: string) {
  if (!startDate) return DATES_TBD;
  return formatPlannerItemDate(startDate, endDate);
}

function itemMode(item: PlannerItem): TransportMode {
  if (item.kind === "flight") return "flight";
  if (item.kind === "roadtrip") return "road";
  if (item.kind === "transport") return "bus";
  return "local";
}

function itemEnd(item: PlannerItem) {
  return item.endDate ?? item.startDate;
}

function stopPlaceKey(stop: TripStop) {
  const countryKey = normalizePlaceKey(stop.country);
  if (countryKey) return `${normalizePlaceKey(stop.name)}:${countryKey}`;

  const coordinateKey = stop.coordinates.map((value) => value.toFixed(3)).join(",");
  return `${normalizePlaceKey(stop.name)}:${coordinateKey}`;
}

function roughDistanceKm(from: [number, number], to: [number, number]) {
  const latDelta = (to[1] - from[1]) * 111;
  const lngDelta = (to[0] - from[0]) * 111 * Math.cos((((from[1] + to[1]) / 2) * Math.PI) / 180);
  return Math.hypot(latDelta, lngDelta);
}

function mergeStops(existing: TripStop, next: TripStop): TripStop {
  return {
    ...existing,
    country: existing.country || next.country,
    kind: existing.kind === "base" || next.kind !== "base" ? existing.kind : next.kind,
    dates: existing.dates && existing.dates !== DATES_TBD ? existing.dates : next.dates,
    summary: existing.summary || next.summary,
    events: existing.events.length > 0 ? existing.events : next.events,
  };
}

function knownStopForBase(base: PlannerCustomBase) {
  return (base.mapStopId ? staticStopById.get(base.mapStopId) : undefined) ?? staticStopById.get(base.id) ?? staticStopByName.get(normalizePlaceKey(base.baseName));
}

function customBaseForLabel(label: string, customBases: PlannerCustomBase[]) {
  const key = normalizePlaceKey(label);
  if (!key) return undefined;
  return customBases.find((base) => normalizePlaceKey(base.baseName) === key);
}

function customBaseToStop(base: PlannerCustomBase): TripStop | undefined {
  const knownStop = knownStopForBase(base);
  const coordinates = base.coordinates ?? knownStop?.coordinates;
  if (!coordinates) return undefined;

  return {
    ...(knownStop ?? {
      kind: "base" as const,
      x: 0,
      y: 0,
      accent: "city" as const,
      events: [],
      summary: "",
      country: base.country ?? "",
    }),
    id: base.id,
    name: knownStop?.name ?? displayBaseName(base.baseName),
    country: base.country ?? knownStop?.country ?? "",
    kind: "base",
    coordinates,
    dates: formatRange(base.startDate, base.endDate),
    summary: base.note || knownStop?.summary || "Custom base from your timeline planner.",
  };
}

function datedStop(stop: TripStop, metadata: PlaceStopMetadata) {
  if (!metadata.date) return stop;
  return {
    ...stop,
    kind: metadata.kind ?? stop.kind,
    parentId: metadata.parentId ?? stop.parentId,
    dates: formatRange(metadata.date, metadata.endDate),
    events: [],
  };
}

function externalPlaceToStop(label: string, metadata: PlaceStopMetadata): TripStop | undefined {
  const knownPlace = externalTravelPlaceByName.get(normalizePlaceKey(label));
  const coordinates = metadata.coordinates ?? knownPlace?.coordinates;
  if (!coordinates) return undefined;

  const name = displayBaseName(label);
  const country = metadata.country ?? knownPlace?.country ?? "";
  const countryKey = metadata.countryCode ?? knownPlace?.countryCode ?? country;

  return {
    id: metadata.mapStopId ?? `place:${normalizeFullPlaceKey(`${name}-${countryKey}`)}`,
    name,
    country,
    kind: metadata.kind ?? (metadata.parentId ? "hidden" : "base"),
    parentId: metadata.parentId,
    coordinates,
    x: 0,
    y: 0,
    accent: "city",
    dates: formatRange(metadata.date, metadata.endDate),
    summary: "Travel point from your timeline planner.",
    events: [],
  };
}

function staticBaseToStop(baseId: string, items: PlannerItem[]): TripStop | undefined {
  const knownStop = staticStopById.get(baseId);
  if (!knownStop) return undefined;
  const baseItems = items.filter((item) => item.baseId === baseId || item.fromBaseId === baseId || item.toBaseId === baseId);
  const startDate = baseItems.map((item) => item.startDate).sort()[0];
  const endDate = baseItems.map(itemEnd).sort().at(-1);

  return {
    ...knownStop,
    dates: formatRange(startDate, endDate),
    events: [],
  };
}

function addLeg(legs: TripLeg[], seenLegs: Set<string>, leg: TripLeg) {
  if (leg.from === leg.to || seenLegs.has(leg.id)) return;
  seenLegs.add(leg.id);
  legs.push(leg);
}

export function buildPlannerMapData(items: PlannerItem[], customBases: PlannerCustomBase[]): PlannerMapData {
  const stopById = new Map<string, TripStop>();
  const visibleStopByKey = new Map<string, TripStop>();
  const visibleStopSortByKey = new Map<string, StopSortMeta>();
  const stopAliasesByKey = new Map<string, Set<string>>();
  const customBaseById = new Map(customBases.map((base) => [base.id, base]));
  const knownOrderForBaseId = (baseId: string) => tripStops.findIndex((base) => base.id === baseId);
  const baseOrderRecords = [
    ...customBases.map((base) => ({
      id: base.id,
      mapStopId: base.mapStopId,
      sortDate: base.startDate,
      knownOrder: base.mapStopId ? knownOrderForBaseId(base.mapStopId) : knownOrderForBaseId(base.id),
      name: base.baseName,
    })),
    ...[...new Set(items.flatMap((item) => [item.baseId, item.fromBaseId, item.toBaseId]).filter((baseId): baseId is string => Boolean(baseId) && baseId !== "__start_travel__"))]
      .filter((baseId) => !customBaseById.has(baseId))
      .map((baseId) => {
        const baseItems = items.filter((item) => item.baseId === baseId || item.fromBaseId === baseId || item.toBaseId === baseId);
        const knownBase = staticStopById.get(baseId);
        return {
          id: baseId,
          mapStopId: knownBase?.id,
          sortDate: baseItems.map((item) => item.startDate).sort()[0] ?? "9999-12-31",
          knownOrder: knownOrderForBaseId(baseId),
          name: knownBase?.name ?? baseId,
        };
      }),
  ].sort((left, right) => {
    if (left.sortDate !== right.sortDate) return left.sortDate.localeCompare(right.sortDate);
    if (left.knownOrder !== right.knownOrder) {
      const leftKnown = left.knownOrder >= 0;
      const rightKnown = right.knownOrder >= 0;
      if (leftKnown && rightKnown) return left.knownOrder - right.knownOrder;
      if (leftKnown && !rightKnown) return -1;
      if (!leftKnown && rightKnown) return 1;
    }
    return left.name.localeCompare(right.name);
  });
  const baseSectionIndexById = new Map<string, number>();
  baseOrderRecords.forEach((base, index) => {
    baseSectionIndexById.set(base.id, index);
    if (base.mapStopId) baseSectionIndexById.set(base.mapStopId, index);
  });
  let stopSequence = 0;
  const createStopSortMeta = (date?: string, sortTime = "23:59", priority = 1, locked = false, sectionIndex?: number): StopSortMeta => ({
    startDate: date || "9999-12-31",
    sortTime,
    priority,
    sequence: stopSequence++,
    locked,
    sectionIndex,
  });
  const sortMetaFromMetadata = (metadata: PlaceStopMetadata) =>
    createStopSortMeta(metadata.date, metadata.sortTime, metadata.sortPriority ?? 1, false, metadata.sectionIndex);
  const shouldReplaceSortMeta = (existing: StopSortMeta, next: StopSortMeta) => {
    if (existing.locked && !next.locked) return false;
    if (!existing.locked && next.locked) return true;
    if (next.startDate !== existing.startDate) return next.startDate < existing.startDate;
    if (next.priority !== existing.priority) return next.priority < existing.priority;
    if (next.sortTime !== existing.sortTime) return next.sortTime < existing.sortTime;
    return next.sequence < existing.sequence;
  };
  const setStopSortMeta = (key: string, sortMeta: StopSortMeta) => {
    const existing = visibleStopSortByKey.get(key);
    if (!existing || shouldReplaceSortMeta(existing, sortMeta)) {
      visibleStopSortByKey.set(key, sortMeta);
    }
  };
  const addStopAlias = (aliasId: string | undefined, stop: TripStop) => {
    if (!aliasId) return;
    stopById.set(aliasId, stop);
  };
  const addOrMergeStop = (stop: TripStop, aliases: Array<string | undefined> = [], sortMeta = createStopSortMeta()) => {
    const fallbackKey = stopPlaceKey(stop);
    const stopNameKey = normalizePlaceKey(stop.name);
    const stopCountryKey = normalizePlaceKey(stop.country);
    const matchingKey =
      visibleStopByKey.has(fallbackKey)
        ? fallbackKey
        : [...visibleStopByKey.entries()].find(([, existingStop]) => {
            if (normalizePlaceKey(existingStop.name) !== stopNameKey) return false;
            const existingCountryKey = normalizePlaceKey(existingStop.country);
            if (stopCountryKey && existingCountryKey && stopCountryKey === existingCountryKey) return true;
            return roughDistanceKm(existingStop.coordinates, stop.coordinates) < 65;
          })?.[0];
    const key = matchingKey ?? fallbackKey;
    const existing = visibleStopByKey.get(key);
    const aliasSet = stopAliasesByKey.get(key) ?? new Set<string>();
    aliasSet.add(stop.id);
    aliases.forEach((alias) => {
      if (alias) aliasSet.add(alias);
    });

    const merged = existing ? mergeStops(existing, stop) : stop;
    visibleStopByKey.set(key, merged);
    setStopSortMeta(key, sortMeta);
    stopAliasesByKey.set(key, aliasSet);
    aliasSet.forEach((aliasId) => addStopAlias(aliasId, merged));
    addStopAlias(merged.id, merged);
    return merged;
  };
  const canonicalStopId = (id?: string) => (id ? stopById.get(id)?.id ?? id : undefined);
  const resolveStopFromLabel = (label?: string, metadata: PlaceStopMetadata = {}) => {
    if (!label) return undefined;
    const customBase = customBaseForLabel(label, customBases);
    const staticStop = metadata.mapStopId ? staticStopById.get(metadata.mapStopId) : undefined;
    const namedStaticStop = staticStopByName.get(normalizePlaceKey(label));
    const stop = customBase
      ? customBaseToStop(customBase)
      : staticStop
        ? datedStop(staticStop, metadata)
        : namedStaticStop
          ? datedStop(namedStaticStop, metadata)
          : externalPlaceToStop(label, metadata);
    if (stop) addOrMergeStop(stop, [metadata.mapStopId], sortMetaFromMetadata(metadata));
    return stop;
  };
  const stopMetadataForItem = (item: PlannerItem, side: "from" | "to"): PlaceStopMetadata => {
    const isFrom = side === "from";
    const sectionBaseId = isFrom ? (item.fromBaseId ?? item.baseId) : (item.toBaseId ?? item.baseId);
    return {
      coordinates: isFrom ? item.fromCoordinates : item.toCoordinates,
      country: isFrom ? item.fromCountry : item.toCountry,
      countryCode: isFrom ? item.fromCountryCode : item.toCountryCode,
      mapStopId: isFrom ? item.fromMapStopId : item.toMapStopId,
      date: isFrom ? item.startDate : itemEnd(item),
      sortTime: isFrom ? (item.startTime ?? "00:00") : (item.endTime ?? "23:59"),
      sortPriority: item.isStartingTravel && isFrom ? -1 : 0,
      sectionIndex: item.isStartingTravel && isFrom ? -1 : baseSectionIndexById.get(sectionBaseId),
    };
  };
  const stopMetadataForActivityPlace = (item: PlannerItem): PlaceStopMetadata => ({
    coordinates: item.placeCoordinates,
    country: item.placeCountry,
    countryCode: item.placeCountryCode,
    mapStopId: item.placeMapStopId,
    parentId: canonicalStopId(item.baseId),
    kind: "hidden",
    date: item.startDate,
    endDate: item.endDate,
    sortTime: item.startTime ?? "12:00",
    sortPriority: 1,
    sectionIndex: baseSectionIndexById.get(item.baseId),
  });
  const baseStopForItem = (item: PlannerItem) => {
    const baseStopId = canonicalStopId(item.baseId);
    return baseStopId ? stopById.get(baseStopId) : undefined;
  };
  const shouldShowMapActivity = (item: PlannerItem) => {
    if (item.kind !== "activity") return false;
    if (item.showOnMap === true) return true;

    const baseStop = baseStopForItem(item);
    if (!baseStop) return false;

    if (item.placeCoordinates) {
      return roughDistanceKm(baseStop.coordinates, item.placeCoordinates) >= OUTSIDE_BASE_ACTIVITY_DISTANCE_KM;
    }

    if (item.placeMapStopId) {
      const knownActivityStop = staticStopById.get(item.placeMapStopId);
      if (!knownActivityStop) return item.placeMapStopId !== baseStop.id;
      return knownActivityStop.id !== baseStop.id && roughDistanceKm(baseStop.coordinates, knownActivityStop.coordinates) >= OUTSIDE_BASE_ACTIVITY_DISTANCE_KM;
    }

    return false;
  };
  const resolveMapActivityStop = (item: PlannerItem) => {
    if (!shouldShowMapActivity(item)) return undefined;
    const placeLabel = item.placeAddress ?? item.placeLabel;
    if (placeLabel) return resolveStopFromLabel(placeLabel, stopMetadataForActivityPlace(item));
    const destinationId = item.placeMapStopId ?? item.destinationId;
    if (!destinationId) return undefined;
    const destination = staticStopById.get(destinationId);
    if (!destination) return undefined;
    return addOrMergeStop({
      ...destination,
      dates: formatRange(item.startDate, item.endDate),
      events: [],
    }, [], createStopSortMeta(item.startDate, item.startTime ?? "12:00", 1, false, baseSectionIndexById.get(item.baseId)));
  };

  for (const base of customBases) {
    const stop = customBaseToStop(base);
    if (stop) {
      addOrMergeStop(
        stop,
        [base.mapStopId, knownStopForBase(base)?.id],
        createStopSortMeta(base.startDate, "00:00", 0, true, baseSectionIndexById.get(base.id) ?? (base.mapStopId ? baseSectionIndexById.get(base.mapStopId) : undefined)),
      );
    }
  }

  const referencedBaseIds = new Set<string>();
  for (const item of items) {
    if (item.baseId && item.baseId !== "__start_travel__") referencedBaseIds.add(item.baseId);
    if (item.fromBaseId) referencedBaseIds.add(item.fromBaseId);
    if (item.toBaseId) referencedBaseIds.add(item.toBaseId);
    resolveStopFromLabel(item.fromLabel, stopMetadataForItem(item, "from"));
    resolveStopFromLabel(item.toLabel, stopMetadataForItem(item, "to"));
  }

  for (const baseId of referencedBaseIds) {
    if (customBaseById.has(baseId)) continue;
    const stop = staticBaseToStop(baseId, items);
    if (stop) {
      const baseItems = items.filter((item) => item.baseId === baseId || item.fromBaseId === baseId || item.toBaseId === baseId);
      const startDate = baseItems.map((item) => item.startDate).sort()[0];
      addOrMergeStop(stop, [], createStopSortMeta(startDate, "00:00", 0, true, baseSectionIndexById.get(baseId)));
    }
  }

  for (const item of items) {
    resolveMapActivityStop(item);
  }

  for (const item of items) {
    if (item.kind === "activity" || item.kind === "stay") continue;
    if (!item.destinationId || item.destinationId === item.baseId) continue;
    const destination = staticStopById.get(item.destinationId);
    if (!destination) continue;
    addOrMergeStop({
      ...destination,
      dates: formatRange(item.startDate, item.endDate),
      events: [],
    }, [], createStopSortMeta(item.startDate, item.startTime ?? "00:00", 0, false, baseSectionIndexById.get(item.destinationId)));
  }

  const legs: TripLeg[] = [];
  const seenLegs = new Set<string>();
  const sortedItems = [...items].sort((left, right) => {
    if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
    return (left.startTime ?? "23:59").localeCompare(right.startTime ?? "23:59");
  });

  for (const item of sortedItems) {
    if (item.kind === "flight" || item.kind === "transport" || item.kind === "roadtrip") {
      const fromId = canonicalStopId(item.fromBaseId ?? resolveStopFromLabel(item.fromLabel, stopMetadataForItem(item, "from"))?.id);
      const toId = canonicalStopId(item.toBaseId ?? resolveStopFromLabel(item.toLabel, stopMetadataForItem(item, "to"))?.id);
      if (fromId && toId && stopById.has(fromId) && stopById.has(toId)) {
        addLeg(legs, seenLegs, {
          id: `planner:${item.id}:route`,
          from: fromId,
          to: toId,
          mode: itemMode(item),
          label: formatRange(item.startDate, item.endDate),
          visibleOnStart: true,
        });
      }
      continue;
    }

    const baseStopId = canonicalStopId(item.baseId);
    const destinationStopId =
      item.kind === "activity" ? canonicalStopId(resolveMapActivityStop(item)?.id) : canonicalStopId(item.destinationId);
    if (destinationStopId && baseStopId && destinationStopId !== baseStopId && stopById.has(baseStopId) && stopById.has(destinationStopId)) {
      addLeg(legs, seenLegs, {
        id: `planner:${item.id}:local`,
        from: baseStopId,
        to: destinationStopId,
        mode: itemMode(item),
        label: formatRange(item.startDate, item.endDate),
        parentId: baseStopId,
        visibleOnStart: true,
      });
    }
  }

  const fallbackStopSortMeta: StopSortMeta = {
    startDate: "9999-12-31",
    sortTime: "23:59",
    priority: 1,
    sequence: Number.MAX_SAFE_INTEGER,
    locked: false,
    sectionIndex: undefined,
  };

  return {
    stops: [...visibleStopByKey.entries()]
      .sort(([leftKey, left], [rightKey, right]) => {
        const leftSort = visibleStopSortByKey.get(leftKey) ?? fallbackStopSortMeta;
        const rightSort = visibleStopSortByKey.get(rightKey) ?? fallbackStopSortMeta;
        if (
          leftSort.sectionIndex !== undefined &&
          rightSort.sectionIndex !== undefined &&
          leftSort.sectionIndex !== rightSort.sectionIndex
        ) {
          return leftSort.sectionIndex - rightSort.sectionIndex;
        }
        if (leftSort.startDate !== rightSort.startDate) return leftSort.startDate.localeCompare(rightSort.startDate);
        if (leftSort.priority !== rightSort.priority) return leftSort.priority - rightSort.priority;
        if (leftSort.sortTime !== rightSort.sortTime) return leftSort.sortTime.localeCompare(rightSort.sortTime);
        if (leftSort.sequence !== rightSort.sequence) return leftSort.sequence - rightSort.sequence;
        return left.name.localeCompare(right.name);
      })
      .map(([, stop]) => stop),
    legs,
    stopById,
  };
}
