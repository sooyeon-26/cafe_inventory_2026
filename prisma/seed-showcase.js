import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ensureShowcase } from "./showcase-seed.js";
import { ensurePortfolioScenarios } from "./portfolio-scenarios.js";

const prisma = new PrismaClient();
try {
  const result = await ensureShowcase(prisma);
  const scenarios = await ensurePortfolioScenarios(prisma);
  console.log(`Showcase seed complete: ${result.items} items ensured, ${result.replayed} usage timelines, ` +
    `${scenarios.orders} sample orders, ${scenarios.movements} extra movements, queue ${scenarios.queued ? "created" : "unchanged"}.`);
} finally {
  await prisma.$disconnect();
}
