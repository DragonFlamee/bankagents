# 部署与配置

项目验证环境为Windows、Python 3.12.7和Node.js 24.12.0。运行Python服务时可直接使用仓库中的前端构建；修改前端才需要Node依赖。Linux/macOS可使用对应启动命令，POSIX沙箱分支仍需目标平台验证。

## 安装与启动

在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m banking_agent --host 127.0.0.1 --port 8765
```

Linux/macOS对应命令：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m banking_agent --host 127.0.0.1 --port 8765
```

访问 [http://127.0.0.1:8765](http://127.0.0.1:8765)。客户账户为`alice / tracebank-demo`，另有隔离测试账户`bob`。`/operator.html`使用`operator / tracebank-operator`，应在独立浏览器会话中登录。

## 配置

| 参数或环境变量 | 用途 |
| --- | --- |
| `--host`、`--port` | 默认`127.0.0.1:8765` |
| `--data-dir` | 数据目录，优先于`TRACEBANK_DATA_DIR`；未配置时为`data/` |
| `TRACEBANK_DEMO_PASSWORD` | 客户演示口令 |
| `TRACEBANK_OPERATOR_PASSWORD` | 操作员演示口令 |
| `TRACEBANK_SECURE_COOKIE=1` | HTTPS环境启用Secure cookie；本机HTTP不应设置 |
| `TRACEBANK_PLANNER` | `offline`或`llm` |
| `TRACEBANK_SCHEDULER=0` | 测试时关闭后台定时线程；读取资金日程仍会处理到期预约 |
| `TRACEBANK_LLM_BASE_URL`、`TRACEBANK_LLM_MODEL` | 兼容接口地址与模型ID |
| `TRACEBANK_LLM_API_KEY` | 仅服务端环境变量保存的凭据 |
| `TRACEBANK_LLM_ENABLE_THINKING`、`TRACEBANK_LLM_THINKING_BUDGET` | 思考开关与预算，按模型能力配置 |
| `TRACEBANK_LLM_RESPONSE_FORMAT` | `json_schema`或服务支持的结构化格式 |

代码不会自动读取`.env`，环境变量在启动时生效。外部模型地址要求HTTPS，本机地址可使用HTTP。详细配置见[模型接入](model-integration.md)。

Windows启动脚本`./scripts/start-demo.ps1`会补读当前进程中缺失的用户环境变量；加`-Background`后隐藏后台窗口。可用`-Port`和`-DataDir`指定端口与数据，脚本不结束其他占用端口的进程。

## 数据与更新

数据目录保存`bank.sqlite3`、`agent.sqlite3`、`sessions.sqlite3`及可能的WAL/SHM文件。重启保留账户、会话、计划和审计。已有数据库会自动补齐当前字段，无需删库。

需要全新演示时使用新的目录：

```powershell
.\.venv\Scripts\python.exe -m banking_agent --data-dir data/demo-new-01 --port 8765
```

不要把真实数据目录作为pytest的`--basetemp`，也不要删除原目录来模拟冲正。活动数据库备份需先停服务或使用SQLite一致性备份。`data/`和密钥文件不纳入Git。

## 前端与测试

```powershell
npm ci
npm run typecheck
npm run build:web
```

开发服务器使用`npm run dev:web`，默认代理至8765端口，可设置`TRACEBANK_DEV_API`。FastAPI始终提供`apps/web-ui`中的构建，改完源码需重新构建。

Python测试安装`requirements-dev.txt`后运行`python -m pytest tests -q`。完整依赖快照在`requirements-lock.txt`，当前验证记录见[测试说明](evaluation.md)。

## 排错

- 端口占用：停止自己的旧服务或换端口，不结束无关进程。
- 模型错误：检查模型ID、Base URL及结构化输出支持；模型失败不会回退为离线成功。
- 401/403：重新登录，并检查会话、CSRF和同源地址。
- 预约待验证：在审批中心核对本期付款并验证，创建预约时的旧验证码不能复用。
- 结果未知：查询原操作对账，不重新发起付款。

保持单worker运行。当前公开演示口令、同应用OTP和本地故障注入仅用于合成数据，未按公网银行服务验收。
