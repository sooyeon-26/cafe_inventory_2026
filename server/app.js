import express from "express";
import { Prisma } from "@prisma/client";
import { MAX_QUANTITY } from "../src/inventory.js";
import { recommendationsForItems } from "./reorder.js";

const itemFields = ["name", "category", "unit", "stock", "minimum", "target", "leadTimeDays"];
const textLimits = { name: 60, category: 30, unit: 20 };
const movementTypes = new Set(["USAGE", "RESTOCK", "WASTE", "ADJUSTMENT"]);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (message) => new HttpError(400, "VALIDATION_ERROR", message);
const notFound = (message) => new HttpError(404, "NOT_FOUND", message);
const conflict = (message) => new HttpError(409, "CONFLICT", message);
const quantity = (value, field, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min || value > MAX_QUANTITY)
    throw badRequest(`${field}은(는) ${min}~${MAX_QUANTITY} 사이 정수여야 합니다.`);
  return value;
};

function itemInput(body, previous) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw badRequest("품목 정보를 입력해 주세요.");
  if (Object.keys(body).some((key) => !itemFields.includes(key)))
    throw badRequest("지원하지 않는 품목 필드가 있습니다.");
  if (!previous && itemFields.some((key) => key !== "leadTimeDays" && !(key in body)))
    throw badRequest("품목 정보를 모두 입력해 주세요.");
  if (previous && !Object.keys(body).length)
    throw badRequest("수정할 필드를 입력해 주세요.");

  const data = {};
  for (const key of itemFields) {
    if (!(key in body)) continue;
    if (key in textLimits) {
      const value = body[key];
      if (typeof value !== "string" || !value.trim() || value.trim().length > textLimits[key])
        throw badRequest(`${key}은(는) 1~${textLimits[key]}자여야 합니다.`);
      data[key] = value.trim();
    } else if (key === "leadTimeDays") {
      data[key] = quantity(body[key], key, 1);
      if (data[key] > 365) throw badRequest("leadTimeDays는 1~365일이어야 합니다.");
    } else {
      data[key] = quantity(body[key], key);
    }
  }
  if ((data.target ?? previous?.target) < (data.minimum ?? previous?.minimum))
    throw badRequest("적정 재고는 최소 재고 이상이어야 합니다.");
  return data;
}

const itemResponse = (item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  unit: item.unit,
  stock: item.stock,
  minimum: item.minimum,
  target: item.target,
  leadTimeDays: item.leadTimeDays,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

async function itemResponses(db, items) {
  const recommendations = await recommendationsForItems(db, items);
  return items.map((item) => ({ ...itemResponse(item), ...recommendations.get(item.id) }));
}

const historyResponse = (activity, movements) => [
  ...activity.map((event) => ({ ...event, kind: "activity" })),
  ...movements.map((movement) => ({ ...movement, kind: "movement", date: movement.createdAt })),
].sort((a, b) => b.date - a.date || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

function decodeHistoryCursor(value) {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 512) throw badRequest("올바른 History 커서를 입력해 주세요.");
  try {
    const { date, kind, id } = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsedDate = new Date(date);
    if (!Number.isFinite(parsedDate.getTime()) || !["activity", "movement"].includes(kind) ||
        typeof id !== "string" || !id) throw new Error("Invalid cursor");
    return { date: parsedDate, kind, id };
  } catch {
    throw badRequest("올바른 History 커서를 입력해 주세요.");
  }
}

async function historyPage(db, cursor, limit) {
  const activityWhere = cursor?.kind === "activity"
    ? { OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { gt: cursor.id } }] }
    : cursor ? { date: { lt: cursor.date } } : undefined;
  const movementWhere = cursor?.kind === "movement"
    ? { OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, id: { gt: cursor.id } }] }
    : cursor ? { createdAt: { lte: cursor.date } } : undefined;
  const [activity, movements] = await Promise.all([
    db.activityEvent.findMany({ where: activityWhere, orderBy: [{ date: "desc" }, { id: "asc" }], take: limit + 1 }),
    db.stockMovement.findMany({ where: movementWhere, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1 }),
  ]);
  const combined = historyResponse(activity, movements);
  const entries = combined.slice(0, limit);
  const last = entries.at(-1);
  const hasMore = combined.length > limit;
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ date: last.date, kind: last.kind, id: last.id })).toString("base64url") : null;
  return { entries, nextCursor, hasMore };
}

const queueResponse = (queue) => queue.map((entry) => ({ id: entry.itemId, quantity: entry.quantity }));
const orderInclude = { lines: { orderBy: { position: "asc" } } };
const orderResponse = (order) => ({
  ...order,
  lines: order.lines.map(({ itemId, name, unit, orderedQuantity, receivedQuantity }) => ({
    itemId, name, unit, quantity: orderedQuantity, receivedQuantity,
    remainingQuantity: orderedQuantity - receivedQuantity,
  })),
});

