import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { CalendarRange, ChevronUp } from "lucide-react";
import { RenderMetric } from "../../performance/perfMetrics";
import type { TripStop } from "../../tripData";

const RAIL_WRAP_MIN_STOPS = 2;
const RAIL_MAX_VISIBLE_STOPS = 7;
const RAIL_PICKER_ITEM_HEIGHT = 22;
const RAIL_PICKER_SNAP_RATIO = 0.38;
const RAIL_PICKER_DRAG_HOLD_MS = 120;

function getRailPickerOffset(index: number, selectedIndex: number, stopCount: number) {
  if (index === selectedIndex || selectedIndex < 0 || stopCount < 2) return 0;
  const forwardOffset = ((index - selectedIndex) % stopCount + stopCount) % stopCount;
  return forwardOffset === stopCount - 1 ? -1 : forwardOffset;
}

function normalizeRailPickerOffset(offset: number, stopCount: number) {
  if (stopCount < 2) return 0;
  return ((offset + 1) % stopCount + stopCount) % stopCount - 1;
}

function getRailPickerStepDelta(dragDistance: number, stepSize: number) {
  if (stepSize <= 0) return 0;
  const rawSteps = -dragDistance / stepSize;
  return Math.sign(rawSteps) * Math.floor(Math.abs(rawSteps) + RAIL_PICKER_SNAP_RATIO);
}

function getRailVisibleGap(stopCount: number) {
  return stopCount > 0 ? 2 : 0;
}

