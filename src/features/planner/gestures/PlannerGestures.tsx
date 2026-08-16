import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Trash2 } from "lucide-react";

const PLANNER_DELETE_SWIPE_CLASS = "planner-is-swiping-delete";
const PLANNER_DATE_PICKER_OPEN_CLASS = "planner-date-picker-open";
const PLANNER_FIELD_PICKER_OPEN_CLASS = "planner-field-picker-open";
const DELETE_SWIPE_LEFT_LOCK_PX = 6;
const DELETE_SWIPE_DIAGONAL_RATIO = 0.24;
const DELETE_SWIPE_VERTICAL_LOCK_PX = 14;
const DELETE_SWIPE_EDGE_TRIGGER_MIN_PX = 86;
const DELETE_SWIPE_EDGE_TRIGGER_MAX_PX = 132;
const DELETE_SWIPE_THRESHOLD_PX = 72;
const DELETE_SWIPE_REVEAL_PX = 96;

function getResistedSwipeDistance(rawDistance: number, maxDistance: number) {
  if (rawDistance <= DELETE_SWIPE_THRESHOLD_PX) return rawDistance;
  const resisted = DELETE_SWIPE_THRESHOLD_PX + (rawDistance - DELETE_SWIPE_THRESHOLD_PX) * 0.58;
  return Math.min(maxDistance, resisted);
}

function getSwipeCommitProgress(offset: number, maxDistance: number) {
  const distance = Math.abs(offset);
  if (distance <= DELETE_SWIPE_THRESHOLD_PX) return 0;
  return Math.min(1, (distance - DELETE_SWIPE_THRESHOLD_PX) / Math.max(1, maxDistance - DELETE_SWIPE_THRESHOLD_PX));
}

function setPlannerDeleteSwipeActive(active: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(PLANNER_DELETE_SWIPE_CLASS, active);
}

function isPlannerDeleteSwipeActive() {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(PLANNER_DELETE_SWIPE_CLASS);
}

function isPlannerFieldPickerOpen() {
  if (typeof document === "undefined") return false;
  return (
    document.body.classList.contains(PLANNER_DATE_PICKER_OPEN_CLASS) ||
    document.body.classList.contains(PLANNER_FIELD_PICKER_OPEN_CLASS)
  );
}

function isInDeleteTriggerZone(element: HTMLElement, clientX: number) {
  const rect = element.getBoundingClientRect();
  const triggerWidth = Math.min(
    DELETE_SWIPE_EDGE_TRIGGER_MAX_PX,
    Math.max(DELETE_SWIPE_EDGE_TRIGGER_MIN_PX, rect.width * 0.28),
  );
  return clientX >= rect.right - triggerWidth && clientX <= rect.right + 8;
}

