import { describe, expect, it } from "vitest";
import { GEOCODING_PROVIDERS, buildPhotonSearchUrl, placeOptionFromPhotonFeature } from "../../src/providers/geocodingProviders";
import { ACTIVE_MAP_STYLE_PROVIDER_ID, MAP_STYLE_PROVIDERS, activeMapStyleProvider } from "../../src/providers/mapProviders";
import { PLACE_RECOMMENDATION_PROVIDER_PLACEHOLDER } from "../../src/providers/placeRecommendationProviders";

describe("provider configuration", () => {
  it("keeps CARTO Positron as the default development map provider", () => {
    expect(ACTIVE_MAP_STYLE_PROVIDER_ID).toBe("carto-positron-dev");
    expect(activeMapStyleProvider()).toEqual(MAP_STYLE_PROVIDERS["carto-positron-dev"]);
    expect(activeMapStyleProvider().styleUrl).toBe("https://basemaps.cartocdn.com/gl/positron-gl-style/style.json");
    expect(activeMapStyleProvider().projectionMode).toBe("globe");
  });

  it("keeps OpenFreeMap configured as an inactive development alternative", () => {
    expect(MAP_STYLE_PROVIDERS["openfreemap-dev"]).toMatchObject({
      id: "openfreemap-dev",
      styleUrl: "https://tiles.openfreemap.org/styles/positron",
      projectionMode: "globe",
    });
  });

  it("keeps Photon as the default development geocoder", () => {
    expect(GEOCODING_PROVIDERS["photon-dev"].id).toBe("photon-dev");
    expect(GEOCODING_PROVIDERS["photon-dev"].label).toContain("Photon");
  });

  it("keeps recommendations as an explicit future provider placeholder", () => {
    expect(PLACE_RECOMMENDATION_PROVIDER_PLACEHOLDER).toMatchObject({
      id: "future-places-recommendations",
      implemented: false,
    });
  });

  it("builds Photon general and city-only search requests", () => {
    const generalUrl = new URL(buildPhotonSearchUrl("Santiago Chile"));
    expect(generalUrl.origin + generalUrl.pathname).toBe("https://photon.komoot.io/api/");
    expect(generalUrl.searchParams.get("q")).toBe("Santiago Chile");
    expect(generalUrl.searchParams.get("limit")).toBe("8");
    expect(generalUrl.searchParams.getAll("osm_tag")).toEqual([]);

    const cityUrl = new URL(buildPhotonSearchUrl("Santiago", { cityOnly: true, limit: 5 }));
    expect(cityUrl.searchParams.get("q")).toBe("Santiago");
    expect(cityUrl.searchParams.get("limit")).toBe("5");
    expect(cityUrl.searchParams.getAll("osm_tag")).toEqual(["place:city", "place:town", "place:village", "place:municipality"]);
  });

  it("parses Photon city features with labels, coordinates, country codes, and flags", () => {
    const option = placeOptionFromPhotonFeature(
      {
        properties: {
          name: "Berlin",
          city: "Berlin",
          country: "Germany",
          countrycode: "DE",
          osm_type: "N",
          osm_id: 62422,
          osm_key: "place",
          osm_value: "city",
          type: "city",
        },
        geometry: { coordinates: [13.405, 52.52] },
      },
      0,
      true,
    );

    expect(option).toMatchObject({
      city: "Berlin",
      country: "Germany",
      countryCode: "DE",
      coordinates: [13.405, 52.52],
      inputLabel: "Berlin, Germany",
      displayLabel: "Berlin, 🇩🇪",
      source: "remote",
    });
  });

  it("parses Photon address features without losing the full address label", () => {
    const option = placeOptionFromPhotonFeature(
      {
        properties: {
          name: "Zagreb Glavni Kolodvor",
          street: "Trg kralja Tomislava",
          housenumber: "12",
          city: "Zagreb",
          postcode: "10000",
          country: "Croatia",
          countrycode: "HR",
          osm_type: "N",
          osm_id: 12345,
        },
        geometry: { coordinates: [15.978, 45.804] },
      },
      0,
    );

    expect(option).toMatchObject({
      city: "Zagreb",
      country: "Croatia",
      countryCode: "HR",
      coordinates: [15.978, 45.804],
      inputLabel: "Zagreb Glavni Kolodvor, Trg kralja Tomislava 12, 10000 Zagreb, Croatia",
      displayLabel: "Zagreb Glavni Kolodvor, Trg kralja Tomislava 12, 10000 Zagreb, Croatia",
      source: "remote",
    });
  });
});
