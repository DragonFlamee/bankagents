import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, LoaderCircle, Square } from "lucide-react";
import { Button, OperationPanel, maskPhone } from "./components";
import { ExecutionDetails } from "./ExecutionDetails";
import { Reveal } from "./motion";
import {
  businessParagraph,
  committedSummary,
  taskPresentation,
  taskTitle,
} from "./taskPresentation";
import { scenarios } from "./scenarios";
import type { Operation, Overview, Plan, Run } from "./types";
export { scenarios } from "./scenarios";

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
  const [message, setMessage] = useState(""),
    [suggestions, setSuggestions] = useState(false),
    [details, setDetails] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    composer = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const taskKey = run?.id || plan?.run_id || plan?.id || "empty";
  useEffect(() => {
    setDetails(false);
  }, [taskKey]);
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
  const state = taskPresentation(plan, run, busy),
    hasTask = !!(plan || run);
  const stopped = ["paused", "handoff", "cancelled"].includes(
    plan?.status || "",
  );
  const operations =
    plan?.nodes.filter(
      (n) =>
        n.operation &&
        ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(
          n.operation.status,
        ),
    ) || [];
  const latest = run?.events[run.events.length - 1];
  const responseStart =
    run?.events.map((e) => e.type).lastIndexOf("response.started") ?? -1;
  const partialParagraphs =
    responseStart < 0
      ? []
      : (run?.events.slice(responseStart + 1) || [])
          .filter(
            (e) =>
              e.type === "response.delta" && typeof e.data.text === "string",
          )
          .map((e) => e.data.text as string);
  const phase = !plan
    ? "正在规划执行步骤"
    : latest?.type.startsWith("response.")
      ? "正在整理业务结果"
      : latest?.data.tool
        ? `正在${({ bills: "分析账单", cards: "查询卡片", balance: "查询余额" } as Record<string, string>)[latest.data.tool] || "执行当前步骤"}`
        : "正在执行任务";
  function prefill(value: string) {
    setMessage(value);
    setSuggestions(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  function submit() {
    if (message.trim() && !busy && !working) {
      onSubmit(message.trim());
      setMessage("");
    }
  }
  return (
    <section
      className={`task-workspace ${hasTask ? "has-task" : "empty-task"}`}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          details &&
          !document.querySelector("dialog[open]")
        ) {
          e.stopPropagation();
          setDetails(false);
          document.getElementById("execution-trigger")?.focus();
        }
      }}
    >
      <div className="task-document">
        <header className="task-heading">
          <h1>
            {hasTask
              ? maskPhone(taskTitle(plan, overview, run?.message))
              : "需要办理什么？"}
          </h1>
          {hasTask && (
            <span
              className={`task-state tone-${state.tone}`}
              role="status"
              data-state={state.code}
            >
              {state.label}
            </span>
          )}
        </header>
        {hasTask && (
          <>
            <div className="execution-disclosure">
              <Button
                id="execution-trigger"
                aria-expanded={details}
                aria-controls="inline-execution"
                onClick={() => setDetails((v) => !v)}
              >
                <ChevronDown
                  size={14}
                  className={
                    details
                      ? "disclosure-chevron is-open"
                      : "disclosure-chevron"
                  }
                />
                查看执行详情
              </Button>
              <Reveal open={details}>
                <div id="inline-execution">
                  <ExecutionDetails
                    key={taskKey}
                    inline
                    open={details}
                    onClose={() => {
                      setDetails(false);
                      requestAnimationFrame(() =>
                        document.getElementById("execution-trigger")?.focus(),
                      );
                    }}
                    plan={plan}
                    run={run}
                    onControl={onControl}
                    working={working}
                  />
                </div>
              </Reveal>
            </div>
            {busy ? (
              <>
                <div className="task-progress" aria-live="polite">
                  <LoaderCircle size={17} className="spin" />
                  <span>{phase}</span>
                  {state.total > 0 && (
                    <span className="step-count">
                      完成 {state.done} / {state.total} 步
                    </span>
                  )}
                </div>
                {partialParagraphs.length > 0 && (
                  <div
                    className="task-result response-stream"
                    data-testid="streaming-answer"
                    aria-label="正在生成的回答"
                    aria-busy="true"
                  >
                    {partialParagraphs.map((p, i) => (
                      <p key={i}>{maskPhone(businessParagraph(p, plan))}</p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="task-result" data-testid="final-answer">
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
                        <li key={n.id}>
                          {(
                            {
                              bills: "账单分析已完成",
                              cards: "卡片查询已完成",
                            } as Record<string, string>
                          )[n.tool] || "部分查询已完成"}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
            {!busy && operations.length > 0 && (
              <section className="task-authorization" aria-label="核对操作">
                {operations.map((n) => (
                  <div key={n.id} className="authorization-item">
                    <h2>
                      {n.tool === "transfer" ? "核对转账信息" : "核对操作信息"}
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
                  onClick={() => {
                    const original = plan?.message || run?.message || "";
                    onNew();
                    prefill(original);
                  }}
                >
                  重新发起
                </Button>
              )}
              {plan?.status === "paused" && (
                <Button
                  kind="primary"
                  onClick={() => onControl("resume")}
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
          </>
        )}
        <div
          className="task-composer"
          ref={composer}
          onKeyDown={(e) => {
            if (e.key === "Escape" && suggestions) {
              e.preventDefault();
              setSuggestions(false);
              trigger.current?.focus();
            }
          }}
        >
          <label htmlFor="message">业务需求</label>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={input}
              id="message"
              aria-label="业务需求"
              placeholder="例如：分析本月账单，看看哪里可以省钱"
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
                  submit();
                }
              }}
            />
            <div className="composer-actions">
              <button
                ref={trigger}
                type="button"
                className="capability-button"
                aria-expanded={suggestions}
                onClick={() => setSuggestions((v) => !v)}
              >
                选择场景
                <ChevronDown size={14} />
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
                  aria-label="发送任务"
                  disabled={!message.trim() || working}
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
          </form>
          <Reveal open={suggestions}>
            <div
              className="scenario-picker"
              ref={picker}
              role="group"
              aria-label="业务场景选择"
              onKeyDown={(e) => {
                const all = Array.from(
                    picker.current?.querySelectorAll<HTMLButtonElement>(
                      "button",
                    ) || [],
                  ),
                  i = all.indexOf(document.activeElement as HTMLButtonElement);
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  all[
                    (i + (e.key === "ArrowDown" ? 1 : -1) + all.length) %
                      all.length
                  ]?.focus();
                }
              }}
            >
              {scenarios.map((s) => (
                <button key={s.name} onClick={() => prefill(s.prompt)}>
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.desc}</small>
                  </span>
                </button>
              ))}
            </div>
          </Reveal>
          <details className="input-help">
            <summary>输入帮助</summary>
            <p>
              Enter 发送，Shift+Enter 换行。场景只填入需求，发送后才开始处理。
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
