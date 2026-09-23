import { filterItems } from "../inventory.js";
import { StatusBadge } from "./Controls.jsx";

const filters = [
  ["all", "전체"],
  ["low", "발주 필요"],
  ["urgent", "긴급"],
  ["normal", "정상"],
];
export default function ItemBrowser({
  items,
  selectedId,
  onSelect,
  query,
  setQuery,
  filter,
  setFilter,
  onNew,
}) {
  const visible = filterItems(items, query, filter);
  return (
    <section className="item-browser" aria-label="전체 품목">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR INVENTORY</span>
          <h2>
            All Items <span className="count">{items.length}</span>
          </h2>
        </div>
        <button
          className="new-item circle"
          onClick={onNew}
          aria-label="품목 등록"
        >
          +
        </button>
      </div>
      <label className="search">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="10.5"
            cy="10.5"
            r="6.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m16 16 4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          aria-label="품목 검색"
          placeholder="품목 또는 카테고리 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button aria-label="검색 지우기" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </label>
      <div className="filters" aria-label="재고 상태 필터">
        {filters.map(([value, label]) => (
          <button
            key={value}
            aria-label={label}
            aria-pressed={filter === value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "low" ? "발주" : label}
            <span className="filter-count">
              {filterItems(items, "", value).length}
            </span>
          </button>
        ))}
      </div>
      <div className="list-caption">
        <span>품목 / 단위</span>
        <span>현재 / 최소</span>
      </div>
      <div className="item-list">
        {visible.map((item) => (
          <button
            key={item.id}
            className={`item-row ${selectedId === item.id ? "selected" : ""}`}
            aria-pressed={selectedId === item.id}
            onClick={() => onSelect(item.id)}
          >
            <span className="item-main">
              <strong>{item.name}</strong>
              <span className="metadata">
                {item.category}
                <span className="dot">·</span>
                {item.unit}
              </span>
            </span>
            <span className="item-numbers">
              <span>
                <b>{item.stock}</b>
                <span className="muted"> / {item.minimum}</span>
              </span>
              <StatusBadge item={item} />
            </span>
          </button>
        ))}
        {!visible.length && (
          <div className="empty-state">
            <strong>
              {items.length
                ? "일치하는 품목이 없어요"
                : "첫 품목을 등록해 보세요"}
            </strong>
            <p>
              {items.length
                ? "검색어나 필터를 변경해 보세요."
                : "오른쪽 위 + 버튼으로 시작하세요."}
            </p>
            {items.length > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                검색·필터 초기화
              </button>
            )}
          </div>
        )}
      </div>
      <div className="browser-footer">
        <span className="live-dot" />
        {visible.length}개 품목 표시<span>직접 선택해 보세요</span>
      </div>
    </section>
  );
}
