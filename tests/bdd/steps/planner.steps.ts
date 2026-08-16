import { Given, Then, When } from "@cucumber/cucumber";
import { expect, type Locator } from "@playwright/test";
import { activityItem, customBase, startingTravel } from "../../fixtures/plannerFixtures";
import {
  choosePlace,
  openPlanner,
  openStartingTravelEditor,
  swipeLeft,
} from "../support/actions";
import { readActivePlanner, seedActiveTrip, type TravelWorld } from "../support/world";

function santiagoPlanner() {
  return {
    items: [startingTravel()],
    customBases: [customBase({ id: "custom:santiago", baseName: "Santiago, Chile", startDate: "2026-04-30", endDate: "2026-05-02" })],
  };
}

function daySwipe(world: TravelWorld, baseId: string, iso: string): Locator {
  return world.page.getByTestId(`swipe-day-${baseId}-${iso}`);
}

async function closeEditorByBackdrop(world: TravelWorld) {
  const backdrop = world.page.locator(".planner-editor-backdrop");
  if (!(await backdrop.isVisible().catch(() => false))) return;
  await backdrop.click({ position: { x: 8, y: 8 } });
  await expect(world.page.locator(".planner-editor")).toBeHidden();
}

async function addStartingTravel(world: TravelWorld, from: string, to: string) {
  await world.page.getByLabel("Add starting travel").click();
  await expect(world.page.getByRole("heading", { name: "Starting Travel" })).toBeVisible();

  const fromOption = from === "Amsterdam" ? "Amsterdam, Netherlands" : from;
  const toOption = to === "Santiago" ? "Santiago, Chile" : to;
  await choosePlace(world.page, /Home, airport, station/, from, fromOption);
  await choosePlace(world.page, /First destination/, to, toOption);

  await world.page.locator(".planner-date-range .planner-date-trigger").first().click();
  await world.page.getByRole("button", { name: "Today" }).click();

  await closeEditorByBackdrop(world);
}

