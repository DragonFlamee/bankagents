# 银行 AI 智能体赛题：技能选型与安装记录

审阅及安装日期：2026-10-20。赛题依据：[problem.md](problem.md)。

已核查用户提供的六个项目的目录、说明及相关候选技能正文，安装其中四个来源的 **12 个技能**。安装位置为 `C:\Users\DA\.codex\skills`，下一轮对话可用。它们辅助开发、分析和设计；安装技能本身不会生成可运行的银行 Agent，也不会接入银行账户。

## 已安装及用途

| 技能 | 对赛题的具体帮助 | 使用边界 |
| --- | --- | --- |
| `banking-expert` | 账户、交易、支付、身份核验、金额精度等银行基础建模 | 示例有未实现的方法；转账仅用内存对象和补偿逻辑，不具备数据库原子性、并发保护和幂等保障，不能直接作为资金账本 |
| `workflow-automation` | 权限审批链、状态机、条件分支、人工确认、人工接管、审计轨迹 | 上游美元审批示例及 SLA 红黄绿分类不等于赛题的权限分级，须按赛题重建规则 |
| `integration-patterns` | 银行业务工具接口、幂等键、防止重复转账、超时重试、熔断、补偿事务、关联 ID | 通信故障熔断还须配合用户维度的可疑行为锁定；补偿操作也可能失败 |
| `operational-risk` | 异常事件分级、风险清单、故障处置、人工升级、安全自评报告 | 主要面向证券运营，提取通用控制方法，不照搬业务阈值 |
| `investment-suitability` | 风险问卷、风险承受能力、流动性和投资期限、产品适当性匹配 | 以美国 FINRA/SEC 为背景，不能直接当作中国业务规则 |
| `personal-budgeting` | 消费分类、收支汇总、预算对比、储蓄率、月度账单分析 | 分类和预算建议是辅助分析；脚本使用浮点数，不能用于真实资金记账 |
| `ai-anomaly-detection` | 异常交易特征、统计检测、异常清单和解释 | 附带脚本仅实现 z-score、IQR、滚动偏差；Isolation Forest/自动编码器是方法指导，未包含完整模型。异常也不等于欺诈结论 |
| `kyc-doc-parse` | 从身份及开户资料提取结构化字段，缺失值不猜测；明确把文档视为不可信输入 | 资料提取不是身份认证，也不能替代短信、人脸等强验证 |
| `kyc-rules` | 使用可信规则表逐条检查，关联证据，给出补件与人工升级结果 | 依赖团队提供的规则表和筛查结果；没有自动安装筛查 MCP，也不能虚构筛查结果 |
| `return-calculations` | 理财收益率、复合收益、TWR/MWR，减少模型心算错误 | 金融计算基础依赖；结果依赖真实输入和现金流口径 |
| `time-value-of-money` | 存款复利、现值、年金、还款和产品收益比较 | 金融计算基础依赖；未来收益测算不代表承诺收益 |
| `statistics-fundamentals` | 统计汇总、波动、分布检验、异常分析基础 | 金融计算基础依赖；附带协方差收缩为简化实现 |

三个金融计算基础技能是 JoelLewis 仓库声明的 `core` 依赖，同时对收益比较和账单分析有实际用途。未把各技能的“相关技能”列表全部作为必装依赖。

## 六个项目的取舍

