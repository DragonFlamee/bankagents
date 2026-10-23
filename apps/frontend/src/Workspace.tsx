import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  LayoutGrid,
  Square,
  X,
} from "lucide-react";
import { BankMark } from "./BankMark";
import { Button } from "./components";
import { ConversationTurn } from "./ConversationTurn";
import { Reveal } from "./motion";
import { scenarios } from "./scenarios";
import type { Operation, Overview, Plan, Run } from "./types";
export { scenarios } from "./scenarios";

export function Workspace({
  turns,
  hasEarlier,
  onEarlier,
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
  turns: Run[];
  hasEarlier: boolean;
  onEarlier: () => unknown;
  activeAction?: { id: string; action: string } | null;
  draft?: { text: string; nonce: number } | null;
  plan: Plan | null;
  run: Run | null;
  overview: Overview | null;
  onSubmit: (message: string) => Promise<boolean>;
  onAction: (op: Operation, action: string) => void;
  onControl: (action: string, planId?: string) => void;
  onStop: () => void;
  busy: boolean;
  working: boolean;
  onNew: (prefill?: string) => void;
}) {
  const [message, setMessage] = useState(""),
    [suggestions, setSuggestions] = useState(false),
    [mode, setMode] = useState<string | null>(null),
    [away, setAway] = useState(false),
    [earlierLoading, setEarlierLoading] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    composer = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    sending = useRef(false);
  const display = turns.length ? turns : run ? [run] : [];
  const hasTask = display.length > 0 || !!plan;
  const selected = scenarios.find((s) => s.name === mode),
    ModeIcon = selected?.icon;
  useEffect(() => {
    if (draft) {
      setMessage(draft.text);
      setMode(scenarios.find((s) => s.prompt === draft.text)?.name || null);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [draft]);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(176, input.current.scrollHeight)}px`;
    }
  }, [message]);
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
  useEffect(() => {
    if (follow.current)
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight;
      });
  }, [display.length, run?.events.length, plan?.status, run?.reply]);
  function prefill(name: string, text: string) {
    setMode(name);
    setMessage(text);
    setSuggestions(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  async function submit() {
    if (!message.trim() || busy || working || sending.current) return;
    sending.current = true;
    follow.current = true;
    try {
      if (await onSubmit(message.trim())) {
        setMessage("");
        setMode(null);
        requestAnimationFrame(() => input.current?.focus());
      }
    } finally {
      sending.current = false;
    }
  }
  async function earlier() {
    const e = scroll.current;
    if (!e || earlierLoading) return;
    const height = e.scrollHeight,
      top = e.scrollTop;
    setEarlierLoading(true);
    try {
      await onEarlier();
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = top + scroll.current.scrollHeight - height;
      });
    } finally {
      setEarlierLoading(false);
    }
  }
  return (
    <section
      className={`task-workspace conversation-workspace ${hasTask ? "has-task" : "empty-task"}`}
    >
      <div
        className="conversation-scroll"
        ref={scroll}
        onScroll={() => {
          const e = scroll.current;
          if (e) {
            follow.current =
              e.scrollHeight - e.scrollTop - e.clientHeight < 100;
            setAway(!follow.current);
          }
        }}
      >
        <div className="conversation-messages">
          {hasEarlier && (
            <Button onClick={earlier} disabled={earlierLoading}>
              {earlierLoading ? "正在读取…" : "查看更早的消息"}
            </Button>
          )}
          {!hasTask && (
            <div className="conversation-welcome">
              <BankMark className="welcome-bank-mark" />
              <h1>今天需要办理什么？</h1>
              <p>直接说你想办的事。查询马上给结果，动钱的操作会先停下来等你确认。</p>
              <div className="welcome-grid">
                {scenarios.map((s) => (
                  <button key={s.name} type="button" onClick={() => prefill(s.name, s.prompt)}>
                    <s.icon size={18} aria-hidden="true" />
                    <strong>{s.name}</strong>
                    <span>“{s.prompt}”</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {display.map((turn, i) => (
            <ConversationTurn
              key={turn.id}
              run={turn}
              plan={turn.id === run?.id ? plan || turn.plan : turn.plan}
              current={i === display.length - 1}
              busy={turn.id === run?.id && busy}
              working={working || busy}
              overview={overview}
              activeAction={activeAction}
              onAction={onAction}
              onControl={onControl}
              onRestart={onNew}
            />
          ))}
          {!display.length && plan && (
            <ConversationTurn
              run={null}
              plan={plan}
              current
              busy={busy}
              working={working || busy}
              overview={overview}
              activeAction={activeAction}
              onAction={onAction}
              onControl={onControl}
              onRestart={onNew}
            />
          )}
        </div>
      </div>
      {away && hasTask && (
        <button
          type="button"
          className="jump-latest icon-button"
          aria-label="回到最新消息"
          onClick={() => {
            follow.current = true;
            scroll.current?.scrollTo({
              top: scroll.current.scrollHeight,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
            });
          }}
        >
          {hasTask && <h1 className="sr-only">银行业务对话</h1>}
          <ArrowDown size={17} />
        </button>
      )}
      <div className="composer-dock">
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
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {selected && (
              <div className="selected-mode" role="status">
                {ModeIcon && <ModeIcon size={14} aria-hidden="true" />}
                <span>{selected.name}</span>
                <button
                  type="button"
                  aria-label="清除已选场景"
                  onClick={() => setMode(null)}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <label htmlFor="message" className="sr-only">
              业务需求
            </label>
            <textarea
              ref={input}
              id="message"
              aria-label="业务需求"
              placeholder={
                hasTask
                  ? "继续提问，或描述下一项业务…"
                  : "例如：分析本月账单，看看哪里可以省钱"
              }
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
                  void submit();
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
                <LayoutGrid size={15} aria-hidden="true" />
                选择场景
                <ChevronDown
                  size={12}
                  className={`disclosure-chevron ${suggestions ? "is-open" : ""}`}
                />
              </button>
              <span className="composer-key-hint" aria-hidden="true">
                Enter 发送
              </span>
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
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </form>
          <div className="scenario-popover">
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
                    i = all.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
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
                  <button
                    type="button"
                    key={s.name}
                    aria-pressed={mode === s.name}
                    onClick={() => prefill(s.name, s.prompt)}
                  >
                    <span className="scenario-icon">
                      <s.icon size={19} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.desc}</small>
                    </span>
                  </button>
                ))}
              </div>
            </Reveal>
          </div>
          <details className="input-help">
            <summary>输入帮助</summary>
            <p>
              Enter发送，Shift+Enter换行。同一对话保留上下文；涉及操作仍需单独确认。
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
