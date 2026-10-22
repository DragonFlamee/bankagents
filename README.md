# TraceBank · 拾迹银行

面向模拟银行业务的 Agent 工作台。

面向银行 AI 智能体比赛的本地演示：对话生成候选任务，确定性后端决定权限，用户在独立操作卡片中确认或验证，再获得可核对的业务回执。支持离线规则基线与真实模型规划。2026-10-21已完成用户选择的 **qwen3.8-flash思考模式**联调：15个固定模型用例通过、133项回归通过，详见[模型联调说明](docs/model-integration.md)。这些是小样本模拟业务验证，不代表开放语言或生产银行效果。

2026-10-22 界面已改为 **Agent 工作台**：实时展示模型请求、计划校验、工具输入与观测、授权暂停、续跑和业务回执；可核对 Request ID 与 Token 用量。新增执行记录持久化与规划中停止。当前为一次模型规划后执行已保存的 DAG，尚无多轮自主重规划。早期工作流版本 140 项项目测试和当轮 6 组真实模型工作流浏览器验证通过，见[工作台说明](docs/agent-workspace.md)。

当前 React / TypeScript / Tailwind CSS 界面保留业务总览、Agent 工作台、交易分析、审批中心和活动日志。采用海军蓝导航与浅色任务正文，执行详情在回答前按需内联展开，模型/工具原始日志再折叠。六个场景与原有权限保留，取消不会被显示成退款。最新 **158项后端、16组业务浏览器、8组动效、7组可读性/渐进输出、7组布局/图/故障、4组时序和2组只读兼容检查通过**，实际模型SSE另有一次只读联调。见[最新验收](docs/motion-readability-qa.md)、[当前设计规则](DESIGN.md)、[内容清理表](docs/clarity-ui-audit.md)。[结构改版前后](docs/clarity-ui-qa.md)和[Premium记录](docs/premium-ui-qa.md)保留历史依据。

## 已实现的主要路径

最新更新：修复深导航hover白底浅字，页面切换保持文字不透明；按钮回弹更克制，折叠内容有连续高度过渡。执行详情按用户要求回到回答之前内联展开。已核验内容边收到边显示，实际qwen3.8-flash SSE只读联调约4.6秒首批输出、18.6秒完整回答；不是逐字假打字或自动授权。158项后端、16组业务浏览器及动效/渐进输出检查通过，见[最新验收与录屏](docs/motion-readability-qa.md)。

页面切换、按钮弹簧和执行时间线已接入Motion；支持运行中切换减少动态效果，保留原授权与回答时序。[当前录屏](artifacts/screenshots/motion/readability/motion-demo.webm)与[最新验收](docs/motion-readability-qa.md)展示本轮效果，[初始动效记录](docs/motion-ui-qa.md)保留实现背景。

- 智能转账：姓名或手机号识别、同名澄清、黄色确认、日累计超过 1000 元升级红色验证、幂等与对账。
- 账单分析：本月、上月、本年分类汇总、异常证据与来源交易 ID。
- 卡片管理：查询、模拟挂失/解挂；挂失和解挂必须验证。
- 订阅查询/取消、虚拟卡与储蓄目标记录：按服务端规则确认；目标记录不冻结资金。
- 持久化任务、暂停/恢复/取消/接管、银行与计划审计事件。
- 受限数值 DSL 沙箱：独立进程解释生成表达式，不执行任意 Python。

所有账户、交易、卡片和认证均为模拟数据。默认口令和同应用演示 OTP 不适合真实银行或公网生产使用。

## 本地启动

需要 Python 3.12、可用浏览器。仓库包含 `apps/web-ui` 的已构建静态页面，直接启动 Python 即可使用。修改前端时需要 Node.js；React / TypeScript / Tailwind CSS 源码位于 `apps/frontend`，版本见 `package-lock.json`。运行时直接依赖由 `requirements.txt` 固定；完整独立验证环境的23项版本（含测试依赖）记录在 `requirements-lock.txt`，精确复现可改用 `pip install -r requirements-lock.txt`。

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

登录后首先显示业务总览，点击“进入 Agent 工作台”或左侧导航开始办理；输入区通过“选择场景”提供六个预填需求，发送后才生成计划。主区展示当前任务、实际阶段和最终回答，确认表单直接显示付款账户、收款人与金额。“查看执行详情”提供步骤、回执和依据，“技术日志”保留工具事件、原始计划及模型用量；复杂图按需打开。黄色/红色操作仍需单独授权，审批中心也可处理。这里的六个快捷入口不是赛题六方向全部实现的声明：理财交易尚未实现，跨场景只支持明确任务串联和不冻结资金的目标记录。

先输入“先分析本月账单，然后给李娜转300元，最后挂失尾号1024的卡片”，查看主区状态，按步骤授权，需要时打开执行详情。也可单独演示：

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
$env:TRACEBANK_PLANNER = 'offline'
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

前端开发与验收（根目录）：

```powershell
npm ci
npm run typecheck
npm run build:web
npm run test:browser
npm run test:state
```

`test:browser` 默认自行启动独立离线服务与新模拟数据，验证完成后停止该服务，不使用当前演示账户。设置 `TRACEBANK_TEST_URL` 时会改用指定服务，仅应指向可写入的全新演示数据。Windows 浏览器默认使用本机 Edge；其他平台可设置 `TRACEBANK_BROWSER_PATH` 指向可用的 Chromium。`test:state` 使用 Node.js 24 内置 TypeScript 转换验证纯状态逻辑。`test:thinking`、`test:motion`、`test:clarity` 需要已有本地服务，可设置 `TRACEBANK_TEST_URL`，使用标注夹具检查时序、动效和分层信息，不请求模型。最新结果以 `evals/results/clarity-*` 及 `motion-ui-clarity-production.json` 为准；历史浏览器脚本不是新界面验收入口。

前端热更新：先启动 API，再在另一个终端运行 `npm run dev:web`，访问 `http://127.0.0.1:5173`。默认代理到 `http://127.0.0.1:8765`；隔离演示可设置 `$env:TRACEBANK_DEV_API='http://127.0.0.1:8790'`。保留请求 Host 与原同源校验。Python 服务使用构建目录，开发完成后运行 `npm run build:web` 才会更新 8765 页面。

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
