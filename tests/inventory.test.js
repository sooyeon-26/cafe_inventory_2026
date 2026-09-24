import test from "node:test";
import assert from "node:assert/strict";
import { seedItems } from "../src/data.js";
import { filterItems, statusOf } from "../src/inventory.js";
import {
  calculateAverageDailyUsage,
  calculateDaysUntilStockout,
  calculateRecommendation,
} from "../server/reorder.js";

test("seven-day usage and stockout estimate include days without usage", () => {
  assert.equal(calculateAverageDailyUsage(14), 2);
  assert.equal(calculateDaysUntilStockout(6, 2), 3);
  assert.equal(calculateDaysUntilStockout(6, 0), null);
});

test("reorder status prioritizes urgent, then minimum and lead time", () => {
  const item = { stock: 20, minimum: 5, target: 25, leadTimeDays: 2 };
  assert.equal(calculateRecommendation(item, 7).reorderStatus, "normal");
  assert.equal(calculateRecommendation({ ...item, stock: 5 }, 0).reorderStatus, "reorder");
  assert.equal(calculateRecommendation({ ...item, stock: 8 }, 28).reorderStatus, "reorder");
  assert.equal(calculateRecommendation({ ...item, stock: 3 }, 28).reorderStatus, "urgent");
  assert.equal(calculateRecommendation({ ...item, stock: 0 }, 0).reorderStatus, "urgent");
  assert.equal(calculateRecommendation({ ...item, stock: 8 }, 28).estimatedDaysUntilStockout, 2);
});

test("no usage falls back to target gap; lead-time buffer grows quantity when needed", () => {
  const item = { stock: 8, minimum: 5, target: 10, leadTimeDays: 2 };
  const fallback = calculateRecommendation(item, 0);
  assert.equal(fallback.averageDailyUsage, 0);
  assert.equal(fallback.estimatedDaysUntilStockout, null);
  assert.equal(fallback.reorderStatus, "normal");
  assert.equal(fallback.recommendedQuantity, 2);
  assert.equal(calculateRecommendation(item, 28).recommendedQuantity, 5);
  assert.equal(calculateRecommendation({ ...item, stock: 20 }, 0).recommendedQuantity, 0);
});

test("search and server-provided status filters compose with seeded items", () => {
  const items = seedItems.map((item) => ({
    ...item,
    ...calculateRecommendation({ ...item, leadTimeDays: 2 }, 0),
  }));
  assert.equal(items.length, 10);
  assert.equal(filterItems(items, "  오트  ", "urgent").length, 0);
  assert.equal(filterItems(items, "오트", "low").length, 1);
  assert.equal(filterItems(items, "", "low").length, 5);
  assert.equal(statusOf(items.find((item) => item.id === "oat")), "low");
  assert.ok(
    filterItems(items, "음료", "all").every((item) => item.category === "음료"),
  );
});
