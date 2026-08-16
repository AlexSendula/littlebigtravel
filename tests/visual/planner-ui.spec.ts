import { expect, test, type Locator, type Page } from "@playwright/test";
import type { PlannerCustomBase, PlannerItem, Trip } from "../../src/domain/trip/types";

const DB_NAME = "lbt-local-db";
const ACTIVE_TRIP_STORAGE_KEY = "lbt-active-trip-id";
const NOW = "2026-04-29T12:00:00.000Z";
const VISUAL_STABILIZER_CSS = `
  *, *::before, *::after {
    animation: none !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition: none !important;
    transition-duration: 0s !important;
    caret-color: transparent !important;
  }

  .topbar,
  .trip-drawer,
  .trip-drawer-layer,
  .planner-v2,
  .planner-editor,
  .planner-v2-detail {
    transition: none !important;
    animation: none !important;
  }
`;

function startingTravel(): PlannerItem {
  return {
    id: "item:start",
    kind: "flight",
    title: "Amsterdam, Netherlands to Santiago, Chile",
    note: "Bring the hiking layers.",
    startDate: "2026-04-29",
    endDate: "2026-04-30",
    baseId: "__start_travel__",
    fromLabel: "Amsterdam, Netherlands",
    toLabel: "Santiago, Chile",
    fromCoordinates: [4.9041, 52.3676],
    toCoordinates: [-70.6693, -33.4489],
    fromCountry: "Netherlands",
    toCountry: "Chile",
    fromCountryCode: "NL",
    toCountryCode: "CL",
    fromMapStopId: "place:amsterdam-nl",
    toMapStopId: "santiago",
    toBaseId: "custom:santiago",
    destinationId: "santiago",
    transportMode: "flight",
    isStartingTravel: true,
    autoLinkedItemsEnabled: true,
    source: "manual",
    order: 0,
  };
}

function santiagoBase(): PlannerCustomBase {
  return {
    id: "custom:santiago",
    baseName: "Santiago, Chile",
    startDate: "2026-04-30",
    endDate: "2026-05-02",
    coordinates: [-70.6693, -33.4489],
    country: "Chile",
    countryCode: "CL",
    mapStopId: "santiago",
  };
}

function stay(): PlannerItem {
  return {
    id: "item:stay",
    kind: "stay",
    title: "Walking Santiago Boutique Hostel",
    note: "Door code in notes.",
    startDate: "2026-04-30",
    endDate: "2026-05-01",
    startTime: "15:00",
    stayType: "hostel",
    baseId: "custom:santiago",
    baseName: "Santiago, Chile",
    placeLabel: "Walking Santiago Boutique Hostel",
    placeAddress: "Walking Santiago Boutique Hostel, Almirante Barroso 457, Santiago, Chile",
    placeCoordinates: [-70.6645, -33.4401],
    placeCountry: "Chile",
    placeCountryCode: "CL",
    source: "manual",
    order: 100,
  };
}

function mappableActivity(): PlannerItem {
  return {
    id: "item:activity",
    kind: "activity",
    title: "Laguna Torre",
    note: "Trail day from town.",
    startDate: "2026-05-01",
    startTime: "09:00",
    endTime: "15:00",
    baseId: "custom:santiago",
    baseName: "Santiago, Chile",
    placeLabel: "El Chalten, Argentina",
    placeAddress: "El Chalten, Argentina",
    placeCoordinates: [-72.8863, -49.3315],
    placeCountry: "Argentina",
    placeCountryCode: "AR",
    placeMapStopId: "el-chalten",
    showOnMap: true,
    source: "manual",
    order: 110,
  };
}

