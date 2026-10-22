const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { fixture } = require("./clarity-fixtures.cjs");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8795";
const out = path.resolve("artifacts/screenshots/conversation/final");
fs.mkdirSync(out, { recursive: true });
const report = {
  mode: "real-isolated-offline-conversation-and-labelled-lifecycle",
  checks: [],
  errors: [],
  screenshots: [],
};
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    p.on("pageerror", (e) => report.errors.push(e.message));
    const shot = async (name) => {
      await p.screenshot({ path: path.join(out, name + ".png") });
      report.screenshots.push(name + ".png");
    };
    await p.goto(base);
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    await p.getByRole("button", { name: "新对话", exact: true }).click();
    await p
      .getByRole("heading", { name: "今天需要办理什么？", exact: true })
      .waitFor();
    await p.waitForTimeout(300);
    await shot("01-empty-1600");
    async function ask(text, count, state = "执行成功") {
      await p.getByLabel("业务需求").fill(text);
      await p.getByRole("button", { name: "发送任务", exact: true }).click();
      await p.waitForFunction(
        ({ count, state }) =>
          document.querySelectorAll(".conversation-turn").length === count &&
          document.querySelector(".current-turn .task-state")?.textContent ===
            state,
        { count, state },
      );
      await p.waitForFunction(
        () =>
          !document.querySelector('[aria-label="发送任务"]')?.disabled ||
          !document.querySelector("#message")?.value,
      );
      await p.waitForTimeout(180);
    }
    await ask("分析本月账单", 1);
    assert.equal(await p.evaluate(() => document.activeElement?.id), "message");
    await ask("那上月呢", 2);
    await ask("查询我的卡片", 3);
    assert.equal(await p.getByTestId("previous-answer").count(), 2);
    assert(
      (await p.getByTestId("previous-answer").first().innerText()).includes(
        "5,963.20",
      ),
    );
    assert(
      (await p.getByTestId("previous-answer").nth(1).innerText()).includes(
        "上月",
      ),
    );
    assert((await p.getByTestId("final-answer").innerText()).includes("1024"));
    const beforeReload = await p.evaluate(
      async () => (await (await fetch("/api/runs")).json()).runs.length,
    );
    await shot("02-three-turns-1600");
    await p.reload();
    await p.waitForFunction(
      () => document.querySelectorAll(".conversation-turn").length === 3,
    );
    assert.equal(
      await p.evaluate(
        async () => (await (await fetch("/api/runs")).json()).runs.length,
      ),
      beforeReload,
    );
    pass(
      "three consecutive turns retain prior answers and elliptical context; reload restores history without replay",
    );
    for (const [width, height] of [
      [1600, 900],
      [1280, 800],
      [768, 900],
      [390, 844],
    ]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(400);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const dock = await p.locator(".composer-dock").boundingBox();
      assert(
        dock.y + dock.height <= height + 1,
        `composer below viewport at ${width}`,
      );
      assert(dock.y >= 60);
      const e = p.locator(".conversation-scroll");
      await e.evaluate((n) => (n.scrollTop = 0));
      await p.waitForTimeout(100);
      assert(await p.getByLabel("业务需求").isVisible());
      await shot(`03-thread-${width}`);
    }
    pass(
      "conversation scrolls independently and composer remains visible at four viewport sizes",
    );
    await p.setViewportSize({ width: 1600, height: 900 });
    await p.waitForTimeout(350);
    await ask("给李娜转300元", 4, "等待用户确认");
    await ask("查询余额", 5);
    const old = p.locator(".conversation-turn").nth(3);
    assert(
      await old
        .getByRole("button", { name: "确认转账", exact: true })
        .isVisible(),
    );
    const balance = await p.evaluate(
      async () =>
        (await (await fetch("/api/overview")).json()).accounts[0].balance_cents,
    );
    await old.getByRole("button", { name: "确认转账", exact: true }).click();
    await p.waitForFunction(
      () =>
        document
          .querySelectorAll(".conversation-turn")[3]
          ?.querySelector(".task-state")?.textContent === "执行成功",
    );
    assert.equal(
      await p.evaluate(
        async () =>
          (await (await fetch("/api/overview")).json()).accounts[0]
            .balance_cents,
      ),
      balance - 30000,
    );
    assert((await old.innerText()).includes("已向李娜"));
    await shot("04-earlier-turn-authorized");
    pass(
      "earlier pending operation remains actionable after a follow-up and updates its own turn only after explicit confirmation",
    );
    await ask("给李娜转50元", 6, "等待用户确认");
    await ask("改成30元", 7, "等待用户确认");
    assert.equal(
      await p
        .locator(".conversation-turn")
        .nth(5)
        .locator(".task-state")
        .innerText(),
      "已取消",
    );
    assert.equal(
      await p.getByRole("button", { name: "确认转账", exact: true }).count(),
      1,
    );
    pass(
      "editing a pending transfer cancels the old authorization while retaining both messages",
    );
    await p.getByRole("button", { name: "新对话", exact: true }).click();
    await p
      .getByRole("heading", { name: "今天需要办理什么？", exact: true })
      .waitFor();
    assert.equal(await p.locator(".conversation-turn").count(), 0);
    await p.getByRole("button", { name: "选择场景", exact: true }).click();
    await p.getByRole("group", { name: "业务场景选择" }).waitFor();
    await p.waitForTimeout(300);
    assert.equal(await p.locator(".scenario-picker button").count(), 6);
    assert.equal(
      await p.locator(".scenario-picker button .scenario-icon svg").count(),
      6,
    );
    await shot("05-scenario-icons");
    await p
      .locator(".scenario-picker button")
      .filter({ hasText: "储蓄目标" })
      .click();
    assert(
      (await p.locator(".selected-mode").innerText()).includes("储蓄目标"),
    );
    assert.equal(await p.locator(".selected-mode svg").count(), 2);
    await shot("06-goal-mode");
    await p.getByRole("button", { name: "清除已选场景", exact: true }).click();
    assert.equal(await p.locator(".selected-mode").count(), 0);
    assert((await p.getByLabel("业务需求").inputValue()).includes("旅行"));
    pass(
      "six scenarios have consistent icons; selected goal mode is visible and can be cleared without sending",
    );
    let phase = 0;
    const seed = fixture("running");
    seed.id = "conversation-lifecycle-fixture";
    seed.conversation_id = "conversation-fixture";
    seed.created_at = new Date().toISOString();
    seed.message = seed.plan.message = "分析账单（交互检查夹具）";
    seed.plan.conversation_id = seed.conversation_id;
    function payload(after = 0) {
      const r = structuredClone(seed);
      r.status = phase === 3 ? "succeeded" : "running";
      r.plan = phase === 0 ? null : r.plan;
      r.events = [
        {
          seq: 1,
          type: "model.started",
          at: seed.created_at,
          data: { planner_mode: "fixture" },
        },
      ];
      if (phase > 0)
        r.events.push({
          seq: 2,
          type: "tool.started",
          at: seed.created_at,
          data: { tool: "bills", node_id: "n1" },
        });
      if (phase >= 2) {
        r.plan.nodes[0].status = "succeeded";
        r.events.push(
          { seq: 3, type: "response.started", at: seed.created_at, data: {} },
          {
            seq: 4,
            type: "response.delta",
            at: seed.created_at,
            data: { text: "本月核验结果正在分段显示。" },
          },
        );
      }
      if (phase === 3) {
        r.plan.status = "succeeded";
        r.plan.answer = {
          title: "分析结论",
          paragraphs: [
            "本月核验结果正在分段显示。",
            "账单查询已完成，未发生写入。",
          ],
          source: "fixture",
          evidence: [],
        };
        r.reply = r.plan.answer.paragraphs.join("\n\n");
        r.events.push({
          seq: 5,
          type: "response.completed",
          at: seed.created_at,
          data: {},
        });
      }
      r.events = r.events.filter((e) => e.seq > after);
      return r;
    }
    await p.route("**/api/conversations/conversation-fixture", (r) =>
      r.fulfill({
        json: {
          conversation_id: seed.conversation_id,
          runs: [payload()],
          has_more: false,
        },
      }),
    );
    await p.route("**/api/runs", (r) =>
      r.request().method() === "POST"
        ? r.fulfill({ status: 202, json: payload() })
        : r.continue(),
    );
    await p.route("**/api/runs/conversation-lifecycle-fixture**", (r) =>
      r.fulfill({
        json: payload(
          Number(new URL(r.request().url()).searchParams.get("after")) || 0,
        ),
      }),
    );
    await p.getByLabel("业务需求").fill("分析账单（交互检查夹具）");
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.locator(".thinking-mark").waitFor();
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    assert.equal(
      await p
        .locator(".thinking-mark i")
        .evaluateAll(
          (es) =>
            es.filter((e) => getComputedStyle(e).animationName !== "none")
              .length,
        ),
      3,
    );
    await shot("07-planning-animation");
    phase = 1;
    await p.locator(".live-tool-preview").waitFor();
    assert(
      (await p.locator(".live-tool-preview").innerText()).includes("账单分析"),
    );
    await shot("08-visible-tool-action");
    phase = 2;
    await p.getByTestId("streaming-answer").waitFor();
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    await p.locator(".execution-inline").waitFor();
    await p.waitForTimeout(300);
    await shot("09-expanded-workflow");
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    await p.locator(".execution-inline").waitFor({ state: "detached" });
    phase = 3;
    await p.getByTestId("final-answer").waitFor();
    assert.equal(await p.locator(".thinking-mark").count(), 0);
    assert.equal(await p.locator(".execution-inline").count(), 0);
    pass(
      "observable planning and tool activity animate before streamed answer; final state stops animation and respects manual closure",
    );
    await p.getByRole("button", { name: "新对话", exact: true }).click();
    phase = 0;
    await p.getByLabel("业务需求").fill("动画偏好检查");
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.locator(".thinking-mark").waitFor();
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await p
        .locator(".thinking-mark i")
        .evaluateAll(
          (es) =>
            es.filter((e) => getComputedStyle(e).animationName !== "none")
              .length,
        ),
      0,
    );
    phase = 3;
    await p.getByTestId("final-answer").waitFor();
    assert.deepEqual(report.errors, []);
    pass(
      "reduced-motion immediately stops thinking animation; no JavaScript errors",
    );
  } finally {
    await b.close();
    fs.writeFileSync(
      "evals/results/conversation-ui.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    "evals/results/conversation-ui.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
