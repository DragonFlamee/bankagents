"""Same-origin local API. Authentication is deliberately outside model tools."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time

from fastapi import FastAPI, Request, Query
from typing import Literal
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr

from .bank import BankService, DomainError
from .orchestrator import Orchestrator
from .planner import Planner, PlanningError


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Login(Payload):
    username: StrictStr = Field(min_length=1, max_length=32)
    password: StrictStr = Field(min_length=1, max_length=128)


class Chat(Payload):
    message: StrictStr = Field(min_length=1, max_length=2000)
    conversation_id: StrictStr | None = Field(default=None, max_length=80)


class Authorize(Payload):
    approve: StrictBool
    otp: StrictStr | None = Field(default=None, max_length=12)


class Control(Payload):
    action: StrictStr


class OperatorRelease(Payload):
    user_id: StrictStr
    reason: StrictStr = Field(min_length=5, max_length=300)


def create_app(data_dir=None, planner=None):
    root = Path(__file__).resolve().parent.parent
    data = Path(data_dir or os.getenv("TRACEBANK_DATA_DIR", str(root / "data")))
    data.mkdir(parents=True, exist_ok=True)
    bank = BankService(data / "bank.sqlite3")
    orchestration = Orchestrator(bank, data / "agent.sqlite3", planner=planner)
    session_path = data / "sessions.sqlite3"
    with sqlite3.connect(session_path) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT,
                csrf TEXT, expires REAL);
            CREATE TABLE IF NOT EXISTS attempts(name TEXT PRIMARY KEY, failures INTEGER, expires REAL);
        """)
        columns = {r[1] for r in db.execute("PRAGMA table_info(sessions)")}
        if "role" not in columns:
            db.execute("ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    app = FastAPI(title="TraceBank / 拾迹银行", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.bank = bank
    app.state.orchestrator = orchestration
    app.state.data_dir = data

    def session_for(request):
        token = request.cookies.get("tracebank_session", "")
        if len(token) > 128:
            return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        with sqlite3.connect(session_path) as db:
            row = db.execute("SELECT user_id,csrf,expires,role FROM sessions WHERE token_hash=?", (digest,)).fetchone()
        return row if row and row[2] > time.time() else None

    @app.exception_handler(DomainError)
    async def domain_error(request, exc):
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status)

    @app.exception_handler(PlanningError)
    async def planning_error(request, exc):
        return JSONResponse({"error": {"code": "planning_error", "message": str(exc)}}, status_code=422)

    @app.middleware("http")
    async def security(request: Request, call_next):
        if len(await request.body()) > 16384:
            return JSONResponse({"error": {"code": "body_too_large", "message": "请求内容过大。"}}, status_code=413)
        is_api = request.url.path.startswith("/api/")
        public = request.url.path in {"/api/health"} or (request.url.path == "/api/session" and request.method == "POST")
        if is_api and not public:
            session = session_for(request)
            if not session:
                return JSONResponse({"error": {"code": "unauthorized", "message": "请先登录演示账户。"}}, status_code=401)
            request.state.user_id, request.state.csrf = session[:2]
            request.state.role = session[3]
            if request.url.path.startswith("/api/admin/") and session[3] != "operator":
                return JSONResponse({"error": {"code": "operator_required", "message": "此入口仅供人工操作员。"}}, status_code=403)
            if session[3] == "operator" and not (request.url.path.startswith("/api/admin/") or request.url.path == "/api/session"):
                return JSONResponse({"error": {"code": "user_required", "message": "操作员不能冒充客户办理业务。"}}, status_code=403)
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                csrf = request.headers.get("x-csrf-token", "")
                if not hmac.compare_digest(csrf, session[1]):
                    return JSONResponse({"error": {"code": "csrf", "message": "请求令牌失效，请重新登录。"}}, status_code=403)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            expected = str(request.base_url).rstrip("/")
            if origin and origin != expected:
                return JSONResponse({"error": {"code": "cross_origin", "message": "不允许跨站业务请求。"}}, status_code=403)
        response = await call_next(request)
        response.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok", "demo": True, "planner_mode": orchestration.planner.mode,
                "live_model_verified": getattr(orchestration.planner, "live_model_verified", False), "version": "0.1.0"}

    @app.post("/api/session")
    def login(payload: Login, request: Request):
        attempt_key = payload.username + ":" + (request.client.host if request.client else "unknown")
        with sqlite3.connect(session_path, timeout=10) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT failures,expires FROM attempts WHERE name=?", (attempt_key,)).fetchone()
            failures = row[0] if row and row[1] > time.time() else 0
            if failures >= 5:
                raise DomainError("login_locked", "登录连续失败，5 分钟后可重试。", 429)
            role = "operator" if payload.username == "operator" else "user"
            expected_password = os.getenv("TRACEBANK_OPERATOR_PASSWORD", "tracebank-operator") if role == "operator" else os.getenv("TRACEBANK_DEMO_PASSWORD", "tracebank-demo")
            valid = payload.username in {"alice", "bob", "operator"} and hmac.compare_digest(payload.password, expected_password)
            if not valid:
                db.execute("INSERT OR REPLACE INTO attempts VALUES(?,?,?)", (attempt_key, failures + 1, time.time() + 300))
                db.commit()
                raise DomainError("invalid_credentials", "用户名或密码不正确。", 401)
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
            db.execute("DELETE FROM attempts WHERE name=?", (attempt_key,))
            db.execute("INSERT INTO sessions(token_hash,user_id,csrf,expires,role) VALUES(?,?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), payload.username, csrf, time.time() + 3600, role))
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
        response = JSONResponse({"user": {"id": payload.username, "name": "林知夏" if payload.username == "alice" else "陈一航"},
                                 "csrf_token": csrf, "demo": True, "role": role, "planner_mode": orchestration.planner.mode})
        response.set_cookie("tracebank_session", token, httponly=True, samesite="strict", max_age=3600,
                            secure=os.getenv("TRACEBANK_SECURE_COOKIE") == "1")
        return response

    @app.get("/api/session")
    def current(request: Request):
        user = request.state.user_id
        return {"user": {"id": user, "name": "林知夏" if user == "alice" else "陈一航"},
                "csrf_token": request.state.csrf, "demo": True, "role": request.state.role, "planner_mode": orchestration.planner.mode}

    @app.delete("/api/session")
    def logout(request: Request):
        token = request.cookies.get("tracebank_session", "")
        with sqlite3.connect(session_path) as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
        response = JSONResponse({"logged_out": True})
        response.delete_cookie("tracebank_session")
        return response

    @app.get("/api/overview")
    def overview(request: Request):
        return bank.summary(request.state.user_id)

    @app.post("/api/chat")
    def chat(payload: Chat, request: Request):
        return orchestration.chat(request.state.user_id, payload.message, payload.conversation_id)

    @app.post("/api/runs",status_code=202)
    def start_run(payload: Chat, request: Request):
        return orchestration.start_run(request.state.user_id,payload.message,payload.conversation_id)

    @app.get("/api/runs")
    def list_runs(request: Request):
        return {"runs":orchestration.journal.list(request.state.user_id)}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, request: Request, after: int=0):
        return orchestration.get_run(request.state.user_id,run_id,after)

    @app.post("/api/runs/{run_id}/cancel")
    def cancel_run(run_id: str, request: Request):
        return orchestration.cancel_run(request.state.user_id,run_id)

    @app.get("/api/plans")
    def plans(request: Request):
        return {"plans": orchestration.list(request.state.user_id)}

    @app.get("/api/plans/{plan_id}")
    def get_plan(plan_id: str, request: Request):
        return orchestration.get(request.state.user_id, plan_id)

    @app.post("/api/plans/{plan_id}/control")
    def control(plan_id: str, payload: Control, request: Request):
        return orchestration.control(request.state.user_id, plan_id, payload.action)

    @app.post("/api/operations/{operation_id}/authorize")
    def authorize(operation_id: str, payload: Authorize, request: Request):
        return orchestration.operation_action(request.state.user_id, operation_id, "authorize", payload.approve, payload.otp)

    @app.post("/api/operations/{operation_id}/cancel")
    def cancel(operation_id: str, request: Request):
        return orchestration.operation_action(request.state.user_id, operation_id, "cancel")

    @app.post("/api/operations/{operation_id}/reconcile")
    def reconcile(operation_id: str, request: Request):
        return orchestration.operation_action(request.state.user_id, operation_id, "reconcile")

    @app.get("/api/auth/demo-inbox")
    def demo_inbox(request: Request):
        return bank.demo_inbox(request.state.user_id)

    @app.get("/api/audit")
    def audit(request: Request):
        return bank.audit(request.state.user_id)

    @app.get("/api/admin/handoffs")
    def handoffs(request: Request):
        with orchestration._db() as db:
            rows = db.execute("SELECT user_id,body FROM plans ORDER BY rowid DESC").fetchall()
        return {"plans": [{"user_id": row[0], "plan": p} for row in rows if (p := json.loads(row[1]))["status"] == "handoff"]}

    @app.post("/api/admin/plans/{plan_id}/release")
    def release(plan_id: str, payload: OperatorRelease, request: Request):
        return orchestration.release_handoff(payload.user_id, plan_id, request.state.user_id, payload.reason)

    @app.get("/api/analytics")
    def analytics(request: Request, period: Literal['month', 'last_month', 'year'] = Query(default='month')):
        user = request.state.user_id
        return {"period": period, "analysis": bank.analysis(user, period),
                "transactions": bank.transactions(user, period)["transactions"]}

    web = root / "apps" / "web-ui"
    if not web.exists():
        web = root / "apps" / "web"
    if web.exists():
        app.mount("/", StaticFiles(directory=str(web), html=True), name="web")
    return app
