import maplibregl, { type LngLatBoundsLike, type Map as MapLibreMap } from "maplibre-gl";
import { TRIP_BOUNDS } from "./mapGeometry";
import type { TripStop } from "./tripData";

type CameraStep = {
  center: [number, number];
  zoom: number;
  offset?: [number, number];
  duration: number;
  curve?: number;
  minZoom?: number;
};

export type CameraPlan =
  | { kind: "ease"; key: string; step: CameraStep }
  | { kind: "fly"; key: string; step: CameraStep }
  | { kind: "pivot"; key: string; pivot: CameraStep; final: CameraStep };

export function panelAwarePadding() {
  const mobile = window.matchMedia("(max-width: 699px)").matches;
  return mobile ? { top: 114, right: 110, bottom: 104, left: 22 } : { top: 102, right: 118, bottom: 60, left: 56 };
}

export function focusOffset() {
  const mobile = window.matchMedia("(max-width: 699px)").matches;
  return mobile ? [-44, -46] : [-56, 0];
}

export function focusZoom(stop: TripStop) {
  if (stop.kind === "hidden") return 10.8;
  if (stop.kind === "major") return 8.8;
  if (["puerto-natales", "el-calafate", "el-chalten"].includes(stop.id)) return 7.1;
  return 5.9;
}

export function fitTrip(map: MapLibreMap, stops: TripStop[], duration = 900) {
  if (stops.length === 1) {
    map.easeTo({
      center: stops[0].coordinates,
      zoom: 5.8,
      duration,
      essential: true,
    });
    return;
  }

  if (stops.length > 0) {
    const bounds = new maplibregl.LngLatBounds(stops[0].coordinates, stops[0].coordinates);
    stops.slice(1).forEach((stop) => bounds.extend(stop.coordinates));
    map.fitBounds(bounds, {
      padding: panelAwarePadding(),
      duration,
      maxZoom: stops.length === 1 ? 5.8 : 4.8,
    });
    return;
  }

  map.fitBounds(TRIP_BOUNDS as LngLatBoundsLike, {
    padding: panelAwarePadding(),
    duration,
    maxZoom: 4.55,
  });
}

export function distanceKm(from: [number, number], to: [number, number]) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);
  const dLat = lat2 - lat1;
  const dLng = toRadians(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function cameraKey(stop: TripStop, zoom: number, offset: [number, number]) {
  return [
    stop.id,
    stop.coordinates[0].toFixed(5),
    stop.coordinates[1].toFixed(5),
    zoom.toFixed(2),
    offset[0],
    offset[1],
  ].join(":");
}

export function planSelectedStopCamera({
  map,
  previousStop,
  selectedStop,
  stopById,
}: {
  map: MapLibreMap;
  previousStop: TripStop | null;
  selectedStop: TripStop;
  stopById: Map<string, TripStop>;
}): CameraPlan {
  const previous = previousStop ?? selectedStop;
  const currentCenter = map.getCenter();
  const jumpDistanceKm = distanceKm([currentCenter.lng, currentCenter.lat], selectedStop.coordinates);
  const targetZoom = Math.max(map.getZoom(), focusZoom(selectedStop));
  const offset = focusOffset() as [number, number];
  const key = cameraKey(selectedStop, targetZoom, offset);
  const previousBase = previous.parentId ? stopById.get(previous.parentId) : previous.kind === "base" ? previous : undefined;
  const selectedBase = selectedStop.parentId ? stopById.get(selectedStop.parentId) : selectedStop.kind === "base" ? selectedStop : undefined;
  const shouldPivotViaPreviousBase =
    Boolean(previous.parentId) &&
    Boolean(previousBase) &&
    Boolean(selectedBase) &&
    previousBase!.id !== selectedBase!.id &&
    previousBase!.id !== selectedStop.id &&
    jumpDistanceKm > 230;

  if (shouldPivotViaPreviousBase && previousBase) {
    const pivotZoom = Math.max(map.getZoom(), focusZoom(previousBase) - 0.3);
    const lowZoom = Math.max(3.15, Math.min(targetZoom - 1.15, map.getZoom() - 0.9));
    return {
      kind: "pivot",
      key,
      pivot: {
        center: previousBase.coordinates,
        zoom: pivotZoom,
        duration: 360,
      },
      final: {
        center: selectedStop.coordinates,
        zoom: targetZoom,
        offset,
        duration: 760,
        curve: 1.32,
        minZoom: lowZoom,
      },
    };
  }

  if (jumpDistanceKm > 320) {
    return {
      kind: "fly",
      key,
      step: {
        center: selectedStop.coordinates,
        zoom: targetZoom,
        offset,
        duration: 820,
        curve: 1.34,
        minZoom: Math.max(3.15, Math.min(targetZoom - 1.15, map.getZoom() - 0.9)),
      },
    };
  }

  return {
    kind: "ease",
    key,
    step: {
      center: selectedStop.coordinates,
      zoom: targetZoom,
      offset,
      duration: 560,
    },
  };
}
