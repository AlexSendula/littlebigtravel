import { describe, expect, it } from "vitest";
import { TBD_ARRIVAL_SORT_TIME, TBD_CHECK_IN_SORT_TIME, TBD_CHECK_OUT_SORT_TIME, TBD_DEPARTURE_SORT_TIME } from "../../src/domain/trip/time";

describe("generated timeline default times", () => {
  it("keeps unknown arrival before stay moments and unknown departure after them", () => {
    expect(TBD_ARRIVAL_SORT_TIME.localeCompare(TBD_CHECK_OUT_SORT_TIME)).toBeLessThan(0);
    expect(TBD_CHECK_OUT_SORT_TIME.localeCompare(TBD_CHECK_IN_SORT_TIME)).toBeLessThan(0);
    expect(TBD_CHECK_IN_SORT_TIME.localeCompare(TBD_DEPARTURE_SORT_TIME)).toBeLessThan(0);
  });
});
