import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../server/app.js";
import { seedItems } from "../src/data.js";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL은 이름이 _test로 끝나는 별도 PostgreSQL DB를 가리켜야 합니다.");

test("item API persists CRUD, stock, queue and order changes in PostgreSQL", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });
  await prisma.$connect();
  await prisma.$transaction([
    prisma.stockMovement.deleteMany(),
    prisma.queueEntry.deleteMany(),
    prisma.activityEvent.deleteMany(),
    prisma.order.deleteMany(),
    prisma.item.deleteMany(),
  ]);
  for (const item of seedItems) await prisma.item.create({ data: item });
  const server = createApp(prisma).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = "GET", data) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, payload: await response.json() };
  };
  try {
    const health = await call("/health");
    assert.equal(health.status, 200);
    const items = await call("/items");
    assert.equal(items.status, 200);
    assert.ok(items.payload.data.some((item) => item.id === "oat"));
    assert.deepEqual((await call("/queue")).payload.data, []);
    assert.deepEqual((await call("/history")).payload.data, { entries: [], nextCursor: null, hasMore: false });
    const oat = items.payload.data.find((item) => item.id === "oat");
    assert.equal(oat.leadTimeDays, 2);
    assert.equal(oat.averageDailyUsage, 0);
    assert.equal(oat.estimatedDaysUntilStockout, null);
    assert.equal(oat.reorderStatus, "reorder");
    assert.equal(oat.recommendedQuantity, 8);

    const created = await call("/items", "POST", {
      name: "API 테스트 품목", category: "음료", unit: "1L",
      stock: 2, minimum: 5, target: 10,
    });
    assert.equal(created.status, 201);
    const id = created.payload.data.id;
    assert.ok(id);
    assert.ok(created.payload.data.createdAt);
    assert.equal(created.payload.data.leadTimeDays, 2);
    const opening = (await call(`/items/${id}/movements`)).payload.data;
    assert.equal(opening.length, 1);
    assert.deepEqual(
      [opening[0].type, opening[0].quantityChange, opening[0].beforeQuantity, opening[0].afterQuantity],
      ["ADJUSTMENT", 2, 0, 2],
    );
    assert.equal((await call(`/items/${id}`)).payload.data.stock, 2);
    assert.equal((await call("/items/missing")).status, 404);
    assert.equal((await call("/items", "POST", {
      name: "invalid", category: "x", unit: "x", stock: -1, minimum: 1, target: 1,
    })).status, 400);

    const patched = await call(`/items/${id}`, "PATCH", { name: "수정 품목", minimum: 4, target: 8 });
    assert.equal(patched.status, 200);
    assert.equal(patched.payload.data.minimum, 4);
    assert.equal((await call(`/items/${id}`, "PATCH", { leadTimeDays: 3 })).payload.data.leadTimeDays, 3);
    assert.equal((await call(`/items/${id}`, "PATCH", { leadTimeDays: 0 })).status, 400);
    assert.equal((await call(`/items/${id}`, "PATCH", { leadTimeDays: 366 })).status, 400);
    assert.equal((await call(`/items/${id}`, "PATCH", { target: 1 })).status, 400);
    const manualEdit = await call(`/items/${id}`, "PATCH", { stock: 4 });
    assert.equal(manualEdit.payload.data.stock, 4);
    assert.equal((await call(`/items/${id}/movements`)).payload.data[0].type, "ADJUSTMENT");
    const stock = await call(`/items/${id}/stock`, "PATCH", { stock: 3 });
    assert.equal(stock.status, 200);
    assert.equal((await call(`/items/${id}`)).payload.data.stock, 3);
    assert.equal((await call(`/items/${id}/stock`, "PATCH", { stock: 1.5 })).status, 400);

    const usage = await call(`/items/${id}/movements`, "POST", {
      type: "USAGE", quantity: 2, note: "오전 사용",
    });
    assert.equal(usage.status, 201);
    assert.deepEqual(
      [usage.payload.data.quantityChange, usage.payload.data.beforeQuantity, usage.payload.data.afterQuantity],
      [-2, 3, 1],
    );
    assert.equal((await call(`/items/${id}`)).payload.data.stock, 1);
    assert.equal((await call(`/items/${id}`)).payload.data.averageDailyUsage, 2 / 7);
    const restock = await call(`/items/${id}/movements`, "POST", { type: "RESTOCK", quantity: 10 });
    assert.deepEqual(
      [restock.payload.data.quantityChange, restock.payload.data.beforeQuantity, restock.payload.data.afterQuantity],
      [10, 1, 11],
    );
    const waste = await call(`/items/${id}/movements`, "POST", { type: "WASTE", quantity: 1 });
    assert.deepEqual(
      [waste.payload.data.quantityChange, waste.payload.data.beforeQuantity, waste.payload.data.afterQuantity],
      [-1, 11, 10],
    );
    const adjusted = await call(`/items/${id}/movements`, "POST", { type: "ADJUSTMENT", afterQuantity: 3 });
    assert.deepEqual(
      [adjusted.payload.data.quantityChange, adjusted.payload.data.beforeQuantity, adjusted.payload.data.afterQuantity],
      [-7, 10, 3],
    );
    assert.equal((await call(`/items/${id}`)).payload.data.averageDailyUsage, 2 / 7);
    assert.equal((await call(`/items/${id}/movements`, "POST", { type: "USAGE", quantity: 4 })).status, 400);
    assert.equal((await call(`/items/${id}/movements`, "POST", { type: "RESTOCK", quantity: 0 })).status, 400);
    assert.equal((await call(`/items/${id}/movements`, "POST", { type: "UNKNOWN", quantity: 1 })).status, 400);
    assert.equal((await call("/movements?type=WASTE&itemId=" + id)).payload.data.length, 1);
    const concurrent = await Promise.all([
      call(`/items/${id}/movements`, "POST", { type: "ADJUSTMENT", quantityChange: 1 }),
      call(`/items/${id}/movements`, "POST", { type: "ADJUSTMENT", quantityChange: 1 }),
    ]);
    assert.deepEqual(concurrent.map((result) => result.status), [201, 201]);
    assert.deepEqual(
      concurrent.map((result) => [result.payload.data.beforeQuantity, result.payload.data.afterQuantity])
        .sort((a, b) => a[0] - b[0]),
      [[3, 4], [4, 5]],
    );
    assert.equal((await call(`/items/${id}`)).payload.data.stock, 5);
    await call(`/items/${id}/movements`, "POST", { type: "ADJUSTMENT", afterQuantity: 3 });
    const history = (await call("/state")).payload.data.history;
    assert.ok(history.some((event) => event.kind === "movement" && event.id === usage.payload.data.id));
    assert.ok((await call("/history")).payload.data.entries.some((event) => event.id === usage.payload.data.id));

    const countBeforeFailure = await prisma.stockMovement.count({ where: { itemId: id } });
    await prisma.$executeRawUnsafe('ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_rollback_test" CHECK ("note" <> \'rollback-probe\')');
    try {
      const failed = await call(`/items/${id}/movements`, "POST", {
        type: "RESTOCK", quantity: 2, note: "rollback-probe",
      });
      assert.equal(failed.status, 500);
      assert.equal((await call(`/items/${id}`)).payload.data.stock, 3);
      assert.equal(await prisma.stockMovement.count({ where: { itemId: id } }), countBeforeFailure);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_rollback_test"');
    }

    const queued = await call("/queue", "POST", { id });
    assert.equal(queued.payload.data.quantity, 5);
    assert.equal((await call("/queue", "POST", { id })).payload.data.quantity, 5);
    await call(`/queue/${id}`, "PATCH", { quantity: 7 });
    const persisted = await call("/state");
    assert.equal(persisted.payload.data.queue.find((entry) => entry.id === id).quantity, 7);
    assert.equal((await call("/queue")).payload.data.find((entry) => entry.id === id).quantity, 7);
    const order = await call("/orders", "POST");
    assert.equal(order.status, 201);
    assert.equal(order.payload.data.status, "ORDERED");
    assert.equal(order.payload.data.lines[0].quantity, 7);
    assert.equal((await call("/orders")).payload.data[0].id, order.payload.data.id);
    assert.equal((await call(`/orders/${order.payload.data.id}`)).payload.data.status, "ORDERED");
    assert.equal((await call(`/orders/${order.payload.data.id}/complete`, "POST")).status, 409);
    assert.equal((await call("/state")).payload.data.queue.length, 0);
    assert.equal((await call(`/items/${id}`)).payload.data.stock, 3);

    await call("/queue", "POST", { id });
    assert.equal((await call(`/items/${id}`, "DELETE")).status, 200);
    assert.equal((await call(`/items/${id}`)).status, 404);
    assert.ok((await call(`/movements?itemId=${id}`)).payload.data.length >= 6);
    assert.ok((await call(`/items/${id}/movements`)).payload.data.length >= 6);
    assert.ok((await prisma.item.findUnique({ where: { id } })).deletedAt);
    assert.ok((await call("/state")).payload.data.history.some((event) =>
      event.kind === "movement" && event.itemId === id));
    assert.ok(!(await call("/state")).payload.data.queue.some((entry) => entry.id === id));
    assert.ok((await prisma.order.findUnique({ where: { id: order.payload.data.id } })).lines.length);

    const fast = await call("/items", "POST", {
      name: "빠른 소진", category: "재료", unit: "개",
      stock: 36, minimum: 5, target: 10, leadTimeDays: 2,
    });
    const fastId = fast.payload.data.id;
    assert.equal(fast.payload.data.reorderStatus, "normal");
    const consumed = await call(`/items/${fastId}/movements`, "POST", { type: "USAGE", quantity: 28 });
    assert.equal(consumed.status, 201);
    const recommendation = (await call(`/items/${fastId}`)).payload.data;
    assert.equal(recommendation.stock, 8);
    assert.equal(recommendation.averageDailyUsage, 4);
    assert.equal(recommendation.estimatedDaysUntilStockout, 2);
    assert.equal(recommendation.reorderStatus, "reorder");
    assert.equal(recommendation.recommendedQuantity, 5);
    assert.equal((await call("/state")).payload.data.items.find((item) => item.id === fastId).recommendedQuantity, 5);
    assert.equal((await call("/queue", "POST", { id: fastId })).payload.data.quantity, 5);
    await prisma.stockMovement.update({
      where: { id: consumed.payload.data.id },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const expired = (await call(`/items/${fastId}`)).payload.data;
    assert.equal(expired.averageDailyUsage, 0);
    assert.equal(expired.estimatedDaysUntilStockout, null);
    assert.equal(expired.reorderStatus, "normal");
    assert.equal(expired.recommendedQuantity, 2);
    const empty = await call("/items", "POST", {
      name: "재고 없음", category: "재료", unit: "개", stock: 0, minimum: 0, target: 10,
    });
    assert.equal(empty.payload.data.reorderStatus, "urgent");

    const receiveItem = await call("/items", "POST", {
      name: "입고 테스트", category: "재료", unit: "개", stock: 2, minimum: 5, target: 10,
    });
    const receiveId = receiveItem.payload.data.id;
    await call("/queue", "POST", { id: receiveId });
    const receivingOrder = await call("/orders", "POST");
    const receivingId = receivingOrder.payload.data.id;
    const beforeReceipt = await prisma.stockMovement.count({ where: { itemId: receiveId } });
    const received = await call(`/orders/${receivingId}/receive`, "POST");
    assert.equal(received.status, 200);
    assert.equal(received.payload.data.status, "RECEIVED");
    assert.ok(received.payload.data.receivedAt);
    assert.equal((await call(`/items/${receiveId}`)).payload.data.stock, 10);
    assert.equal(await prisma.stockMovement.count({ where: { itemId: receiveId } }), beforeReceipt + 1);
    assert.equal((await prisma.stockMovement.findFirst({ where: { itemId: receiveId, type: "RESTOCK" } })).quantityChange, 8);
    assert.equal((await call(`/orders/${receivingId}/receive`, "POST")).status, 409);
    const completed = await call(`/orders/${receivingId}/complete`, "POST");
    assert.equal(completed.payload.data.status, "COMPLETED");
    assert.ok(completed.payload.data.completedAt);
    assert.equal((await call(`/orders/${receivingId}/complete`, "POST")).status, 409);
    assert.equal((await call(`/orders/${receivingId}`)).payload.data.status, "COMPLETED");
    assert.equal((await call("/orders/missing/receive", "POST")).status, 404);

    const first = await call("/items", "POST", {
      name: "부분 입고 방지 1", category: "재료", unit: "개", stock: 2, minimum: 5, target: 10,
    });
    const second = await call("/items", "POST", {
      name: "부분 입고 방지 2", category: "재료", unit: "개", stock: 1, minimum: 5, target: 10,
    });
    await call("/queue", "POST", { id: first.payload.data.id });
    await call("/queue", "POST", { id: second.payload.data.id });
    const blockedOrder = await call("/orders", "POST");
    const firstMovementCount = await prisma.stockMovement.count({ where: { itemId: first.payload.data.id } });
    await call(`/items/${second.payload.data.id}`, "DELETE");
    assert.equal((await call(`/orders/${blockedOrder.payload.data.id}/receive`, "POST")).status, 409);
    assert.equal((await call(`/orders/${blockedOrder.payload.data.id}`)).payload.data.status, "ORDERED");
    assert.equal((await call(`/items/${first.payload.data.id}`)).payload.data.stock, 2);
    assert.equal(await prisma.stockMovement.count({ where: { itemId: first.payload.data.id } }), firstMovementCount);

    await prisma.activityEvent.createMany({ data: Array.from({ length: 25 }, (_, index) => ({
      text: `페이지 테스트 ${index}`,
    })) });
    const totalEvents = await prisma.activityEvent.count() + await prisma.stockMovement.count();
    const pages = [];
    let cursor = null;
    for (let page = 1; ; page += 1) {
      const result = await call(`/history?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      assert.equal(result.status, 200);
      assert.ok(result.payload.data.entries.length <= 10);
      pages.push(...result.payload.data.entries);
      if (page === 1) await prisma.activityEvent.create({ data: {
        text: "페이지 조회 중 새 기록", date: new Date(Date.now() + 60_000),
      } });
      if (!result.payload.data.hasMore) break;
      cursor = result.payload.data.nextCursor;
      assert.ok(cursor);
    }
    assert.equal(pages.length, totalEvents);
    assert.equal(new Set(pages.map((event) => event.id)).size, totalEvents);
    assert.ok((await call("/state")).payload.data.history.length <= 20);
    assert.equal((await call("/history?limit=0")).status, 400);
    assert.equal((await call("/history?cursor=bad")).status, 400);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
});
