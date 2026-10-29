# 模型接入与真实联调记录

2026-10-26版本边界：本页主体是历史模型证据。18aa38d新增的预约、AA、资金锁定、理财等已完成离线模拟与浏览器巡检，尚未完成新增六场景完整真实模型回归。当前结果见[检查报告](review-20261026.md)，不能把历史模型测试扩大到新版本。

日期：2026-10-21。用户选择qwen3.8-flash并开启思考，使用用户提供的阿里云北京工作空间。实际地址与密钥仅保存在本机Windows用户环境变量，不硬编码到源码。

## 已验证

| 项目 | 实际结果 | 证据 |
| --- | --- | --- |
| 认证及模型发现 | 提供的工作空间返回模型列表；原3.8-flash-next-thinking未在列表中，用户选择qwen3.8-flash | 本轮实际API调用；不保留密钥或完整账号模型目录 |
| 模型规划 | 同一固定集15/15通过 | evals/results/live-20261021.json |
| 业务/安全回归 | 133通过，1项Starlette HTTPX兼容弃用提醒 | evals/results/pytest-model.xml |
| 真实浏览器 | 模型模式登录、账单、黄色转账、红色OTP挂失、审计、390px手机布局，共7组通过 | evals/results/live-browser-smoke.json |

固定模型用例覆盖自然表达、中文金额、同名澄清、缺金额追问、三步骤DAG、挂失、订阅、伪造授权、负金额拒绝、不支持的理财、超时后原操作对账、金额修改和受限数值分析。每个用例仅一次运行，全部数据、确认和验证码均为脚本夹具；这不是人类体验实验、重复可靠性基准或未知攻击安全证明。

## 运行配置

| 变量 | 本次选择 |
| --- | --- |
| TRACEBANK_PLANNER | llm |
| TRACEBANK_LLM_BASE_URL | 用户提供的完整工作空间URL，结尾compatible-mode/v1 |
| TRACEBANK_LLM_MODEL | qwen3.8-flash |
| TRACEBANK_LLM_API_KEY | 仅本机用户环境变量，不写文件、不打印 |
| TRACEBANK_LLM_ENABLE_THINKING | 1 |
| TRACEBANK_LLM_THINKING_BUDGET | 默认2048 |
| TRACEBANK_LLM_RESPONSE_FORMAT | json_schema |

启动：`./scripts/start-demo.ps1`；隐藏后台启动加 `-Background`。脚本读取当前进程变量，缺失时补读Windows用户变量；不自动读取.env。端口默认8765，数据目录默认data/user-demo-20261021。已有进程占用端口时先停止自己的旧服务，脚本不任意杀进程。普通Python启动仍使用进程环境，未配置时默认offline。

模型请求使用阿里云[Chat Completions接口](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)及[严格结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。本次发送enable_thinking=true和thinking_budget，不同时发送reasoning_effort。只保留最终候选计划和必要用量元数据，reasoning_content不写上下文、日志或测评结果。

## 发现与修正

首次单请求生成了不存在的analysis工具，白名单拒绝。随后接入严格JSON Schema，将工具和参数限制在已有接口；服务端验证仍独立执行，不能把生成约束当授权。模型澄清问题及最近6轮请求/候选摘要进入有限上下文，不保存模型自报身份或授权。

首次固定联调集为13/15：三步骤计划缺少依赖，沙箱表达式错误为sum而不是sum(amounts)。原结果保存在live-20261021-before-constraints.json；当时运行在json_object设置下。修正工具说明、数据变量和明确顺序的保守串行约束后，以json_schema重跑相同15例，全部通过。目标与通过口径未更换；这些是开发过程中修正后的结果，不是未见过的留出集成绩。

对“然后/之后/再”等明确顺序，在候选数组顺序上补串行依赖；与模型原依赖冲突形成环时拒绝执行。此策略不能证明模型总能正确理解任意语义顺序。截断响应、非法字段、未知工具、无有效澄清、401等不会降级成离线成功。

## 现有交付物的版本边界

原report.md主体、25例离线结果、123项早期测试、PPT和113.683秒视频是先前离线交付记录，保留其历史口径，不能改写成模型测试。新模型证据单独保存。2026-10-22已新增[Agent工作流版](agent-workspace.md)页面、10页PPT、配套讲稿与约103秒真实模型实录；最终140项项目测试和本轮6组浏览器工作流验证通过。原离线PPT与视频保留存档。正式参赛前仍需真人排练。当时理财、预约、AA和资金冻结未完成；2026-10-23扩展代码已增加对应模拟实现，但没有补齐新增六场景的真实模型验收。真实认证仍未完成。


## 回答阶段更新（2026-10-22）

页面增加独立回答区，执行过程默认折叠。原规划请求保持不变；已完成的纯查询账单任务可额外调用同一模型，按原问题选择已有证据和建议的标识。继续沿用思考设置与严格结构化输出，不接受模型自行生成的金额、回执或写操作。服务端据真实工具观测形成最终文字；回答失败不回滚或重做已经成功的查询，而是标明使用已核对结果回答。两个模型阶段的用量分别展示，不能把旧版单阶段测量当作新版总费用。

最终152项项目测试通过；本轮5组真实模型浏览器检查及原省钱任务兼容检查通过，见 answers-browser.json、pytest-answers.xml 与 saved-answer-compatibility.json。原PPT与103秒实录记录 ca1f4f3 版本，旧测评数据继续保留其版本边界。
