import { useId, useEffect, useState } from "react";

// Measure the existing controls so the connector follows selection, resize and queue scrolling.
export default function OrderFlow({
  workspaceRef,
  selectedId,
  enabled,
  pulse,
  queue,
}) {
  const pathId = useId();
  const [curve, setCurve] = useState(null);
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !enabled) {
      setCurve(null);
      return;
    }
    const source = workspace.querySelector(".add-order");
    const list = workspace.querySelector(".queue-list");
    const row = [...workspace.querySelectorAll("[data-item-id]")].find(
      (node) => node.dataset.itemId === selectedId,
    );
    const target =
      row ??
      workspace.querySelector(".queue-empty") ??
      workspace.querySelector(".order-queue .section-heading");
    if (!source || !target) return;
    const measure = () => {
      if (window.innerWidth <= 1100) {
        setCurve(null);
        return;
      }
      const root = workspace.getBoundingClientRect();
      const a = source.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      const x1 = a.right - root.left + 4,
        y1 = a.top - root.top + a.height / 2;
      const x2 = b.left - root.left - 5;
      const y2 =
        (row
          ? Math.min(Math.max(b.top + 26, bounds.top + 12), bounds.bottom - 12)
          : b.top + 26) - root.top;
      const mid = (x1 + x2) / 2;
      setCurve({
        d: `M ${x1} ${y1} C ${mid + 12} ${y1}, ${mid - 12} ${y2}, ${x2} ${y2}`,
        x2,
        y2,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    [workspace, source, target, list].forEach((node) => observer.observe(node));
    window.addEventListener("resize", measure);
    workspace.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      workspace.removeEventListener("scroll", measure, true);
    };
  }, [workspaceRef, selectedId, enabled, queue, pulse]);
  if (!curve) return null;
  return (
    <svg className="order-flow" aria-hidden="true">
      <path id={pathId} d={curve.d} className="order-flow-path" />
      <circle cx={curve.x2} cy={curve.y2} r="3" className="order-flow-end" />
      {pulse?.id === selectedId && (
        <g key={pulse.key} className="order-transfer">
          <rect x="-23" y="-13" width="46" height="26" rx="13" />
          <text textAnchor="middle" dominantBaseline="central">
            {pulse.quantity}
          </text>
          <animateMotion
            dur="0.38s"
            fill="freeze"
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".2 .6 .4 1"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </g>
      )}
    </svg>
  );
}
