const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:5173",
  round = process.env.TRACEBANK_VISUAL_ROUND || "iteration-1";
const output = path.resolve("artifacts/screenshots/premium", round);
fs.mkdirSync(output, { recursive: true });
const report = {
  started_at: new Date().toISOString(),
  base,
  round,
  viewports: [],
  errors: [],
  checks: [],
};
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    const p = await b.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("401"))
        report.errors.push(m.text());
    });
    async function shot(name) {
      await p.waitForTimeout(150);
      await p.screenshot({
        path: path.join(output, name + ".png"),
        fullPage: true,
      });
    }
    await p.goto(base, { waitUntil: "networkidle" });
    await shot("login-1440");
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    await shot("dashboard-1440");
    report.viewports.push({ width: 1440, height: 900, overflow: false });
    await p
      .getByRole("button", { name: "进入 Agent 工作台", exact: true })
      .click();
    await shot("workspace-empty-1440");
    await p
      .getByLabel("业务需求")
      .fill("先分析本月账单，然后给李娜转 300 元，然后挂失尾号 1024 的卡片");
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.getByTestId("final-answer").waitFor();
    await shot("workspace-approval-1440");
    await p.getByRole("button", { name: "依赖图", exact: true }).click();
    await shot("workflow-graph-1440");
    await p.getByRole("button", { name: "步骤", exact: true }).click();
    for (const [width, height] of [
      [1280, 800],
      [768, 900],
      [390, 844],
    ]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(200);
      await shot(`workspace-${width}`);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      report.viewports.push({ width, height, overflow: false });
    }
    await p.setViewportSize({ width: 1440, height: 900 });
    for (const [name, label] of [
      ["analytics", "交易分析"],
      ["approvals", "审批中心"],
      ["activity", "活动日志"],
    ]) {
      await p.getByRole("button", { name: label, exact: true }).click();
      await shot(`${name}-1440`);
    }
    await p.getByRole("tab", { name: "审计事件", exact: true }).click();
    await p.getByText("哈希链校验通过", { exact: true }).waitFor();
    await shot("audit-1440");
    await p
      .getByRole("button", { name: "授权与安全规则", exact: true })
      .click();
    await shot("rules-1440");
    await p.keyboard.press("Escape");
    await p.keyboard.press("Control+k");
    await p
      .getByRole("combobox", { name: "搜索页面、任务与场景" })
      .fill("账单");
    await shot("command-1440");
    await p.keyboard.press("Escape");
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [768, 900],
      [390, 844],
    ]) {
      await p.setViewportSize({ width, height });
      for (const [id, label] of [
        ["dashboard", "业务总览"],
        ["workspace", "Agent 工作台"],
        ["analytics", "交易分析"],
        ["approvals", "审批中心"],
        ["activity", "活动日志"],
      ]) {
        if (width <= 800)
          await p
            .getByRole("button", { name: "打开导航", exact: true })
            .click();
        await p.getByRole("button", { name: label, exact: true }).click();
        await p.waitForTimeout(100);
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${id} at ${width}`,
        );
        await shot(`${id}-${width}-final`);
      }
    }
    const staff = await b.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    staff.on("pageerror", (e) => report.errors.push(e.message));
    staff.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("401"))
        report.errors.push(m.text());
    });
    await staff.goto(base + "/operator.html");
    await staff.screenshot({
      path: path.join(output, "operator-login-1280.png"),
      fullPage: true,
    });
    await staff.locator("#operator-login button").click();
    await staff.locator("#staff-actions").waitFor({ state: "visible" });
    await staff.screenshot({
      path: path.join(output, "operator-1280.png"),
      fullPage: true,
    });
    await staff.setViewportSize({ width: 390, height: 844 });
    assert(
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await staff.screenshot({
      path: path.join(output, "operator-390.png"),
      fullPage: true,
    });
    await staff.close();
    report.checks.push("all five routes, rules and command palette rendered");
    assert.deepEqual(report.errors, []);
    console.log("PASS premium visual capture", output);
  } finally {
    await b.close();
    fs.writeFileSync(
      `evals/results/premium-visual-${round}.json`,
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    `evals/results/premium-visual-${round}.json`,
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
