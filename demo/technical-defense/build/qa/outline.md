# Deck Outline

- File: D:\Desktop\agents\demo\technical-defense\build\tracebank-technical-defense-20261027.pptx
- Slides: 17

## Slide 1: (No title)

Body:
- 银行 AI 智能体比赛
- TraceBank 拾迹银行
- 系统架构、核心算法与安全设计
- 模拟账户原型，代码18aa38d，2026-10-27
- 依据: problem.md、README.md、docs/current-release.md
- 1/17

Notes:
- 主讲约8分45秒，附录用于追问。介绍一次自然语言需求从计划到回执的实际路径。本系统已接入qwen3.8-flash，当前扩展六场景有离线证据，尚未完成新增六场景的完整真实模型回归。不要声称真实银行上线或通用自主重规划。
- 代码与证据：problem.md、README.md、docs/current-release.md

## Slide 2: (No title)

Body:
- 六类业务共用一套 Agent 执行内核
- 共享工具契约、任务编排与服务端授权。
- READOUT
- 六类场景
- 同一执行内核
- 全部模拟
- 依据: data/birthday-evidence.json，固定模拟时钟2026-10-26；tools.py
- 2/17

Notes:
- 这里先明确覆盖范围。六类功能不是六套独立聊天提示词，它们共用工具契约、计划编排、银行权限与审计。用户可以从业务页进入工作台，连续追问保留历史，每轮操作绑定自己的operation。以下重点解释这套共同内核。
- 代码与证据：data/birthday-evidence.json，固定模拟时钟2026-10-26；tools.py

## Slide 3: (No title)

Body:
- 系统把候选规划、授权执行和证据分开
- 架构
- 同源API、单进程、三个SQLite数据库
- 模型不能直接记账或读取OTP
- 依据: architecture.md、api.py、orchestrator.py（18aa38d）
- 3/17

Notes:
- 按图从上到下看。API从会话确定用户，规划器只输出候选任务。共享工具契约与DAG校验拦住非法字段，编排器保存检查点，银行服务独立判断风险和授权。计划、银行、会话分别持久化，跨库不是一个原子事务，所以恢复必须核实原操作。图中的认证面板是逻辑分离，不是已接入真实认证服务。
- 代码与证据：architecture.md、api.py、orchestrator.py（18aa38d）

## Slide 4: (No title)

Body:
- 一次请求经历四个可观察阶段
- 1
- 提交运行
- 会话确定用户
- 保存run与
- conversation
- 2
- 候选计划
- 工具、参数
- 依赖经过
- 服务端校验
- 3
- 授权后执行
- 记录工具输入
- 观测和
- 暂停原因
- 4
- 核验后回答
- 成功依据回执
- 已核验内容
- 逐段展示
- run、plan、node、operation、receipt 关联同一条行动记录
- 依据: orchestrator.py run / _resolve（18aa38d）；run_journal.py
- 4/17

Notes:
- 提交运行返回运行编号，页面显示真实的规划或工具阶段。后台处理会写model.completed、tool.started、tool.result、authorization.required和response.delta等事件。前端读取持久化事件并增量显示。我们没有把虚构的思考文字当作工作流，也不展示模型私密推理。
- 代码与证据：orchestrator.py run / _resolve（18aa38d）；run_journal.py

## Slide 5: (No title)

Body:
- 候选 DAG 必须通过结构和语义约束
- 1. 工具与字段
- 共享注册表拒绝未知工具、额外字段与伪造身份
- 2. 参数与精度
- 金额用整数分，严格类型和范围由服务端复核
- 3. 依赖与引用
- ID唯一，依赖存在，回执字段只能引用直接前置节点
- 4. 无环检查
- 反复寻找依赖已满足的节点，无进展则拒绝计划
- 最多12个节点。校验候选合法，不等于证明模型总能正确理解用户意图。
- 依据: planner.py validate_nodes、tools.py（18aa38d）
- 5/17

Notes:
- 校验先用严格模型拒绝额外字段，再按统一工具表检查参数。回执引用只能指向直接依赖允许的字段，例如hold_id。随后检查拓扑是否能推进，否则拒绝环或不存在的依赖。当前实现是有界反复扫描，不宣称实现了线性复杂度的Kahn队列算法。
- 代码与证据：planner.py validate_nodes、tools.py（18aa38d）

## Slide 6: (No title)

Body:
- 执行器只推进前置成功的节点
- 执行
- 读操作保存观测，写操作保存原operation
- 停止不会撤销已提交交易
- 依据: orchestrator.py run / _resolve（18aa38d）
- 6/17

