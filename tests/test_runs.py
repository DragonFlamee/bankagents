"""Action traces reflect real work, are private, and never grant authorization."""
import json
import threading
import time

from fastapi.testclient import TestClient
import pytest

from banking_agent.api import create_app
from banking_agent.planner import Planner
from banking_agent.orchestrator import Orchestrator


def login(client, user="alice"):
    r = client.post("/api/session", json={"username":user,"password":"tracebank-demo"})
    assert r.status_code == 200
    return {"X-CSRF-Token":r.json()["csrf_token"]}


def settled(client, run_id):
    deadline = time.monotonic()+5
    while time.monotonic() < deadline:
        r = client.get(f"/api/runs/{run_id}")
        assert r.status_code == 200
        body = r.json()
        if body["reply"] or body["status"] in {"failed","cancelled","interrupted"}:
            return body
        time.sleep(.01)
    pytest.fail("Worker did not settle")


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("TRACEBANK_DEMO_PASSWORD","tracebank-demo")
    app = create_app(tmp_path, planner=Planner(mode="offline"))
    with TestClient(app) as c:
        yield app, c, tmp_path


def test_trace_sequence_and_authorized_dependency_resume(env):
    app,c,_ = env
    h = login(c)
    initial = app.state.bank.summary("alice")["accounts"][0]["balance_cents"]
    r = c.post("/api/runs",headers=h,json={"message":"分析本月账单，然后给李娜转300元，然后挂失尾号1024的卡片"})
    assert r.status_code == 202
    body = settled(c,r.json()["id"])
    assert body["status"] == "awaiting_confirmation"
    events = body["events"]
    types = [e["type"] for e in events]
    assert types.index("request.received") < types.index("model.started") < types.index("model.completed") < types.index("plan.validated") < types.index("tool.started")
    assert "authorization.required" in types
    assert app.state.bank.summary("alice")["accounts"][0]["balance_cents"] == initial
    nodes = body["plan"]["nodes"]
    transfer = next(n for n in nodes if n["tool"] == "transfer")
    card = next(n for n in nodes if n["tool"] == "card.report_lost")
    assert card["status"] == "pending" and "operation" not in card
    confirmed = c.post(f'/api/operations/{transfer["operation"]["id"]}/authorize',headers=h,json={"approve":True})
    assert confirmed.status_code == 200
    receipt = confirmed.json()["operation"]["receipt"]
    continuation = c.get(f'/api/runs/{body["id"]}?after={events[-1]["seq"]}').json()
    assert continuation["status"] == "awaiting_confirmation"
    assert continuation["events"][0]["type"] == "operation.started"
    assert any(e["type"] == "operation.result" and e["data"]["operation"].get("receipt",{}).get("id") == receipt["id"] for e in continuation["events"])
    assert any(e["type"] == "tool.started" and e["data"]["tool"] == "card.report_lost" for e in continuation["events"])
    assert app.state.bank.summary("alice")["accounts"][0]["balance_cents"] == initial-30000
    assert c.get(f'/api/runs/{body["id"]}?after={continuation["events"][-1]["seq"]}').json()["events"] == []
    card_op = next(n["operation"] for n in continuation["plan"]["nodes"] if n["tool"] == "card.report_lost")
    assert c.post(f'/api/operations/{card_op["id"]}/authorize',headers=h,json={"approve":True}).json()["operation"]["status"] == "awaiting_verification"
    otp = next(m["code"] for m in app.state.bank.demo_inbox("alice")["messages"] if m["operation_id"] == card_op["id"])
    assert c.post(f'/api/operations/{card_op["id"]}/authorize',headers=h,json={"approve":True,"otp":otp}).status_code == 200
    finished = c.get(f'/api/runs/{body["id"]}').json()
    assert finished["status"] == "succeeded"
    def scalar_values(value):
        if isinstance(value,dict):
            for v in value.values():
                yield from scalar_values(v)
        elif isinstance(value,list):
            for v in value:
                yield from scalar_values(v)
        else:
            yield value
    assert otp not in list(scalar_values(finished["events"]))


class GatedPlanner(Planner):
    def __init__(self):
        super().__init__(mode="offline")
        self.started = threading.Event()
        self.release = threading.Event()

    def propose(self,*args):
        self.started.set()
        assert self.release.wait(5)
        return super().propose(*args)


