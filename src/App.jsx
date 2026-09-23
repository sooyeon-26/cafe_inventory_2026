import { useEffect, useRef, useState } from "react";
import { useInventory } from "./useInventory.js";
import ItemBrowser from "./components/ItemBrowser.jsx";
import ItemWorkspace from "./components/ItemWorkspace.jsx";
import OrderQueue from "./components/OrderQueue.jsx";
import OrderFlow from "./components/OrderFlow.jsx";
import { suggestedOrder } from "./inventory.js";
import { History, ItemForm, Modal } from "./components/Dialogs.jsx";

export default function App() {
  const { state, act, storageError } = useInventory();
  const [selectedId, setSelectedId] = useState(state.items[0]?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialog, setDialog] = useState(null);
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
  const addOrder = () => {
    act({ type: "queue-add", id: selected.id });
    setPulse({
      id: selected.id,
      key: crypto.randomUUID(),
      quantity:
        state.queue.find((entry) => entry.id === selected.id)?.quantity ??
        suggestedOrder(selected),
    });
    if (window.innerWidth <= 1100) setQueueOpen(true);
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
            className={dialog !== "history" ? "active" : ""}
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
              {storageError ? "저장 상태 확인 필요" : "이 브라우저에 자동 저장"}
            </span>
          </div>
        </div>
        {storageError && (
          <div className="storage-error" role="alert">
            {storageError}
          </div>
        )}
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
          />
          <ItemWorkspace
            item={selected}
            onStock={(value) => act({ type: "stock", id: selected.id, value })}
            onAdd={addOrder}
            queued={queued}
            onEdit={() => setDialog("edit")}
            onDelete={() => setDialog("delete")}
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
            onOrder={() => {
              act({ type: "order" });
              notify("데모 발주를 생성했어요. History에서 확인할 수 있습니다.");
            }}
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
      {(dialog === "new" || dialog === "edit") && (
        <ItemForm
          item={dialog === "edit" ? selected : null}
          onClose={() => setDialog(null)}
          onSave={(item) => {
            act({ type: "save", item });
            setSelectedId(item.id);
            setDialog(null);
            notify("품목을 저장했어요.");
          }}
        />
      )}
      {dialog === "history" && (
        <History history={state.history} onClose={() => setDialog(null)} />
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
              onClick={() => {
                act({ type: "delete", id: selected.id });
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
