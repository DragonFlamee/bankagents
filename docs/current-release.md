# 当前材料索引与版本边界

更新日期：2026-10-29，修复前快照`89c39bc`。预约到期已补实际日累计强验证，201项项目离线测试与4项针对性浏览器检查通过；[修复记录](scheduled-transfer-fix-20261029.md)说明状态、迁移和证据。

| 入口 | 当前用途 |
| --- | --- |
| [作品简介](../demo/project-intro.md) | 报名系统正文，200字以内，六场景与AI技术 |
| [当前技术答辩PPT](../demo/tracebank-technical-defense-20261029.pptx) | 16页主讲＋3页附录，保留手调版式并移除已修复问题框 |
| 当前讲稿 | 写在19页PPT各页备注中；第9、15、16页同步修复状态，仍需真人≤10分钟排练 |
| [系统架构](architecture.md)及[重制SVG图](../demo/technical-defense/assets/diagrams/architecture.svg) | 工作台、规划、契约、编排、授权及三个数据库 |
| [PPT技术覆盖表](../demo/technical-defense/coverage-map.md)、[编辑与重建](../demo/technical-defense/README.md) | 算法、安全要求对应页码；七张SVG与结构化主源 |
| [算法](algorithms.md)、[需求追踪](requirements.md)、[API契约](api-contracts.md) | 当前六场景及实现限制 |
| [安全设计](security-design.md)、[安全自评](security-self-assessment.md) | 预约P1已关闭及其回归证据，保留其余生产边界 |
| [提交清单](submission.md) | 必交材料、仓库地址与待完成项 |
| [本轮检查](review-20261026.md) | 当前网页、183项离线测试、30组页面/尺寸与额外权限复现 |

## 证据口径

19页手调PPT本轮只改5个XML部件，其他部件逐字节一致，见[修复清单](../demo/defense-20261029/schedule-repair-manifest.json)及[制作说明](../demo/defense-20261029/README.md)。原生PowerPoint未自动打开验收。10月26日12页版和10月27日17页版及对应回执均为历史材料。

本轮六场景网页截图均来自独立离线模拟环境。183是自动化测试项数，30是10个视图乘三种视口，二者不能相加成业务成功率。历史固定模型15例、旧版模型工作流和真实模型连续对话记录仍有效于其对应版本，不能当作18aa38d新增六场景的完整模型验收。

## 提交前仍需完成

订阅识别/查询授权口径复核；新增六场景真实模型联调；手机图表与登录优先级改进；当前UI的≤5分钟演示视频；原生PowerPoint验收、真人≤10分钟排练及报名系统格式/容量核对。旧版视频和图稿仅作历史附件。
