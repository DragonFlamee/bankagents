# TraceBank 内容与结构审计

2026-10-22。目标附件为 `61327c77-43cb-431a-b7e5-31e8d739d330/pasted-text-1.txt`；基线 `6b16d08`，实施分支 `codex/task-workspace-clarity`。这是内容与结构重构，先完成本审计及方案，再改 UI。

## 使用的技能和证据

实际存在且已读取：Impeccable 4.7（distill、clarify、layout、harden 的操作原则），Frontend Design；UI UX Pro Max 已安装，沿用其语义 token、焦点和状态反馈规则，在视觉阶段再做针对检索。Motion 技能的上轮实现可复用。Web Design Guidelines 与 React Best Practices 未在安装目录找到，不宣称调用，相关检查使用标准与官方资料。

`impeccable context --target apps/frontend/src/Workspace.tsx` 已尝试，缺少引擎且不能创建用户缓存；依技能的 launcher fallback 直接读项目。PRODUCT.md、DESIGN.md、AGENTS.md 均不存在；现有 README、设计系统、代码、保存截图提供产品事实。未运行需要额外授权的正式双 Agent critique 或宣称 detector/浏览器叠加层已执行；本轮为自主重构中的内容审计和布局审查。用户已明确产品目标、状态、技术和执行顺序，方案按本次授权自主决定，不另开启 shape/init 的确认访谈。

改版前九种状态的 1600×900 实页截图在 `artifacts/screenshots/clarity/before/`，可见文字和按钮清单在 `evals/results/clarity-content-before.json`。状态数据为明确的 UI 夹具，字段使用后端状态，不冒充真实交易。后续验收另用真实离线服务确认权限和资金行为。

## 内容清理表

同一模板内的金额、姓名、真实交易行按业务数据保留；下表审计可见元素的模板，而非改写客户数据。

