/* New React UI acceptance: real isolated offline backend, real browser. */
const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
let base = process.env.TRACEBANK_TEST_URL;
let testServer;
async function startIsolatedServer() {
  const net = require("node:net");
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const python = path.resolve(
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python",
  );
  testServer = require("node:child_process").spawn(
    python,
    [
      "-m",
      "banking_agent",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--data-dir",
      `data/ui-test-${Date.now()}`,
    ],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        TRACEBANK_PLANNER: "offline",
        TRACEBANK_DEMO_PASSWORD: "tracebank-demo",
        TRACEBANK_OPERATOR_PASSWORD: "tracebank-operator",
      },
    },
  );
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      if (
        (
          await fetch(base + "/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Isolated test service did not become ready");
}
function stopIsolatedServer() {
  if (!testServer) return;
  if (process.platform === "win32") {
    try {
      require("node:child_process").execFileSync(
        "taskkill",
        ["/PID", String(testServer.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
    } catch {}
  } else testServer.kill();
}
const output = path.resolve(
  process.env.TRACEBANK_SCREENSHOT_DIR ||
    "artifacts/screenshots/clarity/regression",
);
fs.mkdirSync(output, { recursive: true });
const report = {
  started_at: new Date().toISOString(),
  base,
  mode: "real-offline-backend",
  checks: [],
  errors: [],
  screenshots: [],
};
function pass(name) {
  report.checks.push({ name, status: "passed" });
  console.log("PASS", name);
}
async function main() {
  if (!base) await startIsolatedServer();
  report.base = base;
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
        : undefined),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        !m.text().includes("401") &&
        !m.text().includes("400") &&
        !m.text().includes("409")
      )
        report.errors.push(m.text());
    });
    async function shot(name, options = {}) {
      await page.waitForTimeout(180);
      await page.screenshot({
        path: path.join(output, name + ".png"),
        fullPage: true,
        ...options,
      });
      report.screenshots.push(name + ".png");
    }
    async function nav(name) {
      await page.getByRole("button", { name, exact: true }).click();
    }
    async function control(name) {
      if (!(await page.locator(".execution-inline").count()))
        await nav("查看执行详情");
      const actions = page.locator(".task-actions");
      if ((await actions.getAttribute("open")) === null)
        await actions.locator("summary").click();
      await nav(name);
      await page.waitForTimeout(160);
      await nav("收起执行详情");
    }
    async function task(message) {
      await page.getByRole("button", { name: "新建任务", exact: true }).click();
      await page.getByRole("textbox", { name: "业务需求" }).fill(message);
      await page.getByRole("button", { name: "发送任务" }).click();
      await page.waitForFunction(() => {
        const state = document
          .querySelector(".task-heading .task-state")
          ?.getAttribute("data-state");
        return state && !["planning", "running", "cancelling"].includes(state);
      });
    }
    const balance = () =>
      page.evaluate(
        async () =>
          (await (await fetch("/api/overview")).json()).accounts[0]
            .balance_cents,
      );
    await page.goto(base, { waitUntil: "networkidle" });
    await shot("01-login");
    await page
      .getByRole("button", { name: "进入拾迹银行", exact: true })
      .click();
    await page.getByRole("heading", { name: "业务总览" }).waitFor();
    await shot("02-dashboard");
    pass("dashboard real balance and transactions");
    await page
      .getByRole("button", { name: "进入 Agent 工作台", exact: true })
      .click();
    await shot("03-workspace-empty");
    await nav("选择场景");
    assert.equal(await page.locator(".scenario-picker button").count(), 6);
    await nav("选择场景");
    pass("six scenario entries");
    await task("请你帮我看看我应该在哪里省钱");
    const answer = page.getByTestId("final-answer");
    assert((await answer.innerText()).includes("购物"));
    assert.equal(await page.locator(".execution-inline").count(), 0);
    await shot("04-workspace-answer");
    await nav("查看执行详情");
    await page.locator(".technical-log > summary").click();
    assert(
      (await page.locator(".technical-log").innerText()).includes("开始步骤"),
    );
    await shot("05-tool-chain");
    await nav("收起执行详情");
    pass("business answer with optional steps and complete technical evidence");
    const before = await balance();
    await task("给李娜转 300 元");
    assert.equal(await balance(), before);
    await nav("审批中心");
    await page
      .locator(".approval-list .operation-panel")
      .getByRole("button", { name: "确认转账", exact: true })
      .first()
      .click();
    await page.locator(".toast").filter({ hasText: "业务已完成" }).waitFor();
    assert.equal(await balance(), before - 30000);
    await page.getByRole("tab", { name: /全部操作/ }).click();
    assert((await page.locator(".receipt").count()) > 0);
    await shot("06-approvals");
    pass("yellow approval changes balance only after explicit confirmation");
    await task("给李娜转 1500 元");
    await control("暂停任务");
    assert.equal(
      await page.getByRole("button", { name: "核对并验证" }).isDisabled(),
      true,
    );
    await nav("继续任务");
    await nav("核对并验证");
    await page.getByRole("heading", { name: "独立身份验证" }).waitFor();
    const redBefore = await balance();
    assert.equal(redBefore, before - 30000);
    await page.getByLabel("一次性验证码").fill("000000");
    await page.getByRole("button", { name: "验证并提交本次操作" }).click();
    await page.locator(".modal .inline-error").waitFor();
    assert.equal(await balance(), redBefore);
    await nav("打开模拟验证收件箱");
    const code = (await page.locator(".demo-code").innerText()).trim();
    assert.match(code, /^\d{6}$/);
    await page.getByLabel("一次性验证码").fill(code);
    await shot("07-independent-verification", {
      mask: [page.locator(".demo-code"), page.locator("#otp")],
    });
    await page.getByRole("button", { name: "验证并提交本次操作" }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    assert.equal(await balance(), redBefore - 150000);
    pass(
      "pause blocks authorization; independent OTP required; wrong OTP leaves funds unchanged",
    );
    await task("查询我的订阅");
    assert(
      (await page.locator(".operation-panel").innerText()).includes("确认办理"),
    );
    await nav("确认办理");
    await page.getByText("执行成功", { exact: true }).waitFor();
    assert(
      (await page.getByTestId("final-answer").innerText()).includes("订阅"),
    );
    pass("subscription query requires consent");
    await task("创建旅行储蓄目标 5000 元");
    const goalBefore = await balance();
    await nav("确认办理");
    await page.getByText("执行成功", { exact: true }).waitFor();
    assert.equal(await balance(), goalBefore);
    pass("goal creation does not reserve funds");
    await task("用沙箱计算本月平均支出");
    await nav("查看执行详情");
    assert(
      (await page.locator(".plan-nodes").innerText()).includes("受限分析"),
    );
    await nav("收起执行详情");
    pass("restricted calculation scenario");
    await task("查询我的卡片");
    assert(
      (await page.getByTestId("final-answer").innerText()).includes("1024"),
    );
    pass("card query scenario");
    const dagBalance = await balance();
    await task("先分析本月账单，然后给李娜转 300 元，然后挂失尾号 1024 的卡片");
    await nav("查看执行详情");
    assert.equal(await page.locator(".plan-node").count(), 3);
    const saved = await page.evaluate(
      async () => (await (await fetch("/api/plans")).json()).plans[0],
    );
    assert.equal(saved.nodes[2].depends_on.length, 1);
    await shot("12-dependent-plan");
    await control("取消任务");
    await page
      .getByTestId("final-answer")
      .filter({ hasText: "已取消" })
      .waitFor();
    assert.equal(await balance(), dagBalance);
    pass("three-step DAG, dependent authorization and cancellation");
    const committedBefore = await balance();
    await task("先给李娜转 100 元，然后挂失尾号 1024 的卡片");
    await nav("核对并验证");
    await nav("打开模拟验证收件箱");
    await page
      .getByLabel("一次性验证码")
      .fill((await page.locator(".demo-code").innerText()).trim());
    await page
      .getByRole("button", { name: "验证并提交本次操作", exact: true })
      .click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    await page.waitForFunction(
      async () =>
        (await (await fetch("/api/overview")).json()).daily_transfer_cents >=
        190000,
    );
    assert.equal(await balance(), committedBefore - 10000);
    await control("取消任务");
    await page.getByText("部分成功", { exact: true }).waitFor();
    assert(
      (await page.locator(".completed-business").innerText()).includes(
        "100.00",
      ),
    );
    assert(
      (await page.locator(".completed-business").innerText()).includes(
        "不会因取消任务而撤销",
      ),
    );
    assert.equal(
      await page.getByRole("button", { name: "重新发起", exact: true }).count(),
      0,
    );
    assert.equal(await balance(), committedBefore - 10000);
    assert.equal(
      await page.evaluate(
        async () =>
          (await (await fetch("/api/overview")).json()).cards.find(
            (c) => c.last4 === "1024",
          ).status,
      ),
      "active",
    );
    await shot("13-partial-committed-cancellation");
    pass(
      "partial cancellation preserves real committed funds, receipt and unchanged card",
    );
    await task("查询我的订阅");
    await control("转人工");
    assert.equal(
      await page
        .getByRole("button", { name: "确认办理", exact: true })
        .isDisabled(),
      true,
    );
    const customerPlan = await page.evaluate(
      async () => (await (await fetch("/api/plans")).json()).plans[0],
    );
    const staffContext = await browser.newContext();
    const staff = await staffContext.newPage();
    await staff.goto(base + "/operator.html");
    await staff.locator("#operator-login button").click();
    const section = staff
      .locator("#staff-plans section")
      .filter({ hasText: customerPlan.message })
      .first();
    await section.locator("textarea").fill("已核实任务归属并交还客户自行确认");
    await section
      .getByRole("button", { name: "记录说明，交还客户授权" })
      .click();
    await section.waitFor({ state: "hidden" });
    await nav("刷新业务数据");
    await page.getByRole("button", { name: "确认办理", exact: true }).waitFor();
    await nav("取消操作");
    await staffContext.close();
    pass("human handoff requires separate operator release");
    await nav("交易分析");
    await page
      .getByRole("heading", { name: "交易分析", exact: true })
      .waitFor();
    await page.getByRole("textbox", { name: "搜索交易" }).fill("咖啡");
    assert.equal(await page.locator(".data-table tbody tr").count(), 3);
    await page.getByRole("textbox", { name: "搜索交易" }).fill("");
    await page.getByLabel("交易期间").selectOption("last_month");
    await page.getByRole("heading", { name: "没有匹配的交易" }).waitFor();
    await nav("业务总览");
    assert(
      !(await page.locator(".metrics-band>div").nth(1).innerText()).includes(
        "¥0.00",
      ),
    );
    await nav("交易分析");
    await page.getByLabel("交易期间").selectOption("month");
    await page.locator(".data-table tbody tr").first().waitFor();
    const download = page.waitForEvent("download");
    await nav("导出流水");
    const file = await download;
    assert(file.suggestedFilename().endsWith(".csv"));
    await shot("08-analytics");
    pass("periods/search/export and month dashboard isolation");
    await nav("活动日志");
    await page.getByRole("tab", { name: "审计事件", exact: true }).click();
    await page.getByText("哈希链校验通过", { exact: true }).waitFor();
    await page.locator(".audit-list summary").first().click();
    await shot("09-audit");
    pass("audit chain and expandable audit evidence");
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      assert.equal(
        await page
          .locator(".sidebar")
          .evaluate((e) => e.getBoundingClientRect().right <= 1),
        true,
      );
      await nav("打开导航");
      assert.equal(
        await page
          .getByRole("button", { name: "交易分析", exact: true })
          .isVisible(),
        true,
      );
      await nav("交易分析");
      await page.waitForTimeout(200);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await shot(`10-analytics-${width}`);
      await nav("打开导航");
      await nav("Agent 工作台");
      await shot(`11-workspace-${width}`);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    pass("768px and 390px drawer, contained table scroll and workspace");
    assert.deepEqual(report.errors, []);
    pass("no JavaScript or CSP errors");
  } finally {
    await browser.close();
    stopIsolatedServer();
    fs.writeFileSync(
      process.env.TRACEBANK_RESULTS_PATH ||
        "evals/results/clarity-regression.json",
      JSON.stringify(report, null, 2),
    );
  }
}
main().catch((e) => {
  stopIsolatedServer();
  report.failure = e.stack;
  fs.writeFileSync(
    process.env.TRACEBANK_RESULTS_PATH ||
      "evals/results/clarity-regression.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
