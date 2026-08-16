export type MapProjectionMode = "globe" | "mercator";

export type MapStyleProvider = {
  id: "carto-positron-dev" | "openfreemap-dev";
  label: string;
  styleUrl: string;
  attributionLabel: string;
  projectionMode: MapProjectionMode;
  launchNote: string;
};

export const MAP_STYLE_PROVIDERS: Record<MapStyleProvider["id"], MapStyleProvider> = {
  "carto-positron-dev": {
    id: "carto-positron-dev",
    label: "CARTO Positron development basemap",
    styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    attributionLabel: "CARTO Positron",
    projectionMode: "globe",
    launchNote: "Current development default. Commercial launch licensing must be reviewed before production use.",
  },
  "openfreemap-dev": {
    id: "openfreemap-dev",
    label: "OpenFreeMap Positron development basemap",
    styleUrl: "https://tiles.openfreemap.org/styles/positron",
    attributionLabel: "OpenFreeMap / OpenMapTiles / OpenStreetMap",
    projectionMode: "globe",
    launchNote: "Configured for later visual testing. Not active by default.",
  },
};

export const ACTIVE_MAP_STYLE_PROVIDER_ID: MapStyleProvider["id"] = "carto-positron-dev";

export function activeMapStyleProvider() {
  return MAP_STYLE_PROVIDERS[ACTIVE_MAP_STYLE_PROVIDER_ID];
}

