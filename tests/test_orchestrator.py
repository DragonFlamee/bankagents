"""Untrusted planner and workflow control integration checks."""
from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import sqlite3

import pytest

from banking_agent.bank import BankService, DomainError
from banking_agent.orchestrator import Orchestrator
from banking_agent.planner import Planner, PlanningError


class Proposal:
    mode='test-proposal'
    def __init__(self,nodes):self.nodes=nodes
    def propose(self,message,overview,context):return copy.deepcopy(self.nodes),'proposal',context


def node(name='one',tool='transfer',params=None,depends=None):
    return {'id':name,'tool':tool,'params':{'contact_id':'li','amount_cents':30000} if params is None else params,'depends_on':depends or []}


def service(tmp_path,raw=None):
    bank=BankService(tmp_path/'bank.sqlite3')
    return bank,Orchestrator(bank,tmp_path/'agent.sqlite3',Proposal(raw) if raw is not None else Planner(mode='offline'))


@pytest.mark.parametrize('raw',[
    [node(tool='run_shell',params={'command':'steal'})],
    [node(params={'contact_id':'li','amount_cents':30000,'approved':True})],
    [node(params={'contact_id':'li','amount_cents':True})],
    [node(params={'contact_id':'li','amount_cents':-1})],
    [node(depends=['missing'])],
    [node('one',depends=['two']),node('two',depends=['one'])],
    [node('same'),node('same')],
    [{'id':'one','tool':'transfer','params':{'contact_id':'li','amount_cents':30000},'depends_on':[],'user_id':'bob'}],
    'not-a-list',
])
def test_malformed_untrusted_proposals_never_create_business_operations(tmp_path,raw):
    bank,engine=service(tmp_path,raw)
    before=bank.summary('alice')['accounts'][0]['balance_cents']
    with pytest.raises(PlanningError):engine.chat('alice','请办理业务')
    assert bank.summary('alice')['accounts'][0]['balance_cents']==before
    with sqlite3.connect(bank.db_path) as db:
        assert db.execute('SELECT COUNT(*) FROM bank_operations').fetchone()[0]==0


def test_valid_structure_still_cannot_access_other_users_card(tmp_path):
    bank,engine=service(tmp_path,[node(tool='card.report_lost',params={'card_id':'card-bob'})])
    plan=engine.chat('alice','挂失')['plan']
    assert plan['status']=='failed'
    assert bank.summary('bob')['cards'][0]['status']=='active'


def test_dependency_creates_next_operation_only_after_confirmed_success(tmp_path):
    bank,engine=service(tmp_path,[node(),node('two','card.virtual',{},['one'])])
    plan=engine.chat('alice','先转账，成功后申请虚拟卡')['plan']
    assert plan['nodes'][0]['status']=='awaiting_confirmation'
    assert plan['nodes'][1]['status']=='pending'
    assert len(bank.summary('alice')['cards'])==1
    op=plan['nodes'][0]['operation']
    updated=engine.operation_action('alice',op['id'],'authorize')['plan']
    assert updated['nodes'][0]['status']=='succeeded'
    assert updated['nodes'][1]['status']=='awaiting_confirmation'
    assert len(bank.summary('alice')['cards'])==1
    cardop=updated['nodes'][1]['operation']
    final=engine.operation_action('alice',cardop['id'],'authorize')['plan']
    assert final['status']=='succeeded'
    assert len(bank.summary('alice')['cards'])==2
    assert bank.summary('alice')['accounts'][0]['balance_cents']==2_835_000


def test_dependency_cancellation_prevents_downstream_operation(tmp_path):
    bank,engine=service(tmp_path,[node(),node('two','card.virtual',{},['one'])])
    plan=engine.chat('alice','先转账再申请卡')['plan']
    op=plan['nodes'][0]['operation']
    updated=engine.operation_action('alice',op['id'],'cancel')['plan']
    assert updated['nodes'][1]['status']=='cancelled'
    with sqlite3.connect(bank.db_path) as db:
        assert db.execute("SELECT COUNT(*) FROM bank_operations WHERE tool='card.virtual'").fetchone()[0]==0
    assert bank.summary('alice')['accounts'][0]['balance_cents']==2_865_000


