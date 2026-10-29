// Explicit synthetic UI records, matching backend state vocabulary. No bank writes.
const date = "2026-10-22T08:00:00+00:00";
function fixture(name) {
  const status = {
    planning: "queued",
    running: "running",
    waiting: "awaiting_confirmation",
    success: "succeeded",
    failed: "failed",
    cancelled: "cancelled",
    partial: "cancelled",
    unknown: "unknown",
  }[name];
  const op = {
    id: `fixture-op-${name}`,
    tool: "transfer",
    params: { contact_id: "li", amount_cents: 30000 },
    risk: "yellow",
    status,
    message:
      {
        cancelled: "用户取消，未执行",
        failed: "余额不足，未执行",
        unknown: "模拟通道回执丢失，结果待核实，请查询对账",
      }[name] || "请核对收款人和金额",
    expires_at: "2026-10-23T12:00:00+08:00",
  };
  const receipt = {
    id: "fixture-receipt-300",
    status: "succeeded",
    tool: "transfer",
    amount_cents: 30000,
    recipient: "李娜",
    occurred_at: date,
    demo: true,
  };
  if (name === "success" || name === "partial") {
    op.status = "succeeded";
    op.receipt = receipt;
    op.message = "操作已完成，以业务回执为准";
  }
  const nodes = [
    {
      id: "n1",
      tool: "transfer",
      params: op.params,
      depends_on: [],
      status: op.status,
      operation: op,
    },
  ];
  if (name === "partial")
    nodes.push({
      id: "n2",
      tool: "card.report_lost",
      params: { card_id: "card-alice" },
      depends_on: ["n1"],
      status: "cancelled",
    });
  if (name === "running")
    nodes[0] = {
      id: "n1",
      tool: "bills",
      params: { period: "month" },
      depends_on: [],
      status: "running",
    };
  const message =
    name === "running"
      ? "分析本月账单"
      : name === "partial"
        ? "给李娜转300元，然后挂失卡片"
        : "给李娜转300元";
  const plan = {
    id: `fixture-plan-${name}`,
    message,
    status,
    created_at: date,
    run_id: `fixture-run-${name}`,
    conversation_id: `fixture-conversation-${name}`,
    nodes,
    answer: {
      title: "办理结果",
      source: "fixture",
      paragraphs: [
        {
          success: "已向李娜转出 ¥300.00，以业务回执为准。",
          failed: "余额不足，转账未执行。",
          cancelled: "转账已取消，未执行该操作。",
          partial:
            "向李娜转账 ¥300.00 已完成。后续挂失已取消，已完成的转账不会撤销。",
          unknown: "转账结果尚未核实，请查询原操作，不要重复发起。",
          waiting: "转账尚未执行，请核对信息后确认。",
        }[name] || "正在处理",
      ],
      evidence: [
        { tool: "transfer", node_id: "n1", receipt_id: op.receipt?.id },
      ],
    },
  };
  return {
    id: `fixture-run-${name}`,
    message,
    status,
    created_at: date,
    updated_at: date,
    conversation_id: plan.conversation_id,
    plan: name === "planning" ? null : plan,
    reply: null,
    events: [
      { seq: 1, type: "request.received", at: date, data: {} },
      {
        seq: 2,
        type:
          name === "planning"
            ? "model.started"
            : name === "running"
              ? "tool.started"
              : "plan.updated",
        at: date,
        data: {
          tool: name === "running" ? "bills" : "transfer",
          node_id: "n1",
          status,
        },
      },
    ],
  };
}
module.exports = { fixture };
