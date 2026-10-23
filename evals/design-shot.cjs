const { chromium } = require("playwright");
(async () => {
  const [base, out, ...hashes] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs=[]; p.on("pageerror", e=>errs.push(String(e)));
  await p.goto(base); await p.waitForTimeout(2600);
  await p.screenshot({ path: out + "/login.png" });
  await p.getByRole("button", { name: /进入拾迹银行/ }).click(); await p.waitForTimeout(1500);
  for (const h of hashes) { await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(1600); await p.screenshot({ path: `${out}/${h}.png`, fullPage: true }); }
  if (process.env.MOBILE) { await p.setViewportSize({width:390,height:844}); await p.evaluate(()=>{location.hash="planner"}); await p.waitForTimeout(1200); await p.screenshot({path:out+"/mobile-planner.png", fullPage:true}); }
  console.log("errors", errs); await b.close();
})();
