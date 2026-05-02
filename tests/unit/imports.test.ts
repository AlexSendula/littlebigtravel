import { afterEach, describe, expect, it, vi } from "vitest";
import { applyImportCandidates } from "../../src/domain/imports/applyImport";
import { deterministicExtractionEngine, scoreImportSource } from "../../src/domain/imports/extraction";
import { buildGmailCandidateQueries } from "../../src/domain/imports/gmailQueries";
import { createImportRunCoordinator } from "../../src/domain/imports/runCoordinator";
import type { ImportCandidate, ImportSource } from "../../src/domain/imports/types";
import {
  buildGmailGetUrl,
  buildGmailListUrl,
  fetchGmailImportSources,
  gmailMessageToImportSource,
  isGmailAuthError,
} from "../../src/providers/gmailApiClient";
import {
  getGmailImportStateForTrip,
  gmailImportQuerySignature,
  hasPlannerImportChanges,
  importCandidateMatchesActiveTrip,
  nextGmailHistoryId,
  projectGmailImportStateForTrip,
  resolveGmailHistoryIdAfterSync,
  shouldUseGmailHistoryForQueries,
  shouldUseGmailHistoryForSync,
  type GmailImportState,
} from "../../src/providers/gmailImportProvider";
import { customBase, plannerItem, tripFixture } from "../fixtures/plannerFixtures";

function gmailSource(overrides: Partial<ImportSource> = {}): ImportSource {
  return {
    id: "gmail:msg-flight",
    provider: "gmail",
    messageId: "msg-flight",
    historyId: "10",
    subject: "Flight confirmation",
    snippet: "Your itinerary is confirmed.",
    bodyText: [
      "Flight confirmation",
      "From: Amsterdam, Netherlands",
      "To: Santiago, Chile",
      "Depart: 2026-04-29 12:00",
      "Arrive: 2026-04-30 10:15",
    ].join("\n"),
    ...overrides,
  };
}

function flightCandidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    id: "gmail:msg-flight:starting-travel",
    provider: "gmail",
    sourceId: "gmail:msg-flight",
    kind: "startingTravel",
    confidence: 0.94,
    title: "Amsterdam, Netherlands to Santiago, Chile",
    fromLabel: "Amsterdam, Netherlands",
    toLabel: "Santiago, Chile",
    startDate: "2026-04-29",
    endDate: "2026-04-30",
    startTime: "12:00",
    endTime: "10:15",
    transportMode: "flight",
    note: "Imported from Gmail",
    ...overrides,
  };
}

