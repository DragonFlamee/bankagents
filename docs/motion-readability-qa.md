# 动效可读性、内联执行详情与渐进回答

2026-10-22，基线 `375856d`。本轮按用户截图和两条补充意见实施；使用本机 motion-design，已读 SKILL、patterns 与 pitfalls。应用由实际路由、业务状态和服务端事件驱动，不使用脚本播放假执行过程。

## 修正和交互

截图问题已在浏览器复现：未选中的导航项 hover 继承 Premium 的 `background: var(--surface)`（白色），但文字使用深导航的浅色，实际为 `rgb(231,237,246)` 配白底。修正 `clarity.css` 中导航、当前项、历史项和授权规则的 hover/focus/active 配对，统一深色背景与浅色字。不是通过增加光晕遮盖低对比。

页面正文在整个切换中保持 opacity=1，旧页轻移2px、退出80ms，新页6px位移回正240ms；旧页退出时 inert，快速切换只留下最终页面。导航按下缩至0.985，普通按钮0.975，小按钮0.94；释放使用 stiffness430、damping23、mass0.65的弹簧，保留反馈但降低文字缩小和回弹幅度。

时间线正文仅4px轻移，不逐条淡掉文字；节点状态小图标弹簧切换，真实完成后点亮连接线，运行环改为2秒低幅呼吸。节点ID保持稳定，轮询不反复播放入场。动效与业务授权相互独立。

按用户补充要求，“查看执行详情”现在位于回答之前，直接在同一页面展开步骤与工具记录，不再跳入右侧抽屉。收起时释放空间并恢复触发点焦点，Escape可关闭。嵌套的业务依据、回执、技术日志、模型信息和原始数据仍可查。

所有React页面中的原生details共用240ms高度过渡，保持原生summary键盘语义；快速反向点击从当前高度继续。收起期间内容inert，结束后恢复原高度和溢出样式。场景菜单、内联详情使用Motion高度过渡；其他确认/规则弹窗轻移进入和退出，正文不做透明淡入。系统减少动态效果偏好变化立即生效。

## 回答如何逐步出现

后端先把工具已经核验的事实写入持久化 `response.delta` 事件，前端收到就显示，回答阶段以180ms游标轮询追加，不把每一段重新清空或播放假打字。离线结果本来已一次性可用时直接显示，不人为延迟。

只读分析的模型建议请求使用 Chat Completions SSE：`stream=true`、`stream_options.include_usage=true`。模型仍只选择证据目录中的section ID；解析到完整且存在的ID后，服务端发送对应已核验文案，不把半截JSON、任意模型文本或私有思考内容给用户。完整结果继续经过原有字段/数量/去重/结束原因校验，失败回退到确定性事实；最终回答替换临时段落，不重复追加。转账、OTP、取消、未知结果与审计权限保持原规则。

参考提供方的[流式输出文档](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/stream)与[结构化输出说明](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)。具体模型组合以本次实际验证为准，不宣称所有提供方兼容。

## 实际浏览器与测试

| 验证 | 结果与证据 |
| --- | --- |
| 类型/生产构建 | 通过；无新增依赖，使用既有Motion14.5 |
| 后端完整回归 | [158通过](../evals/results/pytest-motion-stream.xml)，1条原有Starlette/HTTPX弃用提示 |
| 最终流式单独复核 | [17通过](../evals/results/pytest-stream-answers.xml)；完整ID早于结束回调、拒绝非法引用/额外字段/截断、私有思考隔离及停止后的真实结果 |
| 业务浏览器 | [16组通过](../evals/results/motion-stream-regression.json)；原有余额、授权、OTP、取消已提交交易、接管、六场景等断言保留 |
| 动效中间帧 | [8组通过](../evals/results/motion-ui-readability.json)、[录屏](../artifacts/screenshots/motion/readability/motion-demo.webm)；页面始终不透明、按钮回弹、实际时间线、减少动态效果 |
| 可读性与新交互 | [7组通过](../evals/results/motion-readability.json)；约3000条导航状态采样的最低文字对比8.87:1，展开/收起/反向点击、菜单卸载、回答前内联详情、逐段内容及手机布局 |
| 回答时序 | [4组通过](../evals/results/motion-stream-thinking.json)；规划/工具不提前显示最终回答，手动收起不因事件反复打开 |
| 五模块/状态/图回归 | [7组通过](../evals/results/motion-stream-layout.json)；五页四视口无页面横向溢出，八主要状态、来源账户、复杂图键盘/拖动与图加载故障回退 |
| 原演示只读兼容 | [2组通过](../evals/results/motion-stream-compat.json)；重载后的8765服务可读取历史回答与模型用量，键盘与账户隔离正常，无新增模型请求或金融写入 |

逐帧导航采样覆盖普通、hover、按压、焦点与切页；不是只测静态token。原生details在中间帧存在多个不同高度，文字始终opacity=1。关闭选项会解除挂载/交互，未增加默认自动授权。

[改前白底浅字](../artifacts/screenshots/motion/readability-before/nav-hover-1600.png) → [改后同类悬停](../artifacts/screenshots/motion/readability/nav-hover-1600.png)。其他实际截图：[展开中间帧](../artifacts/screenshots/motion/readability/help-expanding-1600.png)、[首批回答](../artifacts/screenshots/motion/readability/answer-first-part-1600.png)、[回答前执行过程](../artifacts/screenshots/motion/readability/inline-execution-1600.png)、[手机内联过程](../artifacts/screenshots/motion/readability/inline-execution-390.png)。夹具截图在标题中标注测试语境，与下面的真实模型记录区分。

## 真实模型联调

在独立的合成账户服务上执行1个只读账单任务，qwen3.8-flash思考模式，实际发生规划和结果整理两次模型请求。首批核验内容约4.613秒可见，完整回答约18.579秒；结果整理耗时13.874秒，SSE标记true，来源 `model_selected_evidence`，没有走降级。规划用量773 tokens，结果整理1433 tokens，共2206 tokens。模型返回私有思考只用于提供方用量统计，没有呈现其内容。

余额前后一致、金融写入0。原始请求编号、用量、事件时间及断言见 [真实联调结果](../evals/results/live-stream-readonly.json)，[首批核验输出](../artifacts/screenshots/motion/live-stream/first-verified-output.png)与[完整回答](../artifacts/screenshots/motion/live-stream/completed-answer.png)为真实服务截图。本次单次时延不是性能保证。

## 实施文件与边界

`motion.tsx` / `motion.css`：物理参数、保持可读的页面和时间线、通用折叠；`clarity.css`：导航状态配对；`components.tsx`：确认/规则弹窗；`Workspace.tsx` / `ExecutionDetails.tsx`：内联过程和临时回答；`App.tsx`：回答阶段增量轮询；`answers.py` / `orchestrator.py`：真实SSE、证据片段和持久化事件。

首次后端运行在受限环境中停留于TestClient第一项，无测试进展；核实独立进程后停止，开启堆栈诊断并在允许本机线程通信的环境重跑，158项通过。首次颜色采样器把RGBA第四分量带入亮度计算得到NaN，已修正为RGB三分量并重跑；未以该失败结果宣称可读性通过。

模型仍负责规划与选择建议，不执行银行写入。内容按完整核验段落增量呈现，不逐字显示未校验金融事实；提供方思考阶段可能暂时没有新建议。保留系统减少动态效果和键盘行为，未宣称全浏览器或读屏器认证。旧PPT/录像未重录。
