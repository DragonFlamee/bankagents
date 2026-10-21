"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { session: null, csrf: null, overview: null, plans: [], plan: null, conversationId: null, activeOperation: null, view: "assistant", busy: false };
  const names = { balance: "查询账户余额", "accounts.get": "查询账户余额", transactions: "查询交易记录", "transactions.get": "查询交易记录", analysis: "分析账单", bills: "分析账单", "analysis.expression": "分析计算", "bills.analyze": "分析账单", cards: "查询卡片", "cards.get": "查询卡片", transfer: "智能转账", "card.report_lost": "银行卡挂失", "card.unlock": "银行卡解挂", "card.virtual": "申请虚拟卡", "subscriptions.get": "查询订阅", "subscriptions.cancel": "取消订阅", "goals.create": "创建储蓄目标" };
  const statuses = { pending: "等待执行", running: "办理中", awaiting_confirmation: "等待确认", awaiting_verification: "等待验证", unknown: "结果待核实", paused: "已暂停", handoff: "人工接管", succeeded: "已完成", cancelled: "已取消", failed: "办理失败", blocked: "等待前置步骤", active: "正常", frozen: "已冻结", lost: "已挂失", reported_lost: "已挂失" };
  const done = new Set(["succeeded", "cancelled", "failed"]);
  const money = (cents) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format((Number(cents) || 0) / 100);
  const date = (value, compact = false) => { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", ...(compact ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : {}) }); };
  const text = (tag, content, cls) => { const e = document.createElement(tag); if (content != null) e.textContent = content; if (cls) e.className = cls; return e; };
  const clear = (e) => e.replaceChildren();
  const color = (status) => ["succeeded", "active"].includes(status) ? "green" : ["awaiting_confirmation", "awaiting_verification", "unknown"].includes(status) ? "yellow" : status === "failed" ? "red" : ["running", "handoff"].includes(status) ? "blue" : "neutral";
  const chip = (status) => text("span", statuses[status] || status || "待处理", `status-chip ${color(status)}`);
  const labelFor = (tool) => names[tool] || tool || "业务操作";
  function button(label, action, style = "secondary small") { const b = text("button", label, `button ${style}`); b.type = "button"; b.addEventListener("click", () => run(action, b)); return b; }
  function notify(message) { $("toast").textContent = message; $("toast").classList.remove("hidden"); clearTimeout(notify.timer); notify.timer = setTimeout(() => $("toast").classList.add("hidden"), 4200); }
  function errorMessage(error) { return error.message || "请求失败，请稍后重试。"; }
  function showError(error) { $("global-error").textContent = errorMessage(error); $("global-error").classList.remove("hidden"); }
  async function api(path, options = {}) {
    const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(state.csrf ? { "X-CSRF-Token": state.csrf } : {}), ...(options.headers || {}) };
    let response;
    try { response = await fetch(path, { credentials: "same-origin", ...options, headers }); } catch (_) { throw new Error("无法连接银行服务。请检查本地服务是否运行；尚未确认任何业务结果。"); }
    let data; try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) {
      if (response.status === 401 && path !== "/api/session") showLogin();
      const detail = data.detail;
      const message = data.error?.message || data.message || (typeof detail === "string" ? detail : detail?.message) || (response.status === 429 ? "操作过于频繁，请稍后重试。" : `请求未完成（${response.status}）`);
      const error = new Error(message); error.status = response.status; error.data = data; throw error;
    }
    return data;
  }
  const post = (url, body = {}) => api(url, { method: "POST", body: JSON.stringify(body) });
  async function run(action, target) {
    if (target) target.disabled = true;
    $("global-error").classList.add("hidden");
    try { await action(); } catch (error) { showError(error); } finally { if (target?.isConnected) target.disabled = false; }
  }
  function showLogin() { state.session = null; state.csrf = null; $("boot").classList.add("hidden"); $("app").classList.add("hidden"); $("login-screen").classList.remove("hidden"); if ($("mfa-dialog").open) $("mfa-dialog").close(); }
  async function openApp(session) {
    state.session = session; state.csrf = session.csrf_token; const u = session.user || {};
    const offline = session.planner_mode === "offline";
    $("planner-mode-label").textContent = offline ? "离线规则基线" : "模型规划模式";
    $("planner-mode-label").title = offline ? "当前使用确定性规则解析；尚未连接或验证实时大模型。" : "模型配置不等于实时推理已经通过验证。";
    document.querySelector(".nav-hint").textContent = offline ? "规则" : "模型";
    state.conversationId = sessionStorage.getItem(`tracebank:${u.id || u.username}:conversation`);
    $("user-name").textContent = u.name || u.username || "演示账户";
    $("greeting").textContent = `你好，${u.name || "今天想办什么"}${u.name ? "。今天想办什么？" : "？"}`;
    $("today").textContent = new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" });
    $("login-screen").classList.add("hidden"); $("boot").classList.add("hidden"); $("app").classList.remove("hidden");
    await refresh();
  }
  function renderOverview() {
    const data = state.overview || {}; const accounts = data.accounts || []; const total = accounts.reduce((sum, a) => sum + Number(a.balance_cents || 0), 0);
    clear($("account-strip"));
    const entries = [ ["可用资金", money(total), "模拟账户余额 · 人民币 CNY", true, "↗"], ["今日累计转账", money(data.daily_transfer_cents || 0), "累计超过 ¥1,000 须强验证", false, "↗"], ["我的银行卡", `${(data.cards || []).length} 张`, "重要状态变更需独立验证", false, "▱"] ];
    for (const [label, value, note, primary, icon] of entries) { const card = text("div", null, `account-card${primary ? " primary-account" : ""}`); const top = text("div", null, "account-card-label"); top.append(text("span", label), text("span", icon, "account-card-symbol")); card.append(top, text("div", value, "account-value"), text("p", note, "account-card-note")); $("account-strip").append(card); }
    clear($("cards"));
    if (!(data.cards || []).length) $("cards").append(text("p", "暂无可展示的卡片。", "muted"));
    for (const card of data.cards || []) { const row = text("div", null, "bank-card"); row.append(text("span", null, "mini-card")); const desc = text("div"); desc.append(text("strong", card.name || "拾迹借记卡", "bank-card-name"), text("span", `•••• ${card.last4 || "—"}`, "bank-card-id")); row.append(desc, chip(String(card.status || "").toLowerCase())); $("cards").append(row); }
  }
  async function refresh() {
    const results = await Promise.allSettled([api("/api/overview"), api("/api/plans")]);
    if (results[0].status === "fulfilled") { state.overview = results[0].value; renderOverview(); } else showError(results[0].reason);
    if (results[1].status === "fulfilled") {
      const data = results[1].value; state.plans = Array.isArray(data) ? data : data.plans || [];
      if (state.plan) state.plan = state.plans.find(p => p.id === state.plan.id) || state.plan;
      else if (state.plans.length) state.plan = state.plans[0];
      renderPlan(); renderHistory();
    } else showError(results[1].reason);
    if (state.view === "audit") await loadAudit();
  }
  function addMessage(role, content, planId) {
    const welcome = $("conversation").querySelector(".welcome-message"); if (welcome) welcome.remove();
    const row = text("div", null, `message ${role}`); const body = text("div", null, "message-body"); row.append(text("span", role === "user" ? "我" : "✦", "message-icon"), body);
    body.append(text("div", role === "user" ? "你" : "拾迹", "message-author"), text("div", content, "message-text"));
    if (planId) { const link = text("button", "查看本次办理步骤 ↗", "text-button message-plan-link"); link.type = "button"; link.addEventListener("click", () => run(async () => { state.plan = await api(`/api/plans/${encodeURIComponent(planId)}`); renderPlan(); $("task-title").scrollIntoView({ block: "nearest", behavior: "smooth" }); }, link)); body.append(link); }
    $("conversation").append(row); $("conversation").scrollTop = $("conversation").scrollHeight;
  }
  function fields(params = {}) {
    const contact = (state.overview?.contacts || []).find(c => c.id === params.contact_id); const card = (state.overview?.cards || []).find(c => c.id === params.card_id);
    const values = [];
    if (params.contact_id) values.push(["收款人", contact ? `${contact.name} · ${contact.phone || ""}` : params.contact_id]);
    if (params.amount_cents != null) values.push(["金额", money(params.amount_cents)]);
    if (params.card_id) values.push(["卡片", card ? `尾号 ${card.last4}` : params.card_id]);
    if (params.subscription_id) values.push(["订阅", params.subscription_id]);
    if (params.name) values.push(["名称", params.name]);
    if (params.note) values.push(["备注", params.note]);
    if (params.period) values.push(["周期", ({ month: "本月", year: "本年", all: "全部" })[params.period] || params.period]);
    return values;
  }
  function definitionList(items, cls = "operation-detail") { const dl = text("dl", null, cls); for (const [k,v] of items) { dl.append(text("dt", k), text("dd", v)); } return dl; }
  function operationDetails(op) { return definitionList(fields(op.params)); }
  function rawDetails(value, summary = "查看业务数据与来源") { const details = text("details", null, "data-details"); details.append(text("summary", summary), text("pre", JSON.stringify(value, null, 2))); return details; }
  function renderResult(result, tool) {
    const box = text("div", null, "result-block");
    const data = result?.data || result;
    if (data && Array.isArray(data.categories)) {
      box.append(text("span", `${data.period === "year" ? "本年" : "本月"}支出`), text("strong", money(data.total_expense_cents), "result-total"));
      for (const c of data.categories) { const row = text("div", null, "category-row"); row.append(text("span", `${c.category} · ${c.count ?? "—"}笔`), text("strong", money(c.total_cents))); box.append(row); }
      for (const a of data.anomalies || []) box.append(text("div", `${money(a.amount_cents)} · ${a.reason}（交易 ${a.transaction_id}）`, "anomaly"));
      if (!data.anomalies?.length) box.append(text("p", "本次规则未标记异常；不代表所有交易均无风险。", "small-print"));
    } else if (data?.accounts) {
      for (const a of data.accounts) { const row = text("div", null, "category-row"); row.append(text("span", a.name || a.id), text("strong", money(a.balance_cents))); box.append(row); }
    } else if (Array.isArray(data?.cards)) {
      for (const c of data.cards) box.append(text("p", `尾号 ${c.last4} · ${statuses[String(c.status).toLowerCase()] || c.status}`));
    } else if (Array.isArray(data?.transactions)) {
      box.append(text("strong", `共 ${data.transactions.length} 条交易`));
      for (const t of data.transactions.slice(0, 8)) { const row = text("div", null, "category-row"); row.append(text("span", t.merchant || t.description || t.id), text("span", money(t.amount_cents))); box.append(row); }
    } else if (Array.isArray(data?.subscriptions)) {
      for (const s of data.subscriptions) box.append(text("p", `${s.name} · ${money(s.amount_cents)} · ${s.status}`));
    } else box.append(text("p", data?.message || "业务查询已返回，数据可展开核对。"));
    box.append(rawDetails(result)); return box;
  }
  function renderReceipt(receipt) {
    const box = text("div", null, "receipt"); box.append(text("strong", "✓ 业务回执", "receipt-title"));
    const f = [["状态", statuses[receipt.status] || receipt.status || "—"], ["业务编号", receipt.id || receipt.transaction_id || "—"]];
    if (receipt.amount_cents != null) f.push(["金额", money(receipt.amount_cents)]);
    if (receipt.occurred_at || receipt.created_at) f.push(["业务时间", date(receipt.occurred_at || receipt.created_at)]);
    box.append(definitionList(f, "receipt-fields"), rawDetails(receipt, "查看完整回执")); return box;
  }
  function operationCard(op) {
    const card = text("div", null, `operation-card risk-${op.risk || "yellow"}`); const top = text("div", null, "node-heading"); top.append(text("span", op.risk === "red" ? "红色 · 独立强验证" : "黄色 · 明确确认", `status-chip ${op.risk === "red" ? "red" : "yellow"}`), chip(op.status)); card.append(top, operationDetails(op));
    if (op.message) card.append(text("p", op.message, "operation-message"));
    if (op.expires_at && !done.has(op.status)) card.append(text("p", `授权有效期至 ${date(op.expires_at, true)}`, "small-print"));
    if (op.receipt) card.append(renderReceipt(op.receipt));
    if (op.status === "awaiting_confirmation" || op.status === "awaiting_verification") {
      const row = text("div", null, "button-row");
      row.append(button(op.risk === "red" || op.status === "awaiting_verification" ? "确认并进入验证" : "确认办理", () => authorize(op), "primary small"), button("取消操作", () => cancelOperation(op)));
      card.append(row);
    }
    if (op.status === "unknown") card.append(button("查询并核实业务结果", async () => applyOperationResponse(await post(`/api/operations/${encodeURIComponent(op.id)}/reconcile`)), "primary small"));
    return card;
  }
  function renderPlan() {
    const plan = state.plan; if (!plan) return;
    $("plan-status").replaceWith(Object.assign(chip(plan.status), { id: "plan-status" })); clear($("plan-content"));
    $("plan-content").append(text("p", plan.message || "本次办理计划", "plan-description"), text("p", `任务 ${plan.id} · ${date(plan.created_at, true)}`, "plan-meta"));
    for (const [index,node] of (plan.nodes || []).entries()) {
      const section = text("article", null, "node"); const marker = text("span", node.status === "succeeded" ? "✓" : String(index + 1), `node-marker ${node.status}`); const head = text("div", null, "node-heading"); head.append(text("strong", labelFor(node.tool)), chip(node.status)); section.append(marker, head);
      if (node.depends_on?.length) section.append(text("p", `等待前置步骤：${node.depends_on.join("、")}`, "node-dependencies"));
      if (node.operation) section.append(operationCard(node.operation));
      else if (node.result != null) section.append(renderResult(node.result, node.tool));
      else if (node.error || node.message) section.append(text("p", node.error?.message || node.error || node.message, "operation-message"));
      else if (fields(node.params).length) section.append(definitionList(fields(node.params)));
      $("plan-content").append(section);
    }
    if (!(plan.nodes || []).length) $("plan-content").append(text("p", "当前计划尚无可执行步骤，请补充业务信息。", "muted"));
    if (!done.has(plan.status)) {
      const controls = text("div", null, "plan-controls");
      if (plan.status === "paused") controls.append(button("恢复任务", () => controlPlan("resume")));
      else if (plan.status !== "handoff") controls.append(button("暂停后续步骤", () => controlPlan("pause")));
      if (plan.status !== "handoff") controls.append(button("转人工接管", () => controlPlan("handoff")));
      controls.append(button("取消未执行步骤", () => controlPlan("cancel"), "danger small")); $("plan-content").append(controls);
      if (plan.status === "handoff") $("plan-content").append(text("p", "任务已交由人工处理，普通会话不能直接恢复执行。", "small-print"));
    }
  }
  async function applyOperationResponse(response) {
    const op = response.operation || response;
    if (response.plan) state.plan = response.plan;
    else if (state.plan) for (const node of state.plan.nodes || []) if (node.operation?.id === op.id) { node.operation = op; node.status = op.status; }
    renderPlan();
    if (op.status === "awaiting_verification") { await openMfa(op); }
    else if (op.status === "succeeded") { if ($("mfa-dialog").open) $("mfa-dialog").close(); state.activeOperation = null; notify("业务已完成，可查看回执核对。"); }
    else if (op.status === "unknown") {
      if ($("mfa-dialog").open) $("mfa-dialog").close();
      $("otp").value = ""; state.activeOperation = null;
      notify("业务结果待核实。请查询结果，不要重复发起。");
    }
    await refresh();
  }
  async function authorize(op) {
    if (op.status === "awaiting_verification") { await openMfa(op); return; }
    const response = await post(`/api/operations/${encodeURIComponent(op.id)}/authorize`, { approve: true });
    await applyOperationResponse(response);
  }
  async function cancelOperation(op) { await applyOperationResponse(await post(`/api/operations/${encodeURIComponent(op.id)}/cancel`)); notify("已请求取消，具体结果以当前业务状态为准。"); }
  async function controlPlan(action) { if (!state.plan) return; const response = await post(`/api/plans/${encodeURIComponent(state.plan.id)}/control`, { action }); state.plan = response.plan || response; renderPlan(); await refresh(); }
  async function openMfa(op) {
    state.activeOperation = op; $("mfa-error").textContent = ""; $("otp").value = "";
    clear($("mfa-operation")); $("mfa-operation").append(text("strong", labelFor(op.tool)), operationDetails(op));
    $("inbox-content").textContent = "尚未读取。此功能不发送真实短信。";
    if (!$("mfa-dialog").open) $("mfa-dialog").showModal(); $("otp").focus();
  }
  async function loadInbox() {
    const inbox = await api("/api/auth/demo-inbox"); clear($("inbox-content"));
    const messages = (inbox.messages || []).filter(m => m.operation_id === state.activeOperation?.id);
    if (!messages.length) { $("inbox-content").textContent = "未找到本次操作的有效验证码。请关闭面板并重新发起验证。"; return; }
    for (const m of messages) { const entry = text("div"); entry.append(text("div", String(m.code), "inbox-code"), text("p", `到期时间：${date(m.expires_at, true)} · 仅限本次操作`)); $("inbox-content").append(entry); }
  }
  function renderHistory() {
    clear($("history"));
    if (!state.plans.length) { $("history").append(text("div", "尚无办理记录。向拾迹说出第一项需求吧。", "empty-state")); return; }
    for (const plan of state.plans) { const row = text("article", null, "history-item"); const info = text("div", null, "history-info"); info.append(text("strong", plan.message || "银行业务任务"), text("span", `${date(plan.created_at)} · ${plan.id}`)); row.append(info, chip(plan.status), button("查看步骤 ↗", async () => { state.plan = await api(`/api/plans/${encodeURIComponent(plan.id)}`); renderPlan(); await switchView("assistant"); })); $("history").append(row); }
  }
  async function loadAudit() {
    const data = await api("/api/audit"); $("audit-integrity").textContent = data.chain_valid === true ? "✓ 哈希链校验通过" : data.chain_valid === false ? "记录完整性异常" : "未返回完整性结论"; $("audit-integrity").className = `status-chip ${data.chain_valid === true ? "green" : data.chain_valid === false ? "red" : "neutral"}`;
    clear($("audit-events"));
    if (!data.events?.length) $("audit-events").append(text("div", "暂无审计事件。", "empty-state"));
    for (const event of [...(data.events || [])].reverse()) { const row = text("article", null, "audit-event"); const time = text("time", date(event.occurred_at || event.created_at || event.timestamp, true)); row.append(time, text("strong", event.event || event.event_type || event.action || event.type || "业务事件"), text("pre", JSON.stringify(event.details || event.payload || event, null, 2))); $("audit-events").append(row); }
  }
  async function switchView(view) {
    state.view = view;
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("hidden", el.id !== `${view}-view`));
    document.querySelectorAll("[data-view]").forEach(b => { const active = b.dataset.view === view; b.classList.toggle("active", active); if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("view-title").textContent = { assistant: "智能助手", activity: "办理记录", audit: "审计轨迹" }[view];
    if (view === "audit") await loadAudit(); if (view === "activity") await refresh();
  }
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const submit = event.currentTarget.querySelector("button[type=submit]"); submit.disabled = true; $("login-error").textContent = "";
    try { const session = await post("/api/session", { username: $("username").value.trim(), password: $("password").value }); await openApp(session); } catch (error) { $("login-error").textContent = errorMessage(error); } finally { submit.disabled = false; }
  });
  $("chat-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const message = $("message").value.trim(); if (!message || state.busy) return;
    state.busy = true; $("send").disabled = true; $("message").value = ""; $("global-error").classList.add("hidden"); addMessage("user", message);
    try { const response = await post("/api/chat", { message, conversation_id: state.conversationId || undefined }); state.conversationId = response.conversation_id || state.conversationId; if (state.conversationId) sessionStorage.setItem(`tracebank:${state.session?.user?.id || state.session?.user?.username}:conversation`, state.conversationId); if (response.plan) { state.plan = response.plan; renderPlan(); } addMessage("assistant", response.reply || "已返回本次任务状态，请查看办理进度。", response.plan?.id); await refresh(); } catch (error) { addMessage("assistant", errorMessage(error)); showError(error); } finally { state.busy = false; $("send").disabled = false; $("message").focus(); }
  });
  $("message").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); $("chat-form").requestSubmit(); } });
  document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => { $("message").value = b.dataset.prompt; $("message").focus(); }));
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => run(() => switchView(b.dataset.view), b)));
  $("refresh").addEventListener("click", () => run(refresh, $("refresh"))); $("reload-history").addEventListener("click", () => run(refresh, $("reload-history")));
  $("logout").addEventListener("click", () => run(async () => { await api("/api/session", { method: "DELETE" }); state.plan = null; state.plans = []; state.overview = null; showLogin(); location.reload(); }, $("logout")));
  $("security-info").addEventListener("click", () => $("rules-dialog").showModal()); $("close-rules").addEventListener("click", () => $("rules-dialog").close());
  $("close-mfa").addEventListener("click", () => $("mfa-dialog").close()); $("load-inbox").addEventListener("click", () => run(loadInbox, $("load-inbox")));
  $("mfa-form").addEventListener("submit", async event => { event.preventDefault(); if (!state.activeOperation) return; const b = $("verify-submit"); b.disabled = true; $("mfa-error").textContent = ""; try { const response = await post(`/api/operations/${encodeURIComponent(state.activeOperation.id)}/authorize`, { approve: true, otp: $("otp").value.trim() }); await applyOperationResponse(response); } catch (error) { $("mfa-error").textContent = errorMessage(error); } finally { b.disabled = false; } });
  for (const id of ["mfa-dialog", "rules-dialog"]) $(id).addEventListener("click", event => { if (event.target === $(id)) { const r = $(id).getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $(id).close(); } });
  api("/api/session").then(openApp).catch(error => { showLogin(); if (error.status !== 401) $("login-error").textContent = errorMessage(error); });
})();
