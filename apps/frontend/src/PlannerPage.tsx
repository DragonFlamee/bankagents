import { useState } from "react";
import { CalendarClock, Gift, Lock, Play, Users } from "lucide-react";
import { api, money, statuses, useData } from "./api";
import { Badge, Button, Empty, SectionHead } from "./components";
import { Skeleton } from "./controls";
import type { ScheduleData } from "./types";
import { shortDate } from "./viz";
import { CashRunway } from "./Runway";
import { refreshAll } from "./ResultVisual";

export function PlannerPage({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { data, loading, error, reload } = useData<ScheduleData>("/api/schedules");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  async function demo(key: string, path: string, done: string) {
    setBusy(key);
    setNote("");
    try {
      const r = await api<{ message?: string; status?: string }>(path, {});
      setNote(r.message || done);
      await reload();
      refreshAll();
    } catch (e: any) {
      setNote(e.message);
    } finally {
      setBusy(null);
    }
  }
  if (loading && !data) return <div className="loading-panel"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (!data) return <Empty title="资金日程没有加载出来">{error}</Empty>;
  const contacts = Object.fromEntries(data.contacts.map((c) => [c.id, c.name]));
  const spouse = data.events.find((e) => e.relation === "爱人");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>资金日程</h1>
          <p>预约转账、锁定的钱、即将扣的费用和家人的生日，放在一条时间线上看。</p>
        </div>
        {spouse && (
          <Button kind="primary" onClick={() => onAsk(`${spouse.name}生日快到了，这个月帮我锁定1000元活期，生日前2天订鲜花和蛋糕`)}>
            <Gift size={15} />
            安排{spouse.name}的生日
          </Button>
        )}
      </div>
      <section className="panel">
        <SectionHead title="未来 60 天能动用多少钱" description="已确认的预约加上按过去规律预计的工资、房租和订阅，逐日推算可用余额。鼠标移到某一天看明细" />
        <div className="panel-body">
          <CashRunway data={data} days={60} />
        </div>
      </section>
      {note && <p className="inline-note" role="status">{note}</p>}
      <div className="planner-grid">
        <section className="panel">
          <SectionHead title="预约" description="到期由系统按你当初的授权执行，执行时会重新检查余额" action={<CalendarClock size={16} />} />
          {data.schedules.length ? (
            <ul className="schedule-list">
              {data.schedules.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.kind === "transfer" ? `转给${contacts[s.params.contact_id] || "联系人"}` : `${s.item?.merchant} · ${s.item?.name}`}</strong>
                    <span>
                      {shortDate(s.execute_date)}{s.repeat === "monthly" ? " · 每月" : ""}
                      {s.last_result && ` · 上次：${s.last_result.message}`}
                    </span>
                  </div>
                  <b>{money(s.kind === "transfer" ? s.params.amount_cents : s.item?.price_cents || 0)}</b>
                  <Badge status={s.status === "scheduled" ? "awaiting_confirmation" : s.status === "done" ? "succeeded" : s.status}>{statuses[s.status] || s.status}</Badge>
                  {s.status === "scheduled" && (
                    <div className="row-actions">
                      <Button loading={busy === s.id} onClick={() => demo(s.id, `/api/schedules/${s.id}/run-now`, "已按到期日执行")} title="演示用：不等日期，现在按到期日执行一次">
                        <Play size={13} />演示：现在执行
                      </Button>
                      {s.kind === "transfer" && <Button onClick={() => onAsk(`取消给${contacts[s.params.contact_id]}的预约转账`)}>取消</Button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="没有预约">试试“每月 10 号给妈妈转 1000 元”。</Empty>
          )}
        </section>
        <section className="panel">
          <SectionHead title="锁定的资金" description="锁定期间不能转出或消费，到期自动释放" action={<Lock size={16} />} />
          {data.holds.length ? (
            <ul className="hold-list">
              {data.holds.map((h) => (
                <li key={h.id}>
                  <div className="hold-head">
                    <strong>{h.name}</strong>
                    <Badge status={h.status === "active" ? "succeeded" : "neutral"}>{statuses[h.status] || h.status}</Badge>
                  </div>
                  <div className="hold-bar" aria-label={`已用 ${money(h.used_cents)}，共 ${money(h.amount_cents)}`}>
                    <i style={{ width: `${(100 * h.used_cents) / h.amount_cents}%` }} />
                  </div>
                  <span>已用 {money(h.used_cents)} / {money(h.amount_cents)} · {shortDate(h.release_date)} 释放</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="没有锁定的资金" />
          )}
        </section>
        <section className="panel">
          <SectionHead title="AA 收款" action={<Users size={16} />} />
          {data.splits.length ? (
            <ul className="split-list">
              {data.splits.map((sp) => {
                const paid = sp.shares.filter((x) => x.status === "paid").reduce((a, x) => a + x.amount_cents, 0);
                const owed = sp.shares.reduce((a, x) => a + x.amount_cents, 0);
                return (
                  <li key={sp.id}>
                    <div className="split-head">
                      <span className="split-ring" style={{ ["--p" as string]: `${owed ? (100 * paid) / owed : 0}%` }}>
                        <b>{sp.shares.filter((x) => x.status === "paid").length}/{sp.shares.length}</b>
                      </span>
                      <div>
                        <strong>{sp.note || "AA 收款"} · {money(sp.total_cents)}</strong>
                        <span>已收 {money(paid)}，还差 {money(owed - paid)}；你自己承担 {money(sp.self_share_cents)}</span>
                      </div>
                    </div>
                    <ul>
                      {sp.shares.map((x) => (
                        <li key={x.contact_id}>
                          <span>{x.name}</span>
                          <b>{money(x.amount_cents)}</b>
                          {x.status === "paid" ? (
                            <Badge status="succeeded">已收到</Badge>
                          ) : (
                            <Button loading={busy === sp.id + x.contact_id} title="演示用：假装对方已付款"
                                    onClick={() => demo(sp.id + x.contact_id, `/api/splits/${sp.id}/shares/${x.contact_id}/settle`, `已收到${x.name}的 ${money(x.amount_cents)}`)}>
                              演示：对方已付
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="还没有 AA 收款">试试“晚饭 680 元和王明、李娜 AA”。</Empty>
          )}
        </section>
        <section className="panel">
          <SectionHead title="家人和朋友的生日" description="来自通讯录" action={<Gift size={16} />} />
          <ul className="event-list wide">
            {data.events.map((e) => (
              <li key={e.contact_id}>
                <span className="event-ring" style={{ ["--p" as string]: `${Math.max(3, 100 - (e.days_until / 90) * 100)}%` }}>
                  <b>{e.days_until}</b><small>天</small>
                </span>
                <div><strong>{e.name}</strong><span>{e.relation} · {shortDate(e.date)}</span></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="method-note">标着“演示”的按钮只用于展示，会跳过等待日期，但仍然走同一套执行和余额检查。</p>
    </>
  );
}
