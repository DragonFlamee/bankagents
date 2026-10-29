/* Real browser checks against an isolated offline bank. No model requests. */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), assert = require('node:assert/strict');
const out = path.resolve(process.env.TRACEBANK_SCREENSHOT_DIR || 'artifacts/browser');
const report = {executed_at:new Date().toISOString(),mode:'isolated-offline-bank',checks:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
let server,browser;
const pass = name => {report.checks.push(name);console.log('PASS',name);};
async function main(){
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
 const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=process.env.TRACEBANK_TEST_URL || `http://127.0.0.1:${port}`;
 if(!process.env.TRACEBANK_TEST_URL){
  server=spawn(path.resolve(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python'),['-m','banking_agent','--host','127.0.0.1','--port',String(port),'--data-dir',`data/browser-${Date.now()}`],{windowsHide:true,stdio:'ignore',env:{...process.env,TRACEBANK_PLANNER:'offline',TRACEBANK_SCHEDULER:'0',TRACEBANK_DEMO_PASSWORD:'tracebank-demo',TRACEBANK_OPERATOR_PASSWORD:'tracebank-operator'}});
 }
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'Test service did not start');
 browser=await chromium.launch({headless:true,executablePath:process.env.TRACEBANK_BROWSER_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',locale:'zh-CN'}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 const get=async route=>{const r=await context.request.get(base+route);assert(r.ok(),await r.text());return r.json();};
 const overview=()=>get('/api/overview');
 const balance=async()=>(await overview()).accounts[0].balance_cents;
 async function plan(message,condition=()=>true){
  for(let i=0;i<100;i++){
   const p=(await get('/api/plans')).plans.find(p=>p.message===message);
   if(p && condition(p))return p;
   await page.waitForTimeout(100);
  }
  throw new Error('Plan did not reach expected state: '+message);
 }
 async function ask(message){
  await page.getByRole('button',{name:'新对话',exact:true}).click();
  await page.getByRole('textbox',{name:'业务需求'}).fill(message);
  await page.getByRole('button',{name:'发送任务',exact:true}).click();
  return plan(message,p=>!['pending','running'].includes(p.status));
 }
 async function authorize(message,tool){
  const p=await plan(message),n=p.nodes.find(n=>n.tool===tool&&['awaiting_confirmation','awaiting_verification'].includes(n.status));
  assert(n,'No pending operation: '+tool);
  const op=n.operation,before=await balance();
  if(op.risk==='red'){
   await page.getByRole('button',{name:'核对并验证',exact:true}).first().click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   const code=(await get('/api/auth/demo-inbox')).messages.find(m=>m.operation_id===op.id).code;
   assert.equal(await balance(),before,'Opening verification must not debit');
   await page.getByLabel('一次性验证码').fill(code);
   await dialog.getByRole('button',{name:'验证并提交本次操作',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
  }else{
   const label={transfer:'确认转账','funds.hold':'确认锁定','merchant.order':'确认预约订购'}[tool]||'确认办理';
   await page.getByRole('button',{name:label,exact:true}).first().click();
  }
  return plan(message,p=>p.nodes.some(n=>n.operation?.id===op.id&&n.status==='succeeded'));
 }
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'进入拾迹银行',exact:true}).click();
 await page.locator('h1').filter({hasText:'林知夏'}).waitFor();
 const initial=await overview();assert.equal(initial.demo,true);assert(initial.accounts[0].balance_cents>0);
 await page.screenshot({path:path.join(out,'dashboard.png'),fullPage:true});
 pass('Login and dashboard use the authenticated synthetic account');

 let message='分析本月账单';let p=await ask(message);
 assert.equal(p.status,'succeeded');assert(p.nodes.some(n=>n.tool==='bills'&&n.result));
 await page.getByTestId('final-answer').waitFor();
 assert((await page.getByTestId('final-answer').innerText()).length>30);
 await page.getByRole('textbox',{name:'业务需求'}).fill('那上月呢');
 await page.getByRole('button',{name:'发送任务',exact:true}).click();
 p=await plan('那上月呢',p=>p.status==='succeeded');
 assert.equal(p.nodes.find(n=>n.tool==='bills').params.period,'last_month');
 assert((await page.getByTestId('previous-answer').count())>=1);
 pass('Bill answer and same-conversation follow-up retain independent results');

 const before=await balance();message='给李娜转300元';p=await ask(message);
 assert.equal(p.nodes[0].operation.risk,'yellow');assert.equal(await balance(),before);
 await authorize(message,'transfer');assert.equal(await balance(),before-30000);
 pass('Yellow transfer debits exactly 300 yuan only after UI confirmation');

 message='买5000元安盈固收+';p=await ask(message);assert.equal(p.nodes[0].operation.risk,'red');
 const wealthBefore=await balance();await authorize(message,'wealth.subscribe');
 assert.equal(await balance(),wealthBefore-500000);
 assert((await overview()).holdings.some(h=>h.product_id==='wm-plus180'));
 pass('Wealth subscription requires OTP and updates simulated holdings once');

 message='挂失尾号1024的卡片';await ask(message);await authorize(message,'card.report_lost');
 assert.equal((await overview()).cards.find(c=>c.last4==='1024').status,'lost');
 pass('Sensitive card operation uses the independent verification dialog');

 message='查询我的订阅';p=await ask(message);assert.equal(p.nodes[0].operation.risk,'yellow');
 const subBefore=await balance();await authorize(message,'subscriptions.get');assert.equal(await balance(),subBefore);
 pass('Subscription query requires consent and does not change funds');

 message='我爱人生日快到了，这个月帮我锁定1000元活期，生日前2天订鲜花和蛋糕';
 const birthdayBefore=await overview();p=await ask(message);assert.equal(p.nodes.length,5);
 const branches=p.nodes.filter(n=>n.tool==='merchant.order');assert.deepEqual(branches[0].depends_on,branches[1].depends_on);
 await authorize(message,'funds.hold');await authorize(message,'merchant.order');p=await authorize(message,'merchant.order');
 assert.equal(p.status,'succeeded');const birthdayAfter=await overview();
 assert.equal(birthdayAfter.accounts[0].balance_cents,birthdayBefore.accounts[0].balance_cents);
 assert.equal(birthdayAfter.accounts[0].available_cents,birthdayBefore.accounts[0].available_cents-100000);
 assert.equal(birthdayAfter.schedules.filter(s=>s.kind==='order').length,2);
 await page.getByTestId('final-answer').waitFor();await page.screenshot({path:path.join(out,'workspace.png'),fullPage:true});
 pass('Birthday DAG locks real simulated available funds and creates two receipt-linked future orders');

 const routes={dashboard:'业务总览',analytics:'账单报告',wealth:'理财',cards:'卡片',subscriptions:'订阅扣费',planner:'资金日程',approvals:'审批中心',security:'安全中心',activity:'活动日志'};
 for(const [id,label] of Object.entries(routes)){
  await page.locator('button.nav-item').filter({hasText:label}).click();
  await page.waitForURL('**/#'+id);await page.locator('.page-heading h1').waitFor();
  assert((await page.locator('.page-content').innerText()).length>30);
 }
 pass('All nine business views remain reachable after repository cleanup');
 const operator=await context.request.get(base+'/operator.html');assert(operator.ok());
 pass('Separate operator page is served by the final frontend build');
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#planner');
 await page.getByRole('heading',{name:'资金日程',exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 pass('390px planner has no whole-page horizontal overflow');
 assert.deepEqual(report.errors,[]);pass('No page JavaScript errors');
}
main().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{
 if(browser)await browser.close();
 if(server){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}else server.kill();}
 fs.writeFileSync('evals/results/browser.json',JSON.stringify(report,null,2)+'\n');
});