function forwardClickThroughEdgeHitArea(event: ReactMouseEvent<HTMLElement>, root: HTMLElement) {
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

export function useVerticalSwipe({
  enabled = true,
  onSwipeUp,
  onSwipeDown,
  upwardThreshold = 52,
  downwardThreshold = 68,
}: {
  enabled?: boolean;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  upwardThreshold?: number;
  downwardThreshold?: number;
}) {
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeLastRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreGestureRef = useRef(false);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (!enabled) return;
      if (isPlannerDeleteSwipeActive() || isPlannerFieldPickerOpen()) {
        swipeStartRef.current = null;
        swipeLastRef.current = null;
        ignoreGestureRef.current = true;
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const currentTarget = event.currentTarget;
      const noSwipeSelector =
        'input, textarea, select, [data-no-swipe="true"], .planner-place-menu, .planner-select-menu, .planner-date-popover, .planner-time-popover, .planner-time-column';
      const shouldIgnoreByTarget = Boolean(target?.closest(noSwipeSelector));
      let shouldIgnoreByScrollableParent = false;
      let pointer: Element | null = target?.parentElement ?? null;
      while (pointer && pointer !== currentTarget) {
        if (pointer instanceof HTMLElement) {
          const overflowY = window.getComputedStyle(pointer).overflowY;
          const scrollable = (overflowY === "auto" || overflowY === "scroll") && pointer.scrollHeight > pointer.clientHeight + 2;
          if (scrollable) {
            shouldIgnoreByScrollableParent = true;
            break;
          }
        }
        pointer = pointer.parentElement;
      }
      ignoreGestureRef.current = shouldIgnoreByTarget || shouldIgnoreByScrollableParent;
      const touch = event.touches[0];
      if (!touch) return;
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeLastRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [enabled],
  );

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (!enabled) return;
      if (ignoreGestureRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      swipeLastRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [enabled],
  );

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !swipeStartRef.current || !swipeLastRef.current || ignoreGestureRef.current) {
      swipeStartRef.current = null;
      swipeLastRef.current = null;
      ignoreGestureRef.current = false;
      return;
    }

    const deltaX = swipeLastRef.current.x - swipeStartRef.current.x;
    const deltaY = swipeLastRef.current.y - swipeStartRef.current.y;
    const isVerticalGesture = Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
    if (isVerticalGesture) {
      if (deltaY <= -upwardThreshold) {
        onSwipeUp?.();
      } else if (deltaY >= downwardThreshold) {
        onSwipeDown?.();
      }
    }

    swipeStartRef.current = null;
    swipeLastRef.current = null;
    ignoreGestureRef.current = false;
  }, [downwardThreshold, enabled, onSwipeDown, onSwipeUp, upwardThreshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

export function useTopPullDownToClose({
  enabled = true,
  onClose,
  scrollRef,
  threshold = 150,
}: {
  enabled?: boolean;
  onClose: () => void;
  scrollRef: { current: HTMLElement | null };
  threshold?: number;
}) {
  const closeAnimationMs = 340;
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const armedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (enabled) return;
    clearCloseTimer();
    startRef.current = null;
    lastRef.current = null;
    armedRef.current = false;
    setPullDistance(0);
    setIsPulling(false);
    setIsClosing(false);
  }, [clearCloseTimer, enabled]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [clearCloseTimer],
  );

  const reset = useCallback(() => {
    clearCloseTimer();
    startRef.current = null;
    lastRef.current = null;
    armedRef.current = false;
    setPullDistance(0);
    setIsPulling(false);
    setIsClosing(false);
  }, [clearCloseTimer]);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (!enabled) return;
      if (isPlannerDeleteSwipeActive() || isPlannerFieldPickerOpen()) {
        reset();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const noCloseSelector =
        'button, input, textarea, select, [data-no-swipe="true"], [data-no-drag="true"], .planner-place-menu, .planner-select-menu, .planner-date-popover, .planner-time-popover';
      if (target?.closest(noCloseSelector)) {
        reset();
        return;
      }

      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      const startedInsideScroll = Boolean(target?.closest(".planner-v2-sections"));
      if (startedInsideScroll && scrollTop > 2) {
        reset();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      armedRef.current = true;
      startRef.current = { x: touch.clientX, y: touch.clientY };
      lastRef.current = { x: touch.clientX, y: touch.clientY };
      setIsClosing(false);
      setPullDistance(0);
    },
    [enabled, reset, scrollRef],
  );

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (!enabled || !armedRef.current || !startRef.current) return;
      if (isPlannerDeleteSwipeActive() || isPlannerFieldPickerOpen()) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      lastRef.current = { x: touch.clientX, y: touch.clientY };

      const deltaX = touch.clientX - startRef.current.x;
      const deltaY = touch.clientY - startRef.current.y;
      const isVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
      if (!isVertical || deltaY <= 0) {
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      event.preventDefault();
      setIsPulling(true);

      // Give the full-page planner some physical weight: the user has to pull
      // farther than the sheet visibly travels, with extra resistance near the
      // close threshold so accidental scroll gestures spring back.
      const visiblePull =
        deltaY <= threshold ? deltaY * 0.48 : threshold * 0.48 + (deltaY - threshold) * 0.18;
      setPullDistance(Math.min(126, visiblePull));
    },
    [enabled, threshold],
  );

  const handleTouchEnd = useCallback(() => {
    if (isPlannerDeleteSwipeActive() || isPlannerFieldPickerOpen()) {
      reset();
      return;
    }
    if (!enabled || !armedRef.current || !startRef.current || !lastRef.current) {
      reset();
      return;
    }

    const deltaX = lastRef.current.x - startRef.current.x;
    const deltaY = lastRef.current.y - startRef.current.y;
    const isVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
    if (isVertical && deltaY >= threshold) {
      startRef.current = null;
      lastRef.current = null;
      armedRef.current = false;
      setIsPulling(false);
      setIsClosing(true);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setPullDistance(viewportHeight + 48);
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, closeAnimationMs);
      return;
    }

    reset();
  }, [clearCloseTimer, enabled, onClose, reset, threshold]);

  return {
    pullDistance,
    isPulling,
    isClosing,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: reset,
    },
  };
}


