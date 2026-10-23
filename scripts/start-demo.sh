#!/usr/bin/env bash
# Start TraceBank locally. Usage: scripts/start-demo.sh [port] [data-dir]
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8765}"
DATA="${2:-data}"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -q -r requirements.txt
fi
if [ ! -f apps/web-ui/index.html ] && command -v npm >/dev/null; then
  npm ci --no-audit --no-fund && npm run build:web
fi
export TRACEBANK_PLANNER="${TRACEBANK_PLANNER:-offline}"
echo "TraceBank: http://127.0.0.1:${PORT}  规划模式: ${TRACEBANK_PLANNER}  数据目录: ${DATA}"
exec .venv/bin/python -m banking_agent --host 127.0.0.1 --port "${PORT}" --data-dir "${DATA}"
