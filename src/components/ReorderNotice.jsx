export default function ReorderNotice({ urgentCount, reorderCount, nextItem, onAction, onDismiss }) {
  const message = nextItem
    ? nextItem.reorderStatus === "urgent"
      ? `${nextItem.name}의 재고가 곧 소진됩니다. 우선 확인해 주세요.`
      : `${nextItem.name}의 발주 시점을 확인해 주세요.`
    : "필요한 품목이 발주 대기열에 담겨 있습니다.";
  return <aside className={`reorder-notice ${urgentCount ? "is-urgent" : ""}`} role="status" aria-label="발주 알림" data-testid="reorder-notice">
    <div className="reorder-notice-top">
      <span className="reorder-notice-kicker">INVENTORY ALERT</span>
      <button type="button" className="reorder-notice-close" aria-label="발주 알림 닫기" onClick={onDismiss}>×</button>
    </div>
    <strong>긴급 {urgentCount}개 <span aria-hidden="true">·</span> 발주 필요 {reorderCount}개</strong>
    <p>{message}</p>
    <button type="button" className="reorder-notice-action" onClick={onAction}>
      {nextItem ? "발주 필요 품목 보기" : "발주 목록 확인"}<span aria-hidden="true">→</span>
    </button>
  </aside>;
}
