import { useCallback, useEffect, useState } from "react";
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("无法连接本地服务。请检查服务是否运行，业务结果尚未核实。");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(
      data.error?.message ||
        data.detail?.message ||
        data.detail ||
        `请求未完成（${response.status}）`,
    ) as Error & { status: number };
    e.status = response.status;
    throw e;
  }
  return data;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format((cents || 0) / 100);
export const time = (s: string, short = false) =>
  s
    ? new Date(s).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        ...(short
          ? {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }
          : {}),
      })
    : "—";
export const labels: Record<string, string> = {
  balance: "查询余额",
  cards: "查询卡片",
  transactions: "查询交易",
  bills: "账单分析",
  "analysis.expression": "受限分析",
  "subscriptions.detect": "识别周期扣费",
  "wealth.profile": "读取风险测评",
  "wealth.products": "理财产品对比",
  "wealth.holdings": "持仓收益",
  "life.events": "检查近期纪念日",
  "schedules.list": "查看资金日程",
  transfer: "转账",
  "transfer.schedule": "预约转账",
  "schedule.cancel": "取消预约",
  "split.create": "发起 AA 收款",
  "card.report_lost": "卡片挂失",
  "card.unlock": "卡片解挂",
  "card.freeze": "临时冻结卡片",
  "card.unfreeze": "解除冻结",
  "card.virtual": "申请虚拟卡",
  "card.apply": "申请新卡",
  "card.limit": "调整信用额度",
  "card.controls": "调整交易限制",
  "card.pin_reset": "重置交易密码",
  "subscriptions.get": "查询订阅",
  "subscriptions.offers": "查看可订阅服务",
  "subscriptions.subscribe": "开通订阅",
  "subscriptions.cancel": "取消订阅",
  "subscriptions.remind": "设置续费提醒",
  "goals.create": "储蓄目标记录",
  "funds.hold": "锁定活期资金",
  "funds.release": "释放锁定资金",
  "merchant.order": "预约订购",
  "wealth.subscribe": "申购理财",
  "wealth.redeem": "赎回理财",
};
export const readTools = new Set([
  "balance",
  "cards",
  "transactions",
  "bills",
  "analysis.expression",
  "subscriptions.detect",
  "wealth.profile",
  "wealth.products",
  "wealth.holdings",
  "life.events",
  "schedules.list",
]);
export const statuses: Record<string, string> = {
  succeeded: "已完成",
  pending: "等待执行",
  queued: "已排队",
  running: "处理中",
  awaiting_confirmation: "待确认",
  awaiting_verification: "待验证",
  unknown: "待核实",
  failed: "未完成",
  cancelled: "已取消",
  paused: "已暂停",
  handoff: "人工接管",
  clarification: "待补充",
  interrupted: "已中断",
  cancelling: "正在停止",
  active: "正常",
  lost: "已挂失",
  frozen: "已冻结",
  processing: "制卡中",
  scheduled: "待执行",
  done: "已执行",
  released: "已释放",
  consumed: "已用完",
  requested: "待付款",
  paid: "已收到",
};
export const active = (s: string) =>
  ["queued", "running", "cancelling"].includes(s);
export const pending = (s: string) =>
  ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(s);
export function auditLabel(action: string) {
  const operational: Record<string, string> = {
    "authorization.challenge": "发起身份验证",
    "authorization.confirmed": "确认本次操作",
    "authorization.denied": "拒绝授权",
    "authorization.expired": "授权已过期",
    "authorization.risk_upgraded": "升级验证要求",
    "authorization.verified": "身份验证通过",
    "channel.blocked": "业务通道暂停",
    "channel.failure": "业务通道失败",
    "demo.fault_configured": "配置演示故障",
    "operation.committed": "业务已提交",
    "security.suspicious_input": "识别到绕过授权的表达",
    "security.locked": "安全锁定",
    "schedule.executed": "执行预约",
    "demo.schedule_forced": "演示：按到期日执行",
    "demo.split_paid": "演示：收到 AA 款",
    "funds.auto_released": "锁定资金到期释放",
    "wealth.assessed": "完成风险测评",
  };
  if (operational[action]) return operational[action];
  return (
    (
      {
        "demo.initialized": "初始化演示账户",
        "account.summary": "读取账户",
        "transactions.analysis": "分析账单",
        "transactions.query": "查询交易",
        "plan.created": "创建任务",
        "plan.controlled": "调整任务状态",
        "step.started": "开始业务步骤",
        "step.updated": "更新业务步骤",
        "step.failed": "业务步骤失败",
        "operation.created": "创建待确认操作",
        "operation.authorized": "本人授权",
        "operation.succeeded": "业务操作完成",
        "operation.failed": "业务操作失败",
        "operation.cancelled": "取消未执行操作",
        "operation.reconciled": "核实原操作",
        "operator.released": "人工交还任务",
        "session.created": "登录账户",
        "session.deleted": "退出登录",
      } as Record<string, string>
    )[action] || "业务记录"
  );
}
/** Fetch on mount and whenever the app broadcasts "tracebank:refresh". */
export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
    const again = () => void load();
    window.addEventListener("tracebank:refresh", again);
    return () => window.removeEventListener("tracebank:refresh", again);
  }, [load]);
  return { data, error, loading, reload: load };
}
