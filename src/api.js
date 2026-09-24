async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("서버 응답을 읽지 못했습니다.");
  }
  if (!response.ok) throw new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
  return payload.data;
}

const body = (value) => JSON.stringify(value);

export const inventoryApi = {
  state: () => request("/state"),
  items: () => request("/items"),
  queue: () => request("/queue"),
  history: () => request("/history"),
  stock: (id, stock, type) => request(`/items/${encodeURIComponent(id)}/stock`, {
    method: "PATCH", body: body({ stock, type }),
  }),
  movement: (id, input) => request(`/items/${encodeURIComponent(id)}/movements`, {
    method: "POST", body: body(input),
  }),
  save: (item) => {
    const { id, ...data } = item;
    return request(id ? `/items/${encodeURIComponent(id)}` : "/items", {
      method: id ? "PATCH" : "POST", body: body(data),
    });
  },
  delete: (id) => request(`/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  queueAdd: (id) => request("/queue", { method: "POST", body: body({ id }) }),
  queueQuantity: (id, quantity) => request(`/queue/${encodeURIComponent(id)}`, {
    method: "PATCH", body: body({ quantity }),
  }),
  queueRemove: (id) => request(`/queue/${encodeURIComponent(id)}`, { method: "DELETE" }),
  order: () => request("/orders", { method: "POST" }),
};