function gmailBody(text: string) {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("Gmail import foundation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds Gmail queries from destinations and booking keywords without filtering by trip email date", () => {
    const trip = tripFixture({
      startDate: "2026-04-29",
      endDate: "2026-05-04",
      planner: {
        items: [plannerItem({ fromLabel: "Amsterdam, Netherlands", toLabel: "Santiago, Chile" })],
        customBases: [customBase({ baseName: "Santiago, Chile" })],
      },
    });

    const queries = buildGmailCandidateQueries(trip);

    expect(queries.some((query) => query.includes('"Santiago"'))).toBe(true);
    expect(queries.join(" ")).toContain('"confirmation"');
    expect(queries.join(" ")).toContain("newer_than:18m");
    expect(queries.join(" ")).not.toContain("after:");
    expect(queries.join(" ")).not.toContain("before:");
  });

  it("uses meaningful trip-name location words as Gmail search context", () => {
    const queries = buildGmailCandidateQueries(
      tripFixture({
        name: "Patagonia, Chile & Argentina 2026",
        startDate: "2026-04-29",
        endDate: "2026-05-04",
      }),
    );

    expect(queries.some((query) => query.includes('"Patagonia"'))).toBe(true);
    expect(queries.some((query) => query.includes('"Chile"'))).toBe(true);
    expect(queries.some((query) => query.includes('"Argentina"'))).toBe(true);
  });

  it("does not treat generic test trip names as Gmail place filters", () => {
    const queries = buildGmailCandidateQueries(tripFixture({ name: "Import Test" }));

    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('"Import"');
    expect(queries[0]).not.toContain('"Test"');
  });

  it("scores irrelevant emails low and likely travel emails high", () => {
    expect(scoreImportSource(gmailSource())).toBeGreaterThan(0.7);
    expect(
      scoreImportSource(
        gmailSource({
          id: "gmail:newsletter",
          messageId: "newsletter",
          subject: "Weekly newsletter",
          snippet: "Some unrelated text.",
          bodyText: "No dates or trip planning terms here.",
        }),
      ),
    ).toBeLessThan(0.45);
  });

  it("extracts a high-confidence starting travel candidate", () => {
    const candidates = deterministicExtractionEngine.extractCandidates(gmailSource(), {
      trip: tripFixture(),
      planner: { items: [], customBases: [] },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "startingTravel",
      confidence: expect.any(Number),
      fromLabel: "Amsterdam, Netherlands",
      toLabel: "Santiago, Chile",
      startDate: "2026-04-29",
      endDate: "2026-04-30",
    });
  });

  it("extracts a flight candidate from natural route and date text", () => {
    const candidates = deterministicExtractionEngine.extractCandidates(
      gmailSource({
        subject: "Booking confirmation",
        snippet: "Your flight from Amsterdam Schiphol to Santiago is confirmed.",
        bodyText: [
          "Booking confirmation",
          "Amsterdam Schiphol (AMS) to Santiago Arturo Merino Benitez (SCL)",
          "Departure: Wed, 29 Apr 2026, 1:05 PM",
          "Arrival: Thu, 30 Apr 2026, 10:15 AM",
        ].join("\n"),
      }),
      {
        trip: tripFixture({
          startDate: "2026-04-29",
          endDate: "2026-05-04",
        }),
        planner: { items: [], customBases: [] },
      },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "startingTravel",
      fromLabel: "Amsterdam Schiphol",
      toLabel: "Santiago Arturo Merino Benitez",
      startDate: "2026-04-29",
      endDate: "2026-04-30",
      startTime: "13:05",
      endTime: "10:15",
    });
  });

  it("infers missing flight date years from the active trip range", () => {
    const candidates = deterministicExtractionEngine.extractCandidates(
      gmailSource({
        bodyText: [
          "Flight itinerary",
          "From: Amsterdam, Netherlands",
          "To: Santiago, Chile",
          "Depart: Apr 29, 13:05",
          "Arrive: Apr 30, 10:15",
        ].join("\n"),
      }),
      {
        trip: tripFixture({
          startDate: "2026-04-29",
          endDate: "2026-05-04",
        }),
        planner: { items: [], customBases: [] },
      },
    );

    expect(candidates[0]).toMatchObject({
      startDate: "2026-04-29",
      endDate: "2026-04-30",
      startTime: "13:05",
      endTime: "10:15",
    });
  });

  it("applies a flight candidate as one imported starting travel and one arrival base", () => {
    const result = applyImportCandidates({ items: [], customBases: [] }, [flightCandidate()], {
      importedAt: "2026-05-01T10:00:00.000Z",
    });

    expect(result.decisions).toMatchObject([{ status: "applied" }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      source: "imported",
      importProvider: "gmail",
      importSourceId: "gmail:msg-flight",
      isStartingTravel: true,
      fromLabel: "Amsterdam, Netherlands",
      toLabel: "Santiago, Chile",
    });
    expect(result.customBases).toHaveLength(1);
    expect(result.customBases[0]).toMatchObject({
      baseName: "Santiago, Chile",
      startDate: "2026-04-30",
    });
  });

  it("updates an imported item by source id instead of creating duplicates", () => {
    const first = applyImportCandidates({ items: [], customBases: [] }, [flightCandidate()], {
      importedAt: "2026-05-01T10:00:00.000Z",
    });
    const second = applyImportCandidates(first, [flightCandidate({ endDate: "2026-05-01" })], {
      importedAt: "2026-05-01T11:00:00.000Z",
    });

    expect(second.items).toHaveLength(1);
    expect(second.items[0].endDate).toBe("2026-05-01");
  });

  it("does not silently overwrite a matching manual item", () => {
    const result = applyImportCandidates(
      {
        items: [
          plannerItem({
            id: "manual:start",
            kind: "flight",
            isStartingTravel: true,
            fromLabel: "Amsterdam, Netherlands",
            toLabel: "Santiago, Chile",
            startDate: "2026-04-29",
          }),
        ],
        customBases: [],
      },
      [flightCandidate()],
      { importedAt: "2026-05-01T10:00:00.000Z" },
    );

    expect(result.items).toHaveLength(1);
    expect(result.decisions).toMatchObject([{ status: "needs-user-fix" }]);
  });

  it("keeps the highest Gmail history id for incremental sync state", () => {
    expect(nextGmailHistoryId([gmailSource({ historyId: "11" }), gmailSource({ id: "gmail:2", messageId: "2", historyId: "9" })], "10")).toBe("11");
  });

  it("drops stale Gmail history when fallback search has no newer cursor", () => {
    expect(resolveGmailHistoryIdAfterSync({ sources: [], currentHistoryId: "old-history", staleHistory: true })).toBeUndefined();
    expect(
      resolveGmailHistoryIdAfterSync({
        sources: [gmailSource({ historyId: "31" })],
        currentHistoryId: "old-history",
        staleHistory: true,
      }),
    ).toBe("31");
  });

  it("forces a fresh Gmail search when trip import context changes", () => {
    const emptyTripQueries = buildGmailCandidateQueries(tripFixture());
    const plannedTripQueries = buildGmailCandidateQueries(
      tripFixture({
        startDate: "2026-04-29",
        endDate: "2026-05-04",
        planner: {
          items: [plannerItem({ fromLabel: "Amsterdam, Netherlands", toLabel: "Santiago, Chile" })],
          customBases: [customBase({ baseName: "Santiago, Chile" })],
        },
      }),
    );

    const emptySignature = gmailImportQuerySignature(emptyTripQueries);

    expect(shouldUseGmailHistoryForQueries(emptySignature, emptyTripQueries)).toBe(true);
    expect(shouldUseGmailHistoryForQueries(emptySignature, plannedTripQueries)).toBe(false);
  });

  it("bypasses Gmail history for manual full checks", () => {
    const queries = buildGmailCandidateQueries(
      tripFixture({
        startDate: "2026-04-29",
        endDate: "2026-05-04",
      }),
    );
    const signature = gmailImportQuerySignature(queries);

    expect(shouldUseGmailHistoryForSync(signature, queries)).toBe(true);
    expect(shouldUseGmailHistoryForSync(signature, queries, { forceFullSearch: true })).toBe(false);
  });

  it("projects Gmail import cursors and reviewed source ids per active trip", () => {
    const state: GmailImportState = {
      connected: true,
      status: "connected",
      lastCheckedAt: "2026-05-01T09:00:00.000Z",
      historyId: "legacy-history",
      lastQuerySignature: "legacy-query",
      importedSourceIds: ["gmail:legacy"],
      decisions: [],
      tripStates: {
        "trip-a": {
          lastCheckedAt: "2026-05-01T10:00:00.000Z",
          historyId: "trip-a-history",
          lastQuerySignature: "trip-a-query",
          importedSourceIds: ["gmail:trip-a"],
          decisions: [
            {
              id: "decision-a",
              provider: "gmail",
              sourceId: "gmail:trip-a",
              status: "applied",
              decidedAt: "2026-05-01T10:00:00.000Z",
            },
          ],
        },
        "trip-b": {
          lastCheckedAt: "2026-05-01T11:00:00.000Z",
          historyId: "trip-b-history",
          lastQuerySignature: "trip-b-query",
          importedSourceIds: ["gmail:trip-b"],
          decisions: [],
        },
      },
    };

    expect(getGmailImportStateForTrip(state, "trip-a")).toMatchObject({
      historyId: "trip-a-history",
      importedSourceIds: ["gmail:trip-a"],
    });
    expect(projectGmailImportStateForTrip(state, "trip-b")).toMatchObject({
      lastCheckedAt: "2026-05-01T11:00:00.000Z",
      historyId: "trip-b-history",
      lastQuerySignature: "trip-b-query",
      importedSourceIds: ["gmail:trip-b"],
    });
    expect(projectGmailImportStateForTrip(state, "unknown-trip")).toMatchObject({
      lastCheckedAt: undefined,
      historyId: undefined,
      lastQuerySignature: undefined,
      importedSourceIds: [],
      decisions: [],
    });
  });

  it("only publishes planner snapshots when import decisions changed planner data", () => {
    expect(hasPlannerImportChanges([])).toBe(false);
    expect(
      hasPlannerImportChanges([
        {
          id: "decision-needs-fix",
          provider: "gmail",
          sourceId: "gmail:needs-fix",
          status: "needs-user-fix",
          decidedAt: "2026-05-01T10:00:00.000Z",
        },
      ]),
    ).toBe(false);
    expect(
      hasPlannerImportChanges([
        {
          id: "decision-applied",
          provider: "gmail",
          sourceId: "gmail:applied",
          status: "applied",
          decidedAt: "2026-05-01T10:00:00.000Z",
        },
      ]),
    ).toBe(true);
  });

  it("rejects extracted Gmail candidates that fall outside the active trip", () => {
    const activeTrip = tripFixture({
      startDate: "2026-05-10",
      endDate: "2026-05-20",
      planner: {
        items: [],
        customBases: [],
      },
    });

    expect(
      importCandidateMatchesActiveTrip(flightCandidate({ startDate: "2026-03-29", endDate: "2026-03-30" }), {
        trip: activeTrip,
        planner: activeTrip.planner,
      }),
    ).toMatchObject({
      matches: false,
      reason: expect.stringContaining("Outside active trip date window"),
    });

    expect(
      importCandidateMatchesActiveTrip(flightCandidate({ startDate: "2026-05-12", endDate: "2026-05-13" }), {
        trip: activeTrip,
        planner: activeTrip.planner,
      }),
    ).toMatchObject({ matches: true });
  });

  it("builds Gmail API request URLs for search and message fetches", () => {
    const listUrl = new URL(buildGmailListUrl('"Santiago" "confirmation"'));
    expect(listUrl.origin).toBe("https://gmail.googleapis.com");
    expect(listUrl.pathname).toBe("/gmail/v1/users/me/messages");
    expect(listUrl.searchParams.get("q")).toBe('"Santiago" "confirmation"');
    expect(listUrl.searchParams.get("maxResults")).toBe("20");

    const getUrl = new URL(buildGmailGetUrl("message/with/slash", "metadata"));
    expect(getUrl.pathname).toBe("/gmail/v1/users/me/messages/message%2Fwith%2Fslash");
    expect(getUrl.searchParams.get("format")).toBe("metadata");
    expect(getUrl.searchParams.getAll("metadataHeaders")).toEqual(["Subject", "From", "Date"]);
  });

  it("parses Gmail full messages into import sources", () => {
    const source = gmailMessageToImportSource({
      id: "msg-1",
      threadId: "thread-1",
      historyId: "25",
      snippet: "Confirmed itinerary",
      internalDate: String(Date.UTC(2026, 3, 20, 10, 0, 0)),
      payload: {
        headers: [
          { name: "Subject", value: "Flight confirmation" },
          { name: "From", value: "Airline <bookings@example.com>" },
        ],
        parts: [
          {
            mimeType: "text/plain",
            body: {
              data: gmailBody("From: Amsterdam, Netherlands\nTo: Santiago, Chile\nDepart: 2026-04-29 12:00"),
            },
          },
          {
            filename: "ticket.pdf",
            mimeType: "application/pdf",
            body: { attachmentId: "attachment-1" },
          },
        ],
      },
    });

    expect(source).toMatchObject({
      id: "gmail:msg-1",
      messageId: "msg-1",
      threadId: "thread-1",
      historyId: "25",
      subject: "Flight confirmation",
      from: "Airline <bookings@example.com>",
      attachmentNames: ["ticket.pdf"],
    });
    expect(source?.bodyText).toContain("Amsterdam, Netherlands");
    expect(source?.receivedAt).toBe("2026-04-20T10:00:00.000Z");
  });

  it("falls back to search when Gmail history is stale", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Stale history" } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "msg-flight" }] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "msg-flight",
            threadId: "thread-flight",
            historyId: "30",
            snippet: "Flight confirmation itinerary",
            payload: {
              headers: [
                { name: "Subject", value: "Flight confirmation" },
                { name: "From", value: "Airline <bookings@example.com>" },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "msg-flight",
            threadId: "thread-flight",
            historyId: "30",
            snippet: "Flight confirmation itinerary",
            payload: {
              headers: [{ name: "Subject", value: "Flight confirmation" }],
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: gmailBody("From: Amsterdam, Netherlands\nTo: Santiago, Chile\nDepart: 2026-04-29 12:00\nArrive: 2026-04-30 10:15"),
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await fetchGmailImportSources({
      accessToken: "token",
      queries: ['"Santiago" "confirmation"'],
      historyId: "old-history",
    });

    expect(result.staleHistory).toBe(true);
    expect(result.usedHistory).toBe(false);
    expect(result.debug).toMatchObject({
      rawMessageCount: 1,
      metadataSourceCount: 1,
      fullFetchCount: 1,
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].bodyText).toContain("Arrive: 2026-04-30 10:15");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("skips unavailable Gmail history messages and recovers with query search", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            history: [{ messagesAdded: [{ message: { id: "msg-deleted" } }] }],
            historyId: "31",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Message not found" } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "msg-flight" }] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "msg-flight",
            threadId: "thread-flight",
            historyId: "32",
            snippet: "Flight confirmation itinerary",
            payload: {
              headers: [
                { name: "Subject", value: "Flight confirmation" },
                { name: "From", value: "Airline <bookings@example.com>" },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "msg-flight",
            threadId: "thread-flight",
            historyId: "32",
            snippet: "Flight confirmation itinerary",
            payload: {
              headers: [{ name: "Subject", value: "Flight confirmation" }],
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: gmailBody("From: Amsterdam, Netherlands\nTo: Berlin, Germany\nDepart: 2026-04-29"),
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await fetchGmailImportSources({
      accessToken: "token",
      queries: ['"Berlin" "confirmation"'],
      historyId: "old-history",
    });

    expect(result.staleHistory).toBe(true);
    expect(result.usedHistory).toBe(false);
    expect(result.debug.skippedMessageCount).toBe(1);
    expect(result.debug.skippedMessages[0]).toMatchObject({
      id: "msg-deleted",
      stage: "metadata",
      status: 404,
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].bodyText).toContain("Berlin, Germany");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("marks Gmail authorization failures as reconnectable auth errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }));

    await expect(fetchGmailImportSources({ accessToken: "expired", queries: ['"Santiago"'] })).rejects.toSatisfy(isGmailAuthError);
  });

  it("coalesces repeated import runs into one in-flight run and one follow-up", async () => {
    let count = 0;
    const coordinator = createImportRunCoordinator(async () => {
      count += 1;
      await Promise.resolve();
    });

    const first = coordinator.trigger();
    const second = coordinator.trigger();
    const third = coordinator.trigger();
    await Promise.all([first, second, third]);

    expect(count).toBe(2);
  });
});
