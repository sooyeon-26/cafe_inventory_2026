export const STORAGE_KEY = "cafe-inventory:v1";
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
const validQuantity = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY;
export function isValidState(value) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.queue) ||
    !Array.isArray(value.history)
  )
    return false;
  const ids = new Set();
  for (const item of value.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      !["name", "category", "unit"].every(
        (key) => typeof item[key] === "string" && item[key].trim(),
      ) ||
      !["stock", "minimum", "target"].every((key) =>
        validQuantity(item[key]),
      ) ||
      item.target < item.minimum
    )
      return false;
    ids.add(item.id);
  }
  const queued = new Set();
  return (
    value.queue.every((entry) => {
      if (
        !entry ||
        !ids.has(entry.id) ||
        queued.has(entry.id) ||
        !validQuantity(entry.quantity) ||
        entry.quantity < 1
      )
        return false;
      queued.add(entry.id);
      return true;
    }) &&
    value.history.every(
      (event) =>
        event &&
        typeof event.id === "string" &&
        typeof event.text === "string" &&
        typeof event.date === "string" &&
        Number.isFinite(Date.parse(event.date)),
    )
  );
}
export function inventoryReducer(state, action) {
  const event = (text) => [
    { id: action.eventId, date: action.date, text },
    ...state.history,
  ];
  switch (action.type) {
    case "stock": {
      const item = state.items.find((item) => item.id === action.id);
      if (!item || !validQuantity(action.value) || item.stock === action.value)
        return state;
      return {
        ...state,
        items: state.items.map((current) =>
          current.id === item.id
            ? { ...current, stock: action.value }
            : current,
        ),
        history: event(`${item.name} · 재고 ${item.stock} → ${action.value}`),
      };
    }
    case "save": {
      const previous = state.items.find((item) => item.id === action.item.id);
      const items = previous
        ? state.items.map((item) =>
            item.id === action.item.id ? action.item : item,
          )
        : [...state.items, action.item];
      const next = {
        ...state,
        items,
        history: event(
          `${action.item.name} · 품목 ${previous ? "수정" : "등록"}`,
        ),
      };
      return isValidState(next) ? next : state;
    }
    case "delete": {
      const item = state.items.find((item) => item.id === action.id);
      if (!item) return state;
      return {
        items: state.items.filter((item) => item.id !== action.id),
        queue: state.queue.filter((item) => item.id !== action.id),
        history: event(`${item.name} · 품목 삭제`),
      };
    }
    case "queue-add": {
      const item = state.items.find((item) => item.id === action.id);
      if (
        !item ||
        state.queue.some((entry) => entry.id === item.id) ||
        !suggestedOrder(item)
      )
        return state;
      return {
        ...state,
        queue: [
          ...state.queue,
          { id: item.id, quantity: suggestedOrder(item) },
        ],
      };
    }
    case "queue-quantity":
      return validQuantity(action.value) && action.value > 0
        ? {
            ...state,
            queue: state.queue.map((entry) =>
              entry.id === action.id
                ? { ...entry, quantity: action.value }
                : entry,
            ),
          }
        : state;
    case "queue-remove":
      return {
        ...state,
        queue: state.queue.filter((entry) => entry.id !== action.id),
      };
    case "order": {
      if (!state.queue.length) return state;
      const details = state.queue
        .map(
          (entry) =>
            `${state.items.find((item) => item.id === entry.id).name} ${entry.quantity}개`,
        )
        .join(", ");
      return { ...state, queue: [], history: event(`발주 생성 · ${details}`) };
    }
    default:
      return state;
  }
}
