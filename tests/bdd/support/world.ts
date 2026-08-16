import { After, AfterAll, Before, BeforeAll, setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import type { PlannerCustomBase, PlannerItem, PlannerSnapshot } from "../../../src/domain/trip/types";

const DEFAULT_BASE_URL = process.env.BDD_BASE_URL ?? "http://127.0.0.1:4174";
const DB_NAME = "lbt-local-db";
const ACTIVE_TRIP_STORAGE_KEY = "lbt-active-trip-id";

let serverProcess: ChildProcess | undefined;
let browser: Browser | undefined;

async function waitForServer(url: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function clearTripStorage(page: Page) {
  await page.evaluate(
    ({ dbName, activeTripStorageKey }) =>
      new Promise<void>((resolve, reject) => {
        window.localStorage.clear();
        window.localStorage.removeItem(activeTripStorageKey);
        const request = window.indexedDB.open(dbName, 1);
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
          if (!database.objectStoreNames.contains("trips")) {
            database.close();
            reject(new Error("IndexedDB trips store is missing"));
            return;
          }

          const transaction = database.transaction("trips", "readwrite");
          transaction.objectStore("trips").clear();
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { dbName: DB_NAME, activeTripStorageKey: ACTIVE_TRIP_STORAGE_KEY },
  );
}

export type TestTrip = {
  id: string;
  name: string;
  archivedAt?: string;
  planner?: {
    items: PlannerItem[];
    customBases: PlannerCustomBase[];
  };
};

export class TravelWorld extends World {
  context!: BrowserContext;
  page!: Page;
  baseUrl = DEFAULT_BASE_URL;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setDefaultTimeout(60_000);
setWorldConstructor(TravelWorld);

BeforeAll(async () => {
  if (!process.env.BDD_BASE_URL) {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    serverProcess = spawn(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4174"], {
      cwd: process.cwd(),
      stdio: "ignore",
      detached: process.platform !== "win32",
    });
  }

  await waitForServer(DEFAULT_BASE_URL);
  browser = await chromium.launch({ headless: true });
});

AfterAll(async () => {
  await browser?.close();
  if (serverProcess) {
    if (process.platform !== "win32" && serverProcess.pid) {
      process.kill(-serverProcess.pid, "SIGTERM");
    } else {
      serverProcess.kill("SIGTERM");
    }
  }
});

Before(async function (this: TravelWorld) {
  if (!browser) throw new Error("Browser was not started");
  this.context = await browser.newContext({
    ...devices["iPhone 14"],
    deviceScaleFactor: 1,
    locale: "en-US",
  });
  this.page = await this.context.newPage();
  await this.page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ features: [] }),
    }),
  );
});

After(async function (this: TravelWorld) {
  await this.context?.close();
});

export async function openCleanApp(world: TravelWorld) {
  await world.page.goto(world.baseUrl);
  await clearTripStorage(world.page);
  await world.page.goto(world.baseUrl);
}

export async function seedTrips(world: TravelWorld, trips: TestTrip[], activeTripId: string) {
  const now = new Date("2026-04-29T12:00:00.000Z").toISOString();
  const fullTrips = trips.map((trip, index) => ({
    id: trip.id,
    name: trip.name,
    createdAt: now,
    updatedAt: new Date(Date.parse(now) + index * 1000).toISOString(),
    archivedAt: trip.archivedAt,
    planner: trip.planner ?? {
      items: [],
      customBases: [],
    },
  }));

  await world.page.goto(world.baseUrl);
  await world.page.evaluate(
    ({ dbName, tripsToStore, activeId, activeTripStorageKey }) =>
      new Promise<void>((resolve, reject) => {
        window.localStorage.clear();
        window.localStorage.setItem(activeTripStorageKey, activeId);
        const request = window.indexedDB.open(dbName, 1);
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
          if (!database.objectStoreNames.contains("trips")) {
            database.close();
            reject(new Error("IndexedDB trips store is missing"));
            return;
          }

          const transaction = database.transaction("trips", "readwrite");
          const store = transaction.objectStore("trips");
          store.clear();
          for (const trip of tripsToStore) store.put(trip);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { dbName: DB_NAME, tripsToStore: fullTrips, activeId: activeTripId, activeTripStorageKey: ACTIVE_TRIP_STORAGE_KEY },
  );
  await world.page.goto(world.baseUrl);
}

export async function seedActiveTrip(world: TravelWorld, name: string, planner: PlannerSnapshot, activeTripId = "trip:active") {
  await seedTrips(world, [{ id: activeTripId, name, planner }], activeTripId);
}

export async function readActivePlanner(world: TravelWorld): Promise<PlannerSnapshot> {
  return world.page.evaluate(
    ({ dbName, activeTripStorageKey }) =>
      new Promise<PlannerSnapshot>((resolve, reject) => {
        const activeId = window.localStorage.getItem(activeTripStorageKey);
        if (!activeId) {
          resolve({ items: [], customBases: [] });
          return;
        }
        const request = window.indexedDB.open(dbName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("trips", "readonly");
          const store = transaction.objectStore("trips");
          const getRequest = store.get(activeId);
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            const trip = getRequest.result as { planner?: PlannerSnapshot } | undefined;
            database.close();
            resolve(trip?.planner ?? { items: [], customBases: [] });
          };
        };
      }),
    { dbName: DB_NAME, activeTripStorageKey: ACTIVE_TRIP_STORAGE_KEY },
  );
}
