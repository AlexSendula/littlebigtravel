import { describe, expect, it } from "vitest";
import { buildPlaceDisplayLabel, flagFromCountryCode, normalizePlaceKey } from "../../src/domain/trip/places";

describe("place formatting", () => {
  it("uses flag emoji for common country codes", () => {
    expect(buildPlaceDisplayLabel("Berlin", "DE")).toBe("Berlin, 🇩🇪");
    expect(buildPlaceDisplayLabel("Zagreb", "HR")).toBe("Zagreb, 🇭🇷");
  });

  it("falls back safely for invalid country codes", () => {
    expect(flagFromCountryCode("Germany")).toBe("");
    expect(buildPlaceDisplayLabel("Unknown", "")).toBe("Unknown");
  });

  it("normalizes labels without flags or country tails", () => {
    expect(normalizePlaceKey("Santiago, 🇨🇱")).toBe("santiago");
    expect(normalizePlaceKey("Berlin, Germany")).toBe("berlin");
  });
});
