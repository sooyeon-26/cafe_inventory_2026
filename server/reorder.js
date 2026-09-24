import { MAX_QUANTITY } from "../src/inventory.js";

export const USAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateAverageDailyUsage(totalUsage, days = USAGE_WINDOW_DAYS) {
  return totalUsage / days;
}

export function calculateDaysUntilStockout(stock, dailyAverageUsage) {
  return dailyAverageUsage > 0 ? stock / dailyAverageUsage : null;
}

export function calculateReorderStatus(item, daysUntilStockout) {
  if (item.stock <= 0 || (daysUntilStockout !== null && daysUntilStockout < 1))
    return "urgent";
  if (item.stock <= item.minimum ||
      (daysUntilStockout !== null && daysUntilStockout <= item.leadTimeDays))
    return "reorder";
  return "normal";
}

export function calculateRecommendedQuantity(item, dailyAverageUsage) {
  const leadTimeBuffer = dailyAverageUsage > 0
    ? item.minimum + Math.ceil(dailyAverageUsage * item.leadTimeDays)
    : 0;
  return Math.min(Math.max(Math.max(item.target, leadTimeBuffer) - item.stock, 0), MAX_QUANTITY);
}

function reorderReason(item, status, daysUntilStockout) {
  if (item.stock <= 0) return "현재 재고가 없어 긴급 발주가 필요합니다.";
  if (daysUntilStockout !== null && daysUntilStockout < 1)
    return "최근 사용량 기준 1일 안에 재고가 소진될 것으로 예상됩니다.";
  if (item.stock <= item.minimum)
    return "현재 재고가 최소 재고 이하이므로 발주가 필요합니다.";
  if (status === "reorder")
    return `최근 사용량 기준 약 ${daysUntilStockout.toFixed(1)}일 후 소진이 예상되어, 납품 소요 ${item.leadTimeDays}일을 고려하면 지금 발주하는 것이 좋습니다.`;
  if (daysUntilStockout === null) return "최근 사용 기록이 없어 최소·적정 재고 기준으로 판단합니다.";
  return "현재 소진 속도와 납품 소요기간을 고려하면 재고가 충분합니다.";
}

export function calculateRecommendation(item, totalUsage) {
  const averageDailyUsage = calculateAverageDailyUsage(totalUsage);
  const estimatedDaysUntilStockout = calculateDaysUntilStockout(item.stock, averageDailyUsage);
  const reorderStatus = calculateReorderStatus(item, estimatedDaysUntilStockout);
  return {
    averageDailyUsage,
    estimatedDaysUntilStockout,
    reorderStatus,
    recommendedQuantity: calculateRecommendedQuantity(item, averageDailyUsage),
    reorderReason: reorderReason(item, reorderStatus, estimatedDaysUntilStockout),
  };
}

export async function recommendationsForItems(db, items) {
  if (!items.length) return new Map();
  const [{ now }] = await db.$queryRaw`SELECT CURRENT_TIMESTAMP AS now`;
  const totals = await db.stockMovement.groupBy({
    by: ["itemId"],
    where: {
      itemId: { in: items.map((item) => item.id) },
      type: "USAGE",
      createdAt: { gte: new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS), lte: now },
    },
    _sum: { quantityChange: true },
  });
  const usageByItem = new Map(totals.map((row) => [row.itemId, -(row._sum.quantityChange ?? 0)]));
  return new Map(items.map((item) => [item.id, calculateRecommendation(item, usageByItem.get(item.id) ?? 0)]));
}
