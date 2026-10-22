# 本地部署、配置与复现

适用版本：当前 TraceBank 演示源码。检查日期：2026-10-21。默认部署为本机、单进程、合成数据；不含生产银行上线或公网安全认证。

## 1. 环境与安装

需要 Python 3.12、浏览器和首次安装依赖时的软件包网络访问。仓库包含 `apps/web-ui` 的 React 静态构建，直接运行 Python 无需 npm；修改前端则在根目录 `npm ci`，执行 `npm run typecheck` 和 `npm run build:web`。前端开发服务 `npm run dev:web` 将 `/api` 代理至本地 8765；正式演示由 FastAPI 同源提供编译产物。安装在项目内虚拟环境，不修改系统 Python 的依赖。

本次在不继承系统包的独立环境安装后，123项既有测试全部通过。完整23项依赖锁见 `requirements-lock.txt`（Python3.12/Windows验证，含测试依赖），安装时可用该锁替代直接依赖文件。环境记录见 `evals/results/clean-environment.json`，测试记录为 `pytest-clean.xml`。

Windows PowerShell：

```powershell
cd D:\Desktop\agents
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m banking_agent --host 127.0.0.1 --port 8765 --data-dir data/demo-main
```

Linux/macOS：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m banking_agent --host 127.0.0.1 --port 8765 --data-dir data/demo-main
```

如果项目路径不同，先进入对应根目录。无需激活环境，显式调用其中的 Python 即可。已有环境时保留并仅安装需要的固定依赖。当前 POSIX 命令为可移植启动说明，POSIX 沙箱仍需在目标机器实测。

启动后访问 [http://127.0.0.1:8765](http://127.0.0.1:8765)，用 `alice / tracebank-demo` 登录。另有 `bob` 用于验证用户归属隔离。停机使用终端 `Ctrl+C`，不要在关闭前随意移动正在使用的 SQLite 文件。

## 2. 配置项

| 配置 | 默认值/格式 | 生效方式 |
| --- | --- | --- |
| `--host` | `127.0.0.1` | CLI 参数；默认仅本机 |
| `--port` | `8765` | CLI 参数 |
| `--data-dir` | 未传时用 `TRACEBANK_DATA_DIR` 或项目 `data/` | CLI 优先，创建或复用目录 |
| `TRACEBANK_DEMO_PASSWORD` | `tracebank-demo` | 设置在启动进程环境中，用于演示登录 |
| `TRACEBANK_OPERATOR_PASSWORD` | `tracebank-operator` | 演示操作员口令，与客户口令分离；默认值不能用于真实部署 |
| `TRACEBANK_SECURE_COOKIE` | 只有值 `1` 时启用 Secure | 仅在 HTTPS 条件下启用；本机 HTTP 启用会影响会话 cookie |
| `TRACEBANK_PLANNER` | `offline` 或 `llm` | 启动时构造规划器 |
| `TRACEBANK_LLM_BASE_URL` | 外部 HTTPS Base URL；本机可 HTTP | 代码追加 `/chat/completions` |
| `TRACEBANK_LLM_MODEL` | 提供方支持的确切模型 ID | 模型请求必需 |
| `TRACEBANK_LLM_API_KEY` | 由安全环境注入，按服务要求提供 | 仅服务端读取，不发给前端 |

当前代码不自动读取 `.env`。设置环境后重新启动；服务运行期间只改配置文件不会自动切换规划模式。不要将 API key 放在 URL、前端变量、命令行参数、截图、测试输出或仓库中。

## 3. 离线与模型模式

默认离线基线不调用模型服务，可演示三个核心业务场景及安全控制。它只能理解已覆盖的表达，范围外会说明或要求澄清；不能视为开放语言理解效果已验证。

模型模式示例，必须把占位符替换为真实且获授权的模型服务：

```powershell
$env:TRACEBANK_PLANNER = 'llm'
$env:TRACEBANK_LLM_BASE_URL = 'https://your-provider.example/v1'
$env:TRACEBANK_LLM_MODEL = 'your-supported-model-id'
# 需要时通过安全的环境管理方式注入 TRACEBANK_LLM_API_KEY。
.\.venv\Scripts\python.exe -m banking_agent --data-dir data/model-trial --port 8765
```

请求地址为 `${TRACEBANK_LLM_BASE_URL}/chat/completions`。若服务文档要求 `/v1`，在 Base URL 中保留；若 Base URL 已是完整 `/chat/completions` 地址，追加后会错误。接口需要兼容当前 JSON object 响应请求，代码不会自动适配所有供应商。

传给模型的是用户请求、合成联系人、模拟卡片和有限意图上下文，不发送OTP面板与账户余额。调用错误返回规划失败，不静默回退。已对qwen3.8-flash思考模式完成15例固定联调；健康检查标志只代表本进程收到过合法模型响应，重启重置。详细配置及证据见[模型接入](model-integration.md)。

Windows用户通过系统界面配置环境变量后，可使用 `./scripts/start-demo.ps1` 或加 `-Background`，脚本会补读当前进程缺失的用户变量。qwen3.8-flash本次使用 `TRACEBANK_LLM_ENABLE_THINKING=1`、默认2048思考预算及 `TRACEBANK_LLM_RESPONSE_FORMAT=json_schema`；其他服务需按其能力选择输出格式。不要把用户具体工作空间或密钥提交进源码。

## 4. 数据生命周期

数据目录包含 `bank.sqlite3`、`agent.sqlite3` 和 `sessions.sqlite3`，可能同时存在 SQLite 的 `-wal/-shm` 文件。重启复用原目录时保留演示状态；不要把“重启服务”当成“撤销已提交交易”。

全新演示使用新目录：

```powershell
.\.venv\Scripts\python.exe -m banking_agent --data-dir data/demo-new-01 --port 8765
```

每次使用未存在的名称以获得新播种数据。保留原目录供核验，不执行递归删除作为默认重置方式。备份时先停止服务或使用 SQLite 一致性备份机制，不能只复制一个活动主数据库文件后假定 WAL 数据完整。数据目录已被 `.gitignore` 排除。

分析 worker 的临时目录在项目 `data/sandbox/`，由执行器创建和回收；该位置与 `--data-dir` 无关。它不包含真实业务密钥，输入仅为有限数值列表。

## 5. 验证步骤

1. 检查 `/api/health` 返回 `status=ok`、当前 planner mode 和 `demo=true`。这只证明健康接口返回，不证明业务或模型正确。
2. 登录并查询余额和本月账单；对照确定性数据与交易来源。
3. 完成一笔黄色转账，确认前余额不变，确认后回执与余额一致。
4. 发起大额转账或挂失，确认后在独立验证面板输入模拟验证码；错误验证码不得改变业务状态。
5. 暂停、恢复、取消或接管待办任务，核对服务端状态；unknown 操作先对账。
6. 执行受限沙箱分析并检查隔离回执；运行自动化测试和浏览器测试，保存该次真实结果。

测试使用全新 basetemp：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$testRun = 'data/test-run-' + [guid]::NewGuid().ToString('N')
.\.venv\Scripts\python.exe -m pytest tests -q --basetemp=$testRun
```

