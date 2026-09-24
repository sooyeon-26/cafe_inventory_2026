export const MAX_QUANTITY = 999999;

export const suggestedOrder = (item) => Math.max(item.target - item.stock, 0);

export function statusOf(item) {
  if (item.stock < item.minimum)
    return item.stock <= item.minimum / 2 ? "urgent" : "low";
  return "normal";
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
          ? item.stock < item.minimum
          : statusOf(item) === filter)),
  );
}
