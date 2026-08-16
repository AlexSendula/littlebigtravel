import { expect, test, type Page } from "@playwright/test";
import {
  activityItem,
  customBase,
  plannerItem,
  startingTravel,
  stayItem,
  TEST_NOW,
  tripFixture,
} from "../fixtures/plannerFixtures";
import type { Trip } from "../../src/domain/trip/types";

const DB_NAME = "lbt-local-db";
const ACTIVE_TRIP_STORAGE_KEY = "lbt-active-trip-id";
const PERFORMANCE_FLAG_KEY = "lbt-performance-audit";

type AuditMetrics = Record<string, number | null>;

type HeapSnapshot = {
  source: "cdp" | "performance.memory" | "unavailable";
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
  jsHeapSizeLimit?: number | null;
};

function perfTrip(): Trip {
  return tripFixture({
    id: "trip:performance",
    name: "Performance Patagonia",
    planner: {
      items: [
        startingTravel(),
        stayItem(),
        activityItem({
          id: "item:activity-performance",
          startDate: "2026-05-01",
          baseId: "custom:santiago",
          baseName: "Santiago, Chile",
        }),
      ],
      customBases: [
        customBase({
          id: "custom:santiago",
          baseName: "Santiago, Chile",
          startDate: "2026-04-30",
          endDate: "2026-05-02",
        }),
      ],
    },
  });
}

function isoDate(dayOffset: number) {
  return new Date(Date.UTC(2026, 4, 1 + dayOffset)).toISOString().slice(0, 10);
}

function largePerfTrip(): Trip {
  const baseCount = 10;
  const daysPerBase = 5;
  const customBases = Array.from({ length: baseCount }, (_, index) => {
    const startOffset = index * daysPerBase;
    return customBase({
      id: `custom:large-base-${index}`,
      baseName: `Large Base ${index + 1}`,
      startDate: isoDate(startOffset),
      endDate: isoDate(startOffset + daysPerBase - 1),
      coordinates: [-70.7 + index * 1.15, -33.5 - index * 0.85],
      country: index % 2 === 0 ? "Chile" : "Argentina",
      countryCode: index % 2 === 0 ? "CL" : "AR",
      mapStopId: `large-base-${index}`,
    });
  });
  const items = [
    startingTravel({
      id: "item:large-start",
      startDate: isoDate(-1),
      endDate: isoDate(0),
      toLabel: customBases[0].baseName,
      toCoordinates: customBases[0].coordinates ?? [-70.7, -33.5],
      toCountry: customBases[0].country,
      toCountryCode: customBases[0].countryCode,
      toMapStopId: customBases[0].mapStopId,
      toBaseId: customBases[0].id,
      destinationId: customBases[0].mapStopId,
    }),
  ];

  customBases.forEach((base, baseIndex) => {
    const baseCoordinates = base.coordinates ?? [-70.7 + baseIndex * 1.15, -33.5 - baseIndex * 0.85];
    const startOffset = baseIndex * daysPerBase;
    items.push(
      stayItem({
        id: `item:large-stay-${baseIndex}`,
        title: `${base.baseName} Guesthouse`,
        placeLabel: `${base.baseName} Guesthouse`,
        placeAddress: `${base.baseName} Guesthouse, Main Road ${baseIndex + 1}`,
        startDate: isoDate(startOffset),
        endDate: isoDate(startOffset + daysPerBase - 1),
        baseId: base.id,
        baseName: base.baseName,
        placeCoordinates: baseCoordinates,
        placeCountry: base.country,
        placeCountryCode: base.countryCode,
        order: 20,
      }),
    );

    for (let day = 0; day < daysPerBase; day += 1) {
      const currentDate = isoDate(startOffset + day);
      for (let activityIndex = 0; activityIndex < 3; activityIndex += 1) {
        const coordinates: [number, number] = [
          baseCoordinates[0] + 0.08 * (activityIndex + 1),
          baseCoordinates[1] - 0.05 * (day + 1),
        ];
        items.push(
          activityItem({
            id: `item:large-activity-${baseIndex}-${day}-${activityIndex}`,
            title: `Activity ${baseIndex + 1}.${day + 1}.${activityIndex + 1}`,
            startDate: currentDate,
            startTime: `${String(9 + activityIndex * 2).padStart(2, "0")}:00`,
            endTime: `${String(10 + activityIndex * 2).padStart(2, "0")}:30`,
            baseId: base.id,
            baseName: base.baseName,
            placeLabel: `Activity ${baseIndex + 1}.${day + 1}.${activityIndex + 1}`,
            placeAddress: `Activity ${baseIndex + 1}.${day + 1}.${activityIndex + 1}, ${base.baseName}`,
            placeCoordinates: coordinates,
            placeCountry: base.country,
            placeCountryCode: base.countryCode,
            showOnMap: activityIndex === 0,
            order: 100 + day * 10 + activityIndex,
          }),
        );
      }
    }

    const nextBase = customBases[baseIndex + 1];
    if (nextBase) {
      const nextBaseCoordinates = nextBase.coordinates ?? [-70.7 + (baseIndex + 1) * 1.15, -33.5 - (baseIndex + 1) * 0.85];
      items.push(
        plannerItem({
          id: `item:large-transport-${baseIndex}`,
          kind: "transport",
          title: `${base.baseName} to ${nextBase.baseName}`,
          startDate: base.endDate ?? base.startDate,
          baseId: base.id,
          baseName: base.baseName,
          toBaseId: nextBase.id,
          fromLabel: base.baseName,
          toLabel: nextBase.baseName,
          fromCoordinates: baseCoordinates,
          toCoordinates: nextBaseCoordinates,
          transportMode: "bus",
          source: "manual",
          order: 500,
        }),
      );
    }
  });

  return tripFixture({
    id: "trip:performance-large",
    name: "Large Performance Trip",
    planner: {
      items,
      customBases,
    },
  });
}

