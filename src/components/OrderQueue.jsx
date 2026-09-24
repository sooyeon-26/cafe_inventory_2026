import { useEffect, useRef } from "react";
import { QuantityControl } from "./Controls.jsx";

export default function OrderQueue({
  items,
  queue,
  selectedId,
  onSelect,
  onQuantity,
  onRemove,
  onOrder,
  open,
  onClose,
  pulse,
  disabled = false,
  orderDisabled = false,
  orderPending = false,
}) {
  const panel = useRef(null);
  const playedPulse = useRef(null);
  useEffect(() => {
    if (!pulse || playedPulse.current === pulse.key) return;
    const row = [...panel.current.querySelectorAll("[data-item-id]")].find(
      (node) => node.dataset.itemId === pulse.id,
    );
    // Scroll only the queue, without moving the whole workspace.
    if (row) {
      playedPulse.current = pulse.key;
      const list = row.parentElement;
      const top =
        row.getBoundingClientRect().top - list.getBoundingClientRect().top;
      if (top < 0 || top + row.offsetHeight > list.clientHeight)
        list.scrollTop += top;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        row.animate(
          [
            { backgroundColor: "#dfebff" },
            { backgroundColor: getComputedStyle(row).backgroundColor },
          ],
          { duration: 650, easing: "ease-out" },
        );
    }
  }, [pulse, queue]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    panel.current.querySelector(".drawer-close").focus();
    return () => previous?.focus();
  }, [open]);
  const trapFocus = (event) => {
    if (!open || event.key !== "Tab") return;
    const focusable = [
      ...panel.current.querySelectorAll(
        "button:not(:disabled), input:not(:disabled)",
      ),
    ].filter((node) => node.getClientRects().length);
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const total = queue.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <>
      {open && (
        <button
          className="drawer-backdrop"
          aria-label="발주 목록 닫기"
          onClick={onClose}
        />
      )}
      <aside
        ref={panel}
        onKeyDown={trapFocus}
        className={`order-queue ${open ? "drawer-open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="발주 목록"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">READY TO ORDER</span>
            <h2>
              Order Queue <span className="count">{queue.length}</span>
            </h2>
          </div>
          <button
            className="drawer-close circle"
            onClick={onClose}
            aria-label="발주 목록 닫기"
          >
            ×
          </button>
        </div>
        <div className="queue-list">
          {queue.map((entry) => {
            const item = items.find((item) => item.id === entry.id);
            if (!item) return null;
            return (
              <article
                key={entry.id}
                data-testid={`queue-${entry.id}`}
                data-item-id={entry.id}
                className={`queue-item ${selectedId === entry.id ? "is-selected" : ""}`}
              >
                <div className="queue-item-heading">
                  <button
                    className="queue-name"
                    onClick={() => onSelect(item.id)}
                  >
                    {item.name}
                  </button>
                  <button
                    className="remove-item"
                    aria-label={`${item.name} 발주 목록에서 삭제`}
                    onClick={() => onRemove(item.id)}
                    disabled={disabled}
                  >
                    ×
                  </button>
                </div>
                <span className="metadata">
                  {item.category}
                  <span className="dot">·</span>
                  {item.unit}
                </span>
                <div className="queue-item-bottom">
                  <QuantityControl
                    min={1}
                    value={entry.quantity}
                    onChange={(value) => onQuantity(item.id, value)}
                    label={`${item.name} 발주 수량`}
                    disabled={disabled}
                  />
                  <span>개</span>
                </div>
              </article>
            );
          })}
          {!queue.length && (
            <div className="queue-empty">
              <strong>아직 담긴 품목이 없습니다.</strong>
              <p>중앙에서 필요한 품목을 추가해보세요.</p>
            </div>
          )}
        </div>
        <div className="order-summary">
          <div>
            <span>선택한 품목</span>
            <strong>
              {queue.length}
              <small>종</small>
            </strong>
          </div>
          <div>
            <span>총 발주 수량</span>
            <strong data-testid="order-total">
              {total}
              <small>개</small>
            </strong>
          </div>
          <button
            className="primary create-order"
            disabled={disabled || orderDisabled || !queue.length}
            onClick={onOrder}
          >
            {orderPending ? "발주 처리 중..." : "발주하기"}
          </button>
          <p>데모 발주로 기록되며 실제 주문은 전송되지 않습니다.</p>
        </div>
      </aside>
    </>
  );
}
