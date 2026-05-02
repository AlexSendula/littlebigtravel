import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { normalizeDateRange } from "../domain/trip/date";
import type { Trip } from "../domain/trip/types";
import { measurePerformance } from "../performance/perfMetrics";
import type { PlannerCustomBase, PlannerItem } from "../planner";
import { indexedDbPlannerRepository } from "./indexedDbPlannerRepository";
import type { PlannerRepository, PlannerTripsSnapshot } from "./plannerRepository";

export type PlannerStore = {
  isLoading: boolean;
  trips: Trip[];
  activeTripId?: string;
  activeTrip?: Trip;
  plannerItems: PlannerItem[];
  setPlannerItems: Dispatch<SetStateAction<PlannerItem[]>>;
  customBases: PlannerCustomBase[];
  setCustomBases: Dispatch<SetStateAction<PlannerCustomBase[]>>;
  createTrip: (name?: string, options?: { startDate?: string; endDate?: string }) => string;
  renameTrip: (tripId: string, name: string) => void;
  selectTrip: (tripId: string) => void;
  deleteTrip: (tripId: string) => void;
  archiveTrip: (tripId: string) => void;
  restoreTrip: (tripId: string) => void;
};

function createTripId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `trip:${crypto.randomUUID()}`;
  }
  return `trip:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTripName(name: string | undefined, tripCount: number) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Trip ${tripCount + 1}`;
}

function normalizeActiveTripId(trips: Trip[], activeTripId?: string) {
  const visibleTrips = trips.filter((trip) => !trip.archivedAt);
  if (activeTripId && visibleTrips.some((trip) => trip.id === activeTripId)) return activeTripId;
  return visibleTrips[0]?.id;
}

function sortTrips(trips: Trip[]) {
  return [...trips].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) return updated;
    return left.name.localeCompare(right.name);
  });
}

const SAVE_DEBOUNCE_MS = 400;
const SAVE_MAX_WAIT_MS = 2000;

type SaveMode = "debounced" | "immediate";

function snapshotCounts(snapshot: PlannerTripsSnapshot) {
  const activeTrip = snapshot.trips.find((trip) => trip.id === snapshot.activeTripId);
  return {
    trips: snapshot.trips.length,
    items: activeTrip?.planner.items.length ?? 0,
    customBases: activeTrip?.planner.customBases.length ?? 0,
  };
}

function hasLikelyDestructiveChange(previous: ReturnType<typeof snapshotCounts> | null, next: ReturnType<typeof snapshotCounts>) {
  if (!previous) return false;
  return next.trips < previous.trips || next.items < previous.items || next.customBases < previous.customBases;
}

function useCoalescedPlannerSave(repository: PlannerRepository) {
  const latestSnapshotRef = useRef<PlannerTripsSnapshot | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const pendingSinceRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const needsFollowUpRef = useRef(false);
  const runSaveRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    pendingSinceRef.current = null;
  }, []);

  const runSave = useCallback(() => {
    clearTimers();
    const snapshot = latestSnapshotRef.current;
    if (!snapshot) return;

    if (inFlightRef.current) {
      needsFollowUpRef.current = true;
      return;
    }

    inFlightRef.current = true;
    const snapshotBeingSaved = snapshot;
    void measurePerformance("indexeddb.save", () => repository.save(snapshotBeingSaved))
      .catch(() => {
        // Keep the UI usable when browser storage is temporarily unavailable.
      })
      .finally(() => {
        inFlightRef.current = false;
        if (needsFollowUpRef.current || latestSnapshotRef.current !== snapshotBeingSaved) {
          needsFollowUpRef.current = false;
          runSaveRef.current();
        }
      });
  }, [clearTimers, repository]);

  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  const scheduleSave = useCallback(
    (snapshot: PlannerTripsSnapshot, mode: SaveMode) => {
      latestSnapshotRef.current = snapshot;

      if (mode === "immediate") {
        runSave();
        return;
      }

      const now = window.performance.now();
      if (pendingSinceRef.current === null) {
        pendingSinceRef.current = now;
      }

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(runSave, SAVE_DEBOUNCE_MS);

      if (maxTimerRef.current === null) {
        const elapsed = now - pendingSinceRef.current;
        maxTimerRef.current = window.setTimeout(runSave, Math.max(0, SAVE_MAX_WAIT_MS - elapsed));
      }
    },
    [runSave],
  );

  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === "hidden") runSaveRef.current();
    };
    const flush = () => runSaveRef.current();
    document.addEventListener("visibilitychange", flushIfHidden);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", flushIfHidden);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      clearTimers();
    };
  }, [clearTimers]);

  return scheduleSave;
}