Notes:
- 执行器扫描pending节点，前置失败或取消则停止后继，全部前置成功才进入工具。读工具直接保存结果，写工具先准备银行操作，用plan_id和node_id构造幂等键，并把operation_id保存在节点中。授权完成后仍回到原计划继续。当前是单进程锁和有序扫描，不声称多线程并行或跨worker租约。
- 代码与证据：orchestrator.py run / _resolve（18aa38d）

## Slide 7: (No title)

Body:
- 生日任务用前置回执串起跨场景业务
- 任务
- 实际离线计划，锁定1000元，预约共567元
- 可用余额已减少，未来付款尚未发生
- 依据: data/birthday-evidence.json，固定模拟时钟2026-10-26
- 7/17

Notes:
- 这是本轮在全新离线模拟账户中重新生成的计划，共5个节点。确认前两个读节点完成，锁定等待本人确认。确认锁定后，两项订单分别准备并获得本人确认，引用锁定回执的hold_id。1000元锁定额度中安排299元和268元，共567元，尚余433元。计划成功表示锁定及预约创建成功，商户未来付款尚未发生。
- 代码与证据：data/birthday-evidence.json，固定模拟时钟2026-10-26

## Slide 8: (No title)

Body:
- 服务端按业务参数决定授权级别
- 普通转账规则：当日已提交金额 + 本次金额 > 100000分时升级红色。
- 预约到期尚未结合实际日累计重新升级验证，已列P1待修复。
- READOUT
- 普通转账
- 累计超1000元
- 升级验证
- 依据: bank.py _risk / authorize（18aa38d）
- 8/17

Notes:
- 风险级别来自银行服务，模型不能指定自己已经授权。黄色确认固定参数，红色需要与operation和参数指纹绑定的挑战。普通转账在提交事务中重新计算累计，所以原先黄色也可能升级为红色。必须明确：预约执行是另一条代码路径，目前未做同等实际日累计复核，后面证据页披露。
- 代码与证据：bank.py _risk / authorize（18aa38d）

## Slide 9: (No title)

Body:
- 验证凭据绑定当前操作及其参数
- 授权
- 提交前重新检查普通操作的业务条件
- 验证一次消费，参数变化需重新授权
- 依据: bank.py _risk / authorize（18aa38d）
- 9/17

Notes:
- 红色操作生成challenge，OTP摘要结合challenge_id和fingerprint计算。服务端检查账户归属、期限和一次消费，执行前再次检查业务条件。验证失败累计三次会触发临时锁定，验证成功后即使下游通道失败也消费旧凭据。当前OTP可以从同一演示应用收件箱读取，不是生产级独立多因子认证。
- 代码与证据：bank.py _risk / authorize（18aa38d）

## Slide 10: (No title)

Body:
- 幂等标识与银行事务约束重复执行
- 事务
- 同键同参数复用，冲突参数拒绝
- unknown先核实原操作，避免重复扣款
- 依据: bank.py _move / reconcile，orchestrator.py（18aa38d）
- 10/17

Notes:
- 银行事务在BEGIN IMMEDIATE内完成余额、正负分录、交易、回执与审计。相同键相同参数返回原操作，不同参数拒绝。若提交已经成功但回执响应丢失，状态为unknown，查询原ID核实，而不是创建第二次扣款。计划库和银行库分开，所以崩溃恢复还需更多注入测试，不能只靠有SQLite就声称万无一失。
- 代码与证据：bank.py _move / reconcile，orchestrator.py（18aa38d）

## Slide 11: (No title)

Body:
- 四类攻击在不同边界受到约束
- 防线落在执行入口，提示词与前端按钮仅是辅助。
- READOUT
- 控制落在
- 实际执行入口
- 提示词仅辅助
- 依据: api.py、planner.py、bank.py、security-self-assessment.md
- 11/17

Notes:
- 把安全设计按攻击入口解释。第一层从会话确定身份并检查CSRF和同源。第二层校验候选计划。第三层由银行服务要求独立授权。最后结果只能引用工具事实。关键词拦截不能证明普遍防注入，已有测试也不能替代真实认证、未知工具输出攻击与生产安全评估。
- 代码与证据：api.py、planner.py、bank.py、security-self-assessment.md

## Slide 12: (No title)

