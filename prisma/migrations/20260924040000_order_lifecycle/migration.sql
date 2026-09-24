CREATE TYPE "OrderStatus" AS ENUM ('ORDERED', 'RECEIVED', 'COMPLETED');

ALTER TABLE "Order"
  ADD COLUMN "status" "OrderStatus" NOT NULL DEFAULT 'ORDERED',
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
