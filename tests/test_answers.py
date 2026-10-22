"""User answers must distinguish observations, advice and authorized outcomes."""
import copy
import json
import threading
import time

import httpx
import pytest

from banking_agent.answers import build_answer, answer_text, synthesize
from banking_agent.bank import BankService, DomainError
from banking_agent.orchestrator import Orchestrator
from banking_agent.planner import Planner


@pytest.fixture
def engine(tmp_path):
    return Orchestrator(BankService(tmp_path/'bank.sqlite3'),tmp_path/'agent.sqlite3',Planner('offline'))


def test_savings_answer_uses_bills_not_raw_table_and_excludes_transfers(engine):
    transfer=engine.chat('alice','给李娜转300元')['plan']['nodes'][0]['operation']
    engine.operation_action('alice',transfer['id'],'authorize')
    result=engine.chat('alice','请你帮我看看我应该在哪里省钱')
    reply=result['reply']
    assert '购物支出为 ¥2,248.40' in reply
    assert '订阅支出为 ¥55.00' in reply
    assert '剔除转账后的消费为 ¥5,963.20' in reply
    assert '其中转账 ¥300.00' in reply
    assert '不能承诺具体能省下多少' in reply
    assert '没有取消任何服务' in reply
    assert result['plan']['answer']['evidence'][0]['node_id']==result['plan']['nodes'][0]['id']
    assert all(n['tool']=='bills' for n in result['plan']['nodes'])


def test_different_intents_use_different_tools_answers_and_gates(engine):
    balance=engine.chat('alice','查询余额')
    transfer=engine.chat('alice','给李娜转300元')
    cards=engine.chat('alice','查询我的卡片')
    lost=engine.chat('alice','挂失尾号1024的卡片')
    assert '余额合计' in balance['reply'] and '正常' in cards['reply']
    assert '转账 ¥300.00尚未完成' in transfer['reply']
    assert '明确确认' in transfer['reply'] and '独立验证' in lost['reply']
    op=transfer['plan']['nodes'][0]['operation']
    done=engine.operation_action('alice',op['id'],'authorize')['plan']
    assert '已向李娜转出 ¥300.00' in answer_text(done['answer'])
    assert op['id'] not in answer_text(balance['plan']['answer'])


def test_unknown_cannot_be_described_as_success_and_reconcile_updates_answer(engine):
    engine.bank.set_fault('alice','timeout_after_commit')
    op=engine.chat('alice','给李娜转300元')['plan']['nodes'][0]['operation']
    unknown=engine.operation_action('alice',op['id'],'authorize')['plan']
    assert unknown['status']=='unknown'
    assert '暂未核实' in answer_text(unknown['answer']) and '已向李娜转出' not in answer_text(unknown['answer'])
    final=engine.operation_action('alice',op['id'],'reconcile')['plan']
    assert '已向李娜转出' in answer_text(final['answer'])


def test_paused_answer_does_not_invite_authorization(engine):
    plan=engine.chat('alice','给李娜转300元')['plan']
    paused=engine.control('alice',plan['id'],'pause')
    assert '任务已暂停' in answer_text(paused['answer'])
    assert '请到右侧' not in answer_text(paused['answer'])


def test_legacy_saved_plan_gets_answer_without_replaying_or_fabricating_events(engine):
    result=engine.chat('alice','分析本月账单')
    plan=copy.deepcopy(result['plan']);plan.pop('answer')
    engine._save('alice',plan)
    before=engine.bank.analysis('alice')['total_expense_cents']
    loaded=engine.get('alice',plan['id'])
    assert loaded['answer']['source']=='saved_results'
    assert '¥5,963.20' in answer_text(loaded['answer'])
    assert engine.bank.analysis('alice')['total_expense_cents']==before


def mock_answer(monkeypatch, selection):
    monkeypatch.setenv('TRACEBANK_LLM_BASE_URL','https://model.example/v1')
    monkeypatch.setenv('TRACEBANK_LLM_MODEL','test-model')
    monkeypatch.setenv('TRACEBANK_LLM_API_KEY','fake-response-key')
    monkeypatch.setenv('TRACEBANK_LLM_ENABLE_THINKING','1')
    original=httpx.Client;calls=[]
    def transport(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200,headers={'x-request-id':'answer-request'},json={'model':'test-model','choices':[{'finish_reason':'stop','message':{'content':json.dumps(selection),'reasoning_content':'PRIVATE-ANSWER-THOUGHT'}}],'usage':{'total_tokens':80}})
    monkeypatch.setattr(httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(transport),**kw))
    return calls


def test_model_selects_evidence_without_new_facts_or_private_reasoning(engine,monkeypatch):
    plan=engine.chat('alice','帮我省钱')['plan']
    answer,options=build_answer(plan);ids=list(options)[:2]
    calls=mock_answer(monkeypatch,{'section_ids':ids})
    result,meta=synthesize(answer,options,plan['message'])
    assert result['source']=='model_selected_evidence' and meta['request_id']=='answer-request'
    assert all(p in answer['paragraphs'] or p in [o['text'] for o in options.values()] for p in result['paragraphs'])
    assert calls[0]['enable_thinking'] is True
    assert 'PRIVATE-ANSWER-THOUGHT' not in json.dumps(result)+json.dumps(meta)
    assert 'fake-response-key' not in json.dumps(calls)


