import { useCallback, useMemo, type ReactNode } from "react";
import { Check, Link2, Unlink2 } from "lucide-react";
import { useRenderMetric } from "../../../performance/perfMetrics";
import {
  type PlannerBaseCityRecord,
  type PlannerBreakdownEntry,
  type PlannerDayDisplayMode,
  type PlannerItemKind,
  type PlannerStayType,
  type PlannerTimelineKind,
  type PlannerTransportMode,
} from "../../../planner";
import { FieldDateRange, FieldPlace, FieldSelect, FieldTime } from "../fields/PlannerFields";
import { useVerticalSwipe } from "../gestures/PlannerGestures";

const TRANSPORT_MODE_OPTIONS: PlannerTransportMode[] = ["flight", "car", "bus", "train", "taxi", "other"];
const STAY_TYPE_OPTIONS: PlannerStayType[] = ["apartment", "hostel", "hotel", "campsite", "camper", "friend_family", "overnight_transport", "tbd", "other"];
const EARLIER_ARRIVAL_HINT =
  "Arrival clock time is earlier. This can be normal across time zones, or you may need to set arrival to the next day.";

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

function PlannerEditorSheet({
  title,
  subtitle,
  className,
  headerAction,
  onDismiss,
  onBackdropDismiss,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  headerAction?: ReactNode;
  onDismiss: () => void;
  onBackdropDismiss?: () => void;
  children: ReactNode;
}) {
  useRenderMetric("editor-sheet");

  const swipeHandlers = useVerticalSwipe({
    onSwipeDown: onDismiss,
  });

  return (
    <section className="planner-editor-backdrop" role="presentation" onClick={onBackdropDismiss ?? onDismiss}>
      <form
        className={`planner-editor ${className ?? ""}`.trim()}
        autoComplete="off"
        {...swipeHandlers}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="sheet-handle planner-swipe-handle swipe-handle-bar" aria-hidden="true" />
        <header className="planner-editor-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {headerAction}
        </header>
        {children}
      </form>
    </section>
  );
}

function modeLabel(mode: PlannerTransportMode) {
  if (mode === "flight") return "Flight";
  if (mode === "car") return "Car";
  if (mode === "bus") return "Bus";
  if (mode === "train") return "Train";
  if (mode === "taxi") return "Taxi";
  return "Other";
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

function itemTypeLabel(itemType: PlannerTimelineKind) {
  if (itemType === "transport") return "Transport";
  if (itemType === "activity") return "Activity";
  return "Note";
}

function LinkedItemsToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`planner-linked-toggle ${enabled ? "enabled" : "disabled"}`}
      onClick={onToggle}
      data-testid="linked-items-toggle"
      aria-label={enabled ? "Hide auto linked items" : "Show auto linked items"}
      title={enabled ? "Auto linked items visible" : "Auto linked items hidden"}
    >
      {enabled ? <Link2 size={16} /> : <Unlink2 size={16} />}
    </button>
  );
}

function isoToUtcMs(isoDate?: string) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return Number.NaN;
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day);
}

