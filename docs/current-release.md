# 当前材料索引与版本边界

更新日期：2026-10-27。功能代码基线：18aa38d。本轮使用presentation-skill重制技术答辩PPT与七张技术图，只更新材料，没有修改业务代码，也没有修复预约权限问题。

| 入口 | 当前用途 |
| --- | --- |
| [作品简介](../demo/project-intro.md) | 报名系统正文，200字以内，六场景与AI技术 |
| [技术答辩PPT](../demo/tracebank-technical-defense-20261027.pptx) | 14页主讲＋3页技术附录；[逐页预览](../demo/technical-defense/preview.html) |
| [配套讲稿](../demo/technical-defense/defense-script.md) | 主讲8分45秒加45秒演示的预算，未经真人计时 |
| [系统架构](architecture.md)及[重制SVG图](../demo/technical-defense/assets/diagrams/architecture.svg) | 工作台、规划、契约、编排、授权及三个数据库 |
| [PPT技术覆盖表](../demo/technical-defense/coverage-map.md)、[编辑与重建](../demo/technical-defense/README.md) | 算法、安全要求对应页码；七张SVG与结构化主源 |
| [算法](algorithms.md)、[需求追踪](requirements.md)、[API契约](api-contracts.md) | 当前六场景及实现限制 |
| [安全设计](security-design.md)、[安全自评](security-self-assessment.md) | 权限控制与已复现P1、生产边界 |
| [提交清单](submission.md) | 必交材料、仓库地址与待完成项 |
| [本轮检查](review-20261026.md) | 当前网页、183项离线测试、30组页面/尺寸与额外权限复现 |

## 证据口径

本次PPT静态检查、实际PPTX补充渲染、模型逐页视觉审查及其边界见[2026-10-27交付回执](../evals/results/presentation-20261027.json)。未做原生PowerPoint验收。2026-10-26的12页版保留为历史文件，不再作为当前答辩入口。

本轮六场景网页截图均来自独立离线模拟环境。183是自动化测试项数，30是10个视图乘三种视口，二者不能相加成业务成功率。历史固定模型15例、旧版模型工作流和真实模型连续对话记录仍有效于其对应版本，不能当作18aa38d新增六场景的完整模型验收。

## 提交前仍需完成

预约到期实际日累计强验证P1修复与补测试；订阅识别/查询授权口径复核；新增六场景真实模型联调；手机图表与登录优先级改进；当前UI的≤5分钟演示视频；原生PowerPoint验收、真人≤10分钟排练及报名系统格式/容量核对。旧版视频和图稿仅作历史附件。
