# API与模块契约

FastAPI提供JSON接口和同源静态页面。请求字段由 `api.py` 的严格模型约束，工具参数以 `tools.py` 为准。

## 身份与写入

`POST /api/session`登录后返回HttpOnly会话cookie和CSRF值。写请求携带`X-CSRF-Token`，提供Origin时必须同源。用户归属来自会话；普通客户不能访问admin接口，操作员不能访问客户业务接口。

演示客户为`alice`和`bob`，操作员为`operator`。OTP和新PIN通过独立面板提交，不进入模型上下文。

## 接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/health` | 当前模式与进程健康信息 |
| `POST /api/session`、`GET /api/session`、`DELETE /api/session` | 登录、读取会话及退出 |
| `GET /api/overview` | 所属用户的账户、卡片、计划外预约付款待办等 |
| `POST /api/runs`、`GET /api/runs`、`GET /api/runs/{id}` | 启动、列表及增量读取运行 |
| `GET /api/conversations/{id}` | 读取连续对话 |
| `POST /api/chat` | 同步创建计划，供兼容及测试使用 |
| `GET /api/plans`、`GET /api/plans/{id}` | 读取计划与节点 |
| `POST /api/plans/{id}/control` | 暂停、恢复、取消或转人工 |
| `POST /api/operations/{id}/authorize` | 本人确认或验证码验证 |
| `POST /api/operations/{id}/cancel`、`POST /api/operations/{id}/reconcile` | 取消未提交操作、核实原操作 |
| `GET /api/analytics`、`GET /api/schedules`、`GET /api/security` | 账单、资金日程和安全状态 |
| `GET /api/subscriptions/detected` | 根据历史流水识别周期扣费，样本不足时返回空结果 |
| `GET /api/subscriptions/offers` | 可订阅模拟服务的固定价格、条款和当前用户的开通状态 |
| `GET /api/subscriptions/mandates` | 已签约代扣的当前状态；该用户须先完成一次 `subscriptions.get` 本人确认，否则返回 `authorized:false` 和空列表 |
| `GET /api/auth/demo-inbox` | 当前用户的模拟验证码收件箱 |
| `GET /api/admin/handoffs`、`POST /api/admin/plans/{id}/release` | 操作员接管队列与交还任务 |

其他理财、卡片和订阅读接口见 `api.py`。金融变更统一通过业务操作授权，不将直接修改数据库的接口暴露给模型。

`subscriptions.offers` 为只读工具。`subscriptions.subscribe(offer_id)` 仅接受版本化服务目录编号，金额和条款由服务端固定，不接受模型自定价格。开通属于黄色操作，须本人确认；确认时重新检查是否已经开通，重放原操作只返回原回执。当前知行阅读示例仅记录模拟签约与后续扣费日程，不立即扣款，也不执行周期扣款。

## 运行和计划

运行记录包含run、conversation、plan标识和持久化事件。事件可按游标增量读取，页面使用`tool.started`、`tool.result`、`authorization.required`及`response.delta`等事件展示实际进展。

计划包含节点ID、工具、参数、依赖与状态；写节点另保存银行operation。操作可能处于awaiting_confirmation、awaiting_verification、succeeded、failed、cancelled或unknown。成功才提供可展示的业务回执，unknown须查询原操作。

## 到期预约

`GET /api/overview`的`scheduled_operations`包含本用户到期后生成的独立付款，并附`schedule_id`和`run_date`。这类操作沿用授权、取消和对账端点。只有持久化预约链接能证明归属时，服务端才允许操作不关联Agent计划；响应的`plan`可以为`null`，前端必须处理空值。

`POST /api/schedules/{id}/run-now`仅供模拟演示，跳过等待日期但仍复核实际日累计和验证。重复调用待验证或未知的预约返回原执行结果，不新建付款。

## 错误

业务错误返回`{"error":{"code":"...","message":"..."}}`及对应HTTP状态。401表示未登录，403表示CSRF、同源或角色检查失败，404用于不存在或不属于当前用户的资源。前端不得从错误或超时推断资金未提交。
