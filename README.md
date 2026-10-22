# TraceBank · 拾迹银行

给出目标，看见 Agent 的每次行动。

面向银行 AI 智能体比赛的本地演示：对话生成候选任务，确定性后端决定权限，用户在独立操作卡片中确认或验证，再获得可核对的业务回执。支持离线规则基线与真实模型规划。2026-10-21已完成用户选择的 **qwen3.8-flash思考模式**联调：15个固定模型用例通过、133项回归通过，详见[模型联调说明](docs/model-integration.md)。这些是小样本模拟业务验证，不代表开放语言或生产银行效果。

2026-10-22 界面已改为 **Agent 工作台**：实时展示模型请求、计划校验、工具输入与观测、授权暂停、续跑和业务回执；可核对 Request ID 与 Token 用量。新增执行记录持久化与规划中停止。当前为一次模型规划后执行已保存的 DAG，尚无多轮自主重规划。最终 140 项项目测试和本轮 6 组真实模型工作流浏览器验证通过，见[工作台说明](docs/agent-workspace.md)。

## 已实现的主要路径

- 智能转账：姓名或手机号识别、同名澄清、黄色确认、日累计超过 1000 元升级红色验证、幂等与对账。
- 账单分析：本月、上月、本年分类汇总、异常证据与来源交易 ID。
- 卡片管理：查询、模拟挂失/解挂；挂失和解挂必须验证。
- 订阅查询/取消、虚拟卡与储蓄目标记录：按服务端规则确认；目标记录不冻结资金。
- 持久化任务、暂停/恢复/取消/接管、银行与计划审计事件。
- 受限数值 DSL 沙箱：独立进程解释生成表达式，不执行任意 Python。

所有账户、交易、卡片和认证均为模拟数据。默认口令和同应用演示 OTP 不适合真实银行或公网生产使用。

## 本地启动

需要 Python 3.12、可用浏览器。前端为原生 HTML/CSS/JavaScript，不需要 Node 构建。运行时直接依赖由 `requirements.txt` 固定；完整独立验证环境的23项版本（含测试依赖）记录在 `requirements-lock.txt`，精确复现可改用 `pip install -r requirements-lock.txt`。

Windows PowerShell，在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m banking_agent --host 127.0.0.1 --port 8765
```

然后打开 [本地演示](http://127.0.0.1:8765)。

| 项目 | 默认值 |
| --- | --- |
| 演示用户名 | `alice`（另有 `bob` 用于隔离测试） |
| 演示密码 | `tracebank-demo` |
| 监听地址 | `127.0.0.1:8765` |
| 数据目录 | 项目下 `data/` |
| 规划模式 | `offline` |

已有可用 `.venv` 时不必重新创建。终端前台运行服务，`Ctrl+C` 停止。始终使用一个 Uvicorn worker；当前进程内编排锁不提供多 worker 的任务租约保证。

Linux/macOS 对应命令：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m banking_agent --host 127.0.0.1 --port 8765
```

本次实际验证环境为 Windows；POSIX 沙箱资源限制分支需要在目标系统再次测试，不能由 Windows 结果推定通过。

## 推荐演示顺序

登录首页首先显示执行工作台，页面底部可展开“六类业务入口”：逐项列出当前可办操作、快捷需求和未实现范围。点击快捷操作只填入对话框，发送后才生成计划；黄色/红色操作仍需单独授权。理财卡片明确标为尚未实现，不能办理申购或赎回。跨场景目前只支持明确任务串联和不冻结资金的目标记录。

先输入“先分析本月账单，然后给李娜转300元，最后挂失尾号1024的卡片”，观察左侧行动事件和右侧依赖，按步骤授权。也可单独演示：

1. 输入“分析本月账单，看看有哪些异常消费”，查看可追溯的分类和异常证据。异常不等于已证实欺诈。
2. 输入“给小王转 300 元”，按澄清提示选择王明或王敏；或者直接输入“给李娜转 300 元”。核对收款人与金额，在操作卡片确认。
3. 输入“给李娜转 1200 元”或“挂失我的卡片”，先确认详情，再在独立验证面板读取演示收件箱并输入验证码。聊天中的“我已确认”不能代替授权。
4. 输入“用沙箱计算本月消费总额”，查看受限分析结果和隔离元数据；金额结果单位为人民币分。
5. 输入“查询我的订阅”，明确确认后查看；再输入“取消音乐订阅”并确认。
6. 对待处理任务使用暂停、取消或人工接管；已完成转账不会因取消任务而回滚。

出现“结果未知”时查询原操作进行对账，不重新发起相同转账。测试环境可以注入通道失败或回执丢失；普通聊天没有故障注入工具。

## 数据保存与重新演示

服务自动初始化数据库并幂等播种。重启使用同一个数据目录时，余额、操作、计划、会话和审计会保留。

要从全新合成数据开始，停止原服务并使用**新的目录**，不删除已有记录：

```powershell
.\.venv\Scripts\python.exe -m banking_agent --data-dir data/demo-fresh-01 --port 8765
```

目录已存在时会复用其中的数据，所以每次全新演示使用未用过的名字。不要在两次演示之间把原目录重置视为业务冲正。不要把 `data/`、`.env` 或真实凭据提交到仓库。

## 测试