Body:
- 审计保存证据，受限计算限制能力
- 关联审计
- plan / node / operation /
- receipt 串联
- 保留工具输入、策略、授权和结果
- 清洗OTP、密钥、PIN与私密推理
- hash链无外部锚，不能称不可篡改
- 数值 DSL worker
- 白名单AST解释，无eval或exec
- 没有文件、网络和银行API语法
- Windows Job：128 MiB、2秒CPU
- 不是任意Python的OS命名空间沙箱
- 失败即拒绝或留下失败记录，不把受限执行包装成全面安全认证
- 依据: sandbox.py、sandbox_worker.py、run_journal.py
- 12/17

Notes:
- 左侧是可追溯证据，hash链可发现现有记录的局部改写，不能完整发现删尾或整体重算。右侧是数值DSL，独立进程与资源限制控制计算，输入表达式上限4096字符、256AST节点和24层深度。系统不提供任意Python执行，因此文件和网络拒绝来自语言没有相应能力。
- 代码与证据：sandbox.py、sandbox_worker.py、run_journal.py

## Slide 13: (No title)

Body:
- 回答模型只能组织已核验的事实
- 回答
- 事实与文字先确定，模型只选择内容标识
- 不由模型自由生成金融金额或回执
- 依据: answers.py build_answer / synthesize（18aa38d）
- 13/17

Notes:
- 规划和回答是两个不同阶段。账单回答先把工具观测转成事实与可用段落，模型按原问题选择已知标识，服务端映射回真实文字，并通过response.delta逐段显示。若模型回答失败，查询本身不重做，界面保留已核验结果并说明边界。这个机制约束金额编造，但不证明任意建议或意图理解都正确。
- 代码与证据：answers.py build_answer / synthesize（18aa38d）

## Slide 14: (No title)

Body:
- 当前证据覆盖离线执行，仍保留明确缺口
- 离线证据不替代新增六场景模型验收，预约P1待修复。
- READOUT
- 通过项有分母
- 已知缺口保留
- 不扩大结论
- 依据: pytest-review-20261026.xml、review-20261026.json
- 14/17

Notes:
- 给评委准确的验证分母。183是测试项数，30是页面乘视口，不是业务成功率。新增六场景已做离线巡检，历史真实模型结果只对应其原版本。额外复现的预约问题不在183项覆盖内，需在到期日实际累计超过阈值时转待验证，而不是自动付款。现有原型不连接真实银行或商户。主讲到此结束，以下三页用于技术问答。
- 代码与证据：pytest-review-20261026.xml、review-20261026.json

## Slide 15: (No title)

Body:
- 附录A：异常账单提示保留可解释规则
- 算法
- 统计规则与来源交易共同形成待核对线索
- 提示异常不自动认定欺诈，当前没有训练机器学习模型
- 依据: insights.py、catalog.py、tests/test_scenarios.py
- 15/17

Notes:
- MAD修正z分数为0.6745乘金额偏离中位数再除MAD。同类历史不足五笔或MAD为零时不采用此统计项。阈值3.5之外还有限额条件。规则同时覆盖境外、凌晨、首次商户与短时重复扣款，逐项记录原因。示例1980元来自模拟账户，不是外部真实欺诈案件。
- 代码与证据：insights.py、catalog.py、tests/test_scenarios.py

## Slide 16: (No title)

Body:
- 附录B：适当性、持有期与AA都由规则计算
- 产品、净值与收益均为模拟；“演示：对方已付”是模拟入账，不是真实收款。
- READOUT
- 金额用整数分
- 规则独立计算
- 模型不自由记账
- 依据: insights.py、catalog.py、tests/test_scenarios.py；bank.py
- 16/17

Notes:
- 这些算法不依赖模型自由计算钱。风险问卷有不能接受亏损等上限/否决规则，风险等级是模拟匹配。AA总金额按分拆分，余数由发起人承担。锁定与储蓄目标不同，funds.hold实际减少模拟可用余额，goals.create仅记目标。收入与支出、已锁定与已付款要分开解释。
- 代码与证据：insights.py、catalog.py、tests/test_scenarios.py；bank.py

## Slide 17: (No title)

Body:
- 附录C：每项主张都有源码或实测入口
- SVG、提纲与脚本随工程保存；部署及仓库入口见README。
- READOUT
- 源码可追溯
- 图稿可重建
- 密钥不进材料
- 依据: pytest-review-20261026.xml、review-20261026.json；docs/submission.md
- 17/17

Notes:
- 附录用于回答评委如何复现。规划与工具契约、授权和幂等、事实回答与审计分别对应表中源码。生日计划保留独立离线观测，历史模型记录按其原版本解释。模型服务凭据仅在服务端环境变量中，源码和PPT不写密钥。详细技术说明与验证证据从docs/submission.md进入。
- 代码与证据：pytest-review-20261026.xml、review-20261026.json；docs/submission.md
