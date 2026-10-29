# 赛题技术文档与PPT对应表

2026-10-27重制，功能基线`18aa38d`。本轮重制材料，没有修改业务代码。

| 赛题要求 | PPT页码 | 文档与图稿 |
| --- | --- | --- |
| 系统架构图 | 3–4 | [架构说明](../../docs/architecture.md)、[架构SVG](assets/diagrams/architecture.svg) |
| 核心算法：DAG校验 | 5 | [算法说明](../../docs/algorithms.md)、`banking_agent/planner.py` |
| 执行、暂停与恢复 | 6 | [执行图](assets/diagrams/execution.svg)、`banking_agent/orchestrator.py` |
| 跨场景回执引用 | 7 | [生日DAG](assets/diagrams/birthday-dag.svg)、[离线计划](data/birthday-evidence.json) |
| 权限分级与验证 | 8–9 | [安全设计](../../docs/security-design.md)、[授权图](assets/diagrams/authorization.svg) |
| 幂等、事务、未知结果核实 | 10 | [幂等图](assets/diagrams/idempotency.svg)、[API契约](../../docs/api-contracts.md) |
| 身份、注入、幻觉、重放 | 11、13 | [安全自评](../../docs/security-self-assessment.md)、[事实回答图](assets/diagrams/answer-grounding.svg) |
| 审计与受限可监控计算 | 12 | [安全设计](../../docs/security-design.md)、`sandbox.py`、`run_journal.py` |
| 测试与已知风险 | 14、17 | [检查报告](../../docs/review-20261026.md)、[测试摘要](../../evals/results/review-20261026.json) |
| 账单异常与理财计算 | 15–16 | [算法说明](../../docs/algorithms.md)、[异常算法SVG](assets/diagrams/anomaly-method.svg) |

183是离线测试项数，30是10个视图乘3种宽度，不能当作业务成功率。预约到期尚未结合实际日累计转账额升级强验证；原型OTP同应用可读，数值DSL不是任意Python沙箱，审计hash链没有外部锚。正文、备注、讲稿和安全文档均保留这些限制。
