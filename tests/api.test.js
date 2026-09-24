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

    const created = await call("/items", "POST", {
      name: "API 테스트 품목", category: "음료", unit: "1L",
      stock: 2, minimum: 5, target: 10,
    });
    assert.equal(created.status, 201);
    const id = created.payload.data.id;
    assert.ok(id);
    assert.ok(created.payload.data.createdAt);
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
    const order = await call("/orders", "POST");
    assert.equal(order.status, 201);
    assert.equal(order.payload.data.lines[0].quantity, 7);
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
  } finally {
    server.close();
    await prisma.$disconnect();
  }
});
