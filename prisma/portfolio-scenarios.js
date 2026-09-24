import { showcaseItems } from "./showcase-items.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const itemById = new Map(showcaseItems.map((item) => [item.id, item]));
const daysBefore = (asOf, days) => new Date(asOf.getTime() - days * DAY_MS);

const orders = [
  { id: "showcase-order-pending", itemId: "demo-soy-milk", quantity: 12, received: 0,
    status: "ORDERED", createdDaysAgo: 1 },
  { id: "showcase-order-partial", itemId: "demo-cup-sleeves", quantity: 10, received: 4,
    status: "PARTIALLY_RECEIVED", createdDaysAgo: 3, receivedDaysAgo: 2 },
  { id: "showcase-order-received", itemId: "demo-earl-grey-tea", quantity: 5, received: 5,
    status: "RECEIVED", createdDaysAgo: 2.5, receivedDaysAgo: 1.5 },
  { id: "showcase-order-completed", itemId: "demo-paper-straws", quantity: 7, received: 7,
    status: "COMPLETED", createdDaysAgo: 5, receivedDaysAgo: 4, completedDaysAgo: 3 },
];

const adjustments = [
  { itemId: "demo-strawberry-puree", type: "WASTE", change: -2,
    note: "시연용 · 유통기한 경과", daysAgo: 0.3 },
  { itemId: "demo-sugar", type: "ADJUSTMENT", change: 2,
    note: "시연용 · 실사 후 수량 조정", daysAgo: 0.2 },
];

async function untouchedItem(tx, id) {
  const expected = itemById.get(id);
  const item = await tx.item.findUnique({ where: { id }, include: {
    _count: { select: { movements: true, orderLines: true } },
  } });
  if (!item || item.deletedAt || item._count.movements || item._count.orderLines ||
    ["name", "category", "unit", "stock", "minimum", "target", "leadTimeDays"]
      .some((field) => item[field] !== expected[field]) || item.openingStock !== item.stock)
    return null;
  return item;
}

async function seedOrder(tx, scenario, asOf) {
  if (await tx.order.findUnique({ where: { id: scenario.id } })) return false;
  const item = await untouchedItem(tx, scenario.itemId);
  if (!item) return false;
  const createdAt = daysBefore(asOf, scenario.createdDaysAgo);
  const receivedAt = scenario.received ? daysBefore(asOf, scenario.receivedDaysAgo) : null;
  const completedAt = scenario.completedDaysAgo ? daysBefore(asOf, scenario.completedDaysAgo) : null;
  await tx.order.create({ data: {
    id: scenario.id, status: scenario.status, createdAt,
    receivedAt: scenario.received === scenario.quantity ? receivedAt : null, completedAt,
    lines: { create: { itemId: item.id, position: 0, name: item.name, unit: item.unit,
      orderedQuantity: scenario.quantity, receivedQuantity: scenario.received } },
  } });
  await tx.activityEvent.create({ data: { type: "ORDER_CREATED", orderId: scenario.id, date: createdAt,
    text: `발주 생성 · ${item.name} ${scenario.quantity}개` } });
  if (scenario.received) {
    const beforeQuantity = item.stock - scenario.received;
    await tx.item.update({ where: { id: item.id }, data: { openingStock: beforeQuantity } });
    await tx.stockMovement.create({ data: {
      itemId: item.id, itemName: item.name, type: "RESTOCK", orderId: scenario.id,
      quantityChange: scenario.received, beforeQuantity, afterQuantity: item.stock,
      note: "시연용 · 발주 입고", createdAt: receivedAt,
    } });
    const fullyReceived = scenario.received === scenario.quantity;
    await tx.activityEvent.create({ data: {
      type: fullyReceived ? "ORDER_RECEIVED" : "ORDER_PARTIALLY_RECEIVED",
      orderId: scenario.id, date: receivedAt,
      text: `발주 ${fullyReceived ? "입고 완료" : "부분 입고"} · ${item.name} ${scenario.received}개`,
    } });
  }
  if (completedAt) await tx.activityEvent.create({ data: {
    type: "ORDER_COMPLETED", orderId: scenario.id, date: completedAt,
    text: `발주 완료 · ${scenario.id}`,
  } });
  return true;
}

async function seedAdjustment(tx, scenario, asOf) {
  const item = await untouchedItem(tx, scenario.itemId);
  if (!item) return false;
  const beforeQuantity = item.stock - scenario.change;
  await tx.item.update({ where: { id: item.id }, data: { openingStock: beforeQuantity } });
  await tx.stockMovement.create({ data: {
    itemId: item.id, itemName: item.name, type: scenario.type,
    quantityChange: scenario.change, beforeQuantity, afterQuantity: item.stock,
    note: scenario.note, createdAt: daysBefore(asOf, scenario.daysAgo),
  } });
  return true;
}

export async function ensurePortfolioScenarios(prisma, { asOf = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    let seededOrders = 0;
    let seededReceipts = 0;
    let seededAdjustments = 0;
    for (const scenario of orders) {
      const created = await seedOrder(tx, scenario, asOf);
      seededOrders += Number(created);
      seededReceipts += Number(created && scenario.received > 0);
    }
    for (const scenario of adjustments) seededAdjustments += Number(await seedAdjustment(tx, scenario, asOf));

    let queued = false;
    if (await tx.queueEntry.count() === 0) {
      const oat = await tx.item.findUnique({ where: { id: "oat" } });
      const espresso = await tx.item.findUnique({ where: { id: "demo-espresso-beans" } });
      const item = oat && !oat.deletedAt && oat.stock <= oat.minimum ? oat : espresso;
      if (item && !item.deletedAt) {
        await tx.queueEntry.create({ data: {
          itemId: item.id, quantity: Math.max(item.target - item.stock, 1),
        } });
        queued = true;
      }
    }
    return { orders: seededOrders, movements: seededReceipts + seededAdjustments, queued };
  });
}
