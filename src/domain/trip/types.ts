import type { TripStop } from "../../tripData";

export type PlannerItemKind = "stay" | "tripBlock" | "flight" | "transport" | "activity" | "roadtrip" | "day";
export type PlannerDayDisplayMode = "daily" | "span";
export type PlannerTransportMode = "flight" | "car" | "bus" | "train" | "taxi" | "other";
export type PlannerStayType =
  | "apartment"
  | "hostel"
  | "hotel"
  | "campsite"
  | "camper"
  | "friend_family"
  | "overnight_transport"
  | "tbd"
  | "other";
export type PlannerBlockType = "hike" | "road_loop" | "overnight_subtrip" | "guided_tour" | "retreat" | "other";

export type PlannerCustomDayRange = {
  id: string;
  startDate: string;
  endDate?: string;
  dayDisplayMode: PlannerDayDisplayMode;
};

export type PlannerBreakdownEntry = {
  id: string;
  date: string;
  title: string;
  note: string;
};

export type PlannerItem = {
  id: string;
  kind: PlannerItemKind;
  title: string;
  note: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  baseId: string;
  baseName?: string;
  destinationId?: string;
  fromBaseId?: string;
  toBaseId?: string;
  fromLabel?: string;
  toLabel?: string;
  fromCoordinates?: [number, number];
  toCoordinates?: [number, number];
  fromCountry?: string;
  toCountry?: string;
  fromCountryCode?: string;
  toCountryCode?: string;
  fromMapStopId?: string;
  toMapStopId?: string;
  stayType?: PlannerStayType;
  placeLabel?: string;
  placeAddress?: string;
  placeCoordinates?: [number, number];
  placeCountry?: string;
  placeCountryCode?: string;
  placeMapStopId?: string;
  bookingReference?: string;
  accessCode?: string;
  contactName?: string;
  contactPhone?: string;
  blockType?: PlannerBlockType;
  overnightEntries?: PlannerBreakdownEntry[];
  isStartingTravel?: boolean;
  autoLinkedItemsEnabled?: boolean;
  hiddenAutoLinkedItems?: string[];
  transportMode?: PlannerTransportMode;
  sourceStopId?: string;
  sourceEventKey?: string;
  showOnMap?: boolean;
  source: "seed" | "manual" | "imported";
  importProvider?: "gmail";
  importSourceId?: string;
  importImportedAt?: string;
  importConfidence?: number;
  order: number;
  breakdown?: PlannerBreakdownEntry[];
};

export type PlannerCustomBase = {
  id: string;
  baseName: string;
  startDate: string;
  endDate?: string;
  note?: string;
  hiddenDays?: string[];
  coordinates?: [number, number];
  country?: string;
  countryCode?: string;
  mapStopId?: string;
  dayDisplayMode?: PlannerDayDisplayMode;
  dayRanges?: PlannerCustomDayRange[];
};

export type PlannerSnapshot = {
  items: PlannerItem[];
  customBases: PlannerCustomBase[];
};

export type Trip = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  planner: PlannerSnapshot;
};

export type PlannerTimelineKind = "transport" | "activity" | "note";

export type PlannerBaseCityRecord = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  mapStopId?: string;
  note?: string;
  dayDisplayMode?: PlannerDayDisplayMode;
  dayRanges?: PlannerCustomDayRange[];
  source: "seed" | "manual" | "derived";
};

export type PlannerTimelineEntry = {
  id: string;
  item: PlannerItem;
  kind: PlannerTimelineKind;
  base?: PlannerBaseCityRecord;
  destinationStopId?: string;
  fromBase?: PlannerBaseCityRecord;
  toBase?: PlannerBaseCityRecord;
  dayIso: string;
  dayLabel: string;
  dateLabel: string;
  timeLabel?: string;
};

export type PlannerTimelineDay = {
  dayIso: string;
  dayLabel: string;
  entries: PlannerTimelineEntry[];
};

export type PlannerTimelineModel = {
  bases: PlannerBaseCityRecord[];
  days: PlannerTimelineDay[];
};

export type PlannerSection = {
  baseId: string;
  baseName: string;
  mapStopId?: string;
  defaultDayIso?: string;
  arriveLabel: string;
  leaveLabel: string;
  days: Array<{
    dayIso: string;
    dayLabel: string;
    items: PlannerItem[];
  }>;
};

export type PlannerMapData = {
  stops: TripStop[];
  legs: import("../../tripData").TripLeg[];
  stopById: Map<string, TripStop>;
};