def test_start_returns_while_planning_and_stop_prevents_tools(tmp_path,monkeypatch):
    monkeypatch.setenv("TRACEBANK_DEMO_PASSWORD","tracebank-demo")
    planner = GatedPlanner()
    app = create_app(tmp_path,planner=planner)
    with TestClient(app) as c:
        h = login(c)
        try:
            r = c.post("/api/runs",headers=h,json={"message":"给李娜转300元"})
            assert r.status_code == 202 and planner.started.wait(1)
            run_id = r.json()["id"]
            during = c.get(f"/api/runs/{run_id}").json()
            assert during["plan"] is None
            assert "model.started" in [e["type"] for e in during["events"]]
            assert c.post("/api/runs",headers=h,json={"message":"余额"}).status_code == 409
            stop = c.post(f"/api/runs/{run_id}/cancel",headers=h)
            assert stop.status_code == 200 and stop.json()["status"] == "cancelling"
        finally:
            planner.release.set()
        body = settled(c,run_id)
        assert body["status"] == "cancelled" and body["plan"] is None
        assert not any(e["type"] == "tool.started" for e in body["events"])
        assert app.state.bank.summary("alice")["accounts"][0]["balance_cents"] == 2_865_000


def test_runs_owner_csrf_and_persistence(env):
    app,c,path = env
    alice = login(c)
    assert c.post("/api/runs",json={"message":"余额"}).status_code == 403
    run_id = c.post("/api/runs",headers=alice,json={"message":"余额"}).json()["id"]
    before = settled(c,run_id)
    assert before["status"] == "succeeded"
    bob = login(c,"bob")
    assert c.get(f"/api/runs/{run_id}").status_code == 404
    assert c.post(f"/api/runs/{run_id}/cancel",headers=bob).status_code == 404
    assert not c.get("/api/runs").json()["runs"]
    with TestClient(create_app(path,planner=Planner(mode="offline"))) as reopened:
        login(reopened)
        assert reopened.get(f"/api/runs/{run_id}").json()["events"] == before["events"]


def test_model_failure_has_no_fabricated_tools(env,monkeypatch):
    app,c,_ = env
    h = login(c)
    monkeypatch.setattr(Planner,"propose",lambda *args: (_ for _ in ()).throw(ValueError("规划结构无效")))
    run_id = c.post("/api/runs",headers=h,json={"message":"余额"}).json()["id"]
    body = settled(c,run_id)
    assert body["status"] == "failed" and body["plan"] is None
    assert "model.failed" in [e["type"] for e in body["events"]]
    assert not any(e["type"].startswith("tool.") for e in body["events"])


def test_restart_marks_inflight_interrupted_without_replay(env):
    app,c,path = env
    orch = Orchestrator(app.state.bank,path/"interrupted.sqlite3",Planner(mode="offline"))
    run_id = orch.journal.create("alice","给李娜转300元","unused-conversation")
    reopened = Orchestrator(app.state.bank,path/"interrupted.sqlite3",Planner(mode="offline"))
    body = reopened.get_run("alice",run_id)
    assert body["status"] == "interrupted" and body["plan"] is None
    assert body["events"][-1]["type"] == "run.interrupted"


def test_journal_removes_credentials_recursively(env):
    from banking_agent.run_journal import RunJournal
    _,_,path = env
    journal = RunJournal(path/"redaction.sqlite3")
    run_id = journal.create("alice","余额","conversation")
    journal.emit(run_id,"model.completed",{"usage":{"request_id":"request-proof","total_tokens":550},"reasoning_content":"PRIVATE-REASONING", "nested":[{"otp":"SECRET-CODE","api_key":"SECRET-KEY","Authorization":"BEARER-SECRET","result":"kept"}]})
    rendered = json.dumps(journal.get("alice",run_id))
    for secret in ["PRIVATE-REASONING","SECRET-CODE","SECRET-KEY","BEARER-SECRET"]:
        assert secret not in rendered
    assert "request-proof" in rendered and "550" in rendered and "kept" in rendered


def test_pause_and_resume_are_recorded_without_replanning(env):
    _,c,_ = env
    h = login(c)
    run_id = c.post("/api/runs",headers=h,json={"message":"给李娜转300元"}).json()["id"]
    body = settled(c,run_id)
    plan_id = body["plan_id"]
    for action,status in [("pause","paused"),("resume","awaiting_confirmation"),("cancel","cancelled")]:
        assert c.post(f"/api/plans/{plan_id}/control",headers=h,json={"action":action}).status_code == 200
        assert c.get(f"/api/runs/{run_id}").json()["status"] == status
    events = c.get(f"/api/runs/{run_id}").json()["events"]
    assert sum(e["type"] == "model.started" for e in events) == 1
    assert [e["data"]["action"] for e in events if e["type"] == "plan.controlled"] == ["pause","resume","cancel"]
