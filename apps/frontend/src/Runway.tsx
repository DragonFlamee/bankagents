import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "./api";
import type { ScheduleData } from "./types";

/** One dated cash movement. amount < 0 leaves the spendable balance. */
export interface FlowEvent {
  date: string;
  label: string;
  amount: number;
  kind: "income" | "rent" | "transfer" | "order" | "subscription" | "recurring" | "release" | "birthday";
  certain: boolean;
  fromHold?: boolean;
  note?: string;
}

const DAY = 86400e3;
const iso = (t: number) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(d + "T00:00:00+08:00");
const weekday = ["日", "一", "二", "三", "四", "五", "六"];
const kindColor: Record<FlowEvent["kind"], string> = {
  income: "#23704f",
  release: "#b98a2e",
  rent: "#33486b",
  transfer: "#635bff",
  order: "#c0627f",
  subscription: "#2c8a98",
  recurring: "#7c8fa1",
  birthday: "#c0627f",
};
const compact = (c: number) => {
  const y = Math.abs(c) / 100;
  return y >= 10000 ? `${(y / 10000).toFixed(y % 10000 ? 1 : 0)}万` : y >= 1000 ? `${(y / 1000).toFixed(1)}千` : `${Math.round(y)}`;
};

/** Turn the planner payload into dated flows: confirmed schedules plus monthly patterns from history. */
export function flowsFrom(data: ScheduleData, days: number): FlowEvent[] {
  const today = at(data.today);
  const end = today + days * DAY;
  const names = Object.fromEntries(data.contacts.map((c) => [c.id, c.name]));
  const out: FlowEvent[] = [];
  for (const f of data.recurring_flows || []) {
    for (let t = at(f.next_expected), n = 0; t <= end && n < 4; n++) {
      if (t >= today)
        out.push({
          date: iso(t),
          label: f.merchant,
          amount: f.inflow ? f.last_amount_cents : -f.last_amount_cents,
          kind: f.inflow ? "income" : f.category === "居住" ? "rent" : f.category === "订阅" ? "subscription" : f.category === "转账" ? "transfer" : "recurring",
          certain: false,
          note: "按过去的规律预计",
        });
      const d = new Date(t + 8 * 3600e3);
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) - 8 * 3600e3;
    }
  }
  for (const s of data.schedules) {
    if (s.status !== "scheduled") continue;
    const repeats = s.repeat === "monthly" ? 3 : 1;
    for (let n = 0, t = at(s.execute_date); n < repeats && t <= end; n++) {
      out.push(
        s.kind === "transfer"
          ? { date: iso(t), label: `转给${names[s.params.contact_id] || "联系人"}`, amount: -s.params.amount_cents, kind: "transfer", certain: true, note: s.repeat === "monthly" ? "每月预约" : "预约转账" }
          : { date: iso(t), label: s.item?.name || "预约订购", amount: -(s.item?.price_cents || 0), kind: "order", certain: true, fromHold: !!s.params.hold_id, note: s.params.hold_id ? "从锁定资金付款" : s.item?.merchant },
      );
      const d = new Date(t + 8 * 3600e3);
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) - 8 * 3600e3;
    }
  }
  for (const h of data.holds)
    if (h.status === "active")
      out.push({ date: h.release_date, label: `${h.name}释放`, amount: h.amount_cents - h.used_cents, kind: "release", certain: true, note: "锁定资金回到可用余额" });
  for (const e of data.events) out.push({ date: e.date, label: `${e.name}生日`, amount: 0, kind: "birthday", certain: true, note: e.relation });
  return out.filter((e) => at(e.date) >= today && at(e.date) <= end).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Cash runway: projected spendable balance per day, with locked funds stacked on top
 * and every movement pinned to the day it lands. Answers "how much can I spend on day X".
 */
