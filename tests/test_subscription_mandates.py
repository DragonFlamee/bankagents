"""Signed mandates remain usable without recurring-history evidence."""
from fastapi.testclient import TestClient

from banking_agent.api import create_app
from banking_agent.planner import Planner


def test_mandate_view_requires_own_approved_query_and_reflects_changes(tmp_path, monkeypatch):
    monkeypatch.setenv("TRACEBANK_DEMO_PASSWORD", "tracebank-demo")
    app = create_app(tmp_path, Planner("offline"))
    bank = app.state.bank
    with bank._tx() as db:
        db.execute("DELETE FROM bank_transactions WHERE user_id='alice'")
    with TestClient(app) as client:
        assert client.get("/api/subscriptions/mandates").status_code == 401
        client.post("/api/session", json={"username": "alice", "password": "tracebank-demo"})
        detected = client.get("/api/subscriptions/detected").json()
        assert detected["recurring"] == []
        assert detected["detection_status"] == "insufficient_history"
        assert detected["coverage"] == {"transaction_count": 0, "charge_count": 0, "month_count": 0}
        assert client.get("/api/subscriptions/mandates").json() == {"authorized": False, "subscriptions": []}
        query = bank.create_operation("alice", "subscriptions.get", {}, "query")
        assert not client.get("/api/subscriptions/mandates").json()["authorized"]
        bank.authorize("alice", query["id"], True)
        rows = client.get("/api/subscriptions/mandates").json()["subscriptions"]
        assert len(rows) == 3
        remind = bank.create_operation("alice", "subscriptions.remind", {"subscription_id": "sub-video", "days_before": 3}, "remind")
        bank.authorize("alice", remind["id"], True)
        cancel = bank.create_operation("alice", "subscriptions.cancel", {"subscription_id": "sub-video"}, "cancel")
        # A prepared cancellation is not a completed cancellation.
        rows = client.get("/api/subscriptions/mandates").json()["subscriptions"]
        assert next(r for r in rows if r["id"] == "sub-video")["status"] == "active"
        bank.authorize("alice", cancel["id"], True)
        rows = client.get("/api/subscriptions/mandates").json()["subscriptions"]
        video = next(r for r in rows if r["id"] == "sub-video")
        assert video["status"] == "cancelled" and video["remind_days"] == 3
        assert bank.detect_subscriptions("alice")["recurring"] == []
        client.post("/api/session", json={"username": "bob", "password": "tracebank-demo"})
        assert client.get("/api/subscriptions/mandates").json() == {"authorized": False, "subscriptions": []}
        own = bank.create_operation("bob", "subscriptions.get", {}, "query")
        bank.authorize("bob", own["id"], True)
        assert all(r["id"] == "sub-bob" for r in client.get("/api/subscriptions/mandates").json()["subscriptions"])