def test_paused_plan_stays_guarded_after_it_leaves_recent_plan_list(tmp_path):
    bank,engine=service(tmp_path)
    result=engine.chat('alice','给李娜转300元')
    plan=result['plan']
    op=plan['nodes'][0]['operation']
    engine.control('alice',plan['id'],'pause')
    for _ in range(32):engine.chat('alice','查询余额')
    assert all(p['id']!=plan['id'] for p in engine.list('alice'))
    with pytest.raises(DomainError) as error:engine.operation_action('alice',op['id'],'authorize')
    assert error.value.code=='plan_stopped'
    assert bank.summary('alice')['accounts'][0]['balance_cents']==2_865_000


def test_ownership_and_restart_preserve_pending_plan(tmp_path):
    bank,engine=service(tmp_path)
    response=engine.chat('alice','给李娜转300元')
    plan=response['plan']
    for operation in [lambda:engine.get('bob',plan['id']),lambda:engine.control('bob',plan['id'],'resume'),lambda:engine.chat('bob','余额',response['conversation_id'])]:
        with pytest.raises(DomainError) as error:operation()
        assert error.value.status==404
    restarted=Orchestrator(BankService(bank.db_path),tmp_path/'agent.sqlite3',Planner(mode='offline'))
    pending=restarted.get('alice',plan['id'])
    assert pending['nodes'][0]['operation']['id']==plan['nodes'][0]['operation']['id']
    done=restarted.operation_action('alice',pending['nodes'][0]['operation']['id'],'authorize')['plan']
    assert done['status']=='succeeded'
    assert bank.summary('alice')['accounts'][0]['balance_cents']==2_835_000


def test_two_independent_service_instances_enforce_same_daily_limit(tmp_path):
    bank,engine=service(tmp_path,[node(params={'contact_id':'li','amount_cents':60_000})])
    other=Orchestrator(BankService(bank.db_path),tmp_path/'agent.sqlite3',Proposal([node(params={'contact_id':'li','amount_cents':60_000})]))
    first=engine.chat('alice','转600元')['plan']['nodes'][0]['operation']['id']
    second=other.chat('alice','再转600元')['plan']['nodes'][0]['operation']['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        one=pool.submit(engine.operation_action,'alice',first,'authorize')
        two=pool.submit(other.operation_action,'alice',second,'authorize')
        results=[one.result()['operation'],two.result()['operation']]
    assert sorted(r['status'] for r in results)==['awaiting_verification','succeeded']
    assert bank.summary('alice')['daily_transfer_cents']==60_000
    assert bank.summary('alice')['accounts'][0]['balance_cents']==2_805_000


def test_expired_proof_across_china_midnight_never_changes_card(tmp_path):
    bank,engine=service(tmp_path,[node(tool='card.report_lost',params={'card_id':'card-alice'})])
    current=[datetime(2026,10,20,15,59,tzinfo=timezone.utc)] # China 23:59
    bank.clock=lambda:current[0]
    plan=engine.chat('alice','挂失卡片')['plan']
    op=plan['nodes'][0]['operation']
    challenge=engine.operation_action('alice',op['id'],'authorize')['operation']
    old_code=bank.demo_inbox('alice')['messages'][0]['code']
    current[0]+=timedelta(minutes=4)
    rotated=engine.operation_action('alice',op['id'],'authorize',True,old_code)['operation']
    assert rotated['status']=='awaiting_verification'
    assert rotated['challenge_id']!=challenge['challenge_id']
    assert bank.summary('alice')['cards'][0]['status']=='active'
    new_code=bank.demo_inbox('alice')['messages'][0]['code']
    done=engine.operation_action('alice',op['id'],'authorize',True,new_code)['operation']
    assert done['status']=='succeeded'
    assert bank.summary('alice')['cards'][0]['status']=='lost'
