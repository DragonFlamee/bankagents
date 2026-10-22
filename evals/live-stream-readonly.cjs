/* One real read-only model task against a dedicated synthetic-data server. */
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8794";
const out = path.resolve("artifacts/screenshots/motion/live-stream");
fs.mkdirSync(out, { recursive: true });
const report = {
  mode: "real-model-read-only-isolated",
  checks: [],
  business_writes: 0,
  samples: [],
};
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
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
    await p.getByRole("button", { name: "新建任务", exact: true }).click();
    await p.getByLabel("业务需求").fill("分析本月账单，看看我应该在哪里省钱");
    const started = Date.now();
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    let first = false;
    let finished = false;
    while (Date.now() - started < 100000) {
      const partial = p.getByTestId("streaming-answer");
      if (await partial.count()) {
        const paragraphs = await partial.locator("p").count();
        report.samples.push({ ms: Date.now() - started, paragraphs });
        if (!first) {
          report.first_output_ms = Date.now() - started;
          first = true;
          await p.screenshot({
            path: path.join(out, "first-verified-output.png"),
            fullPage: true,
          });
        }
      }
      if (await p.getByTestId("final-answer").count()) {
        finished = true;
        break;
      }
      await p.waitForTimeout(75);
    }
    assert(finished, "read-only model task did not finish");
    report.completed_ms = Date.now() - started;
    const record = await p.evaluate(async () => {
      const list = await (await fetch("/api/runs")).json();
      return await (await fetch("/api/runs/" + list.runs[0].id)).json();
    });
    report.status = record.status;
    report.source = record.plan?.answer?.source;
    report.response_usage = record.events.find(
      (e) => e.type === "response.completed",
    )?.data.usage;
    report.model_usage = record.events.find(
      (e) => e.type === "model.completed",
    )?.data.usage;
    report.deltas = record.events
      .filter((e) => e.type === "response.delta")
      .map((e) => ({ seq: e.seq, at: e.at, text: e.data.text }));
    assert(first, "no partial content was visible before completion");
    assert.equal(record.status, "succeeded");
    assert.equal(report.source, "model_selected_evidence");
    assert.equal(report.response_usage?.streamed, true);
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
      "real provider SSE with usage, verified partial content visible before completion, final answer grounded, no financial writes",
    );
    await p.screenshot({
      path: path.join(out, "completed-answer.png"),
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        first_output_ms: report.first_output_ms,
        completed_ms: report.completed_ms,
        status: report.status,
        source: report.source,
        streamed: report.response_usage.streamed,
        total_tokens: report.response_usage.total_tokens,
        business_writes: 0,
      }),
    );
  } finally {
    await b.close();
    fs.writeFileSync(
      "evals/results/live-stream-readonly.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    "evals/results/live-stream-readonly.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
