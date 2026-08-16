import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Plus,
  Route,
  Trash2,
  X,
} from "lucide-react";
import {
  buildPlannerTimelineModel,
  coerceDateRange,
  formatPlannerItemDate,
  nextDayOrder,
  type PlannerBaseCityRecord,
  type PlannerBreakdownEntry,
  type PlannerCustomBase,
  type PlannerCustomDayRange,
  type PlannerDayDisplayMode,
  type PlannerItem,
  type PlannerItemKind,
  type PlannerStayType,
  type PlannerTimelineEntry,
  type PlannerTimelineKind,
  type PlannerTransportMode,
} from "../../planner";
import { stopById, tripStops, type TripStop } from "../../tripData";
import { FieldDate, FieldDateRange, FieldPlace, FieldSelect, FieldTime } from "./fields/PlannerFields";
import { SwipeDelete, useTopPullDownToClose, useVerticalSwipe } from "./gestures/PlannerGestures";
import { BaseEditor, DayRangeEditor, ItemEditor, StartTravelEditor, TailDepartureEditor } from "./editors/PlannerEditors";
import { allLinkedItemsVisible, hiddenAutoLinkedKeys, hideAutoLinkedKey, linkedItemVisible, toggleAutoLinkedVisibility } from "../../domain/trip/generatedItems";
import { useRenderMetric } from "../../performance/perfMetrics";
import { findKnownPlace, formatPlaceForDisplay, formatRoutePlaceForDisplay, normalizePlaceInput, shortPlaceLabel } from "../../providers/geocodingProviders";

const baseStops = tripStops.filter((stop) => stop.kind === "base");
const TRANSPORT_MODE_OPTIONS: PlannerTransportMode[] = ["flight", "car", "bus", "train", "taxi", "other"];
const STAY_TYPE_OPTIONS: PlannerStayType[] = ["apartment", "hostel", "hotel", "campsite", "camper", "friend_family", "overnight_transport", "tbd", "other"];
const START_TRAVEL_BASE_ID = "__start_travel__";
const WEEKDAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TIME_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const TIME_MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
const TIME_LOOP_COPIES = 15;
const TIME_MID_LOOP_COPY = Math.floor(TIME_LOOP_COPIES / 2);
const TBD_ARRIVAL_SORT_TIME = "00:00";
const TBD_CHECK_IN_SORT_TIME = "15:00";
const TBD_CHECK_OUT_SORT_TIME = "10:00";
const TBD_DEPARTURE_SORT_TIME = "23:59";

type PlannerViewProps = {
  onClose: () => void;
  onSelectStop: (stop: TripStop) => void;
  selectedStopId: string;
  items: PlannerItem[];
  setItems: Dispatch<SetStateAction<PlannerItem[]>>;
  customBases: PlannerCustomBase[];
  setCustomBases: Dispatch<SetStateAction<PlannerCustomBase[]>>;
};

type BaseDraft = {
  mode: "create" | "edit";
  baseId?: string;
  baseCity: string;
  startDate: string;
  endDate: string;
  note: string;
  coordinates?: [number, number];
  country?: string;
  countryCode?: string;
  mapStopId?: string;
};

type DayRangeDraft = {
  mode: "create" | "edit";
  rangeId?: string;
  baseId: string;
  baseName: string;
  startDate: string;
  endDate: string;
  currentStartDate?: string;
  currentEndDate?: string;
  baseNote?: string;
  dayDisplayMode: PlannerDayDisplayMode;
};

type StartTravelDraft = {
  fromLabel: string;
  toLabel: string;
  fromCoordinates?: [number, number];
  toCoordinates?: [number, number];
  fromCountry?: string;
  toCountry?: string;
  fromCountryCode?: string;
  toCountryCode?: string;
  fromMapStopId?: string;
  toMapStopId?: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  transportMode: PlannerTransportMode;
  note: string;
};

type StartTravelEditorState = {
  mode: "create" | "edit";
  sessionId?: string;
  itemId?: string;
  draft: StartTravelDraft;
};

type TailDepartureDraft = {
  toLabel: string;
  toCoordinates?: [number, number];
  toCountry?: string;
  toCountryCode?: string;
  toMapStopId?: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  transportMode: PlannerTransportMode;
  note: string;
};

type TailDepartureEditorState = {
  sourceBaseId: string;
  sourceBaseName: string;
  sourceBaseMapStopId?: string;
  draft: TailDepartureDraft;
};

type ItemDraft = {
  title: string;
  note: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  baseId: string;
  destinationId: string;
  kind: PlannerItemKind;
  transportMode: PlannerTransportMode;
  fromBaseId: string;
  toBaseId: string;
  breakdown: PlannerBreakdownEntry[];
  stayType: PlannerStayType;
  placeLabel: string;
  placeAddress: string;
  placeCoordinates?: [number, number];
  placeCountry?: string;
  placeCountryCode?: string;
  placeMapStopId?: string;
  showOnMap: boolean;
};

type ItemEditorState = {
  sessionId: string;
  mode: "create" | "edit";
  itemId?: string;
  restoreDetailOnClose?: boolean;
  itemType: PlannerTimelineKind;
  draft: ItemDraft;
};

function hasMappableDraftPlace(draft: ItemDraft) {
  return Boolean(draft.placeCoordinates || draft.placeMapStopId);
}

type PlannerConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "neutral";
  onConfirm: () => void;
};

type PlannerV2SectionDay = {
  dayIso: string;
  dayLabel: string;
  entries: PlannerTimelineEntry[];
  transportEdges: PlannerV2TransportEdge[];
  stayMoments: PlannerV2StayMoment[];
  spanEndIso?: string;
  customRangeId?: string;
  customRangeMode?: PlannerDayDisplayMode;
};

type PlannerV2Section = {
  base: PlannerBaseCityRecord;
  displayStartDate?: string;
  displayEndDate?: string;
  stays: PlannerTimelineEntry[];
  days: PlannerV2SectionDay[];
};

type PlannerV2TransportEdge = {
  id: string;
  edge: "arrival" | "departure";
  entry: PlannerTimelineEntry;
  dayIso: string;
  dayLabel: string;
  sortTime: string;
};

type PlannerV2StayMoment = {
  id: string;
  moment: "check-in" | "check-out";
  entry: PlannerTimelineEntry;
  dayIso: string;
  dayLabel: string;
  sortTime: string;
};

type RouteDestinationBase = {
  id: string;
  name: string;
  mapStopId?: string;
  coordinates?: [number, number];
  country?: string;
  countryCode?: string;
};

type PlannerV2SectionNode =
  | {
      type: "entry";
      entry: PlannerTimelineEntry;
      sortTime: string;
      sortOrder: number;
    }
  | {
      type: "transport-edge";
      edge: PlannerV2TransportEdge;
      sortTime: string;
      sortOrder: number;
    }
  | {
      type: "stay-moment";
      moment: PlannerV2StayMoment;
      sortTime: string;
      sortOrder: number;
    };

type PlannerDragState = {
  itemId: string;
  baseId: string;
  sourceDayIso: string;
  sourceIndex: number;
  pointerId: number;
  dragX: number;
  dragY: number;
  targetDayIso: string;
  targetIndex: number;
};

function createPlannerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `manual:${crypto.randomUUID()}`;
  }
  return `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function slugifyBaseCity(baseCity: string) {
  return baseCity
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextMinuteLabel(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const totalMinutes = Math.min(23 * 60 + 59, hours * 60 + minutes + 1);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function isoToday() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function parseIsoDate(isoDate?: string) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoToUtcMs(isoDate?: string) {
  const parsed = parseIsoDate(isoDate);
  return parsed ? parsed.getTime() : Number.NaN;
}

function isoFromUtcMs(utcMs: number) {
  const date = new Date(utcMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDaysToIso(isoDate: string, days: number) {
  const baseMs = isoToUtcMs(isoDate);
  if (!Number.isFinite(baseMs)) return isoDate;
  return isoFromUtcMs(baseMs + days * 24 * 60 * 60 * 1000);
}

function effectiveArrivalDate(startDate: string, endDate?: string) {
  return endDate || startDate;
}

function shouldSuggestNextDayArrival(startDate: string, endDate: string | undefined, startTime: string, endTime: string) {
  if (!startDate || !startTime || !endTime) return false;
  const arrivalDate = effectiveArrivalDate(startDate, endDate);
  return arrivalDate === startDate && endTime < startTime;
}

const EARLIER_ARRIVAL_HINT =
  "Arrival clock time is earlier. This can be normal across time zones, or you may need to set arrival to the next day.";

function isoDayDifference(startDate: string, endDate: string) {
  const startMs = isoToUtcMs(startDate);
  const endMs = isoToUtcMs(endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
}

function isoDayOffset(fromDate: string, toDate: string) {
  const fromMs = isoToUtcMs(fromDate);
  const toMs = isoToUtcMs(toDate);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function formatTransportTimeSummary(item: PlannerItem) {
  const departureTime = item.startTime;
  const arrivalTime = item.endTime;
  if (!departureTime && !arrivalTime) return "";
  const arrivalDate = effectiveArrivalDate(item.startDate, item.endDate);
  const dayDelta = isoDayDifference(item.startDate, arrivalDate);
  if (departureTime && arrivalTime) {
    return dayDelta > 0 ? `${departureTime} to ${arrivalTime} (+${dayDelta}d)` : `${departureTime} to ${arrivalTime}`;
  }
  if (departureTime) return `Dep ${departureTime}`;
  return dayDelta > 0 ? `Arr ${arrivalTime} (+${dayDelta}d)` : `Arr ${arrivalTime}`;
}

function dateRange(startDate?: string, endDate?: string) {
  if (!startDate) return [];
  const startMs = isoToUtcMs(startDate);
  if (!Number.isFinite(startMs)) return [];
  const endMsRaw = endDate ? isoToUtcMs(endDate) : startMs;
  const endMs = Number.isFinite(endMsRaw) ? endMsRaw : startMs;
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  const days: string[] = [];
  for (let point = from; point <= to; point += 24 * 60 * 60 * 1000) {
    days.push(isoFromUtcMs(point));
  }
  return days;
}

function normalizeCustomDayRange(range: PlannerCustomDayRange): PlannerCustomDayRange {
  const normalizedRange = coerceDateRange(range.startDate, range.endDate || range.startDate);
  const normalizedEnd = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;
  return {
    ...range,
    startDate: normalizedRange.startDate,
    endDate: normalizedEnd,
  };
}

function sortCustomDayRanges(ranges: PlannerCustomDayRange[]) {
  return [...ranges].map(normalizeCustomDayRange).sort((left, right) => {
    if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
    const leftEnd = left.endDate ?? left.startDate;
    const rightEnd = right.endDate ?? right.startDate;
    if (leftEnd !== rightEnd) return leftEnd.localeCompare(rightEnd);
    return left.id.localeCompare(right.id);
  });
}

function getCustomBaseDayRanges(customBase?: PlannerCustomBase) {
  if (!customBase) return [];
  if (customBase.dayRanges?.length) return sortCustomDayRanges(customBase.dayRanges);

  if (!customBase.dayDisplayMode) return [];
  const legacyRange = dateRange(customBase.startDate, customBase.endDate ?? customBase.startDate);
  return sortCustomDayRanges([
    {
      id: `${customBase.id}:legacy-range`,
      startDate: customBase.startDate,
      endDate: customBase.endDate,
      // Older builds stored one display mode for the whole base. Very long legacy
      // spans were often accidental unions of several additions, so render them daily.
      dayDisplayMode: customBase.dayDisplayMode === "span" && legacyRange.length <= 3 ? "span" : "daily",
    },
  ]);
}

function dayRangesAfterDeletingDay(ranges: PlannerCustomDayRange[], rangeId: string, dayIso: string) {
  const nextRanges: PlannerCustomDayRange[] = [];

  for (const range of ranges) {
    if (range.id !== rangeId) {
      nextRanges.push(range);
      continue;
    }

    const remainingDays = dateRange(range.startDate, range.endDate ?? range.startDate).filter((candidate) => candidate !== dayIso);
    if (range.dayDisplayMode === "daily") {
      for (const remainingDay of remainingDays) {
        nextRanges.push({
          id: createPlannerId(),
          startDate: remainingDay,
          dayDisplayMode: "daily",
        });
      }
      continue;
    }

    let runStart: string | undefined;
    let previousDay: string | undefined;
    const pushRun = () => {
      if (!runStart) return;
      nextRanges.push({
        id: createPlannerId(),
        startDate: runStart,
        endDate: previousDay && previousDay !== runStart ? previousDay : undefined,
        dayDisplayMode: "span",
      });
    };

    for (const remainingDay of remainingDays) {
      if (!runStart) {
        runStart = remainingDay;
        previousDay = remainingDay;
        continue;
      }
      if (previousDay && remainingDay === addDaysToIso(previousDay, 1)) {
        previousDay = remainingDay;
        continue;
      }
      pushRun();
      runStart = remainingDay;
      previousDay = remainingDay;
    }
    pushRun();
  }

  return sortCustomDayRanges(nextRanges);
}

function dayRangesAfterRemovingDay(ranges: PlannerCustomDayRange[], dayIso: string) {
  let nextRanges = sortCustomDayRanges(ranges);
  for (const range of [...nextRanges]) {
    if (!dateRange(range.startDate, range.endDate ?? range.startDate).includes(dayIso)) continue;
    nextRanges = dayRangesAfterDeletingDay(nextRanges, range.id, dayIso);
  }
  return nextRanges;
}

function sectionDaySort(left: PlannerV2SectionDay, right: PlannerV2SectionDay) {
  if (left.dayIso !== right.dayIso) return left.dayIso.localeCompare(right.dayIso);
  const leftIsSpan = Boolean(left.spanEndIso);
  const rightIsSpan = Boolean(right.spanEndIso);
  if (leftIsSpan !== rightIsSpan) return leftIsSpan ? -1 : 1;
  return left.dayLabel.localeCompare(right.dayLabel);
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

function itemTypeToDefaultKind(itemType: PlannerTimelineKind): PlannerItemKind {
  if (itemType === "transport") return "transport";
  if (itemType === "activity") return "activity";
  return "day";
}

function itemTypeLabel(itemType: PlannerTimelineKind) {
  if (itemType === "transport") return "Transport";
  if (itemType === "activity") return "Activity";
  return "Note";
}

function kindLabel(kind: PlannerItemKind) {
  if (kind === "flight") return "Flight";
  if (kind === "transport") return "Transport";
  if (kind === "roadtrip") return "Roadtrip";
  if (kind === "activity") return "Activity";
  if (kind === "tripBlock") return "Activity";
  if (kind === "stay") return "Stay";
  return "Day";
}

function stayTypeLabel(type: PlannerStayType) {
  if (type === "apartment") return "Apartment";
  if (type === "hostel") return "Hostel";
  if (type === "hotel") return "Hotel";
  if (type === "campsite") return "Campsite";
  if (type === "camper") return "Camper";
  if (type === "friend_family") return "Friends / family";
  if (type === "overnight_transport") return "Overnight transport";
  if (type === "tbd") return "TBD";
  return "Other";
}

function modeLabel(mode: PlannerTransportMode) {
  if (mode === "flight") return "Flight";
  if (mode === "car") return "Car";
  if (mode === "bus") return "Bus";
  if (mode === "train") return "Train";
  if (mode === "taxi") return "Taxi";
  return "Other";
}

function modeFromKind(kind: PlannerItemKind, transportMode?: PlannerTransportMode) {
  if (transportMode) return transportMode;
  if (kind === "flight") return "flight";
  if (kind === "roadtrip") return "car";
  return "bus";
}

function transportKindFromMode(mode: PlannerTransportMode): PlannerItemKind {
  if (mode === "flight") return "flight";
  if (mode === "car") return "roadtrip";
  return "transport";
}

function transportBadgeLabel(item: PlannerItem) {
  if (!isTransportKind(item.kind)) return kindLabel(item.kind);
  return modeLabel(modeFromKind(item.kind, item.transportMode));
}

function isTransportKind(kind: PlannerItemKind) {
  return kind === "flight" || kind === "transport" || kind === "roadtrip";
}

function hasAutoLinkedRows(item: PlannerItem) {
  return item.kind === "stay" || (isTransportKind(item.kind) && Boolean(item.isStartingTravel || item.fromBaseId || item.toBaseId));
}

function classifyTimelineKind(item: PlannerItem): PlannerTimelineKind {
  if (isTransportKind(item.kind)) return "transport";
  if (item.kind === "activity" || item.kind === "tripBlock") return "activity";
  return "note";
}

function normalizeRouteLabel(value?: string) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sameRoutePlaceLabel(left?: string, right?: string) {
  return normalizeRouteLabel(normalizePlaceInput(left ?? "")) === normalizeRouteLabel(normalizePlaceInput(right ?? ""));
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

function DetailAddress({
  address,
  showCopy,
  copied,
  onCopy,
}: {
  address: string;
  showCopy: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const containerRef = useRef<HTMLParagraphElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const addressDisplay = useMemo(() => detailAddressDisplayParts(address), [address]);
  const canSplit = Boolean(addressDisplay.tail);
  const [shouldSplit, setShouldSplit] = useState(false);

  const updateSplit = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || !canSplit) {
      setShouldSplit(false);
      return;
    }
    const copyWidth = showCopy ? 22 : 0;
    setShouldSplit(measure.scrollWidth + copyWidth > container.clientWidth + 1);
  }, [canSplit, showCopy]);

  useLayoutEffect(() => {
    updateSplit();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateSplit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [address, updateSplit]);

  const copyButton = showCopy ? (
    <button
      type="button"
      className={`planner-v2-detail-address-copy ${copied ? "copied" : ""}`}
      onClick={onCopy}
      aria-label="Copy full address"
      title={copied ? "Copied" : "Copy address"}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  ) : null;

  return (
    <p className="planner-v2-detail-address" ref={containerRef}>
      <span className="planner-v2-detail-address-measure" ref={measureRef} aria-hidden="true">
        {address}
      </span>
      {shouldSplit ? (
        <>
          <span className="planner-v2-detail-address-main">
            {addressDisplay.main}
            {copyButton}
          </span>
          <span className="planner-v2-detail-address-tail">{addressDisplay.tail}</span>
        </>
      ) : (
        <>
          {address}
          {copyButton}
        </>
      )}
    </p>
  );
}

function DetailSheet({
  entry,
  onClose,
  onEdit,
  copiedAddressId,
  onCopyAddress,
}: {
  entry: PlannerTimelineEntry;
  onClose: () => void;
  onEdit: () => void;
  copiedAddressId: string | null;
  onCopyAddress: (text: string, id: string) => void;
}) {
  const transportTimeSummary = entry.kind === "transport" ? formatTransportTimeSummary(entry.item) : "";
  const transportRouteLabel = entry.kind === "transport" ? routeLabelForEntry(entry) : "";
  const arrivalDate = effectiveArrivalDate(entry.item.startDate, entry.item.endDate);
  const isStay = entry.item.kind === "stay";
  const isActivity = entry.kind === "activity" && !isStay;
  const fullAddress = detailAddressText(entry);
  const isRouteStyleAddress = fullAddress.includes("->");
  const showDetailCopy = Boolean(fullAddress) && !isRouteStyleAddress && entry.kind !== "transport";
  const detailCopyId = `detail-${entry.id}`;
  const isDetailCopied = copiedAddressId === detailCopyId;
  const swipeHandlers = useVerticalSwipe({
    onSwipeUp: onEdit,
    onSwipeDown: onClose,
  });

  return (
    <section className="planner-editor-backdrop" role="presentation" {...swipeHandlers} onClick={onClose}>
      <div className={`planner-v2-detail ${entry.kind === "transport" ? "transport" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle planner-swipe-handle swipe-handle-bar" aria-hidden="true" />
        <header className="planner-editor-header">
          <div>
            {entry.kind === "transport" ? (
              <h3 className="planner-v2-detail-route-title">
                <Route size={17} />
                {transportRouteLabel}
              </h3>
            ) : isStay ? (
              <h3>{stayTitle(entry)}</h3>
            ) : (
              <h3>{entry.item.title}</h3>
            )}
            {entry.kind === "transport" || isStay || isActivity ? null : <p>{entry.dateLabel}</p>}
          </div>
        </header>
        {fullAddress ? (
          <div className="planner-v2-detail-address-row">
            <DetailAddress
              address={fullAddress}
              showCopy={showDetailCopy}
              copied={isDetailCopied}
              onCopy={() => onCopyAddress(fullAddress, detailCopyId)}
            />
          </div>
        ) : null}
        {isActivity ? (
          <div className="planner-v2-detail-activity-meta">
            <span>{entry.dateLabel}</span>
            {entry.timeLabel ? (
              <>
                <span className="dot" aria-hidden="true">
                  •
                </span>
                <span>
                  <Clock3 size={13} />
                  {entry.timeLabel}
                </span>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="planner-v2-detail-kickers">
          <span className={`planner-kind ${entry.item.kind}`}>{isStay ? stayTypeLabel(entry.item.stayType ?? "apartment") : transportBadgeLabel(entry.item)}</span>
          {entry.base && entry.kind !== "transport" ? (
            <span>
              <CalendarDays size={13} />
              {entry.base.name}
            </span>
          ) : null}
          {entry.kind === "transport" || isActivity ? null : entry.timeLabel ? (
            <span>
              <Clock3 size={13} />
              {entry.timeLabel}
            </span>
          ) : null}
        </div>

        {entry.kind === "transport" ? (
          <div className="planner-v2-transport-times">
            <article>
              <span>Depart</span>
              <strong>{formatPlannerItemDate(entry.item.startDate)}</strong>
              <time>{entry.item.startTime || "Time TBD"}</time>
            </article>
            <article>
              <span>Arrive</span>
              <strong>{formatPlannerItemDate(arrivalDate)}</strong>
              <time>{entry.item.endTime || "Time TBD"}</time>
              {transportTimeSummary.includes("(+") ? <small>{transportTimeSummary.match(/\(\+\dd\)/)?.[0]}</small> : null}
            </article>
          </div>
        ) : null}

        {isStay ? (
          <div className="planner-v2-stay-detail-grid">
            <article>
              <span>Check in</span>
              <strong>{formatPlannerItemDate(entry.item.startDate)}</strong>
              <time>{entry.item.startTime || "Time TBD"}</time>
            </article>
            <article>
              <span>Check out</span>
              <strong>{formatPlannerItemDate(entry.item.endDate ?? entry.item.startDate)}</strong>
              <time>{entry.item.endTime || "Time TBD"}</time>
            </article>
          </div>
        ) : null}

        {entry.item.note ? <p className="planner-v2-detail-note">{entry.item.note}</p> : null}

        {(entry.item.overnightEntries ?? entry.item.breakdown) && (entry.item.overnightEntries ?? entry.item.breakdown ?? []).length > 0 ? (
          <ol className="planner-breakdown-list">
            {(entry.item.overnightEntries ?? entry.item.breakdown ?? []).map((line) => (
              <li key={line.id}>
                <strong>{formatPlannerItemDate(line.date)}</strong>
                <span>{line.title}</span>
                {line.note ? <p>{line.note}</p> : null}
              </li>
            ))}
          </ol>
        ) : null}

      </div>
    </section>
  );
}

function ConfirmDialog({
  state,
  onCancel,
}: {
  state: PlannerConfirmState;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        state.onConfirm();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, state]);

  return (
    <section className="planner-editor-backdrop planner-editor-backdrop-center" role="presentation" onClick={onCancel}>
      <div
        className="planner-editor planner-editor-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="planner-editor-header">
          <div>
            <h3>{state.title}</h3>
            <p>{state.message}</p>
          </div>
        </header>
        <footer className="planner-editor-footer">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`primary ${state.tone === "danger" ? "danger" : ""}`}
            onClick={() => {
              state.onConfirm();
              onCancel();
            }}
          >
            {state.confirmLabel}
          </button>
        </footer>
      </div>
    </section>
  );
}

function routeLabelForEntry(entry: PlannerTimelineEntry) {
  const from = entry.item.fromLabel
    ? formatRoutePlaceForDisplay(entry.item.fromLabel, entry.item.fromCountryCode, entry.item.fromCountry)
    : entry.fromBase?.name || "Unknown";
  const to = entry.item.toLabel
    ? formatRoutePlaceForDisplay(entry.item.toLabel, entry.item.toCountryCode, entry.item.toCountry)
    : entry.toBase?.name || "Unknown";
  return `${from} to ${to}`;
}

function routeFromLabelForEntry(entry: PlannerTimelineEntry) {
  return entry.item.fromLabel
    ? formatRoutePlaceForDisplay(entry.item.fromLabel, entry.item.fromCountryCode, entry.item.fromCountry)
    : entry.fromBase?.name || "Unknown";
}

function routeToLabelForEntry(entry: PlannerTimelineEntry) {
  return entry.item.toLabel
    ? formatRoutePlaceForDisplay(entry.item.toLabel, entry.item.toCountryCode, entry.item.toCountry)
    : entry.toBase?.name || "Unknown";
}

function edgeTimeLabel(edge: PlannerV2TransportEdge) {
  return edge.edge === "arrival" ? edge.entry.item.endTime || "Time TBD" : edge.entry.item.startTime || "Time TBD";
}

function edgeTitle(edge: PlannerV2TransportEdge) {
  if (edge.edge === "arrival") return `Arrive at ${routeToLabelForEntry(edge.entry)}`;
  return `Leave from ${routeFromLabelForEntry(edge.entry)}`;
}

function edgeSubtitle(edge: PlannerV2TransportEdge) {
  if (edge.edge === "arrival") return `From ${routeFromLabelForEntry(edge.entry)}`;
  return `To ${routeToLabelForEntry(edge.entry)}`;
}

function stayTitle(entry: PlannerTimelineEntry) {
  const label = entry.item.placeLabel?.trim() || entry.item.title || "";
  const shortLabel = shortPlaceLabel(label);
  return shortLabel || label || "Stay";
}

function staySubtitle(entry: PlannerTimelineEntry) {
  return entry.item.note;
}

function stayCopyText(entry: PlannerTimelineEntry) {
  const explicitAddress = entry.item.placeAddress?.trim();
  if (explicitAddress) return explicitAddress;
  const fallback = entry.item.placeLabel?.trim() || entry.item.title || "";
  return normalizePlaceInput(fallback);
}

function detailAddressText(entry: PlannerTimelineEntry) {
  if (entry.kind === "transport") {
    const from = normalizePlaceInput(entry.item.fromLabel || entry.fromBase?.name || "");
    const to = normalizePlaceInput(entry.item.toLabel || entry.toBase?.name || "");
    if (from && to) return `${from} -> ${to}`;
    return from || to;
  }
  const explicitAddress = entry.item.placeAddress?.trim();
  if (explicitAddress) return explicitAddress;
  const fallback = entry.item.placeLabel?.trim();
  if (fallback) return normalizePlaceInput(fallback);
  return "";
}

function detailAddressDisplayParts(address: string) {
  const trimmed = address.trim();
  if (!trimmed) return { main: "", tail: "" };
  const lastCommaIndex = trimmed.lastIndexOf(",");
  if (lastCommaIndex < 0) return { main: trimmed, tail: "" };
  const main = trimmed.slice(0, lastCommaIndex + 1).trim();
  const tail = trimmed.slice(lastCommaIndex + 1).trim();
  return {
    main: main || trimmed,
    tail,
  };
}

function stayMomentTitle(moment: PlannerV2StayMoment) {
  return moment.moment === "check-in" ? `Check in: ${stayTitle(moment.entry)}` : `Check out: ${stayTitle(moment.entry)}`;
}

function stayMomentTime(moment: PlannerV2StayMoment) {
  if (moment.moment === "check-in") return moment.entry.item.startTime || "Time TBD";
  return moment.entry.item.endTime || "Time TBD";
}

function inferLastSelectedStayType(items: PlannerItem[]): PlannerStayType {
  const sortedStays = [...items]
    .filter((item): item is PlannerItem & { stayType: PlannerStayType } => item.kind === "stay" && Boolean(item.stayType))
    .sort((left, right) => {
      if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
      return left.order - right.order;
    });
  return sortedStays[sortedStays.length - 1]?.stayType ?? "apartment";
}

function buildSectionDayNodes(day: PlannerV2SectionDay): PlannerV2SectionNode[] {
  return [
    ...day.stayMoments.map((moment): PlannerV2SectionNode => ({
      type: "stay-moment",
      moment,
      sortTime: moment.sortTime,
      sortOrder: moment.moment === "check-in" ? -20 : 20,
    })),
    ...day.transportEdges.map((edge): PlannerV2SectionNode => ({
      type: "transport-edge",
      edge,
      sortTime: edge.sortTime,
      sortOrder: edge.edge === "arrival" ? -10 : 10,
    })),
    ...day.entries.map((entry): PlannerV2SectionNode => ({
      type: "entry",
      entry,
      sortTime: entry.item.startTime ?? "23:59",
      sortOrder: entry.item.order,
    })),
  ].sort((left, right) => {
    if (left.sortTime !== right.sortTime) return left.sortTime.localeCompare(right.sortTime);
    return left.sortOrder - right.sortOrder;
  });
}

export default function PlannerView({ onClose, onSelectStop, selectedStopId, items, setItems, customBases, setCustomBases }: PlannerViewProps) {
  useRenderMetric("planner-view");

  const [baseDraft, setBaseDraft] = useState<BaseDraft | null>(null);
  const [dayRangeDraft, setDayRangeDraft] = useState<DayRangeDraft | null>(null);
  const [startTravelEditor, setStartTravelEditor] = useState<StartTravelEditorState | null>(null);
  const [tailDepartureEditor, setTailDepartureEditor] = useState<TailDepartureEditorState | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [lastSelectedStayType, setLastSelectedStayType] = useState<PlannerStayType>(() => inferLastSelectedStayType(items));
  const [copiedStayId, setCopiedStayId] = useState<string | null>(null);
  const [copiedDetailId, setCopiedDetailId] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<PlannerConfirmState | null>(null);
  const [dragState, setDragState] = useState<PlannerDragState | null>(null);
  const autoCreatedStartTravelBySessionRef = useRef<Map<string, string>>(new Map());
  const autoCreatedItemBySessionRef = useRef<Map<string, string>>(new Map());
  const copyStayTimerRef = useRef<number | null>(null);
  const copyDetailTimerRef = useRef<number | null>(null);
  const plannerScrollRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<{
    itemId: string;
    baseId: string;
    sourceDayIso: string;
    sourceIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    targetDayIso: string;
    targetIndex: number;
    active: boolean;
    pressTimer: number | null;
    captureElement: HTMLElement | null;
    captured: boolean;
  } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const suppressClickItemRef = useRef<string | null>(null);

  useEffect(() => {
    const startingTravelItems = items.filter((item) => item.isStartingTravel);
    if (startingTravelItems.length <= 1) return;

    const keepItem = startingTravelItems.reduce((best, item) => {
      const bestEnd = best.endDate ?? best.startDate;
      const itemEnd = item.endDate ?? item.startDate;
      if (itemEnd !== bestEnd) return itemEnd > bestEnd ? item : best;
      const bestCompleteness = Number(Boolean(best.fromLabel)) + Number(Boolean(best.toLabel)) + Number(Boolean(best.startTime)) + Number(Boolean(best.endTime));
      const itemCompleteness = Number(Boolean(item.fromLabel)) + Number(Boolean(item.toLabel)) + Number(Boolean(item.startTime)) + Number(Boolean(item.endTime));
      return itemCompleteness > bestCompleteness ? item : best;
    }, startingTravelItems[0]);
    const duplicateIds = new Set(startingTravelItems.filter((item) => item.id !== keepItem.id).map((item) => item.id));
    setItems((current) => current.filter((item) => !duplicateIds.has(item.id)));
  }, [items, setItems]);

  useEffect(() => {
    return () => {
      if (copyStayTimerRef.current) {
        window.clearTimeout(copyStayTimerRef.current);
      }
      if (copyDetailTimerRef.current) {
        window.clearTimeout(copyDetailTimerRef.current);
      }
    };
  }, []);

  const copyStayText = useCallback((text: string, id: string) => {
    const payload = text.trim();
    if (!payload) return;
    const markCopied = () => {
      setCopiedStayId(id);
      if (copyStayTimerRef.current) {
        window.clearTimeout(copyStayTimerRef.current);
      }
      copyStayTimerRef.current = window.setTimeout(() => setCopiedStayId(null), 1300);
    };
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = payload;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      markCopied();
    };
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload).then(markCopied).catch(fallbackCopy);
      return;
    }
    fallbackCopy();
  }, []);

  const copyDetailText = useCallback((text: string, id: string) => {
    const payload = text.trim();
    if (!payload) return;
    const markCopied = () => {
      setCopiedDetailId(id);
      if (copyDetailTimerRef.current) {
        window.clearTimeout(copyDetailTimerRef.current);
      }
      copyDetailTimerRef.current = window.setTimeout(() => setCopiedDetailId(null), 1300);
    };
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = payload;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      markCopied();
    };
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload).then(markCopied).catch(fallbackCopy);
      return;
    }
    fallbackCopy();
  }, []);

  const resetDragSession = useCallback(() => {
    const activeSession = dragSessionRef.current;
    if (activeSession?.pressTimer) {
      window.clearTimeout(activeSession.pressTimer);
    }
    if (activeSession?.captured && activeSession.captureElement?.hasPointerCapture(activeSession.pointerId)) {
      try {
        activeSession.captureElement.releasePointerCapture(activeSession.pointerId);
      } catch {
        // Pointer capture can already be gone after pointerup/cancel.
      }
    }
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    dragSessionRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => {
    if (!dragState) return;
    if (items.some((item) => item.id === dragState.itemId)) return;
    resetDragSession();
  }, [dragState, items, resetDragSession]);

  const resolveDragTarget = useCallback((clientX: number, clientY: number, baseId: string, draggingItemId: string) => {
    const hit = document.elementFromPoint(clientX, clientY);
    if (!(hit instanceof HTMLElement)) return null;
    const dayElement = hit.closest<HTMLElement>("[data-dnd-day-iso][data-dnd-base-id]");
    if (!dayElement || dayElement.dataset.dndBaseId !== baseId) return null;
    const dayIso = dayElement.dataset.dndDayIso;
    if (!dayIso) return null;

    const rows = [...dayElement.querySelectorAll<HTMLElement>('[data-dnd-row="true"][data-dnd-base-id]')]
      .filter((row) => row.dataset.dndBaseId === baseId && row.dataset.dndItemId !== draggingItemId);
    let targetIndex = rows.length;

    const hitRow = hit.closest<HTMLElement>('[data-dnd-row="true"][data-dnd-base-id]');
    if (hitRow && hitRow.dataset.dndBaseId === baseId && hitRow.dataset.dndItemId !== draggingItemId) {
      const rowIndex = rows.findIndex((row) => row === hitRow);
      if (rowIndex >= 0) {
        const rowRect = hitRow.getBoundingClientRect();
        const isBottomHalf = clientY >= rowRect.top + rowRect.height / 2;
        targetIndex = rowIndex + (isBottomHalf ? 1 : 0);
      }
    }

    return { dayIso, targetIndex };
  }, []);

  const flushDragFrame = useCallback(() => {
    dragFrameRef.current = null;
    const activeSession = dragSessionRef.current;
    if (!activeSession?.active) return;

    const target = resolveDragTarget(activeSession.currentX, activeSession.currentY, activeSession.baseId, activeSession.itemId);
    if (target) {
      activeSession.targetDayIso = target.dayIso;
      activeSession.targetIndex = target.targetIndex;
    }

    setDragState((current) => {
      if (!current || current.pointerId !== activeSession.pointerId) return current;
      return {
        ...current,
        dragX: activeSession.currentX - activeSession.startX,
        dragY: activeSession.currentY - activeSession.startY,
        targetDayIso: activeSession.targetDayIso,
        targetIndex: activeSession.targetIndex,
      };
    });
  }, [resolveDragTarget]);

  const moveItemByDrag = useCallback(
    (itemId: string, sourceDayIso: string, targetDayIso: string, targetIndex: number) => {
      setItems((current) => {
        const movingItem = current.find((item) => item.id === itemId);
        if (!movingItem || movingItem.isStartingTravel) return current;
        const baseId = movingItem.baseId;

        const sourceItemsWithout = current
          .filter((item) => item.baseId === baseId && item.startDate === sourceDayIso && item.id !== itemId)
          .sort((left, right) => left.order - right.order);
        const targetItemsWithout =
          sourceDayIso === targetDayIso
            ? sourceItemsWithout
            : current
                .filter((item) => item.baseId === baseId && item.startDate === targetDayIso && item.id !== itemId)
                .sort((left, right) => left.order - right.order);
        const insertAt = Math.max(0, Math.min(targetIndex, targetItemsWithout.length));

        const dayOffset = isoDayOffset(sourceDayIso, targetDayIso);
        const nextStartDate = addDaysToIso(movingItem.startDate, dayOffset);
        const shiftedEndDate = movingItem.endDate ? addDaysToIso(movingItem.endDate, dayOffset) : undefined;
        const nextEndDate = shiftedEndDate && shiftedEndDate !== nextStartDate ? shiftedEndDate : undefined;
        const movedItem = { ...movingItem, startDate: nextStartDate, endDate: nextEndDate };

        const targetOrdered = [...targetItemsWithout];
        targetOrdered.splice(insertAt, 0, movedItem);
        const targetOrderById = new Map<string, number>();
        targetOrdered.forEach((item, index) => {
          targetOrderById.set(item.id, index * 100);
        });

        const sourceOrderById = new Map<string, number>();
        if (sourceDayIso !== targetDayIso) {
          sourceItemsWithout.forEach((item, index) => {
            sourceOrderById.set(item.id, index * 100);
          });
        }

        let changed = false;
        const nextItems = current.map((item) => {
          if (item.id === movingItem.id) {
            const nextOrder = targetOrderById.get(item.id) ?? item.order;
            if (item.startDate !== nextStartDate || item.endDate !== nextEndDate || item.order !== nextOrder) {
              changed = true;
              return {
                ...item,
                startDate: nextStartDate,
                endDate: nextEndDate,
                order: nextOrder,
              };
            }
            return item;
          }

          if (item.baseId !== baseId) return item;

          const targetOrder = targetOrderById.get(item.id);
          if (targetOrder !== undefined && item.order !== targetOrder) {
            changed = true;
            return { ...item, order: targetOrder };
          }

          const sourceOrder = sourceOrderById.get(item.id);
          if (sourceOrder !== undefined && item.order !== sourceOrder) {
            changed = true;
            return { ...item, order: sourceOrder };
          }

          return item;
        });

        return changed ? nextItems : current;
      });
    },
    [setItems],
  );

  const handleGlobalPointerMove = useCallback(
    (event: PointerEvent) => {
      const activeSession = dragSessionRef.current;
      if (!activeSession || event.pointerId !== activeSession.pointerId) return;

      activeSession.currentX = event.clientX;
      activeSession.currentY = event.clientY;

      if (!activeSession.active) {
        const distance = Math.hypot(event.clientX - activeSession.startX, event.clientY - activeSession.startY);
        if (distance > 10) {
          resetDragSession();
        }
        return;
      }

      event.preventDefault();
      if (dragFrameRef.current === null) {
        dragFrameRef.current = window.requestAnimationFrame(flushDragFrame);
      }
    },
    [flushDragFrame, resetDragSession],
  );

  const handleGlobalPointerUp = useCallback(
    (event: PointerEvent) => {
      const activeSession = dragSessionRef.current;
      if (!activeSession || event.pointerId !== activeSession.pointerId) return;

      if (activeSession.active) {
        moveItemByDrag(activeSession.itemId, activeSession.sourceDayIso, activeSession.targetDayIso, activeSession.targetIndex);
        suppressClickItemRef.current = activeSession.itemId;
      }
      resetDragSession();
    },
    [moveItemByDrag, resetDragSession],
  );

  const handleGlobalPointerCancel = useCallback(
    (event: PointerEvent) => {
      const activeSession = dragSessionRef.current;
      if (!activeSession || event.pointerId !== activeSession.pointerId) return;
      resetDragSession();
    },
    [resetDragSession],
  );

  useEffect(() => {
    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: false });
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerCancel);
    };
  }, [handleGlobalPointerCancel, handleGlobalPointerMove, handleGlobalPointerUp]);

  useEffect(() => {
    if (!dragState) return;
    document.body.classList.add("planner-is-dragging");
    return () => {
      document.body.classList.remove("planner-is-dragging");
    };
  }, [dragState]);

  useEffect(
    () => () => {
      const activeSession = dragSessionRef.current;
      if (activeSession?.pressTimer) {
        window.clearTimeout(activeSession.pressTimer);
      }
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    },
    [],
  );

  const beginLongPressDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, itemId: string, baseId: string, dayIso: string, sourceIndex: number) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, input, textarea, select, [data-no-drag='true']")) return;
      if (itemEditor || startTravelEditor || dayRangeDraft || baseDraft || tailDepartureEditor || confirmDialog) return;

      resetDragSession();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const captureElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

      const pressTimer = window.setTimeout(() => {
        const liveSession = dragSessionRef.current;
        if (!liveSession || liveSession.pointerId !== pointerId) return;

        liveSession.pressTimer = null;
        liveSession.active = true;
        if (liveSession.captureElement && !liveSession.captured) {
          try {
            liveSession.captureElement.setPointerCapture(pointerId);
            liveSession.captured = true;
          } catch {
            // Ignore if capture is not available for this pointer source.
          }
        }
        const initialTarget = resolveDragTarget(liveSession.currentX, liveSession.currentY, baseId, itemId);
        if (initialTarget) {
          liveSession.targetDayIso = initialTarget.dayIso;
          liveSession.targetIndex = initialTarget.targetIndex;
        }
        setDragState({
          itemId,
          baseId,
          sourceDayIso: dayIso,
          sourceIndex,
          pointerId,
          dragX: 0,
          dragY: 0,
          targetDayIso: liveSession.targetDayIso,
          targetIndex: liveSession.targetIndex,
        });
      }, 220);

      dragSessionRef.current = {
        itemId,
        baseId,
        sourceDayIso: dayIso,
        sourceIndex,
        pointerId,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        targetDayIso: dayIso,
        targetIndex: sourceIndex,
        active: false,
        pressTimer,
        captureElement,
        captured: false,
      };
    },
    [baseDraft, confirmDialog, dayRangeDraft, itemEditor, resetDragSession, resolveDragTarget, startTravelEditor, tailDepartureEditor],
  );

  const selectedBaseId = useMemo(() => {
    const selectedStop = stopById.get(selectedStopId);
    if (!selectedStop) return "";
    if (selectedStop.kind === "base") return selectedStop.id;
    return selectedStop.parentId ?? selectedStop.id;
  }, [selectedStopId]);

  const timeline = useMemo(() => buildPlannerTimelineModel(items, baseStops, customBases), [items, customBases]);
  const baseById = useMemo(() => new Map(timeline.bases.map((base) => [base.id, base])), [timeline.bases]);
  const customBaseById = useMemo(() => new Map(customBases.map((base) => [base.id, base])), [customBases]);
  const hasStartingTravel = useMemo(() => items.some((item) => item.isStartingTravel), [items]);

  const resolveOrCreateDestinationBase = useCallback(
    ({
      label,
      startDate,
      coordinates,
      country,
      countryCode,
      mapStopId,
    }: {
      label: string;
      startDate: string;
      coordinates?: [number, number];
      country?: string;
      countryCode?: string;
      mapStopId?: string;
    }): RouteDestinationBase | undefined => {
      const destinationLabel = normalizePlaceInput(label);
      if (!destinationLabel || !startDate) return undefined;

      const normalizedDestinationName = normalizeRouteLabel(destinationLabel);
      const mappedDestinationBase = mapStopId ? timeline.bases.find((base) => base.mapStopId === mapStopId) : undefined;
      const namedDestinationBase = timeline.bases.find((base) => normalizeRouteLabel(base.name) === normalizedDestinationName);
      const existingDestinationBase = mappedDestinationBase ?? namedDestinationBase;

      if (existingDestinationBase) {
        return {
          id: existingDestinationBase.id,
          name: existingDestinationBase.name,
          mapStopId: existingDestinationBase.mapStopId ?? mapStopId,
          coordinates,
          country,
          countryCode,
        };
      }

      // Do not create custom bases from partial free-text while an editor is
      // auto-saving. New route bases need a selected/mappable place.
      if (!coordinates && !mapStopId) return undefined;

      const destinationSlug = slugifyBaseCity(destinationLabel) || "new-base";
      const existingCustomDestination = customBases.find(
        (base) => slugifyBaseCity(base.baseName) === destinationSlug || Boolean(mapStopId && base.mapStopId === mapStopId),
      );
      const baseId = existingCustomDestination?.id ?? `custom:${destinationSlug}`;
      const baseName = existingCustomDestination?.baseName ?? destinationLabel;
      const resolvedMapStopId = existingCustomDestination?.mapStopId ?? mapStopId;

      if (!existingCustomDestination) {
        const newDestinationBase: PlannerCustomBase = {
          id: baseId,
          baseName,
          startDate,
          endDate: undefined,
          note: "",
          coordinates,
          country,
          countryCode,
          mapStopId: resolvedMapStopId,
        };

        setCustomBases((current) => {
          const alreadyExists = current.some(
            (base) => base.id === baseId || slugifyBaseCity(base.baseName) === destinationSlug || Boolean(resolvedMapStopId && base.mapStopId === resolvedMapStopId),
          );
          if (alreadyExists) return current;
          return [...current, newDestinationBase].sort((left, right) => {
            if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
            return left.baseName.localeCompare(right.baseName);
          });
        });
      }

      return {
        id: baseId,
        name: baseName,
        mapStopId: resolvedMapStopId,
        coordinates,
        country,
        countryCode,
      };
    },
    [customBases, setCustomBases, timeline.bases],
  );

  const removeUnusedRouteDestinationBase = useCallback(
    (baseId: string | undefined, sourceItemId: string) => {
      if (!baseId?.startsWith("custom:")) return;
      const customBase = customBases.find((base) => base.id === baseId);
      if (!customBase) return;

      const hasOtherPlannerReferences = items.some(
        (item) => item.id !== sourceItemId && [item.baseId, item.fromBaseId, item.toBaseId].includes(baseId),
      );
      const hasUserConfiguration = Boolean(
        customBase.note?.trim() ||
          customBase.endDate ||
          customBase.dayDisplayMode ||
          (customBase.dayRanges?.length ?? 0) > 0 ||
          (customBase.hiddenDays?.length ?? 0) > 0,
      );
      if (hasOtherPlannerReferences || hasUserConfiguration) return;

      setCustomBases((current) => current.filter((base) => base.id !== baseId));
    },
    [customBases, items, setCustomBases],
  );

  const startTravelEntries = useMemo(() => {
    const entries: PlannerTimelineEntry[] = [];
    for (const day of timeline.days) {
      for (const entry of day.entries) {
        if (entry.item.isStartingTravel) entries.push(entry);
      }
    }
    return entries.sort((left, right) => {
      if (left.dayIso !== right.dayIso) return left.dayIso.localeCompare(right.dayIso);
      const leftTime = left.item.startTime ?? "23:59";
      const rightTime = right.item.startTime ?? "23:59";
      return leftTime.localeCompare(rightTime);
    });
  }, [timeline.days]);

  const baseSections = useMemo(() => {
    const entriesByBase = new Map<string, PlannerTimelineEntry[]>();
    const transportEdgesByBase = new Map<string, PlannerV2TransportEdge[]>();
    const staysByBase = new Map<string, PlannerTimelineEntry[]>();
    const pushTransportEdge = (baseId: string, edge: PlannerV2TransportEdge) => {
      if (!transportEdgesByBase.has(baseId)) {
        transportEdgesByBase.set(baseId, []);
      }
      transportEdgesByBase.get(baseId)!.push(edge);
    };
    const pushStay = (baseId: string, entry: PlannerTimelineEntry) => {
      if (!staysByBase.has(baseId)) {
        staysByBase.set(baseId, []);
      }
      staysByBase.get(baseId)!.push(entry);
    };

    for (const day of timeline.days) {
      for (const entry of day.entries) {
        if (entry.kind === "transport") {
          const isSameBaseRoute = entry.fromBase?.id && entry.fromBase.id === entry.toBase?.id;
          const canDeriveArrival = Boolean(entry.toBase && !isSameBaseRoute);
          const canDeriveDeparture = Boolean(entry.fromBase && !entry.item.isStartingTravel && !isSameBaseRoute);
          const isLinkedTransport = canDeriveArrival || canDeriveDeparture;

          if (linkedItemVisible(entry.item, "arrival") && canDeriveArrival && entry.toBase) {
            const arrivalDate = effectiveArrivalDate(entry.item.startDate, entry.item.endDate);
            pushTransportEdge(entry.toBase.id, {
              id: `${entry.id}:arrival`,
              edge: "arrival",
              entry,
              dayIso: arrivalDate,
              dayLabel: formatPlannerItemDate(arrivalDate),
              // If arrival time is unknown, keep the linked arrival as the
              // first semantic event for the base day instead of burying it
              // after TBD stay check-in/out moments.
              sortTime: entry.item.endTime ?? TBD_ARRIVAL_SORT_TIME,
            });
          }

          if (linkedItemVisible(entry.item, "departure") && canDeriveDeparture && entry.fromBase) {
            pushTransportEdge(entry.fromBase.id, {
              id: `${entry.id}:departure`,
              edge: "departure",
              entry,
              dayIso: entry.item.startDate,
              dayLabel: formatPlannerItemDate(entry.item.startDate),
              sortTime: entry.item.startTime ?? TBD_DEPARTURE_SORT_TIME,
            });
          }

          if (isLinkedTransport) continue;
        }

        if (entry.item.isStartingTravel) continue;
        const sectionBaseId = entry.base?.id ?? entry.item.baseId;
        if (entry.item.kind === "stay") {
          pushStay(sectionBaseId, entry);
          continue;
        }
        if (!entriesByBase.has(sectionBaseId)) {
          entriesByBase.set(sectionBaseId, []);
        }
        entriesByBase.get(sectionBaseId)!.push(entry);
      }
    }

    const sections: PlannerV2Section[] = [];
    for (const base of timeline.bases) {
      if (base.id === START_TRAVEL_BASE_ID) continue;
      const baseEntries = entriesByBase.get(base.id) ?? [];
      const baseTransportEdges = transportEdgesByBase.get(base.id) ?? [];
      const baseStays = (staysByBase.get(base.id) ?? []).sort((left, right) => {
        if (left.item.startDate !== right.item.startDate) return left.item.startDate.localeCompare(right.item.startDate);
        return left.item.order - right.item.order;
      });
      if (!baseEntries.length && !baseTransportEdges.length && !baseStays.length && base.source !== "manual") continue;
      const dayIsos = [
        ...new Set([
          ...baseEntries.map((entry) => entry.dayIso),
          ...baseTransportEdges.map((edge) => edge.dayIso),
          ...baseStays.flatMap((entry) => {
            const keys = hiddenAutoLinkedKeys(entry.item);
            return [
              keys.has("check-in") ? undefined : entry.item.startDate,
              keys.has("check-out") ? undefined : (entry.item.endDate ?? entry.item.startDate),
            ].filter((date): date is string => Boolean(date));
          }),
        ]),
      ].sort((left, right) => left.localeCompare(right));
      const customBase = customBaseById.get(base.id);
      const manualRanges = getCustomBaseDayRanges(customBase);
      const hiddenDays = new Set(customBase?.hiddenDays ?? []);
      const hasConfiguredBaseRange = base.source === "manual" && Boolean(base.startDate);
      const earliestTimelineDay = dayIsos[0];
      let sectionStart = hasConfiguredBaseRange ? base.startDate : earliestTimelineDay ?? base.startDate;
      // Keep auto-derived arrival edges coherent with the section header range.
      // If the timeline already has an earlier day (for example a linked arrival edge),
      // render that day as the section start unless the user later edits the range again.
      if (hasConfiguredBaseRange && earliestTimelineDay && sectionStart && earliestTimelineDay < sectionStart) {
        sectionStart = earliestTimelineDay;
      }
      const sectionEnd = hasConfiguredBaseRange
        ? base.endDate
        : dayIsos.length > 1
          ? dayIsos[dayIsos.length - 1]
          : undefined;
      const entriesForDay = (dayIso: string) =>
        baseEntries
          .filter((entry) => entry.dayIso === dayIso)
          .sort((left, right) => {
            const leftTime = left.item.startTime ?? "23:59";
            const rightTime = right.item.startTime ?? "23:59";
            if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
            return left.item.order - right.item.order;
          });
      const edgesForDay = (dayIso: string) =>
        baseTransportEdges
          .filter((edge) => edge.dayIso === dayIso)
          .sort((left, right) => {
            if (left.sortTime !== right.sortTime) return left.sortTime.localeCompare(right.sortTime);
            return left.edge.localeCompare(right.edge);
          });
      const stayMomentsForDay = (dayIso: string) =>
        baseStays
          .flatMap((entry): PlannerV2StayMoment[] => {
            const checkInSortTime = entry.item.startTime ?? TBD_CHECK_IN_SORT_TIME;
            const checkOutDate = entry.item.endDate ?? entry.item.startDate;
            const sameDayCheckInOut = checkOutDate === entry.item.startDate;
            const checkOutSortTime = entry.item.endTime ?? (sameDayCheckInOut ? nextMinuteLabel(checkInSortTime) : TBD_CHECK_OUT_SORT_TIME);
            const checkIn: PlannerV2StayMoment | undefined =
              entry.item.startDate === dayIso && linkedItemVisible(entry.item, "check-in")
                ? {
                    id: `${entry.id}:check-in`,
                    moment: "check-in",
                    entry,
                    dayIso,
                    dayLabel: formatPlannerItemDate(dayIso),
                    sortTime: checkInSortTime,
                  }
                : undefined;
            const checkOut: PlannerV2StayMoment | undefined =
              checkOutDate === dayIso && linkedItemVisible(entry.item, "check-out")
                ? {
                    id: `${entry.id}:check-out`,
                    moment: "check-out",
                    entry,
                    dayIso,
                    dayLabel: formatPlannerItemDate(dayIso),
                    sortTime: checkOutSortTime,
                  }
                : undefined;
            return [checkIn, checkOut].filter((moment): moment is PlannerV2StayMoment => Boolean(moment));
          })
          .sort((left, right) => {
            if (left.sortTime !== right.sortTime) return left.sortTime.localeCompare(right.sortTime);
            if (left.entry.id === right.entry.id && left.moment !== right.moment) {
              return left.moment === "check-in" ? -1 : 1;
            }
            return left.moment.localeCompare(right.moment);
          });

      const contentDayIsos = [...new Set(dayIsos)].sort((left, right) => left.localeCompare(right));
      let sectionDays: PlannerV2SectionDay[] = [];
      if (manualRanges.length > 0) {
        const contentDaySet = new Set(contentDayIsos);
        const manualPlaceholderByKey = new Map<string, PlannerV2SectionDay>();

        for (const range of manualRanges) {
          const rangeDayIsos = dateRange(range.startDate, range.endDate ?? range.startDate);
          if (range.dayDisplayMode === "daily") {
            for (const dayIso of rangeDayIsos) {
              if (hiddenDays.has(dayIso)) continue;
              if (contentDaySet.has(dayIso) || manualPlaceholderByKey.has(dayIso)) continue;
              manualPlaceholderByKey.set(dayIso, {
                dayIso,
                dayLabel: formatPlannerItemDate(dayIso),
                entries: [],
                transportEdges: [],
                stayMoments: [],
                customRangeId: range.id,
                customRangeMode: "daily",
              });
            }
            continue;
          }

          let cursor = 0;
          while (cursor < rangeDayIsos.length) {
            const startIso = rangeDayIsos[cursor];
            if (hiddenDays.has(startIso)) {
              cursor += 1;
              continue;
            }
            if (contentDaySet.has(startIso)) {
              cursor += 1;
              continue;
            }
            let endIso = startIso;
            let scan = cursor + 1;
            while (scan < rangeDayIsos.length && !contentDaySet.has(rangeDayIsos[scan]) && !hiddenDays.has(rangeDayIsos[scan])) {
              endIso = rangeDayIsos[scan];
              scan += 1;
            }
            const key = `${startIso}:${endIso}`;
            if (!manualPlaceholderByKey.has(key)) {
              manualPlaceholderByKey.set(key, {
                dayIso: startIso,
                spanEndIso: endIso !== startIso ? endIso : undefined,
                dayLabel: formatPlannerItemDate(startIso, endIso !== startIso ? endIso : undefined),
                entries: [],
                transportEdges: [],
                stayMoments: [],
                customRangeId: range.id,
                customRangeMode: "span",
              });
            }
            cursor = scan;
          }
        }

        sectionDays = [
          ...contentDayIsos.map((dayIso) => ({
            dayIso,
            dayLabel: formatPlannerItemDate(dayIso),
            entries: entriesForDay(dayIso),
            transportEdges: edgesForDay(dayIso),
            stayMoments: stayMomentsForDay(dayIso),
          })),
          ...manualPlaceholderByKey.values(),
        ].sort(sectionDaySort);
      } else {
        const renderedDayIsos = contentDayIsos;
        sectionDays = renderedDayIsos.map((dayIso) => ({
          dayIso,
          dayLabel: formatPlannerItemDate(dayIso),
          entries: entriesForDay(dayIso),
          transportEdges: edgesForDay(dayIso),
          stayMoments: stayMomentsForDay(dayIso),
        }));
      }
      sections.push({
        base,
        displayStartDate: sectionStart,
        displayEndDate: sectionEnd,
        stays: baseStays,
        days: sectionDays,
      });
    }
    return sections;
  }, [customBaseById, timeline.bases, timeline.days]);
  const isPlannerEmpty = items.length === 0 && baseSections.length === 0;
  const transportLinks = useMemo(() => {
    const pairSet = new Set<string>();
    const outgoingByBase = new Map<string, Set<string>>();
    const incomingByBase = new Map<string, Set<string>>();

    for (const day of timeline.days) {
      for (const entry of day.entries) {
        if (entry.kind !== "transport") continue;
        const fromBaseId = entry.fromBase?.id;
        const toBaseId = entry.toBase?.id;
        if (!fromBaseId || !toBaseId || fromBaseId === toBaseId) continue;

        const pairKey = `${fromBaseId}=>${toBaseId}`;
        pairSet.add(pairKey);

        if (!outgoingByBase.has(fromBaseId)) outgoingByBase.set(fromBaseId, new Set<string>());
        outgoingByBase.get(fromBaseId)!.add(toBaseId);

        if (!incomingByBase.has(toBaseId)) incomingByBase.set(toBaseId, new Set<string>());
        incomingByBase.get(toBaseId)!.add(fromBaseId);
      }
    }

    return { pairSet, outgoingByBase, incomingByBase };
  }, [timeline.days]);

  const detailEntry = useMemo(() => {
    if (!detailItemId) return undefined;
    for (const day of timeline.days) {
      const entry = day.entries.find((candidate) => candidate.id === detailItemId);
      if (entry) return entry;
    }
    return undefined;
  }, [detailItemId, timeline.days]);

  const createLinkedTransportBetweenSections = useCallback(
    (fromSection: PlannerV2Section, toSection: PlannerV2Section) => {
      const fallbackDay = isoToday();
      const startDate = fromSection.displayEndDate ?? fromSection.displayStartDate ?? fromSection.base.endDate ?? fromSection.base.startDate ?? fallbackDay;
      const endDateCandidate = toSection.displayStartDate ?? toSection.base.startDate ?? startDate;
      const normalizedRange = coerceDateRange(startDate, endDateCandidate);
      const storedEndDate = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;
      const fromLabel = normalizePlaceInput(fromSection.base.name);
      const toLabel = normalizePlaceInput(toSection.base.name);

      setItems((current) => [
        ...current,
        {
          id: createPlannerId(),
          title: `${fromLabel} to ${toLabel}`,
          note: "",
          startDate: normalizedRange.startDate,
          endDate: storedEndDate,
          baseId: fromSection.base.id,
          baseName: fromSection.base.name,
          destinationId: toSection.base.mapStopId,
          kind: "transport",
          fromBaseId: fromSection.base.id,
          toBaseId: toSection.base.id,
          fromLabel,
          toLabel,
          fromMapStopId: fromSection.base.mapStopId,
          toMapStopId: toSection.base.mapStopId,
          transportMode: "bus",
          source: "manual",
          order: nextDayOrder(current, fromSection.base.id, normalizedRange.startDate),
        },
      ]);
    },
    [setItems],
  );

  const openTailDepartureFromSection = useCallback((section: PlannerV2Section, dayIso: string) => {
    const fallbackDay = section.displayEndDate ?? section.displayStartDate ?? section.base.endDate ?? section.base.startDate ?? dayIso;
    setTailDepartureEditor({
      sourceBaseId: section.base.id,
      sourceBaseName: section.base.name,
      sourceBaseMapStopId: section.base.mapStopId,
      draft: {
        toLabel: "",
        toCoordinates: undefined,
        toCountry: undefined,
        toCountryCode: undefined,
        toMapStopId: undefined,
        date: fallbackDay,
        endDate: fallbackDay,
        startTime: "",
        endTime: "",
        transportMode: "bus",
        note: "",
      },
    });
  }, []);

  const openStartTravelEditor = useCallback(() => {
    setStartTravelEditor({
      mode: "create",
      sessionId: createPlannerId(),
      draft: {
        fromLabel: "",
        toLabel: "",
        fromCoordinates: undefined,
        toCoordinates: undefined,
        fromCountry: undefined,
        toCountry: undefined,
        fromCountryCode: undefined,
        toCountryCode: undefined,
        fromMapStopId: undefined,
        toMapStopId: undefined,
        date: "",
        endDate: "",
        startTime: "",
        endTime: "",
        transportMode: "flight",
        note: "",
      },
    });
  }, []);

  const openBaseEditor = useCallback(() => {
    const lastBaseSection = baseSections[baseSections.length - 1];
    const lastTimelineDay = timeline.days[timeline.days.length - 1]?.dayIso;
    const fallbackDay =
      lastBaseSection?.displayEndDate ??
      lastBaseSection?.displayStartDate ??
      lastBaseSection?.base.endDate ??
      lastBaseSection?.base.startDate ??
      lastTimelineDay ??
      isoToday();
    setBaseDraft({
      mode: "create",
      baseCity: "",
      startDate: fallbackDay,
      endDate: fallbackDay,
      note: "",
    });
  }, [baseSections, timeline.days]);

  const openBaseRangeEditor = useCallback(
    (base: PlannerBaseCityRecord, displayStartDate?: string, displayEndDate?: string) => {
      const fallbackDay = displayStartDate ?? base.startDate ?? timeline.days[0]?.dayIso ?? isoToday();
      const existingCustomBase = customBaseById.get(base.id);
      setBaseDraft({
        mode: "edit",
        baseId: base.id,
        baseCity: base.name,
        startDate: fallbackDay,
        endDate: displayEndDate ?? displayStartDate ?? base.endDate ?? fallbackDay,
        note: base.note ?? "",
        coordinates: existingCustomBase?.coordinates,
        country: existingCustomBase?.country,
        countryCode: existingCustomBase?.countryCode,
        mapStopId: existingCustomBase?.mapStopId ?? base.mapStopId,
      });
    },
    [customBaseById, timeline.days],
  );

  const openDayRangeEditor = useCallback(
    (base: PlannerBaseCityRecord, sectionDays: PlannerV2SectionDay[], displayStartDate?: string, displayEndDate?: string) => {
      const existingCustomBase = customBaseById.get(base.id);
      const existingRanges = getCustomBaseDayRanges(existingCustomBase);
      const sectionStart = displayStartDate ?? base.startDate ?? timeline.days[0]?.dayIso ?? isoToday();
      const sectionEnd = displayEndDate ?? base.endDate ?? sectionStart;
      const occupiedDays = new Set<string>();
      for (const day of sectionDays) {
        const occupiedRange = dateRange(day.dayIso, day.spanEndIso ?? day.dayIso);
        for (const occupiedDay of occupiedRange) occupiedDays.add(occupiedDay);
      }
      const sectionRangeDays = dateRange(sectionStart, sectionEnd);
      const firstGapInRange = sectionRangeDays.find((dayIso) => !occupiedDays.has(dayIso));
      const nextDay = firstGapInRange ?? addDaysToIso(sectionEnd, 1);
      const baselineStart = existingCustomBase?.startDate ?? displayStartDate ?? base.startDate;
      const baselineEnd = existingCustomBase?.endDate ?? existingCustomBase?.startDate ?? baselineStart;
      setDayRangeDraft({
        mode: "create",
        baseId: base.id,
        baseName: base.name,
        startDate: nextDay,
        endDate: nextDay,
        currentStartDate: baselineStart,
        currentEndDate: baselineEnd,
        baseNote: existingCustomBase?.note ?? base.note,
        dayDisplayMode: "daily",
      });
    },
    [customBaseById, timeline.days],
  );

  const openEditDayRange = useCallback(
    (base: PlannerBaseCityRecord, day: PlannerV2SectionDay) => {
      if (!day.customRangeId) return;
      const existingCustomBase = customBaseById.get(base.id);
      const existingRange = getCustomBaseDayRanges(existingCustomBase).find((range) => range.id === day.customRangeId);
      if (!existingRange) return;
      setDayRangeDraft({
        mode: "edit",
        rangeId: existingRange.id,
        baseId: base.id,
        baseName: base.name,
        startDate: existingRange.startDate,
        endDate: existingRange.endDate ?? existingRange.startDate,
        currentStartDate: existingCustomBase?.startDate,
        currentEndDate: existingCustomBase?.endDate ?? existingCustomBase?.startDate,
        baseNote: existingCustomBase?.note ?? base.note,
        dayDisplayMode: existingRange.dayDisplayMode,
      });
    },
    [customBaseById],
  );

  const openItemEditor = useCallback(
    (itemType: PlannerTimelineKind, dayIso?: string, kindOverride?: PlannerItemKind, baseIdOverride?: string, spanEndIso?: string) => {
      const fallbackDay = dayIso ?? timeline.days[0]?.dayIso ?? timeline.bases[0]?.startDate ?? "2026-11-18";
      const currentBaseId = baseIdOverride ?? (baseById.has(selectedBaseId) ? selectedBaseId : timeline.bases[0]?.id ?? "");
      const defaultToBase = timeline.bases.find((base) => base.id !== currentBaseId)?.id ?? currentBaseId;
      const defaultDestination = baseById.get(currentBaseId)?.mapStopId ?? "";
      const draftKind = kindOverride ?? itemTypeToDefaultKind(itemType);
      const normalizedSpanEnd = spanEndIso && spanEndIso !== fallbackDay ? spanEndIso : "";
      setItemEditor({
        sessionId: createPlannerId(),
        mode: "create",
        itemType,
        draft: {
          title: "",
          note: "",
          date: fallbackDay,
          endDate:
            itemType === "transport" || draftKind === "stay"
              ? spanEndIso ?? fallbackDay
              : itemType === "activity"
                ? normalizedSpanEnd
                : "",
          startTime: "",
          endTime: "",
          baseId: currentBaseId,
          destinationId: defaultDestination,
          kind: draftKind,
          transportMode: "bus",
          fromBaseId: currentBaseId,
          toBaseId: defaultToBase,
          breakdown: [],
          stayType: lastSelectedStayType,
          placeLabel: "",
          placeAddress: "",
          showOnMap: false,
        },
      });
    },
    [baseById, lastSelectedStayType, selectedBaseId, timeline.bases, timeline.days],
  );

  const openConfirm = useCallback((state: PlannerConfirmState) => {
    setConfirmDialog(state);
  }, []);

  const commitStartTravelEdit = useCallback(
    (itemId: string, draft: StartTravelDraft) => {
      const existing = items.find((item) => item.id === itemId);
      if (!existing) return;

      const startDate = draft.date || existing.startDate;
      const arrivalDate = effectiveArrivalDate(startDate, draft.endDate || existing.endDate || undefined);
      const normalizedRange = coerceDateRange(startDate, arrivalDate);
      const storedEndDate = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;

      const existingFrom = normalizePlaceInput(existing.fromLabel || "");
      const existingTo = normalizePlaceInput(existing.toLabel || "");
      const fromInput = normalizePlaceInput(draft.fromLabel.trim());
      const toInput = normalizePlaceInput(draft.toLabel.trim());
      const fromLabel = fromInput || existingFrom || "Departure";
      const toLabel = toInput || existingTo || "Arrival";
      const canReuseExistingFromPlace = sameRoutePlaceLabel(fromLabel, existingFrom);
      const canReuseExistingToPlace = sameRoutePlaceLabel(toLabel, existingTo);

      const knownFromPlace = findKnownPlace(fromLabel);
      const knownToPlace = findKnownPlace(toLabel);
      const fromCoordinates = draft.fromCoordinates ?? knownFromPlace?.coordinates ?? (canReuseExistingFromPlace ? existing.fromCoordinates : undefined);
      const toCoordinates = draft.toCoordinates ?? knownToPlace?.coordinates ?? (canReuseExistingToPlace ? existing.toCoordinates : undefined);
      const fromCountry = draft.fromCountry ?? knownFromPlace?.country ?? (canReuseExistingFromPlace ? existing.fromCountry : undefined);
      const toCountry = draft.toCountry ?? knownToPlace?.country ?? (canReuseExistingToPlace ? existing.toCountry : undefined);
      const fromCountryCode = draft.fromCountryCode ?? knownFromPlace?.countryCode ?? (canReuseExistingFromPlace ? existing.fromCountryCode : undefined);
      const toCountryCode = draft.toCountryCode ?? knownToPlace?.countryCode ?? (canReuseExistingToPlace ? existing.toCountryCode : undefined);
      const fromMapStopId = draft.fromMapStopId ?? knownFromPlace?.mapStopId ?? (canReuseExistingFromPlace ? existing.fromMapStopId : undefined);
      const toMapStopId = draft.toMapStopId ?? knownToPlace?.mapStopId ?? (canReuseExistingToPlace ? existing.toMapStopId : undefined);
      const hasResolvedToPlace = Boolean(draft.toCoordinates || draft.toMapStopId || draft.toCountry || draft.toCountryCode || knownToPlace);
      const shouldAcceptToPlace = canReuseExistingToPlace || hasResolvedToPlace;
      const savedToLabel = shouldAcceptToPlace ? toLabel : existingTo || toLabel;
      const savedToCoordinates = shouldAcceptToPlace ? toCoordinates : existing.toCoordinates;
      const savedToCountry = shouldAcceptToPlace ? toCountry : existing.toCountry;
      const savedToCountryCode = shouldAcceptToPlace ? toCountryCode : existing.toCountryCode;
      const savedToMapStopId = shouldAcceptToPlace ? toMapStopId : existing.toMapStopId;
      const destinationBase = shouldAcceptToPlace
        ? resolveOrCreateDestinationBase({
            label: savedToLabel,
            startDate: normalizedRange.endDate ?? normalizedRange.startDate,
            coordinates: savedToCoordinates,
            country: savedToCountry,
            countryCode: savedToCountryCode,
            mapStopId: savedToMapStopId,
          })
        : undefined;
      if (shouldAcceptToPlace && existing.toBaseId && existing.toBaseId !== destinationBase?.id) {
        removeUnusedRouteDestinationBase(existing.toBaseId, itemId);
      }

      setItems((current) => {
        return current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                title: `${fromLabel} to ${savedToLabel}`,
                note: draft.note.trim(),
                startDate: normalizedRange.startDate,
                endDate: storedEndDate,
                startTime: draft.startTime || undefined,
                endTime: draft.endTime || undefined,
                baseId: START_TRAVEL_BASE_ID,
                baseName: "Starting Travel",
                kind: transportKindFromMode(draft.transportMode),
                fromLabel,
                toLabel: savedToLabel,
                fromCoordinates,
                toCoordinates: savedToCoordinates,
                fromCountry,
                toCountry: savedToCountry,
                fromCountryCode,
                toCountryCode: savedToCountryCode,
                fromMapStopId,
                toMapStopId: shouldAcceptToPlace ? destinationBase?.mapStopId ?? savedToMapStopId : existing.toMapStopId,
                transportMode: draft.transportMode,
                isStartingTravel: true,
                fromBaseId: undefined,
                toBaseId: shouldAcceptToPlace ? destinationBase?.id : existing.toBaseId,
                destinationId: shouldAcceptToPlace ? destinationBase?.mapStopId : existing.destinationId,
                source: "manual",
              }
            : item,
        );
      });
    },
    [items, removeUnusedRouteDestinationBase, resolveOrCreateDestinationBase, setItems],
  );

  const createStartTravelFromDraft = useCallback((draft: StartTravelDraft) => {
    const fromInput = draft.fromLabel.trim();
    const toInput = draft.toLabel.trim();
    if (!fromInput || !toInput || !draft.date) return null;
    const existingStartingTravel = items.find((item) => item.isStartingTravel);
    if (existingStartingTravel) {
      commitStartTravelEdit(existingStartingTravel.id, draft);
      return existingStartingTravel.id;
    }
    const fromLabel = normalizePlaceInput(fromInput);
    const toLabel = normalizePlaceInput(toInput);
    const arrivalDate = effectiveArrivalDate(draft.date, draft.endDate || undefined);
    const normalizedRange = coerceDateRange(draft.date, arrivalDate);
    const storedEndDate = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;
    const title = `${fromLabel} to ${toLabel}`;
    const knownFromPlace = findKnownPlace(fromLabel);
    const knownToPlace = findKnownPlace(toLabel);
    const fromCoordinates = draft.fromCoordinates ?? knownFromPlace?.coordinates;
    const toCoordinates = draft.toCoordinates ?? knownToPlace?.coordinates;
    const fromCountry = draft.fromCountry ?? knownFromPlace?.country;
    const toCountry = draft.toCountry ?? knownToPlace?.country;
    const fromCountryCode = draft.fromCountryCode ?? knownFromPlace?.countryCode;
    const toCountryCode = draft.toCountryCode ?? knownToPlace?.countryCode;
    const fromMapStopId = draft.fromMapStopId ?? knownFromPlace?.mapStopId;
    const toMapStopId = draft.toMapStopId ?? knownToPlace?.mapStopId;
    const destinationBase = resolveOrCreateDestinationBase({
      label: toLabel,
      startDate: normalizedRange.endDate ?? normalizedRange.startDate,
      coordinates: toCoordinates,
      country: toCountry,
      countryCode: toCountryCode,
      mapStopId: toMapStopId,
    });
    const itemId = createPlannerId();

    setItems((current) => [
          ...current,
        {
          id: itemId,
          title,
          note: draft.note.trim(),
          startDate: normalizedRange.startDate,
          endDate: storedEndDate,
          startTime: draft.startTime || undefined,
          endTime: draft.endTime || undefined,
          baseId: START_TRAVEL_BASE_ID,
          baseName: "Starting Travel",
          kind: transportKindFromMode(draft.transportMode),
          fromLabel,
          toLabel,
          fromCoordinates,
          toCoordinates,
          fromCountry,
          toCountry,
          fromCountryCode,
          toCountryCode,
          fromMapStopId,
          toMapStopId: destinationBase?.mapStopId ?? toMapStopId,
          transportMode: draft.transportMode,
          isStartingTravel: true,
          toBaseId: destinationBase?.id,
          destinationId: destinationBase?.mapStopId,
          source: "manual",
          order: nextDayOrder(current, START_TRAVEL_BASE_ID, normalizedRange.startDate),
        },
      ]);

    return itemId;
  }, [commitStartTravelEdit, items, resolveOrCreateDestinationBase, setItems]);

  const saveTailDeparture = useCallback(() => {
    if (!tailDepartureEditor) return;

    const toInput = tailDepartureEditor.draft.toLabel.trim();
    if (!toInput || !tailDepartureEditor.draft.date) return;

    const toLabel = normalizePlaceInput(toInput);
    const knownDestination = findKnownPlace(toLabel);
    const arrivalDate = effectiveArrivalDate(tailDepartureEditor.draft.date, tailDepartureEditor.draft.endDate || undefined);
    const normalizedRange = coerceDateRange(tailDepartureEditor.draft.date, arrivalDate);
    const storedEndDate = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;
    const arrivalIso = normalizedRange.endDate ?? normalizedRange.startDate;

    const normalizedDestinationName = normalizeRouteLabel(toLabel);
    const mappedDestinationBase = knownDestination?.mapStopId
      ? timeline.bases.find((base) => base.mapStopId === knownDestination.mapStopId)
      : undefined;
    const namedDestinationBase = timeline.bases.find((base) => normalizeRouteLabel(base.name) === normalizedDestinationName);
    const existingDestinationBase = mappedDestinationBase ?? namedDestinationBase;

    let destinationBaseId = existingDestinationBase?.id;
    let destinationBaseName = existingDestinationBase?.name ?? toLabel;
    let destinationMapStopId = existingDestinationBase?.mapStopId ?? tailDepartureEditor.draft.toMapStopId ?? knownDestination?.mapStopId;
    const destinationCoordinates = tailDepartureEditor.draft.toCoordinates ?? knownDestination?.coordinates;
    const destinationCountry = tailDepartureEditor.draft.toCountry ?? knownDestination?.country;
    const destinationCountryCode = tailDepartureEditor.draft.toCountryCode ?? knownDestination?.countryCode;

    if (!destinationBaseId) {
      const destinationSlug = slugifyBaseCity(toLabel) || "new-base";
      const existingCustomDestination = customBases.find(
        (base) => slugifyBaseCity(base.baseName) === destinationSlug || (destinationMapStopId && base.mapStopId === destinationMapStopId),
      );
      destinationBaseId = existingCustomDestination?.id ?? `custom:${destinationSlug}-${Date.now().toString(36)}`;
      destinationBaseName = existingCustomDestination?.baseName ?? toLabel;
      destinationMapStopId = existingCustomDestination?.mapStopId ?? destinationMapStopId;

      if (!existingCustomDestination) {
        const newDestinationBase: PlannerCustomBase = {
          id: destinationBaseId,
          baseName: destinationBaseName,
          startDate: arrivalIso,
          endDate: undefined,
          note: "",
          coordinates: destinationCoordinates,
          country: destinationCountry,
          countryCode: destinationCountryCode,
          mapStopId: destinationMapStopId,
        };
        setCustomBases((current) => {
          const next = [...current, newDestinationBase].sort((left, right) => {
            if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
            return left.baseName.localeCompare(right.baseName);
          });
          return next;
        });
      }
    }

    if (!destinationBaseId) return;

    const sourceBase = baseById.get(tailDepartureEditor.sourceBaseId);
    if (!sourceBase) return;
    const fromLabel = normalizePlaceInput(sourceBase.name);

    setItems((current) => [
      ...current,
      {
        id: createPlannerId(),
        title: `${fromLabel} to ${toLabel}`,
        note: tailDepartureEditor.draft.note.trim(),
        startDate: normalizedRange.startDate,
        endDate: storedEndDate,
        startTime: tailDepartureEditor.draft.startTime || undefined,
        endTime: tailDepartureEditor.draft.endTime || undefined,
        baseId: sourceBase.id,
        baseName: sourceBase.name,
        destinationId: destinationMapStopId,
        kind: transportKindFromMode(tailDepartureEditor.draft.transportMode),
        fromBaseId: sourceBase.id,
        toBaseId: destinationBaseId,
        fromLabel,
        toLabel,
        fromMapStopId: tailDepartureEditor.sourceBaseMapStopId ?? sourceBase.mapStopId,
        toMapStopId: destinationMapStopId,
        toCoordinates: destinationCoordinates,
        toCountry: destinationCountry,
        toCountryCode: destinationCountryCode,
        transportMode: tailDepartureEditor.draft.transportMode,
        source: "manual",
        order: nextDayOrder(current, sourceBase.id, normalizedRange.startDate),
      },
    ]);

    setTailDepartureEditor(null);
  }, [baseById, customBases, setCustomBases, setItems, tailDepartureEditor, timeline.bases]);

  const persistBaseDraft = useCallback((draft: BaseDraft) => {
    const baseCityName = draft.baseCity.trim();
    if (baseCityName.length < 2 || !draft.startDate) return null;
    const normalizedRange = coerceDateRange(draft.startDate, draft.endDate || draft.startDate);
    const endDateValue = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;

    const baseSlug = slugifyBaseCity(baseCityName) || "new-base";
    const existingBase = draft.mode === "create" ? customBases.find((base) => slugifyBaseCity(base.baseName) === baseSlug) : undefined;
    const targetBaseId =
      draft.mode === "edit"
        ? draft.baseId
        : existingBase?.id ?? `custom:${baseSlug}-${Date.now().toString(36)}`;
    if (!targetBaseId) return null;
    const existingCustomBase = customBases.find((base) => base.id === targetBaseId);
    const knownPlace = findKnownPlace(baseCityName);

    const baseMeta: PlannerCustomBase = {
      id: targetBaseId,
      baseName: baseCityName,
      startDate: normalizedRange.startDate,
      endDate: endDateValue,
      note: draft.note.trim(),
      coordinates: draft.coordinates ?? knownPlace?.coordinates ?? existingCustomBase?.coordinates,
      country: draft.country ?? knownPlace?.country ?? existingCustomBase?.country,
      countryCode: draft.countryCode ?? knownPlace?.countryCode ?? existingCustomBase?.countryCode,
      mapStopId: draft.mapStopId ?? knownPlace?.mapStopId ?? existingCustomBase?.mapStopId,
      hiddenDays: existingCustomBase?.hiddenDays,
      dayDisplayMode: existingCustomBase?.dayDisplayMode,
      dayRanges: existingCustomBase?.dayRanges,
    };
    const nextBases = [...customBases.filter((base) => base.id !== baseMeta.id), baseMeta].sort((left, right) => {
      if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
      return left.baseName.localeCompare(right.baseName);
    });
    setCustomBases(nextBases);
    return targetBaseId;
  }, [customBases, setCustomBases]);

  const saveDayRange = useCallback(() => {
    if (!dayRangeDraft || !dayRangeDraft.startDate) return;
    const selectedRange = coerceDateRange(dayRangeDraft.startDate, dayRangeDraft.endDate || dayRangeDraft.startDate);
    const selectedEnd = selectedRange.endDate ?? selectedRange.startDate;
    const selectedDays = dateRange(selectedRange.startDate, selectedEnd);
    const existingCustomBase = customBases.find((base) => base.id === dayRangeDraft.baseId);
    const existingRanges = getCustomBaseDayRanges(existingCustomBase);
    const baseRanges = dayRangeDraft.rangeId ? existingRanges.filter((range) => range.id !== dayRangeDraft.rangeId) : existingRanges;

    const addedRanges: PlannerCustomDayRange[] =
      dayRangeDraft.dayDisplayMode === "daily"
        ? selectedDays.map((dayIso) => ({
            id: createPlannerId(),
            startDate: dayIso,
            dayDisplayMode: "daily" as const,
          }))
        : [
            {
              id: dayRangeDraft.rangeId ?? createPlannerId(),
              startDate: selectedRange.startDate,
              endDate: selectedEnd !== selectedRange.startDate ? selectedEnd : undefined,
              dayDisplayMode: "span" as const,
            },
          ];

    const nextRanges = sortCustomDayRanges([...baseRanges, ...addedRanges]);
    const selectedDaySet = new Set(selectedDays);
    const nextHiddenDays = (existingCustomBase?.hiddenDays ?? []).filter((dayIso) => !selectedDaySet.has(dayIso));

    let nextStart = dayRangeDraft.currentStartDate ?? existingCustomBase?.startDate ?? selectedRange.startDate;
    let nextEnd = dayRangeDraft.currentEndDate ?? existingCustomBase?.endDate ?? existingCustomBase?.startDate ?? selectedEnd;
    if (selectedRange.startDate < nextStart) nextStart = selectedRange.startDate;
    if (selectedEnd > nextEnd) nextEnd = selectedEnd;
    for (const range of nextRanges) {
      const rangeEnd = range.endDate ?? range.startDate;
      if (range.startDate < nextStart) nextStart = range.startDate;
      if (rangeEnd > nextEnd) nextEnd = rangeEnd;
    }

    const storedEnd = nextEnd !== nextStart ? nextEnd : undefined;
    const baseMeta: PlannerCustomBase = {
      id: dayRangeDraft.baseId,
      baseName: existingCustomBase?.baseName ?? dayRangeDraft.baseName,
      startDate: nextStart,
      endDate: storedEnd,
      note: dayRangeDraft.baseNote ?? existingCustomBase?.note ?? "",
      coordinates: existingCustomBase?.coordinates,
      country: existingCustomBase?.country,
      countryCode: existingCustomBase?.countryCode,
      mapStopId: existingCustomBase?.mapStopId,
      hiddenDays: nextHiddenDays,
      dayRanges: nextRanges,
    };

    const nextBases = [...customBases.filter((base) => base.id !== baseMeta.id), baseMeta].sort((left, right) => {
      if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
      return left.baseName.localeCompare(right.baseName);
    });
    setCustomBases(nextBases);
    setDayRangeDraft(null);
  }, [customBases, dayRangeDraft]);

  const openEditItem = useCallback(
    (entry: PlannerTimelineEntry) => {
      if (entry.item.isStartingTravel) {
        setStartTravelEditor({
          mode: "edit",
          sessionId: createPlannerId(),
          itemId: entry.item.id,
          draft: {
            fromLabel: normalizePlaceInput(entry.item.fromLabel || ""),
            toLabel: normalizePlaceInput(entry.item.toLabel || ""),
            fromCoordinates: entry.item.fromCoordinates,
            toCoordinates: entry.item.toCoordinates,
            fromCountry: entry.item.fromCountry,
            toCountry: entry.item.toCountry,
            fromCountryCode: entry.item.fromCountryCode,
            toCountryCode: entry.item.toCountryCode,
            fromMapStopId: entry.item.fromMapStopId,
            toMapStopId: entry.item.toMapStopId,
            date: entry.item.startDate,
            endDate: entry.item.endDate ?? entry.item.startDate,
            startTime: entry.item.startTime ?? "",
            endTime: entry.item.endTime ?? "",
            transportMode: entry.item.transportMode ?? "flight",
            note: entry.item.note ?? "",
          },
        });
        setDetailItemId(null);
        return;
      }

      const draft: ItemDraft = {
        title: entry.item.title,
        note: entry.item.note,
        date: entry.item.startDate,
        endDate: entry.kind === "transport" ? (entry.item.endDate ?? entry.item.startDate) : (entry.item.endDate ?? ""),
        startTime: entry.item.startTime ?? "",
        endTime: entry.item.endTime ?? "",
        baseId: entry.item.baseId,
        destinationId: entry.item.destinationId ?? "",
        kind: entry.item.kind === "tripBlock" ? "activity" : entry.item.kind,
        transportMode: modeFromKind(entry.item.kind, entry.item.transportMode),
        fromBaseId: entry.item.fromBaseId ?? entry.fromBase?.id ?? entry.item.baseId,
        toBaseId: entry.item.toBaseId ?? entry.toBase?.id ?? entry.item.baseId,
        breakdown: (entry.item.overnightEntries ?? entry.item.breakdown) ? (entry.item.overnightEntries ?? entry.item.breakdown ?? []).map((line) => ({ ...line })) : [],
        stayType: entry.item.stayType ?? "apartment",
        placeLabel: entry.item.placeAddress ?? entry.item.placeLabel ?? "",
        placeAddress: entry.item.placeAddress ?? "",
        placeCoordinates: entry.item.placeCoordinates,
        placeCountry: entry.item.placeCountry,
        placeCountryCode: entry.item.placeCountryCode,
        placeMapStopId: entry.item.placeMapStopId,
        showOnMap: entry.item.showOnMap === true,
      };
      setItemEditor({
        sessionId: createPlannerId(),
        mode: "edit",
        itemId: entry.item.id,
        restoreDetailOnClose: true,
        itemType: entry.kind,
        draft,
      });
      setDetailItemId(null);
    },
    [],
  );

  const commitItemEdit = useCallback(
    (itemId: string, itemType: PlannerTimelineKind, draft: ItemDraft) => {
      setItems((current) => {
        const existing = current.find((item) => item.id === itemId);
        if (!existing) return current;

        const isTransport = itemType === "transport";
        const nextKind = isTransport ? transportKindFromMode(draft.transportMode) : itemType === "activity" ? "activity" : draft.kind;
        const isStay = nextKind === "stay";
        const startDate = draft.date || existing.startDate;
        const arrivalDate = isTransport ? effectiveArrivalDate(startDate, draft.endDate || existing.endDate || undefined) : draft.endDate || existing.endDate || undefined;
        const normalizedRange = coerceDateRange(startDate, arrivalDate);
        const storedEndDate = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;
        const resolvedBaseId = isTransport ? draft.fromBaseId || existing.fromBaseId || existing.baseId : draft.baseId || existing.baseId;
        const base = baseById.get(resolvedBaseId);
        if (!resolvedBaseId || !base) return current;

        const nextToBaseId = isTransport ? draft.toBaseId || existing.toBaseId || resolvedBaseId : undefined;
        const destinationStop = isTransport
          ? baseById.get(nextToBaseId || "")?.mapStopId ?? existing.destinationId
          : isStay
            ? draft.placeMapStopId || draft.destinationId || base.mapStopId
            : draft.placeMapStopId || draft.destinationId || base.mapStopId;
        const nextTitle = isStay
          ? draft.placeLabel.trim() || draft.title.trim() || `${stayTypeLabel(draft.stayType)} in ${base.name}`
          : draft.title.trim() || existing.title;

        const movedDay = existing.baseId !== resolvedBaseId || existing.startDate !== normalizedRange.startDate;
        const nextOrder = movedDay
          ? nextDayOrder(
              current.filter((item) => item.id !== existing.id),
              resolvedBaseId,
              normalizedRange.startDate,
            )
          : existing.order;

        return current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                title: nextTitle,
                note: draft.note.trim(),
                startDate: normalizedRange.startDate,
                endDate: storedEndDate,
                startTime: draft.startTime || undefined,
                endTime: draft.endTime || undefined,
                baseId: resolvedBaseId,
                baseName: base.name,
                destinationId: destinationStop || undefined,
                kind: nextKind,
                fromBaseId: isTransport ? resolvedBaseId : undefined,
                toBaseId: isTransport ? nextToBaseId : undefined,
                transportMode: isTransport ? draft.transportMode : undefined,
                stayType: isStay ? draft.stayType : undefined,
                placeLabel: isStay || itemType === "activity" ? draft.placeLabel.trim() || undefined : undefined,
                placeAddress: isStay || itemType === "activity" ? draft.placeAddress.trim() || undefined : undefined,
                placeCoordinates: isStay || itemType === "activity" ? draft.placeCoordinates : undefined,
                placeCountry: isStay || itemType === "activity" ? draft.placeCountry : undefined,
                placeCountryCode: isStay || itemType === "activity" ? draft.placeCountryCode : undefined,
                placeMapStopId: isStay || itemType === "activity" ? draft.placeMapStopId : undefined,
                showOnMap: itemType === "activity" && hasMappableDraftPlace(draft) ? draft.showOnMap : undefined,
                blockType: undefined,
                overnightEntries: undefined,
                source: "manual",
                order: nextOrder,
                breakdown: existing.breakdown,
              }
            : item,
        );
      });
    },
    [baseById, setItems],
  );

  const createItemFromDraft = useCallback((itemType: PlannerTimelineKind, draft: ItemDraft) => {
    if (!draft.date) return null;

    const isTransport = itemType === "transport";
    const nextKind = isTransport ? transportKindFromMode(draft.transportMode) : itemType === "activity" ? "activity" : draft.kind;
    const isStay = nextKind === "stay";
    const title = isStay
      ? draft.placeLabel.trim()
      : draft.title.trim();
    if (!title && !isStay) return;
    if (isTransport && !draft.startTime) return;
    const normalizedRange = coerceDateRange(
      draft.date,
      isTransport ? effectiveArrivalDate(draft.date, draft.endDate || undefined) : draft.endDate || undefined,
    );
    const storedEndDate = normalizedRange.endDate && normalizedRange.endDate !== normalizedRange.startDate ? normalizedRange.endDate : undefined;

    const resolvedBaseId = isTransport ? draft.fromBaseId : draft.baseId;
    const base = baseById.get(resolvedBaseId);
    if (!resolvedBaseId || !base) return;

    const destinationStop = isTransport
      ? baseById.get(draft.toBaseId)?.mapStopId
      : isStay
        ? draft.placeMapStopId || draft.destinationId || base.mapStopId
        : draft.placeMapStopId || draft.destinationId || base.mapStopId;
    const itemId = createPlannerId();

    setItems((current) => [
        ...current,
        {
          id: itemId,
          title: title || `${stayTypeLabel(draft.stayType)} in ${base.name}`,
          note: draft.note.trim(),
          startDate: normalizedRange.startDate,
          endDate: storedEndDate,
          startTime: draft.startTime || undefined,
          endTime: draft.endTime || undefined,
          baseId: resolvedBaseId,
          baseName: base.name,
          destinationId: destinationStop || undefined,
          kind: nextKind,
          fromBaseId: isTransport ? draft.fromBaseId : undefined,
          toBaseId: isTransport ? draft.toBaseId : undefined,
          transportMode: isTransport ? draft.transportMode : undefined,
          stayType: isStay ? draft.stayType : undefined,
          placeLabel: isStay || itemType === "activity" ? draft.placeLabel.trim() || undefined : undefined,
          placeAddress: isStay || itemType === "activity" ? draft.placeAddress.trim() || undefined : undefined,
          placeCoordinates: isStay || itemType === "activity" ? draft.placeCoordinates : undefined,
          placeCountry: isStay || itemType === "activity" ? draft.placeCountry : undefined,
          placeCountryCode: isStay || itemType === "activity" ? draft.placeCountryCode : undefined,
          placeMapStopId: isStay || itemType === "activity" ? draft.placeMapStopId : undefined,
          showOnMap:
            itemType === "activity" && hasMappableDraftPlace(draft)
              ? draft.showOnMap
              : undefined,
          blockType: undefined,
          overnightEntries: undefined,
          source: "manual",
          order: nextDayOrder(current, resolvedBaseId, normalizedRange.startDate),
          breakdown: undefined,
        },
      ]);
    return itemId;
  }, [baseById, setItems]);

  const deleteItemImmediately = useCallback((itemId: string) => {
    resetDragSession();
    setItems((current) => current.filter((item) => item.id !== itemId));
    setStartTravelEditor((current) => (current?.itemId === itemId ? null : current));
    setItemEditor((current) => (current?.itemId === itemId ? null : current));
    setDetailItemId(null);
  }, [resetDragSession, setItems]);

  const deleteItem = useCallback((entry: PlannerTimelineEntry) => {
    deleteItemImmediately(entry.item.id);
  }, [deleteItemImmediately]);

  const preserveEmptyDayForHiddenLinkedItem = useCallback(
    (item: PlannerItem, key: string) => {
      let baseId = "";
      let dayIso = "";
      let fallbackName = "";
      let fallbackMapStopId: string | undefined;

      if (item.kind === "stay") {
        if (key !== "check-in" && key !== "check-out") return;
        baseId = item.baseId;
        dayIso = key === "check-out" ? item.endDate ?? item.startDate : item.startDate;
        fallbackName = item.baseName ?? "";
        fallbackMapStopId = item.placeMapStopId ?? item.destinationId;
      } else if (isTransportKind(item.kind)) {
        if (key === "departure") {
          if (item.isStartingTravel) return;
          baseId = item.fromBaseId ?? item.baseId;
          dayIso = item.startDate;
          fallbackName = item.fromLabel ?? item.baseName ?? "";
          fallbackMapStopId = item.fromMapStopId;
        } else if (key === "arrival") {
          dayIso = effectiveArrivalDate(item.startDate, item.endDate);
          fallbackName = item.toLabel ?? "";
          fallbackMapStopId = item.toMapStopId ?? item.destinationId;
          const normalizedDestinationName = normalizeRouteLabel(fallbackName);
          const sourceRank = (base: PlannerBaseCityRecord) => (base.source === "manual" ? 0 : base.source === "derived" ? 1 : 2);
          const usageCount = (base: PlannerBaseCityRecord) =>
            items.filter((candidate) => !candidate.isStartingTravel && [candidate.baseId, candidate.fromBaseId, candidate.toBaseId].includes(base.id)).length;
          const includesDay = (base: PlannerBaseCityRecord) => {
            if (!base.startDate) return false;
            const baseEndDate = base.endDate ?? base.startDate;
            return base.startDate <= dayIso && dayIso <= baseEndDate;
          };
          const matchedBase = [...baseById.values()]
            .filter((base) => {
              if (item.toBaseId && base.id === item.toBaseId) return true;
              if (fallbackMapStopId && base.mapStopId === fallbackMapStopId) return true;
              return normalizedDestinationName.length > 0 && normalizeRouteLabel(base.name) === normalizedDestinationName;
            })
            .sort((left, right) => {
              const leftIncludesDay = includesDay(left);
              const rightIncludesDay = includesDay(right);
              if (leftIncludesDay !== rightIncludesDay) return leftIncludesDay ? -1 : 1;
              const usage = usageCount(right) - usageCount(left);
              if (usage !== 0) return usage;
              const rank = sourceRank(left) - sourceRank(right);
              if (rank !== 0) return rank;
              const leftStart = left.startDate ?? "9999-12-31";
              const rightStart = right.startDate ?? "9999-12-31";
              if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
              return left.name.localeCompare(right.name);
            })[0];
          baseId = item.toBaseId ?? matchedBase?.id ?? "";
          fallbackName = matchedBase?.name ?? fallbackName;
          fallbackMapStopId = matchedBase?.mapStopId ?? fallbackMapStopId;
        }
      }

      if (!baseId || !dayIso) return;

      setCustomBases((current) => {
        const existingBase = current.find((base) => base.id === baseId);
        const timelineBase = baseById.get(baseId);
        const currentRanges = getCustomBaseDayRanges(existingBase);
        const alreadyExplicit = currentRanges.some((range) => dateRange(range.startDate, range.endDate ?? range.startDate).includes(dayIso));
        const nextRanges = alreadyExplicit
          ? currentRanges
          : sortCustomDayRanges([
              ...currentRanges,
              {
                id: createPlannerId(),
                startDate: dayIso,
                dayDisplayMode: "daily" as const,
              },
            ]);
        const nextHiddenDays = (existingBase?.hiddenDays ?? []).filter((hiddenDay) => hiddenDay !== dayIso);
        const rangeDays = nextRanges.flatMap((range) => dateRange(range.startDate, range.endDate ?? range.startDate));
        const nextStart = [existingBase?.startDate, dayIso, ...rangeDays].filter((date): date is string => Boolean(date)).sort()[0] ?? dayIso;
        const sortedEndCandidates = [existingBase?.endDate, existingBase?.startDate, dayIso, ...rangeDays]
          .filter((date): date is string => Boolean(date))
          .sort();
        const nextEnd = sortedEndCandidates[sortedEndCandidates.length - 1];

        const nextBase: PlannerCustomBase = {
          id: baseId,
          baseName: (existingBase?.baseName ?? timelineBase?.name ?? normalizePlaceInput(fallbackName)) || "Trip Base",
          startDate: nextStart,
          endDate: nextEnd && nextEnd !== nextStart ? nextEnd : undefined,
          note: existingBase?.note ?? timelineBase?.note ?? "",
          hiddenDays: nextHiddenDays,
          coordinates: existingBase?.coordinates,
          country: existingBase?.country,
          countryCode: existingBase?.countryCode,
          mapStopId: existingBase?.mapStopId ?? timelineBase?.mapStopId ?? fallbackMapStopId,
          dayDisplayMode: undefined,
          dayRanges: nextRanges,
        };

        const replaced = current.some((base) => base.id === baseId);
        const nextBases = replaced ? current.map((base) => (base.id === baseId ? nextBase : base)) : [...current, nextBase];
        return nextBases.sort((left, right) => {
          if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
          return left.baseName.localeCompare(right.baseName);
        });
      });
    },
    [baseById, items, setCustomBases],
  );

  const hideAutoLinkedItem = useCallback(
    (itemId: string, key: string) => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (item) preserveEmptyDayForHiddenLinkedItem(item, key);

      setItems((current) =>
        current.map((item) => (item.id === itemId ? hideAutoLinkedKey(item, key) : item)),
      );
    },
    [items, preserveEmptyDayForHiddenLinkedItem, setItems],
  );

  const removePreservedDaysForRegeneratedLinkedItem = useCallback(
    (item: PlannerItem) => {
      const keys = item.kind === "stay" ? ["check-in", "check-out"] : ["arrival", "departure"];
      type LinkedDayTarget = { dayIso: string; baseIds: Set<string>; mapStopId?: string; label: string };
      const targets: LinkedDayTarget[] = keys
        .map((key): LinkedDayTarget | undefined => {
          if (item.kind === "stay") {
            return {
              dayIso: key === "check-out" ? item.endDate ?? item.startDate : item.startDate,
              baseIds: new Set([item.baseId]),
              mapStopId: item.placeMapStopId ?? item.destinationId,
              label: item.baseName ?? "",
            };
          }

          if (!isTransportKind(item.kind)) return undefined;
          if (key === "departure") {
            if (item.isStartingTravel) return undefined;
            return {
              dayIso: item.startDate,
              baseIds: new Set([item.fromBaseId ?? item.baseId]),
              mapStopId: item.fromMapStopId,
              label: item.fromLabel ?? item.baseName ?? "",
            };
          }

          return {
            dayIso: effectiveArrivalDate(item.startDate, item.endDate),
            baseIds: new Set(item.toBaseId ? [item.toBaseId] : []),
            mapStopId: item.toMapStopId ?? item.destinationId,
            label: item.toLabel ?? "",
          };
        })
        .filter((target): target is LinkedDayTarget => Boolean(target));

      if (targets.length === 0) return;

      setCustomBases((current) => {
        const nextBases = current.flatMap((base): PlannerCustomBase[] => {
          let nextBase = base;
          for (const target of targets) {
            const normalizedTargetName = normalizeRouteLabel(target.label);
            const matchesBase =
              target.baseIds.has(base.id) ||
              Boolean(target.mapStopId && base.mapStopId === target.mapStopId) ||
              (normalizedTargetName.length > 0 && normalizeRouteLabel(base.baseName) === normalizedTargetName);

            if (!matchesBase) continue;

            nextBase = {
              ...nextBase,
              hiddenDays: (nextBase.hiddenDays ?? []).filter((hiddenDay) => hiddenDay !== target.dayIso),
              dayDisplayMode: undefined,
              dayRanges: dayRangesAfterRemovingDay(getCustomBaseDayRanges(nextBase), target.dayIso),
            };
          }

          const hasPlannerItems = items.some(
            (candidate) => !candidate.isStartingTravel && [candidate.baseId, candidate.fromBaseId, candidate.toBaseId].includes(nextBase.id),
          );
          const isUserCreatedBase = nextBase.id.startsWith("custom:");
          const hasVisibleConfiguration =
            (nextBase.dayRanges?.length ?? 0) > 0 ||
            (nextBase.hiddenDays?.length ?? 0) > 0 ||
            hasPlannerItems ||
            isUserCreatedBase ||
            nextBase.note?.trim();
          return hasVisibleConfiguration ? [nextBase] : [];
        });

        return nextBases.sort((left, right) => {
          if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
          return left.baseName.localeCompare(right.baseName);
        });
      });
    },
    [items, setCustomBases],
  );

  const toggleAutoLinkedItems = useCallback(
    (itemId: string) => {
      const sourceItem = items.find((item) => item.id === itemId);
      if (sourceItem && !allLinkedItemsVisible(sourceItem)) {
        removePreservedDaysForRegeneratedLinkedItem(sourceItem);
      }

      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? toggleAutoLinkedVisibility(item)
            : item,
        ),
      );
    },
    [items, removePreservedDaysForRegeneratedLinkedItem, setItems],
  );

  const deleteStartingTravel = useCallback((entry: PlannerTimelineEntry) => {
    openConfirm({
      title: "Delete Starting Travel",
      message: `Delete "${entry.item.title}" from the planner?`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: () => {
        deleteItemImmediately(entry.item.id);
      },
    });
  }, [deleteItemImmediately, openConfirm]);

  const deleteDay = useCallback(
    (base: PlannerBaseCityRecord, day: PlannerV2SectionDay) => {
      const dayHasContent = day.entries.length > 0 || day.transportEdges.length > 0 || day.stayMoments.length > 0;
      const executeDelete = () => {
        resetDragSession();
        if (dayHasContent) {
          const entryIdsToDelete = new Set(day.entries.map((entry) => entry.item.id));
          const hiddenLinkedKeysByItemId = new Map<string, Set<string>>();
          const addHiddenLinkedKey = (itemId: string, key: string) => {
            const existing = hiddenLinkedKeysByItemId.get(itemId) ?? new Set<string>();
            existing.add(key);
            hiddenLinkedKeysByItemId.set(itemId, existing);
          };

          for (const edge of day.transportEdges) {
            addHiddenLinkedKey(edge.entry.item.id, edge.edge);
          }
          for (const moment of day.stayMoments) {
            addHiddenLinkedKey(moment.entry.item.id, moment.moment);
          }

          setItems((current) =>
            current.flatMap((item) => {
              if (entryIdsToDelete.has(item.id)) return [];

              const nextHiddenKeys = hiddenLinkedKeysByItemId.get(item.id);
              if (!nextHiddenKeys) return [item];

              const hiddenAutoLinkedItems = new Set(item.hiddenAutoLinkedItems ?? []);
              for (const key of nextHiddenKeys) hiddenAutoLinkedItems.add(key);
              return [
                {
                  ...item,
                  autoLinkedItemsEnabled: true,
                  hiddenAutoLinkedItems: [...hiddenAutoLinkedItems],
                },
              ];
            }),
          );
        }

        if (base.source === "manual" || day.customRangeId || !dayHasContent) {
          setCustomBases((current) => {
            const currentBase =
              current.find((customBase) => customBase.id === base.id) ??
              ({
                id: base.id,
                baseName: base.name,
                startDate: base.startDate ?? day.dayIso,
                endDate: base.endDate,
                note: base.note,
                mapStopId: base.mapStopId,
              } satisfies PlannerCustomBase);

            const currentStart = currentBase.startDate;
            const currentEnd = currentBase.endDate ?? currentStart;
            const deletingIsStart = day.dayIso === currentStart;
            const deletingIsEnd = day.dayIso === currentEnd;
            const hasSingleDayRange = currentStart === currentEnd;

            let nextStart = currentStart;
            let nextEnd = currentBase.endDate;
            if (!day.customRangeId && (deletingIsStart || deletingIsEnd) && !hasSingleDayRange) {
              if (deletingIsStart) {
                nextStart = addDaysToIso(currentStart, 1);
              }
              if (deletingIsEnd) {
                const trimmedEnd = addDaysToIso(currentEnd, -1);
                nextEnd = trimmedEnd === nextStart ? undefined : trimmedEnd;
              }
            }

            const existingRanges = getCustomBaseDayRanges(currentBase);
            const nextRanges = day.customRangeId
              ? dayRangesAfterDeletingDay(existingRanges, day.customRangeId, day.dayIso)
              : sortCustomDayRanges(
                  existingRanges.filter((range) => !(range.startDate === day.dayIso && (range.endDate ?? range.startDate) === day.dayIso)),
                );
            const nextHiddenDays = new Set(currentBase.hiddenDays ?? []);
            nextHiddenDays.add(day.dayIso);

            if (day.customRangeId && nextRanges.length > 0) {
              nextStart = nextRanges[0].startDate;
              const lastRange = nextRanges[nextRanges.length - 1];
              const lastRangeEnd = lastRange.endDate ?? lastRange.startDate;
              nextEnd = lastRangeEnd === nextStart ? undefined : lastRangeEnd;
            }

            const nextBase: PlannerCustomBase = {
              ...currentBase,
              startDate: nextStart,
              endDate: nextEnd,
              hiddenDays: [...nextHiddenDays].sort(),
              dayDisplayMode: undefined,
              dayRanges: nextRanges,
            };

            const replaced = current.some((customBase) => customBase.id === base.id);
            return replaced
              ? current.map((customBase) => (customBase.id === base.id ? nextBase : customBase))
              : [...current, nextBase].sort((left, right) => {
                  if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
                  return left.baseName.localeCompare(right.baseName);
                });
          });
        }

        setDetailItemId(null);
      };

      if (!dayHasContent) {
        executeDelete();
        return;
      }

      openConfirm({
        title: "Delete Day",
        message: `Delete ${day.dayLabel}?`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm: executeDelete,
      });
    },
    [openConfirm, resetDragSession, setCustomBases, setItems],
  );

  const deleteBase = useCallback(
    (base: PlannerBaseCityRecord) => {
      const linkedItems = items.filter(
        (item) => item.baseId === base.id || item.fromBaseId === base.id || item.toBaseId === base.id,
      );
      const linkedCount = linkedItems.length;
      const suffix = linkedCount > 0 ? ` and ${linkedCount} linked item(s)` : "";
      openConfirm({
        title: "Delete Base City",
        message: `Delete "${base.name}"${suffix}?`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm: () => {
          resetDragSession();
          setItems((current) =>
            current.filter((item) => !(item.baseId === base.id || item.fromBaseId === base.id || item.toBaseId === base.id)),
          );
          setCustomBases((current) => {
            const next = current.filter((customBase) => customBase.id !== base.id);
            return next;
          });
          setDetailItemId(null);
        },
      });
    },
    [items, openConfirm, resetDragSession, setCustomBases, setItems],
  );

  const onDayQuickAdd = useCallback(
    (dayIso: string, baseId: string, spanEndIso?: string) => {
      openItemEditor("activity", dayIso, undefined, baseId, spanEndIso);
    },
    [openItemEditor],
  );

  const canAutoCreateStartTravelDraft = useCallback((draft: StartTravelDraft) => {
    const toLabel = normalizePlaceInput(draft.toLabel.trim());
    const hasResolvedArrival = Boolean(
      draft.toCoordinates ||
        draft.toMapStopId ||
        draft.toCountry ||
        draft.toCountryCode ||
        findKnownPlace(toLabel),
    );
    return Boolean(draft.fromLabel.trim() && toLabel && draft.date && hasResolvedArrival);
  }, []);

  const canAutoCreateBaseDraft = useCallback((draft: BaseDraft) => {
    return Boolean(draft.baseCity.trim().length >= 2 && draft.startDate);
  }, []);

  const canAutoCreateItemDraft = useCallback((itemType: PlannerTimelineKind, draft: ItemDraft) => {
    if (!draft.date) return false;
    if (itemType === "transport") {
      return Boolean(draft.fromBaseId && draft.toBaseId && draft.startTime);
    }
    if (draft.kind === "stay") {
      return Boolean(draft.baseId && draft.placeLabel.trim().length >= 2);
    }
    return Boolean(draft.baseId && draft.title.trim().length >= 2);
  }, []);

  const closeDayRangeEditor = useCallback(() => {
    if (dayRangeDraft?.startDate) {
      saveDayRange();
      return;
    }
    setDayRangeDraft(null);
  }, [dayRangeDraft, saveDayRange]);

  const closeBaseEditor = useCallback(() => {
    if (baseDraft && canAutoCreateBaseDraft(baseDraft)) {
      persistBaseDraft(baseDraft);
    }
    setBaseDraft(null);
  }, [baseDraft, canAutoCreateBaseDraft, persistBaseDraft]);

  const closeTailDepartureEditor = useCallback(() => {
    if (tailDepartureEditor?.draft.toLabel.trim() && tailDepartureEditor.draft.date) {
      saveTailDeparture();
      return;
    }
    setTailDepartureEditor(null);
  }, [saveTailDeparture, tailDepartureEditor]);

  const closeStartTravelEditor = useCallback(() => {
    if (startTravelEditor?.mode === "create" && canAutoCreateStartTravelDraft(startTravelEditor.draft)) {
      const existingItemId = startTravelEditor.sessionId ? autoCreatedStartTravelBySessionRef.current.get(startTravelEditor.sessionId) : undefined;
      if (existingItemId) {
        commitStartTravelEdit(existingItemId, startTravelEditor.draft);
      } else {
        const itemId = createStartTravelFromDraft(startTravelEditor.draft);
        if (itemId && startTravelEditor.sessionId) autoCreatedStartTravelBySessionRef.current.set(startTravelEditor.sessionId, itemId);
      }
      setStartTravelEditor(null);
      return;
    }
    if (startTravelEditor?.sessionId) {
      autoCreatedStartTravelBySessionRef.current.delete(startTravelEditor.sessionId);
    }
    if (startTravelEditor?.mode === "edit" && startTravelEditor.itemId) {
      setDetailItemId(startTravelEditor.itemId);
    }
    setStartTravelEditor(null);
  }, [canAutoCreateStartTravelDraft, commitStartTravelEdit, createStartTravelFromDraft, startTravelEditor]);

  const closeItemEditor = useCallback(() => {
    if (itemEditor?.mode === "create" && canAutoCreateItemDraft(itemEditor.itemType, itemEditor.draft)) {
      const existingItemId = autoCreatedItemBySessionRef.current.get(itemEditor.sessionId);
      const itemId = existingItemId ?? createItemFromDraft(itemEditor.itemType, itemEditor.draft);
      if (itemId) {
        if (existingItemId) commitItemEdit(existingItemId, itemEditor.itemType, itemEditor.draft);
        autoCreatedItemBySessionRef.current.delete(itemEditor.sessionId);
        setItemEditor(null);
        return;
      }
    }
    if (itemEditor) {
      autoCreatedItemBySessionRef.current.delete(itemEditor.sessionId);
    }
    if (itemEditor?.mode === "edit" && itemEditor.itemId && itemEditor.restoreDetailOnClose) {
      setDetailItemId(itemEditor.itemId);
    }
    setItemEditor(null);
  }, [canAutoCreateItemDraft, commitItemEdit, createItemFromDraft, itemEditor]);

  const plannerCanPullClose = !(
    baseDraft ||
    dayRangeDraft ||
    startTravelEditor ||
    tailDepartureEditor ||
    itemEditor ||
    detailItemId ||
    confirmDialog ||
    dragState
  );
  const plannerCloseGesture = useTopPullDownToClose({
    enabled: plannerCanPullClose,
    onClose,
    scrollRef: plannerScrollRef,
  });
  const plannerPullStyle =
    plannerCloseGesture.pullDistance > 0
      ? ({
          "--planner-pull-y": `${plannerCloseGesture.pullDistance}px`,
        } as CSSProperties)
      : undefined;
  const startTravelEditorItem = startTravelEditor?.itemId ? items.find((item) => item.id === startTravelEditor.itemId) : undefined;
  const itemEditorSourceItem = itemEditor?.itemId ? items.find((item) => item.id === itemEditor.itemId) : undefined;

  return (
    <section
      className={`planner-view ${plannerCloseGesture.isPulling ? "is-pulling-close" : ""} ${plannerCloseGesture.isClosing ? "is-closing-close" : ""}`}
      style={plannerPullStyle}
      aria-label="Trip management"
      {...plannerCloseGesture.handlers}
    >
      <div className="sheet-handle planner-swipe-handle planner-view-top-handle swipe-handle-bar" aria-hidden="true" />
      <header className="planner-view-header">
        <div>
          <p>
            <ListChecks size={14} />
            Trip Plan
          </p>
          <h2>Timeline planner</h2>
        </div>
        <div className="planner-view-header-actions">
          <button
            type="button"
            className="primary"
            onClick={isPlannerEmpty ? openStartTravelEditor : openBaseEditor}
            aria-label={isPlannerEmpty ? "Add starting travel" : "Add base city"}
            title={isPlannerEmpty ? "Add starting travel" : "Add base city"}
          >
            <Plus size={15} />
            <span>{isPlannerEmpty ? "Start" : "Base"}</span>
          </button>
        </div>
      </header>

      <div ref={plannerScrollRef} className="planner-v2-sections">
        {startTravelEntries.length > 0 ? (
          <section className="planner-v2-starting-travel">
            <header>
              <h3>Starting Travel</h3>
              <p>How you leave and first arrive</p>
            </header>
            <ol className="planner-v2-list">
              {startTravelEntries.map((entry) => (
                <li key={entry.id}>
                  <SwipeDelete
                    label={`Delete ${entry.item.title}`}
                    className="planner-swipe-delete-row"
                    testId={`swipe-starting-travel-${entry.item.id}`}
                    requiresConfirmation
                    onDelete={() => deleteStartingTravel(entry)}
                  >
                    <article
                      role="button"
                      tabIndex={0}
                      className="planner-v2-row"
                      onClick={() => setDetailItemId(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setDetailItemId(entry.id);
                      }}
                    >
                      <div className="planner-v2-row-main-wrap">
                        <span className={`planner-kind ${entry.item.kind}`}>{transportBadgeLabel(entry.item)}</span>
                        <div className="planner-v2-row-main">
                          <strong className="planner-v2-route-title">
                            <Route size={12} />
                            {routeLabelForEntry(entry)}
                          </strong>
                          {entry.item.note ? <p>{entry.item.note}</p> : null}
                        </div>
                        <div className="planner-v2-row-meta">
                          {entry.dateLabel ? (
                            <span>
                              <CalendarDays size={12} />
                              {entry.dateLabel}
                            </span>
                          ) : null}
                          {formatTransportTimeSummary(entry.item) ? (
                            <span>
                              <Clock3 size={12} />
                              {formatTransportTimeSummary(entry.item)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </SwipeDelete>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {baseSections.length === 0 ? (
          <div className="planner-v2-empty">
            {!hasStartingTravel ? (
              <>
                <p>No plans yet.</p>
                <p>Use the top button to add your starting travel.</p>
              </>
            ) : (
              <>
                <p>No base cities yet.</p>
                <p>Use the top button to add your first base city.</p>
              </>
            )}
          </div>
        ) : (
          baseSections.map((section, sectionIndex) => {
            const { base, days, displayStartDate, displayEndDate, stays } = section;
            const previousSection = sectionIndex > 0 ? baseSections[sectionIndex - 1] : undefined;
            const nextSection = sectionIndex < baseSections.length - 1 ? baseSections[sectionIndex + 1] : undefined;
            const hasIncomingFromPrevious = previousSection
              ? transportLinks.pairSet.has(`${previousSection.base.id}=>${base.id}`)
              : true;
            const hasOutgoingToNext = nextSection
              ? transportLinks.pairSet.has(`${base.id}=>${nextSection.base.id}`)
              : false;
            const hasAnyOutgoing = (transportLinks.outgoingByBase.get(base.id)?.size ?? 0) > 0;
            return (
            <section key={base.id} className={`planner-v2-section ${base.id === selectedBaseId ? "active" : ""}`}>
              <SwipeDelete
                label={`Delete ${base.name}`}
                className="planner-swipe-delete-section"
                testId={`swipe-base-${base.id}`}
                requiresConfirmation
                onDelete={() => deleteBase(base)}
              >
                <header className="planner-v2-section-header">
                  <button
                    type="button"
                    className="planner-v2-section-identity"
                    onClick={() => openBaseRangeEditor(base, displayStartDate, displayEndDate)}
                    aria-label={`Edit ${base.name} base duration`}
                    title={`Edit ${base.name} base duration`}
                  >
                    <h3>{base.name}</h3>
                    <p>
                      <CalendarDays size={13} />
                      {displayStartDate ? formatPlannerItemDate(displayStartDate, displayEndDate) : "Dates TBD"}
                    </p>
                  </button>
                  <div className="planner-v2-section-actions">
                    <button type="button" onClick={() => openDayRangeEditor(base, days, displayStartDate, displayEndDate)} aria-label={`Add day in ${base.name}`}>
                      <Plus size={14} />
                    </button>
                  </div>
                </header>
              </SwipeDelete>

              <div className={`planner-v2-stays ${stays.length > 0 ? "has-stays" : ""}`}>
                <div className="planner-v2-stays-header">
                  <span>Stays</span>
                  {stays.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => openItemEditor("note", displayStartDate ?? base.startDate ?? days[0]?.dayIso, "stay", base.id)}
                      aria-label={`Add stay in ${base.name}`}
                    >
                      <Plus size={12} />
                      <span>Add stay</span>
                    </button>
                  ) : null}
                </div>
                {stays.length > 0 ? (
                  <ol className="planner-v2-stay-list">
                    {stays.map((stayEntry) => {
                      const subtitle = staySubtitle(stayEntry);
                      const stayCopyId = `stay-${stayEntry.id}`;
                      return (
                        <li key={stayEntry.id}>
                          <SwipeDelete
                            label={`Delete ${stayTitle(stayEntry)}`}
                            className="planner-swipe-delete-stay"
                            testId={`swipe-stay-${stayEntry.item.id}`}
                            onDelete={() => deleteItem(stayEntry)}
                          >
                            <article
                              role="button"
                              tabIndex={0}
                              className="planner-v2-stay-card"
                              onClick={() => setDetailItemId(stayEntry.id)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                setDetailItemId(stayEntry.id);
                              }}
                            >
                              <span className={`planner-kind stay`}>{stayTypeLabel(stayEntry.item.stayType ?? "apartment")}</span>
                              <div className="planner-v2-stay-content">
                                <strong>{stayTitle(stayEntry)}</strong>
                                {subtitle ? <small>{subtitle}</small> : null}
                              </div>
                              <p className="planner-v2-stay-date">
                                <CalendarDays size={12} />
                                {stayEntry.dateLabel}
                              </p>
                              <button
                                type="button"
                                className={`planner-inline-copy planner-inline-copy-top-right ${copiedStayId === stayCopyId ? "copied" : ""}`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  copyStayText(stayCopyText(stayEntry), stayCopyId);
                                }}
                                aria-label={`Copy ${stayTitle(stayEntry)} address`}
                                title={copiedStayId === stayCopyId ? "Copied" : "Copy address"}
                              >
                                {copiedStayId === stayCopyId ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </article>
                          </SwipeDelete>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <button
                    type="button"
                    className="planner-v2-add-stay-empty"
                    onClick={() => openItemEditor("note", displayStartDate ?? base.startDate ?? days[0]?.dayIso, "stay", base.id)}
                  >
                    <CalendarDays size={13} />
                    <span>Add where you stay</span>
                  </button>
                )}
              </div>

              <div className="planner-v2-days">
                {days.length === 0 ? (
                  <div className="planner-v2-empty compact">
                    <p>No plans yet.</p>
                  </div>
                ) : (
                  days.map((day) => {
                    const dayNodes = buildSectionDayNodes(day);
                    const draggableRows = dayNodes.flatMap((node) => {
                      if (node.type === "entry") {
                        return [
                          {
                            rowId: node.entry.id,
                            itemId: node.entry.item.id,
                          },
                        ];
                      }
                      if (node.type === "transport-edge" && node.edge.edge === "departure" && !node.edge.entry.item.isStartingTravel) {
                        return [
                          {
                            rowId: node.edge.id,
                            itemId: node.edge.entry.item.id,
                          },
                        ];
                      }
                      return [];
                    });
                    const draggableIndexByRowId = new Map(draggableRows.map((row, index) => [row.rowId, index]));
                    const isDragTargetDay = dragState?.baseId === base.id && dragState.targetDayIso === day.dayIso;
                    const showDropAtEnd = Boolean(isDragTargetDay && dragState.targetIndex === draggableRows.length);
                    const renderedDayIsos = new Set(days.map((candidateDay) => candidateDay.dayIso));
                    const sectionStartIso = displayStartDate && renderedDayIsos.has(displayStartDate) ? displayStartDate : days[0]?.dayIso ?? displayStartDate;
                    const sectionEndIso =
                      displayEndDate && renderedDayIsos.has(displayEndDate)
                        ? displayEndDate
                        : days[days.length - 1]?.dayIso ?? displayEndDate ?? sectionStartIso;
                    const isFirstDay = sectionStartIso ? day.dayIso === sectionStartIso : false;
                    const isLastDay = sectionEndIso ? day.dayIso === sectionEndIso : false;
                    const dayHasContent = dayNodes.length > 0;
                    const canDeleteDay = true;
                    const showArrivalAction = Boolean(previousSection && isFirstDay && !hasIncomingFromPrevious);
                    const showDepartureAction = Boolean(isLastDay && (nextSection ? !hasOutgoingToNext : !hasAnyOutgoing));
                    const dayHeader = (
                      <header className="planner-v2-day-header">
                        {day.customRangeMode === "span" && day.customRangeId ? (
                          <button
                            type="button"
                            className="planner-v2-day-label-button"
                            onClick={() => openEditDayRange(base, day)}
                            aria-label={`Edit ${day.dayLabel}`}
                            title={`Edit ${day.dayLabel}`}
                          >
                            <strong>{day.dayLabel}</strong>
                          </button>
                        ) : (
                          <strong>{day.dayLabel}</strong>
                        )}
                        <div className="planner-v2-day-actions">
                          <button
                            type="button"
                            className="planner-v2-day-add"
                            onClick={() => onDayQuickAdd(day.dayIso, base.id, day.spanEndIso)}
                            aria-label={`Add on ${day.dayLabel}`}
                            title={`Add on ${day.dayLabel}`}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </header>
                    );
                    return (
                    <section
                      key={`${base.id}-${day.dayIso}`}
                      className={`planner-v2-day ${isDragTargetDay ? "drag-target-day" : ""}`}
                      data-dnd-day-iso={day.dayIso}
                      data-dnd-base-id={base.id}
                    >
                      {canDeleteDay ? (
                        <SwipeDelete
                          label={`Delete ${day.dayLabel}`}
                          className="planner-swipe-delete-day"
                          testId={`swipe-day-${base.id}-${day.dayIso}`}
                          requiresConfirmation={dayHasContent}
                          onDelete={() => deleteDay(base, day)}
                        >
                          {dayHeader}
                        </SwipeDelete>
                      ) : (
                        dayHeader
                      )}
                      {dayNodes.length === 0 ? (
                        <p className="planner-v2-empty-day">No plans yet.</p>
                      ) : (
                        <ol className="planner-v2-list">
                          {dayNodes.map((node) => {
                            if (node.type === "stay-moment") {
                              const moment = node.moment;
                              return (
                                <li key={moment.id}>
                                  <SwipeDelete
                                    label={`Remove ${stayMomentTitle(moment)}`}
                                    className="planner-swipe-delete-row"
                                    testId={`swipe-linked-${moment.moment}-${moment.entry.item.id}`}
                                    onDelete={() => hideAutoLinkedItem(moment.entry.item.id, moment.moment)}
                                    onSwipeStart={resetDragSession}
                                  >
                                    <article
                                      role="button"
                                      tabIndex={0}
                                      className={`planner-v2-row planner-v2-stay-moment ${moment.moment}`}
                                      onClick={() => setDetailItemId(moment.entry.id)}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        setDetailItemId(moment.entry.id);
                                      }}
                                    >
                                      <div className="planner-v2-row-main-wrap">
                                        <span className={`planner-kind planner-stay-kind ${moment.moment}`}>{moment.moment === "check-in" ? "Check in" : "Check out"}</span>
                                        <div className="planner-v2-row-main">
                                          <strong>{stayMomentTitle(moment)}</strong>
                                        </div>
                                        <div className="planner-v2-row-meta">
                                          <span>
                                            <Clock3 size={12} />
                                            {stayMomentTime(moment)}
                                          </span>
                                          <small>{stayTypeLabel(moment.entry.item.stayType ?? "apartment")}</small>
                                        </div>
                                      </div>
                                    </article>
                                  </SwipeDelete>
                                </li>
                              );
                            }
                            if (node.type === "transport-edge") {
                              const edge = node.edge;
                              const draggableRowIndex = draggableIndexByRowId.get(edge.id);
                              const canDragEdge = typeof draggableRowIndex === "number";
                              const isDraggingEdge = canDragEdge && dragState?.itemId === edge.entry.item.id;
                              const showDropBeforeEdge = Boolean(isDragTargetDay && canDragEdge && dragState.targetIndex === draggableRowIndex);
                              const edgeDragStyle: CSSProperties | undefined = isDraggingEdge
                                ? ({
                                    "--planner-drag-x": `${dragState?.dragX ?? 0}px`,
                                    "--planner-drag-y": `${dragState?.dragY ?? 0}px`,
                                  } as CSSProperties)
                                : undefined;
                              return (
                                <li
                                  key={edge.id}
                                  className={isDraggingEdge ? "is-dragging-row" : undefined}
                                  data-dnd-row={canDragEdge ? "true" : undefined}
                                  data-dnd-item-id={canDragEdge ? edge.entry.item.id : undefined}
                                  data-dnd-day-iso={canDragEdge ? day.dayIso : undefined}
                                  data-dnd-base-id={canDragEdge ? base.id : undefined}
                                >
                                  <SwipeDelete
                                    label={`Remove ${edgeTitle(edge)}`}
                                    className="planner-swipe-delete-row"
                                    testId={`swipe-linked-${edge.edge}-${edge.entry.item.id}`}
                                    onDelete={() => hideAutoLinkedItem(edge.entry.item.id, edge.edge)}
                                    onSwipeStart={resetDragSession}
                                  >
                                    <article
                                      role="button"
                                      tabIndex={0}
                                      className={`planner-v2-row planner-v2-edge-row ${edge.edge} ${canDragEdge ? "is-draggable" : ""} ${isDraggingEdge ? "is-dragging" : ""} ${showDropBeforeEdge ? "drag-drop-before" : ""}`}
                                      style={edgeDragStyle}
                                      onPointerDown={
                                        canDragEdge
                                          ? (event) => beginLongPressDrag(event, edge.entry.item.id, base.id, day.dayIso, draggableRowIndex)
                                          : undefined
                                      }
                                      onClick={() => {
                                        if (suppressClickItemRef.current === edge.entry.item.id) {
                                          suppressClickItemRef.current = null;
                                          return;
                                        }
                                        setDetailItemId(edge.entry.id);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        setDetailItemId(edge.entry.id);
                                      }}
                                    >
                                      <div className="planner-v2-row-main-wrap">
                                        <span className={`planner-kind planner-edge-kind ${edge.edge}`}>{edge.edge === "arrival" ? "Arrive" : "Leave"}</span>
                                        <div className="planner-v2-row-main">
                                          <strong className="planner-v2-route-title">
                                            <Route size={12} />
                                            {edgeTitle(edge)}
                                          </strong>
                                          <p>{edgeSubtitle(edge)}</p>
                                        </div>
                                        <div className="planner-v2-row-meta">
                                          <span>
                                            <Clock3 size={12} />
                                            {edgeTimeLabel(edge)}
                                          </span>
                                          <small>{transportBadgeLabel(edge.entry.item)}</small>
                                        </div>
                                      </div>
                                    </article>
                                  </SwipeDelete>
                                </li>
                              );
                            }
                            const entry = node.entry;
                            const entryIndex = draggableIndexByRowId.get(entry.id) ?? -1;
                            const isDraggingEntry = dragState?.itemId === entry.item.id;
                            const showDropBefore = Boolean(isDragTargetDay && entryIndex >= 0 && dragState.targetIndex === entryIndex);
                            const dragStyle: CSSProperties | undefined = isDraggingEntry
                              ? ({
                                  "--planner-drag-x": `${dragState?.dragX ?? 0}px`,
                                  "--planner-drag-y": `${dragState?.dragY ?? 0}px`,
                                } as CSSProperties)
                              : undefined;
                            return (
                            <li
                              key={entry.id}
                              className={isDraggingEntry ? "is-dragging-row" : undefined}
                              data-dnd-row="true"
                              data-dnd-item-id={entry.item.id}
                              data-dnd-day-iso={day.dayIso}
                              data-dnd-base-id={base.id}
                            >
                              <SwipeDelete
                                label={`Delete ${entry.item.title}`}
                                className="planner-swipe-delete-row"
                                testId={`swipe-item-${entry.item.id}`}
                                onDelete={() => deleteItem(entry)}
                                onSwipeStart={resetDragSession}
                              >
                                <article
                                  role="button"
                                  tabIndex={0}
                                  className={`planner-v2-row is-draggable ${isDraggingEntry ? "is-dragging" : ""} ${showDropBefore ? "drag-drop-before" : ""}`}
                                  style={dragStyle}
                                  onPointerDown={(event) => beginLongPressDrag(event, entry.item.id, base.id, day.dayIso, Math.max(0, entryIndex))}
                                  onClick={() => {
                                    if (suppressClickItemRef.current === entry.item.id) {
                                      suppressClickItemRef.current = null;
                                      return;
                                    }
                                    setDetailItemId(entry.id);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== "Enter" && event.key !== " ") return;
                                    event.preventDefault();
                                    setDetailItemId(entry.id);
                                  }}
                                >
                                  <div className="planner-v2-row-main-wrap">
                                    <span className={`planner-kind ${entry.item.kind}`}>{transportBadgeLabel(entry.item)}</span>
                                    <div className="planner-v2-row-main">
                                      {entry.kind === "transport" ? (
                                        <strong className="planner-v2-route-title">
                                          <Route size={12} />
                                          {routeLabelForEntry(entry)}
                                        </strong>
                                      ) : (
                                        <strong>{entry.item.title}</strong>
                                      )}
                                      {entry.item.note ? (
                                        <p>{entry.item.note}</p>
                                      ) : null}
                                    </div>
                                    <div className="planner-v2-row-meta">
                                      {entry.kind === "transport" ? (
                                        <>
                                          {entry.dateLabel ? (
                                            <span>
                                              <CalendarDays size={12} />
                                              {entry.dateLabel}
                                            </span>
                                          ) : null}
                                          {formatTransportTimeSummary(entry.item) ? (
                                            <span>
                                              <Clock3 size={12} />
                                              {formatTransportTimeSummary(entry.item)}
                                            </span>
                                          ) : null}
                                        </>
                                      ) : (
                                        <>
                                          {entry.item.endDate && entry.item.endDate !== entry.item.startDate ? (
                                            <span>
                                              <CalendarDays size={12} />
                                              {entry.dateLabel}
                                            </span>
                                          ) : null}
                                          {entry.timeLabel ? (
                                            <span>
                                              <Clock3 size={12} />
                                              {entry.timeLabel}
                                            </span>
                                          ) : null}
                                        </>
                                      )}
                                      <small>{entry.kind === "transport" ? "Route" : entry.base?.name}</small>
                                    </div>
                                  </div>
                                </article>
                              </SwipeDelete>
                            </li>
                            );
                          })}
                        </ol>
                      )}
                      {showDropAtEnd ? <div className="planner-v2-drop-end" aria-hidden="true" /> : null}
                      {showArrivalAction || showDepartureAction ? (
                        <div className="planner-v2-day-edge-actions">
                          {showArrivalAction && previousSection ? (
                            <button
                              type="button"
                              className="planner-v2-day-edge-action"
                              onClick={() => createLinkedTransportBetweenSections(previousSection, section)}
                            >
                              <Route size={12} />
                              <span>Add arrival from {previousSection.base.name}</span>
                            </button>
                          ) : null}
                          {showDepartureAction ? (
                            <button
                              type="button"
                              className="planner-v2-day-edge-action"
                              onClick={() => {
                                if (nextSection) {
                                  createLinkedTransportBetweenSections(section, nextSection);
                                  return;
                                }
                                openTailDepartureFromSection(section, day.dayIso);
                              }}
                            >
                              <Route size={12} />
                              <span>{nextSection ? `Add departure to ${nextSection.base.name}` : "Add departure"}</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                    );
                  })
                )}
              </div>
            </section>
          );
          })
        )}
      </div>

      {confirmDialog ? <ConfirmDialog state={confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
      {dayRangeDraft ? (
        <DayRangeEditor
          draft={dayRangeDraft}
          onUpdate={(patch) => setDayRangeDraft((current) => (current ? { ...current, ...patch } : current))}
          onDismiss={closeDayRangeEditor}
        />
      ) : null}

      {baseDraft ? (
        <BaseEditor
          draft={baseDraft}
          onUpdate={(patch) => {
            const nextDraft = { ...baseDraft, ...patch };
            if (nextDraft.mode === "edit") {
              persistBaseDraft(nextDraft);
              setBaseDraft(nextDraft);
              return;
            }
            if (canAutoCreateBaseDraft(nextDraft)) {
              const baseId = persistBaseDraft(nextDraft);
              setBaseDraft(baseId ? { ...nextDraft, mode: "edit", baseId } : nextDraft);
              return;
            }
            setBaseDraft(nextDraft);
          }}
          onDismiss={closeBaseEditor}
        />
      ) : null}

      {startTravelEditor ? (
        <StartTravelEditor
          state={startTravelEditor}
          linkedItemsEnabled={startTravelEditorItem ? allLinkedItemsVisible(startTravelEditorItem) : true}
          onToggleLinkedItems={
            startTravelEditorItem && hasAutoLinkedRows(startTravelEditorItem)
              ? () => toggleAutoLinkedItems(startTravelEditorItem.id)
              : undefined
          }
          onUpdate={(patch) =>
            {
              const nextDraft = { ...startTravelEditor.draft, ...patch };
              if (startTravelEditor.mode === "edit" && startTravelEditor.itemId) {
                commitStartTravelEdit(startTravelEditor.itemId, nextDraft);
                setStartTravelEditor({ ...startTravelEditor, draft: nextDraft });
                return;
              }
              if (startTravelEditor.mode === "create" && canAutoCreateStartTravelDraft(nextDraft)) {
                const existingItemId = startTravelEditor.sessionId ? autoCreatedStartTravelBySessionRef.current.get(startTravelEditor.sessionId) : undefined;
                const itemId = existingItemId ?? createStartTravelFromDraft(nextDraft);
                if (itemId) {
                  if (existingItemId) commitStartTravelEdit(existingItemId, nextDraft);
                  if (startTravelEditor.sessionId) autoCreatedStartTravelBySessionRef.current.set(startTravelEditor.sessionId, itemId);
                  setStartTravelEditor({ ...startTravelEditor, mode: "edit", itemId, draft: nextDraft });
                  return;
                }
              }
              setStartTravelEditor({ ...startTravelEditor, draft: nextDraft });
            }
          }
          onDismiss={closeStartTravelEditor}
          onBackdropClose={closeStartTravelEditor}
        />
      ) : null}

      {tailDepartureEditor ? (
        <TailDepartureEditor
          state={tailDepartureEditor}
          onUpdate={(patch) =>
            setTailDepartureEditor((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current))
          }
          onDismiss={closeTailDepartureEditor}
        />
      ) : null}

      {itemEditor ? (
        <ItemEditor
          state={itemEditor}
          bases={timeline.bases}
          linkedItemsEnabled={itemEditorSourceItem ? allLinkedItemsVisible(itemEditorSourceItem) : true}
          onToggleLinkedItems={
            itemEditorSourceItem && hasAutoLinkedRows(itemEditorSourceItem)
              ? () => toggleAutoLinkedItems(itemEditorSourceItem.id)
              : undefined
          }
          onUpdate={(patch) => {
            if (patch.stayType) setLastSelectedStayType(patch.stayType);
            const nextDraft = { ...itemEditor.draft, ...patch };
            if (itemEditor.mode === "edit" && itemEditor.itemId) {
              commitItemEdit(itemEditor.itemId, itemEditor.itemType, nextDraft);
              setItemEditor({ ...itemEditor, draft: nextDraft });
              return;
            }
            if (itemEditor.mode === "create" && canAutoCreateItemDraft(itemEditor.itemType, nextDraft)) {
              const existingItemId = autoCreatedItemBySessionRef.current.get(itemEditor.sessionId);
              const itemId = existingItemId ?? createItemFromDraft(itemEditor.itemType, nextDraft);
              if (itemId) {
                if (existingItemId) commitItemEdit(existingItemId, itemEditor.itemType, nextDraft);
                autoCreatedItemBySessionRef.current.set(itemEditor.sessionId, itemId);
                setItemEditor({
                  ...itemEditor,
                  mode: "edit",
                  itemId,
                  restoreDetailOnClose: false,
                  draft: nextDraft,
                });
                return;
              }
            }
            setItemEditor({ ...itemEditor, draft: nextDraft });
          }}
          onDismiss={closeItemEditor}
          onBackdropClose={closeItemEditor}
        />
      ) : null}

      {detailEntry ? (
        <DetailSheet
          entry={detailEntry}
          onClose={() => setDetailItemId(null)}
          onEdit={() => openEditItem(detailEntry)}
          copiedAddressId={copiedDetailId}
          onCopyAddress={copyDetailText}
        />
      ) : null}
    </section>
  );
}
