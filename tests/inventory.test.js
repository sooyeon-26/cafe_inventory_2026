import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/data.js";
import {
  filterItems,
  inventoryReducer,
  isValidState,
  statusOf,
  suggestedOrder,
} from "../src/inventory.js";

const reduce = (state, action) =>
  inventoryReducer(state, {
    eventId: "test-event",
    date: "2026-09-23T00:00:00.000Z",
    ...action,
  });
test("stock boundaries and suggested orders", () => {
  const item = { stock: 2, minimum: 5, target: 10 };
  assert.equal(statusOf(item), "urgent");
  assert.equal(suggestedOrder(item), 8);
  assert.equal(statusOf({ ...item, stock: 4 }), "low");
  assert.equal(statusOf({ ...item, stock: 5 }), "normal");
  assert.equal(suggestedOrder({ ...item, stock: 20 }), 0);
  assert.equal(statusOf({ stock: 0, minimum: 0, target: 0 }), "normal");
});
test("search and status filters compose", () => {
  const items = initialState().items;
  assert.equal(filterItems(items, "  오트  ", "urgent").length, 1);
  assert.equal(filterItems(items, "오트", "normal").length, 0);
  assert.equal(filterItems(items, "", "low").length, 5);
  assert.ok(
    filterItems(items, "음료", "all").every((item) => item.category === "음료"),
  );
});
test("stock rejects negatives, fractions and overflow and records valid changes", () => {
  const state = initialState();
  for (const value of [-1, 1.5, NaN, Infinity, 1000000])
    assert.equal(reduce(state, { type: "stock", id: "oat", value }), state);
  const next = reduce(state, { type: "stock", id: "oat", value: 5 });
  assert.equal(statusOf(next.items[0]), "normal");
  assert.equal(suggestedOrder(next.items[0]), 5);
  assert.match(next.history[0].text, /2 → 5/);
});
test("queue duplicates preserve user quantity; order clears queue without simulating receipt", () => {
  let state = reduce(initialState(), { type: "queue-add", id: "oat" });
  assert.equal(state.queue[0].quantity, 8);
  state = reduce(state, { type: "queue-quantity", id: "oat", value: 9 });
  state = reduce(state, { type: "queue-add", id: "oat" });
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0].quantity, 9);
  assert.equal(
    reduce(state, { type: "queue-quantity", id: "oat", value: 0 }),
    state,
  );
  state = reduce(state, { type: "order" });
  assert.equal(state.queue.length, 0);
  assert.equal(state.items[0].stock, 2);
  assert.match(state.history[0].text, /오트밀크 9개/);
});
test("item CRUD cleans dependent queue and retains history", () => {
  let state = initialState();
  const item = {
    id: "test",
    name: "테스트 품목",
    category: "음료",
    unit: "1L",
    stock: 1,
    minimum: 2,
    target: 3,
  };
  state = reduce(state, { type: "save", item });
  assert.equal(state.items.length, 11);
  state = reduce(state, { type: "save", item: { ...item, name: "수정 품목" } });
  assert.equal(state.items.length, 11);
  state = reduce(state, { type: "queue-add", id: "test" });
  state = reduce(state, { type: "delete", id: "test" });
  assert.equal(state.items.length, 10);
  assert.equal(state.queue.length, 0);
  assert.equal(state.history.length, 3);
});
test("persisted data validation detects corrupted items and orphan/duplicate queue entries", () => {
  const state = initialState();
  assert.ok(isValidState(state));
  assert.ok(!isValidState(null));
  assert.ok(
    !isValidState({ ...state, items: [...state.items, state.items[0]] }),
  );
  assert.ok(
    !isValidState({ ...state, queue: [{ id: "missing", quantity: 1 }] }),
  );
  assert.ok(
    !isValidState({
      ...state,
      history: [{ id: "1", text: "test", date: "invalid" }],
    }),
  );
  assert.ok(
    !isValidState({ ...state, items: [{ ...state.items[0], target: 1 }] }),
  );
});
