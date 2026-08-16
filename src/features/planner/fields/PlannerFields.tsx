import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { coerceDateRange } from "../../../planner";
import {
  START_TRAVEL_PLACE_OPTIONS,
  activeGeocodingProvider,
  isCityLikePlaceQuery,
  likelyCityMatches,
  mergePlaceOptions,
  normalizePlaceSearch,
  type PlaceOption,
} from "../../../providers/geocodingProviders";

const WEEKDAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TIME_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const TIME_MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
const TIME_LOOP_COPIES = 15;
const TIME_MID_LOOP_COPY = Math.floor(TIME_LOOP_COPIES / 2);
const PLANNER_DATE_PICKER_OPEN_CLASS = "planner-date-picker-open";
const PLANNER_FIELD_PICKER_OPEN_CLASS = "planner-field-picker-open";
const PLANNER_PICKER_INPUT_BLOCKER_ID = "planner-picker-input-blocker";

function parseIsoDate(isoDate?: string) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoToday() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function formatDateDisplay(isoDate?: string) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return "Select date";
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function firstOfMonth(value?: string, fallback?: string) {
  const parsed = parseIsoDate(value) ?? parseIsoDate(fallback) ?? parseIsoDate(isoToday())!;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

function monthDays(viewMonth: Date) {
  const year = viewMonth.getUTCFullYear();
  const month = viewMonth.getUTCMonth();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysCurrent = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysPrev = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ iso: string; day: number; outside: boolean }> = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    const day = daysPrev - index;
    const date = new Date(Date.UTC(year, month - 1, day));
    cells.push({
      iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
      day,
      outside: true,
    });
  }

  for (let day = 1; day <= daysCurrent; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    cells.push({
      iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
      day,
      outside: false,
    });
  }

  while (cells.length < 42) {
    const day = cells.length - (firstWeekday + daysCurrent) + 1;
    const date = new Date(Date.UTC(year, month + 1, day));
    cells.push({
      iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
      day,
      outside: true,
    });
  }

  return cells;
}

function scrollPlannerPopupIntoView(wrapper: HTMLElement | null, popupSelector: string) {
  if (!wrapper) return;
  window.requestAnimationFrame(() => {
    const popup = wrapper.querySelector<HTMLElement>(popupSelector);
    const scrollParent = wrapper.closest<HTMLElement>(".planner-editor");
    if (!popup || !scrollParent) return;

    const padding = 14;
    const popupRect = popup.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const overflowBottom = popupRect.bottom - (parentRect.bottom - padding);
    const overflowTop = parentRect.top + padding - popupRect.top;

    if (overflowBottom > 0) {
      scrollParent.scrollBy({ top: overflowBottom, behavior: "smooth" });
    } else if (overflowTop > 0) {
      scrollParent.scrollBy({ top: -overflowTop, behavior: "smooth" });
    }
  });
}

function scrollPlannerPopupIntoViewNow(wrapper: HTMLElement | null, popupSelector: string) {
  if (!wrapper) return;
  const popup = wrapper.querySelector<HTMLElement>(popupSelector);
  const scrollParent = wrapper.closest<HTMLElement>(".planner-editor");
  if (!popup || !scrollParent) return;

  const padding = 14;
  const popupRect = popup.getBoundingClientRect();
  const parentRect = scrollParent.getBoundingClientRect();
  const overflowBottom = popupRect.bottom - (parentRect.bottom - padding);
  const overflowTop = parentRect.top + padding - popupRect.top;

  if (overflowBottom > 0) {
    scrollParent.scrollTop += overflowBottom;
  } else if (overflowTop > 0) {
    scrollParent.scrollTop -= overflowTop;
  }
}

function useDatePickerOpenLock(open: boolean) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add(PLANNER_DATE_PICKER_OPEN_CLASS);
    document.body.classList.add(PLANNER_FIELD_PICKER_OPEN_CLASS);
    return () => {
      document.body.classList.remove(PLANNER_DATE_PICKER_OPEN_CLASS);
      document.body.classList.remove(PLANNER_FIELD_PICKER_OPEN_CLASS);
    };
  }, [open]);
}

