import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  MessageSquareText,
  Search,
} from "lucide-react";
import { Button, SectionHead, Empty } from "./components";
import { money, time } from "./api";
import { Skeleton } from "./controls";
import { ViewTabs } from "./controls";
import type { Analytics as Data, Period } from "./types";
import {
  AnomalyScatter,
  CashFlowSankey,
  colorFor,
  Donut,
  MonthlyBars,
  SpendCalendar,
} from "./viz";

const ruleNames: Record<string, string> = {
  robust_z: "远高于平时",
  overseas: "境外商户",
  night: "凌晨消费",
  new_merchant: "首次出现",
  duplicate: "疑似重复扣款",
  large_single: "单笔较大",
};
const periodName: Record<Period, string> = { month: "本月", last_month: "上月", year: "今年" };

export function AnalyticsPage({
  data,
  period,
  setPeriod,
  loading = false,
  onAsk,
}: {
  data: Data | null;
  period: Period;
  setPeriod: (p: Period) => void;
  loading?: boolean;
  onAsk: (prompt: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("date"),
    [page, setPage] = useState(0),
    [cat, setCat] = useState<string | null>(null),
    [picked, setPicked] = useState<string | null>(null);
  const a = data?.analysis;
  const rows = useMemo(
    () =>
      [...(data?.transactions || [])]
        .filter((t) => `${t.merchant} ${t.category} ${t.description}`.includes(search))
        .sort((x, y) =>
          sort === "amount"
            ? Math.abs(y.amount_cents) - Math.abs(x.amount_cents)
            : y.occurred_at.localeCompare(x.occurred_at),
        ),
    [data, search, sort],
  );
  const flaggedDays = (a?.anomalies || [])
    .map((x) => x.occurred_at && new Date(Date.parse(x.occurred_at) + 8 * 3600e3).toISOString().slice(0, 10))
    .filter(Boolean) as string[];
  const diff = a?.previous_expense_cents ? a.total_expense_cents - a.previous_expense_cents : null;
  const focus = cat ? a?.categories.find((c) => c.category === cat) : null;
  function download() {
    const quote = (s: unknown) => {
      const value = typeof s === "string" && /^\s*[=+@-]/.test(s) ? "'" + s : String(s ?? "");
      return `"${value.replaceAll('"', '""')}"`;
    };
    const csv =
      "\ufeff" +
      [
        ["日期", "商户", "分类", "金额（元）", "备注"],
        ...rows.map((t) => [t.occurred_at, t.merchant, t.category, t.amount_cents / 100, t.description]),
      ]
        .map((r) => r.map(quote).join(","))
        .join("\r\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = u;
    link.download = `tracebank-${period}.csv`;
    link.click();
    URL.revokeObjectURL(u);
  }
  const block = (
    <div className="loading-panel">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>账单报告</h1>
          <p>
            {a?.period_start ? `${a.period_start.replaceAll("-", ".")} – ${a.period_end?.replaceAll("-", ".")}` : "收支、构成和需要核对的交易"}
          </p>
        </div>
        <div className="button-row">
          <ViewTabs
            label="账单期间"
            value={period}
            onChange={(v) => {
              setPeriod(v as Period);
              setPage(0);
              setPicked(null);
            }}
            items={[
              { id: "month", label: "本月" },
              { id: "last_month", label: "上月" },
              { id: "year", label: "今年" },
            ]}
          />
          <Button onClick={() => onAsk(`分析${periodName[period]}账单，看看有哪些异常消费`)}>
            <MessageSquareText size={15} />
            让 Agent 解读
          </Button>
          <Button onClick={download} disabled={loading || !data}>
            <Download size={15} />
            导出
          </Button>
        </div>
      </div>
      <div className="metrics-band">
        <div>
          <span>{periodName[period]}支出</span>
          {loading ? <Skeleton metric /> : <strong>{a ? money(a.total_expense_cents) : "—"}</strong>}
          <small>
            {a?.consumption_cents != null ? `其中消费 ${money(a.consumption_cents)}，其余为转出` : "已入账支出"}
          </small>
        </div>
        <div>
          <span>收入</span>
          {loading ? <Skeleton metric /> : <strong>{a ? money(a.income_cents) : "—"}</strong>}
          <small>{a?.transaction_count ?? 0} 笔交易</small>
        </div>
        <div>
          <span>储蓄率</span>
          {loading ? (
            <Skeleton metric />
          ) : (
            <strong className={(a?.savings_rate_bp ?? 0) < 0 ? "negative" : ""}>
              {a?.savings_rate_bp == null ? "—" : `${(a.savings_rate_bp / 100).toFixed(1)}%`}
            </strong>
          )}
          <small>（收入 − 支出）÷ 收入</small>
        </div>
        <div>
          <span>{period === "year" ? "需要核对" : "较上期"}</span>
          {loading ? (
            <Skeleton metric />
          ) : period === "year" ? (
            <strong>{a?.anomalies.length ?? 0}<em> 笔</em></strong>
          ) : (
            <strong className={diff != null && diff > 0 ? "negative" : "positive"}>
              {diff == null ? "—" : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}
            </strong>
          )}
          <small>{period === "year" ? "规则提示，不等于欺诈" : "支出变化，含转出"}</small>
        </div>
      </div>
      <div className="report-grid">
        <section className="panel span-2">
          <SectionHead title="钱从哪来，到哪去" description="收入流向各类支出，剩下的是结余" />
          <div className="panel-body">
            {loading || !a ? block : a.income_cents || a.total_expense_cents ? (
              <CashFlowSankey income={a.income_cents} categories={a.categories} />
            ) : (
              <Empty title="这段时间没有收支" />
            )}
          </div>
        </section>
        <section className="panel">
          <SectionHead title="支出构成" description={period === "year" ? "按金额排序" : "箭头是和上一期相比"} />
          <div className="panel-body composition">
            {loading || !a ? block : (
              <>
                <Donut
                  items={a.categories.map((c) => ({ key: c.category, value: c.total_cents, color: colorFor(c.category) }))}
                  selected={cat}
                  onSelect={setCat}
                  size={190}
                  label={focus ? (
                    <><span>{focus.category}</span><strong>{money(focus.total_cents)}</strong><small>{focus.count} 笔</small></>
                  ) : (
                    <><span>合计</span><strong>{money(a.total_expense_cents)}</strong></>
                  )}
                />
                <ul className="legend-list">
                  {a.categories.map((c) => {
                    const change = c.previous_cents ? c.total_cents - c.previous_cents : null;
                    return (
                      <li key={c.category} className={cat === c.category ? "is-active" : ""}
                          onMouseEnter={() => setCat(c.category)} onMouseLeave={() => setCat(null)}>
                        <i style={{ background: colorFor(c.category) }} />
                        <span>{c.category}</span>
                        <b>{money(c.total_cents)}</b>
                        {period !== "year" && change != null && Math.abs(change) >= 1000 && (
                          <em className={change > 0 ? "negative" : "positive"}>{change > 0 ? "↑" : "↓"}{Math.round(Math.abs(change) / 100)}</em>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <SectionHead title={period === "year" ? "每月收支" : "近六个月"} description="悬停查看当月结余" />
          <div className="panel-body">
            {loading || !a ? block : <MonthlyBars months={a.monthly || []} highlight={a.period_start?.slice(0, 7)} />}
          </div>
        </section>
        <section className="panel span-2 anomaly-panel">
          <SectionHead
            title="需要核对的交易"
            description="纵轴为对数金额。圆圈越大越值得看，点开可看触发的规则"
            action={a?.anomalies.length ? <span className="tag tag-warning"><AlertTriangle size={12} /> {a.anomalies.length} 笔</span> : undefined}
          />
          <div className="panel-body anomaly-layout">
            {loading || !a ? block : (
              <>
                <AnomalyScatter
                  rows={data!.transactions}
                  flagged={a.anomalies}
                  start={a.period_start || ""}
                  end={a.period_end || ""}
                  picked={picked}
                  onPick={setPicked}
                />
                <ul className="anomaly-detail">
                  {a.anomalies.length ? a.anomalies.map((x) => (
                    <li key={x.transaction_id} className={picked === x.transaction_id ? "is-picked" : ""}>
                      <button type="button" onClick={() => setPicked(x.transaction_id)}>
                        <div>
                          <strong>{x.merchant}</strong>
                          <span>{x.occurred_at && time(x.occurred_at, true)} · {x.category}</span>
                        </div>
                        <b>{money(x.amount_cents)}</b>
                      </button>
                      <ul className="rule-list">
                        {(x.rules || []).map((r) => (
                          <li key={r.code}><span className="rule-name">{ruleNames[r.code] || r.code}</span>{r.reason}</li>
                        ))}
                      </ul>
                    </li>
                  )) : <p className="text-muted">这段时间没有触发规则的交易。不代表每笔都已核实。</p>}
                </ul>
              </>
            )}
          </div>
          <p className="method-note">检测方法：与过去半年同类支出比较的修正 z 分数（中位数绝对偏差，阈值 3.5），加上境外商户、凌晨大额、首次出现的大额商户、10 分钟内同商户同金额等规则。</p>
        </section>
        {period !== "year" && a?.daily && a.period_start && (
          <section className="panel">
            <SectionHead title="每天花了多少" description="颜色越深花得越多" />
            <div className="panel-body">
              <SpendCalendar start={a.period_start} end={a.period_end!} days={a.daily} marks={flaggedDays} />
            </div>
          </section>
        )}
        <section className="panel">
          <SectionHead title="钱主要花在哪几家" description="不含转账与理财" />
          <div className="panel-body">
            {loading || !a ? block : (
              <ol className="merchant-rank">
                {(a.top_merchants || []).map((m, i) => (
                  <li key={m.merchant}>
                    <span className="rank">{i + 1}</span>
                    <div>
                      <strong>{m.merchant}</strong>
                      <span>{m.count} 笔</span>
                    </div>
                    <div className="rank-bar"><i style={{ width: `${(100 * m.total_cents) / (a.top_merchants![0].total_cents || 1)}%` }} /></div>
                    <b>{money(m.total_cents)}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <SectionHead
          title="交易流水"
          description={`${rows.length} 笔记录`}
          action={
            <div className="table-tools">
              <label className="search-input">
                <Search size={15} />
                <input aria-label="搜索交易" placeholder="搜索商户、分类" value={search}
                       onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              </label>
              <select aria-label="交易排序" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }}>
                <option value="date">最新交易</option>
                <option value="amount">金额从高到低</option>
              </select>
            </div>
          }
        />
        {loading ? block : rows.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>交易对象</th><th>分类</th><th>交易时间</th><th className="align-right">金额</th><th>状态</th></tr>
                </thead>
                <tbody>
                  {rows.slice(page * 10, page * 10 + 10).map((t) => {
                    const flagged = a?.anomalies.some((x) => x.transaction_id === t.id);
                    return (
                      <tr key={t.id} className={flagged ? "is-flagged" : ""}>
                        <td>
                          <div className="merchant">
                            <span className={`transaction-icon ${t.amount_cents > 0 ? "income" : ""}`}>
                              {t.amount_cents > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                            </span>
                            <div>
                              <strong>{t.merchant || "账户交易"}</strong>
                              <span className="row-sub">{t.description}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className="cat-dot" style={{ background: colorFor(t.category) }} />{t.category}</td>
                        <td className="date-cell">{time(t.occurred_at, true)}</td>
                        <td className={`align-right tabular ${t.amount_cents > 0 ? "income-text" : ""}`}>
                          {t.amount_cents > 0 ? "+" : ""}{money(t.amount_cents)}
                        </td>
                        <td>{flagged ? <span className="tag tag-warning">待核对</span> : <><span className="settled-dot" />已入账</>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>第 {page + 1} / {Math.ceil(rows.length / 10)} 页</span>
              <div className="button-row">
                <Button disabled={!page} onClick={() => setPage(page - 1)}>上一页</Button>
                <Button disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage(page + 1)}>下一页</Button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="没有匹配的交易">换个期间或搜索词试试。</Empty>
        )}
      </section>
    </>
  );
}
