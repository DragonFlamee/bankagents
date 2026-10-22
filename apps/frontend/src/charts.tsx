import { useEffect, useState } from "react";
import { money } from "./api";
import type { Analytics } from "./types";

export function SpendingChart({ data }: { data: Analytics | null }) {
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width:600px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width:600px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = (data?.transactions || [])
    .filter((t) => t.amount_cents < 0)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let total = 0;
  const values = rows.length
    ? [
        { day: rows[0].occurred_at, value: 0 },
        ...rows.map((t) => {
          total -= t.amount_cents;
          return { day: t.occurred_at, value: total };
        }),
      ]
    : [];
  const max = Math.max(100, ...values.map((v) => v.value));
  const w = compact ? 380 : 700,
    h = 190,
    x = (i: number) => 48 + (i * (w - 64)) / Math.max(1, values.length - 1),
    y = (v: number) => h - 20 - (v / max) * (h - 40);
  const path = values
      .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v.value)}`)
      .join(" "),
    focus = selected == null ? null : values[selected];
  return (
    <div className="spending-chart">
      <div className="chart-key">
        <span>
          <i />
          累计支出
        </span>
        <span className="tabular">
          {focus
            ? `${focus.day} · ${money(focus.value)}`
            : "按支出交易顺序累计"}
        </span>
      </div>
      {!values.length ? (
        <div className="chart-empty">所选期间暂无交易</div>
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h + 28}`}
          role="img"
          aria-label="按支出交易发生顺序累计的支出折线图"
          onMouseLeave={() => setSelected(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1="48"
                x2={w - 12}
                y1={y(max * f)}
                y2={y(max * f)}
                className="chart-grid"
              />
              <text x="0" y={y(max * f) + 4} className="chart-label">
                {Math.round((max * f) / 100).toLocaleString()}
              </text>
            </g>
          ))}
          {values.length > 1 && (
            <path
              d={`${path} L${x(values.length - 1)},${h - 20} L48,${h - 20} Z`}
              className="chart-area"
            />
          )}
          <path d={path} className="chart-line" />
          {values.map((v, i) => (
            <g
              key={v.day}
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              tabIndex={0}
              aria-label={`${v.day} 累计支出 ${money(v.value)}`}
            >
              <circle
                cx={x(i)}
                cy={y(v.value)}
                r={selected === i ? 5 : 3}
                className="chart-dot"
              />
              <circle cx={x(i)} cy={y(v.value)} r="14" fill="transparent" />
              {(i === 0 ||
                i === values.length - 1 ||
                i === Math.floor(values.length / 2)) && (
                <text
                  x={x(i)}
                  y={h + 10}
                  textAnchor={
                    i === 0
                      ? "start"
                      : i === values.length - 1
                        ? "end"
                        : "middle"
                  }
                  className="chart-label"
                >
                  {new Date(v.day).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <p className="small-note">
        仅基于当前演示账户已入账交易，不代表未来趋势。
      </p>
    </div>
  );
}
export function CategoryBars({ data }: { data: Analytics | null }) {
  const cats = data?.analysis.categories || [],
    total = data?.analysis.total_expense_cents || 0;
  return (
    <div className="category-bars">
      {cats.length ? (
        cats.map((c) => (
          <div className="category-row" key={c.category}>
            <div>
              <span>{c.category}</span>
              <strong className="tabular">{money(c.total_cents)}</strong>
            </div>
            <svg
              viewBox="0 0 300 4"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect width="300" height="4" className="bar-track" />
              <rect
                width={total ? (300 * c.total_cents) / total : 0}
                height="4"
                className="bar-fill"
              />
            </svg>
            <span className="category-meta">
              {c.count} 笔 ·{" "}
              {total ? Math.round((100 * c.total_cents) / total) : 0}%
            </span>
          </div>
        ))
      ) : (
        <p className="text-muted">暂无支出分类</p>
      )}
    </div>
  );
}
