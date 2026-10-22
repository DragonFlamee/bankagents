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
  transfer: "智能转账",
  "card.report_lost": "卡片挂失",
  "card.unlock": "卡片解挂",
  "card.virtual": "申请虚拟卡",
  "subscriptions.get": "查询订阅",
  "subscriptions.cancel": "取消订阅",
  "goals.create": "储蓄目标记录",
};
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
};
export const active = (s: string) =>
  ["queued", "running", "cancelling"].includes(s);
export const pending = (s: string) =>
  ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(s);
