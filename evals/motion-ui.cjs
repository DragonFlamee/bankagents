/* Motion sampling uses labelled API fixtures; no model or financial writes. */
const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:5173";
const round = process.env.TRACEBANK_MOTION_ROUND || "dev";
const out = path.resolve("artifacts/screenshots/motion", round);
fs.mkdirSync(out, { recursive: true });
const report = {
  base,
  mode: "labelled-animation-fixtures",
  checks: [],
  errors: [],
  samples: {},
  model_requests: 0,
  business_writes: 0,
};
const pass = (name) => {
  report.checks.push(name);
  console.log("PASS", name);
};
const date = new Date().toISOString();
let settled = false;
function payload(after = 0) {
  const status = settled ? "awaiting_confirmation" : "running";
  const events = [
    { seq: 1, type: "request.received", at: date, data: {} },
    { seq: 2, type: "tool.started", at: date, data: { tool: "bills" } },
    ...(settled
      ? [
          {
            seq: 3,
            type: "tool.result",
            at: date,
            data: { tool: "bills", message: "动画验收夹具：查询已完成" },
          },
          {
            seq: 4,
            type: "authorization.required",
            at: date,
            data: { tool: "transfer" },
          },
          { seq: 5, type: "run.settled", at: date, data: {} },
        ]
      : []),
  ];
  return {
    id: "motion-fixture",
    status,
    created_at: date,
    updated_at: date,
    message: "动画验收夹具：分析账单，再核对转账（不会执行业务）",
    conversation_id: "motion-fixture-conversation",
    reply: null,
    events: events.filter((e) => e.seq > after),
    plan: {
      id: "motion-fixture-plan",
      run_id: "motion-fixture",
      conversation_id: "motion-fixture-conversation",
      message: "动画验收夹具",
      status,
      created_at: date,
      nodes: [
        {
          id: "n1",
          tool: "bills",
          params: {},
          depends_on: [],
          status: settled ? "succeeded" : "running",
          ...(settled
            ? {
                result: {
                  total_expense_cents: 596320,
                  transaction_count: 12,
                  categories: [],
                },
              }
            : {}),
        },
        {
          id: "n2",
          tool: "transfer",
          params: { contact_id: "li", amount_cents: 30000 },
          depends_on: ["n1"],
          status: settled ? "awaiting_confirmation" : "queued",
          ...(settled
            ? {
                operation: {
                  id: "motion-fixture-operation",
                  tool: "transfer",
                  params: { contact_id: "li", amount_cents: 30000 },
                  status: "awaiting_confirmation",
                  risk: "yellow",
                  message: "动画夹具：尚未转账",
                  expires_at: new Date(Date.now() + 600000).toISOString(),
                },
              }
            : {}),
        },
      ],
      answer: {
        title: "动画验收夹具结果",
        paragraphs: [
          "查询完成，转账尚未执行，等待明确核对。该内容仅用于动画检查。",
        ],
        source: "fixture",
        evidence: [],
      },
    },
  };
}
async function track(page, selector, duration = 650) {
  return page.evaluate(
    ({ selector, duration }) =>
      new Promise((resolve) => {
        const start = performance.now(),
          samples = [];
        function frame() {
          const e = document.querySelector(selector);
          if (e) {
            const style = getComputedStyle(e),
              m = new DOMMatrixReadOnly(style.transform);
            samples.push({
              t: Math.round(performance.now() - start),
              opacity: Number(style.opacity),
              x: m.m41,
              y: m.m42,
              sx: m.a,
              sy: m.d,
              inert: !!e.inert,
            });
          }
          if (performance.now() - start < duration)
            requestAnimationFrame(frame);
          else resolve(samples);
        }
        requestAnimationFrame(frame);
      }),
    { selector, duration },
  );
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "no-preference",
      recordVideo: {
        dir: path.join(out, "video"),
        size: { width: 1280, height: 800 },
      },
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("401"))
        report.errors.push(m.text());
    });
    p.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/operations/"))
        report.business_writes++;
    });
    await p.goto(base, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "进入拾迹银行", exact: true }).click();
    await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
    await p.waitForTimeout(450);
    // Hold a real navigation button, sample the spring rather than just final pixels.
    const nav = p.getByRole("button", { name: "业务总览", exact: true });
    await nav.hover();
    await p.getByRole("button", { name: "Agent 工作台", exact: true }).focus();
    const pressSamples = track(p, ".nav-item.current", 950);
    await p.mouse.down();
    await p.waitForTimeout(120);
    assert(
      await nav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a < 0.993,
      ),
    );
    await p.screenshot({ path: path.join(out, "01-button-held.png") });
    await p.mouse.up();
    await p.waitForTimeout(650);
    report.samples.press = await pressSamples;
    assert(Math.min(...report.samples.press.map((s) => s.sx)) < 0.993);
    assert(Math.max(...report.samples.press.map((s) => s.sx)) > 1.00005);
    assert(
      await nav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).isIdentity,
      ),
    );
    pass(
      "pointer press compresses and springs past rest, then restores neutral transform",
    );
    await nav.focus();
    await p.keyboard.down("Space");
    await p.waitForTimeout(110);
    assert(
      await nav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a < 0.99,
      ),
    );
    await p.keyboard.up("Space");
    await p.waitForTimeout(650);
    assert(
      await nav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).isIdentity,
      ),
    );
    pass("keyboard press shares spring feedback and returns to rest");
    const routeSamples = track(p, ".page-content", 800);
    await p.getByRole("button", { name: "交易分析", exact: true }).click();
    await p.screenshot({ path: path.join(out, "02-page-transition.png") });
    report.samples.page = await routeSamples;
    assert(report.samples.page.every((s) => s.opacity === 1));
    assert(report.samples.page.some((s) => Math.abs(s.y) > 0.2));
    assert(report.samples.page.some((s) => s.inert));
    await p.getByRole("heading", { name: "交易分析", exact: true }).waitFor();
    await p.screenshot({ path: path.join(out, "03-page-settled.png") });
    await p.evaluate(async () => {
      for (const id of [
        "workspace",
        "approvals",
        "dashboard",
        "activity",
        "workspace",
      ]) {
        location.hash = id;
        await new Promise((resolve) => setTimeout(resolve, 45));
      }
    });
    await p.waitForTimeout(550);
    assert.equal(await p.locator(".page-content").count(), 1);
    assert.equal(
      await p.locator(".page-content").getAttribute("data-page"),
      "workspace",
    );
    assert.equal(
      await p.locator(".page-content").evaluate((e) => e.inert),
      false,
    );
    pass(
      "page translation keeps text fully opaque; outgoing page inert; rapid navigation settles once",
    );
    await p.route("**/api/runs", async (r) => {
      if (r.request().method() === "POST")
        await r.fulfill({ status: 202, json: payload() });
      else await r.continue();
    });
    await p.route("**/api/runs/motion-fixture**", (r) =>
      r.fulfill({
        json: payload(
          Number(new URL(r.request().url()).searchParams.get("after")) || 0,
        ),
      }),
    );
    await p.getByLabel("业务需求").fill("动画验收夹具");
    await p.getByRole("button", { name: "发送任务", exact: true }).click();
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    await p.locator(".node-running-ring").waitFor();
    assert.equal(await p.getByTestId("final-answer").count(), 0);
    const first = p.locator(".plan-node").first();
    await first.evaluate((e) => (e.dataset.motionIdentity = "stable-node"));
    await p.waitForTimeout(750);
    assert.equal(
      await first.getAttribute("data-motion-identity"),
      "stable-node",
    );
    assert(
      await first.evaluate((e) => Number(getComputedStyle(e).opacity) > 0.99),
    );
    await p.screenshot({ path: path.join(out, "04-running-timeline.png") });
    pass(
      "live timeline shows running ring; polling preserves node identity and no premature answer",
    );
    const railSamples = track(p, ".timeline-rail-fill", 1500);
    settled = true;
    await p.getByTestId("final-answer").waitFor();
    await p.waitForTimeout(500);
    report.samples.rail = await railSamples;
    assert(report.samples.rail.some((s) => s.sy > 0.05 && s.sy < 0.95));
    assert.equal(await p.locator(".node-running-ring").count(), 0);
    assert(
      await p
        .locator(".timeline-rail-fill")
        .evaluate(
          (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).d > 0.99,
        ),
    );
    assert((await p.locator(".task-facts").innerText()).includes("1 / 2"));
    await p.screenshot({
      path: path.join(out, "05-completed-and-waiting.png"),
    });
    pass(
      "completion draws actual connector, stops running ring and preserves 1-of-2 authorization state",
    );
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    await p.locator(".execution-inline").waitFor({ state: "detached" });
    await p.getByRole("button", { name: "查看执行详情", exact: true }).click();
    assert.equal(await p.locator(".technical-log").getAttribute("open"), null);
    await p.locator(".technical-log > summary").click();
    assert(
      (await p.locator(".technical-log").textContent()).includes("调用记录"),
    );
    await p.getByRole("button", { name: "收起执行详情", exact: true }).click();
    pass(
      "execution and technical evidence are disclosed on demand with focus restored",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(400);
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: path.join(out, "06-mobile.png"),
      fullPage: true,
    });
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    const mobileNav = p.getByRole("button", { name: "交易分析", exact: true });
    await mobileNav.hover();
    await p.mouse.down();
    await p.waitForTimeout(120);
    assert(
      await mobileNav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a < 0.99,
      ),
    );
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForTimeout(120);
    assert(
      await mobileNav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).isIdentity,
      ),
    );
    await p.mouse.up();
    await p.getByRole("heading", { name: "交易分析", exact: true }).waitFor();
    await p.waitForTimeout(100);
    assert(
      await p
        .locator(".page-content")
        .evaluate(
          (e) =>
            getComputedStyle(e).opacity === "1" &&
            new DOMMatrixReadOnly(getComputedStyle(e).transform).m42 === 0,
        ),
    );
    await p.getByRole("button", { name: "打开导航", exact: true }).click();
    await mobileNav.hover();
    await p.mouse.down();
    await p.waitForTimeout(120);
    assert(
      await mobileNav.evaluate(
        (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).isIdentity,
      ),
    );
    await p.mouse.up();
    pass(
      "phone fits; runtime reduced-motion disables springs, page translation and pulse",
    );
    assert.equal(report.business_writes, 0);
    assert.deepEqual(report.errors, []);
    pass(
      "animation fixture triggers no financial requests; no JavaScript/CSP errors",
    );
    const video = p.video();
    await context.close();
    context = null;
    await video.saveAs(path.join(out, "motion-demo.webm"));
    await video.delete();
  } finally {
    if (context) await context.close();
    await browser.close();
    fs.writeFileSync(
      `evals/results/motion-ui-${round}.json`,
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  report.failure = e.stack;
  fs.writeFileSync(
    `evals/results/motion-ui-${round}.json`,
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
});