| 原始内容 | 所在组件 | 决定 | 修改后表现 | 原因 |
| --- | --- | --- | --- | --- |
| 拾迹银行 + TRACEBANK | App brand | REWRITE | 一个品牌名 TraceBank，保留标记 | 去除中英文重复 |
| 模拟业务空间 + DEMO + 模拟环境 | App environment/topbar | REWRITE | 顶部一处“模拟环境” | 必要标识只说一次 |
| 新建 Agent 任务、新建任务、进入 Agent 工作台 | App/Workspace | REWRITE | 侧栏一个“新建任务”；总览保留工作台导航入口 | 全局动作与导航有区别，工作区不再重复新建 |
| 业务总览等五个导航名称、选中状态 | App navigation | KEEP | 统一导航 | 必要定位 |
| 个人业务空间 > Agent 工作台 + 内部标题栏 | App breadcrumb/Workspace toolbar | REWRITE | 顶部为页面定位；正文直接显示当前任务 | 不重复两个工作台标题栏 |
| 搜索或跳转、Ctrl K | App command-trigger | REWRITE | “搜索”，快捷键作为提示 | 操作明确，技术辅助退后 |
| 离线规则基线/模型规划模式 | App planner-label | HIDE | 授权规则中的运行信息 | 模型配置不等于金融状态 |
| 最近任务 + 总数 + 装饰点 | App sidebar-recent | REWRITE | 最近任务名，不显示无用途总数/点 | 历史可访问，不制造状态噪声 |
| 用户姓名与个人演示账户 | App user-account | REWRITE | 姓名、退出操作 | 全局已有模拟标识 |
| 页脚两遍银行名、可追溯金融 Agent、竞赛说明 | App page-footer | DELETE | 去除页脚宣传 | 不影响模拟标识与安全规则 |
| 说出目标，逐步办妥 | Workspace empty | REWRITE | “需要办理什么？” | 直接提出用户任务 |
| 图标徽章 + 查询/分析/办理等抽象说明 | Workspace empty | DELETE | 空态只留输入与真实场景 | 不填空白、不宣传 |
| 空态三条示例 + 下方六个场景 | Workspace prompt-list/composer | REWRITE | 同一组六个快捷场景，只预填 | 去除重复入口 |
| 你的业务目标/继续描述需求 | Workspace composer | REWRITE | “业务需求”持续标签 | 同一字段用同一个名称 |
| 六个业务场景、能力说明、理财未实现 | Workspace scenario-picker | REWRITE | “选择场景”；场景说明保留在菜单；未实现范围放授权规则 | 场景可发现且不误导覆盖范围 |
| Enter发送、Shift Enter换行、独立窗口输入OTP | Workspace composer-note | HIDE | 快捷键提示按需显示；验证警告移到授权/OTP | 不在每次输入下重复安全教程 |
| 用户指令、你、拾迹 Agent、处理中 | Workspace user-message/agent-author | REWRITE | 任务名为主标题，一处业务状态 | 不模拟多余聊天角色 |
| 执行过程 17条记录 | Workspace Trace | REWRITE | “查看执行详情” | 数量不是主要结果 |
| 默认展开事件、输入、模型请求、用量 | Workspace Trace | HIDE | 二级步骤，三级“技术日志” | 保留记录，主界面不摆调试台 |
| model.started等技术名、node ID、Request ID、Token | Trace/PlanMap | HIDE | 技术日志及节点详情 | 核查所需，不影响日常任务判断 |
| 任务ID + 创建时间 | execution-caption | HIDE | 执行详情的任务信息 | 一般不帮助下一步操作 |
| 右侧空计划与三阶段流程说明 | Workspace plan-empty | DELETE | 空任务没有执行侧栏 | 无任务不显示假工作流 |
| 已完成x/y、Badge、节点状态、重复授权状态 | Workspace/OperationPanel | REWRITE | 一级一个任务状态；二级按步骤标状态 | 避免同状态在三处重复 |
| 右侧转账表单 | Workspace OperationPanel | REWRITE | 移到主结果下方，直接核对 | 确认是主任务，不能藏在详情 |
| 收款人、金额、卡片、有效期 | OperationFields/OperationPanel | KEEP | 语义化字段列表，电话默认脱敏 | 必要金融信息 |
| 缺少来源账户 | OperationFields | REWRITE | 展示后端真实使用的付款账户 | backend按用户账户ID排序取第一个；不编造选择能力 |
| 黄色·本人确认/红色·独立验证 | OperationPanel | REWRITE | “需本人确认”或“需独立验证” | 用业务含义表达风险等级 |
| 操作回执编号、完整回执 | OperationPanel | HIDE | 执行详情中的回执 | 一级显示实际办理结果，原始回执保留 |
| 等待核对的黄色横条 + 正文同一提示 | Workspace attention-strip/answer | REWRITE | 一处确认表单与必要警告 | 主路径无需“跳到右侧” |
| 账单摘要卡与正文重复同一总额 | Workspace business-summary | DELETE | 业务回答直接给出结论，分类/原始金额在详情 | 减少重复卡片 |
| 真实账单建议、已完成交易及不可撤销后果 | Workspace answer | KEEP | 清楚结果，保留服务端事实 | 不因简化隐藏后果 |
| 正文内回执ID、交易ID、右侧工具等定位 | Workspace answer | HIDE | 仅移除已识别技术ID，原文及证据可在详情核对 | 保留事实，不让正文变技术串 |
| 已取消但无明确结果 | Workspace status | REWRITE | 依服务端操作状态显示“转账未执行”；部分完成单独说明 | 不把取消任务当冲正 |
| 暂停、继续、转人工、取消 | Workspace controls | KEEP | “任务操作”二级入口；停止处理中任务直接可见 | 功能不丢失，主操作不竞争 |
| 默认依赖图/缩放/长操作说明 | PlanMap | HIDE | 复杂任务按需打开完整图，简任务为摘要/列表 | 单节点不占画布 |
| 缩放、复位、平移、键盘 | PlanMap | KEEP | 紧凑控件，帮助按需查看，增加节点查看 | 真实图需可操作 |
| 任务列表工具名 A / B / C | TaskRows | REWRITE | 任务名与状态，步骤信息进详情 | 符号拼接不是结构 |
| 列表日期、完成步骤比例 | TaskRows/history | KEEP | 记录页面保留；近期简表减少字段 | 时间和比例确有数据语义 |
| 审批任务ID和重复需求 | App approvals | HIDE | 操作标题、字段、状态；ID进详情 | 审批首先核对业务 |
| 审计事件英文代码 | App activity audit | REWRITE | 业务名称，原代码和hash进记录详情 | 主列表用业务语言，证据完整 |
| 哈希链校验状态与完整审计证据 | App activity | KEEP | 查询校验与展开详情 | 不隐藏审计完整性 |
| 总览金额、期间、图表轴、账户及交易数据 | App/charts/Analytics | KEEP | 统一排版，减去无意义副标题和卡片边框 | 不删除有用数据 |
| 搜索、排序、分页、导出 | Analytics/Activity | KEEP | 明确标签与键盘操作 | 完整交互必须保留 |
| 失败恢复、Skeleton、Toast | App/controls | KEEP | 读取失败可重新读取，写入未知只核实 | 必要反馈，不发起隐式重试 |
| OTP、金额、收款人、演示收件箱、安全规则 | App Modal | KEEP | 独立验证，增加来源账户，去装饰分隔符 | 认证不能因简化消失 |
| 登录口令说明与模拟范围 | Login/operator | KEEP | 模拟和角色边界保留，删重复口号 | 不把演示当真实银行 |
| 空态 Inbox 装饰图标 | components Empty | DELETE | 保留左对齐的真实空态内容 | 不以图标填充空间 |
| 授权事项已处理 | App dashboard | REWRITE | 当前没有待确认操作 | 零条待办不能证明历史操作均已处理 |
| 隐藏在原始JSON中的模型用量 | ExecutionDetails | REWRITE | 技术日志内可展开模型、请求编号、实际用量；原数据仍可查 | 让证据可读，缺失值不伪造为0 |

