import { useId, useMemo, useState, type ReactNode } from "react";
import { money } from "./api";

/** Category hues: muted, distinguishable, all AA against white at 3:1 for graphics. */
export const categoryColor: Record<string, string> = {
  居住: "#33486b",
  餐饮: "#635bff",
  购物: "#2c8a98",
  交通: "#b7832a",
  订阅: "#b0507a",
  娱乐: "#7a5bc8",
  运动: "#4b8a56",
  转账: "#8a97aa",
  出行: "#c7683f",
  医疗: "#4f86d4",
  生活: "#c0627f",
  理财: "#3e7cb1",
  收款: "#2f7d6b",
  收入: "#255a7a",
};
export const colorFor = (c: string) => categoryColor[c] || "#7c8fa1";
export const riskColor = ["", "#2f7d6b", "#5f9446", "#b8921f", "#c96f2e", "#b23b2e"];
export const riskName = ["", "低风险", "中低风险", "中风险", "中高风险", "高风险"];
export const investorName = ["未测评", "保守型", "稳健型", "平衡型", "成长型", "进取型"];

export const yuan = (cents: number) =>
  cents >= 1_000_000
    ? `${(cents / 1_000_000).toFixed(cents % 1_000_000 ? 1 : 0)}万`
    : `${Math.round(cents / 100).toLocaleString("zh-CN")}`;

export const shortDate = (s: string) => {
  const d = new Date(s.length === 10 ? s + "T00:00:00+08:00" : s);
  return `${d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric" })}${d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", day: "numeric" })}`;
};

