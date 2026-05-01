import { applyImportCandidates } from "../domain/imports/applyImport";
import { deterministicExtractionEngine, scoreImportSource } from "../domain/imports/extraction";
import { buildGmailCandidateQueries } from "../domain/imports/gmailQueries";
import type { ImportCandidate, ImportDecision, ImportProviderTripContext, ImportRun, ImportSource } from "../domain/imports/types";
import type { PlannerSnapshot } from "../domain/trip/types";

const GMAIL_IMPORT_STORAGE_KEY = "lbt-gmail-import-state-v1";

export type GmailConnectionStatus = "disconnected" | "connected" | "setup-needed" | "error";

export type GmailImportState = {
  connected: boolean;
  status: GmailConnectionStatus;
  lastCheckedAt?: string;
  historyId?: string;
  importedSourceIds: string[];
  decisions: ImportDecision[];
  error?: string;
};

export type GmailSyncResult = {
  run: ImportRun;
  candidates: ImportCandidate[];
  decisions: ImportDecision[];
  planner?: PlannerSnapshot;
  state: GmailImportState;
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
  };
}

function readState(): GmailImportState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GMAIL_IMPORT_STORAGE_KEY) ?? "null") as Partial<GmailImportState> | null;
    if (!parsed) return emptyState();
    return {
      connected: Boolean(parsed.connected),
      status: parsed.status ?? (parsed.connected ? "connected" : "disconnected"),
      lastCheckedAt: parsed.lastCheckedAt,
      historyId: parsed.historyId,
      importedSourceIds: Array.isArray(parsed.importedSourceIds) ? parsed.importedSourceIds.filter((id): id is string => typeof id === "string") : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      error: parsed.error,
    };
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
  return queries.some((query) => {
    const quotedTerms = [...query.matchAll(/"([^"]+)"/g)].map((match) => match[1].toLowerCase());
    return quotedTerms.some((term) => haystack.includes(term));
  });
}

export function nextGmailHistoryId(sources: ImportSource[], existing?: string) {
  return sources.reduce((best, source) => {
    if (!source.historyId) return best;
    if (!best) return source.historyId;
    return source.historyId.localeCompare(best, undefined, { numeric: true }) > 0 ? source.historyId : best;
  }, existing);
}

function isNewerHistoryId(next?: string, current?: string) {
  if (!next || !current) return false;
  return next.localeCompare(current, undefined, { numeric: true }) > 0;
}

function runId() {
  return `gmail-run:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
}

export const gmailImportProvider = {
  id: "gmail" as const,

  getState() {
    return readState();
  },

  connect() {
    const current = readState();
    if (!hasTestMessages()) {
      const next: GmailImportState = {
        ...current,
        connected: false,
        status: "setup-needed",
        error: "Gmail OAuth is not configured for this local build yet.",
      };
      writeState(next);
      return next;
    }

    const next: GmailImportState = {
      ...current,
      connected: true,
      status: "connected",
      error: undefined,
    };
    writeState(next);
    return next;
  },

  disconnect() {
    const current = readState();
    const next: GmailImportState = {
      ...current,
      connected: false,
      status: "disconnected",
      error: undefined,
    };
    writeState(next);
    return next;
  },

  async sync(context: ImportProviderTripContext): Promise<GmailSyncResult> {
    const startedAt = new Date().toISOString();
    const current = readState();
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
      historyId: current.historyId,
      lastCheckedAt: current.lastCheckedAt,
    };

    if (!current.connected) {
      const run = { ...baseRun, status: "skipped" as const, finishedAt: startedAt };
      return { run, candidates: [], decisions: [], state: current };
    }

    const queries = buildGmailCandidateQueries(context.trip);
    const alreadyImported = new Set(current.importedSourceIds);
    const importedPlannerSourceIds = new Set(
      context.planner.items
        .filter((item) => item.source === "imported" && item.importProvider === "gmail")
        .map((item) => item.importSourceId)
        .filter((id): id is string => Boolean(id)),
    );
    const sources = readTestSources()
      .filter(
        (source) =>
          !alreadyImported.has(source.id) ||
          (importedPlannerSourceIds.has(source.id) && isNewerHistoryId(source.historyId, current.historyId)),
      )
      .filter((source) => sourceMatchesQueries(source, queries))
      .filter((source) => scoreImportSource(source) >= 0.45);

    const candidates = sources.flatMap((source) => deterministicExtractionEngine.extractCandidates(source, context));
    const applied = applyImportCandidates(context.planner, candidates);
    const importedSourceIds = new Set(current.importedSourceIds);
    for (const decision of applied.decisions) {
      if (decision.status === "applied" || decision.status === "needs-user-fix" || decision.status === "ignored") {
        importedSourceIds.add(decision.sourceId);
      }
    }

    const finishedAt = new Date().toISOString();
    const nextState: GmailImportState = {
      ...current,
      status: "connected",
      lastCheckedAt: finishedAt,
      historyId: nextGmailHistoryId(sources, current.historyId),
      importedSourceIds: [...importedSourceIds],
      decisions: [...current.decisions, ...applied.decisions].slice(-200),
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
    };

    return {
      run,
      candidates,
      decisions: applied.decisions,
      planner: {
        items: applied.items,
        customBases: applied.customBases,
      },
      state: nextState,
    };
  },
};
