/* Read-only compatibility check against the existing user demo and saved runs. */
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8765";
const out = path.resolve(
  process.env.TRACEBANK_SCREENSHOT_DIR ||
    "artifacts/screenshots/ui-redesign/existing-demo",
);
fs.mkdirSync(out, { recursive: true });
const report = {
  mode: "existing-demo-read-only",
  new_model_requests: 0,
  business_writes: 0,
  checks: [],
  errors: [],
};
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
    p.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/api/runs"))
        report.new_model_requests++;
      if (r.method() === "POST" && r.url().includes("/api/operations/"))
        report.business_writes++;
    });
    await p.goto(base, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    const data = await p.evaluate(async () => ({
      overview: await (await fetch("/api/overview")).json(),
      plans: (await (await fetch("/api/plans")).json()).plans,
    }));
    const balance = data.overview.accounts[0].balance_cents;
    report.visible_plans = data.plans.length;
    await p.screenshot({
      path: path.join(out, "dashboard.png"),
      fullPage: true,
    });
    await p.getByRole("button", { name: "活动日志", exact: true }).click();
    const saved = data.plans.find(
      (plan) =>
        plan.nodes.length === 1 &&
        plan.nodes[0].tool === "bills" &&
        plan.nodes[0].status === "succeeded",
    );
    assert(saved);
    await p.getByLabel("搜索任务").fill(saved.message);
    await p.locator(".table-link").first().click();
    const savedTurn = p.locator(
      `.conversation-turn[data-run-id="${saved.run_id}"]`,
    );
    await savedTurn.locator(".task-result").waitFor();
    report.loaded_answer = await savedTurn.locator(".task-result").innerText();
    report.saved_task = saved.message;
    await p.screenshot({
      path: path.join(out, "loaded-answer.png"),
      fullPage: true,
    });
    assert(
      (await savedTurn.locator(".task-result").innerText()).includes("支出"),
    );
    await savedTurn.locator(".workflow-trigger").click();
    await savedTurn.locator(".technical-log > summary").click();
    const usage = savedTurn.locator(".model-usage").first();
    await usage.locator("summary").first().click();
    assert((await usage.innerText()).includes("qwen3.8-flash"));
    assert((await usage.innerText()).includes("请求编号"));
    await p.screenshot({
      path: path.join(out, "saved-model-task.png"),
      fullPage: true,
    });
    await p.reload();
    await savedTurn.locator(".task-result").waitFor();
    assert(
      (await savedTurn.locator(".task-result").innerText()).includes("支出"),
    );
    report.checks.push(
      "saved model task, usage and answer survive reload without replay",
    );
    assert.equal(
      await p.evaluate(
        async () =>
          (await (await fetch("/api/overview")).json()).accounts[0]
            .balance_cents,
      ),
      balance,
    );
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(180);
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    assert.equal(
      await p.evaluate(() =>
        document.activeElement.classList.contains("brand"),
      ),
      true,
    );
    await p.keyboard.press("Shift+Tab");
    assert.equal(
      await p.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "退出登录",
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(180);
    assert.equal(
      await p.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "打开导航",
    );
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    await p.getByRole("button", { name: "退出登录", exact: true }).click();
    await p.getByRole("heading", { name: "登录业务空间" }).waitFor();
    assert.equal(
      await p.evaluate(() => document.body.classList.contains("nav-open")),
      false,
    );
    await p.locator("#username").selectOption("bob");
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(await p.getByText("林知夏", { exact: true }).count(), 0);
    await p.screenshot({
      path: path.join(out, "bob-mobile.png"),
      fullPage: true,
    });
    report.checks.push(
      "drawer keyboard, Escape, logout cleanup and independent Bob account",
    );
    assert.equal(report.new_model_requests, 0);
    assert.equal(report.business_writes, 0);
    assert.deepEqual(report.errors, []);
    console.log(
      "PASS existing model-run compatibility and keyboard/account checks",
    );
  } finally {
    await b.close();
    fs.writeFileSync(
      process.env.TRACEBANK_RESULTS_PATH ||
        "evals/results/fintech-live-compat.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    process.env.TRACEBANK_RESULTS_PATH ||
      "evals/results/fintech-live-compat.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