function movementNote(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 240)
    throw badRequest("메모는 240자 이하여야 합니다.");
  return value.trim() || null;
}

function movementType(value) {
  if (!movementTypes.has(value)) throw badRequest("올바른 재고 변경 유형을 선택해 주세요.");
  return value;
}

function assertMovementDirection(type, change) {
  if (!change) throw badRequest("재고 변경량은 0일 수 없습니다.");
  if (type === "RESTOCK" && change < 0)
    throw badRequest("입고 수량은 증가해야 합니다.");
  if ((type === "USAGE" || type === "WASTE") && change > 0)
    throw badRequest("사용·폐기 수량은 감소해야 합니다.");
}

async function activeItemForUpdate(tx, id) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
  if (!rows.length) throw notFound("품목을 찾을 수 없습니다.");
  return tx.item.findUnique({ where: { id } });
}

async function orderForUpdate(tx, id) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw notFound("발주를 찾을 수 없습니다.");
  return tx.order.findUnique({ where: { id }, include: orderInclude });
}

async function recordStockChange(tx, item, { type, afterQuantity, note, orderId }, allowNoChange = false) {
  quantity(afterQuantity, "stock");
  const quantityChange = afterQuantity - item.stock;
  if (!quantityChange && allowNoChange) return { item, movement: null };
  assertMovementDirection(type, quantityChange);
  const updated = await tx.item.update({ where: { id: item.id }, data: { stock: afterQuantity } });
  const movement = await tx.stockMovement.create({ data: {
    itemId: item.id,
    itemName: item.name,
    type,
    quantityChange,
    beforeQuantity: item.stock,
    afterQuantity,
    note,
    ...(orderId ? { orderId } : {}),
  } });
  return { item: updated, movement };
}

function movementInput(body, currentStock) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw badRequest("재고 변경 정보를 입력해 주세요.");
  const type = movementType(body.type);
  const allowed = type === "ADJUSTMENT"
    ? ["type", "afterQuantity", "quantityChange", "note"]
    : ["type", "quantity", "note"];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw badRequest("지원하지 않는 재고 변경 필드가 있습니다.");
  let afterQuantity;
  if (type === "ADJUSTMENT") {
    if (("afterQuantity" in body) === ("quantityChange" in body))
      throw badRequest("변경 후 수량 또는 변경량 중 하나만 입력해 주세요.");
    if ("quantityChange" in body) {
      const change = body.quantityChange;
      if (!Number.isSafeInteger(change) || !change || Math.abs(change) > MAX_QUANTITY)
        throw badRequest("변경량은 0이 아닌 정수여야 합니다.");
      afterQuantity = currentStock + change;
    } else {
      afterQuantity = quantity(body.afterQuantity, "afterQuantity");
    }
  } else {
    afterQuantity = currentStock + (type === "RESTOCK"
      ? quantity(body.quantity, "quantity", 1)
      : -quantity(body.quantity, "quantity", 1));
  }
  return { type, afterQuantity, note: movementNote(body.note) };
}

