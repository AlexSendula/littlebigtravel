import type { Trip } from "../domain/trip/types";
import type { PlannerRepository, PlannerTripsSnapshot } from "./plannerRepository";

const DB_NAME = "lbt-local-db";
const DB_VERSION = 1;
const TRIPS_STORE = "trips";
const ACTIVE_TRIP_STORAGE_KEY = "lbt-active-trip-id";

function isTrip(value: unknown): value is Trip {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Trip>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.startDate === undefined || typeof candidate.startDate === "string") &&
    (candidate.endDate === undefined || typeof candidate.endDate === "string") &&
    (candidate.archivedAt === undefined || typeof candidate.archivedAt === "string") &&
    Boolean(candidate.planner) &&
    Array.isArray(candidate.planner?.items) &&
    Array.isArray(candidate.planner?.customBases)
  );
}

function sortTrips(trips: Trip[]) {
  return [...trips].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) return updated;
    return left.name.localeCompare(right.name);
  });
}

function readActiveTripId() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY) ?? undefined;
}

function writeActiveTripId(activeTripId?: string) {
  if (typeof window === "undefined") return;
  if (activeTripId) {
    window.localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, activeTripId);
    return;
  }
  window.localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRIPS_STORE)) {
        const store = database.createObjectStore(TRIPS_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllTrips(database: IDBDatabase): Promise<Trip[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRIPS_STORE, "readonly");
    const store = transaction.objectStore(TRIPS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const trips = Array.isArray(request.result) ? request.result.filter(isTrip) : [];
      resolve(sortTrips(trips));
    };
    request.onerror = () => reject(request.error);
  });
}

function putTrips(database: IDBDatabase, trips: Trip[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRIPS_STORE, "readwrite");
    const store = transaction.objectStore(TRIPS_STORE);

    store.clear();
    for (const trip of trips) {
      store.put(trip);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const indexedDbPlannerRepository: PlannerRepository = {
  async load(): Promise<PlannerTripsSnapshot> {
    const database = await openDatabase();
    if (!database) {
      return { trips: [], activeTripId: readActiveTripId() };
    }

    try {
      const trips = await getAllTrips(database);
      return { trips, activeTripId: readActiveTripId() };
    } finally {
      database.close();
    }
  },

  async save(snapshot: PlannerTripsSnapshot): Promise<void> {
    writeActiveTripId(snapshot.activeTripId);
    const database = await openDatabase();
    if (!database) return;

    try {
      await putTrips(database, snapshot.trips);
    } finally {
      database.close();
    }
  },
};