@pytest.mark.parametrize('selection',[{'section_ids':['invented-id']},{'section_ids':[]},{'section_ids':[True]},{'section_ids':[],'reply':'已转账成功'}])
def test_invalid_model_advice_cannot_add_claims(engine,monkeypatch,selection):
    plan=engine.chat('alice','帮我省钱')['plan']
    answer,options=build_answer(plan)
    mock_answer(monkeypatch,selection)
    with pytest.raises(ValueError):synthesize(answer,options,plan['message'])


def test_narration_failure_keeps_business_success_and_verified_answer(engine,monkeypatch):
    engine.planner.mode='llm'
    monkeypatch.setattr(engine.planner,'propose',lambda *a:([{'id':'b','tool':'bills','params':{'period':'month'},'depends_on':[]}],'',{}))
    monkeypatch.setattr('banking_agent.orchestrator.synthesize',lambda *a:(_ for _ in ()).throw(ValueError('bad output')))
    result=engine.chat('alice','哪里省钱')
    assert result['plan']['status']=='succeeded'
    assert result['plan']['answer']['source']=='verified_results_fallback'
    assert '购物支出为' in result['reply']


def test_stop_during_answer_keeps_completed_query_and_blocks_parallel_run(engine,monkeypatch):
    engine.planner.mode='llm'
    monkeypatch.setattr(engine.planner,'propose',lambda *a:([{'id':'b','tool':'bills','params':{'period':'month'},'depends_on':[]}],'',{}))
    started,release=threading.Event(),threading.Event()
    def gated(answer,options,question,on_section=None):
        started.set()
        assert release.wait(5)
        return answer,{'request_id':'test-answer'}
    monkeypatch.setattr('banking_agent.orchestrator.synthesize',gated)
    try:
        record=engine.start_run('alice','哪里省钱')
        assert started.wait(2)
        during=engine.get_run('alice',record['id'])
        assert during['status']=='running' and during['plan']['status']=='succeeded'
        assert any(e['type']=='response.delta' and '5,963.20' in e['data']['text'] for e in during['events'])
        assert not any(e['type']=='response.completed' for e in during['events'])
        with pytest.raises(DomainError):engine.start_run('alice','余额')
        assert engine.cancel_run('alice',record['id'])['status']=='cancelling'
    finally:
        release.set()
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        final=engine.get_run('alice',record['id'])
        if final['reply']:break
        time.sleep(.01)
    assert final['status']=='succeeded'
    assert final['plan']['answer']['source']=='verified_results_after_stop'
    assert '¥5,963.20' in final['reply']


def test_sse_sections_are_delivered_before_completion_without_reasoning(engine,monkeypatch):
    answer,options=build_answer(engine.chat('alice','帮我省钱')['plan'])
    ids=list(options)[:2]
    original=httpx.Client
    mock_answer(monkeypatch,{'section_ids':ids})
    seen=[]; requests=[]
    def packet(content=None, **extra):
        delta={'content':content} if content is not None else {'reasoning_content':'PRIVATE-STREAM-THOUGHT'}
        return ('data: '+json.dumps({'id':'stream-id','model':'test-model','choices':[{'index':0,'delta':delta,'finish_reason':None}],**extra})+'\n\n').encode()
    class Stream(httpx.SyncByteStream):
        def __iter__(self):
            yield packet()
            encoded=json.dumps(ids[0])
            yield packet('{"section_ids":['+encoded[:-1])
            assert seen==[]  # An incomplete quoted ID must never render.
            yield packet(encoded[-1:]+',')
            assert seen==[ids[0]]  # Callback happens before the provider finishes.
            yield packet(json.dumps(ids[1])+']}')
            yield packet('',choices=[{'index':0,'delta':{},'finish_reason':'stop'}],usage={'prompt_tokens':10,'completion_tokens':20,'total_tokens':30})
            yield b'data: [DONE]\n\n'
    def respond(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200,headers={'content-type':'text/event-stream','x-request-id':'stream-request'},stream=Stream())
    monkeypatch.setattr(httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
    result,meta=synthesize(answer,options,'帮我省钱',on_section=seen.append)
    assert seen==ids and requests[0]['stream'] is True
    assert meta['total_tokens']==30 and meta['request_id']=='stream-request'
    assert meta['stream_requested'] and meta['streamed']
    assert result['selected_ids']==ids
    assert 'PRIVATE-STREAM-THOUGHT' not in json.dumps(result)+json.dumps(meta)+json.dumps(seen)


@pytest.mark.parametrize('content,finish',[('{"section_ids":["invented"]}','stop'),('{"section_ids":[]}','stop'),('{"section_ids":[],"reply":"已转账"}','stop'),('{"section_ids":[]}','length')])
def test_invalid_sse_never_publishes_untrusted_text(engine,monkeypatch,content,finish):
    answer,options=build_answer(engine.chat('alice','帮我省钱')['plan'])
    original=httpx.Client;seen=[]
    mock_answer(monkeypatch,{'section_ids':[]})
    data='data: '+json.dumps({'choices':[{'delta':{'content':content},'finish_reason':finish}]})+'\n\ndata: [DONE]\n\n'
    monkeypatch.setattr(httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(lambda r:httpx.Response(200,headers={'content-type':'text/event-stream'},content=data.encode())),**kw))
    with pytest.raises(ValueError):synthesize(answer,options,'帮我省钱',on_section=seen.append)
    assert seen==[]
