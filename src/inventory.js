export const MAX_QUANTITY = 999999;

export function statusOf(item) {
  return item.reorderStatus === "urgent" ? "urgent"
    : item.reorderStatus === "reorder" ? "low" : "normal";
}

export const statusLabels = {
  urgent: "긴급",
  low: "발주 필요",
  normal: "정상",
};

export function filterItems(items, query, filter) {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      `${item.name} ${item.category} ${item.unit}`
        .toLocaleLowerCase()
        .includes(search) &&
      (filter === "all" ||
        (filter === "low"
          ? statusOf(item) !== "normal"
          : statusOf(item) === filter)),
  );
}
