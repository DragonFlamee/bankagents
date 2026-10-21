# 离线交付与提交入口

日期：2026-10-21。初次交付离线版本；后续模型联调已完成，证据见[模型接入](model-integration.md)。PPT与视频仍是原离线版本，正式提交前须同步更新。本地Git提交，远端由用户自行publish。

| 比赛材料 | 文件 | 当前范围 |
| --- | --- | --- |
| 作品名称/200字内简介 | [project-intro.md](../demo/project-intro.md) | 正文明示离线规划与预留模型接口 |
| 调研报告 | [report.md](../report.md) | 11项来源、阅读范围、工程综合和实测限制 |
| 系统架构图 | [F1 PDF](../figures/architecture.pdf)、[全部图稿](../figures/README.md) | F1–F6有TeX、PDF及预览；F6附实测CSV |
| 核心算法 | [algorithms.md](algorithms.md) | 意图、DAG、权限、幂等、对账、分析与沙箱 |
| 安全设计与自评 | [security-design.md](security-design.md)、[security-self-assessment.md](security-self-assessment.md) | 权限实现、测试、已知风险和真实部署差距 |
| 答辩PPT | [最终PPT](../demo/tracebank-defense-final.pptx) | 10页，可编辑文字和原生图表，含来源备注 |
| 讲稿 | [defense-script.md](../demo/defense-script.md) | 建议9分29秒含视频，未真人计时 |
| 演示视频 | [tracebank-demo.webm](../demo/tracebank-demo.webm) | 实录113.683秒，6章，无码泄漏，无真人配音 |
| 源码与启动 | [README](../README.md)、[deployment.md](deployment.md) | 本机单worker，固定依赖，合成数据可复用或新目录播种 |
| 测试证据 | [evaluation.md](evaluation.md)、evals/results/ | 123测试、25任务、10安全探针、客户与操作员浏览器 |
| 来源/权利 | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | 保留技能和文献出处，不擅自替作者选择发布许可 |

## 最后交付检查

本地提交与ZIP生成后，使用 `git status --short` 检查工作树；ZIP由已跟踪文件生成，排除数据库、.venv、.env、node_modules、构建临时树。最终提交标识及ZIP校验信息由交付回执记录；回执不冒称远端已发布。

PPT做过第一方重导入、逐页渲染、字体/几何/图表工作簿检查，未在原生PowerPoint打开验收。视频为WebM，可在浏览器或兼容播放器播放，未假定报名系统接受此格式；系统若要求MP4需另行转码。录屏脚本、章节清单和失败修复记录保留，所有账户均为假数据。

## 用户后续处理

1. 按Git客户端的Publish流程发布现有本地提交，取得真实GitHub URL，填入报名系统与README。当前没有远端地址。
2. 模型信息已提供并完成固定集联调；按模型记录更新PPT/视频，继续验证开放表达与重复可靠性。密钥保留在本机环境，不进入提交。
3. 真人排练讲稿并核对报名系统的视频格式、文件大小与介绍字数口径；决定公开源码的许可证。

真实认证、银行/商户连接、资金冻结/冲正、预约、AA、理财业务、分布式编排与生产运维都不是本次已完成功能。