/* ---------------------------------------------------------------- donut */
export function Donut({
  items,
  total,
  label,
  size = 176,
  onSelect,
  selected,
}: {
  items: { key: string; value: number; color: string }[];
  total?: number;
  label: ReactNode;
  size?: number;
  onSelect?: (key: string | null) => void;
  selected?: string | null;
}) {
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  const r = 70,
    c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 176 176"
        role="img"
        aria-label={items
          .map((i) => `${i.key} ${Math.round((100 * i.value) / (sum || 1))}%`)
          .join("，")}
      >
        <circle cx="88" cy="88" r={r} className="donut-track" />
        {items.map((i) => {
          const len = sum ? (i.value / sum) * c : 0;
          const gap = items.length > 1 ? Math.min(2.5, len / 3) : 0;
          const el = (
            <circle
              key={i.key}
              cx="88"
              cy="88"
              r={r}
              fill="none"
              stroke={i.color}
              strokeWidth={selected === i.key ? 22 : 18}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 88 88)"
              opacity={selected && selected !== i.key ? 0.28 : 1}
              className="donut-seg"
              onMouseEnter={() => onSelect?.(i.key)}
              onMouseLeave={() => onSelect?.(null)}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="donut-label">{label}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- sankey */
export function CashFlowSankey({
  income,
  categories,
  height = 340,
}: {
  income: number;
  categories: { category: string; total_cents: number }[];
  height?: number;
}) {
  const expense = categories.reduce((s, c) => s + c.total_cents, 0);
  const saved = income - expense;
  const sources = [
    { label: "收入", value: income, color: colorFor("收入") },
    ...(saved < 0
      ? [{ label: "动用存款", value: -saved, color: "#a13e32" }]
      : []),
  ].filter((s) => s.value > 0);
  const sorted = [...categories].sort((a, b) => b.total_cents - a.total_cents);
  // Slivers under 3% of inflow are merged so every label has room.
  const floor = Math.max(income, expense) * 0.03;
  const top = sorted.filter((c, i) => i < 7 && c.total_cents >= floor);
  const rest = sorted.filter((c) => !top.includes(c)).reduce((s, c) => s + c.total_cents, 0);
  const targets = [
    ...top.map((c) => ({
      label: c.category,
      value: c.total_cents,
      color: colorFor(c.category),
    })),
    ...(rest ? [{ label: "其他", value: rest, color: "#9aa7b6" }] : []),
    ...(saved > 0
      ? [{ label: "结余", value: saved, color: "#2f7d6b", saved: true }]
      : []),
  ] as { label: string; value: number; color: string; saved?: boolean }[];
  const total = Math.max(1, sources.reduce((s, x) => s + x.value, 0));
  const W = 960,
    H = height,
    gap = 10,
    nodeW = 12,
    left = 110,
    right = W - 200;
  const usable = H - gap * (targets.length - 1) - 16;
  const scale = usable / total;
  let y = 8;
  const tNodes = targets.map((t) => {
    const h = Math.max(2, t.value * scale);
    const n = { ...t, y, h };
    y += h + gap;
    return n;
  });
  // Source bars carry the same scale as targets; their gaps sit outside the flow.
  const srcGap = 10;
  const srcTotal = sources.reduce((a, x) => a + x.value * scale, 0) + srcGap * (sources.length - 1);
  let sy = 8 + (usable + gap * (targets.length - 1) - srcTotal) / 2;
  const sNodes = sources.map((src) => {
    const h = Math.max(2, src.value * scale);
    const n = { ...src, y: sy, h };
    sy += h + srcGap;
    return n;
  });
  const flows: { d: string; color: string; w: number; key: string }[] = [];
  let si = 0,
    sOff = 0;
  for (const t of tNodes) {
    let remaining = t.value,
      tOff = 0;
    while (remaining > 0 && si < sNodes.length) {
      const src = sNodes[si];
      const take = Math.min(remaining, src.value - sOff);
      const w = Math.max(1, take * scale);
      const y0 = src.y + sOff * scale + w / 2;
      const y1 = t.y + tOff + w / 2;
      const x0 = left + nodeW,
        x1 = right;
      const mx = (x0 + x1) / 2;
      flows.push({ d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`, color: t.color, w, key: `${src.label}-${t.label}` });
      remaining -= take;
      sOff += take;
      tOff += w;
      if (sOff >= src.value) {
        si++;
        sOff = 0;
      }
    }
  }
  const [hover, setHover] = useState<string | null>(null);
  return (
    <svg
      className="sankey"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`收入 ${money(income)}，支出 ${money(expense)}，${saved >= 0 ? "结余" : "超支"} ${money(Math.abs(saved))}`}
    >
      {flows.map((f) => (
        <path
          key={f.key}
          d={f.d}
          stroke={f.color}
          strokeWidth={f.w}
          fill="none"
          className="sankey-flow"
          opacity={hover && !f.key.endsWith("-" + hover) ? 0.08 : 0.26}
        />
      ))}
      {sNodes.map((s) => (
        <g key={s.label}>
          <rect x={left} y={s.y} width={nodeW} height={s.h} rx="2" fill={s.color} />
          <text x={left - 10} y={s.y + s.h / 2 - 6} textAnchor="end" className="sankey-label">
            {s.label}
          </text>
          <text x={left - 10} y={s.y + s.h / 2 + 12} textAnchor="end" className="sankey-value">
            {yuan(s.value)}
          </text>
        </g>
      ))}
      {tNodes.map((t) => (
        <g
          key={t.label}
          onMouseEnter={() => setHover(t.label)}
          onMouseLeave={() => setHover(null)}
          className="sankey-target"
        >
          <rect x={right} y={t.y} width={nodeW} height={t.h} rx="2" fill={t.color} />
          <text x={right + nodeW + 12} y={t.y + t.h / 2 + 4} className={`sankey-label ${t.saved ? "is-saved" : ""}`}>
            {t.label}
            <tspan className="sankey-value" dx="8">
              {yuan(t.value)} · {Math.round((100 * t.value) / total)}%
            </tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- monthly bars */
export function MonthlyBars({
  months,
  highlight,
}: {
  months: { month: string; income_cents: number; expense_cents: number; transfer_cents: number }[];
  highlight?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.flatMap((m) => [m.income_cents, m.expense_cents]));
  const W = 640,
    H = 220,
    base = H - 28,
    slot = (W - 40) / Math.max(1, months.length),
    bw = Math.min(26, slot / 3);
  const h = (v: number) => (v / max) * (base - 16);
  const focus = hover ?? months.length - 1;
  const m = months[focus];
  return (
    <div className="monthly-bars">
      {m && (
        <div className="chart-readout">
          <strong>{m.month.replace("-", " 年 ")} 月</strong>
          <span>
            <i style={{ background: colorFor("收入") }} />收入 {money(m.income_cents)}
          </span>
          <span>
            <i style={{ background: "#635bff" }} />支出 {money(m.expense_cents)}
          </span>
          <span>
            结余{" "}
            <b className={m.income_cents - m.expense_cents < 0 ? "negative" : ""}>
              {money(m.income_cents - m.expense_cents)}
            </b>
            {m.income_cents > 0 && (
              <em>
                {" "}
                储蓄率 {Math.round((100 * (m.income_cents - m.expense_cents)) / m.income_cents)}%
              </em>
            )}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近几个月收入与支出对比柱状图" onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((f) => (
          <line key={f} x1="30" x2={W - 6} y1={base - (base - 16) * f} y2={base - (base - 16) * f} className="chart-grid" />
        ))}
        <line x1="30" x2={W - 6} y1={base} y2={base} className="chart-axis" />
        {months.map((mo, i) => {
          const x = 40 + i * slot + slot / 2;
          const active = i === focus;
          return (
            <g key={mo.month} onMouseEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)}
               aria-label={`${mo.month} 收入 ${money(mo.income_cents)} 支出 ${money(mo.expense_cents)}`}>
              <rect x={x - slot / 2} y="0" width={slot} height={base} fill="transparent" />
              <rect x={x - bw - 2} y={base - h(mo.income_cents)} width={bw} height={h(mo.income_cents)} rx="3"
                    fill={colorFor("收入")} opacity={active ? 1 : 0.38} />
              <rect x={x + 2} y={base - h(mo.expense_cents - mo.transfer_cents)} width={bw}
                    height={h(mo.expense_cents - mo.transfer_cents)} rx="3" fill="#635bff" opacity={active ? 1 : 0.38} />
              {mo.transfer_cents > 0 && (
                <rect x={x + 2} y={base - h(mo.expense_cents)} width={bw} height={h(mo.transfer_cents)} rx="3"
                      fill="#8a97aa" opacity={active ? 0.9 : 0.3} />
              )}
              <text x={x} y={H - 8} textAnchor="middle" className={`chart-label ${mo.month === highlight ? "is-current" : ""}`}>
                {Number(mo.month.slice(5))}月
              </text>
            </g>
          );
        })}
      </svg>
      <p className="chart-legend">
        <span><i style={{ background: colorFor("收入") }} />收入</span>
        <span><i style={{ background: "#635bff" }} />消费</span>
        <span><i style={{ background: "#8a97aa" }} />转出</span>
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- calendar heatmap */
export function SpendCalendar({
  start,
  end,
  days,
  marks = [],
}: {
  start: string;
  end: string;
  days: { day: string; expense_cents: number }[];
  marks?: string[];
}) {
  const map = new Map(days.map((d) => [d.day, d.expense_cents]));
  const first = new Date(start + "T00:00:00+08:00");
  const last = new Date(end + "T00:00:00+08:00");
  const cells: { day: string; value: number; dow: number; week: number }[] = [];
  const lead = (first.getUTCDay() + 6) % 7;
  for (let d = new Date(first), i = 0; d <= last; d.setUTCDate(d.getUTCDate() + 1), i++) {
    const key = new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
    cells.push({ day: key, value: map.get(key) || 0, dow: (lead + i) % 7, week: Math.floor((lead + i) / 7) });
  }
  const [hover, setHover] = useState<string | null>(null);
  if (cells.length > 62) return null;
  const sorted = [...map.values()].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] || 0;
  const cuts = [q(0.25), q(0.5), q(0.75), q(0.92)];
  const level = (v: number) => (v === 0 ? 0 : 1 + cuts.filter((c) => v > c).length);
  const h = hover ? cells.find((c) => c.day === hover) : null;
  return (
    <div className="spend-calendar">
      <div className="calendar-head">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid" style={{ gridTemplateRows: `repeat(${Math.max(...cells.map((c) => c.week)) + 1}, 1fr)` }}>
        {cells.map((c) => (
          <button
            type="button"
            key={c.day}
            className={`calendar-cell heat-${level(c.value)} ${marks.includes(c.day) ? "is-flagged" : ""}`}
            style={{ gridColumn: c.dow + 1, gridRow: c.week + 1 }}
            onMouseEnter={() => setHover(c.day)}
            onFocus={() => setHover(c.day)}
            onMouseLeave={() => setHover(null)}
            aria-label={`${c.day} 支出 ${money(c.value)}${marks.includes(c.day) ? "，有待核对交易" : ""}`}
          >
            {Number(c.day.slice(8))}
          </button>
        ))}
      </div>
      <p className="calendar-readout">
        {h ? (
          <>
            <strong>{shortDate(h.day)}</strong> 支出 {money(h.value)}
            {marks.includes(h.day) && <em> · 有待核对的交易</em>}
          </>
        ) : (
          <>
            <span className="heat-scale">
              少 {[1, 2, 3, 4, 5].map((l) => <i key={l} className={`heat-${l}`} />)} 多
            </span>
            <span className="flag-key"><i />有待核对交易</span>
          </>
        )}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- anomaly strip */
export function AnomalyScatter({
  rows,
  flagged,
  start,
  end,
  onPick,
  picked,
}: {
  rows: { id: string; amount_cents: number; occurred_at: string; merchant: string; category: string }[];
  flagged: { transaction_id: string }[];
  start: string;
  end: string;
  onPick?: (id: string) => void;
  picked?: string | null;
}) {
  const spend = rows.filter((r) => r.amount_cents < 0 && !["转账", "居住", "理财"].includes(r.category));
  const ids = new Set(flagged.map((f) => f.transaction_id));
  const t0 = Date.parse(start + "T00:00:00+08:00"),
    t1 = Date.parse(end + "T23:59:59+08:00");
  const max = Math.max(1, ...spend.map((r) => -r.amount_cents));
  const W = 640,
    H = 200,
    pad = 34;
  const x = (t: string) => pad + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - pad - 10);
  const y = (v: number) => H - 26 - (Math.log10(1 + v / 100) / Math.log10(1 + max / 100)) * (H - 50);
  const ticks = [10, 100, 1000].filter((v) => v * 100 < max * 1.2);
  return (
    <svg className="anomaly-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`本期 ${spend.length} 笔消费中 ${ids.size} 笔需要核对`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad} x2={W - 6} y1={y(v * 100)} y2={y(v * 100)} className="chart-grid" />
          <text x={pad - 6} y={y(v * 100) + 4} textAnchor="end" className="chart-label">
            {v >= 1000 ? "1千" : v}
          </text>
        </g>
      ))}
      <line x1={pad} x2={W - 6} y1={H - 26} y2={H - 26} className="chart-axis" />
      <text x={pad} y={H - 8} className="chart-label">{shortDate(start)}</text>
      <text x={W - 6} y={H - 8} textAnchor="end" className="chart-label">{shortDate(end)}</text>
      {spend.filter((r) => !ids.has(r.id)).map((r) => (
        <circle key={r.id} cx={x(r.occurred_at)} cy={y(-r.amount_cents)} r={3} className="scatter-dot" fill={colorFor(r.category)} />
      ))}
      {spend.filter((r) => ids.has(r.id)).map((r) => (
        <g key={r.id} className={`scatter-flag ${picked === r.id ? "is-picked" : ""}`} onClick={() => onPick?.(r.id)}
           tabIndex={0} role="button" aria-label={`${r.merchant} ${money(-r.amount_cents)}，需要核对`}
           onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick?.(r.id)}>
          <circle cx={x(r.occurred_at)} cy={y(-r.amount_cents)} r={11} className="flag-halo" />
          <circle cx={x(r.occurred_at)} cy={y(-r.amount_cents)} r={5} className="flag-core" />
          <text x={x(r.occurred_at)} y={y(-r.amount_cents) - 16} textAnchor="middle" className="flag-label">
            {r.merchant}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- lines (NAV) */
export function NavChart({
  series,
  height = 300,
}: {
  series: { id: string; name: string; color: string; points: number[]; dim?: boolean }[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(...series.map((s) => s.points.length));
  const all = series.flatMap((s) => s.points.map((p) => (p - 1) * 100));
  const lo = Math.min(-1, ...all),
    hi = Math.max(1, ...all);
  const W = 1000,
    H = height,
    padL = 46,
    padB = 24;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - 12);
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - padB - 14);
  const ticks = niceTicks(lo, hi);
  return (
    <div className="nav-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近一年模拟净值走势对比"
           onMouseMove={(e) => {
             const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
             const px = ((e.clientX - r.left) / r.width) * W;
             setHover(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (W - padL - 12)) * (n - 1)))));
           }}
           onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-axis" : "chart-grid"} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="chart-label">{t > 0 ? "+" : ""}{t}%</text>
          </g>
        ))}
        {["12个月前", "6个月前", "现在"].map((l, i) => (
          <text key={l} x={x((i * (n - 1)) / 2)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="chart-label">{l}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.id} fill="none" stroke={s.color} strokeWidth={s.dim ? 1.4 : 2.2} opacity={s.dim ? 0.35 : 1}
                    strokeLinejoin="round" points={s.points.map((p, i) => `${x(i)},${y((p - 1) * 100)}`).join(" ")} />
        ))}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1="8" y2={H - padB} className="chart-crosshair" />
            {series.map((s) => s.points[hover] != null && (
              <circle key={s.id} cx={x(hover)} cy={y((s.points[hover] - 1) * 100)} r="3.5" fill={s.color} stroke="#fff" strokeWidth="1.5" />
            ))}
          </>
        )}
      </svg>
      <ul className="nav-legend">
        {series.map((s) => {
          const p = s.points[hover ?? s.points.length - 1];
          const v = (p - 1) * 100;
          return (
            <li key={s.id} className={s.dim ? "is-dim" : ""}>
              <i style={{ background: s.color }} />
              <span>{s.name}</span>
              <b className={v < 0 ? "negative" : ""}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function niceTicks(lo: number, hi: number) {
  const span = hi - lo;
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : span > 2.5 ? 1 : 0.5;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(Math.round(t * 10) / 10);
  return out;
}

/* ---------------------------------------------------------------- projection band */
export function ProjectionChart({
  amount,
  months,
  annual,
  vol,
  color,
}: {
  amount: number;
  months: number;
  annual: number;
  vol: number;
  color: string;
}) {
  const W = 640,
    H = 200,
    padL = 56;
  const pts = Array.from({ length: months + 1 }, (_, m) => {
    const t = m / 12;
    const mid = amount * Math.pow(1 + annual, t);
    const spread = amount * vol * Math.sqrt(t);
    return { m, mid, lo: Math.max(0, mid - spread), hi: mid + spread };
  });
  const lo = Math.min(...pts.map((p) => p.lo)),
    hi = Math.max(...pts.map((p) => p.hi));
  const pad = (hi - lo) * 0.1 || amount * 0.01;
  const x = (m: number) => padL + (m / Math.max(1, months)) * (W - padL - 14);
  const y = (v: number) => 10 + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 40);
  const band = pts.map((p) => `${x(p.m)},${y(p.hi)}`).join(" ") + " " + [...pts].reverse().map((p) => `${x(p.m)},${y(p.lo)}`).join(" ");
  const end = pts.at(-1)!;
  const gid = useId();
  return (
    <svg className="projection-chart" viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={`${months} 个月后中位估计 ${money(end.mid)}，大约区间 ${money(end.lo)} 到 ${money(end.hi)}`}>
      <defs>
        <pattern id={gid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="1.2" opacity="0.35" />
        </pattern>
      </defs>
      <line x1={padL} x2={W - 8} y1={y(amount)} y2={y(amount)} className="chart-axis" strokeDasharray="3 4" />
      <text x={padL - 6} y={y(amount) + 4} textAnchor="end" className="chart-label">本金</text>
      {vol > 0.001 && <polygon points={band} fill={`url(#${gid})`} />}
      <polyline fill="none" stroke={color} strokeWidth="2.4" points={pts.map((p) => `${x(p.m)},${y(p.mid)}`).join(" ")} />
      <circle cx={x(months)} cy={y(end.mid)} r="4" fill={color} />
      <text x={x(0)} y={H - 8} className="chart-label">今天</text>
      <text x={x(months)} y={H - 8} textAnchor="end" className="chart-label">{months} 个月后</text>
    </svg>
  );
}

/* ---------------------------------------------------------------- gauge */
export function Gauge({
  value,
  max,
  label,
  sub,
  color = "#635bff",
}: {
  value: number;
  max: number;
  label: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  const f = Math.max(0, Math.min(1, value / (max || 1)));
  const r = 60,
    len = Math.PI * r;
  return (
    <div className="gauge">
      <svg viewBox="0 0 150 86" role="img" aria-label={`${Math.round(f * 100)}%`}>
        <path d="M15 78 A60 60 0 0 1 135 78" className="gauge-track" />
        <path d="M15 78 A60 60 0 0 1 135 78" stroke={color} className="gauge-fill"
              strokeDasharray={`${f * len} ${len}`} />
      </svg>
      <div className="gauge-label">
        <strong>{label}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- risk ladder */
export function RiskLadder({
  level,
  products,
}: {
  level: number;
  products: { id: string; name: string; risk: number }[];
}) {
  return (
    <div className="risk-ladder" role="img" aria-label={`你的测评等级 C${level}，可购买 R${level} 及以下`}>
      {[1, 2, 3, 4, 5].map((r) => (
        <div key={r} className={`ladder-step ${r > level ? "is-locked" : ""}`} style={{ ["--risk" as string]: riskColor[r] }}>
          <div className="ladder-bar" style={{ height: 22 + r * 14 }} />
          <strong>R{r}</strong>
          <span>{riskName[r]}</span>
          <ul>
            {products.filter((p) => p.risk === r).map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
          {r === level && <em className="ladder-you">你的上限 · C{level}</em>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline */
export interface TimelineItem {
  date: string;
  label: string;
  detail?: string;
  tone: "transfer" | "order" | "hold" | "birthday" | "subscription" | "today";
  amount?: number;
}
export function MoneyTimeline({ items, today, days = 45 }: { items: TimelineItem[]; today: string; days?: number }) {
  const t0 = Date.parse(today + "T00:00:00+08:00");
  const within = items
    .map((i) => ({ ...i, offset: Math.round((Date.parse(i.date + "T00:00:00+08:00") - t0) / 86400e3) }))
    .filter((i) => i.offset >= 0 && i.offset <= days)
    .sort((a, b) => a.offset - b.offset);
  const span = Math.max(days, ...within.map((i) => i.offset));
  const lanes: number[] = [];
  const placed = within.map((i) => {
    let lane = 0;
    while (lanes[lane] != null && i.offset - lanes[lane] < span * 0.12) lane++;
    lanes[lane] = i.offset;
    return { ...i, lane };
  });
  const laneCount = Math.max(1, lanes.length);
  const weeks = useMemo(() => Array.from({ length: Math.floor(span / 7) + 1 }, (_, w) => w * 7), [span]);
  return (
    <div className="money-timeline" style={{ ["--lanes" as string]: laneCount }}>
      <div className="timeline-axis">
        {weeks.map((w) => (
          <span key={w} style={{ left: `${(w / span) * 100}%` }}>
            {w === 0 ? "今天" : shortDate(new Date(t0 + w * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10))}
          </span>
        ))}
      </div>
      <div className="timeline-track">
        {placed.map((i, n) => (
          <div key={n} className={`timeline-pin tone-${i.tone}`} style={{ left: `${(i.offset / span) * 100}%`, ["--lane" as string]: i.lane }}>
            <i />
            <div className="pin-card">
              <strong>{i.label}</strong>
              <span>
                {i.offset === 0 ? "今天" : `${shortDate(i.date)} · ${i.offset} 天后`}
                {i.amount != null && <b> {money(i.amount)}</b>}
              </span>
              {i.detail && <small>{i.detail}</small>}
            </div>
          </div>
        ))}
      </div>
      {!placed.length && <p className="text-muted timeline-empty">未来 {days} 天没有预约或提醒。</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- segmented meter */
export function Meter({ value, max, tone = "neutral", label }: { value: number; max: number; tone?: string; label: string }) {
  return (
    <div className={`meter tone-${tone}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? "on" : ""} />
      ))}
    </div>
  );
}

export function Sparkline({ points, color = "#635bff", width = 120, height = 32 }: { points: number[]; color?: string; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const lo = Math.min(...points),
    hi = Math.max(...points);
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={points.map((p, i) => `${x(i)},${y(p)}`).join(" ")} />
    </svg>
  );
}
