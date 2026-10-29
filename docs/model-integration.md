# 模型接入

默认`offline`模式使用规则规划器，无需模型凭据。`llm`模式通过兼容Chat Completions接口生成候选计划，仍须通过相同工具契约和银行权限检查。

## 服务端配置

```powershell
$env:TRACEBANK_PLANNER = 'llm'
$env:TRACEBANK_LLM_BASE_URL = 'https://your-provider.example/v1'
$env:TRACEBANK_LLM_MODEL = 'your-supported-model-id'
# 通过本机环境管理方式设置 TRACEBANK_LLM_API_KEY。
.\.venv\Scripts\python.exe -m banking_agent --port 8765
```

地址和模型ID均需替换。代码在Base URL后追加`/chat/completions`，不要重复填写完整endpoint。外部地址要求HTTPS；本机调试可使用HTTP。项目不会自动读取`.env`。

Windows可运行`./scripts/start-demo.ps1`补读用户环境变量。已有联调使用`qwen3.8-flash`，思考模式设置为`TRACEBANK_LLM_ENABLE_THINKING=1`、预算2048、`TRACEBANK_LLM_RESPONSE_FORMAT=json_schema`。其他服务按其实际能力配置，不自动更换模型或输出格式。

模型请求由 `banking_agent/planner.py` 发出。提供方接口参考[阿里云Chat Completions](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)及[严格结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。

## 输入与输出

规划输入包含用户请求、合成联系人、卡片信息和有限会话摘要，不发送OTP面板或账户余额。服务端限制工具、参数、节点和依赖；拒绝伪造身份、权限及未知字段。

回答阶段根据已完成的工具观测生成事实段落，模型只选择已知内容标识。服务端映射回真实文字，金额和回执不由模型自由生成。原始私密推理不进入上下文、日志或测评结果。

工作台分别记录规划和回答的用量。可核对Request ID与token数；计费以服务商控制台为准。`live_model_verified`只表示当前进程已收到通过校验的真实模型响应，重启后重置。

## 已有证据

2026-10-21固定15例开发集在调整工具说明及结构化输出后全部通过，[原始结果](../evals/results/model-baseline.json)和[调整前结果](../evals/results/model-baseline-before-constraints.json)均保留。用例涉及账单、转账、同名澄清、复合任务、卡片、订阅、非法请求与数值计算；确认和验证码由合成夹具提交，没有真人参与。

这组用例早于六场景扩展，且每例只运行一次，不能作为当前六场景开放表达、重复可靠性或成本结论。完整新场景模型验收仍待完成。

需要重新评测时运行`python evals/run_live.py`，凭据仅从环境读取。脚本使用新合成账户，可能产生模型费用；结果写入忽略目录下的临时报告，不覆盖保留的历史开发集。
