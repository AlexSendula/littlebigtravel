import type { Feature, FeatureCollection, LineString } from "geojson";
import { stopById, type TransportMode, type TripLeg, type TripStop } from "./tripData";

export const TRIP_BOUNDS: [[number, number], [number, number]] = [
  [-75.4, -54.4],
  [-53.6, -22.2],
];

export const SOUTH_CONE_CENTER: [number, number] = [-64.4, -39.2];

type RouteProperties = {
  id: string;
  mode: TransportMode;
  label: string;
  related: boolean;
};

type XY = [number, number];

function projectionScale(from: [number, number], to: [number, number]) {
  const avgLat = ((from[1] + to[1]) / 2 / 180) * Math.PI;
  return Math.max(0.45, Math.cos(avgLat));
}

function localProjectionScale(base: [number, number]) {
  return Math.max(0.45, Math.cos((base[1] / 180) * Math.PI));
}

function project(coordinates: [number, number], scale: number): XY {
  return [coordinates[0] * scale, coordinates[1]];
}

function unproject(point: XY, scale: number): [number, number] {
  return [point[0] / scale, point[1]];
}

function quadraticPoint(from: XY, control: XY, to: XY, t: number): XY {
  const oneMinus = 1 - t;
  return [
    oneMinus * oneMinus * from[0] + 2 * oneMinus * t * control[0] + t * t * to[0],
    oneMinus * oneMinus * from[1] + 2 * oneMinus * t * control[1] + t * t * to[1],
  ];
}

function stableDirection(id: string) {
  return Array.from(id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
}

function routeBend(leg: TripLeg, mode: TransportMode) {
  if (mode === "flight") return 0.34 * stableDirection(leg.id);
  if (mode === "bus") return 0.18 * stableDirection(leg.id);
  if (mode === "road") return 0.14 * stableDirection(leg.id);
  return 0.12 * stableDirection(leg.id);
}

function localSiblingsFromBase(selectedStopId: string, siblingLegs: TripLeg[], lookup: Map<string, TripStop>) {
  return siblingLegs.filter((candidate) => candidate.mode === "local" && candidate.from === selectedStopId && lookup.has(candidate.to));
}

function localLane(leg: TripLeg, selectedStopId: string, siblingLegs: TripLeg[], lookup: Map<string, TripStop>) {
  const base = lookup.get(selectedStopId);
  if (!base || leg.from !== selectedStopId) return 0;

  const siblings = localSiblingsFromBase(selectedStopId, siblingLegs, lookup)
    .map((candidate) => {
      const destination = lookup.get(candidate.to);
      if (!destination) return null;

      const dx = destination.coordinates[0] - base.coordinates[0];
      const dy = destination.coordinates[1] - base.coordinates[1];
      return { id: candidate.id, angle: Math.atan2(dy, dx) };
    })
    .filter((candidate): candidate is { id: string; angle: number } => Boolean(candidate))
    .sort((a, b) => a.angle - b.angle);

  const index = siblings.findIndex((candidate) => candidate.id === leg.id);
  if (index < 0 || siblings.length < 2) return 0;

  return index - (siblings.length - 1) / 2;
}

function localDoubleCurve(leg: TripLeg, from: [number, number], to: [number, number], selectedStopId: string, siblingLegs: TripLeg[], lookup: Map<string, TripStop>) {
  const base = lookup.get(selectedStopId);
  const siblings = localSiblingsFromBase(selectedStopId, siblingLegs, lookup);
  if (!base || leg.from !== selectedStopId || siblings.length < 2) return undefined;

  const scale = localProjectionScale(from);
  const start = project(from, scale);
  const end = project(to, scale);
  const projectedSiblingStops = siblings.map((candidate) => project(lookup.get(candidate.to)!.coordinates, scale));
  const siblingAngles = projectedSiblingStops.map((point) => Math.atan2(point[1] - start[1], point[0] - start[0]));
  const angleSpread = Math.max(...siblingAngles) - Math.min(...siblingAngles);
  const maxSiblingDistance = Math.max(...projectedSiblingStops.map((point) => Math.hypot(point[0] - start[0], point[1] - start[1])));

  if (angleSpread > 0.7 || maxSiblingDistance > 0.9) return undefined;

  const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const lane = localLane(leg, selectedStopId, siblingLegs, lookup);
  const maxLane = Math.max(1, (siblings.length - 1) / 2);
  const laneRatio = lane === 0 ? stableDirection(leg.id) * 0.5 : lane / maxLane;
  const destinationAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const sharedSwerve = stableDirection(`${selectedStopId}-local`) * 0.055;

  return Array.from({ length: 26 }, (_, index) => {
    const t = index / 25;
    const radius = distance * t;
    // Close subtrips get a playful nested fan: enough "comic map" curve to feel
    // hand-drawn, while preserving angular order so sibling paths do not cross.
    const fanCurve = laneRatio * 0.24 * Math.sin(Math.PI * t);
    const doubleCurve = sharedSwerve * Math.sin(Math.PI * 2 * t);
    const angle = destinationAngle + fanCurve + doubleCurve;
    return unproject([start[0] + Math.cos(angle) * radius, start[1] + Math.sin(angle) * radius], scale);
  });
}

function routedArc(leg: TripLeg, from: [number, number], to: [number, number], mode: TransportMode, selectedStopId: string, siblingLegs: TripLeg[]) {
  const steps = mode === "flight" ? 72 : mode === "road" ? 32 : 24;
  const scale = projectionScale(from, to);
  const start = project(from, scale);
  const end = project(to, scale);
  const screenDx = end[0] - start[0];
  const screenDy = end[1] - start[1];
  const distance = Math.hypot(screenDx, screenDy) || 1;
  const normalX = -screenDy / distance;
  const normalY = screenDx / distance;
  const maxBend = mode === "local" ? 0.28 : mode === "flight" ? 1.05 : 0.58;
  const bend = Math.min(distance * 0.16, maxBend) * routeBend(leg, mode);
  const control: XY = [(start[0] + end[0]) / 2 + normalX * bend, (start[1] + end[1]) / 2 + normalY * bend];
  const wiggle = mode === "road" ? 0.025 : mode === "local" ? 0.004 : 0;

  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const point = quadraticPoint(start, control, end, t);
    const inkWobble = Math.sin(Math.PI * t * 2) * wiggle;
    return unproject([point[0] + normalX * inkWobble, point[1] + normalY * inkWobble], scale);
  });
}