function useFieldPickerOpenLock(open: boolean) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add(PLANNER_FIELD_PICKER_OPEN_CLASS);
    return () => {
      document.body.classList.remove(PLANNER_FIELD_PICKER_OPEN_CLASS);
    };
  }, [open]);
}

function consumePickerDismissEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function installTemporaryInputBlocker() {
  const existing = document.getElementById(PLANNER_PICKER_INPUT_BLOCKER_ID);
  existing?.remove();

  const blocker = document.createElement("div");
  blocker.id = PLANNER_PICKER_INPUT_BLOCKER_ID;
  blocker.setAttribute("aria-hidden", "true");
  Object.assign(blocker.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "transparent",
    pointerEvents: "auto",
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
  });

  const block = (event: Event) => {
    consumePickerDismissEvent(event);
  };
  const cleanup = () => {
    blocker.removeEventListener("pointerdown", block, true);
    blocker.removeEventListener("pointerup", block, true);
    blocker.removeEventListener("mousedown", block, true);
    blocker.removeEventListener("mouseup", block, true);
    blocker.removeEventListener("click", block, true);
    blocker.removeEventListener("touchstart", block, true);
    blocker.removeEventListener("touchend", block, true);
    blocker.remove();
  };

  blocker.addEventListener("pointerdown", block, true);
  blocker.addEventListener("pointerup", block, true);
  blocker.addEventListener("mousedown", block, true);
  blocker.addEventListener("mouseup", block, true);
  blocker.addEventListener("click", block, true);
  blocker.addEventListener("touchstart", block, { capture: true, passive: false });
  blocker.addEventListener("touchend", block, { capture: true, passive: false });
  document.body.appendChild(blocker);
  window.setTimeout(cleanup, 480);
}

function blockNextDocumentActivation() {
  let cleanupTimer: number | null = null;
  installTemporaryInputBlocker();
  const block = (event: Event) => {
    consumePickerDismissEvent(event);
  };
  const cleanup = () => {
    if (cleanupTimer !== null) {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    document.removeEventListener("pointerup", block, true);
    document.removeEventListener("mouseup", block, true);
    document.removeEventListener("click", block, true);
    document.removeEventListener("touchend", block, true);
  };

  document.addEventListener("pointerup", block, true);
  document.addEventListener("mouseup", block, true);
  document.addEventListener("click", block, true);
  document.addEventListener("touchend", block, { capture: true, passive: false });
  cleanupTimer = window.setTimeout(cleanup, 450);
}

function useOutsidePickerDismiss(open: boolean, wrapperRef: React.RefObject<HTMLElement | null>, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsidePointerStart = (event: Event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && wrapperRef.current?.contains(target)) return;
      blockNextDocumentActivation();
      consumePickerDismissEvent(event);
      onDismissRef.current();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef.current();
    };

    document.addEventListener("pointerdown", handleOutsidePointerStart, true);
    document.addEventListener("mousedown", handleOutsidePointerStart, true);
    document.addEventListener("touchstart", handleOutsidePointerStart, { capture: true, passive: false });
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerStart, true);
      document.removeEventListener("mousedown", handleOutsidePointerStart, true);
      document.removeEventListener("touchstart", handleOutsidePointerStart, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, wrapperRef]);
}

function useBlockedPickerClose(setOpen: React.Dispatch<React.SetStateAction<boolean>>) {
  const closeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    },
    [],
  );

  return useCallback(
    (options: { blockActivation?: boolean } = {}) => {
      if (!options.blockActivation) {
        setOpen(false);
        return;
      }

      blockNextDocumentActivation();
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      // Keep the picker mounted through the active tap cycle so mobile Safari
      // cannot retarget the same tap to the field that appears underneath it.
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        closeTimerRef.current = null;
      }, 70);
    },
    [setOpen],
  );
}

