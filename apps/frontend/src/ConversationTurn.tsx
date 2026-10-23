import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock3, LoaderCircle } from "lucide-react";
import { BankMark } from "./BankMark";
import { Button, OperationPanel, maskPhone } from "./components";
import { ExecutionDetails } from "./ExecutionDetails";
import { TurnVisuals } from "./ResultVisual";
import { Reveal } from "./motion";
import {
  businessParagraph,
  committedSummary,
  taskPresentation,
} from "./taskPresentation";
import { labels, statuses } from "./api";
import { scenarios } from "./scenarios";
import type { Operation, Overview, Plan, Run } from "./types";

export function ConversationTurn({
  run,
  plan = run?.plan || null,
  current,
  busy,
  working,
  overview,
  activeAction,
  onAction,
  onControl,
  onRestart,
}: {
  run: Run | null;
  plan?: Plan | null;
  current: boolean;
  busy: boolean;
  working: boolean;
  overview: Overview | null;
  activeAction?: { id: string; action: string } | null;
  onAction: (op: Operation, action: string) => void;
  onControl: (action: string, planId?: string) => void;
  onRestart: (message: string) => void;
}) {
  const [details, setDetails] = useState(false),
    [now, setNow] = useState(Date.now());
  const state = taskPresentation(plan, run, busy);
  const id = run?.id || plan!.id,
    triggerId = current ? "execution-trigger" : `execution-${id}`;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const elapsed = Math.max(
    0,
    Math.floor(
      ((busy ? now : Date.parse(run?.updated_at || plan?.created_at || "")) -
        Date.parse(run?.created_at || plan?.created_at || "")) /
        1000,
    ),
  );
  const elapsedLabel = Number.isFinite(elapsed)
    ? elapsed >= 60
      ? `${Math.floor(elapsed / 60)}分${elapsed % 60}秒`
      : `${elapsed}秒`
    : "";
  const start =
    run?.events.map((e) => e.type).lastIndexOf("response.started") ?? -1;
  const partial =
    start < 0
      ? []
      : (run?.events.slice(start + 1) || [])
          .filter(
            (e) =>
              e.type === "response.delta" && typeof e.data.text === "string",
          )
          .map((e) => e.data.text as string);
  const last = run?.events.at(-1);
  const phase = !plan
    ? "正在理解需求，规划执行步骤"
    : last?.type.startsWith("response.")
      ? "正在核对依据，整理回答"
      : last?.type === "authorization.required"
        ? "正在准备操作确认"
        : last?.data.tool
          ? `正在${labels[last.data.tool] || "执行当前步骤"}`
          : "正在执行任务";
  const operations =
    plan?.nodes.filter(
      (n) =>
        n.operation &&
        ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(
          n.operation.status,
        ),
    ) || [];
  const stopped = ["paused", "handoff", "cancelled"].includes(
    plan?.status || "",
  );
  const tool = plan?.nodes.some((n) => n.tool === "merchant.order")
    ? "merchant.order"
    : plan?.nodes.length === 1
      ? plan.nodes[0].tool
      : "";
  const scenario = scenarios.find(
    (s) =>
      (
        ({
          transfer: "转账",
          "transfer.schedule": "预约转账",
          "split.create": "AA 收款",
          bills: "账单洞察",
          cards: "卡片管理",
          "card.report_lost": "卡片管理",
          "card.unlock": "卡片管理",
          "card.virtual": "卡片管理",
          "card.freeze": "卡片管理",
          "card.unfreeze": "卡片管理",
          "card.limit": "卡片管理",
          "card.controls": "卡片管理",
          "card.apply": "卡片管理",
          "card.pin_reset": "卡片管理",
          "subscriptions.get": "订阅扣费",
          "subscriptions.cancel": "订阅扣费",
          "subscriptions.detect": "订阅扣费",
          "subscriptions.remind": "订阅扣费",
          "wealth.products": "理财",
          "wealth.profile": "理财",
          "wealth.holdings": "理财",
          "wealth.subscribe": "理财",
          "wealth.redeem": "理财",
          "merchant.order": "生日安排",
        }) as Record<string, string>
      )[tool] === s.name,
  );
  const Icon = scenario?.icon;
  const close = () => {
    setDetails(false);
    document.getElementById(triggerId)?.focus({ preventScroll: true });
  };
  return (
    <article
      className={`conversation-turn ${current ? "current-turn" : "past-turn"}`}
      data-run-id={id}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          details &&
          !document.querySelector("dialog[open]")
        ) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="user-message-row">
        <div className="user-message">
          {maskPhone(run?.message || plan?.message || "")}
        </div>
      </div>
      <div className="assistant-message">
        <BankMark className="agent-mark" />
        <div className="assistant-content">
          <div className="assistant-byline">
            <strong>TraceBank</strong>
            {Icon && (
              <span className="turn-mode">
                <Icon size={13} aria-hidden="true" />
                {scenario!.name}
              </span>
            )}
            <div className="task-heading">
              <span
                className={`task-state tone-${state.tone}`}
                role="status"
                data-state={state.code}
              >
                {state.label}
              </span>
            </div>
          </div>
          <div className="execution-disclosure">
            <button
              id={triggerId}
              type="button"
              className={`workflow-trigger ${busy ? "is-thinking" : ""}`}
              aria-expanded={details}
              aria-controls={`inline-${id}`}
              aria-label={current ? "查看执行详情" : "查看这轮执行详情"}
              onClick={() => setDetails((v) => !v)}
            >
              {busy ? (
                <span className="thinking-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : state.code === "succeeded" ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Clock3 size={14} aria-hidden="true" />
              )}
              <span className={busy ? "task-progress" : "workflow-label"}>
                {busy ? phase : "查看执行过程"}
              </span>
              <span className="workflow-duration" aria-hidden="true">
                {elapsedLabel}
              </span>
              <ChevronDown
                size={13}
                className={`disclosure-chevron ${details ? "is-open" : ""}`}
                aria-hidden="true"
              />
            </button>
            {busy && !details && plan && (
              <div className="live-tool-preview" aria-label="当前工具执行">
                {plan.nodes
                  .filter((n) => n.status !== "pending")
                  .slice(-3)
                  .map((n) => (
                    <div key={n.id}>
                      <span className={`tool-state state-${n.status}`}>
                        {n.status === "succeeded" ? (
                          <Check size={12} />
                        ) : (
                          <LoaderCircle
                            size={12}
                            className={n.status === "running" ? "spin" : ""}
                          />
                        )}
                      </span>
                      <span>{labels[n.tool] || "业务步骤"}</span>
                      <small>{statuses[n.status] || n.status}</small>
                    </div>
                  ))}
              </div>
            )}
            <Reveal open={details}>
              <div id={`inline-${id}`}>
                <ExecutionDetails
                  inline
                  open={details}
                  onClose={close}
                  plan={plan}
                  run={run}
                  onControl={(a) => onControl(a, plan?.id)}
                  working={working}
                />
              </div>
            </Reveal>
          </div>
          {busy ? (
            partial.length > 0 && (
              <div
                className="task-result response-stream"
                data-testid={
                  current ? "streaming-answer" : "previous-streaming-answer"
                }
                aria-label="正在生成的回答"
                aria-busy="true"
              >
                {partial.map((p, i) => (
                  <p key={i}>{maskPhone(businessParagraph(p, plan))}</p>
                ))}
              </div>
            )
          ) : (
            <div
              className="task-result"
              data-testid={current ? "final-answer" : "previous-answer"}
            >
              {state.summary && (
                <p className={`result-notice tone-${state.tone}`}>
                  {state.summary}
                </p>
              )}
              {["partial", "cancelled"].includes(state.code) &&
                state.committed.length > 0 && (
                  <section
                    className="completed-business"
                    aria-label="已完成的操作"
                  >
                    <h2>已完成的操作</h2>
                    <ul>
                      {state.committed.map((n) => (
                        <li key={n.id}>{committedSummary(n)}</li>
                      ))}
                    </ul>
                    <p>已完成的交易不会因取消任务而撤销。</p>
                  </section>
                )}
              {!["cancelled", "partial", "unknown"].includes(state.code) &&
                !(
                  operations.length &&
                  !plan?.nodes.some((n) => n.result || n.operation?.receipt)
                ) &&
                (plan?.answer?.paragraphs?.length
                  ? plan.answer.paragraphs.map((p, i) => (
                      <p key={i}>{maskPhone(businessParagraph(p, plan))}</p>
                    ))
                  : !operations.length && (
                      <p>
                        {maskPhone(
                          run?.reply ||
                            (state.code === "failed"
                              ? "未取得可确认的业务结果。请查看执行详情。"
                              : "请补充业务需求，或查看已保存的执行记录。"),
                        )}
                      </p>
                    ))}
              {state.code === "partial" && !state.committed.length && (
                <ul className="completed-steps">
                  {plan?.nodes
                    .filter((n) => n.status === "succeeded")
                    .map((n) => (
                      <li key={n.id}>{labels[n.tool] || "部分查询"}已完成</li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {!busy && <TurnVisuals plan={plan} overview={overview} />}
          {!busy && operations.length > 0 && (
            <section className="task-authorization" aria-label="核对操作">
              {operations.map((n) => (
                <div key={n.id} className="authorization-item">
                  <h2>
                    {n.tool === "transfer" ? "核对转账信息" : `核对：${labels[n.tool] || "操作信息"}`}
                  </h2>
                  <OperationPanel
                    showStatus={false}
                    op={n.operation!}
                    overview={overview}
                    onAction={onAction}
                    stopped={stopped}
                    disabled={working}
                    pendingAction={
                      activeAction?.id === n.operation!.id
                        ? activeAction.action
                        : undefined
                    }
                  />
                </div>
              ))}
            </section>
          )}
          <div className="task-next-actions">
            {state.canRestart && (
              <Button
                disabled={working}
                onClick={() => onRestart(plan?.message || run?.message || "")}
              >
                重新发起
              </Button>
            )}
            {plan?.status === "paused" && (
              <Button
                kind="primary"
                onClick={() => onControl("resume", plan.id)}
                disabled={working}
              >
                继续任务
              </Button>
            )}
            {plan?.status === "handoff" && (
              <a href="/operator.html" target="_blank" rel="noreferrer">
                打开人工工作台
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
