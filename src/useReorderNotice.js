import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "cafe-inventory:reorder-notice:v1";
const rank = (status) => status === "urgent" ? 2 : status === "reorder" ? 1 : 0;

function rememberShown() {
  try { window.sessionStorage.setItem(SESSION_KEY, "shown"); } catch { /* Storage may be unavailable. */ }
}

function shownThisSession() {
  try { return window.sessionStorage.getItem(SESSION_KEY) === "shown"; } catch { return false; }
}

export function useReorderNotice(items, queue, ready) {
  const [visible, setVisible] = useState(false);
  const [spotlightId, setSpotlightId] = useState(null);
  const previous = useRef(null);
  const urgent = items.filter((item) => item.reorderStatus === "urgent");
  const reorder = items.filter((item) => item.reorderStatus === "reorder");
  const needed = [...urgent, ...reorder];
  const queuedIds = new Set(queue.map((entry) => entry.id));
  const nextItem = needed.find((item) => item.id === spotlightId)
    ?? needed.find((item) => !queuedIds.has(item.id));

  useEffect(() => {
    if (!ready) return;
    const current = new Map(items.map((item) => [item.id, item.recommendationPending
      ? (previous.current?.get(item.id) ?? rank(item.reorderStatus)) : rank(item.reorderStatus)]));
    if (previous.current === null) {
      if (needed.length && !shownThisSession()) {
        setVisible(true);
        rememberShown();
      }
    } else {
      const worsened = items.find((item) => !item.recommendationPending && rank(item.reorderStatus) > 0 &&
        rank(item.reorderStatus) > (previous.current.get(item.id) ?? 0));
      if (worsened) {
        setSpotlightId(worsened.id);
        setVisible(true);
        rememberShown();
      } else if (!needed.length) {
        setVisible(false);
        setSpotlightId(null);
      }
    }
    previous.current = current;
  }, [items, ready, needed.length]);

  return {
    visible,
    urgentCount: urgent.length,
    reorderCount: reorder.length,
    nextItem,
    dismiss: () => setVisible(false),
  };
}
