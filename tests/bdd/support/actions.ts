import { expect, type Locator, type Page } from "@playwright/test";
import type { TravelWorld } from "./world";

export async function openTripMenu(world: TravelWorld) {
  const dialog = world.page.getByRole("dialog", { name: "Trip menu" });
  if (await dialog.isVisible().catch(() => false)) return;
  const openButton = world.page.getByLabel("Open trip menu").first();
  await expect(openButton).toBeVisible();
  await openButton.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(dialog).toBeVisible();
}

export async function closeTripMenuIfOpen(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Trip menu" });
  if (!(await dialog.isVisible().catch(() => false))) return;
  const closeButton = page.getByLabel("Close trip menu");
  await expect(closeButton).toBeVisible();
  await closeButton.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(dialog).toBeHidden();
}

export async function createTrip(world: TravelWorld, name: string, startDate?: string, endDate?: string) {
  await openTripMenu(world);
  const input = world.page.getByLabel("New trip title");
  if (!(await input.isVisible().catch(() => false))) {
    const createButton = world.page.getByLabel("Create trip").first();
    await expect(createButton).toBeVisible();
    await createButton.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(input).toBeVisible();
  }
  await setInputValue(input, name);
  if (startDate) {
    await setInputValue(world.page.getByLabel("Trip start date").first(), startDate);
  }
  if (endDate) {
    await setInputValue(world.page.getByLabel("Trip end date").first(), endDate);
  }
  const submit = world.page.locator(".trip-drawer-create button[type='submit']");
  await expect(submit).toBeVisible();
  await submit.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(world.page.locator(".topbar h2")).toHaveText(name);
}

export async function openPlanner(world: TravelWorld) {
  await closeTripMenuIfOpen(world.page);
  const openButton = world.page.getByLabel("Open trip planner");
  await expect(openButton).toBeVisible();
  await openButton.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(world.page.getByLabel("Trip management")).toBeVisible();
}

export async function choosePlace(page: Page, inputName: RegExp, value: string, optionName: string) {
  const input = page.getByPlaceholder(inputName).first();
  await input.fill(value);
  const option = page.getByRole("option", { name: optionName });
  await expect(option).toBeVisible();
  await option.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(input).toHaveValue(optionName);
}

export async function openStartingTravelEditor(page: Page) {
  const detail = page.locator(".planner-v2-detail");
  if (!(await detail.isVisible().catch(() => false))) {
    await page.locator(".planner-v2-starting-travel .planner-v2-row").first().click();
    await expect(detail).toBeVisible();
  }
  await swipeTouch(detail, 0, -96);
  await expect(page.getByRole("heading", { name: "Edit Starting Travel" })).toBeVisible();
}

export async function swipeTouch(locator: Locator, deltaX: number, deltaY: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cannot swipe an element without a bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await locator.dispatchEvent("touchstart", touchPayload(startX, startY));
  await locator.dispatchEvent("touchmove", touchPayload(startX + deltaX, startY + deltaY));
  await locator.dispatchEvent("touchend", touchPayload(startX + deltaX, startY + deltaY));
}

export async function swipeLeft(page: Page, locator: Locator, distance = 150) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cannot swipe an element without a bounding box");
  const startX = box.x + box.width - 18;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - distance * 0.45, y + 10, { steps: 4 });
  await page.mouse.move(startX - distance, y + 16, { steps: 5 });
  await page.mouse.up();
}

export async function swipeRight(page: Page, locator: Locator, distance = 150) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cannot swipe an element without a bounding box");
  const startX = box.x + 18;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + distance * 0.45, y + 10, { steps: 4 });
  await page.mouse.move(startX + distance, y + 16, { steps: 5 });
  await page.mouse.up();
}

export async function exposePlannerSwipeState(locator: Locator) {
  await locator.evaluate((element) => {
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
}

async function setInputValue(locator: Locator, value: string) {
  await expect(locator).toBeVisible();
  await locator.evaluate(
    (element, nextValue) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value,
  );
}

function touchPayload(clientX: number, clientY: number) {
  return {
    touches: [{ identifier: 1, clientX, clientY }],
    targetTouches: [{ identifier: 1, clientX, clientY }],
    changedTouches: [{ identifier: 1, clientX, clientY }],
  };
}