export function FieldDate({
  id,
  value,
  anchorDate,
  onChange,
  allowEmpty = false,
}: {
  id: string;
  value: string;
  anchorDate?: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => firstOfMonth(value, anchorDate));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const closePicker = useBlockedPickerClose(setOpen);
  const todayIso = isoToday();
  useDatePickerOpenLock(open);
  useOutsidePickerDismiss(open, wrapperRef, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => scrollPlannerPopupIntoViewNow(wrapperRef.current, ".planner-date-popover"));
  }, [open]);

  const headerLabel = `${MONTH_NAMES[viewMonth.getUTCMonth()]} ${viewMonth.getUTCFullYear()}`;
  const cells = monthDays(viewMonth);

  return (
    <div ref={wrapperRef} className="planner-date" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="planner-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) setViewMonth(firstOfMonth(value, anchorDate));
            return next;
          });
        }}
      >
        <span>{formatDateDisplay(value)}</span>
        <Calendar size={16} />
      </button>
      {open ? (
        <div className="planner-date-popover" id={`${id}-calendar`} role="dialog" aria-label="Calendar picker">
          <header className="planner-date-header">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))}
            >
              <ChevronLeft size={14} />
            </button>
            <strong>{headerLabel}</strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))}
            >
              <ChevronRight size={14} />
            </button>
          </header>

          <div className="planner-date-weekdays">
            {WEEKDAY_SHORT.map((weekday) => (
              <span key={`${id}-${weekday}`}>{weekday}</span>
            ))}
          </div>

          <div className="planner-date-grid">
            {cells.map((cell) => {
              const selected = value === cell.iso;
              const today = todayIso === cell.iso;
              return (
                <button
                  key={`${id}-${cell.iso}`}
                  type="button"
                  className={`planner-date-cell ${cell.outside ? "outside" : ""} ${selected ? "selected" : ""} ${today ? "today" : ""}`}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onFocus={(event) => event.currentTarget.blur()}
	                  onClick={(event) => {
	                    event.preventDefault();
	                    event.stopPropagation();
	                    onChange(cell.iso);
	                    closePicker({ blockActivation: true });
	                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <footer className="planner-date-footer">
            {allowEmpty ? (
              <button
                type="button"
	                onClick={(event) => {
	                  event.preventDefault();
	                  event.stopPropagation();
	                  onChange("");
	                  closePicker({ blockActivation: true });
	                }}
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
	              onClick={(event) => {
	                event.preventDefault();
	                event.stopPropagation();
	                onChange(todayIso);
	                closePicker({ blockActivation: true });
	              }}
            >
              Today
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function formatDateRangeDisplay(startValue: string, endValue?: string) {
  if (!startValue) return "Select dates";
  const startLabel = formatDateDisplay(startValue);
  const normalizedEnd = endValue && endValue !== startValue ? endValue : "";
  if (!normalizedEnd) return startLabel;
  return `${startLabel} - ${formatDateDisplay(normalizedEnd)}`;
}

export function FieldDateRange({
  id,
  startValue,
  endValue,
  onChange,
}: {
  id: string;
  startValue: string;
  endValue?: string;
  onChange: (value: { startDate: string; endDate: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => firstOfMonth(startValue, endValue));
  const [draftRange, setDraftRange] = useState<{ startDate: string; endDate: string }>(() => ({
    startDate: startValue,
    endDate: endValue || startValue,
  }));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const closePicker = useBlockedPickerClose(setOpen);
  const draftRangeRef = useRef(draftRange);
  const dragStateRef = useRef<{
    pointerId: number;
    mode: "select" | "start-handle" | "end-handle";
    anchorIso: string;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const todayIso = isoToday();
  const rangeStart = startValue;
  const rangeEnd = endValue || startValue;
  const activeRangeStart = open ? draftRange.startDate : rangeStart;
  const activeRangeEnd = open ? draftRange.endDate || draftRange.startDate : rangeEnd;
  useDatePickerOpenLock(open);
  useOutsidePickerDismiss(open, wrapperRef, () => setOpen(false));

  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => scrollPlannerPopupIntoViewNow(wrapperRef.current, ".planner-date-popover"));
  }, [open]);

  useEffect(() => {
    const finishDrag = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) suppressClickRef.current = true;
      dragStateRef.current = null;
    };
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

  const headerLabel = `${MONTH_NAMES[viewMonth.getUTCMonth()]} ${viewMonth.getUTCFullYear()}`;
  const cells = monthDays(viewMonth);

  const updateDraftRange = useCallback((nextRange: { startDate: string; endDate: string }) => {
    draftRangeRef.current = nextRange;
    setDraftRange(nextRange);
  }, []);

  const applyDragPick = useCallback(
    (iso: string) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const currentDraft = draftRangeRef.current;
      const draftStart = currentDraft.startDate;
      const draftEnd = currentDraft.endDate || currentDraft.startDate;

      if (drag.mode === "select") {
        const nextRange = coerceDateRange(drag.anchorIso, iso);
        const nextStart = nextRange.startDate;
        const nextEnd = nextRange.endDate ?? nextRange.startDate;
        const changed = nextStart !== draftStart || nextEnd !== draftEnd;
        if (!changed) return;
        drag.moved = true;
        updateDraftRange({ startDate: nextStart, endDate: nextEnd });
        setSelectingEnd(false);
        return;
      }

      if (!draftStart || !draftEnd) return;
      if (drag.mode === "start-handle") {
        const nextStart = iso <= draftEnd ? iso : draftEnd;
        if (nextStart === draftStart) return;
        drag.moved = true;
        updateDraftRange({ startDate: nextStart, endDate: draftEnd });
        return;
      }

      const nextEnd = iso >= draftStart ? iso : draftStart;
      if (nextEnd === draftEnd) return;
      drag.moved = true;
      updateDraftRange({ startDate: draftStart, endDate: nextEnd });
    },
    [updateDraftRange],
  );

  const handlePick = (iso: string) => {
    if (!selectingEnd) {
      updateDraftRange({ startDate: iso, endDate: iso });
      setSelectingEnd(true);
      return;
    }

    const nextRange = coerceDateRange(draftRangeRef.current.startDate || iso, iso);
    const normalizedRange = {
      startDate: nextRange.startDate,
      endDate: nextRange.endDate ?? nextRange.startDate,
    };
    updateDraftRange(normalizedRange);
    onChange(normalizedRange);
    setSelectingEnd(false);
    closePicker({ blockActivation: true });
  };

  return (
    <div ref={wrapperRef} className="planner-date-range" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="planner-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) {
              const initialRange = { startDate: startValue, endDate: endValue || startValue };
              setViewMonth(firstOfMonth(startValue, endValue));
              updateDraftRange(initialRange);
              setSelectingEnd(false);
            }
            return next;
          });
        }}
      >
        <span>{formatDateRangeDisplay(startValue, rangeEnd)}</span>
        <Calendar size={16} />
      </button>
      {open ? (
        <div className="planner-date-popover" id={`${id}-calendar`} role="dialog" aria-label="Date range picker">
          <header className="planner-date-header">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))}
            >
              <ChevronLeft size={14} />
            </button>
            <strong>{headerLabel}</strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))}
            >
              <ChevronRight size={14} />
            </button>
          </header>
          <div className="planner-date-weekdays">
              {WEEKDAY_SHORT.map((weekday, index) => (
                <span key={`${weekday}-${index}`}>{weekday}</span>
              ))}
          </div>
          <div className="planner-date-grid">
              {cells.map((cell) => {
                const inRange = activeRangeStart && activeRangeEnd && cell.iso >= activeRangeStart && cell.iso <= activeRangeEnd;
                const isStart = activeRangeStart === cell.iso;
                const isEnd = activeRangeEnd === cell.iso;
                const className = [
                  "planner-date-cell",
                  cell.outside ? "outside" : "",
                  cell.iso === todayIso ? "today" : "",
                  inRange && !isStart && !isEnd ? "range-middle" : "",
                  isStart ? "range-start" : "",
                  isEnd ? "range-end" : "",
                  isStart && isEnd ? "range-single" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    data-date-iso={cell.iso}
                    className={className}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onFocus={(event) => event.currentTarget.blur()}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse" && event.button !== 0) return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const draftStart = draftRangeRef.current.startDate;
                      const draftEnd = draftRangeRef.current.endDate || draftRangeRef.current.startDate;
                      const hasSpanRange = Boolean(draftStart && draftEnd && draftStart !== draftEnd);
                      let mode: "select" | "start-handle" | "end-handle" = "select";
                      if (hasSpanRange && cell.iso === draftStart) mode = "start-handle";
                      if (hasSpanRange && cell.iso === draftEnd) mode = "end-handle";
                      dragStateRef.current = {
                        pointerId: event.pointerId,
                        mode,
                        anchorIso: cell.iso,
                        moved: false,
                      };
                    }}
                    onPointerMove={(event) => {
                      const drag = dragStateRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      event.preventDefault();
                      const hovered = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
                      const iso = hovered?.closest<HTMLButtonElement>("[data-date-iso]")?.dataset.dateIso;
                      if (!iso) return;
                      applyDragPick(iso);
                    }}
	                    onPointerUp={(event) => {
	                      const drag = dragStateRef.current;
	                      if (!drag || drag.pointerId !== event.pointerId) return;
	                      event.preventDefault();
	                      event.stopPropagation();
	                      suppressClickRef.current = true;
	                      if (drag.moved) {
	                        onChange(draftRangeRef.current);
	                        setSelectingEnd(false);
	                        closePicker({ blockActivation: true });
	                      } else {
	                        handlePick(cell.iso);
	                      }
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      dragStateRef.current = null;
                    }}
                    onPointerCancel={(event) => {
                      const drag = dragStateRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      dragStateRef.current = null;
                    }}
	                    onClick={(event) => {
	                      event.preventDefault();
	                      event.stopPropagation();
	                      if (suppressClickRef.current) {
	                        suppressClickRef.current = false;
	                        return;
                      }
                      handlePick(cell.iso);
                    }}
                  >
                    {cell.day}
                  </button>
                );
              })}
          </div>
          <footer className="planner-date-footer">
              <button
                type="button"
	                onClick={(event) => {
	                  event.preventDefault();
	                  event.stopPropagation();
	                  onChange({ startDate: todayIso, endDate: todayIso });
	                  setSelectingEnd(false);
	                  closePicker({ blockActivation: true });
	                }}
              >
                Today
              </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function parseTimeParts(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return { hour: "", minute: "" };
  const [hour, minuteRaw] = value.split(":");
  const minuteValue = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(minuteValue)) return { hour, minute: "" };
  const snappedMinute = Math.max(0, Math.min(55, Math.floor(minuteValue / 5) * 5));
  return { hour, minute: String(snappedMinute).padStart(2, "0") };
}

