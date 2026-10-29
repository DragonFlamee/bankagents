"""Reproduce a birthday DAG in isolated offline synthetic accounts."""
import sys,json,pathlib,hashlib
from datetime import datetime,timezone,timedelta
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from banking_agent.bank import BankService
from banking_agent.orchestrator import Orchestrator
from banking_agent.planner import Planner
from banking_agent.run_journal import clean
work=ROOT/'data'/'technical-defense-evidence-20261026'
if work.exists():raise RuntimeError('Use a fresh evidence directory; existing evidence must not be replayed')
work.mkdir(parents=True)
clock=lambda:datetime(2026,10,26,10,tzinfo=timezone(timedelta(hours=8)))
bank=BankService(work/'bank.sqlite3',clock=clock)
planner=Planner('offline');planner._today=lambda:clock().date()
engine=Orchestrator(bank,work/'agent.sqlite3',planner)
before=bank.summary('alice')
message='我爱人生日快到了，这个月帮我锁定1000元活期，生日前2天订鲜花和蛋糕'
plan=engine.chat('alice',message)['plan']
initial=json.loads(json.dumps(clean(plan)))
for tool in ['funds.hold','merchant.order','merchant.order']:
    current=next(n for n in plan['nodes'] if n['tool']==tool and n['status']=='awaiting_confirmation')
    plan=engine.operation_action('alice',current['operation']['id'],'authorize')['plan']
after=bank.summary('alice')
files=['banking_agent/planner.py','banking_agent/orchestrator.py','banking_agent/bank.py','banking_agent/tools.py','banking_agent/answers.py','banking_agent/sandbox.py','banking_agent/run_journal.py']
result={'date':'2026-10-26','code_baseline':'18aa38d','mode':'offline','model_requests':0,'message':message,
 'before':{'balance_cents':before['accounts'][0]['balance_cents'],'available_cents':before['accounts'][0]['available_cents']},
 'initial_plan':initial,'confirmed_plan':clean(plan),
 'after':{'balance_cents':after['accounts'][0]['balance_cents'],'available_cents':after['accounts'][0]['available_cents']},
 'source_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in files}}
target=pathlib.Path(__file__).resolve().parent/'data'/'birthday-evidence.json';target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'plan_status':plan['status'],'node_count':len(plan['nodes']),'tools':[n['tool'] for n in plan['nodes']],'available_change_cents':result['after']['available_cents']-result['before']['available_cents'],'model_requests':0},ensure_ascii=True))
