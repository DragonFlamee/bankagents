# 文献与工程证据矩阵

核查日期：2026-10-21。以下阅读均为机器辅助阅读，不代表用户已读。`sections` 表示只读指定部分，不是全文覆盖；页面存在与主张得到支持分别核查。不同任务和模型的实验百分比不作横向排名。

| 引用键 | 来源与实际阅读范围 | 可支持的主张及定位 | 证据边界 | 本项目工程推断 |
| --- | --- | --- | --- | --- |
| yao2022react | [ReAct 原文](https://arxiv.org/html/2210.03629v3)，sections：Abstract、Introduction | 交织推理与外部行动使模型能够结合工具返回更新计划 | 研究任务不等于银行交易，不能证明授权安全 | 采用候选规划与可观察工具结果，权限另设确定性控制 |
| yao2024tau | [τ-bench 原文](https://arxiv.org/html/2406.12045)，sections：任务/Reward/Pass^k、实验失败讨论 | 按数据库终态评估；重复运行一致性不同于多试一次成功；终态正确仍可能漏掉确认过程 | 原始领域为零售和航空，非银行；本项目未复现该基准 | 同时核查账本终态、授权过程与恢复，未来模型联调需重复试验 |
| debenedetti2024dojo | [AgentDojo 原文](https://arxiv.org/html/2406.13352)，sections：Introduction、3.4 Reporting | 在有状态工具环境中分别测正常效用、攻击下效用、攻击目标达成 | 公开攻击集不是所有攻击；不把论文旧模型结果当作当前模型性能 | 攻击测试检查真实副作用，同时保留合法任务的误拦截观察 |
| zhan2024injec | [InjecAgent 原文](https://arxiv.org/html/2403.02691)，sections：Abstract、攻击分类与 Experiments 可见部分 | 外部工具文本可承载间接注入，攻击目标包含伤害与数据窃取 | 其具体模板、模型和攻击率不能外推至本系统 | 将备注、文档、工具输出列为不可信输入，测试身份、参数和授权字段伪造 |
| debenedetti2025camel | [CaMeL 原文](https://arxiv.org/html/2503.18813)，sections：Abstract、3.1、5.2–5.3 可见部分 | 使用控制/数据流分离和能力策略建立模型外防护 | 本项目没有实现 CaMeL 完整解释器、污点和能力体系，不继承其证明 | 服务端权限网关与数值 DSL 是受启发的较小设计，需自行验证 |
| bhagwatkar2025firewall | [防火墙与基准局限原文](https://arxiv.org/html/2510.05244)，sections：Abstract、7/7.1 及 limitations 可见部分 | 既有基准及攻击强度可能夸大防御；仍需更强自适应攻击 | 采用 arXiv 版本，不猜测正式发表状态；不同基准结论需保留条件 | 固定测试零越权只作局部观测，不能当普遍安全证明 |
| amershi2019hai | [Microsoft Research 官方论文页](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/)，abstract/metadata | 提出并评价人机交互指导，包含跨 AI 产品设计情境 | 未阅读本次 PDF 正文，不转述未核对的具体指导编号；不是本项目用户效果证据 | 明确能力与限制、提供可纠正和可控制交互，后续需要真人体验验证 |
| revolutair | [AIR 官方帮助](https://help.revolut.com/help/profile-and-plan/getting-started-with-air/)，full_text（短帮助页）：What is AIR/What can I ask/What AIR can do | 官方说明对话式消费分析、订阅管理及部分应用内行动，逐步开放 | 厂商说明，UK 页面，非独立测试；不推断每个地区或每个账户可用 | 借鉴从分析到行动的连贯流程，差异化放在可验证授权与回执 |
| owaspauth | [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)，sections：2.1–2.6 | 服务端强制授权、顺序约束、交易数据绑定、参数变化使原授权失效 | 安全工程指导，不是银行法律合规认证 | 确认与 OTP 绑定不可变 operation，提交时重检累计额度 |
| pythonsqlite | [Python sqlite3](https://docs.python.org/3/library/sqlite3.html)，sections：Transaction control | sqlite3 提供事务控制接口 | 不证明跨数据库原子性或本系统正确；代码和测试另行核对 | 同一银行库事务提交余额、账本与回执，编排库恢复依赖原操作查询 |
| microsoftjob | [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)，sections：Job Limits/Managing Processes | Job Object 可以约束进程资源和管理进程树 | 资源限制不等于文件/网络权限隔离；文档另明确进程安全限制需单独设置 | 数值语言不提供 I/O 能力，加进程资源限制；不宣称任意 Python 的 OS 安全沙箱 |

## 证据张力与采用边界

| 候选对 | 共同问题与张力 | 本次处置 |
| --- | --- | --- |
| ReAct / OWASP | 自适应规划与确定性授权可分工实施 | 将规划自由限定在工具提案层，写操作仍由权限服务裁决；属于工程综合 |
| τ-bench / AgentDojo | 正常任务终态与攻击目标达成是不同评价面 | 两者均测，同时检查过程授权；不把一种指标替代另一种 |
| CaMeL / 防火墙与基准局限论文 | 特定威胁模型下的架构保证与公开基准泛化风险不同 | 不将论文条件下的保证移植为本项目的安全证明，追加故障和负向测试 |

这是针对共同主题的三组候选张力分析，没有进行全部来源两两比较；处置由同一 AI 上下文综合，未获得独立专家确认。
