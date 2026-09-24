import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "./api.js";
import { queryKeys } from "./queryKeys.js";

const emptyState = { items: [], queue: [], history: [] };

function applyQueue(queue, action, result) {
  if (action.type === "queue-add") {
    if (queue.some((entry) => entry.id === action.id))
      return result?.quantity === undefined ? queue : queue.map((entry) => entry.id === action.id
        ? { ...entry, quantity: result.quantity } : entry);
    return [...queue, { id: action.id, quantity: result?.quantity ?? action.quantity }];
  }
  if (action.type === "queue-quantity")
    return queue.map((entry) => entry.id === action.id
      ? { ...entry, quantity: result?.quantity ?? action.value } : entry);
  return queue.filter((entry) => entry.id !== action.id);
}

function projectStock(item, operations) {
  const change = operations.reduce((sum, operation) => sum + operation.delta, 0);
  return {
    ...item,
    stock: item.stock + change,
    recommendedQuantity: Math.max(item.recommendedQuantity - change, 0),
    recommendationPending: operations.length > 0,
  };
}

export function useInventory(ordersOpen = false) {
  const client = useQueryClient();
  const itemsQuery = useQuery({ queryKey: queryKeys.items, queryFn: inventoryApi.items });
  const draftQuery = useQuery({ queryKey: queryKeys.draft, queryFn: inventoryApi.queue });
  const historyQuery = useInfiniteQuery({
    queryKey: queryKeys.history,
    queryFn: ({ pageParam }) => inventoryApi.history(pageParam),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const ordersQuery = useQuery({ queryKey: queryKeys.orders, queryFn: inventoryApi.orders, enabled: ordersOpen });
  const [actionError, setActionError] = useState("");
  const chains = useRef(new Map());
  const stockBase = useRef(new Map());
  const stockPending = useRef(new Map());
  const queueBase = useRef(null);
  const queuePending = useRef([]);

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(""), 4500);
    return () => clearTimeout(timer);
  }, [actionError]);

  const serial = (key, task) => {
    const run = (chains.current.get(key) ?? Promise.resolve()).then(task);
    const tail = run.catch(() => {});
    chains.current.set(key, tail);
    tail.then(() => {
      if (chains.current.get(key) === tail) chains.current.delete(key);
    });
    return run;
  };

  const paintStock = (id) => {
    const base = stockBase.current.get(id);
    if (!base) return;
    const projected = projectStock(base, stockPending.current.get(id) ?? []);
    client.setQueryData(queryKeys.items, (items) => items?.map((item) =>
      item.id === id ? projected : item));
  };

  const stockMutation = useMutation({
    mutationFn: (action) => serial(`stock:${action.id}`,
      () => inventoryApi.movement(action.id, action.input)),
    onMutate: async (action) => {
      await client.cancelQueries({ queryKey: queryKeys.items });
      const previousItems = client.getQueryData(queryKeys.items);
      const operations = stockPending.current.get(action.id) ?? [];
      if (!operations.length) {
        const item = previousItems?.find((entry) => entry.id === action.id);
        if (item) stockBase.current.set(action.id, item);
      }
      const delta = action.input.type === "USAGE" ? -action.input.quantity : action.input.quantityChange;
      const operation = { token: Symbol(), delta };
      stockPending.current.set(action.id, [...operations, operation]);
      paintStock(action.id);
      return { previousItems, operation };
    },
    onSuccess: (movement, action, context) => {
      const base = stockBase.current.get(action.id);
      if (base) {
        const difference = movement.afterQuantity - base.stock;
        stockBase.current.set(action.id, {
          ...base,
          stock: movement.afterQuantity,
          recommendedQuantity: Math.max(base.recommendedQuantity - difference, 0),
        });
      }
      stockPending.current.set(action.id, (stockPending.current.get(action.id) ?? [])
        .filter((entry) => entry !== context.operation));
      paintStock(action.id);
    },
    onError: (_error, action, context) => {
      stockPending.current.set(action.id, (stockPending.current.get(action.id) ?? [])
        .filter((entry) => entry !== context?.operation));
      if (!stockPending.current.get(action.id)?.length && context?.previousItems) {
        const previous = context.previousItems.find((item) => item.id === action.id);
        client.setQueryData(queryKeys.items, (items) => items?.map((item) =>
          item.id === action.id ? previous : item));
      }
      else paintStock(action.id);
      setActionError("재고 변경을 저장하지 못했습니다.");
    },
    onSettled: (_data, _error, action) => {
      if (stockPending.current.get(action.id)?.length) return;
      stockPending.current.delete(action.id);
      stockBase.current.delete(action.id);
      if (stockPending.current.size) return;
      void client.invalidateQueries({ queryKey: queryKeys.items });
      void client.invalidateQueries({ queryKey: queryKeys.history });
      void client.invalidateQueries({ queryKey: queryKeys.movementsAll });
    },
  });

  const paintQueue = () => {
    if (!queueBase.current) return;
    const projected = queuePending.current.reduce((queue, action) => applyQueue(queue, action), queueBase.current);
    client.setQueryData(queryKeys.draft, projected);
  };

  const queueMutation = useMutation({
    mutationFn: (action) => serial("draft", async () => {
      if (action.type === "queue-add") {
        await chains.current.get(`stock:${action.id}`);
        return inventoryApi.queueAdd(action.id);
      }
      if (action.type === "queue-quantity") return inventoryApi.queueQuantity(action.id, action.value);
      return inventoryApi.queueRemove(action.id);
    }),
    onMutate: async (action) => {
      await client.cancelQueries({ queryKey: queryKeys.draft });
      const previousDraft = client.getQueryData(queryKeys.draft);
      if (!queuePending.current.length) queueBase.current = previousDraft ?? [];
      const item = client.getQueryData(queryKeys.items)?.find((entry) => entry.id === action.id);
      const operation = { ...action, quantity: item?.recommendedQuantity ?? 0, token: Symbol() };
      queuePending.current.push(operation);
      paintQueue();
      return { previousDraft, operation };
    },
    onSuccess: (result, _action, context) => {
      queueBase.current = applyQueue(queueBase.current, context.operation, result);
      queuePending.current = queuePending.current.filter((entry) => entry !== context.operation);
      paintQueue();
    },
    onError: (_error, _action, context) => {
      queuePending.current = queuePending.current.filter((entry) => entry !== context?.operation);
      if (!queuePending.current.length && context?.previousDraft)
        client.setQueryData(queryKeys.draft, context.previousDraft);
      else paintQueue();
      setActionError("발주 목록을 저장하지 못했습니다.");
    },
    onSettled: () => {
      if (queuePending.current.length) return;
      queueBase.current = null;
      void client.invalidateQueries({ queryKey: queryKeys.draft });
    },
  });

  const criticalMutation = useMutation({
    mutationFn: (action) => {
      switch (action.type) {
        case "stock": return inventoryApi.stock(action.id, action.value, action.movementType);
        case "movement": return inventoryApi.movement(action.id, action.input);
        case "save": return inventoryApi.save(action.item);
        case "delete": return inventoryApi.delete(action.id);
        case "order": return inventoryApi.order();
        case "receive": return inventoryApi.receiveOrder(action.id);
        case "complete": return inventoryApi.completeOrder(action.id);
        default: throw new Error("지원하지 않는 작업입니다.");
      }
    },
    onSuccess: async (_result, action) => {
      let keys;
      switch (action.type) {
        case "order":
        case "complete":
          keys = [queryKeys.orders, queryKeys.history];
          break;
        case "receive":
          keys = [queryKeys.orders, queryKeys.items, queryKeys.history, queryKeys.movementsAll];
          break;
        case "delete":
          keys = [queryKeys.items, queryKeys.draft, queryKeys.history];
          break;
        case "save":
          keys = [queryKeys.items, queryKeys.history];
          break;
        default:
          keys = [queryKeys.items, queryKeys.history, queryKeys.movements(action.id)];
      }
      await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
    },
    onError: (error, action) => setActionError(["receive", "complete"].includes(action.type)
      ? error.message : action.type === "order"
        ? "발주를 처리하지 못했습니다." : "변경사항을 저장하지 못했습니다."),
  });

  const act = async (action) => {
    setActionError("");
    try {
      if (action.type === "queue-add" || action.type === "queue-quantity" || action.type === "queue-remove")
        return await queueMutation.mutateAsync(action);
      if (action.type === "quick-stock") return await stockMutation.mutateAsync(action);
      return await criticalMutation.mutateAsync(action);
    } catch {
      return null;
    }
  };

  const loading = itemsQuery.isPending || draftQuery.isPending || historyQuery.isPending;
  const loadError = itemsQuery.error || draftQuery.error || historyQuery.error;
  const state = itemsQuery.data && draftQuery.data && historyQuery.data
    ? { items: itemsQuery.data, queue: draftQuery.data,
      history: historyQuery.data.pages.flatMap((page) => page.entries) }
    : emptyState;
  return {
    state,
    act,
    loading,
    busy: criticalMutation.isPending,
    orderPending: criticalMutation.isPending && criticalMutation.variables?.type === "order",
    saving: criticalMutation.isPending || stockMutation.isPending || queueMutation.isPending,
    stockBusy: stockPending.current.size > 0,
    queueBusy: queuePending.current.length > 0,
    error: loadError ? `재고 정보를 불러오지 못했습니다. ${loadError.message}` : "",
    actionError,
    orders: ordersQuery.data ?? [],
    ordersLoading: ordersQuery.isPending,
    ordersError: ordersQuery.error?.message ?? "",
    retryOrders: () => ordersQuery.refetch(),
    pendingOrderAction: criticalMutation.isPending ? criticalMutation.variables : null,
    historyHasMore: historyQuery.hasNextPage,
    historyLoadingMore: historyQuery.isFetchingNextPage,
    historyError: historyQuery.error?.message ?? "",
    retryHistory: () => historyQuery.refetch(),
    loadMoreHistory: () => historyQuery.fetchNextPage(),
    retry: () => Promise.all([itemsQuery.refetch(), draftQuery.refetch(), historyQuery.refetch()]),
  };
}