export function FieldTime({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);
  const closePicker = useBlockedPickerClose(setOpen);
  const timeTapRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressTimeClickRef = useRef(false);
  useFieldPickerOpenLock(open);
  useOutsidePickerDismiss(open, wrapperRef, () => setOpen(false));
  const loopedHours = useMemo(
    () => Array.from({ length: TIME_LOOP_COPIES }, (_, copy) => TIME_HOURS.map((entry) => ({ copy, value: entry }))).flat(),
    [],
  );
  const loopedMinutes = useMemo(
    () => Array.from({ length: TIME_LOOP_COPIES }, (_, copy) => TIME_MINUTES.map((entry) => ({ copy, value: entry }))).flat(),
    [],
  );

  useEffect(() => {
    const parts = parseTimeParts(value);
    setHour(parts.hour);
    setMinute(parts.minute);
  }, [value]);

  const centerColumnOnValue = useCallback((column: HTMLDivElement | null, columnName: "hour" | "minute", valueToCenter: string) => {
    if (!column) return;
    const selected = column.querySelector<HTMLButtonElement>(
      `button[data-time-column="${columnName}"][data-loop-copy="${TIME_MID_LOOP_COPY}"][data-time-value="${valueToCenter}"]`,
    );
    if (!selected) return;
    const top = selected.offsetTop - (column.clientHeight / 2 - selected.clientHeight / 2);
    column.scrollTop = Math.max(0, top);
  }, []);

  useEffect(() => {
    if (!open) return;
    const parts = parseTimeParts(value);
    centerColumnOnValue(hourRef.current, "hour", parts.hour || "12");
    centerColumnOnValue(minuteRef.current, "minute", parts.minute || "00");
    // Important: do this only when opening so selecting values doesn't trigger
    // forced recenter jumps that feel like jitter.
  }, [centerColumnOnValue, open]);

  useEffect(() => {
    if (!open) return;
    scrollPlannerPopupIntoView(wrapperRef.current, ".planner-time-popover");
  }, [open]);

  const applyParts = (nextHour: string, nextMinute: string) => {
    if (nextHour && nextMinute) onChange(`${nextHour}:${nextMinute}`);
  };

  const restoreColumnScroll = useCallback((hourScrollTop: number, minuteScrollTop: number) => {
    const restore = () => {
      if (hourRef.current) hourRef.current.scrollTop = hourScrollTop;
      if (minuteRef.current) minuteRef.current.scrollTop = minuteScrollTop;
    };
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
  }, []);

  const selectTimeValue = (event: React.MouseEvent<HTMLButtonElement>, selectValue: () => void, options: { closeAfter?: boolean } = {}) => {
    const hourScrollTop = hourRef.current?.scrollTop ?? 0;
    const minuteScrollTop = minuteRef.current?.scrollTop ?? 0;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.nativeEvent.stopImmediatePropagation === "function") {
      event.nativeEvent.stopImmediatePropagation();
    }
    event.currentTarget.blur();
    if (options.closeAfter) blockNextDocumentActivation();
    selectValue();
    if (options.closeAfter) return;
    restoreColumnScroll(hourScrollTop, minuteScrollTop);
  };

  const beginTimeTap = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    timeTapRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const moveTimeTap = (event: React.PointerEvent<HTMLButtonElement>) => {
    const tap = timeTapRef.current;
    if (!tap || tap.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - tap.x) > 8 || Math.abs(event.clientY - tap.y) > 8) {
      tap.moved = true;
    }
  };

  const finishTimeTap = (event: React.PointerEvent<HTMLButtonElement>, selectValue: () => void, options: { closeAfter?: boolean } = {}) => {
    const tap = timeTapRef.current;
    if (!tap || tap.pointerId !== event.pointerId) return;
    timeTapRef.current = null;
    if (tap.moved) return;

    suppressTimeClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.nativeEvent.stopImmediatePropagation === "function") {
      event.nativeEvent.stopImmediatePropagation();
    }
    if (options.closeAfter) blockNextDocumentActivation();
    event.currentTarget.blur();
    selectValue();
    if (!options.closeAfter) {
      const hourScrollTop = hourRef.current?.scrollTop ?? 0;
      const minuteScrollTop = minuteRef.current?.scrollTop ?? 0;
      restoreColumnScroll(hourScrollTop, minuteScrollTop);
    }
  };

  return (
    <div ref={wrapperRef} className="planner-time" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="planner-time-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-time`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value || "--:--"}</span>
        <Clock3 size={16} />
      </button>
      {open ? (
        <div className="planner-time-popover" id={`${id}-time`} role="dialog" aria-label="Time picker">
          <div className="planner-time-columns">
            <div
              ref={hourRef}
              className="planner-time-column"
              aria-label="Hours"
            >
              {loopedHours.map((entry, index) => {
                const valueHour = entry.value;
                const active = valueHour === hour;
                return (
                  <button
                    key={`hour-${entry.copy}-${valueHour}-${index}`}
                    type="button"
                    aria-selected={active}
                    data-time-column="hour"
                    data-loop-copy={entry.copy}
                    data-time-value={valueHour}
                    className={`planner-time-cell ${active ? "selected" : ""}`}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={beginTimeTap}
                    onPointerMove={moveTimeTap}
                    onPointerUp={(event) => finishTimeTap(event, () => {
                      const nextMinute = minute || "00";
                      setHour(valueHour);
                      setMinute(nextMinute);
                      applyParts(valueHour, nextMinute);
                    })}
                    onClick={(event) => selectTimeValue(event, () => {
                      if (suppressTimeClickRef.current) {
                        suppressTimeClickRef.current = false;
                        return;
                      }
                      const nextMinute = minute || "00";
                      setHour(valueHour);
                      setMinute(nextMinute);
                      applyParts(valueHour, nextMinute);
                    })}
                  >
                    {valueHour}
                  </button>
                );
              })}
            </div>
            <div
              ref={minuteRef}
              className="planner-time-column"
              aria-label="Minutes"
            >
              {loopedMinutes.map((entry, index) => {
                const valueMinute = entry.value;
                const active = valueMinute === minute;
                return (
                  <button
                    key={`minute-${entry.copy}-${valueMinute}-${index}`}
                    type="button"
                    aria-selected={active}
                    data-time-column="minute"
                    data-loop-copy={entry.copy}
                    data-time-value={valueMinute}
                    className={`planner-time-cell ${active ? "selected" : ""}`}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={beginTimeTap}
                    onPointerMove={moveTimeTap}
	                    onPointerUp={(event) => finishTimeTap(event, () => {
	                      const nextHour = hour || parseTimeParts(value).hour || "12";
	                      setMinute(valueMinute);
	                      setHour(nextHour);
	                      applyParts(nextHour, valueMinute);
	                      closePicker({ blockActivation: true });
	                    }, { closeAfter: true })}
                    onClick={(event) => selectTimeValue(event, () => {
                      if (suppressTimeClickRef.current) {
                        suppressTimeClickRef.current = false;
                        return;
                      }
                      const nextHour = hour || parseTimeParts(value).hour || "12";
	                      setMinute(valueMinute);
	                      setHour(nextHour);
	                      applyParts(nextHour, valueMinute);
	                      closePicker({ blockActivation: true });
	                    }, { closeAfter: true })}
                  >
                    {valueMinute}
                  </button>
                );
              })}
            </div>
          </div>
          <footer className="planner-time-footer">
            <button
              type="button"
	              onPointerDown={(event) => {
	                event.preventDefault();
	                event.stopPropagation();
	                setHour("");
	                setMinute("");
	                onChange("");
	                closePicker({ blockActivation: true });
	              }}
            >
              Clear
            </button>
            <button
              type="button"
	              onPointerDown={(event) => {
	                event.preventDefault();
	                event.stopPropagation();
	                closePicker({ blockActivation: true });
	              }}
            >
              Done
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

export function FieldSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollPlannerPopupIntoView(wrapperRef.current, ".planner-select-menu");
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  const commitSelection = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={wrapperRef} className="planner-select" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="planner-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? ""}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="planner-select-menu" role="listbox" id={`${id}-listbox`} tabIndex={-1}>
          {options.map((option) => {
            const active = option.value === selected?.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`planner-select-option ${active ? "active" : ""}`}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  commitSelection(option.value);
                }}
                onClick={() => {
                  commitSelection(option.value);
                }}
              >
                <span>{option.label}</span>
                {active ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function FieldPlace({
  id,
  value,
  placeholder,
  autoFocus = false,
  onChange,
  onSelectPlace,
}: {
  id: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSelectPlace?: (option: PlaceOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [remoteOptions, setRemoteOptions] = useState<PlaceOption[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<"idle" | "loading" | "error">("idle");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const query = normalizePlaceSearch(value);
  const localMatches = useMemo(() => {
    if (query.length < 2) return [];
    const candidates = START_TRAVEL_PLACE_OPTIONS.filter(
      (option) => option.citySearch.startsWith(query) || option.inputSearch.startsWith(query),
    );
    return candidates.slice(0, 8);
  }, [query]);
  const matches = useMemo(() => mergePlaceOptions(remoteOptions, localMatches, 8), [localMatches, remoteOptions]);

  useEffect(() => {
    if (!open) return;

    const searchText = value.trim();
    if (searchText.length < 2) {
      setRemoteOptions([]);
      setRemoteStatus("idle");
      return;
    }

    const controller = new AbortController();
    setRemoteStatus("loading");

    const geocoder = activeGeocodingProvider();

    // Photon gives us a real OpenStreetMap-backed place search without an API key.
    // For plain city-like typing, we ask for city/town/village records first so
    // "Santiago" becomes "Santiago, Chile" instead of an administrative label.
    const timeout = window.setTimeout(() => {
      const lookup = isCityLikePlaceQuery(searchText)
        ? Promise.all([
            geocoder.searchPlaces(searchText, { cityOnly: true, preferCityLabel: true, signal: controller.signal }),
            geocoder.searchPlaces(searchText, { signal: controller.signal }),
          ]).then(([cityOptions, generalOptions]) => {
            const cityMatches = likelyCityMatches(cityOptions, searchText);
            return cityMatches.length > 0 ? cityMatches : generalOptions;
          })
        : geocoder.searchPlaces(searchText, { signal: controller.signal });

      lookup
        .then((nextOptions) => {
          setRemoteOptions(nextOptions);
          setRemoteStatus("idle");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setRemoteOptions([]);
          setRemoteStatus("error");
        });
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(0);
  }, [open, value]);

  useEffect(() => {
    if (!open || matches.length === 0) return;
    scrollPlannerPopupIntoView(wrapperRef.current, ".planner-place-menu");
  }, [matches.length, open]);

  useEffect(() => {
    if (highlightedIndex <= matches.length - 1) return;
    setHighlightedIndex(Math.max(0, matches.length - 1));
  }, [highlightedIndex, matches.length]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const applyOption = useCallback(
    (option: PlaceOption) => {
      if (onSelectPlace) {
        onSelectPlace(option);
      } else {
        onChange(option.inputLabel);
      }
      setOpen(false);
    },
    [onChange, onSelectPlace],
  );

  return (
    <div ref={wrapperRef} className="planner-place" data-open={open ? "true" : "false"}>
      <input
        type="text"
        name={`lbt-${id}-lookup`}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="new-password"
        autoCorrect="off"
        autoCapitalize="none"
        inputMode="text"
        enterKeyHint="enter"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || matches.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((current) => Math.min(matches.length - 1, current + 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((current) => Math.max(0, current - 1));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const highlighted = matches[highlightedIndex] ?? matches[0];
            const normalizedTyped = normalizePlaceSearch(value);
            if (highlighted && (normalizedTyped === highlighted.inputSearch || normalizedTyped === highlighted.citySearch)) {
              applyOption(highlighted);
              return;
            }
            setOpen(false);
          }
        }}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-busy={remoteStatus === "loading"}
      />
      {open && matches.length > 0 ? (
        <div className="planner-place-menu" role="listbox" id={`${id}-listbox`}>
          {matches.map((option, index) => {
            const active = index === highlightedIndex;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`planner-place-option ${active ? "active" : ""}`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyOption(option)}
              >
                <span>{option.inputLabel}</span>
              </button>
            );
          })}
        </div>
      ) : open && remoteStatus === "loading" ? (
        <div className="planner-place-menu planner-place-menu-muted" role="status">
          Searching...
        </div>
      ) : null}
    </div>
  );
}
