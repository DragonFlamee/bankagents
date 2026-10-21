# 文献与竞品调研执行计划

状态：**已按用户选择启动快速回顾**。编制及执行日期：2026-10-21（Asia/Shanghai）。实际执行范围见 `search-log.md`，不是完整系统性综述。

输入：[赛题](../problem.md)、[完成计划](../plan.md)、[需求追踪](../docs/requirements.md)。用户明确选择“快速回顾”；ARS 没有单独的快速回顾模式，因此沿用检索、核验、综合工作流，记录缩减步骤及证据边界，不宣称系统性综述。

## 1. 调研问题和工程用途

主问题：如何让银行 Agent 在减少操作步骤的同时，可靠执行复杂任务、约束金融风险，并让用户理解和控制执行过程？

重点输出是能够改变工程决策的证据，而不是论文数量：自由规划和固定工作流如何混合、确认/认证如何绑定操作、任务怎样恢复、如何证明没有重复执行和虚报成功、用户该看到哪些信息。

## 2. 计划检索主题与精确检索式

执行时按平台语法转换并保留实际使用版本；下面是拟用查询，不表示这些名称对应的工作已找到或读过。

| 主题 | 拟用查询 | 要支持的决定 |
| --- | --- | --- |
| T1 银行助手与竞品 | `("banking assistant" OR "banking agent") AND ("task completion" OR "user experience")`；`Revolut AIR site:revolut.com` | 能力边界、实际用户任务与交互基线 |
| T2 工具调用与规划 | `("large language model" OR LLM) AND ("tool use" OR "tool calling") AND (planning OR execution)`；`ReAct reasoning acting language models` | 规划器、执行器和工具 schema 分离；自由规划的代价 |
| T3 持久化与人工控制 | `("AI agent" OR workflow) AND ("durable execution" OR "interrupt resume" OR "human in the loop")` | 检查点、暂停、恢复、人工接管和授权失效 |
| T4 权限与金融授权 | `("transaction authorization" OR "capability security" OR "least privilege") AND (agent OR payment OR banking)` | 独立权限网关、参数绑定、防重放、认证升级 |
| T5 注入与工具攻击 | `("indirect prompt injection" OR "tool output injection") AND agent`；`agent security benchmark prompt injection` | 数据/指令隔离、攻击面、可复现攻击集及剩余风险 |
| T6 资金执行可靠性 | `payment idempotency transaction reconciliation double entry ledger`；`workflow saga compensating transaction failure` | 幂等、原子账本、结果未知、对账与补偿边界 |
| T7 账单与异常 | `transaction categorization recurring payment detection explainable`；`financial transaction anomaly detection cold start` | 分类与异常基线、冷启动限制、可核对解释 |
| T8 信任与评价 | `"calibrated trust" "AI assistant"`；`"mixed initiative" "task completion"`；`tau-bench tool agent benchmark` | 展示与控制、任务成功率、误拦截、交互负担 |
| T9 隔离执行 | `"code execution sandbox" "AI agent" isolation`；`container resource limits network filesystem isolation` | 生成代码范围、资源限制与 OS 隔离边界 |
| T10 可选理财/KYC | `investment suitability risk profiling financial assistant`；`KYC document extraction rules evidence` | P2 适当性与资料提取，不替代认证或国内规则 |

所有重要主题补查反向证据，例如 `agent planning failure`、`prompt injection defense limitations`、`human confirmation automation bias`。不只保留支持当前实现的结果。

## 3. 来源和范围

- 学术方法：正式会议/期刊页面、作者原始论文和官方代码；必要时纳入预印本并标明状态。
- 产品事实：产品官方发布、说明、帮助文档；厂商宣称不等于独立体验或效果验证。
- 工程语义：数据库、协议、安全模型和框架官方文档；框架文档说明能力，不证明本项目已正确实现。
- 法规或监管要求：只有实际需要据此作规则判断时才核验主管机构原文、地域和生效日期；不把美国证券适当性技能当作中国银行规则。
- 时间范围拟设为 2022 年至实际检索当日，必要经典工作不受此限。执行时记录具体终止日期和经典文献例外理由。
- 语言以中文和英文为主；若因此遗漏证据，在报告中列为限制。

