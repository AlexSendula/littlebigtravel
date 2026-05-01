import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { DestinationRail } from "./features/map/DestinationRail";
import { useGmailAutoImport } from "./features/imports/useGmailAutoImport";
import { TripMenu } from "./features/trips/TripMenu";
import TravelMap from "./TravelMap";
import { buildPlannerMapData } from "./plannerMap";
import { useRenderMetric } from "./performance/perfMetrics";
import { usePlannerStore } from "./stores/usePlannerStore";
import { stopById, tripStops, type TripStop } from "./tripData";

type ParsedDates = {
  start: string;
  end: string;
  range: string;
  isRange: boolean;
};

const RAIL_WRAP_MIN_STOPS = 2;

const loadPlannerView = () => import("./PlannerView");
const PlannerView = lazy(loadPlannerView);
let plannerViewPreload: ReturnType<typeof loadPlannerView> | null = null;

function preloadPlannerView() {
  plannerViewPreload ??= loadPlannerView();
  return plannerViewPreload;
}

function parseStopDates(rawDates: string): ParsedDates {
  const trimmed = rawDates.trim();
  const rangeMatch = trimmed.match(/^(\d{1,2})(?:\s([A-Za-z]{3}))?\s*-\s*(\d{1,2})\s([A-Za-z]{3})$/);
  if (rangeMatch) {
    const [, startDay, explicitStartMonth, endDay, endMonth] = rangeMatch;
    const startMonth = explicitStartMonth ?? endMonth;
    return {
      start: `${startDay} ${startMonth}`,
      end: `${endDay} ${endMonth}`,
      range: `${startDay}${startMonth === endMonth ? `-${endDay} ${endMonth}` : ` ${startMonth}-${endDay} ${endMonth}`}`,
      isRange: true,
    };
  }

  const singleMatch = trimmed.match(/^(\d{1,2})\s([A-Za-z]{3})$/);
  if (singleMatch) {
    const [, day, month] = singleMatch;
    const value = `${day} ${month}`;
    return { start: value, end: value, range: value, isRange: false };
  }

  return { start: trimmed, end: trimmed, range: trimmed, isRange: trimmed.includes("-") };
}

function stopMetaLine(stop: TripStop) {
  const parsed = parseStopDates(stop.dates);
  if (stop.kind === "base") {
    return parsed.isRange ? `Arrive ${parsed.start} · Leave ${parsed.end}` : `Arrive ${parsed.start}`;
  }

  const parentName = stop.parentId ? stopById.get(stop.parentId)?.name : undefined;
  return parentName ? `${parsed.range} · from ${parentName}` : parsed.range;
}

function PlannerLoadingShell() {
  return (
    <section className="planner-view planner-loading-shell" aria-label="Trip management">
      <span className="planner-sheet-grab swipe-handle-bar" aria-hidden="true" />
      <header className="planner-v2-header">
        <div>
          <p>Trip Plan</p>
          <h2>Timeline planner</h2>
        </div>
      </header>
      <p className="planner-v2-empty">Loading planner...</p>
    </section>
  );
}

function PlannerTripGate({
  onClose,
  newTripName,
  onNewTripNameChange,
  onCreateTrip,
}: {
  onClose: () => void;
  newTripName: string;
  onNewTripNameChange: (value: string) => void;
  onCreateTrip: () => void;
}) {
  const canCreateTrip = newTripName.trim().length > 0;

  return (
    <section className="planner-view planner-trip-gate" aria-label="Create a trip">
      <div className="planner-trip-gate-card">
        <button type="button" className="planner-trip-gate-close" onClick={onClose} aria-label="Close planner">
          <X size={18} />
        </button>
        <p>Trip Plan</p>
        <h2>Create your first trip</h2>
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canCreateTrip) return;
            onCreateTrip();
          }}
        >
          <input
            value={newTripName}
            onChange={(event) => onNewTripNameChange(event.target.value)}
            placeholder="Trip title"
            name="lbt-planner-draft-trip"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="enter"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
          />
          <button type="submit" disabled={!canCreateTrip}>
            <Plus size={18} />
            <span>Create trip</span>
          </button>
        </form>
      </div>
    </section>
  );
}

