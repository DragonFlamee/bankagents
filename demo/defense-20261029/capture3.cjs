/* Third pass: open the full dependency graph for the birthday plan. */
const { chromium } = require("playwright");
const path = require("node:path");
const base = process.argv[2] || "http://127.0.0.1:8766";
const out = path.resolve(__dirname, "shots");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  try {
    await page.goto(base);
    await page.getByRole("button", { name: /进入拾迹银行/ }).click();
    await page.waitForSelector(".asset-hero");
    await page.evaluate(() => (location.hash = "workspace"));
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "新对话" }).click();
    await page.fill("#message", "我爱人生日快到了，这个月帮我锁定1000元活期，生日前2天订鲜花和蛋糕");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[data-testid=final-answer]", { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.locator(".workflow-trigger").last().click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "打开完整依赖图" }).last().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, "42-dag.png") });
    console.log("ok");
  } catch (e) { console.error("FAIL", e.message); await page.screenshot({ path: path.join(out, "zz-error3.png") }); }
  await browser.close();
})();
