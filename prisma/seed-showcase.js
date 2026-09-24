import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { showcaseItems, showcaseDailyUsage } from "./showcase-items.js";

const prisma = new PrismaClient();
try {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const item of showcaseItems) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.item.findUnique({ where: { id: item.id } });
      if (!existing) await tx.item.create({ data: item });
      const dailyUsage = showcaseDailyUsage[item.id];
      if (!dailyUsage) return;
      if (existing && (existing.deletedAt || existing.stock !== item.stock ||
          await tx.stockMovement.count({ where: { itemId: item.id } }))) return;
      let beforeQuantity = item.stock + dailyUsage * 7;
      for (let day = 6; day >= 0; day -= 1) {
        const afterQuantity = beforeQuantity - dailyUsage;
        await tx.stockMovement.create({ data: {
          itemId: item.id,
          itemName: existing?.name ?? item.name,
          type: "USAGE",
          quantityChange: -dailyUsage,
          beforeQuantity,
          afterQuantity,
          note: "시연용 최근 사용 기록",
          createdAt: new Date(now - (day + 0.5) * dayMs),
        } });
        beforeQuantity = afterQuantity;
      }
    });
  }
  console.log(`Showcase seed complete: ${showcaseItems.length} additional demo items ensured.`);
} finally {
  await prisma.$disconnect();
}
