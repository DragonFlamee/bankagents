# 来源、依赖与权利说明

银行模拟、任务编排、前端和测试为本项目实现。开发和文档使用AI辅助；金融技能用于方法参考，未将其示例转账代码直接用作账本。

## 参考材料

金融技能参考来源包括[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills)、[PCL banking-expert](https://github.com/personamanagmentlayer/pcl/tree/79ccaa9820486121fa33aaa696ec16fa1607bf02/stdlib/professional/banking-expert)、[GAJETOso/financeskills](https://github.com/GAJETOso/financeskills)及[commit-ai/anthropics-financial-services](https://github.com/commit-ai/anthropics-financial-services)。这些技能安装在开发环境，不随源码分发。

文献来源与阅读范围见[调研报告](report.md)和[来源记录](research/sources.json)，原文权利归各作者。`problem.md`为提供的赛题原文，保留需求依据。

调研使用academic-research-suite辅助，界面参考frontend-design、ui-ux-pro-max和motion-design，文案按lieflat-less-ai-tone复核。PPT使用[siril9/presentation-skill](https://github.com/siril9/presentation-skill)中的PptxGenJS及本机工具制作；补充预览使用本机artifact-tool。项目不分发这些工具运行时。截图和图稿使用本项目界面与合成数据。

## 软件依赖

Python及Node依赖按各自许可安装，入口为`requirements.txt`、`requirements-dev.txt`和`package.json`；前端精确版本在`package-lock.json`。构建分发React、Motion、Lucide和Manrope等依赖，许可全文保存在`apps/web-ui/licenses/`，源副本在`apps/frontend/public/licenses/`，不删除或改写。

主要依赖许可包括FastAPI/Pydantic（MIT）、Starlette/Uvicorn（BSD-3-Clause）、HTTPX/Pytest（MIT）和Playwright（Apache-2.0）。该表不构成完整依赖法律审计。系统字体、浏览器及本机工具不打包进源码。

## 项目许可

作者尚未为项目指定MIT或Apache等开放许可证，具体授权由权利人决定；发布时需保留依赖许可与引用出处。
