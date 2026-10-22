import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  TimelineEntry,
  TimelineMarker,
  TimelineRail,
  TraceBody,
} from "./motion";
import {
  ArrowUp,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  LoaderCircle,
  Pause,
  Play,
  Square,
  UserRound,
  Workflow,
  FileText,
  Wallet,
  CreditCard,
  Repeat,
  Target,
  Calculator,
  PanelRightClose,
  PanelRightOpen,
  Expand,
  ListOrdered,
  GitBranch,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  Button,
  Badge,
  DataDetails,
  Empty,
  OperationPanel,
  maskPhone,
} from "./components";
import { Hint } from "./controls";
import { PlanMap } from "./PlanMap";
import { labels, money, statuses, time } from "./api";
import type { Overview, Plan, Run, Operation } from "./types";
const eventNames: Record<string, string> = {
  "request.received": "接收任务目标",
  "model.started": "请求规划器",
  "model.completed": "规划器返回",
  "model.failed": "规划请求失败",
  "plan.validated": "校验工具与执行依赖",
  "plan.created": "建立执行计划",
  "plan.updated": "更新执行计划",
  "tool.started": "调用工具",
  "tool.result": "工具返回结果",
  "tool.failed": "工具执行失败",
  "authorization.required": "等待本人授权",
  "operation.started": "提交授权或核实请求",
  "operation.result": "业务服务返回",
  "operation.failed": "业务操作未完成",
  "response.started": "根据工具结果整理回答",
  "response.completed": "完成结果回答",
  "response.fallback": "根据已核对结果回答",
  "run.settled": "本次执行结束",
  "run.cancelled": "执行已停止",
  "run.failed": "执行未完成",
  "run.interrupted": "执行中断",
  "plan.controlled": "任务控制状态已更新",
  "operator.released": "人工交还任务",
};
export const scenarios = [
  {
    name: "智能转账",
    icon: Wallet,
    prompt: "给李娜转 300 元",
    desc: "联系人消歧、金额核对与分级授权",
  },
  {
    name: "账单洞察",
    icon: FileText,
    prompt: "请你帮我看看我应该在哪里省钱",
    desc: "分类支出、异常提示与有依据的建议",
  },
  {
    name: "卡片管理",
    icon: CreditCard,
    prompt: "查询我的卡片",
    desc: "查询、挂失、解挂及虚拟卡申请",
  },
  {
    name: "订阅管理",
    icon: Repeat,
    prompt: "查询我的订阅",
    desc: "征得同意后查询，取消前再次确认",
  },
  {
    name: "储蓄目标",
    icon: Target,
    prompt: "创建旅行储蓄目标 5000 元",
    desc: "记录目标，不冻结或自动划转资金",
  },
  {
    name: "受限分析",
    icon: Calculator,
    prompt: "用沙箱计算本月平均支出",
    desc: "白名单表达式计算，保留数据依据",
  },
];
function Trace({ run, busy }: { run: Run | null; busy: boolean }) {
  const [manual, setManual] = useState<boolean | null>(null);
  useEffect(() => setManual(null), [run?.id]);
  const open = manual ?? busy;
  const events = run?.events || [],
    latest = events[events.length - 1];
  const usages = events.filter((e) => e.data?.usage);
  return (
    <div className={`trace ${busy ? "trace-live" : ""}`}>
      <button
        className="trace-toggle"
        aria-expanded={open}
        onClick={() => setManual(!open)}
      >
        {busy ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <Workflow size={15} />
        )}
        <span>
          {busy
            ? "正在处理"
            : run?.status === "failed"
              ? "执行未完成"
              : "执行过程"}
          <small>
            {busy
              ? eventNames[latest?.type] || "正在准备"
              : `${events.length} 条执行记录`}
          </small>
        </span>
        <ChevronDown size={15} className={open ? "rotate" : ""} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <TraceBody key="trace-body">
            <div className="trace-body">
              <p className="small-note">
                展示实际规划、工具和授权事件，不展示模型私密思考。
              </p>
              {events.length ? (
                events.map((e) => (
                  <TimelineEntry
                    className={`trace-event ${e.type.endsWith("failed") ? "event-failed" : ""}`}
                    key={e.seq}
                  >
                    <span className="event-marker" />
                    <div>
                      <strong>
                        {eventNames[e.type] || e.type}
                        {e.data.tool
                          ? ` · ${labels[e.data.tool] || e.data.tool}`
                          : ""}
                      </strong>
                      <span>{time(e.at, true)}</span>
                      {e.data.message && (
                        <p>{maskPhone(String(e.data.message))}</p>
                      )}
                      {[
                        "tool.result",
                        "tool.failed",
                        "plan.validated",
                        "operation.result",
                      ].includes(e.type) && (
                        <DataDetails data={e.data} label="查看调用记录" />
                      )}
                    </div>
                  </TimelineEntry>
                ))
              ) : (
                <p className="small-note">
                  此历史同步任务没有运行事件记录，可在右侧查看实际工具结果。
                </p>
              )}
              {usages.map((e) => (
                <div className="usage-row" key={`usage-${e.seq}`}>
                  <strong>
                    {e.type === "response.completed" ? "结果回答" : "任务规划"}{" "}
                    · {e.data.usage.model}
                  </strong>
                  <span>
                    HTTP {e.data.usage.http_status ?? "—"} · 输入{" "}
                    {e.data.usage.prompt_tokens ?? "—"} / 输出{" "}
                    {e.data.usage.completion_tokens ?? "—"} Token
                  </span>
                  <span className="mono">
                    Request ID:{" "}
                    {e.data.usage.request_id ||
                      e.data.usage.completion_id ||
                      "服务商未返回"}
                  </span>
                </div>
              ))}
            </div>
          </TraceBody>
        )}
      </AnimatePresence>
    </div>
  );
}
function ToolResult({
  tool,
  result,
}: {
  tool: string;
  result: Record<string, any>;
}) {
  if (tool === "bills")
    return (
      <>
        <div className="tool-result-summary">
          <span>期间支出</span>
          <strong>{money(result.total_expense_cents || 0)}</strong>
        </div>
        {result.categories?.map((c: any) => (
          <div className="result-line" key={c.category}>
            <span>
              {c.category} · {c.count} 笔
            </span>
            <strong>{money(c.total_cents)}</strong>
          </div>
        ))}
      </>
    );
  if (tool === "balance")
    return (
      <div className="tool-result-summary">
        <span>可用余额</span>
        <strong>
          {money(
            result.total_balance_cents ??
              result.accounts?.reduce(
                (s: number, a: any) => s + a.balance_cents,
                0,
              ) ??
              0,
          )}
        </strong>
      </div>
    );
  return null;
}
export function Workspace({
  activeAction,
  draft,
  plan,
  run,
  overview,
  onSubmit,
  onAction,
  onControl,
  onStop,
  busy,
  working,
  onNew,
}: {
  activeAction?: { id: string; action: string } | null;
  draft?: { text: string; nonce: number } | null;
  plan: Plan | null;
  run: Run | null;
  overview: Overview | null;
  onSubmit: (m: string) => void;
  onAction: (o: Operation, a: string) => void;
  onControl: (a: string) => void;
  onStop: () => void;
  busy: boolean;
  working: boolean;
  onNew: () => void;
}) {
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState(false);
  const [panel, setPanel] = useState(true),
    [wide, setWide] = useState(false),
    [planView, setPlanView] = useState("steps");
  const input = useRef<HTMLTextAreaElement>(null),
    picker = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    composer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (draft) {
      setMessage(draft.text);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [draft]);
  useEffect(() => {
    if (!suggestions) return;
    requestAnimationFrame(() =>
      picker.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    const outside = (e: PointerEvent) => {
      if (!composer.current?.contains(e.target as Node)) setSuggestions(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [suggestions]);
  function prefill(text: string) {
    setMessage(text);
    setSuggestions(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  const answer = plan?.answer;
  const stopped = ["paused", "handoff", "cancelled"].includes(
    plan?.status || "",
  );
  const completed =
    plan?.nodes.filter((n) => n.status === "succeeded").length || 0;
  const awaiting = plan?.nodes.find(
    (n) =>
      n.operation &&
      ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(
        n.operation.status,
      ),
  );
  const bill = plan?.nodes.find(
    (n) => n.tool === "bills" && n.status === "succeeded",
  )?.result;
  function showPlan() {
    setPanel(true);
    setPlanView("steps");
    requestAnimationFrame(() => {
      const panel = document.getElementById("execution-plan");
      const target =
        panel?.querySelector<HTMLElement>(
          ".operation-panel button:not(:disabled),.tool-details summary",
        ) || panel;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
  }
  return (
    <div
      className={`workspace-grid ${!panel ? "plan-hidden" : ""} ${wide ? "plan-wide" : ""}`}
    >
      <section className="workspace-main">
        <div className="workspace-toolbar">
          <div className="workspace-title">
            <Workflow size={18} />
            <h1 className="workspace-page-title">Agent 工作台</h1>
            <span className="mode-caption">可追溯执行</span>
          </div>
          <div className="button-row">
            <Button onClick={onNew} disabled={busy || working}>
              新建任务
            </Button>
            {!panel && (
              <Button onClick={showPlan} data-reopen-plan>
                <PanelRightOpen size={15} />
                执行计划{plan ? ` · ${completed}/${plan.nodes.length}` : ""}
              </Button>
            )}
          </div>
        </div>
        <div
          className={`conversation ${!plan && !run ? "conversation-empty" : ""}`}
        >
          {!plan && !run ? (
            <div className="workspace-welcome">
              <span className="welcome-symbol">
                <Workflow size={29} />
              </span>

              <h2>说出目标，逐步办妥。</h2>
              <p>
                查询、分析或办理业务。每次工具调用都有记录，
                <br className="desktop-only" />
                敏感操作由你核对确认。
              </p>
              <div className="prompt-list">
                {scenarios.slice(0, 3).map((s) => (
                  <button key={s.name} onClick={() => prefill(s.prompt)}>
                    <s.icon size={17} />
                    <span>{s.prompt}</span>
                    <ArrowRight size={15} />
                  </button>
                ))}
                <button
                  onClick={() =>
                    prefill(
                      "先分析本月账单，然后给李娜转 300 元，然后挂失尾号 1024 的卡片",
                    )
                  }
                >
                  <Workflow size={17} />
                  <span>先分析账单，再转账，最后挂失卡片</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="user-message">
                <span>你</span>
                <p>{maskPhone(run?.message || plan?.message || "")}</p>
              </div>
              <div className="agent-response">
                <div className="agent-author">
                  <span className="brand-mark small">迹</span>
                  <strong>拾迹 Agent</strong>
                  {busy && <span className="text-muted">处理中</span>}
                </div>
                <Trace run={run} busy={busy} />
                {busy ? (
                  <div className="answer-loading">
                    <span className="loading-dot" />
                    正在执行任务，结果将显示在这里。
                  </div>
                ) : (
                  <div className="final-answer" data-testid="final-answer">
                    <h2>{answer?.title || "本次任务"}</h2>
                    {bill && (
                      <div
                        className="business-summary"
                        aria-label="已核实账单摘要"
                      >
                        <div>
                          <span>所选期间支出</span>
                          <strong>
                            {money(bill.total_expense_cents || 0)}
                          </strong>
                          <small>含转账 · 以本次保存的观测为准</small>
                        </div>
                        <div>
                          <span>交易记录</span>
                          <strong>
                            {bill.transaction_count || 0} <small>笔</small>
                          </strong>
                          <small>
                            {bill.categories?.length || 0} 个支出分类
                          </small>
                        </div>
                      </div>
                    )}
                    {awaiting && (
                      <div className="attention-strip">
                        <span>
                          <ShieldCheck size={15} />{" "}
                          {awaiting.operation?.status === "unknown"
                            ? "操作结果尚未核实，先查询原操作。"
                            : "有业务等待你核对，尚未提交成功。"}
                        </span>
                        <Button onClick={showPlan}>
                          {awaiting.operation?.status === "unknown"
                            ? "查看核实入口"
                            : "核对待办操作"}
                        </Button>
                      </div>
                    )}
                    {plan?.status === "failed" && (
                      <div className="attention-strip">
                        <span>
                          <AlertTriangle size={15} />{" "}
                          本次未取得完整成功结果。先核对工具记录和原操作状态，再决定下一步。
                        </span>
                        <Button onClick={showPlan}>查看执行记录</Button>
                      </div>
                    )}
                    {answer?.paragraphs?.length ? (
                      answer.paragraphs.map((p, i) => (
                        <p key={i}>{maskPhone(p)}</p>
                      ))
                    ) : (
                      <p>
                        {run?.reply ||
                          ([
                            "awaiting_confirmation",
                            "awaiting_verification",
                          ].includes(plan?.status || "")
                            ? "请在授权区域核对业务信息，确认后继续办理。"
                            : plan?.status === "clarification"
                              ? "请补充更明确的联系人、金额或业务需求。"
                              : "当前没有可确认的业务结论，请查看执行记录与工具状态。")}
                      </p>
                    )}
                    {answer?.evidence?.length ? (
                      <DataDetails
                        data={answer.evidence}
                        label="查看回答依据"
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div
          className="composer-wrap"
          ref={composer}
          onKeyDown={(e) => {
            if (e.key === "Escape" && suggestions) {
              e.preventDefault();
              setSuggestions(false);
              trigger.current?.focus();
            }
          }}
        >
          <label htmlFor="message">
            {plan || run ? "继续描述需求" : "你的业务目标"}
          </label>
          {suggestions && (
            <div
              className="scenario-picker"
              ref={picker}
              role="group"
              aria-label="业务场景选择"
              onKeyDown={(e) => {
                const buttons = Array.from(
                    picker.current?.querySelectorAll<HTMLButtonElement>(
                      "button",
                    ) || [],
                  ),
                  index = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSuggestions(false);
                  trigger.current?.focus();
                } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  buttons[
                    (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                      buttons.length
                  ]?.focus();
                }
              }}
            >
              {scenarios.map((s) => (
                <button
                  key={s.name}
                  onClick={() => {
                    prefill(s.prompt);
                  }}
                >
                  <s.icon size={17} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.desc}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
              <p>理财交易尚未实现；当前仅支持以上模拟业务。</p>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (message.trim() && !busy && !working) {
                onSubmit(message.trim());
                setMessage("");
              }
            }}
          >
            <textarea
              ref={input}
              id="message"
              aria-label="业务需求"
              placeholder="例如：分析本月账单，告诉我哪里可以省钱…"
              value={message}
              maxLength={2000}
              rows={2}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (message.trim() && !busy && !working) {
                    onSubmit(message.trim());
                    setMessage("");
                  }
                }
              }}
            />
            <div className="composer-actions">
              <button
                ref={trigger}
                type="button"
                className={`capability-button ${suggestions ? "selected" : ""}`}
                aria-expanded={suggestions}
                onClick={() => setSuggestions(!suggestions)}
              >
                <Workflow size={14} />
                六个业务场景
                <ChevronDown size={13} />
              </button>
              {busy ? (
                <Button
                  onClick={onStop}
                  disabled={!run || run.status === "cancelling"}
                >
                  <Square size={13} />
                  停止执行
                </Button>
              ) : (
                <button
                  type="submit"
                  className="send-button"
                  disabled={!message.trim() || working}
                  aria-label="发送任务"
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
          </form>
          <div className="composer-note">
            <span>仅模拟账户 · 验证码在独立窗口输入</span>
            <span className="shortcut-note">
              <kbd>Enter</kbd> 发送 · <kbd>Shift Enter</kbd> 换行
            </span>
          </div>
        </div>
      </section>
      {panel && (
        <aside
          className="execution-panel"
          id="execution-plan"
          aria-label="本次执行计划"
          tabIndex={-1}
        >
          <div className="execution-head">
            <h2>执行计划</h2>
            <div className="button-row">
              <Hint label="切换标准 / 宽执行面板">
                <button
                  className="icon-button"
                  aria-label="切换执行面板宽度"
                  aria-pressed={wide}
                  onClick={() => setWide(!wide)}
                >
                  <Expand size={14} />
                </button>
              </Hint>
              <Hint label="收起执行计划">
                <button
                  className="icon-button"
                  aria-label="收起执行计划"
                  onClick={() => {
                    setPanel(false);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLButtonElement>("[data-reopen-plan]")
                        ?.focus(),
                    );
                  }}
                >
                  <PanelRightClose size={15} />
                </button>
              </Hint>
            </div>
          </div>
          {plan ? (
            <>
              <div className="plan-overview">
                <div>
                  <strong>
                    已完成 {completed} / {plan.nodes.length} 步
                  </strong>
                  <Badge status={plan.status} />
                </div>
                <progress
                  value={completed}
                  max={Math.max(1, plan.nodes.length)}
                  aria-label="实际已完成步骤"
                />
              </div>
              <p className="execution-caption">
                任务 {plan.id.slice(0, 12)}
                <br />
                {time(plan.created_at, true)}
              </p>
              <div
                className="execution-tabs"
                role="group"
                aria-label="计划显示方式"
              >
                <button
                  aria-pressed={planView === "steps"}
                  onClick={() => setPlanView("steps")}
                >
                  <ListOrdered size={14} />
                  步骤
                </button>
                <button
                  aria-pressed={planView === "graph"}
                  onClick={() => setPlanView("graph")}
                >
                  <GitBranch size={14} />
                  依赖图
                </button>
              </div>
              {planView === "graph" ? (
                <PlanMap plan={plan} />
              ) : (
                <div className="plan-nodes" key={plan.id}>
                  {plan.nodes.map((n, i) => (
                    <TimelineEntry
                      index={i}
                      className={`plan-node ${["awaiting_confirmation", "awaiting_verification", "unknown"].includes(n.status) ? "node-current" : ""} ${n.status === "running" ? "node-running" : ""} ${n.status === "failed" ? "node-failed" : ""}`}
                      key={n.id}
                    >
                      {i < plan.nodes.length - 1 && (
                        <TimelineRail complete={n.status === "succeeded"} />
                      )}
                      <TimelineMarker status={n.status} paused={stopped}>
                        {n.status === "succeeded" ? (
                          <Check size={13} />
                        ) : n.status === "running" && !stopped ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : n.status === "failed" ? (
                          <AlertTriangle size={12} />
                        ) : (
                          i + 1
                        )}
                      </TimelineMarker>
                      <div className="node-content">
                        <strong>{labels[n.tool] || n.tool}</strong>
                        <span className="node-meta">
                          {statuses[n.status] || n.status} ·{" "}
                          {n.depends_on.length
                            ? `依赖 ${n.depends_on.join("、")}`
                            : "可独立执行"}
                        </span>
                        {n.result && (
                          <details className="tool-details">
                            <summary>
                              工具结果
                              <ChevronDown size={12} />
                            </summary>
                            <ToolResult tool={n.tool} result={n.result} />
                            <DataDetails
                              data={n.result}
                              label="原始数据与来源"
                            />
                          </details>
                        )}
                        {n.error && (
                          <p className="inline-error">
                            {typeof n.error === "string"
                              ? n.error
                              : JSON.stringify(n.error)}
                          </p>
                        )}
                        {n.operation && (
                          <OperationPanel
                            pendingAction={
                              activeAction?.id === n.operation.id
                                ? activeAction.action
                                : undefined
                            }
                            compact
                            op={n.operation}
                            overview={overview}
                            onAction={onAction}
                            stopped={stopped}
                            disabled={working}
                          />
                        )}
                      </div>
                    </TimelineEntry>
                  ))}
                </div>
              )}
              {planView === "graph" && awaiting && (
                <div className="plan-controls">
                  <Button onClick={showPlan}>返回步骤，核对待办操作</Button>
                </div>
              )}
              <div className="plan-controls">
                {!["succeeded", "cancelled", "failed"].includes(
                  plan.status,
                ) && (
                  <>
                    <Button
                      disabled={working || plan.status === "handoff"}
                      onClick={() =>
                        onControl(plan.status === "paused" ? "resume" : "pause")
                      }
                    >
                      {plan.status === "paused" ? (
                        <Play size={13} />
                      ) : (
                        <Pause size={13} />
                      )}{" "}
                      {plan.status === "paused" ? "继续任务" : "暂停"}
                    </Button>
                    <Button
                      disabled={working || plan.status === "handoff"}
                      onClick={() => onControl("handoff")}
                    >
                      <UserRound size={13} />
                      转人工
                    </Button>
                    <Button
                      kind="danger"
                      disabled={working}
                      onClick={() => onControl("cancel")}
                    >
                      取消任务
                    </Button>
                  </>
                )}
                {plan.status === "handoff" && (
                  <p className="small-note">
                    须由独立操作员交还控制权后继续。
                    <a href="/operator.html" target="_blank">
                      打开人工工作台 ↗
                    </a>
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="plan-empty">
              <span className="plan-empty-icon">
                <GitBranch size={20} />
              </span>
              <h3>{busy ? "正在建立执行计划" : "等待你的业务目标"}</h3>
              <p>发出需求后，这里显示实际工具、依赖和每一步的业务状态。</p>
              <ol>
                <li>
                  <b>1</b>
                  <span>
                    <strong>理解与规划</strong>
                    <small>校验工具、参数和依赖</small>
                  </span>
                </li>
                <li>
                  <b>2</b>
                  <span>
                    <strong>工具执行与观察</strong>
                    <small>查询结果和数据来源可核对</small>
                  </span>
                </li>
                <li>
                  <b>3</b>
                  <span>
                    <strong>授权与交付</strong>
                    <small>敏感操作确认后才执行</small>
                  </span>
                </li>
              </ol>
              <p>此处是流程说明，尚未创建或执行任务。</p>
            </div>
          )}
          <div className="execution-footer">
            <Clock size={13} />
            <span>执行、授权与回执均留存记录</span>
          </div>
        </aside>
      )}
    </div>
  );
}
