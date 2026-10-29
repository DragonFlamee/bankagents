"""Actual-day authorization of scheduled transfers, with deterministic clocks."""
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import sqlite3

import pytest
from banking_agent.bank import BankService, DomainError
from banking_agent.orchestrator import Orchestrator
from banking_agent.planner import Planner


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 28, 4, tzinfo=timezone.utc)

    def __call__(self):
        return self.now

    def advance(self, **kwargs):
        self.now += timedelta(**kwargs)


@pytest.fixture
def bank(tmp_path):
    return BankService(tmp_path / 'bank.sqlite3', Clock())


def authorize(bank, op):
    result = bank.authorize('alice', op['id'], True)
    if result['status'] == 'awaiting_verification':
        code = next(m['code'] for m in bank.demo_inbox('alice')['messages'] if m['operation_id'] == op['id'])
        result = bank.authorize('alice', op['id'], True, code)
    assert result['status'] == 'succeeded'
    return result


def schedule(bank, amount=100_000, repeat='none', key='schedule'):
    op = bank.create_operation('alice', 'transfer.schedule', {
        'contact_id': 'li', 'amount_cents': amount, 'execute_date': '2026-10-29', 'repeat': repeat,
    }, key)
    return authorize(bank, op)['receipt']['schedule_id']


def manual(bank, amount=30_000, key='manual'):
    return authorize(bank, bank.create_operation('alice', 'transfer', {
        'contact_id': 'li', 'amount_cents': amount,
    }, key))


def row(bank, sid):
    return next(s for s in bank.schedules('alice')['schedules'] if s['id'] == sid)


def pending(bank, sid):
    return next(op for op in bank.summary('alice')['scheduled_operations'] if op['schedule_id'] == sid)


def test_due_transfer_rechecks_actual_day_before_debit(bank):
    sid = schedule(bank)
    bank.clock.advance(days=1)
    manual(bank)
    with sqlite3.connect(bank.db_path) as db:
        before = db.execute("SELECT balance_cents FROM bank_accounts WHERE id='acct-alice'").fetchone()[0]
    bank.run_due('alice')
    assert row(bank, sid)['status'] == 'awaiting_verification'
    assert bank.summary('alice')['accounts'][0]['balance_cents'] == before
    assert bank.summary('alice')['daily_transfer_cents'] == 30_000
    op = pending(bank, sid)
    assert op['risk'] == 'red' and op['status'] == 'awaiting_verification'
    result = authorize(bank, op)
    assert result['receipt']['amount_cents'] == 100_000
    assert row(bank, sid)['status'] == 'done'
    assert bank.summary('alice')['accounts'][0]['balance_cents'] == before - 100_000
    assert bank.summary('alice')['daily_transfer_cents'] == 130_000


@pytest.mark.parametrize('amount, prior, expected', [(100_000, 0, 'done'), (70_000, 30_000, 'done'), (70_001, 30_000, 'awaiting_verification')])
def test_threshold_is_strictly_above_1000(bank, amount, prior, expected):
    sid = schedule(bank, amount)
    bank.clock.advance(days=1)
    if prior:
        manual(bank, prior)
    bank.run_due('alice')
    assert row(bank, sid)['status'] == expected


def test_waiting_occurrence_survives_restart_without_duplicate_challenges(bank, tmp_path):
    sid = schedule(bank)
    bank.clock.advance(days=1)
    manual(bank)
    bank.run_due('alice')
    op = pending(bank, sid)
    restarted = BankService(bank.db_path, bank.clock)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: restarted.run_due('alice'), range(8)))
    assert pending(restarted, sid)['id'] == op['id']
    assert len(restarted.demo_inbox('alice')['messages']) == 1
    with sqlite3.connect(bank.db_path) as db:
        assert db.execute('SELECT COUNT(*) FROM bank_schedule_runs WHERE schedule_id=?', (sid,)).fetchone()[0] == 1
    authorize(restarted, op)
    before = restarted.summary('alice')['accounts'][0]['balance_cents']
    authorize(restarted, op)  # replay returns the original receipt
    restarted.run_due('alice')
    assert restarted.summary('alice')['accounts'][0]['balance_cents'] == before


def test_multiple_due_schedules_share_actual_day_total(bank):
    first = schedule(bank, 60_000, key='first')
    bank.clock.advance(minutes=2)
    second = schedule(bank, 60_000, key='second')
    bank.clock.advance(days=1)
    bank.run_due('alice')
    assert row(bank, first)['status'] == 'done'
    assert row(bank, second)['status'] == 'awaiting_verification'
    assert bank.summary('alice')['daily_transfer_cents'] == 60_000
    authorize(bank, pending(bank, second))
    assert bank.summary('alice')['daily_transfer_cents'] == 120_000