function DetailView({
  stop,
  onClose,
  onSelectStop,
}: {
  stop: TripStop;
  onClose: () => void;
  onSelectStop: (stop: TripStop) => void;
}) {
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeLastRef = useRef<{ x: number; y: number } | null>(null);
  const sideTrips = tripStops.filter((candidate) => candidate.parentId === stop.id);
  const parentStop = stop.parentId ? stopById.get(stop.parentId) : undefined;

  const handleTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeLastRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    swipeLastRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!swipeStartRef.current || !swipeLastRef.current) {
      swipeStartRef.current = null;
      swipeLastRef.current = null;
      return;
    }

    const deltaX = swipeLastRef.current.x - swipeStartRef.current.x;
    const deltaY = swipeLastRef.current.y - swipeStartRef.current.y;
    const isDownwardSwipe = deltaY > 70;
    const verticalDominant = Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
    if (isDownwardSwipe && verticalDominant) {
      onClose();
    }

    swipeStartRef.current = null;
    swipeLastRef.current = null;
  }, [onClose]);

  return (
    <section
      className="detail-view"
      aria-label={`${stop.name} details`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="detail-view-header">
        <div>
          <h2>{stop.name}</h2>
          <p>{stopMetaLine(stop)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" title="Close details">
          <X size={18} />
        </button>
      </header>

      <div className="detail-view-content">
        <article className="detail-section">
          <h3>{stop.kind === "base" ? "Stay Days" : "Plan"}</h3>
          <ol className="detail-events">
            {stop.events.map((event) => (
              <li key={`${event.date}-${event.title}`}>
                <time>{event.date}</time>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>

        {stop.kind === "base" && sideTrips.length > 0 ? (
          <article className="detail-section">
            <h3>Side Trips</h3>
            <div className="detail-links">
              {sideTrips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  className="detail-link-card"
                  onClick={() => onSelectStop(trip)}
                  aria-label={`Open ${trip.name}`}
                >
                  <span>{trip.name}</span>
                  <small>{trip.dates}</small>
                </button>
              ))}
            </div>
          </article>
        ) : null}

        {stop.kind !== "base" && parentStop ? (
          <article className="detail-section">
            <h3>Base City</h3>
            <div className="detail-links">
              <button
                type="button"
                className="detail-link-card"
                onClick={() => onSelectStop(parentStop)}
                aria-label={`Open ${parentStop.name}`}
              >
                <span>{parentStop.name}</span>
                <small>{parentStop.dates}</small>
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function App() {
  useRenderMetric("app-shell");

  const {
    isLoading,
    trips,
    activeTripId,
    activeTrip,
    plannerItems,
    setPlannerItems,
    customBases,
    setCustomBases,
    createTrip,
    selectTrip,
    deleteTrip,
    archiveTrip,
    restoreTrip,
  } = usePlannerStore();
  const plannerMapData = useMemo(() => buildPlannerMapData(plannerItems, customBases), [customBases, plannerItems]);
  const mapStops = plannerMapData.stops;
  const mapLegs = plannerMapData.legs;
  const mapStopById = plannerMapData.stopById;
  const stopCount = mapStops.length;
  const railCanWrap = stopCount >= RAIL_WRAP_MIN_STOPS;
  const [selectedStopId, setSelectedStopId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [tripMenuActive, setTripMenuActive] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeLastRef = useRef<{ x: number; y: number } | null>(null);
  const visibleTrips = useMemo(() => trips.filter((trip) => !trip.archivedAt), [trips]);
  const archivedTrips = useMemo(() => trips.filter((trip) => trip.archivedAt), [trips]);
  const gmailImport = useGmailAutoImport({
    activeTrip,
    plannerItems,
    customBases,
    setPlannerItems,
    setCustomBases,
  });

  const selectedStop = useMemo(() => mapStopById.get(selectedStopId), [mapStopById, selectedStopId]);
  const selectedIndex = useMemo(
    () => (selectedStop ? mapStops.findIndex((stop) => stop.id === selectedStop.id) : -1),
    [mapStops, selectedStop],
  );

  useEffect(() => {
    if (mapStops.length === 0) {
      if (selectedStopId) setSelectedStopId("");
      setDetailOpen(false);
      return;
    }
    if (!mapStopById.has(selectedStopId)) {
      setSelectedStopId(mapStops[0].id);
    }
  }, [mapStopById, mapStops, selectedStopId]);

  useEffect(() => {
    if (!activeTrip) return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(() => {
        void preloadPlannerView();
      }, { timeout: 3000 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(() => {
      void preloadPlannerView();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [activeTrip]);

  const selectStop = useCallback((stop: TripStop) => {
    setSelectedStopId(stop.id);
    setDetailOpen(false);
    setPlannerOpen(false);
  }, []);

  const selectRailStop = useCallback((stop: TripStop) => {
    setSelectedStopId(stop.id);
  }, []);

  const openPlanner = useCallback(() => {
    void preloadPlannerView();
    setDetailOpen(false);
    setPlannerOpen(true);
  }, []);

  const handleCreateTrip = useCallback(() => {
    if (!newTripName.trim()) return;
    createTrip(newTripName);
    setNewTripName("");
  }, [createTrip, newTripName]);

  const handleSelectTrip = useCallback(
    (tripId: string) => {
      selectTrip(tripId);
      setDetailOpen(false);
      setPlannerOpen(false);
    },
    [selectTrip],
  );

  const handleDeleteTrip = useCallback(
    (tripId: string) => {
      deleteTrip(tripId);
      setDetailOpen(false);
      setPlannerOpen(false);
    },
    [deleteTrip],
  );

  const handleArchiveTrip = useCallback(
    (tripId: string) => {
      archiveTrip(tripId);
      setDetailOpen(false);
      setPlannerOpen(false);
    },
    [archiveTrip],
  );

  const selectByOffset = useCallback(
    (offset: number) => {
      if (selectedIndex < 0 || stopCount === 0) return;
      const nextIndex = railCanWrap
        ? ((selectedIndex + offset) % stopCount + stopCount) % stopCount
        : Math.max(0, Math.min(stopCount - 1, selectedIndex + offset));
      if (!railCanWrap && nextIndex === selectedIndex) return;
      setSelectedStopId(mapStops[nextIndex].id);
      setDetailOpen(false);
      setPlannerOpen(false);
    },
    [mapStops, railCanWrap, selectedIndex, stopCount],
  );

  const handleBottomCardTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeLastRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleBottomCardTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    swipeLastRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleBottomCardTouchEnd = useCallback(() => {
    if (!swipeStartRef.current || !swipeLastRef.current) {
      swipeStartRef.current = null;
      swipeLastRef.current = null;
      return;
    }

    const deltaX = swipeLastRef.current.x - swipeStartRef.current.x;
    const deltaY = swipeLastRef.current.y - swipeStartRef.current.y;
    const isUpwardSwipe = deltaY < -52;
    const verticalDominant = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    if (isUpwardSwipe && verticalDominant) {
      setDetailOpen(true);
    }

    swipeStartRef.current = null;
    swipeLastRef.current = null;
  }, []);

  const canGoPrev = railCanWrap || selectedIndex > 0;
  const canGoNext = railCanWrap || (selectedIndex >= 0 && selectedIndex < stopCount - 1);

  return (
    <main className={`app-shell ${tripMenuActive ? "trip-menu-active" : ""}`}>
      <TripMenu
        isLoading={isLoading}
        activeTrip={activeTrip}
        trips={visibleTrips}
        archivedTrips={archivedTrips}
        activeTripId={activeTripId}
        newTripName={newTripName}
        onNewTripNameChange={setNewTripName}
        onCreateTrip={handleCreateTrip}
        onSelectTrip={handleSelectTrip}
        onDeleteTrip={handleDeleteTrip}
        onArchiveTrip={handleArchiveTrip}
        onRestoreTrip={restoreTrip}
        onOpenChange={setTripMenuActive}
        gmailImport={gmailImport}
      />

      <TravelMap stops={mapStops} legs={mapLegs} stopById={mapStopById} selectedStop={selectedStop} onSelectStop={selectStop} />

      <DestinationRail
        stops={mapStops}
        selectedStop={selectedStop}
        plannerOpen={plannerOpen}
        onSelectStop={selectRailStop}
        onOpenPlanner={openPlanner}
        onPreloadPlanner={preloadPlannerView}
      />

      {selectedStop ? (
        <nav
          className="bottom-location-nav"
          aria-label="Location navigation"
          onTouchStart={handleBottomCardTouchStart}
          onTouchMove={handleBottomCardTouchMove}
          onTouchEnd={handleBottomCardTouchEnd}
        >
          <span className="bottom-location-grab swipe-handle-bar" aria-hidden="true" />
          <button
            type="button"
            onClick={() => selectByOffset(-1)}
            aria-label={`Previous location before ${selectedStop.name}`}
            title="Previous location"
            disabled={!canGoPrev}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="bottom-location-label">
            <strong>{selectedStop.name}</strong>
            <small>{stopMetaLine(selectedStop)}</small>
          </div>
          <button
            type="button"
            onClick={() => selectByOffset(1)}
            aria-label={`Next location after ${selectedStop.name}`}
            title="Next location"
            disabled={!canGoNext}
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      ) : null}

      {detailOpen && selectedStop ? <DetailView stop={selectedStop} onClose={() => setDetailOpen(false)} onSelectStop={selectStop} /> : null}
      {plannerOpen && !activeTrip ? (
        <PlannerTripGate
          onClose={() => setPlannerOpen(false)}
          newTripName={newTripName}
          onNewTripNameChange={setNewTripName}
          onCreateTrip={handleCreateTrip}
        />
      ) : null}
      {plannerOpen && activeTrip ? (
        <Suspense fallback={<PlannerLoadingShell />}>
          <PlannerView
            selectedStopId={selectedStop?.id ?? ""}
            onSelectStop={selectStop}
            onClose={() => setPlannerOpen(false)}
            items={plannerItems}
            setItems={setPlannerItems}
            customBases={customBases}
            setCustomBases={setCustomBases}
          />
        </Suspense>
      ) : null}
    </main>
  );
}

export default App;
