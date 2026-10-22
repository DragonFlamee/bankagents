import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { labels, statuses } from "./api";
import { Hint } from "./controls";
import type { Plan } from "./types";

export function PlanMap({ plan }: { plan: Plan }) {
  const [zoom, setZoom] = useState(100),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const svg = useRef<SVGSVGElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    marker = useId().replaceAll(":", "");
  const graph = useMemo(() => {
    const levels = new Map<string, number>();
    function level(id: string, seen = new Set<string>()): number {
      if (levels.has(id)) return levels.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const n = plan.nodes.find((n) => n.id === id);
      const l = n?.depends_on.length
        ? 1 + Math.max(...n.depends_on.map((d) => level(d, new Set(seen))))
        : 0;
      levels.set(id, l);
      return l;
    }
    plan.nodes.forEach((n) => level(n.id));
    const groups = [...new Set(levels.values())]
      .sort((a, b) => a - b)
      .map((l) => plan.nodes.filter((n) => levels.get(n.id) === l));
    const rows = groups.flatMap((group) =>
      Array.from({ length: Math.ceil(group.length / 3) }, (_, i) =>
        group.slice(i * 3, i * 3 + 3),
      ),
    );
    const width = Math.max(210, ...rows.map((g) => g.length * 166 + 24));
    const points = new Map(
      rows.flatMap((g, l) =>
        g.map((n, i) => [
          n.id,
          { x: width / 2 + (i - (g.length - 1) / 2) * 166, y: 24 + l * 96 },
        ]),
      ),
    );
    return { points, width, height: Math.max(140, rows.length * 96 + 10) };
  }, [plan.nodes]);
  useEffect(() => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }, [plan.id]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setZoom((z) =>
          Math.max(50, Math.min(200, z + (e.deltaY > 0 ? -25 : 25))),
        );
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function change(delta: number) {
    setZoom((z) => Math.max(50, Math.min(200, z + delta)));
  }
  function reset() {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }
  const vw = (graph.width * 100) / zoom,
    vh = (graph.height * 100) / zoom;
  return (
    <div className="plan-map-wrap">
      <div className="plan-map-tools" role="toolbar" aria-label="依赖图缩放">
        <Hint label="缩小（-），最小 50%">
          <button
            className="icon-button"
            aria-label="缩小依赖图"
            disabled={zoom <= 50}
            onClick={() => change(-25)}
          >
            <Minus size={15} />
          </button>
        </Hint>
        <span className="zoom-label" aria-live="polite">
          {zoom}%
        </span>
        <Hint label="放大（+），最大 200%">
          <button
            className="icon-button"
            aria-label="放大依赖图"
            disabled={zoom >= 200}
            onClick={() => change(25)}
          >
            <Plus size={15} />
          </button>
        </Hint>
        <Hint label="适应画布（0）">
          <button
            className="icon-button"
            aria-label="重置依赖图"
            onClick={reset}
          >
            <RotateCcw size={14} />
          </button>
        </Hint>
        <span className="map-title">真实任务依赖</span>
      </div>
      <div
        ref={canvas}
        className="plan-map"
        tabIndex={0}
        role="group"
        aria-label="任务依赖画布，支持加减号缩放、零复位和方向键平移"
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.target !== e.currentTarget) return;
          if (e.key === "+" || e.key === "=") change(25);
          else if (e.key === "-") change(-25);
          else if (e.key === "0") reset();
          else if (e.key.startsWith("Arrow"))
            setPan((p) => ({
              x:
                p.x +
                (e.key === "ArrowRight" ? 24 : e.key === "ArrowLeft" ? -24 : 0),
              y:
                p.y +
                (e.key === "ArrowDown" ? 24 : e.key === "ArrowUp" ? -24 : 0),
            }));
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = svg.current?.getBoundingClientRect();
          if (!rect) return;
          setPan({
            x:
              drag.current.px -
              ((e.clientX - drag.current.x) * vw) / rect.width,
            y:
              drag.current.py -
              ((e.clientY - drag.current.y) * vh) / rect.height,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <svg
          ref={svg}
          viewBox={`${(graph.width - vw) / 2 + pan.x} ${-6 + (graph.height - vh) / 2 + pan.y} ${vw} ${vh}`}
          role="img"
          aria-label={plan.nodes
            .map(
              (n) =>
                `${n.id} ${labels[n.tool] || n.tool}，${statuses[n.status] || n.status}，${n.depends_on.length ? "依赖" + n.depends_on.join("、") : "无前置依赖"}`,
            )
            .join("；")}
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="map-arrow" />
            </marker>
          </defs>
          {plan.nodes.flatMap((n) =>
            n.depends_on.map((d) => {
              const a = graph.points.get(d),
                b = graph.points.get(n.id);
              return a && b ? (
                <path
                  key={d + n.id}
                  d={`M${a.x},${a.y + 55} C${a.x},${a.y + 78} ${b.x},${b.y - 20} ${b.x},${b.y - 3}`}
                  className="map-edge"
                  markerEnd={`url(#${marker})`}
                />
              ) : null;
            }),
          )}
          {plan.nodes.map((n) => {
            const p = graph.points.get(n.id)!;
            return (
              <g key={n.id} transform={`translate(${p.x - 73},${p.y})`}>
                <title>{`${n.id} · ${labels[n.tool] || n.tool} · ${statuses[n.status] || n.status}`}</title>
                <rect
                  width="146"
                  height="55"
                  rx="5"
                  className={`map-node map-node-${n.status}`}
                />
                <text x="12" y="23" className="map-label">
                  {labels[n.tool] || n.tool}
                </text>
                <text x="12" y="42" className="map-meta">
                  {n.id} · {statuses[n.status] || n.status}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="map-help">
        拖动或方向键平移 · + / − 缩放 · 0 复位 · Alt +
        滚轮缩放。节点和连线来自本次实际计划。
      </p>
    </div>
  );
}
