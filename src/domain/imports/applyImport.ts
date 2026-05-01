import type { ImportApplyResult, ImportCandidate, ImportDecision } from "./types";
import type { PlannerCustomBase, PlannerItem, PlannerSnapshot } from "../trip/types";
import { normalizeDateRange } from "../trip/date";
import { slugifyBaseCity } from "../trip/mutations";
import { findKnownPlace, formatRoutePlaceForDisplay, normalizePlaceInput } from "../../providers/geocodingProviders";

const HIGH_CONFIDENCE_THRESHOLD = 0.86;
const START_TRAVEL_BASE_ID = "__start_travel__";

function nowIso() {
  return new Date().toISOString();
}

function decision(
  candidate: ImportCandidate,
  status: ImportDecision["status"],
  reason?: string,
  decidedAt: string = nowIso(),
): ImportDecision {
  return {
    id: `${candidate.sourceId}:${candidate.id}:${status}`,
    provider: candidate.provider,
    sourceId: candidate.sourceId,
    candidateId: candidate.id,
    status,
    reason,
    decidedAt,
  };
}

function baseIdFor(label: string) {
  const slug = slugifyBaseCity(normalizePlaceInput(label));
  return `custom:import:${slug || "destination"}`;
}

function importedItemBase(candidate: ImportCandidate, order: number, importedAt: string): Pick<PlannerItem, "note" | "source" | "order" | "importProvider" | "importSourceId" | "importImportedAt" | "importConfidence"> {
  return {
    note: candidate.note ?? "",
    source: "imported",
    order,
    importProvider: candidate.provider,
    importSourceId: candidate.sourceId,
    importImportedAt: importedAt,
    importConfidence: candidate.confidence,
  };
}

function baseFromLabel(label: string, date: string): PlannerCustomBase {
  const normalized = normalizePlaceInput(label);
  const knownPlace = findKnownPlace(normalized);
  return {
    id: baseIdFor(normalized),
    baseName: normalized,
    startDate: date,
    coordinates: knownPlace?.coordinates,
    country: knownPlace?.country,
    countryCode: knownPlace?.countryCode,
    mapStopId: knownPlace?.mapStopId,
  };
}

function sameManualRoute(item: PlannerItem, candidate: ImportCandidate) {
  if (!candidate.fromLabel || !candidate.toLabel || !candidate.startDate) return false;
  return (
    item.source !== "imported" &&
    Boolean(item.isStartingTravel) === (candidate.kind === "startingTravel") &&
    normalizePlaceInput(item.fromLabel ?? "") === normalizePlaceInput(candidate.fromLabel) &&
    normalizePlaceInput(item.toLabel ?? "") === normalizePlaceInput(candidate.toLabel) &&
    item.startDate === candidate.startDate
  );
}

function sameManualStay(item: PlannerItem, candidate: ImportCandidate) {
  if (!candidate.placeLabel || !candidate.startDate) return false;
  return (
    item.source !== "imported" &&
    item.kind === "stay" &&
    normalizePlaceInput(item.placeLabel ?? item.title) === normalizePlaceInput(candidate.placeLabel) &&
    item.startDate === candidate.startDate
  );
}

function importedSourceExists(items: PlannerItem[], candidate: ImportCandidate) {
  return items.some((item) => item.importProvider === candidate.provider && item.importSourceId === candidate.sourceId);
}

