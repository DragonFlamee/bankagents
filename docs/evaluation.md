# 测试与验证范围

项目测试使用合成账户，模型适配器测试使用受控响应。当前201项项目测试包含18项预约到期专项。原始报告在[pytest.xml](../evals/results/pytest.xml)，执行时间以文件内容为准。

## 可复现命令

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:TRACEBANK_PLANNER = 'offline'
$env:TRACEBANK_SCHEDULER = '0'
.\.venv\Scripts\python.exe -m pytest tests -q --junitxml=evals/results/pytest.xml
npm run typecheck
npm run build:web
npm run test:browser
npm run test:state
npm run test:scheduled
```

`tests/`是项目测试目录。浏览器测试创建独立服务与账户，不使用当前演示数据；设置`TRACEBANK_TEST_URL`时只能指向可写入的测试实例。

## 覆盖范围

| 测试 | 范围 |
| --- | --- |
| `test_bank.py` | 金额、限额、OTP、幂等、并发、账本和故障 |
| `test_planner.py`、`test_orchestrator.py` | 候选校验、依赖、恢复、暂停与用户归属 |
| `test_api.py`、`test_operator.py` | 会话、CSRF、同源和客户/操作员角色隔离 |
| `test_answers.py`、`test_runs.py`、`test_conversations.py` | 事实回答、运行事件及连续对话 |
| `test_scenarios.py` | 六类业务的离线实现 |
| `test_scheduled_authorization.py` | 实际日累计、月度每期、取消/过期、重启、重复调度、故障、对账、跨日和旧库迁移 |
| `test_sandbox.py` | 数值语法、边界、超时和资源限制失败 |

浏览器结果分别保存在[browser.json](../evals/results/browser.json)、[state.json](../evals/results/state.json)和[scheduled-auth.json](../evals/results/scheduled-auth.json)。前两者验证页面办理流程及状态映射，预约专项验证审批、OTP付款、取消和390px布局。浏览器断言与页面检查不构成物理手机或屏幕阅读器验收。

## 模型记录

保留的[15例模型开发集](../evals/results/model-baseline.json)执行于2026-10-21，调整前记录为13/15。它们来自早期功能，未覆盖新增六场景，也没有重复运行或真人体验实验。详见[模型接入](model-integration.md)。

## 尚缺验证

- 新增六场景的完整真实模型联调和重复可靠性测试。
- 未知提示注入、恶意工具返回及其他开放攻击。
- 多worker租约、跨库崩溃窗口和其他目标平台。
- 独立多因子认证、真实银行/商户及生产运维。
- PPT真人计时、当前UI正式视频与报名系统上传状态。

各项计数描述对应检查的分母，不能相加为业务成功率。依赖的兼容提醒、PPT检查范围和材料链接检查见[仓库检查记录](../evals/results/repository-check.json)。
