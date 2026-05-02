import { applyImportCandidates } from "../domain/imports/applyImport";
import { deterministicExtractionEngine, scoreImportSource } from "../domain/imports/extraction";
import {
  buildGmailCandidateQueries,
  GMAIL_BOOKING_KEYWORDS,
  tripImportDateRange,
  tripImportPlaceTerms,
} from "../domain/imports/gmailQueries";
import type {
  ImportCandidate,
  ImportDecision,
  ImportProviderTripContext,
  ImportRun,
  ImportRunDebug,
  ImportSource,
} from "../domain/imports/types";
import type { PlannerSnapshot } from "../domain/trip/types";
import { fetchGmailImportSources, isGmailAuthError } from "./gmailApiClient";
import {
  clearGmailAccessToken,
  getGoogleClientId,
  getValidGmailAccessToken,
  hasValidGmailAccessToken,
  requestGmailAccessToken,
  revokeGmailAccessToken,
} from "./googleIdentityProvider";

const GMAIL_IMPORT_STORAGE_KEY = "lbt-gmail-import-state-v1";

export type GmailConnectionStatus = "disconnected" | "connected" | "setup-needed" | "reconnect-needed" | "error";

export type GmailTripImportState = {
  lastCheckedAt?: string;
  historyId?: string;
  lastQuerySignature?: string;
  importedSourceIds: string[];
  decisions: ImportDecision[];
};

export type GmailImportState = {
  connected: boolean;
  status: GmailConnectionStatus;
  lastCheckedAt?: string;
  historyId?: string;
  lastQuerySignature?: string;
  importedSourceIds: string[];
  decisions: ImportDecision[];
  tripStates: Record<string, GmailTripImportState>;
  error?: string;
};

export type GmailSyncResult = {
  run: ImportRun;
  candidates: ImportCandidate[];
  decisions: ImportDecision[];
  planner?: PlannerSnapshot;
  state: GmailImportState;
};

export type GmailSyncOptions = {
  forceFullSearch?: boolean;
};

type GmailTestMessage = {
  id: string;
  threadId?: string;
  historyId?: string;
  subject: string;
  from?: string;
  snippet?: string;
  bodyText?: string;
  receivedAt?: string;
  attachmentNames?: string[];
};

declare global {
  interface Window {
    __lbtGmailTestMessages?: GmailTestMessage[];
  }
}

function emptyState(): GmailImportState {
  return {
    connected: false,
    status: "disconnected",
    importedSourceIds: [],
    decisions: [],
    tripStates: {},
  };
}

function emptyTripState(): GmailTripImportState {
  return {
    importedSourceIds: [],
    decisions: [],
  };
}

function normalizeTripState(value: Partial<GmailTripImportState> | undefined): GmailTripImportState {
  return {
    lastCheckedAt: typeof value?.lastCheckedAt === "string" ? value.lastCheckedAt : undefined,
    historyId: typeof value?.historyId === "string" ? value.historyId : undefined,
    lastQuerySignature: typeof value?.lastQuerySignature === "string" ? value.lastQuerySignature : undefined,
    importedSourceIds: Array.isArray(value?.importedSourceIds) ? value.importedSourceIds.filter((id): id is string => typeof id === "string") : [],
    decisions: Array.isArray(value?.decisions) ? value.decisions : [],
  };
}

function normalizeTripStates(value: unknown): Record<string, GmailTripImportState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, Partial<GmailTripImportState>>)
      .filter(([tripId]) => tripId.trim().length > 0)
      .map(([tripId, tripState]) => [tripId, normalizeTripState(tripState)]),
  );
}

export function getGmailImportStateForTrip(state: GmailImportState, tripId?: string): GmailTripImportState {
  if (!tripId) return emptyTripState();
  return state.tripStates[tripId] ?? emptyTripState();
}

export function projectGmailImportStateForTrip(state: GmailImportState, tripId?: string): GmailImportState {
  const tripState = getGmailImportStateForTrip(state, tripId);
  return {
    ...state,
    lastCheckedAt: tripState.lastCheckedAt,
    historyId: tripState.historyId,
    lastQuerySignature: tripState.lastQuerySignature,
    importedSourceIds: tripState.importedSourceIds,
    decisions: tripState.decisions,
  };
}

