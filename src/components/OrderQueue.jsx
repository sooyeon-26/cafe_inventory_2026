import { useEffect, useRef } from "react";
import { Arrow, QuantityControl } from "./Controls.jsx";

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
}) {
  const panel = useRef(null);
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
        <p className="queue-intro">필요한 만큼, 빠짐없이.</p>
        <div className="queue-list">
          {queue.map((entry) => {
            const item = items.find((item) => item.id === entry.id);
            return (
              <article
                key={entry.id}
                data-testid={`queue-${entry.id}`}
                className={`queue-item ${selectedId === entry.id ? "is-selected" : ""} ${pulse?.id === entry.id ? "queue-pulse" : ""}`}
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
                  />
                  <span>개</span>
                </div>
              </article>
            );
          })}
          {!queue.length && (
            <div className="queue-empty">
              <div className="empty-queue-symbol" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <strong>발주할 품목을 모아보세요</strong>
              <p>
                왼쪽에서 품목을 선택하고
                <br />
                권장 발주량을 목록에 담아주세요.
              </p>
              <span className="empty-flow">
                품목 선택 <span>→</span> 재고 확인 <span>→</span> 추가
              </span>
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
            disabled={!queue.length}
            onClick={onOrder}
          >
            발주하기
            <Arrow />
          </button>
          <p>데모 발주로 기록되며 실제 주문은 전송되지 않습니다.</p>
        </div>
      </aside>
    </>
  );
}
