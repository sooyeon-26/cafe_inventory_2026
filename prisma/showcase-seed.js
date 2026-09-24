import { showcaseItems, showcaseDailyUsage } from "./showcase-items.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SHOWCASE_USAGE_NOTE = "시연용 최근 사용 기록";

export function showcaseUsageEvents(item, dailyUsage, asOf) {
  let beforeQuantity = item.stock + dailyUsage * 7;
  return Array.from({ length: 7 }, (_, index) => {
    const afterQuantity = beforeQuantity - dailyUsage;
    const movement = {
      itemId: item.id, itemName: item.name, type: "USAGE", quantityChange: -dailyUsage,
      beforeQuantity, afterQuantity, note: SHOWCASE_USAGE_NOTE,
      createdAt: new Date(asOf.getTime() - (6.5 - index) * DAY_MS),
    };
    beforeQuantity = afterQuantity;
    return movement;
  });
}

export async function ensureShowcase(prisma, { refresh = false, asOf = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    let replayed = 0;
    for (const item of showcaseItems) {
      const dailyUsage = showcaseDailyUsage[item.id] ?? 0;
      const openingStock = item.stock + dailyUsage * 7;
      const existing = await tx.item.findUnique({ where: { id: item.id } });
      if (!existing) await tx.item.create({ data: { ...item, openingStock } });
      if (!dailyUsage) continue;
      const movements = existing ? await tx.stockMovement.findMany({ where: { itemId: item.id } }) : [];
      if (refresh && existing && (existing.deletedAt || existing.stock !== item.stock ||
        movements.some((movement) => movement.note !== SHOWCASE_USAGE_NOTE) ||
        (movements.length > 0 && (movements.length !== 7 || existing.openingStock !== openingStock))))
        throw new Error(`${item.id}: 시연 외 변경 이력이 있어 재생성을 중단했습니다.`);
      if (!refresh && existing && (existing.deletedAt || existing.stock !== item.stock || movements.length)) continue;
      if (movements.length) await tx.stockMovement.deleteMany({ where: { itemId: item.id } });
      if (existing) await tx.item.update({ where: { id: item.id }, data: { openingStock } });
      await tx.stockMovement.createMany({ data: showcaseUsageEvents(item, dailyUsage, asOf) });
      replayed += 1;
    }
    return { items: showcaseItems.length, replayed };
  });
}
