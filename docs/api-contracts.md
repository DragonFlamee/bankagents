# API 与模块契约 v0.1

状态：工程实现规格；非调研结论。日期：2026-10-20。

## 服务端

Python 3.12 + FastAPI，SQLite WAL 单写事务。静态前端同源提供。不使用真实银行数据。
所有 /api 业务请求由会话确定 user_id，不接受客户端指定 owner；写请求需 X-CSRF-Token。

### BankService（banking_agent/bank.py）

构造 `BankService(db_path, clock=None)`，clock 为返回 UTC aware datetime 的可选函数。数据库按需初始化和幂等演示数据播种。
抛 `DomainError(code, message, status=400)`，有 code/message/status 属性。

- `summary(user_id)` → `{accounts:[{id,name,balance_cents,currency}], cards:[{id,last4,status}], contacts:[{id,name,phone}], daily_transfer_cents, subscriptions:[{id,name,amount_cents,status}], goals:[], demo:true}`。summary 不泄漏订阅详情：subscriptions 应由受权查询获得；可保留字段为空数组。
- `transactions(user_id, period='month')` → `{transactions:[{id,merchant,amount_cents,category,occurred_at,description}], period, total_expense_cents}`。
- `analysis(user_id, period='month')` → `{period,categories:[{category,total_cents,count}],total_expense_cents,income_cents,anomalies:[{transaction_id,reason,amount_cents}],transaction_count,source_transaction_ids}`。
- `create_operation(user_id, tool, params, idempotency_key)` → operation。工具 transfer 参数 `{contact_id,amount_cents,note?}`；card.report_lost/card.unlock `{card_id}`；card.virtual `{}`；subscriptions.get `{}`；subscriptions.cancel `{subscription_id}`；goals.create `{name,amount_cents}`。
- `get_operation(user_id, operation_id)` → operation。
- `authorize(user_id, operation_id, approve, otp=None)` → operation。approve 必须严格 bool。黄色确认执行；红色首次 approve 生成挑战，后续 approve+otp 独立认证；错误 OTP 失败计数与锁定持久化。每次执行在事务内重新检查日累计，超出原 yellow 授权等级时升级 red 且重新验证。
- `cancel_operation(user_id, operation_id)` → operation，已完成不能假装回退。
- `demo_inbox(user_id)` → `{demo:true,messages:[{operation_id,code,expires_at}]}`。只给独立认证界面；任何模型工具不可调用。
- `audit(user_id)` → `{events:[...],chain_valid:bool}`，按用户脱敏输出，持久化 hash 链用于检测改写，不宣称不可篡改。
- `reconcile(user_id, operation_id)` → operation，从已提交回执核实，重复查询不执行。
- `set_fault(user_id, mode)`（仅测试/显式 demo 运维，不暴露模型工具）模式 none/timeout_after_commit/channel_failure，后端能模拟提交后回执丢失和通道熔断。

operation 为 `{id,tool,params,risk:'yellow'|'red',status:'awaiting_confirmation'|'awaiting_verification'|'succeeded'|'cancelled'|'failed'|'unknown',message,receipt:object|null,created_at,expires_at,challenge_id?}`。
receipt 含 id/status='succeeded'/tool/occurred_at 及对应业务字段。不向模型或审计暴露验证码。相同用户相同幂等键不同参数拒绝 409；相同参数返回同一 operation。

## HTTP 契约

- POST /api/session `{username,password}` → `{user:{id,name},csrf_token,demo:true}` + HttpOnly 会话 cookie。
- GET /api/session → 会话；DELETE /api/session → 注销。
- GET /api/overview → summary。
- GET /api/analytics?period=month|last_month|year → `{period,analysis,transactions}`。2026-10-22 新 UI 的只读业务适配，组合现有分析和流水方法，自动按当前客户隔离；不修改资金、卡片或授权，查询仍记录审计事件。操作员角色不可访问。
- POST /api/chat `{message,conversation_id?}` → `{conversation_id,reply,plan}`。
- GET /api/plans/{id} → plan；GET /api/plans → 用户计划。
- POST /api/plans/{id}/control `{action:'pause'|'resume'|'cancel'|'handoff'}` → plan。
- POST /api/operations/{id}/authorize `{approve:true,otp?}` → `{operation,plan?}`。
- POST /api/operations/{id}/cancel → operation。
- POST /api/operations/{id}/reconcile → `{operation,plan?}`。
- GET /api/auth/demo-inbox → demo_inbox；GET /api/audit → audit。
- 操作员专用：GET /api/admin/handoffs → `{plans:[{user_id,plan}]}`；POST /api/admin/plans/{id}/release `{user_id,reason}` → 更新后的plan。reason为5–300字，处理人和说明进入审计；交还后仍需客户授权。

客户不能访问admin路由，操作员不能访问客户业务路由。POST /api/session 响应还含 `role:'customer'|'operator'`；操作员账户为独立演示身份。没有GET /api/operations/{id}路由，HTTP侧通过GET plan获取原操作状态。

plan 为 `{id,status,message,nodes:[{id,tool,params,depends_on:[],status,result?,operation?}],created_at,conversation_id}`。
状态 pending/running/awaiting_confirmation/awaiting_verification/unknown/paused/handoff/succeeded/cancelled/failed。计划和会话持久化。GET 不偷偷执行写操作。

## 工程边界

模型仅输出允许工具的候选 DAG；请求不得携带已授权或用户身份声明。执行端复核严格参数和账户归属。验证码不进入 chat/LLM 上下文。重试恢复依赖持久化 operation ID 与幂等键。查询余额等不触发授权对话，订阅查询按赛题黄色。