function createStartingTravel(candidate: ImportCandidate, importedAt: string): { item: PlannerItem; base?: PlannerCustomBase } | undefined {
  if (!candidate.fromLabel || !candidate.toLabel || !candidate.startDate) return undefined;
  const normalizedRange = normalizeDateRange(candidate.startDate, candidate.endDate ?? candidate.startDate);
  const toKnownPlace = findKnownPlace(candidate.toLabel);
  const fromKnownPlace = findKnownPlace(candidate.fromLabel);
  const destinationBase = baseFromLabel(candidate.toLabel, normalizedRange.endDate ?? normalizedRange.startDate);
  const fromDisplay = formatRoutePlaceForDisplay(candidate.fromLabel, fromKnownPlace?.countryCode, fromKnownPlace?.country);
  const toDisplay = formatRoutePlaceForDisplay(candidate.toLabel, toKnownPlace?.countryCode, toKnownPlace?.country);
  return {
    base: destinationBase,
    item: {
      id: `import:${candidate.provider}:${candidate.sourceId}:starting-travel`,
      kind: candidate.transportMode === "flight" ? "flight" : "transport",
      title: `${fromDisplay} to ${toDisplay}`,
      startDate: normalizedRange.startDate,
      endDate: normalizedRange.endDate,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      baseId: START_TRAVEL_BASE_ID,
      baseName: "Starting Travel",
      fromLabel: normalizePlaceInput(candidate.fromLabel),
      toLabel: normalizePlaceInput(candidate.toLabel),
      fromCoordinates: fromKnownPlace?.coordinates,
      toCoordinates: toKnownPlace?.coordinates,
      fromCountry: fromKnownPlace?.country,
      toCountry: toKnownPlace?.country,
      fromCountryCode: fromKnownPlace?.countryCode,
      toCountryCode: toKnownPlace?.countryCode,
      fromMapStopId: fromKnownPlace?.mapStopId,
      toMapStopId: toKnownPlace?.mapStopId,
      toBaseId: destinationBase.id,
      destinationId: toKnownPlace?.mapStopId,
      transportMode: candidate.transportMode ?? "other",
      isStartingTravel: true,
      autoLinkedItemsEnabled: true,
      ...importedItemBase(candidate, 0, importedAt),
    },
  };
}

function findBaseForCandidate(customBases: PlannerCustomBase[], candidate: ImportCandidate) {
  const explicitLabel = candidate.baseLabel ?? candidate.toLabel;
  if (explicitLabel) {
    const slug = slugifyBaseCity(normalizePlaceInput(explicitLabel));
    const matched = customBases.find((base) => slugifyBaseCity(base.baseName) === slug);
    if (matched) return matched;
  }

  if (candidate.startDate) {
    const dated = customBases.find((base) => base.startDate <= candidate.startDate! && (base.endDate ?? base.startDate) >= candidate.startDate!);
    if (dated) return dated;
  }

  return customBases[0];
}

function createStay(candidate: ImportCandidate, customBases: PlannerCustomBase[], importedAt: string): PlannerItem | undefined {
  if (!candidate.placeLabel || !candidate.startDate) return undefined;
  const base = findBaseForCandidate(customBases, candidate);
  if (!base) return undefined;
  const normalizedRange = normalizeDateRange(candidate.startDate, candidate.endDate ?? candidate.startDate);
  return {
    id: `import:${candidate.provider}:${candidate.sourceId}:stay`,
    kind: "stay",
    title: candidate.placeLabel,
    startDate: normalizedRange.startDate,
    endDate: normalizedRange.endDate,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    baseId: base.id,
    baseName: base.baseName,
    stayType: candidate.stayType ?? "other",
    placeLabel: candidate.placeLabel,
    placeAddress: candidate.placeAddress ?? candidate.placeLabel,
    placeCountry: base.country,
    placeCountryCode: base.countryCode,
    autoLinkedItemsEnabled: true,
    ...importedItemBase(candidate, 100, importedAt),
  };
}

function createActivity(candidate: ImportCandidate, customBases: PlannerCustomBase[], importedAt: string): PlannerItem | undefined {
  if (!candidate.title || !candidate.startDate) return undefined;
  const base = findBaseForCandidate(customBases, candidate);
  if (!base) return undefined;
  return {
    id: `import:${candidate.provider}:${candidate.sourceId}:activity`,
    kind: "activity",
    title: candidate.title,
    startDate: candidate.startDate,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    baseId: base.id,
    baseName: base.baseName,
    placeLabel: candidate.placeLabel,
    placeAddress: candidate.placeAddress,
    ...importedItemBase(candidate, 200, importedAt),
  };
}

