import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fitTrip, planSelectedStopCamera } from "./mapCamera";
import { buildRouteFeatureCollection, getSelectedStopLegs, getVisibleStops, SOUTH_CONE_CENTER } from "./mapGeometry";
import { type ManagedStopMarker, syncMapMarkers } from "./mapMarkers";
import { routeDataSignature } from "./mapRoutes";
import { addTripRouteLayers, applyExplorationBasemapStyle, ROUTE_SOURCE_ID } from "./mapTheme";
import { incrementPerformanceCounter, measureSyncPerformance, recordPerformanceTiming, useRenderMetric } from "./performance/perfMetrics";
import { activeMapStyleProvider } from "./providers/mapProviders";
import { type TripLeg, type TripStop } from "./tripData";

type ZoomBand = "zoom-out" | "zoom-mid" | "zoom-in";

type TravelMapProps = {
  stops: TripStop[];
  legs: TripLeg[];
  stopById: Map<string, TripStop>;
  selectedStop?: TripStop;
  onSelectStop: (stop: TripStop) => void;
};

function zoomBandFor(zoom: number): ZoomBand {
  if (zoom < 5.2) return "zoom-out";
  if (zoom < 8.6) return "zoom-mid";
  return "zoom-in";
}

function updateRouteSource(map: MapLibreMap, data: ReturnType<typeof buildRouteFeatureCollection>) {
  const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return false;

  incrementPerformanceCounter("map.route.setData");
  measureSyncPerformance("map.route.setData", () => source.setData(data));
  return true;
}

