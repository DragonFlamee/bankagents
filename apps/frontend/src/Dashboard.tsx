import { ArrowRight, ArrowUpRight, BellRing, ChevronRight, Gift, ShieldCheck } from "lucide-react";
import { labels, money, useData } from "./api";
import { BankCardFace, Guilloche } from "./BankCardFace";
import { CategoryBars, SpendingChart } from "./charts";
import { Button, SectionHead, TaskRows, maskPhone } from "./components";
import { Skeleton } from "./controls";
import type { Analytics, Operation, Overview, Plan, ScheduleData, Session, View } from "./types";
import { shortDate } from "./viz";
import { CashRunway } from "./Runway";

export function Dashboard({
  session,
  overview,
  month,
  plans,
  pendingOps,
  loading,
  onNavigate,
  onOpen,
  onAsk,
}: {
  session: Session;
  overview: Overview | null;
  month: Analytics | null;
  plans: Plan[];
  pendingOps: { plan: Plan; op: Operation }[];
  loading: boolean;
  onNavigate: (v: View) => void;
  onOpen: (p: Plan) => void;
  onAsk: (prompt: string) => void;
}) {
  const schedule = useData<ScheduleData>("/api/schedules");
  const acc = overview?.accounts[0];
  const held = acc?.held_cents || 0;
  const wealth = overview?.wealth_total_cents || 0;
  const credit = overview?.cards.find((c) => c.kind === "credit");
  const total = (acc?.balance_cents || 0) + wealth;
  const a = month?.analysis;
  const s = schedule.data;
  const reminders = [
    ...(s?.events || []).filter((e) => e.days_until <= 14).map((e) => ({
      key: "e" + e.contact_id,
      icon: Gift,
      title: `${e.relation}${e.name}的生日还有 ${e.days_until} 天`,
      sub: shortDate(e.date),
      action: e.relation === "爱人" && !s?.holds.some((h) => h.status === "active" && h.name.includes(e.name))
        ? { label: "帮我安排", prompt: `${e.name}生日快到了，这个月帮我锁定1000元活期，生日前2天订鲜花和蛋糕` }
        : undefined,
    })),
    ...(s?.subscriptions || [])
      .filter((x) => x.remind_days && (Date.parse(x.next_charge) - Date.parse(s!.today)) / 86400e3 <= x.remind_days)
      .map((x) => ({ key: "s" + x.id, icon: BellRing, title: `${x.name}即将续费 ${money(x.amount_cents)}`, sub: `${shortDate(x.next_charge)} 扣款`, action: undefined })),
    ...(a?.anomalies.length
      ? [{ key: "an", icon: ShieldCheck, title: `本月有 ${a.anomalies.length} 笔交易建议核对`, sub: a.anomalies.map((x) => x.merchant).join("、"), action: { label: "去看看", prompt: "分析本月账单，看看有哪些异常消费" } }]
      : []),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{greeting()}，{session.user.name}</h1>
          <p>{new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" })}</p>
        </div>
        <Button onClick={() => onNavigate("workspace")}>
          打开工作台
          <ArrowUpRight size={15} />
        </Button>
      </div>
      <section className="asset-hero">
        <Guilloche seed={3} color="#9fb3ff" opacity={0.22} className="hero-pattern" />
        <div className="asset-main">
          <span>总资产</span>
          <strong className="tabular">{overview ? money(total) : <Skeleton metric />}</strong>
          <div className="asset-split" role="img" aria-label={`活期可用 ${money((acc?.balance_cents || 0) - held)}，锁定 ${money(held)}，理财 ${money(wealth)}`}>
            <i style={{ flex: Math.max(1, (acc?.balance_cents || 0) - held) }} className="seg-cash" />
            {held > 0 && <i style={{ flex: held }} className="seg-held" />}
            {wealth > 0 && <i style={{ flex: wealth }} className="seg-wealth" />}
          </div>
        </div>
        <dl className="asset-figures">
          <div><dt><i className="seg-cash" />活期可用</dt><dd>{money((acc?.balance_cents || 0) - held)}</dd></div>
          <div><dt><i className="seg-held" />锁定中</dt><dd>{money(held)}</dd></div>
          <div><dt><i className="seg-wealth" />理财</dt><dd>{money(wealth)}</dd></div>
          {credit && <div><dt>信用卡待还</dt><dd>{money(credit.used_cents || 0)}</dd></div>}
        </dl>
        <p className="asset-note">模拟资金，不连接真实账户</p>
      </section>
      <div className="metrics-band">
        <div>
          <span>本月支出</span>
          <strong>{a ? money(a.total_expense_cents) : loading ? <Skeleton metric /> : "—"}</strong>
          <small>{a?.savings_rate_bp != null ? `储蓄率 ${(a.savings_rate_bp / 100).toFixed(1)}%` : "按已入账流水统计"}</small>
        </div>
        <div>
          <span>今日已转出</span>
          <strong>{money(overview?.daily_transfer_cents || 0)}</strong>
          <small>超过 {money(overview?.daily_limit_cents || 100000)} 需要短信验证</small>
        </div>
        <div>
          <span>待你确认</span>
          <strong>{pendingOps.length}<em> 项</em></strong>
          <small>{pendingOps.length ? "核对后才会执行" : "没有等待中的操作"}</small>
        </div>
        <div>
          <span>理财风险测评</span>
          <strong>{overview?.risk_profile ? `C${overview.risk_profile.level}` : "未测评"}</strong>
          <small>{overview?.risk_profile ? `${overview.risk_profile.name} · 至 ${overview.risk_profile.expires_at.slice(0, 10)}` : "买理财前需要先测评"}</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="panel">
            <SectionHead
              title="接下来 45 天的钱"
              description="按预约和过去的收支规律推算每天的可用余额"
              action={<button className="text-button" onClick={() => onNavigate("planner")}>资金日程<ArrowUpRight size={14} /></button>}
            />
            <div className="panel-body">
              {s ? <CashRunway data={s} days={45} height={340} /> : <Skeleton />}
            </div>
          </section>
          <section className="panel">
            <SectionHead
              title="本月支出走势"
              description="按交易发生顺序累计"
              action={<button className="text-button" onClick={() => onNavigate("analytics")}>账单报告<ArrowUpRight size={14} /></button>}
            />
            {!month && loading ? <div className="loading-panel"><Skeleton /><Skeleton /></div> : <SpendingChart data={month} />}
          </section>
          <section className="panel">
            <SectionHead title="最近的任务" action={<button className="text-button" onClick={() => onNavigate("activity")}>全部<ArrowRight size={14} /></button>} />
            <TaskRows plans={plans} onOpen={onOpen} limit={5} />
          </section>
        </div>
        <div className="dashboard-side">
          <section className="panel">
            <SectionHead title="提醒" action={<BellRing size={16} />} />
            {reminders.length ? (
              <ul className="reminder-list">
                {reminders.map((r) => (
                  <li key={r.key}>
                    <span className="reminder-icon"><r.icon size={15} /></span>
                    <div>
                      <strong>{r.title}</strong>
                      <span>{r.sub}</span>
                      {r.action && <button className="text-button" onClick={() => onAsk(r.action!.prompt)}>{r.action.label}<ArrowRight size={13} /></button>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-pending-operations">最近没有需要留意的事。</p>
            )}
          </section>
          <section className="panel">
            <SectionHead title="待你确认" action={<ShieldCheck size={16} />} />
            {pendingOps.length ? (
              pendingOps.slice(0, 3).map(({ plan: p, op }) => (
                <button className="approval-preview" key={op.id} onClick={() => onOpen(p)}>
                  <span className={`approval-icon ${op.risk === "red" ? "is-red" : ""}`}><ShieldCheck size={17} /></span>
                  <span>
                    <strong>{labels[op.tool] || "业务操作"}</strong>
                    <small>{op.params.amount_cents ? money(Number(op.params.amount_cents)) : maskPhone(p.message)}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <p className="no-pending-operations">当前没有待确认操作。</p>
            )}
          </section>
          <section className="panel">
            <SectionHead title="我的卡" action={<button className="text-button" onClick={() => onNavigate("cards")}>管理<ArrowUpRight size={14} /></button>} />
            <div className="card-stack">
              {overview?.cards.slice(0, 3).map((c) => <BankCardFace key={c.id} card={c} compact />)}
            </div>
          </section>
          <section className="panel">
            <SectionHead title="支出分布" description="本月按金额排序" />
            <CategoryBars data={month} />
          </section>
        </div>
      </div>
    </>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai", hour: "numeric", hour12: false }));
  return h < 6 ? "夜深了" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 19 ? "下午好" : "晚上好";
}
