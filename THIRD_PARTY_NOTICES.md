# 来源、依赖与权利说明

本项目的银行模拟、权限、编排、前端与测试在工作区编写，没有将所安装金融技能的示例转账代码直接用作账本。开发和文献写作使用AI辅助；用户负责后续参赛与发布决定，不将AI产物或引用论文冒称人工独立研究。

## 技能与文献

金融技能的上游链接、选择理由、安装记录见[SKILLS-REVIEW.md](SKILLS-REVIEW.md)。技能安装在用户环境，不随本源码包复制。调研材料仅引用或概括，原文权利归原作者；题目 `problem.md` 来自用户提供的比赛要求，随包保留需求依据。

调研写作采用本地 `academic-research-suite`；图稿遵循 `tikz-scientific-figures` 流程，图源与本项目配色配置可编辑。PPT使用本机第一方 `@oai/artifact-tool` 创建，源码包不分发该运行时。页面截图和视频来自本项目与合成数据，没有从竞品复制界面图片。

## 软件依赖

Python与Node依赖由包管理器按各自原许可安装；本包不打包第三方库或浏览器二进制。`requirements.txt`、`requirements-dev.txt` 与 `package.json` 是安装入口。主要依赖的本机元数据标示为：FastAPI/Pydantic（MIT），Starlette/Uvicorn（BSD-3-Clause），HTTPX/Pytest（MIT），Playwright（Apache-2.0）。完整安装环境以依赖锁与环境记录为准，不能据本表宣称完成全依赖法律审计。

TeX图稿需要本机XeLaTeX、TikZ、PGFPlots、Poppler等工具及其许可；使用Microsoft YaHei/Arial字体但未分发字体文件。Windows Edge和视频录制编码器由本机工具提供，不打包进源码。

## 本项目发布许可

当前用户授权本地提交并自行后续publish，没有指定对项目授予MIT/Apache等开放许可，因此本次不替作者选择开源许可证。公开前由权利人决定项目许可、核对比赛资料传播条款，并保留本文件及引用出处。未声明开放许可不影响本地运行和此次交付。
