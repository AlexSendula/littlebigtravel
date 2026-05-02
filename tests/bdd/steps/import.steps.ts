import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { customBase, startingTravel } from "../../fixtures/plannerFixtures";
import { openTripMenu } from "../support/actions";
import { readActivePlanner, seedActiveTrip, type TravelWorld } from "../support/world";

type GmailTestMessage = {
  id: string;
  historyId: string;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: string;
};

declare global {
  interface Window {
    __lbtGmailTestMessages?: GmailTestMessage[];
  }
}

function messageIdFrom(parts: string[]) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function appendGmailMessage(world: TravelWorld, message: GmailTestMessage) {
  await world.page.evaluate((nextMessage) => {
    window.__lbtGmailTestMessages = [...(window.__lbtGmailTestMessages ?? []), nextMessage];
  }, message);
}

async function expectImportedStartingTravelCount(world: TravelWorld, count: number) {
  await expect
    .poll(
      async () => {
        const planner = await readActivePlanner(world);
        return planner.items.filter((item) => item.isStartingTravel && item.source === "imported").length;
      },
      { timeout: 6000 },
    )
    .toBe(count);
}

Given(
  "I have an active trip named {string} with manual starting travel from {string} to {string}",
  async function (this: TravelWorld, tripName: string, from: string, to: string) {
    const toLabel = to === "Santiago" ? "Santiago, Chile" : to;
    await seedActiveTrip(this, tripName, {
      items: [
        startingTravel({
          fromLabel: from === "Amsterdam" ? "Amsterdam, Netherlands" : from,
          toLabel,
          toBaseId: "custom:santiago",
          destinationId: "santiago",
          source: "manual",
        }),
      ],
      customBases: [customBase({ id: "custom:santiago", baseName: toLabel, startDate: "2026-04-30", endDate: "2026-05-02" })],
    });
  },
);

Given(
  "Gmail has a flight confirmation from {string} to {string}",
  async function (this: TravelWorld, from: string, to: string) {
    await appendGmailMessage(this, {
      id: messageIdFrom(["flight", from, to]),
      historyId: "100",
      subject: `Flight confirmation ${from} to ${to}`,
      snippet: `Confirmed flight itinerary from ${from} to ${to}.`,
      receivedAt: "2026-04-20T10:00:00.000Z",
      bodyText: [
        "Flight confirmation",
        `From: ${from}`,
        `To: ${to}`,
        "Depart: 2026-04-29 12:00",
        "Arrive: 2026-04-30 10:15",
      ].join("\n"),
    });
  },
);

Given("Gmail has a hotel confirmation for {string}", async function (this: TravelWorld, place: string) {
  await appendGmailMessage(this, {
    id: messageIdFrom(["hotel", place]),
    historyId: "101",
    subject: `Hotel confirmation ${place}`,
    snippet: `Reservation confirmed at ${place}.`,
    receivedAt: "2026-04-20T10:05:00.000Z",
    bodyText: [
      "Hotel reservation confirmation",
      `Hotel: ${place}`,
      "City: Santiago, Chile",
      "Check-in: 2026-04-30 15:00",
      "Check-out: 2026-05-01 10:00",
    ].join("\n"),
  });
});

When("I connect Gmail auto-import", async function (this: TravelWorld) {
  await openTripMenu(this);
  const connectButton = this.page.getByLabel("Connect Gmail");
  await expect(connectButton).toBeVisible();
  await connectButton.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(this.page.getByLabel("Disconnect Gmail")).toBeVisible();
});

When("I disconnect Gmail auto-import", async function (this: TravelWorld) {
  await openTripMenu(this);
  const disconnectButton = this.page.getByLabel("Disconnect Gmail");
  await expect(disconnectButton).toBeVisible();
  await disconnectButton.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(this.page.getByLabel("Connect Gmail")).toBeVisible();
});

When("Gmail checks again", async function (this: TravelWorld) {
  await this.page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
  await this.page.waitForTimeout(250);
});

Then("Gmail auto-import is connected", async function (this: TravelWorld) {
  await openTripMenu(this);
  await expect(this.page.getByLabel("Disconnect Gmail")).toBeVisible();
  await expect(this.page.getByLabel("Gmail auto-import")).toContainText(/Checking Gmail|Last checked|Not checked yet/);
});

Then("the active planner has one imported starting travel", async function (this: TravelWorld) {
  await expectImportedStartingTravelCount(this, 1);
});

Then("the active planner has {int} imported starting travel", async function (this: TravelWorld, count: number) {
  await expectImportedStartingTravelCount(this, count);
});

Then("the active planner has one imported stay", async function (this: TravelWorld) {
  await expect
    .poll(
      async () => {
        const planner = await readActivePlanner(this);
        return planner.items.filter((item) => item.kind === "stay" && item.source === "imported").length;
      },
      { timeout: 6000 },
    )
    .toBe(1);
});

Then("the active planner still has one starting travel item", async function (this: TravelWorld) {
  await expect
    .poll(
      async () => {
        const planner = await readActivePlanner(this);
        return planner.items.filter((item) => item.isStartingTravel).length;
      },
      { timeout: 6000 },
    )
    .toBe(1);
});
