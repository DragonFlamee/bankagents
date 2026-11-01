import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Cake,
  Flower2,
  Gift,
  Lock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { money, statuses } from "./api";
import { BankCardFace } from "./BankCardFace";
import { items as catalogItems } from "./catalog";
import { CashRunway } from "./Runway";
import { Questionnaire } from "./Questionnaire";
import type {
  Overview,
  Plan,
  PlanNode,
  Product,
  Recurring,
  RiskProfile,
  Holding,
  LifeEvent,
} from "./types";
import {
  colorFor,
  Donut,
  Gauge,
  investorName,
  riskColor,
  RiskLadder,
  shortDate,
} from "./viz";

export const go = (view: string) =>
  window.dispatchEvent(new CustomEvent("tracebank:navigate", { detail: view }));
export const refreshAll = () =>
  window.dispatchEvent(new Event("tracebank:refresh"));

const ruleNames: Record<string, string> = {
  robust_z: "远高于平时",
  overseas: "境外商户",
  night: "凌晨消费",
  new_merchant: "首次出现",
  duplicate: "疑似重复扣款",
  large_single: "单笔较大",
};

function Frame({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; view: string };
  children: React.ReactNode;
}) {
  return (
    <section className="result-visual">
      <header>
        <h3>{title}</h3>
        {action && (
          <button
            type="button"
            className="text-button"
            onClick={() => go(action.view)}
          >
            {action.label}
            <ArrowUpRight size={13} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function BillsVisual({ r }: { r: Record<string, any> }) {
  const [sel, setSel] = useState<string | null>(null);
  const cats = (r.categories || []) as {
    category: string;
    total_cents: number;
    previous_cents?: number;
  }[];
  const total = r.total_expense_cents || 0;
  const diff = r.previous_expense_cents
    ? total - r.previous_expense_cents
    : null;
  const period =
    { month: "本月", last_month: "上月", year: "今年" }[r.period as string] ||
    "本期";
  const focus = sel ? cats.find((c) => c.category === sel) : null;
  return (
    <Frame
      title={`${period}账单`}
      action={{ label: "完整报告", view: "analytics" }}
    >
      <div className="kpi-row">
        <div>
          <span>支出</span>
          <strong>{money(total)}</strong>
        </div>
        <div>
          <span>收入</span>
          <strong>{money(r.income_cents || 0)}</strong>
        </div>
        <div>
          <span>储蓄率</span>
          <strong className={r.savings_rate_bp < 0 ? "negative" : ""}>
            {r.savings_rate_bp == null
              ? "—"
              : `${(r.savings_rate_bp / 100).toFixed(1)}%`}
          </strong>
        </div>
        {diff != null && r.period !== "year" && (
          <div>
            <span>较上期</span>
            <strong className={diff > 0 ? "negative" : "positive"}>
              {diff > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{" "}
              {money(Math.abs(diff))}
            </strong>
          </div>
        )}
      </div>
      <div className="bills-split">
        <Donut
          items={cats.map((c) => ({
            key: c.category,
            value: c.total_cents,
            color: colorFor(c.category),
          }))}
          selected={sel}
          onSelect={setSel}
          label={
            focus ? (
              <>
                <span>{focus.category}</span>
                <strong>{money(focus.total_cents)}</strong>
                <small>
                  {Math.round((100 * focus.total_cents) / (total || 1))}%
                </small>
              </>
            ) : (
              <>
                <span>{cats.length} 类支出</span>
                <strong>{money(total)}</strong>
              </>
            )
          }
        />
        <ul className="legend-list">
          {cats.slice(0, 6).map((c) => {
            const change = c.previous_cents
              ? c.total_cents - c.previous_cents
              : null;
            return (
              <li
                key={c.category}
                onMouseEnter={() => setSel(c.category)}
                onMouseLeave={() => setSel(null)}
                className={sel === c.category ? "is-active" : ""}
              >
                <i style={{ background: colorFor(c.category) }} />
                <span>{c.category}</span>
                <b>{money(c.total_cents)}</b>
                {change != null &&
                  r.period !== "year" &&
                  Math.abs(change) >= 1000 && (
                    <em className={change > 0 ? "negative" : "positive"}>
                      {change > 0 ? "↑" : "↓"}
                      {money(Math.abs(change)).replace("¥", "")}
                    </em>
                  )}
              </li>
            );
          })}
        </ul>
      </div>
      {(r.anomalies || []).length > 0 && (
        <div className="anomaly-cards">
          <p className="visual-caption">
            <AlertTriangle size={14} /> {r.anomalies.length}{" "}
            笔需要你核对，规则提示不等于欺诈
          </p>
          {r.anomalies.slice(0, 3).map((a: any) => (
            <div className="anomaly-card" key={a.transaction_id}>
              <div>
                <strong>{a.merchant}</strong>
                <span>
                  {a.occurred_at
                    ? new Date(a.occurred_at).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
              </div>
              <b>{money(a.amount_cents)}</b>
              <div className="rule-chips">
                {(a.rules || []).map((rule: any) => (
                  <span key={rule.code} title={rule.reason}>
                    {ruleNames[rule.code] || rule.code}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

function RecurringVisual({ r }: { r: Record<string, any> }) {
  const found = (r.recurring || []) as Recurring[];
  if (!found.length)
    return (
      <Frame
        title="周期扣费识别"
        action={{ label: "查看签约代扣", view: "subscriptions" }}
      >
        <div className="service-result">
          <strong>
            {r.detection_status === "insufficient_history"
              ? "历史样本不足，暂不能估算月扣费"
              : "暂未识别到月度扣款规律"}
          </strong>
          <p>
            {r.coverage
              ? `检索范围为近 ${r.window_days} 天，实际有 ${r.coverage.transaction_count} 笔流水，消费扣款分布在 ${r.coverage.month_count} 个自然月。`
              : "当前记录未形成可确认的月度扣款规律。"}
            识别需要同一商户至少 3 次、间隔 26–35 天的扣款。
          </p>
          <p>
            没有识别结果不代表没有签约代扣。可先查询已有签约项目，授权后继续办理提醒或取消。
          </p>
        </div>
      </Frame>
    );
  return (
    <Frame
      title="从流水识别的周期扣费"
      action={{ label: "订阅管理", view: "subscriptions" }}
    >
      <div className="kpi-row">
        <div>
          <span>每月合计</span>
          <strong>{money(r.monthly_total_cents || 0)}</strong>
        </div>
        <div>
          <span>一年约</span>
          <strong>{money((r.monthly_total_cents || 0) * 12)}</strong>
        </div>
        <div>
          <span>识别依据</span>
          <strong className="small">
            {found.length} 项 · 近 {r.window_days} 天
          </strong>
        </div>
      </div>
      <ul className="recurring-list">
        {found.map((f) => (
          <li key={f.merchant}>
            <span
              className="recurring-mark"
              style={{ background: colorFor(f.category) }}
            >
              {f.merchant.slice(0, 1)}
            </span>
            <div>
              <strong>{f.merchant}</strong>
              <span>
                {shortDate(f.next_expected)} 扣款 · 还有 {f.days_until} 天
              </span>
            </div>
            <div className="recurring-tags">
              {f.price_change_cents > 0 && (
                <span className="tag tag-warning">
                  涨价 {money(f.price_change_cents)}
                </span>
              )}
              {!f.mandate && <span className="tag tag-danger">未签约代扣</span>}
              {f.mandate?.remind_days && (
                <span className="tag">提前 {f.mandate.remind_days} 天提醒</span>
              )}
            </div>
            <b>{money(f.last_amount_cents)}</b>
            <span
              className="countdown"
              style={{
                ["--p" as string]: `${Math.max(4, 100 - (f.days_until / f.cadence_days) * 100)}%`,
              }}
            />
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function ProfileVisual({ r }: { r: Record<string, any> }) {
  const [profile, setProfile] = useState<RiskProfile | null>(r.profile);
  const [open, setOpen] = useState(!r.profile);
  return (
    <Frame title="风险测评" action={{ label: "理财页面", view: "wealth" }}>
      <div className="profile-row">
        <Gauge
          value={profile && !profile.expired ? profile.level : 0}
          max={5}
          color={riskColor[profile?.level || 1]}
          label={profile ? `C${profile.level}` : "未测评"}
          sub={profile ? investorName[profile.level] : "需要本人作答"}
        />
        <div className="profile-copy">
          {profile ? (
            <>
              <p>
                {profile.score} 分，可以购买 <b>R{profile.level}</b>{" "}
                及以下的产品。
              </p>
              <p className="small-note">
                测评于 {shortDate(profile.assessed_at.slice(0, 10))}，有效期至{" "}
                {profile.expires_at.slice(0, 10)}
                {profile.expired && "（已过期）"}
              </p>
              {profile.notes.map((n) => (
                <p key={n} className="small-note">
                  {n}
                </p>
              ))}
            </>
          ) : (
            <p>还没有测评记录。8 道题，大约两分钟。</p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起问卷" : profile ? "重新测评" : "开始测评"}
          </button>
        </div>
      </div>
      {open && (
        <Questionnaire
          questions={r.questionnaire}
          initial={profile?.answers}
          onDone={(p) => {
            setProfile(p);
            setOpen(false);
            refreshAll();
          }}
        />
      )}
    </Frame>
  );
}

function ProductsVisual({ r }: { r: Record<string, any> }) {
  const products = (r.products || []) as Product[];
  const level = r.profile && !r.profile.expired ? r.profile.level : 0;
  return (
    <Frame
      title="理财产品对比"
      action={{ label: "看走势和测算", view: "wealth" }}
    >
      <RiskLadder level={level} products={products} />
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th>产品</th>
              <th>风险</th>
              <th>收益参考</th>
              <th>最大回撤</th>
              <th>流动性</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={p.suitable ? "" : "is-locked"}>
                <td>
                  <strong>{p.name}</strong>
                  <span>{p.type}</span>
                </td>
                <td>
                  <span
                    className="risk-pill"
                    style={{ ["--risk" as string]: riskColor[p.risk] }}
                  >
                    R{p.risk}
                  </span>
                </td>
                <td className="tabular">
                  <b className={p.yield_bp < 0 ? "negative" : ""}>
                    {p.benchmark_range || `${(p.yield_bp / 100).toFixed(2)}%`}
                  </b>
                  <span>{p.yield_label}</span>
                </td>
                <td className="tabular">
                  {p.max_drawdown_bp
                    ? `-${(p.max_drawdown_bp / 100).toFixed(2)}%`
                    : "0.00%"}
                </td>
                <td>
                  {p.liquidity_days === 0
                    ? "T+0"
                    : p.holding_days >= 90
                      ? `${p.holding_days} 天`
                      : `T+${p.liquidity_days}`}
                </td>
                <td>
                  {p.suitable ? (
                    <span className="ok-mark">可买</span>
                  ) : (
                    <span className="lock-mark">
                      <Lock size={11} />
                      超出等级
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="disclaimer">{r.disclaimer}</p>
    </Frame>
  );
}

function HoldingsVisual({ r }: { r: Record<string, any> }) {
  const holdings = (r.holdings || []) as Holding[];
  const max = Math.max(1, ...holdings.map((h) => h.value_cents));
  return (
    <Frame title="理财持仓" action={{ label: "理财页面", view: "wealth" }}>
      <div className="kpi-row">
        <div>
          <span>现值</span>
          <strong>{money(r.total_value_cents || 0)}</strong>
        </div>
        <div>
          <span>累计收益</span>
          <strong className="positive">
            +{money(r.total_income_cents || 0)}
          </strong>
        </div>
        <div>
          <span>昨日收益</span>
          <strong>
            +{money(holdings.reduce((s, h) => s + h.yesterday_income_cents, 0))}
          </strong>
        </div>
      </div>
      <ul className="holding-bars">
        {holdings.map((h) => (
          <li key={h.id}>
            <div>
              <strong>{h.product_name}</strong>
              <span>
                持有 {h.days_held} 天 ·{" "}
                {h.redeemable ? "可赎回" : `${h.days_to_redeemable} 天后可赎回`}
              </span>
            </div>
            <div className="holding-bar">
              <i
                style={{
                  width: `${(100 * h.principal_cents) / max}%`,
                  background: riskColor[h.risk],
                }}
              />
              <i
                className="income"
                style={{
                  width: `${Math.max(0.6, (100 * h.income_cents) / max)}%`,
                }}
              />
            </div>
            <b>
              {money(h.value_cents)}
              <em>+{money(h.income_cents)}</em>
            </b>
          </li>
        ))}
      </ul>
      <p className="disclaimer">{r.valuation}</p>
    </Frame>
  );
}

function EventsVisual({ r }: { r: Record<string, any> }) {
  const events = (r.events || []) as LifeEvent[];
  return (
    <Frame title="近期纪念日">
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.contact_id + e.date}>
            <span
              className="event-ring"
              style={{
                ["--p" as string]: `${Math.max(3, 100 - (e.days_until / 90) * 100)}%`,
              }}
            >
              <b>{e.days_until}</b>
              <small>天</small>
            </span>
            <div>
              <strong>{e.name}的生日</strong>
              <span>
                {e.relation} · {shortDate(e.date)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function BalanceVisual({ r }: { r: Record<string, any> }) {
  const acc = (r.accounts || [])[0];
  if (!acc) return null;
  const held = acc.held_cents || 0;
  const wealth = r.wealth_total_cents || 0;
  const total = acc.balance_cents + wealth;
  return (
    <Frame title="资金分布">
      <div
        className="balance-bar"
        role="img"
        aria-label={`可用 ${money(acc.balance_cents - held)}，锁定 ${money(held)}，理财 ${money(wealth)}`}
      >
        <i style={{ flex: acc.balance_cents - held, background: "#635bff" }} />
        {held > 0 && <i style={{ flex: held, background: "#b7832a" }} />}
        {wealth > 0 && <i style={{ flex: wealth, background: "#2c8a98" }} />}
      </div>
      <ul className="balance-legend">
        <li>
          <i style={{ background: "#635bff" }} />
          活期可用<b>{money(acc.balance_cents - held)}</b>
        </li>
        {held > 0 && (
          <li>
            <i style={{ background: "#b7832a" }} />
            已锁定<b>{money(held)}</b>
          </li>
        )}
        {wealth > 0 && (
          <li>
            <i style={{ background: "#2c8a98" }} />
            理财<b>{money(wealth)}</b>
          </li>
        )}
        <li className="total">
          总资产<b>{money(total)}</b>
        </li>
      </ul>
      {r.daily_limit_cents && (
        <div className="limit-meter">
          <span>
            今日已转出 {money(r.daily_transfer_cents || 0)} / 免验证额度{" "}
            {money(r.daily_limit_cents)}
          </span>
          <div>
            <i
              style={{
                width: `${Math.min(100, (100 * (r.daily_transfer_cents || 0)) / r.daily_limit_cents)}%`,
              }}
            />
          </div>
        </div>
      )}
    </Frame>
  );
}

function CardsVisual({ r }: { r: Record<string, any> }) {
  return (
    <Frame title="我的卡片" action={{ label: "卡片管理", view: "cards" }}>
      <div className="card-strip">
        {(r.cards || []).map((c: any) => (
          <BankCardFace key={c.id} card={c} compact />
        ))}
      </div>
    </Frame>
  );
}

function SchedulesVisual({ r }: { r: Record<string, any> }) {
  return (
    <Frame
      title="未来 45 天的可用余额"
      action={{ label: "资金日程", view: "planner" }}
    >
      <CashRunway
        data={{ ...(r as any), events: r.events || [] }}
        days={45}
        height={330}
      />
    </Frame>
  );
}

/** Whole-plan view for the cross-scenario flow: lock, order, birthday, release. */
function PlanTimeline({
  plan,
  overview,
}: {
  plan: Plan;
  overview: Overview | null;
}) {
  const hold = plan.nodes.find((n) => n.tool === "funds.hold");
  const orders = plan.nodes.filter((n) => n.tool === "merchant.order");
  if (!hold && !orders.length) return null;
  const events = plan.nodes.find((n) => n.tool === "life.events")?.result
    ?.events as LifeEvent[] | undefined;
  const contactId = orders[0]?.params.contact_id;
  const person = overview?.contacts.find((c) => c.id === contactId);
  const birthday =
    events?.find((e) => e.contact_id === contactId)?.date ||
    person?.next_birthday;
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const span = (d?: string) =>
    d ? Math.round((Date.parse(d) - Date.parse(today)) / 86400e3) : 0;
  const state = (n: PlanNode) =>
    statuses[n.operation?.status || n.status] || n.status;
  // Orders on the same day collapse into one stop so labels never collide.
  const byDay = new Map<string, PlanNode[]>();
  for (const o of orders)
    byDay.set(String(o.params.execute_date), [
      ...(byDay.get(String(o.params.execute_date)) || []),
      o,
    ]);
  const steps = [
    hold && {
      at: 0,
      icon: Lock,
      title: `锁定 ${money(Number(hold.params.amount_cents))}`,
      sub: state(hold),
      done: hold.status === "succeeded",
    },
    ...[...byDay.entries()].map(([day, group]) => {
      const names = group.map((o) => catalogItems[String(o.params.item_id)]);
      return {
        at: span(day),
        icon: names.some((i) => i?.category === "鲜花") ? Flower2 : Cake,
        title: names.map((i) => i?.name || "订购").join(" + "),
        sub: `${money(names.reduce((s, i) => s + (i?.price_cents || 0), 0))} · ${group.every((o) => o.status === "succeeded") ? "已预约" : state(group[0])}`,
        done: group.every((o) => o.status === "succeeded"),
      };
    }),
    birthday && {
      at: span(birthday),
      icon: Gift,
      title: `${person?.name || ""}生日`,
      sub: shortDate(birthday),
      done: false,
      major: true,
    },
    hold && {
      at: span(String(hold.params.release_date)),
      icon: CalendarClock,
      title: "余款自动释放",
      sub: shortDate(String(hold.params.release_date)),
      done: false,
    },
  ].filter(Boolean) as {
    at: number;
    icon: any;
    title: string;
    sub: string;
    done: boolean;
    major?: boolean;
  }[];
  const spent = orders.reduce(
    (s, o) => s + (catalogItems[String(o.params.item_id)]?.price_cents || 0),
    0,
  );
  return (
    <section className="result-visual plan-timeline">
      <header>
        <h3>生日安排</h3>
        {hold && (
          <span className="plan-budget">
            预算 {money(Number(hold.params.amount_cents))} · 已安排{" "}
            {money(spent)} · 余{" "}
            {money(Number(hold.params.amount_cents) - spent)}
          </span>
        )}
      </header>
      <ol
        className="plan-stops"
        style={{ ["--stops" as string]: steps.length }}
      >
        {steps.map((s, i) => (
          <li
            key={i}
            className={`${s.done ? "is-done" : ""} ${s.major ? "is-major" : ""}`}
          >
            <span className="plan-dot">
              <s.icon size={14} />
            </span>
            {i > 0 && (
              <em className="plan-gap">
                {s.at - steps[i - 1].at > 0
                  ? `${s.at - steps[i - 1].at} 天`
                  : "同一天"}
              </em>
            )}
            <strong>{s.title}</strong>
            <small>
              {s.at === 0 ? "今天" : `${s.at} 天后`} · {s.sub}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TurnVisuals({
  plan,
  overview,
}: {
  plan: Plan | null;
  overview: Overview | null;
}) {
  if (!plan) return null;
  const done = plan.nodes.filter((n) => n.status === "succeeded" && n.result);
  const visual = (n: PlanNode) => {
    const r = n.result!;
    switch (n.tool) {
      case "bills":
        return <BillsVisual key={n.id} r={r} />;
      case "subscriptions.detect":
        return <RecurringVisual key={n.id} r={r} />;
      case "subscriptions.offers":
        return (
          <Frame
            key={n.id}
            title={
              plan.nodes.some((x) => x.tool === "subscriptions.subscribe")
                ? "办理前确认的服务"
                : "可订阅服务"
            }
            action={{ label: "查看服务", view: "subscriptions" }}
          >
            {(r.offers || []).map((offer: any) => (
              <div className="service-result" key={offer.id}>
                <strong>
                  {offer.name} · {money(offer.amount_cents)}/月 ·{" "}
                  {offer.status === "active"
                    ? "已订阅"
                    : offer.status === "cancelled"
                      ? "已取消"
                      : "未订阅"}
                </strong>
                <p>{offer.terms}</p>
              </div>
            ))}
          </Frame>
        );
      case "wealth.profile":
        return <ProfileVisual key={n.id} r={r} />;
      case "wealth.products":
        return <ProductsVisual key={n.id} r={r} />;
      case "wealth.holdings":
        return <HoldingsVisual key={n.id} r={r} />;
      case "life.events":
        return plan.nodes.some((x) => x.tool === "merchant.order") ? null : (
          <EventsVisual key={n.id} r={r} />
        );
      case "balance":
        return plan.nodes.length > 2 ? null : (
          <BalanceVisual key={n.id} r={r} />
        );
      case "cards":
        return <CardsVisual key={n.id} r={r} />;
      case "schedules.list":
        return <SchedulesVisual key={n.id} r={r} />;
      default:
        return null;
    }
  };
  const visuals = done.map(visual).filter(Boolean);
  const outcomes = plan.nodes.flatMap((n) => {
    const op = n.operation;
    const r = op?.receipt;
    if (op?.status !== "succeeded" || !r) return [];
    if (n.tool === "subscriptions.subscribe")
      return [
        <Frame
          key={n.id}
          title="订阅已开通"
          action={{ label: "查看订阅状态", view: "subscriptions" }}
        >
          <div className="service-result">
            <strong>
              {String(r.name)} · {money(Number(r.amount_cents))}/月
            </strong>
            <p>
              已开通模拟订阅，按月续费，可随时取消后续代扣。下一次计划扣费：
              {String(r.next_billing_date)}。
            </p>
            <p>
              本次未扣款；后续扣费仅作模拟日程展示。回执保存在本次执行详情中。
            </p>
          </div>
        </Frame>,
      ];
    if (["card.report_lost", "card.unlock"].includes(n.tool))
      return [
        <Frame
          key={n.id}
          title="卡片办理结果"
          action={{ label: "查看卡片状态", view: "cards" }}
        >
          <div className="service-result">
            <strong>
              尾号 {r.last4} ·{" "}
              {r.card_status === "lost" ? "已挂失" : "已解除挂失"}
            </strong>
            <p>
              {r.card_status === "lost"
                ? "卡片已停用。找回卡片后，申请解除挂失仍需本人验证。"
                : "卡片已恢复正常状态，可返回卡片页核对。"}
            </p>
          </div>
        </Frame>,
      ];
    if (
      [
        "subscriptions.get",
        "subscriptions.cancel",
        "subscriptions.remind",
      ].includes(n.tool)
    )
      return [
        <Frame
          key={n.id}
          title="签约代扣结果"
          action={{ label: "查看签约代扣", view: "subscriptions" }}
        >
          <div className="service-result">
            <strong>
              {n.tool === "subscriptions.get"
                ? `已查询 ${(r.subscriptions as unknown[] | undefined)?.length || 0} 项签约代扣`
                : `${r.name} · ${n.tool === "subscriptions.cancel" ? "已取消代扣" : `提前 ${r.remind_days} 天提醒`}`}
            </strong>
            <p>
              {n.tool === "subscriptions.cancel"
                ? "已停止后续代扣，历史扣款不会退回。"
                : "返回订阅扣费页，可核对项目状态、扣费金额与续费提醒。"}
            </p>
          </div>
        </Frame>,
      ];
    return [];
  });
  const timeline = <PlanTimeline plan={plan} overview={overview} />;
  if (
    !visuals.length &&
    !outcomes.length &&
    !plan.nodes.some((n) => ["funds.hold", "merchant.order"].includes(n.tool))
  )
    return null;
  return (
    <div className="turn-visuals">
      {timeline}
      {visuals}
      {outcomes}
    </div>
  );
}
