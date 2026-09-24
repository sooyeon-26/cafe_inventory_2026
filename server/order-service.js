import { activeItemForUpdate, recordStockChange } from "./inventory-service.js";
import { badRequest, conflict, notFound, receiptInput } from "./validation.js";

export const orderInclude = { lines: { orderBy: { position: "asc" } } };
export const orderResponse = (order) => ({
  ...order,
  lines: order.lines.map(({ itemId, name, unit, orderedQuantity, receivedQuantity }) => ({
    itemId, name, unit, quantity: orderedQuantity, receivedQuantity,
    remainingQuantity: orderedQuantity - receivedQuantity,
  })),
});

async function orderForUpdate(tx, id) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw notFound("발주를 찾을 수 없습니다.");
  return tx.order.findUnique({ where: { id }, include: orderInclude });
}

export async function createOrder(prisma) {
  return prisma.$transaction(async (tx) => {
    const queue = await tx.queueEntry.findMany({ include: { item: true }, orderBy: { createdAt: "asc" } });
    if (!queue.length) throw badRequest("발주 목록이 비어 있습니다.");
    const lines = queue.map((entry, position) => ({
      itemId: entry.itemId, position, name: entry.item.name, unit: entry.item.unit,
      orderedQuantity: entry.quantity,
    }));
    const created = await tx.order.create({ data: { lines: { create: lines } }, include: orderInclude });
    await tx.activityEvent.create({ data: { type: "ORDER_CREATED", orderId: created.id,
      text: `발주 생성 · ${lines.map((line) => `${line.name} ${line.orderedQuantity}개`).join(", ")}` } });
    await tx.queueEntry.deleteMany({});
    return created;
  });
}

export async function receiveOrder(prisma, id, body) {
  const requested = receiptInput(body);
  return prisma.$transaction(async (tx) => {
    const order = await orderForUpdate(tx, id);
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)) throw conflict("이미 입고가 완료된 발주입니다.");
    if (!order.lines.length) throw conflict("입고할 품목이 없습니다.");
    const receipt = requested ?? order.lines.filter((line) => line.receivedQuantity < line.orderedQuantity)
      .map((line) => ({ itemId: line.itemId, quantity: line.orderedQuantity - line.receivedQuantity }));
    if (!receipt.length) throw conflict("입고할 잔여 수량이 없습니다.");
    const linesByItem = new Map(order.lines.map((line) => [line.itemId, line]));
    for (const entry of receipt) {
      const line = linesByItem.get(entry.itemId);
      if (!line) throw badRequest("발주에 없는 품목입니다.");
      if (entry.quantity > line.orderedQuantity - line.receivedQuantity) throw conflict("입고 수량이 잔여 발주 수량을 초과합니다.");
    }
    for (const entry of [...receipt].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
      const item = await activeItemForUpdate(tx, entry.itemId).catch((error) => {
        if (error.status === 404) throw conflict("삭제된 품목이 있어 입고할 수 없습니다.");
        throw error;
      });
      await recordStockChange(tx, item, {
        type: "RESTOCK", afterQuantity: item.stock + entry.quantity,
        note: `발주 ${order.id} 입고`, orderId: order.id,
      });
      await tx.orderLine.update({ where: { orderId_itemId: { orderId: order.id, itemId: entry.itemId } },
        data: { receivedQuantity: { increment: entry.quantity } } });
    }
    const quantityByItem = new Map(receipt.map((entry) => [entry.itemId, entry.quantity]));
    const fullyReceived = order.lines.every((line) => line.receivedQuantity +
      (quantityByItem.get(line.itemId) ?? 0) === line.orderedQuantity);
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", ...(fullyReceived ? { receivedAt: new Date() } : {}) },
      include: orderInclude,
    });
    await tx.activityEvent.create({ data: {
      type: fullyReceived ? "ORDER_RECEIVED" : "ORDER_PARTIALLY_RECEIVED", orderId: order.id,
      text: `발주 ${fullyReceived ? "입고 완료" : "부분 입고"} · ${receipt.map((entry) => `${linesByItem.get(entry.itemId).name} ${entry.quantity}개`).join(", ")}`,
    } });
    return updated;
  });
}

export async function completeOrder(prisma, id) {
  return prisma.$transaction(async (tx) => {
    const order = await orderForUpdate(tx, id);
    if (order.status !== "RECEIVED") throw conflict("입고된 발주만 완료할 수 있습니다.");
    const updated = await tx.order.update({
      where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date() }, include: orderInclude,
    });
    await tx.activityEvent.create({ data: { type: "ORDER_COMPLETED", orderId: order.id, text: `발주 완료 · ${order.id}` } });
    return updated;
  });
}
