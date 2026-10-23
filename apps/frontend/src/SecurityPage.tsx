import { Ban, Cpu, FileCheck2, Fingerprint, Lock, ScanSearch, ShieldCheck } from "lucide-react";
import { auditLabel, money, time, useData } from "./api";
import { Empty, SectionHead } from "./components";
import { Skeleton } from "./controls";
import type { SecurityData } from "./types";
import { Meter } from "./viz";

const tierCopy = {
  green: { name: "直接办理", note: "只读查询，看完就走，不改动任何东西" },
  yellow: { name: "确认后办理", note: "先把详情摆给你看，你点确认才执行" },
  red: { name: "短信验证后办理", note: "在独立窗口输入验证码，聊天里说“我确认”不算数" },
};

const guards = [
  { icon: FileCheck2, title: "不编造结果", body: "回答里的金额、状态和回执编号都从业务接口的返回值里取。模型只负责理解需求、排顺序，最多从已核对的段落里挑选，不能写新的数字。" },
  { icon: Ban, title: "挡住绕过指令", body: "“忽略规则”“无需验证”这类话在进入模型前就被拦下。权限在服务端判定，模型给出的计划里带授权字段会被直接拒绝。" },
  { icon: ScanSearch, title: "每一步都留痕", body: "计划、步骤、授权、验证和回执都写进哈希链审计。改动任何一条，链就会对不上。" },
  { icon: Lock, title: "出问题就停", body: "验证码连错 3 次、10 分钟内 3 次绕过尝试、1 分钟内发起超过 8 笔操作，都会临时锁定写操作；业务通道连续失败会熔断。" },
  { icon: Cpu, title: "算账在沙箱里", body: "需要临时计算时，表达式在独立进程里按白名单解释执行，限时限内存，不能读文件、联网或执行任意代码。" },
  { icon: Fingerprint, title: "密码不过模型", body: "重置交易密码时，新密码只在验证窗口里输入，服务端只存加盐摘要，执行日志里会被剔除。" },
];

export function SecurityPage() {
  const { data, loading, error } = useData<SecurityData>("/api/security");
  if (loading && !data) return <div className="loading-panel"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (!data) return <Empty title="安全状态没有加载出来">{error}</Empty>;
  const byTier = (t: string) => data.tiers.filter((x) => x.tier === t);
  const opCount = (risk: string) => data.operations.filter((o) => o.risk === risk).reduce((s, o) => s + o.n, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>安全中心</h1>
          <p>Agent 能做什么、要你确认什么、什么时候会自己停下来。</p>
        </div>
        <span className={`lock-status ${data.locked ? "is-locked" : ""}`}>
          {data.locked ? <Lock size={15} /> : <ShieldCheck size={15} />}
          {data.locked ? `已锁定：${data.lock_reason}，${time(data.locked_until!, true)} 解除` : "运行正常"}
        </span>
      </div>
      <section className="panel">
        <SectionHead title="熔断计数" description="任何一项到上限，转账、卡片和理财等操作会暂停，查询不受影响" />
        <div className="breaker-grid">
          <div>
            <span>验证码错误</span>
            <strong>{data.otp_failures}<em> / {data.otp_failure_limit}</em></strong>
            <Meter value={data.otp_failures} max={data.otp_failure_limit} tone={data.otp_failures ? "warning" : "ok"} label="验证码错误次数" />
            <small>连错 3 次锁定 5 分钟</small>
          </div>
          <div>
            <span>绕过尝试（10 分钟内）</span>
            <strong>{data.suspicious_hits}<em> / {data.suspicious_limit}</em></strong>
            <Meter value={data.suspicious_hits} max={data.suspicious_limit} tone={data.suspicious_hits ? "warning" : "ok"} label="绕过尝试次数" />
            <small>第 3 次锁定 10 分钟</small>
          </div>
          <div>
            <span>近 1 分钟发起的操作</span>
            <strong>{data.operations_last_minute}<em> / {data.velocity_limit}</em></strong>
            <Meter value={data.operations_last_minute} max={data.velocity_limit} tone={data.operations_last_minute > 5 ? "warning" : "ok"} label="操作频率" />
            <small>超过就锁定 5 分钟</small>
          </div>
          <div>
            <span>业务通道</span>
            <strong className={data.channel_open ? "negative" : "positive"}>{data.channel_open ? "熔断中" : "畅通"}</strong>
            <Meter value={data.channel_failures} max={3} tone={data.channel_failures ? "warning" : "ok"} label="通道连续失败" />
            <small>连续失败 3 次熔断 60 秒</small>
          </div>
          <div>
            <span>今日转账</span>
            <strong>{money(data.daily_transfer_cents)}</strong>
            <div className="limit-meter"><div><i style={{ width: `${Math.min(100, (100 * data.daily_transfer_cents) / data.daily_limit_cents)}%` }} /></div></div>
            <small>累计超过 {money(data.daily_limit_cents)} 改为短信验证</small>
          </div>
        </div>
      </section>
      <section className="panel">
        <SectionHead title="三级权限" description="由服务端按操作和金额判定，模型和聊天内容改变不了" />
        <div className="tier-board">
          {(["green", "yellow", "red"] as const).map((t) => (
            <div key={t} className={`tier-col tier-${t}`}>
              <header>
                <i />
                <div>
                  <strong>{tierCopy[t].name}</strong>
                  <span>{tierCopy[t].note}</span>
                </div>
                <b>{t === "green" ? byTier(t).length : opCount(t)}<em>{t === "green" ? " 项" : " 次"}</em></b>
              </header>
              <ul>
                {byTier(t).map((x) => (
                  <li key={x.tool}>
                    {x.label}
                    {x.condition && <small>{x.condition}</small>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <div className="report-grid">
        <section className="panel span-2">
          <SectionHead title="防护是怎么做的" />
          <div className="guard-grid">
            {guards.map((g) => (
              <div key={g.title}>
                <g.icon size={18} />
                <strong>{g.title}</strong>
                <p>{g.body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="panel span-2">
          <SectionHead title="最近的授权和安全事件" />
          {data.events.length ? (
            <ol className="security-events">
              {data.events.map((e, i) => (
                <li key={i} className={`ev-${e.action.split(".")[0]} ${/denied|locked|suspicious|failure|blocked/.test(e.action) ? "is-alert" : ""}`}>
                  <i />
                  <strong>{auditLabel(e.action)}</strong>
                  <span>{time(e.occurred_at, true)}</span>
                  {e.details.reason && <small>{String(e.details.reason)}</small>}
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="还没有授权或安全事件" />
          )}
        </section>
      </div>
    </>
  );
}