export function DestinationRail({
  stops,
  selectedStop,
  plannerOpen,
  onSelectStop,
  onOpenPlanner,
  onPreloadPlanner,
}: {
  stops: TripStop[];
  selectedStop?: TripStop;
  plannerOpen: boolean;
  onSelectStop: (stop: TripStop) => void;
  onOpenPlanner: () => void;
  onPreloadPlanner?: () => void;
}) {
  const stopCount = stops.length;
  const hasRailStops = stopCount > 0;
  const railCanWrap = stopCount >= RAIL_WRAP_MIN_STOPS;
  const railDraggablePicker = stopCount >= 2;
  const selectedIndex = useMemo(
    () => (selectedStop ? stops.findIndex((stop) => stop.id === selectedStop.id) : -1),
    [selectedStop, stops],
  );
  const railStops = useMemo(() => {
    if (stopCount === 0) return [];
    return stops.map((stop, virtualIndex) => ({ stop, virtualIndex }));
  }, [stops, stopCount]);

  const railPlanSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const railPlanSwipeLastRef = useRef<{ x: number; y: number } | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const railStackWheelTimerRef = useRef<number | null>(null);
  const railStackHoldTimerRef = useRef<number | null>(null);
  const railStackSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const railStackSwipeLastRef = useRef<{ x: number; y: number } | null>(null);
  const railStackSwipeStartedAtRef = useRef(0);
  const railStackDraggingRef = useRef(false);
  const [railPlanPull, setRailPlanPull] = useState(0);
  const [railStackDrag, setRailStackDrag] = useState(0);
  const [railStackDragging, setRailStackDragging] = useState(false);

  const selectByOffset = useCallback(
    (offset: number) => {
      if (selectedIndex < 0 || stopCount === 0) return;
      const nextIndex = railCanWrap
        ? ((selectedIndex + offset) % stopCount + stopCount) % stopCount
        : Math.max(0, Math.min(stopCount - 1, selectedIndex + offset));
      if (!railCanWrap && nextIndex === selectedIndex) return;
      onSelectStop(stops[nextIndex]);
    },
    [onSelectStop, railCanWrap, selectedIndex, stopCount, stops],
  );

  const resetRailStackSwipe = useCallback(() => {
    if (railStackHoldTimerRef.current !== null) {
      window.clearTimeout(railStackHoldTimerRef.current);
      railStackHoldTimerRef.current = null;
    }
    railStackSwipeStartRef.current = null;
    railStackSwipeLastRef.current = null;
    railStackSwipeStartedAtRef.current = 0;
    railStackDraggingRef.current = false;
    setRailStackDrag(0);
    setRailStackDragging(false);
  }, []);

  const handleRailStackWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!railCanWrap) return;
      const deltaY = event.deltaY;
      if (Math.abs(deltaY) < 8) return;

      event.preventDefault();
      if (railStackWheelTimerRef.current !== null) return;

      selectByOffset(deltaY > 0 ? 1 : -1);
      railStackWheelTimerRef.current = window.setTimeout(() => {
        railStackWheelTimerRef.current = null;
      }, 260);
    },
    [railCanWrap, selectByOffset],
  );

  const handleRailStackTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (stopCount < 2) return;
      event.stopPropagation();
      const touch = event.touches[0];
      if (!touch) return;
      railStackSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      railStackSwipeLastRef.current = { x: touch.clientX, y: touch.clientY };
      railStackSwipeStartedAtRef.current = window.performance.now();
      railStackDraggingRef.current = false;
      setRailStackDrag(0);
      setRailStackDragging(false);
      if (railStackHoldTimerRef.current !== null) {
        window.clearTimeout(railStackHoldTimerRef.current);
      }
      railStackHoldTimerRef.current = window.setTimeout(() => {
        if (!railStackSwipeStartRef.current || !railDraggablePicker) return;
        const heldDeltaY = railStackSwipeLastRef.current
          ? railStackSwipeLastRef.current.y - railStackSwipeStartRef.current.y
          : 0;
        railStackDraggingRef.current = true;
        setRailStackDragging(true);
        setRailStackDrag(heldDeltaY);
      }, RAIL_PICKER_DRAG_HOLD_MS);
    },
    [railDraggablePicker, stopCount],
  );

  const handleRailStackTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!railStackSwipeStartRef.current) return;
      event.stopPropagation();
      const touch = event.touches[0];
      if (!touch) return;
      railStackSwipeLastRef.current = { x: touch.clientX, y: touch.clientY };

      const deltaX = touch.clientX - railStackSwipeStartRef.current.x;
      const deltaY = touch.clientY - railStackSwipeStartRef.current.y;
      if (railStackDraggingRef.current) {
        event.preventDefault();
        setRailStackDrag(deltaY);
        return;
      }

      if (Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX) * 0.8) {
        event.preventDefault();
        if (railDraggablePicker) {
          const elapsedMs =
            railStackSwipeStartedAtRef.current > 0 ? window.performance.now() - railStackSwipeStartedAtRef.current : 0;
          if (elapsedMs >= RAIL_PICKER_DRAG_HOLD_MS) {
            if (railStackHoldTimerRef.current !== null) {
              window.clearTimeout(railStackHoldTimerRef.current);
              railStackHoldTimerRef.current = null;
            }
            railStackDraggingRef.current = true;
            setRailStackDragging(true);
            setRailStackDrag(deltaY);
          }
        }
      }
    },
    [railDraggablePicker],
  );

  const handleRailStackTouchEnd = useCallback(() => {
    if (!railStackSwipeStartRef.current || !railStackSwipeLastRef.current) {
      resetRailStackSwipe();
      return;
    }

    const deltaX = railStackSwipeLastRef.current.x - railStackSwipeStartRef.current.x;
    const deltaY = railStackSwipeLastRef.current.y - railStackSwipeStartRef.current.y;
    const isVerticalIntent = Math.abs(deltaY) >= 18 && Math.abs(deltaY) > Math.abs(deltaX) * 0.82;
    const elapsedMs = railStackSwipeStartedAtRef.current > 0 ? window.performance.now() - railStackSwipeStartedAtRef.current : 999;
    const quickRailFlick = elapsedMs <= 280 && Math.abs(deltaY) >= 34 && Math.abs(deltaY) > Math.abs(deltaX) * 1.05;
    const wasDragging = railStackDraggingRef.current;

    if (railDraggablePicker && wasDragging && isVerticalIntent) {
      const step = RAIL_PICKER_ITEM_HEIGHT + getRailVisibleGap(stopCount);
      const stepDelta = getRailPickerStepDelta(deltaY, step);
      if (stepDelta) selectByOffset(stepDelta);
    } else if (railCanWrap && quickRailFlick) {
      selectByOffset(deltaY < 0 ? 1 : -1);
    }
    resetRailStackSwipe();
  }, [railCanWrap, railDraggablePicker, resetRailStackSwipe, selectByOffset, stopCount]);

  const resetRailPlanSwipe = useCallback(() => {
    railPlanSwipeStartRef.current = null;
    railPlanSwipeLastRef.current = null;
    setRailPlanPull(0);
  }, []);

  const handleRailPlanTouchStart = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      if (plannerOpen) return;
      const touch = event.touches[0];
      if (!touch) return;
      const target = event.target instanceof Element ? event.target : null;
      const railRect = event.currentTarget.getBoundingClientRect();
      const startedOnCue = Boolean(target?.closest(".destination-rail-plan-cue"));
      const startedOnOuterEdge = railRect.right - touch.clientX <= 30;
      if (!startedOnCue && !startedOnOuterEdge) {
        resetRailPlanSwipe();
        return;
      }

      onPreloadPlanner?.();
      railPlanSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      railPlanSwipeLastRef.current = { x: touch.clientX, y: touch.clientY };
      setRailPlanPull(0);
    },
    [onPreloadPlanner, plannerOpen, resetRailPlanSwipe],
  );

  const handleRailPlanTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    if (!railPlanSwipeStartRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    railPlanSwipeLastRef.current = { x: touch.clientX, y: touch.clientY };

    const deltaX = touch.clientX - railPlanSwipeStartRef.current.x;
    const deltaY = touch.clientY - railPlanSwipeStartRef.current.y;
    const upwardPull = Math.max(0, -deltaY);
    const isVertical = upwardPull > 0 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
    if (!isVertical) {
      setRailPlanPull(0);
      return;
    }

    event.preventDefault();
    setRailPlanPull(Math.min(46, upwardPull * 0.46));
  }, []);

  const handleRailPlanTouchEnd = useCallback(() => {
    if (!railPlanSwipeStartRef.current || !railPlanSwipeLastRef.current) {
      resetRailPlanSwipe();
      return;
    }

    const deltaX = railPlanSwipeLastRef.current.x - railPlanSwipeStartRef.current.x;
    const deltaY = railPlanSwipeLastRef.current.y - railPlanSwipeStartRef.current.y;
    const upwardPull = -deltaY;
    const isVertical = upwardPull > 0 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
    if (isVertical && upwardPull >= 88) {
      onOpenPlanner();
    }
    resetRailPlanSwipe();
  }, [onOpenPlanner, resetRailPlanSwipe]);

  useEffect(
    () => () => {
      if (railStackWheelTimerRef.current !== null) {
        window.clearTimeout(railStackWheelTimerRef.current);
      }
      if (railStackHoldTimerRef.current !== null) {
        window.clearTimeout(railStackHoldTimerRef.current);
      }
    },
    [],
  );

  const railVisibleCount = hasRailStops ? Math.min(stopCount, RAIL_MAX_VISIBLE_STOPS) : RAIL_MAX_VISIBLE_STOPS;
  const railVisibleGap = getRailVisibleGap(stopCount);
  const railLastVisibleOffset = Math.max(0, railVisibleCount - 2);
  const railPickerStep = RAIL_PICKER_ITEM_HEIGHT + railVisibleGap;
  const railDragOffset = railDraggablePicker ? railStackDrag / railPickerStep : 0;
  const railPreviewDelta =
    railDraggablePicker && railStackDragging ? getRailPickerStepDelta(railStackDrag, railPickerStep) : 0;
  const railPreviewIndex =
    selectedIndex >= 0 && stopCount > 0
      ? ((selectedIndex + railPreviewDelta) % stopCount + stopCount) % stopCount
      : selectedIndex;

  return (
    <aside
      className={`destination-rail ${hasRailStops ? "picker" : "empty"} ${stopCount === 2 ? "switcher" : ""} ${
        railDraggablePicker ? "draggable" : ""
      } ${railStackDragging ? "is-picker-dragging" : ""} rail-count-${railVisibleCount} ${
        railPlanPull > 0 ? "is-plan-pulling" : ""
      }`}
      aria-label="Destination rail"
      style={
        {
          "--rail-plan-pull": `${railPlanPull}px`,
          "--rail-plan-pull-y": `${railPlanPull * -0.55}px`,
          "--rail-visible-gap": `${railVisibleGap}px`,
        } as CSSProperties
      }
      onTouchStart={handleRailPlanTouchStart}
      onTouchMove={handleRailPlanTouchMove}
      onTouchEnd={handleRailPlanTouchEnd}
      onTouchCancel={resetRailPlanSwipe}
    >
      <RenderMetric name="destination-rail" />
      <button
        type="button"
        className="destination-rail-plan-cue"
        onClick={onOpenPlanner}
        onPointerEnter={onPreloadPlanner}
        onFocus={onPreloadPlanner}
        aria-label="Open trip planner"
      >
        <CalendarRange className="destination-rail-plan-icon" size={13} />
        <span className="destination-rail-plan-wrap" aria-hidden="true">
          <ChevronUp className="destination-rail-plan-arrow" size={15} strokeWidth={2.8} />
          <span className="destination-rail-plan-line" />
        </span>
      </button>
      {hasRailStops ? (
        <>
          <span className="destination-rail-snap-dot" aria-hidden="true" />
          <div
            className="destination-rail-scroll"
            ref={railRef}
            onWheel={handleRailStackWheel}
            onTouchStart={handleRailStackTouchStart}
            onTouchMove={handleRailStackTouchMove}
            onTouchEnd={handleRailStackTouchEnd}
            onTouchCancel={resetRailStackSwipe}
          >
            {railStops.map(({ stop, virtualIndex }) => {
              const canonicalIndex = virtualIndex;
              const pickerOffset = getRailPickerOffset(canonicalIndex, selectedIndex, stopCount);
              const visualOffset = railDraggablePicker
                ? normalizeRailPickerOffset(pickerOffset + railDragOffset, stopCount)
                : pickerOffset;
              const isHidden = stopCount > 1 && (visualOffset < -1.55 || visualOffset > railLastVisibleOffset + 0.55);
              const isRailActive = canonicalIndex === railPreviewIndex;

              return (
                <div
                  key={`${stop.id}-${virtualIndex}`}
                  className={`destination-rail-entry ${isHidden ? "is-hidden" : ""}`}
                  style={
                    {
                      "--rail-entry-offset": visualOffset,
                      "--rail-entry-opacity": isHidden ? 0 : 1,
                    } as CSSProperties
                  }
                >
                  <button
                    type="button"
                    className={`destination-rail-item ${isRailActive ? "active" : ""}`}
                    data-testid="destination-rail-item"
                    data-stop-id={stop.id}
                    onClick={() => onSelectStop(stop)}
                    aria-label={`Select ${stop.name}`}
                  >
                    <span>{stop.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </aside>
  );
}
