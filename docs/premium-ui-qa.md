# Premium Banking AI Workspace · 本轮交付与验收

> 历史版本记录。后续已完成内容与信息架构重构，当前页面和最新证据见 [clarity-ui-qa.md](clarity-ui-qa.md)。

2026-10-22。基线 `8baf0cf`；本轮依据用户完整 UI/UX 改造附件执行，主要使用已安装的 ui-ux-pro-max。最新要求“别保留这个绿色了”优先于初始附件中的绿色品牌要求，最终统一为白色、冷灰、深海军蓝和少量实心靛紫。功能范围、服务端业务接口及安全校验保持原样。

## 设计与实现

原界面主要问题是低对比小字、浅绿和浅灰混用、执行栏空旷、输入区域留白过大，以及控件状态不统一。完整审查与技能检索取舍见 [UI Audit](premium-ui-audit.md)。

新方向是可核对的银行业务工作台：左侧导航，中间业务内容，右侧实际执行步骤。金额、授权状态与最终回答优先，不增加营销数字或虚构进度。颜色取样参考用户提供的 [PayFlow 页面](https://uupm.cc/demo/payment-gateway)，只借鉴白底、深色文字和实心强调色。设计规则见 [MASTER](../design-system/tracebank-premium/MASTER.md)，实际 token 位于 `apps/frontend/public/tokens.css`，客户页与独立操作员页共用。

核心规则：主文 `#0A2540`，次文 `#425466`，背景 `#F5F7FA`；主操作 `#635BFF`，文字链接使用更深的 `#4434B8`。选中态有边界、强调线与字重；成功深蓝、等待深棕、失败砖红，并同时显示图标与文字。Manrope 自托管，中文使用系统 UI 黑体，金额采用等宽数字；4px 间距标尺、4/6/8/12px 圆角、100/160/200ms 状态反馈。普通内容没有悬浮阴影，只有菜单和模态层有必要的层次。

## 逐项交付

| 用户要求 | 实际完成与证据 |
| --- | --- |
| 扫描现有页面与架构 | 业务总览、Agent 工作台、交易分析、审批中心、活动日志、登录、操作员、OTP、安全规则全部纳入。现有项目没有设置页或右键上下文菜单，不添加无功能入口。 |
| 统一设计系统 | 客户页、操作员页共用语义颜色；字号、间距、圆角、边框、阴影、控件、图标及 Motion token。CSS 颜色声明引用 token，没有在各业务组件散落十六进制配色。favicon 和浏览器主题色同步。 |
| 控件状态 | Primary / Secondary / Tertiary / Destructive、hover / pressed / focus-visible / disabled / loading；原生表单、可关闭 Toast、实际请求 Skeleton；错误恢复只重新读取。 |
| 侧栏与头部 | 224/72px 折叠侧栏、明确选中态、最近任务截断与键盘 Tooltip、可见工作空间和账号、安全入口、跳过导航；手机抽屉约束焦点、Escape 关闭。 |
| 全局键盘入口 | Ctrl/Cmd+K 搜索页面、历史任务、场景；方向键/Enter/Escape；快捷场景只预填，绝不自动提交资金操作。 |
| 输入区与场景 | 六个现有场景、自动高度输入、Enter/Shift+Enter、中文输入法保护、明确不可用/发送中状态、菜单键盘和外部点击关闭。 |
| 执行与回答 | 实际 run.events 在前，可展开工具输入/观测/用量，执行时自动展开、结束后收起，手动选择保留；最终回答独立位于过程下方，展示保存的账单金额、笔数与依据。 |
| 执行面板 | 空态明确是流程说明；实际 Stepper 和已完成/总节点数，等待/运行/失败/成功；面板可收起、恢复及切换宽度。待确认入口定位实际操作卡。 |
| 有意义的缩放 | 可选依赖图直接使用 plan.nodes/depends_on，保留步骤列表；50–200% 缩放、百分比、复位、+/-/0、箭头/拖动平移及 Alt+滚轮。保留 Ctrl/Cmd 浏览器缩放。无前置依赖的并行节点不虚构连线。 |
| 金融确认 | 默认电话脱敏，显式展开核对；姓名、金额、卡片尾号、风险、有效期保留。黄色确认与红色独立 OTP 沿用原流程，未知结果只查原操作，取消不冒充回滚。 |
| 全页面一致 | 总览指标、真实合成流水图表、筛选/搜索/排序/分页/导出、审批 Tabs、审计列表与证据、登录/操作员/安全弹窗统一。没有新增随机走势、虚构环比或真实银行连接。 |
| 响应式和性能 | 四视口、表格自身滚动、手机任务/状态直接显示，移动输入 16px；短时 transform/opacity 反馈，reduced-motion 下关闭动画。没有新增运行依赖。 |

## 实页审查与迭代

实际启动了 Vite `127.0.0.1:5173` 和隔离离线 API `127.0.0.1:8790`，使用本机 Edge 渲染，另检查 Python 静态构建服务。截图不是设计稿。每轮截图包含真实合成业务数据，异常状态夹具另行标识。

1. [基线](../artifacts/screenshots/premium/baseline/)保留原版本。首轮新界面截图发现工作台空态与输入区重叠、隐藏 Tooltip 扩张手机宽度、表格内绝对定位的无障碍文字影响页面边界；修正 flex 布局、Tooltip 显隐及 table-scroll 定位。
2. 第二次审查调整 1280px 工作区留白、手机分类分布、任务表格。最终断言发现后置通用表格最小宽度覆盖了任务表格，已限定为交易流水表格；任务列表在手机上直接显示状态，并检查状态列确实在视口内，不能只用“页面未溢出”代替。
3. 根据用户参考先调整中性色，随后按最新指示完全移除绿色品牌色。主按钮、选中态、品牌标记、图表、成功状态、操作员与 favicon 同步；加深浅底上的强调文字并重新检查对比。最终截图目录为 [final](../artifacts/screenshots/premium/final/)，中间绿色版本仅作审查历史。

最终逐页覆盖 1440×900、1280×800、768×900、390×844：五页面共 20 个组合，另含登录、授权任务、依赖图、安全规则、命令面板、操作员桌面/手机，共 37 张本轮最终截图。均无整页横向溢出。

推荐查看：[总览](../artifacts/screenshots/premium/final/dashboard-1440-final.png)、[Agent 任务与授权](../artifacts/screenshots/premium/final/workspace-approval-1440.png)、[实际依赖图](../artifacts/screenshots/premium/final/workflow-graph-1440.png)、[分析页](../artifacts/screenshots/premium/final/analytics-1280-final.png)、[手机任务状态](../artifacts/screenshots/premium/final/dashboard-390-final.png)、[手机 Agent](../artifacts/screenshots/premium/final/workspace-390-final.png)。

## 验证结果与边界

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript / Vite production build | 通过；静态构建已更新到 apps/web-ui | `npm run typecheck` / `npm run build:web` |
| Python/HTTP 业务回归 | **153 通过**，0 失败；1 条现有 Starlette/HTTPX 弃用提示 | [JUnit](../evals/results/pytest-premium-ui.xml) |
| 真实离线业务浏览器 | **15 组通过**：余额、六场景、黄色确认、红色及错误验证码、暂停、DAG、取消、接管/操作员、筛选导出、审计、响应式 | [premium-regression.json](../evals/results/premium-regression.json) |
| 新交互浏览器 | **13 组通过**：键盘、折叠、输入、实际图、宽度、按钮状态、Skeleton/只读恢复、Tabs、14 对颜色、手机与 reduced-motion；此脚本未授权或提交资金 | [premium-interactions.json](../evals/results/premium-interactions.json) |
| 生成时序 | **4 组通过**，使用记录响应夹具；规划/工具/整理阶段不提前显示答案、结束可展开、手动收起、失败 | [premium-thinking.json](../evals/results/premium-thinking.json) |
| 未知/失败显示 | **2 组通过**，明确标识的 API 夹具，0 新模型请求、0 实际资金变化 | [premium-states.json](../evals/results/premium-states.json) |
| 原用户演示兼容 | **2 组通过**，只读打开已保存模型任务/用量/答案，刷新、键盘、账号隔离；0 新模型请求与业务写入 | [premium-compat.json](../evals/results/premium-compat.json) |
| 四视口实页与控制台 | 通过；五路由、规则、命令、操作员；无新 JS/CSP 错误 | [premium-visual-final.json](../evals/results/premium-visual-final.json) |

14 对 token 的实际对比：主文/白底 **15.54:1**，次文/导航 **6.94:1**，元数据/导航 **5.19:1**，白字/主按钮 **4.70:1**，强调文字/浅底 **8.18:1**，状态文字均超过 **4.5:1**，交互边界/白底 **3.33:1**。这是所列颜色对与键盘路径检查，不宣称完整 WCAG 认证或全部辅助技术验收。

首次 pytest 继承本机 `TRACEBANK_PLANNER=llm`，导致预期离线规则的 6 项失败（147 通过），记录保留于 `pytest-premium-ui-first-attempt.xml`。没有更改业务代码来适配错误环境；显式设置 `TRACEBANK_PLANNER=offline` 后 153 项通过。首次运行可能请求过模型，不能把整轮工作描述成“零模型调用”。本轮 UI 验收自身的离线、只读及夹具范围按上表分别说明，未新增模型能力评测。

开发服务器最初有字体目录 403 和代理 Host 不匹配，已通过 Vite 文件范围与 `changeOrigin:false` 修复，服务端同源/CSRF 校验保持原样。历史演示服务曾未监听，已用 start-demo.ps1 恢复原数据目录，不重置账户。中间失败截图/记录保留，不冒充通过证据。

## 复现与剩余事项

生产界面：按 README 运行 `scripts/start-demo.ps1`，访问 `http://127.0.0.1:8765`。前端修改后先构建，浏览器必要时 Ctrl+F5。开发模式先启动 API，再运行 `npm run dev:web`；可用 `TRACEBANK_DEV_API` 指定隔离后端，默认 8765。

```powershell
$env:TRACEBANK_PLANNER='offline'
.\.venv\Scripts\python.exe -m pytest -q tests
npm run typecheck
npm run build:web
npm run test:browser
# 以下需要事先启动隔离离线后端 8790 / Vite 5173
node evals/premium-interactions.cjs
node evals/premium-states.cjs
$env:TRACEBANK_VISUAL_ROUND='final'
node evals/premium-visual.cjs
```

当前没有发现阻断本地演示的界面问题。仍只有模拟账户，真实银行、真实认证、公网生产、开放模型可靠性和跨系统浏览器/辅助技术验收不属于本轮结果。原 PPT/视频继续记录历史界面，没有重录为新主题；远端发布仍由用户处理。
