# 技术答辩 PPT · 2026-10-29

输出：[../tracebank-technical-defense-20261029.pptx](../tracebank-technical-defense-20261029.pptx)。16 页主讲 + 3 页附录，讲稿写在每页备注里。

2026-10-29修复更新：预约实际日累计验证已补齐，201项项目测试通过。当前PPT保留用户手动修改，只删除第15页红色问题框，并更新第15/19页表格及第9/15/16页备注。其余包部件逐字节不变，见[修改清单](schedule-repair-manifest.json)。当前预览在`repair-preview/`；`render/`、`preview/`为修复前历史导出。

当前手调PPT与下面的旧模板脚本不完全一致，不要用模板重建覆盖交付文件。旧脚本默认改为输出`template-rebuild.pptx`。重放本轮局部修复时，从仓库根目录运行：

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
& "$env:USERPROFILE/.codex/skills/presentation-skill/.venv/Scripts/python.exe" demo/defense-20261029/repair-schedule-warning.py
```

脚本从本地提交`89c39bc`读取原始手调PPT，用skill的解包/清理/封包命令输出中间文件`repaired.pptx`，校验仅5个XML部件改变。该中间文件不自动覆盖交付文件。补充PNG由`render-repair.mjs`导入实际PPT生成，不能称为原生PowerPoint验收；该渲染器在完整写出19张图与manifest后返回非零退出码，此状态保留在交付回执中。

重建（仓库根目录）：

```bash
# 1. 启动全新离线实例（新目录，不复用演示数据）
TRACEBANK_PLANNER=offline .venv/Scripts/python.exe -m banking_agent --port 8766 --data-dir data/ppt-shots-XXXX
# 2. 采集实际运行截图 → shots/，裁切 → crops/
node demo/defense-20261029/capture.cjs http://127.0.0.1:8766
node demo/defense-20261029/capture2.cjs http://127.0.0.1:8766
node demo/defense-20261029/capture3.cjs http://127.0.0.1:8766
python demo/defense-20261029/crop.py           # 在本目录执行
# 3. 技术图（HTML/SVG → 3x PNG，源 HTML 在 figures/）
node demo/defense-20261029/figures.mjs
# 4. 生成旧模板的独立副本（pptxgenjs，来自 ~/.codex/skills/presentation-skill）
node demo/defense-20261029/build-deck.cjs
# 5. 可选：PowerPoint 导出逐页 PNG 检查
powershell -File demo/defense-20261029/render.ps1 <pptx绝对路径> <输出目录>
```

截图均来自离线模式全新模拟数据，非真实账户。
