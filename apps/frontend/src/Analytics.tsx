import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Search, Download } from "lucide-react";
import { Button, SectionHead, Empty } from "./components";
import { SpendingChart, CategoryBars } from "./charts";
import { money, time } from "./api";
import { Skeleton } from "./controls";
import type { Analytics as Data, Period } from "./types";
export function AnalyticsPage({
  data,
  period,
  setPeriod,
  loading = false,
}: {
  data: Data | null;
  period: Period;
  setPeriod: (p: Period) => void;
  loading?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("date"),
    [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      [...(data?.transactions || [])]
        .filter((t) =>
          `${t.merchant} ${t.category} ${t.description}`.includes(search),
        )
        .sort((a, b) =>
          sort === "amount"
            ? Math.abs(b.amount_cents) - Math.abs(a.amount_cents)
            : b.occurred_at.localeCompare(a.occurred_at),
        ),
    [data, search, sort],
  );
  function download() {
    const quote = (s: unknown) => {
      const value =
        typeof s === "string" && /^\s*[=+@-]/.test(s)
          ? "'" + s
          : String(s ?? "");
      return `"${value.replaceAll('"', '""')}"`;
    };
    const csv =
      "\ufeff" +
      [
        ["日期", "商户", "分类", "金额（元）", "备注"],
        ...rows.map((t) => [
          t.occurred_at,
          t.merchant,
          t.category,
          t.amount_cents / 100,
          t.description,
        ]),
      ]
        .map((r) => r.map(quote).join(","))
        .join("\r\n");
    const u = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = `tracebank-${period}.csv`;
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>交易分析</h1>
          <p>从已入账流水理解资金去向。</p>
        </div>
        <div className="button-row">
          <select
            aria-label="交易期间"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as Period);
              setPage(0);
            }}
          >
            <option value="month">本月</option>
            <option value="last_month">上月</option>
            <option value="year">今年</option>
          </select>
          <Button onClick={download} disabled={loading || !data}>
            <Download size={15} />
            导出流水
          </Button>
        </div>
      </div>
      <div className="metrics-band three">
        <div>
          <span>期间支出</span>
          {loading ? (
            <Skeleton metric />
          ) : (
            <strong>
              {data ? money(data.analysis.total_expense_cents) : "—"}
            </strong>
          )}
          <small>已入账支出合计</small>
        </div>
        <div>
          <span>期间收入</span>
          {loading ? (
            <Skeleton metric />
          ) : (
            <strong>{data ? money(data.analysis.income_cents) : "—"}</strong>
          )}
          <small>已入账收入合计</small>
        </div>
        <div>
          <span>交易笔数</span>
          <strong>
            {loading ? (
              <Skeleton metric />
            ) : (
              (data?.analysis.transaction_count ?? "—")
            )}
            <em> 笔</em>
          </strong>
          <small>收入与支出均计入</small>
        </div>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <SectionHead title="支出走势" description="累计支出 · 人民币" />
          {loading ? (
            <div className="loading-panel">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          ) : (
            <SpendingChart data={data} />
          )}
        </section>
        <section className="panel">
          <SectionHead title="支出构成" description="按交易分类汇总" />
          {loading ? (
            <div className="loading-panel">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          ) : (
            <CategoryBars data={data} />
          )}
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
                <input
                  aria-label="搜索交易"
                  placeholder="搜索商户、分类"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <select
                aria-label="交易排序"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(0);
                }}
              >
                <option value="date">最新交易</option>
                <option value="amount">金额从高到低</option>
              </select>
            </div>
          }
        />
        {loading ? (
          <div className="loading-panel">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        ) : rows.length ? (
          <>
            <p className="table-scroll-hint">
              左右滑动查看完整金额、时间与状态。
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>交易对象 / 备注</th>
                    <th>分类</th>
                    <th>交易时间</th>
                    <th className="align-right">金额</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 8, page * 8 + 8).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="merchant">
                          <span
                            className={`transaction-icon ${t.amount_cents > 0 ? "income" : ""}`}
                          >
                            {t.amount_cents > 0 ? (
                              <ArrowDownLeft size={16} />
                            ) : (
                              <ArrowUpRight size={16} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {t.merchant || t.description || "账户交易"}
                            </strong>
                            <span className="row-sub">
                              {t.description || t.id}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{t.category}</td>
                      <td className="date-cell">{time(t.occurred_at, true)}</td>
                      <td
                        className={`align-right tabular ${t.amount_cents > 0 ? "income-text" : ""}`}
                      >
                        {t.amount_cents > 0 ? "+" : ""}
                        {money(t.amount_cents)}
                      </td>
                      <td>
                        <span className="settled-dot" />
                        已入账
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                第 {page + 1} / {Math.ceil(rows.length / 8)} 页
              </span>
              <div className="button-row">
                <Button disabled={!page} onClick={() => setPage(page - 1)}>
                  上一页
                </Button>
                <Button
                  disabled={(page + 1) * 8 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="没有匹配的交易">试试其他期间或搜索条件。</Empty>
        )}
      </section>
    </>
  );
}
