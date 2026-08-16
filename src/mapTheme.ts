import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl";

export const ROUTE_SOURCE_ID = "trip-routes";

export const ROUTE_LAYER_IDS = {
  shadow: "trip-route-shadow",
  bus: "trip-route-bus",
  flight: "trip-route-flight",
  road: "trip-route-road",
  local: "trip-route-local",
};

const ink = "#24221f";
const paper = "#f4f1e8";
const water = "#dfe6e4";
const routeInk = "#6f99a4";

function safeSetPaint(map: MapLibreMap, layerId: string, property: string, value: unknown) {
  try {
    map.setPaintProperty(layerId, property, value);
  } catch {
    // Third-party style layers vary by version; unsupported paint props are simply skipped.
  }
}

function safeSetLayout(map: MapLibreMap, layerId: string, property: string, value: unknown) {
  try {
    map.setLayoutProperty(layerId, property, value);
  } catch {
    // See note above. The custom trip layers do not depend on these optional tweaks.
  }
}

function layerId(layer: LayerSpecification) {
  return layer.id.toLowerCase();
}

function isRoad(id: string) {
  return id.includes("road") || id.includes("bridge") || id.includes("tunnel");
}

function isNoisySymbol(id: string) {
  return id.includes("poi") || id.includes("housenumber") || id.includes("transit") || id.includes("airport") || id.includes("building");
}

function isPlaceLabel(id: string) {
  return id.includes("place") || id.includes("settlement");
}

function isRoadLabel(id: string) {
  return id.includes("road") && (id.includes("label") || id.includes("name"));
}

export function applyExplorationBasemapStyle(map: MapLibreMap) {
  const layers = map.getStyle().layers ?? [];

  layers.forEach((layer) => {
    const id = layerId(layer);

    if (layer.type === "background") {
      safeSetPaint(map, layer.id, "background-color", paper);
    }

    if (layer.type === "fill") {
      if (id.includes("water")) {
        safeSetPaint(map, layer.id, "fill-color", water);
        safeSetPaint(map, layer.id, "fill-opacity", ["interpolate", ["linear"], ["zoom"], 2, 0.62, 8, 0.82, 13, 0.95]);
        return;
      }

      if (id.includes("park") || id.includes("landcover") || id.includes("wood") || id.includes("grass")) {
        safeSetPaint(map, layer.id, "fill-color", "#e6e2d8");
        safeSetPaint(map, layer.id, "fill-opacity", ["interpolate", ["linear"], ["zoom"], 3, 0.05, 7, 0.18, 12, 0.32]);
        return;
      }

      safeSetPaint(map, layer.id, "fill-color", paper);
      safeSetPaint(map, layer.id, "fill-opacity", ["interpolate", ["linear"], ["zoom"], 2, 0.9, 12, 1]);
    }

    if (layer.type === "line") {
      if (id.includes("boundary")) {
        safeSetPaint(map, layer.id, "line-color", "#292724");
        safeSetPaint(map, layer.id, "line-width", ["interpolate", ["linear"], ["zoom"], 2, 0.25, 6, 0.55, 10, 0.9]);
        safeSetPaint(map, layer.id, "line-opacity", ["interpolate", ["linear"], ["zoom"], 2, 0.16, 5, 0.28, 9, 0.45]);
        return;
      }

      if (id.includes("waterway")) {
        safeSetPaint(map, layer.id, "line-color", "#aebcba");
        safeSetPaint(map, layer.id, "line-opacity", ["interpolate", ["linear"], ["zoom"], 4, 0, 8, 0.28, 12, 0.48]);
        return;
      }

      if (isRoad(id)) {
        safeSetPaint(map, layer.id, "line-color", "#6f6a61");
        safeSetPaint(map, layer.id, "line-opacity", ["interpolate", ["linear"], ["zoom"], 4, 0, 6, 0.08, 9, 0.2, 13, 0.44]);
        safeSetPaint(map, layer.id, "line-width", ["interpolate", ["linear"], ["zoom"], 5, 0.15, 9, 0.45, 13, 1.6]);
        return;
      }

      safeSetPaint(map, layer.id, "line-color", "#8a867d");
      safeSetPaint(map, layer.id, "line-opacity", ["interpolate", ["linear"], ["zoom"], 3, 0.05, 9, 0.22]);
    }

    if (layer.type === "symbol") {
      safeSetPaint(map, layer.id, "text-color", "#3b3832");
      safeSetPaint(map, layer.id, "text-halo-color", "#f7f4ea");
      safeSetPaint(map, layer.id, "text-halo-width", 1.1);
      safeSetPaint(map, layer.id, "icon-opacity", ["interpolate", ["linear"], ["zoom"], 5, 0, 12, 0.22]);

      if (isNoisySymbol(id)) {
        safeSetLayout(map, layer.id, "visibility", "none");
        return;
      }

      if (id.includes("country")) {
        safeSetPaint(map, layer.id, "text-opacity", ["interpolate", ["linear"], ["zoom"], 2, 0.26, 4, 0.5, 7, 0.68]);
        return;
      }

      if (isRoadLabel(id)) {
        safeSetPaint(map, layer.id, "text-opacity", ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 0.18, 14, 0.54]);
        return;
      }

      if (isPlaceLabel(id)) {
        safeSetPaint(map, layer.id, "text-opacity", ["interpolate", ["linear"], ["zoom"], 3.6, 0, 5, 0.24, 7, 0.58, 11, 0.78]);
        return;
      }

      safeSetPaint(map, layer.id, "text-opacity", ["interpolate", ["linear"], ["zoom"], 5, 0, 10, 0.42]);
    }
  });
}

