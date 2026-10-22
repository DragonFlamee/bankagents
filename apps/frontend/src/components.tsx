import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { labels, money, statuses, time } from "./api";
import type { Operation, Overview, Plan } from "./types";

export function Button({
  children,
  onClick,
  kind = "secondary",
  disabled = false,
  type = "button",
  title,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <button
      {...rest}
      type={type}
      title={title}
      className={`btn btn-${kind}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={`badge badge-${status === "succeeded" || status === "active" ? "success" : status === "failed" ? "danger" : status === "running" || status === "queued" ? "live" : ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(status || "") ? "warning" : "neutral"}`}
    >
      <span className="badge-dot" />
      {children || statuses[status || ""] || status}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <Check size={19} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function DataDetails({
  data,
  label = "查看数据依据",
}: {
  data: unknown;
  label?: string;
}) {
  return (
    <details className="data-details">
      <summary>
        {label}
        <ChevronDown size={13} />
      </summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}
export function SectionHead({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function TaskRows({
  plans,
  onOpen,
  limit,
}: {
  plans: Plan[];
  onOpen: (p: Plan) => void;
  limit?: number;
}) {
  if (!plans.length)
    return (
      <Empty title="还没有任务记录">从 Agent 工作台提出第一项业务需求。</Empty>
    );
  return (
    <div className="table-scroll">
      <table className="data-table task-table">
        <thead>
          <tr>
            <th>任务</th>
            <th>状态</th>
            <th>完成步骤</th>
            <th>创建时间</th>
            <th>
              <span className="sr-only">打开任务</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.slice(0, limit).map((p) => (
            <tr key={p.id} onClick={() => onOpen(p)}>
              <td>
                <button
                  className="table-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(p);
                  }}
                >
                  {p.message}
                </button>
                <span className="row-sub">
                  {p.nodes.map((n) => labels[n.tool] || n.tool).join(" / ")}
                </span>
              </td>
              <td>
                <Badge status={p.status} />
              </td>
              <td className="tabular">
                {p.nodes.filter((n) => n.status === "succeeded").length}
                <span className="text-muted"> / {p.nodes.length}</span>
              </td>
              <td className="date-cell">{time(p.created_at, true)}</td>
              <td>
                <ArrowRight size={15} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function OperationFields({
  op,
  overview,
}: {
  op: Operation;
  overview: Overview | null;
}) {
  const c = overview?.contacts.find((c) => c.id === op.params.contact_id),
    card = overview?.cards.find((c) => c.id === op.params.card_id);
  const items: [string, ReactNode][] = [];
  if (op.params.contact_id)
    items.push([
      "收款人",
      c ? `${c.name}（${c.phone}）` : String(op.params.contact_id),
    ]);
  if (op.params.amount_cents != null)
    items.push(["金额", money(Number(op.params.amount_cents))]);
  if (op.params.card_id)
    items.push([
      "卡片",
      card ? `尾号 ${card.last4}` : String(op.params.card_id),
    ]);
  if (op.params.subscription_id)
    items.push([
      "订阅",
      (
        {
          "sub-music": "云端音乐",
          "sub-cloud": "云盘空间",
          "sub-video": "星河视频",
        } as Record<string, string>
      )[String(op.params.subscription_id)] || String(op.params.subscription_id),
    ]);
  if (op.params.name) items.push(["目标名称", String(op.params.name)]);
  return (
    <dl className="field-list">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className={k === "金额" ? "amount-emphasis" : ""}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
export function OperationPanel({
  op,
  overview,
  onAction,
  disabled = false,
  stopped = false,
  compact = false,
}: {
  op: Operation;
  overview: Overview | null;
  onAction: (op: Operation, action: string) => void;
  disabled?: boolean;
  stopped?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`operation-panel ${compact ? "compact" : ""}`}>
      <div className="operation-heading">
        <span className={`risk-label ${op.risk === "red" ? "risk-red" : ""}`}>
          {op.risk === "red" ? "红色 · 独立验证" : "黄色 · 本人确认"}
        </span>
        <Badge status={op.status} />
      </div>
      <OperationFields op={op} overview={overview} />
      {op.message && <p className="operation-message">{op.message}</p>}
      {op.receipt && (
        <div className="receipt">
          <div>
            <Check size={15} />
            <strong>业务回执</strong>
          </div>
          <p className="tabular">{op.receipt.id}</p>
          <p>{time(op.receipt.occurred_at, true)}</p>
          <DataDetails data={op.receipt} label="核对完整回执" />
        </div>
      )}
      {["awaiting_confirmation", "awaiting_verification"].includes(
        op.status,
      ) && (
        <>
          <div className="button-row">
            <Button
              kind="primary"
              disabled={disabled || stopped}
              onClick={() => onAction(op, "authorize")}
            >
              {disabled ? <LoaderCircle className="spin" size={14} /> : null}
              {op.risk === "red" ? "核对并进入验证" : "确认办理"}
            </Button>
            <Button
              disabled={disabled || stopped}
              onClick={() => onAction(op, "cancel")}
            >
              取消操作
            </Button>
          </div>
          {stopped && (
            <p className="small-note">
              此任务已暂停、取消或转人工，不能直接授权。
            </p>
          )}
          {!stopped && (
            <p className="small-note">有效期至 {time(op.expires_at, true)}</p>
          )}
        </>
      )}
      {op.status === "unknown" && (
        <Button
          kind="primary"
          disabled={disabled}
          onClick={() => onAction(op, "reconcile")}
        >
          查询原操作，核实结果
        </Button>
      )}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const e = ref.current;
    if (open && !e?.open) e?.showModal();
    if (!open && e?.open) e.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭弹窗">
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
