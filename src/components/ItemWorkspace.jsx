import { QuantityControl, StatusBadge } from "./Controls.jsx";
import { statusOf } from "../inventory.js";

export function StockRange({ item }) {
  const max = Math.ceil(Math.max(item.target * 1.4, item.stock * 1.15, 1));
  const percent = (value) => `${(value / max) * 100}%`;
  const tone = statusOf(item);
  return (
    <div
      className="stock-range"
      role="img"
      aria-label={`현재 재고 ${item.stock}, 최소 재고 ${item.minimum}, 적정 재고 ${item.target}`}
    >
      <div className="range-heading">
        <span>재고 수준</span>
        <span>
          {item.stock <= item.minimum
            ? "최소 재고 이하"
            : item.stock < item.target
              ? "적정 재고까지 여유를 채워보세요"
              : "충분한 재고를 보유하고 있어요"}
        </span>
      </div>
      <div className="range-track">
        <div
          className="range-zone red"
          style={{ width: percent(item.minimum) }}
        />
        <div
          className="range-zone yellow"
          style={{
            left: percent(item.minimum),
            width: percent(item.target - item.minimum),
          }}
        />
        <div
          className="range-zone green"
          style={{ left: percent(item.target), right: 0 }}
        />
        <span
          className="range-tick minimum-marker"
          style={{ left: percent(item.minimum) }}
        />
        <span
          className="range-tick target-marker"
          style={{ left: percent(item.target) }}
        />
        <span
          className={`range-current ${tone}`}
          style={{ left: percent(item.stock) }}
        >
          <span>현재 {item.stock}</span>
        </span>
      </div>
      <div className="range-endpoints">
        <span>0</span>
        <span>{Math.ceil(max)}</span>
      </div>
      <div className="range-legend">
        <span>
          <i className="minimum-dot" />
          최소 <b>{item.minimum}</b>
        </span>
        <span>
          <i className="target-dot" />
          적정 <b>{item.target}</b>
        </span>
      </div>
    </div>
  );
}
export default function ItemWorkspace({
  item,
  onStock,
  onAdd,
  queued,
  onEdit,
  onDelete,
  onMovement,
  disabled = false,
  stockInputDisabled = false,
  actionsDisabled = false,
}) {
  if (!item)
    return (
      <section className="item-workspace workspace-empty">
        <span className="eyebrow">ITEM WORKSPACE</span>
        <h1>재고 관리의 시작</h1>
        <p>품목을 등록하고 재고와 발주를 한곳에서 관리하세요.</p>
      </section>
    );
  const suggested = item.recommendedQuantity;
  return (
    <section className="item-workspace" aria-label="선택 품목 상세">
      <div className="detail-topline">
        <span className="eyebrow">ITEM WORKSPACE</span>
        <div className="item-actions">
          <button onClick={onMovement} disabled={disabled || actionsDisabled}>재고 변경</button>
          <span>/</span>
          <button onClick={onEdit} disabled={disabled || actionsDisabled}>품목 수정</button>
          <span>/</span>
          <button onClick={onDelete} disabled={disabled || actionsDisabled}>삭제</button>
        </div>
      </div>
      <div className="item-title" key={item.id}>
        <div className="category-label">
          {item.category}
          <span>·</span>
          {item.unit}
        </div>
        <div className="title-line">
          <h1>{item.name}</h1>
          <StatusBadge item={item} />
        </div>
      </div>
      <div className="stock-information">
        <div className="stock-section">
          <div className="stock-surface">
            <span className="eyebrow">CURRENT STOCK</span>
            <QuantityControl
              large
              value={item.stock}
              onChange={onStock}
              label={`${item.name} 현재 재고`}
              disabled={disabled}
              inputDisabled={stockInputDisabled}
            />
            <span className="stock-unit">
              보유 수량 <span>·</span> {item.unit} 기준
            </span>
          </div>
        </div>
        <StockRange item={item} />
        <div className="thresholds">
          <div>
            <span>Minimum Stock</span>
            <strong>
              {item.minimum}
              <small>최소 재고</small>
            </strong>
          </div>
          <div>
            <span>Target Stock</span>
            <strong>
              {item.target}
              <small>적정 재고</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="suggested-section">
        <div className="suggestion-heading">
          <span className="eyebrow">SUGGESTED ORDER</span>
          <span className="suggestion-note">{item.reorderStatus === "normal" && suggested > 0
            ? "선택 보충량 · 발주 필수 아님" : "최근 사용량과 납품 소요 반영"}</span>
        </div>
        <div className="suggested-body">
          <div className="suggested-number">
            {suggested}
            <span>개</span>
          </div>
          <p>{item.recommendationPending ? "추천 계산 중..." : item.reorderReason}</p>
        </div>
        <div className="reorder-metrics">
          <span>최근 7일 평균 사용 <strong>{item.averageDailyUsage.toFixed(1)}개/일</strong></span>
          <span>예상 소진 <strong>{item.estimatedDaysUntilStockout === null ? "최근 사용 기록 없음" : `${item.estimatedDaysUntilStockout.toFixed(1)}일`}</strong></span>
          <span>납품 소요 <strong>{item.leadTimeDays}일</strong></span>
        </div>
        <button
          className={`add-order ${queued ? "queued" : ""}`}
          disabled={disabled || (!suggested && !queued)}
          onClick={onAdd}
        >
          {queued ? "발주 목록에서 확인" : "발주 목록에 추가"}
        </button>
      </div>
      <div className="detail-footer">
        <span className="small-check">✓</span>재고 변경은 자동으로 저장됩니다
      </div>
    </section>
  );
}
