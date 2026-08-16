import { describe, expect, it } from "vitest";
import {
  allLinkedItemsVisible,
  hideAutoLinkedKey,
  hiddenAutoLinkedKeys,
  linkedItemVisible,
  toggleAutoLinkedVisibility,
} from "../../src/domain/trip/generatedItems";
import { startingTravel, stayItem } from "../fixtures/plannerFixtures";

describe("generated linked item visibility", () => {
  it("hides one generated transport moment without deleting or disabling the source route", () => {
    const source = startingTravel();
    const hidden = hideAutoLinkedKey(source, "arrival");

    expect(hidden.id).toBe(source.id);
    expect(hidden.autoLinkedItemsEnabled).toBe(true);
    expect(linkedItemVisible(hidden, "arrival")).toBe(false);
    expect(linkedItemVisible(hidden, "departure")).toBe(true);
    expect([...hiddenAutoLinkedKeys(hidden)]).toEqual(["arrival"]);
  });

  it("can hide stay check-in and check-out independently", () => {
    const stay = stayItem();
    const withoutCheckIn = hideAutoLinkedKey(stay, "check-in");

    expect(linkedItemVisible(withoutCheckIn, "check-in")).toBe(false);
    expect(linkedItemVisible(withoutCheckIn, "check-out")).toBe(true);

    const withoutBoth = hideAutoLinkedKey(withoutCheckIn, "check-out");
    expect(linkedItemVisible(withoutBoth, "check-in")).toBe(false);
    expect(linkedItemVisible(withoutBoth, "check-out")).toBe(false);
  });

  it("toggles all generated moments off and back on", () => {
    const visible = startingTravel();
    const disabled = toggleAutoLinkedVisibility(visible);

    expect(allLinkedItemsVisible(visible)).toBe(true);
    expect(disabled.autoLinkedItemsEnabled).toBe(false);
    expect(linkedItemVisible(disabled, "arrival")).toBe(false);

    const enabled = toggleAutoLinkedVisibility(disabled);
    expect(enabled.autoLinkedItemsEnabled).toBe(true);
    expect(enabled.hiddenAutoLinkedItems).toBeUndefined();
    expect(allLinkedItemsVisible(enabled)).toBe(true);
  });
});