async function seedTrip(page: Page, trip: Trip) {
  await page.addInitScript((flagKey) => {
    window.localStorage.setItem(flagKey, "1");
  }, PERFORMANCE_FLAG_KEY);
  await page.goto("/");
  await page.evaluate(
    ({ activeKey, dbName, flagKey, tripToStore }) =>
      new Promise<void>((resolve, reject) => {
        localStorage.clear();
        localStorage.setItem(flagKey, "1");
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
          const store = transaction.objectStore("trips");
          store.clear();
          store.put(tripToStore);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    {
      activeKey: ACTIVE_TRIP_STORAGE_KEY,
      dbName: DB_NAME,
      flagKey: PERFORMANCE_FLAG_KEY,
      tripToStore: { ...trip, updatedAt: TEST_NOW },
    },
  );
  await page.goto("about:blank");
}

async function measureStep(metrics: AuditMetrics, name: string, action: () => Promise<void>) {
  const startedAt = performance.now();
  await action();
  metrics[name] = Math.round(performance.now() - startedAt);
}

async function waitForSelectorOptional(page: Page, selector: string, timeout = 6_000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function readHeapSnapshot(page: Page): Promise<HeapSnapshot> {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send("Performance.enable");
    const result = await session.send("Performance.getMetrics");
    const byName = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    const used = byName.get("JSHeapUsedSize");
    const total = byName.get("JSHeapTotalSize");
    await session.detach();
    if (typeof used === "number" || typeof total === "number") {
      return {
        source: "cdp",
        usedJSHeapSize: used ?? null,
        totalJSHeapSize: total ?? null,
      };
    }
  } catch {
    // CDP is Chromium-only. Keep the audit usable if this is ever run elsewhere.
  }

  return page.evaluate(() => {
    const memory = (performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    }).memory;

    if (!memory) {
      return {
        source: "unavailable",
        usedJSHeapSize: null,
        totalJSHeapSize: null,
        jsHeapSizeLimit: null,
      };
    }

    return {
      source: "performance.memory",
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  });
}

async function readAppMetrics(page: Page) {
  return page.evaluate(() => window.__LBT_PERF__?.snapshot() ?? null);
}

async function resetAppMetrics(page: Page) {
  await page.evaluate(() => window.__LBT_PERF__?.reset());
}

async function runAudit(page: Page, name: string, trip: Trip) {
  const metrics: AuditMetrics = {};

  await seedTrip(page, trip);

  await measureStep(metrics, "bootToTopTripCardMs", async () => {
    await page.goto("/");
    await expect(page.locator(".topbar h2")).toHaveText(trip.name);
  });

  const mapReadyStartedAt = performance.now();
  const mapReady = await waitForSelectorOptional(page, ".map-stage.ready");
  metrics.firstUsableMapMs = mapReady ? Math.round(performance.now() - mapReadyStartedAt) : null;
  await page.waitForTimeout(80);
  const mapBootMetrics = await readAppMetrics(page);

  const heapAfterBoot = await readHeapSnapshot(page);

  await resetAppMetrics(page);

  await measureStep(metrics, "tripDrawerOpenMs", async () => {
    await page.getByLabel("Open trip menu").first().click();
    await expect(page.getByRole("dialog", { name: "Trip menu" })).toBeVisible();
  });

  await measureStep(metrics, "tripDrawerCloseMs", async () => {
    await page.getByLabel("Close trip menu").click();
    await expect(page.getByRole("dialog", { name: "Trip menu" })).toBeHidden();
  });

  await resetAppMetrics(page);
  await measureStep(metrics, "destinationRailSelectMs", async () => {
    const railItems = page.getByTestId("destination-rail-item");
    const railCount = await railItems.count();
    if (railCount < 2) return;
    await railItems.nth(1).click();
    await page.waitForTimeout(80);
  });
  const mapInteractionMetrics = await readAppMetrics(page);

  await measureStep(metrics, "plannerOpenMs", async () => {
    await page.getByLabel("Open trip planner").click();
    await expect(page.getByLabel("Trip management")).toBeVisible();
  });

  await resetAppMetrics(page);
  await measureStep(metrics, "plannerEditToIndexedDbSaveMs", async () => {
    await page.locator(".planner-v2-day-add").first().evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("heading", { name: "New Activity" })).toBeVisible();
    await page.locator("input[name='lbt-activity-title']").fill("Performance audit marker");
    await page.waitForFunction(() => {
      const saveTiming = window.__LBT_PERF__?.snapshot().timings["indexeddb.save"];
      return Boolean(saveTiming && saveTiming.count > 0);
    });
  });

  const heapAfterInteractions = await readHeapSnapshot(page);
  const appMetrics = await readAppMetrics(page);
  const report = {
    name,
    metrics,
    memory: {
      note: "Chromium JS heap estimate only; this is not total device RAM or real iOS Safari memory.",
      afterBoot: heapAfterBoot,
      afterInteractions: heapAfterInteractions,
    },
    renderCounters: appMetrics?.renders ?? {},
    internalTimings: appMetrics?.timings ?? {},
    internalCounters: appMetrics?.counters ?? {},
    mapBoot: {
      timings: mapBootMetrics?.timings ?? {},
      counters: mapBootMetrics?.counters ?? {},
    },
    mapInteraction: {
      timings: mapInteractionMetrics?.timings ?? {},
      counters: mapInteractionMetrics?.counters ?? {},
    },
  };

  expect(metrics.bootToTopTripCardMs).toBeGreaterThan(0);
  expect(metrics.tripDrawerOpenMs).toBeGreaterThan(0);
  expect(metrics.plannerOpenMs).toBeGreaterThan(0);
  expect(appMetrics).toBeTruthy();
  return report;
}

test("captures the mobile performance audit baselines", async ({ page }) => {
  const normalTripReport = await runAudit(page, "normal-trip", perfTrip());
  const largeTripReport = await runAudit(page, "large-trip", largePerfTrip());

  console.log(
    `\nLBT performance audit\n${JSON.stringify(
      {
        normalTrip: normalTripReport,
        largeTrip: largeTripReport,
      },
      null,
      2,
    )}\n`,
  );
});