export function createApp(prisma) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  const router = express.Router();
  router.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: "ok" } });
  });
  router.get("/state", async (_req, res) => {
    const { queue, history, itemData } = await prisma.$transaction(async (tx) => {
      const [items, queue, history] = await Promise.all([
        tx.item.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
        tx.queueEntry.findMany({ orderBy: { createdAt: "asc" } }),
        historyPage(tx, null, 20),
      ]);
      return { queue, history, itemData: await itemResponses(tx, items) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    res.json({ data: {
      items: itemData,
      queue: queueResponse(queue),
      history: history.entries,
    } });
  });
  router.get("/history", async (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw badRequest("limit은 1~100 사이 정수여야 합니다.");
    const cursor = decodeHistoryCursor(req.query.cursor);
    const history = await prisma.$transaction((tx) => historyPage(tx, cursor, limit), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    res.json({ data: history });
  });
  router.get("/items", async (_req, res) => {
    const items = await prisma.item.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } });
    res.json({ data: await itemResponses(prisma, items) });
  });
  router.get("/items/:id", async (req, res) => {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item || item.deletedAt) throw notFound("품목을 찾을 수 없습니다.");
    res.json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.post("/items", async (req, res) => {
    const data = itemInput(req.body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({ data: { ...data, stock: 0 } });
      await tx.activityEvent.create({ data: { text: `${created.name} · 품목 등록` } });
      if (!data.stock) return created;
      return (await recordStockChange(tx, created, {
        type: "ADJUSTMENT", afterQuantity: data.stock, note: "초기 재고",
      })).item;
    });
    res.status(201).json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.patch("/items/:id", async (req, res) => {
    const item = await prisma.$transaction(async (tx) => {
      const previous = await activeItemForUpdate(tx, req.params.id);
      const data = itemInput(req.body, previous);
      const { stock, ...fields } = data;
      let updated = Object.keys(fields).length
        ? await tx.item.update({ where: { id: previous.id }, data: fields })
        : previous;
      if (itemFields.some((key) => key !== "stock" && data[key] !== undefined && data[key] !== previous[key]))
        await tx.activityEvent.create({ data: { text: `${updated.name} · 품목 수정` } });
      if (stock !== undefined && stock !== previous.stock)
        updated = (await recordStockChange(tx, updated, {
          type: "ADJUSTMENT", afterQuantity: stock, note: "품목 수정",
        })).item;
      return updated;
    });
    res.json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.patch("/items/:id/stock", async (req, res) => {
    if (!req.body || !("stock" in req.body) || Object.keys(req.body).some((key) => !["stock", "type", "note"].includes(key)))
      throw badRequest("stock 값을 입력해 주세요.");
    const stock = quantity(req.body.stock, "stock");
    const type = movementType(req.body.type ?? "ADJUSTMENT");
    const note = movementNote(req.body.note);
    const item = await prisma.$transaction(async (tx) => {
      const previous = await activeItemForUpdate(tx, req.params.id);
      return (await recordStockChange(tx, previous, {
        type, afterQuantity: stock, note,
      }, true)).item;
    });
    res.json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.post("/items/:id/movements", async (req, res) => {
    const movement = await prisma.$transaction(async (tx) => {
      const item = await activeItemForUpdate(tx, req.params.id);
      return (await recordStockChange(tx, item, movementInput(req.body, item.stock))).movement;
    });
    res.status(201).json({ data: movement });
  });
  router.get("/items/:id/movements", async (req, res) => {
    const item = await prisma.item.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!item) throw notFound("품목을 찾을 수 없습니다.");
    const movements = await prisma.stockMovement.findMany({
      where: { itemId: item.id }, orderBy: { createdAt: "desc" },
    });
    res.json({ data: movements });
  });
  router.get("/movements", async (req, res) => {
    const where = {};
    if (req.query.itemId !== undefined) {
      if (typeof req.query.itemId !== "string" || !req.query.itemId)
        throw badRequest("올바른 itemId를 입력해 주세요.");
      where.itemId = req.query.itemId;
    }
    if (req.query.type !== undefined) where.type = movementType(req.query.type);
    const movements = await prisma.stockMovement.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: movements });
  });
  router.delete("/items/:id", async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const item = await activeItemForUpdate(tx, req.params.id);
      await tx.queueEntry.deleteMany({ where: { itemId: item.id } });
      await tx.item.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
      await tx.activityEvent.create({ data: { text: `${item.name} · 품목 삭제` } });
    });
    res.json({ data: { id: req.params.id } });
  });
  router.get("/queue", async (_req, res) => {
    const queue = await prisma.queueEntry.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ data: queueResponse(queue) });
  });
  router.post("/queue", async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.id !== "string")
      throw badRequest("품목 id를 입력해 주세요.");
    const entry = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: req.body.id } });
      if (!item || item.deletedAt) throw notFound("품목을 찾을 수 없습니다.");
      const existing = await tx.queueEntry.findUnique({ where: { itemId: item.id } });
      if (existing) return existing;
      const suggested = (await recommendationsForItems(tx, [item])).get(item.id).recommendedQuantity;
      if (!suggested) throw badRequest("현재 품목은 추가 발주가 필요하지 않습니다.");
      return tx.queueEntry.create({ data: { itemId: item.id, quantity: suggested } });
    });
    res.status(201).json({ data: { id: entry.itemId, quantity: entry.quantity } });
  });
  router.patch("/queue/:id", async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || !("quantity" in req.body))
      throw badRequest("발주 수량을 입력해 주세요.");
    const value = quantity(req.body.quantity, "quantity", 1);
    const entry = await prisma.queueEntry.update({ where: { itemId: req.params.id }, data: { quantity: value } });
    res.json({ data: { id: entry.itemId, quantity: entry.quantity } });
  });
  router.delete("/queue/:id", async (req, res) => {
    await prisma.queueEntry.delete({ where: { itemId: req.params.id } });
    res.json({ data: { id: req.params.id } });
  });
  router.post("/orders", async (_req, res) => {
    const order = await prisma.$transaction(async (tx) => {
      const queue = await tx.queueEntry.findMany({ include: { item: true }, orderBy: { createdAt: "asc" } });
      if (!queue.length) throw badRequest("발주 목록이 비어 있습니다.");
      const lines = queue.map((entry, position) => ({
        itemId: entry.itemId, position, name: entry.item.name, unit: entry.item.unit,
        orderedQuantity: entry.quantity,
      }));
      const created = await tx.order.create({ data: { lines: { create: lines } }, include: orderInclude });
      await tx.activityEvent.create({ data: { text: `발주 생성 · ${lines.map((line) => `${line.name} ${line.orderedQuantity}개`).join(", ")}` } });
      await tx.queueEntry.deleteMany({});
      return created;
    });
    res.status(201).json({ data: orderResponse(order) });
  });
  router.get("/orders", async (_req, res) => {
    const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: orderInclude });
    res.json({ data: orders.map(orderResponse) });
  });
  router.get("/orders/:id", async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: orderInclude });
    if (!order) throw notFound("발주를 찾을 수 없습니다.");
    res.json({ data: orderResponse(order) });
  });
  router.post("/orders/:id/receive", async (req, res) => {
    const body = req.body;
    if (body && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "lines")))
      throw badRequest("입고 요청에는 lines만 입력해 주세요.");
    const requested = body?.lines;
    if (requested !== undefined && (!Array.isArray(requested) || !requested.length || requested.some((line) =>
      !line || typeof line !== "object" || Array.isArray(line) ||
      Object.keys(line).some((key) => !["itemId", "quantity"].includes(key)) ||
      typeof line.itemId !== "string" || !line.itemId)))
      throw badRequest("입고 품목과 수량을 입력해 주세요.");
    if (requested) {
      const ids = requested.map((line) => line.itemId);
      if (new Set(ids).size !== ids.length) throw badRequest("입고 품목이 중복되었습니다.");
      requested.forEach((line) => quantity(line.quantity, "입고 수량", 1));
    }
    const received = await prisma.$transaction(async (tx) => {
      const order = await orderForUpdate(tx, req.params.id);
      if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)) throw conflict("이미 입고가 완료된 발주입니다.");
      if (!order.lines.length) throw conflict("입고할 품목이 없습니다.");
      const receipt = requested ?? order.lines.filter((line) => line.receivedQuantity < line.orderedQuantity)
        .map((line) => ({ itemId: line.itemId, quantity: line.orderedQuantity - line.receivedQuantity }));
      if (!receipt.length) throw conflict("입고할 잔여 수량이 없습니다.");
      for (const entry of receipt) {
        const line = order.lines.find((candidate) => candidate.itemId === entry.itemId);
        if (!line) throw badRequest("발주에 없는 품목입니다.");
        if (entry.quantity > line.orderedQuantity - line.receivedQuantity) throw conflict("입고 수량이 잔여 발주 수량을 초과합니다.");
      }
      for (const entry of [...receipt].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
        const item = await activeItemForUpdate(tx, entry.itemId).catch((error) => {
          if (error.status === 404) throw conflict("삭제된 품목이 있어 입고할 수 없습니다.");
          throw error;
        });
        await recordStockChange(tx, item, {
          type: "RESTOCK", afterQuantity: item.stock + entry.quantity, note: `발주 ${order.id} 입고`, orderId: order.id,
        });
        await tx.orderLine.update({ where: { orderId_itemId: { orderId: order.id, itemId: entry.itemId } },
          data: { receivedQuantity: { increment: entry.quantity } } });
      }
      const fullyReceived = order.lines.every((line) => line.receivedQuantity +
        (receipt.find((entry) => entry.itemId === line.itemId)?.quantity ?? 0) === line.orderedQuantity);
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", ...(fullyReceived ? { receivedAt: new Date() } : {}) },
        include: orderInclude,
      });
      await tx.activityEvent.create({ data: { text: `발주 ${fullyReceived ? "입고 완료" : "부분 입고"} · ${receipt.map((entry) => `${order.lines.find((line) => line.itemId === entry.itemId).name} ${entry.quantity}개`).join(", ")}` } });
      return updated;
    });
    res.json({ data: orderResponse(received) });
  });
  router.post("/orders/:id/complete", async (req, res) => {
    if (req.body && Object.keys(req.body).length) throw badRequest("완료 요청에는 본문을 입력하지 마세요.");
    const completed = await prisma.$transaction(async (tx) => {
      const order = await orderForUpdate(tx, req.params.id);
      if (order.status !== "RECEIVED") throw conflict("입고된 발주만 완료할 수 있습니다.");
      const updated = await tx.order.update({
        where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date() }, include: orderInclude,
      });
      await tx.activityEvent.create({ data: { text: `발주 완료 · ${order.id}` } });
      return updated;
    });
    res.json({ data: orderResponse(completed) });
  });
  app.use("/api", router);
  // The same resource paths are available directly for non-browser API clients.
  app.use("/", router);
  app.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "경로를 찾을 수 없습니다." } }));
  app.use((error, _req, res, _next) => {
    void _next;
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "데이터를 찾을 수 없습니다." } });
    if (error instanceof SyntaxError && "body" in error)
      return res.status(400).json({ error: { code: "INVALID_JSON", message: "올바른 JSON을 입력해 주세요." } });
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." } });
  });
  return app;
}
