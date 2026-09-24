import { useEffect, useRef, useState } from "react";
import { useInventory } from "./useInventory.js";
import ItemBrowser from "./components/ItemBrowser.jsx";
import ItemWorkspace from "./components/ItemWorkspace.jsx";
import OrderQueue from "./components/OrderQueue.jsx";
import OrderFlow from "./components/OrderFlow.jsx";
import { History, ItemForm, Modal, MovementForm, Orders } from "./components/Dialogs.jsx";

export default function App() {
  const [dialog, setDialog] = useState(null);
  const { state, act, loading, busy, saving, stockBusy, queueBusy, orderPending, error, actionError, retry,
    orders, ordersLoading, ordersError, retryOrders, pendingOrderAction,
    historyHasMore, historyLoadingMore, historyError, retryHistory, loadMoreHistory } = useInventory(dialog === "orders");
  const [selectedId, setSelectedId] = useState(state.items[0]?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [queueOpen, setQueueOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [pulse, setPulse] = useState(null);
  const workspaceRef = useRef(null);
  const selected =
    state.items.find((item) => item.id === selectedId) ?? state.items[0];
  const queued = state.queue.some((item) => item.id === selected?.id);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(null), 700);
    return () => clearTimeout(timer);
  }, [pulse]);
  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape") setQueueOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const notify = (text) => setToast({ text, id: crypto.randomUUID() });
  const addOrder = async () => {
    setPulse({
      id: selected.id,
      key: crypto.randomUUID(),
      quantity: selected.recommendedQuantity,
    });
    if (window.innerWidth <= 1100) setQueueOpen(true);
    const result = await act({ type: "queue-add", id: selected.id });
    if (!result) return;
    notify(
      queued
        ? "이미 목록에 있어요. 발주 수량을 확인해 주세요."
        : `${selected.name}을(를) 발주 목록에 담았어요.`,
    );
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="./" aria-label="Cafe Inventory 홈">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Cafe Inventory<span className="brand-tag">WORKSPACE</span>
        </a>
        <nav aria-label="메인 메뉴">
          <button
            className={dialog !== "history" && dialog !== "orders" ? "active" : ""}
            onClick={() => setDialog(null)}
          >
            Inventory
          </button>
          <button
            className={dialog === "history" ? "active" : ""}
            onClick={() => setDialog("history")}
          >
            History
          </button>
          <button
            className={dialog === "orders" ? "active" : ""}
            onClick={() => setDialog("orders")}
          >
            Orders
          </button>
        </nav>
        <div className="header-right">
          <button className="queue-toggle" onClick={() => setQueueOpen(true)}>
            발주 목록 <b>{state.queue.length}</b>
          </button>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <h2>오늘의 재고, 한눈에.</h2>
            <p>재고를 확인하고, 필요한 만큼 채워보세요.</p>
          </div>
          <div className="workspace-date">
            <span>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              })
                .format(new Date())
                .toUpperCase()}
            </span>
            <span>
              <i className="live-dot" />
              {error ? "저장 상태 확인 필요" : saving ? "저장 중..." : "변경사항이 자동으로 저장됩니다"}
            </span>
          </div>
        </div>
        {error && (
          <div className="storage-error" role="alert">
            {error} <button type="button" onClick={retry}>다시 시도</button>
          </div>
        )}
        {loading && <p className="loading-state" role="status">재고 정보를 불러오는 중...</p>}
        <div className="workspace" ref={workspaceRef}>
          <ItemBrowser
            items={state.items}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
            onNew={() => setDialog("new")}
            disabled={busy || loading}
          />
          <ItemWorkspace
            item={selected}
            onStock={(value, source) => {
              if (source === "decrement") return act({
                type: "quick-stock", id: selected.id, input: { type: "USAGE", quantity: 1 },
              });
              if (source === "increment") return act({
                type: "quick-stock", id: selected.id, input: { type: "ADJUSTMENT", quantityChange: 1 },
              });
              if (stockBusy) return null;
              return act({ type: "stock", id: selected.id, value, movementType: "ADJUSTMENT" });
            }}
            onAdd={addOrder}
            queued={queued}
            disabled={busy || loading}
            stockInputDisabled={stockBusy}
            actionsDisabled={stockBusy || queueBusy}
            onEdit={() => setDialog("edit")}
            onDelete={() => setDialog("delete")}
            onMovement={() => setDialog("movement")}
          />
          <OrderQueue
            items={state.items}
            queue={state.queue}
            selectedId={selected?.id}
            onSelect={(id) => {
              setSelectedId(id);
              setQueueOpen(false);
            }}
            onQuantity={(id, value) =>
              act({ type: "queue-quantity", id, value })
            }
            onRemove={(id) => act({ type: "queue-remove", id })}
            onOrder={async () => {
              if (await act({ type: "order" }))
                notify("데모 발주를 생성했어요. History에서 확인할 수 있습니다.");
            }}
            disabled={busy || loading}
            orderDisabled={queueBusy}
            orderPending={orderPending}
            open={queueOpen}
            onClose={() => setQueueOpen(false)}
            pulse={pulse}
          />
          {queued && (
            <OrderFlow
              key={selected.id}
              workspaceRef={workspaceRef}
              selectedId={selected?.id}
              pulse={pulse}
              queue={state.queue}
            />
          )}
        </div>
        <footer className="page-footer">
          <span>
            Cafe Inventory <span className="footer-divider">/</span> 재고에서
            발주까지, 하나의 흐름
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>✓</span>
          {toast.text}
          <button aria-label="알림 닫기" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
      {actionError && <div className="toast error" role="alert">{actionError}</div>}
      {(dialog === "new" || dialog === "edit") && (
        <ItemForm
          item={dialog === "edit" ? selected : null}
          onClose={() => setDialog(null)}
          onSave={async (item) => {
            const saved = await act({ type: "save", item });
            if (!saved) return false;
            setSelectedId(saved.id);
            setDialog(null);
            notify("품목을 저장했어요.");
            return true;
          }}
          disabled={busy}
        />
      )}
      {dialog === "movement" && selected && (
        <MovementForm
          item={selected}
          disabled={busy}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            if (!await act({ type: "movement", id: selected.id, input })) return false;
            setDialog(null);
            notify("재고 변경을 기록했어요.");
            return true;
          }}
        />
      )}
      {dialog === "history" && (
        <History history={state.history} hasMore={historyHasMore} loadingMore={historyLoadingMore}
          error={historyError} onRetry={retryHistory} onLoadMore={loadMoreHistory} onClose={() => setDialog(null)} />
      )}
      {dialog === "orders" && (
        <Orders orders={orders} loading={ordersLoading} error={ordersError} onRetry={retryOrders}
          actionError={actionError} pending={pendingOrderAction} onReceive={async (id) => {
            if (await act({ type: "receive", id })) notify("입고를 기록하고 재고를 반영했어요.");
          }} onComplete={async (id) => {
            if (await act({ type: "complete", id })) notify("발주를 완료했어요.");
          }} onClose={() => setDialog(null)} />
      )}
      {dialog === "delete" && selected && (
        <Modal title="품목을 삭제할까요?" onClose={() => setDialog(null)}>
          <p className="modal-description">
            {selected.name}과(와) 해당 발주 목록이 삭제됩니다. 이전 이력은
            유지됩니다.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDialog(null)}>
              취소
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (!await act({ type: "delete", id: selected.id })) return;
                setDialog(null);
                notify("품목을 삭제했어요.");
              }}
            >
              품목 삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