Linux/macOS 可用 `--basetemp="data/test-run-$(date +%Y%m%d%H%M%S)-$$"`。不要将演示数据目录作为 pytest basetemp；Pytest 会自行管理测试临时树。

浏览器截图、录屏和真实模型联调属于独立证据。当前测试数量和通过情况以本次运行输出为准，不将历史通过数字作为新版本已验证的结论。[FastAPI 测试文档](https://fastapi.tiangolo.com/tutorial/testing/)说明 TestClient/pytest 的用法，不能代替业务最终状态断言。

## 6. 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| `No module named fastapi/uvicorn` | 使用 `.venv` 内 Python 安装并运行，不混用全局解释器 |
| 端口占用 | 停止本任务已有服务，或改用 `--port 8766` 并访问对应地址；不要终止身份不明的进程 |
| 测试临时目录权限错误 | 使用工作区内唯一 `--basetemp`，不要覆盖原测试或演示数据 |
| 登录后立即 401 | 检查访问主机名是否一致、Cookie 是否被拒、HTTP 下是否误开 Secure；切换数据目录后重新登录 |
| 403 CSRF/Origin | 页面与 API 必须同源；不要改为放开 CORS 来绕过问题，重新登录刷新会话令牌 |
| OTP 不显示/不通过 | 先通过红色操作确认生成挑战；从独立面板读取与该 operation 对应且未过期的演示码 |
| 连续错误后锁定 | 等待设计的锁定期限；换会话不能绕过用户安全锁 |
| 操作结果未知 | 查询原 operation 对账，不复制指令重新扣款 |
| 模型地址错误或 JSON 不兼容 | 检查 Base URL、模型名、凭据和提供方 JSON 支持；错误不代表已有业务成功 |
| Windows 沙箱资源设置失败 | 保留失败回执，检查 Job Object 支持与宿主策略；代码故意拒绝无约束运行，不应改成忽略异常 |

## 7. 发布边界

只部署一个 Uvicorn worker，保持 localhost 默认监听。当前多数据库计划状态没有跨进程任务租约；银行事务的并发保护不等于整个编排支持任意多 worker。

如后续需要外部访问，必须完成 HTTPS、独立认证、非默认口令、可信入口和 Host、请求大小/速率限制、运维审计与目标环境复测；这属于新增部署验证，不是当前本地原型已经获得的安全结论。

人工接管工作台位于 `/operator.html`，演示登录为 `operator / tracebank-operator`。使用另一个浏览器配置或独立无痕窗口登录，避免替换客户的同名会话 cookie。操作员读取 `GET /api/admin/handoffs`，填写处理说明后调用释放端点；客户端恢复处理时仍需原有确认/验证。已包含角色隔离与授权保留 HTTP 测试，最终浏览器操作需再验收。

真实资金预留、调度、AA、外部订单与已提交资金冲正目前不在可用能力中。