## 文案与符号规则

可复用规则见 `docs/ui-writing-zh.md`。本轮重点不是禁止所有符号：金额小数、日期、实际 x/y 比例、快捷键 +、URL 都保留。装饰性中点、无意义工具名斜线串、每个链接尾部箭头删除。API字段、审计代码在三级保持原样。

## 当前状态映射及不变量

权威来源：`banking_agent/orchestrator.py` 的 run/control/operation_action；`banking_agent/bank.py` 的 authorize/cancel/reconcile/transfer。汇总状态按 unknown > awaiting_verification > awaiting_confirmation > failed > cancelled > pending 选择，全部节点成功才 succeeded。

| UI 状态 | 后端证据 | 一级展示和操作 |
| --- | --- | --- |
| 未开始 | 无 run/plan | 输入和场景，无执行图 |
| 规划中 | queued/running且尚无plan | 当前规划状态；可停止，无成功结论 |
| 等待用户确认 | 操作 awaiting_confirmation / awaiting_verification | 收款人、金额、付款账户、有效期；明确确认或独立验证 |
| 执行中 | 活跃run及实际工具/整理回答事件 | 当前阶段和真实步骤数量，不提前显示最终回答 |
| 执行成功 | plan succeeded；交易结论另需operation succeeded及receipt | 业务回答及回执入口 |
| 部分成功 | failed/cancelled/interrupted且存在实际成功节点及未成功节点 | 列出已完成部分；已提交转账不可因取消撤销 |
| 执行失败 | failed且无已完成部分 | 业务原因、详情；仅确认没有未知/已提交写入时提供预填重发 |
| 已取消 | cancelled；具体转账未执行仅在operation cancelled时声明 | 显示未执行事实；重发只预填，不自动执行 |
| 结果待核实 | 任一 operation/node unknown，优先于其他状态 | 查询原操作，禁止重发或假装取消 |
| 已暂停/人工接管/待补充/已中断/停止中 | 对应服务端状态 | 保留恢复/交还边界，不强行合并成八种状态 |

用户取消计划会保留 succeeded 节点；cancel_operation 返回“用户取消，未执行”。未知操作拒绝取消，reconcile 只读取原回执。前端不得因外观把这些含义改掉。付款账户为后端执行SQL `ORDER BY id LIMIT 1` 的同一用户账户，界面镜像其既有选择规则，未增加账户切换功能。

## 布局问题与替代方案

原默认三列固定展示空执行栏；中间重复任务/角色/状态，授权被挤到窄栏；主要结果与技术事件同级。方案比较与推荐见 `docs/clarity-ui-design.md`。所有具体变更在实施和验收后逐项核对，不以本表作为完成证明。
