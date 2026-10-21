/* Live same-origin browser acceptance test. Uses only the explicit fake demo account. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let runtime;
try { runtime = require(process.env.TRACEBANK_PLAYWRIGHT_MODULE || 'playwright'); }
catch (_) { runtime = require('C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const { chromium } = runtime;

const root = path.resolve(__dirname, '..');
const base = process.env.TRACEBANK_TEST_URL || 'http://127.0.0.1:8765';
const screenshots = path.join(root, 'artifacts', 'screenshots');
fs.mkdirSync(screenshots, { recursive: true });
const report = { started_at: new Date().toISOString(), base_url: base, tests: [], console_errors: [], page_errors: [], unexpected_http_errors: [], screenshots: [] };
const passed = (name, evidence) => report.tests.push({ name, status: 'passed', evidence });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.TRACEBANK_BROWSER_PATH || (fs.existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch({ ...(executablePath ? {executablePath} : {}), headless: true, args: ['--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.page_errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('401')) report.console_errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !(r.url().endsWith('/api/session') && r.status() === 401)) report.unexpected_http_errors.push({ url: r.url(), status: r.status() }); });
  const shot = async (filename, fullPage = true) => { const file = path.join(screenshots, filename); await page.screenshot({ path: file, fullPage, mask: filename.includes('verification') ? [page.locator('.inbox-code')] : [], maskColor: '#e6e0c8' }); report.screenshots.push(file); };
  async function chat(message) {
    await page.locator('#message').fill(message);
    const wait = page.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST');
    await page.locator('#send').click();
    const r = await wait; assert.equal(r.status(), 200, await r.text());
    const data = await r.json();
    await page.locator('#send').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('send').disabled);
    return data;
  }
  async function approveOperation() {
    const response = page.waitForResponse(r => /\/api\/operations\/[^/]+\/authorize$/.test(r.url()));
    await page.locator('#plan-content').getByRole('button', { name: /^确认/ }).click();
    const r = await response; assert.equal(r.status(), 200, await r.text()); return r.json();
  }
  async function completeMfa() {
    await page.locator('#mfa-dialog').waitFor({ state: 'visible' });
    await page.locator('#load-inbox').click();
    await page.locator('.inbox-code').waitFor({ state: 'visible' });
    const code = (await page.locator('.inbox-code').first().textContent()).trim();
    assert(code.length >= 4, 'An actual per-operation demo OTP is displayed');
    assert(!(await page.locator('#conversation').innerText()).includes(code), 'OTP is not exposed in chat');
    assert(!(await page.locator('#plan-content').innerText()).includes(code), 'OTP is not exposed in plan');
    await page.locator('#otp').fill(code);
    const response = page.waitForResponse(r => /\/api\/operations\/[^/]+\/authorize$/.test(r.url()));
    await page.locator('#verify-submit').click();
    const r = await response; assert.equal(r.status(), 200, await r.text());
    const data = await r.json(); assert.equal(data.operation.status, 'succeeded');
    await page.locator('#mfa-dialog').waitFor({ state: 'hidden' }); return data;
  }
  try {
    await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('#login-screen').waitFor({ state: 'visible' });
    await shot('login-desktop.png');
    const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/session') && r.request().method() === 'POST');
    await page.locator('#login-form button[type=submit]').click();
    const login = await loginResponse; assert.equal(login.status(), 200);
    const session = await login.json();
    await page.locator('#app').waitFor({ state: 'visible' });
    await page.locator('#account-strip .account-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#planner-mode-label').innerText(), session.planner_mode === 'offline' ? '离线规则基线' : '模型规划模式');
    assert.equal(await page.locator('#message').getAttribute('maxlength'), '2000');
    passed('login-and-explicit-planner-mode', { user: session.user.id, planner_mode: session.planner_mode, csrf_present: Boolean(session.csrf_token) });

    const analysis = await chat('看看这个月的账单，有没有异常消费');
    assert.equal(analysis.plan.status, 'succeeded');
    assert(analysis.plan.nodes.some(n => n.tool === 'bills' && n.result?.categories?.length));
    await page.locator('.result-total').waitFor({ state: 'visible' });
    await shot('dashboard-desktop.png');
    passed('green-bill-analysis', { plan_id: analysis.plan.id, status: analysis.plan.status, categories: analysis.plan.nodes[0].result.categories.length });

    const overview = await page.evaluate(() => fetch('/api/overview').then(r => r.json()));
    assert(overview.daily_transfer_cents <= 99900, 'Demo account must have at least ¥1 yellow headroom; reset demo dataset before rerun when exhausted');
    const amount = overview.daily_transfer_cents <= 70000 ? 300 : 1;
    const transfer = await chat(`给李娜转${amount}元`);
    const transferOperation = transfer.plan.nodes.find(n => n.tool === 'transfer').operation;
    assert.equal(transferOperation.risk, 'yellow'); assert.equal(transferOperation.status, 'awaiting_confirmation');
    assert(!transferOperation.receipt);
    await shot('transfer-confirmation-desktop.png');
    const confirmed = await approveOperation();
    assert.equal(confirmed.operation.status, 'succeeded'); assert(confirmed.operation.receipt.id);
    assert.equal(confirmed.operation.receipt.amount_cents, amount * 100);
    await page.locator('.receipt-title').waitFor({ state: 'visible' });
    passed('yellow-transfer-confirmation-and-receipt', { operation_id: transferOperation.id, amount_cents: amount * 100, receipt_id: confirmed.operation.receipt.id });

    const cards = overview.cards;
    const card = cards.find(c => c.id === 'card-alice') || cards.find(c => c.last4 === '1024') || cards[0];
    assert(card, 'Seeded card exists');
    if (['lost', 'reported_lost'].includes(String(card.status).toLowerCase())) {
      await chat(`帮我解挂尾号${card.last4}的卡片`); await approveOperation(); await completeMfa();
    }
    const lost = await chat(`我的尾号${card.last4}银行卡丢了，帮我挂失`);
    const lostOp = lost.plan.nodes.find(n => n.tool === 'card.report_lost').operation;
    assert.equal(lostOp.risk, 'red');
    const challenged = await approveOperation(); assert.equal(challenged.operation.status, 'awaiting_verification');
    await page.locator('#mfa-dialog').waitFor({ state: 'visible' });
    await page.locator('#load-inbox').click(); await page.locator('.inbox-code').waitFor({ state: 'visible' });
    await shot('strong-verification-desktop.png');
    const verified = await completeMfa();
    passed('red-card-loss-independent-otp-and-receipt', { operation_id: lostOp.id, receipt_id: verified.operation.receipt.id, chat_otp_leak: false });

    await page.getByRole('button', { name: /审计轨迹/ }).click();
    await page.locator('#audit-integrity').filter({ hasText: '校验通过' }).waitFor({ state: 'visible' });
    const eventCount = await page.locator('.audit-event').count(); assert(eventCount > 0);
    await shot('audit-desktop.png');
    passed('audit-view-and-chain-validation', { event_count: eventCount });

    await page.getByRole('button', { name: /智能助手/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(200);
    const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert(bounds.scroll <= bounds.width, `Mobile overflow ${JSON.stringify(bounds)}`);
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await shot('dashboard-mobile.png');
    passed('mobile-layout-no-horizontal-overflow', bounds);

    assert.deepEqual(report.page_errors, []); assert.deepEqual(report.unexpected_http_errors, []); assert.deepEqual(report.console_errors, []);
    passed('browser-runtime', { page_errors: 0, unexpected_http_errors: 0, console_errors: report.console_errors.length });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = { message: error.message, stack: error.stack };
    await shot('browser-failure.png').catch(() => {});
    process.exitCode = 1;
  } finally {
    report.finished_at = new Date().toISOString();
    await browser.close();
    fs.mkdirSync(path.join(root,'evals','results'), {recursive:true});
    fs.writeFileSync(path.join(root,'evals','results','browser-smoke.json'), JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