export function CashRunway({ data, days = 60, height = 380 }: { data: ScheduleData; days?: number; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(1120);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(520, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const model = useMemo(() => {
    const events = flowsFrom(data, days);
    const t0 = at(data.today);
    let avail = data.available_cents;
    let held = data.holds.filter((h) => h.status === "active").reduce((s, h) => s + h.amount_cents - h.used_cents, 0);
    const series: { day: string; avail: number; held: number; events: FlowEvent[] }[] = [];
    for (let i = 0; i <= days; i++) {
      const day = iso(t0 + i * DAY);
      const todays = events.filter((e) => e.date === day);
      for (const e of todays) {
        if (e.kind === "release") {
          avail += Math.min(e.amount, held);
          held = Math.max(0, held - e.amount);
        } else if (e.fromHold) held = Math.max(0, held + e.amount);
        else avail += e.amount;
      }
      series.push({ day, avail, held, events: todays });
    }
    const low = series.reduce((m, p, i) => (p.avail < series[m].avail ? i : m), 0);
    return { events, series, low };
  }, [data, days]);
  const { series, low } = model;
  const W = width,
    padL = 56,
    padR = 24,
    laneTop = 34,
    rowH = 40;
  const xs = (i: number) => padL + (i / days) * (W - padL - padR);
  // Pins: group by day, then place each label in the first of three rows where it fits.
  const pins = series
    .map((p, i) => ({ i, p }))
    .filter(({ p }) => p.events.length)
    .map(({ i, p }) => {
      const net = p.events.reduce((s, e) => s + e.amount, 0);
      const lead = [...p.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
      const label = lead.label + (p.events.length > 1 ? ` 等${p.events.length}项` : "");
      return { i, p, net, lead, label, w: 26 + label.length * 12.5 };
    });
  const rowEnd = [-1e9, -1e9, -1e9, -1e9, -1e9];
  const placed = pins.map((pin) => {
    const px = xs(pin.i);
    let row = rowEnd.findIndex((end) => px > end + 8);
    if (row < 0) row = rowEnd.indexOf(Math.min(...rowEnd));
    rowEnd[row] = px + pin.w;
    return { ...pin, row };
  });
  const rows = Math.max(1, ...placed.map((p) => p.row + 1));
  const H = height + (rows - 2) * rowH,
    plotTop = laneTop + rows * rowH + 24,
    plotBottom = H - 34;
  const max = Math.max(1, ...series.map((p) => p.avail + p.held)) * 1.08;
  const min = Math.min(0, ...series.map((p) => p.avail));
  const x = xs;
  const y = (v: number) => plotBottom - ((v - min) / (max - min)) * (plotBottom - plotTop);
  // Step geometry: a balance holds flat through the day and jumps at the next one.
  const stepPts = (vals: number[]) => {
    const pts: [number, number][] = [];
    vals.forEach((v, i) => {
      if (i) pts.push([x(i), y(vals[i - 1])]);
      pts.push([x(i), y(v)]);
    });
    return pts;
  };
  const toPath = (pts: [number, number][]) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const availPts = stepPts(series.map((p) => p.avail));
  const totalPts = stepPts(series.map((p) => p.avail + p.held));
  const availLine = toPath(availPts);
  const base = y(Math.max(min, 0));
  const availArea = `${availLine} L${x(days)},${base} L${x(0)},${base} Z`;
  const heldArea = `${toPath(totalPts)} ${[...availPts].reverse().map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(" ")} Z`;
  const months: { i: number; label: string }[] = [];
  series.forEach((p, i) => {
    if (i === 0 || p.day.endsWith("-01")) months.push({ i, label: `${Number(p.day.slice(5, 7))}月` });
  });
  const ticks = [0, 0.5, 1].map((f) => min + (max / 1.08 - min) * f);
  const h = hover == null ? null : series[hover];
  const lowP = series[low];
  const end = series[days];
  return (
    <div className="runway" ref={box}>
      <div className="runway-summary">
        <div>
          <span>今天可用</span>
          <strong>{money(series[0].avail)}</strong>
        </div>
        <div className={lowP.avail < 100000 ? "is-warn" : ""}>
          <span>{days} 天内最低</span>
          <strong>{money(lowP.avail)}</strong>
          <small>{Number(lowP.day.slice(5, 7))}月{Number(lowP.day.slice(8))}日</small>
        </div>
        <div>
          <span>{days} 天后预计</span>
          <strong>{money(end.avail)}</strong>
          <small className={end.avail >= series[0].avail ? "positive" : "negative"}>
            {end.avail >= series[0].avail ? "+" : "−"}
            {money(Math.abs(end.avail - series[0].avail))}
          </small>
        </div>
        {series[0].held > 0 && (
          <div>
            <span>锁定中</span>
            <strong className="held-text">{money(series[0].held)}</strong>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`未来 ${days} 天可用余额预测，最低 ${money(lowP.avail)}，出现在 ${lowP.day}`}
           onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="held-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#fbf3df" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#d9b468" strokeWidth="2" />
          </pattern>
        </defs>
        {series.map((p, i) => {
          const dow = new Date(at(p.day) + 8 * 3600e3).getUTCDay();
          return (dow === 0 || dow === 6) && i < days ? (
            <rect key={p.day} x={x(i)} y={plotTop - 8} width={x(1) - x(0)} height={plotBottom - plotTop + 8} className="runway-weekend" />
          ) : null;
        })}
        {months.map((m) => (
          <g key={m.label + m.i}>
            {m.i > 0 && <line x1={x(m.i)} x2={x(m.i)} y1={laneTop - 18} y2={plotBottom} className="runway-month-rule" />}
            <text x={x(m.i) + 6} y={laneTop - 6} className="runway-month">{m.label}</text>
          </g>
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={padL - 10} y={y(v) + 4} textAnchor="end" className="chart-label">{compact(v)}</text>
          </g>
        ))}
        {min < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="runway-zero" />}
        <path d={heldArea} fill="url(#held-hatch)" />
        <path d={availArea} className="runway-area" />
        <path d={availLine} className="runway-line" />
        {placed.map(({ i, row, net, lead }) => {
          const py = laneTop + 22 + row * rowH;
          const cy = y(series[i].avail + (lead.fromHold || lead.kind === "release" ? series[i].held : 0));
          return <line key={"c" + i} x1={x(i)} x2={x(i)} y1={py + 8} y2={cy} className={`runway-stem ${net > 0 ? "is-in" : ""}`} />;
        })}
        {placed.map(({ i, row, net, lead, label }) => {
          const px = x(i),
            py = laneTop + 22 + row * rowH;
          const big = Math.abs(net) >= 100000;
          return (
            <g key={"p" + i} className={`runway-pin ${hover === i ? "is-active" : ""}`}>
              <circle cx={px} cy={py} r={big ? 7 : 5} fill={lead.certain ? kindColor[lead.kind] : "#fff"} stroke={kindColor[lead.kind]} strokeWidth={lead.certain ? 0 : 2} />
              <text x={px + 12} y={py - 2} className="runway-pin-label">{label}</text>
              {net !== 0 && (
                <text x={px + 12} y={py + 13} className={`runway-pin-amount ${net > 0 ? "is-in" : ""} ${big ? "is-big" : ""}`}>
                  {net > 0 ? "+" : "−"}{compact(net)}
                </text>
              )}
            </g>
          );
        })}
        <g className="runway-low">
          <circle cx={x(low)} cy={y(lowP.avail)} r="5" />
          <text x={x(low)} y={y(lowP.avail) + 20} textAnchor={low > days * 0.85 ? "end" : "middle"}>最低点</text>
        </g>
        <line x1={x(0)} x2={x(0)} y1={laneTop - 18} y2={plotBottom} className="runway-today" />
        {series.map((p, i) =>
          i % 7 === 0 ? (
            <text key={"d" + i} x={x(i)} y={H - 12} textAnchor={i === 0 ? "start" : "middle"} className={`chart-label ${i === 0 ? "is-current" : ""}`}>
              {i === 0 ? "今天" : `${Number(p.day.slice(5, 7))}/${Number(p.day.slice(8))}`}
            </text>
          ) : (
            <line key={"t" + i} x1={x(i)} x2={x(i)} y1={plotBottom} y2={plotBottom + 4} className="chart-axis" />
          ),
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={plotTop - 8} y2={plotBottom} className="chart-crosshair" />}
        {hover != null && <circle cx={x(hover)} cy={y(series[hover].avail)} r="4.5" className="runway-hover-dot" />}
        {series.map((_, i) => (
          <rect key={"h" + i} x={x(i) - (x(1) - x(0)) / 2} y={laneTop - 18} width={x(1) - x(0)} height={plotBottom - laneTop + 22} fill="transparent"
                onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && hover != null && (
        <div className="runway-tip" style={{ top: plotTop + 70, left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > days * 0.7 ? "-100%" : hover < days * 0.15 ? "0" : "-50%"})` }}>
          <strong>
            {Number(h.day.slice(5, 7))}月{Number(h.day.slice(8))}日 周{weekday[new Date(at(h.day) + 8 * 3600e3).getUTCDay()]}
          </strong>
          <div className="tip-row"><span>可用</span><b>{money(h.avail)}</b></div>
          {h.held > 0 && <div className="tip-row"><span>锁定</span><b className="held-text">{money(h.held)}</b></div>}
          {h.events.map((e, n) => (
            <div className="tip-event" key={n}>
              <i style={{ background: e.certain ? kindColor[e.kind] : "transparent", borderColor: kindColor[e.kind] }} />
              <span>{e.label}<small>{e.certain ? e.note : "预计 · 按过去的规律"}</small></span>
              {e.amount !== 0 && <b className={e.amount > 0 ? "positive" : ""}>{e.amount > 0 ? "+" : "−"}{money(Math.abs(e.amount)).replace("¥", "")}</b>}
            </div>
          ))}
        </div>
      )}
      <div className="runway-legend">
        <span><i className="lg-line" />可用余额</span>
        <span><i className="lg-held" />锁定资金</span>
        <span><i className="lg-dot" />已确认</span>
        <span><i className="lg-ring" />按规律预计</span>
        <span><i className="lg-week" />周末</span>
      </div>
    </div>
  );
}

/** Upcoming charges as a 35-day ruler; bar height follows amount on a log scale. */
export function ChargeRuler({
  today,
  items,
  days = 35,
}: {
  today: string;
  items: { date: string; label: string; amount: number; note?: string; color?: string }[];
  days?: number;
}) {
  const t0 = at(today);
  const cells = Array.from({ length: days }, (_, i) => iso(t0 + i * DAY));
  const max = Math.max(1, ...items.map((i) => i.amount));
  const hgt = (v: number) => 24 + (Math.log10(1 + v / 100) / Math.log10(1 + max / 100)) * 96;
  const total = items.reduce((s, i) => s + i.amount, 0);
  // Neighbouring tags step upward so labels within four days never overlap.
  const lift = new Map<string, number>();
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((it, n) => {
    const near = sorted.slice(0, n).filter((o) => (at(it.date) - at(o.date)) / DAY < 4);
    lift.set(it.label + it.date, near.length ? Math.max(...near.map((o) => lift.get(o.label + o.date)!)) + 1 : 0);
  });
  const maxLift = Math.max(0, ...lift.values());
  return (
    <div className="charge-ruler">
      <div className="ruler-total">
        <span>未来 {days} 天要扣</span>
        <strong>{money(total)}</strong>
        <small>{items.length} 笔</small>
      </div>
      <div className="ruler-scroll" style={{ paddingTop: 40 + maxLift * 36 }}>
        <div className="ruler" style={{ gridTemplateColumns: `repeat(${days}, minmax(22px, 1fr))` }}>
          {cells.map((d, i) => {
            const hits = items.filter((it) => it.date === d);
            const dow = new Date(at(d) + 8 * 3600e3).getUTCDay();
            return (
              <div key={d} className={`ruler-day ${dow === 0 || dow === 6 ? "is-weekend" : ""} ${d.endsWith("-01") ? "is-month" : ""}`}>
                <div className="ruler-bars">
                  {hits.map((h) => (
                    <div key={h.label} className="ruler-bar" style={{ height: hgt(h.amount), ["--c" as string]: h.color || "#2c8a98" }}>
                      <span className="ruler-tag" style={{ ["--lead" as string]: `${124 - hgt(h.amount) + lift.get(h.label + h.date)! * 36}px` }}>
                        <b>{h.label}</b>
                        {money(h.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="ruler-date">{i === 0 ? "今" : d.endsWith("-01") ? `${Number(d.slice(5, 7))}月` : Number(d.slice(8))}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
