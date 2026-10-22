# Premium Banking AI Workspace：UI/UX 审查

2026-10-22。依据用户附件全文，基线提交 `8baf0cf`。本轮使用 ui-ux-pro-max 为主要指导，不改变现有工具范围、同源 API、资金权限或认证规则。

## 实际页面和技术栈

React 19、TypeScript 7、Tailwind 4、Vite 8、Lucide；现有组件为 Button、Badge、Modal、OperationPanel、TaskRows、SVG 图表。五个 hash 路由为 dashboard / workspace / analytics / approvals / activity；另有登录页、独立 operator.html、OTP 与安全规则弹窗。没有设置页面，也没有现成可缩放画布。

## 优先问题

| 优先级 | 当前证据 | 改造与验收 |
| --- | --- | --- |
| P0 | styles.css 叠加多轮规则，正文之外大量 9–11px 和浅灰；颜色分散 | 用统一语义 token 重建，实测正文、说明、交互、状态对比；检查所有页面 |
| P0 | 敏感操作显示完整电话；未知结果与失败须保留服务端含义 | 默认脱敏，明确展开核对；仍只由既有授权/验证/原操作对账接口执行 |
| P1 | 工作区 min-height 与自动底部留白，输入区与目标分离；右栏无信息概览 | 更紧凑的工作布局、可折叠执行面板、实数步骤计数、工具结果与待办入口 |
| P1 | 仅 hover/focus 基础规则，缺少统一 pressed/loading/disabled | 四级操作按钮、loading、可见焦点、原生 select、Popover/Modal/Toast 统一 |
| P1 | 缺少全局键盘入口，最近任务截断无可见键盘提示 | Ctrl/Cmd+K 导航与任务检索，最近任务 tooltip、跳过导航、侧栏收起 |
| P1 | 依赖只显示文本，无复杂任务的空间导航 | 基于实际 DAG 的可选依赖图，真实缩放/复位/平移；保留可读步骤视图 |
| P1 | 页面加载时 0 容易被误认为真实值，错误没有明确只读恢复 | 按实际请求显示 Skeleton/重载；涉及资金结果不明只核实原操作，不自动重提 |
| P2 | 手机字号、控件点击面、下拉定位、表格密度需完整检查 | 1440×900、1280×800、768、390 视口与键盘验收，截图后至少一次修改 |

## 技能检索与取舍

已阅读 SKILL.md、quick-reference.md、pro-rules.md（后者按其声明只借鉴适用的 Web 原则，不把原生 pt/dp 直接当作 Web 标准）。

首次 `financial dashboard light precise --design-system --density 8` 返回深色 OLED 和营销入口，不符合用户目标，不持久化。收窄为 `banking workspace minimal --design-system --variance 2 --density 8` 得到 **Minimalism & Swiss Style**，其企业工具、高对比、低效果成本方向适用；营销 CTA、海军蓝/金色和远程字体不采用。再用 `Minimalism Swiss --domain style` 验证适用性。`keyboard focus modal --domain ux` 与 `state focus forms --stack react` 支持可见焦点、模态焦点管理和受控输入的改造。

项目复用自托管 Manrope 与中文系统黑体。正式项目规范见 `design-system/tracebank-premium/MASTER.md`，不会以目录推荐覆盖用户要求。

用户追加 [PayFlow 配色参考](https://uupm.cc/demo/payment-gateway) 后，使用实际浏览器截图和 computed style 取样（`evals/results/payment-reference.json`）。随后用户明确要求取消绿色品牌：最终将背景转为冷灰、主文调整为深海军蓝、次文为 Slate，主操作及选中改为少量实心靛紫。此最新要求取代初始附件“保留绿色”，其他安全、业务与避免大面积紫蓝渐变的约束继续遵守。网页正文抓取不可用时使用浏览器实页，不从搜索摘要猜测颜色。

## 验收范围

1. 全局 token、文字、控件状态、对比度与 reduced-motion。
2. 五页面、登录、操作员、安全规则、OTP、空/加载/失败/未知/成功。
3. 侧栏与执行面板展开/收起；命令面板、场景、键盘、自动高度输入。
4. 实际 DAG、缩放上下限、复位、快捷键与平移；无虚假进度。
5. 查询、确认、大额验证、暂停/恢复/取消/接管、对账与旧任务回答。
6. 四种视口实机截图、至少一轮视觉改进、构建/类型/业务回归、控制台与 CSP。

最终结果由本轮独立报告证明；历史绿色测试不作为新版本已通过的证据。