export default function TravelMap({ stops, legs, stopById, selectedStop, onSelectStop }: TravelMapProps) {
  useRenderMetric("map-shell");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, ManagedStopMarker>>(new Map());
  const onSelectStopRef = useRef(onSelectStop);
  const routeSignatureRef = useRef("");
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const lastCameraKeyRef = useRef("");
  const skippedInitialFocusRef = useRef(false);
  const previousStopRef = useRef<TripStop | null>(null);
  const transitionTokenRef = useRef(0);
  const zoomBandRef = useRef<ZoomBand>("zoom-out");
  const [ready, setReady] = useState(false);
  const [zoomBand, setZoomBand] = useState<ZoomBand>("zoom-out");

  const selectedParent = selectedStop?.parentId ? stopById.get(selectedStop.parentId) ?? selectedStop : selectedStop;
  const visibleStops = useMemo(
    () => (selectedParent ? getVisibleStops(stops, selectedParent) : stops.filter((stop) => stop.kind !== "hidden")),
    [selectedParent, stops],
  );
  const visibleLegs = useMemo(
    () => (selectedStop ? getSelectedStopLegs(legs, selectedStop) : legs),
    [legs, selectedStop],
  );
  const routeSignature = useMemo(
    () => routeDataSignature(visibleLegs, selectedStop?.id ?? "", stopById),
    [selectedStop?.id, stopById, visibleLegs],
  );
  const routeData = useMemo(
    () => measureSyncPerformance("map.route.build", () => buildRouteFeatureCollection(visibleLegs, selectedStop?.id ?? "", stopById)),
    [selectedStop?.id, stopById, visibleLegs],
  );

  useEffect(() => {
    onSelectStopRef.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const container = containerRef.current;
    const mapInitStartedAt = window.performance.now();
    const mapProvider = activeMapStyleProvider();
    const map = measureSyncPerformance("map.create", () => new maplibregl.Map({
      container,
      style: mapProvider.styleUrl,
      center: SOUTH_CONE_CENTER,
      zoom: 3.35,
      minZoom: 2.35,
      maxZoom: 14.2,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: Math.min(window.devicePixelRatio, 1.45),
      refreshExpiredTiles: false,
      renderWorldCopies: false,
    }));

    mapRef.current = map;

    map.on("load", () => {
      recordPerformanceTiming("map.initToLoad", window.performance.now() - mapInitStartedAt);
      measureSyncPerformance("map.load.handler", () => {
        // Keep one continuous globe projection. Switching to Mercator mid-zoom is cheaper,
        // but it creates a visible snap and occasional tile gaps on this game-map surface.
        map.setProjection({ type: mapProvider.projectionMode });
        // The basemap starts from real vector tiles, then gets desaturated and zoom-thinned
        // so it reads like an exploration-game map without losing road/detail usefulness.
        measureSyncPerformance("map.basemap.style", () => applyExplorationBasemapStyle(map));
        measureSyncPerformance("map.route.layers", () => addTripRouteLayers(map));
        setReady(true);
        zoomBandRef.current = zoomBandFor(map.getZoom());
        setZoomBand(zoomBandRef.current);
        incrementPerformanceCounter("map.camera.fit");
        fitTrip(map, stops, 0);
      });
    });

    const updateZoomBand = () => {
      const nextBand = zoomBandFor(map.getZoom());
      if (nextBand !== zoomBandRef.current) {
        zoomBandRef.current = nextBand;
        setZoomBand(nextBand);
      }
    };

    map.on("zoom", updateZoomBand);

    const resizeMap = () => {
      if (resizeAnimationFrameRef.current !== null) return;

      resizeAnimationFrameRef.current = window.requestAnimationFrame(() => {
        resizeAnimationFrameRef.current = null;
        incrementPerformanceCounter("map.resize");
        map.resize();
      });
    };
    const resizeObserver = new ResizeObserver(resizeMap);
    resizeObserver.observe(containerRef.current);
    window.visualViewport?.addEventListener("resize", resizeMap);
    window.addEventListener("resize", resizeMap);
    const immediateResizeTimer = window.setTimeout(resizeMap, 0);
    const settledResizeTimer = window.setTimeout(resizeMap, 250);

    return () => {
      window.clearTimeout(immediateResizeTimer);
      window.clearTimeout(settledResizeTimer);
      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
        resizeAnimationFrameRef.current = null;
      }
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", resizeMap);
      window.removeEventListener("resize", resizeMap);
      map.off("zoom", updateZoomBand);
      markersRef.current.forEach((record) => record.marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (routeSignatureRef.current === routeSignature) return;
    if (updateRouteSource(map, routeData)) routeSignatureRef.current = routeSignature;
  }, [ready, routeData, routeSignature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    syncMapMarkers({
      map,
      markers: markersRef.current,
      onSelectStopRef,
      selectedStopId: selectedStop?.id,
      visibleStops,
    });
  }, [ready, selectedStop?.id, visibleStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedStop) {
      if (map && ready) {
        const fitKey = `fit:${stops.map((stop) => `${stop.id}:${stop.coordinates.join(",")}`).join("|")}`;
        if (lastCameraKeyRef.current !== fitKey) {
          lastCameraKeyRef.current = fitKey;
          incrementPerformanceCounter("map.camera.fit");
          fitTrip(map, stops, 520);
        }
      }
      return;
    }

    if (!skippedInitialFocusRef.current) {
      skippedInitialFocusRef.current = true;
      previousStopRef.current = selectedStop;
      incrementPerformanceCounter("map.camera.fit");
      fitTrip(map, stops, 420);
      return;
    }

    const cameraPlan = planSelectedStopCamera({
      map,
      previousStop: previousStopRef.current,
      selectedStop,
      stopById,
    });
    previousStopRef.current = selectedStop;
    if (lastCameraKeyRef.current === cameraPlan.key) return;
    lastCameraKeyRef.current = cameraPlan.key;

    const transitionToken = transitionTokenRef.current + 1;
    transitionTokenRef.current = transitionToken;
    map.stop();
    incrementPerformanceCounter("map.camera.transition");

    if (cameraPlan.kind === "pivot") {
      map.easeTo({
        center: cameraPlan.pivot.center,
        zoom: cameraPlan.pivot.zoom,
        duration: cameraPlan.pivot.duration,
        essential: true,
      });

      map.once("moveend", () => {
        if (transitionTokenRef.current !== transitionToken) return;
        map.flyTo({
          center: cameraPlan.final.center,
          zoom: cameraPlan.final.zoom,
          offset: cameraPlan.final.offset,
          duration: cameraPlan.final.duration,
          curve: cameraPlan.final.curve,
          minZoom: cameraPlan.final.minZoom,
          essential: true,
        });
      });
      return;
    }

    if (cameraPlan.kind === "fly") {
      // Smooth long-hop flight with an explicit low midpoint zoom so users
      // perceive a fast zoom-out/in without the choppy two-step handoff.
      map.flyTo({
        center: cameraPlan.step.center,
        zoom: cameraPlan.step.zoom,
        offset: cameraPlan.step.offset,
        duration: cameraPlan.step.duration,
        curve: cameraPlan.step.curve,
        minZoom: cameraPlan.step.minZoom,
        essential: true,
      });
      return;
    }

    map.easeTo({
      center: cameraPlan.step.center,
      zoom: cameraPlan.step.zoom,
      offset: cameraPlan.step.offset,
      duration: cameraPlan.step.duration,
      essential: true,
    });
  }, [ready, selectedStop, stopById, stops]);

  return (
    <section className={`map-stage ${zoomBand} ${ready ? "ready" : ""}`} aria-label="Interactive Patagonia trip map">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-grain" aria-hidden="true" />
      <div className="map-vignette" aria-hidden="true" />
    </section>
  );
}
