import { AlertTriangle, BellRing, MessageSquareText } from "lucide-react";
import { money, useData } from "./api";
import { Button, Empty, SectionHead } from "./components";
import { Skeleton } from "./controls";
import type { Recurring, ScheduleData } from "./types";
import { colorFor, shortDate } from "./viz";
import { ChargeRuler } from "./Runway";

const keyword: Record<string, string> = { 云端音乐: "音乐", 云盘空间: "云盘", 星河视频: "视频" };

export function SubscriptionsPage({ onAsk }: { onAsk: (prompt: string) => void }) {
  const detected = useData<{ recurring: Recurring[]; monthly_total_cents: number; window_days: number; method: string }>("/api/subscriptions/detected");
  const plan = useData<ScheduleData>("/api/schedules");
  const found = detected.data?.recurring || [];
  if (detected.loading && !detected.data)
    return <div className="loading-panel"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (!detected.data) return <Empty title="扣费记录没有加载出来">{detected.error}</Empty>;
  const rises = found.filter((f) => f.price_change_cents > 0);
  const unsigned = found.filter((f) => !f.mandate);
  const maxAnnual = Math.max(1, ...found.map((f) => f.annual_cents));
  const today = plan.data?.today || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>订阅与自动扣费</h1>
          <p>从近 {detected.data.window_days} 天流水里自动识别，不靠你手动登记。</p>
        </div>
        <Button onClick={() => onAsk("帮我识别一下哪些在自动扣费")}>
          <MessageSquareText size={15} />
          让 Agent 检查一遍
        </Button>
      </div>
      <div className="metrics-band">
        <div><span>每月固定扣费</span><strong>{money(detected.data.monthly_total_cents)}</strong><small>{found.length} 项</small></div>
        <div><span>一年下来</span><strong>{money(detected.data.monthly_total_cents * 12)}</strong><small>按最近一次金额估算</small></div>
        <div><span>最近涨价</span><strong className={rises.length ? "negative" : ""}>{rises.length}<em> 项</em></strong><small>{rises.map((r) => r.merchant).join("、") || "没有"}</small></div>
        <div><span>未签约代扣</span><strong>{unsigned.length}<em> 项</em></strong><small>商户直接扣卡，需要联系商户取消</small></div>
      </div>
      <section className="panel">
        <SectionHead title="接下来一个月的扣款" description="柱子越高金额越大（对数刻度），周末底色略深" />
        <div className="panel-body">
          <ChargeRuler
            today={today}
            items={found
              .filter((f) => f.mandate?.status !== "cancelled" && f.days_until <= 34)
              .map((f) => ({ date: f.next_expected, label: f.merchant, amount: f.last_amount_cents, color: colorFor(f.category) }))}
          />
        </div>
      </section>
      <div className="subs-grid">
        {found.map((f) => {
          const name = keyword[f.merchant];
          const active = f.mandate?.status === "active";
          return (
            <section className={`panel sub-card ${f.mandate?.status === "cancelled" ? "is-cancelled" : ""}`} key={f.merchant}>
              <header>
                <span className="recurring-mark big" style={{ background: colorFor(f.category) }}>{f.merchant.slice(0, 1)}</span>
                <div>
                  <h2>{f.merchant}</h2>
                  <span>{f.category} · 每 {f.cadence_days} 天左右 · 识别可信度 {Math.round(f.confidence * 100)}%</span>
                </div>
                <b>{money(f.last_amount_cents)}<em>/月</em></b>
              </header>
              <div className="sub-figures">
                <div><span>下次扣款</span><strong>{shortDate(f.next_expected)}</strong><small>{f.days_until} 天后</small></div>
                <div><span>一年</span><strong>{money(f.annual_cents)}</strong><div className="annual-bar"><i style={{ width: `${(100 * f.annual_cents) / maxAnnual}%`, background: colorFor(f.category) }} /></div></div>
                <div><span>已扣</span><strong>{f.count} 次</strong><small>上次 {shortDate(f.last_charged)}</small></div>
              </div>
              {f.price_change_cents > 0 && (
                <p className="sub-alert"><AlertTriangle size={14} />从 {money(f.previous_amount_cents)} 涨到 {money(f.last_amount_cents)}，每年多 {money(f.price_change_cents * 12)}</p>
              )}
              {!f.mandate && <p className="sub-alert muted">不在你签约的代扣里。可能是商户直接扣卡，取消要找商户，或者关掉这张卡的网上支付。</p>}
              {f.mandate?.status === "cancelled" && <p className="sub-alert muted">代扣已取消，之后的扣款应该停止。</p>}
              <footer>
                {active && name && (
                  <>
                    <Button onClick={() => onAsk(`${name}订阅续费前${f.mandate?.remind_days ? f.mandate.remind_days + 2 : 3}天提醒我`)}>
                      <BellRing size={14} />
                      {f.mandate?.remind_days ? `提醒：提前 ${f.mandate.remind_days} 天` : "设置提醒"}
                    </Button>
                    <Button kind="danger" onClick={() => onAsk(`取消${name}订阅`)}>取消订阅</Button>
                  </>
                )}
              </footer>
            </section>
          );
        })}
      </div>
      <p className="method-note">识别规则：{detected.data.method}。取消代扣只停止以后的扣款，已经扣过的不会退回。</p>
    </>
  );
}
