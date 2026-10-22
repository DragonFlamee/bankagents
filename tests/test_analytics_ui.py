"""The UI adapter exposes existing analysis, scoped to the authenticated account."""
from fastapi.testclient import TestClient
from banking_agent.api import create_app
from banking_agent.planner import Planner


def test_analytics_scope_validation_and_no_financial_mutation(tmp_path, monkeypatch):
    monkeypatch.setenv('TRACEBANK_DEMO_PASSWORD', 'tracebank-demo')
    app = create_app(tmp_path, planner=Planner(mode='offline'))
    with TestClient(app) as client:
        assert client.get('/api/analytics').status_code == 401
        auth = client.post('/api/session', json={'username': 'alice', 'password': 'tracebank-demo'}).json()
        before = app.state.bank.summary('alice')
        result = client.get('/api/analytics').json()
        assert result['analysis']['total_expense_cents'] == sum(-t['amount_cents'] for t in result['transactions'] if t['amount_cents'] < 0)
        assert all(t['id'].startswith('seed-alice-') for t in result['transactions'])
        assert client.get('/api/analytics?period=unsupported').status_code == 422
        assert client.get('/api/analytics?period=last_month').json()['transactions'] == []
        assert app.state.bank.summary('alice') == before
        client.delete('/api/session', headers={'X-CSRF-Token': auth['csrf_token']})
        client.post('/api/session', json={'username': 'bob', 'password': 'tracebank-demo'})
        assert all(t['id'].startswith('seed-bob-') for t in client.get('/api/analytics').json()['transactions'])
        client.post('/api/session', json={'username': 'operator', 'password': 'tracebank-operator'})
        assert client.get('/api/analytics').status_code == 403
