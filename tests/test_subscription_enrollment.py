from datetime import datetime, timezone

import pytest

from banking_agent.bank import BankService, DomainError
from banking_agent.orchestrator import Orchestrator
from banking_agent.planner import Planner


@pytest.fixture
def engine(tmp_path):
    bank = BankService(tmp_path / "bank.sqlite3", clock=lambda: datetime(2026, 1, 31, 4, tzinfo=timezone.utc))
    return Orchestrator(bank, tmp_path / "agent.sqlite3", Planner("offline"))


def test_enrollment_requires_confirmation_and_returns_real_persisted_receipt(engine):
    bank = engine.bank
    initial = bank.summary("alice")["accounts"]
    offer = bank.subscription_offers("alice")["offers"][0]
    assert offer["status"] == "not_subscribed"
    result = engine.chat("alice", "帮我订阅知行阅读月度会员")
    nodes = result["plan"]["nodes"]
    assert [n["tool"] for n in nodes] == ["subscriptions.offers", "subscriptions.subscribe"]
    assert nodes[1]["depends_on"] == [nodes[0]["id"]]
    op = nodes[1]["operation"]
    assert op["risk"] == "yellow" and op["receipt"] is None
    assert bank.subscription_offers("alice")["offers"][0]["status"] == "not_subscribed"
    done = engine.operation_action("alice", op["id"], "authorize")["plan"]
    receipt = done["nodes"][1]["operation"]["receipt"]
    assert receipt["name"] == "知行阅读" and receipt["amount_cents"] == 1500
    assert receipt["charged_cents"] == 0 and receipt["next_billing_date"] == "2026-02-28"
    assert done["status"] == "succeeded" and "已开通知行阅读模拟订阅" in "".join(done["answer"]["paragraphs"])
    assert "尚未订阅" not in "".join(done["answer"]["paragraphs"])
    assert bank.summary("alice")["accounts"] == initial
    assert bank.subscription_offers("alice")["offers"][0]["status"] == "active"
    assert next(s for s in bank.schedules("alice")["subscriptions"] if s["name"] == "知行阅读")["next_charge"] == "2026-02-28"
    assert bank.authorize("alice", op["id"], True)["receipt"]["id"] == receipt["id"]
    with pytest.raises(DomainError, match="已经订阅"):
        bank.create_operation("alice", "subscriptions.subscribe", {"offer_id": offer["id"]}, "duplicate")
    assert bank.subscription_offers("bob")["offers"][0]["status"] == "not_subscribed"


def test_reading_query_is_read_only_and_catalog_prices_cannot_be_overridden(engine):
    for prompt in ("有哪些可以订阅的服务", "知行阅读多少钱", "查看知行阅读订阅条款"):
        nodes = engine.chat("alice", prompt)["plan"]["nodes"]
        assert [n["tool"] for n in nodes] == ["subscriptions.offers"]
    bank = engine.bank
    with pytest.raises(DomainError):
        bank.create_operation("alice", "subscriptions.subscribe", {"offer_id": "unknown"}, "unknown")
    with pytest.raises(DomainError):
        bank.create_operation("alice", "subscriptions.subscribe", {"offer_id": "reading-monthly-v1", "amount_cents": 1}, "tamper")


def test_cancel_remind_reenroll_and_concurrent_pending_requests(engine):
    bank = engine.bank
    offer = bank.subscription_offers("alice")["offers"][0]
    first = bank.create_operation("alice", "subscriptions.subscribe", {"offer_id": offer["id"]}, "first")
    competing = bank.create_operation("alice", "subscriptions.subscribe", {"offer_id": offer["id"]}, "competing")
    bank.authorize("alice", first["id"], True)
    rejected = bank.authorize("alice", competing["id"], True)
    assert rejected["status"] == "failed" and rejected["receipt"] is None
    assert "已经订阅" in rejected["message"]
    remind = engine.chat("alice", "知行阅读订阅续费前3天提醒我")["plan"]["nodes"][0]["operation"]
    assert remind["params"]["subscription_id"] == offer["subscription_id"]
    engine.operation_action("alice", remind["id"], "authorize")
    cancel = engine.chat("alice", "取消知行阅读订阅")["plan"]["nodes"][0]["operation"]
    engine.operation_action("alice", cancel["id"], "authorize")
    assert bank.subscription_offers("alice")["offers"][0]["status"] == "cancelled"
    renew = bank.create_operation("alice", "subscriptions.subscribe", {"offer_id": offer["id"]}, "renew")
    bank.authorize("alice", renew["id"], True)
    with bank._tx() as db:
        assert db.execute("SELECT count(*) FROM bank_subscriptions WHERE user_id='alice' AND name='知行阅读'").fetchone()[0] == 1


def test_declining_enrollment_does_not_create_subscription(engine):
    op = engine.chat("alice", "帮我开通知行阅读订阅")["plan"]["nodes"][1]["operation"]
    engine.bank.cancel_operation("alice", op["id"])
    assert engine.bank.subscription_offers("alice")["offers"][0]["status"] == "not_subscribed"
