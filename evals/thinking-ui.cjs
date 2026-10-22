/* UI lifecycle test: replay recorded responses, then inspect the real saved task. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:8765';
const recorded=JSON.parse(fs.readFileSync(path.join(root,'evals/results/answers-browser.json'),'utf8')).runs[0];
const out=path.join(root,'artifacts/screenshots/thinking');fs.mkdirSync(out,{recursive:true});
const report={started_at:new Date().toISOString(),fixture_source:'evals/results/answers-browser.json',fixture_is_new_model_call:false,tests:[],errors:[]};
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},locale:'zh-CN'});page.on('pageerror',e=>report.errors.push(e.message));
  let phase=1;const id='thinking-ui-fixture',created=new Date(Date.now()-8000).toISOString();
  function payload(after=0){
   const r=JSON.parse(JSON.stringify(recorded));r.id=id;r.created_at=created;r.updated_at=new Date().toISOString();
   r.status=phase===4?'succeeded':phase===5?'failed':'running';r.reply=phase===4?r.reply:phase===5?'测试夹具：请求未完成。':null;
   const cut=({1:2,2:6,3:9,4:11,5:2})[phase];r.events=r.events.filter(e=>e.seq<=cut&&e.seq>after);
   if(phase===1||phase===5){r.plan=null;r.plan_id=null;}
   else if(phase===2){r.plan.status='pending';delete r.plan.answer;r.plan.nodes.forEach(n=>{n.status='pending';delete n.result;});}
   return r;
  }
  await page.route('**/api/runs',async route=>{if(route.request().method()==='POST')await route.fulfill({status:202,json:payload()});else await route.continue();});
  await page.route('**/api/runs/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/runs/'+id)await route.fulfill({json:payload(Number(u.searchParams.get('after'))||0)});else await route.continue();});
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('#login-form button[type=submit]').click();await page.locator('#app').waitFor({state:'visible'});
  async function submit(){await page.locator('#message').fill('请你帮我看看我应该在哪里省钱');await page.locator('#send').click();await page.locator('#execution-summary').filter({hasText:'正在思考'}).waitFor();}
  await submit();assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),true);assert.equal(await page.locator('#assistant-answer').isVisible(),false);
  await page.screenshot({path:path.join(out,'01-thinking.png'),fullPage:true});
  phase=2;await page.locator('#execution-summary').filter({hasText:'正在调用工具'}).waitFor();assert.equal(await page.locator('#assistant-answer').isVisible(),false);
  phase=3;await page.locator('#execution-summary').filter({hasText:'正在整理回答'}).waitFor();assert.equal(await page.locator('#assistant-answer').isVisible(),false,'A cached tool-derived answer must not appear before response completion');
  await page.screenshot({path:path.join(out,'02-tools-and-response.png'),fullPage:true});
  phase=4;await page.locator('#assistant-answer').waitFor({state:'visible'});assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),false);
  assert(await page.evaluate(()=>Boolean(document.getElementById('execution-details').compareDocumentPosition(document.getElementById('assistant-answer'))&Node.DOCUMENT_POSITION_FOLLOWING)));
  const positions=await page.evaluate(()=>({process:document.getElementById('execution-details').getBoundingClientRect().bottom,answer:document.getElementById('assistant-answer').getBoundingClientRect().top}));assert(positions.process<=positions.answer);
  report.tests.push({name:'thinking-tools-response-then-answer',status:'passed',mode:'recorded-api-fixture',positions});
  await page.locator('#execution-details > summary').click();await page.locator('[data-event-type="tool.started"]').waitFor({state:'visible'});assert.equal(await page.locator('#assistant-answer').isVisible(),true);
  report.tests.push({name:'finished-process-can-be-expanded-above-answer',status:'passed',mode:'recorded-api-fixture'});
  phase=1;await submit();await page.locator('#execution-details > summary').click();assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),false);
  phase=2;await page.locator('#execution-summary').filter({hasText:'正在调用工具'}).waitFor();assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),false);
  phase=4;await page.locator('#assistant-answer').waitFor({state:'visible'});assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),false);
  report.tests.push({name:'manual-collapse-preserved-during-generation',status:'passed',mode:'recorded-api-fixture'});
  phase=1;await submit();phase=5;await page.locator('#execution-summary').filter({hasText:'处理未完成'}).waitFor();await page.locator('#assistant-answer').filter({hasText:'请求未完成'}).waitFor();assert.equal(await page.locator('#execution-details').getAttribute('data-state'),'failed');
  report.tests.push({name:'failure-is-not-presented-as-completed-thinking',status:'passed',mode:'recorded-api-fixture'});
  await page.close();
  // Actual persisted task, through unmocked APIs; no new model or bank operation.
  const live=await browser.newPage({viewport:{width:1440,height:1050},locale:'zh-CN'});live.on('pageerror',e=>report.errors.push(e.message));
  await live.goto(base,{waitUntil:'networkidle'});await live.locator('#login-form button[type=submit]').click();await live.locator('#app').waitFor({state:'visible'});await live.locator('[data-view=activity]').click();
  await live.locator('.history-item').filter({hasText:'请你帮我看看我应该在哪里省钱'}).getByRole('button',{name:'查看步骤 ↗'}).first().click();await live.locator('#assistant-answer').waitFor({state:'visible'});
  assert((await live.locator('#assistant-answer').innerText()).includes('购物支出为 ¥2,248.40'));assert.equal(await live.locator('#execution-details').evaluate(e=>e.open),false);
  await live.screenshot({path:path.join(out,'03-live-final-answer.png'),fullPage:true});
  await live.locator('#execution-details > summary').click();await live.screenshot({path:path.join(out,'04-live-expanded.png'),fullPage:true});
  await live.setViewportSize({width:390,height:844});assert.equal(await live.evaluate(()=>document.documentElement.scrollWidth),390);await live.screenshot({path:path.join(out,'05-mobile.png'),fullPage:true});
  report.tests.push({name:'actual-saved-task-and-mobile-layout',status:'passed',mode:'real-persisted-api-no-model-replay',width:390});
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;}
 finally{report.finished_at=new Date().toISOString();report.source_sha256={};for(const f of ['apps/web/app.js','apps/web/index.html','apps/web/styles.css'])report.source_sha256[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');fs.writeFileSync(path.join(root,'evals/results/thinking-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
