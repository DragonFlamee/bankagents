/* Timing fixtures replay recorded real run data; no new model requests. */
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8765";
const recorded = JSON.parse(
  fs.readFileSync("evals/results/answers-browser.json", "utf8"),
).runs[0];
const report = {
  mode: "recorded-api-fixture",
  new_model_requests: 0,
  checks: [],
  errors: [],
};
const output = path.resolve(
  process.env.TRACEBANK_SCREENSHOT_DIR ||
    "artifacts/screenshots/clarity/lifecycle",
);
fs.mkdirSync(output, { recursive: true });
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
        : undefined),
  });
  try {
    const p = await b.newPage({
      viewport: { width: 1440, height: 1050 },
      reducedMotion: "reduce",
    });
    p.on("pageerror", (e) => report.errors.push(e.message));
    let phase = 1,
      id = "react-timing-fixture-1";
    function payload(after = 0) {
      const r = structuredClone(recorded);
      r.id = id;
      r.status = phase === 4 ? "succeeded" : phase === 5 ? "failed" : "running";
      r.reply =
        phase === 4 ? r.reply : phase === 5 ? "测试夹具：请求未完成。" : null;
      r.events = r.events
        .slice(0, phase === 1 ? 2 : phase === 2 ? 6 : phase === 3 ? 9 : 11)
        .map((e, i) => ({ ...e, seq: i + 1 }))
        .filter((e) => e.seq > after);
      if (phase === 1 || phase === 5) r.plan = null;
      return r;
    }
    await p.route("**/api/runs", async (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 202, json: payload() })
        : route.continue(),
    );
    await p.route("**/api/runs/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/runs/" + id)
        await route.fulfill({
          json: payload(Number(u.searchParams.get("after")) || 0),
        });
      else await route.continue();
    });
    await p.route("**/api/conversations/*", (route) =>
      route.fulfill({
        json: {
          conversation_id: payload().conversation_id,
          runs: [payload()],
          has_more: false,
        },
      }),
    );
    await p.goto(base);
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.locator(".metrics-band").waitFor();
    async function submit() {
      await p.getByRole("button", { name: "新对话", exact: true }).click();
      await p.getByLabel("业务需求").fill("请你帮我看看我应该在哪里省钱");
      await p.getByRole("button", { name: "发送任务" }).click();
      await p.locator(".task-progress").waitFor();
    }
    await submit();
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    assert.equal(await p.locator(".execution-inline").count(), 0);
    await p.screenshot({
      path: path.join(output, "01-planning.png"),
      fullPage: true,
    });
    phase = 2;
    await p.waitForTimeout(800);
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    await p.locator(".technical-log > summary").click();
    assert(
      (await p.locator(".technical-log").innerText()).includes("开始步骤"),
    );
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    phase = 3;
    await p.waitForTimeout(800);
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    assert.equal(await p.locator(".execution-inline").count(), 0);
    await p.screenshot({
      path: path.join(output, "02-tools.png"),
      fullPage: true,
    });
    phase = 4;
    await p.getByTestId("final-answer").waitFor();
    report.checks.push("planning/tool/response phases precede final answer");
    assert.equal(await p.locator(".execution-inline").count(), 0);
    report.checks.push("manual detail closure survives subsequent events");
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    await p.locator(".technical-log > summary").click();
    await p.screenshot({
      path: path.join(output, "03-complete-expanded.png"),
      fullPage: true,
    });
    assert(
      (await p.locator(".technical-log").textContent()).includes("调用记录"),
    );
    report.checks.push(
      "complete event evidence remains available at the technical level",
    );
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    phase = 5;
    id = "react-timing-fixture-2";
    await p.getByRole("button", { name: "新对话", exact: true }).click();
    await p.getByLabel("业务需求").fill("失败夹具");
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.getByTestId("final-answer").waitFor();
    assert.equal(await p.locator(".task-state").innerText(), "执行失败");
    assert(!(await p.getByTestId("final-answer").innerText()).includes("成功"));
    report.checks.push("failed run never claims completion");
    assert.deepEqual(report.errors, []);
    console.log("PASS", report.checks.length, "React timing checks");
  } finally {
    await b.close();
    fs.writeFileSync(
      process.env.TRACEBANK_RESULTS_PATH ||
        "evals/results/clarity-thinking.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  console.error(e);
  report.failure = e.stack;
  fs.writeFileSync(
    process.env.TRACEBANK_RESULTS_PATH || "evals/results/clarity-thinking.json",
    JSON.stringify(report, null, 2),
  );
  process.exitCode = 1;
});
