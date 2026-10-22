/* Actual model + browser checks for answers and expandable execution traces. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.TRACEBANK_PLAYWRIGHT_MODULE||'C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),base=process.env.TRACEBANK_TEST_URL||'http://127.0.0.1:8774';
const out=path.join(root,'artifacts/screenshots/answers');fs.mkdirSync(out,{recursive:true});
const report={started_at:new Date().toISOString(),synthetic_bank:true,tests:[],runs:[],errors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1050},locale:'zh-CN'});
 page.on('pageerror',e=>report.errors.push(e.message));
 const get=id=>page.evaluate(id=>fetch('/api/runs/'+id).then(r=>r.json()),id);
 async function chat(message){
  await page.locator('#message').fill(message);const waiting=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');await page.locator('#send').click();const started=await waiting;assert.equal(started.status(),202);const {id}=await started.json();
  let record;for(let i=0;i<260;i++){record=await get(id);if(record.reply)break;await pause(450);}
  assert(record.reply,'Run timed out');assert.notEqual(record.status,'failed',JSON.stringify(record));
  await page.waitForFunction(()=>!document.getElementById('send').disabled);await page.locator('#assistant-answer').waitFor({state:'visible'});return record;
 }
 try{
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('#login-form button[type=submit]').click();await page.locator('#app').waitFor({state:'visible'});
  assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),false);
  const savings=await chat('请你帮我看看我应该在哪里省钱');report.runs.push(savings);
  assert.equal(savings.plan.answer.source,'model_selected_evidence','Must verify an actual grounded response call');
  const answer=await page.locator('#assistant-answer').innerText();assert(answer.includes('购物支出为 ¥2,248.40'));assert(answer.includes('消费为 ¥5,963.20'));assert(answer.includes('不能承诺具体能省下多少'));
  assert.equal(await page.locator('#execution-details').evaluate(e=>e.open),false,'Answer appears without opening trace');
  await page.locator('#assistant-answer').screenshot({path:path.join(out,'savings-answer.png')});await page.screenshot({path:path.join(out,'collapsed-workspace.png'),fullPage:true});
  const response=savings.events.find(e=>e.type==='response.completed');assert.equal(response.data.usage.http_status,200);assert(response.data.usage.request_id);
  report.tests.push({name:'savings-answer-from-real-observations',status:'passed',planning_request:savings.events.find(e=>e.type==='model.completed').data.usage.request_id,response_request:response.data.usage.request_id});
  await page.locator('#execution-details > summary').click();await page.locator('[data-event-type="response.completed"]').waitFor();assert.equal(await page.locator('#run-metrics').getByText(/Request ID:/).count(),2);await page.screenshot({path:path.join(out,'expanded-workflow.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle'});await page.locator('#assistant-answer').waitFor();assert.equal(await page.locator('#assistant-answer').innerText(),answer);assert.equal((await get(savings.id)).events.length,savings.events.length);
  report.tests.push({name:'expand-collapse-and-refresh-preserves-answer',status:'passed',event_count:savings.events.length});
  const pending=await chat('给李娜转300元');assert(pending.reply.includes('尚未完成'));assert(pending.reply.includes('明确确认'));assert(!pending.events.some(e=>e.type==='response.completed'&&e.data.usage));
  const authorization=page.waitForResponse(r=>r.url().endsWith('/authorize'));await page.locator('#plan-content').getByRole('button',{name:'确认办理',exact:true}).click();assert.equal((await authorization).status(),200);
  await page.locator('#assistant-answer').filter({hasText:'已向李娜转出 ¥300.00'}).waitFor();const completed=await get(pending.id);report.runs.push(completed);assert(completed.reply.includes('已向李娜转出'));
  report.tests.push({name:'transfer-answer-updates-only-after-authorization',status:'passed',receipt:completed.plan.nodes[0].operation.receipt.id});
  const cards=await chat('查询我的卡片');report.runs.push(cards);assert(cards.reply.includes('1024')&&cards.reply.includes('正常'));assert.deepEqual(cards.plan.nodes.map(n=>n.tool),['cards']);assert.notDeepEqual(savings.plan.nodes.map(n=>n.tool),cards.plan.nodes.map(n=>n.tool));
  report.tests.push({name:'scenario-specific-tools-and-answers',status:'passed',tools:report.runs.map(r=>r.plan.nodes.map(n=>n.tool))});
  await page.setViewportSize({width:390,height:844});await pause(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  report.tests.push({name:'mobile-answer-and-fold',status:'passed',width:390});assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}
 finally{report.finished_at=new Date().toISOString();report.source_sha256={};for(const f of ['banking_agent/answers.py','banking_agent/orchestrator.py','banking_agent/planner.py','apps/web/app.js','apps/web/index.html','apps/web/styles.css'])report.source_sha256[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');fs.writeFileSync(path.join(root,'evals/results/answers-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,tests:report.tests,errors:report.errors,failure:report.failure},null,2));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
