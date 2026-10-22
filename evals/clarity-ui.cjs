const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { fixture } = require("./clarity-fixtures.cjs");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:5173",
  out = path.resolve(
    process.env.TRACEBANK_SCREENSHOT_DIR ||
      "artifacts/screenshots/clarity/verification",
  );
fs.mkdirSync(out, { recursive: true });
const report = {
  base,
  mode: "labelled-state-fixtures-and-real-read-only-pages",
  checks: [],
  errors: [],
  expected_graph_failures: [],
  viewports: [],
  contrast: [],
  business_writes: 0,
};
const pass = (n) => {
  report.checks.push(n);
  console.log("PASS", n);
};
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    async function open(state = "empty", { graphFailure = false } = {}) {
      const p = await b.newPage({
        viewport: { width: 1600, height: 900 },
        reducedMotion: "reduce",
      });
      let posts = 0;
      p.on("pageerror", (e) => report.errors.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("401")) {
          if (graphFailure) report.expected_graph_failures.push(m.text());
          else report.errors.push(m.text());
        }
      });
      p.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/operations/"))
          report.business_writes++;
      });
      const data = fixture(state === "complex" ? "success" : state);
      if (state === "complex") {
        data.id = "fixture-run-complex";
        data.message = data.plan.message = "依赖图检查夹具";
        data.plan.nodes = [
          {
            id: "n1",
            tool: "bills",
            status: "succeeded",
            params: {},
            depends_on: [],
            result: {
              total_expense_cents: 596320,
              transaction_count: 12,
              categories: [],
            },
          },
          {
            id: "n2",
            tool: "cards",
            status: "succeeded",
            params: {},
            depends_on: [],
            result: { cards: [] },
          },
          {
            id: "n3",
            tool: "balance",
            status: "succeeded",
            params: {},
            depends_on: ["n1", "n2"],
            result: { accounts: [] },
          },
        ];
        data.plan.answer.paragraphs = [
          "三个查询步骤已完成，这是依赖图检查夹具。",
        ];
      }
      await p.route("**/api/conversations/*", (r) =>
        r.fulfill({
          json: {
            conversation_id: data.conversation_id,
            runs: [data],
            has_more: false,
          },
        }),
      );
      await p.route("**/api/runs", async (r) => {
        if (r.request().method() === "POST") {
          posts++;
          await r.fulfill({ status: 202, json: data });
        } else await r.continue();
      });
      await p.route("**/api/runs/fixture-run-*", (r) =>
        r.fulfill({
          json: {
            ...data,
            events: data.events.filter(
              (e) =>
                e.seq >
                Number(
                  new URL(r.request().url()).searchParams.get("after") || 0,
                ),
            ),
          },
        }),
      );
      if (graphFailure) await p.route("**/*PlanMap*", (r) => r.abort("failed"));
      await p.goto(base, { waitUntil: "networkidle" });
      await p
        .getByRole("button", { name: "进入拾迹银行", exact: true })
        .click();
      await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
      await p
        .getByRole("button", { name: "Agent 工作台", exact: true })
        .click();
      await p.getByLabel("业务需求").waitFor();
      await p.waitForTimeout(180);
      if (state !== "empty") {
        await p.getByLabel("业务需求").fill(data.message);
        await p.getByRole("button", { name: "发送任务", exact: true }).click();
        await p.waitForTimeout(250);
      }
      return { p, data, posts: () => posts };
    }
    let { p } = await open();
    assert.equal(
      await p.getByRole("button", { name: "新对话", exact: true }).count(),
      1,
    );
    assert.equal(await p.getByText("模拟环境", { exact: true }).count(), 1);
    assert.equal(await p.locator(".plan-map").count(), 0);
    assert.equal(await p.locator(".plan-empty").count(), 0);
    assert(!(await p.locator("body").innerText()).includes("可追溯"));
    await p.getByRole("button", { name: "选择场景", exact: true }).click();
    assert.equal(await p.locator(".scenario-picker button").count(), 6);
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    assert((await p.getByLabel("业务需求").inputValue()).length > 0);
    assert.equal(await p.locator(".scenario-picker").count(), 0);
    pass(
      "empty task has one new action, one simulation label, six real prefills and no dummy workflow",
    );
    await p.close();
    for (const state of [
      "planning",
      "running",
      "waiting",
      "success",
      "failed",
      "cancelled",
      "partial",
      "unknown",
    ]) {
      const current = await open(state);
      p = current.p;
      assert.equal(await p.locator(".task-heading .task-state").count(), 1);
      const text = await p.locator("body").innerText();
      assert(
        !text.includes("fixture-plan-") &&
          !text.includes("fixture-op-") &&
          !text.includes("条执行记录"),
      );
      assert.equal(await p.locator(".execution-inline").count(), 0);
      assert.equal(await p.locator(".plan-map").count(), 0);
      if (["planning", "running"].includes(state))
        assert.equal(await p.getByTestId("final-answer").count(), 0);
      if (state === "waiting") {
        const fields = await p
          .locator(".task-authorization .field-list")
          .innerText();
        assert(
          fields.includes("日常活期账户") &&
            fields.includes("李娜") &&
            fields.includes("300.00") &&
            !fields.includes("13900000001"),
        );
        assert(
          await p
            .getByRole("button", { name: "确认转账", exact: true })
            .isEnabled(),
        );
        await p
          .getByRole("button", { name: "显示完整收款信息", exact: true })
          .click();
        assert(
          (await p.locator(".field-list").innerText()).includes("13900000001"),
        );
        await p
          .getByRole("button", { name: "隐藏完整收款信息", exact: true })
          .click();
      }
      if (state === "cancelled") {
        assert(text.includes("转账未执行"));
        const before = current.posts();
        await p.getByRole("button", { name: "重新发起", exact: true }).click();
        assert.equal(
          await p.getByLabel("业务需求").inputValue(),
          current.data.message,
        );
        assert.equal(current.posts(), before);
        await p.close();
        continue;
      }
      if (state === "partial") {
        assert(
          text.includes("已向李娜转账") &&
            text.includes("不会因取消任务而撤销"),
        );
        assert.equal(
          await p
            .getByRole("button", { name: "重新发起", exact: true })
            .count(),
          0,
        );
      }
      if (state === "unknown") {
        assert(
          await p
            .getByRole("button", { name: "查询原操作，核实结果", exact: true })
            .isVisible(),
        );
        assert.equal(
          await p
            .getByRole("button", { name: "确认转账", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await p
            .getByRole("button", { name: "重新发起", exact: true })
            .count(),
          0,
        );
      }
      await p
        .getByRole("button", { name: "查看执行详情", exact: true })
        .click();
      await p.getByRole("heading", { name: "执行详情", exact: true }).waitFor();
      assert.equal(
        await p.locator(".technical-log").getAttribute("open"),
        null,
      );
      await p.keyboard.press("Control+k");
      assert.equal(await p.locator("dialog[open]").count(), 1);
      await p.keyboard.press("Escape");
      await p.locator("dialog[open]").waitFor({ state: "detached" });
      await p.locator(".technical-log > summary").focus();
      await p.locator(".technical-log > summary").click();
      if (state !== "planning") {
        const raw = p
          .locator(".data-details")
          .filter({ has: p.getByText("原始任务数据", { exact: true }) });
        await raw.locator("summary").click();
        assert(await raw.locator("pre").isVisible());
        assert(
          (await raw.locator("pre").innerText()).includes(current.data.plan.id),
        );
      }
      await p.keyboard.press("Escape");
      assert.equal(
        await p.evaluate(() => document.activeElement?.id),
        "execution-trigger",
      );
      await p.close();
    }
    pass(
      "all eight task states retain facts, direct confirmation, source account, privacy, explicit retry and layered evidence",
    );
    ({ p } = await open("complex"));
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    assert.equal(await p.locator(".plan-map").count(), 0);
    assert.equal(await p.locator(".plan-node").count(), 3);
    await p
      .getByRole("button", { name: "打开完整依赖图", exact: true })
      .click();
    await p.locator(".plan-map svg").waitFor();
    assert.equal(await p.locator(".map-edge").count(), 2);
    const map = p.locator(".plan-map");
    await map.hover();
    await p.mouse.wheel(0, -70);
    await p.waitForTimeout(100);
    assert.equal(await p.locator(".zoom-label").innerText(), "125%");
    await p.getByRole("button", { name: "重置依赖图", exact: true }).click();
    assert.equal(await p.locator(".zoom-label").innerText(), "100%");
    await map.focus();
    const box = await map.locator("svg").getAttribute("viewBox");
    await p.keyboard.press("ArrowRight");
    assert.notEqual(await map.locator("svg").getAttribute("viewBox"), box);
    await p.keyboard.press("0");
    const panBefore = await map.locator("svg").getAttribute("viewBox"),
      rect = await map.boundingBox();
    await p.mouse.move(rect.x + 12, rect.y + 12);
    await p.mouse.down();
    await p.mouse.move(rect.x + 48, rect.y + 32);
    await p.mouse.up();
    assert.notEqual(
      await map.locator("svg").getAttribute("viewBox"),
      panBefore,
    );
    await p.getByRole("button", { name: "重置依赖图", exact: true }).click();
    await p
      .getByRole("button", { name: "查看账单分析节点", exact: true })
      .focus();
    await p.keyboard.press("Enter");
    assert(
      await p
        .getByRole("region", { name: "选中节点", exact: true })
        .isVisible(),
    );
    await p.screenshot({
      path: path.join(out, "graph-and-node-1600.png"),
      fullPage: true,
    });
    await p.close();
    pass(
      "complex DAG remains optional; real edges, natural zoom, fit, pan and keyboard node inspection work",
    );
    ({ p } = await open("complex", { graphFailure: true }));
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    await p.route("**/*PlanMap*", (r) => r.abort("failed"));
    await p
      .getByRole("button", { name: "打开完整依赖图", exact: true })
      .click();
    await p
      .getByRole("alert")
      .filter({ hasText: "依赖图暂时无法载入" })
      .waitFor();
    await p.getByRole("button", { name: "返回步骤", exact: true }).click();
    assert.equal(await p.locator(".plan-node").count(), 3);
    await p.close();
    pass(
      "failed graph chunk is contained; business steps and app remain usable",
    );
    ({ p } = await open("waiting"));
    for (const [width, height] of [
      [1600, 900],
      [1280, 800],
      [768, 900],
      [390, 844],
    ]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(120);
      for (const [id, label] of [
        ["workspace", "Agent 工作台"],
        ["dashboard", "业务总览"],
        ["analytics", "交易分析"],
        ["approvals", "审批中心"],
        ["activity", "活动日志"],
      ]) {
        if (width <= 800)
          await p
            .getByRole("button", { name: "打开导航", exact: true })
            .click();
        await p.getByRole("button", { name: label, exact: true }).click();
        await p.waitForTimeout(160);
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${id} ${width}`,
        );
        await p.screenshot({
          path: path.join(out, `${id}-${width}.png`),
          fullPage: true,
        });
        report.viewports.push({ id, width, height, overflow: false });
      }
    }
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    await p.getByRole("button", { name: "Agent 工作台", exact: true }).click();
    assert.equal(
      await p
        .getByLabel("业务需求")
        .evaluate((e) => getComputedStyle(e).fontSize),
      "16px",
    );
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    assert(
      await p
        .getByRole("button", { name: "收起执行详情", exact: true })
        .evaluate(
          (e) =>
            e.getBoundingClientRect().width >= 44 &&
            e.getBoundingClientRect().height >= 44,
        ),
    );
    await p.keyboard.press("Escape");
    pass(
      "five pages fit four viewports; mobile input, detail focus and close target remain accessible",
    );
    report.contrast = await p.evaluate(() => {
      const root = getComputedStyle(document.documentElement),
        hex = (n) => root.getPropertyValue("--" + n).trim();
      const luminance = (h) => {
        h = h.slice(1);
        if (h.length === 3)
          h = h
            .split("")
            .map((c) => c + c)
            .join("");
        return [0, 2, 4]
          .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
          .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
      };
      return [
        ["text", "surface"],
        ["text-muted", "background"],
        ["text-secondary", "surface"],
        ["nav-text", "surface-nav"],
        ["nav-muted", "surface-nav"],
        ["nav-active-text", "nav-active"],
        ["text-inverse", "primary"],
        ["primary-text", "surface-hover"],
        ["warning", "warning-bg"],
        ["danger", "danger-bg"],
        ["success", "success-bg"],
      ].map(([fg, bg]) => ({
        fg,
        bg,
        ratio:
          (Math.max(luminance(hex(fg)), luminance(hex(bg))) + 0.05) /
          (Math.min(luminance(hex(fg)), luminance(hex(bg))) + 0.05),
      }));
    });
    assert(report.contrast.every((c) => c.ratio >= 4.5));
    await p.close();
    pass("all eleven foreground/background contracts meet AA text contrast");
    assert.equal(report.business_writes, 0);
    assert.deepEqual(report.errors, []);
    pass(
      "state/graph inspection issued no financial writes and no unexpected console/CSP errors",
    );
  } finally {
    await b.close();
    fs.writeFileSync(
      process.env.TRACEBANK_RESULTS_PATH || "evals/results/clarity-ui.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    process.env.TRACEBANK_RESULTS_PATH || "evals/results/clarity-ui.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
