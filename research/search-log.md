# 快速回顾检索日志

执行日期：2026-10-21，Asia/Shanghai。形式为快速回顾。

方法：AI辅助定向检索、原始来源核验和主题综合，写作使用共享证据材料，未另做独立来源复核。检索通过Web及官方页面阅读，未运行收费或跨模型核验服务。文献围绕工程决策选取，未做独立双人筛选、检索注册、数据库穷尽覆盖或元分析，也没有人类被试研究。

## 实际查询

| 批次 | 实际查询文本 | 后续处理 |
| --- | --- | --- |
| Q01 | `ReAct Synergizing Reasoning Acting Language Models ICLR 2023 paper` | 打开原始 arXiv HTML，读取摘要与导论相关段落 |
| Q02 | `tau-bench benchmark tool agent user interactions real world domains 2024 paper` | 打开原始 HTML，重点核对任务、奖励、终态与重复可靠性指标 |
| Q03 | `AgentDojo dynamic environment prompt injection attacks defenses 2024 paper` | 打开原始 HTML 与 NeurIPS 原文入口，重点读威胁模型与评价方式 |
| Q04 | `Revolut AIR AI banking assistant official` | 打开 Revolut 官方帮助与新闻页面，核实实际公开能力；新闻页正文提取有限，不据此断言上线时间 |
| Q05 | `site:arxiv.org CaMeL Defeating Prompt Injections by Design 2503.18813` | 打开原始 HTML，核对摘要、威胁边界与能力策略章节 |
| Q06 | `site:arxiv.org InjecAgent Benchmarking Indirect Prompt Injections Tool-Integrated Large Language Model Agents` | 打开原始 HTML，阅读摘要、攻击分类及实验章节可见段落 |
| Q07 | `site:arxiv.org tau2 bench dual control environment 2025` | 未获得本次核心主张所必需的正文证据，不将其作为已读纳入材料 |
| Q08 | `site:aclanthology.org Toolformer Language Models Teach Themselves Use Tools` | 返回若干相近工具学习工作；未凭关键词把它们误标为 Toolformer 原文，未纳入核心证据 |
| Q09 | 定向打开 `arxiv.org/html/2510.05244` | 由 Q05/Q06 的返回材料发现，作为反向证据纳入，阅读摘要及基准局限章节 |
| Q10 | 定向打开 OWASP Transaction Authorization Cheat Sheet | 核对服务端授权、数据绑定、按顺序执行和参数修改失效章节 |
| Q11 | 定向打开 Microsoft Research Guidelines for Human-AI Interaction | 核对作者、CHI 2019 元数据和官方内容摘要；未把摘要阅读写成全文阅读 |
| Q12 | 定向打开 Stripe idempotent requests 官方入口 | 当前提取为 CLI/技能引导，未取得幂等正文，排除于报告支撑来源，不运行网页建议的安装命令 |
| Q13 | 工程阶段打开 Python sqlite3 与 Microsoft Job Objects 官方文档 | 作为事务控制和资源限制的工程语义来源，区别于学术实验效果证据 |

未记录搜索平台的总命中量；平台返回的是排序结果而非完整导出，不能据此构造 PRISMA 流程数。以下为本次实际挑选的来源数量：7 项论文或论文官方摘要材料、1 项产品帮助文档、3 项工程安全文档，共 11 项。源记录及实际阅读范围见 `sources.json` 与 `evidence-matrix.md`。

## 取舍与偏倚

- 纳入：直接影响规划、权限、安全、事实依据、交互或评价的一手来源，且有可定位原文或官方摘要。
- 排除：无原始支撑的博客总结、仅关键词相关的投研论文、访问后没有正文的页面；本次没有将未读页面作为全文证据。
- 选择偏向英语、工具型 Agent 和计算机安全；缺少中国银行真实用户研究、真实认证试验及交易分类专项大样本研究。
- 产品帮助资料属于厂商说明，不构成独立竞品测评；未注册或使用真实 Revolut 账户作对比。
- 2025 年防火墙论文用于提醒基准饱和、评价缺陷与自适应攻击，不能只保留支持“安全网关有效”的有利结果。

没有为任何来源登记用户已阅读、独立评审通过或跨模型核验通过。