function upsertImportedItem(items: PlannerItem[], nextItem: PlannerItem) {
  const index = items.findIndex(
    (item) => item.importProvider === nextItem.importProvider && item.importSourceId === nextItem.importSourceId && item.id === nextItem.id,
  );
  if (index === -1) return [...items, nextItem];
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextItem, id: item.id } : item));
}

function upsertCustomBase(customBases: PlannerCustomBase[], nextBase: PlannerCustomBase) {
  const existing = customBases.find(
    (base) => base.id === nextBase.id || slugifyBaseCity(base.baseName) === slugifyBaseCity(nextBase.baseName),
  );
  if (!existing) return [...customBases, nextBase].sort((left, right) => left.startDate.localeCompare(right.startDate));
  return customBases.map((base) =>
    base.id === existing.id
      ? {
          ...base,
          startDate: base.startDate <= nextBase.startDate ? base.startDate : nextBase.startDate,
          coordinates: base.coordinates ?? nextBase.coordinates,
          country: base.country ?? nextBase.country,
          countryCode: base.countryCode ?? nextBase.countryCode,
          mapStopId: base.mapStopId ?? nextBase.mapStopId,
        }
      : base,
  );
}

export function applyImportCandidates(
  snapshot: PlannerSnapshot,
  candidates: ImportCandidate[],
  options: { importedAt?: string } = {},
): ImportApplyResult {
  let items = [...snapshot.items];
  let customBases = [...snapshot.customBases];
  const decisions: ImportDecision[] = [];
  const importedAt = options.importedAt ?? nowIso();

  for (const candidate of candidates) {
    if (candidate.confidence < HIGH_CONFIDENCE_THRESHOLD) {
      decisions.push(decision(candidate, "needs-user-fix", "Candidate confidence is below auto-apply threshold.", importedAt));
      continue;
    }

    if (candidate.kind === "startingTravel" || candidate.kind === "transport") {
      if (items.some((item) => sameManualRoute(item, candidate))) {
        decisions.push(decision(candidate, "needs-user-fix", "Possible duplicate of a manual route.", importedAt));
        continue;
      }
      const created = createStartingTravel(candidate, importedAt);
      if (!created) {
        decisions.push(decision(candidate, "failed", "Missing required route fields.", importedAt));
        continue;
      }
      if (!importedSourceExists(items, candidate) || items.some((item) => item.id === created.item.id)) {
        items = upsertImportedItem(items, created.item);
        if (created.base) customBases = upsertCustomBase(customBases, created.base);
        decisions.push(decision(candidate, "applied", undefined, importedAt));
      } else {
        decisions.push(decision(candidate, "ignored", "Source was already imported.", importedAt));
      }
      continue;
    }

    if (candidate.kind === "stay") {
      if (items.some((item) => sameManualStay(item, candidate))) {
        decisions.push(decision(candidate, "needs-user-fix", "Possible duplicate of a manual stay.", importedAt));
        continue;
      }
      const nextItem = createStay(candidate, customBases, importedAt);
      if (!nextItem) {
        decisions.push(decision(candidate, "failed", "Missing stay place/date or destination base.", importedAt));
        continue;
      }
      items = upsertImportedItem(items, nextItem);
      decisions.push(decision(candidate, "applied", undefined, importedAt));
      continue;
    }

    const nextItem = createActivity(candidate, customBases, importedAt);
    if (!nextItem) {
      decisions.push(decision(candidate, "failed", "Missing activity title/date or destination base.", importedAt));
      continue;
    }
    items = upsertImportedItem(items, nextItem);
    decisions.push(decision(candidate, "applied", undefined, importedAt));
  }

  return { items, customBases, decisions };
}
