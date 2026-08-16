import type { PlannerCustomBase, PlannerItem, PlannerTransportMode, Trip } from "../../src/domain/trip/types";

export const TEST_NOW = "2026-04-29T12:00:00.000Z";
export const START_TRAVEL_BASE_ID = "__start_travel__";

export function plannerItem(overrides: Partial<PlannerItem> = {}): PlannerItem {
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

export function customBase(overrides: Partial<PlannerCustomBase> = {}): PlannerCustomBase {
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

export function startingTravel(
  overrides: Partial<PlannerItem> = {},
  transportMode: PlannerTransportMode = "flight",
): PlannerItem {
  return plannerItem({
    id: "item:start",
    kind: transportMode === "flight" ? "flight" : "transport",
    title: "Amsterdam, Netherlands to Santiago, Chile",
    note: "Bring the hiking layers.",
    startDate: "2026-04-29",
    endDate: "2026-04-30",
    baseId: START_TRAVEL_BASE_ID,
    fromLabel: "Amsterdam, Netherlands",
    toLabel: "Santiago, Chile",
    fromCoordinates: [4.9041, 52.3676],
    toCoordinates: [-70.6693, -33.4489],
    fromCountry: "Netherlands",
    toCountry: "Chile",
    fromCountryCode: "NL",
    toCountryCode: "CL",
    fromMapStopId: "place:amsterdam-netherlands",
    toMapStopId: "santiago",
    toBaseId: "custom:santiago",
    destinationId: "santiago",
    transportMode,
    isStartingTravel: true,
    autoLinkedItemsEnabled: true,
    order: 0,
    ...overrides,
  });
}

export function stayItem(overrides: Partial<PlannerItem> = {}): PlannerItem {
  return plannerItem({
    id: "item:stay",
    kind: "stay",
    title: "Walking Santiago Boutique Hostel",
    note: "Door code in booking notes.",
    startDate: "2026-04-30",
    endDate: "2026-05-01",
    startTime: "15:00",
    endTime: "",
    stayType: "hostel",
    placeLabel: "Walking Santiago Boutique Hostel",
    placeAddress: "Walking Santiago Boutique Hostel, Almirante Barroso 457, Santiago, Chile",
    placeCoordinates: [-70.6645, -33.4401],
    placeCountry: "Chile",
    placeCountryCode: "CL",
    baseId: "custom:santiago",
    baseName: "Santiago, Chile",
    order: 100,
    ...overrides,
  });
}

export function activityItem(overrides: Partial<PlannerItem> = {}): PlannerItem {
  return plannerItem({
    id: "item:activity",
    kind: "activity",
    title: "Laguna Torre",
    note: "",
    startDate: "2026-05-02",
    startTime: "09:00",
    endTime: "15:00",
    baseId: "custom:el-chalten",
    baseName: "El Chalten",
    placeLabel: "Laguna Torre",
    placeAddress: "Laguna Torre, Santa Cruz, Argentina",
    placeCoordinates: [-73.0001, -49.3165],
    placeCountry: "Argentina",
    placeCountryCode: "AR",
    showOnMap: true,
    order: 100,
    ...overrides,
  });
}

export function tripFixture(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip:test",
    name: "Test Trip",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    planner: {
      items: [],
      customBases: [],
    },
    ...overrides,
  };
}
