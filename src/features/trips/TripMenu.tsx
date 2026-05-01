import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent,
} from "react";
import { Archive, Mail, Plus, RefreshCcw, Trash2, Unplug } from "lucide-react";
import type { Trip } from "../../domain/trip/types";
import type { GmailAutoImportStatus } from "../imports/useGmailAutoImport";
import { formatPlannerItemDate } from "../../planner";
import { RenderMetric, useRenderMetric } from "../../performance/perfMetrics";

const TRIP_CARD_SWIPE_CLASS = "trip-card-is-swiping";
const TRIP_SWIPE_LOCK_PX = 6;
const TRIP_SWIPE_DIAGONAL_RATIO = 0.24;
const TRIP_SWIPE_VERTICAL_LOCK_PX = 14;
const TRIP_SWIPE_EDGE_TRIGGER_MIN_PX = 86;
const TRIP_SWIPE_EDGE_TRIGGER_MAX_PX = 132;
const TRIP_SWIPE_MAX_PX = 96;
const TRIP_SWIPE_THRESHOLD_PX = 72;
const TOPBAR_PULL_MAX_PX = 42;
const TOPBAR_OPEN_THRESHOLD_PX = 46;

export function tripDateLine(trip?: Trip) {
  if (!trip) return "Create a trip to start planning";
  if (trip.startDate) return formatPlannerItemDate(trip.startDate, trip.endDate);

  const dates = [
    ...trip.planner.items.flatMap((item) => [item.startDate, item.endDate ?? item.startDate]),
    ...trip.planner.customBases.flatMap((base) => [base.startDate, base.endDate ?? base.startDate]),
  ].filter((date): date is string => Boolean(date));
  if (dates.length === 0) return "No dates yet";

  const sortedDates = [...dates].sort();
  return formatPlannerItemDate(sortedDates[0], sortedDates.at(-1));
}

function setTripCardSwipeActive(active: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(TRIP_CARD_SWIPE_CLASS, active);
}

function isTripCardSwipeActive() {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(TRIP_CARD_SWIPE_CLASS);
}

function getTripSwipeEdge(element: HTMLElement, clientX: number, canArchive: boolean) {
  const rect = element.getBoundingClientRect();
  const triggerWidth = Math.min(
    TRIP_SWIPE_EDGE_TRIGGER_MAX_PX,
    Math.max(TRIP_SWIPE_EDGE_TRIGGER_MIN_PX, rect.width * 0.28),
  );
  if (canArchive && clientX >= rect.left - 8 && clientX <= rect.left + triggerWidth) return "left";
  if (clientX >= rect.right - triggerWidth && clientX <= rect.right + 8) return "right";
  return null;
}

function isTripSwipeIntent(edge: "left" | "right", deltaX: number, deltaY: number) {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (edge === "left" && deltaX < TRIP_SWIPE_LOCK_PX) return false;
  if (edge === "right" && deltaX > -TRIP_SWIPE_LOCK_PX) return false;
  return absX >= Math.max(TRIP_SWIPE_LOCK_PX, absY * TRIP_SWIPE_DIAGONAL_RATIO);
}

function preventDefaultIfCancelable(event: { cancelable?: boolean; preventDefault: () => void }) {
  if (event.cancelable) event.preventDefault();
}

function forwardTripEdgeClick(event: ReactMouseEvent<HTMLElement>, root: HTMLElement) {
  const hitArea = event.currentTarget;
  const previousPointerEvents = hitArea.style.pointerEvents;
  hitArea.style.pointerEvents = "none";
  const target = document.elementFromPoint(event.clientX, event.clientY);
  hitArea.style.pointerEvents = previousPointerEvents;

  const clickTarget = target?.closest("button, a, [role='button'], input, textarea, select");
  if (clickTarget instanceof HTMLElement && root.contains(clickTarget)) {
    clickTarget.click();
  }

  event.preventDefault();
  event.stopPropagation();
}