function routeLine(leg: TripLeg, from: [number, number], to: [number, number], mode: TransportMode, selectedStopId: string, siblingLegs: TripLeg[], lookup: Map<string, TripStop>) {
  if (mode === "local") return localDoubleCurve(leg, from, to, selectedStopId, siblingLegs, lookup) ?? routedArc(leg, from, to, mode, selectedStopId, siblingLegs);
  return routedArc(leg, from, to, mode, selectedStopId, siblingLegs);
}

export function buildRouteFeatureCollection(legs: TripLeg[], selectedStopId: string, lookup: Map<string, TripStop> = stopById): FeatureCollection<LineString, RouteProperties> {
  const features = legs.flatMap((leg) => {
    const from = lookup.get(leg.from);
    const to = lookup.get(leg.to);
    if (!from || !to) return [];

    const feature: Feature<LineString, RouteProperties> = {
      type: "Feature",
      properties: {
        id: leg.id,
        mode: leg.mode,
        label: leg.label,
        related: true,
      },
      geometry: {
        type: "LineString",
        coordinates: routeLine(leg, from.coordinates, to.coordinates, leg.mode, selectedStopId, legs, lookup),
      },
    };

    return [feature];
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

export function getVisibleStops(stops: TripStop[], selectedParent: TripStop) {
  const openingStopIds = new Set(stops.filter((stop) => stop.kind !== "hidden").map((stop) => stop.id));
  return stops.filter((stop) => openingStopIds.has(stop.id) || stop.parentId === selectedParent.id);
}

export function getVisibleLegs(legs: TripLeg[], selectedParent: TripStop) {
  return legs.filter((leg) => leg.visibleOnStart || leg.parentId === selectedParent.id);
}

export function getSelectedStopLegs(legs: TripLeg[], selectedStop: TripStop) {
  if (selectedStop.kind !== "base") {
    return legs.filter((leg) => leg.from === selectedStop.id || leg.to === selectedStop.id);
  }

  const localLegs = legs.filter((leg) => leg.parentId === selectedStop.id);
  const connectedLegs = legs.filter((leg) => leg.from === selectedStop.id || leg.to === selectedStop.id);

  return [...connectedLegs, ...localLegs].filter((leg, index, routeLegs) => routeLegs.findIndex((candidate) => candidate.id === leg.id) === index);
}