| 项目 | 结论 | 理由 |
| --- | --- | --- |
| [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) | 精选安装 7 个 | 工作流、接口可靠性和风险设计与赛题相关；大量投研及美国证券监管技能没有安装 |
| [banking-expert 原仓库](https://github.com/personamanagmentlayer/pcl/tree/79ccaa9820486121fa33aaa696ec16fa1607bf02/stdlib/professional/banking-expert) | 安装 1 个，作为基础参考 | 从技能聚合页面追溯至公开原仓库；覆盖账户与支付，但代码是教学骨架 |
| [GAJETOso/financeskills](https://github.com/GAJETOso/financeskills) | 精选安装 2 个 | 预算与异常检测直接对应账单分析；`banking-compliance` 实际重点是资本充足率、RWA、Basel III，与本题权限控制距离较远，未安装 |
| [commit-ai/anthropics-financial-services](https://github.com/commit-ai/anthropics-financial-services) | 精选安装 2 个 KYC 技能 | 不可信输入、结构化提取、规则与证据分离值得参考；DCF、LBO、投行材料等未安装。此地址是 commit-ai 名下仓库，不能仅凭名称称其为 Anthropic 官方仓库 |
| [serena-ai-architect/fin-agent-skills](https://github.com/serena-ai-architect/fin-agent-skills) | 暂不安装 | `analyst`/`regtech` 硬编码作者自身项目的文件、命令及 MCP；不是独立可用的通用组件。`build` 是通用执行模式，对赛题增益小；审阅版本未找到许可证文件。工具边界、规则结构化和混合检索思路可作参考 |
| [kangcodex/finance-skills](https://github.com/kangcodex/finance-skills) | 暂不安装 | 主要是市场新闻、选股、机构持仓、新加坡保险与 CPF；对转账、卡片、订阅和权限控制帮助有限，未来做资讯扩展再考虑 |

## 在这个比赛中如何使用

优先让 `banking-expert`、`workflow-automation`、`integration-patterns` 共同辅助设计模拟银行后端、权限策略和业务状态机。以 `personal-budgeting` 和 `ai-anomaly-detection` 支撑账单场景；扩展理财时再使用适当性和金融计算技能。KYC 属于可选补充，不必为了已有技能把开户做成首要场景。

示例任务：

> 按 problem.md，使用 $banking-expert、$workflow-automation 和 $integration-patterns，设计智能转账、账单分析、卡片管理三个场景的模拟银行后端、权限网关和任务 DAG，并列出关键安全测试。

> 使用 $personal-budgeting 和 $ai-anomaly-detection 分析模拟交易记录，输出可核对的分类汇总与异常证据，不虚构缺失数据。

## 安装后仍需自行实现的赛题重点

1. **权限必须在工具执行端强制检查。** 模型负责提出操作，服务端决定是否执行；不能靠提示词授权。比赛规则是查询类绿色自动执行、小额转账日累计不超过 1000 元黄色明确确认、大额日累计超过 1000 元及指定高风险操作红色强验证。累计限额须防止拆单和并发绕过，不能套用上游美元示例。
2. **确认和强验证要绑定具体操作参数。** 收款人、金额、币种变化应使原确认失效；验证凭据应受会话、有效期和单次使用约束。
3. **事实必须来自业务工具。** 区分待确认、待验证、处理中、成功、失败和结果未知；接口超时不能声称成功，也不能未经查询就重复扣款。
4. **注入防御与隔离须落到实现。** 收款备注、交易描述、外部文档均是数据，不能修改权限；代码执行的沙箱需要独立实现，KYC 文档中的防注入说明并不覆盖整个系统。
5. **DAG、中断、回退、人工接管和审计须能演示。** 记录计划、策略判定、确认与验证结果、工具参数及回执；敏感字段脱敏，不记录验证码、密钥或原始私密推理。对已发生的资金操作使用可追踪的冲正/补偿，不能只修改 UI 状态。
6. **补齐订阅、卡片与定时授权的业务实现。** 本次技能没有提供这些完整模块。跨场景自动化尤其需要明确授权范围、执行时重新校验及失败处理。

## 安装和验证

- 使用内置 `skill-installer` 的官方安装脚本，从固定 Git 提交安装，未运行上游仓库的一键安装脚本。
- 12 个目标目录原先均不存在，没有覆盖现有技能。
- 复制并保留来源仓库根目录的许可证及适用的附加说明；每个技能增加 `UPSTREAM-SOURCE.json` 记录来源、路径和版本。PCL 同时保留 Apache 与文档许可文件。
- 30 个原始文件逐一通过 SHA-256 比对；12 份 SKILL.md 的 YAML、名称、描述和相对链接检查通过。
- 所选目录未发现符号链接、安装钩子、MCP 自动配置或独立 shell 可执行脚本；Python 导入与危险调用静态筛查未发现本次检查规则覆盖的可疑项。这不是完整安全审计。
- 5 个附带 Python 脚本自检全部通过：收益率、统计、货币时间价值、个人预算、异常检测。当前环境已有 NumPy/SciPy，无需额外安装；这不代表银行业务安全测试已完成。

可复核记录：

- [安装清单及固定版本](skill-review/installation-manifest.json)
- [实际安装结果](skill-review/installed-skills.json)
- [文件校验与脚本自检输出](skill-review/verification-results.json)

审阅快照保存在 `skill-review/` 各仓库子目录。上游文本作为来源材料保留，不是参赛团队原创；参赛代码与文档应据此独立实现并保留所需归属说明。