普通检索使用浏览与权威元数据页面，按 ARS 的 Codex 适配规则处理，不自动启动跨模型验证、付费 API、私有数据上传或作者未选择的系统性筛选流程。需要批量元数据或 BibTeX 时再按 `opencite` 的任务范围操作。

## 4. 纳入、排除与重复处理

纳入条件：来源存在可核验的元数据；对至少一个 T1–T10 决定直接相关；能够定位其论断与适用条件；论文、产品资料、工程文档各自标记材料类型。

排除或降级条件：仅关键词相似；没有可核对的来源信息；广告转述替代原始产品信息；二次总结没有原始支撑；与零售银行任务无关的投行估值/选股泛论；无法取得正文时，不用于正文级机制或数值主张。

摘要可用于发现候选，保留为“摘要范围”；没有全文不得冒称读完。付费墙或访问失败记录为访问限制，不编造来源内容。正式版与预印本按 DOI、题名、作者和版本关系去重，同时保留版本差异。检索命中数、排除数和纳入数只在实际执行后填写。

## 5. 每条材料的记录字段

计划在 `research/search-log.md` 记录实际日期、平台、精确检索式、检索范围、访问问题、候选去重和取舍理由。

计划在 `research/evidence-matrix.md` 为每条来源记录：

| 字段 | 填写规则 |
| --- | --- |
| source_id | 稳定本地引用 ID，不能当作验证标签 |
| title/authors/year | 来自权威元数据，不凭模型回忆补齐 |
| identifier/url/version | DOI 或官方 URL，注明正式版/预印本/产品文档 |
| retrieval_date | 实际检索日期 |
| read_scope | `metadata_only`、`abstract`、`sections`、`full_text`，只记录实际机器阅读范围 |
| locator | 实际章节/段落/表格，PDF 页锚按 ARS 预检规则处理 |
| claim | 该来源实际支持的主张，避免把作者建议改成已验证效果 |
| method_and_setting | 任务、模型、数据、样本、对照和执行环境；缺失即标缺失 |
| limitation/counterevidence | 失败、迁移条件、与其他来源冲突 |
| design_implication | 对应 REQ ID 和工程决定；明确是推断而非原文结论 |
| verification_state | 元数据存在、内容支持和不确定性分别记录，不混为单一“可信”勾选 |

不生成“用户已阅读”的声明。同行评审状态、DOI 可解析和原文确实支持某结论是不同观察。

## 6. 综合与写作方法

按规划、权限、安全、执行可靠性、分析与交互评价主题综合；比较研究的任务范围和方法，解释分歧，不逐篇排列摘要后就声称形成结论。

至少比较三类方案：规则/固定工作流、模型自由工具调用、模型提案加确定性权限和持久化编排。选择依据为真实任务表现、恢复能力、风险和实现复杂度；没有评测时只给设计理由，不宣称所选方案效果最优。

推荐的报告结构沿用 `plan.md`：赛题解析、方法与限制、主题证据、竞品、方案取舍、系统与安全、评价设计/真实结果、实施路线及引用。写作区分来源结论、工程推断、建议和本项目实测。

## 7. 本阶段退出条件

- 用户对 ARS 综述形式的待决项得到明确处理，保留实际决定。
- 关键 P0 设计都有可定位来源或明确的证据缺口；访问失败和只读摘要的条目不隐去。
- 所有引用存在性和支撑范围已分别核对，报告不包含虚构实验或用户访谈。
- 检索日志、证据矩阵与报告相互一致；实际采用的方法得到准确命名。

本文件保留检索准备协议；研究结果以实际检索日志、证据矩阵和 `report.md` 为准。当前采用单一 AI 执行上下文的定向检索和主题综合，没有独立双人筛选、预注册或穷尽性检索。