def test_monthly_occurrences_require_new_actual_day_verification(bank):
    sid = schedule(bank, 120_000, repeat='monthly')
    bank.clock.advance(days=1)
    bank.run_due('alice')
    first = pending(bank, sid)
    authorize(bank, first)
    assert row(bank, sid)['execute_date'] == '2026-11-29'
    assert row(bank, sid)['status'] == 'scheduled'
    bank.clock.advance(days=31)
    bank.run_due('alice')
    second = pending(bank, sid)
    assert second['id'] != first['id']
    assert second['status'] == 'awaiting_verification'
    assert bank.summary('alice')['daily_transfer_cents'] == 0
    authorize(bank, second)
    assert row(bank, sid)['execute_date'] == '2026-12-29'
    assert bank.summary('alice')['daily_transfer_cents'] == 120_000


@pytest.mark.parametrize('finish', ['cancel', 'expire', 'insufficient'])
def test_unfinished_verification_never_debits(bank, finish):
    sid = schedule(bank)
    bank.clock.advance(days=1)
    manual(bank)
    op = pending(bank, sid)
    before = bank.summary('alice')['accounts'][0]['balance_cents']
    if finish == 'cancel':
        bank.cancel_operation('alice', op['id'])
        expected = 'cancelled'
    elif finish == 'expire':
        bank.clock.advance(minutes=11)
        with pytest.raises(DomainError, match='过期'):
            bank.authorize('alice', op['id'], True)
        expected = 'failed'
    else:
        with bank._tx() as db:
            db.execute("UPDATE bank_accounts SET balance_cents=50000 WHERE user_id='alice'")
        before = 50_000
        bank.authorize('alice', op['id'], True)
        code = next(m['code'] for m in bank.demo_inbox('alice')['messages'] if m['operation_id'] == op['id'])
        result = bank.authorize('alice', op['id'], True, code)
        assert result['status'] == 'failed'
        expected = 'failed'
    bank.run_due('alice')
    assert row(bank, sid)['status'] == expected
    assert bank.summary('alice')['accounts'][0]['balance_cents'] == before


def test_unknown_reconciles_original_occurrence_without_double_count(bank):
    sid = schedule(bank, 120_000)
    bank.clock.advance(days=1)
    op = pending(bank, sid)
    bank.set_fault('alice', 'timeout_after_commit')
    code = next(m['code'] for m in bank.demo_inbox('alice')['messages'] if m['operation_id'] == op['id'])
    assert bank.authorize('alice', op['id'], True, code)['status'] == 'unknown'
    assert row(bank, sid)['status'] == 'unknown'
    before = bank.summary('alice')['accounts'][0]['balance_cents']
    assert bank.summary('alice')['daily_transfer_cents'] == 120_000
    bank.run_due('alice')
    assert bank.reconcile('alice', op['id'])['status'] == 'succeeded'
    assert row(bank, sid)['status'] == 'done'
    assert bank.summary('alice')['accounts'][0]['balance_cents'] == before
    assert bank.summary('alice')['daily_transfer_cents'] == 120_000


def test_demo_run_now_cannot_bypass_cumulative_verification(bank):
    sid = schedule(bank)
    manual(bank)
    result = bank.run_schedule_now('alice', sid)
    assert result['status'] == 'awaiting_verification'
    assert result['forced'] is True
    assert bank.summary('alice')['daily_transfer_cents'] == 30_000


def test_schedule_operation_is_authorizable_without_fabricating_a_plan(bank, tmp_path):
    sid = schedule(bank, 120_000)
    bank.clock.advance(days=1)
    op = pending(bank, sid)
    engine = Orchestrator(bank, tmp_path / 'agent.sqlite3', Planner('offline'))
    with pytest.raises(DomainError) as exc:
        engine.operation_action('bob', op['id'], 'authorize')
    assert exc.value.status == 404
    code = next(m['code'] for m in bank.demo_inbox('alice')['messages'] if m['operation_id'] == op['id'])
    result = engine.operation_action('alice', op['id'], 'authorize', True, code)
    assert result['operation']['status'] == 'succeeded' and result['plan'] is None


def test_actual_execution_day_uses_china_midnight_not_planned_day(bank):
    sid = schedule(bank, 100_000)
    bank.clock.now = datetime(2026, 10, 29, 15, 59, tzinfo=timezone.utc)
    manual(bank)
    bank.clock.advance(minutes=2)  # 00:01 in China on Oct 30, still Oct 29 UTC
    bank.run_due('alice')
    assert row(bank, sid)['status'] == 'done'
    assert bank.summary('alice')['daily_transfer_cents'] == 100_000


