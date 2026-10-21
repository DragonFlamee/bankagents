const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
let pw;try{pw=require(process.env.TRACEBANK_PLAYWRIGHT_MODULE||'playwright');}catch(_){pw=require('C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const base=process.env.TRACEBANK_TEST_URL||'http://127.0.0.1:8766';const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:process.env.TRACEBANK_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const customer=await browser.newContext();const staff=await browser.newContext();
 const errors=[];let report={status:'failed',base,tests:[],errors};
 try{
  const login=await customer.request.post(base+'/api/session',{data:{username:'alice',password:'tracebank-demo'}});assert(login.ok());
  const auth=await login.json();const headers={'X-CSRF-Token':auth.csrf_token};
  const result=await customer.request.post(base+'/api/chat',{headers,data:{message:'给李娜转100元'}});assert(result.ok());
  const plan=(await result.json()).plan;const operation=plan.nodes.find(n=>n.operation).operation;
  const handoff=await customer.request.post(`${base}/api/plans/${plan.id}/control`,{headers,data:{action:'handoff'}});assert(handoff.ok());
  const page=await staff.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/operator.html');await page.locator('#operator-login button').click();
  const row=page.locator('#staff-plans section').filter({hasText:plan.id});await row.waitFor({state:'visible'});
  assert.equal(await page.locator('#staff-error').innerText(),'');
  await row.locator('textarea').fill('已核对客户诉求，交还客户完成原操作授权。');
  await page.screenshot({path:path.join(root,'artifacts/screenshots/operator-desktop.png'),fullPage:true});
  const release=page.waitForResponse(r=>r.url().includes(`/admin/plans/${plan.id}/release`));await row.getByRole('button').click();assert((await release).ok());
  await row.waitFor({state:'detached'});
  const current=await customer.request.get(`${base}/api/plans/${plan.id}`);assert(current.ok());const latest=await current.json();
  const state={operation:latest.nodes.find(n=>n.operation?.id===operation.id).operation};
  assert.equal(state.operation.status,'awaiting_confirmation');assert(!state.operation.receipt);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.equal(errors.length,0);
  report={...report,status:'passed',tests:['independent-operator-login','handoff-queue-visible','release-with-reason','customer-authorization-still-required','mobile-no-horizontal-overflow'],operation_status:state.operation.status};
 }catch(e){report.error=e.stack;process.exitCode=1;}
 finally{fs.writeFileSync(path.join(root,'evals/results/operator-browser.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})();
