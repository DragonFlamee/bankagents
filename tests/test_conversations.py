"""Continuous conversations preserve user ownership and independent authorization."""
import threading
import time
import pytest
from fastapi.testclient import TestClient
from banking_agent.api import create_app
from banking_agent.bank import DomainError
from banking_agent.planner import Planner

def settled(engine, run):
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        record=engine.get_run('alice',run['id'])
        if record['status'] not in {'queued','running','cancelling'}:return record
        time.sleep(.01)
    pytest.fail('run did not settle')

@pytest.fixture
def app(tmp_path,monkeypatch):
    monkeypatch.setenv('TRACEBANK_DEMO_PASSWORD','tracebank-demo')
    return create_app(tmp_path,planner=Planner('offline'))

def test_three_turns_and_elliptical_period_context(app):
    engine=app.state.orchestrator
    first=settled(engine,engine.start_run('alice','分析本月账单'))
    cid=first['conversation_id']
    second=settled(engine,engine.start_run('alice','那上月呢',cid))
    third=settled(engine,engine.start_run('alice','查询我的卡片',cid))
    assert second['plan']['nodes'][0]['tool']=='bills'
    assert second['plan']['nodes'][0]['params']['period']=='last_month'
    page=engine.get_conversation('alice',cid)
    assert [r['id'] for r in page['runs']]==[first['id'],second['id'],third['id']]
    assert all(r['reply'] for r in page['runs']) and not page['has_more']
    from banking_agent.answers import money
    assert money(engine.bank.analysis('alice')['consumption_cents']) in page['runs'][0]['reply']

def test_clarification_is_saved_as_its_own_turn(app):
    engine=app.state.orchestrator
    first=settled(engine,engine.start_run('alice','给小王转300元'))
    second=settled(engine,engine.start_run('alice','王敏',first['conversation_id']))
    page=engine.get_conversation('alice',first['conversation_id'])
    assert page['runs'][0]['plan'] is None and page['runs'][0]['status']=='clarification'
    assert '王敏' in page['runs'][0]['reply']
    assert second['plan']['status']=='awaiting_confirmation'

def test_followup_never_authorizes_and_edit_cancels_old_transfer(app):
    engine=app.state.orchestrator
    initial=engine.bank.summary('alice')['accounts'][0]['balance_cents']
    first=settled(engine,engine.start_run('alice','给李娜转300元'))
    second=settled(engine,engine.start_run('alice','查询余额',first['conversation_id']))
    page=engine.get_conversation('alice',first['conversation_id'])
    op=page['runs'][0]['plan']['nodes'][0]['operation']
    assert op['status']=='awaiting_confirmation' and not op.get('receipt')
    assert second['plan']['status']=='succeeded'
    assert engine.bank.summary('alice')['accounts'][0]['balance_cents']==initial
    changed=settled(engine,engine.start_run('alice','改成200元',first['conversation_id']))
    assert engine.get_conversation('alice',first['conversation_id'])['runs'][0]['plan']['nodes'][0]['operation']['status']=='cancelled'
    assert changed['plan']['nodes'][0]['params']['amount_cents']==20000
    assert engine.bank.summary('alice')['accounts'][0]['balance_cents']==initial

def test_endpoint_authentication_and_owner_scope(app):
    record=settled(app.state.orchestrator,app.state.orchestrator.start_run('alice','查询余额'))
    path='/api/conversations/'+record['conversation_id']
    with TestClient(app) as client:
        assert client.get(path).status_code==401
        client.post('/api/session',json={'username':'bob','password':'tracebank-demo'})
        assert client.get(path).status_code==404
        client.post('/api/session',json={'username':'alice','password':'tracebank-demo'})
        assert client.get(path).json()['runs'][0]['id']==record['id']

def test_pagination_has_no_missing_or_duplicated_turns(app):
    engine=app.state.orchestrator;ids=[]
    for i in range(43):
        key=engine.journal.create('alice',str(i),'paged-conversation')
        engine.journal.settle(key,'clarification','test reply');ids.append(key)
    latest=engine.get_conversation('alice','paged-conversation')
    older=engine.get_conversation('alice','paged-conversation',latest['runs'][0]['id'])
    assert latest['has_more'] and not older['has_more']
    assert [r['id'] for r in older['runs']+latest['runs']]==ids
    with pytest.raises(DomainError):engine.get_conversation('bob','paged-conversation')

def test_inflight_conversation_cannot_be_hijacked(app,monkeypatch):
    engine=app.state.orchestrator;started,release=threading.Event(),threading.Event()
    original=engine.planner.propose
    def gated(*args):
        started.set();assert release.wait(5);return original(*args)
    monkeypatch.setattr(engine.planner,'propose',gated)
    try:
        run=engine.start_run('alice','查询余额');assert started.wait(2)
        with pytest.raises(DomainError):engine.start_run('bob','查询余额',run['conversation_id'])
        with pytest.raises(DomainError):engine.get_conversation('bob',run['conversation_id'])
    finally:release.set()
    settled(engine,run)
