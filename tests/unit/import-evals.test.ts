import { describe, expect, it } from "vitest";
import { applyImportCandidates } from "../../src/domain/imports/applyImport";
import { deterministicExtractionEngine, scoreImportSource } from "../../src/domain/imports/extraction";
import { duplicateBookingEmailFixtures, importEmailFixtures } from "../fixtures/importEmailFixtures";
import { tripFixture } from "../fixtures/plannerFixtures";

describe("Gmail import eval fixtures", () => {
  for (const fixture of importEmailFixtures) {
    it(fixture.description, async () => {
      const score = scoreImportSource(fixture.source);
      const candidates = await Promise.resolve(
        deterministicExtractionEngine.extractCandidates(fixture.source, {
          trip: fixture.trip,
          planner: fixture.planner,
        }),
      );
      const applied = applyImportCandidates(fixture.planner, candidates, {
        importedAt: "2026-05-01T10:00:00.000Z",
      });

      expect(score >= 0.45).toBe(fixture.expected.selected);
      expect(candidates.map((candidate) => candidate.kind)).toEqual(fixture.expected.candidateKinds);
      expect(candidates.every((candidate) => candidate.title.length <= 90)).toBe(true);
      expect(candidates.every((candidate) => !/[.!?]\s+[A-Z0-9]/.test(candidate.title))).toBe(true);

      if (fixture.expected.candidates) {
        expect(candidates).toMatchObject(fixture.expected.candidates);
      }

      if (fixture.expected.appliedItemCount !== undefined) {
        expect(applied.items).toHaveLength(fixture.expected.appliedItemCount);
      }

      if (fixture.expected.appliedBaseNames) {
        expect(applied.customBases.map((base) => base.baseName)).toEqual(fixture.expected.appliedBaseNames);
      }
    });
  }

  it("deduplicates multiple emails for the same booking reference", async () => {
    const trip = tripFixture({
      startDate: "2026-04-29",
      endDate: "2026-05-04",
      planner: { items: [], customBases: [] },
    });
    const context = { trip, planner: trip.planner };
    const candidates = (
      await Promise.all(
        duplicateBookingEmailFixtures.map((source) => Promise.resolve(deterministicExtractionEngine.extractCandidates(source, context))),
      )
    ).flat();

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((candidate) => candidate.bookingReference))).toEqual(new Set(["FL123"]));

    const result = applyImportCandidates(trip.planner, candidates, {
      importedAt: "2026-05-01T10:00:00.000Z",
    });

    expect(result.decisions).toMatchObject([{ status: "applied" }, { status: "applied" }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      bookingReference: "FL123",
      fromLabel: "Amsterdam, Netherlands",
      toLabel: "Santiago, Chile",
    });
  });
});
