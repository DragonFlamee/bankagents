import { useMemo } from "react";
import type { Card } from "./types";

/** Hypotrochoid rosette, the curve family used in banknote guilloché. */
function rosette(cx: number, cy: number, R: number, r: number, d: number, scale: number, turns = 1) {
  const pts: string[] = [];
  const steps = 900;
  const k = (R - r) / r;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    pts.push(`${(cx + x * scale).toFixed(1)},${(cy + y * scale).toFixed(1)}`);
  }
  return "M" + pts.join("L");
}

export function Guilloche({ seed = 1, color = "#fff", opacity = 0.16, className = "" }: { seed?: number; color?: string; opacity?: number; className?: string }) {
  const paths = useMemo(() => {
    const R = 7 + (seed % 3);
    return [
      rosette(250, 40, R * 10, 10 + (seed % 4), 34, 1.15, 10),
      rosette(250, 40, R * 10, 13 + (seed % 3), 48, 0.9, 13),
      rosette(40, 190, 70, 9 + (seed % 2), 30, 1.1, 9),
    ];
  }, [seed]);
  return (
    <svg className={`guilloche ${className}`} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={i === 2 ? 0.45 : 0.55} opacity={opacity * (i === 2 ? 0.8 : 1)} />
      ))}
    </svg>
  );
}

const faces: Record<string, { bg: string; line: string; ink: string; label: string }> = {
  debit: { bg: "#142235", line: "#9fb3ff", ink: "#e7edf6", label: "借记卡" },
  credit: { bg: "#3d3020", line: "#e2c179", ink: "#f6ecd5", label: "信用卡" },
  virtual: { bg: "#3a33a8", line: "#c6c2ff", ink: "#f0edff", label: "虚拟卡" },
};
const stamps: Record<string, string> = { lost: "已挂失", frozen: "已冻结", processing: "制卡中" };

export function BankCardFace({ card, compact = false }: { card: Card; compact?: boolean }) {
  const face = faces[card.kind || "debit"] || faces.debit;
  const seed = Number(card.last4) || 7;
  return (
    <div
      className={`card-face ${compact ? "is-compact" : ""} status-${card.status}`}
      style={{ ["--card-bg" as string]: face.bg, ["--card-ink" as string]: face.ink, ["--card-line" as string]: face.line }}
      aria-label={`${card.name || face.label} 尾号 ${card.last4}`}
    >
      <Guilloche seed={seed} color={face.line} opacity={0.32} />
      <div className="card-top">
        <span className="card-bank">拾迹银行</span>
        <span className="card-kind">{face.label}</span>
      </div>
      {card.kind !== "virtual" && (
        <span className="card-chip" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
      <div className="card-number tabular">
        <span>••••</span><span>••••</span><span>••••</span><span>{card.last4}</span>
      </div>
      <div className="card-bottom">
        <span>{card.name || "拾迹借记卡"}</span>
        {card.kind === "credit" && card.limit_cents != null && (
          <span className="tabular">额度 {(card.limit_cents / 100).toLocaleString("zh-CN")}</span>
        )}
      </div>
      {stamps[card.status] && <span className="card-stamp">{stamps[card.status]}</span>}
    </div>
  );
}
