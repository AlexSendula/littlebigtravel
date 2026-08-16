import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { incrementPerformanceCounter } from "./performance/perfMetrics";
import type { TripStop } from "./tripData";

type StopSelectRef = {
  current: (stop: TripStop) => void;
};

export type ManagedStopMarker = {
  marker: Marker;
  element: HTMLElement;
  stop: TripStop;
  selected: boolean;
  signature: string;
  lngLatSignature: string;
};

function markerClassName(stop: TripStop, selected: boolean) {
  return `map-stop-marker ${stop.kind} ${stop.accent} ${stop.parentId ? "child-stop" : ""} ${selected ? "selected" : ""}`;
}

function markerSignature(stop: TripStop, selected: boolean) {
  return [
    stop.id,
    stop.name,
    stop.dates,
    stop.kind,
    stop.accent,
    stop.parentId ?? "",
    selected ? "selected" : "idle",
  ].join("|");
}

function lngLatSignature(stop: TripStop) {
  return `${stop.coordinates[0].toFixed(6)},${stop.coordinates[1].toFixed(6)}`;
}

function updateMarkerElement(record: ManagedStopMarker) {
  const { element, selected, stop } = record;
  element.className = markerClassName(stop, selected);

  const button = element.querySelector<HTMLButtonElement>("button");
  if (!button) return;

  button.setAttribute("aria-label", `${selected ? "Selected stop: " : "Trip stop: "}${stop.name}, ${stop.dates}`);
  const label = button.querySelector<HTMLElement>(".map-marker-label");
  if (label && label.textContent !== stop.name) label.textContent = stop.name;
}

function createMarkerElement(record: ManagedStopMarker, onSelectStopRef: StopSelectRef) {
  const element = document.createElement("div");
  element.innerHTML = `
    <button class="map-marker-button" type="button">
      <span class="map-marker-glyph" aria-hidden="true"></span>
      <span class="map-marker-label"></span>
    </button>
  `;

  const button = element.querySelector<HTMLButtonElement>("button");
  if (button) {
    button.onclick = () => onSelectStopRef.current(record.stop);
    button.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectStopRef.current(record.stop);
      }
    };
  }

  record.element = element;
  updateMarkerElement(record);
  return element;
}

export function syncMapMarkers({
  map,
  markers,
  onSelectStopRef,
  selectedStopId,
  visibleStops,
}: {
  map: MapLibreMap;
  markers: Map<string, ManagedStopMarker>;
  onSelectStopRef: StopSelectRef;
  selectedStopId?: string;
  visibleStops: TripStop[];
}) {
  incrementPerformanceCounter("map.marker.sync");
  const visibleIds = new Set(visibleStops.map((stop) => stop.id));

  markers.forEach((record, id) => {
    if (!visibleIds.has(id)) {
      record.marker.remove();
      markers.delete(id);
      incrementPerformanceCounter("map.marker.remove");
    }
  });

  visibleStops.forEach((stop) => {
    const selected = stop.id === selectedStopId;
    const nextSignature = markerSignature(stop, selected);
    const nextLngLatSignature = lngLatSignature(stop);
    const existingRecord = markers.get(stop.id);

    if (existingRecord) {
      existingRecord.stop = stop;

      if (existingRecord.signature !== nextSignature) {
        existingRecord.selected = selected;
        existingRecord.signature = nextSignature;
        updateMarkerElement(existingRecord);
        incrementPerformanceCounter("map.marker.updateElement");
      }

      if (existingRecord.lngLatSignature !== nextLngLatSignature) {
        existingRecord.lngLatSignature = nextLngLatSignature;
        existingRecord.marker.setLngLat(stop.coordinates);
        incrementPerformanceCounter("map.marker.updatePosition");
      }

      return;
    }

    const record: ManagedStopMarker = {
      marker: undefined as unknown as Marker,
      element: undefined as unknown as HTMLElement,
      stop,
      selected,
      signature: nextSignature,
      lngLatSignature: nextLngLatSignature,
    };
    const element = createMarkerElement(record, onSelectStopRef);
    const marker = new maplibregl.Marker({
      element,
      anchor: "center",
    })
      .setLngLat(stop.coordinates)
      .addTo(map);

    record.marker = marker;
    markers.set(stop.id, record);
    incrementPerformanceCounter("map.marker.create");
  });
}
