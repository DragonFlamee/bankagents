# 技术答辩重制版 · 2026-10-27

功能代码基线`18aa38d`。使用已安装的 [siril9/presentation-skill](https://github.com/siril9/presentation-skill) v0.14.0 的结构化工作区、官方构建器与QA制作，没有修改业务代码。

交付：[17页PPT](../tracebank-technical-defense-20261027.pptx)、[配套讲稿](defense-script.md)、[逐页预览](preview.html)、[技术覆盖表](coverage-map.md)。14页主讲与3页问答附录；主讲预算8分45秒，加45秒演示共9分30秒，尚需真人计时。旧12页版保留为历史文件。

## 编辑与源文件

- `outline.json`是结构化主源；`author-outline.mjs`编写提纲、内容、备注与规划文件，不直接生成PPTX。
- `design_brief.json`、`style_contract.json`保存设计约束；`content_plan.json`、`evidence_plan.json`保存论述与证据。
- `assets/diagrams/*.svg`是七张原创技术图，图中文字和连接可编辑；`build-figures.mjs`重建SVG，`render-figures.cjs`检查画布边界并输出高清PNG。
- `data/birthday-evidence.json`是独立离线模拟计划、回执和源码校验值；采集脚本`collect-evidence.py`拒绝复用已存在的数据库目录。
- `build/qa/qa_report.json`保存最终官方静态QA及视觉回执校验；`build/supplemental-renders/`保存实际PPTX导入第一方渲染器后输出的17张预览和哈希。
- `build/visual-review-receipt.json`绑定模型视觉审查、最终PPT和17张预览。

PPT文字、六张表格和两张方法流程可直接编辑；七张技术图以高清图片嵌入，修改时编辑SVG或图稿脚本后重建。未调用imagegen生成技术证据。`agent_brief.*`仅为初始化候选建议，最终设计以上述主源与设计约束为准。

## 重建

仓库根目录安装项目Node依赖后执行：

```powershell
node demo/technical-defense/build-figures.mjs
node demo/technical-defense/render-figures.cjs
node demo/technical-defense/author-outline.mjs

$skillRoot = Join-Path $env:USERPROFILE '.codex/skills/presentation-skill'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
Push-Location $skillRoot
& "$skillRoot/.venv/Scripts/python.exe" "$skillRoot/scripts/build_workspace.py" --workspace D:/Desktop/agents/demo/technical-defense --qa --skip-render --overwrite --fail-on-planning-warnings --fail-on-whitespace-warnings --accessibility
Pop-Location
```

将workspace替换为本机绝对路径。图稿渲染默认用本机Edge，其他机器可调整其安装路径。标准PPT渲染需要LibreOffice，当前未安装，官方QA明确使用`--skip-render`。补充渲染脚本`render-proof.mjs`使用Codex现有artifact-tool导入实际PPTX；路径依赖本机Codex运行时，不是项目运行依赖。该工具完成PNG及manifest写出后返回非零退出码，回执同时记录状态与文件校验结果，不称为标准渲染成功。

## 检查范围

官方构建、规划预检、几何、留白、设计和源内容保真检查已完成；最终逐页审查及统计见 [交付QA回执](../../evals/results/presentation-20261027.json)。未做原生PowerPoint/WPS打开验收或屏幕阅读器验收。

skill核心PPT运行依赖已安装；可选数据分析包未全部下载成功，完整runtime doctor不作为通过项，这些扩展不参与本PPT构建。历史模型证据与当前离线六场景证据分开。预约实际日累计验证P1仍未修复。
