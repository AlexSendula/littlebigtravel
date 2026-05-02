import { scoreImportSource } from "../domain/imports/extraction";
import type { ImportSource } from "../domain/imports/types";

const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_MESSAGES_PER_QUERY = 20;
const MAX_FULL_MESSAGES_PER_RUN = 12;
const METADATA_SCORE_THRESHOLD = 0.2;

export class GmailApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
  }
}

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessagePartBody = {
  data?: string;
  attachmentId?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  historyId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart & {
    headers?: GmailHeader[];
  };
};

type GmailListResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
};

type GmailHistoryResponse = {
  history?: Array<{
    messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }>;
    messages?: Array<{ id?: string; threadId?: string }>;
  }>;
  historyId?: string;
};

export type GmailFetchResult = {
  sources: ImportSource[];
  historyId?: string;
  usedHistory: boolean;
  staleHistory: boolean;
  debug: {
    rawMessageCount: number;
    metadataSourceCount: number;
    fullFetchCount: number;
    fullFetchLimit: number;
    skippedMessageCount: number;
    skippedMessages: Array<{
      id: string;
      stage: "metadata" | "full";
      status: number;
      reason: string;
    }>;
    metadataSources: Array<{
      id: string;
      subject: string;
      from?: string;
      receivedAt?: string;
      score: number;
    }>;
  };
};

export function buildGmailListUrl(query: string, maxResults = MAX_MESSAGES_PER_QUERY) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    fields: "messages(id,threadId),nextPageToken,resultSizeEstimate",
  });
  return `${GMAIL_API_BASE_URL}/messages?${params.toString()}`;
}

export function buildGmailGetUrl(messageId: string, format: "metadata" | "full") {
  const params = new URLSearchParams({
    format,
  });
  if (format === "metadata") {
    params.append("metadataHeaders", "Subject");
    params.append("metadataHeaders", "From");
    params.append("metadataHeaders", "Date");
    params.append("fields", "id,threadId,historyId,snippet,internalDate,payload(headers)");
  } else {
    params.append("fields", "id,threadId,historyId,snippet,internalDate,payload");
  }
  return `${GMAIL_API_BASE_URL}/messages/${encodeURIComponent(messageId)}?${params.toString()}`;
}

function buildGmailHistoryUrl(historyId: string) {
  const params = new URLSearchParams({
    startHistoryId: historyId,
    historyTypes: "messageAdded",
    maxResults: "20",
    fields: "history(messagesAdded(message(id,threadId)),messages(id,threadId)),historyId,nextPageToken",
  });
  return `${GMAIL_API_BASE_URL}/history?${params.toString()}`;
}

async function gmailFetchJson<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new GmailApiError(`Gmail API request failed with ${response.status}.`, response.status);
  }
  return (await response.json()) as T;
}

async function listMessageIdsForQueries(accessToken: string, queries: string[]) {
  const ids = new Map<string, string | undefined>();
  for (const query of queries) {
    const result = await gmailFetchJson<GmailListResponse>(accessToken, buildGmailListUrl(query));
    for (const message of result.messages ?? []) {
      if (message.id) ids.set(message.id, message.threadId);
    }
  }
  return [...ids.keys()];
}

async function listMessageIdsFromHistory(accessToken: string, historyId: string) {
  const response = await gmailFetchJson<GmailHistoryResponse>(accessToken, buildGmailHistoryUrl(historyId));
  const ids = new Map<string, string | undefined>();
  for (const entry of response.history ?? []) {
    for (const added of entry.messagesAdded ?? []) {
      if (added.message?.id) ids.set(added.message.id, added.message.threadId);
    }
    for (const message of entry.messages ?? []) {
      if (message.id) ids.set(message.id, message.threadId);
    }
  }
  return {
    ids: [...ids.keys()],
    historyId: response.historyId,
  };
}

