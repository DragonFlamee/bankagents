/* Genuine model requests and local synthetic bank operations; no fabricated events. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root,'data/browser-runtime');
const {chromium} = require(process.env.TRACEBANK_PLAYWRIGHT_MODULE || 'C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.TRACEBANK_TEST_URL || 'http://127.0.0.1:8770';
const dataDir = process.env.TRACEBANK_TEST_DATA_DIR;
if (!dataDir) throw new Error('Set TRACEBANK_TEST_DATA_DIR to the server synthetic database directory');
const shots = path.join(root,'artifacts/screenshots/agent');
const videoDir = path.join(root,'data','agent-video-'+Date.now());
fs.mkdirSync(shots,{recursive:true});
const report = {started_at:new Date().toISOString(),synthetic_bank:true,real_model:true,tests:[],runs:[],chapters:[],errors:[]};
const pause = ms => new Promise(r=>setTimeout(r,ms));
const pass = (name,evidence) => report.tests.push({name,status:'passed',evidence});
async function main(){
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context = await browser.newContext({viewport:{width:1440,height:1050},recordVideo:{dir:videoDir,size:{width:1440,height:1050}},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  const page = await context.newPage();const video = page.video();const start = Date.now();
  page.on('pageerror',e=>report.errors.push(e.message));
  const chapter = title => report.chapters.push({at_seconds:(Date.now()-start)/1000,title});
  const shot = name => page.screenshot({path:path.join(shots,name+'.png'),fullPage:true});
  const getRun = id => page.evaluate(id=>fetch('/api/runs/'+id).then(r=>r.json()),id);
  async function settle(id){
    let r;for(let n=0;n<240;n++) {r=await getRun(id);if(r.reply||['failed','cancelled','interrupted'].includes(r.status))return r;await pause(350);}
    throw new Error('Timed out waiting for run '+id);
  }
  async function startRun(message){
    await page.locator('#message').fill(message);await pause(900);
    const pending=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');
    await page.locator('#send').click();const r=await pending;assert.equal(r.status(),202,await r.text());return r.json();
  }
  async function authorize(locator){
    const wait=page.waitForResponse(r=>/\/api\/operations\/[^/]+\/authorize$/.test(r.url()));
    await locator.click();const r=await wait;assert.equal(r.status(),200,await r.text());await pause(800);return r.json();
  }
  async function remember(id){
    const r=await getRun(id);report.runs.push(r);
    return r;
  }
  try{
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('#login-form button[type=submit]').click();await page.locator('#app').waitFor({state:'visible'});
    chapter('一句目标与真实模型规划');
    const started=await startRun('先分析本月账单，然后给李娜转300元，最后挂失尾号1024的卡片');
    await page.locator('[data-event-type="model.started"]').waitFor();
    const during=await getRun(started.id);
    assert(during.events.some(e=>e.type==='model.started'));
    assert.equal(during.plan,null,'The planner is actually still running');
    await shot('01-planning');
    await page.locator('.conversation-panel').screenshot({path:path.join(shots,'planning-focus.png')});
    const planned=await settle(started.id);
    assert.equal(planned.status,'awaiting_confirmation');assert.equal(planned.plan.nodes.length,3);
    await page.waitForFunction(()=>!document.getElementById('send').disabled);
    let card=planned.plan.nodes.find(n=>n.tool==='card.report_lost');assert.equal(card.status,'pending');assert(!card.operation);
    await page.locator('#execution-stream').evaluate(e=>e.scrollTop=0);await pause(1800);await shot('02-plan');
    await page.screenshot({path:path.join(shots,'workspace.png'),fullPage:false});
    const modelEvent=planned.events.find(e=>e.type==='model.completed');
    assert.equal(modelEvent.data.usage.http_status,200);assert(modelEvent.data.usage.request_id);assert(modelEvent.data.usage.total_tokens>0);
    pass('real-model-incremental-plan',{run_id:started.id,pending_before_plan:true,model:modelEvent.data.usage.model,request_id:modelEvent.data.usage.request_id,tokens:modelEvent.data.usage.total_tokens});
    chapter('工具输入、观测与授权暂停');
    await page.locator('[data-event-type="tool.started"] details').first().evaluate(e=>e.open=true);
    await page.locator('[data-event-type="tool.started"]').first().scrollIntoViewIfNeeded();await pause(2300);await shot('03-tool-input');
    await page.locator('#execution-stream').screenshot({path:path.join(shots,'tool-focus.png')});
    const pauseResponse=page.waitForResponse(r=>r.url().includes('/control'));
    await page.getByRole('button',{name:'暂停后续步骤',exact:true}).click();assert.equal((await pauseResponse).status(),200);await pause(1000);await shot('04-paused');
    const resumeResponse=page.waitForResponse(r=>r.url().includes('/control'));
    await page.getByRole('button',{name:'恢复任务',exact:true}).click();assert.equal((await resumeResponse).status(),200);await pause(1000);
    const transferred=await authorize(page.locator('.risk-yellow').getByRole('button',{name:'确认办理',exact:true}));
    assert.equal(transferred.operation.status,'succeeded');
    card=transferred.plan.nodes.find(n=>n.tool==='card.report_lost');assert(card.operation&&card.operation.risk==='red');
    await shot('05-continued');
    chapter('独立验证后继续完成原计划');
    await authorize(page.locator('.risk-red').getByRole('button',{name:'确认并进入验证',exact:true}));
    await page.locator('#mfa-dialog').waitFor({state:'visible'});
    const inbox=await context.request.get(base+'/api/auth/demo-inbox');
    const otp=(await inbox.json()).messages.find(m=>m.operation_id===card.operation.id).code;
    // The authentication channel stays separate; the recording never displays raw OTP.
    await page.locator('#otp').fill(otp);await pause(1700);await shot('06-verification');
    await page.locator('#mfa-dialog').screenshot({path:path.join(shots,'verification-focus.png')});
    const verified=await authorize(page.locator('#verify-submit'));assert.equal(verified.operation.status,'succeeded');
    await page.locator('#mfa-dialog').waitFor({state:'hidden'});await page.locator('#execution-stream').evaluate(e=>e.scrollTop=e.scrollHeight);await pause(1600);await shot('07-completed');
    const completed=await remember(started.id);assert.equal(completed.status,'succeeded');
    assert.equal(completed.events.filter(e=>e.type==='model.started').length,1,'Resume uses the stored DAG, not a fake extra model turn');
    assert(!JSON.stringify(completed).includes('"otp"'));assert(!JSON.stringify(completed).includes('reasoning_content'));
    const receipt=transferred.operation.receipt.id;
    pass('authorized-dependency-continuation',{run_id:started.id,transfer_receipt:receipt,nodes:completed.plan.nodes.map(n=>({tool:n.tool,status:n.status})),model_calls:1});
    chapter('刷新后恢复同一条行动记录');
    await page.reload({waitUntil:'networkidle'});await page.locator('#run-status').filter({hasText:'已完成'}).waitFor();
    const restored=await getRun(started.id);assert.equal(restored.events.length,completed.events.length);await pause(1800);
    pass('reload-does-not-replay-tools',{run_id:started.id,events:restored.events.length});
    chapter('停止正在规划的任务');
    await page.locator('#new-task').click();const stopping=await startRun('分析本月账单，然后查询我的卡片');
    await page.locator('[data-event-type="model.started"]').waitFor();
    await page.locator('#stop-run').click();const stopped=await settle(stopping.id);assert.equal(stopped.status,'cancelled');
    assert(!stopped.events.some(e=>e.type==='tool.started'));
    await page.locator('#run-status').filter({hasText:'已取消'}).waitFor();await pause(1600);await shot('08-stopped');await remember(stopping.id);
    assert.equal(await page.locator('#plan-status').innerText(),'已取消');
    assert.equal(await page.locator('#plan-content .node').count(),0,'Stopped planning must not display a prior task plan');
    pass('stop-after-model-return-before-tools',{run_id:stopping.id,tools_started:0});
    chapter('模拟回执超时与查询原操作');
    const fault=spawnSync(path.join(root,'.venv/Scripts/python.exe'),['-c','from banking_agent.bank import BankService; import sys; BankService(sys.argv[1]).set_fault("alice", "timeout_after_commit")',path.join(dataDir,'bank.sqlite3')],{cwd:root,windowsHide:true,encoding:'utf8'});
    assert.equal(fault.status,0,fault.stderr);
    await page.locator('#new-task').click();const unknown=await startRun('给李娜转100元');
    await settle(unknown.id);await page.waitForFunction(()=>!document.getElementById('send').disabled);
    const pendingOp=await authorize(page.locator('.risk-yellow').getByRole('button',{name:'确认办理',exact:true}));
    assert.equal(pendingOp.operation.status,'unknown');await pause(1800);await shot('09-unknown');
    const reconWait=page.waitForResponse(r=>r.url().endsWith('/reconcile'));
    await page.getByRole('button',{name:'查询并核实业务结果',exact:true}).click();const recon=await reconWait;assert.equal(recon.status(),200);
    const reconciled=await recon.json();assert.equal(reconciled.operation.status,'succeeded');assert.equal(reconciled.operation.id,pendingOp.operation.id);
    await pause(1400);await shot('10-reconciled');await remember(unknown.id);
    pass('reconcile-original-operation',{operation_id:pendingOp.operation.id,receipt_id:reconciled.operation.receipt.id});
    const reset=spawnSync(path.join(root,'.venv/Scripts/python.exe'),['-c','from banking_agent.bank import BankService; import sys; BankService(sys.argv[1]).set_fault("alice", "none")',path.join(dataDir,'bank.sqlite3')],{cwd:root,windowsHide:true,encoding:'utf8'});assert.equal(reset.status,0,reset.stderr);
    await page.setViewportSize({width:390,height:844});await pause(500);
    const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(size.width,size.scroll);await shot('11-mobile');
    pass('mobile-width',size);
    assert.deepEqual(report.errors,[]);report.status='passed';
  }catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};await shot('failure').catch(()=>{});process.exitCode=1;}
  finally{
    report.finished_at=new Date().toISOString();report.duration_seconds=(Date.now()-start)/1000;
    await context.close();await video.saveAs(path.join(videoDir,'raw.webm'));
    // Remove recorder shutdown padding; retain all actions through the final screenshot.
    const exported=spawnSync(path.join(root,'data/browser-runtime/ffmpeg-1011/ffmpeg-win64.exe'),['-y','-i',path.join(videoDir,'raw.webm'),'-t',report.duration_seconds.toFixed(3),'-c','copy',path.join(root,'demo/tracebank-agent-workflow.webm')],{windowsHide:true,encoding:'utf8'});
    assert.equal(exported.status,0,exported.stderr);await browser.close();
    report.source_sha256={};for(const file of ['banking_agent/run_journal.py','banking_agent/orchestrator.py','banking_agent/planner.py','apps/web/app.js','apps/web/index.html'])report.source_sha256[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
    fs.writeFileSync(path.join(root,'evals/results/agent-workflow-browser.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:report.status,tests:report.tests,errors:report.errors,failure:report.failure,video_seconds:report.duration_seconds},null,2));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
