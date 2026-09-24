import express from "express";
import { Prisma } from "@prisma/client";
import { MAX_QUANTITY } from "../src/inventory.js";

const itemFields = ["name", "category", "unit", "stock", "minimum", "target"];
const textLimits = { name: 60, category: 30, unit: 20 };

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
    const [items, queue, history] = await prisma.$transaction([
      prisma.item.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.queueEntry.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.activityEvent.findMany({ orderBy: { date: "desc" } }),
    ]);
    res.json({ data: {
      items: items.map(itemResponse),
      queue: queue.map((entry) => ({ id: entry.itemId, quantity: entry.quantity })),
      history,
    } });
  });
  router.get("/items", async (_req, res) => {
    const items = await prisma.item.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ data: items.map(itemResponse) });
  });
  router.get("/items/:id", async (req, res) => {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound("품목을 찾을 수 없습니다.");
    res.json({ data: itemResponse(item) });
  });
  router.post("/items", async (req, res) => {
    const data = itemInput(req.body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({ data });
      await tx.activityEvent.create({ data: { text: `${created.name} · 품목 등록` } });
      return created;
    });
    res.status(201).json({ data: itemResponse(item) });
  });
  router.patch("/items/:id", async (req, res) => {
    const item = await prisma.$transaction(async (tx) => {
      const previous = await tx.item.findUnique({ where: { id: req.params.id } });
      if (!previous) throw notFound("품목을 찾을 수 없습니다.");
      const data = itemInput(req.body, previous);
      const updated = await tx.item.update({ where: { id: previous.id }, data });
      if (data.stock !== undefined && data.stock !== previous.stock)
        await tx.activityEvent.create({ data: { text: `${previous.name} · 재고 ${previous.stock} → ${data.stock}` } });
      if (itemFields.some((key) => key !== "stock" && data[key] !== undefined && data[key] !== previous[key]))
        await tx.activityEvent.create({ data: { text: `${updated.name} · 품목 수정` } });
      return updated;
    });
    res.json({ data: itemResponse(item) });
  });
  router.patch("/items/:id/stock", async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || !("stock" in req.body))
      throw badRequest("stock 값을 입력해 주세요.");
    const stock = quantity(req.body.stock, "stock");
    const item = await prisma.$transaction(async (tx) => {
      const previous = await tx.item.findUnique({ where: { id: req.params.id } });
      if (!previous) throw notFound("품목을 찾을 수 없습니다.");
      if (previous.stock === stock) return previous;
      const updated = await tx.item.update({ where: { id: previous.id }, data: { stock } });
      await tx.activityEvent.create({ data: { text: `${previous.name} · 재고 ${previous.stock} → ${stock}` } });
      return updated;
    });
    res.json({ data: itemResponse(item) });
  });
  router.delete("/items/:id", async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: req.params.id } });
      if (!item) throw notFound("품목을 찾을 수 없습니다.");
      await tx.item.delete({ where: { id: item.id } });
      await tx.activityEvent.create({ data: { text: `${item.name} · 품목 삭제` } });
    });
    res.json({ data: { id: req.params.id } });
  });
  router.post("/queue", async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.id !== "string")
      throw badRequest("품목 id를 입력해 주세요.");
    const entry = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: req.body.id } });
      if (!item) throw notFound("품목을 찾을 수 없습니다.");
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
