# TraceBank 内容、结构与交互验收

2026-10-22。基线 `6b16d08`，独立分支 `codex/task-workspace-clarity`。本轮按附件先审计、再比较布局、再重构组件和视觉，最终在实际 Edge 浏览器验证。没有修改 `banking_agent/`、后端测试或 API 权限含义。

## 问题与实施

| 原始问题 | 使用的规则 | 实际文件与变化 |
| --- | --- | --- |
| 重复品牌、新建按钮、角色行、状态、数量与宣传小字 | Impeccable distill / clarify | App、Workspace、components、controls、operator；删重复入口，保留一处模拟标识，动作使用业务语言 |
| 结果、工具日志、授权同级，单节点也占常驻执行列 | Impeccable layout、Frontend Design、渐进披露 | Workspace 重写为单任务正文；ExecutionDetails 新增三级详情；默认关闭图，确认表单进入正文 |
| 取消容易被误读成回滚，未知与部分成功表达不清 | Impeccable harden、UI UX Pro Max 状态规则 | taskPresentation 独立映射实际后端词汇；显示已提交回执，阻止未知/已有写入重发；不捏造缺失金额 |
| 需要确认却缺付款来源 | GOV.UK Summary List | components 镜像后端选择账户；手机号可核对，确认与独立 OTP 保留 |
| 执行图说明冗长且默认占空间 | Impeccable distill / layout、React Flow 控件职责 | PlanMap 保留真实边，按需打开；支持自然缩放、适配、平移、键盘节点查看及失败回退 |
| 浅导航层级弱、控件各自设计、卡片和死样式堆叠 | Frontend Design、UI UX Pro Max | tokens、clarity.css、styles/premium/motion.css；海军蓝导航和浅工作区，精简约24KB旧布局样式 |
| 动效与页面状态需继续一致 | 上轮 motion-design 实现、本轮真实浏览器采样 | 保留页面过渡、按钮弹簧、真实节点时间线；移除不用的旧 TraceBody，支持运行中减少动态效果 |

原始文字、所在组件、KEEP/REWRITE/HIDE/DELETE 决定与原因见 [完整内容清理表](clarity-ui-audit.md)。可复用 [中文文案规则](ui-writing-zh.md)、[两种布局及选择理由](clarity-ui-design.md)、[当前 Design System](../DESIGN.md)均已落地到源码。

## 技能与资料的真实使用范围

已读取本机 Impeccable 4.7 的 distill、clarify、layout、harden、craft-floor 等原则，应用到内容表、组件结构、状态和浏览器审查；Frontend Design 用于视觉方向，UI UX Pro Max 本地颜色检索用于对比取舍。检索中的银行海军蓝可用，金色强调与用户品牌要求不符而未采用；无关产品结果未采用。Motion 14.5 为上一轮已安装的实际动效依赖，本轮继续验证。