async function clearLocalData(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ dbName, activeKey }) =>
      new Promise<void>((resolve, reject) => {
        localStorage.clear();
        localStorage.removeItem(activeKey);
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("trips")) {
            const store = database.createObjectStore("trips", { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("trips", "readwrite");
          transaction.objectStore("trips").clear();
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { dbName: DB_NAME, activeKey: ACTIVE_TRIP_STORAGE_KEY },
  );
  await page.goto("/");
}

async function seedTrip(page: Page, planner: Trip["planner"] = { items: [], customBases: [] }) {
  const trip: Trip = {
    id: "trip:visual",
    name: "Visual Patagonia",
    createdAt: NOW,
    updatedAt: NOW,
    planner,
  };

  await clearLocalData(page);
  await page.evaluate(
    ({ dbName, activeKey, tripToStore }) =>
      new Promise<void>((resolve, reject) => {
        localStorage.setItem(activeKey, tripToStore.id);
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("trips")) {
            const store = database.createObjectStore("trips", { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("trips", "readwrite");
          transaction.objectStore("trips").put(tripToStore);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { dbName: DB_NAME, activeKey: ACTIVE_TRIP_STORAGE_KEY, tripToStore: trip },
  );
  await page.goto("/");
  await expect(page.locator(".topbar h2")).toHaveText("Visual Patagonia");
}

async function stabilizeUi(page: Page) {
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ features: [] }),
    }),
  );
  await page.addInitScript((css) => {
    const install = () => {
      if (document.querySelector("[data-visual-stabilizer]")) return;
      const style = document.createElement("style");
      style.setAttribute("data-visual-stabilizer", "true");
      style.textContent = css;
      document.documentElement.appendChild(style);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
      return;
    }

    install();
  }, VISUAL_STABILIZER_CSS);
}

async function openPlanner(page: Page) {
  await page.getByLabel("Open trip planner").click();
  await expect(page.getByLabel("Trip management")).toBeVisible();
}

async function swipeTouch(locator: Locator, deltaX: number, deltaY: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cannot swipe an element without a bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const payload = (clientX: number, clientY: number) => ({
    touches: [{ identifier: 1, clientX, clientY }],
    targetTouches: [{ identifier: 1, clientX, clientY }],
    changedTouches: [{ identifier: 1, clientX, clientY }],
  });
  await locator.dispatchEvent("touchstart", payload(startX, startY));
  await locator.dispatchEvent("touchmove", payload(startX + deltaX, startY + deltaY));
  await locator.dispatchEvent("touchend", payload(startX + deltaX, startY + deltaY));
}

async function openStartingTravelEditor(page: Page) {
  await page.locator(".planner-v2-starting-travel .planner-v2-row").first().click();
  const detail = page.locator(".planner-v2-detail");
  await expect(detail).toBeVisible();
  await swipeTouch(detail, 0, -96);
  await expect(page.getByRole("heading", { name: "Edit Starting Travel" })).toBeVisible();
}

async function exposePlannerSwipeState(page: Page, testId: string) {
  const swipeRow = page.getByTestId(testId);
  await swipeRow.evaluate((element) => {
    element.classList.add("is-active", "is-tracking", "is-swiping");
    const action = element.querySelector<HTMLElement>(".planner-swipe-delete-action");
    const content = element.querySelector<HTMLElement>(".planner-swipe-delete-content");
    action?.style.setProperty("--swipe-delete-progress", "0.84");
    action?.style.setProperty("--swipe-delete-commit", "0");
    if (content) {
      content.style.setProperty("--swipe-delete-progress", "0.84");
      content.style.setProperty("--swipe-delete-commit", "0");
      content.style.transform = "translate3d(-96px, 0, 0)";
    }
  });
  return swipeRow;
}

async function exposeTripSwipeState(page: Page, direction: "archive" | "delete") {
  const swipeRow = page.locator(".trip-card-swipe").first();
  await swipeRow.evaluate((element, swipeDirection) => {
    const x = swipeDirection === "archive" ? "112px" : "-112px";
    element.classList.add("is-active", "is-swiping", swipeDirection === "archive" ? "is-archive" : "is-delete");
    element.classList.remove(swipeDirection === "archive" ? "is-delete" : "is-archive");
    (element as HTMLElement).style.setProperty("--trip-card-x", x);
    (element as HTMLElement).style.setProperty("--trip-action-progress", "0.84");
    (element as HTMLElement).style.setProperty("--trip-action-commit", "0");
  }, direction);
  return swipeRow;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await stabilizeUi(page);
});

