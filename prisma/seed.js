import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedItems } from "../src/data.js";

const prisma = new PrismaClient();
try {
  for (const item of seedItems) {
    await prisma.item.upsert({
      where: { id: item.id },
      create: { ...item, openingStock: item.stock },
      update: {},
    });
  }
  console.log(`Seed complete: ${seedItems.length} demo items ensured.`);
} finally {
  await prisma.$disconnect();
}
