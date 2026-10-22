# 页面、按钮与执行时间线动效

> 初始 Motion 实现记录。后续采用三级详情和任务正文布局；最新8组动效检查及录屏见 [当前验收](clarity-ui-qa.md)，本页截图对应当时版本。

2026-10-22，基于 `914b1e9`。按用户要求使用本机 motion-design 技能，阅读 SKILL.md、patterns.md 与 pitfalls.md；保留现有金融业务、授权及最终回答时序。技能中的脚本播放器适用于展示样机，本项目是交互应用，因此动效由路由和实际 run/plan 状态驱动，不用播放脚本模拟 Agent 执行。

## 本次实现

- 页面切换：五个主页面使用 AnimatePresence，旧页 100ms 轻淡出，新页 240ms 淡入并上移 8px。快速导航只保留最终页面；旧页退出时立即 inert，不能继续触发授权。侧栏、头部和用户会话保持。
- 按钮：按下轻缩至 0.97，小图标 0.92，释放后弹簧回位；鼠标、触控和 Space/Enter 共用视觉反馈。通过事件委托覆盖 React 页面中的现有原生按钮，保留原 click/submit 处理，不用动画计时器发起业务。禁用/aria-disabled、退出页和遮罩不参与。
- 执行时间线：节点轻错峰入场，状态图标弹簧切换；完成后点亮真实连接线，处理中显示低幅环与 spinner，等待授权使用静态警示。节点 key 使用服务端 ID，轮询不会把已有节点重新播放。工具链展开与收起连贯改变高度，退出内容不可交互。
- 可访问性：保留焦点、原生键盘行为、手机布局；减少动态效果模式下关闭上述运动。偏好在浏览器打开期间改变也立即生效。

动画实现集中在 [motion.tsx](../apps/frontend/src/motion.tsx)，视觉轨道在 [motion.css](../apps/frontend/src/motion.css)，设计参数见 [MASTER](../design-system/tracebank-premium/MASTER.md)。安装精确版本 `motion@14.5.0`，没有增加第二套动画库。使用 `motion/react` 入口；原按钮 CSS 位移已移除以避免两种 transform 互相竞争。

## 实页与运动检查

实际启动 Vite 5173 和独立离线后端 8791，Edge 中分别检查开发服务器与 Python 静态构建。动画检查用明确标为“动画验收夹具”的 API 数据，单独验证真实组件的运动，不宣称这是新增真实模型或资金执行证据。

除了起止截图，使用 requestAnimationFrame 读取真实 opacity/transform：按钮确实压缩并轻微越过 1 后回位；页面存在可见中间透明度与 −4/8px 位移；完成连线确实从 0 到 1。记录本轮采样，不把单机结果当作跨设备帧率保证。

| 本轮验收 | 结果与证据 |
| --- | --- |
| TypeScript / Vite production build | 通过；构建更新至 apps/web-ui |
| 开发服务器动效 | 8 组通过，[采样 JSON](../evals/results/motion-ui-dev.json) |
| 生产静态页动效与 CSP | 8 组通过，[采样 JSON](../evals/results/motion-ui-production.json) |
| 离线实机业务回归 | 15 组通过，包含黄色确认、红色验证、错误验证码、暂停、取消、接管、图表筛选导出、768/390 布局，[结果](../evals/results/motion-regression.json) |
| 回答时序与手动折叠 | 4 组通过，使用记录响应夹具，[结果](../evals/results/motion-thinking.json) |

8 组动效检查覆盖：鼠标弹簧、键盘弹簧、可见页面过渡/快速导航/旧页 inert、稳定轮询节点与运行标记、完成连线与实际 1/2 授权状态、工具链高度过渡、手机和运行中切换减少动态效果、无资金请求及无新增 JS/CSP 错误。

已实际查看 [处理中时间线](../artifacts/screenshots/motion/production/04-running-timeline.png)、[完成与待确认](../artifacts/screenshots/motion/production/05-completed-and-waiting.png)、[手机](../artifacts/screenshots/motion/production/06-mobile.png)及过渡中间帧。连续录屏：[开发页](../artifacts/screenshots/motion/dev/motion-demo.webm)、[生产页](../artifacts/screenshots/motion/production/motion-demo.webm)。录屏是明确标识的 UI 夹具，不是银行业务录像。

## 检查后的修正

1. 当前安装版本的 useReducedMotion 实现仅保存初始值，尽管[官方说明](https://motion.dev/docs/react-use-reduced-motion)描述实时响应。实际浏览器检查暴露这一差异后，改用 useSyncExternalStore 订阅 matchMedia，并在偏好变化时清理按压动画、更新 MotionConfig。按住按钮时切换设置以及切换后再次按压均已验证。
2. 将焦点离开处理限定为当前被按住的按钮；从输入框或其他按钮转移焦点不会提前松开当前按压效果。浏览器将中性 transform 规范化为 none，验收比较实际矩阵归位，而非仅比较空字符串。
3. 首次录制缺少 Playwright 的 ffmpeg 组件，安装该测试组件后完成录屏；没有将浏览器或编码器二进制打包进仓库。

本轮没有后端代码变更，没有重新宣称历史 153 项测试已再次运行。Motion 使主 JS 从上一版约 93.7KB gzip 增至约 144.2KB gzip；本轮按实际单机浏览器验证，低性能设备及 Safari 仍需目标环境检查。独立 HTML 操作员页维持原有交互，不加载 React 动画运行时。

## 复现

```powershell
npm ci
npm run typecheck
npm run build:web
# 启动隔离离线 API，再用 TRACEBANK_DEV_API 指定给 Vite
npm run dev:web
# 另一个终端，默认检查 5173；录制时需要 npx playwright install ffmpeg
npm run test:motion
# 改查静态构建页（仅使用隔离合成账户）
$env:TRACEBANK_TEST_URL='http://127.0.0.1:8791'
$env:TRACEBANK_MOTION_ROUND='production'
npm run test:motion
```

正常演示仍访问 8765，必要时 Ctrl+F5 加载最新构建。原真实模型配置和已保存账户不重置。
