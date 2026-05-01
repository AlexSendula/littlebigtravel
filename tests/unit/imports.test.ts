import { describe, expect, it } from "vitest";
import { applyImportCandidates } from "../../src/domain/imports/applyImport";
import { deterministicExtractionEngine, scoreImportSource } from "../../src/domain/imports/extraction";
import { buildGmailCandidateQueries } from "../../src/domain/imports/gmailQueries";
import { createImportRunCoordinator } from "../../src/domain/imports/runCoordinator";
import type { ImportCandidate, ImportSource } from "../../src/domain/imports/types";
import { nextGmailHistoryId } from "../../src/providers/gmailImportProvider";
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

describe("Gmail import foundation", () => {
  it("builds Gmail queries from trip dates, destinations, and booking keywords", () => {
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
    expect(queries.join(" ")).toContain("after:2026/04/15");
    expect(queries.join(" ")).toContain("before:2026/05/19");
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