Web Design Guidelines、React Best Practices 未安装，没有宣称调用。使用 [WCAG 对比要求](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)、[React lazy](https://react.dev/reference/react/lazy) 和 [Error Boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)检查文字及按需图加载。Mercury Demo 只取得 JS 外壳，没有冒称观察其完整交互。

Impeccable context 首次因引擎缺失和缓存权限失败，已按 launcher fallback 直接读取项目。后续在工作区缓存尝试 layout detector，启动器出现 `The system cannot find the batch label specified - discard_staging`，随后输出空数组并退出0；该过程不能当作有效的无问题检测结果。未执行正式双 Agent critique、浏览器叠加层或无校验二进制。上述限制不影响已完成的人工内容审计、代码修改及真实浏览器验证。

## 前后截图与实际迭代

改版前、首轮和最终状态使用同一组明确标注的界面夹具，浏览器视口 1600×900，全页截图可超过900px。覆盖空任务、规划、执行、等待确认、成功、失败、取消、部分成功和未知，共9种。夹具只用于可重复视觉对比，不冒充银行实际执行记录。

| 状态 | 改版前 | 改版后 |
| --- | --- | --- |
| 空任务 | [前](../artifacts/screenshots/clarity/before/empty-1600.png) | [后](../artifacts/screenshots/clarity/after/empty-1600.png) |
| 规划 | [前](../artifacts/screenshots/clarity/before/planning-1600.png) | [后](../artifacts/screenshots/clarity/after/planning-1600.png) |
| 执行 | [前](../artifacts/screenshots/clarity/before/running-1600.png) | [后](../artifacts/screenshots/clarity/after/running-1600.png) |
| 等待确认 | [前](../artifacts/screenshots/clarity/before/waiting-1600.png) | [后](../artifacts/screenshots/clarity/after/waiting-1600.png) |
| 成功 | [前](../artifacts/screenshots/clarity/before/success-1600.png) | [后](../artifacts/screenshots/clarity/after/success-1600.png) |
| 失败 | [前](../artifacts/screenshots/clarity/before/failed-1600.png) | [后](../artifacts/screenshots/clarity/after/failed-1600.png) |
| 取消 | [前](../artifacts/screenshots/clarity/before/cancelled-1600.png) | [后](../artifacts/screenshots/clarity/after/cancelled-1600.png) |
| 部分成功 | [前](../artifacts/screenshots/clarity/before/partial-1600.png) | [后](../artifacts/screenshots/clarity/after/partial-1600.png) |
| 未知 | [前](../artifacts/screenshots/clarity/before/unknown-1600.png) | [后](../artifacts/screenshots/clarity/after/unknown-1600.png) |

实际首轮审查发现手机号展开按钮被旧 dd 样式推远、深导航继承浅色边界、手机详情关闭目标偏小；已修正为同行核对、局部导航别名及44px关闭按钮。随后删除空态装饰图标，将“授权事项已处理”改为真实的“当前没有待确认操作”，并把模型请求/用量整理为可展开字段。五路由四视口的[最终截图](../artifacts/screenshots/clarity/verification/)、[首轮截图](../artifacts/screenshots/clarity/iteration-1/)与可见文字 JSON 均保留，未只调整配色。

## 运行与测试

| 项目 | 结果与证据 |
| --- | --- |
| TypeScript / Vite 生产构建 | 通过；主 JS 449.75KB（gzip142.98），按需图5.45KB（gzip2.48），CSS82.68KB（gzip14.84）；未增加依赖 |
| 后端 | 153通过，0失败；[JUnit](../evals/results/pytest-clarity.xml)，约80秒，1条现有Starlette/HTTPX弃用提示 |
| 真实离线业务浏览器 | 16组通过；[结果](../evals/results/clarity-regression.json)。含六场景、真实余额、黄/红确认、错误OTP、幂等/取消/接管、账单/卡片/订阅/储蓄/沙箱、分析/导出/审计和响应式 |
| 状态呈现契约 | 11组通过；[结果](../evals/results/clarity-state.json)。八主要状态、未知优先、部分成功、来源账户、无伪造金额等 |
| 布局/状态/图/故障/对比度 | 7组通过；[结果](../evals/results/clarity-ui.json)。5页×4视口（1600/1280/768/390），无页面横向溢出，11组文字颜色AA，通过图模块故障注入；无金融写入 |
| 执行与回答时序 | 4组通过；[结果](../evals/results/clarity-thinking.json)。回答在规划/工具/整理之后出现，手动关闭详情保持，失败不冒称成功 |
| Motion | 8组通过；[结果](../evals/results/motion-ui-clarity-production.json)、[实际录屏](../artifacts/screenshots/motion/clarity-production/motion-demo.webm)。真实中间帧、弹簧回弹、退出页inert、真实时间线、即时减少动态效果 |
| 已有模型任务只读兼容 | 2组通过；[结果](../evals/results/clarity-compat.json)。已有回答、可见模型名/请求编号/用量、重载无重放及Bob隔离；新模型请求0、业务写入0 |

真实取消验证另有[截图](../artifacts/screenshots/clarity/regression/13-partial-committed-cancellation.png)：转账100元已提交后取消后续挂失，余额保持扣款，卡片仍正常，页面显示部分成功及完成的转账，无重新发起按钮。没有把取消写成退款。

早期测试遇到纯等待状态没有回答块、以及构建清空目录期间过早启动测试API导致根路径404。分别改为等待真实主状态、先完成构建再启动独立测试服务；没有削弱金融断言。图故障注入的预期资源错误单独记录，不计入正常运行错误。

## 完成核对与边界

- A：先完成内容表、文案/重复组件清单、后端状态映射和布局诊断。
- B：提出任务正文与任务收件箱两种不同拓扑，记录删除/合并/移动项目并选择前者。
- C：在独立分支实施组件、三级信息架构、自适应图、统一tokens和交互；原业务授权、审计及六场景保留。
- D：实际启动开发与生产页面，九状态前后截图、至少一轮视觉修正、四视口与键盘/鼠标验证完成。
- E：问题→规则→文件→前后→测试→限制均有上述证据。默认不显示空图，授权与结果在一级，全部原始日志仍可查。

仅连接合成账户，本轮没有新增真实模型调用或真实银行接入；历史模型任务只做只读兼容。浏览器为Windows Edge，未宣称全浏览器/读屏器认证。旧PPT/实录保留对应历史版本，本轮未重录。Git远端仍由用户自行发布。Impeccable启动器检测限制如上，未作为通过项。
