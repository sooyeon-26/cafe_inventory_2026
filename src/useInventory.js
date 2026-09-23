import { useEffect, useReducer, useState } from "react";
import { initialState } from "./data.js";
import { inventoryReducer, isValidState, STORAGE_KEY } from "./inventory.js";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: initialState(), error: "" };
    const data = JSON.parse(raw);
    if (!isValidState(data)) throw new Error("invalid");
    return { data, error: "" };
  } catch {
    return {
      data: initialState(),
      error:
        "저장 데이터를 읽을 수 없습니다. 원본 보호를 위해 저장을 중단했습니다. 현재 변경은 이 화면에서만 유지됩니다.",
    };
  }
}
export function useInventory() {
  const [loaded] = useState(load);
  const [state, dispatch] = useReducer(inventoryReducer, loaded.data);
  const [storageError, setStorageError] = useState(loaded.error);
  useEffect(() => {
    if (loaded.error) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError("");
    } catch {
      setStorageError(
        "브라우저 저장 공간에 접근할 수 없습니다. 새로고침하면 변경 내용이 사라질 수 있습니다.",
      );
    }
  }, [state, loaded.error]);
  const act = (action) =>
    dispatch({
      ...action,
      eventId: crypto.randomUUID(),
      date: new Date().toISOString(),
    });
  return { state, act, storageError };
}
