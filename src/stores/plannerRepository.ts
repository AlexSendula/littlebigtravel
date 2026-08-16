import type { PlannerCustomBase, PlannerItem } from "../planner";
import type { Trip } from "../domain/trip/types";

export type PlannerSnapshot = {
  items: PlannerItem[];
  customBases: PlannerCustomBase[];
};

export type PlannerTripsSnapshot = {
  trips: Trip[];
  activeTripId?: string;
};

export type PlannerRepository = {
  load(): Promise<PlannerTripsSnapshot>;
  save(snapshot: PlannerTripsSnapshot): Promise<void>;
};