def test_cancel_schedule_invalidates_waiting_occurrence_proof(bank):
    sid = schedule(bank)
    bank.clock.advance(days=1)
    manual(bank)
    op = pending(bank, sid)
    code = next(m['code'] for m in bank.demo_inbox('alice')['messages'] if m['operation_id'] == op['id'])
    cancellation = bank.create_operation('alice', 'schedule.cancel', {'schedule_id': sid}, 'cancel')
    authorize(bank, cancellation)
    assert row(bank, sid)['status'] == 'cancelled'
    with pytest.raises(DomainError):
        bank.authorize('alice', op['id'], True, code)
    bank.run_due('alice')
    assert bank.summary('alice')['daily_transfer_cents'] == 30_000


def test_channel_failure_requires_fresh_proof_and_preserves_occurrence(bank):
    sid = schedule(bank, 120_000)
    bank.clock.advance(days=1)
    op = pending(bank, sid)
    old_code = next(m['code'] for m in bank.demo_inbox('alice')['messages'] if m['operation_id'] == op['id'])
    bank.set_fault('alice', 'channel_failure')
    assert bank.authorize('alice', op['id'], True, old_code)['status'] == 'awaiting_confirmation'
    assert bank.summary('alice')['daily_transfer_cents'] == 0
    bank.set_fault('alice', 'none')
    renewed = bank.authorize('alice', op['id'], True)
    assert renewed['challenge_id'] != op.get('challenge_id')
    assert renewed['status'] == 'awaiting_verification'
    assert pending(bank, sid)['id'] == op['id']
    authorize(bank, renewed)
    assert row(bank, sid)['status'] == 'done'
    assert bank.summary('alice')['daily_transfer_cents'] == 120_000


def test_existing_schedule_database_migrates_without_changing_totals(bank):
    sid = schedule(bank, 50_000)
    bank.clock.advance(days=1)
    bank.run_due('alice')
    with sqlite3.connect(bank.db_path) as db:
        db.execute('ALTER TABLE bank_schedule_runs DROP COLUMN operation_id')
    upgraded = BankService(bank.db_path, bank.clock)
    assert row(upgraded, sid)['status'] == 'done'
    assert upgraded.summary('alice')['daily_transfer_cents'] == 50_000
    manual(upgraded, 60_000)
    assert upgraded.summary('alice')['daily_transfer_cents'] == 110_000


def test_real_http_approval_flow_and_user_isolation(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from banking_agent.api import create_app
    monkeypatch.setenv('TRACEBANK_SCHEDULER', '0')
    monkeypatch.setenv('TRACEBANK_DEMO_PASSWORD', 'tracebank-demo')
    app = create_app(tmp_path, planner=Planner('offline'))
    bank = app.state.bank
    bank.clock = Clock()
    sid = schedule(bank)
    bank.clock.advance(days=1)
    manual(bank)
    with TestClient(app) as client:
        login = client.post('/api/session', json={'username': 'alice', 'password': 'tracebank-demo'})
        headers = {'X-CSRF-Token': login.json()['csrf_token']}
        overview = client.get('/api/overview').json()
        op = next(o for o in overview['scheduled_operations'] if o['schedule_id'] == sid)
        url = '/api/operations/' + op['id'] + '/authorize'
        assert client.post(url, json={'approve': True}).status_code == 403
        code = next(m['code'] for m in client.get('/api/auth/demo-inbox').json()['messages'] if m['operation_id'] == op['id'])
        client.post('/api/session', json={'username': 'bob', 'password': 'tracebank-demo'})
        other_headers = {'X-CSRF-Token': client.get('/api/session').json()['csrf_token']}
        assert not client.get('/api/overview').json()['scheduled_operations']
        assert client.post(url, json={'approve': True, 'otp': code}, headers=other_headers).status_code == 404
        client.post('/api/session', json={'username': 'alice', 'password': 'tracebank-demo'})
        headers = {'X-CSRF-Token': client.get('/api/session').json()['csrf_token']}
        result = client.post(url, json={'approve': True, 'otp': code}, headers=headers)
        assert result.status_code == 200, result.text
        assert result.json()['plan'] is None
        assert result.json()['operation']['receipt']['amount_cents'] == 100_000
        assert client.get('/api/overview').json()['daily_transfer_cents'] == 130_000
        assert client.get('/api/schedules').json()['schedules'][0]['status'] == 'done'