function getTripResistedSwipeDistance(rawDistance: number, maxDistance: number) {
  if (rawDistance <= TRIP_SWIPE_THRESHOLD_PX) return rawDistance;
  const resisted = TRIP_SWIPE_THRESHOLD_PX + (rawDistance - TRIP_SWIPE_THRESHOLD_PX) * 0.58;
  return Math.min(maxDistance, resisted);
}

function getTripSwipeCommitProgress(offset: number, maxDistance: number) {
  const distance = Math.abs(offset);
  if (distance <= TRIP_SWIPE_THRESHOLD_PX) return 0;
  return Math.min(1, (distance - TRIP_SWIPE_THRESHOLD_PX) / Math.max(1, maxDistance - TRIP_SWIPE_THRESHOLD_PX));
}

function TripSwipeCard({
  trip,
  active,
  canArchive = true,
  onSelect,
  onDelete,
  onArchive,
}: {
  trip: Trip;
  active: boolean;
  canArchive?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    edge: "left" | "right";
    axis: "pending" | "horizontal" | "vertical";
    captured: boolean;
    target: HTMLDivElement;
  } | null>(null);
  const touchIntentRef = useRef<{
    startX: number;
    startY: number;
    edge: "left" | "right";
    guarding: boolean;
    ignore: boolean;
  } | null>(null);
  const actionTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const reset = useCallback(() => {
    if (actionTimerRef.current !== null) {
      window.clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
    pointerRef.current = null;
    touchIntentRef.current = null;
    setTripCardSwipeActive(false);
    setIsTracking(false);
    setIsSwiping(false);
    setOffsetX(0);
    setIsCompleting(false);
  }, []);

  useEffect(
    () => () => {
      if (actionTimerRef.current !== null) {
        window.clearTimeout(actionTimerRef.current);
      }
      setTripCardSwipeActive(false);
    },
    [],
  );

  const finishSwipe = useCallback(
    (element: HTMLDivElement, direction: "archive" | "delete") => {
      const travel = element.getBoundingClientRect().width + 16;
      pointerRef.current = null;
      touchIntentRef.current = null;
      setTripCardSwipeActive(false);
      setIsTracking(false);
      setIsSwiping(false);
      setIsCompleting(true);
      setOffsetX(direction === "archive" ? Math.max(128, travel) : -Math.max(128, travel));
      actionTimerRef.current = window.setTimeout(() => {
        actionTimerRef.current = null;
        if (direction === "archive") {
          onArchive();
        } else {
          onDelete();
        }
      }, 180);
    },
    [onArchive, onDelete],
  );

  const handleTouchStartCapture = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (isCompleting) return;
      const touch = event.touches[0];
      if (!touch) return;
      const edge = getTripSwipeEdge(event.currentTarget, touch.clientX, canArchive);
      touchIntentRef.current = edge
        ? { startX: touch.clientX, startY: touch.clientY, edge, guarding: true, ignore: false }
        : { startX: touch.clientX, startY: touch.clientY, edge: "right", guarding: false, ignore: true };
      if (edge) {
        setTripCardSwipeActive(true);
        setIsTracking(true);
        event.stopPropagation();
      }
    },
    [canArchive, isCompleting],
  );

  const handleTouchMoveCapture = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const intent = touchIntentRef.current;
    if (!intent || intent.ignore) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - intent.startX;
    const deltaY = touch.clientY - intent.startY;
    if (intent.guarding && isTripSwipeIntent(intent.edge, deltaX, deltaY)) {
      intent.guarding = false;
      preventDefaultIfCancelable(event);
      event.stopPropagation();
      return;
    }
    if (!intent.guarding) {
      preventDefaultIfCancelable(event);
      event.stopPropagation();
    }
  }, []);

  const handleTouchEndCapture = useCallback(() => {
    touchIntentRef.current = null;
    if (pointerRef.current?.axis === "horizontal") return;
    setTripCardSwipeActive(false);
    setIsTracking(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isCompleting || (event.pointerType === "mouse" && event.button !== 0)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select")) return;
      const edge = getTripSwipeEdge(event.currentTarget, event.clientX, canArchive);
      if (!edge) {
        reset();
        return;
      }
      pointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        edge,
        axis: "pending",
        captured: false,
        target: event.currentTarget,
      };
      setTripCardSwipeActive(true);
      setIsTracking(true);
      suppressClickRef.current = false;
    },
    [canArchive, isCompleting, reset],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    if ((pointer.edge === "left" && deltaX < 0) || (pointer.edge === "right" && deltaX > 0)) {
      return;
    }
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (pointer.axis === "pending") {
      if (isTripSwipeIntent(pointer.edge, deltaX, deltaY)) {
        pointer.axis = "horizontal";
        pointer.captured = true;
        setTripCardSwipeActive(true);
        setIsSwiping(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (absY > TRIP_SWIPE_VERTICAL_LOCK_PX && absY > absX * 1.2) {
        pointer.axis = "vertical";
        pointerRef.current = null;
        setTripCardSwipeActive(false);
        setIsTracking(false);
        return;
      } else {
        return;
      }
    }
    if (pointer.axis !== "horizontal") return;

    event.preventDefault();
    event.stopPropagation();
    const maxTravel = event.currentTarget.getBoundingClientRect().width + 16;
    const resisted = getTripResistedSwipeDistance(Math.abs(deltaX), maxTravel);
    const nextOffset = deltaX > 0 ? resisted : -resisted;
    pointer.offsetX = nextOffset;
    suppressClickRef.current = true;
    setOffsetX(nextOffset);
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      const didSwipe = pointer.axis === "horizontal";
      const shouldDelete = pointer.edge === "right" && pointer.offsetX <= -TRIP_SWIPE_THRESHOLD_PX;
      const shouldArchive = pointer.edge === "left" && pointer.offsetX >= TRIP_SWIPE_THRESHOLD_PX;
      if (!didSwipe) {
        pointerRef.current = null;
        setTripCardSwipeActive(false);
        setIsTracking(false);
        setIsSwiping(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (shouldDelete) {
        finishSwipe(event.currentTarget, "delete");
      } else if (canArchive && shouldArchive) {
        finishSwipe(event.currentTarget, "archive");
      } else {
        reset();
      }
    },
    [canArchive, finishSwipe, reset],
  );

  const handlePointerCancel = useCallback(() => {
    reset();
  }, [reset]);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect();
  }, [onSelect]);

  const swipeKind = offsetX > 0 ? "archive" : "delete";
  const revealProgress = Math.min(1, Math.abs(offsetX) / TRIP_SWIPE_MAX_PX);
  const maxProgressDistance = pointerRef.current?.target.getBoundingClientRect().width ?? TRIP_SWIPE_MAX_PX;
  const commitProgress = getTripSwipeCommitProgress(offsetX, Math.max(TRIP_SWIPE_MAX_PX, maxProgressDistance));
  const isActive = Math.abs(offsetX) > 0.5 || isSwiping || isCompleting;

  return (
    <div
      className={`trip-card-swipe ${active ? "active" : ""} ${isActive ? "is-active" : ""} ${isTracking ? "is-tracking" : ""} ${isSwiping ? "is-swiping" : ""} ${isCompleting ? "is-completing" : ""} is-${swipeKind}`}
      data-testid={`trip-card-swipe-${trip.id}`}
      style={
        {
          "--trip-card-x": `${offsetX}px`,
          "--trip-action-progress": revealProgress,
          "--trip-action-commit": commitProgress,
        } as CSSProperties
      }
      onTouchStartCapture={handleTouchStartCapture}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchEndCapture={handleTouchEndCapture}
      onTouchCancelCapture={handleTouchEndCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className={`trip-card-action ${swipeKind}`} aria-hidden="true">
        {swipeKind === "archive" ? <Archive size={17} /> : <Trash2 size={17} />}
      </div>
      <div className="trip-card-content">
        <button type="button" className="trip-card" onClick={handleClick} aria-label={`Select ${trip.name}`}>
          <span>{trip.name}</span>
          <small>{tripDateLine(trip)}</small>
        </button>
      </div>
      {canArchive ? (
        <span
          className="trip-card-swipe-edge-hit-area archive"
          aria-hidden="true"
          onClick={(event) => forwardTripEdgeClick(event, event.currentTarget.parentElement as HTMLElement)}
        />
      ) : null}
      <span
        className="trip-card-swipe-edge-hit-area delete"
        aria-hidden="true"
        onClick={(event) => forwardTripEdgeClick(event, event.currentTarget.parentElement as HTMLElement)}
      />
    </div>
  );
}

function TripDrawer({
  open,
  trips,
  archivedTrips,
  activeTripId,
  gmailImport,
  newTripName,
  onNewTripNameChange,
  onCreateTrip,
  onSelectTrip,
  onDeleteTrip,
  onArchiveTrip,
  onRestoreTrip,
  onClose,
}: {
  open: boolean;
  trips: Trip[];
  archivedTrips: Trip[];
  activeTripId?: string;
  gmailImport: GmailAutoImportStatus;
  newTripName: string;
  onNewTripNameChange: (value: string) => void;
  onCreateTrip: () => void;
  onSelectTrip: (tripId: string) => void;
  onDeleteTrip: (tripId: string) => void;
  onArchiveTrip: (tripId: string) => void;
  onRestoreTrip: (tripId: string) => void;
  onClose: () => void;
}) {
  useRenderMetric("trip-drawer");

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const armedRef = useRef(false);
  const collapseDistanceRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const hideCreateTimerRef = useRef<number | null>(null);
  const newTripNameRef = useRef(newTripName);
  const createFocusedRef = useRef(false);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createClosing, setCreateClosing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const hasTrips = trips.length > 0;
  const hasArchivedTrips = archivedTrips.length > 0;
  const displayedTrips = showArchived ? archivedTrips : trips;
  const hasDisplayedTrips = displayedTrips.length > 0;
  const showCreateForm = !showArchived && (!hasTrips || createOpen || createClosing);
  const canCreateTrip = newTripName.trim().length > 0;
  const activeTrip = trips.find((trip) => trip.id === activeTripId);
  const closeThreshold = 150;
  const closeAnimationMs = 320;
  const collapsedHeight = 78;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const resetSwipe = useCallback(() => {
    clearCloseTimer();
    startRef.current = null;
    lastRef.current = null;
    armedRef.current = false;
    collapseDistanceRef.current = 0;
    setPullDistance(0);
    setIsPulling(false);
    setIsClosing(false);
  }, [clearCloseTimer]);

  const clearHideCreateTimer = useCallback(() => {
    if (hideCreateTimerRef.current === null) return;
    window.clearTimeout(hideCreateTimerRef.current);
    hideCreateTimerRef.current = null;
  }, []);

  useEffect(() => {
    newTripNameRef.current = newTripName;
  }, [newTripName]);

  const scheduleHideCreate = useCallback(() => {
    if (!hasTrips) return;
    clearHideCreateTimer();
    hideCreateTimerRef.current = window.setTimeout(() => {
      hideCreateTimerRef.current = null;
      if (newTripNameRef.current.trim()) return;
      if (createFocusedRef.current) return;
      setCreateClosing(true);
      setCreateOpen(false);
    }, 5000);
  }, [clearHideCreateTimer, hasTrips]);

  useEffect(() => {
    if (!hasArchivedTrips && showArchived) setShowArchived(false);
  }, [hasArchivedTrips, showArchived]);

  useEffect(() => {
    if (!open) {
      resetSwipe();
      setShowArchived(false);
      setCreateOpen(false);
      setCreateClosing(false);
      createFocusedRef.current = false;
      clearHideCreateTimer();
    }
  }, [clearHideCreateTimer, open, resetSwipe]);

  useEffect(
    () => () => {
      clearCloseTimer();
      clearHideCreateTimer();
    },
    [clearCloseTimer, clearHideCreateTimer],
  );

  if (!open) return null;

  const closeAndReset = () => {
    clearCloseTimer();
    startRef.current = null;
    lastRef.current = null;
    armedRef.current = false;
    collapseDistanceRef.current = 0;
    setPullDistance(0);
    setIsPulling(false);
    setIsClosing(false);
    setShowArchived(false);
    setCreateOpen(false);
    setCreateClosing(false);
    createFocusedRef.current = false;
    clearHideCreateTimer();
    onClose();
  };

  const finishClose = () => {
    clearCloseTimer();
    startRef.current = null;
    lastRef.current = null;
    armedRef.current = false;
    setShowArchived(false);
    setCreateOpen(false);
    setCreateClosing(false);
    createFocusedRef.current = false;
    clearHideCreateTimer();
    onClose();
  };

  const handleOpenCreate = () => {
    if (showArchived) return;
    clearHideCreateTimer();
    setCreateClosing(false);
    setCreateOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!canCreateTrip) return;
    onCreateTrip();
    setCreateOpen(false);
    setCreateClosing(false);
    createFocusedRef.current = false;
    clearHideCreateTimer();
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (isClosing || isTripCardSwipeActive()) {
      resetSwipe();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const noCloseSelector =
      "button:not(.trip-drawer-grab), input, textarea, select, [data-no-swipe='true'], .trip-card-swipe, .trip-card-action";
    if (target?.closest(noCloseSelector)) {
      resetSwipe();
      return;
    }

    const startedInsideScroll = Boolean(target?.closest(".trip-drawer-list"));
    const scrollTop = drawerRef.current?.scrollTop ?? 0;
    if (startedInsideScroll && scrollTop > 2) {
      resetSwipe();
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;
    armedRef.current = true;
    startRef.current = { x: touch.clientX, y: touch.clientY };
    lastRef.current = { x: touch.clientX, y: touch.clientY };
    collapseDistanceRef.current = Math.max(
      0,
      (drawerRef.current?.getBoundingClientRect().height ?? window.innerHeight) - collapsedHeight,
    );
    setIsClosing(false);
    setPullDistance(0);
  };

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (!armedRef.current || !startRef.current || isClosing) return;
    if (isTripCardSwipeActive()) {
      resetSwipe();
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    lastRef.current = { x: touch.clientX, y: touch.clientY };

    const deltaX = touch.clientX - startRef.current.x;
    const deltaY = touch.clientY - startRef.current.y;
    const isVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
    if (!isVertical || deltaY >= 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    preventDefaultIfCancelable(event);
    setIsPulling(true);

    const upwardPull = -deltaY;
    const maxCollapseDistance =
      collapseDistanceRef.current ||
      Math.max(0, (drawerRef.current?.getBoundingClientRect().height ?? window.innerHeight) - collapsedHeight);
    const visiblePull =
      upwardPull <= closeThreshold
        ? upwardPull * 0.58
        : closeThreshold * 0.58 + (upwardPull - closeThreshold) * 0.42;
    setPullDistance(Math.min(maxCollapseDistance, visiblePull));
  };

  const handleTouchEnd = () => {
    if (isTripCardSwipeActive()) {
      resetSwipe();
      return;
    }
    if (!armedRef.current || !startRef.current || !lastRef.current) {
      resetSwipe();
      return;
    }

    const deltaX = lastRef.current.x - startRef.current.x;
    const deltaY = lastRef.current.y - startRef.current.y;
    const isVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
    const upwardPull = -deltaY;
    if (isVertical && upwardPull >= closeThreshold) {
      startRef.current = null;
      lastRef.current = null;
      armedRef.current = false;
      setIsPulling(false);
      setIsClosing(true);
      const maxCollapseDistance =
        collapseDistanceRef.current ||
        Math.max(0, (drawerRef.current?.getBoundingClientRect().height ?? window.innerHeight) - collapsedHeight);
      setPullDistance(maxCollapseDistance);
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        finishClose();
      }, closeAnimationMs + 120);
      return;
    }

    resetSwipe();
  };

  const maxCollapseDistance =
    collapseDistanceRef.current ||
    Math.max(1, (window.visualViewport?.height ?? window.innerHeight) - collapsedHeight);
  const closeProgress = Math.min(1, pullDistance / maxCollapseDistance);
  const drawerPullStyle = {
    "--trip-drawer-collapse-y": `${pullDistance}px`,
    "--trip-drawer-menu-opacity": isClosing ? 0 : Math.max(0, 1 - closeProgress * 1.35),
    "--trip-drawer-summary-opacity": isClosing ? 1 : Math.max(0, (closeProgress - 0.55) / 0.45),
    "--trip-drawer-backdrop-opacity": Math.max(0, 1 - closeProgress),
  } as CSSProperties;

  return (
    <div
      className={`trip-drawer-layer ${isPulling ? "is-pulling-close" : ""} ${isClosing ? "is-closing-close" : ""}`}
      style={drawerPullStyle}
      role="presentation"
      onMouseDown={closeAndReset}
    >
      <section
        ref={drawerRef}
        className={`trip-drawer ${isPulling ? "is-pulling-close" : ""} ${isClosing ? "is-closing-close" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Trip menu"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetSwipe}
        onTransitionEnd={(event) => {
          if (!isClosing || event.target !== drawerRef.current || event.propertyName !== "height") return;
          finishClose();
        }}
      >
        <div className="trip-drawer-collapsed-summary" aria-hidden="true">
          <h2>{activeTrip?.name ?? "Plan a trip"}</h2>
          <p>{tripDateLine(activeTrip)}</p>
        </div>
        <div className="trip-drawer-menu-content">
          <header className="trip-drawer-header">
            <div>
              <p>Trips</p>
              <h2 key={showArchived ? "archived" : "active"}>{showArchived ? "Archived trips" : "Choose your trip"}</h2>
            </div>
            <div className="trip-drawer-actions">
              {hasArchivedTrips ? (
                <button
                  type="button"
                  className={`trip-drawer-archive-button ${showArchived ? "active" : ""}`}
                  onClick={() => setShowArchived((current) => !current)}
                  aria-label={showArchived ? "Show active trips" : "Show archived trips"}
                  aria-pressed={showArchived}
                >
                  <Archive size={17} />
                </button>
              ) : null}
              {!showArchived && hasTrips ? (
                <button type="button" className="trip-drawer-add-button" onClick={handleOpenCreate} aria-label="Create trip">
                  <Plus size={17} />
                </button>
              ) : null}
            </div>
          </header>
          <GmailImportStatusRow gmailImport={gmailImport} />
          {showCreateForm ? (
            <div
              className={`trip-drawer-create-shell ${!hasTrips ? "empty" : ""} ${createOpen && hasTrips ? "inline" : ""} ${
                createClosing ? "closing" : ""
              }`}
              onAnimationEnd={() => {
                if (!createClosing) return;
                setCreateClosing(false);
              }}
            >
              <form
                className="trip-drawer-create"
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCreateSubmit();
                }}
              >
                <input
                  value={newTripName}
                  onChange={(event) => {
                    onNewTripNameChange(event.target.value);
                    if (event.target.value.trim()) {
                      clearHideCreateTimer();
                    } else if (createOpen) {
                      scheduleHideCreate();
                    }
                  }}
                  onFocus={() => {
                    createFocusedRef.current = true;
                    clearHideCreateTimer();
                  }}
                  onBlur={() => {
                    createFocusedRef.current = false;
                    if (!newTripNameRef.current.trim() && createOpen) scheduleHideCreate();
                  }}
                  placeholder="Trip title"
                  name="lbt-draft-trip"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  enterKeyHint="enter"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  aria-label="New trip title"
                />
                <button type="submit" aria-label="Create trip" disabled={!canCreateTrip}>
                  <Plus size={17} />
                  <span>Create trip</span>
                </button>
              </form>
            </div>
          ) : null}

          <div key={showArchived ? "archived" : "active"} className="trip-drawer-list" aria-label="Trips">
            {hasDisplayedTrips ? (
              displayedTrips.map((trip) => (
                <TripSwipeCard
                  key={trip.id}
                  trip={trip}
                  active={!showArchived && trip.id === activeTripId}
                  canArchive
                  onSelect={() => (showArchived ? onRestoreTrip(trip.id) : onSelectTrip(trip.id))}
                  onDelete={() => onDeleteTrip(trip.id)}
                  onArchive={() => (showArchived ? onRestoreTrip(trip.id) : onArchiveTrip(trip.id))}
                />
              ))
            ) : (
              <p className="trip-drawer-empty">
                {showArchived ? "No archived trips." : "No trips yet. Add one to start planning."}
              </p>
            )}
          </div>
        </div>
        <button type="button" className="trip-drawer-grab" onClick={closeAndReset} aria-label="Close trip menu">
          <span className="swipe-handle-bar" aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

function formatImportLastChecked(lastCheckedAt?: string) {
  if (!lastCheckedAt) return "Not checked yet";
  const parsed = new Date(lastCheckedAt);
  if (Number.isNaN(parsed.getTime())) return "Last checked recently";
  return `Last checked ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function GmailImportStatusRow({ gmailImport }: { gmailImport: GmailAutoImportStatus }) {
  const statusText =
    gmailImport.status === "connected"
      ? gmailImport.isRunning
        ? "Checking Gmail..."
        : formatImportLastChecked(gmailImport.lastCheckedAt)
      : gmailImport.status === "setup-needed"
        ? "OAuth setup needed"
        : gmailImport.status === "error"
          ? gmailImport.error ?? "Import failed"
          : "Disconnected";
  const actionLabel = gmailImport.connected ? "Disconnect Gmail" : "Connect Gmail";

  return (
    <section className={`gmail-import-status ${gmailImport.status}`} aria-label="Gmail auto-import">
      <div>
        <Mail size={16} aria-hidden="true" />
        <span>Gmail auto-import</span>
        <small>{statusText}</small>
      </div>
      <button
        type="button"
        onClick={gmailImport.connected ? gmailImport.disconnect : gmailImport.connect}
        aria-label={actionLabel}
        title={actionLabel}
      >
        {gmailImport.connected ? <Unplug size={16} /> : <RefreshCcw size={16} />}
      </button>
    </section>
  );
}

export function TripMenu({
  isLoading,
  activeTrip,
  trips,
  archivedTrips,
  activeTripId,
  gmailImport,
  newTripName,
  onNewTripNameChange,
  onCreateTrip,
  onSelectTrip,
  onDeleteTrip,
  onArchiveTrip,
  onRestoreTrip,
  onOpenChange,
}: {
  isLoading: boolean;
  activeTrip?: Trip;
  trips: Trip[];
  archivedTrips: Trip[];
  activeTripId?: string;
  gmailImport: GmailAutoImportStatus;
  newTripName: string;
  onNewTripNameChange: (value: string) => void;
  onCreateTrip: () => void;
  onSelectTrip: (tripId: string) => void;
  onDeleteTrip: (tripId: string) => void;
  onArchiveTrip: (tripId: string) => void;
  onRestoreTrip: (tripId: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [topbarPull, setTopbarPull] = useState(0);
  const [topbarIsPulling, setTopbarIsPulling] = useState(false);
  const topbarSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const topbarSwipeLastRef = useRef<{ x: number; y: number } | null>(null);
  const topbarSuppressClickRef = useRef(false);
  const topbarTitle = activeTrip?.name ?? (isLoading ? "Loading trips" : "Plan a trip");
  const topbarDateLine = isLoading ? "Loading local trips" : tripDateLine(activeTrip);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  const resetTopbarSwipe = useCallback(() => {
    topbarSwipeStartRef.current = null;
    topbarSwipeLastRef.current = null;
    setTopbarPull(0);
    setTopbarIsPulling(false);
  }, []);

  const handleTopbarTouchStart = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      if (open) return;
      const touch = event.touches[0];
      if (!touch) return;
      topbarSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      topbarSwipeLastRef.current = { x: touch.clientX, y: touch.clientY };
      topbarSuppressClickRef.current = false;
      setTopbarPull(0);
      setTopbarIsPulling(false);
    },
    [open],
  );

  const handleTopbarTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch || !topbarSwipeStartRef.current) return;
    topbarSwipeLastRef.current = { x: touch.clientX, y: touch.clientY };
    const deltaX = touch.clientX - topbarSwipeStartRef.current.x;
    const deltaY = touch.clientY - topbarSwipeStartRef.current.y;
    const downwardPull = Math.max(0, deltaY);
    const isDownwardIntent = downwardPull > 0 && Math.abs(deltaY) > Math.abs(deltaX) * 1.08;

    if (!isDownwardIntent) {
      setTopbarPull(0);
      setTopbarIsPulling(false);
      return;
    }

    preventDefaultIfCancelable(event);
    if (downwardPull > 4) topbarSuppressClickRef.current = true;
    setTopbarIsPulling(true);
    const resistedPull =
      downwardPull <= TOPBAR_OPEN_THRESHOLD_PX
        ? downwardPull * 0.58
        : TOPBAR_OPEN_THRESHOLD_PX * 0.58 + (downwardPull - TOPBAR_OPEN_THRESHOLD_PX) * 0.28;
    setTopbarPull(Math.min(TOPBAR_PULL_MAX_PX, resistedPull));
  }, []);

  const handleTopbarTouchEnd = useCallback(() => {
    if (!topbarSwipeStartRef.current || !topbarSwipeLastRef.current) {
      resetTopbarSwipe();
      return;
    }
    const deltaX = topbarSwipeLastRef.current.x - topbarSwipeStartRef.current.x;
    const deltaY = topbarSwipeLastRef.current.y - topbarSwipeStartRef.current.y;
    if (deltaY > TOPBAR_OPEN_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX) * 1.08) {
      setOpen(true);
    }
    resetTopbarSwipe();
  }, [resetTopbarSwipe]);

  const handleTopbarClickOpen = useCallback(() => {
    if (topbarSuppressClickRef.current) {
      topbarSuppressClickRef.current = false;
      return;
    }
    setOpen(true);
  }, []);

  const handleSelectTrip = useCallback(
    (tripId: string) => {
      onSelectTrip(tripId);
      setOpen(false);
    },
    [onSelectTrip],
  );

  return (
    <>
      <div
        className={`topbar ${topbarIsPulling ? "is-pulling-open" : ""}`}
        style={{ "--topbar-pull": `${topbarPull}px` } as CSSProperties}
        onTouchStart={handleTopbarTouchStart}
        onTouchMove={handleTopbarTouchMove}
        onTouchEnd={handleTopbarTouchEnd}
        onTouchCancel={resetTopbarSwipe}
      >
        <RenderMetric name="top-trip-card" />
        <div>
          <h2>{topbarTitle}</h2>
          <p>{topbarDateLine}</p>
        </div>
        <button type="button" className="topbar-trip-grab" onClick={handleTopbarClickOpen} aria-label="Open trip menu">
          <span className="swipe-handle-bar" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="topbar-trip-open-zone"
        onClick={handleTopbarClickOpen}
        onTouchStart={handleTopbarTouchStart}
        onTouchMove={handleTopbarTouchMove}
        onTouchEnd={handleTopbarTouchEnd}
        onTouchCancel={resetTopbarSwipe}
        aria-label="Open trip menu"
      />
      <TripDrawer
        open={open}
        trips={trips}
        archivedTrips={archivedTrips}
        activeTripId={activeTripId}
        gmailImport={gmailImport}
        newTripName={newTripName}
        onNewTripNameChange={onNewTripNameChange}
        onCreateTrip={onCreateTrip}
        onSelectTrip={handleSelectTrip}
        onDeleteTrip={onDeleteTrip}
        onArchiveTrip={onArchiveTrip}
        onRestoreTrip={onRestoreTrip}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
