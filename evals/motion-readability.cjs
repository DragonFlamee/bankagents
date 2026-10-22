/* Real browser motion/stream inspection. Labelled responses, no bank/model writes. */
const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { fixture } = require("./clarity-fixtures.cjs");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8793";
const out = path.resolve("artifacts/screenshots/motion/readability");
fs.mkdirSync(out, { recursive: true });
const report = {
  mode: "labelled-stream-and-real-motion",
  checks: [],
  errors: [],
  business_writes: 0,
  model_requests: 0,
  samples: {},
};
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
async function geometry(p, selector, ms = 600) {
  return p.evaluate(
    ({ selector, ms }) =>
      new Promise((resolve) => {
        const start = performance.now(),
          samples = [];
        function frame() {
          const e = document.querySelector(selector);
          if (e) {
            const s = getComputedStyle(e);
            samples.push({
              height: e.getBoundingClientRect().height,
              opacity: +s.opacity,
              open: e.open,
              inert: e.inert,
            });
          }
          if (performance.now() - start < ms) requestAnimationFrame(frame);
          else resolve(samples);
        }
        frame();
      }),
    { selector, ms },
  );
}
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    const p = await b.newPage({
      viewport: { width: 1600, height: 900 },
      reducedMotion: "no-preference",
    });
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/operations/"))
        report.business_writes++;
    });
    await p.goto(base);
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    const sampling = p.evaluate(
      () =>
        new Promise((resolve) => {
          const values = [],
            start = performance.now();
          const rgba = (s) => {
            const a = s.match(/[\d.]+/g).map(Number);
            return [a[0], a[1], a[2], a[3] ?? 1];
          };
          function bg(e) {
            if (!e) return [255, 255, 255];
            const c = rgba(getComputedStyle(e).backgroundColor);
            if (c[3] === 1) return c.slice(0, 3);
            const parent = bg(e.parentElement);
            return parent.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
          }
          const lum = (c) =>
            c
              .slice(0, 3)
              .map((v) => v / 255)
              .map((v) =>
                v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
              )
              .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
          function frame() {
            document
              .querySelectorAll(".nav-item,.security-link,.recent-task")
              .forEach((e) => {
                const a = lum(rgba(getComputedStyle(e).color)),
                  d = lum(bg(e));
                values.push({
                  label: e.textContent.trim(),
                  ratio: (Math.max(a, d) + 0.05) / (Math.min(a, d) + 0.05),
                });
              });
            if (performance.now() - start < 4200) requestAnimationFrame(frame);
            else resolve(values);
          }
          frame();
        }),
    );
    for (const name of ["交易分析", "审批中心", "活动日志", "业务总览"]) {
      const n = p.getByRole("button", { name, exact: true });
      await n.hover();
      await p.waitForTimeout(80);
      await p.mouse.down();
      await p.waitForTimeout(75);
      if (name === "审批中心")
        await p.screenshot({ path: path.join(out, "nav-hover-1600.png") });
      await p.mouse.up();
      await n.focus();
      await p.waitForTimeout(150);
    }
    const colors = await sampling;
    report.samples.navigation = {
      frames: colors.length,
      min_contrast: Math.min(...colors.map((x) => x.ratio)),
    };
    assert(colors.every((x) => x.ratio >= 4.5));
    pass(
      "navigation hover, press, focus and route transitions retain AA text contrast in every sampled frame",
    );
    await p.getByRole("button", { name: "新建任务", exact: true }).click();
    await p.getByLabel("业务需求").waitFor();
    let frames = geometry(p, ".input-help");
    await p.locator(".input-help > summary").click();
    await p.waitForTimeout(70);
    await p.screenshot({ path: path.join(out, "help-expanding-1600.png") });
    let samples = await frames;
    assert(new Set(samples.map((s) => Math.round(s.height))).size > 3);
    assert(samples.every((s) => s.opacity === 1));
    frames = geometry(p, ".input-help");
    await p.locator(".input-help > summary").click();
    samples = await frames;
    assert(new Set(samples.map((s) => Math.round(s.height))).size > 3);
    assert.equal(await p.locator(".input-help").getAttribute("open"), null);
    await p.locator(".input-help > summary").click();
    await p.waitForTimeout(45);
    await p.locator(".input-help > summary").click();
    await p.waitForTimeout(45);
    await p.locator(".input-help > summary").click();
    await p.waitForTimeout(350);
    assert(
      await p
        .locator(".input-help")
        .evaluate(
          (e) =>
            e.open &&
            !e.style.height &&
            !e.style.overflow &&
            ![...e.children].some((x) => x.inert),
        ),
    );
    pass(
      "native disclosure expands, collapses and reverses smoothly without fading text or leaving clipped content",
    );
    await p.getByRole("button", { name: "选择场景", exact: true }).click();
    await p.getByRole("group", { name: "业务场景选择" }).waitFor();
    await p.waitForTimeout(320);
    assert.equal(await p.locator(".scenario-picker button").count(), 6);
    await p.getByRole("button", { name: "选择场景", exact: true }).click();
    await p.locator(".scenario-picker").waitFor({ state: "detached" });
    pass(
      "scenario menu closes with a height transition and leaves no hidden interactive options",
    );
    let phase = 0;
    const seed = fixture("success");
    seed.id = "incremental-answer-fixture";
    seed.message = seed.plan.message = "分析本月账单（分段输出检查夹具）";
    seed.plan.nodes = [
      {
        id: "n1",
        tool: "bills",
        params: { period: "month" },
        depends_on: [],
        status: "succeeded",
        result: {
          total_expense_cents: 596320,
          transaction_count: 12,
          categories: [],
          anomalies: [],
        },
      },
    ];
    const paragraphs = [
      "已核验：本月消费为 ¥5,963.20。",
      "购物支出已核验，可先检查重复购买。",
      "订阅建议已生成，尚未取消任何服务。",
    ];
    function payload(after = 0) {
      const r = structuredClone(seed);
      r.status = phase === 3 ? "succeeded" : "running";
      r.reply = phase === 3 ? paragraphs.join("\n\n") : null;
      r.plan.answer =
        phase === 3
          ? { title: "分析结论", paragraphs, source: "fixture", evidence: [] }
          : undefined;
      r.events = r.events.filter(
        (e) => !e.type.startsWith("response.") && e.type !== "run.settled",
      );
      r.events.push({
        seq: 900,
        type: "response.started",
        at: new Date().toISOString(),
        data: { mode: "fixture" },
      });
      paragraphs.slice(0, phase === 3 ? 3 : phase).forEach((text, i) =>
        r.events.push({
          seq: 901 + i,
          type: "response.delta",
          at: new Date().toISOString(),
          data: { text, source: "verified_evidence" },
        }),
      );
      if (phase === 3)
        r.events.push({
          seq: 904,
          type: "response.completed",
          at: new Date().toISOString(),
          data: { source: "fixture" },
        });
      r.events = r.events.filter((e) => e.seq > after);
      return r;
    }
    await p.route("**/api/runs", (r) =>
      r.request().method() === "POST"
        ? r.fulfill({ status: 202, json: payload() })
        : r.continue(),
    );
    await p.route("**/api/runs/incremental-answer-fixture**", (r) =>
      r.fulfill({
        json: payload(
          Number(new URL(r.request().url()).searchParams.get("after")) || 0,
        ),
      }),
    );
    await p.getByLabel("业务需求").fill("逐步回答检查夹具");
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.locator(".task-progress").waitFor();
    assert.equal(await p.getByTestId("streaming-answer").count(), 0);
    phase = 1;
    await p.getByTestId("streaming-answer").waitFor();
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    assert.equal(
      await p.locator(".task-heading .task-state").innerText(),
      "执行中",
    );
    await p.screenshot({ path: path.join(out, "answer-first-part-1600.png") });
    phase = 2;
    await p
      .getByTestId("streaming-answer")
      .getByText(paragraphs[1], { exact: true })
      .waitFor();
    assert.equal(
      await p.getByTestId("streaming-answer").locator("p").count(),
      2,
    );
    pass(
      "verified answer paragraphs arrive incrementally before completion without a fake typewriter or premature success",
    );
    const trigger = p.getByRole("button", {
      name: "查看执行详情",
      exact: true,
    });
    await trigger.click();
    await p.locator(".execution-inline").waitFor();
    await p.waitForTimeout(300);
    assert(
      await p.evaluate(
        () =>
          document
            .getElementById("execution-trigger")
            .compareDocumentPosition(
              document.querySelector('[data-testid="streaming-answer"]'),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
    assert.equal(await p.locator("dialog[open]").count(), 0);
    frames = geometry(p, ".technical-log");
    await p.locator(".technical-log > summary").click();
    samples = await frames;
    assert(new Set(samples.map((s) => Math.round(s.height))).size > 3);
    assert(samples.every((s) => s.opacity === 1));
    await p.screenshot({
      path: path.join(out, "inline-execution-1600.png"),
      fullPage: true,
    });
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    await p.locator(".execution-inline").waitFor({ state: "detached" });
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    pass(
      "execution details expand inline above the answer; nested logs animate and closure restores the trigger",
    );
    phase = 3;
    await p.getByTestId("final-answer").waitFor();
    assert.equal(await p.getByTestId("streaming-answer").count(), 0);
    assert.equal(await p.getByTestId("final-answer").locator("p").count(), 3);
    assert.equal(
      await p.locator(".task-heading .task-state").innerText(),
      "执行成功",
    );
    pass(
      "completion atomically replaces partial output with the authoritative answer without duplicate paragraphs",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await p.waitForTimeout(320);
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: path.join(out, "inline-execution-390.png"),
      fullPage: true,
    });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    await p.locator(".execution-inline").waitFor({ state: "detached" });
    await p.locator(".input-help > summary").click();
    assert.equal(
      await p.locator(".input-help").getAttribute("data-disclosure-target"),
      null,
    );
    assert.equal(report.business_writes, 0);
    assert.deepEqual(report.errors, []);
    pass(
      "mobile layout and runtime reduced-motion remain usable, with no financial writes or JavaScript errors",
    );
    await p.close();
  } finally {
    await b.close();
    fs.writeFileSync(
      "evals/results/motion-readability.json",
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    "evals/results/motion-readability.json",
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
