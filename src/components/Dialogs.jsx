import { useEffect, useRef, useState } from "react";
import { MAX_QUANTITY } from "../inventory.js";

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
export function ItemForm({ item, onSave, onClose }) {
  const [error, setError] = useState("");
  return (
    <Modal title={item ? "품목 수정" : "새 품목 등록"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = {
            id: item?.id ?? crypto.randomUUID(),
            name: form.get("name").trim(),
            category: form.get("category").trim(),
            unit: form.get("unit").trim(),
            stock: Number(form.get("stock")),
            minimum: Number(form.get("minimum")),
            target: Number(form.get("target")),
          };
          if (!next.name || !next.category || !next.unit)
            return setError("품목명, 카테고리, 단위를 입력해 주세요.");
          if (next.target < next.minimum)
            return setError("적정 재고는 최소 재고 이상이어야 합니다.");
          onSave(next);
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
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            취소
          </button>
          <button className="primary" type="submit">
            {item ? "변경 저장" : "품목 등록"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function History({ history, onClose }) {
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
                className={`history-dot ${event.text.startsWith("발주") ? "blue" : ""}`}
              />
              <div>
                <time>
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.date))}
                </time>
                <p>{event.text}</p>
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
    </Modal>
  );
}