function readState(): GmailImportState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GMAIL_IMPORT_STORAGE_KEY) ?? "null") as Partial<GmailImportState> | null;
    if (!parsed) return emptyState();
    const next = {
      connected: Boolean(parsed.connected),
      status: parsed.status ?? (parsed.connected ? "connected" : "disconnected"),
      lastCheckedAt: parsed.lastCheckedAt,
      historyId: parsed.historyId,
      lastQuerySignature: typeof parsed.lastQuerySignature === "string" ? parsed.lastQuerySignature : undefined,
      importedSourceIds: Array.isArray(parsed.importedSourceIds) ? parsed.importedSourceIds.filter((id): id is string => typeof id === "string") : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      tripStates: normalizeTripStates(parsed.tripStates),
      error: parsed.error,
    };
    if (next.connected && next.status === "connected" && !hasTestMessages() && !hasValidGmailAccessToken()) {
      return {
        ...next,
        connected: false,
        status: "reconnect-needed",
        error: "Reconnect Gmail to continue auto-import.",
      };
    }
    return next;
  } catch {
    return emptyState();
  }
}

function writeState(state: GmailImportState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GMAIL_IMPORT_STORAGE_KEY, JSON.stringify(state));
}

function hasTestMessages() {
  return typeof window !== "undefined" && Array.isArray(window.__lbtGmailTestMessages);
}

function sourceFromTestMessage(message: GmailTestMessage): ImportSource {
  return {
    id: `gmail:${message.id}`,
    provider: "gmail",
    messageId: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    subject: message.subject,
    from: message.from,
    snippet: message.snippet,
    bodyText: message.bodyText,
    receivedAt: message.receivedAt,
    attachmentNames: message.attachmentNames,
  };
}

function readTestSources() {
  if (!hasTestMessages()) return [];
  return (window.__lbtGmailTestMessages ?? []).map(sourceFromTestMessage);
}

function sourceMatchesQueries(source: ImportSource, queries: string[]) {
  if (queries.length === 0) return true;
  const haystack = [source.subject, source.snippet, source.bodyText].filter(Boolean).join(" ").toLowerCase();
  const keywordTerms = new Set(GMAIL_BOOKING_KEYWORDS.map((keyword) => keyword.toLowerCase()));
  return queries.some((query) => {
    const quotedTerms = [...query.matchAll(/"([^"]+)"/g)].map((match) => match[1].toLowerCase());
    const keywords = quotedTerms.filter((term) => keywordTerms.has(term));
    const requiredTerms = quotedTerms.filter((term) => !keywordTerms.has(term));
    const matchesKeyword = keywords.length === 0 || keywords.some((term) => haystack.includes(term));
    const matchesRequiredTerms = requiredTerms.every((term) => haystack.includes(term));
    return matchesKeyword && matchesRequiredTerms;
  });
}

export function nextGmailHistoryId(sources: ImportSource[], existing?: string) {
  return sources.reduce((best, source) => {
    if (!source.historyId) return best;
    if (!best) return source.historyId;
    return source.historyId.localeCompare(best, undefined, { numeric: true }) > 0 ? source.historyId : best;
  }, existing);
}

export function resolveGmailHistoryIdAfterSync({
  sources,
  currentHistoryId,
  fetchedHistoryId,
  staleHistory,
}: {
  sources: ImportSource[];
  currentHistoryId?: string;
  fetchedHistoryId?: string;
  staleHistory?: boolean;
}) {
  if (fetchedHistoryId) return fetchedHistoryId;
  return nextGmailHistoryId(sources, staleHistory ? undefined : currentHistoryId);
}

export function gmailImportQuerySignature(queries: string[]) {
  return queries.map((query) => query.trim()).filter(Boolean).sort().join("\n");
}

export function shouldUseGmailHistoryForQueries(lastQuerySignature: string | undefined, queries: string[]) {
  return Boolean(lastQuerySignature) && lastQuerySignature === gmailImportQuerySignature(queries);
}

export function shouldUseGmailHistoryForSync(lastQuerySignature: string | undefined, queries: string[], options: GmailSyncOptions = {}) {
  return !options.forceFullSearch && shouldUseGmailHistoryForQueries(lastQuerySignature, queries);
}

function isNewerHistoryId(next?: string, current?: string) {
  if (!next || !current) return false;
  return next.localeCompare(current, undefined, { numeric: true }) > 0;
}

