import {
  AlertTriangle,
  BellRing,
  MessageSquareText,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { money, useData } from "./api";
import { Button, Empty, SectionHead } from "./components";
import { Skeleton } from "./controls";
import type { Recurring, ScheduleData, SubscriptionOffer } from "./types";
import { colorFor, shortDate } from "./viz";
import { ChargeRuler } from "./Runway";

const keyword: Record<string, string> = {
  云端音乐: "音乐",
  云盘空间: "云盘",
  星河视频: "视频",
};
interface Mandate {
  id: string;
  name: string;
  amount_cents: number;
  status: string;
  remind_days: number | null;
  billing_day: number;
  first_charge_date?: string | null;
}

export function SubscriptionsPage({
  onAsk,
}: {
  onAsk: (prompt: string) => void;
}) {
  const detected = useData<{
    recurring: Recurring[];
    monthly_total_cents: number;
    window_days: number;
    method: string;
  }>("/api/subscriptions/detected");
  const plan = useData<ScheduleData>("/api/schedules");
  const offers = useData<{ offers: SubscriptionOffer[] }>(
    "/api/subscriptions/offers",
  );
  const mandates = useData<{ authorized: boolean; subscriptions: Mandate[] }>(
    "/api/subscriptions/mandates",
  );
  const found = detected.data?.recurring || [];
  if (detected.loading && !detected.data)
    return (
      <div className="loading-panel">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (!detected.data)
    return <Empty title="扣费记录没有加载出来">{detected.error}</Empty>;
  const rises = found.filter((f) => f.price_change_cents > 0);
  const unsigned = found.filter((f) => !f.mandate);
  const maxAnnual = Math.max(1, ...found.map((f) => f.annual_cents));
  const today =
    plan.data?.today ||
    new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>订阅与自动扣费</h1>
          <p>
            管理已签约的代扣，也从近 {detected.data.window_days}{" "}
            天流水中查找周期扣款。
          </p>
        </div>
        <Button onClick={() => onAsk("帮我识别一下哪些在自动扣费")}>
          <MessageSquareText size={15} />让 Agent 检查一遍
        </Button>
      </div>
      <section className="panel offer-panel" aria-label="可订阅服务">
        <SectionHead
          title="可订阅服务"
          description="选择模拟服务，由 Agent 核对价格和续费条款；本人确认后才开通。"
        />
        {offers.loading && !offers.data ? (
          <div className="panel-body">
            <Skeleton />
          </div>
        ) : offers.error ? (
          <Empty title="可订阅服务没有加载出来">{offers.error}</Empty>
        ) : (
          offers.data?.offers.map((offer) => (
            <div className="service-entry mandate-consent" key={offer.id}>
              <span className="service-entry-icon">
                <Repeat size={22} />
              </span>
              <div>
                <h2>
                  {offer.name}{" "}
                  <span className="tag">
                    {offer.status === "active"
                      ? "已订阅"
                      : offer.status === "cancelled"
                        ? "已取消"
                        : "未订阅"}
                  </span>
                </h2>
                <p>{offer.description}</p>
                <p>
                  <strong>{money(offer.amount_cents)}/月</strong> · 按月续费
                </p>
                <p>{offer.terms}</p>
              </div>
              <div className="button-row service-entry-actions">
                {offer.status === "active" ? (
                  <>
                    <Button
                      onClick={() => onAsk(`${offer.name}订阅续费前3天提醒我`)}
                    >
                      <BellRing size={14} />
                      续费提醒
                    </Button>
                    <Button
                      kind="danger"
                      onClick={() => onAsk(`取消${offer.name}订阅`)}
                    >
                      取消订阅
                    </Button>
                  </>
                ) : (
                  <Button
                    kind="primary"
                    onClick={() => onAsk(`帮我订阅${offer.name}月度会员`)}
                  >
                    {offer.status === "cancelled"
                      ? "让 Agent 重新订阅"
                      : "让 Agent 帮我订阅"}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
      <section className="panel mandate-panel" aria-label="签约代扣">
        <SectionHead
          title="签约代扣"
          description="已签约的项目不依赖流水识别；取消和提醒均由 Agent 发起，确认后生效。"
        />
        {mandates.loading && !mandates.data ? (
          <div className="panel-body">
            <Skeleton />
          </div>
        ) : mandates.error ? (
          <Empty title="签约代扣没有加载出来">{mandates.error}</Empty>
        ) : !mandates.data?.authorized ? (
          <div className="service-entry mandate-consent">
            <span className="service-entry-icon">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2>先授权查询你的签约代扣</h2>
              <p>
                Agent
                会列出查询请求。本人确认后，即可查看项目、设置提醒或申请取消。
              </p>
            </div>
            <Button kind="primary" onClick={() => onAsk("查询我的订阅")}>
              <Repeat size={15} />
              查询签约代扣
            </Button>
          </div>
        ) : !mandates.data.subscriptions.length ? (
          <Empty title="还没有签约代扣">
            流水中识别出的周期扣款会显示在下方。
          </Empty>
        ) : (
          <ul className="mandate-list">
            {mandates.data.subscriptions.map((m) => (
              <li key={m.id}>
                <span className="mandate-icon">
                  <Repeat size={18} />
                </span>
                <div className="mandate-name">
                  <strong>{m.name}</strong>
                  <span>
                    {m.status === "active"
                      ? `每月 ${m.billing_day} 日扣款${m.remind_days ? ` · 提前 ${m.remind_days} 天提醒` : " · 未设置提醒"}`
                      : "已停止后续代扣，历史扣款保留"}
                  </span>
                </div>
                <span className="mandate-amount tabular">
                  {money(m.amount_cents)}
                  <small>/月</small>
                </span>
                <span
                  className={`tag ${m.status === "active" ? "" : "tag-warning"}`}
                >
                  {m.status === "active"
                    ? m.first_charge_date
                      ? "已签约"
                      : "代扣中"
                    : "已取消"}
                </span>
                <div className="button-row">
                  {m.status === "active" ? (
                    <>
                      <Button
                        disabled={m.remind_days === 3}
                        onClick={() => onAsk(`${m.name}订阅续费前3天提醒我`)}
                      >
                        <BellRing size={14} />
                        {m.remind_days === 3 ? "提前 3 天提醒" : "设置提醒"}
                      </Button>
                      <Button
                        kind="danger"
                        onClick={() => onAsk(`取消${m.name}订阅`)}
                      >
                        取消代扣
                      </Button>
                    </>
                  ) : (
                    <span className="small-note">无需再次取消</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="page-heading recurring-heading">
        <div>
          <h2>从流水识别</h2>
          <p>识别结果需要至少三次月度扣款；没有识别结果不代表没有签约代扣。</p>
        </div>
      </div>
      {!found.length ? (
        <section className="panel">
          <Empty title="暂未识别出周期扣款">
            当前流水不足以形成月度规律。可以在上方授权查询签约代扣，继续演示提醒和取消操作。
          </Empty>
        </section>
      ) : (
        <>
          <div className="metrics-band">
            <div>
              <span>流水估算月扣费</span>
              <strong>{money(detected.data.monthly_total_cents)}</strong>
              <small>识别到 {found.length} 项，已取消项目不计入</small>
            </div>
            <div>
              <span>一年下来</span>
              <strong>{money(detected.data.monthly_total_cents * 12)}</strong>
              <small>按最近一次金额估算</small>
            </div>
            <div>
              <span>最近涨价</span>
              <strong className={rises.length ? "negative" : ""}>
                {rises.length}
                <em> 项</em>
              </strong>
              <small>{rises.map((r) => r.merchant).join("、") || "没有"}</small>
            </div>
            <div>
              <span>未签约代扣</span>
              <strong>
                {unsigned.length}
                <em> 项</em>
              </strong>
              <small>商户直接扣卡，需要联系商户取消</small>
            </div>
          </div>
          <section className="panel">
            <SectionHead
              title="接下来一个月的扣款"
              description="柱子越高金额越大（对数刻度），周末底色略深"
            />
            <div className="panel-body">
              <ChargeRuler
                today={today}
                items={found
                  .filter(
                    (f) =>
                      f.mandate?.status !== "cancelled" && f.days_until <= 34,
                  )
                  .map((f) => ({
                    date: f.next_expected,
                    label: f.merchant,
                    amount: f.last_amount_cents,
                    color: colorFor(f.category),
                  }))}
              />
            </div>
          </section>
          <div className="subs-grid">
            {found.map((f) => {
              const name = keyword[f.merchant];
              const active = f.mandate?.status === "active";
              return (
                <section
                  className={`panel sub-card ${f.mandate?.status === "cancelled" ? "is-cancelled" : ""}`}
                  key={f.merchant}
                >
                  <header>
                    <span
                      className="recurring-mark big"
                      style={{ background: colorFor(f.category) }}
                    >
                      {f.merchant.slice(0, 1)}
                    </span>
                    <div>
                      <h2>{f.merchant}</h2>
                      <span>
                        {f.category} · 每 {f.cadence_days} 天左右 · 识别可信度{" "}
                        {Math.round(f.confidence * 100)}%
                      </span>
                    </div>
                    <b>
                      {money(f.last_amount_cents)}
                      <em>/月</em>
                    </b>
                  </header>
                  <div className="sub-figures">
                    <div>
                      <span>下次扣款</span>
                      <strong>{shortDate(f.next_expected)}</strong>
                      <small>{f.days_until} 天后</small>
                    </div>
                    <div>
                      <span>一年</span>
                      <strong>{money(f.annual_cents)}</strong>
                      <div className="annual-bar">
                        <i
                          style={{
                            width: `${(100 * f.annual_cents) / maxAnnual}%`,
                            background: colorFor(f.category),
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <span>已扣</span>
                      <strong>{f.count} 次</strong>
                      <small>上次 {shortDate(f.last_charged)}</small>
                    </div>
                  </div>
                  {f.price_change_cents > 0 && (
                    <p className="sub-alert">
                      <AlertTriangle size={14} />从{" "}
                      {money(f.previous_amount_cents)} 涨到{" "}
                      {money(f.last_amount_cents)}，每年多{" "}
                      {money(f.price_change_cents * 12)}
                    </p>
                  )}
                  {!f.mandate && (
                    <p className="sub-alert muted">
                      不在你签约的代扣里。可能是商户直接扣卡，取消要找商户，或者关掉这张卡的网上支付。
                    </p>
                  )}
                  {f.mandate?.status === "cancelled" && (
                    <p className="sub-alert muted">
                      代扣已取消，之后的扣款应该停止。
                    </p>
                  )}
                  <footer>
                    {active && name && (
                      <>
                        <Button
                          onClick={() => onAsk(`${name}订阅续费前3天提醒我`)}
                        >
                          <BellRing size={14} />
                          {f.mandate?.remind_days
                            ? `提醒：提前 ${f.mandate.remind_days} 天`
                            : "设置提醒"}
                        </Button>
                        <Button
                          kind="danger"
                          onClick={() => onAsk(`取消${name}订阅`)}
                        >
                          取消订阅
                        </Button>
                      </>
                    )}
                  </footer>
                </section>
              );
            })}
          </div>
        </>
      )}
      <p className="method-note">
        识别规则：{detected.data.method}
        。取消代扣只停止以后的扣款，已经扣过的不会退回。
      </p>
    </>
  );
}
