import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Check, ChevronDown, LoaderCircle, AlertTriangle } from "lucide-react";
import { Button, DataDetails, Modal } from "./components";
import { TimelineEntry, TimelineMarker, TimelineRail } from "./motion";
import { labels, money, statuses, time } from "./api";
import { isComplexPlan } from "./taskPresentation";
import type { Plan, Run } from "./types";

const PlanMap = lazy(() =>
  import("./PlanMap").then((m) => ({ default: m.PlanMap })),
);
function InlineDetails({
  children,
  onClose,
  title,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  className: string;
  open: boolean;
}) {
  return (
    <section
      className={`modal ${className} execution-inline`}
      role="region"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="收起执行详情"
        >
          <ChevronDown size={18} />
        </button>
      </div>
      {children}
    </section>
  );
}
class GraphBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        <p>依赖图暂时无法载入，步骤记录仍可查看。</p>
        <Button onClick={this.props.onBack}>返回步骤</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const eventNames: Record<string, string> = {
  "request.received": "收到需求",
  "model.started": "请求规划",
  "model.completed": "规划返回",
  "model.failed": "规划失败",
  "plan.validated": "校验执行计划",
  "plan.created": "建立计划",
  "plan.updated": "更新任务",
  "tool.started": "开始步骤",
  "tool.result": "步骤返回",
  "tool.failed": "步骤失败",
  "authorization.required": "等待授权",
  "operation.started": "处理操作",
  "operation.result": "操作返回",
  "operation.failed": "操作失败",
  "response.started": "整理结果",
  "response.delta": "回答内容更新",
  "response.completed": "结果已整理",
  "response.fallback": "按已核对数据回答",
  "run.settled": "本次执行结束",
  "run.failed": "执行失败",
  "run.cancelled": "已停止",
  "run.interrupted": "执行中断",
  "plan.controlled": "任务控制变更",
  "operator.released": "人工交还任务",
};
function Observation({
  tool,
  result,
}: {
  tool: string;
  result: Record<string, any>;
}) {
  if (tool === "bills")
    return (
      <>
        <dl className="field-list">
          <div>
            <dt>期间支出</dt>
            <dd>{money(result.total_expense_cents)}</dd>
          </div>
          <div>
            <dt>交易记录</dt>
            <dd>{result.transaction_count} 笔</dd>
          </div>
        </dl>
        {result.categories?.map((c: any) => (
          <div className="result-line" key={c.category}>
            <span>{c.category}</span>
            <strong>{money(c.total_cents)}</strong>
          </div>
        ))}
        {result.anomalies?.map((a: any) => (
          <p className="inline-warning" key={a.transaction_id}>
            {money(a.amount_cents)}：{a.reason}。规则提示不代表已证实欺诈。
          </p>
        ))}
      </>
    );
  if (tool === "cards")
    return (
      <>
        {result.cards?.map((c: any) => (
          <p key={c.id}>
            尾号 {c.last4}：{statuses[c.status] || c.status}
          </p>
        ))}
      </>
    );
  if (tool === "balance")
    return (
      <>
        {result.accounts?.map((a: any) => (
          <div className="result-line" key={a.id}>
            <span>{a.name}</span>
            <strong>{money(a.balance_cents)}</strong>
          </div>
        ))}
      </>
    );
  if (tool === "analysis.expression")
    return (
      <p>
        计算结果：{String(result.result ?? result.value ?? "未返回数值")}
        （人民币分）
      </p>
    );
  return <DataDetails data={result} label="查看业务数据" />;
}
export function ExecutionDetails({
  open,
  onClose,
  plan,
  run,
  onControl,
  working,
  inline = false,
}: {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  run: Run | null;
  onControl: (action: string) => void;
  working: boolean;
  inline?: boolean;
}) {
  const Container = inline ? InlineDetails : Modal;
  const [graph, setGraph] = useState(false);
  function toggleGraph() {
    setGraph((g) => !g);
    requestAnimationFrame(() =>
      document
        .querySelector(".execution-dialog .graph-region")
        ?.scrollIntoView({ block: "start" }),
    );
  }
  const stopped = ["paused", "handoff", "cancelled"].includes(
    plan?.status || "",
  );
  const done = plan?.nodes.filter((n) => n.status === "succeeded").length || 0;
  return (
    <Container
      open={open}
      onClose={onClose}
      title="执行详情"
      className={`execution-dialog ${graph ? "graph-dialog" : ""}`}
    >
      <dl className="task-facts">
        <div>
          <dt>创建时间</dt>
          <dd>{time(plan?.created_at || run?.created_at || "", true)}</dd>
        </div>
        {plan && (
          <div>
            <dt>完成步骤</dt>
            <dd>
              {done} / {plan.nodes.length}
            </dd>
          </div>
        )}
      </dl>
      {plan ? (
        <>
          {isComplexPlan(plan) && (
            <Button onClick={toggleGraph}>
              {graph ? "查看步骤" : "打开完整依赖图"}
            </Button>
          )}
          {graph ? (
            <div className="graph-region">
              <GraphBoundary onBack={() => setGraph(false)}>
                <Suspense fallback={<p role="status">正在载入依赖图…</p>}>
                  <PlanMap plan={plan} />
                </Suspense>
              </GraphBoundary>
            </div>
          ) : (
            <div
              className={`plan-nodes ${plan.nodes.length === 1 ? "single-step" : ""}`}
            >
              {plan.nodes.map((n, i) => (
                <TimelineEntry
                  key={n.id}
                  index={i}
                  className={`plan-node ${["awaiting_confirmation", "awaiting_verification", "unknown"].includes(n.status) ? "node-current" : ""} ${n.status === "running" ? "node-running" : ""} ${n.status === "failed" ? "node-failed" : ""}`}
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
                    <div className="step-heading">
                      <strong>{labels[n.tool] || n.tool}</strong>
                      <span>{statuses[n.status] || n.status}</span>
                    </div>
                    {n.error && <p className="inline-error">{n.error}</p>}
                    {n.result && (
                      <details className="business-evidence">
                        <summary>
                          业务结果
                          <ChevronDown size={13} />
                        </summary>
                        <Observation tool={n.tool} result={n.result} />
                      </details>
                    )}
                    {n.operation?.status === "succeeded" &&
                      n.operation.receipt && (
                        <details className="business-evidence">
                          <summary>
                            业务回执
                            <ChevronDown size={13} />
                          </summary>
                          <dl className="field-list">
                            <div>
                              <dt>办理时间</dt>
                              <dd>{time(n.operation.receipt.occurred_at)}</dd>
                            </div>
                            {n.operation.receipt.amount_cents != null && (
                              <div>
                                <dt>金额</dt>
                                <dd>
                                  {money(n.operation.receipt.amount_cents)}
                                </dd>
                              </div>
                            )}
                            {n.operation.receipt.recipient && (
                              <div>
                                <dt>收款人</dt>
                                <dd>{n.operation.receipt.recipient}</dd>
                              </div>
                            )}
                          </dl>
                          <DataDetails
                            data={n.operation.receipt}
                            label="完整回执数据"
                          />
                        </details>
                      )}
                  </div>
                </TimelineEntry>
              ))}
            </div>
          )}
          {plan.answer && (
            <details className="business-evidence">
              <summary>
                完整业务结论与依据
                <ChevronDown size={13} />
              </summary>
              {plan.answer.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <DataDetails data={plan.answer.evidence} label="业务证据" />
            </details>
          )}
          {!["succeeded", "cancelled", "failed"].includes(plan.status) && (
            <details className="task-actions">
              <summary>
                任务操作
                <ChevronDown size={13} />
              </summary>
              <div className="button-row">
                <Button
                  disabled={working || plan.status === "handoff"}
                  onClick={() =>
                    onControl(plan.status === "paused" ? "resume" : "pause")
                  }
                >
                  {plan.status === "paused" ? "继续任务" : "暂停任务"}
                </Button>
                <Button
                  disabled={working || plan.status === "handoff"}
                  onClick={() => onControl("handoff")}
                >
                  转人工
                </Button>
                <Button
                  kind="danger"
                  disabled={
                    working || plan.nodes.some((n) => n.status === "unknown")
                  }
                  onClick={() => onControl("cancel")}
                >
                  取消任务
                </Button>
              </div>
              {plan.status === "handoff" && (
                <p>
                  需由操作员交还任务。
                  <a href="/operator.html" target="_blank" rel="noreferrer">
                    打开人工工作台
                  </a>
                </p>
              )}
            </details>
          )}
        </>
      ) : (
        <p>执行计划尚未建立。</p>
      )}
      <details className="technical-log">
        <summary>
          技术日志
          <ChevronDown size={13} />
        </summary>
        {run?.events
          .filter((e) => e.data?.usage)
          .map((e) => (
            <details className="model-usage" key={e.seq}>
              <summary>模型调用信息</summary>
              <dl className="task-facts">
                <div>
                  <dt>调用阶段</dt>
                  <dd>
                    {e.type === "response.completed" ? "结果整理" : "任务规划"}
                  </dd>
                </div>
                <div>
                  <dt>模型</dt>
                  <dd>{e.data.usage.model || "未返回"}</dd>
                </div>
                <div>
                  <dt>请求编号</dt>
                  <dd>
                    {e.data.usage.request_id ||
                      e.data.usage.completion_id ||
                      "未返回"}
                  </dd>
                </div>
                <div>
                  <dt>输入 Token</dt>
                  <dd>{e.data.usage.prompt_tokens ?? "未返回"}</dd>
                </div>
                <div>
                  <dt>输出 Token</dt>
                  <dd>{e.data.usage.completion_tokens ?? "未返回"}</dd>
                </div>
              </dl>
              <DataDetails data={e.data.usage} label="原始模型元数据" />
            </details>
          ))}
        {run?.events?.length ? (
          <ol className="technical-events">
            {run.events.map((e) => (
              <li key={e.seq}>
                <strong>{eventNames[e.type] || e.type}</strong>
                <time>{time(e.at, true)}</time>
                <DataDetails data={e} label="调用记录" />
              </li>
            ))}
          </ol>
        ) : (
          <p>没有运行事件记录；可核对已保存的任务数据。</p>
        )}
        {plan && (
          <>
            <DataDetails data={plan} label="原始任务数据" />
            {!isComplexPlan(plan) && (
              <Button onClick={toggleGraph}>
                {graph ? "关闭依赖图" : "调试依赖图"}
              </Button>
            )}
          </>
        )}
        {run && (
          <DataDetails
            data={{
              run_id: run.id,
              status: run.status,
              conversation_id: run.conversation_id,
              reply: run.reply,
            }}
            label="运行元数据"
          />
        )}
      </details>
    </Container>
  );
}
