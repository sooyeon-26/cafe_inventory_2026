import test from "node:test";
import assert from "node:assert/strict";
import { seedItems } from "../src/data.js";
import { filterItems, statusOf, suggestedOrder } from "../src/inventory.js";

test("stock boundaries and suggested orders", () => {
  const item = { stock: 2, minimum: 5, target: 10 };
  assert.equal(statusOf(item), "urgent");
  assert.equal(suggestedOrder(item), 8);
  assert.equal(statusOf({ ...item, stock: 4 }), "low");
  assert.equal(statusOf({ ...item, stock: 5 }), "normal");
  assert.equal(suggestedOrder({ ...item, stock: 20 }), 0);
  assert.equal(statusOf({ stock: 0, minimum: 0, target: 0 }), "normal");
});

test("search and status filters compose with seeded items", () => {
  assert.equal(seedItems.length, 10);
  assert.equal(filterItems(seedItems, "  오트  ", "urgent").length, 1);
  assert.equal(filterItems(seedItems, "오트", "normal").length, 0);
  assert.equal(filterItems(seedItems, "", "low").length, 5);
  assert.ok(
    filterItems(seedItems, "음료", "all").every((item) => item.category === "음료"),
  );
});