test("trip card collapsed", async ({ page }) => {
  await clearLocalData(page);
  await expect(page.locator(".topbar")).toHaveScreenshot("trip-card-collapsed.png");
});

test("trip card expanded menu", async ({ page }) => {
  await seedTrip(page);
  await page.getByLabel("Open trip menu").first().click();
  await expect(page.getByRole("dialog", { name: "Trip menu" })).toBeVisible();
  await expect(page.locator(".trip-drawer")).toHaveScreenshot("trip-card-expanded.png");
});

test("trip planner main view", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel()], customBases: [santiagoBase()] });
  await openPlanner(page);
  await expect(page.getByLabel("Trip management")).toHaveScreenshot("trip-planner-main.png");
});

test("departure editor with calendar open", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel()], customBases: [santiagoBase()] });
  await openPlanner(page);
  await page.getByText(/Add departure/).first().click();
  await expect(page.getByRole("heading", { name: "New Departure" })).toBeVisible();
  await page.locator(".planner-date-range .planner-date-trigger").first().click();
  await expect(page.locator(".planner-editor")).toHaveScreenshot("departure-editor-calendar.png");
});

test("starting travel editor", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel()], customBases: [santiagoBase()] });
  await openPlanner(page);
  await openStartingTravelEditor(page);
  await expect(page.locator(".planner-editor")).toHaveScreenshot("starting-travel-editor.png");
});

test("activity editor with time selector open", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel()], customBases: [santiagoBase()] });
  await openPlanner(page);
  await page.getByLabel("Add on 30 Apr").evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole("heading", { name: "New Activity" })).toBeVisible();
  await page.locator(".planner-time-trigger").first().click();
  await expect(page.locator(".planner-editor")).toHaveScreenshot("activity-editor-time.png");
});

test("stay editor", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel()], customBases: [santiagoBase()] });
  await openPlanner(page);
  await page.getByText("Add where you stay").click();
  await expect(page.getByRole("heading", { name: "New Stay" })).toBeVisible();
  await expect(page.locator(".planner-editor")).toHaveScreenshot("stay-editor.png");
});

test("linked item toggle states", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel()], customBases: [santiagoBase()] });
  await openPlanner(page);
  await openStartingTravelEditor(page);
  await expect(page.getByTestId("linked-items-toggle")).toHaveScreenshot("linked-items-toggle-enabled.png");
  await page.getByTestId("linked-items-toggle").click();
  await expect(page.getByTestId("linked-items-toggle")).toHaveScreenshot("linked-items-toggle-disabled.png");
});

test("planner swipe delete exposed state", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel(), mappableActivity()], customBases: [santiagoBase()] });
  await openPlanner(page);
  const swipeRow = await exposePlannerSwipeState(page, "swipe-item-item:activity");
  await expect(swipeRow).toHaveScreenshot("planner-swipe-delete-exposed.png");
});

test("trip swipe delete exposed state", async ({ page }) => {
  await seedTrip(page);
  await page.getByLabel("Open trip menu").first().click();
  const swipeRow = await exposeTripSwipeState(page, "delete");
  await expect(swipeRow).toHaveScreenshot("trip-swipe-delete-exposed.png");
});

test("trip swipe archive exposed state", async ({ page }) => {
  await seedTrip(page);
  await page.getByLabel("Open trip menu").first().click();
  const swipeRow = await exposeTripSwipeState(page, "archive");
  await expect(swipeRow).toHaveScreenshot("trip-swipe-archive-exposed.png");
});

test("destination rail with base city and mappable activity", async ({ page }) => {
  await seedTrip(page, { items: [startingTravel(), mappableActivity()], customBases: [santiagoBase()] });
  await expect(page.locator(".destination-rail")).toHaveScreenshot("destination-rail-mappable-activity.png");
});
