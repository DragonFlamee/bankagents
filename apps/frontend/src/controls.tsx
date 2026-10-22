import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Search, ArrowUpRight, CornerDownLeft } from "lucide-react";
import { Modal } from "./components";

export function Hint({
  label,
  children,
  block = false,
}: {
  label: string;
  children: ReactElement<any>;
  block?: boolean;
}) {
  const id = useId();
  return (
    <span className={`hint ${block ? "hint-block" : ""}`}>
      {cloneElement(children, { "aria-describedby": id })}
      <span id={id} role="tooltip" className="hint-text">
        {label}
      </span>
    </span>
  );
}
export function Skeleton({
  metric = false,
  label = "正在读取业务数据",
}: {
  metric?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`skeleton ${metric ? "metric" : ""}`}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
export function ViewTabs({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string; count?: number }[];
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="tab-bar"
      role="tablist"
      aria-label={label}
      ref={ref}
      onKeyDown={(e) => {
        const index = items.findIndex((i) => i.id === value);
        let next = index;
        if (e.key === "ArrowRight") next = (index + 1) % items.length;
        else if (e.key === "ArrowLeft")
          next = (index - 1 + items.length) % items.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = items.length - 1;
        else return;
        e.preventDefault();
        onChange(items[next].id);
        ref.current
          ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
          [next]?.focus();
      }}
    >
      {items.map((i) => (
        <button
          role="tab"
          key={i.id}
          aria-selected={i.id === value}
          tabIndex={i.id === value ? 0 : -1}
          className={i.id === value ? "selected" : ""}
          onClick={() => onChange(i.id)}
        >
          {i.label}
          {i.count != null && <span>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}
export interface Command {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
  action: () => void;
}
export function CommandMenu({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  const result = commands.filter((c) =>
      `${c.label} ${c.detail}`.toLowerCase().includes(query.toLowerCase()),
    ),
    listId = useId();
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>("[aria-selected=true]")
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  function choose(c: Command) {
    if (c.disabled) return;
    onClose();
    c.action();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="搜索与快捷操作"
      subtitle="打开页面、查找历史任务或预填需求。此处不会自动办理业务。"
    >
      <div className="command-search-row">
        <Search size={18} />
        <input
          ref={input}
          className="command-search"
          role="combobox"
          aria-label="搜索页面、任务与场景"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            result[index] ? `${listId}-${index}` : undefined
          }
          autoComplete="off"
          placeholder="搜索页面、任务与场景…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((index + 1) % Math.max(1, result.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex(
                (index - 1 + result.length) % Math.max(1, result.length),
              );
            } else if (e.key === "Home") {
              e.preventDefault();
              setIndex(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setIndex(Math.max(0, result.length - 1));
            } else if (e.key === "Enter" && result[index]) {
              e.preventDefault();
              choose(result[index]);
            }
          }}
        />
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="搜索结果"
        className="command-results"
        ref={list}
      >
        {result.length ? (
          result.map((c, i) => (
            <button
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={index === i}
              aria-disabled={c.disabled || undefined}
              className="command-option"
              tabIndex={-1}
              onMouseMove={() => setIndex(i)}
              onClick={() => choose(c)}
            >
              <Search size={15} />
              <span>
                <strong>{c.label}</strong>
                <small>
                  {c.detail}
                  {c.disabled ? " · 当前任务处理中" : ""}
                </small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))
        ) : (
          <p className="small-note command-empty">
            没有匹配项。试试“转账”“审批”或任务中的关键词。
          </p>
        )}
      </div>
      <div className="command-footer">
        <span>
          <kbd>↑ ↓</kbd> 选择
        </span>
        <span>
          <kbd>Enter</kbd> 打开
        </span>
        <span>
          <kbd>Esc</kbd> 关闭
        </span>
        <CornerDownLeft size={13} />
      </div>
    </Modal>
  );
}
