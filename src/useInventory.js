import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { inventoryApi } from "./api.js";
import { queryKeys } from "./queryKeys.js";
import { useInventoryMutations } from "./useInventoryMutations.js";

const emptyState = { items: [], queue: [], history: [] };

export function useInventory(ordersOpen = false) {
  const itemsQuery = useQuery({ queryKey: queryKeys.items, queryFn: inventoryApi.items });
  const draftQuery = useQuery({ queryKey: queryKeys.draft, queryFn: inventoryApi.queue });
  const historyQuery = useInfiniteQuery({
    queryKey: queryKeys.history,
    queryFn: ({ pageParam }) => inventoryApi.history(pageParam),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const ordersQuery = useQuery({ queryKey: queryKeys.orders, queryFn: inventoryApi.orders, enabled: ordersOpen });
  const { act, actionError, busy, orderPending, saving, stockBusy, queueBusy, pendingOrderAction } = useInventoryMutations();
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
    busy,
    orderPending,
    saving,
    stockBusy,
    queueBusy,
    error: loadError ? `재고 정보를 불러오지 못했습니다. ${loadError.message}` : "",
    actionError,
    orders: ordersQuery.data ?? [],
    ordersLoading: ordersQuery.isPending,
    ordersError: ordersQuery.error?.message ?? "",
    retryOrders: () => ordersQuery.refetch(),
    pendingOrderAction,
    historyHasMore: historyQuery.hasNextPage,
    historyLoadingMore: historyQuery.isFetchingNextPage,
    historyError: historyQuery.error?.message ?? "",
    retryHistory: () => historyQuery.refetch(),
    loadMoreHistory: () => historyQuery.fetchNextPage(),
    retry: () => Promise.all([itemsQuery.refetch(), draftQuery.refetch(), historyQuery.refetch()]),
  };
}