function isoFromUtcMs(utcMs: number) {
  const date = new Date(utcMs);
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
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

export function DayRangeEditor({
  draft,
  onUpdate,
  onDismiss,
}: {
  draft: DayRangeDraft;
  onUpdate: (patch: Partial<DayRangeDraft>) => void;
  onDismiss: () => void;
}) {
  const handleDateRangeChange = useCallback(
    (nextRange: { startDate: string; endDate: string }) => {
      onUpdate({
        startDate: nextRange.startDate,
        endDate: nextRange.endDate,
      });
    },
    [onUpdate],
  );
  const useSpanCard = draft.dayDisplayMode === "span";
  const hasMultipleDays = (draft.endDate || draft.startDate) !== draft.startDate;

  return (
    <PlannerEditorSheet
      className="planner-editor-day-range"
      title={draft.mode === "edit" ? "Edit Day(s)" : "Add Day(s)"}
      subtitle={draft.mode === "edit" ? `Update this day range for ${draft.baseName}` : `Choose one day or a spanning range for ${draft.baseName}`}
      onDismiss={onDismiss}
    >

        <label className="planner-field">
          <span>Day Range</span>
          <FieldDateRange id="planner-day-range" startValue={draft.startDate} endValue={draft.endDate || draft.startDate} onChange={handleDateRangeChange} />
        </label>

        {hasMultipleDays ? (
          <label className="planner-check-field">
            <button
              type="button"
              className={`planner-check-toggle ${useSpanCard ? "active" : ""}`}
              role="checkbox"
              aria-checked={useSpanCard}
              onClick={() => onUpdate({ dayDisplayMode: useSpanCard ? "daily" : "span" })}
            >
              <span className="planner-check-icon" aria-hidden="true">
                {useSpanCard ? <Check size={13} /> : null}
              </span>
              <span className="planner-check-copy">
                <strong>Single card</strong>
              </span>
            </button>
          </label>
        ) : null}

    </PlannerEditorSheet>
  );
}

export function BaseEditor({
  draft,
  onUpdate,
  onDismiss,
}: {
  draft: BaseDraft;
  onUpdate: (patch: Partial<BaseDraft>) => void;
  onDismiss: () => void;
}) {
  const handleDateRangeChange = useCallback(
    (nextRange: { startDate: string; endDate: string }) => {
      onUpdate({
        startDate: nextRange.startDate,
        endDate: nextRange.endDate,
      });
    },
    [onUpdate],
  );

  return (
    <PlannerEditorSheet
      title={draft.mode === "edit" ? "Edit Base City" : "New Base City"}
      subtitle={draft.mode === "edit" ? "Adjust base city and stay duration" : "Create an empty base with its date range"}
      onDismiss={onDismiss}
    >

        <label className="planner-field">
          <span>Base City</span>
          <FieldPlace
            id="planner-base-city"
            value={draft.baseCity}
            placeholder="Type a city or destination"
            onChange={(value) =>
              onUpdate({
                baseCity: value,
                coordinates: undefined,
                country: undefined,
                countryCode: undefined,
                mapStopId: undefined,
              })
            }
            onSelectPlace={(option) =>
              onUpdate({
                baseCity: option.inputLabel,
                coordinates: option.coordinates,
                country: option.country,
                countryCode: option.countryCode,
                mapStopId: option.mapStopId,
              })
            }
          />
        </label>

        <label className="planner-field">
          <span>Travel Dates</span>
          <FieldDateRange
            id="planner-base-date-range"
            startValue={draft.startDate}
            endValue={draft.endDate || draft.startDate}
            onChange={handleDateRangeChange}
          />
        </label>

        <label className="planner-field">
          <span>Notes</span>
          <textarea
            data-no-swipe="true"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            name="lbt-base-notes"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="enter"
            spellCheck={false}
            rows={4}
            value={draft.note}
            onChange={(event) => onUpdate({ note: event.target.value })}
          />
        </label>

    </PlannerEditorSheet>
  );
}

export function StartTravelEditor({
  state,
  linkedItemsEnabled = true,
  onToggleLinkedItems,
  onUpdate,
  onDismiss,
  onBackdropClose,
}: {
  state: StartTravelEditorState;
  linkedItemsEnabled?: boolean;
  onToggleLinkedItems?: () => void;
  onUpdate: (patch: Partial<StartTravelDraft>) => void;
  onDismiss: () => void;
  onBackdropClose?: () => void;
}) {
  const transportModeOptions = useMemo(
    () =>
      TRANSPORT_MODE_OPTIONS.map((mode) => ({
        value: mode,
        label: modeLabel(mode),
      })),
    [],
  );
  const handleDateRangeChange = useCallback(
    (nextRange: { startDate: string; endDate: string }) => {
      onUpdate({
        date: nextRange.startDate,
        endDate: nextRange.endDate,
      });
    },
    [onUpdate],
  );

  const showNextDayHint = shouldSuggestNextDayArrival(state.draft.date, state.draft.endDate || undefined, state.draft.startTime, state.draft.endTime);

  return (
    <PlannerEditorSheet
      title={state.mode === "edit" ? "Edit Starting Travel" : "Starting Travel"}
      subtitle="How you leave and where you first arrive"
      headerAction={onToggleLinkedItems ? <LinkedItemsToggle enabled={linkedItemsEnabled} onToggle={onToggleLinkedItems} /> : null}
      onDismiss={onDismiss}
      onBackdropDismiss={onBackdropClose}
    >

        <div className="planner-field-grid">
        <label className="planner-field">
          <span className="planner-field-header">
            <span>Departure Place</span>
            <small className="planner-field-required-marker" aria-hidden="true">*</small>
          </span>
          <FieldPlace
            id="planner-start-from"
            value={state.draft.fromLabel}
            placeholder="Home, airport, station..."
            onChange={(value) =>
              onUpdate({
                fromLabel: value,
                fromCoordinates: undefined,
                fromCountry: undefined,
                fromCountryCode: undefined,
                fromMapStopId: undefined,
              })
            }
            onSelectPlace={(option) =>
              onUpdate({
                fromLabel: option.inputLabel,
                fromCoordinates: option.coordinates,
                fromCountry: option.country,
                fromCountryCode: option.countryCode,
                fromMapStopId: option.mapStopId,
              })
            }
          />
        </label>
          <label className="planner-field">
            <span className="planner-field-header">
              <span>Arrival Place</span>
              <small className="planner-field-required-marker" aria-hidden="true">*</small>
            </span>
            <FieldPlace
              id="planner-start-to"
              value={state.draft.toLabel}
              placeholder="First destination"
              onChange={(value) =>
                onUpdate({
                  toLabel: value,
                  toCoordinates: undefined,
                  toCountry: undefined,
                  toCountryCode: undefined,
                  toMapStopId: undefined,
                })
              }
              onSelectPlace={(option) =>
                onUpdate({
                  toLabel: option.inputLabel,
                  toCoordinates: option.coordinates,
                  toCountry: option.country,
                  toCountryCode: option.countryCode,
                  toMapStopId: option.mapStopId,
                })
              }
            />
          </label>
        </div>

        <label className="planner-field">
          <span>Method</span>
          <FieldSelect id="planner-start-transport-mode" value={state.draft.transportMode} options={transportModeOptions} onChange={(value) => onUpdate({ transportMode: value as StartTravelDraft["transportMode"] })} />
        </label>

        <label className="planner-field">
          <span className="planner-field-header">
            <span>Travel Dates</span>
            <small className="planner-field-required-marker" aria-hidden="true">*</small>
          </span>
          <FieldDateRange id="planner-start-date-range" startValue={state.draft.date} endValue={state.draft.endDate || state.draft.date} onChange={handleDateRangeChange} />
        </label>

        <div className="planner-field-grid planner-field-grid-times">
          <label className="planner-field">
            <span>Departure Time</span>
            <FieldTime id="planner-start-departure-time" value={state.draft.startTime} onChange={(value) => onUpdate({ startTime: value })} />
          </label>
          <label className="planner-field">
            <span>Arrival Time</span>
            <FieldTime id="planner-start-arrival-time" value={state.draft.endTime} onChange={(value) => onUpdate({ endTime: value })} />
          </label>
        </div>

        {showNextDayHint ? (
          <div className="planner-transport-hint" role="status">
            <span>{EARLIER_ARRIVAL_HINT}</span>
            <button
              type="button"
              onClick={() => {
                const nextDate = addDaysToIso(state.draft.date, 1);
                onUpdate({ endDate: nextDate });
              }}
            >
              Set +1 day
            </button>
          </div>
        ) : null}

        <label className="planner-field">
          <span>Notes</span>
          <textarea
            data-no-swipe="true"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            name="lbt-start-travel-notes"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="enter"
            spellCheck={false}
            rows={4}
            value={state.draft.note}
            onChange={(event) => onUpdate({ note: event.target.value })}
          />
        </label>

    </PlannerEditorSheet>
  );
}

export function ItemEditor({
  state,
  bases,
  linkedItemsEnabled = true,
  onToggleLinkedItems,
  onUpdate,
  onDismiss,
  onBackdropClose,
}: {
  state: ItemEditorState;
  bases: PlannerBaseCityRecord[];
  linkedItemsEnabled?: boolean;
  onToggleLinkedItems?: () => void;
  onUpdate: (patch: Partial<ItemDraft>) => void;
  onDismiss: () => void;
  onBackdropClose?: () => void;
}) {
  const baseOptions = useMemo(
    () => bases.map((base) => ({ label: base.name, value: base.id })),
    [bases],
  );
  const baseNameById = useMemo(() => new Map(bases.map((base) => [base.id, base.name])), [bases]);
  const transportModeOptions = useMemo(
    () =>
      TRANSPORT_MODE_OPTIONS.map((mode) => ({
        label: modeLabel(mode),
        value: mode,
      })),
    [],
  );
  const stayTypeOptions = useMemo(
    () =>
      STAY_TYPE_OPTIONS.map((type) => ({
        label: stayTypeLabel(type),
        value: type,
      })),
    [],
  );
  const isTransport = state.itemType === "transport";
  const isActivity = state.itemType === "activity";
  const isStay = state.draft.kind === "stay";

  const handleTransportDateRangeChange = useCallback(
    (nextRange: { startDate: string; endDate: string }) => {
      onUpdate({
        date: nextRange.startDate,
        endDate: nextRange.endDate,
      });
    },
    [onUpdate],
  );
  const handleItemDateRangeChange = useCallback(
    (nextRange: { startDate: string; endDate: string }) => {
      onUpdate({
        date: nextRange.startDate,
        endDate: nextRange.endDate,
      });
    },
    [onUpdate],
  );

  const showNextDayHint =
    isTransport &&
    shouldSuggestNextDayArrival(state.draft.date, state.draft.endDate || undefined, state.draft.startTime, state.draft.endTime);
  const hasMappableActivityPlace = isActivity && Boolean(state.draft.placeCoordinates || state.draft.placeMapStopId);

  return (
    <PlannerEditorSheet
      title={state.mode === "edit" ? "Edit Item" : isStay ? "New Stay" : `New ${itemTypeLabel(state.itemType)}`}
      subtitle={isStay ? "Where you sleep and what you need there" : isTransport ? "Route and timing details" : isActivity ? "Plan activities" : "Simple note on the timeline"}
      headerAction={onToggleLinkedItems ? <LinkedItemsToggle enabled={linkedItemsEnabled} onToggle={onToggleLinkedItems} /> : null}
      onDismiss={onDismiss}
      onBackdropDismiss={onBackdropClose}
    >

        {isStay ? (
          <>
            <label className="planner-field">
              <span>Stay Type</span>
              <FieldSelect id="planner-stay-type" value={state.draft.stayType} options={stayTypeOptions} onChange={(value) => onUpdate({ stayType: value as PlannerStayType })} />
            </label>
            <label className="planner-field">
              <span>Place</span>
              <FieldPlace
                id="planner-stay-place"
                value={state.draft.placeLabel}
                placeholder="Hotel, hostel, campsite, camper spot..."
                onChange={(value) =>
                  onUpdate({
                    placeLabel: value,
                    placeAddress: "",
                    placeCoordinates: undefined,
                    placeCountry: undefined,
                    placeCountryCode: undefined,
                    placeMapStopId: undefined,
                  })
                }
                onSelectPlace={(option) =>
                  onUpdate({
                    placeLabel: option.inputLabel,
                    placeAddress: option.inputLabel,
                    placeCoordinates: option.coordinates,
                    placeCountry: option.country,
                    placeCountryCode: option.countryCode,
                    placeMapStopId: option.mapStopId,
                  })
                }
              />
            </label>
          </>
        ) : (
          <label className="planner-field">
            <span className={isActivity ? "planner-field-row-label" : undefined}>
              <span>Title</span>
              {hasMappableActivityPlace ? (
                <button
                  type="button"
                  data-testid="activity-show-map-toggle"
                  className={`planner-check-toggle planner-check-toggle-inline ${state.draft.showOnMap ? "active" : ""}`}
                  role="checkbox"
                  aria-checked={state.draft.showOnMap}
                  onClick={() => onUpdate({ showOnMap: !state.draft.showOnMap })}
                >
                  <span className="planner-check-icon" aria-hidden="true">
                    {state.draft.showOnMap ? <Check size={13} /> : null}
                  </span>
                  <span className="planner-check-copy">
                    <strong>Show on map</strong>
                  </span>
                </button>
              ) : null}
            </span>
            <input
              required
              type="text"
              name="lbt-activity-title"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint="enter"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              value={state.draft.title}
              onChange={(event) => onUpdate({ title: event.target.value })}
            />
          </label>
        )}

        {isTransport ? (
          <label className="planner-field">
            <span>Transport Type</span>
            <FieldSelect id="planner-transport-mode" value={state.draft.transportMode} options={transportModeOptions} onChange={(value) => onUpdate({ transportMode: value as ItemDraft["transportMode"] })} />
          </label>
        ) : isStay ? null : (
          <>
            <label className="planner-field">
              <span>Place</span>
              <FieldPlace
                id="planner-activity-place"
                value={state.draft.placeLabel}
                placeholder="Museum, trailhead, restaurant..."
                onChange={(value) =>
                  onUpdate({
                    placeLabel: value,
                    placeAddress: "",
                    placeCoordinates: undefined,
                    placeCountry: undefined,
                    placeCountryCode: undefined,
                    placeMapStopId: undefined,
                    showOnMap: false,
                  })
                }
                onSelectPlace={(option) =>
                  onUpdate({
                    placeLabel: option.inputLabel,
                    placeAddress: option.inputLabel,
                    placeCoordinates: option.coordinates,
                    placeCountry: option.country,
                    placeCountryCode: option.countryCode,
                    placeMapStopId: option.mapStopId,
                    destinationId: option.mapStopId ?? state.draft.destinationId,
                  })
                }
              />
            </label>
          </>
        )}

        {isTransport ? (
          <div className="planner-field-grid">
            <label className="planner-field">
              <span>From Base</span>
              <FieldSelect id="planner-from-base" value={state.draft.fromBaseId} options={baseOptions} onChange={(value) => onUpdate({ fromBaseId: value })} />
            </label>
            <label className="planner-field">
              <span>To Base</span>
              <FieldSelect id="planner-to-base" value={state.draft.toBaseId} options={baseOptions} onChange={(value) => onUpdate({ toBaseId: value })} />
            </label>
          </div>
        ) : isStay ? (
          <label className="planner-field">
            <span>Base City</span>
            <input
              type="text"
              name="lbt-stay-base-readonly"
              autoComplete="new-password"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              value={baseNameById.get(state.draft.baseId) ?? "Base city"}
              readOnly
            />
          </label>
        ) : null}

        {isTransport ? (
          <label className="planner-field">
            <span>Travel Dates</span>
            <FieldDateRange id="planner-item-date-range" startValue={state.draft.date} endValue={state.draft.endDate || state.draft.date} onChange={handleTransportDateRangeChange} />
          </label>
        ) : isStay ? (
          <label className="planner-field">
            <span>Stay Dates</span>
            <FieldDateRange id="planner-item-span-range" startValue={state.draft.date} endValue={state.draft.endDate || state.draft.date} onChange={handleItemDateRangeChange} />
          </label>
        ) : null}

        <div className="planner-field-grid planner-field-grid-times">
          <label className="planner-field">
            <span>{isTransport ? "Departure Time" : isStay ? "Check-in Time" : "Start Time"}</span>
            <FieldTime id="planner-item-start-time" value={state.draft.startTime} onChange={(value) => onUpdate({ startTime: value })} />
          </label>
          <label className="planner-field">
            <span>{isTransport ? "Arrival Time" : isStay ? "Check-out Time" : "End Time"}</span>
            <FieldTime id="planner-item-end-time" value={state.draft.endTime} onChange={(value) => onUpdate({ endTime: value })} />
          </label>
        </div>

        {showNextDayHint ? (
          <div className="planner-transport-hint" role="status">
            <span>{EARLIER_ARRIVAL_HINT}</span>
            <button
              type="button"
              onClick={() => {
                const nextDate = addDaysToIso(state.draft.date, 1);
                onUpdate({ endDate: nextDate });
              }}
            >
              Set +1 day
            </button>
          </div>
        ) : null}

        <label className="planner-field">
          <span>Notes</span>
          <textarea
            data-no-swipe="true"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            name="lbt-item-notes"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="enter"
            spellCheck={false}
            rows={4}
            value={state.draft.note}
            onChange={(event) => onUpdate({ note: event.target.value })}
          />
        </label>

    </PlannerEditorSheet>
  );
}

export function TailDepartureEditor({
  state,
  onUpdate,
  onDismiss,
}: {
  state: TailDepartureEditorState;
  onUpdate: (patch: Partial<TailDepartureDraft>) => void;
  onDismiss: () => void;
}) {
  const transportModeOptions = useMemo(
    () =>
      TRANSPORT_MODE_OPTIONS.map((mode) => ({
        value: mode,
        label: modeLabel(mode),
      })),
    [],
  );
  const handleDateRangeChange = useCallback(
    (nextRange: { startDate: string; endDate: string }) => {
      onUpdate({
        date: nextRange.startDate,
        endDate: nextRange.endDate,
      });
    },
    [onUpdate],
  );
  const showNextDayHint = shouldSuggestNextDayArrival(state.draft.date, state.draft.endDate || undefined, state.draft.startTime, state.draft.endTime);

  return (
    <PlannerEditorSheet
      title="New Departure"
      subtitle="Create a linked route and the arrival base"
      onDismiss={onDismiss}
    >

        <label className="planner-field">
          <span>From</span>
          <input
            type="text"
            name="lbt-departure-source-readonly"
            autoComplete="new-password"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            value={state.sourceBaseName}
            disabled
          />
        </label>

        <label className="planner-field">
          <span>To</span>
          <FieldPlace
            id="planner-tail-departure-to"
            value={state.draft.toLabel}
            placeholder="City or destination"
            onChange={(value) =>
              onUpdate({
                toLabel: value,
                toCoordinates: undefined,
                toCountry: undefined,
                toCountryCode: undefined,
                toMapStopId: undefined,
              })
            }
            onSelectPlace={(option) =>
              onUpdate({
                toLabel: option.inputLabel,
                toCoordinates: option.coordinates,
                toCountry: option.country,
                toCountryCode: option.countryCode,
                toMapStopId: option.mapStopId,
              })
            }
          />
        </label>

        <label className="planner-field">
          <span>Method</span>
          <FieldSelect id="planner-tail-departure-mode" value={state.draft.transportMode} options={transportModeOptions} onChange={(value) => onUpdate({ transportMode: value as TailDepartureDraft["transportMode"] })} />
        </label>

        <label className="planner-field">
          <span>Travel Dates</span>
          <FieldDateRange id="planner-tail-departure-dates" startValue={state.draft.date} endValue={state.draft.endDate || state.draft.date} onChange={handleDateRangeChange} />
        </label>

        <div className="planner-field-grid planner-field-grid-times">
          <label className="planner-field">
            <span>Departure Time</span>
            <FieldTime id="planner-tail-departure-start-time" value={state.draft.startTime} onChange={(value) => onUpdate({ startTime: value })} />
          </label>
          <label className="planner-field">
            <span>Arrival Time</span>
            <FieldTime id="planner-tail-departure-end-time" value={state.draft.endTime} onChange={(value) => onUpdate({ endTime: value })} />
          </label>
        </div>

        {showNextDayHint ? (
          <div className="planner-transport-hint" role="status">
            <span>{EARLIER_ARRIVAL_HINT}</span>
            <button
              type="button"
              onClick={() => {
                const nextDate = addDaysToIso(state.draft.date, 1);
                onUpdate({ endDate: nextDate });
              }}
            >
              Set +1 day
            </button>
          </div>
        ) : null}

        <label className="planner-field">
          <span>Notes</span>
          <textarea
            data-no-swipe="true"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            name="lbt-departure-notes"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="enter"
            spellCheck={false}
            rows={4}
            value={state.draft.note}
            onChange={(event) => onUpdate({ note: event.target.value })}
          />
        </label>

    </PlannerEditorSheet>
  );
}
