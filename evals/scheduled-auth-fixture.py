"""Offline browser fixture only: frozen date and isolated synthetic accounts."""
import os, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['TRACEBANK_SCHEDULER'] = '0'
os.environ['TRACEBANK_PLANNER'] = 'offline'
os.environ['TRACEBANK_DEMO_PASSWORD'] = 'tracebank-demo'
from banking_agent.api import create_app
from banking_agent.planner import Planner
import uvicorn

app = create_app(sys.argv[2], planner=Planner('offline'))
bank = app.state.bank
instant = datetime(2026, 10, 28, 4, tzinfo=timezone.utc)
bank.clock = lambda: instant
app.state.orchestrator.planner._today = lambda: bank._today()
op = bank.create_operation('alice', 'transfer.schedule', {
    'contact_id': 'li', 'amount_cents': 100_000, 'execute_date': '2026-10-29', 'repeat': 'none',
}, 'browser-schedule')
bank.authorize('alice', op['id'], True)
instant += timedelta(days=1)
op = bank.create_operation('alice', 'transfer', {'contact_id': 'li', 'amount_cents': 30_000}, 'browser-manual')
bank.authorize('alice', op['id'], True)
uvicorn.run(app, host='127.0.0.1', port=int(sys.argv[1]), log_level='warning')
