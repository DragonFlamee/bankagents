from fastapi.testclient import TestClient
from banking_agent.api import create_app
from banking_agent.planner import Planner


def test_operator_release_keeps_customer_authorization_required(tmp_path):
    app = create_app(tmp_path, Planner("offline"))
    with TestClient(app) as customer, TestClient(app) as staff:
        c = customer.post('/api/session', json={'username':'alice','password':'tracebank-demo'}).json()
        ch = {'X-CSRF-Token':c['csrf_token']}
        plan = customer.post('/api/chat', json={'message':'给李娜转300元'}, headers=ch).json()['plan']
        op = plan['nodes'][0]['operation']['id']
        customer.post(f"/api/plans/{plan['id']}/control", json={'action':'handoff'}, headers=ch)
        assert customer.get('/api/admin/handoffs').status_code == 403
        assert customer.post(f'/api/operations/{op}/authorize', json={'approve':True}, headers=ch).status_code == 409
        s = staff.post('/api/session', json={'username':'operator','password':'tracebank-operator'}).json()
        sh = {'X-CSRF-Token':s['csrf_token']}
        assert staff.get('/api/overview').status_code == 403
        assert staff.get('/api/admin/handoffs').json()['plans'][0]['plan']['id'] == plan['id']
        released = staff.post(f"/api/admin/plans/{plan['id']}/release", json={'user_id':'alice','reason':'已核对客户诉求，交还客户确认。'},headers=sh)
        assert released.status_code == 200
        assert released.json()['status'] == 'awaiting_confirmation'
        assert app.state.bank.summary('alice')['accounts'][0]['balance_cents'] == 2865000
        done = customer.post(f'/api/operations/{op}/authorize', json={'approve':True},headers=ch)
        assert done.json()['operation']['status'] == 'succeeded'
        audit = customer.get('/api/audit').json()
        assert audit['chain_valid']
        assert any(e['action'] == 'operator.released' for e in audit['events'])
