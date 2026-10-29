# 当前API与模块契约

更新：2026-10-26，功能基线18aa38d。Python/FastAPI、同源静态前端、SQLite。下面为当前实现摘要，严格请求与参数类型以api.py和tools.py为准。

## 身份与写入

客户端先POST /api/session登录，收到HttpOnly会话cookie及CSRF值。后端以会话确定用户，不接受模型或普通业务载荷指定owner。写请求需要X-CSRF-Token且有Origin时必须同源。演示角色为user和operator，客户不能访问admin接口，操作员不能访问客户业务接口。OTP和PIN在独立面板提交，不发送给模型。

## 客户API

| 方法与路径 | 当前含义 |
| --- | --- |
| GET /api/health | 规划模式与进程健康，不是全场景认证 |
| POST /api/session | username/password登录；GET读取会话，DELETE退出 |
| GET /api/overview | 余额、可用金额、锁定、卡片、联系人等模拟总览 |
| POST /api/chat | 同步候选计划；message及可选conversation_id |
| POST /api/runs | 202创建异步运行；GET列运行，GET /api/runs/{id}?after=读取增量事件 |
| POST /api/runs/{id}/cancel | 停止本轮后续行动，不能撤销已提交资金 |
| GET /api/conversations/{id} | 归属校验的持久化对话，支持before历史分页 |
| GET /api/plans及/{id} | 原计划、节点、操作及业务回答 |
| POST /api/plans/{id}/control | pause/resume/cancel/handoff控制 |
| POST /api/operations/{id}/authorize | approve、可选otp/new_pin；新PIN须6位且经后端复核 |
| POST /api/operations/{id}/cancel及/reconcile | 取消未执行操作，或核实原操作；不新建第二笔转账 |
| GET /api/analytics?period= | month/last_month/year账单与流水 |
| GET /api/wealth | 模拟产品、持仓、风险档案与问卷 |
| POST /api/wealth/assessment | 本人问卷答案更新模拟风险档案 |
| GET /api/schedules | 预约、锁定、AA、纪念日与预测所需数据 |
| POST /api/schedules/{id}/run-now | 明确标记为演示的提前执行，不是真实到期 |
| POST /api/splits/{id}/shares/{contact_id}/settle | 演示对方付款，模拟入账 |
| GET /api/subscriptions/detected | 近200天扣费推断及部分签约信息；授权口径待复核 |
| GET /api/security及/api/audit | 安全计数、关联事件及hash链检查 |
| GET /api/auth/demo-inbox | 模拟验证码，仅独立认证面板使用，不提供模型工具 |

## 银行与计划契约

BankService提供summary、analysis、create_operation、authorize、cancel_operation、reconcile、audit、run_due等方法。工具注册、严格参数和允许的回执引用由tools.py与planner.validate_nodes共同约束，最多12节点。plan包含id、conversation_id、message、status、nodes及answer等，节点包含tool、params、depends_on、status、result或operation。

写工具创建operation后等待确认，红色需操作绑定挑战；receipt为已提交的真实模拟业务回执。相同用户与幂等键仅对应同一组参数，冲突拒绝。结果未知先查原操作。资金锁定、预约创建与未来付款是不同事件，不能把预约回执说成商户已付款或发货。

普通转账提交复算实际日累计；预约创建合并同执行日预约，但到期执行尚未复算普通转账与预约的实际日累计升级验证。此P1缺口见安全自评，不承诺所有付款路径都满足1000元累计规则。

## 后台与副作用边界

当前进程默认每30秒处理到期预约/锁定释放，TRACEBANK_SCHEDULER=0可关闭后台线程。summary和schedules方法也会调用run_due处理已预授权任务，所以读取总览/日程可能触发既有到期预约，不能将这些GET描述为绝对无业务副作用。API读请求不会创建新的用户授权。

## 操作员API

GET /api/admin/handoffs列接管计划。POST /api/admin/plans/{id}/release接受user_id与reason，由独立操作员交还处理权并记录审计，不能替客户确认或验证。所有身份与银行连接均为本机演示，公网部署、真实MFA和生产并发保证不在当前契约中。
