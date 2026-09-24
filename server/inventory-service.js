import { assertMovementDirection, itemFields, itemInput, movementInput, notFound, quantity } from "./validation.js";

export async function activeItemForUpdate(tx, id) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
  if (!rows.length) throw notFound("품목을 찾을 수 없습니다.");
  return tx.item.findUnique({ where: { id } });
}

export async function recordStockChange(tx, item, { type, afterQuantity, note, orderId }, allowNoChange = false) {
  quantity(afterQuantity, "stock");
  const quantityChange = afterQuantity - item.stock;
  if (!quantityChange && allowNoChange) return { item, movement: null };
  assertMovementDirection(type, quantityChange);
  const updated = await tx.item.update({ where: { id: item.id }, data: { stock: afterQuantity } });
  const movement = await tx.stockMovement.create({ data: {
    itemId: item.id, itemName: item.name, type, quantityChange,
    beforeQuantity: item.stock, afterQuantity, note, ...(orderId ? { orderId } : {}),
  } });
  return { item: updated, movement };
}

export async function createItem(prisma, body) {
  const data = itemInput(body);
  return prisma.$transaction(async (tx) => {
    const created = await tx.item.create({ data: { ...data, stock: 0 } });
    await tx.activityEvent.create({ data: { type: "ITEM_CREATED", itemId: created.id, text: `${created.name} · 품목 등록` } });
    if (!data.stock) return created;
    return (await recordStockChange(tx, created, {
      type: "ADJUSTMENT", afterQuantity: data.stock, note: "초기 재고",
    })).item;
  });
}

export async function updateItem(prisma, id, body) {
  return prisma.$transaction(async (tx) => {
    const previous = await activeItemForUpdate(tx, id);
    const data = itemInput(body, previous);
    const { stock, ...fields } = data;
    let updated = Object.keys(fields).length
      ? await tx.item.update({ where: { id: previous.id }, data: fields }) : previous;
    if (itemFields.some((key) => key !== "stock" && data[key] !== undefined && data[key] !== previous[key]))
      await tx.activityEvent.create({ data: { type: "ITEM_UPDATED", itemId: updated.id, text: `${updated.name} · 품목 수정` } });
    if (stock !== undefined && stock !== previous.stock)
      updated = (await recordStockChange(tx, updated, {
        type: "ADJUSTMENT", afterQuantity: stock, note: "품목 수정",
      })).item;
    return updated;
  });
}

export async function updateStock(prisma, id, stock, type, note) {
  return prisma.$transaction(async (tx) => {
    const previous = await activeItemForUpdate(tx, id);
    return (await recordStockChange(tx, previous, { type, afterQuantity: stock, note }, true)).item;
  });
}

export async function createMovement(prisma, id, body) {
  return prisma.$transaction(async (tx) => {
    const item = await activeItemForUpdate(tx, id);
    return (await recordStockChange(tx, item, movementInput(body, item.stock))).movement;
  });
}

export async function deleteItem(prisma, id) {
  return prisma.$transaction(async (tx) => {
    const item = await activeItemForUpdate(tx, id);
    await tx.queueEntry.deleteMany({ where: { itemId: item.id } });
    await tx.item.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    await tx.activityEvent.create({ data: { type: "ITEM_DELETED", itemId: item.id, text: `${item.name} · 품목 삭제` } });
  });
}
