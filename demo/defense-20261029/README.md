# 技术答辩 PPT · 2026-10-29

输出：[../tracebank-technical-defense-20261029.pptx](../tracebank-technical-defense-20261029.pptx)。16 页主讲 + 3 页附录，讲稿写在每页备注里。

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
# 4. 生成 PPT（pptxgenjs，来自 ~/.codex/skills/presentation-skill）
node demo/defense-20261029/build-deck.cjs
# 5. 可选：PowerPoint 导出逐页 PNG 检查
powershell -File demo/defense-20261029/render.ps1 <pptx绝对路径> <输出目录>
```

截图均来自离线模式全新模拟数据，非真实账户。
