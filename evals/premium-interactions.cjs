const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8790",
  out = path.resolve("artifacts/screenshots/premium/interaction");
fs.mkdirSync(out, { recursive: true });
const report = {
  started_at: new Date().toISOString(),
  base,
  checks: [],
  errors: [],
  mode: "real-offline-backend-with-labelled-failure-fixtures",
  contrast: [],
};
const pass = (name, mode = "real-browser") => {
  report.checks.push({ name, mode, status: "passed" });
  console.log("PASS", name);
};
async function main() {
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
      if (m.type() === "error" && !/401|500/.test(m.text()))
        report.errors.push(m.text());
    });
    let runs = 0,
      authorizations = 0;
    p.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/api/runs")) runs++;
      if (r.method() === "POST" && r.url().includes("/authorize"))
        authorizations++;
    });
    await p.goto(base, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    await p.getByRole("button", { name: "收起侧栏", exact: true }).click();
    assert.equal(
      Math.round(
        await p
          .locator(".sidebar")
          .evaluate((e) => e.getBoundingClientRect().width),
      ),
      72,
    );
    await p.getByRole("button", { name: "展开侧栏", exact: true }).click();
    await p.locator(".recent-task").first().focus();
    assert.equal(
      await p.locator(".sidebar-recent .hint-text").first().isVisible(),
      true,
    );
    pass("sidebar collapse and keyboard-readable full task tooltip");
    await p.keyboard.press("Control+k");
    await p
      .getByRole("combobox", { name: "搜索页面、任务与场景" })
      .fill("交易分析");
    await p.keyboard.press("Enter");
    await p.getByRole("heading", { name: "交易分析", exact: true }).waitFor();
    const before = runs;
    await p.keyboard.press("Control+k");
    await p
      .getByRole("combobox", { name: "搜索页面、任务与场景" })
      .fill("账单洞察");
    await p.keyboard.press("Enter");
    await p.getByLabel("业务需求").waitFor();
    assert((await p.getByLabel("业务需求").inputValue()).includes("省钱"));
    assert.equal(runs, before);
    pass("command keyboard navigates and prefills without running business");
    const input = p.getByLabel("业务需求"),
      height = await input.evaluate((e) => e.clientHeight);
    await input.fill("本月账单\n".repeat(25));
    assert((await input.evaluate((e) => e.clientHeight)) > height);
    await p.getByRole("button", { name: "六个业务场景", exact: true }).click();
    assert.equal(await p.locator(".scenario-picker button").count(), 6);
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    assert((await input.inputValue()).includes("省钱"));
    await p.getByRole("button", { name: "六个业务场景", exact: true }).click();
    await p.keyboard.press("Escape");
    await p.locator(".scenario-picker").waitFor({ state: "detached" });
    assert.equal(await p.locator(".scenario-picker").count(), 0);
    assert.equal(
      await p.evaluate(() =>
        document.activeElement.getAttribute("aria-expanded"),
      ),
      "false",
    );
    pass("auto-height composer and keyboard scenario picker");
    await input.fill(
      "先分析本月账单，然后给李娜转 300 元，然后挂失尾号 1024 的卡片",
    );
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.getByTestId("final-answer").waitFor();
    assert.equal(await p.locator(".plan-node").count(), 3);
    assert.equal(await p.locator("progress").getAttribute("value"), "1");
    assert.equal(await p.locator("progress").getAttribute("max"), "3");
    const fields = p.locator(".execution-panel .field-list");
    assert(!(await fields.innerText()).includes("13900000001"));
    await p
      .getByRole("button", { name: "显示完整收款信息", exact: true })
      .click();
    assert((await fields.innerText()).includes("13900000001"));
    await p
      .getByRole("button", { name: "隐藏完整收款信息", exact: true })
      .click();
    pass("real 1-of-3 progress and masked recipient with explicit reveal");
    await p.getByRole("button", { name: "依赖图", exact: true }).click();
    assert.equal(await p.locator(".map-edge").count(), 2);
    for (let i = 0; i < 4; i++)
      await p.getByRole("button", { name: "放大依赖图", exact: true }).click();
    assert.equal(await p.locator(".zoom-label").innerText(), "200%");
    assert(
      await p
        .getByRole("button", { name: "放大依赖图", exact: true })
        .isDisabled(),
    );
    for (let i = 0; i < 6; i++)
      await p.getByRole("button", { name: "缩小依赖图", exact: true }).click();
    assert.equal(await p.locator(".zoom-label").innerText(), "50%");
    assert(
      await p
        .getByRole("button", { name: "缩小依赖图", exact: true })
        .isDisabled(),
    );
    await p.getByRole("button", { name: "重置依赖图", exact: true }).click();
    const map = p.locator(".plan-map");
    await map.focus();
    await p.keyboard.press("+");
    assert.equal(await p.locator(".zoom-label").innerText(), "125%");
    const v = await map.locator("svg").getAttribute("viewBox");
    await p.keyboard.press("ArrowRight");
    assert.notEqual(await map.locator("svg").getAttribute("viewBox"), v);
    await p.keyboard.press("0");
    assert.equal(await p.locator(".zoom-label").innerText(), "100%");
    const rect = await map.boundingBox(),
      prior = await map.locator("svg").getAttribute("viewBox");
    await p.mouse.move(rect.x + 40, rect.y + 40);
    await p.mouse.down();
    await p.mouse.move(rect.x + 75, rect.y + 60);
    await p.mouse.up();
    assert.notEqual(await map.locator("svg").getAttribute("viewBox"), prior);
    await p.keyboard.down("Alt");
    await p.mouse.wheel(0, -80);
    await p.keyboard.up("Alt");
    await p.waitForTimeout(80);
    assert.equal(await p.locator(".zoom-label").innerText(), "125%");
    pass("actual DAG edges, bounded zoom, reset, keys, drag and Alt-wheel");
    await p
      .getByRole("button", { name: "切换执行面板宽度", exact: true })
      .click();
    assert.equal(
      Math.round(
        await p
          .locator(".execution-panel")
          .evaluate((e) => e.getBoundingClientRect().width),
      ),
      420,
    );
    await p.getByRole("button", { name: "收起执行计划", exact: true }).click();
    assert.equal(await p.locator(".execution-panel").count(), 0);
    await p.getByRole("button", { name: /^执行计划 ·/ }).click();
    await p.getByRole("button", { name: "步骤", exact: true }).click();
    pass("execution panel width, collapse and restoration retains task");
    const button = p.getByRole("button", { name: "确认办理", exact: true });
    const normal = await button.evaluate(
      (e) => getComputedStyle(e).backgroundColor,
    );
    await button.hover();
    await p.waitForTimeout(20);
    const hover = await button.evaluate(
      (e) => getComputedStyle(e).backgroundColor,
    );
    assert.notEqual(normal, hover);
    await p.mouse.down();
    const pressed = await button.evaluate(
      (e) => getComputedStyle(e).backgroundColor,
    );
    await p.mouse.move(10, 10);
    await p.mouse.up();
    assert.notEqual(hover, pressed);
    await button.focus();
    await p.keyboard.press("Tab");
    await p.keyboard.press("Shift+Tab");
    assert.equal(
      await button.evaluate((e) => getComputedStyle(e).outlineStyle),
      "solid",
    );
    pass("primary button hover, pressed and keyboard focus differ");
    await p.getByRole("button", { name: "取消任务", exact: true }).click();
    await p.getByTestId("final-answer").filter({ hasText: "已取消" }).waitFor();
    await p.getByRole("button", { name: "交易分析", exact: true }).click();
    let delayed = true;
    await p.route("**/api/analytics?period=last_month", async (r) => {
      if (delayed) {
        delayed = false;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await r.continue();
    });
    await p.getByLabel("交易期间").selectOption("last_month");
    await p.locator(".skeleton").first().waitFor();
    assert(
      await p
        .getByRole("button", { name: "导出流水", exact: true })
        .isDisabled(),
    );
    await p.getByRole("heading", { name: "没有匹配的交易" }).waitFor();
    pass("skeleton reflects delayed request; export blocked until real data");
    await p.route("**/api/analytics?period=year", async (r) =>
      r.fulfill({
        status: 500,
        json: {
          error: { message: "测试夹具：交易数据读取失败，未执行业务。" },
        },
      }),
    );
    await p.getByLabel("交易期间").selectOption("year");
    await p.getByRole("alert").waitFor();
    await p.unroute("**/api/analytics?period=year");
    await p.getByRole("button", { name: "重新读取", exact: true }).click();
    await p.getByRole("alert").waitFor({ state: "hidden" });
    await p.locator(".data-table tbody tr").first().waitFor();
    pass(
      "read-only failure has a working safe reload",
      "labelled HTTP failure fixture",
    );
    await p.getByRole("button", { name: "活动日志", exact: true }).click();
    await p.getByRole("tab", { name: /Agent 任务/ }).focus();
    await p.keyboard.press("ArrowRight");
    assert.equal(
      await p
        .getByRole("tab", { name: "审计事件", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await p.getByText("哈希链校验通过", { exact: true }).waitFor();
    pass("tabs expose selection and support arrow keys");
    report.contrast = await p.evaluate(() => {
      const root = getComputedStyle(document.documentElement),
        hex = (n) => root.getPropertyValue("--" + n).trim(),
        rgb = (h) => {
          h = h.slice(1);
          if (h.length === 3)
            h = h
              .split("")
              .map((x) => x + x)
              .join("");
          return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        },
        l = (h) =>
          rgb(h)
            .map((c) =>
              c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
            )
            .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
      return [
        ["text", "surface", 4.5],
        ["text-secondary", "surface-nav", 4.5],
        ["text-muted", "surface-nav", 4.5],
        ["text-muted", "surface-subtle", 4.5],
        ["text-inverse", "primary", 4.5],
        ["primary-text", "primary-subtle", 4.5],
        ["primary-text", "surface-subtle", 4.5],
        ["primary-text", "surface-hover", 4.5],
        ["success", "success-bg", 4.5],
        ["warning", "warning-bg", 4.5],
        ["danger", "danger-bg", 4.5],
        ["processing", "processing-bg", 4.5],
        ["border-strong", "surface", 3],
        ["focus", "surface", 3],
      ].map(([fg, bg, min]) => ({
        fg,
        bg,
        min,
        ratio:
          (Math.max(l(hex(fg)), l(hex(bg))) + 0.05) /
          (Math.min(l(hex(fg)), l(hex(bg))) + 0.05),
      }));
    });
    assert(report.contrast.every((c) => c.ratio >= c.min));
    pass(
      "all documented text pairs, interactive boundary and focus contrast pass",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => {
      location.hash = "dashboard";
    });
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    const taskTable = p.locator(".task-table");
    assert(
      await taskTable.evaluate((t) => {
        const box = t.parentElement.getBoundingClientRect();
        const status = t
          .querySelector("tbody td:nth-child(2)")
          .getBoundingClientRect();
        return t.scrollWidth <= box.width + 1 && status.right <= box.right + 1;
      }),
    );
    await p.evaluate(() => {
      location.hash = "workspace";
    });
    await p.getByLabel("业务需求").waitFor();
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    assert(
      await p.evaluate(() =>
        document.activeElement.classList.contains("brand"),
      ),
    );
    await p.keyboard.press("Shift+Tab");
    assert.equal(
      await p.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "退出登录",
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(30);
    assert.equal(
      await p.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "打开导航",
    );
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    await p.getByRole("button", { name: "Agent 工作台", exact: true }).click();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(
      await input.evaluate((e) => getComputedStyle(e).fontSize),
      "16px",
    );
    assert.equal(
      await p
        .locator(".spin")
        .evaluateAll((es) =>
          es.every((e) => getComputedStyle(e).animationName === "none"),
        ),
      true,
    );
    pass("phone drawer keyboard, body width, input text and reduced motion");
    await p.screenshot({
      path: path.join(out, "mobile-verified.png"),
      fullPage: true,
    });
    assert.equal(authorizations, 0);
    assert.deepEqual(report.errors, []);
    pass(
      "no authorization or financial commit from UI-only tests; no console/CSP errors",
    );
  } finally {
    await b.close();
    fs.writeFileSync(
      "evals/results/premium-interactions.json",
      JSON.stringify(report, null, 2),
    );
  }
}
main().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    "evals/results/premium-interactions.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