安装测试依赖后运行：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$testRun = 'data/test-run-' + [guid]::NewGuid().ToString('N')
.\.venv\Scripts\python.exe -m pytest tests -q --basetemp=$testRun
```

使用唯一的工作区测试目录，避免复用演示数据，也规避当前托管 Windows 系统临时目录的权限问题。Pytest 会管理其 basetemp，请勿将真实数据目录指定为 basetemp。

| 测试文件 | 覆盖范围 |
| --- | --- |
| `tests/test_bank.py` | 金额、限额、认证、并发幂等、账本、熔断、回执丢失与审计 |
| `tests/test_planner.py` | 规则基线、澄清、金额与候选 DAG/工具校验 |
| `tests/test_orchestrator.py` | 依赖、持久化、暂停、用户归属与计划边界 |
| `tests/test_api.py` | 会话、CSRF、同源、业务状态与授权入口 |
| `tests/test_operator.py` | 操作员与客户角色隔离、接管释放和客户授权保留 |
| `tests/test_sandbox.py` | 数值解释、越界语法、资源限制与设置失败时拒绝 |

完整通过数量以该次实际运行输出为准。单元/HTTP 测试不代替真实模型、浏览器和目标部署平台的验收。

## 模型规划器与本机启动

本机模型信息已配置在Windows用户环境变量中，密钥不在项目文件内。推荐用启动脚本，它会补读用户环境变量，避免旧终端没有继承新配置：

```powershell
.\scripts\start-demo.ps1
# 后台运行：.\scripts\start-demo.ps1 -Background
```

当前联调模型为qwen3.8-flash，开启思考、2048思考预算与严格JSON Schema。其他兼容服务可使用json_object；需按提供方能力配置，不自动降级或切换模型。环境配置和验证范围见[说明](docs/model-integration.md)。

先保持离线演示可用。准备模型服务后，在**启动之前**设置环境变量并重新启动服务：

```powershell
$env:TRACEBANK_PLANNER = 'llm'
$env:TRACEBANK_LLM_BASE_URL = 'https://your-provider.example/v1'
$env:TRACEBANK_LLM_MODEL = 'your-supported-model-id'
# 如服务需要凭据，通过安全的环境管理方式设置 TRACEBANK_LLM_API_KEY。
.\.venv\Scripts\python.exe -m banking_agent --port 8765
```

上述地址和模型名是占位符，不能直接调用。Base URL 通常应包含提供方要求的 `/v1` 前缀；代码会追加 `/chat/completions`，不要把完整 endpoint 再填进 Base URL。接口需支持 Chat Completions 风格消息和 JSON object 响应。

仅允许 HTTPS 外部地址；本机 `localhost/127.0.0.1/::1` 可使用 HTTP。代码不会自动读取 `.env` 文件；写入文件不等于已配置。`TRACEBANK_LLM_API_KEY` 仅从进程环境读取，不写入前端、图稿、日志或示例代码。

模型只提出计划，不拥有授权权限；调用失败会显示错误，不静默回退。健康检查的 `live_model_verified` 表示当前进程是否收到过通过校验的真实模型结果，重启后会重置；不是整体质量或安全认证。切回离线时在启动进程设置 `TRACEBANK_PLANNER=offline` 后重新启动。

## 人工接管与当前限制

接管后的任务停止自动执行，普通用户不能自行恢复。已实现独立[操作员工作台](http://127.0.0.1:8765/operator.html)，演示账户为 `operator / tracebank-operator`：

1. 客户将待处理任务转人工。
2. 在另一个浏览器配置或独立无痕窗口登录操作员，避免替换当前客户会话。
3. 操作员从接管队列选择任务，填写处理说明后交还客户。
4. 客户刷新任务并完成原操作的确认或红色验证。操作员不能代客户转账或读取客户业务接口。

源码、页面、HTTP角色隔离和真实浏览器流程已验证，结果见 `evals/results/operator-browser.json`。释放事件记录处理人和说明，释放接管不代替用户授权。

尚不能宣称完成的能力：真实短信/人脸/U盾、真实银行或商户连接、资金预留/冻结、预约调度、AA收款、已提交资金冲正及理财申购。真实模型已做固定集联调，开放表达、多次可靠性、未知攻击、Linux/macOS、外部部署与大规模并发仍需专项验证。

## 项目文档

- [原始赛题](problem.md)与[完成计划](plan.md)。
- [需求与验收追踪](docs/requirements.md)。
- [实际系统架构](docs/architecture.md)与[API 契约](docs/api-contracts.md)。
- [安全设计与剩余风险](docs/security-design.md)。
- [部署、配置和故障排查](docs/deployment.md)。
- [文献检索计划](research/search-plan.md)与[技能选型记录](SKILLS-REVIEW.md)。
- [快速回顾与方案报告](report.md)、[核心算法](docs/algorithms.md)、[安全自评](docs/security-self-assessment.md)。
- [提交入口清单](docs/submission.md)、[技术图稿](figures/README.md)、[测评结果与限制](docs/evaluation.md)。
- [Agent 工作流版PPT](demo/tracebank-agent.pptx)、[配套讲稿](demo/agent-defense-script.md)、[演示视频](demo/tracebank-agent-workflow.webm)、[200字内作品简介](demo/project-intro.md)。

文献报告、正式图稿、答辩和视频等整体进度以 `plan.md` 及相应文件的实际验收记录为准。
