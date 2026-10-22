/* Two read-only real-model turns in a dedicated synthetic account. */
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8796",
  out = path.resolve("artifacts/screenshots/conversation/live");
fs.mkdirSync(out, { recursive: true });
const report = {
  mode: "real-model-isolated-read-only-multi-turn",
  checks: [],
  business_writes: 0,
  turns: [],
};
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  let context;
  try {
    context = await b.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: {
        dir: path.join(out, "video"),
        size: { width: 1440, height: 1000 },
      },
    });
    const p = await context.newPage();
    p.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/operations/"))
        report.business_writes++;
    });
    await p.goto(base);
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    const balance = await p.evaluate(
      async () =>
        (await (await fetch("/api/overview")).json()).accounts[0].balance_cents,
    );
    await p.getByRole("button", { name: "新对话", exact: true }).click();
    for (const [index, message] of [
      "分析本月账单，看看哪里可以省钱",
      "那上月呢？",
    ].entries()) {
      await p.getByLabel("业务需求").fill(message);
      await p.getByRole("button", { name: "发送任务", exact: true }).click();
      await p.locator(".thinking-mark").waitFor();
      await p.waitForTimeout(350);
      await p.screenshot({ path: path.join(out, `thinking-${index + 1}.png`) });
      await p.waitForFunction(
        (n) =>
          document.querySelectorAll(".conversation-turn").length === n &&
          document.querySelector(".current-turn .task-state")?.textContent ===
            "执行成功",
        index + 1,
        { timeout: 100000 },
      );
      const record = await p.evaluate(async () => {
        const list = await (await fetch("/api/runs")).json();
        return await (await fetch("/api/runs/" + list.runs[0].id)).json();
      });
      report.turns.push({
        conversation_id: record.conversation_id,
        status: record.status,
        message: record.message,
        nodes: record.plan.nodes.map((n) => ({
          tool: n.tool,
          params: n.params,
        })),
        usage: record.events
          .filter((e) => e.data.usage)
          .map((e) => ({ phase: e.type, ...e.data.usage })),
      });
      await p.screenshot({ path: path.join(out, `answer-${index + 1}.png`) });
    }
    assert.equal(
      report.turns[0].conversation_id,
      report.turns[1].conversation_id,
    );
    assert.equal(report.turns[1].nodes[0].tool, "bills");
    assert.equal(report.turns[1].nodes[0].params.period, "last_month");
    assert.equal(await p.getByTestId("previous-answer").count(), 1);
    await p.reload();
    await p.waitForFunction(
      () => document.querySelectorAll(".conversation-turn").length === 2,
    );
    assert(
      (await p.getByTestId("previous-answer").innerText()).includes("5,963.20"),
    );
    assert.equal(
      await p.evaluate(
        async () =>
          (await (await fetch("/api/overview")).json()).accounts[0]
            .balance_cents,
      ),
      balance,
    );
    assert.equal(report.business_writes, 0);
    report.checks.push(
      "real model follows elliptical prior subject in same conversation; both turns survive reload; no financial writes",
    );
    const video = p.video();
    await context.close();
    context = null;
    await video.saveAs(path.join(out, "conversation-demo.webm"));
    await video.delete();
    console.log(
      JSON.stringify({
        turns: report.turns.length,
        same_conversation: true,
        followup_period: report.turns[1].nodes[0].params.period,
        business_writes: 0,
      }),
    );
  } finally {
    if (context) await context.close();
    await b.close();
    fs.writeFileSync(
      "evals/results/conversation-live.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    "evals/results/conversation-live.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
