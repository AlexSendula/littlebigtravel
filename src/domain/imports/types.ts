import type {
  PlannerCustomBase,
  PlannerItem,
  PlannerSnapshot,
  PlannerStayType,
  PlannerTransportMode,
  Trip,
} from "../trip/types";

export type ImportProviderId = "gmail";

export type ImportSource = {
  id: string;
  provider: ImportProviderId;
  messageId: string;
  threadId?: string;
  historyId?: string;
  subject: string;
  from?: string;
  snippet?: string;
  bodyText?: string;
  receivedAt?: string;
  attachmentNames?: string[];
};

export type ImportCandidateKind = "startingTravel" | "transport" | "stay" | "activity";

export type ImportCandidate = {
  id: string;
  provider: ImportProviderId;
  sourceId: string;
  kind: ImportCandidateKind;
  confidence: number;
  title: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  fromLabel?: string;
  toLabel?: string;
  placeLabel?: string;
  placeAddress?: string;
  baseLabel?: string;
  transportMode?: PlannerTransportMode;
  stayType?: PlannerStayType;
  note?: string;
};

export type ImportDecisionStatus = "applied" | "ignored" | "failed" | "needs-user-fix";

export type ImportDecision = {
  id: string;
  provider: ImportProviderId;
  sourceId: string;
  candidateId?: string;
  status: ImportDecisionStatus;
  reason?: string;
  decidedAt: string;
};

export type ImportRun = {
  id: string;
  provider: ImportProviderId;
  status: "idle" | "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  lastCheckedAt?: string;
  historyId?: string;
  fetchedCount: number;
  candidateCount: number;
  appliedCount: number;
  ignoredCount: number;
  failedCount: number;
  errors: string[];
};

export type ImportProviderTripContext = {
  trip: Trip;
  planner: PlannerSnapshot;
};

export type ImportApplyResult = {
  items: PlannerItem[];
  customBases: PlannerCustomBase[];
  decisions: ImportDecision[];
};

export type ExtractionEngine = {
  id: string;
  extractCandidates: (source: ImportSource, context: ImportProviderTripContext) => ImportCandidate[];
};

