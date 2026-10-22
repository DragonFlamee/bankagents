# 交付与提交入口

日期：2026-10-22。已接入真实模型，并将页面与答辩改为展示Agent完整行动链路，见[工作台说明](agent-workspace.md)。本地Git提交，远端由用户自行publish。原离线材料保留历史版本，不作为模型结果。

| 比赛材料 | 文件 | 当前范围 |
| --- | --- | --- |
| 作品名称/200字内简介 | [project-intro.md](../demo/project-intro.md) | 明示真实模型、行动记录与模拟业务边界 |
| 调研报告 | [report.md](../report.md) | 11项来源、阅读范围、工程综合和实测限制 |
| 系统架构图 | [F1 PDF](../figures/architecture.pdf)、[全部图稿](../figures/README.md) | F1–F6有TeX、PDF及预览；F6附实测CSV |
| 核心算法 | [algorithms.md](algorithms.md) | 意图、DAG、权限、幂等、对账、分析与沙箱 |
| 安全设计与自评 | [security-design.md](security-design.md)、[security-self-assessment.md](security-self-assessment.md) | 权限实现、测试、已知风险和真实部署差距 |
| 答辩PPT | [Agent工作流版终稿](../demo/tracebank-agent.pptx) | 10页，可编辑文字和任务图，真实界面截图及来源备注 |
| 讲稿 | [agent-defense-script.md](../demo/agent-defense-script.md) | 建议约8分03秒含视频，未真人计时 |
| 演示视频 | [Agent工作流实录](../demo/tracebank-agent-workflow.webm) | 约103秒，规划、工具、授权、续跑、停止与超时对账；无真人配音 |
| 源码与启动 | [README](../README.md)、[deployment.md](deployment.md) | 本机单worker，固定依赖，合成数据可复用或新目录播种 |
| 测试证据 | [工作流证据](../evals/results/agent-workflow-browser.json)、[测试XML](../evals/results/pytest-workflow.xml)、[历史测评](evaluation.md) | 最终140项目测试、本轮6组真实模型浏览器；历史模型固定集15/15与离线结果分开保留 |
| 来源/权利 | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | 保留技能和文献出处，不擅自替作者选择发布许可 |

## 最后交付检查

本地提交与ZIP生成后，使用 `git status --short` 检查工作树；ZIP由已跟踪文件生成，排除数据库、.venv、.env、node_modules、构建临时树。最终提交标识及ZIP校验信息由交付回执记录；回执不冒称远端已发布。

PPT做过第一方重导入、逐页渲染和字体/几何检查，未在原生PowerPoint打开验收。视频为WebM，可在浏览器或兼容播放器播放，未假定报名系统接受此格式；系统若要求MP4需另行转码。录屏脚本、章节清单和失败修复记录保留，所有账户均为假数据。

## 用户后续处理

1. 按Git客户端的Publish流程发布现有本地提交，取得真实GitHub URL，填入报名系统与README。当前没有远端地址。
2. 模型及新版PPT/视频已完成；继续验证开放表达与重复可靠性。密钥保留在本机环境，不进入提交。
3. 真人排练讲稿并核对报名系统的视频格式、文件大小与介绍字数口径；决定公开源码的许可证。

真实认证、银行/商户连接、资金冻结/冲正、预约、AA、理财业务、分布式编排与生产运维都不是本次已完成功能。
