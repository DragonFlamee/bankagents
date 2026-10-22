const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path");
const { fixture } = require("./clarity-fixtures.cjs");
const base = process.env.TRACEBANK_TEST_URL || "http://127.0.0.1:5173",
  round = process.env.TRACEBANK_CLARITY_ROUND || "after";
const out = path.resolve("artifacts/screenshots/clarity", round);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TRACEBANK_BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const inventory = [];
  try {
    for (const state of [
      "empty",
      "planning",
      "running",
      "waiting",
      "success",
      "failed",
      "cancelled",
      "partial",
      "unknown",
    ]) {
      const p = await b.newPage({
        viewport: { width: 1600, height: 900 },
        reducedMotion: "reduce",
      });
      const data = state === "empty" ? null : fixture(state);
      await p.route("**/api/runs", (r) =>
        r.request().method() === "POST"
          ? r.fulfill({ status: 202, json: data })
          : r.continue(),
      );
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
      await p.goto(base, { waitUntil: "networkidle" });
      await p
        .getByRole("button", { name: "进入拾迹银行", exact: true })
        .click();
      await p.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
      await p
        .getByRole("button", { name: "Agent 工作台", exact: true })
        .click();
      await p.getByLabel("业务需求").waitFor();
      if (data) {
        await p.getByLabel("业务需求").fill(data.message);
        await p.getByRole("button", { name: "发送任务", exact: true }).click();
        await p.waitForTimeout(400);
      }
      await p.screenshot({
        path: path.join(out, state + "-1600.png"),
        fullPage: true,
      });
      inventory.push({
        state,
        text: await p.locator("body").innerText(),
        buttons: await p.getByRole("button").allTextContents(),
      });
      await p.close();
    }
    fs.writeFileSync(
      `evals/results/clarity-content-${round}.json`,
      JSON.stringify(inventory, null, 2),
    );
    console.log("Captured", round, "9 states at 1600x900");
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
