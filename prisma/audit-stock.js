import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { auditStockLedger } from "../server/stock-audit.js";

const prisma = new PrismaClient();
try {
  const items = await prisma.$transaction((tx) => tx.item.findMany({
    select: { id: true, stock: true, openingStock: true,
      movements: { select: { id: true, beforeQuantity: true, quantityChange: true, afterQuantity: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const issues = auditStockLedger(items);
  console.log(JSON.stringify({ itemsChecked: items.length, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
