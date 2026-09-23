import { MAX_QUANTITY, statusLabels, statusOf } from "../inventory.js";
import { useEffect, useRef } from "react";

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
  const inputRef = useRef(null);
  const previous = useRef(value);
  useEffect(() => {
    if (
      large &&
      previous.current !== value &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      inputRef.current.animate([{ opacity: 0.55 }, { opacity: 1 }], {
        duration: 150,
      });
    }
    previous.current = value;
  }, [value, large]);
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
        ref={inputRef}
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
