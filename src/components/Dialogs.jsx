import { useEffect, useRef, useState } from "react";
import { MAX_QUANTITY } from "../inventory.js";

const movementLabels = {
  USAGE: "사용",
  RESTOCK: "입고",
  WASTE: "폐기",
  ADJUSTMENT: "재고 조정",
};

export function Modal({ title, onClose, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="circle" aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ItemForm({ item, onSave, onClose, disabled = false }) {
  const [error, setError] = useState("");
  return (
    <Modal title={item ? "품목 수정" : "새 품목 등록"} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = {
            ...(item?.id ? { id: item.id } : {}),
            name: form.get("name").trim(),
            category: form.get("category").trim(),
            unit: form.get("unit").trim(),
            stock: Number(form.get("stock")),
            minimum: Number(form.get("minimum")),
            target: Number(form.get("target")),
            leadTimeDays: Number(form.get("leadTimeDays")),
          };
          if (!next.name || !next.category || !next.unit)
            return setError("품목명, 카테고리, 단위를 입력해 주세요.");
          if (next.target < next.minimum)
            return setError("적정 재고는 최소 재고 이상이어야 합니다.");
          if (!await onSave(next)) setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }}
      >
        <p className="modal-description">
          관리할 품목과 재고 기준을 설정하세요.
        </p>
        <label>
          품목명
          <input
            autoFocus
            name="name"
            required
            maxLength="60"
            defaultValue={item?.name}
            placeholder="예: 오트밀크"
          />
        </label>
        <div className="form-row">
          <label>
            카테고리
            <input
              name="category"
              required
              maxLength="30"
              defaultValue={item?.category}
              placeholder="예: 음료"
            />
          </label>
          <label>
            단위
            <input
              name="unit"
              required
              maxLength="20"
              defaultValue={item?.unit}
              placeholder="예: 1L"
            />
          </label>
        </div>
        <div className="form-row three">
          {[
            ["stock", "현재 재고"],
            ["minimum", "최소 재고"],
            ["target", "적정 재고"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                type="number"
                name={name}
                required
                min="0"
                max={MAX_QUANTITY}
                step="1"
                defaultValue={item?.[name] ?? 0}
              />
            </label>
          ))}
        </div>
        <label>
          납품 소요 (일)
          <input type="number" name="leadTimeDays" required min="1" max="365" step="1" defaultValue={item?.leadTimeDays ?? 2} />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            취소
          </button>
          <button className="primary" type="submit" disabled={disabled}>
            {item ? "변경 저장" : "품목 등록"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function MovementForm({ item, onSave, onClose, disabled = false }) {
  const [type, setType] = useState(item.stock > 0 ? "USAGE" : "RESTOCK");
  const [error, setError] = useState("");
  return (
    <Modal title="재고 변경" onClose={onClose}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const input = { type, note: form.get("note").trim() };
        if (type === "ADJUSTMENT") {
          input.afterQuantity = Number(form.get("afterQuantity"));
          if (input.afterQuantity === item.stock)
            return setError("현재 재고와 다른 수량을 입력해 주세요.");
        } else {
          input.quantity = Number(form.get("quantity"));
          if (input.quantity < 1 || ((type === "USAGE" || type === "WASTE") && input.quantity > item.stock))
            return setError("변경할 수량을 확인해 주세요.");
        }
        if (!await onSave(input)) setError("재고 변경을 저장하지 못했습니다. 다시 시도해 주세요.");
      }}>
        <p className="modal-description">{item.name} · 현재 재고 {item.stock}{item.unit}</p>
        <label>
          변경 유형
          <select name="type" value={type} onChange={(event) => { setType(event.target.value); setError(""); }}>
            {Object.entries(movementLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {type === "ADJUSTMENT" ? (
          <label>
            변경 후 수량
            <input type="number" name="afterQuantity" min="0" max={MAX_QUANTITY} step="1" required defaultValue={item.stock} />
          </label>
        ) : (
          <label>
            변경 수량
            <input type="number" name="quantity" min="1" max={MAX_QUANTITY} step="1" required defaultValue="1" />
          </label>
        )}
        <label>
          메모 (선택)
          <input name="note" maxLength="240" placeholder="예: 오전 영업 사용" />
        </label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>취소</button>
          <button className="primary" type="submit" disabled={disabled}>변경 저장</button>
        </div>
      </form>
    </Modal>
  );
}
export function History({ history, onClose, hasMore = false, loadingMore = false, error, onRetry, onLoadMore }) {
  return (
    <Modal title="History" onClose={onClose} className="history-modal">
      <p className="modal-description">
        재고 변경과 발주 기록을 한눈에 확인하세요.
      </p>
      <div className="history-list">
        {history.length ? (
          history.map((event) => (
            <article key={event.id}>
              <span
                className={`history-dot ${event.kind === "movement"
                  ? event.type === "RESTOCK" ? "blue" : event.type === "WASTE" ? "red" : ""
                  : event.text.startsWith("발주") ? "blue" : ""}`}
              />
              <div>
                <time>
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.date))}
                </time>
                {event.kind === "movement" ? (
                  <p>
                    <strong>{event.itemName}</strong><br />
                    {movementLabels[event.type]} {event.quantityChange > 0 ? "+" : ""}{event.quantityChange}<br />
                    {event.beforeQuantity} → {event.afterQuantity}
                    {event.note ? ` · ${event.note}` : ""}
                  </p>
                ) : <p>{event.text}</p>}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <strong>아직 기록이 없어요</strong>
            <p>재고를 조정하거나 발주하면 여기에 기록됩니다.</p>
          </div>
        )}
      </div>
      {error && <p className="form-error" role="alert">History를 불러오지 못했습니다. {error} <button onClick={onRetry}>다시 시도</button></p>}
      {hasMore && <button className="secondary history-more" onClick={onLoadMore} disabled={loadingMore}>
        {loadingMore ? "불러오는 중..." : "이전 기록 더 보기"}
      </button>}
    </Modal>
  );
}

const orderStatusLabels = { ORDERED: "발주됨", PARTIALLY_RECEIVED: "부분 입고", RECEIVED: "입고됨", COMPLETED: "완료" };

function OrderReceiptForm({ order, pending, working, onReceive }) {
  const [quantities, setQuantities] = useState(() => Object.fromEntries(order.lines.map((line) => [line.itemId, line.remainingQuantity])));
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const lines = order.lines.map((line) => ({ itemId: line.itemId, quantity: Number(quantities[line.itemId]) }))
      .filter((line) => line.quantity > 0);
    if (!lines.length) return setError("입고할 수량을 입력해 주세요.");
    setError("");
    onReceive(order.id, lines);
  };
  const allRemaining = order.lines.every((line) => Number(quantities[line.itemId]) === line.remainingQuantity);
  return <form className="order-receipt-form" onSubmit={submit}>
    {order.lines.map((line) => <label key={line.itemId} className="order-receipt-line">
      <span><strong>{line.name}</strong><small>발주 {line.quantity} · 입고 {line.receivedQuantity} · 잔여 {line.remainingQuantity} {line.unit}</small></span>
      <input aria-label={`${line.name} 입고 수량`} type="number" min="0" max={line.remainingQuantity} step="1"
        value={quantities[line.itemId]} disabled={Boolean(pending) || !line.remainingQuantity}
        onChange={(event) => setQuantities((current) => ({ ...current, [line.itemId]: event.target.value }))} />
    </label>)}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={Boolean(pending)}>{working ? "입고 처리 중..." : allRemaining ? "잔여 전체 입고" : "선택 수량 입고"}</button>
  </form>;
}

export function Orders({ orders, loading, error, actionError, pending, onRetry, onReceive, onComplete, onClose }) {
  return (
    <Modal title="Orders" onClose={onClose} className="history-modal">
      <p className="modal-description">발주 수량 중 실제 도착한 수량을 입력하세요. 입고할 때마다 현재고와 재고 변경 이력이 함께 기록됩니다.</p>
      {loading && <p className="loading-state" role="status">발주 내역을 불러오는 중...</p>}
      {error && <p className="form-error" role="alert">발주 내역을 불러오지 못했습니다. {error} <button onClick={onRetry}>다시 시도</button></p>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="order-history-list">
        {orders.map((order) => {
          const working = pending?.id === order.id;
          return <article key={order.id} className="order-history-item">
            <div className="order-history-heading">
              <strong>{orderStatusLabels[order.status]}</strong>
              <time>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</time>
            </div>
            {["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) && <OrderReceiptForm
              key={`${order.id}-${order.lines.map((line) => line.receivedQuantity).join("-")}`}
              order={order} pending={pending} working={working} onReceive={onReceive} />}
            {["RECEIVED", "COMPLETED"].includes(order.status) && <p>{order.lines.map((line) => `${line.name} ${line.receivedQuantity} / ${line.quantity} ${line.unit}`).join(" · ")}</p>}
            {order.status === "RECEIVED" && <button className="secondary" onClick={() => onComplete(order.id)} disabled={Boolean(pending)}>
              {working ? "완료 처리 중..." : "완료 처리"}
            </button>}
          </article>;
        })}
        {!loading && !error && !orders.length && <p className="modal-description">아직 발주 내역이 없습니다.</p>}
      </div>
    </Modal>
  );
}
