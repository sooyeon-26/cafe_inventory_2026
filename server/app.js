import express from "express";
import { Prisma } from "@prisma/client";
import { MAX_QUANTITY } from "../src/inventory.js";

const itemFields = ["name", "category", "unit", "stock", "minimum", "target"];
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
  if (!previous && itemFields.some((key) => !(key in body)))
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
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
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

async function recordStockChange(tx, item, { type, afterQuantity, note }, allowNoChange = false) {
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
    const [items, queue, activity, movements] = await prisma.$transaction([
      prisma.item.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.queueEntry.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.activityEvent.findMany({ orderBy: { date: "desc" } }),
      prisma.stockMovement.findMany({ orderBy: { createdAt: "desc" } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const history = [
      ...activity.map((event) => ({ ...event, kind: "activity" })),
      ...movements.map((movement) => ({ ...movement, kind: "movement", date: movement.createdAt })),
    ].sort((a, b) => b.date - a.date);
    res.json({ data: {
      items: items.map(itemResponse),
      queue: queue.map((entry) => ({ id: entry.itemId, quantity: entry.quantity })),
      history,
    } });
  });
  router.get("/items", async (_req, res) => {
    const items = await prisma.item.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } });
    res.json({ data: items.map(itemResponse) });
  });
  router.get("/items/:id", async (req, res) => {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item || item.deletedAt) throw notFound("품목을 찾을 수 없습니다.");
    res.json({ data: itemResponse(item) });
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
    res.status(201).json({ data: itemResponse(item) });
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
    res.json({ data: itemResponse(item) });
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
    res.json({ data: itemResponse(item) });
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
  router.post("/queue", async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.id !== "string")
      throw badRequest("품목 id를 입력해 주세요.");
    const entry = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: req.body.id } });
      if (!item || item.deletedAt) throw notFound("품목을 찾을 수 없습니다.");
      const existing = await tx.queueEntry.findUnique({ where: { itemId: item.id } });
      if (existing) return existing;
      const suggested = Math.max(item.target - item.stock, 0);
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
      const lines = queue.map((entry) => ({
        itemId: entry.itemId,
        name: entry.item.name,
        unit: entry.item.unit,
        quantity: entry.quantity,
      }));
      const created = await tx.order.create({ data: { lines } });
      await tx.activityEvent.create({ data: { text: `발주 생성 · ${lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}` } });
      await tx.queueEntry.deleteMany({});
      return created;
    });
    res.status(201).json({ data: order });
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
