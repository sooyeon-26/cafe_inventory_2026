ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_RECEIVED' BEFORE 'RECEIVED';

CREATE TABLE "OrderLine" (
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("orderId", "itemId"),
    CONSTRAINT "OrderLine_orderedQuantity_check" CHECK ("orderedQuantity" > 0),
    CONSTRAINT "OrderLine_receivedQuantity_check" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "orderedQuantity")
);

INSERT INTO "OrderLine" ("orderId", "itemId", "position", "name", "unit", "orderedQuantity", "receivedQuantity")
SELECT o."id", line.value->>'itemId', (line.position - 1)::INTEGER, line.value->>'name', line.value->>'unit', (line.value->>'quantity')::INTEGER,
       CASE WHEN o."status" IN ('RECEIVED', 'COMPLETED') THEN (line.value->>'quantity')::INTEGER ELSE 0 END
FROM "Order" o CROSS JOIN LATERAL jsonb_array_elements(o."lines") WITH ORDINALITY AS line(value, position);

CREATE INDEX "OrderLine_itemId_idx" ON "OrderLine"("itemId");
CREATE UNIQUE INDEX "OrderLine_orderId_position_key" ON "OrderLine"("orderId", "position");
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" DROP COLUMN "lines";

ALTER TABLE "StockMovement" ADD COLUMN "orderId" TEXT;
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
