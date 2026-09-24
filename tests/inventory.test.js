import test from "node:test";
import assert from "node:assert/strict";
import { seedItems } from "../src/data.js";
import { filterItems, statusOf } from "../src/inventory.js";
import {
  calculateAverageDailyUsage,
  calculateDaysUntilStockout,
  calculateRecommendation,
  recommendationsForItems,
  usageWindow,
} from "../server/reorder.js";
import { auditStockLedger } from "../server/stock-audit.js";
import { showcaseUsageEvents } from "../prisma/showcase-seed.js";

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
  assert.match(fallback.reorderReason, /선택적으로 보충/);
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

test("fixed 7-day window includes its boundary, empty days and midnight without future usage", async () => {
  const asOf = new Date("2026-03-08T00:00:00.000Z");
  const window = usageWindow(asOf);
  assert.equal(window.gte.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(window.lte.toISOString(), asOf.toISOString());
  const movements = [
    { date: new Date("2026-02-28T23:59:59.999Z"), change: -100 },
    { date: window.gte, change: -6 },
    { date: new Date("2026-03-07T23:59:59.999Z"), change: -8 },
    { date: new Date("2026-03-08T00:00:00.001Z"), change: -100 },
  ];
  const db = { stockMovement: { groupBy: async ({ where }) => [{ itemId: "fixture",
    _sum: { quantityChange: movements.filter(({ date }) => date >= where.createdAt.gte && date <= where.createdAt.lte)
      .reduce((sum, movement) => sum + movement.change, 0) } }] } };
  const result = await recommendationsForItems(db, [{ id: "fixture", stock: 6, minimum: 2, target: 10, leadTimeDays: 2 }], asOf);
  assert.equal(result.get("fixture").averageDailyUsage, 2);
  assert.equal(result.get("fixture").estimatedDaysUntilStockout, 3);
});

test("stock audit detects both a broken movement chain and mismatched current balance", () => {
  const item = { id: "sample", openingStock: 10, stock: 8, movements: [
    { id: "use", beforeQuantity: 10, quantityChange: -2, afterQuantity: 8 },
  ] };
  assert.deepEqual(auditStockLedger([item]), []);
  assert.deepEqual(auditStockLedger([{ ...item, stock: 9 }]).map((issue) => issue.reason), ["stock_balance"]);
  assert.deepEqual(auditStockLedger([{ ...item, movements: [{ ...item.movements[0], beforeQuantity: 9 }] }])
    .map((issue) => issue.reason), ["movement_chain"]);
});

test("showcase usage can be replayed at a fixed time with the same stock trail", () => {
  const item = { id: "fixture", name: "Fixture", stock: 5 };
  const events = showcaseUsageEvents(item, 2, new Date("2026-04-01T12:00:00Z"));
  assert.equal(events.length, 7);
  assert.equal(events[0].beforeQuantity, 19);
  assert.equal(events.at(-1).afterQuantity, 5);
  assert.equal(events.reduce((total, event) => total + event.quantityChange, 0), -14);
  assert.ok(events.every((event) => event.createdAt < new Date("2026-04-01T12:00:00Z")));
});