function headerValue(message: GmailMessage, headerName: string) {
  const header = message.payload?.headers?.find((item) => item.name?.toLowerCase() === headerName.toLowerCase());
  return header?.value;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectPartText(part: GmailMessagePart | undefined, output: string[], attachmentNames: string[]) {
  if (!part) return;
  if (part.filename) attachmentNames.push(part.filename);
  if (part.body?.data && (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
    const decoded = decodeBase64Url(part.body.data);
    output.push(part.mimeType === "text/html" ? stripHtml(decoded) : decoded);
  }
  for (const child of part.parts ?? []) collectPartText(child, output, attachmentNames);
}

export function gmailMessageToImportSource(message: GmailMessage): ImportSource | undefined {
  if (!message.id) return undefined;
  const text: string[] = [];
  const attachmentNames: string[] = [];
  collectPartText(message.payload, text, attachmentNames);
  const dateHeader = headerValue(message, "Date");
  const parsedDateHeader = dateHeader ? new Date(dateHeader) : undefined;
  const receivedAt =
    message.internalDate && Number.isFinite(Number(message.internalDate))
      ? new Date(Number(message.internalDate)).toISOString()
      : parsedDateHeader && !Number.isNaN(parsedDateHeader.getTime())
        ? parsedDateHeader.toISOString()
        : undefined;

  return {
    id: `gmail:${message.id}`,
    provider: "gmail",
    messageId: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    subject: headerValue(message, "Subject") ?? "(no subject)",
    from: headerValue(message, "From"),
    snippet: message.snippet,
    bodyText: text.join("\n\n").trim() || undefined,
    receivedAt,
    attachmentNames,
  };
}

async function fetchMessageSource(accessToken: string, messageId: string, format: "metadata" | "full") {
  const message = await gmailFetchJson<GmailMessage>(accessToken, buildGmailGetUrl(messageId, format));
  return gmailMessageToImportSource(message);
}

async function fetchMessageSourceOrSkip(accessToken: string, messageId: string, format: "metadata" | "full") {
  try {
    return {
      source: await fetchMessageSource(accessToken, messageId, format),
    };
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) {
      return {
        skipped: {
          id: messageId,
          stage: format,
          status: error.status,
          reason: "Gmail returned a message id that is no longer available.",
        },
      };
    }
    throw error;
  }
}

function debugSourceSummary(source: ImportSource) {
  return {
    id: source.id,
    subject: source.subject,
    from: source.from,
    receivedAt: source.receivedAt,
    score: scoreImportSource(source),
  };
}

export async function fetchGmailImportSources({
  accessToken,
  queries,
  historyId,
}: {
  accessToken: string;
  queries: string[];
  historyId?: string;
}): Promise<GmailFetchResult> {
  let ids: string[] = [];
  let nextHistoryId: string | undefined;
  let usedHistory = false;
  let staleHistory = false;
  const skippedMessages: GmailFetchResult["debug"]["skippedMessages"] = [];

  if (historyId) {
    try {
      const history = await listMessageIdsFromHistory(accessToken, historyId);
      ids = history.ids;
      nextHistoryId = history.historyId;
      usedHistory = true;
    } catch (error) {
      if (error instanceof GmailApiError && error.status === 404) {
        staleHistory = true;
      } else {
        throw error;
      }
    }
  }

  if (!usedHistory || staleHistory) {
    ids = await listMessageIdsForQueries(accessToken, queries);
    usedHistory = false;
  }

  const fetchMetadataSources = async (messageIds: string[]) => {
    const sources: ImportSource[] = [];
    const skipped: GmailFetchResult["debug"]["skippedMessages"] = [];
    for (const id of messageIds) {
      const result = await fetchMessageSourceOrSkip(accessToken, id, "metadata");
      if (result.source) sources.push(result.source);
      if (result.skipped) skipped.push(result.skipped);
    }
    return { sources, skipped };
  };

  let metadataResult = await fetchMetadataSources(ids);
  let metadataSources = metadataResult.sources;
  skippedMessages.push(...metadataResult.skipped);

  // History can reference messages that were deleted or moved before we fetch
  // them. Treat that as a stale incremental cursor and recover with the normal
  // search query so one unavailable message does not break Gmail import.
  if (usedHistory && metadataResult.skipped.some((item) => item.status === 404)) {
    staleHistory = true;
    usedHistory = false;
    ids = await listMessageIdsForQueries(accessToken, queries);
    metadataResult = await fetchMetadataSources(ids);
    metadataSources = metadataResult.sources;
    skippedMessages.push(...metadataResult.skipped);
    nextHistoryId = undefined;
  }

  const fullFetchIds = metadataSources
    .filter((source) => scoreImportSource(source) >= METADATA_SCORE_THRESHOLD)
    .slice(0, MAX_FULL_MESSAGES_PER_RUN)
    .map((source) => source.messageId);

  const fullSources: ImportSource[] = [];
  for (const id of fullFetchIds) {
    const result = await fetchMessageSourceOrSkip(accessToken, id, "full");
    if (result.source) fullSources.push(result.source);
    if (result.skipped) skippedMessages.push(result.skipped);
  }

  return {
    sources: fullSources,
    historyId: nextHistoryId,
    usedHistory,
    staleHistory,
    debug: {
      rawMessageCount: ids.length,
      metadataSourceCount: metadataSources.length,
      fullFetchCount: fullSources.length,
      fullFetchLimit: MAX_FULL_MESSAGES_PER_RUN,
      skippedMessageCount: skippedMessages.length,
      skippedMessages,
      metadataSources: metadataSources.map(debugSourceSummary),
    },
  };
}

export function isGmailAuthError(error: unknown) {
  return error instanceof GmailApiError && (error.status === 401 || error.status === 403);
}