export function usePlannerStore(repository: PlannerRepository = indexedDbPlannerRepository): PlannerStore {
  const [isLoading, setIsLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | undefined>(undefined);
  const pendingSaveModeRef = useRef<SaveMode>("debounced");
  const previousCountsRef = useRef<ReturnType<typeof snapshotCounts> | null>(null);
  const skipNextSaveAfterLoadRef = useRef(true);
  const scheduleSave = useCoalescedPlannerSave(repository);
  const normalizedActiveTripId = useMemo(() => normalizeActiveTripId(trips, activeTripId), [activeTripId, trips]);
  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === normalizedActiveTripId),
    [normalizedActiveTripId, trips],
  );

  useEffect(() => {
    let cancelled = false;

    repository
      .load()
      .then((snapshot) => {
        if (cancelled) return;
        const loadedTrips = sortTrips(snapshot.trips);
        setTrips(loadedTrips);
        setActiveTripId(normalizeActiveTripId(loadedTrips, snapshot.activeTripId));
      })
      .catch(() => {
        if (cancelled) return;
        setTrips([]);
        setActiveTripId(undefined);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    if (activeTripId === normalizedActiveTripId) return;
    setActiveTripId(normalizedActiveTripId);
  }, [activeTripId, normalizedActiveTripId]);

  useEffect(() => {
    if (isLoading) return;
    const snapshot: PlannerTripsSnapshot = { trips, activeTripId: normalizedActiveTripId };
    const nextCounts = snapshotCounts(snapshot);
    if (skipNextSaveAfterLoadRef.current) {
      skipNextSaveAfterLoadRef.current = false;
      previousCountsRef.current = nextCounts;
      return;
    }
    const mode =
      pendingSaveModeRef.current === "immediate" || hasLikelyDestructiveChange(previousCountsRef.current, nextCounts)
        ? "immediate"
        : "debounced";
    pendingSaveModeRef.current = "debounced";
    previousCountsRef.current = nextCounts;
    scheduleSave(snapshot, mode);
  }, [isLoading, normalizedActiveTripId, scheduleSave, trips]);

  const markImmediateSave = useCallback(() => {
    pendingSaveModeRef.current = "immediate";
  }, []);

  const createTrip = useCallback(
    (name?: string, options?: { startDate?: string; endDate?: string }) => {
      markImmediateSave();
      const now = new Date().toISOString();
      const id = createTripId();
      const normalizedDates = options?.startDate ? normalizeDateRange(options.startDate, options.endDate) : undefined;
      const trip: Trip = {
        id,
        name: normalizeTripName(name, trips.length),
        startDate: normalizedDates?.startDate,
        endDate: normalizedDates?.endDate,
        createdAt: now,
        updatedAt: now,
        planner: {
          items: [],
          customBases: [],
        },
      };

      setTrips((currentTrips) => sortTrips([trip, ...currentTrips]));
      setActiveTripId(id);
      return id;
    },
    [markImmediateSave, trips.length],
  );

  const renameTrip = useCallback((tripId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    setTrips((currentTrips) =>
      sortTrips(
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                name: trimmed,
                updatedAt: now,
              }
            : trip,
        ),
      ),
    );
  }, []);

  const selectTrip = useCallback(
    (tripId: string) => {
      if (!trips.some((trip) => trip.id === tripId && !trip.archivedAt)) return;
      markImmediateSave();
      setActiveTripId(tripId);
    },
    [markImmediateSave, trips],
  );

  const deleteTrip = useCallback(
    (tripId: string) => {
      markImmediateSave();
      setTrips((currentTrips) => {
        const nextTrips = currentTrips.filter((trip) => trip.id !== tripId);
        if (tripId === activeTripId) {
          setActiveTripId(normalizeActiveTripId(nextTrips, undefined));
        }
        return sortTrips(nextTrips);
      });
    },
    [activeTripId, markImmediateSave],
  );

  const archiveTrip = useCallback(
    (tripId: string) => {
      markImmediateSave();
      const now = new Date().toISOString();
      setTrips((currentTrips) => {
        const nextTrips = sortTrips(
          currentTrips.map((trip) =>
            trip.id === tripId
              ? {
                  ...trip,
                  archivedAt: now,
                  updatedAt: now,
                }
              : trip,
          ),
        );
        if (tripId === activeTripId) {
          setActiveTripId(normalizeActiveTripId(nextTrips, undefined));
        }
        return nextTrips;
      });
    },
    [activeTripId, markImmediateSave],
  );

  const restoreTrip = useCallback((tripId: string) => {
    markImmediateSave();
    const now = new Date().toISOString();
    setTrips((currentTrips) => {
      const hadVisibleTrip = currentTrips.some((trip) => !trip.archivedAt);
      const nextTrips = sortTrips(
        currentTrips.map((trip) => {
          if (trip.id !== tripId) return trip;
          const restoredTrip: Trip = { ...trip, updatedAt: now };
          delete restoredTrip.archivedAt;
          return restoredTrip;
        }),
      );

      if (!hadVisibleTrip) {
        setActiveTripId(tripId);
      }

      return nextTrips;
    });
  }, [markImmediateSave]);

  const setPlannerItems: Dispatch<SetStateAction<PlannerItem[]>> = useCallback(
    (action) => {
      if (!normalizedActiveTripId) return;
      const now = new Date().toISOString();
      setTrips((currentTrips) =>
        sortTrips(
          currentTrips.map((trip) => {
            if (trip.id !== normalizedActiveTripId) return trip;
            const currentItems = trip.planner.items as PlannerItem[];
            const nextItems = typeof action === "function" ? action(currentItems) : action;
            return {
              ...trip,
              updatedAt: now,
              planner: {
                ...trip.planner,
                items: nextItems,
              },
            };
          }),
        ),
      );
    },
    [normalizedActiveTripId],
  );

  const setCustomBases: Dispatch<SetStateAction<PlannerCustomBase[]>> = useCallback(
    (action) => {
      if (!normalizedActiveTripId) return;
      const now = new Date().toISOString();
      setTrips((currentTrips) =>
        sortTrips(
          currentTrips.map((trip) => {
            if (trip.id !== normalizedActiveTripId) return trip;
            const currentCustomBases = trip.planner.customBases as PlannerCustomBase[];
            const nextCustomBases = typeof action === "function" ? action(currentCustomBases) : action;
            return {
              ...trip,
              updatedAt: now,
              planner: {
                ...trip.planner,
                customBases: nextCustomBases,
              },
            };
          }),
        ),
      );
    },
    [normalizedActiveTripId],
  );

  return {
    isLoading,
    trips,
    activeTripId: normalizedActiveTripId,
    activeTrip,
    plannerItems: (activeTrip?.planner.items ?? []) as PlannerItem[],
    setPlannerItems,
    customBases: (activeTrip?.planner.customBases ?? []) as PlannerCustomBase[],
    setCustomBases,
    createTrip,
    renameTrip,
    selectTrip,
    deleteTrip,
    archiveTrip,
    restoreTrip,
  };
}
