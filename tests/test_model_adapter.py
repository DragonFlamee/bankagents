"""Transport-level contract checks; these mocks are not live-model evidence."""
import json
import httpx
import pytest
from banking_agent.planner import Planner, PlanningError

OVERVIEW = {"contacts": [{"id": "li", "name": "李娜", "phone": "13900000001"}],
            "cards": [{"id": "card-alice", "last4": "1024"}]}


def install_transport(monkeypatch, body, finish="stop", status=200):
    monkeypatch.setenv("TRACEBANK_LLM_BASE_URL", "https://model.example/v1")
    monkeypatch.setenv("TRACEBANK_LLM_MODEL", "test-model")
    monkeypatch.setenv("TRACEBANK_LLM_ENABLE_THINKING", "1")
    monkeypatch.setenv("TRACEBANK_LLM_RESPONSE_FORMAT", "json_schema")
    monkeypatch.setenv("TRACEBANK_LLM_API_KEY", "fake-local-test-key")
    original = httpx.Client
    calls = []
    def respond(request):
        calls.append(json.loads(request.content))
        return httpx.Response(status, headers={"x-request-id":"mock-request-proof"}, json={"model":"test-model","id":"mock-completion","choices": [{"finish_reason": finish,
            "message": {"content": json.dumps(body), "reasoning_content": "PRIVATE_REASONING_SENTINEL"}}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 30, "total_tokens":50,
                      "completion_tokens_details": {"reasoning_tokens": 10}}})
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    return calls


def test_thinking_transport_and_context_exclude_reasoning_and_credentials(monkeypatch):
    calls = install_transport(monkeypatch, {"nodes": [], "clarification": "请提供收款人全名。"})
    planner = Planner("llm")
    nodes, reply, context = planner.propose("给他转300元", OVERVIEW, {})
    assert not nodes and "收款人全名" in reply
    assert calls[0]["enable_thinking"] is True and calls[0]["thinking_budget"] == 2048
    assert calls[0]["response_format"]["json_schema"]["strict"] is True
    assert planner.live_model_verified and planner.last_call["reasoning_tokens"] == 10
    assert planner.last_call["request_id"] == "mock-request-proof"
    assert planner.last_call["http_status"] == 200 and planner.last_call["total_tokens"] == 50
    planner.propose("李娜", OVERVIEW, context)
    assert json.loads(calls[1]["messages"][1]["content"])["context"]["model_history"][0]["request"] == "给他转300元"
    retained = json.dumps(context) + json.dumps(planner.last_call)
    assert "PRIVATE_REASONING_SENTINEL" not in retained and "fake-local-test-key" not in retained


@pytest.mark.parametrize("body,finish,status", [
    ({"nodes": [{"id":"a","tool":"balance","params":{}}],"clarification":None}, "length", 200),
    ({"nodes": [], "clarification": "补充姓名", "authorized": True}, "stop", 200),
    ({"nodes": [{"id":"a","tool":"transfer","params":{"contact_id":"li","amount_cents":True}}]}, "stop", 200),
    ({"nodes": [], "clarification": None}, "stop", 200),
    ({"nodes": [{"id":"a","tool":"balance","params":{}}],"clarification":"还缺信息"}, "stop", 200),
    ({"nodes": [], "clarification": "服务错误"}, "stop", 401),
])
def test_invalid_or_incomplete_model_results_never_become_plans(monkeypatch, body, finish, status):
    install_transport(monkeypatch, body, finish, status)
    planner = Planner("llm")
    with pytest.raises(PlanningError):
        planner.propose("转账", OVERVIEW, {})
    assert not planner.live_model_verified


def test_valid_model_write_is_only_a_proposal(monkeypatch):
    install_transport(monkeypatch, {"nodes":[{"id":"a","tool":"transfer","params":{"contact_id":"li","amount_cents":30000},"depends_on":[]}],"clarification":None})
    nodes, _, context = Planner("llm").propose("给李娜转300元", OVERVIEW, {})
    assert nodes[0]["params"]["amount_cents"] == 30000
    assert "authorized" not in json.dumps(nodes) and "otp" not in json.dumps(context)


def test_explicit_sequence_cannot_become_independent_model_writes(monkeypatch):
    install_transport(monkeypatch, {"nodes":[
        {"id":"a","tool":"bills","params":{"period":"month"},"depends_on":[]},
        {"id":"b","tool":"transfer","params":{"contact_id":"li","amount_cents":30000},"depends_on":[]},
        {"id":"c","tool":"card.report_lost","params":{"card_id":"card-alice"},"depends_on":[]},
    ],"clarification":None})
    nodes, _, _ = Planner("llm").propose("先看账单，然后转账，再挂失", OVERVIEW, {})
    assert nodes[1]["depends_on"] == ["a"] and nodes[2]["depends_on"] == ["b"]


def test_model_dependency_conflicting_with_explicit_order_is_rejected(monkeypatch):
    install_transport(monkeypatch, {"nodes":[
        {"id":"a","tool":"balance","params":{},"depends_on":["b"]},
        {"id":"b","tool":"cards","params":{},"depends_on":[]},
    ],"clarification":None})
    with pytest.raises(PlanningError):
        Planner("llm").propose("先看余额，然后查卡片", OVERVIEW, {})
