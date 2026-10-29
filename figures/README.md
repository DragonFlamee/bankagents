# TraceBank 技术配图

2026-10-26当前架构见[新版SVG](architecture-20261026.svg)与[当前架构说明](../docs/architecture.md)，包括共享工具契约、运行事件、理财/资金锁定/预约及已知P1。下面F1–F6保留早期版本的图稿与测评边界，不作为新增六场景的最终架构或安全验收。

编辑状态：**TikZ/TeX 主分支**。每张 `.tex` 是可编辑主源；PDF 为矢量导出，PNG 为视觉检查预览。按 `tikz-scientific-figures` 的工作流编译和检查；交付的 `preamble.tex` 为本项目最小包与配色配置，`figure-style.tex` 设置中文字体和统一样式。

| 文件主名 | 内容 | 代码依据 |
| --- | --- | --- |
| architecture | F1 系统架构与可信执行边界 | api.py、planner.py、orchestrator.py、bank.py、sandbox.py |
| authorization-flow | F2 三级权限和提交前重检 | BankService 的风险分类、授权及原子执行 |
| transfer-sequence | F3 红色转账与独立 OTP 时序 | /chat、authorize、demo-inbox 及事务账本 |
| task-dag | F4 候选任务依赖与持久化状态 | validate_nodes、Orchestrator.run/control/release_handoff |
| demo-storyboard | F5 已实现业务的演示故事板 | 前端页面和真实浏览器验收流程 |
| evaluation | F6 固定任务完成与交互动作 | evals/results/offline-20261021.json；由 build-evaluation.py 生成 |

每图提供 `.tex`、`.pdf`、`.preview.png`。F6 另附 `evaluation.csv`，数据为实际离线测评；首节点对照有意受限，不能用于宣称模型或体验优势。

在已安装 XeLaTeX、TikZ、fontspec、xeCJK 和 Poppler 的环境运行：

```powershell
python figures/build.py
python figures/build-evaluation.py
```

中文字体为 Microsoft YaHei，西文字体 Arial。每图编译两次，以 `--disable-installer` 禁止编译过程中自动安装缺包。Windows 上 MiKTeX 可能需要正常注册表访问；受限沙箱中缺权限不等于工具未安装。

工具链检查已发现 `mutool` 不在 PATH；因此不交付未验证的 SVG，也不安装新的系统包。矢量交付采用已验证的 PDF。

图中明确区分：默认离线规则基线与可选未实测模型；模拟 OTP 与真实认证；受限数值 DSL 与任意 Python；哈希链检测与不可篡改存储。DAG 的汇总框是任务状态聚合，不是未实现的额外工具。
