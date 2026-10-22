# 连续对话与金融 Agent 工作台验收

2026-10-22。基线 `27ee36c`，分支 `codex/task-workspace-clarity`。本轮对应用户提出的连续追问、可观察工作流、场景图标/模式标记和整体对话质感四类问题。设计前的产品分析、结构与取舍见 [方案](conversation-design.md)。

## 实际变化

原界面每次发送替换当前任务，虽然携带conversation_id，但用户看不到上一轮；长回答又将输入区推出视口。本轮改成服务端持久化的多轮消息列表，消息区独立滚动、底部输入区持续可见。用户消息靠右，助手回答保持易读正文；每轮自己的状态、分段回答、授权及工具链都保留。新对话重置上下文；打开旧会话或刷新会读取已保存记录，不重新调用模型或重放业务。

新增按用户归属校验的 `GET /api/conversations/{id}`，每页40轮，可读取更早消息。规划尚未完成时也核对journal中的会话所有者，防止跨用户复用尚未落入conversations表的会话ID。离线基线增加“分析本月账单 → 那上月呢”的只读主题承接；模型仍使用原有有界model_history，并明确区分历史候选计划和当前指令。

执行过程位于回答之前：规划时显示当前阶段和轻量三条呼吸线，执行时显示实际工具与状态，耗时来自服务端时间；点击展开完整步骤、业务依据、回执、模型用量和原始记录。没有编写假思考文本，不展示私有推理；等待确认/完成/失败后不继续播放思考动画。已核验段落到达就追加，正式回答完成后替换临时输出。

场景菜单的六项使用一致的SVG线性图标。选择储蓄目标等场景后，输入区显示可清除的模式chip；发送只提交用户需求，chip不增加权限或强制工具。回答旁的场景标记取自实际计划。产品、登录、启动和助手统一使用银行柱廊与账本路径SVG，favicon同步替换，不再使用“迹”字徽章。

视觉沿用深蓝导航、白正文、冷灰辅助面及克制紫色；重排用户消息、助手署名、过程、正文与确认字段的间距。没有新增渐变、玻璃或彩色卡片。执行详情和场景菜单保留高度动画，正文始终不透明，减少动态效果立即生效。

## 浏览器审查与修正

首轮实际截图发现：旧flex规则使长消息撑高工作区，输入框仍出界；场景图标被旧span布局撑得过远。修正工作区明确视口高度与消息区滚动约束，图标固定宽度、正文弹性布局。随后将状态并入助手署名行、清除新任务中的旧成功Toast，并保留发送后的输入焦点。最后修正收起详情时的焦点恢复为同步，避免Escape后短暂丢失焦点。

首轮快照在 [iteration-1](../artifacts/screenshots/conversation/iteration-1/)，含路由和视口变化的过渡帧；最终截图在布局稳定后采集：

- [空对话](../artifacts/screenshots/conversation/final/01-empty-1600.png)
- [同窗连续消息](../artifacts/screenshots/conversation/final/02-three-turns-1600.png)
- [手机阅读历史与固定输入框](../artifacts/screenshots/conversation/final/03-thread-390.png)
- [六场景图标](../artifacts/screenshots/conversation/final/05-scenario-icons.png)
- [储蓄目标模式](../artifacts/screenshots/conversation/final/06-goal-mode.png)
- [规划状态动效](../artifacts/screenshots/conversation/final/07-planning-animation.png)
- [实际工具动作](../artifacts/screenshots/conversation/final/08-visible-tool-action.png)
- [展开完整工作流](../artifacts/screenshots/conversation/final/09-expanded-workflow.png)

## 验证

| 检查 | 结果与证据 |
| --- | --- |
| TypeScript / 生产构建 | 通过；未新增依赖。主JS约460.94KB/gzip146.46KB，图模块仍按需加载 |
| 后端完整回归 | [164通过](../evals/results/pytest-conversation.xml)，含新增6项会话/权限/分页测试；1条已有Starlette/HTTPX弃用提示 |
| 真实离线业务浏览器 | [16组通过](../evals/results/conversation-regression.json)，保留原余额、六场景、OTP、取消已提交交易、接管、审计等断言 |
| 连续对话与交互 | [7组通过](../evals/results/conversation-ui.json)：连续3轮、刷新无重放、发送后焦点、4视口输入可见、旧轮授权、新金额取消旧授权、场景模式、流式阶段和减少动态效果 |
| 动效采样 | [8组通过](../evals/results/motion-ui-conversation.json)、[录屏](../artifacts/screenshots/motion/conversation/motion-demo.webm)：页面文字不透明、按钮回弹、真实时间线和即时减少动态效果 |
| 回答时序 | [4组通过](../evals/results/conversation-thinking.json)：规划/工具不提前输出最终结果，手动收起不被轮询重新打开 |
| 五模块与状态/图 | [7组通过](../evals/results/conversation-layout.json)：五页四视口、八主要任务状态、来源账户、键盘焦点、真实图操作和加载失败回退 |
| 已有模型记录 | [2组通过](../evals/results/conversation-compat.json)：原8765历史回答、模型用量和账户隔离保留，新增模型请求0、金融写入0 |

旧轮次金融操作专项：先生成300元转账确认，再追问余额，原确认仍在原消息下；点击确认后只更新该轮并扣款一次。新建50元待确认转账后追问“改成30元”，旧操作变为已取消，仅新金额可确认。读取历史或发送其他问题不会自动同意旧操作。

## 真实模型验证

独立合成账户、qwen3.8-flash思考模式，实际执行“分析本月账单，看看哪里可以省钱”与“那上月呢？”两轮。第二轮沿用同一conversation_id，工具为bills、period为last_month；两轮刷新后仍保留。共3次模型请求（两次规划、一次结果整理），提供方返回合计2789tokens。余额前后一致、金融写入0。结果见 [真实记录](../evals/results/conversation-live.json)，[真实对话录屏](../artifacts/screenshots/conversation/live/conversation-demo.webm)，不是夹具或假打字。

## 技能、文件及边界

实际使用Frontend Design做产品/版式取舍，UI UX Pro Max做针对金融对话的本地设计系统检索与图标/可访问性检查，Motion Design保留用户驱动的过渡和状态动效。检索推荐的金色、IBM字体与GSAP示例没有直接套用，保留用户已有配色、自托管字体和Motion依赖。没有调用未安装技能。

核心文件：`Workspace.tsx`负责滚动/输入/场景，`ConversationTurn.tsx`负责每轮结果/授权/工作流，`BankMark.tsx`和favicon负责金融标记，`conversation.css`负责对话布局。App保存/恢复消息与当前对话；run_journal/orchestrator/api增加归属校验与历史读取；planner增加保守的只读省略追问。

模型上下文有界，界面历史分页40轮，不宣称无限记忆。运行中的任务可准备下一条草稿，执行结束后再发送，不并发授权资金指令。新对话重置当前上下文但不撤销已有业务；未完成操作仍可从原对话或审批中心处理。账户与数据均为模拟；只在Windows Edge验证，旧PPT和旧视频未重录。
