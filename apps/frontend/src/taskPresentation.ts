import { labels, money } from "./api";
import type { Overview, Plan, PlanNode, Run } from "./types";

export function taskTitle(
  plan: Plan | null,
  overview: Overview | null,
  message = "",
) {
  const n = plan?.nodes.length === 1 ? plan.nodes[0] : null;
  if (n?.tool === "transfer") {
    const c = overview?.contacts.find((c) => c.id === n.params.contact_id);
    return c
      ? `向${c.name}转账 ${money(Number(n.params.amount_cents))}`
      : "转账";
  }
  return plan?.message || message || "Agent 工作台";
}

export function taskPresentation(
  plan: Plan | null,
  run: Run | null,
  busy = false,
) {
  const nodes = plan?.nodes || [];
  const done = nodes.filter((n) => n.status === "succeeded");
  const committed = nodes.filter(
    (n) =>
      n.operation?.status === "succeeded" &&
      n.operation.receipt?.status === "succeeded",
  );
  const unknown =
    nodes.some(
      (n) => n.status === "unknown" || n.operation?.status === "unknown",
    ) ||
    plan?.status === "unknown" ||
    run?.status === "unknown";
  const raw = plan?.status || run?.status;
  const state = (code: string, label: string, tone: string, summary = "") => ({
    code,
    label,
    tone,
    summary,
    done: done.length,
    total: nodes.length,
    committed,
    canRestart:
      !busy &&
      !unknown &&
      !committed.length &&
      ["failed", "cancelled", "interrupted"].includes(raw || ""),
  });
  if (!plan && !run) return state("not_started", "未开始", "neutral");
  if (unknown)
    return state(
      "unknown",
      "结果待核实",
      "warning",
      "请查询原操作。结果核实前，不要重复发起。",
    );
  if (raw === "paused")
    return state(
      "paused",
      "已暂停",
      "neutral",
      "后续步骤已暂停，完成的操作保留。",
    );
  if (raw === "handoff")
    return state(
      "handoff",
      "人工接管",
      "neutral",
      "等待操作员交还任务后继续。",
    );
  if (raw === "clarification")
    return state("clarification", "待补充信息", "warning");
  if (run?.status === "cancelling")
    return state(
      "cancelling",
      "正在停止",
      "neutral",
      "正在核对已完成和未执行的步骤。",
    );
  if (busy)
    return !plan
      ? state("planning", "规划中", "live")
      : state("running", "执行中", "live");
  if (
    ["failed", "cancelled", "interrupted"].includes(raw || "") &&
    done.length &&
    done.length < nodes.length
  )
    return state(
      "partial",
      "部分成功",
      "warning",
      raw === "cancelled"
        ? "后续步骤已取消，已完成的操作保留。"
        : "部分步骤未完成，已完成的操作保留。",
    );
  if (["awaiting_confirmation", "awaiting_verification"].includes(raw || ""))
    return state("awaiting_user", "等待用户确认", "warning");
  if (raw === "succeeded") return state("succeeded", "执行成功", "success");
  if (raw === "cancelled")
    return state(
      "cancelled",
      "已取消",
      "neutral",
      committed.length
        ? "任务已取消，已完成的操作保留。"
        : nodes.length &&
            nodes.every(
              (n) =>
                n.tool === "transfer" && n.operation?.status === "cancelled",
            )
          ? "转账未执行。"
          : "未执行的步骤已取消。",
    );
  if (raw === "failed") return state("failed", "执行失败", "danger");
  if (raw === "interrupted")
    return state(
      "interrupted",
      "已中断",
      "warning",
      "请先查看已保存的执行结果。",
    );
  return state("running", "执行中", "live");
}

export function businessParagraph(text: string, plan: Plan | null) {
  let value = text;
  for (const n of plan?.nodes || []) {
    if (n.operation?.receipt?.id)
      value = value.replace(`，回执编号 ${n.operation.receipt.id}`, "");
    if (n.operation?.id)
      value = value.replace(`原操作 ${n.operation.id}`, "原操作");
    value = value.replace(
      `步骤 ${n.id} 执行失败`,
      `${labels[n.tool] || "业务步骤"}执行失败`,
    );
    for (const a of n.result?.anomalies || [])
      value = value.replace(`（交易 ${a.transaction_id}）`, "");
  }
  return value
    .replace("请到右侧核对操作后授权。", "请在下方核对后确认。")
    .replace("明细保留在右侧工具结果中。", "可在执行详情查看明细。");
}

export function committedSummary(n: PlanNode) {
  const receipt = n.operation?.receipt;
  if (n.tool === "transfer" && !Number.isSafeInteger(receipt?.amount_cents))
    return "转账已完成，金额请核对完整回执。";
  return n.tool === "transfer" && receipt
    ? `已向${receipt.recipient || "收款人"}转账 ${money(Number(receipt.amount_cents))}`
    : `${labels[n.tool] || "业务操作"}已完成`;
}

export function isComplexPlan(plan: Plan) {
  const children = new Map<string, number>();
  plan.nodes.forEach((n) =>
    n.depends_on.forEach((d) => children.set(d, (children.get(d) || 0) + 1)),
  );
  return (
    plan.nodes.length > 3 ||
    plan.nodes.some((n) => n.depends_on.length > 1) ||
    [...children.values()].some((n) => n > 1) ||
    plan.nodes.filter((n) => !n.depends_on.length).length > 1
  );
}

// Mirrors BankService._execute's ORDER BY id LIMIT 1; not a new account selector.
export function paymentAccount(overview: Overview | null) {
  return overview?.accounts
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}