function runId() {
  return `gmail-run:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
}

function debugSourceFrom(source: ImportSource, selected: boolean, reason: string, score?: number) {
  return {
    id: source.id,
    subject: source.subject,
    from: source.from,
    receivedAt: source.receivedAt,
    score,
    selected,
    reason,
  };
}

function normalizedText(value?: string) {
  return value?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

function candidateDateOverlapsTrip(candidate: ImportCandidate, context: ImportProviderTripContext) {
  const range = tripImportDateRange(context.trip);
  if (!range || !candidate.startDate) return { matches: true };
  const candidateStart = candidate.startDate;
  const candidateEnd = candidate.endDate ?? candidate.startDate;
  if (candidateEnd < range.startDate || candidateStart > range.endDate) {
    return {
      matches: false,
      reason: `Outside active trip date window (${range.startDate} to ${range.endDate}).`,
    };
  }
  return { matches: true };
}

function candidatePlaceMatchesTrip(candidate: ImportCandidate, context: ImportProviderTripContext) {
  const terms = tripImportPlaceTerms(context.trip).map(normalizedText).filter(Boolean);
  if (terms.length === 0) return { matches: true };
  const haystack = normalizedText(
    [candidate.title, candidate.fromLabel, candidate.toLabel, candidate.placeLabel, candidate.placeAddress, candidate.baseLabel].filter(Boolean).join(" "),
  );
  if (terms.some((term) => haystack.includes(term))) return { matches: true };
  return {
    matches: false,
    reason: "Does not mention a place from the active trip.",
  };
}

export function importCandidateMatchesActiveTrip(candidate: ImportCandidate, context: ImportProviderTripContext) {
  const dateResult = candidateDateOverlapsTrip(candidate, context);
  if (!dateResult.matches) return dateResult;
  return candidatePlaceMatchesTrip(candidate, context);
}

export function hasPlannerImportChanges(decisions: ImportDecision[]) {
  return decisions.some((decision) => decision.status === "applied");
}

export const gmailImportProvider = {
  id: "gmail" as const,

  getState() {
    return readState();
  },

  async connect() {
    const current = readState();
    if (hasTestMessages()) {
      const next: GmailImportState = {
        ...current,
        connected: true,
        status: "connected",
        error: undefined,
      };
      writeState(next);
      return next;
    }

    if (!getGoogleClientId()) {
      const next: GmailImportState = {
        ...current,
        connected: false,
        status: "setup-needed",
        error: "Set VITE_GOOGLE_CLIENT_ID to connect Gmail in this build.",
      };
      writeState(next);
      return next;
    }

    try {
      await requestGmailAccessToken({ prompt: current.status === "reconnect-needed" ? "" : "consent" });
      const next: GmailImportState = {
        ...current,
        connected: true,
        status: "connected",
        error: undefined,
      };
      writeState(next);
      return next;
    } catch (error) {
      const next: GmailImportState = {
        ...current,
        connected: false,
        status: "error",
        error: error instanceof Error ? error.message : "Could not connect Gmail.",
      };
      writeState(next);
      return next;
    }
  },

  async disconnect() {
    const current = readState();
    await revokeGmailAccessToken();
    const next: GmailImportState = {
      ...current,
      connected: false,
      status: "disconnected",
      error: undefined,
    };
    writeState(next);
    return next;
  },

  async sync(context: ImportProviderTripContext, options: GmailSyncOptions = {}): Promise<GmailSyncResult> {
    const startedAt = new Date().toISOString();
    const current = readState();
    const currentTripState = getGmailImportStateForTrip(current, context.trip.id);
    const baseRun: ImportRun = {
      id: runId(),
      provider: "gmail",
      status: "running",
      startedAt,
      fetchedCount: 0,
      candidateCount: 0,
      appliedCount: 0,
      ignoredCount: 0,
      failedCount: 0,
      errors: [],
      historyId: currentTripState.historyId,
      lastCheckedAt: currentTripState.lastCheckedAt,
    };

    if (!current.connected) {
      const run = { ...baseRun, status: "skipped" as const, finishedAt: startedAt };
      return { run, candidates: [], decisions: [], state: current };
    }

    const queries = buildGmailCandidateQueries(context.trip);
    const querySignature = gmailImportQuerySignature(queries);
    const historyIdForSync = shouldUseGmailHistoryForSync(currentTripState.lastQuerySignature, queries, options) ? currentTripState.historyId : undefined;
    const alreadyImported = new Set(currentTripState.importedSourceIds);
    const importedPlannerSourceIds = new Set(
      context.planner.items
        .filter((item) => item.source === "imported" && item.importProvider === "gmail")
        .map((item) => item.importSourceId)
        .filter((id): id is string => Boolean(id)),
    );
    let availableSources: ImportSource[] = [];
    let sourceHistoryId: string | undefined;
    let staleHistory = false;
    let fetchUsedHistory = false;
    let fetchDebug:
      | {
          rawMessageCount: number;
          metadataSourceCount: number;
          fullFetchCount: number;
          fullFetchLimit: number;
          skippedMessageCount: number;
          metadataSources: Array<{
            id: string;
            subject: string;
            from?: string;
            receivedAt?: string;
            score: number;
          }>;
        }
      | undefined;

    if (hasTestMessages()) {
      availableSources = readTestSources();
      fetchDebug = {
        rawMessageCount: availableSources.length,
        metadataSourceCount: availableSources.length,
        fullFetchCount: availableSources.length,
        fullFetchLimit: availableSources.length,
        skippedMessageCount: 0,
        metadataSources: availableSources.map((source) => ({
          id: source.id,
          subject: source.subject,
          from: source.from,
          receivedAt: source.receivedAt,
          score: scoreImportSource(source),
        })),
      };
    } else {
      const accessToken = getValidGmailAccessToken();
      if (!accessToken) {
        clearGmailAccessToken();
        const nextState: GmailImportState = {
          ...current,
          connected: false,
          status: "reconnect-needed",
          error: "Reconnect Gmail to continue auto-import.",
        };
        writeState(nextState);
        const run = {
          ...baseRun,
          status: "skipped" as const,
          finishedAt: startedAt,
          errors: ["Gmail access token expired."],
        };
        return { run, candidates: [], decisions: [], state: nextState };
      }

      try {
        const result = await fetchGmailImportSources({
          accessToken,
          queries,
          historyId: historyIdForSync,
        });
        availableSources = result.sources;
        sourceHistoryId = result.historyId;
        staleHistory = result.staleHistory;
        fetchUsedHistory = result.usedHistory;
        fetchDebug = result.debug;
      } catch (error) {
        if (isGmailAuthError(error)) {
          clearGmailAccessToken();
          const nextState: GmailImportState = {
            ...current,
            connected: false,
            status: "reconnect-needed",
            error: "Reconnect Gmail to continue auto-import.",
          };
          writeState(nextState);
          const run = {
            ...baseRun,
            status: "failed" as const,
            finishedAt: new Date().toISOString(),
            errors: ["Gmail authorization expired."],
          };
          return { run, candidates: [], decisions: [], state: nextState };
        }
        const message = error instanceof Error ? error.message : "Gmail sync failed.";
        const nextState: GmailImportState = {
          ...current,
          status: "error",
          error: message,
        };
        writeState(nextState);
        const run = {
          ...baseRun,
          status: "failed" as const,
          finishedAt: new Date().toISOString(),
          errors: [message],
        };
        return { run, candidates: [], decisions: [], state: nextState };
      }
    }

    const sourceEvaluations = availableSources.map((source) => {
      const canRevisitImported =
        !alreadyImported.has(source.id) ||
        (importedPlannerSourceIds.has(source.id) && isNewerHistoryId(source.historyId, currentTripState.historyId));
      const queryMatched = sourceMatchesQueries(source, queries);
      const score = scoreImportSource(source);
      const selected = canRevisitImported && queryMatched && score >= 0.45;
      const reason = selected
        ? "Selected for extraction"
        : !canRevisitImported
          ? "Already imported or reviewed"
          : !queryMatched
            ? "Did not match query terms after fetch"
            : "Score below selection threshold";
      return { source, score, selected, reason };
    });
    const sources = sourceEvaluations.filter((evaluation) => evaluation.selected).map((evaluation) => evaluation.source);

    const extractedCandidates = sources.flatMap((source) => deterministicExtractionEngine.extractCandidates(source, context));
    const candidateEvaluations = extractedCandidates.map((candidate) => {
      const tripMatch = importCandidateMatchesActiveTrip(candidate, context);
      return {
        candidate,
        selected: tripMatch.matches,
        reason: tripMatch.reason,
      };
    });
    const candidates = candidateEvaluations.filter((evaluation) => evaluation.selected).map((evaluation) => evaluation.candidate);
    const candidateSourceIds = new Set(candidates.map((candidate) => candidate.sourceId));
    const applied = applyImportCandidates(context.planner, candidates);
    const importedSourceIds = new Set(currentTripState.importedSourceIds);
    for (const decision of applied.decisions) {
      if (decision.status === "applied" || decision.status === "needs-user-fix" || decision.status === "ignored") {
        importedSourceIds.add(decision.sourceId);
      }
    }

    const finishedAt = new Date().toISOString();
    const debug: ImportRunDebug = {
      queries,
      querySignature,
      forceFullSearch: options.forceFullSearch,
      usedHistory: fetchUsedHistory,
      staleHistory,
      rawMessageCount: fetchDebug?.rawMessageCount,
      metadataSourceCount: fetchDebug?.metadataSourceCount,
      fullFetchCount: fetchDebug?.fullFetchCount,
      skippedMessageCount: fetchDebug?.skippedMessageCount,
      fetchedSourceCount: availableSources.length,
      selectedSourceCount: sources.length,
      sources:
        sourceEvaluations.length > 0
          ? sourceEvaluations.map((evaluation) =>
              debugSourceFrom(
                evaluation.source,
                evaluation.selected,
                evaluation.selected && !candidateSourceIds.has(evaluation.source.id)
                  ? "Selected for extraction, but no importable dates and places were found"
                  : evaluation.reason,
                evaluation.score,
              ),
            )
          : (fetchDebug?.metadataSources ?? []).map((source) => ({
              ...source,
              selected: false,
              reason: "Metadata did not pass full-message fetch threshold",
            })),
      candidates: candidateEvaluations.map(({ candidate, selected, reason }) => ({
        id: candidate.id,
        sourceId: candidate.sourceId,
        kind: candidate.kind,
        confidence: candidate.confidence,
        title: candidate.title,
        startDate: candidate.startDate,
        endDate: candidate.endDate,
        selected,
        reason,
      })),
      decisions: applied.decisions.map((decision) => ({
        sourceId: decision.sourceId,
        candidateId: decision.candidateId,
        status: decision.status,
        reason: decision.reason,
      })),
    };
    const nextTripState: GmailTripImportState = {
      lastCheckedAt: finishedAt,
      lastQuerySignature: querySignature,
      historyId: resolveGmailHistoryIdAfterSync({
        sources,
        currentHistoryId: currentTripState.historyId,
        fetchedHistoryId: sourceHistoryId,
        staleHistory,
      }),
      importedSourceIds: [...importedSourceIds],
      decisions: [...currentTripState.decisions, ...applied.decisions].slice(-200),
    };
    const nextState: GmailImportState = {
      ...current,
      status: "connected",
      lastCheckedAt: nextTripState.lastCheckedAt,
      lastQuerySignature: nextTripState.lastQuerySignature,
      historyId: nextTripState.historyId,
      importedSourceIds: nextTripState.importedSourceIds,
      decisions: nextTripState.decisions,
      tripStates: {
        ...current.tripStates,
        [context.trip.id]: nextTripState,
      },
      error: undefined,
    };
    writeState(nextState);

    const run: ImportRun = {
      ...baseRun,
      status: "success",
      finishedAt,
      lastCheckedAt: finishedAt,
      historyId: nextState.historyId,
      fetchedCount: sources.length,
      candidateCount: candidates.length,
      appliedCount: applied.decisions.filter((decision) => decision.status === "applied").length,
      ignoredCount: applied.decisions.filter((decision) => decision.status === "ignored" || decision.status === "needs-user-fix").length,
      failedCount: applied.decisions.filter((decision) => decision.status === "failed").length,
      debug,
    };

    return {
      run,
      candidates,
      decisions: applied.decisions,
      planner: hasPlannerImportChanges(applied.decisions)
        ? {
            items: applied.items,
            customBases: applied.customBases,
          }
        : undefined,
      state: nextState,
    };
  },
};
