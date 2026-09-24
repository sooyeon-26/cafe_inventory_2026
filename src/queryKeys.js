export const queryKeys = {
  items: ["items"],
  item: (id) => ["items", id],
  movementsAll: ["movements"],
  movements: (id) => ["movements", id],
  draft: ["orders", "draft"],
  orders: ["orders"],
  order: (id) => ["orders", id],
  history: ["history"],
};