export function SwipeDelete({
  children,
  enabled = true,
  requiresConfirmation = false,
  label,
  className = "",
  testId,
  onDelete,
  onSwipeStart,
}: {
  children: ReactNode;
  enabled?: boolean;
  requiresConfirmation?: boolean;
  label: string;
  className?: string;
  testId?: string;
  onDelete: () => void;
  onSwipeStart?: () => void;
}) {
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    swiping: boolean;
    axis: "pending" | "horizontal" | "vertical";
    captureElement: HTMLDivElement | null;
    captured: boolean;
  } | null>(null);
  const touchIntentRef = useRef<{
    startX: number;
    startY: number;
    guardingDelete: boolean;
    ignore: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const deleteTimerRef = useRef<number | null>(null);
  const deleteFinalizeTimerRef = useRef<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const releasePointerCapture = useCallback((pointer: NonNullable<typeof pointerRef.current>) => {
    if (pointer.captured && pointer.captureElement?.hasPointerCapture(pointer.pointerId)) {
      try {
        pointer.captureElement.releasePointerCapture(pointer.pointerId);
      } catch {
        // Pointer capture can already be gone after pointerup/cancel.
      }
    }
    pointer.captured = false;
  }, []);

  const isLeftDeleteIntent = useCallback((deltaX: number, deltaY: number) => {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    return deltaX <= -DELETE_SWIPE_LEFT_LOCK_PX && absX >= Math.max(4, absY * DELETE_SWIPE_DIAGONAL_RATIO);
  }, []);

  const reset = useCallback(() => {
    if (deleteTimerRef.current !== null) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    if (deleteFinalizeTimerRef.current !== null) {
      window.clearTimeout(deleteFinalizeTimerRef.current);
      deleteFinalizeTimerRef.current = null;
    }
    setPlannerDeleteSwipeActive(false);
    const pointer = pointerRef.current;
    if (pointer) releasePointerCapture(pointer);
    pointerRef.current = null;
    touchIntentRef.current = null;
    setOffsetX(0);
    setIsTracking(false);
    setIsSwiping(false);
    setIsDeleting(false);
  }, [releasePointerCapture]);

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current);
      }
      if (deleteFinalizeTimerRef.current !== null) {
        window.clearTimeout(deleteFinalizeTimerRef.current);
      }
      setPlannerDeleteSwipeActive(false);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled || isDeleting || (event.pointerType === "mouse" && event.button !== 0)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [data-no-swipe-delete='true']")) return;
      if (!isInDeleteTriggerZone(event.currentTarget, event.clientX)) return;
      reset();
      pointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        swiping: false,
        axis: "pending",
        captureElement: event.currentTarget,
        captured: false,
      };
      setIsTracking(true);
      setPlannerDeleteSwipeActive(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current.captured = true;
      } catch {
        // Pointer capture is best effort; touch events still guard the gesture.
      }
    },
    [enabled, isDeleting, reset],
  );

  const handleTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!enabled || isDeleting) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const touch = event.touches[0];
      if (!touch) return;
      const ignore =
        Boolean(target?.closest("input, textarea, select, [data-no-swipe-delete='true']")) ||
        !isInDeleteTriggerZone(event.currentTarget, touch.clientX);
      touchIntentRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        guardingDelete: false,
        ignore,
      };
      if (!ignore) {
        // Reserve this touch sequence immediately when it starts from the
        // delete edge. The row still moves only after a left intent is detected,
        // but parent vertical swipe handlers cannot steal curved thumb swipes.
        setPlannerDeleteSwipeActive(true);
        setIsTracking(true);
        event.stopPropagation();
      }
    },
    [enabled, isDeleting],
  );

  const handleTouchMoveCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touchIntent = touchIntentRef.current;
      if (!enabled || isDeleting || !touchIntent || touchIntent.ignore) return;
      const touch = event.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchIntent.startX;
      const deltaY = touch.clientY - touchIntent.startY;
      if (!touchIntent.guardingDelete && isLeftDeleteIntent(deltaX, deltaY)) {
        touchIntent.guardingDelete = true;
      }
      if (!touchIntent.guardingDelete) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [enabled, isDeleting, isLeftDeleteIntent],
  );

  const handleTouchEndCapture = useCallback(() => {
    touchIntentRef.current = null;
    if (!pointerRef.current?.swiping) {
      setPlannerDeleteSwipeActive(false);
      setIsTracking(false);
    }
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const leftOffset = Math.min(0, deltaX);

    if (pointer.axis === "pending") {
      if (absX < 3 && absY < 3) return;
      // Prioritize delete intent: once the gesture starts left, lock horizontal
      // immediately so vertical page scroll cannot take over mid-swipe.
      if (isLeftDeleteIntent(deltaX, deltaY)) {
        pointer.axis = "horizontal";
      } else if (absY >= DELETE_SWIPE_VERTICAL_LOCK_PX && absY > absX * 1.05) {
        pointer.axis = "vertical";
        releasePointerCapture(pointer);
        pointerRef.current = null;
        setPlannerDeleteSwipeActive(false);
        touchIntentRef.current = null;
        setIsTracking(false);
        setIsSwiping(false);
        setOffsetX(0);
        return;
      } else {
        return;
      }
    }

    if (pointer.axis === "vertical") return;

    if (!pointer.swiping) {
      pointer.swiping = true;
      setPlannerDeleteSwipeActive(true);
      onSwipeStart?.();
      setIsSwiping(true);
    }

    event.preventDefault();
    event.stopPropagation();
    const maxTravel = event.currentTarget.getBoundingClientRect().width + 16;
    const nextOffset = -getResistedSwipeDistance(Math.abs(leftOffset), maxTravel);
    pointer.offsetX = nextOffset;
    setOffsetX(nextOffset);
  }, [isLeftDeleteIntent, onSwipeStart, releasePointerCapture]);

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      const shouldDelete = pointer.swiping && pointer.offsetX <= -DELETE_SWIPE_THRESHOLD_PX;
      if (pointer.swiping) {
        event.preventDefault();
        event.stopPropagation();
        setPlannerDeleteSwipeActive(false);
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      if (shouldDelete) {
        const deleteTravel = event.currentTarget.getBoundingClientRect().width + 16;
        pointerRef.current = null;
        setIsTracking(false);
        setIsSwiping(false);
        setIsDeleting(true);
        setOffsetX(-Math.max(112, deleteTravel));
        deleteTimerRef.current = window.setTimeout(() => {
          deleteTimerRef.current = null;
          onDelete();
          if (requiresConfirmation) {
            reset();
            return;
          }
          // Safety fallback: if deletion didn't unmount/remove this row (for example
          // a guarded no-op path), restore the swipe state so it never appears stuck.
          deleteFinalizeTimerRef.current = window.setTimeout(() => {
            deleteFinalizeTimerRef.current = null;
            reset();
          }, 220);
        }, requiresConfirmation ? 120 : 180);
        return;
      }
      reset();
    },
    [onDelete, requiresConfirmation, reset],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      reset();
    },
    [reset],
  );

  const isActive = offsetX < -1 || isSwiping || isDeleting;
  const maxProgressDistance = pointerRef.current?.captureElement?.getBoundingClientRect().width ?? DELETE_SWIPE_REVEAL_PX;
  const revealProgress = Math.min(1, Math.abs(offsetX) / DELETE_SWIPE_REVEAL_PX);
  const commitProgress = getSwipeCommitProgress(offsetX, Math.max(DELETE_SWIPE_REVEAL_PX, maxProgressDistance));

  return (
    <div
      className={`planner-swipe-delete ${isActive ? "is-active" : ""} ${isTracking ? "is-tracking" : ""} ${isSwiping ? "is-swiping" : ""} ${isDeleting ? "is-deleting" : ""} ${className}`}
      data-testid={testId}
      data-disabled={!enabled ? "true" : undefined}
      onTouchStartCapture={handleTouchStartCapture}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchEndCapture={handleTouchEndCapture}
      onTouchCancelCapture={handleTouchEndCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {enabled ? (
        <span
          className="planner-swipe-delete-edge-hit-area"
          aria-hidden="true"
          onClick={(event) => forwardClickThroughEdgeHitArea(event, event.currentTarget.parentElement as HTMLElement)}
        />
      ) : null}
      <div
        className="planner-swipe-delete-action"
        style={
          {
            "--swipe-delete-progress": revealProgress,
            "--swipe-delete-commit": commitProgress,
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <Trash2 size={16} />
      </div>
      <div
        className="planner-swipe-delete-content"
        style={
          {
            "--swipe-delete-progress": revealProgress,
            "--swipe-delete-commit": commitProgress,
            transform: `translate3d(${offsetX}px, 0, 0)`,
          } as CSSProperties
        }
      >
        {children}
      </div>
      {enabled ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}
