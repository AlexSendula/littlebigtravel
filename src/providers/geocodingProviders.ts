import { buildPlaceDisplayLabel, flagFromCountryCode } from "../domain/trip/places";
import { tripStops } from "../tripData";

export type PlaceOption = {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  coordinates?: [number, number];
  mapStopId?: string;
  inputLabel: string;
  displayLabel: string;
  citySearch: string;
  countrySearch: string;
  inputSearch: string;
  source: "local" | "remote";
};

export type PlaceSearchOptions = {
  cityOnly?: boolean;
  preferCityLabel?: boolean;
  limit?: number;
  signal?: AbortSignal;
};

export type GeocodingProvider = {
  id: "photon-dev";
  label: string;
  launchNote: string;
  searchPlaces: (searchText: string, options?: PlaceSearchOptions) => Promise<PlaceOption[]>;
};

type PhotonFeature = {
  properties?: Record<string, unknown>;
  geometry?: {
    coordinates?: unknown;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

const COUNTRY_CODE_BY_NAME: Record<string, string> = {
  Chile: "CL",
  Argentina: "AR",
  Brazil: "BR",
  Croatia: "HR",
  Netherlands: "NL",
  Belgium: "BE",
  Uruguay: "UY",
  Peru: "PE",
  Spain: "ES",
  France: "FR",
  Germany: "DE",
  Portugal: "PT",
  "United States": "US",
  UnitedStates: "US",
};

const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  AR: "Argentina",
  BE: "Belgium",
  BR: "Brazil",
  CL: "Chile",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  HR: "Croatia",
  NL: "Netherlands",
  PE: "Peru",
  PT: "Portugal",
  US: "United States",
  UY: "Uruguay",
};

const EXTRA_START_TRAVEL_PLACES: Array<{ city: string; country: string; countryCode: string; coordinates: [number, number] }> = [
  { city: "Amsterdam", country: "Netherlands", countryCode: "NL", coordinates: [4.9041, 52.3676] },
  { city: "Rotterdam", country: "Netherlands", countryCode: "NL", coordinates: [4.4777, 51.9244] },
  { city: "Utrecht", country: "Netherlands", countryCode: "NL", coordinates: [5.1214, 52.0907] },
  { city: "Brussels", country: "Belgium", countryCode: "BE", coordinates: [4.3517, 50.8503] },
  { city: "Madrid", country: "Spain", countryCode: "ES", coordinates: [-3.7038, 40.4168] },
  { city: "Lisbon", country: "Portugal", countryCode: "PT", coordinates: [-9.1393, 38.7223] },
  { city: "Paris", country: "France", countryCode: "FR", coordinates: [2.3522, 48.8566] },
  { city: "Frankfurt", country: "Germany", countryCode: "DE", coordinates: [8.6821, 50.1109] },
  { city: "Lima", country: "Peru", countryCode: "PE", coordinates: [-77.0428, -12.0464] },
  { city: "Montevideo", country: "Uruguay", countryCode: "UY", coordinates: [-56.1645, -34.9011] },
];

export function normalizePlaceSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

function buildStartTravelPlaceOptions() {
  const byKey = new Map<string, PlaceOption>();
  const pushOption = (cityRaw: string, countryRaw: string, countryCodeRaw: string, coordinates?: [number, number], mapStopId?: string) => {
    const city = cityRaw.trim();
    const country = countryRaw.trim();
    const countryCode = countryCodeRaw.trim().toUpperCase();
    if (!city || !countryCode) return;
    const citySearch = normalizePlaceSearch(city);
    const countrySearch = normalizePlaceSearch(country);
    const key = `${citySearch}-${countrySearch}`;
    if (!citySearch || byKey.has(key)) return;
    const inputLabel = `${city}, ${country}`;
    byKey.set(key, {
      id: `${key}-${countryCode.toLowerCase()}`,
      city,
      country,
      countryCode,
      coordinates,
      mapStopId,
      inputLabel,
      displayLabel: buildPlaceDisplayLabel(city, countryCode),
      citySearch,
      countrySearch,
      inputSearch: normalizePlaceSearch(inputLabel),
      source: "local",
    });
  };

  for (const stop of tripStops.filter((stop) => stop.kind === "base")) {
    const countryCode = COUNTRY_CODE_BY_NAME[stop.country];
    pushOption(stop.name, stop.country, countryCode, stop.coordinates, stop.id);
  }
  for (const place of EXTRA_START_TRAVEL_PLACES) {
    pushOption(place.city, place.country, place.countryCode, place.coordinates);
  }

  return [...byKey.values()].sort((left, right) => left.city.localeCompare(right.city));
}

export const START_TRAVEL_PLACE_OPTIONS = buildStartTravelPlaceOptions();

function textProp(properties: Record<string, unknown> | undefined, key: string) {
  const value = properties?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function stringishProp(properties: Record<string, unknown> | undefined, key: string) {
  const value = properties?.[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function uniquePlaceParts(parts: string[]) {
  const seen = new Set<string>();
  return parts.filter((part) => {
    const trimmed = part.trim();
    const key = normalizePlaceSearch(trimmed);
    if (!trimmed || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countryCodeFor(country: string, rawCountryCode: string) {
  const remoteCode = rawCountryCode.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(remoteCode)) return remoteCode;
  return COUNTRY_CODE_BY_NAME[country] ?? "";
}

function countryNameFor(country: string, countryCode: string) {
  return COUNTRY_NAME_BY_CODE[countryCode] ?? country;
}

export function stripPlaceFlagsAndTrim(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/,\s*$/, "").trim();
}

export function isCityLikePlaceQuery(input: string) {
  const cleaned = stripPlaceFlagsAndTrim(input);
  if (cleaned.length < 2 || cleaned.includes(",") || /\d/.test(cleaned)) return false;
  const lowered = cleaned.toLowerCase();
  const preciseWords = /\b(airport|aeroport|station|terminal|hotel|hostel|street|straat|st\.|avenue|ave|road|rd\.|calle|plaza|pier|harbor|harbour)\b/;
  if (preciseWords.test(lowered)) return false;
  return /^[\p{L}\s'.-]+$/u.test(cleaned) && cleaned.trim().split(/\s+/).length <= 3;
}

function isCityFeature(properties: Record<string, unknown> | undefined) {
  const type = textProp(properties, "type");
  const osmKey = textProp(properties, "osm_key");
  const osmValue = textProp(properties, "osm_value");
  return type === "city" || (osmKey === "place" && ["city", "town", "village", "municipality", "hamlet", "locality"].includes(osmValue));
}

export function placeOptionFromPhotonFeature(feature: PhotonFeature, index: number, preferCityLabel = false): PlaceOption | undefined {
  const properties = feature.properties;
  const name = textProp(properties, "name");
  const street = textProp(properties, "street");
  const houseNumber = textProp(properties, "housenumber");
  const city =
    textProp(properties, "city") ||
    textProp(properties, "town") ||
    textProp(properties, "village") ||
    textProp(properties, "municipality") ||
    textProp(properties, "county") ||
    textProp(properties, "state");
  const country = textProp(properties, "country");
  const postcode = textProp(properties, "postcode");
  const countryCode = countryCodeFor(country, textProp(properties, "countrycode"));
  const displayCountry = countryNameFor(country, countryCode);
  const streetLine = street ? `${street}${houseNumber ? ` ${houseNumber}` : ""}` : "";
  const primary = name || streetLine || city;
  const locality = postcode && city ? `${postcode} ${city}` : city;
  const cityLabel = uniquePlaceParts([name || city, displayCountry]).join(", ");
  const inputLabel = preferCityLabel && isCityFeature(properties) && cityLabel ? cityLabel : uniquePlaceParts([primary, name && streetLine ? streetLine : "", locality, displayCountry]).join(", ");
  const inputSearch = normalizePlaceSearch(inputLabel);
  const coordinates =
    Array.isArray(feature.geometry?.coordinates) &&
    feature.geometry.coordinates.length >= 2 &&
    typeof feature.geometry.coordinates[0] === "number" &&
    typeof feature.geometry.coordinates[1] === "number"
      ? ([feature.geometry.coordinates[0], feature.geometry.coordinates[1]] as [number, number])
      : undefined;

  if (!inputLabel || !inputSearch) return undefined;

  const sourceId = uniquePlaceParts([stringishProp(properties, "osm_type"), stringishProp(properties, "osm_id"), inputSearch]).join("-");
  return {
    id: `remote-${sourceId || index}`,
    city: city || primary,
    country: displayCountry,
    countryCode,
    coordinates,
    inputLabel,
    displayLabel: city && countryCode && inputSearch === normalizePlaceSearch(`${city}, ${displayCountry}`) ? buildPlaceDisplayLabel(city, countryCode) : inputLabel,
    citySearch: normalizePlaceSearch(city || primary),
    countrySearch: normalizePlaceSearch(country),
    inputSearch,
    source: "remote",
  };
}

export function mergePlaceOptions(primary: PlaceOption[], fallback: PlaceOption[], limit = 8) {
  const bySearch = new Map<string, PlaceOption>();
  for (const option of [...primary, ...fallback]) {
    if (!option.inputSearch || bySearch.has(option.inputSearch)) continue;
    bySearch.set(option.inputSearch, option);
    if (bySearch.size >= limit) break;
  }
  return [...bySearch.values()];
}

export function buildPhotonSearchUrl(searchText: string, options: Pick<PlaceSearchOptions, "cityOnly" | "limit"> = {}) {
  const params = new URLSearchParams({ q: searchText, limit: String(options.limit ?? 8) });
  if (options.cityOnly) {
    params.append("osm_tag", "place:city");
    params.append("osm_tag", "place:town");
    params.append("osm_tag", "place:village");
    params.append("osm_tag", "place:municipality");
  }
  return `https://photon.komoot.io/api/?${params.toString()}`;
}

export function likelyCityMatches(options: PlaceOption[], searchText: string) {
  const query = normalizePlaceSearch(searchText);
  return options.filter((option) => option.citySearch.includes(query) || option.inputSearch.includes(query));
}

async function searchPhotonPlaces(searchText: string, options: PlaceSearchOptions = {}) {
  const response = await fetch(buildPhotonSearchUrl(searchText, options), { signal: options.signal });
  if (!response.ok) return [];
  const payload = (await response.json()) as PhotonResponse;
  return (payload.features ?? [])
    .map((feature, index) => placeOptionFromPhotonFeature(feature, index, options.preferCityLabel))
    .filter((option): option is PlaceOption => Boolean(option));
}

export const PHOTON_GEOCODING_PROVIDER: GeocodingProvider = {
  id: "photon-dev",
  label: "Photon development geocoder",
  launchNote: "Current no-key development geocoder. Commercial launch suitability and traffic limits must be reviewed before production use.",
  searchPlaces: searchPhotonPlaces,
};

export const ACTIVE_GEOCODING_PROVIDER_ID: GeocodingProvider["id"] = "photon-dev";

export const GEOCODING_PROVIDERS: Record<GeocodingProvider["id"], GeocodingProvider> = {
  "photon-dev": PHOTON_GEOCODING_PROVIDER,
};

export function activeGeocodingProvider() {
  return GEOCODING_PROVIDERS[ACTIVE_GEOCODING_PROVIDER_ID];
}

export function findKnownPlace(input: string) {
  const cleaned = stripPlaceFlagsAndTrim(input);
  if (!cleaned) return undefined;
  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const inputSearch = normalizePlaceSearch(cleaned);
  const firstPartSearch = normalizePlaceSearch(parts[0] ?? "");
  const secondPartSearch = normalizePlaceSearch(parts[1] ?? "");
  return START_TRAVEL_PLACE_OPTIONS.find((option) => {
    if (inputSearch === option.inputSearch) return true;
    if (parts.length === 1 && firstPartSearch === option.citySearch) return true;
    if (parts.length === 2 && firstPartSearch === option.citySearch && secondPartSearch === option.countrySearch) return true;
    return false;
  });
}

export function normalizePlaceInput(input: string) {
  const cleaned = stripPlaceFlagsAndTrim(input);
  if (!cleaned) return "";
  const matched = findKnownPlace(cleaned);
  return matched ? matched.inputLabel : cleaned;
}

export function formatPlaceForDisplay(input: string) {
  const normalized = normalizePlaceInput(input);
  if (!normalized) return "";
  const matched = findKnownPlace(normalized);
  return matched ? matched.displayLabel : normalized;
}

export function formatRoutePlaceForDisplay(input: string, countryCode?: string, country?: string) {
  const normalized = normalizePlaceInput(input);
  if (!normalized) return "";
  const matched = findKnownPlace(normalized);
  if (matched) return matched.displayLabel;

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const city = parts[0] || normalized;
  const resolvedCountryCode = countryCode ?? (country ? COUNTRY_CODE_BY_NAME[country] : undefined) ?? (parts[1] ? COUNTRY_CODE_BY_NAME[parts[1]] : undefined);
  const flag = resolvedCountryCode ? flagFromCountryCode(resolvedCountryCode) : "";
  return flag ? `${city}, ${flag}` : normalized;
}

export function shortPlaceLabel(input: string) {
  const normalized = normalizePlaceInput(input).trim();
  if (!normalized) return "";
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return normalized;
  if (parts[0].length >= 3 || parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[1]}`;
}
