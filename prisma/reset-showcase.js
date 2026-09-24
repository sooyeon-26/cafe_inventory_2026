import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ensureShowcase } from "./showcase-seed.js";

const prisma = new PrismaClient();
try {
  const result = await ensureShowcase(prisma, { refresh: true });
  console.log(`Showcase timelines refreshed: ${result.replayed} items.`);
} finally {
  await prisma.$disconnect();
}
