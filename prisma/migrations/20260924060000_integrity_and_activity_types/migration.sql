ALTER TABLE "Item" ADD COLUMN "openingStock" INTEGER NOT NULL DEFAULT 0;

-- The first recorded before-quantity is the legacy starting balance. Items
-- without movements start from their existing stock. Never rewrite stock.
UPDATE "Item" i SET "openingStock" = COALESCE(
  (SELECT m."beforeQuantity" FROM "StockMovement" m
   WHERE m."itemId" = i."id" ORDER BY m."createdAt", m."id" LIMIT 1),
  i."stock"
);

ALTER TABLE "Item" ADD CONSTRAINT "Item_stock_range_check" CHECK ("stock" BETWEEN 0 AND 999999);
ALTER TABLE "Item" ADD CONSTRAINT "Item_openingStock_range_check" CHECK ("openingStock" BETWEEN 0 AND 999999);
ALTER TABLE "Item" ADD CONSTRAINT "Item_thresholds_check" CHECK ("minimum" BETWEEN 0 AND 999999 AND "target" BETWEEN "minimum" AND 999999);
ALTER TABLE "Item" ADD CONSTRAINT "Item_leadTimeDays_check" CHECK ("leadTimeDays" BETWEEN 1 AND 365);
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_quantity_check" CHECK ("quantity" BETWEEN 1 AND 999999);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantities_check" CHECK (
  "beforeQuantity" BETWEEN 0 AND 999999 AND "afterQuantity" BETWEEN 0 AND 999999
  AND "quantityChange" <> 0
  AND "afterQuantity"::BIGINT = "beforeQuantity"::BIGINT + "quantityChange"::BIGINT
);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_direction_check" CHECK (
  ("type" = 'RESTOCK' AND "quantityChange" > 0)
  OR ("type" IN ('USAGE', 'WASTE') AND "quantityChange" < 0)
  OR "type" = 'ADJUSTMENT'
);

CREATE TYPE "ActivityEventType" AS ENUM (
  'LEGACY', 'ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_DELETED',
  'ORDER_CREATED', 'ORDER_PARTIALLY_RECEIVED', 'ORDER_RECEIVED', 'ORDER_COMPLETED'
);
ALTER TABLE "ActivityEvent" ADD COLUMN "type" "ActivityEventType" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "ActivityEvent" ADD COLUMN "itemId" TEXT;
ALTER TABLE "ActivityEvent" ADD COLUMN "orderId" TEXT;
CREATE INDEX "ActivityEvent_itemId_date_idx" ON "ActivityEvent"("itemId", "date");
CREATE INDEX "ActivityEvent_orderId_date_idx" ON "ActivityEvent"("orderId", "date");
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
