export function auditStockLedger(items) {
  const issues = [];
  for (const item of items) {
    let expected = item.openingStock;
    for (const movement of item.movements) {
      if (movement.beforeQuantity !== expected ||
          movement.afterQuantity !== movement.beforeQuantity + movement.quantityChange) {
        issues.push({ itemId: item.id, movementId: movement.id, reason: "movement_chain",
          expectedBefore: expected, actualBefore: movement.beforeQuantity });
      }
      expected += movement.quantityChange;
    }
    if (expected !== item.stock)
      issues.push({ itemId: item.id, reason: "stock_balance", expected, actual: item.stock });
  }
  return issues;
}
