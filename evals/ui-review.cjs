const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:8781";
const out = path.resolve("artifacts/screenshots/ui-redesign/iteration-1");
fs.mkdirSync(out, { recursive: true });
(async () => {
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
    });
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("CONSOLE", m.text());
    });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(out, "login.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "进入拾迹银行" }).click();
    await page.getByRole("heading", { name: "业务总览" }).waitFor();
    await page.screenshot({
      path: path.join(out, "dashboard.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "进入 Agent 工作台", exact: true })
      .click();
    await page.screenshot({
      path: path.join(out, "workspace-empty.png"),
      fullPage: true,
    });
    await page
      .getByRole("textbox", { name: "业务需求" })
      .fill("请你帮我看看我应该在哪里省钱");
    await page.getByRole("button", { name: "发送任务" }).click();
    await page.getByTestId("final-answer").waitFor();
    await page.screenshot({
      path: path.join(out, "workspace-result.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "交易分析", exact: true }).click();
    await page
      .getByRole("heading", { name: "交易分析", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(out, "analytics.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, "analytics-mobile.png"),
      fullPage: true,
    });
    console.log("Screenshots saved", out);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
