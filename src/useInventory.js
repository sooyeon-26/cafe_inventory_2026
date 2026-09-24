import { useCallback, useEffect, useRef, useState } from "react";
import { inventoryApi } from "./api.js";

const emptyState = { items: [], queue: [], history: [] };

export function useInventory() {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const retry = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await inventoryApi.state());
    } catch (cause) {
      setError(`재고 정보를 불러오지 못했습니다. ${cause.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { retry(); }, [retry]);

  const act = useCallback(async (action) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      let result;
      switch (action.type) {
        case "stock": result = await inventoryApi.stock(action.id, action.value, action.movementType); break;
        case "movement": result = await inventoryApi.movement(action.id, action.input); break;
        case "save": result = await inventoryApi.save(action.item); break;
        case "delete": result = await inventoryApi.delete(action.id); break;
        case "queue-add": result = await inventoryApi.queueAdd(action.id); break;
        case "queue-quantity": result = await inventoryApi.queueQuantity(action.id, action.value); break;
        case "queue-remove": result = await inventoryApi.queueRemove(action.id); break;
        case "order": result = await inventoryApi.order(); break;
        default: throw new Error("지원하지 않는 작업입니다.");
      }
      setState(await inventoryApi.state());
      return result;
    } catch (cause) {
      setError(`변경사항을 저장하지 못했습니다. ${cause.message}`);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return { state, act, loading, busy, error, retry };
}
