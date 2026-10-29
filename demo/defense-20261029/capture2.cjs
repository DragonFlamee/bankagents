/* Second pass: execution details, dependency graph, approvals, activity log. */
const { chromium } = require("playwright");
const path = require("node:path");
const base = process.argv[2] || "http://127.0.0.1:8766";
const out = path.resolve(__dirname, "shots");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const shot = async (n, full=false) => { await page.waitForTimeout(1000); await page.screenshot({ path: path.join(out, n + ".png"), fullPage: full }); console.log("shot", n); };
  const ask = async (text) => {
    await page.evaluate(() => (location.hash = "workspace"));
    await page.waitForSelector("#message");
    const before = await page.locator(".conversation-turn").count();
    await page.fill("#message", text); await page.keyboard.press("Enter");
    await page.waitForFunction((n) => { const t = document.querySelectorAll(".conversation-turn"), l = t[t.length - 1]; return t.length > n && l && !l.querySelector(".is-thinking") && l.querySelector('[data-testid="final-answer"]'); }, before, { timeout: 30000 });
    await page.waitForTimeout(900);
  };
  try {
    await page.goto(base);
    await page.getByRole("button", { name: /进入拾迹银行/ }).click();
    await page.waitForSelector(".asset-hero");
    await page.getByRole("button", { name: "新对话" }).click();
    await ask("先分析本月账单，然后给李娜转300元，最后挂失尾号1024的卡片");
    await page.locator(".workflow-trigger").last().click();
    await shot("40-inline-process");
    const open = page.getByRole("button", { name: /执行详情|查看完整/ });
    console.log("detail buttons", await open.count());
    for (const n of ["查看执行详情","执行详情"]) { const b = page.getByRole("button", { name: n, exact: true }); if (await b.count()) { await b.last().click(); break; } }
    await page.waitForTimeout(800);
    if (await page.locator(".execution-dialog").count()) {
      await shot("41-exec-details");
      const g = page.getByRole("button", { name: "打开完整依赖图" });
      if (await g.count()) { await g.click(); await page.waitForTimeout(1500); await shot("42-dag"); }
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => (location.hash = "approvals")); await page.waitForTimeout(1200); await shot("43-approvals");
    await page.evaluate(() => (location.hash = "activity")); await page.waitForTimeout(1200); await shot("44-activity");
  } catch (e) { console.error("FAIL", e.message); await page.screenshot({ path: path.join(out, "zz-error2.png") }); }
  await browser.close();
})();
