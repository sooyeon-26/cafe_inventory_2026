import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경 변수를 설정해 주세요.");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  await prisma.$connect();
  const port = Number(process.env.PORT || 3001);
  const server = createApp(prisma).listen(port, "127.0.0.1", () => {
    console.log(`Cafe Inventory API: http://127.0.0.1:${port}`);
  });
  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error("PostgreSQL에 연결하지 못했습니다.", error);
  await prisma.$disconnect();
  process.exit(1);
}
