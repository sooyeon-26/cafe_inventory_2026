import express from "express";
import { Prisma } from "@prisma/client";
import { recommendationsForItems } from "./reorder.js";
import { HttpError, badRequest, notFound, quantity, movementType, movementNote } from "./validation.js";
import { createItem, updateItem, updateStock, createMovement, deleteItem } from "./inventory-service.js";
import { orderInclude, orderResponse, createOrder, receiveOrder, completeOrder } from "./order-service.js";

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

async function historyPage(db, cursor, limit, filter = {}) {
  const activityWhere = cursor?.kind === "activity"
    ? { OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { gt: cursor.id } }] }
    : cursor ? { date: { lt: cursor.date } } : undefined;
  const movementWhere = cursor?.kind === "movement"
    ? { OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, id: { gt: cursor.id } }] }
    : cursor ? { createdAt: { lte: cursor.date } } : undefined;
  const [activity, movements] = await Promise.all([
    db.activityEvent.findMany({ where: { ...activityWhere, ...filter }, orderBy: [{ date: "desc" }, { id: "asc" }], take: limit + 1 }),
    db.stockMovement.findMany({ where: { ...movementWhere, ...filter }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1 }),
  ]);
  const combined = historyResponse(activity, movements);
  const entries = combined.slice(0, limit);
  const last = entries.at(-1);
  const hasMore = combined.length > limit;
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ date: last.date, kind: last.kind, id: last.id })).toString("base64url") : null;
  return { entries, nextCursor, hasMore };
}

const queueResponse = (queue) => queue.map((entry) => ({ id: entry.itemId, quantity: entry.quantity }));
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
    const filter = {};
    for (const key of ["itemId", "orderId"]) {
      if (req.query[key] === undefined) continue;
      if (typeof req.query[key] !== "string" || !req.query[key]) throw badRequest(`올바른 ${key}를 입력해 주세요.`);
      filter[key] = req.query[key];
    }
    const history = await prisma.$transaction((tx) => historyPage(tx, cursor, limit, filter), {
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
    const item = await createItem(prisma, req.body);
    res.status(201).json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.patch("/items/:id", async (req, res) => {
    const item = await updateItem(prisma, req.params.id, req.body);
    res.json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.patch("/items/:id/stock", async (req, res) => {
    if (!req.body || !("stock" in req.body) || Object.keys(req.body).some((key) => !["stock", "type", "note"].includes(key)))
      throw badRequest("stock 값을 입력해 주세요.");
    const item = await updateStock(prisma, req.params.id, quantity(req.body.stock, "stock"),
      movementType(req.body.type ?? "ADJUSTMENT"), movementNote(req.body.note));
    res.json({ data: (await itemResponses(prisma, [item]))[0] });
  });
  router.post("/items/:id/movements", async (req, res) => {
    const movement = await createMovement(prisma, req.params.id, req.body);
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
    await deleteItem(prisma, req.params.id);
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
    res.status(201).json({ data: orderResponse(await createOrder(prisma)) });
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
    res.json({ data: orderResponse(await receiveOrder(prisma, req.params.id, req.body)) });
  });
  router.post("/orders/:id/complete", async (req, res) => {
    if (req.body && Object.keys(req.body).length) throw badRequest("완료 요청에는 본문을 입력하지 마세요.");
    res.json({ data: orderResponse(await completeOrder(prisma, req.params.id)) });
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
