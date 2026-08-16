import type { PlannerItem } from "./types";

export function linkedItemsEnabled(item: PlannerItem) {
  return item.autoLinkedItemsEnabled !== false;
}

export function hiddenAutoLinkedKeys(item: PlannerItem) {
  return new Set(item.hiddenAutoLinkedItems ?? []);
}

export function linkedItemVisible(item: PlannerItem, key: string) {
  return linkedItemsEnabled(item) && !hiddenAutoLinkedKeys(item).has(key);
}

export function allLinkedItemsVisible(item: PlannerItem) {
  return linkedItemsEnabled(item) && (item.hiddenAutoLinkedItems?.length ?? 0) === 0;
}

export function hideAutoLinkedKey(item: PlannerItem, key: string): PlannerItem {
  const nextHidden = hiddenAutoLinkedKeys(item);
  nextHidden.add(key);
  return {
    ...item,
    autoLinkedItemsEnabled: true,
    hiddenAutoLinkedItems: [...nextHidden],
  };
}

export function toggleAutoLinkedVisibility(item: PlannerItem): PlannerItem {
  if (allLinkedItemsVisible(item)) {
    return {
      ...item,
      autoLinkedItemsEnabled: false,
      hiddenAutoLinkedItems: undefined,
    };
  }

  return {
    ...item,
    autoLinkedItemsEnabled: true,
    hiddenAutoLinkedItems: undefined,
  };
}
