import { MAX_QUANTITY, statusLabels, statusOf } from "../inventory.js";

export function Arrow({ className = "" }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function StatusBadge({ item }) {
  const status = statusOf(item);
  return (
    <span className={`status ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
export function QuantityControl({
  value,
  onChange,
  label,
  large = false,
  min = 0,
}) {
  return (
    <div className={`quantity-control ${large ? "large" : ""}`}>
      <button
        className="circle"
        aria-label={`${label} 감소`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        aria-label={label}
        style={
          large && value >= 10000
            ? { fontSize: "44px", letterSpacing: "-2px" }
            : undefined
        }
        type="number"
        min={min}
        max={MAX_QUANTITY}
        step="1"
        value={value}
        onChange={(event) => {
          if (event.target.value === "") return;
          const next = Number(event.target.value);
          if (Number.isSafeInteger(next) && next >= min && next <= MAX_QUANTITY)
            onChange(next);
        }}
      />
      <button
        className="circle"
        aria-label={`${label} 증가`}
        disabled={value >= MAX_QUANTITY}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
