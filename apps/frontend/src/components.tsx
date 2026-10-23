import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { animate } from "motion/react";
import { useReducedMotionPreference } from "./motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { labels, money, statuses, time } from "./api";
import type { Operation, Overview, Plan } from "./types";
import { paymentAccount, taskPresentation } from "./taskPresentation";
import {
  items as catalogItems,
  products as catalogProducts,
  controlNames,
  subscriptionNames,
} from "./catalog";

export const maskPhone = (value: string) =>
  value.replace(/(\d{3})\d{4}(\d{4})/g, "$1••••$2");

export function Button({
  children,
  onClick,
  kind = "secondary",
  disabled = false,
  type = "button",
  title,
  loading = false,
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
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      {...rest}
      type={type}
      title={title}
      className={`btn btn-${kind}`}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <LoaderCircle size={15} className="spin" aria-hidden="true" />
      )}
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
      <pre>
        {JSON.stringify(
          data,
          (key, value) =>
            /^(phone|mobile|telephone)$/i.test(key) && typeof value === "string"
              ? maskPhone(value)
              : value,
          2,
        )}
      </pre>
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
                  {maskPhone(p.message)}
                </button>
              </td>
              <td>
                <span
                  className={`task-state tone-${taskPresentation(p, null).tone}`}
                >
                  {taskPresentation(p, null).label}
                </span>
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
const fullDate = (d: string) => {
  const [y, m, day] = String(d).split("-");
  return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`;
};
export function OperationFields({
  op,
  overview,
}: {
  op: Operation;
  overview: Overview | null;
}) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => setReveal(false), [op.id]);
  const p = op.params;
  const c = overview?.contacts.find((c) => c.id === p.contact_id),
    card = overview?.cards.find((c) => c.id === p.card_id);
  const cardLabel = card
    ? `${card.name || "银行卡"} · 尾号 ${card.last4}`
    : "卡片信息未加载";
  const items: [string, ReactNode][] = [];
  const isRef = (v: unknown) => typeof v === "string" && v.startsWith("$");
  if (["transfer", "transfer.schedule"].includes(op.tool))
    items.push([
      "付款账户",
      paymentAccount(overview)?.name || "账户信息未加载",
    ]);
  if (p.contact_id && op.tool !== "merchant.order")
    items.push([
      "收款人",
      c ? (
        <>
          {c.name}（{reveal ? c.phone : maskPhone(c.phone)}）
          <button
            className="reveal-button"
            aria-pressed={reveal}
            aria-label={reveal ? "隐藏完整收款信息" : "显示完整收款信息"}
            onClick={() => setReveal(!reveal)}
          >
            {reveal ? <EyeOff size={12} /> : <Eye size={12} />}{" "}
            {reveal ? "隐藏号码" : "展开核对号码"}
          </button>
        </>
      ) : (
        "收款人信息未加载"
      ),
    ]);
  if (op.tool === "merchant.order") {
    const item = catalogItems[String(p.item_id)];
    items.push(["商品", item ? `${item.merchant} · ${item.name}` : String(p.item_id)]);
    if (item) items.push(["金额", money(item.price_cents)]);
    items.push(["收货人", c ? c.name : "联系人信息未加载"]);
    items.push(["下单付款日", fullDate(String(p.execute_date))]);
    items.push([
      "付款来源",
      p.hold_id ? "前一步锁定的资金（不够时不会动用其他余额）" : "活期可用余额",
    ]);
  }
  if (p.amount_cents != null && !["merchant.order", "wealth.redeem"].includes(op.tool))
    items.push([op.tool === "funds.hold" ? "锁定金额" : "金额", money(Number(p.amount_cents))]);
  if (op.tool === "transfer.schedule") {
    items.push(["执行日期", fullDate(String(p.execute_date))]);
    items.push(["重复", p.repeat === "monthly" ? "每月同一天" : "仅这一次"]);
  }
  if (op.tool === "split.create") {
    const ids = (p.contact_ids as unknown as string[]) || [];
    const names = ids.map((id) => overview?.contacts.find((c) => c.id === id)?.name || id);
    const people = ids.length + (p.include_self === false ? 0 : 1);
    const base = Math.floor(Number(p.total_cents) / people);
    items.push(["总金额", money(Number(p.total_cents))]);
    items.push(["向谁收款", names.join("、")]);
    items.push(["每人应付", `${money(base)}${p.include_self === false ? "" : "（零头算你的）"}`]);
    if (p.include_self !== false)
      items.push(["你承担", money(Number(p.total_cents) - base * ids.length)]);
    if (p.note) items.push(["事由", String(p.note)]);
  }
  if (op.tool === "funds.hold") {
    items.push(["用途", String(p.name)]);
    items.push(["自动释放", fullDate(String(p.release_date))]);
    const acc = overview?.accounts[0];
    if (acc)
      items.push([
        "锁定后可用",
        money((acc.available_cents ?? acc.balance_cents) - Number(p.amount_cents)),
      ]);
  }
  if (op.tool === "funds.release") {
    const h = overview?.holds?.find((h) => h.id === p.hold_id);
    items.push(["锁定资金", h ? `${h.name} · ${money(h.amount_cents - h.used_cents)}` : String(p.hold_id)]);
  }
  if (p.card_id && !isRef(p.card_id)) items.push(["卡片", cardLabel]);
  if (op.tool === "card.limit" && card) {
    items.push(["当前额度", money(card.limit_cents || 0)]);
    items.push([
      "调整为",
      `${money(Number(p.limit_cents))}（${Number(p.limit_cents) > (card.limit_cents || 0) ? "调高，需要短信验证" : "调低"}）`,
    ]);
  }
  if (op.tool === "card.controls") {
    items.push(["设置项", controlNames[String(p.control)] || String(p.control)]);
    items.push(["调整为", p.enabled ? "开启（放开限制，需要短信验证）" : "关闭"]);
  }
  if (op.tool === "card.apply")
    items.push(["卡种", p.card_type === "credit" ? "信用卡（需审批额度）" : "借记卡"]);
  if (op.tool === "card.pin_reset")
    items.push(["新密码", "在短信验证窗口里输入，不经过对话"]);
  if (op.tool === "wealth.subscribe") {
    const prod = catalogProducts[String(p.product_id)];
    items.push(["产品", prod ? `${prod.name} · R${prod.risk}` : String(p.product_id)]);
    items.push(["风险提示", "理财非存款，产品有风险，投资须谨慎"]);
  }
  if (op.tool === "wealth.redeem") {
    const h = overview?.holdings?.find((h) => h.id === p.holding_id);
    items.push(["持仓", h ? h.product_name : String(p.holding_id)]);
    items.push([
      "赎回本金",
      p.amount_cents != null ? money(Number(p.amount_cents)) : h ? `全部 ${money(h.principal_cents)}` : "全部",
    ]);
    if (h) items.push(["到账方式", h.liquidity]);
  }
  if (p.subscription_id)
    items.push([
      "订阅",
      subscriptionNames[String(p.subscription_id)] || String(p.subscription_id),
    ]);
  if (op.tool === "subscriptions.remind")
    items.push(["提醒时间", `每次扣费前 ${p.days_before} 天`]);
  if (p.schedule_id) {
    const sch = overview?.schedules?.find((s) => s.id === p.schedule_id);
    items.push([
      "预约",
      sch ? `${sch.kind === "transfer" ? "转账" : sch.item?.name || "订购"} · ${fullDate(sch.execute_date)}` : String(p.schedule_id),
    ]);
  }
  if (op.tool === "goals.create" && p.name) items.push(["目标名称", String(p.name)]);
  return (
    <dl className="field-list">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className={["金额", "锁定金额", "总金额"].includes(k) ? "amount-emphasis" : ""}>{v}</dd>
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
  pendingAction,
  showStatus = true,
}: {
  op: Operation;
  overview: Overview | null;
  onAction: (op: Operation, action: string) => void;
  disabled?: boolean;
  stopped?: boolean;
  compact?: boolean;
  pendingAction?: string;
  showStatus?: boolean;
}) {
  return (
    <div className={`operation-panel ${compact ? "compact" : ""}`}>
      <div className="operation-heading">
        {["awaiting_confirmation", "awaiting_verification"].includes(
          op.status,
        ) && (
          <span className={`risk-label ${op.risk === "red" ? "risk-red" : ""}`}>
            {op.risk === "red" ? "需独立验证" : "需本人确认"}
          </span>
        )}
        {showStatus && <Badge status={op.status} />}
      </div>
      <OperationFields op={op} overview={overview} />
      {op.message &&
        !["请核对操作详情后确认", "此操作需要独立强验证"].includes(
          op.message,
        ) && <p className="operation-message">{maskPhone(op.message)}</p>}
      {op.status === "succeeded" && op.receipt && (
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
              loading={pendingAction === "authorize"}
              disabled={
                disabled ||
                stopped ||
                (op.tool === "transfer" &&
                  (!paymentAccount(overview) ||
                    !overview?.contacts.some(
                      (c) => c.id === op.params.contact_id,
                    )))
              }
              onClick={() => onAction(op, "authorize")}
            >
              {op.risk === "red"
                ? "核对并验证"
                : ({
                    transfer: "确认转账",
                    "transfer.schedule": "确认预约",
                    "split.create": "发出收款请求",
                    "funds.hold": "确认锁定",
                    "merchant.order": "确认预约订购",
                    "wealth.redeem": "确认赎回",
                    "subscriptions.cancel": "确认取消订阅",
                  } as Record<string, string>)[op.tool] || "确认办理"}
            </Button>
            <Button
              kind="danger"
              loading={pendingAction === "cancel"}
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
          loading={pendingAction === "reconcile"}
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
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const reduced = useReducedMotionPreference();
  useEffect(() => {
    const e = ref.current;
    if (open && !e?.open) {
      e?.showModal();
      if (e && !reduced) {
        const animation = animate(
          e,
          { y: [8, 0] },
          { duration: 0.22, ease: [0.22, 0.8, 0.25, 1] },
        );
        return () => {
          animation.stop();
          e.style.transform = "";
        };
      }
    }
    if (!open && e?.open) e.close();
  }, [open, reduced]);
  function requestClose() {
    const e = ref.current;
    if (closing.current) return;
    if (!e || reduced) {
      onClose();
      return;
    }
    closing.current = true;
    e.inert = true;
    animate(
      e,
      { y: [0, 6] },
      {
        duration: 0.14,
        ease: [0.22, 0.8, 0.25, 1],
        onComplete: () => {
          closing.current = false;
          e.inert = false;
          e.style.transform = "";
          onClose();
        },
      },
    );
  }
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
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
            requestClose();
        }
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          onClick={requestClose}
          aria-label="关闭弹窗"
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
