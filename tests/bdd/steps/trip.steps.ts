import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openCleanApp, seedTrips, type TravelWorld } from "../support/world";
import { createTrip, openTripMenu, swipeRight } from "../support/actions";

Given("I open a clean app", async function (this: TravelWorld) {
  await openCleanApp(this);
});

Given("I have an active trip named {string} and an archived trip named {string}", async function (this: TravelWorld, activeName: string, archivedName: string) {
  await seedTrips(
    this,
    [
      { id: "trip:active", name: activeName },
      { id: "trip:archived", name: archivedName, archivedAt: "2026-04-29T12:05:00.000Z" },
    ],
    "trip:active",
  );
});

Given("I have two active trips named {string} and {string}", async function (this: TravelWorld, firstName: string, secondName: string) {
  await seedTrips(
    this,
    [
      { id: "trip:first", name: firstName },
      { id: "trip:second", name: secondName },
    ],
    "trip:first",
  );
});

When("I open the trip menu", async function (this: TravelWorld) {
  await openTripMenu(this);
});

When("I create a trip named {string}", async function (this: TravelWorld, name: string) {
  await createTrip(this, name);
});

When(
  "I create a trip named {string} from {string} to {string}",
  async function (this: TravelWorld, name: string, startDate: string, endDate: string) {
    await createTrip(this, name, startDate, endDate);
  },
);

When("I show archived trips", async function (this: TravelWorld) {
  await this.page.getByLabel("Show archived trips").click();
  await expect(this.page.getByRole("heading", { name: "Archived trips" })).toBeVisible();
});

When("I restore the trip named {string}", async function (this: TravelWorld, name: string) {
  await this.page.getByRole("button", { name: `Select ${name}` }).click();
});

When("I select the trip named {string}", async function (this: TravelWorld, name: string) {
  await this.page.getByRole("button", { name: `Select ${name}` }).click();
});

When("I archive the trip named {string}", async function (this: TravelWorld, name: string) {
  const row = this.page.getByTestId("trip-card-swipe-trip:first").filter({ hasText: name }).first();
  const fallback = this.page.locator(".trip-card-swipe", { hasText: name }).first();
  await swipeRight(this.page, (await row.count()) > 0 ? row : fallback);
});

Then("the active trip is {string}", async function (this: TravelWorld, name: string) {
  await expect(this.page.locator(".topbar h2")).toHaveText(name);
});

Then("the active trip dates are {string}", async function (this: TravelWorld, dateLine: string) {
  await expect(this.page.locator(".topbar p")).toHaveText(dateLine);
});

Then("the trip menu lists {string}", async function (this: TravelWorld, name: string) {
  await openTripMenu(this);
  await expect(this.page.getByRole("button", { name: `Select ${name}` })).toBeVisible();
});
