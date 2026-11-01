import { useState } from "react";
import {
  CreditCard,
  KeyRound,
  Plus,
  ShieldAlert,
  Snowflake,
  Sun,
  Unlock,
} from "lucide-react";
import { money } from "./api";
import { BankCardFace } from "./BankCardFace";
import { Button, Empty, SectionHead } from "./components";
import { controlNames } from "./catalog";
import type { Overview } from "./types";
import { Gauge } from "./viz";

const controlHelp: Record<string, string> = {
  online: "网购、扫码、App 内支付",
  overseas: "境外刷卡和跨境网站",
  atm: "柜员机取现",
  contactless: "300 元以下挥卡免输密码",
};

/** Every change here is phrased as a request to the agent, so it passes the same tiered authorisation. */
export function CardsPage({
  overview,
  onAsk,
}: {
  overview: Overview | null;
  onAsk: (prompt: string) => void;
}) {
  const cards = overview?.cards || [];
  const [current, setCurrent] = useState<string | null>(null);
  const [limit, setLimit] = useState("");
  const card = cards.find((c) => c.id === current) || cards[0];
  if (!card)
    return <Empty title="还没有卡片">可以让 Agent 帮你申请一张。</Empty>;
  const tail = `尾号${card.last4}`;
  const credit = card.kind === "credit";
  const otherAvailable = cards.find(
    (c) => c.id !== card.id && ["active", "frozen"].includes(c.status),
  );
  const used = card.used_cents || 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>卡片</h1>
          <p>选择卡片后交给 Agent 办理，敏感操作需要本人确认和演示验证码。</p>
        </div>
        <div className="button-row">
          <Button onClick={() => onAsk("申请一张虚拟卡")}>
            <Plus size={15} />
            虚拟卡
          </Button>
          <Button onClick={() => onAsk("申请一张信用卡")}>
            <CreditCard size={15} />
            申请新卡
          </Button>
        </div>
      </div>
      <section className="service-entry" aria-label="卡片挂失办理">
        <span className="service-entry-icon">
          <ShieldAlert size={22} />
        </span>
        <div>
          <h2>
            {card.status === "lost"
              ? `尾号 ${card.last4} 已挂失`
              : `挂失尾号 ${card.last4}`}
          </h2>
          <p>
            {card.status === "lost"
              ? "这张卡已经完成挂失。找回后可申请解挂；也可在下方选择其他正常卡片演示挂失。"
              : "Agent 核对卡片，等待本人验证，完成后返回挂失回执并更新卡片状态。"}
          </p>
          <span className="service-steps">
            核对卡片 <i>→</i> 本人验证 <i>→</i> 状态与回执
          </span>
        </div>
        <div className="button-row service-entry-actions">
          {card.status === "lost" && otherAvailable && (
            <Button onClick={() => setCurrent(otherAvailable.id)}>
              选择可挂失卡片
            </Button>
          )}
          <Button
            kind={card.status === "lost" ? "secondary" : "danger"}
            disabled={card.status === "processing"}
            onClick={() =>
              onAsk(`${card.status === "lost" ? "解挂" : "挂失"}${tail}的卡`)
            }
          >
            <ShieldAlert size={15} />
            {card.status === "lost" ? "申请解除挂失" : "交给 Agent 挂失"}
          </Button>
        </div>
      </section>
      <div className="card-shelf" role="tablist" aria-label="选择卡片">
        {cards.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === card.id}
            className={c.id === card.id ? "is-current" : ""}
            onClick={() => setCurrent(c.id)}
          >
            <BankCardFace card={c} />
          </button>
        ))}
      </div>
      <div className="cards-grid">
        <section className={`panel ${credit ? "is-tall" : ""}`}>
          <SectionHead
            title={`${card.name} · ${card.last4}`}
            description={
              {
                active: "正常使用中",
                frozen: "已临时冻结，所有交易会被拒绝",
                lost: "已挂失，补卡前不能使用",
                processing: "制卡中，预计 5–7 个工作日寄到",
              }[card.status]
            }
          />
          <div className="panel-body">
            {credit ? (
              <div className="credit-overview">
                <Gauge
                  value={used}
                  max={card.limit_cents || 1}
                  color={
                    used / (card.limit_cents || 1) > 0.7 ? "#b23b2e" : "#635bff"
                  }
                  label={`${Math.round((100 * used) / (card.limit_cents || 1))}%`}
                  sub="额度使用率"
                />
                <dl className="field-list">
                  <div>
                    <dt>信用额度</dt>
                    <dd className="tabular">{money(card.limit_cents || 0)}</dd>
                  </div>
                  <div>
                    <dt>已用</dt>
                    <dd className="tabular">{money(used)}</dd>
                  </div>
                  <div>
                    <dt>可用</dt>
                    <dd className="tabular">
                      {money(card.available_cents || 0)}
                    </dd>
                  </div>
                  <div>
                    <dt>核定最高</dt>
                    <dd className="tabular">
                      {money(card.max_limit_cents || 0)}
                    </dd>
                  </div>
                  <div>
                    <dt>账单日 / 还款日</dt>
                    <dd>
                      {card.statement_date?.slice(5)} /{" "}
                      {card.due_date?.slice(5)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="small-note">
                借记卡直接使用活期余额，可用{" "}
                {money(overview?.accounts[0]?.available_cents ?? 0)}。
              </p>
            )}
            {credit && used / (card.limit_cents || 1) > 0.3 && (
              <p className="hint-line">
                使用率超过 30% 时，按时全额还款对信用记录更友好。
              </p>
            )}
            {credit && card.status === "active" && (
              <form
                className="limit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (limit)
                    onAsk(`把尾号${card.last4}的信用卡额度调到${limit}元`);
                }}
              >
                <label htmlFor="limit">调整额度</label>
                <div>
                  <input
                    id="limit"
                    type="number"
                    inputMode="numeric"
                    min={1000}
                    max={(card.max_limit_cents || 0) / 100}
                    step={1000}
                    placeholder={`1,000 – ${((card.max_limit_cents || 0) / 100).toLocaleString()}`}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                  <Button type="submit" disabled={!limit}>
                    交给 Agent
                  </Button>
                </div>
              </form>
            )}
          </div>
        </section>
        <section className="panel">
          <SectionHead
            title="交易限制"
            description="关掉用不到的功能，被盗刷的风险就小一些"
          />
          <ul className="control-list">
            {Object.entries(card.controls || {}).map(([k, on]) => (
              <li key={k}>
                <div>
                  <strong>{controlNames[k]}</strong>
                  <span>{controlHelp[k]}</span>
                </div>
                <span className={`switch-state ${on ? "is-on" : ""}`}>
                  {on ? "已开启" : "已关闭"}
                </span>
                <Button
                  disabled={card.status !== "active"}
                  onClick={() =>
                    onAsk(`${on ? "关闭" : "开通"}${tail}的${controlNames[k]}`)
                  }
                >
                  {on ? "关闭" : "开启"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <SectionHead title="安全操作" />
          <div className="action-grid">
            {card.status === "frozen" ? (
              <button type="button" onClick={() => onAsk(`解冻${tail}的卡`)}>
                <Sun size={18} />
                <strong>解除冻结</strong>
                <span>需要短信验证</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={card.status !== "active"}
                onClick={() => onAsk(`冻结${tail}的卡`)}
              >
                <Snowflake size={18} />
                <strong>临时冻结</strong>
                <span>找不到卡时先冻上，随时可解</span>
              </button>
            )}
            {card.status === "lost" ? (
              <button type="button" onClick={() => onAsk(`解挂${tail}的卡`)}>
                <Unlock size={18} />
                <strong>解除挂失</strong>
                <span>需要短信验证</span>
              </button>
            ) : (
              <button
                type="button"
                className="danger"
                disabled={card.status === "processing"}
                onClick={() => onAsk(`挂失${tail}的卡`)}
              >
                <ShieldAlert size={18} />
                <strong>挂失</strong>
                <span>确认丢失后使用，需要短信验证</span>
              </button>
            )}
            <button
              type="button"
              disabled={card.kind === "virtual" || card.status !== "active"}
              onClick={() => onAsk(`重置${tail}的交易密码`)}
            >
              <KeyRound size={18} />
              <strong>重置交易密码</strong>
              <span>新密码只在验证窗口输入</span>
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