Given("I have starting travel from {string} to {string}", async function (this: TravelWorld, from: string, to: string) {
  const baseName = to === "Santiago" ? "Santiago, Chile" : `${to}, Argentina`;
  const baseId = to === "Santiago" ? "custom:santiago" : `custom:${to.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  await seedActiveTrip(this, "Planner Test", {
    items: [
      startingTravel({
        fromLabel: from === "Amsterdam" ? "Amsterdam, Netherlands" : from,
        toLabel: baseName,
        toBaseId: baseId,
        destinationId: to.toLowerCase(),
      }),
    ],
    customBases: [customBase({ id: baseId, baseName, startDate: "2026-04-30", endDate: "2026-05-02" })],
  });
  await openPlanner(this);
});

Given("I have a Santiago base trip", async function (this: TravelWorld) {
  await seedActiveTrip(this, "Planner Test", santiagoPlanner());
  await openPlanner(this);
});

Given("I have a Santiago base trip with an empty day and a planned day", async function (this: TravelWorld) {
  await seedActiveTrip(this, "Planner Test", {
    items: [
      activityItem({
        id: "item:planned",
        title: "Planned Activity",
        startDate: "2026-05-02",
        baseId: "custom:santiago",
        baseName: "Santiago, Chile",
        showOnMap: false,
      }),
    ],
    customBases: [
      customBase({
        id: "custom:santiago",
        baseName: "Santiago, Chile",
        startDate: "2026-05-01",
        endDate: "2026-05-02",
        dayRanges: [
          { id: "range:empty", startDate: "2026-05-01", dayDisplayMode: "daily" },
          { id: "range:planned", startDate: "2026-05-02", dayDisplayMode: "daily" },
        ],
      }),
    ],
  });
  await openPlanner(this);
});

When("I open the trip planner", async function (this: TravelWorld) {
  await openPlanner(this);
});

When("I add starting travel from {string} to {string}", async function (this: TravelWorld, from: string, to: string) {
  await addStartingTravel(this, from, to);
});

When("I edit the starting travel destination to {string}", async function (this: TravelWorld, destination: string) {
  await openStartingTravelEditor(this.page);
  const destinationInput = this.page.getByPlaceholder(/First destination/);
  await destinationInput.fill("");
  await destinationInput.fill(destination.slice(0, 2));
  await destinationInput.fill(destination);
  await this.page.getByRole("option", { name: `${destination}, Argentina` }).click();
  await closeEditorByBackdrop(this);
});

When("I hide the generated arrival item", async function (this: TravelWorld) {
  await swipeLeft(this.page, this.page.getByTestId("swipe-linked-arrival-item:start"));
  await expect(this.page.locator(".planner-v2-row", { hasText: "Arrive at Santiago" })).toHaveCount(0);
});

When("I enable linked items again", async function (this: TravelWorld) {
  await openStartingTravelEditor(this.page);
  await this.page.getByTestId("linked-items-toggle").click();
  await closeEditorByBackdrop(this);
});

When("I add an activity named {string} with place {string}", async function (this: TravelWorld, title: string, place: string) {
  await this.page.getByLabel(/Add on 30 Apr/i).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(this.page.getByRole("heading", { name: "New Activity" })).toBeVisible();
  await this.page.locator('input[name="lbt-activity-title"]').fill(title);
  await choosePlace(this.page, /Museum, trailhead, restaurant/, place, `${place}, Argentina`);
});

When("I enable show on map for the activity", async function (this: TravelWorld) {
  await this.page.getByTestId("activity-show-map-toggle").click();
});

When("I add a stay at {string}", async function (this: TravelWorld, place: string) {
  await this.page.getByText("Add where you stay").click();
  await expect(this.page.getByRole("heading", { name: "New Stay" })).toBeVisible();
  await this.page.getByPlaceholder(/Hotel, hostel, campsite/).fill(place);
  await closeEditorByBackdrop(this);
});

When("I delete the empty day", async function (this: TravelWorld) {
  await swipeLeft(this.page, daySwipe(this, "custom:santiago", "2026-05-01"));
});

When("I delete the planned day", async function (this: TravelWorld) {
  await swipeLeft(this.page, daySwipe(this, "custom:santiago", "2026-05-02"));
});

When("I open a new departure editor", async function (this: TravelWorld) {
  await this.page.getByText(/^Add departure$/).click();
  await expect(this.page.getByRole("heading", { name: "New Departure" })).toBeVisible();
});

When("I select a departure date from the picker", async function (this: TravelWorld) {
  await this.page.locator(".planner-date-range .planner-date-trigger").first().click();
  await expect(this.page.getByRole("dialog", { name: "Date range picker" })).toBeVisible();
  await this.page.locator('[data-date-iso="2026-05-03"]').click();
  await this.page.locator('[data-date-iso="2026-05-04"]').click();
});

When("I select a departure time from the picker", async function (this: TravelWorld) {
  await this.page.locator(".planner-field", { hasText: "Departure Time" }).locator(".planner-time-trigger").click();
  await expect(this.page.getByRole("dialog", { name: "Time picker" })).toBeVisible();
  await this.page.locator('[data-time-column="hour"][data-loop-copy="1"][data-time-value="12"]').click();
  await this.page.locator('[data-time-column="minute"][data-loop-copy="1"][data-time-value="15"]').click();
});

Then("the planner shows one starting travel", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-starting-travel .planner-v2-row")).toHaveCount(1);
});

Then("the planner shows one base city named {string}", async function (this: TravelWorld, name: string) {
  await expect(this.page.locator(".planner-v2-section-identity h3", { hasText: name })).toHaveCount(1);
});

Then("the planner shows one arrival item named {string}", async function (this: TravelWorld, name: string) {
  await expect(this.page.locator(".planner-v2-row", { hasText: name })).toHaveCount(1);
});

Then("the planner does not show partial base cities", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-section-identity h3", { hasText: /^M$/ })).toHaveCount(0);
  await expect(this.page.locator(".planner-v2-section-identity h3", { hasText: /^Me$/ })).toHaveCount(0);
  await expect(this.page.locator(".planner-v2-section-identity h3", { hasText: /^Men$/ })).toHaveCount(0);
});

Then("the generated arrival item is not shown", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-row", { hasText: "Arrive at Santiago" })).toHaveCount(0);
});

Then("the generated arrival item is shown", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-row", { hasText: "Arrive at Santiago" })).toHaveCount(1);
});

Then("the activity editor shows the map option", async function (this: TravelWorld) {
  await expect(this.page.getByTestId("activity-show-map-toggle")).toBeVisible();
});

Then("the active planner has a mappable activity named {string}", async function (this: TravelWorld, title: string) {
  const activity = await expect
    .poll(
      async () => {
        const planner = await readActivePlanner(this);
        return planner.items.find((item) => item.title === title);
      },
      { timeout: 5000 },
    )
    .toBeTruthy()
    .then(async () => {
      const planner = await readActivePlanner(this);
      return planner.items.find((item) => item.title === title);
    });
  expect(activity?.kind).toBe("activity");
  expect(activity?.showOnMap).toBe(true);
  expect(activity?.placeCoordinates || activity?.placeMapStopId).toBeTruthy();
});

Then("the planner shows one linked check-in item", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-stay-moment.check-in")).toHaveCount(1);
});

Then("the planner shows one linked check-out item", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-stay-moment.check-out")).toHaveCount(1);
});

Then("the planner does not ask for confirmation", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-editor-confirm")).toHaveCount(0);
});

Then("the planner no longer shows the empty day", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-v2-day", { hasText: "1 MAY" })).toHaveCount(0);
});

Then("the planner asks for delete confirmation", async function (this: TravelWorld) {
  await expect(this.page.locator(".planner-editor-confirm")).toBeVisible();
});

Then("the date picker is closed", async function (this: TravelWorld) {
  await expect(this.page.getByRole("dialog", { name: "Date range picker" })).toBeHidden();
});

Then("the time picker is closed", async function (this: TravelWorld) {
  await expect(this.page.getByRole("dialog", { name: "Time picker" })).toBeHidden();
});

Then("the notes field is not focused", async function (this: TravelWorld) {
  const isNotesFocused = await this.page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
  expect(isNotesFocused).toBe(false);
});
