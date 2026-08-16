import { describe, expect, it } from "vitest";
import { buildPlannerMapData } from "../../src/domain/trip/mapData";
import type { PlannerCustomBase, PlannerItem } from "../../src/domain/trip/types";
import { activityItem, startingTravel } from "../fixtures/plannerFixtures";

function plannerItem(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: "item:default",
    kind: "activity",
    title: "Untitled",
    note: "",
    startDate: "2026-05-01",
    baseId: "custom:santiago",
    source: "manual",
    order: 100,
    ...overrides,
  };
}

function customBase(overrides: Partial<PlannerCustomBase>): PlannerCustomBase {
  return {
    id: "custom:santiago",
    baseName: "Santiago, Chile",
    startDate: "2026-04-30",
    coordinates: [-70.6693, -33.4489],
    country: "Chile",
    countryCode: "CL",
    mapStopId: "santiago",
    ...overrides,
  };
}

describe("planner map data", () => {
  it("deduplicates route labels and custom bases for the same city", () => {
    const data = buildPlannerMapData(
      [
        plannerItem({
          id: "start",
          kind: "flight",
          title: "Amsterdam to Santiago",
          isStartingTravel: true,
          baseId: "__start_travel__",
          fromLabel: "Amsterdam, Netherlands",
          fromCoordinates: [4.9041, 52.3676],
          fromCountry: "Netherlands",
          fromCountryCode: "NL",
          toLabel: "Santiago, Chile",
          toCoordinates: [-70.6693, -33.4489],
          toCountry: "Chile",
          toCountryCode: "CL",
          toBaseId: "custom:santiago",
          destinationId: "santiago",
          startDate: "2026-04-29",
          endDate: "2026-04-30",
          order: 0,
        }),
      ],
      [customBase({ endDate: "2026-05-03" })],
    );

    expect(data.stops.filter((stop) => stop.name === "Santiago")).toHaveLength(1);
    expect(data.stops.map((stop) => stop.name)).toContain("Amsterdam");
  });

  it("orders mappable activities inside their parent base before the next base", () => {
    const data = buildPlannerMapData(
      [
        plannerItem({
          id: "laguna-torre",
          title: "Laguna Torre",
          startDate: "2026-05-02",
          baseId: "custom:el-chalten",
          baseName: "El Chalten",
          placeLabel: "Laguna Torre",
          placeMapStopId: "laguna-torre",
          showOnMap: true,
        }),
      ],
      [
        customBase({ id: "custom:el-chalten", baseName: "El Chalten", startDate: "2026-05-01", endDate: "2026-05-03", mapStopId: "el-chalten" }),
        customBase({ id: "custom:mendoza", baseName: "Mendoza", startDate: "2026-05-04", mapStopId: "mendoza" }),
      ],
    );

    const names = data.stops.map((stop) => stop.name);
    expect(names.indexOf("El Chalten")).toBeLessThan(names.indexOf("Laguna Torre"));
    expect(names.indexOf("Laguna Torre")).toBeLessThan(names.indexOf("Mendoza"));
  });

  it("keeps the starting travel origin before the first base", () => {
    const data = buildPlannerMapData(
      [startingTravel()],
      [customBase({ id: "custom:santiago", baseName: "Santiago, Chile", startDate: "2026-04-30", mapStopId: "santiago" })],
    );

    const names = data.stops.map((stop) => stop.name);
    expect(names.indexOf("Amsterdam")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Amsterdam")).toBeLessThan(names.indexOf("Santiago"));
  });

  it("shows a far or opted-in activity only once inside its parent base sequence", () => {
    const data = buildPlannerMapData(
      [
        activityItem({
          id: "laguna-torre",
          baseId: "custom:el-chalten",
          startDate: "2026-05-08",
          placeLabel: "Laguna Torre",
          placeAddress: "",
          placeMapStopId: "laguna-torre",
          placeCoordinates: [-73.0001, -49.3165],
          placeCountry: "Argentina",
          placeCountryCode: "AR",
          showOnMap: true,
        }),
      ],
      [
        customBase({ id: "custom:el-chalten", baseName: "El Chalten", startDate: "2026-05-07", mapStopId: "el-chalten" }),
        customBase({ id: "custom:mendoza", baseName: "Mendoza", startDate: "2026-05-10", mapStopId: "mendoza" }),
      ],
    );

    const names = data.stops.map((stop) => stop.name);
    expect(names.filter((name) => name === "El Chalten")).toHaveLength(1);
    expect(names.filter((name) => name === "Laguna Torre")).toHaveLength(1);
    expect(names).toEqual(["El Chalten", "Laguna Torre", "Mendoza"]);
  });
});
