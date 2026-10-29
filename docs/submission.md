# 交付与提交入口

更新：2026-10-29，修复前快照`89c39bc`。已发布仓库：[DragonFlamee/bankagents](https://github.com/DragonFlamee/bankagents)。本轮修复预约到期累计验证，保留19页PPT手调版式并移除对应未修复说明；没有推送远端或上传报名系统。

当前网页包含10个业务视图，六类模拟场景都有后端与结果展示。本轮201项项目离线回归通过，新增18项预约专项；4项实际浏览器检查覆盖审批、付款、取消和390px布局。此前183项、30组页面检查保留原日期范围。预约P1已修复，新增六场景仍无完整真实模型验收，历史视频不能冒充当前UI实录。

| 比赛材料 | 文件 | 当前范围 |
| --- | --- | --- |
| 作品名称/200字内简介 | [project-intro.md](../demo/project-intro.md) | 当前六场景、任务图与授权；明示模拟业务，上传前复核系统字数口径 |
| 调研报告 | [report.md](../report.md) | 11项来源、阅读范围、工程综合和实测限制 |
| 系统架构图 | [架构说明](architecture.md)、[重制SVG](../demo/technical-defense/assets/diagrams/architecture.svg) | 规划、工具契约、持久化编排、独立授权及三个数据库；[七张图稿与覆盖表](../demo/technical-defense/coverage-map.md) |
| 核心算法 | [algorithms.md](algorithms.md) | 意图、DAG、权限、幂等、对账、分析与沙箱 |
| 安全设计与自评 | [security-design.md](security-design.md)、[security-self-assessment.md](security-self-assessment.md) | 权限实现、测试、已知风险和真实部署差距 |
| 答辩PPT | [2026-10-29技术答辩版](../demo/tracebank-technical-defense-20261029.pptx) | 16页主讲＋3页附录，保留用户手调；[局部修改依据](../demo/defense-20261029/README.md) |
| 讲稿 | 当前19页PPT的各页备注 | 已同步验证机制与201项测试；尚需真人≤10分钟计时 |
| 演示视频 | [历史Agent工作流实录](../demo/tracebank-agent-workflow.webm) | 约103秒，旧UI真实模型实录；当前六场景版仍待重录，系统格式要求待核对 |
| 源码与启动 | [README](../README.md)、[deployment.md](deployment.md) | 本机单worker，固定依赖，合成数据可复用或新目录播种 |
| 测试证据 | [本轮摘要](../evals/results/review-20261026.json)、[183项回归](../evals/results/pytest-review-20261026.xml)、[历史测评](evaluation.md) | 本轮离线与浏览器、额外安全复现、历史模型集严格分开，不能累加或扩大结论 |
| 来源/权利 | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | 保留技能和文献出处，不擅自替作者选择发布许可 |

## 最后交付检查

本地提交与ZIP生成后，使用 `git status --short` 检查工作树；ZIP由已跟踪文件生成，排除数据库、.venv、.env、node_modules、构建临时树。最终提交标识及ZIP校验信息由交付回执记录；回执不冒称远端已发布。

当前PPT的局部修改、补充渲染和部件保真以[修复清单](../demo/defense-20261029/schedule-repair-manifest.json)为准；[制作说明](../demo/defense-20261029/README.md)随附。未经原生PowerPoint打开的检查不得称为PowerPoint验收。旧视频为WebM，不预设报名系统接受，必要时另转MP4。所有账户均为合成数据。

## 用户后续处理

1. 预约到期实际日累计验证和混合/月度回归已完成；提交时使用本轮代码、201项测试及更新后的19页PPT。
2. 对新增六场景做独立真实模型联调，统一订阅识别/查询授权口径；密钥留在服务端环境。
3. 用当前UI重录≤5分钟视频，真人排练PPT使汇报≤10分钟；核对视频后缀、大小、截止时间等报名系统信息。
4. 将更新材料提交至仓库后填入最终提交标识，检查简介、源码、技术说明、PPT、视频、安全自评均已实际上传。公开许可仍由权利人决定。

本地模拟锁定、预约、AA、理财与订单已有实现。真实认证、银行/商户连接、外部冲正、分布式编排及生产运维未完成。无需为满足当前这份赛题而默认接真实银行或部署公网网站。