export function firstSymbolLayerId(map: MapLibreMap) {
  return map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
}

export function addTripRouteLayers(map: MapLibreMap) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  const beforeId = firstSymbolLayerId(map);

  if (!map.getLayer(ROUTE_LAYER_IDS.shadow)) {
    map.addLayer(
      {
        id: ROUTE_LAYER_IDS.shadow,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ink,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.4, 0.22, 6, 0.26, 10, 0.2],
          "line-width": ["interpolate", ["linear"], ["zoom"], 2.4, 3.2, 7, 4.4, 12, 6.4],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 2, 1.4, 9, 2.2],
        },
      },
      beforeId,
    );
  }

  const routeLayers: Array<{ id: string; mode: string; color: string; dash: number[]; opacity: number[] }> = [
    // Keep one cohesive route palette so the map reads as a single hand-drawn
    // system; mode differences come from rhythm/opacity instead of unrelated hues.
    // Long-haul links (Santiago/Mendoza/Buenos Aires leg) get a solid accent line
    // so base-city travel reads as the primary trunk over local excursions.
    { id: ROUTE_LAYER_IDS.flight, mode: "flight", color: "#b89a5a", dash: [1, 0], opacity: [0.84, 0.93, 0.86] },
    { id: ROUTE_LAYER_IDS.bus, mode: "bus", color: routeInk, dash: [1, 0], opacity: [0.9, 0.98, 0.9] },
    { id: ROUTE_LAYER_IDS.road, mode: "road", color: "#6f9490", dash: [0.45, 1.05], opacity: [0.86, 0.94, 0.88] },
    { id: ROUTE_LAYER_IDS.local, mode: "local", color: "#6ea0a1", dash: [1, 1.4], opacity: [0, 0.76, 0.9] },
  ];

  routeLayers.forEach((routeLayer) => {
    if (map.getLayer(routeLayer.id)) return;

    map.addLayer(
      {
        id: routeLayer.id,
        type: "line",
        source: ROUTE_SOURCE_ID,
        filter: ["==", ["get", "mode"], routeLayer.mode],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": routeLayer.color,
          "line-opacity":
            routeLayer.mode === "local"
              ? ["interpolate", ["linear"], ["zoom"], 2.4, 0, 6.6, 0, 7.6, routeLayer.opacity[1], 11, routeLayer.opacity[2]]
              : ["interpolate", ["linear"], ["zoom"], 2.4, routeLayer.opacity[0], 6, routeLayer.opacity[1], 11, routeLayer.opacity[2]],
          "line-width": ["interpolate", ["linear"], ["zoom"], 2.4, 3, 8, 4.2, 12, 5.4],
          "line-dasharray": routeLayer.dash,
        },
      },
      beforeId,
    );
  });
}
